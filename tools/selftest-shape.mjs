// shape self-check: asserts the bundle skeleton is internally consistent
// WITHOUT touching the profile. Run: node tools/selftest-shape.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const results = [];
const check = (id, pass, detail) => {
  results.push({ id, pass, detail });
};

// --- manifest -------------------------------------------------------------
const pkg = JSON.parse(read('package.json'));
const patch = read('cordis.patch.yml');
const client = read('client.js');
const host = read('index.js');
const zh = JSON.parse(read('locale/zh.json'));
const en = JSON.parse(read('locale/en.json'));

check('pkg.name', pkg.name === 'dsh-workflow-map', pkg.name);
check('pkg.type.module', pkg.type === 'module', pkg.type);
check('pkg.exports.dot', pkg.exports['.'] === './index.js', String(pkg.exports['.']));
check('pkg.exports.client', pkg.exports['./client'] === './client.js', String(pkg.exports['./client']));
check('pkg.exports.locale', pkg.exports['./locale/*.json'] === './locale/*.json', String(pkg.exports['./locale/*.json']));
check('pkg.exports.icon', pkg.exports['./icon'] === './icon.svg', String(pkg.exports['./icon']));
check('pkg.dsh.bundle.patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml', String(pkg.dsh?.bundle?.patch));
check('pkg.dsh.client.web', pkg.dsh?.client?.platform === 'web', String(pkg.dsh?.client?.platform));
check('pkg.dsh.client.immediately', pkg.dsh?.client?.immediately === true, String(pkg.dsh?.client?.immediately));

// files whitelist must cover every runtime file that exists
// Only SHIPPED runtime entries have to be in files[]. `tools/` (dev scripts), `evidence/`
// (acceptance evidence) and `*.bak` (rollback snapshots) are development-only by design.
const DEV_ONLY_ENTRIES = new Set(['tools', 'evidence']);
const existing = fs
  .readdirSync(ROOT)
  .filter((f) => !DEV_ONLY_ENTRIES.has(f) && !f.startsWith('.') && !f.endsWith('.bak'));
const whitelist = new Set(pkg.files);
// A top-level DIRECTORY is covered either by a bare entry (`docs`), by a glob (`locale/*.json`),
// or by naming EVERY file inside it (`docs/OPEN-SOURCE-GUIDE.md`). The last form is what the
// 2026-10-27 hotfix uses: `docs/` used to be shipped wholesale, which swept a personal
// publish-checklist and a hand-holding tutorial (both carrying this machine's absolute paths)
// into the tarball. Naming the file is STRICTER than naming the directory, so it must pass.
function coveredBy(f) {
  if (whitelist.has(f)) return true;
  if (f === 'locale') return whitelist.has('locale/*.json');
  let entries = [];
  try {
    const stat = fs.statSync(path.join(ROOT, f));
    if (!stat.isDirectory()) return false;
    entries = fs.readdirSync(path.join(ROOT, f)).filter((one) => !one.startsWith('.'));
  } catch {
    return false;
  }
  if (entries.length === 0) return false;
  return entries.every((one) => whitelist.has(`${f}/${one}`));
}
for (const f of existing) {
  const covered = coveredBy(f);
  check(`files.whitelist.${f}`, covered, covered ? 'listed' : 'MISSING from files[]');
}
check('files.whitelist.localeDir', whitelist.has('locale/*.json'), 'locale/*.json');
check('files.devOnlyExcluded', !whitelist.has('tools') && !whitelist.has('evidence'), 'dev artifacts are not shipped');
// --- patch ----------------------------------------------------------------
const insertMatch = patch.match(/^- insert:\s*$/m);
check('patch.single.insert', insertMatch !== null, 'top-level "- insert:"');
const rowMatches = [...patch.matchAll(/^\s*- id:\s*([A-Za-z0-9._-]+)\s*$/gm)].map((m) => m[1]);
check('patch.rowCount.1', rowMatches.length === 1, JSON.stringify(rowMatches));
check('patch.rowId', rowMatches[0] === 'workflow-map', rowMatches[0]);
check('patch.name', patch.includes("name: 'dsh-workflow-map'"), 'row name');
check('patch.no.config', !/\bconfig:/.test(patch), 'no config block yet');

