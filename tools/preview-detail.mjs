// preview-detail.mjs — the node / step details ON THE RIGHT PAGE, rendered for a browser measurement.
//
// Run: node tools/preview-detail.mjs (then pwsh -File tools\measure-detail.ps1)
//
// session7 (2026-10-27) rewrote both halves to the single-page layout. The old pages
// fed wfRenderPanel the retired extras contract (flow / stepDetail / selectedNode), so the
// old run rendered NO details at all and 39 of 54 checks failed on missing nodes. Today the
// details live on the RIGHT PAGE, and the page's whole content is derived by
// T.rightPageSpec(model, prefs) from (rightOpen, rightKind, rightKey) — exactly what the
// React component passes. The five pages therefore only patch PREFS and let the product's
// own spec resolver mount:
//
// edit rightKind 'step' + rightKey 'step:0' → the step page: type summary rows +
// wfRenderStepDetail (report, artifacts, stats, copy rows)
// command rightKind 'type' + rightKey '1|<key>' + openCall 'p1' → the type page with the
// pwsh call expanded: wfRenderNodeDetail with the real <details> command block
// error rightKind 'type' + rightKey '2|<key>' + openCall 'err1' → the red error node
// noreport rightKind 'step' + rightKey 'step:2' → a step with no PAE report says so
// closed rightKind 'step' + rightKey 'step:0' → the step-detail's own × control folded
// the report away (closedStep drives wfStepDetailOpen — the state lives in the
// product's own pure functions)
//
// WHAT ONLY A REAL BROWSER PROVES (the tree self-test cannot): the monospace / pre-wrap
// CSS really applies, Clipboard/execCommand really run, Escape and the resize nudge fire
// on real events, and the rendered DOM carries no file body (the privacy rule).
//
// No expected value is hardcoded in the checker: the expectations land in
// evidence/preview/detail-expect.json, derived from the same view the pages render.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'evidence', 'preview');
fs.mkdirSync(OUT, { recursive: true });

/* --- load the built bundle (same seam as preview-main) ---------------------- */
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
    --mock-row:#181b22;--mock-me:#22304a}
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
      <div class="mock-row">当前会话</div>
      <div class="mock-row active">工作流</div>
    </aside>
    <main class="mock-main" id="wf-slot"><!-- mounted by the page script --></main>
  </div>
