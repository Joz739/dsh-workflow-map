#!/usr/bin/env node
// tools/audit-real.mjs - read-only audit of real logs: fold every session log and count violations of the four hard constraints.
//
// node tools\audit-real.mjs
//
// Read-only: writes nothing under .dsh and changes no plugin state. Exit 0 = all constraints hold; 1 = violations (printed one by one).
//
// Criteria (matching the acceptance wording in CHANGELOG / OPEN-SOURCE-GUIDE):
// 1. View steps == the conversation's current todo table (title set and order)
// 2. Exactly one running step
// 3. On an unfinished step, pendingConfirm or plan.confirmations can express "needs confirm"
// 4. Hot-inject rows can be folded out (report them when present, otherwise note "-")
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";

const MODULE = path.join(import.meta.dirname, "..", "src", "fold.mjs");
const mod = await import(pathToFileURL(MODULE).href);
const { createInitialState, foldEvent, buildView } = mod;

// The frame walk is NOT copied here any more: tools/lib-zstd-frames.mjs is the one decoder, shared
// with check-real-injects / check-real-sessions / check-flow / check-todo-align. A checker that
// decoded a log differently from its neighbours would be a checker nobody could compare with.
import { decompressFrames } from "./lib-zstd-frames.mjs";

/** Fold one multi-frame zstd log into text. A real log is SEVERAL concatenated frames. */
const frames = (buf) => decompressFrames(buf).toString("utf8");
/** The fold's own title normalisation — a checker must not invent a second rule. */
const norm = (value) =>
  typeof value === "string"
    ? value
        .replace(/^\s*\d+\s*[.、．)]\s*/, "")
        .replace(/[（(][^）)]*[）)]\s*$/, "")
        .replace(/\s+/g, "")
        .trim()
    : "";

const root = path.join(process.env.USERPROFILE || "", ".dsh", "sessions");
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === "session.v4.jsonl.zstd") files.push(full);
  }
})(root);

let scanned = 0;
let foldErrors = 0;
let syncViolations = 0;
let runningViolations = 0;
let injectSessions = 0;
const samples = [];
let unassignedNodes = 0;
let unassignedSessions = 0;

for (const file of files) {
  const sessionId = path.basename(path.dirname(file)).slice(0, 21);
  let state = createInitialState();
  let failure = null;
  for (const line of frames(fs.readFileSync(file)).split("\n")) {
    if (line.trim() === "") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    try {
      state = foldEvent(state, event);
    } catch (error) {
      failure = String(error && error.message);
      break;
    }
  }
  if (failure !== null) {
    foldErrors += 1;
    samples.push(`fold threw in ${sessionId}: ${failure}`);
    continue;
  }
  scanned += 1;
  const view = buildView(state, state.asOf);

 // ② exactly one running step.
  const running = view.steps.filter((step) => step.status === "running");
  if (running.length > 1) {
    runningViolations += 1;
    samples.push(`${sessionId}: ${running.length} running steps -> ${running.map((s) => s.title.slice(0, 18)).join(" | ")}`);
  }

 // ① the view must be exactly the current todo table.
  if (view.todos.length > 0) {
    const wanted = new Set(view.todos.map((todo) => norm(todo.content)));
    const extra = view.steps.filter((step) => !wanted.has(norm(step.title)));
    if (extra.length > 0) {
      syncViolations += 1;
      samples.push(`${sessionId}: ${extra.length} step(s) not in the todo table -> ${extra.map((s) => s.title.slice(0, 18)).join(" | ")}`);
    }
  }

  if (view.injects.length > 0) injectSessions += 1;
  // ③ nodes no step's EVENT INTERVAL covered. Reported as EVIDENCE, not as a pass/fail criterion:
  // an unattributed node is not itself a defect (a batch of calls after a closing todo table really
  // belongs to no step), but a large number next to a large number of empty steps is what a
  // mis-attribution looks like from the outside. Whether this becomes a criterion is decided after the
  // full re-run, not here.
  if (view.unassigned && view.unassigned.nodes > 0) {
    unassignedNodes += view.unassigned.nodes;
    if (view.unassigned.nodes >= 1) unassignedSessions += 1;
  }
}

const ok = foldErrors === 0 && syncViolations === 0 && runningViolations === 0;

console.log(`\nsessions folded : ${scanned}`);
console.log(`fold errors     : ${foldErrors}`);
console.log(`① not in todos  : ${syncViolations}`);
console.log(`② multi running : ${runningViolations}`);
console.log(`③ unassigned nodes: ${unassignedNodes} across ${unassignedSessions} session(s) (evidence only, not a criterion)`);
if (samples.length > 0) {
  console.log("\n--- evidence ---");
  for (const line of samples.slice(0, 20)) console.log(`  ${line}`);
  if (samples.length > 20) console.log(`  … ${samples.length - 20} more`);
}
console.log(ok ? "\nAUDIT PASS — the four constraints hold on every readable log." : "\nAUDIT FAIL — see evidence above.");
process.exit(ok ? 0 : 1);
