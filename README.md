# dsh-workflow-map

工作流地图插件（DeepSeek Harness bundle）：在 Web 界面**左栏「工作流」图标 + 主内容区**展示当前会话的分步总览（左列）与选中分步的流程节点明细（右列）。

> **本版现状（0.3.0，2026-10-27）**：宿主半（投影 + PAE 计划读取 + HTTP 视图路由 + 回合开合）已活；
> 浏览器半是**一个单页**（会话4 改版）：中间主内容区自上而下是**一条串行主流程**（每步一张卡，
> 两侧挂**圆形工具/文件类型接口**，接口与卡之间是**直线**连接），点圆点或卡片会在**右页**打开
> 「这一类调用」或「这一步的记录」；热注入也改成**右页的一页**，页头入口是显眼的品牌色按钮。
> 会话4..7 的变更：两列布局（流程列/支线泳道/跳列流光曲线）**已整体移除**，随之退役的还有
> 旧版「预计剩余时间」（宿主 `etaMs` 一并删，第二行只剩「N 分钟前估计」）与实验性的 composer
> 覆盖层；新增会话标签栏入口、`/unsteer` 完整撤回链路、常驻注入条。
> **逐条证据**：`evidence/session7-rerun.md`（本轮 23/23 套全绿：离线 1505 条 + 浏览器量测 307 条）、
> `CHANGELOG.md`。
> ⚠️ **下方 step-07..step-12 各节是当时的设计记录**，其中「两列布局 / 流程列（step-08）/ 并行支线（step-09）/
> 跳列流光曲线（step-10）」描述的 UI 在会话4 后已不再挂载；现在的对应实现是单页主流程 + 卫星圆点 + 右页，
> 量测见 `tools/measure-main.ps1` / `measure-flow.ps1` / `measure-branches.ps1` / `measure-effects.ps1`。
> 业务实现按计划分步落地；本 README 的「路线图」一节列出每一步的落点。
> 未实现的功能在此一律标【未核验/未实现】，不用模糊表述充数。
## 组成

| 半边 | 文件 | 现状 |
|---|---|---|
| 宿主半入口 | `index.js` | 门面：`export * from "./lib/index.js"`（manifest 的 `exports["."]` 仍指向它） |
| 宿主半实现 | `lib/index.js` | 注册会话投影 `workflowView`；`inject: ["sessionProjections"]`；两套 schema（严格 view / 容错 state） |
| 折叠核心 | `src/fold.mjs` | **纯函数**：`createInitialState` / `foldEvent` / `buildView` + 版本与上限常量；无线程时钟、无 IO |
| 浏览器半 | `client.js` | 生成物：`src/client/{theme,store,Settings,pulse,ProgressUnder,StepDetail,StepColumn,NodeDetail,NodeCard,export,FlowColumn,Branches,FlowEffects,panel}.js` 内联为单文件；**左栏「工作流」图标 + 主内容区面板**（`sidebar.panellist` + `main`，step-13 起；不再有 `shell.overlay` 悬浮窗） |
| 组合入口 | `cordis.patch.yml` | 单条 `insert`，`id: workflow-map` |
| 展示元数据 | `locale/zh.json`、`locale/en.json`、`icon.svg` | 标题/描述/图标齐备，键集一致 |
`dsh.client`（`package.json`，`platform: web`）让同一个包的 `./client` 成为浏览器半；因此 patch 里**没有**客户端行。

## 宿主投影 `workflowView`（step-02）

### 它是什么

会话投影：注册一次，宿主每落一条会话事件就把它叠进状态；`wire.view` 在每个快照里把状态编成客户端可读的视图。**注册代码**在 `lib/index.js`，**折叠逻辑**全部在 `src/fold.mjs`（同一个模块被离线自测直接驱动，不另写一份实现）。

| 项 | 值 |
|---|---|
| 投影 key | `workflowView` |
| `stateVersion` | `3`（与 `src/fold.mjs` 的 `STATE_VERSION` 同源；step-03 把 `sessionId`/`cwd` 放进状态，本轮 step-03-unsteer 又把**收件箱台账** `inboxIds` 放进状态——撤回的持久记录是「位置」而不是消息 id，没有台账就答不出「被移除的是哪一条」；旧检查点按契约丢弃重建） |
| 视图 `ver` | `1`（`SCHEMA_VERSION`） |
| 宿主 `inject` | `["sessionProjections"]` |
| 视图的 `now` | 状态里 `asOf`（最后折叠事件的时刻）—— **整个折叠路径不读时钟** |

### 折叠的事件（全部用真实会话日志核对过 2026-10-17）

`todo/write`、`tool/call`、`tool/result`、`step/start`、`step/end`、`assistant/message`、`user/message`、`turn/start`、`turn/end`、`stepProgress/report`、`subagent/start|end`、`workflow/start|phase|end`、`tool-workflow/run-start|run-end|agent-start|agent-end`、`job/registered|job/settled`、`user-questions/request`、`approval/request`。其余类型（`llm/*`、`compaction/*`、`request/*`、`command/*`、`assistant/attempt`、`job/progress`、`session` …）**原样返回同一个 state 引用**，不产生拷贝。

两个必须写明的量测事实：

- `step/start` / `step/end` 是**模型步**（一条 turn 里有几十个，实测一条 4 轮会话 128 个），**不是** PAE 的分步。它们只更新「当前活动」标记，绝不当分步边界——否则每个分步在第一个模型步结束时就被关掉。
- PAE 的分步边界来自它自己写的 `user/message`（`source.kind = plugin:dsh-plan-and-execute`），按 `source.summary` 分四类：`开始规划` / `计划摘要` / `执行第 i/N 步` / `第 i/N 步结果`。由此推出来的锚点 seq 与 `orchestrator.json` 的 `anchorSeqs` **完全一致**（实测本例：步骤1=502、步骤2=942），step-03 读取计划文件将是**印证**而不是纠正。
- **subagent / workflow 的事件族要看清单：** 本机 `SessionEventMap` 里**没有** `subagent/start|end` 与 `workflow/*`（它们是插件总线事件，不进会话日志）；真实日志里子代理只表现为启动它的 `tool/call` + 结果 `started subagent <id>`，结束则是一条 `source.kind = subagent-settled` 的 `user/message`（子代理的答复先是 `agent-message`）。工作流后台运行走 `tool-workflow/run-start|run-end|agent-start|agent-end`。step-09 的支线以这套实测词汇为准（两套形状都兼容）。

### 视图形状（`buildView` 的返回值）

```
{ ver, task, todos[], steps[], nodes[], branches[], active, activeNode, asOf, running,
  truncated{stepNodes,totalNodes}, counts{steps,nodes,running,completed}, plan }
plan = { ver, phase, task, taskTitle, summary, planDir, pausedReason, stepIndex,
         steps[{index,title,file,requiresConfirmation}],
         stepReports[{stepIndex,status,artifacts[],summary,exitCode}],
         statuses{}, anchorSeqs{}, skipped[], asOfMtime, sourcePath }   // 无 PAE 计划时为 null
step = { index, planIndex, title, status, source, outcome, startedAt, endedAt, lastActivityAt,
         modelStep, anchorSeq, percent, percentSource, maxPercent, reportSummary,
         nodeCount, nodeIds[], truncatedNodes, groups[] }
node = { id, stepIndex, kind, tool, title, detail, argsText, files[{path,action}],
         resultHead, error, at, durationMs }
branch = { id, kind, label, status, startedAt, endedAt, stepIndex, callId, runId, jobId,
           count, truncated, nodes[{id,kind,tool,title,detail,at,status,key}] }
```

- `kind`：`tool` / `message` / `subagent` / `question` / `approval` / `report`。
- `running`（step-10）：**当前回合是否开着**——`turn/start` 置真、`turn/end` 置假。浏览器半在它为假时把面板里所有动画冻结（`data-idle="1"`）。为什么不用分步的 `running` 状态：PAE 在回合结束后不会立刻改写它，照着它判断的话动画永远不会停。
- `branches[]`（step-09）：并行工作（子代理 / 工作流 / 后台长任务）的泳道，**不在** `nodes[]` 里，因此节点数、折叠、窗口与「当前活动」高亮均不受它影响；`kind` 取 `subagent` / `workflow` / `job`。每道最多留 40 行（`count` 记总数、`truncated` 记被丢的头部），状态最多留 12 道（丢弃的计入 `droppedBranches`）。
- `files[].action`：`读`（read）/ `写`（write）/ `改`（edit）/ `查`（glob, grep）；`pwsh` 的路径只能正则粗抽，**在 `detail` 里显式标「路径推断」**，不冒充确定。
- 百分比：模型自报（`stepProgress/report`）优先并按步存高水位；否则用「该步已耗时 / 本会话已完步中位耗时」估算（封顶 90%）；已关步固定 100%。`percentSource` 取 `model` / `baseline` / `closed` / `none`。
- 上限：每步节点 ≤ 300（保留首尾、中间丢弃并计入 `truncated.stepNodes`）；全会话 ≤ 1200；单条文本 ≤ 200、标题 ≤ 120；**`content` / `old_str` / `new_str` 这类正文一律不进状态**（写 5000 字的文件不会让状态变大）。
- 实测体积（2026-10-17，本会话 566 节点）：状态 ≈ 286 kB，视图 ≈ 240 kB。

