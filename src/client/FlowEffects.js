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
 * how many node-to-node links the chain layer can draw at once.
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
/* the chain's curve channel                                          */
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
    // the chain's node-to-node links live in the flow list and are measured from the SAME
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
 * the chain layer: one <svg> INSIDE the flow list, and one <path> per link slot.
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
