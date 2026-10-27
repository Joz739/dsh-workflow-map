/**
 * dsh-workflow-map — host half, registration (step-02) + PAE plan section (step-03).
 *
 * ONE registration: the session projection `workflowView`. It folds the session's own event
 * log into 「分步列表 + 每步的流程节点 + 当前进行中的分步/节点 + 每步百分比」 and publishes
 * that as a wire view the browser half can read.
 *
 * WHY A PROJECTION AND NOT A SERVICE OF OUR OWN: the projection registry is the one host
 * surface that (a) already replays the full session log into every plugin that asked for it,
 * (b) survives a cold session read (its state is persisted and restored), and (c) carries a
 * `wire` block, which is the only channel a client-visible snapshot reads. Building any of
 * that ourselves would be a second, worse copy of a solved problem.
 *
 * THE FOLD IS NOT HERE. It lives in ../src/fold.mjs and is imported, never copied: the same
 * object the offline self-test drives (tools/selftest-fold.mjs), so "tested" and "shipped"
 * cannot drift. This file adds registration and the two schemas — no clock read, no network,
 * and no filesystem call of its own: the one file this plugin reads (the PAE plan) is opened by
 * ../src/orchestrator.mjs through a per-session reader created in init() and used on the wire.
 * ORDERING: apply() does exactly two registration-only things — register the projection, then
 * attach the HTTP view route (step-04) — and touches neither the clock nor a session. The PAE
 * plan is read inside the WIRE VIEW, never in apply: a broken or slow plan file may degrade the
 * view, but it can never stop the fold or the route.
 */

import {
  SCHEMA_VERSION,
  STATE_VERSION,
  buildView,
  createInitialState,
  foldEvent,
} from "../src/fold.mjs";

import { createPlanReader, PLAN_VERSION } from "../src/orchestrator.mjs";
import { STATE_PATH, STEER_PATH, UNSTEER_PATH, composeView, registerViewRoute } from "../src/route.js";
import { randomUUID } from "node:crypto";

/** Plugin row id — must equal the `id` this bundle's patch inserts. */
export const name = "workflow-map";

/** Package name, kept as data so the shape self-test can compare it to the patch row. */
export const packageName = "dsh-workflow-map";

/** Projection key — also the key the browser half will pass to `useProjection(...)`. */
export const PROJECTION_KEY = "workflowView";

/**
 * Host services this row needs: the projection registry the registration below lands in, the
 * session store and the web server the view route is attached to (step-04), and — from the
 * hot-inject step — the AGENT REGISTRY the steer channel addresses.
 *
 * Cordis only calls apply() once they all resolve, so a host with no web server does not mount
 * this row at all. That is the honest failure mode for a WEB panel: without an HTTP surface the
 * browser half has nothing to read. The route still resolves its server defensively
 * (`ctx.get("webServer") ?? ctx.get("httpServer")`) and refuses quietly rather than throwing.
 *
 * WHY `agents` IS SAFE TO REQUIRE. Every host that can run a session has it: the agent registry
 * is what `@deepseek-ai/dsh-agent-loop` registers into, and a session only exists because a
 * loop drove one. The steer endpoint degrades per-request (503) if the service is somehow absent
 * at call time, so a future host without agents still mounts the panel and only loses the button.
 */
export const inject = ["sessionProjections", "sessions", "webServer", "agents"];

// ---------------------------------------------------------------------------
// small type helpers (src/fold.mjs keeps its own — nothing is re-exported from it)
// ---------------------------------------------------------------------------

const isObject = (value) => value !== null && typeof value === "object";
const isRecord = (value) => isObject(value) && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

/** Safe value rendering for error messages (a throw here would mask the real problem). */
function show(value) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// schemas — hand-written `.parse` implementations, deliberately
// ---------------------------------------------------------------------------
//
// The registry only ever calls `.parse(value)` on these two objects, so that single method is
// the whole contract to satisfy. No zod/schemastery import: this package is installed as a
// `link:` (its real path lies outside the profile's node_modules tree), so a bare specifier is
// not guaranteed to resolve, and two structural checks are not worth a dependency.
//
// The two schemas fail in OPPOSITE directions, on purpose:
//   * viewSchema  guards a view this file just built from this file's own module. A mismatch
//                 is OUR bug, so it must be loud — it is the tripwire that keeps the wire
//                 contract honest for the browser half and for step-11's drill-down.
//   * stateSchema guards a row read back FROM DISK (a checkpoint restore or a cold read). A
//                 throw there would abort the cold read of the whole session, so a damaged or
//                 older row degrades to a repaired (worst case: clean) state instead: losing
//                 our view is acceptable, losing the session is not.
//
// Neither schema validates text CONTENT (titles, node details): those are bounded by the fold
// and are display-only. Validating them here would double the per-event cost for no safety.

const STEP_STATUSES = new Set(["pending", "running", "done", "failed"]);

function badView(what, actual) {
  throw new Error(`workflowView view: ${what}; got ${show(actual)}`);
}

/**
 * Validate the `plan` section (null when this session has no PAE plan). This block is written
 * by ../src/orchestrator.mjs and is the ONE part of the view this file does not build itself,
 * so it is checked field by field: a shape surprise must fail loudly here, before it reaches
 * the browser half.
 */