### 自检

```powershell
node tools\selftest-fold.mjs          # 116 条：折叠语义（无 PAE / PAE 三步 / 文件节点 / 错误 / 截断 / 分组 / 空会话 / 支线 h-k）
node tools\selftest-host.mjs          # 50 条：注册、init（含会话身份）、apply==fold、wire.view==buildView+plan、两套 schema（含支线修复）、缺服务时硬失败、路由座位
node tools\selftest-orchestrator.mjs  # 140 条：路径守卫、真实计划（当前/历史/规划中）、mtime+size 缓存、损坏文件、宿主接线、合并规则
node tools\selftest-shape.mjs         # 84 条：包骨架、门面、locale、patch、files 白名单（tools/ evidence/ *.bak 为开发件）、客户端注册与面板契约
node tools\selftest-panel.mjs         # 320 条：偏好读写/钳位/容错、条件轮询（200/304/4xx/网络/abort）、会话身份、view→model、渲染树、样式表、流程列（折叠/窗口/节点卡/切步重置）、支线（过滤/上限/徽记/折叠/选中）
node tools\selftest-detail.mjs        # 106 条：节点/分步详情树、PAE 报告匹配、截断诚实、复制三条路径、Esc/nudge、隐私白名单、折叠三角（DOM 形状/aria/点击回调/分组共用渲染函数）
node tools\selftest-effects.mjs       # 123 条：贝塞尔几何、DOM 写入与生命周期、idle/减少动效、CSS 契约
node tools\selftest-settings.mjs      # 43 条：偏好默认/损坏自愈、设置卡四组控件、palette/detail/nodeLimit 即时渲染、Markdown/JSON 计数一致、下载/撤销、剪贴板回执
node tools\build-client.mjs           # 生成 client.js（单文件浏览器半）——改 src/client/*.js 后必跑
```

八者全绿才认为本步完成（982 条）。`selftest-fold.mjs` 里有一条断言直接扫描 `src/fold.mjs` 源码，**禁止出现 `Date.now` / `new Date` / `performance.now` / `Math.random`**。
`client.js` 是**生成物**（首行有 GENERATED 标记）：源码在 `src/client/theme.js`、`src/client/store.js`、`src/client/Settings.js`、`src/client/pulse.js`、`src/client/ProgressUnder.js`、`src/client/StepDetail.js`、`src/client/StepColumn.js`、`src/client/NodeDetail.js`、`src/client/NodeCard.js`、`src/client/export.js`、`src/client/FlowColumn.js`、`src/client/Branches.js`、`src/client/FlowEffects.js`、`src/client/panel.js`，由 `tools/build-client.mjs` 按此顺序内联进 ModuleLoader 工厂。它们都是普通脚本块（禁止 `import`/`export`），构建器会在写入前做语法编译与结构断言。

## 宿主读取 PAE 计划（step-03）

`src/orchestrator.mjs` 只读一个文件：`<cwd>/.pae/<sessionId>/orchestrator.json`（`<sessionId>` 取 `header.id`——PAE 自己就用这个名字建目录）。它是视图里**唯一**不来自投影的数据源：折叠是「从日志重建」，这份文件是「PAE 自己的账本」。

