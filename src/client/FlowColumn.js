/**
 * FlowColumn.js — the right column: the selected step's flow, node by node.
 *
 * Structure of the column (step-08):
 *   header   「分步流程 · 第 8 步 · 标题」 — OUTSIDE the scroller, so it never moves
 *   scroller one independently scrolling area (`overflow:auto`)
 *     strip  「更早 n 个被折叠」 + 「展开全部」 — only when the cap bites
 *     list   every item hangs off one vertical spine (the tree脊)
 *            item = ONE node card (NodeCard.js) or ONE folded run of same-tool calls
 *
 * The fold: `view.steps[i].groups` (host, step-02) is authoritative when it resolves
 * against the node list; otherwise the browser folds consecutive same-tool calls
 * itself with the same threshold (WF_GROUP_MIN = the host's GROUP_THRESHOLD). A group
 * hit by the 300-node host cap loses its missing members but never invents one.
 *
 * Branches (step-09): `wfRenderBranches` (Branches.js) draws the selected step's subagent /
 * workflow / background-job lanes under the list, from `model.flow.branches`. A lane is NOT
 * a node: the node count, the fold, the node window and the current-activity highlight all
 * ignore it — only the lane's own status dot breathes.
 *
 * The cap: by default only the NEWEST WF_FLOW_CAP nodes are drawn (the list opens at
 * its bottom); a group is never split at the boundary. 「展开全部」 lifts the cap until
 * the step changes — that reset is `wfFlowUiFor`, keyed by step index, so it is a pure
 * function and tools/selftest-panel.mjs can prove it.
 *
 * Pure: `h` and `say` are injected; no React import, no DOM.
 *
 * Inlined into client.js by tools/build-client.mjs (single-file browser half).
 */

/* ------------------------------------------------------------------------- */
/* grouping                                                                  */
/* ------------------------------------------------------------------------- */

/** Fold consecutive same-tool calls with the host's threshold. */
function wfFlowFold(nodes) {
  var runs = [];
  var run = null;
  for (var i = 0; i < nodes.length; i += 1) {
    var node = nodes[i];
    var tool = node && node.kind === "tool" && typeof node.tool === "string" ? node.tool : "";
    if (tool === "") {
      run = null;
      continue;
    }
    if (run !== null && run.tool === tool) {
      run.to = i;
      run.count = run.to - run.from + 1;
      run.lastAt = wfFinite(node.at);
      continue;
    }
    run = {
      key: tool,
      tool: tool,
      from: i,
      to: i,
      count: 1,
      firstAt: wfFinite(node.at),
      lastAt: wfFinite(node.at),
    };
    runs.push(run);
  }
  var out = [];
  for (var r = 0; r < runs.length; r += 1) {
    if (runs[r].count >= WF_GROUP_MIN) out.push(runs[r]);
  }
  return out;
}

/**
 * Group ranges over `nodes`.
 *
 * Host groups win when they resolve; a group whose first or last node did not survive
 * a cap is dropped (its remaining members still render, as individual cards). Groups
 * are sorted and must not overlap — a malformed payload can hide a fold, never a node.
 */
