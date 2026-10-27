// selftest-panel.mjs — panel skeleton self-check.
//
// It loads the BUILT client.js exactly the way the page does (a `window.__ModuleLoader__`
// stub + a fake `require("react")`), then drives the pure parts of the bundle:
// - preferences round-trip / clamping / resilience
// - the conditional poll (200 / 304 / 4xx / network error) and its headers
// - session-id resolution (current, and the retainedBy.mainView fallback)
// - view → model (selection, progress, flow, empty and planning states)
// - the pure renderer tree (capsule, two columns, no DOM when empty)
// - the stylesheet contract (geometry, tokens, pointer-events)
//
// Run: node tools/selftest-panel.mjs
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
/* load the built bundle */
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

check('bundle.loader.called', loaded.definition !== null && typeof loaded.definition.factory === 'function', 'window.__ModuleLoader__.load ran');
check('bundle.id', loaded.definition?.id === 'dsh-workflow-map', loaded.definition?.id);

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

const fakeReact = { createElement };
const entry = loaded.definition.factory((name) => {
  if (name === 'react') return fakeReact;
  throw new Error('unexpected require: ' + name);
});
const T = entry.__test;

check('bundle.exports.inject', JSON.stringify(entry.inject) === JSON.stringify(['slots', 'locale']), JSON.stringify(entry.inject));
check('bundle.exports.apply', typeof entry.apply === 'function', typeof entry.apply);
check('bundle.exports.testSeam', T && typeof T.buildModel === 'function', 'exports.__test present');

/* ------------------------------------------------------------------------- */
/* tree helpers */
/* ------------------------------------------------------------------------- */

function hasData(node) {
  return node && typeof node === 'object' && node.props && typeof node.props['data-dsh-workflow-map'] === 'string';
}

function findAll(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, predicate, out);
    return out;
  }
  if (node.type && predicate(node)) out.push(node);
  for (const child of node.children || []) findAll(child, predicate, out);
  return out;
}

function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node.children || []).map(textOf).join('');
}

function byData(node, value) {
  return findAll(node, (element) => hasData(element) && element.props['data-dsh-workflow-map'] === value);
}

function childByClass(node, className) {
  return (node.children || []).find(
    (child) => child && typeof child === 'object' && typeof child.props?.className === 'string' && child.props.className.split(/\s+/).includes(className)
  );
}

/* ------------------------------------------------------------------------- */
/* constants + dictionaries */
/* ------------------------------------------------------------------------- */

const C = T.constants();
check('const.styleId', C.styleId === 'dsh-workflow-map-css', C.styleId);
check('const.prefsKey', C.prefsKey === 'dsh-workflow-map:prefs', C.prefsKey);
check('const.pollVisible', C.pollVisible === 800, C.pollVisible);
check('const.pollHidden', C.pollHidden === 3000, C.pollHidden);
check('const.defaultWidth', C.defaultWidth === 720, C.defaultWidth);
check('const.zIndex', C.zIndex === 0, C.zIndex);

const dicts = T.dicts();
const zhKeys = Object.keys(dicts.zh).sort();
const enKeys = Object.keys(dicts.en).sort();
check('dict.equalKeySets', JSON.stringify(zhKeys) === JSON.stringify(enKeys), zhKeys.length + ' vs ' + enKeys.length);
check('dict.notTiny', zhKeys.length >= 30, zhKeys.length + ' keys');
check('dict.noPlaceholderLeft', zhKeys.every((key) => key.startsWith('panel.') || key.startsWith('capsule.')), 'namespaced keys');

const say = T.makeSay(undefined);
check('say.fallback', say('panel.progress', { done: 3, total: 7, percent: 43 }) === '3/7 步 · 43%', say('panel.progress', { done: 3, total: 7, percent: 43 }));
check('say.capsule', say('capsule.progress', { done: 5, total: 15, percent: 34 }) === '5/15 · 34%', say('capsule.progress', { done: 5, total: 15, percent: 34 }));
check('say.unknownKey', say('nope.missing') === 'nope.missing', say('nope.missing'));
const sayFromT = T.makeSay((key) => (key === 'panel.title' ? 'X' : key));
check('say.usesT', sayFromT('panel.title') === 'X' && sayFromT('panel.steps') === '总任务分步', 't wins, dictionary covers the rest');

/* ------------------------------------------------------------------------- */
/* preferences */
/* ------------------------------------------------------------------------- */

const defaults = T.defaultPrefs();
check('prefs.defaults', defaults.width === 720 && defaults.height === 0 && defaults.collapsed === false && defaults.selectedStep === null, JSON.stringify(defaults));
check('prefs.badJson', JSON.stringify(T.parsePrefs('{oops')) === JSON.stringify(defaults), 'invalid JSON → defaults');
check('prefs.empty', T.parsePrefs('').width === 720, 'empty string → defaults');
check('prefs.nonNumericWidth', T.parsePrefs('{"width":"wide"}').width === 720, 'string width ignored');
check('prefs.clampLow', T.parsePrefs('{"width":100}').width === 360, T.parsePrefs('{"width":100}').width);
check('prefs.clampHigh', T.parsePrefs('{"width":5000}').width === 1200, T.parsePrefs('{"width":5000}').width);
check('prefs.heightFloor', T.parsePrefs('{"height":50}').height === 220, T.parsePrefs('{"height":50}').height);
check('prefs.heightCeil', T.parsePrefs('{"height":9000}').height === 860, T.parsePrefs('{"height":9000}').height);
check('prefs.negativeSelection', T.parsePrefs('{"selectedStep":-1}').selectedStep === null, String(T.parsePrefs('{"selectedStep":-1}').selectedStep));
check('prefs.selection', T.parsePrefs('{"selectedStep":4,"collapsed":true}').selectedStep === 4, '4');
check('prefs.collapsed', T.parsePrefs('{"collapsed":true}').collapsed === true, 'true');

const patched = T.applyPrefsPatch(defaults, { collapsed: true });
check('prefs.patchKeepsRest', patched.collapsed === true && patched.width === 720, JSON.stringify(patched));
const toggled = T.applyPrefsPatch({ ...defaults, collapsed: false }, (prev) => ({ collapsed: !prev.collapsed }));
check('prefs.patchFunctional', toggled.collapsed === true, 'function patch applied to previous value');
check('prefs.patchNullSelection', T.applyPrefsPatch({ ...defaults, selectedStep: 3 }, { selectedStep: null }).selectedStep === null, 'null clears the selection');

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    size: () => map.size,
    dump: () => Object.fromEntries(map),
  };
}

const storage = memoryStorage();
const saved = T.savePrefs({ width: 640, height: 500, collapsed: true, selectedStep: 2 }, storage);
check('prefs.saveOk', saved === true && storage.size() === 1, JSON.stringify(storage.dump()));
check('prefs.savedKey', Object.keys(storage.dump())[0] === 'dsh-workflow-map:prefs', Object.keys(storage.dump())[0]);
const reloaded = T.loadPrefs(storage);
check(
  'prefs.roundTrip',
  reloaded.width === 640 && reloaded.height === 500 && reloaded.collapsed === true && reloaded.selectedStep === 2,
  JSON.stringify(reloaded)
);
check('prefs.loadNoStorage', T.loadPrefs(null).width === 720, 'missing storage → defaults');
const brokenStorage = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
};
check('prefs.loadThrows', T.loadPrefs(brokenStorage).width === 720, 'throwing storage → defaults');
check('prefs.saveThrows', T.savePrefs(defaults, brokenStorage) === false, 'throwing storage → false');

/* ------------------------------------------------------------------------- */
/* the poll */
/* ------------------------------------------------------------------------- */

check('poll.url', T.pollUrl('session-1') === '/dsh-workflow/state?sessionId=session-1', T.pollUrl('session-1'));
check('poll.urlEncodes', T.pollUrl('a b/c') === '/dsh-workflow/state?sessionId=a%20b%2Fc', T.pollUrl('a b/c'));

const calls = [];
function fakeFetch(status, body, headers = {}, ok) {
  return (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: ok === undefined ? status >= 200 && status < 300 : ok,
      status,
      headers: { get: (name) => headers[name] || null },
      json: () => Promise.resolve(body),
    });
  };
}

const payload = { ok: true, view: { steps: [] }, rev: 42 };
const first = await T.pollOnce(fakeFetch(200, payload, { ETag: '"abc"' }), '/x', '', null);
check('poll.first200', first.status === 200 && first.etag === '"abc"' && first.payload.rev === 42, JSON.stringify({ status: first.status, etag: first.etag }));
check('poll.firstHeaders', calls.at(-1).init.cache === 'no-store' && !('If-None-Match' in calls.at(-1).init.headers), JSON.stringify(calls.at(-1).init));
check('poll.firstNoSignalKey', !('signal' in calls.at(-1).init), 'no signal when none was given');

const second = await T.pollOnce(fakeFetch(304, null, { ETag: '"abc"' }), '/x', '"abc"', null);
check('poll.ifNoneMatchSent', calls.at(-1).init.headers['If-None-Match'] === '"abc"', JSON.stringify(calls.at(-1).init.headers));
check('poll.304KeepsEtag', second.status === 304 && second.payload === null && second.etag === '"abc"', JSON.stringify(second));

const notFound = await T.pollOnce(fakeFetch(404, { ok: false, error: 'unknown session' }), '/x', '', null);
check('poll.404', notFound.status === 404 && notFound.error === 'HTTP 404' && notFound.payload === null, JSON.stringify(notFound));

const badBody = await T.pollOnce(fakeFetch(200, { ok: false }), '/x', '', null);
check('poll.badPayload', badBody.payload === null && badBody.error === 'bad payload', JSON.stringify(badBody));

const zero = await T.pollOnce(fakeFetch(500, null), '/x', '', null);
check('poll.500', zero.status === 500 && zero.error === 'HTTP 500', JSON.stringify(zero));

const thrown = await T.pollOnce(() => Promise.reject(new Error('offline')), '/x', '', null);
check('poll.networkError', thrown.status === 0 && thrown.error === 'offline', JSON.stringify(thrown));
check('poll.noFetch', (await T.pollOnce(undefined, '/x', '', null)).error === 'fetch unavailable', 'missing fetch is a value, not a throw');
const abortError = new Error('aborted');
abortError.name = 'AbortError';
const abortedResult = await T.pollOnce(() => Promise.reject(abortError), '/x', '', null);
check('poll.abortIsNotFailure', abortedResult.status === -1 && abortedResult.payload === null, JSON.stringify(abortedResult));

/* ------------------------------------------------------------------------- */
/* session identity */
/* ------------------------------------------------------------------------- */

check('session.current', T.sessionIdFromSnapshot({ current: 'session-a', byId: {} }) === 'session-a', 'current wins');
check('session.none', T.sessionIdFromSnapshot(null) === null, 'null snapshot → null');
check('session.empty', T.sessionIdFromSnapshot({ byId: {} }) === null, 'no current, no retention → null');
const retained = {
  byId: {
    a: { retainedBy: { mainView: 1 }, lastActivityAt: 5 },
    b: { retainedBy: { mainView: 3 }, lastActivityAt: 1 },
    c: { retainedBy: { mainView: 3 }, lastActivityAt: 9 },
    d: {},
  },
};
check('session.retainedFallback', T.sessionIdFromSnapshot(retained) === 'c', T.sessionIdFromSnapshot(retained));
check('session.retainedNoRetention', T.sessionIdFromSnapshot({ byId: { a: {}, b: { retainedBy: { mainView: 0 } } } }) === null, 'no retained main view → null');

/* ------------------------------------------------------------------------- */
/* model */
/* ------------------------------------------------------------------------- */

check('model.null', T.buildModel(null, defaults) === null, 'null view → no DOM');
check('model.noStepsField', T.buildModel({}, defaults) === null, 'missing steps → no DOM');
check('model.emptySteps', T.buildModel({ steps: [], nodes: [] }, defaults) === null, 'no steps, no plan → no DOM');
const planningView = { steps: [], nodes: [], plan: { phase: 'planning', steps: [], task: 'T' } };
const planningModel = T.buildModel(planningView, defaults);
check('model.planning', planningModel !== null && planningModel.kind === 'planning' && planningModel.steps.length === 0, JSON.stringify(planningModel?.kind));
check('model.planningTask', planningModel.task === 'T', planningModel.task);

const liveRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence/state-live.json'), 'utf8'));
const view = liveRaw.view;
const model = T.buildModel(view, defaults);
check('model.real.kind', model.kind === 'ready', model.kind);
check('model.real.stepCount', model.steps.length === 15, model.steps.length);
check('model.real.done', model.progress.done === 5, model.progress.done);
check('model.real.total', model.progress.total === 15, model.progress.total);
check('model.real.percent', model.progress.percent === 34, model.progress.percent);
check('model.real.taskTrimmed', model.task.length <= 300 && model.task.length > 0, model.task.length + ' chars');
check('model.real.selectedRunning', model.selected === 5, model.selected);
check('model.real.selectedFlag', model.steps.filter((row) => row.selected).length === 1 && model.steps[5].selected === true, 'exactly one selected row');
check('model.real.activeFlag', model.steps[5].active === true && model.steps[4].active === false, 'active == running step');
check('model.real.statusKeys', model.steps[0].statusKey === 'panel.status.done' && model.steps[5].statusKey === 'panel.status.running' && model.steps[6].statusKey === 'panel.status.pending', 'status keys');
check('model.real.flowCount', model.flow.nodes.length === 35, model.flow.nodes.length);
check('model.real.flowTitle', model.flow.stepTitle === model.steps[5].title, model.flow.stepTitle);
check('model.real.flowFirstNode', model.flow.nodes[0].id === 'n1037', model.flow.nodes[0].id);
check('model.real.nodePercent', model.steps[5].percent === 5, model.steps[5].percent);
check('model.real.pendingPercentNull', model.steps[6].percent === null, String(model.steps[6].percent));
check('model.real.counts', model.counts && model.counts.nodes === 985, JSON.stringify(model.counts));

const picked = T.buildModel(view, { ...defaults, selectedStep: 2 });
check('model.selectOverride', picked.selected === 2, picked.selected);
// step 3 of the real view carries nodeCount 386 but only 300 nodeIds survived the
// host-side cap: the flow must show 300 rows AND say that 86 were omitted.
check(
  'model.selectOverrideFlow',
  picked.flow.stepTitle === view.steps[2].title && picked.flow.nodes.length === 300 && picked.flow.truncated === 86,
  picked.flow.nodes.length + ' rows / ' + picked.flow.truncated + ' omitted'
);
const clamped = T.buildModel(view, { ...defaults, selectedStep: 99 });
check('model.selectOutOfRange', clamped.selected === 5, clamped.selected);

