#!/usr/bin/env node
// tools/report-defect-samples.mjs — print the RAW SAMPLES a human must eyeball for the three
// defects this round claims to have fixed, and grade them against the step's own criteria.
//
//   node tools\report-defect-samples.mjs                      # grade the working tree's fold.mjs
//   node tools\report-defect-samples.mjs --module <fold.mjs>  # grade ANOTHER copy (A/B baseline)
//   node tools\report-defect-samples.mjs --tag before         # name the evidence files
//   node tools\report-defect-samples.mjs --sessions <root>    # fold a different session store
//
// WHAT IT IS FOR. Step 11 of this round is the part machines cannot finish alone: three defects
// are claimed gone, and the claim has to be shown on REAL, FINISHED session logs, per step, with
// the numbers printed instead of summarised. Every number below is read from disk; none is typed.
//
// THE THREE ITEMS, AND WHAT EACH ONE ACTUALLY COMPARES:
//   ①  a step's `percent` must never be the session's GLOBAL completion ratio (done rows / all
//      rows). The judge is a PAIR: (percent equal to the global rate) **and** (percentSource
//      saying "todos"). A percent that happens to equal the rate with source `model` or `baseline`
//      is a coincidence, not the defect — which is exactly why the criterion is not "percent == rate"
//      on its own. It also reports whether the literal source name `todos` occurs ANYWHERE, because
//      a deleted branch that still leaves the name in the vocabulary is a half-fix.
//   ②  a session whose last `turn/end` was `aborted` must have NO running step left:
//      `steps.filter(status === "running").length === 0` and `counts.running === 0`.
//   ③  the "0 nodes although it really executed" pattern: a step with `nodeCount === 0` WHILE
//      another single step owns 100% of the session's nodes. Both halves are required — an empty
//      step alone is not a defect (a window that genuinely covered no tool call is honest).
//
// WHY IT TAKES `--module`. The before/after comparison in the step's acceptance rule must run THE
// SAME JUDGE on the OLD source, or the pair proves nothing: a checker that only ever sees the new
// fold cannot distinguish "fixed" from "never looked". `git show HEAD:src/fold.mjs > <tmp>` gives
// the baseline copy; this tool folds the same logs with it and prints the same lines.
//
// THE RIGHT-HAND SIDES COME FROM THE LOG, NOT FROM THE VIEW. The turn reason and the "did the
// session finish" question are read from the parsed events directly (`turn/end` / `turn/start`),
// so a fold that mis-reads a turn cannot also certify itself. The global rate is recomputed from
// `view.todos` by this tool's own `globalRate`, in the exact form the deleted branch used.
//
// READ-ONLY: opens no log for writing, changes no plugin state. Exit 0 = ① and ② hold and ③ shows
// no 100%-ownership pattern; 1 otherwise (each failing sample printed).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

import { decompressFrames } from "./lib-zstd-frames.mjs";

// --------------------------------------------------------------------------- argv
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const at = argv.indexOf(`--${name}`);
  return at !== -1 && argv[at + 1] ? argv[at + 1] : fallback;
};
const MODULE = path.resolve(arg("module", path.join(import.meta.dirname, "..", "src", "fold.mjs")));
const TAG = arg("tag", "now");
const OUT_DIR = path.resolve(arg("out", path.join(import.meta.dirname, "..", "evidence", "verify")));
const ROOT = path.resolve(arg("sessions", path.join(process.env.USERPROFILE || "", ".dsh", "sessions")));

// The ONE decoder for a session log's frame layout (tools/lib-zstd-frames.mjs) — never a second copy.
const frames = (buf) => decompressFrames(buf).toString("utf8");

const fold = await import(pathToFileURL(MODULE).href);
const { createInitialState, foldEvent, buildView } = fold;
for (const [name, fn] of Object.entries({ createInitialState, foldEvent, buildView })) {
  if (typeof fn !== "function") {
    console.error(`module ${MODULE} does not export ${name} — cannot grade with it`);
    process.exit(2);
  }
}
const moduleSha = crypto.createHash("sha256").update(fs.readFileSync(MODULE)).digest("hex");
const moduleLines = fs.readFileSync(MODULE, "utf8").split("\n").length;

