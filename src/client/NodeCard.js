/**
 * NodeCard.js — one flow node (a tool call, a skill, a file operation…) as a card.
 *
 * The card answers four questions at a glance ( §2):
 * what kind → a glyph per category (file / command / skill / subagent / other)
 * what -> "read · .md" - verb · target, not the raw tool name
 * how → subline: kind chip · tool · duration · file count
 * how did it → a status dot: running pulses, done is green, error is red
 *
 * Everything here is PURE and locale-injected: `h` (React.createElement) and `say`
 * are parameters, so tools/selftest-panel.mjs drives the exact tree the frame mounts
 * without React, a browser or a DOM.
 *
 * Inlined into client.js by tools/build-client.mjs (single-file browser half).
 */

/** Category → glyph. Text glyphs, not emoji: the panel's font stack is the harness's. */
var WF_NODE_GLYPH = {
  file: "▤",
  command: "⌘",
  skill: "✦",
  subagent: "⧉",
  tool: "⚙",
  message: "≡",
  report: "◍",
  question: "?",
  approval: "⚑",
  other: "·",
};

/** Category → the locale key of the verb shown before the target. */
var WF_NODE_VERB_KEY = {
  command: "panel.node.verb.command",
  skill: "panel.node.verb.skill",
  subagent: "panel.node.verb.subagent",
};

/** Tool name → locale key of the verb, for the file-ish tools. */
var WF_TOOL_VERB_KEY = {
  read: "panel.node.verb.read",
  write: "panel.node.verb.write",
  edit: "panel.node.verb.edit",
  glob: "panel.node.verb.glob",
  grep: "panel.node.verb.grep",
  undo_last_edit: "panel.node.verb.undo",
};

/** Tools that act on a file path, so the card can title itself with a basename. */
var WF_FILE_TOOLS = {
  read: true,
  write: true,
  edit: true,
  glob: true,
  grep: true,
  undo_last_edit: true,
};

function wfBaseName(path) {
  if (typeof path !== "string" || path === "") return "";
  var flat = path.replace(/\\/g, "/").replace(/\/+$/, "");
  var at = flat.lastIndexOf("/");
  return at === -1 ? flat : flat.slice(at + 1);
}

/** Drop a leading "tool " prefix from a host title; "" when the title IS the prefix. */
function wfStripToolPrefix(title, tool) {
  if (typeof title !== "string") return "";
  if (typeof tool !== "string" || tool === "") return title;
  if (title === tool) return "";
  if (title.indexOf(tool + " ") === 0) return title.slice(tool.length + 1);
  return title;
}

/**
 * The category the icon and the verb come from. `kind` wins for the non-tool nodes
 * (message / report / question / approval); a tool node is split by tool name so
 * `read`/`edit`/`pwsh`/`skill` are not all drawn as a generic tool.
 */
function wfNodeCategory(node) {
  var kind = node && typeof node.kind === "string" ? node.kind : "";
  var tool = node && typeof node.tool === "string" ? node.tool : "";
  if (kind === "message" || kind === "report" || kind === "question" || kind === "approval") return kind;
  if (kind === "subagent" || tool === "subagent" || tool === "subagent_fork" || tool === "workflow") {
    return "subagent";
  }
  if (WF_FILE_TOOLS[tool] === true) return "file";
  if (tool === "pwsh" || tool === "bash" || tool === "shell") return "command";
  if (tool === "skill") return "skill";
  if (kind === "tool" || tool !== "") return "tool";
  return "other";
}

/** The verb to print, or "" when the card should show the title alone. */
function wfNodeVerb(node, category, say) {
  var tool = node && typeof node.tool === "string" ? node.tool : "";
  var key = category === "file" ? WF_TOOL_VERB_KEY[tool] : WF_NODE_VERB_KEY[category];
  if (typeof key === "string" && typeof say === "function") return say(key);
 // An unknown tool keeps its own name as the verb: "plugin_manager · install_bundle…"
 // says more than a generic "tool".
  if (category === "tool" && tool !== "") return tool;
  return "";
}

