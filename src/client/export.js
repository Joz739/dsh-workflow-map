/**
 * export.js — the workflow snapshot (Markdown / JSON) and its two delivery
 * paths (clipboard, Blob download).
 *
 * Source of truth is the SAME wire view the panel renders plus the already-derived
 * model (statuses, selection, the active node). No second interpretation of the
 * session is invented here: step count and node count come from model.steps /
 * view.steps, and a node's title is exactly what NodeCard.js shows.
 *
 * Object URLs are kept in one module list and revoked when the panel unmounts, so a
 * download does not leak a Blob for the lifetime of the page.
 *
 * Pure apart from wfSnapshotDownload (which receives every browser API through
 * `env` in tests). Inlined into client.js by tools/build-client.mjs.
 */

var WF_SNAPSHOT_SCHEMA = "dsh-workflow-map.snapshot/v1";
var WF_SNAPSHOT_URLS = [];

function wfSnapshotMime(kind) {
  return kind === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8";
}

function wfSnapshotExtension(kind) {
  return kind === "json" ? "json" : "md";
}

/**
 * Session ids on this harness look like `session-f069ece7-…`. Drop that prefix,
 * then take the first 8 alphanumerics, so the filename is `workflow-f069ece7.md`
 * instead of the useless `workflow-session-.md` a naive slice would produce.
 */
function wfSnapshotTag(sessionId) {
  var flat = typeof sessionId === "string" ? sessionId : "";
  flat = flat.replace(/^session-/, "").replace(/[^A-Za-z0-9]/g, "");
  if (flat === "") flat = "session";
  return flat.slice(0, 8);
}

function wfSnapshotFileName(sessionId, kind) {
  return "workflow-" + wfSnapshotTag(sessionId) + "." + wfSnapshotExtension(kind);
}

function wfSnapshotClock(ms) {
  var value = wfFinite(ms);
  if (value === null) return "—";
  var date = new Date(value);
  if (!isFinite(date.getTime())) return "—";
  function pad(value2) {
    var text = String(value2);
    return text.length < 2 ? "0" + text : text;
  }
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " +
    pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
}

function wfSnapshotIso(ms) {
  var value = wfFinite(ms);
  if (value === null) return "";
  var date = new Date(value);
  return isFinite(date.getTime()) ? date.toISOString() : "";
}

function wfSnapshotFlat(text) {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
}

/** Whitelist one wire node exactly like store.js does for the panel. */
function wfSnapshotNode(raw, activeNodeId, say) {
  var node = raw && typeof raw === "object" ? raw : {};
  var category = wfNodeCategory(node);
  var parts = wfNodeTitleParts(node, category, say);
  var title = parts.verb === "" ? parts.target : parts.verb + " · " + parts.target;
  var fileList = [];
  if (Array.isArray(node.files)) {
    for (var i = 0; i < node.files.length; i += 1) {
      var file = node.files[i];
      if (!file || typeof file.path !== "string" || file.path === "") continue;
      fileList.push({ path: file.path, action: typeof file.action === "string" ? file.action : "" });
    }
  }
  var errorText = typeof node.error === "string" ? wfSnapshotFlat(node.error) : "";
  var resultHead = wfSnapshotFlat(node.resultHead);
  var status = errorText !== "" ? "error" : wfNodeStatus(node, activeNodeId);
  if (status === "pending" && resultHead !== "") status = "done";
  return {
    id: typeof node.id === "string" ? node.id : "",
    kind: typeof node.kind === "string" ? node.kind : "other",
    tool: typeof node.tool === "string" ? node.tool : "",
    category: category,
    title: title,
    detail: wfSnapshotFlat(node.detail).slice(0, 300),
 // The host already capped argsText at 200 chars; preserve its newlines because a
 // command's shape is part of what the snapshot is for (the panel shows it pre-wrap).
    argsText: typeof node.argsText === "string" ? node.argsText.slice(0, 200) : "",
    status: status,
    seq: wfFinite(node.seq),
    at: wfFinite(node.at),
    durationMs: wfFinite(node.durationMs),
    files: fileList,
    resultHead: resultHead.slice(0, 200),
    error: errorText.slice(0, 200),
  };
}

