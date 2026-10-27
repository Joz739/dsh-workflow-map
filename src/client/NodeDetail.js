/**
 * NodeDetail.js — 「这个节点到底干了什么」, inline under the selected node card.
 *
 * The card (NodeCard.js) answers what / how / how did it in one line; a click expands
 * this block, which is the only place the panel shows:
 *   head     tool name · category chip (file / command / skill / subagent / CAD / other) · status
 *   args     the host's argsText digest (≤ ARGS_CAP, monospace, pre-wrap) — a single-line
 *            preview plus a <details> that opens the whole stored text
 *   files    grouped by action: 读取 📖 / 修改 ✏️ / 写入 💾 / 查询 🔎; each row copies the path
 *   result   the first line; on an error the stored error text is shown in full
 *   meta     start clock · duration ms · event seq
 *
 * PRIVACY (step-11 §3): the panel never shows file CONTENT. That is structural, not a
 * promise: the host's fold drops `content` / `old_str` / `new_str` when it builds argsText
 * (src/fold.mjs argsDigest), and store.js copies node fields through an explicit whitelist —
 * so a body can neither reach this renderer nor be printed by it. tools/selftest-detail.mjs
 * feeds a node that still carries `content` and asserts the marker never reaches the tree.
 *
 * The copy helpers live here too, because every copy affordance on this panel copies either
 * a path (this file) or a step artifact (StepDetail.js): one implementation, one fallback.
 *
 * Pure: `h` and `say` are injected; no React import, no DOM at module scope. The three DOM
 * functions at the bottom (copy / Escape / layout nudge) take their document and window as
 * parameters so a Node self-test can drive them without a browser.
 *
 * Inlined into client.js by tools/build-client.mjs (single-file browser half).
 */

/** Host-side bound: src/fold.mjs ARGS_LIMIT. The detail can never show more than this. */
var WF_DETAIL_ARGS_CAP = 200;

/** How much of argsText the collapsed preview keeps (the rest is one click away). */
var WF_DETAIL_PREVIEW = 110;

/** Category → chip label key. `cad` is a detail-only split: the CAD tools are tools too. */
var WF_DETAIL_CATEGORY_KEY = {
  file: "panel.detail.category.file",
  command: "panel.detail.category.command",
  skill: "panel.detail.category.skill",
  subagent: "panel.detail.category.subagent",
  cad: "panel.detail.category.cad",
  tool: "panel.detail.category.other",
  message: "panel.kind.message",
  report: "panel.kind.report",
  question: "panel.kind.question",
  approval: "panel.kind.approval",
  other: "panel.detail.category.other",
};

/** Category → glyph. Same text-glyph family as NodeCard (no emoji in the head). */
var WF_DETAIL_GLYPH = {
  file: "▤",
  command: "⌘",
  skill: "✦",
  subagent: "⧉",
  cad: "◈",
  tool: "⚙",
  message: "≡",
  report: "◍",
  question: "?",
  approval: "⚑",
  other: "·",
};

/** File-action groups, in the order the step asked for, with their own glyph + label. */
var WF_DETAIL_ACTIONS = [
  { action: "read", glyph: "📖", key: "panel.detail.action.read" },
  { action: "edit", glyph: "✏️", key: "panel.detail.action.edit" },
  { action: "write", glyph: "💾", key: "panel.detail.action.write" },
  { action: "query", glyph: "🔎", key: "panel.detail.action.query" },
  { action: "other", glyph: "▤", key: "panel.detail.action.other" },
];

/**
 * The category used by THIS block. It starts from NodeCard's split (so the two views
 * cannot disagree) and only adds the one bucket the card does not have: CAD tools.
 */
function wfDetailCategory(node) {
  var tool = node && typeof node.tool === "string" ? node.tool.toLowerCase() : "";
  if (tool === "cad" || tool.indexOf("cad_") === 0 || tool.indexOf("cadflow_") === 0 || tool.indexOf("dsh_cad_") === 0) {
    return "cad";
  }
  return wfNodeCategory(node);
}

/** Normalise a host action label to the five groups above. Unknown → "other". */
function wfDetailAction(action) {
  var label = typeof action === "string" ? action.trim().toLowerCase() : "";
  if (label === "读" || label === "read") return "read";
  if (label === "改" || label === "edit" || label === "修改") return "edit";
  if (label === "写" || label === "write" || label === "写入") return "write";
  if (label === "查" || label === "glob" || label === "grep" || label === "list" || label === "query") return "query";
  return "other";
}

