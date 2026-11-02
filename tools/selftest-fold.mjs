#!/usr/bin/env node
// dsh-workflow-map — self-test for src/fold.mjs.
//
// node tools\selftest-fold.mjs
//
// WHAT THIS PROVES (and how)
// Every case below builds a SYNTHETIC event sequence with the exact envelope the real
// session log carries ({ type, seq, time, data }) and drives the shipping fold. The
// expected values are written out by hand in terms of what a human would say the view
// should be — not by re-running the implementation — so a wrong fold fails here.
//
// (a) todo-only session — no PAE plan at all, steps come from the todo table
// (b) PAE 3 steps + anchorSeqs — plan summary, instructions, reports, anchors
// (c) read/write/edit/glob/grep/pwsh nodes — the files[] the UI draws
// (d) an error result — error text on the node, not silently swallowed
// (e) truncation — 350 nodes -> 300 kept, 50 counted, text bounded
// (f) consecutive same-tool runs — 4 reads of one directory fold into one group
// (g) empty session — nothing invented, nothing throws
// … (h)–(r) branch lanes / jobs / the single running step / percents / the todo ledger
// (s) turn/end is LAYERED: an interrupted turn closes the step, a normal one WAITS for the next
//     turn (`awaitingNextTurn`) and publishes no number
// plus: no clock read in the module, idempotent re-fold, lossless-JSON view,
// unrelated events keep the state reference, the exported versions.
//
// Exit code 0 = every assertion passed. Anything else = 1, with the failing line first.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  BRANCHES_SHOWN,
  BRANCH_NODES,
  BRANCH_TOTAL,
  NODES_PER_STEP,
  SCHEMA_VERSION,
  STATE_VERSION,
  TEXT_LIMIT,
  buildView,
  createInitialState,
  foldEvent,
} from "../src/fold.mjs";
import { applyPlanToView } from "../src/orchestrator.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = path.join(HERE, "..", "src", "fold.mjs");

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${label}${detail === undefined ? "" : `  <- ${detail}`}`);
}

function equal(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, `expected ${e}, got ${a}`);
}

// ---------------------------------------------------------------------------
// event builders (the real envelope, measured from a live log)
// ---------------------------------------------------------------------------

const T0 = 1792000000000; // a fixed stamp — the module never reads a clock
let seqCounter = 0;
const resetSeq = () => {
  seqCounter = 0;
};
const nextSeq = () => {
  seqCounter += 1;
  return seqCounter;
};

/** One session event. `time` defaults to T0 + seq*1000 so durations are deterministic. */
function ev(type, data, options = {}) {
  const seq = options.seq === undefined ? nextSeq() : options.seq;
  return { type, seq, time: options.time === undefined ? T0 + seq * 1000 : options.time, data };
}

const userMessage = (text, kind = "user", extra = {}) =>
  ev("user/message", { content: [{ type: "text", text }], source: { kind, ...extra }, role: "user", id: `u${seqCounter}` });

const todos = (rows) => ev("todo/write", { todos: rows.map(([content, status]) => ({ content, status })) });

const toolCall = (name, args, callId) => ev("tool/call", { turn: 1, step: 1, callId, name, arguments: JSON.stringify(args) });

const toolResult = (callId, text, isError = false) =>
  ev("tool/result", {
    turn: 1,
    step: 1,
    message: {
      role: "tool",
      toolCallId: callId,
      content: [{ type: "text", text }],
      ...(isError ? { isError: true } : {}),
    },
  });

const report = (percent, note) => ev("stepProgress/report", note === undefined ? { percent } : { percent, note });

/** Fold a whole sequence, returning the final state. */
function foldAll(events) {
  let state = createInitialState();
  for (const event of events) state = foldEvent(state, event);
  return state;
}

// ---------------------------------------------------------------------------
// (a) a todo-only session: no plan, the todo table IS the step list
// ---------------------------------------------------------------------------

{
  resetSeq();
  const events = [
    userMessage("给三个模块各加一个自检脚本"),
    todos([
      ["写读取器自检", "in_progress"],
      ["写写入器自检", "pending"],
      ["写编辑器自检", "pending"],
    ]),
    toolCall("read", { path: "C:\\repo\\src\\reader.js" }, "c1"),
    toolResult("c1", "export function read() {}"),
    toolCall("write", { file_path: "C:\\repo\\tools\\selftest-reader.mjs", content: "x".repeat(5000) }, "c2"),
    toolResult("c2", "Created file"),
    ev("turn/end", { turn: 1, reason: { kind: "completed" } }),
  ];
  const state = foldAll(events);
  const view = buildView(state, state.asOf);

  equal("(a) steps come from the todo rows, in order", view.steps.map((step) => step.title), [
    "写读取器自检",
    "写写入器自检",
    "写编辑器自检",
  ]);
  equal("(a) the in_progress row is the running step", view.steps.map((step) => step.status), [
    "running",
    "pending",
    "pending",
  ]);
  equal("(a) the task text is the header, not a step", view.task, "给三个模块各加一个自检脚本");
  equal("(a) nodes are attributed to the running step only", view.nodes.map((node) => node.stepIndex), [0, 0]);
  equal("(a) node kinds/titles", view.nodes.map((node) => `${node.kind}/${node.tool}/${node.title}`), [
    "tool/read/read reader.js",
    "tool/write/write selftest-reader.mjs",
  ]);
 // The 5000-character write body must never enter the persisted state: the node keeps the
 // parameter digest (keys + short values), and `content` / `old_str` / `new_str` are dropped.
  const writeNode = view.nodes.find((node) => node.tool === "write");
  check(
    "(a) the write's body is dropped from the node digest",
    writeNode.argsText.indexOf("xxx") === -1 && JSON.stringify(state).indexOf("x".repeat(120)) === -1,
    `argsText=${JSON.stringify(writeNode.argsText)}`,
  );
  check(
    "(a) every node field stays within its bound",
    view.nodes.every((node) => node.detail.length <= 200 && node.resultHead.length <= 200),
    "a field is longer than its bound",
  );
 // A pending step has no start stamp, so it has no number at all (never a made-up 0%).
  equal("(a) a pending step shows no percent", view.steps[1].percent, null);
  equal("(a) unresolved work keeps baseline off when there is no evidence", view.steps[1].percentSource, "none");
}

// ---------------------------------------------------------------------------
// (b) a PAE plan with three steps: anchors, boundaries, attribution
// ---------------------------------------------------------------------------

{
  resetSeq();
 // Order matters: the fold is seq-ordered (the host always delivers in seq order), so every
 // event is built in the order it happens, not in the order the assertions read.
  const taskMessage = userMessage("三件小事");
  const kickoff = ev("user/message", {
    content: [{ type: "text", text: "Plan-and-Execute 编排开始（任务文本见上方用户消息）。" }],
    source: { kind: "plugin:dsh-plan-and-execute", form: "instructions", summary: "plan-and-execute：开始规划（三件小事）" },
    role: "user",
    id: "k1",
  });
  const summarySeq = nextSeq();
  const planSummary = ev(
    "user/message",
    {
      content: [
        {
          type: "text",
          text: "[plan-and-execute 计划摘要]\n概述：（无）\n步骤（共 3 步）：\n1. 第一步（step-01-a.md）\n2. 第二步（step-02-b.md）\n3. 第三步（step-03-c.md）",
        },
      ],
      source: { kind: "plugin:dsh-plan-and-execute", form: "instructions", summary: "plan-and-execute：计划摘要" },
      role: "user",
      id: "p1",
    },
    { seq: summarySeq },
  );
  const todoTable = todos([
    ["1. 第一步", "pending"],
    ["2. 第二步", "pending"],
    ["3. 第三步", "pending"],
  ]);
  const instr1 = ev("user/message", {
    content: [{ type: "text", text: "执行计划第 1/3 步：第一步\n步骤文件（…/step-01-a.md）内容已内嵌，按此执行：\n----\n# step-01\n----" }],
    source: { kind: "plugin:dsh-plan-and-execute", form: "instructions", summary: "plan-and-execute：执行第 1/3 步（第一步）" },
    role: "user",
    id: "i1",
  });
  const call1 = toolCall("read", { path: "C:\\repo\\a.js" }, "p-call-1");
  const res1 = toolResult("p-call-1", "a.js contents");
  const rep1 = report(100, "第一步完成");
  const reportSeq1 = nextSeq();
  const report1 = ev(
    "user/message",
    {
      content: [
        { type: "text", text: "[plan-and-execute 上一步结果：第 1/3 步（第一步）]\n状态：成功\n产物：（无）\n摘要：做完了\n退出码：0" },
      ],
      source: { kind: "plugin:dsh-plan-and-execute", form: "instructions", summary: "plan-and-execute：第 1/3 步结果" },
      role: "user",
      id: "r1",
    },
    { seq: reportSeq1 },
  );
  const instr2 = ev("user/message", {
    content: [{ type: "text", text: "执行计划第 2/3 步：第二步\n步骤文件（…/step-02-b.md）内容已内嵌，按此执行：\n----\n# step-02\n----" }],
    source: { kind: "plugin:dsh-plan-and-execute", form: "instructions", summary: "plan-and-execute：执行第 2/3 步（第二步）" },
    role: "user",
    id: "i2",
  });
  const call2 = toolCall("write", { file_path: "C:\\repo\\b.js", content: "b" }, "p-call-2");
  const res2 = toolResult("p-call-2", "ok");
  const reportSeq2 = nextSeq();
  const report2 = ev(
    "user/message",
    {
      content: [
        { type: "text", text: "[plan-and-execute 上一步结果：第 2/3 步（第二步）]\n状态：失败\n产物：（无）\n摘要：没做成\n退出码：1" },
      ],
      source: { kind: "plugin:dsh-plan-and-execute", form: "instructions", summary: "plan-and-execute：第 2/3 步结果" },
      role: "user",
      id: "r2",
    },
    { seq: reportSeq2 },
  );
  const instr3 = ev("user/message", {
    content: [{ type: "text", text: "执行计划第 3/3 步：第三步\n步骤文件（…/step-03-c.md）内容已内嵌，按此执行：\n----\n# step-03\n----" }],
    source: { kind: "plugin:dsh-plan-and-execute", form: "instructions", summary: "plan-and-execute：执行第 3/3 步（第三步）" },
    role: "user",
    id: "i3",
  });
  const call3 = toolCall("edit", { file_path: "C:\\repo\\c.js", old_str: "a", new_str: "b" }, "p-call-3");
  const res3 = toolResult("p-call-3", "edited");
  const doneTodos = todos([
    ["1. 第一步", "completed"],
    ["2. 第二步", "completed"],
    ["3. 第三步", "in_progress"],
  ]);

  const events = [
    taskMessage,
    kickoff,
    planSummary,
    todoTable,
    instr1,
    call1,
    res1,
    rep1,
    report1,
    instr2,
    call2,
    res2,
    report2,
    instr3,
    call3,
    res3,
    doneTodos,
  ];
  const state = foldAll(events);
  const view = buildView(state, state.asOf);

 // "Strictly in sync with the conversation UI": the map shows EXACTLY the rows the live todo table lists.
 // The synthetic "planning & research" row is therefore gone once the three plan rows exist - it is the
 // pre-plan scratch pad, not a step the conversation still shows.
  equal("(b) the view is exactly the todo table's rows, in ITS order", view.steps.length, 3);
  equal("(b) the synthetic planning row is not a step any more", view.steps.map((step) => step.title), [
    "第一步",
    "第二步",
    "第三步",
  ]);
  equal("(b) plan rows keep PAE's ordinals", view.steps.map((step) => step.planIndex), [1, 2, 3]);
  equal(
    "(b) anchors are the plan summary + each report (exactly what orchestrator.json records)",
    view.steps.map((step) => step.anchorSeq),
    [summarySeq, reportSeq1, reportSeq2],
  );
  equal("(b) statuses follow PAE's own reports/todo table", view.steps.map((step) => step.status), [
    "done",
    "done",
    "running",
  ]);
  equal("(b) outcomes come from the report body", view.steps.map((step) => step.outcome), ["success", "failed", ""]);
  equal(
    "(b) each node lands on the step whose anchor range contains its seq",
    view.nodes.map((node) => node.stepIndex),
 // read + its self-report -> step 1; write -> step 2; edit -> step 3 (the kickoff node belonged
 // to the dropped planning row and went with it)
    [0, 0, 1, 2],
  );
  equal(
    "(b) a finished step reads 100% (done means done)",
 // Two closed steps read 100 %. The third is the running one: it has no model report of its
 // own, so it carries the time-baseline estimate (a real number, capped at 90) — never a fake
 // 100 and never a null that would leave the rail without a fill.
    view.steps.map((step) => (step.status === "running" ? "running" : step.percent)),
    [100, 100, "running"],
  );
  equal("(b) the todo table's in_progress row is the running step", view.steps[2].status, "running");
  check(
    "(b) the report body is kept as the step summary",
    view.steps[0].reportSummary.indexOf("状态：成功") >= 0,
    `got ${JSON.stringify(view.steps[0].reportSummary)}`,
  );
}

// ---------------------------------------------------------------------------
// (c) the files[] a tool touched
// ---------------------------------------------------------------------------

{
  resetSeq();
  const events = [
    todos([["查文件", "in_progress"]]),
    toolCall("read", { path: "C:\\repo\\src\\a.js" }, "f1"),
    toolResult("f1", "a"),
    toolCall("write", { file_path: "C:\\repo\\out\\b.md", content: "b" }, "f2"),
    toolResult("f2", "ok"),
    toolCall("edit", { file_path: "C:\\repo\\src\\c.js", old_str: "x", new_str: "y" }, "f3"),
    toolResult("f3", "ok"),
    toolCall("glob", { path: "C:\\repo\\tools", pattern: "**/*.mjs" }, "f4"),
    toolResult("f4", "one.mjs"),
    toolCall("grep", { path: "C:\\repo\\src", pattern: "read" }, "f5"),
    toolResult("f5", "a.js:1"),
    toolCall("pwsh", { command: "Get-ChildItem \"C:\\repo\\src\" -Filter *.js", description: "list" }, "f6"),
    toolResult("f6", "a.js"),
    toolCall("skill", { name: "cordis-plugin-development" }, "f7"),
    toolResult("f7", "<skill_content …>"),
    toolCall("subagent", { description: "review the fold module" }, "f8"),
    toolResult("f8", "done"),
  ];
  const state = foldAll(events);
  const view = buildView(state, state.asOf);

  equal("(c) read -> 读", view.nodes[0].files, [{ path: "C:\\repo\\src\\a.js", action: "读" }]);
  equal("(c) write -> 写", view.nodes[1].files, [{ path: "C:\\repo\\out\\b.md", action: "写" }]);
  equal("(c) edit -> 改", view.nodes[2].files, [{ path: "C:\\repo\\src\\c.js", action: "改" }]);
  equal("(c) glob -> 查", view.nodes[3].files, [{ path: "C:\\repo\\tools", action: "查" }]);
  equal("(c) grep -> 查", view.nodes[4].files, [{ path: "C:\\repo\\src", action: "查" }]);
  equal("(c) pwsh keeps the command, path inference flagged", view.nodes[5].title, "pwsh Get-ChildItem");
  check("(c) pwsh detail mentions the inferred path", view.nodes[5].detail.indexOf("路径推断") >= 0, view.nodes[5].detail);
  equal("(c) skill shows its name", view.nodes[6].title, "skill cordis-plugin-development");
  check("(c) subagent keeps its description", view.nodes[7].title.indexOf("review the fold module") >= 0, view.nodes[7].title);
 // Titles use the BASENAME, never the full path (a path is not a title).
  check("(c) titles never carry a whole path", view.nodes.every((node) => node.title.indexOf("C:\\") === -1), "a title contains a drive path");
}

// ---------------------------------------------------------------------------
// (d) an error result
// ---------------------------------------------------------------------------

{
  resetSeq();
  const events = [
    todos([["跑命令", "in_progress"]]),
    toolCall("pwsh", { command: "node missing.mjs", description: "run" }, "e1"),
    toolResult("e1", "Error: Cannot find module 'missing.mjs'\n    at line 3", true),
  ];
  const state = foldAll(events);
  const view = buildView(state, state.asOf);
  const node = view.nodes[0];
  check("(d) the error text is kept", node.error.indexOf("Cannot find module") >= 0, node.error);
  equal("(d) an error is not also a success head", node.resultHead, "");
  check("(d) the duration is measured from the call", node.durationMs === 1000 || node.durationMs > 0, String(node.durationMs));
  check("(d) only the first line is kept", node.error.indexOf("\n") === -1, "the error carries a newline");
}

// ---------------------------------------------------------------------------
// (e) truncation: 350 nodes in one step, and long text
// ---------------------------------------------------------------------------

{
  resetSeq();
  const events = [todos([["吞掉 350 个调用", "in_progress"]])];
  for (let i = 0; i < 350; i += 1) {
    const id = `t${i}`;
    events.push(toolCall("read", { path: `C:\\repo\\src\\file-${i}.js` }, id));
    events.push(toolResult(id, i === 349 ? "z".repeat(9000) : `line-${i}`));
  }
  const state = foldAll(events);
  const view = buildView(state, state.asOf);
  const step = view.steps[0];

  equal("(e) the step counts every node it saw", step.nodeCount, 350);
  equal("(e) at most NODES_PER_STEP ids are kept", step.nodeIds.length, NODES_PER_STEP);
  equal("(e) the dropped middle is counted", step.truncatedNodes, 350 - NODES_PER_STEP);
  check(
    "(e) the kept ids are the head and the tail",
    step.nodeIds[0] === view.nodes[0].id && step.nodeIds[step.nodeIds.length - 1] === view.nodes[view.nodes.length - 1].id,
    `${step.nodeIds[0]} .. ${step.nodeIds[step.nodeIds.length - 1]}`,
  );
  check(
    "(e) no single text field exceeds the limit",
    view.nodes.every((node) => node.resultHead.length <= TEXT_LIMIT && node.detail.length <= TEXT_LIMIT && node.title.length <= 120),
    "a field is longer than its bound",
  );
  check(
    "(e) a 9000-char result does not reach the state",
    JSON.stringify(state).indexOf("z".repeat(TEXT_LIMIT + 20)) === -1,
    "the long body leaked into the state",
  );
}

// ---------------------------------------------------------------------------
// (f) consecutive same-tool runs fold into one group
// ---------------------------------------------------------------------------

{
  resetSeq();
  const events = [todos([["连续读同一目录", "in_progress"]])];
  for (let i = 0; i < 4; i += 1) {
    const id = `g${i}`;
    events.push(toolCall("read", { path: `C:\\repo\\src\\part-${i}.js` }, id));
    events.push(toolResult(id, `body-${i}`));
  }
  events.push(toolCall("write", { file_path: "C:\\repo\\out\\x.md", content: "x" }, "gw"));
  events.push(toolResult("gw", "ok"));

  const state = foldAll(events);
  const view = buildView(state, state.asOf);
  const step = view.steps[0];

  equal("(f) the four reads become one group", step.groups.length, 1);
  equal("(f) the group counts four nodes", step.groups[0].count, 4);
  equal("(f) the group keeps the tool that made it", step.groups[0].tool, "read");
  equal("(f) the group keys on the directory", step.groups[0].key, "read:C:/repo/src");
  equal(
    "(f) the original detail nodes are still there to expand",
    step.nodeIds.length,
    5,
  );
  equal("(f) a single node is never a group", view.steps[0].groups[0].lastId, step.nodeIds[3]);

 // A different tool resets the run: the write is not folded into the reads.
  resetSeq();
  const shortRun = foldAll([
    todos([["两条同读", "in_progress"]]),
    toolCall("read", { path: "C:\\repo\\src\\a.js" }, "s1"),
    toolResult("s1", "a"),
    toolCall("read", { path: "C:\\repo\\src\\b.js" }, "s2"),
    toolResult("s2", "b"),
  ]);
  equal("(f) two adjacent same-tool nodes are below the threshold", buildView(shortRun, shortRun.asOf).steps[0].groups.length, 0);
}

// ---------------------------------------------------------------------------
// (g) an empty session
// ---------------------------------------------------------------------------

{
  const state = createInitialState();
  const view = buildView(state, 0);
  equal("(g) no steps are invented", view.steps, []);
  equal("(g) no nodes are invented", view.nodes, []);
  equal("(g) no active pointer", view.active, null);
  equal("(g) no task", view.task, "");
  equal("(g) zero counts", view.counts, { steps: 0, nodes: 0, running: 0, completed: 0 });
  equal("(g) the view still declares its version", view.ver, SCHEMA_VERSION);
 // A null/garbage state must not throw either.
  equal("(g) buildView(null) is the empty view", buildView(null, 0).counts.steps, 0);
  equal("(g) foldEvent(null, garbage) returns an initial state", foldEvent(null, 42).stateVersion, STATE_VERSION);
}

// ---------------------------------------------------------------------------
// (h) a subagent becomes a BRANCH LANE, never a main-flow node
// ---------------------------------------------------------------------------

{
 // The recorded-log path: the launcher call, then its ACK ("started subagent <id>").
 // The subagent bus events are NOT session events, so the lane is born from the call.
  resetSeq();
  const acked = foldAll([
    todos([["派子代理调研", "in_progress"]]),
    toolCall("subagent", { description: "review the fold module" }, "s1"),
    toolResult("s1", "started subagent child-9"),
  ]);
  const ackView = buildView(acked, acked.asOf);
  equal("(h) the launcher call opens exactly one lane", ackView.branches.length, 1);
  equal("(h) the lane keeps the description as its label", ackView.branches[0].label, "review the fold module");
  equal("(h) the lane kind is subagent", ackView.branches[0].kind, "subagent");
  equal("(h) the lane belongs to the running step", ackView.branches[0].stepIndex, 0);
  equal("(h) an ACK keeps the lane running (a subagent tool does not block)", ackView.branches[0].status, "running");
  equal("(h) the ACK attaches the child session id", acked.branches[0].runId, "child-9");
  equal("(h) the lane rows start as the launch", ackView.branches[0].nodes.map((node) => node.kind), ["start"]);
  equal("(h) branch rows never enter the main flow", ackView.nodes.map((node) => node.tool), ["subagent"]);
  equal("(h) the main flow count ignores the lane", ackView.counts.nodes, 1);

 // The child's answer and its settlement arrive as USER messages (measured source kinds):
 // `agent-message` is the relayed answer, `subagent-settled` is the closing notice.
  resetSeq();
  const settledLane = foldAll([
    todos([["派子代理调研", "in_progress"]]),
    toolCall("subagent", { description: "review the fold module" }, "s1"),
    toolResult("s1", "started subagent child-9"),
    ev("user/message", {
      content: [{ type: "text", text: "看完了，没问题" }],
      source: { kind: "agent-message", form: "relay", senderSessionId: "child-9" },
      role: "user",
      id: "m1",
    }),
    ev("user/message", {
      content: [{ type: "text", text: "Background subagent child-9 finished." }],
      source: {
        kind: "subagent-settled",
        form: "notice",
        summary: "Background subagent child-9 finished and will do no further work",
        senderSessionId: "child-9",
      },
      role: "user",
      id: "m2",
    }),
  ]);
  const settledView = buildView(settledLane, settledLane.asOf);
  equal("(h) the child's message and its settlement are lane rows", settledView.branches[0].nodes.map((node) => node.kind), ["start", "message", "end"]);
  equal("(h) subagent-settled closes the lane as done", settledView.branches[0].status, "done");
  check("(h) the message row keeps the child's answer", settledView.branches[0].nodes[1].detail.indexOf("没问题") >= 0, settledView.branches[0].nodes[1].detail);
  check("(h) the settlement row keeps the summary", settledView.branches[0].nodes[2].detail.indexOf("finished") >= 0, settledView.branches[0].nodes[2].detail);

 // A blocking host (the result carries the child's final text) closes it at the result.
  resetSeq();
  const blocking = foldAll([
    todos([["派子代理", "in_progress"]]),
    toolCall("subagent", { description: "blocking run" }, "s2"),
    toolResult("s2", "final answer"),
  ]);
  equal("(h) a blocking result closes the lane at once", buildView(blocking, blocking.asOf).branches[0].status, "done");

 // The bus path (a host that DOES record the lifecycle): start opens, end closes.
  resetSeq();
  const bus = foldAll([
    todos([["派子代理", "in_progress"]]),
    ev("subagent/start", { description: "并行调研", runId: "run-1", provider: "p" }),
    ev("subagent/end", { runId: "run-1", stopReason: "failed", lastAssistantMessage: "boom" }),
  ]);
  const busView = buildView(bus, bus.asOf);
  equal("(h) a bus-only subagent still gets one lane", busView.branches.length, 1);
  equal("(h) a failed stopReason marks the lane failed", busView.branches[0].status, "failed");
  check("(h) the end row carries the last message", busView.branches[0].nodes[1].detail.indexOf("boom") >= 0, busView.branches[0].nodes[1].detail);
  equal("(h) a bus-only subagent adds no main-flow node", busView.nodes.length, 0);
}

// ---------------------------------------------------------------------------
// (i) a workflow run: run-start / agent-start / agent-end / run-end
// ---------------------------------------------------------------------------

{
  resetSeq();
  const events = [
    todos([["跑工作流", "in_progress"]]),
    toolCall("workflow", { description: "three-lens audit" }, "w1"),
    ev("tool-workflow/run-start", { runId: "run-9", name: "audit" }),
    ev("tool-workflow/agent-start", { runId: "run-9", seq: 3, label: "磁盘检查", childId: "c1", phase: "phase-A" }),
    ev("tool-workflow/agent-start", { runId: "run-9", seq: 4, label: "内存检查", childId: "c2" }),
    ev("tool-workflow/agent-end", { runId: "run-9", seq: 3, outcome: "completed" }),
    ev("tool-workflow/run-end", { runId: "run-9", stopReason: "completed" }),
    toolResult("w1", "started workflow run-9"),
  ];
  const state = foldAll(events);
  const view = buildView(state, state.asOf);
  const lane = view.branches[0];

  equal("(i) one workflow run is one lane", view.branches.length, 1);
  equal("(i) run-start attaches to the launcher lane (no second lane)", lane.kind, "workflow");
  equal("(i) the lane keeps the launcher description", lane.label, "three-lens audit");
  equal("(i) a phase becomes a section row", lane.nodes.map((node) => node.kind), ["start", "phase", "agent", "agent"]);
  equal("(i) agent-end updates the SAME row (keyed by seq)", lane.nodes[2].status, "done");
  equal("(i) a still-running member stays running", lane.nodes[3].status, "running");
  equal("(i) run-end closes the lane", lane.status, "done");
  equal("(i) a background workflow result does not close it twice", view.branches.length, 1);
  equal("(i) the workflow adds no main-flow node of its own", view.nodes.map((node) => node.tool), ["workflow"]);
}

// ---------------------------------------------------------------------------
// (j) background jobs: registration alone is NOT a lane (measured: 452 pwsh jobs)
// ---------------------------------------------------------------------------

{
 // The SYNCHRONOUS order: registration -> settlement -> the call's own result.
  resetSeq();
  const sync = foldAll([
    todos([["同步命令", "in_progress"]]),
    ev("job/registered", { jobId: "j0", kind: "pwsh", label: "Get-ChildItem", startedAt: T0 + 1000, toolCall: { callId: "p0" } }),
    toolCall("pwsh", { command: "Get-ChildItem" }, "p0"),
    ev("job/settled", { jobId: "j0", outcome: { status: "completed" }, cause: "producer" }),
    toolResult("p0", "a.js"),
  ]);
  equal("(j) a job that settles before its result never draws a lane", buildView(sync, sync.asOf).branches.length, 0);
  equal("(j) no pending job is left behind", sync.pendingJobs.length, 0);

 // The BACKGROUND order: registration -> result (job still open) -> settlement.
  resetSeq();
  const bg = foldAll([
    todos([["后台长任务", "in_progress"]]),
    ev("job/registered", { jobId: "j1", kind: "pwsh", label: "Get-ChildItem -Recurse", startedAt: T0 + 5000, toolCall: { callId: "p1" } }),
    toolCall("pwsh", { command: "Get-ChildItem -Recurse" }, "p1"),
    toolResult("p1", "job j1 started"),
    ev("job/settled", { jobId: "j1", outcome: { status: "failed", detail: "exit 1" }, cause: "producer" }),
  ]);
  const bgView = buildView(bg, bg.asOf);
  const lane = bgView.branches[0];
  equal("(j) a BACKGROUND job opens a lane", bgView.branches.length, 1);
  equal("(j) the lane kind is job", lane.kind, "job");
  equal("(j) the lane keeps the job label", lane.label, "Get-ChildItem -Recurse");
  equal("(j) the lane starts at the job's own stamp", lane.startedAt, T0 + 5000);
  equal("(j) the lane rows are start -> settle", lane.nodes.map((node) => node.kind), ["start", "end"]);
  equal("(j) a failed outcome marks the lane failed", lane.status, "failed");
  check("(j) the settle row keeps the outcome detail", lane.nodes[1].detail.indexOf("exit 1") >= 0, lane.nodes[1].detail);
  equal("(j) the job's own tool call stays in the main flow", bgView.nodes.map((node) => node.tool), ["pwsh"]);

 // 13 launcher lanes: the state keeps BRANCH_TOTAL and counts every dropped one.
  resetSeq();
  const many = [todos([["多任务", "in_progress"]])];
  for (let i = 0; i < 13; i += 1) {
    many.push(toolCall("subagent", { description: `lane-${i}` }, `c${i}`));
    many.push(toolResult(`c${i}`, `started subagent child-${i}`));
  }
  const capped = foldAll(many);
  equal("(j) at most BRANCH_TOTAL lanes are kept", buildView(capped, capped.asOf).branches.length, BRANCH_TOTAL);
  equal("(j) dropped lanes are counted, not silently lost", capped.droppedBranches, 13 - BRANCH_TOTAL);
}

// ---------------------------------------------------------------------------
// (k) lane row cap and the empty session's branch set
// ---------------------------------------------------------------------------

{
  resetSeq();
  const events = [todos([["限长", "in_progress"]]), ev("workflow/start", { runId: "r2", name: "cap" })];
  for (let i = 0; i < 45; i += 1) events.push(ev("workflow/phase", { runId: "r2", phase: `P${i}` }));
  const state = foldAll(events);
  const lane = buildView(state, state.asOf).branches[0];
  equal("(k) a lane counts every row it saw", lane.count, 46);
  equal("(k) at most BRANCH_NODES rows are kept", lane.nodes.length, BRANCH_NODES);
  equal("(k) the dropped head is reported honestly", lane.truncated, 46 - BRANCH_NODES);

 // No subagent / workflow / job anywhere: the view has no branch list content at all.
  equal("(k) an empty session has no branches", buildView(createInitialState(), 0).branches, []);
  const plain = buildView(foldAll([todos([["只读文件", "in_progress"]]), toolCall("read", { path: "C:\\r\\a.js" }, "x"), toolResult("x", "a")]), T0 + 9000);
  equal("(k) a plain tool session has no branches", plain.branches, []);
  equal("(k) BRANCHES_SHOWN is the 4-lane drawing cap", BRANCHES_SHOWN, 4);
}

// ---------------------------------------------------------------------------
// (l) is the session working right now (`view.running`)
// ---------------------------------------------------------------------------

{
  resetSeq();
 // The flag is the TURN, not the step rows: PAE keeps a step 'running' after the turn ends,
 // so the browser half would never pause its animations if it read the rows instead.
  equal("(l) a fresh state has no open turn", buildView(createInitialState(), 0).running, false);

  const opened = foldAll([
    userMessage("跑起来"),
    todos([["跑起来", "in_progress"]]),
    ev("turn/start", { turn: 1 }),
    toolCall("read", { path: "C:\\repo\\a.js" }, "r1"),
  ]);
  const openedView = buildView(opened, opened.asOf);
  equal("(l) turn/start opens the turn", openedView.running, true);
  equal("(l) the step row is still 'running' at that point", openedView.steps[0].status, "running");

  const closed = foldAll([
    userMessage("跑完"),
    todos([["跑完", "in_progress"]]),
    ev("turn/start", { turn: 1 }),
    toolCall("read", { path: "C:\\repo\\a.js" }, "r1"),
    ev("turn/end", { turn: 1 }),
  ]);
  const closedView = buildView(closed, closed.asOf);
  equal("(l) turn/end closes the turn", closedView.running, false);
  // RE-CHECKED when turn/end gained its layering (2026-11-01): this payload carries NO reason, so it
  // takes the unknown → non-terminal route and the row keeps `running` — the expectation is
  // unchanged and now also carries the wait flag. What the row must NOT do is publish a number:
  // that is the half of the old behaviour the layering removed, asserted here because this is the
  // one place that already had a closed turn in hand.
  equal("(l) the step row survives the closed turn (why rows cannot answer it)", closedView.steps[0].status, "running");
  equal("(l) …and it is marked as waiting, with no number", [closedView.steps[0].awaitingNextTurn, closedView.steps[0].percent, closedView.steps[0].percentSource], [true, null, "none"]);

  const reopened = foldAll([
    userMessage("再来一次"),
    todos([["再来一次", "in_progress"]]),
    ev("turn/start", { turn: 1 }),
    ev("turn/end", { turn: 1 }),
    ev("turn/start", { turn: 2 }),
  ]);
  equal("(l) a later turn reopens it", buildView(reopened, reopened.asOf).running, true);

 // The flag must ride through the persisted state (a checkpoint restored mid-turn).
  const roundTrip = JSON.parse(JSON.stringify(opened));
  equal("(l) the turn flag is plain JSON", roundTrip.turnActive, true);
}

// ---------------------------------------------------------------------------
// (m) lastEstimateAt - the stamp the rail's "estimated N minutes ago" measures from
// ---------------------------------------------------------------------------

{
  resetSeq();
 // A step that has only started has no progress number yet, so it has no estimate stamp:
 // the honest answer is 0, which the browser renders as NO segment (never "0 seconds ago").
  const started = foldAll([
    userMessage("开工"),
    todos([["甲", "in_progress"]]),
    ev("step/start", { turn: 1, step: 1 }),
  ]);
  const startedView = buildView(started, started.asOf);
  equal("(m) a bare step/start is itself an estimate stamp", startedView.steps[0].lastEstimateAt, started.asOf);
  equal("(m) the stamp is published on the wire view", typeof startedView.steps[0].lastEstimateAt, "number");

 // A step with NO step event and NO report at all (todo table only, nothing folded onto it):
 // 0 - the rail then renders no "ago" segment instead of a fabricated "0 seconds ago".
  const untouched = foldAll([
    userMessage("还没开始"),
    todos([["甲", "pending"], ["乙", "pending"]]),
  ]);
  const untouchedView = buildView(untouched, untouched.asOf);
  equal("(m) a step nothing was ever reported on keeps 0", untouchedView.steps[0].lastEstimateAt, 0);

 // A `stepProgress/report` IS the moment a number came into being: its own event time.
  const reported = foldAll([
    userMessage("开工"),
    todos([["甲", "in_progress"]]),
    report(40, "四成"),
  ]);
  equal("(m) a report stamps the step it reported on", reported.steps[0].lastEstimateAt, reported.asOf);
  equal("(m) the stamp equals the view's asOf", buildView(reported, reported.asOf).steps[0].lastEstimateAt, reported.asOf);

 // A LATER report moves the stamp; the first one does not win.
  resetSeq();
  const twice = foldAll([
    userMessage("开工"),
    todos([["甲", "in_progress"]]),
    report(20),
    toolCall("read", { path: "C:\\repo\\a.js" }, "r1"),
    toolResult("r1", "a"),
    report(70),
  ]);
  equal("(m) a second report REPLACES the stamp", twice.steps[0].lastEstimateAt, twice.asOf);
  equal("(m) the newer percent wins too", buildView(twice, twice.asOf).steps[0].percent, 70);

 // A `step/start` inside the running plan step also refreshes it (activity = a fresh read).
  resetSeq();
  const stepped = foldAll([
    userMessage("开工"),
    todos([["甲", "in_progress"]]),
    report(10),
    ev("step/start", { turn: 2, step: 5 }),
  ]);
  equal("(m) a model step start refreshes the stamp", stepped.steps[0].lastEstimateAt, stepped.asOf);

 // The stamp is per-step: a second step's report must not touch the first's.
  resetSeq();
  const two = foldAll([
    userMessage("两件事"),
    todos([["甲", "in_progress"], ["乙", "pending"]]),
    report(30),
    todos([["甲", "completed"], ["乙", "in_progress"]]),
    report(15),
  ]);
  const twoStamps = buildView(two, two.asOf).steps.map((s) => s.lastEstimateAt);
  equal("(m) each step keeps its own stamp", twoStamps, [two.steps[0].lastEstimateAt, two.steps[1].lastEstimateAt]);
  check("(m) the two stamps differ (they are per-step facts)", two.steps[0].lastEstimateAt !== two.steps[1].lastEstimateAt, JSON.stringify(two.steps.map((s) => s.lastEstimateAt)));

 // The stamp survives the checkpoint round trip and the fold stays idempotent.
  resetSeq();
  const seq = [
    userMessage("开工"),
    todos([["甲", "in_progress"]]),
    report(55, "过半"),
    ev("step/start", { turn: 1, step: 1 }),
  ];
  const once = foldAll(seq);
  equal("(m) the stamp is plain JSON (checkpoint round trip)", JSON.parse(JSON.stringify(once)).steps[0].lastEstimateAt, once.steps[0].lastEstimateAt);
  let replay = once;
  for (const event of seq) replay = foldEvent(replay, event);
  equal("(m) re-delivering the same events changes nothing", JSON.stringify(replay), JSON.stringify(once));

 // A closed step keeps the stamp it earned: the rail still shows how old that number is.
  resetSeq();
  const closed = foldAll([
    userMessage("完工"),
    todos([["甲", "in_progress"]]),
    report(80),
    todos([["甲", "completed"]]),
  ]);
  const closedView = buildView(closed, closed.asOf);
  equal("(m) a closed step keeps its estimate stamp", closedView.steps[0].lastEstimateAt, closed.steps[0].lastEstimateAt);
  equal("(m) the closed step's percent is pinned at 100", closedView.steps[0].percent, 100);
}

// cross-cutting: exported versions, no clock, idempotence, lossless JSON, mirrors
// ---------------------------------------------------------------------------

{
 // added the session identity to the state (`sessionId` / `cwd`) so the plan reader
 // can name `.pae/<sessionId>/orchestrator.json` from a wire view; a checkpoint written at
 // version 1 cannot carry it, hence the bump.
 // bumps it again for the inbox LEDGER (`inboxIds`): a version-2 checkpoint
// carries no ledger, and answering a later cancellation from a missing ledger would be a wrong
// answer, so the registry must rebuild rather than hydrate. It bumps to 4 for the LEDGER MAPPING:
// the step list now follows the todo table's own statuses (a `pending` row demotes a step that
// still carries `done`/`running`, and a pending row no table names is dropped), so a version-3
// checkpoint would hold the older mapping and must rebuild too.
// It bumps to 6 for the EVENT INTERVAL: a step now records `windowStart` / `windowEnd` and a node
// is attributed by that interval instead of by "whichever step is running right now". A version-5
// checkpoint holds node→step assignments made by that pointer and holds no interval, so it cannot
// be corrected after the fact — the registry must rebuild it from the log like every bump before it.
  equal("stateVersion is 6", STATE_VERSION, 6);
  equal("schemaVersion is 1", SCHEMA_VERSION, 1);

  const source = readFileSync(MODULE_PATH, "utf8");
  const clockHits = ["Date.now", "new Date", "performance.now", "Math.random"].filter((needle) => source.indexOf(needle) !== -1);
  equal("the fold module reads no clock and no RNG", clockHits, []);

 // A realistic-ish mixed sequence, folded twice in two different ways.
  resetSeq();
  const events = [
    userMessage("混合会话"),
    ev("subagent/start", { description: "并行调研" }),
    todos([["甲", "in_progress"], ["乙", "pending"]]),
    ev("step/start", { turn: 1, step: 1 }),
    toolCall("read", { path: "C:\\repo\\a.js" }, "x1"),
    toolResult("x1", "a"),
    ev("approval/request", { reason: "需要确认", title: "确认" }),
    ev("user-questions/request", { questions: [{ id: "q", question: "选哪个？" }] }),
    report(40, "一半"),
    ev("workflow/start", { phase: "plan" }),
    ev("workflow/phase", { phase: "run" }),
    ev("subagent/end", { description: "并行调研" }),
    ev("step/end", { turn: 1, step: 1 }),
    ev("turn/start", { turn: 2 }),
    ev("turn/end", { turn: 2, reason: { kind: "completed" } }),
  ];
  const once = foldAll(events);
  const twice = foldAll(events);
  equal("folding the same sequence twice gives the same state", JSON.stringify(once), JSON.stringify(twice));

 // Re-delivering every event on top of the finished state must change nothing.
  let replayed = once;
  for (const event of events) replayed = foldEvent(replayed, event);
  equal("re-delivering the same events changes nothing (idempotent)", JSON.stringify(replayed), JSON.stringify(once));

  const view = buildView(once, once.asOf);
  equal("the view survives a JSON round trip (lossless)", JSON.parse(JSON.stringify(view)), view);

 // Unrelated events keep the very same state reference (no downstream work).
  const unrelated = ["job/progress", "llm/retry", "compaction/start", "request/header", "assistant/attempt", "session"];
  let sameRef = true;
  for (const type of unrelated) {
    const event = ev(type, { whatever: true });
    if (foldEvent(once, event) !== once) sameRef = false;
  }
  check("unrelated events return the same state reference", sameRef, "a state copy was produced");

 // The fold answers to each declared type; none of them throws on an empty payload.
  const declared = [
    "todo/write",
    "tool/call",
    "tool/result",
    "step/start",
    "step/end",
    "assistant/message",
    "user/message",
    "turn/start",
    "turn/end",
    "stepProgress/report",
    "subagent/start",
    "subagent/end",
    "workflow/start",
    "workflow/phase",
    "workflow/agent-start",
    "workflow/agent-end",
    "workflow/end",
    "user-questions/request",
    "approval/request",
 // the branch vocabulary of a recorded log and of the plugin bus.
    "job/registered",
    "job/settled",
    "tool-workflow/run-start",
    "tool-workflow/agent-start",
    "tool-workflow/agent-end",
    "tool-workflow/run-end",
  ];
  let threw = "";
  for (const type of declared) {
    try {
      foldEvent(createInitialState(), { type, seq: 1, time: T0, data: {} });
      foldEvent(createInitialState(), { type, seq: 1, time: T0, data: null });
      foldEvent(createInitialState(), { type });
    } catch (error) {
      threw = `${type}: ${error.message}`;
      break;
    }
  }
  equal("every declared event type tolerates an empty/garbage payload", threw, "");

 // -------------------------------------------------------------------------
 // Assertion gaps closed here: injects / approvals / questions / the single running step / strict sync
 // -------------------------------------------------------------------------

 // (h) hot-inject history: spliced -> pending, then the admitting user/message -> picked.
  {
    resetSeq();
    const fresh = [
      todos([["做一件事", "in_progress"]]),
      ev("agent/inbox/spliced", {
        target: "next-step",
        inserted: [
          {
            id: "inj-1",
            role: "user",
            content: [{ type: "text", text: "补一句" }],
            source: { kind: "plugin:dsh-workflow-map" },
          },
        ],
      }),
    ];
    const pending = buildView(foldAll(fresh), T0 + 100000);
    equal("(h) a spliced message becomes one pending inject row", pending.injects.length, 1);
    equal("(h) it is pending until the session admits it", pending.injects[0].pickedUp, false);
    const admitted = buildView(
      foldAll([
        ...fresh,
        ev("user/message", {
          id: "inj-1",
          role: "user",
          content: [{ type: "text", text: "补一句" }],
          source: { kind: "plugin:dsh-workflow-map" },
        }),
      ]),
      T0 + 100000,
    );
    equal("(h) the admitting user/message flips it to picked", admitted.injects[0].pickedUp, true);
    const foreign = buildView(
      foldAll([
        todos([["做一件事", "in_progress"]]),
        ev("agent/inbox/spliced", {
          target: "next-step",
          inserted: [{ id: "x", role: "user", content: [{ type: "text", text: "别人" }], source: { kind: "plugin:other" } }],
        }),
      ]),
      T0 + 100000,
    );
    equal("(h) another plugin's message is not in our history", foreign.injects.length, 0);

 // Revocable only before pickup: the row becomes "revoked" only when the host emits `agent/inbox/discarded`; otherwise it never does.
    const discarded = buildView(
      foldAll([
        ...fresh,
        ev("agent/inbox/discarded", {
          message: {
            id: "inj-1",
            role: "user",
            content: [{ type: "text", text: "补一句" }],
            source: { kind: "plugin:dsh-workflow-map" },
          },
        }),
      ]),
      T0 + 100000,
    );
    equal("(h) the host's discard event marks the row revoked", discarded.injects[0].canceled, true);
    equal("(h) a revoked row is still not 'taken'", discarded.injects[0].pickedUp, false);
    const takenFirst = buildView(
      foldAll([
        ...fresh,
        ev("user/message", { id: "inj-1", role: "user", content: [{ type: "text", text: "补一句" }], source: { kind: "plugin:dsh-workflow-map" } }),
        ev("agent/inbox/discarded", { message: { id: "inj-1", source: { kind: "plugin:dsh-workflow-map" } } }),
      ]),
      T0 + 100000,
    );
    equal("(h) an already-taken row is never flipped to revoked", takenFirst.injects[0].canceled, undefined);

 // The PERSISTENT half of a revoke: the host records "start index + removed count", not an id. Only by
 // replaying `agent/inbox/spliced` by position onto the inboxIds ledger can we answer "which row was it".
 // This case is exactly the one that should have gone red when inboxApplySplice went missing.
    const ourMessage = {
      id: "inj-2",
      role: "user",
      content: [{ type: "text", text: "先插一句" }],
      source: { kind: "plugin:dsh-workflow-map" },
    };
    const foreignMessage = { id: "h-1", role: "user", content: [{ type: "text", text: "人打的" }], source: { kind: "user" } };
    const insertedBoth = [
      todos([["做一件事", "in_progress"]]),
      ev("agent/inbox/spliced", { target: "next-step", start: 0, removedCount: 0, inserted: [foreignMessage] }),
      ev("agent/inbox/spliced", { target: "next-step", start: 1, removedCount: 0, inserted: [ourMessage] }),
    ];
    const ledgerInserted = foldAll(insertedBoth);
    equal("(h) the ledger records both pending ids positionally", ledgerInserted.inboxIds["next-step"], ["h-1", "inj-2"]);

 // The cancellation names index 1 of `next-step` and nothing else: it resolves to OUR message.
    const revokedByLedger = buildView(
      foldAll([...insertedBoth, ev("agent/inbox/spliced", { target: "next-step", start: 1, removedCount: 1, inserted: [], outcome: "canceled" })]),
      T0 + 100000,
    );
    equal("(h) a positional cancel resolves to our own row", revokedByLedger.injects.length, 1);
    equal("(h) the row it resolved to is marked revoked", revokedByLedger.injects[0].canceled, true);
    equal("(h) it is still not 'taken'", revokedByLedger.injects[0].pickedUp, false);

 // The same event naming index 0 resolves to the human's message: our rows must not move.
    const foreignRevoked = buildView(
      foldAll([...insertedBoth, ev("agent/inbox/spliced", { target: "next-step", start: 0, removedCount: 1, inserted: [], outcome: "canceled" })]),
      T0 + 100000,
    );
    equal("(h) cancelling someone else's message leaves our row pending", foreignRevoked.injects[0].canceled, undefined);
    equal("(h) and the ledger dropped exactly that id", foldAll([
      ...insertedBoth,
      ev("agent/inbox/spliced", { target: "next-step", start: 0, removedCount: 1, inserted: [], outcome: "canceled" }),
    ]).inboxIds["next-step"], ["inj-2"]);

 // A splice the fold cannot place (index past the end, negative, garbage) must degrade to a
 // no-op — never throw: a throw here is `SESSION_QUERY_CORRUPT_SESSION` for the whole session.
    const outOfRange = foldAll([
      ...insertedBoth,
      ev("agent/inbox/spliced", { target: "next-step", start: 99, removedCount: 5, inserted: [], outcome: "canceled" }),
      ev("agent/inbox/spliced", { target: "next-step", start: -3, removedCount: Number.NaN }),
      ev("agent/inbox/spliced", { target: "next-turn", start: "0", removedCount: 0, inserted: [ourMessage] }),
      ev("agent/inbox/spliced", { target: "no-such-list", start: 0, removedCount: 1, inserted: [] }),
      ev("agent/inbox/spliced", null),
    ]);
    equal("(h) an unplaceable splice is a no-op, not a crash", outOfRange.inboxIds["next-step"], ["h-1", "inj-2"]);
    equal("(h) an unknown target never invents a list", Object.keys(outOfRange.inboxIds).sort(), ["next-step", "next-turn"]);
    equal("(h) the clamp keeps an over-long cancel from eating the ledger", buildView(outOfRange, T0 + 100000).injects[0].canceled, undefined);

 // A REPEATED event is the honest worry: a replayed log, or a host that announces the same
 // removal twice. Both cancellation shapes must be idempotent — same row, no throw.
    const repeatDiscard = [
      ...fresh,
      ev("agent/inbox/discarded", { message: { id: "inj-1", source: { kind: "plugin:dsh-workflow-map" } } }),
      ev("agent/inbox/discarded", { message: { id: "inj-1", source: { kind: "plugin:dsh-workflow-map" } } }),
    ];
    const afterTwoDiscards = foldAll(repeatDiscard);
    equal("(h) a repeated discard event is idempotent, not a crash", buildView(afterTwoDiscards, T0 + 100000).injects[0].canceled, true);
    equal("(h) and the second one changed nothing at all", foldEvent(afterTwoDiscards, repeatDiscard[repeatDiscard.length - 1]), afterTwoDiscards);

    const repeatedLedgerCancel = foldAll([
      ...insertedBoth,
      ev("agent/inbox/spliced", { target: "next-step", start: 1, removedCount: 1, inserted: [], outcome: "canceled" }),
      ev("agent/inbox/spliced", { target: "next-step", start: 1, removedCount: 1, inserted: [], outcome: "canceled" }),
    ]);
    equal("(h) a repeated positional cancel leaves the row revoked", buildView(repeatedLedgerCancel, T0 + 100000).injects[0].canceled, true);
    equal("(h) and an empty index cannot un-revoke or invent a victim", repeatedLedgerCancel.inboxIds["next-step"], ["h-1"]);
  }

 // (i) needs-confirm: an open approval, an unanswered question, and their settled forms.
  {
    resetSeq();
    const base = [todos([["需要审批的步", "in_progress"]])];
    const open = buildView(foldAll([...base, ev("approval/asked", { id: "ap-1", reason: "要提权", toolName: "pwsh" })]), T0 + 100000);
    equal("(i) an open approval marks its step 需确认", open.steps[0].pendingConfirm.length, 1);
    equal("(i) the flag says it is an approval", open.steps[0].pendingConfirm[0].kind, "approval");
    const granted = buildView(
      foldAll([
        ...base,
        ev("approval/asked", { id: "ap-1", reason: "要提权", toolName: "pwsh" }),
        ev("approval/decided", { id: "ap-1", outcome: "allowed-once" }),
      ]),
      T0 + 100000,
    );
    equal("(i) a granted approval clears the flag", granted.steps[0].pendingConfirm.length, 0);
    const rejected = buildView(
      foldAll([
        ...base,
        ev("approval/asked", { id: "ap-1", reason: "要提权", toolName: "pwsh" }),
        ev("approval/decided", { id: "ap-1", outcome: "rejected" }),
      ]),
      T0 + 100000,
    );
    equal("(i) a rejected approval stays open (the host re-asks)", rejected.steps[0].pendingConfirm.length, 1);
    const asked = buildView(foldAll([...base, toolCall("ask_user_question", { questions: [{ question: "选哪个？" }] }, "q-1")]), T0 + 100000);
    equal("(i) an unanswered ask_user_question marks its step", asked.steps[0].pendingConfirm.length, 1);
    const answered = buildView(
      foldAll([
        ...base,
        toolCall("ask_user_question", { questions: [{ question: "选哪个？" }] }, "q-1"),
        toolResult("q-1", "用户选择：A"),
      ]),
      T0 + 100000,
    );
    equal("(i) an answered question clears the flag", answered.steps[0].pendingConfirm.length, 0);
  }

 // (j) exactly ONE running step, whatever the table says.
  {
    resetSeq();
    const two = buildView(
      foldAll([
        todos([["第一步", "in_progress"], ["第二步", "pending"]]),
        todos([["第一步", "completed"], ["第二步", "in_progress"]]),
      ]),
      T0 + 100000,
    );
    equal("(j) exactly one step is running", two.steps.filter((step) => step.status === "running").length, 1);
    equal("(j) it is the todo table's in_progress row", two.steps[1].status, "running");
    const both = buildView(foldAll([todos([["甲", "in_progress"], ["乙", "in_progress"]])]), T0 + 100000);
    equal("(j) two in_progress rows still yield one running step", both.steps.filter((s) => s.status === "running").length, 1);
    equal("(j) counts.running agrees with the rows", both.counts.running, 1);
  }

 // (k) the view is EXACTLY the current todo table (no orphan history rows).
  {
    resetSeq();
    const synced = buildView(
      foldAll([
        todos([["旧任务 A", "completed"], ["旧任务 B", "in_progress"]]),
        toolCall("read", { path: "C:\\repo\\a.js" }, "s1"),
        toolResult("s1", "a"),
        todos([["新任务 1", "in_progress"], ["新任务 2", "pending"]]),
      ]),
      T0 + 100000,
    );
    equal("(k) the view keeps only the rows the current table lists", synced.steps.map((s) => s.title), ["新任务 1", "新任务 2"]);
    equal("(k) every published node points at a surviving row", synced.nodes.every((n) => n.stepIndex >= 0 && n.stepIndex < 2), true);
  }

 // The view's node count never exceeds what the state keeps.
  check("the view never publishes more nodes than one step holds", view.nodes.length <= view.steps.length * NODES_PER_STEP);
}

// ---------------------------------------------------------------------------
// (n) the two percent distortions (the host-side projection is GONE)
// ---------------------------------------------------------------------------
// Every number below is written out by hand from the arithmetic the plan promises, never by
// re-running the implementation: a wrong median, a wrong clamp or a wrong source fails here.
//
// The projected REMAINING time was deleted by user request: the host no longer
// computes it, no view carries it and the browser half no longer reads it. The old (n1)/(n1b)/(n1c
// upper clamp)/(n1d lower clamp)/(n2 forced sub-minute) assertions pinned that projection's bounds;
// those numbers no longer exist, so each is replaced by the PERCENT side of the SAME scenario (the
// routes introduced earlier) plus the "no such field survives anywhere" contract in
// (n7)/(n8). Not one of them was merely deleted, and the finished-step duration pool those scenarios
// produce is still asserted — the time baseline still divides by it.
//
// 2026-11-01, the global-rate removal. `percentFor` used to hand a RUNNING step the todo table's
// own completion ratio (`done rows / all rows`) — twice: once instead of a self-report, once below
// it. That ratio is a session-level fact, not a measurement of the step, so both branches are gone
// and the routes are now `model` → `baseline` → `baseline:steps` → `none`. The six assertions that
// pinned the old behaviour keep their SCENARIO and change their ORACLE: (n1)/(n1b)/(n1c)/(n1d) now
// have to show that the ratio is NOT what a step displays, and (n4)/(n5) that a self-report is not
// adjusted by it in either direction. Every expected number below carries its arithmetic in the
// comment above it.

{
 /** A `todo/write` at an explicit time (the module-level builder always uses T0 + seq·1000). */
  const todoWrite = (rows, time) =>
    ev("todo/write", { todos: rows.map(([content, status]) => ({ content, status })) }, time === undefined ? {} : { time });
 /** The view the host would build `afterMs` past the last folded event. */
  const laterView = (state, afterMs) => buildView(state, state.asOf + afterMs);
 /** `[['r2','pending'], …]` — a run of plain rows. */
  const pendingRows = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => [`r${from + i}`, "pending"]);

 // --- (n1) the finished-step pool still feeds the baseline; the checklist ratio carries the bar ---
  resetSeq();
  const twoStep = foldAll([
    userMessage("两步任务"),
    todoWrite([["甲", "in_progress"], ["乙", "pending"]]), // 甲 opens at T0 + 2 s
    todoWrite([["甲", "completed"], ["乙", "in_progress"]], T0 + 302000), // 甲 ran 300 s; 乙 opens
  ]);
  equal("(n1) the finished step left exactly one duration behind", twoStep.durations, [300000]);
  const n1 = laterView(twoStep, 60000); // 乙 is 60 s in
  // ARITHMETIC: one finished step ⇒ the pool is [300 s], so the baseline is 300 000 ms. 乙 has run
  // 60 s ⇒ round(60 000 / 300 000 × 100) = round(20) = 20, source `baseline`. The two-row table is
  // at 1 of 2 = 50 %, and THAT number must not appear on the step: it belongs to the session.
  equal("(n1) the time baseline is the number, not the session's 1-of-2 ratio", [n1.steps[1].percent, n1.steps[1].percentSource], [20, "baseline"]);
  equal("(n1) and it is emphatically not the global 50 %", n1.steps[1].percent === 50, false);
  equal("(n1) a closed step stays pinned at 100 % with its own source", [n1.steps[0].percent, n1.steps[0].percentSource], [100, "closed"]);

  // The same step later. ARITHMETIC: 400 000 / 300 000 = 133.3 → 133, clamped to the 90 % ceiling
  // of the extrapolation route. It must still not be the table's 50 %.
  const n1b = laterView(twoStep, 400000);
  equal("(n1b) 400 s in, the baseline is clamped at the 90 % ceiling", [n1b.steps[1].percent, n1b.steps[1].percentSource], [90, "baseline"]);
  equal("(n1b) and 400 s later it still is not the global 50 %", n1b.steps[1].percent === 50, false);

 // --- (n1c) the upper clamp: an underestimated percent cannot project for ever -----------------
  resetSeq();
  const oneOf20 = foldAll([
    userMessage("二十行"),
    todoWrite([["r1", "in_progress"], ...pendingRows(2, 20)]),
    todoWrite([["r1", "completed"], ["r2", "in_progress"], ...pendingRows(3, 20)], T0 + 302000),
  ]);
  const n1c = laterView(oneOf20, 400000);
  equal("(n1c) the measured ratio really is 1 of 20", [oneOf20.todos.filter((item) => item.status === "completed").length, oneOf20.todos.length], [1, 20]);
  // ARITHMETIC: same pool as (n1) — one finished step of 300 s (300 000 ms). r2 has run 400 s ⇒
  // 133.3 → 133 → clamped to 90. THE POINT OF THIS CASE: the old defect made this row read exactly
  // the session's 1-of-20 = 5 %. Asserting only "not `todos`" would pass even if a different bug
  // happened to produce 5 %, so the 5 itself is asserted against.
  equal("(n1c) 1 of 20 rows does NOT read 5 %; the time baseline does", [n1c.steps[1].percent, n1c.steps[1].percentSource], [90, "baseline"]);
  equal("(n1c) the exact old-defect value never comes back", n1c.steps[1].percent === 5, false);
  check("(n1c) no running step carries the todo-table source any more", n1c.steps.every((step) => step.percentSource !== "todos"), JSON.stringify(n1c.steps.map((step) => step.percentSource)));

 // --- (n1d) nineteen of twenty rows is still a MEASUREMENT, capped at 99 % for an open step -----
  resetSeq();
  const nineteenOf20 = foldAll([
    userMessage("十九行"),
    todoWrite([["r1", "in_progress"], ...pendingRows(2, 20)]),
    todoWrite([["r1", "completed"], ...Array.from({ length: 18 }, (_, i) => [`r${i + 2}`, "completed"]), ["r20", "in_progress"]], T0 + 300000),
  ]);
  const n1d = laterView(nineteenOf20, 300000);
  // ARITHMETIC: the 19 finished rows each contributed a duration; the median of the pool is 298 000 ms
  // (the first row's 298 s — it opened after the user message and closed at T0 + 300 s). 300 000 /
  // 298 000 = 100.7 → 101 → clamped to 90. The session's 19-of-20 = 95 % must not appear.
  equal("(n1d) 19 of 20 rows does NOT read 95 %; the time baseline does", [n1d.steps[19].percent, n1d.steps[19].percentSource], [90, "baseline"]);
  equal("(n1d) the exact old-defect value never comes back", n1d.steps[19].percent === 95, false);

 // --- (n2) a ≥90 % self-report still stands alone with no done row to measure ------------------
  resetSeq();
  const claimed = foldAll([
    userMessage("自报九成五"),
    todoWrite([["甲", "in_progress"], ["乙", "pending"]]),
    report(95),
  ]);
  const n2 = laterView(claimed, 3600000); // an hour in, on a plan with no finished step yet
  equal("(n2) the percent really is the model's own report", n2.steps[0].percentSource, "model");
  equal("(n2) an hour later the report still stands (nothing measures it down)", n2.steps[0].percent, 95);

 // --- (n3) one row and no finished step: still no number to show --------------------------------
  resetSeq();
  const single = foldAll([userMessage("一件事"), todoWrite([["只此一步", "in_progress"]])]);
  const n3 = laterView(single, 600000);
  equal("(n3) one step and no finished step ⇒ no number and no source", [n3.steps[0].percent, n3.steps[0].percentSource], [null, "none"]);

 // --- (n4) an inflated self-report no longer pins the bar -------------------------------------
  resetSeq();
  const inflated = foldAll([
    userMessage("自报虚高"),
    todoWrite([["1. a", "in_progress"], ["2. b", "pending"], ["3. c", "pending"], ["4. d", "pending"], ["5. e", "pending"]]),
    report(85),
    todoWrite([["1. a", "in_progress"], ["2. b", "completed"], ["3. c", "completed"], ["4. d", "pending"], ["5. e", "pending"]]),
  ]);
  const n4 = laterView(inflated, 60000);
  // The table is at 2 of 5 = 40 %, and the old code REPLACED the 85 with that 40 (an inflated report
  // could not stand). A self-report is a statement about the step, so it is now the number as-is.
  equal("(n4) an inflated self-report IS the number now", [n4.steps[0].percent, n4.steps[0].percentSource], [85, "model"]);
  equal("(n4) and the global 2-of-5 = 40 % never overrides it", n4.steps[0].percent === 40, false);
  equal("(n4) the high-water record is kept, not rolled back", n4.steps[0].maxPercent, 85);

 // --- (n5) a stale low report cannot hide measured work ---------------------------------------
  resetSeq();
  const staleLow = foldAll([
    userMessage("自报偏低"),
    todoWrite([["1. a", "in_progress"], ["2. b", "completed"], ["3. c", "completed"], ["4. d", "completed"], ["5. e", "pending"]]),
    report(40),
  ]);
  const n5 = laterView(staleLow, 60000);
  // The table is at 3 of 5 = 60 %, and the old code RAISED the 40 to that 60 (a stale low report
  // could not hide measured work). Same rule in the other direction: the report stands, and the
  // recorded high-water stays at 40 because nothing above it was ever published for this step.
  equal("(n5) a stale low self-report is the number too (neither direction is adjusted)", [n5.steps[0].percent, n5.steps[0].percentSource], [40, "model"]);
  equal("(n5) and the global 3-of-5 = 60 % never raises it", n5.steps[0].percent === 60, false);
  equal("(n5) the high-water record follows the number actually published", n5.steps[0].maxPercent, 40);

 // --- (n6) the cold-start bar from the plan's own ordinal -------------------------------------
  resetSeq();
  const ordinalPlan = foldAll([userMessage("三步计划"), todoWrite([["1. 甲", "pending"], ["2. 乙", "in_progress"], ["3. 丙", "pending"]])]);
  const n6 = laterView(ordinalPlan, 60000);
  equal("(n6) no finished step ⇒ the plan's ordinal carries the bar", [n6.steps[1].percent, n6.steps[1].percentSource], [67, "baseline:steps"]);
 // The ordinal route is an extrapolation like the time baseline, so it is capped at 90 %: “step 3 of
 // 3 is in progress” must not print a finished-looking 100 %.
  resetSeq();
  const lastOfPlan = foldAll([userMessage("三步计划"), todoWrite([["1. 甲", "pending"], ["2. 乙", "pending"], ["3. 丙", "in_progress"]])]);
  equal("(n6) the last ordinal of a plan is capped at 90 %, never a pinned 100", [lastOfPlan.steps[2].percent, lastOfPlan.steps[2].percentSource], [90, "baseline:steps"]);
  resetSeq();
  const firstOfPlan = foldAll([userMessage("三步计划"), todoWrite([["1. 甲", "in_progress"], ["2. 乙", "pending"], ["3. 丙", "pending"]])]);
  equal("(n6) the FIRST step gets no ordinal bar (0 of N is not progress)", [firstOfPlan.steps[0].percent, firstOfPlan.steps[0].percentSource], [null, "none"]);

 // --- (n7) the projected-remaining field is GONE — from the state AND from the view --------------
  check("(n7) the state never carries etaMs", JSON.stringify(inflated).indexOf("etaMs") === -1 && Object.keys(inflated.steps[0]).indexOf("etaMs") === -1, Object.keys(inflated.steps[0]).join(","));
  check("(n7) the view does NOT carry it either (no consumer-less field)", !Object.prototype.hasOwnProperty.call(n4.steps[0], "etaMs") && !Object.prototype.hasOwnProperty.call(n4.steps[1], "etaMs") && JSON.stringify(n4).indexOf("etaMs") === -1, Object.keys(n4.steps[0]).join(","));
  equal("(n7) the view stays lossless JSON with the field gone", JSON.parse(JSON.stringify(n4)), n4);

  // --- (n9) the acceptance criterion itself: no step number equals the session's global rate -------
  // 8 rows, 4 completed, 1 running, NO self-report. The session's completion ratio is 4 / 8 = 50 %.
  // Under the deleted branch this running step read exactly `min(99, round(50)) = 50`. ARITHMETIC
  // for what it reads now: there is no finished step yet (the four completed rows were created as
  // completed by a single table, so none of them ever contributed a duration ⇒ `medianOf` is null),
  // which is the cold start: ordinal 5 of 8 ⇒ round(5 / 8 × 100) = round(62.5) = 63, source
  // `baseline:steps`, under the 90 % ceiling.
  resetSeq();
  const eightRows = foldAll([
    userMessage("八步会话"),
    todoWrite([["r1", "completed"], ["r2", "completed"], ["r3", "completed"], ["r4", "completed"], ["r5", "in_progress"], ["r6", "pending"], ["r7", "pending"], ["r8", "pending"]]),
  ]);
  const n9 = laterView(eightRows, 60000);
  equal("(n9) the scenario really is 4 of 8 completed", [eightRows.todos.filter((item) => item.status === "completed").length, eightRows.todos.length], [4, 8]);
  equal("(n9) the running step reads the plan's own ordinal, not the session ratio", [n9.steps[4].percent, n9.steps[4].percentSource], [63, "baseline:steps"]);
  equal("(n9) the global completion rate (50 %) is NOT the step's number", n9.steps[4].percent === 50, false);
  check("(n9) and its source is never the todo table", n9.steps[4].percentSource !== "todos", n9.steps[4].percentSource);
  check("(n9) NO running step in the view carries the todo-table source", n9.steps.filter((step) => step.status === "running").every((step) => step.percentSource !== "todos"), JSON.stringify(n9.steps.map((step) => [step.status, step.percentSource])));

 // --- (n8) replay / idempotence with the new branches ------------------------------------------
  resetSeq();
  const mixed = [
    userMessage("混合"),
    todoWrite([["1. a", "in_progress"], ["2. b", "pending"], ["3. c", "pending"]]),
    report(85),
    toolCall("read", { path: "C:\\repo\\a.js" }, "n1"),
    toolResult("n1", "a"),
    todoWrite([["1. a", "in_progress"], ["2. b", "completed"], ["3. c", "pending"]]),
    report(30),
  ];
  const onceMixed = foldAll(mixed);
  let replayedMixed = onceMixed;
  for (const event of mixed) replayedMixed = foldEvent(replayedMixed, event);
  equal("(n8) replaying the same events changes nothing", JSON.stringify(replayedMixed), JSON.stringify(onceMixed));
  const n8a = laterView(onceMixed, 90000);
  equal("(n8) building the view twice is deterministic", JSON.stringify(laterView(onceMixed, 90000)), JSON.stringify(n8a));
  check("(n8) no NaN and no out-of-range percent ever leaves the fold", n8a.steps.every((step) => step.percent === null || (Number.isFinite(step.percent) && step.percent >= 0 && step.percent <= 100)), JSON.stringify(n8a.steps.map((step) => step.percent)));
  check("(n8) and no projected-remaining field rides along either", n8a.steps.every((step) => step.etaMs === undefined), "the field is gone from every step, not merely null");
}

// ---------------------------------------------------------------------------
// (o) a NUMBERED todo table after an unnumbered one — the ordinal must survive
// ---------------------------------------------------------------------------
// Measured 2026-10-29 on session 164e339f ("n8n download and localisation tutorial"): the
// model wrote a 7-row UNNUMBERED table, then replaced it with a 14-row table whose rows carry
// an explicit "1. " .. "14. " prefix. Two defects showed up together and both are asserted here:
//
//   (o1) `syncToTodos` parsed the ordinal from the ALREADY-STRIPPED title, so `planIndexOf`
//        always returned null and every created row lost its ordinal;
//   (o2) `foldTodos` matched rows positionally and never re-stamped the ordinal, so a row that
//        used to be unnumbered kept its stale planIndex and the plan merge then patched a
//        WRONG plan step onto it. The visible result was plan steps 3-7 rendered twice and the
//        running step in the wrong slot.
{
  resetSeq();
  const todoWrite = (rows, time) =>
    ev("todo/write", { todos: rows.map(([content, status]) => ({ content, status })) }, time === undefined ? {} : { time });
  const laterView = (state, afterMs) => buildView(state, state.asOf + afterMs);
  const unnumbered = foldAll([
    userMessage("先写一张不带序号的表"),
    todoWrite([
      ["核验部署硬事实", "completed"],
      ["诊断 npm 安装失败根因", "completed"],
      ["用 --ignore-scripts 装入 D 盘", "in_progress"],
      ["补装 sqlite3 预编译二进制", "pending"],
      ["启动 n8n 验证英文界面", "pending"],
      ["替换 dist 并设 zh-CN", "pending"],
      ["撰写教程正文并转 docx", "pending"],
    ]),
    // The replacement table: 14 rows, every one carrying its own ordinal.
    todoWrite(
      Array.from({ length: 14 }, (_, i) => [`${i + 1}. 步骤标题${i + 1}`, i === 0 ? "completed" : "pending"]),
    ),
  ]);
  const o1 = laterView(unnumbered, 1000);
  equal("(o1) the numbered table yields exactly 14 rows", o1.steps.length, 14);
  equal(
    "(o1) every row carries the ordinal its own text states",
    o1.steps.map((step) => step.planIndex).join(","),
    Array.from({ length: 14 }, (_, i) => i + 1).join(","),
  );
  const titles = o1.steps.map((step) => step.title);
  equal("(o2) no step title appears twice", new Set(titles).size, titles.length);
  equal(
    "(o2) the row keeps its own title instead of inheriting a neighbour's",
    titles.map((title) => (title.match(/^步骤标题(\d+)$/) || [])[1]).join(","),
    Array.from({ length: 14 }, (_, i) => i + 1).join(","),
  );
}

// ---------------------------------------------------------------------------
// (p) the plan's requiresConfirmation reaches the view's pendingConfirm
// ---------------------------------------------------------------------------
// The log half of the flag (an open approval, an unanswered question) is derived by buildView.
// The PLAN half lives in orchestrator.json and is merged by applyPlanToView. Measured
// 2026-10-29: that merge did not exist, so a plan step carrying requiresConfirmation:true
// rendered with no needs-confirmation flag at all.
{
  resetSeq();
  const todoWrite = (rows, time) =>
    ev("todo/write", { todos: rows.map(([content, status]) => ({ content, status })) }, time === undefined ? {} : { time });
  const laterView = (state, afterMs) => buildView(state, state.asOf + afterMs);
  const flat = foldAll([
    userMessage("需要确认点的计划"),
    todoWrite([
      ["1. 环境基线", "completed"],
      ["2. 视频服务扩展", "pending"],
      ["3. 素材采集器", "pending"],
    ]),
  ]);
  const view = laterView(flat, 1000);
  const plan = {
    ver: 1,
    phase: "executing",
    taskTitle: "需要确认点的计划",
    task: "需要确认点的计划",
    summary: "",
    // `applyPlanToView` reads these two through `planStatusOf`; a plan object without them
    // throws instead of merging, so the fixture carries the same shape the reader produces.
    statuses: {},
    stepReports: [],
    skipped: [],
    steps: [
      { index: 1, title: "环境基线", requiresConfirmation: false },
      { index: 2, title: "视频服务扩展", requiresConfirmation: true },
      { index: 3, title: "素材采集器", requiresConfirmation: false },
    ],
  };
  const merged = applyPlanToView(view, plan);
  equal(
    "(p) only the plan step that requires confirmation carries the flag",
    merged.steps.map((step) => (step.pendingConfirm || []).length).join(","),
    "0,1,0",
  );
  equal(
    "(p) the flag is attributed to the right plan step",
    merged.steps[1].pendingConfirm[0].kind,
    "plan",
  );
  equal(
    "(p) applying the same plan twice does not duplicate the row",
    applyPlanToView(merged, plan).steps.map((step) => (step.pendingConfirm || []).length).join(","),
    "0,1,0",
  );
  const doneView = { ...view, steps: view.steps.map((step, at) => (at === 1 ? { ...step, status: "done" } : step)) };
  equal(
    "(p) a finished step never carries the flag",
    applyPlanToView(doneView, plan).steps.map((step) => (step.pendingConfirm || []).length).join(","),
    "0,0,0",
  );
}

// ---------------------------------------------------------------------------
// (q) a plan row's own step FILE annotation must not become part of the title
// ---------------------------------------------------------------------------
// PAE renders each plan row as "1. title（qualifier）（step-01-x.md）": the file is an annotation,
// not title text. Measured 2026-10-30 on session 1bb4baa0: the plan summary rewrote step 1's title
// to the annotated form while the ledger's `stepKey` already held the table's wording, the very next
// todo/write therefore judged the row unchanged, and the annotated title survived into the view —
// one step the todo table does not list (audit-real constraint ①). No step instruction follows here
// on purpose: in that session it arrived through `agent/inbox/spliced`, which does not re-title a step.
{
  resetSeq();
  const planSummaryText =
    "[plan-and-execute 计划摘要]\n概述：（无）\n步骤（共 2 步）：\n1. 修复前基线取证（五测/对抗脚本）（step-01-baseline-repro.md）\n2. 修复与验证（step-02-fix.md）";
  const events = [
    userMessage("带括号标题的计划"),
    // The todo table lands FIRST (measured order: submit_plan result -> todo/write -> plan summary).
    todos([
      ["1. 修复前基线取证（五测/对抗脚本）", "in_progress"],
      ["2. 修复与验证", "pending"],
    ]),
    toolCall("read", { path: "C:\\repo\\a.js" }, "q-call-1"),
    toolResult("q-call-1", "a.js contents"),
    ev("user/message", {
      content: [{ type: "text", text: planSummaryText }],
      source: { kind: "plugin:dsh-plan-and-execute", form: "instructions", summary: "plan-and-execute：计划摘要" },
      role: "user",
      id: "p1",
    }),
    // PAE rewrites the whole table right after the plan summary lands (measured: seq 380 plan
    // summary, seq 381 todo/write). The annotated title must be gone by then.
    todos([
      ["1. 修复前基线取证（五测/对抗脚本）", "in_progress"],
      ["2. 修复与验证", "pending"],
    ]),
  ];
  const state = foldAll(events);
  const view = buildView(state, state.asOf);
  equal(
    "(q) the plan row's step-file annotation never reaches the step title",
    view.steps.map((step) => step.title),
    ["修复前基线取证（五测/对抗脚本）", "修复与验证"],
  );
  equal(
    "(q) a plan-summary retitle does not orphan the tools already in the row",
    view.nodes.map((node) => node.stepIndex),
    [0],
  );
  const bare = (value) => value.replace(/^\s*\d+\s*[.、．)]\s*/, "").trim();
  const rows = new Set(view.todos.map((todo) => bare(todo.content)));
  equal(
    "(q) every step is a row of the live todo table (audit-real constraint ①)",
    view.steps.filter((step) => !rows.has(step.title)).map((step) => step.title),
    [],
  );
  equal("(q) the qualifier the table keeps is still part of the title", view.steps[0].title, "修复前基线取证（五测/对抗脚本）");
  equal("(q) ordinals still come from the plan", view.steps.map((step) => step.planIndex), [1, 2]);
}
// ---------------------------------------------------------------------------
// (r) the todo table owns the step ledger
// ---------------------------------------------------------------------------
{
  // A row the table marks pending again demotes the step it used to complete: the table is the one
  // place that reports a step's outcome, and a `done` step for a row nobody claims is finished work
  // that never happened.
  const back = foldAll([todos([["整理证据", "completed"]]), todos([["整理证据", "pending"]])]);
  equal("(r) a pending row demotes a completed step", back.steps[0].status, "pending");
  equal("(r) the demoted step carries no number", back.steps[0].percent, null);

  // A pending row must not take over the running step. Slot reuse after a rewording is what made a
  // pending row hijack the live step in a real session (2026-10-30).
  const hijack = foldAll([
    todos([["甲", "completed"], ["乙", "in_progress"]]),
    todos([["甲", "completed"], ["丙", "pending"]]),
  ]);
  equal(
    "(r) a reworded table's pending row shows as pending, never as the running row it replaced",
    hijack.steps.map((step) => [step.title, step.status]),
    [
      ["甲", "done"],
      ["丙", "pending"],
    ],
  );
  // The same row turning in_progress in the next table must RUN — before this pass the record it
  // matched kept its old `pending` and the card never lit up.
  const reopened = foldAll([
    todos([["甲", "completed"], ["乙", "pending"]]),
    todos([["甲", "completed"], ["乙", "in_progress"]]),
  ]);
  equal("(r) an in_progress row runs even when its record was pending", reopened.steps[1].status, "running");

  // A pending row that no table names any more and that owns no node is a leftover of an older
  // wording; it must not sit in the step column as a permanently empty card.
  const pruned = foldAll([todos([["甲", "pending"], ["乙", "pending"]]), todos([["丙", "pending"]])]);
  equal("(r) an unnamed, empty pending row is dropped", pruned.steps.map((step) => step.title), ["丙"]);

  // Turn end closes the step that turn was running; a step the table still names as in_progress is
  // left running because it really does continue into the next turn.
  const closed = foldAll([todos([["上一步", "completed"], ["当前", "in_progress"]]), ev("turn/end", {})]);
  equal("(r) turn end keeps a step the table still calls in_progress", closed.steps[1].status, "running");
  const closed2 = foldAll([
    todos([["上一步", "completed"], ["当前", "in_progress"]]),
    todos([["上一步", "completed"], ["当前", "pending"]]),
    ev("turn/end", {}),
  ]);
  equal("(r) turn end closes a step no row claims any more", closed2.steps[1].status, "pending");

  // Pending rows never carry a number, even while the table has a completion ratio to offer.
  const numbers = foldAll([todos([["甲", "completed"], ["乙", "in_progress"], ["丙", "pending"]])]);
  equal(
    "(r) only the running row shows a figure",
    numbers.steps.map((step) => (step.percent === null ? null : "num")),
    ["num", "num", null],
  );
}

// ---------------------------------------------------------------------------
// settled: a call that came back is DONE, even with an empty body; and a result
// is not an activity. (The two reasons the panel shimmered on 2026-10-30.)
// ---------------------------------------------------------------------------

{
  const events = [
    ev("turn/start", {}),
    todos([["甲", "in_progress"]]),
    toolCall("pwsh", { command: "echo hi" }, "e-empty"),
    toolResult("e-empty", ""),
  ];
  const state = foldAll(events);
  const view = buildView(state, T0 + 60000);
  equal("(s) empty-body result still settles the node", view.nodes.map((node) => node.result), [true]);
  equal("(s) and its body is empty, not invented", view.nodes.map((node) => node.resultHead), [""]);
  equal("(s) a result is not the current activity", view.activeNode, null);

  const withBody = foldAll([ev("turn/start", {}), todos([["甲", "in_progress"]]), toolCall("read", { path: "a.js" }, "e-body"), toolResult("e-body", "code")]);
  equal("(s) a body result is settled too", buildView(withBody, T0 + 60000).nodes.map((node) => node.result), [true]);

  const handoff = foldAll([
    ev("turn/start", {}),
    todos([["甲", "in_progress"]]),
    toolCall("read", { path: "a.js" }, "h1"),
    toolResult("h1", "code"),
    toolCall("pwsh", { command: "echo two" }, "h2"),
  ]);
  const handoffView = buildView(handoff, T0 + 60000);
  equal("(s) the OPEN call keeps the highlight, not the finished one", handoffView.activeNode && handoffView.activeNode.tool, "pwsh");
}

// ---------------------------------------------------------------------------
// reopening a closed row: a closed record's 100 % cannot speak for an open row
// ---------------------------------------------------------------------------

{
  const closed = foldAll([ev("turn/start", {}), todos([["甲", "in_progress"]]), todos([["甲", "completed"]])]);
  equal("(t) the closed row is at 100", buildView(closed, T0 + 60000).steps.map((step) => step.percent), [100]);

  const reopened = foldAll([
    ev("turn/start", {}),
    todos([["甲", "in_progress"]]),
    todos([["甲", "completed"]]),
    todos([["甲", "in_progress"]]),
  ]);
  const reopenedView = buildView(reopened, T0 + 60000);
  equal("(t) reopened row is running again", reopenedView.steps.map((step) => step.status), ["running"]);
  check(
    "(t) and it does NOT inherit the 100 % high-water",
    reopenedView.steps.every((step) => step.maxPercent < 100),
    JSON.stringify(reopenedView.steps.map((step) => step.maxPercent)),
  );
  check(
    "(t) a reopened running row is never pinned at 100 %",
    reopenedView.steps.every((step) => step.percent === null || step.percent < 100),
    JSON.stringify(reopenedView.steps.map((step) => step.percent)),
  );

  // The model's latest statement is what the bar shows: a high-water record may be kept, but it
  // must not pin the number (that is a bar which can never move again).
  const walk = foldAll([
    ev("turn/start", {}),
    todos([["甲", "in_progress"]]),
    report(90),
    report(40),
  ]);
  equal("(u) the latest report is the number", buildView(walk, T0 + 60000).steps.map((step) => step.percent), [40]);
  equal("(u) while the high-water record is still kept", walk.steps[0].maxPercent, 90);

  const afterReport = foldAll([
    ev("turn/start", {}),
    todos([["甲", "in_progress"]]),
    todos([["甲", "completed"]]),
    todos([["甲", "in_progress"]]),
    report(100),
  ]);
  const reportedView = buildView(afterReport, T0 + 60000);
  equal("(t) a 100 % report on an OPEN step is capped at 99", reportedView.steps.map((step) => step.percent), [99]);
}

// ---------------------------------------------------------------------------
// (s) turn/end is a LAYERED ending: an interrupted turn closes, a normal one waits
// ---------------------------------------------------------------------------
// The defect this section pins down: a session whose turn had ended kept a step 'running' at a
// half-filled bar forever. The fix splits `turn/end` by `data.reason.kind` (measured on 167 local
// logs: completed 739 · error 171 · aborted 136 · interrupted 17 · max-tokens 4), so each case
// below states its reason EXPLICITLY and the expected outcome is written out by hand:
//   • terminal   (aborted / error / failed / interrupted) → every running row closes at 100 %;
//   • continuing (completed / max-tokens) → the row the todo table still calls in_progress stays
//     running, gains `awaitingNextTurn`, and shows NO number ("waiting" is not "40 % done");
//   • unknown / missing kind → treated as continuing and recorded in `unknownTurnReasons`.
// "The phenomenon is gone" alone would pass with these three collapsed into one another, so every
// case also asserts the OPPOSITE case's outcome (s1 proves nothing is left running, s3 proves the
// normal ending does NOT close the row).

{
  const { default: hostModule } = await import("../lib/index.js");

  /** A turn that is open and working on 甲 — the state every case below starts from. */
  const workingEvents = () => [
    userMessage("做一步"),
    ev("turn/start", { turn: 1 }),
    todos([["甲", "in_progress"], ["乙", "pending"]]),
    report(40, "四成"),
  ];
  /** `turn/end` with the given reason kind; `undefined` = the payload carries no reason at all. */
  const endingTurn = (kind) => (kind === undefined ? ev("turn/end", { turn: 1 }) : ev("turn/end", { turn: 1, reason: { kind } }));
  const closedByTurn = (kind) => [...workingEvents(), endingTurn(kind)];

  // --- (s1) an interrupted turn closes the step it was running --------------------------------
  const aborted = foldAll(closedByTurn("aborted"));
  const abortedView = buildView(aborted, aborted.asOf);
  equal("(s1) an aborted turn closes the step it was running", abortedView.steps[0].status, "done");
  equal("(s1) the closed step is pinned at 100 %", [abortedView.steps[0].percent, abortedView.steps[0].percentSource], [100, "model"]);
  equal("(s1) and NOTHING is left running", abortedView.counts.running, 0);
  equal("(s1) the turn itself is closed", abortedView.running, false);
  equal("(s1) a closed step is not waiting for any turn", abortedView.steps[0].awaitingNextTurn, false);

  // --- (s2) a failed turn and a killed turn behave exactly like an aborted one -----------------
  for (const kind of ["error", "interrupted", "failed"]) {
    const failedView = buildView(foldAll(closedByTurn(kind)), aborted.asOf);
    equal(`(s2) a '${kind}' turn closes the step too`, [failedView.steps[0].status, failedView.steps[0].percent, failedView.counts.running], ["done", 100, 0]);
  }
  // The terminal set is ONE named constant: this filter fails the moment a reason is moved in or
  // out of it without the behaviour following (that is the assertion's whole point).
  const terminalKinds = ["aborted", "error", "failed", "interrupted"];
  const terminalObserved = terminalKinds.filter((kind) => {
    const state = foldAll(closedByTurn(kind));
    return buildView(state, state.asOf).counts.running === 0;
  });
  equal("(s2) the whole terminal set closes the step (one constant, four reasons)", terminalObserved, terminalKinds);

  // --- (s3) a turn that ended normally KEEPS the step that continues into the next turn -------
  const completed = foldAll(closedByTurn("completed"));
  const completedView = buildView(completed, completed.asOf);
  equal("(s3) a completed turn leaves the in_progress step running", completedView.steps[0].status, "running");
  equal("(s3) and marks it as WAITING for the next turn", completedView.steps[0].awaitingNextTurn, true);
  equal("(s3) the second (pending) row is untouched", [completedView.steps[1].status, completedView.steps[1].awaitingNextTurn], ["pending", false]);
  equal("(s3) the session itself is idle", completedView.running, false);

  // --- (s4) and it shows NO number (the old behaviour pinned it, or froze the last guess) -----
  equal("(s4) a waiting step publishes no percent", completedView.steps[0].percent, null);
  equal("(s4) and says so in its source", completedView.steps[0].percentSource, "none");
  // The report(40) it received earlier is still on record: the number is WITHHELD, not erased.
  equal("(s4) the self-report is still kept on the state", completed.steps[0].maxPercent >= 40, true);

  // --- (s5) max-tokens is a normal ending, not an interruption ---------------------------------
  const capped = foldAll(closedByTurn("max-tokens"));
  const cappedView = buildView(capped, capped.asOf);
  equal(
    "(s5) a max-tokens turn waits for the next turn like any normal one",
    [cappedView.steps[0].status, cappedView.steps[0].awaitingNextTurn, cappedView.steps[0].percent, cappedView.steps[0].percentSource],
    ["running", true, null, "none"],
  );
  equal("(s5) and nothing was closed", cappedView.counts.completed, 0);

  // --- (s6) the next turn clears the wait and the number comes back ---------------------------
  const resumed = foldAll([...closedByTurn("completed"), ev("turn/start", { turn: 2 })]);
  const resumedView = buildView(resumed, resumed.asOf);
  equal("(s6) turn/start clears the waiting flag", resumedView.steps[0].awaitingNextTurn, false);
  equal("(s6) the step is executing again", [resumedView.steps[0].status, resumedView.running], ["running", true]);
  equal("(s6) and a number is published again (the model's own report)", [resumedView.steps[0].percent, resumedView.steps[0].percentSource], [40, "model"]);

  // A SECOND ending after the wait began: the step is still waiting, so an abort must be able to
  // close it from that state too — `closeStep` clearing the flag is what makes "closed" and
  // "still waiting" impossible at once (s1 alone cannot see this: it closes an EXECUTING row).
  const abortedWhileWaiting = foldAll([
    ...closedByTurn("completed"),
    ev("turn/start", { turn: 2 }),
    ev("turn/end", { turn: 2, reason: { kind: "aborted" } }),
  ]);
  const abortedWhileWaitingView = buildView(abortedWhileWaiting, abortedWhileWaiting.asOf);
  equal(
    "(s6) an abort closes a step that had been waiting, flag and all",
    [abortedWhileWaitingView.steps[0].status, abortedWhileWaitingView.steps[0].awaitingNextTurn, abortedWhileWaitingView.steps[0].percent],
    ["done", false, 100],
  );

  // The todo table can also finish a WAITING step (the model writes its own table; no new turn is
  // opened first). Closing it must clear the wait in the same write, otherwise the panel renders a
  // finished step that still claims to be waiting for a turn.
  const finishedByTable = foldAll([...closedByTurn("completed"), todos([["甲", "completed"], ["乙", "in_progress"]])]);
  const finishedByTableView = buildView(finishedByTable, finishedByTable.asOf);
  equal(
    "(s6) the todo table can finish a waiting step and clears the flag with it",
    [finishedByTableView.steps[0].status, finishedByTableView.steps[0].awaitingNextTurn, finishedByTableView.steps[0].percent],
    ["done", false, 100],
  );

  // --- (s7) an unknown or missing reason is NOT read as an interruption -----------------------
  const noReason = foldAll(closedByTurn(undefined));
  const noReasonView = buildView(noReason, noReason.asOf);
  equal("(s7) a turn/end with no reason leaves the step waiting, never closed", [noReasonView.steps[0].status, noReasonView.steps[0].awaitingNextTurn], ["running", true]);
  // The empty string is recorded ON PURPOSE: it says "this event carried no kind", which is the
  // fact a replay needs. A placeholder token like "unknown" would not distinguish the two cases.
  equal("(s7) the missing reason is recorded as the empty string", noReason.unknownTurnReasons, [""]);
  const exotic = foldAll(closedByTurn("context-window"));
  equal("(s7) a reason the code has never seen is recorded verbatim", exotic.unknownTurnReasons, ["context-window"]);
  equal("(s7) and it does not close the step either", buildView(exotic, exotic.asOf).steps[0].status, "running");
  // Deduplicated and bounded: a log that repeats one unknown reason must not grow the state.
  let repeated = foldAll(closedByTurn("completed"));
  for (let i = 0; i < 20; i += 1) repeated = foldEvent(repeated, ev("turn/end", { turn: 1, reason: { kind: "weird" } }));
  equal("(s7) the unknown-reason list stays deduplicated", repeated.unknownTurnReasons.filter((kind) => kind === "weird").length, 1);
  check("(s7) and bounded (<= 8 entries)", repeated.unknownTurnReasons.length <= 8, JSON.stringify(repeated.unknownTurnReasons));
  equal("(s7) known reasons never enter the list", [aborted.unknownTurnReasons, completed.unknownTurnReasons, capped.unknownTurnReasons], [[], [], []]);

  // --- (s8) the new field is plain JSON, and both halves survive a round trip ------------------
  equal("(s8) the view is lossless JSON", JSON.parse(JSON.stringify(completedView)), completedView);
  equal("(s8) the state is lossless JSON, waiting flag included", JSON.parse(JSON.stringify(completed)).steps[0].awaitingNextTurn, true);
  equal("(s8) the unknown-reason list is plain JSON too", JSON.parse(JSON.stringify(noReason)).unknownTurnReasons, [""]);

  // --- (s9) a checkpoint restore keeps the flag, and repairs a missing one to false -----------
  // Driven through the HOST's own stateSchema (lib/index.js) — that is the code a cold read runs,
  // so repairing the row here instead would prove nothing about the shipped path.
  let projection = null;
  hostModule.apply({
    sessionProjections: {
      register: (options) => {
        projection = options;
        return () => {};
      },
    },
    sessions: { get: () => undefined },
    webServer: { register: () => () => {} },
    effect: (execute) => execute(),
  });
  const stateSchema = projection && projection.stateSchema;
  check("(s9) the projection supplied a stateSchema", typeof stateSchema?.parse === "function", "missing stateSchema.parse");
  equal("(s9) a checkpoint with a waiting step restores the flag", stateSchema.parse(JSON.parse(JSON.stringify(completed))).steps[0].awaitingNextTurn, true);
  const withoutField = JSON.parse(JSON.stringify(completed));
  delete withoutField.steps[0].awaitingNextTurn;
  equal("(s9) a checkpoint without the field restores as not waiting", stateSchema.parse(withoutField).steps[0].awaitingNextTurn, false);
  const damagedFlag = JSON.parse(JSON.stringify(completed));
  damagedFlag.steps[0].awaitingNextTurn = "yes";
  equal("(s9) a damaged flag repairs to false, never to the string", stateSchema.parse(damagedFlag).steps[0].awaitingNextTurn, false);
  equal("(s9) the unknown-reason list survives the restore", stateSchema.parse(JSON.parse(JSON.stringify(noReason))).unknownTurnReasons, [""]);
  equal("(s9) a checkpoint without it restores as an empty list", stateSchema.parse({}).unknownTurnReasons, []);
  equal("(s9) and drops non-string entries instead of coercing them", stateSchema.parse({ unknownTurnReasons: ["a", 5, null, "b"] }).unknownTurnReasons, ["a", "b"]);

  // The wire schema treats the flag as OPTIONAL but type-checked: "yes" reaching the browser half
  // would render "waiting" out of a value no code ever wrote.
  const viewSchema = projection && projection.wire && projection.wire.viewSchema;
  check("(s9) the view schema exists", typeof viewSchema?.parse === "function", "missing viewSchema.parse");
  let rejected = false;
  try {
    viewSchema.parse({ ...completedView, steps: [{ ...completedView.steps[0], awaitingNextTurn: 1 }] });
  } catch {
    rejected = true;
  }
  check("(s9) the view schema rejects a non-boolean waiting flag", rejected, "a numeric flag was accepted");
}

// ---------------------------------------------------------------------------
// (t) node attribution follows the step's EVENT INTERVAL, and an uncovered node is COUNTED
// ---------------------------------------------------------------------------
//
// This is the section that separates "the symptom is gone" from "the rule is right".
//
// The old rule named a step from the CURRENT pointer (`runningStep` / the in_progress todo row), so:
//   • a batch of calls arriving after the table had moved on all landed on whichever row was last
//     touched, and
//   • work whose row no longer existed was dropped outright, leaving `done` steps reading "0 tools".
// Both were measured on 167 local logs (2026-11-01): 193 of 504 `done` steps owned no node (38.3%),
// and 36 sessions had one step holding every node in the session.
//
// A rewrite that merely stops filling the last step — "drop them instead" — would make the first
// number look better and the second better still, while being exactly as wrong. So this section pins
// the MECHANISM, not the counts:
//   (t1)+(t2)  the interval is recorded and a node inside it goes to THAT step, even after the table
//              has moved on to a later row (the case the pointer got wrong);
//   (t3)       a batch the intervals do not cover is counted as unassigned, NOT pushed into a step;
//   (t4)       the positive control: with a covering interval the same call DOES land — so (t3) cannot
//              be satisfied by returning null unconditionally;
//   (t5)       overlap resolves deterministically to the later start.
// Together these fail for both the old rule (t2/t3) and for a "just drop everything" shortcut (t1/t4/t5).
{
  // --- (t1)+(t2) the interval is recorded, and nodes inside it follow it -----------------------
  // Two rows: 甲 runs first and is completed, then 乙 starts. The calls are placed so that each
  // arrives while its OWN step's window covers it — including one that arrives AFTER 甲 was closed,
  // which the pointer rule would have given to 乙.
  // SEQUENCE ORDER IS THE CONTRACT: the fold consumes events in seq order, so every builder call
  // below must run in the order the event HAPPENS. Assigning seqs by declaration order instead
  // would fold a later event first, the fold would reject it as a replay (`seq <= state.seq`), and
  // the section would be testing its own mistake instead of the attribution rule.
  resetSeq();
  const who = userMessage("两步");
  const firstTable = todos([["甲", "in_progress"], ["乙", "pending"]]);
  const callA = toolCall("read", { path: "C:\\repo\\甲.js" }, "t-call-a");
  const resA = toolResult("t-call-a", "甲 contents");
  const secondTable = todos([["甲", "completed"], ["乙", "in_progress"]]);
  const callB = toolCall("write", { file_path: "C:\\repo\\乙.js" }, "t-call-b");
  const resB = toolResult("t-call-b", "ok");
  const tEvents = [who, firstTable, callA, resA, secondTable, callB, resB];
  const tState = foldAll(tEvents);
  const tView = buildView(tState, tState.asOf);
  // The windows are the seqs of the TWO todo/write events, which is the only thing that can open
  // or close one: the first table started 甲, the second closed it and started 乙.
  equal(
    "(t1) the first step's interval opens at its own in_progress row and closes at the closing table",
    [tState.steps[0].windowStart, tState.steps[0].windowEnd],
    [firstTable.seq, secondTable.seq],
  );
  check(
    "(t1) windowStart < windowEnd (a step that ran has a non-empty interval)",
    tState.steps[0].windowStart < tState.steps[0].windowEnd,
    `got ${tState.steps[0].windowStart}..${tState.steps[0].windowEnd}`,
  );
  equal("(t1) the second step's interval opens at the same table that closed the first", tState.steps[1].windowStart, secondTable.seq);
  equal("(t1) and it is still open (it is the running step)", tState.steps[1].windowEnd, null);

  // (t2) BOTH calls land on the step whose interval contains them. `callA` runs inside 甲's window;
  // `callB` runs inside 乙's. The pointer rule would have put the first one somewhere else only if 甲
  // had already been closed when it arrived — which is exactly (t3)'s shape, not this one. What (t2)
  // proves is the positive direction: interval containment really names the step.
  // (t2) Each NODE lands on the step whose interval contains its seq. Only tool/CALLS produce
  // nodes — a `tool/result` patches the node its call already created, it does not append a second
  // one — so this session has exactly two nodes: callA inside 甲's interval, callB inside 乙's.
  equal(
    "(t2) each node lands on the step whose interval contains its seq",
    tView.nodes.map((node) => node.stepIndex),
    [0, 1],
  );
  equal("(t2) each step therefore owns exactly its own work", tView.steps.map((step) => step.nodeCount), [1, 1]);
  equal("(t2) nothing was left unattributed in this session", tView.unassigned.nodes, 0);

  // --- (t3) a batch written AFTER every interval closed is UNASSIGNED, not pushed into a step ----
  // The shape: the model ticks off all three rows in ONE todo/write (so 乙 and 丙 never run), then
  // makes three calls. No interval covers them — the last interval closed at that very table — so
  // every one of them must be counted, and none may land on the last step.
  resetSeq();
  const who2 = userMessage("批量勾选");
  const openTable = todos([["子", "in_progress"], ["丑", "pending"], ["寅", "pending"]]);
  const tickAll = todos([["子", "completed"], ["丑", "completed"], ["寅", "completed"]]);
  const batch1 = toolCall("read", { path: "C:\\repo\\x.js" }, "t-b1");
  const batch2 = toolCall("grep", { pattern: "x", path: "C:\\repo" }, "t-b2");
  const batch3 = toolCall("pwsh", { command: "echo hi" }, "t-b3");
  const batchEvents = [who2, openTable, tickAll, batch1, batch2, batch3];
  const batchState = foldAll(batchEvents);
  const batchView = buildView(batchState, batchState.asOf);

  equal("(t3) all three rows are done, so no step is running", batchView.counts.running, 0);
  equal("(t3) the calls after the closing table are ALL unassigned", batchView.unassigned.nodes, 3);
  // The steps own NOTHING here: the only table that ever started a row closed all three in the
  // same event that started nothing, so no interval covers the calls. "0 owned" is the correct
  // reading — the alternative (3 owned) would mean they were guessed back onto a step.
  equal("(t3) the steps shown own none of those calls", batchView.counts.nodes, 0);
  // The three steps own ONLY the nodes created inside their windows. Here that is the tables' own
  // epoch: nothing else ran. So the owned total is 3 (the todo/write is not a node) and the 3 calls
  // above are all outside it.
  equal("(t3) the last step owns no call at all", batchView.steps[2].nodeCount, 0);
  equal("(t3) sinceSeq is the FIRST seq that failed to land", batchState.unassigned.sinceSeq, batch1.seq);

  // --- (t4) the positive control: the same call DOES land when an interval covers it -----------
  // Without this, "return null always" would satisfy (t3).
  resetSeq();
  const who3 = userMessage("覆盖");
  const coverTable = todos([["甲", "in_progress"]]);
  const coveredCall = toolCall("read", { path: "C:\\repo\\covered.js" }, "t-cov");
  const coveredState = foldAll([who3, coverTable, coveredCall]);
  const coveredView = buildView(coveredState, coveredState.asOf);
  equal("(t4) a call inside an open interval is attributed to that step", coveredView.nodes.map((node) => node.stepIndex), [0]);
  equal("(t4) and therefore nothing is unassigned", coveredState.unassigned.nodes, 0);

  // --- (t5) overlapping intervals resolve to the LATER start, then the higher index -------------
  // Built by hand: two steps whose windows both contain one seq. The answer must be independent of
  // array order, so the same pair is fed in both orders.
  const mkStep = (index, start) => ({
    index,
    title: `手工${index}`,
    stepKey: `手工${index}`,
    source: "todo",
    status: "running",
    startedAt: T0,
    endedAt: null,
    awaitingNextTurn: false,
    percent: null,
    lastEstimateAt: 0,
    percentSource: "none",
    maxPercent: 0,
    reportSummary: "",
    nodeIds: [],
    nodeCount: 0,
    truncatedNodes: 0,
    windowStart: start,
    windowEnd: null,
    anchorSeq: undefined,
    planIndex: undefined,
    modelStep: null,
    lastActivityAt: 0,
    outcome: "",
    groups: [],
  });
  const early = mkStep(0, 10);
  const late = mkStep(1, 20);
  const overlapState = { ...createInitialState(), steps: [early, late], todos: [], unassigned: { nodes: 0, sinceSeq: null } };
  // The event's OWN seq is written explicitly: the manual windows are seqs 10 and 20, so the
  // call has to arrive at a seq both of them cover (30). Using the auto-counter would depend on
  // how many events earlier sections folded — a hidden coupling that makes a failing assertion
  // look like an attribution bug.
  const picked = foldEvent(overlapState, ev("tool/call", { turn: 1, step: 1, callId: "t-o", name: "read", arguments: JSON.stringify({ path: "C:\\repo\\o.js" }) }, { seq: 30 }));
  equal("(t5) with two covering intervals the LATER start wins (and is index 1)", picked.steps[1].nodeCount, 1);
  equal("(t5) the earlier step is NOT also credited", picked.steps[0].nodeCount, 0);
  const reversed = { ...createInitialState(), steps: [{ ...late, index: 0 }, { ...early, index: 1 }], todos: [] };
  const pickedReversed = foldEvent(reversed, ev("tool/call", { turn: 1, step: 1, callId: "t-o2", name: "read", arguments: JSON.stringify({ path: "C:\\repo\\o.js" }) }, { seq: 30 }));
  // The LATER start is still the winner; here it sits at index 0.
  equal("(t5) the winner is chosen by windowStart, not by array position", pickedReversed.steps[0].nodeCount, 1);
  equal("(t5) the losing step stays empty in the reversed order too", pickedReversed.steps[1].nodeCount, 0);

  // --- (t6) the unassigned counter grows one at a time and keeps its FIRST seq ------------------
  resetSeq();
  const who4 = userMessage("无归属");
  const emptyTable = todos([["甲", "completed"]]);
  const orphan1 = toolCall("read", { path: "C:\\repo\\o1.js" }, "t-o1");
  const orphan2 = toolCall("read", { path: "C:\\repo\\o2.js" }, "t-o2b");
  const orphan3 = toolCall("read", { path: "C:\\repo\\o3.js" }, "t-o3");
  const orphanState = foldAll([who4, emptyTable, orphan1, orphan2, orphan3]);
  equal("(t6) every uncovered node is counted", orphanState.unassigned.nodes, 3);
  equal("(t6) sinceSeq keeps the FIRST failing seq only", orphanState.unassigned.sinceSeq, orphan1.seq);
  equal("(t6) the counter is surfaced on the wire view", buildView(orphanState, orphanState.asOf).unassigned.nodes, 3);
  equal("(t6) and it never leaks into a step's node total", buildView(orphanState, orphanState.asOf).counts.nodes, 0);

  // --- (t7) a branch lane follows the same interval ----------------------------------------------
  resetSeq();
  const who5 = userMessage("分支");
  const laneTable = todos([["甲", "in_progress"]]);
  const laneLaunch = toolCall("subagent", { description: "并行调研" }, "t-sub");
  const laneState = foldAll([who5, laneTable, laneLaunch]);
  const laneView = buildView(laneState, laneState.asOf);
  equal("(t7) a subagent started inside a step's interval belongs to that step", laneView.branches.map((b) => b.stepIndex), [0]);

  // The NO-FALLBACK case has to be built where a step EXISTS but its interval does not cover the
  // launch. "The session has no steps yet" is not that case any more: the first node of a session
  // opens the synthetic planning row AT ITS OWN SEQ (see `appendNode`), so that row legitimately
  // covers it and the lane belongs to it. What this case must prove is the removal of the OLD rule —
  // "else the LAST step" — so the state below holds one CLOSED step and the launch arrives after
  // its window ended.
  resetSeq();
  const closedStep = {
    ...mkStep(0, 10),
    status: "done",
    percent: 100,
    percentSource: "closed",
    windowEnd: 40,
  };
  const staleState = { ...createInitialState(), steps: [closedStep] };
  const staleLaunch = foldEvent(
    staleState,
    ev("tool/call", { turn: 1, step: 1, callId: "t-sub2", name: "subagent", arguments: JSON.stringify({ description: "无窗口" }) }, { seq: 90 }),
  );
  const staleView = buildView(staleLaunch, staleLaunch.asOf);
  equal("(t7) a launch AFTER the only step's interval is null, NOT the last step", staleView.branches.map((b) => b.stepIndex), [null]);
  equal("(t7) and the node it produced is counted as unassigned, not filed under that step", staleLaunch.unassigned.nodes, 1);

  // --- (t8) the new fields survive a lossless JSON round trip -----------------------------------
  const roundTrip = JSON.parse(JSON.stringify(batchState));
  equal("(t8) unassigned survives JSON.stringify", roundTrip.unassigned, batchState.unassigned);
  equal("(t8) windowStart survives", roundTrip.steps[0].windowStart, batchState.steps[0].windowStart);
  equal("(t8) windowEnd survives", roundTrip.steps[0].windowEnd, batchState.steps[0].windowEnd);
  equal("(t8) a null window start stays null rather than becoming 0", roundTrip.steps[1].windowStart, null);

  // --- (t9) the host's checkpoint repair keeps legal windows and nulls the rest ------------------  
  const { default: hostModule2 } = await import("../lib/index.js");
  let projection2 = null;
  hostModule2.apply({
    sessionProjections: {
      register: (options) => {
        projection2 = options;
        return () => {};
      },
    },
    sessions: { get: () => undefined },
    webServer: { register: () => () => {} },
    effect: (execute) => execute(),
  });
  const schema2 = projection2 && projection2.stateSchema;
  check("(t9) the projection supplied a stateSchema", typeof schema2?.parse === "function", "missing stateSchema.parse");
  const keptWindow = schema2.parse(JSON.parse(JSON.stringify(batchState)));
  equal("(t9) a legal windowStart is preserved", keptWindow.steps[0].windowStart, batchState.steps[0].windowStart);
  equal("(t9) a legal windowEnd is preserved", keptWindow.steps[0].windowEnd, batchState.steps[0].windowEnd);
  const brokenWindow = JSON.parse(JSON.stringify(batchState));
  brokenWindow.steps[0].windowStart = "7";
  brokenWindow.steps[0].windowEnd = 1.5;
  equal("(t9) a non-integer windowStart repairs to null (never to 0)", schema2.parse(brokenWindow).steps[0].windowStart, null);
  equal("(t9) a non-integer windowEnd repairs to null", schema2.parse(brokenWindow).steps[0].windowEnd, null);
  equal("(t9) a checkpoint without unassigned restores it as a zeroed record", schema2.parse({}).unassigned, { nodes: 0, sinceSeq: null });
  equal("(t9) a legal unassigned count survives the restore", schema2.parse(JSON.parse(JSON.stringify(batchState))).unassigned.nodes, 3);
  const damagedUnassigned = JSON.parse(JSON.stringify(batchState));
  damagedUnassigned.unassigned.nodes = -4;
  equal("(t9) a negative count repairs to 0 instead of being believed", schema2.parse(damagedUnassigned).unassigned.nodes, 0);
}

// ---------------------------------------------------------------------------
// (u) when the conversation shows NO task list, the panel shows ONE row: "任务执行中"
// ---------------------------------------------------------------------------
// The requirement, stated as a rule: "if the user cannot see a task list in the conversation, do not
// invent a workflow of several rows — show one row meaning the task is running". What the user can
// see is exactly `view.todos` (the client draws its task list from `view.todos`), so that is the
// trigger: an empty table, not an absent plan.
//
// (u1) is the positive case; (u2) is the contrast that stops this from becoming "always one row"
// — once a table exists the map must follow IT, which is the constraint the whole plugin is built on.

{
  // --- (u1) no task list yet => exactly one running row, and it is named "任务执行中" ------------
  resetSeq();
  const q1 = userMessage("先看看仓库结构");
  const q2 = toolCall("read", { path: "C:\\repo\\README.md" }, "u-call-1");
  const q3 = toolResult("u-call-1", "readme");
  const q4 = toolCall("pwsh", { command: "git status" }, "u-call-2");
  const qState = foldAll([q1, q2, q3, q4]);
  const qView = buildView(qState, qState.asOf);

  equal("(u1) the conversation shows no task list", qView.todos, []);
  equal("(u1) so exactly ONE step is shown", qView.steps.length, 1);
  equal("(u1) and it is named 任务执行中", qView.steps.map((step) => step.title), ["任务执行中"]);
  equal("(u1) it is the running row, so the panel can say the task is running", qView.steps[0].status, "running");
  // The user chose "keep drawing the flow, only rename the title": the work done in this state must
  // still land on that row and stay visible rather than being pushed into `unassigned`.
  equal("(u1) the work is still attributed to it (the flow is drawn as before)", qView.steps[0].nodeCount, 2);
  equal("(u1) and nothing leaks into unassigned", qView.unassigned.nodes, 0);
  equal("(u1) there is exactly one row, not a workflow of invented steps", qView.counts.steps, 1);

  // --- (u2) a task list appears => the row yields to it ------------------------------------------
  // Without this, "one row named 任务执行中 forever" would satisfy (u1) while breaking the rule that
  // the map shows exactly what the conversation's task list shows.
  resetSeq();
  const r1 = userMessage("三件小事");
  const r2 = toolCall("read", { path: "C:\\repo\\a.js" }, "u2-call-1");
  const r3 = todos([["第一件", "in_progress"], ["第二件", "pending"]]);
  const rState = foldAll([r1, r2, r3]);
  const rView = buildView(rState, rState.asOf);
  equal("(u2) once a task list exists the synthetic row is gone", rView.steps.map((step) => step.title), ["第一件", "第二件"]);
  equal("(u2) and no row is left called 任务执行中", rView.steps.some((step) => step.title === "任务执行中"), false);
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------


const total = passed + failures.length;
if (failures.length === 0) {
  console.log(`selftest-fold: PASS ${passed}/${total} assertions`);
  console.log("  (a) todo-only  (b) PAE 3 steps + anchors  (c) files[]  (d) error result");
  console.log("  (e) truncation (f) grouping             (g) empty session");
  console.log("  + no clock / idempotent / lossless JSON / unrelated events keep the reference");
  process.exit(0);
}

console.error(`selftest-fold: FAIL ${failures.length}/${total} assertions`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(1);
