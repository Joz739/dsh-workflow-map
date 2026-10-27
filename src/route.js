/**
 * dsh-workflow-map — host HTTP view route + the steer channel.
 *
 * WHY AN HTTP ROUTE WHEN THE VIEW ALREADY REACHES THE PAGE. The projection's `wire` block is
 * pushed through the session stream, so the browser already holds this view. The route is not a
 * second delivery path for the panel; it exists for the things a stream cannot do:
 * * a POLLABLE, revisioned read (`rev`), for a leaf widget that must be able to re-read its
 * state without subscribing to the whole session, and
 * * an OUT-OF-BROWSER probe: `Invoke-WebRequest .../dsh-workflow/state?sessionId=…` is the
 * only acceptance check that does not need the Web UI open.
 *
 * THREE ENDPOINTS, ONE PREFIX. `/state` is the read (GET/HEAD, ETag-conditional). `/steer` is one
 * write (POST): the panel's hot-inject button. `/unsteer` is the OTHER write (POST): the panel's
 * "Revoke" button, which takes back a `user/message` that is still queued in the addressed session's
 * inbox. Both writes touch exactly one thing — one message in, or one message out — and neither
 * ever cancels a turn. The rationale for each (why `steer` and not `followup`/`inject`/`cancel`;
 * why a revoke is `inbox.remove` and not a second steer) sits on `handleSteerRequest` and
 * `handleUnsteerRequest` below.
 *
 * ONE SHAPE, ONE MERGE. `composeView(view, plan)` is the single join point between the folded
 * view and the PAE plan section: ../lib/index.js calls it on the wire path (`wire.view`), and
 * the HTTP source in the same file calls it again for this route. A field added to the plan
 * merge therefore cannot appear on one surface and not the other. It is written to be
 * IDEMPOTENT — composing an already-composed view with its own `plan` section returns an equal
 * view — because that is exactly what the route does.
 *
 * ETAG. FNV-1a over the response body plus the body's byte length. The body IS the panel's
 * state, so any change to it changes the tag, and an unchanged poll costs one 304 with no body.
 * FNV-1a rather than sha1 because this is a cache validator, not a security boundary: paying a
 * crypto hash of the whole view on every poll would be the wrong trade.
 *
 * FAILURE ISOLATION. The host answers a thrown route exception itself, but with a non-JSON body,
 * so every path below is wrapped and every outcome — including "the view source blew up" — is
 * converted into `{ok:false,error}` before the host sees it. Nothing here may throw into HTTP.
 * WHERE THE WRITES ARE. `/state` reads only what its `snapshot` dependency returns; `/steer`
 * calls only its `steer` dependency. No clock, no filesystem, no environment of its own: reading
 * `.pae` remains 's single reader, reached through the view dependency.
 */
import { applyPlanToView } from "./orchestrator.mjs";

/** The one path this plugin claims on the host's shared web server. */
export const ROUTE_PREFIX = "/dsh-workflow";
export const STATE_ENDPOINT = "/state";
export const STATE_PATH = `${ROUTE_PREFIX}${STATE_ENDPOINT}`;
export const STEER_ENDPOINT = "/steer";
export const STEER_PATH = `${ROUTE_PREFIX}${STEER_ENDPOINT}`;
export const UNSTEER_ENDPOINT = "/unsteer";
export const UNSTEER_PATH = `${ROUTE_PREFIX}${UNSTEER_ENDPOINT}`;
/** Version of the HTTP surface (body + status vocabulary). Bump when the contract changes. */
export const ROUTE_VERSION = 1;

/** Query parameter carrying the session id. */
export const SESSION_PARAM = "sessionId";

const JSON_TYPE = "application/json; charset=utf-8";
const ALLOW = "GET, HEAD, POST, OPTIONS";
const MAX_ERROR_TEXT = 300;

const isObject = (value) => value !== null && typeof value === "object";
const isRecord = (value) => isObject(value) && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

/** How much text one steer request may carry. The step's own bound: 2000 characters.
 * Beyond it the host answers 413 rather than silently truncating — a half-injected prompt
 * would be worse than a refused one, and this is the only write path the plugin owns. */
export const STEER_TEXT_LIMIT = 2000;

