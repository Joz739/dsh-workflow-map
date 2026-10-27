// selftest-detail.mjs — step-11: node detail + step detail (and the copy path).
//
// Run: node tools/selftest-detail.mjs
//
// What this file proves, in order:
//   1. the bundle carries the pieces (build-client also refuses to ship without them)
//   2. the model: a PAE stepReport reaches model.detail (summary / artifacts / exit_code),
//      a step without a report stays null, and the statistics count ONLY the nodes the host
//      actually sent while stating the truncated remainder
//   3. the node detail tree: tool + category chip + status, argsText preview + <details>,
//      file rows grouped by action with the FULL path on data-wf-copy, result/error text,
//      start clock / duration ms / seq
//   4. the step detail tree: the report block, the artifacts, the "no report" message (never
//      a blank block), the counts and the clocks
//   5. privacy: a node that still carries a file body (`content`) cannot leak it — store.js
//      copies a whitelist, so the marker never reaches the tree
//   6. the copy path: Clipboard API success, the textarea/execCommand fallback, the 1.5 s
//      「已复制」 acknowledgement and its failed twin
//   7. Escape / the layout nudge: the bindings fire, are filter-correct, and tear down
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
/* load the built bundle (the same seam as selftest-panel)                   */
/* ------------------------------------------------------------------------- */

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

check('bundle.loader', loaded.definition !== null && loaded.definition.id === 'dsh-workflow-map', loaded.definition?.id);
check(
  'bundle.detailSeam',
  typeof T.renderNodeDetail === 'function' &&
    typeof T.renderStepDetail === 'function' &&
    typeof T.stepDetailOpen === 'function' &&
    typeof T.copyText === 'function' &&
    typeof T.bindEscape === 'function' &&
    typeof T.buildStepDetail === 'function' &&
    typeof T.stepReport === 'function',
  'every step-11 seam is exported'
);

/* ------------------------------------------------------------------------- */
/* tree helpers                                                              */
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
function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node.children || []).map(textOf).join('');
}

/* ------------------------------------------------------------------------- */
/* fixtures                                                                  */
/* ------------------------------------------------------------------------- */

const T0 = 1792243000000;
const SECRET = 'WF_READ_BODY_SECRET_7f3a9d_should_never_render';
const LONG_BASE =
  'pwsh -NoProfile -Command "Get-Content C:\\Users\\Administrator\\Documents\\dsh-plugins\\dsh-workflow-map\\src\\client\\NodeDetail.js | Select-Object -First 200 | ForEach-Object { $_ }"';
// Padded to EXACTLY the host cap (200) so the cap note and the full-text <details> are real.
const LONG_COMMAND = (LONG_BASE + ' # ' + 'x'.repeat(60)).slice(0, 200);

const nodes = [
  {
    id: 'e1',
    stepIndex: 0,
    kind: 'tool',
    tool: 'edit',
    title: 'edit NodeDetail.js',
    detail: 'file_path=D:/proj/src/client/NodeDetail.js old_str=… new_str=…',
    argsText: '{"file_path":"D:\\\\proj\\\\src\\\\client\\\\NodeDetail.js","old_str":"…","new_str":"…"}',
    files: [
      { path: 'D:\\proj\\src\\client\\NodeDetail.js', action: '改' },
      { path: 'D:\\proj\\src\\client\\StepDetail.js', action: '改' },
    ],
    resultHead: 'edited 2 blocks',
    error: '',
    at: T0 + 1000,
    durationMs: 42,
    seq: 101,
    // A body that must never be printed: store.js copies node fields explicitly.
    content: SECRET,
    old_str: SECRET,
  },
  {
    id: 'p1',
    stepIndex: 0,
    kind: 'tool',
    tool: 'pwsh',
    title: 'pwsh Get-Content',
    detail: 'pwsh -NoProfile …',
    argsText: LONG_COMMAND.slice(0, 200),
    files: [{ path: 'D:\\proj\\src\\client', action: '查' }],
    resultHead: '',
    error: '',
    at: T0 + 2000,
    durationMs: 1200,
    seq: 102,
    content: SECRET,
  },
  {
    id: 'err1',
    stepIndex: 1,
    kind: 'tool',
    tool: 'read',
    title: 'read missing.json',
    detail: 'path=C:\\x\\missing.json',
    argsText: '{"path":"C:\\\\x\\\\missing.json"}',
    files: [{ path: 'C:\\x\\missing.json', action: '读' }],
    resultHead: '',
    error: 'ENOENT: no such file or directory, open C:\\x\\missing.json',
    at: T0 + 3000,
    durationMs: 7,
    seq: 103,
    content: SECRET,
  },
  {
    id: 'r1',
    stepIndex: 1,
    kind: 'tool',
    tool: 'read',
    title: 'read plan.md',
    detail: 'path=D:\\proj\\plan.md',
    argsText: '{"path":"D:\\\\proj\\\\plan.md"}',
    files: [{ path: 'D:\\proj\\plan.md', action: '读' }],
    resultHead: 'first line of plan.md',
    error: '',
    at: T0 + 4000,
    durationMs: 11,
    seq: 104,
    content: SECRET,
  },
];

