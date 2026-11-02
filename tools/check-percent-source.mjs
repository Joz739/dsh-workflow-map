#!/usr/bin/env node
// tools/check-percent-source.mjs — read-only replay that enforces the step-03 acceptance rule:
//
//   a RUNNING step's `percent` must never be its session's global completion ratio.
//
// node tools\check-percent-source.mjs
//
// WHY THIS EXISTS. `percentFor` used to compute `done rows / all rows` from the whole todo table and
// hand that number to whichever step was running — a session-level total used as a step-level value.
// Deleting the two branches is easy; proving the phenomenon is gone on real logs is the point. The
// comparison is written from the SESSION's own table (`view.todos`), not from anything the fold
// publishes, so it cannot agree with the defect by construction.
//
// Read-only: opens nothing for writing, changes no plugin state. Exit 0 = the rule holds on every
// readable log; 1 = at least one running step still carries the global ratio (each printed).
//
// Last run (2026-11-01, before the fix): 167 logs, 38 running steps, 23 of them equal to their
// session's global ratio. After the fix the same command must report 0.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { decompressFrames } from "./lib-zstd-frames.mjs";
// An optional argv path runs the SAME rule against another copy of the fold (used as a negative
// control: `git show HEAD:src/fold.mjs > old.mjs` then `node tools\check-percent-source.mjs old.mjs`
// must FAIL, or the checker does not actually detect the defect it claims to).
const MODULE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(import.meta.dirname, "..", "src", "fold.mjs");
const { createInitialState, foldEvent, buildView } = await import(pathToFileURL(MODULE).href);

/** Fold one multi-frame zstd log into text — the ONE decoder (tools/lib-zstd-frames.mjs). */
const frames = (buf) => decompressFrames(buf).toString("utf8");
/** The session's global completion ratio, in the exact form the deleted branch used. */
function globalRate(todos) {
  const total = todos.length;
  const done = todos.filter((item) => item.status === "completed").length;
  if (total === 0 || done === 0) return null;
  return Math.min(99, Math.round((done / total) * 100));
}

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
let empty = 0;
let foldErrors = 0;
let runningSteps = 0;
let withNumber = 0;
let equalToGlobal = 0;
const bySource = new Map();
const offending = [];

for (const file of files) {
  const sessionId = path.basename(path.dirname(file)).slice(0, 21);
  const buffer = fs.readFileSync(file);
  if (buffer.length === 0) {
    empty += 1;
    continue;
  }
  let state = createInitialState();
  let failure = null;
  for (const line of frames(buffer).split("\n")) {
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
    offending.push(`fold threw in ${sessionId}: ${failure}`);
    continue;
  }
  scanned += 1;
  const view = buildView(state, state.asOf);
  const rate = globalRate(view.todos);
  for (const step of view.steps) {
    if (step.status !== "running") continue;
    runningSteps += 1;
    bySource.set(step.percentSource, (bySource.get(step.percentSource) || 0) + 1);
    if (step.percent === null) continue;
    withNumber += 1;
    if (rate !== null && step.percent === rate) {
      equalToGlobal += 1;
      offending.push(`${sessionId}: running step "${step.title.slice(0, 24)}" percent ${step.percent} == global ${rate} (source ${step.percentSource})`);
    }
  }
}

const ok = foldErrors === 0 && equalToGlobal === 0;

console.log(`\nsessions scanned        : ${files.length}`);
console.log(`sessions folded         : ${scanned}`);
console.log(`empty logs (skipped)    : ${empty}`);
console.log(`fold errors             : ${foldErrors}`);
console.log(`running steps           : ${runningSteps}`);
console.log(`  … carrying a number   : ${withNumber}`);
console.log(`  … source histogram    : ${JSON.stringify(Object.fromEntries([...bySource].sort()))}`);
console.log(`running steps whose percent EQUALS the session's global rate : ${equalToGlobal}`);
if (offending.length > 0) {
  console.log("\n--- evidence ---");
  for (const line of offending.slice(0, 20)) console.log(`  ${line}`);
  if (offending.length > 20) console.log(`  … ${offending.length - 20} more`);
}
console.log(
  ok
    ? "\nPERCENT-SOURCE PASS — no running step carries its session's completion ratio."
    : "\nPERCENT-SOURCE FAIL — see evidence above.",
);
process.exit(ok ? 0 : 1);