/** How many bytes a steer request BODY may be. 64 KiB is far above 2000 characters in any
 * encoding, so the real limit is STEER_TEXT_LIMIT; this one exists so a hostile or broken
 * client cannot make the host buffer an unbounded body. */
const STEER_BODY_LIMIT = 64 * 1024;
// ---------------------------------------------------------------------------
// the shared shape: view ⊕ plan
// ---------------------------------------------------------------------------

/**
 * Merge the PAE plan into a wire view — the one place both surfaces go through.
 *
 * `lib/index.js` passes the plan it just read from `<cwd>/.pae/<sessionId>/orchestrator.json`;
 * the HTTP path passes the plan section the projection already merged (the view it reads from
 * the snapshot has one). Both resolve to the same call, and the second one is a no-op by
 * construction: `applyPlanToView` only patches fields that differ, so re-applying an already
 * merged plan leaves an equal view. That property is asserted in tools/probe-route.mjs rather
 * than assumed, because it is what makes "same shape on both surfaces" true at runtime.
 *
 * @param {unknown} view - a wire view (possibly without a plan section).
 * @param {unknown} [plan] - a normalized plan section, or null/undefined for "none".
 * @returns {object} the composed view; the inputs are never mutated.
 */
export function composeView(view, plan) {
  if (!isRecord(view)) return view;
  const supplied = isRecord(plan) ? plan : null;
 // Fall back to the section the view already carries, so the two call sites share one entry
 // point instead of one of them having to know how the other stored it.
  const section = supplied ?? (isRecord(view.plan) ? view.plan : null);
  return applyPlanToView(view, section);
}

// ---------------------------------------------------------------------------
// cache validator
// ---------------------------------------------------------------------------

/**
 * FNV-1a (32-bit) over bytes.
 *
 * `Math.imul` keeps the multiply in 32-bit space: the plain `hash * prime` form loses precision
 * above 2^53 and would make the tag depend on the platform's float rounding.
 *
 * @param {Uint8Array} bytes
 * @returns {number} unsigned 32-bit hash
 */
export function fnv1a32(bytes) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A validator for one response body. The byte length rides along so two different bodies with
 * the same 32-bit hash (rare, but that is what a hash is) still get different tags.
 *
 * @param {Uint8Array} bytes
 * @returns {string} a quoted, strong ETag
 */
export function etagFor(bytes) {
  return `"wfm${ROUTE_VERSION}-${fnv1a32(bytes).toString(16).padStart(8, "0")}-${bytes.length}"`;
}

/**
 * Weak comparison of an `If-None-Match` header against one tag (RFC 9110 §13.1.2 — `If-None-Match`
 * uses the weak comparison function, so `W/"x"` matches `"x"`, and `*` matches any current
 * representation).
 *
 * @param {unknown} header - `req.headers["if-none-match"]` (string here; arrays are tolerated).
 * @param {string} etag
 * @returns {boolean}
 */