function checkPlan(plan) {
  if (plan === null) return;
  if (!isRecord(plan)) badView("plan must be null or an object", plan);
  if (plan.ver !== PLAN_VERSION) badView(`plan.ver must be ${PLAN_VERSION}`, plan.ver);
  if (typeof plan.phase !== "string") badView("plan.phase must be a string", plan.phase);
  if (typeof plan.task !== "string") badView("plan.task must be a string", plan.task);
  if (typeof plan.taskTitle !== "string") badView("plan.taskTitle must be a string", plan.taskTitle);
  if (typeof plan.summary !== "string") badView("plan.summary must be a string", plan.summary);
  if (typeof plan.planDir !== "string") badView("plan.planDir must be a string", plan.planDir);
  if (typeof plan.pausedReason !== "string") badView("plan.pausedReason must be a string", plan.pausedReason);
  if (plan.stepIndex !== null && !(Number.isInteger(plan.stepIndex) && plan.stepIndex >= 1)) {
    badView("plan.stepIndex must be null or a positive integer", plan.stepIndex);
  }
  if (!Array.isArray(plan.steps)) badView("plan.steps must be an array", plan.steps);
  plan.steps.forEach((step, position) => {
    if (!isRecord(step)) badView(`plan.steps[${position}] must be an object`, step);
    if (step.index !== position + 1) {
      badView(`plan.steps[${position}].index must equal its position + 1`, step.index);
    }
    if (typeof step.title !== "string") badView(`plan.steps[${position}].title must be a string`, step.title);
    if (typeof step.file !== "string") badView(`plan.steps[${position}].file must be a string`, step.file);
    if (typeof step.requiresConfirmation !== "boolean") {
      badView(`plan.steps[${position}].requiresConfirmation must be a boolean`, step.requiresConfirmation);
    }
  });
  if (!Array.isArray(plan.stepReports)) badView("plan.stepReports must be an array", plan.stepReports);
  plan.stepReports.forEach((report, position) => {
    if (!isRecord(report)) badView(`plan.stepReports[${position}] must be an object`, report);
    if (!Number.isInteger(report.stepIndex) || report.stepIndex < 1) {
      badView(`plan.stepReports[${position}].stepIndex must be a positive integer`, report.stepIndex);
    }
    if (typeof report.status !== "string") {
      badView(`plan.stepReports[${position}].status must be a string`, report.status);
    }
    if (!Array.isArray(report.artifacts) || report.artifacts.some((item) => typeof item !== "string")) {
      badView(`plan.stepReports[${position}].artifacts must be a string array`, report.artifacts);
    }
    if (typeof report.summary !== "string") {
      badView(`plan.stepReports[${position}].summary must be a string`, report.summary);
    }
    if (report.exitCode !== null && !Number.isInteger(report.exitCode)) {
      badView(`plan.stepReports[${position}].exitCode must be null or an integer`, report.exitCode);
    }
  });
  if (!isRecord(plan.statuses)) badView("plan.statuses must be an object", plan.statuses);
  for (const value of Object.values(plan.statuses)) {
    if (typeof value !== "string") badView("plan.statuses values must be strings", value);
  }
  if (!isRecord(plan.anchorSeqs)) badView("plan.anchorSeqs must be an object", plan.anchorSeqs);
  for (const value of Object.values(plan.anchorSeqs)) {
    if (!isFiniteNumber(value)) badView("plan.anchorSeqs values must be finite numbers", value);
  }
  if (!Array.isArray(plan.skipped) || plan.skipped.some((value) => !Number.isInteger(value) || value < 1)) {
    badView("plan.skipped must be an array of positive integers", plan.skipped);
  }
  if (!isFiniteNumber(plan.asOfMtime) || plan.asOfMtime < 0) {
    badView("plan.asOfMtime must be a finite number", plan.asOfMtime);
  }
  if (typeof plan.sourcePath !== "string") badView("plan.sourcePath must be a string", plan.sourcePath);
}

