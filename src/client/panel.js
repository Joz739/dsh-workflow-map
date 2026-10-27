/**
 * panel.js — the React component, its hooks and the pure renderer.
 *
 * Structure:
 * wfMakeSay dictionary lookup with {placeholder} interpolation + fallback
 * wfUseSessionId props.useSessions → the active session id
 * wfUsePrefs localStorage-backed {width, height, collapsed, selectedStep}
 * wfUseSnap the 800 ms / 3 s conditional poll loop
 * wfUseStyle <style id="dsh-workflow-map-css">, removed on unmount
 * wfUseAltW Alt+W toggles collapsed
 * wfUseSessionReset drops a remembered step selection when the session changes
 * WorkflowMapPanel the overlay occupant
 * wfRenderPanel PURE: (model, prefs, say, actions, ui) → element tree | null
 * apply registration
 *
 * `wfRenderPanel` is deliberately hook-free so tools/selftest-panel.mjs can drive it
 * with a fake `createElement` and assert the exact tree the frame will mount.
 *
 * Inlined into client.js by tools/build-client.mjs (single-file browser half).
 */

/* ------------------------------------------------------------------------- */
/* locale */
/* ------------------------------------------------------------------------- */

// Flat dotted keys (the dsh-context convention). zh/en must carry IDENTICAL key
// sets; a half-translated dictionary would ship a raw key to the user.
var DICT_ZH = {
  "panel.aria": "工作流地图：{task}",
  "panel.title": "工作流地图",
  "panel.task.fallback": "当前会话",
  "panel.progress": "{done}/{total} 步 · {percent}%",
  "panel.planning": "规划中…",
  "panel.planning.note": "计划尚未提交，提交后会显示分步。",
  "panel.collapse": "收起",
  "panel.expand": "展开",
  "panel.settings": "设置",
  "panel.steps": "总任务分步",
  "panel.flow": "分步流程",
  "panel.flow.empty": "这一步还没有动作",
  "panel.nodes": "{count} 个节点",
  "panel.step.nodes": "{count} 节点",
  "panel.files": "{count} 文件",
  "panel.node.error": "失败",
  "panel.truncated": "已省略 {count} 个节点",
  "panel.flow.step": "第 {n} 步 · {title}",
  "panel.flow.group": "{count} 个连续 {tool}",
  "panel.flow.range": "{first}–{last}",
  "panel.flow.more": "更早 {count} 个被折叠",
  "panel.flow.showAll": "展开全部",
  "panel.flow.expandGroup": "展开分组",
  "panel.flow.collapseGroup": "收起分组",
 // the round branch icons. The ARIA label says WHAT each circle is (read / edit / the
 // tool being called), because a bare glyph is not a name; the visible label under it is the
 // short form of the same fact.
  "panel.flow.icon.read": "读取",
  "panel.flow.icon.edit": "修改",
  "panel.flow.icon.tool": "工具",
  "panel.flow.branch": "{kind} {count} 处",
  "panel.flow.branch.aria": "{count} 条分支（读取 / 修改 / 调用的工具）",
  "panel.flow.branch.open": "展开{kind}详情",
  "panel.flow.branch.close": "收起{kind}详情",
  "panel.branch": "支线",
  "panel.branch.subagent": "子代理",
  "panel.branch.workflow": "工作流",
  "panel.branch.job": "后台任务",
  "panel.branch.nodes": "{count} 个活动",
  "panel.branch.more": "另有 {count} 条支线",
  "panel.branch.dropped": "较早 {count} 条支线已省略",
  "panel.branch.truncated": "支线内已省略 {count} 个活动",
  "panel.branch.expand": "展开支线",
  "panel.branch.collapse": "收起支线",
  "panel.node.verb.read": "读",
  "panel.node.verb.write": "写",
  "panel.node.verb.edit": "改",
  "panel.node.verb.glob": "列",
  "panel.node.verb.grep": "搜",
  "panel.node.verb.undo": "撤",
  "panel.node.verb.command": "命令",
  "panel.node.verb.skill": "技能",
  "panel.node.verb.subagent": "子代理",
  "panel.node.pending": "无结果记录",
  "panel.status.done": "已完成",
  "panel.status.running": "进行中",
  "panel.status.failed": "失败",
  "panel.status.skipped": "已跳过",
  "panel.status.pending": "待执行",
  "panel.kind.tool": "工具",
  "panel.kind.message": "消息",
  "panel.kind.report": "报告",
  "panel.kind.subagent": "子代理",
  "panel.kind.question": "提问",
  "panel.kind.approval": "审批",
  "panel.kind.other": "其他",
  "panel.percent.estimate": "~{percent}% 估算",
  "panel.percent.self": "{percent}% 自报",
 // Measured basis (todo-list completion ratio), kept strictly distinct from the self-reported value / "estimated".
  "panel.percent.real": "{percent}% 实测",
 // the rail's second line. {duration} is already formatted ("3 minutes"), and the
 // wording says where the number came from — an estimate, not a measurement.
  "panel.percent.ago": "{duration}前估计",
  "panel.percent.unknown": "时间未知",
  "panel.live": "正在",
  "panel.step.confirm": "需确认",
  "panel.step.progress": "{title} 进度",
 // — node detail + step detail. Keep these suffixes LOWERCASE: build-client
 // counts `panel.*` keys to prove zh/en carry the same set, and the pattern is [a-z.]+.
  "panel.detail.aria": "节点详情：{tool}",
  "panel.detail.category.file": "文件",
  "panel.detail.category.command": "命令",
  "panel.detail.category.skill": "技能",
  "panel.detail.category.subagent": "子代理",
  "panel.detail.category.cad": "CAD",
  "panel.detail.category.other": "其他",
  "panel.detail.action.read": "读取",
  "panel.detail.action.edit": "修改",
  "panel.detail.action.write": "写入",
  "panel.detail.action.query": "查询",
  "panel.detail.action.other": "其他",
  "panel.detail.args": "参数",
  "panel.detail.showargs": "查看完整参数",
  "panel.detail.showcommand": "查看完整命令",
  "panel.detail.copy": "复制",
  "panel.detail.copyargs": "复制参数",
  "panel.detail.copypath": "复制路径",
  "panel.detail.copied": "已复制",
  "panel.detail.copyfailed": "复制失败",
  "panel.detail.files": "文件",
  "panel.detail.nofiles": "未涉及文件",
  "panel.detail.result": "结果",
  "panel.detail.error": "错误",
  "panel.detail.noerror": "无错误文本",
  "panel.detail.noresult": "无结果记录",
  "panel.detail.noargs": "无参数记录",
  "panel.detail.started": "开始",
  "panel.detail.ended": "结束",
  "panel.detail.duration": "耗时",
  "panel.detail.argscap": "参数按宿主上限截断为 200 字",
  "panel.detail.errorcap": "错误文本为宿主记录的首行（上限 200 字）",
  "panel.detail.unknowntool": "未知工具",
  "panel.step.head": "第 {n} 步 · {tools} 工具 · {files} 文件",
  "panel.step.detailtitle": "第 {n} 步详情",
  "panel.step.expand": "展开这一步详情",
  "panel.step.collapse": "收起这一步详情",
  "panel.step.detailopen": "展开分步详情",
  "panel.step.detailclose": "收起分步详情",
  "panel.step.detailaria": "第 {n} 步详情",
  "panel.step.report": "报告",
  "panel.step.noreport": "这一步还没交报告",
  "panel.step.nosummary": "报告没有摘要",
  "panel.step.artifacts": "产物",
  "panel.step.noartifacts": "未列产物",
  "panel.step.exit": "退出码",
  "panel.step.tools": "{count} 工具",
  "panel.step.files": "{count} 文件",
  "panel.step.nodescount": "{count} 节点",
  "panel.step.truncatedcount": "另有 {count} 个节点宿主未发送",
  "panel.step.unknowntime": "无时间记录",
  "panel.settings.endpoint": "数据源",
  "panel.settings.counts": "{steps} 步 / {nodes} 节点",
  "panel.settings.rev": "版本 {rev}",
  "panel.settings.reset": "恢复默认",
  "panel.settings.reset.hint": "恢复配色、动效、详情深度与节点上限",
  "panel.settings.palette": "配色",
  "panel.settings.palette.rainbow": "彩虹",
  "panel.settings.palette.brand": "品牌",
  "panel.settings.palette.soft": "柔和",
  "panel.settings.motion": "动效",
  "panel.settings.motion.full": "运行中",
  "panel.settings.motion.always": "始终",
  "panel.settings.motion.static": "关闭",
  "panel.settings.detail": "详情",
  "panel.settings.detail.summary": "摘要",
  "panel.settings.detail.title": "只看标题",
  "panel.settings.limit": "节点上限",
  "panel.settings.limit.all": "全部",
  "panel.settings.export": "工作流快照",
  "panel.settings.export.markdown": "复制 Markdown",
  "panel.settings.export.json": "复制 JSON",
  "panel.settings.export.downloadmarkdown": "下载 .md",
  "panel.settings.export.downloadjson": "下载 .json",
  "panel.stale": "离线（显示上次数据）",
 // the inject column. `sent` is the ONLY success word — a failure prints
 // the HOST's own reason, so no failure string of ours is ever shown instead of it.
 // the single page and its right-hand page.
  "panel.page.main": "主流程",
  "panel.page.step": "第 {n} 步详情",
  "panel.page.types": "这一步用到的工具文件",
  "panel.page.noTypes": "这一步没有文件或工具调用记录",
  "panel.page.typeStep": "第 {n} 步 · {label}",
  "panel.page.typeSession": "全会话 · {label}",
  "panel.page.typeSub": "范围：{step}，共 {count} 处调用",
  "panel.page.wholeSession": "全会话",
  "panel.page.typeEmpty": "这一类还没有可列出的调用",
  "panel.page.truncated": "另有 {count} 处调用未随视图发送",
  "panel.page.count": "{count} 处",
  "panel.page.kind.file": "文件类型",
  "panel.page.kind.tool": "调用工具",
  "panel.page.sat.label": "{label}（{kind}）{count} 处，点击查看这一类调用",
  "panel.page.moreTypes": "另有 {count} 类未画在两侧",
  "panel.page.close": "关闭这一页",
  "panel.page.noReport": "这一步的详情还没有随视图发送",
  "panel.page.inject": "热注入",
  "panel.inject.banner": "⚡ 热注入",
 // the badge on the header button. {count} is the number of rows
 // the SESSION has not taken yet — never a number this side invents.
  "panel.inject.pending.badge": "{count} 条待会话拾取",
  "panel.inject.open": "热注入提示词",
  "panel.inject.title": "热注入",
  "panel.inject.hint": "发送后会在当前轮次的下一步进入会话，不打断正在做的事。",
  "panel.inject.placeholder": "补充一句提示词…",
  "panel.inject.send": "发送",
  "panel.inject.sending": "发送中…",
  "panel.inject.cancel": "取消",
  "panel.inject.sent": "已注入",
  "panel.inject.unknown": "注入失败（宿主未给出原因）",
  "panel.inject.counter": "{used}/{max}",
 // the history rows. `picked` and `pending` are the two status words; they are NOT
 // synonyms — the first is measured evidence, the second is "still waiting".
  "panel.inject.history": "热注入历史",
  "panel.inject.history.empty": "还没有热注入记录",
  "panel.inject.row.picked": "会话已接下",
  "panel.inject.row.pending": "待会话拾取",
 // Revoke-related strings. The host now exposes a real inbox revoke API, so the wording states the fact:
 // what the button does = `POST /dsh-workflow/unsteer` -> host `inbox.remove`; only after that does the log's
 // `agent/inbox/spliced { outcome: 'canceled' }` turn the row into "revoked".
  "panel.inject.row.canceled": "已撤销",
  "panel.inject.revoke": "撤回",
  "panel.inject.revoke.hint": "这条还在收件箱里、当前轮次尚未取用，所以可以撤回。撤回后它不会进入会话；一旦被轮次接下，就只能等它执行。",
  "panel.inject.revoking": "撤回中…",
  "panel.inject.revoke.failed": "撤回失败（宿主未给出原因）",
  "capsule.aria": "打开工作流地图面板",
  "capsule.title": "工作流地图",
  "capsule.progress": "{done}/{total} · {percent}%",
  "capsule.hint": "点击展开",
};