function wfFlowGroups(nodes, hostGroups) {
  var list = Array.isArray(nodes) ? nodes : [];
  var position = Object.create(null);
  for (var i = 0; i < list.length; i += 1) {
    if (list[i] && typeof list[i].id === "string") position[list[i].id] = i;
  }

  var out = [];
  if (Array.isArray(hostGroups)) {
    var used = Object.create(null);
    for (var g = 0; g < hostGroups.length; g += 1) {
      var group = hostGroups[g];
      if (!group || typeof group !== "object") continue;
      var from = position[String(group.firstId)];
      var to = position[String(group.lastId)];
      if (typeof from !== "number" || typeof to !== "number") continue;
      if (to - from < 1) continue;
      var clash = false;
      for (var p = from; p <= to; p += 1) {
        if (used[p] === true) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      for (p = from; p <= to; p += 1) used[p] = true;
      out.push({
        key: typeof group.key === "string" && group.key !== "" ? group.key : String(group.tool || "group"),
        tool: typeof group.tool === "string" ? group.tool : "",
        from: from,
        to: to,
        count: to - from + 1,
        firstAt: wfFinite(group.firstAt),
        lastAt: wfFinite(group.lastAt),
      });
    }
  }
  if (out.length === 0) out = wfFlowFold(list);
  out.sort(function (a, b) {
    return a.from - b.from;
  });
  return out;
}

/**
 * A flat item list: one entry per rendered row. A group carries its member nodes so
 * the renderer never re-derives the range (and the window can count it as N nodes).
 */
function wfFlowItems(nodes, groups) {
  var list = Array.isArray(nodes) ? nodes : [];
  var byStart = Object.create(null);
  var folds = Array.isArray(groups) ? groups : [];
  for (var g = 0; g < folds.length; g += 1) {
    var fold = folds[g];
    if (!fold || typeof fold.from !== "number" || typeof fold.to !== "number") continue;
    if (fold.from < 0 || fold.to >= list.length || fold.to < fold.from) continue;
    byStart[fold.from] = fold;
  }

  var items = [];
  var p = 0;
  while (p < list.length) {
    var group = byStart[p];
    if (group) {
      var members = list.slice(group.from, group.to + 1);
      items.push({
        type: "group",
        key: group.key,
        tool: group.tool,
        from: group.from,
        to: group.to,
        count: members.length,
        firstAt: group.firstAt,
        lastAt: group.lastAt,
        nodes: members,
      });
      p = group.to + 1;
    } else {
      items.push({ type: "node", node: list[p] });
      p += 1;
    }
  }
  return items;
}

/* ------------------------------------------------------------------------- */
/* the cap                                                                   */
/* ------------------------------------------------------------------------- */

function wfFlowItemSize(item) {
  return item && item.type === "group" ? item.count : 1;
}

function wfFlowNodeCount(items) {
  var total = 0;
  for (var i = 0; i < (items ? items.length : 0); i += 1) total += wfFlowItemSize(items[i]);
  return total;
}

/**
 * Which items the column draws, and how many nodes that hides.
 *
 * The walk starts at the NEWEST item and takes whole items until adding the next one
 * would pass `cap`. A group is atomic: a run of 40 calls counts as 40 and is never cut
 * in half, so the visible node count can exceed the cap by at most (group size - 1).
 */
function wfFlowWindow(items, cap, showAll) {
  var list = Array.isArray(items) ? items : [];
  var limit = wfFinite(cap) === null ? WF_FLOW_CAP : Math.max(1, Math.round(cap));
  var total = wfFlowNodeCount(list);
  if (showAll === true || total <= limit) return { items: list, hiddenNodes: 0, hiddenItems: 0, capped: false };

  var acc = 0;
  var start = list.length;
  for (var i = list.length - 1; i >= 0; i -= 1) {
    var size = wfFlowItemSize(list[i]);
    if (acc > 0 && acc + size > limit) break;
    acc += size;
    start = i;
    if (acc >= limit) break;
  }
  return { items: list.slice(start), hiddenNodes: total - acc, hiddenItems: start, capped: start > 0 };
}

/* ------------------------------------------------------------------------- */
/* per-step UI state (expanded groups · show-all · selected node)            */
/* ------------------------------------------------------------------------- */

function wfFlowEmptyUi(stepIndex) {
  return {
    stepIndex: stepIndex,
    expanded: [],
    showAll: false,
    selectedNode: null,
    closedBranches: [],
    // step-05: which round branch icon is open under the running node (null = none). It is per
    // step, like everything else here, so switching steps closes it instead of leaving a detail
    // hanging under a card the user did not click.
    openChain: null,
  };
}

/**
 * Read the UI state AS IT APPLIES to `stepIndex`. A state from another step is not
 * "merged" or reused: switching steps starts from the defaults, which is exactly the
 * `收起 + 展开全部失效 + 选中清空` reset the step asks for (and it happens on the
 * first render of the new step, not one frame later).
 */
function wfFlowUiFor(ui, stepIndex) {
  var index = wfFinite(stepIndex) === null ? 0 : Math.round(stepIndex);
  if (!ui || typeof ui !== "object" || wfFinite(ui.stepIndex) === null || Math.round(ui.stepIndex) !== index) {
    return wfFlowEmptyUi(index);
  }
  var expanded = [];
  if (Array.isArray(ui.expanded)) {
    for (var i = 0; i < ui.expanded.length; i += 1) {
      if (typeof ui.expanded[i] === "string" && expanded.indexOf(ui.expanded[i]) === -1) expanded.push(ui.expanded[i]);
    }
  }
  // Branch lanes are open by default (their whole point is to show the parallel work),
  // so the remembered list is the FOLDED ones. Both lists are per step and reset together.
  var closedBranches = [];
  if (Array.isArray(ui.closedBranches)) {
    for (var c = 0; c < ui.closedBranches.length; c += 1) {
      if (typeof ui.closedBranches[c] === "string" && closedBranches.indexOf(ui.closedBranches[c]) === -1) {
        closedBranches.push(ui.closedBranches[c]);
      }
    }
  }
  return {
    stepIndex: index,
    expanded: expanded,
    showAll: ui.showAll === true,
    selectedNode: typeof ui.selectedNode === "string" && ui.selectedNode !== "" ? ui.selectedNode : null,
    closedBranches: closedBranches,
    // A category name, never an arbitrary string: anything else collapses to null, so a hand-edited
    // state cannot open a detail block that has no branch behind it.
    openChain: WF_CHAIN_KINDS.indexOf(ui.openChain) >= 0 ? ui.openChain : null,
  };
}

function wfFlowToggleGroup(ui, stepIndex, key) {
  var base = wfFlowUiFor(ui, stepIndex);
  if (typeof key !== "string" || key === "") return base;
  var expanded = base.expanded.slice();
  var at = expanded.indexOf(key);
  if (at >= 0) expanded.splice(at, 1);
  else expanded.push(key);
  return {
    stepIndex: base.stepIndex,
    expanded: expanded,
    showAll: base.showAll,
    selectedNode: base.selectedNode,
    closedBranches: base.closedBranches,
    openChain: base.openChain,
  };
}

function wfFlowExpandAll(ui, stepIndex) {
  var base = wfFlowUiFor(ui, stepIndex);
  return {
    stepIndex: base.stepIndex,
    expanded: base.expanded,
    showAll: true,
    selectedNode: base.selectedNode,
    closedBranches: base.closedBranches,
    openChain: base.openChain,
  };
}

function wfFlowSelectNode(ui, stepIndex, nodeId) {
  var base = wfFlowUiFor(ui, stepIndex);
  var next = typeof nodeId === "string" && nodeId !== "" ? nodeId : null;
  return {
    stepIndex: base.stepIndex,
    expanded: base.expanded,
    showAll: base.showAll,
    selectedNode: base.selectedNode === next ? null : next,
    closedBranches: base.closedBranches,
    openChain: base.openChain,
  };
}
/** Hide the selected node's detail (Escape). Keeps groups / the cap where they are. */
function wfFlowClearSelection(ui, stepIndex) {
  var base = wfFlowUiFor(ui, stepIndex);
  return {
    stepIndex: base.stepIndex,
    expanded: base.expanded,
    showAll: base.showAll,
    selectedNode: null,
    closedBranches: base.closedBranches,
    // Escape closes the branch detail too: it is the same "put the flow back" gesture.
    openChain: null,
  };
}

/** Fold / unfold one branch lane. The click target is the lane's HEAD (step-09 §5). */
function wfFlowToggleBranch(ui, stepIndex, branchId) {
  var base = wfFlowUiFor(ui, stepIndex);
  if (typeof branchId !== "string" || branchId === "") return base;
  var closed = base.closedBranches.slice();
  var at = closed.indexOf(branchId);
  if (at >= 0) closed.splice(at, 1);
  else closed.push(branchId);
  return {
    stepIndex: base.stepIndex,
    expanded: base.expanded,
    showAll: base.showAll,
    selectedNode: base.selectedNode,
    closedBranches: closed,
    openChain: base.openChain,
  };
}

function wfFlowIsExpanded(state, key) {
  return !!state && Array.isArray(state.expanded) && state.expanded.indexOf(key) >= 0;
}

/**
 * step-05 · open / close one round branch icon's detail. `kind` is one of WF_CHAIN_KINDS; clicking
 * the same circle again closes it (a toggle, like every other disclosure in the panel), and an
 * unknown kind is a no-op rather than an error.
 */
function wfFlowToggleChain(state, kind) {
  if (WF_CHAIN_KINDS.indexOf(kind) < 0) return state;
  var base = wfFlowUiFor(state, state ? state.stepIndex : 0);
  return {
    stepIndex: base.stepIndex,
    expanded: base.expanded,
    showAll: base.showAll,
    selectedNode: base.selectedNode,
    closedBranches: base.closedBranches,
    openChain: base.openChain === kind ? null : kind,
  };
}

/* ------------------------------------------------------------------------- */
/* rendering                                                                 */
/* ------------------------------------------------------------------------- */

/** A folded run's dot: error beats running beats pending beats done. */
function wfFlowGroupStatus(item, activeNodeId) {
  var status = "done";
  var members = item && Array.isArray(item.nodes) ? item.nodes : [];
  for (var i = 0; i < members.length; i += 1) {
    var one = wfNodeStatus(members[i], activeNodeId);
    if (one === "error") return "error";
    if (one === "running") status = "running";
    else if (one === "pending" && status === "done") status = "pending";
  }
  return status;
}

function wfRenderFlowGroup(h, item, state, say, actions, ctx) {
  var fire = actions || {};
  var reopened = wfFlowIsExpanded(state, item.key);
  var members = Array.isArray(item.nodes) ? item.nodes : [];
  var first = wfFormatClock(item.firstAt);
  var last = wfFormatClock(item.lastAt);
  var range = first === "" && last === "" ? "" : say("panel.flow.range", { first: first, last: last });
  var category = members.length > 0 && members.every(function (node) {
    return wfNodeCategory(node) === wfNodeCategory(members[0]);
  })
    ? wfNodeCategory(members[0])
    : "tool";

  // step-02: the disclosure triangle is a real <button>, a SIBLING of the row button
  // (a button inside a button is invalid HTML). The wrapper is a one-column grid, so the
  // triangle and the row share cell 1/1 and the whole 20 px band down the row is clickable.
  var headRow = h(
    "div",
    { className: "wf-group-row", key: "row" },
    wfTri(h, reopened, function () {
      if (typeof fire.onToggleGroup === "function") fire.onToggleGroup(item.key);
    }, {
      key: "tri",
      data: "group-tri",
      label: say(reopened ? "panel.flow.collapseGroup" : "panel.flow.expandGroup"),
      controls: "wf-group-body-" + item.key + "-" + item.from,
    }),
    h(
      "button",
      {
        type: "button",
        className: "wf-group-head",
        "data-dsh-workflow-map": "group",
        "data-group-key": item.key,
        "aria-expanded": reopened ? "true" : "false",
        // Mirrored on the head too: the head is the element carrying
        // data-dsh-workflow-map="group", so a selector or a test sees the state here.
        "data-expanded": reopened ? "true" : "false",
        title: say(reopened ? "panel.flow.collapseGroup" : "panel.flow.expandGroup"),
        onClick: function () {
          if (typeof fire.onToggleGroup === "function") fire.onToggleGroup(item.key);
        },
      },
      h("span", { className: "wf-node-icon", key: "icon", "aria-hidden": "true" }, WF_NODE_GLYPH[category] || WF_NODE_GLYPH.other),
      h(
        "span",
        { className: "wf-group-main", key: "main" },
        h(
          "span",
          { className: "wf-group-label", key: "label" },
          say("panel.flow.group", { count: item.count, tool: item.tool || say("panel.kind.other") })
        ),
        range === "" ? null : h("span", { className: "wf-group-meta", key: "range" }, range)
      )
    )
  );

  return h(
    "li",
    {
      className: "wf-flow-item wf-group",
      key: "group-" + item.key + "-" + item.from,
      "data-status": wfFlowGroupStatus(item, ctx.activeNodeId),
      "data-group-key": item.key,
      "data-expanded": reopened ? "true" : "false",
      "data-group-count": item.count,
    },
    headRow,
    reopened
      ? h(
          "ul",
          {
            className: "wf-group-body",
            key: "body",
            id: "wf-group-body-" + item.key + "-" + item.from,
            role: "list",
          },
          members.map(function (node) {
            return wfRenderNodeCard(h, node, say, actions, ctx);
          })
        )
      : null
  );
}

/**
 * The whole right column. `ui` is the flow UI state (see wfFlowUiFor); it is passed
 * raw so a state from the previous step cannot leak into this one.
 */
function wfRenderFlowColumn(h, model, say, actions, ui) {
  var flow = model && model.flow && typeof model.flow === "object" ? model.flow : null;
  var nodes = flow && Array.isArray(flow.nodes) ? flow.nodes : [];
  var stepIndex = model && wfFinite(model.selected) !== null ? Math.round(model.selected) : 0;
  var state = wfFlowUiFor(ui, stepIndex);
  var items = wfFlowItems(nodes, wfFlowGroups(nodes, flow ? flow.groups : null));
  // step-12: the node window is a display pref (30 / 60 / 120 / all). 0 means all,
  // and 「展开全部」 still lifts any finite cap for this step.
  var cap = model && model.settings && wfFinite(model.settings.nodeLimit) !== null
    ? Math.max(0, Math.round(model.settings.nodeLimit))
    : WF_FLOW_CAP;
  var view = wfFlowWindow(items, cap, state.showAll || cap === 0);
  var total = flow && wfFinite(flow.stepNodeTotal) !== null ? flow.stepNodeTotal : wfFlowNodeCount(items);
  var truncated = flow && wfFinite(flow.truncated) !== null && flow.truncated > 0 ? flow.truncated : 0;
  var ctx = {
    activeNodeId: flow && typeof flow.activeNodeId === "string" ? flow.activeNodeId : null,
    selectedNodeId: state.selectedNode,
    detail: model && model.settings && model.settings.detail === "title" ? "title" : "summary",
    // step-05: which branch category the user opened under the running node, and whether that
    // strip is allowed to animate. `chainLive` is the same `running` flag the living layer uses,
    // so an idle session freezes the dashes with everything else (CSS pauses them).
    openChain: state.openChain,
    chainLive: !!(model && model.running === true),
  };

  var header = h(
    "div",
    { className: "wf-col-h wf-flow-h", key: "h", "data-dsh-workflow-map": "flow-head" },
    h("span", { key: "label" }, say("panel.flow")),
    h(
      "span",
      { className: "wf-col-sub", key: "step", title: flow ? flow.stepTitle : "" },
      say("panel.flow.step", { n: stepIndex + 1, title: (flow && flow.stepTitle) || "—" })
    ),
    h("span", { className: "wf-count", key: "count" }, say("panel.nodes", { count: total }))
  );

  // The strip is a SIBLING of the scroller: pinned under the header, so 「展开全部」
  // stays reachable exactly while the list is open at its bottom. It also carries
  // the host-cap note, which 「展开全部」 CANNOT undo (those nodes were never sent).
  var stripText = view.hiddenNodes > 0 ? say("panel.flow.more", { count: view.hiddenNodes }) : "";
  if (truncated > 0) stripText = stripText === "" ? say("panel.truncated", { count: truncated }) : stripText + " · " + say("panel.truncated", { count: truncated });
  var more =
    view.hiddenNodes > 0 || truncated > 0
      ? h(
          "div",
          { className: "wf-flow-more", key: "more", "data-dsh-workflow-map": "flow-more" },
          h("span", { key: "text" }, stripText),
          view.hiddenNodes > 0
            ? h(
                "button",
                {
                  type: "button",
                  className: "wf-link",
                  key: "all",
                  onClick: function () {
                    if (typeof (actions || {}).onShowAll === "function") actions.onShowAll();
                  },
                },
                say("panel.flow.showAll")
              )
            : null
        )
      : null;

  var body;
  if (nodes.length === 0) {
    body = h("div", { className: "wf-empty", key: "empty" }, say("panel.flow.empty"));
  } else {
    body = h(
      "ul",
      {
        className: "wf-flow-list",
        key: "list",
        role: "list",
        "data-empty": "false",
        "data-truncated": truncated > 0 ? "true" : "false",
        "data-items": view.items.length,
        // step-05: the chain layer is a child of the LIST (so its user space is the list's box and
        // its links follow the cards on every scroll/resize — FlowEffects measures it) and it is
        // FIRST, so it paints under the cards instead of over their text.
        "data-chain": "curve",
      },
      wfRenderChain(h),
      view.items.map(function (item, position) {
        if (item.type === "group") return wfRenderFlowGroup(h, item, state, say, actions, ctx);
        return wfRenderNodeCard(h, item.node, say, actions, ctx);
      })
    );
  }

  return h(
    "div",
    {
      className: "wf-col wf-col-flow wf-flow",
      key: "right",
      "data-dsh-workflow-map": "flow",
      "data-capped": view.capped ? "true" : "false",
      "data-show-all": state.showAll ? "true" : "false",
      "data-step-index": stepIndex,
    },
    header,
    more,
    h(
      "div",
      { className: "wf-scroll wf-flow-scroll", key: "list", "data-dsh-workflow-map": "flow-scroll" },
      body,
      // Branch lanes (Branches.js) hang off the same track AFTER the nodes: they are
      // parallel work, not part of the step's own sequence. NULL when nothing runs in
      // parallel, so a plain session renders no branch shell at all.
      wfRenderBranches(h, model, say, actions, state),
    )
  );
}
