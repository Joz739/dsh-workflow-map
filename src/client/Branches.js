/**
 * Branches.js — the parallel lanes beside a step's flow.
 *
 * What a lane is: a subagent, a workflow run or a background job started by this plan
 * step. Its activity runs IN PARALLEL with the step, so it is drawn as a branch off the
 * main flow track instead of being mixed into the node list:
 *
 * main track (FlowColumn) lane (this file)
 * ─ ● read · a.js ┌ ⧉ subagent · review the fold module ●
 * ─ ● edit · b.js ──────6px─┤ ▸ subagent started 21:03:07
 * ─ ● command · npm test │ ▪ done 21:04:12
 * └ (click the head to fold the lane)
 *
 * The lane data comes from `view.branches` (src/fold.mjs): branches NEVER enter
 * `state.nodes`, so the main flow's node count, its same-tool groups, both caps and the
 * "current activity" highlight are untouched by them. A lane therefore has its OWN status
 * dot — a running lane breathes, it does not flash as the session's current node.
 *
 * Pure: `h` and `say` are injected, no React import, no DOM. Inlined into client.js by
 * tools/build-client.mjs.
 */

/**
 * One hue per lane (index into this list), so two adjacent lanes never read as one.
 * Deliberately not kind-based: the badge text already says subagent / workflow / background job.
 */
var WF_BRANCH_HUES = [268, 196, 152, 32, 340, 224];

/** Glyph per lane row kind (the row kinds fold.mjs writes). */
var WF_BRANCH_ROW_GLYPH = {
  start: "▸",
  end: "▪",
  phase: "◈",
  agent: "⧉",
  job: "⏱",
  tool: "⚙",
};

/** Lane ordinal → hue. Pure and total: any index, including a negative or missing one. */
function wfBranchHue(index) {
  var value = wfFinite(index);
  var slot = value === null ? 0 : Math.abs(Math.round(value)) % WF_BRANCH_HUES.length;
  return WF_BRANCH_HUES[slot];
}

/** Lane status → the four-state vocabulary the rest of the panel uses. */
function wfBranchStatus(branch) {
  var status = branch && typeof branch.status === "string" ? branch.status : "running";
  if (status === "failed") return "error";
  if (status === "done") return "done";
  return "running";
}

/** Lane kind -> the locale key of its badge (subagent / workflow / background job). */
function wfBranchBadgeKey(kind) {
  if (kind === "workflow") return "panel.branch.workflow";
  if (kind === "job") return "panel.branch.job";
  return "panel.branch.subagent";
}

/** Lane row status → dot state. A phase heading has no dot at all (it is not work). */
function wfBranchRowStatus(node) {
  var status = node && typeof node.status === "string" ? node.status : "";
  if (status === "failed") return "error";
  if (status === "done") return "done";
  if (status === "running") return "running";
  return "pending";
}

/**
 * Is the lane folded? The per-step UI state keeps `closedBranches` (lanes open by
 * default — the point of a lane is to show the parallel work), so this is a pure read.
 */
function wfBranchIsCollapsed(state, branchId) {
  if (!state || !Array.isArray(state.closedBranches) || typeof branchId !== "string") return false;
  return state.closedBranches.indexOf(branchId) >= 0;
}

/**
 * One activity row. It is a BUTTON because mounts the same detail view for any
 * row; until then the click only reports the id through `actions.onSelectNode`.
 */
function wfRenderBranchRow(h, node, say, actions, ctx) {
  var fire = actions || {};
  var context = ctx || {};
  var status = wfBranchRowStatus(node);
  var selected = context.selectedNodeId !== null && context.selectedNodeId === node.id;
  var detail = node && typeof node.detail === "string" ? node.detail : "";

  return h(
    "li",
    {
      className: "wf-branch-row",
      key: "row-" + node.id,
      "data-status": status,
      "data-node-id": node.id,
    },
    h(
      "button",
      {
        type: "button",
        className: "wf-branch-node",
        "data-dsh-workflow-map": "branch-node",
        "data-node-id": node.id,
        "data-kind": node.kind,
        "data-status": status,
        "data-selected": selected ? "true" : "false",
        "aria-pressed": selected ? "true" : "false",
        title: detail === "" ? node.title : node.title + " — " + detail,
        onClick: function () {
          if (typeof fire.onSelectNode === "function") fire.onSelectNode(node.id);
        },
      },
      h("span", { className: "wf-branch-glyph", key: "glyph", "aria-hidden": "true" }, WF_BRANCH_ROW_GLYPH[node.kind] || "·"),
      h(
        "span",
        { className: "wf-branch-row-main", key: "main" },
        h("span", { className: "wf-branch-row-title", key: "title" }, node.title || "—"),
        detail === "" ? null : h("span", { className: "wf-branch-row-detail", key: "detail" }, detail),
      ),
      h("span", { className: "wf-branch-clock", key: "clock" }, wfFormatClock(node.at)),
      h("span", { className: "wf-flow-status", key: "dot", "data-status": status, "aria-hidden": "true" }),
    ),
  );
}