/** Model steps (derived status) + the view's nodeIds, joined node by node. */
function wfSnapshotSteps(model, view, say) {
  var viewSteps = view && Array.isArray(view.steps) ? view.steps : [];
  var rawNodes = view && Array.isArray(view.nodes) ? view.nodes : [];
  var byId = Object.create(null);
  for (var n = 0; n < rawNodes.length; n += 1) {
    if (rawNodes[n] && typeof rawNodes[n].id === "string") byId[rawNodes[n].id] = rawNodes[n];
  }
  var steps = model && Array.isArray(model.steps) ? model.steps : [];
  var out = [];
  for (var i = 0; i < steps.length; i += 1) {
    var row = steps[i] || {};
    var wireStep = viewSteps[i] && typeof viewSteps[i] === "object" ? viewSteps[i] : {};
    var ids = Array.isArray(wireStep.nodeIds) ? wireStep.nodeIds : [];
    var activeNodeId =
      model && model.selected === row.index && model.flow && typeof model.flow.activeNodeId === "string"
        ? model.flow.activeNodeId
        : null;
    var nodes = [];
    for (var k = 0; k < ids.length; k += 1) {
      var found = byId[ids[k]];
      if (found) nodes.push(wfSnapshotNode(found, activeNodeId, say));
    }
    var nodeCount = wfFinite(row.nodeCount) === null ? nodes.length : Math.round(row.nodeCount);
    out.push({
      index: wfFinite(row.index) === null ? i : row.index,
      planIndex: wfFinite(row.planIndex) === null ? null : row.planIndex,
      title: typeof row.title === "string" ? row.title : "—",
      status: typeof row.status === "string" ? row.status : "pending",
      statusLabel: typeof say === "function" ? say(row.statusKey) : String(row.statusKey || row.status || "—"),
      percent: wfFinite(row.percent),
      percentSource: typeof row.percentSource === "string" ? row.percentSource : "none",
      startedAt: wfFinite(row.startedAt),
      endedAt: wfFinite(row.endedAt),
      nodeCount: nodeCount,
      truncated: Math.max(0, nodeCount - nodes.length),
      nodes: nodes,
    });
  }
  return out;
}

/** The JSON body. `schema` is present even when every other field is empty. */
function wfBuildSnapshot(model, view, sessionId, nowMs, say) {
  var now = wfFinite(nowMs) === null ? Date.now() : nowMs;
  var steps = wfSnapshotSteps(model, view, say);
  return {
    schema: WF_SNAPSHOT_SCHEMA,
    generatedAt: wfSnapshotIso(now),
    generatedAtMs: Math.round(now),
    sessionId: typeof sessionId === "string" ? sessionId : "",
    task: model && typeof model.task === "string" ? model.task : "",
    progress: model && model.progress ? {
      done: model.progress.done,
      total: model.progress.total,
      percent: model.progress.percent,
    } : { done: 0, total: 0, percent: 0 },
    steps: steps,
  };
}

function wfSnapshotJson(model, view, sessionId, nowMs, say) {
  return JSON.stringify(wfBuildSnapshot(model, view, sessionId, nowMs, say), null, 2);
}

