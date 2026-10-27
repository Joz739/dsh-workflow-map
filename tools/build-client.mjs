// build-client.mjs — assemble the browser half into ONE file.
//
// WHY A BUILD STEP: the ModuleLoader hands the factory a `require` that knows
// only the harness builtins (react and friends). A `require("./src/client/x.js")`
// would never resolve at runtime, so the plugin's client half must ship as a
// single script. Writing that script by hand would make steps 7-12 unmaintainable,
// so the sources live in src/client/*.js as plain chunks (no import/export) and
// this script concatenates them inside the factory.
//
// Run: node tools/build-client.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'client.js');
const CHUNKS = [
  'src/client/theme.js',
  'src/client/store.js',
  // step-12: settings sanitizer + the in-panel settings card, then the snapshot
  // builder/downloader. store.js calls the hoisted settings helpers; export.js
  // reads the same model/NodeCard functions the panel renders.
  'src/client/Settings.js',
  // step-10: the two living-layer chunks sit after the data shaping (they read wfFinite /
  // wfClamp) and before the renderers that call them (StepColumn / NodeCard / panel).
  'src/client/pulse.js',
  'src/client/ProgressUnder.js',
  // step-11: the details sit next to the two renderers that open them (StepColumn / NodeCard)
  // and after store.js, whose model they read.
  'src/client/StepDetail.js',
  'src/client/StepColumn.js',
  'src/client/NodeDetail.js',
  'src/client/NodeCard.js',
  'src/client/export.js',
  'src/client/FlowColumn.js',
  // The branch lanes and the living layer keep their chunks: the single page no longer mounts the
  // two-column curve, but Branches.js / FlowEffects.js still export the branch renderer, the live
  // chip and the SVG pieces other chunks (and the self-tests) import by name.
  'src/client/Branches.js',
  'src/client/FlowEffects.js',
  // 会话4 · the single page. MainFlow draws the serial chain + its satellites; RightPage draws the
  // right-hand page. They sit after the renderers they compose (StepDetail / NodeDetail /
  // ProgressUnder / pulse) and before panel.js, which mounts them.
  'src/client/MainFlow.js',
  'src/client/RightPage.js',
  // step-04-hot-inject: the composer. It must load BEFORE RightPage's first call, which mounts it
  // as the third kind of page; function declarations hoist across the bundle, but keeping the
  // producer before the consumer avoids relying on that.
  'src/client/HotInject.js',
  'src/client/panel.js',
];
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const indent = (text, pad) =>
  text
    .replace(/\s+$/, '')
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : pad + line))
    .join('\n');

// A chunk must be a plain script body: an import/export here would either be a
// syntax error inside the factory or silently change the bundle's shape.
for (const rel of CHUNKS) {
  const source = read(rel);
  const lines = source.split('\n');
  const offending = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s*(import|export)\b/.test(line));
  if (offending.length > 0) {
    throw new Error(
      `${rel}:${offending[0].index + 1} — chunks must not use import/export (single-file bundle): ${offending[0].line.trim()}`
    );
  }
  if (source.includes('__ModuleLoader__')) {
    throw new Error(`${rel} must not reference __ModuleLoader__ (only the generated wrapper does)`);
  }
}

const header = [
  '// dsh-workflow-map — client half (step-13: the panel moved from the shell overlay',
  '// into the sidebar rail + main content area; step-12 settings/export, step-11',
  '// details, step-10 living layer, step-09 branch lanes all remain).',
  '// GENERATED FILE — do not edit by hand. Sources: src/client/theme.js,',
  '// src/client/store.js, src/client/Settings.js, src/client/pulse.js,',
  '// src/client/ProgressUnder.js, src/client/StepDetail.js, src/client/StepColumn.js,',
  '// src/client/NodeDetail.js, src/client/NodeCard.js, src/client/export.js,',
  '// src/client/FlowColumn.js, src/client/Branches.js, src/client/FlowEffects.js,',
  '// src/client/panel.js.',
  '// Rebuild: node tools/build-client.mjs',
].join('\n');

