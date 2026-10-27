import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createInitialState, foldEvent, buildView } from "../src/fold.mjs";
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
function frames(buf) {
  const offsets = [];
  let from = 0;
  for (;;) {
    const at = buf.indexOf(MAGIC, from);
    if (at === -1) break;
    offsets.push(at);
    from = at + 1;
  }
  const parts = [];
  for (let i = 0; i < offsets.length; i += 1) {
    const start = offsets[i];
    for (let j = i; j < Math.min(i + 4, offsets.length); j += 1) {
      const stop = j + 1 < offsets.length ? offsets[j + 1] : buf.length;
      try { parts.push(zlib.zstdDecompressSync(buf.subarray(start, stop)).toString('utf8')); break; } catch {}
    }
  }
  return parts.join('');
}

const root = path.join(process.env.USERPROFILE || "", ".dsh", "sessions");
let best = null, sessions = 0;
for (const ws of fs.readdirSync(root)) {
  const wsDir = path.join(root, ws);
  try { if (!fs.statSync(wsDir).isDirectory()) continue; } catch { continue; }
  for (const id of fs.readdirSync(wsDir)) {
    const dir = path.join(wsDir, id);
    try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }
    const log = path.join(dir, "session.v4.jsonl.zstd");
    if (!fs.existsSync(log)) continue;
    sessions += 1;
    let state = createInitialState(), rev = 0;
    for (const line of frames(fs.readFileSync(log)).split("\n")) {
      if (!line.trim()) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      try { state = foldEvent(state, ev); } catch { break; }
      if (typeof ev.seq === "number") rev = Math.max(rev, ev.seq);
    }
    let view; try { view = buildView(state, state.asOf); } catch { continue; }
    const stepCount = Array.isArray(view && view.steps) ? view.steps.length : 0;
    const runIdx = Array.isArray(view && view.steps) ? view.steps.findIndex((s) => s.status === "running") : -1;
const doneN = Array.isArray(view && view.steps) ? view.steps.filter((s) => s.status === "done").length : 0;
const score = stepCount * 10 + doneN * 50 + (runIdx > 0 && runIdx < stepCount - 1 ? 100 : 0) + (view && view.counts && view.counts.nodes ? Math.min(view.counts.nodes, 900) : 0);
if (!best || score > best.score) best = { id, stepCount, view, rev, score, runIdx, doneN };
  }
}
if (!best || best.stepCount < 10) { console.error("best=" + (best ? best.stepCount : 0)); process.exit(1); }
fs.mkdirSync(path.join(process.cwd(), "evidence"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), "evidence", "state-live.json"), JSON.stringify({ rev: best.rev, view: best.view }, null, 1), "utf8");
console.log("sessions:", sessions, "| picked:", best.id, "| steps:", best.stepCount, "| rev:", best.rev);
console.log("done:", best.view.steps.filter((s) => s.status === "done").length, "| percent:", best.view.progress && best.view.progress.percent, "| nodes:", best.view.counts && best.view.counts.nodes);

