// preview-branches.mjs — the step's parallel interfaces (the branch lanes' successor), as a page.
//
// Run: node tools/preview-branches.mjs (then pwsh -File tools\measure-branches.ps1)
//
// replaced the two-column layout (and with it the SUBAGENT/BACKGROUND-JOB lanes of
// Branches.js) with ONE page. What carries "this step's parallel work" now: the unit's ROUND
// SATELLITES — one per tool/file-type bucket, stacked on the left/right of the card, each a real
// <button> that opens that type's call list. The old measure-branches.ps1 measured the lanes
// (6 px coloured links, lane hues, lane dots) and scored 21/22 with one failure on a retired rule.
//
// What this page measures instead, and why a tree assertion cannot:
//
// · the per-side slot cap (WF_SIDE_SLOTS = 2) really bites: a step with more types than slots
// draws at most 2 per side AND the card prints "N more types are not drawn on the sides" - the honest successor
// of the old 4-lane cap/banner;
// · every drawn satellite is a button carrying type / side / tone / count and an accessible name
// whose accessible name states the count ("... (...), 3 calls - click to see this type's calls");
// · the RUNNING bucket's satellite and its row carry data-live=true — the one animated lane;
// · clicking a satellite really opens that type's page (the product's onOpenType handler), and
// the satellite flips data-open/aria-pressed;
// · a step whose types fit shows NO dropped note at all.
//
// Expectations land in evidence/preview/branch-expect.json, derived from the product's own model.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'evidence', 'preview');
fs.mkdirSync(OUT, { recursive: true });

/* --- load the built bundle -------------------------------------------------- */
const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
const loaded = { definition: null };
new Function('window', source)({ __ModuleLoader__: { load: (definition) => (loaded.definition = definition) } });
const T = loaded.definition.factory((name) => {
  if (name === 'react') return { createElement: function (type, props) { return { type: type, props: props || {}, children: [].slice.call(arguments, 2) }; } };
  throw new Error('unexpected require: ' + name);
}).__test;

/* --- the mock shell --------------------------------------------------------- */
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

/* --- a crowded step (more types than slots) + a quiet one ------------------- */
const T0 = 1792243000000;
const node = (id, stepIndex, tool, files, at, extra) => ({
  id, stepIndex, kind: 'tool', tool, title: tool + ' ' + id,
  detail: 'target=' + id, argsText: '{"id":"' + id + '"}',
  files: files.map((p) => ({ path: p, action: tool === 'edit' ? '改' : '读' })),
  resultHead: 'ok', error: '', at, durationMs: 10, seq: at, ...extra,
});
const nodes = [
 // step 0 — reads .md, .js and .json, edits .py, runs pwsh + read: six buckets, both sides crowded
  node('s0a', 0, 'read', ['D:\\p\\a.md'], T0 + 100),
  node('s0b', 0, 'read', ['D:\\p\\b.js'], T0 + 200),
  node('s0c', 0, 'read', ['D:\\p\\c.json'], T0 + 300),
  node('s0d', 0, 'edit', ['D:\\p\\d.py'], T0 + 400),
  node('s0e', 0, 'pwsh', [], T0 + 500),
  node('s0f', 0, 'grep', [], T0 + 600, { error: 'boom' }),
 // step 1 — one bucket only: no dropped note anywhere
  node('s1a', 1, 'read', ['D:\\p\\only.md'], T0 + 700),
];
const steps = [
  { index: 0, title: '并行接口很挤的一步', status: 'running', percent: 48, percentSource: 'model', startedAt: T0, endedAt: null, nodeIds: ['s0a', 's0b', 's0c', 's0d', 's0e', 's0f'], nodeCount: 6, groups: [] },
  { index: 1, title: '只有一个接口的一步', status: 'done', percent: 100, percentSource: 'model', startedAt: T0 + 700, endedAt: T0 + 900, nodeIds: ['s1a'], nodeCount: 1, groups: [] },
];
const view = {
  asOf: T0 + 800, task: 'satellite measure', steps, nodes,
  active: { stepIndex: 0, nodeId: 's0e' },
  counts: { steps: 2, nodes: 7, running: 1, completed: 1 },
};

/* --- expectations from the product's own model ------------------------------ */
const prefs = Object.assign({}, T.defaultPrefs(), { selectedStep: 0 });
const model = T.buildModel(view, prefs, T0 + 800);
const crowded = model.page.units[0];
const quiet = model.page.units[1];
const sideSlots = T.constants().sideSlots;
const liveBucket = crowded.types.filter((one) => one.running === true)[0] || crowded.types[0];
const expect = {
  pages: ['panel-branches-live.html'],
  sideSlots,
  unitCount: steps.length,
  crowded: {
    types: crowded.types.length,
    left: crowded.left.length,
    right: crowded.right.length,
    droppedLeft: crowded.dropped.left,
    droppedRight: crowded.dropped.right,
    droppedTotal: crowded.dropped.left + crowded.dropped.right,
    noteText: '另有 ' + (crowded.dropped.left + crowded.dropped.right) + ' 类未画在两侧',
  },
  quiet: { types: quiet.types.length, left: quiet.left.length, right: quiet.right.length, droppedTotal: quiet.dropped.left + quiet.dropped.right },
  liveType: liveBucket.key,
  liveCount: liveBucket.count,
};
fs.writeFileSync(path.join(OUT, 'branch-expect.json'), JSON.stringify(expect, null, 2), 'utf8');

