// selftest-settings.mjs — presentation preferences + workflow snapshot export.
//
// Run: node tools/selftest-settings.mjs
//
// Proves, in order:
// 1. the bundle carries the seams and the four allow-lists
// 2. defaults / sanitization / corrupted localStorage self-heal
// 3. the settings card: four segmented rows, active state, reset, four export buttons
// 4. immediate rendering effects: palette root attribute, detail=title compact cards,
// nodeLimit 30/60/120/all windows, motion preference attribute
// 5. Markdown + JSON snapshots agree with the panel (step count, node count, titles)
// 6. download filename + Blob/URL path + revoke-on-cleanup
// 7. clipboard copy goes through the same 1.5 s acknowledgement as node detail
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const results = [];
const check = (id, pass, detail) => {
  results.push({ id, pass, detail: detail === undefined ? '' : String(detail) });
};

/* --- load the built bundle (same seam as selftest-detail) ------------------ */
const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
const loaded = { definition: null };
new Function('window', source)({
  __ModuleLoader__: { load: (definition) => (loaded.definition = definition) },
  setTimeout: () => 0,
  clearTimeout: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  innerWidth: 1400,
});

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
const say = T.makeSay(undefined);

check('bundle.loader', loaded.definition.id === 'dsh-workflow-map', loaded.definition.id);
check(
  'bundle.settingsSeam',
  typeof T.renderSettings === 'function' &&
    typeof T.defaultSettings === 'function' &&
    typeof T.sanitizeSettings === 'function' &&
    typeof T.snapshotMarkdown === 'function' &&
    typeof T.snapshotJson === 'function' &&
    typeof T.snapshotDownload === 'function' &&
    typeof T.copySnapshot === 'function' &&
    typeof T.releaseSnapshotUrls === 'function',
 'every seam is exported'
);
check(
  'constants.allowLists',
  JSON.stringify(T.constants().palettes) === JSON.stringify(['rainbow', 'brand', 'soft']) &&
    JSON.stringify(T.constants().motions) === JSON.stringify(['full', 'always', 'static']) &&
    JSON.stringify(T.constants().detailModes) === JSON.stringify(['summary', 'title']) &&
    JSON.stringify(T.constants().nodeLimits) === JSON.stringify([30, 60, 120, 0]),
  JSON.stringify(T.constants().nodeLimits)
);

/* --- tree helpers ---------------------------------------------------------- */
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
function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node.children || []).map(textOf).join('');
}
const options = (tree, setting) =>
  findAll(tree, (node) => node.props && node.props['data-setting'] === setting);

