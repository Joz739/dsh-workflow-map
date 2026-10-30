// preview-main.mjs — the single page, rendered for a browser measurement.
//
// Run: node tools/preview-main.mjs (then pwsh -File tools\measure-main.ps1)
//
// WHY A PAGE AND NOT ONLY A SELF-TEST: every claim the user made is a LAYOUT or INTERACTION fact —
// "as much spacing as possible between main-flow units" -> the real card-to-card distance between units
// "each interface ends in a round icon" -> the circle's measured box (30x30, radius 50%)
// "connected with straight lines" -> the connector's box: 2 px wide, a straight run
// "the tool file being called ... is wrapped in flowing colour" -> ::after animationName on THAT circle
// "the line linking that icon and the unit also becomes flowing colour" -> the live row's line: flowing gradient + animation
// "the running unit is centred by default when opened" -> the REAL wfCenterRunning, then the measured error
// "clicking the unit or an icon ... opens the right-hand page" -> the click really opens the aside and changes kind
// The page therefore MOUNTS the renderer's tree into a live DOM (handlers included, the same
// technique as the /03/04 measure pages) and drives the REAL action names the component
// passes (onOpenStep / onOpenType / onSelectCall / onClosePage / onToggleInject) through a mini
// prefs state — exactly the updatePrefs → re-render loop the React component runs. The centring
// runs T.centerRunning, the product's own function, not a copy.
//
// The report lands in <pre id="wf-measure">; tools/measure-main.ps1 dumps that DOM with headless
// Chrome and asserts against evidence/preview/main-expect.json, which THIS script derives from the
// same model — no expected number is hardcoded in the checker.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'evidence', 'preview');
fs.mkdirSync(OUT, { recursive: true });

/* --- load the built bundle (same seam as the self-tests) ------------------- */
const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
const loaded = { definition: null };
new Function('window', source)({ __ModuleLoader__: { load: (definition) => (loaded.definition = definition) } });

function createElement(type, props, ...children) {
  const flat = [];
  for (const child of children) {
    if (Array.isArray(child)) flat.push(...child.flat(Infinity));
    else flat.push(child);
  }
  return { type, props: props || {}, children: flat.filter((c) => c !== null && c !== undefined && c !== false && c !== '') };
}
const reactStub = {
  createElement,
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
};
const T = loaded.definition.factory((name) => {
  if (name === 'react') return reactStub;
  throw new Error('unexpected require: ' + name);
}).__test;

/* --- mock shell: the panel is the MAIN COLUMN's occupant (the real seat) --- */
const DARK_TOKENS = `
  :root{--mock-bg:#0f1116;--mock-fg:#e9ecf3;--mock-dim:#9aa3b2;--mock-border:#2a2f3a;
    --mock-row:#181b22}
`;
// LIGHT theme with the HOST's real values, not an invented palette. In the shipped app both layer
// variables resolve to `--dsw-static-neutral-bluish-00` (#fff), so layer-1 and layer-2 are the same
// colour as the page — that is exactly why a card painted with bg-layer-2 and a transparent border
// disappeared against the background. The harness has to reproduce those values or it would keep
// passing while the product fails.
const LIGHT_TOKENS = `
  :root{--mock-bg:#ffffff;--mock-fg:#0f1115;--mock-dim:#61666b;--mock-border:rgba(0,0,0,.10);
    --mock-row:#ffffff;
    --dsw-alias-bg-base:#ffffff;--dsw-alias-bg-layer-1:#ffffff;--dsw-alias-bg-layer-2:#ffffff;
    --dsw-alias-bg-overlay:#ffffff;--dsw-alias-border-l1:rgba(0,0,0,.04);--dsw-alias-border-l2:rgba(0,0,0,.10);
    --dsw-alias-brand-primary:#4d6bfe;--dsw-alias-label-primary:#0f1115;
    --dsw-alias-label-secondary:#61666b;--dsw-alias-label-tertiary:#81858c;
    --dsw-alias-state-success-primary:#0f9d58;--dsw-alias-state-warn-primary:#b26a00;
    --dsw-alias-state-error-primary:#c62828;--dsw-alias-state-idle-primary:#81858c}
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
      <div class="mock-row">任务</div>
      <div class="mock-row active">工作流</div>
      <div class="mock-row">插件</div>
    </aside>
    <main class="mock-main" id="wf-slot"><!-- mounted by the page script --></main>
  </div>
`;

