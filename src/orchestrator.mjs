/**
 * dsh-workflow-map — PAE plan reader .
 *
 * WHY THIS MODULE EXISTS. The fold in ../src/fold.mjs already recognises plan steps from PAE's
 * own context messages, but that is a reconstruction of the log. The AUTHORITATIVE plan — its
 * phase, PAE's canonical task text, the per-step files and the orchestrator's own status /
 * report / anchor bookkeeping — lives in `<cwd>/.pae/<sessionId>/orchestrator.json`. This module
 * reads exactly that file and nothing else.
 *
 * BOUNDARIES (each one is load-bearing):
 * * READ ONLY. Nothing here writes, creates or deletes anything under `.pae`; the self-test
 * asserts the file's mtime and size are unchanged after a full read.
 * * NEVER THROWS. A missing file, a half-written file (PAE rewrites it between steps), a
 * permission problem or a schema surprise must degrade the panel, never the session: every
 * failure returns null and appends ONE line to errors.
 * * ONE STAT PER VIEW. read stats the file and reuses the parsed value while `mtimeMs:size`
 * is unchanged, so a per-event wire build costs one statSync and no read. The parsed value
 * is deep-frozen, so the cache can be handed to every view without aliasing risk.
 * * NO CLOCK, NO AMBIENT STATE. `asOfMtime` is the file's own mtime — the only honest "as of"
 * instant this source has.
 * * PATHS ARE NOT GUESSED. `<cwd>` and the session id must both be supplied. A session id
 * that is not a single path segment is refused, because it would escape `.pae`.
 *
 * WHAT IT DOES NOT DO: it never invents a step. `steps` comes from `plan.steps` verbatim (with
 * the 1-based ordinal PAE prints), so a plan row the fold has no evidence for is still listed
 * with `index`/`title`/`file` and no fabricated timings or percentages.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { TEXT_LIMIT, TITLE_LIMIT, line, text } from "./fold.mjs";

/** Version of the `plan` wire section. Bump only when its SHAPE changes. */
export const PLAN_VERSION = 1;

/** PAE's plan root, relative to the session cwd, and the state file inside it. */
export const PLAN_ROOT = ".pae";
export const PLAN_FILE = "orchestrator.json";

/** Bounds. The plan is display data; a runaway file must not grow the session cache. */
export const MAX_PLAN_STEPS = 200;
export const MAX_STEP_REPORTS = 200;
export const MAX_ARTIFACTS = 40;
export const MAX_ERRORS = 8;
export const MAX_TASK = 2000;
export const MAX_TASK_TITLE = 400;
export const MAX_SUMMARY = 400;
export const MAX_PATH = 400;
export const MAX_PHASE = 40;

/** PAE's `statuses` / `anchorSeqs` keys are 1-based ordinals printed as strings. */
const ORDINAL = /^[1-9][0-9]{0,3}$/;

const isObject = (value) => value !== null && typeof value === "object";
const isRecord = (value) => isObject(value) && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * A path is NOT passed through `text`: that helper flattens whitespace, which would silently
 * rewrite a legitimate `C:\Users\A B\…`. Paths are only length-bounded.
 */
function pathText(value) {
  if (typeof value !== "string") return "";
  return value.length <= MAX_PATH ? value : `${value.slice(0, MAX_PATH - 1)}…`;
}

/** PAE's status vocabulary → the fold's four step states. A Map, not an object literal, so a
 * crafted `"constructor"` key cannot resolve to Object.prototype. */
const PLAN_STATUS = new Map([
  ["completed", "done"],
  ["done", "done"],
  ["success", "done"],
  ["in_progress", "running"],
  ["in-progress", "running"],
  ["running", "running"],
  ["executing", "running"],
  ["pending", "pending"],
  ["queued", "pending"],
  ["failed", "failed"],
  ["failure", "failed"],
  ["error", "failed"],
]);

/**
 * Where this session's plan file is, or null when the inputs cannot name one.
 *
 * `sessionId` comes from the session header (`header.id`, already `session-<uuid>` on this
 * host — that is the name PAE itself creates under `.pae`). Both inputs are required: an
 * invented path would read somebody else's plan or nothing at all, and a null is honest.
 *
 * @param {{cwd?: unknown, sessionId?: unknown}} input
 * @returns {string|null}
 */
