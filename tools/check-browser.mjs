#!/usr/bin/env node
// tools/check-browser.mjs — run the SAME browser-side assertions in Edge AND Chrome and require the
// two engines to agree, item by item.
//
//   node tools\check-browser.mjs                 # both engines, the default
//   node tools\check-browser.mjs --browser edge  # one engine
//   node tools\check-browser.mjs --browser chrome
//
// WHY "works in Edge" is not the answer. Every browser measurement this repo ever took ran in Edge
// (tools/cdp-dump.mjs listed only msedge.exe; tools/measure-*.ps1 name Edge paths in their comments).
// Two Chromium-based engines still differ in which CSS values survive their parser, in what
// prefers-reduced-motion defaults to, and in scrollbar and font metrics — and those differences are
// invisible until someone opens the panel in the other one. So the judge is not "it renders"; it is
// "the same list of assertions passes in both, with the same meanings".
//
// WHAT IT BUILDS. A single self-contained page (no server, no network) that:
//   1. loads the built client.js behind a fake `__ModuleLoader__`,
//   2. calls the bundle's own factory with a fake `react`, takes its `__test` seam,
//   3. builds the model and renders the real panel tree, mounted into the live DOM,
//   4. puts the bundle's own stylesheet into a <style> so the engine parses it,
//   5. writes every fact it learned into <pre id="wf-verdict"> as JSON.
// The page is then opened by tools/cdp-dump.mjs in each engine and the DOM dump is parsed here.
//
// THE VERDICT IS THE ASSERTION SET, NOT JUST THE BOOLEANS. Two engines can both report PASS while
// looking at different things; so the check compares the assertion NAMES as well, and reports any
// name that appears in one engine and not the other as a failure. Measured values (rule counts,
// radii, widths) are printed side by side with their tolerances for a human to read.
//
// Exit 0 only when: every assertion passed in every engine asked for, AND the assertion name sets
// are identical. Anything else exits 1 with the failing item printed.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const HERE = import.meta.dirname;
const PLUGIN = path.resolve(HERE, "..");

// --- arguments -----------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 || at + 1 >= argv.length ? fallback : argv[at + 1];
};
const which = flag("browser", "both");
if (!["edge", "chrome", "both"].includes(which)) {
  console.error(`--browser must be edge | chrome | both (got "${which}")`);
  process.exit(2);
}

const KNOWN = {
  edge: ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"],
  chrome: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean),
};
const engines = (which === "both" ? ["edge", "chrome"] : [which]).map((name) => ({
  name,
  exe: KNOWN[name].find((candidate) => existsSync(candidate)) || "",
}));
for (const engine of engines) {
  if (engine.exe === "") {
    console.error(`no ${engine.name} binary found; tried ${KNOWN[engine.name].join(", ")}`);
    process.exit(3);
  }
}

// --- the page ------------------------------------------------------------------------------
const clientPath = path.join(PLUGIN, "client.js");
if (!existsSync(clientPath)) {
  console.error(`client.js missing at ${clientPath} — run \`node tools/build-client.mjs\` first`);
  process.exit(2);
}
const client = readFileSync(clientPath, "utf8");
const T0 = 1792000000000;