/** What the verb points at: a file basename, a command, a description… */
function wfNodeTarget(node, category, verb) {
  var title = node && typeof node.title === "string" ? node.title : "";
  var detail = node && typeof node.detail === "string" ? node.detail : "";
  var path = node && typeof node.path === "string" ? node.path : "";
  var tool = node && typeof node.tool === "string" ? node.tool : "";

  if (category === "file") return wfBaseName(path) || wfStripToolPrefix(title, tool) || title || "—";
  if (category === "command") return detail || wfStripToolPrefix(title, tool) || title || "—";
  if (category === "skill") return wfStripToolPrefix(title, "skill") || detail || "—";
  if (category === "subagent") return wfStripToolPrefix(title, tool) || detail || "—";
  if (category === "tool") {
 // When the verb already IS the tool name, the target must add something: the
 // argument summary, else the title if the host gave a different one.
    var rest = wfStripToolPrefix(title, tool);
    if (rest !== "") return rest;
    if (detail !== "") return detail;
    return "—";
  }
  return title || detail || "—";
}

/**
 * The two halves of the title. A localized verb is followed by " · " only when
 * there IS a verb: a message's own text must not read "message · message".
 */
function wfNodeTitleParts(node, category, say) {
  var verb = wfNodeVerb(node, category, say);
  var target = wfNodeTarget(node, category, verb);
  return { verb: verb, target: target };
}

/**
 * The dot's state. Four values, because "no result recorded yet" is not the same
 * claim as "finished": error → red, the active node without a result → pulsing
 * blue, a node with a result → green, anything else → neutral.
 */
function wfNodeStatus(node, activeNodeId) {
  if (node && node.error === true) return "error";
  var active = typeof activeNodeId === "string" && activeNodeId !== "" && node && node.id === activeNodeId;
  if (active && node.result !== true) return "running";
  if (node && node.result === true) return "done";
  return "pending";
}

/** 8 → "8ms", 1234 → "1.2s", 83000 → "1m23s". Empty for an unknown duration. */
function wfFormatDuration(ms) {
  var value = wfFinite(ms);
  if (value === null || value <= 0) return "";
  if (value < 1000) return Math.round(value) + "ms";
  if (value < 60000) {
    var seconds = Math.round(value / 100) / 10;
    return (seconds % 1 === 0 ? String(Math.round(seconds)) : seconds.toFixed(1)) + "s";
  }
  var minutes = Math.floor(value / 60000);
  var rest = Math.round((value % 60000) / 1000);
  return minutes + "m" + rest + "s";
}

/** Event time → local "21:03:07". Empty (no invented clock) for an unusable stamp. */
function wfFormatClock(ms) {
  var value = wfFinite(ms);
  if (value === null || value <= 0) return "";
  var date = new Date(value);
  var time = date.getTime();
  if (!isFinite(time)) return "";
  return wfPad2(date.getHours()) + ":" + wfPad2(date.getMinutes()) + ":" + wfPad2(date.getSeconds());
}

/** The subline: kind chip · tool · duration · files. Empty parts are dropped. */
function wfNodeMetaBits(node, say) {
  var bits = [];
  if (node && typeof node.kindKey === "string" && node.kindKey !== "") bits.push(say(node.kindKey));
  if (node && typeof node.tool === "string" && node.tool !== "") bits.push(node.tool);
  var duration = wfFormatDuration(node ? node.durationMs : null);
  if (duration !== "") bits.push(duration);
  if (node && wfFinite(node.files) !== null && node.files > 0) bits.push(say("panel.files", { count: node.files }));
  return bits;
}
/**
 * the three round-icon categories of a branch, and their glyph + locale key.
 *
 * WHY THREE AND NOT ONE PER TOOL: the step asks for "files read / files changed / tools called", which is exactly
 * the split the host's `files[].action` labels already carry (read/write/edit/query) plus the plain tool
 * call. Deriving them from fields the host ALREADY sends means no new wire field and no host
 * round-trip: a browser-only change (F5), which is what the step promised.
 */
var WF_CHAIN_KINDS = ["read", "edit", "tool"];

var WF_CHAIN_GLYPH = {
  read: "▤",
  edit: "✎",
  tool: "⌘",
};

var WF_CHAIN_KEY = {
  read: "panel.flow.icon.read",
  edit: "panel.flow.icon.edit",
  tool: "panel.flow.icon.tool",
};

/**
 * A host file action label -> the icon category. The host writes Chinese labels (read/write/edit/query,
 * src/fold.mjs filesFor) and 's wfDetailAction reads the same four; the English spellings
 * are accepted too so a re-labelled payload does not silently lose a branch.
 */