const steps = [
  {
    index: 0,
    planIndex: 1,
    title: '节点详情',
    status: 'done',
    percent: 100,
    percentSource: 'model',
    startedAt: T0,
    endedAt: T0 + 90000,
    nodeIds: ['e1', 'p1'],
    nodeCount: 2,
    groups: [],
  },
  {
    index: 1,
    planIndex: 2,
    title: '分步详情',
    status: 'running',
    percent: 40,
    percentSource: 'model',
    startedAt: T0 + 95000,
    endedAt: null,
    nodeIds: ['err1', 'r1'],
    // One node the host never sent: the detail must SAY so instead of under-counting.
    nodeCount: 3,
    groups: [],
  },
  {
    index: 2,
    planIndex: 3,
    title: '复制与键盘',
    status: 'pending',
    percent: null,
    nodeIds: [],
    nodeCount: 0,
    groups: [],
  },
];

const plan = {
  ver: 1,
  phase: 'executing',
  task: 'step-11 节点详情',
  taskTitle: 'step-11 节点详情',
  summary: '',
  planDir: 'C:\\pae',
  pausedReason: '',
  stepIndex: 2,
  steps: [],
  stepReports: [
    {
      stepIndex: 1,
      status: 'success',
      summary: '点节点能看到工具、参数、文件、耗时与结果；路径一键复制。',
      artifacts: ['D:\\proj\\out\\step11-evidence.md', 'D:\\proj\\out\\step11-measure.json'],
      exitCode: 0,
    },
    {
      stepIndex: 2,
      status: 'failed',
      summary: '复制路径时 Clipboard API 不可用，已回退 textarea。',
      artifacts: [],
      exitCode: 1,
    },
  ],
  statuses: { '1': 'completed', '2': 'in_progress', '3': 'pending' },
  anchorSeqs: { '1': 10, '2': 20 },
  skipped: [],
  asOfMtime: 1,
  sourcePath: 'C:\\pae\\orchestrator.json',
};

const view = { asOf: T0 + 100000, task: 'step-11 节点详情', steps, nodes, plan, active: { stepIndex: 1, nodeId: 'r1' }, counts: { steps: 3, nodes: 4, running: 1, completed: 1 } };
// 会话4 · the fixture opens the right-hand page: the step detail LIVES there now, so every
// renderer assertion counts one detail block inside the right page instead of under the card.
const prefs = { ...T.defaultPrefs(), rightOpen: true, rightKind: 'step' };
const noop = () => {};

/* ------------------------------------------------------------------------- */
/* 2. the model                                                              */
/* ------------------------------------------------------------------------- */

const model0 = T.buildModel(view, { ...prefs, selectedStep: 0 }, T0 + 100000);
check('model.detail.present', !!model0.detail && model0.detail.index === 0, JSON.stringify(model0.detail));
check(
  'model.detail.report',
  model0.detail.report && model0.detail.report.summary.includes('点节点') && model0.detail.report.exitCode === 0,
  JSON.stringify(model0.detail.report)
);
check('model.detail.artifacts', model0.detail.report.artifacts.length === 2, model0.detail.report.artifacts.join(','));
check('model.detail.tools', model0.detail.tools === 2, model0.detail.tools);
check('model.detail.filesDistinct', model0.detail.files === 3, model0.detail.files);
check('model.detail.nodes', model0.detail.nodes === 2 && model0.detail.truncated === 0, JSON.stringify({ n: model0.detail.nodes, t: model0.detail.truncated }));
check(
  'model.detail.clock',
  model0.detail.startedAt === T0 && model0.detail.endedAt === T0 + 90000,
  JSON.stringify({ s: model0.detail.startedAt, e: model0.detail.endedAt })
);

const model1 = T.buildModel(view, { ...prefs, selectedStep: 1 }, T0 + 100000);
check('model.detail.truncatedHonest', model1.detail.nodes === 3 && model1.detail.truncated === 1, JSON.stringify({ n: model1.detail.nodes, t: model1.detail.truncated }));
check('model.detail.runningEnd', model1.detail.endedAt === null && model1.detail.startedAt === T0 + 95000, JSON.stringify({ s: model1.detail.startedAt, e: model1.detail.endedAt }));
check('model.detail.failedReport', model1.detail.report.status === 'failed' && model1.detail.report.exitCode === 1, JSON.stringify(model1.detail.report));

const model2 = T.buildModel(view, { ...prefs, selectedStep: 2 }, T0 + 100000);
check('model.detail.noReport', model2.detail.report === null, JSON.stringify(model2.detail.report));
check('model.detail.emptyCounts', model2.detail.tools === 0 && model2.detail.files === 0 && model2.detail.nodes === 0, JSON.stringify(model2.detail));

check(
  'model.flow.argsText',
  model0.flow.nodes[0].argsText.startsWith('{"file_path"') && model0.flow.nodes[0].seq === 101,
  JSON.stringify({ args: model0.flow.nodes[0].argsText.slice(0, 20), seq: model0.flow.nodes[0].seq })
);
check(
  'model.flow.fileList',
  Array.isArray(model0.flow.nodes[0].fileList) && model0.flow.nodes[0].fileList.length === 2,
  JSON.stringify(model0.flow.nodes[0].fileList)
);
check('model.flow.bodyDropped', model0.flow.nodes[0].content === undefined && model0.flow.nodes[0].old_str === undefined, 'store whitelist');
check('model.flow.errorText', model1.flow.nodes[0].error === true && model1.flow.nodes[0].errorText.startsWith('ENOENT'), model1.flow.nodes[0].errorText);

/* ------------------------------------------------------------------------- */
/* 3/4. rendering                                                            */
/* ------------------------------------------------------------------------- */

const actions = {
  onSelectStep: noop,
  onSelectNode: noop,
  onToggleGroup: noop,
  onShowAll: noop,
  onToggleBranch: noop,
  onStepInfo: noop,
  onCloseStepDetail: noop,
  onEscapeDetail: noop,
  onCopy: noop,
};

