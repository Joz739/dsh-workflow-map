// preview-panel.mjs — render the panel to static HTML for a pixel check.
//
// The live GUI needs a browser session (its shell answers 401 to a bare HTTP
// client), so the panel's VISUAL contract is checked here instead: the built
// client.js is loaded with the same stubs selftest-panel uses, its renderer is
// driven with the recorded live view, and the resulting element tree is
// serialised next to the real WF_CSS. tools/preview-shot.ps1 then screenshots
// the pages with headless Chrome.
//
// What this proves: the panel fills the MAIN CONTENT AREA — no fixed box, no
// corner anchor, no drag grips — plus the two-column split, wrapping, scroll containment,
// contrast with BOTH the fallback palette and a light token override, and the folded row.
// The mock shell below is a 220 px rail + a main column, i.e. the real seat.
// override, and the collapsed capsule.
// What it does NOT prove: that React mounts inside the real frame — that is the
// user's F5 check (and 's live visual verification).
//
// Run: node tools/preview-panel.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'evidence', 'preview');
fs.mkdirSync(OUT, { recursive: true });

/* --- load the built bundle (same seam as selftest-panel) ------------------ */
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

/* --- element tree → HTML -------------------------------------------------- */
const esc = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());

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
      const css = Object.entries(value)
        .map(([key, raw]) => `${kebab(key)}:${raw}`)
        .join(';');
      attrs += ` style="${esc(css)}"`;
      continue;
    }
    if (name === 'data-dsh-workflow-map' || name.startsWith('data-') || ['role', 'title', 'type', 'aria-label', 'aria-hidden', 'aria-pressed', 'aria-expanded', 'aria-controls', 'id', 'tabindex'].includes(name)) {
      attrs += ` ${name}="${esc(value)}"`;
    }
  }
  return `<${node.type}${attrs}>${(node.children || []).map(toHtml).join('')}</${node.type}>`;
}

/* --- the mock application shell: rail + main column (the real seat) -------- */
const mockCss = `
  html,body{margin:0;height:100%;background:var(--mock-bg);color:var(--mock-fg);
    font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif}
 /* the real shell is [rail | main] and the panel is the main column's occupant,
     so the mock MUST give it exactly that slot — otherwise "fills the area" is untested. */
  .mock-app{display:grid;grid-template-columns:220px 1fr;height:100vh}
  .mock-side{border-right:1px solid var(--mock-border);padding:14px 12px;font-size:12px;color:var(--mock-dim)}
  .mock-side b{display:block;margin-bottom:10px;color:var(--mock-fg);font-size:13px}
  .mock-row{padding:6px 8px;border-radius:6px;margin-bottom:4px;background:var(--mock-row)}
  .mock-row.active{outline:1px solid var(--mock-brand,#5b8cff);color:var(--mock-fg)}
  .mock-main{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
 /* the note lives INSIDE the rail. A strip below the app grid would add page
     overflow and make "the panel fits the viewport" fail for a reason that has nothing to
     do with the panel. */
  .mock-note{margin-top:12px;padding-top:10px;border-top:1px solid var(--mock-border);font-size:10px;line-height:1.5;color:var(--mock-dim)}
`;

const DARK_TOKENS = `
  :root{--mock-bg:#0f1116;--mock-fg:#e9ecf3;--mock-dim:#9aa3b2;--mock-border:#2a2f3a;
    --mock-row:#181b22;--mock-me:#22304a}
`;
const LIGHT_TOKENS = `
  :root{--mock-bg:#ffffff;--mock-fg:#0f1115;--mock-dim:#61666b;--mock-border:rgba(0,0,0,.10);
    --mock-row:#ffffff;--mock-me:#ffffff;
    --dsw-alias-bg-base:#ffffff;--dsw-alias-bg-layer-1:#ffffff;--dsw-alias-bg-layer-2:#ffffff;
    --dsw-alias-bg-overlay:#ffffff;--dsw-alias-border-l1:rgba(0,0,0,.04);--dsw-alias-border-l2:rgba(0,0,0,.10);
    --dsw-alias-brand-primary:#2f6fed;--dsw-alias-label-primary:#0f1115;
    --dsw-alias-label-secondary:#5c6472;--dsw-alias-label-tertiary:#8a92a1;
    --dsw-alias-state-success-primary:#14934f;--dsw-alias-state-warn-primary:#b7791f;
    --dsw-alias-state-error-primary:#c8382f;--dsw-alias-state-idle-primary:#6b7280}
`;

const mockApp = `
  <div class="mock-app">
    <aside class="mock-side">
      <b>DeepSeek Harness</b>
      <div class="mock-row">会话</div>
      <div class="mock-row">任务</div>
      <div class="mock-row active">工作流</div>
      <div class="mock-row">插件</div>
      <div class="mock-note">静态预览：左栏模拟真实 rail；面板由真实 client.js 渲染器生成</div>
    </aside>
    <main class="mock-main" id="wf-slot"><!-- panel injected by page() --></main>
  </div>
`;
function page(panelHtml, tokens, title, script) {
  const css = T.css();
  const tail = script ? `<script>${script}</script>` : '';
 // the panel goes INTO the main column, exactly as the `main` slot does.
  const shell = mockApp.replace('<main class="mock-main" id="wf-slot"><!-- panel injected by page() --></main>', `<main class="mock-main" id="wf-slot">${panelHtml}</main>`);
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${tokens}${mockCss}${css}</style></head><body>${shell}${tail}</body></html>`;
}

/**
 * the triangle page keeps the real CSS and the real mock shell, but the panel is
 * replaced by a HOST DIV the measurement script re-mounts into. The script needs the bundle
 * factory (window.__wfDef) and live handlers, so it rebuilds the tree itself instead of
 * measuring a dead static dump.
 */
function triPage(panelHtml, tokens, script) {
  const css = T.css();
  const shell = mockApp.replace(
    '<main class="mock-main" id="wf-slot"><!-- panel injected by page() --></main>',
    `<main class="mock-main" id="wf-slot"><div id="wf-tri-host"></div><div id="wf-group-tri-host"></div></main>`
  );
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>workflow-map triangle measure</title>
<style>${tokens}${mockCss}${css}</style></head><body>${shell}
<script>window.__ModuleLoader__ = { load: function (definition) { window.__wfDef = definition; } };</script>
<script src="../../client.js"></script>
<script>${script}</script></body></html>`;
}

