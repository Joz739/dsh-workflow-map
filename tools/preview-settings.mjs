// preview-settings.mjs — settings + snapshot export, rendered for browser measurement.
//
// Run: node tools/preview-settings.mjs (then pwsh -File tools\measure-settings.ps1)
//
// The page carries the REAL bundle. It starts from the real default prefs, clicks the
// real segmented buttons (by re-rendering from T.applyPrefsPatch), verifies the DOM
// attributes / node windows / compact cards, calls the real localStorage save/load
// round-trip, then exercises the REAL copy + Blob download paths and writes a
// <pre id="wf-measure"> report. measure-settings.ps1 asserts that report against
// evidence/preview/settings-expect.json — expected values are produced by the renderer,
// never hard-coded in PowerShell.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'evidence', 'preview');
fs.mkdirSync(OUT, { recursive: true });

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
const T = loaded.definition.factory((name) => {
  if (name === 'react') return { createElement };
  throw new Error('unexpected require: ' + name);
}).__test;
const say = T.makeSay(undefined);

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
const PLAIN_ATTRS = new Set(['role', 'title', 'type', 'id', 'aria-live']);
function toHtml(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return esc(node);
  if (Array.isArray(node)) return node.map(toHtml).join('');
  const props = node.props || {};
  let attrs = '';
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null || typeof value === 'function') continue;
    if (name === 'children') continue;
    if (name === 'className') {
      attrs += ` class="${esc(value)}"`;
      continue;
    }
    if (name === 'style' && typeof value === 'object') {
      attrs += ` style="${esc(Object.entries(value).map(([key, raw]) => `${kebab(key)}:${raw}`).join(';'))}"`;
      continue;
    }
    if (name.startsWith('data-') || name.startsWith('aria-') || PLAIN_ATTRS.has(name)) attrs += ` ${name}="${esc(value)}"`;
  }
  return `<${node.type}${attrs}>${(node.children || []).map(toHtml).join('')}</${node.type}>`;
}

/* --- fixtures -------------------------------------------------------------- */
const T0 = 1792243000000;
const SESSION = 'session-f069ece7-83d6-4f90-8bac-c4539a500015';
const nodes = [];
for (let i = 0; i < 72; i += 1) {
  const tool = i % 2 === 0 ? 'read' : 'write';
  nodes.push({
    id: 'n' + i,
    stepIndex: i < 70 ? 0 : 1,
    kind: 'tool',
    tool,
    title: tool + ' n' + i + '.txt',
    detail: 'path=D:\\proj\\n' + i + '.txt',
    files: [
      { path: 'D:\\proj\\n' + i + '.txt', action: tool === 'read' ? '读' : '写' },
      { path: 'D:\\proj\\docs\\n' + i + '.md', action: '读' },
    ],
    resultHead: 'ok ' + i,
    error: '',
    at: T0 + i * 10,
    durationMs: 10 + i,
    seq: 100 + i,
    content: 'WF_SECRET_SHOULD_NOT_BE_EXPORTED',
  });
}
const view = {
  asOf: T0 + 2000,
 // The session is NOT working right now (view.running=false) while one step is still marked
 // running - the honest case the three motion options differ on: "while running" freezes it,
 // "always" keeps it moving.
  running: false,
 task: '面板设置与工作流快照导出',
  steps: [
    { index: 0, planIndex: 1, title: '面板设置与工作流快照导出', status: 'running', percent: 40, percentSource: 'model', startedAt: T0, lastEstimateAt: T0 - 180000, endedAt: null, nodeIds: nodes.slice(0, 70).map((n) => n.id), nodeCount: 70, groups: [] },
    { index: 1, planIndex: 2, title: '导出验收与收尾', status: 'done', percent: 100, percentSource: 'model', startedAt: T0 + 5000, endedAt: T0 + 9000, nodeIds: nodes.slice(70).map((n) => n.id), nodeCount: 2, groups: [] },
  ],
  nodes,
  plan: {
    ver: 1,
    phase: 'executing',
 task: '面板设置与工作流快照导出',
 taskTitle: '面板设置与工作流快照导出',
    stepIndex: 1,
    steps: [],
    statuses: { '1': 'in_progress', '2': 'completed' },
    anchorSeqs: { '1': 10, '2': 20 },
    skipped: [],
    stepReports: [],
  },
  active: { stepIndex: 0, nodeId: 'n1' },
  counts: { steps: 2, nodes: 72, running: 1, completed: 1 },
};