const prelude = [
  'window.__ModuleLoader__.load({',
  '  id: "dsh-workflow-map",',
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  '    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
  '',
  '    var React = require("react");',
  '    var h = React.createElement;',
  '',
  '    // One namespace for the bundle, the slot descriptor\'s `locale` field and',
  '    // locale.register: they must agree, or the dictionary is not found.',
  '    var NS = "dsh-workflow-map";',
  '    // step-13: ONE id addresses both seats — the sidebar rail row and the main panel.',
  '    var PANEL_ID = "workflow-map";',
  '    var PANEL_ORDER = 10;',
].join('\n');
const epilogue = [
  '',
  '    exports.inject = ["slots", "locale"];',
  '    exports.apply = apply;',
  '    // Test seam for tools/selftest-panel.mjs; the app reads inject/apply only.',
  '    exports.__test = __test;',
  '    return exports;',
  '  },',
  '});',
  '',
].join('\n');

const body = CHUNKS.map((rel) => {
  const banner = `    // ===== ${rel} =====`;
  return `${banner}\n${indent(read(rel), '    ')}`;
}).join('\n\n');

const output = [header, '', prelude, '', body, epilogue].join('\n');

// Compile-only check: catches a syntax error before a browser ever sees the file.
try {
  // eslint-disable-next-line no-new-func
  new Function(output);
} catch (error) {
  throw new Error(`generated client.js does not parse: ${error.message}`);
}