/** The session's global completion ratio, in the exact form the deleted branch used. */
function globalRate(todos) {
  const total = todos.length;
  const done = todos.filter((item) => item.status === "completed").length;
  if (total === 0 || done === 0) return null;
  return Math.min(99, Math.round((done / total) * 100));
}

// --------------------------------------------------------------------------- collect logs
const files = [];
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === "session.v4.jsonl.zstd") files.push(full);
  }
})(ROOT);
files.sort();

/**
 * Fold one log and ALSO read its turn facts straight out of the events.
 * `turnActive` here is this tool's own reading of the raw stream, not the fold's — the point is
 * that a session declared finished below is finished according to the log.
 */
function load(file) {
  const buffer = fs.readFileSync(file);
  const sessionId = path.basename(path.dirname(file));
  if (buffer.length === 0) return { file, sessionId, empty: true };
  const result = { file, sessionId, empty: false, events: 0, turnEnds: [], turnActive: false, lastType: "", foldError: null };
  // Every event's TYPE and seq, kept for the window analysis below. The raw stream is the second
  // opinion on which stretches of the log a step's window really covered.
  const events2 = [];
  let state = createInitialState();
  for (const line of frames(buffer).split("\n")) {
    if (line.trim() === "") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    result.events += 1;
    events2.push({ type: typeof event.type === "string" ? event.type : "", seq: event.seq });
    const type = typeof event.type === "string" ? event.type : "";
    result.lastType = type;
    if (type === "turn/start") result.turnActive = true;
    if (type === "turn/end") {
      result.turnActive = false;
      const reason = event.data && event.data.reason ? event.data.reason : null;
      result.turnEnds.push({
        kind: reason && typeof reason.kind === "string" ? reason.kind : null,
        raw: reason === null ? null : JSON.stringify(reason).slice(0, 240),
      });
    }
    try {
      state = foldEvent(state, event);
    } catch (error) {
      result.foldError = String(error && error.message);
      break;
    }
  }
  result.state = state;
  result.events2 = events2;
  result.view = result.foldError ? null : buildView(state, state.asOf);
  return result;
}

const loaded = files.map(load);
const sessions = loaded.filter((row) => !row.empty && !row.foldError);
const broken = loaded
  .filter((row) => !row.empty && row.foldError)
  .map((row) => `${row.sessionId}: fold threw — ${row.foldError}`);

// --------------------------------------------------------------------------- item ①
const sourceNames = new Map();
const defects1 = [];
const coincidences = [];
for (const row of sessions) {
  const rate = globalRate(row.view.todos);
  const done = row.view.todos.filter((item) => item.status === "completed").length;
  for (const step of row.view.steps) {
    sourceNames.set(step.percentSource, (sourceNames.get(step.percentSource) || 0) + 1);
    if (step.status === "closed") continue;
    if (step.percent === null) continue;
    if (rate === null) continue;
    if (step.percent !== rate) continue;
    const record = {
      sessionId: row.sessionId.slice(0, 21),
      title: step.title,
      status: step.status,
      percent: step.percent,
      percentSource: step.percentSource,
      nodeCount: step.nodeCount,
      globalRate: rate,
      todosDone: done,
      todosTotal: row.view.todos.length,
    };
    if (step.percentSource === "todos") defects1.push(record);
    else coincidences.push(record);
  }
}