// A view in the shape src/fold.mjs buildView publishes, carrying every state the rail must draw
// differently: a closed step, a self-reported number, a time-baseline number, a WAITING step with
// no number, and a step that has not started. If all five render, the data path holds end to end.
const VIEW = {
  steps: [
    { index: 0, planIndex: 1, title: "已完成的一步", status: "done", percent: 100, percentSource: "closed", awaitingNextTurn: false, nodeIds: ["n1"], nodeCount: 1, lastEstimateAt: T0, startedAt: T0 - 60000, endedAt: T0 },
    { index: 1, planIndex: 2, title: "自报进度的一步", status: "running", percent: 62, percentSource: "model", awaitingNextTurn: false, nodeIds: ["n2"], nodeCount: 1, lastEstimateAt: T0, startedAt: T0 - 30000 },
    { index: 2, planIndex: 3, title: "时间基线的一步", status: "running", percent: 45, percentSource: "baseline", awaitingNextTurn: false, nodeIds: ["n3"], nodeCount: 1, lastEstimateAt: T0, startedAt: T0 - 20000 },
    { index: 3, planIndex: 4, title: "等待下一回合的一步", status: "running", percent: null, percentSource: "none", awaitingNextTurn: true, nodeIds: [], nodeCount: 0, lastEstimateAt: 0, startedAt: T0 - 10000 },
    { index: 4, planIndex: 5, title: "还没开始的一步", status: "pending", percent: null, percentSource: "none", awaitingNextTurn: false, nodeIds: [], nodeCount: 0, lastEstimateAt: 0, startedAt: 0 },
  ],
  nodes: [
    { id: "n1", seq: 10, kind: "tool", tool: "read", title: "read src/fold.mjs", detail: "a path", files: ["C:\\repo\\src\\fold.mjs"], argsText: "", resultHead: "code", error: "", settled: true, at: T0 - 50000, durationMs: 120, key: "read:1", stepIndex: 0, groupId: "" },
    { id: "n2", seq: 11, kind: "tool", tool: "pwsh", title: "pwsh node tools/selftest-fold.mjs", detail: "run tests", files: [], argsText: "", resultHead: "PASS", error: "", settled: true, at: T0 - 20000, durationMs: 2400, key: "pwsh:1", stepIndex: 1, groupId: "" },
    { id: "n3", seq: 12, kind: "tool", tool: "grep", title: "grep percentFor", detail: "search", files: [], argsText: "", resultHead: "1 match", error: "", settled: false, at: T0 - 10000, durationMs: null, key: "grep:1", stepIndex: 2, groupId: "" },
  ],
  todos: [
    { content: "1. 已完成的一步", status: "completed" },
    { content: "2. 自报进度的一步", status: "in_progress" },
    { content: "3. 时间基线的一步", status: "pending" },
    { content: "4. 等待下一回合的一步", status: "pending" },
    { content: "5. 还没开始的一步", status: "pending" },
  ],
  plan: {
    phase: "executing", task: "浏览器对等检测", taskTitle: "浏览器对等检测",
    steps: [
      { index: 1, title: "已完成的一步", file: "a.md" }, { index: 2, title: "自报进度的一步", file: "b.md" },
      { index: 3, title: "时间基线的一步", file: "c.md" }, { index: 4, title: "等待下一回合的一步", file: "d.md" },
      { index: 5, title: "还没开始的一步", file: "e.md" },
    ],
    statuses: { "1": "completed", "2": "in_progress", "3": "in_progress", "4": "in_progress", "5": "pending" },
    anchorSeqs: {}, skipped: [], stepIndex: null, stepReports: [], asOfMtime: 0, sourcePath: "",
  },
  asOf: T0,
  running: true,
  counts: { steps: 5, nodes: 3, running: 3, completed: 1 },
};

const TOKENS = `
  :root{
    --mock-bg:#0f1116; --mock-fg:#e9ecf3;
    --dsw-alias-bg-base:#0b0d12; --dsw-alias-bg-layer-1:#232733; --dsw-alias-bg-layer-2:#282d3a;
    --dsw-alias-bg-overlay:#2c3140; --dsw-alias-border-l1:rgba(255,255,255,.10);
    --dsw-alias-border-l2:rgba(255,255,255,.22); --dsw-alias-brand-primary:#5b8cff;
    --dsw-alias-label-primary:#e9ecf3; --dsw-alias-label-secondary:#9aa3b2;
    --dsw-alias-label-tertiary:#7d8798; --dsw-alias-state-success-primary:#45c07a;
    --dsw-alias-state-warn-primary:#e0a13a; --dsw-alias-state-error-primary:#e85a5a;
    --dsw-alias-state-idle-primary:#7d8798;
  }
  html,body{margin:0;background:var(--mock-bg);color:var(--mock-fg);
    font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif}
  #wf-slot{padding:18px;max-width:680px}
  #wf-verdict{position:fixed;right:8px;top:8px;width:430px;max-height:96vh;overflow:auto;
    background:#11141b;border:1px solid #2a2f3a;border-radius:8px;padding:8px;font-size:11px;
    white-space:pre-wrap;word-break:break-word}
`;

