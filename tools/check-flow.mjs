// check-flow.mjs — prove the flow column against the RAW session log.
//
// Run: node tools/check-flow.mjs [path-to-session.v4.jsonl.zstd]
//
// The acceptance criterion is a data claim, not a pixel claim:
// "the node count matches the tool/call event count (spot-check 5 calls within one step; each must match name and files)"
// so this script decompresses the session's own event log, counts the real `tool/call`
// events per step, and compares them with what the client model draws:
// - every step with no truncation: tool/call count == tool node count
// - the one truncated step: the difference is exactly the dropped middle
// - EVERY node, not just 5: its `at` timestamp exists in the raw log
// - 5 tool calls in one step: name + file path match the call's own arguments
//
// The log is a multi-frame zstd file (one frame per append), which Node's zstd
// stream stops after the first frame, so frames are split on the zstd magic.
// Writes evidence/step08-flowcheck.json and exits non-zero on any failure.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

const results = [];
const check = (id, pass, detail) => results.push({ id, pass: pass === true, detail: detail === undefined ? '' : String(detail) });

/* --- locate the log (arg, else the newest session log on this machine) ---- */
function newestSessionLog() {
  const base = path.join(process.env.USERPROFILE || '', '.dsh', 'sessions');
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name === 'session.v4.jsonl.zstd') found.push({ full, at: fs.statSync(full).mtimeMs });
    }
  };
  walk(base, 0);
  found.sort((a, b) => b.at - a.at);
  return found.length > 0 ? found[0].full : null;
}

const logPath = process.argv[2] || newestSessionLog();
if (!logPath || !fs.existsSync(logPath)) {
  process.stdout.write(`FAIL  log.missing  — ${logPath || '(no session log found)'}\n`);
  process.exit(1);
}

/* --- multi-frame zstd → events ------------------------------------------- */
const buffer = fs.readFileSync(logPath);
const offsets = [];
for (let at = buffer.indexOf(MAGIC); at >= 0; at = buffer.indexOf(MAGIC, at + 1)) offsets.push(at);
check('log.frames', offsets.length > 0, `${offsets.length} zstd frames in ${path.basename(logPath)}`);

const events = [];
let badFrames = 0;
for (let index = 0; index < offsets.length; index += 1) {
  const start = offsets[index];
  const end = index + 1 < offsets.length ? offsets[index + 1] : buffer.length;
  try {
    const text = zlib.zstdDecompressSync(buffer.subarray(start, end)).toString('utf8');
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      const event = JSON.parse(line);
      if (event && typeof event === 'object') events.push(event);
    }
  } catch (error) {
    badFrames += 1;
  }
}
check('log.parsed', events.length > 0 && badFrames === 0, `${events.length} events, ${badFrames} undecodable frames`);

const calls = events.filter((event) => event.type === 'tool/call' && event.data && typeof event.data.name === 'string');
const eventTimes = new Set(events.map((event) => event.time).filter((time) => typeof time === 'number'));

/* --- the recorded view → the client model -------------------------------- */
const source = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
const loaded = { definition: null };
new Function('window', source)({ __ModuleLoader__: { load: (definition) => (loaded.definition = definition) } });
const createElement = (type, props, ...children) => ({
  type,
  props: props || {},
  children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false && child !== ''),
});
const T = loaded.definition
  .factory((name) => {
    if (name === 'react') return { createElement };
    throw new Error('unexpected require: ' + name);
  })
  .__test;

const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/state-live.json'), 'utf8'));
const view = live.view;
const rev = live.rev;
const prefs = T.defaultPrefs();
const inLog = calls.filter((event) => typeof event.seq !== 'number' || event.seq <= rev);