// The three finished sessions to print step by step (item ① asks for exactly three).
const finished = sessions.filter((row) => !row.turnActive && row.lastType === "turn/end" && row.view.steps.length > 0);
const finishedSorted = [...finished].sort((a, b) => b.view.steps.length - a.view.steps.length);
const sample1 = finishedSorted.slice(0, 3);
const abortedLastEnd = sessions.filter(
  (row) => row.turnEnds.length > 0 && row.turnEnds[row.turnEnds.length - 1].kind === "aborted",
);
// A session whose log stops WHILE a turn is open has not finished: its last `turn/start` has no
// `turn/end` after it. The criterion ② question is about FINISHED sessions (the step file says
// "已结束"), and a still-open turn legitimately owns a running step. Those are MEASURED separately
// rather than silently dropped, so a reader can see how many were set aside and why.
const abortedOpen = abortedLastEnd.filter((row) => row.turnActive);
const abortedAll = abortedLastEnd.filter((row) => !row.turnActive);
const abortedVisible = abortedAll.filter((row) => row.view.steps.length > 0);
const defects2 = [];
const item2Rows = [];
for (const row of abortedAll) {
  const runningSteps = row.view.steps.filter((step) => step.status === "running");
  const record = {
    sessionId: row.sessionId.slice(0, 21),
    turnEndReason: row.turnEnds[row.turnEnds.length - 1].raw,
    abortedCount: row.turnEnds.filter((item) => item.kind === "aborted").length,
    lastEventType: row.lastType,
    steps: row.view.steps.length,
    runningFromSteps: runningSteps.length,
    runningFromCounts: row.view.counts.running,
    viewRunning: row.view.running,
    statuses: row.view.steps.map((step) => ({ title: step.title, status: step.status, nodeCount: step.nodeCount })),
  };
  item2Rows.push(record);
  if (record.runningFromSteps !== 0 || record.runningFromCounts !== 0) defects2.push(record);
}
const item2Excluded = abortedOpen.map((row) => ({
  sessionId: row.sessionId.slice(0, 21),
  lastEventType: row.lastType,
  lastTurnEndReason: row.turnEnds.length ? row.turnEnds[row.turnEnds.length - 1].raw : null,
  runningFromSteps: row.view.steps.filter((step) => step.status === "running").length,
  why: "log ends inside an open turn (last event is not turn/end) — not a finished session",
}));

// --------------------------------------------------------------------------- item ③
const byNodes = [...sessions].sort((a, b) => (b.view.counts.nodes - a.view.counts.nodes) || (b.events - a.events));
const sample3 = byNodes.slice(0, 2);
const defects3 = [];
let sessionsWithEmptyStepWhileSomeStepOwnsEverything = 0;
/**
 * WHERE THE EMPTY STEP'S WINDOW SITS — the question the criterion actually turns on.
 *
 * The criterion is "a step owns 0 nodes WHILE another step owns 100% of them". That sentence has
 * two ways of being true, and only one of them is a defect:
 *
 *   never-opened  the step's `windowStart` is null. The row arrived already closed (the table said
 *                 `completed` when the fold first saw it) or never got marked `in_progress` at all,
 *                 so NO interval was ever opened for it. There is no stretch of the log it could
 *                 have covered, and owning nothing is the honest result, not a leak.
 *   opened        `windowStart` was set (the row really was the live one), so the window DID claim
 *                 a stretch of seqs. If that stretch contained `tool/call` events and the step still
 *                 owns 0 nodes, attribution is leaking — this is the defect.
 *
 * `eventsInWindow` is counted from the raw event stream, not from the fold, so the two sides of the
 * comparison come from different sources.
 */