/** "D:\\proj\\src\\client\\NodeDetail.js" → {base:"NodeDetail.js", dir:"D:/proj/src/client"}. */
function wfDetailPath(path) {
  var raw = typeof path === "string" ? path : "";
  var flat = raw.replace(/\\/g, "/").replace(/\/+$/, "");
  var at = flat.lastIndexOf("/");
  return {
    path: raw,
    base: at === -1 ? flat : flat.slice(at + 1),
    dir: at === -1 ? "" : flat.slice(0, at),
  };
}

/**
 * File rows grouped by action, first occurrence of a path winning within its group.
 * A node with no files yields [] — the renderer prints 「未涉及文件」 itself.
 */
function wfDetailFileGroups(node) {
  var list = node && Array.isArray(node.fileList) ? node.fileList : [];
  var groups = [];
  var byAction = Object.create(null);
  for (var i = 0; i < list.length; i += 1) {
    var entry = list[i];
    if (!entry || typeof entry.path !== "string" || entry.path === "") continue;
    var action = wfDetailAction(entry.action);
    var group = byAction[action];
    if (!group) {
      group = { action: action, files: [], seen: Object.create(null) };
      byAction[action] = group;
      groups.push(group);
    }
    if (group.seen[entry.path] === true) continue;
    group.seen[entry.path] = true;
    var split = wfDetailPath(entry.path);
    group.files.push({ path: split.path, base: split.base, dir: split.dir });
  }
  var out = [];
  for (var a = 0; a < WF_DETAIL_ACTIONS.length; a += 1) {
    var found = byAction[WF_DETAIL_ACTIONS[a].action];
    if (found) out.push({ action: found.action, glyph: WF_DETAIL_ACTIONS[a].glyph, key: WF_DETAIL_ACTIONS[a].key, files: found.files });
  }
  return out;
}

/** The node's own status for the head chip: the host's error flag wins over everything. */
function wfDetailStatus(node) {
  if (node && node.error === true) return "error";
  if (node && node.result === true) return "done";
  return "pending";
}

/** The args text this detail may show: the stored digest, bounded again at the host cap. */
function wfDetailArgsText(node) {
  var raw = node && typeof node.argsText === "string" ? node.argsText : "";
  return raw.length > WF_DETAIL_ARGS_CAP ? raw.slice(0, WF_DETAIL_ARGS_CAP) : raw;
}

/**
 * One copy control. PURE: the click calls `actions.onCopy(text, element)`, and the element
 * is what the panel's feedback routine repaints for 1.5 s. `data-wf-copy` carries the exact
 * text, so the tree itself can be asserted without a clipboard.
 */
function wfRenderCopyButton(h, text, say, actions, className, labelKey, titleKey) {
  var fire = actions || {};
  var label = say(labelKey);
  return h(
    "button",
    {
      type: "button",
      className: className,
      key: "copy-" + (titleKey || labelKey),
      "data-wf-copy": text,
      "data-wf-copy-label": label,
      "data-copy-state": "idle",
      title: say(titleKey || labelKey) + " — " + text,
      "aria-label": say(titleKey || labelKey),
      onClick: function (event) {
        if (typeof fire.onCopy === "function") {
          var element = event && event.currentTarget ? event.currentTarget : null;
          fire.onCopy(text, element);
        }
      },
    },
    // Two spans, never a bare text node: the 1.5 s 「已复制」 repaints the status span only,
    // so a file row keeps its basename + directory (a textContent write would erase them and
    // React would not restore children it thinks are unchanged).
    h("span", { className: "wf-copy-label", key: "label" }, label),
    h("span", { className: "wf-copy-status", key: "status", "aria-live": "polite" }, "")
  );
}