// 会话4 · the step detail is no longer inline: it is the right-hand page. The fixture therefore asks
// for the selected step's page and hands renderPanel the spec the component would derive
// (wfRightPageSpec) together with the same prefs that open it.
function rightFor(model, openCall) {
  const pages = { rightOpen: true, rightKind: 'step', rightKey: 'step:' + model.selected };
  return {
    prefs: { ...prefs, ...pages },
    extras: Object.assign(extrasFor(model, null, null), {
      right: {
        kind: 'step',
        stepIndex: model.selected,
        unit: model.page.units[model.selected],
        stepDetail: model.detail,
        openType: null,
        scopeStep: model.selected,
        openCall: openCall === undefined ? null : openCall,
      },
      pageStep: model.selected,
      openCall: openCall === undefined ? null : openCall,
    }),
  };
}

function extrasFor(model, flowUi, closedStep) {
  return {
    settingsOpen: false,
    status: 'live',
    error: '',
    rev: 1,
    endpoint: '/dsh-workflow/state?sessionId=selftest',
    nodeTotal: nodes.length,
    flow: flowUi,
    stepDetail: closedStep === undefined ? null : closedStep,
    motion: 'css',
    idle: false,
  };
}

function render(model, flowUi, closedStep) {
  // `closedStep` is the OLD inline-detail notion. In the single page a closed detail simply means
  // the right page is not requested at all (the user pressed × or Escape).
  if (closedStep !== undefined && closedStep !== null) {
    return T.renderPanel(model, { ...prefs, rightOpen: false }, say, actions, extrasFor(model, flowUi, closedStep));
  }
  const page = rightFor(model);
  return T.renderPanel(model, page.prefs, say, actions, page.extras);
}

const flow0 = T.flowUiFor({ stepIndex: 0, selectedNode: 'e1' }, 0);
const tree0 = render(model0, flow0, null);

check('render.stepDetail.count', byData(tree0, 'step-detail').length === 1, byData(tree0, 'step-detail').length);
const detailEl = byData(tree0, 'step-detail')[0];
check('render.stepDetail.report', detailEl.props['data-report'] === 'true' && detailEl.props['data-step-index'] === 0, JSON.stringify(detailEl.props));
check('render.stepDetail.summary', textOf(detailEl).includes('点节点能看到工具'), textOf(detailEl).slice(0, 80));
check('render.stepDetail.artifacts', textOf(detailEl).includes('step11-evidence.md') && textOf(detailEl).includes('step11-measure.json'), 'artifact basenames');
check('render.stepDetail.exit', textOf(detailEl).includes('退出码 0'), 'exit code');
check('render.stepDetail.stats', textOf(detailEl).includes('2 工具') && textOf(detailEl).includes('3 文件'), textOf(detailEl).slice(0, 120));
check('render.stepDetail.time', textOf(detailEl).includes('开始') && textOf(detailEl).includes('结束'), 'both clocks');

// 会话4 · 「i」 and the disclosure triangles belonged to the old left column; the single page's
// unit card IS the entry point (it opens the right page). The assertions therefore move to the
// card's own aria-pressed / data-selected wiring, which is the same fact.
const infoButtons = byData(tree0, 'step');
check('render.stepInfo.count', infoButtons.length === 3, infoButtons.length);
check(
  'render.stepInfo.selected',
  infoButtons[0].props['data-selected'] === 'true' &&
    infoButtons[1].props['data-selected'] === 'false' &&
    infoButtons[0].props['aria-pressed'] === 'true',
  JSON.stringify(infoButtons.map((b) => b.props['aria-pressed']))
);
check('render.stepHead', textOf(byData(tree0, 'page-head')[0]).includes('主流程'), textOf(byData(tree0, 'page-head')[0]));
// The step's tool/file counts ride on the unit's meta line; the page head carries the flow's own
// caption. Both are asserted, because they come from two different sources.
const headerText = textOf(byData(tree0, 'step')[0]);
check('render.stepHead', headerText.includes('2 工具') && headerText.includes('3 文件'), headerText.slice(0, 80));

// 会话4 · a node detail now lives inside the TYPE page (a call row expands in place). The renderer
// itself is unchanged, so the fixture drives it directly with the SAME node the model carries —
// these assertions are about the blocks, the caps and the whitelist, not the old column.
function renderNodeDetailOf(model, nodeId) {
  const node = model.flow.nodes.find((one) => one.id === nodeId);
  return T.renderNodeDetail(createElement, node, say, actions, { detail: 'summary' });
}

// A type page also carries them: the call rows of step 0's .js circle, one of them expanded.
const typePage = T.renderRightPage(
  createElement,
  model0,
  say,
  actions,
  {
    kind: 'type',
    stepIndex: 0,
    scopeStep: 0,
    openType: 'file:.js',
    label: 'js',
    bucket: { key: 'file:.js', kind: 'file', label: 'js', side: 'left', count: 2, running: false, error: false, nodes: ['e1', 'p1'] },
    nodes: model0.flow.nodes.filter((one) => one.id === 'e1' || one.id === 'p1'),
    openCall: 'e1',
  }
);
check(
  'render.typePage.calls',
  byData(typePage, 'call').length === 2 && byData(typePage, 'node-detail').length === 1,
  byData(typePage, 'call').length + ' rows, ' + byData(typePage, 'node-detail').length + ' opened detail'
);