const defaultPrefs = T.defaultPrefs();
const defaultModel = T.buildModel(view, defaultPrefs, T0);
const defaultPanel = T.renderPanel(defaultModel, defaultPrefs, say, {}, {
  settingsOpen: true,
  maxWidth: 1400,
  status: 'live',
  rev: 12,
  endpoint: '/dsh-workflow/state?sessionId=' + SESSION,
  nodeTotal: 72,
  right: null, pageStep: null, pageType: null, openCall: null, asOf: defaultModel.asOf, sessionId: SESSION,
  injectState: 'idle', injectText: '', injectReason: '',
  motion: 'css',
  idle: true,
});
const initialHtml = toHtml(defaultPanel);

/* --- mock shell ------------------------------------------------------------ */
const DARK_TOKENS = `
  :root{--mock-bg:#0f1116;--mock-fg:#e9ecf3;--mock-dim:#9aa3b2;--mock-border:#2a2f3a;
    --mock-row:#181b22;--mock-me:#22304a;
    --dsw-alias-bg-overlay:#1c1f27;--dsw-alias-bg-layer-1:#232733;--dsw-alias-bg-layer-2:#282d3a;
    --dsw-alias-bg-base:#111318;--dsw-alias-border-l1:rgba(255,255,255,.14);--dsw-alias-border-l2:rgba(255,255,255,.24);
    --dsw-alias-label-primary:#e9ecf3;--dsw-alias-label-secondary:#9aa3b2;--dsw-alias-label-tertiary:#7d8798;
    --dsw-alias-brand-primary:#5b8cff;--dsw-alias-state-success-primary:#45c07a;
    --dsw-alias-state-warn-primary:#e0a13a;--dsw-alias-state-error-primary:#e85a5a;--dsw-alias-state-idle-primary:#8f7bea}
`;
const mockCss = `
  html,body{margin:0;height:100%;background:var(--mock-bg);color:var(--mock-fg);
    font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif}
  .mock-app{display:grid;grid-template-columns:220px 1fr;height:100vh}
  .mock-side{border-right:1px solid var(--mock-border);padding:14px 12px;font-size:12px;color:var(--mock-dim)}
  .mock-side b{display:block;margin-bottom:10px;color:var(--mock-fg);font-size:13px}
  .mock-row{padding:6px 8px;border-radius:6px;margin-bottom:4px;background:var(--mock-row)}
  .mock-chat{display:flex;flex-direction:column;gap:14px;padding:22px 26px 0;min-width:0}
  .mock-msg{max-width:560px;padding:10px 14px;border-radius:10px;background:var(--mock-row);font-size:13px;line-height:1.6}
  .mock-msg.me{margin-left:auto;background:var(--mock-me)}
  #settings-host{position:fixed;inset:0;pointer-events:none;z-index:2}
  #settings-host .wf-root{pointer-events:none}
`;
const mockApp = `
  <div class="mock-app">
    <aside class="mock-side"><b>DeepSeek Harness</b><div class="mock-row">当前会话</div><div class="mock-row">历史会话</div></aside>
    <main class="mock-chat">
      <div class="mock-msg">用户：面板里的配色、动效、详情深度和节点上限在哪里调？我想导出一份当前会话的工作流快照。</div>
      <div class="mock-msg me">点右上角齿轮，设置就在面板里；改完立即生效，F5 也还在。快照可以复制或下载。</div>
    </main>
  </div>
`;

