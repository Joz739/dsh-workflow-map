#!/usr/bin/env node
// tools/check-todo-align.mjs — does the MAP's step list match the CONVERSATION's task list?
//
// Run: node tools/check-todo-align.mjs
//      node tools/check-todo-align.mjs <sessions-root>
//      node tools/check-todo-align.mjs --module <other-copy-of-fold.mjs>   # A/B against a baseline
//      node tools/check-todo-align.mjs --tag before                      # name the evidence files
//
// WHY THIS IS ITS OWN TOOL AND NOT A LINE IN audit-real.mjs. audit-real's criterion ① asks only
// "does the view carry a step the todo table does not name" — it never asked about ORDER, never
// asked about a MISSING row, and never compared STATUSES. `syncToTodos` exists precisely because
// this contract had been broken before (97 of 129 real logs once ended with rows no table named),
// so it needs its own judge, its own evidence file, and its own exit code.
//
// THE RIGHT-HAND SIDE IS THE LOG, NOT THE VIEW. The expected list is read straight out of the
// session's LAST `todo/write` event — what the conversation's task card actually shows — and the
// left-hand side is `buildView(...).steps` — what the panel actually draws. Comparing the view
// against its own `view.todos` would let a single misread of the table pass both sides at once.
//
// THE COMPARISON RULES ARE THE FOLD'S OWN, NEVER A SECOND COPY:
//   * `normalizeTitle`  — imported from src/fold.mjs (exported for exactly this reason);
//   * `text(x, TITLE_LIMIT)` — the same bound the fold applies to a row's content and to the title
//     it displays, so "row is 130 chars, title is 120" is not reported as a defect by design.
// A tool that carries a private regex silently stops agreeing with the fold the day either changes.
//
// CLASSES (one per session, plus a `kinds` array when several fire at once):
//   ok         the five criteria hold
//   empty      the log file is 0 bytes — an empty SAMPLE, not a folding failure (exempt)
//   unreadable the log would not decompress, or foldEvent/buildView threw (exempt from grading,
//              never from reporting: it is named with its error)
//   no-todo    the session never wrote a task list, or its last table was empty — there is nothing
//              to align against, so the SET/ORDER criteria are exempt (§"空表格豁免"), and the map
//              is only required to stay within one synthetic row (measured: it does)
//   extra      the map draws a step the table does not name
//   missing    the table names a row the map does not draw
//   order      same rows, different sequence
//   dup        two map rows share one normalised title
//   status     a row's RENDERED status disagrees with the table's own status for that title
//   counts     counts.steps !== steps.length, or counts.running > 1
//
// `order` is only claimed when the two SETS agree: otherwise the difference is already reported as
// missing/extra and re-reporting it as an order fault would double-count defect.
//
// TWO LAYERS, AND ONLY ONE OF THEM IS THE GATE. "The map must align with the conversation's task
// table" is a claim about what the PANEL DRAWS, so criterion 4 is graded on the RENDERED status —
// `buildModel`'s own derivation (src/client/StepColumn.js wfDeriveStepStatus, priority
// PAE > todo > anchor > host), which is the value that reaches `data-status` on the card.
//
// The WIRE view (`buildView`) states a DIFFERENT thing and is reported, never graded:
// `foldTurnEnd` (step-01) closes the row a terminal turn (`aborted` / `error` / `interrupted`) was
// running, even when the checklist still says `in_progress` — because there is no "resume from here"
// after an interruption. Measured 2026-11-02 over 168 local logs: 25 sessions end that way, and the
// panel still draws them as the table says. Those 25 are listed individually under `wireNote` with
// the seq of the table and of the terminal turn, so the difference is accounted for rather than
// silently tolerated. Verified independently: the rendered reading is 0 violations while the wire
// reading is 25.
// `order` is only claimed when the two SETS agree: otherwise the difference is already reported as
// missing/extra and re-reporting it as an order fault would double-count one defect.
//
// Exit 0 only when every session is ok / no-todo / empty. Writes todo-align.{json,txt} under the local evidence directory.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "..");
const EVIDENCE = path.join(ROOT, "evidence", "verify");