export function planFilePath(input) {
  const source = isRecord(input) ? input : {};
  const cwd = typeof source.cwd === "string" ? source.cwd.trim() : "";
  const sessionId = typeof source.sessionId === "string" ? source.sessionId.trim() : "";
  if (cwd === "" || sessionId === "") return null;
 // One path segment only, and not a traversal token.
  if (sessionId === "." || sessionId === "..") return null;
  if (sessionId.includes("/") || sessionId.includes("\\") || sessionId.includes(":")) return null;
  return join(cwd, PLAN_ROOT, sessionId, PLAN_FILE);
}

/**
 * Normalize one parsed `orchestrator.json` into the wire `plan` section.
 *
 * Every field is defended individually: PAE writes this file incrementally, so a field can be
 * absent in one phase and present in another (a `planning` document has no `plan`, a completed
 * one has no `pausedReason`). A missing field degrades to its empty value — it never fails the
 * whole read, and it never invents a value.
 *
 * @param {unknown} raw - the parsed JSON document.
 * @param {{asOfMtime?: unknown, sourcePath?: unknown}} [meta]
 * @returns {object} a frozen, JSON-safe plan section.
 */
export function normalizePlanDocument(raw, meta) {
  const doc = isRecord(raw) ? raw : {};
  const plan = isRecord(doc.plan) ? doc.plan : {};
  const source = isRecord(meta) ? meta : {};

 // -- steps: the published plan list, in order, with PAE's own 1-based ordinals -----------
  const steps = [];
  const rawSteps = Array.isArray(plan.steps) ? plan.steps : [];
  const stepCount = Math.min(rawSteps.length, MAX_PLAN_STEPS);
  for (let position = 0; position < stepCount; position += 1) {
    const item = rawSteps[position];
    const row = isRecord(item) ? item : {};
    steps.push(
      Object.freeze({
 // Position, not "number of rows kept": a damaged row must not shift every ordinal
 // after it away from the `statuses` / `anchorSeqs` keys that point at it.
        index: position + 1,
        title: text(row.title, TITLE_LIMIT),
        file: pathText(row.file),
        requiresConfirmation: row.requiresConfirmation === true,
      }),
    );
  }

 // -- statuses: {"1":"completed","2":"in_progress"} ---------------------------------------
  const statuses = {};
  if (isRecord(doc.statuses)) {
    for (const [key, value] of Object.entries(doc.statuses)) {
      if (!ORDINAL.test(key)) continue;
      if (typeof value !== "string" || value === "") continue;
      statuses[key] = text(value, MAX_PHASE);
    }
  }

 // -- anchorSeqs: {"1":502,"2":942} — the seq of the user/message that OPENS step n ---------
  const anchorSeqs = {};
  if (isRecord(doc.anchorSeqs)) {
    for (const [key, value] of Object.entries(doc.anchorSeqs)) {
      if (!ORDINAL.test(key)) continue;
      if (!isFiniteNumber(value)) continue;
      anchorSeqs[key] = value;
    }
  }

 // -- stepReports: one bounded report per step; a retried step keeps its LAST report -------
  const byStep = new Map();
  const rawReports = Array.isArray(doc.stepReports) ? doc.stepReports : [];
  for (const item of rawReports) {
    const row = isRecord(item) ? item : null;
    if (row === null) continue;
    if (!Number.isInteger(row.stepIndex) || row.stepIndex < 1) continue;
    const artifacts = Array.isArray(row.artifacts)
      ? row.artifacts
          .filter((entry) => typeof entry === "string")
          .slice(0, MAX_ARTIFACTS)
          .map((entry) => pathText(entry))
      : [];
    byStep.set(row.stepIndex, {
      stepIndex: row.stepIndex,
      status: text(row.status, MAX_PHASE),
      artifacts: Object.freeze(artifacts),
      summary: text(row.summary, MAX_SUMMARY),
      exitCode: Number.isInteger(row.exit_code) ? row.exit_code : null,
    });
  }
  const stepReports = [...byStep.values()]
    .sort((left, right) => left.stepIndex - right.stepIndex)
    .slice(0, MAX_STEP_REPORTS)
    .map((report) => Object.freeze(report));

 // -- skipped: [7] — 1-based ordinals PAE skipped ------------------------------------------
  const skipped = [];
  if (Array.isArray(doc.skipped)) {
    const seen = new Set();
    for (const value of doc.skipped) {
      if (!Number.isInteger(value) || value < 1 || seen.has(value)) continue;
      seen.add(value);
      skipped.push(value);
    }
    skipped.sort((left, right) => left - right);
  }

  const rawTask = typeof doc.task === "string" ? doc.task : "";
  const result = {
    ver: PLAN_VERSION,
    phase: text(doc.phase, MAX_PHASE),
    task: text(rawTask, MAX_TASK),
 // The first non-empty line, before flattening: it is the panel's header.
    taskTitle: line(rawTask, MAX_TASK_TITLE),
    summary: text(plan.summary, MAX_SUMMARY),
    planDir: pathText(typeof doc.planDir === "string" && doc.planDir !== "" ? doc.planDir : plan.planDir),
    pausedReason: text(doc.pausedReason, MAX_PHASE),
    stepIndex: Number.isInteger(doc.stepIndex) && doc.stepIndex >= 1 ? doc.stepIndex : null,
    steps: Object.freeze(steps),
    stepReports: Object.freeze(stepReports),
    statuses: Object.freeze(statuses),
    anchorSeqs: Object.freeze(anchorSeqs),
    skipped: Object.freeze(skipped),
    asOfMtime: isFiniteNumber(source.asOfMtime) && source.asOfMtime >= 0 ? source.asOfMtime : 0,
    sourcePath: pathText(source.sourcePath),
  };
  return Object.freeze(result);
}

