/**
 * MainFlow.js — 会话4 · the single page: ONE serial main flow, satellites on both sides.
 *
 * The layout the user asked for, in one sentence: the steps run serially down the middle, each
 * step's core unit carries a few parallel "interfaces" off its left and right edges, every
 * interface ends in a round icon naming the TOOL FILE TYPE it stands for, and every connector is
 * a STRAIGHT line. The main chain only ever runs one way — down.
 *
 * Why the satellites exist at all: a step's flow is not a flat list of tool calls, it is "this
 * step touched .md files here, ran pwsh there". The circle is that fact turned into a click
 * target; clicking it opens the right-hand page with the calls of exactly that type (RightPage.js).
 *
 * Division of labour, so nothing is computed twice:
 *   store.js  wfTypeBuckets()   pure derivation of the buckets from raw host nodes (ONE place)
 *   this file                    only draws what the buckets already say
 *   RightPage.js                 the same buckets, with their calls, for the opened page
 *
 * Pure: `h` and `say` are injected, no React import, no DOM. tools/selftest-panel.mjs drives the
 * exact tree the frame mounts.
 *
 * Inlined into client.js by tools/build-client.mjs (single-file browser half).
 */

/* ------------------------------------------------------------------------- */
/* geometry helpers                                                          */
/* ------------------------------------------------------------------------- */

/**
 * The scrollTop that centres one unit in the page viewport. Pure, so the browser check
 * (tools/measure-main.ps1) and the self-test can assert the same arithmetic.
 *
 * The result is clamped to [0, scrollHeight − viewport], because "centred" must never mean
 * "scrolled past the end" — the last unit cannot be centred and forcing it would look like a
 * jump to nowhere.
 */
function wfCenterOffset(unitTop, unitHeight, viewportHeight, scrollHeight) {
  var top = wfFinite(unitTop);
  var height = wfFinite(unitHeight);
  var view = wfFinite(viewportHeight);
  var total = wfFinite(scrollHeight);
  if (top === null || height === null || view === null || total === null) return null;
  if (height <= 0 || view <= 0 || total <= 0) return null;
  var wanted = top + height / 2 - view / 2;
  var max = Math.max(0, total - view);
  if (wanted < 0) return 0;
  if (wanted > max) return max;
  return wanted;
}

/** A satellite's accessible name: what it is, how often, on which side. */
function wfSatelliteLabel(say, sat) {
  var bucket = sat || {};
  var kind = bucket.kind === "tool" ? "panel.page.kind.tool" : "panel.page.kind.file";
  return say("panel.page.sat.label", {
    label: bucket.label || "—",
    kind: say(kind),
    count: wfFinite(bucket.count) === null ? 0 : bucket.count,
  });
}

/* ------------------------------------------------------------------------- */
/* rendering                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * One round icon at the end of one straight interface. `side` decides which end the line is on:
 * a left satellite is `[circle][line → card]`, a right one is `[card ← line][circle]`.
 *
 * The circle is a real <button>: it is a top-level action (open the type page), Tab-reachable,
 * and it carries `aria-pressed` so the opened one is announced as open. The count badge is a
 * sibling <span> — a button inside a button is invalid HTML.
 */
function wfRenderSatellite(h, sat, side, say, actions, ctx) {
  var fire = actions || {};
  var context = ctx || {};
  var bucket = sat && typeof sat === "object" ? sat : {};
  var key = typeof bucket.key === "string" ? bucket.key : "";
  var open = context.openType === key && context.openStep === context.stepIndex;
  var count = wfFinite(bucket.count) === null ? 0 : Math.max(0, Math.round(bucket.count));
  var running = bucket.running === true;
  var label = wfSatelliteLabel(say, bucket);

  var circle = h(
    "button",
    {
      type: "button",
      className: "wf-sat",
      key: "sat",
      "data-dsh-workflow-map": "sat",
      "data-type": key,
      "data-side": side,
      "data-tone": typeof bucket.tone === "string" ? bucket.tone : "read",
      "data-count": String(count),
      "data-live": running ? "true" : "false",
      "data-open": open ? "true" : "false",
      "aria-pressed": open ? "true" : "false",
      "aria-label": label,
      title: label,
      onClick: function () {
        if (typeof fire.onOpenType === "function") fire.onOpenType(context.stepIndex, key);
      },
    },
    h("span", { className: "wf-sat-glyph", key: "glyph", "aria-hidden": "true" }, bucket.label || "—"),
    count > 1
      ? h("span", { className: "wf-sat-count", key: "count", "aria-hidden": "true" }, String(count))
      : null
  );

  return h(
    "div",
    {
      className: "wf-sat-row",
      key: "sat-" + key,
      "data-side": side,
      "data-live": running ? "true" : "false",
    },
    side === "left" ? circle : h("span", { className: "wf-sat-line", key: "line", "aria-hidden": "true" }),
    side === "left" ? h("span", { className: "wf-sat-line", key: "line", "aria-hidden": "true" }) : circle
  );
}

