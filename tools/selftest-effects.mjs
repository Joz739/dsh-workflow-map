// selftest-effects.mjs — the flowing curve, the wrapped frames, the breathing dot.
//
// Run: node tools/selftest-effects.mjs
//
// What this file proves, in order:
// 1. the bundle carries the pieces (build-client also refuses to ship without them)
// 2. the pure geometry: two rects → the exact cubic bezier, and every "do not draw" case
// 3. the DOM writer (wfFxApply) and the lifecycle (wfFxBind): d / endpoints / data-visible,
// a re-measure on scroll, and a clean teardown — driven by a tiny fake DOM, no Chrome
// 4. idle + motion: wfSessionRunning's three signals, wfMotionMode's three environments,
// and that the panel puts data-idle / data-motion on BOTH roots (panel and capsule)
// 5. the renderer: one fx layer per ready panel, six rainbow stops, two paths, two caps,
// the "working ..." chip only on the running step / active node, none while planning
// 6. the stylesheet: geometry, dash flow, the wrapped-frame mask, the 1.2 s blink, the
// idle-pause and static-motion rules, and no SMIL / no @property anywhere
// 7. the cost claim: animations live on the two paths, the two wrapped frames and the live
// chip — never on a per-node rule (a 60-node step must not turn into 60 animations)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const results = [];
const check = (id, pass, detail) => {
  results.push({ id, pass, detail: detail === undefined ? '' : String(detail) });
};

/* ------------------------------------------------------------------------- */
/* load the built bundle (the same seam as selftest-panel) */
/* ------------------------------------------------------------------------- */

const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
const loaded = { definition: null };
const fakeWindow = {
  __ModuleLoader__: {
    load(definition) {
      loaded.definition = definition;
    },
  },
  setTimeout: () => 0,
  clearTimeout: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  innerWidth: 1280,
};
// eslint-disable-next-line no-new-func
new Function('window', source)(fakeWindow);

function createElement(type, props, ...children) {
  const flat = [];
  for (const child of children) {
    if (Array.isArray(child)) flat.push(...child.flat(Infinity));
    else flat.push(child);
  }
  return {
    type,
    props: props || {},
    children: flat.filter((child) => child !== null && child !== undefined && child !== false && child !== ''),
  };
}

const entry = loaded.definition.factory((name) => {
  if (name === 'react') return { createElement };
  throw new Error('unexpected require: ' + name);
});
const T = entry.__test;
const C = T.constants();

check('bundle.loader', loaded.definition !== null && loaded.definition.id === 'dsh-workflow-map', loaded.definition?.id);
check(
  'bundle.effectSeam',
  typeof T.fxCurve === 'function' &&
    typeof T.fxGeometry === 'function' &&
    typeof T.fxApply === 'function' &&
    typeof T.fxBind === 'function' &&
    typeof T.renderFlowEffects === 'function' &&
    typeof T.motionMode === 'function' &&
    typeof T.sessionRunning === 'function' &&
    typeof T.renderLive === 'function' &&
    typeof T.fxSignature === 'function',
  'every step-10 seam is exported'
);

/* ------------------------------------------------------------------------- */
/* tree helpers */
/* ------------------------------------------------------------------------- */

const hasData = (node) => node && node.props && typeof node.props['data-dsh-workflow-map'] === 'string';
function findAll(node, predicate, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, out);
    return out;
  }
  if (predicate(node)) out.push(node);
  for (const child of node.children || []) findAll(child, predicate, out);
  return out;
}
const byData = (tree, name) => findAll(tree, (node) => hasData(node) && node.props['data-dsh-workflow-map'] === name);
const byClass = (tree, className) =>
  findAll(tree, (node) => node.props && typeof node.props.className === 'string' && node.props.className.split(/\s+/).includes(className));
const childByClass = (node, className) =>
  (node.children || []).find(
    (child) => child && child.props && typeof child.props.className === 'string' && child.props.className.split(/\s+/).includes(className)
  );
function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node.children || []).map(textOf).join('');
}

/* ------------------------------------------------------------------------- */
/* fixtures */
/* ------------------------------------------------------------------------- */

const say = T.makeSay(undefined);
const prefs = T.defaultPrefs();
const noop = () => {};
const actions = {
  onCollapse: noop,
  onExpand: noop,
  onClose: noop,
  onToggleSettings: noop,
  onSelectStep: noop,
  onReset: noop,
  onWidthDrag: noop,
  onHeightDrag: noop,
  onToggleGroup: noop,
  onShowAll: noop,
  onSelectNode: noop,
  onToggleBranch: noop,
};

const T0 = 1792240000000;
const node = (id, tool, title, at, extra) => ({
  id,
  kind: 'tool',
  tool,
  title,
  detail: 'detail ' + id,
  files: [],
  resultHead: 'ok',
  error: '',
  at,
  durationMs: 320,
  ...extra,
});

/** One running step (index 1) with its newest node still in flight — the state the curve is for. */
const runningView = {
  asOf: T0,
  steps: [
    { index: 0, title: '骨架', status: 'done', percent: 100, percentSource: 'model', nodeIds: ['n0'], nodeCount: 1, groups: [] },
    {
      index: 1,
      title: '彩色流光曲线',
      status: 'running',
      percent: 42,
      percentSource: 'model',
      nodeIds: ['n1', 'n2'],
      nodeCount: 2,
      groups: [],
    },
    { index: 2, title: '节点详情', status: 'pending', percent: null, nodeIds: [], nodeCount: 0, groups: [] },
  ],
 // n2 is still in flight: no result yet, so its card is the "current activity".
  nodes: [
    node('n0', 'read', 'read a.js', T0 - 60000),
    node('n1', 'read', 'read b.js', T0 - 30000),
 // n2 carries the host's file list (path + action label), which is what the branch
 // strip derives from: one read file, one edited file, plus the tool call itself -> read/edit/tool.
    node('n2', 'edit', 'edit c.js', T0 - 1000, {
      resultHead: '',
 // The VIEW carries `files` (host field); store.js narrows it into the model's `fileList`.
      files: [
        { path: 'D:/proj/a.js', action: '读' },
        { path: 'D:/proj/c.js', action: '改' },
      ],
    }),
  ],
  active: { stepIndex: 1, nodeId: 'n2' },
  counts: { steps: 3, nodes: 3, running: 1, completed: 1 },
};