const nodeDetail = [renderNodeDetailOf(model0, 'e1')];
check('render.nodeDetail.count', nodeDetail.length === 1 && nodeDetail[0].props['data-node-id'] === 'e1', nodeDetail.length);
const detailText = textOf(nodeDetail[0]);
check('render.nodeDetail.head', nodeDetail[0].props['data-category'] === 'file' && detailText.includes('edit') && detailText.includes('修改'), detailText.slice(0, 60));
check('render.nodeDetail.fileRows', byClass(nodeDetail[0], 'wf-detail-file').length === 2, byClass(nodeDetail[0], 'wf-detail-file').length);
const copyRows = findAll(nodeDetail[0], (el) => el.props && el.props['data-wf-copy']);
const pathCopy = copyRows.find((el) => el.props['data-wf-copy'] === 'D:\\proj\\src\\client\\NodeDetail.js');
check('render.nodeDetail.fullPath', !!pathCopy && textOf(pathCopy).includes('NodeDetail.js'), pathCopy ? pathCopy.props['data-wf-copy'] : 'missing');
check('render.nodeDetail.dir', !!pathCopy && textOf(pathCopy).includes('D:/proj/src/client'), pathCopy ? textOf(pathCopy) : '');
check('render.nodeDetail.args', detailText.includes('参数') && detailText.includes('file_path'), detailText.slice(0, 160));
check('render.nodeDetail.meta', detailText.includes('耗时 42ms') && detailText.includes('seq 101') && detailText.includes('开始'), detailText.slice(-120));
check('render.nodeDetail.result', detailText.includes('edited 2 blocks'), 'result head');
check('render.nodeDetail.privacy', detailText.indexOf(SECRET) === -1 && textOf(tree0).indexOf(SECRET) === -1, 'a `content` body never reaches the tree');

// The command node: default preview + the whole stored command behind <details>.
const flowPwsh = T.flowUiFor({ stepIndex: 0, selectedNode: 'p1' }, 0);
const treePwsh = render(model0, flowPwsh, null);
const pwshDetail = renderNodeDetailOf(model0, 'p1');
const more = byClass(pwshDetail, 'wf-detail-more')[0];
check('render.command.details', !!more && more.props['data-wf-more'] === 'command', more ? more.props['data-wf-more'] : 'missing');
check('render.command.summary', textOf(more.children[0]).includes('查看完整命令'), textOf(more.children[0]));
check('render.command.fullArgs', textOf(more.children[1]) === LONG_COMMAND.slice(0, 200), textOf(more.children[1]).length);
check('render.command.copy', findAll(pwshDetail, (el) => el.props && el.props['data-wf-copy'] === LONG_COMMAND.slice(0, 200)).length === 1, 'a command copy control');
check('render.command.capNote', textOf(pwshDetail).includes('200 字'), 'the host cap is stated');

// Error node: red card + the stored error text in the detail.
const flowErr = T.flowUiFor({ stepIndex: 1, selectedNode: 'err1' }, 1);
const treeErr = render(model1, flowErr, null);
const errorDetail = renderNodeDetailOf(model1, 'err1');
check('render.error.status', errorDetail.props['data-status'] === 'error' && textOf(errorDetail).includes('ENOENT'), textOf(errorDetail).slice(0, 120));
// The unit is the chain's status carrier now. The host marks that row `running` (it is the active
// step), so the assertion is about the unit REFLECTING the row's status, not about inventing one.
check(
  'render.error.unitStatus',
  byData(treeErr, 'unit').some((unit) => unit.props['data-status'] === 'running' || unit.props['data-status'] === 'failed'),
  'the unit carries the step status'
);
check('render.error.capNote', textOf(errorDetail).includes('首行'), textOf(errorDetail).slice(-80));

// No report: an explicit sentence, never a blank block.
const treeNoReport = render(model2, T.flowUiFor({ stepIndex: 2 }, 2), null);
const noReportEl = byData(treeNoReport, 'step-detail')[0];
check('render.stepDetail.noReport', noReportEl.props['data-report'] === 'false' && textOf(noReportEl).includes('这一步还没交报告'), textOf(noReportEl));
check('render.stepDetail.noReportCounts', textOf(noReportEl).includes('0 工具') && textOf(noReportEl).includes('无时间记录'), textOf(noReportEl));
// Closed state: no detail at all, and the 「i」 says so.
const treeClosed = render(model0, flow0, 0);
check('render.closed.none', byData(treeClosed, 'step-detail').length === 0, byData(treeClosed, 'step-detail').length);
check(
  'render.closed.noneRight',
  byData(treeClosed, 'right').length === 0,
  'a closed page renders no aside at all'
);

// Another step's 「i」 -> select + open; same step -> toggle.
check('ui.openDefault', T.stepDetailOpen(null, 2) === true, 'open by default');
check('ui.openOtherStep', T.stepDetailOpen(0, 1) === true, 'closing step 0 does not close step 1');
check('ui.toggleClosed', T.stepDetailToggle(null, 2) === 2, 'toggle closes');
check('ui.toggleOpen', T.stepDetailToggle(2, 2) === null, 'toggle reopens');
check('ui.openFor', JSON.stringify(T.stepDetailOpenFor(4)) === JSON.stringify({ selectedStep: 4, closedStep: null }), JSON.stringify(T.stepDetailOpenFor(4)));

// Action wiring: the file row's click hands over the FULL path, 「i」 its index.
let copied = null;
let copiedElement = null;

