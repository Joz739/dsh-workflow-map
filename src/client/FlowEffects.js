/**
 * FlowEffects.js — 彩色流光曲线层（step-10）。
 *
 * 面板里最有识别度的一条：**正在进行的那个分步**（左列发光外框）与它**正在进行的那个流程节点**
 * （右列发光外框）之间，有一条彩虹流光曲线连着。
 *
 * 结构：
 *   wfFxRound / wfFxBounds      几何小工具（四舍五入到 0.01 px、把 DOMRect 归一化）
 *   wfFxCurve                   纯几何：两点 → 三次贝塞尔 `M x1 y1 C …`
 *   wfFxGeometry                纯几何：两张卡片 + 视口 → {visible, d, from, to, reason}
 *   wfFxQuery / wfFxApply       DOM：找元素、算、把 `d`/端点写回 SVG，并留 `data-endpoints` 证据
 *   wfFxBind                    DOM：ResizeObserver + scroll(capture) + resize，rAF 节流重算
 *   wfUseFlowEffects            React 封装：每次「视觉签名」变化就重建一次绑定
 *   wfRenderFlowEffects         纯 markup：<svg> + 两个渐变 + 两条路径 + 两个端点圆
 *   wfFxSignature               模型 → 一句短签名（变了才重绑，不是每个 800 ms 轮询都重绑）
 *
 * 为什么用「绝对定位 + 无 viewBox 的 SVG」：曲线要在两列之间的空隙里画，而两列各自是
 * 独立滚动的。SVG 铺满 .wf-body（position:relative），坐标 = 卡片 rect − SVG rect，
 * 所以不需要任何 viewBox 缩放，1 用户单位就是 1 px，端点误差只来自一次取整。
 *
 * 端点规矩：**两张卡片都完整落在各自滚动视口内**才画曲线，否则隐藏（data-visible=false）。
 * 与其把端点夹到视口边缘（那就不再「贴合卡片边缘」，验收的 2 px 容差也没意义），
 * 不如诚实地不画。
 *
 * 纯函数、无 import/export：由 tools/build-client.mjs 内联进 client.js（单文件浏览器半）。
 */

/** 两列之间至少要留这么宽的空隙才画得下一条曲线（再窄就是两列贴在一起了）。 */
var WF_FX_MIN_GAP = 10;

/** 曲线在两端各留的余量：控制点的水平偏移按空隙宽度取 45 %，夹在这个区间。 */
var WF_FX_BOW_MIN = 8;
var WF_FX_BOW_MAX = 140;

/** 写进 SVG 的占位端点（未测量时两个圆藏在画布外，不闪一下）。 */
var WF_FX_OFFSCREEN = -99;

/** 排队后最多等这么久就从定时器量一次（rAF 永不触发的环境，例如无头 --dump-dom）。 */
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

/** DOMRect（或任何 {left, top, width, height}）→ 归一化矩形；不可用则 null。 */
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

/** 矩形是否完整落在视口里（允许 0.5 px 的取整误差，不允许露出半张卡片）。 */
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
 * 两点之间的三次贝塞尔。控制点只在水平方向偏移（经典的「S 形连线」）：
 *   M x1 y1 C x1+bow y1, x2-bow y2, x2 y2
 * 空隙太窄（< WF_FX_MIN_GAP）或坐标不合法 → null，调用方据此隐藏整层。
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
 * 两张卡片 + 各自滚动视口 → 这一帧该不该画、画在哪。
 *
 * `origin` 是 SVG 的 rect（不是 .wf-body 的 border box：绝对定位元素的包含块是 padding box，
 * 用 SVG 自己的 rect 当原点，坐标才和它内部的用户坐标系一一对应）。
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

/** 一次查询拿全：容器、SVG、两张卡片、两个滚动视口。缺任何一个都不猜。 */
function wfFxQuery(doc) {
  if (!doc || typeof doc.querySelector !== "function") return null;
  var body = doc.querySelector('[data-dsh-workflow-map="body"]');
  if (!body) return null;
  return {
    body: body,
    svg: body.querySelector('[data-dsh-workflow-map="fx"]'),
    // 左列：正在进行的那个分步卡片（li 带 data-status，卡片是它的直接子元素）
    stepCard: body.querySelector('.wf-step-item[data-status="running"] > .wf-step-card'),
    // 右列：正在调用的那个节点卡片（同一个 li 上的 data-status 是唯一的 running）
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
 * The shape is the step's 「竖向中点 + 水平外扩」: the path leaves the upper card's bottom edge and
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

  // The sideways bow (「水平外扩」): a share of the horizontal offset plus a fixed 10 px, clamped so
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
 * 量一次并把结果写进 DOM。返回几何结果（tool 与自测都读它）。
 * 写进 DOM 的三样东西：path 的 `d`、两个端点圆的 cx/cy、以及 `data-visible` /
 * `data-endpoints`（JSON，供无头浏览器自检直接取证，不需要猜）。
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
 * 把测量挂到页面生命周期上：窗口 resize、任意滚动（capture，两列的内部滚动都能收到）、
 * 以及容器尺寸变化（ResizeObserver）。全部走 rAF 节流，一帧最多算一次。
 *
 * 返回 { refresh, schedule, destroy, measures }：`refresh` 同步量一次，`measures` 回读
 * 已经量过多少次（无头自检用它证明「滚动/缩放之后真的重算了」，而不是只有首帧）。
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

  // capture=true：两列各自是 overflow:auto 的内部滚动容器，scroll 不冒泡到 window。
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

/** 视觉签名：只有「该重算的东西」变了才重绑（轮询导致的同形模型不会每 800 ms 抖一次）。 */
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

/** 组件里的挂载点：签名变化 → 重建绑定；卸载 → 全部摘掉（不留监听器）。 */
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
 * 曲线层本体。放在 .wf-body 里（两列之后、绝对定位覆盖整个 body），
 * 未测量前 data-visible="false"（CSS 里 display:none），量到才显形。
 *
 * 渐变用 CSS 类给 stop 上色（stop-color 在 Chrome 里是 CSS 属性）：
 * React 与自测里的假 `h` 都能原样通过，不需要额外转换属性名。
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
