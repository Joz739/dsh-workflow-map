// preview-typeflow.mjs — the type page (the old "flow column"'s successor) as a browser page.
//
// Run: node tools/preview-typeflow.mjs (then pwsh -File tools\measure-flow.ps1)
//
// replaced the two-column layout with ONE page: a step's flow is no longer a column of
// node cards, it is the RIGHT PAGE's per-type call list (RightPage.js wfRenderTypeBody). The old
// measure-flow.ps1 measured the retired column (60-node window, fold rows, an "expand all" strip) and
// scored 7/27. This page measures what a type page really promises today:
//
// selected-step type page the calls of exactly that bucket, in wire order, each row a button
// carrying the node id, its status dot, a verb · target label and
// aria-expanded — the honest successor of "the step's flow";
// the cap, honestly stated a bucket's `count` counts FILE occurrences while its `nodes` list
// calls: three .md files on one call render ONE row and the page says
// "N more calls were not sent with the view" instead of inventing two rows;
// the session-scope page merges every step's bucket but can dereference no calls (the wire
// ships only the selected step's nodes) -> it says "no call of this type to list
// yet" rather than listing ids it cannot resolve;
// the stale key a (kind, key) pair that no longer resolves CLOSES the page instead
// of showing somebody else's record;
// the interaction clicking a call opens wfRenderNodeDetail under it (aria-expanded
// flips, the detail mounts), and Escape runs the panel's own binding.
//
// The pages mount the renderer's own tree into a live DOM with the real WF_CSS and the real
// handlers (a mini prefs state, exactly the component's updatePrefs loop). Expectations land in
// evidence/preview/typeflow-expect.json, derived from the same model — nothing hardcoded here.
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

/* --- the synthetic view: one call with THREE .md files (count 3, listed 1) -- */
const T0 = 1792243000000;
const nodes = [
  {
    id: 'a1', stepIndex: 0, kind: 'tool', tool: 'read', title: 'read three notes',
    detail: 'paths=3', argsText: '{"paths":["n1.md","n2.md","n3.md"]}',
    files: [
      { path: 'D:\\proj\\notes\\n1.md', action: '读' },
      { path: 'D:\\proj\\notes\\n2.md', action: '读' },
      { path: 'D:\\proj\\notes\\n3.md', action: '读' },
    ],
    resultHead: 'ok', error: '', at: T0 + 1000, durationMs: 30, seq: 201,
  },
  {
    id: 'a2', stepIndex: 0, kind: 'tool', tool: 'edit', title: 'edit app.js',
    detail: 'path=D:/proj/app.js', argsText: '{"file_path":"D:/proj/app.js"}',
    files: [{ path: 'D:\\proj\\app.js', action: '改' }],
    resultHead: 'saved', error: '', at: T0 + 2000, durationMs: 12, seq: 202,
  },
  {
    id: 'b1', stepIndex: 1, kind: 'tool', tool: 'read', title: 'read spec', detail: 'path=spec.md',
    argsText: '{"path":"spec.md"}', files: [{ path: 'D:\\proj\\spec.md', action: '读' }],
    resultHead: 'ok', error: '', at: T0 + 3000, durationMs: 9, seq: 203,
  },
];
const steps = [
  { index: 0, title: '正在读取的三份笔记', status: 'running', percent: 55, percentSource: 'model', startedAt: T0, endedAt: null, nodeIds: ['a1', 'a2'], nodeCount: 2, groups: [] },
  { index: 1, title: '规格与收尾', status: 'done', percent: 100, percentSource: 'model', startedAt: T0 + 3000, endedAt: T0 + 9000, nodeIds: ['b1'], nodeCount: 1, groups: [] },
];
const view = {
  asOf: T0 + 4000, task: 'type-page measure', steps, nodes,
  active: { stepIndex: 0, nodeId: 'a1' },
  counts: { steps: 2, nodes: 3, running: 1, completed: 1 },
};

/* --- expectations from the product's own model ------------------------------ */
const prefs0 = Object.assign({}, T.defaultPrefs(), { selectedStep: 0 });
const model0 = T.buildModel(view, prefs0, T0 + 4000);
const keyFor = (unitIndex, nodeId) => {
  const unit = model0.page.units[unitIndex];
  const types = unit && Array.isArray(unit.types) ? unit.types : [];
  for (const one of types) if (Array.isArray(one.nodes) && one.nodes.indexOf(nodeId) >= 0) return one.key;
  return types.length ? types[0].key : null;
};
const mdKey = keyFor(0, 'a1'); // the bucket that counts three .md files on ONE call
const mdBucket = model0.page.units[0].types.filter((one) => one.key === mdKey)[0];
const expect = {
  pages: ['panel-typeflow-live.html'],
  mdKey,
  bucketCount: mdBucket.count,
  listedCalls: mdBucket.nodes.length,
  truncatedBy: mdBucket.count - mdBucket.nodes.length,
  truncatedText: '另有 ' + (mdBucket.count - mdBucket.nodes.length) + ' 处调用未随视图发送',
  typeEmptyText: '这一类还没有可列出的调用',
  wholeSessionText: '整个会话',
  callLabel: 'read · read three notes',
  sessionKey: mdKey,
  staleKey: '9|file:.nope',
};
fs.writeFileSync(path.join(OUT, 'typeflow-expect.json'), JSON.stringify(expect, null, 2), 'utf8');