export function etagMatches(header, etag) {
  if (typeof etag !== "string" || etag === "") return false;
  const values = Array.isArray(header) ? header : typeof header === "string" ? header.split(",") : [];
  for (const value of values) {
    const candidate = String(value).trim();
    if (candidate === "") continue;
    if (candidate === "*") return true;
    if (candidate === etag) return true;
    if (candidate.startsWith("W/") && candidate.slice(2).trim() === etag) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// response helpers
// ---------------------------------------------------------------------------

function sendJson(res, status, payload, extraHeaders, headOnly) {
  const bytes = Buffer.from(JSON.stringify(payload));
  const headers = {
    "content-type": JSON_TYPE,
    "cache-control": "no-store",
    "content-length": bytes.length,
    ...(isRecord(extraHeaders) ? extraHeaders : {}),
  };
  res.writeHead(status, headers);
  res.end(headOnly === true ? undefined : bytes);
}

function sendEmpty(res, status, extraHeaders) {
  res.writeHead(status, { "cache-control": "no-store", ...(isRecord(extraHeaders) ? extraHeaders : {}) });
  res.end();
}

/** `req.url` → a parsed URL, or null when the target is missing/unparseable. */
function readUrl(req) {
  const raw = typeof req.url === "string" ? req.url : "";
  if (raw === "") return null;
  try {
    return new URL(raw, "http://localhost");
  } catch {
    return null;
  }
}

/** The part of the pathname this route owns: "" for the bare prefix, "/state" for the endpoint. */
function endpointOf(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith(ROUTE_PREFIX)) return null;
  let rest = pathname.slice(ROUTE_PREFIX.length);
 // `/dsh-workflow/state/` is the same resource as `/dsh-workflow/state`; anything deeper is not.
  while (rest.length > 1 && rest.endsWith("/")) rest = rest.slice(0, -1);
  return rest;
}

function messageOf(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.length <= MAX_ERROR_TEXT ? text : `${text.slice(0, MAX_ERROR_TEXT - 1)}…`;
}

const FAILURE_STATUSES = new Set([400, 404, 409, 500, 503]);

function failureStatus(result) {
  const status = isRecord(result) && Number.isInteger(result.status) ? result.status : 500;
  return FAILURE_STATUSES.has(status) ? status : 500;
}

function failureText(result) {
  return isRecord(result) && typeof result.error === "string" && result.error !== ""
    ? result.error
    : "workflow view unavailable";
}

function revisionOf(value) {
  return isFiniteNumber(value) && value >= 0 ? value : 0;
}

// ---------------------------------------------------------------------------
// the steer channel 
// ---------------------------------------------------------------------------

/**
 * Read a request body as text, bounded. The `data` chunks are accumulated as strings and the
 * byte budget is enforced on the fly, so an oversized upload is answered with 413 as soon as
 * it is detected instead of after it has been buffered whole.
 *
 * @param {object} req
 * @param {(text: string) => void} onText - called exactly once with the full body
 * @param {(status: number, error: string) => void} onError - called at most once, never after onText
 */
function readBody(req, onText, onError) {
  var received = 0;
  var text = "";
  var settled = false;

  function finish() {
    if (settled) return;
    settled = true;
    onText(text);
  }

  function fail(status, error) {
    if (settled) return;
    settled = true;
    onError(status, error);
  }

  function onData(chunk) {
    if (settled) return;
    var piece = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    received += Buffer.byteLength(piece, "utf8");
    if (received > STEER_BODY_LIMIT) {
      fail(413, "request body too large");
      return;
    }
    text += piece;
  }

  req.on("data", onData);
  req.on("end", function () {
    if (settled) return;
    finish();
  });
  req.on("aborted", function () {
    if (settled) return;
    fail(400, "request aborted");
  });
  req.on("error", function (error) {
    if (settled) return;
    fail(400, `request stream error: ${messageOf(error)}`);
  });
}

/**
 * `POST /dsh-workflow/steer` — hot-inject one prompt into a LIVE session.
 *
 * WHY `steer` AND NOT `followup`/`cancel`. The agent loop's inbox has two lists:
 * * `next-turn` — claimed at the turn boundary (followup / a normal prompt), and
 * * `next-step` — claimed at the NEXT STEP boundary inside the running turn (steer),
 * and injected WITHOUT waking the driver (inject).
 * `agent.steer(input)` calls `send(input, "next-step", true)`, which appends to `next-step`
 * AND wakes the driver. That is exactly the requested semantics: the text is picked up at the
 * next step of the current turn, and the running turn is NOT cancelled — `cancel` is the
 * only path that aborts, and this route never calls it. (Verified against
 * `@deepseek-ai/dsh-agent-loop/lib/index.js`: `steer`, `followup`, `inject`, `cancel`.)
 *
 * WHY THE SOURCE IS NOT INHERITED. `dsh-tool-goal/README.md` is explicit that a non-human
 * producer must carry its own `source` and may not inherit `{kind:"user"}`; the session's own
 * shape check (`assertMessageEventShape`) only requires a non-empty `source.kind` string, and
 * the loop owns the reserved `"runtime-context"` kind. `"plugin"` is therefore written here,
 * explicitly, with the plugin's own name so the log says WHO injected the text.
 *
 * WHY EVERY OUTCOME IS JSON. The step's discipline, inherited from the GET route: a thrown
 * exception reaching the host's web server would surface as a non-JSON failure. Every branch
 * below answers `{ok:false,error}` and the one success answers `{ok:true}`.
 */
function handleSteerRequest(req, res, method, steer, note) {
  if (method !== "POST") {
    sendJson(res, 405, { ok: false, error: `method ${method} is not allowed` }, { allow: ALLOW });
    return;
  }
  if (typeof steer !== "function") {
 // The row mounted without an agents service. A host composition problem, not a client one.
    sendJson(res, 503, { ok: false, error: "workflow steer source is unavailable" });
    return;
  }

  readBody(
    req,
    function (raw) {
      var payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { ok: false, error: "body must be JSON" });
        return;
      }
      if (!isRecord(payload)) {
        sendJson(res, 400, { ok: false, error: "body must be a JSON object" });
        return;
      }

      var sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
      if (sessionId === "") {
        sendJson(res, 400, { ok: false, error: `${SESSION_PARAM} is required` });
        return;
      }
      var text = typeof payload.text === "string" ? payload.text : "";
      if (text.trim() === "") {
        sendJson(res, 400, { ok: false, error: "text is required" });
        return;
      }
      if (text.length > STEER_TEXT_LIMIT) {
        sendJson(res, 413, { ok: false, error: `text exceeds ${STEER_TEXT_LIMIT} characters` });
        return;
      }

      var outcome;
      try {
        outcome = steer(sessionId, text);
      } catch (error) {
 // A failure INSIDE the source is ours to report: the client still gets JSON.
        note(`route: steer source threw: ${messageOf(error)}`);
        sendJson(res, 500, { ok: false, error: messageOf(error) });
        return;
      }

      if (!isRecord(outcome) || outcome.ok !== true) {
        sendJson(res, failureStatus(outcome), { ok: false, error: failureText(outcome) });
        return;
      }
 // the id the message was written with travels back to the caller. It is
 // what makes "revoke" addressable at all, and it is the only value in this answer the client
 // cannot derive: the generator (`randomUUID`) lives in the host half. A source that does not
 // report one (a double, or an older host half) keeps the pre- answer.
      sendJson(
        res,
        200,
        typeof outcome.messageId === "string" && outcome.messageId !== ""
          ? { ok: true, sessionId, messageId: outcome.messageId }
          : { ok: true, sessionId },
      );
    },
    function (status, error) {
      sendJson(res, status, { ok: false, error });
    }
  );
}