/* --- per-step node counts vs tool/call counts ---------------------------- */
const steps = [];
let totalCalls = 0;
let totalToolNodes = 0;
let droppedCalls = 0;
for (let index = 0; index < view.steps.length; index += 1) {
  const step = view.steps[index];
  if (!Array.isArray(step.nodeIds) || step.nodeIds.length === 0) continue;
  const next = view.steps[index + 1];
  const from = typeof step.anchorSeq === 'number' ? step.anchorSeq : 0;
  const to = next && typeof next.anchorSeq === 'number' ? next.anchorSeq : Number.MAX_SAFE_INTEGER;
  const stepCalls = inLog.filter((event) => event.seq >= from && event.seq < to);
  const model = T.buildModel(view, { ...prefs, selectedStep: index });
  const toolNodes = model.flow.nodes.filter((node) => node.kind === 'tool');
 // Nodes this step no longer has: the per-step cap AND the global 1200-node cap (which
 // prunes ids without touching truncatedNodes) — the same honest gap the header shows.
  const missing = Math.max(0, (Number(step.nodeCount) || 0) - model.flow.nodes.length);
  const dropped = stepCalls.length - toolNodes.length;
  totalCalls += stepCalls.length;
  totalToolNodes += toolNodes.length;
  if (dropped > 0) droppedCalls += dropped;
  steps.push({
    index,
    title: step.title,
    calls: stepCalls.length,
    toolNodes: toolNodes.length,
    omittedNodes: missing,
    droppedCalls: dropped,
    ok: missing === 0 ? dropped === 0 : dropped >= 0 && dropped <= missing,
  });
}
check(
  'steps.counts',
  steps.every((row) => row.ok),
  steps.map((row) => `${row.index}:${row.toolNodes}/${row.calls}${row.droppedCalls ? ` (-${row.droppedCalls})` : ''}`).join(' ')
);
check(
  'steps.untruncatedExact',
  steps.filter((row) => row.omittedNodes === 0).every((row) => row.calls === row.toolNodes),
  `${steps.filter((row) => row.omittedNodes === 0).length} complete steps match exactly`
);
check(
  'steps.truncatedExplainsGap',
  steps.filter((row) => row.omittedNodes > 0).every((row) => row.droppedCalls > 0 && row.droppedCalls <= row.omittedNodes),
  steps
    .filter((row) => row.omittedNodes > 0)
    .map((row) => `#${row.index}: ${row.calls} calls − ${row.toolNodes} nodes = ${row.droppedCalls} dropped (cap hid ${row.omittedNodes} nodes)`)
    .join('; ')
);
check('steps.totals', totalToolNodes === view.nodes.filter((node) => node.kind === 'tool').length, `${totalToolNodes} tool nodes drawn of ${totalCalls} calls (${droppedCalls} dropped by the per-step cap)`);

/* --- every drawn node traces back to one raw event ----------------------- */
const missingTrace = [];
for (const node of view.nodes) {
  if (!eventTimes.has(node.at)) missingTrace.push(node.id);
}
check('nodes.traceable', missingTrace.length === 0, `${view.nodes.length} nodes, ${missingTrace.length} without a raw event at their timestamp`);

/* --- five spot-checked tool calls in one step ---------------------------- */
// The step with the most file-touching calls (read/write/edit/grep/glob) is the one
// where "name AND file" can actually be proved. Untruncated only.
/** The call's own arguments. The log stores them as a JSON STRING (the fold parses it). */
function argsOf(event) {
  const raw = event && event.data ? event.data.arguments : null;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  return {};
}

const fileTools = new Set(['read', 'write', 'edit', 'grep', 'glob']);
let spotStep = null;
for (const step of view.steps) {
  if (!Array.isArray(step.nodeIds) || step.nodeIds.length === 0) continue;
  if ((Number(step.nodeCount) || 0) - step.nodeIds.length > 0) continue;
  const index = step.index;
  const next = view.steps[index + 1];
  const from = typeof step.anchorSeq === 'number' ? step.anchorSeq : 0;
  const to = next && typeof next.anchorSeq === 'number' ? next.anchorSeq : Number.MAX_SAFE_INTEGER;
  const fileCalls = inLog.filter(
    (event) => {
      if (event.seq < from || event.seq >= to) return false;
      if (!fileTools.has(event.data.name)) return false;
      const args = argsOf(event);
      return typeof args.file_path === 'string' || typeof args.path === 'string';
    }
  );
  if (spotStep === null || fileCalls.length > spotStep.calls.length) spotStep = { index, step, calls: fileCalls };
}
check('spot.found', spotStep !== null && spotStep.calls.length >= 5, spotStep ? `step #${spotStep.index} has ${spotStep.calls.length} file calls` : 'no candidate step');

