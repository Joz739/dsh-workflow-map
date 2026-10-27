#!/usr/bin/env node
// dsh-workflow-map — self-test for the HOST HALF (lib/index.js).
//
// node tools\selftest-host.mjs
//
// tools/selftest-fold.mjs proves the fold; this file proves the REGISTRATION around it,
// without a live host: a fake `ctx` captures what `apply` hands the projection registry,
// and the captured options are then exercised the way the registry exercises them
// (init → apply per event → wire.view → viewSchema.parse; stateSchema.parse on restore).
//
// What is asserted:
// 1. apply registers exactly one projection, under `workflowView`, at STATE_VERSION.
// 2. init is the fold's own empty state (no clock, no host input needed).
// 3. registry.apply(state, event) IS foldEvent — same result as calling the module directly.
// 4. wire.view(state) IS buildView(state, state.asOf): no host-only extras, and the view
// passes its own schema.
// 5. viewSchema is a real tripwire: it rejects a deliberately broken view.
// 6. stateSchema never throws on garbage and repairs instead of resetting, and a well-formed
// state survives it byte-identically (that is what a cold read does).
// 7. a host without the sessionProjections service fails the mount loudly — it does NOT
// register nothing silently.
// 8. apply attaches exactly one HTTP route : the `/dsh-workflow` prefix seat,
// SHARED across repeated applies (the real server throws on a duplicate path), and its
// disposer really removes it.
//
// Exit code 0 = every assertion passed.

import { apply, inject, name, packageName, PROJECTION_KEY, routeInfo, selfCheck } from "../lib/index.js";
import { SCHEMA_VERSION, STATE_VERSION, buildView, createInitialState, foldEvent } from "../src/fold.mjs";

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
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
// comparison helpers
// ---------------------------------------------------------------------------

/** Key-order-insensitive JSON: two equal states must compare equal even if a repair rebuilt
 * their property order (the repair builds a fixed order on purpose). */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}
// ---------------------------------------------------------------------------
// a host that records the registration
// ---------------------------------------------------------------------------

/**
 * A host that records everything this row registers: the projection (captured below), the HTTP
 * route, and the effect disposers cordis would own. `webServer.register` throws on a duplicate
 * (kind, path) exactly like the real dsh-host-webserver does, so the idempotency assertion is a
 * real one and not a formality.
 */