function wfChainActionKind(action) {
  var label = typeof action === "string" ? action.trim().toLowerCase() : "";
  if (label === "读" || label === "read") return "read";
  if (label === "改" || label === "edit" || label === "修改") return "edit";
  if (label === "写" || label === "write" || label === "写入") return "edit";
  if (label === "查" || label === "glob" || label === "grep" || label === "list" || label === "query") return "read";
  return "tool";
}

/**
 * The branches a node shows: one entry per category (read / edit / tool) that has evidence, in
 * that order, each {kind, count, items:[{path, base, action}]}. PURE, and it never invents a
 * category: a `read` of three files is one branch with three items, not three branches.
 *
 * The caller decides WHEN to draw them (only the node being called), which is what keeps the
 * "finished / not started steps produce no branches" rule in one place instead of two.
 * called right now — the step is explicit that finished and not-yet-started steps produce NO
 * branches, so the caller's status decides and this function never second-guesses it.
 *
 * Items are the observations of ONE category: a file path (with its host action) or the tool name
 * itself. They are what the opened circle renders, so no new host field is needed for the detail.
 */
function wfChainBranches(node) {
  var out = [];
  if (!node || typeof node !== "object") return out;
  var tool = typeof node.tool === "string" ? node.tool : "";
  var buckets = Object.create(null);

  function slot(kind) {
    var bucket = buckets[kind];
    if (!bucket) {
      bucket = { kind: kind, count: 0, items: [], seen: Object.create(null) };
      buckets[kind] = bucket;
    }
    return bucket;
  }

  var files = Array.isArray(node.fileList) ? node.fileList : [];
  for (var i = 0; i < files.length; i += 1) {
    var file = files[i];
    if (!file || typeof file.path !== "string" || file.path === "") continue;
    var kind = wfChainActionKind(file.action);
    var bucket = slot(kind);
    if (bucket.seen[file.path] === true) continue;
    bucket.seen[file.path] = true;
    bucket.items.push({ path: file.path, base: wfBaseName(file.path), action: typeof file.action === "string" ? file.action : "" });
  }

 // The call itself is always worth a branch: "tools called" is the third category the step names.
  if (tool !== "") {
    var toolBucket = slot("tool");
    toolBucket.items.push({ path: "", base: tool, action: "" });
  }

  for (var k = 0; k < WF_CHAIN_KINDS.length; k += 1) {
    var found = buckets[WF_CHAIN_KINDS[k]];
    if (!found) continue;
    found.count = found.items.length;
    out.push(found);
  }
  return out;
}

/**
 * The two branch ends, in the icon's own coordinate space (the stroke SVG is WF_CHAIN_BRANCH wide
 * and one icon tall): from the spine at the node's edge, curving into the circle's left rim.
 *
 * A cubic with its control points pushed HORIZONTALLY (the classic S) — the same shape wfFxCurve
 * draws between the two columns, so the whole panel's curves come from one idea.
 */
/** Two decimals, the same rounding the curve layer writes into its `d`. Local on purpose: this
 * chunk is inlined BEFORE FlowEffects.js, and a helper that only exists later in the file would
 * work only through hoisting — a dependency the reader cannot see is a bug waiting to ship. */
function wfChainRound(value) {
  var n = wfFinite(value);
  return n === null ? 0 : Math.round(n * 100) / 100;
}
function wfChainStrokePath(width, height) {
  var w = wfFinite(width);
  var hh = wfFinite(height);
  if (w === null || hh === null || w <= 0 || hh <= 0) return "";
  var x1 = 0;
  var y1 = wfChainRound(hh / 2);
  var x2 = wfChainRound(w);
  var bow = wfChainRound(w * 0.55);
  return (
    "M" + x1 + " " + y1 + "C" + bow + " " + y1 + " " + wfChainRound(w - bow) + " " + y1 + " " + x2 + " " + y1
  );
}

/**
 * Round icon, one per branch category ( §4). `<circle>` in the stroke layer plus this
 * button as the glyph on top: 22 px (WF_CHAIN_ICON), the step allows 20–24.
 *
 * The click is `actions.onChainBranch(kind)`, NOT onSelectNode: the circle is not a node, it opens
 * a category view under the card (see wfRenderChainBranch).
 */