/* --- the synthetic view --------------------------------------------------- */
const T0 = 1792243000000;
const STEP_TITLES = [
  '骨架与最小注册',
  '宿主投影与折叠',
  '宿主读取 PAE 计划',
  '宿主 HTTP 视图路由',
  '浏览器壳与挂载点',
  '分步卡片与进度条',
  '色流分支与圆图标',
  '节点详情与分步详情',
  '面板设置与导出',
  '总验收与交付',
];
const RUNNING_AT = 4;
const toolNode = (id, tool, title, at, extra) => ({
  id,
  kind: 'tool',
  tool,
  title,
  detail: 'path=D:/proj/' + id,
  argsText: '{"file_path":"D:/proj/' + id + '"}',
  files: [],
  resultHead: 'ok',
  error: '',
  at,
  durationMs: 240,
  ...extra,
});
const nodes = [];
const stepNodes = STEP_TITLES.map(() => []);
const EXTS = ['.md', '.md', '.py', '.dxf', '.step', '.json'];
for (let step = 0; step < STEP_TITLES.length; step += 1) {
  const count = step === RUNNING_AT ? 12 : step < RUNNING_AT ? 6 : 3;
  for (let i = 0; i < count; i += 1) {
    const id = 's' + step + 'n' + i;
    const ext = EXTS[(i + step) % EXTS.length];
    nodes.push(
      toolNode(id, ext === '.py' ? 'pwsh' : i % 3 === 0 ? 'edit' : 'read', (i % 3 === 0 ? 'edit' : 'read') + ' f' + i + ext, T0 - (10 - step) * 60000 + i * 500, {
        stepIndex: step,
        resultHead: step === RUNNING_AT && i === count - 1 ? '' : 'ok',
        files: [{ path: 'D:/proj/src/file-' + i + ext, action: i % 3 === 0 ? '改' : '读' }],
      })
    );
    stepNodes[step].push(id);
  }
}
const steps = STEP_TITLES.map((title, index) => ({
  index,
  title,
  status: index < RUNNING_AT ? 'done' : index === RUNNING_AT ? 'running' : 'pending',
  percent: index < RUNNING_AT ? 100 : index === RUNNING_AT ? 58 : null,
  percentSource: index <= RUNNING_AT ? 'model' : 'none',
  nodeIds: stepNodes[index],
  nodeCount: stepNodes[index].length,
  groups: [],
}));
const runningView = {
  asOf: T0 - 5000,
  steps,
  nodes,
  active: { stepIndex: RUNNING_AT, nodeId: stepNodes[RUNNING_AT][stepNodes[RUNNING_AT].length - 1] },
  counts: { steps: steps.length, nodes: nodes.length, running: 1, completed: RUNNING_AT },
};

/* --- the expectation file the checker reads ------------------------------- */
const model = T.buildModel(runningView, T.defaultPrefs(), T0);
const expect = {
  unitGap: T.constants().unitGap,
  unitLink: T.constants().unitLink,
  satellite: T.constants().satellite,
  satLink: T.constants().satLink,
  sideSlots: T.constants().sideSlots,
  pagePad: T.constants().pagePad,
  steps: steps.length,
  runningIndex: RUNNING_AT,
  runningSats: (() => {
    const unit = model.page.units[RUNNING_AT];
    return { left: unit.left.length, right: unit.right.length, live: unit.types.filter((one) => one.running).length };
  })(),
  injectBanner: T.makeSay(undefined)('panel.inject.banner'),
};
fs.writeFileSync(path.join(OUT, 'main-expect.json'), JSON.stringify(expect, null, 2), 'utf8');