/**
 * `POST /dsh-workflow/unsteer` — take ONE not-yet-claimed injection back out of a live session.
 *
 * WHY THIS EXISTS. A `/steer` 200 proves only that the message reached the session's `next-step`
 * inbox; the running turn claims that inbox at its NEXT step boundary. Between those two instants
 * the message is queued and unread, and `agent.inbox.remove(messageId)` is the loop's own API for
 * exactly that window: it locates the id in either pending list, splices it out with
 * `outcome: 'canceled'`, and emits `agent/inbox/discarded` on the agent's dispatch bus. Nothing
 * else moves — no turn is cancelled, no history is rewritten, and once the message HAS been claimed
 * (or admitted as a `user/message`) `remove` answers false: the honest reply is 409, not a pretend
 * success.
 *
 * WHY THE ROUTE ITSELF WRITES NOTHING. `inbox.remove` IS the durable write (it appends
 * `agent/inbox/spliced` with `outcome: 'canceled'`), and the projection folds that event into the
 * row's "revoked" state. A second, plugin-authored event for one fact would be a second source of
 * truth — and the browser would have to guess which one to believe.
 *
 * WHY EVERY OUTCOME IS JSON. Same discipline as `/steer`: a thrown exception must never reach the
 * host's web server as a non-JSON failure, and "that message is gone" is a client-visible state
 * (409), not a server fault.
 */
