// dsh-workflow-map — src/fold.mjs . PURE FUNCTION. No clock, no fs, no net.
//
// The single source of truth for the workflow view: "step list + each step's flow nodes +
// currently running step/node + per-step percentage". Three consumers, one implementation:
//   1. node (offline self-test): import foldEvent and buildView out of src/fold.mjs
//   2. the host projection     : the same relative import from lib/index.js
//   3. (later) the browser half: an inlined copy, kept honest by a differential test
//
// CONTRACT FACTS ARE MEASURED, NOT GUESSED (2026-10-17, this session's own log,
// %USERPROFILE%\.dsh\sessions\…\session-f069ece7…\session.v4.jsonl.zstd):
//   * envelope = { type, seq, time, data, surfaceOp?, sourceEventSeqs? }; seq is strictly
//     increasing; `time` is wall-clock ms (the first event has no seq at all).
//   * todo/write  data.todos[] = { content, status }  — REPLACES the whole table.
//   * tool/call   data = { turn, step, callId, name, arguments } — arguments is a JSON STRING.
//   * tool/result data = { turn, step, message } — message.toolCallId, message.content[]
//     (blocks of {type:"text",text}), message.isError (absent on success).
//   * step/start / step/end data = { turn, step } — these are MODEL steps (a turn has many),
//     NOT plan steps. They bound a step's activity, but the plan's own boundaries are PAE's.
//   * assistant/message data = { turn, step, message:{content:[…]}, usage, stream } — content
//     blocks carry type reasoning|text|tool-call. `stream` is a chunk array: NEVER fold it.
//   * user/message data = { content:[{type:"text",text}], source:{kind}, role, id }. The FIRST
//     block of the first event whose source.kind === "user" is the task text.
//   * stepProgress/report data = { percent, note? } — the model self-report (our own event
//     type, appended by the dsh-session-progress tool `report_step_progress`).
//   * PAE writes `user/message` events with source.kind === "plugin:dsh-plan-and-execute":
//     the kickoff/summary/step instructions AND the "[plan-and-execute previous result: ...]"
// reports. `orchestrator.json` (read by NOT here) carries anchorSeqs
//     { stepIndex: seq } — the seq of the context message that opens each plan step.
//   * Unrelated types seen in a live log: job/*, llm/*, compaction/*, request/*,
//     command/run, command/done, workspace/changes, assistant/attempt, system/message,
//     session-log-deepseek/*. They return the SAME state reference.
//
// BRANCH VOCABULARY  — read out of the harness's own SessionEventMap (the type
// list and the per-type payload validators inside app.asar), NOT guessed:
//   * the session log carries `job/registered` { jobId, owner, kind, label, startedAt,
//     toolCall? } and `job/settled` { …the same fields, outcome: { status:
//     'completed' | 'killed' | 'failed', detail?, result? } } — a background long task.
//   * a workflow tool run reaches the log as four log-only events: `tool-workflow/run-start`
//     { runId, name }, `tool-workflow/agent-start` { runId, seq, label, childId, phase? },
//     `tool-workflow/agent-end` { runId, seq, outcome }, `tool-workflow/run-end`
//     { runId, stopReason: 'completed' | 'cancelled' | 'error' }.
//   * `subagent/start` / `subagent/end` and `workflow/*` are PLUGIN-BUS events: they are NOT
//     members of the session-log type list, so a recorded log never contains them. A
//     subagent therefore reaches this fold as the `tool/call` that launched it (`subagent`
//     / `subagent_fork`) plus the matching `tool/result`: the branch opens at the call and
//     closes at the result. The bus payload shapes are still handled, so a host that does
//     record them produces the same lanes (one branch per run, never two).
// SIZING (step file §7): a real turn carries 100+ tool calls; the state is persisted to the
// session cache, so nothing large may enter it. Text is truncated at the boundary
// (NODE_TEXT=200, SUMMARY=120), per-step nodes are capped at 300 with head/tail kept, and
// the node count in the wire view is a total cap across the whole session.
//
// IDEMPOTENCE: folding the same event twice must not change the shape. That is why every
// append is guarded by the event's `seq` (the first event of a log has no seq — it is a
// `session` header, which this fold ignores anyway).

// STATE_VERSION 3 : the state carries the INBOX LEDGER (`inboxIds`), because
// the durable record of a revocation is positional — `agent/inbox/spliced { target, start,
// removedCount, inserted, outcome: 'canceled' }` names an INDEX, never the message that left
// (measured 2026-10-26 on the host's own `ReactLoopInbox.mutate`, and on 145 real session logs:
// 11 lines carry `outcome:"canceled"`, 0 carry a durable `agent/inbox/discarded`). To say WHICH
// of our inject rows the loop dropped, the fold has to replay the same splice sequence the loop's
// own `inboxProjectionDefinition` replays. A checkpoint written before this bump has no ledger,
// so the registry is told to drop it and rebuild from the log (the same contract as v1→v2: a
// missing field must never be silently answered with a wrong index).
//
// STATE_VERSION 4 : the step ledger now follows the todo table's own statuses (a `pending` row
// demotes a step that still carried `done`/`running`, and a step any table no longer names is
// dropped). Checkpoints written before the bump hold ledgers from the older mapping — wrong
// statuses and leftover rows — so the same contract applies: drop and rebuild from the log.
export const STATE_VERSION = 5;

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// limits — every text that enters the state is bounded here, nowhere else
// ---------------------------------------------------------------------------

/** Longest text kept anywhere in the state (node detail, result head, summary). */
export const TEXT_LIMIT = 200;

/** Longest step title / task title. */
export const TITLE_LIMIT = 120;

/** Longest command text kept for a `pwsh` node. */
export const COMMAND_LIMIT = 200;

/** Longest argsText for any node. */
export const ARGS_LIMIT = 200;

/** Nodes kept per step (head + tail, middle dropped with `truncatedNodes` recorded). */
export const NODES_PER_STEP = 300;

/**
 * Total nodes kept across the whole session. Measured on a real 4-turn session (2026-10-17):
 * 566 nodes -> 286 kB of persisted state, i.e. ~0.5 kB per node, so the cap is what keeps a
 * long session's cache row in the hundreds of kB instead of the megabytes.
 */
export const NODES_TOTAL = 1200;

/** Consecutive same-tool nodes with the same target that get folded into a group. */
export const GROUP_THRESHOLD = 3;

/** Activity rows kept per branch lane (the oldest are dropped, `count` stays honest). */
export const BRANCH_NODES = 40;

/** Branches the view draws for one step; the rest are counted, never silently lost. */
export const BRANCHES_SHOWN = 4;

/** Branches kept in the persisted state; the oldest CLOSED one is dropped first. */
export const BRANCH_TOTAL = 12;

/** Longest per-step percent series (model reports) kept. */
export const REPORTS_PER_STEP = 40;

// ---------------------------------------------------------------------------
// event vocabulary (the measured list from the log of 2026-10-17)
// ---------------------------------------------------------------------------

const TYPE_TODOS = "todo/write";

/** Title of the synthetic step that holds everything done before the first plan step. */
const PLANNING_TITLE = "规划与调研";
const TYPE_TOOL_CALL = "tool/call";
const TYPE_TOOL_RESULT = "tool/result";
const TYPE_STEP_START = "step/start";
const TYPE_STEP_END = "step/end";
const TYPE_ASSISTANT = "assistant/message";
const TYPE_USER = "user/message";
const TYPE_TURN_START = "turn/start";
const TYPE_TURN_END = "turn/end";
const TYPE_REPORT = "stepProgress/report";
const TYPE_SUBAGENT_START = "subagent/start";
const TYPE_SUBAGENT_END = "subagent/end";
const TYPE_WORKFLOW = "workflow";
const TYPE_WORKFLOW_START = "workflow/start";
const TYPE_WORKFLOW_PHASE = "workflow/phase";
const TYPE_WORKFLOW_END = "workflow/end";
const TYPE_TW_RUN_START = "tool-workflow/run-start";
const TYPE_TW_RUN_END = "tool-workflow/run-end";
const TYPE_TW_AGENT_START = "tool-workflow/agent-start";
const TYPE_TW_AGENT_END = "tool-workflow/agent-end";
const TYPE_JOB_REGISTERED = "job/registered";
const TYPE_JOB_SETTLED = "job/settled";
const TYPE_USER_QUESTIONS = "user-questions/request";
const TYPE_APPROVAL = "approval/request";

// The hot-inject message this plugin's own hot-inject message and the inbox splice that carries it.
// Measured in this session's log (session-f1b5bf9d, 2026-10-18): the panel's POST lands as
// `agent/inbox/spliced { target: "next-step", inserted:[{ source:{kind:"plugin:dsh-workflow-map"} }] }`
// and is admitted as a `user/message` with the same `source.kind`. Those two facts are what
// makes a hot-inject HISTORY possible without a second write path.
const TYPE_INBOX_SPLICED = "agent/inbox/spliced";
// The loop's LIVE notice that a message left an inbox: `dispatch.emit("agent/inbox/discarded",
// { message })` — it carries the message itself, but it is NOT a session event (the agent-loop
// README is explicit: "Consumers that need a removed message use the claimed or discarded
// notification instead of depending on a pre-splice session/event view"). Measured 2026-10-26 on
// all 145 readable logs: zero durable `agent/inbox/discarded` lines. The fold still answers it —
// a hand-made or future log that does carry it must flip the row — but the DURABLE cancellation
// this plugin renders from is the `agent/inbox/spliced` with `outcome: 'canceled'` below.
const TYPE_INBOX_DISCARDED = "agent/inbox/discarded";
const PLUGIN_SOURCE_PREFIX = "plugin:";
const SELF_SOURCE_KIND = "plugin:dsh-workflow-map";
const TYPE_APPROVAL_ASKED = "approval/asked";
const TYPE_APPROVAL_DECIDED = "approval/decided";
// The tool the model uses to ask the user something (measured name, from the harness's
// own tool definition in dsh-tool-ask-user).
const ASK_USER_QUESTION_TOOL = "ask_user_question";
/** Everything this fold answers to. Anything else returns the very same state reference. */
const RELATED = new Set([
  TYPE_TODOS,
  TYPE_TOOL_CALL,
  TYPE_TOOL_RESULT,
  TYPE_STEP_START,
  TYPE_STEP_END,
  TYPE_ASSISTANT,
  TYPE_USER,
  TYPE_TURN_START,
  TYPE_TURN_END,
  TYPE_REPORT,
  TYPE_SUBAGENT_START,
  TYPE_SUBAGENT_END,
  TYPE_WORKFLOW,
  TYPE_WORKFLOW_START,
  TYPE_WORKFLOW_PHASE,
  TYPE_WORKFLOW_END,
  TYPE_TW_RUN_START,
  TYPE_TW_RUN_END,
  TYPE_TW_AGENT_START,
  TYPE_TW_AGENT_END,
  TYPE_JOB_REGISTERED,
  TYPE_JOB_SETTLED,
  TYPE_USER_QUESTIONS,
  TYPE_APPROVAL,
  TYPE_INBOX_SPLICED,
  TYPE_INBOX_DISCARDED,
  TYPE_APPROVAL_ASKED,
  TYPE_APPROVAL_DECIDED,
]);

/**
 * Whether an event type can enter the fold. The declared set carries the measured names;
 * the prefixes catch the rest of a family (`workflow/log`, `job/progress`, …) so that an
 * unhandled member lands in `foldOne`'s default (state untouched) instead of being
 * mistaken for a new session.
 */
function isRelated(type) {
  return (
    RELATED.has(type) || type.startsWith("job/") || type.startsWith("workflow/") || type.startsWith("tool-workflow/")
  );
}

/** Source kind prefix of the plan-and-execute plugin's own user messages. */
const PAE_SOURCE_PREFIX = "plugin:dsh-plan-and-execute";

/** Model-step boundary kinds, kept so the fold can bound "activity" without guessing. */
const STEP_STATUS = { pending: "pending", running: "running", done: "done", failed: "failed" };

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

const isObject = (value) => value !== null && typeof value === "object";
const isRecord = (value) => isObject(value) && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const clamp = (value, low, high) => Math.max(low, Math.min(value, high));

