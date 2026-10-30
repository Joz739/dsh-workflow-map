/**
 * store.js — pure data shaping + the polling loop for the workflow panel.
 *
 * Everything that can be decided WITHOUT React lives here, so tools/selftest-panel.mjs
 * can exercise it in Node with no DOM and no React: preferences, the poll request and
 * its 304/200/4xx/5xx outcomes, session-id resolution, and the view → model build.
 *
 * Inlined into client.js by tools/build-client.mjs (single-file browser half).
 */

/* ------------------------------------------------------------------------- */
/* numbers */
/* ------------------------------------------------------------------------- */

/** A finite number, or null. Used so a missing `percent` never becomes NaN. */
function wfFinite(value) {
  return typeof value === "number" && isFinite(value) ? value : null;
}

function wfClamp(value, lo, hi) {
  var n = wfFinite(value);
  if (n === null) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

function wfRound(value) {
  var n = wfFinite(value);
  return n === null ? null : Math.round(n);
}

/* ------------------------------------------------------------------------- */
/* preferences — keeps ONLY what the panel still owns */
/* ------------------------------------------------------------------------- */

/**
 * `width` / `height` are no longer written by the UI — the layout owns both —
 * but they are still READ and sanitised, because a record written by ..12 sits in
 * every user's localStorage. Keeping the two fields means an upgrade never throws away
 * `collapsed` / `selectedStep` / the presentation settings just because an old record
 * happens to carry a size.
 */
function wfDefaultPrefs() {
  var display = wfDefaultSettings();
  return {
    width: WF_DEFAULT_WIDTH,
    height: WF_DEFAULT_HEIGHT,
    collapsed: WF_DEFAULT_COLLAPSED,
    selectedStep: null,
    palette: display.palette,
    motion: display.motion,
    detail: display.detail,
    nodeLimit: display.nodeLimit,
 // the single-page layout's right-hand page. `rightOpen` says the page is shown (the
 // user clicked a main-flow unit, a round satellite, or hot injection); `rightKind` / `rightKey` say
 // WHAT it shows. A stale (kind, key) pair is harmless — the page finds no content and
 // renders the empty hint — so nothing here is re-validated against the live view.
    rightOpen: false,
    rightKind: "step",
    rightKey: null,
  };
}
/**
 * Sanitise one stored record. Bad input never throws and never yields NaN:
 * a hand-edited or stale (older step) record degrades to the defaults.
 */
function wfSanitizePrefs(input) {
  var base = wfDefaultPrefs();
  if (!input || typeof input !== "object") return base;
  if (wfFinite(input.width) !== null) {
    base.width = Math.round(wfClamp(input.width, WF_MIN_WIDTH, WF_MAX_WIDTH));
  }
  if (wfFinite(input.height) !== null) {
    var h = wfClamp(input.height, 0, WF_MAX_HEIGHT);
    base.height = h > 0 && h < WF_MIN_HEIGHT ? WF_MIN_HEIGHT : Math.round(h);
  }
  if (typeof input.collapsed === "boolean") base.collapsed = input.collapsed;
  if (wfFinite(input.selectedStep) !== null) {
    var index = Math.round(input.selectedStep);
    base.selectedStep = index >= 0 ? index : null;
  }
  if (typeof input.rightOpen === "boolean") base.rightOpen = input.rightOpen;
  if (WF_RIGHT_KINDS.indexOf(input.rightKind) >= 0) base.rightKind = input.rightKind;
  if (typeof input.rightKey === "string" && input.rightKey !== "") base.rightKey = input.rightKey;
  var display = wfSanitizeSettings(input, base);
  base.palette = display.palette;
  base.motion = display.motion;
  base.detail = display.detail;
  base.nodeLimit = display.nodeLimit;
  return base;
}

/** Parse the raw localStorage string (or an already-parsed object). */
function wfParsePrefs(raw) {
  if (raw && typeof raw === "object") return wfSanitizePrefs(raw);
  if (typeof raw !== "string" || raw === "") return wfDefaultPrefs();
  try {
    return wfSanitizePrefs(JSON.parse(raw));
  } catch (error) {
    return wfDefaultPrefs();
  }
}

function wfLoadPrefs(storage) {
  try {
    var store = storage;
    if (!store) {
      store = typeof window !== "undefined" && window ? window.localStorage : null;
    }
    if (!store || typeof store.getItem !== "function") return wfDefaultPrefs();
    return wfParsePrefs(store.getItem(WF_PREFS_KEY));
  } catch (error) {
 // A disabled / quota-exhausted / partitioned localStorage is NOT an error the
 // panel may die on: it just means "no memory this session".
    return wfDefaultPrefs();
  }
}

function wfSavePrefs(prefs, storage) {
  try {
    var store = storage;
    if (!store) {
      store = typeof window !== "undefined" && window ? window.localStorage : null;
    }
    if (!store || typeof store.setItem !== "function") return false;
    store.setItem(WF_PREFS_KEY, JSON.stringify(wfSanitizePrefs(prefs)));
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Merge one patch into the previous prefs. `patch` may be a plain object or a
 * function of the previous value (the same shape React's updater takes), so the
 * keyboard shortcut and the drag handlers never race on a stale closure.
 */
function wfApplyPrefsPatch(prev, patch) {
  var base = wfSanitizePrefs(prev);
  var next = typeof patch === "function" ? patch(base) : patch;
  if (!next || typeof next !== "object") return base;
  var display = wfSanitizeSettings(next, base);
  var merged = {
    width: wfFinite(next.width) === null ? base.width : next.width,
    height: wfFinite(next.height) === null ? base.height : next.height,
    collapsed: typeof next.collapsed === "boolean" ? next.collapsed : base.collapsed,
    selectedStep:
      next.selectedStep === null
        ? null
        : wfFinite(next.selectedStep) === null
          ? base.selectedStep
          : next.selectedStep,
    palette: display.palette,
    motion: display.motion,
    detail: display.detail,
    nodeLimit: display.nodeLimit,
 // the right page. `rightKey: null` means "keep whatever was open" — closing is
 // expressed with `rightOpen: false`, so clearing the key is never ambiguous.
    rightOpen: typeof next.rightOpen === "boolean" ? next.rightOpen : base.rightOpen,
    rightKind: WF_RIGHT_KINDS.indexOf(next.rightKind) >= 0 ? next.rightKind : base.rightKind,
    rightKey:
      next.rightKey === null
        ? null
        : typeof next.rightKey === "string" && next.rightKey !== ""
          ? next.rightKey
          : base.rightKey,
  };
  return wfSanitizePrefs(merged);
}

/* ------------------------------------------------------------------------- */
/* the poll request */
/* ------------------------------------------------------------------------- */

function wfPollUrl(sessionId) {
  return "/dsh-workflow/state?sessionId=" + encodeURIComponent(String(sessionId));
}

/**
 * One conditional GET. Never throws: every outcome is a value, so the loop can
 * always decide what to render and how long to wait.
 *
 * @returns {Promise<{status:number, etag:string, payload:any, error:string}>}
 * 304 → keep the current view; 200 → new payload; anything else → `error`.
 */
function wfPollOnce(fetchImpl, url, etag, signal) {
  var headers = {};
  if (typeof etag === "string" && etag !== "") headers["If-None-Match"] = etag;
  var init = { cache: "no-store", headers: headers };
  if (signal) init.signal = signal;
  return Promise.resolve()
    .then(function () {
      if (typeof fetchImpl !== "function") throw new Error("fetch unavailable");
      return fetchImpl(url, init);
    })
    .then(function (response) {
      var nextTag = etag || "";
      if (response && response.headers && typeof response.headers.get === "function") {
        var tag = response.headers.get("ETag");
        if (typeof tag === "string" && tag !== "") nextTag = tag;
      }
      if (response && response.status === 304) {
        return { status: 304, etag: etag || "", payload: null, error: "" };
      }
      if (!response || response.ok !== true) {
        var status = response && wfFinite(response.status) !== null ? response.status : 0;
        return {
          status: status,
          etag: nextTag,
          payload: null,
          error: status === 0 ? "network error" : "HTTP " + status,
        };
      }
      return response.json().then(function (payload) {
        if (!payload || payload.ok !== true) {
          return { status: response.status, etag: nextTag, payload: null, error: "bad payload" };
        }
        return { status: 200, etag: nextTag, payload: payload, error: "" };
      });
    })
    .catch(function (error) {
 // An aborted request is NOT a failure: the caller cancelled it (visibility
 // change or unmount). status -1 says "nothing to report" so the loop neither
 // paints an offline badge nor schedules a duplicate poll.
      var aborted = !!error && error.name === "AbortError";
      return {
        status: aborted ? -1 : 0,
        etag: etag || "",
        payload: null,
        error: (error && error.message) || String(error),
      };
    });
}

/* ------------------------------------------------------------------------- */
/* ------------------------------------------------------------------------- */
/* the write request */
/* ------------------------------------------------------------------------- */

// `wfPostSteer` lives in HotInject.js (it is the inject column's own request shape, and the
// self-test drives it from there). This comment marks the section boundary only: the panel's
// ONE write is defined exactly once in the bundle.

/* ------------------------------------------------------------------------- */
/* session identity */
/* ------------------------------------------------------------------------- */

/* ------------------------------------------------------------------------- */
/**
 * `useSessions` hands the component a selector result. `snapshot.current` is the
 * active session id (verified against the live SessionsSnapshot: it is an index
 * into `byId`, not a record). When there is no current session — e.g. the frame
 * outlives the chat column — fall back to the session the main view is retaining
 * (`retainedBy.mainView`), choosing the most-retained, then the most recent.
 */
function wfSessionIdFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  var current = snapshot.current;
  if (typeof current === "string" && current !== "") return current;
  var byId = snapshot.byId;
  if (!byId || typeof byId !== "object") return null;
  var bestId = null;
  var bestViews = 0;
  var bestAt = -1;
  for (var id in byId) {
    if (!Object.prototype.hasOwnProperty.call(byId, id)) continue;
    var record = byId[id];
    if (!record || typeof record !== "object") continue;
    var views = wfFinite(record.retainedBy && record.retainedBy.mainView);
    if (views === null || views <= 0) continue;
    var at = wfFinite(record.lastActivityAt);
    if (at === null) at = wfFinite(record.updatedAt);
    if (at === null) at = 0;
    if (views > bestViews || (views === bestViews && at > bestAt)) {
      bestId = id;
      bestViews = views;
      bestAt = at;
    }
  }
  return bestId;
}

/* ------------------------------------------------------------------------- */
/* view → model */
/* ------------------------------------------------------------------------- */

var WF_STATUS_KEYS = {
  done: "panel.status.done",
  running: "panel.status.running",
  failed: "panel.status.failed",
  skipped: "panel.status.skipped",
  pending: "panel.status.pending",
};
var WF_KIND_KEYS = {
  tool: "panel.kind.tool",
  message: "panel.kind.message",
  report: "panel.kind.report",
  subagent: "panel.kind.subagent",
  question: "panel.kind.question",
  approval: "panel.kind.approval",
};

function wfStatusKey(status) {
  return WF_STATUS_KEYS[status] || "panel.status.pending";
}

function wfKindKey(kind) {
  return WF_KIND_KEYS[kind] || "panel.kind.other";
}

function wfTrimText(value, limit) {
  if (typeof value !== "string") return "";
  var text = value.replace(/\s+/g, " ").trim();
 // The ellipsis counts toward the limit, so a 300-char budget stays 300 chars.
  if (typeof limit === "number" && text.length > limit) return text.slice(0, Math.max(0, limit - 1)) + "…";
  return text;
}

/**
 * The header's number for one step. A step the plan closed is 100 % by
 * definition; everything else contributes whatever its own estimate says, and a
 * step with no estimate contributes 0 rather than NaN.
 */
function wfEffectivePercent(row) {
  if (row.status === "done") return 100;
  var value = wfFinite(row.percent);
  return value === null ? 0 : wfClamp(value, 0, 100);
}

/**
 * The plan section reduced to what the cards need. Every field is optional on
 * the wire (a plan written by an older PAE has no `skipped`), so each one has an
 * honest fallback instead of a dereference.
 */
function wfPlanSummary(plan) {
  if (!plan || typeof plan !== "object") return null;
  var confirmations = Object.create(null);
  if (Array.isArray(plan.steps)) {
    for (var i = 0; i < plan.steps.length; i += 1) {
      var row = plan.steps[i];
      if (row && wfFinite(row.index) !== null && row.requiresConfirmation === true) {
        confirmations[String(Math.round(row.index))] = true;
      }
    }
  }
  var stepReports = [];
  if (Array.isArray(plan.stepReports)) {
    for (var r = 0; r < plan.stepReports.length && stepReports.length < 60; r += 1) {
      var report = plan.stepReports[r];
      if (!report || wfFinite(report.stepIndex) === null) continue;
      var artifacts = [];
      if (Array.isArray(report.artifacts)) {
        for (var a = 0; a < report.artifacts.length && artifacts.length < 40; a += 1) {
          if (typeof report.artifacts[a] === "string" && report.artifacts[a] !== "") {
            artifacts.push(wfTrimText(report.artifacts[a], 300));
          }
        }
      }
      stepReports.push({
        stepIndex: Math.round(report.stepIndex),
        status: typeof report.status === "string" ? wfTrimText(report.status, 40) : "",
        summary: wfTrimText(report.summary, 400),
        artifacts: artifacts,
        exitCode: wfFinite(report.exitCode) === null ? null : Math.round(report.exitCode),
      });
    }
  }
  return {
    statuses: plan.statuses && typeof plan.statuses === "object" ? plan.statuses : {},
    anchorSeqs: plan.anchorSeqs && typeof plan.anchorSeqs === "object" ? plan.anchorSeqs : {},
    skipped: Array.isArray(plan.skipped) ? plan.skipped.slice() : [],
    stepIndex: wfFinite(plan.stepIndex) === null ? null : Math.round(plan.stepIndex),
    confirmations: confirmations,
    stepReports: stepReports,
  };
}

/** The PAE report for a step ordinal (1-based `planIndex`), or null. */
function wfStepReport(plan, planIndex) {
  if (!plan || !Array.isArray(plan.stepReports) || wfFinite(planIndex) === null) return null;
  var wanted = Math.round(planIndex);
  for (var i = 0; i < plan.stepReports.length; i += 1) {
    var report = plan.stepReports[i];
    if (report && wfFinite(report.stepIndex) !== null && Math.round(report.stepIndex) === wanted) return report;
  }
  return null;
}

/**
 * The selected step's detail: its report (PAE) and honest statistics from the nodes the
 * host actually sent. `truncated` is the difference to the step's OWN nodeCount, so a
 * 300-node cap is stated rather than silently under-counted.
 */
function wfBuildStepDetail(row, nodes, plan) {
  if (!row) return null;
  var list = Array.isArray(nodes) ? nodes : [];
  var seen = Object.create(null);
  var files = 0;
  var tools = 0;
  var firstAt = null;
  var lastAt = null;
  for (var i = 0; i < list.length; i += 1) {
    var node = list[i];
    if (!node) continue;
    if (node.kind === "tool") tools += 1;
    var fileList = Array.isArray(node.fileList) ? node.fileList : [];
    for (var f = 0; f < fileList.length; f += 1) {
      var path = fileList[f] && fileList[f].path;
      if (typeof path !== "string" || path === "" || seen[path] === true) continue;
      seen[path] = true;
      files += 1;
    }
    var at = wfFinite(node.at);
    if (at !== null && at > 0) {
      if (firstAt === null) firstAt = at;
      lastAt = at;
    }
  }
  var startedAt = wfFinite(row.startedAt);
  if (startedAt === null || startedAt <= 0) startedAt = firstAt;
  var endedAt = wfFinite(row.endedAt);
  if (endedAt === null || endedAt <= 0) endedAt = row.status === "done" ? lastAt : null;
  var nodeCount = wfFinite(row.nodeCount) === null ? list.length : Math.round(row.nodeCount);
  return {
    index: row.index,
    planIndex: row.planIndex === undefined ? null : row.planIndex,
    title: row.title,
    status: row.status,
    statusKey: row.statusKey,
    tools: tools,
    files: files,
    nodes: nodeCount,
    truncated: Math.max(0, nodeCount - list.length),
    startedAt: startedAt,
    endedAt: endedAt,
    report: wfStepReport(plan, row.planIndex),
  };
}

/** The todo table, bounded and repaired: only content/status are ever read. */
function wfTodoRows(todos) {
  if (!Array.isArray(todos)) return [];
  var out = [];
  for (var i = 0; i < todos.length && out.length < 200; i += 1) {
    var todo = todos[i];
    if (!todo || typeof todo !== "object") continue;
    out.push({
      content: wfTrimText(todo.content, 200),
      status: typeof todo.status === "string" ? todo.status : "",
    });
  }
  return out;
}

/**
 * Build the render model, or null when the panel must not exist at all.
 *
 * Empty state rules ( contract §3):
 * - no steps and no PAE plan still being written → null (NOTHING is rendered)
 * - plan.phase === "planning" with no steps yet -> a one-line "planning..." card
 * - otherwise → right/left two-column model
 */
/* ------------------------------------------------------------------------- */
/* tool FILE TYPES (the satellites' data source) */
/* ------------------------------------------------------------------------- */

/**
 * Compound extensions that must stay one token: `a.step` and `a.txt` are different tool files,
 * and `cadflow-A3FIX-20261011.md` is a markdown file, not a `.20261011` file.
 */
var WF_TYPE_COMPOUND = [
  ".tar.gz",
  ".tar.bz2",
  ".tar.xz",
  ".test.ts",
  ".spec.ts",
  ".min.js",
];

/**
 * A tool call's file extension → the badge printed inside its circle.
 *
 * `.md` is printed as `md`, `.dxf` as `dxf`, `.tar.gz` as `tar` — the badge must fit a 26 px
 * circle, so it is the extension WITHOUT the dot. Anything longer than four characters keeps its
 * first three letters. No extension → `file`.
 */
function wfTypeBadge(ext) {
  if (typeof ext !== "string" || ext === "") return "file";
  var bare = ext.replace(/^\./, "");
  if (bare === "tar.gz" || bare === "tar.bz2" || bare === "tar.xz") return "tar";
  if (bare.length <= 4) return bare;
  return bare.slice(0, 3);
}

/* ------------------------------------------------------------------------- */
/* hot-inject history (pure shaping, no DOM) */
/* ------------------------------------------------------------------------- */

/** How many rows the composer page lists; the oldest fall off with a stated count. */
var WF_INJECT_HISTORY = 40;

/**
 * The wire's `view.injects` → what the composer page renders.
 *
 * Each row keeps the three facts the user asked for: WHAT was injected (the text), WHEN
 * (`at`, the splice's own event time — never a browser clock), and its STATUS, which is one
 * of two words with different meanings:
 * `pending` — the message is in the session's inbox; the turn has not picked it up yet.
 * `picked` — the session's own `user/message` with the same id is in the log, i.e. the
 * running turn HAS taken it. This is measured, not assumed.
 *
 * A row without an id cannot be matched, so it is dropped rather than listed as status-less.
 */
function wfInjectRows(list) {
  if (!Array.isArray(list)) return [];
  var rows = [];
  for (var i = 0; i < list.length; i += 1) {
    var row = list[i];
    if (!row || typeof row !== "object") continue;
    var id = typeof row.id === "string" ? row.id : "";
    if (id === "") continue;
    rows.push({
      id: id,
      at: wfFinite(row.at),
      pickedUpAt: wfFinite(row.pickedUpAt),
      target: typeof row.target === "string" ? row.target : "",
      text: wfTrimText(row.text, 300),
 // three states, not two: a message the loop DISCARDED (durable cancel) is neither
 // "waiting" nor "taken" — it will never be read. Only the host's own
 // `agent/inbox/discarded` event sets this, so it is never inferred.
      status: row.pickedUp === true ? "picked" : row.canceled === true ? "canceled" : "pending",
      canceledAt: wfFinite(row.canceledAt),
    });
  }
  if (rows.length > WF_INJECT_HISTORY) {
    return rows.slice(rows.length - WF_INJECT_HISTORY);
  }
  return rows;
}

/** `.md` → `.md`; a path with no dot → `""` (the "no extension" bucket). */
function wfTypeOfPath(path) {
  if (typeof path !== "string" || path === "") return "";
  var flat = path.replace(/\\/g, "/");
  var base = flat.slice(flat.lastIndexOf("/") + 1).toLowerCase();
  if (base === "") return "";
  for (var i = 0; i < WF_TYPE_COMPOUND.length; i += 1) {
    var compound = WF_TYPE_COMPOUND[i];
    if (base.length > compound.length && base.slice(-compound.length) === compound) return compound;
  }
  var at = base.lastIndexOf(".");
 // A leading dot is a dotfile (`.gitignore`): its own type, not "no extension".
  if (at === 0) return base;
  if (at <= 0) return "";
  return base.slice(at);
}

/** Which side a host file action lives on: read/query -> left (input), write/edit -> right (output). */
function wfTypeSide(action) {
  var label = typeof action === "string" ? action.trim().toLowerCase() : "";
  if (
    label === "读" ||
    label === "read" ||
    label === "查" ||
    label === "glob" ||
    label === "grep" ||
    label === "list" ||
    label === "query"
  ) {
    return "left";
  }
  return "right";
}

/**
 * Bucket ONE step's nodes into file types (the satellites), split by side.
 *
 * Input is the browser model's node list: every node carries `fileList[{path, action}]` and a
 * `tool`. Pure — it reads nothing else and never touches the DOM, so selftest-panel can assert
 * the buckets without a browser.
 *
 * A type is a KEY: `file:.md` for a file extension, `tool:pwsh` for a call whose only evidence is
 * the tool name. A call that touched a file counts under that file's type only (its tool is
 * already visible in the call's own row); a call that touched nothing gets a tool circle on the
 * right - that is where "tools called" lives.
 */
function wfTypeBuckets(nodes, activeNodeId) {
  var list = Array.isArray(nodes) ? nodes : [];
  var active = typeof activeNodeId === "string" && activeNodeId !== "" ? activeNodeId : null;
  var byKey = Object.create(null);

  function slot(key, kind, label) {
    var bucket = byKey[key];
    if (!bucket) {
      bucket = {
        key: key,
        kind: kind,
        label: label,
        side: kind === "tool" ? "right" : "left",
        count: 0,
        error: false,
        running: false,
        nodes: [],
        seen: Object.create(null),
      };
      byKey[key] = bucket;
    }
    return bucket;
  }

  for (var i = 0; i < list.length; i += 1) {
    var node = list[i];
    if (!node || typeof node !== "object") continue;
    var id = typeof node.id === "string" ? node.id : "";
    var tool = typeof node.tool === "string" && node.tool !== "" ? node.tool : "";
    var files = Array.isArray(node.fileList) ? node.fileList : [];
    var touched = false;
    for (var f = 0; f < files.length; f += 1) {
      var file = files[f];
      if (!file || typeof file.path !== "string" || file.path === "") continue;
      var ext = wfTypeOfPath(file.path);
      var bucket = slot("file:" + ext, "file", ext === "" ? "file" : wfTypeBadge(ext));
      if (wfTypeSide(file.action) === "right") bucket.side = "right";
      touched = true;
      if (bucket.count >= WF_SIDE_FILES) continue;
      bucket.count += 1;
      if (node.error === true) bucket.error = true;
      if (id !== "" && bucket.seen[id] !== true) {
        bucket.seen[id] = true;
        bucket.nodes.push(id);
        if (id === active) bucket.running = true;
      }
    }
    if (!touched && tool !== "") {
      var toolBucket = slot("tool:" + tool, "tool", tool.length > 6 ? tool.slice(0, 6) : tool);
      toolBucket.side = "right";
      if (toolBucket.count < WF_SIDE_FILES) {
        toolBucket.count += 1;
        if (node.error === true) toolBucket.error = true;
        if (id !== "" && toolBucket.seen[id] !== true) {
          toolBucket.seen[id] = true;
          toolBucket.nodes.push(id);
          if (id === active) toolBucket.running = true;
        }
      }
    }
  }
  return byKey;
}

/**
 * The buckets of ONE step, in the order they are drawn, split into the two sides.
 *
 * Ordering is by count (the type that matters most sits closest to the unit), ties broken by
 * label so two renders of the same data never swap places. Each side keeps WF_SIDE_SLOTS
 * circles; `dropped` states how many types did not fit — the card prints that number, so a
 * crowded step is honest rather than silently trimmed.
 */
function wfTypeSides(nodes, activeNodeId) {
  var byKey = wfTypeBuckets(nodes, activeNodeId);
  var all = [];
  var keys = Object.keys(byKey);
  for (var i = 0; i < keys.length; i += 1) {
    var bucket = byKey[keys[i]];
    all.push({
      key: bucket.key,
      kind: bucket.kind,
      label: bucket.label,
      side: bucket.side === "right" ? "right" : "left",
      tone: bucket.kind === "tool" ? "tool" : bucket.side === "left" ? "read" : "edit",
      count: bucket.count,
      running: bucket.running === true,
      error: bucket.error === true,
      nodes: bucket.nodes.slice(),
    });
  }
  all.sort(function (left, right) {
    if (left.count !== right.count) return right.count - left.count;
    return left.label < right.label ? -1 : left.label > right.label ? 1 : 0;
  });
  var sides = { left: [], right: [], dropped: { left: 0, right: 0 }, all: all };
  for (var b = 0; b < all.length; b += 1) {
    var one = all[b];
    var side = one.side === "right" ? "right" : "left";
    if (sides[side].length >= WF_SIDE_SLOTS) {
      sides.dropped[side] += 1;
      continue;
    }
    sides[side].push(one);
  }
  return sides;
}

/* ------------------------------------------------------------------------- */
/* the model */
/* ------------------------------------------------------------------------- */

function wfBuildModel(view, prefs, nowMs) {
  if (!view || typeof view !== "object" || !Array.isArray(view.steps)) return null;

  var plan = view.plan && typeof view.plan === "object" ? view.plan : null;
  var planSteps = plan && Array.isArray(plan.steps) ? plan.steps : [];
  var planning = !!(plan && plan.phase === "planning" && planSteps.length === 0);
  var task = "";
  if (plan) task = wfTrimText(plan.taskTitle || plan.task, 300);
  if (task === "") task = wfTrimText(view.task, 300);

 // the single page keeps ONE selected step: the unit the user last opened. The policy is
 // unchanged (a remembered index wins, then the running step, then the active one, then the last
 // done step, then the first) — what changed is only that the page no longer needs a second
 // "selected" notion for the flow column, because the flow column is gone.
  var steps = view.steps;
  if (steps.length === 0) {
    if (!planning) return null;
    return {
      kind: "planning",
      planning: true,
      task: task,
      progress: { done: 0, total: 0, percent: 0 },
      activeStep: null,
      selected: null,
 // palette / motion / detail depth / node window travel with the model,
 // so a preference change is one ordinary re-render (no second state channel).
      settings: wfSettingsOf(prefs),
 // Is the session actually working? The curve, both wrapped frames and the
 // breathing dot all freeze when it is not — see pulse.js wfSessionRunning for the
 // three signals and why the host's own `view.running` wins when it exists.
      running: wfSessionRunning(view, null, nowMs),
      steps: [],
      flow: {
        stepTitle: "",
        nodes: [],
        total: 0,
        truncated: 0,
        stepNodeTotal: 0,
        groups: [],
        activeNodeId: null,
        branches: [],
        hiddenBranches: 0,
        branchDropped: 0,
      },
 // the single page has nothing to draw while the plan is still being written; the
 // shape is present so the renderer never has to branch on "does page exist".
      page: { units: [], runningIndex: null, toolTypes: [] },
      counts: view.counts && typeof view.counts === "object" ? view.counts : null,
      plan: wfPlanSummary(plan),
 // the hot-inject history travels with the model, so the composer page can list
 // what was sent and whether the session admitted it (see wfInjectRows).
      injects: wfInjectRows(view.injects),
    };
  }

  var activeIndex = null;
  if (view.active && wfFinite(view.active.stepIndex) !== null) {
    activeIndex = Math.round(view.active.stepIndex);
    if (activeIndex < 0 || activeIndex >= steps.length) activeIndex = null;
  }

  var nodeById = Object.create(null);
  if (Array.isArray(view.nodes)) {
    for (var n = 0; n < view.nodes.length; n += 1) {
      var node = view.nodes[n];
      if (node && typeof node.id === "string") nodeById[node.id] = node;
    }
  }

  var planSummary = wfPlanSummary(plan);
  var todos = wfTodoRows(view.todos);

  var rows = [];
  for (var i = 0; i < steps.length; i += 1) {
    var step = steps[i] && typeof steps[i] === "object" ? steps[i] : {};
    var status = typeof step.status === "string" ? step.status : "pending";
    var percent = wfFinite(step.percent);
    var clampedPercent = percent === null ? null : wfClamp(percent, 0, 100);
    rows.push({
      index: i,
      title: wfTrimText(step.title, 200) || "—",
      status: status,
      statusKey: wfStatusKey(status),
      percent: clampedPercent === null ? null : Math.round(clampedPercent),
      percentSource: typeof step.percentSource === "string" ? step.percentSource : "none",
 // when the last progress estimate arrived (0 = never). The rail uses it for the
 // "estimated N minutes ago" segment and prints nothing at all when it is 0.
      lastEstimateAt: wfFinite(step.lastEstimateAt) === null ? 0 : Math.max(0, Math.round(wfFinite(step.lastEstimateAt))),
      nodeCount: wfFinite(step.nodeCount) === null ? 0 : step.nodeCount,
      planIndex: wfFinite(step.planIndex) === null ? null : step.planIndex,
      anchorSeq: wfFinite(step.anchorSeq),
      reportSummary: wfTrimText(step.reportSummary, 200),
      startedAt: wfFinite(step.startedAt),
      endedAt: wfFinite(step.endedAt),
      outcome: typeof step.outcome === "string" ? wfTrimText(step.outcome, 200) : "",
      requiresConfirmation: false,
      statusSource: "host",
      rawStatus: status,
      active: activeIndex === i,
      selected: false,
    });
  }

 // The status policy (PAE > todo > anchorSeqs > host, see StepColumn.js) lives
 // in the step column but is applied HERE, so the header's done-count, the
 // running-step selection and every card's badge cannot disagree.
  rows = wfApplyDerivedStatuses(rows, planSummary, todos);

  var done = 0;
  var percentSum = 0;
  var runningIndex = null;
  for (var r = 0; r < rows.length; r += 1) {
    if (rows[r].status === "done") done += 1;
    if (rows[r].status === "running" && runningIndex === null) runningIndex = r;
 // Overall progress = the mean of every step's own estimate, so a long running
 // step moves the header between completions instead of freezing at done/total.
    percentSum += wfEffectivePercent(rows[r]);
  }
 // ONE live row. The host already closes stray running rows (fold.mjs soleRunning);
 // this is the browser's own guard, because the PAE/todo status policy applied just above can
 // ALSO promote a row to 'running'. Everything that animates (ring, rail, connector, the
 // flowing tool type) keys off `live`, so at most one of each can ever light up.
  var liveIndex = runningIndex;
  if (liveIndex === null && activeIndex !== null) liveIndex = activeIndex;
  for (var lr = 0; lr < rows.length; lr += 1) rows[lr].live = lr === liveIndex;

  var percentOverall = Math.round(wfClamp(percentSum / steps.length, 0, 100));

 // Selection: remember the user's pick, drop it if it no longer exists, then fall
 // back to the running step, the active step, the last done step, or the first.
  var selected = null;
  var wanted = prefs && wfFinite(prefs.selectedStep) !== null ? Math.round(prefs.selectedStep) : null;
  if (wanted !== null && wanted >= 0 && wanted < rows.length) selected = wanted;
  if (selected === null && runningIndex !== null) selected = runningIndex;
  if (selected === null && activeIndex !== null) selected = activeIndex;
  if (selected === null) {
    for (var d = rows.length - 1; d >= 0; d -= 1) {
      if (rows[d].status === "done") {
        selected = d;
        break;
      }
    }
  }
  if (selected === null) selected = 0;
  rows[selected].selected = true;

  var step = steps[selected] && typeof steps[selected] === "object" ? steps[selected] : {};
  var order = Array.isArray(step.nodeIds) ? step.nodeIds : [];
  var flowNodes = [];
  for (var k = 0; k < order.length; k += 1) {
    var found = nodeById[order[k]];
    if (!found) continue; // a globally-truncated node is simply absent, never a hole
    var firstFile = Array.isArray(found.files) && found.files.length > 0 ? found.files[0] : null;
    flowNodes.push({
      id: typeof found.id === "string" ? found.id : "n" + k,
      kind: typeof found.kind === "string" ? found.kind : "other",
      kindKey: wfKindKey(found.kind),
      tool: wfTrimText(found.tool, 40),
      title: wfTrimText(found.title, 160) || wfTrimText(found.detail, 160) || "—",
      detail: wfTrimText(found.detail, 200),
      files: Array.isArray(found.files) ? found.files.length : 0,
 // The first path is what the card titles itself with ("read · x.js"): basename
 // only, the full path stays in the tooltip.
      path: firstFile && typeof firstFile.path === "string" ? firstFile.path : "",
 // The detail block needs the whole file list (paths + host action labels) — the card
 // above only counts them. `fileList` is a whitelist copy: `files` on the wire could
 // carry anything, and only path/action ever reach the renderer.
      fileList: Array.isArray(found.files)
        ? found.files
            .filter(function (file) {
              return file && typeof file.path === "string" && file.path !== "";
            })
            .map(function (file) {
              return { path: file.path, action: typeof file.action === "string" ? file.action : "" };
            })
        : [],
 // The args digest / result head / error text are bounded by the host (200 chars).
 // They are copied verbatim — never flattened — because the detail renders them in a
 // pre-wrap block and a command's newlines are part of what the user asked to see.
      argsText: typeof found.argsText === "string" ? found.argsText.slice(0, 200) : "",
      resultLine: typeof found.resultHead === "string" ? found.resultHead.slice(0, 200) : "",
      errorText: typeof found.error === "string" ? found.error.slice(0, 200) : "",
      seq: wfFinite(found.seq),
      error: typeof found.error === "string" && found.error !== "",
      // The host's result boolean is the settled fact: a call that returned with an EMPTY body is
      // settled. Falling back to resultHead alone marked such a call unsettled, so the panel kept
      // it in the "calling right now" state and its dot pulsed after the call had already returned.
      result: found.result === true || (typeof found.resultHead === "string" && found.resultHead !== ""),
      durationMs: wfFinite(found.durationMs),
      at: wfFinite(found.at),
    });
  }

 // The selected step's own detail : the report + statistics from the nodes above.
  var detail = wfBuildStepDetail(rows[selected], flowNodes, planSummary);

 // Host fold records are copied field by field: they are only RANGES over the node
 // list above (FlowColumn resolves them), so a group whose ids are missing here can
 // never hide a node.
  var flowGroups = [];
  if (Array.isArray(step.groups)) {
    for (var g = 0; g < step.groups.length; g += 1) {
      var rawGroup = step.groups[g];
      if (!rawGroup || typeof rawGroup !== "object") continue;
      flowGroups.push({
        key: typeof rawGroup.key === "string" ? rawGroup.key : "",
        tool: typeof rawGroup.tool === "string" ? rawGroup.tool : "",
        firstId: typeof rawGroup.firstId === "string" ? rawGroup.firstId : "",
        lastId: typeof rawGroup.lastId === "string" ? rawGroup.lastId : "",
        count: wfFinite(rawGroup.count) === null ? 0 : rawGroup.count,
        firstAt: wfFinite(rawGroup.firstAt),
        lastAt: wfFinite(rawGroup.lastAt),
      });
    }
  }

 // Branch lanes — the parallel work of THIS step, reduced to what Branches.js
 // draws. A lane that started before any step existed (stepIndex null) belongs to the
 // first step. Only the newest WF_BRANCH_SHOWN lanes are drawn; the rest are counted by
 // the renderer, and lanes the HOST dropped at its own cap are counted separately — the
 // two numbers have different causes and must not be merged.
  var branchRows = [];
  var allBranches = Array.isArray(view.branches) ? view.branches : [];
  for (var bi = 0; bi < allBranches.length; bi += 1) {
    var rawBranch = allBranches[bi];
    if (!rawBranch || typeof rawBranch !== "object") continue;
    var branchStep = wfFinite(rawBranch.stepIndex);
    if (branchStep !== null && Math.round(branchStep) !== selected) continue;
    if (branchStep === null && selected !== 0) continue;
    var branchNodes = [];
    if (Array.isArray(rawBranch.nodes)) {
      for (var bn = 0; bn < rawBranch.nodes.length; bn += 1) {
        var rawNode = rawBranch.nodes[bn];
        if (!rawNode || typeof rawNode !== "object") continue;
        branchNodes.push({
          id: typeof rawNode.id === "string" ? rawNode.id : "b" + bi + "n" + bn,
          kind: typeof rawNode.kind === "string" ? rawNode.kind : "row",
          tool: wfTrimText(rawNode.tool, 40),
          title: wfTrimText(rawNode.title, 160) || "—",
          detail: wfTrimText(rawNode.detail, 200),
          at: wfFinite(rawNode.at),
          status: typeof rawNode.status === "string" ? rawNode.status : "",
        });
      }
    }
    var branchCount = wfFinite(rawBranch.count);
    var branchTrunc = wfFinite(rawBranch.truncated);
    branchRows.push({
      id: typeof rawBranch.id === "string" ? rawBranch.id : "branch-" + bi,
      kind: typeof rawBranch.kind === "string" ? rawBranch.kind : "subagent",
      label: wfTrimText(rawBranch.label, 160),
      status: typeof rawBranch.status === "string" ? rawBranch.status : "running",
      startedAt: wfFinite(rawBranch.startedAt),
      endedAt: wfFinite(rawBranch.endedAt),
      count: branchCount === null ? branchNodes.length : branchCount,
      truncated:
        branchTrunc === null
          ? Math.max(0, (branchCount === null ? branchNodes.length : branchCount) - branchNodes.length)
          : Math.max(0, branchTrunc),
      nodes: branchNodes,
    });
  }
  branchRows.sort(function (left, right) {
    var leftAt = left.startedAt === null ? 0 : left.startedAt;
    var rightAt = right.startedAt === null ? 0 : right.startedAt;
    return leftAt - rightAt;
  });
  var hiddenBranches = 0;
  if (branchRows.length > WF_BRANCH_SHOWN) {
    hiddenBranches = branchRows.length - WF_BRANCH_SHOWN;
    branchRows = branchRows.slice(branchRows.length - WF_BRANCH_SHOWN);
  }
  var branchDropped = wfFinite(view.droppedBranches) === null ? 0 : Math.max(0, view.droppedBranches);

 // The pulsing node is only "current" while its OWN step is the selected one.
 // The pulsing node is only "current" while its OWN step is the selected one.
  var activeNodeId = null;
  if (activeIndex !== null && activeIndex === selected && view.active && typeof view.active.nodeId === "string") {
    activeNodeId = view.active.nodeId;
  }

 // the single page. EVERY step becomes one unit on the serial main flow, with its own
 // satellites, so the page needs each step's nodes — not only the selected step's. The same
 // whitelist copy is used (path/action only), so a satellite can never carry anything the
 // selected step's flow would refuse to show.
  var pageUnits = [];
  for (var u = 0; u < rows.length; u += 1) {
    var unitStep = steps[u] && typeof steps[u] === "object" ? steps[u] : {};
    var unitIds = Array.isArray(unitStep.nodeIds) ? unitStep.nodeIds : [];
    var unitNodes = [];
    var unitTools = Object.create(null);
    var unitFiles = Object.create(null);
    var unitToolCount = 0;
    for (var ui = 0; ui < unitIds.length; ui += 1) {
      var unitRaw = nodeById[unitIds[ui]];
      if (!unitRaw) continue;
      if (unitRaw.kind === "tool") {
        unitToolCount += 1;
        if (typeof unitRaw.tool === "string" && unitRaw.tool !== "") unitTools[unitRaw.tool] = true;
      }
      var unitFilesWire = Array.isArray(unitRaw.files) ? unitRaw.files : [];
      for (var uf = 0; uf < unitFilesWire.length; uf += 1) {
        var unitFile = unitFilesWire[uf];
        if (unitFile && typeof unitFile.path === "string" && unitFile.path !== "") unitFiles[unitFile.path] = true;
      }
      unitNodes.push({
        id: typeof unitRaw.id === "string" ? unitRaw.id : "n" + u + "-" + ui,
        tool: wfTrimText(unitRaw.tool, 40),
        error: typeof unitRaw.error === "string" && unitRaw.error !== "",
        fileList: unitFilesWire
          .filter(function (file) {
            return file && typeof file.path === "string" && file.path !== "";
          })
          .map(function (file) {
            return { path: file.path, action: typeof file.action === "string" ? file.action : "" };
          }),
      });
    }
 // The running step's own active call lights its satellite; every other step gets none.
    var unitActive = activeIndex === u && view.active && typeof view.active.nodeId === "string" ? view.active.nodeId : "";
    var unitSides = wfTypeSides(unitNodes, unitActive);
    pageUnits.push({
      index: u,
      title: rows[u].title,
      status: rows[u].status,
      statusKey: rows[u].statusKey,
      statusSource: rows[u].statusSource,
      planIndex: rows[u].planIndex,
      active: rows[u].active,
 // the ONE flag every animated piece reads (ring, rail, connector, tool type).
      live: rows[u].live === true,
      percent: rows[u].percent,
      percentSource: rows[u].percentSource,
      lastEstimateAt: rows[u].lastEstimateAt,
      startedAt: rows[u].startedAt,
      toolCount: unitToolCount,
      requiresConfirmation: rows[u].requiresConfirmation === true,
      pendingConfirm: Array.isArray(rows[u].pendingConfirm) ? rows[u].pendingConfirm : [],
      fileCount: Object.keys(unitFiles).length,
      left: unitSides.left,
      right: unitSides.right,
      dropped: unitSides.dropped,
      types: unitSides.all,
    });
  }
  var pageRunningIndex = runningIndex === null ? null : runningIndex;

  return {
    kind: "ready",
    planning: false,
    task: task,
    progress: { done: done, total: steps.length, percent: percentOverall },
    activeStep: activeIndex,
    selected: selected,
 // the one flag the living layer switches on. Derived AFTER activeNodeId, because
 // "a node is mid-call right now" is the strongest non-host signal there is.
    running: wfSessionRunning(view, activeNodeId, nowMs),
    steps: rows,
    flow: {
      stepTitle: rows[selected].title,
      nodes: flowNodes,
      total: flowNodes.length,
 // "omitted" count must cover EVERY missing node, not only the per-step cap: the
 // global 1200-node cap also prunes a step's id list while leaving
 // step.truncatedNodes at 0. The honest gap is nodeCount − drawn.
      truncated: Math.max(
        wfFinite(step.truncatedNodes) === null ? 0 : step.truncatedNodes,
        (wfFinite(step.nodeCount) === null ? flowNodes.length : step.nodeCount) - flowNodes.length
      ),
      stepNodeTotal: wfFinite(step.nodeCount) === null ? flowNodes.length : step.nodeCount,
      groups: flowGroups,
      activeNodeId: activeNodeId,
      branches: branchRows,
      hiddenBranches: hiddenBranches,
      branchDropped: branchDropped,
    },
 // the single page: one unit per step, its satellites, and the index of the step the
 // chain should bring to the middle. `types` is every bucket (not only the drawn ones), so the
 // right page can show the ones the card could not fit.
    page: {
      units: pageUnits,
      runningIndex: pageRunningIndex,
      toolTypes: WF_TYPE_COMPOUND.slice(),
    },
    counts: view.counts && typeof view.counts === "object" ? view.counts : null,
    plan: planSummary,
 // the selected step's report + statistics, or null for the planning card.
    detail: detail,
    settings: wfSettingsOf(prefs),
    todos: todos,
 // the hot-inject history (the host's own fold of `agent/inbox/spliced` + the
 // admitting `user/message`). Oldest first, bounded, never invented.
    injects: wfInjectRows(view.injects),
    asOf: wfFinite(view.asOf),
    now: wfFinite(nowMs),
  };
}