/**
 * the same idea as triPage but with ONE named host div, so a measuring script can
 * mount the real renderer output into a live DOM (handlers included) with fixed stamps.
 */
function mountPage(tokens, hostId, title, script) {
  const css = T.css();
  const shell = mockApp.replace(
    '<main class="mock-main" id="wf-slot"><!-- panel injected by page() --></main>',
    `<main class="mock-main" id="wf-slot"><div id="${hostId}"></div></main>`
  );
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${tokens}${mockCss}${css}</style></head><body>${shell}
<script>window.__ModuleLoader__ = { load: function (definition) { window.__wfDef = definition; } };</script>
<script src="../../client.js"></script>
<script>${script}</script></body></html>`;
}

/* --- the three states ----------------------------------------------------- */
// A FICTIONAL view. The screenshots this generator produces are published in the
// README, so the session they show must describe work that never happened: the
// recording this used to read carried a real task and its session id into the
// images. tools/fixtures/state-demo.json is written by hand for exactly this, with
// the same field-for-field shape the host's buildView sends.
const view = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/state-demo.json'), 'utf8')).view;
const prefs = T.defaultPrefs();
const say = T.makeSay(undefined);
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
};
const model = T.buildModel(view, prefs);
const ui = {
  settingsOpen: false,
  maxWidth: 1400,
  status: 'live',
  error: '',
  rev: 4242,
  endpoint: '/dsh-workflow/state?sessionId=demo0000-demo-4demo-8demo-demo00000000',
  nodeTotal: 30,
};

const expanded = T.renderPanel(model, prefs, say, actions, ui);
const collapsed = T.renderPanel(model, { ...prefs, collapsed: true }, say, actions, ui);
const planningModel = T.buildModel({ steps: [], nodes: [], plan: { phase: 'planning', steps: [], task: '规划中的任务' } }, prefs);
const planning = T.renderPanel(planningModel, prefs, say, actions, { ...ui, status: 'loading' });
/* A page that MEASURES itself and leaves the numbers in <pre id="wf-measure">:
 * tools/measure-panel.ps1 dumps this DOM with headless Chrome and asserts the
 * geometry the acceptance criteria talk about (8 px of air under the
 * card frame, a 6 px rail, no overlap with the next connector). */
const measureScript = `
window.addEventListener('load', function () {
  window.setTimeout(function () {
    var items = [].slice.call(document.querySelectorAll('.wf-unit'));
    var rows = items.map(function (item) {
      var card = item.querySelector('.wf-unit-card');
      var dock = item.querySelector('.wf-prog-dock');
      var link = item.querySelector('.wf-unit-link');
      var fill = item.querySelector('.wf-prog-fill');
      var track = item.querySelector('.wf-prog-track');
      var label = item.querySelector('.wf-prog-label');
 // the second line (ago · eta). Measured for the same reasons as the rail: only a
 // layout engine can prove it neither wraps onto a third line nor overlaps the connector.
      var sub = item.querySelector('.wf-prog-sub');
      var ago = item.querySelector('.wf-prog-ago');
      var eta = item.querySelector('.wf-prog-eta');
      var c = card.getBoundingClientRect();
      var cardRight = Math.round(c.right * 100) / 100;
      var d = dock.getBoundingClientRect();
      var l = link ? link.getBoundingClientRect() : null;
      return {
        index: Number(item.getAttribute('data-step-index')),
        status: item.getAttribute('data-status'),
        gapPx: Math.round((d.top - c.bottom) * 100) / 100,
        dockToLinkPx: l ? Math.round((l.top - d.bottom) * 100) / 100 : null,
        overlap: l ? d.bottom > l.top + 0.01 : false,
        label: label ? label.textContent : null,
        dockH: Math.round(d.height * 100) / 100,
          trackH: track ? Math.round(parseFloat(window.getComputedStyle(track).height) * 100) / 100 : null,
          trackBoxH: track ? Math.round(track.getBoundingClientRect().height * 100) / 100 : null,
        subH: sub ? Math.round(sub.getBoundingClientRect().height * 100) / 100 : null,
        subRight: sub ? Math.round(sub.getBoundingClientRect().right * 100) / 100 : null,
        subLeft: sub ? Math.round(sub.getBoundingClientRect().left * 100) / 100 : null,
        subTop: sub ? Math.round(sub.getBoundingClientRect().top * 100) / 100 : null,
        subBottom: sub ? Math.round(sub.getBoundingClientRect().bottom * 100) / 100 : null,
        cardRight: cardRight,
        rowBottom: (function () {
          var row = item.querySelector('.wf-prog-row');
          return row ? Math.round(row.getBoundingClientRect().bottom * 100) / 100 : null;
        })(),
 // One line only: a wrapped sub line is taller than its own font size.
        subWrapped: sub ? sub.getBoundingClientRect().height > 14 : false,
        subOverlapsTrack: (function () {
          if (!sub) return false;
          var row = item.querySelector('.wf-prog-row');
          if (!row) return false;
          return sub.getBoundingClientRect().top < row.getBoundingClientRect().bottom - 0.01;
        })(),
        agoText: ago ? ago.textContent : null,
        etaText: eta ? eta.textContent : null,
        agoTitle: ago ? ago.getAttribute('title') : null,
        etaTitle: eta ? eta.getAttribute('title') : null,
        fillPct: Math.round((fill.getBoundingClientRect().width / track.getBoundingClientRect().width) * 1000) / 10
      };
    });
    var gaps = rows.map(function (row) { return row.gapPx; });
    var links = rows.filter(function (row) { return row.dockToLinkPx !== null; });
 // The >8-step contract: the left column scrolls internally and its header
 // stays put while it does.
    var scroller = document.querySelector('[data-dsh-workflow-map="page-scroll"]');
    var header = document.querySelector('[data-dsh-workflow-map="page-head"]');
    var headerTopBefore = header ? Math.round(header.getBoundingClientRect().top) : null;
    var scrollable = scroller ? scroller.scrollHeight > scroller.clientHeight + 1 : false;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    var headerTopAfter = header ? Math.round(header.getBoundingClientRect().top) : null;
    var stickyKept = headerTopBefore !== null && headerTopAfter !== null && Math.abs(headerTopBefore - headerTopAfter) <= 1;
    var cards = [].slice.call(document.querySelectorAll('.wf-unit-card'));
    var payload = {
      cards: cards.length,
      docks: document.querySelectorAll('.wf-prog-dock').length,
 // the second line's own counts and its two failure modes.
      subLines: document.querySelectorAll('.wf-prog-sub').length,
      agoSegments: document.querySelectorAll('.wf-prog-ago').length,
      etaSegments: document.querySelectorAll('.wf-prog-eta').length,
      subWrappedAny: rows.some(function (row) { return row.subWrapped; }),
      subOverlapsTrackAny: rows.some(function (row) { return row.subOverlapsTrack; }),
      subBeyondCard: rows.some(function (row) {
        return row.subRight !== null && row.cardRight !== undefined && row.subRight > row.cardRight + 0.5;
      }),
      connectors: document.querySelectorAll('.wf-unit-link').length,
      railHeight: rows.length > 0 ? rows[0].dockH : null,
        railTrackHeight: rows.length > 0 ? rows[0].trackH : null,
      gapValues: gaps,
      minDockToLinkPx: links.reduce(function (min, row) { return Math.min(min, row.dockToLinkPx); }, 999),
      overlapped: rows.some(function (row) { return row.overlap; }),
      scrollable: scrollable,
      stickyKept: stickyKept,
      headerTopBefore: headerTopBefore,
      headerTopAfter: headerTopAfter,
      titlesPresent: cards.every(function (card) { return (card.getAttribute('title') || '').length > 0; }),
      seqFirst: (items[0].querySelector('.wf-unit-seq') || {}).textContent || null,
      seqLast: (items[items.length - 1].querySelector('.wf-unit-seq') || {}).textContent || null,
      rows: rows
    };
    var pre = document.createElement('pre');
    pre.id = 'wf-measure';
    pre.textContent = JSON.stringify(payload);
    document.body.appendChild(pre);
  }, 150);
});
`;
/* --- flow column : a page that measures itself ------------------- */
const flowMeasure = `
window.addEventListener('load', function () {
  window.setTimeout(function () {
    function q(sel) { return document.querySelector(sel); }
    var panel = q('.wf-card');
    var scroller = q('[data-dsh-workflow-map="flow-scroll"]');
    var head = q('[data-dsh-workflow-map="flow-head"]');
    var banner = q('.wf-flow-more');
    var nodes = [].slice.call(document.querySelectorAll('.wf-node'));
    var heads = [].slice.call(document.querySelectorAll('.wf-group-head'));
    var titleOf = function (node) {
      var span = node.querySelector('.wf-node-title');
      return span ? span.textContent : '';
    };
    var titles = nodes.map(titleOf);
    var memberNodes = [].slice.call(document.querySelectorAll('.wf-group-body .wf-node'));
    var memberTitles = memberNodes.map(titleOf);
    var selected = nodes.filter(function (node) { return node.getAttribute('data-selected') === 'true'; });
    var rect = panel ? panel.getBoundingClientRect() : { width: 0, bottom: 0 };
    var headTop = head ? head.getBoundingClientRect().top : null;
    var scrollable = scroller ? scroller.scrollHeight > scroller.clientHeight + 1 : false;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    var headTopAfter = head ? head.getBoundingClientRect().top : null;
    var groupMeta = q('.wf-group-meta');
    var groupEl = q('.wf-group');
    var payload = {
      panelWidth: Math.round(rect.width),
      panelBottom: Math.round(rect.bottom),
      viewportHeight: window.innerHeight,
      pageOverflow: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight)),
      headerOutsideScroller: !!(head && scroller && !scroller.contains(head)),
      stripOutsideScroller: !banner || !scroller || !scroller.contains(banner),
      headerTop: headTop,
      headerTopAfter: headTopAfter,
      headerStable: headTop !== null && headTopAfter !== null && Math.abs(headTop - headTopAfter) <= 1,
      scrollable: scrollable,
      scrollTopMax: scroller ? Math.round(scroller.scrollTop) : null,
      horizontalOverflow: scroller ? Math.max(0, Math.round(scroller.scrollWidth - scroller.clientWidth)) : null,
      nodeCards: nodes.length,
      groupHeads: heads.length,
      icons: document.querySelectorAll('.wf-node-icon').length,
      dots: document.querySelectorAll('.wf-flow-status').length,
      titlesPresent: titles.length > 0 && titles.every(function (text) { return text.length > 0; }),
      verbs: titles.filter(function (text) { return /^(读|写|改|列|搜|撤|命令|技能|子代理) · /.test(text); }).length,
      selectedCards: selected.length,
      selectedIds: selected.map(function (node) { return node.getAttribute('data-node-id'); }),
      banner: banner ? banner.textContent : null,
      showAllButton: !!document.querySelector('.wf-flow-more .wf-link'),
      groupCount: groupEl ? groupEl.getAttribute('data-group-count') : null,
      groupExpanded: heads.length ? heads[0].getAttribute('data-expanded') : null,
      groupRange: groupMeta ? groupMeta.textContent : null,
      groupMembers: memberNodes.length,
      groupMemberVerbs: memberTitles.filter(function (text) { return /^读 · /.test(text); }).length,
      firstNodeId: nodes.length ? nodes[0].getAttribute('data-node-id') : null,
      firstTitle: titles.length ? titles[0] : null,
      lastTitle: titles.length ? titles[titles.length - 1] : null
    };
    var pre = document.createElement('pre');
    pre.id = 'wf-measure';
    pre.textContent = JSON.stringify(payload);
    document.body.appendChild(pre);
  }, 150);
});
`;

/* --- the three flow states ------------------------------------------------- */
const CAP_INDEX = view.steps.reduce((best, s, i) => (s.nodeCount || 0) - (s.nodeIds || []).length > (view.steps[best].nodeCount || 0) - (view.steps[best].nodeIds || []).length ? i : best, 0);
const capModel = T.buildModel(view, { ...prefs, selectedStep: CAP_INDEX });
const capGroups = T.flowGroups(capModel.flow.nodes, capModel.flow.groups);
const capItems = T.flowItems(capModel.flow.nodes, capGroups);
const capWindow = T.flowWindow(capItems, T.constants().flowCap, false);
const capWindowNodes = T.flowNodeCount(capWindow.items);
const capFirstId = capWindow.items[0] && capWindow.items[0].type === 'node' ? capWindow.items[0].node.id : capModel.flow.nodes[capWindow.hiddenNodes].id;

const GROUP_INDEX = view.steps.findIndex((s, i) => { const m = T.buildModel(view, { ...prefs, selectedStep: i }); return m && T.flowGroups(m.flow.nodes, m.flow.groups).length > 0; });
const groupModel = T.buildModel(view, { ...prefs, selectedStep: GROUP_INDEX >= 0 ? GROUP_INDEX : 0 });
const groupRanges = T.flowGroups(groupModel.flow.nodes, groupModel.flow.groups);
const openGroupUi = T.flowExpandAll(T.flowToggleGroup(T.flowUiFor(null, GROUP_INDEX), GROUP_INDEX, groupRanges[0].key), GROUP_INDEX);
const groupMemberId = groupModel.flow.nodes[groupRanges[0].from].id;
const selectedGroupUi = T.flowSelectNode(openGroupUi, 1, groupMemberId);

const capFlowTree = T.renderPanel(capModel, prefs, say, actions, { ...ui, flow: T.flowUiFor(null, CAP_INDEX) });
const groupFlowTree = T.renderPanel(groupModel, prefs, say, actions, { ...ui, flow: selectedGroupUi });
const allFlowTree = T.renderPanel(capModel, prefs, say, actions, { ...ui, flow: T.flowExpandAll(T.flowUiFor(null, CAP_INDEX), CAP_INDEX) });

const flowExpect = {
  cap: {
    nodeCards: capWindowNodes,
    bannerIncludes: '更早 ' + capWindow.hiddenNodes + ' 个被折叠',
    firstNodeId: capFirstId,
  },
  groups: {
    nodeCards: groupModel.flow.nodes.length,
    groupCount: groupRanges[0].count,
    groupMembers: groupRanges[0].count,
    selectedIds: [groupMemberId],
  },
  all: {
    nodeCards: capModel.flow.nodes.length,
    firstNodeId: capModel.flow.nodes[0].id,
    stripIncludes: capModel.flow.truncated > 0 ? '已省略 ' + capModel.flow.truncated + ' 个节点' : null,
  },
};
fs.writeFileSync(path.join(OUT, 'flow-expect.json'), JSON.stringify(flowExpect, null, 2), 'utf8');
process.stdout.write(`flow: cap shows ${capWindowNodes}/${capModel.flow.nodes.length} nodes, fold ${groupRanges[0].count}x${groupRanges[0].tool}\n`);

// Screenshot-only helpers: the live panel opens the list at its bottom (the newest node)
// and a fold may sit far up the list, so the shots scroll to the row they are about.
// The measure pages deliberately do NOT use these: they scroll on their own.
const bottomShot = "window.addEventListener('load',function(){setTimeout(function(){var list=document.querySelector('[data-dsh-workflow-map=\\\"flow-scroll\\\"]');if(list)list.scrollTop=list.scrollHeight;},120);});";
const groupShot = "window.addEventListener('load',function(){setTimeout(function(){var el=document.querySelector('.wf-group');if(el&&el.scrollIntoView)el.scrollIntoView({block:'center'});},120);});";
/* the triangle page MOUNTS the real renderer output into real DOM (with the real
 * onClick handlers) and clicks it. A static dump cannot prove a toggle — the handler would
 * be missing — so this page rebuilds the tree from the bundle on every state change. */
const triMeasureScript = `
window.addEventListener('load', function () {
  window.setTimeout(function () {
    var report = { error: '', triangles: [], click: null, crossStep: null };
    function round(n) { return Math.round(n * 100) / 100; }
    try {
      var definition = window.__wfDef;
      if (!definition) throw new Error('bundle not captured');
      var T = definition.factory(function (name) {
        if (name === 'react') return { createElement: function (type, props) { return { type: type, props: props || {}, children: [].slice.call(arguments, 2) }; } };
        throw new Error('unexpected require: ' + name);
      }).__test;

 // --- a real DOM mount of the renderer's own tree (handlers included) ----------
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

      var T0 = 1792243000000;
      var view = {
        asOf: T0, task: 'triangle measure',
        steps: [
          { index: 0, planIndex: 1, title: '第一步', status: 'running', percent: 40, percentSource: 'model', nodeIds: ['a1'], nodeCount: 1, groups: [] },
          { index: 1, planIndex: 2, title: '第二步', status: 'pending', percent: null, nodeIds: [], nodeCount: 0, groups: [] },
        ],
        nodes: [{ id: 'a1', stepIndex: 0, kind: 'tool', tool: 'read', title: 'read a', detail: 'path=a', files: [], resultHead: 'ok', error: '', at: T0, durationMs: 3, seq: 1 }],
        plan: null,
        counts: { steps: 2, nodes: 1, running: 1, completed: 0 },
      };
      var say = T.makeSay(undefined);
      var state = { selected: 0, closed: null };
      var host = document.getElementById('wf-tri-host');
      var actions = {
        onSelectStep: function (index) { state.selected = index; state.closed = null; render(); },
        onStepInfo: function (index) {
          if (state.selected === index) { state.closed = T.stepDetailToggle(state.closed, index); }
          else { var opened = T.stepDetailOpenFor(index); state.selected = opened.selectedStep; state.closed = opened.closedStep; }
          render();
        },
        onToggleGroup: function () {}, onToggleBranch: function () {}, onShowAll: function () {},
        onSelectNode: function () {}, onCloseStepDetail: function (index) { state.closed = index; render(); },
        onEscapeDetail: function () {}, onCopy: function () {}, onCollapse: function () {}, onExpand: function () {},
        onToggleSettings: function () {}, onReset: function () {}, onSetting: function () {},
      };
      function render() {
        var prefs = T.applyPrefsPatch(T.defaultPrefs(), { selectedStep: state.selected });
        var model = T.buildModel(view, prefs, T0);
        var tree = T.renderPanel(model, prefs, say, actions, {
          settingsOpen: false, status: 'live', error: '', rev: 1, endpoint: '/x', nodeTotal: 1,
          flow: null, stepDetail: state.closed, motion: 'css', idle: true,
        });
        host.innerHTML = '';
        host.appendChild(mount(tree));
      }
      render();

 // --- 1. the band: 20 px wide, exactly as tall as its card ------------------
      var items = [].slice.call(host.querySelectorAll('.wf-unit'));
      report.triangles = items.map(function (item) {
        var card = item.querySelector('.wf-unit-card');
        var tri = item.querySelector('.wf-tri');
        if (!tri || !card) return { missing: true };
        var tr = tri.getBoundingClientRect();
        var cr = card.getBoundingClientRect();
        var titleEl = item.querySelector('.wf-unit-title');
        return {
          tag: tri.tagName.toLowerCase(),
          width: round(tr.width),
          height: round(tr.height),
          cardHeight: round(cr.height),
          sameTop: Math.abs(tr.top - cr.top) <= 1,
          sameBottom: Math.abs(tr.bottom - cr.bottom) <= 1,
          expanded: tri.getAttribute('aria-expanded'),
          controls: tri.getAttribute('aria-controls'),
          label: tri.getAttribute('aria-label'),
          text: tri.textContent,
          titleLeft: round(titleEl ? titleEl.getBoundingClientRect().left : cr.left),
          triRight: round(tr.right),
 // Tab reachability: a real <button> is focusable without tabindex.
          focusable: (function () { tri.focus(); return document.activeElement === tri; })(),
        };
      });

 // --- 2. a real click flips aria-expanded and removes the detail -------------
      var beforeTri = items[0].querySelector('.wf-tri');
      var beforeExpanded = beforeTri.getAttribute('aria-expanded');
      var beforeDetail = host.querySelectorAll('[data-dsh-workflow-map=\"step-detail\"]').length;
      beforeTri.click();
      var afterTri = host.querySelector('.wf-step-item .wf-tri');
      report.click = {
        before: beforeExpanded,
        after: afterTri.getAttribute('aria-expanded'),
        text: afterTri.textContent,
        beforeDetail: beforeDetail,
        afterDetail: host.querySelectorAll('[data-dsh-workflow-map=\"step-detail\"]').length,
      };
 // Click again: it must flip back (a toggle, not a one-way switch).
      afterTri.click();
      report.click.back = host.querySelector('.wf-step-item .wf-tri').getAttribute('aria-expanded');

 // --- 3. a triangle on ANOTHER card selects that step and opens it -----------
      var secondTri = host.querySelectorAll('.wf-unit')[1].querySelector('.wf-tri');
      secondTri.click();
      var secondCard = host.querySelectorAll('.wf-unit')[1];
      report.crossStep = {
        selected: secondCard.getAttribute('data-selected'),
        expanded: secondCard.querySelector('.wf-tri').getAttribute('aria-expanded'),
        detailIndex: (function () {
          var d = host.querySelector('[data-dsh-workflow-map=\"step-detail\"]');
          return d ? d.getAttribute('data-step-index') : null;
        })(),
      };

 // --- 4. the FOLDED RUN's triangle: same renderer, same band, same toggle ------
      var groupHost = document.getElementById('wf-group-tri-host');
      var groupState = { expanded: [] };
      var groupView = {
        steps: [{ index: 0, planIndex: 1, title: '分组', status: 'running', percent: 50, percentSource: 'model', nodeIds: ['r1', 'r2', 'r3'], nodeCount: 3, groups: [] }],
        nodes: [
          { id: 'r1', stepIndex: 0, kind: 'tool', tool: 'read', title: 'read a', detail: '', files: [], resultHead: '', error: '', at: T0 },
          { id: 'r2', stepIndex: 0, kind: 'tool', tool: 'read', title: 'read b', detail: '', files: [], resultHead: '', error: '', at: T0 + 1000 },
          { id: 'r3', stepIndex: 0, kind: 'tool', tool: 'read', title: 'read c', detail: '', files: [], resultHead: '', error: '', at: T0 + 2000 },
        ],
        plan: null,
        counts: { steps: 1, nodes: 3, running: 1, completed: 0 },
      };
      function renderGroup() {
        var gprefs = T.applyPrefsPatch(T.defaultPrefs(), { selectedStep: 0 });
        var gmodel = T.buildModel(groupView, gprefs, T0 + 5000);
        var gtree = T.renderFlowColumn(mountH, gmodel, say, { onToggleGroup: function (key) {
          var at = groupState.expanded.indexOf(key);
          if (at >= 0) groupState.expanded.splice(at, 1); else groupState.expanded.push(key);
          renderGroup();
        } }, { stepIndex: 0, expanded: groupState.expanded, showAll: true, selectedNode: null, closedBranches: [] });
        groupHost.innerHTML = '';
        groupHost.appendChild(mount(gtree));
      }
      var mountH = function (type, props) { return { type: type, props: props || {}, children: [].slice.call(arguments, 2) }; };
      renderGroup();
      var groupTriEl = groupHost.querySelector('.wf-tri');
      var groupCard = groupHost.querySelector('.wf-group-head');
      if (!groupTriEl || !groupCard) throw new Error('the folded run rendered no triangle');
      var gtr = groupTriEl.getBoundingClientRect();
      var gcr = groupCard.getBoundingClientRect();
      report.group = {
        tag: groupTriEl.tagName.toLowerCase(),
        width: round(gtr.width),
        height: round(gtr.height),
        rowHeight: round(gcr.height),
        sameTop: Math.abs(gtr.top - gcr.top) <= 1,
        sameBottom: Math.abs(gtr.bottom - gcr.bottom) <= 1,
        before: groupTriEl.getAttribute('aria-expanded'),
        controls: groupTriEl.getAttribute('aria-controls'),
        text: groupTriEl.textContent,
        membersBefore: groupHost.querySelectorAll('.wf-group-body .wf-node').length,
      };
      groupTriEl.click();
      var groupTriAfter = groupHost.querySelector('.wf-tri');
      report.group.after = groupTriAfter.getAttribute('aria-expanded');
      report.group.afterText = groupTriAfter.textContent;
      report.group.membersAfter = groupHost.querySelectorAll('.wf-group-body .wf-node').length;
      report.group.bodyId = (function () {
        var body = groupHost.querySelector('.wf-group-body');
        return body ? body.getAttribute('id') : null;
      })();
    } catch (error) {
      report.error = String(error && error.stack ? error.stack : error);
    }
    var pre = document.createElement('pre');
    pre.id = 'wf-tri-measure';
    pre.textContent = JSON.stringify(report);
    document.body.appendChild(pre);
  }, 250);
});
`;

/* a page that mounts the real renderer with FIXED stamps and measures the second
   line in a real layout engine — the recorded live view carries no `lastEstimateAt` (it
   predates the field), so the "both halves at once" case can only be proven here. */
const timingMeasureScript = `
window.addEventListener('load', function () {
  window.setTimeout(function () {
    var report = { error: '', rows: [], narrow: null };
    function round(n) { return Math.round(n * 100) / 100; }
    try {
      var definition = window.__wfDef;
      if (!definition) throw new Error('bundle not captured');
      var T = definition.factory(function (name) {
        if (name === 'react') return { createElement: function (type, props) { return { type: type, props: props || {}, children: [].slice.call(arguments, 2) }; } };
        throw new Error('unexpected require: ' + name);
      }).__test;

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

 // Fixed stamps: the renderer must be a pure function of these, never of the wall clock.
      var NOW = 1792000000000;
      var view = {
        asOf: NOW, task: 'timing measure',
        steps: [
          { index: 0, planIndex: 1, title: '两段并存', status: 'running', percent: 62, percentSource: 'baseline', startedAt: NOW - 600000, lastEstimateAt: NOW - 180000, nodeIds: [], nodeCount: 0, groups: [] },
          { index: 1, planIndex: 2, title: '无时间戳', status: 'running', percent: 50, percentSource: 'model', startedAt: NOW - 300000, lastEstimateAt: 0, nodeIds: [], nodeCount: 0, groups: [] },
          { index: 2, planIndex: 3, title: '已完工', status: 'done', percent: 100, percentSource: 'closed', startedAt: NOW - 900000, lastEstimateAt: NOW - 120000, nodeIds: [], nodeCount: 0, groups: [] },
          { index: 3, planIndex: 4, title: '未开始', status: 'pending', percent: 42, percentSource: 'model', startedAt: 0, lastEstimateAt: NOW - 60000, nodeIds: [], nodeCount: 0, groups: [] }
        ],
        nodes: [], plan: null,
        counts: { steps: 4, nodes: 0, running: 2, completed: 1 }
      };
      var say = T.makeSay(undefined);
      var actions = { onSelectStep: function () {}, onStepInfo: function () {}, onToggleGroup: function () {} };
      var host = document.getElementById('wf-timing-host');
      function render(prefs) {
        var model = T.buildModel(view, prefs, NOW);
        var tree = T.renderPanel(model, prefs, say, actions, {
          settingsOpen: false, status: 'live', error: '', rev: 1, endpoint: '/x', nodeTotal: 0,
          flow: null, stepDetail: null, motion: 'css', idle: true
        });
        host.innerHTML = '';
        host.appendChild(mount(tree));
        return model;
      }
      render(T.defaultPrefs());

      var items = [].slice.call(host.querySelectorAll('.wf-unit'));
      report.rows = items.map(function (item) {
        var dock = item.querySelector('.wf-prog-dock');
        var row = item.querySelector('.wf-prog-row');
        var sub = item.querySelector('.wf-prog-sub');
        var ago = item.querySelector('.wf-prog-ago');
        var eta = item.querySelector('.wf-prog-eta');
        var card = item.querySelector('.wf-unit-card');
        var cr = card ? card.getBoundingClientRect() : null;
        var sr = sub ? sub.getBoundingClientRect() : null;
        var rr = row ? row.getBoundingClientRect() : null;
        return {
          title: (item.querySelector('.wf-unit-title') || {}).textContent || null,
          timing: dock ? dock.getAttribute('data-timing') : null,
          agoText: ago ? ago.textContent : null,
          etaText: eta ? eta.textContent : null,
          agoTitle: ago ? ago.getAttribute('title') : null,
          etaTitle: eta ? eta.getAttribute('title') : null,
          subH: sr ? round(sr.height) : null,
          subWrapped: sr ? sr.height > 14 : false,
          subOverlapsTrack: !!(sr && rr && sr.top < rr.bottom - 0.01),
          subBeyondCard: !!(sr && cr && sr.right > cr.right + 0.5),
          subUnderRow: !!(sr && rr && sr.top >= rr.bottom - 0.01),
          sepCount: item.querySelectorAll('.wf-prog-sep').length,
          trackW: (function () {
            var t = item.querySelector('.wf-prog-track');
            return t ? round(t.getBoundingClientRect().width) : null;
          })()
        };
      });

 // the ETA wording must be gone from the RENDERED page, not just from the rail: a sloppy
 // string could survive in a title/aria attribute and only the live DOM can prove it is not there.
      report.pageTextHasEta = host.textContent.indexOf('还剩') !== -1;
      report.etaNodeCount = host.querySelectorAll('.wf-prog-eta').length;

 // Narrow container: only the first line may exist.
      var narrowPrefs = T.applyPrefsPatch(T.defaultPrefs(), { detail: 'title' });
      render(narrowPrefs);
      var narrowItem = host.querySelector('.wf-step-item');
      report.narrow = {
        subLines: host.querySelectorAll('.wf-prog-sub').length,
        percent: (function () {
          var l = host.querySelector('.wf-prog-label');
          return l ? l.textContent : null;
        })(),
        dockH: (function () {
          var d = host.querySelector('.wf-prog-dock');
          return d ? round(d.getBoundingClientRect().height) : null;
        })()
      };
    } catch (error) {
      report.error = String(error && error.stack ? error.stack : error);
    }
    var pre = document.createElement('pre');
    pre.id = 'wf-timing-measure';
    pre.textContent = JSON.stringify(report);
    document.body.appendChild(pre);
  }, 250);
});
`;
/* a page that MOUNTS the real renderer FOUR times — no right page, the
   step page (which carries the persistent dock), a 620 px host, and the composer itself — and
   measures the entry button's real box (≥96×30) together with its pending badge, the 460 px right
   column, the dock pinned to the page's foot (and absent on the composer), and every unit card's
   rect in BOTH the closed and the open layout, so the horizontal re-centring of the centred unit
   list is a MEASURED number (DEV-01) rather than an opinion. */
const injectMeasureScript = `
window.addEventListener('load', function () {
  window.setTimeout(function () {
    var report = { error: '', closed: null, open: null, narrow: null, composer: null };
    function r(n) { return Math.round(n * 100) / 100; }
    try {
      var definition = window.__wfDef;
      if (!definition) throw new Error('bundle not captured');
      var T = definition.factory(function (name) {
        if (name === 'react') return { createElement: function (type, props) { return { type: type, props: props || {}, children: [].slice.call(arguments, 2) }; } };
        throw new Error('unexpected require: ' + name);
      }).__test;

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

      var say = T.makeSay(undefined);
      var actions = { onSelectStep: function () {}, onStepInfo: function () {}, onToggleGroup: function () {}, onToggleInject: function () {}, onInjectText: function () {}, onInjectCancel: function () {}, onInjectSend: function () {} };
      var host = document.getElementById('wf-inject-host');

 // A small synthetic view: 4 steps and no nodes, so the geometry is about the PAGE, the
 // 460 px column and the DOCK, not about a 35-node flow. Fixed stamps — no wall clock
 // anywhere. Two injection rows (one already taken, one still waiting) so the badge and the
 // dock's status word are measured from the MODEL instead of being faked in the DOM.
      var NOW = 1792000000000;
      var view = {
        asOf: NOW, task: 'inject measure',
        steps: [
          { index: 0, planIndex: 1, title: '第一步', status: 'done', percent: 100, percentSource: 'closed', startedAt: NOW - 900000, lastEstimateAt: NOW - 600000, nodeIds: [], nodeCount: 0, groups: [] },
          { index: 1, planIndex: 2, title: '第二步', status: 'running', percent: 62, percentSource: 'baseline', startedAt: NOW - 600000, lastEstimateAt: NOW - 180000, nodeIds: [], nodeCount: 0, groups: [] },
          { index: 2, planIndex: 3, title: '第三步', status: 'pending', percent: null, percentSource: 'none', startedAt: 0, lastEstimateAt: 0, nodeIds: [], nodeCount: 0, groups: [] },
          { index: 3, planIndex: 4, title: '第四步', status: 'pending', percent: null, percentSource: 'none', startedAt: 0, lastEstimateAt: 0, nodeIds: [], nodeCount: 0, groups: [] }
        ],
        nodes: [], plan: null,
        counts: { steps: 4, nodes: 0, running: 1, completed: 1 },
        injects: [
          { id: 'in-picked', at: NOW - 9000, text: '已被接下的一句', pickedUp: true, canceled: false },
          { id: 'in-pending', at: NOW - 1000, text: '待拾取的一句', pickedUp: false, canceled: false }
        ]
      };

 // kind: 'none' | 'step' | 'inject'. The right page is built from the SAME model the
 // renderer is given, so the page spec can never disagree with the chain.
      function render(kind) {
        var model = T.buildModel(view, T.defaultPrefs(), NOW);
        var right = null;
        if (kind === 'step') right = { kind: 'step', stepIndex: 0, unit: model.page.units[0], stepDetail: model.detail, openType: null, scopeStep: 0 };
        if (kind === 'inject') right = { kind: 'inject', stepIndex: null, openType: null, unit: null, stepDetail: null };
        var tree = T.renderPanel(model, T.defaultPrefs(), say, actions, {
          settingsOpen: false, status: 'live', error: '', rev: 1, endpoint: '/x', nodeTotal: 0,
          motion: 'css', idle: true, asOf: NOW,
          right: right,
          injectState: 'idle', injectText: '', injectReason: '', sessionId: 'session-1'
        });
        host.innerHTML = '';
        host.appendChild(mount(tree));
        return tree;
      }

      function boxes() {
        function rect(sel) { var el = host.querySelector(sel); return el ? el.getBoundingClientRect() : null; }
        function css(sel, prop) { var el = host.querySelector(sel); return el ? window.getComputedStyle(el)[prop] : null; }
        function attr(sel, name) { var el = host.querySelector(sel); return el ? el.getAttribute(name) : null; }
        function box(sel) {
          var b = rect(sel);
          return b ? { w: r(b.width), h: r(b.height), left: r(b.left), right: r(b.right), top: r(b.top), bottom: r(b.bottom) } : null;
        }
        return {
          bodyW: (function () { var b = rect('.wf-body'); return b ? r(b.width) : null; })(),
          bodyRight: (function () { var b = rect('.wf-body'); return b ? r(b.right) : null; })(),
          page: box('.wf-page'),
          right: box('.wf-right'),
          scroll: box('.wf-right-scroll'),
          dock: box('.wf-inject-dock'),
          dockCount: host.querySelectorAll('.wf-inject-dock').length,
          dockInputTag: (function () { var el = host.querySelector('[data-dsh-workflow-map="inject-dock-text"]'); return el ? el.tagName.toLowerCase() : null; })(),
          dockSendTag: (function () { var el = host.querySelector('[data-inject="dock-send"]'); return el ? el.tagName.toLowerCase() : null; })(),
          dockSendReady: (function () { var el = host.querySelector('[data-inject="dock-send"]'); return el ? el.getAttribute('data-ready') : null; })(),
          dockState: (function () { var el = host.querySelector('.wf-inject-dock-state'); return el ? el.getAttribute('data-status') : null; })(),
          dockStateText: (function () { var el = host.querySelector('.wf-inject-dock-state'); return el ? el.textContent : null; })(),
          composerCount: host.querySelectorAll('.wf-inject').length,
          composerAreaTag: (function () { var el = host.querySelector('[data-dsh-workflow-map="inject-text"]'); return el ? el.tagName.toLowerCase() : null; })(),
          composerAreaPlaceholder: (function () { var el = host.querySelector('[data-dsh-workflow-map="inject-text"]'); return el ? el.getAttribute('placeholder') : null; })(),
          composerSendDisabled: (function () { var el = host.querySelector('[data-inject="send"]'); return el ? el.disabled === true : null; })(),
          composerCounter: (function () { var el = host.querySelector('.wf-inject-count'); return el ? el.textContent : null; })(),
          pageOverflow: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight)),
 // The entry button: its own box, its pending badge, and the ‒ beside it for comparison.
          toggle: box('[data-dsh-workflow-map="inject-toggle"]'),
          toggleRadius: css('[data-dsh-workflow-map="inject-toggle"]', 'borderTopLeftRadius'),
          pendingCount: attr('[data-dsh-workflow-map="inject-toggle"]', 'data-pending-count'),
          badgeCount: host.querySelectorAll('.wf-inject-badge').length,
          badge: box('.wf-inject-badge'),
          badgeText: (function () { var el = host.querySelector('.wf-inject-badge'); return el ? el.textContent : null; })(),
          collapse: box('.wf-btns .wf-btn'),
          collapseRadius: css('.wf-btns .wf-btn', 'borderTopLeftRadius'),
 // Every unit card's position, so a displacement is a number rather than an opinion.
          cards: [].slice.call(host.querySelectorAll('.wf-unit')).map(function (card) {
            var b = card.getBoundingClientRect();
            return { index: card.getAttribute('data-step-index'), left: r(b.left), top: r(b.top), width: r(b.width) };
          })
        };
      }

 // 1. no right page at all — the baseline every displacement is measured against.
      render('none');
      report.closed = boxes();
 // 2. the step page (kind "step"): the dock must be there, at its foot.
      render('step');
      report.open = boxes();
 // Pair each open card with the closed one of the same index.
      var closedByIndex = {};
      report.closed.cards.forEach(function (c) { closedByIndex[c.index] = c; });
      report.open.cards.forEach(function (c) {
        var was = closedByIndex[c.index];
        c.leftClosed = was ? was.left : null;
        c.topClosed = was ? was.top : null;
      });
 // 3. narrow: the same step page in a 620 px host. The stacking rule is a CONTAINER query
 // on .wf-card, so narrowing the host is exactly the condition the CSS reads — a media
 // query would have needed a second browser run at a different viewport.
      host.style.width = '620px';
      render('step');
      report.narrow = boxes();
      host.style.width = '';
 // 4. the composer itself: the dock must NOT be repeated, and the full form must be there.
      render('inject');
      report.composer = boxes();
    } catch (error) {
      report.error = String(error && error.stack ? error.stack : error);
    }
    var pre = document.createElement('pre');
    pre.id = 'wf-inject-measure';
    pre.textContent = JSON.stringify(report);
    document.body.appendChild(pre);
  }, 250);
});
`;
const files = [
  ['panel-dark.html', page(toHtml(expanded), DARK_TOKENS, 'workflow-map panel (fallback palette)')],
  ['panel-light.html', page(toHtml(expanded), LIGHT_TOKENS, 'workflow-map panel (light tokens)')],
  ['capsule-dark.html', page(toHtml(collapsed), DARK_TOKENS, 'workflow-map capsule')],
  ['panel-measure.html', page(toHtml(expanded), DARK_TOKENS, 'workflow-map measure', measureScript)],
  ['panel-flow.html', page(toHtml(capFlowTree), DARK_TOKENS, 'workflow-map flow (60-node window)', bottomShot)],
  ['panel-flow-groups.html', page(toHtml(groupFlowTree), DARK_TOKENS, 'workflow-map flow (folded run expanded)', groupShot)],
  ['panel-flow-all.html', page(toHtml(allFlowTree), DARK_TOKENS, 'workflow-map flow (all 300 nodes)')],
  ['panel-flow-measure.html', page(toHtml(capFlowTree), DARK_TOKENS, 'workflow-map flow measure', flowMeasure)],
  ['panel-flow-groups-measure.html', page(toHtml(groupFlowTree), DARK_TOKENS, 'workflow-map fold measure', flowMeasure)],
  ['panel-flow-all-measure.html', page(toHtml(allFlowTree), DARK_TOKENS, 'workflow-map all-nodes measure', flowMeasure)],
  ['planning-dark.html', page(toHtml(planning), DARK_TOKENS, 'workflow-map planning')],
 // a page whose only job is to MEASURE the disclosure triangle's hit band and
 // prove a real click flips aria-expanded. Same real bundle + real CSS as the shots above.
  ['panel-tri-measure.html', triPage(toHtml(expanded), DARK_TOKENS, triMeasureScript)],
 // the rail's second line, measured with fixed stamps (the recorded live view
 // predates `lastEstimateAt`, so only a synthetic view can prove both halves at once).
  ['panel-timing-measure.html', mountPage(DARK_TOKENS, 'wf-timing-host', 'workflow-map timing measure', timingMeasureScript)],
 // the split, measured in a live layout engine — the ⇄'s box against the
 // two buttons beside it, the two columns' geometry, and the one acceptance criterion a
 // screenshot can only eyeball: the LEFT column does not MOVE.
  ['panel-inject-measure.html', mountPage(DARK_TOKENS, 'wf-inject-host', 'workflow-map inject measure', injectMeasureScript)],
];
for (const [name, html] of files) {
  fs.writeFileSync(path.join(OUT, name), html, 'utf8');
  process.stdout.write(`wrote evidence/preview/${name} (${Buffer.byteLength(html, 'utf8')} bytes)\n`);
}
process.stdout.write(`model: ${model.steps.length} steps / ${model.flow.nodes.length} nodes / ${model.progress.percent}%\n`);
process.stdout.write(`flow pages: cap(${capModel.flow.nodes.length}) · groups(${groupModel.flow.nodes.length}) · all(${capModel.flow.nodes.length})\n`);
