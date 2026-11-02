// Real session-log replay - an end-to-end check for "does opening a session blow up" (regression tool for the 2026-10-26 incident).
//
// Incident: `foldInboxSpliced` called the undefined `inboxApplySplice` / `markInjectCanceled`; the host wrapped the
// projection's ReferenceError as `SESSION_QUERY_CORRUPT_SESSION`, so EVERY session showed "history failed to load".
// The unit tests did not cover that path; this tool uses real local logs (`~/.dsh/sessions/**/session.v4.jsonl.zstd`),
// decompresses every frame and folds the whole log, naming any session that throws.
//
// Usage:
// node tools/check-real-sessions.mjs                  # reads ~/.dsh/sessions
// node tools/check-real-sessions.mjs <sessions-root>  # use a different root
//
// Outcome is THREE-WAY, because two different things were being counted as one:
//   ok    - the log folded and the wire view built.
//   empty - the log file is 0 bytes. That is a SAMPLING artefact (a session that was opened and never
//           wrote an event), not a plugin defect; decompressing nothing cannot succeed, so calling it
//           "failed" reported the wrong thing and made the tool's exit code unusable as a gate.
//           Every empty log is still printed by name with its size and mtime - it is visible, not hidden.
//   failed - a NON-EMPTY log that would not decompress, would not parse as JSON, or that made `foldEvent`
//           or `buildView` throw. Only this class decides the exit code.
// Exit 0 = no real folding failure; 1 = at least one non-empty log failed (session id and error are listed).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { decompressFrames } from "./lib-zstd-frames.mjs";

import { buildView, createInitialState, foldEvent } from "../src/fold.mjs";

const ROOT = process.argv[2] ?? join(homedir(), ".dsh", "sessions");

/** Every stored session, deduplicated across workspace directories (`<workspace>/<session-id>/`). */
function sessionDirs(root) {
  const out = [];
  for (const workspace of readdirSync(root)) {
    const wsDir = join(root, workspace);
    if (!statSync(wsDir).isDirectory()) continue;
    for (const session of readdirSync(wsDir)) {
      const dir = join(wsDir, session);
      if (statSync(dir).isDirectory()) out.push({ session, dir });
    }
  }
  return out;
}

const failures = [];
const empties = [];
const totals = { events: 0, nodes: 0, injects: 0 };
let sessions = 0; // logs that carried events at all (ok + failed); empty files are counted apart
let ok = 0;
let slowest = { session: "", ms: 0 };

for (const { session, dir } of sessionDirs(ROOT)) {
  // 0 bytes = an EMPTY SAMPLE, not a folding failure. There is nothing to decompress, so reporting it as
  // "unreadable" attributed a sampling artefact to the plugin. It is counted apart and still printed by name.
  const logPath = join(dir, "session.v4.jsonl.zstd");
  const size = statSync(logPath).size;
  if (size === 0) {
    empties.push({ session, path: logPath, mtimeMs: statSync(logPath).mtimeMs });
    continue;
  }
  let events;
  try {
    const text = decompressFrames(readFileSync(logPath)).toString("utf8");
    events = text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line))
      .filter((row) => row.type !== "session");
  } catch (error) {
    failures.push({ session, detail: `log unreadable: ${error.message}` });
    continue;
  }
  sessions += 1;
  const startedAt = process.hrtime.bigint();
  try {
    let state = createInitialState();
    for (const event of events) state = foldEvent(state, event);
 // The wire view is where a broken projection really surfaces: build it, do not just fold.
    const view = buildView(state, state.asOf);
    totals.events += events.length;
    totals.nodes += view.nodes.length;
    totals.injects += view.injects ? view.injects.length : 0;
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (ms > slowest.ms) slowest = { session, ms };
    ok += 1;
  } catch (error) {
    failures.push({ session, detail: `${error.name}: ${error.message}` });
  }
}

for (const empty of empties) {
  const when = new Date(empty.mtimeMs).toISOString();
  console.log(`EMPTY ${empty.session}  0 bytes  mtime ${when}  ${empty.path}`);
}
for (const failure of failures) console.log(`FAIL ${failure.session}  ${failure.detail}`);
console.log(
  `\nsessions: ${sessions}  ok: ${ok}  empty: ${empties.length}  failed: ${failures.length}` +
    `  events: ${totals.events}  nodes: ${totals.nodes}  inject rows: ${totals.injects}` +
    (slowest.session === "" ? "" : `  slowest: ${slowest.session.slice(-12)}=${slowest.ms.toFixed(0)}ms`),
);
console.log(`logs on disk : ${sessions + empties.length}  (${sessions} carried events: ok ${ok} + failed ${failures.length}; ${empties.length} empty)`);
console.log(`root: ${ROOT}`);
// Only a real folding failure fails the gate. An empty log is reported loudly, never silently skipped.
process.exitCode = failures.length === 0 ? 0 : 1;