// The generic click helper the whole file uses from here on.
function clickFirst(tree, predicate) {
  const el = findAll(tree, predicate)[0];
  if (el && typeof el.props.onClick === 'function') el.props.onClick({ currentTarget: null });
}
// 会话4 · the copy row and the page-closing wired actions. The file row lives in the TYPE page's
// opened call detail, and 「×」 is the page's own close button.
const typeTree0 = T.renderRightPage(
  createElement,
  model0,
  say,
  { ...actions, onCopy: (text, element) => ((copied = text), (copiedElement = element)) },
  {
    kind: 'type',
    stepIndex: 0,
    scopeStep: 0,
    openType: 'file:.js',
    label: 'js',
    bucket: { key: 'file:.js', kind: 'file', label: 'js', side: 'left', count: 2, running: false, error: false, nodes: ['e1'] },
    nodes: model0.flow.nodes.filter((one) => one.id === 'e1'),
    openCall: 'e1',
  }
);
const wiredRow = findAll(typeTree0, (el) => el.props && el.props['data-wf-copy'] === 'D:\\proj\\src\\client\\NodeDetail.js')[0];
wiredRow.props.onClick({ currentTarget: { name: 'fake-button' } });
check('actions.copy', copied === 'D:\\proj\\src\\client\\NodeDetail.js', String(copied));

let closedPage = 0;
const closingTree = T.renderRightPage(
  createElement,
  model0,
  say,
  { ...actions, onClosePage: () => (closedPage += 1) },
  {
    kind: 'step',
    stepIndex: 0,
    scopeStep: 0,
    unit: model0.page.units[0],
    stepDetail: model0.detail,
    openType: null,
  }
);
clickFirst(closingTree, (el) => hasData(el) && el.props['data-dsh-workflow-map'] === 'page-close');
check('actions.pageClose', closedPage === 1, String(closedPage));

// The chain's own click: a unit opens ITS step (onOpenStep), a circle opens its type (onOpenType).
let openedStep = null;
let openedType = null;
const chainTree = T.renderMainFlow(
  createElement,
  model0,
  say,
  { onOpenStep: (index) => (openedStep = index), onOpenType: (index, key) => (openedType = index + '|' + key) },
  { openStep: null, openType: null, asOf: T0 + 100000 }
);
clickFirst(chainTree, (el) => hasData(el) && el.props['data-dsh-workflow-map'] === 'step' && el.props['data-step-index'] === 1);
check('actions.openStep', openedStep === 1, String(openedStep));
clickFirst(chainTree, (el) => hasData(el) && el.props['data-dsh-workflow-map'] === 'sat');
check('actions.openType', typeof openedType === 'string' && openedType.includes('|'), String(openedType));

/* ------------------------------------------------------------------------- */
/* 4b. step-02: the disclosure triangle is a real <button>                   */
/* ------------------------------------------------------------------------- */
// The user's 「缩进号」 was a `::before` glyph — a decoration that could not be clicked,
// tabbed to, or announced. These assertions pin the replacement: one shared renderer
// (wfTri), a sibling of the row it discloses, a 20 px × full-height band, and a state that
// comes from the SAME source the row itself uses.

const triGlyph = T.triGlyph;
check('tri.glyph.pure', triGlyph(true) === '▾' && triGlyph(false) === '▸' && triGlyph(undefined) === '▸', `${triGlyph(true)}/${triGlyph(false)}`);

// 会话4 · the unit card has no disclosure triangle any more: clicking it opens the right page, so
// there is nothing to disclose in place. What must still hold is that the card is a real button,
// one per step, carrying its own ordinals and status.
const unitCards = byData(tree0, 'step');
check('unit.count', unitCards.length === 3, unitCards.length + ' unit cards for 3 steps');
check(
  'unit.isButton',
  unitCards.every((el) => el.type === 'button' && el.props.type === 'button'),
  unitCards.map((el) => el.type).join(',')
);
check(
  'unit.siblings',
  findAll(tree0, (el) => el.props && el.props.className === 'wf-unit').every(
    (li) => li.props['data-dsh-workflow-map'] === 'unit' && findAll(li, (one) => hasData(one) && one.props['data-dsh-workflow-map'] === 'step').length === 1
  ),
  'one card per unit, and the unit is the row'
);
check(
  'unit.noTriangle',
  byData(tree0, 'step-tri').length === 0,
  'no disclosure triangle is drawn on a unit'
);

// The satellite circles: only the running step's calls light up, and only existing types get a circle.
const unitSats = byData(tree0, 'sat');
check(
  'unit.satellites.count',
  unitSats.length >= 1 && unitSats.every((el) => el.type === 'button' && el.props['aria-label'].length > 0),
  unitSats.length + ' circles, each named'
);
check(
  'unit.satellites.sides',
  unitSats.every((el) => el.props['data-side'] === 'left' || el.props['data-side'] === 'right'),
  unitSats.map((el) => el.props['data-side']).join(',')
);
check(
  'unit.satellites.types',
  unitSats.every((el) => typeof el.props['data-type'] === 'string' && el.props['data-type'].length > 0),
  unitSats.map((el) => el.props['data-type']).join(',')
);