/** Wire-view schema: structure only, and strict about it. Returns the value untouched. */
function makeViewSchema() {
  return {
    parse(value) {
      if (!isRecord(value)) badView("must be an object", value);
      if (value.ver !== SCHEMA_VERSION) badView(`ver must be ${SCHEMA_VERSION}`, value.ver);
      if (typeof value.task !== "string") badView("task must be a string", value.task);
      if (!Array.isArray(value.todos)) badView("todos must be an array", value.todos);
      if (typeof value.asOf !== "number" || !Number.isFinite(value.asOf)) {
        badView("asOf must be a finite number", value.asOf);
      }
      if (!Array.isArray(value.steps)) badView("steps must be an array", value.steps);
      if (!Array.isArray(value.nodes)) badView("nodes must be an array", value.nodes);

      value.steps.forEach((step, position) => {
        if (!isRecord(step)) badView(`steps[${position}] must be an object`, step);
        if (step.index !== position) badView(`steps[${position}].index must equal its position`, step.index);
        if (typeof step.title !== "string") badView(`steps[${position}].title must be a string`, step.title);
        if (!STEP_STATUSES.has(step.status)) badView(`steps[${position}].status is unknown`, step.status);
        if (!Array.isArray(step.nodeIds)) badView(`steps[${position}].nodeIds must be an array`, step.nodeIds);
        if (!Array.isArray(step.groups)) badView(`steps[${position}].groups must be an array`, step.groups);
        if (step.percent !== null && !(isFiniteNumber(step.percent) && step.percent >= 0 && step.percent <= 100)) {
          badView(`steps[${position}].percent must be null or 0..100`, step.percent);
        }
        if (typeof step.lastEstimateAt !== "number" || !isFiniteNumber(step.lastEstimateAt) || step.lastEstimateAt < 0) {
          badView(`steps[${position}].lastEstimateAt must be a non-negative finite number`, step.lastEstimateAt);
        }
      });

      value.nodes.forEach((node, position) => {
        if (!isRecord(node)) badView(`nodes[${position}] must be an object`, node);
        if (typeof node.id !== "string" || node.id === "") badView(`nodes[${position}].id must be a string`, node.id);
        if (!Number.isInteger(node.stepIndex)) badView(`nodes[${position}].stepIndex must be an integer`, node.stepIndex);
        if (!Array.isArray(node.files)) badView(`nodes[${position}].files must be an array`, node.files);
      });

      const counts = value.counts;
      if (!isRecord(counts)) badView("counts must be an object", counts);
      for (const field of ["steps", "nodes", "running", "completed"]) {
        if (!Number.isInteger(counts[field]) || counts[field] < 0) {
          badView(`counts.${field} must be a non-negative integer`, counts[field]);
        }
      }
      if (counts.steps !== value.steps.length) {
        badView("counts.steps must equal steps.length", counts.steps);
      }
      if (counts.nodes !== value.nodes.length) {
        badView("counts.nodes must equal nodes.length", counts.nodes);
      }

      const active = value.active;
      if (active !== null) {
        if (!isRecord(active)) badView("active must be null or an object", active);
        if (!Number.isInteger(active.stepIndex)) badView("active.stepIndex must be an integer", active.stepIndex);
        if (active.nodeId !== null && typeof active.nodeId !== "string") {
          badView("active.nodeId must be null or a string", active.nodeId);
        }
      }

      // 会话5 · the hot-inject history and the per-step 【需确认】 flags. Both are OPTIONAL on the
      // wire (an older view has neither), and both are shape-checked because the browser half
      // dereferences them: `id` is the join key with the admitting user message, and
      // `pendingConfirm` is what the flag renders from.
      if (value.injects !== undefined) {
        if (!Array.isArray(value.injects)) badView("injects must be an array", value.injects);
        value.injects.forEach((row, position) => {
          if (!isRecord(row)) badView(`injects[${position}] must be an object`, row);
          if (typeof row.id !== "string" || row.id === "") badView(`injects[${position}].id must be a string`, row.id);
          if (typeof row.text !== "string") badView(`injects[${position}].text must be a string`, row.text);
          if (row.pickedUp !== true && row.pickedUp !== false) {
            badView(`injects[${position}].pickedUp must be a boolean`, row.pickedUp);
          }
          // step-03-unsteer · the revocation pair. OPTIONAL (a row that was never revoked has
          // neither), but when present both must be well-formed: the browser half prints
          // 「已撤销」 from `canceled` and the row's clock from `canceledAt`, so a string or a
          // negative stamp here would reach the DOM as a lie rather than as a failure.
          if (row.canceled !== undefined && row.canceled !== true && row.canceled !== false) {
            badView(`injects[${position}].canceled must be a boolean`, row.canceled);
          }
          if (row.canceledAt !== undefined && row.canceledAt !== null && !isFiniteNumber(row.canceledAt)) {
            badView(`injects[${position}].canceledAt must be a number or null`, row.canceledAt);
          }
        });
      }
      value.steps.forEach((step, position) => {
        if (step.pendingConfirm !== undefined && !Array.isArray(step.pendingConfirm)) {
          badView(`steps[${position}].pendingConfirm must be an array`, step.pendingConfirm);
        }
      });

      checkPlan(value.plan);

      return value;
    },
  };
}

/** One todo row, repaired. Only content/status are ever read. */
function repairTodo(raw) {
  if (!isRecord(raw)) return { content: "", status: "" };
  return {
    content: typeof raw.content === "string" ? raw.content : "",
    status: typeof raw.status === "string" ? raw.status : "",
  };
}

/** One step row, repaired: the fields `buildView` dereferences must exist with the right type. */
function repairStep(raw, position) {
  const step = isRecord(raw) ? raw : {};
  const status = STEP_STATUSES.has(step.status) ? step.status : "pending";
  return {
    ...step,
    index: position,
    title: typeof step.title === "string" ? step.title : "",
    source: typeof step.source === "string" ? step.source : "todo",
    status,
    startedAt: isFiniteNumber(step.startedAt) && step.startedAt > 0 ? step.startedAt : 0,
    endedAt: isFiniteNumber(step.endedAt) && step.endedAt > 0 ? step.endedAt : null,
    percent: isFiniteNumber(step.percent) && step.percent >= 0 && step.percent <= 100 ? step.percent : null,
    percentSource: typeof step.percentSource === "string" ? step.percentSource : "none",
    // step-03: the event time of the last progress estimate. 0 is meaningful ("never"), so it
    // repairs to 0 rather than null — the rail hides the segment instead of printing a fake 0.
    lastEstimateAt: isFiniteNumber(step.lastEstimateAt) && step.lastEstimateAt > 0 ? step.lastEstimateAt : 0,
    maxPercent: isFiniteNumber(step.maxPercent) ? Math.max(0, Math.min(100, step.maxPercent)) : 0,
    reportSummary: typeof step.reportSummary === "string" ? step.reportSummary : "",
    nodeIds: Array.isArray(step.nodeIds) ? step.nodeIds.filter((id) => typeof id === "string") : [],
    nodeCount: Number.isInteger(step.nodeCount) && step.nodeCount >= 0 ? step.nodeCount : 0,
    truncatedNodes: Number.isInteger(step.truncatedNodes) && step.truncatedNodes >= 0 ? step.truncatedNodes : 0,
    groups: Array.isArray(step.groups) ? step.groups.filter(isRecord) : [],
  };
}

/** One node row, repaired. A node without an id cannot be referenced, so it is dropped. */
function repairNode(raw) {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "") return null;
  return {
    ...raw,
    id: raw.id,
    stepIndex: Number.isInteger(raw.stepIndex) ? raw.stepIndex : 0,
    kind: typeof raw.kind === "string" ? raw.kind : "tool",
    tool: typeof raw.tool === "string" ? raw.tool : "",
    title: typeof raw.title === "string" ? raw.title : "",
    detail: typeof raw.detail === "string" ? raw.detail : "",
    argsText: typeof raw.argsText === "string" ? raw.argsText : "",
    files: Array.isArray(raw.files)
      ? raw.files.filter(isRecord).map((file) => ({
          path: typeof file.path === "string" ? file.path : "",
          action: typeof file.action === "string" ? file.action : "",
        }))
      : [],
    resultHead: typeof raw.resultHead === "string" ? raw.resultHead : "",
    error: typeof raw.error === "string" ? raw.error : "",
    at: isFiniteNumber(raw.at) && raw.at > 0 ? raw.at : 0,
    durationMs: isFiniteNumber(raw.durationMs) ? raw.durationMs : null,
    // step-11: event seq, carried through a checkpoint restore (null when the node has none).
    seq: isFiniteNumber(raw.seq) ? raw.seq : null,
  };
}