var DICT_EN = {
  "panel.aria": "Workflow map: {task}",
  "panel.title": "Workflow map",
  "panel.task.fallback": "Current session",
  "panel.progress": "{done}/{total} steps · {percent}%",
  "panel.planning": "Planning…",
  "panel.planning.note": "The plan has not been submitted yet; steps appear after it is.",
  "panel.collapse": "Collapse",
  "panel.expand": "Expand",
  "panel.settings": "Settings",
  "panel.steps": "Task steps",
  "panel.flow": "Step flow",
  "panel.flow.empty": "No actions in this step yet",
  "panel.nodes": "{count} nodes",
  "panel.step.nodes": "{count} nodes",
  "panel.files": "{count} files",
  "panel.node.error": "failed",
  "panel.truncated": "{count} nodes omitted",
  "panel.flow.step": "Step {n} · {title}",
  "panel.flow.group": "{count} consecutive {tool}",
  "panel.flow.range": "{first}–{last}",
  "panel.flow.more": "{count} earlier nodes folded",
  "panel.flow.showAll": "Show all",
  "panel.flow.expandGroup": "Expand group",
  "panel.flow.collapseGroup": "Collapse group",
 // the round branch icons.
  "panel.flow.icon.read": "Read",
  "panel.flow.icon.edit": "Edit",
  "panel.flow.icon.tool": "Tool",
  "panel.flow.branch": "{kind} ×{count}",
  "panel.flow.branch.aria": "{count} branches (read / edit / tool)",
  "panel.flow.branch.open": "Expand {kind} detail",
  "panel.flow.branch.close": "Collapse {kind} detail",
  "panel.branch": "Branches",
  "panel.branch.subagent": "Subagent",
  "panel.branch.workflow": "Workflow",
  "panel.branch.job": "Background job",
  "panel.branch.nodes": "{count} activities",
  "panel.branch.more": "{count} more branches",
  "panel.branch.dropped": "{count} earlier branches omitted",
  "panel.branch.truncated": "{count} activities omitted in this branch",
  "panel.branch.expand": "Expand branch",
  "panel.branch.collapse": "Collapse branch",
  "panel.node.verb.read": "Read",
  "panel.node.verb.write": "Write",
  "panel.node.verb.edit": "Edit",
  "panel.node.verb.glob": "List",
  "panel.node.verb.grep": "Search",
  "panel.node.verb.undo": "Undo",
  "panel.node.verb.command": "Command",
  "panel.node.verb.skill": "Skill",
  "panel.node.verb.subagent": "Subagent",
  "panel.node.pending": "No result recorded",
  "panel.status.done": "Done",
  "panel.status.running": "Running",
  "panel.status.failed": "Failed",
  "panel.status.skipped": "Skipped",
  "panel.status.pending": "Pending",
  "panel.kind.tool": "Tool",
  "panel.kind.message": "Message",
  "panel.kind.report": "Report",
  "panel.kind.subagent": "Subagent",
  "panel.kind.question": "Question",
  "panel.kind.approval": "Approval",
  "panel.kind.other": "Other",
  "panel.percent.estimate": "~{percent}% est.",
  "panel.percent.self": "{percent}% self",
 // measured (todo-table completion ratio), distinct from self/estimate.
  "panel.percent.real": "{percent}% measured",
  "panel.percent.ago": "{duration} ago",
  "panel.percent.unknown": "time unknown",
  "panel.live": "Working",
 // same keys as the zh dictionary — the shape self-test asserts the two
 // key sets are identical.
 // the single page and its right-hand page (same keys as the zh dictionary).
  "panel.page.main": "Main flow",
  "panel.page.step": "Step {n} details",
  "panel.page.types": "Tool files this step used",
  "panel.page.noTypes": "No file or tool call recorded for this step",
  "panel.page.typeStep": "Step {n} · {label}",
  "panel.page.typeSession": "Whole session · {label}",
  "panel.page.typeSub": "Scope: {step} · {count} calls",
  "panel.page.wholeSession": "whole session",
  "panel.page.typeEmpty": "No call of this type to list yet",
  "panel.page.truncated": "{count} more calls were not sent with the view",
  "panel.page.count": "{count} calls",
  "panel.page.kind.file": "file type",
  "panel.page.kind.tool": "tool",
  "panel.page.sat.label": "{label} ({kind}), {count} calls — click to see this type's calls",
  "panel.page.moreTypes": "{count} more types are not drawn on the sides",
  "panel.page.close": "Close this page",
  "panel.page.noReport": "This step's details have not been sent with the view yet",
  "panel.page.inject": "Hot inject",
  "panel.inject.banner": "⚡ Hot inject",
  "panel.inject.pending.badge": "{count} waiting for the turn",
  "panel.inject.open": "Hot-inject a prompt",
  "panel.inject.title": "Hot inject",
  "panel.inject.hint": "Sent text enters the session at the NEXT STEP of the current turn; it does not interrupt the work in progress.",
  "panel.inject.placeholder": "Add a prompt…",
  "panel.inject.send": "Send",
  "panel.inject.sending": "Sending…",
  "panel.inject.cancel": "Cancel",
  "panel.inject.sent": "Injected",
  "panel.inject.unknown": "Injection failed (the host gave no reason)",
  "panel.inject.counter": "{used}/{max}",
  "panel.inject.history": "Hot-inject history",
  "panel.inject.history.empty": "No hot-inject yet",
  "panel.inject.row.picked": "taken by the session",
  "panel.inject.row.pending": "waiting for the turn",
  "panel.inject.row.canceled": "revoked",
  "panel.inject.revoke": "Revoke",
  "panel.inject.revoke.hint": "Still queued and not claimed by the running turn, so it can be taken back. A revoked message never enters the session; once the turn has claimed it, it can only run.",
  "panel.inject.revoking": "Revoking…",
  "panel.inject.revoke.failed": "Revoke failed (the host gave no reason)",
  "panel.step.confirm": "Needs confirm",
  "panel.step.progress": "Progress of {title}",
  "panel.detail.aria": "Node detail: {tool}",
  "panel.detail.category.file": "File",
  "panel.detail.category.command": "Command",
  "panel.detail.category.skill": "Skill",
  "panel.detail.category.subagent": "Subagent",
  "panel.detail.category.cad": "CAD",
  "panel.detail.category.other": "Other",
  "panel.detail.action.read": "Read",
  "panel.detail.action.edit": "Edited",
  "panel.detail.action.write": "Written",
  "panel.detail.action.query": "Searched",
  "panel.detail.action.other": "Other",
  "panel.detail.args": "Arguments",
  "panel.detail.showargs": "Show full arguments",
  "panel.detail.showcommand": "Show full command",
  "panel.detail.copy": "Copy",
  "panel.detail.copyargs": "Copy arguments",
  "panel.detail.copypath": "Copy path",
  "panel.detail.copied": "Copied",
  "panel.detail.copyfailed": "Copy failed",
  "panel.detail.files": "Files",
  "panel.detail.nofiles": "No files touched",
  "panel.detail.result": "Result",
  "panel.detail.error": "Error",
  "panel.detail.noerror": "No error text",
  "panel.detail.noresult": "No result recorded",
  "panel.detail.noargs": "No arguments recorded",
  "panel.detail.started": "Started",
  "panel.detail.ended": "Ended",
  "panel.detail.duration": "Duration",
  "panel.detail.argscap": "Arguments are capped at the host's 200 characters",
  "panel.detail.errorcap": "The host stores the error's first line (200 characters max)",
  "panel.detail.unknowntool": "Unknown tool",
  "panel.step.head": "Step {n} · {tools} tools · {files} files",
  "panel.step.detailtitle": "Step {n} details",
  "panel.step.expand": "Show this step's details",
  "panel.step.collapse": "Hide this step's details",
  "panel.step.detailopen": "Show step details",
  "panel.step.detailclose": "Hide step details",
  "panel.step.detailaria": "Step {n} details",
  "panel.step.report": "Report",
  "panel.step.noreport": "No report for this step yet",
  "panel.step.nosummary": "The report has no summary",
  "panel.step.artifacts": "Artifacts",
  "panel.step.noartifacts": "No artifacts listed",
  "panel.step.exit": "Exit code",
  "panel.step.tools": "{count} tools",
  "panel.step.files": "{count} files",
  "panel.step.nodescount": "{count} nodes",
  "panel.step.truncatedcount": "{count} nodes not sent by the host",
  "panel.step.unknowntime": "No time recorded",
  "panel.settings.endpoint": "Endpoint",
  "panel.settings.counts": "{steps} steps / {nodes} nodes",
  "panel.settings.rev": "rev {rev}",
  "panel.settings.reset": "Restore defaults",
  "panel.settings.reset.hint": "Restore palette, motion, detail depth and node limit",
  "panel.settings.palette": "Palette",
  "panel.settings.palette.rainbow": "Rainbow",
  "panel.settings.palette.brand": "Brand",
  "panel.settings.palette.soft": "Soft",
  "panel.settings.motion": "Motion",
  "panel.settings.motion.full": "While working",
  "panel.settings.motion.always": "Always",
  "panel.settings.motion.static": "Off",
  "panel.settings.detail": "Detail",
  "panel.settings.detail.summary": "Summary",
  "panel.settings.detail.title": "Title only",
  "panel.settings.limit": "Node limit",
  "panel.settings.limit.all": "All",
  "panel.settings.export": "Workflow snapshot",
  "panel.settings.export.markdown": "Copy Markdown",
  "panel.settings.export.json": "Copy JSON",
  "panel.settings.export.downloadmarkdown": "Download .md",
  "panel.settings.export.downloadjson": "Download .json",
  "panel.stale": "Offline (last data shown)",
  "capsule.aria": "Open the workflow map panel",
  "capsule.title": "Workflow map",
  "capsule.progress": "{done}/{total} · {percent}%",
  "capsule.hint": "Click to expand",
};