/** Bounded copy of any text. Never throws, never returns a non-string. */
export function text(value, limit = TEXT_LIMIT) {
  if (typeof value !== "string") return "";
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, Math.max(0, limit - 1))}…`;
}

/** One line only, for result heads and error text. */
export function line(value, limit = TEXT_LIMIT) {
  if (typeof value !== "string") return "";
  const raw = value.split("\n").find((part) => part.trim() !== "");
  return text(raw === undefined ? "" : raw, limit);
}

/** Wall-clock stamp of an event; 0 when unusable (never invented). */
function eventTime(event) {
  const raw = isObject(event) ? event.time : undefined;
  return isFiniteNumber(raw) && raw > 0 ? raw : 0;
}

/** Event seq; null when the envelope carries none (the session header). */
function eventSeq(event) {
  const raw = isObject(event) ? event.seq : undefined;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** The `data` payload of an event, or null. */
function dataOf(event) {
  return isObject(event) && isRecord(event.data) ? event.data : null;
}

/** Basename of a path, with separators normalised to "/". */
function baseName(path) {
  if (typeof path !== "string" || path === "") return "";
  const flat = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const at = flat.lastIndexOf("/");
  return at === -1 ? flat : flat.slice(at + 1);
}

/** Parent directory of a path (for grouping), or "". */
function dirName(path) {
  if (typeof path !== "string" || path === "") return "";
  const flat = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const at = flat.lastIndexOf("/");
  return at === -1 ? "" : flat.slice(0, at);
}

/** Parse the JSON string that `tool/call` carries. Never throws. */
function parseArgs(raw) {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** First text block of a tool result's content array. */
function resultText(content) {
  if (!Array.isArray(content)) return "";
  for (const block of content) {
    if (isRecord(block) && typeof block.text === "string" && block.text !== "") return block.text;
  }
  return "";
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
//
// {
//   stateVersion: 1,
//   asOf:        number,        // time of the last event folded in (the caller's `now`)
//   task:        string,        // first real user message, title-cased and truncated
//   todos:       Item[],        // the latest todo table (content/status only)
//   steps:       Step[],        // ordered; index 0 is the first step
//   nodes:       Node[],        // flat, ordered; `stepIndex` points into steps
//   active:      { stepIndex, nodeId } | null,
//   reports:     { stepIndex: percent }[],   // model self-reports (high water per step)
//   durations:   number[],      // finished step durations (the baseline pool)
//   truncated:   { stepNodes: number, totalNodes: number },
//   seq:         number,        // last folded seq (idempotence guard)
// }

/** Fresh, empty state. The projection registry hands it to `init()`. */
export function createInitialState() {
  return {
    stateVersion: STATE_VERSION,
    asOf: 0,
    task: "",
    // Session identity, captured by the host half's init(header): the PAE plan reader needs
    // both to name `<cwd>/.pae/<sessionId>/orchestrator.json` while serving a wire view.
    sessionId: "",
    cwd: "",
    todos: [],
    steps: [],
    nodes: [],
    active: null,
    reports: [],
    durations: [],
    truncated: { stepNodes: 0, totalNodes: 0 },
    nextNodeId: 1,
    // Branch lanes : parallel work (subagent / workflow / background job) that
    // must NOT enter the main flow's node list. See the branch section below.
    branches: [],
    nextBranchId: 1,
    droppedBranches: 0,
    // Jobs registered but not yet settled. A job becomes a LANE only when its tool result
    // arrives while it is still open (see promoteJobLane); synchronous calls never do.
    pendingJobs: [],
    // `{ planIndex, seq }` parked by foldPaeReport: the seq PAE itself will record as the
    // anchor of the NEXT plan step (orchestrator.json anchorSeqs[planIndex]).
    pendingAnchor: null,
    // Is a turn open?  `turn/start` → true, `turn/end` → false. This is the ONE honest
    // "is the session working right now" signal the log carries: the step rows stay 'running'
    // until PAE rewrites them, so they cannot answer it, and a long model answer can go minutes
    // without a tool call (its events arrive at the end). Exposed as `view.running`; the browser
    // half freezes every animation when it is false.
    turnActive: false,
    // Hot-inject history. One row per message this plugin's `/steer` channel put into
    // the session: `{ id, at, text, pickedUp }`. `pickedUp` flips to true the moment the
    // session's own `user/message` event with the same id enters the log — that is the
    // MEASURED proof the loop admitted it (measured 2026-10-18, session-f1b5bf9d), so the
    // panel can say "injected, session picked it up" instead of guessing from the HTTP 200 alone.
    injects: [],
    // the inbox LEDGER: the pending message ids of each loop-owned list, in
    // order, replayed from the same `agent/inbox/spliced` coordinates the loop writes. It exists
    // for exactly one question the durable log alone cannot answer — "the splice removed the
    // message at index i; WHICH id was that?" — because a cancellation records an index, not an
    // id. Mirror of the host's own `inboxProjectionDefinition` fold (and of dsh-better-sidebar's
    // `pendingIdsInLog`): clamp `start` into the list, clamp the removal count, then splice.
    // Bounded by the inbox itself (the loop keeps at most a couple of pending messages).
    inboxIds: { "next-turn": [], "next-step": [] },
    // The step indexes a decision is waiting on. Filled from the log's own shapes
    // (an approval/asked with no decided yet, or a node of kind question/approval with no
    // later outcome event) — never from a guess about the step's title.
    pendingConfirm: [],
    // The approval audit pair, folded to know which decision is still open:
    // `{ id, state: "asked"|"decided", stepIndex, label, at }`. Bounded; the oldest decided
    // rows are dropped first, because only an UNPAIRED ask matters.
    approvals: [],
    seq: null,
  };
}
// ---------------------------------------------------------------------------
// steps
// ---------------------------------------------------------------------------

/** One step row. `nodes` live in state.nodes (shared, referenced by index). */
function newStep(index, title, at, source) {
  return {
    index,
    title: text(title, TITLE_LIMIT),
    // The row's STABLE identity, derived from the same expression appendNode uses for a
    // node's `stepKey`. Every row therefore has one from the moment it exists — a row created by
    // `foldTodos` never goes through `syncToTodos`'s create branch, so setting it only there left
    // every foldTodos-created row keyless and its nodes unattributable.
    stepKey: normalizeTitle(title),
    source, // "pae" | "todo"
    status: STEP_STATUS.running,
    startedAt: at,
    endedAt: null,
    percent: null,
    lastEstimateAt: 0,
    percentSource: "none",
    maxPercent: 0,
    reportSummary: "",
    nodeIds: [],
    nodeCount: 0,
    truncatedNodes: 0,
    // The seq this step opened at (the PAE context message). `undefined` = never anchored,
    // which `stepForNode` reads as "not part of an anchored plan".
    anchorSeq: undefined,
    // The plan ordinal PAE prints ("executing plan step 3/14"). `undefined` for a todo-only session.
    planIndex: undefined,
    // The model step currently running inside this plan step (step/start, step/end).
    modelStep: null,
    lastActivityAt: 0,
    // the event time of the LAST progress estimate this step received — a
    // `stepProgress/report` or the `step/start` that began its first model step. 0 means
    // "this step never carried a number", which the rail renders as no `ago` segment at all
    // (a 0 there would be the fake number the plugin forbids). Pure data: the fold never
    // reads a clock, it only stores the stamp the event itself carried.
    // "success" | "failed" | "" — what PAE's own step report said (foldPaeReport).
    outcome: "",
    groups: [],
  };
}

/**
 * The step the session is working on: the FIRST running row (the todo table's own rule —
 * the first in_progress entry is "current"); parallel work keeps list order.
 *
 * WHY THIS IS THE ONLY CANDIDATE. Measured on 129 real logs: 22 sessions ended the
 * fold with 2+ rows in `running`. Cause: the synthetic "planning & research" row opens during the
 * planning phase and only `openPlanStep` ever closed it, so a todo-only session (or one whose
 * plan never opens a PAE step) keeps it running forever, and every later row the todo table
 * re-opens adds a second one. Two running rows = two flowing rings and two animated rails in
 * the panel, which is exactly what the user reported. `soleRunning()` closes the strays; the
 * per-event pick below stays "first running row" so a turn's activity pointer never jumps.
 */
function runningStep(state) {
  for (let i = 0; i < state.steps.length; i += 1) {
    if (state.steps[i].status === STEP_STATUS.running) return state.steps[i];
  }
  return null;
}

/**
 * Keep exactly ONE running row, and keep the RIGHT one.
 *
 * Priority mirrors the two facts the panel draws from:
 *   1. the `in_progress` todo row — the model's own "this is what I am doing now";
 *   2. else the LAST running row — the most recently opened step;
 *   3. else nothing to do.
 *
 * Every other `running` row is CLOSED at `time` (status done, percent pinned 100) instead of
 * being re-labelled 'pending': the work it recorded really happened, and demoting it would
 * also un-count its nodes from the completed total. A row that was never started (startedAt 0)
 * cannot be closed honestly, so it alone falls back to pending.
 */
function soleRunning(state, time) {
  let keep = -1;
  const inProgress = inProgressStepIndex(state);
  if (isFiniteNumber(inProgress) && state.steps[inProgress]) keep = inProgress;
  if (keep === -1) {
    for (let i = state.steps.length - 1; i >= 0; i -= 1) {
      if (state.steps[i].status === STEP_STATUS.running) {
        keep = i;
        break;
      }
    }
  }
  if (keep === -1) return state;
  let durations = state.durations;
  let changed = false;
  const steps = state.steps.map((step, index) => {
    if (index === keep || step.status !== STEP_STATUS.running) return step;
    changed = true;
    if (!(step.startedAt > 0)) {
      return { ...step, status: STEP_STATUS.pending, endedAt: null, percent: null, percentSource: "none" };
    }
    durations = [...durations, time - step.startedAt].filter((value) => value > 0);
    return closeStep(step, time);
  });
  return changed ? { ...state, steps: reindex(steps), durations } : state;
}
/**
 * The plan step a node belongs to. Three sources, in priority order:
 *   1. the PAE anchor range — the last anchored step whose anchorSeq <= this event's seq
 *      (orchestrator.json's `anchorSeqs` maps step index -> the seq of the context message
 *      that OPENS that step; feeds it in, and until then the PAE `user/message`
 *      events open the steps themselves);
 *   2. the in_progress todo row, when the caller knows one;
 *   3. the running step, else the last step.
 *
 * A node whose seq predates every anchor (planning-phase work) belongs to no step at all
 * and is dropped by the caller — inventing a step for it would be a guess.
 */
function stepForNode(state, seq, inProgressIndex) {
  if (seq !== null && state.steps.length > 0) {
    let anchored = null;
    for (const step of state.steps) {
      if (step.anchorSeq !== undefined && step.anchorSeq <= seq) anchored = step;
    }
    if (anchored) return anchored;
    if (state.steps.some((step) => step.anchorSeq !== undefined)) return null;
  }
  if (isFiniteNumber(inProgressIndex) && state.steps[inProgressIndex]) return state.steps[inProgressIndex];
  return runningStep(state);
}

/**
 * Per-step percent. Four routes, in priority order:
 *   1. a CLOSED step is pinned — its number is finished work, not a time estimate, so a
 *      later (slower) sibling must not be able to pull its bar back down;
 *   2. a model self-report, BLENDED with the todo table's own completion ratio : the todo
 *      table is a measurement, so it decides the number whenever it has rows to speak for — an
 *      inflated report can no longer pin the bar above the work actually done, and a stale low one
 *      can no longer hide it. With no rows to measure, the report (high water) stands alone;
 *   3. the todo table's completion ratio on its own (a real measurement, capped at 99 % — the
 *      remaining row is still in progress);
 *   4. the time baseline: this step's elapsed time / the median finished-step duration, capped at
 *      90 % because it is an extrapolation, not a measurement. With no finished step (the cold
 *      start) the plan's own ordinal - current step / total steps - stands in as `baseline:steps`, but
 *      only from the second step of a ≥ 2-step plan: 0 of N is not progress.
 */
function percentFor(state, step, now) {
  if (step.status === STEP_STATUS.done || step.status === STEP_STATUS.failed) {
    const pinned = step.percent === null ? 100 : step.percent;
    return { percent: clamp(pinned, 0, 100), source: step.percentSource === "none" ? "closed" : step.percentSource };
  }
  // Only the step that is actually running can be partly done. A pending row is future work and a
  // skipped one never will be done, so NEITHER carries a number. The old code let the todo table's
  // completion ratio paint a bar on every waiting row as well, which is where the wall of bars
  // below 100 % in an already finished session came from.
  if (step.status !== STEP_STATUS.running) {
    return { percent: null, source: "none" };
  }
  // Priority 2 when a self-report exists: the todo table's completion ratio is a measurement (no
  // clock, no extrapolation), so it determines the number whenever it has rows to report on.
  // The self-report can only lower the result, never raise it above the measured ratio.
  const rowsTotal = state.todos.length;
  const rowsDone = state.todos.filter((item) => item.status === "completed").length;
  const reported = state.reports.find((entry) => entry.stepIndex === step.index);
  if (reported && isFiniteNumber(reported.percent)) {
    // A self-report and the todo table disagree in both directions. The todo table's ratio is a
    // MEASUREMENT (a count over rows; no clock, no extrapolation), so it decides the displayed number
    // whenever it has rows to speak for:
    //   • report below it → the measurement (a stale low report must not hide work already done);
    //   • report above it → the measurement (a report must not claim more than the rows show).
    // Keeping the report out of the displayed value removes both directions of error; it is not a
    // claim about how often a report is wrong. The high-water record (step.maxPercent) is still kept
    // and never rolled back; it simply no longer takes part in the displayed value.
    const measured = rowsTotal > 0 && rowsDone > 0 ? Math.round((rowsDone / rowsTotal) * 100) : null;
    if (measured !== null) {
      // The todo table is the measurement; the self-report cannot raise the number above it.
      const value = measured;
      return { percent: clamp(value, 0, 99), source: "todos" };
    }
    // The model's latest statement is the number, and an open step is 0..99: 100 % on a running
    // row is a claim the log does not support. The high-water record is deliberately not applied
    // here, as the comment above states; applying it freezes a row at the highest number it ever
    // reached, so later reports cannot move the bar.
    return { percent: clamp(reported.percent, 0, 99), source: "model" };
  }
  // The checklist's own completion ratio — a real measurement, so it sits above the time baseline.
  // It never claims 100 % for an OPEN step: the remaining row is still in progress.
  if (rowsTotal > 0 && rowsDone > 0) {
    const real = Math.round((rowsDone / rowsTotal) * 100);
    return { percent: clamp(Math.max(real, step.maxPercent), 0, 99), source: "todos" };
  }
  const baseline = medianOf(state.durations);
  if (baseline !== null && baseline > 0 && step.startedAt > 0) {
    const elapsed = Math.max(0, now - step.startedAt);
    const value = Math.round((elapsed / baseline) * 100);
    return { percent: clamp(Math.max(value, step.maxPercent), 0, 90), source: "baseline" };
  }
  // Time-baseline cold start. With no finished step there is no median to divide by, so the whole
  // first stretch of a session used to show no number at all. When the plan itself already names
  // ≥ 2 steps and this one is not the first, the ordinal PAE prints ("executing plan step 2/6") is a REAL
  // fact about scope, and current step / total steps is worth a coarse bar. Below two steps there is no ratio
  // to speak of, and the old rule stands: no number beats a fabricated one.
  if (baseline === null && step.startedAt > 0) {
    const total = state.steps.length;
    const order = isFiniteNumber(step.planIndex) && step.planIndex > 0 ? step.planIndex : step.index + 1;
    if (total >= 2 && order > 1) {
      const value = Math.round((order / total) * 100);
      return { percent: clamp(Math.max(value, step.maxPercent), 0, 90), source: "baseline:steps" };
    }
  }
  return { percent: null, source: "none" };
}

function medianOf(values) {
  const usable = values.filter((value) => isFiniteNumber(value) && value > 0);
  if (usable.length === 0) return null;
  usable.sort((a, b) => a - b);
  return usable[Math.floor((usable.length - 1) / 2)];
}

/** Recompute every step's percent at `now`. Pure: same inputs, same output. */
function withPercents(state, now) {
  let changed = false;
  const steps = state.steps.map((step) => {
    const result = percentFor(state, step, now);
    const maxPercent = result.percent === null ? step.maxPercent : Math.max(step.maxPercent, result.percent);
    if (maxPercent === step.maxPercent && result.percent === step.percent && result.source === step.percentSource) {
      return step;
    }
    changed = true;
    return { ...step, percent: result.percent, percentSource: result.source, maxPercent };
  });
  return changed ? { ...state, steps } : state;
}

// ---------------------------------------------------------------------------
// nodes
// ---------------------------------------------------------------------------

/**
 * One flow node. `kind` is what the UI draws:
 *   "tool" | "message" | "step" | "subagent" | "question" | "approval" | "report"
 */
function newNode(kind, tool, title, at, extra) {
  return {
    id: "", // assigned by appendNode
    seq: null,
    kind,
    tool,
    title: text(title, TITLE_LIMIT),
    detail: "",
    files: [],
    argsText: "",
    resultHead: "",
    error: "",
    // Whether the call returned. Separate from the body text: a call that succeeds with
    // no output has an empty resultHead and is still settled. The browser half colours by
    // this flag, so deriving it from resultHead leaves every silent call "running".
    settled: false,
    at,
    durationMs: null,
    // filled by appendNode when the caller did not pass one (see toolKey).
    key: "",
    ...extra,
  };
}

/** Files a tool touched, with the action label the UI shows. */
function filesFor(name, args) {
  if (!args) return [];
  const out = [];
  const push = (path, action) => {
    if (typeof path === "string" && path !== "") out.push({ path, action });
  };
  switch (name) {
    case "read":
      push(args.path, "读");
      break;
    case "write":
      push(args.file_path, "写");
      break;
    case "edit":
      push(args.file_path, "改");
      break;
    case "glob":
    case "grep":
      push(args.path, "查");
      break;
    default:
      break;
  }
  return out;
}

/** Command text of a `pwsh` node, with paths flagged as inferred. */
function commandText(args) {
  if (!args) return "";
  const command = typeof args.command === "string" ? args.command : "";
  if (command === "") return "";
  const paths = command.match(/[A-Za-z]:\\[^\s"';|&]+|"[^"]+"|'[^']+'/g) || [];
  const unique = [...new Set(paths.map((item) => item.replace(/^["']|["']$/g, "")))].slice(0, 4);
  return unique.length > 0
    ? `${text(command, COMMAND_LIMIT)} [路径推断: ${unique.map((item) => baseName(item)).join(", ")}]`
    : text(command, COMMAND_LIMIT);
}

/** First word of a command (the group key for consecutive `pwsh` nodes). */
function commandHead(args) {
  const command = args && typeof args.command === "string" ? args.command : "";
  const match = command.trim().match(/^[A-Za-z0-9_.-]+/);
  return match ? match[0] : "";
}

/**
 * Group key: what makes two adjacent nodes "the same kind of work" (step file §6).
 * Same tool + same target (the file's directory, or the command's first word) = one group.
 * Computed while the arguments are still at hand, because the node only keeps a bounded
 * copy of them; re-parsing that copy would lose the key exactly when it matters.
 */
function toolKey(name, args) {
  if (name === "pwsh") return `pwsh:${commandHead(args)}`;
  const files = filesFor(name, args);
  if (files.length > 0) return `${name}:${dirName(files[0].path)}`;
  return name;
}

/** Title of a tool node: tool name + the parameter that says what it was about. */
function toolTitle(name, args) {
  if (!args) return name;
  switch (name) {
    case "read":
    case "write":
    case "edit":
      return `${name} ${baseName(args.file_path ?? args.path ?? "") || "(无路径)"}`;
    case "glob":
    case "grep":
      return `${name} ${baseName(args.path ?? "") || "(无路径)"}`;
    case "pwsh": {
      const head = commandHead(args);
      return head ? `pwsh ${head}` : "pwsh";
    }
    case "skill":
      return `skill ${typeof args.name === "string" ? args.name : ""}`.trim();
    default:
      break;
  }
  if (name === "subagent" || name === "subagent_fork" || name === "workflow") {
    const description = typeof args.description === "string" ? args.description : "";
    return `${name} ${text(description, 60)}`.trim();
  }
  return name;
}

/** Args summary kept on the node (never the full payload). */
function argsSummary(name, args) {
  if (!args) return "";
  const keys = Object.keys(args).filter((key) => key !== "content");
  if (name === "pwsh") return commandText(args);
  const parts = [];
  for (const key of keys.slice(0, 4)) {
    const value = args[key];
    if (typeof value === "string") parts.push(`${key}=${text(value, 60)}`);
    else if (isFiniteNumber(value) || typeof value === "boolean") parts.push(`${key}=${value}`);
  }
  return text(parts.join(" "), ARGS_LIMIT);
}

/**
 * The argument DIGEST kept on a node: which parameters were given and with what shape, never
 * a body. File contents (`content` / `old_str` / `new_str`) are dropped outright — a single
 * 5000-character write would otherwise be the largest thing in the persisted state.
 */
function argsDigest(args) {
  if (!args) return "";
  const out = {};
  for (const key of Object.keys(args).slice(0, 12)) {
    if (key === "content" || key === "old_str" || key === "new_str") continue;
    const value = args[key];
    if (typeof value === "string") out[key] = text(value, 60);
    else if (isFiniteNumber(value) || typeof value === "boolean") out[key] = value;
    else if (Array.isArray(value)) out[key] = `[${value.length}]`;
    else if (isRecord(value)) out[key] = "{…}";
  }
  return text(JSON.stringify(out), ARGS_LIMIT);
}

// ---------------------------------------------------------------------------
// fold
// ---------------------------------------------------------------------------

/**
 * Reopen a closed row without letting its 100 % speak for the reopened one.
 *
 * A row taken back to in_progress used to keep the percent and the high-water record of its
 * closed state, so the panel showed an in-progress step pinned at 100 %: a bar that can never
 * move again, and a later self-report cannot lower it. A closed record's number belongs to
 * that closure, not to the row that reopens it.
 */
function reopenStep(step, time) {
  const reopened = step.status === STEP_STATUS.done || step.status === STEP_STATUS.failed;
  const base = {
    ...step,
    status: STEP_STATUS.running,
    endedAt: null,
    startedAt: reopened || !step.startedAt ? time : step.startedAt,
  };
  return reopened ? { ...base, percent: null, percentSource: "none", maxPercent: 0 } : base;
}

function foldTodos(state, event, time) {
  const data = dataOf(event);
  const raw = data && Array.isArray(data.todos) ? data.todos : [];
  const todos = raw
    .filter(isRecord)
    .map((item) => ({ content: text(item.content, TITLE_LIMIT), status: typeof item.status === "string" ? item.status : "" }));

  // Two jobs, in this order: (1) close the steps the table says are finished — the todo
  // table is the ONE place that reports a plan step's outcome, and PAE rewrites the whole
  // table after every step; (2) add any row that is not a step yet, so a plain todo-driven
  // session (no PAE plan at all) still produces a step list.
  let steps = [...state.steps];
  let durations = state.durations;
  // Every row that matched an existing step, and the status that row states. The table is the one
  // authority on a step's lifecycle, so these are applied in a final pass instead of inline: a row
  // can match a step that a LATER row also matches (slot reuse after the model rewrites the table),
  // and an inline write could then be overwritten by a stale copy of the old status.
  const authority = new Map();
  // The ledger as it stood BEFORE this table. Slot binding has to read this snapshot: by the time a
  // later row is examined, `steps` already holds the rows this very table created, so "the row in
  // this position" would point at a row from the NEW table instead of the one being replaced.
  const prior = state.steps;

  for (const item of todos) {
    if (item.content === "") continue;
    const planIndex = planIndexOf(item.content);
    let at = planIndex === null ? -1 : steps.findIndex((step) => step.planIndex === planIndex);
    if (at === -1) at = steps.findIndex((step) => normalizeTitle(step.title) === normalizeTitle(item.content));
    const matchedByTitle = at !== -1;
    // REWORDED ROW at the source. The model often rewrites its own todo text between two
    // `todo/write` events (measured: "read-only inventory: read plugin sources..." -> "read-only inventory: sources/config..."). Matching on the
    // title alone then misses the row that already exists, a SECOND row is created for the new
    // wording, and the first one — with every node it owns — becomes an orphan that the view-side
    // sync then drops. That was "only the running step shows tool types". The fix belongs HERE:
    // reword in place when the slot and lifecycle agree, so the row keeps its ledger.
    if (at === -1) {
      const slotRow = prior[todos.indexOf(item)];
      // A running step is never taken over by a row that is not running: that is how a pending row
      // used to hijack the live step and leave the real one with no running row at all.
      const sameSlot =
        slotRow &&
        (slotRow.status === item.status ||
          (slotRow.status === STEP_STATUS.running && item.status === "in_progress"));
      if (sameSlot) at = steps.indexOf(slotRow);
    }

    if (at === -1) {
      const created = newStep(steps.length, item.content, time, "todo");
      if (planIndex !== null) created.planIndex = planIndex;
      // The row's status decides the step's status; a step nobody has started yet must not
      // look like it is running, or every node in the session would land on the LAST row.
      if (item.status === "completed") {
        created.status = STEP_STATUS.done;
        created.endedAt = time;
        created.percent = 100;
        created.percentSource = "closed";
        created.maxPercent = 100;
      } else if (item.status === "in_progress") {
        created.status = STEP_STATUS.running;
      } else {
        created.status = STEP_STATUS.pending;
        created.startedAt = 0;
      }
      steps.push({ ...created, title: text(stripOrdinal(item.content) || item.content, TITLE_LIMIT) });
      continue;
    }

    const step = steps[at];
    // a matched row takes the CURRENT wording (the model may have reworded it) and keeps
    // its old key, so the nodes it already owns can follow the rename. Both the rename and the
    // lifecycle change are applied in one assignment, so neither can lose the other.
    let next = step;
    // The row's ordinal follows the TABLE, not the row's history. A matched row that used to be
    // unnumbered (or numbered differently) must take the ordinal this table now states, or the
    // view keeps a stale planIndex and `applyPlanToView` patches the wrong plan step onto it.
    // Measured 2026-10-29 on session 164e339f: leftover unnumbered rows kept planIndex 2 / 3 /
    // 4... from an earlier PAE plan and the map rendered plan steps 3-7 twice.
    if (planIndex !== null && next.planIndex !== planIndex) next = { ...next, planIndex };
    const shown = text(stripOrdinal(item.content) || item.content, TITLE_LIMIT);
    const shownKey = normalizeTitle(shown);
    if (shownKey !== "" && shownKey !== next.stepKey) {
      // `aliasKeys` ACCUMULATES every key this row has ever had. A model that rewrites the same row
      // more than once (measured on this session: step 1 was reworded three times) would otherwise
      // lose the older keys, and any node still carrying one would be dropped as an orphan.
      const seen = Array.isArray(next.aliasKeys) ? next.aliasKeys : [];
      const aliasKeys = [...new Set([...seen, next.stepKey, shownKey])].filter((key) => key !== "");
      next = { ...next, title: shown, prevKey: next.stepKey, stepKey: shownKey, aliasKeys };
    }
    if (item.status === "completed" && next.status !== STEP_STATUS.done) {
      steps[at] = closeStep(next, time);
      if (next.startedAt > 0) durations = [...durations, time - next.startedAt].filter((value) => value > 0);
    } else if (item.status === "in_progress" && next.status !== STEP_STATUS.running) {
      // A step re-opened by a re-plan or a retry: keep its ledger row, restart the clock.
      steps[at] = reopenStep(next, time);
    } else if (next !== step) {
      steps[at] = next;
    }
    authority.set(at, { status: item.status, byTitle: matchedByTitle });
  }

  // The final pass: one status per step, exactly as the table now states it. `pending` is a real
  // state — a row the model has not started — and a step that still carried `done` or `running`
  // from the previous wording of the table has to be demoted, or the panel shows finished work the
  // table does not claim (and a bar at 100 % next to an empty todo). Demotion is only safe when the
  // row matched on its own title; a slot match after a reword could hit a different row's step.
  for (const [at, claim] of authority) {
    const step = steps[at];
    if (!step) continue;
    if (claim.status === "completed" && step.status !== STEP_STATUS.done) {
      if (step.startedAt > 0) durations = [...durations, time - step.startedAt].filter((value) => value > 0);
      steps[at] = closeStep(step, time);
    } else if (claim.status === "in_progress" && step.status !== STEP_STATUS.running) {
      steps[at] = reopenStep(step, time);
    } else if (claim.status === "pending" && step.status !== STEP_STATUS.pending) {
      // Same rule for a demotion: the row is not done, so it cannot keep a done row's number.
      steps[at] = {
        ...step,
        status: STEP_STATUS.pending,
        endedAt: null,
        startedAt: 0,
        percent: null,
        percentSource: "none",
        maxPercent: 0,
      };
    }
  }

  // A row the table no longer names, that never started and owns no node, is the leftover of an
  // earlier wording of the same list. Keeping it leaves a permanently empty card in the step
  // column, which is how every rewritten table used to grow the panel by one or two rows.
  const named = new Set(todos.map((item) => normalizeTitle(item.content)).filter((key) => key !== ""));
  const nodeKeys = new Set(state.nodes.map((node) => node.stepKey));
  const kept = steps.filter((step) => {
    if (step.status !== STEP_STATUS.pending || step.startedAt > 0) return true;
    const keys = [step.stepKey, ...(Array.isArray(step.aliasKeys) ? step.aliasKeys : [])].filter(Boolean);
    if (keys.some((key) => nodeKeys.has(key))) return true;
    return keys.some((key) => named.has(key));
  });
  if (kept.length !== steps.length) steps = kept;


  return { ...state, asOf: time, todos, steps: reindex(steps), durations };
}

function foldToolCall(state, event, time, seq) {
  const data = dataOf(event);
  const name = data && typeof data.name === "string" ? data.name : "";
  const args = data ? parseArgs(data.arguments) : null;
  const callId = data && typeof data.callId === "string" ? data.callId : null;
  if (name === "") return state;

  const files = filesFor(name, args);
  const node = newNode("tool", name, toolTitle(name, args), time, {
    seq,
    key: toolKey(name, args),
    detail: argsSummary(name, args),
    argsText: argsDigest(args),
    files,
    callId,
  });
  // `ask_user_question` is the tool the model calls to ASK the user something. It must
  // produce a `question` node (not a plain `tool` node), because that is what the needs-confirmation flag
  // reads — and the settled/answered state comes from the same call's tool result below.
  // Measured 2026-10-18: 87 such calls across the logs, every one answered by its own result
  // except one whose result is the pending notice.
  if (name === ASK_USER_QUESTION_TOOL) {
    const questions = args && Array.isArray(args.questions) ? args.questions : [];
    const first = questions.find(isRecord);
    const label =
      first && typeof first.question === "string"
        ? first.question
        : first && typeof first.header === "string"
          ? first.header
          : "等待用户回答";
    const asked = state.nodes.filter((node) => node.kind === "question" && node.callId === callId);
    const withQuestion = {
      ...state,
      nodes: state.nodes.filter((node) => !asked.includes(node)),
    };
    const question = newNode("question", name, label, time, {
      seq,
      key: `ask:${callId || ""}`,
      detail: `${questions.length} 个问题`,
      callId,
      answered: false,
      files: [],
    });
    return appendNode(withQuestion, question, time);
  }
  const next = appendNode(state, node, time);
  const branchKind = branchKindForTool(name);
  if (branchKind === "") return next;
  // A launcher call (subagent / workflow) opens the lane in the SAME fold: the call IS the
  // start, because the subagent bus event never reaches a recorded session log (header).
  return openLauncherBranch(next, branchKind, name, args, callId, time, seq);
}

function foldToolResult(state, event, time, seq) {
  const data = dataOf(event);
  const message = data && isRecord(data.message) ? data.message : null;
  const callId = message && typeof message.toolCallId === "string" ? message.toolCallId : null;
  const isError = message ? message.isError === true : false;
  if (callId === null) return state;

  // The matching call: the most recent node with this callId that has no result yet.
  let targetIndex = -1;
  for (let i = state.nodes.length - 1; i >= 0; i -= 1) {
    const node = state.nodes[i];
    if (node.callId === callId && node.resultHead === "" && node.error === "") {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex === -1) return state;

  const content = message && Array.isArray(message.content) ? message.content : [];
  const body = resultText(content);
  const nodes = [...state.nodes];
  const previous = nodes[targetIndex];
  nodes[targetIndex] = {
    ...previous,
    resultHead: isError ? "" : line(body),
    error: isError ? line(body) : "",
    // Settled means "the call came back", whatever its body: empty output is not a pending call.
    settled: true,
    durationMs: previous.at > 0 && time > previous.at ? time - previous.at : null,
  };
  const answered = { ...state, asOf: time, nodes };
  // a question node is settled by its OWN result. An error result settles it too (the
  // user saw something and the loop moved on); only the PENDING notice leaves it open.
  const settled =
    previous.kind === "question"
      ? {
          ...answered,
          nodes: answered.nodes.map((node, at) =>
            at === targetIndex && !/pending|timeout|no answer batch/i.test(body) ? { ...node, answered: true } : node,
          ),
        }
      : answered;
  // A result is not an activity. Re-asserting the node that just finished as the active one
  // makes the panel claim "calling right now" about a call that already returned. Keep the
  // node a newer call opened, and otherwise hand the highlight back to the step.
  const keepActive =
    state.active && typeof state.active.nodeId === "string" && state.active.nodeId !== "" && state.active.nodeId !== previous.id
      ? state.active.nodeId
      : null;
  const next = withActive(settled, keepActive, time);
  // A tool result is the moment two branch decisions become possible: a job that is STILL
  // open (background) is promoted to a lane, and a launcher's acknowledgement attaches its
  // run id. Both are no-ops for ordinary calls.
  return settleLauncherBranch(promoteJobLane(next, callId, time), callId, time, isError, body);
}

function foldStepStart(state, event, time) {
  const data = dataOf(event);
  const modelStep = data && isFiniteNumber(data.step) ? data.step : null;
  if (modelStep === null) return state;
  // A `step/start` (data = { turn, step }) is a MODEL step, not a plan step: one turn holds
  // dozens of them (measured: 128 in a 4-turn session). Treating it as a plan-step boundary
  // would close every plan step after its first model step, so this only moves the activity
  // pointer and stamps the running plan step. No node is created: 128 markers would bury
  // the real work in the flow column.
  const step = runningStep(state) ?? state.steps[state.steps.length - 1] ?? null;
  if (!step) return { ...state, asOf: time };
  const steps = state.steps.map((row) =>
    row.index === step.index ? { ...row, modelStep, lastActivityAt: time, lastEstimateAt: time } : row,
  );
  return { ...state, asOf: time, steps };
}

function foldStepEnd(state, _event, time) {
  // Activity bookkeeping only — see foldStepStart for why this is not a step boundary.
  const step = runningStep(state) ?? state.steps[state.steps.length - 1] ?? null;
  if (!step) return { ...state, asOf: time };
  const steps = state.steps.map((row) => (row.index === step.index ? { ...row, lastActivityAt: time } : row));
  return { ...state, asOf: time, steps };
}

function foldAssistant(state, event, time, seq) {
  const data = dataOf(event);
  const message = data && isRecord(data.message) ? data.message : null;
  const content = message && Array.isArray(message.content) ? message.content : [];
  const textBlock = content.find((block) => isRecord(block) && block.type === "text" && typeof block.text === "string");
  const calls = content.filter((block) => isRecord(block) && block.type === "tool-call");
  if (!textBlock && calls.length === 0) return state;
  const node = newNode("message", "", textBlock ? line(textBlock.text) : `发起 ${calls.length} 个工具调用`, time, {
    seq,
    detail: calls.length > 0 ? calls.map((call) => (typeof call.name === "string" ? call.name : "")).filter(Boolean).join(", ") : "",
  });
  return appendNode(state, node, time);
}

function foldUser(state, event, time, seq) {
  const data = dataOf(event);
  const content = data && Array.isArray(data.content) ? data.content : [];
  const block = content.find((item) => isRecord(item) && item.type === "text" && typeof item.text === "string");
  if (!block) return state;
  const source = data && isRecord(data.source) ? data.source : {};
  const kind = typeof source.kind === "string" ? source.kind : "";

  // A settled subagent reports through a USER message, not a tool result (measured in this
  // session's log: `source.kind === "subagent-settled"` with `senderSessionId` = the child's
  // id, and the child's final answer first arrives as `source.kind === "agent-message"`).
  // THIS is what closes the lane, so "a subtask ending turns the status into done/failed" holds in a real log.
  if (kind === "subagent-settled" || kind === "agent-message" || kind === "workflow-settled") {
    const childId = typeof source.senderSessionId === "string" ? source.senderSessionId : "";
    const open = openBranch(state, (branch) => branch.runId !== "" && branch.runId === childId);
    if (!open) return state;
    if (kind === "agent-message") {
      return addBranchNode(
        state,
        open.id,
        { kind: "message", title: "子代理消息", detail: text(block.text), status: STEP_STATUS.running },
        time,
      );
    }
    const summary = typeof source.summary === "string" ? source.summary : "";
    // Only the SUMMARY decides failure: the relayed body is the child's own prose and may
    // legitimately contain the word "error" without the run having failed.
    const failed = /fail|error|cancel|失败/i.test(summary);
    const next = addBranchNode(
      state,
      open.id,
      {
        kind: "end",
        title: failed ? "子代理失败" : "子代理结束",
        detail: text(summary || block.text),
        status: failed ? STEP_STATUS.failed : STEP_STATUS.done,
      },
      time,
    );
    return closeBranch(next, open.id, time, failed ? STEP_STATUS.failed : "done");
  }

  // The FIRST genuine user message is the task text. Everything else that carries a
  // `source.kind` (agent instructions, runtime context, the skill catalogue, the model
  // selector) is host plumbing: it must never become the task and never becomes a node.
  if (state.task === "" && kind === "user") {
    // The task text is the view's HEADER, not a flow node: a node called "task start" would add
    // a step-shaped row that says nothing about the work that was actually done.
    return { ...state, asOf: time, task: text(block.text, TITLE_LIMIT) };
  }

  if (kind.startsWith(PAE_SOURCE_PREFIX)) {
    // PAE's own context messages, written with source.kind = plugin:dsh-plan-and-execute
    // (measured in this session's log). Four shapes, told apart by `source.summary` — the
    // label PAE itself puts on the instruction (its prompts.ts, lines 273-329):
    //   "plan-and-execute: start planning (...)"       — the kickoff, opens the planning phase
    //   "plan-and-execute: plan summary"           — the plan rows: the step list, anchored at its seq
    //   "plan-and-execute: executing step i/N (...)"  — the step instruction, opens step i
    //   "plan-and-execute: step i/N result"      — step i's report: closes it, records the summary
    // These are the ONLY reliable plan-step boundaries: they are what PAE's own
    // orchestrator.json anchorSeqs point at, so can confirm them later.
    const summary = typeof source.summary === "string" ? source.summary : "";
    const instruction = parseStepInstruction(block.text, summary);
    if (instruction) {
      const opened = openPlanStep(state, time, seq, instruction.planIndex, instruction.title, block.text);
      return opened;
    }
    const report = parseStepReport(summary) ?? parseStepReport(block.text);
    if (report) return foldPaeReport(state, time, seq, report, block.text);
    const planRows = parsePlanRows(block.text);
    if (planRows.length > 1) {
      const planned = ensurePlanSteps(state, time, planRows);
      return openPlanStep(planned, time, seq, planRows[0].planIndex, planRows[0].title, block.text);
    }
    return appendNode(
      { ...state, asOf: time },
      newNode("message", "", summary || "PAE 指令", time, { seq, detail: text(block.text, TEXT_LIMIT) }),
      time,
    );
  }
  // A message THIS plugin injected has now been admitted by the session itself.
  // Its id is the one the splice carried, so the history row's status can flip from
  // "entered the inbox" to "session picked it up" on measured evidence rather than on a guess.
  if (kind === SELF_SOURCE_KIND && typeof data.id === "string" && data.id !== "") {
    return markInjectPickedUp({ ...state, asOf: time }, data.id, time);
  }

  return state;
}

/**
 * Plan-step bookkeeping.
 *
 * A plan step has TWO identities that must not drift apart: the ordinal PAE prints
 * ("executing plan step 3/14") and the title the plan and the todo table both carry. `planIndex`
 * holds the ordinal; `normalizeTitle` compares titles. Either one matching is enough to
 * recognise the same step, which matters because the todo table is written BEFORE the plan
 * summary and again after every step.
 */

/** "3. host projection: ..." -> 3, and "12, x" / "12) x" alike; null when the row carries no ordinal. */
function planIndexOf(content) {
  const match = /^\s*(\d+)\s*[.、．)]\s*\S/.exec(content);
  return match ? Number(match[1]) : null;
}

/** A title with its ordinal and decoration removed, for comparison only (never displayed). */
function normalizeTitle(value) {
  return typeof value === "string"
    ? value.replace(/^\s*\d+\s*[.、．)]\s*/, "").replace(/[（(][^）)]*[）)]\s*$/, "").replace(/\s+/g, "").trim()
    : "";
}
/**
 * How many leading characters two normalised titles share. Used to recognise a row the
 * model REWORDED between two `todo/write` events (it does this often: "read-only inventory: read plugin sources..." ->
 * "read-only inventory: sources/config..."). Rewording must reuse the existing ledger row, or the old row keeps the
 * nodes and the new one starts empty — the user-visible symptom was "only the running step shows
 * tool types".
 */
function commonPrefix(left, right) {
  const a = typeof left === "string" ? left : "";
  const b = typeof right === "string" ? right : "";
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at]) at += 1;
  return at;
}

/**
 * Shortest shared prefix (normalised chars) that still means "the same row, reworded", AND the
 * share of the shorter title it has to cover. 6 chars alone was wrong: "read-only inventory: sources..." vs
 * "read-only inventory: read plugin sources..." share only "read-only inventory" + a colon (4-5 chars after normalisation), so a
 * reworded row was treated as deleted and its nodes fell onto the neighbouring step. Requiring
 * 60 % of the shorter title as well accepts that pair (5/8) without gluing unrelated rows together
 * (two rows sharing a boilerplate opening still differ in the rest of the title).
 */
const REWORD_PREFIX_MIN = 4;
const REWORD_SHARE_MIN = 0.6;

/**
 * The title a step is DISPLAYED with: the todo row's own list ordinal is dropped.
 * "12. panel settings and export" becomes "panel settings and export" — the panel draws its own numbering, and two
 * numbering systems on one card read as a mistake. The PAE plan titles already have no ordinal.
 */
function stripOrdinal(value) {
  return typeof value === "string" ? value.replace(/^\s*\d+\s*[.、．)]\s*/, "").trim() : "";
}

/** Re-number `index` after a step list has been rebuilt (index === position, always). */
function reindex(steps) {
  return steps.map((step, index) => (step.index === index ? step : { ...step, index }));
}

/** "executing plan step 3/14: title" (PAE stepInstruction) or its summary form. */
function parseStepInstruction(blockText, summary) {
  const fromText = /^执行计划第\s*(\d+)\s*\/\s*(\d+)\s*步[：:]\s*(.+)$/m.exec(blockText);
  if (fromText) return { planIndex: Number(fromText[1]), total: Number(fromText[2]), title: text(fromText[3], TITLE_LIMIT) };
  const fromSummary = /执行第\s*(\d+)\s*\/\s*(\d+)\s*步[（(](.+)[）)]/.exec(summary);
  if (fromSummary) return { planIndex: Number(fromSummary[1]), total: Number(fromSummary[2]), title: text(fromSummary[3], TITLE_LIMIT) };
  return null;
}

/** "[plan-and-execute previous result: step 3/14 (title)]" -> { planIndex: 3 }. */
function parseStepReport(value) {
  const match = /第\s*(\d+)\s*\/\s*(\d+)\s*步[（(]([^）)]+)[）)]/.exec(value);
  if (!match) return null;
  return { planIndex: Number(match[1]), total: Number(match[2]), title: text(match[3], TITLE_LIMIT) };
}

/** The plan rows of "[plan-and-execute plan summary]" - "1. title (step-01-x.md)" per line. */
function parsePlanRows(blockText) {
  const rows = [];
  for (const raw of blockText.split("\n")) {
    const match = /^\s*(\d+)\.\s*(.+)$/.exec(raw);
    if (!match) continue;
    // PAE appends each row's own step FILE to the title ("1. title（…）（step-01-x.md）"). That
    // annotation is not title text: keeping it leaves `normalizeTitle` one parenthetical group short
    // of the todo row the model writes ("1. title（…）"), so a plan step can carry a title that no
    // row of the todo table has. Measured 2026-10-30 on session 1bb4baa0: the fold opened step 1 with
    // the annotated title while its `stepKey` still held the table's wording, `foldTodos` therefore
    // saw "no change" and the view kept a step the conversation does not list (audit-real ①).
    const title = match[2].replace(/\s*[（(][^（()）]*\.(?:md|markdown|mjs|cjs|js|json|ya?ml|txt)[）)]\s*$/, "");
    rows.push({ planIndex: Number(match[1]), title: text(title, TITLE_LIMIT) });
    if (rows.length >= 80) break;
  }
  return rows;
}

/** Make sure every plan row has a step, without disturbing the ones already there. */
function ensurePlanSteps(state, time, rows) {
  let steps = [...state.steps];
  for (const row of rows) {
    const at = steps.findIndex(
      (step) => step.planIndex === row.planIndex || normalizeTitle(step.title) === normalizeTitle(row.title),
    );
    if (at === -1) {
      const created = newStep(steps.length, row.title, 0, "pae");
      created.planIndex = row.planIndex;
      created.status = STEP_STATUS.pending;
      steps.push(created);
    } else if (steps[at].planIndex === undefined) {
      steps[at] = { ...steps[at], planIndex: row.planIndex };
    }
  }
  return { ...state, steps: reindex(steps) };
}

/**
 * The seq a plan step should be anchored at: PAE's own anchor for step i+1 is the report
 * message of step i (its `anchorSeqs[i+1]`), which `foldPaeReport` parked in `pendingAnchor`.
 * Without one, the instruction message's own seq is the best evidence available.
 */
function anchorOf(state, planIndex, seq) {
  const pending = state.pendingAnchor;
  if (pending && pending.planIndex === planIndex && isFiniteNumber(pending.seq)) return pending.seq;
  return seq === null ? undefined : seq;
}
/**
 * Open plan step `planIndex` at `seq`: close whatever was running, then make this step the
 * running one (creating it when the todo table has not produced it yet). The anchor is set
 * once and never moved — a retried instruction must not re-anchor the step.
 */
function openPlanStep(state, time, seq, planIndex, title, blockText) {
  let steps = [...state.steps];
  let durations = state.durations;
  const targetAt = steps.findIndex((step) => step.planIndex === planIndex);
  const runningAt = steps.findIndex((step) => step.status === STEP_STATUS.running);

  if (runningAt !== -1 && runningAt !== targetAt) {
    const closing = steps[runningAt];
    // The synthetic planning step (created for a pre-plan node) is closed but keeps its row:
    // it is where the research that PRODUCED the plan lives.
    steps[runningAt] = closeStep(closing, time);
    durations = [...durations, time - closing.startedAt].filter((value) => value > 0);
  }

  if (targetAt === -1) {
    const created = newStep(steps.length, title || `第 ${planIndex} 步`, time, "pae");
    created.planIndex = planIndex;
    created.anchorSeq = anchorOf(state, planIndex, seq);
    steps.push(created);
  } else {
    const step = steps[targetAt];
    // A plan title must not replace the row's identity key on its own: `stepKey` is what `foldTodos`
    // compares the live table against and what node attribution follows. Adopting a title without its
    // key left the pair inconsistent, so the next todo/write judged the row unchanged and a stale
    // title survived into the view (measured 2026-10-30, session 1bb4baa0). The old key is parked in
    // `aliasKeys` exactly as a rename does, so nodes already carrying it still migrate.
    const adopted = title || step.title;
    const adoptedKey = normalizeTitle(adopted);
    const renamed = adoptedKey !== "" && adoptedKey !== step.stepKey;
    const seenKeys = Array.isArray(step.aliasKeys) ? step.aliasKeys : [];
    steps[targetAt] = {
      ...step,
      planIndex,
      title: adopted,
      ...(renamed
        ? {
            prevKey: step.stepKey,
            stepKey: adoptedKey,
            aliasKeys: [...new Set([...seenKeys, step.stepKey, adoptedKey])].filter((key) => key !== ""),
          }
        : {}),
      anchorSeq: step.anchorSeq === undefined ? anchorOf(state, planIndex, seq) : step.anchorSeq,
      status: STEP_STATUS.running,
      endedAt: null,
      startedAt: step.startedAt || time,
      reportSummary: step.reportSummary || text(blockText, TITLE_LIMIT),
    };
  }

  return withActive({ ...state, asOf: time, steps: reindex(steps), durations }, null, time);
}

/** Step i reported its outcome: close it, keep the report text and the success/failure flag. */
function foldPaeReport(state, time, seq, report, blockText) {
  let steps = [...state.steps];
  let durations = state.durations;
  const at = steps.findIndex((step) => step.planIndex === report.planIndex);
  if (at !== -1) {
    const step = steps[at];
    const wasRunning = step.status === STEP_STATUS.running;
    steps[at] = {
      ...(wasRunning ? closeStep(step, time) : step),
      reportSummary: text(blockText, TITLE_LIMIT),
      outcome: /状态：\s*成功/.test(blockText) ? "success" : /状态：\s*失败/.test(blockText) ? "failed" : step.outcome ?? "",
    };
    if (wasRunning) durations = [...durations, time - step.startedAt].filter((value) => value > 0);
  }
  // PAE's own anchor for step i+1 IS this report message (orchestrator.json anchorSeqs[i+1]
  // is exactly its seq), so remember it: when the next instruction opens that step it can
 // anchor on the same event PAE did, and orchestrator read confirms it instead of
  // correcting it.
  const pendingAnchor = { planIndex: report.planIndex + 1, seq: seq === null ? null : seq };
  return withActive({ ...state, asOf: time, steps: reindex(steps), durations, pendingAnchor }, null, time);
}


/**
 * Close a step at `time`.
 *
 * A finished step is 100% — that is what "done" MEANS — so the bar fills and stays filled.
 * Keeping the last baseline guess here would show a completed step at 83% forever, which is
 * the one thing a workflow map must not do. The model's own last report is preserved on the
 * step as `maxPercent`, so a UI that wants "the last self-report" can still show it.
 */
function closeStep(step, time) {
  return {
    ...step,
    status: STEP_STATUS.done,
    endedAt: time,
    percent: 100,
    percentSource: step.percentSource === "model" ? "model" : "closed",
    maxPercent: Math.max(step.maxPercent, 100),
  };
}

function foldTurnStart(state, _event, time) {
  // A new turn does not close the current step (PAE re-sends the todo table each turn),
  // but it does clear the "current node" highlight: the next node opens it again.
  // and it opens the turn, which is what `view.running` reports.
  return withActive({ ...state, asOf: time, turnActive: true }, null, time);
}

function foldTurnEnd(state, _event, time) {
  const next = { ...state, asOf: time, turnActive: false };
  // The turn is over, so the step it was running is over too. Leaving it `running` kept a live,
  // forever-partial bar on the last step of every finished session.
  // The one exception is a step the todo table still names as its `in_progress` row: that step
  // really does continue into the next turn, and closing it here would make the next turn reopen
  // a step that never stopped.
  const running = runningStep(next);
  if (!running) return next;
  const inProgress = inProgressStepIndex(next);
  if (isFiniteNumber(inProgress) && inProgress === running.index) return next;
  const durations =
    running.startedAt > 0 ? [...next.durations, time - running.startedAt].filter((value) => value > 0) : next.durations;
  const steps = next.steps.map((step) => (step.index === running.index ? closeStep(step, time) : step));
  return withPercents({ ...next, steps, durations }, time);
}

function foldReport(state, event, time) {
  const data = dataOf(event);
  const raw = data ? data.percent : undefined;
  if (!isFiniteNumber(raw)) return state;
  const note = data && typeof data.note === "string" ? data.note : "";
  // the report belongs to the step the TODO TABLE says is in progress (the model's own
  // "this is what I am doing now"), and only falls back to the running row. Before this, a
  // stale synthetic "planning & research" row won every report: the user saw one bar jump to 45 % on the
  // planning card while the real step stayed on an indeterminate streamer.
  const inProgress = inProgressStepIndex(state);
  const step =
    (isFiniteNumber(inProgress) && state.steps[inProgress] ? state.steps[inProgress] : null) ??
    runningStep(state) ??
    state.steps[state.steps.length - 1] ??
    null;
  if (!step) return { ...state, asOf: time };
  const value = clamp(raw, 0, 100);
  const reports = [...state.reports.filter((entry) => entry.stepIndex !== step.index), { stepIndex: step.index, percent: value }]
    .slice(-REPORTS_PER_STEP);
  // a report IS the moment a progress number came into being, so it is the
  // `lastEstimateAt` stamp the rail's "estimated N minutes ago" segment measures from. Same event time,
  // no clock read.
  const stamped = state.steps.map((row) =>
    row.index === step.index ? { ...row, lastEstimateAt: time } : row,
  );
  const next = withPercents({ ...state, asOf: time, steps: stamped, reports }, time);
  return appendNode(next, newNode("report", "", `进度自报 ${value}%`, time, { detail: text(note), stepIndex: step.index }), time);
}

/**
 * Branch lanes : a subagent, a workflow run and a background job all run IN
 * PARALLEL with the plan step that started them, so their activity cannot be folded into
 * that step's node list — a subagent's own tool calls are not the plan step's calls. A lane
 * is a small ordered log of activity rows attached to the step that was running when it
 * started. It deliberately lives OUTSIDE `state.nodes`, so the main flow's node count, its
 * same-tool groups, the 300 / 1200 caps and the “current activity” highlight are untouched.
 */

/** A workflow phase heading inside a lane (a section, not a tool call). */
const BRANCH_ROW_PHASE = "phase";

/** The step a branch belongs to: the running one, else the last one (never invented). */
function branchStepIndex(state) {
  const running = runningStep(state);
  if (running) return running.index;
  const last = state.steps[state.steps.length - 1];
  return last ? last.index : null;
}

/** Tool name -> branch kind. `workflow` is a tool too: calling it launches a workflow run. */
function branchKindForTool(tool) {
  if (tool === "subagent" || tool === "subagent_fork") return "subagent";
  if (tool === "workflow") return "workflow";
  return "";
}

/** Open one lane. Bounded: the oldest CLOSED lane makes room when the cap bites. */
function pushBranch(state, spec, time) {
  const branch = {
    id: `b${state.nextBranchId}`,
    kind: spec.kind,
    label: text(spec.label || "", TITLE_LIMIT),
    status: STEP_STATUS.running,
    startedAt: isFiniteNumber(spec.startedAt) && spec.startedAt > 0 ? spec.startedAt : time,
    endedAt: null,
    stepIndex: isFiniteNumber(spec.stepIndex) ? spec.stepIndex : branchStepIndex(state),
    seq: spec.seq === undefined ? null : spec.seq,
    callId: spec.callId || "",
    runId: spec.runId || "",
    jobId: spec.jobId || "",
    count: 0,
    nodes: [],
  };
  const branches = [...state.branches, branch];
  let droppedBranches = state.droppedBranches;
  if (branches.length > BRANCH_TOTAL) {
    const closedAt = branches.findIndex((item) => item.status !== STEP_STATUS.running);
    branches.splice(closedAt === -1 ? 0 : closedAt, 1);
    droppedBranches += 1;
  }
  return { ...state, asOf: time, branches, droppedBranches, nextBranchId: state.nextBranchId + 1 };
}

/** Append one activity row (head dropped past BRANCH_NODES; `count` stays honest). */
function addBranchNode(state, branchId, node, time) {
  const at = state.branches.findIndex((item) => item.id === branchId);
  if (at === -1) return state;
  const branch = state.branches[at];
  const nodes = [
    ...branch.nodes,
    { ...node, id: `${branch.id}.n${branch.count + 1}`, at: node.at === undefined ? time : node.at },
  ];
  if (nodes.length > BRANCH_NODES) nodes.splice(0, nodes.length - BRANCH_NODES);
  const branches = state.branches.slice();
  branches[at] = { ...branch, nodes, count: branch.count + 1 };
  return { ...state, asOf: time, branches };
}

/** Patch one row inside a lane (an agent start and its end are the same row). */
function patchBranchNode(state, branchId, rowKey, patch, time) {
  const at = state.branches.findIndex((item) => item.id === branchId);
  if (at === -1 || rowKey === "") return state;
  const branch = state.branches[at];
  let found = false;
  const nodes = branch.nodes.map((node) => {
    if (node.key !== rowKey) return node;
    found = true;
    return { ...node, ...patch };
  });
  if (!found) return state;
  const branches = state.branches.slice();
  branches[at] = { ...branch, nodes };
  return { ...state, asOf: time, branches };
}

/** The newest open lane matching `match`, or null. */
function openBranch(state, match) {
  for (let i = state.branches.length - 1; i >= 0; i -= 1) {
    const branch = state.branches[i];
    if (branch.status === STEP_STATUS.running && match(branch)) return branch;
  }
  return null;
}

/** Patch one lane in place (every other row keeps its identity). */
function patchBranch(state, branchId, patch, time) {
  const at = state.branches.findIndex((item) => item.id === branchId);
  if (at === -1) return state;
  const branches = state.branches.slice();
  branches[at] = { ...branches[at], ...patch };
  return { ...state, asOf: time, branches };
}

/** Close a lane. `failed` is the only forced status; anything else closes as done. */
function closeBranch(state, branchId, time, status) {
  const at = state.branches.findIndex((item) => item.id === branchId);
  if (at === -1) return state;
  if (state.branches[at].status !== STEP_STATUS.running) return state;
  const branches = state.branches.slice();
  branches[at] = {
    ...branches[at],
    status: status === STEP_STATUS.failed ? STEP_STATUS.failed : STEP_STATUS.done,
    endedAt: time,
  };
  return { ...state, asOf: time, branches };
}

/** Find the open lane of `kind` for this run, or open one and return its id. */
function ensureBranch(state, kind, spec, time) {
  const wanted = spec.runId || "";
  const open = openBranch(
    state,
    (branch) => branch.kind === kind && (wanted === "" || branch.runId === "" || branch.runId === wanted),
  );
  if (open) {
    // A launcher opened the lane first (tool call before run-start): give it its run id.
    const attached = open.runId === "" && wanted !== "" ? patchBranch(state, open.id, { runId: wanted }, time) : state;
    return { state: attached, id: open.id };
  }
  const next = pushBranch(state, { ...spec, kind }, time);
  return { state: next, id: next.branches[next.branches.length - 1].id };
}

/** Label of a launcher call: the description the model wrote, else the tool name. */
function launcherLabel(tool, args) {
  if (!args) return tool;
  const description = typeof args.description === "string" ? args.description : "";
  const agent = typeof args.agent === "string" ? args.agent : "";
  return text(description || agent || tool, TITLE_LIMIT);
}

/** A subagent / workflow LAUNCHER call opens a lane next to its plan step. */
function openLauncherBranch(state, kind, tool, args, callId, time, seq) {
  const opened = pushBranch(
    state,
    { kind, label: launcherLabel(tool, args) || (kind === "subagent" ? "子代理" : "工作流"), callId: callId || "", seq },
    time,
  );
  const branch = opened.branches[opened.branches.length - 1];
  if (!branch || branch.kind !== kind) return opened;
  return addBranchNode(
    opened,
    branch.id,
    {
      kind: "start",
      tool,
      title: kind === "subagent" ? "子代理启动" : "工作流启动",
      detail: branch.label,
      status: STEP_STATUS.running,
    },
    time,
  );
}

/** `tool/result` of a launcher: the subagent / blocking workflow finished — close the lane. */
function settleLauncherBranch(state, callId, time, isError, body) {
  const open = openBranch(state, (branch) => branch.callId !== "" && branch.callId === callId);
  if (!open) return state;
  // A BACKGROUND workflow returns its handle immediately; its lane closes on
  // `tool-workflow/run-end`, never on the launcher's own (instant) result.
  if (open.kind === "workflow" && open.runId !== "") return state;
  // A subagent / workflow tool does NOT block: its result is the launch ACKNOWLEDGEMENT
  // ("started subagent <id>", measured in this session). That is an ATTACH, not a close —
  // the lane closes on `subagent-settled` (foldUser) or `tool-workflow/run-end`.
  if (!isError && LAUNCH_ACK.test(String(body).trim())) {
    const runId = launcherRunId(String(body).trim());
    return runId === "" ? state : patchBranch(state, open.id, { runId }, time);
  }
  const next = addBranchNode(
    state,
    open.id,
    {
      kind: "end",
      title: isError ? "失败" : "完成",
      detail: line(body),
      status: isError ? STEP_STATUS.failed : STEP_STATUS.done,
    },
    time,
  );
  return closeBranch(next, open.id, time, isError ? STEP_STATUS.failed : "done");
}

/** `subagent/start` / `subagent/end` (PLUGIN-BUS shape — see the header note). */
function foldSubagent(state, event, time, seq, kind) {
  const data = dataOf(event);
  if (!data) return state;
  const runId = typeof data.runId === "string" ? data.runId : typeof data.id === "string" ? data.id : "";
  const label =
    typeof data.description === "string"
      ? data.description
      : typeof data.label === "string"
        ? data.label
        : typeof data.provider === "string"
          ? data.provider
          : "";
  if (kind === "start") {
    // The launcher tool call usually opened the lane already: attach the run to it rather
    // than drawing a second lane for one subagent.
    const open = openBranch(state, (branch) => branch.kind === "subagent" && branch.runId === "");
    if (open) {
      const attached = patchBranch(
        state,
        open.id,
        { runId: runId || open.runId, label: open.label || text(label, TITLE_LIMIT) },
        time,
      );
      // The launcher wrote the start row already: attaching the run must NOT add a second
      // one, or one subagent would read as two starts.
      return attached;
    }
    return addBranchNode(
      pushBranch(state, { kind: "subagent", label: text(label || "子代理", TITLE_LIMIT), runId, seq }, time),
      `b${state.nextBranchId}`,
      { kind: "start", title: "子代理启动", detail: text(label), status: STEP_STATUS.running },
      time,
    );
  }
  const open = openBranch(state, (branch) => branch.kind === "subagent" && (runId === "" || branch.runId === runId));
  if (!open) return state;
  const stopReason = typeof data.stopReason === "string" ? data.stopReason : "";
  const failed = /fail|error|cancel/i.test(stopReason);
  const body = Array.isArray(data.lastAssistantMessage)
    ? resultText(data.lastAssistantMessage)
    : typeof data.lastAssistantMessage === "string"
      ? data.lastAssistantMessage
      : "";
  const next = addBranchNode(
    state,
    open.id,
    {
      kind: "end",
      title: stopReason === "" ? "结束" : `结束 · ${stopReason}`,
      detail: line(body),
      status: failed ? STEP_STATUS.failed : STEP_STATUS.done,
    },
    time,
  );
  return closeBranch(next, open.id, time, failed ? STEP_STATUS.failed : "done");
}

/**
 * `workflow/*` (PLUGIN-BUS shape): a run start, its phase headings and its end. The phase
 * title is a SECTION row inside the lane, exactly as §1 asks.
 */