- **只读**：自测拿真实文件的 mtime/size 做前后断言，读多少次也不改 `.pae` 一个字节。
- **永不抛**：文件缺失、写到一半、权限问题、字段异常一律 `null` + `errors()` 一行，面板降级到 todo，绝不连累会话。
- **每个视图一次 `statSync`**：`read()` 用 `mtimeMs:size` 作键复用已解析结果 ⇒ 只有文件真变了才 `readFileSync`。解析结果**深冻结**，多视图共享同一对象不会互相污染。
- **不猜路径**：`cwd` 与 `sessionId` 缺一个就 `null`；`sessionId` 必须是一个路径段（`..`、`/`、`\`、`:` 一律拒绝）。宿主半取 `cwd` 时镜像 PAE 自己的规则 `header.cwd ?? process.cwd()`（`dsh-plan-and-execute/lib/index.js:1539-1542`），否则没有 header cwd 的会话会静默失去计划。
- **不编字段**：`plan.steps` 原样带出 1-based 序号（坏行也不移位，否则会和 `statuses`/`anchorSeqs` 的键错位），缺失字段退化为空值。

**合并规则（PAE 优先，todo 兜底）**：`task` 用计划首行；按 `planIndex` 匹配的分步行，标题一律取计划文本；**状态**只在「这一行是 todo 折出来的」时采用计划值——PAE 步的状态是真实事件边界折出来的，比 PAE 只在步边界重写的文件更新。计划里有、折叠里没有的步**不伪造行**，由 `plan.steps` 直接交给客户端。
## 宿主 HTTP 视图路由（step-04）

`GET /dsh-workflow/state?sessionId=<id>` —— 面板的**可轮询**读数面，也是唯一能**不开浏览器**做的验收探针。它注册在宿主已有的 `webServer` 上（`kind: "prefix"`），**不新开监听端口**（复用 DSH 的 54934）。

响应 `{ ok: true, view, rev }`：`view` 与投影推出的是**同一个对象形状**（合成函数 `composeView(view, plan)` 是唯一入口，`wire.view` 与路由都走它），`rev` 是投影的 `asOfSeq`（这份 view 反映到的最后事件序号）。

| 情况 | 结果 |
|---|---|
| `ETag` 命中 `If-None-Match`（含 `W/` 形式） | `304`，无 body |
| 缺 / 空 `sessionId` | `400 {ok:false,error:"sessionId is required"}` |
| `sessions.get(id)` 找不到 | `404 {ok:false,error:"unknown session"}` |
| `/dsh-workflow/` 下未知子路径 | `404` JSON |
| 非 GET/HEAD | `405` + `Allow` |
| `OPTIONS` | `204` + `Allow` |
| 视图源抛错 / 键未注册 | `500` / `503`，**永远是 JSON**，不把异常抛进 HTTP 层 |

- **幂等注册**：`webServer.register` 对重复 `(kind,path)` 会抛错，而宿主会热重载 `apply()`。座位按 **server** 记账并引用计数：第二次 `apply()` 复用同一个注册，**最后一个** disposer 才真正摘除（`routeInfo()` 可查当前 `note/servers/owners`）。注册被拒也只记诊断，**绝不连带投影挂载失败**。
- **低开销**：每次请求一次 `snapshot()`（投影自带 `Object.is` 门，没变化就不重建 view）+ 一次 FNV-1a（非加密哈希，缓存校验够用）；`cache-control: no-store`。
- **自检**：`node tools\probe-route.mjs <工作区>` —— 真 loopback HTTP 跑完上表每一条，再用本机真实 `.pae` 计划核对「行数/标题/状态/百分比」并断言计划文件 mtime+size 未变（81 条）。

### 两条写通道：`/steer` 与 `/unsteer`（step-04 + step-03-unsteer）

`POST /dsh-workflow/steer { sessionId, text }` 把一句提示词写进**运行中**会话的 `next-step` 收件箱（`agent.steer`，不打断当前轮次）；成功响应从 step-03 起还带回 `messageId`。`POST /dsh-workflow/unsteer { sessionId, messageId }` 是它的**撤回**：调宿主的 `agent.inbox.remove(messageId)`，把**尚未被轮次取用**的那一条抽回收件箱之外。

| 情况 | `/steer` | `/unsteer` |
|---|---|---|
| 成功 | `200 {ok:true,sessionId,messageId}` | `200 {ok:true,sessionId,messageId}` |
| body 非 JSON / 非对象 / 缺字段 | `400`（`text is required` 等） | `400`（`messageId is required`） |
| `text` 超 2000 字 / body 超 64 KiB | `413` | —（无文本） |
| 会话不存在 | `404 unknown session` | `404 unknown session` |
| 会话未在运行 | `409 会话未在运行，热注入不可用` | `409 会话未在运行，热注入不可用` |
| 消息已不在收件箱（已被接下 / 不存在） | — | `409 该注入已被会话接下或不存在` |
| 宿主没有 `inbox.remove`（旧 agent 实现） | — | `503 the host exposes no inbox revoke API` |
| 缺相应源 / 源抛错 | `503` / `500`，永远 JSON | `503` / `500`，永远 JSON |

撤回的**持久半边在宿主日志里**：`inbox.remove` 自己会落一条 `agent/inbox/spliced { target, start, removedCount, inserted: [], outcome: "canceled" }`，并只在内存 dispatch 上发一条 `agent/inbox/discarded`。折叠读到那条 splice 才把历史行改成「已撤销」——**插件不自己写任何事件**（一个事实一个写者），所以刷新页面后状态仍然正确。因为 splice 记的是**位置**而不是消息 id，`fold.mjs` 维护一份收件箱台账 `inboxIds`（按宿主自己的 `inboxProjectionDefinition` 语义逐条重放 splice），撤回事件才有办法定位到是本插件哪一行（`stateVersion` 因此升到 3）。

## 客户端面板骨架（step-06）

浏览器半从「单行占位胶囊」换成了真正的双列面板，数据接 `step-04` 的 `/dsh-workflow/state`（**落点已在 step-13 从悬浮抽屉改为主内容区**，下表已同步）：

| 能力 | 实现 |
|---|---|
| 注册（step-13 起） | 两个座位同一个 id：`sidebar.panellist`（`id: "workflow-map"`、`order: 10`、图标 `WorkflowMapIcon`）＋ `main`（`key: "workflow-map"`、面板 `WorkflowMapPanel`）。`PanelRow` 用 `renderSlot("sidebar.panellist", …, {only:id})` 画图标，点它 `selectPanel(id)` 再按同一个 key 派发 `main`——**两个槽必须同 id 一起注册**，只注册一个会抛错 |
| 会话身份 | `props.useSessions(snapshot => snapshot)`；`current` 为空时退到 `byId[*].retainedBy.mainView > 0` 中保留最多、最近活跃的会话；仍为空 → **不渲染任何 DOM**（`useSessions` 是 `main` 与 `sidebar.panellist` 两个座位的标准 prop） |
| 数据 | 条件轮询：可见 800 ms / 隐藏 3 s；`If-None-Match` + `ETag`，304 不重绘；`cache: "no-store"`；`AbortController` + 定时器在卸载/切换时清理 |
| 空态 | `view.steps` 为空且没有进行中的规划 → `null`（不占位、不拦截点击）；`plan.phase === "planning"` 且计划未提交 → 一行「规划中…」 |
| 布局（step-13） | 主内容区占满：`.wf-root{position:relative;width:100%;height:100%;min-height:0;display:flex}`、`.wf-card{flex:1 1 auto;min-height:0;border-radius:0}`；无 `position:fixed`、无 `z-index`、无 `pointer-events` 分层（已在真实布局里，不是覆盖层）；主体 `grid-template-columns: minmax(240px, 44%) 1fr` |
| 头部 | 总任务标题（单行省略）、`x/y 步 · 百分比`、节点数、收起 `‒`、设置 `⚙`。**没有 `×`**：主区面板没有「关闭」语义，点左栏别的图标即可离开 |
| 拖宽/拖高（已删） | step-13 移除 `wf-grip-left` / `wf-grip-bottom` 与 `wfBeginWidthDrag` / `wfBeginHeightDrag`：主区没有可拖的自由边缘，尺寸由布局给 |
| 记忆 | `localStorage` 键 `dsh-workflow-map:prefs` 存 `{collapsed, selectedStep, palette, motion, detail, nodeLimit}`；`width`/`height` 仍会被**读入并消毒**（兼容 step-06..12 写下的旧记录），但界面不再写它们，也不再据此改尺寸 |
| 收起（step-13 改） | 主区顶部一行 `.wf-capsule-bar`：胶囊「5/15 · 34%」+ 脉动点 + 「点击展开」提示，`aria-expanded="false"`；`Alt+W` 切换。不再是右上角悬浮胶囊 |
| 折叠三角（step-14） | 分步卡与折叠分组左侧各有一个真 `<button class="wf-tri">`：20 px 宽 × 卡片/行全高的点击带（`grid-area:1/1` + `align-self:stretch`，与卡片同格不叠字），内部 ▸/▾ 随 `aria-expanded` 翻转，带 `aria-controls` 指向分步详情 / 分组体；两处共用同一个 `wfTri(h, expanded, onToggle, extra)` 渲染函数。它不新造状态：分步走 `wfStepDetailOpen/Toggle/OpenFor`，分组走 `wfFlowToggleGroup`，与「i」按钮和卡片本体同一数据源 |
| 主题 | 只读 `--dsw-alias-*` 令牌，每个都带具体色值兜底（浅色/深色都可读） |

step-06 时 `src/client/` 是三个文件：`theme.js`（尺寸/时长/整套 CSS）、`store.js`（偏好、轮询、view→model）、`panel.js`（hooks + 纯渲染器 + 注册）；step-07 拆出 `ProgressUnder.js`（框下轨道）与 `StepColumn.js`（卡片列 + 状态策略），step-08 再拆出 `NodeCard.js`（单节点卡）与 `FlowColumn.js`（折叠分组 + 60 节点窗口 + 流程列），构建器按 `theme → store → ProgressUnder → StepColumn → NodeCard → FlowColumn → panel` 内联。`wfRenderPanel` 不调 hook，所以自测能在 Node 里用假 `createElement` 断言整棵树。

视觉预览（不依赖 GUI 鉴权）：`pwsh -File tools\preview-shot.ps1` 生成 `evidence/preview/*.html` 并用无头 Chrome 截图到 `evidence/*.png`。

## 分步卡片与框下留白进度条（step-07）

左列不再是「一行一步」的列表，而是**每步一张卡片 + 卡片外框下方 8 px 留白处的一条 6 px 进度条**，卡片之间用 14 px 竖线连接：

| 能力 | 实现 |
|---|---|
| 卡片结构 | `<ul>`→`<li>`：状态环（✓/●/✕/○/–）+ 标题（两行省略，`title` 悬停全文）+ 报告摘要（两行省略）+ 状态徽记 + 可选「需确认」徽记 + 右侧 `02/15` 序号 |
| 进度条 | 卡片下方 `margin-top: 8px` 的 6 px 轨道；已完成实色绿、进行中彩色流动、失败红、未开始/已跳过空轨道；右侧数字标注 **~62% 估算**（时间基线）或 **62% 自报**（模型自报），关闭的步骤显示 `100%`。轨道下方还有一行次要信息（step-03 起）：**「3 分钟前估计」**——那个数字有多旧（`view.asOf − step.lastEstimateAt`），**这也是第二行唯一的内容**（2026-10-26 会话6 按用户要求删除「预计剩余」，连宿主端计算一并删除）；没有 `lastEstimateAt` 就整段不渲染，不用 `0` 或 `—` 冒充，窄容器（`detail=title`）只保留第一行 |
| 状态来源 | `PAE plan.statuses` > 待办表 `todos` > `plan.anchorSeqs` 推断（锚点存在：光标之前=完成、当前=进行中、之后=未开始）> 宿主事件状态 > `pending`；每张卡带 `data-status-source` 便于核对 |
| 未开始不给假数字 | `pending`/`skipped` 即使载荷里有 `percent` 也**不显示任何数字**（`progressFillWidth` 也压成 0）；进行中但无数字时用不定量流光段（30%），不编百分比 |
| 连接线 | 每对卡片间 14 px 竖线，上面那步完成→实色，否则虚线；只在左列，且与进度条之间另有 8 px 空隙（浏览器实测不重叠） |
| 多步滚动 | 步骤 > 8 时左列内部滚动，列头 `position: sticky` 常驻（`data-many="true"`） |
| 点击选中 | 整卡可点 → `onSelectStep(index)` → 偏好 `selectedStep` 落 `localStorage`；进行中的步默认选中；右列数据随选中切换 |

几何常量集中在 `theme.js`（`WF_STEP_GAP=8`、`WF_STEP_RAIL=6`、`WF_STEP_LINK=14`、`WF_STEP_MANY=8`），CSS 与自测共用同一组数字。

浏览器内实测：`pwsh -File tools\measure-panel.ps1` —— 页面用 `getBoundingClientRect()` 量自己，无头 Chrome `--dump-dom` 取数，断言 15 张卡每张「卡底→轨道」都是 **8.00 px**、轨道高 **6 px**、轨道底→连接线 **8 px** 不重叠、列内可滚动且列头不动。实测报告落在 `evidence/step07-measure.json`。

## 分步流程列（step-08）

右列不再是骨架行，而是**选中分步的流程**：每个工具调用/技能/文件操作一张节点卡，连续同类调用折叠成一行，默认只画最新 60 个：

| 能力 | 实现 |
|---|---|
| 节点卡 | 图标（`▤` 文件 / `⌘` 命令 / `✦` 技能 / `⧉` 子代理 / `⚙` 其他工具 / `≡` 消息 / `◍` 报告）+ 标题 `动词 · 目标`（如 `读 · client.js`；未知工具用工具名当动词）+ 副行（类别徽记 · 工具名 · 耗时 · 文件数）+ 右侧状态点 |
| 状态点 | 错误红；**当前活动节点且没有结果** → 蓝色脉动；有结果 → 绿；都没有 → 中性灰（不自称完成） |
| 折叠分组 | 连续同工具调用 ≥ 3 折叠为 `n 个连续 <tool>` + `HH:MM:SS–HH:MM:SS`，点击展开逐条（组内计数与首尾时间直接可见）；分组来源优先用宿主 `steps[].groups`，按 id 解析不到时退回浏览器自折叠 |
| 60 节点窗口 | 默认只渲染**最新 60 个**节点（时间正序，列表打开即滚到底部）；顶部提示条写「更早 n 个被折叠」+「展开全部」，展开后不回收直到切步 |
| 诚实省略 | 组是原子的（边界不切组）；「已省略 N 个节点」取 `max(每步 300 上限, nodeCount − 已画出)`，所以**全局 1200 上限**剪掉的节点也会被算进去（本步修正的一条口径缺陷） |
| 视觉层级 | 节点之间用左侧一条 `2px` 竖脊串起（每项一个圆点，进行中脉动）；右列独立滚动，头部与提示条在滚动区之外固定显示「分步流程 · 第 N 步 · 标题」 |
| 切换分步 | 每步的展开/展开全部/选中状态按步索引存取（`wfFlowUiFor`），切步**当帧**重置；列表滚回底部 |
| 选中节点 | 点击调 `onSelectNode(id)` 并高亮（`aria-pressed`/`data-selected`），step-11 在选中节点下方内联展开详情 |

几何与上限常量集中在 `theme.js`（`WF_FLOW_CAP=60`、`WF_GROUP_MIN=3`），自测与渲染共用同一组数字。

三层证据：

```powershell
node tools\check-flow.mjs              # 10/10：解压会话 zstd 日志，逐步比对 tool/call 数量 + 抽查 5 条 name/文件
pwsh -File tools\measure-flow.ps1      # 2026-10-27 重写：20/20，量类型页（旧「流程列」已随两列布局退役）
node tools\selftest-panel.mjs          # 283 条里 67 条属于本步
```

实测结论：未截断的每一步 `tool/call` 数 == 节点数（step2 被上限藏了 42 个，≤ 隐藏的 86）；985 个节点的时间戳全部能在原始日志找到；折叠页 4 个成员全以 `读 · …` 开头；「展开全部」页第一个节点就是该步最早的 `n267`；头部 `top 73.375 → 73.375`（滚到底不动）。原始数据在 `evidence/step08-flowcheck.json`、`evidence/step08-measure.json`。

## 子代理与并行任务的支线（step-09）

子代理、工作流与后台长任务跑在**所属分步的旁边**而不是它的序列里，所以它们长成从主轨道分出的泳道：

```
主轨道（FlowColumn）                支线（Branches.js）
─ ● 读 · NodeCard.js               ┌ ⧉ 子代理 · 统计自检脚本数量     ●
─ ● 改 · Branches.js   ──6px───┤   ▸ 子代理启动           22:19:39
─ ● 命令 · node …                 │   ◈ phase-A · 静态检查
                                   │   ⧉ 磁盘检查  completed  22:19:39
                                   └ （点标题折叠本道）
```

| 能力 | 实现 |
|---|---|
| 支线数据 | `src/fold.mjs` 的 `branches[]`：**不在** `state.nodes` 里，所以主流程节点数、同工具折叠、300/1200 上限与「当前活动」高亮全部不受影响 |
| 开启 | `subagent` / `subagent_fork` / `workflow` 的 `tool/call` 即开一道（标签取该调用的 `description`）；插件总线形状的 `subagent/start`、`workflow/start` 也能开，并**汇合到同一道**（按 runId 挂接，绝不多画一道） |
| 关闭 | 子代理工具**不阻塞**：结果是 `started subagent <id>`，只是「已启动」而不是完成；真正的结束是随后的 `source.kind = subagent-settled` 的 `user/message`（失败由 summary 判定），子代理答复先以 `agent-message` 到达并成为一道「子代理消息」行 |
| 后台任务 | `job/registered` **不**开泳道（实测：本会话 472 个 `pwsh` 全部是「登记 → 结算 → 工具结果」的同步顺序，逐个画道会把真正的并行工作淹掉）；只有「工具结果先到、结算后到」的**长任务**才升格为泳道 |
| 工作流 | `tool-workflow/run-start` 给道命名（runId），`agent-start` 每个成员一行（`seq` 为键，`agent-end` 原地改状态），`workflow/phase` / `phase` 字段作为道内**小节标题**，`run-end` 关道 |
| 上限 | 每道 ≤ 40 行（丢头部、`count` 与 `truncated` 如实计数）；状态里 ≤ 12 道（丢弃计入 `droppedBranches`）；每步最多画 4 道，其余写「另有 n 条支线」/「较早 n 条已省略」 |
| 渲染 | 每道一条 **6 px 彩色连接线**（色相按道序 268/196/152/32/340/224）+ 徽记（子代理 / 工作流 / 后台任务）+ 标签 + 活动数 + 状态点 + 折叠箭头；进行中的道**自己呼吸**，不抢主流程的「当前活动」闪动 |
| 交互 | 点道标题折叠/展开（按步记忆，切步重置）；点行调 `onSelectNode(id)` 并高亮，step-11 在选中节点下方展开详情 |
| 无并行时 | `wfRenderBranches` 返回 `null`，DOM 里**没有**支线区域（不是空壳） |

三层证据：

```powershell
node tools\check-branches.mjs           # 15/15：解压会话 zstd 日志 + 用发行版 fold 重放，逐道核对 raw 事件
node tools\selftest-fold.mjs            # 109 条里 45 条属于本步（h 子代理 / i 工作流 / j 后台任务 / k 上限与空会话）
pwsh -File tools\measure-branches.ps1   # 13/13：无头 Chrome 实测五个泳道页（连接线 6 px、色相、徽记、呼吸点、折叠、不溢出）
```

实测结论（2026-10-17，本会话日志 9131+ 事件）：用 `subagent` 起一个子任务后，重放得到 1 道 `subagent · 统计自检脚本数量`，行序列 `start → message → end`，状态 `done`；472 个同步 `pwsh` job 一道都没画；主流程节点数不受支线影响。原始数据在 `evidence/step09-branches.json`、`evidence/step09-measure.json`，截图 `evidence/panel-branch-dark.png`。

> **生效提醒**：`src/fold.mjs` 与 `lib/index.js` 属于**宿主半**，装在 `desktop` profile 后改它们**必须重启 DSH 进程**才生效（ESM 模块缓存）；浏览器半（`client.js`）改后 F5 即可。本步前就运行的宿主仍在不带支线的旧代码上，F5 看到支线需要先重启一次。

## 彩色流光曲线、包裹外框与闪烁（step-10）

三个视觉层，同一句意思：**这一步正在做的那件事，在哪里、在做什么、还活着吗**。

```
分步（左列）                        流程（右列）
┌────────────────┐           ╭──────────────────╮
│ ● 彩色流光与闪烁 │◀══彩虹═══▶│ 读 · file-40.js   │
│   进行中  正在⋯ │ 流光曲线  │ 工具 read  正在⋯   │
└────────────────┘           ╰──────────────────╯
  ↑ 流光包裹外框                ↑ 流光包裹外框（更细）
```

| 能力 | 实现 |
|---|---|
| 流光曲线 | `src/client/FlowEffects.js`：面板内一个绝对定位、`pointer-events:none` 的 `<svg>` 铺在 `.wf-body` 上；用 `getBoundingClientRect` 取「进行中分步卡片**右缘中点**」与「进行中节点卡**左缘中点**」，生成三次贝塞尔 `M x1 y1 C x1+bow y1, x2−bow y2, x2 y2`（`bow = clamp(dx·45%, 8, 140)`，坐标是 SVG 用户坐标 = px，无 viewBox 缩放） |
| 流光的颜色与动 | 6 段彩虹 `linearGradient`（`#ff2d78 → #ff9f1a → #ffe14d → #37d67a → #18b6ff → #8f7bea`）+ `stroke-dasharray:9 7`，`@keyframes wf-fx-dash` 推 `stroke-dashoffset:0 → −32`（一个图案长度 16，−32 是无缝循环），2 px 实描边叠一层 6 px `blur(2.5px)` 低透明度辉光，两端各一个 3.4 px 圆点；step-12 的 `brand` 配色通过根节点 `data-palette="brand"` 把描边切到品牌色渐变（`data-curve` 仍保留彩虹基线） |
| 包裹外框 | 进行中的分步卡与节点卡用 `::after` 画：`inset:-3px` + `padding:2px` + `mask-composite:exclude` 得到**外 2 px 彩色环 + 1 px 透明缝**；环里是 300 % 宽的彩虹 `linear-gradient`，`@keyframes wf-fx-wrap` 推 `background-position` 让它绕圈流（**不用** `@property --angle`，Safari/旧 Chrome 不可靠）；节点卡的环同样细一点 |
| 闪烁（当前活动） | `src/client/pulse.js` 的 `wfRenderLive`：6 px 圆点（`opacity .35↔1` + `box-shadow` 扩散）+「正在」+ 三点省略号（`nth-child` 错开 0.16 s），周期 **1.2 s**——与 DSH 思考指示同款节奏，故意比四周 1.6 s 的状态点快；只给**正在进行的那个分步**与**正在调用的那个节点**，完成/待执行的卡一律安静 |
| 空闲暂停 | 宿主 `view.running`（`turn/start` 真、`turn/end` 假）→ `data-idle="1"`（面板根节点）→ `.wf-root[data-idle='1'] *, *::before, *::after{animation-play-state:paused!important}`。伪元素必须单列：`animation-*` 不继承，只写 `*` 会留下外框环继续转（浏览器实测抓到的真缺陷） |
| 减少动效 | `prefers-reduced-motion: reduce` → `data-motion="static"` → 同一批选择器 `animation:none!important`；彩虹环/曲线保留为**静态彩色**，没有动画对象 |
| 端点规矩 | 两张卡片**都完整落在各自滚动视口内**才画曲线，否则 `data-visible="false"` 并写明原因（`step-clipped` / `node-clipped` / `no-gap`…）。不把端点夹到视口边缘——那就不再「贴合卡片边缘」，≤2 px 容差也失去意义 |
| 重算时机 | `wfFxBind`：窗口 `resize`、任意滚动（`capture=true`，两列内部滚动都收得到）、`ResizeObserver`（body / 两个滚动容器 / 两张卡）+ rAF 节流；`rAF` **不是**唯一时钟——无头 `--dump-dom`、后台标签页里它根本不触发，所以 40 ms 定时器兼作兜底（同一 token 只让先到者生效）。React 侧 `wfUseFlowEffects` 只在「视觉签名」变化时重建绑定（轮询同形不会每 800 ms 抖一次） |
| 性能 | 动画只落在 2 条路径 + 2 个外框 + 当前活动的小挂件上，**没有任何逐节点动画**；节点 > 60 时本来只画 60 个，而外框只认当前那一个 |

三层证据：

```powershell
node tools\selftest-effects.mjs        # 123/123：几何/贝塞尔精确值、DOM 写入与生命周期、三条 idle 信号、渲染树、CSS 契约
pwsh -File tools\measure-effects.ps1   # 49/49：无头 Chrome 实测四个页（端点误差 ≤0.01 px、外框在流、6 px 呼吸点、
                                       #   空闲 9 个动画全 paused、减少动效 0 动画对象、两帧像素差 8393）
node tools\preview-effects.mjs         # 生成 evidence/preview/panel-fx-*.html
```

实测要点（2026-10-17，760 px 面板）：曲线端点相对两张卡片边缘的误差 `0 / 0.01 px`（验收要求 ≤2 px）；两列空隙 28 px，曲线横向 `M331.59 113.73 C344.19 113.73 346.99 477.69 359.59 477.69`（纵向跨越 364 px 的 S 形流光）；外框环 `top/left = -3px`、`padding = 2px`、`mask-composite = exclude`、7 段彩虹；呼吸点 `6×6 px / 半径 50% / 1.2 s`；空闲页 9 个动画全部 `paused`；`data-motion=static` 页动画对象 **0** 个；两帧（3000 ms vs 3600 ms 虚拟时间）差 8645 px（总计 1 260 000 px）。原始数据在 `evidence/step10-measure.json`，截图 `evidence/panel-fx-dark-crop.png`（进行中）、`panel-fx-idle-dark-crop.png`（空闲）、`panel-fx-static-dark-crop.png`（减少动效）、`panel-fx-narrow-dark-crop.png`（560 px）。

> **生效提醒**：本步的曲线/外框/呼吸点全在浏览器半，**F5 即生效**；但 `view.running` 来自宿主半（`src/fold.mjs` 的 `turnActive` + `lib/index.js` 的 `stateSchema`），所以「空闲时暂停」要**重启 DSH 一次**之后才在真实会话里成立（与 step-09 同一次重启即可）。在宿主更新之前，浏览器半按「有活动节点 / 15 s 内有事件」推断，功能可用、只是空闲判定的边界不如 turn 标志准。
## 节点详情与分步详情（step-11）

点一个节点，看它**到底干了什么**；点分步的「i」，看这一步**交了什么**。两块详情都内联展开在原卡片下方——不弹新窗、不离开流程。

| 能力 | 实现 |
|---|---|
| 节点详情头部 | `src/client/NodeDetail.js`：工具名 + 类别徽记（文件 / 命令 / 技能 / 子代理 / **CAD** / 其他）+ 状态（已完成 / 失败 / 无结果记录）；类别从 `wfNodeCategory` 派生，只多拆一个 `cad`（`cad_*` / `cadflow_*` / `dsh_cad_*`），所以卡片与详情不会各说一套 |
| 参数摘要 | 宿主 `argsText`（折叠摘要，≤200 字）等宽 `pre-wrap` 单行预览；`<details>` 展开**全文**（仍是宿主上限内的完整摘要）。命令节点给「查看完整命令」+ 一键复制命令 |
| 文件区 | 按动作分组：读取 📖 / 修改 ✏️ / 写入 💾 / 查询 🔎 / 其他；每行 **basename + 灰色目录**，整行就是一个复制按钮（`data-wf-copy` 带完整路径）。同一路径在同一分组内只列一次 |
| 结果与错误 | 成功显示结果首行；`isError` 时卡片状态点标红、详情里显示宿主保存的错误文本（首行，≤200 字）并注明上限（见下方「已知边界」） |
| 元信息 | 开始时刻、耗时（原始 ms）、事件 `seq`（宿主 step-11 新加字段；旧缓存/未重启时显示 `—`） |
| 分步详情 | `src/client/StepDetail.js`：PAE `stepReports` 的 **summary / artifacts（逐条可复制）/ exit_code / 报告状态**；没有报告时显示「**这一步还没交报告**」，绝不空白 |
| 分步统计 | 工具数、去重文件数、节点数、开始/结束时刻与时长；宿主 300 节点上限截断时明确写「另有 n 个节点宿主未发送」，不把少了当没有 |
| 交互 | 「i」是卡片的**兄弟** `<button>`（按钮里套按钮是非法 HTML），绝对定位在卡片右侧预留的 26 px 带内，Tab 可达、`aria-expanded`/`aria-controls` 齐全；点卡片选中即展开该步详情；`Esc` 只收起详情（不关面板）；点已选中的节点/Esc 收起节点详情 |
| 复制 | `navigator.clipboard.writeText` 优先；失败（`file://`、拒绝授权、旧内核）自动回退隐藏 `textarea` + `execCommand('copy')`；按钮 1.5 s 内显示「已复制 / 复制失败」，之后恢复原文（状态写在独立的 `.wf-copy-status` span 里，文件行的 basename+目录不会被抹掉） |
| 隐私边界 | **只显示路径与参数，从不显示文件正文**。这是结构保证：宿主 `argsDigest` 丢掉 `content/old_str/new_str`，`store.js` 又按白名单逐字段拷贝。自测与浏览器检查都用带 `content` 标记的节点断言整棵 DOM 不含该标记 |
| 与 step-10 的配合 | `<details>`/分步详情的开合会改变列高，`wfBindDetailNudge` 在 toggle 后 40 ms 触发一次 `resize`，让流光曲线按既有监听重新量端点（`ResizeObserver` 看不到滚动容器的内容高度变化） |

证据：

```powershell
node tools\selftest-detail.mjs        # 83/83：模型/报告匹配/截断诚实、两棵渲染树、复制三条路径、Esc/nudge、隐私白名单
pwsh -File tools\measure-detail.ps1   # 54/54：无头 Chrome 五个页（完整路径可复制、命令展开 200/200、错误文字与红点、
                                      #   无报告提示、关闭态、等宽/pre-wrap 实测、Esc 真事件、1.5 s 恢复）
node tools\preview-detail.mjs         # 生成 evidence/preview/panel-detail-*.html
```

实测（2026-10-17，step-02 修完预览壳后重测）：edit 详情里两个被改文件的**完整路径**都在 `data-wf-copy` 上，点击后 `clipboard.writeText` 收到的正是 `D:\proj\src\client\NodeDetail.js`，按钮变「已复制」（绿 `rgb(69,192,122)`）并在 1.5 s 后回「复制路径」；命令页默认单行摘要，展开后是 **200/200 字符**的完整命令；错误节点色 `rgb(232,90,90)`、错误文本与宿主记录逐字相同；无报告分步显示「这一步还没交报告」且统计为诚实的 0。原始数据 `evidence/step11-measure.json`，截图 `evidence/panel-detail-dark-crop.png`、`panel-detail-command-dark-crop.png`、`panel-detail-error-dark-crop.png`、`panel-detail-noreport-dark-crop.png`。

> step-02（本轮）修了 `preview-detail.mjs` 的预览壳：它之前把面板接在 100vh 假应用的**外面**，截图因此掉到首屏以下、五张详情图全是空壳；现已改成 step-13 的 `[rail | main]` 真实座位（面板注入 `main`），截图重出且 `measure-detail.ps1` 仍 54/54。
已知边界（不掩饰）：

- **错误全文只到 200 字**。宿主 `fold.mjs` 对错误只保存首行、`TEXT_LIMIT = 200`；本步没有把 4 KB 级错误抬进持久状态（那会让每个失败节点把缓存撑大）。界面直说「错误文本为宿主记录的首行（上限 200 字）」，而不是假装展开全文。
- **命令全文同样受宿主 `COMMAND_LIMIT = 200`**；展开看到的是完整**已存摘要**，超出部分宿主从未发送。
- `seq` 是宿主字段（`src/fold.mjs` 的 `nodeView` + `lib/index.js` 的 `repairNode`），**需重启 DSH 一次**后真实会话才有值；浏览器半 F5 即生效。重启前详情里的 `seq` 显示 `—`，其余功能不受影响。

> **生效提醒**：详情 UI、复制、Esc、CSS 全在浏览器半，**F5 即生效**；`seq` 与「工具数/文件数」所依赖的节点字段随宿主半更新，需重启 DSH 一次（与 step-09/10 同一次重启即可）。
## 面板设置与工作流快照导出（step-12）

头部齿轮打开的是**面板内的一节设置卡**（不是新弹窗），改完当帧生效、F5 后保留；四个设置全部只影响展示，**不写宿主状态、不改折叠结果**。

| 设置 | 可选值 | 缺省 | 表现 |
|---|---|---|---|
| `palette` 配色 | `rainbow` / `brand` / `soft` | `rainbow` | `brand` 把曲线、流光外框和运行中进度条换成主题品牌色；`soft` 换低饱和静态色并把运行中强调色降亮 |
| `motion` 动效 | `full` / `always` / `static` | `full` | `full` 沿用 step-10「仅在会话进行时动、空闲暂停」；`always` 空闲也动；`static` 关掉全部动画（系统 `prefers-reduced-motion` 仍优先，开启时 `always` 也按静态渲染） |
| `detail` 详情深度 | `summary` / `title` | `summary` | `summary` 保留副行与可展开详情；`title` 只画图标 + 标题 + 状态点，隐藏副行、分步「i」、报告摘要与内联详情，节点卡标 `data-compact="true"` |
| `nodeLimit` 节点上限 | `30` / `60` / `120` / `0`（全部） | `60` | 只影响右列默认窗口；`0` 直接画该步全部已发送节点；「展开全部」仍可临时抬起有限上限 |

`width` / `height` / `collapsed` / `selectedStep` 与上述四项统一存在同一个 `localStorage["dsh-workflow-map:prefs"]`；缺字段、非 JSON、越界值都被 `wfSanitizeSettings` / `wfSanitizePrefs` 逐字段修回缺省，损坏记录不会白屏。**「恢复默认」恢复的是文档缺省值**（`wfDefaultPrefs()`），不是上次保存值。

### 工作流快照

设置卡底部两组「复制 / 下载」按钮，同一份数据两条交付路径：

- **Markdown**：`# 总任务` → 任务标题、生成时间、完整 sessionId、`done/total 步 · percent%` → `## 分步` → 每步 `### N. 标题（状态 · 进度）` → 每个节点 `- 工具 · 标题 · 文件数 · 耗时`。
- **JSON**：`{ schema: "dsh-workflow-map.snapshot/v1", generatedAt, generatedAtMs, sessionId, task, progress, steps:[{index,planIndex,title,status,statusLabel,percent,percentSource,startedAt,endedAt,nodeCount,truncated,nodes[]}] }`。节点复用面板同一份白名单（`id/kind/tool/category/title/detail/argsText/status/seq/at/durationMs/files/resultHead/error`），**`content` / `old_str` / `new_str` 永不进入快照**。
- 步骤标题、状态、百分比取 `model.steps`（与卡片同一套 PAE → todo → anchor → host 策略）；节点按 `view.steps[].nodeIds` 对齐，标题走与节点卡相同的 `wfNodeTitleParts`。**导出包含宿主实际发送的全部节点，不受右列 60 节点窗口限制**；宿主上限截断的差额用 `truncated` 如实标出。
- 复制走与节点详情相同的 `navigator.clipboard` → `textarea/execCommand` 回退 + 1.5 s「已复制 / 复制失败」；下载用 `Blob` + `URL.createObjectURL`，文件名 `workflow-<session tag>.md|json`，session tag 先去掉 `session-` 前缀再取前 8 位字母数字（如 `workflow-f069ece7.md`）；创建的 object URL 在面板卸载时统一 revoke。

证据：

```powershell
node tools\selftest-settings.mjs       # 43/43：默认/损坏自愈、四组控件、即时渲染、Markdown/JSON 计数、下载/撤销、剪贴板
pwsh -File tools\measure-settings.ps1  # 53/53：无头 Chrome 点真实控件；brand/soft 计算样式、idle 暂停/always 运行、
                                       #   30/60/120/全部窗口、title 紧凑卡、损坏 localStorage 自愈、Blob 文件名与 revoke
node tools\preview-settings.mjs        # 生成 evidence/preview/panel-settings-{default,corrupt}.html
```

实测（2026-10-18，1400×900）：设置卡 720×209 px、4 行 12 个按钮全部可见、无横向溢出；`brand` 的曲线 `stroke=url("#wf-fx-brand")`，`soft` 的 `stop-color=rgb(127,147,184)`；空闲时 `full` 的跑马环 `animation-play-state: paused`，`always` 为 `running`，`static` 为 `animation-name: none`；节点窗口 `60/30/120/70`；Markdown 2 个步骤标题 + 72 条节点行，JSON 2 步 / 72 个已发送节点 / schema v1；下载 `workflow-f069ece7.md`，object URL `1 → revoke 1 → 0`。原始数据 `evidence/step12-measure.json`，截图 `evidence/panel-settings-default.png`。

> **生效提醒**：设置/导出全在浏览器半，`client.js` 重新构建后 **F5 即生效**；本步没有新增宿主写入，不需要重启 DSH。旧版缓存里没有 `palette/motion/detail/nodeLimit` 时按缺省补齐。

## 落点迁移：悬浮窗 → 左栏图标 + 主内容区（step-13）

面板不再是右上角的独立悬浮窗，而是**侧边栏体系里的一个页面**：左栏多一个与「任务 / 插件」同类的「工作流」图标，点它中间主内容区整块变成工作流面板；原来的独立悬浮窗连同它的 `×` 一起消失。

| 能力 | 实现 |
|---|---|
| 两个座位、同一个 id | `sidebar.panellist`（`id: "workflow-map"`、`order: 10`、`label` 走本包 locale、图标 `WorkflowMapIcon`）＋ `main`（`key: "workflow-map"`）。`PanelRow` 用 `renderSlot("sidebar.panellist", …, {only:id})` 画图标，点它 `selectPanel(id)` 再按同一个 key 派发 `main` —— 两个槽必须同 id 一起注册 |
| 图标 | 内联 `<svg>`（24×24 viewBox、`currentColor`、`active` 时满透明度），与 `icon.svg` 同图形；不引入外部 svg 依赖（ModuleLoader 工厂里解析不到资源 URL） |
| 几何 | `.wf-root{position:relative;width:100%;height:100%}` + `.wf-card{flex:1 1 auto;min-height:0;border-radius:0}`：宽高由布局给，**无 `position:fixed`、无 `z-index`、无 `pointer-events` 分层、无内联尺寸** |
| 头部 | 保留收起 `‒` 与设置 `⚙`；**删掉 `×`**（主区面板没有「关闭」语义，点左栏其他图标即离开）；`role="dialog"` 改为 `role="region"` + `aria-label` |
| 收起态 | 主区顶部一行 `.wf-capsule-bar`（胶囊 + 「点击展开」提示，`aria-expanded="false"`）；`Alt+W` 仍可切换 |
| 删除的旧能力 | `wf-grip-left` / `wf-grip-bottom` 两个拖拽抓手、`wfBeginWidthDrag` / `wfBeginHeightDrag`、`onWidthDrag` / `onHeightDrag` / `onClose`、`panel.close` / `panel.grip.*` 词条、`WF_Z_INDEX=60`（现为 0，仅作命名占位） |
| 旧记录兼容 | `localStorage` 里 step-06..12 写下的 `width`/`height` 仍被**读入并消毒**（不会因为多两个字段就把整份偏好丢掉），但不再参与尺寸 |
>
> **会话标签栏席位（step-05 删掉实验性覆盖层 → 2026-10-26 会话6 补上正解）**：`conversation.view`（本包注册的**第三个**座位，`order: PANEL_ORDER * 4 = 40`）注册的是座位包装 `WorkflowMapViewSeat` —— 同一个 `WorkflowMapPanel`（同一份界面、同一份轮询、同一份热注入，不是第二个实现），外面只多一层**无边盒**标记 `div[data-dsh-workflow-map="conversation-view"]`（`display:contents`，不改变布局）。它下方的输入框（composer）由宿主在 `conversation.content` 里与 `conversation.view` **并列**渲染，插件无法从自己的树里卸载它；正解是样式表按座位标记用 `:has()` 把**兄弟座位**藏掉：`[data-conversation-content]:has([data-dsh-workflow-map='conversation-view']) [data-composer-seat]{display:none!important}`（输入框与它上方的任务条都在 `[data-composer-seat]` 内）。切回「对话 / 上下文 / 编队」时宿主会卸载本视图，标记随之消失，输入框自动回来 —— 无需任何状态同步，也不占用宿主留给「计划评审」的 composer 接管链。
>
> 会话6 曾试图用覆盖层盖住它（`data-seat="tab"` + 实测「面板 ∪ 输入框」矩形定位 + `localStorage["dsh-workflow-map:cover"]` 开关），六轮实测均失败：`position:fixed` 的包含块会被祖先的 `transform`/`filter`/`contain` 改写，改 `absolute` 反推偏移又会把面板自身推出可见区。**该实验性链路已整体删除** —— `wfUseTabCover` / `wfCoverOptIn` / `dsh-workflow-map:cover` / `data-seat` / 覆盖 CSS / 只用于传标志的薄包装 `WorkflowMapTabSeat` 全部不存在；`tools/build-client.mjs` 已加 forbidden 断言，任一字符串回潮即构建失败。历史现状（step-05）：**composer 如实保留、可见且可用**，与宿主自带「对话」标签页完全一致；左栏菜单席位本就不覆盖。**2026-10-26 会话6 已改为「仅在本标签页隐藏」**（上条的 `:has()` 规则），浏览器实测见 `evidence/wfmap-composer-hidden.png`（本页无输入框）与 `evidence/wfmap-composer-back.png`（切回对话页原样恢复）。
>
> 留证（step-05）：`grep -rn "wfUseTabCover\|wfCoverOptIn\|dsh-workflow-map:cover" src/` 零命中，重建后 `client.js` 同样零命中；`selftest-shape` 136/136（新增 `client.noComposerCover` 断言）、`selftest-panel` 469/469、`selftest-host` 54/54、`selftest-effects` 166/166、`selftest-detail` 119/119、`selftest-settings` 43/43 全绿。详见 `evidence/step05-cover-removed.md`。

证据：

```powershell
node tools\build-client.mjs            # 生成 client.js；新增 forbidden 断言：shell.overlay / role:"dialog" / wf-grip-* / 内联 width 一出现就构建失败
node tools\selftest-shape.mjs          # 86/86：两个座位都已注册、无 shell.overlay、root 不再是 fixed、无抓手/无 dialog/无关闭按钮
node tools\selftest-panel.mjs          # 319/319：region + 无内联尺寸 + 无抓手 + 头部只剩两个按钮 + 旧 width/height 被忽略 + 胶囊行
node tools\selftest-effects.mjs        # 123/123（流光层未受落点变化影响）
node tools\selftest-settings.mjs       # 43/43
node tools\selftest-detail.mjs         # 83/83
pwsh -File tools\measure-dock.ps1      # 14/14：无头 Chrome 量真实布局槽位（新增）
pwsh -File tools\measure-flow.ps1      # 2026-10-27 重写：20/20，类型页调用清单与诚实边界
pwsh -File tools\measure-effects.ps1   # 2026-10-27 重写：28/28，改为量动画与减少动效（三条状态）
pwsh -File tools\measure-branches.ps1  # 14/14：支线回归
pwsh -File tools\measure-detail.ps1    # 54/54：详情回归
pwsh -File tools\measure-settings.ps1  # 53/53：设置/导出回归
pwsh -File tools\measure-panel.ps1     # 10/10：分步卡几何回归
```

浏览器实测（2026-10-18，1400×900）：`root 1162 / slot 1162`（宽）、`root 748 / slot 748`（高）、`card 1162×748`、`position=relative`、`z-index=auto`、`card style=""`、抓手 0 个、`role=region`、页面溢出 `0/0`、两列都在、15 张分步卡 + 35 张节点卡；窄屏 900×700 同样 14/14。活体座位核验（`cordis_inspect_query` → client `Slots`）：`sidebar.panellist` 的 occupants 含 `workflow-map`（order 10），`main` 的 occupants 含 `key: workflow-map`，而 `shell.overlay` 的 14 个 occupants 里**没有** `workflow-map`。原始数据 `evidence/step13-dock-measure.json`，截图 `evidence/step13-panel.png`、`step13-capsule.png`、`step13-planning.png`。

> **生效提醒**：本步只改浏览器半（`src/client/*.js` → `client.js`），**F5 即生效**，不需要重启 DSH。回退快照在 `src/client/{panel,theme,store}.js.bak-step01`。

## 安装

本机 `desktop` profile 由 Electron 应用独占管理，`npx` CLI 通道被设计性拒绝；唯一可用通道是桌面端自带的 CLI（step-05 执行）：

```powershell
$DSHROOT = 'C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness'
$PROJECT = 'C:\Users\Administrator\Documents\dsh-plugins\dsh-workflow-map'

$env:ELECTRON_RUN_AS_NODE = '1'
& "$DSHROOT\DeepSeek Harness.exe" --expose-internals `
  "$DSHROOT\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" `
  plugin --profile desktop add $PROJECT
```

装入协议是 `link:`（目录符号链接）⇒ profile 直指本目录，改文件即改插件。

### 生效方式（按「改的是哪一半」区分）

| 改动落在 | 生效方式 |
|---|---|
| 宿主半 `index.js` / `lib/index.js` / `src/fold.mjs` / `src/orchestrator.mjs` | 必须重启 DSH 进程 |
| 浏览器半 `client.js`（含 `src/client/*.js` 改动后重建） | 只需刷新页面（F5）。profile 是 `link:` 符号链接，源目录改完即生效 |
| `sidebar.panellist` + `main` 座位（step-13） | 同样属于浏览器半：**F5**。座位已活体验证（`Slots` 里 `workflow-map` 同时出现在两个 slot 的 occupants） |

## 路线图（对应当前 14 步执行计划）

1. **step-01 骨架**（已完成）：可安装、可挂载、语法自检通过。
2. **step-02 宿主投影**（已完成）：`workflowView` 把会话事件折叠成「分步 + 每步流程节点 + 当前进行中节点 + 每步百分比」。
3. **step-03 读取 PAE 计划**（已完成）：`src/orchestrator.mjs` 只读 `.pae/<sessionId>/orchestrator.json`，视图多一个 `plan` 段（PAE 优先，todo 兜底）。
4. **step-04 宿主 HTTP 视图路由**（已完成）：`GET /dsh-workflow/state?sessionId=…`，ETag/304、404/400/500 全走 JSON，座位幂等可回滚。
5. **step-05 装入 desktop profile**（已完成）：`link:` 安装，客户端座位与 `/dsh-workflow/state` 在真实 GUI 内注册。
6. **step-06 客户端面板骨架**（已完成）：双列、`localStorage` 记忆、胶囊、`Alt+W`（当时的拖宽拖高与悬浮落点已在 step-13 移除，见下）。
7. **step-07 分步卡片与框下留白进度条**（已完成）：状态环/徽记/报告摘要/序号、8 px 留白 + 6 px 轨道、`~N% 估算` 与 `N% 自报`、卡间 14 px 连接线、>8 步内部滚动 + sticky 列头（浏览器实测 8.00 px）。
8. **step-08 分步流程列**（已完成）：节点卡（图标/`动词 · 目标`/副行/状态点）、连续同类调用折叠成可展开分组、最新 60 节点窗口 + “更早 n 个被折叠 / 展开全部”、右列独立滚动且头部与提示条固定在滚动区外（原始日志 10/10、浏览器实测 27/27）。
9. **step-09 子代理与并行任务的支线**（已完成）：子代理 / 工作流 / 后台长任务的泳道（6 px 彩色连接线、徽记与状态、40 行/12 道/4 道上限、自身呼吸点、折叠、选中）；支线不进主流程节点；无并行时 DOM 无支线区域（原始日志 15/15、浏览器实测 13/13、真实子代理重放 1 道 done）。
10. **step-10 彩色流光曲线、包裹外框与闪烁**（已完成）：分步↔节点的三次贝塞尔流光曲线（6 段彩虹/2 px + 6 px 辉光/dash 流动/端点圆点）、两边 `mask-composite` 彩虹外框（外 2 px 环 + 1 px 透明缝，2.6 s 流动）、当前活动的 6 px 呼吸点 + 「正在⋯」（1.2 s）、`view.running` 驱动的空闲全暂停与 `prefers-reduced-motion` 静态降级；端点几何误差 ≤0.01 px（自测 123/123、浏览器实测 49/49、两帧像素差 8393）。
11. **step-11 节点详情与分步详情**（已完成）：点节点内联展开工具/类别/状态、参数摘要与展开全文、按动作分组的文件（整行复制完整路径）、结果首行或错误文本、开始/耗时/seq；分步「i」展示 PAE 报告 summary/artifacts/exit_code 与工具/文件/节点计数、起止时间；Esc 收起详情；不显示任何文件正文（自测 83/83、浏览器实测 54/54）。
12. **step-12 面板设置与工作流快照导出**（已完成）：头部齿轮内的设置卡（`palette` rainbow/brand/soft、`motion` full/always/static、`detail` summary/title、`nodeLimit` 30/60/120/全部）、统一 localStorage 与损坏自愈、恢复文档缺省；Markdown/JSON 快照与面板逐步/节点一致，复制走 1.5 s 回执、下载 `workflow-<id>.md|json` 并在卸载时 revoke object URL（自测 43/43、浏览器实测 53/53）。
13. **step-13 落点迁移**（已完成）：面板从 `shell.overlay` 悬浮窗迁入侧边栏体系（`sidebar.panellist` 图标 + `main` 面板），删掉 `×`/`dialog`/两个拖拽抓手/内联尺寸（浏览器实测 14/14）。
14. **折叠三角改为可点按钮（分步卡 + 分组）**（已完成）：`::before` 装饰字符换成真 `<button class="wf-tri">`（20 px × 卡片全高的点击带、`aria-expanded`/`aria-controls`、Tab 可达、▸/▾ 随状态翻转），分步卡与折叠分组共用同一个 `wfTri` 渲染函数（自测 106/106、浏览器实测 23/23）。
15. **step-03（本轮）进度条补「上次估计已过多久」与「预计剩余」**（已完成）：第二行显示「N 分钟前估计 · 还剩 ≈N 分钟」，与百分比同源同步；宿主新增 `step.lastEstimateAt`（报告/模型步事件时刻打戳，纯折叠不读时钟），浏览器侧两个纯函数算两段并各自设门槛——缺字段、未开始、已完工、`percent≤0` 一律整段不渲染，不用 `0`/`—` 冒充；窄容器只保留第一行（自测 fold 130/130、panel 345/345，浏览器实测 23/23，证据 `evidence/step03-timing.md`）。**宿主半改动需重启 DSH 一次生效，浏览器半 F5 即生效。** **2026-10-26 会话6：预计剩余已按用户要求移除（连宿主端计算一并删除），进度条第二行只留「N 分钟前估计」；详见 `evidence/step06-elapsed-only.md`。**
16. **step-04（本轮）热注入提示词**（已完成）：头部 ⇄ 与「‒」「⚙」同排同框（23×23、radius 6 px），点击后 `wf-body` 变成 flex 两栏（左流程图 `flex:1 1 auto` 且**零位移**、右注入区固定 320 px），窄容器（`@container` < 900 px）变上下堆叠；宿主新增 `POST /dsh-workflow/steer`（405/503/400×4/404/409/413/500/200 全 JSON，2000 字/次、64 KiB 体）经 `agent.steer(createUserMessage{source:{kind:'plugin'}})` 落到 `next-step`，**不调 `cancel`、不打断当前轮**；只有 `{ok:true}` 才显示「已注入」，失败显示宿主原文（自测 probe-steer 66/66、panel 399/399、shape 98/98，浏览器实测 22/22，证据 `evidence/step04-hot-inject.md`）。**宿主半改动需重启 DSH 一次生效，浏览器半 F5 即生效。**
17. **step-03-unsteer（本轮）热注入的完整撤回链路**（已完成）：历史行「待会话拾取」时出现「撤回」按钮，点击走新增的 `POST /dsh-workflow/unsteer {sessionId,messageId}` → 宿主 `agent.inbox.remove(messageId)`（已被接下 / 不存在 → 409「该注入已被会话接下或不存在」；会话未运行 → 409；宿主无 `inbox.remove` → 503），`/steer` 的 200 同时带回它写下的 `messageId`。撤回的**持久半边完全在宿主日志里**：`remove` 落一条 `agent/inbox/spliced { outcome: "canceled" }`（`agent/inbox/discarded` 只是进程内 dispatch、不入日志；145 份真实日志实测 0 条），而 splice 记的是**位置**不是消息 id，所以折叠按宿主自己的 splice 语义维护收件箱台账 `inboxIds`，才定位得到被移除的是本插件哪一行（`stateVersion` 2→3，旧检查点按契约丢弃重建）。浏览器侧**不乐观更新**：行等下一次轮询由日志翻成「已撤销」，撤回中按钮置灰防连点，失败时把宿主原文逐字打在该行下（自测 probe-steer 121/121、fold 183/183、panel 447/447、host 54/54、shape 127/127，真实会话重放 145/145，证据 `evidence/step03-unsteer.md`）。**宿主半在本机运行中的 GUI 上已实测生效（`/state` 200、`/unsteer` 405/409/400 实测）；浏览器半已重建 `client.js`，F5 即生效。**
18. **会话4 · 单页改版**（已完成）：两列布局（左分步列 + 右流程列）被**一个单页**取代——每步一张卡串成一条主流程，两侧挂圆形的工具/文件类型接口（直线连接，每侧 2 槽上限，超出时卡上印「另有 N 类未画在两侧」），点圆点/卡片在**右页**打开该类型调用清单或该步记录；`FlowColumn` / `Branches` / `FlowEffects` 不再被挂载（元测随之重锚，见 `evidence/session7-rerun.md`）。
19. **会话5/6 · 热注入与进度**（已完成）：右页注入器带历史三态（已接下/待拾取/已撤销）与常驻注入条；会话标签栏新增入口并加 `:has()` 规则隐藏宿主 composer；先加后删的「预计剩余」已整体移除；另修多 running、地图≠todo 表、已完成步显示 0 工具 0 文件、被拒审批仍标「需确认」四处缺陷。
20. **会话7（0.3.0）· 全链复跑与开源定稿**（已完成）：把 5 套量「已移除 UI」或接线过期的浏览器量测**逐套重编到现存 UI**（effects→动画与减少动效、detail→右页新契约、settings→设置卡+根属性、flow→类型页、branches→卫星圆点），全链 **23/23 套全绿**（离线 1505 条 + 浏览器量测 307 条）；25 个 `*.bak-*` 移出包（`files` 含 `lib/src` 整目录，否则会随 npm 包发布）；版本 0.2.0 → **0.3.0**；新增 `evidence/session7-rerun.md` 逐套留证。发现两个**未修**的外观/文案缺陷（OPEN-1 品牌配色外框选择器未迁移、OPEN-2 类型页副标题印出 `{count}`），均附可执行补做包。

每一步的实测证据落在本目录 `evidence/` 下（随步骤推进补齐）。
