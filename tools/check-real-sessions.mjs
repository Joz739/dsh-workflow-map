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
// Exit 0 = every session folds; 1 = some session threw (session id and error are listed).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";

import { buildView, createInitialState, foldEvent } from "../src/fold.mjs";

const ROOT = process.argv[2] ?? join(homedir(), ".dsh", "sessions");
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/**
 * Decompress a concatenation of independent zstd frames — the session log's own on-disk format.
 * Node's zstd helpers stop after the first frame, so the frames are located by magic number and
 * decoded one by one; a candidate boundary that does not decode is merged into the next attempt
 * (a magic number can occur inside compressed bytes).
 */
function decompressFrames(buf) {
  const offsets = [];
  for (let i = buf.indexOf(MAGIC, 0); i !== -1; i = buf.indexOf(MAGIC, i + 4)) offsets.push(i);
  if (offsets.length === 0) return zstdDecompressSync(buf);
  const parts = [];
  let start = 0;
  while (start < offsets.length) {
    let end = start + 1;
    let out = null;
    for (; end <= offsets.length; end += 1) {
      const sliceEnd = end === offsets.length ? buf.length : offsets[end];
      try {
        out = zstdDecompressSync(buf.subarray(offsets[start], sliceEnd));
        break;
      } catch {
        out = null;
      }
    }
    if (out === null) throw new Error(`unreadable zstd frame at byte ${offsets[start]}`);
    parts.push(out);
    start = end;
  }
  return Buffer.concat(parts);
}

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
const totals = { events: 0, nodes: 0, injects: 0 };
let sessions = 0;
let slowest = { session: "", ms: 0 };

for (const { session, dir } of sessionDirs(ROOT)) {
  let events;
  try {
    const text = decompressFrames(readFileSync(join(dir, "session.v4.jsonl.zstd"))).toString("utf8");
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
  } catch (error) {
    failures.push({ session, detail: `${error.name}: ${error.message}` });
  }
}

for (const failure of failures) console.log(`FAIL ${failure.session}  ${failure.detail}`);
console.log(
  `\nsessions: ${sessions}  ok: ${sessions - failures.length}  failed: ${failures.length}` +
    `  events: ${totals.events}  nodes: ${totals.nodes}  inject rows: ${totals.injects}` +
    (slowest.session === "" ? "" : `  slowest: ${slowest.session.slice(-12)}=${slowest.ms.toFixed(0)}ms`),
);
console.log(`root: ${ROOT}`);
process.exitCode = failures.length === 0 ? 0 : 1;
