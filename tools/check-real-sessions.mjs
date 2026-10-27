// 真实会话日志回放 —— 「打开会话会不会炸」的端到端检查（2026-10-26 事故的回归工具）。
//
// 事故：`foldInboxSpliced` 调了未定义的 `inboxApplySplice` / `markInjectCanceled`，宿主把投影里的
// ReferenceError 包装成 `SESSION_QUERY_CORRUPT_SESSION`，于是**所有**会话都显示「历史加载失败」。
// 单元自测当时没覆盖那条路径；这个工具直接拿本机真实日志（`~/.dsh/sessions/**/session.v4.jsonl.zstd`）
// 逐帧解压后整份折叠一遍，任何会话抛错都会被点名。
//
// 用法：
//   node tools/check-real-sessions.mjs                  # 读 ~/.dsh/sessions
//   node tools/check-real-sessions.mjs <sessions-root>  # 指定别的根目录
//
// 退出码 0 = 每个会话都折得动；1 = 有会话抛错（列出会话 id 与错误）。
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
