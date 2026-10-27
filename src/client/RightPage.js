/**
 * RightPage.js — the RIGHT-HAND page, opened by a click on the main flow or on a circle.
 *
 * One page, three kinds of content, decided by the click that opened it:
 *
 * kind "step" → that step's full record. The report / artifacts / statistics block is the
 * EXISTING renderer (wfRenderStepDetail); what this file adds is the
 * per-type list above it — "this step touched .md ×3, pwsh ×2 …" — each row a
 * button that switches the page to that type. That is how a main-flow click can
 * walk into a type without going back to the circle.
 * kind "type" → every call of ONE file type (a step's circle, or the whole session when the
 * click came from the header's type strip). Each call expands IN PLACE into
 * 's node detail, so the page never grows a second detail vocabulary.
 * kind "inject"→ the hot-inject composer (HotInject.js), mounted here instead of a third column.
 *
 * Nothing is invented: a type that no call supports renders the empty hint, and a step whose
 * nodes the host never sent says so (the count comes from the host, the list from the wire).
 *
 * Pure: `h` and `say` are injected; no React import, no DOM.
 *
 * Inlined into client.js by tools/build-client.mjs (single-file browser half).
 */

/** The title line: step N · title / .md · 3 calls / hot injection. */
function wfPageTitle(kind, say, ctx) {
  var context = ctx || {};
  if (kind === "inject") return say("panel.page.inject");
  if (kind === "type") {
    return say(context.scopeStep === null ? "panel.page.typeSession" : "panel.page.typeStep", {
      label: context.label || "—",
      n: wfFinite(context.scopeStep) === null ? "" : context.scopeStep + 1,
    });
  }
  return say("panel.page.step", { n: (wfFinite(context.stepIndex) === null ? 0 : context.stepIndex) + 1 });
}

/** The close button. One per page; Escape does the same thing (wfBindEscape → onEscapeDetail). */
function wfPageClose(h, say, actions) {
  var fire = actions || {};
  return h(
    "button",
    {
      type: "button",
      className: "wf-page-close",
      key: "close",
      "data-dsh-workflow-map": "page-close",
      title: say("panel.page.close"),
      "aria-label": say("panel.page.close"),
      onClick: function () {
        if (typeof fire.onClosePage === "function") fire.onClosePage();
      },
    },
    "×"
  );
}

/**
 * A call row of the type page. It is a <button> that opens 's node detail under itself —
 * the SAME wfRenderNodeDetail the flow column uses, fed the SAME node, so the privacy rule and the
 * 200-character caps are whatever already guarantees.
 */
function wfRenderCallRow(h, node, say, actions, ctx) {
  var context = ctx || {};
  var fire = actions || {};
  var item = node && typeof node === "object" ? node : {};
  var id = typeof item.id === "string" ? item.id : "";
  var open = context.openCall === id && id !== "";
  var status = wfNodeStatus(item, context.activeNodeId);
  var parts = wfNodeTitleParts(item, wfNodeCategory(item), say);

  var label = [];
  if (parts.verb !== "") label.push(parts.verb, " · ");
  label.push(parts.target);

  return h(
    "li",
    { className: "wf-call", key: "call-" + id, "data-status": status, "data-node-id": id },
    h(
      "button",
      {
        type: "button",
        className: "wf-call-head",
        key: "head",
        "data-dsh-workflow-map": "call",
        "data-node-id": id,
        "data-open": open ? "true" : "false",
        "aria-expanded": open ? "true" : "false",
        title: parts.verb !== "" ? parts.verb + " · " + parts.target : parts.target,
        onClick: function () {
          if (typeof fire.onSelectCall === "function") fire.onSelectCall(id);
        },
      },
      h("span", { className: "wf-call-main", key: "main" }, label),
      h(
        "span",
        { className: "wf-call-meta", key: "meta" },
        wfFormatClock(item.at) === "" ? "" : wfFormatClock(item.at),
        wfFormatDuration(item.durationMs) === "" ? "" : " · " + wfFormatDuration(item.durationMs)
      ),
      h("span", {
        className: "wf-flow-status",
        key: "status",
        "data-status": status,
        "aria-hidden": "true",
      })
    ),
    open ? wfRenderNodeDetail(h, item, say, fire, { detail: "summary" }) : null
  );
}

/**
 * The type page's body: the calls of one bucket, in wire order, plus the honest note when the
 * host never sent some of them (the bucket carries the host's count, the list only what arrived).
 */
function wfRenderTypeBody(h, bucket, nodes, say, actions, ctx) {
  var context = ctx || {};
  var list = Array.isArray(nodes) ? nodes : [];
  var total = wfFinite(bucket && bucket.count) === null ? list.length : Math.max(0, Math.round(bucket.count));

  if (list.length === 0) {
    return h("div", { className: "wf-empty", key: "empty" }, say("panel.page.typeEmpty"));
  }

  var more = total > list.length ? say("panel.page.truncated", { count: total - list.length }) : "";

  return h(
    "div",
    { className: "wf-calls", key: "calls", "data-dsh-workflow-map": "calls", "data-count": list.length },
    h(
      "ul",
      { className: "wf-call-list", key: "list", role: "list" },
      list.map(function (node) {
        return wfRenderCallRow(h, node, say, actions, context);
      })
    ),
    more === "" ? null : h("div", { className: "wf-detail-note", key: "more" }, more)
  );
}

/**
 * The step page's body: the type summary, then 's own detail block.
 *
 * The type summary is the ONLY new thing, and it exists because the page is reached by clicking a
 * unit, not a circle: without it the circles would be the only way into a type. Each row is a
 * button with the same `onOpenType(stepIndex, key)` action the circles fire.
 */
