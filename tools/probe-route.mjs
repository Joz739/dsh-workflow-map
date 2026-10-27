#!/usr/bin/env node
// dsh-workflow-map — step-04 self-test for the HTTP VIEW ROUTE (src/route.js + its wiring in
// lib/index.js).
//
//   node tools\probe-route.mjs
//
// selftest-host.mjs proves the registration; this file proves the ROUTE — the part a browser or
// `Invoke-WebRequest` actually talks to. It runs OFFLINE (no DSH process, no profile edit) and
// still exercises real HTTP: section (3) serves the handler from a loopback `node:http` server on
// an ephemeral port, because status codes, header casing and 304-without-body are transport
// behaviours a fake `res` cannot prove.
//
// What is asserted:
//   1. composeView is the single join point and is IDEMPOTENT: composing an already-composed view
//      (with its own plan, or with `null`) returns an equal view, and the inputs are not mutated.
//   2. The cache validator behaves: FNV-1a known answers, content-sensitive tags, weak comparison
//      (`W/"x"` matches `"x"`, `*` matches anything, a list is honoured).
//   3. Every documented branch over a REAL loopback server — 200 + `{ok,view,rev}`, 304 on
//      If-None-Match, 400 (missing/blank sessionId), 404 (unknown session), 404 (unknown sub-path),
//      405 (wrong method), 204 (OPTIONS), 500 (source threw), 503 (view unavailable) — each with a
//      JSON body, never a thrown exception, and the documented headers.
//   4. The lib/index.js wiring: one prefix seat per server, shared by a second apply() (the real
//      server throws on a duplicate path), removed by its disposers, and its view source resolves
//      session → projection snapshot → composeView with `rev === asOfSeq`.
//   5. REAL DATA: this workspace's own `.pae/<session>/orchestrator.json` drives the composed view
//      (count / titles / statuses agree with the plan), the composed view passes the projection's
//      own wire schema, and the plan file is untouched (mtime + size unchanged).
//
// Exit code 0 = every assertion passed.

import { createServer } from "node:http";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ROUTE_PREFIX,
  STATE_PATH,
  composeView,
  createViewHandler,
  etagFor,
  etagMatches,
  fnv1a32,
  registerViewRoute,
} from "../src/route.js";
import { createPlanReader, planFilePath } from "../src/orchestrator.mjs";
import { apply, PROJECTION_KEY, routeInfo, selfCheck } from "../lib/index.js";
import { buildView, createInitialState, foldEvent } from "../src/fold.mjs";

/**
 * The workspace the REAL-DATA section reads `.pae` from.
 *
 * Defaults to the cwd, which is right when the probe is run from the workspace. The optional
 * argument exists because this tool normally runs from the PLUGIN directory (where `node
 * tools/probe-route.mjs` resolves): without it, section (5) would silently skip on the very
 * machine it was written for. A missing/unreadable path is still a skip, never a failure — a
 * shipped self-test must not require somebody else's session.
 */
const WORKSPACE = process.argv[2] === undefined ? process.cwd() : resolve(process.argv[2]);

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

const T0 = 1792000000000;

/** Fold one synthetic session so the route has a real-shaped view to serve. */
function foldTodos(todos, seq) {
  let state = createInitialState();
  state = foldEvent(state, {
    type: "user/message",
    seq: (seq ?? 10) - 1,
    time: T0,
    data: { content: [{ type: "text", text: "路由自检" }], source: { kind: "user" }, role: "user" },
  });
  state = foldEvent(state, { type: "todo/write", seq: seq ?? 10, time: T0 + 1000, data: { todos } });
  return buildView(state, T0 + 1000);
}

// ---------------------------------------------------------------------------
// (1) composeView — one join point, idempotent, non-mutating
// ---------------------------------------------------------------------------

const baseView = foldTodos([
  { content: "甲", status: "in_progress" },
  { content: "乙", status: "pending" },
]);
const plan = {
  ver: 1,
  phase: "executing",
  task: "自检任务\n第二行不显示",
  taskTitle: "自检任务",
  summary: "",
  planDir: ".pae/session-x",
  pausedReason: "",
  stepIndex: 1,
  steps: [
    { index: 1, title: "第一步", file: "step-01.md", requiresConfirmation: false },
    { index: 2, title: "第二步", file: "step-02.md", requiresConfirmation: true },
  ],
  stepReports: [],
  statuses: { 1: "completed", 2: "in_progress" },
  anchorSeqs: { 1: 5, 2: 9 },
  skipped: [],
  asOfMtime: 1,
  sourcePath: "C:\\repo\\.pae\\session-x\\orchestrator.json",
};

