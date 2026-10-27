/**
 * StepColumn.js — the left column: the task's step chain, one card per step.
 *
 * Each `<li>` is a CARD plus the progress rail that hangs under its frame
 * (ProgressUnder.js) plus — except on the last card — a 14 px connector line.
 * The rail is deliberately OUTSIDE the card's border box with WF_STEP_GAP of
 * air, so the card still reads as a card and the bar as an annotation of it.
 *
 * STATUS POLICY (the one rule this file exists for):
 * PAE `plan.statuses` > the todo table > `plan.anchorSeqs` inference >
 * the host's event-derived status > "pending".
 *
 * Why the browser re-derives what the host already merged: the host may see a
 * PAE-opened row's event status before PAE rewrites `statuses`, and the plan file
 * is the published truth ("completed" must render as completed). `anchorSeqs`
 * covers the window where a step has been opened but no status/report landed yet:
 * a step with an anchor is never "not started".
 *
 * Pure: no React import, no DOM. `h` and `say` are injected so
 * tools/selftest-panel.mjs can drive the exact tree the frame will mount.
 *
 * Inlined into client.js by tools/build-client.mjs (single-file browser half).
 */

/** PAE / todo status vocabulary → this plugin's five card states. A Map, so a
 * crafted "constructor" key cannot resolve through Object.prototype. */
var WF_STATUS_ALIASES = new Map([
  ["completed", "done"],
  ["complete", "done"],
  ["done", "done"],
  ["success", "done"],
  ["succeeded", "done"],
  ["finished", "done"],
  ["in_progress", "running"],
  ["in-progress", "running"],
  ["running", "running"],
  ["executing", "running"],
  ["processing", "running"],
  ["active", "running"],
  ["pending", "pending"],
  ["queued", "pending"],
  ["todo", "pending"],
  ["not_started", "pending"],
  ["not-started", "pending"],
  ["idle", "pending"],
  ["failed", "failed"],
  ["failure", "failed"],
  ["error", "failed"],
  ["errored", "failed"],
  ["aborted", "failed"],
  ["skipped", "skipped"],
  ["skip", "skipped"],
  ["cancelled", "skipped"],
  ["canceled", "skipped"],
]);

/** The ring glyph per state: ✓ done, ● running, ✕ failed, ○ not started. */
var WF_STATUS_GLYPH = {
  done: "✓",
  running: "●",
  failed: "✕",
  pending: "○",
  skipped: "–",
};

var WF_STATUS_SAY = {
  done: "panel.status.done",
  running: "panel.status.running",
  failed: "panel.status.failed",
  pending: "panel.status.pending",
  skipped: "panel.status.skipped",
};

/** A status label from any of the three sources → canonical state, or null. */
function wfCanonicalStatus(label) {
  if (typeof label !== "string") return null;
  var key = label.trim().toLowerCase();
  if (key === "") return null;
  return WF_STATUS_ALIASES.get(key) || null;
}

function wfStatusSayKey(status) {
  return WF_STATUS_SAY[status] || WF_STATUS_SAY.pending;
}

function wfStatusGlyph(status) {
  return WF_STATUS_GLYPH[status] || WF_STATUS_GLYPH.pending;
}

/* ------------------------------------------------------------------------- */
/* matching a step to its todo row */
/* ------------------------------------------------------------------------- */

/** "5. install into the desktop profile..." -> "install into the desktop profile..." (the ordinal is not part
 * of the name). Also strips a trailing run of list punctuation. */
function wfStripStepOrdinal(text) {
  if (typeof text !== "string") return "";
  return text.replace(/^\s*\d+\s*[.、)．:：]\s*/, "");
}

function wfNormalizeStepTitle(text) {
  if (typeof text !== "string") return "";
  return wfStripStepOrdinal(text)
    .replace(/\s+/g, " ")
    .replace(/[，。,.、;；:：!?！？]+$/g, "")
    .trim()
    .toLowerCase();
}

/** The ordinal a todo row carries ("5. …" → 5), or null. */
function wfTodoOrdinal(content) {
  if (typeof content !== "string") return null;
  var match = /^\s*(\d+)\s*[.、)．:：]/.exec(content);
  if (!match) return null;
  var value = Number(match[1]);
  return isFinite(value) ? value : null;
}

/**
 * Index the todo table both ways, because the two ways fail differently:
 * an ordinal can be stale after a plan edit, and a title can be re-worded.
 * First row wins (`Map` insertion order), matching the fold's "first match" rule.
 */