// --- host half ------------------------------------------------------------
// index.js is the manifest's entry and, from on, a thin facade: the host half itself
// lives in lib/index.js (the drop point) and index.js re-exports it, so the installed
// manifest written at keeps pointing at the same specifier.
const hostImpl = read('lib/index.js');
check('host.facade.reexportsLib', /export \* from "\.\/lib\/index\.js";/.test(host), 'export * from ./lib/index.js');
check('host.facade.default', /export \{ default \} from "\.\/lib\/index\.js";/.test(host), 'default re-export');
check('host.name', /export const name = "workflow-map";/.test(hostImpl), 'export const name');
check('host.packageName', hostImpl.includes('packageName = "dsh-workflow-map"'), 'export const packageName');
check(
  'host.inject.services',
  /export const inject = \["sessionProjections", "sessions", "webServer", "agents"\];/.test(hostImpl),
  'inject: [sessionProjections, sessions, webServer, agents]',
);
check('host.apply.takesCtx', /export function apply\(ctx\)/.test(hostImpl), 'export function apply(ctx)');
check('host.registers', /const registry = ctx\.sessionProjections;/.test(hostImpl) && /registry\.register\(\{/.test(hostImpl), 'registry.register({');
check('host.projectionKey', /export const PROJECTION_KEY = "workflowView";/.test(hostImpl), 'projection key workflowView');
// The host half may import ONLY its own modules: the shared fold, the PAE plan reader and
// (from ) the HTTP view route, and (from the hot-inject step) `node:crypto` for the
// message id — a NODE BUILTIN, which is the one exception the rule allows: it resolves
// regardless of where the package is installed from, because it is not a package at all.
// No bare specifier: a third-party import would not be guaranteed to resolve.
const hostImportSpecs = [...hostImpl.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
check(
  'host.imports.ownModulesOnly',
  JSON.stringify(hostImportSpecs) === JSON.stringify(['../src/fold.mjs', '../src/orchestrator.mjs', '../src/route.js', 'node:crypto']),
  JSON.stringify(hostImportSpecs)
);
check('host.no.clock', !/Date\.now\(/.test(hostImpl), 'no wall-clock read on this path');
check('files.whitelist.src', pkg.files.includes('src'), 'src/ is shipped (fold.mjs lives there)');

// The screenshot declaration the catalog build reads. It must ship with the package
// (a path relative to package.json), list 1-8 existing images, and use repository
// relative paths — the rules awesome-dsh-plugin enforces on every submission.
check('files.whitelist.screenshotsJson', pkg.files.includes('screenshots.json'), 'screenshots.json is shipped');
{
  const shots = JSON.parse(read('screenshots.json'));
  const list = Array.isArray(shots) ? shots : Array.isArray(shots.screenshots) ? shots.screenshots : null;
  check('screenshots.len', Array.isArray(list) && list.length >= 1 && list.length <= 8, Array.isArray(list) ? list.length + ' images' : 'not a list');
  check(
    'screenshots.paths',
    Array.isArray(list) && list.every((p) => typeof p === 'string' && p !== '' && !p.startsWith('/') && !p.includes('..')),
    'every path is relative and stays inside the repository'
  );
  check(
    'screenshots.exist',
    Array.isArray(list) && list.every((p) => fs.existsSync(path.join(ROOT, p))),
    'every declared image exists'
  );
}
check('files.whitelist.lib', pkg.files.includes('lib'), 'lib/ is shipped (the host half lives there)');

// --- the HTTP view route -----------------------------------------
const routeSrc = read('src/route.js');
check('route.prefix', routeSrc.includes('export const ROUTE_PREFIX = "/dsh-workflow"'), 'route prefix');
check('route.endpoint', routeSrc.includes('export const STATE_ENDPOINT = "/state"'), 'state endpoint');
check('route.prefixSeat', /kind: "prefix"/.test(routeSrc), 'registered as a prefix route');
check('route.ifNoneMatch', routeSrc.includes('if-none-match'), 'If-None-Match / 304');
check('route.noStore', routeSrc.includes('no-store'), 'cache-control: no-store');
check('route.composeView', /export function composeView\(/.test(routeSrc), 'composeView is exported');
check('host.route.attached', /attachViewRoute\(ctx, registry\)/.test(hostImpl), 'apply() attaches the route');
check('host.route.snapshot', /registry\.snapshot\(session, \[PROJECTION_KEY\]\)/.test(hostImpl), 'the route reads the projection snapshot');
// --- the steer channel ---------------------------------
check('route.steerEndpoint', routeSrc.includes('export const STEER_ENDPOINT = "/steer"'), 'steer endpoint');
check('route.steerPath', routeSrc.includes('export const STEER_PATH ='), 'steer path as data');
check('route.allowPost', routeSrc.includes('const ALLOW = "GET, HEAD, POST, OPTIONS"'), 'POST is allowed');
check('route.steerTextLimit', routeSrc.includes('export const STEER_TEXT_LIMIT = 2000'), '2000-character bound');
check('route.bodyCeiling', /STEER_BODY_LIMIT = 64 \* 1024/.test(routeSrc), '64 KiB body ceiling');
check('route.steerDispatch', /handleSteerRequest\(req, res, method, steer, note\)/.test(routeSrc), 'the steer branch is dispatched');
check('host.steer.source', /export function makeSteerSource\(ctx\)/.test(hostImpl), 'makeSteerSource is exported for the self-test');
check('host.steer.usesAgents', /serviceOf\(ctx, "agents"\)/.test(hostImpl), 'steer resolves ctx.agents');
check('host.steer.callsSteer', /agent\.steer\(message\)/.test(hostImpl), 'it calls agent.steer, not followup');
check('host.steer.sourceKind', /kind: `plugin:\$\{packageName\}`/.test(hostImpl), 'source.kind is the producer-owned plugin:<name>, never an inherited user');
check('host.steer.notRunning', /status: 409/.test(hostImpl), 'a non-running session answers 409');
check('host.noCancel', !/agent\.cancel\(/.test(hostImpl), 'the steer channel never cancels a turn');
// --- the unsteer channel ----------------------------------
// The undo of that write: a route of its own, wired to the loop's own `inbox.remove`, and a
// browser half whose button exists for exactly one row state. The two halves are asserted
// together because a route without a button (or a button without a route) is the drift this file
// exists to catch.
check('route.unsteerEndpoint', routeSrc.includes('export const UNSTEER_ENDPOINT = "/unsteer"'), 'unsteer endpoint');
check('route.unsteerPath', routeSrc.includes('export const UNSTEER_PATH ='), 'unsteer path as data');
check('route.unsteerDispatch', /handleUnsteerRequest\(req, res, method, unsteer, note\)/.test(routeSrc), 'the unsteer branch is dispatched');
check('route.unsteerThreePaths404', routeSrc.includes('${STATE_PATH} | ${STEER_PATH} | ${UNSTEER_PATH}'), 'the 404 names all three endpoints');
check('host.steer.reportsId', /return \{ ok: true, messageId: message\.id \};/.test(hostImpl), 'steer reports the id it wrote');
check('host.unsteer.source', /export function makeUnsteerSource\(ctx\)/.test(hostImpl), 'makeUnsteerSource is exported for the self-test');
check('host.unsteer.usesAgents', /serviceOf\(ctx, "agents"\)/.test(hostImpl), 'unsteer resolves ctx.agents');
check('host.unsteer.callsRemove', /inbox\.remove\(messageId\)/.test(hostImpl), 'it calls agent.inbox.remove, not a second steer');
check('host.unsteer.missingInbox503', hostImpl.includes('the host exposes no inbox revoke API'), 'a host without inbox.remove answers 503');
check('host.unsteer.claimed409', hostImpl.includes('该注入已被会话接下或不存在'), 'an already-claimed message answers 409, not 500');
check('host.unsteer.notRunning409', hostImpl.includes('会话未在运行，热注入不可用'), 'the same live-session rule as /steer');
check('host.route.unsteerWired', /unsteer: makeUnsteerSource\(ctx\)/.test(hostImpl), 'the route seat is given the unsteer source');
check('host.selfCheck.unsteerRoute', /unsteerRoute: UNSTEER_PATH/.test(hostImpl), 'selfCheck exposes the third path as data');
check('host.selfCheck.threeRoutes', (hostImpl.match(/httpRoute:\$\{/g) || []).length === 3, 'all three endpoints are declared in selfCheck.registrations');
// --- client half ----------------------------------------------------------
const WF_POLL_MS = /var WF_POLL_VISIBLE = 800;/;
const WF_POLL_HIDDEN_MS = /var WF_POLL_HIDDEN = 3000;/;
// The generated bundle starts with a "generated file" banner, so the loader call is
// matched after any leading line comments (it must still be the first statement).
const clientBody = client.replace(/^(?:\s*\/\/[^\n]*\n|\s*\n)+/, '');
check('client.loader', clientBody.startsWith('window.__ModuleLoader__.load({'), 'window.__ModuleLoader__.load');
check('client.id', client.includes('id: "dsh-workflow-map"'), 'factory id == package name');
// the overlay seat is gone. One id now addresses two seats — the sidebar rail
// row and the main panel — so the shape check asserts BOTH registrations and the id/order.
check('client.panelId', (client.match(/var PANEL_ID = "([^"]+)"/) || [])[1] === 'workflow-map', 'panel id');
check('client.panelOrder', (client.match(/var PANEL_ORDER = (\d+);/) || [])[1] === '10', 'order 10');
check('client.noOverlaySeat', !client.includes('shell.overlay'), 'no shell.overlay string in the bundle');
check('client.register', /ctx\.slots\.register\(/.test(client), 'ctx.slots.register');
check('client.injectSlots', /ctx\.slots\.inject\("sidebar\.panellist"/.test(client), 'ctx.slots.inject(sidebar.panellist)');
check('client.injectMain', /ctx\.slots\.inject\("main"/.test(client), 'ctx.slots.inject(main)');
// Session tab-bar entry: a third seat, the same panel, ordered after chat/trajectory/context/fleet.
check(
  'client.injectConversationView',
  /ctx\.slots\.inject\("conversation\.view"/.test(client),
  'ctx.slots.inject(conversation.view)',
);
check(
  'client.conversationViewOrder',
  /name: "conversation\.view",[\s\S]{0,160}order: PANEL_ORDER \* 4/.test(client),
  'the tab seat sits after fleet (order 30), i.e. PANEL_ORDER * 4 = 40',
);
check(
  'client.conversationViewSeat',
 // The tab seat registers the SAME `WorkflowMapPanel` (the thin wrapper that only existed to "cover the composer",
 // `WorkflowMapTabSeat`, was removed together with the overlay). Instead it registers the seat wrapper `WorkflowMapViewSeat` -
 // which adds a seat marker (`WF_VIEW_SEAT_MARKER`) to the same panel, and the stylesheet uses it to hide the host composer seat.
  /name: "conversation\.view",[\s\S]{0,420}WorkflowMapViewSeat/.test(client) &&
    !client.includes('WorkflowMapTabSeat'),
  'the tab seat renders the seat-marked wrapper around the SAME WorkflowMapPanel',
);
check(
  'client.conversationViewSeatMarker',
  client.includes('var WF_VIEW_SEAT_MARKER = "conversation-view";') && client.includes('function wfViewSeatRoot('),
  'the seat marker and its wrapper are in the bundle',
);
check(
  'client.hostComposerHiddenOnViewSeat',
  client.includes("[data-conversation-content]:has([data-dsh-workflow-map='conversation-view']) [data-composer-seat]{display:none!important}"),
  'the seat rule hides the host composer while THIS view is mounted',
);
check(
  'client.noComposerCover',
  !/wfUseTabCover|wfCoverOptIn|dsh-workflow-map:cover|data-seat/.test(client),
  'the experimental composer cover layer is gone (composer stays as the host renders it)',
);
check('client.injects', (client.match(/exports\.inject = \[([^\]]*)\]/) || [])[1].replace(/\s/g, '') === '"slots","locale"', 'inject: ["slots","locale"]');
check('client.useSessions', /props\.useSessions/.test(client), 'session id comes from the standard useSessions prop');
check('client.altW', /addEventListener\("keydown", onKeyDown\)/.test(client), 'Alt+W listener installed');
check('client.prefsKey', client.includes('dsh-workflow-map:prefs'), 'localStorage key dsh-workflow-map:prefs');
check('client.styleId', client.includes('dsh-workflow-map-css'), '<style id="dsh-workflow-map-css">');
check('client.prefsShape', /width:[\s\S]{0,40}height:[\s\S]{0,40}collapsed:[\s\S]{0,40}selectedStep:/.test(client), 'prefs {width,height,collapsed,selectedStep}');
check('client.pollMs', WF_POLL_MS.test(client), 'poll every 800 ms');
check('client.pollHiddenMs', WF_POLL_HIDDEN_MS.test(client), '3 s while the page is hidden');
check('client.ifNoneMatch', client.includes('If-None-Match'), 'conditional GET');
check('client.cacheNoStore', client.includes('cache: "no-store"'), 'cache: no-store');
check('client.abort', /new AbortController\(\)/.test(client) && /\.abort\(\)/.test(client), 'AbortController + abort');
// the revoke half's presence in the shipped bundle. The row's own state decides
// whether the button exists (never a disabled button on a picked/canceled row), and the failure
// line is the host's own text.
check('client.revokePath', client.includes('var WF_UNSTEER_PATH = "/dsh-workflow/unsteer";'), 'the browser addresses the unsteer route');
check('client.revokeState', /function wfRevokeState\(/.test(client), 'the revoke state machine is in the bundle');
check('client.revokeOutcome', /function wfRevokeOutcome\(/.test(client), 'the answer → outcome rule is in the bundle');
check('client.revokeRequest', /function wfPostUnsteer\(/.test(client), 'the revoke request is in the bundle');
check('client.revokeButton', client.includes('"data-inject": "revoke"'), 'the history row carries the revoke button');
check('client.revokeErrorLine', client.includes('"data-inject": "revoke-error"'), 'a refused revoke has a line of its own');
check('client.revokeOnlyPending', client.indexOf('var pending = row.status === "pending";') >= 0, 'the button is rendered only for an unclaimed row');
check('client.revokeCss', client.includes('.wf-inject-row-revoke{') && client.includes('.wf-inject-row-error{'), 'the button and the failure line have their own styles');
// the enlarged header entry, its pending badge and the persistent dock
// must all be IN THE SHIPPED BUNDLE, not merely in the sources: the self-test loads client.js, so
// these strings are what the browser will actually receive.
check('client.hotToggle.prominent', client.includes('.wf-btn-hot{position:relative;width:auto;min-width:96px;height:30px'), 'the header entry is 96×30 in the shipped stylesheet');
check('client.hotBadge', /function wfPendingInjectCount\(/.test(client) && client.includes('.wf-inject-badge{position:absolute'), 'the badge count helper and its style shipped');
check('client.hotBadgeKey', client.includes('"panel.inject.pending.badge"'), 'the badge dictionary key shipped');
check('client.dockRenderer', /function wfRenderInjectDock\(/.test(client) && client.includes('"data-dsh-workflow-map": "inject-dock"'), 'the persistent dock renderer shipped');
check('client.dockInRightPage', /kind === "inject"\s*\?\s*null\s*:\s*wfRenderInjectDock\(/.test(client), 'the right page mounts the dock for every non-composer kind and NOT for the composer');
check('client.dockCss', client.includes('.wf-inject-dock{flex:0 0 auto') && client.includes('.wf-inject-dock-input{') && client.includes('@container (max-width:900px){.wf-inject-dock{padding:6px 8px}'), 'the dock footer, its input and its narrow-container branch shipped');
check('client.rightWidth460', client.includes('.wf-right{flex:0 0 460px') && !client.includes('.wf-right{flex:0 0 380px'), 'the right page is 460 px and the old 380 px rule is gone');
check('client.injectStatusKey', /function wfInjectStatusKey\(/.test(client), 'the three status words have ONE mapping, used by the history rows and the dock');
check(
  'client.revokeHintIsTheFact',
  client.includes('宿主未开放撤回接口') === false,
  'the old "the host exposes no revoke API" wording is gone from the shipped dictionary'
);
check('client.visibility', client.includes('visibilityState === "visible"'), 'visibilityState check');
// the panel is a normal main-column region: no fixed box, no corner anchor, no
// z-index, no click-through layer and no drag grips. The main area owns the geometry.
check('client.rootNoFixed', !/\.wf-root\{position:fixed/.test(client), 'no position:fixed root');
check('client.rootFills', /\.wf-root\{position:relative;width:100%;height:100%/.test(client), 'root fills the main area');
check('client.cardFills', /\.wf-card\{position:relative;flex:1 1 auto/.test(client), 'card takes the remaining height');
check('client.noZIndex', !/z-index:" \+ WF_Z_INDEX/.test(client), 'no overlay z-index');
check('client.noGrips', !client.includes('wf-grip-'), 'both resize grips removed');
check('client.noDialog', !client.includes('role: "dialog"'), 'main panel is a region, not a dialog');
check('client.noCloseBtn', !client.includes('panel.close'), 'no close affordance in the main area');
check('client.grid', client.includes('grid-template-columns:minmax(240px,44%) 1fr'), 'two-column grid');
check('client.capsule', /\.wf-capsule\{/.test(client) && client.includes('panel.planning'), 'collapsed capsule + planning line');
check('client.emptyNoDom', /\.wf-empty\{/.test(client) && /return null;/.test(client), 'empty state renders nothing');
check('client.tokens', ['--dsw-alias-bg-base', '--dsw-alias-border-l1', '--dsw-alias-brand-primary', '--dsw-alias-label-primary'].every((t) => client.includes(t)), 'theme tokens read');
// the frame's own surface moved from bg-overlay to bg-base (it is no longer a
// floating card), but every token must STILL carry a concrete fallback.
check('client.tokensFallback', /\.wf-card\{[^}]*var\(--dsw-alias-bg-base,#[0-9a-f]{6}\)/.test(client), 'token fallbacks are concrete colours');
check('client.rebuildBlocked', /do not edit by hand/.test(client), 'generated banner names the sources');
check('client.locale.register', /ctx\.locale\.register\(NS,/.test(client), 'ctx.locale.register(NS, …)');
check('client.ns', (client.match(/var NS = "([^"]+)"/) || [])[1] === pkg.name, 'namespace == package name');

// --- locale ---------------------------------------------------------------
const dict = (name) => {
  const m = client.match(new RegExp('var ' + name + ' = \\{([\\s\\S]*?)\\};'));
  if (!m) return null;
  return (m[1].match(/"([^"]+)":/g) || []).map((s) => s.slice(1, -2)).sort();
};
const zhKeys = Object.keys(zh.meta || {}).sort();
const enKeys = Object.keys(en.meta || {}).sort();
check('locale.meta.equal', JSON.stringify(zhKeys) === JSON.stringify(enKeys), `${zhKeys} vs ${enKeys}`);
check('locale.meta.title', zhKeys.includes('title') && enKeys.includes('title'), 'meta.title in both');
check('locale.meta.description', zhKeys.includes('description') && enKeys.includes('description'), 'meta.description in both');
const dzh = dict('DICT_ZH');
const den = dict('DICT_EN');
check('client.dict.equal', JSON.stringify(dzh) === JSON.stringify(den), `${dzh} vs ${den}`);

// --- icon -----------------------------------------------------------------
const icon = fs.readFileSync(path.join(ROOT, 'icon.svg'));
check('icon.svg.parse', icon.toString('utf8').includes('<svg') && icon.toString('utf8').includes('</svg>'), `${icon.length} bytes`);
check('icon.size', icon.length > 0 && icon.length < 256 * 1024, `${icon.length} bytes`);

// --- report ---------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
const lines = results.map((r) => `${r.pass ? 'PASS' : 'FAIL'}  ${r.id}${r.pass ? '' : '  — ' + r.detail}`);
process.stdout.write(lines.join('\n') + '\n');
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
if (failed.length > 0) process.exitCode = 1;