function windowKind(stateStep, viewStep, events, lastSeq) {
  if (!stateStep) return "missing";
  const start = stateStep.windowStart === null || stateStep.windowStart === undefined ? null : stateStep.windowStart;
  const end = stateStep.windowEnd === null || stateStep.windowEnd === undefined ? lastSeq : stateStep.windowEnd;
  if (start === null) {
    return `never-opened:${viewStep.status}`;
  }
  const covered = events.filter((event) => typeof event.seq === "number" && event.seq >= start && event.seq <= end);
  const calls = covered.filter((event) => event.type === "tool/call").length;
  return `opened:${viewStep.status}:${calls === 0 ? "no-tool-calls" : `${calls}-tool-calls`}`;
}
for (const row of sessions) {
  const total = row.view.counts.nodes;
  if (total === 0) continue;
  const owners = row.view.steps.filter((step) => step.nodeCount === total);
  if (owners.length === 0) continue;
  const empty = row.view.steps.filter((step) => step.nodeCount === 0);
  if (empty.length === 0) continue;
  sessionsWithEmptyStepWhileSomeStepOwnsEverything += 1;
  const maxSeq = row.events2 && row.events2.length ? row.events2[row.events2.length - 1].seq : null;
  const emptyDetail = empty.map((step) => {
    const stateStep = row.state && Array.isArray(row.state.steps) ? row.state.steps.find((item) => item.index === step.index) : null;
    return {
      title: step.title,
      status: step.status,
      windowStart: stateStep ? stateStep.windowStart ?? null : null,
      windowEnd: stateStep ? stateStep.windowEnd ?? null : null,
      kind: windowKind(stateStep, step, row.events2 || [], maxSeq),
    };
  });
  const kinds = {};
  for (const item of emptyDetail) kinds[item.kind] = (kinds[item.kind] || 0) + 1;
  const leaking = emptyDetail.filter((item) => item.kind.startsWith("opened"));
  defects3.push({
    sessionId: row.sessionId.slice(0, 21),
    totalNodes: total,
    unassignedNodes: row.view.unassigned ? row.view.unassigned.nodes : null,
    owners: owners.map((step) => step.title),
    emptySteps: empty.map((step) => step.title),
    emptyDetail,
    kinds,
    leakingEmptySteps: leaking.length,
  });
}
const emptyKindTotals = {};
for (const row of defects3) for (const [kind, count] of Object.entries(row.kinds)) emptyKindTotals[kind] = (emptyKindTotals[kind] || 0) + count;
const item3Rows = sample3.map((row) => ({
  sessionId: row.sessionId.slice(0, 21),
  events: row.events,
  steps: row.view.steps.length,
  totalNodes: row.view.counts.nodes,
  unassignedNodes: row.view.unassigned ? row.view.unassigned.nodes : null,
  unassignedSinceSeq: row.view.unassigned ? row.view.unassigned.sinceSeq : null,
  perStep: row.view.steps.map((step) => {
    const stateStep = row.state && Array.isArray(row.state.steps) ? row.state.steps.find((item) => item.index === step.index) : null;
    return {
      title: step.title,
      status: step.status,
      nodeCount: step.nodeCount,
      windowStart: stateStep ? stateStep.windowStart ?? null : null,
      windowEnd: stateStep ? stateStep.windowEnd ?? null : null,
    };
  }),
  ownersOfEverything: row.view.steps.filter((step) => step.nodeCount === row.view.counts.nodes).map((step) => step.title),
  emptySteps: row.view.steps.filter((step) => step.nodeCount === 0).map((step) => step.title),
}));

// --------------------------------------------------------------------------- verdicts
const criterion1 = defects1.length === 0;
const criterion2 = defects2.length === 0;
// Criterion ③ is judged on the EMPTY STEPS, not on the count of sessions that happen to contain
// the combination. Two shapes are self-explaining and only one is a leak:
//   never-opened:*         the window never opened, so it covered no stretch of the log;
//   opened:*:no-tool-calls the window opened over a stretch that contains no tool/call event.
// Anything else — `opened:*:N-tool-calls` or `missing` — is a step that had work in its window and
// still owns 0 nodes, which is exactly "0 节点但实际执行过".
const leakingEmptySteps = defects3.reduce((sum, row) => sum + row.leakingEmptySteps, 0);
const unexplainedEmptySteps = defects3.reduce(
  (sum, row) =>
    sum +
    row.emptyDetail.filter((item) => item.kind.startsWith("opened") && !item.kind.endsWith(":no-tool-calls")).length,
  0,
);
const criterion3 = unexplainedEmptySteps === 0;
const ok = criterion1 && criterion2 && criterion3 && broken.length === 0;