function wfRenderFileRows(h, group, say, actions) {
  return h(
    "div",
    { className: "wf-detail-group", key: "group-" + group.action, "data-action": group.action },
    h(
      "span",
      { className: "wf-detail-sublabel", key: "label" },
      h("span", { className: "wf-detail-glyph", key: "glyph", "aria-hidden": "true" }, group.glyph),
      say(group.key) + " · " + group.files.length
    ),
    h(
      "div",
      { className: "wf-detail-rows", key: "rows" },
      group.files.map(function (file, position) {
        // The whole row is the copy button: basename in the foreground, directory grey.
        return h(
          "button",
          {
            type: "button",
            className: "wf-detail-file",
            key: "file-" + group.action + "-" + position,
            "data-wf-copy": file.path,
            "data-wf-copy-label": file.base,
            "data-copy-state": "idle",
            title: say("panel.detail.copypath") + " — " + file.path,
            "aria-label": say("panel.detail.copypath") + " " + file.path,
            onClick: function (event) {
              var fire = actions || {};
              if (typeof fire.onCopy === "function") {
                fire.onCopy(file.path, event && event.currentTarget ? event.currentTarget : null);
              }
            },
          },
          h("span", { className: "wf-detail-base", key: "base" }, file.base),
          file.dir === "" ? null : h("span", { className: "wf-detail-dir", key: "dir", title: file.dir }, file.dir),
          h("span", { className: "wf-copy-status", key: "status", "aria-live": "polite" }, "")
        );
      })
    )
  );
}

/**
 * The block itself. `node` is a store.js flow node (argsText / fileList / errorText / seq
 * are the fields this renderer needs). Returns null for a missing node so a caller can
 * write `selected ? wfRenderNodeDetail(...) : null` without a type check.
 */
function wfRenderNodeDetail(h, node, say, actions, ctx) {
  if (!node || typeof node.id !== "string") return null;
  var context = ctx || {};
  var category = wfDetailCategory(node);
  var status = wfDetailStatus(node);
  var argsText = wfDetailArgsText(node);
  var capped = typeof node.argsText === "string" && node.argsText.length >= WF_DETAIL_ARGS_CAP;
  var groups = wfDetailFileGroups(node);
  var resultLine = typeof node.resultLine === "string" && node.resultLine !== "" ? node.resultLine : "";
  var errorText = typeof node.errorText === "string" && node.errorText !== "" ? node.errorText : "";
  var seq = wfFinite(node.seq);
  var clock = wfFormatClock(node.at);
  var duration = wfFinite(node.durationMs);
  var argsTitleKey = category === "command" ? "panel.detail.showcommand" : "panel.detail.showargs";

  var head = h(
    "div",
    { className: "wf-detail-head", key: "head" },
    h(
      "span",
      { className: "wf-detail-icon", key: "icon", "aria-hidden": "true" },
      WF_DETAIL_GLYPH[category] || WF_DETAIL_GLYPH.other
    ),
    h("span", { className: "wf-detail-name", key: "name" }, node.tool || say("panel.detail.unknowntool")),
    h(
      "span",
      { className: "wf-detail-chip", key: "category", "data-category": category },
      say(WF_DETAIL_CATEGORY_KEY[category] || WF_DETAIL_CATEGORY_KEY.other)
    ),
    h(
      "span",
      { className: "wf-detail-chip wf-detail-state", key: "status", "data-state": status },
      say(
        status === "error"
          ? "panel.status.failed"
          : status === "done"
            ? "panel.status.done"
            : "panel.node.pending"
      )
    )
  );

  // The expansion is a native <details>: keyboard-operable, no React state, and the opened
  // text is the WHOLE stored argsText (the host's 200-char digest, not the file body).
  var argsChildren = [
    h(
      "div",
      { className: "wf-detail-block-head", key: "head" },
      h("span", { className: "wf-detail-label", key: "label" }, say("panel.detail.args")),
      argsText === "" ? null : wfRenderCopyButton(h, argsText, say, actions, "wf-detail-copy", "panel.detail.copy", "panel.detail.copyargs")
    ),
    argsText === ""
      ? h("div", { className: "wf-detail-empty", key: "empty" }, say("panel.detail.noargs"))
      : h(
          "pre",
          { className: "wf-detail-preview", key: "preview", "data-collapsed": "true" },
          wfTrimText(argsText, WF_DETAIL_PREVIEW) || argsText.slice(0, WF_DETAIL_PREVIEW)
        ),
  ];
  if (argsText !== "") {
    argsChildren.push(
      h(
        "details",
        { className: "wf-detail-more", key: "more", "data-wf-more": category === "command" ? "command" : "args" },
        h("summary", { className: "wf-detail-summary", key: "summary" }, say(argsTitleKey)),
        h("pre", { className: "wf-detail-args", key: "body" }, argsText)
      )
    );
    if (capped) {
      argsChildren.push(h("div", { className: "wf-detail-note", key: "cap" }, say("panel.detail.argscap")));
    }
  }
  var args = h("div", { className: "wf-detail-block", key: "args", "data-block": "args" }, argsChildren);

  var files = h(
    "div",
    { className: "wf-detail-block", key: "files", "data-block": "files" },
    h(
      "div",
      { className: "wf-detail-block-head", key: "head" },
      h("span", { className: "wf-detail-label", key: "label" }, say("panel.detail.files"))
    ),
    groups.length === 0
      ? h("div", { className: "wf-detail-empty", key: "empty" }, say("panel.detail.nofiles"))
      : h(
          "div",
          { className: "wf-detail-groups", key: "groups" },
          groups.map(function (group) {
            return wfRenderFileRows(h, group, say, actions);
          })
        )
  );

  var result = h(
    "div",
    { className: "wf-detail-block", key: "result", "data-block": "result" },
    h(
      "div",
      { className: "wf-detail-block-head", key: "head" },
      h(
        "span",
        { className: "wf-detail-label", key: "label" },
        say(status === "error" ? "panel.detail.error" : "panel.detail.result")
      )
    ),
    status === "error"
      ? h(
          "div",
          { className: "wf-detail-errors", key: "error" },
          h("pre", { className: "wf-detail-error", key: "text" }, errorText || say("panel.detail.noerror")),
          h("div", { className: "wf-detail-note", key: "cap" }, say("panel.detail.errorcap"))
        )
      : h(
          "div",
          { className: "wf-detail-result", key: "ok" },
          resultLine || say("panel.detail.noresult")
        )
  );

  var meta = h(
    "div",
    { className: "wf-detail-meta", key: "meta" },
    h("span", { key: "start" }, say("panel.detail.started") + " " + (clock || "—")),
    h("span", { key: "duration" }, say("panel.detail.duration") + " " + (duration === null || duration <= 0 ? "—" : Math.round(duration) + "ms")),
    h("span", { key: "seq" }, "seq " + (seq === null ? "—" : String(Math.round(seq))))
  );

  return h(
    "div",
    {
      className: "wf-node-detail",
      key: "detail-" + node.id,
      role: "region",
      "data-dsh-workflow-map": "node-detail",
      "data-node-id": node.id,
      "data-category": category,
      "data-status": status,
      "aria-label": say("panel.detail.aria", { tool: node.tool || "—" }),
    },
    head,
    args,
    files,
    result,
    meta
  );
}