function foldWorkflowBus(state, type, event, time, seq) {
  const data = dataOf(event);
  if (!data) return state;
  const runId = typeof data.runId === "string" ? data.runId : typeof data.id === "string" ? data.id : "";
  const name =
    typeof data.name === "string" ? data.name : typeof data.title === "string" ? data.title : typeof data.phase === "string" ? data.phase : "";
  if (type === TYPE_WORKFLOW_END) {
    const open = openBranch(state, (branch) => branch.kind === "workflow" && (runId === "" || branch.runId === runId));
    return open ? closeBranch(state, open.id, time, "done") : state;
  }
  const lane = ensureBranch(state, "workflow", { label: text(name || "工作流", TITLE_LIMIT), runId, seq }, time);
  if (type === TYPE_WORKFLOW_PHASE) {
    const phase = typeof data.phase === "string" ? data.phase : name;
    if (phase === "") return lane.state;
    return addBranchNode(lane.state, lane.id, { kind: BRANCH_ROW_PHASE, title: text(phase, TITLE_LIMIT), status: STEP_STATUS.running }, time);
  }
  return addBranchNode(lane.state, lane.id, { kind: "start", title: text(name || "工作流启动", TITLE_LIMIT), status: STEP_STATUS.running }, time);
}

/**
 * `tool-workflow/*` (SESSION-LOG shape, the one a recorded log actually carries).
 * run-start -> the lane (labelled with the workflow's meta name), agent-start -> one row
 * per member (keyed by `seq`, so agent-end updates the SAME row), run-end -> close.
 */