/** One branch activity row, repaired (ids are what the lane UI keys on). */
function repairBranchNode(raw, position) {
  const node = isRecord(raw) ? raw : {};
  return {
    ...node,
    id: typeof node.id === "string" && node.id !== "" ? node.id : `b.n${position}`,
    kind: typeof node.kind === "string" ? node.kind : "row",
    tool: typeof node.tool === "string" ? node.tool : "",
    title: typeof node.title === "string" ? node.title : "",
    detail: typeof node.detail === "string" ? node.detail : "",
    at: isFiniteNumber(node.at) && node.at > 0 ? node.at : 0,
    status: typeof node.status === "string" ? node.status : "",
    key: typeof node.key === "string" ? node.key : "",
  };
}

/** One branch lane, repaired. A lane without an id cannot be referenced, so it is dropped. */
function repairBranch(raw) {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "") return null;
  return {
    ...raw,
    id: raw.id,
    kind: typeof raw.kind === "string" ? raw.kind : "subagent",
    label: typeof raw.label === "string" ? raw.label : "",
    status: raw.status === "failed" ? "failed" : raw.status === "done" ? "done" : "running",
    startedAt: isFiniteNumber(raw.startedAt) && raw.startedAt > 0 ? raw.startedAt : 0,
    endedAt: isFiniteNumber(raw.endedAt) && raw.endedAt > 0 ? raw.endedAt : null,
    stepIndex: Number.isInteger(raw.stepIndex) ? raw.stepIndex : null,
    seq: isFiniteNumber(raw.seq) ? raw.seq : null,
    callId: typeof raw.callId === "string" ? raw.callId : "",
    runId: typeof raw.runId === "string" ? raw.runId : "",
    jobId: typeof raw.jobId === "string" ? raw.jobId : "",
    count: Number.isInteger(raw.count) && raw.count >= 0 ? raw.count : 0,
    nodes: Array.isArray(raw.nodes) ? raw.nodes.map(repairBranchNode) : [],
  };
}

/**
 * Persisted-state schema. Never throws: a non-object becomes a clean initial state, and a
 * record is repaired field by field so a damaged row keeps whatever is still usable instead of
 * resetting the whole view. A well-formed row survives byte-identically (the offline self-test
 * asserts that through a JSON round trip).
 */