const PAGE_SCRIPT = String.raw`
(function () {
  var VIEW = __VIEW__;
  var NOW = __NOW__;
  var out = document.getElementById('wf-verdict');
  var facts = { ua: navigator.userAgent, ok: true, checks: [], style: {}, security: {}, errors: [] };

  function check(name, pass, detail) {
    facts.checks.push({ name: name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
    if (!pass) facts.ok = false;
  }
  function fail(where, error) {
    facts.ok = false;
    facts.errors.push(where + ': ' + (error && error.message ? error.message : String(error)));
  }
  function finish() {
    facts.failed = facts.checks.filter(function (c) { return !c.pass; }).map(function (c) { return c.name; });
    out.textContent = 'WFC_VERDICT ' + JSON.stringify(facts, null, 2) + ' WFC_END';
    document.title = facts.ok ? 'WFC-PASS' : 'WFC-FAIL';
  }

  // --- 1. the bundle registers under THIS engine -------------------------------------------
  var definition = window.__wfDef;
  if (!definition) { fail('bundle', 'client.js did not call __ModuleLoader__.load'); return finish(); }
  check('bundle.registers', true, 'ModuleLoader.load called');
  // The bundle registers { id, factory } — "id" is the key the host loader reads.
  check('bundle.hasId', typeof definition.id === 'string' && definition.id.length > 0, definition.id);
  check('bundle.idIsOurs', definition.id === 'dsh-workflow-map', definition.id);
  check('bundle.hasFactory', typeof definition.factory === 'function', typeof definition.factory);

  var T, stylesheet = '';
  try {
    T = definition.factory(function (name) {
      if (name === 'react') {
        return { createElement: function (type, props) {
          return { type: type, props: props || {}, children: [].slice.call(arguments, 2) };
        } };
      }
      throw new Error('unexpected require: ' + name);
    }).__test;
  } catch (error) { fail('factory', error); return finish(); }
  check('bundle.factoryRuns', !!T && typeof T.buildModel === 'function', !!T && Object.keys(T).length + ' test exports');

  // --- 2. the stylesheet, parsed by THIS engine --------------------------------------------
  // wfUseStyle() is a React effect and does not run for a pure tree, so the sheet is taken from the
  // bundle's own export and handed to the engine explicitly; the rule count that survives IS the
  // engine verdict on it.
  try {
    stylesheet = T.css();
    check('css.exported', typeof stylesheet === 'string' && stylesheet.length > 1000, stylesheet.length + ' chars');
  } catch (error) { fail('css()', error); }
  var styleEl = document.createElement('style');
  styleEl.id = 'wfc-probe-css';
  styleEl.textContent = stylesheet;
  document.head.appendChild(styleEl);
  var parsed = 0;
  try { parsed = styleEl.sheet ? styleEl.sheet.cssRules.length : 0; } catch (error) { parsed = -1; }
  facts.style.ruleCount = parsed;
  check('css.engineParsesIt', parsed > 20, parsed + ' rule(s) parsed');
  check('css.awaitingBlock', stylesheet.indexOf('[data-awaiting=') !== -1, 'the waiting-state block is present');
  check('css.motionReduced', stylesheet.indexOf('prefers-reduced-motion') !== -1, 'the reduced-motion block is present');
  check('css.staticAwaiting', /animation\s*:\s*none/.test(stylesheet), 'the animation:none (static) rule is present');

  // --- 3. the panel tree mounts in THIS engine's DOM ---------------------------------------
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function mount(node) {
    if (node === null || node === undefined || node === false) return null;
    if (typeof node === 'string' || typeof node === 'number') return document.createTextNode(String(node));
    if (Array.isArray(node)) {
      var frag = document.createDocumentFragment();
      node.forEach(function (child) { var made = mount(child); if (made) frag.appendChild(made); });
      return frag;
    }
    var el = node.type === 'svg' ? document.createElementNS(SVG_NS, 'svg') : document.createElement(node.type);
    Object.keys(node.props || {}).forEach(function (name) {
      var value = node.props[name];
      if (value === undefined || value === null || typeof value === 'function' || name === 'children') return;
      if (name === 'className') { el.setAttribute('class', value); return; }
      if (name === 'style' && typeof value === 'object') {
        Object.keys(value).forEach(function (k) { el.style[k] = value[k]; });
        return;
      }
      el.setAttribute(name, String(value));
    });
    if (typeof node.props.onClick === 'function') el.addEventListener('click', node.props.onClick);
    (node.children || []).forEach(function (child) { var made = mount(child); if (made) el.appendChild(made); });
    return el;
  }

  var prefs, say, model, tree, host;
  try {
    prefs = T.defaultPrefs();
    say = T.makeSay(undefined);
    model = T.buildModel(VIEW, prefs, NOW);
    tree = T.renderPanel(model, prefs, say, { onOpenStep: function () {}, onOpenType: function () {}, onStepInfo: function () {} },
      { settingsOpen: false, status: 'live', error: '', rev: 1, endpoint: '/x', nodeTotal: 0, motion: 'css', idle: false, asOf: model.asOf });
    host = document.getElementById('wf-slot');
    var mounted = mount(tree);
    if (!mounted) { fail('mount', 'renderPanel returned nothing mountable'); return finish(); }
    host.appendChild(mounted);
  } catch (error) { fail('render', error); return finish(); }

  check('model.builds', !!model && Array.isArray(model.steps), model && model.steps.length + ' rows');
  var units = host.querySelectorAll('.wf-unit');
  facts.style.unitCount = units.length;
  check('dom.mounts', units.length > 0, units.length + ' .wf-unit node(s)');
  check('dom.unitCount', units.length === VIEW.steps.length, units.length + ' vs ' + VIEW.steps.length + ' view steps');

  // --- 4. computed style: did the rules actually APPLY -------------------------------------
  var missing = [];
  var card = units[1] && units[1].querySelector('.wf-unit-card');
  var fill = units[1] && units[1].querySelector('.wf-prog-fill');
  if (card) {
    var cs = getComputedStyle(card);
    facts.style.cardRadius = cs.borderTopLeftRadius;
    facts.style.cardColor = cs.color;
    check('style.radiusApplied', parseFloat(cs.borderTopLeftRadius) > 0, cs.borderTopLeftRadius);
    check('style.colorResolved', cs.color !== '' && cs.color !== 'rgb(0, 0, 0)', cs.color);
  } else { missing.push('.wf-unit-card'); }
  if (fill) {
    var width = fill.getBoundingClientRect().width;
    facts.style.fillWidth = Math.round(width * 100) / 100;
    facts.style.fillAnimationName = getComputedStyle(fill).animationName;
    check('style.fillRendered', width > 0, facts.style.fillWidth + 'px');
  } else { missing.push('.wf-prog-fill'); }
  check('dom.railParts', missing.length === 0, missing.join(', ') || 'card + fill found');

  // The waiting row must exist AS a waiting row: the attribute and the words, not a number.
  var waitingUnit = units[3];
  facts.style.waitingAttribute = waitingUnit ? waitingUnit.getAttribute('data-awaiting') : null;
  var dock = waitingUnit && waitingUnit.querySelector('.wf-prog-dock');
  facts.style.waitingRailText = dock ? dock.textContent : null;
  check('dom.waitingRowRendered', !!dock, dock ? 'rail present' : 'rail missing');
  check('dom.waitingAttribute', facts.style.waitingAttribute === 'true', String(facts.style.waitingAttribute));
  check('dom.waitingSaysSo', !!dock && dock.textContent.indexOf('等待') !== -1, String(facts.style.waitingRailText));

  // --- 5. engine-level parser: which declarations survive ----------------------------------
  // A CSS value an engine rejects is dropped SILENTLY, which is exactly how a bundle that looks
  // right in one Chromium build falls apart in another. Declare, read back, compare.
  var probeEl = document.createElement('div');
  var rejected = [];
  var candidates = ['animation: wfFlow 1.6s linear infinite', 'background: conic-gradient(from 0deg, #5b8cff, #45c07a)',
    'border-radius: 10px', 'backdrop-filter: blur(6px)', 'gap: 6px', 'inset: 0', 'aspect-ratio: 1 / 1',
    'transition: opacity .2s ease', 'display: grid', 'place-items: center', 'mask-image: linear-gradient(90deg,#000,transparent)'];
  candidates.forEach(function (decl) {
    var at = decl.indexOf(':');
    var prop = decl.slice(0, at).trim();
    probeEl.style.cssText = '';
    probeEl.style.cssText = decl;
    var got = probeEl.style.getPropertyValue(prop) || (prop === 'background' ? probeEl.style.getPropertyValue('background-image') : '');
    if (!got) rejected.push(decl);
  });
  facts.style.declarationsTried = candidates.length;
  facts.style.declarationsRejected = rejected;
  check('engine.acceptsBundleStyles', rejected.length === 0, rejected.length ? rejected.join(' | ') : candidates.length + ' declarations accepted');

  // --- 6. security facts, measured not asserted -------------------------------------------
  // (a) no network: this page is file:// and must not fetch anything.
  try {
    var resources = performance.getEntriesByType('resource').filter(function (entry) {
      return entry.name.indexOf('wfc-probe') === -1;
    });
    facts.security.resourceEntries = resources.length;
    check('security.noNetwork', resources.length === 0, resources.length + ' resource entr(ies): ' + resources.slice(0, 3).map(function (e) { return e.name; }).join(', '));
  } catch (error) { check('security.noNetwork', false, String(error && error.message)); }

  // (b) no eval at runtime: a CSP-free file:// page would happily run one, so the page simply must
  // not contain a call. The static side of this is checked by the Node half of this tool.
  check('security.noInlineHandlers', document.querySelectorAll('[onclick],[onerror],[onload]').length === 0,
    document.querySelectorAll('[onclick],[onerror],[onload]').length + ' inline handler attribute(s)');

  // (c) style isolation: every rule the bundle ships must be scoped, or it can restyle the host.
  var unscoped = [];
  try {
    for (var si = 0; si < styleEl.sheet.cssRules.length; si += 1) {
      var rule = styleEl.sheet.cssRules[si];
      if (!rule.selectorText) continue;
      rule.selectorText.split(',').forEach(function (one) {
        var sel = one.trim();
        if (sel === '' || sel === ':root' || sel === 'html' || sel === 'body' || sel === '*') return;
        if (sel.indexOf('.wf-') === -1 && sel.indexOf('#dsh-workflow-map') === -1 && sel.indexOf('data-dsh-workflow-map') === -1) unscoped.push(sel);
      });
    }
  } catch (error) { unscoped.push('unreadable: ' + String(error && error.message)); }
  facts.security.unscopedSelectors = unscoped.slice(0, 8);
  check('security.stylesScoped', unscoped.length === 0, unscoped.length ? unscoped.slice(0, 5).join(' | ') : 'every selector is scoped');

  finish();
})();
`;