function handleUnsteerRequest(req, res, method, unsteer, note) {
  if (method !== "POST") {
    sendJson(res, 405, { ok: false, error: `method ${method} is not allowed` }, { allow: ALLOW });
    return;
  }
  if (typeof unsteer !== "function") {
 // The row mounted without an agents service. A host composition problem, not a client one.
    sendJson(res, 503, { ok: false, error: "workflow unsteer source is unavailable" });
    return;
  }

  readBody(
    req,
    function (raw) {
      var payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { ok: false, error: "body must be JSON" });
        return;
      }
      if (!isRecord(payload)) {
        sendJson(res, 400, { ok: false, error: "body must be a JSON object" });
        return;
      }

      var sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
      if (sessionId === "") {
        sendJson(res, 400, { ok: false, error: `${SESSION_PARAM} is required` });
        return;
      }
      var messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
      if (messageId === "") {
        sendJson(res, 400, { ok: false, error: "messageId is required" });
        return;
      }

      var outcome;
      try {
        outcome = unsteer(sessionId, messageId);
      } catch (error) {
 // A failure INSIDE the source is ours to report: the client still gets JSON.
        note(`route: unsteer source threw: ${messageOf(error)}`);
        sendJson(res, 500, { ok: false, error: messageOf(error) });
        return;
      }

      if (!isRecord(outcome) || outcome.ok !== true) {
        sendJson(res, failureStatus(outcome), { ok: false, error: failureText(outcome) });
        return;
      }
      sendJson(res, 200, { ok: true, sessionId, messageId });
    },
    function (status, error) {
      sendJson(res, status, { ok: false, error });
    }
  );
}

// handler
// ---------------------------------------------------------------------------

/**
 * Build the request handler.
 *
 * @param {{snapshot?: (sessionId: string) => {ok: true, view: unknown, rev: unknown} | {ok: false, status?: number, error?: string}, steer?: (sessionId: string, text: string) => {ok: true, messageId?: string} | {ok: false, status?: number, error?: string}, unsteer?: (sessionId: string, messageId: string) => {ok: true} | {ok: false, status?: number, error?: string}, note?: (text: string) => void}} [options]
 * `snapshot` is the GET route's ONLY dependency: it resolves a session id to a composed view
 * (or to a structured failure) and knows nothing about HTTP. Keeping the session/projection
 * lookup out of this file is what lets tools/probe-route.mjs drive every branch without a
 * live host. `steer` and `unsteer` are the two POST routes' equivalent dependencies —
 * ../lib/index.js wires them to `ctx.agents.get(sessionId).steer(createUserMessage(...))` and
 * `ctx.agents.get(sessionId).inbox.remove(messageId)`, and the offline tests wire them to
 * doubles. Each is resolved defensively, so a host missing one loses only its own endpoint
 * (503) and never the others.
 * @returns {(req: object, res: object) => void} a synchronous handler (no await: the route must
 * never hold a request open on host work, and the view is synchronous by contract).
 */