/** The plan's status for step `planIndex`, mapped to the fold's vocabulary, or null. */
function planStatusOf(plan, planIndex) {
  const label = plan.statuses[String(planIndex)];
  if (typeof label === "string") {
    const mapped = PLAN_STATUS.get(label.trim().toLowerCase());
    if (mapped !== undefined) return mapped;
  }
  const report = plan.stepReports.find((row) => row.stepIndex === planIndex);
  if (report !== undefined) {
    if (report.status === "success") return "done";
    if (report.status === "failed") return "failed";
  }
  return null;
}

/**
 * Merge the plan section into a wire view.
 *
 * The plan is the PRIMARY source ("PAE plan first"), the todo table the fallback - but the fold's
 * own event replay is fresher than a file PAE only rewrites at step boundaries. The five rules
 * below are that judgement, written down so it cannot drift:
 *
 * 1. `task` prefers the plan's first line. The fold's task is the first user message capped
 * at 120 chars; the plan carries PAE's canonical objective.
 * 2. A plan step matches a folded row by `planIndex` first. ONLY a row the fold derived from
 * the todo table may fall back to ordinal position - that is the "todo fallback" case.
 * 3. A matched row's TITLE always comes from the plan: it is the published plan text.
 * 4. A matched row's STATUS comes from the plan ONLY when the row is todo-derived. A row the
 * fold opened from a PAE step instruction has an event-derived status that is at least as
 * fresh as the file, and `running` there means "this is happening now".
 * 5. A plan step with no folded row is NOT invented here: `plan.steps` already carries it and
 * the client renders that list. A fabricated row would need a start time, a percent and
 * node bindings that no source provides.
 *
 * The returned view is a new object; the input (and every frozen plan object) is never mutated.
 *
 * @param {unknown} view - the wire view produced by `buildView`.
 * @param {unknown} plan - a normalized plan, or null.
 * @returns {object}
 */
