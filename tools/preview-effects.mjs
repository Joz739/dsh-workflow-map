// preview-effects.mjs — the living layer of the SINGLE PAGE, rendered for a browser measurement.
//
// Run: node tools/preview-effects.mjs   (then pwsh -File tools\measure-effects.ps1)
//
// 会话4 rewrote the layout into ONE page; session7 (2026-10-27) rewrote this preview to
// match it. The old page measured the step↔node curve of the two-column layout, which
// no longer exists. What still moves on today's page, and what this preview proves IN A
// REAL BROWSER (a tree assertion cannot — the animation has to actually run):
//
//   · the running unit's ring breathes (wf-ring, 1.6 s) and its card carries the flowing
//     brand wrap (wf-fx-wrap, 2.6 s) on the card's own frame (the ::after running frame);
//   · the running row's connector is the ONE line that flows (data-live=true on the
//     unit-link: the flowing gradient, wf-prog-flow), while a done row's line is static;
//   · the running card's rail keeps the live progress bar scrolling (wf-prog-flow);
//   · data-motion='static' on the root (the product's 「减少动效」 setting) turns EVERY
//     animation inside the panel to none — document.getAnimations() must go to 0;
//   · data-idle='1' (session idle) PAUSES every animation (playState 'paused');
//   · the reduced-motion MEDIA rule does the same as static even when the root says css.
//
// The pages mount the renderer's own tree into a live DOM with the REAL WF_CSS, so
// getComputedStyle and document.getAnimations answer for the shipped stylesheet, not a
// copy. No expected number is hardcoded here: the expectations land in
// evidence/preview/fx-expect.json, derived from the same constants the renderer reads.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'evidence', 'preview');
fs.mkdirSync(OUT, { recursive: true });

/* --- load the built bundle (same seam as preview-main) --------------------- */
const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
const loaded = { definition: null };
new Function('window', source)({ __ModuleLoader__: { load: (definition) => (loaded.definition = definition) } });
const T = loaded.definition.factory((name) => {
  if (name === 'react') return { createElement: function (type, props) { return { type: type, props: props || {}, children: [].slice.call(arguments, 2) }; } };
  throw new Error('unexpected require: ' + name);
}).__test;

/* --- the mock shell (the real seat: [rail | main]) -------------------------- */
const DARK_TOKENS = `
  :root{--mock-bg:#0f1116;--mock-fg:#e9ecf3;--mock-dim:#9aa3b2;--mock-border:#2a2f3a;
    --mock-row:#181b22}
`;
const mockCss = `
  html,body{margin:0;height:100%;background:var(--mock-bg);color:var(--mock-fg);
    font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif}
  .mock-app{display:grid;grid-template-columns:220px 1fr;height:100vh}
  .mock-side{border-right:1px solid var(--mock-border);padding:14px 12px;font-size:12px;color:var(--mock-dim)}
  .mock-side b{display:block;margin-bottom:10px;color:var(--mock-fg);font-size:13px}
  .mock-row{padding:6px 8px;border-radius:6px;margin-bottom:4px;background:var(--mock-row)}
  .mock-row.active{outline:1px solid #5b8cff;color:var(--mock-fg)}
  .mock-main{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
`;
const mockApp = `
  <div class="mock-app">
    <aside class="mock-side">
      <b>DeepSeek Harness</b>
      <div class="mock-row">会话</div>
      <div class="mock-row active">工作流</div>
    </aside>
    <main class="mock-main" id="wf-slot"><!-- mounted by the page script --></main>
  </div>
`;