/** Markdown mirrors the panel's visible vocabulary: status, progress, node title. */
function wfSnapshotMarkdown(model, view, sessionId, nowMs, say) {
  var snapshot = wfBuildSnapshot(model, view, sessionId, nowMs, say);
  var lines = [];
  lines.push("# 总任务");
  lines.push("");
  lines.push(wfSnapshotFlat(snapshot.task) || "—");
  lines.push("");
  lines.push("- 生成时间：" + wfSnapshotClock(snapshot.generatedAtMs));
  lines.push("- 会话：" + (snapshot.sessionId || "—"));
  lines.push(
    "- 进度：" + snapshot.progress.done + "/" + snapshot.progress.total + " 步 · " + snapshot.progress.percent + "%"
  );
  lines.push("");
  lines.push("## 分步");
  for (var i = 0; i < snapshot.steps.length; i += 1) {
    var step = snapshot.steps[i];
    var percent = wfFinite(step.percent) === null ? "—" : Math.round(step.percent) + "%";
    lines.push("");
    lines.push("### " + (i + 1) + ". " + wfSnapshotFlat(step.title) + "（" + step.statusLabel + " · " + percent + "）");
    if (step.nodes.length === 0) {
      lines.push("- （无节点）");
      continue;
    }
    for (var n = 0; n < step.nodes.length; n += 1) {
      var node = step.nodes[n];
      var tool = node.tool !== "" ? node.tool : node.kind || "—";
      var files = node.files.length + " 文件";
      var duration = wfFormatDuration(node.durationMs) || "—";
      lines.push("- " + tool + " · " + wfSnapshotFlat(node.title) + " · " + files + " · " + duration);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function wfSnapshotText(kind, model, view, sessionId, nowMs, say) {
  return kind === "json"
    ? wfSnapshotJson(model, view, sessionId, nowMs, say)
    : wfSnapshotMarkdown(model, view, sessionId, nowMs, say);
}

/**
 * Copy one snapshot and paint the 1.5 s acknowledgement on `element` (the same
 * helper the node detail uses, so the two copy paths cannot diverge).
 */
function wfCopySnapshot(kind, model, view, sessionId, nowMs, say, element, env) {
  return wfCopyWithFeedback(wfSnapshotText(kind, model, view, sessionId, nowMs, say), element, say, env);
}

/**
 * Download through Blob + URL.createObjectURL. Every browser object is injectable
 * so Node can assert the filename and the revoke path without a DOM.
 */
function wfSnapshotDownload(kind, text, sessionId, env) {
  var scope = env || {};
  var doc = scope.document || (typeof document !== "undefined" ? document : null);
  var BlobImpl = scope.Blob || (typeof Blob !== "undefined" ? Blob : null);
  var URLImpl = scope.URL || (typeof URL !== "undefined" ? URL : null);
  if (!doc || typeof BlobImpl !== "function" || !URLImpl || typeof URLImpl.createObjectURL !== "function") {
    return { ok: false, reason: "unsupported", filename: "" };
  }
  if (typeof URLImpl.revokeObjectURL !== "function") {
    return { ok: false, reason: "unsupported", filename: "" };
  }
  var filename = wfSnapshotFileName(sessionId, kind);
  var anchor = doc.createElement("a");
  if (!anchor) return { ok: false, reason: "unsupported", filename: filename };
  var url = URLImpl.createObjectURL(new BlobImpl([text], { type: wfSnapshotMime(kind) }));
  WF_SNAPSHOT_URLS.push(url);
  anchor.href = url;
  anchor.download = filename;
  if (anchor.style) anchor.style.display = "none";
  if (doc.body && typeof doc.body.appendChild === "function") doc.body.appendChild(anchor);
  if (typeof anchor.click === "function") anchor.click();
  if (anchor.parentNode && typeof anchor.parentNode.removeChild === "function") anchor.parentNode.removeChild(anchor);
  return { ok: true, reason: "", filename: filename, url: url };
}

/** Release every object URL the panel created. Called from the mount cleanup. */
function wfReleaseSnapshotUrls(env) {
  var scope = env || {};
  var URLImpl = scope.URL || (typeof URL !== "undefined" ? URL : null);
  var revoked = 0;
  for (var i = 0; i < WF_SNAPSHOT_URLS.length; i += 1) {
    if (URLImpl && typeof URLImpl.revokeObjectURL === "function") {
      try {
        URLImpl.revokeObjectURL(WF_SNAPSHOT_URLS[i]);
        revoked += 1;
      } catch (error) {
 /* an already-revoked URL is not an error */
      }
    }
  }
  WF_SNAPSHOT_URLS = [];
  return revoked;
}

function wfSnapshotUrlCount() {
  return WF_SNAPSHOT_URLS.length;
}

/** The component's mount cleanup: a Blob URL must not outlive the panel. */
function wfUseSnapshotUrls() {
  React.useEffect(function () {
    return function () {
      wfReleaseSnapshotUrls();
    };
  }, []);
}