// --- the derivation: extension → bucket → side ----------------------------------
check('type.ext.simple', T.typeOfPath('D:\\proj\\src\\client\\NodeDetail.js') === '.js', T.typeOfPath('D:\\proj\\src\\client\\NodeDetail.js'));
check('type.ext.long', T.typeOfPath('D:\\a\\cadflow-A3FIX-20261011.md') === '.md', T.typeOfPath('D:\\a\\cadflow-A3FIX-20261011.md'));
check('type.ext.compound', T.typeOfPath('C:\\a\\pkg.tar.gz') === '.tar.gz', T.typeOfPath('C:\\a\\pkg.tar.gz'));
check('type.ext.none', T.typeOfPath('C:\\Windows\\System32') === '' && T.typeOfPath('') === '', 'no extension → the empty bucket');
check('type.ext.dotfile', T.typeOfPath('C:\\a\\.gitignore') === '.gitignore', T.typeOfPath('C:\\a\\.gitignore'));
check(
  'type.badge',
  T.typeBadge('.md') === 'md' && T.typeBadge('.dxf') === 'dxf' && T.typeBadge('.tar.gz') === 'tar' && T.typeBadge('') === 'file',
  [T.typeBadge('.md'), T.typeBadge('.dxf'), T.typeBadge('.tar.gz'), T.typeBadge('')].join('/')
);
check(
  'type.side',
  T.typeSide('读') === 'left' && T.typeSide('查') === 'left' && T.typeSide('改') === 'right' && T.typeSide('写') === 'right' && T.typeSide('') === 'right',
  [T.typeSide('读'), T.typeSide('查'), T.typeSide('改'), T.typeSide('写')].join('/')
);
// `wfTypeBuckets` takes the FIRST side it saw for a type and never flips it later — a .md file that
// is read in one call and edited in another stays ONE circle (on the side of its first evidence),
// so the same type can never appear twice.
const mixNodes = [
  { id: 'a', tool: 'read', fileList: [{ path: 'D:/p/a.md', action: '读' }, { path: 'D:/p/b.md', action: '读' }, { path: 'D:/p/c.py', action: '读' }] },
  { id: 'b', tool: 'edit', fileList: [{ path: 'D:/p/d.svg', action: '改' }], error: true },
  { id: 'c', tool: 'pwsh', fileList: [] },
];
const mixSides = T.typeSides(mixNodes, 'c');
check(
  'type.buckets.order',
  mixSides.left.map((one) => one.key).join(',') === 'file:.md,file:.py',
  mixSides.left.map((one) => one.key + '×' + one.count).join(' ')
);
// Two markdown files in one call → ONE circle with a count of 2 (not two circles).
check('type.buckets.count', mixSides.left[0].key === 'file:.md' && mixSides.left[0].count === 2, mixSides.left[0].count);
check(
  'type.buckets.tool',
  mixSides.right.length === 2 && mixSides.right[0].key === 'tool:pwsh' && mixSides.right[0].running === true,
  mixSides.right.map((one) => one.key).join(',')
);
check(
  'type.buckets.error',
  mixSides.right.some((one) => one.key === 'file:.svg' && one.error === true) && mixSides.left.every((one) => one.error === false),
  'the failed call marks ITS type, not every type of the step'
);
check(
  'type.buckets.slots',
  mixSides.left.length <= T.constants().sideSlots && mixSides.right.length <= T.constants().sideSlots,
  mixSides.left.length + '+' + mixSides.right.length
);
// Oversubscription is COUNTED, never silently dropped.
const manyTypes = [];
for (let i = 0; i < 6; i += 1) {
  manyTypes.push({ id: 'm' + i, tool: 'read', fileList: [{ path: 'D:/q/f' + i + '.ext' + i, action: '读' }] });
}
const manySides = T.typeSides(manyTypes, null);
check(
  'type.buckets.dropped',
  manySides.left.length === T.constants().sideSlots && manySides.dropped.left === 6 - T.constants().sideSlots,
  manySides.left.length + ' drawn, ' + manySides.dropped.left + ' counted'
);

// The folded run shares the renderer: same shape, same aria, and its click toggles the group.
const groupView = {
  steps: [{ index: 0, planIndex: 1, title: '分组', status: 'running', percent: 50, percentSource: 'model', nodeIds: ['g1', 'g2', 'g3'], nodeCount: 3, groups: [] }],
  nodes: [
    { id: 'g1', stepIndex: 0, kind: 'tool', tool: 'read', title: 'read a', detail: '', files: [], resultHead: '', error: '', at: T0 },
    { id: 'g2', stepIndex: 0, kind: 'tool', tool: 'read', title: 'read b', detail: '', files: [], resultHead: '', error: '', at: T0 + 1000 },
    { id: 'g3', stepIndex: 0, kind: 'tool', tool: 'read', title: 'read c', detail: '', files: [], resultHead: '', error: '', at: T0 + 2000 },
  ],
  plan: null,
  counts: { steps: 1, nodes: 3, running: 1, completed: 0 },
};
const groupModel = T.buildModel(groupView, { ...prefs, selectedStep: 0 }, T0 + 5000);
const groupRanges = T.flowGroups(groupModel.flow.nodes, groupModel.flow.groups);
let triGroup = null;
const groupTree = T.renderFlowColumn(createElement, groupModel, say, { ...actions, onToggleGroup: (key) => (triGroup = key) }, T.flowUiFor(null, 0));
const groupTri = byData(groupTree, 'group-tri');
check('tri.group.count', groupTri.length === 1, groupTri.length + ' group triangles');
check(
  'tri.group.isButton',
  groupTri[0].type === 'button' && groupTri[0].props['aria-expanded'] === 'false' && groupTri[0].props['data-expanded'] === 'false' && textOf(groupTri[0]) === '▸',
  `${groupTri[0].type} ${groupTri[0].props['aria-expanded']} ${textOf(groupTri[0])}`
);
check(
  'tri.group.sibling',
  byData(groupTree, 'group')[0].props['data-dsh-workflow-map'] === 'group' &&
    findAll(groupTree, (el) => el.props && el.props.className === 'wf-group-row')[0].children[0].props['data-dsh-workflow-map'] === 'group-tri',
  'the group row wraps [triangle][head] — still no nested button'
);
check(
  'tri.group.controls',
  groupTri[0].props['aria-controls'] === 'wf-group-body-' + groupRanges[0].key + '-' + groupRanges[0].from,
  groupTri[0].props['aria-controls']
);
clickFirst(groupTree, (el) => hasData(el) && el.props['data-dsh-workflow-map'] === 'group-tri');
check('tri.group.click', triGroup === groupRanges[0].key, String(triGroup));
const openGroupTree = T.renderFlowColumn(createElement, groupModel, say, actions, T.flowToggleGroup(T.flowUiFor(null, 0), 0, groupRanges[0].key));
check(
  'tri.group.openState',
  byData(openGroupTree, 'group-tri')[0].props['aria-expanded'] === 'true' &&
    textOf(byData(openGroupTree, 'group-tri')[0]) === '▾' &&
    findAll(openGroupTree, (el) => el.props && el.props.className === 'wf-group-body').length === 1,
  'an open run flips the triangle to ▾ and exposes its body'
);
check('tri.oneRenderer', typeof T.tri === 'function' && T.tri(createElement, false, () => {}, { label: 'x' }).props.className === 'wf-tri', 'both call sites share wfTri');
/* ------------------------------------------------------------------------- */
/* 5. copy path                                                              */
/* ------------------------------------------------------------------------- */