function foldWorkflowRun(state, type, event, time, seq) {
  const data = dataOf(event);
  if (!data) return state;
  const runId = typeof data.runId === "string" ? data.runId : "";
  if (type === TYPE_TW_RUN_START) {
    const name = typeof data.name === "string" ? data.name : "工作流";
    return ensureBranch(state, "workflow", { label: text(name, TITLE_LIMIT), runId, seq }, time).state;
  }
  if (type === TYPE_TW_RUN_END) {
    const open = openBranch(state, (branch) => branch.kind === "workflow" && (runId === "" || branch.runId === runId));
    if (!open) return state;
    const stopReason = typeof data.stopReason === "string" ? data.stopReason : "completed";
    const failed = /error|fail/i.test(stopReason);
    return closeBranch(state, open.id, time, failed ? STEP_STATUS.failed : "done");
  }
  const open = openBranch(state, (branch) => branch.kind === "workflow" && (runId === "" || branch.runId === runId));
  if (!open) return state;
  const memberSeq = isFiniteNumber(data.seq) ? String(data.seq) : "";
  const label = typeof data.label === "string" ? data.label : "成员";
  const phase = typeof data.phase === "string" ? data.phase : "";
  const rowKey = memberSeq === "" ? "" : `agent:${memberSeq}`;
  if (type === TYPE_TW_AGENT_START) {
    let next = data.phase === undefined
      ? state
      : addBranchNode(state, open.id, { kind: BRANCH_ROW_PHASE, title: text(phase, TITLE_LIMIT), status: STEP_STATUS.running }, time);
    return addBranchNode(
      next,
      open.id,
      { kind: "agent", key: rowKey, title: text(label, TITLE_LIMIT), detail: text(phase), status: STEP_STATUS.running },
      time,
    );
  }
  // agent-end: the row opened by agent-start (same `seq`) changes status; nothing is added
  // when that row was dropped by the 40-row cap.
  const outcome = typeof data.outcome === "string" ? data.outcome : "completed";
  const rowStatus = outcome === "failed" ? STEP_STATUS.failed : outcome === "cancelled" ? STEP_STATUS.pending : STEP_STATUS.done;
  const patched = rowKey === "" ? state : patchBranchNode(state, open.id, rowKey, { status: rowStatus, detail: text(outcome) }, time);
  return patched;
}