/* ------------------------------------------------------------------------- */
/* clipboard                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Copy `text`. The async Clipboard API is used when the environment has one; anything
 * else (file:// page, denied permission, older browser) falls back to the hidden
 * textarea + execCommand('copy') path. Returns a Promise<boolean> — never throws.
 */
function wfCopyText(text, env) {
  var value = typeof text === "string" ? text : String(text === undefined || text === null ? "" : text);
  var scope = env || {};
  var clipboard = scope.clipboard || (typeof navigator !== "undefined" && navigator ? navigator.clipboard : null);
  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      return Promise.resolve(clipboard.writeText(value)).then(
        function () {
          return true;
        },
        function () {
          return wfCopyFallback(value, scope);
        }
      );
    } catch (error) {
      return Promise.resolve(wfCopyFallback(value, scope));
    }
  }
  return Promise.resolve(wfCopyFallback(value, scope));
}

/** The pre-Clipboard-API path. True only when execCommand reports success. */
function wfCopyFallback(text, env) {
  var doc = (env && env.document) || (typeof document !== "undefined" ? document : null);
  if (!doc || typeof doc.createElement !== "function" || !doc.body) return false;
  var area = doc.createElement("textarea");
  if (!area || typeof area !== "object") return false;
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  if (area.style) {
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
  }
  doc.body.appendChild(area);
  var copied = false;
  try {
    if (typeof area.focus === "function") area.focus();
    if (typeof area.select === "function") area.select();
    if (typeof area.setSelectionRange === "function") area.setSelectionRange(0, text.length);
    copied = typeof doc.execCommand === "function" ? doc.execCommand("copy") === true : false;
  } catch (error) {
    copied = false;
  }
  try {
    if (area.parentNode) area.parentNode.removeChild(area);
  } catch (error) {
    /* an unremovable node is still harmless: it is offscreen and empty */
  }
  return copied;
}

/**
 * Repaint ONE copy control for its 1.5 s acknowledgement. Pure DOM mutation, so the
 * renderers stay state-free and a React re-render cannot strand a 「已复制」 label.
 */