/* --- fixtures -------------------------------------------------------------- */
const T0 = 1792243000000;
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
    error: i === 3 ? 'ENOENT: n3.txt missing' : '',
    at: T0 + i * 10,
    durationMs: 10 + i,
    seq: 100 + i,
    content: 'WF_SECRET_SHOULD_NOT_BE_EXPORTED',
  });
}
const step0Ids = nodes.slice(0, 70).map((node) => node.id);
const step1Ids = nodes.slice(70).map((node) => node.id);
const view = {
  asOf: T0 + 2000,
 task: '面板设置与工作流快照导出',
  steps: [
    {
      index: 0,
      planIndex: 1,
      title: '面板设置与工作流快照导出',
      status: 'running',
      percent: 40,
      percentSource: 'model',
      startedAt: T0,
      endedAt: null,
      nodeIds: step0Ids,
      nodeCount: step0Ids.length,
      groups: [],
    },
    {
      index: 1,
      planIndex: 2,
      title: '导出验收与收尾',
      status: 'done',
      percent: 100,
      percentSource: 'model',
      startedAt: T0 + 5000,
      endedAt: T0 + 9000,
      nodeIds: step1Ids,
      nodeCount: 99,
      groups: [],
    },
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

const noop = () => {};
const actions = {
  onCollapse: noop,
  onExpand: noop,
  onClose: noop,
  onToggleSettings: noop,
  onSelectStep: noop,
  onReset: noop,
  onSetting: noop,
  onExportCopy: noop,
  onExportDownload: noop,
  onWidthDrag: noop,
  onHeightDrag: noop,
  onToggleGroup: noop,
  onShowAll: noop,
  onSelectNode: noop,
  onToggleBranch: noop,
  onStepInfo: noop,
  onCloseStepDetail: noop,
  onEscapeDetail: noop,
  onCopy: noop,
};

/* --- 1. defaults / sanitization / storage ---------------------------------- */
const defaults = T.defaultPrefs();
check(
  'prefs.defaults.documented',
  defaults.palette === 'rainbow' &&
    defaults.motion === 'full' &&
    defaults.detail === 'summary' &&
    defaults.nodeLimit === 60 &&
    defaults.width === 720 &&
    defaults.height === 0 &&
    defaults.collapsed === false &&
    defaults.selectedStep === null,
  JSON.stringify(defaults)
);
const sanitized = T.sanitizePrefs({
  palette: 'neon',
  motion: 'bounce',
  detail: 'full',
  nodeLimit: 45,
  width: 'wide',
  height: 9000,
});
check(
  'prefs.sanitize.invalidToDefaults',
  sanitized.palette === 'rainbow' &&
    sanitized.motion === 'full' &&
    sanitized.detail === 'summary' &&
    sanitized.nodeLimit === 60 &&
    sanitized.width === 720 &&
    sanitized.height === 860,
  JSON.stringify(sanitized)
);
check('prefs.sanitize.allAlias', T.sanitizePrefs({ nodeLimit: 'all' }).nodeLimit === 0, 'all → 0');
check(
  'prefs.sanitize.partialKeepsKnown',
  T.sanitizePrefs({ palette: 'soft', nodeLimit: 30 }).palette === 'soft' &&
    T.sanitizePrefs({ palette: 'soft', nodeLimit: 30 }).nodeLimit === 30,
  'partial record keeps valid values'
);
const patched = T.applyPrefsPatch(defaults, { palette: 'brand', motion: 'always', detail: 'title', nodeLimit: 120 });
check(
  'prefs.patch.settings',
  patched.palette === 'brand' &&
    patched.motion === 'always' &&
    patched.detail === 'title' &&
    patched.nodeLimit === 120 &&
    patched.width === defaults.width,
  JSON.stringify(patched)
);
const reset = T.applyPrefsPatch(patched, T.defaultPrefs());
check(
  'prefs.reset.documentedDefaults',
  reset.palette === 'rainbow' && reset.motion === 'full' && reset.detail === 'summary' && reset.nodeLimit === 60,
  JSON.stringify(reset)
);

const map = new Map();
const storage = {
  getItem: (key) => (map.has(key) ? map.get(key) : null),
  setItem: (key, value) => map.set(key, String(value)),
};
T.savePrefs({ ...defaults, palette: 'soft', motion: 'always', detail: 'title', nodeLimit: 0 }, storage);
const roundTrip = T.loadPrefs(storage);
check(
  'prefs.storage.roundTrip',
  roundTrip.palette === 'soft' && roundTrip.motion === 'always' && roundTrip.detail === 'title' && roundTrip.nodeLimit === 0,
  JSON.stringify(roundTrip)
);
map.set(T.constants().prefsKey, '{not json');
const corrupt = T.loadPrefs(storage);
check(
  'prefs.storage.corruptJsonSelfHeals',
  corrupt.palette === 'rainbow' && corrupt.nodeLimit === 60 && corrupt.width === 720,
  JSON.stringify(corrupt)
);
map.set(T.constants().prefsKey, JSON.stringify({ width: 900, palette: 'brand', nodeLimit: 'all' }));
const missing = T.loadPrefs(storage);
check(
  'prefs.storage.missingFieldsSelfHeals',
  missing.width === 900 && missing.palette === 'brand' && missing.nodeLimit === 0 &&
    missing.motion === 'full' && missing.detail === 'summary',
  JSON.stringify(missing)
);
check(
  'prefs.storage.rewritesSanitized',
  T.savePrefs({ width: 10, palette: 'bad' }, storage) === true &&
    JSON.parse(map.get(T.constants().prefsKey)).palette === 'rainbow' &&
    JSON.parse(map.get(T.constants().prefsKey)).width === 360,
  map.get(T.constants().prefsKey)
);

/* --- 2. settings card ------------------------------------------------------ */
const settings = T.renderSettings(
  createElement,
  { ...defaults, palette: 'brand', motion: 'always', detail: 'title', nodeLimit: 0 },
  say,
  actions,
  { endpoint: '/dsh-workflow/state?sessionId=session-abcdef12', steps: 2, nodes: 72, rev: 12 }
);
check('settings.card.present', byData(settings, 'settings').length === 1, byData(settings, 'settings').length);
check(
  'settings.card.fourRows',
  options(settings, 'palette').length === 3 &&
    options(settings, 'motion').length === 3 &&
    options(settings, 'detail').length === 2 &&
    options(settings, 'nodeLimit').length === 4,
  [3, 3, 2, 4].join('/')
);
const activeOption = (setting, value) =>
  options(settings, setting).find((node) => String(node.props['data-value']) === String(value));
check(
  'settings.card.activeState',
  activeOption('palette', 'brand').props['aria-pressed'] === 'true' &&
    activeOption('palette', 'rainbow').props['aria-pressed'] === 'false' &&
    activeOption('motion', 'always').props['aria-pressed'] === 'true' &&
    activeOption('detail', 'title').props['aria-pressed'] === 'true' &&
    activeOption('nodeLimit', '0').props['aria-pressed'] === 'true',
  'brand/always/title/all selected'
);
check(
  'settings.card.labels',
  textOf(settings).includes('配色') &&
    textOf(settings).includes('动效') &&
    textOf(settings).includes('详情') &&
    textOf(settings).includes('节点上限') &&
    textOf(settings).includes('全部') &&
    textOf(settings).includes('恢复默认') &&
    textOf(settings).includes('/dsh-workflow/state?sessionId=session-abcdef12'),
  textOf(settings)
);
const exportButtons = findAll(settings, (node) => node.props && typeof node.props['data-export'] === 'string');
check(
  'settings.card.exportButtons',
  exportButtons.length === 4 &&
    exportButtons.map((node) => node.props['data-export']).join(',') ===
      'copy-md,copy-json,download-md,download-json',
  exportButtons.map((node) => node.props['data-export']).join(',')
);
check(
  'settings.card.copyStatus',
  findAll(settings, (node) => node.props && String(node.props.className || '').includes('wf-copy-status')).length === 2,
  'one status span per copy button'
);
const calls = [];
const recording = {
  onSetting: (setting, value) => calls.push(['set', setting, value]),
  onReset: () => calls.push(['reset']),
  onExportCopy: (kind, element) => calls.push(['copy', kind, element]),
  onExportDownload: (kind) => calls.push(['download', kind]),
};
const liveSettings = T.renderSettings(createElement, defaults, say, recording, { endpoint: '', steps: 0, nodes: 0, rev: null });
const paletteSoft = options(liveSettings, 'palette').find((node) => node.props['data-value'] === 'soft');
paletteSoft.props.onClick();
findAll(liveSettings, (node) => node.props && node.props['data-action'] === 'reset-prefs')[0].props.onClick();
const copyMd = findAll(liveSettings, (node) => node.props && node.props['data-export'] === 'copy-md')[0];
const fakeButton = {};
copyMd.props.onClick({ currentTarget: fakeButton });
const downloadJson = findAll(liveSettings, (node) => node.props && node.props['data-export'] === 'download-json')[0];
downloadJson.props.onClick();
check(
  'settings.card.callbacks',
  calls.length === 4 &&
    calls[0][0] === 'set' && calls[0][1] === 'palette' && calls[0][2] === 'soft' &&
    calls[1][0] === 'reset' &&
    calls[2][0] === 'copy' && calls[2][1] === 'md' && calls[2][2] === fakeButton &&
    calls[3][0] === 'download' && calls[3][1] === 'json',
  JSON.stringify(calls.map((call) => call.slice(0, 3)))
);

/* --- 3. immediate rendering effects --------------------------------------- */
const brandPrefs = { ...defaults, palette: 'brand', motion: 'always', selectedStep: 0 };
const brandModel = T.buildModel(view, brandPrefs, T0);
const brandPanel = T.renderPanel(brandModel, brandPrefs, say, actions, {
  settingsOpen: true,
  maxWidth: 1400,
  status: 'live',
  rev: 12,
  endpoint: '/dsh-workflow/state?sessionId=session-abcdef12',
  nodeTotal: 72,
  flow: T.flowUiFor({ stepIndex: 0 }, 0),
  motion: 'css',
  idle: false,
});
const brandRoot = byData(brandPanel, 'root')[0];
check(
  'render.palette.attribute',
  brandRoot.props['data-palette'] === 'brand' && brandRoot.props['data-motion-pref'] === 'always',
  brandRoot.props['data-palette'] + '/' + brandRoot.props['data-motion-pref']
);
const staticPanel = T.renderPanel(brandModel, { ...brandPrefs, motion: 'static' }, say, actions, {
  ...{ settingsOpen: false, maxWidth: 1400, status: 'live', rev: 12, endpoint: '', nodeTotal: 72 },
  flow: T.flowUiFor({ stepIndex: 0 }, 0),
  motion: 'static',
  idle: false,
});
check(
  'render.motion.staticAttribute',
  byData(staticPanel, 'root')[0].props['data-motion'] === 'static' &&
    byData(staticPanel, 'root')[0].props['data-motion-pref'] === 'static',
  'static'
);

const titlePrefs = { ...defaults, detail: 'title', selectedStep: 0 };
const titleModel = T.buildModel(view, titlePrefs, T0);
const titleSteps = T.renderStepColumn(createElement, titleModel, say, actions, null);
const titleFlow = T.renderFlowColumn(createElement, titleModel, say, actions, T.flowUiFor({ stepIndex: 0, selectedNode: 'n0' }, 0));
const titleCards = byData(titleFlow, 'node');
check(
  'render.detail.title.compactCards',
  titleCards.length > 0 &&
    titleCards.every((card) => card.props['data-compact'] === 'true') &&
    byClass(titleFlow, 'wf-node-meta').length === 0 &&
    byData(titleFlow, 'node-detail').length === 0,
  'cards=' + titleCards.length
);
check(
  'render.detail.title.noStepInfo',
  byData(titleSteps, 'step-info').length === 0 && byClass(titleSteps, 'wf-step-sum').length === 0,
  'no i button / no summary'
);

const limitModel = T.buildModel(view, { ...defaults, selectedStep: 0 }, T0);
const cardCount = (prefs, selectedNode = null) => {
  const m = T.buildModel(view, prefs, T0);
  const tree = T.renderFlowColumn(createElement, m, say, actions, T.flowUiFor({ stepIndex: 0, selectedNode }, 0));
  return { cards: byData(tree, 'node').length, flow: byData(tree, 'flow')[0] };
};
const at30 = cardCount({ ...defaults, nodeLimit: 30, selectedStep: 0 });
const at60 = cardCount({ ...defaults, nodeLimit: 60, selectedStep: 0 });
const at120 = cardCount({ ...defaults, nodeLimit: 120, selectedStep: 0 });
const atAll = cardCount({ ...defaults, nodeLimit: 0, selectedStep: 0 });
check(
  'render.nodeLimit.windows',
  at30.cards === 30 && at60.cards === 60 && at120.cards === 70 && atAll.cards === 70,
  [at30.cards, at60.cards, at120.cards, atAll.cards].join('/')
);
check(
  'render.nodeLimit.dataCapped',
  at30.flow.props['data-capped'] === 'true' &&
    at60.flow.props['data-capped'] === 'true' &&
    at120.flow.props['data-capped'] === 'false' &&
    atAll.flow.props['data-capped'] === 'false' &&
    byData(T.renderFlowColumn(createElement, limitModel, say, actions, T.flowUiFor({ stepIndex: 0 }, 0)), 'flow-more').length === 1,
  'capped flags + strip'
);
check('model.settings.carried', at30.flow && limitModel.settings.nodeLimit === 60, JSON.stringify(limitModel.settings));

/* --- 4. snapshots ---------------------------------------------------------- */
const snapModel = T.buildModel(view, { ...defaults, selectedStep: 0 }, T0);
const sessionId = 'demo0000-demo-4demo-8demo-demo00000000';
const markdown = T.snapshotMarkdown(snapModel, view, sessionId, T0, say);
check('snapshot.markdown.headings', markdown.startsWith('# 总任务\n') && markdown.includes('\n## 分步\n'), 'headings');
check('snapshot.markdown.sessionTime', markdown.includes(sessionId) && markdown.includes('2026-10-17'), markdown.split('\n')[2]);
check(
  'snapshot.markdown.stepTitles',
  markdown.includes('### 1. 面板设置与工作流快照导出（进行中 · 40%）') &&
    markdown.includes('### 2. 导出验收与收尾（已完成 · 100%）'),
  'step headings use panel titles/status/progress'
);
const nodeLines = markdown.split('\n').filter((line) => /^- (read|write) · /.test(line));
check(
  'snapshot.markdown.nodeLines',
  nodeLines.length === 72 &&
    /^- (read|write) · (读|写) · n\d+\.txt · 2 文件 · \d+(\.\d+)?(ms|s|m\d+s)$/.test(nodeLines[0]),
  nodeLines.length + ' / ' + nodeLines[0]
);
check(
  'snapshot.markdown.noSecret',
  !markdown.includes('WF_SECRET_SHOULD_NOT_BE_EXPORTED') && !markdown.includes('content'),
  'wire body dropped'
);

const snapshot = T.buildSnapshot(snapModel, view, sessionId, T0, say);
check(
  'snapshot.json.shape',
  snapshot.schema === T.constants().snapshotSchema &&
    snapshot.sessionId === sessionId &&
    snapshot.task === view.task &&
    snapshot.progress.total === 2 &&
    Array.isArray(snapshot.steps) &&
    snapshot.steps.length === 2,
  snapshot.schema
);
check(
  'snapshot.json.nodesAgree',
  snapshot.steps[0].nodes.length === 70 &&
    snapshot.steps[1].nodes.length === 2 &&
    snapshot.steps[0].nodeCount === 70 &&
    snapshot.steps[1].nodeCount === 99 &&
    snapshot.steps[1].truncated === 97,
  [snapshot.steps[0].nodes.length, snapshot.steps[1].nodes.length, snapshot.steps[1].truncated].join('/')
);
check(
  'snapshot.json.nodeShape',
  snapshot.steps[0].nodes[0].title === '读 · n0.txt' &&
    snapshot.steps[0].nodes[0].files.length === 2 &&
    snapshot.steps[0].nodes[3].status === 'error' &&
    snapshot.steps[0].nodes[3].error.includes('ENOENT'),
  JSON.stringify(snapshot.steps[0].nodes[0])
);
check(
  'snapshot.json.noSecret',
  !T.snapshotJson(snapModel, view, sessionId, T0, say).includes('WF_SECRET_SHOULD_NOT_BE_EXPORTED'),
  'wire body dropped'
);
check(
  'snapshot.counts.panelAgree',
  snapshot.steps.length === snapModel.steps.length &&
    snapshot.progress.done === snapModel.progress.done &&
    snapshot.progress.total === snapModel.progress.total &&
    snapshot.steps[0].title === snapModel.steps[0].title &&
    snapshot.steps[0].status === snapModel.steps[0].status,
  'steps/title/status identical'
);

/* --- 5. download + revoke -------------------------------------------------- */
const PREFIX = sessionId.replace(/^session-/, '').slice(0, 8);
check(
  'snapshot.filename.sessionPrefix',
  T.snapshotFileName(sessionId, 'md') === 'workflow-' + PREFIX + '.md' &&
    T.snapshotFileName(sessionId, 'json') === 'workflow-' + PREFIX + '.json' &&
    T.snapshotFileName('session-abc', 'md') === 'workflow-abc.md',
  T.snapshotFileName(sessionId, 'md') + ' for ' + sessionId
);
const clicked = [];
const revoked = [];
const blobs = [];
class FakeBlob {
  constructor(parts, options) {
    this.parts = parts;
    this.type = options && options.type;
    blobs.push(this);
  }
}
const fakeDocument = {
  createElement: () => {
    const anchor = {
      style: {},
      parentNode: null,
      click: () => clicked.push(anchor.download),
    };
    return anchor;
  },
  body: {
    appendChild: (node) => {
      node.parentNode = fakeDocument.body;
    },
  },
};
let counter = 0;
const fakeUrl = {
  createObjectURL: () => 'blob:wf-' + ++counter,
  revokeObjectURL: (url) => revoked.push(url),
};
const download = T.snapshotDownload('json', '{"a":1}', sessionId, {
  document: fakeDocument,
  Blob: FakeBlob,
  URL: fakeUrl,
});
check(
  'snapshot.download.invoked',
  download.ok === true &&
    download.filename === 'workflow-' + PREFIX + '.json' &&
    download.url === 'blob:wf-1' &&
    clicked[0] === 'workflow-' + PREFIX + '.json' &&
    blobs[0].type === 'application/json;charset=utf-8' &&
    T.snapshotUrlCount() === 1,
  JSON.stringify(download)
);
const removed = T.releaseSnapshotUrls({ URL: fakeUrl });
check(
  'snapshot.download.revoked',
  removed === 1 && revoked[0] === 'blob:wf-1' && T.snapshotUrlCount() === 0,
  JSON.stringify(revoked)
);
const unsupported = T.snapshotDownload('md', 'x', sessionId, {});
check('snapshot.download.unsupported', unsupported.ok === false && unsupported.reason === 'unsupported', unsupported.reason);

/* --- 6. clipboard copy ----------------------------------------------------- */
let copied = '';
let pendingTimer = null;
const copyButton = {
  attrs: {},
  textContent: '复制 JSON',
  setAttribute(name, value) {
    this.attrs[name] = value;
  },
  getAttribute(name) {
    return this.attrs[name];
  },
  querySelector() {
    return status;
  },
};
const status = { textContent: '' };
const copyPromise = T.copySnapshot('json', snapModel, view, sessionId, T0, say, copyButton, {
  clipboard: {
    writeText: (value) => {
      copied = value;
      return Promise.resolve();
    },
  },
  setTimeout: (fn) => {
    pendingTimer = fn;
    return 1;
  },
});
copyPromise.then((ok) => {
  check('snapshot.copy.clipboard', ok === true && copied.includes(T.constants().snapshotSchema), copied.slice(0, 60));
  check(
    'snapshot.copy.ack',
    copyButton.attrs['data-copy-state'] === 'copied' && status.textContent === '已复制',
    copyButton.attrs['data-copy-state'] + '/' + status.textContent
  );
  if (pendingTimer) pendingTimer();

  const failed = [];
  results.forEach((result) => {
    if (!result.pass) failed.push(result);
    console.log((result.pass ? 'PASS  ' : 'FAIL  ') + result.id + (result.detail ? '  — ' + result.detail : ''));
  });
  console.log('');
  console.log((results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length > 0) process.exitCode = 1;
});