/* --- the page script ------------------------------------------------------ */
function pageScript({ mode, prefsPatch }) {
  return `
(function () {
  var MODE = ${JSON.stringify(mode)};
  var PREFS_PATCH = ${JSON.stringify(prefsPatch || {})};
  var VIEW = ${JSON.stringify(runningView)};
  var NOW = ${T0};
  var EXPECT = ${JSON.stringify(expect)};

  var definition = window.__wfDef;
  if (!definition) { emit([{ phase: 'error', error: 'bundle did not register' }]); return; }
  var T = definition.factory(function (name) {
    if (name === 'react') return { createElement: function (type, props) {
      var node = { type: type, props: props || {}, children: [].slice.call(arguments, 2) };
      return node;
    } };
    throw new Error('unexpected require: ' + name);
  }).__test;
  var say = T.makeSay(undefined);
  var host = document.getElementById('wf-slot');

 /* a real DOM mount of the renderer's own tree (handlers included) */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function mount(node) {
    if (node === null || node === undefined || node === false) return null;
    if (typeof node === 'string' || typeof node === 'number') return document.createTextNode(String(node));
    if (Array.isArray(node)) { var frag = document.createDocumentFragment(); node.forEach(function (c) { var m = mount(c); if (m) frag.appendChild(m); }); return frag; }
    var el = node.type === 'svg' ? document.createElementNS(SVG_NS, 'svg') : document.createElement(node.type);
    Object.keys(node.props || {}).forEach(function (name) {
      var value = node.props[name];
      if (value === undefined || value === null || typeof value === 'function') return;
      if (name === 'children') return;
      if (name === 'className') { el.setAttribute('class', value); return; }
      if (name === 'style' && typeof value === 'object') { Object.keys(value).forEach(function (k) { el.style[k] = value[k]; }); return; }
      el.setAttribute(name, String(value));
    });
    if (typeof node.props.onClick === 'function') el.addEventListener('click', node.props.onClick);
    (node.children || []).forEach(function (child) { var m = mount(child); if (m) el.appendChild(m); });
    return el;
  }

 /* the mini state: the same prefs → re-render loop the React component runs */
  var state = { prefs: Object.assign({}, T.defaultPrefs(), PREFS_PATCH), openCall: null };
  function setPrefs(patch) {
    var next = Object.assign({}, state.prefs);
    Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
    state.prefs = next;
  }
  var actions = {
    onCollapse: function () {}, onExpand: function () {}, onToggleSettings: function () {},
    onReset: function () {}, onCopy: function () {}, onInjectText: function () {},
    onInjectSend: function () {}, onInjectCancel: function () { setPrefs({ rightOpen: false }); render(); },
    onOpenStep: function (index) { state.openCall = null; setPrefs({ selectedStep: index, rightOpen: true, rightKind: 'step', rightKey: 'step:' + index }); render(); },
    onOpenType: function (index, key) {
      state.openCall = null;
      var patch = { rightOpen: true, rightKind: 'type', rightKey: (index === null ? 'session' : index) + '|' + key };
      if (index !== null) patch.selectedStep = index;
      setPrefs(patch); render();
    },
    onSelectCall: function (id) { state.openCall = state.openCall === id ? null : id; render(); },
    onClosePage: function () { state.openCall = null; setPrefs({ rightOpen: false }); render(); },
    onToggleInject: function () {
      var open = state.prefs.rightOpen === true && state.prefs.rightKind === 'inject';
      setPrefs(open ? { rightOpen: false } : { rightOpen: true, rightKind: 'inject' });
      render();
    },
  };
  function render() {
    var model = T.buildModel(VIEW, state.prefs, NOW);
    var right = T.rightPageSpec(model, state.prefs);
    var tree = T.renderPanel(model, state.prefs, say, actions, {
      settingsOpen: false, status: 'live', error: '', rev: 1,
      endpoint: '/dsh-workflow/state?sessionId=session-main', nodeTotal: VIEW.nodes.length,
      right: right, pageStep: right ? right.stepIndex : null, pageType: right ? right.openType : null,
      openCall: state.openCall, asOf: model.asOf, motion: 'css', idle: false,
      injectState: 'idle', injectText: '', injectReason: '', sessionId: 'session-main',
    });
    host.innerHTML = '';
    host.appendChild(mount(tree));
    return model;
  }

  function round(n) { return Math.round(n * 100) / 100; }
  function box(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { left: round(r.left), top: round(r.top), width: round(r.width), height: round(r.height), right: round(r.right), bottom: round(r.bottom) };
  }
  function styleOf(el, pseudo) {
    if (!el) return null;
    var cs = getComputedStyle(el, pseudo || null);
    return {
      animationName: cs.animationName, animationDuration: cs.animationDuration,
      backgroundImage: cs.backgroundImage, borderRadius: cs.borderTopLeftRadius,
      maskComposite: cs.maskComposite || cs.webkitMaskComposite || '', content: cs.content
    };
  }
  function unitReport() {
    var units = [].slice.call(document.querySelectorAll('.wf-unit'));
    var cards = [].slice.call(document.querySelectorAll('.wf-unit-card'));
    var boxes = cards.map(box);
    var gaps = [];
    for (var i = 0; i + 1 < boxes.length; i += 1) gaps.push(round(boxes[i + 1].top - boxes[i].bottom));
    var links = [].slice.call(document.querySelectorAll('.wf-unit-link')).map(function (link) {
      var b = box(link);
      return { width: b.width, height: b.height, done: link.getAttribute('data-done') };
    });
    return { count: units.length, cardCount: cards.length, gaps: gaps, links: links };
  }
  function satReport() {
    var sats = [].slice.call(document.querySelectorAll('.wf-sat'));
    var rows = [].slice.call(document.querySelectorAll('.wf-sat-row'));
    var live = sats.filter(function (s) { return s.getAttribute('data-live') === 'true'; });
    var liveRow = rows.filter(function (r) { return r.getAttribute('data-live') === 'true'; })[0];
    return {
      count: sats.length,
      left: sats.filter(function (s) { return s.getAttribute('data-side') === 'left'; }).length,
      right: sats.filter(function (s) { return s.getAttribute('data-side') === 'right'; }).length,
      live: live.length,
      boxes: sats.map(function (s) { var b = box(s); return { w: b.width, h: b.height, side: s.getAttribute('data-side'), type: s.getAttribute('data-type') }; }),
      square: sats.every(function (s) { var b = box(s); var cs = getComputedStyle(s); return Math.abs(b.width - b.height) <= 0.5 && cs.borderTopLeftRadius === '50%'; }),
      liveRing: live.length ? styleOf(live[0], '::after') : null,
      liveLine: liveRow && liveRow.querySelector('.wf-sat-line') ? styleOf(liveRow.querySelector('.wf-sat-line')) : null,
      inside: (function () {
        var scroll = document.querySelector('[data-dsh-workflow-map="page-scroll"]');
        var s = box(scroll);
        if (!s) return false;
        return sats.every(function (one) { var b = box(one); return b.left >= s.left - 0.5 && b.right <= s.right + 0.5; });
      })()
    };
  }
  function unitRingReport() {
    var unit = document.querySelector('.wf-unit[data-status="running"] .wf-unit-card');
    return unit ? styleOf(unit, '::after') : null;
  }
  function centerReport() {
    var scroll = document.querySelector('[data-dsh-workflow-map="page-scroll"]');
    var unit = document.querySelector('.wf-unit[data-status="running"]');
    if (!scroll || !unit) return null;
    var s = box(scroll);
    var u = box(unit);
    return { scrollTop: round(scroll.scrollTop), error: round((u.top + u.height / 2) - (s.top + s.height / 2)), scrollHeight: round(scroll.scrollHeight), viewport: round(s.height) };
  }
  function rightReport() {
    var right = document.querySelector('[data-dsh-workflow-map="right"]');
    if (!right) return { open: false };
    var b = box(right);
    return {
      open: true, kind: right.getAttribute('data-kind'), width: b.width,
      title: (right.querySelector('.wf-right-title') || {}).textContent || '',
      calls: right.querySelectorAll('[data-dsh-workflow-map="call"]').length,
      typeRows: right.querySelectorAll('[data-dsh-workflow-map="type-row"]').length,
      stepDetail: right.querySelectorAll('[data-dsh-workflow-map="step-detail"]').length,
      inject: right.querySelectorAll('[data-dsh-workflow-map="inject"]').length,
      nodeDetail: right.querySelectorAll('[data-dsh-workflow-map="node-detail"]').length
    };
  }
  function headerReport() {
    var button = document.querySelector('[data-dsh-workflow-map="inject-toggle"]');
    if (!button) return null;
    var b = box(button);
    var cs = getComputedStyle(button);
 // session7: the header button is painted with a SOLID brand fill via the CSS var
 // --dsw-alias-brand-primary, so the honest fact is backgroundColor — backgroundImage is
 // 'none' on that rule and always was.
    return { text: (button.textContent || '').trim(), width: b.width, height: b.height, background: cs.backgroundImage, backgroundColor: cs.backgroundColor };
  }
  // CONTRAST PROBE. The light theme paints the page and both layer variables the same colour (#fff
  // in the shipped app), so a card is only visible if its own fill is lifted and its border is not
  // transparent. These read COMPUTED styles of real elements, so a rule that a self-test can see but
  // the browser drops (unsupported syntax, lost cascade) still fails here.
  function contrastReport() {
    function probe(selector) {
      var el = document.querySelector(selector);
      if (!el) return null;
      var cs = getComputedStyle(el);
      var rect = el.getBoundingClientRect();
      return {
        selector: selector,
        background: cs.backgroundColor,
        backgroundImage: cs.backgroundImage,
        borderColor: cs.borderTopColor,
        borderWidth: cs.borderTopWidth,
        w: Math.round(rect.width), h: Math.round(rect.height)
      };
    }
    var rootEl = document.querySelector('.wf-root');
    var rootStyle = rootEl ? getComputedStyle(rootEl) : null;
    // The page colour is what the host paints behind everything; .wf-root itself is
    // transparent, so asking it for a background returns rgba(0,0,0,0) and proves nothing.
    var pageStyle = getComputedStyle(document.body);
    return {
      dark: document.body.hasAttribute('data-ds-dark-theme'),
      pageBackground: pageStyle.backgroundColor,
      pageImage: pageStyle.backgroundImage,
      page: probe('.wf-root') || probe('body'),
      // surfaces that actually exist on the live single page; the legacy step/node
      // cards are checked at the stylesheet level in selftest-panel instead
      unit: probe('.wf-unit-card'),
      satCount: probe('.wf-sat-count'),
      branchIcon: probe('.wf-branch-icon'),
      capsule: probe('.wf-capsule-bar'),
      lift: rootStyle ? rootStyle.getPropertyValue('--wf-lift').trim() : '',
      lift2: rootStyle ? rootStyle.getPropertyValue('--wf-lift-2').trim() : ''
    };
  }
  function report(phase, extra) {
    return {
      phase: phase, units: unitReport(), sats: satReport(), ring: unitRingReport(),
      center: centerReport(), right: rightReport(), header: headerReport(), contrast: contrastReport(), extra: extra || null
    };
  }
  function emit(phases) {
    var pre = document.createElement('pre');
    pre.id = 'wf-measure';
    pre.textContent = JSON.stringify({ phases: phases, expect: EXPECT }, null, 2);
    document.body.appendChild(pre);
  }
  function click(el) { if (el) el.click(); }

 // the mini component's centring policy: the product's own wfShouldCenter with the SAME state the
 // hook keeps (centeredStep + scrolled), applied after every render exactly like the effect does.
  var centeredStep = null;
  var scrolled = false;
  function autoCenter(model) {
    var running = model && model.page ? model.page.runningIndex : null;
    if (!T.shouldCenter(running, centeredStep, scrolled)) return { applied: false, reason: 'policy' };
    var result = T.centerRunning(document, running);
    if (result.applied === true) centeredStep = running;
    return result;
  }

  function run() {
    var phases = [];
    var model = render();
 // centring: the product's OWN policy + function, then the measured truth afterwards
    var centering = autoCenter(model);
    phases.push(report('initial', { centering: centering }));
    click(document.querySelector('.wf-unit[data-status="running"] .wf-unit-card'));
    phases.push(report('after-unit-click'));
    var sat = document.querySelector('.wf-unit[data-status="running"] .wf-sat');
    if (sat) { click(sat); phases.push(report('after-sat-click')); }
    var call = document.querySelector('[data-dsh-workflow-map="call"]');
    if (call) { click(call); phases.push(report('after-call-click')); }
    click(document.querySelector('[data-dsh-workflow-map="inject-toggle"]'));
    phases.push(report('after-inject-click'));
    click(document.querySelector('[data-dsh-workflow-map="page-close"]'));
    var afterClose = report('after-close');
 // 6. the manual scroll: the wheel event marks "scrolled" (the product's guard), the user's own
 // 6. the manual scroll: the wheel event marks "scrolled" (the product's guard), the user's own
 // scroll moves the chain, and a re-render after that must NOT re-centre it.
    var scroll = document.querySelector('[data-dsh-workflow-map="page-scroll"]');
    if (scroll) {
 // session7: establish a REAL offset first — after the earlier phases the scroller sits at 0,
 // so "before - 240" used to clamp to 0 and the check could not tell a scroll from a no-op.
      scroll.scrollTop = scroll.scrollHeight;
      var before = round(scroll.scrollTop);
      scroll.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
      scrolled = true;
      scroll.scrollTop = Math.max(0, before - 240);
      var reRendered = render();
      var again = autoCenter(reRendered);
      afterClose.afterScroll = { before: before, after: round(scroll.scrollTop), recentered: again.applied === true, max: round(scroll.scrollHeight) };
    }
    phases.push(afterClose);
    emit(phases);
  }
  function single() {
    var model = render();
    var centering = autoCenter(model);
    emit([report('initial', { centering: centering })]);
  }
  window.addEventListener('load', function () {
    window.setTimeout(MODE === 'dynamic' ? run : single, 300);
  });
})();
  `;
}

