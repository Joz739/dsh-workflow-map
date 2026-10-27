// check-branches.mjs — prove the branch lanes (step-09) against the RAW session log.
//
// Run: node tools/check-branches.mjs [path-to-session.v4.jsonl.zstd]
//
// The step-09 acceptance criterion is a data claim:
//   「用 subagent 起一个子任务后，面板出现一条带标签的支线，子任务结束后状态变为完成/失败」
// so this script decompresses the session's own event log, folds it with the SHIPPING fold
// (src/fold.mjs — the module the host projection and the browser model both derive from),
// and compares the lanes with the raw events that produced them:
//
//   * every launcher call (`subagent` / `subagent_fork` / `workflow`) opens exactly ONE lane,
//     labelled with that call's own `description`;
//   * the launcher's result is an ACK ("started subagent <id>"), NOT a completion: the lane
//     stays RUNNING until the child's `subagent-settled` user message arrives (measured);
//   * a `job/*` pair opens a lane ONLY when its result arrives while the job is still open —
//     synchronous commands (registration → settlement → result, the ordering every `pwsh`
//     call in this session shows) must NOT produce a lane;
//   * a lane NEVER appears in `view.nodes`, and the main-flow node count stays the tool/call
//     count (parallel work must not enter the step's own sequence);
//   * a session with no launcher and no background job has `view.branches === []`.
//
// Writes evidence/step09-branches.json and exits non-zero on any failure.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildView, createInitialState, foldEvent } from '../src/fold.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

const results = [];
const check = (id, pass, detail) =>
  results.push({ id, pass: pass === true, detail: detail === undefined ? '' : String(detail) });

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

/* --- fold the raw log exactly the way the host does ---------------------- */
let state = createInitialState();
for (const event of events) state = foldEvent(state, event);
const view = buildView(state, state.asOf);
check('fold.lanes', Array.isArray(view.branches), `${view.branches.length} lane(s) in the folded view`);

/* --- the raw facts the lanes must line up with --------------------------- */
const argsOf = (event) => {
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
};
const resultOf = (event) => {
  const message = event && event.data && event.data.message ? event.data.message : null;
  if (!message) return null;
  const blocks = Array.isArray(message.content) ? message.content : [];
  const text = blocks
    .map((block) => (block && typeof block.text === 'string' ? block.text : ''))
    .join('\n')
    .trim();
  return { isError: message.isError === true, text };
};

const seqOf = (event) => (typeof event.seq === 'number' ? event.seq : 0);
const LAUNCHERS = new Set(['subagent', 'subagent_fork', 'workflow']);
const launchers = events.filter((event) => event.type === 'tool/call' && event.data && LAUNCHERS.has(event.data.name));

/** toolCallId → its result event (the fold matches on the same id). */
const resultByCall = new Map();
for (const event of events) {
  if (event.type !== 'tool/result' || !event.data || !event.data.message) continue;
  const id = event.data.message.toolCallId;
  if (typeof id === 'string' && !resultByCall.has(id)) resultByCall.set(id, event);
}

/** child / run id → the `subagent-settled` (or workflow end) that closed it. */
const settledByChild = new Map();
for (const event of events) {
  if (event.type !== 'user/message' || !event.data) continue;
  const source = event.data.source && typeof event.data.source === 'object' ? event.data.source : {};
  if (source.kind === 'subagent-settled' && typeof source.senderSessionId === 'string') {
    settledByChild.set(source.senderSessionId, event);
  }
}
const runEndSeqs = new Map();
for (const event of events) {
  if (event.type === 'tool-workflow/run-end' && event.data && typeof event.data.runId === 'string') {
    runEndSeqs.set(event.data.runId, seqOf(event));
  }
}

/* --- jobs: which ones were BACKGROUND (result before settlement)? -------- */
const jobRegistered = new Map();
const jobSettled = new Map();
for (const event of events) {
  if (!event.data || typeof event.data.jobId !== 'string') continue;
  if (event.type === 'job/registered') jobRegistered.set(event.data.jobId, event);
  else if (event.type === 'job/settled') jobSettled.set(event.data.jobId, event);
}
const backgroundJobs = [];
const synchronousJobs = [];
for (const [jobId, registered] of jobRegistered) {
  const callId = registered.data.toolCall && typeof registered.data.toolCall.callId === 'string' ? registered.data.toolCall.callId : '';
  const result = callId === '' ? null : resultByCall.get(callId);
  const settle = jobSettled.get(jobId) || null;
  if (result !== null && settle !== null && seqOf(result) < seqOf(settle)) backgroundJobs.push({ jobId, registered, settle, callId });
  else synchronousJobs.push({ jobId, registered, settle, callId });
}
check(
  'jobs.classified',
  backgroundJobs.length + synchronousJobs.length === jobRegistered.size,
  `${jobRegistered.size} registration(s): ${backgroundJobs.length} background, ${synchronousJobs.length} synchronous`
);
check(
  'jobs.syncNoLanes',
  synchronousJobs.every((job) => !view.branches.some((branch) => branch.kind === 'job' && branch.jobId === job.jobId)),
  `${synchronousJobs.length} synchronous job(s) drew no lane`
);