const composed = composeView(baseView, plan);
equal("(1) the plan's task title wins", composed.task, "自检任务");
equal("(1) titles come from the plan", composed.steps.map((step) => step.title), ["第一步", "第二步"]);
equal("(1) todo-derived statuses follow the plan", composed.steps.map((step) => step.status), ["done", "running"]);
equal("(1) a finished step is pinned at 100", composed.steps[0].percent, 100);
check("(1) the plan section rides along", composed.plan === plan, "plan section missing");
check("(1) the input view is not mutated", baseView.steps[0].title === "甲" && baseView.plan === undefined, "composeView mutated its input");
check("(1) the plan object is not mutated", plan.steps[0].title === "第一步", "plan mutated");

const twice = composeView(composed, composed.plan);
equal("(1) composing an already-composed view is a no-op", JSON.stringify(twice), JSON.stringify(composed));
const viaFallback = composeView(composed, null);
equal("(1) a null plan falls back to the view's own section", JSON.stringify(viaFallback), JSON.stringify(composed));
check("(1) a non-object view is returned untouched", composeView(null, plan) === null, "null view changed");

// ---------------------------------------------------------------------------
// (2) the cache validator
// ---------------------------------------------------------------------------

equal("(2) FNV-1a of the empty string is the offset basis", fnv1a32(Buffer.from("")), 0x811c9dc5);
equal("(2) FNV-1a of \"a\" (known vector)", fnv1a32(Buffer.from("a")), 0xe40c292c);

const bytes = Buffer.from('{"ok":true}');
const tag = etagFor(bytes);
equal("(2) the same bytes give the same tag", etagFor(Buffer.from('{"ok":true}')), tag);
check("(2) different bytes give a different tag", etagFor(Buffer.from('{"ok":false}')) !== tag, "tag collision on a one-byte change");
check("(2) the tag is quoted", tag.startsWith('"') && tag.endsWith('"'), tag);
check("(2) the tag carries the byte length", tag.includes(`-${bytes.length}"`), tag);

check("(2) an exact tag matches", etagMatches(tag, tag), "exact match refused");
check("(2) a weak tag matches (weak comparison)", etagMatches(`W/${tag}`, tag), "W/ form refused");
check("(2) a list is honoured", etagMatches(`"other", ${tag}`, tag), "list form refused");
check("(2) `*` matches the current representation", etagMatches("*", tag), "* refused");
check("(2) an unrelated tag does not match", etagMatches('"other"', tag) === false, "false positive");
check("(2) a missing header does not match", etagMatches(undefined, tag) === false, "undefined matched");

// ---------------------------------------------------------------------------
// (3) real HTTP: every branch, over loopback
// ---------------------------------------------------------------------------

/** Snapshot double: the route must not care HOW a view is produced, only what it returns. */
const servedView = JSON.parse(JSON.stringify(composed));
const notes = [];
const snapshot = (sessionId) => {
  if (sessionId === "session-live") return { ok: true, view: servedView, rev: 42 };
  if (sessionId === "session-boom") throw new Error("boom from the fold");
  if (sessionId === "session-broken") return { ok: false, status: 500, error: "fold exploded" };
  if (sessionId === "session-no-key") return { ok: false, status: 503, error: `${PROJECTION_KEY} is not registered` };
  return { ok: false, status: 404, error: "unknown session" };
};

const httpServer = createServer(createViewHandler({ snapshot, note: (text) => notes.push(text) }));
await new Promise((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(0, "127.0.0.1", resolve);
});
const port = httpServer.address().port;
const origin = `http://127.0.0.1:${port}`;
const stateUrl = (query) => `${origin}${STATE_PATH}${query ?? ""}`;

