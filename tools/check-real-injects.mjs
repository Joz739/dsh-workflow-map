// Real-log verification of the additions: fold a REAL session log and show
// (a) the hot-inject history, (b) the "needs confirm" derivation.
// Read-only: it never writes to .dsh and never touches the plugin's state.
import fs from "node:fs";
import path from "node:path";
import { decompressFrames } from "./lib-zstd-frames.mjs";
import { createInitialState, foldEvent, buildView } from "../src/fold.mjs";

/** Fold one multi-frame zstd log into text — the ONE decoder (tools/lib-zstd-frames.mjs). */
const frames = (buf) => decompressFrames(buf).toString("utf8");
const root = path.join(process.env.USERPROFILE || "", ".dsh", "sessions");
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === "session.v4.jsonl.zstd") files.push(full);
  }
})(root);
files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

let checked = 0;
let injectSessions = 0;
let approvalSessions = 0;
let failures = 0;

for (const file of files) {
  const sessionId = path.basename(path.dirname(file));
  let state = createInitialState();
  let events = 0;
  for (const line of frames(fs.readFileSync(file)).split("\n")) {
    if (line.trim() === "") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    events += 1;
    try {
      state = foldEvent(state, event);
    } catch (error) {
      failures += 1;
      console.log(`FOLD THREW ${sessionId} seq=${event.seq} ${event.type}: ${error.message}`);
      break;
    }
  }
  if (events === 0) continue;
  checked += 1;

  let view;
  try {
    view = buildView(state, state.asOf);
  } catch (error) {
    failures += 1;
    console.log(`VIEW THREW ${sessionId}: ${error.message}`);
    continue;
  }

  const injects = Array.isArray(view.injects) ? view.injects : [];
  const confirm = view.steps.filter((step) => Array.isArray(step.pendingConfirm) && step.pendingConfirm.length > 0);
  if (injects.length > 0) {
    injectSessions += 1;
    console.log(`\n=== ${sessionId} — ${injects.length} hot-inject row(s) ===`);
    for (const row of injects) {
      console.log(`  ${row.pickedUp ? "picked " : "pending"}  ${new Date(row.at).toISOString()}  ${String(row.text).slice(0, 48)}`);
    }
  }
  if (confirm.length > 0) {
    approvalSessions += 1;
    console.log(`  【需确认】 ${sessionId}: ` + confirm.map((s) => `#${s.index + 1}(${s.pendingConfirm.map((r) => r.kind).join("+")})`).join(" "));
  }
 // JSON round trip: the view travels through a snapshot.
  try {
    JSON.parse(JSON.stringify(view));
  } catch {
    failures += 1;
    console.log(`VIEW NOT JSON ${sessionId}`);
  }
}

console.log(`\nsessions folded: ${checked}  with hot-inject rows: ${injectSessions}  with open confirm: ${approvalSessions}  failures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