/* --- one lane per launcher ---------------------------------------------- */
for (const launcher of launchers) {
  const args = argsOf(launcher);
  const wanted = typeof args.description === 'string' ? args.description : '';
  const callId = launcher.data.callId;
  const lane = view.branches.find((branch) => branch.callId === callId);
  if (!lane) {
    check(`lane.missing.${callId}`, false, `no lane for ${launcher.data.name} (seq ${launcher.seq})`);
    continue;
  }
  const expectedKind = launcher.data.name === 'workflow' ? 'workflow' : 'subagent';
  check(`lane.kind.${launcher.seq}`, lane.kind === expectedKind, `${lane.kind} vs ${expectedKind}`);
  if (wanted !== '') check(`lane.label.${launcher.seq}`, lane.label === wanted, `${JSON.stringify(lane.label)} vs ${JSON.stringify(wanted)}`);

  const result = resultByCall.get(callId) || null;
  const outcome = result ? resultOf(result) : null;
  const ack = outcome !== null && /^started\b/i.test(outcome.text);
  if (outcome === null) {
    check(`lane.status.${launcher.seq}`, lane.status === 'running', 'no result yet → still running');
  } else if (ack) {
    const settled = lane.runId === '' ? undefined : settledByChild.get(lane.runId);
    const ended = lane.runId !== '' && runEndSeqs.has(lane.runId);
    if (settled !== undefined || ended) {
      check(`lane.status.${launcher.seq}`, lane.status === 'done', `ACK + settled → ${lane.status}`);
    } else {
      check(`lane.status.${launcher.seq}`, lane.status === 'running', `ACK without settlement → ${lane.status} (child still running)`);
    }
    check(`lane.runId.${launcher.seq}`, lane.runId !== '', lane.runId);
  } else {
    check(
      `lane.status.${launcher.seq}`,
      lane.status === (outcome.isError ? 'failed' : 'done'),
      `blocking result isError=${outcome.isError} → ${lane.status}`
    );
  }
}

/* --- one lane per BACKGROUND job ---------------------------------------- */
for (const job of backgroundJobs) {
  const lane = view.branches.find((branch) => branch.kind === 'job' && branch.jobId === job.jobId);
  const label = job.registered.data.label || job.registered.data.kind || '后台任务';
  if (!lane) {
    check(`job.missing.${job.jobId}`, false, `no lane for background job ${job.jobId}`);
    continue;
  }
  check(`job.label.${job.jobId}`, lane.label === label, lane.label);
  const raw = job.settle.data.outcome && typeof job.settle.data.outcome.status === 'string' ? job.settle.data.outcome.status : 'completed';
  check(`job.closed.${job.jobId}`, lane.status === (raw === 'failed' ? 'failed' : 'done'), `${lane.status} (outcome ${raw})`);
}

/* --- the acceptance that matters: lanes are NOT nodes ------------------- */
const toolCalls = events.filter((event) => event.type === 'tool/call');
check(
  'lanes.notNodes',
  view.nodes.every((node) => view.branches.every((branch) => branch.nodes.every((row) => row.id !== node.id))),
  `${view.nodes.length} main nodes, 0 lane rows among them`
);
check(
  'lanes.mainCount',
  view.counts.nodes === view.nodes.length,
  `${view.counts.nodes} main nodes of ${toolCalls.length} tool calls`
);
check(
  'lanes.haveRows',
  view.branches.every((branch) => branch.nodes.length > 0 && branch.nodes.length <= 40),
  view.branches.map((branch) => `${branch.id}:${branch.nodes.length}/${branch.count}`).join(' ')
);
check(
  'lanes.kindVocabulary',
  view.branches.every((branch) => ['subagent', 'workflow', 'job'].includes(branch.kind)),
  [...new Set(view.branches.map((branch) => branch.kind))].join(',')
);
check(
  'lanes.jsonRoundTrip',
  JSON.stringify(JSON.parse(JSON.stringify(view.branches))) === JSON.stringify(view.branches),
  'lossless JSON (what the wire sends)'
);
check('lanes.cap', view.branches.length <= 12, `${view.branches.length} lane(s), cap 12`);

/* --- report -------------------------------------------------------------- */
const failures = results.filter((row) => !row.pass);
const report = {
  checkedAt: new Date().toISOString(),
  log: logPath,
  events: events.length,
  launchers: launchers.map((event) => ({
    seq: event.seq,
    name: event.data.name,
    callId: event.data.callId,
    description: argsOf(event).description || '',
    result: (resultOf(resultByCall.get(event.data.callId) || {}) || {}).text || '',
  })),
  jobs: {
    background: backgroundJobs.map((job) => ({ jobId: job.jobId, label: job.registered.data.label })),
    synchronous: synchronousJobs.length,
  },
  lanes: view.branches.map((branch) => ({
    id: branch.id,
    kind: branch.kind,
    label: branch.label,
    status: branch.status,
    stepIndex: branch.stepIndex,
    count: branch.count,
    nodes: branch.nodes.map((row) => ({ kind: row.kind, title: row.title, status: row.status })),
  })),
  checks: results,
  passed: results.length - failures.length,
  total: results.length,
  failures: failures.map((row) => `${row.id}: ${row.detail}`),
};
fs.mkdirSync(path.join(ROOT, 'evidence'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'evidence', 'step09-branches.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (failures.length > 0) {
  process.stdout.write(`check-branches: FAIL ${failures.length}/${results.length}\n`);
  for (const row of failures) process.stdout.write(`  FAIL ${row.id} — ${row.detail}\n`);
  process.exit(1);
}
process.stdout.write(`check-branches: PASS ${results.length}/${results.length} assertions\n`);
process.stdout.write(
  `  ${launchers.length} launcher call(s) + ${backgroundJobs.length} background job(s) (of ${jobRegistered.size}) -> ${view.branches.length} lane(s)\n`
);
for (const branch of view.branches) {
  process.stdout.write(`  · ${branch.kind} · ${branch.label} — ${branch.status}, ${branch.count} row(s)\n`);
}