const synthetic = {
  steps: [
    { index: 0, title: 'a', status: 'done', percent: 100, nodeIds: ['n1'], nodeCount: 1 },
    { index: 1, title: 'b', status: 'pending', nodeIds: ['n2', 'n3'], nodeCount: 2 },
  ],
  nodes: [
    { id: 'n1', kind: 'tool', tool: 'pwsh', title: 'run', detail: 'x', files: [{ path: 'a' }, { path: 'b' }], error: '' },
    { id: 'n2', kind: 'weird', title: 'mystery', detail: '', files: [], error: 'boom' },
  ],
  active: null,
};
const syntheticModel = T.buildModel(synthetic, defaults);
check('model.synthetic.selectedLastDone', syntheticModel.selected === 0, syntheticModel.selected);
check('model.synthetic.nodeCountPassThrough', syntheticModel.steps[1].nodeCount === 2, 'nodeCount is carried verbatim');
check('model.synthetic.missingNodeSkipped', T.buildModel(synthetic, { ...defaults, selectedStep: 1 }).flow.nodes.length === 1, 'n3 is absent from nodes[] and is skipped, not rendered as a hole');
check('model.synthetic.kindFallback', T.buildModel(synthetic, { ...defaults, selectedStep: 1 }).flow.nodes[0].kindKey === 'panel.kind.other', 'unknown kind → other');
const errorModel = T.buildModel({ ...synthetic, steps: [{ ...synthetic.steps[1], status: 'running' }], nodes: [synthetic.nodes[1]] }, defaults);
check('model.synthetic.errorFlag', errorModel.flow.nodes[0].error === true, 'error: "boom" → error flag');
check('model.synthetic.filesCount', T.buildModel(synthetic, defaults).flow.nodes[0].files === 2, 'files counted, not listed');

/* ------------------------------------------------------------------------- */
/* renderer */
/* ------------------------------------------------------------------------- */

const actions = {
  onCollapse() {},
  onExpand() {},
  onToggleSettings() {},
  onSelectStep() {},
  onReset() {},
};

const ui = { settingsOpen: false, status: 'live', error: '', rev: 42, endpoint: '/dsh-workflow/state?sessionId=session-1', nodeTotal: 985 };

check('render.nullModel', T.renderPanel(null, defaults, say, actions, ui) === null, 'no model → null');
check('render.emptyView', T.renderPanel(T.buildModel({ steps: [] }, defaults), defaults, say, actions, ui) === null, 'empty view → null');

const collapsed = T.renderPanel(model, { ...defaults, collapsed: true }, say, actions, ui);
const capsule = byData(collapsed, 'capsule');
check('render.capsule.present', capsule.length === 1, capsule.length);
check('render.capsule.text', textOf(capsule[0]).includes('5/15 · 34%'), textOf(capsule[0]));
check('render.capsule.noPanel', byData(collapsed, 'panel').length === 0, 'capsule is the whole DOM');
check('render.capsule.dot', childByClass(capsule[0], 'wf-dot') !== undefined, 'pulsing dot present');
check('render.capsule.clickable', typeof capsule[0].props.onClick === 'function', 'onClick → expand');
check('render.capsule.aria', typeof capsule[0].props['aria-label'] === 'string' && capsule[0].props['aria-label'].length > 0, capsule[0].props['aria-label']);
// the folded state is a row INSIDE the main area, not a floating pill: it carries
// an explicit aria-expanded="false" and the hint that says how to get back.
check('render.capsule.collapsedAria', capsule[0].props['aria-expanded'] === 'false', capsule[0].props['aria-expanded']);
check('render.capsule.bar', childByClass(collapsed, 'wf-capsule-bar') !== undefined, 'capsule sits in a bar');
check('render.capsule.hint', textOf(collapsed).includes('点击展开'), textOf(collapsed).slice(0, 60));
const tree = T.renderPanel(model, defaults, say, actions, ui);
const root = byData(tree, 'root');
const panel = byData(tree, 'panel')[0];
check('render.panel.present', panel !== undefined && panel.type === 'section', panel?.type);
// a main-column panel is a region with a label — not a modal dialog — and it
// carries NO inline geometry at all (the centre column decides width and height).
check('render.panel.region', panel.props.role === 'region' && typeof panel.props['aria-label'] === 'string', panel.props.role);
check('render.panel.noInlineSize', panel.props.style === undefined, JSON.stringify(panel.props.style));
check('render.panel.noGrips', childByClass(panel, 'wf-grip-left') === undefined && childByClass(panel, 'wf-grip-bottom') === undefined, 'no resize grips');
const body = childByClass(panel, 'wf-body');
check('render.body.ready', body !== undefined && body.props['data-kind'] === 'ready', body?.props['data-kind']);
// ONE page: the serial main flow (one unit per step) is the whole body; the right page is
// mounted only while a click has opened it.
const pageTree = childByClass(body, 'wf-page');
check('render.page.present', pageTree !== undefined, 'the main flow page is the body child');
check('render.units.count', byData(pageTree, 'unit').length === 15, byData(pageTree, 'unit').length + ' units');
check('render.steps.count', byData(pageTree, 'step').length === 15, '15 steps');
check('render.steps.selection', byData(tree, 'step').filter((el) => el.props['data-selected'] === 'true').length === 1, 'one selected');
check('render.steps.active', byData(tree, 'step')[5].props['data-active'] === 'true', 'running row marked active');
check('render.steps.badge', textOf(byData(tree, 'step')[5]).includes('进行中'), textOf(byData(tree, 'step')[5]));
check('render.right.closed', byData(tree, 'right').length === 0, 'the right page is closed by default');
check('render.headerTitle', textOf(tree).includes(model.task.slice(0, 20)), 'task title rendered');
check('render.headerProgress', textOf(tree).includes('5/15 步 · 34%'), 'header progress text');
// Header keeps collapse + settings; the close × is gone with the overlay (the rail icon is
// how you leave now), so the count is exactly two.
const headButtons = findAll(panel, (el) => el.type === 'button').filter((el) => typeof el.props.className === 'string' && el.props.className.split(/\s+/).includes('wf-btn'));
// The header's own × is gone; the step-detail × (StepDetail.js) is a different control and
// stays. Assert on the header's buttons instead of the whole tree's text.
check('render.headerNoClose', headButtons.every((el) => textOf(el) !== '×'), 'no × among the header buttons');
check('render.headerButtons', headButtons.length === 3, headButtons.length);
// the ⇄ sits in the header's tool row, the same .wf-btn box as the other
// two — the acceptance asks for it to be on the same row and aligned with them.
const injectButton = byData(tree, 'inject-toggle')[0];
check('inject.toggle.present', injectButton !== undefined, 'the hot-inject button exists');
check(
  'inject.toggle.named',
  injectButton && injectButton.props.className === 'wf-btn wf-btn-hot',
  injectButton && injectButton.props.className
);
check('inject.toggle.ariaPressed', injectButton && injectButton.props['aria-pressed'] === 'false', injectButton && injectButton.props['aria-pressed']);
check(
  'inject.toggle.banner',
  textOf(injectButton).includes('热注入'),
  textOf(injectButton)
);
check('inject.toggle.label', injectButton && typeof injectButton.props['aria-label'] === 'string' && injectButton.props['aria-label'].length > 0, injectButton && injectButton.props['aria-label']);
check('render.rootIsColumn', root[0].props.className === 'wf-root', 'root is .wf-root (CSS: fills the main area)');
check('render.noInlinePosition', root[0].props.style === undefined, 'geometry lives in the stylesheet, not inline');

const settingsTree = T.renderPanel(model, defaults, say, actions, { ...ui, settingsOpen: true });
const settings = byData(settingsTree, 'settings');
check('render.settings.present', settings.length === 1, settings.length);
check('render.settings.endpoint', textOf(settings[0]).includes('/dsh-workflow/state?sessionId=session-1'), textOf(settings[0]).slice(0, 80));
check('render.settings.reset', textOf(settings[0]).includes('恢复默认'), 'reset control');

// a stored width/height from an older record must NOT resize the panel any more —
// the main area owns both. This is the regression guard for the old drag grips.
const legacy = T.renderPanel(model, { ...defaults, width: 720, height: 500 }, say, actions, ui);
const legacyPanel = byData(legacy, 'panel')[0];
check('render.legacySizeIgnored', legacyPanel.props.style === undefined, JSON.stringify(legacyPanel.props.style));

const planningTree = T.renderPanel(planningModel, defaults, say, actions, ui);
const planningPanel = byData(planningTree, 'panel')[0];
check('render.planning.card', planningPanel !== undefined, 'planning can still be collapsed to the panel');
check('render.planning.body', childByClass(planningPanel, 'wf-body').props['data-kind'] === 'planning', 'one-column planning body');
check('render.planning.text', textOf(planningPanel).includes('规划中…'), 'planning line');
check('render.planning.capsule', textOf(byData(T.renderPanel(planningModel, { ...defaults, collapsed: true }, say, actions, ui), 'capsule')[0]).includes('规划中…'), 'capsule says planning');

const noFlowView = { steps: [{ index: 0, title: 'only', status: 'done', percent: 100, nodeIds: [], nodeCount: 0 }], nodes: [] };
const noFlowModel = T.buildModel(noFlowView, defaults);
const emptyStepTree = T.renderPanel(noFlowModel, defaults, say, actions, ui);
// A step with no nodes still renders its unit; the "nothing happened here" hint lives on the step's
// own page (the unit itself stays silent, which is what keeps the chain readable).
const emptyStepRight = { kind: 'step', stepIndex: 0, unit: noFlowModel.page.units[0], stepDetail: noFlowModel.detail, openType: null, scopeStep: 0 };
const emptyStepOpen = T.renderPanel(noFlowModel, { ...defaults, rightOpen: true, rightKey: 'step:0' }, say, actions, { ...ui, right: emptyStepRight });
check('render.emptyFlow', emptyStepTree !== null && textOf(emptyStepOpen).includes('这一步没有文件或工具调用记录'), textOf(emptyStepOpen).slice(0, 80));

/* ------------------------------------------------------------------------- */
/* ------------------------------------------------------------------------- */
/* step cards + progress rails */
/* ------------------------------------------------------------------------- */

// The live view is the regression fixture: 15 rows, PAE statuses 1-4 completed,
// a running step 5 and ten not-started ones.
const liveCards = byData(tree, 'step');
check('cards.countMatchesView', liveCards.length === view.steps.length, liveCards.length + ' cards vs ' + view.steps.length + ' rows');
check(
  'cards.order',
  liveCards.every((card, position) => card.props['data-step-index'] === position),
  'data-step-index follows view.steps order'
);
check(
  'cards.oneToOne',
  liveCards.every((card, position) => card.props.title === model.steps[position].title),
  'card title == the row title, in order'
);
check('cards.paeSourceOnLive', model.steps.slice(1, 5).every((row) => row.statusSource === 'pae'), model.steps.slice(1, 5).map((row) => row.statusSource).join(','));
check('cards.hostSourceOnPlanningRow', model.steps[0].statusSource === 'host' && model.steps[0].status === 'done', model.steps[0].statusSource + '/' + model.steps[0].status);
check('cards.seqPad', textOf(liveCards[0]).includes('01/15') && textOf(liveCards[14]).includes('15/15'), 'zero-padded 02/07-style ordinals');
check('cards.ringGlyphs', textOf(liveCards[0]).includes('✓') && textOf(liveCards[5]).includes('●') && textOf(liveCards[6]).includes('○'), 'done ✓ / running ● / pending ○');
check('cards.badgePending', textOf(liveCards[6]).includes('待执行'), textOf(liveCards[6]).slice(0, 30));

const cardsChecked = byData(tree, 'step');
check(
  'cards.statusAttr',
  cardsChecked[5].props['data-status'] === 'running' && cardsChecked[6].props['data-status'] === 'pending',
  cardsChecked[5].props['data-status'] + '/' + cardsChecked[6].props['data-status']
);

// the fixed "now" every synthetic view and timing assertion shares. The renderer must
// never read a clock, so the number it prints is a pure function of this stamp.
const TIMING_AS_OF = 1792000000000;

function planOf(patch) {
  const source = patch || {};
  return {
    phase: 'executing',
    task: 'T',
    taskTitle: 'T',
    steps: source.steps || [],
    statuses: source.statuses || {},
    anchorSeqs: source.anchorSeqs || {},
    skipped: source.skipped || [],
    stepIndex: source.stepIndex === undefined ? null : source.stepIndex,
    stepReports: [],
    asOfMtime: 0,
    sourcePath: '',
  };
}

function viewOf(stepRows, plan, todos) {
  const steps = stepRows.map((step, position) => ({
    index: position,
    nodeIds: [],
    nodeCount: 0,
    percent: null,
    percentSource: 'none',
    status: 'pending',
    ...step,
  }));
 // the host ALWAYS ships `asOf` (viewSchema requires it); the synthetic views below
 // carry it too, so the rail's ago/eta arithmetic runs on the same stamp the wire uses.
  return { steps: steps, nodes: [], todos: todos || [], plan: plan || null, asOf: TIMING_AS_OF, counts: { steps: steps.length, nodes: 0, running: 0, completed: 0 } };
}

// PAE statuses outrank the todo table even when the row's own status disagrees.
const conflictView = viewOf([{ planIndex: 1, title: 'alpha', status: 'pending', percent: 5, percentSource: 'model' }], planOf({ steps: [{ index: 1, title: 'alpha', file: 'a.md', requiresConfirmation: true }], statuses: { '1': 'completed' }, stepIndex: 1 }), [{ content: '1. alpha', status: 'in_progress' }]);
const conflictModel = T.buildModel(conflictView, defaults);
check('cards.paeOverTodo', conflictModel.steps[0].status === 'done' && conflictModel.steps[0].statusSource === 'pae', JSON.stringify({ status: conflictModel.steps[0].status, source: conflictModel.steps[0].statusSource }));
check('cards.requiresConfirmation', conflictModel.steps[0].requiresConfirmation === true, String(conflictModel.steps[0].requiresConfirmation));
const conflictTree = T.renderPanel(conflictModel, defaults, say, actions, ui);
check('cards.confirmFlagRendered', textOf(byData(conflictTree, 'step')[0]).includes('需确认'), textOf(byData(conflictTree, 'step')[0]));

// The todo table answers when the plan has no status for the step.
const todoView = viewOf([{ planIndex: 1, title: 'beta' }], planOf({}), [{ content: '1. beta', status: 'in_progress' }]);
const todoModel = T.buildModel(todoView, defaults);
check('cards.todoFallback', todoModel.steps[0].status === 'running' && todoModel.steps[0].statusSource === 'todo', todoModel.steps[0].status + '/' + todoModel.steps[0].statusSource);
const renamedView = viewOf([{ planIndex: 9, title: 'delta' }], planOf({}), [{ content: 'Delta', status: 'completed' }]);
check('cards.todoMatchesByTitle', T.buildModel(renamedView, defaults).steps[0].status === 'done', 'ordinal mismatch still matches on the normalised title');

// An anchored step has been opened: the plan cursor says behind/here/ahead.
const anchorView = viewOf(
  [
    { planIndex: 1, title: 'one' },
    { planIndex: 2, title: 'two' },
    { planIndex: 3, title: 'three' },
    { planIndex: 4, title: 'four' },
  ],
  planOf({ anchorSeqs: { '1': 10, '2': 20, '3': 30 }, stepIndex: 2 })
);
const anchorModel = T.buildModel(anchorView, defaults);
check(
  'cards.anchorInference',
  anchorModel.steps[0].status === 'done' && anchorModel.steps[1].status === 'running' && anchorModel.steps[2].status === 'pending' && anchorModel.steps[3].status === 'pending',
  anchorModel.steps.map((row) => row.status).join(',')
);
check('cards.anchorSource', anchorModel.steps[0].statusSource === 'anchor' && anchorModel.steps[1].statusSource === 'anchor', anchorModel.steps[0].statusSource + '/' + anchorModel.steps[1].statusSource);
check(
  'cards.pendingWithoutStatus',
  anchorModel.steps[3].status === 'pending' && anchorModel.steps[3].statusSource === 'host',
  'no PAE status, no todo, no anchor → the host status (pending here)'
);