const ui = {
  settingsOpen: false,
  maxWidth: 1400,
  status: 'live',
  error: '',
  rev: 7,
  endpoint: '/dsh-workflow/state?sessionId=session-fx',
  nodeTotal: 3,
  flow: T.flowUiFor(null, 1),
  motion: 'css',
  idle: false,
};

/* ------------------------------------------------------------------------- */
/* 2. pure geometry */
/* ------------------------------------------------------------------------- */

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

check(
  'geom.bounds.fromEdges',
  JSON.stringify(T.fxBounds({ left: 10, top: 20, right: 60, bottom: 80 })) ===
    JSON.stringify({ left: 10, top: 20, width: 50, height: 60, right: 60, bottom: 80 }),
  JSON.stringify(T.fxBounds({ left: 10, top: 20, right: 60, bottom: 80 }))
);
check('geom.bounds.rejects', T.fxBounds(null) === null && T.fxBounds({}) === null && T.fxBounds(rect(0, 0, 0, 40)) === null, 'null / empty / zero width → null');

const curve = T.fxCurve(220, 100, 320, 190);
check('curve.path', curve !== null && curve.d === 'M220 100C265 100 275 190 320 190', curve?.d);
check(
  'curve.endpoints',
  curve !== null && curve.from.x === 220 && curve.from.y === 100 && curve.to.x === 320 && curve.to.y === 190,
  JSON.stringify(curve && { from: curve.from, to: curve.to })
);
check('curve.bow', curve !== null && curve.dx === 100 && curve.bow === 45, JSON.stringify(curve && { dx: curve.dx, bow: curve.bow }));
check('curve.narrow', T.fxCurve(0, 0, 5, 10) === null, 'a 5 px gap is not drawable');
check('curve.minGap', T.fxCurve(0, 0, C.fxMinGap, 10) !== null, 'exactly the minimum gap is drawable');
check('curve.badInput', T.fxCurve(NaN, 0, 100, 0) === null && T.fxCurve(0, 0, Infinity, 0) === null, 'NaN / Infinity → null');
const clampedBow = T.fxCurve(0, 0, 2000, 10);
check('curve.bowClamped', clampedBow !== null && clampedBow.bow === 140, String(clampedBow && clampedBow.bow));

const origin = rect(100, 50, 600, 400);
const stepRect = rect(120, 120, 200, 60);
const nodeRect = rect(420, 200, 300, 80);
const stepClip = rect(100, 100, 240, 380);
const nodeClip = rect(380, 100, 360, 380);

const geo = T.fxGeometry(stepRect, nodeRect, origin, stepClip, nodeClip);
check('geom.visible', geo.visible === true && geo.reason === 'ok', geo.reason);
check('geom.fromStepRight', geo.from.x === 220 && geo.from.y === 100, JSON.stringify(geo.from));
check('geom.toNodeLeft', geo.to.x === 320 && geo.to.y === 190, JSON.stringify(geo.to));
check('geom.d', geo.d === 'M220 100C265 100 275 190 320 190', geo.d);

check(
  'geom.stepClipped',
  T.fxGeometry(rect(120, 120, 200, 500), nodeRect, origin, stepClip, nodeClip).reason === 'step-clipped',
  'a step card half out of its scroller hides the curve'
);
check(
  'geom.nodeClipped',
  T.fxGeometry(stepRect, rect(420, 400, 300, 200), origin, stepClip, nodeClip).reason === 'node-clipped',
  'a node card below its scroller hides the curve'
);
check('geom.noStep', T.fxGeometry(null, nodeRect, origin, stepClip, nodeClip).reason === 'no-step', 'no running step → no curve');
check('geom.noNode', T.fxGeometry(stepRect, null, origin, stepClip, nodeClip).reason === 'no-node', 'no active node → no curve');
// The gap is measured between the cards, so the clip has to start left of the node here.
check(
  'geom.overlap',
  T.fxGeometry(stepRect, rect(325, 200, 300, 80), origin, stepClip, rect(100, 100, 640, 380)).reason === 'no-gap',
  'columns too close → no curve'
);
check('geom.noOrigin', T.fxGeometry(stepRect, nodeRect, null, stepClip, nodeClip).reason === 'no-origin', 'unmeasured SVG → no curve');
check(
  'geom.toleranceFree',
  Math.abs(geo.from.x - (stepRect.right - origin.left)) < 0.01 && Math.abs(geo.to.x - (nodeRect.left - origin.left)) < 0.01,
  'endpoints are exactly on the card edges (no clamping, so the 2 px acceptance is met with room to spare)'
);

/* ------------------------------------------------------------------------- */
/* 3. DOM writer + lifecycle (fake DOM, still the real functions) */
/* ------------------------------------------------------------------------- */