/* --- arguments ------------------------------------------------------------------------------ */
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 || at + 1 >= argv.length ? fallback : argv[at + 1];
};
const tag = flag("tag", "after");
const modulePath = path.resolve(flag("module", path.join(ROOT, "src", "fold.mjs")));
const jsonPath = path.resolve(flag("json", path.join(EVIDENCE, `todo-align-${tag}.json`)));
const txtPath = path.resolve(flag("txt", path.join(EVIDENCE, `todo-align-${tag}.txt`)));
const positional = argv.filter((value, at) => value.startsWith("--") === false && (at === 0 || argv[at - 1].startsWith("--") === false));
const sessionsRoot = path.resolve(positional[0] || path.join(process.env.USERPROFILE || "", ".dsh", "sessions"));

/* --- the fold, and its own rules ------------------------------------------------------------ */
const fold = await import(pathToFileURL(modulePath).href);
const { createInitialState, foldEvent, buildView, normalizeTitle, text, TITLE_LIMIT } = fold;
const missingExports = ["createInitialState", "foldEvent", "buildView", "normalizeTitle", "text", "TITLE_LIMIT"].filter(
  (name) => typeof fold[name] !== "function" && typeof fold[name] !== "number",
);
if (missingExports.length > 0) {
  console.error(`fold module ${modulePath} does not export ${missingExports.join(", ")} — cannot grade with the fold's own rules`);
  process.exit(2);
}

const { decompressFrames } = await import(pathToFileURL(path.join(HERE, "lib-zstd-frames.mjs")).href);

// THE RENDERED STATUS COMES FROM THE SHIPPED CLIENT HALF, NOT FROM A COPY OF ITS POLICY.
// `buildModel` applies `wfDeriveStepStatus` (PAE > todo > anchor > host) and that result is what the
// card's `data-status` shows — the thing the user compares against the conversation. Re-implementing
// that priority here would be a third rule that could drift from both. If the bundle cannot be
// loaded, the tool says so and refuses to grade rather than quietly falling back to the wire view.
const clientPath = path.join(ROOT, "client.js");
const client = fs.readFileSync(clientPath, "utf8");
const loaded = { definition: null };
new Function("window", client)({ __ModuleLoader__: { load: (definition) => (loaded.definition = definition) } });
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
};
const CLIENT = loaded.definition.factory((name) => {
  if (name === "react") return reactStub;
  throw new Error(`the client bundle asked for an unexpected dependency: ${name}`);
}).__test;
if (typeof CLIENT.buildModel !== "function") {
  console.error(`${clientPath} does not expose buildModel — cannot grade the rendered status`);
  process.exit(2);
}
/* --- every stored session ------------------------------------------------------------------- */
const sessionDirs = [];
for (const workspace of fs.readdirSync(sessionsRoot)) {
  const wsDir = path.join(sessionsRoot, workspace);
  let stat;
  try {
    stat = fs.statSync(wsDir);
  } catch {
    continue;
  }
  if (!stat.isDirectory()) continue;
  for (const session of fs.readdirSync(wsDir)) {
    const dir = path.join(wsDir, session);
    try {
      if (fs.statSync(dir).isDirectory()) sessionDirs.push({ session, dir });
    } catch {
      /* a session dir removed mid-walk is not an error */
    }
  }
}

/** The table's status word -> the fold's own step status word (the only mapping allowed). */
const TABLE_STATUS = { completed: "done", in_progress: "running", pending: "pending" };

/**
 * normalised title -> the status the PANEL actually draws for that row, plus where it came from.
 *
 * It runs the bundle's own `buildModel`, which is the same call the mounted panel makes, so this
 * reading cannot drift from the rendered card: `wfApplyDerivedStatuses` has already resolved
 * PAE > todo > anchor > host by the time its units come out. A row the panel did not draw is
 * absent from the map (criterion 1 reports that as `missing` instead).
 */