function wfBuildTodoIndex(todos) {
  var byOrdinal = new Map();
  var byTitle = new Map();
  if (!Array.isArray(todos)) return { byOrdinal: byOrdinal, byTitle: byTitle };
  for (var i = 0; i < todos.length; i += 1) {
    var todo = todos[i];
    if (!todo || typeof todo !== "object") continue;
    var content = typeof todo.content === "string" ? todo.content : "";
    var status = typeof todo.status === "string" ? todo.status : "";
    if (content === "" || status === "") continue;
    var ordinal = wfTodoOrdinal(content);
    if (ordinal !== null && !byOrdinal.has(ordinal)) byOrdinal.set(ordinal, status);
    var title = wfNormalizeStepTitle(content);
    if (title !== "" && !byTitle.has(title)) byTitle.set(title, status);
  }
  return { byOrdinal: byOrdinal, byTitle: byTitle };
}

/* ------------------------------------------------------------------------- */
/* status derivation */
/* ------------------------------------------------------------------------- */

function wfHasKey(object, key) {
  return !!object && Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * The effective status of one row and WHERE it came from (so the card can say
 * `data-status-source` and the test can prove the priority actually held).
 *
 * @returns {{status:string, source:"pae"|"todo"|"anchor"|"host"|"none"}}
 */
function wfDeriveStepStatus(row, plan, todoIndex, currentPlanIndex) {
  var planIndex = row && wfFinite(row.planIndex) !== null ? Math.round(row.planIndex) : null;

  if (plan && planIndex !== null) {
 // 1. PAE's own statuses are the published truth.
    var label = wfHasKey(plan.statuses, String(planIndex)) ? plan.statuses[String(planIndex)] : null;
    var fromPae = wfCanonicalStatus(label);
    var skipped = Array.isArray(plan.skipped) && plan.skipped.indexOf(planIndex) >= 0;
    if (skipped && (fromPae === null || fromPae === "pending")) return { status: "skipped", source: "pae" };
    if (fromPae !== null) return { status: fromPae, source: "pae" };

 // 2. The todo table (what the model wrote into its own checklist).
    var fromTodo = null;
    if (todoIndex) {
      if (todoIndex.byOrdinal.has(planIndex)) fromTodo = wfCanonicalStatus(todoIndex.byOrdinal.get(planIndex));
      if (fromTodo === null) {
        var title = wfNormalizeStepTitle(row.title);
        if (title !== "" && todoIndex.byTitle.has(title)) fromTodo = wfCanonicalStatus(todoIndex.byTitle.get(title));
      }
    }
    if (fromTodo !== null) return { status: fromTodo, source: "todo" };

 // 3. An anchored step has been opened. The plan's own cursor decides whether
 // it is behind us (done), here (running) or still ahead (pending).
    if (wfHasKey(plan.anchorSeqs, String(planIndex))) {
      if (currentPlanIndex !== null && planIndex < currentPlanIndex) return { status: "done", source: "anchor" };
      if (currentPlanIndex !== null && planIndex === currentPlanIndex) return { status: "running", source: "anchor" };
      if (currentPlanIndex !== null && planIndex > currentPlanIndex) return { status: "pending", source: "anchor" };
      return { status: "running", source: "anchor" };
    }
  } else if (todoIndex) {
 // A row with no plan ordinal (planning-phase work) can still be in the todo
 // table; match it by name only.
    var fallbackTitle = wfNormalizeStepTitle(row && row.title);
    if (fallbackTitle !== "" && todoIndex.byTitle.has(fallbackTitle)) {
      var named = wfCanonicalStatus(todoIndex.byTitle.get(fallbackTitle));
      if (named !== null) return { status: named, source: "todo" };
    }
  }

 // 4. The host's event-derived status, then the honest floor.
  var fromHost = wfCanonicalStatus(row && row.status);
  if (fromHost !== null) return { status: fromHost, source: "host" };
  return { status: "pending", source: "none" };
}

/**
 * Rewrite the model's rows with the derived status. Called by wfBuildModel (store.js)
 * so the header counts, the selection fallback and every card agree on one truth.
 */
function wfApplyDerivedStatuses(rows, plan, todos) {
  var todoIndex = wfBuildTodoIndex(todos);
  var current = plan && wfFinite(plan.stepIndex) !== null ? Math.round(plan.stepIndex) : null;
  var out = [];
  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    var derived = wfDeriveStepStatus(row, plan, todoIndex, current);
    var requiresConfirmation = false;
    if (plan && plan.confirmations && wfFinite(row.planIndex) !== null) {
      requiresConfirmation = plan.confirmations[String(Math.round(row.planIndex))] === true;
    }
    out.push({
      index: row.index,
      title: row.title,
      status: derived.status,
      statusKey: wfStatusSayKey(derived.status),
      statusSource: derived.source,
      rawStatus: row.status,
      percent: row.percent,
      percentSource: row.percentSource,
 // carried through the status rewrite so every row keeps the stamp the host
 // shipped, whichever policy decided its status.
      lastEstimateAt: wfFinite(row.lastEstimateAt) === null ? 0 : Math.max(0, Math.round(wfFinite(row.lastEstimateAt))),
      nodeCount: row.nodeCount,
      planIndex: row.planIndex,
      anchorSeq: row.anchorSeq,
      requiresConfirmation: requiresConfirmation,
 // carried through the status rewrite: the rows the host folded for this step (an
 // open approval, an unanswered question). Bounded to the same limit the host applies, so a
 // damaged record cannot flood the badge row.
      pendingConfirm: Array.isArray(row.pendingConfirm) ? row.pendingConfirm.slice(0, 8) : [],
      reportSummary: row.reportSummary,
 // the step detail needs the clock and the report; both are carried here so
 // every row has the same shape whether or not it is the selected one.
      startedAt: wfFinite(row.startedAt),
      endedAt: wfFinite(row.endedAt),
      outcome: typeof row.outcome === "string" ? row.outcome : "",
      report: wfStepReport(plan, row.planIndex),
      active: row.active,
      selected: false,
    });
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* rendering */
/* ------------------------------------------------------------------------- */

function wfPad2(value) {
  var text = String(value);
  return text.length >= 2 ? text : "0" + text;
}

function wfStepFire(fn, argument) {
  if (typeof fn === "function") fn(argument);
}

/** The disclosure glyph. Pure, so a self-test can prove it follows the state. */
function wfTriGlyph(expanded) {
  return expanded === true ? "▾" : "▸";
}

/**
 * The ONE disclosure triangle , shared by a step card and a folded run.
 *
 * It is a real <button>, not a ::before glyph: a pseudo-element is not a hit
 * target, cannot be Tab-reached and cannot carry aria-expanded. It is also a
 * SIBLING of the row it discloses — a button inside a button is invalid HTML and
 * unreachable by keyboard — dropped into the SAME grid cell as that row, so the
 * whole 20 px band down the row's height is clickable and the glyph sits in the
 * band the row reserves with padding-left.
 *
 * `extra` carries what only the caller knows:
 * {label, controls, data, key} the aria-label/title, aria-controls target,
 * the data-dsh-workflow-map tag and the React key.
 */
function wfTri(h, expanded, onToggle, extra) {
  var open = expanded === true;
  var fire = typeof onToggle === "function" ? onToggle : null;
  var info = extra && typeof extra === "object" ? extra : {};
  var label = typeof info.label === "string" ? info.label : "";
  return h(
    "button",
    {
      type: "button",
      className: "wf-tri",
      key: typeof info.key === "string" ? info.key : "tri",
      "data-dsh-workflow-map": typeof info.data === "string" ? info.data : "tri",
      "data-expanded": open ? "true" : "false",
      "aria-expanded": open ? "true" : "false",
      "aria-controls": typeof info.controls === "string" ? info.controls : undefined,
      title: label,
      "aria-label": label,
      onClick: function () {
        if (fire !== null) fire();
      },
    },
    wfTriGlyph(open)
  );
}

/**
 * One `<li>`: card (+ its 「i」) + rail + the step detail + (unless last) the
 * 14 px connector to the next card. `info` carries {detail, open} for THIS row only.
 */
function wfRenderStepItem(h, row, position, total, say, actions, info) {
  var status = row.status;
  var fire = actions || {};
  var glyph = wfStatusGlyph(status);
  var detail = info && info.detail && info.detail.index === row.index ? info.detail : null;
 // `asOf` is the ONE moment every timing segment is measured against. The host
 // ships it in the view; passing it down keeps the renderer clock-free and the numbers
 // reproducible in a self-test with a fixed stamp.
  var compact = !!(info && info.compact === true);
  var open = detail !== null && info.open === true && !compact;

  var card = h(
    "button",
    {
      type: "button",
      className: "wf-step-card",
      key: "card",
      "data-dsh-workflow-map": "step",
      "data-step-index": row.index,
      "data-plan-index": row.planIndex === null ? undefined : row.planIndex,
      "data-status": status,
      "data-status-source": row.statusSource,
      "data-selected": row.selected ? "true" : "false",
      "data-active": row.active ? "true" : "false",
      "aria-pressed": row.selected ? "true" : "false",
      title: row.title,
      onClick: function () {
        wfStepFire(fire.onSelectStep, row.index);
      },
    },
    h("span", { className: "wf-step-ring", key: "ring", "aria-hidden": "true" }, glyph),
    h(
      "span",
      { className: "wf-step-main", key: "main" },
      h("span", { className: "wf-step-title", key: "title" }, row.title),
      row.reportSummary === "" || compact
        ? null
        : h("span", { className: "wf-step-sum", key: "sum", title: row.reportSummary }, row.reportSummary),
      h(
        "span",
        { className: "wf-step-meta", key: "meta" },
        h("span", { className: "wf-badge", key: "badge" }, say(wfStatusSayKey(status))),
        row.requiresConfirmation
          ? h(
              "span",
              { className: "wf-step-flag", key: "flag", title: say("panel.step.confirm") },
              say("panel.step.confirm")
            )
          : null
      ),
 // "working ..." only on the step that is running right now: a 6 px breathing dot
 // plus a three-dot ellipsis. It sits under the title line, so a running card never
 // reflows the two-line clamp of `.wf-step-title`.
      status === "running" ? wfRenderLive(h, say, "step") : null
    ),
    h("span", { className: "wf-step-seq", key: "seq" }, wfPad2(position + 1) + "/" + wfPad2(total))
  );

  return h(
    "li",
    {
      className: "wf-step-item",
      key: "step-" + row.index,
      "data-step-index": row.index,
      "data-status": status,
      "data-selected": row.selected ? "true" : "false",
      "data-detail": compact ? "title" : "summary",
    },
 // the disclosure triangle is a real <button>, a SIBLING of the card (a
 // button inside a button is invalid HTML and unreachable by keyboard). The <li> is a
 // one-column grid, so the triangle and the card share cell 1/1: the triangle spans the
 // card's full height in the 20 px band the card reserves with padding-left, and the
 // card stays a DIRECT child (the running-frame ring and FlowEffects query it that way).
    compact
      ? null
      : wfTri(h, open, function () {
          wfStepFire(fire.onStepInfo, row.index);
        }, {
          key: "tri",
          data: "step-tri",
          label: say(open ? "panel.step.collapse" : "panel.step.expand"),
          controls: "wf-step-detail-" + row.index,
        }),
    card,
 // The 「i」 is a SIBLING of the card too (same reason as the triangle): it is absolutely
 // positioned inside the 26 px right band the card reserves, so the title never runs
 // underneath it. keeps it — two entry points, one state source.
    compact ? null : h(
      "button",
      {
        type: "button",
        className: "wf-step-info",
        key: "info",
        "data-dsh-workflow-map": "step-info",
        "data-step-index": row.index,
        "data-open": open ? "true" : "false",
        "aria-expanded": open ? "true" : "false",
        "aria-controls": "wf-step-detail-" + row.index,
        title: say(open ? "panel.step.detailClose" : "panel.step.detailOpen"),
        "aria-label": say(open ? "panel.step.detailClose" : "panel.step.detailOpen"),
        onClick: function () {
          wfStepFire(fire.onStepInfo, row.index);
        },
      },
      "i"
    ),
 // the rail carries the number, its age and its projection. `compact` is passed on
 // the row because the dock renders the two-line layout only when there is room for it.
    wfRenderProgressDock(h, compact ? { ...row, compact: true } : row, say, info && info.asOf),
    open ? wfRenderStepDetail(h, detail, say, actions) : null,
    position + 1 < total
      ? h("span", {
          className: "wf-step-link",
          key: "link",
          "aria-hidden": "true",
          "data-done": status === "done" ? "true" : "false",
        })
      : null
  );
}

/**
 * The whole left column: a sticky header inside an internally scrolling list, so
 * a 15-step plan keeps its "total steps · 5/15" caption while the cards move.
 */
function wfRenderStepColumn(h, model, say, actions, ui) {
  var total = model.steps.length;
 // `ui` is the closed step index (number) or null; the detail itself is built by store.js
 // for the selected step only, so a stale index can never render another step's report.
  var detail = model.detail && model.detail.index === model.selected ? model.detail : null;
  var header = h(
    "div",
    { className: "wf-col-h wf-col-h-sticky", key: "h" },
    h("span", { key: "label" }, say("panel.steps")),
    h("span", { className: "wf-count", key: "count" }, model.progress.done + "/" + model.progress.total),
    wfRenderStepHead(h, detail, say)
  );

  return h(
    "div",
    {
      className: "wf-col wf-col-steps",
      key: "left",
      "data-dsh-workflow-map": "steps",
      "data-many": total > WF_STEP_MANY ? "true" : "false",
    },
    h(
      "div",
      { className: "wf-scroll wf-steps-scroll", key: "list" },
      header,
      h(
        "ul",
        { className: "wf-steps", key: "steps", role: "list" },
        model.steps.map(function (row, position) {
          return wfRenderStepItem(h, row, position, total, say, actions, {
            detail: detail,
            open: detail !== null && !(model.settings && model.settings.detail === "title") && wfStepDetailOpen(ui, model.selected),
            compact: !!(model.settings && model.settings.detail === "title"),
 // the shared "now" for every rail's age arithmetic. `view.asOf` is the
 // host's own stamp (the ONE honest clock in the plugin); `model.now` is the render
 // moment the panel passed in and is only a fallback for a view that carries none.
            asOf: model.asOf === null || model.asOf === undefined ? model.now : model.asOf,
          });
        })
      )
    )
  );
}