// PAE's skipped list wins over a pending status but never over a completed one.
const skippedView = viewOf([{ planIndex: 2, title: 'skip me' }], planOf({ statuses: { '2': 'pending' }, skipped: [2] }));
check('cards.skipped', T.buildModel(skippedView, defaults).steps[0].status === 'skipped', T.buildModel(skippedView, defaults).steps[0].status);
const skippedTree = T.renderPanel(T.buildModel(skippedView, defaults), defaults, say, actions, ui);
check('cards.skippedGlyph', textOf(byData(skippedTree, 'step')[0]).includes('–') && textOf(byData(skippedTree, 'step')[0]).includes('已跳过'), textOf(byData(skippedTree, 'step')[0]).slice(0, 24));
check('cards.skippedRailEmpty', textOf(byData(skippedTree, 'progress')[0]) === '', 'a skipped step carries no percentage');
const skippedDoneView = viewOf([{ planIndex: 2, title: 'done' }], planOf({ statuses: { '2': 'completed' }, skipped: [2] }));
check('cards.skippedLosesToCompleted', T.buildModel(skippedDoneView, defaults).steps[0].status === 'done', T.buildModel(skippedDoneView, defaults).steps[0].status);

// Failed steps get the ✕ ring and the red rail state.
const failedView = viewOf([{ planIndex: 1, title: 'boom', status: 'failed', percent: 40, percentSource: 'model' }], planOf({ statuses: { '1': 'failed' } }));
const failedTree = T.renderPanel(T.buildModel(failedView, defaults), defaults, say, actions, ui);
check('cards.failedGlyph', textOf(byData(failedTree, 'step')[0]).includes('✕'), textOf(byData(failedTree, 'step')[0]).slice(0, 20));
check('cards.failedRail', byData(failedTree, 'progress')[0].props['data-status'] === 'failed', byData(failedTree, 'progress')[0].props['data-status']);

// ---- rails -----------------------------------------------------------------
const liveDocks = byData(tree, 'progress');
check('prog.onePerCard', liveDocks.length === view.steps.length, liveDocks.length + ' rails');
check('prog.dockIndex', liveDocks.every((dock, position) => dock.props['data-step-index'] === position), 'each rail carries its card index');
check('prog.doneLabel', textOf(liveDocks[0]).includes('100%') && textOf(liveDocks[0]).includes('✓') === false, textOf(liveDocks[0]));
check('prog.selfLabel', textOf(liveDocks[5]).includes('5% 自报'), textOf(liveDocks[5]));
check('prog.pendingNoLabel', textOf(liveDocks[6]) === '', 'a not-started step prints no number at all');
const liveLabels = findAll(tree, (element) => element.props && element.props.className === 'wf-prog-label');
check('prog.labelCount', liveLabels.length === 6, liveLabels.length + ' labels (5 done + 1 running with a report)');
check('prog.selfKind', liveLabels.some((label) => label.props['data-kind'] === 'self'), 'the model report is labelled 自报');

const estimateView = viewOf([{ planIndex: 1, title: 'est', status: 'running', percent: 62, percentSource: 'baseline' }], planOf({ statuses: { '1': 'in_progress' } }));
const estimateTree = T.renderPanel(T.buildModel(estimateView, defaults), defaults, say, actions, ui);
check('prog.estimateLabel', textOf(byData(estimateTree, 'progress')[0]).includes('~62% 估算'), textOf(byData(estimateTree, 'progress')[0]));
check('prog.estimateKind', findAll(estimateTree, (element) => element.props && element.props['data-kind'] === 'estimate').length === 1, 'kind=estimate');
check(
  'prog.estimateFill',
  byData(estimateTree, 'progress')[0].children[0].children[0].children[0].props.style.width === '62%',
  JSON.stringify(byData(estimateTree, 'progress')[0].children[0].children[0].children[0].props.style)
);

// ---- the second line (ago · eta) -----------------------------------
// Every stamp below is FIXED: the renderer must never read a clock, so the arithmetic is
// reproducible and a wrong number fails here instead of in the user's session.
const T_AS_OF = TIMING_AS_OF;
const T_START = T_AS_OF - 600000; // the step started 10 minutes ago
const T_ESTIMATE = T_AS_OF - 180000; // the last estimate was 3 minutes ago

check('prog.timing.durationText',
  T.progressDurationText(180000) === '3 分钟' && T.progressDurationText(54000) === '54 秒' &&
  T.progressDurationText(3000000) === '50 分钟' && T.progressDurationText(7200000) === '2 小时' &&
  T.progressDurationText(0) === '' && T.progressDurationText(null) === '' && T.progressDurationText(-5) === '',
  JSON.stringify([T.progressDurationText(180000), T.progressDurationText(54000), T.progressDurationText(3000000), T.progressDurationText(7200000)]));

// (2026-10-26) · the projected remainder is GONE by user request. `progressTiming` answers
// ONE question now — how stale the quoted number is. The rows below used to assert WHEN a projection
// was withheld (percent 0, a closed step, a failed step, a missing start stamp, a pending row); the
// honest equivalent after the removal is that NONE of them can conjure an `eta` key back, and that
// the shape is exactly `{ago}`.
const noProjectionRows = [
  { status: 'running', percent: 0, percentSource: 'baseline', startedAt: T_START, lastEstimateAt: T_ESTIMATE },
  { status: 'done', percent: 100, percentSource: 'closed', startedAt: T_START, lastEstimateAt: T_ESTIMATE },
  { status: 'failed', percent: 40, percentSource: 'model', startedAt: T_START, lastEstimateAt: T_ESTIMATE },
  { status: 'running', percent: 62, percentSource: 'baseline', startedAt: 0, lastEstimateAt: 0 },
  { status: 'pending', percent: 42, percentSource: 'model', startedAt: 0, lastEstimateAt: 0 },
  { status: 'running', percent: 62, percentSource: 'baseline', startedAt: T_START, lastEstimateAt: T_ESTIMATE },
];
check('prog.timing.etaGone', noProjectionRows.every((row) => {
  const timing = T.progressTiming(row, T_AS_OF);
  return !('eta' in timing) && timing.eta === undefined;
}), JSON.stringify(noProjectionRows.map((row) => T.progressTiming(row, T_AS_OF))));
check('prog.timing.agoOnlyShape', noProjectionRows.every((row) => Object.keys(T.progressTiming(row, T_AS_OF)).join(',') === 'ago'), JSON.stringify(Object.keys(T.progressTiming(noProjectionRows[5], T_AS_OF))));
check('prog.timing.agoFormula', T.progressTiming({ status: 'running', percent: 62, percentSource: 'baseline', startedAt: T_START, lastEstimateAt: T_ESTIMATE }, T_AS_OF).ago === '3 分钟',
  'asOf - lastEstimateAt');

// No stamp at all => no ago segment. NOT "0 seconds ago".
check('prog.timing.noStampNoAgo', T.progressTiming({ status: 'running', percent: 62, percentSource: 'baseline', startedAt: T_START, lastEstimateAt: 0 }, T_AS_OF).ago === null,
  JSON.stringify(T.progressTiming({ status: 'running', percent: 62, percentSource: 'baseline', startedAt: T_START, lastEstimateAt: 0 }, T_AS_OF)));
// A stamp in the FUTURE (a re-ordered log) must not print a negative duration.
check('prog.timing.futureStampNoAgo', T.progressTiming({ status: 'running', percent: 50, percentSource: 'model', startedAt: T_START, lastEstimateAt: T_AS_OF + 60000 }, T_AS_OF).ago === null,
  'a stamp after asOf yields nothing');

// The age is a fact about `lastEstimateAt` alone: it no longer needs a start stamp, a percent that is
// “still a projection”, or a step that is still open — this step's own elapsed time is not read
// anywhere any more. (A missing stamp still yields nothing: never "0 seconds ago".)
check('prog.timing.agoNeedsNoStartStamp', T.progressTiming({ status: 'running', percent: 62, percentSource: 'baseline', startedAt: 0, lastEstimateAt: T_ESTIMATE }, T_AS_OF).ago === '3 分钟',
  'the age only needs the stamp it measures from');
// A closed step's pinned 100 % is a record of the past: the AGE of that final number is still a fact.
check('prog.timing.closedKeepsAgo', T.progressTiming({ status: 'done', percent: 100, percentSource: 'closed', startedAt: T_START, lastEstimateAt: T_ESTIMATE }, T_AS_OF).ago === '3 分钟',
  'how old the final number was is still a fact');

// The rendered rail carries ONE half now: the age — no separator, no second segment.
const timingView = viewOf([{ planIndex: 1, title: 'timed', status: 'running', percent: 62, percentSource: 'baseline', startedAt: T_START, lastEstimateAt: T_ESTIMATE }], planOf({ statuses: { '1': 'in_progress' } }));
const timingTree = T.renderPanel(T.buildModel(timingView, defaults, T_AS_OF), defaults, say, actions, ui);
const timingDock = byData(timingTree, 'progress')[0];
check('prog.timing.dockData', timingDock.props['data-timing'] === 'one', timingDock.props['data-timing']);
check('prog.timing.agoRendered', textOf(timingDock).includes('3 分钟前估计'), textOf(timingDock));
check('prog.timing.noEtaText', textOf(timingDock).indexOf('还剩') === -1, textOf(timingDock));
check('prog.timing.noEtaSegment', findAll(timingDock, (el) => el.props && (el.props.className === 'wf-prog-eta' || el.props.className === 'wf-prog-sep')).length === 0, 'no ETA element and no separator in the tree');
const agoEl = findAll(timingDock, (el) => el.props && el.props.className === 'wf-prog-ago')[0];
check('prog.timing.titles', agoEl.props.title === '3 分钟前估计', JSON.stringify(agoEl.props.title));
check('prog.timing.subLineIsSecondChild', timingDock.children[1].props.className === 'wf-prog-sub', 'the rail row stays the first child');

// A running step with a number but NO stamp: the ONE fact needs a stamp, so there is no second line
// at all — not an empty one, and never a placeholder.
const noStampView = viewOf([{ planIndex: 1, title: 'no stamp', status: 'running', percent: 50, percentSource: 'model', startedAt: T_START, lastEstimateAt: 0 }], planOf({ statuses: { '1': 'in_progress' } }));
const noStampTree = T.renderPanel(T.buildModel(noStampView, defaults, T_AS_OF), defaults, say, actions, ui);
const noStampDock = byData(noStampTree, 'progress')[0];
check('prog.timing.noStampNoSubLine', noStampDock.props['data-timing'] === 'none' && textOf(noStampDock).indexOf('前估计') === -1 && textOf(noStampDock).indexOf('还剩') === -1,
  JSON.stringify({ timing: noStampDock.props['data-timing'], text: textOf(noStampDock) }));

// A done step: no eta (nothing to project) but the age of the final number is still shown.
const doneTimingView = viewOf([{ planIndex: 1, title: 'done timed', status: 'done', percent: 100, percentSource: 'closed', startedAt: T_START, lastEstimateAt: T_ESTIMATE }], planOf({ statuses: { '1': 'completed' } }));
const doneTimingTree = T.renderPanel(T.buildModel(doneTimingView, defaults, T_AS_OF), defaults, say, actions, ui);
check('prog.timing.doneKeepsAgo', byData(doneTimingTree, 'progress')[0].props['data-timing'] === 'one' && textOf(byData(doneTimingTree, 'progress')[0]).includes('3 分钟前估计'),
  textOf(byData(doneTimingTree, 'progress')[0]));

// A not-started step renders NO second line at all — not even an empty one.
const pendingTimingView = viewOf([{ planIndex: 1, title: 'not started', status: 'pending', percent: 42, percentSource: 'model', startedAt: 0, lastEstimateAt: T_ESTIMATE }], planOf({ statuses: { '1': 'pending' } }));
const pendingTimingTree = T.renderPanel(T.buildModel(pendingTimingView, defaults, T_AS_OF), defaults, say, actions, ui);
check('prog.timing.pendingNoSubLine', byData(pendingTimingTree, 'progress')[0].props['data-timing'] === 'none' && findAll(byData(pendingTimingTree, 'progress')[0], (el) => el.props && el.props.className === 'wf-prog-sub').length === 0,
  'a not-started step has no second line');

// Narrow container (`detail = title`): the second line is not even emitted.
const narrowPrefs = T.applyPrefsPatch(defaults, { detail: 'title' });
const narrowTree = T.renderPanel(T.buildModel(timingView, narrowPrefs, T_AS_OF), narrowPrefs, say, actions, ui);
check('prog.timing.narrowDropsSubLine', findAll(narrowTree, (el) => el.props && el.props.className === 'wf-prog-sub').length === 0,
  'detail=title renders only the first line');
check('prog.timing.narrowKeepsPercent', textOf(byData(narrowTree, 'progress')[0]).includes('~62% 估算'), textOf(byData(narrowTree, 'progress')[0]));

// The live view (a real recorded session). the age is the ONLY secondary fact left, so a
// running row shows a second line exactly when it carries a stamp to measure — the recorded session
// may well have none, and then the honest answer is NO line at all (never a placeholder). The check
// therefore follows the ROW's own data instead of hard-coding one recorded session's shape.
const liveRow = model.steps.find((row) => row.status === 'running');
const liveDock = liveRow ? byData(tree, 'progress')[liveRow.index] : null;
const liveExpectsLine = !!(liveRow && liveRow.percent > 0 && liveRow.lastEstimateAt > 0 && liveRow.status !== 'pending');
check('prog.timing.liveRunningMatchesItsStamp', liveRow ? liveDock.props['data-timing'] === (liveExpectsLine ? 'one' : 'none') : false,
  liveRow ? JSON.stringify({ timing: liveDock.props['data-timing'], expects: liveExpectsLine, lastEstimateAt: liveRow.lastEstimateAt, percent: liveRow.percent, text: textOf(liveDock) }) : 'no running step in the recorded view');

const stalePendingView = viewOf([{ planIndex: 1, title: 'not yet', status: 'pending', percent: 42, percentSource: 'model' }], planOf({ statuses: { '1': 'pending' } }));
const stalePendingTree = T.renderPanel(T.buildModel(stalePendingView, defaults), defaults, say, actions, ui);
check('prog.pendingHidesStaleNumber', textOf(byData(stalePendingTree, 'progress')[0]) === '', 'a 42% payload on a pending step is not shown');
check(
  'prog.pendingEmptyFill',
  byData(stalePendingTree, 'progress')[0].children[0].children[0].children[0].props.style.width === '0%',
  byData(stalePendingTree, 'progress')[0].children[0].children[0].children[0].props.style.width
);