/* --- the page script -------------------------------------------------------- */
function pageScript() {
  return `
(function () {
  var VIEW = ${JSON.stringify(view)};
  var T0 = ${T0 + 800};
  var EXPECT = ${JSON.stringify(expect)};

  var report = { page: 'panel-branches-live', error: '', facts: {}, after: null };
  function finish() {
    var pre = document.createElement('pre');
    pre.id = 'wf-measure';
    pre.textContent = JSON.stringify(report);
    document.body.appendChild(pre);
  }
  function first(sel, root) { return (root || document).querySelector(sel); }
  function all(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
  function text(el) { return el ? el.textContent : ''; }
  function round(n) { return Math.round(n * 100) / 100; }

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
    if (typeof node.props.onClick === 'function') el.addEventListener('click', node.props.onClick);
    (node.children || []).forEach(function (child) { var m = mount(child); if (m) el.appendChild(m); });
    return el;
  }

  var state = { selectedStep: 0, rightOpen: false, rightKind: 'step', rightKey: null, openType: null };
  var noop = function () {};
  var actions = {
    onCollapse: noop, onExpand: noop, onToggleSettings: noop, onReset: noop, onToggleInject: noop,
    onCopy: noop, onSetting: noop, onSelectCall: noop,
    onOpenStep: function (index) {
      state.selectedStep = index; state.openType = null;
      state.rightOpen = true; state.rightKind = 'step'; state.rightKey = 'step:' + index;
      render();
    },
    onOpenType: function (index, key) {
      state.openType = key;
      if (index !== null && index !== undefined) state.selectedStep = index;
      state.rightOpen = true; state.rightKind = 'type';
      state.rightKey = (index === null || index === undefined ? 'session' : String(index)) + '|' + key;
      render();
    },
    onClosePage: function () { state.rightOpen = false; state.openType = null; render(); },
    onEscapeDetail: function () { state.rightOpen = false; state.openType = null; render(); },
  };
  function render() {
    var p = Object.assign({}, T.defaultPrefs(), {
      selectedStep: state.selectedStep, rightOpen: state.rightOpen,
      rightKind: state.rightKind, rightKey: state.rightKey,
    });
    var model = T.buildModel(VIEW, p, T0);
    var right = T.rightPageSpec(model, p);
    var tree = T.renderPanel(model, p, say, actions, {
      settingsOpen: false, status: 'live', error: '', rev: 9,
      endpoint: '/dsh-workflow/state?sessionId=session-branches', nodeTotal: VIEW.nodes.length,
      right: right, pageStep: right ? right.stepIndex : null, pageType: right ? right.openType : null,
      openCall: null, asOf: model.asOf, motion: 'css', idle: false, sessionId: 'session-branches',
    });
    host.innerHTML = '';
    host.appendChild(mount(tree));
    return model;
  }

  function unitFacts(index) {
    var unit = first('.wf-unit[data-step-index="' + index + '"]');
    if (!unit) return null;
    var sats = all('[data-dsh-workflow-map="sat"]', unit).map(function (s) {
      var b = s.getBoundingClientRect();
      return {
        type: s.getAttribute('data-type'),
        side: s.getAttribute('data-side'),
        tone: s.getAttribute('data-tone'),
        count: s.getAttribute('data-count'),
        live: s.getAttribute('data-live'),
        open: s.getAttribute('data-open'),
        pressed: s.getAttribute('aria-pressed'),
        label: s.getAttribute('aria-label'),
        tag: s.tagName.toLowerCase(),
        w: round(b.width),
        h: round(b.height),
      };
    });
    var rows = all('.wf-sat-row', unit).map(function (r) { return { side: r.getAttribute('data-side'), live: r.getAttribute('data-live') }; });
    return {
      index: index,
      sats: sats,
      rows: rows,
      left: sats.filter(function (s) { return s.side === 'left'; }).length,
      right: sats.filter(function (s) { return s.side === 'right'; }).length,
      note: text(first('.wf-unit-more', unit)),
      noteTitle: first('.wf-unit-more', unit) ? first('.wf-unit-more', unit).getAttribute('title') : null,
    };
  }

  render();
  report.facts.crowded = unitFacts(0);
  report.facts.quiet = unitFacts(1);
  report.facts.units = all('.wf-unit').length;
  report.facts.expect = EXPECT;

 // the live lane really attracts: a click on THE running bucket's satellite opens its page
  var liveSat = all('.wf-sat').filter(function (s) { return s.getAttribute('data-type') === EXPECT.liveType; })[0];
  if (liveSat) liveSat.click();
  var rightEl = first('[data-dsh-workflow-map="right"]');
  report.after = {
    clicked: !!liveSat,
    rightOpen: !!rightEl,
    kind: rightEl ? rightEl.getAttribute('data-kind') : null,
    title: rightEl ? text(first('.wf-right-title', rightEl)) : '',
    openSat: (function () {
      var again = all('.wf-sat').filter(function (s) { return s.getAttribute('data-type') === EXPECT.liveType; })[0];
      return again ? { open: again.getAttribute('data-open'), pressed: again.getAttribute('aria-pressed') } : null;
    })(),
  };
  finish();
})();
`;
}

function buildPage({ file }) {
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${file}</title>
<style>${DARK_TOKENS}${mockCss}${T.css()}</style></head><body>${mockApp}
<script>window.__ModuleLoader__ = { load: function (definition) { window.__wfDef = definition; } };</script>
<script src="../../client.js"></script>
<script>${pageScript()}</script>
</body></html>`;
  fs.writeFileSync(path.join(OUT, file), html, 'utf8');
  return { file, bytes: Buffer.byteLength(html, 'utf8') };
}

const written = [buildPage({ file: 'panel-branches-live.html' })];
for (const one of written) process.stdout.write(`wrote evidence/preview/${one.file} (${one.bytes} bytes)\n`);
process.stdout.write(`crowded: ${expect.crowded.types} types → ${expect.crowded.left}+${expect.crowded.right} drawn, note "${expect.crowded.noteText}"; live=${expect.liveType}\n`);
