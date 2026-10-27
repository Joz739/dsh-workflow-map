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
 Flush edges on purpose : a 12 px rounded box floating inside the centre column
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
 the dock is a two-line block — line 1 is the 6 px track + the percent, line 2
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
 the line moves 3 px right with the card's new 20 px triangle band, so it still
     hangs off the ring's centre (the band is 20 px, the ring starts 20 + 8 px padding).
 the column now carries the chain's `gap`, so the connector must NOT add a margin —
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
 same ones wfBranchHue palette covers). Only the running node renders this block,
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
    ".wf-root[data-palette='brand'] .wf-node[data-status='running']::after," +
    ".wf-root[data-palette='brand'] .wf-unit[data-status='running']>.wf-unit-center>.wf-unit-card::after{background:linear-gradient(90deg," +
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