/** One side's stack of satellites (empty when the step touched nothing on that side). */
function wfRenderSatSide(h, list, side, say, actions, ctx) {
  var items = Array.isArray(list) ? list : [];
  if (items.length === 0) return null;
  return h(
    "div",
    {
      className: "wf-sat-side",
      key: "side-" + side,
      "data-side": side,
      role: "group",
      "aria-label": side === "left" ? "读取与查询" : "写入与工具",
    },
    items.map(function (sat) {
      return wfRenderSatellite(h, sat, side, say, actions, ctx);
    })
  );
}

/**
 * One main-flow unit: the step card in the middle, its satellites on both sides, and — except on
 * the last unit — the straight connector down to the next one.
 *
 * The card is a button. Clicking it opens the step's page on the right; it does NOT expand
 * anything in place (user decision), so the serial line keeps its rhythm no matter what is open.
 */
// ---------------------------------------------------------------------------
// 会话5 · 【需确认】 — the union of the plan's own flag and the waiting-on-human state
// ---------------------------------------------------------------------------

/**
 * The pending-confirm rows of ONE unit, bounded and repaired. Each row is
 * `{ kind, label, at }` as the host folded it; a malformed row is dropped rather than
 * rendered as "undefined".
 */
function wfConfirmRows(row) {
  var out = [];
  var list = row && Array.isArray(row.pendingConfirm) ? row.pendingConfirm : [];
  for (var i = 0; i < list.length && out.length < 8; i += 1) {
    var one = list[i];
    if (!one || typeof one !== "object") continue;
    var kind = typeof one.kind === "string" ? one.kind : "";
    if (kind === "") continue;
    out.push({ kind: kind, label: typeof one.label === "string" ? one.label : "" });
  }
  return out;
}

/**
 * The flag's tooltip. A row WITH a reason says what the session is waiting for; a row without
 * one (or none at all — only the plan's marker) says the plan asked for a confirmation here.
 * Never empty: a tooltip of "" reads as a broken control.
 */
function wfConfirmTitle(row, say) {
  var rows = wfConfirmRows(row);
  if (rows.length === 0) return say("panel.step.confirm");
  var parts = [];
  for (var i = 0; i < rows.length; i += 1) {
    var one = rows[i];
    var kind = say(one.kind === "approval" ? "panel.kind.approval" : "panel.kind.question");
    parts.push(one.label === "" ? kind : kind + "：" + one.label);
  }
  return say("panel.step.confirm") + " · " + parts.join("；");
}