const basename = (value) => (typeof value === 'string' && value !== '' ? value.replace(/\\/g, '/').split('/').pop() : '');
const spotChecks = [];
if (spotStep !== null) {
  const model = T.buildModel(view, { ...prefs, selectedStep: spotStep.index });
  const toolNodes = model.flow.nodes.filter((node) => node.kind === 'tool');
  const picks = [0, Math.floor(spotStep.calls.length * 0.25), Math.floor(spotStep.calls.length * 0.5), Math.floor(spotStep.calls.length * 0.75), spotStep.calls.length - 1];
  for (const position of picks) {
    const event = spotStep.calls[position];
    const args = argsOf(event);
    const wanted = basename(args.file_path || args.path);
    const candidates = toolNodes.filter((node) => node.at === event.time && node.tool === event.data.name);
    const matched = candidates.find((node) => wanted === '' || basename(node.path) === wanted);
    spotChecks.push({
      seq: event.seq,
      at: event.time,
      name: event.data.name,
      wantedFile: wanted,
      candidates: candidates.length,
      nodeId: matched ? matched.id : null,
      nodeTitle: matched ? matched.title : null,
      nodePath: matched ? matched.path : null,
      ok: Boolean(matched) && (wanted === '' || basename(matched.path) === wanted),
    });
  }
  check(
    'spot.rows',
    spotChecks.length === 5 && spotChecks.every((row) => row.ok),
    spotChecks.map((row) => `#${row.seq} ${row.name}${row.wantedFile ? ' ' + row.wantedFile : ''} → ${row.nodeId || 'MISSING'}`).join(' | ')
  );
  check(
    'spot.files',
    spotChecks.filter((row) => row.wantedFile !== '').every((row) => row.nodePath !== null && basename(row.nodePath) === row.wantedFile),
    `${spotChecks.filter((row) => row.wantedFile !== '').length} file calls matched by basename`
  );
}

/* --- report -------------------------------------------------------------- */
const failed = results.filter((row) => !row.pass);
process.stdout.write(
  results.map((row) => `${row.pass ? 'PASS' : 'FAIL'}  ${row.id}${row.pass ? '' : '  — ' + row.detail}`).join('\n') + '\n'
);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.stdout.write(`log: ${logPath}\nlog rev: ${rev} · events: ${events.length} · tool/call: ${calls.length}\n`);
if (spotStep !== null) {
  process.stdout.write(`spot step #${spotStep.index}「${spotStep.step.title}」: 5 of ${spotStep.calls.length} file calls\n`);
  for (const row of spotChecks) {
    process.stdout.write(`  #${row.seq} ${row.name} ${row.wantedFile || '(no file)'} → ${row.nodeId} ${row.nodeTitle || ''}\n`);
  }
}

const evidence = {
  capturedAt: new Date().toISOString(),
  sessionLog: logPath,
  rev,
  events: events.length,
  toolCalls: calls.length,
  steps,
  spotStep: spotStep ? { index: spotStep.index, title: spotStep.step.title, calls: spotStep.calls.length } : null,
  spotChecks,
  checks: results,
};
fs.writeFileSync(path.join(ROOT, 'evidence', 'step08-flowcheck.json'), JSON.stringify(evidence, null, 2), 'utf8');
process.stdout.write('wrote evidence/step08-flowcheck.json\n');
if (failed.length > 0) process.exitCode = 1;