/* --- the page script -------------------------------------------------------- */
function pageScript() {
  return `
(function () {
  var VIEW = ${JSON.stringify(view)};
  var T0 = ${T0 + 4000};
  var EXPECT = ${JSON.stringify(expect)};

  var report = { page: 'panel-typeflow-live', error: '', facts: {}, steps: [] };
  function finish() {
    var pre = document.createElement('pre');
    pre.id = 'wf-measure';
    pre.textContent = JSON.stringify(report);
    document.body.appendChild(pre);
  }
  function first(sel, root) { return (root || document).querySelector(sel); }
  function all(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
  function text(el) { return el ? el.textContent : ''; }
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  async function main() {
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

 // The mini prefs state: exactly the component's updatePrefs → re-render loop.
    var state = { selectedStep: 0, rightOpen: true, rightKind: 'type', rightKey: '0|' + EXPECT.mdKey, openCall: null, closes: 0 };
    var noop = function () {};
    var actions = {
      onCollapse: noop, onExpand: noop, onToggleSettings: noop, onReset: noop, onToggleInject: noop,
      onOpenType: noop, onCopy: noop, onSetting: noop,
      onOpenStep: function (index) {
        state.selectedStep = index; state.openCall = null;
        state.rightOpen = true; state.rightKind = 'step'; state.rightKey = 'step:' + index;
        render();
      },
      onSelectCall: function (id) { state.openCall = state.openCall === id ? null : id; render(); },
      onClosePage: function () { state.openCall = null; state.rightOpen = false; state.closes += 1; render(); },
      onEscapeDetail: function () { state.openCall = null; state.rightOpen = false; state.closes += 1; render(); },
    };
    function render() {
      var p = Object.assign({}, T.defaultPrefs(), {
        selectedStep: state.selectedStep, rightOpen: state.rightOpen,
        rightKind: state.rightKind, rightKey: state.rightKey,
      });
      var model = T.buildModel(VIEW, p, T0);
      var right = T.rightPageSpec(model, p);
      var tree = T.renderPanel(model, p, say, actions, {
        settingsOpen: false, status: 'live', error: '', rev: 7,
        endpoint: '/dsh-workflow/state?sessionId=session-typeflow', nodeTotal: VIEW.nodes.length,
        right: right, pageStep: right ? right.stepIndex : null, pageType: right ? right.openType : null,
        openCall: state.openCall, asOf: model.asOf, motion: 'css', idle: false, sessionId: 'session-typeflow',
      });
      host.innerHTML = '';
      host.appendChild(mount(tree));
      return { model: model, right: right };
    }
    function snapshot(label) {
      var rightEl = first('[data-dsh-workflow-map="right"]');
      var body = first('[data-dsh-workflow-map="body"], .wf-body');
      var calls = all('[data-dsh-workflow-map="call"]').map(function (row) {
        return {
          id: row.getAttribute('data-node-id'),
          open: row.getAttribute('data-open'),
          expanded: row.getAttribute('aria-expanded'),
          text: text(first('.wf-call-main', row) || row),
          status: first('.wf-flow-status', row) ? first('.wf-flow-status', row).getAttribute('data-status') : null,
        };
      });
      return {
        label: label,
        rightOpen: !!rightEl,
        kind: rightEl ? rightEl.getAttribute('data-kind') : null,
        title: rightEl ? text(first('.wf-right-title', rightEl)) : '',
        sub: rightEl ? text(first('.wf-page-sub', rightEl)) : '',
        bodyRight: body ? body.getAttribute('data-right') : null,
        calls: calls,
        emptyText: text(first('.wf-empty')),
        truncNote: text(first('.wf-detail-note')),
        nodeDetail: all('[data-dsh-workflow-map="node-detail"]').length,
        sats: all('[data-dsh-workflow-map="sat"]').map(function (s) {
          return { type: s.getAttribute('data-type'), open: s.getAttribute('data-open'), pressed: s.getAttribute('aria-pressed') };
        }),
        typeRows: all('[data-dsh-workflow-map="type-row"]').map(function (r) {
          return { type: r.getAttribute('data-type'), open: r.getAttribute('data-open') };
        }),
      };
    }

    render();
    report.steps.push(snapshot('selectedStepTypePage'));

 // the honest cap: one row, three files, and the page says two more calls were not sent
    var firstCall = first('[data-dsh-workflow-map="call"]');
    if (firstCall) { firstCall.click(); await delay(80); report.steps.push(snapshot('afterCallClick')); }
    var again = first('[data-dsh-workflow-map="call"]');
    if (again) { again.click(); await delay(80); report.steps.push(snapshot('afterSecondClick')); }

 // the session-scope page: merged bucket, no dereferenceable calls
    state.selectedStep = 0; state.rightKind = 'type'; state.rightKey = 'session|' + EXPECT.sessionKey; state.openCall = null;
    render();
    report.steps.push(snapshot('sessionScope'));

 // a (kind,key) pair that no longer resolves closes the page
    state.rightKind = 'type'; state.rightKey = EXPECT.staleKey;
    render();
    report.steps.push(snapshot('staleKey'));

 // Escape: the panel's own binding, through the product's code
    state.rightKind = 'type'; state.rightKey = '0|' + EXPECT.sessionKey; state.rightOpen = true;
    render();
    var opened = !!first('[data-dsh-workflow-map="right"]');
    var bind = T.bindEscape(document, actions);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    bind.destroy();
    report.facts.escape = { opened: opened, closes: state.closes, rightOpen: !!first('[data-dsh-workflow-map="right"]') };

 // a stale page never invents a title
    report.facts.expect = EXPECT;
    finish();
  }

  main().catch(function (error) {
    report.error = String(error && error.stack ? error.stack : error);
    finish();
  });
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

const written = [buildPage({ file: 'panel-typeflow-live.html' })];
for (const one of written) process.stdout.write(`wrote evidence/preview/${one.file} (${one.bytes} bytes)\n`);
process.stdout.write(`md bucket ${expect.mdKey}: count=${expect.bucketCount} listed=${expect.listedCalls} note="${expect.truncatedText}"\n`);