const report = {
  generatedAt: new Date().toISOString(),
  tag: TAG,
  module: { path: MODULE, sha256: moduleSha, lines: moduleLines, stateVersion: fold.STATE_VERSION ?? null },
  sessionsRoot: ROOT,
  sessions: { files: files.length, folded: sessions.length, empty: files.length - sessions.length - broken.length, foldErrors: broken.length },
  turns: {
    byKind: [...sessions.flatMap((row) => row.turnEnds.map((item) => item.kind))].reduce((map, kind) => {
      map[kind || "(none)"] = (map[kind || "(none)"] || 0) + 1;
      return map;
    }, {}),
  },
  item1: {
    criterion: "no step with percent === globalRate AND percentSource === 'todos'",
    pass: criterion1,
    percentSourceVocabulary: [...sourceNames.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    todosSourcePresent: sourceNames.has("todos"),
    samples: sample1.map((row) => ({
      sessionId: row.sessionId.slice(0, 21),
      events: row.events,
      globalRate: globalRate(row.view.todos),
      todosDone: row.view.todos.filter((item) => item.status === "completed").length,
      todosTotal: row.view.todos.length,
      steps: row.view.steps.map((step) => ({
        title: step.title,
        status: step.status,
        percent: step.percent,
        percentSource: step.percentSource,
        nodeCount: step.nodeCount,
      })),
    })),
    defects: defects1,
    coincidences,
  },
  item2: {
    criterion: "aborted sessions: running steps == 0 and counts.running == 0",
    pass: criterion2,
    abortedSessions: abortedAll.length,
    abortedWithSteps: abortedVisible.length,
    // Sessions whose log stops inside an OPEN turn are listed, not graded: a running step is correct
    // for them, and grading them would fail a criterion that was never asked of a live session.
    excludedOpenTurn: item2Excluded,
    defects: defects2,
    samples: item2Rows,
  },
  item3: {
    criterion: "no session where a step has nodeCount 0 while another step owns 100% of nodes",
    pass: criterion3,
    // The one shape that is really "0 nodes although it executed": a window that covered tool calls
    // and still owns nothing. Counted separately from the sessions that merely contain the pattern.
    unexplainedEmptySteps,
    ranked: sessions.map((row) => ({ sessionId: row.sessionId.slice(0, 21), nodes: row.view.counts.nodes, events: row.events })).slice(0, 5),
    samples: item3Rows,
    // Where each empty step's window sits. `never-opened` rows own nothing HONESTLY: their interval
    // began and ended at the same instant (created already closed by the table), so there was no
    // stretch of the log they could have covered. `opened` rows are the ones that look like a leak.
    emptyKindTotals,
    defects: defects3,
    sessionsWithThePattern: sessionsWithEmptyStepWhileSomeStepOwnsEverything,
  },
  foldErrors: broken,
  ok,
};

const jsonPath = path.join(OUT_DIR, `defect-samples-${TAG}.json`);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

// --------------------------------------------------------------------------- print
const pad = (value, width) => String(value).padEnd(width);
const out = [];
out.push(`MODULE ${MODULE}`);
out.push(`  sha256 ${moduleSha}`);
out.push(`  lines ${moduleLines}   STATE_VERSION ${report.module.stateVersion}`);
out.push(`SESSIONS ${ROOT}`);
out.push(`  log files ${report.sessions.files}  folded ${report.sessions.folded}  empty ${report.sessions.empty}  fold errors ${report.sessions.foldErrors}`);
out.push(`  turn/end kinds ${JSON.stringify(report.turns.byKind)}`);
out.push("");
out.push(`① STEP PERCENT vs SESSION GLOBAL RATE — ${criterion1 ? "PASS" : "FAIL"}`);
out.push(`  percentSource vocabulary: ${report.item1.percentSourceVocabulary.map((row) => `${row.name}=${row.count}`).join("  ")}`);
out.push(`  literal "todos" still produced as a source: ${report.item1.todosSourcePresent ? "YES" : "NO"}`);
out.push(`  defects (percent == rate AND source == todos): ${defects1.length}`);
out.push(`  numeric coincidences with a explaining source: ${coincidences.length}`);
for (const row of coincidences.slice(0, 5)) {
  out.push(`    . ${row.sessionId} "${row.title.slice(0, 28)}" ${row.percent}% source=${row.percentSource} (rate ${row.globalRate}% = ${row.todosDone}/${row.todosTotal})`);
}
for (const row of sample1) {
  const rate = globalRate(row.view.todos);
  const done = row.view.todos.filter((item) => item.status === "completed").length;
  out.push(`  SAMPLE ${row.sessionId.slice(0, 21)}  global ${rate === null ? "n/a" : `${rate}%`} (${done}/${row.view.todos.length})  events ${row.events}`);
  for (const step of row.view.steps) {
    out.push(`    ${pad(step.status, 8)} ${pad(step.percent === null ? "-" : `${step.percent}%`, 5)} src=${pad(step.percentSource, 9)} nodes=${pad(step.nodeCount, 4)} ${step.title.slice(0, 60)}`);
  }
}
if (defects1.length) for (const row of defects1) out.push(`  !! ${row.sessionId} "${row.title.slice(0, 30)}" ${row.percent}% == ${row.globalRate}% source=${row.percentSource}`);
out.push("");
out.push(`② ABORTED SESSIONS — ${criterion2 ? "PASS" : "FAIL"}`);
out.push(`  aborted last turn: ${abortedAll.length}  (of which have steps: ${abortedVisible.length})  set aside as still-open: ${item2Excluded.length}`);
for (const row of item2Rows) {
  out.push(`  SAMPLE ${row.sessionId}  reason ${row.turnEndReason}  steps ${row.steps}  running ${row.runningFromSteps}/${row.runningFromCounts}  view.running ${row.viewRunning}`);
  out.push(`    statuses ${row.statuses.map((step) => `${step.status}:${step.nodeCount}`).join(" ")}`);
}
if (defects2.length) for (const row of defects2) out.push(`  !! ${row.sessionId} running ${row.runningFromSteps} (counts ${row.runningFromCounts})`);
out.push("");
out.push(`③ EMPTY STEP WHILE ONE STEP OWNS ALL NODES — ${criterion3 ? "PASS" : "FAIL"}`);
out.push(`  sessions with the pattern: ${sessionsWithEmptyStepWhileSomeStepOwnsEverything}`);
out.push(`  empty-step window kinds: ${Object.entries(emptyKindTotals).map(([kind, count]) => `${kind}=${count}`).join("  ") || "(none)"}`);
for (const row of item3Rows) {
  out.push(`  SAMPLE ${row.sessionId}  events ${row.events}  steps ${row.steps}  nodes ${row.totalNodes}  unassigned ${row.unassignedNodes} since ${row.unassignedSinceSeq}`);
  out.push(`    per-step ${row.perStep.map((step) => `${step.nodeCount}:${step.status}:${step.title.slice(0, 22)}`).join(" | ")}`);
  out.push(`    owners-of-everything ${row.ownersOfEverything.length ? row.ownersOfEverything.join(" / ") : "(none)"}   empty ${row.emptySteps.length ? row.emptySteps.length : 0}`);
}
if (defects3.length) for (const row of defects3) out.push(`  !! ${row.sessionId} ${row.totalNodes} nodes all in "${row.owners[0]}" while ${row.emptySteps.length} step(s) show 0`);
out.push("");
if (broken.length) {
  out.push(`FOLD ERRORS`);
  for (const row of broken) out.push(`  !! ${row}`);
}
out.push(`JSON ${jsonPath}`);
out.push(`VERDICT ${ok ? "PASS" : "FAIL"}  ① ${criterion1 ? "PASS" : "FAIL"}  ② ${criterion2 ? "PASS" : "FAIL"}  ③ ${criterion3 ? "PASS" : "FAIL"}`);

const textPath = path.join(OUT_DIR, `defect-samples-${TAG}.txt`);
fs.writeFileSync(textPath, out.join("\n"));
console.log(out.join("\n"));
console.log(`TEXT ${textPath}`);
process.exit(ok ? 0 : 1);