/**
 * `job/registered` / `job/settled` (measured payloads in the header): a background long
 * task — pwsh run_in_background, a workflow background run — gets its own lane, and the
 * lane's conclusion comes from `outcome.status`, never from the tool result.
 */
function foldJob(state, event, time, seq, settled) {
  const data = dataOf(event);
  if (!data) return state;
  const jobId = typeof data.jobId === "string" ? data.jobId : "";
  const rawLabel =
    typeof data.label === "string" && data.label !== "" ? data.label : typeof data.kind === "string" ? data.kind : "后台任务";
  if (!settled) {
    // Registration alone is NOT a lane: a synchronous command registers and settles inside
    // its own tool call, and 452 such jobs would flood the branch area (measured).
    const callId = isRecord(data.toolCall) && typeof data.toolCall.callId === "string" ? data.toolCall.callId : "";
    const pendingJobs = rememberJob(state, {
      jobId,
      label: text(rawLabel, TITLE_LIMIT),
      kind: typeof data.kind === "string" ? text(data.kind, 40) : "",
      startedAt: isFiniteNumber(data.startedAt) && data.startedAt > 0 ? data.startedAt : time,
      callId,
      stepIndex: branchStepIndex(state),
    });
    return { ...state, asOf: time, pendingJobs };
  }
  const pendingJobs = (Array.isArray(state.pendingJobs) ? state.pendingJobs : []).filter((job) => job.jobId !== jobId);
  const base = { ...state, asOf: time, pendingJobs };
  const open = openBranch(base, (branch) => branch.kind === "job" && (jobId === "" || branch.jobId === jobId));
  if (!open) return base;
  const outcome = isRecord(data.outcome) ? data.outcome : null;
  const raw = outcome && typeof outcome.status === "string" ? outcome.status : "completed";
  const failed = raw === "failed";
  const detailParts = [];
  if (outcome && typeof outcome.detail === "string" && outcome.detail !== "") detailParts.push(text(outcome.detail, TEXT_LIMIT));
  if (outcome && typeof outcome.result === "string" && outcome.result !== "") detailParts.push(line(outcome.result));
  const next = addBranchNode(
    base,
    open.id,
    {
      kind: "end",
      title: raw === "completed" ? "任务完成" : raw === "killed" ? "任务中止" : "任务失败",
      detail: text(detailParts.join(" · "), TEXT_LIMIT),
      status: failed ? STEP_STATUS.failed : STEP_STATUS.done,
    },
    time,
  );
  return closeBranch(next, open.id, time, failed ? STEP_STATUS.failed : "done");
}