function makeStateSchema() {
  return {
    parse(value) {
      if (!isRecord(value)) return createInitialState();
      const steps = Array.isArray(value.steps) ? value.steps.map(repairStep) : [];
      const nodes = Array.isArray(value.nodes) ? value.nodes.map(repairNode).filter((node) => node !== null) : [];
      const reports = Array.isArray(value.reports)
        ? value.reports
            .filter(isRecord)
            .filter((entry) => Number.isInteger(entry.stepIndex) && isFiniteNumber(entry.percent))
            .map((entry) => ({ stepIndex: entry.stepIndex, percent: entry.percent }))
        : [];
      const pending = isRecord(value.pendingAnchor) ? value.pendingAnchor : null;
      return {
        stateVersion: STATE_VERSION,
        asOf: isFiniteNumber(value.asOf) && value.asOf > 0 ? value.asOf : 0,
        task: typeof value.task === "string" ? value.task : "",
        // Session identity: persisted with the state so a cold checkpoint restore can still
        // name this session's `.pae` directory (the plan reader needs both halves).
        sessionId: typeof value.sessionId === "string" ? value.sessionId : "",
        cwd: typeof value.cwd === "string" ? value.cwd : "",
        todos: Array.isArray(value.todos) ? value.todos.map(repairTodo) : [],
        steps,
        nodes,
        // Branch lanes (step-09): repaired row by row so a damaged lane loses its bad rows,
        // never the whole map. `nextBranchId` only ever moves forward.
        branches: Array.isArray(value.branches) ? value.branches.map(repairBranch).filter((branch) => branch !== null) : [],
        nextBranchId:
          Number.isInteger(value.nextBranchId) && value.nextBranchId > 0
            ? value.nextBranchId
            : (Array.isArray(value.branches) ? value.branches.length : 0) + 1,
        droppedBranches: Number.isInteger(value.droppedBranches) && value.droppedBranches >= 0 ? value.droppedBranches : 0,
        // Jobs registered but not yet settled: the input of “is this a background task?”.
        // Persisted because a checkpoint restored mid-run must still be able to promote one.
        pendingJobs: Array.isArray(value.pendingJobs)
          ? value.pendingJobs
              .filter(isRecord)
              .map((job) => ({
                jobId: typeof job.jobId === "string" ? job.jobId : "",
                label: typeof job.label === "string" ? job.label : "",
                kind: typeof job.kind === "string" ? job.kind : "",
                startedAt: isFiniteNumber(job.startedAt) ? job.startedAt : 0,
                callId: typeof job.callId === "string" ? job.callId : "",
                stepIndex: Number.isInteger(job.stepIndex) ? job.stepIndex : null,
              }))
              .slice(-24)
          : [],
        active:
          isRecord(value.active) && Number.isInteger(value.active.stepIndex)
            ? {
                stepIndex: value.active.stepIndex,
                nodeId: typeof value.active.nodeId === "string" ? value.active.nodeId : null,
              }
            : null,
        // step-10: an open turn is the one honest "is the session working" flag. Persisted so a
        // checkpoint restored mid-turn does not freeze the panel's curve behind a live turn.
        turnActive: value.turnActive === true,
        // 会话5 · hot-inject history rows. Repaired row by row: a damaged row loses its bad text
        // but keeps its identity, because the id is what the admitting `user/message` matches on.
        injects: Array.isArray(value.injects)
          ? value.injects
              .filter(isRecord)
              .map((row) => ({
                id: typeof row.id === "string" ? row.id : "",
                at: isFiniteNumber(row.at) && row.at > 0 ? row.at : 0,
                target: typeof row.target === "string" ? row.target : "",
                text: typeof row.text === "string" ? row.text : "",
                pickedUp: row.pickedUp === true,
                pickedUpAt: isFiniteNumber(row.pickedUpAt) && row.pickedUpAt > 0 ? row.pickedUpAt : null,
                // 会话6 · 撤销标记也要活过一次 checkpoint 恢复，否则重启后同一条注入会从「已撤销」
                // 变回「待拾取」，界面与日志说的就不是一件事了。
                canceled: row.canceled === true,
                canceledAt: isFiniteNumber(row.canceledAt) && row.canceledAt > 0 ? row.canceledAt : null,
              }))
              .filter((row) => row.id !== "")
              .slice(-40)
          : [],
        // 会话6 · the inbox LEDGER (pending message ids per loop-owned list). Dropping it here would
        // be silent but destructive: a hydrated checkpoint would replay later cancellations against
        // an empty ledger and every one of them would resolve to “which id?” → unknown.
        inboxIds: {
          "next-turn": isRecord(value.inboxIds) && Array.isArray(value.inboxIds["next-turn"])
            ? value.inboxIds["next-turn"].filter((id) => typeof id === "string" && id !== "")
            : [],
          "next-step": isRecord(value.inboxIds) && Array.isArray(value.inboxIds["next-step"])
            ? value.inboxIds["next-step"].filter((id) => typeof id === "string" && id !== "")
            : [],
        },
        // 会话5 · the approval audit pair (open asks, and the decided ones still worth keeping).
        approvals: Array.isArray(value.approvals)
          ? value.approvals
              .filter(isRecord)
              .map((row) => ({
                id: typeof row.id === "string" ? row.id : "",
                state: row.state === "decided" ? "decided" : "asked",
                // 会话6 · 必留字段：未放行的审批（被拒/取消）仍算「需确认」，而这条判断读的正是
                // outcome。旧修复函数只拷 state，一次重启就把这个信息抹掉，于是重启后的会话里
                // 被拒审批不再标需确认，而且与内存行为不一致。
                outcome: typeof row.outcome === "string" ? row.outcome : "",
                stepIndex: Number.isInteger(row.stepIndex) ? row.stepIndex : null,
                label: typeof row.label === "string" ? row.label : "",
                at: isFiniteNumber(row.at) && row.at > 0 ? row.at : 0,
              }))
              .filter((row) => row.id !== "")
              .slice(-40)
          : [],
        // 会话5 · carried through a restore so a step that was waiting on a human keeps its flag.
        pendingConfirm: Array.isArray(value.pendingConfirm) ? value.pendingConfirm.slice() : [],
        reports,
        durations: Array.isArray(value.durations)
          ? value.durations.filter((ms) => isFiniteNumber(ms) && ms > 0)
          : [],
        truncated: {
          stepNodes: isRecord(value.truncated) && Number.isInteger(value.truncated.stepNodes) ? value.truncated.stepNodes : 0,
          totalNodes: isRecord(value.truncated) && Number.isInteger(value.truncated.totalNodes) ? value.truncated.totalNodes : 0,
        },
        nextNodeId: Number.isInteger(value.nextNodeId) && value.nextNodeId > 0 ? value.nextNodeId : nodes.length + 1,
        pendingAnchor:
          pending && Number.isInteger(pending.planIndex)
            ? { planIndex: pending.planIndex, seq: isFiniteNumber(pending.seq) ? pending.seq : null }
            : null,
        seq: isFiniteNumber(value.seq) ? value.seq : null,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// registration
// ---------------------------------------------------------------------------

/**
 * The host's "now": the timestamp of the last event this projection folded — never the wall
 * clock. `wire.view` receives the state and nothing else, so this is the only honest instant
 * available to it, and it is exactly the instant the folded state describes.
 */
function asOfOf(state) {
  return isRecord(state) && isFiniteNumber(state.asOf) && state.asOf > 0 ? state.asOf : 0;
}

// ---------------------------------------------------------------------------
// the PAE plan (step-03): one reader per session, read on the wire, never in apply
// ---------------------------------------------------------------------------

/**
 * Readers live here, not in the projection state: a reader holds a cache key and counters, is
 * not JSON, and the state is persisted. `init(header)` registers one per session; `wire.view`
 * (which receives the state and nothing else) finds it again through `state.sessionId/cwd`.
 * Bounded, because a long-lived host must not keep one reader per session it ever served.
 */
const MAX_READERS = 32;
const readers = new Map();

const readerKey = (sessionId, cwd) => `${sessionId}\u0000${cwd}`;

/** The reader for one session, created on first use (never reads the disk itself). */
function readerFor(sessionId, cwd) {
  if (sessionId === "" || cwd === "") return null;
  const key = readerKey(sessionId, cwd);
  const existing = readers.get(key);
  if (existing !== undefined) return existing;
  const reader = createPlanReader({ sessionId, cwd });
  readers.set(key, reader);
  if (readers.size > MAX_READERS) {
    const oldest = readers.keys().next();
    if (!oldest.done) readers.delete(oldest.value);
  }
  return reader;
}

/**
 * `{id, cwd}` from a session header — the two facts that name a `.pae` directory.
 *
 * The cwd fallback is NOT a guess: PAE itself computes its plan directory as
 * `agent.session.header.cwd ?? process.cwd()` (dsh-plan-and-execute/lib/index.js:1539-1542), so
 * a real session without a header cwd has its plan in the HOST's cwd — the only place worth
 * looking. An EMPTY header (init() called with nothing, which the offline self-test does) is not
 * a session at all and keeps an empty identity, so it can never name a plan.
 */
function headerIdentity(header) {
  const record = isRecord(header) ? header : {};
  const sessionId = typeof record.id === "string" ? record.id : "";
  const cwd = typeof record.cwd === "string" && record.cwd !== "" ? record.cwd : "";
  return { sessionId, cwd: cwd === "" && sessionId !== "" ? process.cwd() : cwd };
}

/** The same two facts as they were persisted into the state by `init`. */
function stateIdentity(state) {
  const record = isRecord(state) ? state : {};
  return {
    sessionId: typeof record.sessionId === "string" ? record.sessionId : "",
    cwd: typeof record.cwd === "string" ? record.cwd : "",
  };
}

/**
 * The plan section for a state: the reader's cached value (one stat), or null. `read()` never
 * throws; the extra guard keeps a future edit from taking the whole view down with it.
 */
function planFor(state) {
  const { sessionId, cwd } = stateIdentity(state);
  const reader = readerFor(sessionId, cwd);
  if (reader === null) return null;
  try {
    return reader.read();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// the HTTP view route (step-04)
// ---------------------------------------------------------------------------

/**
 * Resolve one host service without assuming it exists.
 *
 * `inject` guarantees these services before apply() runs, so the null path here covers what is
 * NOT the composed web host: the offline self-tests (a bare object with one property) and any
 * future headless mount. Both accessors are tried so the plugin is not pinned to one Cordis
 * generation — `ctx.get(name)` is the documented one, `ctx[name]` the injected property.
 */
function serviceOf(ctx, serviceName) {
  try {
    if (typeof ctx.get === "function") {
      const viaGet = ctx.get(serviceName);
      if (viaGet !== undefined && viaGet !== null) return viaGet;
    }
  } catch {
    // An unknown service name throws on some Cordis versions; treat it as absent.
  }
  const direct = ctx[serviceName];
  return direct === undefined || direct === null ? null : direct;
}

/** Short, bounded text for a diagnostic (a throw here would mask the real problem). */
function describe(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.length <= 200 ? text : `${text.slice(0, 199)}…`;
}

/**
 * Web servers this module has a route on.
 *
 * The shared server outlives this plugin instance: a hot reload re-runs apply() in the same
 * process, and the server throws on a duplicate (kind, path). Keying the seat by SERVER with a
 * refcount means a second apply() reuses the live registration while the LAST disposer removes
 * it — no duplicate throw, and no route left behind either. `routeSeatCount` exists because a
 * WeakMap has no `size`.
 */
const routeSeats = new WeakMap();
let routeSeatCount = 0;
const routeDisposers = [];
let routeNote = "not attempted";

/** What the route attachment did — for diagnostics and for tools/probe-route.mjs. */
export function routeInfo() {
  return { note: routeNote, path: STATE_PATH, servers: routeSeatCount, owners: routeDisposers.length };
}

/**
 * The route's view source: session id → the composed view.
 *
 * This is the only place that knows about sessions. It reads the SAME registry the row registered
 * into (captured in apply), so the route can never serve a view built by a different registry.
 * `snapshot` returns one consistent cut (`{asOfSeq, values}`) whose value already passed the
 * unit's `viewSchema`; `composeView` then applies the plan exactly as the wire path does — a
 * no-op for a view that already carries its plan section.
 *
 * Failures are returned as data, not thrown: each maps onto the status the client should see.
 */
function makeViewSource(ctx, registry) {
  return function viewSource(sessionId) {
    const sessions = serviceOf(ctx, "sessions");
    if (sessions === null || typeof sessions.get !== "function") {
      return { ok: false, status: 503, error: "the sessions service is unavailable" };
    }

    let session;
    try {
      session = sessions.get(sessionId);
    } catch (error) {
      return { ok: false, status: 500, error: `session lookup failed: ${describe(error)}` };
    }
    if (session === undefined || session === null) {
      return { ok: false, status: 404, error: "unknown session" };
    }

    let snapshot;
    try {
      snapshot = registry.snapshot(session, [PROJECTION_KEY]);
    } catch (error) {
      return { ok: false, status: 500, error: `projection snapshot failed: ${describe(error)}` };
    }
    const view = isRecord(snapshot) && isRecord(snapshot.values) ? snapshot.values[PROJECTION_KEY] : undefined;
    if (view === undefined) {
      // Possible mid-mount, or after a failed apply left the key unregistered.
      return { ok: false, status: 503, error: `${PROJECTION_KEY} is not registered` };
    }

    return { ok: true, view: composeView(view, null), rev: isFiniteNumber(snapshot.asOfSeq) ? snapshot.asOfSeq : 0 };
  };
}

/**
 * Acquire (or share) this module's route seat on one server.
 *
 * @returns {(() => void) | null} an idempotent release function, or null when there is nothing
 *   to release (no server, or the server refused the registration). Never throws: a route that
 *   cannot be attached must not take the projection down with it.
 */
/**
 * The steer channel's source: session id + text → one `user/message` in that session's inbox.
 *
 * `agent.steer(input)` is the agent loop's own API for "take this at the next STEP boundary of the
 * running turn, and wake the driver". It does NOT cancel the current turn — `cancel()` is the
 * only path that aborts, and nothing here calls it. That is the whole point of the feature: the
 * session keeps going and picks the new prompt up at its next step.
 *
 * THE MESSAGE IS BUILT HERE, NOT BY THE ROUTE. `createUserMessage` comes from
 * `@deepseek-ai/dsh-llm`, which this package cannot import: it is installed as a `link:`, so a
 * bare specifier is not guaranteed to resolve (see the note on the schemas above). So the message
 * is constructed as a plain object with the four fields the session's shape check
 * (`assertMessageEventShape`) requires — `id`, `role`, `content`, `source` — and the loop's
 * `inbox.splice` folds it into the durable `agent/inbox/spliced` event.
 *
 * WHY `source.kind` IS THE PRODUCER-OWNED `plugin:<name>` AND NOT "user". A non-human producer
 * must carry its own source (dsh-tool-goal/README.md is explicit that it may not inherit
 * `{kind:"user"}`); the loop owns the reserved `"runtime-context"` kind. Session format v4
 * retired the bare `"plugin"` wrapper (reader-side admission rejects it with "format v4
 * message requires a producer-owned source kind"), so the producer-owned `plugin:<name>`
 * kind says who produced the message, and the id is a fresh random UUID, exactly like
 * `createUserMessage`'s own.
 *
 * `agent.status` IS READ, NOT WRITTEN. `ReactLoopAgent.status` is `"running"` unless the phase is
 * idle/maintenance, so a non-running session answers 409 with the plain reason instead of
 * silently queueing a message nobody will ever claim.
 */
export function makeSteerSource(ctx) {
  return function steerSource(sessionId, text) {
    const agents = serviceOf(ctx, "agents");
    if (agents === null || typeof agents.get !== "function") {
      return { ok: false, status: 503, error: "the agents service is unavailable" };
    }

    let agent;
    try {
      agent = agents.get(sessionId);
    } catch (error) {
      return { ok: false, status: 500, error: `agent lookup failed: ${describe(error)}` };
    }
    if (agent === undefined || agent === null) {
      return { ok: false, status: 404, error: "unknown session" };
    }

    // steer() is only meaningful while the loop is driving this session: the next-step inbox is
    // claimed by a running turn, so an idle agent would hold the message until the next turn —
    // which is `followup`'s job, not this button's.
    if (agent.status !== "running" || typeof agent.steer !== "function") {
      return {
        ok: false,
        status: 409,
        error: "会话未在运行，热注入不可用",
      };
    }

    let message;
    try {
      message = {
        id: randomUUID(),
        role: "user",
        content: [{ type: "text", text }],
        source: { kind: `plugin:${packageName}` },
      };
    } catch (error) {
      return { ok: false, status: 500, error: `message could not be built: ${describe(error)}` };
    }

    try {
      agent.steer(message);
    } catch (error) {
      return { ok: false, status: 500, error: `steer failed: ${describe(error)}` };
    }
    // The id travels back to the browser so the panel can offer 「撤回」 for exactly this message
    // while it is still unclaimed: `POST /dsh-workflow/unsteer { sessionId, messageId }`.
    return { ok: true, messageId: message.id };
  };
}

/**
 * The unsteer channel's source: session id + message id -> that message OUT of the inbox.
 *
 * WHY `inbox.remove` AND NOT A SECOND `steer`. A revocation is not new input; it is the loop's own
 * "take that one back" operation, and the loop exposes it as `agent.inbox.remove(messageId)`
 * (`ReactLoopInbox.remove`). Verified against the host's own source 2026-10-26
 * (`@deepseek-ai/dsh-agent-loop/lib/index.js`, `ReactLoopInbox`): it locates the id across both
 * pending lists, splices it out, durably appends
 * `agent/inbox/spliced { target, start, removedCount, inserted: [], outcome: 'canceled' }`, and
 * emits `agent/inbox/discarded { message }` on the agent's dispatch bus. Those two facts are the
 * whole feature: the durable event is what the fold reads (so the row flips on the next poll, and
 * survives a reload), and the plugin writes NOTHING itself — one fact, one writer.
 *
 * WHY `true`/`false` IS THE WHOLE ANSWER. `remove` answers false when the message is no longer
 * pending — the running turn claimed it, or it never existed. Both are the same honest reply to the
 * user ("该注入已被会话接下或不存在"), and neither is a server fault, so this is a 409 and never a
 * 500.
 *
 * WHY `agent.status` IS CHECKED TOO. `remove` happens to work on an idle agent, but the panel's
 * button only exists in the window where the running turn could still claim the message; answering
 * 409 for an idle session keeps this route's meaning identical to `/steer`'s ("hot injection is a
 * live-session operation") instead of quietly becoming a general inbox editor.
 *
 * WHY A MISSING `inbox.remove` IS 503 AND NOT 409. A host whose agent object has no inbox is a
 * composition problem (an older or partial agent implementation), not something the caller did
 * wrong — the same reason `/steer` answers 503 when the agents service is absent.
 * @param {unknown} ctx - the plugin context (`ctx.agents` is the only service read here).
 * @returns {(sessionId: string, messageId: string) => {ok: true} | {ok: false, status: number, error: string}}
 */
export function makeUnsteerSource(ctx) {
  return function unsteerSource(sessionId, messageId) {
    const agents = serviceOf(ctx, "agents");
    if (agents === null || typeof agents.get !== "function") {
      return { ok: false, status: 503, error: "the agents service is unavailable" };
    }

    let agent;
    try {
      agent = agents.get(sessionId);
    } catch (error) {
      return { ok: false, status: 500, error: `agent lookup failed: ${describe(error)}` };
    }
    if (agent === undefined || agent === null) {
      return { ok: false, status: 404, error: "unknown session" };
    }

    if (agent.status !== "running") {
      return {
        ok: false,
        status: 409,
        error: "会话未在运行，热注入不可用",
      };
    }

    const inbox = agent.inbox;
    if (inbox === null || typeof inbox !== "object" || typeof inbox.remove !== "function") {
      return { ok: false, status: 503, error: "the host exposes no inbox revoke API" };
    }

    let removed;
    try {
      removed = inbox.remove(messageId);
    } catch (error) {
      return { ok: false, status: 500, error: `unsteer failed: ${describe(error)}` };
    }
    if (removed !== true) {
      return { ok: false, status: 409, error: "该注入已被会话接下或不存在" };
    }
    return { ok: true };
  };
}

/**
 * Acquire (or share) this module's route seat on one server.
 *
 * @returns {(() => void) | null} an idempotent release function, or null when there is nothing
 *   to release (no server, or the server refused the registration). Never throws: a route that
 *   cannot be attached must not take the projection down with it.
 */
function attachViewRoute(ctx, registry) {
  const server = serviceOf(ctx, "webServer") ?? serviceOf(ctx, "httpServer");
  if (server === null || typeof server.register !== "function") {
    routeNote = "no webServer service (headless host?): the view route was not registered";
    return null;
  }

  const existing = routeSeats.get(server);
  let seat = existing;
  if (seat !== undefined) {
    seat.refs += 1;
    routeNote = `view route already registered on this server (${seat.refs} owner(s))`;
  } else {
    let dispose;
    try {
      dispose = registerViewRoute(server, {
        snapshot: makeViewSource(ctx, registry),
        steer: makeSteerSource(ctx),
        unsteer: makeUnsteerSource(ctx),
        note: (text) => {
          routeNote = text;
        },
      });
    } catch (error) {
      routeNote = `view route registration failed: ${describe(error)}`;
      return null;
    }
    seat = { refs: 1, dispose, released: false };
    routeSeats.set(server, seat);
    routeSeatCount += 1;
    routeNote = `registered ${STATE_PATH} + ${STEER_PATH} + ${UNSTEER_PATH} on the host web server`;
  }

  const seatRef = seat;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const index = routeDisposers.indexOf(release);
    if (index >= 0) routeDisposers.splice(index, 1);
    seatRef.refs -= 1;
    if (seatRef.refs > 0) return;
    seatRef.released = true;
    if (routeSeats.get(server) === seatRef) {
      routeSeats.delete(server);
      routeSeatCount -= 1;
    }
    try {
      seatRef.dispose();
      routeNote = `released ${STATE_PATH}`;
    } catch (error) {
      routeNote = `view route dispose failed: ${describe(error)}`;
    }
  };
  routeDisposers.push(release);
  return release;
}

export function apply(ctx) {
  if (!isRecord(ctx) || !isRecord(ctx.sessionProjections) || typeof ctx.sessionProjections.register !== "function") {
    throw new Error("workflow-map: the sessionProjections service is unavailable");
  }
  // Captured once: the route's view source must read the SAME registry this row registers into,
  // not whatever `ctx.get("sessionProjections")` happens to resolve to at request time.
  const registry = ctx.sessionProjections;

  registry.register({
    key: PROJECTION_KEY,
    stateSchema: makeStateSchema(),
    // Must stay a non-negative safe integer and must not change for a given key while it
    // shares a session: a bump tells the registry to drop older checkpoints and rebuild.
    stateVersion: STATE_VERSION,
    // init() is handed (header, inheritedEventCount); this fold ignores the inherited count —
    // a forked session starts from the same empty ledger — and uses the header only to carry
    // the session identity into the state.
    // `init(header)` is where the session identity is captured. Create (do NOT read) this
    // session's plan reader here: step-03 keeps the only file access on the wire path, so init
    // records WHERE the plan would be and nothing else.
    init: (header) => {
      const { sessionId, cwd } = headerIdentity(header);
      readerFor(sessionId, cwd);
      return { ...createInitialState(), sessionId, cwd };
    },
    // One implementation, two consumers: the very fold the offline self-test drives.
    apply: (state, event) => foldEvent(state, event),
    wire: {
      viewSchema: makeViewSchema(),
      // `buildView` at the last folded instant, plus the PAE plan section merged on top
      // (header task title; title/status of todo-derived rows only). The plan is READ here —
      // one stat per view, and never inside apply, which stays pure and disk-free.
      view: (state) => composeView(buildView(state, asOfOf(state)), planFor(state)),
    },
  });

  // The HTTP view route (step-04), attached AFTER the projection so it can never serve a session
  // whose projection is not registered yet. A host without a web server, or one that refuses the
  // seat, only leaves a diagnostic behind: the projection is still useful without the poll route,
  // so this must never fail the mount.
  const releaseRoute = attachViewRoute(ctx, registry);
  if (releaseRoute !== null && typeof ctx.effect === "function") {
    ctx.effect(() => releaseRoute);
  }
}
/**
 * Process-level self-check, evaluated once at module load. Pure data: the shape self-test
 * asserts these fields, so a drift between the package manifest and the patch row fails a
 * test instead of a profile.
 */
export const selfCheck = Object.freeze({
  name,
  packageName,
  /** Subpath of the browser half, loaded through `dsh.client` in package.json. */
  clientEntry: "./client",
  /** Locale namespace — identical in locale/zh.json, locale/en.json and client.js. */
  localeNamespace: packageName,
  /** Everything this row registers: one projection and three HTTP endpoints (read + two writes). */
  registrations: Object.freeze([
    `sessionProjection:${PROJECTION_KEY}`,
    `httpRoute:${STATE_PATH}`,
    `httpRoute:${STEER_PATH}`,
    `httpRoute:${UNSTEER_PATH}`,
  ]),
  /** The route paths as data, for the same reason `planSource` is: assertion targets. */
  httpRoute: STATE_PATH,
  steerRoute: STEER_PATH,
  unsteerRoute: UNSTEER_PATH,
  /** The one file this plugin reads: read-only, one stat per view, never in apply. */
  planSource: ".pae/<sessionId>/orchestrator.json",
});
export default { name, inject, apply, selfCheck, packageName, PROJECTION_KEY, makeSteerSource, makeUnsteerSource };