function wfRenderChainBranch(h, branch, say, actions, ctx) {
  var fire = actions || {};
  var context = ctx || {};
  var kind = branch && typeof branch.kind === "string" ? branch.kind : "tool";
  var open = context.openChain === kind;
  var count = wfFinite(branch && branch.count) === null ? 0 : branch.count;
  var label = say("panel.flow.branch", { count: count, kind: say(WF_CHAIN_KEY[kind] || WF_CHAIN_KEY.tool) });

  return h(
    "div",
    {
      className: "wf-branch-row" + (open ? " wf-branch-open" : ""),
      key: "chain-" + kind,
      "data-dsh-workflow-map": "chain-branch",
      "data-kind": kind,
      "data-count": String(count),
      "data-live": context.chainLive === true ? "true" : "false",
    },
 // The dash: the layer is an SVG so the path is a real `d` (the browser measurement reads the
 // `C` out of it), and it is pointer-events:none so it can never eat the icon's click.
    h(
      "svg",
      {
        className: "wf-branch-stroke",
        key: "stroke",
        "aria-hidden": "true",
        focusable: "false",
        "data-dsh-workflow-map": "chain-stroke",
        "data-kind": kind,
      },
      h("path", {
        className: "wf-branch-core",
        key: "d",
        d: wfChainStrokePath(WF_CHAIN_BRANCH, WF_CHAIN_ICON),
      })
    ),
    h(
      "button",
      {
        type: "button",
        className: "wf-branch-icon",
        key: "icon",
        "data-dsh-workflow-map": "chain-icon",
        "data-kind": kind,
        "aria-expanded": open ? "true" : "false",
        "aria-label": label,
        title: label,
        onClick: function () {
          if (typeof fire.onChainBranch === "function") fire.onChainBranch(kind);
        },
      },
      h("span", { className: "wf-branch-glyph", key: "glyph", "aria-hidden": "true" }, WF_CHAIN_GLYPH[kind] || WF_CHAIN_GLYPH.tool)
    ),
    h("span", { className: "wf-branch-label", key: "label" }, label)
  );
}

/**
 * The node the opened circle's detail renders. It is NOT a new renderer (the step forbids a second
 * one): it is the SAME node, narrowed to the observations of ONE category, so 's
 * wfRenderNodeDetail draws its usual blocks — head, args, file rows, result, meta — from fields
 * that already exist on the wire. Nothing is invented: the paths come from the host's fileList and
 * the args/result are the call's own.
 */
function wfChainDetailNode(node, branch) {
  var source = node && typeof node === "object" ? node : {};
  var items = branch && Array.isArray(branch.items) ? branch.items : [];
  var files = [];
  for (var i = 0; i < items.length; i += 1) {
    var item = items[i];
    if (!item || typeof item.path !== "string" || item.path === "") continue;
    files.push({ path: item.path, action: typeof item.action === "string" ? item.action : "" });
  }
  return {
    id: typeof source.id === "string" ? source.id : "",
    kind: typeof source.kind === "string" ? source.kind : "tool",
    tool: typeof source.tool === "string" ? source.tool : "",
    title: typeof source.title === "string" ? source.title : "",
    detail: typeof source.detail === "string" ? source.detail : "",
    path: typeof source.path === "string" ? source.path : "",
    argsText: typeof source.argsText === "string" ? source.argsText : "",
    resultLine: typeof source.resultLine === "string" ? source.resultLine : "",
    errorText: typeof source.errorText === "string" ? source.errorText : "",
    seq: wfFinite(source.seq),
    at: wfFinite(source.at),
    durationMs: wfFinite(source.durationMs),
    error: source.error === true,
    result: source.result === true,
    fileList: files,
  };
}

/**
 * The opened category view: the circle's own observations, rendered by wfRenderNodeDetail.
 * Rendered INSIDE the card's <li> (see wfRenderNodeCard), so the strip and its detail share one
 * disclosure region and a screen reader hears them together.
 */
function wfRenderChainDetail(h, node, branches, kind, say, actions) {
  var picked = null;
  var list = Array.isArray(branches) ? branches : [];
  for (var i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].kind === kind) {
      picked = list[i];
      break;
    }
  }
  if (!picked) return null;
  return h(
    "div",
    {
      className: "wf-branch-body",
      key: "chain-detail-" + kind,
      "data-dsh-workflow-map": "chain-detail",
      "data-kind": kind,
    },
    wfRenderNodeDetail(h, wfChainDetailNode(node, picked), say, actions, { detail: "summary" })
  );
}
/**
 * One node card. `ctx` carries `{activeNodeId, selectedNodeId}`; `actions.onSelectNode`
 * is called with the node id; opens the inline detail for the selected id, and the
 * card itself keeps its one-line summary (no popover, no second window).
 */