const copyTarget = 'D:\\proj\\src\\client\\NodeDetail.js';
let clipboardText = null;
await T.copyText(copyTarget, { clipboard: { writeText: (text) => ((clipboardText = text), Promise.resolve()) } }).then((ok) => {
  check('copy.clipboard', ok === true && clipboardText === copyTarget, String(clipboardText));
});

function fakeDocument(execResult) {
  const record = { appended: 0, removed: 0, exec: 0 };
  const body = {
    appendChild: () => (record.appended += 1),
  };
  const area = {
    value: '',
    style: {},
    setAttribute: () => {},
    focus: () => {},
    select: () => {},
    setSelectionRange: () => {},
    parentNode: { removeChild: () => (record.removed += 1) },
  };
  return {
    record,
    document: {
      body,
      createElement: () => area,
      execCommand: () => {
        record.exec += 1;
        return execResult;
      },
    },
    area,
  };
}

const fallback = fakeDocument(true);
const fallbackOk = await T.copyText(copyTarget, {
  clipboard: { writeText: () => Promise.reject(new Error('denied')) },
  document: fallback.document,
});
check('copy.fallbackOnReject', fallbackOk === true && fallback.record.exec === 1 && fallback.area.value === copyTarget, JSON.stringify(fallback.record));
check('copy.fallbackCleansUp', fallback.record.appended === 1 && fallback.record.removed === 1, JSON.stringify(fallback.record));

const failing = fakeDocument(false);
const failedOk = await T.copyText(copyTarget, { clipboard: null, document: failing.document });
check('copy.fallbackFails', failedOk === false && failing.record.exec === 1, String(failedOk));

// The 1.5 s acknowledgement, driven with a fake timer.
function fakeButton(label) {
  return {
    textContent: label,
    attrs: { 'data-wf-copy-label': label },
    getAttribute(name) {
      return this.attrs[name] === undefined ? null : this.attrs[name];
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
  };
}
let timerFn = null;
let timerMs = null;
const button = fakeButton('复制路径');
const ackOk = await T.copyWithFeedback(copyTarget, button, say, {
  clipboard: { writeText: () => Promise.resolve() },
  setTimeout: (fn, ms) => {
    timerFn = fn;
    timerMs = ms;
    return 1;
  },
});
check('copy.ack', ackOk === true && button.textContent === '已复制' && button.attrs['data-copy-state'] === 'copied', `${button.textContent} / ${button.attrs['data-copy-state']}`);
check('copy.ackMs', timerMs === 1500, String(timerMs));
if (timerFn) timerFn();
check('copy.ackRestore', button.textContent === '复制路径' && button.attrs['data-copy-state'] === 'idle', `${button.textContent} / ${button.attrs['data-copy-state']}`);

const failedButton = fakeButton('复制路径');
const failDoc = fakeDocument(false);
await T.copyWithFeedback(copyTarget, failedButton, say, { clipboard: null, document: failDoc.document, setTimeout: () => 0 });
check('copy.ackFailed', failedButton.textContent === '复制失败' && failedButton.attrs['data-copy-state'] === 'failed', failedButton.textContent);

check('copy.buttonAttrs', pathCopy.props['data-wf-copy-label'] === 'NodeDetail.js' && pathCopy.props['data-copy-state'] === 'idle', JSON.stringify(pathCopy.props));

/* ------------------------------------------------------------------------- */
/* 6. Escape + the layout nudge                                              */
/* ------------------------------------------------------------------------- */

check('key.escape', T.escapeIntent({ key: 'Escape' }) === true, 'plain Escape');
check('key.modified', T.escapeIntent({ key: 'Escape', altKey: true }) === false && T.escapeIntent({ key: 'Escape', ctrlKey: true }) === false, 'modified Escape is not ours');
check('key.composing', T.escapeIntent({ key: 'Escape', isComposing: true }) === false, 'IME composition');
check('key.other', T.escapeIntent({ key: 'Enter' }) === false && T.escapeIntent(null) === false, 'other keys');

function fakeDoc() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const at = list.indexOf(fn);
      if (at >= 0) list.splice(at, 1);
    },
    fire(type, event) {
      for (const fn of (listeners.get(type) || []).slice()) fn(event);
    },
  };
}

