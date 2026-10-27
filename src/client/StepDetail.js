/**
 * StepDetail.js - "what did this step deliver": the PAE step report plus the step's own statistics,
 * inline under the selected step card (and a one-line summary in the column header).
 *
 * Two sources, deliberately kept apart:
 * report plan.stepReports[stepIndex] — summary / artifacts / exit_code / status. PAE
 * rewrites this after every step; a step that has not reported yet says so.
 * stats the step's own nodes (tool count, distinct files, first/last clock) — the
 * counts come from the nodes the host actually sent, and when the host's
 * 300-node cap bit, the block says how many nodes it could not count.
 *
 * There is NO "blank" state: a step without a report renders "no report for this step yet".
 *
 * Pure: `h` and `say` are injected. The open/closed state is a plain number (the step whose
 * detail the user closed) so it survives re-renders without React state in the renderer.
 *
 * Inlined into client.js by tools/build-client.mjs (single-file browser half).
 */

/** Host/PAE report vocabulary → the panel's status chip. */
var WF_REPORT_STATUS = new Map([
  ["success", "done"],
  ["succeeded", "done"],
  ["completed", "done"],
  ["done", "done"],
  ["failed", "failed"],
  ["failure", "failed"],
  ["error", "failed"],
  ["skipped", "skipped"],
  ["pending", "pending"],
  ["running", "running"],
]);

function wfReportStatusKey(report) {
  var raw = report && typeof report.status === "string" ? report.status.trim().toLowerCase() : "";
  var status = WF_REPORT_STATUS.get(raw) || "pending";
  return status === "failed"
    ? "panel.status.failed"
    : status === "done"
      ? "panel.status.done"
      : status === "skipped"
        ? "panel.status.skipped"
        : status === "running"
          ? "panel.status.running"
          : "panel.status.pending";
}

/**
 * The detail for a step index is OPEN by default. `closed` remembers the one step whose
 * detail the user folded away (the "i" button / Escape), so selecting another step opens
 * that step's detail without resurrecting the folded one.
 */
function wfStepDetailOpen(closed, stepIndex) {
  var closedIndex = wfFinite(closed);
  var index = wfFinite(stepIndex);
  if (closedIndex === null || index === null) return true;
  return Math.round(closedIndex) !== Math.round(index);
}

/** "i" on the selected step: open ↔ closed. */
function wfStepDetailToggle(closed, stepIndex) {
  return wfStepDetailOpen(closed, stepIndex) ? Math.round(stepIndex) : null;
}

/** "i" on another step: select it and open its detail. */
function wfStepDetailOpenFor(stepIndex) {
  return { selectedStep: Math.round(stepIndex), closedStep: null };
}

/** The one-line summary pinned in the left column's header. */
function wfRenderStepHead(h, detail, say) {
  if (!detail) return null;
  return h(
    "span",
    { className: "wf-col-sub wf-step-head", key: "step-head", "data-step-index": detail.index },
    say("panel.step.head", {
      n: detail.index + 1,
      tools: detail.tools,
      files: detail.files,
    })
  );
}

/**
 * The block under the selected card. `detail` is built by store.js wfBuildStepDetail:
 * {index, planIndex, title, status, statusKey, tools, files, nodes, truncated,
 * startedAt, endedAt, report|null}.
 */