export function createViewHandler(options) {
  const source = isRecord(options) ? options : {};
  const snapshot = typeof source.snapshot === "function" ? source.snapshot : null;
  const note = typeof source.note === "function" ? source.note : () => {};
  const steer = typeof source.steer === "function" ? source.steer : null;
  const unsteer = typeof source.unsteer === "function" ? source.unsteer : null;

  return function handleViewRequest(req, res) {
    try {
      if (!isObject(req) || !isObject(res) || typeof res.writeHead !== "function" || typeof res.end !== "function") {
        note("route: called without a usable (req, res) pair");
        return;
      }

      const method = typeof req.method === "string" ? req.method.toUpperCase() : "";

 // Preflight, even in a same-origin deployment: a 204 here keeps a mistaken cross-origin
 // probe from looking like a broken route. No CORS headers are emitted (same-origin only).
      if (method === "OPTIONS") {
        sendEmpty(res, 204, { allow: ALLOW });
        return;
      }

      const url = readUrl(req);
      if (url === null) {
        sendJson(res, 400, { ok: false, error: "malformed request target" }, { allow: ALLOW }, method === "HEAD");
        return;
      }

      const endpoint = endpointOf(url.pathname);
      if (endpoint !== STATE_ENDPOINT && endpoint !== STEER_ENDPOINT && endpoint !== UNSTEER_ENDPOINT) {
 // The prefix seat is ours; every sub-path under it is not.
        sendJson(
          res,
          404,
          { ok: false, error: "not found", path: `${STATE_PATH} | ${STEER_PATH} | ${UNSTEER_PATH}` },
          { allow: ALLOW },
          method === "HEAD",
        );
        return;
      }

 // The two writes are dispatched before any GET/HEAD assumption is made: a POST to /steer or
 // /unsteer is not "a wrong method on /state".
      if (endpoint === STEER_ENDPOINT) {
        handleSteerRequest(req, res, method, steer, note);
        return;
      }
      if (endpoint === UNSTEER_ENDPOINT) {
        handleUnsteerRequest(req, res, method, unsteer, note);
        return;
      }
      if (method !== "GET" && method !== "HEAD") {
        sendJson(res, 405, { ok: false, error: `method ${method} is not allowed` }, { allow: ALLOW });
        return;
      }

 // /steer and /unsteer were already dispatched above, so the endpoint is /state here by
 // construction; this check is the belt-and-braces guard that keeps the prefix seat from
 // answering an unknown sub-path with a view.
      if (endpoint !== STATE_ENDPOINT) {
        sendJson(
          res,
          404,
          { ok: false, error: "not found", path: STATE_PATH },
          { allow: ALLOW },
          method === "HEAD",
        );
        return;
      }

      const sessionId = url.searchParams.get(SESSION_PARAM);
      if (sessionId === null || sessionId.trim() === "") {
        sendJson(res, 400, { ok: false, error: `${SESSION_PARAM} is required` }, undefined, method === "HEAD");
        return;
      }

      if (snapshot === null) {
 // The row mounted without a view source. This is a host composition problem, not a
 // client one, so it must not look like "unknown session".
        sendJson(res, 503, { ok: false, error: "workflow view source is unavailable" }, undefined, method === "HEAD");
        return;
      }

      let result;
      try {
        result = snapshot(sessionId.trim());
      } catch (error) {
 // A failure INSIDE the source is ours to report: the client still gets JSON.
        note(`route: view source threw: ${messageOf(error)}`);
        sendJson(res, 500, { ok: false, error: messageOf(error) }, undefined, method === "HEAD");
        return;
      }

      if (!isRecord(result) || result.ok !== true) {
        sendJson(res, failureStatus(result), { ok: false, error: failureText(result) }, undefined, method === "HEAD");
        return;
      }

      const body = JSON.stringify({ ok: true, view: result.view ?? null, rev: revisionOf(result.rev) });
      const bytes = Buffer.from(body);
      const etag = etagFor(bytes);

      if (etagMatches(req.headers?.["if-none-match"], etag)) {
 // No body and no content-length on a 304: the stored representation is still valid.
        sendEmpty(res, 304, { etag });
        return;
      }

      res.writeHead(200, {
        "content-type": JSON_TYPE,
        "cache-control": "no-store",
        etag,
        "content-length": bytes.length,
      });
      res.end(method === "HEAD" ? undefined : bytes);
    } catch (error) {
 // Last resort. If headers already went out, all that is left is to close the response
 // cleanly; otherwise the client gets a JSON body like every other failure.
      try {
        note(`route: handler failed: ${messageOf(error)}`);
        if (res.headersSent === true) res.end();
        else sendJson(res, 500, { ok: false, error: "internal error" });
      } catch {
 // The response object itself is broken. Nothing useful can be written, and throwing here
 // would hand a non-JSON failure to the host — the exact outcome this file exists to avoid.
      }
    }
  };
}

/**
 * Register the route on the host's shared web server.
 *
 * The server throws on a duplicate `(kind, path)`, so the caller must own exactly one
 * registration per server and dispose it — see `acquireViewRoute` in ../lib/index.js, which
 * refcounts that seat across hot reloads.
 *
 * @param {unknown} server - `ctx.webServer` (or a compatible `httpServer`).
 * @param {object} [options] - see createViewHandler.
 * @returns { => void} the server's own disposer.
 */
export function registerViewRoute(server, options) {
  if (server === null || typeof server !== "object") {
    throw new Error("workflow-map route: no web server");
  }
  if (typeof server.register !== "function") {
    throw new Error("workflow-map route: the web server does not expose register()");
  }
  return server.register({
    kind: "prefix",
    path: ROUTE_PREFIX,
    handler: createViewHandler(options),
  });
}