const escDoc = fakeDoc();
let escapes = 0;
const escBind = T.bindEscape(escDoc, { onEscapeDetail: () => (escapes += 1) });
escDoc.fire('keydown', { key: 'Escape' });
escDoc.fire('keydown', { key: 'Escape', altKey: true });
check('key.bindFires', escapes === 1, String(escapes));
escBind.destroy();
escDoc.fire('keydown', { key: 'Escape' });
check('key.bindDestroyed', escapes === 1 && (escDoc.listeners.get('keydown') || []).length === 0, String(escapes));

const nudgeDoc = fakeDoc();
const nudgeEvents = [];
let nudgeTimer = null;
const nudgeWin = {
  setTimeout: (fn, ms) => ((nudgeTimer = { fn, ms }), 2),
  dispatchEvent: (event) => nudgeEvents.push(event.type),
  Event: class {
    constructor(type) {
      this.type = type;
    }
  },
};
const nudgeBind = T.bindDetailNudge(nudgeDoc, nudgeWin);
nudgeDoc.fire('toggle', {});
check('nudge.scheduled', nudgeTimer !== null && nudgeTimer.ms === 40, JSON.stringify(nudgeTimer));
if (nudgeTimer) nudgeTimer.fn();
check('nudge.fires', nudgeEvents.length === 1 && nudgeEvents[0] === 'resize', nudgeEvents.join(','));
nudgeDoc.fire('click', { target: { closest: (selector) => (selector.includes('step-info') ? {} : null) } });
check('nudge.stepInfo', nudgeTimer !== null, 'a step-info click re-measures');
nudgeBind.destroy();
check('nudge.destroyed', (nudgeDoc.listeners.get('click') || []).length === 0 && (nudgeDoc.listeners.get('toggle') || []).length === 0, 'both listeners removed');

/* ------------------------------------------------------------------------- */
/* 7. stylesheet + the privacy rule is structural                            */
/* ------------------------------------------------------------------------- */

const css = T.css();
check('css.detailBox', css.includes('.wf-node-detail{') && css.includes('.wf-step-detail{'), 'both boxes');
check('css.preWrap', css.includes('white-space:pre-wrap'), 'args / error text keeps its line breaks');
check('css.copyState', css.includes("data-copy-state='copied'") && css.includes("data-copy-state='failed'"), 'acknowledgement colours');
check(
  'css.stepInfo',
  css.includes('.wf-step-info{') && css.includes('.wf-step-card{padding-left:20px;padding-right:26px}'),
  'the 「i」 band (right) and the triangle band (left)'
);
// step-02: the triangle is a real element now — the CSS must size its band and the
// ::before glyph must be gone for good.
check(
  'css.triBand',
  css.includes('.wf-tri{grid-area:1/1;align-self:stretch;justify-self:start;width:20px;min-height:100%'),
  'a 20 px band that stretches to the card height'
);
check('css.triFocus', css.includes('.wf-tri:focus-visible{outline:2px solid'), 'keyboard focus ring on the triangle');
check(
  'css.noPseudoTriangle',
  !css.includes("content:'▸ '") && !css.includes("content:'▾ '") && !css.includes('wf-group-caret'),
  'no ::before triangle, no rotated caret span left behind'
);
check('css.stepGrid', css.includes('.wf-step-item{display:grid;grid-template-columns:1fr'), 'one-column grid so the triangle and the card share a cell');
check('css.groupRow', css.includes('.wf-group-row{display:grid;grid-template-columns:1fr}'), 'the folded run gets the same grid');
check('css.reducedMotion', css.includes('@media (prefers-reduced-motion: reduce)'), 'still honoured');

// Whitelisting is the privacy mechanism: a wire node with a body must not pass buildModel.
const leakyView = {
  steps: [{ index: 0, title: 'leak', status: 'running', nodeIds: ['x'], nodeCount: 1 }],
  nodes: [
    {
      id: 'x',
      kind: 'tool',
      tool: 'read',
      title: 'read secret',
      detail: '',
      argsText: '{"path":"D:\\\\secret.txt"}',
      files: [{ path: 'D:\\secret.txt', action: '读' }],
      resultHead: 'ok',
      error: '',
      at: T0,
      durationMs: 1,
      seq: 9,
      content: SECRET,
      body: SECRET,
    },
  ],
  counts: { steps: 1, nodes: 1, running: 1, completed: 0 },
};
const leakyModel = T.buildModel(leakyView, { ...prefs, selectedStep: 0 }, T0);
const leakyNode = leakyModel.flow.nodes[0];
check('privacy.nodeWhitelist', leakyNode.content === undefined && leakyNode.body === undefined, Object.keys(leakyNode).join(','));
const leakyTree = T.renderPanel(leakyModel, { ...prefs }, say, actions, extrasFor(leakyModel, T.flowUiFor({ stepIndex: 0, selectedNode: 'x' }, 0), null));
check('privacy.treeClean', textOf(leakyTree).indexOf(SECRET) === -1, 'no body text in the whole panel');

/* ------------------------------------------------------------------------- */
/* report                                                                    */
/* ------------------------------------------------------------------------- */

const failed = results.filter((result) => !result.pass);
for (const result of results) {
  if (!result.pass) process.stdout.write(`FAIL  ${result.id}  ${result.detail}\n`);
}
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
if (failed.length > 0) process.exitCode = 1;
