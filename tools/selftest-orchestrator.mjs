#!/usr/bin/env node
// dsh-workflow-map — step-03 self-test for the PAE plan reader (src/orchestrator.mjs).
//
//   node tools\selftest-orchestrator.mjs            # real .pae data + synthetic fixtures
//   node tools\selftest-orchestrator.mjs <root>     # root = the workspace holding `.pae`
//   node tools\selftest-orchestrator.mjs --no-real  # synthetic fixtures only
//
// What is asserted, in the order the step asks for it:
//   (A) path resolution: both inputs required, one path segment, no traversal.
//   (B) a REAL current plan: readable, 1-based ordinals, statuses/reports/anchors, frozen, and
//       the second read is a cache HIT (one stat, one read for two calls).
//   (C) a REAL historical plan (a different file) reads the same way.
//   (D) a REAL planning-phase document (no `plan` yet) is still renderable.
//   (E) missing file / directory-instead-of-file: null, one deduped error line, never throws.
//   (F) corrupt JSON: null + PARSE_FAILED, and a repaired file is picked up again; BOM tolerated.
//   (G) missing / damaged fields degrade one field at a time and never shift an ordinal.
//   (H) cache invalidation: changed size and changed mtime are both noticed.
//   (I) READ ONLY: the real plan file's mtime/size are unchanged after every read above.
//   (J) through lib/index.js: init(header) captures the identity, the wire view carries the plan,
//       the view schema accepts it (and rejects a shifted plan ordinal), a cold state read keeps
//       the identity, and a headerless state yields plan === null.
//   (K) the merge rules: plan task/title/status on a todo-derived view, PAE-derived status kept,
//       counts recomputed, inputs never mutated.
//
// Exit code 0 = every assertion passed. Real data is REQUIRED by default: this test is the
// evidence that the reader matches what PAE actually writes, so silently skipping it would make
// the whole file green while proving nothing. `--no-real` is for a machine without `.pae`.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_PLAN_STEPS,
  PLAN_FILE,
  PLAN_ROOT,
  PLAN_VERSION,
  applyPlanToView,
  createPlanReader,
  normalizePlanDocument,
  planFilePath,
} from "../src/orchestrator.mjs";
import { STATE_VERSION, buildView, createInitialState, foldEvent } from "../src/fold.mjs";
import { apply as applyHost } from "../lib/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, "..");
const WANT_REAL = !process.argv.includes("--no-real");
const ARG_ROOT = process.argv.slice(2).find((value) => !value.startsWith("--")) ?? "";

let passed = 0;
const failures = [];
const skips = [];

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
// locating real `.pae` data
// ---------------------------------------------------------------------------

function childDirectories(target) {
  try {
    return fs
      .readdirSync(target, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith("."))
      .slice(0, 200)
      .map((entry) => path.join(target, entry.name));
  } catch {
    return [];
  }
}