/* --- a synthetic view: one done step, one running step, one pending --------- */
const T0 = 1792243000000;
const nodes = [
  { id: 'd1', stepIndex: 0, kind: 'tool', tool: 'read', title: 'read a.md', detail: 'path=a.md', files: [{ path: 'D:/proj/a.md', action: '读' }], resultHead: 'ok', error: '', at: T0 - 60000, durationMs: 20, seq: 1 },
  { id: 'r1', stepIndex: 1, kind: 'tool', tool: 'edit', title: 'edit b.js', detail: 'path=b.js', files: [{ path: 'D:/proj/b.js', action: '改' }], resultHead: '', error: '', at: T0 - 5000, durationMs: 0, seq: 2 },
  { id: 'r2', stepIndex: 1, kind: 'tool', tool: 'pwsh', title: 'pwsh build', detail: 'build', files: [], resultHead: '', error: '', at: T0 - 3000, durationMs: 0, seq: 3 },
];
const steps = [
  { index: 0, title: '已完成的骨架', status: 'done', percent: 100, percentSource: 'model', startedAt: T0 - 90000, endedAt: T0 - 40000, nodeIds: ['d1'], nodeCount: 1, groups: [] },
  { index: 1, title: '正在进行的渲染', status: 'running', percent: 58, percentSource: 'model', startedAt: T0 - 30000, endedAt: null, nodeIds: ['r1', 'r2'], nodeCount: 2, groups: [] },
  { index: 2, title: '未开始的一步', status: 'pending', percent: null, nodeIds: [], nodeCount: 0, groups: [] },
];
const view = {
  asOf: T0 - 1000, task: 'living-layer measure', steps, nodes,
  active: { stepIndex: 1, nodeId: 'r2' },
  counts: { steps: 3, nodes: 3, running: 1, completed: 1 },
};

/* --- expectations derived from the renderer's own constants ----------------- */
const C = T.constants();
const model = T.buildModel(view, T.defaultPrefs(), T0);
const runningUnit = model.page.units[1];
const expect = {
  ringDuration: '1.6s',
  wrapDuration: '2.6s',
  livePeriod: C.livePeriod,
  pulsePeriod: C.pulsePeriod,
  runningSats: { left: runningUnit.left.length, right: runningUnit.right.length },
  liveDots: C.liveDots,
  pagePad: C.pagePad,
};
fs.writeFileSync(path.join(OUT, 'fx-expect.json'), JSON.stringify(expect, null, 2), 'utf8');