/**
 * normalised title -> the status the PANEL actually draws for that row, plus where it came from.
 *
 * It runs the bundle's own `buildModel`, the same call the mounted panel makes, so this reading
 * cannot drift from the rendered card: `wfApplyDerivedStatuses` has already resolved
 * PAE > todo > anchor > host by the time its units come out. The view handed over is the one the
 * host publishes — including ITS OWN `todos` — because that is the input the real panel receives.
 * A row the panel did not draw is absent from the map (criterion 1 reports that as `missing`).
 */
function pageStatusByKey(view, nowMs) {
  const out = new Map();
  let model = null;
  try {
    model = CLIENT.buildModel(view, CLIENT.defaultPrefs(), nowMs);
  } catch (error) {
    throw new Error(`the client bundle could not model the view: ${error.message}`);
  }
  const units = model && model.page && Array.isArray(model.page.units) ? model.page.units : [];
  for (const unit of units) {
    const key = normalizeTitle(unit.title);
    if (key === "" || out.has(key)) continue;
    out.set(key, { status: unit.status, source: unit.statusSource || "unknown" });
  }
  return out;
}

const rows = [];
const classCounts = { ok: 0, empty: 0, unreadable: 0, "no-todo": 0, missing: 0, extra: 0, order: 0, dup: 0, status: 0, counts: 0 };
const tableKeysMismatch = [];
const wireOnly = [];
for (const { session, dir } of sessionDirs) {
  const logPath = path.join(dir, "session.v4.jsonl.zstd");
  let size;
  try {
    size = fs.statSync(logPath).size;
  } catch (error) {
    rows.push({ session, ok: false, kind: "unreadable", kinds: ["unreadable"], detail: `no log file: ${error.code || error.message}`, path: logPath });
    classCounts.unreadable += 1;
    continue;
  }
  if (size === 0) {
    rows.push({ session, ok: true, kind: "empty", kinds: [], detail: "0-byte log (empty sample, nothing to align)", path: logPath, mtimeMs: fs.statSync(logPath).mtimeMs });
    classCounts.empty += 1;
    continue;
  }

  let lastTable = null;
  let tableAt = -1;
  let state = createInitialState();
  let failure = "";
  try {
    const body = decompressFrames(fs.readFileSync(logPath)).toString("utf8");
    for (const line of body.split("\n")) {
      if (line.trim() === "") continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        /* a line that will not parse is not this tool's subject; fold skips it too */
        continue;
      }
      if (event.type === "todo/write" && event.data && Array.isArray(event.data.todos)) {
        lastTable = event.data.todos;
        tableAt = typeof event.seq === "number" ? event.seq : -1;
      }
      state = foldEvent(state, event);
    }
  } catch (error) {
    failure = `${error.name || "Error"}: ${error.message}`;
  }
  if (failure !== "") {
    rows.push({ session, ok: false, kind: "unreadable", kinds: ["unreadable"], detail: `fold/log failed: ${failure}`, path: logPath });
    classCounts.unreadable += 1;
    continue;
  }

  let view;
  try {
    view = buildView(state, state.asOf);
  } catch (error) {
    rows.push({ session, ok: false, kind: "unreadable", kinds: ["unreadable"], detail: `buildView threw: ${error.name}: ${error.message}`, path: logPath });
    classCounts.unreadable += 1;
    continue;
  }

  const steps = Array.isArray(view.steps) ? view.steps : [];
  const stepKeys = steps.map((step) => normalizeTitle(text(step.title, TITLE_LIMIT)));

  /* --- no task list: exempt from set/order, still required to stay within one synthetic row --- */
  if (lastTable === null) {
    const odd = steps.length > 1;
    rows.push({
      session,
      ok: !odd,
      kind: odd ? "extra" : "no-todo",
      kinds: odd ? ["extra"] : [],
      detail: odd
        ? `no todo/write at all, yet the map draws ${steps.length} steps: ${steps.map((step) => step.title.slice(0, 20)).join(" | ")}`
        : `no todo/write at all; the map ${steps.length === 0 ? "draws nothing" : `draws the single synthetic row "${steps[0].title}"`}`,
      viewSteps: steps.length,
      tableRows: null,
    });
    if (odd) classCounts.extra += 1;
    else classCounts["no-todo"] += 1;
    continue;
  }

  const expected = lastTable
    .map((row) => {
      const content = row && typeof row.content === "string" ? row.content : "";
      return {
        // the fold's own pipeline: `text(content, TITLE_LIMIT)` is what it stores in `state.todos`,
        // and normalising exactly that is what it derives as `stepKey` / `step.title`.
        key: normalizeTitle(text(content, TITLE_LIMIT)),
        status: row && typeof row.status === "string" ? row.status : "",
        content,
      };
    })
    // THE FOLD DEDUPLICATES THE TABLE BY NORMALISED TITLE — `syncToTodos` skips a row whose key it
    // has already seen (`if (key === "" || seen.has(key)) continue`). A checker that kept both would
    // compare a 2-row table against a 1-row step list and report a phantom `order`/`missing` for a
    // row the harness itself never draws. Same rule, same order (first occurrence wins).
    .filter((row, at, all) => row.key !== "" && all.findIndex((other) => other.key === row.key) === at);
  if (expected.length === 0) {
    // empty table (a `todo/write` that clears the list) — exempt like "no todo at all", but the map
    // must not keep naming rows the empty table no longer names.
    const odd = steps.length > 1;
    rows.push({
      session,
      ok: !odd,
      kind: odd ? "extra" : "no-todo",
      kinds: odd ? ["extra"] : [],
      detail: odd
        ? `last table is EMPTY, yet the map draws ${steps.length} steps: ${steps.map((step) => step.title.slice(0, 20)).join(" | ")}`
        : `last table is empty (seq ${tableAt}); the map ${steps.length === 0 ? "draws nothing" : `draws the single synthetic row "${steps[0].title}"`}`,
      viewSteps: steps.length,
      tableRows: 0,
    });
    if (odd) classCounts.extra += 1;
    else classCounts["no-todo"] += 1;
    continue;
  }

  const kinds = [];
  const detailBits = [];

  /* 1. set equality ------------------------------------------------------------------------ */
  const expectedKeys = expected.map((row) => row.key);
  const expectedSet = new Set(expectedKeys);
  const drawnSet = new Set(stepKeys.filter((key) => key !== ""));
  const extra = stepKeys.filter((key, index) => key !== "" && !expectedSet.has(key)).map((key, at) => ({ key, step: steps[stepKeys.indexOf(key)] }));
  const missingKeys = expectedKeys.filter((key) => !drawnSet.has(key));
  if (extra.length > 0) {
    kinds.push("extra");
    detailBits.push(`${extra.length} step(s) the table does not name: ${extra.map((row) => `#${row.step.index + 1} ${String(row.step.title).slice(0, 24)}`).join(" | ")}`);
  }
  if (missingKeys.length > 0) {
    kinds.push("missing");
    const rowsAt = expected.filter((row) => missingKeys.includes(row.key)).map((row) => `"${String(row.content).slice(0, 24)}" (${row.status})`);
    detailBits.push(`${missingKeys.length} table row(s) the map does not draw: ${rowsAt.join(" | ")}`);
  }

  /* 2. order (only meaningful once the sets agree) ------------------------------------------ */
  if (extra.length === 0 && missingKeys.length === 0) {
    const wanted = expectedKeys;
    const drawn = stepKeys.filter((key) => key !== "");
    const firstDiff = wanted.findIndex((key, at) => drawn[at] !== key);
    if (firstDiff !== -1) {
      kinds.push("order");
      detailBits.push(
        `sequence differs at row ${firstDiff + 1}: table "${wanted[firstDiff]}" vs map "${drawn[firstDiff]}"` +
          ` (table ${wanted.length} rows, map ${drawn.length})`,
      );
    }
  }

  /* 3. no duplicate rows -------------------------------------------------------------------- */
  const seenKeys = new Map();
  const dups = [];
  for (const key of stepKeys) {
    if (key === "") continue;
    seenKeys.set(key, (seenKeys.get(key) || 0) + 1);
  }
  for (const [key, count] of seenKeys) if (count > 1) dups.push(`"${key}" ×${count}`);
  if (dups.length > 0) {
    kinds.push("dup");
    detailBits.push(`${dups.length} title(s) drawn more than once: ${dups.join(" | ")}`);
  }

  /* 4. status per title — graded on the RENDERED status (see the note at the top) ------------ */
  const statusRows = [];
  const wireNotes = [];
  const drawnStatus = pageStatusByKey(view, state.asOf || 0);
  for (const row of expected) {
    const mapped = TABLE_STATUS[row.status];
    const at = stepKeys.indexOf(row.key);
    if (at === -1) continue; // already reported as `missing`
    if (mapped === undefined) {
      statusRows.push(`"${row.key.slice(0, 18)}": table status "${row.status}" has no fold equivalent`);
      continue;
    }
    const rendered = drawnStatus.get(row.key);
    if (rendered !== undefined && rendered.status !== mapped) {
      statusRows.push(
        `"${row.key.slice(0, 18)}": table ${row.status} -> expected ${mapped}, PANEL draws ${rendered.status} (from ${rendered.source})`,
      );
    }
    // the WIRE reading is recorded, never graded: it is step-01's terminal-turn rule, not a
    // disagreement about what the map shows.
    if (steps[at].status !== mapped) {
      wireNotes.push({
        key: row.key,
        table: row.status,
        expected: mapped,
        wire: steps[at].status,
        wireAwaitingNextTurn: steps[at].awaitingNextTurn === true,
      });
    }
  }
  if (statusRows.length > 0) {
    kinds.push("status");
    detailBits.push(`${statusRows.length} rendered status mismatch(es): ${statusRows.join(" | ")}`);
  }

  /* 5. count self-consistency --------------------------------------------------------------- */
  const counts = view.counts && typeof view.counts === "object" ? view.counts : {};
  const running = steps.filter((step) => step.status === "running").length;
  const countRows = [];
  if (counts.steps !== steps.length) countRows.push(`counts.steps=${String(counts.steps)} but steps.length=${steps.length}`);
  if (!(typeof counts.running === "number" && counts.running <= 1)) countRows.push(`counts.running=${String(counts.running)} (>1 or not a number)`);
  if (running > 1) countRows.push(`${running} steps have status "running"`);
  if (countRows.length > 0) {
    kinds.push("counts");
    detailBits.push(countRows.join("; "));
  }

  /* advisory: did the fold read the same table this tool read? (a diagnostic, not a criterion) */
  const foldTableKeys = (Array.isArray(view.todos) ? view.todos : []).map((row) => normalizeTitle(row.content)).filter((key) => key !== "");
  if (foldTableKeys.join("\u0000") !== expectedKeys.join("\u0000")) {
    tableKeysMismatch.push({ session, fold: foldTableKeys.length, raw: expectedKeys.length });
  }

  const ok = kinds.length === 0;
  if (ok) classCounts.ok += 1;
  else for (const kind of kinds) classCounts[kind] += 1;
  rows.push({
    session,
    ok,
    kind: ok ? "ok" : kinds[0],
    kinds,
    detail: ok ? `${steps.length} step(s) match the last table (seq ${tableAt}) in title set, order and rendered status` : detailBits.join(" // "),
    viewSteps: steps.length,
    tableRows: expected.length,
    lastTableSeq: tableAt,
    // NOT GRADED — recorded so the wire/rendered split is accounted for, never silently dropped.
    wireNote: wireNotes.length > 0 ? wireNotes : undefined,
  });
  for (const note of wireNotes) wireOnly.push({ session, lastTableSeq: tableAt, ...note });
}