/** Real plans on disk: one row per `session-<id>/orchestrator.json`, newest first. */
function listRealSessions(paeRoot) {
  let entries;
  try {
    entries = fs.readdirSync(paeRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(paeRoot, entry.name, PLAN_FILE);
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    let document = null;
    try {
      document = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      document = null;
    }
    sessions.push({ id: entry.name, file, mtimeMs: stat.mtimeMs, size: stat.size, document });
  }
  sessions.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return sessions;
}

/**
 * Find the workspace root that owns a `.pae` directory. The explicit argument wins; otherwise
 * walk up from the cwd and from this file, and look one level down at each ancestor (the plugin
 * lives in a SIBLING directory of the workspace, so "up" alone never reaches `.pae`).
 */
function findRealData() {
  const candidates = new Set();
  const add = (value) => {
    if (value !== "") candidates.add(path.resolve(value));
  };

  if (ARG_ROOT !== "") {
    add(ARG_ROOT);
    add(path.join(ARG_ROOT, PLAN_ROOT));
  }
  for (const base of [process.cwd(), PLUGIN_ROOT]) {
    let dir = path.resolve(base);
    for (let depth = 0; depth < 7; depth += 1) {
      add(path.join(dir, PLAN_ROOT));
      add(path.join(dir, "default-workspace", PLAN_ROOT));
      for (const child of childDirectories(dir)) {
        add(path.join(child, PLAN_ROOT));
        add(path.join(child, "default-workspace", PLAN_ROOT));
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  for (const candidate of candidates) {
    const sessions = listRealSessions(candidate);
    if (sessions.length > 0) {
      return { paeRoot: candidate, workspaceRoot: path.dirname(candidate), sessions };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// (A) path resolution
// ---------------------------------------------------------------------------

equal(
  "(A) the plan path",
  planFilePath({ cwd: "C:\\work", sessionId: "session-x" }),
  path.join("C:\\work", PLAN_ROOT, "session-x", PLAN_FILE),
);
equal("(A) a missing cwd cannot name a path", planFilePath({ sessionId: "session-x" }), null);
equal("(A) a missing session id cannot name a path", planFilePath({ cwd: "C:\\work" }), null);
equal("(A) no input at all", planFilePath({}), null);
equal("(A) a non-record input", planFilePath(null), null);
equal("(A) '..' is refused", planFilePath({ cwd: "C:\\work", sessionId: ".." }), null);
equal("(A) a nested id is refused", planFilePath({ cwd: "C:\\work", sessionId: "a/b" }), null);
equal("(A) a Windows separator is refused", planFilePath({ cwd: "C:\\work", sessionId: "a\\b" }), null);
equal("(A) a drive letter is refused", planFilePath({ cwd: "C:\\work", sessionId: "C:\\x" }), null);

// ---------------------------------------------------------------------------
// temp fixtures (everything the test writes lives here, never under the real `.pae`)
// ---------------------------------------------------------------------------

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-map-plan-"));

function writePlan(segments, content) {
  const dir = path.join(TMP, ...segments.slice(0, -1));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, segments.at(-1));
  fs.writeFileSync(file, content);
  return file;
}

/** `<tmp>/<bucket>/.pae/<sessionId>/orchestrator.json` */
function fixturePlan(bucket, sessionId, document) {
  return writePlan([bucket, PLAN_ROOT, sessionId, PLAN_FILE], typeof document === "string" ? document : JSON.stringify(document));
}

// ---------------------------------------------------------------------------
// (E) missing file and a directory where the file should be
// ---------------------------------------------------------------------------

const absent = createPlanReader({ cwd: path.join(TMP, "nowhere"), sessionId: "session-absent" });
equal("(E) a missing file reads as null", absent.read(), null);
check("(E) it is logged as ENOENT once", absent.errors().length === 1 && absent.errors()[0].code === "ENOENT", JSON.stringify(absent.errors()));
equal("(E) a repeated miss stays one line", absent.read(), null);
check("(E) the log is deduped", absent.errors().length === 1, JSON.stringify(absent.errors()));
check("(E) the counters saw two stats and two misses", absent.stats().stat === 2 && absent.stats().miss === 2, JSON.stringify(absent.stats()));

const asDirectory = path.join(TMP, "as-dir", PLAN_ROOT, "session-dir", PLAN_FILE);
fs.mkdirSync(asDirectory, { recursive: true });
const directoryReader = createPlanReader({ cwd: path.join(TMP, "as-dir"), sessionId: "session-dir" });
equal("(E) a directory instead of a file reads as null", directoryReader.read(), null);
check("(E) it is labelled ENOTFILE", directoryReader.errors().some((entry) => entry.code === "ENOTFILE"), JSON.stringify(directoryReader.errors()));

// ---------------------------------------------------------------------------
// (F) corrupt JSON, a repaired file, and a BOM
// ---------------------------------------------------------------------------

const brokenFile = fixturePlan("broken", "session-broken", "{ this is not json ");
const brokenReader = createPlanReader({ cwd: path.join(TMP, "broken"), sessionId: "session-broken" });
equal("(F) corrupt JSON reads as null", brokenReader.read(), null);
check("(F) the failure is PARSE_FAILED", brokenReader.errors().some((entry) => entry.code === "PARSE_FAILED"), JSON.stringify(brokenReader.errors()));

fs.writeFileSync(brokenFile, JSON.stringify({ phase: "executing", task: "修好了", plan: { steps: [{ title: "步骤一", file: "s.md" }] } }));
const repaired = brokenReader.read();
check("(F) a repaired file is picked up", repaired !== null && repaired.steps.length === 1, JSON.stringify(repaired));
equal("(F) the repaired title", repaired === null ? null : repaired.steps[0].title, "步骤一");

fixturePlan("bom", "session-bom", `\uFEFF${JSON.stringify({ phase: "planning", task: "带 BOM" })}`);
const bomReader = createPlanReader({ cwd: path.join(TMP, "bom"), sessionId: "session-bom" });
equal("(F) a leading BOM is tolerated", bomReader.read() === null ? null : bomReader.read().phase, "planning");

// ---------------------------------------------------------------------------
// (G) missing / damaged fields
// ---------------------------------------------------------------------------

const damaged = normalizePlanDocument(
  {
    plan: {
      steps: [null, { title: 7 }, { title: "ok", file: "a.md", requiresConfirmation: true }],
      summary: 42,
    },
    statuses: { 1: "completed", x: "y", 0: "pending" },
    anchorSeqs: { 1: 5, a: "b", 2: null },
    stepReports: [null, { stepIndex: 0 }, { stepIndex: 2, status: "success", artifacts: ["p"], summary: "s", exit_code: 0 }],
    skipped: [2, 2, 0, "x"],
  },
  { asOfMtime: 123, sourcePath: "C:\\tmp\\plan.json" },
);

equal("(G) damaged rows keep their ordinal", damaged.steps.map((step) => step.index), [1, 2, 3]);
equal("(G) damaged titles degrade to empty", damaged.steps.map((step) => step.title), ["", "", "ok"]);
equal("(G) requiresConfirmation is only true when it is literally true", damaged.steps.map((step) => step.requiresConfirmation), [false, false, true]);
equal("(G) statuses keep only 1-based ordinals", damaged.statuses, { 1: "completed" });
equal("(G) anchorSeqs drop non-numbers", damaged.anchorSeqs, { 1: 5 });
equal("(G) stepReports drop unusable rows", damaged.stepReports.length, 1);
equal("(G) the surviving report keeps its exit code", damaged.stepReports[0].exitCode, 0);
equal("(G) skipped is deduped and sorted", damaged.skipped, [2]);
equal("(G) a non-string summary is empty", damaged.summary, "");
equal("(G) a non-string task is empty", [damaged.task, damaged.taskTitle], ["", ""]);
equal("(G) asOfMtime and sourcePath come from the reader", [damaged.asOfMtime, damaged.sourcePath], [123, "C:\\tmp\\plan.json"]);
equal("(G) stepIndex is null when absent", damaged.stepIndex, null);

for (const garbage of [null, 42, "text", [], {}, { plan: "nope" }, { statuses: [] }, { steps: "x" }]) {
  const value = normalizePlanDocument(garbage, {});
  check(
    `(G) garbage ${JSON.stringify(garbage)} is renderable`,
    value !== null &&
      typeof value === "object" &&
      Array.isArray(value.steps) &&
      Array.isArray(value.stepReports) &&
      Array.isArray(value.skipped) &&
      typeof value.statuses === "object" &&
      typeof value.anchorSeqs === "object" &&
      value.ver === PLAN_VERSION,
  );
}

const capped = normalizePlanDocument(
  { plan: { steps: Array.from({ length: MAX_PLAN_STEPS + 25 }, (_value, position) => ({ title: `s${position + 1}` })) } },
  {},
);
equal("(G) the step list is capped", capped.steps.length, MAX_PLAN_STEPS);

const longTask = normalizePlanDocument({ task: `${"甲".repeat(600)}\n第二行` }, {});
check("(G) the task title is bounded", longTask.taskTitle.length <= 400, String(longTask.taskTitle.length));
check("(G) the task title is the first line", !longTask.taskTitle.includes("第二行"), longTask.taskTitle);

// ---------------------------------------------------------------------------
// (H) cache invalidation
// ---------------------------------------------------------------------------

writePlan(["cache", PLAN_ROOT, "session-cache", PLAN_FILE], JSON.stringify({ phase: "aa" }));
const cacheReader = createPlanReader({ cwd: path.join(TMP, "cache"), sessionId: "session-cache" });
const first = cacheReader.read();
equal("(H) first read", first === null ? null : first.phase, "aa");
const second = cacheReader.read();
check("(H) the second read is a cache hit", cacheReader.stats().hit === 1 && cacheReader.stats().read === 1, JSON.stringify(cacheReader.stats()));
check("(H) the hit returns the identical object", second === first);

const cacheFile = path.join(TMP, "cache", PLAN_ROOT, "session-cache", PLAN_FILE);
fs.writeFileSync(cacheFile, JSON.stringify({ phase: "bb" }));
const sameSize = fs.statSync(cacheFile).size === Buffer.byteLength(JSON.stringify({ phase: "aa" }));
const later = new Date(Date.now() + 5000);
fs.utimesSync(cacheFile, later, later);
const third = cacheReader.read();
equal("(H) an mtime-only change is noticed (same size)", third === null ? null : third.phase, "bb");
check("(H) that re-read went to disk", cacheReader.stats().read === 2, JSON.stringify(cacheReader.stats()));
check("(H) the fixture sizes really matched", sameSize);

// ---------------------------------------------------------------------------
// readers must never throw on junk options
// ---------------------------------------------------------------------------

for (const options of [undefined, null, 42, "", [], { cwd: 5 }, { cwd: "", sessionId: null }]) {
  const reader = createPlanReader(options);
  check(`(E) createPlanReader(${JSON.stringify(options)}) has no path`, reader.path === null);
  equal(`(E) createPlanReader(${JSON.stringify(options)}).read()`, reader.read(), null);
  equal(`(E) createPlanReader(${JSON.stringify(options)}).errors()`, reader.errors(), []);
}

// ---------------------------------------------------------------------------
// real data: (B) current plan, (C) historical plan, (D) planning-phase document
// ---------------------------------------------------------------------------

const real = findRealData();
if (real === null) {
  if (WANT_REAL) {
    failures.push("real `.pae` data was not found; pass the workspace root as the first argument (or use --no-real)");
  } else {
    skips.push("real .pae data (--no-real)");
  }
} else {
  const withSteps = real.sessions.filter((session) => session.document !== null && Array.isArray(session.document.plan?.steps) && session.document.plan.steps.length > 0);
  const current = withSteps.find((session) => session.document?.phase === "executing") ?? withSteps[0] ?? null;
  const historical = withSteps.find((session) => session !== current) ?? null;
  const planning = real.sessions.find((session) => session.document !== null && !Array.isArray(session.document.plan?.steps)) ?? null;

  check("(B) the current session's plan file exists", current !== null, JSON.stringify(real.sessions.map((session) => session.id)));
  check("(C) a historical plan file exists", historical !== null);

  if (current !== null) {
    const before = fs.statSync(current.file);
    const reader = createPlanReader({ cwd: real.workspaceRoot, sessionId: current.id });
    equal("(B) the reader resolves the real file", path.resolve(reader.path ?? ""), path.resolve(current.file));

    const plan = reader.read();
    check("(B) the current plan is an object", plan !== null && typeof plan === "object");
    check("(B) it declares PLAN_VERSION", plan !== null && plan.ver === PLAN_VERSION);
    check("(B) it has steps", plan !== null && plan.steps.length > 0);
    check("(B) the steps are 1-based and contiguous", plan !== null && plan.steps.every((step, position) => step.index === position + 1));
    check("(B) every step has a title", plan !== null && plan.steps.every((step) => typeof step.title === "string"));
    check("(B) stepIndex is inside the plan", plan !== null && (plan.stepIndex === null || plan.stepIndex <= plan.steps.length));
    check("(B) the phase is a non-empty string", plan !== null && typeof plan.phase === "string" && plan.phase !== "");
    check("(B) the task title is the plan's own first line", plan !== null && plan.taskTitle !== "" && plan.taskTitle.length <= 400);
    check("(B) the full task contains the title", plan !== null && plan.task.includes(plan.taskTitle), plan === null ? "no plan" : plan.taskTitle);
    check(
      "(B) statuses use PAE's vocabulary",
      plan !== null && Object.values(plan.statuses).every((value) => value === "completed" || value === "in_progress"),
      plan === null ? "no plan" : JSON.stringify(plan.statuses),
    );
    check(
      "(B) report statuses use PAE's vocabulary",
      plan !== null && plan.stepReports.every((report) => report.status === "success" || report.status === "failed"),
      plan === null ? "no plan" : JSON.stringify(plan.stepReports.map((report) => report.status)),
    );
    const anchors = plan === null ? [] : Object.values(plan.anchorSeqs);
    check("(B) anchors are positive and ascending", anchors.length > 0 && anchors.every((value, position) => value > 0 && (position === 0 || value > anchors[position - 1])), JSON.stringify(anchors));
    check("(B) every anchor key is one of the plan's ordinals", plan !== null && Object.keys(plan.anchorSeqs).every((key) => plan.steps.some((step) => String(step.index) === key)), plan === null ? "no plan" : JSON.stringify(Object.keys(plan.anchorSeqs)));
    check("(B) asOfMtime is the file's own mtime", plan !== null && plan.asOfMtime === current.mtimeMs, plan === null ? "no plan" : `${plan.asOfMtime} vs ${current.mtimeMs}`);
    equal("(B) sourcePath is the real file", plan === null ? null : path.resolve(plan.sourcePath), path.resolve(current.file));
    check("(B) the plan is deep-frozen", plan !== null && Object.isFrozen(plan) && Object.isFrozen(plan.steps) && Object.isFrozen(plan.steps[0]));
    equal("(B) the plan survives a JSON round trip", plan === null ? null : JSON.parse(JSON.stringify(plan)), plan);

    const cached = reader.read();
    check("(B) the second read is a cache hit", reader.stats().hit === 1 && reader.stats().read === 1, JSON.stringify(reader.stats()));
    check("(B) the hit returns the identical object", cached === plan);

    if (historical !== null) {
      const historicalPlan = createPlanReader({ cwd: real.workspaceRoot, sessionId: historical.id }).read();
      check("(C) the historical plan is an object", historicalPlan !== null);
      check("(C) it has steps", historicalPlan !== null && historicalPlan.steps.length > 0);
      check("(C) it is a different file", historicalPlan !== null && plan !== null && path.resolve(historicalPlan.sourcePath) !== path.resolve(plan.sourcePath));
      check("(C) its phase is readable", historicalPlan !== null && typeof historicalPlan.phase === "string" && historicalPlan.phase !== "");
      check("(C) its statuses are readable", historicalPlan !== null && Object.keys(historicalPlan.statuses).length > 0);
    }
    if (planning !== null) {
      const planningPlan = createPlanReader({ cwd: real.workspaceRoot, sessionId: planning.id }).read();
      check("(D) a planning-phase document is still an object", planningPlan !== null);
      equal("(D) it has no steps yet", planningPlan === null ? null : planningPlan.steps.length, 0);
      equal("(D) it has no reports yet", planningPlan === null ? null : planningPlan.stepReports.length, 0);
      check("(D) its phase is readable", planningPlan !== null && typeof planningPlan.phase === "string" && planningPlan.phase !== "");
      check("(D) it has no task title yet or a readable one", planningPlan !== null && typeof planningPlan.taskTitle === "string");
    } else {
      skips.push("a planning-phase real document");
    }

    // -------------------------------------------------------------------------
    // (J) through the host half: identity → wire view → schema → cold read
    // -------------------------------------------------------------------------

    const registrations = [];
    applyHost({
      sessionProjections: {
        register(options) {
          registrations.push(options);
          return () => {};
        },
      },
    });
    equal("(J) exactly one projection is registered", registrations.length, 1);
    const projection = registrations[0] ?? {};
    equal("(J) the stateVersion is the fold's", projection.stateVersion, STATE_VERSION);

    const state = typeof projection.init === "function" ? projection.init({ id: current.id, cwd: real.workspaceRoot }) : {};
    equal("(J) init captures the session identity", [state.sessionId, state.cwd], [current.id, real.workspaceRoot]);
    const view = typeof projection.wire?.view === "function" ? projection.wire.view(state) : {};
    check("(J) the wire view carries the plan", view.plan !== null && view.plan !== undefined && plan !== null && view.plan.steps.length === plan.steps.length);
    equal("(J) the view's task is the plan's first line", view.task, plan === null ? null : plan.taskTitle);
    check("(J) the view schema accepts the view", projection.wire.viewSchema.parse(view) === view);
    const viewAgain = projection.wire.view(state);
    check("(J) the plan section is cached across views (same object)", viewAgain.plan === view.plan);
    check("(J) the two views are otherwise independent objects", viewAgain !== view);

    const coldState = projection.stateSchema.parse(JSON.parse(JSON.stringify(state)));
    equal("(J) a cold state read keeps the identity", [coldState.sessionId, coldState.cwd], [current.id, real.workspaceRoot]);
    equal("(J) a cold state read yields the same plan", projection.wire.view(coldState).plan, view.plan);

    const shifted = JSON.parse(JSON.stringify(view));
    if (shifted.plan !== null && shifted.plan.steps.length > 1) shifted.plan.steps[1].index = 9;
    let rejectedShift = false;
    try {
      projection.wire.viewSchema.parse(shifted);
    } catch {
      rejectedShift = true;
    }
    check("(J) viewSchema rejects a shifted plan ordinal", rejectedShift);

    const headerless = typeof projection.init === "function" ? projection.init() : {};
    equal("(J) no header → no identity", [headerless.sessionId, headerless.cwd], ["", ""]);
    equal("(J) no header → no plan", projection.wire.view(headerless).plan, null);
    // PAE builds its plan dir from `header.cwd ?? process.cwd()`; the host half mirrors that
    // exact rule, or a session without a header cwd would silently lose its plan.
    const noCwd = typeof projection.init === "function" ? projection.init({ id: "session-no-cwd" }) : {};
    equal("(J) a session without a header cwd falls back to the host cwd", noCwd.cwd, process.cwd());
    equal("(J) that fallback still names the session", noCwd.sessionId, "session-no-cwd");
    equal("(J) and that session has no plan on this host", projection.wire.view(noCwd).plan, null);

    // -------------------------------------------------------------------------
    // (I) READ ONLY: the file is byte-identical in mtime and size after everything
    // -------------------------------------------------------------------------

    const after = fs.statSync(current.file);
    equal("(I) the plan file's mtime is untouched", after.mtimeMs, before.mtimeMs);
    equal("(I) the plan file's size is untouched", after.size, before.size);
    equal("(I) the plan file still parses", typeof JSON.parse(fs.readFileSync(current.file, "utf8")), "object");
  } else {
    skips.push("the current plan assertions (no usable real document)");
  }
}

// ---------------------------------------------------------------------------
// (K) the merge rules, against a real todo-derived fold
// ---------------------------------------------------------------------------

const T0 = 1792000000000;
let folded = createInitialState();
for (const event of [
  { type: "user/message", seq: 1, time: T0 + 1000, data: { content: [{ type: "text", text: "合并自检" }], source: { kind: "user" } } },
  { type: "todo/write", seq: 2, time: T0 + 2000, data: { todos: [{ content: "甲", status: "in_progress" }, { content: "乙", status: "pending" }] } },
]) {
  folded = foldEvent(folded, event);
}
const bare = buildView(folded, folded.asOf);
equal("(K) the todo fallback has two rows", bare.steps.length, 2);
equal("(K) the todo fallback titles", bare.steps.map((step) => step.title), ["甲", "乙"]);
check("(K) the todo fallback has no plan", bare.plan === undefined);

const syntheticPlan = normalizePlanDocument(
  {
    phase: "executing",
    task: "总任务首行\n第二行（同一任务的续行）",
    stepIndex: 2,
    statuses: { 1: "completed" },
    plan: { steps: [{ title: "甲（计划）", file: "a.md" }, { title: "乙（计划）", file: "b.md", requiresConfirmation: true }] },
  },
  { asOfMtime: 1, sourcePath: "C:\\tmp\\plan.json" },
);
equal("(K) the plan's task title is its first line", syntheticPlan.taskTitle, "总任务首行");
equal("(K) the plan's full task keeps both lines", syntheticPlan.task, "总任务首行 第二行（同一任务的续行）");

const merged = applyPlanToView(bare, syntheticPlan);
equal("(K) the view's task comes from the plan", merged.task, "总任务首行");
equal("(K) titles come from the plan", merged.steps.map((step) => step.title), ["甲（计划）", "乙（计划）"]);
equal("(K) a todo row adopts the plan's status", merged.steps[0].status, "done");
equal("(K) a closed row with no report pins 100", merged.steps[0].percent, 100);
equal("(K) planIndex is bound on both rows", merged.steps.map((step) => step.planIndex), [1, 2]);
equal("(K) counts are recomputed", [merged.counts.steps, merged.counts.running, merged.counts.completed], [2, 0, 1]);
equal("(K) the input view is untouched", bare.steps.map((step) => step.title), ["甲", "乙"]);
check("(K) the frozen plan is not mutated", syntheticPlan.statuses["1"] === "completed" && Object.isFrozen(syntheticPlan.statuses));

const paeRow = { ...bare, steps: [{ ...bare.steps[0], source: "pae", status: "running", planIndex: 1, percent: null }], counts: { ...bare.counts, steps: 1, running: 1, completed: 0 } };
const kept = applyPlanToView(paeRow, syntheticPlan);
equal("(K) a PAE-derived row keeps its event status", kept.steps[0].status, "running");
equal("(K) but still takes the plan's title", kept.steps[0].title, "甲（计划）");

const noPlan = applyPlanToView(bare, null);
equal("(K) a null plan sets plan === null", noPlan.plan, null);
equal("(K) a null plan leaves the fold's task alone", noPlan.task, bare.task);
equal("(K) a null plan leaves the steps alone", noPlan.steps, bare.steps);

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

fs.rmSync(TMP, { recursive: true, force: true });

const total = passed + failures.length;
for (const skip of skips) {
  console.log(`SKIP  ${skip}`);
}
if (failures.length === 0) {
  console.log(`selftest-orchestrator: PASS ${passed}/${total} assertions`);
  console.log("  path guards / real plans (current + historical + planning) / mtime+size cache");
  console.log("  + missing & corrupt files / field-by-field repair / host wire integration / merge rules");
  process.exit(0);
}
console.error(`selftest-orchestrator: FAIL ${failures.length}/${total} assertions`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(1);