var WF_DICTS = { zh: DICT_ZH, en: DICT_EN };

/**
 * `props.t` is the framework translator for this slot's locale namespace. It is
 * used when present; when it is absent (a bare mount, a future seat rename, or a
 * Node smoke test) the same dictionaries above answer instead of a raw key.
 */
function wfMakeSay(t) {
  return function say(key, params) {
    var text = null;
    if (typeof t === "function") {
      try {
        text = t(key);
      } catch (error) {
        text = null;
      }
    }
    if (typeof text !== "string" || text === "" || text === key) {
      text = WF_DICTS.zh[key] || WF_DICTS.en[key] || key;
    }
    if (params && typeof params === "object") {
      text = text.replace(/\{(\w+)\}/g, function (match, name) {
        return params[name] === undefined || params[name] === null ? match : String(params[name]);
      });
    }
    return text;
  };
}

function wfProgressText(say, progress) {
  return say("panel.progress", {
    done: progress.done,
    total: progress.total,
    percent: progress.percent,
  });
}

/* ------------------------------------------------------------------------- */
/* hooks */
/* ------------------------------------------------------------------------- */

/** The active session id, or null. `useSessions` is a standard prop of BOTH seats this
 * plugin occupies (`main` and `sidebar.panellist`), so the panel keeps reading it the
 * same way it did on the overlay. */
function wfUseSessionId(props) {
  var useSessions = props && props.useSessions;
  if (typeof useSessions !== "function") return null;
  var snapshot = useSessions(function (value) {
    return value;
  });
  return wfSessionIdFromSnapshot(snapshot);
}

/** localStorage-backed prefs; every update is persisted by an effect. */
function wfUsePrefs() {
  var pair = React.useState(function () {
    return wfLoadPrefs();
  });
  var prefs = pair[0];
  var setPrefs = pair[1];

  function update(patch) {
    setPrefs(function (prev) {
      return wfApplyPrefsPatch(prev, patch);
    });
  }

  React.useEffect(
    function () {
      wfSavePrefs(prefs);
    },
    [prefs.width, prefs.height, prefs.collapsed, prefs.selectedStep,
      prefs.palette, prefs.motion, prefs.detail, prefs.nodeLimit]
  );

  return { prefs: prefs, update: update };
}

/**
 * Poll `/dsh-workflow/state` with If-None-Match. Reading is the only thing this
 * hook does: no writes, no host calls, no projections.
 *
 * The snapshot is dropped to `loading` the moment the session id changes, so a
 * switch can never show the previous session's steps ( §4 acceptance).
 */