try {
  // -- 200 ------------------------------------------------------------------
  const ok = await fetch(stateUrl("?sessionId=session-live"));
  const okText = await ok.text();
  equal("(3) a live session answers 200", ok.status, 200);
  equal("(3) content-type is JSON with a charset", ok.headers.get("content-type"), "application/json; charset=utf-8");
  equal("(3) caching is disabled", ok.headers.get("cache-control"), "no-store");
  check("(3) an ETag is issued", (ok.headers.get("etag") ?? "").startsWith('"wfm'), ok.headers.get("etag"));
  const okBody = JSON.parse(okText);
  equal("(3) the body has exactly ok/view/rev", Object.keys(okBody).sort(), ["ok", "rev", "view"]);
  equal("(3) rev is the projection cut", okBody.rev, 42);
  equal("(3) the view is served unchanged", JSON.stringify(okBody.view), JSON.stringify(servedView));
  const liveTag = ok.headers.get("etag");

  // -- 304 ------------------------------------------------------------------
  const cached = await fetch(stateUrl("?sessionId=session-live"), { headers: { "if-none-match": liveTag } });
  equal("(3) a matching If-None-Match answers 304", cached.status, 304);
  equal("(3) a 304 carries no body", await cached.text(), "");

  const weak = await fetch(stateUrl("?sessionId=session-live"), { headers: { "if-none-match": `W/${liveTag}` } });
  equal("(3) a weak validator still answers 304", weak.status, 304);

  const stale = await fetch(stateUrl("?sessionId=session-live"), { headers: { "if-none-match": '"wfm-stale-0"' } });
  equal("(3) a stale validator answers 200", stale.status, 200);
  await stale.text();

  // -- HEAD -----------------------------------------------------------------
  const head = await fetch(stateUrl("?sessionId=session-live"), { method: "HEAD" });
  equal("(3) HEAD answers 200", head.status, 200);
  equal("(3) HEAD has no body", await head.text(), "");
  check("(3) HEAD still advertises the length", Number(head.headers.get("content-length")) > 0, head.headers.get("content-length"));

  // -- 400 ------------------------------------------------------------------
  const missing = await fetch(stateUrl());
  equal("(3) a missing sessionId answers 400", missing.status, 400);
  equal("(3) the 400 body says what is wrong", JSON.parse(await missing.text()).error, "sessionId is required");

  const blank = await fetch(stateUrl("?sessionId=%20%20"));
  equal("(3) a blank sessionId answers 400", blank.status, 400);
  await blank.text();

  // -- 404 ------------------------------------------------------------------
  const unknown = await fetch(stateUrl("?sessionId=session-nope"));
  equal("(3) an unknown session answers 404", unknown.status, 404);
  equal("(3) the 404 body is the documented one", JSON.parse(await unknown.text()).error, "unknown session");

  const subPath = await fetch(`${origin}${ROUTE_PREFIX}/other?sessionId=session-live`);
  equal("(3) an unknown sub-path answers 404", subPath.status, 404);
  await subPath.text();

  const barePrefix = await fetch(`${origin}${ROUTE_PREFIX}?sessionId=session-live`);
  equal("(3) the bare prefix answers 404", barePrefix.status, 404);
  await barePrefix.text();

  // -- 405 / 204 ------------------------------------------------------------
  const post = await fetch(stateUrl("?sessionId=session-live"), { method: "POST" });
  equal("(3) POST on /state answers 405", post.status, 405);
  check("(3) the 405 body is JSON", (await post.text()).includes("not allowed"), "405 body");

  const options = await fetch(stateUrl("?sessionId=session-live"), { method: "OPTIONS" });
  equal("(3) OPTIONS answers 204", options.status, 204);
  equal("(3) OPTIONS advertises the allowed methods", options.headers.get("allow"), "GET, HEAD, POST, OPTIONS");

  // -- 500 / 503 ------------------------------------------------------------
  const boom = await fetch(stateUrl("?sessionId=session-boom"));
  equal("(3) a throwing source answers 500, not a broken socket", boom.status, 500);
  equal("(3) the 500 body carries the reason", JSON.parse(await boom.text()).error, "boom from the fold");

  const broken = await fetch(stateUrl("?sessionId=session-broken"));
  equal("(3) a structured failure keeps its status", broken.status, 500);
  await broken.text();

  const noKey = await fetch(stateUrl("?sessionId=session-no-key"));
  equal("(3) an unavailable view answers 503", noKey.status, 503);
  await noKey.text();

  // -- trailing slash -------------------------------------------------------
  const slash = await fetch(stateUrl("/?sessionId=session-live"));
  equal("(3) a trailing slash is the same resource", slash.status, 200);
  await slash.text();

  check("(3) the source was only consulted, never thrown through", notes.every((line) => typeof line === "string"), JSON.stringify(notes));
} finally {
  await new Promise((resolve) => httpServer.close(resolve));
}

// ---------------------------------------------------------------------------
// (4) lib/index.js wiring: the actual seat, view source and disposal
// ---------------------------------------------------------------------------