/* --- the page script: mount, then measure the REAL animations --------------- */
function pageScript(mode) {
  return `
(function () {
  var MODE = ${JSON.stringify(mode)};
  var VIEW = ${JSON.stringify(view)};
  var T0 = ${T0};

  var report = { mode: MODE, error: '', facts: {} };
  function finish() {
    var pre = document.createElement('pre');
    pre.id = 'wf-measure';
    pre.textContent = JSON.stringify(report);
    document.body.appendChild(pre);
  }

  var definition = window.__wfDef;
  if (!definition) { report.error = 'bundle not captured'; return finish(); }
  var T = definition.factory(function (name) {
    if (name === 'react') return { createElement: function (type, props) { return { type: type, props: props || {}, children: [].slice.call(arguments, 2) }; } };
    throw new Error('unexpected require: ' + name);
  }).__test;
  var say = T.makeSay(undefined);
  var host = document.getElementById('wf-slot');

  function mount(node) {
    if (node === null || node === undefined || node === false) return null;
    if (typeof node === 'string' || typeof node === 'number') return document.createTextNode(String(node));
    if (Array.isArray(node)) { var frag = document.createDocumentFragment(); node.forEach(function (c) { var m = mount(c); if (m) frag.appendChild(m); }); return frag; }
    var el = document.createElement(node.type);
    Object.keys(node.props || {}).forEach(function (name) {
      var value = node.props[name];
      if (value === undefined || value === null || typeof value === 'function') return;
      if (name === 'children') return;
      if (name === 'className') { el.setAttribute('class', value); return; }
      if (name === 'style' && typeof value === 'object') { Object.keys(value).forEach(function (k) { el.style[k] = value[k]; }); return; }
      el.setAttribute(name, String(value));
    });
    (node.children || []).forEach(function (child) { var m = mount(child); if (m) el.appendChild(m); });
    return el;
  }

  var noop = function () {};
  var actions = {
    onCollapse: noop, onExpand: noop, onToggleSettings: noop, onSelectStep: noop, onReset: noop,
    onOpenStep: noop, onOpenType: noop, onSelectCall: noop, onClosePage: noop, onToggleInject: noop,
    onEscapeDetail: noop, onCopy: noop, onSetting: noop,
  };

  // MODE: 'running' (css + live), 'static' (「减少动效」→ data-motion=static),
  // 'idle' (live session gone idle → data-idle=1), 'reduced' (OS media query matches).
  var motion = MODE === 'static' ? 'static' : 'css';
  var idle = MODE === 'idle' ? true : false;

  var prefs = T.defaultPrefs();
  var model = T.buildModel(VIEW, prefs, T0);
  var tree = T.renderPanel(model, prefs, say, actions, {
    settingsOpen: false, status: 'live', error: '', rev: 1,
    endpoint: '/dsh-workflow/state?sessionId=session-fx', nodeTotal: VIEW.nodes.length,
    right: null, pageStep: null, pageType: null,
    openCall: null, asOf: model.asOf, motion: motion, idle: idle, sessionId: 'session-fx',
  });
  host.innerHTML = '';
  host.appendChild(mount(tree));

  var root = host.querySelector('[data-dsh-workflow-map="root"]');
  if (!root) { report.error = 'root not mounted'; return finish(); }

  function styleOf(el, pseudo) {
    if (!el) return null;
    var cs = getComputedStyle(el, pseudo || null);
    return { animationName: cs.animationName, animationDuration: cs.animationDuration, animationPlayState: cs.animationPlayState, backgroundImage: cs.backgroundImage };
  }
  function allAnimations() {
    try { return [].slice.call(document.getAnimations()); } catch (e) { return null; }
  }

  var facts = {};
  facts.root = { motion: root.getAttribute('data-motion'), idle: root.getAttribute('data-idle') };
  var anims = allAnimations();
  facts.animCount = anims ? anims.length : null;
  facts.animPlayStates = anims ? anims.map(function (a) { return a.playState; }) : null;
  facts.animNames = anims
    ? anims.map(function (a) { return a.animationName || (a.effect && a.effect.getKeyframes && a.effect.getKeyframes().length ? 'keyframes' : 'unknown'); }).filter(function (n, i, a) { return a.indexOf(n) === i; })
    : null;

  var runningUnitEl = root.querySelector('.wf-unit[data-status="running"]');
  var runningCard = runningUnitEl ? runningUnitEl.querySelector('.wf-unit-card') : null;
  facts.runningPresent = !!runningUnitEl;
  facts.ring = runningCard ? styleOf(runningCard.querySelector('.wf-unit-ring')) : null;
  facts.cardFrame = runningCard ? styleOf(runningCard, '::after') : null;

  var liveLink = root.querySelector('.wf-unit-link[data-live="true"]');
  var doneLink = root.querySelector('.wf-unit-link[data-live="false"]');
  facts.liveLink = liveLink ? styleOf(liveLink) : null;
  facts.doneLink = doneLink ? styleOf(doneLink) : null;

  var liveFill = runningUnitEl ? runningUnitEl.querySelector('.wf-prog-fill') : null;
  facts.liveFill = liveFill ? styleOf(liveFill) : null;

  var liveChip = root.querySelector('.wf-live-dots');
  facts.liveDots = liveChip ? { count: liveChip.children.length, animation: styleOf(liveChip.children[0] || liveChip) } : null;

  var liveDot = root.querySelector('.wf-live-dot');
  facts.liveDot = liveDot ? styleOf(liveDot) : null;

  try {
    facts.reducedMatches = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    facts.reducedMatches = 'unsupported';
  }

  report.facts = facts;
  finish();
})();
`;
}

function buildPage({ file, mode, reduced }) {
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>workflow-map living layer (${mode})</title>
<style>${DARK_TOKENS}${mockCss}${T.css()}</style></head><body>${mockApp}
<script>window.__ModuleLoader__ = { load: function (definition) { window.__wfDef = definition; } };</script>
<script src="../../client.js"></script>
<script>${pageScript(mode)}</script>
</body></html>`;
  fs.writeFileSync(path.join(OUT, file), html, 'utf8');
  return { file, bytes: Buffer.byteLength(html, 'utf8'), mode };
}

const written = [
  buildPage({ file: 'panel-fx-running.html', mode: 'running' }),
  buildPage({ file: 'panel-fx-static.html', mode: 'static' }),
  buildPage({ file: 'panel-fx-idle.html', mode: 'idle' }),
];

for (const one of written) process.stdout.write(`wrote evidence/preview/${one.file} (${one.bytes} bytes, mode=${one.mode})\n`);
process.stdout.write(`running sats ${expect.runningSats.left}+${expect.runningSats.right}; livePeriod=${expect.livePeriod}\n`);
