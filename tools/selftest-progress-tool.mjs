#!/usr/bin/env node
// dsh-workflow-map — self-test for the built-in report_step_progress tool.
//
// node tools/selftest-progress-tool.mjs
//
// The tool is the writer for the same `stepProgress/report` events the fold reads. This suite
// checks the definition, the argument policy, the event payload, and the collision-safe
// registration against fake registries (the host's tools package is bundled in the app).

import {
  TOOL_NAME,
  REPORT_EVENT_TYPE,
  buildToolDefinition,
  executeReport,
  registerProgressTool,
  reportEvent,
} from "../src/progress-tool.mjs";

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${label}${detail === undefined ? "" : "  <- " + detail}`);
}

function equal(label, actual, expected) {
  check(label, JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify(actual) + " !== " + JSON.stringify(expected));
}

function throws(label, fn) {
  try {
    fn();
  } catch (error) {
    passed += 1;
    return error;
  }
  failures.push(`${label}  <- did not throw`);
  return null;
}

// --- definition -------------------------------------------------------------
const definition = buildToolDefinition();
equal("definition name", definition.name, TOOL_NAME);
check("definition description is non-empty", typeof definition.description === "string" && definition.description.length > 20);
equal("parameter type", definition.parameters.type, "object");
equal("parameter keys", Object.keys(definition.parameters.properties).sort(), ["note", "percent"]);
equal("required parameter", definition.parameters.required, ["percent"]);
equal("output closed object", definition.output.schema.additionalProperties, false);
equal("output required", definition.output.schema.required.sort(), ["note", "ok", "percent", "recorded"].sort());
check("output render is a function", typeof definition.output.render === "function");

// --- argument policy --------------------------------------------------------
const base = { agent: { session: { append() {} } } };
throws("missing exec", () => executeReport({ percent: 50 }, undefined));
throws("missing agent", () => executeReport({ percent: 50 }, {}));
throws("session without append", () => executeReport({ percent: 50 }, { agent: { session: {} } }));
throws("string percent", () => executeReport({ percent: "60" }, base));
throws("NaN percent", () => executeReport({ percent: NaN }, base));
throws("infinite percent", () => executeReport({ percent: Infinity }, base));
throws("negative percent", () => executeReport({ percent: -1 }, base));
throws("over 100 percent", () => executeReport({ percent: 101 }, base));

// --- event payload ----------------------------------------------------------
const appended = [];
const result = executeReport(
  { percent: 42, note: "done: parser; left: tests" },
  { agent: { session: { append(type, data) { appended.push({ type, data }); } } } }
);
equal("one event appended", appended.length, 1);
equal("event type", appended[0].type, REPORT_EVENT_TYPE);
equal("event payload", appended[0].data, { percent: 42, note: "done: parser; left: tests" });
equal("tool result", result, { ok: true, percent: 42, recorded: true, note: "done: parser; left: tests" });
equal("reportEvent omits an absent note", reportEvent(30), { percent: 30 });
equal("reportEvent truncates a long note", reportEvent(30, "x".repeat(250)).note.length, 200);
equal("optional note is empty in the result", executeReport({ percent: 10 }, base).note, "");

// --- registration -----------------------------------------------------------
let registered = null;
const emptyRegistry = {
  get() {
    return undefined;
  },
  register(tool) {
    registered = tool;
    return () => {};
  },
};
const builtin = registerProgressTool(emptyRegistry);
equal("empty registry registers", builtin.mode, "builtin");
check("registered the raw definition", registered && registered.name === TOOL_NAME);
check("disposer is returned", typeof builtin.dispose === "function");

const existingRegistry = {
  get(name) {
    return name === TOOL_NAME ? { name } : undefined;
  },
  register() {
    throw new Error("must not register a duplicate");
  },
};
equal("existing tool is left alone", registerProgressTool(existingRegistry).mode, "external");

const brokenRegistry = {
  get() {
    throw new Error("unsupported get");
  },
  register() {
    throw new Error("duplicate");
  },
};
const broken = registerProgressTool(brokenRegistry);
equal("a refused register does not throw", broken.mode, "unavailable");
check("the refusal carries a note", typeof broken.note === "string" && broken.note.length > 0);
equal("no tools service", registerProgressTool(null).mode, "unavailable");
equal("tools without register", registerProgressTool({ get() {} }).mode, "unavailable");

// --- apply keeps mounting when tools are absent -----------------------------
const { apply } = await import("../lib/index.js");
let projection = null;
apply({
  sessionProjections: {
    register(options) {
      projection = options;
      return () => {};
    },
  },
});
check("apply still registers the projection without tools", projection !== null && projection.key === "workflowView");

// report
const total = passed + failures.length;
if (failures.length === 0) {
  console.log(`selftest-progress-tool: PASS ${passed}/${total} assertions`);
  console.log("  + definition / argument policy / one event / collision-safe registration");
  process.exit(0);
}
console.error(`selftest-progress-tool: FAIL ${failures.length}/${total} assertions`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(1);