`;

/* --- the synthetic view ---------------------------------------------------- */
const T0 = 1792243000000;
const SECRET = 'WF_READ_BODY_SECRET_7f3a9d_should_never_render';
const LONG_COMMAND = (
  'pwsh -NoProfile -Command "Get-Content D:\\proj\\src\\client\\NodeDetail.js | Select-Object -First 200 | ForEach-Object { $_ }"' +
  ' # ' +
  'x'.repeat(120)
).slice(0, 200);

const NODE_DETAIL_PATH = 'D:\\proj\\src\\client\\NodeDetail.js';
const STEP_DETAIL_PATH = 'D:\\proj\\src\\client\\StepDetail.js';
const ARTIFACT_A = 'D:\\proj\\evidence\\step11-detail.md';
const ARTIFACT_B = 'D:\\proj\\evidence\\step11-measure.json';

const nodes = [
  {
    id: 'e1', stepIndex: 0, kind: 'tool', tool: 'edit', title: 'edit NodeDetail.js',
    detail: 'file_path=D:/proj/src/client/NodeDetail.js old_str=… new_str=…',
    argsText: '{"file_path":"D:\\\\proj\\\\src\\\\client\\\\NodeDetail.js","old_str":"…","new_str":"…"}',
    files: [
      { path: NODE_DETAIL_PATH, action: '改' },
      { path: STEP_DETAIL_PATH, action: '改' },
    ],
    resultHead: 'edited 2 blocks', error: '', at: T0 + 1000, durationMs: 42, seq: 101,
    content: SECRET, old_str: SECRET,
  },
  {
    id: 'p1', stepIndex: 0, kind: 'tool', tool: 'pwsh', title: 'pwsh Get-Content',
    detail: 'pwsh -NoProfile …', argsText: LONG_COMMAND,
    files: [{ path: 'D:\\proj\\src\\client', action: '查' }],
    resultHead: '', error: '', at: T0 + 2000, durationMs: 1200, seq: 102,
    content: SECRET,
  },
  {
    id: 'err1', stepIndex: 1, kind: 'tool', tool: 'read', title: 'read missing.json',
    detail: 'path=C:\\x\\missing.json', argsText: '{"path":"C:\\\\x\\\\missing.json"}',
    files: [{ path: 'C:\\x\\missing.json', action: '读' }],
    resultHead: '', error: 'ENOENT: no such file or directory, open C:\\x\\missing.json',
    at: T0 + 3000, durationMs: 7, seq: 103, content: SECRET,
  },
  {
    id: 'r1', stepIndex: 1, kind: 'tool', tool: 'read', title: 'read plan.md',
    detail: 'path=D:\\proj\\plan.md', argsText: '{"path":"D:\\\\proj\\\\plan.md"}',
    files: [{ path: 'D:\\proj\\plan.md', action: '读' }],
    resultHead: 'first line of plan.md', error: '', at: T0 + 4000, durationMs: 11, seq: 104,
    content: SECRET,
  },
];

const steps = [
  { index: 0, planIndex: 1, title: '实现写入与原子替换', status: 'done', percent: 100, percentSource: 'model', startedAt: T0, endedAt: T0 + 90000, nodeIds: ['e1', 'p1'], nodeCount: 2, groups: [] },
  { index: 1, planIndex: 2, title: '接入主流程并处理默认值', status: 'running', percent: 40, percentSource: 'model', startedAt: T0 + 95000, endedAt: null, nodeIds: ['err1', 'r1'], nodeCount: 3, groups: [] },
  { index: 2, planIndex: 3, title: '补充单元测试与错误分支', status: 'pending', percent: null, nodeIds: [], nodeCount: 0, groups: [] },
];

const plan = {
 ver: 1, phase: 'executing', task: '为示例 CLI 增加配置文件支持', taskTitle: '为示例 CLI 增加配置文件支持',
  summary: '', planDir: 'C:\\pae', pausedReason: '', stepIndex: 2, steps: [],
  stepReports: [
    { stepIndex: 1, status: 'success', summary: '点节点能看到工具、参数、文件、耗时与结果；路径一键复制。', artifacts: [ARTIFACT_A, ARTIFACT_B], exitCode: 0 },
    { stepIndex: 2, status: 'failed', summary: '复制路径时 Clipboard API 不可用，已回退 textarea。', artifacts: [], exitCode: 1 },
  ],
  statuses: { '1': 'completed', '2': 'in_progress', '3': 'pending' },
  anchorSeqs: { '1': 10, '2': 20 }, skipped: [], asOfMtime: 1,
  sourcePath: 'C:\\pae\\orchestrator.json',
};

const view = {
  asOf: T0 + 100000, task: plan.taskTitle, steps, nodes, plan,
  active: { stepIndex: 1, nodeId: 'r1' },
  counts: { steps: 3, nodes: 4, running: 1, completed: 1 },
};

/* --- resolve the type keys the pages will open (from the product's own model) -- */
const basePrefs = T.defaultPrefs();
const baseModel = T.buildModel(view, basePrefs, T0 + 100000);
// step 0's types, and the one key the command/error pages use (step 1's).
function typeKeyWithNode(unitIndex, nodeId) {
  const unit = baseModel.page.units[unitIndex];
  const types = unit && Array.isArray(unit.types) ? unit.types : [];
  for (const one of types) {
    if (Array.isArray(one.nodes) && one.nodes.indexOf(nodeId) >= 0) return one.key;
  }
  return types.length ? types[0].key : null;
}
// The step page's own record, exactly as the product builds it for step 0.
const modelStep0 = T.buildModel(view, Object.assign({}, basePrefs, { selectedStep: 0 }), T0 + 100000);
const step0Detail = modelStep0.detail;
// The type bucket that really holds the node each page expands — NOT a key by extension:
// p1's only path has no extension, so it lands in its own bucket.
const editTypeKey = typeKeyWithNode(0, 'e1');
const commandTypeKey = typeKeyWithNode(0, 'p1');
const errorTypeKey = typeKeyWithNode(1, 'err1');

/* --- expectations derived from the same model -------------------------------- */
const expect = {
  pages: ['panel-detail-edit-node.html', 'panel-detail-command.html', 'panel-detail-error.html', 'panel-detail-noreport.html', 'panel-detail-notloaded.html'],
  nodeDetailPath: NODE_DETAIL_PATH,
  stepDetailPath: STEP_DETAIL_PATH,
  artifactBaseA: 'step11-detail.md',
  artifactBaseB: 'step11-measure.json',
  reportSummary: plan.stepReports[0].summary,
  commandLength: LONG_COMMAND.length,
  command: LONG_COMMAND,
  errorText: 'ENOENT: no such file or directory, open C:\\x\\missing.json',
  noReportText: '这一步还没交报告',
  notLoadedText: '这一步的详情还没有随视图发送',
  errorColour: 'rgb(232, 90, 90)',
  stepCount: steps.length,
  artifactCount: 2,
  artifactPaths: [ARTIFACT_A, ARTIFACT_B],
 // Derived from the product's own step-detail builder, so the checker asserts what the model says.
  step0Tools: step0Detail.tools,
  step0Files: step0Detail.files,
  step0Nodes: step0Detail.nodes,
  unit0Types: modelStep0.page.units[0].types.length,
  previewClamp: '30px',
  argsClamp: '180px',
  exitCode: 0,
  secret: SECRET,
  commandTypeKey,
  errorTypeKey,
  editTypeKey,
};
fs.writeFileSync(path.join(OUT, 'detail-expect.json'), JSON.stringify(expect, null, 2), 'utf8');

/* --- the page script ------------------------------------------------------- */
function pageScript(config) {
  return `