function wfSetCopyState(element, state, say) {
  if (!element || typeof element !== "object") return false;
  var label =
    state === "copied"
      ? say("panel.detail.copied")
      : state === "failed"
        ? say("panel.detail.copyfailed")
        : null;
  if (typeof element.setAttribute === "function") element.setAttribute("data-copy-state", state);
  // Preferred: the dedicated status span. The button's label (and a file row's basename +
  // directory) stay in place; CSS hides the label while the status is showing.
  var status = typeof element.querySelector === "function" ? element.querySelector(".wf-copy-status") : null;
  if (status && typeof status.textContent === "string") {
    status.textContent = label === null ? "" : label;
    return true;
  }
  // Fallback for a plain element (a test double, or a future copy control without the span).
  if (typeof element.textContent === "string") {
    if (label !== null) element.textContent = label;
    else if (typeof element.getAttribute === "function") {
      var original = element.getAttribute("data-wf-copy-label");
      if (typeof original === "string") element.textContent = original;
    }
  }
  return true;
}

/**
 * Copy + acknowledge. `env` may carry {clipboard, document} and `env.setTimeout` so the
 * 1.5 s restore can be exercised in Node without waiting.
 */
function wfCopyWithFeedback(text, element, say, env) {
  var scope = env || {};
  var timer = typeof scope.setTimeout === "function" ? scope.setTimeout : typeof setTimeout === "function" ? setTimeout : null;
  var fire = typeof say === "function" ? say : function (key) {
    return key;
  };
  wfSetCopyState(element, "pending", fire);
  return wfCopyText(text, scope).then(function (ok) {
    wfSetCopyState(element, ok === true ? "copied" : "failed", fire);
    if (timer) {
      timer(function () {
        wfSetCopyState(element, "idle", fire);
      }, WF_COPY_FEEDBACK_MS);
    }
    return ok === true;
  });
}

/** How long 「已复制」 stays on the button (step-11 §4). */
var WF_COPY_FEEDBACK_MS = 1500;

/* ------------------------------------------------------------------------- */
/* keyboard + layout wiring                                                   */
/* ------------------------------------------------------------------------- */

/** Escape, and not while the user is composing (IME) or holding a modifier. */
function wfEscapeIntent(event) {
  if (!event || event.key !== "Escape") return false;
  if (event.isComposing === true || event.altKey === true || event.ctrlKey === true || event.metaKey === true) return false;
  return true;
}

/**
 * Document-level Escape: collapse the details, not the panel. `actions.onEscapeDetail`
 * is fired once per Escape; returns a handle with destroy() so the hook can unmount it.
 */
function wfBindEscape(doc, actions) {
  if (!doc || typeof doc.addEventListener !== "function") return { destroy: function () {} };
  var fire = actions || {};
  function onKeyDown(event) {
    if (!wfEscapeIntent(event)) return;
    if (typeof fire.onEscapeDetail === "function") fire.onEscapeDetail();
  }
  doc.addEventListener("keydown", onKeyDown, true);
  return {
    destroy: function () {
      if (typeof doc.removeEventListener === "function") doc.removeEventListener("keydown", onKeyDown, true);
    },
  };
}

/**
 * Details change the height of the scrolling columns, and the step-10 curve measures the
 * two cards' rects. A <details> toggle does not resize any observed box, so the curve
 * would keep the old endpoints: nudge the layer through its existing resize listener
 * once the browser has laid the new height out.
 */
function wfBindDetailNudge(doc, win) {
  if (!doc || typeof doc.addEventListener !== "function") return { destroy: function () {} };
  var scope = win || {};
  var timer = typeof scope.setTimeout === "function" ? scope.setTimeout : null;
  function nudge() {
    if (!timer) return;
    // One task later: the <details> content exists and the column has scrolled if it had to.
    timer(function () {
      try {
        if (typeof scope.dispatchEvent === "function" && typeof scope.Event === "function") {
          scope.dispatchEvent(new scope.Event("resize"));
        }
      } catch (error) {
        /* a closed window has nothing to re-measure */
      }
    }, 40);
  }
  function onToggle() {
    nudge();
  }
  function onClick(event) {
    var target = event && event.target;
    if (!target || typeof target.closest !== "function") return;
    if (target.closest('[data-dsh-workflow-map="step-info"]') || target.closest(".wf-detail-more")) nudge();
  }
  doc.addEventListener("toggle", onToggle, true);
  doc.addEventListener("click", onClick, true);
  return {
    destroy: function () {
      if (typeof doc.removeEventListener === "function") {
        doc.removeEventListener("toggle", onToggle, true);
        doc.removeEventListener("click", onClick, true);
      }
    },
  };
}