function wfRenderUnit(h, unit, position, total, say, actions, ctx) {
  var fire = actions || {};
  var context = ctx || {};
  var row = unit && typeof unit === "object" ? unit : {};
  var index = wfFinite(row.index) === null ? position : Math.round(row.index);
  var status = typeof row.status === "string" ? row.status : "pending";
  // Two different facts, deliberately kept apart:
  //   selected  the step the panel remembers (the last one opened) — the chain's highlight
  //   open      the step whose page is on the right right now — the card's aria-pressed
  var selected = context.selectedStep === index;
  var open = context.openStep === index;
  // The satellites' context: the SAME facts, plus THIS unit's index — a circle's click reports
  // (stepIndex, typeKey), and without the index every circle of every step would open step null.
  var unitContext = Object.assign({}, context, { stepIndex: index });
  var dropped = row.dropped && typeof row.dropped === "object" ? row.dropped : {};
  var leftDropped = wfFinite(dropped.left) === null ? 0 : dropped.left;
  var rightDropped = wfFinite(dropped.right) === null ? 0 : dropped.right;
  var metaBits = [];
  if (wfFinite(row.toolCount) !== null) metaBits.push(say("panel.step.tools", { count: row.toolCount }));
  if (wfFinite(row.fileCount) !== null) metaBits.push(say("panel.step.files", { count: row.fileCount }));

  var card = h(
    "button",
    {
      type: "button",
      className: "wf-unit-card",
      key: "card",
      "data-dsh-workflow-map": "step",
      "data-step-index": index,
      "data-plan-index": row.planIndex === null ? undefined : row.planIndex,
      "data-status": status,
      "data-status-source": row.statusSource,
      "data-selected": selected ? "true" : "false",
      "data-active": row.active ? "true" : "false",
      "aria-pressed": open ? "true" : "false",
      title: row.title,
      onClick: function () {
        if (typeof fire.onOpenStep === "function") fire.onOpenStep(index);
      },
    },
    h("span", { className: "wf-unit-seq", key: "seq" }, wfPad2(position + 1) + "/" + wfPad2(total)),
    h("span", { className: "wf-unit-ring", key: "ring", "aria-hidden": "true" }, wfStatusGlyph(status)),
    h(
      "span",
      { className: "wf-unit-main", key: "main" },
      h("span", { className: "wf-unit-title", key: "title" }, row.title || "—"),
      h(
        "span",
        { className: "wf-unit-meta", key: "meta" },
        h("span", { className: "wf-badge", key: "badge" }, say(row.statusKey || "panel.status.pending")),
        metaBits.map(function (bit, at) {
          return h("span", { key: "bit-" + at }, bit);
        }),
        // 「需确认」 used to live in StepColumn's meta row; the unit keeps it (and the badge order
        // the self-test asserts) so the flag is not lost with that file.
        // 会话5 · 「需确认」 is now the UNION of two sources, both derived:
        //        · the plan's own `requiresConfirmation` (the step was marked as a confirm point),
        //        · the step being WAITING on a human right now — the host folds an open approval
        //          or an unanswered question into `row.pendingConfirm`.
        // The flag names WHY when the row carries a reason, so the user can tell "this step was
        // marked" from "this step is asking you something right now".
        wfConfirmRows(row).length > 0 || row.requiresConfirmation
          ? h(
              "span",
              { className: "wf-step-flag", key: "flag", title: wfConfirmTitle(row, say) },
              say("panel.step.confirm")
            )
          : null
      ),
      status === "running" ? wfRenderLive(h, say, "step") : null
    )
  );

  var droppedNote =
    leftDropped + rightDropped > 0
      ? h(
          "span",
          { className: "wf-unit-more", key: "more", title: say("panel.page.moreTypes", { count: leftDropped + rightDropped }) },
          say("panel.page.moreTypes", { count: leftDropped + rightDropped })
        )
      : null;

  return h(
    "li",
    {
      className: "wf-unit",
      key: "unit-" + index,
      "data-dsh-workflow-map": "unit",
      "data-step-index": index,
      "data-status": status,
      "data-selected": selected ? "true" : "false",
      // 会话5 · 「需确认」 on the row itself, so the card's left edge and the ring can be styled
      // without the badge row having to be in view.
      "data-confirm": wfConfirmRows(row).length > 0 || row.requiresConfirmation === true ? "true" : "false",
    },
    wfRenderSatSide(h, row.left, "left", say, actions, unitContext),
    h(
      "div",
      {
        className: "wf-unit-center",
        key: "center",
      },
      card,
      // step-12 「只看标题」 still means ONE line under the card: the rail keeps its number and drops
      // the second (timing) line, exactly as it did in the two-column layout.
      wfRenderProgressDock(h, context.compact ? Object.assign({}, row, { compact: true }) : row, say, context.asOf),
      droppedNote
    ),
    wfRenderSatSide(h, row.right, "right", say, actions, unitContext),
    position + 1 < total
      ? h("span", {
          className: "wf-unit-link",
          key: "link",
          "aria-hidden": "true",
          "data-done": status === "done" ? "true" : "false",
          // 会话6 · 只有「直接指向唯一正在进行的那个分步」的那一条连接线跑彩色流光。
          // row.live 由 store 从 host 的 runningIndex 派生，所以最多一条。
          "data-live": row.live === true ? "true" : "false",
        })
      : null
  );
}

/**
 * The page itself. `extras` carries {openStep, openType, asOf}; its scroller is the ONE scroll
 * container of the main flow (the right page scrolls on its own).
 */
function wfRenderMainFlow(h, model, say, actions, extras) {
  var ui = extras || {};
  var rows = model && Array.isArray(model.steps) ? model.steps : [];
  var units = model && model.page && Array.isArray(model.page.units) ? model.page.units : [];
  var context = {
    // `openStep` is the step whose page is on the right; `selectedStep` is the panel's remembered
    // selection (they are usually the same, but the header can open a page without re-selecting).
    openStep: wfFinite(ui.openStep) === null ? null : Math.round(ui.openStep),
    selectedStep: wfFinite(model && model.selected) === null ? null : Math.round(model.selected),
    openType: typeof ui.openType === "string" && ui.openType !== "" ? ui.openType : null,
    compact: !!(ui.compact === true),
    asOf: wfFinite(ui.asOf) === null ? (model ? model.now : null) : ui.asOf,
  };

  var header = h(
    "div",
    { className: "wf-page-head", key: "head", "data-dsh-workflow-map": "page-head" },
    h("span", { key: "label" }, say("panel.page.main")),
    h("span", { className: "wf-count", key: "count" }, model ? model.progress.done + "/" + model.progress.total : "")
  );

  var body =
    units.length === 0
      ? h("div", { className: "wf-empty", key: "empty" }, say("panel.flow.empty"))
      : h(
          "ul",
          {
            className: "wf-units",
            key: "units",
            role: "list",
            "data-dsh-workflow-map": "page",
            "data-units": units.length,
            "data-running": wfFinite(model && model.page ? model.page.runningIndex : null) === null ? "" : String(model.page.runningIndex),
          },
          units.map(function (unit, position) {
            return wfRenderUnit(h, unit, position, units.length, say, actions, context);
          })
        );

  return h(
    "div",
    { className: "wf-page", key: "page", "data-dsh-workflow-map": "main" },
    header,
    h("div", { className: "wf-page-scroll", key: "scroll", "data-dsh-workflow-map": "page-scroll" }, body)
  );
}