function buildPage() {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>browser parity probe</title>
<style>${TOKENS}</style>
</head><body>
<div id="wf-slot"></div><pre id="wf-verdict">(not run)</pre>
<script>window.__ModuleLoader__ = { load: function (definition) { window.__wfDef = definition; } };</script>
<script>${client}</script>
<script>${PAGE_SCRIPT.replace("__VIEW__", JSON.stringify(VIEW)).replace("__NOW__", String(T0))}</script>
</body></html>
`;
}

// --- static security scan (the Node half of §6) ----------------------------------------------
// Runs once, not per engine: these are properties of the SOURCE, not of a render.
const securityFindings = [];
(function staticSecurity() {
  const clientSource = client;
  // `new Function` / `eval` in the SHIPPED bundle. The build tool itself may use them; the bundle may
  // not. Any hit here is reported with a line number so it can be judged, not waved away.
  for (const [label, pattern] of [
    ["new Function", /\bnew\s+Function\s*\(/g],
    ["eval(", /(^|[^.\w])eval\s*\(/g],
    ['innerHTML', /\.innerHTML\s*=/g],
    ['outerHTML', /\.outerHTML\s*=/g],
    ['document.write', /document\.write\s*\(/g],
  ]) {
    const lines = clientSource.split("\n");
    const hits = [];
    lines.forEach((line, index) => {
      if (pattern.test(line)) hits.push(index + 1);
      pattern.lastIndex = 0;
    });
    securityFindings.push({ label, count: hits.length, lines: hits.slice(0, 10) });
  }
})();

// --- run one engine ---------------------------------------------------------------------------
const work = mkdtempSync(path.join(tmpdir(), "wf-parity-"));
const pagePath = path.join(work, "probe.html");
writeFileSync(pagePath, buildPage(), "utf8");
const pageUrl = `file:///${pagePath.replace(/\\/g, "/")}`;

function runEngine(engine) {
  const dumpPath = path.join(work, `${engine.name}.html`);
  const result = spawnSync(
    process.execPath,
    [path.join(HERE, "cdp-dump.mjs"), dumpPath, pageUrl, "1400", "900", "9000", engine.exe],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return { name: engine.name, exe: engine.exe, ok: false, error: `cdp-dump exited ${result.status}: ${(result.stderr || "").trim()}`, checks: [], style: {}, security: {} };
  }
  if (!existsSync(dumpPath)) return { name: engine.name, exe: engine.exe, ok: false, error: "cdp-dump wrote no dump", checks: [], style: {}, security: {} };
  const dom = readFileSync(dumpPath, "utf8");
  const match = dom.match(/WFC_VERDICT\s*(\{[\s\S]*?\})\s*WFC_END/);
  if (!match) return { name: engine.name, exe: engine.exe, ok: false, error: "the verdict block never appeared (page error?)", checks: [], style: {}, security: {} };
  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch (error) {
    return { name: engine.name, exe: engine.exe, ok: false, error: `unparsable verdict: ${error.message}`, checks: [], style: {}, security: {} };
  }
  return { name: engine.name, exe: engine.exe, ok: parsed.ok === true, error: "", checks: parsed.checks || [], style: parsed.style || {}, security: parsed.security || {}, ua: parsed.ua, errors: parsed.errors || [] };
}

const results = engines.map(runEngine);

// --- compare, then report --------------------------------------------------------------------
const namesOf = (engine) => engine.checks.map((check) => check.name);
const reference = results[0];
let parity = true;
const parityNotes = [];
for (const engine of results.slice(1)) {
  const onlyReference = namesOf(reference).filter((name) => !namesOf(engine).includes(name));
  const onlyEngine = namesOf(engine).filter((name) => !namesOf(reference).includes(name));
  if (onlyReference.length || onlyEngine.length) {
    parity = false;
    parityNotes.push(
      `${reference.name} vs ${engine.name}: assertion sets differ` +
        (onlyReference.length ? ` | only in ${reference.name}: ${onlyReference.join(", ")}` : "") +
        (onlyEngine.length ? ` | only in ${engine.name}: ${onlyEngine.join(", ")}` : ""),
    );
  }
  for (const a of reference.checks) {
    const b = engine.checks.find((check) => check.name === a.name);
    if (b && a.pass !== b.pass) {
      parity = false;
      parityNotes.push(`${a.name}: ${reference.name} ${a.pass ? "PASS" : "FAIL"} but ${engine.name} ${b.pass ? "PASS" : "FAIL"}`);
    }
  }
}

console.log(`\nbrowser parity check — engines: ${results.map((engine) => `${engine.name} (${path.basename(engine.exe)})`).join(", ")}`);

for (const engine of results) {
  console.log(`\n=== ${engine.name} ${engine.ua ? `· ${engine.ua.replace(/^.*?\)\s*/, "")}` : ""} ===`);
  if (engine.error) {
    console.log(`  ERROR  ${engine.error}`);
    continue;
  }
  const width = Math.max(...engine.checks.map((check) => check.name.length), 10);
  for (const check of engine.checks) {
    console.log(`  ${check.pass ? "PASS" : "FAIL"}  ${check.name.padEnd(width)}  ${check.detail}`);
  }
  console.log(`  ${engine.ok ? "all green" : "FAILED: " + engine.checks.filter((c) => !c.pass).map((c) => c.name).join(", ")}`);
}