function wfRenderStepTypeSummary(h, unit, say, actions, ctx) {
  var context = ctx || {};
  var fire = actions || {};
  var types = unit && Array.isArray(unit.types) ? unit.types : [];
  if (types.length === 0) {
    return h("div", { className: "wf-detail-empty", key: "empty" }, say("panel.page.noTypes"));
  }

  return h(
    "div",
    { className: "wf-type-list", key: "types", "data-dsh-workflow-map": "type-list", "data-count": types.length },
    h("div", { className: "wf-detail-label", key: "label" }, say("panel.page.types")),
    h(
      "div",
      { className: "wf-type-rows", key: "rows" },
      types.map(function (type) {
        var open = context.openType === type.key && context.openStep === unit.index;
        return h(
          "button",
          {
            type: "button",
            className: "wf-type-row",
            key: "type-" + type.key,
            "data-dsh-workflow-map": "type-row",
            "data-type": type.key,
            "data-side": type.side,
            "data-live": type.running === true ? "true" : "false",
            "data-open": open ? "true" : "false",
            "aria-pressed": open ? "true" : "false",
            onClick: function () {
              if (typeof fire.onOpenType === "function") fire.onOpenType(unit.index, type.key);
            },
          },
          h("span", { className: "wf-type-dot", key: "dot", "data-tone": type.tone, "aria-hidden": "true" }),
          h("span", { className: "wf-type-label", key: "label" }, type.label),
          h("span", { className: "wf-type-kind", key: "kind" }, say(type.kind === "tool" ? "panel.page.kind.tool" : "panel.page.kind.file")),
          h("span", { className: "wf-type-count", key: "count" }, say("panel.page.count", { count: type.count }))
        );
      })
    )
  );
}

/**
 * The whole right page. `extras` carries the decided content:
 * {kind, stepIndex, unit, detail, typeKey, bucket, nodes, stepDetail, openType, openCall,
 * activeNodeId, inject:{...}}
 *
 * `detail` is the record built by store.js for the SELECTED step; a page about another
 * step falls back to the unit's own numbers and says the report is not loaded, rather than
 * showing the selected step's report under a different step's title.
 */
function wfRenderRightPage(h, model, say, actions, extras) {
  var fire = actions || {};
  var ui = extras || {};
  var kind = ui.kind === "type" || ui.kind === "inject" ? ui.kind : "step";
  var context = {
    stepIndex: wfFinite(ui.stepIndex) === null ? null : Math.round(ui.stepIndex),
    scopeStep: wfFinite(ui.scopeStep) === null ? null : Math.round(ui.scopeStep),
    openType: typeof ui.openType === "string" && ui.openType !== "" ? ui.openType : null,
    openCall: typeof ui.openCall === "string" && ui.openCall !== "" ? ui.openCall : null,
    openStep: wfFinite(ui.stepIndex) === null ? null : Math.round(ui.stepIndex),
    label: typeof ui.label === "string" ? ui.label : "",
    activeNodeId: typeof ui.activeNodeId === "string" && ui.activeNodeId !== "" ? ui.activeNodeId : null,
  };

  var title = wfPageTitle(kind, say, {
    label: context.label,
    scopeStep: context.scopeStep,
    stepIndex: context.stepIndex,
  });

  var body;
  if (kind === "inject") {
    body = wfRenderHotInject(h, say, fire, {
      sessionId: ui.sessionId,
      state: ui.injectState,
      text: ui.injectText,
      reason: ui.injectReason,
      history: ui.injectHistory,
 // the one row being revoked (if any) plus the host's reason when it said no.
      revokeId: ui.injectRevokeId,
      revokeState: ui.injectRevokeState,
      revokeReason: ui.injectRevokeReason,
    });
  } else if (kind === "type") {
    body = [
      h(
        "div",
        { className: "wf-page-sub", key: "sub" },
        say("panel.page.typeSub", {
          step: context.scopeStep === null ? say("panel.page.wholeSession") : "第 " + (context.scopeStep + 1) + " 步",
          count: wfFinite(ui.bucket && ui.bucket.count) === null ? 0 : Math.max(0, Math.round(ui.bucket.count)),
        })
      ),
      wfRenderTypeBody(h, ui.bucket, ui.nodes, say, actions, context),
    ];
  } else {
    var unit = ui.unit && typeof ui.unit === "object" ? ui.unit : null;
    var stepDetail = ui.stepDetail && typeof ui.stepDetail === "object" ? ui.stepDetail : null;
    body = [
      unit ? wfRenderStepTypeSummary(h, unit, say, actions, context) : null,
      stepDetail
        ? wfRenderStepDetail(h, stepDetail, say, fire, context)
        : h("div", { className: "wf-detail-empty", key: "noload" }, say("panel.page.noReport")),
    ];
  }

  return h(
    "aside",
    {
      className: "wf-right",
      key: "right",
      "data-dsh-workflow-map": "right",
      "data-kind": kind,
      role: "region",
      "aria-label": title,
    },
    h(
      "div",
      { className: "wf-right-head", key: "head", "data-dsh-workflow-map": "right-head" },
      h("span", { className: "wf-right-title", key: "title", title: title }, title),
      wfPageClose(h, say, actions)
    ),
    h("div", { className: "wf-right-scroll", key: "scroll", "data-dsh-workflow-map": "right-scroll" }, body),
 // the persistent dock. Every page kind that is NOT the composer
 // gets it at the foot, so a prompt can be typed WITHOUT opening the composer first; the
 // composer itself does not repeat it. It reads the SAME inject state the composer reads.
    kind === "inject"
      ? null
      : wfRenderInjectDock(h, say, fire, {
          sessionId: ui.sessionId,
          state: ui.injectState,
          text: ui.injectText,
          reason: ui.injectReason,
          history: ui.injectHistory,
        })
  );
}