function wfRenderStepDetail(h, detail, say, actions, ctx) {
  if (!detail || wfFinite(detail.index) === null) return null;
  var fire = actions || {};
  var report = detail.report && typeof detail.report === "object" ? detail.report : null;
  var artifacts = report && Array.isArray(report.artifacts) ? report.artifacts : [];
  var startedAt = wfFinite(detail.startedAt);
  var endedAt = wfFinite(detail.endedAt);
  var startClock = wfFormatClock(startedAt);
  var endClock = wfFormatClock(endedAt);
  var duration = startedAt !== null && startedAt > 0 && endedAt !== null && endedAt > startedAt ? endedAt - startedAt : null;
  var exitCode = report && wfFinite(report.exitCode) !== null ? Math.round(report.exitCode) : null;

  var head = h(
    "div",
    { className: "wf-step-detail-head", key: "head" },
    h("span", { className: "wf-step-detail-title", key: "title" }, say("panel.step.detailtitle", { n: detail.index + 1 })),
    h(
      "span",
      { className: "wf-step-detail-state", key: "status", "data-status": detail.status },
      say(detail.statusKey || "panel.status.pending")
    ),
    h(
      "button",
      {
        type: "button",
        className: "wf-detail-close",
        key: "close",
        "data-wf-step-close": detail.index,
        title: say("panel.step.detailclose"),
        "aria-label": say("panel.step.detailclose"),
        onClick: function () {
          if (typeof fire.onCloseStepDetail === "function") fire.onCloseStepDetail(detail.index);
        },
      },
      "×"
    )
  );

  var reportChildren = [
    h(
      "div",
      { className: "wf-detail-block-head", key: "head" },
      h("span", { className: "wf-detail-label", key: "label" }, say("panel.step.report")),
      report
        ? h("span", { className: "wf-detail-chip", key: "state", "data-state": report.status }, say(wfReportStatusKey(report)))
        : null
    ),
  ];

  if (!report) {
    reportChildren.push(h("div", { className: "wf-detail-empty", key: "empty" }, say("panel.step.noreport")));
  } else {
    reportChildren.push(
      h(
        "div",
        { className: "wf-detail-summary-text", key: "summary" },
        report.summary === "" ? say("panel.step.nosummary") : report.summary
      )
    );
    reportChildren.push(
      h(
        "div",
        { className: "wf-detail-group", key: "artifacts", "data-artifacts": artifacts.length },
        h(
          "span",
          { className: "wf-detail-sublabel", key: "label" },
          h("span", { className: "wf-detail-glyph", key: "glyph", "aria-hidden": "true" }, "▤"),
          say("panel.step.artifacts") + " · " + artifacts.length
        ),
        artifacts.length === 0
          ? h("div", { className: "wf-detail-empty", key: "none" }, say("panel.step.noartifacts"))
          : h(
              "div",
              { className: "wf-detail-rows", key: "rows" },
              artifacts.map(function (artifact, position) {
                var split = wfDetailPath(artifact);
                return h(
                  "button",
                  {
                    type: "button",
                    className: "wf-detail-file",
                    key: "artifact-" + position,
                    "data-wf-copy": split.path,
                    "data-wf-copy-label": split.base,
                    "data-copy-state": "idle",
                    title: say("panel.detail.copypath") + " — " + split.path,
                    "aria-label": say("panel.detail.copypath") + " " + split.path,
                    onClick: function (event) {
                      if (typeof fire.onCopy === "function") {
                        fire.onCopy(split.path, event && event.currentTarget ? event.currentTarget : null);
                      }
                    },
                  },
                  h("span", { className: "wf-detail-base", key: "base" }, split.base),
                  split.dir === "" ? null : h("span", { className: "wf-detail-dir", key: "dir", title: split.dir }, split.dir),
                  h("span", { className: "wf-copy-status", key: "status", "aria-live": "polite" }, "")
                );
              })
            )
      )
    );
    reportChildren.push(
      h(
        "div",
        { className: "wf-detail-meta", key: "exit" },
        h("span", { key: "exit" }, say("panel.step.exit") + " " + (exitCode === null ? "—" : String(exitCode)))
      )
    );
  }

  var reportBlock = h(
    "div",
    { className: "wf-detail-block", key: "report", "data-block": "report" },
    reportChildren
  );

  var stats = h(
    "div",
    { className: "wf-step-detail-stats", key: "stats", "data-truncated": detail.truncated > 0 ? "true" : "false" },
    h("span", { key: "tools" }, say("panel.step.tools", { count: detail.tools })),
    h("span", { key: "files" }, say("panel.step.files", { count: detail.files })),
    h("span", { key: "nodes" }, say("panel.step.nodescount", { count: detail.nodes })),
    detail.truncated > 0
      ? h("span", { className: "wf-detail-note", key: "trunc" }, say("panel.step.truncatedcount", { count: detail.truncated }))
      : null
  );

  var timing =
    startClock === "" && endClock === ""
      ? h("div", { className: "wf-detail-meta", key: "time", "data-time": "none" }, say("panel.step.unknowntime"))
      : h(
          "div",
          { className: "wf-detail-meta", key: "time", "data-time": "known" },
          h("span", { key: "start" }, say("panel.detail.started") + " " + (startClock || "—")),
          h("span", { key: "end" }, say("panel.detail.ended") + " " + (endClock || "—")),
          h(
            "span",
            { key: "duration" },
            say("panel.detail.duration") + " " + (duration === null ? "—" : wfFormatDuration(duration))
          )
        );

  return h(
    "div",
    {
      className: "wf-step-detail",
      key: "step-detail-" + detail.index,
      id: "wf-step-detail-" + detail.index,
      role: "region",
      "data-dsh-workflow-map": "step-detail",
      "data-step-index": detail.index,
      "data-plan-index": detail.planIndex === null ? undefined : detail.planIndex,
      "data-report": report ? "true" : "false",
      "data-status": detail.status,
      "aria-label": say("panel.step.detailaria", { n: detail.index + 1 }),
    },
    head,
    reportBlock,
    stats,
    timing
  );
}
