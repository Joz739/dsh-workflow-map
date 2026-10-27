/**
 * pulse.js — 「正在干的事」的呼吸/闪烁层（step-10）。
 *
 * 三件事，全部可以脱离浏览器测：
 *   wfMotionMode   matchMedia 的包装 → "css" | "static"（系统开启「减少动效」时 static）
 *   wfSessionRunning  会话是否真的在跑：宿主给了布尔值就用它，否则按「有活动节点 / 最近有事件」推断
 *   wfRenderLive  「● 正在 …」小挂件：6 px 呼吸点 + 三点省略号（纯 markup，`h`/`say` 注入）
 *
 * 为什么 idle 判定要有三条腿：宿主视图现在有了 `view.running`（step-10 由 `turn/start` /
 * `turn/end` 折叠而来），它是最准的那条；但旧检查点、以及尚未跑到 turn 事件的老视图里没有它，
 * 所以还要两层兜底——「有节点正在调用」（active.nodeId）和「刚刚还有事件」（asOf 距今 <
 * WF_IDLE_AFTER_MS）。一个布尔值优先，后两条只在它缺席时生效。分步的 running 状态在 turn
 * 结束后不会被 PAE 立刻改写，所以它永远不参与这个判断。
 *
 * 纯函数、无 import/export：由 tools/build-client.mjs 内联进 client.js（单文件浏览器半）。
 */

/** DSH 思考指示的节奏：1.2 s 一个呼吸周期（与 step-07/08 的 1.6 s 状态点故意不同：
 *  1.2 s 只给「当前正在做的事」，1.6 s 给「进行中的一行」，两者同屏也不会同步成一闪一闪）。 */
var WF_PULSE_PERIOD = "1.2s";
var WF_PULSE_MS = 1200;

/** 最后一个事件距今超过这么久、且没有活动节点 ⇒ 会话空闲。15 s 覆盖一次工具调用的正常间隔，
 *  又能在用户回完话后很快让动画停下来（不持续占 GPU）。 */
var WF_IDLE_AFTER_MS = 15000;

/** 省略号的点数（三个点，逐个点亮）。 */
var WF_LIVE_DOTS = 3;

/**
 * 系统的「减少动效」开关。`matchMediaFn` 注入而不是直接读 window，Node 里的自测才能
 * 同时覆盖「有 matchMedia / 没有 matchMedia / matchMedia 抛错」三种环境。
 */
function wfMotionMode(matchMediaFn) {
  if (typeof matchMediaFn !== "function") return "css";
  try {
    var query = matchMediaFn("(prefers-reduced-motion: reduce)");
    return query && query.matches === true ? "static" : "css";
  } catch (error) {
    // 一个抛错的 matchMedia 不是「用户要求减少动效」，只能是环境不支持 → 照常动。
    return "css";
  }
}

/**
 * 会话是否在跑。
 *   1. 宿主的 `view.running`（step-10 的 turn 标志）→ 就是它，其余三条都不再参与。
 *   2. 有活动节点（active.nodeId） → 正在调用，无论事件多久以前。
 *   3. 最后一个事件在 WF_IDLE_AFTER_MS 之内 → 正在干活。
 *   4. 其余 → 空闲。
 * `nowMs` 不可用时（离线自测、模拟时钟缺失）返回「在跑」：宁可多动一帧，也不要把一个
 * 正在工作的会话误判成空闲（那会让曲线和外框看起来坏掉）。
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

/** 组件用的 motion 模式：随系统偏好变化更新（卸载时摘掉监听）。 */
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
    // 老 Safari 只有 addListener；两个都试，能摘就摘。
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
 * 「● 正在 …」——当前活动的标记。`scope` 只是给测试/样式用的标签（step / node），
 * 三个点用独立元素而不是 animation 里的 content：content 在 keyframes 里是离散跳变，
 * 而且无头浏览器里读不到中间态。
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