/**
 * One lane: the coloured 6 px connector from the main track, the head (badge · label ·
 * count · status dot · caret) and the body. Folding is per lane and remembered for the
 * SELECTED step only (see wfFlowUiFor), exactly like a folded group.
 */
function wfRenderBranch(h, branch, index, flowState, say, actions, ctx) {
  var fire = actions || {};
  var hue = wfBranchHue(index);
  var status = wfBranchStatus(branch);
  var collapsed = wfBranchIsCollapsed(flowState, branch.id);
  var nodes = Array.isArray(branch.nodes) ? branch.nodes : [];
  var count = wfFinite(branch.count) === null ? nodes.length : branch.count;
  var truncated = wfFinite(branch.truncated) === null ? Math.max(0, count - nodes.length) : branch.truncated;
  var label = typeof branch.label === "string" && branch.label !== "" ? branch.label : "—";

  var rows = [];
  if (!collapsed) {
    if (truncated > 0) {
      rows.push(h("li", { className: "wf-branch-trunc", key: "trunc" }, say("panel.branch.truncated", { count: truncated })));
    }
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (node.kind === "phase") {
        rows.push(h("li", { className: "wf-branch-phase", key: "phase-" + node.id }, node.title));
      } else {
        rows.push(wfRenderBranchRow(h, node, say, actions, ctx));
      }
    }
  }

  return h(
    "div",
    {
      className: "wf-branch",
      key: "branch-" + branch.id,
 // Concrete colours, not a CSS colour function: the panel must not depend on the
 // Electron build supporting the space-separated hsl syntax.
      style: {
        "--wf-branch-h": String(hue),
        "--wf-branch-line": `hsl(${hue}, 78%, 62%)`,
        "--wf-branch-dim": `hsla(${hue}, 70%, 50%, .5)`,
        "--wf-branch-text": `hsl(${hue}, 74%, 74%)`,
      },
      "data-dsh-workflow-map": "branch",
      "data-branch-id": branch.id,
      "data-kind": branch.kind,
      "data-status": status,
      "data-expanded": collapsed ? "false" : "true",
      "data-hue": hue,
    },
    h("span", { className: "wf-branch-link", key: "link", "aria-hidden": "true" }),
    h(
      "div",
      { className: "wf-branch-card", key: "card" },
      h(
        "button",
        {
          type: "button",
          className: "wf-branch-head",
          "data-dsh-workflow-map": "branch-head",
          "data-branch-id": branch.id,
          "aria-expanded": collapsed ? "false" : "true",
 // Mirrored on the card (data-expanded) as well, so a test can read either.
          title: say(collapsed ? "panel.branch.expand" : "panel.branch.collapse"),
          onClick: function () {
            if (typeof fire.onToggleBranch === "function") fire.onToggleBranch(branch.id);
          },
        },
        h("span", { className: "wf-branch-badge", key: "badge" }, say(wfBranchBadgeKey(branch.kind))),
        h("span", { className: "wf-branch-label", key: "label" }, label),
        h("span", { className: "wf-branch-meta", key: "meta" }, say("panel.branch.nodes", { count: count })),
        h("span", { className: "wf-branch-dot", key: "dot", "data-status": status, "aria-hidden": "true" }),
        h("span", { className: "wf-branch-caret", key: "caret", "aria-hidden": "true" }, "▶"),
      ),
      collapsed ? null : h("ul", { className: "wf-branch-body", key: "body", role: "list" }, rows),
    ),
  );
}

/**
 * The whole branch area for the selected step, or NULL when nothing runs in parallel —
 * the acceptance asks for NO shell at all in a session without subagents, not an empty
 * placeholder (an empty box would read as "a branch exists but is empty").
 */
function wfRenderBranches(h, model, say, actions, flowState) {
  var flow = model && model.flow && typeof model.flow === "object" ? model.flow : null;
  var branches = flow && Array.isArray(flow.branches) ? flow.branches : [];
  if (branches.length === 0) return null;

  var hidden = flow && wfFinite(flow.hiddenBranches) !== null ? Math.max(0, flow.hiddenBranches) : 0;
  var dropped = flow && wfFinite(flow.branchDropped) !== null ? Math.max(0, flow.branchDropped) : 0;
  var ctx = {
    selectedNodeId:
      flowState && typeof flowState.selectedNode === "string" && flowState.selectedNode !== "" ? flowState.selectedNode : null,
  };

  var notes = [];
  if (hidden > 0) notes.push(say("panel.branch.more", { count: hidden }));
  if (dropped > 0) notes.push(say("panel.branch.dropped", { count: dropped }));

  return h(
    "div",
    { className: "wf-branches", key: "branches", "data-dsh-workflow-map": "branches", "data-branch-count": branches.length },
    h(
      "div",
      { className: "wf-branches-h", key: "head" },
      h("span", { key: "label" }, say("panel.branch")),
      h("span", { className: "wf-count", key: "count" }, String(branches.length)),
    ),
    branches.map(function (branch, index) {
      return wfRenderBranch(h, branch, index, flowState, say, actions, ctx);
    }),
    notes.length === 0 ? null : h("div", { className: "wf-branch-more", key: "more" }, notes.join(" · ")),
  );
}
