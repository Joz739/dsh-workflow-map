import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createInitialState, foldEvent, buildView } from "../src/fold.mjs";

// Fold every session; pick the one with the MOST steps (>= 15), snapshot { view, rev }.
const root = path.join(process.env.USERPROFILE || "", ".dsh", "sessions");
let best = null;
let sessions = 0;
for (const ws of fs.readdirSync(root)) {
  const wsDir = path.join(root, ws);
  if (!fs.statSync(wsDir).isDirectory()) continue;
  for (const id of fs.readdirSync(wsDir)) {
    const dir = path.join(wsDir, id);
    if (!fs.statSync(dir).isDirectory()) continue;
    const log = path.join(dir, "session.v4.jsonl.zstd");
    if (!fs.existsSync(log)) continue;
    sessions += 1;
    let state = createInitialState();
    let rev = 0;
    try {
      const raw = zlib.zstdDecompressSync(fs.readFileSync(log));
      const text = raw.toString("utf8");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        state = foldEvent(state, ev);
        if (typeof ev.seq === "number") rev = Math.max(rev, ev.seq);
      }
    } catch { continue; }
    const view = buildView(state, state.asOf);
    const stepCount = Array.isArray(view?.steps) ? view.steps.length : 0;
    if (!best || stepCount > best.stepCount) {
      best = { id, stepCount, view, rev };
    }
  }
}
if (!best || best.stepCount < 15) {
  console.error("no session with >= 15 steps found (best=" + (best ? best.stepCount : 0) + ")");
  process.exit(1);
}
fs.mkdirSync(path.join(process.cwd(), "evidence"), { recursive: true });
fs.writeFileSync(
  path.join(process.cwd(), "evidence", "state-live.json"),
  JSON.stringify({ rev: best.rev, view: best.view }, null, 1),
  "utf8"
);
console.log("sessions scanned:", sessions);
console.log("picked:", best.id, "steps:", best.stepCount, "rev:", best.rev);
console.log("done steps:", best.view.steps.filter((s) => s.status === "done").length);
console.log("percent:", best.view.progress?.percent, "counts.nodes:", best.view.counts?.nodes);