/* --- report --------------------------------------------------------------------------------- */
const graded = rows.length;
const failing = rows.filter((row) => row.ok !== true);

const summary = {
  tool: "tools/check-todo-align.mjs",
  generatedAt: new Date().toISOString(),
  tag,
  foldModule: modulePath,
  sessionsRoot,
  sessions: graded,
  byKind: classCounts,
  // the acceptance line: these five must all be 0
  violations: { missing: classCounts.missing, extra: classCounts.extra, order: classCounts.order, dup: classCounts.dup, status: classCounts.status },
  countsViolations: classCounts.counts,
  unreadable: classCounts.unreadable,
  ok: failing.length === 0,
  foldReadsTableDifferently: tableKeysMismatch,
  sessions_ok: classCounts.ok,
  sessions_no_todo: classCounts["no-todo"],
  sessions_empty: classCounts.empty,
  wireOnlyDiffs: wireOnly.length,
  // every wire-only difference, by session, with the seqs that explain it — accounted for, not
  // tolerated. These are NOT violations: the panel draws the table's status in every one of them.
  wireOnly: wireOnly,
};

fs.mkdirSync(EVIDENCE, { recursive: true });
fs.writeFileSync(jsonPath, JSON.stringify({ summary, rows }, null, 2), "utf8");