export function applyPlanToView(view, plan) {
  if (!isRecord(view)) return view;
  const normalized = isRecord(plan) ? plan : null;
  const result = { ...view, plan: normalized };
  if (normalized === null) return result;

  if (normalized.taskTitle !== "") result.task = normalized.taskTitle;

  const steps = Array.isArray(view.steps) ? view.steps.map((step) => (isRecord(step) ? { ...step } : step)) : [];
  const byPlanIndex = new Map();
  for (let position = 0; position < steps.length; position += 1) {
    const step = steps[position];
    if (isRecord(step) && Number.isInteger(step.planIndex)) byPlanIndex.set(step.planIndex, position);
  }

  let changed = false;
  for (const planStep of normalized.steps) {
    let position = byPlanIndex.get(planStep.index);
    if (position === undefined) {
      const candidate = steps[planStep.index - 1];
      if (isRecord(candidate) && candidate.source === "todo" && !Number.isInteger(candidate.planIndex)) {
        position = planStep.index - 1;
      }
    }
    if (position === undefined) continue;

    const step = steps[position];
    if (!isRecord(step)) continue;
    const patch = {};
    if (planStep.title !== "" && planStep.title !== step.title) patch.title = planStep.title;
    if (step.planIndex !== planStep.index) patch.planIndex = planStep.index;
    if (step.source === "todo") {
      const status = planStatusOf(normalized, planStep.index);
      if (status !== null && status !== step.status) {
        patch.status = status;
 // `buildView` pins a closed step at 100 when no report gave a number; the same rule
 // applies after this late status change, or the bar would show "—" on a finished step.
        if ((status === "done" || status === "failed") && (step.percent === null || step.percent === undefined)) {
          patch.percent = 100;
        }
      }
    }
    if (Object.keys(patch).length === 0) continue;
    steps[position] = { ...step, ...patch };
    changed = true;
  }

  if (changed) {
    result.steps = steps;
    const running = steps.filter((step) => isRecord(step) && step.status === "running").length;
    const completed = steps.filter((step) => isRecord(step) && step.status === "done").length;
    result.counts = {
      ...(isRecord(view.counts) ? view.counts : {}),
      steps: steps.length,
      nodes: Array.isArray(view.nodes) ? view.nodes.length : 0,
      running,
      completed,
    };
  }

  return result;
}

/**
 * One per-session reader: path + mtime/size cache + a bounded error log.
 *
 * The instance is created by the host half's `init(header)` and lives outside the projection
 * STATE on purpose — a reader is not JSON, and the persisted state is. `read` is called from
 * the wire view, where it costs one `statSync`; `apply` never touches the disk.
 *
 * @param {{cwd?: unknown, sessionId?: unknown}} [options]
 * @returns {{path: string|null, read: => object|null, stats: => object, errors: => object[], reset: => void}}
 */
export function createPlanReader(options) {
  const source = isRecord(options) ? options : {};
  const filePath = planFilePath(source);

  const counters = { stat: 0, read: 0, hit: 0, miss: 0, error: 0 };
  const errors = [];
  let cacheKey = null;
  let cached = null;

  function noteError(code, message) {
    counters.error += 1;
    const messageText = text(message, TEXT_LIMIT);
    const last = errors[errors.length - 1];
 // A session without PAE stats a missing file on every event: one line, not thousands.
    if (last !== undefined && last.code === code && last.message === messageText) return;
    errors.push({ code, message: messageText });
    if (errors.length > MAX_ERRORS) errors.splice(0, errors.length - MAX_ERRORS);
  }

  function fail(code, error) {
    cacheKey = null;
    cached = null;
    counters.miss += 1;
    noteError(code, error instanceof Error ? error.message : String(error));
    return null;
  }

  function read() {
    if (filePath === null) return null;

    counters.stat += 1;
    let stat;
    try {
      stat = statSync(filePath);
    } catch (error) {
      return fail(errorCode(error), error);
    }
    if (!stat.isFile()) {
      return fail("ENOTFILE", `${PLAN_FILE} is not a regular file`);
    }

    const key = `${stat.mtimeMs}:${stat.size}`;
    if (cacheKey === key && cached !== null) {
      counters.hit += 1;
      return cached;
    }

    counters.read += 1;
    let raw;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch (error) {
      return fail(errorCode(error), error);
    }

    let document;
    try {
 // A BOM is legal in a text file and illegal to JSON.parse: strip it, do not fail on it.
      document = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    } catch (error) {
      return fail("PARSE_FAILED", error);
    }

    cacheKey = key;
    cached = normalizePlanDocument(document, { asOfMtime: stat.mtimeMs, sourcePath: filePath });
    counters.miss += 1;
    return cached;
  }

  return {
    path: filePath,
    read,
    stats: () => ({ ...counters }),
    errors: () => errors.map((entry) => ({ ...entry })),
 /** Forget the cached value (the counters and the error log restart with it). */
    reset() {
      cacheKey = null;
      cached = null;
      counters.stat = 0;
      counters.read = 0;
      counters.hit = 0;
      counters.miss = 0;
      counters.error = 0;
      errors.length = 0;
    },
  };
}

/** `error.code` when it is a string (ENOENT / EACCES …), else a stable label. */
function errorCode(error) {
  if (isRecord(error) && typeof error.code === "string" && error.code !== "") return error.code;
  return "READ_FAILED";
}