function pageScript(corrupt) {
  return `
(function () {
  var CFG = window.__wfConfig;
  var report = { page: CFG.file, corrupt: CFG.corrupt, error: '', facts: {}, copy: {}, storage: {}, download: {} };
 // __wfToHtml is a GLOBAL function; its free variables resolve on window, not in
 // this IIFE, so the three serializer helpers must be global too.
  window.esc = window.__wfEsc;
  window.kebab = window.__wfKebab;
  window.PLAIN_ATTRS = new Set(window.__wfPlainAttrs || []);
  function round(n) { return Math.round(n * 100) / 100; }
  function rect(el) { if (!el) return null; var r = el.getBoundingClientRect(); return { left: round(r.left), top: round(r.top), width: round(r.width), height: round(r.height) }; }
  function style(el, pseudo) {
    if (!el) return null;
    var cs = getComputedStyle(el, pseudo || null);
    return { display: cs.display, animationName: cs.animationName, animationPlayState: cs.animationPlayState,
      stopColor: cs.stopColor, stroke: cs.stroke, backgroundImage: cs.backgroundImage, backgroundColor: cs.backgroundColor,
      color: cs.color, overflowX: cs.overflowX, width: cs.width, height: cs.height };
  }
  function text(el) { return el ? el.textContent : ''; }
  function first(sel, root) { return (root || document).querySelector(sel); }
  function all(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function finish() {
    var pre = document.createElement('pre');
    pre.id = 'wf-measure';
    pre.textContent = JSON.stringify(report);
    document.body.appendChild(pre);
  }
  function facts() {
    var root = first('[data-dsh-workflow-map="root"]');
    var panel = first('[data-dsh-workflow-map="panel"]');
    var settings = first('[data-dsh-workflow-map="settings"]');
    var segButtons = all('.wf-seg-btn');
    var units = all('.wf-unit');
    return {
      panelPresent: !!panel,
      root: root ? {
        palette: root.getAttribute('data-palette'),
        motion: root.getAttribute('data-motion'),
        motionPref: root.getAttribute('data-motion-pref'),
        detail: root.getAttribute('data-detail'),
        nodeLimit: root.getAttribute('data-node-limit'),
        idle: root.getAttribute('data-idle'),
        softOne: (function () { try { return getComputedStyle(root).getPropertyValue('--wf-soft-1').trim(); } catch (error) { return null; } })(),
      } : null,
      settings: settings ? {
        rows: all('[data-setting-row]', settings).length,
        buttons: segButtons.length,
        active: all('[data-setting][aria-pressed="true"]', settings).map(function (b) {
          return b.getAttribute('data-setting') + '=' + b.getAttribute('data-value');
        }),
        exportButtons: all('[data-export]', settings).map(function (b) { return b.getAttribute('data-export'); }),
        rect: rect(settings),
        overflow: settings.scrollWidth - settings.clientWidth,
        panelWidth: panel ? round(panel.getBoundingClientRect().width) : 0,
        visibleButtons: segButtons.filter(function (b) { return b.getBoundingClientRect().width > 0; }).length,
      } : null,
 // single page: the units ARE the step cards (one per step).
      units: units.length,
      stepCards: all('[data-dsh-workflow-map="step"]').length,
 // The rail's second line - the thing "Title only" takes away.
      subLines: all('.wf-prog-sub').length,
      agoLines: all('.wf-prog-ago').length,
      nodeDetail: all('[data-dsh-workflow-map="node-detail"]').length,
      stepDetail: all('[data-dsh-workflow-map="step-detail"]').length,
      dockTiming: first('.wf-prog-dock') ? first('.wf-prog-dock').getAttribute('data-timing') : null,
 // The living layer that actually exists today: the running unit's ring, its card frame and
 // the running rail's fill. The old .wf-fx-core / .wf-fx-stop-* SVG belonged to the retired curve.
      ring: style(first('.wf-unit[data-status="running"] .wf-unit-ring')),
      cardFrame: style(first('.wf-unit[data-status="running"] .wf-unit-card'), '::after'),
      runningFill: style(first('.wf-prog-dock[data-status="running"] .wf-prog-fill')),
      panelRect: rect(panel),
    };
  }
  var T = null;
  var say = null;
  var host = null;
  var view = null;
  var toHtml = null;
  var CFG = null;
  var esc = window.__wfEsc;
  var kebab = window.__wfKebab;
  var PLAIN_ATTRS = new Set(window.__wfPlainAttrs || []);
  var prefs = null;
  var model = null;
  var actions = {};
  var currentTree = null;
  var corruptLoad = null;
  function pageCreateElement(type, props) {
    var children = [].slice.call(arguments, 2);
    var flat = [];
    children.forEach(function (child) {
      if (Array.isArray(child)) flat = flat.concat(child.flat(Infinity));
      else flat.push(child);
    });
    return { type: type, props: props || {}, children: flat.filter(function (child) { return child !== null && child !== undefined && child !== false && child !== ''; }) };
  }
  function saveAndRender(next) {
    prefs = next;
    T.savePrefs(prefs);
    model = T.buildModel(view, prefs, CFG.now);
    report.debugModel = { hasView: !!view, viewSteps: view && view.steps.length, model: !!model, steps: model && model.steps.length };
    var tree = T.renderPanel(model, prefs, say, actions, {
      settingsOpen: true,
      maxWidth: 1400,
      status: 'live',
      rev: 12,
      endpoint: '/dsh-workflow/state?sessionId=' + CFG.session,
      nodeTotal: 72,
      right: null, pageStep: null, pageType: null, openCall: null, asOf: model.asOf, sessionId: CFG.session,
      injectState: 'idle', injectText: '', injectReason: '',
      motion: prefs.motion === 'static' ? 'static' : 'css',
 // The component's own rule: "always" keeps the living layer moving even when the session is idle.
      idle: prefs.motion === 'always' ? false : !model.running,
    });
    currentTree = tree;
    host.innerHTML = toHtml(tree);
    report.debugHtml = host.innerHTML.length;
    bind();
  }

  function applySetting(setting, value) {
    var patch = {};
    patch[setting] = value;
    saveAndRender(T.applyPrefsPatch(prefs, patch));
  }
  function bind() {
    all('[data-setting]', host).forEach(function (el) {
      el.addEventListener('click', function () {
        var setting = el.getAttribute('data-setting');
        var raw = el.getAttribute('data-value');
        applySetting(setting, setting === 'nodeLimit' ? Number(raw) : raw);
      });
    });
    var reset = first('[data-action="reset-prefs"]', host);
    if (reset) reset.addEventListener('click', function () { saveAndRender(T.defaultPrefs()); });
    all('[data-export]', host).forEach(function (el) {
      var kind = el.getAttribute('data-export');
      el.addEventListener('click', function () {
        if (kind === 'copy-md') copySnapshot('md', el);
        else if (kind === 'copy-json') copySnapshot('json', el);
        else if (kind === 'download-md') downloadSnapshot('md');
        else if (kind === 'download-json') downloadSnapshot('json');
      });
    });
  }
  function copySnapshot(kind, element) {
    var text = T.snapshotText(kind, model, view, CFG.session, CFG.now, say);
    var clipboard = { writeText: function (value) { report.copy[kind] = value; return Promise.resolve(); } };
    return T.copySnapshot(kind, model, view, CFG.session, CFG.now, say, element, {
      clipboard: clipboard,
      setTimeout: function (fn) { setTimeout(fn, 10); return 1; },
    });
  }
  function downloadSnapshot(kind) {
    var fakeDoc = {
      createElement: function () {
        var anchor = { style: {}, click: function () { report.download.clicked = anchor.download; } };
        return anchor;
      },
      body: { appendChild: function (node) { node.parentNode = fakeDoc.body; } },
    };
    var result = T.snapshotDownload(kind, T.snapshotText(kind, model, view, CFG.session, CFG.now, say), CFG.session, { document: fakeDoc });
    var clickedName = report.download.clicked;
    report.download = { result: result, urls: T.snapshotUrlCount(), revoked: T.releaseSnapshotUrls(), after: T.snapshotUrlCount(), clicked: clickedName };
  }
  async function main() {
    var definition = window.__wfDef;
    if (!definition) { report.error = 'bundle not captured'; return finish(); }
    T = definition.factory(function (name) {
      if (name === 'react') { return { createElement: pageCreateElement }; }
      throw new Error('unexpected require: ' + name);
    }).__test;
    say = T.makeSay(undefined);
    host = document.getElementById('settings-host');
    view = window.__wfView;
    toHtml = window.__wfToHtml;
    CFG = window.__wfConfig;
    prefs = T.defaultPrefs();
    window.__wfFacts = function () { return facts(); };

    if (CFG.corrupt) {
      try { localStorage.setItem(T.constants().prefsKey, '{oops'); } catch (error) { report.storageError = String(error); }
      corruptLoad = T.loadPrefs();
      report.corruptLoaded = { palette: corruptLoad.palette, nodeLimit: corruptLoad.nodeLimit, width: corruptLoad.width };
    }
    saveAndRender(CFG.corrupt ? corruptLoad : T.defaultPrefs());
    report.facts.default = facts();

 // brand palette
    var brand = first('[data-setting="palette"][data-value="brand"]', host);
    brand.click();
    await delay(60);
    report.facts.brand = facts();
    try { report.storage.brand = JSON.parse(localStorage.getItem(T.constants().prefsKey)); } catch (error) { report.storage.brandError = String(error); }
    report.storage.loadBack = T.loadPrefs();

 // always motion (idle session still animates)
    first('[data-setting="motion"][data-value="always"]', host).click();
    await delay(60);
    report.facts.always = facts();
    report.storage.always = T.loadPrefs();

 // title-only detail
    first('[data-setting="detail"][data-value="title"]', host).click();
    await delay(60);
    report.facts.title = facts();

 // node windows: 30 then all
    first('[data-setting="nodeLimit"][data-value="30"]', host).click();
    await delay(60);
    report.facts.limit30 = facts();
    first('[data-setting="nodeLimit"][data-value="0"]', host).click();
    await delay(60);
    report.facts.all = facts();

 // soft palette + static motion
    first('[data-setting="palette"][data-value="soft"]', host).click();
    first('[data-setting="motion"][data-value="static"]', host).click();
    await delay(60);
    report.facts.softStatic = facts();

 // restore defaults (documented values, not the previous save)
    first('[data-action="reset-prefs"]', host).click();
    await delay(60);
    report.facts.reset = facts();
    try { report.storage.reset = JSON.parse(localStorage.getItem(T.constants().prefsKey)); } catch (error) { report.storage.resetError = String(error); }
    report.storage.resetLoad = T.loadPrefs();

 // real snapshot text + copy path
    first('[data-export="copy-md"]', host).click();
    await delay(120);
    first('[data-export="copy-json"]', host).click();
    await delay(120);
    report.copy.mdCount = (report.copy.md || '').split('\\n').filter(function (line) { return line.indexOf('### ') === 0; }).length;
    report.copy.mdNodeLines = (report.copy.md || '').split('\\n').filter(function (line) { return /^- (read|write) · /.test(line); }).length;
    try { report.copy.json = JSON.parse(report.copy.json || '{}'); } catch (error) { report.copy.jsonError = String(error); }
    report.copy.mdHasSecret = (report.copy.md || '').indexOf('WF_SECRET_SHOULD_NOT_BE_EXPORTED') >= 0;
    report.copy.jsonHasSecret = JSON.stringify(report.copy.json || {}).indexOf('WF_SECRET_SHOULD_NOT_BE_EXPORTED') >= 0;

 // Blob + URL.createObjectURL + revoke on cleanup
    first('[data-export="download-md"]', host).click();
    await delay(90);

    report.animations = (function () {
      try { return document.getAnimations().length; } catch (error) { return -1; }
    })();
    finish();
  }
  main().catch(function (error) { report.error = String(error && error.stack ? error.stack : error); finish(); });
})();
`;
}