/** Longest list of registered-but-open jobs kept (a lane is born only from one of them). */
const JOB_PENDING_LIMIT = 24;

/** A launcher's result is an ACKNOWLEDGEMENT, not a completion: "started subagent <id>". */
const LAUNCH_ACK = /^started\b/i;

/** The run id a launch acknowledgement carries ("started subagent <id>"). */
function launcherRunId(value) {
  const match =
    /started\s+(?:sub)?agent\s+([\w-]{4,})/i.exec(value) ||
    /started\s+workflow\s+([\w.-]{4,})/i.exec(value) ||
    /started\s+([\w-]{4,})/i.exec(value);
  return match ? match[1] : "";
}

/** The pending job launched by this tool call, or null. */
function pendingJobOf(state, callId) {
  if (callId === "") return null;
  const rows = Array.isArray(state.pendingJobs) ? state.pendingJobs : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i].callId === callId) return rows[i];
  return null;
}

/** Remember a registered job (bounded; the same job id replaces its old row). */
function rememberJob(state, job) {
  const rows = (Array.isArray(state.pendingJobs) ? state.pendingJobs : []).filter((row) => row.jobId !== job.jobId);
  rows.push(job);
  return rows.slice(-JOB_PENDING_LIMIT);
}

/**
 * Promote a PENDING job to a lane when its tool result arrives while the job is still open.
 *
 * MEASURED in this session's own log: every `pwsh` call ALSO registers a job and settles it
 * BEFORE its own tool result (452 registrations in one session), so drawing a lane per
 * registration would bury the real parallel work under synchronous commands. A background
 * task is exactly the opposite order — result first, settlement later — and that is the only
 * case that becomes a lane (a backend long-running task).
 */
function promoteJobLane(state, callId, time) {
  const pending = pendingJobOf(state, callId);
  if (!pending) return state;
  const opened = pushBranch(
    state,
    { kind: "job", label: pending.label, jobId: pending.jobId, startedAt: pending.startedAt, stepIndex: pending.stepIndex },
    time,
  );
  const lane = opened.branches[opened.branches.length - 1];
  const next =
    lane && lane.jobId === pending.jobId
      ? addBranchNode(
          opened,
          lane.id,
          { kind: "start", title: "后台任务启动", detail: text(pending.kind), status: STEP_STATUS.running },
          time,
        )
      : opened;
  return { ...next, pendingJobs: next.pendingJobs.filter((job) => job.jobId !== pending.jobId) };
}
function foldQuestion(state, event, time, seq) {
  const data = dataOf(event);
  const questions = data && Array.isArray(data.questions) ? data.questions : [];
  const first = questions.find(isRecord);
  const label = first && typeof first.question === "string" ? first.question : "等待用户回答";
  // the callId is what lets the tool result settle this question. The `user-questions`
  // request is a BUS event that a recorded log never carries (measured 2026-10-18: 0 hits in
  // every session log); the question really arrives as a `tool/call` named `ask_user_question`
  // (87 measured) and is settled by its own `tool/result`. So the node the UI shows comes from
  // the tool call, and this branch only handles a host that DOES record the bus shape.
  const callId = data && typeof data.callId === "string" ? data.callId : "";
  const node = newNode("question", "", label, time, { seq, detail: `${questions.length} 个问题`, callId });
  return appendNode(state, node, time);
}

function foldApproval(state, event, time, seq) {
  const data = dataOf(event);
  const label = data && typeof data.reason === "string" ? data.reason : data && typeof data.title === "string" ? data.title : "等待审批";
  const node = newNode("approval", "", label, time, { seq });
  return appendNode(state, node, time);
}

// ---------------------------------------------------------------------------
// hot-inject history (the session log is the record — no second write path)
// ---------------------------------------------------------------------------

/** One injected message, bounded and lossless. `pickedUp` is the honest status word. */
const INJECT_LIMIT = 40;

/** The two loop-owned inbox lists, and the ONLY keys the ledger ever holds. */
const INBOX_TARGETS = ["next-turn", "next-step"];

/** A ledger with both lists present and independent (a shared array must never be mutated). */
function emptyLedger() {
  return { "next-turn": [], "next-step": [] };
}

/**
 * Replay ONE `agent/inbox/spliced` onto the pending-id ledger.
 *
 * This mirrors the host's own `inboxProjectionDefinition.apply` (agent-loop `lib/types/inbox.js`):
 * take the target list, clamp `start` and `removedCount` into it, then `toSpliced`. The one
 * deliberate difference is the failure mode. The host THROWS on a malformed splice because it can
 * refuse a corrupt session; a plugin projection must not — a throw here becomes
 * `SESSION_QUERY_CORRUPT_SESSION` for the whole session and the user loses the history view. So an
 * unusable splice is treated as a no-op: the ledger only answers "which id did that removal take?",
 * and a wrong answer there must degrade to “unknown”, never to “history unavailable”.
 *
 * Returns `{ ledger, moved, removedIds }`; `moved: false` returns the CALLER's own object so the
 * fold can keep `state` identity and skip a needless clone.
 */
function inboxApplySplice(inboxIds, data) {
  const unchanged = { ledger: inboxIds, moved: false, removedIds: [] };
  if (!isRecord(data) || !INBOX_TARGETS.includes(data.target)) return unchanged;
  const current = isRecord(inboxIds) ? inboxIds : null;
  const lists = emptyLedger();
  for (const target of INBOX_TARGETS) {
    const list = current !== null && Array.isArray(current[target]) ? current[target] : [];
    // Copy per target: the input ledger may be shared with a live state that nobody cloned.
    lists[target] = list.filter((id) => typeof id === "string" && id !== "");
  }
  const list = lists[data.target];
  // Every host-written splice carries `start` (it comes from `mutate(target, start, count, …)`);
  // an older or hand-made one without it can only mean “append”, which is this fold's own
  // pre-ledger reading of such an event. Both are clamped rather than rejected: an out-of-range
  // index means the fold and the loop disagree about the pending list, and clamping keeps the rest
  // of the ledger usable instead of dropping the session.
  const rawStart = Number.isSafeInteger(data.start) ? data.start : list.length;
  const start = Math.min(Math.max(rawStart, 0), list.length);
  const rawRemoved = Number.isSafeInteger(data.removedCount) && data.removedCount > 0 ? data.removedCount : 0;
  const removedCount = Math.min(rawRemoved, list.length - start);
  const insertedIds = (Array.isArray(data.inserted) ? data.inserted : [])
    .map((message) => (isRecord(message) && typeof message.id === "string" ? message.id : ""))
    .filter((id) => id !== "");
  const removedIds = list.slice(start, start + removedCount);
  if (removedIds.length === 0 && insertedIds.length === 0) return unchanged;
  lists[data.target] = [...list.slice(0, start), ...insertedIds, ...list.slice(start + removedCount)];
  return { ledger: lists, moved: true, removedIds };
}

/**
 * `agent/inbox/spliced { target, start, removedCount?, inserted, outcome? }` — the loop's own
 * durable record of ONE inbox mutation (the agent-loop README: "Every inbox mutation commits one
 * normalized agent/inbox/spliced event"). Two jobs are done here, and they are different jobs:
 *
 *   1. THE LEDGER. Every splice — whoever produced it, cancelled or not — is replayed positionally
 *      onto `state.inboxIds`, exactly as the loop's own inbox projection replays it. Without this
 *      the fold cannot answer "which message did that removal take?".
 *   2. OUR ROWS. Only THIS plugin's own messages become history rows: the splice carries the
 *      producer-owned `source.kind`, so a human's prompt, a PAE instruction and a runtime-context
 *      frame are all ignored here (measured 2026-10-18: `target: "next-step"` is what `steer()`
 *      produces). A cancellation (`outcome: 'canceled'`) is resolved through the ledger and flips
 *      the matching row to "canceled" - that is the `POST /dsh-workflow/unsteer` round trip's
 *      durable half.
 */
function foldInboxSpliced(state, event, time) {
  const data = dataOf(event);
  const applied = inboxApplySplice(state.inboxIds, data);
  let next = applied.moved ? { ...state, inboxIds: applied.ledger } : state;

  // A cancellation names an INDEX, not a message: the ledger turns it back into the ids that left.
  // This runs before the insert loop deliberately — a splice that removes and inserts in one call
  // (the loop never does, but the shape allows it) must not cancel a row it just re-inserted.
  if (isRecord(data) && data.outcome === "canceled" && applied.removedIds.length > 0) {
    for (const id of applied.removedIds) next = markInjectCanceled(next, id, time);
  }

  const inserted = data && Array.isArray(data.inserted) ? data.inserted : [];
  for (const message of inserted) {
    if (!isRecord(message)) continue;
    const source = isRecord(message.source) ? message.source : {};
    if (String(source.kind || "") !== SELF_SOURCE_KIND) continue;
    const block = Array.isArray(message.content)
      ? message.content.find((item) => isRecord(item) && item.type === "text" && typeof item.text === "string")
      : null;
    if (!block) continue;
    const row = {
      id: typeof message.id === "string" ? message.id : "",
      at: time,
      target: typeof data.target === "string" ? data.target : "",
      text: text(block.text, TEXT_LIMIT),
      // The splice proves the message reached the inbox, NOT that the turn consumed it. The
      // matching `user/message` (same id) is what proves that; until then this stays false.
      pickedUp: false,
    };
    next = { ...next, asOf: time, injects: [...next.injects.filter((item) => item.id !== row.id), row].slice(-INJECT_LIMIT) };
  }
  return next === state ? state : next;
}

/**
 * "revocable while not yet claimed by the session" - the NON-persistent half (erratum).
 *
 * This branch answers the host's `dispatch.emit("agent/inbox/discarded", { message })`: it carries the message itself,
 * but does NOT enter the session log (the agent-loop README says consumers should use claimed/discarded notices, not rely on
 * the pre-splice session/event view; across 145 real logs the persistent `agent/inbox/discarded` count is 0).
 * The genuinely persistent revoke record is `agent/inbox/spliced { outcome: "canceled" }`, handled by the previous `foldInboxSpliced`
 * ledger path - both paths call `markInjectCanceled`, so whichever shape arrives first the UI shows the same
 * status word, and re-arrival is idempotent (it neither throws nor flips a claimed row back).
 */
function foldInboxDiscarded(state, event, time) {
  const data = dataOf(event);
  const message = data && isRecord(data.message) ? data.message : null;
  if (!message) return state;
  const id = typeof message.id === "string" ? message.id : "";
  if (id === "") return state;
  const source = isRecord(message.source) ? message.source : {};
  if (String(source.kind || "") !== SELF_SOURCE_KIND) return state;
  return markInjectCanceled(state, id, time);
}

/** "session picked it up": the session admitted THIS plugin's injected message (same id) ⇒ pickedUp. */
function markInjectPickedUp(state, messageId, time) {
  if (messageId === "") return state;
  let changed = false;
  const injects = state.injects.map((row) => {
    if (row.id !== messageId || row.pickedUp === true) return row;
    changed = true;
    return { ...row, pickedUp: true, pickedUpAt: time };
  });
  return changed ? { ...state, injects } : state;
}

/**
 * "canceled": the ledger proved this id is the one the loop's splice removed ⇒ the row is
 * cancelled, not picked up. Same row shape as the durable `agent/inbox/discarded` path
 * (`foldInboxDiscarded`) so the panel renders one status word whichever event carried the fact.
 * A row the session already admitted keeps `pickedUp`: a revocation cannot un-read a message.
 */
function markInjectCanceled(state, messageId, time) {
  if (messageId === "" || !Array.isArray(state.injects)) return state;
  let changed = false;
  const injects = state.injects.map((row) => {
    if (row.id !== messageId || row.pickedUp === true || row.canceled === true) return row;
    changed = true;
    return { ...row, canceled: true, canceledAt: time };
  });
  return changed ? { ...state, asOf: time, injects } : state;
}

// ---------------------------------------------------------------------------
// the approval audit pair - which decision is still waiting on a human
// ---------------------------------------------------------------------------

/** How many approval rows are kept. Only an unpaired `asked` matters, so decided rows go first. */
const APPROVAL_LIMIT = 40;

/** Attribute an approval event to a step the same way a node is attributed. */
function approvalStepIndex(state, seq) {
  const step = stepForNode(state, seq ?? null, inProgressStepIndex(state));
  return step ? step.index : null;
}

function foldApprovalAsked(state, event, time, seq) {
  const data = dataOf(event);
  const id = data && typeof data.id === "string" ? data.id : "";
  if (id === "") return state;
  const stepIndex = approvalStepIndex(state, seq);
  if (stepIndex === null) return { ...state, asOf: time };
  const reason = data && typeof data.reason === "string" ? data.reason : "";
  const tool = data && typeof data.toolName === "string" ? data.toolName : "";
  const row = { id, state: "asked", stepIndex, label: text(reason || `等待审批 ${tool}`.trim(), TEXT_LIMIT), at: time };
  // The same id cannot be asked twice (the host's own invariant refuses it), but a replayed
  // log may carry a duplicate: replacing keeps the row count honest either way.
  const approvals = [...state.approvals.filter((item) => item.id !== id), row];
  return { ...state, asOf: time, approvals: trimApprovals(approvals) };
}

function foldApprovalDecided(state, event, time) {
  const data = dataOf(event);
  const id = data && typeof data.id === "string" ? data.id : "";
  if (id === "") return state;
  const open = state.approvals.some((item) => item.id === id && item.state === "asked");
  if (!open) return { ...state, asOf: time };
  const outcome = data && typeof data.outcome === "string" ? data.outcome : "";
  const approvals = state.approvals.map((item) =>
    item.id === id ? { ...item, state: "decided", outcome, decidedAt: time } : item,
  );
  // A rejected / cancelled decision is NOT a resolved one for our purpose: the step is still
  // waiting on the human (the host would re-ask on the next call). Only a grant closes it, and
  // that is expressed by REMOVING the row entirely — the pair is then complete.
  const granted = outcome === "allowed-once";
  const kept = granted ? approvals.filter((item) => item.id !== id) : approvals;
  return { ...state, asOf: time, approvals: trimApprovals(kept) };
}

function trimApprovals(rows) {
  if (rows.length <= APPROVAL_LIMIT) return rows;
  const decided = rows.filter((row) => row.state === "decided");
  const asked = rows.filter((row) => row.state !== "decided");
  const keep = APPROVAL_LIMIT - asked.length;
  return [...(keep > 0 ? decided.slice(Math.max(0, decided.length - keep)) : []), ...asked];
}

/**
 * Settle a question / approval node when its own tool result arrives. A node whose call was
 * answered is no longer needs-confirmation; a node whose result is the PENDING notice (dsh-tool-ask-user's
 * timeout) stays open, because the user can still answer later.
 */