// Structural guards: the pieces the loader and steps 7-12 depend on.
const required = [
  ['loader call', 'window.__ModuleLoader__.load({'],
  ['factory id', 'id: "dsh-workflow-map"'],
  ['panel id', 'var PANEL_ID = "workflow-map";'],
  ['panel order', 'var PANEL_ORDER = 10;'],
  ['zh dict', 'var DICT_ZH = {'],
  ['en dict', 'var DICT_EN = {'],
  ['registration', 'ctx.slots.register('],
  ['sidebar seat', 'ctx.slots.inject("sidebar.panellist"'],
  ['main seat', 'ctx.slots.inject("main"'],
  ['conversation view seat', 'ctx.slots.inject("conversation.view"'],
  ['inject', 'exports.inject = ["slots", "locale"];'],
  ['apply export', 'exports.apply = apply;'],
  ['step column', 'function wfRenderStepColumn('],
  ['progress rail', 'function wfRenderProgressDock('],
  ['status policy', 'function wfDeriveStepStatus('],
  ['step gap constant', 'var WF_STEP_GAP = 8;'],
  ['node card', 'function wfRenderNodeCard('],
  ['flow column', 'function wfRenderFlowColumn('],
  ['flow cap', 'var WF_FLOW_CAP = 60;'],
  ['group fold', 'function wfFlowGroups('],
  ['branch renderer', 'function wfRenderBranches('],
  ['branch row', 'function wfRenderBranchRow('],
  ['branch hue palette', 'var WF_BRANCH_HUES ='],
  ['branch cap mirror', 'var WF_BRANCH_SHOWN = 4;'],
  // step-10: the living layer must not silently lose a piece.
  ['curve palette', 'var WF_FX_RAINBOW ='],
  ['curve geometry', 'function wfFxCurve('],
  ['curve measure', 'function wfFxGeometry('],
  ['curve apply', 'function wfFxApply('],
  ['curve bind', 'function wfFxBind('],
  ['curve markup', 'function wfRenderFlowEffects('],
  ['motion preference', 'function wfMotionMode('],
  ['session running flag', 'function wfSessionRunning('],
  ['live chip', 'function wfRenderLive('],
  ['body anchor', '"data-dsh-workflow-map": "body"'],
  ['wrapped frame ring', ".wf-step-item[data-status='running']>.wf-step-card::after"],
  ['idle pause rule', ".wf-root[data-idle='1'] *,.wf-root[data-idle='1'] *::before,.wf-root[data-idle='1'] *::after{animation-play-state:paused!important}"],
  ['static motion rule', ".wf-root[data-motion='static'] *,.wf-root[data-motion='static'] *::before,.wf-root[data-motion='static'] *::after{animation:none!important}"],
  ['curve dash keyframes', '@keyframes wf-fx-dash'],
  ['live pulse keyframes', '@keyframes wf-live-dot'],
  // step-11: the details must not silently lose a piece either.
  ['node detail', 'function wfRenderNodeDetail('],
  ['step detail', 'function wfRenderStepDetail('],
  ['step report lookup', 'function wfStepReport('],
  ['copy fallback', 'function wfCopyFallback('],
  ['escapes the details', 'function wfBindEscape('],
  ['node detail css', '.wf-node-detail{'],
  ['step info button css', '.wf-step-info{'],
  // step-12: settings + export must not silently lose a piece.
  ['settings card', 'function wfRenderSettings('],
  ['settings sanitizer', 'function wfSanitizeSettings('],
  ['palette allow-list', 'var WF_PALETTES = ["rainbow", "brand", "soft"];'],
  ['snapshot builder', 'function wfBuildSnapshot('],
  // step-06: the ONE surviving half of the rail's second line must not go missing either.
  ['progress age css', '.wf-prog-ago{'],
  // 会话6 · the conversation-view seat's marker and the rule that hides the host's composer. Losing
  // either one silently puts the 会话框 back under the panel — the panel cannot unmount that sibling
  // itself, so this removal needs the same kind of guard as the step-13 overlay above.
  ['conversation view seat wrapper', 'function WorkflowMapViewSeat('],
  ['conversation view seat marker', 'var WF_VIEW_SEAT_MARKER = "conversation-view";'],
  [
    'host composer hidden on the view seat',
    "[data-conversation-content]:has([data-dsh-workflow-map='conversation-view']) [data-composer-seat]{display:none!important}",
  ],
  ['snapshot markdown', 'function wfSnapshotMarkdown('],
  ['snapshot download', 'function wfSnapshotDownload('],
  ['object URL cleanup', 'function wfReleaseSnapshotUrls('],
  ['settings css', '.wf-settings{'],
  ['palette css', ".wf-root[data-palette='brand']"],
  ['root palette attribute', '"data-palette": settings.palette'],
  // step-04-hot-inject: the inject column must not silently lose a piece either.
  ['inject state machine', 'function wfInjectState('],
  ['inject send gate', 'function wfInjectCanSend('],
  ['inject outcome', 'function wfInjectOutcome('],
  ['inject ack clears', 'function wfInjectAckDone('],
  ['inject request', 'function wfPostSteer('],
  ['inject renderer', 'function wfRenderHotInject('],
  ['inject path', 'var WF_INJECT_PATH = "/dsh-workflow/steer";'],
  ['inject text bound', 'var WF_INJECT_LIMIT = 2000;'],
  ['inject toggle', '"data-dsh-workflow-map": "inject-toggle"'],
  // 会话4 · the single page. The old two-column keys are replaced by the ones this layout actually
  // ships, so the builder still fails loudly if a piece goes missing.
  ['main flow renderer', 'function wfRenderMainFlow('],
  ['unit renderer', 'function wfRenderUnit('],
  ['satellite renderer', 'function wfRenderSatellite('],
  ['right page renderer', 'function wfRenderRightPage('],
  ['right page spec', 'function wfRightPageSpec('],
  ['type buckets', 'function wfTypeBuckets('],
  ['type sides', 'function wfTypeSides('],
  ['extension parser', 'function wfTypeOfPath('],
  ['center arithmetic', 'function wfCenterOffset('],
  ['right page kinds', 'var WF_RIGHT_KINDS = ["step", "type", "inject"];'],
  ['unit gap constant', 'var WF_UNIT_GAP = 56;'],
  ['satellite constant', 'var WF_SATELLITE = 30;'],
  ['page scroll anchor', '"data-dsh-workflow-map": "page-scroll"'],
  ['right page anchor', '"data-dsh-workflow-map": "right"'],
  ['satellite css', '.wf-sat{'],
  ['unit link css', '.wf-unit-link{'],
  ['right page css', '.wf-right{'],
  ['inject page kind', 'rightKind: "inject"'],
  ['inject banner label', 'say("panel.inject.banner")'],
  ['inject css', '.wf-inject{'],
  ['inject narrow css', '@container (max-width:900px)'],
  ['inject send disabled when not ready', '"data-ready": canSend ? "true" : "false"'],
  // 会话5 · the history and the 【需确认】 flag must not silently lose a piece either.
  ['inject history renderer', 'function wfInjectRows('],
  ['inject history block', '"data-dsh-workflow-map": "inject-history"'],
  ['inject row anchor', '"data-dsh-workflow-map": "inject-row"'],
  ['inject status keys', 'panel.inject.row.picked'],
  ['confirm rows', 'function wfConfirmRows('],
  ['confirm title', 'function wfConfirmTitle('],
  ['confirm attribute', '"data-confirm":'],
  ['confirm css', ".wf-inject-row-status[data-status='picked']"],
  // step-03-unsteer · the revoke half of the composer must not silently lose a piece either: the
  // button, its failure line, its own state machine, its request and the row that flips on the
  // host's durable `outcome: 'canceled'` splice.
  ['inject revoke state machine', 'function wfRevokeState('],
  ['inject revoke outcome', 'function wfRevokeOutcome('],
  ['inject revoke request', 'function wfPostUnsteer('],
  ['unsteer path', 'var WF_UNSTEER_PATH = "/dsh-workflow/unsteer";'],
  ['inject revoke button', '"data-inject": "revoke"'],
  ['inject revoke error line', '"data-inject": "revoke-error"'],
  ['inject revoke css', '.wf-inject-row-revoke{'],
];
for (const [label, needle] of required) {
  if (!output.includes(needle)) throw new Error(`generated bundle is missing ${label} (${needle})`);
}