(function () {
  var CFG = ${JSON.stringify(config)};
  var VIEW = ${JSON.stringify(view)};
  var T0 = ${T0 + 100000};
  var EXPECT = ${JSON.stringify(expect)};

  var report = { page: CFG.page, error: '', facts: {} };
  function finish() {
    var pre = document.createElement('pre');
    pre.id = 'wf-measure';
    pre.textContent = JSON.stringify(report);
    document.body.appendChild(pre);
  }
  function round(n) { return Math.round(n * 100) / 100; }
  function rect(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { left: round(r.left), top: round(r.top), width: round(r.width), height: round(r.height) };
  }
  function style(el, pseudo) {
    if (!el) return null;
    var cs = getComputedStyle(el, pseudo || null);
    return {
      fontFamily: cs.fontFamily, whiteSpace: cs.whiteSpace, maxHeight: cs.maxHeight,
      display: cs.display, color: cs.color, background: cs.backgroundColor
    };
  }
  function text(el) { return el ? el.textContent : ''; }
  function first(sel, root) { return (root || document).querySelector(sel); }
  function all(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
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

    var noop = function () {};
    var actions = {
      onCollapse: noop, onExpand: noop, onToggleSettings: noop, onSelectStep: noop, onReset: noop,
      onOpenStep: noop, onOpenType: noop, onSelectCall: noop, onClosePage: noop, onToggleInject: noop,
      onEscapeDetail: noop, onCopy: noop, onSetting: noop,
      onCloseStepDetail: function (index) { state.closedStep = index; render(); },
    };

 // The mini state: prefs drive the RIGHT PAGE exactly as the component's updatePrefs does.
    var state = { closedStep: null, openCall: CFG.openCall || null };
    function prefs() {
      return Object.assign({}, T.defaultPrefs(), {
        selectedStep: CFG.selectedStep,
        rightOpen: true, rightKind: CFG.rightKind, rightKey: CFG.rightKey,
      });
    }
    function render() {
      var p = prefs();
      var model = T.buildModel(VIEW, p, T0);
      var right = T.rightPageSpec(model, p);
 // The page's content IS the spec the product derives; nothing is patched here. A page
 // whose step is not the selected one gets stepDetail null from wfRightPageSpec itself
 // (that is the notloaded page: the panel says so instead of showing another step's report).
      var tree = T.renderPanel(model, p, say, actions, {
        settingsOpen: false, status: 'live', error: '', rev: 11,
        endpoint: '/dsh-workflow/state?sessionId=demo0000-demo-4demo-8demo-demo00000000', nodeTotal: VIEW.nodes.length,
        right: right, pageStep: right ? right.stepIndex : null, pageType: right ? right.openType : null,
        openCall: state.openCall, asOf: model.asOf, motion: 'css', idle: false, sessionId: 'demo0000-demo-4demo-8demo-demo00000000',
      });
      host.innerHTML = '';
      host.appendChild(mount(tree));
      return model;
    }

    var model = render();

    var root = host.querySelector('[data-dsh-workflow-map="root"]');
    var rightEl = host.querySelector('[data-dsh-workflow-map="right"]');
    var stepDetail = first('[data-dsh-workflow-map="step-detail"]');
    var nodeDetail = first('[data-dsh-workflow-map="node-detail"]');
    var callRows = all('[data-dsh-workflow-map="call"]');
    var typeRows = all('[data-dsh-workflow-map="type-row"]');
    var copyRows = nodeDetail ? all('[data-wf-copy]', nodeDetail) : [];
    var stepCopyRows = stepDetail ? all('[data-wf-copy]', stepDetail) : [];
    var more = nodeDetail ? first('.wf-detail-more', nodeDetail) : null;

 // The command page starts with the <details> CLOSED, measures the default summary, then opens it.
    var commandClosed = more ? { open: more.open, summary: text(first('summary', more)), body: text(first('pre', more)) } : null;
    if (CFG.detailsOpen && more) {
      more.open = true;
      await delay(120);
    }

    var args = nodeDetail ? first('.wf-detail-args', nodeDetail) : null;
    var previewEl = nodeDetail ? first('.wf-detail-preview', nodeDetail) : null;
    var rootEl = root;
    var bodyText = rootEl ? rootEl.textContent : '';

    var facts = {
      right: rightEl ? { kind: rightEl.getAttribute('data-kind'), present: true } : { present: false },
      page: { units: all('.wf-unit').length, sats: all('[data-dsh-workflow-map="sat"]').length },
      stepDetail: stepDetail ? {
        report: stepDetail.getAttribute('data-report'),
        stepIndex: stepDetail.getAttribute('data-step-index'),
        text: text(stepDetail),
        artifacts: all('.wf-detail-file', stepDetail).map(function (row) { return row.getAttribute('data-wf-copy'); }),
        stats: text(first('.wf-step-detail-stats', stepDetail)),
        rect: rect(stepDetail),
      } : null,
      stepTypeRows: typeRows.map(function (row) {
        return { type: row.getAttribute('data-type'), side: row.getAttribute('data-side'), live: row.getAttribute('data-live'), open: row.getAttribute('data-open') };
      }),
      callRows: callRows.map(function (row) { return { id: row.getAttribute('data-node-id'), open: row.getAttribute('data-open') }; }),
      nodeDetail: nodeDetail ? {
        nodeId: nodeDetail.getAttribute('data-node-id'),
        category: nodeDetail.getAttribute('data-category'),
        status: nodeDetail.getAttribute('data-status'),
        role: nodeDetail.getAttribute('role'),
        text: text(nodeDetail),
        copyRows: copyRows.map(function (row) {
          return { target: row.getAttribute('data-wf-copy'), label: row.getAttribute('data-wf-copy-label'), tag: row.tagName.toLowerCase() };
        }),
        argsPreview: previewEl ? { text: text(previewEl), style: style(previewEl) } : null,
        args: args ? { text: text(args), style: style(args) } : null,
        details: more ? { open: more.open, summary: text(first('summary', more)), body: text(first('pre', more)) } : null,
        rect: rect(nodeDetail),
      } : null,
      commandClosed: commandClosed,
      errorCard: (function () {
        var card = callRows.filter(function (row) { return row.getAttribute('data-node-id') === 'err1'; })[0];
        if (!card) return null;
        var dot = first('.wf-flow-status', card);
        var dotStyle = style(dot || card);
 // The error state is painted on the DOT's background (theme.js: background:var(--dsw-alias-state-error-primary,#e85a5a)), not on its colour.
        return { nodeId: card.getAttribute('data-node-id'), status: dot ? dot.getAttribute('data-status') : '', background: dotStyle ? dotStyle.background : '', text: text(card) };
      })(),
 // The step detail's × is still rendered; the real component wires no onCloseStepDetail, so this
 // page records it as the inert control it is today rather than pretending it folds anything.
      stepClose: (function () {
        var close = first('[data-wf-step-close]');
        return close ? { present: true, index: close.getAttribute('data-wf-step-close'), text: text(close) } : { present: false };
      })(),
      errorText: nodeDetail && nodeDetail.getAttribute('data-status') === 'error' ? text(first('.wf-detail-error', nodeDetail)) : '',
      stepCopyRows: stepCopyRows.map(function (row) {
        return { target: row.getAttribute('data-wf-copy'), label: row.getAttribute('data-wf-copy-label') };
      }),
      privacy: { secretPresent: bodyText.indexOf(EXPECT.secret) >= 0, note: 'a content body is dropped by store.js' },
 // The two honest-empty sentences, read from the page's OWN dictionary text (the expect file
 // carries the strings, so no wording is hardcoded in the checker).
      honest: {
        noReport: bodyText.indexOf(EXPECT.noReportText) >= 0,
        notLoaded: bodyText.indexOf(EXPECT.notLoadedText) >= 0,
        emptyBlocks: all('.wf-detail-empty').length,
      },
    };

 // Copy: exercise the PRODUCTION routine on the real node path row (Clipboard stubbed).
 // Copy: exercise the PRODUCTION routine on ONE REAL row of this page (Clipboard stubbed).
 // The row is whichever copy control the page actually rendered — a node-detail row on the
 // type pages, a step-detail artifact row on the step pages — and the report records which
 // scope it came from, so the checker asserts the page it is looking at, not a guess.
    var nodeEls = nodeDetail ? all('[data-wf-copy]', nodeDetail) : [];
    var stepEls = stepDetail ? all('[data-wf-copy]', stepDetail) : [];
    var rowEl = nodeEls[0] || stepEls[0] || null;
    var rowScope = nodeEls.indexOf(rowEl) >= 0 ? 'node' : stepEls.indexOf(rowEl) >= 0 ? 'step' : 'none';
    var target = rowEl ? rowEl.getAttribute('data-wf-copy') : EXPECT.nodeDetailPath;
    var rowLabel = rowEl ? rowEl.getAttribute('data-wf-copy-label') : '';
    var clipboardCall = null;
    var clipboard = { writeText: function (value) { clipboardCall = value; return Promise.resolve(); } };
    var pendingTimer = null;
    var buttonEl = document.createElement('button');
    buttonEl.setAttribute('data-wf-copy-label', '复制路径');
    buttonEl.textContent = '复制路径';
    var ok = await T.copyWithFeedback(target, buttonEl, T.makeSay(undefined), {
      clipboard: clipboard, setTimeout: function (fn) { pendingTimer = fn; return 1; }
    });
    var intermediate = { ok: ok, text: buttonEl.textContent, state: buttonEl.getAttribute('data-copy-state') };
    if (pendingTimer) pendingTimer();
    var restored = { text: buttonEl.textContent, state: buttonEl.getAttribute('data-copy-state') };

    var rowOk = rowEl ? await T.copyWithFeedback(target, rowEl, T.makeSay(undefined), { clipboard: clipboard }) : false;
    var rowState = rowEl ? { text: rowEl.textContent, state: rowEl.getAttribute('data-copy-state') } : null;

 // Escape: the real binding on the real document.
    var escapes = 0;
    var escBind = T.bindEscape(document, { onEscapeDetail: function () { escapes += 1; } });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    escBind.destroy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

 // The resize nudge: bind, toggle a <details>, and count the resize events it dispatches.
    var resizes = 0;
    function onResize() { resizes += 1; }
    window.addEventListener('resize', onResize);
    var nudgeBind = T.bindDetailNudge(document, window);
    var probe = document.createElement('details');
    probe.style.display = 'none';
    probe.appendChild(document.createElement('summary'));
    document.body.appendChild(probe);
    probe.open = true;
    await delay(160);
    probe.parentNode.removeChild(probe);
    nudgeBind.destroy();
    window.removeEventListener('resize', onResize);

    report.facts = facts;
    report.copy = { target: target, rowScope: rowScope, rowLabel: rowLabel, clipboardCall: clipboardCall, intermediate: intermediate, restored: restored, rowState: rowState, rowOk: rowOk };
    report.esc = { fired: escapes };
    report.nudge = { resizes: resizes };
    report.animations = (function () {
      var list = [];
      try { list = [].slice.call(document.getAnimations()); } catch (e) { list = []; }
      return list.length;
    })();
    finish();
  }

  main().catch(function (error) {
    report.error = String(error && error.stack ? error.stack : error);
    finish();
  });
})();
`;
}

/* --- build the five pages ---------------------------------------------------- */
function buildPage({ file, selectedStep, rightKind, rightKey, openCall, detailsOpen, closedStep }) {
  const config = {
    page: file, selectedStep, rightKind, rightKey,
    openCall: openCall || null, detailsOpen: detailsOpen === true, closedStep: closedStep === undefined ? null : closedStep,
  };
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${file}</title>
<style>${DARK_TOKENS}${mockCss}${T.css()}</style></head><body>${mockApp}
<script>window.__ModuleLoader__ = { load: function (definition) { window.__wfDef = definition; } };</script>
<script src="../../client.js"></script>
<script>${pageScript(config)}</script>
</body></html>`;
  fs.writeFileSync(path.join(OUT, file), html, 'utf8');
  return { file, bytes: Buffer.byteLength(html, 'utf8') };
}

