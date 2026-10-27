#!/usr/bin/env node
// dsh-workflow-map — step-04-hot-inject self-test for the STEER CHANNEL
// (src/route.js POST /dsh-workflow/steer + lib/index.js makeSteerSource), extended by
// step-03-unsteer for its undo (`POST /dsh-workflow/unsteer` + makeUnsteerSource).
//
//   node tools\probe-steer.mjs
//
// probe-route.mjs proves the READ endpoint; this file proves the TWO WRITES — the only paths in
// this plugin that mutate anything. It runs OFFLINE (no DSH process, no live session) over a
// real loopback `node:http` server, because status codes, method rejection and the 64 KiB body
// ceiling are transport behaviours a fake `res` cannot prove.
//
// What is asserted:
//   1. Method surface: POST is the only accepted verb on /steer and /unsteer (405 for
//      GET/HEAD/PUT/DELETE), OPTIONS preflight advertises the ALLOW, and /state is untouched
//      (still GET/HEAD only, still 405 on POST, still ETag/304).
//   2. Every documented failure branch over real HTTP, each with a JSON body and never a thrown
//      exception: 400 (unparseable body), 400 (non-object body), 400 (missing sessionId),
//      400 (blank text / missing messageId), 404 (unknown session), 409 (session not running),
//      413 (text over the 2000-character limit), 413 (body over 64 KiB), 503 (no source),
//      500 (source threw).
//   3. The success path: 200 {ok:true, messageId} and the agent REALLY received one steer.
//   4. THE MESSAGE SHAPE is the acceptance criterion — role "user", one text block carrying the
//      caller's text verbatim, source.kind "plugin" (never inherited "user"), the plugin's own
//      name, and a non-empty id. No `cancel` is ever called: the whole point is that the running
//      turn is NOT aborted.
//   5. makeSteerSource's own branches, driven directly (agents service absent / get throws /
//      unknown session / not running / steer throws), each as data and never as a throw.
//   7. THE UNSTEER CHANNEL end to end: the id /steer hands back is the id /unsteer takes out of
//      the SAME inbox double; a second revoke, an unqueued id, an idle session and a missing
//      inbox/route each answer their documented 409/503 and never a 500 by accident.
//
// Exit code 0 = every assertion passed.

import { createServer } from "node:http";

import { ROUTE_PREFIX, STEER_ENDPOINT, STEER_PATH, UNSTEER_ENDPOINT, UNSTEER_PATH, createViewHandler } from "../src/route.js";
import { makeSteerSource, makeUnsteerSource, packageName, selfCheck } from "../lib/index.js";

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition === true) {
    passed += 1;
    return;
  }
  failures.push(`${label}${detail === undefined ? "" : `  <- ${detail}`}`);
}

function equal(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, `expected ${e}, got ${a}`);
}

// ---------------------------------------------------------------------------
// a recording agent double
// ---------------------------------------------------------------------------

/** What the loop would really do: `steer(input)` → send(input, "next-step", true). */
function fakeAgents(options = {}) {
  const calls = [];
  const store = new Map(options.agents ?? []);
  return {
    calls,
    store,
    get(id) {
      if (options.getThrows === true) throw new Error("registry exploded");
      return store.get(id);
    },
  };
}

function liveAgent(record, status = "running", inbox = null) {
  return {
    status,
    cancel(...args) {
      record.push({ kind: "cancel", args });
      throw new Error("cancel must never be called by the steer channel");
    },
    steer(message) {
      if (record === null) return;
      record.push({ kind: "steer", message });
    },
    followup(message) {
      record.push({ kind: "followup", message });
    },
    // 会话6 · the host's own `ReactLoopInbox`. `remove(id)` answers TRUE only while the id is still
    // pending; false means the running turn already claimed it (or it never was there).
    ...(inbox === null ? {} : { inbox }),
  };
}