const unknownRunView = viewOf([{ planIndex: 1, title: 'unknown', status: 'running', percent: null }], planOf({ statuses: { '1': 'in_progress' } }));
const unknownRunTree = T.renderPanel(T.buildModel(unknownRunView, defaults), defaults, say, actions, ui);
const unknownDock = byData(unknownRunTree, 'progress')[0];
check('prog.indeterminate', unknownDock.props['data-indeterminate'] === 'true' && textOf(unknownDock) === '', JSON.stringify(unknownDock.props));
check(
  'prog.indeterminateFill',
  unknownDock.children[0].children[0].children[0].props['data-indeterminate'] === 'true' && unknownDock.children[0].children[0].children[0].props.style.width === '30%',
  JSON.stringify(unknownDock.children[0].children[0].children[0].props)
);
check('prog.aria', byData(tree, 'progress')[5].children[0].children[0].props.role === 'progressbar' && byData(tree, 'progress')[5].children[0].children[0].props['aria-valuenow'] === 5, JSON.stringify({ role: byData(tree, 'progress')[5].children[0].children[0].props.role, now: byData(tree, 'progress')[5].children[0].children[0].props['aria-valuenow'] }));
check('prog.ariaAbsentWhenUnknown', unknownDock.children[0].children[0].props['aria-valuenow'] === undefined, 'no aria-valuenow without a number');

// ---- a payload that still carries the old projected-remaining field -------------------
// The host stopped computing the projection, so the rail must not read it either: a payload from an
// older host (or an old checkpoint) is accepted and IGNORED — the field never reaches the wire model
// and the second line stays ago-only. That is what makes this change immediate on F5 instead of
// waiting for a DSH restart.
const legacyView = viewOf([{ planIndex: 1, title: 'legacy eta', status: 'running', percent: 62, percentSource: 'baseline', startedAt: T_START, lastEstimateAt: T_ESTIMATE, etaMs: 240000 }], planOf({ statuses: { '1': 'in_progress' } }));
const legacyModel = T.buildModel(legacyView, defaults, T_AS_OF);
const legacyDock = byData(T.renderPanel(legacyModel, defaults, say, actions, ui), 'progress')[0];
check('prog.legacyEta.notInTheModel', !('etaMs' in legacyModel.steps[0]) && JSON.stringify(legacyModel).indexOf('etaMs') === -1, Object.keys(legacyModel.steps[0]).join(','));
check('prog.legacyEta.ignoredByTheRail', legacyDock.props['data-timing'] === 'one' && textOf(legacyDock).includes('3 分钟前估计') && textOf(legacyDock).indexOf('还剩') === -1, textOf(legacyDock));
check('prog.legacyEta.noSegmentAnywhere', findAll(legacyDock, (el) => el.props && (el.props.className === 'wf-prog-eta' || el.props['data-kind'] === 'eta')).length === 0, 'no ETA element in the rendered tree');
// A not-started step renders no number and no timing line even when the payload carries both — the
// same stale-number rule the rail already follows.
const staleEtaView = viewOf([{ planIndex: 1, title: 'not started', status: 'pending', percent: 42, percentSource: 'model', startedAt: 0, lastEstimateAt: T_ESTIMATE, etaMs: 240000 }], planOf({ statuses: { '1': 'pending' } }));
const staleEtaDock = byData(T.renderPanel(T.buildModel(staleEtaView, defaults, T_AS_OF), defaults, say, actions, ui), 'progress')[0];
check('prog.legacyEta.pendingIgnoresShippedEta', staleEtaDock.props['data-timing'] === 'none' && textOf(staleEtaDock) === '', JSON.stringify({ timing: staleEtaDock.props['data-timing'], text: textOf(staleEtaDock) }));
// The cold-start sub-variant keeps the ESTIMATE flavour: falling through to the closed flavour would
// print “67%” and claim a measured number it never measured.
const coldEtaView = viewOf([{ planIndex: 2, title: 'cold start', status: 'running', percent: 67, percentSource: 'baseline:steps', startedAt: T_START, lastEstimateAt: T_ESTIMATE, etaMs: 90000 }], planOf({ statuses: { '2': 'in_progress' } }));
const coldEtaTree = T.renderPanel(T.buildModel(coldEtaView, defaults, T_AS_OF), defaults, say, actions, ui);
check('prog.timing.coldStartKeepsTheEstimateFlavour', textOf(byData(coldEtaTree, 'progress')[0]).includes('~67% 估算') && findAll(coldEtaTree, (el) => el.props && el.props['data-kind'] === 'estimate').length === 1, textOf(byData(coldEtaTree, 'progress')[0]));

// ---- the serial connector ---------------------------------------------------
// one straight run between two units, and NONE after the last one.
const links = findAll(tree, (element) => element.props && element.props.className === 'wf-unit-link');
check('link.count', links.length === view.steps.length - 1, links.length + ' connectors');
check('link.doneSolid', links[0].props['data-done'] === 'true', 'the connector under a done step is solid');
check('link.pendingDashed', links[6].props['data-done'] === 'false', 'the connector under a pending step is dashed');
check('link.afterLastUnit', findAll(byData(tree, 'unit')[14], (element) => element.props && element.props.className === 'wf-unit-link').length === 0, 'no connector after the last unit');

// ---- interaction -----------------------------------------------------------
let clicked = null;
const clickActions = { ...actions, onOpenStep(index) { clicked = index; } };
const clickTree = T.renderPanel(model, defaults, say, clickActions, ui);
byData(clickTree, 'step')[2].props.onClick();
check('cards.clickIndex', clicked === 2, String(clicked));
// A selection change rebuilds the model (the component calls buildModel on
// every render), so the card flags and the right column move together.
const selectedModel = T.buildModel(view, { ...defaults, selectedStep: 2 });
const selectedTree = T.renderPanel(selectedModel, { ...defaults, selectedStep: 2 }, say, actions, ui);
const selectedCards = byData(selectedTree, 'step');
check('cards.selectionMoves', selectedCards[2].props['data-selected'] === 'true' && selectedCards.filter((card) => card.props['data-selected'] === 'true').length === 1, 'exactly one selected card');
// "the page follows the selection": with the right page OPEN on `step:2`, its title is that
// step's title — the `flow` column no longer exists to follow it.
const followRight = {
  kind: 'step',
  stepIndex: 2,
  unit: selectedModel.page.units[2],
  stepDetail: selectedModel.detail,
  openType: null,
  scopeStep: 2,
};
const followTree = T.renderPanel(
  selectedModel,
  { ...defaults, selectedStep: 2, rightOpen: true, rightKey: 'step:2' },
  say,
  actions,
  { ...ui, right: followRight, pageStep: 2 }
);
check(
  'cards.rightPageFollows',
  selectedModel.selected === 2 && textOf(byData(followTree, 'right')[0]).includes('第 3 步'),
  textOf(byData(followTree, 'right')[0]).slice(0, 40)
);

// ---- many steps ------------------------------------------------------------
// the 「many」 flag lived on the step column's scroll box; the single page always scrolls,
// so the assertion moves to the number of units actually drawn (2 vs 15) — the same fact, measured
// where it now lives.
check('cards.manyUnits', byData(tree, 'unit').length === view.steps.length, byData(tree, 'unit').length + ' units');
const shortModel = T.buildModel(viewOf([{ title: 'a', status: 'done' }, { title: 'b' }], null), defaults);
check(
  'cards.shortUnits',
  byData(T.renderPanel(shortModel, defaults, say, actions, ui), 'unit').length === 2,
  '2 units for a 2-row view'
);

/* ------------------------------------------------------------------------- */
/* flow column : fold · window · node cards · per-step UI state */
/* ------------------------------------------------------------------------- */

const FC = C.flowCap;
check('const.flowCap', FC === 60 && C.groupMin === 3, JSON.stringify({ cap: FC, groupMin: C.groupMin }));

// ---- the fold (browser fallback when the host sent no groups) --------------
const runNodes = [
  { id: 'a1', kind: 'tool', tool: 'read', at: 1000 },
  { id: 'a2', kind: 'tool', tool: 'read', at: 2000 },
  { id: 'a3', kind: 'tool', tool: 'read', at: 3000 },
  { id: 'a4', kind: 'tool', tool: 'read', at: 4000 },
  { id: 'm1', kind: 'message', tool: '', at: 5000 },
  { id: 'e1', kind: 'tool', tool: 'edit', at: 6000 },
  { id: 'e2', kind: 'tool', tool: 'edit', at: 7000 },
  { id: 'a5', kind: 'tool', tool: 'read', at: 8000 },
  { id: 'a6', kind: 'tool', tool: 'read', at: 9000 },
  { id: 'a7', kind: 'tool', tool: 'read', at: 10000 },
];
const runGroups = T.flowGroups(runNodes, []);
check(
  'flow.fold.runs',
  runGroups.length === 2 && runGroups[0].from === 0 && runGroups[0].count === 4 && runGroups[1].from === 7 && runGroups[1].count === 3,
  JSON.stringify(runGroups.map((g) => [g.from, g.count]))
);
check('flow.fold.messageBreaksRun', runGroups[0].to === 3, 'a message between two runs keeps them apart');
check('flow.fold.threshold', runGroups.every((g) => g.count >= 3), 'two consecutive calls are not folded');
check('flow.fold.times', runGroups[0].firstAt === 1000 && runGroups[0].lastAt === 4000, JSON.stringify({ first: runGroups[0].firstAt, last: runGroups[0].lastAt }));

// ---- the host fold record wins when it resolves ---------------------------
const hostGroups = [{ key: 'k1', tool: 'read', firstId: 'a2', lastId: 'a4', count: 3, firstAt: 2000, lastAt: 4000 }];
const hosted = T.flowGroups(runNodes, hostGroups);
check('flow.groups.host', hosted.length === 1 && hosted[0].from === 1 && hosted[0].to === 3 && hosted[0].count === 3, JSON.stringify(hosted));
check('flow.groups.hostKey', hosted[0].key === 'k1' && hosted[0].tool === 'read', hosted[0].key);
const unresolvable = T.flowGroups(runNodes, [{ firstId: 'zz', lastId: 'a4', count: 3, tool: 'read' }]);
check('flow.groups.unresolvableFallsBack', unresolvable.length === 2 && unresolvable[0].from === 0, 'a group whose ids are gone hides nothing (fallback fold runs)');
const overlapping = T.flowGroups(runNodes, [
  { firstId: 'a1', lastId: 'a3', count: 3, tool: 'read' },
  { firstId: 'a2', lastId: 'a4', count: 3, tool: 'read' },
]);
check('flow.groups.overlap', overlapping.length === 1 && overlapping[0].from === 0 && overlapping[0].to === 2, 'overlapping ranges: the first wins, nodes stay visible');

// ---- items + the 60-node window -------------------------------------------
const manyNodes = [];
for (let i = 0; i < 100; i += 1) manyNodes.push({ id: 'x' + i, kind: 'tool', tool: 'read', at: i + 1 });
const manyItems = T.flowItems(manyNodes, []);
const win = T.flowWindow(manyItems, FC, false);
check('flow.window.cap', win.items.length === FC && win.hiddenNodes === 40 && win.capped === true, win.items.length + ' rows / hidden ' + win.hiddenNodes);
check('flow.window.newest', win.items[0].node.id === 'x40' && win.items[FC - 1].node.id === 'x99', win.items[0].node.id + '..' + win.items[FC - 1].node.id);
const all = T.flowWindow(manyItems, FC, true);
check('flow.window.showAll', all.hiddenNodes === 0 && all.items.length === 100 && all.capped === false, all.items.length + ' rows');

const atomicNodes = [];
for (let i = 0; i < 56; i += 1) atomicNodes.push({ id: 'p' + i, kind: 'tool', tool: 'pwsh', at: i + 1 });
for (let i = 0; i < 8; i += 1) atomicNodes.push({ id: 'r' + i, kind: 'tool', tool: 'read', at: 100 + i });
const atomicItems = T.flowItems(atomicNodes, T.flowGroups(atomicNodes, []));
const atomicWin = T.flowWindow(atomicItems, FC, false);
check(
  'flow.window.groupAtomic',
  atomicItems.length === 2 && atomicWin.items.length === 1 && atomicWin.items[0].count === 8 && atomicWin.hiddenNodes === 56,
  JSON.stringify({ items: atomicItems.length, visible: atomicWin.items.length, hidden: atomicWin.hiddenNodes })
);
check('flow.window.counts', T.flowNodeCount(atomicItems) === 64, T.flowNodeCount(atomicItems));

// ---- per-step UI state: the reset on a step switch -----------------------
const baseUi = T.flowUiFor(null, 3);
check('flow.ui.defaults', baseUi.stepIndex === 3 && baseUi.expanded.length === 0 && baseUi.showAll === false && baseUi.selectedNode === null, JSON.stringify(baseUi));
const openedUi = T.flowExpandAll(T.flowToggleGroup(baseUi, 3, 'g1'), 3);
check('flow.ui.toggle', openedUi.expanded.length === 1 && openedUi.expanded[0] === 'g1' && openedUi.showAll === true, JSON.stringify(openedUi));
check('flow.ui.toggleBack', T.flowToggleGroup(openedUi, 3, 'g1').expanded.length === 0, 'the second click closes the group');
const switchedUi = T.flowUiFor(openedUi, 4);
check(
  'flow.ui.stepReset',
  switchedUi.stepIndex === 4 && switchedUi.expanded.length === 0 && switchedUi.showAll === false && switchedUi.selectedNode === null,
  JSON.stringify(switchedUi)
);
const pickedUi = T.flowSelectNode(baseUi, 3, 'n1');
check('flow.ui.select', pickedUi.selectedNode === 'n1' && T.flowSelectNode(pickedUi, 3, 'n1').selectedNode === null, 'click highlights, a second click clears');
check('flow.ui.selectStepReset', T.flowUiFor(pickedUi, 5).selectedNode === null, 'the highlight does not follow the step');

