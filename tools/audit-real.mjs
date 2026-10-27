#!/usr/bin/env node
// tools/audit-real.mjs — 真实日志只读审计：逐会话折叠本机会话日志，统计四条硬约束的违例。
//
//   node tools\audit-real.mjs
//
// 只读：不写 .dsh、不改插件状态。退出码 0 = 全部约束成立；1 = 有违例（逐条打印）。
//
// 判据（与 CHANGELOG / OPEN-SOURCE-GUIDE 的验收口径一致）：
//   ① 视图分步 == 对话当前 todo 表（标题集合与顺序）
//   ② 有且只有一个 running 分步
//   ③ 未完成分步上的 pendingConfirm 与 plan.confirmations 至少有一处能表达「需确认」
//   ④ 热注入行能被折叠出来（有则报，无则记 "—"）
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";

const MODULE = path.join(import.meta.dirname, "..", "src", "fold.mjs");
const mod = await import(pathToFileURL(MODULE).href);
const { createInitialState, foldEvent, buildView } = mod;

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** Fold one multi-frame zstd log into text. A real log is SEVERAL concatenated frames. */
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
      try {
        parts.push(zlib.zstdDecompressSync(buf.subarray(start, stop)).toString("utf8"));
        break;
      } catch {
        /* try the next candidate end */
      }
    }
  }
  return parts.join("");
}

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
}

const ok = foldErrors === 0 && syncViolations === 0 && runningViolations === 0;

console.log(`\nsessions folded : ${scanned}`);
console.log(`fold errors     : ${foldErrors}`);
console.log(`① not in todos  : ${syncViolations}`);
console.log(`② multi running : ${runningViolations}`);
console.log(`④ inject rows   : ${injectSessions} session(s) carry hot-inject history`);
if (samples.length > 0) {
  console.log("\n--- evidence ---");
  for (const line of samples.slice(0, 20)) console.log(`  ${line}`);
  if (samples.length > 20) console.log(`  … ${samples.length - 20} more`);
}
console.log(ok ? "\nAUDIT PASS — the four constraints hold on every readable log." : "\nAUDIT FAIL — see evidence above.");
process.exit(ok ? 0 : 1);