const written = [
  buildPage({ file: 'panel-detail-edit-node.html', selectedStep: 0, rightKind: 'step', rightKey: 'step:0' }),
  buildPage({ file: 'panel-detail-command.html', selectedStep: 0, rightKind: 'type', rightKey: '0|' + commandTypeKey, openCall: 'p1', detailsOpen: true }),
  buildPage({ file: 'panel-detail-error.html', selectedStep: 1, rightKind: 'type', rightKey: '1|' + errorTypeKey, openCall: 'err1' }),
  buildPage({ file: 'panel-detail-noreport.html', selectedStep: 2, rightKind: 'step', rightKey: 'step:2' }),
  buildPage({ file: 'panel-detail-notloaded.html', selectedStep: 1, rightKind: 'step', rightKey: 'step:0' }),
 // The hot-inject page: rightKind 'inject' is the composer seat, so this page shows the
 // panel with the injection page open instead of a step record.
  buildPage({ file: 'panel-inject-open.html', selectedStep: 3, rightKind: 'inject', rightKey: '' }),
];

for (const one of written) process.stdout.write(`wrote evidence/preview/${one.file} (${one.bytes} bytes)\n`);
process.stdout.write(`type keys: edit=${editTypeKey} command=${commandTypeKey} error=${errorTypeKey}\n`);