const pages = [];
function buildPage({ file, corrupt }) {
  const config = { file, corrupt: corrupt === true, session: SESSION, now: T0 };
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${esc(file)}</title>
<style>${DARK_TOKENS}${mockCss}${T.css()}</style></head><body data-page="${esc(file)}">
${mockApp}<div id="settings-host">${corrupt ? '' : initialHtml}</div>
<script>window.__ModuleLoader__ = { load: function (definition) { window.__wfDef = definition; } };</script>
<script src="../../client.js"></script>
<script>window.__wfConfig = ${JSON.stringify(config)};
window.__wfView = ${JSON.stringify(view)};
window.__wfToHtml = ${toHtml.toString()};
window.__wfEsc = ${esc.toString()};
window.__wfKebab = ${kebab.toString()};
window.__wfPlainAttrs = ${JSON.stringify([...PLAIN_ATTRS])};
</script>
<script>${pageScript(corrupt)}</script>
</body></html>`;
  fs.writeFileSync(path.join(OUT, file), html, 'utf8');
  pages.push({ file, bytes: Buffer.byteLength(html, 'utf8') });
}
buildPage({ file: 'panel-settings-default.html', corrupt: false });
buildPage({ file: 'panel-settings-corrupt.html', corrupt: true });

const expect = {
  pages: pages.map((page) => page.file),
  sessionId: SESSION,
  task: view.task,
  stepCount: view.steps.length,
  nodeCount: view.nodes.length,
  defaultPalette: 'rainbow',
  defaultMotion: 'full',
  defaultDetail: 'summary',
  defaultNodeLimit: 60,
  limit30: 30,
  allNodes: 70,
  markdownStepHeadings: view.steps.length,
  rainbowFirst: 'rgb(255, 45, 120)',
  brandFirst: 'rgb(91, 140, 255)',
  softOne: '#7f93b8',
  softFill: 'rgb(127, 147, 184)',
  ringDuration: '1.6s',
  markdownNodeLines: view.nodes.length,
  markdownTask: view.task,
  secret: 'WF_SECRET_SHOULD_NOT_BE_EXPORTED',
  downloadMd: 'workflow-f069ece7.md',
  downloadJson: 'workflow-f069ece7.json',
};
fs.writeFileSync(path.join(OUT, 'settings-expect.json'), JSON.stringify(expect, null, 2), 'utf8');
console.log(JSON.stringify({ pages, expect }, null, 2));