function settleConfirmNode(state, callId, body, time) {
  if (callId === "") return state;
  const index = state.nodes.findIndex((node) => node.kind === "question" && node.callId === callId);
  if (index < 0) return state;
  const answered = !/pending|timeout|no answer batch/i.test(body);
  if (!answered) return state;
  const nodes = state.nodes.map((node, at) => (at === index ? { ...node, answered: true } : node));
  return { ...state, asOf: time, nodes };
}

// ---------------------------------------------------------------------------
// node bookkeeping (append, cap, group, active)
// ---------------------------------------------------------------------------

/**
 * Append one node, enforcing both caps and attributing it to a plan step.
 * Attribution (step file §3): the PAE anchor range wins; otherwise the in_progress todo
 * row's step; otherwise the running step. A node that predates every anchor of an anchored
 * plan belongs to no step — it is dropped rather than guessed into one.
 */
function appendNode(state, node, time) {
  const step = stepForNode(state, node.seq ?? null, inProgressStepIndex(state));
  if (!step) {
    if (state.steps.length === 0) {
      // No plan yet (the planning phase of an ordinary session): the nodes are still worth
      // showing, so they open one synthetic step. It is NOT a plan step and says so.
      const only = newStep(0, PLANNING_TITLE, time, "todo");
      return appendNode({ ...state, steps: [only] }, node, time);
    }
    // An anchored plan exists and this event precedes its first anchor: no step owns it.
    return { ...state, asOf: time };
  }

  const nodes = [...state.nodes];
  node.id = `n${state.nextNodeId}`;
  // `stepKey` (not `stepIndex`) is the node's identity: the todo-sync re-orders rows on every
  // `todo/write`, so an index would follow whatever row moved into that slot.
  node.stepKey = step.stepKey || normalizeTitle(step.title);
  node.stepIndex = step.index;
  node.key = node.key || node.tool || node.kind;
  nodes.push(node);

  let truncatedTotal = state.truncated.totalNodes;
  let steps = state.steps;
  if (nodes.length > NODES_TOTAL) {
    // FAIR EVICTION, not oldest-first. Dropping the OLDEST nodes deleted exactly the
    // finished steps' work, so their cards read "0 tools 0 files" while a long-running step kept
    // everything. The global cap now removes nodes from the step with the MOST nodes (oldest first
    // inside that step), so the cap still bounds the state but no step is emptied.
    let drop = nodes.length - NODES_TOTAL;
    truncatedTotal += drop;
    const byStep = new Map();
    for (const item of nodes) {
      if (!byStep.has(item.stepIndex)) byStep.set(item.stepIndex, []);
      byStep.get(item.stepIndex).push(item);
    }
    const evicted = new Set();
    const aliveCount = new Map();
    for (const [index, list] of byStep) aliveCount.set(index, list.length);
    while (drop > 0) {
      let fattest = null;
      let fatSize = 0;
      for (const [index, size] of aliveCount) {
        if (size > fatSize) {
          fatSize = size;
          fattest = index;
        }
      }
      if (fattest === null) break;
      const list = byStep.get(fattest);
      const victim = list.find((item) => !evicted.has(item.id));
      if (!victim) break;
      evicted.add(victim.id);
      aliveCount.set(fattest, fatSize - 1);
      drop -= 1;
    }
    if (evicted.size > 0) {
      const keptNodes = nodes.filter((item) => !evicted.has(item.id));
      nodes.length = 0;
      nodes.push(...keptNodes);
    }
    const kept = new Set(nodes.map((item) => item.id));
    steps = steps.map((row) => ({ ...row, nodeIds: row.nodeIds.filter((id) => kept.has(id)) }));
  }

  // Per-step cap: head + tail kept (the first calls say what the step IS, the last ones say
  // how it ended), the middle dropped and counted so the UI can say "N nodes hidden".
  const row = steps[step.index];
  const allIds = [...row.nodeIds, node.id];
  let nodeIds = allIds;
  let truncatedNodes = row.truncatedNodes;
  let newlyTruncated = 0;
  if (allIds.length > NODES_PER_STEP) {
    const head = allIds.slice(0, Math.floor(NODES_PER_STEP / 2));
    const tail = allIds.slice(allIds.length - Math.ceil(NODES_PER_STEP / 2));
    nodeIds = [...head, ...tail];
    const nextTruncated = row.nodeCount + 1 - nodeIds.length;
    newlyTruncated = Math.max(0, nextTruncated - truncatedNodes);
    truncatedNodes = nextTruncated;
  }
  steps = steps.map((item) =>
    item.index === step.index ? { ...item, nodeIds, nodeCount: row.nodeCount + 1, truncatedNodes } : item,
  );

  const truncated = {
    totalNodes: truncatedTotal,
    stepNodes: state.truncated.stepNodes + newlyTruncated,
  };
  const next = { ...state, asOf: time, nodes, steps, truncated, nextNodeId: state.nextNodeId + 1 };
  return withActive(next, node.id, time);
}

/** Index of the step that matches the FIRST in_progress todo row, or null. */
function inProgressStepIndex(state) {
  const row = state.todos.find((item) => item.status === "in_progress" && item.content !== "");
  if (!row) return null;
  const step = state.steps.find((item) => normalizeTitle(item.title) === normalizeTitle(row.content));
  return step ? step.index : null;
}

/** Set the active pointer (which step/node the "current activity" highlight follows). */
function withActive(state, nodeId, time) {
  const step = runningStep(state) ?? state.steps[state.steps.length - 1] ?? null;
  const active = step ? { stepIndex: step.index, nodeId: nodeId === undefined ? null : nodeId } : null;
  const asOf = isFiniteNumber(time) && time > 0 ? time : state.asOf;
  return { ...state, asOf, active };
}

/**
 * Fold consecutive same-key nodes into a group record. The nodes stay in `state.nodes`
 * (the UI expands a group into them); the group is a summary row only.
 */
function withGroups(state) {
  const steps = state.steps.map((step) => {
    const nodes = state.nodes.filter((node) => node.stepIndex === step.index);
    const groups = [];
    let run = null;
    for (const node of nodes) {
      const key = node.key || node.tool || node.kind;
      if (run && run.key === key) {
        run.count += 1;
        run.lastId = node.id;
        run.lastAt = node.at;
      } else {
        if (run && run.count >= GROUP_THRESHOLD) groups.push({ ...run });
        run = { key, tool: node.tool, firstId: node.id, lastId: node.id, count: 1, firstAt: node.at, lastAt: node.at };
      }
    }
    if (run && run.count >= GROUP_THRESHOLD) groups.push({ ...run });
    return { ...step, groups };
  });
  return { ...state, steps };
}

// ---------------------------------------------------------------------------
// the fold entry point
// ---------------------------------------------------------------------------

/**
 * Fold one event into the state. Pure, reference-preserving for unrelated events, and
 * idempotent for a repeated event (guarded by the event's seq).
 *
 * @param {object} state - the state to fold into (never mutated).
 * @param {object} event - one session event.
 * @returns {object} the next state (the same reference when nothing applied).
 */
export function foldEvent(state, event) {
  const base = isRecord(state) ? state : createInitialState();
  if (!isObject(event)) return base;
  const type = typeof event.type === "string" ? event.type : null;
  if (type === null || !isRelated(type)) return base;

  const seq = eventSeq(event);
  // Idempotence: the same event delivered twice must not double-append. The first event
  // of a log is the `session` header, which is not in RELATED, so seq is usable here.
  if (seq !== null && base.seq !== null && seq <= base.seq) return base;

  const time = eventTime(event);
  const folded = foldOne(base, type, event, time, seq);
  if (folded === base && seq === null) return base;
  // ONE convergence point for "exactly one running step". Running it here (not inside
  // foldTodos) is deliberate: a stale synthetic row can survive any event type, and the batch
  // paths (the host's one-shot replay of a whole log) then get the same invariant for free.
  // `soleRunning` is a no-op when at most one row is running, so the reference — and with it
  // the whole idempotence contract — is preserved for ordinary events.
  // Order matters: the todo-sync runs FIRST (it decides which rows exist and how many nodes each
  // owns), then the single-running convergence. Both are idempotent, so an event that changes
  // neither returns the previous reference and the idempotence contract is untouched.
  const next = soleRunning(syncToTodos(folded), time);
  return next === base ? base : { ...next, seq: seq === null ? next.seq : seq };
}