// ---- node card helpers ----------------------------------------------------
const readNode = {
  id: 'n9',
  kind: 'tool',
  kindKey: 'panel.kind.tool',
  tool: 'read',
  title: 'read app.js',
  detail: 'path=…',
  path: 'C:\\proj\\src\\app.js',
  files: 1,
  error: false,
  errorText: '',
  result: true,
  durationMs: 1234,
  at: 1792241633664,
};
check(
  'node.category',
  T.nodeCategory(readNode) === 'file' &&
    T.nodeCategory({ kind: 'tool', tool: 'pwsh' }) === 'command' &&
    T.nodeCategory({ kind: 'message' }) === 'message' &&
    T.nodeCategory({ kind: 'subagent' }) === 'subagent' &&
    T.nodeCategory({ kind: 'tool', tool: 'plugin_manager' }) === 'tool' &&
    T.nodeCategory({}) === 'other',
  'file / command / message / subagent / tool / other'
);
const readParts = T.nodeTitleParts(readNode, 'file', say);
check('node.title.file', readParts.verb === '读' && readParts.target === 'app.js', readParts.verb + ' · ' + readParts.target);
const cmdParts = T.nodeTitleParts(
  { kind: 'tool', tool: 'pwsh', title: 'pwsh node tools/build.mjs', detail: 'node tools/build.mjs', path: '', files: 0, result: true },
  'command',
  say
);
check('node.title.command', cmdParts.verb === '命令' && cmdParts.target === 'node tools/build.mjs', cmdParts.verb + ' · ' + cmdParts.target);
const genericParts = T.nodeTitleParts(
  { kind: 'tool', tool: 'plugin_manager', title: 'plugin_manager', detail: 'action=list', path: '', files: 0, result: false },
  'tool',
  say
);
check('node.title.unknownTool', genericParts.verb === 'plugin_manager' && genericParts.target === 'action=list', genericParts.verb + ' · ' + genericParts.target);
const msgParts = T.nodeTitleParts({ kind: 'message', tool: '', title: '我已把宿主投影落地', detail: '', path: '', files: 0, result: true }, 'message', say);
check('node.title.message', msgParts.verb === '' && msgParts.target === '我已把宿主投影落地', JSON.stringify(msgParts));
check(
  'node.status',
  T.nodeStatus({ id: 'a', error: false, result: false }, 'a') === 'running' &&
    T.nodeStatus({ id: 'a', error: true, result: true }, null) === 'error' &&
    T.nodeStatus({ id: 'a', error: false, result: true }, null) === 'done' &&
    T.nodeStatus({ id: 'a', error: false, result: false }, null) === 'pending' &&
    T.nodeStatus({ id: 'a', error: false, result: true }, 'a') === 'done',
  'running needs the active pointer AND no result'
);
check(
  'node.duration',
  T.formatDuration(8) === '8ms' && T.formatDuration(1234) === '1.2s' && T.formatDuration(2000) === '2s' && T.formatDuration(83000) === '1m23s' && T.formatDuration(null) === '' && T.formatDuration(0) === '',
  [T.formatDuration(8), T.formatDuration(1234), T.formatDuration(2000), T.formatDuration(83000)].join(' ')
);
check('node.clock', T.formatClock(0) === '' && /^\d{2}:\d{2}:\d{2}$/.test(T.formatClock(1792241633664)), T.formatClock(1792241633664));
check('node.meta', T.nodeMetaBits(readNode, say).join('|') === '工具|read|1.2s|1 文件', T.nodeMetaBits(readNode, say).join('|'));

// ---- the model carries what the cards read --------------------------------
check('model.flow.groupsArray', Array.isArray(model.flow.groups) && model.flow.groups.length === 0, 'recorded view carries no host fold records → the browser folds');
check('model.flow.activeNode', model.flow.activeNodeId === view.active.nodeId, String(model.flow.activeNodeId));
check('model.flow.activeNodeOnlyInItsStep', T.buildModel(view, { ...defaults, selectedStep: 2 }).flow.activeNodeId === null, 'a node only pulses in its own step');
check(
  'model.node.fields',
  model.flow.nodes.every((n) => typeof n.path === 'string' && typeof n.result === 'boolean' && typeof n.errorText === 'string') &&
    model.flow.nodes.some((n) => n.result === true && typeof n.durationMs === 'number' && n.durationMs > 0) &&
    T.buildModel(view, { ...defaults, selectedStep: 1 }).flow.nodes.some((n) => n.files > 0 && n.path !== ''),
  JSON.stringify({ nodes: model.flow.nodes.length, withResult: model.flow.nodes.filter((n) => n.result).length })
);
check('model.flow.matchesStepNodeIds', model.flow.nodes.length === view.steps[5].nodeIds.length, model.flow.nodes.length + ' vs ' + view.steps[5].nodeIds.length);

// The GLOBAL 1200-node cap prunes a step's id list WITHOUT touching truncatedNodes;
// "n omitted" must still be the honest gap (nodeCount - drawn), not 0.
const prunedView = {
  steps: [{ index: 0, title: 'pruned', status: 'running', nodeIds: ['n1', 'n2'], nodeCount: 5, truncatedNodes: 0 }],
  nodes: [
    { id: 'n1', kind: 'tool', tool: 'read', title: 'read a', detail: '', files: [{ path: 'a' }], error: '', at: 1 },
    { id: 'n2', kind: 'tool', tool: 'read', title: 'read b', detail: '', files: [], error: '', at: 2 },
  ],
};
const prunedModel = T.buildModel(prunedView, defaults);
check(
  'model.flow.truncatedHonest',
  prunedModel.flow.truncated === 3 && prunedModel.flow.stepNodeTotal === 5,
  JSON.stringify({ truncated: prunedModel.flow.truncated, total: prunedModel.flow.stepNodeTotal })
);

// ---- the rendered column --------------------------------------------------
let toggledKey = null;
let showAllClicks = 0;
let pickedNodeId = null;
const flowActions = {
  ...actions,
  onToggleGroup(key) {
    toggledKey = key;
  },
  onShowAll() {
    showAllClicks += 1;
  },
  onSelectNode(id) {
    pickedNodeId = id;
  },
};
const capModel = T.buildModel(view, { ...defaults, selectedStep: 2 });
const capTree = T.renderFlowColumn(createElement, capModel, say, flowActions, T.flowUiFor(null, 2));
check('flow.render.collapsed', byData(capTree, 'flow')[0].props['data-capped'] === 'true' && byData(capTree, 'flow')[0].props['data-show-all'] === 'false', JSON.stringify(byData(capTree, 'flow')[0].props));
check('flow.render.window', byData(capTree, 'node').length === FC, byData(capTree, 'node').length + ' node cards');
const moreStrip = byData(capTree, 'flow-more');
check('flow.render.moreStrip', moreStrip.length === 1 && textOf(moreStrip[0]).includes('更早 240 个被折叠'), textOf(moreStrip[0]));
check(
  'flow.render.headerFixed',
  capTree.children[0].props['data-dsh-workflow-map'] === 'flow-head' &&
    capTree.children[capTree.children.length - 1].props['data-dsh-workflow-map'] === 'flow-scroll' &&
    findAll(byData(capTree, 'flow-scroll')[0], (el) => el.props['data-dsh-workflow-map'] === 'flow-more').length === 0,
  'header and strip are siblings of the scroller, not inside it'
);
check('flow.render.headerText', textOf(capTree.children[0]).includes('第 3 步 · ' + capModel.flow.stepTitle), textOf(capTree.children[0]));
check('flow.render.headerCount', textOf(capTree.children[0]).includes('386 个节点') && !textOf(capTree.children[0]).includes('已省略'), textOf(capTree.children[0]));
check('flow.render.stripCap', textOf(moreStrip[0]).includes('已省略 86 个节点'), textOf(moreStrip[0]));
check('flow.render.spine', childByClass(byData(capTree, 'flow-scroll')[0], 'wf-flow-list') !== undefined, 'the list carries the spine class');
check('flow.render.statusDot', findAll(capTree, (el) => el.props.className === 'wf-flow-status').length === FC, 'one status dot per card');
check('flow.render.icon', findAll(capTree, (el) => el.props.className === 'wf-node-icon').length === FC, 'one icon per card');

const capAllTree = T.renderFlowColumn(createElement, capModel, say, flowActions, T.flowExpandAll(T.flowUiFor(null, 2), 2));
check(
  'flow.render.showAll',
  byData(capAllTree, 'node').length === 300 &&
    findAll(byData(capAllTree, 'flow-more')[0], (el) => el.props.className === 'wf-link').length === 0 &&
    textOf(byData(capAllTree, 'flow-more')[0]).includes('已省略 86 个节点'),
  byData(capAllTree, 'node').length + ' cards, no 展开全部 button, the host-cap note remains'
);
check('flow.render.earliest', byData(capAllTree, 'node')[0].props['data-node-id'] === capModel.flow.nodes[0].id, byData(capAllTree, 'node')[0].props['data-node-id']);

const groupModel = T.buildModel(view, { ...defaults, selectedStep: 1 });
const groupRanges = T.flowGroups(groupModel.flow.nodes, groupModel.flow.groups);
check('flow.real.group', groupRanges.length === 1 && groupRanges[0].tool === 'read' && groupRanges[0].count >= 3, JSON.stringify(groupRanges));
// The fold may sit outside the default 60-node window, so these renders lift the
// cap ("expand all") and keep only the fold collapsed - that is the state a reader
// reaches by scrolling to the top of a long step.
const collapsedTree = T.renderFlowColumn(createElement, groupModel, say, flowActions, T.flowExpandAll(T.flowUiFor(null, 1), 1));
const groupRows = byData(collapsedTree, 'group');
check('flow.render.groupRow', groupRows.length === 1 && groupRows[0].props['data-expanded'] === 'false' && textOf(groupRows[0]).includes('个连续 read'), textOf(groupRows[0]));
check('flow.render.groupRange', /\d{2}:\d{2}:\d{2}–\d{2}:\d{2}:\d{2}/.test(textOf(groupRows[0])), textOf(groupRows[0]));
const openUi = T.flowExpandAll(T.flowToggleGroup(T.flowUiFor(null, 1), 1, groupRanges[0].key), 1);
const openTree = T.renderFlowColumn(createElement, groupModel, say, flowActions, openUi);
check(
  'flow.render.groupOpen',
  byData(openTree, 'group')[0].props['data-expanded'] === 'true' &&
    byData(openTree, 'node').length === byData(collapsedTree, 'node').length + groupRanges[0].count,
  byData(openTree, 'node').length + ' vs ' + byData(collapsedTree, 'node').length + ' + ' + groupRanges[0].count
);

findAll(groupRows[0], (el) => el.props.className === 'wf-group-head')[0].props.onClick();
check('flow.render.groupClick', toggledKey === groupRanges[0].key, String(toggledKey));
findAll(moreStrip[0], (el) => el.props.className === 'wf-link')[0].props.onClick();
check('flow.render.showAllClick', showAllClicks === 1, String(showAllClicks));
const clickedCard = byData(capTree, 'node')[3];
clickedCard.props.onClick();
check('flow.render.nodeClick', pickedNodeId === clickedCard.props['data-node-id'], String(pickedNodeId));

const pickedVisible = byData(capTree, 'node')[5].props['data-node-id'];
const selectedNodeTree = T.renderFlowColumn(createElement, capModel, say, flowActions, T.flowSelectNode(T.flowUiFor(null, 2), 2, pickedVisible));
const marked = findAll(selectedNodeTree, (el) => el.props && el.props['data-selected'] === 'true');
check('flow.render.nodeSelected', marked.length === 1 && marked[0].props['data-node-id'] === pickedVisible && marked[0].props['aria-pressed'] === 'true', JSON.stringify({ marked: marked.length }));

const emptyFlowTree = T.renderFlowColumn(createElement, T.buildModel(noFlowView, defaults), say, actions, null);
check('flow.render.empty', textOf(emptyFlowTree).includes('这一步还没有动作') && byData(emptyFlowTree, 'node').length === 0, textOf(emptyFlowTree));

// the panel mounts the SINGLE PAGE, not either old column: one unit per step, satellites
// and straight connectors, with the right page closed until a click.
const mountedUnits = byData(tree, 'unit');
check(
  'page.mounted',
  mountedUnits.length === view.steps.length && byData(tree, 'flow').length === 0 && byData(tree, 'steps').length === 0,
  mountedUnits.length + ' units, no two-column remnants'
);
check('flow.render.planningEmpty', textOf(collapsedTree) !== '', 'the collapsed capsule still renders');

/* ------------------------------------------------------------------------- */
/* branch lanes : parallel subagents / workflows / jobs */
/* ------------------------------------------------------------------------- */

const branchView = {
  steps: [
    { index: 0, title: 'alpha', status: 'running', percent: 40, percentSource: 'model', nodeIds: ['n1'], nodeCount: 1, groups: [] },
    { index: 1, title: 'beta', status: 'pending', percent: null, nodeIds: [], nodeCount: 0, groups: [] },
  ],
  nodes: [
    { id: 'n1', kind: 'tool', tool: 'read', title: 'read a.js', detail: 'path=a.js', files: [], resultHead: 'ok', error: '', at: 1000, durationMs: 10 },
  ],
  branches: [
    {
      id: 'b1',
      kind: 'subagent',
      label: 'review the fold module',
      status: 'running',
      startedAt: 2000,
      endedAt: null,
      stepIndex: 0,
      count: 1,
      truncated: 0,
      nodes: [{ id: 'b1.n1', kind: 'start', title: '子代理启动', detail: 'review the fold module', at: 2000, status: 'running' }],
    },
    {
      id: 'b2',
      kind: 'workflow',
      label: 'audit',
      status: 'done',
      startedAt: 3000,
      endedAt: 4000,
      stepIndex: 0,
      count: 3,
      truncated: 1,
      nodes: [
        { id: 'b2.n1', kind: 'start', title: '工作流启动', detail: '', at: 3000, status: 'running' },
        { id: 'b2.n2', kind: 'phase', title: 'phase-A', detail: '', at: 3100, status: 'running' },
        { id: 'b2.n3', kind: 'agent', title: '磁盘检查', detail: 'completed', at: 3200, status: 'done' },
      ],
    },
    { id: 'b3', kind: 'job', label: 'Get-ChildItem', status: 'failed', startedAt: 4000, endedAt: 5000, stepIndex: 1, count: 2, truncated: 0, nodes: [] },
  ],
  counts: { steps: 2, nodes: 1, running: 1, completed: 0 },
};
const branchModel = T.buildModel(branchView, defaults);
check('branch.model.onlySelectedStep', branchModel.flow.branches.length === 2 && branchModel.flow.branches.every((b) => b.id !== 'b3'), JSON.stringify(branchModel.flow.branches.map((b) => b.id)));
check('branch.model.nodesUntouched', branchModel.flow.nodes.length === 1 && branchModel.flow.total === 1, JSON.stringify({ nodes: branchModel.flow.nodes.length, total: branchModel.flow.total }));
check('branch.model.labels', branchModel.flow.branches[0].kind === 'subagent' && branchModel.flow.branches[0].label === 'review the fold module' && branchModel.flow.branches[1].kind === 'workflow', JSON.stringify(branchModel.flow.branches.map((b) => b.kind)));
check('branch.model.truncatedHonest', branchModel.flow.branches[1].truncated === 1 && branchModel.flow.branches[1].count === 3, JSON.stringify({ trunc: branchModel.flow.branches[1].truncated, count: branchModel.flow.branches[1].count }));
check('branch.model.noneByDefault', Array.isArray(model.flow.branches) && model.flow.branches.length === 0 && planningModel.flow.branches.length === 0, 'a recorded view carries no branches → no branch model');
check('branch.hue.distinct', T.branchHue(0) !== T.branchHue(1) && T.branchHue(0) !== T.branchHue(2) && T.branchHue(null) === T.branchHue(0), JSON.stringify([T.branchHue(0), T.branchHue(1), T.branchHue(2)]));
check('branch.status.map', T.branchStatus({ status: 'running' }) === 'running' && T.branchStatus({ status: 'done' }) === 'done' && T.branchStatus({ status: 'failed' }) === 'error' && T.branchStatus({}) === 'running', 'four-state vocabulary');
check('branch.badge.map', T.branchBadgeKey('subagent') === 'panel.branch.subagent' && T.branchBadgeKey('workflow') === 'panel.branch.workflow' && T.branchBadgeKey('job') === 'panel.branch.job' && T.branchBadgeKey('other') === 'panel.branch.subagent', 'badge keys; an unknown kind reads as a subagent, never as a raw key');