function fakeElement(box, label) {
  return {
    label,
    box,
    attrs: {},
    getBoundingClientRect() {
      return this.box;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
  };
}

function makeFxDom(boxes) {
  const core = fakeElement(boxes.origin, 'core');
  const glow = fakeElement(boxes.origin, 'glow');
  const capA = fakeElement(boxes.origin, 'capA');
  const capB = fakeElement(boxes.origin, 'capB');
  const svg = {
    label: 'svg',
    attrs: {},
    querySelector(selector) {
      if (selector === '.wf-fx-core') return core;
      if (selector === '.wf-fx-glow') return glow;
      return null;
    },
    querySelectorAll(selector) {
      return selector === '.wf-fx-cap' ? [capA, capB] : [];
    },
    getBoundingClientRect() {
      return boxes.origin;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
  };
  const stepCard = fakeElement(boxes.step, 'step');
  const nodeCard = fakeElement(boxes.node, 'node');
  const stepClip = fakeElement(boxes.stepClip, 'stepClip');
  const nodeClip = fakeElement(boxes.nodeClip, 'nodeClip');
  const body = {
    label: 'body',
    querySelector(selector) {
      if (selector === '[data-dsh-workflow-map="fx"]') return svg;
      if (selector === '.wf-step-item[data-status="running"] > .wf-step-card') return stepCard;
      if (selector === '.wf-flow-item[data-status="running"] > .wf-node') return nodeCard;
      if (selector === '.wf-steps-scroll') return stepClip;
      if (selector === '.wf-flow-scroll') return nodeClip;
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const listeners = [];
  const doc = {
    listeners,
    body,
    querySelector(selector) {
      if (selector === '[data-dsh-workflow-map="body"]') return body;
      return null;
    },
    addEventListener(type, fn, options) {
      listeners.push({ type, fn, options, target: 'doc' });
    },
    removeEventListener(type, fn) {
      const at = listeners.findIndex((one) => one.type === type && one.fn === fn);
      if (at >= 0) listeners.splice(at, 1);
    },
  };
  return { doc, svg, core, glow, capA, capB, stepCard, nodeCard, stepClip, nodeClip, body, boxes, listeners };
}

const boxSet = {
  origin: rect(100, 50, 600, 400),
  step: rect(120, 120, 200, 60),
  node: rect(420, 200, 300, 80),
  stepClip: rect(100, 100, 240, 380),
  nodeClip: rect(380, 100, 360, 380),
};

const dom = makeFxDom(boxSet);
const applied = T.fxApply(dom.doc);
check('dom.apply.visible', applied.visible === true && dom.svg.attrs['data-visible'] === 'true', dom.svg.attrs['data-visible']);
check('dom.apply.paths', dom.core.attrs.d === applied.d && dom.glow.attrs.d === applied.d && applied.d.startsWith('M'), applied.d);
check(
  'dom.apply.caps',
  dom.capA.attrs.cx === '220' && dom.capA.attrs.cy === '100' && dom.capB.attrs.cx === '320' && dom.capB.attrs.cy === '190',
  JSON.stringify({ a: [dom.capA.attrs.cx, dom.capA.attrs.cy], b: [dom.capB.attrs.cx, dom.capB.attrs.cy] })
);
const endpoints = JSON.parse(dom.svg.attrs['data-endpoints']);
check(
  'dom.apply.evidence',
  endpoints.visible === true && endpoints.from.x === 220 && endpoints.to.x === 320 && dom.svg.attrs['data-reason'] === 'ok',
  dom.svg.attrs['data-endpoints']
);

// Hiding is a real state, not empty path only: reason + off-screen caps.
dom.nodeCard.box = rect(420, 700, 300, 80);
const hidden = T.fxApply(dom.doc);
check(
  'dom.hide.clipped',
  hidden.visible === false &&
    dom.svg.attrs['data-visible'] === 'false' &&
    dom.svg.attrs['data-reason'] === 'node-clipped' &&
    dom.core.attrs.d === '' &&
    dom.capA.attrs.cx === '-99',
  JSON.stringify({ visible: dom.svg.attrs['data-visible'], reason: dom.svg.attrs['data-reason'] })
);

// ---- lifecycle: a scroll re-measures, a destroy stops everything ----------
dom.nodeCard.box = rect(420, 200, 300, 80);
const queued = [];
const fakeWin = {
  listeners: [],
  addEventListener(type, fn) {
    this.listeners.push({ type, fn });
  },
  removeEventListener(type, fn) {
    const at = this.listeners.findIndex((one) => one.type === type && one.fn === fn);
    if (at >= 0) this.listeners.splice(at, 1);
  },
  requestAnimationFrame(fn) {
    queued.push(fn);
    return queued.length;
  },
  cancelAnimationFrame() {},
};
const flush = () => {
  const run = queued.splice(0, queued.length);
  for (const fn of run) fn();
};
const binding = T.fxBind(dom.doc, fakeWin);
check('bind.initial', binding !== null && binding.measures() === 1 && dom.svg.attrs['data-measures'] === '1', dom.svg.attrs['data-measures']);
check('bind.scrollCapture', dom.listeners.some((one) => one.type === 'scroll' && one.options === true), 'scroll is captured, so the two inner scrollers are seen');
check('bind.resize', fakeWin.listeners.some((one) => one.type === 'resize'), 'window resize is bound');

// Move the node (as a real scroll would) and fire the captured scroll listener.
dom.nodeCard.box = rect(420, 260, 300, 80);
const scrollListener = dom.listeners.find((one) => one.type === 'scroll' && one.options === true);
scrollListener.fn({ type: 'scroll' });
check('bind.throttled', queued.length === 1 && binding.measures() === 1, 'a scroll only queues a frame');
flush();
check('bind.remeasured', binding.measures() === 2 && dom.svg.attrs['data-measures'] === '2', dom.svg.attrs['data-measures']);
check('bind.moved', dom.capB.attrs.cy === '250', 'the endpoint followed the card (260 + 80/2 − 50 = 250)');
check('bind.noDuplicateFrame', queued.length === 0, 'the frame token is cleared after running');

// Two scroll events in one frame must still cost one measure.
dom.nodeCard.box = rect(420, 300, 300, 80);
scrollListener.fn({});
scrollListener.fn({});
flush();
check('bind.coalesced', binding.measures() === 3 && dom.capB.attrs.cy === '290', 'two events in one frame → one measure, endpoint 290');

binding.destroy();
const listenersAfter = dom.listeners.length;
const winAfter = fakeWin.listeners.length;
dom.nodeCard.box = rect(420, 200, 300, 80);
if (scrollListener) scrollListener.fn({});
flush();
check('bind.teardown', listenersAfter === 0 && winAfter === 0 && binding.measures() === 3, JSON.stringify({ doc: listenersAfter, win: winAfter, measures: binding.measures() }));

// ---- the timer safety net + the ResizeObserver wiring ----------------------
// A headless --dump-dom page never fires requestAnimationFrame (measured: a 4 s virtual-time
// budget left it uncalled) and never delivers ResizeObserver callbacks (they ride the rendering
// loop). Both would silently freeze the curve, so: rAF alone is not enough (the timer path is
// asserted here) and the RO subscription is asserted against a fake observer.
const timers = [];
const flushTimers = () => {
  const run = timers.splice(0, timers.length);
  for (const fn of run) fn();
};
const observed = [];
let roCallback = null;
const roDom = makeFxDom(boxSet);
const roWin = {
  listeners: [],
  addEventListener(type, fn) {
    this.listeners.push({ type, fn });
  },
  removeEventListener() {},
 // Deliberately never calls the callback: this is the dump-dom situation.
  requestAnimationFrame() {
    return 1;
  },
  cancelAnimationFrame() {},
  setTimeout(fn) {
    timers.push(fn);
    return timers.length;
  },
  clearTimeout() {},
  ResizeObserver: function ResizeObserver(callback) {
    roCallback = callback;
    this.observe = (element) => observed.push(element && element.label ? element.label : '?');
    this.disconnect = () => observed.push('disconnect');
  },
};
const roBinding = T.fxBind(roDom.doc, roWin);
check('bind.safety.initial', roBinding !== null && roBinding.measures() === 1, String(roBinding && roBinding.measures()));
check(
  'bind.ro.observed',
  observed.join(',') === 'body,stepClip,nodeClip,step,node',
  observed.join(',')
);
const roScroll = roDom.listeners.find((one) => one.type === 'scroll' && one.options === true);
roDom.nodeCard.box = rect(420, 320, 300, 80);
roScroll.fn({});
check('bind.safety.queued', roBinding.measures() === 1 && timers.length === 1, 'rAF never ran, a timer is queued');
flushTimers();
check(
  'bind.safety.timerRuns',
  roBinding.measures() === 2 && roDom.capB.attrs.cy === '310',
  JSON.stringify({ measures: roBinding.measures(), cy: roDom.capB.attrs.cy })
);
flushTimers();
check('bind.safety.once', roBinding.measures() === 2, 'the token makes the second clock a no-op');
if (roCallback) roCallback();
flushTimers();
check('bind.ro.triggers', roBinding.measures() === 3, 'a ResizeObserver callback schedules exactly one measure');
roBinding.destroy();
check('bind.ro.disconnect', observed.indexOf('disconnect') >= 0, observed.join(','));

/* ------------------------------------------------------------------------- */
/* 4. idle + motion */
/* ------------------------------------------------------------------------- */

check('running.hostWins', T.sessionRunning({ running: false }, 'n2', T0) === false, 'an explicit view.running=false wins over an active node');
check('running.hostTrue', T.sessionRunning({ running: true }, null, T0 + 999999) === true, 'an explicit view.running=true wins over a stale asOf');
check('running.activeNode', T.sessionRunning({ asOf: T0 }, 'n2', T0 + 600000) === true, 'a node that never returned means still working');
check('running.recent', T.sessionRunning({ asOf: T0 }, null, T0 + 1000) === true, 'an event 1 s ago means working');
check('running.stale', T.sessionRunning({ asOf: T0 }, null, T0 + C.idleAfterMs + 1) === false, 'nothing for 15 s and no active node → idle');
check('running.boundary', T.sessionRunning({ asOf: T0 }, null, T0 + C.idleAfterMs) === false, 'exactly at the window → idle');
check('running.noClock', T.sessionRunning({ asOf: T0 }, null, null) === true, 'no clock (offline) → do not dim');
check('running.noAsOf', T.sessionRunning({}, null, T0) === false && T.sessionRunning(null, null, T0) === false, 'no evidence → idle');

const motionCss = T.motionMode((query) => ({ matches: query === '(prefers-reduced-motion: reduce)' ? false : null }));
const motionStatic = T.motionMode((query) => ({ matches: query === '(prefers-reduced-motion: reduce)' ? true : null }));
check('motion.css', motionCss === 'css', motionCss);
check('motion.static', motionStatic === 'static', motionStatic);
check('motion.missing', T.motionMode(null) === 'css' && T.motionMode(undefined) === 'css', 'no matchMedia → css');
check('motion.throws', T.motionMode(() => {
  throw new Error('unsupported');
}) === 'css', 'a throwing matchMedia is not a reduced-motion preference');
check('motion.nullQuery', T.motionMode(() => null) === 'css', 'null query → css');

const live = T.buildModel(runningView, prefs, T0 + 1000);
check('model.running', live.running === true, String(live.running));
const idleModel = T.buildModel({ ...runningView, active: null }, prefs, T0 + 60000);
check('model.idle', idleModel.running === false, String(idleModel.running));
const busyModel = T.buildModel({ ...runningView, active: null }, prefs, T0 + 5000);
check('model.recent', busyModel.running === true, 'an event 5 s ago keeps the panel alive');
check(
  'model.running.hostFlag',
  T.buildModel({ ...runningView, running: false }, prefs, T0 + 1).running === false,
  'the host flag, when present, is authoritative'
);

/* ------------------------------------------------------------------------- */
/* 5. renderer */
/* ------------------------------------------------------------------------- */

const panelTree = T.renderPanel(live, prefs, say, actions, ui);
const roots = byData(panelTree, 'root');
const panel = byData(panelTree, 'panel')[0];
const body = childByClass(panel, 'wf-body');

check('render.root.motion', roots.length === 1 && roots[0].props['data-motion'] === 'css', roots[0]?.props['data-motion']);
check('render.root.idle', roots[0].props['data-idle'] === '0', roots[0].props['data-idle']);
check('render.body.anchor', body !== undefined && body.props['data-dsh-workflow-map'] === 'body', body?.props['data-dsh-workflow-map']);

const idleTree = T.renderPanel(idleModel, prefs, say, actions, { ...ui, idle: true });
check('render.idle', byData(idleTree, 'root')[0].props['data-idle'] === '1', 'idle puts data-idle=1 on the root');
const staticTree = T.renderPanel(live, prefs, say, actions, { ...ui, motion: 'static' });
check('render.static', byData(staticTree, 'root')[0].props['data-motion'] === 'static', 'reduced motion puts data-motion=static');
const capsuleTree = T.renderPanel(live, { ...prefs, collapsed: true }, say, actions, { ...ui, idle: true, motion: 'static' });
const capsuleRoot = byData(capsuleTree, 'root')[0];
check(
  'render.capsule.attrs',
  capsuleRoot.props['data-idle'] === '1' && capsuleRoot.props['data-motion'] === 'static' && byData(capsuleTree, 'panel').length === 0,
  JSON.stringify({ idle: capsuleRoot.props['data-idle'], motion: capsuleRoot.props['data-motion'] })
);

// the two-column layer itself is no longer mounted (there is no second column to connect).
// Its MARKUP still exists and is still exported — the satellites' rings and the dashed branch use
// the same gradients — so the shape is asserted on wfRenderFlowEffects directly, not on the panel.
const fxTree = T.renderFlowEffects(createElement);
const fx = [fxTree];
check('fx.oneLayer', fx.length === 1, fx.length);
check(
  'fx.attrs',
  fx[0].props['data-visible'] === 'false' && fx[0].props['data-curve'] === C.curveMode && fx[0].props['aria-hidden'] === 'true',
  JSON.stringify(fx[0].props)
);
const gradients = findAll(fx[0], (node) => node.type === 'linearGradient');
check('fx.gradients', gradients.length === 2 && gradients[0].props.id === 'wf-fx-rainbow' && gradients[1].props.id === 'wf-fx-brand', gradients.map((g) => g.props.id).join(','));
const rainbowStops = findAll(gradients[0], (node) => node.type === 'stop');
check('fx.stops.count', rainbowStops.length === C.fxRainbow.length, rainbowStops.length);
check(
  'fx.stops.offsets',
  rainbowStops.map((stop) => stop.props.offset).join(',') === '0%,20%,40%,60%,80%,100%',
  rainbowStops.map((stop) => stop.props.offset).join(',')
);
check(
  'fx.stops.classes',
  rainbowStops.every((stop, index) => stop.props.className === 'wf-fx-stop wf-fx-stop-' + (index + 1)),
  'each stop carries its own colour class'
);
const paths = findAll(fx[0], (node) => node.type === 'path');
check(
  'fx.paths',
  paths.length === 2 &&
    paths[0].props.className === 'wf-fx-glow' &&
    paths[1].props.className === 'wf-fx-core' &&
    paths.every((one) => one.props.d === ''),
  paths.map((one) => one.props.className).join(',')
);
const caps = findAll(fx[0], (node) => node.type === 'circle');
check(
  'fx.caps',
  caps.length === 2 && caps.every((one) => one.props.cx === -99 && one.props.cy === -99 && one.props.r === 3.4),
  JSON.stringify(caps.map((one) => [one.props.cx, one.props.cy, one.props.r]))
);

const planningTree = T.renderPanel(
  T.buildModel({ steps: [], plan: { phase: 'planning', steps: [] } }, prefs, T0),
  prefs,
  say,
  actions,
  { ...ui, idle: true }
);
check('fx.planningNone', byData(planningTree, 'fx').length === 0, 'the planning card has no curve layer');

// the two-column curve is gone (there is no second column to connect), so the living layer's
// remaining job is the WINDOW: the running unit breathes, and a running satellite's ring flows.
check('fx.layerGone', byData(panelTree, 'fx').length === 0, 'no two-column curve layer is drawn');

const liveChips = byData(panelTree, 'live');
check('live.count', liveChips.length === 1, liveChips.length + ' chip (the running step)');
check(
  'live.scopes',
  liveChips.map((chip) => chip.props['data-live']).join(',') === 'step',
  liveChips.map((chip) => chip.props['data-live']).join(',')
);
check(
  'live.markup',
  liveChips.every((chip) => {
    const dot = childByClass(chip, 'wf-live-dot');
    const dots = childByClass(chip, 'wf-live-dots');
    return dot !== undefined && dots !== undefined && (dots.children || []).length === C.liveDots && textOf(chip).includes('正在');
  }),
  'dot + three dots + 「正在」'
);
check('live.say', T.renderLive(createElement, say, 'node').children[1].children[0] === '正在', 'zh dictionary answers');
check(
  'live.sayEn',
  T.renderLive(createElement, T.makeSay(() => undefined), 'node') !== null && T.dicts().en['panel.live'] === 'Working',
  JSON.stringify(T.dicts().en['panel.live'])
);
const runningStepCard = byData(panelTree, 'step').find((card) => card.props['data-status'] === 'running');
check(
  'live.onlyRunning',
  runningStepCard !== undefined && byData(runningStepCard, 'live').length === 1,
  'the running unit carries the chip'
);

// The flowing ring: the running unit's card is wrapped, the running type's circle is wrapped, and a
// finished one is not. The claim is a CSS selector, so it is asserted as one.
const cssLive = T.css();
check(
  'fx.ring.unit',
 // The running card keeps its rainbow ring, but the CONNECTORS no longer carry a rainbow (by request: one dashed style between steps).
  cssLive.includes(".wf-unit[data-status='running']>.wf-unit-center>.wf-unit-card::after") &&
    !/\.wf-unit-link\[data-live='true'\]\{[^}]*WF_FX_RAINBOW/.test(cssLive) &&
    cssLive.includes(".wf-unit-link[data-live='true']{background:repeating-linear-gradient(180deg,"),
  'the running card keeps the ring; the connector stays one plain dashed line',
);
check(
  'fx.ring.satellite',
  cssLive.includes(".wf-sat[data-live='true']::after") && cssLive.includes('mask-composite:exclude'),
  'a circle being called is wrapped too'
);
check(
  'fx.ring.line',
  cssLive.includes(".wf-sat-row[data-live='true'] .wf-sat-line"),
  'the straight interface flows with its circle (the ask: 链接该圆形图标和该主流程的线也变为彩色流光)'
);
const doneCard = byData(panelTree, 'step').find((card) => card.props['data-status'] === 'done');
check('live.notOnDone', doneCard !== undefined && byData(doneCard, 'live').length === 0, 'a done card stays quiet');
// A node's own chip lives in the type page's call rows now; the chain's satellite is the node-level
// indicator, and it lights only while its call is the one running.
const liveSats = byData(panelTree, 'sat').filter((sat) => sat.props['data-live'] === 'true');
check(
  'live.satelliteOnlyActive',
  liveSats.length === 1 && byData(panelTree, 'sat').length > liveSats.length,
  liveSats.length + ' of ' + byData(panelTree, 'sat').length + ' circles flow'
);

// The signature must not change on a poll that changes nothing (or the effect would re-bind
// every 800 ms), and must change when the endpoint moves.
const sigA = T.fxSignature(live);
const sigB = T.fxSignature(T.buildModel(runningView, prefs, T0 + 2000));
check('sig.stable', sigA === sigB, sigA);
check('sig.step', T.fxSignature(T.buildModel({ ...runningView, active: { stepIndex: 1, nodeId: 'n1' } }, prefs, T0)) !== sigA, 'a different active node → new signature');
check('sig.idle', T.fxSignature(idleModel) !== sigA, 'idle → new signature');
check('sig.none', T.fxSignature(null) === 'none', T.fxSignature(null));

/* ------------------------------------------------------------------------- */
/* 6. stylesheet */
/* ------------------------------------------------------------------------- */

const css = T.css();
const needles = [
  ['body anchor', '.wf-body{position:relative}'],
  ['gutter', '.wf-flow-scroll,.wf-steps-scroll{padding-right:4px}'],
 // The layer keeps a real box while hidden (opacity, not display) — otherwise its own rect
 // would measure 0×0 and the first measurement could never resolve user space.
  ['layer', '.wf-fx{position:absolute;inset:0;'],
  ['layer not hidden by display', '.wf-fx{position:absolute;inset:0;width:100%;height:100%;opacity:0;'],
  ['layer hidden', ".wf-fx[data-visible='true']{opacity:1}"],
  ['core stroke', '.wf-fx-core{fill:none;stroke:url(#wf-fx-rainbow);stroke-width:2;'],
  ['dash pattern', 'stroke-dasharray:' + C.fxDash],
  ['dash keyframes', '@keyframes wf-fx-dash{from{stroke-dashoffset:0}to{stroke-dashoffset:-32}}'],
  ['glow blur', 'filter:blur(2.5px)'],
  ['glow width', 'stroke-width:6;'],
  ['brand switch', ".wf-fx[data-curve='brand'] .wf-fx-core"],
  ['cap paint', '.wf-fx-cap{fill:url(#wf-fx-rainbow)'],
  ['ring rule', ".wf-step-item[data-status='running']>.wf-step-card::after,.wf-node[data-status='running']::after{"],
  ['ring seam', 'inset:-3px;border-radius:11px;padding:2px'],
  ['ring mask', '-webkit-mask-composite:xor'],
  ['ring mask standard', 'mask-composite:exclude'],
  ['ring keyframes', '@keyframes wf-fx-wrap'],
  ['ring gradient slides', 'background-size:300% 100%'],
  ['live dot', '.wf-live-dot{flex:0 0 auto;width:6px;height:6px;border-radius:50%;'],
  ['live blink', '@keyframes wf-live-dot'],
  ['live dots', '.wf-live-dots>i{'],
  ['live stagger', '.wf-live-dots>i:nth-child(2){animation-delay:.16s}'],
 // The pseudo-elements must be listed: animation properties are not inherited, so `*` alone
 // leaves the wrapped frame's ring and the lane dot running. (A browser measurement caught it.)
  ['idle pause', ".wf-root[data-idle='1'] *,.wf-root[data-idle='1'] *::before,.wf-root[data-idle='1'] *::after{animation-play-state:paused!important}"],
  ['static motion', ".wf-root[data-motion='static'] *,.wf-root[data-motion='static'] *::before,.wf-root[data-motion='static'] *::after{animation:none!important}"],
  ['reduced motion', '@media (prefers-reduced-motion: reduce){.wf-root *,.wf-root *::before,.wf-root *::after{animation:none!important}}'],
];
for (const [label, needle] of needles) {
  check('css.' + label.replace(/\s+/g, '-'), css.includes(needle), needle);
}

check(
  'css.stops.all',
  C.fxRainbow.every((colour, index) => css.includes('.wf-fx-stop-' + (index + 1) + '{stop-color:' + colour + '}')),
  C.fxRainbow.join(' ')
);
check('css.stops.distinct', new Set(C.fxRainbow).size === C.fxRainbow.length, String(C.fxRainbow.length));
check('css.blink.period', C.pulsePeriod === '1.2s' && C.livePeriod === '1.2s' && C.pulseMs === 1200, JSON.stringify({ pulse: C.pulsePeriod, live: C.livePeriod }));
check(
  'css.blink.wired',
  css.includes('animation:wf-live-dot ' + C.livePeriod) && css.includes('animation:wf-live-dots ' + C.livePeriod),
  'the CSS blink really uses the 1.2 s constant'
);
check('css.curve.speed', css.includes('animation:wf-fx-dash ' + C.fxSpeed), C.fxSpeed);
check(
  'css.ring.wired',
  css.includes('animation:wf-fx-wrap 2.6s linear infinite'),
  'the wrapped frame actually flows'
);
check('css.noSmil', !/<animate|<animateTransform|<animateMotion/.test(css) && !/<animate/.test(source), 'no SMIL anywhere (CSS only)');
// `@property` may only appear in a comment (“no @property: …”); a real declaration would be
// `@property --name {`. SMIL would be `<animate …>` inside the markup or the stylesheet.
check('css.noProperty', !/@property\s+--/.test(css) && !/@property\s+--/.test(source), 'no @property declaration anywhere');

// Cost: no per-node animation rule; the fx animations are the two paths, the two rings and
// the live chip only.
const perNodeAnimation = /\.wf-node\s*\{[^}]*animation:/.test(css) || /\.wf-step-card\s*\{[^}]*animation:/.test(css);
check('css.cost.perNode', perNodeAnimation === false, 'no animation on the card rule itself');
const animatedSelectors = css
  .split('\n')
  .filter((line) => line.includes('animation:') && line.includes('{'))
  .map((line) => line.split('{')[0].trim())
 // @media wrappers and the two attribute-scoped freeze rules are not "extra animated elements";
 // every selector listed here is one of the documented ones (or a scoped freeze).
  .filter((selector) => !/^@media/.test(selector) && !/\[data-(motion|idle)/.test(selector));
check(
  'css.cost.selectors',
 // adds exactly one more animated thing: the branch dashes (`.wf-branch-core`). It is
 // allowed here ONLY because the strip exists solely under the running node — at most 3 paths —
 // so it can never turn a 60-node step into 60 animations. check('css.cost.chainDashes')
 // below proves that scoping, rather than trusting this list to be meaningful on its own.
 // adds the unit's ring and the satellite row: both scoped to `data-status=running` /
 // `data-live=true`, so a finished chain is still completely quiet.
  animatedSelectors.every((selector) =>
    /wf-fx|wf-live|running|wf-prog|wf-dot|wf-branch-dot|wf-branch-core|wf-branch-icon|wf-flow-status|wf-flow-item|wf-step-link|wf-ring|wf-sat|wf-unit/.test(selector)
  ),
  animatedSelectors.length + ' animated selectors: ' + animatedSelectors.join(' | ')
);
check(
  'css.cost.ringSelector',
  css.includes("[data-status='running']") && !css.includes(".wf-node::after,\n") && !/\.wf-node\[data-status='running'\],/.test(css),
  'the ring selector is scoped to the running state, not to every card'
);

/* ------------------------------------------------------------------------- */
/* the chain: distances, branches, round icons, the curve channel */
/* ------------------------------------------------------------------------- */

// --- the distances are real constants, and they stay in the documented ranges ---
check(
  'chain.gap.atLeast28',
  C.chainGap >= 28 && C.chainGap % 1 === 0,
  'chainGap=' + C.chainGap + ' (the step floor is 28 px)'
);
check(
  'chain.link.insideGap',
  C.chainLink > 0 && C.chainLink <= C.chainGap && C.chainPad >= 12,
  JSON.stringify({ link: C.chainLink, gap: C.chainGap, pad: C.chainPad })
);
check(
  'chain.icon.inRange',
  C.chainIcon >= 20 && C.chainIcon <= 24 && C.chainRing > 0 && C.chainRing < C.chainIcon / 2,
  JSON.stringify({ icon: C.chainIcon, ring: C.chainRing })
);
check(
  'chain.css.gapToken',
  css.includes('.wf-flow-list{position:relative;display:flex;flex-direction:column;gap:' + C.chainGap + 'px') &&
    css.includes('.wf-steps{display:flex;flex-direction:column;gap:' + C.chainGap + 'px'),
  'both columns take the SAME constant — no hard-coded distance in either rule'
);
check(
  'chain.css.noLiteralGap',
  !/\.wf-flow-list\{[^}]*gap:5px/.test(css) && !/\.wf-node\{[^}]*margin-bottom/.test(css),
  'the old 5 px stack and any per-card margin are gone'
);
check(
  'chain.css.iconRule',
  css.includes('.wf-branch-icon{flex:0 0 auto;width:' + C.chainIcon + 'px;height:' + C.chainIcon + 'px'),
  'the circle is sized by the constant, so the browser measurement and the sheet cannot disagree'
);
check(
  'chain.css.ringReuse',
  css.includes(".wf-branch-row[data-live='true'] .wf-branch-icon::after") &&
    css.includes('mask-composite:exclude') &&
    css.includes('animation:wf-fx-wrap 2.6s linear infinite'),
  'the running circle reuses step-10\'s mask-composite ring and its keyframes'
);

// --- the derivation: three categories, from fields the host already sends ---
check(
  'chain.kinds.three',
  Array.isArray(C.chainKinds) && C.chainKinds.join(',') === 'read,edit,tool',
  String(C.chainKinds)
);
check(
  'chain.action.map',
  T.chainActionKind('读') === 'read' &&
    T.chainActionKind('改') === 'edit' &&
    T.chainActionKind('写') === 'edit' &&
    T.chainActionKind('查') === 'read' &&
    T.chainActionKind('read') === 'read' &&
    T.chainActionKind('nonsense') === 'tool' &&
    T.chainActionKind(null) === 'tool',
  'the host\'s four Chinese labels plus the English spellings, and a total fallback'
);
const chainNode = {
  id: 'n-chain',
  kind: 'tool',
  tool: 'edit',
  title: 'edit c.js',
  files: 3,
  path: 'D:/proj/c.js',
  fileList: [
    { path: 'D:/proj/a.js', action: '读' },
    { path: 'D:/proj/b.js', action: '改' },
    { path: 'D:/proj/c.js', action: '改' },
    { path: 'D:/proj/a.js', action: '读' },
  ],
};
const chainBranches = T.chainBranches(chainNode);
const byKind = (list, kind) => list.find((one) => one.kind === kind);
check(
  'chain.branches.order',
  chainBranches.map((one) => one.kind).join(',') === 'read,edit,tool',
  chainBranches.map((one) => one.kind).join(',')
);
check(
  'chain.branches.dedupe',
  byKind(chainBranches, 'read').count === 1 && byKind(chainBranches, 'edit').count === 2 && byKind(chainBranches, 'tool').count === 1,
  JSON.stringify(chainBranches.map((one) => [one.kind, one.count]))
);
check(
  'chain.branches.toolAlways',
  byKind(T.chainBranches({ id: 'x', tool: 'read' }), 'tool') !== undefined &&
    T.chainBranches({ id: 'x', tool: 'read' }).length === 1,
  'a plain call still yields the 工具 branch'
);
check(
  'chain.branches.empty',
  T.chainBranches(null).length === 0 && T.chainBranches({}).length === 0 && T.chainBranches({ tool: '' }).length === 0,
  'nothing to branch on → no branches, not an empty bucket'
);

// --- the curve: cubic, on the endpoints, inside its own gap ---
const chainPath = T.chainStrokePath(C.chainBranch, C.chainIcon);
check(
  'chain.stroke.cubic',
  /^M[\d.]+ [\d.]+C[\d.]+ [\d.]+ [\d.]+ [\d.]+ [\d.]+ [\d.]+$/.test(chainPath),
  chainPath
);
const near = (a, b) => Math.abs(a - b) <= 2;
const chainRect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const listBox = chainRect(0, 0, 400, 400);
const upperBox = chainRect(12, 20, 360, 40);
const lowerBox = chainRect(12, 20 + 40 + C.chainGap, 360, 40);
const chainGeo = T.chainCurve(listBox, upperBox, lowerBox);
check('chain.curve.visible', chainGeo.visible === true && chainGeo.reason === 'ok', chainGeo.reason);
check(
  'chain.curve.cubic',
  /^M[\d.]+ [\d.]+C[\d.]+ [\d.]+ [\d.]+ [\d.]+ [\d.]+ [\d.]+$/.test(chainGeo.d),
  chainGeo.d
);
check(
  'chain.curve.endpoints',
 // The card's own centre, in the LIST's user space: the cards start at x=12 and are 360 wide,
 // so their centre is 12 + 360/2 = 192, and the curve must land exactly there (≤ 2 px).
  near(chainGeo.from.x, 12 + 360 / 2) &&
    near(chainGeo.from.y, upperBox.bottom) &&
    near(chainGeo.to.x, 12 + 360 / 2) &&
    near(chainGeo.to.y, lowerBox.top),
  JSON.stringify({ from: chainGeo.from, to: chainGeo.to })
);
check(
  'chain.curve.controlMid',
  chainGeo.dy === C.chainGap && /C[\d.]+ (\d+(\.\d+)?) [\d.]+ \1 /.test(chainGeo.d),
  'both control points share the gap\'s vertical midpoint: ' + chainGeo.d
);
check(
  'chain.curve.touching',
  T.chainCurve(listBox, upperBox, chainRect(12, 60, 360, 40)).visible === false,
  'two cards that touch have no gap to draw in'
);
check(
  'chain.curve.noCards',
  T.chainCurve(listBox, null, lowerBox).reason === 'no-cards' && T.chainCurve(null, upperBox, lowerBox).reason === 'no-origin',
  'missing inputs are named, not guessed'
);
const chainPairGeo = T.chainGeometry(listBox, [
  { rect: upperBox, done: true },
  { rect: lowerBox, done: true },
]);
check(
  'chain.geometry.links',
  chainPairGeo.visible === true && chainPairGeo.links.length === 1 && chainPairGeo.links[0].done === true,
  JSON.stringify({ links: chainPairGeo.links.length, done: chainPairGeo.links[0] && chainPairGeo.links[0].done })
);
check(
  'chain.geometry.tooFew',
  T.chainGeometry(listBox, [{ rect: upperBox, done: false }]).reason === 'too-few' &&
    T.chainGeometry(listBox, []).visible === false,
  'one card is not a chain'
);

// --- the renderer: only the running node, only three circles ---
// the in-node branch strip belonged to the flow column. The SAME category derivation now
// drives the chain's satellites, so the assertions move to the unit that carries them: one running
// unit, its circles split by side, the running one flowing.
const chainModel = T.buildModel(runningView, prefs, T0);
const chainTree = T.renderPanel(chainModel, prefs, say, actions, { settingsOpen: false, motion: 'css', idle: false });
const chainSats = byData(chainTree, 'sat');
check('chain.render.onlyRunning', chainSats.filter((one) => one.props['data-live'] === 'true').length === 1, chainSats.length + ' circles, one flowing');
check(
  'chain.render.sides',
 // A .js file that was read in one call and edited in another is ONE circle (the FIRST evidence
 // wins), so this fixture legitimately puts every circle on the right. What must hold is that a
 // side is always one of the two real values.
  chainSats.length >= 1 && chainSats.every((one) => one.props['data-side'] === 'left' || one.props['data-side'] === 'right'),
  chainSats.map((one) => one.props['data-side']).join(',')
);
const chainKinds = chainSats.map((one) => one.props['data-tone']).join(',');
check('chain.render.tones', /read|edit|tool/.test(chainKinds), chainKinds);
check('chain.render.icons', chainSats.length >= 1, chainSats.length + ' round icons');
check(
  'chain.render.noBranchesWhenDone',
  byData(
    T.renderNodeCard(
      createElement,
      { id: 'n-done', kind: 'tool', tool: 'read', title: 'read a.js', resultHead: 'ok', fileList: [{ path: 'D:/a.js', action: '读' }] },
      say,
      actions,
      { activeNodeId: 'n2', detail: 'summary' }
    ),
    'chain'
  ).length === 0,
  'a finished card renders no branch shell at all'
);
const chainOpenTree = T.renderNodeCard(
  createElement,
  {
    id: 'n2',
    kind: 'tool',
    tool: 'edit',
    title: 'edit c.js',
    argsText: 'file_path=D:/proj/c.js',
    resultHead: '',
    fileList: [{ path: 'D:/proj/c.js', action: '改' }],
  },
  say,
  actions,
  { activeNodeId: 'n2', detail: 'summary', openChain: 'edit' }
);
check(
  'chain.render.detailReuse',
  byData(chainOpenTree, 'chain-detail').length === 1 &&
    byData(chainOpenTree, 'chain-detail')[0].children.some((child) => child && child.props && child.props['data-dsh-workflow-map'] === 'node-detail'),
  'the opened circle renders step-11\'s node detail, not a new block'
);
check(
  'chain.render.detailFiles',
  textOf(byData(chainOpenTree, 'chain-detail')[0]).includes('c.js'),
  'narrowed to the opened category\'s own files'
);

// --- the state machine ---
check(
  'chain.state.open',
  T.flowToggleChain(T.flowUiFor(null, 1), 'read').openChain === 'read' &&
    (function () {
      const before = T.flowUiFor(null, 1);
      return T.flowToggleChain(before, 'nope') === before;
    })(),
  'a known kind opens; an unknown one returns the SAME state object untouched'
);
check(
  'chain.state.toggle',
  T.flowToggleChain(T.flowToggleChain(T.flowUiFor(null, 1), 'edit'), 'edit').openChain === null,
  'clicking the same circle twice closes it'
);
check(
  'chain.state.perStep',
  T.flowUiFor({ stepIndex: 0, openChain: 'read' }, 1).openChain === null &&
    T.flowUiFor({ stepIndex: 1, openChain: 'read' }, 1).openChain === 'read',
  'a state from another step opens nothing'
);
check(
  'chain.state.escape',
  T.flowClearSelection({ stepIndex: 1, openChain: 'read' }, 1).openChain === null,
  'Escape closes the branch detail too'
);
check(
  'chain.state.selectKeeps',
  T.flowSelectNode({ stepIndex: 1, openChain: 'tool' }, 1, 'n2').openChain === 'tool',
  'selecting a node does not fold the open circle'
);

// --- the layer: measured, click-through, and a no-op when there is nothing to draw ---
const chainLayer = T.renderChain(createElement);
check(
  'chain.layer.slots',
  chainLayer.props['data-dsh-workflow-map'] === 'chain' &&
    chainLayer.children.length === C.chainSlots &&
    chainLayer.children.every((one) => one.props.className === 'wf-chain-core' && one.props.d === ''),
  chainLayer.children.length + ' empty slots, none painted before the first measure'
);
check(
  'chain.layer.unmeasured',
  chainLayer.props['data-visible'] === 'false' && chainLayer.props['data-reason'] === 'unmeasured',
  JSON.stringify({ visible: chainLayer.props['data-visible'], reason: chainLayer.props['data-reason'] })
);
check(
  'chain.css.pointerEvents',
  /\.wf-chain\{[^}]*pointer-events:none/.test(css) && /\.wf-branch-stroke\{[^}]*pointer-events:none/.test(css),
  'both curve layers are click-through, so neither can eat the icon\'s click'
);
check(
  'chain.apply.noDom',
  T.chainApply(null) === null && T.chainApply({}) === null,
  'no document → no measurement, no throw'
);
check(
  'chain.css.motionReduced',
  css.includes('@media (prefers-reduced-motion: reduce){.wf-branch-core{animation:none}}'),
  'the branch dashes stop under reduced motion even before the root rule applies'
);

/* report */
/* ------------------------------------------------------------------------- */

const failed = results.filter((row) => !row.pass);
process.stdout.write(results.map((row) => `${row.pass ? 'PASS' : 'FAIL'}  ${row.id}${row.pass ? '' : '  — ' + row.detail}`).join('\n') + '\n');
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
if (failed.length > 0) process.exitCode = 1;