const lines = [];
lines.push(`step-09  todo alignment (${tag})  —  map step list vs the conversation's last todo table`);
lines.push(`generated : ${summary.generatedAt}`);
lines.push(`fold      : ${modulePath}`);
lines.push(`logs      : ${sessionsRoot}`);
lines.push("");
lines.push(`sessions          : ${graded}`);
lines.push(`ok                : ${classCounts.ok}`);
lines.push(`no-todo (exempt)  : ${classCounts["no-todo"]}`);
lines.push(`empty   (exempt)  : ${classCounts.empty}`);
lines.push(`unreadable        : ${classCounts.unreadable}`);
lines.push("");
lines.push(`missing           : ${classCounts.missing}`);
lines.push(`extra             : ${classCounts.extra}`);
lines.push(`order             : ${classCounts.order}`);
lines.push(`dup               : ${classCounts.dup}`);
lines.push(`status            : ${classCounts.status}`);
lines.push(`counts (criterion 5): ${classCounts.counts}`);
lines.push(``);
lines.push(`WIRE-ONLY (recorded, not graded) : ${wireOnly.length}`);
lines.push(`  The wire view closes a row its terminal turn was running (foldTurnEnd, step-01).`);
lines.push(`  The panel still draws the todo table's status, so these are not alignment defects.`);
lines.push(`  Each one is listed below by session so the difference stays accounted for.`);
// The wire-only differences, printed WITH the evidence that explains each one. A reader must not
 // have to take "25 is fine" on trust: the seq of the last table and of the terminal turn are here.
 if (wireOnly.length > 0) {
   lines.push(`--- wire-only differences (NOT graded; the panel draws the table's status) ---`);
   for (const note of wireOnly) {
     lines.push(
       `  ${note.session.slice(0, 26)}  "${String(note.key).slice(0, 26)}"  table ${note.table} -> wire ${note.wire}` +
         `  (last table seq ${note.lastTableSeq})` +
         (note.wireAwaitingNextTurn ? " awaiting-next-turn" : ""),
     );
   }
   lines.push("");
 }
 if (tableKeysMismatch.length > 0) {
   lines.push(`ADVISORY — the fold read a different table than this tool in ${tableKeysMismatch.length} session(s):`);
   for (const item of tableKeysMismatch) lines.push(`  ${item.session}: fold ${item.fold} key(s), raw log ${item.raw} key(s)`);
   lines.push("");
 }
if (failing.length > 0 || rows.some((row) => row.kind === "empty" || row.kind === "no-todo" || row.kind === "unreadable")) {
  lines.push("--- per session (everything that is not a plain ok goes here by name) ---");
  for (const row of rows) {
    if (row.ok === true && row.kind === "ok") continue;
    lines.push(`${row.kind.padEnd(10)} ${row.session}  ${row.detail}`);
  }
  lines.push("");
}
lines.push(summary.ok ? "ALIGN PASS — every readable session's step list matches its last task table." : "ALIGN FAIL — see the per-session rows above.");
fs.writeFileSync(txtPath, lines.join("\n") + "\n", "utf8");

console.log(lines.join("\n"));
console.log(`\njson: ${jsonPath}`);
console.log(`txt : ${txtPath}`);
process.exit(summary.ok ? 0 : 1);