let branchToggle = null;
let branchPick = null;
const branchActions = {
  ...flowActions,
  onToggleBranch(id) {
    branchToggle = id;
  },
  onSelectNode(id) {
    branchPick = id;
  },
};
const branchTree = T.renderFlowColumn(createElement, branchModel, say, branchActions, T.flowUiFor(null, 0));
const branchArea = byData(branchTree, 'branches');
check('branch.render.area', branchArea.length === 1 && branchArea[0].props['data-branch-count'] === 2, JSON.stringify({ areas: branchArea.length }));
const branchCards = byData(branchTree, 'branch');
check('branch.render.cards', branchCards.length === 2 && branchCards[0].props['data-kind'] === 'subagent' && branchCards[0].props['data-status'] === 'running' && branchCards[1].props['data-status'] === 'done', JSON.stringify(branchCards.map((c) => c.props['data-status'])));
check('branch.render.hues', branchCards[0].props['data-hue'] !== branchCards[1].props['data-hue'] && branchCards[0].props.style['--wf-branch-line'] !== branchCards[1].props.style['--wf-branch-line'], JSON.stringify(branchCards.map((c) => c.props.style['--wf-branch-line'])));
check('branch.render.badge', textOf(branchCards[0]).includes('子代理') && textOf(branchCards[1]).includes('工作流'), textOf(branchCards[0]));
check('branch.render.label', textOf(branchCards[1]).includes('audit'), textOf(branchCards[1]));
const branchRows = byData(branchTree, 'branch-node');
check('branch.render.rows', branchRows.length === 3, branchRows.length + ' branch rows');
check('branch.render.phaseRow', findAll(branchTree, (el) => el.props && el.props.className === 'wf-branch-phase').length === 1, 'a phase is a heading, not a button');
check('branch.render.truncNote', textOf(branchCards[1]).includes('支线内已省略 1 个活动'), textOf(branchCards[1]));
branchRows[0].props.onClick();
check('branch.render.nodeClick', branchPick === 'b1.n1', String(branchPick));
byData(branchTree, 'branch-head')[0].props.onClick();
check('branch.render.headClick', branchToggle === 'b1', String(branchToggle));
check('branch.ui.defaultOpen', T.branchIsCollapsed(T.flowUiFor(null, 0), 'b1') === false, 'lanes are open by default');
const foldedUi = T.flowToggleBranch(T.flowUiFor(null, 0), 0, 'b1');
check('branch.ui.toggle', foldedUi.closedBranches.length === 1 && T.branchIsCollapsed(foldedUi, 'b1') === true && T.flowToggleBranch(foldedUi, 0, 'b1').closedBranches.length === 0, JSON.stringify(foldedUi.closedBranches));
check('branch.ui.stepReset', T.flowUiFor(foldedUi, 1).closedBranches.length === 0, 'a branch fold does not follow the step');
const foldedCard = byData(T.renderFlowColumn(createElement, branchModel, say, branchActions, foldedUi), 'branch').find((el) => el.props['data-branch-id'] === 'b1');
check('branch.render.collapsed', foldedCard.props['data-expanded'] === 'false' && byData(foldedCard, 'branch-node').length === 0, 'folding a lane hides its rows');
const pickedBranchTree = T.renderFlowColumn(createElement, branchModel, say, branchActions, T.flowSelectNode(T.flowUiFor(null, 0), 0, 'b1.n1'));
const markedBranch = findAll(pickedBranchTree, (el) => el.props && el.props['data-selected'] === 'true');
check('branch.render.selected', markedBranch.length === 1 && markedBranch[0].props['data-node-id'] === 'b1.n1', JSON.stringify({ marked: markedBranch.length }));
check('branch.render.none', byData(capTree, 'branches').length === 0, 'a step without parallel work renders no branch shell');

const manyBranches = {
  ...branchView,
  branches: Array.from({ length: 6 }, (_, i) => ({
    id: 'x' + i,
    kind: 'job',
    label: 'job-' + i,
    status: 'running',
    startedAt: 1000 + i,
    endedAt: null,
    stepIndex: 0,
    count: 0,
    truncated: 0,
    nodes: [],
  })),
};
const manyModel = T.buildModel(manyBranches, defaults);
check('branch.model.cap', manyModel.flow.branches.length === 4 && manyModel.flow.hiddenBranches === 2, JSON.stringify({ drawn: manyModel.flow.branches.length, hidden: manyModel.flow.hiddenBranches }));
check('branch.model.newest', manyModel.flow.branches[0].id === 'x2' && manyModel.flow.branches[3].id === 'x5', JSON.stringify(manyModel.flow.branches.map((b) => b.id)));
const manyTree = T.renderFlowColumn(createElement, manyModel, say, branchActions, T.flowUiFor(null, 0));
check('branch.render.more', textOf(byData(manyTree, 'branches')[0]).includes('另有 2 条支线'), textOf(byData(manyTree, 'branches')[0]));
const droppedModel = T.buildModel({ ...branchView, droppedBranches: 3 }, defaults);
check('branch.model.dropped', droppedModel.flow.branchDropped === 3, String(droppedModel.flow.branchDropped));
const droppedTree = T.renderFlowColumn(createElement, droppedModel, say, branchActions, T.flowUiFor(null, 0));
check('branch.render.dropped', textOf(byData(droppedTree, 'branches')[0]).includes('较早 3 条支线已省略'), textOf(byData(droppedTree, 'branches')[0]));

// A branch row is not "current": the main-flow cards keep their own state.
const activeBranchModel = T.buildModel({ ...branchView, active: { stepIndex: 0, nodeId: 'b1.n1' } }, defaults);
const activeBranchTree = T.renderFlowColumn(createElement, activeBranchModel, say, branchActions, T.flowUiFor(null, 0));
check('branch.active.notStolen', byData(activeBranchTree, 'node')[0].props['data-status'] === 'done', byData(activeBranchTree, 'node')[0].props['data-status']);
check('branch.const', C.branchShown === 4 && C.branchLink === 6, JSON.stringify({ shown: C.branchShown, link: C.branchLink }));

// ---- the pure helpers ------------------------------------------------------
check('status.canonical', T.canonicalStatus('COMPLETED') === 'done' && T.canonicalStatus('in_progress') === 'running' && T.canonicalStatus('skipped') === 'skipped', 'PAE vocabulary');
check('status.prototypeSafe', T.canonicalStatus('constructor') === null && T.canonicalStatus('') === null, 'no prototype leak');
check('status.titleNormalise', T.normalizeStepTitle('5. 装入 desktop  profile') === '装入 desktop profile', T.normalizeStepTitle('5. 装入 desktop  profile'));
check('prog.labelPure', T.progressLabel(62, 'baseline', 'running', say).text === '~62% 估算' && T.progressLabel(62, 'model', 'running', say).text === '62% 自报', 'estimate vs self-report');
check('prog.labelPendingNull', T.progressLabel(42, 'model', 'pending', say) === null && T.progressLabel(42, 'baseline', 'skipped', say) === null, 'never a number before it starts');
check('prog.fillWidth', T.progressFillWidth({ status: 'running', percent: null }) === 30 && T.progressFillWidth({ status: 'pending', percent: 42 }) === 0 && T.progressFillWidth({ status: 'done', percent: 100 }) === 100, 'indeterminate 30 %, pending 0, done 100');
check('const.stepGeometry', C.stepGap === 8 && C.stepRail === 6 && C.stepLink === 14 && C.stepMany === 8, JSON.stringify({ gap: C.stepGap, rail: C.stepRail, link: C.stepLink, many: C.stepMany }));


/* ---- the flow becomes a chain ------------------------------- */

// (a) distances: ONE source for the air in both columns, and no hard-coded stack left.
check(
  'chain.const.gap',
  C.chainGap >= 28 && C.chainLink <= C.chainGap && C.chainPad >= 12 && C.chainBranch > 0,
  JSON.stringify({ gap: C.chainGap, link: C.chainLink, pad: C.chainPad, branch: C.chainBranch })
);
check(
  'chain.const.icon',
  C.chainIcon >= 20 && C.chainIcon <= 24 && C.chainRing > 0,
  JSON.stringify({ icon: C.chainIcon, ring: C.chainRing })
);
check('chain.const.slots', C.chainSlots >= 2 * FC, 'slots (' + C.chainSlots + ') cover the widest window (' + (2 * FC) + ' links)');

// (b) the column wiring: the curve layer is a child of the list, and the list says so.
// The flow column over the model already exercised above: n2 is in flight, so it renders the
// branch strip and the chain layer on the REAL tree rather than a hand-built stub.
const chainTree = T.renderFlowColumn(createElement, capModel, say, flowActions, T.flowUiFor(null, 2));
check('chain.wire.listAnchor', byData(chainTree, 'flow-scroll')[0] !== undefined && childByClass(byData(chainTree, 'flow-scroll')[0], 'wf-flow-list') !== undefined, 'the list still carries the scroller');
const chainList = childByClass(byData(chainTree, 'flow-scroll')[0], 'wf-flow-list');
check('chain.wire.layerFirst', chainList.children[0] && chainList.children[0].props['data-dsh-workflow-map'] === 'chain', 'the layer is the list\'s FIRST child, so it paints under the cards');
check('chain.wire.attr', chainList.props['data-chain'] === 'curve', chainList.props['data-chain']);
check('chain.wire.staticFallback', chainList.props['data-chain'] === 'curve', 'the CSS spine drops to .45 opacity while the measured curve is live');
check(
  'chain.wire.iconClick',
  (function () {
    let picked = null;
    const probe = T.renderNodeCard(
      createElement,
      { id: 'n2', kind: 'tool', tool: 'edit', title: 'edit', resultHead: '', fileList: [{ path: 'D:/a.js', action: '读' }] },
      say,
      { onChainBranch: (kind) => (picked = kind) },
      { activeNodeId: 'n2', detail: 'summary' }
    );
    const icon = byData(probe, 'chain-icon')[0];
    icon.props.onClick();
    return picked === 'read';
  })(),
  'the circle calls onChainBranch, not onSelectNode'
);

/* ---- the inject column ------------------------------- */
/* ---- the inject column ------------------------------- */

// (a) the state machine: four states, and a corrupted one degrades to idle rather than wedging.
check('inject.state.passes', ['idle', 'sending', 'sent', 'failed'].every((s) => T.injectState(s) === s), 'the four states');
check('inject.state.repairs', T.injectState('exploded') === 'idle' && T.injectState(null) === 'idle' && T.injectState(7) === 'idle', 'anything else is idle');
check('inject.ack.clearsBoth', T.injectAckDone('sent') === 'idle' && T.injectAckDone('failed') === 'idle', 'sent and failed clear');
check('inject.ack.keepsRest', T.injectAckDone('sending') === 'sending' && T.injectAckDone('idle') === 'idle', 'sending/idle are untouched');

// (b) the ONE send gate: no double post, no empty text, no unbounded text, no missing session.
check('inject.canSend.ready', T.injectCanSend('idle', 'session-1', 'hi') === true, 'idle + session + text');
check('inject.canSend.noDouble', T.injectCanSend('sending', 'session-1', 'hi') === false, 'never while sending');
check('inject.canSend.noAck', T.injectCanSend('sent', 'session-1', 'hi') === false && T.injectCanSend('failed', 'session-1', 'hi') === false, 'never during an acknowledgement');
check('inject.canSend.noSession', T.injectCanSend('idle', '', 'hi') === false && T.injectCanSend('idle', null, 'hi') === false, 'no session → no send');
check('inject.canSend.empty', T.injectCanSend('idle', 'session-1', '') === false && T.injectCanSend('idle', 'session-1', '   ') === false, 'empty text is refused');
check('inject.canSend.overLimit', T.injectCanSend('idle', 'session-1', 'x'.repeat(2001)) === false, 'over 2000 characters');
check('inject.canSend.atLimit', T.injectCanSend('idle', 'session-1', 'x'.repeat(2000)) === true, 'exactly 2000 is allowed');

// (c) the text that would actually be sent: trimmed and bounded, never silently truncated mid-word.
check('inject.text.trims', T.injectText('  hi  ') === 'hi' && T.injectText('') === '' && T.injectText(null) === '', 'trimmed');
check('inject.text.bounds', T.injectText('x'.repeat(2500)).length === 2000, 'bounded at 2000');

// (d) THE HONESTY RULE: only {ok:true} is a success, and every failure carries the HOST's reason.
const sent = T.injectOutcome({ ok: true }, say);
check('inject.outcome.ok', sent.kind === 'sent' && sent.text === '已注入', JSON.stringify(sent));
const failed409 = T.injectOutcome({ ok: false, error: '会话未在运行，热注入不可用' }, say);
check('inject.outcome.verbatim', failed409.kind === 'failed' && failed409.text === '会话未在运行，热注入不可用', JSON.stringify(failed409));
check('inject.outcome.noInvention', failed409.text.indexOf('注入失败') === -1, 'no failure text invented here');
const failedBare = T.injectOutcome({ ok: false }, say);
check('inject.outcome.fallback', failedBare.kind === 'failed' && failedBare.text === '注入失败（宿主未给出原因）', JSON.stringify(failedBare));
check('inject.outcome.null', T.injectOutcome(null, say).kind === 'failed', 'a missing answer is a failure, never a success');

// (e) the request: one POST, the right path/body, and never a throw.
let steerRequest = null;
const injectFetch = (url, init) => {
  steerRequest = { url, init };
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
};
const steerResult = await T.postSteer(injectFetch, '/dsh-workflow/steer', 'session-1', 'hi');
check('inject.post.ok', steerResult.status === 200 && steerResult.error === '', JSON.stringify(steerResult));
check('inject.post.method', steerRequest && steerRequest.init.method === 'POST', steerRequest && steerRequest.init.method);
check('inject.post.body', steerRequest && steerRequest.init.body === JSON.stringify({ sessionId: 'session-1', text: 'hi' }), steerRequest && steerRequest.init.body);
check('inject.post.noStore', steerRequest && steerRequest.init.cache === 'no-store', steerRequest && steerRequest.init.cache);

let steerFailed = null;
const failFetch = () => Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ ok: false, error: '会话未在运行，热注入不可用' }) });
steerFailed = await T.postSteer(failFetch, '/dsh-workflow/steer', 'session-1', 'hi');
check('inject.post.409CarriesReason', steerFailed.status === 409 && steerFailed.error === '会话未在运行，热注入不可用', JSON.stringify(steerFailed));
const brokenFetch = () => { throw new Error('offline'); };
const broken = await T.postSteer(brokenFetch, '/dsh-workflow/steer', 'session-1', 'hi');
check('inject.post.neverThrows', broken.status === 0 && broken.error === 'offline', JSON.stringify(broken));
check('inject.post.noFetch', (await T.postSteer(null, '/x', 's', 't')).status === 0, 'a missing fetch is a value');