/** Minimal host double: duplicate-path throwing, disposable, effect-owning. */
function fakeHost() {
  const host = {
    routes: new Map(),
    routeLog: [],
    registrations: [],
    effects: [],
  };
  host.webServer = {
    register(route) {
      const key = `${route.kind} ${route.path}`;
      if (host.routes.has(key)) throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`);
      host.routes.set(key, route);
      host.routeLog.push(route);
      return () => host.routes.delete(key);
    },
  };
  host.sessionProjections = {
    register(definition) {
      host.registrations.push(definition);
      return () => {};
    },
    // What the real registry returns for `snapshot(session, [key])`.
    snapshot(session, keys) {
      if (Array.isArray(keys) && !keys.includes(PROJECTION_KEY)) return { asOfSeq: 0, values: {} };
      return { asOfSeq: 7, values: { [PROJECTION_KEY]: host.viewFor(session) } };
    },
  };
  host.viewFor = (session) => (session.id === "session-live" ? servedView : null);
  host.sessions = {
    get(sessionId) {
      return sessionId === "session-live" ? { id: sessionId, header: { id: sessionId, cwd: process.cwd() } } : undefined;
    },
  };
  host.effect = (execute) => {
    const dispose = execute();
    if (typeof dispose === "function") host.effects.push(dispose);
    return dispose;
  };
  return host;
}

/** Drive the captured handler without a socket (section (3) already proved the transport). */
function exchange(handler, request) {
  const out = { status: 0, headers: {}, body: "" };
  const res = {
    headersSent: false,
    writeHead(status, headers) {
      out.status = status;
      out.headers = headers ?? {};
      this.headersSent = true;
      return this;
    },
    end(chunk) {
      if (chunk === undefined || chunk === null) return;
      out.body = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    },
  };
  handler({ method: request.method ?? "GET", url: request.url ?? "/", headers: request.headers ?? {} }, res);
  return out;
}

const host = fakeHost();
apply(host);
equal("(4) one prefix seat is registered", host.routeLog.length, 1);
equal("(4) the seat is /dsh-workflow", [host.routeLog[0]?.kind, host.routeLog[0]?.path], ["prefix", ROUTE_PREFIX]);
equal("(4) the route path is the documented one", selfCheck.httpRoute, STATE_PATH);
check("(4) routeInfo reports the registration", routeInfo().servers === 1 && routeInfo().owners === 1, JSON.stringify(routeInfo()));

const routeHandler = host.routeLog[0].handler;
const live = exchange(routeHandler, { url: `${STATE_PATH}?sessionId=session-live` });
equal("(4) the wired route answers 200", live.status, 200);
const wiredBody = JSON.parse(live.body);
equal("(4) rev is the projection's asOfSeq", wiredBody.rev, 7);
equal("(4) the view came from the projection snapshot", JSON.stringify(wiredBody.view), JSON.stringify(servedView));

const unknownSession = exchange(routeHandler, { url: `${STATE_PATH}?sessionId=session-x` });
equal("(4) an unknown session through the wired route answers 404", unknownSession.status, 404);
equal("(4) with the documented error", JSON.parse(unknownSession.body).error, "unknown session");

const noParam = exchange(routeHandler, { url: STATE_PATH });
equal("(4) a missing sessionId answers 400 without a session lookup", noParam.status, 400);

// A second apply() on the SAME server: the real one would throw on a duplicate path.
apply(host);
equal("(4) the second apply shares the seat", host.routeLog.length, 1);
equal("(4) both owners are counted", routeInfo().owners, 2);

for (const dispose of host.effects) dispose();
equal("(4) disposing every owner removes the route", host.routes.size, 0);
equal("(4) no seat remains", routeInfo().servers, 0);

// A server that refuses to register must not take apply() down with it.
const refusing = fakeHost();
refusing.webServer.register = () => {
  throw new Error("webserver: duplicate exact route \"/dsh-workflow\"");
};
let survived = true;
try {
  apply(refusing);
} catch {
  survived = false;
}
check("(4) a refusing server does not fail the mount", survived, "apply() threw on a route refusal");
equal("(4) the projection still mounted", refusing.registrations.length, 1);
check("(4) and the refusal is recorded", routeInfo().note.includes("registration failed"), routeInfo().note);

// ---------------------------------------------------------------------------
// (5) real data: this workspace's own PAE plan
// ---------------------------------------------------------------------------

const planRoot = join(WORKSPACE, ".pae");

function newestPlan() {
  let entries;
  try {
    entries = readdirSync(planRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  let best = null;
  for (const entry of entries) {
    if (entry.isDirectory() !== true || !entry.name.startsWith("session-")) continue;
    const sessionId = entry.name;
    const file = planFilePath({ cwd: WORKSPACE, sessionId });
    if (file === null) continue;
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    if (stat.isFile() !== true) continue;
    if (best === null || stat.mtimeMs > best.stat.mtimeMs) best = { sessionId, file, stat };
  }
  return best;
}

const found = newestPlan();
if (found === null) {
  console.log("(5) SKIP — no .pae/<session>/orchestrator.json in this workspace (not a failure)");
} else {
  const before = statSync(found.file);
  const reader = createPlanReader({ cwd: WORKSPACE, sessionId: found.sessionId });
  equal("(5) the reader resolves the plan PAE would use", reader.path, found.file);
  const realPlan = reader.read();
  check("(5) the plan parses", realPlan !== null && realPlan.ver === 1, "plan is null");
  const after = statSync(found.file);
  equal("(5) reading does not modify the plan file (mtime)", after.mtimeMs, before.mtimeMs);
  equal("(5) reading does not modify the plan file (size)", after.size, before.size);

  if (realPlan !== null) {
    // The fold's todo-derived rows, in the plan's own order — the "todo 兜底" case.
    const view = foldTodos(realPlan.steps.map((step) => ({ content: step.title, status: "pending" })), 500);
    const realComposed = composeView(view, realPlan);

    equal("(5) every plan step has a row", realComposed.steps.length, realPlan.steps.length);
    equal("(5) the titles are the plan's", realComposed.steps.map((step) => step.title), realPlan.steps.map((step) => step.title));
    equal("(5) the header is the plan's first line", realComposed.task, realPlan.taskTitle);
    check("(5) the plan section is the plan", realComposed.plan === realPlan, "plan section replaced");

    // Independent expectation: PAE's vocabulary → the fold's, computed here rather than imported.
    const expected = new Map([
      ["completed", "done"],
      ["done", "done"],
      ["success", "done"],
      ["in_progress", "running"],
      ["in-progress", "running"],
      ["running", "running"],
      ["executing", "running"],
      ["pending", "pending"],
      ["queued", "pending"],
      ["failed", "failed"],
      ["failure", "failed"],
      ["error", "failed"],
    ]);
    const mismatches = [];
    realComposed.steps.forEach((step, position) => {
      const planIndex = position + 1;
      const label = realPlan.statuses[String(planIndex)];
      const report = realPlan.stepReports.find((row) => row.stepIndex === planIndex);
      const wanted =
        typeof label === "string" && expected.has(label.trim().toLowerCase())
          ? expected.get(label.trim().toLowerCase())
          : report !== undefined && report.status === "success"
            ? "done"
            : report !== undefined && report.status === "failed"
              ? "failed"
              : "pending";
      if (step.status !== wanted) mismatches.push(`${planIndex}: wanted ${wanted}, got ${step.status}`);
      if ((wanted === "done" || wanted === "failed") && step.percent !== 100) {
        mismatches.push(`${planIndex}: a closed step must be pinned at 100, got ${step.percent}`);
      }
    });
    equal("(5) every row's status follows the plan", mismatches, []);

    // The view the route would serialize must satisfy the projection's OWN wire schema.
    const viewSchema = host.registrations[0]?.wire?.viewSchema;
    check("(5) the projection supplied a wire schema", typeof viewSchema?.parse === "function", "no viewSchema");
    if (typeof viewSchema?.parse === "function") {
      let accepted = false;
      try {
        accepted = viewSchema.parse(realComposed) === realComposed;
      } catch (error) {
        failures.push(`(5) the real composed view failed the wire schema: ${error.message}`);
      }
      check("(5) the real composed view passes the wire schema", accepted, "schema rejected the real view");
    }

    console.log(
      `(5) real plan: ${found.sessionId} — ${realPlan.steps.length} step(s), phase "${realPlan.phase}", ` +
        `stepIndex ${realPlan.stepIndex}, mtime ${after.mtimeMs}`,
    );
  }
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const total = passed + failures.length;
if (failures.length === 0) {
  console.log(`probe-route: PASS ${passed}/${total} assertions`);
  console.log("  composeView idempotent / ETag + 304 / every status branch over real HTTP");
  console.log("  + lib wiring: one shared prefix seat, disposed / real .pae plan agrees, file untouched");
  process.exit(0);
}

console.error(`probe-route: FAIL ${failures.length}/${total} assertions`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(1);