function foldOne(state, type, event, time, seq) {
  switch (type) {
    case TYPE_TODOS:
      return withPercents(foldTodos(state, event, time), time);
    case TYPE_TOOL_CALL:
      return foldToolCall(state, event, time, seq);
    case TYPE_TOOL_RESULT:
      return foldToolResult(state, event, time, seq);
    case TYPE_STEP_START:
      return foldStepStart(state, event, time, seq);
    case TYPE_STEP_END:
      return foldStepEnd(state, event, time);
    case TYPE_ASSISTANT:
      return foldAssistant(state, event, time, seq);
    case TYPE_USER:
      return foldUser(state, event, time, seq);
    case TYPE_TURN_START:
      return foldTurnStart(state, event, time);
    case TYPE_TURN_END:
      return foldTurnEnd(state, event, time);
    case TYPE_REPORT:
      return foldReport(state, event, time);
    case TYPE_SUBAGENT_START:
      return foldSubagent(state, event, time, seq, "start");
    case TYPE_SUBAGENT_END:
      return foldSubagent(state, event, time, seq, "end");
    case TYPE_WORKFLOW:
    case TYPE_WORKFLOW_START:
    case TYPE_WORKFLOW_PHASE:
    case TYPE_WORKFLOW_END:
      return foldWorkflowBus(state, type, event, time, seq);
    case TYPE_TW_RUN_START:
    case TYPE_TW_RUN_END:
    case TYPE_TW_AGENT_START:
    case TYPE_TW_AGENT_END:
      return foldWorkflowRun(state, type, event, time, seq);
    case TYPE_JOB_REGISTERED:
      return foldJob(state, event, time, seq, false);
    case TYPE_JOB_SETTLED:
      return foldJob(state, event, time, seq, true);
    case TYPE_USER_QUESTIONS:
      return foldQuestion(state, event, time, seq);
    case TYPE_APPROVAL:
      return foldApproval(state, event, time, seq);
    case TYPE_INBOX_SPLICED:
      return foldInboxSpliced(state, event, time);
    case TYPE_INBOX_DISCARDED:
      return foldInboxDiscarded(state, event, time);
    case TYPE_APPROVAL_ASKED:
      return foldApprovalAsked(state, event, time, seq);
    case TYPE_APPROVAL_DECIDED:
      return foldApprovalDecided(state, event, time);
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// view
// ---------------------------------------------------------------------------

/** Node as the client sees it (bounded, lossless JSON). */
function nodeView(node) {
  return {
    id: node.id,
    stepIndex: node.stepIndex,
    kind: node.kind,
    tool: node.tool,
    title: node.title,
    detail: node.detail,
    argsText: node.argsText,
    files: node.files.map((file) => ({ path: file.path, action: file.action })),
    resultHead: node.resultHead,
    error: node.error,
    // the boolean the browser half colours by; see newNode.settled
    result: node.settled === true,
    at: node.at,
    durationMs: node.durationMs,
    // the detail's meta line names the event that produced the node. Null for the
    // synthetic nodes (a message without a seq), never invented.
    seq: node.seq === null || node.seq === undefined ? null : node.seq,
  };
}

/** Step as the client sees it. */
function stepView(step, state, now) {
  return {
    index: step.index,
    planIndex: step.planIndex ?? null,
    title: step.title,
    status: step.status,
    source: step.source,
    outcome: step.outcome ?? "",
    startedAt: step.startedAt,
    endedAt: step.endedAt,
    lastActivityAt: step.lastActivityAt ?? 0,
    modelStep: step.modelStep ?? null,
    anchorSeq: step.anchorSeq ?? null,
    percent: step.percent,
    // when the LAST number arrived (0 = never). Lets the rail show how stale the
    // estimate it is quoting actually is, without reading a clock anywhere.
    lastEstimateAt: step.lastEstimateAt ?? 0,
    percentSource: step.percentSource,
    maxPercent: step.maxPercent,
    reportSummary: step.reportSummary,
    nodeCount: step.nodeCount,
    nodeIds: [...step.nodeIds],
    truncatedNodes: step.truncatedNodes,
    groups: step.groups.map((group) => ({ ...group })),
    // derived in buildView: a step that is waiting on a human right now. The plan's own
    // `requiresConfirmation` is merged by the host (lib/index.js); this adds the LOG-derived
    // half — an open approval or an unanswered question belonging to this step.
    pendingConfirm: Array.isArray(step.pendingConfirm) ? step.pendingConfirm.slice() : [],
  };
}

/**
 * The wire view. Everything the client draws comes from here; nothing else is published.
 * Built at a caller-supplied `now` (the host passes `state.asOf`), so no clock read.
 */
/** One activity row of a branch lane, as the client sees it. */
function branchNodeView(node) {
  return {
    id: node.id,
    kind: node.kind,
    tool: node.tool || "",
    title: node.title,
    detail: node.detail || "",
    at: node.at,
    status: node.status,
    key: node.key || "",
  };
}

/** Branch lane as the client sees it (bounded text, lossless JSON). */
function branchView(branch) {
  return {
    id: branch.id,
    kind: branch.kind,
    label: branch.label,
    status: branch.status,
    startedAt: branch.startedAt,
    endedAt: branch.endedAt,
    stepIndex: branch.stepIndex,
    // Identity of the thing that opened the lane: the launcher's callId, the child's run id
    // and the job id. Short strings, and the only way a reader (or a checker) can tie a lane
    // back to the raw event that produced it.
    callId: branch.callId,
    runId: branch.runId,
    jobId: branch.jobId,
    count: branch.count,
    nodes: branch.nodes.map(branchNodeView),
    truncated: Math.max(0, branch.count - branch.nodes.length),
  };
}

// ---------------------------------------------------------------------------
// "strict sync with the conversation page" and needs-confirmation - both derived from the log
// ---------------------------------------------------------------------------
/**
 * "strict sync with the conversation page" - the todo table is the ONE published step list.
 *
 * Why this exists: the fold ADDS a step row the first time a `todo/write` carries it, and never
 * removes it. That is right for history but wrong for the panel, which must match what the
 * conversation's task list says RIGHT NOW. Measured on 129 real logs: 97 sessions ended with
 * rows that no longer appear in the latest table (re-plans and abandoned lists), so the map
 * showed extra "done/pending" steps the user had already replaced. Keeping historical rows also
 * inflated the header's denominator.
 *
 * Rules (all of them are facts, none is a guess):
 *   • a row the latest table still names — keep, whatever its status;
 *   • a lone synthetic planning row (planIndex undefined, title planning & research) — keep only while
 *     nothing else exists, i.e. the true planning phase;
 *   • everything else — drop. A PAE row is NOT protected: PAE rewrites the whole table after
 *     every step, so a row it no longer lists is not part of the plan any more.
 * Nodes of a dropped row go with it (a step nobody lists cannot own work), and `active` is
 * re-pointed at the surviving running row so no highlight ever dangles.
 */
function syncToTodos(state) {
  if (state.todos.length === 0) return state;
  // The todo table's OWN order is the order the conversation shows. Build the target list from
  // it, then pull each step record out of the fold's history by title. A row the fold has never
  // seen becomes a fresh pending row (the next `todo/write` will fill it in), which is exactly
  // what the conversation shows at that moment.
  const wanted = [];
  const seen = new Set();
  for (const item of state.todos) {
    if (item.content === "") continue;
    const title = text(stripOrdinal(item.content), TITLE_LIMIT);
    const key = normalizeTitle(item.content);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    // `planIndex` MUST be parsed from the RAW content, not from `title`: `stripOrdinal`
    // already removed the "3." prefix, so `planIndexOf(title)` always returned null and every
    // created row lost its ordinal. Measured 2026-10-29 on session 164e339f: a 14-row numbered
    // table produced rows whose planIndex fell back to POSITION, so row 9 ("9. n8n 主工作流…")
    // was stamped planIndex 2 and `applyPlanToView` then rewrote it with plan step 2's title and
    // status — the map showed steps 3–7 twice and the wrong step as running.
    wanted.push({ key, title, status: item.status, planIndex: planIndexOf(item.content) });
  }
  if (wanted.length === 0) return state;
  // The row's status is the ONE statement of a step's lifecycle: `todo/write` replaces the whole
  // table every time, so a matched row must not inherit the status of whatever record the matcher
  // bound it to. Without this pass a row the model has not started kept the `done` of an old record
  // (a card at 100 % next to an empty todo), while an `in_progress` row showed as `pending` because
  // the record it landed on was still pending — both seen in one session on 2026-10-30.
  const rowStatus = (step, row) => {
    if (row.status === "completed") return step.status === STEP_STATUS.done ? step : closeStep(step, state.asOf || 0);
    // A closed record cannot speak for an open row. When the table takes a row back to
    // in_progress/pending, the record it is bound to may be a step this table already closed,
    // or an older row a reworded title landed on. Keeping that percent and high-water renders
    // a brand-new first row at 100 % the instant it appears.
    const reopened = step.status === STEP_STATUS.done || step.status === STEP_STATUS.failed;
    const carried = reopened
      ? { percent: null, percentSource: "none", maxPercent: 0 }
      : { percent: step.percent, percentSource: step.percentSource, maxPercent: step.maxPercent };
    if (row.status === "in_progress") {
      return {
        ...step,
        ...carried,
        status: STEP_STATUS.running,
        endedAt: null,
        startedAt: reopened || !step.startedAt ? state.asOf || 0 : step.startedAt,
      };
    }
    return { ...step, ...carried, status: STEP_STATUS.pending, endedAt: null, startedAt: 0, percent: null, percentSource: "none" };
  };

  const byKey = new Map();
  for (const step of state.steps) {
    const key = normalizeTitle(step.title);
    if (key !== "" && !byKey.has(key)) byKey.set(key, step);
  }
  // REWORDED ROWS. The model rewrites its own todo text between `todo/write` events
  // (measured on this session: "read-only inventory: read plugin sources..." became "read-only inventory: sources/config..."), and the
  // fold had already created a row for the old wording. Without a second pass those old rows stay
  // behind as orphans AND the new row starts with no nodes — which is exactly why "only the running
  // step shows tool types". A reworded row is matched by the longest shared prefix of its
  // normalised title (≥ REWORD_PREFIX_MIN characters) among the steps nothing else claimed.
  // A row is "claimed" when the CURRENT table names it verbatim. `claimed` must be built from the
  // wanted keys, NOT by looking the row back up in `byKey`: `byKey` is keyed BY those same rows, so
  // that reverse lookup marked every row as claimed, left `orphans` permanently empty, and made the
  // reworded-row branch below unreachable — its nodes were then dropped as orphans.
  const wantedKeys = new Set(wanted.map((row) => row.key));
  const claimed = new Set();
  for (const step of state.steps) if (wantedKeys.has(normalizeTitle(step.title))) claimed.add(step.index);
  const orphans = state.steps.filter((step) => !claimed.has(step.index));
  const used = new Set();
  // old row key -> new row key, for every row this pass reworded. The node remap below
  // walks through it, so a reworded row keeps its ledger instead of dropping it.
  const reworded = new Map();
  // Each entry remembers WHICH old row it came from (`from`), because the reworded case returns a
  // NEW object with a new title: comparing objects with indexOf later would then fail to find the
  // old row and drop its nodes (that bug emptied every finished step's node list).
  const ordered = [];
  const origins = [];
  for (const row of wanted) {
    const exact = byKey.get(row.key);
    if (exact) {
      ordered.push(exact);
      origins.push(exact.index);
      continue;
    }
    // REWORD DETECTION, two signals in priority order.
    //
    // (1) POSITIONAL STATE MATCH. The todo table is an ordered list and the model rewrites its text
    //     in place: same slot, same lifecycle status, different wording. Measured on this session,
    //     real reworded pairs share as little as 5 of 8 normalised characters, so a text-only
    //     threshold either misses them (nodes lost) or glues unrelated rows together. Slot + status
    //     is the signal that actually holds.
    // (2) TEXT SHARE as the fallback for a re-numbered or re-ordered table.
    let candidate = null;
    const slot = wanted.indexOf(row);
    // An explicit ordinal OUTRANKS position. A numbered table states which plan step each row
    // IS; letting the slot win anyway pairs row 9 with whatever orphan happens to sit at
    // position 8, and the row inherits that orphan's planIndex. Measured 2026-10-29 on session
    // 164e339f: after a 7-row unnumbered table was replaced by a 14-row numbered one, row 9
    // took the leftover row 2 and the map rendered plan steps 3-7 twice.
    const ordinalConflict = (step) =>
      row.planIndex !== null && Number.isInteger(step.planIndex) && step.planIndex !== row.planIndex;
    const sameSlot = orphans.find(
      (step) => !used.has(step.index) && step.index === slot && !ordinalConflict(step),
    );
    if (sameSlot && (sameSlot.status === row.status || sameSlot.status === STEP_STATUS.running)) {
      candidate = sameSlot;
    }
    if (candidate === null && row.planIndex !== null) {
      const byOrdinal = orphans.find(
        (step) => !used.has(step.index) && Number.isInteger(step.planIndex) && step.planIndex === row.planIndex,
      );
      if (byOrdinal) candidate = byOrdinal;
    }
    if (candidate === null) {
      let bestShare = 0;
      for (const step of orphans) {
        if (used.has(step.index)) continue;
        if (ordinalConflict(step)) continue;
        const other = normalizeTitle(step.title);
        const score = commonPrefix(other, row.key);
        if (score < REWORD_PREFIX_MIN) continue;
        const shorter = Math.min(other.length, row.key.length);
        const share = shorter === 0 ? 0 : score / shorter;
        if (share > bestShare) {
          bestShare = share;
          candidate = step;
        }
      }
      if (bestShare < REWORD_SHARE_MIN) candidate = null;
    }
    if (candidate !== null) {
      used.add(candidate.index);
      // When a title is reworded the row identity (stepKey) follows, and every node already attached to that row is migrated.
      // This is the real root cause of "a finished step shows 0 tools": the nodes' stepKey stayed at the old title, while the new row key was the
      // reworded title - the two did not match, so the nodes were dropped as orphans in the view.
      const oldKey = candidate.stepKey || normalizeTitle(candidate.title);
      const newKey = normalizeTitle(row.title);
      const nextStep = rowStatus({ ...candidate, title: text(row.title, TITLE_LIMIT), stepKey: newKey }, row);
      reworded.set(oldKey, newKey);
      ordered.push(nextStep);
      origins.push(candidate.index);
      continue;
    }
    // No candidate: this is a genuinely new row.
    const created = newStep(ordered.length, row.title, 0, "todo");
    // the row's STABLE key, the SAME expression appendNode uses
    // (`normalizeTitle(step.title)`). Without it a created row has no key, so neither the
    // node-remap nor the node attribution can ever find it.
    created.stepKey = row.key;
    created.startedAt = 0;
    created.planIndex = row.planIndex ?? undefined;
    Object.assign(created, rowStatus(created, row));
    ordered.push(created);
    origins.push(-1);
  }
  // A node follows its ROW, identified by the row's stable key — not by a position and not by
  // object identity (the reworded case builds a new object). Rows the table no longer names are
  // gone, and their nodes go with them.
  const steps = reindex(ordered);
  const newIndexByKey = new Map();
  for (const step of steps) {
    const key = step.stepKey || normalizeTitle(step.title);
    if (key !== "" && !newIndexByKey.has(key)) newIndexByKey.set(key, step.index);
  }
  // Old key -> current index, for rows foldTodos renamed in place (`step.prevKey`). Used below when
  // a node still carries the pre-rename key.
  const prevKeyIndex = new Map();
  for (const step of steps) {
    const aliases = Array.isArray(step.aliasKeys) ? step.aliasKeys : [];
    for (const alias of aliases) {
      const prev = normalizeTitle(typeof alias === "string" ? alias : "");
      if (prev !== "") prevKeyIndex.set(prev, step.index);
    }
    const prev = normalizeTitle(typeof step.prevKey === "string" ? step.prevKey : "");
    if (prev !== "") prevKeyIndex.set(prev, step.index);
  }
  const sameOrder = ordered.every((step, at) => step.index === at && origins[at] === at);
  // Rows this pass let go: old indices no surviving row claims. A kept row (exact or reworded)
  // carries its old index in `origins`, a created row carries -1, so the unclaimed old indices
  // are exactly the dropped set — the identity fast path below needs it to know the row set is
  // unchanged.
  const keptOld = new Set(origins.filter((from) => from >= 0));
  const dropped = new Set(state.steps.filter((step) => !keptOld.has(step.index)));
  // Old position -> new position, for nodes that carry no `stepKey`.
  const movedByIndex = new Map();
  origins.forEach((from, at) => {
    if (from >= 0) movedByIndex.set(from, at);
  });
  const nodes = state.nodes
    .map((node) => {
      const raw = node.stepKey || null;
      if (raw === null || raw === "") {
        // A node folded before `stepKey` existed (or by a path that did not set one) keeps its old
        // POSITION, so it must be remapped by that position — leaving it untouched would make it
        // point at whatever row now sits at that index.
        const at = movedByIndex.get(node.stepIndex);
        if (at === undefined) return null;
        return at === node.stepIndex ? node : { ...node, stepIndex: at };
      }
      // A reworded row renamed its key: follow the rename before looking the index up, and keep
      // the node's own stepKey in sync so the NEXT pass does not have to re-derive it.
      const key = reworded.get(raw) || raw;
      const at = newIndexByKey.get(key);
      if (at === undefined) {
        // foldTodos renames a row in place (title + stepKey) and parks the old key in
        // `step.prevKey`. A node still carrying that old key belongs to the renamed row — this is
        // the path that keeps a finished step's tool/file types after the model rewrites its text.
        const renamed = prevKeyIndex.get(raw);
        if (renamed === undefined) return null;
        return { ...node, stepIndex: renamed, stepKey: normalizeTitle(steps[renamed].title) };
      }
      if (node.stepIndex === at && node.stepKey === key) return node;
      return { ...node, stepIndex: at, stepKey: key };
    })
    .filter((node) => node !== null);
  if (sameOrder && dropped.size === 0 && nodes.length === state.nodes.length && ordered.length === state.steps.length) {
    return state;
  }
  const oldActiveKey = state.active
    ? (state.steps[state.active.stepIndex] &&
        (state.steps[state.active.stepIndex].stepKey || normalizeTitle(state.steps[state.active.stepIndex].title))) ||
      null
    : null;
  const activeNew = oldActiveKey === null ? undefined : newIndexByKey.get(oldActiveKey);
  const active =
    activeNew === undefined
      ? (() => {
          const running = runningStep({ steps });
          return running ? { stepIndex: running.index, nodeId: null } : null;
        })()
      : { stepIndex: activeNew, nodeId: state.active.nodeId };
  return { ...state, steps, nodes, active };
}

/**
 * `{ stepIndex: [{ kind, label, at }] }` for every step that is waiting on a human.
 *
 * The three MEASURED sources, in order:
 *   1. `approval/asked` with no `approval/decided` for the same id — dsh-user-approval appends
 *      the pair inside one turn (its invariant.js refuses a lone `decided`), so an ask with
 *      nothing after it is a decision still open at the end of the log.
 *   2. a `question` node whose `ask_user_question` call never produced an answer — its
 *      `tool/result` records the pending notice instead of an answer batch
 *      (dsh-tool-ask-user's `pendingNotice`).
 *   3. an `approval` node whose tool result never arrived.
 *
 * A node whose call was answered settles; a node with no call at all (the `approval/request`
 * bus shape, which a recorded log never carries) stays open until the log ends.
 */
function pendingConfirmSteps(state) {
  const out = Object.create(null);
  const add = (index, row) => {
    if (!Number.isInteger(index) || index < 0) return;
    if (!out[index]) out[index] = [];
    out[index].push(row);
  };

  // 1. open approvals from the audit pair, by the approval's own step attribution.
  const asked = new Map();
  if (Array.isArray(state.approvals)) {
    for (const row of state.approvals) {
      if (!isRecord(row)) continue;
      // Corrects an implementation that contradicted its own comment. `foldApprovalDecided` keeps rejected/cancelled rows in approvals
      // marked state:'decided' (only an actual allowed-once removes the row), because "rejected" is still
      // a decision the user has to handle - the host will ask again. The old code treated any 'decided' as finished, so
      // a rejected approval stopped showing needs-confirmation. Now: asked and "decided but not allowed" both count as unresolved.
      if (row.state === "asked") asked.set(row.id, row);
      else if (row.state === "decided" && row.outcome !== "allowed-once") asked.set(row.id, row);
      else if (row.state === "decided") asked.delete(row.id);
    }
  }
  for (const row of asked.values()) add(row.stepIndex, { kind: "approval", label: row.label, at: row.at });
  // 2./3. question / approval nodes with no settling tool result.
  if (Array.isArray(state.nodes)) {
    for (const node of state.nodes) {
      if (node.kind !== "question" && node.kind !== "approval") continue;
      // An answered question is no longer waiting on anyone.
      if (node.answered === true) continue;
      add(node.stepIndex, { kind: node.kind, label: node.title, at: node.at });
    }
  }
  return out;
}

export function buildView(state, nowMs) {
  const source = isRecord(state) ? state : createInitialState();
  const now = isFiniteNumber(nowMs) && nowMs > 0 ? nowMs : source.asOf;
  // the view is built from the step list the CONVERSATION currently shows: syncToTodos
  // drops rows the latest todo table no longer names (measured: 97 of 129 real logs carried such
  // rows), so the map can no longer display steps the task list has already replaced.
  const live = withPercents(withGroups(soleRunning(syncToTodos(source), now)), now);
  const steps = live.steps.map((step) => stepView(step, live, now));
  const nodeIds = new Set();
  for (const step of steps) for (const id of step.nodeIds) nodeIds.add(id);
  const nodes = live.nodes.filter((node) => nodeIds.has(node.id)).map(nodeView);
  const active = live.active;
  const activeStep = active && steps[active.stepIndex] ? steps[active.stepIndex] : null;
  const activeNode = active && active.nodeId ? nodes.find((node) => node.id === active.nodeId) : null;

  // NEEDS-CONFIRMATION. Two halves, both derived, neither guessed:
  //   1. the session's own shapes — an `approval/asked` without its `approval/decided`, and a
  //      `question` / `approval` node with no later outcome in the same step (the tool result
  //      that settles it). Both are MEASURED log facts (dsh-user-approval appends the pair;
  //      dsh-tool-ask-user records the pending result).
  //   2. the PAE plan's own `requiresConfirmation` — merged onto `step.pendingConfirm` by
  //      the host half (lib/index.js), exactly like the status merge.
  // A step that is DONE never carries the flag: a decision a finished step was waiting on
  // is history, not a request.
  const decided = pendingConfirmSteps(live);
  for (const step of steps) {
    if (step.status === STEP_STATUS.done || step.status === STEP_STATUS.failed) continue;
    const rows = decided[step.index];
    if (Array.isArray(rows) && rows.length > 0) step.pendingConfirm = rows;
  }



  return {
    ver: SCHEMA_VERSION,
    task: source.task,
    todos: source.todos.map((item) => ({ content: item.content, status: item.status })),
    steps,
    nodes,
    // Branch lanes are NOT part of `nodes`: the main flow's node count, its same-tool
    // groups and both caps ignore them, and only a lane's own status dot breathes
    // (§4: branches never compete for the “current activity” highlight).
    branches: live.branches.map(branchView),
    active: activeStep ? { stepIndex: activeStep.index, nodeId: activeNode ? activeNode.id : null } : null,
    activeNode: activeNode ? nodeView(activeNode) : null,
    asOf: live.asOf,
    // is the session working right now? `turn/start` opened a turn and nothing closed
    // it. The browser half pauses every animation when this is false; the step rows cannot
    // answer it (PAE leaves them 'running' after the turn ends).
    running: live.turnActive === true,
    truncated: { ...live.truncated },
    // the hot-inject history: what THIS plugin's /steer channel put into the session, and
    // whether the session has admitted each one. The browser half renders it under the composer.
    injects: source.injects.map((row) => ({ ...row })),
    counts: {
      steps: steps.length,
      nodes: nodes.length,
      running: steps.filter((step) => step.status === STEP_STATUS.running).length,
      completed: steps.filter((step) => step.status === STEP_STATUS.done).length,
    },
  };
}