// (f) the renderer: hot injection is the THIRD kind of right page - not a split column.
const injectRight = {
  kind: "inject",
  stepIndex: null,
  unit: null,
  stepDetail: null,
  openType: null,
  scopeStep: null,
  bucket: null,
  nodes: [],
};
const splitTree = T.renderPanel(model, defaults, say, actions, {
  ...ui,
  right: injectRight,
  injectState: 'idle',
  injectText: '',
  injectReason: '',
  sessionId: 'session-1',
});
const splitBody = childByClass(byData(splitTree, 'panel')[0], 'wf-body');
check('inject.page.attribute', splitBody.props['data-right'] === 'true', splitBody.props['data-right']);
const injectCol = byData(splitTree, 'inject')[0];
check('inject.column.present', injectCol !== undefined, 'the composer is mounted in the right page');
check('inject.column.state', injectCol && injectCol.props['data-state'] === 'idle', injectCol && injectCol.props['data-state']);
check('inject.column.textarea', byData(splitTree, 'inject-text').length === 1, 'one textarea');
check('inject.column.emptyNote', findAll(injectCol, (el) => el.props && el.props.className === 'wf-inject-note').length === 0, 'idle shows no acknowledgement');
check('inject.send.disabledWhenEmpty', findAll(injectCol, (el) => el.props && el.props['data-inject'] === 'send')[0].props.disabled === true, 'empty text → disabled');
check(
  'inject.page.satellitesIntact',
  byData(splitTree, 'sat').length === byData(tree, 'sat').length,
  'opening the page does not change the chain\'s satellites'
);

const closedTree = T.renderPanel(model, defaults, say, actions, { ...ui, sessionId: 'session-1' });
check('inject.closed.noColumn', byData(closedTree, 'inject').length === 0, 'closed → no composer at all');
check('inject.closed.noRight', byData(closedTree, 'right').length === 0, 'closed → no right page');
check(
  'inject.closed.noRightAttr',
  childByClass(byData(closedTree, 'panel')[0], 'wf-body').props['data-right'] === 'false',
  'closed → data-right=false'
);

// A ready send, a failed send and an in-flight one: three different DOMs, one renderer.
const readyTree = T.renderPanel(model, defaults, say, actions, {
  ...ui,
  right: injectRight,
  injectState: 'idle',
  injectText: 'hi',
  injectReason: '',
  sessionId: 'session-1',
});
const readyCol = byData(readyTree, 'inject')[0];
const readySend = findAll(readyCol, (el) => el.props && el.props['data-inject'] === 'send')[0];
check('inject.send.ready', readySend.props.disabled === undefined && readySend.props['data-ready'] === 'true', JSON.stringify(readySend.props));
check('inject.counter.counts', textOf(readyCol).includes('2/2000'), 'the counter shows what was typed');
check('inject.counter.counts', textOf(readyCol).includes('2/2000'), 'the counter shows what was typed');

const sendingCol = T.renderHotInject(createElement, say, actions, { sessionId: 'session-1', state: 'sending', text: 'hi', reason: '' });
check('inject.sending.disables', findAll(sendingCol, (el) => el.props && el.props['data-inject'] === 'send')[0].props.disabled === true, 'sending → no second send');
check('inject.sending.locksArea', findAll(sendingCol, (el) => el.props && el.props['data-dsh-workflow-map'] === 'inject-text')[0].props.disabled === true, 'the textarea is locked while sending');
check('inject.sending.wording', textOf(sendingCol).includes('发送中'), 'the button says so');

const failedCol = T.renderHotInject(createElement, say, actions, { sessionId: 'session-1', state: 'failed', text: 'hi', reason: '会话未在运行，热注入不可用' });
const failedNote = findAll(failedCol, (el) => el.props && el.props.className === 'wf-inject-note')[0];
check('inject.failed.showsReason', failedNote && textOf(failedNote) === '会话未在运行，热注入不可用', failedNote && textOf(failedNote));
check('inject.failed.kind', failedNote && failedNote.props['data-kind'] === 'failed', failedNote && failedNote.props['data-kind']);
check('inject.failed.ariaLive', failedNote && failedNote.props['aria-live'] === 'polite', 'a screen reader hears the reason');
check('inject.failed.keepsText', findAll(failedCol, (el) => el.props && el.props['data-dsh-workflow-map'] === 'inject-text')[0].props.value === 'hi', 'a failed send keeps what was typed');

const sentCol = T.renderHotInject(createElement, say, actions, { sessionId: 'session-1', state: 'sent', text: 'hi', reason: '' });
const sentNote = findAll(sentCol, (el) => el.props && el.props.className === 'wf-inject-note')[0];
check('inject.sent.wording', sentNote && textOf(sentNote) === '已注入', sentNote && textOf(sentNote));
check('inject.sent.kind', sentNote && sentNote.props['data-kind'] === 'sent', sentNote && sentNote.props['data-kind']);

// A session-less panel must disable the button rather than post something the host rejects.
const noSessionCol = T.renderHotInject(createElement, say, actions, { sessionId: '', state: 'idle', text: 'hi', reason: '' });
check('inject.noSession.disabled', findAll(noSessionCol, (el) => el.props && el.props['data-inject'] === 'send')[0].props.disabled === true, 'no session → disabled');

/* ---- the history row's "Revoke" ---------------------------- */

// (h0) The wire → model shaping the whole button hinges on: `canceled` is the ONLY thing that
// turns a row into "revoked" (and therefore removes the button), and the row's own stamps travel
// with it. Without this the renderer could be perfect and still never see a revoked row.
const shapedRows = T.injectRows([
  { id: 'w1', at: 1, pickedUpAt: null, target: 'next-step', text: '甲', pickedUp: false },
  { id: 'w2', at: 2, pickedUpAt: 7, target: 'next-step', text: '乙', pickedUp: true },
  { id: 'w3', at: 3, pickedUpAt: null, target: 'next-step', text: '丙', pickedUp: false, canceled: true, canceledAt: 9 },
  { id: '', at: 4, target: 'next-step', text: '没有 id 的行', pickedUp: false },
]);
check('inject.rows.threeStates', shapedRows.map((row) => row.status).join(',') === 'pending,picked,canceled', JSON.stringify(shapedRows.map((row) => row.status)));
check('inject.rows.canceledStamps', shapedRows[2].canceledAt === 9 && shapedRows[2].pickedUpAt === null, JSON.stringify(shapedRows[2]));
check('inject.rows.dropsIdless', shapedRows.length === 3 && shapedRows.every((row) => row.id !== ''), JSON.stringify(shapedRows.map((row) => row.id)));
check(
  'inject.rows.canceledIsNeverInferred',
  T.injectRows([{ id: 'w4', at: 5, target: 'next-step', text: '戊', pickedUp: false }])[0].status === 'pending',
  'a row without the flag stays pending'
);

// (h1) The button exists for exactly one state. Three rows, same renderer: only the pending one
// may be taken back — a row the turn already took cannot be un-read, and a row already revoked has
// nothing left to take back (so the others carry NO button at all, not a disabled one).
const revokeHistory = [
  { id: 'in-pending', at: 10, pickedUpAt: null, target: 'next-step', text: '待拾取的一句', status: 'pending', canceledAt: null },
  { id: 'in-picked', at: 20, pickedUpAt: 30, target: 'next-step', text: '已接下的一句', status: 'picked', canceledAt: null },
  { id: 'in-canceled', at: 40, pickedUpAt: null, target: 'next-step', text: '已撤销的一句', status: 'canceled', canceledAt: 50 },
];
const rowTree = T.renderHotInject(createElement, say, actions, {
  sessionId: 'session-1',
  state: 'idle',
  text: '',
  reason: '',
  history: revokeHistory,
  revokeId: '',
  revokeState: 'idle',
  revokeReason: '',
});
const revokeButtons = findAll(rowTree, (el) => el.props && el.props['data-inject'] === 'revoke');
check('inject.revoke.onlyPending', revokeButtons.length === 1 && revokeButtons[0].props['data-inject-id'] === 'in-pending', JSON.stringify(revokeButtons.map((el) => el.props['data-inject-id'])));
check('inject.revoke.wording', textOf(revokeButtons[0]) === '撤回', textOf(revokeButtons[0]));
check('inject.revoke.aria', revokeButtons[0].props['aria-label'] === '撤回', revokeButtons[0].props['aria-label']);
check(
  'inject.revoke.titleIsTheFact',
  typeof revokeButtons[0].props.title === 'string' && revokeButtons[0].props.title.length > 0 && revokeButtons[0].props.title.indexOf('宿主未开放') === -1,
  revokeButtons[0].props.title
);
check('inject.revoke.enabled', revokeButtons[0].props.disabled === undefined, 'an idle pending row is revocable');
check('inject.revoke.click', typeof revokeButtons[0].props.onClick === 'function', 'the click carries the row id back to the caller');
check('inject.revoke.noErrorYet', findAll(rowTree, (el) => el.props && el.props['data-inject'] === 'revoke-error').length === 0, 'idle shows no failure line');

// (h2) One revocation at a time: the row being revoked is greyed and says so, and the OTHER
// pending row stays clickable (a stuck button would make the next undo impossible).
const inFlightTree = T.renderHotInject(createElement, say, actions, {
  sessionId: 'session-1',
  state: 'idle',
  text: '',
  reason: '',
  history: [
    revokeHistory[0],
    { id: 'in-pending-2', at: 60, pickedUpAt: null, target: 'next-step', text: '另一句', status: 'pending', canceledAt: null },
  ],
  revokeId: 'in-pending',
  revokeState: 'revoking',
  revokeReason: '',
});
const inFlightButtons = findAll(inFlightTree, (el) => el.props && el.props['data-inject'] === 'revoke');
const busyButton = inFlightButtons.filter((el) => el.props['data-inject-id'] === 'in-pending')[0];
const freeButton = inFlightButtons.filter((el) => el.props['data-inject-id'] === 'in-pending-2')[0];
check('inject.revoke.inFlightDisabled', busyButton.props.disabled === true, JSON.stringify(busyButton.props));
check('inject.revoke.inFlightWording', textOf(busyButton) === '撤回中…', textOf(busyButton));
check('inject.revoke.otherRowStillFree', freeButton.props.disabled === undefined && textOf(freeButton) === '撤回', textOf(freeButton));

// (h3) A refusal prints the HOST's own words under THAT row (rule 3), nowhere else.
const revokeFailedTree = T.renderHotInject(createElement, say, actions, {
  sessionId: 'session-1',
  state: 'idle',
  text: '',
  reason: '',
  history: [
    revokeHistory[0],
    { id: 'in-pending-2', at: 60, pickedUpAt: null, target: 'next-step', text: '另一句', status: 'pending', canceledAt: null },
  ],
  revokeId: 'in-pending',
  revokeState: 'failed',
  revokeReason: '该注入已被会话接下或不存在',
});
const revokeErrors = findAll(revokeFailedTree, (el) => el.props && el.props['data-inject'] === 'revoke-error');
check('inject.revoke.failedVerbatim', revokeErrors.length === 1 && textOf(revokeErrors[0]) === '该注入已被会话接下或不存在', revokeErrors.map((el) => textOf(el)).join(' | '));
check('inject.revoke.failedAria', revokeErrors[0].props.role === 'status' && revokeErrors[0].props['aria-live'] === 'polite', JSON.stringify(revokeErrors[0].props));
check(
  'inject.revoke.failedUnderItsOwnRow',
  (() => {
    const rows = findAll(revokeFailedTree, (el) => el.props && el.props['data-dsh-workflow-map'] === 'inject-row');
    const failing = rows.filter((row) => findAll(row, (el) => el.props && el.props['data-inject'] === 'revoke-error').length === 1);
    return failing.length === 1 && failing[0].props['data-status'] === 'pending' && findAll(failing[0], (el) => el.props && el.props['data-inject-id'] === 'in-pending').length === 1;
  })(),
  'exactly one row carries the failure line, and it is the row being revoked'
);

// (h4) The two pure pieces the button leans on: the state repair and the answer → outcome rule.
check(
  'inject.revokeState.passes',
  ['idle', 'revoking', 'revoked', 'failed'].every((s) => T.revokeState(s) === s) && T.revokeState('exploded') === 'idle' && T.revokeState(null) === 'idle',
  'the four states, anything else idle'
);
const revokedOutcome = T.revokeOutcome({ ok: true }, say);
check('inject.revokeOutcome.ok', revokedOutcome.kind === 'revoked', JSON.stringify(revokedOutcome));
const refusedOutcome = T.revokeOutcome({ ok: false, error: '该注入已被会话接下或不存在' }, say);
check('inject.revokeOutcome.verbatim', refusedOutcome.kind === 'failed' && refusedOutcome.text === '该注入已被会话接下或不存在', JSON.stringify(refusedOutcome));
check('inject.revokeOutcome.fallback', T.revokeOutcome({ ok: false }, say).text === '撤回失败（宿主未给出原因）', T.revokeOutcome({ ok: false }, say).text);
check('inject.revokeOutcome.nullIsFailure', T.revokeOutcome(null, say).kind === 'failed', 'a missing answer is never a success');

// (h5) The request itself: one POST, the unsteer path, the two-field body, never a throw.
let unsteerRequest = null;
const unsteerFetch = (url, init) => {
  unsteerRequest = { url, init };
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
};
const unsteerResult = await T.postUnsteer(unsteerFetch, '/dsh-workflow/unsteer', 'session-1', 'in-pending');
check('inject.postUnsteer.ok', unsteerResult.status === 200 && unsteerResult.error === '', JSON.stringify(unsteerResult));
check('inject.postUnsteer.method', unsteerRequest && unsteerRequest.init.method === 'POST', unsteerRequest && unsteerRequest.init.method);
check(
  'inject.postUnsteer.body',
  unsteerRequest && unsteerRequest.init.body === JSON.stringify({ sessionId: 'session-1', messageId: 'in-pending' }),
  unsteerRequest && unsteerRequest.init.body
);
check('inject.postUnsteer.noStore', unsteerRequest && unsteerRequest.init.cache === 'no-store', unsteerRequest && unsteerRequest.init.cache);
const refusedFetch = () => Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ ok: false, error: '该注入已被会话接下或不存在' }) });
const refusedResult = await T.postUnsteer(refusedFetch, '/dsh-workflow/unsteer', 'session-1', 'in-pending');
check('inject.postUnsteer.409CarriesReason', refusedResult.status === 409 && refusedResult.error === '该注入已被会话接下或不存在', JSON.stringify(refusedResult));
const brokenUnsteerFetch = () => {
  throw new Error('offline');
};
check('inject.postUnsteer.neverThrows', (await T.postUnsteer(brokenUnsteerFetch, '/x', 's', 'm')).status === 0, 'a throwing transport is a value');
check('inject.postUnsteer.noFetch', (await T.postUnsteer(null, '/x', 's', 'm')).status === 0, 'a missing fetch is a value');

/* ------------------------------------------------------------------------- */
/* the header badge + the persistent dock */
/* ------------------------------------------------------------------------- */

// (i1) The badge's number comes from the model's OWN rows — `status === "pending"` and nothing
// else — and the two pure helpers behind it are asserted with no DOM at all.
const badgeView = {
  ...viewOf([{ planIndex: 1, title: 'alpha' }], planOf({})),
  injects: [
    { id: 'in-picked', at: TIMING_AS_OF - 2000, text: '已被接下', pickedUp: true, canceled: false },
    { id: 'in-pending', at: TIMING_AS_OF - 1000, text: '待拾取', pickedUp: false, canceled: false },
  ],
};
const badgeModel = T.buildModel(badgeView, defaults);
check(
  'inject.pendingCount.pure',
  T.pendingInjectCount(badgeModel.injects) === 1 && T.pendingInjectCount(null) === 0 && T.pendingInjectCount([{ status: 'picked' }]) === 0 && T.pendingInjectCount([{ status: 'canceled' }]) === 0,
  String(T.pendingInjectCount(badgeModel.injects))
);
check(
  'inject.statusKey.shared',
  T.injectStatusKey('picked') === 'panel.inject.row.picked' && T.injectStatusKey('canceled') === 'panel.inject.row.canceled' && T.injectStatusKey('pending') === 'panel.inject.row.pending' && T.injectStatusKey('nonsense') === 'panel.inject.row.pending',
  'three words, ONE mapping; anything else falls back to pending'
);