// step-13: the overlay seat must be GONE from the shipped bundle. The `required` list
// above only proves presence, so the removal needs its own guard: a stale string in
// any chunk would re-register the old floating window beside the new panel.
const forbidden = [
  ['overlay seat', 'shell.overlay'],
  ['dialog role', 'role: "dialog"'],
  ['width grip', 'wf-grip-left'],
  ['height grip', 'wf-grip-bottom'],
  ['dragged width style', 'width: width + "px"'],
  // step-05: the experimental composer cover layer (会话6) is gone — the tab seat keeps the host
  // composer exactly as the host renders it. A stale string in any chunk would silently restore
  // the overlay behaviour, so the removal needs the same kind of guard as the step-13 overlay.
  ['composer cover hook', 'wfUseTabCover'],
  ['composer cover opt-in', 'wfCoverOptIn'],
  ['composer cover key', 'dsh-workflow-map:cover'],
  ['tab seat marker', 'data-seat'],
  // step-06: the projected REMAINING time (会话6 的「还剩 ≈N 分钟」) was deleted by user request —
  // the host computation, the wire field, the render segment, its CSS and its two dictionary entries
  // went together. A stale string in ANY chunk would silently restore a segment the user asked to
  // remove (or ship a field to a browser that no longer reads it), so the removal needs its own
  // guard, exactly like the step-13 overlay and the step-05 cover layer above.
  ['projected remaining field', 'etaMs'],
  ['projected remaining dict key', 'panel.percent.eta'],
  ['projected remaining segment css', 'wf-prog-eta'],
  ['two-half separator css', 'wf-prog-sep'],
  ['projected remaining wording', '还剩'],
];
for (const [label, needle] of forbidden) {
  if (output.includes(needle)) throw new Error(`generated bundle still contains ${label} (${needle})`);
}

const zhKeys = [...output.matchAll(/^\s+"(panel\.[a-z.]+|capsule\.[a-z.]+)":/gm)].map((m) => m[1]);
const zhCount = zhKeys.length;
if (zhCount === 0 || zhCount % 2 !== 0) {
  throw new Error(`dictionary key count looks wrong (${zhCount}); zh and en must have identical key sets`);
}

const temp = `${OUT}.tmp`;
fs.writeFileSync(temp, output, 'utf8');
fs.renameSync(temp, OUT);

const bytes = Buffer.byteLength(output, 'utf8');
const sha = crypto.createHash('sha256').update(output, 'utf8').digest('hex');
process.stdout.write(`wrote ${path.relative(ROOT, OUT)} — ${bytes} bytes, ${output.split('\n').length} lines\n`);
process.stdout.write(`sha256 ${sha}\n`);
process.stdout.write(`dictionary keys ${zhCount / 2} per locale\n`);
