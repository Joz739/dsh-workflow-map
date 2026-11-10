/**
 * The model-facing progress report tool.
 *
 * The fold already consumes `stepProgress/report` events. This module is the writer: a raw
 * JSON-Schema tool definition, the argument policy, and a collision-safe registration helper.
 * It has no host imports and no Node/DOM dependencies, so the offline self-test drives the same
 * definition the host registers.
 */

export const TOOL_NAME = "report_step_progress";
export const REPORT_EVENT_TYPE = "stepProgress/report";

const NOTE_LIMIT = 200;

const isObject = (value) => value !== null && typeof value === "object";
const isRecord = (value) => isObject(value) && !Array.isArray(value);

const DESCRIPTION =
  "Record a completion estimate (0-100) for the current step. " +
  "Call it when a multi-step task starts, after a meaningful partial result, and once more " +
  "before moving to the next step. It does not edit the todo list, change a todo status, or " +
  "mark the step complete.";

const PARAMETERS = {
  type: "object",
  properties: {
    percent: {
      type: "number",
      description: "Completion estimate for the current step, 0-100.",
    },
    note: {
      type: "string",
      description: "Optional one-line evidence: what is done and what is still left.",
    },
  },
  required: ["percent"],
};

const OUTPUT = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean" },
    percent: { type: "number" },
    recorded: { type: "boolean" },
    note: { type: "string" },
  },
  required: ["ok", "percent", "recorded", "note"],
};

/** The event payload. `undefined` is omitted because the session envelope rejects it. */
export function reportEvent(percent, note) {
  return typeof note === "string" ? { percent, note: note.slice(0, NOTE_LIMIT) } : { percent };
}

function renderReport(_args, value) {
  return [{ type: "text", text: `Recorded ${value.percent}% for the current step.` }];
}

/**
 * Validate one call and append exactly one event. The agent/session check comes first so a
 * caller without an owning session gets that error rather than an argument error.
 */
export function executeReport(args, exec) {
  if (!isRecord(exec) || !isRecord(exec.agent) || !isObject(exec.agent.session)) {
    throw new Error(`${TOOL_NAME} requires an owning agent session`);
  }
  const session = exec.agent.session;
  if (typeof session.append !== "function") {
    throw new Error(`${TOOL_NAME} requires an owning agent session`);
  }

  const percent = isRecord(args) ? args.percent : undefined;
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error(`${TOOL_NAME}: percent must be a finite number between 0 and 100`);
  }

  const note = isRecord(args) && typeof args.note === "string" ? args.note.slice(0, NOTE_LIMIT) : undefined;
  session.append(REPORT_EVENT_TYPE, reportEvent(percent, note));
  return { ok: true, percent, recorded: true, note: note === undefined ? "" : note };
}

/** The raw registry definition. Parameters are an open object, as the registry expects. */
export function buildToolDefinition() {
  return {
    name: TOOL_NAME,
    description: DESCRIPTION,
    parameters: PARAMETERS,
    output: { schema: OUTPUT, render: renderReport },
    execute: executeReport,
  };
}

function describe(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.length <= 200 ? text : `${text.slice(0, 199)}…`;
}

function existingTool(tools) {
  try {
    if (typeof tools.get === "function") {
      const found = tools.get(TOOL_NAME);
      if (found !== undefined && found !== null) return found;
    }
  } catch {
    // An unsupported get() is treated as "not present"; register() is still attempted.
  }
  try {
    if (typeof tools.has === "function" && tools.has(TOOL_NAME) === true) return true;
  } catch {
    // Same as above.
  }
  return null;
}

/**
 * Register the tool when the host exposes a tools service and no plugin already owns the name.
 * Returns a diagnostic; never throws. `dispose` is a function when this plugin registered it.
 */
export function registerProgressTool(tools) {
  if (!isRecord(tools) || typeof tools.register !== "function") {
    return { mode: "unavailable", note: "tools service unavailable", dispose: null };
  }
  if (existingTool(tools) !== null) {
    return { mode: "external", note: null, dispose: null };
  }
  try {
    const dispose = tools.register(buildToolDefinition());
    return { mode: "builtin", note: null, dispose: typeof dispose === "function" ? dispose : null };
  } catch (error) {
    return { mode: "unavailable", note: describe(error), dispose: null };
  }
}