function wfRenderNodeCard(h, node, say, actions, ctx) {
  var context = ctx || {};
  var fire = actions || {};
  var category = wfNodeCategory(node);
  var status = wfNodeStatus(node, context.activeNodeId);
  var parts = wfNodeTitleParts(node, category, say);
  var bits = wfNodeMetaBits(node, say);
  var selected = context.selectedNodeId !== null && context.selectedNodeId === node.id;
 // "Title only": no meta line, no live chip, no inline detail. The card keeps
 // its icon/title/status so the flow is still scannable.
  var compact = context.detail === "title";

  var titleChildren = [];
  if (parts.verb !== "") {
    titleChildren.push(h("span", { className: "wf-node-verb", key: "verb" }, parts.verb));
    titleChildren.push(" · ");
  }
  titleChildren.push(h("span", { className: "wf-node-target", key: "target" }, parts.target));
 // §4: the branch strip exists ONLY under the node that is being called right now.
 // `status` already answers that question (wfNodeStatus: active && no result → running), so a
 // finished card and a not-yet-started card both render `null` here — no branch DOM at all,
 // which is what the acceptance check looks for rather than a hidden-but-present element.
  var branches = status === "running" && !compact ? wfChainBranches(node) : [];
  var branching =
    branches.length > 0
      ? h(
          "div",
          {
 // NOT "chain": that name belongs to the measured curve layer, and two elements with
 // the same anchor would make every querySelector('chain') ambiguous.
            "data-dsh-workflow-map": "chain-strip",
            key: "branching",
            "data-node-id": node.id,
            "data-count": String(branches.length),
            "data-open": typeof context.openChain === "string" ? context.openChain : "",
            role: "group",
            "aria-label": say("panel.flow.branch.aria", { count: branches.length }),
          },
          branches.map(function (branch) {
            return wfRenderChainBranch(h, branch, say, actions, context);
          }),
          context.openChain === null || typeof context.openChain !== "string"
            ? null
            : wfRenderChainDetail(h, node, branches, context.openChain, say, actions)
        )
      : null;
  return h(
    "li",
    {
      className: "wf-flow-item",
      key: "item-" + node.id,
      "data-status": status,
      "data-node-id": node.id,
    },
    h(
      "button",
      {
        type: "button",
        className: "wf-node",
        "data-dsh-workflow-map": "node",
        "data-node-id": node.id,
        "data-kind": node.kind,
        "data-category": category,
        "data-status": status,
        "data-error": node.error === true ? "true" : "false",
        "data-selected": selected ? "true" : "false",
        "data-compact": compact ? "true" : "false",
        "aria-pressed": selected ? "true" : "false",
        title: parts.verb !== "" ? parts.verb + " · " + parts.target : parts.target,
        onClick: function () {
          if (typeof fire.onSelectNode === "function") fire.onSelectNode(node.id);
        },
      },
      h("span", { className: "wf-node-icon", key: "icon", "aria-hidden": "true" }, WF_NODE_GLYPH[category] || WF_NODE_GLYPH.other),
      h(
        "span",
        { className: "wf-node-main", key: "main" },
        h("span", { className: "wf-node-title", key: "title" }, titleChildren),
        bits.length === 0 || compact
          ? null
          : h(
              "span",
              { className: "wf-node-meta", key: "meta" },
              h("span", { className: "wf-kind", key: "kind" }, bits[0]),
              bits.slice(1).map(function (bit, position) {
                return h("span", { key: "bit-" + position }, bit);
              })
            ),
 // "working ..." on the node that is being called this instant. Only the active
 // node gets it: every finished card stays quiet, so a long flow does not blink all over.
        status === "running" && !compact ? wfRenderLive(h, say, "node") : null
      ),
      h("span", {
        className: "wf-flow-status",
        key: "status",
        "data-status": status,
        "aria-hidden": "true",
        title: say(
          status === "error"
            ? "panel.status.failed"
            : status === "running"
              ? "panel.status.running"
              : status === "done"
                ? "panel.status.done"
                : "panel.node.pending"
        ),
      })
    ),
 // the selected node opens its detail INLINE, inside the same <li>, so the
 // spine dot and the card stay where the eye left them (no popover, no new window).
    selected && !compact ? wfRenderNodeDetail(h, node, say, actions, context) : null,
 // The branch strip hangs under the CARD but inside the same <li>, so the link drawn by
 // FlowColumn's channel (or the spine) still points at the cards, never at the branches.
    branching
  );
}
