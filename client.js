// dsh-workflow-map — client half (step-13: the panel moved from the shell overlay
// into the sidebar rail + main content area; step-12 settings/export, step-11
// details, step-10 living layer, step-09 branch lanes all remain).
// GENERATED FILE — do not edit by hand. Sources: src/client/theme.js,
// src/client/store.js, src/client/Settings.js, src/client/pulse.js,
// src/client/ProgressUnder.js, src/client/StepDetail.js, src/client/StepColumn.js,
// src/client/NodeDetail.js, src/client/NodeCard.js, src/client/export.js,
// src/client/FlowColumn.js, src/client/Branches.js, src/client/FlowEffects.js,
// src/client/panel.js.
// Rebuild: node tools/build-client.mjs

window.__ModuleLoader__.load({
  id: "dsh-workflow-map",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
    var h = React.createElement;

    // One namespace for the bundle, the slot descriptor's `locale` field and
    // locale.register: they must agree, or the dictionary is not found.
    var NS = "dsh-workflow-map";
    // step-13: ONE id addresses both seats — the sidebar rail row and the main panel.
    var PANEL_ID = "workflow-map";
    var PANEL_ORDER = 10;

    // ===== src/client/theme.js =====
    /**
     * theme.js — the ONE place that owns colours, sizes, timings and CSS for the panel.
     *
     * This file is a plain chunk, not a module: tools/build-client.mjs inlines it into
     * client.js (the browser half must stay a single file — the ModuleLoader gives the
     * factory a `require` that only knows the harness builtins, so a second local file
     * could never be resolved at runtime).
     *
     * Colours are read from the harness theme tokens and every one of them carries a
     * concrete fallback: an unknown token must degrade to a readable panel, never to
     * transparent text on a transparent card. The token names below are the ones
     * Cordis Inspect (client/Theme) reports as live in this build:
     * --dsw-alias-bg-base / bg-layer-1 / bg-layer-2 / bg-overlay
     * --dsw-alias-border-l1 / l2
     * --dsw-alias-brand-primary
     * --dsw-alias-label-primary / secondary
     * --dsw-alias-state-success-primary / warn / error / idle
     * (--dsw-alias-label-tertiary is NOT in that list; it is still written with a
     * fallback because the contract names it, and a future build may add it.)
     */

    var WF_STYLE_ID = "dsh-workflow-map-css";

    /** localStorage key for {width, height, collapsed, selectedStep}. */
    var WF_PREFS_KEY = "dsh-workflow-map:prefs";

    /** Poll cadence: 800 ms while the page is visible, 3 s while it is hidden. */
    var WF_POLL_VISIBLE = 800;
    var WF_POLL_HIDDEN = 3000;

    /**
     * Geometry . The main content area owns the size now: WIDTH/HEIGHT are no
     * longer dragged or persisted, only the bounds and the historical default survive so
     * a stored record from ..12 still sanitises into a valid value.
     * MIN_WIDTH a sane lower bound for the centred column's content
     * MAX_HEIGHT the tallest the settings card may ever become (bounded independently)
     */
    var WF_DEFAULT_WIDTH = 720;
    var WF_DEFAULT_HEIGHT = 0;
    var WF_MIN_WIDTH = 360;
    var WF_MAX_WIDTH = 1200;
    var WF_MIN_HEIGHT = 220;
    var WF_MAX_HEIGHT = 860;
    /** The panel now lives in the layout's centre column, so it carries no z-index at all
     * (stacking inside the column is ordinary document order). Kept as a named constant
     * so a future overlay seat can reintroduce one deliberately. */
    var WF_Z_INDEX = 0;
    var WF_DEFAULT_COLLAPSED = false;
    /** presentation prefs. Values are an allow-list: a hand-edited localStorage
     * record can only pick one of these, never invent a new visual mode. */
    var WF_PALETTES = ["rainbow", "brand", "soft"];
    var WF_MOTIONS = ["full", "always", "static"];
    var WF_DETAIL_MODES = ["summary", "title"];
    /** 0 means "all" (no window), matching the 4th choice in the settings card. */
    var WF_NODE_LIMITS = [30, 60, 120, 0];

    /**
     * Step-card geometry , also asserted by tools/selftest-panel.mjs and
     * measured in the browser by tools/measure-panel.ps1:
     * STEP_GAP air between a card's bottom border and its progress rail (8 px)
     * STEP_RAIL the rail track's thickness (6 px)
     * STEP_LINK the connector line between two cards (14 px)
     * STEP_MANY from this many cards up the column scrolls and its header sticks
     */
    var WF_STEP_GAP = 8;
    var WF_STEP_RAIL = 6;
    var WF_STEP_LINK = 14;
    var WF_STEP_MANY = 8;

    /**
     * Flow-column limits , asserted by tools/selftest-panel.mjs:
     * FLOW_CAP nodes drawn by default — the newest ones, the list opens at the bottom
     * GROUP_MIN consecutive same-tool calls that fold into one row (mirrors the host's
     * GROUP_THRESHOLD in src/fold.mjs; the browser only applies it when the
     * host sent no groups, e.g. a state captured before withGroups existed)
     */
    var WF_FLOW_CAP = 60;
    var WF_GROUP_MIN = 3;

    /**
     * Branch lanes , asserted by tools/selftest-panel.mjs:
     * BRANCH_SHOWN lanes drawn per step (mirrors the host's BRANCHES_SHOWN); the rest are
     * reported as "+n more" - never silently dropped
     * BRANCH_LINK the coloured connector from the main track into a lane (6 px)
     */
    var WF_BRANCH_SHOWN = 4;
    var WF_BRANCH_LINK = 6;

    /**
     * Chain geometry (the chain layout) - asserted by tools/selftest-effects.mjs, measured in a
     * browser by tools/measure-effects.ps1.
     *
     * WHY THE NUMBERS LIVE HERE: the step's whole point is that the flow stops looking cramped, and
     * "cramped" is four distances, not a feeling. Keeping them in the theme is what makes the browser
     * measurement (a real getBoundingClientRect difference) and the stylesheet agree on ONE source.
     * CHAIN_GAP node-to-node air on the spine (28 px). The chain reads as links, not a stack.
     * CHAIN_LINK the bezier channel between two nodes (14 px of drawing room inside the gap).
     * CHAIN_GAP must stay >= CHAIN_LINK so a connector never overflows its gap.
     * CHAIN_PAD the breathing room between the spine and a card's left edge (12 px).
     * CHAIN_BRANCH how far a branch dashes AWAY from the node before its round icon (34 px).
     * CHAIN_ICON the round category icon's diameter (22 px — the step allows 20–24).
     * CHAIN_RING the flowing halo around a running icon, as an inset overshoot (2 px).
     */
    var WF_CHAIN_GAP = 28;
    var WF_CHAIN_LINK = 14;
    var WF_CHAIN_PAD = 12;
    var WF_CHAIN_BRANCH = 34;
    var WF_CHAIN_ICON = 22;
    var WF_CHAIN_RING = 2;
    /**
     * The living layer — asserted by tools/selftest-effects.mjs and measured in a
     * browser by tools/measure-effects.ps1:
     * FX_RAINBOW the six-stop rainbow the flowing curve and both wrapped frames share
     * FX_BRAND the brand-coloured alternative (`data-curve="brand"`, may switch it)
     * CURVE_MODE which one the layer starts in
     * FX_STROKE the crisp stroke width of the curve
     * FX_GLOW the blurred halo width (one extra path, 2.5 px blur — a glow, not a shadow)
     * FX_DASH dash on/off; the keyframes slide `stroke-dashoffset`, so the colour flows
     * FX_RING the conic-ish gradient of the wrapped frame (300 % wide, slid by keyframes)
     * The blinking rhythm is 1.2 s and lives in two places on purpose: WF_PULSE_PERIOD (pulse.js,
     * read by the self-test) and the `1.2s` literals below (this file builds the CSS before
     * pulse.js has run, so it cannot read that constant). tools/selftest-effects.mjs asserts the
     * two agree.
     */
    var WF_FX_RAINBOW = ["#ff2d78", "#ff9f1a", "#ffe14d", "#37d67a", "#18b6ff", "#8f7bea"];
    var WF_FX_BRAND = ["#5b8cff", "#8f7bea", "#5b8cff"];
    var WF_CURVE_MODE = "rainbow";
    var WF_FX_STROKE = 2;
    var WF_FX_GLOW = 6;
    var WF_FX_DASH = "9 7";
    var WF_FX_SPEED = "1.1s";
    var WF_FX_RING = "linear-gradient(90deg," + WF_FX_RAINBOW.join(",") + "," + WF_FX_RAINBOW[0] + ")";
    var WF_LIVE_PERIOD = "1.2s";

    /**
     * single-page chain geometry. ONE vertical run of step units; each unit hangs a few
     * round satellites off its LEFT (read / query) and RIGHT (write / edit / tool) edges, joined by
     * STRAIGHT lines (straight connectors were requested, not the old bezier channel).
     *
     * PAGE_PAD air between the scroller edge and a satellite circle
     * SATELLITE round icon diameter (30 px — a top-level click target, bigger than the 22 px
     * in-node category chip, because this one carries a count AND a label)
     * SAT_LINK the horizontal run from a unit's edge to its circle
     * UNIT_GAP air between two consecutive main-flow units (the "as much spacing as possible" requirement)
     * UNIT_LINK the straight connector drawn inside that gap
     * SIDE_SLOTS circles a side may carry: 2 left + 2 right per unit (user decision)
     * SIDE_FILES calls one circle stands for before it stops listing them
     */
    var WF_PAGE_PAD = 16;
    var WF_SATELLITE = 30;
    var WF_SAT_LINK = 28;
    var WF_UNIT_GAP = 56;
    var WF_UNIT_LINK = 2;
    var WF_SIDE_SLOTS = 2;
    var WF_SIDE_FILES = 60;

    /**
     * what the right-hand page can show. `step` = one step's record, `type` = every call of
     * one tool file type, `inject` = the hot-inject composer. An allow-list, because the value is
     * persisted and a hand-edited record must not be able to invent a fourth page.
     */
    var WF_RIGHT_KINDS = ["step", "type", "inject"];

    /** One CSS rule set, injected as <style id="dsh-workflow-map-css"> and removed on unmount. */
    var WF_CSS = [
     /* root : the panel IS the main content area. No fixed box, no corner anchor,
         no click-through layer — the layout gives it the centre column and it fills it. */
      ".wf-root{position:relative;width:100%;height:100%;min-height:0;display:flex;flex-direction:column;" +
     // the three branch hues live on the ROOT, so the dashed branches and their round
     // icons share one palette with the rest of the panel (and one place to change it).
        "--wf-chain-read:#5b8cff;--wf-chain-edit:#e0a13a;--wf-chain-tool:#8f7bea;" +
        "font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;font-size:12px;line-height:1.5}",

     /* card: fills the main area; the header and the settings card keep their own height,
         the two-column body takes the rest. No drag grips: the column has no free edges.
         Flush edges on purpose (step-13): a 12 px rounded box floating inside the centre column
         would read as the old overlay again. */
      ".wf-card{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;min-width:0;" +
        "border-radius:0;overflow:hidden;" +
        "background:var(--dsw-alias-bg-base,#161920);color:var(--dsw-alias-label-primary,#e9ecf3)}",
     /* header */
      ".wf-head{display:flex;align-items:flex-start;gap:8px;padding:9px 10px 8px 14px;" +
        "border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));" +
        "background:var(--dsw-alias-bg-layer-1,#232733)}",
      ".wf-head-text{flex:1;min-width:0}",
      ".wf-task{font-size:12.5px;font-weight:600;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wf-meta{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:11px;color:var(--dsw-alias-label-secondary,#9aa3b2);flex-wrap:wrap}",
      ".wf-pct{color:var(--dsw-alias-brand-primary,#5b8cff);font-variant-numeric:tabular-nums;font-weight:600}",
      ".wf-sep{opacity:.5}",
      ".wf-status-bad{color:var(--dsw-alias-state-warn-primary,#e0a13a)}",
      ".wf-btns{display:flex;gap:3px;flex:0 0 auto}",
      ".wf-btn{width:23px;height:23px;padding:0;border-radius:6px;border:1px solid transparent;background:transparent;" +
        "color:var(--dsw-alias-label-secondary,#9aa3b2);font:inherit;font-size:13px;line-height:1;cursor:pointer;" +
        "display:inline-flex;align-items:center;justify-content:center}",
      ".wf-btn:hover{background:var(--dsw-alias-bg-layer-2,#2c3140);color:var(--dsw-alias-label-primary,#e9ecf3)}",
      ".wf-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-btn[data-active='true']{color:var(--dsw-alias-brand-primary,#5b8cff);border-color:var(--dsw-alias-brand-primary,#5b8cff)}",
     // Hot injection is the one header action that injects text into the RUNNING turn, so it is the
     // one that must never be hunted for: a named, filled chip that keeps its name in Chinese.
     // User feedback: "too small, still have to open it first" - so it grows to 96x30 (the other two in the row stay
     // 23x23 and it sets this row's height), gets a solid brand background, and carries an "N awaiting pickup" badge. The badge is driven only by
     // the count of status==='pending' rows in model.injects; with no pending rows the button carries no badge at all.
      ".wf-btn-hot{position:relative;width:auto;min-width:96px;height:30px;padding:0 14px;gap:5px;" +
        "font-size:12.5px;font-weight:600;letter-spacing:.01em;" +
        "color:var(--dsw-alias-bg-base,#161920);background:var(--dsw-alias-brand-primary,#5b8cff);" +
        "border-color:transparent;box-shadow:0 0 0 1px rgba(91,140,255,.45),0 2px 10px rgba(91,140,255,.30)}",
      ".wf-btn-hot:hover{filter:brightness(1.08);color:var(--dsw-alias-bg-base,#161920)}",
      ".wf-btn-hot[data-active='true']{box-shadow:0 0 0 2px var(--dsw-alias-bg-base,#161920)," +
        "0 0 0 3px var(--dsw-alias-brand-primary,#5b8cff)}",
     // The badge is a real <span>, not a pseudo-element: the count is text a screen reader can read,
     // and the button keeps `data-pending-count` so the layout self-test can measure it.
      ".wf-inject-badge{position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 4px;" +
        "border-radius:9px;background:var(--dsw-alias-state-error-primary,#e85a5a);color:#fff;" +
        "font-size:9.5px;font-weight:700;line-height:16px;text-align:center;font-variant-numeric:tabular-nums;" +
        "box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1,#232733);pointer-events:none}",

     /* settings strip (skeleton: endpoint / counts / reset) */
      ".wf-settings{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:7px 12px;font-size:11px;" +
        "color:var(--dsw-alias-label-secondary,#9aa3b2);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1))}",
      ".wf-kv{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}",
      ".wf-link{padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.2));" +
        "background:transparent;color:inherit;font:inherit;cursor:pointer}",
      ".wf-link:hover{border-color:var(--dsw-alias-brand-primary,#5b8cff);color:var(--dsw-alias-label-primary,#e9ecf3)}",

     /* body: the two columns the whole step is about */
      ".wf-body{display:grid;grid-template-columns:minmax(240px,44%) 1fr;gap:10px;padding:10px;overflow:hidden;min-height:0;flex:1 1 auto}",
      ".wf-body[data-kind='planning']{grid-template-columns:1fr}",
      ".wf-col{display:flex;flex-direction:column;gap:6px;min-width:0;min-height:0;overflow:hidden}",
      ".wf-col-h{display:flex;align-items:baseline;gap:8px;min-width:0;font-size:11px;font-weight:600;letter-spacing:.02em;" +
        "color:var(--dsw-alias-label-secondary,#9aa3b2)}",
      ".wf-col-sub{font-weight:400;color:var(--dsw-alias-label-tertiary,#7d8798);white-space:nowrap;overflow:hidden;" +
        "text-overflow:ellipsis;min-width:0}",
      ".wf-count{margin-left:auto;font-weight:400;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-scroll{display:flex;flex-direction:column;gap:5px;min-height:0;overflow:auto;padding-right:2px;scrollbar-width:thin}",
      ".wf-col>.wf-scroll{flex:1 1 auto}",

     /* step column (left): cards, the rail under each card, the connector between them */
      ".wf-steps-scroll{flex:1 1 auto}",
      ".wf-col-h-sticky{position:sticky;top:0;z-index:3;padding:2px 0 6px;" +
        "background:var(--dsw-alias-bg-overlay,#1c1f27)}",
     // the step column gets the SAME chain air the flow column got: the cards are now
     // WF_CHAIN_GAP apart (they were 8 px + a 14 px connector), so the two columns read as one
     // document. `gap` replaces the per-connector margin, which is why the link below no longer
     // carries a `margin-top` of its own.
      ".wf-steps{display:flex;flex-direction:column;gap:" + WF_CHAIN_GAP + "px;list-style:none;margin:0;" +
        "padding:0;min-height:0}",
     // the disclosure triangle is a real <button> in the 20 px band the card
     // reserves with padding-left. One-column grid ⇒ the triangle and the card share cell 1/1,
     // so the triangle spans the card's whole height; the card stays a DIRECT child of the
     // <li> (the running-frame ring and FlowEffects both query `.wf-step-item > .wf-step-card`).
      ".wf-step-item{display:grid;grid-template-columns:1fr;list-style:none}",
     // `grid-area:1/1` is what makes the triangle and the card share the cell: without it the
     // auto-placement cursor would drop the card into row 2, below the triangle.
      ".wf-step-card{grid-area:1/1;display:flex;gap:8px;align-items:flex-start;width:100%;padding:7px 8px;border-radius:8px;text-align:left;" +
        "font:inherit;color:inherit;cursor:pointer;border:1px solid transparent;" +
        "background:var(--dsw-alias-bg-layer-2,#282d3a);border-left:3px solid transparent}",
      ".wf-step-card:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.22));" +
        "background:var(--dsw-alias-bg-layer-1,#232733)}",
      ".wf-step-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-step-card[data-selected='true']{border-color:var(--dsw-alias-brand-primary,#5b8cff);" +
        "background:var(--dsw-alias-bg-layer-1,#232733)}",
      ".wf-step-card[data-active='true']{border-left-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-step-ring{flex:0 0 auto;width:18px;height:18px;margin-top:1px;border-radius:50%;" +
        "display:inline-flex;align-items:center;justify-content:center;font-size:11px;line-height:1;" +
        "border:1px solid currentColor;color:var(--dsw-alias-state-idle-primary,#7d8798)}",
      ".wf-step-item[data-status='done'] .wf-step-ring{color:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-step-item[data-status='running'] .wf-step-ring{color:var(--dsw-alias-brand-primary,#5b8cff);" +
        "animation:wf-ring 1.6s ease-in-out infinite}",
      ".wf-step-item[data-status='failed'] .wf-step-ring{color:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-step-item[data-status='pending'] .wf-step-ring{color:var(--dsw-alias-state-idle-primary,#7d8798)}",
      ".wf-step-item[data-status='skipped'] .wf-step-ring{color:var(--dsw-alias-label-tertiary,#7d8798);border-style:dashed}",
      ".wf-step-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
      ".wf-step-title{font-size:12px;line-height:1.35;color:var(--dsw-alias-label-primary,#e9ecf3);" +
        "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}",
      ".wf-step-sum{font-size:10.5px;line-height:1.4;color:var(--dsw-alias-label-tertiary,#7d8798);" +
        "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}",
      ".wf-step-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:10.5px;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798);font-variant-numeric:tabular-nums}",
      ".wf-step-seq{flex:0 0 auto;font-size:10.5px;line-height:1.6;letter-spacing:.02em;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798);font-variant-numeric:tabular-nums}",
      ".wf-step-flag{padding:0 5px;border-radius:999px;font-size:10px;line-height:15px;" +
        "color:var(--dsw-alias-state-warn-primary,#e0a13a);border:1px solid currentColor}",
     // the card of a step that is waiting on a human gets a warn-toned left edge, so the
     // flag is visible even when the badge row has scrolled out of the card's visible text.
      ".wf-step-item[data-confirm='true']>.wf-step-card{box-shadow:inset 2px 0 0 var(--dsw-alias-state-warn-primary,#e0a13a)}",
      ".wf-unit[data-confirm='true'] .wf-unit-ring{color:var(--dsw-alias-state-warn-primary,#e0a13a)}",
      ".wf-step-card[data-selected='true'] .wf-step-title{font-weight:600}",
     /* status badges */
      ".wf-badge{padding:0 5px;border-radius:999px;font-size:10px;line-height:15px;border:1px solid currentColor}",
      ".wf-step-item[data-status='done'] .wf-badge{color:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-step-item[data-status='running'] .wf-badge{color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-step-item[data-status='pending'] .wf-badge{color:var(--dsw-alias-state-idle-primary,#7d8798)}",
      ".wf-step-item[data-status='failed'] .wf-badge{color:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-step-item[data-status='skipped'] .wf-badge{color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-step-item[data-status='pending'] .wf-step-title{color:var(--dsw-alias-label-secondary,#9aa3b2)}",
      ".wf-step-item[data-status='skipped'] .wf-step-title{color:var(--dsw-alias-label-tertiary,#7d8798);" +
        "text-decoration:line-through}",

     /* the rail: WF_STEP_GAP of air below the card frame, WF_STEP_RAIL tall.
         step-03: the dock is a two-line block — line 1 is the 6 px track + the percent, line 2
         the secondary age fact. `flex-direction:column` keeps them stacked without the
         track losing a pixel of width, and the whole block stays right-aligned. */
      ".wf-prog-dock{display:flex;flex-direction:column;gap:2px;margin-top:" + WF_STEP_GAP + "px}",
      ".wf-prog-row{display:flex;align-items:center;gap:6px;height:" + WF_STEP_RAIL + "px}",
     /* the second line. Tertiary colour, one font step below the percent, tabular
         figures so a ticking age does not jitter its own width, nowrap so it never wraps
         into a third line and eats the card below. */
      ".wf-prog-sub{display:flex;align-items:center;justify-content:flex-end;gap:4px;min-width:0;" +
        "font-size:9px;line-height:1.2;color:var(--dsw-alias-label-tertiary,#7d8798);" +
        "font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".wf-prog-ago{flex:0 0 auto}",
     // (2026-10-26, measured by tools/measure-panel.ps1): in the single-page layout the dock
     // is a child of the `gap:8px` centre column, so its own margin added a SECOND 8 px and the
     // documented "8 px of air under the card" measured 16 px. Scoped away for that placement only.
      ".wf-unit-center>.wf-prog-dock{margin-top:0}",
     /* Narrow container (`detail = title`): line 2 is dropped, not squeezed. */
      ".wf-step-item[data-detail='title'] .wf-prog-dock{height:" + WF_STEP_RAIL + "px;gap:0}",
      ".wf-step-item[data-detail='title'] .wf-prog-sub{display:none}",
     /* THE ONE ANIMATED RAIL and THE ONE ANIMATED FILL.
         The user's rule: exactly ONE step's rail may animate, and it must be a real PROGRESS bar
         (a measured fill + a number), never a plain scrolling streamer. Two consequences
         are encoded here:
           1. only `.wf-unit[data-running='true']` — the single row the host marks as running — gets
              the flowing gradient; every other running-looking row stays a flat fill;
           2. a running row with no number yet gets a determinate-looking 30 % fill with the SAME
              gradient and NO slide animation, so it reads "working, unknown how far" instead of
              "a separate streamer is spinning". `data-indeterminate` is still emitted for tests. */
      ".wf-prog-track{position:relative;flex:1 1 auto;height:" + WF_STEP_RAIL + "px;border-radius:3px;overflow:hidden;" +
        "background:var(--dsw-alias-bg-base,rgba(0,0,0,.3));border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1))}",
      ".wf-prog-fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:3px;" +
        "background:var(--dsw-alias-label-secondary,#9aa3b2);transition:width .35s ease}",
      ".wf-prog-dock[data-status='done'] .wf-prog-fill{background:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-prog-dock[data-status='failed'] .wf-prog-fill{background:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-prog-fill[data-live='true']{background:linear-gradient(90deg,var(--dsw-alias-brand-primary,#5b8cff),#8f7bea,var(--dsw-alias-brand-primary,#5b8cff));" +
        "background-size:200% 100%;animation:wf-prog-flow 1.5s linear infinite}",
      ".wf-prog-dock[data-status='pending'] .wf-prog-fill,.wf-prog-dock[data-status='skipped'] .wf-prog-fill{" +
        "width:0!important;background:transparent;animation:none}",
      ".wf-prog-fill[data-indeterminate='true']{width:30%!important;animation:wf-prog-flow 1.5s linear infinite}",
      ".wf-prog-dock[data-status='skipped'] .wf-prog-track{border-style:dashed}",
      ".wf-prog-label{flex:0 0 auto;font-size:10px;line-height:1;color:var(--dsw-alias-label-tertiary,#7d8798);" +
        "font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".wf-prog-label[data-kind='estimate']{font-style:italic}",
      ".wf-prog-label[data-kind='self']{color:var(--dsw-alias-label-secondary,#9aa3b2)}",

     /* connector between two cards: WF_STEP_LINK tall, solid once the step above is done */
     /* connector between two cards: WF_STEP_LINK tall, solid once the step above is done.
         step-02: the line moves 3 px right with the card's new 20 px triangle band, so it still
         hangs off the ring's centre (the band is 20 px, the ring starts 20 + 8 px padding).
         step-05: the column now carries the chain's `gap`, so the connector must NOT add a margin —
         that would make the space between two step cards (gap + margin + link) larger than the hole
         its own line is drawn in. WF_STEP_LINK stays the drawn height. */
      ".wf-step-link{display:block;position:relative;height:" + WF_STEP_LINK + "px}",
      ".wf-step-link::before{content:'';position:absolute;left:29px;top:0;bottom:0;width:2px;border-radius:1px;" +
        "background:var(--dsw-alias-border-l2,rgba(255,255,255,.22))}",
      ".wf-step-link[data-done='true']::before{background:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-step-link[data-done='false']::before{background:repeating-linear-gradient(180deg," +
        "var(--dsw-alias-border-l2,rgba(255,255,255,.22)) 0 3px,transparent 3px 6px)}",
      "@keyframes wf-prog-flow{from{background-position:0 0}to{background-position:-200% 0}}",
      "@keyframes wf-prog-slide{0%{transform:translateX(-110%)}100%{transform:translateX(360%)}}",
      "@keyframes wf-ring{0%,100%{opacity:1}50%{opacity:.45}}",
      "@media (prefers-reduced-motion: reduce){.wf-prog-fill,.wf-step-ring{animation:none}}",

     /* flow column (right): one spine, node cards hang off it, groups fold runs */
      ".wf-flow{flex:1 1 auto;min-height:0}",
      ".wf-flow-h{display:flex;align-items:baseline;gap:8px;flex:0 0 auto;padding:0 0 6px;" +
        "border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12))}",
      ".wf-flow-h .wf-col-sub{flex:1 1 auto;min-width:0}",
      ".wf-flow-h .wf-count{flex:0 0 auto;margin-left:auto;white-space:nowrap}",
      ".wf-flow-scroll{flex:1 1 auto;padding-top:4px}",
     /* Chain layout: the list stops being a 5 px stack and becomes a CHAIN - WF_CHAIN_GAP of
         air between neighbours (a real distance, so a link can be drawn in it), the spine inset by
         WF_CHAIN_PAD, and every card one link further right. `gap` alone would be enough for the
         spacing; the padding and the gap come from the SAME constants the browser measurement reads.
         The spine is still a pseudo-element, but it is now only the fallback for the no-JS case: the
         measured bezier channel (FlowEffects.js) paints over it and the `data-chain` attribute on the
         list says which one is live. */
      ".wf-flow-list{position:relative;display:flex;flex-direction:column;gap:" + WF_CHAIN_GAP + "px;" +
        "list-style:none;margin:0;padding:0 0 0 " + (WF_CHAIN_PAD + 2) + "px}",
      ".wf-flow-list[data-chain='curve']::before{opacity:.45}",
      ".wf-flow-list::before{content:'';position:absolute;left:4px;top:6px;bottom:6px;width:2px;border-radius:1px;" +
        "background:var(--dsw-alias-border-l2,rgba(255,255,255,.22))}",
      ".wf-flow-list[data-empty='true']::before{display:none}",
      ".wf-flow-list[data-truncated='true']::before{background:repeating-linear-gradient(180deg," +
        "var(--dsw-alias-border-l2,rgba(255,255,255,.22)) 0 3px,transparent 3px 6px)}",
      ".wf-flow-item{position:relative;min-width:0}",
      ".wf-flow-item::before{content:'';position:absolute;left:-13px;top:12px;width:6px;height:6px;border-radius:50%;" +
        "background:var(--dsw-alias-border-l2,rgba(255,255,255,.22));box-shadow:0 0 0 2px var(--dsw-alias-bg-overlay,#1c1f27)}",
      ".wf-flow-item[data-status='running']::before{background:var(--dsw-alias-brand-primary,#5b8cff);" +
        "animation:wf-pulse 1.6s ease-in-out infinite}",
      ".wf-flow-item[data-status='error']::before{background:var(--dsw-alias-state-error-primary,#e85a5a)}",

     /* the branch strip under a RUNNING node: 2–4 flowing dashes, each ending in a round
         category icon (read = blue / edit = orange / tool = violet, the three hues below are the
         same ones step-09's wfBranchHue palette covers). Only the running node renders this block,
         so a done or a pending node produces no branch DOM at all. */
      ".wf-branching{position:relative;display:flex;flex-direction:column;gap:5px;margin:" +
        WF_CHAIN_LINK / 2 + "px 0 0 " + WF_CHAIN_PAD + "px}",
      ".wf-branch-row{position:relative;display:flex;align-items:center;gap:7px;min-width:0;padding-left:" +
        WF_CHAIN_BRANCH + "px;min-height:" + WF_CHAIN_ICON + "px}",
     // the flowing dash itself: one absolutely positioned SVG per row, drawn by FlowEffects.js as a
     // cubic bezier from the spine out to the icon. Conic-gradient would colour it flat, so the
     // stroke carries a gradient id and the dash slides with `stroke-dashoffset` ('s ruse).
      ".wf-branch-stroke{position:absolute;left:0;top:0;width:" + WF_CHAIN_BRANCH + "px;height:100%;" +
        "pointer-events:none;overflow:visible}",
      ".wf-branch-core{fill:none;stroke-width:1.8;stroke-linecap:round;stroke-dasharray:4 4;" +
        "animation:wf-fx-dash 1.1s linear infinite}",
      ".wf-branch-row[data-kind='read'] .wf-branch-core{stroke:var(--wf-chain-read,#5b8cff)}",
      ".wf-branch-row[data-kind='edit'] .wf-branch-core{stroke:var(--wf-chain-edit,#e0a13a)}",
      ".wf-branch-row[data-kind='tool'] .wf-branch-core{stroke:var(--wf-chain-tool,#8f7bea)}",
     // the round icon: a real <button> (keyboard-operable, aria-expanded) that IS the circle, so the
     // 22 px diameter below is the measured diameter and not an inner badge.
      ".wf-branch-icon{flex:0 0 auto;width:" + WF_CHAIN_ICON + "px;height:" + WF_CHAIN_ICON + "px;padding:0;" +
        "border-radius:50%;display:inline-flex;align-items:center;justify-content:center;" +
        "font:inherit;font-size:11px;line-height:1;cursor:pointer;position:relative;" +
        "background:var(--dsw-alias-bg-layer-2,#282d3a);color:var(--dsw-alias-label-secondary,#9aa3b2);" +
        "border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.28))}",
      ".wf-branch-icon:hover{color:var(--dsw-alias-label-primary,#e9ecf3)}",
      ".wf-branch-icon:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:2px}",
      ".wf-branch-row[data-kind='read'] .wf-branch-icon{color:var(--wf-chain-read,#5b8cff);border-color:currentColor}",
      ".wf-branch-row[data-kind='edit'] .wf-branch-icon{color:var(--wf-chain-edit,#e0a13a);border-color:currentColor}",
      ".wf-branch-row[data-kind='tool'] .wf-branch-icon{color:var(--wf-chain-tool,#8f7bea);border-color:currentColor}",
     // "the running circle is wrapped in flowing colour" - the same mask-composite ring wraps the two cards in,
     // sized to the icon: 2 px of paint outside the circle, slid by background-position.
      ".wf-branch-row[data-live='true'] .wf-branch-icon::after{content:'';position:absolute;inset:-" +
        WF_CHAIN_RING + "px;border-radius:50%;padding:" + WF_CHAIN_RING + "px;background:" + WF_FX_RING + ";" +
        "background-size:300% 100%;animation:wf-fx-wrap 2.6s linear infinite;pointer-events:none;" +
        "-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;" +
        "mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude}",
      ".wf-branch-label{flex:1 1 auto;min-width:0;font-size:10.5px;line-height:1.35;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wf-branch-open .wf-branch-label{color:var(--dsw-alias-label-secondary,#9aa3b2)}",
     // the opened category detail: the SAME .wf-node-detail block renders, pulled back to
     // the icon's column so it reads as belonging to the circle that opened it.
      ".wf-branch-body{display:flex;flex-direction:column;gap:4px;margin-left:" + WF_CHAIN_PAD + "px}",
      "@media (prefers-reduced-motion: reduce){.wf-branch-core{animation:none}}",

     /* the "earlier nodes folded" strip above the list */
      ".wf-flow-more{display:flex;align-items:center;gap:8px;padding:5px 8px;margin:6px 0 0;border-radius:8px;" +
        "font-size:10.5px;line-height:1.4;color:var(--dsw-alias-label-tertiary,#7d8798);" +
        "border:1px dashed var(--dsw-alias-border-l2,rgba(255,255,255,.2))}",
      ".wf-flow-more .wf-link{margin-left:auto;flex:0 0 auto}",
     /* node card: icon · title · meta · status dot */
      ".wf-node{display:flex;gap:7px;align-items:flex-start;width:100%;padding:6px 8px;border-radius:8px;" +
        "text-align:left;font:inherit;color:inherit;cursor:pointer;" +
        "background:var(--dsw-alias-bg-layer-2,#282d3a);border:1px solid transparent;" +
        "border-left:3px solid var(--dsw-alias-border-l2,rgba(255,255,255,.2))}",
      ".wf-node:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.24));background:var(--dsw-alias-bg-layer-1,#232733)}",
      ".wf-node:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-node[data-selected='true']{border-color:var(--dsw-alias-brand-primary,#5b8cff);" +
        "background:var(--dsw-alias-bg-layer-1,#232733)}",
      ".wf-node[data-selected='true'] .wf-node-title{font-weight:600}",
      ".wf-node[data-kind='tool']{border-left-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-node[data-kind='report']{border-left-color:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-node[data-kind='question'],.wf-node[data-kind='approval']{border-left-color:var(--dsw-alias-state-warn-primary,#e0a13a)}",
      ".wf-node[data-kind='subagent']{border-left-color:var(--dsw-alias-state-idle-primary,#8f7bea)}",
      ".wf-node[data-status='error']{border-left-color:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-node-icon{flex:0 0 16px;height:16px;margin-top:1px;border-radius:5px;display:inline-flex;align-items:center;" +
        "justify-content:center;font-size:10px;line-height:1;" +
        "background:var(--dsw-alias-bg-base,rgba(0,0,0,.22));color:var(--dsw-alias-label-secondary,#9aa3b2)}",
      ".wf-node[data-category='file'] .wf-node-icon{color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-node[data-category='command'] .wf-node-icon{color:var(--dsw-alias-state-warn-primary,#e0a13a)}",
      ".wf-node[data-category='skill'] .wf-node-icon,.wf-node[data-category='report'] .wf-node-icon{" +
        "color:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-node[data-category='subagent'] .wf-node-icon{color:var(--dsw-alias-state-idle-primary,#8f7bea)}",
      ".wf-node[data-category='question'] .wf-node-icon,.wf-node[data-category='approval'] .wf-node-icon{" +
        "color:var(--dsw-alias-state-warn-primary,#e0a13a)}",
      ".wf-kind{flex:0 0 auto;font-size:10px;line-height:16px;padding:0 5px;border-radius:5px;" +
        "background:var(--dsw-alias-bg-base,rgba(0,0,0,.22));color:var(--dsw-alias-label-secondary,#9aa3b2)}",
      ".wf-node-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
      ".wf-node-title{font-size:11.5px;line-height:1.35;color:var(--dsw-alias-label-primary,#e9ecf3);" +
        "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}",
      ".wf-node[data-compact='true'] .wf-node-title,.wf-step-item[data-detail='title'] .wf-step-sum{-webkit-line-clamp:1}",
      ".wf-node-verb{font-weight:600;color:var(--dsw-alias-label-secondary,#9aa3b2)}",
      ".wf-node-target{color:var(--dsw-alias-label-primary,#e9ecf3)}",
      ".wf-node-meta{display:flex;flex-wrap:wrap;gap:6px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#7d8798);" +
        "font-variant-numeric:tabular-nums}",
      ".wf-node[data-error='true'] .wf-node-meta{color:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-flow-status{flex:0 0 auto;width:7px;height:7px;margin-top:5px;border-radius:50%;" +
        "background:var(--dsw-alias-state-idle-primary,#7d8798)}",
      ".wf-flow-status[data-status='done']{background:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-flow-status[data-status='running']{background:var(--dsw-alias-brand-primary,#5b8cff);" +
        "animation:wf-pulse 1.6s ease-in-out infinite}",
      ".wf-flow-status[data-status='error']{background:var(--dsw-alias-state-error-primary,#e85a5a)}",

     /* a folded run: one dashed row, expanded into its calls on click */
      ".wf-group{display:flex;flex-direction:column;gap:5px;min-width:0}",
      ".wf-group-head{grid-area:1/1;display:flex;gap:7px;align-items:center;width:100%;padding:6px 8px 6px 20px;border-radius:8px;" +
        "text-align:left;font:inherit;color:inherit;cursor:pointer;" +
        "background:var(--dsw-alias-bg-base,rgba(0,0,0,.18));" +
        "border:1px dashed var(--dsw-alias-border-l2,rgba(255,255,255,.2))}",
      ".wf-group-head:hover{border-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-group-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-group[data-expanded='true'] .wf-group-head{border-style:solid;" +
        "border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.28))}",
      ".wf-group-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
      ".wf-group-label{font-size:11.5px;line-height:1.35;color:var(--dsw-alias-label-primary,#e9ecf3);" +
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wf-group-meta{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#7d8798);font-variant-numeric:tabular-nums}",
     // the caret is a real <button> now (wfTri in StepColumn.js), so the row is a
     // one-column grid: triangle and row share cell 1/1 and the triangle spans the row's
     // height in the 20 px band the row reserves with padding-left.
      ".wf-group-row{display:grid;grid-template-columns:1fr}",
      ".wf-group-body{display:flex;flex-direction:column;gap:5px;list-style:none;margin:0 0 0 6px;padding:0 0 0 8px;" +
        "border-left:1px dashed var(--dsw-alias-border-l2,rgba(255,255,255,.2))}",
      ".wf-group-body .wf-flow-item::before{display:none}",
      "@media (prefers-reduced-motion: reduce){.wf-flow-status,.wf-flow-item::before{animation:none}}",

     /* branch lanes : parallel subagent / workflow / background job */
      ".wf-branches{position:relative;display:flex;flex-direction:column;gap:6px;margin-top:10px;padding:0 0 2px 14px}",
      ".wf-branches-h{display:flex;align-items:baseline;gap:8px;font-size:10.5px;font-weight:600;letter-spacing:.02em;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-branches-h .wf-count{margin-left:auto}",
      ".wf-branch{position:relative;min-width:0}",
      ".wf-branch-link{position:absolute;left:-12px;top:14px;width:12px;height:" + WF_BRANCH_LINK + "px;border-radius:3px;" +
        "background:var(--wf-branch-line,#5b8cff)}",
      ".wf-branch-card{border-radius:8px;border:1px solid var(--wf-branch-dim,rgba(91,140,255,.5));" +
        "background:var(--dsw-alias-bg-layer-2,#282d3a);overflow:hidden}",
      ".wf-branch-head{display:flex;align-items:center;gap:6px;width:100%;padding:5px 8px;text-align:left;" +
        "font:inherit;color:inherit;cursor:pointer;background:transparent;border:0}",
      ".wf-branch-head:focus-visible{outline:2px solid var(--wf-branch-line,#5b8cff);outline-offset:1px}",
      ".wf-branch-badge{flex:0 0 auto;padding:0 5px;border-radius:999px;font-size:10px;line-height:15px;" +
        "color:var(--wf-branch-text,#8f7bea);border:1px solid currentColor}",
      ".wf-branch-label{flex:1 1 auto;min-width:0;font-size:11.5px;line-height:1.35;" +
        "color:var(--dsw-alias-label-primary,#e9ecf3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wf-branch-meta{flex:0 0 auto;font-size:10px;color:var(--dsw-alias-label-tertiary,#7d8798);" +
        "font-variant-numeric:tabular-nums}",
      ".wf-branch-dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;" +
        "background:var(--dsw-alias-state-idle-primary,#7d8798)}",
      ".wf-branch-dot[data-status='running']{background:var(--wf-branch-line,#5b8cff);" +
        "animation:wf-pulse 1.6s ease-in-out infinite}",
      ".wf-branch-dot[data-status='done']{background:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-branch-dot[data-status='error']{background:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-branch-caret{flex:0 0 auto;font-size:9px;line-height:1;color:var(--dsw-alias-label-tertiary,#7d8798);" +
        "transition:transform .15s ease}",
      ".wf-branch[data-expanded='true'] .wf-branch-caret{transform:rotate(90deg)}",
      ".wf-branch-body{display:flex;flex-direction:column;gap:3px;list-style:none;margin:0;padding:0 6px 6px 8px}",
      ".wf-branch-row{min-width:0}",
      ".wf-branch-node{display:flex;align-items:center;gap:6px;width:100%;padding:3px 6px;border-radius:6px;" +
        "text-align:left;font:inherit;color:inherit;cursor:pointer;" +
        "background:var(--dsw-alias-bg-base,rgba(0,0,0,.18));border:1px solid transparent}",
      ".wf-branch-node:hover{border-color:var(--wf-branch-dim,rgba(91,140,255,.5))}",
      ".wf-branch-node:focus-visible{outline:2px solid var(--wf-branch-line,#5b8cff);outline-offset:1px}",
      ".wf-branch-node[data-selected='true']{border-color:var(--wf-branch-line,#5b8cff)}",
      ".wf-branch-glyph{flex:0 0 12px;font-size:10px;line-height:1;color:var(--wf-branch-text,#8f7bea);text-align:center}",
      ".wf-branch-row-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}",
      ".wf-branch-row-title{font-size:11px;line-height:1.3;color:var(--dsw-alias-label-primary,#e9ecf3);" +
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wf-branch-row-detail{font-size:10px;line-height:1.35;color:var(--dsw-alias-label-tertiary,#7d8798);" +
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wf-branch-clock{flex:0 0 auto;font-size:10px;color:var(--dsw-alias-label-tertiary,#7d8798);" +
        "font-variant-numeric:tabular-nums}",
      ".wf-branch-phase{padding:1px 6px;font-size:10px;font-weight:600;letter-spacing:.02em;" +
        "color:var(--wf-branch-text,#8f7bea)}",
      ".wf-branch-trunc{padding:1px 6px;font-size:10px;font-style:italic;color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-branch-more{font-size:10px;color:var(--dsw-alias-label-tertiary,#7d8798);padding-left:2px}",
      "@media (prefers-reduced-motion: reduce){.wf-branch-dot{animation:none}}",

      ".wf-empty{padding:10px;border-radius:8px;text-align:center;font-size:11px;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798);border:1px dashed var(--dsw-alias-border-l2,rgba(255,255,255,.2))}",

     /* ===== node detail + step detail ===== */

     /* The 「i」 sits inside the 26 px band the card reserves on its right, so it never
         covers the title or the seq counter. Sibling of the card: valid HTML, Tab-reachable. */
     // the card keeps a 20 px band on its LEFT for the disclosure triangle and the
     // 26 px band on its right for the 「i」; the <li> is a grid (see .wf-step-item above), so
     // both siblings land in cell 1/1 without absolute positioning games on the card side.
      ".wf-step-item{position:relative}",
      ".wf-step-card{padding-left:20px;padding-right:26px}",
     // The ONE disclosure triangle: a full-height band, not an 8 px glyph. `grid-area:1/1` puts
     // it in the card's cell and `align-self:stretch` makes it exactly as tall as the card, so
     // the hit target is 20 px × the card height (measured in the browser by measure-tri.ps1).
     // 10 px glyph on a 20 px band: big enough to read as a control, small enough not to compete
     // with the status ring next to it. The colour lifts on hover/focus and on the open state.
      ".wf-tri{grid-area:1/1;align-self:stretch;justify-self:start;width:20px;min-height:100%;" +
        "padding:8px 0 0;margin:0;border:0;border-radius:6px 0 0 6px;background:transparent;" +
        "color:var(--dsw-alias-label-secondary,#9aa3b2);" +
        "font:inherit;font-size:11px;line-height:1;cursor:pointer;z-index:5;" +
        "display:flex;align-items:flex-start;justify-content:center}",
      ".wf-tri:hover{color:var(--dsw-alias-label-primary,#e9ecf3);background:var(--dsw-alias-bg-layer-1,#232733)}",
      ".wf-tri:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:-2px;border-radius:6px}",
      ".wf-tri[data-expanded='true']{color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-step-info{position:absolute;right:6px;top:6px;width:15px;height:15px;padding:0;border-radius:50%;" +
        "border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.22));background:var(--dsw-alias-bg-base,rgba(0,0,0,.25));" +
        "color:var(--dsw-alias-label-tertiary,#7d8798);font:inherit;font-size:9px;line-height:1;cursor:pointer;z-index:4;" +
        "display:inline-flex;align-items:center;justify-content:center}",
      ".wf-step-info:hover{color:var(--dsw-alias-label-primary,#e9ecf3);border-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-step-info:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-step-info[data-open='true']{color:var(--dsw-alias-brand-primary,#5b8cff);border-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-col-h-sticky{flex-wrap:wrap}",
      ".wf-col-h-sticky .wf-step-head{flex:1 1 100%;margin-top:1px;font-weight:400;font-size:10px;" +
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",

      ".wf-node-detail{margin-top:5px}",
      ".wf-step-detail{margin-top:6px}",
      ".wf-node-detail,.wf-step-detail{position:relative;display:flex;flex-direction:column;gap:5px;min-width:0;" +
        "padding:7px 8px;border-radius:8px;font-size:10.5px;line-height:1.45;" +
        "background:var(--dsw-alias-bg-layer-1,#232733);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12))}",
      ".wf-step-detail[data-status='done']{border-left:3px solid var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-step-detail[data-status='failed']{border-left:3px solid var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-step-detail[data-status='running']{border-left:3px solid var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-group-body .wf-node-detail{margin-left:0}",

      ".wf-detail-head,.wf-step-detail-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}",
      ".wf-detail-icon{flex:0 0 auto;width:15px;height:15px;border-radius:5px;display:inline-flex;align-items:center;" +
        "justify-content:center;font-size:9px;line-height:1;background:var(--dsw-alias-bg-base,rgba(0,0,0,.25));" +
        "color:var(--dsw-alias-label-secondary,#9aa3b2)}",
      ".wf-node-detail[data-category='file'] .wf-detail-icon{color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-node-detail[data-category='command'] .wf-detail-icon{color:var(--dsw-alias-state-warn-primary,#e0a13a)}",
      ".wf-node-detail[data-category='skill'] .wf-detail-icon{color:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-node-detail[data-category='subagent'] .wf-detail-icon,.wf-node-detail[data-category='cad'] .wf-detail-icon{" +
        "color:var(--dsw-alias-state-idle-primary,#8f7bea)}",
      ".wf-detail-name{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-primary,#e9ecf3);word-break:break-all;min-width:0}",
      ".wf-step-detail-title{flex:1 1 auto;min-width:0;font-size:11.5px;font-weight:600;" +
        "color:var(--dsw-alias-label-primary,#e9ecf3)}",
      ".wf-detail-chip,.wf-step-detail-state{flex:0 0 auto;padding:0 5px;border-radius:999px;font-size:9.5px;" +
        "line-height:15px;border:1px solid currentColor;color:var(--dsw-alias-label-secondary,#9aa3b2)}",
      ".wf-detail-chip[data-category='cad'],.wf-detail-chip[data-category='subagent']{color:var(--dsw-alias-state-idle-primary,#8f7bea)}",
      ".wf-detail-chip[data-category='command']{color:var(--dsw-alias-state-warn-primary,#e0a13a)}",
      ".wf-detail-chip[data-category='file']{color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-detail-state[data-state='error'],.wf-step-detail-state[data-status='failed']{color:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-detail-state[data-state='done'],.wf-step-detail-state[data-status='done']{color:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-detail-state[data-state='pending'],.wf-step-detail-state[data-status='pending']{color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-step-detail-state[data-status='running']{color:var(--dsw-alias-brand-primary,#5b8cff)}",

      ".wf-detail-block{display:flex;flex-direction:column;gap:3px;min-width:0}",
      ".wf-detail-block-head{display:flex;align-items:center;gap:6px;min-height:16px;min-width:0}",
      ".wf-detail-label{font-size:10px;font-weight:600;letter-spacing:.02em;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-detail-copy{margin-left:auto;flex:0 0 auto;padding:0 6px;border-radius:6px;" +
        "border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.2));background:transparent;color:inherit;" +
        "font:inherit;font-size:10px;line-height:15px;cursor:pointer}",
      ".wf-detail-copy:hover{border-color:var(--dsw-alias-brand-primary,#5b8cff)}",
     // The acknowledgement lives in its own span: a file row keeps its basename + directory,
     // and the standalone copy button hides its label while the status shows.
      ".wf-copy-status{flex:0 0 auto;margin-left:auto;color:inherit;white-space:nowrap}",
      ".wf-copy-status:empty{display:none}",
      ".wf-detail-copy[data-copy-state='copied'] .wf-copy-label,.wf-detail-copy[data-copy-state='failed'] .wf-copy-label{display:none}",
      ".wf-detail-copy:focus-visible,.wf-detail-file:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-detail-copy[data-copy-state='copied'],.wf-detail-file[data-copy-state='copied']{" +
        "color:var(--dsw-alias-state-success-primary,#45c07a);border-color:currentColor}",
      ".wf-detail-copy[data-copy-state='failed'],.wf-detail-file[data-copy-state='failed']{" +
        "color:var(--dsw-alias-state-error-primary,#e85a5a);border-color:currentColor}",
      ".wf-detail-preview{margin:0;font-family:ui-monospace,SFMono-Regular,Consolas,'Microsoft YaHei',monospace;" +
        "font-size:10px;line-height:1.4;white-space:pre-wrap;word-break:break-all;" +
        "color:var(--dsw-alias-label-secondary,#9aa3b2);max-height:30px;overflow:hidden}",
      ".wf-detail-more{margin-top:1px}",
     // NO ::before glyph here. The triangle belongs to the step card / folded run
     // (a real <button> with aria-expanded); a <details> summary only styles its own marker.
      ".wf-detail-summary{cursor:pointer;font-size:10px;line-height:1.5;list-style:none;" +
        "color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-detail-summary::-webkit-details-marker{display:none}",
      ".wf-detail-summary:hover{text-decoration:underline}",
      ".wf-detail-args{margin:3px 0 0;padding:4px 6px;border-radius:5px;max-height:180px;overflow:auto;" +
        "background:var(--dsw-alias-bg-base,rgba(0,0,0,.25));font-family:ui-monospace,SFMono-Regular,Consolas,'Microsoft YaHei',monospace;" +
        "font-size:10px;line-height:1.4;white-space:pre-wrap;word-break:break-all}",
      ".wf-detail-note{font-size:9.5px;font-style:italic;color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-detail-empty,.wf-detail-result{font-size:10px;color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-detail-result{white-space:pre-wrap;word-break:break-word}",
      ".wf-detail-groups,.wf-detail-group{display:flex;flex-direction:column;gap:3px;min-width:0}",
      ".wf-detail-sublabel{display:flex;align-items:center;gap:4px;font-size:9.5px;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-detail-glyph{font-size:10px;line-height:1}",
      ".wf-detail-rows{display:flex;flex-direction:column;gap:1px;min-width:0}",
      ".wf-detail-file{display:flex;align-items:baseline;gap:6px;width:100%;min-width:0;padding:1px 4px;" +
        "border-radius:5px;border:1px solid transparent;background:transparent;color:inherit;font:inherit;" +
        "font-size:10px;line-height:1.5;text-align:left;cursor:pointer}",
      ".wf-detail-file:hover{background:var(--dsw-alias-bg-layer-2,#2c3140)}",
      ".wf-detail-base{flex:0 0 auto;color:var(--dsw-alias-label-primary,#e9ecf3);" +
        "font-family:ui-monospace,SFMono-Regular,Consolas,'Microsoft YaHei',monospace}",
      ".wf-detail-dir{flex:1 1 auto;min-width:0;font-size:9.5px;color:var(--dsw-alias-label-tertiary,#7d8798);" +
        "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wf-detail-error{margin:0;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-word;" +
        "font-family:ui-monospace,SFMono-Regular,Consolas,'Microsoft YaHei',monospace;font-size:10px;" +
        "line-height:1.45;color:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-detail-errors{display:flex;flex-direction:column;gap:2px;min-width:0}",
      ".wf-detail-meta{display:flex;flex-wrap:wrap;gap:3px 10px;font-size:9.5px;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798);font-variant-numeric:tabular-nums}",
      ".wf-step-detail-summary-text{font-size:10.5px;line-height:1.5;" +
        "color:var(--dsw-alias-label-secondary,#9aa3b2);white-space:pre-wrap;word-break:break-word}",
      ".wf-step-detail-stats{display:flex;flex-wrap:wrap;gap:3px 10px;font-size:10px;" +
        "color:var(--dsw-alias-label-secondary,#9aa3b2);font-variant-numeric:tabular-nums}",
      ".wf-detail-close{margin-left:auto;flex:0 0 auto;width:17px;height:17px;padding:0;border-radius:5px;" +
        "border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-tertiary,#7d8798);" +
        "font:inherit;font-size:12px;line-height:1;cursor:pointer}",
      ".wf-detail-close:hover{color:var(--dsw-alias-label-primary,#e9ecf3);background:var(--dsw-alias-bg-layer-2,#2c3140)}",
      ".wf-detail-close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",

     /* collapsed capsule : the main area keeps a one-line pill at its top;
         clicking it expands the two-column panel back. pointer-events:auto is now the
         default — the root is a real column, not a click-through overlay. */
      ".wf-capsule-bar{display:flex;align-items:center;gap:8px;padding:10px 12px}",
     /* collapsed capsule */
      ".wf-capsule{display:inline-flex;align-items:center;gap:7px;pointer-events:auto;padding:5px 11px;border-radius:999px;" +
        "font:inherit;font-size:12px;cursor:pointer;color:var(--dsw-alias-label-primary,#e9ecf3);" +
        "background:var(--dsw-alias-bg-overlay,#1c1f27);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.24));" +
        "box-shadow:0 8px 24px rgba(0,0,0,.35);font-variant-numeric:tabular-nums}",
      ".wf-capsule:hover{border-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-capsule:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:2px}",
      ".wf-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:var(--dsw-alias-brand-primary,#5b8cff);" +
        "animation:wf-pulse 1.6s ease-in-out infinite}",
      "@keyframes wf-pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(91,140,255,.55)}50%{opacity:.55;box-shadow:0 0 0 5px rgba(91,140,255,0)}}",
      "@media (prefers-reduced-motion: reduce){.wf-dot{animation:none}}",

     /* ===== the living layer — flowing curve, wrapped frames, breathing dot ===== */

     /* The body is the curve layer's containing block: an absolutely positioned SVG inside the
         two-column grid needs position:relative here, and 3 px of extra gutter so neither wrapped
         frame's ring is shaved by a scroller's overflow:auto edge. */
      ".wf-body{position:relative}",
      ".wf-flow-scroll,.wf-steps-scroll{padding-right:4px}",
     // The wrapped frame's ring is 3 px outside the card, so the first card's ring would be shaved
     // by the step scroller's own overflow:auto edge. 4 px of list padding buys it back (the browser
     // screenshot showed the left edge of the ring clipped before this).
      ".wf-steps{padding-left:4px;padding-top:4px}",

     /* the layer itself: click-through, painted above both columns, hidden until measured */
     // Hidden means opacity:0, never display:none — a display:none box measures 0×0, and the
     // first measurement needs the layer's real rect to turn the card coordinates into user
     // space. An invisible SVG paints nothing, so there is no cost either way.
      ".wf-fx{position:absolute;inset:0;width:100%;height:100%;opacity:0;overflow:visible;pointer-events:none;z-index:4}",
      ".wf-fx[data-visible='true']{opacity:1}",
      ".wf-fx-core{fill:none;stroke:url(#wf-fx-rainbow);stroke-width:" + WF_FX_STROKE + ";stroke-linecap:round;" +
        "stroke-linejoin:round;stroke-dasharray:" + WF_FX_DASH + ";animation:wf-fx-dash " + WF_FX_SPEED + " linear infinite}",
      ".wf-fx-glow{fill:none;stroke:url(#wf-fx-rainbow);stroke-width:" + WF_FX_GLOW + ";stroke-linecap:round;" +
        "stroke-linejoin:round;stroke-dasharray:" + WF_FX_DASH + ";opacity:.45;filter:blur(2.5px);" +
        "animation:wf-fx-dash " + WF_FX_SPEED + " linear infinite}",
      ".wf-fx[data-curve='brand'] .wf-fx-core,.wf-fx[data-curve='brand'] .wf-fx-glow{stroke:url(#wf-fx-brand)}",
      ".wf-fx-cap{fill:url(#wf-fx-rainbow);filter:drop-shadow(0 0 3px rgba(143,123,234,.85))}",
      ".wf-fx[data-curve='brand'] .wf-fx-cap{fill:url(#wf-fx-brand)}",
      ".wf-fx-stop-1{stop-color:" + WF_FX_RAINBOW[0] + "}",
      ".wf-fx-stop-2{stop-color:" + WF_FX_RAINBOW[1] + "}",
      ".wf-fx-stop-3{stop-color:" + WF_FX_RAINBOW[2] + "}",
      ".wf-fx-stop-4{stop-color:" + WF_FX_RAINBOW[3] + "}",
      ".wf-fx-stop-5{stop-color:" + WF_FX_RAINBOW[4] + "}",
      ".wf-fx-stop-6{stop-color:" + WF_FX_RAINBOW[5] + "}",
      ".wf-fx-stop-b1{stop-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-fx-stop-b2{stop-color:#8f7bea}",
      ".wf-fx-stop-b3{stop-color:var(--dsw-alias-brand-primary,#5b8cff)}",
     // One pattern length is 9+7 = 16 px, so a -32 offset is a seamless loop.
      "@keyframes wf-fx-dash{from{stroke-dashoffset:0}to{stroke-dashoffset:-32}}",

     /* the chain's curve channel. One SVG per flow list, absolutely positioned INSIDE the
         list, drawn between the cards' right and left edges so the two endpoints sit on the edges
         themselves (the 2 px acceptance tolerance is about rounding, not correction). It is
         pointer-events:none — the step's own discipline and the only way the cards stay clickable
         through it — and it is `opacity:0` rather than `display:none` before it is measured, because
         a display:none box measures 0×0 and could never be positioned. */
      ".wf-chain{position:absolute;inset:0;width:100%;height:100%;opacity:0;overflow:visible;" +
        "pointer-events:none;z-index:1}",
      ".wf-chain[data-visible='true']{opacity:1}",
      ".wf-chain-core{fill:none;stroke:var(--dsw-alias-border-l2,rgba(255,255,255,.22));stroke-width:1.6;" +
        "stroke-linecap:round;stroke-linejoin:round}",
      ".wf-chain-core[data-done='true']{stroke:var(--dsw-alias-state-success-primary,#45c07a);opacity:.75}",
     /* Wrapped frame: the running step card and the running node card. The pseudo-element is
         3 px larger than the card and paints only its outer 2 px (mask), which leaves the 1 px
         transparent seam between ring and card edge the step asks for. No @property: the
         gradient is 300 % wide and slid by background-position, which every Chrome does. */
      ".wf-step-item[data-status='running']>.wf-step-card,.wf-node[data-status='running']{position:relative;" +
        "box-shadow:0 0 0 1px rgba(143,123,234,.3),0 0 14px rgba(91,140,255,.26)}",
      ".wf-step-item[data-status='running']>.wf-step-card::after,.wf-node[data-status='running']::after{content:'';" +
        "position:absolute;inset:-3px;border-radius:11px;padding:2px;background:" + WF_FX_RING + ";" +
        "background-size:300% 100%;animation:wf-fx-wrap 2.6s linear infinite;pointer-events:none;z-index:2;" +
        "-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;" +
        "mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude}",
      "@keyframes wf-fx-wrap{from{background-position:0 0}to{background-position:300% 0}}",

     /* "working ...": a 6 px breathing dot with a spreading halo plus three dots lighting in turn.
         The period is 1.2 s (WF_LIVE_PERIOD / WF_PULSE_PERIOD) — same rhythm as the DSH
         thinking indicator, deliberately faster than the 1.6 s status dots around it. */
      ".wf-live{display:inline-flex;align-items:center;gap:5px;margin-top:1px;font-size:10.5px;line-height:1.3;" +
        "color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-live-dot{flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:currentColor;" +
        "animation:wf-live-dot " + WF_LIVE_PERIOD + " ease-in-out infinite}",
      ".wf-live-word{letter-spacing:.02em}",
      ".wf-live-dots{display:inline-flex;align-items:center;gap:2px}",
      ".wf-live-dots>i{width:2px;height:2px;border-radius:50%;background:currentColor;opacity:.25;" +
        "animation:wf-live-dots " + WF_LIVE_PERIOD + " ease-in-out infinite}",
      ".wf-live-dots>i:nth-child(2){animation-delay:.16s}",
      ".wf-live-dots>i:nth-child(3){animation-delay:.32s}",
      "@keyframes wf-live-dot{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(91,140,255,.55)}50%{opacity:.35;box-shadow:0 0 0 5px rgba(91,140,255,0)}}",
      "@keyframes wf-live-dots{0%,100%{opacity:.2}60%{opacity:1}}",

     /* Idle freezes every animation under the panel (paused keeps the current frame, so the
         still image does not jump); reduced motion removes them outright and keeps the static
         rainbow ring/curve. Both are attributed on the root, so the capsule is covered too. */
     // The pseudo-elements are listed explicitly: `animation`/`animation-play-state` are NOT
     // inherited, so a rule on `*` never reaches the ring on .wf-step-card::after or the lane dot on
     // .wf-flow-item::before. (The browser measurement caught exactly this.)
      ".wf-root[data-idle='1'] *,.wf-root[data-idle='1'] *::before,.wf-root[data-idle='1'] *::after{animation-play-state:paused!important}",
      ".wf-root[data-motion='static'] *,.wf-root[data-motion='static'] *::before,.wf-root[data-motion='static'] *::after{animation:none!important}",
      "@media (prefers-reduced-motion: reduce){.wf-root *,.wf-root *::before,.wf-root *::after{animation:none!important}}",
     /* ===== settings card + palette switch + snapshot export ===== */

     // One settings card inside the panel (the gear is the only entry). The grid keeps every
     // label in a fixed column so the four segmented controls read as one block.
      ".wf-settings{display:flex;flex-direction:column;gap:7px;padding:8px 12px 9px;font-size:11px;flex:0 0 auto;" +
        "max-height:min(55vh,320px);overflow:auto;scrollbar-width:thin;" +
        "color:var(--dsw-alias-label-secondary,#9aa3b2);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));" +
        "background:var(--dsw-alias-bg-layer-1,#232733)}",
      ".wf-set-grid{display:grid;grid-template-columns:auto minmax(0,1fr);gap:5px 9px;align-items:center}",
      ".wf-set-label{white-space:nowrap;font-size:10px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-seg{display:flex;flex-wrap:wrap;gap:3px;min-width:0}",
      ".wf-seg-btn{padding:2px 7px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.14));" +
        "background:transparent;color:var(--dsw-alias-label-secondary,#9aa3b2);font:inherit;font-size:10px;line-height:1.5;cursor:pointer}",
      ".wf-seg-btn:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.24));color:var(--dsw-alias-label-primary,#e9ecf3)}",
      ".wf-seg-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-seg-btn[aria-pressed='true']{color:var(--dsw-alias-brand-primary,#5b8cff);border-color:currentColor;" +
        "background:color-mix(in srgb,var(--dsw-alias-brand-primary,#5b8cff) 13%,transparent)}",
      ".wf-set-actions{display:flex;align-items:center;flex-wrap:wrap;gap:5px 8px;padding-top:1px}",
      ".wf-set-actions .wf-link{font-size:10px}",
      ".wf-export{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px;padding-top:5px;border-top:1px dashed var(--dsw-alias-border-l1,rgba(255,255,255,.12))}",
      ".wf-export-label{font-size:10px;font-weight:600;color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-export .wf-link,.wf-export .wf-seg-btn{font-size:10px}",
      ".wf-export .wf-copy-status{margin-left:0;color:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-export .wf-link[data-copy-state='failed'],.wf-export .wf-seg-btn[data-copy-state='failed']{color:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-settings .wf-kv{font-size:10px}",

     // Palette "brand": every living accent follows the harness brand token instead of the
     // six-stop rainbow. Palette "soft": low-saturation, dimmed colours for dark rooms.
      ".wf-root[data-palette='brand'] .wf-fx-core,.wf-root[data-palette='brand'] .wf-fx-glow{stroke:url(#wf-fx-brand)}",
      ".wf-root[data-palette='brand'] .wf-fx-cap{fill:url(#wf-fx-brand)}",
      ".wf-root[data-palette='brand'] .wf-step-item[data-status='running']>.wf-step-card::after," +
        ".wf-root[data-palette='brand'] .wf-node[data-status='running']::after{background:linear-gradient(90deg," +
        "var(--dsw-alias-brand-primary,#5b8cff),#8f7bea,var(--dsw-alias-brand-primary,#5b8cff));background-size:300% 100%}",
      ".wf-root[data-palette='brand'] .wf-prog-dock[data-status='running'] .wf-prog-fill{background:linear-gradient(90deg," +
        "var(--dsw-alias-brand-primary,#5b8cff),#8f7bea,var(--dsw-alias-brand-primary,#5b8cff));background-size:200% 100%}",

      ".wf-root[data-palette='soft']{--wf-soft-1:#7f93b8;--wf-soft-2:#9a8fc4;--wf-soft-3:#6f829f}",
      ".wf-root[data-palette='soft'] .wf-fx-stop-1{stop-color:var(--wf-soft-1)}",
      ".wf-root[data-palette='soft'] .wf-fx-stop-2{stop-color:var(--wf-soft-2)}",
      ".wf-root[data-palette='soft'] .wf-fx-stop-3{stop-color:var(--wf-soft-3)}",
      ".wf-root[data-palette='soft'] .wf-fx-stop-4{stop-color:var(--wf-soft-1)}",
      ".wf-root[data-palette='soft'] .wf-fx-stop-5{stop-color:var(--wf-soft-2)}",
      ".wf-root[data-palette='soft'] .wf-fx-stop-6{stop-color:var(--wf-soft-3)}",
      ".wf-root[data-palette='soft'] .wf-fx-core,.wf-root[data-palette='soft'] .wf-fx-glow{stroke:url(#wf-fx-rainbow)}",
      ".wf-root[data-palette='soft'] .wf-fx-cap{fill:var(--wf-soft-2)}",
      ".wf-root[data-palette='soft'] .wf-pct,.wf-root[data-palette='soft'] .wf-live{color:var(--wf-soft-1)}",
      ".wf-root[data-palette='soft'] .wf-dot{background:var(--wf-soft-2)}",
      ".wf-root[data-palette='soft'] .wf-step-item[data-status='running'] .wf-step-ring{color:var(--wf-soft-1)}",
      ".wf-root[data-palette='soft'] .wf-flow-item[data-status='running']::before," +
        ".wf-root[data-palette='soft'] .wf-flow-status[data-status='running']{background:var(--wf-soft-1)}",
      ".wf-root[data-palette='soft'] .wf-step-item[data-status='running']>.wf-step-card::after," +
        ".wf-root[data-palette='soft'] .wf-node[data-status='running']::after{background:linear-gradient(90deg," +
        "var(--wf-soft-1),var(--wf-soft-2),var(--wf-soft-1));background-size:300% 100%}",
      ".wf-root[data-palette='soft'] .wf-prog-dock[data-status='running'] .wf-prog-fill{background:linear-gradient(90deg," +
        "var(--wf-soft-1),var(--wf-soft-2),var(--wf-soft-1));background-size:200% 100%}",
    ].join("\n");

    /* ===== the split body and the inject column ===== */

    // Two-column mode replaces the body's grid with a flex row: the flow keeps its own layout and
    // simply GROWS (flex:1 1 auto), and the inject column is a FIXED 320 px beside it. A grid with
    // `minmax(240px,44%) 1fr` would have to be redefined to add a third track, which is exactly the
    // kind of second source of truth this plugin avoids — so the split is one extra class on the
    // body, and the two children own their own sizes.
    //
    // The important property: `min-width:0` on the flow side. Without it a flex item refuses to
    // shrink below its content and the whole body would overflow instead of the column scrolling.
    var WF_CSS_INJECT = [
     // the split is GONE: hot injection is the right page's third kind, mounted inside .wf-right-scroll
     // (a flex COLUMN), so the composer must fill that column instead of keeping its old fixed basis.
      ".wf-card{container-type:inline-size}",
      ".wf-right .wf-inject{flex:1 1 auto;min-height:0;border:0;border-radius:0;padding:0;background:transparent}",
      ".wf-inject-head{display:flex;align-items:center;gap:8px;min-width:0}",
      ".wf-inject-title{flex:1;min-width:0;font-size:11px;font-weight:600;letter-spacing:.02em;" +
        "color:var(--dsw-alias-label-secondary,#9aa3b2)}",
      ".wf-inject-close{font-size:10px}",
      ".wf-inject-hint{margin:0;font-size:10px;line-height:1.45;color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-inject-area{flex:1 1 auto;min-height:88px;resize:vertical;padding:6px 7px;border-radius:7px;" +
        "border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.14));background:var(--dsw-alias-bg-base,#161920);" +
        "color:var(--dsw-alias-label-primary,#e9ecf3);font:inherit;font-size:11px;line-height:1.5}",
      ".wf-inject-area:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-inject-foot{display:flex;align-items:center;gap:8px;min-width:0}",
      ".wf-inject-count{flex:1;min-width:0;font-size:10px;font-variant-numeric:tabular-nums;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-inject-send{font-size:10.5px}",
     // The enabled button is the only one that reads as an action; a disabled one must still look
     // like a button, just not like an invitation.
      ".wf-inject-send[data-ready='true']{color:var(--dsw-alias-brand-primary,#5b8cff);" +
        "border-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-inject-send:disabled{opacity:.45;cursor:default}",
     // the history rows. Three columns (status / text / time) that stay readable in the
     // right page's 460 px: the status chip is fixed, the text takes the rest and wraps, the time
     // is tabular so a column of rows does not jitter.
      ".wf-inject-history{display:flex;flex-direction:column;gap:4px;margin-top:10px;padding-top:8px;" +
        "border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.14));min-height:0}",
      ".wf-inject-history-label{font-size:10px;font-weight:600;letter-spacing:.02em;" +
        "color:var(--dsw-alias-label-secondary,#9aa3b2)}",
      ".wf-inject-history-empty{font-size:10px;color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-inject-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;" +
        "overflow:auto;min-height:0;scrollbar-width:thin}",
      ".wf-inject-row{display:grid;grid-template-columns:auto 1fr auto auto;align-items:baseline;gap:6px;" +
        "font-size:10px;line-height:1.45;padding:4px 6px;border-radius:6px;" +
        "background:var(--dsw-alias-bg-base,#161920)}",
      ".wf-inject-row-status{white-space:nowrap;font-weight:600}",
      ".wf-inject-row-status[data-status='picked']{color:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-inject-row-status[data-status='pending']{color:var(--dsw-alias-state-warn-primary,#e8b84a)}",
      ".wf-inject-row-text{min-width:0;overflow-wrap:anywhere;color:var(--dsw-alias-label-primary,#e9ecf3)}",
      ".wf-inject-row-time{white-space:nowrap;font-variant-numeric:tabular-nums;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798)}",
     // the row's own "Revoke" button and its failure line. The button is a `wf-link`
     // like every other affordance in this panel, so it stays quiet next to the status word; the
     // failure line spans the whole row (grid-column 1/-1) and prints the host's reason verbatim.
      ".wf-inject-row-revoke{white-space:nowrap;font-size:10px;color:var(--dsw-alias-state-warn-primary,#e8b84a)}",
      ".wf-inject-row-revoke:disabled{opacity:.45;cursor:default}",
      ".wf-inject-row-error{grid-column:1/-1;font-size:10px;line-height:1.4;overflow-wrap:anywhere;" +
        "color:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-inject-note[data-kind='sent']{color:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-inject-note[data-kind='failed']{color:var(--dsw-alias-state-error-primary,#e85a5a)}",
     // the PERSISTENT dock: the right page's footer for every kind that
     // is NOT the composer itself, so a prompt can be typed without opening the page first. One row
     // (label + single-line input + send + the NEWEST injection's status); a failed send prints the
     // host's own reason under that row, inside the same bar and verbatim — never optimistically.
      ".wf-inject-dock{flex:0 0 auto;display:flex;flex-direction:column;gap:4px;padding:7px 10px;min-width:0;" +
        "border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));background:var(--dsw-alias-bg-layer-2,#2c3140)}",
      ".wf-inject-dock-row{display:flex;align-items:center;gap:7px;min-width:0}",
      ".wf-inject-dock-label{flex:0 0 auto;padding:0;border:0;background:transparent;cursor:pointer;" +
        "font:inherit;font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-secondary,#9aa3b2)}",
      ".wf-inject-dock-label:hover{color:var(--dsw-alias-label-primary,#e9ecf3)}",
      ".wf-inject-dock-label:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-inject-dock-input{flex:1 1 auto;min-width:0;padding:5px 7px;border-radius:7px;" +
        "border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.14));background:var(--dsw-alias-bg-base,#161920);" +
        "color:var(--dsw-alias-label-primary,#e9ecf3);font:inherit;font-size:11px;line-height:1.4}",
      ".wf-inject-dock-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-inject-dock-send{flex:0 0 auto;font-size:10.5px}",
      ".wf-inject-dock-send[data-ready='true']{color:var(--dsw-alias-brand-primary,#5b8cff);" +
        "border-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-inject-dock-send:disabled{opacity:.45;cursor:default}",
      ".wf-inject-dock-state{flex:0 0 auto;white-space:nowrap;font-size:10px;font-weight:600;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-inject-dock-state[data-status='picked']{color:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-inject-dock-state[data-status='pending']{color:var(--dsw-alias-state-warn-primary,#e8b84a)}",
      ".wf-inject-dock-note{font-size:10px;line-height:1.4;overflow-wrap:anywhere;" +
        "color:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-inject-dock-note[data-kind='sent']{color:var(--dsw-alias-state-success-primary,#45c07a)}",
     // Narrow: the panel is its own container, so the dock stays the stacked layout's footer and is
     // allowed to wrap rather than squeeze the input down to nothing. Declared HERE (not in
     // WF_CSS_PAGE's container block) because this stylesheet is concatenated last: the same
     // specificity means the later declaration wins.
      "@container (max-width:900px){.wf-inject-dock{padding:6px 8px}" +
        ".wf-inject-dock-row{flex-wrap:wrap}" +
        ".wf-inject-dock-input{flex:1 1 120px}}",
    ].join("\n");

    /* ===== the single page: serial main flow + satellites + the right page ===== */

    // The body is now ONE scrolling column plus an optional right page. The right page is a FLEX
    // sibling, not an overlay: it takes width from the flow (which narrows, never re-flows its
    // content), and the whole thing stays inside the card.
    //
    // The flow side carries `min-width:0` for the same reason 's split does: a flex item
    // refuses to shrink below its content, and without it the long step titles would push the right
    // page off the right edge instead of letting the chain use the scrollbar.
    var WF_CSS_PAGE = [
      ".wf-body{display:flex;flex-direction:row;align-items:stretch;gap:0;padding:0;overflow:hidden;min-height:0;flex:1 1 auto}",
      ".wf-body[data-kind='planning']{padding:10px}",

     /* ---- the main flow ---- */
      ".wf-page{flex:1 1 auto;min-width:0;min-height:0;display:flex;flex-direction:column;position:relative}",
      ".wf-page-head{display:flex;align-items:baseline;gap:8px;padding:8px 12px 6px;font-size:11px;font-weight:600;" +
        "letter-spacing:.02em;color:var(--dsw-alias-label-secondary,#9aa3b2)}",
      ".wf-page-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;" +
        "padding:8px " + WF_PAGE_PAD + "px 40px}",
     // The chain is centred as a document: the column of units is at most 560 px wide and the
     // satellites hang in the gutters the padding reserves. `margin:0 auto` is what makes the page
     // read as "centred and clean" instead of a card glued to the left edge.
      ".wf-units{list-style:none;margin:0 auto;padding:0;max-width:560px;display:flex;flex-direction:column;gap:0}",

     /* ---- one unit: [left satellites][centre][right satellites] ---- */
      ".wf-unit{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,3fr) minmax(0,1fr);" +
        "align-items:center;gap:0;column-gap:0;padding:0 " + (WF_SAT_LINK + WF_PAGE_PAD) + "px}",
      ".wf-unit-center{grid-column:2;min-width:0;display:flex;flex-direction:column;gap:8px;position:relative;z-index:2}",
      ".wf-sat-side{grid-row:1;display:flex;flex-direction:column;gap:14px;min-width:0;position:relative;z-index:1}",
      ".wf-sat-side[data-side='left']{grid-column:1;align-items:flex-end}",
      ".wf-sat-side[data-side='right']{grid-column:3;align-items:flex-start}",
     // The horizontal interface: a 1.6 px straight run from the unit's edge to the circle. Left side
     // reads `[circle][line]`, right side `[line][circle]` — the line always touches the circle.
      ".wf-sat-row{display:flex;align-items:center;gap:0;min-width:0}",
      ".wf-sat-line{flex:0 0 " + WF_SAT_LINK + "px;height:1.6px;background:var(--dsw-alias-border-l2,rgba(255,255,255,.22));" +
        "border-radius:1px}",
     // 26 px is small: the label inside is a 4-character extension at most, so the circle needs
     // `overflow:hidden`-grade discipline (no wrap, no overflow) and the count badge must sit fully
     // inside the gutter the unit reserves, not on top of the interface line.
      ".wf-sat{position:relative;box-sizing:border-box;flex:0 0 auto;width:" + WF_SATELLITE + "px;height:" + WF_SATELLITE + "px;" +
        "border-radius:50%;border:1.6px solid var(--dsw-alias-border-l2,rgba(255,255,255,.26));background:var(--dsw-alias-bg-layer-2,#282d3a);" +
        "color:var(--dsw-alias-label-secondary,#9aa3b2);font:inherit;font-size:9px;line-height:1;cursor:pointer;" +
        "display:inline-flex;align-items:center;justify-content:center;padding:0;overflow:visible}",
      ".wf-sat:hover{border-color:var(--dsw-alias-brand-primary,#5b8cff);color:var(--dsw-alias-label-primary,#e9ecf3)}",
      ".wf-sat:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:2px}",
     // Tone = the SIDE's meaning, so the two gutters never mix up: read (left, blue), edit (right,
     // amber), tool (right, violet). The in-node chain chips use the same three hues.
      ".wf-sat[data-tone='read']{color:var(--wf-chain-read,#5b8cff);border-color:currentColor}",
      ".wf-sat[data-tone='edit']{color:var(--wf-chain-edit,#e0a13a);border-color:currentColor}",
      ".wf-sat[data-tone='tool']{color:var(--wf-chain-tool,#8f7bea);border-color:currentColor}",
      ".wf-sat[data-open='true']{box-shadow:0 0 0 3px rgba(91,140,255,.28)}",
      ".wf-sat-glyph{display:block;max-width:100%;padding:0 2px;font-size:9px;font-weight:600;letter-spacing:-.02em;" +
        "white-space:nowrap;overflow:hidden;text-overflow:clip;text-align:center;pointer-events:none}",
     // The count rides the circle's top-LEFT rim (towards the card), which is the one quadrant the
     // interface line never crosses — so the badge never sits on the line it belongs to.
      ".wf-sat-count{position:absolute;top:-6px;left:-6px;min-width:14px;height:14px;padding:0 3px;box-sizing:border-box;" +
        "border-radius:999px;background:var(--dsw-alias-bg-layer-1,#232733);border:1px solid currentColor;color:inherit;" +
        "font-size:8.5px;line-height:12px;text-align:center;font-variant-numeric:tabular-nums;pointer-events:none}",
     // Being called RIGHT NOW: the flowing ring the panel already uses for a wrapped frame.
      ".wf-sat[data-live='true']::after{content:'';position:absolute;inset:-3px;border-radius:50%;padding:2px;" +
        "background:" + WF_FX_RING + ";background-size:300% 100%;animation:wf-fx-wrap 2.6s linear infinite;" +
        "pointer-events:none;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);" +
        "-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);" +
        "mask-composite:exclude}",
     // A live interface's straight line flows too — same rainbow, same 2 px, no second vocabulary.
      ".wf-sat-row[data-live='true'] .wf-sat-line{background:" + WF_FX_RING + ";background-size:300% 100%;" +
        "animation:wf-fx-wrap 2.6s linear infinite}",

     /* ---- the unit card ---- */
      ".wf-unit-card{display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:flex-start;gap:8px;" +
        "width:100%;padding:10px 12px;border-radius:10px;text-align:left;border:1px solid transparent;" +
        "background:var(--dsw-alias-bg-layer-2,#282d3a);color:inherit;font:inherit;cursor:pointer;" +
        "border-left:3px solid transparent;box-sizing:border-box}",
      ".wf-unit-card:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.22));" +
        "background:var(--dsw-alias-bg-layer-1,#232733)}",
      ".wf-unit-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-unit-card[data-selected='true']{border-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-unit-card[data-active='true']{border-left-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-unit-seq{font-size:10px;line-height:1.9;letter-spacing:.02em;font-variant-numeric:tabular-nums;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-unit-ring{width:18px;height:18px;margin-top:1px;border-radius:50%;display:inline-flex;align-items:center;" +
        "justify-content:center;font-size:11px;line-height:1;border:1px solid currentColor;" +
        "color:var(--dsw-alias-state-idle-primary,#7d8798)}",
      ".wf-unit[data-status='done'] .wf-unit-ring{color:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-unit[data-status='running'] .wf-unit-ring{color:var(--dsw-alias-brand-primary,#5b8cff);" +
        "animation:wf-ring 1.6s ease-in-out infinite}",
      ".wf-unit[data-status='failed'] .wf-unit-ring{color:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-unit[data-status='skipped'] .wf-unit-ring{color:var(--dsw-alias-label-tertiary,#7d8798);border-style:dashed}",
      ".wf-unit-main{display:flex;flex-direction:column;gap:3px;min-width:0}",
      ".wf-unit-title{font-size:12.5px;line-height:1.4;color:var(--dsw-alias-label-primary,#e9ecf3);" +
        "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}",
      ".wf-unit-card[data-selected='true'] .wf-unit-title{font-weight:600}",
      ".wf-unit-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:10.5px;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798);font-variant-numeric:tabular-nums}",
      ".wf-unit[data-status='done'] .wf-badge{color:var(--dsw-alias-state-success-primary,#45c07a)}",
      ".wf-unit[data-status='running'] .wf-badge{color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-unit[data-status='failed'] .wf-badge{color:var(--dsw-alias-state-error-primary,#e85a5a)}",
      ".wf-unit[data-status='pending'] .wf-badge{color:var(--dsw-alias-state-idle-primary,#7d8798)}",
      ".wf-unit[data-status='pending'] .wf-unit-title{color:var(--dsw-alias-label-secondary,#9aa3b2)}",
      ".wf-unit[data-status='skipped'] .wf-unit-title{color:var(--dsw-alias-label-tertiary,#7d8798);text-decoration:line-through}",
      ".wf-unit-more{font-size:9.5px;line-height:1.4;color:var(--dsw-alias-label-tertiary,#7d8798)}",

     // The straight connector down the middle, in the gap the units leave: 2 px wide, WF_UNIT_GAP
     // tall, drawn ONLY between two units (never under the last one). Done steps get a solid line,
     // everything else a dashed one, so the chain reads "how far the one-way run has got".
      ".wf-unit-link{grid-column:2;grid-row:2;justify-self:center;width:" + WF_UNIT_LINK + "px;" +
        "height:" + WF_UNIT_GAP + "px;margin:0;background:var(--dsw-alias-border-l2,rgba(255,255,255,.2));" +
        "border-radius:1px}",
      ".wf-unit-link[data-done='false']{background:repeating-linear-gradient(180deg," +
        "var(--dsw-alias-border-l2,rgba(255,255,255,.2)) 0 5px,transparent 5px 10px)}",
      ".wf-unit-link[data-done='true']{background:var(--dsw-alias-state-success-primary,#45c07a);opacity:.65}",
     // The connectors between steps are now ALL one dashed style - no rainbow gradient, no scrolling animation: the whole main flow uses
     // one line language (done = solid green, everything else = grey dashed), leaving the expression of "what is happening" entirely to the
     // wrapping ring on the card and the single progress rail. `data-live` stays on the DOM (for tests) but no longer affects appearance.
      ".wf-unit-link[data-live='true']{background:repeating-linear-gradient(180deg," +
        "var(--dsw-alias-border-l2,rgba(255,255,255,.2)) 0 5px,transparent 5px 10px);animation:none}",

     /* ---- the right page ---- */
      ".wf-right{flex:0 0 460px;min-width:0;min-height:0;display:flex;flex-direction:column;box-sizing:border-box;" +
        "border-left:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));" +
        "background:var(--dsw-alias-bg-layer-1,#232733)}",
      ".wf-right-head{display:flex;align-items:center;gap:8px;padding:8px 10px 8px 12px;" +
        "border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));flex:0 0 auto}",
      ".wf-right-title{flex:1;min-width:0;font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;" +
        "text-overflow:ellipsis}",
      ".wf-page-close{flex:0 0 auto;width:22px;height:22px;padding:0;border-radius:6px;border:1px solid transparent;" +
        "background:transparent;color:var(--dsw-alias-label-secondary,#9aa3b2);font:inherit;font-size:13px;line-height:1;" +
        "cursor:pointer;display:inline-flex;align-items:center;justify-content:center}",
      ".wf-page-close:hover{background:var(--dsw-alias-bg-layer-2,#2c3140);color:var(--dsw-alias-label-primary,#e9ecf3)}",
      ".wf-page-close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-right-scroll{flex:1 1 auto;min-height:0;overflow:auto;padding:10px 12px 16px;scrollbar-width:thin;" +
        "display:flex;flex-direction:column;gap:9px}",
      ".wf-page-sub{font-size:10.5px;line-height:1.45;color:var(--dsw-alias-label-tertiary,#7d8798)}",

     /* the step page's type summary */
      ".wf-type-list{display:flex;flex-direction:column;gap:5px;min-width:0}",
      ".wf-type-rows{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".wf-type-row{display:flex;align-items:center;gap:7px;width:100%;padding:5px 7px;border-radius:7px;" +
        "border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));background:var(--dsw-alias-bg-base,#161920);" +
        "color:inherit;font:inherit;font-size:11px;cursor:pointer;text-align:left;box-sizing:border-box}",
      ".wf-type-row:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.22))}",
      ".wf-type-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-type-row[data-open='true']{border-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-type-dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-type-dot[data-tone='read']{background:var(--wf-chain-read,#5b8cff)}",
      ".wf-type-dot[data-tone='edit']{background:var(--wf-chain-edit,#e0a13a)}",
      ".wf-type-dot[data-tone='tool']{background:var(--wf-chain-tool,#8f7bea)}",
      ".wf-type-row[data-live='true']{box-shadow:0 0 0 1px rgba(143,123,234,.4)}",
      ".wf-type-label{font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,#e9ecf3)}",
      ".wf-type-kind{flex:1;min-width:0;font-size:10px;color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-type-count{font-size:10px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#9aa3b2)}",

     /* the type page's call list */
      ".wf-calls{display:flex;flex-direction:column;gap:6px;min-width:0}",
      ".wf-call-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".wf-call{min-width:0;display:flex;flex-direction:column;gap:5px}",
      ".wf-call-head{display:flex;align-items:center;gap:6px;width:100%;padding:5px 7px;border-radius:7px;" +
        "border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));background:var(--dsw-alias-bg-base,#161920);" +
        "color:inherit;font:inherit;font-size:11px;cursor:pointer;text-align:left;box-sizing:border-box}",
      ".wf-call-head:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.22))}",
      ".wf-call-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#5b8cff);outline-offset:1px}",
      ".wf-call-head[data-open='true']{border-color:var(--dsw-alias-brand-primary,#5b8cff)}",
      ".wf-call-main{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wf-call-meta{flex:0 0 auto;font-size:9.5px;font-variant-numeric:tabular-nums;" +
        "color:var(--dsw-alias-label-tertiary,#7d8798)}",
      ".wf-call[data-status='running'] .wf-call-main{color:var(--dsw-alias-brand-primary,#5b8cff)}",

     // The running step card KEEPS its flowing colour wrap (that is the most important "current" cue);
     // only the rainbow on the connectors BETWEEN steps is gone - main-flow connectors are now one dashed style.
      ".wf-unit[data-status='running']>.wf-unit-center>.wf-unit-card{position:relative;" +
        "box-shadow:0 0 0 1px rgba(143,123,234,.3),0 0 14px rgba(91,140,255,.26)}",
      ".wf-unit[data-status='running']>.wf-unit-center>.wf-unit-card::after{content:'';position:absolute;inset:-3px;" +
        "border-radius:13px;padding:2px;background:" + WF_FX_RING + ";background-size:300% 100%;" +
        "animation:wf-fx-wrap 2.6s linear infinite;pointer-events:none;z-index:2;" +
        "-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;" +
        "mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude}",
     // The connector's flowing keyframes were removed together with the rainbow connectors (only the uniform dashed style remains).
     // Narrow: the right page stacks UNDER the chain and the satellites fold into tighter gutters.
     // The satellite line shrinks with them (a fixed 26 px run would push the circle off the edge).
      "@container (max-width:900px){.wf-body[data-kind='ready']{flex-direction:column}" +
        ".wf-right{flex:0 0 auto;width:100%;max-height:46%;border-left:0;" +
        "border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12))}" +
        ".wf-units{max-width:100%}}",
      "@container (max-width:560px){.wf-unit{padding:0 4px}" +
        ".wf-sat-line{flex:0 0 10px}.wf-sat{width:22px;height:22px;font-size:8.5px}}",
    ].join("\n");

    /* ===== the conversation-view seat hides the host's composer ===== */

    // The panel is ONE child of the host's conversation column; the composer is a SIBLING the host
    // renders next to the selected view (measured in this host:
    // `div[data-conversation-content] > div[data-conversation-scroll] > [selected view, div[data-composer-seat]]`).
    // Nothing inside the panel's own tree can unmount it, so the TAB seat marks itself
    // (`data-dsh-workflow-map="conversation-view"`, see wfViewSeatRoot in panel.js) and this rule hides
    // the sibling seat while that marker is mounted — the todo dock and the input bar live inside it.
    //
    // SCOPED BY `:has` ON PURPOSE: the marker exists only while the host has THIS view selected (it
    // unmounts the others), so the composer returns by itself on chat / context / fleet - no state to keep in
    // sync, and no composer-chain takeover that would also swallow the host's plan-review composer.
    var WF_CSS_SEAT = [
      "[data-conversation-content]:has([data-dsh-workflow-map='conversation-view']) [data-composer-seat]{display:none!important}",
    ].join("\n");

    WF_CSS = WF_CSS + "\n" + WF_CSS_PAGE;

    WF_CSS = WF_CSS + "\n" + WF_CSS_INJECT;

    WF_CSS = WF_CSS + "\n" + WF_CSS_SEAT;

    // ===== src/client/store.js =====
    /**
     * store.js — pure data shaping + the polling loop for the workflow panel.
     *
     * Everything that can be decided WITHOUT React lives here, so tools/selftest-panel.mjs
     * can exercise it in Node with no DOM and no React: preferences, the poll request and
     * its 304/200/4xx/5xx outcomes, session-id resolution, and the view → model build.
     *
     * Inlined into client.js by tools/build-client.mjs (single-file browser half).
     */

    /* ------------------------------------------------------------------------- */
    /* numbers */
    /* ------------------------------------------------------------------------- */

    /** A finite number, or null. Used so a missing `percent` never becomes NaN. */
    function wfFinite(value) {
      return typeof value === "number" && isFinite(value) ? value : null;
    }

    function wfClamp(value, lo, hi) {
      var n = wfFinite(value);
      if (n === null) return lo;
      return n < lo ? lo : n > hi ? hi : n;
    }

    function wfRound(value) {
      var n = wfFinite(value);
      return n === null ? null : Math.round(n);
    }

    /* ------------------------------------------------------------------------- */
    /* preferences — keeps ONLY what the panel still owns */
    /* ------------------------------------------------------------------------- */

    /**
     * `width` / `height` are no longer written by the UI — the layout owns both —
     * but they are still READ and sanitised, because a record written by ..12 sits in
     * every user's localStorage. Keeping the two fields means an upgrade never throws away
     * `collapsed` / `selectedStep` / the presentation settings just because an old record
     * happens to carry a size.
     */
    function wfDefaultPrefs() {
      var display = wfDefaultSettings();
      return {
        width: WF_DEFAULT_WIDTH,
        height: WF_DEFAULT_HEIGHT,
        collapsed: WF_DEFAULT_COLLAPSED,
        selectedStep: null,
        palette: display.palette,
        motion: display.motion,
        detail: display.detail,
        nodeLimit: display.nodeLimit,
     // the single-page layout's right-hand page. `rightOpen` says the page is shown (the
     // user clicked a main-flow unit, a round satellite, or hot injection); `rightKind` / `rightKey` say
     // WHAT it shows. A stale (kind, key) pair is harmless — the page finds no content and
     // renders the empty hint — so nothing here is re-validated against the live view.
        rightOpen: false,
        rightKind: "step",
        rightKey: null,
      };
    }
    /**
     * Sanitise one stored record. Bad input never throws and never yields NaN:
     * a hand-edited or stale (older step) record degrades to the defaults.
     */
    function wfSanitizePrefs(input) {
      var base = wfDefaultPrefs();
      if (!input || typeof input !== "object") return base;
      if (wfFinite(input.width) !== null) {
        base.width = Math.round(wfClamp(input.width, WF_MIN_WIDTH, WF_MAX_WIDTH));
      }
      if (wfFinite(input.height) !== null) {
        var h = wfClamp(input.height, 0, WF_MAX_HEIGHT);
        base.height = h > 0 && h < WF_MIN_HEIGHT ? WF_MIN_HEIGHT : Math.round(h);
      }
      if (typeof input.collapsed === "boolean") base.collapsed = input.collapsed;
      if (wfFinite(input.selectedStep) !== null) {
        var index = Math.round(input.selectedStep);
        base.selectedStep = index >= 0 ? index : null;
      }
      if (typeof input.rightOpen === "boolean") base.rightOpen = input.rightOpen;
      if (WF_RIGHT_KINDS.indexOf(input.rightKind) >= 0) base.rightKind = input.rightKind;
      if (typeof input.rightKey === "string" && input.rightKey !== "") base.rightKey = input.rightKey;
      var display = wfSanitizeSettings(input, base);
      base.palette = display.palette;
      base.motion = display.motion;
      base.detail = display.detail;
      base.nodeLimit = display.nodeLimit;
      return base;
    }

    /** Parse the raw localStorage string (or an already-parsed object). */
    function wfParsePrefs(raw) {
      if (raw && typeof raw === "object") return wfSanitizePrefs(raw);
      if (typeof raw !== "string" || raw === "") return wfDefaultPrefs();
      try {
        return wfSanitizePrefs(JSON.parse(raw));
      } catch (error) {
        return wfDefaultPrefs();
      }
    }

    function wfLoadPrefs(storage) {
      try {
        var store = storage;
        if (!store) {
          store = typeof window !== "undefined" && window ? window.localStorage : null;
        }
        if (!store || typeof store.getItem !== "function") return wfDefaultPrefs();
        return wfParsePrefs(store.getItem(WF_PREFS_KEY));
      } catch (error) {
     // A disabled / quota-exhausted / partitioned localStorage is NOT an error the
     // panel may die on: it just means "no memory this session".
        return wfDefaultPrefs();
      }
    }

    function wfSavePrefs(prefs, storage) {
      try {
        var store = storage;
        if (!store) {
          store = typeof window !== "undefined" && window ? window.localStorage : null;
        }
        if (!store || typeof store.setItem !== "function") return false;
        store.setItem(WF_PREFS_KEY, JSON.stringify(wfSanitizePrefs(prefs)));
        return true;
      } catch (error) {
        return false;
      }
    }

    /**
     * Merge one patch into the previous prefs. `patch` may be a plain object or a
     * function of the previous value (the same shape React's updater takes), so the
     * keyboard shortcut and the drag handlers never race on a stale closure.
     */
    function wfApplyPrefsPatch(prev, patch) {
      var base = wfSanitizePrefs(prev);
      var next = typeof patch === "function" ? patch(base) : patch;
      if (!next || typeof next !== "object") return base;
      var display = wfSanitizeSettings(next, base);
      var merged = {
        width: wfFinite(next.width) === null ? base.width : next.width,
        height: wfFinite(next.height) === null ? base.height : next.height,
        collapsed: typeof next.collapsed === "boolean" ? next.collapsed : base.collapsed,
        selectedStep:
          next.selectedStep === null
            ? null
            : wfFinite(next.selectedStep) === null
              ? base.selectedStep
              : next.selectedStep,
        palette: display.palette,
        motion: display.motion,
        detail: display.detail,
        nodeLimit: display.nodeLimit,
     // the right page. `rightKey: null` means "keep whatever was open" — closing is
     // expressed with `rightOpen: false`, so clearing the key is never ambiguous.
        rightOpen: typeof next.rightOpen === "boolean" ? next.rightOpen : base.rightOpen,
        rightKind: WF_RIGHT_KINDS.indexOf(next.rightKind) >= 0 ? next.rightKind : base.rightKind,
        rightKey:
          next.rightKey === null
            ? null
            : typeof next.rightKey === "string" && next.rightKey !== ""
              ? next.rightKey
              : base.rightKey,
      };
      return wfSanitizePrefs(merged);
    }

    /* ------------------------------------------------------------------------- */
    /* the poll request */
    /* ------------------------------------------------------------------------- */

    function wfPollUrl(sessionId) {
      return "/dsh-workflow/state?sessionId=" + encodeURIComponent(String(sessionId));
    }

    /**
     * One conditional GET. Never throws: every outcome is a value, so the loop can
     * always decide what to render and how long to wait.
     *
     * @returns {Promise<{status:number, etag:string, payload:any, error:string}>}
     * 304 → keep the current view; 200 → new payload; anything else → `error`.
     */
    function wfPollOnce(fetchImpl, url, etag, signal) {
      var headers = {};
      if (typeof etag === "string" && etag !== "") headers["If-None-Match"] = etag;
      var init = { cache: "no-store", headers: headers };
      if (signal) init.signal = signal;
      return Promise.resolve()
        .then(function () {
          if (typeof fetchImpl !== "function") throw new Error("fetch unavailable");
          return fetchImpl(url, init);
        })
        .then(function (response) {
          var nextTag = etag || "";
          if (response && response.headers && typeof response.headers.get === "function") {
            var tag = response.headers.get("ETag");
            if (typeof tag === "string" && tag !== "") nextTag = tag;
          }
          if (response && response.status === 304) {
            return { status: 304, etag: etag || "", payload: null, error: "" };
          }
          if (!response || response.ok !== true) {
            var status = response && wfFinite(response.status) !== null ? response.status : 0;
            return {
              status: status,
              etag: nextTag,
              payload: null,
              error: status === 0 ? "network error" : "HTTP " + status,
            };
          }
          return response.json().then(function (payload) {
            if (!payload || payload.ok !== true) {
              return { status: response.status, etag: nextTag, payload: null, error: "bad payload" };
            }
            return { status: 200, etag: nextTag, payload: payload, error: "" };
          });
        })
        .catch(function (error) {
     // An aborted request is NOT a failure: the caller cancelled it (visibility
     // change or unmount). status -1 says "nothing to report" so the loop neither
     // paints an offline badge nor schedules a duplicate poll.
          var aborted = !!error && error.name === "AbortError";
          return {
            status: aborted ? -1 : 0,
            etag: etag || "",
            payload: null,
            error: (error && error.message) || String(error),
          };
        });
    }

    /* ------------------------------------------------------------------------- */
    /* ------------------------------------------------------------------------- */
    /* the write request */
    /* ------------------------------------------------------------------------- */

    // `wfPostSteer` lives in HotInject.js (it is the inject column's own request shape, and the
    // self-test drives it from there). This comment marks the section boundary only: the panel's
    // ONE write is defined exactly once in the bundle.

    /* ------------------------------------------------------------------------- */
    /* session identity */
    /* ------------------------------------------------------------------------- */

    /* ------------------------------------------------------------------------- */
    /**
     * `useSessions` hands the component a selector result. `snapshot.current` is the
     * active session id (verified against the live SessionsSnapshot: it is an index
     * into `byId`, not a record). When there is no current session — e.g. the frame
     * outlives the chat column — fall back to the session the main view is retaining
     * (`retainedBy.mainView`), choosing the most-retained, then the most recent.
     */
    function wfSessionIdFromSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== "object") return null;
      var current = snapshot.current;
      if (typeof current === "string" && current !== "") return current;
      var byId = snapshot.byId;
      if (!byId || typeof byId !== "object") return null;
      var bestId = null;
      var bestViews = 0;
      var bestAt = -1;
      for (var id in byId) {
        if (!Object.prototype.hasOwnProperty.call(byId, id)) continue;
        var record = byId[id];
        if (!record || typeof record !== "object") continue;
        var views = wfFinite(record.retainedBy && record.retainedBy.mainView);
        if (views === null || views <= 0) continue;
        var at = wfFinite(record.lastActivityAt);
        if (at === null) at = wfFinite(record.updatedAt);
        if (at === null) at = 0;
        if (views > bestViews || (views === bestViews && at > bestAt)) {
          bestId = id;
          bestViews = views;
          bestAt = at;
        }
      }
      return bestId;
    }

    /* ------------------------------------------------------------------------- */
    /* view → model */
    /* ------------------------------------------------------------------------- */

    var WF_STATUS_KEYS = {
      done: "panel.status.done",
      running: "panel.status.running",
      failed: "panel.status.failed",
      skipped: "panel.status.skipped",
      pending: "panel.status.pending",
    };
    var WF_KIND_KEYS = {
      tool: "panel.kind.tool",
      message: "panel.kind.message",
      report: "panel.kind.report",
      subagent: "panel.kind.subagent",
      question: "panel.kind.question",
      approval: "panel.kind.approval",
    };

    function wfStatusKey(status) {
      return WF_STATUS_KEYS[status] || "panel.status.pending";
    }

    function wfKindKey(kind) {
      return WF_KIND_KEYS[kind] || "panel.kind.other";
    }

    function wfTrimText(value, limit) {
      if (typeof value !== "string") return "";
      var text = value.replace(/\s+/g, " ").trim();
     // The ellipsis counts toward the limit, so a 300-char budget stays 300 chars.
      if (typeof limit === "number" && text.length > limit) return text.slice(0, Math.max(0, limit - 1)) + "…";
      return text;
    }

    /**
     * The header's number for one step. A step the plan closed is 100 % by
     * definition; everything else contributes whatever its own estimate says, and a
     * step with no estimate contributes 0 rather than NaN.
     */
    function wfEffectivePercent(row) {
      if (row.status === "done") return 100;
      var value = wfFinite(row.percent);
      return value === null ? 0 : wfClamp(value, 0, 100);
    }

    /**
     * The plan section reduced to what the cards need. Every field is optional on
     * the wire (a plan written by an older PAE has no `skipped`), so each one has an
     * honest fallback instead of a dereference.
     */
    function wfPlanSummary(plan) {
      if (!plan || typeof plan !== "object") return null;
      var confirmations = Object.create(null);
      if (Array.isArray(plan.steps)) {
        for (var i = 0; i < plan.steps.length; i += 1) {
          var row = plan.steps[i];
          if (row && wfFinite(row.index) !== null && row.requiresConfirmation === true) {
            confirmations[String(Math.round(row.index))] = true;
          }
        }
      }
      var stepReports = [];
      if (Array.isArray(plan.stepReports)) {
        for (var r = 0; r < plan.stepReports.length && stepReports.length < 60; r += 1) {
          var report = plan.stepReports[r];
          if (!report || wfFinite(report.stepIndex) === null) continue;
          var artifacts = [];
          if (Array.isArray(report.artifacts)) {
            for (var a = 0; a < report.artifacts.length && artifacts.length < 40; a += 1) {
              if (typeof report.artifacts[a] === "string" && report.artifacts[a] !== "") {
                artifacts.push(wfTrimText(report.artifacts[a], 300));
              }
            }
          }
          stepReports.push({
            stepIndex: Math.round(report.stepIndex),
            status: typeof report.status === "string" ? wfTrimText(report.status, 40) : "",
            summary: wfTrimText(report.summary, 400),
            artifacts: artifacts,
            exitCode: wfFinite(report.exitCode) === null ? null : Math.round(report.exitCode),
          });
        }
      }
      return {
        statuses: plan.statuses && typeof plan.statuses === "object" ? plan.statuses : {},
        anchorSeqs: plan.anchorSeqs && typeof plan.anchorSeqs === "object" ? plan.anchorSeqs : {},
        skipped: Array.isArray(plan.skipped) ? plan.skipped.slice() : [],
        stepIndex: wfFinite(plan.stepIndex) === null ? null : Math.round(plan.stepIndex),
        confirmations: confirmations,
        stepReports: stepReports,
      };
    }

    /** The PAE report for a step ordinal (1-based `planIndex`), or null. */
    function wfStepReport(plan, planIndex) {
      if (!plan || !Array.isArray(plan.stepReports) || wfFinite(planIndex) === null) return null;
      var wanted = Math.round(planIndex);
      for (var i = 0; i < plan.stepReports.length; i += 1) {
        var report = plan.stepReports[i];
        if (report && wfFinite(report.stepIndex) !== null && Math.round(report.stepIndex) === wanted) return report;
      }
      return null;
    }

    /**
     * The selected step's detail: its report (PAE) and honest statistics from the nodes the
     * host actually sent. `truncated` is the difference to the step's OWN nodeCount, so a
     * 300-node cap is stated rather than silently under-counted.
     */
    function wfBuildStepDetail(row, nodes, plan) {
      if (!row) return null;
      var list = Array.isArray(nodes) ? nodes : [];
      var seen = Object.create(null);
      var files = 0;
      var tools = 0;
      var firstAt = null;
      var lastAt = null;
      for (var i = 0; i < list.length; i += 1) {
        var node = list[i];
        if (!node) continue;
        if (node.kind === "tool") tools += 1;
        var fileList = Array.isArray(node.fileList) ? node.fileList : [];
        for (var f = 0; f < fileList.length; f += 1) {
          var path = fileList[f] && fileList[f].path;
          if (typeof path !== "string" || path === "" || seen[path] === true) continue;
          seen[path] = true;
          files += 1;
        }
        var at = wfFinite(node.at);
        if (at !== null && at > 0) {
          if (firstAt === null) firstAt = at;
          lastAt = at;
        }
      }
      var startedAt = wfFinite(row.startedAt);
      if (startedAt === null || startedAt <= 0) startedAt = firstAt;
      var endedAt = wfFinite(row.endedAt);
      if (endedAt === null || endedAt <= 0) endedAt = row.status === "done" ? lastAt : null;
      var nodeCount = wfFinite(row.nodeCount) === null ? list.length : Math.round(row.nodeCount);
      return {
        index: row.index,
        planIndex: row.planIndex === undefined ? null : row.planIndex,
        title: row.title,
        status: row.status,
        statusKey: row.statusKey,
        tools: tools,
        files: files,
        nodes: nodeCount,
        truncated: Math.max(0, nodeCount - list.length),
        startedAt: startedAt,
        endedAt: endedAt,
        report: wfStepReport(plan, row.planIndex),
      };
    }

    /** The todo table, bounded and repaired: only content/status are ever read. */
    function wfTodoRows(todos) {
      if (!Array.isArray(todos)) return [];
      var out = [];
      for (var i = 0; i < todos.length && out.length < 200; i += 1) {
        var todo = todos[i];
        if (!todo || typeof todo !== "object") continue;
        out.push({
          content: wfTrimText(todo.content, 200),
          status: typeof todo.status === "string" ? todo.status : "",
        });
      }
      return out;
    }

    /**
     * Build the render model, or null when the panel must not exist at all.
     *
     * Empty state rules ( contract §3):
     * - no steps and no PAE plan still being written → null (NOTHING is rendered)
     * - plan.phase === "planning" with no steps yet -> a one-line "planning..." card
     * - otherwise → right/left two-column model
     */
    /* ------------------------------------------------------------------------- */
    /* tool FILE TYPES (the satellites' data source) */
    /* ------------------------------------------------------------------------- */

    /**
     * Compound extensions that must stay one token: `a.step` and `a.txt` are different tool files,
     * and `cadflow-A3FIX-20261011.md` is a markdown file, not a `.20261011` file.
     */
    var WF_TYPE_COMPOUND = [
      ".tar.gz",
      ".tar.bz2",
      ".tar.xz",
      ".test.ts",
      ".spec.ts",
      ".min.js",
    ];

    /**
     * A tool call's file extension → the badge printed inside its circle.
     *
     * `.md` is printed as `md`, `.dxf` as `dxf`, `.tar.gz` as `tar` — the badge must fit a 26 px
     * circle, so it is the extension WITHOUT the dot. Anything longer than four characters keeps its
     * first three letters. No extension → `file`.
     */
    function wfTypeBadge(ext) {
      if (typeof ext !== "string" || ext === "") return "file";
      var bare = ext.replace(/^\./, "");
      if (bare === "tar.gz" || bare === "tar.bz2" || bare === "tar.xz") return "tar";
      if (bare.length <= 4) return bare;
      return bare.slice(0, 3);
    }

    /* ------------------------------------------------------------------------- */
    /* hot-inject history (pure shaping, no DOM) */
    /* ------------------------------------------------------------------------- */

    /** How many rows the composer page lists; the oldest fall off with a stated count. */
    var WF_INJECT_HISTORY = 40;

    /**
     * The wire's `view.injects` → what the composer page renders.
     *
     * Each row keeps the three facts the user asked for: WHAT was injected (the text), WHEN
     * (`at`, the splice's own event time — never a browser clock), and its STATUS, which is one
     * of two words with different meanings:
     * `pending` — the message is in the session's inbox; the turn has not picked it up yet.
     * `picked` — the session's own `user/message` with the same id is in the log, i.e. the
     * running turn HAS taken it. This is measured, not assumed.
     *
     * A row without an id cannot be matched, so it is dropped rather than listed as status-less.
     */
    function wfInjectRows(list) {
      if (!Array.isArray(list)) return [];
      var rows = [];
      for (var i = 0; i < list.length; i += 1) {
        var row = list[i];
        if (!row || typeof row !== "object") continue;
        var id = typeof row.id === "string" ? row.id : "";
        if (id === "") continue;
        rows.push({
          id: id,
          at: wfFinite(row.at),
          pickedUpAt: wfFinite(row.pickedUpAt),
          target: typeof row.target === "string" ? row.target : "",
          text: wfTrimText(row.text, 300),
     // three states, not two: a message the loop DISCARDED (durable cancel) is neither
     // "waiting" nor "taken" — it will never be read. Only the host's own
     // `agent/inbox/discarded` event sets this, so it is never inferred.
          status: row.pickedUp === true ? "picked" : row.canceled === true ? "canceled" : "pending",
          canceledAt: wfFinite(row.canceledAt),
        });
      }
      if (rows.length > WF_INJECT_HISTORY) {
        return rows.slice(rows.length - WF_INJECT_HISTORY);
      }
      return rows;
    }

    /** `.md` → `.md`; a path with no dot → `""` (the "no extension" bucket). */
    function wfTypeOfPath(path) {
      if (typeof path !== "string" || path === "") return "";
      var flat = path.replace(/\\/g, "/");
      var base = flat.slice(flat.lastIndexOf("/") + 1).toLowerCase();
      if (base === "") return "";
      for (var i = 0; i < WF_TYPE_COMPOUND.length; i += 1) {
        var compound = WF_TYPE_COMPOUND[i];
        if (base.length > compound.length && base.slice(-compound.length) === compound) return compound;
      }
      var at = base.lastIndexOf(".");
     // A leading dot is a dotfile (`.gitignore`): its own type, not "no extension".
      if (at === 0) return base;
      if (at <= 0) return "";
      return base.slice(at);
    }

    /** Which side a host file action lives on: read/query -> left (input), write/edit -> right (output). */
    function wfTypeSide(action) {
      var label = typeof action === "string" ? action.trim().toLowerCase() : "";
      if (
        label === "读" ||
        label === "read" ||
        label === "查" ||
        label === "glob" ||
        label === "grep" ||
        label === "list" ||
        label === "query"
      ) {
        return "left";
      }
      return "right";
    }

    /**
     * Bucket ONE step's nodes into file types (the satellites), split by side.
     *
     * Input is the browser model's node list: every node carries `fileList[{path, action}]` and a
     * `tool`. Pure — it reads nothing else and never touches the DOM, so selftest-panel can assert
     * the buckets without a browser.
     *
     * A type is a KEY: `file:.md` for a file extension, `tool:pwsh` for a call whose only evidence is
     * the tool name. A call that touched a file counts under that file's type only (its tool is
     * already visible in the call's own row); a call that touched nothing gets a tool circle on the
     * right - that is where "tools called" lives.
     */
    function wfTypeBuckets(nodes, activeNodeId) {
      var list = Array.isArray(nodes) ? nodes : [];
      var active = typeof activeNodeId === "string" && activeNodeId !== "" ? activeNodeId : null;
      var byKey = Object.create(null);

      function slot(key, kind, label) {
        var bucket = byKey[key];
        if (!bucket) {
          bucket = {
            key: key,
            kind: kind,
            label: label,
            side: kind === "tool" ? "right" : "left",
            count: 0,
            error: false,
            running: false,
            nodes: [],
            seen: Object.create(null),
          };
          byKey[key] = bucket;
        }
        return bucket;
      }

      for (var i = 0; i < list.length; i += 1) {
        var node = list[i];
        if (!node || typeof node !== "object") continue;
        var id = typeof node.id === "string" ? node.id : "";
        var tool = typeof node.tool === "string" && node.tool !== "" ? node.tool : "";
        var files = Array.isArray(node.fileList) ? node.fileList : [];
        var touched = false;
        for (var f = 0; f < files.length; f += 1) {
          var file = files[f];
          if (!file || typeof file.path !== "string" || file.path === "") continue;
          var ext = wfTypeOfPath(file.path);
          var bucket = slot("file:" + ext, "file", ext === "" ? "file" : wfTypeBadge(ext));
          if (wfTypeSide(file.action) === "right") bucket.side = "right";
          touched = true;
          if (bucket.count >= WF_SIDE_FILES) continue;
          bucket.count += 1;
          if (node.error === true) bucket.error = true;
          if (id !== "" && bucket.seen[id] !== true) {
            bucket.seen[id] = true;
            bucket.nodes.push(id);
            if (id === active) bucket.running = true;
          }
        }
        if (!touched && tool !== "") {
          var toolBucket = slot("tool:" + tool, "tool", tool.length > 6 ? tool.slice(0, 6) : tool);
          toolBucket.side = "right";
          if (toolBucket.count < WF_SIDE_FILES) {
            toolBucket.count += 1;
            if (node.error === true) toolBucket.error = true;
            if (id !== "" && toolBucket.seen[id] !== true) {
              toolBucket.seen[id] = true;
              toolBucket.nodes.push(id);
              if (id === active) toolBucket.running = true;
            }
          }
        }
      }
      return byKey;
    }

    /**
     * The buckets of ONE step, in the order they are drawn, split into the two sides.
     *
     * Ordering is by count (the type that matters most sits closest to the unit), ties broken by
     * label so two renders of the same data never swap places. Each side keeps WF_SIDE_SLOTS
     * circles; `dropped` states how many types did not fit — the card prints that number, so a
     * crowded step is honest rather than silently trimmed.
     */
    function wfTypeSides(nodes, activeNodeId) {
      var byKey = wfTypeBuckets(nodes, activeNodeId);
      var all = [];
      var keys = Object.keys(byKey);
      for (var i = 0; i < keys.length; i += 1) {
        var bucket = byKey[keys[i]];
        all.push({
          key: bucket.key,
          kind: bucket.kind,
          label: bucket.label,
          side: bucket.side === "right" ? "right" : "left",
          tone: bucket.kind === "tool" ? "tool" : bucket.side === "left" ? "read" : "edit",
          count: bucket.count,
          running: bucket.running === true,
          error: bucket.error === true,
          nodes: bucket.nodes.slice(),
        });
      }
      all.sort(function (left, right) {
        if (left.count !== right.count) return right.count - left.count;
        return left.label < right.label ? -1 : left.label > right.label ? 1 : 0;
      });
      var sides = { left: [], right: [], dropped: { left: 0, right: 0 }, all: all };
      for (var b = 0; b < all.length; b += 1) {
        var one = all[b];
        var side = one.side === "right" ? "right" : "left";
        if (sides[side].length >= WF_SIDE_SLOTS) {
          sides.dropped[side] += 1;
          continue;
        }
        sides[side].push(one);
      }
      return sides;
    }

    /* ------------------------------------------------------------------------- */
    /* the model */
    /* ------------------------------------------------------------------------- */

    function wfBuildModel(view, prefs, nowMs) {
      if (!view || typeof view !== "object" || !Array.isArray(view.steps)) return null;

      var plan = view.plan && typeof view.plan === "object" ? view.plan : null;
      var planSteps = plan && Array.isArray(plan.steps) ? plan.steps : [];
      var planning = !!(plan && plan.phase === "planning" && planSteps.length === 0);
      var task = "";
      if (plan) task = wfTrimText(plan.taskTitle || plan.task, 300);
      if (task === "") task = wfTrimText(view.task, 300);

     // the single page keeps ONE selected step: the unit the user last opened. The policy is
     // unchanged (a remembered index wins, then the running step, then the active one, then the last
     // done step, then the first) — what changed is only that the page no longer needs a second
     // "selected" notion for the flow column, because the flow column is gone.
      var steps = view.steps;
      if (steps.length === 0) {
        if (!planning) return null;
        return {
          kind: "planning",
          planning: true,
          task: task,
          progress: { done: 0, total: 0, percent: 0 },
          activeStep: null,
          selected: null,
     // palette / motion / detail depth / node window travel with the model,
     // so a preference change is one ordinary re-render (no second state channel).
          settings: wfSettingsOf(prefs),
     // Is the session actually working? The curve, both wrapped frames and the
     // breathing dot all freeze when it is not — see pulse.js wfSessionRunning for the
     // three signals and why the host's own `view.running` wins when it exists.
          running: wfSessionRunning(view, null, nowMs),
          steps: [],
          flow: {
            stepTitle: "",
            nodes: [],
            total: 0,
            truncated: 0,
            stepNodeTotal: 0,
            groups: [],
            activeNodeId: null,
            branches: [],
            hiddenBranches: 0,
            branchDropped: 0,
          },
     // the single page has nothing to draw while the plan is still being written; the
     // shape is present so the renderer never has to branch on "does page exist".
          page: { units: [], runningIndex: null, toolTypes: [] },
          counts: view.counts && typeof view.counts === "object" ? view.counts : null,
          plan: wfPlanSummary(plan),
     // the hot-inject history travels with the model, so the composer page can list
     // what was sent and whether the session admitted it (see wfInjectRows).
          injects: wfInjectRows(view.injects),
        };
      }

      var activeIndex = null;
      if (view.active && wfFinite(view.active.stepIndex) !== null) {
        activeIndex = Math.round(view.active.stepIndex);
        if (activeIndex < 0 || activeIndex >= steps.length) activeIndex = null;
      }

      var nodeById = Object.create(null);
      if (Array.isArray(view.nodes)) {
        for (var n = 0; n < view.nodes.length; n += 1) {
          var node = view.nodes[n];
          if (node && typeof node.id === "string") nodeById[node.id] = node;
        }
      }

      var planSummary = wfPlanSummary(plan);
      var todos = wfTodoRows(view.todos);

      var rows = [];
      for (var i = 0; i < steps.length; i += 1) {
        var step = steps[i] && typeof steps[i] === "object" ? steps[i] : {};
        var status = typeof step.status === "string" ? step.status : "pending";
        var percent = wfFinite(step.percent);
        var clampedPercent = percent === null ? null : wfClamp(percent, 0, 100);
        rows.push({
          index: i,
          title: wfTrimText(step.title, 200) || "—",
          status: status,
          statusKey: wfStatusKey(status),
          percent: clampedPercent === null ? null : Math.round(clampedPercent),
          percentSource: typeof step.percentSource === "string" ? step.percentSource : "none",
     // when the last progress estimate arrived (0 = never). The rail uses it for the
     // "estimated N minutes ago" segment and prints nothing at all when it is 0.
          lastEstimateAt: wfFinite(step.lastEstimateAt) === null ? 0 : Math.max(0, Math.round(wfFinite(step.lastEstimateAt))),
          nodeCount: wfFinite(step.nodeCount) === null ? 0 : step.nodeCount,
          planIndex: wfFinite(step.planIndex) === null ? null : step.planIndex,
          anchorSeq: wfFinite(step.anchorSeq),
          reportSummary: wfTrimText(step.reportSummary, 200),
          startedAt: wfFinite(step.startedAt),
          endedAt: wfFinite(step.endedAt),
          outcome: typeof step.outcome === "string" ? wfTrimText(step.outcome, 200) : "",
          requiresConfirmation: false,
          statusSource: "host",
          rawStatus: status,
          active: activeIndex === i,
          selected: false,
        });
      }

     // The status policy (PAE > todo > anchorSeqs > host, see StepColumn.js) lives
     // in the step column but is applied HERE, so the header's done-count, the
     // running-step selection and every card's badge cannot disagree.
      rows = wfApplyDerivedStatuses(rows, planSummary, todos);

      var done = 0;
      var percentSum = 0;
      var runningIndex = null;
      for (var r = 0; r < rows.length; r += 1) {
        if (rows[r].status === "done") done += 1;
        if (rows[r].status === "running" && runningIndex === null) runningIndex = r;
     // Overall progress = the mean of every step's own estimate, so a long running
     // step moves the header between completions instead of freezing at done/total.
        percentSum += wfEffectivePercent(rows[r]);
      }
     // ONE live row. The host already closes stray running rows (fold.mjs soleRunning);
     // this is the browser's own guard, because the PAE/todo status policy applied just above can
     // ALSO promote a row to 'running'. Everything that animates (ring, rail, connector, the
     // flowing tool type) keys off `live`, so at most one of each can ever light up.
      var liveIndex = runningIndex;
      if (liveIndex === null && activeIndex !== null) liveIndex = activeIndex;
      for (var lr = 0; lr < rows.length; lr += 1) rows[lr].live = lr === liveIndex;

      var percentOverall = Math.round(wfClamp(percentSum / steps.length, 0, 100));

     // Selection: remember the user's pick, drop it if it no longer exists, then fall
     // back to the running step, the active step, the last done step, or the first.
      var selected = null;
      var wanted = prefs && wfFinite(prefs.selectedStep) !== null ? Math.round(prefs.selectedStep) : null;
      if (wanted !== null && wanted >= 0 && wanted < rows.length) selected = wanted;
      if (selected === null && runningIndex !== null) selected = runningIndex;
      if (selected === null && activeIndex !== null) selected = activeIndex;
      if (selected === null) {
        for (var d = rows.length - 1; d >= 0; d -= 1) {
          if (rows[d].status === "done") {
            selected = d;
            break;
          }
        }
      }
      if (selected === null) selected = 0;
      rows[selected].selected = true;

      var step = steps[selected] && typeof steps[selected] === "object" ? steps[selected] : {};
      var order = Array.isArray(step.nodeIds) ? step.nodeIds : [];
      var flowNodes = [];
      for (var k = 0; k < order.length; k += 1) {
        var found = nodeById[order[k]];
        if (!found) continue; // a globally-truncated node is simply absent, never a hole
        var firstFile = Array.isArray(found.files) && found.files.length > 0 ? found.files[0] : null;
        flowNodes.push({
          id: typeof found.id === "string" ? found.id : "n" + k,
          kind: typeof found.kind === "string" ? found.kind : "other",
          kindKey: wfKindKey(found.kind),
          tool: wfTrimText(found.tool, 40),
          title: wfTrimText(found.title, 160) || wfTrimText(found.detail, 160) || "—",
          detail: wfTrimText(found.detail, 200),
          files: Array.isArray(found.files) ? found.files.length : 0,
     // The first path is what the card titles itself with ("read · x.js"): basename
     // only, the full path stays in the tooltip.
          path: firstFile && typeof firstFile.path === "string" ? firstFile.path : "",
     // The detail block needs the whole file list (paths + host action labels) — the card
     // above only counts them. `fileList` is a whitelist copy: `files` on the wire could
     // carry anything, and only path/action ever reach the renderer.
          fileList: Array.isArray(found.files)
            ? found.files
                .filter(function (file) {
                  return file && typeof file.path === "string" && file.path !== "";
                })
                .map(function (file) {
                  return { path: file.path, action: typeof file.action === "string" ? file.action : "" };
                })
            : [],
     // The args digest / result head / error text are bounded by the host (200 chars).
     // They are copied verbatim — never flattened — because the detail renders them in a
     // pre-wrap block and a command's newlines are part of what the user asked to see.
          argsText: typeof found.argsText === "string" ? found.argsText.slice(0, 200) : "",
          resultLine: typeof found.resultHead === "string" ? found.resultHead.slice(0, 200) : "",
          errorText: typeof found.error === "string" ? found.error.slice(0, 200) : "",
          seq: wfFinite(found.seq),
          error: typeof found.error === "string" && found.error !== "",
          result: typeof found.resultHead === "string" && found.resultHead !== "",
          durationMs: wfFinite(found.durationMs),
          at: wfFinite(found.at),
        });
      }

     // The selected step's own detail : the report + statistics from the nodes above.
      var detail = wfBuildStepDetail(rows[selected], flowNodes, planSummary);

     // Host fold records are copied field by field: they are only RANGES over the node
     // list above (FlowColumn resolves them), so a group whose ids are missing here can
     // never hide a node.
      var flowGroups = [];
      if (Array.isArray(step.groups)) {
        for (var g = 0; g < step.groups.length; g += 1) {
          var rawGroup = step.groups[g];
          if (!rawGroup || typeof rawGroup !== "object") continue;
          flowGroups.push({
            key: typeof rawGroup.key === "string" ? rawGroup.key : "",
            tool: typeof rawGroup.tool === "string" ? rawGroup.tool : "",
            firstId: typeof rawGroup.firstId === "string" ? rawGroup.firstId : "",
            lastId: typeof rawGroup.lastId === "string" ? rawGroup.lastId : "",
            count: wfFinite(rawGroup.count) === null ? 0 : rawGroup.count,
            firstAt: wfFinite(rawGroup.firstAt),
            lastAt: wfFinite(rawGroup.lastAt),
          });
        }
      }

     // Branch lanes — the parallel work of THIS step, reduced to what Branches.js
     // draws. A lane that started before any step existed (stepIndex null) belongs to the
     // first step. Only the newest WF_BRANCH_SHOWN lanes are drawn; the rest are counted by
     // the renderer, and lanes the HOST dropped at its own cap are counted separately — the
     // two numbers have different causes and must not be merged.
      var branchRows = [];
      var allBranches = Array.isArray(view.branches) ? view.branches : [];
      for (var bi = 0; bi < allBranches.length; bi += 1) {
        var rawBranch = allBranches[bi];
        if (!rawBranch || typeof rawBranch !== "object") continue;
        var branchStep = wfFinite(rawBranch.stepIndex);
        if (branchStep !== null && Math.round(branchStep) !== selected) continue;
        if (branchStep === null && selected !== 0) continue;
        var branchNodes = [];
        if (Array.isArray(rawBranch.nodes)) {
          for (var bn = 0; bn < rawBranch.nodes.length; bn += 1) {
            var rawNode = rawBranch.nodes[bn];
            if (!rawNode || typeof rawNode !== "object") continue;
            branchNodes.push({
              id: typeof rawNode.id === "string" ? rawNode.id : "b" + bi + "n" + bn,
              kind: typeof rawNode.kind === "string" ? rawNode.kind : "row",
              tool: wfTrimText(rawNode.tool, 40),
              title: wfTrimText(rawNode.title, 160) || "—",
              detail: wfTrimText(rawNode.detail, 200),
              at: wfFinite(rawNode.at),
              status: typeof rawNode.status === "string" ? rawNode.status : "",
            });
          }
        }
        var branchCount = wfFinite(rawBranch.count);
        var branchTrunc = wfFinite(rawBranch.truncated);
        branchRows.push({
          id: typeof rawBranch.id === "string" ? rawBranch.id : "branch-" + bi,
          kind: typeof rawBranch.kind === "string" ? rawBranch.kind : "subagent",
          label: wfTrimText(rawBranch.label, 160),
          status: typeof rawBranch.status === "string" ? rawBranch.status : "running",
          startedAt: wfFinite(rawBranch.startedAt),
          endedAt: wfFinite(rawBranch.endedAt),
          count: branchCount === null ? branchNodes.length : branchCount,
          truncated:
            branchTrunc === null
              ? Math.max(0, (branchCount === null ? branchNodes.length : branchCount) - branchNodes.length)
              : Math.max(0, branchTrunc),
          nodes: branchNodes,
        });
      }
      branchRows.sort(function (left, right) {
        var leftAt = left.startedAt === null ? 0 : left.startedAt;
        var rightAt = right.startedAt === null ? 0 : right.startedAt;
        return leftAt - rightAt;
      });
      var hiddenBranches = 0;
      if (branchRows.length > WF_BRANCH_SHOWN) {
        hiddenBranches = branchRows.length - WF_BRANCH_SHOWN;
        branchRows = branchRows.slice(branchRows.length - WF_BRANCH_SHOWN);
      }
      var branchDropped = wfFinite(view.droppedBranches) === null ? 0 : Math.max(0, view.droppedBranches);

     // The pulsing node is only "current" while its OWN step is the selected one.
     // The pulsing node is only "current" while its OWN step is the selected one.
      var activeNodeId = null;
      if (activeIndex !== null && activeIndex === selected && view.active && typeof view.active.nodeId === "string") {
        activeNodeId = view.active.nodeId;
      }

     // the single page. EVERY step becomes one unit on the serial main flow, with its own
     // satellites, so the page needs each step's nodes — not only the selected step's. The same
     // whitelist copy is used (path/action only), so a satellite can never carry anything the
     // selected step's flow would refuse to show.
      var pageUnits = [];
      for (var u = 0; u < rows.length; u += 1) {
        var unitStep = steps[u] && typeof steps[u] === "object" ? steps[u] : {};
        var unitIds = Array.isArray(unitStep.nodeIds) ? unitStep.nodeIds : [];
        var unitNodes = [];
        var unitTools = Object.create(null);
        var unitFiles = Object.create(null);
        var unitToolCount = 0;
        for (var ui = 0; ui < unitIds.length; ui += 1) {
          var unitRaw = nodeById[unitIds[ui]];
          if (!unitRaw) continue;
          if (unitRaw.kind === "tool") {
            unitToolCount += 1;
            if (typeof unitRaw.tool === "string" && unitRaw.tool !== "") unitTools[unitRaw.tool] = true;
          }
          var unitFilesWire = Array.isArray(unitRaw.files) ? unitRaw.files : [];
          for (var uf = 0; uf < unitFilesWire.length; uf += 1) {
            var unitFile = unitFilesWire[uf];
            if (unitFile && typeof unitFile.path === "string" && unitFile.path !== "") unitFiles[unitFile.path] = true;
          }
          unitNodes.push({
            id: typeof unitRaw.id === "string" ? unitRaw.id : "n" + u + "-" + ui,
            tool: wfTrimText(unitRaw.tool, 40),
            error: typeof unitRaw.error === "string" && unitRaw.error !== "",
            fileList: unitFilesWire
              .filter(function (file) {
                return file && typeof file.path === "string" && file.path !== "";
              })
              .map(function (file) {
                return { path: file.path, action: typeof file.action === "string" ? file.action : "" };
              }),
          });
        }
     // The running step's own active call lights its satellite; every other step gets none.
        var unitActive = activeIndex === u && view.active && typeof view.active.nodeId === "string" ? view.active.nodeId : "";
        var unitSides = wfTypeSides(unitNodes, unitActive);
        pageUnits.push({
          index: u,
          title: rows[u].title,
          status: rows[u].status,
          statusKey: rows[u].statusKey,
          statusSource: rows[u].statusSource,
          planIndex: rows[u].planIndex,
          active: rows[u].active,
     // the ONE flag every animated piece reads (ring, rail, connector, tool type).
          live: rows[u].live === true,
          percent: rows[u].percent,
          percentSource: rows[u].percentSource,
          lastEstimateAt: rows[u].lastEstimateAt,
          startedAt: rows[u].startedAt,
          toolCount: unitToolCount,
          requiresConfirmation: rows[u].requiresConfirmation === true,
          pendingConfirm: Array.isArray(rows[u].pendingConfirm) ? rows[u].pendingConfirm : [],
          fileCount: Object.keys(unitFiles).length,
          left: unitSides.left,
          right: unitSides.right,
          dropped: unitSides.dropped,
          types: unitSides.all,
        });
      }
      var pageRunningIndex = runningIndex === null ? null : runningIndex;

      return {
        kind: "ready",
        planning: false,
        task: task,
        progress: { done: done, total: steps.length, percent: percentOverall },
        activeStep: activeIndex,
        selected: selected,
     // the one flag the living layer switches on. Derived AFTER activeNodeId, because
     // "a node is mid-call right now" is the strongest non-host signal there is.
        running: wfSessionRunning(view, activeNodeId, nowMs),
        steps: rows,
        flow: {
          stepTitle: rows[selected].title,
          nodes: flowNodes,
          total: flowNodes.length,
     // "omitted" count must cover EVERY missing node, not only the per-step cap: the
     // global 1200-node cap also prunes a step's id list while leaving
     // step.truncatedNodes at 0. The honest gap is nodeCount − drawn.
          truncated: Math.max(
            wfFinite(step.truncatedNodes) === null ? 0 : step.truncatedNodes,
            (wfFinite(step.nodeCount) === null ? flowNodes.length : step.nodeCount) - flowNodes.length
          ),
          stepNodeTotal: wfFinite(step.nodeCount) === null ? flowNodes.length : step.nodeCount,
          groups: flowGroups,
          activeNodeId: activeNodeId,
          branches: branchRows,
          hiddenBranches: hiddenBranches,
          branchDropped: branchDropped,
        },
     // the single page: one unit per step, its satellites, and the index of the step the
     // chain should bring to the middle. `types` is every bucket (not only the drawn ones), so the
     // right page can show the ones the card could not fit.
        page: {
          units: pageUnits,
          runningIndex: pageRunningIndex,
          toolTypes: WF_TYPE_COMPOUND.slice(),
        },
        counts: view.counts && typeof view.counts === "object" ? view.counts : null,
        plan: planSummary,
     // the selected step's report + statistics, or null for the planning card.
        detail: detail,
        settings: wfSettingsOf(prefs),
        todos: todos,
     // the hot-inject history (the host's own fold of `agent/inbox/spliced` + the
     // admitting `user/message`). Oldest first, bounded, never invented.
        injects: wfInjectRows(view.injects),
        asOf: wfFinite(view.asOf),
        now: wfFinite(nowMs),
      };
    }

    // ===== src/client/Settings.js =====
    /**
     * Settings.js — presentation preferences and the in-panel settings card.
     *
     * Everything here is display-only. A setting never reaches the host half, never
     * changes a snapshot, and never writes anything except the one localStorage record
     * that store.js already owns (`dsh-workflow-map:prefs`).
     *
     * The allow-lists live in theme.js (WF_PALETTES / WF_MOTIONS / WF_DETAIL_MODES /
     * WF_NODE_LIMITS), so the sanitizer, the segmented control and the CSS cannot drift
     * apart. A corrupted / older record degrades field by field to the documented
     * defaults instead of blanking the panel.
     *
     * Pure: `h` and `say` are injected. Inlined into client.js by tools/build-client.mjs.
     */

    /** The documented defaults ("Reset to defaults" restores exactly these values). */
    function wfDefaultSettings() {
      return {
        palette: "rainbow",
        motion: "full",
        detail: "summary",
        nodeLimit: 60,
      };
    }

    function wfAllowed(value, allowed, fallback) {
      if (typeof value === "string") {
        for (var i = 0; i < allowed.length; i += 1) if (value === allowed[i]) return value;
      }
      for (var f = 0; f < allowed.length; f += 1) if (fallback === allowed[f]) return fallback;
      return allowed[0];
    }

    /**
     * 60 / 30 / 120 / 0 - 0 means "all". The string "all" is accepted on read so a
     * hand-edited record cannot strand the panel, but it is persisted as 0.
     */
    function wfSanitizeNodeLimit(value, fallback) {
      var fallbackNumber = wfFinite(fallback) === null ? 60 : Math.round(fallback);
      if (WF_NODE_LIMITS.indexOf(fallbackNumber) === -1) fallbackNumber = 60;
      if (typeof value === "string" && value.toLowerCase() === "all") return 0;
      var number = wfFinite(value);
      if (number === null) return fallbackNumber;
      number = Math.round(number);
      return WF_NODE_LIMITS.indexOf(number) === -1 ? fallbackNumber : number;
    }

    /**
     * Sanitize the four presentation fields. `fallback` may be the full prefs record
     * (store.js passes it), so a partial or stale record keeps the fields it still has.
     */
    function wfSanitizeSettings(input, fallback) {
      var base = fallback && typeof fallback === "object" ? fallback : wfDefaultSettings();
      var defaults = wfDefaultSettings();
      return {
        palette: wfAllowed(input && input.palette, WF_PALETTES, wfAllowed(base.palette, WF_PALETTES, defaults.palette)),
        motion: wfAllowed(input && input.motion, WF_MOTIONS, wfAllowed(base.motion, WF_MOTIONS, defaults.motion)),
        detail: wfAllowed(input && input.detail, WF_DETAIL_MODES, wfAllowed(base.detail, WF_DETAIL_MODES, defaults.detail)),
        nodeLimit: wfSanitizeNodeLimit(input && input.nodeLimit, wfSanitizeNodeLimit(base.nodeLimit, defaults.nodeLimit)),
      };
    }

    /** The compact copy the model carries to the renderers. */
    function wfSettingsOf(prefs) {
      return wfSanitizeSettings(prefs, wfDefaultSettings());
    }

    /** Localised label for one option; values are code, labels are dictionary entries. */
    function wfSettingOptionKey(setting, value) {
      if (setting === "palette") return "panel.settings.palette." + value;
      if (setting === "motion") return "panel.settings.motion." + value;
      if (setting === "detail") return "panel.settings.detail." + value;
      if (setting === "nodeLimit") return value === 0 ? "panel.settings.limit.all" : null;
      return null;
    }

    function wfSettingOptionLabel(setting, value, say) {
      var key = wfSettingOptionKey(setting, value);
      if (key !== null) return say(key);
      return String(value);
    }

    /** One segmented row. Buttons are the visible state (`aria-pressed`), not a select. */
    function wfRenderSettingSegment(h, setting, labelKey, values, current, say, actions) {
      var fire = actions || {};
      var buttons = values.map(function (value) {
        var active = value === current;
        var label = wfSettingOptionLabel(setting, value, say);
        return h(
          "button",
          {
            type: "button",
            key: setting + "-" + String(value),
            className: "wf-seg-btn",
            "data-setting": setting,
            "data-value": String(value),
            "data-dsh-workflow-map": "setting-option",
            "aria-pressed": active ? "true" : "false",
            title: say(labelKey) + " · " + label,
            onClick: function () {
              if (typeof fire.onSetting === "function") fire.onSetting(setting, value);
            },
          },
          label
        );
      });
      return h(
        "div",
        { className: "wf-set-grid", key: "row-" + setting, "data-setting-row": setting },
        h("span", { className: "wf-set-label", key: "label" }, say(labelKey)),
        h(
          "div",
          { className: "wf-seg", key: "seg", role: "group", "aria-label": say(labelKey) },
          buttons
        )
      );
    }

    /** A copy button: the 1.5 s acknowledgement is repainted by NodeDetail's helper. */
    function wfRenderExportCopy(h, kind, labelKey, say, actions) {
      var fire = actions || {};
      return h(
        "button",
        {
          type: "button",
          key: "copy-" + kind,
          className: "wf-link",
          "data-export": "copy-" + kind,
          "data-wf-copy-label": say(labelKey),
          onClick: function (event) {
            var element = event && event.currentTarget ? event.currentTarget : null;
            if (typeof fire.onExportCopy === "function") fire.onExportCopy(kind, element);
          },
        },
        h("span", { className: "wf-copy-label", key: "label" }, say(labelKey)),
        h("span", { className: "wf-copy-status", key: "status", "aria-live": "polite" }, "")
      );
    }

    function wfRenderExportDownload(h, kind, labelKey, say, actions) {
      var fire = actions || {};
      return h(
        "button",
        {
          type: "button",
          key: "download-" + kind,
          className: "wf-link",
          "data-export": "download-" + kind,
          title: say(labelKey),
          onClick: function () {
            if (typeof fire.onExportDownload === "function") fire.onExportDownload(kind);
          },
        },
        say(labelKey)
      );
    }

    /**
     * The whole in-panel settings section. It replaces the diagnostic strip:
     * the endpoint / counts / rev remain at the bottom, but the top is now the actual
     * four preferences plus the two export pairs.
     */
    function wfRenderSettings(h, prefs, say, actions, extras) {
      var fire = actions || {};
      var settings = wfSanitizeSettings(prefs, wfDefaultSettings());
      var ui = extras || {};
      return h(
        "div",
        { className: "wf-settings", key: "settings", "data-dsh-workflow-map": "settings" },
        wfRenderSettingSegment(h, "palette", "panel.settings.palette", WF_PALETTES, settings.palette, say, fire),
        wfRenderSettingSegment(h, "motion", "panel.settings.motion", WF_MOTIONS, settings.motion, say, fire),
        wfRenderSettingSegment(h, "detail", "panel.settings.detail", WF_DETAIL_MODES, settings.detail, say, fire),
        wfRenderSettingSegment(h, "nodeLimit", "panel.settings.limit", WF_NODE_LIMITS, settings.nodeLimit, say, fire),
        h(
          "div",
          { className: "wf-set-actions", key: "actions" },
          h(
            "button",
            {
              type: "button",
              key: "reset",
              className: "wf-link",
              "data-action": "reset-prefs",
              title: say("panel.settings.reset.hint"),
              onClick: function () {
                if (typeof fire.onReset === "function") fire.onReset();
              },
            },
            say("panel.settings.reset")
          ),
          h("span", { className: "wf-kv", key: "counts" }, say("panel.settings.counts", {
            steps: ui.steps === undefined ? 0 : ui.steps,
            nodes: ui.nodes === undefined ? 0 : ui.nodes,
          })),
          wfFinite(ui.rev) === null ? null : h("span", { className: "wf-kv", key: "rev" }, say("panel.settings.rev", { rev: ui.rev }))
        ),
        h(
          "div",
          { className: "wf-export", key: "export" },
          h("span", { className: "wf-export-label", key: "label" }, say("panel.settings.export")),
          wfRenderExportCopy(h, "md", "panel.settings.export.markdown", say, fire),
          wfRenderExportCopy(h, "json", "panel.settings.export.json", say, fire),
          wfRenderExportDownload(h, "md", "panel.settings.export.downloadmarkdown", say, fire),
          wfRenderExportDownload(h, "json", "panel.settings.export.downloadjson", say, fire)
        ),
        h(
          "div",
          { className: "wf-set-actions", key: "diag" },
          h("span", { className: "wf-kv", key: "ep" }, say("panel.settings.endpoint") + " " + String(ui.endpoint || ""))
        )
      );
    }

    // ===== src/client/pulse.js =====
    /**
     * pulse.js - the breathing / blinking layer for "what is happening right now".
     *
     * Three things, all testable without a browser:
     * wfMotionMode - a matchMedia wrapper -> "css" | "static" ("static" when the OS requests reduced motion)
     * wfSessionRunning - is the session actually working: prefer the host boolean when present; otherwise infer it with two fallbacks (an active node, or a recent event)
     * wfRenderLive - the "● working ..." widget: a 6 px breathing dot plus a three-dot ellipsis (pure markup, `h`/`say` injected)
     *
     * Why the idle decision needs three legs: the host view now carries `view.running` (folded from `turn/start` /
     * `turn/end`), which is the most accurate signal; but old checkpoints and views that have not reached a turn event do not carry it,
     * so two fallbacks remain - "a node is being called" (active.nodeId) and "there was an event recently" (asOf within <
     * WF_IDLE_AFTER_MS). The boolean wins; the other two apply only when it is absent. A step's running status is
     * not rewritten by PAE right after a turn ends, so it never participates in this decision.
     *
     * Pure, no import/export: inlined into client.js by tools/build-client.mjs (single-file browser half).
     */

    /** The rhythm of the thinking indicator: one breathing cycle every 1.2 s (deliberately different
     * from the 1.6 s status dot: 1.2 s is for "what is happening now", 1.6 s for "the running row",
     * so on the same screen they do not pulse in sync). */
    var WF_PULSE_PERIOD = "1.2s";
    var WF_PULSE_MS = 1200;

    /** The last event older than this, with no active node => the session is idle. 15 s covers a normal tool-call gap
     * while still stopping the animation soon after the user replies (no continuous GPU use). */
    var WF_IDLE_AFTER_MS = 15000;

    /** Number of dots in the ellipsis (three, lit one after another). */
    var WF_LIVE_DOTS = 3;

    /**
     * The OS "reduced motion" switch. `matchMediaFn` is injected rather than read off window, so the Node self-test can
     * cover three environments: matchMedia present / absent / throwing.
     */
    function wfMotionMode(matchMediaFn) {
      if (typeof matchMediaFn !== "function") return "css";
      try {
        var query = matchMediaFn("(prefers-reduced-motion: reduce)");
        return query && query.matches === true ? "static" : "css";
      } catch (error) {
      // A throwing matchMedia is not a request for reduced motion - the environment simply cannot answer -> animate as usual.
        return "css";
      }
    }

    /**
     * Is the session working.
     * 1. The host's `view.running` (the turn flag) -> use it as-is; the other three no longer participate.
     * 2. An active node (active.nodeId) -> it is calling right now, regardless of how old the last event is.
     * 3. The last event is within WF_IDLE_AFTER_MS -> still working.
     * 4. Anything else -> idle.
     * When `nowMs` is unavailable (offline self-test, no clock) return "working": better to animate one extra frame than to treat a
     * working session as idle (which would make the curve and the frame look broken).
     */
    function wfSessionRunning(view, activeNodeId, nowMs) {
      if (view && typeof view.running === "boolean") return view.running;
      if (typeof activeNodeId === "string" && activeNodeId !== "") return true;
      var asOf = wfFinite(view && view.asOf);
      if (asOf === null || asOf <= 0) return false;
      var now = wfFinite(nowMs);
      if (now === null) return true;
      return now - asOf < WF_IDLE_AFTER_MS;
    }

    /** The component's motion mode: follows the OS preference, listener removed on unmount. */
    function wfUseMotion() {
      var pair = React.useState(function () {
        return wfMotionMode(typeof window !== "undefined" && window ? window.matchMedia : null);
      });
      var mode = pair[0];
      var setMode = pair[1];

      React.useEffect(function () {
        if (typeof window === "undefined" || !window || typeof window.matchMedia !== "function") return undefined;
        var query = null;
        try {
          query = window.matchMedia("(prefers-reduced-motion: reduce)");
        } catch (error) {
          return undefined;
        }
        if (!query) return undefined;
        setMode(query.matches === true ? "static" : "css");
        function onChange() {
          setMode(wfMotionMode(window.matchMedia));
        }
      // Old Safari only has addListener; try both and remove whichever was used.
        if (typeof query.addEventListener === "function") {
          query.addEventListener("change", onChange);
          return function () {
            query.removeEventListener("change", onChange);
          };
        }
        if (typeof query.addListener === "function") {
          query.addListener(onChange);
          return function () {
            query.removeListener(onChange);
          };
        }
        return undefined;
      }, []);

      return mode === "static" ? "static" : "css";
    }

    /**
     * "● working ..." - the marker for current activity. `scope` is just a tag for tests and styling (step / node);
     * the three dots are separate elements rather than keyframe `content`, which jumps discretely
     * and whose intermediate state cannot be read in a headless browser.
     */
    function wfRenderLive(h, say, scope) {
      var word = typeof say === "function" ? say("panel.live") : "";
      var dots = [];
      for (var i = 0; i < WF_LIVE_DOTS; i += 1) dots.push(h("i", { key: "d" + i }));
      return h(
        "span",
        {
          className: "wf-live",
          key: "live",
          "data-dsh-workflow-map": "live",
          "data-live": typeof scope === "string" && scope !== "" ? scope : "node",
        },
        h("i", { className: "wf-live-dot", key: "dot", "aria-hidden": "true" }),
        h("span", { className: "wf-live-word", key: "word" }, word),
        h("span", { className: "wf-live-dots", key: "dots", "aria-hidden": "true" }, dots)
      );
    }

    // ===== src/client/ProgressUnder.js =====
    /**
     * ProgressUnder.js — the rail that hangs UNDER a step card's frame.
     *
     * Contract :
     * - exactly WF_STEP_GAP (8 px) of air between the card's bottom border and the
     * rail: the rail belongs to the card but must not be glued to its frame;
     * - a WF_STEP_RAIL (6 px) track whose fill is coloured by state — running
     * flows, done is solid, failed is red, not started leaves the track empty;
     * - the number on the right says WHICH KIND of number it is:
     * "~62% estimated" a time-baseline extrapolation (percentSource "baseline", and its cold-start
     * sub-variant "baseline:steps", which keeps the same visible flavour)
     * "62% self-reported" the model's own report (percentSource "model")
     * "62% measured" the todo table's measured completion ratio (percentSource "todos")
     * "100%" a closed step's pinned value
     * - a step that has NOT started never shows a percentage, even when the wire
     * payload carries a stale one. No number is better than a fake number.
     *
     * adds a SECOND line under the rail — one secondary fact about the
     * number, never about the work:
     * - `ago`: how long ago that number was estimated (`view.asOf − step.lastEstimateAt`).
     * Data freshness: a 40-minute-old estimate on a still-running step is not a
     * lie, but the user deserves to know it is stale. `lastEstimateAt` is 0 when
     * no estimate ever arrived, and then the segment is NOT rendered at all —
     * "0 seconds ago" would be a fabricated number, which is exactly what this plugin
     * refuses to print.
     *
     * (2026-10-26) · the projected REMAINING half is GONE by user request. It used to be shipped
     * by the host as a derived millisecond field (median of the finished steps, hard-bounded) and
     * rendered as "remaining ~N minutes"; the host no longer computes it and this rail no longer renders it.
     * One line, one fact, no consumer-less field — and a payload that still carries that field (an
     * older host) is simply not read.
     *
     * Layout : two right-aligned lines. Line 1 = track + percent (unchanged).
     * Line 2 = ago, one font step and one colour step down, so it reads as
     * secondary. With no age to show the whole line is omitted — never a placeholder.
     * In the narrow container (`data-detail='title'`) only line 1 exists — the host
     * hides line 2 with CSS, and the compact renderer never emits it.
     *
     * Pure: no React import, no DOM, no storage — the same functions run in Node for
     * tools/selftest-panel.mjs and in the browser. `h` (React.createElement) and
     * `say` are injected, so this chunk can be asserted without React.
     *
     * Inlined into client.js by tools/build-client.mjs (single-file browser half).
     */

    /** The rail's three label flavours, as opposed to "no label at all". */
    function wfProgressLabel(percent, source, status, say) {
      var value = wfFinite(percent);
      if (value === null) return null;
     // A step that has not started has no progress to report. Showing a number here
     // would be the exact lie the acceptance criterion forbids.
      if (status === "pending" || status === "skipped") return null;
      var rounded = Math.round(wfClamp(value, 0, 100));
      // the cold-start sub-variant of the baseline keeps the SAME visible flavour (~N% estimated):
     // the sub-division is machine-readable (`baseline:steps`), and falling through to the closed
     // flavour would print it as a pinned 100 %-style number, which it is not.
      if (source === "baseline" || source === "baseline:steps") {
        return { kind: "estimate", percent: rounded, text: say("panel.percent.estimate", { percent: rounded }) };
      }
      if (source === "model") {
        return { kind: "self", percent: rounded, text: say("panel.percent.self", { percent: rounded }) };
      }
     // a MEASURED number (the todo table's own completion ratio). It must read differently
     // from both "self-reported" and "estimated", or the user cannot tell a fact from a guess.
      if (source === "todos") {
        return { kind: "real", percent: rounded, text: say("panel.percent.real", { percent: rounded }) };
      }
      return { kind: "closed", percent: rounded, text: rounded + "%" };
    }

    /**
     * Fill width in percent of the track. A running step with no number yet gets a
     * narrow indeterminate segment (animated, no digits) instead of a fake value.
     */
    function wfProgressFillWidth(row) {
      var status = row && typeof row.status === "string" ? row.status : "pending";
      if (status === "pending" || status === "skipped") return 0;
      var value = wfFinite(row.percent);
      if (value === null) return status === "running" ? 30 : 0;
      return Math.round(wfClamp(value, 0, 100));
    }

    function wfProgressIndeterminate(row) {
      var status = row && typeof row.status === "string" ? row.status : "pending";
      return status === "running" && wfFinite(row.percent) === null;
    }

    /**
     * 180_000 -> "3 minutes", 5_400 -> "54 seconds", 3_720_000 -> "62 minutes".
     * One decimal below ten seconds, integers above — a clock's precision, not a
     * stopwatch's. 0 or less returns "" (never "0 seconds": see the caller).
     */
    function wfProgressDurationText(ms) {
      var value = wfFinite(ms);
      if (value === null || value <= 0) return "";
      if (value < 10000) {
        var seconds = Math.round(value / 100) / 10;
        return (seconds % 1 === 0 ? String(Math.round(seconds)) : seconds.toFixed(1)) + " 秒";
      }
      if (value < 60000) return Math.round(value / 1000) + " 秒";
      if (value < 3600000) {
        var minutes = Math.floor(value / 60000);
        return minutes + " 分钟";
      }
      return Math.floor(value / 3600000) + " 小时";
    }

    /**
     * the ONE secondary fact left — how stale the number being quoted is — or null. Pure
     * arithmetic on the row the host already shipped; no clock is read here (the caller passes `asOf`).
     *
     * `ago` needs a real `lastEstimateAt` AND an `asOf` after it: a step that has never carried a
     * number gets no segment, and a future stamp (a re-ordered event log) is clamped to nothing
     * rather than shown as a negative duration. A missing field produces NO segment — never a
     * fabricated 0 or "—" (the ETA half went with the host's derived field).
     */
    function wfProgressTiming(row, asOf) {
      var status = row && typeof row.status === "string" ? row.status : "pending";
      var now = wfFinite(asOf);
      var estimateAt = wfFinite(row ? row.lastEstimateAt : null);
     // The gate mirrors the percent label's: only a step that HAS a live progress number can read
     // "estimated N minutes ago", because the sentence is about that number. A pending row with a leftover stamp
     // (a re-plan that reset a step, say) would otherwise advertise an estimate it never made — the
     // same "no number beats a fake number" rule the percent label already follows. `ago` is a fact
     // about the PAST, so it only needs a number to have existed at all: percent > 0.
      var livePercent = wfFinite(row ? row.percent : null);
      var hasAnyNumber = livePercent !== null && livePercent > 0 && status !== "pending";
      var ago = null;
      if (hasAnyNumber && now !== null && estimateAt !== null && estimateAt > 0 && now > estimateAt) {
        ago = wfProgressDurationText(now - estimateAt);
        if (ago === "") ago = null;
      }
      return { ago: ago };
    }

    /** One rail: track + fill + the right-hand number (omitted when there is none). */
    function wfRenderProgressDock(h, row, say, asOf) {
      var status = row && typeof row.status === "string" ? row.status : "pending";
      var label = wfProgressLabel(row ? row.percent : null, row ? row.percentSource : "none", status, say);
      var width = wfProgressFillWidth(row);
      var indeterminate = wfProgressIndeterminate(row);
      var compact = !!(row && row.compact === true);
      var ago = compact ? null : wfProgressTiming(row, asOf).ago;

      var trackProps = {
        className: "wf-prog-track",
        key: "track",
        role: "progressbar",
        "aria-label": say("panel.step.progress", { title: row && row.title ? row.title : "" }),
        "aria-valuemin": 0,
        "aria-valuemax": 100,
      };
      if (label !== null) {
        trackProps["aria-valuenow"] = label.percent;
        trackProps["aria-valuetext"] = label.text;
      }

     // the second line — ONE fact (the age of the number), so there is no bits array and
     // no separator any more. the projected remainder is gone, so `data-timing` converged to
     // none|one; nothing at all renders when there is no age (never a placeholder).
      var subline = ago === null
        ? null
        : h(
            "div",
            { className: "wf-prog-sub", key: "sub" },
            h(
              "span",
              {
                className: "wf-prog-ago",
                key: "ago",
                title: say("panel.percent.ago", { duration: ago }),
              },
              say("panel.percent.ago", { duration: ago })
            )
          );

      return h(
        "div",
        {
          className: "wf-prog-dock",
          key: "dock",
          "data-dsh-workflow-map": "progress",
          "data-step-index": row ? row.index : undefined,
          "data-status": status,
          "data-indeterminate": indeterminate ? "true" : "false",
          "data-timing": ago === null ? "none" : "one",
        },
        h(
          "div",
          { className: "wf-prog-row", key: "row" },
          h("div", trackProps, h("div", {
            className: "wf-prog-fill",
            key: "fill",
            "data-indeterminate": indeterminate ? "true" : "false",
      // Exactly one step's rail carries the flowing gradient: decided by the caller's row.live (the host marks only
      // the single running row), not "everything running animates". Without that field it falls back to the old behaviour.
            "data-live": (row && row.live === true) || (row && row.live === undefined && status === "running") ? "true" : "false",
            style: { width: width + "%" },
          })),
          label === null
            ? null
            : h(
                "span",
                {
                  className: "wf-prog-label",
                  key: "label",
                  "data-kind": label.kind,
                  "data-percent": label.percent,
                  title: label.text,
                },
                label.text
              )
        ),
        subline
      );
    }

    // ===== src/client/StepDetail.js =====
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

    // ===== src/client/StepColumn.js =====
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

    // ===== src/client/NodeDetail.js =====
    /**
     * NodeDetail.js - "what did this node actually do", inline under the selected node card.
     *
     * The card (NodeCard.js) answers what / how / how did it in one line; a click expands
     * this block, which is the only place the panel shows:
     * head tool name · category chip (file / command / skill / subagent / CAD / other) · status
     * args the host's argsText digest (≤ ARGS_CAP, monospace, pre-wrap) — a single-line
     * preview plus a <details> that opens the whole stored text
     * files grouped by action: read / edited / written / queried; each row copies the path
     * result the first line; on an error the stored error text is shown in full
     * meta start clock · duration ms · event seq
     *
     * PRIVACY ( §3): the panel never shows file CONTENT. That is structural, not a
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
     * A node with no files yields [] - the renderer prints "no files touched" itself.
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
     // Two spans, never a bare text node: the 1.5 s "Copied" repaints the status span only,
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
    /* clipboard */
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
     * renderers stay state-free and a React re-render cannot strand a "Copied" label.
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

    /** How long "Copied" stays on the button. */
    var WF_COPY_FEEDBACK_MS = 1500;

    /* ------------------------------------------------------------------------- */
    /* keyboard + layout wiring */
    /* ------------------------------------------------------------------------- */

    /** Escape, and not while the user is composing (IME) or holding a modifier. */
    function wfEscapeIntent(event) {
      if (!event || event.key !== "Escape") return false;
      if (event.isComposing === true || event.altKey === true || event.ctrlKey === true || event.metaKey === true) return false;
      return true;
    }

    /**
     * Document-level Escape: collapse the details, not the panel. `actions.onEscapeDetail`
     * is fired once per Escape; returns a handle with destroy so the hook can unmount it.
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
     * Details change the height of the scrolling columns, and the curve measures the
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

    // ===== src/client/NodeCard.js =====
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

    // ===== src/client/export.js =====
    /**
     * export.js — the workflow snapshot (Markdown / JSON) and its two delivery
     * paths (clipboard, Blob download).
     *
     * Source of truth is the SAME wire view the panel renders plus the already-derived
     * model (statuses, selection, the active node). No second interpretation of the
     * session is invented here: step count and node count come from model.steps /
     * view.steps, and a node's title is exactly what NodeCard.js shows.
     *
     * Object URLs are kept in one module list and revoked when the panel unmounts, so a
     * download does not leak a Blob for the lifetime of the page.
     *
     * Pure apart from wfSnapshotDownload (which receives every browser API through
     * `env` in tests). Inlined into client.js by tools/build-client.mjs.
     */

    var WF_SNAPSHOT_SCHEMA = "dsh-workflow-map.snapshot/v1";
    var WF_SNAPSHOT_URLS = [];

    function wfSnapshotMime(kind) {
      return kind === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8";
    }

    function wfSnapshotExtension(kind) {
      return kind === "json" ? "json" : "md";
    }

    /**
     * Session ids on this harness look like `session-f069ece7-…`. Drop that prefix,
     * then take the first 8 alphanumerics, so the filename is `workflow-f069ece7.md`
     * instead of the useless `workflow-session-.md` a naive slice would produce.
     */
    function wfSnapshotTag(sessionId) {
      var flat = typeof sessionId === "string" ? sessionId : "";
      flat = flat.replace(/^session-/, "").replace(/[^A-Za-z0-9]/g, "");
      if (flat === "") flat = "session";
      return flat.slice(0, 8);
    }

    function wfSnapshotFileName(sessionId, kind) {
      return "workflow-" + wfSnapshotTag(sessionId) + "." + wfSnapshotExtension(kind);
    }

    function wfSnapshotClock(ms) {
      var value = wfFinite(ms);
      if (value === null) return "—";
      var date = new Date(value);
      if (!isFinite(date.getTime())) return "—";
      function pad(value2) {
        var text = String(value2);
        return text.length < 2 ? "0" + text : text;
      }
      return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " +
        pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
    }

    function wfSnapshotIso(ms) {
      var value = wfFinite(ms);
      if (value === null) return "";
      var date = new Date(value);
      return isFinite(date.getTime()) ? date.toISOString() : "";
    }

    function wfSnapshotFlat(text) {
      return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
    }

    /** Whitelist one wire node exactly like store.js does for the panel. */
    function wfSnapshotNode(raw, activeNodeId, say) {
      var node = raw && typeof raw === "object" ? raw : {};
      var category = wfNodeCategory(node);
      var parts = wfNodeTitleParts(node, category, say);
      var title = parts.verb === "" ? parts.target : parts.verb + " · " + parts.target;
      var fileList = [];
      if (Array.isArray(node.files)) {
        for (var i = 0; i < node.files.length; i += 1) {
          var file = node.files[i];
          if (!file || typeof file.path !== "string" || file.path === "") continue;
          fileList.push({ path: file.path, action: typeof file.action === "string" ? file.action : "" });
        }
      }
      var errorText = typeof node.error === "string" ? wfSnapshotFlat(node.error) : "";
      var resultHead = wfSnapshotFlat(node.resultHead);
      var status = errorText !== "" ? "error" : wfNodeStatus(node, activeNodeId);
      if (status === "pending" && resultHead !== "") status = "done";
      return {
        id: typeof node.id === "string" ? node.id : "",
        kind: typeof node.kind === "string" ? node.kind : "other",
        tool: typeof node.tool === "string" ? node.tool : "",
        category: category,
        title: title,
        detail: wfSnapshotFlat(node.detail).slice(0, 300),
     // The host already capped argsText at 200 chars; preserve its newlines because a
     // command's shape is part of what the snapshot is for (the panel shows it pre-wrap).
        argsText: typeof node.argsText === "string" ? node.argsText.slice(0, 200) : "",
        status: status,
        seq: wfFinite(node.seq),
        at: wfFinite(node.at),
        durationMs: wfFinite(node.durationMs),
        files: fileList,
        resultHead: resultHead.slice(0, 200),
        error: errorText.slice(0, 200),
      };
    }

    /** Model steps (derived status) + the view's nodeIds, joined node by node. */
    function wfSnapshotSteps(model, view, say) {
      var viewSteps = view && Array.isArray(view.steps) ? view.steps : [];
      var rawNodes = view && Array.isArray(view.nodes) ? view.nodes : [];
      var byId = Object.create(null);
      for (var n = 0; n < rawNodes.length; n += 1) {
        if (rawNodes[n] && typeof rawNodes[n].id === "string") byId[rawNodes[n].id] = rawNodes[n];
      }
      var steps = model && Array.isArray(model.steps) ? model.steps : [];
      var out = [];
      for (var i = 0; i < steps.length; i += 1) {
        var row = steps[i] || {};
        var wireStep = viewSteps[i] && typeof viewSteps[i] === "object" ? viewSteps[i] : {};
        var ids = Array.isArray(wireStep.nodeIds) ? wireStep.nodeIds : [];
        var activeNodeId =
          model && model.selected === row.index && model.flow && typeof model.flow.activeNodeId === "string"
            ? model.flow.activeNodeId
            : null;
        var nodes = [];
        for (var k = 0; k < ids.length; k += 1) {
          var found = byId[ids[k]];
          if (found) nodes.push(wfSnapshotNode(found, activeNodeId, say));
        }
        var nodeCount = wfFinite(row.nodeCount) === null ? nodes.length : Math.round(row.nodeCount);
        out.push({
          index: wfFinite(row.index) === null ? i : row.index,
          planIndex: wfFinite(row.planIndex) === null ? null : row.planIndex,
          title: typeof row.title === "string" ? row.title : "—",
          status: typeof row.status === "string" ? row.status : "pending",
          statusLabel: typeof say === "function" ? say(row.statusKey) : String(row.statusKey || row.status || "—"),
          percent: wfFinite(row.percent),
          percentSource: typeof row.percentSource === "string" ? row.percentSource : "none",
          startedAt: wfFinite(row.startedAt),
          endedAt: wfFinite(row.endedAt),
          nodeCount: nodeCount,
          truncated: Math.max(0, nodeCount - nodes.length),
          nodes: nodes,
        });
      }
      return out;
    }

    /** The JSON body. `schema` is present even when every other field is empty. */
    function wfBuildSnapshot(model, view, sessionId, nowMs, say) {
      var now = wfFinite(nowMs) === null ? Date.now() : nowMs;
      var steps = wfSnapshotSteps(model, view, say);
      return {
        schema: WF_SNAPSHOT_SCHEMA,
        generatedAt: wfSnapshotIso(now),
        generatedAtMs: Math.round(now),
        sessionId: typeof sessionId === "string" ? sessionId : "",
        task: model && typeof model.task === "string" ? model.task : "",
        progress: model && model.progress ? {
          done: model.progress.done,
          total: model.progress.total,
          percent: model.progress.percent,
        } : { done: 0, total: 0, percent: 0 },
        steps: steps,
      };
    }

    function wfSnapshotJson(model, view, sessionId, nowMs, say) {
      return JSON.stringify(wfBuildSnapshot(model, view, sessionId, nowMs, say), null, 2);
    }

    /** Markdown mirrors the panel's visible vocabulary: status, progress, node title. */
    function wfSnapshotMarkdown(model, view, sessionId, nowMs, say) {
      var snapshot = wfBuildSnapshot(model, view, sessionId, nowMs, say);
      var lines = [];
      lines.push("# 总任务");
      lines.push("");
      lines.push(wfSnapshotFlat(snapshot.task) || "—");
      lines.push("");
      lines.push("- 生成时间：" + wfSnapshotClock(snapshot.generatedAtMs));
      lines.push("- 会话：" + (snapshot.sessionId || "—"));
      lines.push(
        "- 进度：" + snapshot.progress.done + "/" + snapshot.progress.total + " 步 · " + snapshot.progress.percent + "%"
      );
      lines.push("");
      lines.push("## 分步");
      for (var i = 0; i < snapshot.steps.length; i += 1) {
        var step = snapshot.steps[i];
        var percent = wfFinite(step.percent) === null ? "—" : Math.round(step.percent) + "%";
        lines.push("");
        lines.push("### " + (i + 1) + ". " + wfSnapshotFlat(step.title) + "（" + step.statusLabel + " · " + percent + "）");
        if (step.nodes.length === 0) {
          lines.push("- （无节点）");
          continue;
        }
        for (var n = 0; n < step.nodes.length; n += 1) {
          var node = step.nodes[n];
          var tool = node.tool !== "" ? node.tool : node.kind || "—";
          var files = node.files.length + " 文件";
          var duration = wfFormatDuration(node.durationMs) || "—";
          lines.push("- " + tool + " · " + wfSnapshotFlat(node.title) + " · " + files + " · " + duration);
        }
      }
      lines.push("");
      return lines.join("\n");
    }

    function wfSnapshotText(kind, model, view, sessionId, nowMs, say) {
      return kind === "json"
        ? wfSnapshotJson(model, view, sessionId, nowMs, say)
        : wfSnapshotMarkdown(model, view, sessionId, nowMs, say);
    }

    /**
     * Copy one snapshot and paint the 1.5 s acknowledgement on `element` (the same
     * helper the node detail uses, so the two copy paths cannot diverge).
     */
    function wfCopySnapshot(kind, model, view, sessionId, nowMs, say, element, env) {
      return wfCopyWithFeedback(wfSnapshotText(kind, model, view, sessionId, nowMs, say), element, say, env);
    }

    /**
     * Download through Blob + URL.createObjectURL. Every browser object is injectable
     * so Node can assert the filename and the revoke path without a DOM.
     */
    function wfSnapshotDownload(kind, text, sessionId, env) {
      var scope = env || {};
      var doc = scope.document || (typeof document !== "undefined" ? document : null);
      var BlobImpl = scope.Blob || (typeof Blob !== "undefined" ? Blob : null);
      var URLImpl = scope.URL || (typeof URL !== "undefined" ? URL : null);
      if (!doc || typeof BlobImpl !== "function" || !URLImpl || typeof URLImpl.createObjectURL !== "function") {
        return { ok: false, reason: "unsupported", filename: "" };
      }
      if (typeof URLImpl.revokeObjectURL !== "function") {
        return { ok: false, reason: "unsupported", filename: "" };
      }
      var filename = wfSnapshotFileName(sessionId, kind);
      var anchor = doc.createElement("a");
      if (!anchor) return { ok: false, reason: "unsupported", filename: filename };
      var url = URLImpl.createObjectURL(new BlobImpl([text], { type: wfSnapshotMime(kind) }));
      WF_SNAPSHOT_URLS.push(url);
      anchor.href = url;
      anchor.download = filename;
      if (anchor.style) anchor.style.display = "none";
      if (doc.body && typeof doc.body.appendChild === "function") doc.body.appendChild(anchor);
      if (typeof anchor.click === "function") anchor.click();
      if (anchor.parentNode && typeof anchor.parentNode.removeChild === "function") anchor.parentNode.removeChild(anchor);
      return { ok: true, reason: "", filename: filename, url: url };
    }

    /** Release every object URL the panel created. Called from the mount cleanup. */
    function wfReleaseSnapshotUrls(env) {
      var scope = env || {};
      var URLImpl = scope.URL || (typeof URL !== "undefined" ? URL : null);
      var revoked = 0;
      for (var i = 0; i < WF_SNAPSHOT_URLS.length; i += 1) {
        if (URLImpl && typeof URLImpl.revokeObjectURL === "function") {
          try {
            URLImpl.revokeObjectURL(WF_SNAPSHOT_URLS[i]);
            revoked += 1;
          } catch (error) {
     /* an already-revoked URL is not an error */
          }
        }
      }
      WF_SNAPSHOT_URLS = [];
      return revoked;
    }

    function wfSnapshotUrlCount() {
      return WF_SNAPSHOT_URLS.length;
    }

    /** The component's mount cleanup: a Blob URL must not outlive the panel. */
    function wfUseSnapshotUrls() {
      React.useEffect(function () {
        return function () {
          wfReleaseSnapshotUrls();
        };
      }, []);
    }

    // ===== src/client/FlowColumn.js =====
    /**
     * FlowColumn.js — the right column: the selected step's flow, node by node.
     *
     * Structure of the column :
     * header "step flow · step 8 · title" - OUTSIDE the scroller, so it never moves
     * scroller one independently scrolling area (`overflow:auto`)
     * strip "n earlier rows folded" + "expand all" - only when the cap bites
     * list - every item hangs off one vertical spine (the tree spine)
     * item = ONE node card (NodeCard.js) or ONE folded run of same-tool calls
     *
     * The fold: `view.steps[i].groups` (host, ) is authoritative when it resolves
     * against the node list; otherwise the browser folds consecutive same-tool calls
     * itself with the same threshold (WF_GROUP_MIN = the host's GROUP_THRESHOLD). A group
     * hit by the 300-node host cap loses its missing members but never invents one.
     *
     * Branches : `wfRenderBranches` (Branches.js) draws the selected step's subagent /
     * workflow / background-job lanes under the list, from `model.flow.branches`. A lane is NOT
     * a node: the node count, the fold, the node window and the current-activity highlight all
     * ignore it — only the lane's own status dot breathes.
     *
     * The cap: by default only the NEWEST WF_FLOW_CAP nodes are drawn (the list opens at
     * its bottom); a group is never split at the boundary. "expand all" lifts the cap until
     * the step changes — that reset is `wfFlowUiFor`, keyed by step index, so it is a pure
     * function and tools/selftest-panel.mjs can prove it.
     *
     * Pure: `h` and `say` are injected; no React import, no DOM.
     *
     * Inlined into client.js by tools/build-client.mjs (single-file browser half).
     */

    /* ------------------------------------------------------------------------- */
    /* grouping */
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
    /* the cap */
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
    /* per-step UI state (expanded groups · show-all · selected node) */
    /* ------------------------------------------------------------------------- */

    function wfFlowEmptyUi(stepIndex) {
      return {
        stepIndex: stepIndex,
        expanded: [],
        showAll: false,
        selectedNode: null,
        closedBranches: [],
     // which round branch icon is open under the running node (null = none). It is per
     // step, like everything else here, so switching steps closes it instead of leaving a detail
     // hanging under a card the user did not click.
        openChain: null,
      };
    }

    /**
     * Read the UI state AS IT APPLIES to `stepIndex`. A state from another step is not
     * "merged" or reused: switching steps starts from the defaults, which is exactly the
     * "collapse + expand-all cleared + selection cleared" reset the step asks for (and it happens on the
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

    /** Fold / unfold one branch lane. The click target is the lane's HEAD ( §5). */
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
     * open / close one round branch icon's detail. `kind` is one of WF_CHAIN_KINDS; clicking
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
    /* rendering */
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

     // the disclosure triangle is a real <button>, a SIBLING of the row button
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
     // the node window is a display pref (30 / 60 / 120 / all). 0 means all,
     // and "expand all" still lifts any finite cap for this step.
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
     // which branch category the user opened under the running node, and whether that
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

     // The strip is a SIBLING of the scroller: pinned under the header, so "expand all"
     // stays reachable exactly while the list is open at its bottom. It also carries
     // the host-cap note, which "expand all" CANNOT undo (those nodes were never sent).
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
     // the chain layer is a child of the LIST (so its user space is the list's box and
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

    // ===== src/client/Branches.js =====
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

    // ===== src/client/FlowEffects.js =====
    /**
     * FlowEffects.js - the flowing-gradient curve layer (legacy two-column layout).
     *
     * The most recognisable element of that design: the running step (left column, glowing frame) and
     * the running node (right column, glowing frame) were joined by a rainbow curve.
     *
     * Structure:
     * wfFxRound / wfFxBounds - geometry helpers (round to 0.01 px, normalise a DOMRect)
     * wfFxCurve - pure geometry: two points -> a cubic Bezier `M x1 y1 C ...`
     * wfFxGeometry - pure geometry: two cards + viewport -> {visible, d, from, to, reason}
     * wfFxQuery / wfFxApply - DOM: find elements, compute, write `d`/endpoints back into the SVG, leaving `data-endpoints` as evidence
     * wfFxBind - DOM: ResizeObserver + scroll(capture) + resize, recomputed on a rAF throttle
     * wfUseFlowEffects - React wrapper: rebinds once per "visual signature" change
     * wfRenderFlowEffects - pure markup: <svg> + two gradients + two paths + two endpoint circles
     * wfFxSignature - model -> a short signature (rebind only when it changes, not on every 800 ms poll)
     *
     * Why "absolutely positioned SVG with no viewBox": the curve was drawn in the gap between the two
     * columns, each scrolling independently. The SVG covers .wf-body (position:relative); coordinates = card rect - SVG rect,
     * so no viewBox scaling is needed: 1 user unit is 1 px, and endpoint error comes only from one rounding step.
     *
     * Endpoint rule: the curve is drawn only when BOTH cards are fully inside their own scroll viewport; otherwise hidden (data-visible=false).
     * Clamping endpoints to the viewport edge would stop them hugging the card edge, making the 2 px tolerance meaningless,
     * so drawing nothing is the honest option.
     *
     * Pure, no import/export: inlined into client.js by tools/build-client.mjs (single-file browser half).
     */

    /** Minimum column gap needed to fit a curve (below this the columns would touch). */
    var WF_FX_MIN_GAP = 10;

    /** Endpoint margin: the control point horizontal offset is 45 % of the gap, clamped to this range. */
    var WF_FX_BOW_MIN = 8;
    var WF_FX_BOW_MAX = 140;

    /** Placeholder endpoints written into the SVG (before measuring, both circles sit outside the canvas so nothing flashes). */
    var WF_FX_OFFSCREEN = -99;

    /** After queueing, wait at most this long before measuring from a timer (environments where rAF never fires, e.g. headless --dump-dom). */
    var WF_FX_FALLBACK_MS = 40;

    /**
     * step-05 · how many node-to-node links the chain layer can draw at once.
     *
     * An SVG child list is built once when React renders it; the measuring code can only write into
     * the paths that already exist. The column draws at most WF_FLOW_CAP nodes (60) or, when the user
     * lifts the cap, the whole step — so the slot count has to cover the largest list the panel can
     * show. 240 slots is one <path> per link with room to spare and costs nothing until written (a
     * path with an empty `d` paints nothing).
     */
    var WF_CHAIN_LINK_SLOTS = 240;
    function wfFxRound(value) {
      var n = wfFinite(value);
      return n === null ? 0 : Math.round(n * 100) / 100;
    }

    /** DOMRect (or any {left, top, width, height}) -> a normalised rect; null when unusable. */
    function wfFxBounds(rect) {
      if (!rect || typeof rect !== "object") return null;
      var left = wfFinite(rect.left);
      var top = wfFinite(rect.top);
      var width = wfFinite(rect.width);
      var height = wfFinite(rect.height);
      var right = wfFinite(rect.right);
      var bottom = wfFinite(rect.bottom);
      if (width === null && left !== null && right !== null) width = right - left;
      if (height === null && top !== null && bottom !== null) height = bottom - top;
      if (left === null || top === null || width === null || height === null) return null;
      if (!(width > 0) || !(height > 0)) return null;
      return { left: left, top: top, width: width, height: height, right: left + width, bottom: top + height };
    }

    /** Is the rect fully inside the viewport (0.5 px rounding allowed, half a card not allowed). */
    function wfFxInside(rect, view) {
      if (!rect || !view) return false;
      return (
        rect.left >= view.left - 0.5 &&
        rect.right <= view.right + 0.5 &&
        rect.top >= view.top - 0.5 &&
        rect.bottom <= view.bottom + 0.5
      );
    }

    /**
     * A cubic Bezier between two points. Control points offset horizontally only (the classic "S bend"):
     *   M x1 y1 C x1+bow y1, x2-bow y2, x2 y2
     * Gap too narrow (< WF_FX_MIN_GAP) or invalid coordinates -> null, and the caller hides the whole layer.
     *
     * @returns {{d:string, from:{x:number,y:number}, to:{x:number,y:number}, dx:number, bow:number}|null}
     */
    function wfFxCurve(fromX, fromY, toX, toY) {
      var x1 = wfFinite(fromX);
      var y1 = wfFinite(fromY);
      var x2 = wfFinite(toX);
      var y2 = wfFinite(toY);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      var dx = x2 - x1;
      if (!(dx >= WF_FX_MIN_GAP)) return null;
      var bow = wfClamp(dx * 0.45, WF_FX_BOW_MIN, WF_FX_BOW_MAX);
      if (bow > dx * 0.5) bow = dx * 0.5;
      var ax = wfFxRound(x1);
      var ay = wfFxRound(y1);
      var bx = wfFxRound(x2);
      var by = wfFxRound(y2);
      var c1 = wfFxRound(x1 + bow);
      var c2 = wfFxRound(x2 - bow);
      return {
        d: "M" + ax + " " + ay + "C" + c1 + " " + ay + " " + c2 + " " + by + " " + bx + " " + by,
        from: { x: ax, y: ay },
        to: { x: bx, y: by },
        dx: wfFxRound(dx),
        bow: wfFxRound(bow),
      };
    }

    /**
     * Two cards + their own scroll viewports -> whether to draw this frame, and where.
     *
     * `origin` is the SVG rect (not the .wf-body border box: an absolutely positioned element's containing block is the padding box,
     * so using the SVG's own rect keeps coordinates aligned with its internal user coordinate system).
     *
     * reason: ok | no-origin | no-step | no-node | step-clipped | node-clipped | no-gap
     */
    function wfFxGeometry(stepRect, nodeRect, origin, stepClip, nodeClip) {
      var originBox = wfFxBounds(origin);
      if (!originBox) return { visible: false, reason: "no-origin", d: null };
      var step = wfFxBounds(stepRect);
      if (!step) return { visible: false, reason: "no-step", d: null };
      var node = wfFxBounds(nodeRect);
      if (!node) return { visible: false, reason: "no-node", d: null };
      var stepView = stepClip === undefined || stepClip === null ? null : wfFxBounds(stepClip);
      var nodeView = nodeClip === undefined || nodeClip === null ? null : wfFxBounds(nodeClip);
      if (stepView && !wfFxInside(step, stepView)) return { visible: false, reason: "step-clipped", d: null };
      if (nodeView && !wfFxInside(node, nodeView)) return { visible: false, reason: "node-clipped", d: null };

      var fromX = step.right - originBox.left;
      var fromY = step.top + step.height / 2 - originBox.top;
      var toX = node.left - originBox.left;
      var toY = node.top + node.height / 2 - originBox.top;
      var curve = wfFxCurve(fromX, fromY, toX, toY);
      if (!curve) return { visible: false, reason: "no-gap", d: null };
      return {
        visible: true,
        reason: "ok",
        d: curve.d,
        from: curve.from,
        to: curve.to,
        dx: curve.dx,
        bow: curve.bow,
      };
    }

    /* ------------------------------------------------------------------------- */
    /* DOM                                                                       */
    /* ------------------------------------------------------------------------- */

    /** One query returns everything: container, SVG, both cards, both scroll viewports. Missing any of them means no guessing. */
    function wfFxQuery(doc) {
      if (!doc || typeof doc.querySelector !== "function") return null;
      var body = doc.querySelector('[data-dsh-workflow-map="body"]');
      if (!body) return null;
      return {
        body: body,
        svg: body.querySelector('[data-dsh-workflow-map="fx"]'),
        // Left column: the running step card (the li carries data-status; the card is its direct child)
        stepCard: body.querySelector('.wf-step-item[data-status="running"] > .wf-step-card'),
        // Right column: the node card being called (the same li's data-status is the only running one)
        nodeCard: body.querySelector('.wf-flow-item[data-status="running"] > .wf-node'),
        stepClip: body.querySelector(".wf-steps-scroll"),
        nodeClip: body.querySelector(".wf-flow-scroll"),
      };
    }

    function wfFxRectOf(element) {
      if (!element || typeof element.getBoundingClientRect !== "function") return null;
      try {
        return element.getBoundingClientRect();
      } catch (error) {
        return null;
      }
    }
    /* ------------------------------------------------------------------------- */
    /* step-05 · the chain's curve channel                                          */
    /* ------------------------------------------------------------------------- */

    /**
     * Two node cards + the list's own rect → ONE cubic that links them.
     *
     * The shape is the step's "vertical midpoint + horizontal bulge": the path leaves the upper card's bottom edge and
     * arrives at the lower card's top edge, with both control points pulled to the VERTICAL midpoint
     * and pushed sideways by `bow`. Sideways is what makes it an S without a corner: a straight
     * vertical hop with a single control point in the middle would still kink at both ends.
     *
     * Coordinates are the list's user space (origin = the list's own rect), so the SVG needs no
     * viewBox and 1 user unit is 1 px — the same trick the cross-column curve uses.
     *
     * reason: ok | no-origin | no-cards | too-close
     */
    function wfChainCurve(origin, upper, lower) {
      var box = wfFxBounds(origin);
      if (!box) return { visible: false, reason: "no-origin", d: null };
      var a = wfFxBounds(upper);
      var b = wfFxBounds(lower);
      if (!a || !b) return { visible: false, reason: "no-cards", d: null };

      var fromX = a.left + a.width / 2 - box.left;
      var fromY = a.bottom - box.top;
      var toX = b.left + b.width / 2 - box.left;
      var toY = b.top - box.top;
      var dy = toY - fromY;
      // Two cards that touch (or overlap) have no gap to draw in. Drawing a zero-length curve would
      // put a stray mark on a card's edge, so the link is simply absent — an honest hole, not a lie.
      if (!(dy > 0)) return { visible: false, reason: "too-close", d: null };

      // The sideways bow ("horizontal bulge"): a share of the horizontal offset plus a fixed 10 px, clamped so
      // an aligned pair still bulges into a readable S instead of collapsing into a straight line.
      var bow = wfClamp(Math.abs(toX - fromX) * 0.6 + 10, 8, 40);
      // Both control points sit on the VERTICAL MIDPOINT of the gap, so the path leaves and arrives
      // pointing straight down — no kink at either end — and the S is formed by the sideways push.
      var mid = wfFxRound(fromY + dy * 0.5);
      var c1x = wfFxRound(fromX + bow);
      var c1y = mid;
      var c2x = wfFxRound(toX - bow);
      var c2y = mid;
      return {
        visible: true,
        reason: "ok",
        d:
          "M" +
          wfFxRound(fromX) +
          " " +
          wfFxRound(fromY) +
          "C" +
          c1x +
          " " +
          c1y +
          " " +
          c2x +
          " " +
          c2y +
          " " +
          wfFxRound(toX) +
          " " +
          wfFxRound(toY),
        from: { x: wfFxRound(fromX), y: wfFxRound(fromY) },
        to: { x: wfFxRound(toX), y: wfFxRound(toY) },
        dy: wfFxRound(dy),
        bow: wfFxRound(bow),
      };
    }

    /**
     * Build the chain's `d` list for the cards currently in the list. Cards are matched by their
     * `data-status` only insofar as the LINK colour cares; the geometry needs nothing but their order
     * and their boxes, which is why grouped runs and folded rows work without a special case.
     *
     * Returns {visible, reason, links:[{d, done}]} — one entry per adjacent pair that could be drawn.
     */
    function wfChainGeometry(listRect, cards) {
      var box = wfFxBounds(listRect);
      if (!box) return { visible: false, reason: "no-origin", links: [] };
      var rows = Array.isArray(cards) ? cards : [];
      if (rows.length < 2) return { visible: false, reason: "too-few", links: [] };

      var links = [];
      var pairs = 0;
      for (var i = 0; i + 1 < rows.length; i += 1) {
        var pair = rows[i];
        var next = rows[i + 1];
        if (!pair || !next) continue;
        pairs += 1;
        var curve = wfChainCurve(box, pair.rect, next.rect);
        if (!curve.visible) continue;
        links.push({ d: curve.d, from: curve.from, to: curve.to, done: pair.done === true && next.done === true });
      }
      if (links.length === 0) return { visible: false, reason: "too-close", links: [] };
      return { visible: true, reason: "ok", links: links, pairs: pairs };
    }

    /**
     * The card boxes the chain links, in list order. A group row (`li.wf-group`) and a node row
     * (`li.wf-flow-item`) are both links in the SAME chain — the spine runs through both, so the
     * measurement must not skip a folded run. `done` comes off the row's own status attribute.
     *
     * Returns null when there is no list at all (a planning card, an empty step).
     */
    function wfChainCards(doc, list) {
      if (!list || typeof list.querySelectorAll !== "function") return null;
      var rows = list.querySelectorAll(":scope > .wf-flow-item, :scope > .wf-group");
      var out = [];
      for (var i = 0; i < (rows ? rows.length : 0); i += 1) {
        var row = rows[i];
        if (!row) continue;
        // The CONNECTOR is drawn between the CARDS, not between the list rows: a node row's card is
        // its direct <button>, a group's card is the dashed head. Falling back to the row keeps the
        // link honest for any future row shape instead of silently dropping it.
        var card = null;
        if (typeof row.querySelector === "function") card = row.querySelector(":scope > .wf-node, :scope > .wf-group-row > .wf-group-head");
        if (!card) card = row;
        var status = typeof row.getAttribute === "function" ? row.getAttribute("data-status") : null;
        out.push({ rect: wfFxRectOf(card), done: status === "done", status: status });
      }
      return out;
    }

    /**
     * Measure and write the chain layer. Returns the geometry it wrote (the self-test and the browser
     * probe both read it); writes `data-visible` / `data-reason` / `data-links` onto the SVG so the
     * numbers are evidence in the DOM rather than a claim in a log.
     *
     * A missing layer or a missing list is NOT an error: the panel renders the theme's static spine
     * when this returns null, which is exactly the degraded case the stylesheet documents.
     */
    function wfChainApply(doc) {
      if (!doc || typeof doc.querySelector !== "function") return null;
      var list = doc.querySelector(".wf-flow-list");
      var layer = list && typeof list.querySelector === "function" ? list.querySelector('[data-dsh-workflow-map="chain"]') : null;
      if (!layer) return null;
      var cards = wfChainCards(doc, list);
      var origin = wfFxRectOf(list);
      var geo = wfChainGeometry(origin, cards || []);
      var paths = typeof layer.querySelectorAll === "function" ? layer.querySelectorAll(".wf-chain-core") : null;
      var count = paths ? paths.length : 0;

      if (!geo.visible) {
        for (var i = 0; i < count; i += 1) {
          if (paths[i] && typeof paths[i].setAttribute === "function") paths[i].setAttribute("d", "");
        }
        layer.setAttribute("data-visible", "false");
        layer.setAttribute("data-reason", geo.reason);
        layer.setAttribute("data-links", "0");
        return geo;
      }

      // The layer is rendered with a FIXED number of paths (WF_CHAIN_LINK_SLOTS): an SVG child list
      // cannot be resized from here, so extra paths are blanked and missing ones reported honestly
      // rather than quietly drawing fewer links than there are cards.
      var drawn = 0;
      for (var p = 0; p < count; p += 1) {
        var link = geo.links[p];
        if (!paths[p] || typeof paths[p].setAttribute !== "function") continue;
        paths[p].setAttribute("d", link ? link.d : "");
        if (link) {
          drawn += 1;
          paths[p].setAttribute("data-done", link.done ? "true" : "false");
        }
      }
      layer.setAttribute("data-visible", drawn > 0 ? "true" : "false");
      layer.setAttribute("data-reason", drawn === geo.links.length ? "ok" : "slot-shortfall");
      layer.setAttribute("data-links", String(drawn));
      layer.setAttribute("data-endpoints", JSON.stringify(geo.links.map(function (one) {
        return { from: one.from, to: one.to, d: one.d };
      })));
      return geo;
    }

    function wfFxSetCaps(caps, from, to) {
      if (!caps || typeof caps.length !== "number") return;
      if (caps[0] && typeof caps[0].setAttribute === "function") {
        caps[0].setAttribute("cx", String(from ? from.x : WF_FX_OFFSCREEN));
        caps[0].setAttribute("cy", String(from ? from.y : WF_FX_OFFSCREEN));
      }
      if (caps[1] && typeof caps[1].setAttribute === "function") {
        caps[1].setAttribute("cx", String(to ? to.x : WF_FX_OFFSCREEN));
        caps[1].setAttribute("cy", String(to ? to.y : WF_FX_OFFSCREEN));
      }
    }

    /**
     * Measure once and write the result into the DOM. Returns the geometry (read by the tool and the self-test).
     * Three things written into the DOM: the path's `d`, the two endpoint circles' cx/cy, and `data-visible` /
     * `data-endpoints` (JSON, so a headless self-check takes evidence directly instead of guessing).
     */
    function wfFxApply(doc) {
      var found = wfFxQuery(doc);
      if (!found || !found.svg) return { visible: false, reason: "no-layer", d: null };
      var svg = found.svg;
      var geo = wfFxGeometry(
        wfFxRectOf(found.stepCard),
        wfFxRectOf(found.nodeCard),
        wfFxRectOf(svg),
        wfFxRectOf(found.stepClip),
        wfFxRectOf(found.nodeClip)
      );

      var core = typeof svg.querySelector === "function" ? svg.querySelector(".wf-fx-core") : null;
      var glow = typeof svg.querySelector === "function" ? svg.querySelector(".wf-fx-glow") : null;
      var caps = typeof svg.querySelectorAll === "function" ? svg.querySelectorAll(".wf-fx-cap") : null;

      if (!geo.visible) {
        if (core) core.setAttribute("d", "");
        if (glow) glow.setAttribute("d", "");
        wfFxSetCaps(caps, null, null);
        svg.setAttribute("data-visible", "false");
        svg.setAttribute("data-reason", geo.reason);
        svg.setAttribute("data-endpoints", JSON.stringify({ visible: false, reason: geo.reason }));
        return geo;
      }

      if (core) core.setAttribute("d", geo.d);
      if (glow) glow.setAttribute("d", geo.d);
      wfFxSetCaps(caps, geo.from, geo.to);
      svg.setAttribute("data-visible", "true");
      svg.setAttribute("data-reason", "ok");
      svg.setAttribute(
        "data-endpoints",
        JSON.stringify({ visible: true, from: geo.from, to: geo.to, dx: geo.dx, d: geo.d })
      );
      return geo;
    }

    /**
     * Bind measurement to the page lifecycle: window resize, any scroll (capture, so both columns' inner scrolling is seen),
     * and container size changes (ResizeObserver). Everything goes through a rAF throttle, at most one computation per frame.
     *
     * Returns { refresh, schedule, destroy, measures }: `refresh` measures synchronously, `measures` reports
     * how many measurements happened (the headless check uses it to prove recomputation after scroll/resize, not just the first frame).
     */
    function wfFxBind(doc, win) {
      if (!doc || !win) return null;
      var state = { destroyed: false, frame: 0, measures: 0 };
      var observed = null;
      var raf =
        typeof win.requestAnimationFrame === "function"
          ? function (fn) {
              return win.requestAnimationFrame(fn);
            }
          : function (fn) {
              if (typeof win.setTimeout !== "function") return 0;
              return win.setTimeout(fn, 16);
            };
      var cancel =
        typeof win.cancelAnimationFrame === "function"
          ? function (id) {
              win.cancelAnimationFrame(id);
            }
          : function (id) {
              if (typeof win.clearTimeout === "function") win.clearTimeout(id);
            };
      // The safety net for environments where rAF never runs (headless --dump-dom, a throttled
      // background tab). Absent timers are simply no fallback, not an error.
      var timerSet =
        typeof win.setTimeout === "function"
          ? function (fn, ms) {
              return win.setTimeout(fn, ms);
            }
          : null;
      var timerClear =
        typeof win.clearTimeout === "function"
          ? function (id) {
              win.clearTimeout(id);
            }
          : null;

      function stamp(count) {
        var body = doc.querySelector('[data-dsh-workflow-map="body"]');
        var svg = body && body.querySelector ? body.querySelector('[data-dsh-workflow-map="fx"]') : null;
        if (svg && typeof svg.setAttribute === "function") svg.setAttribute("data-measures", String(count));
        return svg;
      }

      function refresh() {
        if (state.destroyed) return null;
        var geo = wfFxApply(doc);
        // step-05: the chain's node-to-node links live in the flow list and are measured from the SAME
        // frame — one schedule() drives both layers, so a scroll cannot leave one of them stale.
        wfChainApply(doc);
        state.measures += 1;
        stamp(state.measures);
        return geo;
      }

      // One pending measure per schedule(), whichever clock wins first.
      // rAF is the normal path (it lands with the frame), but it is NOT reliable everywhere: a
      // headless --dump-dom page, a background tab or a throttled frame never fires it, and then
      // the curve would silently stop following the cards. A short timer is the safety net; the
      // token makes the first one win and the second a no-op.
      function schedule() {
        if (state.destroyed || state.frame) return;
        var token = { ran: false, handle: 0, timer: 0 };
        state.frame = token;
        function run(source) {
          if (state.destroyed || token.ran) return;
          token.ran = true;
          if (state.frame === token) state.frame = 0;
          if (token.timer && timerClear) timerClear(token.timer);
          token.timer = 0;
          // The rAF handle stays cancellable but its callback is a no-op after the token ran.
          token.handle = source === "timer" ? token.handle : 0;
          refresh();
        }
        token.handle = raf(function () {
          run("raf");
        });
        if (timerSet) token.timer = timerSet(function () {
          run("timer");
        }, WF_FX_FALLBACK_MS);
      }

      function onScroll() {
        schedule();
      }

      // capture=true: each column is its own overflow:auto scroller, so scroll does not bubble to window.
      doc.addEventListener("scroll", onScroll, true);
      win.addEventListener("resize", onScroll);

      if (typeof win.ResizeObserver === "function") {
        try {
          observed = new win.ResizeObserver(onScroll);
          var found = wfFxQuery(doc);
          if (found) {
            if (found.body) observed.observe(found.body);
            if (found.stepClip) observed.observe(found.stepClip);
            if (found.nodeClip) observed.observe(found.nodeClip);
            if (found.stepCard) observed.observe(found.stepCard);
            if (found.nodeCard) observed.observe(found.nodeCard);
          }
        } catch (error) {
          observed = null;
        }
      }
      refresh();


      return {
        refresh: refresh,
        schedule: schedule,
        measures: function () {
          return state.measures;
        },
        destroy: function () {
          state.destroyed = true;
          var pending = state.frame;
          if (pending && typeof pending === "object") {
            // A queued frame may be on the rAF clock, on the fallback timer, or on both.
            if (pending.handle) cancel(pending.handle);
            if (pending.timer && timerClear) timerClear(pending.timer);
          }
          state.frame = 0;
          doc.removeEventListener("scroll", onScroll, true);
          win.removeEventListener("resize", onScroll);
          if (observed && typeof observed.disconnect === "function") observed.disconnect();
          observed = null;
        },
      };
    }

    /** Visual signature: rebind only when something that matters changed (an unchanged polled model does not jitter every 800 ms). */
    function wfFxSignature(model) {
      if (!model) return "none";
      var flow = model.flow && typeof model.flow === "object" ? model.flow : {};
      var nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
      var runningStep = null;
      for (var i = 0; i < model.steps.length; i += 1) {
        if (model.steps[i] && model.steps[i].status === "running") {
          runningStep = model.steps[i].index;
          break;
        }
      }
      var ids = [];
      for (var k = Math.max(0, nodes.length - 8); k < nodes.length; k += 1) ids.push(nodes[k] ? nodes[k].id : "-");
      return [
        model.kind,
        model.selected,
        runningStep,
        flow.activeNodeId || "",
        nodes.length,
        ids.join(","),
        model.steps.length,
        model.running === false ? "idle" : "live",
      ].join("|");
    }

    /** The component mount point: signature change -> rebind; unmount -> remove everything (no listeners left behind). */
    function wfUseFlowEffects(model) {
      var signature = wfFxSignature(model);
      React.useEffect(
        function () {
          if (typeof document === "undefined" || typeof window === "undefined") return undefined;
          var binding = wfFxBind(document, window);
          if (!binding) return undefined;
          return function () {
            binding.destroy();
          };
        },
        [signature]
      );
    }

    /* ------------------------------------------------------------------------- */
    /* markup                                                                    */
    /* ------------------------------------------------------------------------- */

    /**
     * The curve layer itself. Lives in .wf-body (after the two columns, absolutely positioned over the whole body);
     * before measuring it carries data-visible="false" (display:none in CSS) and appears only once measured.
     *
     * Stop colours come from CSS classes (stop-color is a CSS property in Chrome):
     * both React and the self-test's fake `h` pass it through unchanged, with no extra attribute mapping.
     */
    function wfRenderFlowEffects(h) {
      var rainbow = [];
      var colors = WF_FX_RAINBOW;
      for (var i = 0; i < colors.length; i += 1) {
        rainbow.push(
          h("stop", {
            key: "r" + i,
            offset: Math.round((i / (colors.length - 1)) * 100) + "%",
            className: "wf-fx-stop wf-fx-stop-" + (i + 1),
          })
        );
      }
      var brand = [];
      for (var b = 0; b < WF_FX_BRAND.length; b += 1) {
        brand.push(
          h("stop", {
            key: "b" + b,
            offset: Math.round((b / (WF_FX_BRAND.length - 1)) * 100) + "%",
            className: "wf-fx-stop wf-fx-stop-b" + (b + 1),
          })
        );
      }

      return h(
        "svg",
        {
          className: "wf-fx",
          key: "fx",
          "data-dsh-workflow-map": "fx",
          "data-visible": "false",
          "data-curve": WF_CURVE_MODE,
          "aria-hidden": "true",
          focusable: "false",
        },
        h(
          "defs",
          { key: "defs" },
          h("linearGradient", { key: "rainbow", id: "wf-fx-rainbow" }, rainbow),
          h("linearGradient", { key: "brand", id: "wf-fx-brand" }, brand)
        ),
        h("path", { key: "glow", className: "wf-fx-glow", d: "" }),
        h("path", { key: "core", className: "wf-fx-core", d: "" }),
        h("circle", { key: "cap-a", className: "wf-fx-cap", cx: WF_FX_OFFSCREEN, cy: WF_FX_OFFSCREEN, r: 3.4 }),
        h("circle", { key: "cap-b", className: "wf-fx-cap", cx: WF_FX_OFFSCREEN, cy: WF_FX_OFFSCREEN, r: 3.4 })
      );
    }

    /**
     * step-05 · the chain layer: one <svg> INSIDE the flow list, and one <path> per link slot.
     *
     * WHY ONE LAYER AND NOT ONE SVG PER GAP: the gaps are already reserved by the list's `gap`, and a
     * layer per gap would need a box per gap — which drifts the moment the fold expands. One layer
     * covering the whole list is measured in one rect and draws every link from the same origin.
     *
     * The slots are fixed (WF_CHAIN_LINK_SLOTS) because the measuring code can only write into paths
     * that exist. Unused slots stay empty (`d=""`), which paints nothing at all.
     */
    function wfRenderChain(h) {
      var paths = [];
      for (var i = 0; i < WF_CHAIN_LINK_SLOTS; i += 1) {
        paths.push(h("path", { key: "l" + i, className: "wf-chain-core", d: "" }));
      }
      return h(
        "svg",
        {
          className: "wf-chain",
          key: "chain",
          "data-dsh-workflow-map": "chain",
          "data-visible": "false",
          "data-reason": "unmeasured",
          "data-links": "0",
          "aria-hidden": "true",
          focusable: "false",
        },
        paths
      );
    }

    // ===== src/client/MainFlow.js =====
    /**
     * MainFlow.js — the single page: ONE serial main flow, satellites on both sides.
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
     * store.js wfTypeBuckets pure derivation of the buckets from raw host nodes (ONE place)
     * this file only draws what the buckets already say
     * RightPage.js the same buckets, with their calls, for the opened page
     *
     * Pure: `h` and `say` are injected, no React import, no DOM. tools/selftest-panel.mjs drives the
     * exact tree the frame mounts.
     *
     * Inlined into client.js by tools/build-client.mjs (single-file browser half).
     */

    /* ------------------------------------------------------------------------- */
    /* geometry helpers */
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
    /* rendering */
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
    // NEEDS-CONFIRM - the union of the plan's own flag and the waiting-on-human state
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
     // selected the step the panel remembers (the last one opened) — the chain's highlight
     // open the step whose page is on the right right now — the card's aria-pressed
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
     // "needs confirm" used to live in StepColumn's meta row; the unit keeps it (and the badge order
     // the self-test asserts) so the flag is not lost with that file.
     // "needs confirm" is now the UNION of two sources, both derived:
     // · the plan's own `requiresConfirmation` (the step was marked as a confirm point),
     // · the step being WAITING on a human right now — the host folds an open approval
     // or an unanswered question into `row.pendingConfirm`.
     // The flag names WHY when the row carries a reason, so the user can tell "this step was
     // marked" versus "this step is asking you something right now".
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
     // "needs confirm" on the row itself, so the card's left edge and the ring can be styled
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
     // "Title only" still means ONE line under the card: the rail keeps its number and drops
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
     // Only the one connector that points directly at the single running step carries the flowing gradient.
     // row.live is derived by the store from the host's runningIndex, so at most one row qualifies.
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

    // ===== src/client/RightPage.js =====
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

    // ===== src/client/HotInject.js =====
    /**
     * HotInject.js — the right-hand column that hot-injects a prompt.
     * adds its undo: the "revoke" button on a history row (`POST /dsh-workflow/unsteer`).
     *
     * WHY THIS FILE EXISTS. The panel's other chunks are pure renderers of data the host already
     * folded. This one owns the plugin's TWO writes: a `POST /dsh-workflow/steer` that puts one
     * `user/message` into the running session's next-step inbox, and a `POST /dsh-workflow/unsteer`
     * that takes that same message back out while it is still unclaimed. Everything that can be
     * decided without the DOM — what may be sent, what the four states look like, what the host's
     * answer means — lives here so tools/selftest-panel.mjs can drive it in Node.
     *
     * THE SEND STATE MACHINE (four states, one source of truth):
     *
     * idle ──send──▶ sending ──{ok:true}──▶ sent ──1.5 s──▶ idle
     * │ ▲
     * └──{ok:false}──▶ failed ──1.5 s──▶ idle
     *
     * `sent` and `failed` are ACKNOWLEDGEMENTS, not resting states: they clear themselves after
     * WF_INJECT_ACK_MS so the panel never sits on a stale "injected" state. The textarea is never cleared
     * by the machine — only the user's own cancel does that — so a failed send keeps what was typed.
     *
     * THE REVOKE STATE MACHINE (a second, separate one — one revocation at a time):
     *
     * idle ──click──▶ revoking ──{ok:true}──▶ revoked ──(the folded row stops being pending)──▶ gone
     * │
     * └──{ok:false}──▶ failed (the host's own reason, under that row)
     *
     * `revoked` is deliberately NOT optimistic: the host's 200 means the message left the inbox, and
     * the row turns "revoked" on the next poll, from the host's own durable
     * `agent/inbox/spliced { outcome: 'canceled' }`. Until then the button reads "revoking..." and is disabled,
     * which is what stops a second click from becoming a second post.
     *
     * HONESTY RULES (each one has an assertion):
     * 1. Sending is refused while `state === "sending"` — no double post, ever.
     * 2. Empty text is refused before any request leaves (the host would answer 400 anyway, but a
     * round trip for something the browser already knows is not honest either).
     * 3. A success is claimed ONLY on `{ok:true}` from the host. On anything else the panel shows
     * the host's OWN reason verbatim - never an invented "injection failed".
     * 4. A 409 carries the host's text ("session is not running, hot injection unavailable"), and it is rendered as a
     * failure with that text, not silently swallowed.
     * 5. `sessionId` is required: without one there is no session to address, so the button is
     * disabled rather than posting something the host will reject.
     *
     * Pure: `h` and `say` are injected. Inlined into client.js by tools/build-client.mjs.
     */

    /** The text bound, mirroring the host's STEER_TEXT_LIMIT (src/route.js). */
    var WF_INJECT_LIMIT = 2000;

    /** How long "injected" / a failure line stays on screen (the copy receipt's rhythm). */
    var WF_INJECT_ACK_MS = 1500;

    /** The four states. Anything else is treated as idle: a corrupted record cannot wedge the UI. */
    var WF_INJECT_STATES = ["idle", "sending", "sent", "failed"];

    function wfInjectState(value) {
      for (var i = 0; i < WF_INJECT_STATES.length; i += 1) {
        if (value === WF_INJECT_STATES[i]) return value;
      }
      return "idle";
    }

    /**
     * Whether a send is allowed right now. The ONE gate the button and the submit share, so the
     * disabled attribute and the click handler can never disagree.
     */
    function wfInjectCanSend(state, sessionId, text) {
      if (wfInjectState(state) !== "idle") return false;
      if (typeof sessionId !== "string" || sessionId === "") return false;
      if (typeof text !== "string" || text.trim() === "") return false;
      return text.length <= WF_INJECT_LIMIT;
    }

    /** Trimmed, bounded text — what would actually be sent. "" when nothing may be. */
    function wfInjectText(value) {
      if (typeof value !== "string") return "";
      var trimmed = value.replace(/^\s+|\s+$/g, "");
      return trimmed.length > WF_INJECT_LIMIT ? trimmed.slice(0, WF_INJECT_LIMIT) : trimmed;
    }

    /**
     * Turn the host's answer into the UI's outcome. `{ok:true}` → sent; anything else → failed with
     * the host's own reason. A missing reason is replaced here (the UI must not print "undefined"),
     * but a PRESENT one is passed through verbatim — that is rule 3.
     */
    function wfInjectOutcome(response, say) {
      var fire = typeof say === "function" ? say : function (key) {
        return key;
      };
      if (response && response.ok === true) {
        return { kind: "sent", text: fire("panel.inject.sent"), detail: "" };
      }
      var reason =
        response && typeof response.error === "string" && response.error !== ""
          ? response.error
          : fire("panel.inject.unknown");
      return { kind: "failed", text: reason, detail: "" };
    }

    /**
     * The state after one acknowledged outcome: `sent`/`failed` clear back to idle, everything else
     * is already idle. Pure, so the timer's only job is to call it.
     */
    function wfInjectAckDone(state) {
      var current = wfInjectState(state);
      return current === "sent" || current === "failed" ? "idle" : current;
    }

    /* ------------------------------------------------------------------------- */
    /* the revoke state machine */
    /* ------------------------------------------------------------------------- */

    /**
     * The four states of ONE revocation. `idle` = nothing in flight, `revoking` = the POST is out,
     * `revoked` = the host said 200 and the row is waiting for the next poll to say "revoked",
     * `failed` = the host refused and its own reason is on screen. `revoked` does NOT disappear by
     * itself: it disappears when the folded row stops being `pending`, which is the host's own
     * durable proof that the message really left the inbox.
     */
    var WF_REVOKE_STATES = ["idle", "revoking", "revoked", "failed"];

    function wfRevokeState(value) {
      for (var i = 0; i < WF_REVOKE_STATES.length; i += 1) {
        if (value === WF_REVOKE_STATES[i]) return value;
      }
      return "idle";
    }

    /**
     * Turn the host's answer to `/unsteer` into the UI's outcome. The SAME honesty rule as the send:
     * only `{ok:true}` is a revocation, and every failure prints the host's own reason verbatim — the
     * one text this function may supply is the "the host gave no reason" fallback.
     */
    function wfRevokeOutcome(response, say) {
      var fire = typeof say === "function" ? say : function (key) {
        return key;
      };
      if (response && response.ok === true) {
        return { kind: "revoked", text: "" };
      }
      var reason =
        response && typeof response.error === "string" && response.error !== ""
          ? response.error
          : fire("panel.inject.revoke.failed");
      return { kind: "failed", text: reason };
    }

    /** The receipt line: how many characters are left before the host would refuse. */
    function wfInjectCounter(text, say) {
      var fire = typeof say === "function" ? say : function (key) {
        return key;
      };
      var used = typeof text === "string" ? text.length : 0;
      var left = WF_INJECT_LIMIT - used;
      if (left < 0) left = 0;
      return fire("panel.inject.counter", { used: used, left: left, max: WF_INJECT_LIMIT });
    }

    /** how many rows still wait for the turn — the header badge's only input. */
    function wfPendingInjectCount(rows) {
      if (!Array.isArray(rows)) return 0;
      var n = 0;
      for (var i = 0; i < rows.length; i += 1) {
        if (rows[i] && rows[i].status === "pending") n += 1;
      }
      return n;
    }

    /** One mapping for the three status words, shared by the history rows and the persistent dock. */
    function wfInjectStatusKey(status) {
      return status === "picked"
        ? "panel.inject.row.picked"
        : status === "canceled"
          ? "panel.inject.row.canceled"
          : "panel.inject.row.pending";
    }

    /* ------------------------------------------------------------------------- */
    /* the request */
    /* ------------------------------------------------------------------------- */

    /**
     * One `POST /dsh-workflow/steer`. Never throws: every outcome is a value, so the caller's
     * `.then` can always decide what to paint.
     *
     * @param {Function} fetchImpl - `window.fetch` (injected so Node can drive this)
     * @param {string} url
     * @param {string} sessionId
     * @param {string} text
     * @returns {Promise<{status:number, payload:object|null, error:string}>}
     */
    function wfPostSteer(fetchImpl, url, sessionId, text, signal) {
      return wfPostJson(fetchImpl, url, { sessionId: sessionId, text: text }, signal);
    }

    /**
     * One `POST /dsh-workflow/unsteer` — the SAME transport, one different body field.
     *
     * This is the round trip the history row's "revoke" button makes. It answers 200 only when the
     * message was still in the inbox; 409 means the running turn already took it (or it never was
     * there), and that reason is printed verbatim in the row.
     *
     * @param {Function} fetchImpl - `window.fetch`
     * @param {string} url
     * @param {string} sessionId
     * @param {string} messageId - the id the host returned from `/steer`
     * @returns {Promise<{status:number, payload:object|null, error:string}>}
     */
    function wfPostUnsteer(fetchImpl, url, sessionId, messageId) {
      return wfPostJson(fetchImpl, url, { sessionId: sessionId, messageId: messageId });
    }

    /** The one POST implementation both writes share: body in, `{status, payload, error}` out. */
    function wfPostJson(fetchImpl, url, payload, signal) {
      var body = JSON.stringify(payload);
      return Promise.resolve()
        .then(function () {
          if (typeof fetchImpl !== "function") throw new Error("fetch unavailable");
      // Cancellable before send: while the request is in flight the user can press cancel and the fetch aborts immediately.
      // This only stops requests that are STILL IN FLIGHT; once the host has returned 200 (the message is in the inbox),
      // pulling it back relies on `POST /dsh-workflow/unsteer` (host inbox revoke) instead of aborting the request.
          return fetchImpl(url, {
            method: "POST",
            cache: "no-store",
            headers: { "content-type": "application/json" },
            body: body,
            signal: signal,
          });
        })
        .then(function (response) {
          var status = response && wfFinite(response.status) !== null ? response.status : 0;
          if (!response || response.ok !== true) {
     // The host answers JSON on every failure branch, so read it: its `error` is the reason
     // the panel must print verbatim (rule 3).
            return Promise.resolve()
              .then(function () {
                return response && typeof response.json === "function" ? response.json() : null;
              })
              .catch(function () {
                return null;
              })
              .then(function (payload) {
                var reason =
                  payload && typeof payload.error === "string" && payload.error !== ""
                    ? payload.error
                    : status === 0
                      ? "network error"
                      : "HTTP " + status;
                return { status: status, payload: payload, error: reason };
              });
          }
          return Promise.resolve()
            .then(function () {
              return typeof response.json === "function" ? response.json() : null;
            })
            .catch(function () {
              return null;
            })
            .then(function (payload) {
              if (!payload || payload.ok !== true) {
                return {
                  status: status,
                  payload: payload,
                  error: payload && payload.error ? payload.error : "bad payload",
                };
              }
              return { status: 200, payload: payload, error: "" };
            });
        })
        .catch(function (error) {
          return { status: 0, payload: null, error: (error && error.message) || String(error) };
        });
    }

    /* ------------------------------------------------------------------------- */
    /* the renderer */
    /* ------------------------------------------------------------------------- */

    /**
     * The right-hand column. `extras` carries
     * {sessionId, state, text, reason, history, revokeId, revokeState, revokeReason}.
     *
     * Nothing here is mounted when the panel is collapsed: the caller decides.
     */
    function wfRenderHotInject(h, say, actions, extras) {
      var fire = actions || {};
      var ui = extras || {};
      var sessionId = typeof ui.sessionId === "string" ? ui.sessionId : "";
      var state = wfInjectState(ui.state);
      var text = typeof ui.text === "string" ? ui.text : "";
      var reason = typeof ui.reason === "string" ? ui.reason : "";
     // the ONE revocation currently on screen. `revokeId` names the history row it
     // belongs to, so a failure line lands under ITS row and never under a neighbour's.
      var revokeId = typeof ui.revokeId === "string" ? ui.revokeId : "";
      var revokeState = wfRevokeState(ui.revokeState);
      var revokeReason = typeof ui.revokeReason === "string" ? ui.revokeReason : "";
      var sending = state === "sending";
      var canSend = wfInjectCanSend(state, sessionId, text);

      var note =
        state === "sent"
          ? say("panel.inject.sent")
          : state === "failed"
            ? reason === ""
              ? say("panel.inject.unknown")
              : reason
            : "";

     // the HISTORY rows (newest last in the model, drawn newest first so the latest send is
     // the one the user sees without scrolling). Purely derived from the fold: nothing here talks
     // to the host, and an empty list renders the honest "none yet" line instead of a blank block.
      var history = [];
      if (Array.isArray(ui.history)) history = ui.history.slice().reverse();

      return h(
        "div",
        {
          className: "wf-inject",
          key: "inject",
          "data-dsh-workflow-map": "inject",
          "data-state": state,
        },
        h(
          "div",
          { className: "wf-inject-head", key: "head" },
          h("span", { className: "wf-inject-title", key: "title" }, say("panel.inject.title")),
          h(
            "button",
            {
              type: "button",
              key: "close",
              className: "wf-link wf-inject-close",
              "data-inject": "cancel",
              title: say("panel.inject.cancel"),
              "aria-label": say("panel.inject.cancel"),
              onClick: function () {
                wfFire(fire.onInjectCancel);
              },
            },
            say("panel.inject.cancel")
          )
        ),
        h(
          "p",
          { className: "wf-inject-hint", key: "hint" },
          say("panel.inject.hint")
        ),
        h("textarea", {
          key: "area",
          className: "wf-inject-area",
          "data-dsh-workflow-map": "inject-text",
          rows: 6,
          value: text,
          placeholder: say("panel.inject.placeholder"),
          "aria-label": say("panel.inject.title"),
          disabled: sending,
          onChange: function (event) {
            var value = event && event.target ? event.target.value : "";
            wfFire(fire.onInjectText, value);
          },
        }),
        h(
          "div",
          { className: "wf-inject-foot", key: "foot" },
          h("span", { className: "wf-inject-count", key: "count" }, wfInjectCounter(text, say)),
          h(
            "button",
            {
              type: "button",
              key: "send",
              className: "wf-link wf-inject-send",
              "data-inject": "send",
              "data-ready": canSend ? "true" : "false",
              disabled: canSend ? undefined : true,
              title: say("panel.inject.send"),
              onClick: function () {
                wfFire(fire.onInjectSend, wfInjectText(text));
              },
            },
            sending ? say("panel.inject.sending") : say("panel.inject.send")
          ),
      // While sending, show "cancel": abort the in-flight request (fetch signal).
      // After a 200 (message already in the inbox) this button disappears, because it can no longer be pulled back.
          sending
            ? h(
                "button",
                {
                  type: "button",
                  key: "abort",
                  className: "wf-link wf-inject-abort",
                  "data-inject": "abort",
                  title: say("panel.inject.abort"),
                  onClick: function () {
                    wfFire(fire.onInjectAbort);
                  },
                },
                say("panel.inject.abort"),
              )
            : null
        ),
     // The acknowledgement: one line, present only while the state is sent/failed. It carries
     // `aria-live` so a screen reader hears the host's own reason, not just a colour change.
        note === ""
          ? null
          : h(
              "div",
              {
                className: "wf-inject-note",
                key: "note",
                "data-kind": state === "sent" ? "sent" : "failed",
                role: "status",
                "aria-live": "polite",
              },
              note
            ),
     // the history block. It sits UNDER the acknowledgement so the composer's shape does
     // not change; the newest row is first, and each row states the one thing the user asked to
     // know: was this one taken by the running turn, or is it still waiting.
        h(
          "div",
          { className: "wf-inject-history", key: "history", "data-dsh-workflow-map": "inject-history", "data-count": history.length },
          h("div", { className: "wf-inject-history-label", key: "label" }, say("panel.inject.history")),
          history.length === 0
            ? h("div", { className: "wf-inject-history-empty", key: "empty" }, say("panel.inject.history.empty"))
            : h(
                "ul",
                { className: "wf-inject-list", key: "list", role: "list" },
                history.map(function (row) {
      // Three states: picked up / awaiting pickup / revoked. The third comes only from the host's own log event
      // (`agent/inbox/spliced` with `outcome: 'canceled'`, the durable record of a successful revoke).
                  var status = wfInjectStatusKey(row.status);
      // "revoke" exists for exactly one window: a row the turn has NOT
     // claimed yet. A `picked` row cannot be un-read, and a `canceled` row has nothing
     // left to take back, so neither renders the button (not a disabled one — none).
                  var pending = row.status === "pending";
                  var mine = pending && revokeId === row.id;
                  var inFlight = mine && (revokeState === "revoking" || revokeState === "revoked");
                  return h(
                    "li",
                    {
                      className: "wf-inject-row",
                      key: "row-" + row.id,
                      "data-dsh-workflow-map": "inject-row",
                      "data-status": row.status,
                    },
                    h(
                      "span",
                      { className: "wf-inject-row-status", key: "status", "data-status": row.status },
                      say(status)
                    ),
                    h("span", { className: "wf-inject-row-text", key: "text" }, row.text || "—"),
                    h(
                      "span",
                      { className: "wf-inject-row-time", key: "time" },
                      row.status === "picked" && row.pickedUpAt !== null ? wfFormatClock(row.pickedUpAt) : wfFormatClock(row.at)
                    ),
                    pending
                      ? h(
                          "button",
                          {
                            type: "button",
                            key: "revoke",
                            className: "wf-link wf-inject-row-revoke",
                            "data-inject": "revoke",
                            "data-inject-id": row.id,
     // Two clicks must not become two posts: the button is dead from the moment
     // the request leaves until the row stops being `pending`.
                            disabled: inFlight ? true : undefined,
                            title: say("panel.inject.revoke.hint"),
                            "aria-label": say("panel.inject.revoke"),
                            onClick: function () {
                              wfFire(fire.onInjectRevoke, row.id);
                            },
                          },
                          inFlight ? say("panel.inject.revoking") : say("panel.inject.revoke")
                        )
                      : null,
     // The host's own words, verbatim, under the row that failed (rule 3). The stylesheet
     // makes it span the row so it never reads as a fourth column.
                    mine && revokeState === "failed"
                      ? h(
                          "span",
                          {
                            className: "wf-inject-row-error",
                            key: "revoke-error",
                            "data-inject": "revoke-error",
                            role: "status",
                            "aria-live": "polite",
                          },
                          revokeReason === "" ? say("panel.inject.revoke.failed") : revokeReason
                        )
                      : null
                  );
                })
              ),
        ),
      );
    }

    /**
     * the PERSISTENT dock: one row at the right page's foot, rendered for
     * every page kind that is NOT the composer, so a prompt can be typed without opening it first.
     *
     * It shares ONE piece of state with the full composer (`inject.text`): both render the same
     * `ui.text` and both fire the same `onInjectText`, so switching between the two forms never drops
     * a draft. The send gate is the same `wfInjectCanSend`, and the acknowledgement is the host's own
     * words or nothing — the dock never invents a success, and never updates optimistically.
     *
     * `extras` = {sessionId, state, text, reason, history} — the same shape the composer takes.
     */
    function wfRenderInjectDock(h, say, actions, extras) {
      var fire = actions || {};
      var ui = extras || {};
      var sessionId = typeof ui.sessionId === "string" ? ui.sessionId : "";
      var state = wfInjectState(ui.state);
      var text = typeof ui.text === "string" ? ui.text : "";
      var reason = typeof ui.reason === "string" ? ui.reason : "";
      var sending = state === "sending";
      var canSend = wfInjectCanSend(state, sessionId, text);
      var history = Array.isArray(ui.history) ? ui.history : [];
     // The model keeps the newest LAST (wfInjectRows), so the newest row is the last element.
      var latest = history.length > 0 ? history[history.length - 1] : null;

      var note =
        state === "sent"
          ? say("panel.inject.sent")
          : state === "failed"
            ? reason === ""
              ? say("panel.inject.unknown")
              : reason
            : "";

      function send() {
        wfFire(fire.onInjectSend, wfInjectText(text));
      }

      return h(
        "div",
        {
          className: "wf-inject-dock",
          key: "inject-dock",
          "data-dsh-workflow-map": "inject-dock",
          "data-state": state,
        },
        h(
          "div",
          { className: "wf-inject-dock-row", key: "row" },
          h(
            "button",
            {
              type: "button",
              key: "open",
              className: "wf-inject-dock-label",
              "data-inject": "dock-open",
              title: say("panel.inject.open"),
              "aria-label": say("panel.inject.open"),
              onClick: function () {
                wfFire(fire.onToggleInject);
              },
            },
            say("panel.inject.banner")
          ),
          h("input", {
            type: "text",
            key: "text",
            className: "wf-inject-dock-input",
            "data-dsh-workflow-map": "inject-dock-text",
            value: text,
            placeholder: say("panel.inject.placeholder"),
            "aria-label": say("panel.inject.title"),
            disabled: sending,
            onChange: function (event) {
              var value = event && event.target ? event.target.value : "";
              wfFire(fire.onInjectText, value);
            },
     // Enter is the dock's whole point: one line, no reaching for the button. The gate is the
     // SAME wfInjectCanSend the full composer uses, so an empty / over-long / session-less text
     // simply does nothing instead of posting something the host would reject.
            onKeyDown: function (event) {
              if (!event || event.key !== "Enter") return;
              if (typeof event.preventDefault === "function") event.preventDefault();
              if (canSend) send();
            },
          }),
          h(
            "button",
            {
              type: "button",
              key: "send",
              className: "wf-link wf-inject-dock-send",
              "data-inject": "dock-send",
              "data-ready": canSend ? "true" : "false",
              disabled: canSend ? undefined : true,
              title: say("panel.inject.send"),
              onClick: send,
            },
            sending ? say("panel.inject.sending") : say("panel.inject.send")
          ),
          latest
            ? h(
                "span",
                {
                  className: "wf-inject-dock-state",
                  key: "state",
                  "data-status": latest.status,
                  title: say(wfInjectStatusKey(latest.status)),
                },
                say(wfInjectStatusKey(latest.status))
              )
            : null
        ),
     // The acknowledgement, verbatim: the host's own reason on failure, "injected" only on a real
     // {ok:true}. It sits inside the bar, under the row, so a 409 is never silent.
        note === ""
          ? null
          : h(
              "div",
              {
                className: "wf-inject-dock-note",
                key: "note",
                "data-kind": state === "sent" ? "sent" : "failed",
                role: "status",
                "aria-live": "polite",
              },
              note
            )
      );
    }

    // ===== src/client/panel.js =====
    /**
     * panel.js — the React component, its hooks and the pure renderer.
     *
     * Structure:
     * wfMakeSay dictionary lookup with {placeholder} interpolation + fallback
     * wfUseSessionId props.useSessions → the active session id
     * wfUsePrefs localStorage-backed {width, height, collapsed, selectedStep}
     * wfUseSnap the 800 ms / 3 s conditional poll loop
     * wfUseStyle <style id="dsh-workflow-map-css">, removed on unmount
     * wfUseAltW Alt+W toggles collapsed
     * wfUseSessionReset drops a remembered step selection when the session changes
     * WorkflowMapPanel the overlay occupant
     * wfRenderPanel PURE: (model, prefs, say, actions, ui) → element tree | null
     * apply registration
     *
     * `wfRenderPanel` is deliberately hook-free so tools/selftest-panel.mjs can drive it
     * with a fake `createElement` and assert the exact tree the frame will mount.
     *
     * Inlined into client.js by tools/build-client.mjs (single-file browser half).
     */

    /* ------------------------------------------------------------------------- */
    /* locale */
    /* ------------------------------------------------------------------------- */

    // Flat dotted keys (the dsh-context convention). zh/en must carry IDENTICAL key
    // sets; a half-translated dictionary would ship a raw key to the user.
    var DICT_ZH = {
      "panel.aria": "工作流地图：{task}",
      "panel.title": "工作流地图",
      "panel.task.fallback": "当前会话",
      "panel.progress": "{done}/{total} 步 · {percent}%",
      "panel.planning": "规划中…",
      "panel.planning.note": "计划尚未提交，提交后会显示分步。",
      "panel.collapse": "收起",
      "panel.expand": "展开",
      "panel.settings": "设置",
      "panel.steps": "总任务分步",
      "panel.flow": "分步流程",
      "panel.flow.empty": "这一步还没有动作",
      "panel.nodes": "{count} 个节点",
      "panel.step.nodes": "{count} 节点",
      "panel.files": "{count} 文件",
      "panel.node.error": "失败",
      "panel.truncated": "已省略 {count} 个节点",
      "panel.flow.step": "第 {n} 步 · {title}",
      "panel.flow.group": "{count} 个连续 {tool}",
      "panel.flow.range": "{first}–{last}",
      "panel.flow.more": "更早 {count} 个被折叠",
      "panel.flow.showAll": "展开全部",
      "panel.flow.expandGroup": "展开分组",
      "panel.flow.collapseGroup": "收起分组",
     // the round branch icons. The ARIA label says WHAT each circle is (read / edit / the
     // tool being called), because a bare glyph is not a name; the visible label under it is the
     // short form of the same fact.
      "panel.flow.icon.read": "读取",
      "panel.flow.icon.edit": "修改",
      "panel.flow.icon.tool": "工具",
      "panel.flow.branch": "{kind} {count} 处",
      "panel.flow.branch.aria": "{count} 条分支（读取 / 修改 / 调用的工具）",
      "panel.flow.branch.open": "展开{kind}详情",
      "panel.flow.branch.close": "收起{kind}详情",
      "panel.branch": "支线",
      "panel.branch.subagent": "子代理",
      "panel.branch.workflow": "工作流",
      "panel.branch.job": "后台任务",
      "panel.branch.nodes": "{count} 个活动",
      "panel.branch.more": "另有 {count} 条支线",
      "panel.branch.dropped": "较早 {count} 条支线已省略",
      "panel.branch.truncated": "支线内已省略 {count} 个活动",
      "panel.branch.expand": "展开支线",
      "panel.branch.collapse": "收起支线",
      "panel.node.verb.read": "读",
      "panel.node.verb.write": "写",
      "panel.node.verb.edit": "改",
      "panel.node.verb.glob": "列",
      "panel.node.verb.grep": "搜",
      "panel.node.verb.undo": "撤",
      "panel.node.verb.command": "命令",
      "panel.node.verb.skill": "技能",
      "panel.node.verb.subagent": "子代理",
      "panel.node.pending": "无结果记录",
      "panel.status.done": "已完成",
      "panel.status.running": "进行中",
      "panel.status.failed": "失败",
      "panel.status.skipped": "已跳过",
      "panel.status.pending": "待执行",
      "panel.kind.tool": "工具",
      "panel.kind.message": "消息",
      "panel.kind.report": "报告",
      "panel.kind.subagent": "子代理",
      "panel.kind.question": "提问",
      "panel.kind.approval": "审批",
      "panel.kind.other": "其他",
      "panel.percent.estimate": "~{percent}% 估算",
      "panel.percent.self": "{percent}% 自报",
     // Measured basis (todo-list completion ratio), kept strictly distinct from the self-reported value / "estimated".
      "panel.percent.real": "{percent}% 实测",
     // the rail's second line. {duration} is already formatted ("3 minutes"), and the
     // wording says where the number came from — an estimate, not a measurement.
      "panel.percent.ago": "{duration}前估计",
      "panel.percent.unknown": "时间未知",
      "panel.live": "正在",
      "panel.step.confirm": "需确认",
      "panel.step.progress": "{title} 进度",
     // — node detail + step detail. Keep these suffixes LOWERCASE: build-client
     // counts `panel.*` keys to prove zh/en carry the same set, and the pattern is [a-z.]+.
      "panel.detail.aria": "节点详情：{tool}",
      "panel.detail.category.file": "文件",
      "panel.detail.category.command": "命令",
      "panel.detail.category.skill": "技能",
      "panel.detail.category.subagent": "子代理",
      "panel.detail.category.cad": "CAD",
      "panel.detail.category.other": "其他",
      "panel.detail.action.read": "读取",
      "panel.detail.action.edit": "修改",
      "panel.detail.action.write": "写入",
      "panel.detail.action.query": "查询",
      "panel.detail.action.other": "其他",
      "panel.detail.args": "参数",
      "panel.detail.showargs": "查看完整参数",
      "panel.detail.showcommand": "查看完整命令",
      "panel.detail.copy": "复制",
      "panel.detail.copyargs": "复制参数",
      "panel.detail.copypath": "复制路径",
      "panel.detail.copied": "已复制",
      "panel.detail.copyfailed": "复制失败",
      "panel.detail.files": "文件",
      "panel.detail.nofiles": "未涉及文件",
      "panel.detail.result": "结果",
      "panel.detail.error": "错误",
      "panel.detail.noerror": "无错误文本",
      "panel.detail.noresult": "无结果记录",
      "panel.detail.noargs": "无参数记录",
      "panel.detail.started": "开始",
      "panel.detail.ended": "结束",
      "panel.detail.duration": "耗时",
      "panel.detail.argscap": "参数按宿主上限截断为 200 字",
      "panel.detail.errorcap": "错误文本为宿主记录的首行（上限 200 字）",
      "panel.detail.unknowntool": "未知工具",
      "panel.step.head": "第 {n} 步 · {tools} 工具 · {files} 文件",
      "panel.step.detailtitle": "第 {n} 步详情",
      "panel.step.expand": "展开这一步详情",
      "panel.step.collapse": "收起这一步详情",
      "panel.step.detailopen": "展开分步详情",
      "panel.step.detailclose": "收起分步详情",
      "panel.step.detailaria": "第 {n} 步详情",
      "panel.step.report": "报告",
      "panel.step.noreport": "这一步还没交报告",
      "panel.step.nosummary": "报告没有摘要",
      "panel.step.artifacts": "产物",
      "panel.step.noartifacts": "未列产物",
      "panel.step.exit": "退出码",
      "panel.step.tools": "{count} 工具",
      "panel.step.files": "{count} 文件",
      "panel.step.nodescount": "{count} 节点",
      "panel.step.truncatedcount": "另有 {count} 个节点宿主未发送",
      "panel.step.unknowntime": "无时间记录",
      "panel.settings.endpoint": "数据源",
      "panel.settings.counts": "{steps} 步 / {nodes} 节点",
      "panel.settings.rev": "版本 {rev}",
      "panel.settings.reset": "恢复默认",
      "panel.settings.reset.hint": "恢复配色、动效、详情深度与节点上限",
      "panel.settings.palette": "配色",
      "panel.settings.palette.rainbow": "彩虹",
      "panel.settings.palette.brand": "品牌",
      "panel.settings.palette.soft": "柔和",
      "panel.settings.motion": "动效",
      "panel.settings.motion.full": "运行中",
      "panel.settings.motion.always": "始终",
      "panel.settings.motion.static": "关闭",
      "panel.settings.detail": "详情",
      "panel.settings.detail.summary": "摘要",
      "panel.settings.detail.title": "只看标题",
      "panel.settings.limit": "节点上限",
      "panel.settings.limit.all": "全部",
      "panel.settings.export": "工作流快照",
      "panel.settings.export.markdown": "复制 Markdown",
      "panel.settings.export.json": "复制 JSON",
      "panel.settings.export.downloadmarkdown": "下载 .md",
      "panel.settings.export.downloadjson": "下载 .json",
      "panel.stale": "离线（显示上次数据）",
     // the inject column. `sent` is the ONLY success word — a failure prints
     // the HOST's own reason, so no failure string of ours is ever shown instead of it.
     // the single page and its right-hand page.
      "panel.page.main": "主流程",
      "panel.page.step": "第 {n} 步详情",
      "panel.page.types": "这一步用到的工具文件",
      "panel.page.noTypes": "这一步没有文件或工具调用记录",
      "panel.page.typeStep": "第 {n} 步 · {label}",
      "panel.page.typeSession": "全会话 · {label}",
      "panel.page.typeSub": "范围：{step}，共 {count} 处调用",
      "panel.page.wholeSession": "全会话",
      "panel.page.typeEmpty": "这一类还没有可列出的调用",
      "panel.page.truncated": "另有 {count} 处调用未随视图发送",
      "panel.page.count": "{count} 处",
      "panel.page.kind.file": "文件类型",
      "panel.page.kind.tool": "调用工具",
      "panel.page.sat.label": "{label}（{kind}）{count} 处，点击查看这一类调用",
      "panel.page.moreTypes": "另有 {count} 类未画在两侧",
      "panel.page.close": "关闭这一页",
      "panel.page.noReport": "这一步的详情还没有随视图发送",
      "panel.page.inject": "热注入",
      "panel.inject.banner": "⚡ 热注入",
     // the badge on the header button. {count} is the number of rows
     // the SESSION has not taken yet — never a number this side invents.
      "panel.inject.pending.badge": "{count} 条待会话拾取",
      "panel.inject.open": "热注入提示词",
      "panel.inject.title": "热注入",
      "panel.inject.hint": "发送后会在当前轮次的下一步进入会话，不打断正在做的事。",
      "panel.inject.placeholder": "补充一句提示词…",
      "panel.inject.send": "发送",
      "panel.inject.sending": "发送中…",
      "panel.inject.cancel": "取消",
      "panel.inject.sent": "已注入",
      "panel.inject.unknown": "注入失败（宿主未给出原因）",
      "panel.inject.counter": "{used}/{max}",
     // the history rows. `picked` and `pending` are the two status words; they are NOT
     // synonyms — the first is measured evidence, the second is "still waiting".
      "panel.inject.history": "热注入历史",
      "panel.inject.history.empty": "还没有热注入记录",
      "panel.inject.row.picked": "会话已接下",
      "panel.inject.row.pending": "待会话拾取",
     // Revoke-related strings. The host now exposes a real inbox revoke API, so the wording states the fact:
     // what the button does = `POST /dsh-workflow/unsteer` -> host `inbox.remove`; only after that does the log's
     // `agent/inbox/spliced { outcome: 'canceled' }` turn the row into "revoked".
      "panel.inject.row.canceled": "已撤销",
      "panel.inject.revoke": "撤回",
      "panel.inject.revoke.hint": "这条还在收件箱里、当前轮次尚未取用，所以可以撤回。撤回后它不会进入会话；一旦被轮次接下，就只能等它执行。",
      "panel.inject.revoking": "撤回中…",
      "panel.inject.revoke.failed": "撤回失败（宿主未给出原因）",
      "capsule.aria": "打开工作流地图面板",
      "capsule.title": "工作流地图",
      "capsule.progress": "{done}/{total} · {percent}%",
      "capsule.hint": "点击展开",
    };

    var DICT_EN = {
      "panel.aria": "Workflow map: {task}",
      "panel.title": "Workflow map",
      "panel.task.fallback": "Current session",
      "panel.progress": "{done}/{total} steps · {percent}%",
      "panel.planning": "Planning…",
      "panel.planning.note": "The plan has not been submitted yet; steps appear after it is.",
      "panel.collapse": "Collapse",
      "panel.expand": "Expand",
      "panel.settings": "Settings",
      "panel.steps": "Task steps",
      "panel.flow": "Step flow",
      "panel.flow.empty": "No actions in this step yet",
      "panel.nodes": "{count} nodes",
      "panel.step.nodes": "{count} nodes",
      "panel.files": "{count} files",
      "panel.node.error": "failed",
      "panel.truncated": "{count} nodes omitted",
      "panel.flow.step": "Step {n} · {title}",
      "panel.flow.group": "{count} consecutive {tool}",
      "panel.flow.range": "{first}–{last}",
      "panel.flow.more": "{count} earlier nodes folded",
      "panel.flow.showAll": "Show all",
      "panel.flow.expandGroup": "Expand group",
      "panel.flow.collapseGroup": "Collapse group",
     // the round branch icons.
      "panel.flow.icon.read": "Read",
      "panel.flow.icon.edit": "Edit",
      "panel.flow.icon.tool": "Tool",
      "panel.flow.branch": "{kind} ×{count}",
      "panel.flow.branch.aria": "{count} branches (read / edit / tool)",
      "panel.flow.branch.open": "Expand {kind} detail",
      "panel.flow.branch.close": "Collapse {kind} detail",
      "panel.branch": "Branches",
      "panel.branch.subagent": "Subagent",
      "panel.branch.workflow": "Workflow",
      "panel.branch.job": "Background job",
      "panel.branch.nodes": "{count} activities",
      "panel.branch.more": "{count} more branches",
      "panel.branch.dropped": "{count} earlier branches omitted",
      "panel.branch.truncated": "{count} activities omitted in this branch",
      "panel.branch.expand": "Expand branch",
      "panel.branch.collapse": "Collapse branch",
      "panel.node.verb.read": "Read",
      "panel.node.verb.write": "Write",
      "panel.node.verb.edit": "Edit",
      "panel.node.verb.glob": "List",
      "panel.node.verb.grep": "Search",
      "panel.node.verb.undo": "Undo",
      "panel.node.verb.command": "Command",
      "panel.node.verb.skill": "Skill",
      "panel.node.verb.subagent": "Subagent",
      "panel.node.pending": "No result recorded",
      "panel.status.done": "Done",
      "panel.status.running": "Running",
      "panel.status.failed": "Failed",
      "panel.status.skipped": "Skipped",
      "panel.status.pending": "Pending",
      "panel.kind.tool": "Tool",
      "panel.kind.message": "Message",
      "panel.kind.report": "Report",
      "panel.kind.subagent": "Subagent",
      "panel.kind.question": "Question",
      "panel.kind.approval": "Approval",
      "panel.kind.other": "Other",
      "panel.percent.estimate": "~{percent}% est.",
      "panel.percent.self": "{percent}% self",
     // measured (todo-table completion ratio), distinct from self/estimate.
      "panel.percent.real": "{percent}% measured",
      "panel.percent.ago": "{duration} ago",
      "panel.percent.unknown": "time unknown",
      "panel.live": "Working",
     // same keys as the zh dictionary — the shape self-test asserts the two
     // key sets are identical.
     // the single page and its right-hand page (same keys as the zh dictionary).
      "panel.page.main": "Main flow",
      "panel.page.step": "Step {n} details",
      "panel.page.types": "Tool files this step used",
      "panel.page.noTypes": "No file or tool call recorded for this step",
      "panel.page.typeStep": "Step {n} · {label}",
      "panel.page.typeSession": "Whole session · {label}",
      "panel.page.typeSub": "Scope: {step} · {count} calls",
      "panel.page.wholeSession": "whole session",
      "panel.page.typeEmpty": "No call of this type to list yet",
      "panel.page.truncated": "{count} more calls were not sent with the view",
      "panel.page.count": "{count} calls",
      "panel.page.kind.file": "file type",
      "panel.page.kind.tool": "tool",
      "panel.page.sat.label": "{label} ({kind}), {count} calls — click to see this type's calls",
      "panel.page.moreTypes": "{count} more types are not drawn on the sides",
      "panel.page.close": "Close this page",
      "panel.page.noReport": "This step's details have not been sent with the view yet",
      "panel.page.inject": "Hot inject",
      "panel.inject.banner": "⚡ Hot inject",
      "panel.inject.pending.badge": "{count} waiting for the turn",
      "panel.inject.open": "Hot-inject a prompt",
      "panel.inject.title": "Hot inject",
      "panel.inject.hint": "Sent text enters the session at the NEXT STEP of the current turn; it does not interrupt the work in progress.",
      "panel.inject.placeholder": "Add a prompt…",
      "panel.inject.send": "Send",
      "panel.inject.sending": "Sending…",
      "panel.inject.cancel": "Cancel",
      "panel.inject.sent": "Injected",
      "panel.inject.unknown": "Injection failed (the host gave no reason)",
      "panel.inject.counter": "{used}/{max}",
      "panel.inject.history": "Hot-inject history",
      "panel.inject.history.empty": "No hot-inject yet",
      "panel.inject.row.picked": "taken by the session",
      "panel.inject.row.pending": "waiting for the turn",
      "panel.inject.row.canceled": "revoked",
      "panel.inject.revoke": "Revoke",
      "panel.inject.revoke.hint": "Still queued and not claimed by the running turn, so it can be taken back. A revoked message never enters the session; once the turn has claimed it, it can only run.",
      "panel.inject.revoking": "Revoking…",
      "panel.inject.revoke.failed": "Revoke failed (the host gave no reason)",
      "panel.step.confirm": "Needs confirm",
      "panel.step.progress": "Progress of {title}",
      "panel.detail.aria": "Node detail: {tool}",
      "panel.detail.category.file": "File",
      "panel.detail.category.command": "Command",
      "panel.detail.category.skill": "Skill",
      "panel.detail.category.subagent": "Subagent",
      "panel.detail.category.cad": "CAD",
      "panel.detail.category.other": "Other",
      "panel.detail.action.read": "Read",
      "panel.detail.action.edit": "Edited",
      "panel.detail.action.write": "Written",
      "panel.detail.action.query": "Searched",
      "panel.detail.action.other": "Other",
      "panel.detail.args": "Arguments",
      "panel.detail.showargs": "Show full arguments",
      "panel.detail.showcommand": "Show full command",
      "panel.detail.copy": "Copy",
      "panel.detail.copyargs": "Copy arguments",
      "panel.detail.copypath": "Copy path",
      "panel.detail.copied": "Copied",
      "panel.detail.copyfailed": "Copy failed",
      "panel.detail.files": "Files",
      "panel.detail.nofiles": "No files touched",
      "panel.detail.result": "Result",
      "panel.detail.error": "Error",
      "panel.detail.noerror": "No error text",
      "panel.detail.noresult": "No result recorded",
      "panel.detail.noargs": "No arguments recorded",
      "panel.detail.started": "Started",
      "panel.detail.ended": "Ended",
      "panel.detail.duration": "Duration",
      "panel.detail.argscap": "Arguments are capped at the host's 200 characters",
      "panel.detail.errorcap": "The host stores the error's first line (200 characters max)",
      "panel.detail.unknowntool": "Unknown tool",
      "panel.step.head": "Step {n} · {tools} tools · {files} files",
      "panel.step.detailtitle": "Step {n} details",
      "panel.step.expand": "Show this step's details",
      "panel.step.collapse": "Hide this step's details",
      "panel.step.detailopen": "Show step details",
      "panel.step.detailclose": "Hide step details",
      "panel.step.detailaria": "Step {n} details",
      "panel.step.report": "Report",
      "panel.step.noreport": "No report for this step yet",
      "panel.step.nosummary": "The report has no summary",
      "panel.step.artifacts": "Artifacts",
      "panel.step.noartifacts": "No artifacts listed",
      "panel.step.exit": "Exit code",
      "panel.step.tools": "{count} tools",
      "panel.step.files": "{count} files",
      "panel.step.nodescount": "{count} nodes",
      "panel.step.truncatedcount": "{count} nodes not sent by the host",
      "panel.step.unknowntime": "No time recorded",
      "panel.settings.endpoint": "Endpoint",
      "panel.settings.counts": "{steps} steps / {nodes} nodes",
      "panel.settings.rev": "rev {rev}",
      "panel.settings.reset": "Restore defaults",
      "panel.settings.reset.hint": "Restore palette, motion, detail depth and node limit",
      "panel.settings.palette": "Palette",
      "panel.settings.palette.rainbow": "Rainbow",
      "panel.settings.palette.brand": "Brand",
      "panel.settings.palette.soft": "Soft",
      "panel.settings.motion": "Motion",
      "panel.settings.motion.full": "While working",
      "panel.settings.motion.always": "Always",
      "panel.settings.motion.static": "Off",
      "panel.settings.detail": "Detail",
      "panel.settings.detail.summary": "Summary",
      "panel.settings.detail.title": "Title only",
      "panel.settings.limit": "Node limit",
      "panel.settings.limit.all": "All",
      "panel.settings.export": "Workflow snapshot",
      "panel.settings.export.markdown": "Copy Markdown",
      "panel.settings.export.json": "Copy JSON",
      "panel.settings.export.downloadmarkdown": "Download .md",
      "panel.settings.export.downloadjson": "Download .json",
      "panel.stale": "Offline (last data shown)",
      "capsule.aria": "Open the workflow map panel",
      "capsule.title": "Workflow map",
      "capsule.progress": "{done}/{total} · {percent}%",
      "capsule.hint": "Click to expand",
    };

    var WF_DICTS = { zh: DICT_ZH, en: DICT_EN };

    /**
     * `props.t` is the framework translator for this slot's locale namespace. It is
     * used when present; when it is absent (a bare mount, a future seat rename, or a
     * Node smoke test) the same dictionaries above answer instead of a raw key.
     */
    function wfMakeSay(t) {
      return function say(key, params) {
        var text = null;
        if (typeof t === "function") {
          try {
            text = t(key);
          } catch (error) {
            text = null;
          }
        }
        if (typeof text !== "string" || text === "" || text === key) {
          text = WF_DICTS.zh[key] || WF_DICTS.en[key] || key;
        }
        if (params && typeof params === "object") {
          text = text.replace(/\{(\w+)\}/g, function (match, name) {
            return params[name] === undefined || params[name] === null ? match : String(params[name]);
          });
        }
        return text;
      };
    }

    function wfProgressText(say, progress) {
      return say("panel.progress", {
        done: progress.done,
        total: progress.total,
        percent: progress.percent,
      });
    }

    /* ------------------------------------------------------------------------- */
    /* hooks */
    /* ------------------------------------------------------------------------- */

    /** The active session id, or null. `useSessions` is a standard prop of BOTH seats this
     * plugin occupies (`main` and `sidebar.panellist`), so the panel keeps reading it the
     * same way it did on the overlay. */
    function wfUseSessionId(props) {
      var useSessions = props && props.useSessions;
      if (typeof useSessions !== "function") return null;
      var snapshot = useSessions(function (value) {
        return value;
      });
      return wfSessionIdFromSnapshot(snapshot);
    }

    /** localStorage-backed prefs; every update is persisted by an effect. */
    function wfUsePrefs() {
      var pair = React.useState(function () {
        return wfLoadPrefs();
      });
      var prefs = pair[0];
      var setPrefs = pair[1];

      function update(patch) {
        setPrefs(function (prev) {
          return wfApplyPrefsPatch(prev, patch);
        });
      }

      React.useEffect(
        function () {
          wfSavePrefs(prefs);
        },
        [prefs.width, prefs.height, prefs.collapsed, prefs.selectedStep,
          prefs.palette, prefs.motion, prefs.detail, prefs.nodeLimit]
      );

      return { prefs: prefs, update: update };
    }

    /**
     * Poll `/dsh-workflow/state` with If-None-Match. Reading is the only thing this
     * hook does: no writes, no host calls, no projections.
     *
     * The snapshot is dropped to `loading` the moment the session id changes, so a
     * switch can never show the previous session's steps ( §4 acceptance).
     */
    function wfUseSnap(sessionId) {
      var pair = React.useState(function () {
        return { status: sessionId ? "loading" : "idle", view: null, rev: null, error: "" };
      });
      var snap = pair[0];
      var setSnap = pair[1];

      React.useEffect(
        function () {
          if (!sessionId) {
            setSnap({ status: "idle", view: null, rev: null, error: "" });
            return undefined;
          }

          var stopped = false;
          var timer = 0;
          var controller = null;
          var etag = "";

          setSnap({ status: "loading", view: null, rev: null, error: "" });

          function schedule(delay) {
            if (stopped) return;
            timer = window.setTimeout(tick, delay);
          }

          function delayForPage() {
            return document.visibilityState === "visible" ? WF_POLL_VISIBLE : WF_POLL_HIDDEN;
          }

          function tick() {
            if (stopped) return;
            var delay = delayForPage();
            if (controller && typeof controller.abort === "function") {
              try {
                controller.abort();
              } catch (error) {
     /* an already-settled request has nothing to abort */
              }
            }
            controller = typeof AbortController === "function" ? new AbortController() : null;
            var signal = controller ? controller.signal : undefined;
            wfPollOnce(window.fetch, wfPollUrl(sessionId), etag, signal).then(function (result) {
              if (stopped) return;
     // -1 = this request was aborted by a newer one (visibility change): the
     // newer tick already owns the loop, so stay silent and do not re-arm.
              if (result.status === -1) return;
              if (result.status === 304) {
                setSnap(function (prev) {
                  return prev.view ? { status: "live", view: prev.view, rev: prev.rev, error: "" } : prev;
                });
              } else if (result.status === 200) {
                etag = result.etag || etag;
                setSnap({
                  status: "live",
                  view: result.payload.view || null,
                  rev: wfFinite(result.payload.rev),
                  error: "",
                });
              } else {
                setSnap(function (prev) {
                  return {
                    status: prev.view ? "stale" : "error",
                    view: prev.view,
                    rev: prev.rev,
                    error: result.error,
                  };
                });
              }
              schedule(delay);
            });
          }

          function onVisibilityChange() {
            if (document.visibilityState !== "visible") return;
            window.clearTimeout(timer);
            tick();
          }

          tick();
          document.addEventListener("visibilitychange", onVisibilityChange);
          return function () {
            stopped = true;
            window.clearTimeout(timer);
            if (controller && typeof controller.abort === "function") {
              try {
                controller.abort();
              } catch (error) {
     /* ignore */
              }
            }
            document.removeEventListener("visibilitychange", onVisibilityChange);
          };
        },
        [sessionId]
      );

      return snap;
    }

    /** The stylesheet lives exactly as long as the mount. */
    function wfUseStyle() {
      React.useEffect(function () {
        var element = document.getElementById(WF_STYLE_ID);
        if (!element) {
          element = document.createElement("style");
          element.id = WF_STYLE_ID;
          document.head.appendChild(element);
        }
        element.textContent = WF_CSS;
        return function () {
          var current = document.getElementById(WF_STYLE_ID);
          if (current && current.parentNode) current.parentNode.removeChild(current);
        };
      }, []);
    }

    /** Alt+W toggles the collapsed state; the listener is removed on unmount. */
    function wfUseAltW(updatePrefs) {
      React.useEffect(function () {
        function onKeyDown(event) {
          if (!event || !event.altKey || event.ctrlKey || event.metaKey) return;
          var key = event.key || "";
          if (!(key === "w" || key === "W" || key === "ω" || event.code === "KeyW")) return;
          if (typeof event.preventDefault === "function") event.preventDefault();
          updatePrefs(function (prev) {
            return { collapsed: !prev.collapsed };
          });
        }
        window.addEventListener("keydown", onKeyDown);
        return function () {
          window.removeEventListener("keydown", onKeyDown);
        };
      }, []);
    }

    /**
     * A remembered step index belongs to one session; a switch drops it.
     *
     * The previous id lives in module scope instead of React.useRef on purpose: the
     * overlay occupant is a page singleton, and this plugin only relies on the React
     * hooks the harness documents (useState / useEffect). One less hook is one less
     * assumption about the client runtime.
     */
    var wfSelectionSession;
    function wfUseSessionReset(sessionId, updatePrefs) {
      React.useEffect(
        function () {
          var previous = wfSelectionSession;
          wfSelectionSession = sessionId;
          if (previous !== undefined && previous !== sessionId) {
            updatePrefs({ selectedStep: null });
          }
        },
        [sessionId]
      );
    }

    /* ------------------------------------------------------------------------- */
    /* the two writes: the inject send and its undo ( + ) */
    /* ------------------------------------------------------------------------- */

    var WF_INJECT_PATH = "/dsh-workflow/steer";
    var WF_UNSTEER_PATH = "/dsh-workflow/unsteer";

    /**
     * One hot-inject send. Kept out of the component body so the four-state machine is readable
     * in one place, and so a self-test can read its shape without mounting React.
     *
     * The ACKNOWLEDGEMENT clears itself after WF_INJECT_ACK_MS; the timer is only armed when an
     * acknowledgement was actually produced, so an unmounted panel cannot leave a stray timeout
     * that writes into a dead setter (React ignores it, but the discipline is the point).
     */
    function wfSendInject(text, sessionId, setInject) {
      if (typeof setInject !== "function") return;
      var trimmed = wfInjectText(text);
      if (trimmed === "" || typeof sessionId !== "string" || sessionId === "") return;

      setInject(function (prev) {
        return { open: prev ? prev.open : true, state: "sending", text: trimmed, reason: "" };
      });

     // Cancellable before send: the controller is stored on window for the panel's "cancel send" button.
     // Only takes effect while the request is still in flight; once it returns 200 the host has it in the inbox and the plugin cannot pull it back.
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      window.__dshWorkflowMapAbort = controller;

      wfPostSteer(window.fetch, WF_INJECT_PATH, sessionId, trimmed, controller ? controller.signal : undefined).then(function (result) {
     // The acknowledgement's wording comes from the panel's OWN dictionary: `say` here is the
     // component's, and wfInjectOutcome only needs it for the one fallback string.
        var outcome = wfInjectOutcome(result && result.payload, wfMakeSay());
        var next = {
          open: true,
          state: outcome.kind === "sent" ? "sent" : "failed",
          text: trimmed,
     // A failure carries the HOST's own reason verbatim (the honesty rule).
          reason: outcome.kind === "sent" ? "" : outcome.text,
        };
        setInject(next);
        window.setTimeout(function () {
          setInject(function (prev) {
            if (!prev) return prev;
            var cleared = wfInjectAckDone(prev.state);
            if (cleared === prev.state) return prev;
            return { open: prev.open, state: cleared, text: prev.text, reason: "" };
          });
        }, WF_INJECT_ACK_MS);
      });
    }

    /**
     * One revocation: `POST /dsh-workflow/unsteer { sessionId, messageId }` for a history row the
     * running turn has not claimed yet.
     *
     * WHY IT IS NOT OPTIMISTIC. The host's 200 means the message LEFT the inbox — the fold will say
     * "revoked" on the next poll, from the host's own `agent/inbox/spliced { outcome: 'canceled' }`.
     * So this function never rewrites the history row: it only records that THIS row is being revoked,
     * which greys its button (no second post) and carries the host's reason back when it refuses.
     *
     * WHY THE ID IS CHECKED TWICE. A missing `messageId` (an older row without an id, which
     * store.js drops anyway) and a missing `sessionId` are refused HERE rather than posted, and a
     * second click on a row already being revoked returns the previous state untouched.
     */
    function wfRevokeInject(messageId, sessionId, setRevoke) {
      if (typeof setRevoke !== "function") return;
      if (typeof messageId !== "string" || messageId === "") return;
      if (typeof sessionId !== "string" || sessionId === "") return;

      var double = false;
      setRevoke(function (prev) {
        var state = prev && typeof prev === "object" ? prev : { id: "", state: "idle", reason: "" };
        if (state.id === messageId && (state.state === "revoking" || state.state === "revoked")) {
          double = true;
          return state;
        }
        return { id: messageId, state: "revoking", reason: "" };
      });
      if (double === true) return;

      wfPostUnsteer(window.fetch, WF_UNSTEER_PATH, sessionId, messageId).then(function (result) {
        var outcome = wfRevokeOutcome(result && result.payload, wfMakeSay());
        setRevoke({
          id: messageId,
          state: outcome.kind === "revoked" ? "revoked" : "failed",
     // A failure carries the HOST's own reason verbatim (the same honesty rule as the send).
          reason: outcome.kind === "revoked" ? "" : outcome.text,
        });
      });
    }

    /* ------------------------------------------------------------------------- */
    /* detail wiring */
    /* ------------------------------------------------------------------------- */

    /**
     * Escape collapses the details, not the panel. Re-bound when the selected step changes
     * because the handler needs to know WHICH step to fold — a mount-only closure would
     * close the step that was selected when the panel opened.
     */
    function wfUseEscapeDetail(selectedStep, actions) {
      React.useEffect(
        function () {
          if (typeof document === "undefined") return undefined;
          var bound = wfBindEscape(document, actions);
          return function () {
            bound.destroy();
          };
        },
        [selectedStep]
      );
    }

    /** Re-measure the flowing curve when a <details> or the step detail changes height. */
    function wfUseDetailNudge() {
      React.useEffect(function () {
        if (typeof document === "undefined") return undefined;
        var bound = wfBindDetailNudge(document, typeof window !== "undefined" ? window : null);
        return function () {
          bound.destroy();
        };
      }, []);
    }

    /* ------------------------------------------------------------------------- */
    /* the single page's behaviour */
    /* ------------------------------------------------------------------------- */

    /**
     * Resolve the prefs' (rightKind, rightKey) into the page spec the renderer needs, against the
     * LIVE model. Pure and exported for the self-test: a stored key that no longer resolves must
     * produce `null` (the page closes) rather than somebody else's record.
     *
     * The return value is the page's WHOLE content decision, so the renderer never re-derives it:
     * {kind, stepIndex, unit, stepDetail, typeKey, label, scopeStep, bucket, nodes, openType}
     */
    function wfRightPageSpec(model, prefs) {
      if (!model || !prefs || prefs.rightOpen !== true) return null;
      var kind = typeof prefs.rightKind === "string" ? prefs.rightKind : "step";
      if (WF_RIGHT_KINDS.indexOf(kind) < 0) return null;

      if (kind === "inject") {
        return { kind: "inject", stepIndex: null, openType: null, unit: null, stepDetail: null };
      }

      var key = typeof prefs.rightKey === "string" ? prefs.rightKey : "";
      var units = model.page && Array.isArray(model.page.units) ? model.page.units : [];

      if (kind === "type") {
        var at = key.indexOf("|");
        if (at < 0) return null;
        var scopeRaw = key.slice(0, at);
        var typeKey = key.slice(at + 1);
        if (typeKey === "") return null;
        var scopeStep = scopeRaw === "session" ? null : wfFinite(Number(scopeRaw));
        if (scopeRaw !== "session" && (scopeStep === null || !isFinite(scopeStep))) return null;
     // The bucket is looked up in the units the model actually has: a type from another session's
     // stored key simply does not resolve.
        var seen = null;
        var owner = null;
        if (scopeStep === null) {
     // Whole session: merge every unit's bucket of this key. The count is the sum of the units',
     // which is exactly what each circle already claims, so the page cannot contradict the chain.
          var merged = { key: typeKey, kind: "file", label: "", side: "left", count: 0, running: false, error: false, nodes: [] };
          for (var u = 0; u < units.length; u += 1) {
            var types = units[u] && Array.isArray(units[u].types) ? units[u].types : [];
            for (var t = 0; t < types.length; t += 1) {
              if (types[t].key !== typeKey) continue;
              merged.kind = types[t].kind;
              merged.label = types[t].label;
              merged.side = types[t].side;
              merged.count += types[t].count;
              merged.running = merged.running || types[t].running === true;
              merged.error = merged.error || types[t].error === true;
              for (var id = 0; id < types[t].nodes.length; id += 1) merged.nodes.push(types[t].nodes[id]);
            }
          }
          if (merged.label === "") return null;
          seen = merged;
        } else {
          if (scopeStep < 0 || scopeStep >= units.length) return null;
          var unitTypes = units[scopeStep] && Array.isArray(units[scopeStep].types) ? units[scopeStep].types : [];
          for (var ut = 0; ut < unitTypes.length; ut += 1) {
            if (unitTypes[ut].key === typeKey) {
              seen = unitTypes[ut];
              break;
            }
          }
          if (!seen) return null;
          owner = units[scopeStep];
        }
     // The calls themselves: every node of that type, resolved through the SELECTED step's flow only
     // when the scope IS the selected step (the wire only ships that step's nodes). A session-wide
     // type therefore lists ids it cannot dereference — the page says so rather than inventing rows.
        var calls = [];
        var flowNodes = model.flow && Array.isArray(model.flow.nodes) ? model.flow.nodes : [];
        if (scopeStep !== null && model.selected === scopeStep) {
          var byId = Object.create(null);
          for (var f = 0; f < flowNodes.length; f += 1) byId[flowNodes[f].id] = flowNodes[f];
          for (var s = 0; s < seen.nodes.length; s += 1) {
            if (byId[seen.nodes[s]]) calls.push(byId[seen.nodes[s]]);
          }
        }
        return {
          kind: "type",
          stepIndex: model.selected,
          scopeStep: scopeStep,
          openType: typeKey,
          label: seen.label,
          bucket: seen,
          nodes: calls,
          unit: owner,
          stepDetail: null,
        };
      }

     // kind === "step": the key is `step:<index>`; a keyless page follows the selection.
      var wanted = null;
      if (key.indexOf("step:") === 0) {
        var parsed = wfFinite(Number(key.slice(5)));
        if (parsed !== null && isFinite(parsed)) wanted = Math.round(parsed);
      }
      if (wanted === null) wanted = model.selected;
      if (wanted === null || wanted < 0 || wanted >= units.length) return null;
      var row = units[wanted];
      return {
        kind: "step",
        stepIndex: wanted,
        openType: null,
        unit: row,
     // Only the selected step's detail is on the wire; a page about another step says so.
        stepDetail: model.selected === wanted && model.detail ? model.detail : null,
        scopeStep: wanted,
      };
    }

    /**
     * Bring the RUNNING unit to the middle of the chain — once per step, and only if the user has not
     * scrolled since.
     *
     * Two rules make this honest rather than helpful-looking:
     * 1. it runs once per running step (`centeredStep`), so a poll cannot keep re-centring a reader;
     * 2. any manual scroll in the page defeats it — `userScrolled` is set by the FIRST wheel / touch /
     * keydown on the scroller, and after that this hook does nothing for that step.
     */
    /**
     * The centring DECISION, as a pure function: run the auto-centring for `runningIndex` only
     * · when there IS a running step,
     * · when it has not already been centred once (`centeredStep`), and
     * · when the user has not scrolled the chain by hand (`scrolled`).
     *
     * The third clause is the user's "unless the user scrolls by hand". Note the trap this function exists to avoid:
     * passing a sentinel like -1 as `centeredStep` would mean "never centred" and RE-CENTRE after every
     * manual scroll — the exact opposite of the request.
     */
    function wfShouldCenter(runningIndex, centeredStep, scrolled) {
      if (scrolled === true) return false;
      if (runningIndex === null || runningIndex === undefined) return false;
      return centeredStep !== runningIndex;
    }

    function wfUsePageCenter(model, centeredStep, scrolled, setCenteredStep) {
      var runningIndex = model && model.page && wfFinite(model.page.runningIndex) !== null ? model.page.runningIndex : null;
      React.useEffect(
        function () {
          if (!wfShouldCenter(runningIndex, centeredStep, scrolled)) return undefined;
          if (typeof document === "undefined") return undefined;
          var result = wfCenterRunning(document, runningIndex);
          if (result.applied === true) setCenteredStep(runningIndex);
          return undefined;
        },
        [runningIndex, centeredStep, scrolled]
      );
    }

    /**
     * The centring itself, split out of the hook so the browser check can run the SAME code the
     * product runs (a measurement page mounts the renderer's tree, it does not mount React).
     *
     * Returns `{applied, reason?, offset?, error?}` — never throws, never scrolls on a partial DOM.
     * `error` is the signed distance from the unit's middle to the viewport's middle AFTER the write,
     * which is what the acceptance measures.
     */
    function wfCenterRunning(doc, runningIndex) {
      if (!doc || typeof doc.querySelector !== "function") return { applied: false, reason: "no-doc" };
      var index = wfFinite(runningIndex);
      if (index === null) return { applied: false, reason: "no-running-step" };
      var scroller = doc.querySelector('[data-dsh-workflow-map="page-scroll"]');
      if (!scroller || typeof scroller.scrollTop !== "number") return { applied: false, reason: "no-scroller" };
      var unit =
        typeof scroller.querySelector === "function"
          ? scroller.querySelector('.wf-unit[data-step-index="' + Math.round(index) + '"]')
          : null;
      if (!unit || typeof unit.getBoundingClientRect !== "function") return { applied: false, reason: "no-unit" };
      var frame = scroller.getBoundingClientRect();
      var rect = unit.getBoundingClientRect();
      var offset = wfCenterOffset(
        rect.top - frame.top + scroller.scrollTop,
        rect.height,
        frame.height,
        scroller.scrollHeight
      );
      if (offset === null) return { applied: false, reason: "bad-geometry" };
      scroller.scrollTop = offset;
     // Re-read after the write: the honest error is what the user now sees, not what the arithmetic
     // predicted (a smooth-scroll or a sub-pixel layout shift would otherwise be papered over).
      var after = unit.getBoundingClientRect();
      return {
        applied: true,
        offset: Math.round(offset * 100) / 100,
        error: Math.round((after.top + after.height / 2 - (frame.top + frame.height / 2)) * 100) / 100,
      };
    }

    /**
     * The FIRST manual scroll on the chain defeats the auto-centring for the rest of the session.
     * Listening on the scroller only — not on the window — so scrolling the right page never counts.
     */
    function wfUseManualScrollGuard(mark) {
      React.useEffect(function () {
        if (typeof document === "undefined") return undefined;
        var scroller = document.querySelector('[data-dsh-workflow-map="page-scroll"]');
        if (!scroller || typeof scroller.addEventListener !== "function") return undefined;
        function onUserScroll() {
          if (typeof mark === "function") mark();
          scroller.removeEventListener("wheel", onUserScroll);
          scroller.removeEventListener("touchstart", onUserScroll);
          scroller.removeEventListener("keydown", onUserScroll);
        }
        scroller.addEventListener("wheel", onUserScroll, { passive: true });
        scroller.addEventListener("touchstart", onUserScroll, { passive: true });
        scroller.addEventListener("keydown", onUserScroll);
        return function () {
          scroller.removeEventListener("wheel", onUserScroll);
          scroller.removeEventListener("touchstart", onUserScroll);
          scroller.removeEventListener("keydown", onUserScroll);
        };
      }, []);
    }

    /* ------------------------------------------------------------------------- */
    /* the component */
    /* ------------------------------------------------------------------------- */

    function WorkflowMapPanel(props) {
      var sessionId = wfUseSessionId(props);
      var prefsHandle = wfUsePrefs();
      var prefs = prefsHandle.prefs;
      var updatePrefs = prefsHandle.update;
      var snap = wfUseSnap(sessionId);
      var settingsPair = React.useState(false);
      var settingsOpen = settingsPair[0];
      var setSettingsOpen = settingsPair[1];
     // the composer's four-state machine and what was typed. It deliberately
     // lives in React state, NOT in localStorage: an in-flight send and a draft prompt are
     // per-session, per-moment facts, and reviving a stale "injected" would be a lie.
      var injectPair = React.useState({ state: "idle", text: "", reason: "" });
      var inject = injectPair[0];
      var setInject = injectPair[1];
     // which history row is being revoked right now, and (on failure) the host's
     // own reason for that row. Deliberately NOT in the inject record above: the send's four-state
     // machine clears itself on a timer, while a revocation stays on screen until the FOLDED row
     // stops being `pending` — two different lifetimes, two different pieces of state.
      var revokePair = React.useState({ id: "", state: "idle", reason: "" });
      var injectRevoke = revokePair[0];
      var setInjectRevoke = revokePair[1];
     // which call the type page has expanded, and whether the chain has already brought the
     // running unit to the middle (once per step — the user's own scrolling must never be undone).
      var callPair = React.useState(null);
      var openCall = callPair[0];
      var setOpenCall = callPair[1];
      var centeredPair = React.useState(null);
      var centeredStep = centeredPair[0];
      var setCenteredStep = centeredPair[1];
      wfUseStyle();
      wfUseAltW(updatePrefs);
      wfUseSessionReset(sessionId, updatePrefs);

      var say = wfMakeSay(props && props.t);
     // `Date.now` is passed in (the store stays clock-free) because needs one honest
     // judgement the event log alone cannot make: is this session still working right now?
      var model = wfBuildModel(snap.view, prefs, Date.now());
      var systemMotion = wfUseMotion();
      var motionPref = wfSettingsOf(prefs).motion;
      var motion = systemMotion === "static" || motionPref === "static" ? "static" : "css";
     // The curve is measured from the DOM, so it must be re-measured whenever the two endpoint
     // cards could have moved — the effect's dependency is a cheap string, not the whole model.
     // the old two-column curve (step ↔ node) is gone with the columns: there is no second
     // column to connect to. The living layer's CSS (ring, breathing dot, dashed branch) is reused;
     // only its measurement is no longer needed.
     // Resolve the per-step flow state BEFORE rendering: a state left over from another
     // step reads as the defaults (collapsed groups · no show-all · no highlight).
     // the right page's content is DERIVED from the prefs (kind + key) and the model, so a
     // stale key can never show another step's record: every branch below re-resolves against the
     // live view and falls back to the unit's own numbers.
      var page = wfRightPageSpec(model, prefs);
      var scrolledPair = React.useState(0);
      var scrolled = scrolledPair[0];
      var setScrolled = scrolledPair[1];
      wfUseManualScrollGuard(function () {
        setScrolled(1);
      });
     // centring: once per running step, defeated permanently by the FIRST manual scroll.
      wfUsePageCenter(model, centeredStep, scrolled === 1, setCenteredStep);
     // object URLs created by exports are revoked when this panel unmounts.
      wfUseSnapshotUrls();

      var actions = {
        onCollapse: function () {
          updatePrefs({ collapsed: true });
        },
        onExpand: function () {
          updatePrefs({ collapsed: false });
        },
     // Hot injection is a PAGE, not a split: opening it replaces whatever the right page was
     // showing; closing it closes the page (the composer's draft stays in React state).
        onToggleInject: function () {
          updatePrefs(function (prev) {
            var open = prev.rightOpen === true && prev.rightKind === "inject";
            return open ? { rightOpen: false } : { rightOpen: true, rightKind: "inject" };
          });
        },
        onInjectText: function (value) {
          setInject({ state: "idle", text: String(value), reason: "" });
        },
        onInjectCancel: function () {
          setInject({ state: "idle", text: "", reason: "" });
          updatePrefs({ rightOpen: false });
        },
        onInjectSend: function (text) {
          wfSendInject(text, sessionId, setInject);
        },
     // the history row's "Revoke": one POST, then wait for the fold to say
     // "revoked". The row's id comes from the model (the host returned it on the steer 200 and the
     // fold carried it into the rows), never from a DOM lookup.
        onInjectRevoke: function (messageId) {
          wfRevokeInject(messageId, sessionId, setInjectRevoke);
        },
     // "cancel send": abort only in-flight requests. A 200 cannot be pulled back (the host exposes no inbox revoke for it).
        onInjectAbort: function () {
          var controller = typeof window !== "undefined" ? window.__dshWorkflowMapAbort : null;
          if (controller && typeof controller.abort === "function") controller.abort();
          window.__dshWorkflowMapAbort = null;
          setInject({ state: "idle", text: "", reason: "" });
        },
        onToggleSettings: function () {
          setSettingsOpen(!settingsOpen);
        },
     // Clicking a main-flow unit: it becomes the SELECTED step (store.js builds its detail) and the
     // right page opens on it. It deliberately does not expand anything in place.
     // right page opens on it. It deliberately does not expand anything in place.
        onOpenStep: function (index) {
          setOpenCall(null);
          updatePrefs({
            selectedStep: index,
            rightOpen: true,
            rightKind: "step",
            rightKey: "step:" + index,
          });
        },
     // A round satellite (or a type row inside the step page): the type page, scoped to that step
     // when it came from a unit's gutter, or to the whole session when it came from the header.
        onOpenType: function (index, typeKey) {
          setOpenCall(null);
          var scoped = wfFinite(index) === null ? "session" : String(Math.round(index));
          var patch = {
            rightOpen: true,
            rightKind: "type",
            rightKey: scoped + "|" + String(typeKey),
          };
          if (scoped !== "session") patch.selectedStep = Math.round(index);
          updatePrefs(patch);
        },
        onSelectCall: function (nodeId) {
          setOpenCall(function (prev) {
            return prev === nodeId ? null : nodeId;
          });
        },
        onClosePage: function () {
          setOpenCall(null);
          updatePrefs({ rightOpen: false });
        },
        onSelectStep: function (index) {
          updatePrefs({ selectedStep: index });
        },
        onReset: function () {
     // the DOCUMENTED defaults, not whatever localStorage last held.
          updatePrefs(wfDefaultPrefs());
        },
        onSetting: function (setting, value) {
          var patch = {};
          patch[setting] = value;
          updatePrefs(patch);
        },
        onExportCopy: function (kind, element) {
          if (!model) return;
          wfCopyWithFeedback(
            wfSnapshotText(kind, model, snap.view, sessionId, Date.now(), say),
            element,
            say
          );
        },
        onExportDownload: function (kind) {
          if (!model) return;
          wfSnapshotDownload(
            kind,
            wfSnapshotText(kind, model, snap.view, sessionId, Date.now(), say),
            sessionId
          );
        },
     // Escape (wfBindEscape): close the right page, never the panel. The step detail is no longer
     // inline, so this is the whole gesture now.
        onEscapeDetail: function () {
          setOpenCall(null);
          updatePrefs({ rightOpen: false });
        },
     // A path / command copy with the 1.5 s acknowledgement (NodeDetail.js).
        onCopy: function (text, element) {
          wfCopyWithFeedback(text, element, say);
        },
      };

      wfUseEscapeDetail(model ? model.selected : null, actions);

      return wfRenderPanel(model, prefs, say, actions, {
        settingsOpen: settingsOpen,
        status: snap.status,
        error: snap.error,
        rev: snap.rev,
        endpoint: sessionId ? wfPollUrl(sessionId) : "",
        nodeTotal: snap.view && snap.view.counts ? wfFinite(snap.view.counts.nodes) : null,
     // what the right page shows, already resolved against the model.
        right: page,
        pageStep: page ? page.stepIndex : null,
        pageType: page ? page.openType : null,
        openCall: openCall,
        asOf: model ? model.asOf : null,
     // what the living layer reads off the root element.
        motion: motion,
     // "Always" keeps the living layer moving even when the session is idle;
     // "While running" (default) preserves the idle freeze; "Off" is data-motion=static.
        idle: motionPref === "always" ? false : !model || model.running !== true,
     // the composer's own state, read straight from React.
        injectState: inject.state,
        injectText: inject.text,
        injectReason: inject.reason,
     // which row is being revoked, and the host's reason when it refused.
        injectRevoke: injectRevoke,
        sessionId: sessionId || "",
      });
    }

    /* ------------------------------------------------------------------------- */
    /* the pure renderer */
    /* ------------------------------------------------------------------------- */

    function wfFire(fn, argument) {
      if (typeof fn === "function") fn(argument);
    }

    function wfRenderPanel(model, prefs, say, actions, ui) {
      if (!model) return null;
     // the header badge's only number: rows the session has not taken yet.
      var pendingCount = wfPendingInjectCount(model.injects);
      var extras = ui || {};
      var fire = actions || {};
     // the two attributes the living layer needs. `motion` comes from the system's
     // prefers-reduced-motion preference (pulse.js), `idle` from the model's running flag.
     // Both live on .wf-root so the capsule is covered as well as the panel.
      var motion = extras.motion === "static" ? "static" : "css";
      var idle = extras.idle === true;
     // the layout owns the geometry. There is no dragged width, no pinned height and
     // no viewport clamp any more — the centre column decides both, and the card fills it.
      var collapsed = prefs.collapsed === true;
      var planning = model.kind === "planning";
     // one sanitised settings record drives the root data attributes and the
     // settings card, so a click can never leave the DOM and the card disagreeing.
     // Read the live prefs, not model.settings: a click must change the root attributes
     // on the same render even before the next poll produces an equivalent model.
      var settings = wfSettingsOf(prefs);
      if (collapsed) {
        var capsuleText = planning
          ? say("panel.planning")
          : say("capsule.progress", {
              done: model.progress.done,
              total: model.progress.total,
              percent: model.progress.percent,
            });
        return h(
          "div",
          {
            className: "wf-root",
            key: "wf-root",
            "data-dsh-workflow-map": "root",
            "data-idle": idle ? "1" : "0",
            "data-motion": motion,
            "data-motion-pref": settings.motion,
            "data-palette": settings.palette,
            "data-detail": settings.detail,
            "data-node-limit": String(settings.nodeLimit),
          },
     // collapsed = a folded row inside the main area, not a floating capsule.
     // The row keeps the live count so the panel can be left folded and still be read.
          h(
            "div",
            { className: "wf-capsule-bar", key: "capsule-bar" },
            h(
              "button",
              {
                type: "button",
                key: "capsule",
                className: "wf-capsule",
                "data-dsh-workflow-map": "capsule",
                "aria-expanded": "false",
                "aria-label": say("capsule.aria"),
                title: say("capsule.title") + " — " + capsuleText,
                onClick: function () {
                  wfFire(fire.onExpand);
                },
              },
              h("span", { className: "wf-dot", key: "dot", "aria-hidden": "true" }),
              h("span", { className: "wf-capsule-text", key: "text" }, capsuleText)
            ),
            h("span", { className: "wf-capsule-hint", key: "hint" }, say("capsule.hint"))
          )
        );
      }

      var header = h(
        "header",
        { className: "wf-head", key: "head" },
        h(
          "div",
          { className: "wf-head-text", key: "text" },
          h(
            "div",
            { className: "wf-task", key: "task", title: model.task || "" },
            model.task || say("panel.task.fallback")
          ),
     // No progress line while planning: the body's single "planning..." line is the
     // whole message ( contract §3), so the number cannot appear twice.
          planning
            ? null
            : h(
                "div",
                { className: "wf-meta", key: "meta" },
                h("span", { className: "wf-pct", key: "pct" }, wfProgressText(say, model.progress)),
                h("span", { className: "wf-sep", key: "sep" }, "·"),
                h(
                  "span",
                  { className: "wf-raw", key: "nodes" },
                  say("panel.nodes", { count: model.flow.total })
                ),
                extras.status === "stale"
                  ? h(
                      "span",
                      { className: "wf-status-bad", key: "stale", title: extras.error || "" },
                      say("panel.stale")
                    )
                  : null
              )
        ),
        h(
          "div",
          { className: "wf-btns", key: "btns" },
          h(
            "button",
            {
              type: "button",
              key: "collapse",
              className: "wf-btn",
              title: say("panel.collapse"),
              "aria-label": say("panel.collapse"),
              onClick: function () {
                wfFire(fire.onCollapse);
              },
            },
            "‒"
          ),
     // the hot-inject entry is now a NAMED, prominent button (the user asked for it to be
     // prominent and in Chinese), not a ⇄ glyph: the glyph said "split the column", which no longer exists
     // what happens — the composer takes over the right-hand page.
          h(
            "button",
            {
              type: "button",
              key: "inject",
              className: "wf-btn wf-btn-hot",
              "data-dsh-workflow-map": "inject-toggle",
     // the badge is driven by the model's own rows: only a row
     // whose status is "pending" is still waiting for the turn. No pending row ⇒ neither the
     // attribute nor the element exists (the self-test asserts both directions).
              "data-pending-count": pendingCount > 0 ? String(pendingCount) : undefined,
              "data-active": extras.right && extras.right.kind === "inject" ? "true" : undefined,
              title: pendingCount > 0 ? say("panel.inject.pending.badge", { count: pendingCount }) : say("panel.inject.open"),
              "aria-label": say("panel.inject.open"),
              "aria-pressed": extras.right && extras.right.kind === "inject" ? "true" : "false",
              onClick: function () {
                wfFire(fire.onToggleInject);
              },
            },
            say("panel.inject.banner"),
            pendingCount > 0
              ? h(
                  "span",
                  { className: "wf-inject-badge", key: "pending", "aria-hidden": "true" },
                  String(pendingCount)
                )
              : null
          ),
          h(
            "button",
            {
              type: "button",
              key: "settings",
              className: "wf-btn",
              "data-active": extras.settingsOpen === true ? "true" : undefined,
              title: say("panel.settings"),
              "aria-label": say("panel.settings"),
              onClick: function () {
                wfFire(fire.onToggleSettings);
              },
            },
            "⚙"
          ),
        )
      );

      var settingsCard =
        extras.settingsOpen === true
          ? wfRenderSettings(h, prefs, say, fire, {
              endpoint: extras.endpoint,
              steps: model.progress.total,
              nodes: wfFinite(extras.nodeTotal) === null ? model.flow.total : extras.nodeTotal,
              rev: extras.rev,
            })
          : null;

      var body;
      if (planning) {
        body = h(
          "div",
          { className: "wf-body", key: "body", "data-kind": "planning" },
          h(
            "div",
            { className: "wf-empty", key: "empty" },
            h("div", { key: "line" }, say("panel.planning")),
            h("div", { key: "note" }, say("panel.planning.note"))
          )
        );
      } else {
        body = h(
          "div",
          {
            className: "wf-body",
            key: "body",
            "data-kind": "ready",
     // ONE page. The right-hand page is a flex sibling, not an overlay and not a third
     // column: `data-right` says whether it is mounted, and its flex basis does the rest.
            "data-right": extras.right ? "true" : "false",
            "data-dsh-workflow-map": "body",
          },
     // The serial main flow: one unit per step, satellites on both sides, straight connectors.
          wfRenderMainFlow(h, model, say, fire, {
            openStep: extras.pageStep,
            openType: extras.pageType,
            asOf: wfFinite(extras.asOf) === null ? model.asOf : extras.asOf,
     // "Title only" narrows the unit's rail to one line, exactly as it did in the old column.
            compact: settings.detail === "title",
          }),
     // The right page: a step record, one file type's calls, or the inject composer.
          extras.right
            ? wfRenderRightPage(
                h,
                model,
                say,
                fire,
                Object.assign({}, extras.right, {
                  openCall: extras.openCall,
                  activeNodeId: model.flow && typeof model.flow === "object" ? model.flow.activeNodeId : null,
                  injectState: extras.injectState,
                  injectText: extras.injectText,
                  injectReason: extras.injectReason,
     // the history rows, straight from the model (the host folds them from the
     // session's own log, so the browser adds nothing and invents nothing).
                  injectHistory: model.injects,
     // the one revocation on screen, flattened for the composer.
                  injectRevokeId: extras.injectRevoke && typeof extras.injectRevoke === "object" ? extras.injectRevoke.id : "",
                  injectRevokeState: extras.injectRevoke && typeof extras.injectRevoke === "object" ? extras.injectRevoke.state : "idle",
                  injectRevokeReason: extras.injectRevoke && typeof extras.injectRevoke === "object" ? extras.injectRevoke.reason : "",
                  sessionId: extras.sessionId,
                })
              )
            : null
        );
      }

      return h(
        "div",
        {
          className: "wf-root",
          key: "wf-root",
          "data-dsh-workflow-map": "root",
          "data-idle": idle ? "1" : "0",
          "data-motion": motion,
          "data-motion-pref": settings.motion,
          "data-palette": settings.palette,
          "data-detail": settings.detail,
          "data-node-limit": String(settings.nodeLimit),
        },
        h(
          "section",
          {
            className: "wf-card",
            key: "card",
     // a main-column panel is a region, not a dialog — it is not modal,
     // it does not trap focus, and it has no close affordance of its own.
            role: "region",
            "aria-label": say("panel.aria", { task: model.task || say("panel.task.fallback") }),
            "data-dsh-workflow-map": "panel",
            "data-kind": model.kind,
            "data-status": extras.status || "idle",
          },
          header,
          settingsCard,
          body
        )
      );
    }

    /* ------------------------------------------------------------------------- */
    /* the sidebar icon */
    /* ------------------------------------------------------------------------- */

    /**
     * The left-rail glyph . Same picture as icon.svg — two stacked panels on a
     * spine — drawn inline with createElement because the sidebar hands this occupant only
     * `{size, active}`: no asset URL is resolvable from inside the ModuleLoader factory.
     * `active` recolours through currentColor, which the shipped rows also rely on.
     */
    function WorkflowMapIcon(props) {
      var size = wfFinite(props && props.size) === null ? 18 : Math.round(props.size);
      var active = props && props.active === true;
      var stroke = "currentColor";
      return h(
        "svg",
        {
          key: "wf-icon",
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          "aria-hidden": "true",
          focusable: "false",
          style: { display: "block", opacity: active ? 1 : 0.72 },
        },
        h("rect", {
          key: "a",
          x: 3,
          y: 3.5,
          width: 8,
          height: 17,
          rx: 2,
          stroke: stroke,
          strokeWidth: 1.6,
        }),
        h("rect", {
          key: "b",
          x: 13.5,
          y: 3.5,
          width: 7.5,
          height: 7,
          rx: 2,
          stroke: stroke,
          strokeWidth: 1.6,
        }),
        h("rect", {
          key: "c",
          x: 13.5,
          y: 13.5,
          width: 7.5,
          height: 7,
          rx: 2,
          stroke: stroke,
          strokeWidth: 1.6,
          opacity: 0.55,
        }),
        h("line", {
          key: "d",
          x1: 7,
          y1: 7.5,
          x2: 7,
          y2: 16.5,
          stroke: stroke,
          strokeWidth: 1.6,
          strokeLinecap: "round",
        })
      );
    }

    /* ------------------------------------------------------------------------- */
    /* the conversation-view seat wrapper */
    /* ------------------------------------------------------------------------- */

    /**
     * The conversation-view seat's DOM marker. The SAME panel is mounted twice — the sidebar page
     * (`main`, keyed by PANEL_ID) and the session tab (`conversation.view`, same id) — and only the tab
     * one must have the host's composer removed. The two seats are indistinguishable from the panel's
     * own props, so the tab seat carries this marker and the stylesheet keys its rule on it.
     */
    var WF_VIEW_SEAT_MARKER = "conversation-view";

    /**
     * Wrap a rendered node in the seat marker. `display:contents` keeps the wrapper BOX-LESS: it adds
     * no element to the layout, so the seat's geometry is exactly the one the panel already had — the
     * div exists only to be the `:has` hook for the rule that hides the composer.
     */
    function wfViewSeatRoot(h, node) {
      return h(
        "div",
        {
          "data-dsh-workflow-map": WF_VIEW_SEAT_MARKER,
          style: { display: "contents" },
        },
        node
      );
    }

    /**
     * The `conversation.view` occupant: the same panel, plus the marker.
     *
     * WHY A WRAPPER, NOT THE PANEL ITSELF: the composer is NOT ours. The host renders it as a SIBLING
     * of the selected view, inside `[data-conversation-content]`
     * (`div[data-conversation-content] > div[data-conversation-scroll] > [selected view, div[data-composer-seat]]`,
     * measured in this host), so nothing inside the panel's own tree can unmount it. A stylesheet rule
     * scoped by `:has` on the seat marker is the only mechanism that removes it without a host change,
     * and it restores itself the moment the user switches back — the host unmounts this view.
     */
    function WorkflowMapViewSeat(props) {
      return wfViewSeatRoot(h, WorkflowMapPanel(props));
    }

    /* ------------------------------------------------------------------------- */
    /* registration */
    /* ------------------------------------------------------------------------- */

    /**
     * two seats, ONE id.
     *
     * sidebar.panellist (list) the rail glyph; its `id` is what the row selects
     * main (keyed) the centre-column page for that same key
     *
     * They must agree: `PanelRow` renders `renderSlot("sidebar.panellist", …, {only:id})`
     * and `selectPanel(id)` then dispatches `main` by that key — selecting an id with no
     * `main` occupant throws. Registering both is the whole contract.
     */

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: DICT_ZH, en: DICT_EN });
      });
      ctx.slots.inject("sidebar.panellist", function () {
        return ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: PANEL_ID,
            order: PANEL_ORDER,
            label: function () {
              return DICT_ZH["panel.title"];
            },
            locale: NS,
          },
          WorkflowMapIcon
        );
      });
      ctx.slots.inject("main", function () {
        return ctx.slots.register(
          {
            name: "main",
            key: PANEL_ID,
            locale: NS,
          },
          WorkflowMapPanel
        );
      });
     // The shortcut in the session tab bar. `conversation.view` is the slot for the tab row above the conversation area
     // (a list ordered by `order`): chat(0) / trajectory(10) / context(20) / fleet(30), so order 40 puts it
     // after "fleet". Clicking it renders the same `WorkflowMapPanel`, wrapped in a seat marker
     // `wfViewSeatRoot`: the stylesheet uses it to hide the host composer seat - the very same
     // panel, the same polling, the same hot injection. Not a second implementation.
      ctx.slots.inject("conversation.view", function () {
        return ctx.slots.register(
          {
            name: "conversation.view",
            id: PANEL_ID,
            order: PANEL_ORDER * 4,
            locale: NS,
            label: function () {
              return DICT_ZH["panel.title"];
            },
          },
          WorkflowMapViewSeat
        );
      });
    }

    /**
     * Test seam: tools/selftest-panel.mjs loads the built bundle with a fake `require`
     * and asserts the pure parts directly. Nothing in the app reads this.
     */
    var __test = {
      buildModel: wfBuildModel,
     // the single page, its satellites, the right page and the type buckets they are built
     // from. Exported so the self-tests drive the EXACT trees the frame mounts.
      renderMainFlow: wfRenderMainFlow,
      renderUnit: wfRenderUnit,
      renderSatellite: wfRenderSatellite,
      centerOffset: wfCenterOffset,
      centerRunning: wfCenterRunning,
      shouldCenter: wfShouldCenter,
      satelliteLabel: wfSatelliteLabel,
      renderRightPage: wfRenderRightPage,
      renderTypeBody: wfRenderTypeBody,
      renderCallRow: wfRenderCallRow,
      renderStepTypeSummary: wfRenderStepTypeSummary,
      rightPageSpec: wfRightPageSpec,
      typeBuckets: wfTypeBuckets,
      typeSides: wfTypeSides,
      typeOfPath: wfTypeOfPath,
      typeBadge: wfTypeBadge,
      typeSide: wfTypeSide,
      rightKinds: WF_RIGHT_KINDS,
      renderStepColumn: wfRenderStepColumn,
      renderProgressDock: wfRenderProgressDock,
      progressLabel: wfProgressLabel,
      progressFillWidth: wfProgressFillWidth,
     // the second line's arithmetic and its duration formatter.
      progressTiming: wfProgressTiming,
      progressDurationText: wfProgressDurationText,
      deriveStatus: wfDeriveStepStatus,
      applyDerivedStatuses: wfApplyDerivedStatuses,
      renderPanel: wfRenderPanel,
     // the conversation-view seat's marker wrapper (the rule that hides the HOST composer is
     // keyed on it, so both halves of that contract are driven here).
      viewSeatRoot: wfViewSeatRoot,
      viewSeatMarker: WF_VIEW_SEAT_MARKER,
     // the inject column — the state machine, the request and the renderer.
      injectState: wfInjectState,
      injectCanSend: wfInjectCanSend,
      injectText: wfInjectText,
      injectOutcome: wfInjectOutcome,
      injectAckDone: wfInjectAckDone,
      injectCounter: wfInjectCounter,
      postSteer: wfPostSteer,
     // the revoke half of the same column — its state machine, its request and the
     // host's-answer → outcome rule.
      revokeState: wfRevokeState,
      revokeOutcome: wfRevokeOutcome,
      postUnsteer: wfPostUnsteer,
     // the history shaping and the "needs confirm" derivation.
      injectRows: wfInjectRows,
      confirmRows: wfConfirmRows,
      confirmTitle: wfConfirmTitle,
      renderHotInject: wfRenderHotInject,
     // the persistent dock, its renderer and its two pure inputs.
      renderInjectDock: wfRenderInjectDock,
      pendingInjectCount: wfPendingInjectCount,
      injectStatusKey: wfInjectStatusKey,
      canonicalStatus: wfCanonicalStatus,
      normalizeStepTitle: wfNormalizeStepTitle,
      renderFlowColumn: wfRenderFlowColumn,
      renderNodeCard: wfRenderNodeCard,
      flowGroups: wfFlowGroups,
      flowItems: wfFlowItems,
      flowWindow: wfFlowWindow,
      flowNodeCount: wfFlowNodeCount,
      flowUiFor: wfFlowUiFor,
      flowToggleGroup: wfFlowToggleGroup,
      flowExpandAll: wfFlowExpandAll,
      flowSelectNode: wfFlowSelectNode,
      flowClearSelection: wfFlowClearSelection,
      flowToggleBranch: wfFlowToggleBranch,
     // the chain's branch derivation, its two halves (stroke path + the round icon), the
     // opened category view and the per-step toggle that drives it.
      flowToggleChain: wfFlowToggleChain,
      chainBranches: wfChainBranches,
      chainActionKind: wfChainActionKind,
      chainStrokePath: wfChainStrokePath,
      chainDetailNode: wfChainDetailNode,
      renderChainBranch: wfRenderChainBranch,
      renderChainDetail: wfRenderChainDetail,
      chainCurve: wfChainCurve,
      chainGeometry: wfChainGeometry,
      chainApply: wfChainApply,
      chainCards: wfChainCards,
      renderChain: wfRenderChain,
      renderBranches: wfRenderBranches,
      branchHue: wfBranchHue,
      branchStatus: wfBranchStatus,
      branchBadgeKey: wfBranchBadgeKey,
      branchRowStatus: wfBranchRowStatus,
      branchIsCollapsed: wfBranchIsCollapsed,
      nodeCategory: wfNodeCategory,
      nodeTitleParts: wfNodeTitleParts,
      nodeStatus: wfNodeStatus,
      nodeMetaBits: wfNodeMetaBits,
     // node detail, step detail, the clipboard and the two document bindings.
      renderNodeDetail: wfRenderNodeDetail,
      renderStepDetail: wfRenderStepDetail,
      renderStepHead: wfRenderStepHead,
      stepDetailOpen: wfStepDetailOpen,
      stepDetailToggle: wfStepDetailToggle,
      stepDetailOpenFor: wfStepDetailOpenFor,
     // the ONE disclosure triangle (a real <button>) and its glyph.
      tri: wfTri,
      triGlyph: wfTriGlyph,
      detailCategory: wfDetailCategory,
      detailAction: wfDetailAction,
      detailPath: wfDetailPath,
      detailFileGroups: wfDetailFileGroups,
      copyText: wfCopyText,
      copyFallback: wfCopyFallback,
      copyWithFeedback: wfCopyWithFeedback,
      setCopyState: wfSetCopyState,
      escapeIntent: wfEscapeIntent,
      bindEscape: wfBindEscape,
      bindDetailNudge: wfBindDetailNudge,
      stepReport: wfStepReport,
      buildStepDetail: wfBuildStepDetail,
      formatDuration: wfFormatDuration,
      formatClock: wfFormatClock,
      makeSay: wfMakeSay,
      sessionIdFromSnapshot: wfSessionIdFromSnapshot,
      pollUrl: wfPollUrl,
      pollOnce: wfPollOnce,
      parsePrefs: wfParsePrefs,
      sanitizePrefs: wfSanitizePrefs,
      applyPrefsPatch: wfApplyPrefsPatch,
      loadPrefs: wfLoadPrefs,
      savePrefs: wfSavePrefs,
      defaultPrefs: wfDefaultPrefs,
     // settings, snapshot construction and the two export deliveries.
      renderSettings: wfRenderSettings,
      defaultSettings: wfDefaultSettings,
      sanitizeSettings: wfSanitizeSettings,
      settingsOf: wfSettingsOf,
      settingOptionLabel: wfSettingOptionLabel,
      buildSnapshot: wfBuildSnapshot,
      snapshotMarkdown: wfSnapshotMarkdown,
      snapshotJson: wfSnapshotJson,
      snapshotText: wfSnapshotText,
      snapshotFileName: wfSnapshotFileName,
      snapshotTag: wfSnapshotTag,
      copySnapshot: wfCopySnapshot,
      snapshotDownload: wfSnapshotDownload,
      releaseSnapshotUrls: wfReleaseSnapshotUrls,
      snapshotUrlCount: wfSnapshotUrlCount,
     // the living layer, its geometry and the two attributes it reads.
      renderFlowEffects: wfRenderFlowEffects,
      fxCurve: wfFxCurve,
      fxGeometry: wfFxGeometry,
      fxBounds: wfFxBounds,
      fxApply: wfFxApply,
      fxBind: wfFxBind,
      fxSignature: wfFxSignature,
      fxQuery: wfFxQuery,
      motionMode: wfMotionMode,
      sessionRunning: wfSessionRunning,
      renderLive: wfRenderLive,
      css: function () {
        return WF_CSS;
      },
      dicts: function () {
        return { zh: DICT_ZH, en: DICT_EN };
      },
      constants: function () {
        return {
          styleId: WF_STYLE_ID,
          prefsKey: WF_PREFS_KEY,
          pollVisible: WF_POLL_VISIBLE,
          pollHidden: WF_POLL_HIDDEN,
          defaultWidth: WF_DEFAULT_WIDTH,
          zIndex: WF_Z_INDEX,
          stepGap: WF_STEP_GAP,
          stepRail: WF_STEP_RAIL,
          stepLink: WF_STEP_LINK,
          stepMany: WF_STEP_MANY,
          flowCap: WF_FLOW_CAP,
          branchShown: WF_BRANCH_SHOWN,
          branchLink: WF_BRANCH_LINK,
          groupMin: WF_GROUP_MIN,
          fxRainbow: WF_FX_RAINBOW,
          fxBrand: WF_FX_BRAND,
          curveMode: WF_CURVE_MODE,
          fxStroke: WF_FX_STROKE,
          fxGlow: WF_FX_GLOW,
          fxDash: WF_FX_DASH,
          fxSpeed: WF_FX_SPEED,
          livePeriod: WF_LIVE_PERIOD,
          pulsePeriod: WF_PULSE_PERIOD,
          pulseMs: WF_PULSE_MS,
          idleAfterMs: WF_IDLE_AFTER_MS,
          fxMinGap: WF_FX_MIN_GAP,
     // the chain's distances, so the self-test can assert the >= 28 px air, the 20–24 px
     // icon, and the fact that the link never overflows the gap it is drawn in.
          chainGap: WF_CHAIN_GAP,
          chainLink: WF_CHAIN_LINK,
          chainPad: WF_CHAIN_PAD,
          chainBranch: WF_CHAIN_BRANCH,
          chainIcon: WF_CHAIN_ICON,
          chainRing: WF_CHAIN_RING,
          chainKinds: WF_CHAIN_KINDS,
          chainSlots: WF_CHAIN_LINK_SLOTS,
          liveDots: WF_LIVE_DOTS,
          palettes: WF_PALETTES,
          motions: WF_MOTIONS,
          detailModes: WF_DETAIL_MODES,
          nodeLimits: WF_NODE_LIMITS,
          snapshotSchema: WF_SNAPSHOT_SCHEMA,
     // the single page's distances, the right page's kinds and its slot budget, so the
     // self-test asserts the SAME numbers the stylesheet is built from.
          pagePad: WF_PAGE_PAD,
          satellite: WF_SATELLITE,
          satLink: WF_SAT_LINK,
          unitGap: WF_UNIT_GAP,
          unitLink: WF_UNIT_LINK,
          sideSlots: WF_SIDE_SLOTS,
          sideFiles: WF_SIDE_FILES,
          rightKinds: WF_RIGHT_KINDS,
        };
      },
      component: WorkflowMapPanel,
    };

    exports.inject = ["slots", "locale"];
    exports.apply = apply;
    // Test seam for tools/selftest-panel.mjs; the app reads inject/apply only.
    exports.__test = __test;
    return exports;
  },
});