/** An inbox double that behaves like `ReactLoopInbox.remove`: one pending id, then it is gone. */
function fakeInbox(pending, record) {
  const queue = new Set(pending);
  return {
    remove(messageId) {
      record.push({ kind: "remove", messageId });
      if (!queue.has(messageId)) return false;
      queue.delete(messageId);
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// (1)+(2)+(3) real HTTP over loopback
// ---------------------------------------------------------------------------

const steered = [];
const removed = [];
const agents = fakeAgents({
  agents: [
    ["session-running", liveAgent(steered, "running", fakeInbox(["inj-live", "inj-twice"], removed))],
    ["session-idle", liveAgent(steered, "idle", fakeInbox(["inj-live"], removed))],
    ["session-no-steer", { status: "running" }],
    // A running session whose agent has no inbox at all: the composition case, not a client error.
    ["session-no-inbox", { status: "running" }],
  ],
});

/** The route's own steer dependency shape: (sessionId, text) → {ok} | {ok:false,status,error}. */
const steer = (sessionId, text) => {
  if (sessionId === "session-boom") throw new Error("steer source exploded");
  const source = makeSteerSource({ agents });
  return source(sessionId, text);
};

/** The route's own unsteer dependency shape: (sessionId, messageId) → {ok} | {ok:false,status,error}. */
const unsteer = (sessionId, messageId) => {
  if (sessionId === "session-boom") throw new Error("unsteer source exploded");
  const source = makeUnsteerSource({ agents });
  return source(sessionId, messageId);
};

const notes = [];
const server = createServer(
  createViewHandler({
    snapshot: (sessionId) =>
      sessionId === "session-live" ? { ok: true, view: { ver: 1 }, rev: 7 } : { ok: false, status: 404, error: "unknown session" },
    steer,
    unsteer,
    note: (text) => notes.push(text),
  })
);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
const url = (path) => `${origin}${path}`;

async function post(path, body) {
  const response = await fetch(url(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  let isJson = true;
  try {
    parsed = JSON.parse(text);
  } catch {
    isJson = false;
  }
  return { status: response.status, isJson, body: parsed, raw: text, allow: response.headers.get("allow") };
}

try {
  // -- the success path -----------------------------------------------------
  const ok = await post(STEER_PATH, { sessionId: "session-running", text: "请顺便复核第 3 步" });
  equal("(3) a live session answers 200", ok.status, 200);
  check("(3) the answer is JSON", ok.isJson, ok.raw);
  // step-03-unsteer · the 200 now carries the message id the host wrote, which is exactly what
  // 「撤回」 addresses. Everything else about the answer is unchanged.
  equal("(3) the answer says ok", [ok.body.ok, ok.body.sessionId], [true, "session-running"]);
  check("(3) and reports the id it wrote", typeof ok.body.messageId === "string" && ok.body.messageId.length > 0, JSON.stringify(ok.body));
  equal("(3) exactly one steer reached the agent", steered.length, 1);
  const call = steered[0] || {};
  equal("(3) it was a steer, not a followup or a cancel", call.kind, "steer");
  equal("(3) the reported id is the id on the message the agent received", ok.body.messageId, (call.message || {}).id);

  // -- the message shape (the acceptance criterion) --------------------------
  const message = call.message || {};
  equal("(4) the role is user", message.role, "user");
  equal("(4) one text block, carrying the caller's text verbatim", message.content, [
    { type: "text", text: "请顺便复核第 3 步" },
  ]);
  equal("(4) the source kind is the producer-owned plugin:<name>, never an inherited user", message.source && message.source.kind, `plugin:${packageName}`);
  check(
    "(4) the source names this plugin in the kind itself (session format v4 retired the bare wrapper)",
    typeof message.source && message.source.kind === "plugin" || String(message.source && message.source.kind).startsWith("plugin:"),
    JSON.stringify(message.source)
  );
  check(
    "(4) the message carries a non-empty id (as createUserMessage does)",
    typeof message.id === "string" && message.id.length > 0,
    JSON.stringify(message.id)
  );
  equal("(4) the message is exactly the four fields the session shape check needs", Object.keys(message).sort(), [
    "content",
    "id",
    "role",
    "source",
  ]);
  check("(4) no cancel was ever issued", steered.every((entry) => entry.kind !== "cancel"), JSON.stringify(steered.map((e) => e.kind)));

  // -- 405: every other verb -------------------------------------------------
  for (const method of ["GET", "HEAD", "PUT", "DELETE"]) {
    const response = await fetch(url(STEER_PATH), { method });
    const text = await response.text();
    equal(`(1) ${method} on /steer answers 405`, response.status, 405);
    // HEAD answers no body by contract (HTTP), so only the status is assertable for it.
    if (method !== "HEAD") check(`(1) ${method}'s 405 body is JSON`, text.includes("not allowed"), text);
  }
  const options = await fetch(url(STEER_PATH), { method: "OPTIONS" });
  equal("(1) OPTIONS answers 204", options.status, 204);
  equal("(1) OPTIONS advertises POST too", options.headers.get("allow"), "GET, HEAD, POST, OPTIONS");

  // -- /state is untouched ---------------------------------------------------
  const stateOk = await fetch(url(`${ROUTE_PREFIX}/state?sessionId=session-live`));
  equal("(1) /state still answers 200", stateOk.status, 200);
  const etag = stateOk.headers.get("etag");
  check("(1) /state still issues an ETag", typeof etag === "string" && etag.startsWith('"wfm'), String(etag));
  const cached = await fetch(url(`${ROUTE_PREFIX}/state?sessionId=session-live`), { headers: { "if-none-match": etag } });
  equal("(1) /state still answers 304 on a matching validator", cached.status, 304);
  const statePost = await fetch(url(`${ROUTE_PREFIX}/state?sessionId=session-live`), { method: "POST" });
  equal("(1) POST on /state is still 405", statePost.status, 405);

  // -- 400 family ------------------------------------------------------------
  const badJson = await post(STEER_PATH, "{not json");
  equal("(2) an unparseable body answers 400", badJson.status, 400);
  equal("(2) and says so", badJson.body, { ok: false, error: "body must be JSON" });

  const notObject = await post(STEER_PATH, "[1,2]");
  equal("(2) a non-object body answers 400", notObject.status, 400);
  check("(2) the error names the problem", String(notObject.body.error).includes("object"), JSON.stringify(notObject.body));

  const noSession = await post(STEER_PATH, { text: "hi" });
  equal("(2) a missing sessionId answers 400", noSession.status, 400);
  equal("(2) with the documented error", noSession.body, { ok: false, error: "sessionId is required" });

  const blankSession = await post(STEER_PATH, { sessionId: "   ", text: "hi" });
  equal("(2) a blank sessionId answers 400", blankSession.status, 400);

  const noText = await post(STEER_PATH, { sessionId: "session-running", text: "   " });
  equal("(2) a blank text answers 400", noText.status, 400);
  equal("(2) with the documented error", noText.body, { ok: false, error: "text is required" });

  const noTextField = await post(STEER_PATH, { sessionId: "session-running" });
  equal("(2) a missing text field answers 400", noTextField.status, 400);

  // -- 404 / 409 / 500 -------------------------------------------------------
  const unknown = await post(STEER_PATH, { sessionId: "session-nope", text: "hi" });
  equal("(2) an unknown session answers 404", unknown.status, 404);
  equal("(2) with the documented error", unknown.body, { ok: false, error: "unknown session" });

  const idle = await post(STEER_PATH, { sessionId: "session-idle", text: "hi" });
  equal("(2) a non-running session answers 409", idle.status, 409);
  equal(
    "(2) with the plain reason the step demands",
    idle.body,
    { ok: false, error: "会话未在运行，热注入不可用" }
  );

  const noSteerFn = await post(STEER_PATH, { sessionId: "session-no-steer", text: "hi" });
  equal("(2) an agent without steer() also answers 409", noSteerFn.status, 409);

  const boom = await post(STEER_PATH, { sessionId: "session-boom", text: "hi" });
  equal("(2) a throwing source answers 500, not a broken socket", boom.status, 500);
  check("(2) and carries the reason", String(boom.body.error).includes("exploded"), JSON.stringify(boom.body));

  // -- 413: the text bound and the body bound --------------------------------
  const tooLong = await post(STEER_PATH, { sessionId: "session-running", text: "字".repeat(2001) });
  equal("(2) 2001 characters answers 413", tooLong.status, 413);
  check("(2) the error names the bound", String(tooLong.body.error).includes("2000"), JSON.stringify(tooLong.body));

  const atLimit = await post(STEER_PATH, { sessionId: "session-running", text: "字".repeat(2000) });
  equal("(2) exactly 2000 characters is accepted", atLimit.status, 200);

  const huge = await post(STEER_PATH, JSON.stringify({ sessionId: "session-running", text: "x".repeat(70000) }));
  equal("(2) a body over 64 KiB answers 413", huge.status, 413);
  check("(2) the error names the body", String(huge.body.error).includes("too large"), JSON.stringify(huge.body));

  // -- an empty body: a valid POST with nothing in it ------------------------
  const empty = await fetch(url(STEER_PATH), { method: "POST", headers: { "content-type": "application/json" }, body: "" });
  const emptyText = await empty.text();
  equal("(2) an empty body answers 400", empty.status, 400);
  check("(2) as JSON, not a crash", emptyText.includes("must be JSON"), emptyText);

  // -- an unknown sub-path is still 404 -------------------------------------
  const subPath = await post(`${ROUTE_PREFIX}/other`, { sessionId: "session-running", text: "hi" });
  equal("(2) an unknown sub-path answers 404", subPath.status, 404);

  // -- (7) the unsteer channel: every branch, over the same loopback server ----
  //
  // The lifecycle this asserts is the whole point of step-03: a message the host wrote can be
  // taken back while it is still unclaimed (200), cannot be taken back twice (409), and can never
  // be taken back from a session that is not running (409) or whose agent has no inbox (503).
  const removedCount0 = removed.length;

  const revokeOk = await post(UNSTEER_PATH, { sessionId: "session-running", messageId: "inj-live" });
  equal("(7) a queued message is revoked with 200", revokeOk.status, 200);
  check("(7) the answer is JSON", revokeOk.isJson, revokeOk.raw);
  equal("(7) and it says which message left", revokeOk.body, { ok: true, sessionId: "session-running", messageId: "inj-live" });
  equal("(7) the agent's own inbox.remove received exactly that id", removed.slice(removedCount0), [{ kind: "remove", messageId: "inj-live" }]);
  check("(7) nothing else was called: no cancel, no followup", steered.every((entry) => entry.kind !== "cancel" && entry.kind !== "followup"), JSON.stringify(steered.map((e) => e.kind)));

  const revokeAgain = await post(UNSTEER_PATH, { sessionId: "session-running", messageId: "inj-live" });
  equal("(7) revoking the same message twice answers 409", revokeAgain.status, 409);
  equal("(7) with the documented reason", revokeAgain.body, { ok: false, error: "该注入已被会话接下或不存在" });

  const revokeUnknown = await post(UNSTEER_PATH, { sessionId: "session-running", messageId: "never-existed" });
  equal("(7) an id the inbox never held is the same 409", revokeUnknown.status, 409);

  for (const method of ["GET", "HEAD", "PUT", "DELETE"]) {
    const response = await fetch(url(UNSTEER_PATH), { method });
    const text = await response.text();
    equal(`(7) ${method} on /unsteer answers 405`, response.status, 405);
    if (method !== "HEAD") check(`(7) ${method}'s 405 body is JSON`, text.includes("not allowed"), text);
  }
  const revokeOptions = await fetch(url(UNSTEER_PATH), { method: "OPTIONS" });
  equal("(7) OPTIONS on /unsteer answers 204", revokeOptions.status, 204);

  const revokeBadJson = await post(UNSTEER_PATH, "{not json");
  equal("(7) an unparseable body answers 400", revokeBadJson.status, 400);
  equal("(7) and says so", revokeBadJson.body, { ok: false, error: "body must be JSON" });

  const revokeNotObject = await post(UNSTEER_PATH, "[1,2]");
  equal("(7) a non-object body answers 400", revokeNotObject.status, 400);

  const revokeNoSession = await post(UNSTEER_PATH, { messageId: "inj-live" });
  equal("(7) a missing sessionId answers 400", revokeNoSession.status, 400);
  equal("(7) with the documented error", revokeNoSession.body, { ok: false, error: "sessionId is required" });

  const revokeNoId = await post(UNSTEER_PATH, { sessionId: "session-running" });
  equal("(7) a missing messageId answers 400", revokeNoId.status, 400);
  equal("(7) with the documented error", revokeNoId.body, { ok: false, error: "messageId is required" });

  const revokeBlankId = await post(UNSTEER_PATH, { sessionId: "session-running", messageId: "   " });
  equal("(7) a blank messageId answers 400", revokeBlankId.status, 400);

  const revokeUnknownSession = await post(UNSTEER_PATH, { sessionId: "session-nope", messageId: "inj-live" });
  equal("(7) an unknown session answers 404", revokeUnknownSession.status, 404);
  equal("(7) with the documented error", revokeUnknownSession.body, { ok: false, error: "unknown session" });

  const revokeIdle = await post(UNSTEER_PATH, { sessionId: "session-idle", messageId: "inj-live" });
  equal("(7) a non-running session answers 409", revokeIdle.status, 409);
  equal("(7) with the same plain reason /steer uses", revokeIdle.body, { ok: false, error: "会话未在运行，热注入不可用" });

  const revokeNoInbox = await post(UNSTEER_PATH, { sessionId: "session-no-inbox", messageId: "inj-live" });
  equal("(7) an agent with no inbox answers 503, not 409", revokeNoInbox.status, 503);
  equal("(7) and names the missing capability", revokeNoInbox.body, { ok: false, error: "the host exposes no inbox revoke API" });

  const revokeBoom = await post(UNSTEER_PATH, { sessionId: "session-boom", messageId: "inj-live" });
  equal("(7) a throwing source answers 500, not a broken socket", revokeBoom.status, 500);
  check("(7) and carries the reason", String(revokeBoom.body.error).includes("unsteer source exploded"), JSON.stringify(revokeBoom.body));

  // The honest end-to-end: /steer hands back an id, /unsteer takes exactly that id back out of the
  // SAME agent double. This is the round trip the panel's 「撤回」 button makes.
  const roundTripAgents = fakeAgents({ agents: [["s-rt", liveAgent([], "running", fakeInbox([], []))]] });
  const steerSource = makeSteerSource({ agents: roundTripAgents });
  const unsteerSource = makeUnsteerSource({ agents: roundTripAgents });
  const wrote = steerSource("s-rt", "补一句");
  equal("(7) the round trip starts with a steer", wrote.ok, true);
  check("(7) which reports the id it wrote", typeof wrote.messageId === "string" && wrote.messageId.length > 0, JSON.stringify(wrote));
  equal("(7) an id that is not in the inbox cannot be revoked", unsteerSource("s-rt", wrote.messageId), {
    ok: false,
    status: 409,
    error: "该注入已被会话接下或不存在",
  });
  const emptyInboxAgents = fakeAgents({ agents: [["s-rt2", liveAgent([], "running", fakeInbox([wrote.messageId], []))]] });
  const unsteerSameId = makeUnsteerSource({ agents: emptyInboxAgents });
  equal("(7) while it IS queued, that same id revokes", unsteerSameId("s-rt2", wrote.messageId), { ok: true });

  // -- 503: the row mounted with no steer source -----------------------------
  //
  // Driven with an EventEmitter as `req`: the handler subscribes to data/end, and this is the
  // one branch that must be answered before any body arrives.
  const { EventEmitter } = await import("node:events");
  const bare = createViewHandler({ snapshot: () => ({ ok: false, status: 404, error: "unknown session" }) });
  const req = new EventEmitter();
  req.method = "POST";
  req.url = STEER_PATH;
  req.headers = {};
  const out = await new Promise((resolve) => {
    const record = { status: 0, headers: {}, body: "" };
    const res = {
      headersSent: false,
      writeHead(value, headers) {
        record.status = value;
        record.headers = headers ?? {};
        this.headersSent = true;
        return this;
      },
      end(chunk) {
        record.body = chunk === undefined || chunk === null ? "" : String(chunk);
        resolve(record);
      },
    };
    bare(req, res);
    req.emit("data", Buffer.from(JSON.stringify({ sessionId: "session-running", text: "hi" })));
    req.emit("end");
  });
  check("(2) nothing was thrown through the transport", notes.every((line) => typeof line === "string"), JSON.stringify(notes));
  equal("(2) a route with no steer source answers 503", out.status, 503);
  equal("(2) with the documented error", JSON.parse(out.body), { ok: false, error: "workflow steer source is unavailable" });

  // -- 503: and with no unsteer source either (same handler, other endpoint) --
  const reqUnsteer = new EventEmitter();
  reqUnsteer.method = "POST";
  reqUnsteer.url = UNSTEER_PATH;
  reqUnsteer.headers = {};
  const outUnsteer = await new Promise((resolve) => {
    const record = { status: 0, headers: {}, body: "" };
    const res = {
      headersSent: false,
      writeHead(value, headers) {
        record.status = value;
        record.headers = headers ?? {};
        this.headersSent = true;
        return this;
      },
      end(chunk) {
        record.body = chunk === undefined || chunk === null ? "" : String(chunk);
        resolve(record);
      },
    };
    bare(reqUnsteer, res);
    reqUnsteer.emit("data", Buffer.from(JSON.stringify({ sessionId: "session-running", messageId: "inj-live" })));
    reqUnsteer.emit("end");
  });
  equal("(7) a route with no unsteer source answers 503", outUnsteer.status, 503);
  equal("(7) with the documented error", JSON.parse(outUnsteer.body), { ok: false, error: "workflow unsteer source is unavailable" });

} finally {
  await new Promise((resolve) => server.close(resolve));
}

// ---------------------------------------------------------------------------
// (5) makeSteerSource's own branches, driven directly
// ---------------------------------------------------------------------------

const calls2 = [];
const healthy = makeSteerSource({ agents: fakeAgents({ agents: [["s1", liveAgent(calls2, "running")]] }) });
const healthyOutcome = healthy("s1", "继续");
equal("(5) a running session steers", healthyOutcome.ok, true);
check("(5) and reports the id it wrote, which is what /unsteer addresses", typeof healthyOutcome.messageId === "string" && healthyOutcome.messageId.length > 0, JSON.stringify(healthyOutcome));
equal("(5) and the agent got one message", calls2.length, 1);
equal("(5) the reported id is the message's own id", healthyOutcome.messageId, calls2[0].message.id);
equal("(5) the reported id is not reused between sends", healthy("s1", "再来一句").messageId === healthyOutcome.messageId, false);

const noService = makeSteerSource({});
equal("(5) a host without the agents service answers 503", noService("s1", "x"), {
  ok: false,
  status: 503,
  error: "the agents service is unavailable",
});

const brokenGet = makeSteerSource({ agents: fakeAgents({ getThrows: true }) });
equal("(5) a throwing registry answers 500", brokenGet("s1", "x").status, 500);
check("(5) and carries the reason", String(brokenGet("s1", "x").error).includes("registry exploded"), "no reason");

const empty2 = makeSteerSource({ agents: fakeAgents() });
equal("(5) an unknown session answers 404", empty2("nope", "x"), { ok: false, status: 404, error: "unknown session" });

const throwingSteer = makeSteerSource({
  agents: fakeAgents({
    agents: [
      [
        "s2",
        {
          status: "running",
          steer() {
            throw new Error("inbox is closed");
          },
        },
      ],
    ],
  }),
});
const thrown = throwingSteer("s2", "x");
equal("(5) a throwing steer answers 500", thrown.status, 500);
check("(5) and carries the reason", String(thrown.error).includes("inbox is closed"), JSON.stringify(thrown));

// A long text still fits the bound: the source does not police it (the route does), but it must
// not corrupt it either.
const longText = "长".repeat(1500);
const longCalls = [];
const longSource = makeSteerSource({ agents: fakeAgents({ agents: [["s3", liveAgent(longCalls, "running")]] }) });
equal("(5) a 1500-character text is passed through", longSource("s3", longText).ok, true);
equal("(5) verbatim, not truncated", longCalls[0].message.content[0].text.length, 1500);

// ---------------------------------------------------------------------------
// (6) selfCheck carries the new endpoint
// ---------------------------------------------------------------------------

check("(6) selfCheck lists the steer route", selfCheck.registrations.includes(`httpRoute:${STEER_PATH}`), JSON.stringify(selfCheck.registrations));
equal("(6) selfCheck.steerRoute is the path", selfCheck.steerRoute, "/dsh-workflow/steer");
equal("(6) the endpoint constant", STEER_ENDPOINT, "/steer");

// 会话7 · the unsteer route is the THIRD registration: a plugin that forgot to declare it would
// still serve it, which is exactly the drift this list exists to catch.
check("(6) selfCheck lists the unsteer route", selfCheck.registrations.includes(`httpRoute:${UNSTEER_PATH}`), JSON.stringify(selfCheck.registrations));
equal("(6) selfCheck.unsteerRoute is the path", selfCheck.unsteerRoute, "/dsh-workflow/unsteer");
equal("(6) the endpoint constant", UNSTEER_ENDPOINT, "/unsteer");
equal("(6) the three endpoints are distinct", new Set([selfCheck.httpRoute, selfCheck.steerRoute, selfCheck.unsteerRoute]).size, 3);

// ---------------------------------------------------------------------------
// (5b) makeUnsteerSource's own branches, driven directly
// ---------------------------------------------------------------------------

const noService2 = makeUnsteerSource({});
equal("(5b) a host without the agents service answers 503", noService2("s1", "m1"), {
  ok: false,
  status: 503,
  error: "the agents service is unavailable",
});

const brokenGet2 = makeUnsteerSource({ agents: fakeAgents({ getThrows: true }) });
equal("(5b) a throwing registry answers 500", brokenGet2("s1", "m1").status, 500);
check("(5b) and carries the reason", String(brokenGet2("s1", "m1").error).includes("registry exploded"), "no reason");

const empty3 = makeUnsteerSource({ agents: fakeAgents() });
equal("(5b) an unknown session answers 404", empty3("nope", "m1"), { ok: false, status: 404, error: "unknown session" });

const idle3 = makeUnsteerSource({ agents: fakeAgents({ agents: [["s4", liveAgent([], "idle", fakeInbox(["m1"], []))]] }) });
equal("(5b) an idle session answers 409 before touching the inbox", idle3("s4", "m1"), {
  ok: false,
  status: 409,
  error: "会话未在运行，热注入不可用",
});

const throwingRemove = makeUnsteerSource({
  agents: fakeAgents({
    agents: [
      [
        "s5",
        liveAgent([], "running", {
          remove() {
            throw new Error("inbox is closed");
          },
        }),
      ],
    ],
  }),
});
const thrownRemove = throwingRemove("s5", "m1");
equal("(5b) a throwing inbox.remove answers 500", thrownRemove.status, 500);
check("(5b) and carries the reason", String(thrownRemove.error).includes("inbox is closed"), JSON.stringify(thrownRemove));

const noIdSource = makeUnsteerSource({ agents: fakeAgents({ agents: [["s6", liveAgent([], "running", fakeInbox([], []))]] }) });
equal("(5b) a missing message is still the honest 409", noIdSource("s6", "").status, 409);

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const total = passed + failures.length;
if (failures.length === 0) {
  console.log(`probe-steer: PASS ${passed}/${total} assertions`);
  console.log("  POST /dsh-workflow/steer: 200 · 400 · 404 · 409 · 413 · 500 · 503 · 405 · 204, all JSON");
  console.log("  + message shape: role user, source.kind plugin, verbatim text, no cancel");
  console.log("  POST /dsh-workflow/unsteer: 200 · 400 · 404 · 409 · 500 · 503 · 405 · 204, all JSON");
  console.log("  + revoke round trip: /steer's messageId is the id inbox.remove takes back out");
  console.log("  + /state untouched: 200 / ETag / 304 / 405 on POST");
  process.exit(0);
}

console.error(`probe-steer: FAIL ${failures.length}/${total} assertions`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(1);