function wfUseSnap(sessionId) {
  var pair = React.useState(function () {
    return { status: sessionId ? "loading" : "idle", view: null, rev: null, error: "" };
  });
  var snap = pair[0];
  var setSnap = pair[1];

  React.useEffect(
    function () {
      if (!sessionId) {
        setSnap({ status: "idle", view: null, rev: null, error: "" });
        return undefined;
      }

      var stopped = false;
      var timer = 0;
      var controller = null;
      var etag = "";

      setSnap({ status: "loading", view: null, rev: null, error: "" });

      function schedule(delay) {
        if (stopped) return;
        timer = window.setTimeout(tick, delay);
      }

      function delayForPage() {
        return document.visibilityState === "visible" ? WF_POLL_VISIBLE : WF_POLL_HIDDEN;
      }

      function tick() {
        if (stopped) return;
        var delay = delayForPage();
        if (controller && typeof controller.abort === "function") {
          try {
            controller.abort();
          } catch (error) {
 /* an already-settled request has nothing to abort */
          }
        }
        controller = typeof AbortController === "function" ? new AbortController() : null;
        var signal = controller ? controller.signal : undefined;
        wfPollOnce(window.fetch, wfPollUrl(sessionId), etag, signal).then(function (result) {
          if (stopped) return;
 // -1 = this request was aborted by a newer one (visibility change): the
 // newer tick already owns the loop, so stay silent and do not re-arm.
          if (result.status === -1) return;
          if (result.status === 304) {
            setSnap(function (prev) {
              return prev.view ? { status: "live", view: prev.view, rev: prev.rev, error: "" } : prev;
            });
          } else if (result.status === 200) {
            etag = result.etag || etag;
            setSnap({
              status: "live",
              view: result.payload.view || null,
              rev: wfFinite(result.payload.rev),
              error: "",
            });
          } else {
            setSnap(function (prev) {
              return {
                status: prev.view ? "stale" : "error",
                view: prev.view,
                rev: prev.rev,
                error: result.error,
              };
            });
          }
          schedule(delay);
        });
      }

      function onVisibilityChange() {
        if (document.visibilityState !== "visible") return;
        window.clearTimeout(timer);
        tick();
      }

      tick();
      document.addEventListener("visibilitychange", onVisibilityChange);
      return function () {
        stopped = true;
        window.clearTimeout(timer);
        if (controller && typeof controller.abort === "function") {
          try {
            controller.abort();
          } catch (error) {
 /* ignore */
          }
        }
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    },
    [sessionId]
  );

  return snap;
}

/** The stylesheet lives exactly as long as the mount. */
function wfUseStyle() {
  React.useEffect(function () {
    var element = document.getElementById(WF_STYLE_ID);
    if (!element) {
      element = document.createElement("style");
      element.id = WF_STYLE_ID;
      document.head.appendChild(element);
    }
    element.textContent = WF_CSS;
    return function () {
      var current = document.getElementById(WF_STYLE_ID);
      if (current && current.parentNode) current.parentNode.removeChild(current);
    };
  }, []);
}

/** Alt+W toggles the collapsed state; the listener is removed on unmount. */
function wfUseAltW(updatePrefs) {
  React.useEffect(function () {
    function onKeyDown(event) {
      if (!event || !event.altKey || event.ctrlKey || event.metaKey) return;
      var key = event.key || "";
      if (!(key === "w" || key === "W" || key === "ω" || event.code === "KeyW")) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      updatePrefs(function (prev) {
        return { collapsed: !prev.collapsed };
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return function () {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}

/**
 * A remembered step index belongs to one session; a switch drops it.
 *
 * The previous id lives in module scope instead of React.useRef on purpose: the
 * overlay occupant is a page singleton, and this plugin only relies on the React
 * hooks the harness documents (useState / useEffect). One less hook is one less
 * assumption about the client runtime.
 */
var wfSelectionSession;
function wfUseSessionReset(sessionId, updatePrefs) {
  React.useEffect(
    function () {
      var previous = wfSelectionSession;
      wfSelectionSession = sessionId;
      if (previous !== undefined && previous !== sessionId) {
        updatePrefs({ selectedStep: null });
      }
    },
    [sessionId]
  );
}

/* ------------------------------------------------------------------------- */
/* the two writes: the inject send and its undo ( + ) */
/* ------------------------------------------------------------------------- */

var WF_INJECT_PATH = "/dsh-workflow/steer";
var WF_UNSTEER_PATH = "/dsh-workflow/unsteer";

/**
 * One hot-inject send. Kept out of the component body so the four-state machine is readable
 * in one place, and so a self-test can read its shape without mounting React.
 *
 * The ACKNOWLEDGEMENT clears itself after WF_INJECT_ACK_MS; the timer is only armed when an
 * acknowledgement was actually produced, so an unmounted panel cannot leave a stray timeout
 * that writes into a dead setter (React ignores it, but the discipline is the point).
 */
function wfSendInject(text, sessionId, setInject) {
  if (typeof setInject !== "function") return;
  var trimmed = wfInjectText(text);
  if (trimmed === "" || typeof sessionId !== "string" || sessionId === "") return;

  setInject(function (prev) {
    return { open: prev ? prev.open : true, state: "sending", text: trimmed, reason: "" };
  });

 // Cancellable before send: the controller is stored on window for the panel's "cancel send" button.
 // Only takes effect while the request is still in flight; once it returns 200 the host has it in the inbox and the plugin cannot pull it back.
  var controller = typeof AbortController === "function" ? new AbortController() : null;
  window.__dshWorkflowMapAbort = controller;

  wfPostSteer(window.fetch, WF_INJECT_PATH, sessionId, trimmed, controller ? controller.signal : undefined).then(function (result) {
 // The acknowledgement's wording comes from the panel's OWN dictionary: `say` here is the
 // component's, and wfInjectOutcome only needs it for the one fallback string.
    var outcome = wfInjectOutcome(result && result.payload, wfMakeSay());
    var next = {
      open: true,
      state: outcome.kind === "sent" ? "sent" : "failed",
      text: trimmed,
 // A failure carries the HOST's own reason verbatim (the honesty rule).
      reason: outcome.kind === "sent" ? "" : outcome.text,
    };
    setInject(next);
    window.setTimeout(function () {
      setInject(function (prev) {
        if (!prev) return prev;
        var cleared = wfInjectAckDone(prev.state);
        if (cleared === prev.state) return prev;
        return { open: prev.open, state: cleared, text: prev.text, reason: "" };
      });
    }, WF_INJECT_ACK_MS);
  });
}

/**
 * One revocation: `POST /dsh-workflow/unsteer { sessionId, messageId }` for a history row the
 * running turn has not claimed yet.
 *
 * WHY IT IS NOT OPTIMISTIC. The host's 200 means the message LEFT the inbox — the fold will say
 * "revoked" on the next poll, from the host's own `agent/inbox/spliced { outcome: 'canceled' }`.
 * So this function never rewrites the history row: it only records that THIS row is being revoked,
 * which greys its button (no second post) and carries the host's reason back when it refuses.
 *
 * WHY THE ID IS CHECKED TWICE. A missing `messageId` (an older row without an id, which
 * store.js drops anyway) and a missing `sessionId` are refused HERE rather than posted, and a
 * second click on a row already being revoked returns the previous state untouched.
 */
function wfRevokeInject(messageId, sessionId, setRevoke) {
  if (typeof setRevoke !== "function") return;
  if (typeof messageId !== "string" || messageId === "") return;
  if (typeof sessionId !== "string" || sessionId === "") return;

  var double = false;
  setRevoke(function (prev) {
    var state = prev && typeof prev === "object" ? prev : { id: "", state: "idle", reason: "" };
    if (state.id === messageId && (state.state === "revoking" || state.state === "revoked")) {
      double = true;
      return state;
    }
    return { id: messageId, state: "revoking", reason: "" };
  });
  if (double === true) return;

  wfPostUnsteer(window.fetch, WF_UNSTEER_PATH, sessionId, messageId).then(function (result) {
    var outcome = wfRevokeOutcome(result && result.payload, wfMakeSay());
    setRevoke({
      id: messageId,
      state: outcome.kind === "revoked" ? "revoked" : "failed",
 // A failure carries the HOST's own reason verbatim (the same honesty rule as the send).
      reason: outcome.kind === "revoked" ? "" : outcome.text,
    });
  });
}

/* ------------------------------------------------------------------------- */
/* detail wiring */
/* ------------------------------------------------------------------------- */

/**
 * Escape collapses the details, not the panel. Re-bound when the selected step changes
 * because the handler needs to know WHICH step to fold — a mount-only closure would
 * close the step that was selected when the panel opened.
 */
function wfUseEscapeDetail(selectedStep, actions) {
  React.useEffect(
    function () {
      if (typeof document === "undefined") return undefined;
      var bound = wfBindEscape(document, actions);
      return function () {
        bound.destroy();
      };
    },
    [selectedStep]
  );
}

/** Re-measure the flowing curve when a <details> or the step detail changes height. */
function wfUseDetailNudge() {
  React.useEffect(function () {
    if (typeof document === "undefined") return undefined;
    var bound = wfBindDetailNudge(document, typeof window !== "undefined" ? window : null);
    return function () {
      bound.destroy();
    };
  }, []);
}

/* ------------------------------------------------------------------------- */
/* the single page's behaviour */
/* ------------------------------------------------------------------------- */

/**
 * Resolve the prefs' (rightKind, rightKey) into the page spec the renderer needs, against the
 * LIVE model. Pure and exported for the self-test: a stored key that no longer resolves must
 * produce `null` (the page closes) rather than somebody else's record.
 *
 * The return value is the page's WHOLE content decision, so the renderer never re-derives it:
 * {kind, stepIndex, unit, stepDetail, typeKey, label, scopeStep, bucket, nodes, openType}
 */
function wfRightPageSpec(model, prefs) {
  if (!model || !prefs || prefs.rightOpen !== true) return null;
  var kind = typeof prefs.rightKind === "string" ? prefs.rightKind : "step";
  if (WF_RIGHT_KINDS.indexOf(kind) < 0) return null;

  if (kind === "inject") {
    return { kind: "inject", stepIndex: null, openType: null, unit: null, stepDetail: null };
  }

  var key = typeof prefs.rightKey === "string" ? prefs.rightKey : "";
  var units = model.page && Array.isArray(model.page.units) ? model.page.units : [];

  if (kind === "type") {
    var at = key.indexOf("|");
    if (at < 0) return null;
    var scopeRaw = key.slice(0, at);
    var typeKey = key.slice(at + 1);
    if (typeKey === "") return null;
    var scopeStep = scopeRaw === "session" ? null : wfFinite(Number(scopeRaw));
    if (scopeRaw !== "session" && (scopeStep === null || !isFinite(scopeStep))) return null;
 // The bucket is looked up in the units the model actually has: a type from another session's
 // stored key simply does not resolve.
    var seen = null;
    var owner = null;
    if (scopeStep === null) {
 // Whole session: merge every unit's bucket of this key. The count is the sum of the units',
 // which is exactly what each circle already claims, so the page cannot contradict the chain.
      var merged = { key: typeKey, kind: "file", label: "", side: "left", count: 0, running: false, error: false, nodes: [] };
      for (var u = 0; u < units.length; u += 1) {
        var types = units[u] && Array.isArray(units[u].types) ? units[u].types : [];
        for (var t = 0; t < types.length; t += 1) {
          if (types[t].key !== typeKey) continue;
          merged.kind = types[t].kind;
          merged.label = types[t].label;
          merged.side = types[t].side;
          merged.count += types[t].count;
          merged.running = merged.running || types[t].running === true;
          merged.error = merged.error || types[t].error === true;
          for (var id = 0; id < types[t].nodes.length; id += 1) merged.nodes.push(types[t].nodes[id]);
        }
      }
      if (merged.label === "") return null;
      seen = merged;
    } else {
      if (scopeStep < 0 || scopeStep >= units.length) return null;
      var unitTypes = units[scopeStep] && Array.isArray(units[scopeStep].types) ? units[scopeStep].types : [];
      for (var ut = 0; ut < unitTypes.length; ut += 1) {
        if (unitTypes[ut].key === typeKey) {
          seen = unitTypes[ut];
          break;
        }
      }
      if (!seen) return null;
      owner = units[scopeStep];
    }
 // The calls themselves: every node of that type, resolved through the SELECTED step's flow only
 // when the scope IS the selected step (the wire only ships that step's nodes). A session-wide
 // type therefore lists ids it cannot dereference — the page says so rather than inventing rows.
    var calls = [];
    var flowNodes = model.flow && Array.isArray(model.flow.nodes) ? model.flow.nodes : [];
    if (scopeStep !== null && model.selected === scopeStep) {
      var byId = Object.create(null);
      for (var f = 0; f < flowNodes.length; f += 1) byId[flowNodes[f].id] = flowNodes[f];
      for (var s = 0; s < seen.nodes.length; s += 1) {
        if (byId[seen.nodes[s]]) calls.push(byId[seen.nodes[s]]);
      }
    }
    return {
      kind: "type",
      stepIndex: model.selected,
      scopeStep: scopeStep,
      openType: typeKey,
      label: seen.label,
      bucket: seen,
      nodes: calls,
      unit: owner,
      stepDetail: null,
    };
  }

 // kind === "step": the key is `step:<index>`; a keyless page follows the selection.
  var wanted = null;
  if (key.indexOf("step:") === 0) {
    var parsed = wfFinite(Number(key.slice(5)));
    if (parsed !== null && isFinite(parsed)) wanted = Math.round(parsed);
  }
  if (wanted === null) wanted = model.selected;
  if (wanted === null || wanted < 0 || wanted >= units.length) return null;
  var row = units[wanted];
  return {
    kind: "step",
    stepIndex: wanted,
    openType: null,
    unit: row,
 // Only the selected step's detail is on the wire; a page about another step says so.
    stepDetail: model.selected === wanted && model.detail ? model.detail : null,
    scopeStep: wanted,
  };
}

/**
 * Bring the RUNNING unit to the middle of the chain — once per step, and only if the user has not
 * scrolled since.
 *
 * Two rules make this honest rather than helpful-looking:
 * 1. it runs once per running step (`centeredStep`), so a poll cannot keep re-centring a reader;
 * 2. any manual scroll in the page defeats it — `userScrolled` is set by the FIRST wheel / touch /
 * keydown on the scroller, and after that this hook does nothing for that step.
 */
/**
 * The centring DECISION, as a pure function: run the auto-centring for `runningIndex` only
 * · when there IS a running step,
 * · when it has not already been centred once (`centeredStep`), and
 * · when the user has not scrolled the chain by hand (`scrolled`).
 *
 * The third clause is the user's "unless the user scrolls by hand". Note the trap this function exists to avoid:
 * passing a sentinel like -1 as `centeredStep` would mean "never centred" and RE-CENTRE after every
 * manual scroll — the exact opposite of the request.
 */
function wfShouldCenter(runningIndex, centeredStep, scrolled) {
  if (scrolled === true) return false;
  if (runningIndex === null || runningIndex === undefined) return false;
  return centeredStep !== runningIndex;
}

function wfUsePageCenter(model, centeredStep, scrolled, setCenteredStep) {
  var runningIndex = model && model.page && wfFinite(model.page.runningIndex) !== null ? model.page.runningIndex : null;
  React.useEffect(
    function () {
      if (!wfShouldCenter(runningIndex, centeredStep, scrolled)) return undefined;
      if (typeof document === "undefined") return undefined;
      var result = wfCenterRunning(document, runningIndex);
      if (result.applied === true) setCenteredStep(runningIndex);
      return undefined;
    },
    [runningIndex, centeredStep, scrolled]
  );
}

/**
 * The centring itself, split out of the hook so the browser check can run the SAME code the
 * product runs (a measurement page mounts the renderer's tree, it does not mount React).
 *
 * Returns `{applied, reason?, offset?, error?}` — never throws, never scrolls on a partial DOM.
 * `error` is the signed distance from the unit's middle to the viewport's middle AFTER the write,
 * which is what the acceptance measures.
 */
function wfCenterRunning(doc, runningIndex) {
  if (!doc || typeof doc.querySelector !== "function") return { applied: false, reason: "no-doc" };
  var index = wfFinite(runningIndex);
  if (index === null) return { applied: false, reason: "no-running-step" };
  var scroller = doc.querySelector('[data-dsh-workflow-map="page-scroll"]');
  if (!scroller || typeof scroller.scrollTop !== "number") return { applied: false, reason: "no-scroller" };
  var unit =
    typeof scroller.querySelector === "function"
      ? scroller.querySelector('.wf-unit[data-step-index="' + Math.round(index) + '"]')
      : null;
  if (!unit || typeof unit.getBoundingClientRect !== "function") return { applied: false, reason: "no-unit" };
  var frame = scroller.getBoundingClientRect();
  var rect = unit.getBoundingClientRect();
  var offset = wfCenterOffset(
    rect.top - frame.top + scroller.scrollTop,
    rect.height,
    frame.height,
    scroller.scrollHeight
  );
  if (offset === null) return { applied: false, reason: "bad-geometry" };
  scroller.scrollTop = offset;
 // Re-read after the write: the honest error is what the user now sees, not what the arithmetic
 // predicted (a smooth-scroll or a sub-pixel layout shift would otherwise be papered over).
  var after = unit.getBoundingClientRect();
  return {
    applied: true,
    offset: Math.round(offset * 100) / 100,
    error: Math.round((after.top + after.height / 2 - (frame.top + frame.height / 2)) * 100) / 100,
  };
}

/**
 * The FIRST manual scroll on the chain defeats the auto-centring for the rest of the session.
 * Listening on the scroller only — not on the window — so scrolling the right page never counts.
 */
function wfUseManualScrollGuard(mark) {
  React.useEffect(function () {
    if (typeof document === "undefined") return undefined;
    var scroller = document.querySelector('[data-dsh-workflow-map="page-scroll"]');
    if (!scroller || typeof scroller.addEventListener !== "function") return undefined;
    function onUserScroll() {
      if (typeof mark === "function") mark();
      scroller.removeEventListener("wheel", onUserScroll);
      scroller.removeEventListener("touchstart", onUserScroll);
      scroller.removeEventListener("keydown", onUserScroll);
    }
    scroller.addEventListener("wheel", onUserScroll, { passive: true });
    scroller.addEventListener("touchstart", onUserScroll, { passive: true });
    scroller.addEventListener("keydown", onUserScroll);
    return function () {
      scroller.removeEventListener("wheel", onUserScroll);
      scroller.removeEventListener("touchstart", onUserScroll);
      scroller.removeEventListener("keydown", onUserScroll);
    };
  }, []);
}

/* ------------------------------------------------------------------------- */
/* the component */
/* ------------------------------------------------------------------------- */

function WorkflowMapPanel(props) {
  var sessionId = wfUseSessionId(props);
  var prefsHandle = wfUsePrefs();
  var prefs = prefsHandle.prefs;
  var updatePrefs = prefsHandle.update;
  var snap = wfUseSnap(sessionId);
  var settingsPair = React.useState(false);
  var settingsOpen = settingsPair[0];
  var setSettingsOpen = settingsPair[1];
 // the composer's four-state machine and what was typed. It deliberately
 // lives in React state, NOT in localStorage: an in-flight send and a draft prompt are
 // per-session, per-moment facts, and reviving a stale "injected" would be a lie.
  var injectPair = React.useState({ state: "idle", text: "", reason: "" });
  var inject = injectPair[0];
  var setInject = injectPair[1];
 // which history row is being revoked right now, and (on failure) the host's
 // own reason for that row. Deliberately NOT in the inject record above: the send's four-state
 // machine clears itself on a timer, while a revocation stays on screen until the FOLDED row
 // stops being `pending` — two different lifetimes, two different pieces of state.
  var revokePair = React.useState({ id: "", state: "idle", reason: "" });
  var injectRevoke = revokePair[0];
  var setInjectRevoke = revokePair[1];
 // which call the type page has expanded, and whether the chain has already brought the
 // running unit to the middle (once per step — the user's own scrolling must never be undone).
  var callPair = React.useState(null);
  var openCall = callPair[0];
  var setOpenCall = callPair[1];
  var centeredPair = React.useState(null);
  var centeredStep = centeredPair[0];
  var setCenteredStep = centeredPair[1];
  wfUseStyle();
  wfUseAltW(updatePrefs);
  wfUseSessionReset(sessionId, updatePrefs);

  var say = wfMakeSay(props && props.t);
 // `Date.now` is passed in (the store stays clock-free) because needs one honest
 // judgement the event log alone cannot make: is this session still working right now?
  var model = wfBuildModel(snap.view, prefs, Date.now());
  var systemMotion = wfUseMotion();
  var motionPref = wfSettingsOf(prefs).motion;
  var motion = systemMotion === "static" || motionPref === "static" ? "static" : "css";
 // The curve is measured from the DOM, so it must be re-measured whenever the two endpoint
 // cards could have moved — the effect's dependency is a cheap string, not the whole model.
 // the old two-column curve (step ↔ node) is gone with the columns: there is no second
 // column to connect to. The living layer's CSS (ring, breathing dot, dashed branch) is reused;
 // only its measurement is no longer needed.
 // Resolve the per-step flow state BEFORE rendering: a state left over from another
 // step reads as the defaults (collapsed groups · no show-all · no highlight).
 // the right page's content is DERIVED from the prefs (kind + key) and the model, so a
 // stale key can never show another step's record: every branch below re-resolves against the
 // live view and falls back to the unit's own numbers.
  var page = wfRightPageSpec(model, prefs);
  var scrolledPair = React.useState(0);
  var scrolled = scrolledPair[0];
  var setScrolled = scrolledPair[1];
  wfUseManualScrollGuard(function () {
    setScrolled(1);
  });
 // centring: once per running step, defeated permanently by the FIRST manual scroll.
  wfUsePageCenter(model, centeredStep, scrolled === 1, setCenteredStep);
 // object URLs created by exports are revoked when this panel unmounts.
  wfUseSnapshotUrls();

  var actions = {
    onCollapse: function () {
      updatePrefs({ collapsed: true });
    },
    onExpand: function () {
      updatePrefs({ collapsed: false });
    },
 // Hot injection is a PAGE, not a split: opening it replaces whatever the right page was
 // showing; closing it closes the page (the composer's draft stays in React state).
    onToggleInject: function () {
      updatePrefs(function (prev) {
        var open = prev.rightOpen === true && prev.rightKind === "inject";
        return open ? { rightOpen: false } : { rightOpen: true, rightKind: "inject" };
      });
    },
    onInjectText: function (value) {
      setInject({ state: "idle", text: String(value), reason: "" });
    },
    onInjectCancel: function () {
      setInject({ state: "idle", text: "", reason: "" });
      updatePrefs({ rightOpen: false });
    },
    onInjectSend: function (text) {
      wfSendInject(text, sessionId, setInject);
    },
 // the history row's "Revoke": one POST, then wait for the fold to say
 // "revoked". The row's id comes from the model (the host returned it on the steer 200 and the
 // fold carried it into the rows), never from a DOM lookup.
    onInjectRevoke: function (messageId) {
      wfRevokeInject(messageId, sessionId, setInjectRevoke);
    },
 // "cancel send": abort only in-flight requests. A 200 cannot be pulled back (the host exposes no inbox revoke for it).
    onInjectAbort: function () {
      var controller = typeof window !== "undefined" ? window.__dshWorkflowMapAbort : null;
      if (controller && typeof controller.abort === "function") controller.abort();
      window.__dshWorkflowMapAbort = null;
      setInject({ state: "idle", text: "", reason: "" });
    },
    onToggleSettings: function () {
      setSettingsOpen(!settingsOpen);
    },
 // Clicking a main-flow unit: it becomes the SELECTED step (store.js builds its detail) and the
 // right page opens on it. It deliberately does not expand anything in place.
 // right page opens on it. It deliberately does not expand anything in place.
    onOpenStep: function (index) {
      setOpenCall(null);
      updatePrefs({
        selectedStep: index,
        rightOpen: true,
        rightKind: "step",
        rightKey: "step:" + index,
      });
    },
 // A round satellite (or a type row inside the step page): the type page, scoped to that step
 // when it came from a unit's gutter, or to the whole session when it came from the header.
    onOpenType: function (index, typeKey) {
      setOpenCall(null);
      var scoped = wfFinite(index) === null ? "session" : String(Math.round(index));
      var patch = {
        rightOpen: true,
        rightKind: "type",
        rightKey: scoped + "|" + String(typeKey),
      };
      if (scoped !== "session") patch.selectedStep = Math.round(index);
      updatePrefs(patch);
    },
    onSelectCall: function (nodeId) {
      setOpenCall(function (prev) {
        return prev === nodeId ? null : nodeId;
      });
    },
    onClosePage: function () {
      setOpenCall(null);
      updatePrefs({ rightOpen: false });
    },
    onSelectStep: function (index) {
      updatePrefs({ selectedStep: index });
    },
    onReset: function () {
 // the DOCUMENTED defaults, not whatever localStorage last held.
      updatePrefs(wfDefaultPrefs());
    },
    onSetting: function (setting, value) {
      var patch = {};
      patch[setting] = value;
      updatePrefs(patch);
    },
    onExportCopy: function (kind, element) {
      if (!model) return;
      wfCopyWithFeedback(
        wfSnapshotText(kind, model, snap.view, sessionId, Date.now(), say),
        element,
        say
      );
    },
    onExportDownload: function (kind) {
      if (!model) return;
      wfSnapshotDownload(
        kind,
        wfSnapshotText(kind, model, snap.view, sessionId, Date.now(), say),
        sessionId
      );
    },
 // Escape (wfBindEscape): close the right page, never the panel. The step detail is no longer
 // inline, so this is the whole gesture now.
    onEscapeDetail: function () {
      setOpenCall(null);
      updatePrefs({ rightOpen: false });
    },
 // A path / command copy with the 1.5 s acknowledgement (NodeDetail.js).
    onCopy: function (text, element) {
      wfCopyWithFeedback(text, element, say);
    },
  };

  wfUseEscapeDetail(model ? model.selected : null, actions);

  return wfRenderPanel(model, prefs, say, actions, {
    settingsOpen: settingsOpen,
    status: snap.status,
    error: snap.error,
    rev: snap.rev,
    endpoint: sessionId ? wfPollUrl(sessionId) : "",
    nodeTotal: snap.view && snap.view.counts ? wfFinite(snap.view.counts.nodes) : null,
 // what the right page shows, already resolved against the model.
    right: page,
    pageStep: page ? page.stepIndex : null,
    pageType: page ? page.openType : null,
    openCall: openCall,
    asOf: model ? model.asOf : null,
 // what the living layer reads off the root element.
    motion: motion,
 // "Always" keeps the living layer moving even when the session is idle;
 // "While running" (default) preserves the idle freeze; "Off" is data-motion=static.
    idle: motionPref === "always" ? false : !model || model.running !== true,
 // the composer's own state, read straight from React.
    injectState: inject.state,
    injectText: inject.text,
    injectReason: inject.reason,
 // which row is being revoked, and the host's reason when it refused.
    injectRevoke: injectRevoke,
    sessionId: sessionId || "",
  });
}

/* ------------------------------------------------------------------------- */
/* the pure renderer */
/* ------------------------------------------------------------------------- */

function wfFire(fn, argument) {
  if (typeof fn === "function") fn(argument);
}

function wfRenderPanel(model, prefs, say, actions, ui) {
  if (!model) return null;
 // the header badge's only number: rows the session has not taken yet.
  var pendingCount = wfPendingInjectCount(model.injects);
  var extras = ui || {};
  var fire = actions || {};
 // the two attributes the living layer needs. `motion` comes from the system's
 // prefers-reduced-motion preference (pulse.js), `idle` from the model's running flag.
 // Both live on .wf-root so the capsule is covered as well as the panel.
  var motion = extras.motion === "static" ? "static" : "css";
  var idle = extras.idle === true;
 // the layout owns the geometry. There is no dragged width, no pinned height and
 // no viewport clamp any more — the centre column decides both, and the card fills it.
  var collapsed = prefs.collapsed === true;
  var planning = model.kind === "planning";
 // one sanitised settings record drives the root data attributes and the
 // settings card, so a click can never leave the DOM and the card disagreeing.
 // Read the live prefs, not model.settings: a click must change the root attributes
 // on the same render even before the next poll produces an equivalent model.
  var settings = wfSettingsOf(prefs);
  if (collapsed) {
    var capsuleText = planning
      ? say("panel.planning")
      : say("capsule.progress", {
          done: model.progress.done,
          total: model.progress.total,
          percent: model.progress.percent,
        });
    return h(
      "div",
      {
        className: "wf-root",
        key: "wf-root",
        "data-dsh-workflow-map": "root",
        "data-idle": idle ? "1" : "0",
        "data-motion": motion,
        "data-motion-pref": settings.motion,
        "data-palette": settings.palette,
        "data-detail": settings.detail,
        "data-node-limit": String(settings.nodeLimit),
      },
 // collapsed = a folded row inside the main area, not a floating capsule.
 // The row keeps the live count so the panel can be left folded and still be read.
      h(
        "div",
        { className: "wf-capsule-bar", key: "capsule-bar" },
        h(
          "button",
          {
            type: "button",
            key: "capsule",
            className: "wf-capsule",
            "data-dsh-workflow-map": "capsule",
            "aria-expanded": "false",
            "aria-label": say("capsule.aria"),
            title: say("capsule.title") + " — " + capsuleText,
            onClick: function () {
              wfFire(fire.onExpand);
            },
          },
          h("span", { className: "wf-dot", key: "dot", "aria-hidden": "true" }),
          h("span", { className: "wf-capsule-text", key: "text" }, capsuleText)
        ),
        h("span", { className: "wf-capsule-hint", key: "hint" }, say("capsule.hint"))
      )
    );
  }

  var header = h(
    "header",
    { className: "wf-head", key: "head" },
    h(
      "div",
      { className: "wf-head-text", key: "text" },
      h(
        "div",
        { className: "wf-task", key: "task", title: model.task || "" },
        model.task || say("panel.task.fallback")
      ),
 // No progress line while planning: the body's single "planning..." line is the
 // whole message ( contract §3), so the number cannot appear twice.
      planning
        ? null
        : h(
            "div",
            { className: "wf-meta", key: "meta" },
            h("span", { className: "wf-pct", key: "pct" }, wfProgressText(say, model.progress)),
            h("span", { className: "wf-sep", key: "sep" }, "·"),
            h(
              "span",
              { className: "wf-raw", key: "nodes" },
              say("panel.nodes", { count: model.flow.total })
            ),
            extras.status === "stale"
              ? h(
                  "span",
                  { className: "wf-status-bad", key: "stale", title: extras.error || "" },
                  say("panel.stale")
                )
              : null
          )
    ),
    h(
      "div",
      { className: "wf-btns", key: "btns" },
      h(
        "button",
        {
          type: "button",
          key: "collapse",
          className: "wf-btn",
          title: say("panel.collapse"),
          "aria-label": say("panel.collapse"),
          onClick: function () {
            wfFire(fire.onCollapse);
          },
        },
        "‒"
      ),
 // the hot-inject entry is now a NAMED, prominent button (the user asked for it to be
 // prominent and in Chinese), not a ⇄ glyph: the glyph said "split the column", which no longer exists
 // what happens — the composer takes over the right-hand page.
      h(
        "button",
        {
          type: "button",
          key: "inject",
          className: "wf-btn wf-btn-hot",
          "data-dsh-workflow-map": "inject-toggle",
 // the badge is driven by the model's own rows: only a row
 // whose status is "pending" is still waiting for the turn. No pending row ⇒ neither the
 // attribute nor the element exists (the self-test asserts both directions).
          "data-pending-count": pendingCount > 0 ? String(pendingCount) : undefined,
          "data-active": extras.right && extras.right.kind === "inject" ? "true" : undefined,
          title: pendingCount > 0 ? say("panel.inject.pending.badge", { count: pendingCount }) : say("panel.inject.open"),
          "aria-label": say("panel.inject.open"),
          "aria-pressed": extras.right && extras.right.kind === "inject" ? "true" : "false",
          onClick: function () {
            wfFire(fire.onToggleInject);
          },
        },
        say("panel.inject.banner"),
        pendingCount > 0
          ? h(
              "span",
              { className: "wf-inject-badge", key: "pending", "aria-hidden": "true" },
              String(pendingCount)
            )
          : null
      ),
      h(
        "button",
        {
          type: "button",
          key: "settings",
          className: "wf-btn",
          "data-active": extras.settingsOpen === true ? "true" : undefined,
          title: say("panel.settings"),
          "aria-label": say("panel.settings"),
          onClick: function () {
            wfFire(fire.onToggleSettings);
          },
        },
        "⚙"
      ),
    )
  );

  var settingsCard =
    extras.settingsOpen === true
      ? wfRenderSettings(h, prefs, say, fire, {
          endpoint: extras.endpoint,
          steps: model.progress.total,
          nodes: wfFinite(extras.nodeTotal) === null ? model.flow.total : extras.nodeTotal,
          rev: extras.rev,
        })
      : null;

  var body;
  if (planning) {
    body = h(
      "div",
      { className: "wf-body", key: "body", "data-kind": "planning" },
      h(
        "div",
        { className: "wf-empty", key: "empty" },
        h("div", { key: "line" }, say("panel.planning")),
        h("div", { key: "note" }, say("panel.planning.note"))
      )
    );
  } else {
    body = h(
      "div",
      {
        className: "wf-body",
        key: "body",
        "data-kind": "ready",
 // ONE page. The right-hand page is a flex sibling, not an overlay and not a third
 // column: `data-right` says whether it is mounted, and its flex basis does the rest.
        "data-right": extras.right ? "true" : "false",
        "data-dsh-workflow-map": "body",
      },
 // The serial main flow: one unit per step, satellites on both sides, straight connectors.
      wfRenderMainFlow(h, model, say, fire, {
        openStep: extras.pageStep,
        openType: extras.pageType,
        asOf: wfFinite(extras.asOf) === null ? model.asOf : extras.asOf,
 // "Title only" narrows the unit's rail to one line, exactly as it did in the old column.
        compact: settings.detail === "title",
      }),
 // The right page: a step record, one file type's calls, or the inject composer.
      extras.right
        ? wfRenderRightPage(
            h,
            model,
            say,
            fire,
            Object.assign({}, extras.right, {
              openCall: extras.openCall,
              activeNodeId: model.flow && typeof model.flow === "object" ? model.flow.activeNodeId : null,
              injectState: extras.injectState,
              injectText: extras.injectText,
              injectReason: extras.injectReason,
 // the history rows, straight from the model (the host folds them from the
 // session's own log, so the browser adds nothing and invents nothing).
              injectHistory: model.injects,
 // the one revocation on screen, flattened for the composer.
              injectRevokeId: extras.injectRevoke && typeof extras.injectRevoke === "object" ? extras.injectRevoke.id : "",
              injectRevokeState: extras.injectRevoke && typeof extras.injectRevoke === "object" ? extras.injectRevoke.state : "idle",
              injectRevokeReason: extras.injectRevoke && typeof extras.injectRevoke === "object" ? extras.injectRevoke.reason : "",
              sessionId: extras.sessionId,
            })
          )
        : null
    );
  }

  return h(
    "div",
    {
      className: "wf-root",
      key: "wf-root",
      "data-dsh-workflow-map": "root",
      "data-idle": idle ? "1" : "0",
      "data-motion": motion,
      "data-motion-pref": settings.motion,
      "data-palette": settings.palette,
      "data-detail": settings.detail,
      "data-node-limit": String(settings.nodeLimit),
    },
    h(
      "section",
      {
        className: "wf-card",
        key: "card",
 // a main-column panel is a region, not a dialog — it is not modal,
 // it does not trap focus, and it has no close affordance of its own.
        role: "region",
        "aria-label": say("panel.aria", { task: model.task || say("panel.task.fallback") }),
        "data-dsh-workflow-map": "panel",
        "data-kind": model.kind,
        "data-status": extras.status || "idle",
      },
      header,
      settingsCard,
      body
    )
  );
}

/* ------------------------------------------------------------------------- */
/* the sidebar icon */
/* ------------------------------------------------------------------------- */

/**
 * The left-rail glyph . Same picture as icon.svg — two stacked panels on a
 * spine — drawn inline with createElement because the sidebar hands this occupant only
 * `{size, active}`: no asset URL is resolvable from inside the ModuleLoader factory.
 * `active` recolours through currentColor, which the shipped rows also rely on.
 */
function WorkflowMapIcon(props) {
  var size = wfFinite(props && props.size) === null ? 18 : Math.round(props.size);
  var active = props && props.active === true;
  var stroke = "currentColor";
  return h(
    "svg",
    {
      key: "wf-icon",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      focusable: "false",
      style: { display: "block", opacity: active ? 1 : 0.72 },
    },
    h("rect", {
      key: "a",
      x: 3,
      y: 3.5,
      width: 8,
      height: 17,
      rx: 2,
      stroke: stroke,
      strokeWidth: 1.6,
    }),
    h("rect", {
      key: "b",
      x: 13.5,
      y: 3.5,
      width: 7.5,
      height: 7,
      rx: 2,
      stroke: stroke,
      strokeWidth: 1.6,
    }),
    h("rect", {
      key: "c",
      x: 13.5,
      y: 13.5,
      width: 7.5,
      height: 7,
      rx: 2,
      stroke: stroke,
      strokeWidth: 1.6,
      opacity: 0.55,
    }),
    h("line", {
      key: "d",
      x1: 7,
      y1: 7.5,
      x2: 7,
      y2: 16.5,
      stroke: stroke,
      strokeWidth: 1.6,
      strokeLinecap: "round",
    })
  );
}

/* ------------------------------------------------------------------------- */
/* the conversation-view seat wrapper */
/* ------------------------------------------------------------------------- */

/**
 * The conversation-view seat's DOM marker. The SAME panel is mounted twice — the sidebar page
 * (`main`, keyed by PANEL_ID) and the session tab (`conversation.view`, same id) — and only the tab
 * one must have the host's composer removed. The two seats are indistinguishable from the panel's
 * own props, so the tab seat carries this marker and the stylesheet keys its rule on it.
 */
var WF_VIEW_SEAT_MARKER = "conversation-view";

/**
 * Wrap a rendered node in the seat marker. `display:contents` keeps the wrapper BOX-LESS: it adds
 * no element to the layout, so the seat's geometry is exactly the one the panel already had — the
 * div exists only to be the `:has` hook for the rule that hides the composer.
 */
function wfViewSeatRoot(h, node) {
  return h(
    "div",
    {
      "data-dsh-workflow-map": WF_VIEW_SEAT_MARKER,
      style: { display: "contents" },
    },
    node
  );
}

/**
 * The `conversation.view` occupant: the same panel, plus the marker.
 *
 * WHY A WRAPPER, NOT THE PANEL ITSELF: the composer is NOT ours. The host renders it as a SIBLING
 * of the selected view, inside `[data-conversation-content]`
 * (`div[data-conversation-content] > div[data-conversation-scroll] > [selected view, div[data-composer-seat]]`,
 * measured in this host), so nothing inside the panel's own tree can unmount it. A stylesheet rule
 * scoped by `:has` on the seat marker is the only mechanism that removes it without a host change,
 * and it restores itself the moment the user switches back — the host unmounts this view.
 */
function WorkflowMapViewSeat(props) {
  return wfViewSeatRoot(h, WorkflowMapPanel(props));
}

/* ------------------------------------------------------------------------- */
/* registration */
/* ------------------------------------------------------------------------- */

/**
 * two seats, ONE id.
 *
 * sidebar.panellist (list) the rail glyph; its `id` is what the row selects
 * main (keyed) the centre-column page for that same key
 *
 * They must agree: `PanelRow` renders `renderSlot("sidebar.panellist", …, {only:id})`
 * and `selectPanel(id)` then dispatches `main` by that key — selecting an id with no
 * `main` occupant throws. Registering both is the whole contract.
 */

function apply(ctx) {
  ctx.effect(function () {
    return ctx.locale.register(NS, { zh: DICT_ZH, en: DICT_EN });
  });
  ctx.slots.inject("sidebar.panellist", function () {
    return ctx.slots.register(
      {
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: PANEL_ORDER,
        label: function () {
          return DICT_ZH["panel.title"];
        },
        locale: NS,
      },
      WorkflowMapIcon
    );
  });
  ctx.slots.inject("main", function () {
    return ctx.slots.register(
      {
        name: "main",
        key: PANEL_ID,
        locale: NS,
      },
      WorkflowMapPanel
    );
  });
 // The shortcut in the session tab bar. `conversation.view` is the slot for the tab row above the conversation area
 // (a list ordered by `order`): chat(0) / trajectory(10) / context(20) / fleet(30), so order 40 puts it
 // after "fleet". Clicking it renders the same `WorkflowMapPanel`, wrapped in a seat marker
 // `wfViewSeatRoot`: the stylesheet uses it to hide the host composer seat - the very same
 // panel, the same polling, the same hot injection. Not a second implementation.
  ctx.slots.inject("conversation.view", function () {
    return ctx.slots.register(
      {
        name: "conversation.view",
        id: PANEL_ID,
        order: PANEL_ORDER * 4,
        locale: NS,
        label: function () {
          return DICT_ZH["panel.title"];
        },
      },
      WorkflowMapViewSeat
    );
  });
}

/**
 * Test seam: tools/selftest-panel.mjs loads the built bundle with a fake `require`
 * and asserts the pure parts directly. Nothing in the app reads this.
 */
var __test = {
  buildModel: wfBuildModel,
 // the single page, its satellites, the right page and the type buckets they are built
 // from. Exported so the self-tests drive the EXACT trees the frame mounts.
  renderMainFlow: wfRenderMainFlow,
  renderUnit: wfRenderUnit,
  renderSatellite: wfRenderSatellite,
  centerOffset: wfCenterOffset,
  centerRunning: wfCenterRunning,
  shouldCenter: wfShouldCenter,
  satelliteLabel: wfSatelliteLabel,
  renderRightPage: wfRenderRightPage,
  renderTypeBody: wfRenderTypeBody,
  renderCallRow: wfRenderCallRow,
  renderStepTypeSummary: wfRenderStepTypeSummary,
  rightPageSpec: wfRightPageSpec,
  typeBuckets: wfTypeBuckets,
  typeSides: wfTypeSides,
  typeOfPath: wfTypeOfPath,
  typeBadge: wfTypeBadge,
  typeSide: wfTypeSide,
  rightKinds: WF_RIGHT_KINDS,
  renderStepColumn: wfRenderStepColumn,
  renderProgressDock: wfRenderProgressDock,
  progressLabel: wfProgressLabel,
  progressFillWidth: wfProgressFillWidth,
 // the second line's arithmetic and its duration formatter.
  progressTiming: wfProgressTiming,
  progressDurationText: wfProgressDurationText,
  deriveStatus: wfDeriveStepStatus,
  applyDerivedStatuses: wfApplyDerivedStatuses,
  renderPanel: wfRenderPanel,
 // the conversation-view seat's marker wrapper (the rule that hides the HOST composer is
 // keyed on it, so both halves of that contract are driven here).
  viewSeatRoot: wfViewSeatRoot,
  viewSeatMarker: WF_VIEW_SEAT_MARKER,
 // the inject column — the state machine, the request and the renderer.
  injectState: wfInjectState,
  injectCanSend: wfInjectCanSend,
  injectText: wfInjectText,
  injectOutcome: wfInjectOutcome,
  injectAckDone: wfInjectAckDone,
  injectCounter: wfInjectCounter,
  postSteer: wfPostSteer,
 // the revoke half of the same column — its state machine, its request and the
 // host's-answer → outcome rule.
  revokeState: wfRevokeState,
  revokeOutcome: wfRevokeOutcome,
  postUnsteer: wfPostUnsteer,
 // the history shaping and the "needs confirm" derivation.
  injectRows: wfInjectRows,
  confirmRows: wfConfirmRows,
  confirmTitle: wfConfirmTitle,
  renderHotInject: wfRenderHotInject,
 // the persistent dock, its renderer and its two pure inputs.
  renderInjectDock: wfRenderInjectDock,
  pendingInjectCount: wfPendingInjectCount,
  injectStatusKey: wfInjectStatusKey,
  canonicalStatus: wfCanonicalStatus,
  normalizeStepTitle: wfNormalizeStepTitle,
  renderFlowColumn: wfRenderFlowColumn,
  renderNodeCard: wfRenderNodeCard,
  flowGroups: wfFlowGroups,
  flowItems: wfFlowItems,
  flowWindow: wfFlowWindow,
  flowNodeCount: wfFlowNodeCount,
  flowUiFor: wfFlowUiFor,
  flowToggleGroup: wfFlowToggleGroup,
  flowExpandAll: wfFlowExpandAll,
  flowSelectNode: wfFlowSelectNode,
  flowClearSelection: wfFlowClearSelection,
  flowToggleBranch: wfFlowToggleBranch,
 // the chain's branch derivation, its two halves (stroke path + the round icon), the
 // opened category view and the per-step toggle that drives it.
  flowToggleChain: wfFlowToggleChain,
  chainBranches: wfChainBranches,
  chainActionKind: wfChainActionKind,
  chainStrokePath: wfChainStrokePath,
  chainDetailNode: wfChainDetailNode,
  renderChainBranch: wfRenderChainBranch,
  renderChainDetail: wfRenderChainDetail,
  chainCurve: wfChainCurve,
  chainGeometry: wfChainGeometry,
  chainApply: wfChainApply,
  chainCards: wfChainCards,
  renderChain: wfRenderChain,
  renderBranches: wfRenderBranches,
  branchHue: wfBranchHue,
  branchStatus: wfBranchStatus,
  branchBadgeKey: wfBranchBadgeKey,
  branchRowStatus: wfBranchRowStatus,
  branchIsCollapsed: wfBranchIsCollapsed,
  nodeCategory: wfNodeCategory,
  nodeTitleParts: wfNodeTitleParts,
  nodeStatus: wfNodeStatus,
  nodeMetaBits: wfNodeMetaBits,
 // node detail, step detail, the clipboard and the two document bindings.
  renderNodeDetail: wfRenderNodeDetail,
  renderStepDetail: wfRenderStepDetail,
  renderStepHead: wfRenderStepHead,
  stepDetailOpen: wfStepDetailOpen,
  stepDetailToggle: wfStepDetailToggle,
  stepDetailOpenFor: wfStepDetailOpenFor,
 // the ONE disclosure triangle (a real <button>) and its glyph.
  tri: wfTri,
  triGlyph: wfTriGlyph,
  detailCategory: wfDetailCategory,
  detailAction: wfDetailAction,
  detailPath: wfDetailPath,
  detailFileGroups: wfDetailFileGroups,
  copyText: wfCopyText,
  copyFallback: wfCopyFallback,
  copyWithFeedback: wfCopyWithFeedback,
  setCopyState: wfSetCopyState,
  escapeIntent: wfEscapeIntent,
  bindEscape: wfBindEscape,
  bindDetailNudge: wfBindDetailNudge,
  stepReport: wfStepReport,
  buildStepDetail: wfBuildStepDetail,
  formatDuration: wfFormatDuration,
  formatClock: wfFormatClock,
  makeSay: wfMakeSay,
  sessionIdFromSnapshot: wfSessionIdFromSnapshot,
  pollUrl: wfPollUrl,
  pollOnce: wfPollOnce,
  parsePrefs: wfParsePrefs,
  sanitizePrefs: wfSanitizePrefs,
  applyPrefsPatch: wfApplyPrefsPatch,
  loadPrefs: wfLoadPrefs,
  savePrefs: wfSavePrefs,
  defaultPrefs: wfDefaultPrefs,
 // settings, snapshot construction and the two export deliveries.
  renderSettings: wfRenderSettings,
  defaultSettings: wfDefaultSettings,
  sanitizeSettings: wfSanitizeSettings,
  settingsOf: wfSettingsOf,
  settingOptionLabel: wfSettingOptionLabel,
  buildSnapshot: wfBuildSnapshot,
  snapshotMarkdown: wfSnapshotMarkdown,
  snapshotJson: wfSnapshotJson,
  snapshotText: wfSnapshotText,
  snapshotFileName: wfSnapshotFileName,
  snapshotTag: wfSnapshotTag,
  copySnapshot: wfCopySnapshot,
  snapshotDownload: wfSnapshotDownload,
  releaseSnapshotUrls: wfReleaseSnapshotUrls,
  snapshotUrlCount: wfSnapshotUrlCount,
 // the living layer, its geometry and the two attributes it reads.
  renderFlowEffects: wfRenderFlowEffects,
  fxCurve: wfFxCurve,
  fxGeometry: wfFxGeometry,
  fxBounds: wfFxBounds,
  fxApply: wfFxApply,
  fxBind: wfFxBind,
  fxSignature: wfFxSignature,
  fxQuery: wfFxQuery,
  motionMode: wfMotionMode,
  sessionRunning: wfSessionRunning,
  renderLive: wfRenderLive,
  css: function () {
    return WF_CSS;
  },
  dicts: function () {
    return { zh: DICT_ZH, en: DICT_EN };
  },
  constants: function () {
    return {
      styleId: WF_STYLE_ID,
      prefsKey: WF_PREFS_KEY,
      pollVisible: WF_POLL_VISIBLE,
      pollHidden: WF_POLL_HIDDEN,
      defaultWidth: WF_DEFAULT_WIDTH,
      zIndex: WF_Z_INDEX,
      stepGap: WF_STEP_GAP,
      stepRail: WF_STEP_RAIL,
      stepLink: WF_STEP_LINK,
      stepMany: WF_STEP_MANY,
      flowCap: WF_FLOW_CAP,
      branchShown: WF_BRANCH_SHOWN,
      branchLink: WF_BRANCH_LINK,
      groupMin: WF_GROUP_MIN,
      fxRainbow: WF_FX_RAINBOW,
      fxBrand: WF_FX_BRAND,
      curveMode: WF_CURVE_MODE,
      fxStroke: WF_FX_STROKE,
      fxGlow: WF_FX_GLOW,
      fxDash: WF_FX_DASH,
      fxSpeed: WF_FX_SPEED,
      livePeriod: WF_LIVE_PERIOD,
      pulsePeriod: WF_PULSE_PERIOD,
      pulseMs: WF_PULSE_MS,
      idleAfterMs: WF_IDLE_AFTER_MS,
      fxMinGap: WF_FX_MIN_GAP,
 // the chain's distances, so the self-test can assert the >= 28 px air, the 20–24 px
 // icon, and the fact that the link never overflows the gap it is drawn in.
      chainGap: WF_CHAIN_GAP,
      chainLink: WF_CHAIN_LINK,
      chainPad: WF_CHAIN_PAD,
      chainBranch: WF_CHAIN_BRANCH,
      chainIcon: WF_CHAIN_ICON,
      chainRing: WF_CHAIN_RING,
      chainKinds: WF_CHAIN_KINDS,
      chainSlots: WF_CHAIN_LINK_SLOTS,
      liveDots: WF_LIVE_DOTS,
      palettes: WF_PALETTES,
      motions: WF_MOTIONS,
      detailModes: WF_DETAIL_MODES,
      nodeLimits: WF_NODE_LIMITS,
      snapshotSchema: WF_SNAPSHOT_SCHEMA,
 // the single page's distances, the right page's kinds and its slot budget, so the
 // self-test asserts the SAME numbers the stylesheet is built from.
      pagePad: WF_PAGE_PAD,
      satellite: WF_SATELLITE,
      satLink: WF_SAT_LINK,
      unitGap: WF_UNIT_GAP,
      unitLink: WF_UNIT_LINK,
      sideSlots: WF_SIDE_SLOTS,
      sideFiles: WF_SIDE_FILES,
      rightKinds: WF_RIGHT_KINDS,
    };
  },
  component: WorkflowMapPanel,
};