const registrations = [];
const routes = new Map();
const routeLog = [];
const webServer = {
  register(route) {
    const key = `${route.kind} ${route.path}`;
    if (routes.has(key)) throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`);
    routes.set(key, route);
    routeLog.push(route);
    return () => {
      routes.delete(key);
    };
  },
};

const effects = [];
const ctx = {
  sessionProjections: {
    register(options) {
      registrations.push(options);
      return () => {};
    },
  },
 // A session store the route can look up in; no session is live in this offline test.
  sessions: { get: () => undefined },
  webServer,
  effect(execute) {
    const dispose = execute();
    if (typeof dispose === "function") effects.push(dispose);
    return dispose;
  },
};

apply(ctx);
equal("(1) exactly one projection is registered", registrations.length, 1);
const projection = registrations[0] || {};
equal("(1) the projection key", projection.key, PROJECTION_KEY);
equal("(1) the key is the one the browser half will use", PROJECTION_KEY, "workflowView");
equal("(1) the stateVersion is the fold's", projection.stateVersion, STATE_VERSION);
check("(1) a stateSchema was supplied", typeof projection.stateSchema?.parse === "function", "missing stateSchema.parse");
check("(1) a wire block with viewSchema + view", typeof projection.wire?.viewSchema?.parse === "function" && typeof projection.wire?.view === "function", "missing wire pieces");
equal("(1) the package identity", [name, packageName], ["workflow-map", "dsh-workflow-map"]);
equal("(1) inject declares the registry, the session store, the web server and the agent registry", inject, [
  "sessionProjections",
  "sessions",
  "webServer",
  "agents",
]);
check("(1) selfCheck lists the registration", selfCheck.registrations.some((row) => row.endsWith(PROJECTION_KEY)), JSON.stringify(selfCheck.registrations));

// (1b) the HTTP view route.
equal("(1) exactly one HTTP route is attached", routeLog.length, 1);
const attachedRoute = routeLog[0] || {};
equal("(1) the seat is the /dsh-workflow prefix", [attachedRoute.kind, attachedRoute.path], ["prefix", "/dsh-workflow"]);
check("(1) the route has a handler", typeof attachedRoute.handler === "function", "missing handler");
check(
  "(1) selfCheck names the route path under that prefix",
  typeof selfCheck.httpRoute === "string" && selfCheck.httpRoute.startsWith("/dsh-workflow/"),
  selfCheck.httpRoute,
);
check(
  "(1) selfCheck lists the route",
  selfCheck.registrations.includes(`httpRoute:${selfCheck.httpRoute}`),
  JSON.stringify(selfCheck.registrations),
);

// ---------------------------------------------------------------------------
// (2) init
// ---------------------------------------------------------------------------

const initial = projection.init();
equal("(2) init is the fold's empty state", initial, createInitialState());

// (2b) the session identity the plan reader needs. This file has no filesystem access of its
// own; it only records WHERE the plan would be (and mirrors PAE's `header.cwd ?? process.cwd`).
const withHeader = projection.init({ id: "session-x", cwd: "C:\\repo" });
equal("(2) init records the session identity", [withHeader.sessionId, withHeader.cwd], ["session-x", "C:\\repo"]);
const withoutCwd = projection.init({ id: "session-y" });
equal("(2) a header without cwd falls back to the host cwd", withoutCwd.cwd, process.cwd());

// ---------------------------------------------------------------------------
// (3)+(4) fold through the registry, then build the wire view
// ---------------------------------------------------------------------------

const T0 = 1792000000000;
const events = [
  { type: "user/message", seq: 1, time: T0 + 1000, data: { content: [{ type: "text", text: "宿主半自检" }], source: { kind: "user" }, role: "user" } },
  { type: "todo/write", seq: 2, time: T0 + 2000, data: { todos: [{ content: "甲", status: "in_progress" }, { content: "乙", status: "pending" }] } },
  { type: "tool/call", seq: 3, time: T0 + 3000, data: { turn: 1, step: 1, callId: "h1", name: "read", arguments: JSON.stringify({ path: "C:\\repo\\a.js" }) } },
  { type: "tool/result", seq: 4, time: T0 + 4000, data: { turn: 1, step: 1, message: { role: "tool", toolCallId: "h1", content: [{ type: "text", text: "ok" }] } } },
  { type: "stepProgress/report", seq: 5, time: T0 + 5000, data: { percent: 60, note: "六成" } },
];

let state = projection.init();
for (const event of events) state = projection.apply(state, event);

let direct = createInitialState();
for (const event of events) direct = foldEvent(direct, event);
equal("(3) registry.apply is the fold itself", JSON.stringify(state), JSON.stringify(direct));

const view = projection.wire.view(state);
// From the wire view is `buildView(...)` PLUS the `plan` section, which is read from
// `.pae/<sessionId>/orchestrator.json` on the wire. Everything except that one key must still
// be the fold's own output — that is what keeps "tested" and "shipped" identical.
const planless = { ...view };
delete planless.plan;
equal("(4) wire.view is buildView(state, state.asOf) plus the plan section", JSON.stringify(planless), JSON.stringify(buildView(direct, direct.asOf)));
equal("(4) a headerless state carries no plan", view.plan, null);
equal("(4) the view declares the schema version", view.ver, SCHEMA_VERSION);
check("(4) the view passes its own schema", projection.wire.viewSchema.parse(view) === view, "viewSchema rejected its own view");
equal("(4) the view carries the folded percent", view.steps[0].percent, 60);
equal("(4) the view's active node is the latest one", view.activeNode?.title, "进度自报 60%");

// The view must be lossless JSON: it travels through the session snapshot.
equal("(4) the wire view survives a JSON round trip", JSON.parse(JSON.stringify(view)), view);

// ---------------------------------------------------------------------------
// (5) the view schema is a tripwire, not a rubber stamp
// ---------------------------------------------------------------------------

function rejects(label, mutate) {
  const broken = JSON.parse(JSON.stringify(view));
  mutate(broken);
  let threw = false;
  try {
    projection.wire.viewSchema.parse(broken);
  } catch {
    threw = true;
  }
  check(`(5) rejects ${label}`, threw, "the schema accepted a broken view");
}

rejects("a wrong ver", (value) => {
  value.ver = 99;
});
rejects("a step whose index is not its position", (value) => {
  value.steps[0].index = 7;
});
rejects("a percent above 100", (value) => {
  value.steps[0].percent = 140;
});
rejects("a node without stepIndex", (value) => {
  delete value.nodes[0].stepIndex;
});
rejects("counts that disagree with the arrays", (value) => {
  value.counts.nodes += 1;
});
rejects("an unknown step status", (value) => {
  value.steps[0].status = "exploded";
});

let threwOnNull = false;
try {
  projection.wire.viewSchema.parse(null);
} catch {
  threwOnNull = true;
}
check("(5) rejects a non-object", threwOnNull, "the schema accepted null");

// ---------------------------------------------------------------------------
// (6) the state schema repairs instead of throwing
// ---------------------------------------------------------------------------

const goodState = JSON.parse(JSON.stringify(state));
equal("(6) a well-formed state survives intact (key order aside)", canonical(projection.stateSchema.parse(goodState)), canonical(goodState));

// the open-turn flag must survive a checkpoint restore, and a damaged one must repair to
// a boolean rather than leaking "true"/1 into the view.
{
  const midTurn = JSON.parse(JSON.stringify(state));
  midTurn.turnActive = true;
  equal("(6) a checkpoint with an open turn restores it", projection.stateSchema.parse(midTurn).turnActive, true);
  const damaged = JSON.parse(JSON.stringify(state));
  damaged.turnActive = "yes";
  equal("(6) a damaged turn flag repairs to false", projection.stateSchema.parse(damaged).turnActive, false);
  equal("(6) a checkpoint without the field restores as closed", projection.stateSchema.parse(JSON.parse(JSON.stringify(state))).turnActive, false);
  equal("(6) the wire view exposes running", typeof projection.wire.view(state).running, "boolean");
}

// the inbox ledger and the revocation flag are part of the DURABLE state: a checkpoint must
// carry them through a restore, or a restarted host replays later splices against an empty ledger
// (every cancellation then answers "unknown") and a revoked row silently goes back to "awaiting pickup".
{
  const withLedger = JSON.parse(JSON.stringify(state));
  withLedger.inboxIds = { "next-turn": ["m-1"], "next-step": ["m-2", "m-3"] };
  withLedger.injects = [
    { id: "inj-9", at: 1792000000000, target: "next-step", text: "补一句", pickedUp: false, pickedUpAt: null, canceled: true, canceledAt: 1792000005000 },
  ];
  const restored = projection.stateSchema.parse(withLedger);
  equal("(6) the ledger survives a checkpoint restore", restored.inboxIds, { "next-turn": ["m-1"], "next-step": ["m-2", "m-3"] });
  equal("(6) a revoked row stays revoked", [restored.injects[0].canceled, restored.injects[0].canceledAt], [true, 1792000005000]);

  const damagedLedger = JSON.parse(JSON.stringify(state));
  damagedLedger.inboxIds = { "next-turn": [1, null, "ok"], "next-step": "not-a-list" };
  equal("(6) a damaged ledger repairs to string lists", projection.stateSchema.parse(damagedLedger).inboxIds, { "next-turn": ["ok"], "next-step": [] });
  const noLedger = JSON.parse(JSON.stringify(state));
  delete noLedger.inboxIds;
  equal("(6) a pre-ledger checkpoint restores as an empty ledger", projection.stateSchema.parse(noLedger).inboxIds, { "next-turn": [], "next-step": [] });
}

const garbage = [
  null,
  42,
  "nope",
  [],
  {},
  { steps: "not an array", nodes: { also: "wrong" } },
  { steps: [null, { index: 5, status: "exploded", nodeIds: "x", percent: 999 }], nodes: [null, { id: "" }, { id: "n1", stepIndex: "x" }] },
];
let repairedAll = true;
const repairedViews = [];
for (const value of garbage) {
  try {
    const repaired = projection.stateSchema.parse(value);
 // A repaired state must still be foldable and viewable — that is the whole point.
    const nextState = projection.apply(repaired, events[0]);
    repairedViews.push(projection.wire.view(nextState));
  } catch (error) {
    repairedAll = false;
    failures.push(`(6) stateSchema.parse threw on ${JSON.stringify(value)}: ${error.message}`);
  }
}
check("(6) garbage never throws on restore", repairedAll, "stateSchema.parse threw");
check("(6) every repaired state still produces a valid view", repairedViews.every((item) => Array.isArray(item.steps) && Array.isArray(item.nodes)), "a repaired view is malformed");

const damaged = projection.stateSchema.parse({ steps: [null], nodes: [null], asOf: -1, nextNodeId: -3 });
equal("(6) a damaged row degrades to a usable shape", [damaged.steps.length, damaged.nodes.length, damaged.asOf, damaged.nextNodeId], [1, 0, 0, 1]);

// ---------------------------------------------------------------------------
// (7) a host without the service fails loudly
// ---------------------------------------------------------------------------

function expectThrow(label, target) {
  let threw = false;
  try {
    apply(target);
  } catch {
    threw = true;
  }
  check(label, threw, "apply() returned without complaining");
}

expectThrow("(7) apply({}) throws", {});
expectThrow("(7) apply(ctx without sessionProjections) throws", { tools: {} });
expectThrow("(7) apply(ctx with a broken registry) throws", { sessionProjections: {} });

// ---------------------------------------------------------------------------
// (8) idempotent attach, shared seat, real disposal
// ---------------------------------------------------------------------------

apply(ctx);
equal("(8) a second apply does not add a second route", routeLog.length, 1);
check("(8) the second apply shares the same handler", routeLog[0]?.handler === attachedRoute.handler, "handler replaced");
equal("(8) both owners are counted", routeInfo().owners, 2);
equal("(8) one seat for one server", routeInfo().servers, 1);

for (const dispose of effects) dispose();
equal("(8) disposing every owner removes the route", routes.size, 0);
equal("(8) no owner remains", routeInfo().owners, 0);
equal("(8) no seat remains", routeInfo().servers, 0);
// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const total = passed + failures.length;
if (failures.length === 0) {
  console.log(`selftest-host: PASS ${passed}/${total} assertions`);
  console.log("  registration / init / registry-apply == fold / wire.view == buildView");
  console.log("  + viewSchema tripwire / stateSchema repair / loud failure without the service");
  console.log("  + one HTTP route per server (step-04): shared on re-apply, removed by its owners");
  process.exit(0);
}

console.error(`selftest-host: FAIL ${failures.length}/${total} assertions`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(1);
