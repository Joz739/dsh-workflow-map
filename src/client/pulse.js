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
  // The clock is the second witness. view.running is the turn flag, and a turn that never
  // received its turn/end event (interrupt, crash, a compacted session) leaves it true forever.
  // Once the last folded event is older than the idle window the session is not working,
  // whatever the flag says.
  if (view && typeof view.running === "boolean") {
    if (view.running !== true) return false;
    var flagAsOf = wfFinite(view.asOf);
    var flagNow = wfFinite(nowMs);
    if (flagAsOf !== null && flagAsOf > 0 && flagNow !== null && flagNow - flagAsOf >= WF_IDLE_AFTER_MS) return false;
    return true;
  }
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