const badgeTree = T.renderPanel(badgeModel, defaults, say, actions, ui);
const badgeButton = byData(badgeTree, 'inject-toggle')[0];
const badgeSpan = childByClass(badgeButton, 'wf-inject-badge');
check('inject.badge.present', badgeButton.props['data-pending-count'] === '1' && badgeSpan !== undefined && textOf(badgeSpan) === '1', String(badgeButton.props['data-pending-count']));
check('inject.badge.title', badgeButton.props.title === '1 条待会话拾取', String(badgeButton.props.title));

const quietModel = T.buildModel(
  { ...badgeView, injects: [{ id: 'in-picked', at: TIMING_AS_OF, text: 'x', pickedUp: true, canceled: false }] },
  defaults
);
const quietButton = byData(T.renderPanel(quietModel, defaults, say, actions, ui), 'inject-toggle')[0];
check(
  'inject.badge.absent',
  quietButton.props['data-pending-count'] === undefined && childByClass(quietButton, 'wf-inject-badge') === undefined && quietButton.props.title === '热注入提示词',
  'no pending row ⇒ no attribute, no badge element, and the plain title'
);

// (i2) The dock: at the FOOT of every page kind that is not the composer, absent for the composer
// itself, and fed by the SAME inject.text the composer reads (no second draft store).
const dockRight = { kind: 'step', stepIndex: 0, unit: badgeModel.page.units[0], stepDetail: badgeModel.detail, openType: null, scopeStep: 0 };
const dockUi = { ...ui, right: dockRight, injectState: 'idle', injectText: '草稿一句', sessionId: 'session-1' };
const dockTree = T.renderPanel(badgeModel, { ...defaults, rightOpen: true, rightKey: 'step:0' }, say, actions, dockUi);
const dockAside = byData(dockTree, 'right')[0];
const dock = byData(dockTree, 'inject-dock')[0];
check('inject.dock.present', dock !== undefined && byData(dockTree, 'inject').length === 0, 'a step page carries the dock and no composer');
check('inject.dock.footer', dockAside.children[dockAside.children.length - 1] === dock, 'it is the LAST child of the aside, i.e. the foot of the page');
const dockInput = findAll(dock, (el) => el.props && el.props['data-dsh-workflow-map'] === 'inject-dock-text')[0];
const dockSend = findAll(dock, (el) => el.props && el.props['data-inject'] === 'dock-send')[0];
check('inject.dock.controls', dockInput !== undefined && dockInput.type === 'input' && dockSend !== undefined && dockSend.props['data-ready'] === 'true', 'one single-line input + a ready send');
check('inject.dock.sharedDraft', dockInput.props.value === '草稿一句', String(dockInput.props.value));

const composerUi = { ...dockUi, right: { kind: 'inject', stepIndex: null, openType: null, unit: null, stepDetail: null } };
const composerTree = T.renderPanel(badgeModel, { ...defaults, rightOpen: true, rightKind: 'inject' }, say, actions, composerUi);
check(
  'inject.dock.absentOnComposer',
  byData(composerTree, 'inject-dock').length === 0 && byData(composerTree, 'inject').length === 1,
  'the composer is open and the dock is NOT repeated'
);
const composerArea = findAll(composerTree, (el) => el.props && el.props['data-dsh-workflow-map'] === 'inject-text')[0];
check('inject.dock.draftSurvivesSwitch', composerArea.props.value === '草稿一句', 'the same inject.text feeds both forms — switching loses no draft');

// (i3) The gate, the Enter shortcut and the receipt — all through the pure renderer.
const injected = [];
const dockActions = { ...actions, onInjectSend: (text) => injected.push(text) };
const emptyDockSend = findAll(T.renderInjectDock(createElement, say, dockActions, { sessionId: 'session-1', state: 'idle', text: '', history: [] }), (el) => el.props && el.props['data-inject'] === 'dock-send')[0];
check('inject.dock.gate.empty', emptyDockSend.props['data-ready'] === 'false' && emptyDockSend.props.disabled === true, 'no text ⇒ not ready');
const noSessionDockSend = findAll(T.renderInjectDock(createElement, say, dockActions, { sessionId: '', state: 'idle', text: 'hi', history: [] }), (el) => el.props && el.props['data-inject'] === 'dock-send')[0];
check('inject.dock.gate.noSession', noSessionDockSend.props.disabled === true, 'no session ⇒ not ready');
const readyDock = T.renderInjectDock(createElement, say, dockActions, { sessionId: 'session-1', state: 'idle', text: 'hi', history: [] });
const readyInput = findAll(readyDock, (el) => el.props && el.props['data-dsh-workflow-map'] === 'inject-dock-text')[0];
readyInput.props.onKeyDown({ key: 'Enter', preventDefault: () => {} });
readyInput.props.onKeyDown({ key: 'a', preventDefault: () => {} });
check('inject.dock.enterSends', injected.length === 1 && injected[0] === 'hi', JSON.stringify(injected));

const dockFailed = T.renderInjectDock(createElement, say, dockActions, { sessionId: 'session-1', state: 'failed', text: 'hi', reason: '会话未在运行，热注入不可用', history: [] });
const dockNote = findAll(dockFailed, (el) => el.props && el.props.className === 'wf-inject-dock-note')[0];
check('inject.dock.failedVerbatim', dockNote !== undefined && textOf(dockNote) === '会话未在运行，热注入不可用' && dockNote.props['data-kind'] === 'failed' && dockNote.props['aria-live'] === 'polite', dockNote && textOf(dockNote));
const dockBare = T.renderInjectDock(createElement, say, dockActions, { sessionId: 'session-1', state: 'failed', text: 'hi', reason: '', history: [] });
check('inject.dock.failedFallback', textOf(findAll(dockBare, (el) => el.props && el.props.className === 'wf-inject-dock-note')[0]) === '注入失败（宿主未给出原因）', 'the fallback is the shared dictionary word, not a new invention');
const dockState = findAll(T.renderInjectDock(createElement, say, dockActions, { sessionId: 'session-1', state: 'idle', text: '', history: badgeModel.injects }), (el) => el.props && el.props.className === 'wf-inject-dock-state')[0];
check('inject.dock.newestStatus', dockState.props['data-status'] === 'pending' && textOf(dockState) === '待会话拾取', 'the NEWEST row (last in the model) is the one shown');

// (i4) The stylesheet facts that exist only as CSS: the enlarged button, the badge, the 460 px
// column and the dock's own narrow-container branch (the real pixels are measured by
// tools/measure-inject.ps1 in a live layout engine).
const promCss = T.css();
check('inject.css.hotSize', promCss.includes('.wf-btn-hot{position:relative;width:auto;min-width:96px;height:30px'), 'the header entry is 96×30 by contract');
check('inject.css.badge', promCss.includes('.wf-inject-badge{position:absolute'), 'the badge is absolutely positioned on the button');
check('inject.css.rightWidth', promCss.includes('.wf-right{flex:0 0 460px'), 'the right page is 460 px wide');
check('inject.css.dockFooter', promCss.includes('.wf-inject-dock{flex:0 0 auto'), 'the dock is a fixed-basis footer, not part of the scroll');
check('inject.css.dockNarrow', promCss.includes('@container (max-width:900px){.wf-inject-dock{padding:6px 8px}'), 'the dock follows the stacked layout at the same breakpoint');

// (g) the stylesheet: the split and the column, plus the narrow-container downgrade.
const cssNow = T.css();
// the split is gone; the composer fills the right page instead.
check(
  'inject.css.column',
  cssNow.includes('.wf-right .wf-inject{flex:1 1 auto') && !cssNow.includes('.wf-inject{flex:0 0 320px'),
  '会话4: the 320 px split column is gone; the composer fills the right page (asserted below)'
);
check('inject.css.pageFill', cssNow.includes('.wf-right .wf-inject{flex:1 1 auto;min-height:0'), 'inside the right page it fills the column');
// The narrow rule is a CONTAINER query: the panel's own width decides, not the window's.
check('inject.css.narrow', cssNow.includes('@container (max-width:900px)'), 'narrow → stacked');
check('inject.css.containerType', cssNow.includes('.wf-card{container-type:inline-size}'), 'the card is the container');
check(
  'inject.css.noSplitLeft',
  !cssNow.includes(".wf-body[data-split='true']"),
  'the old split rule is gone, not merely unused'
);
check('say.percentTexts', say('panel.percent.estimate', { percent: 62 }) === '~62% 估算' && say('panel.percent.self', { percent: 62 }) === '62% 自报', say('panel.percent.estimate', { percent: 62 }) + ' / ' + say('panel.percent.self', { percent: 62 }));
check('say.failedSkipped', say('panel.status.failed') === '失败' && say('panel.status.skipped') === '已跳过', say('panel.status.failed') + '/' + say('panel.status.skipped'));
check('say.stepConfirm', say('panel.step.confirm') === '需确认' && say('panel.step.progress', { title: 'x' }) === 'x 进度', say('panel.step.confirm'));

/* ------------------------------------------------------------------------- */
/* stylesheet */
/* ------------------------------------------------------------------------- */

const css = T.css();
const cssNeedles = [
// the root is a column that fills the main area — no fixed box, no corner anchor,
// no click-through layer, no inline-capped card. The card stretches instead.
['root fills the main area', '.wf-root{position:relative;width:100%;height:100%;min-height:0;display:flex;flex-direction:column'],
['ring pulse', '@keyframes wf-ring'],
['self-report tone', ".wf-prog-label[data-kind='self']"],
['card fills the column', '.wf-card{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;min-width:0'],
['two columns', 'grid-template-columns:minmax(240px,44%) 1fr'],
  ['capsule bar', '.wf-capsule-bar{'],
  ['capsule pulse', '@keyframes wf-pulse'],
 // the card sits flush in the centre column, so the radius belongs to the inner
 // surfaces (cards, capsules, detail blocks) rather than to the frame itself.
  ['inner card radius', '.wf-step-card{grid-area:1/1;display:flex;gap:8px;align-items:flex-start;width:100%;padding:7px 8px;border-radius:8px'],
  ['step card', '.wf-step-card{'],
  ['step ring', '.wf-step-ring{'],
 // the dock became a two-LINE block (row + sub line), so the 8 px air and the
 // The dock is now a two-LINE block (row + sub line), so the 8 px air sits on the dock and
 // the 6 px track on the row inside it. `css` returns the joined, evaluated sheet.
  ['rail air', '.wf-prog-dock{display:flex;flex-direction:column;gap:2px;margin-top:8px}'],
  ['rail row height', '.wf-prog-row{display:flex;align-items:center;gap:6px;height:6px}'],
  ['rail sub line', '.wf-prog-sub{'],
  ['sub line hidden when narrow', ".wf-step-item[data-detail='title'] .wf-prog-sub{display:none}"],
  ['rail fill', '.wf-prog-fill{'],
 // the step column's air now comes from the LIST's `gap` (WF_CHAIN_GAP), so the
 // connector no longer carries a margin — the old needle asserted the very double spacing this
 // step removed. The drawn height (14 px) is unchanged.
  ['connector', '.wf-step-link{display:block;position:relative;height:14px}'],
  ['connector solid', ".wf-step-link[data-done='true']::before"],
  ['connector dashed', 'repeating-linear-gradient'],
  ['sticky header', 'position:sticky;top:0;z-index:3'],
  ['rail flow', '@keyframes wf-prog-flow'],
  ['indeterminate', ".wf-prog-fill[data-indeterminate='true']{width:30%!important"],
  ['internal scroll', '.wf-steps-scroll{flex:1 1 auto}'],
  ['flow scroller', '.wf-flow-scroll{flex:1 1 auto;'],
  ['flow spine', '.wf-flow-list::before{'],
  ['flow item dot', '.wf-flow-item::before{'],
  ['flow status dot', '.wf-flow-status{'],
  ['node icon', '.wf-node-icon{'],
  ['group head', '.wf-group-head{'],
  ['group body', '.wf-group-body{'],
  ['earlier strip', '.wf-flow-more{'],
  ['running node pulse', ".wf-flow-status[data-status='running']"],
  ['branch area', '.wf-branches{'],
  ['branch connector', '.wf-branch-link{'],
  ['branch card', '.wf-branch-card{'],
  ['branch body', '.wf-branch-body{'],
  ['branch running dot', ".wf-branch-dot[data-status='running']"],
  ['branch more strip', '.wf-branch-more{'],
 // the conversation-view seat removes the HOST's composer (the input bar plus the todo dock
 // ARE INSIDE that seat and disappear with it). The composer is outside the panel's own tree — a
 // sibling of the selected view — so the only browser-half mechanism is a rule keyed on the marker
 // the seat wrapper emits (`wfViewSeatRoot` in panel.js).
  [
    'host composer hidden on the view seat',
    "[data-conversation-content]:has([data-dsh-workflow-map='conversation-view']) [data-composer-seat]{display:none!important}",
  ],
];
for (const [label, needle] of cssNeedles) {
  check('css.' + label.replace(/\s+/g, '-'), css.includes(needle), needle);
}
// the seat wrapper itself: the marker that rule keys on, emitted BOX-LESS so the seat's
// geometry does not move, and the panel still travelling through it untouched.
const seatChild = createElement('span', { key: 'child', className: 'wf-seat-child' }, 'panel');
const seatTree = T.viewSeatRoot(createElement, seatChild);
check('view.seat.marker', seatTree.props['data-dsh-workflow-map'] === T.viewSeatMarker && T.viewSeatMarker === 'conversation-view', JSON.stringify(seatTree.props));
check('view.seat.boxless', seatTree.props.style && seatTree.props.style.display === 'contents', JSON.stringify(seatTree.props.style));
check('view.seat.passesThePanelThrough', seatTree.children.length === 1 && seatTree.children[0] === seatChild, 'the wrapped node is the panel itself');
check('view.seat.ruleKeysOnThisSeatOnly', !css.includes(":has([data-dsh-workflow-map='root'])") && !css.includes(":has([data-dsh-workflow-map='body'])"), 'the rule keys on the view-seat marker, not on the sidebar page');
check('view.seat.sidebarPageKeepsItsComposer', !css.includes("data-dsh-workflow-map='panel'] [data-composer-seat]"), 'the sidebar page never hides anything host-owned');
const tokens = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-alias-state-idle-primary',
];
for (const token of tokens) {
  const pattern = new RegExp('var\\(' + token.replace(/[-]/g, '\\-') + ',\\s*[^)]+\\)');
  check('css.fallback.' + token, pattern.test(css), 'token used with a concrete fallback');
}

/* ------------------------------------------------------------------------- */
/* report */
/* ------------------------------------------------------------------------- */

const failed = results.filter((row) => !row.pass);
process.stdout.write(results.map((row) => `${row.pass ? 'PASS' : 'FAIL'}  ${row.id}${row.pass ? '' : '  — ' + row.detail}`).join('\n') + '\n');
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
if (failed.length > 0) process.exitCode = 1;