if (results.length > 1) {
  console.log("\n=== measured values, engine by engine ===");
  const keys = new Set();
  for (const engine of results) Object.keys(engine.style || {}).forEach((key) => keys.add(key));
  for (const key of [...keys].sort()) {
    const row = results.map((engine) => `${engine.name}=${JSON.stringify(engine.style[key])}`);
    console.log(`  ${key.padEnd(22)} ${row.join("   ")}`);
  }
  console.log("\n=== parity ===");
  if (parity) console.log("  identical assertion set, and every shared assertion has the same outcome");
  else for (const note of parityNotes) console.log(`  DIFF  ${note}`);
}

console.log("\n=== static security scan of the shipped bundle ===");
for (const finding of securityFindings) {
  console.log(`  ${String(finding.count).padStart(3)}× ${finding.label}${finding.lines.length ? `   lines ${finding.lines.join(", ")}` : ""}`);
}

const runtimeSecurityOk = results.every((engine) => engine.error === "" && engine.checks.filter((c) => c.name.indexOf("security.") === 0).every((c) => c.pass));
const ok = results.every((engine) => engine.ok) && parity && runtimeSecurityOk;

console.log(
  ok
    ? `\nBROWSER PARITY PASS — ${results.map((engine) => engine.name).join(" and ")} agree on every assertion.`
    : "\nBROWSER PARITY FAIL — see the lines above.",
);

try {
  rmSync(work, { recursive: true, force: true });
} catch {
  /* windows lock; the temp dir is disposable */
}
process.exit(ok ? 0 : 1);