/* --- build the pages ------------------------------------------------------ */
function buildPage({ file, title, mode, prefsPatch, theme }) {
  const tokens = theme === 'light' ? LIGHT_TOKENS : DARK_TOKENS;
  const bodyAttr = theme === 'light' ? '' : ' data-ds-dark-theme="dark"';
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${tokens}${mockCss}${T.css()}</style></head><body${bodyAttr}>${mockApp}
<script>window.__ModuleLoader__ = { load: function (definition) { window.__wfDef = definition; } };</script>
<script src="../../client.js"></script>
<script>${pageScript({ mode, prefsPatch })}</script>
</body></html>`;
  fs.writeFileSync(path.join(OUT, file), html, 'utf8');
  return { file, bytes: Buffer.byteLength(html, 'utf8') };
}

const esc = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const written = [];
written.push(buildPage({ file: 'main-dark.html', title: 'workflow-map single page', mode: 'dynamic' }));
written.push(
  buildPage({
    file: 'main-page-open.html',
    title: 'workflow-map single page (right page open)',
    mode: 'single',
    prefsPatch: { rightOpen: true, rightKind: 'step', rightKey: 'step:' + RUNNING_AT, selectedStep: RUNNING_AT },
  })
);
written.push(buildPage({ file: 'main-light.html', title: 'workflow-map single page (light theme)', mode: 'dynamic', theme: 'light' }));
written.push(buildPage({ file: 'main-narrow.html', title: 'workflow-map single page (narrow)', mode: 'single' }));
for (const one of written) process.stdout.write(`wrote evidence/preview/${one.file} (${one.bytes} bytes)\n`);
process.stdout.write(`units=${steps.length} running=${RUNNING_AT} satellites=${expect.runningSats.left}+${expect.runningSats.right}\n`);
