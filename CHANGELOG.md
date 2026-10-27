# Changelog

All notable changes to `dsh-workflow-map` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · [SemVer](https://semver.org/).

## [0.3.0] - 2026-10-27

### Added

- **进度估算的诚实化（step-02-progress）**：自报与实测取 `min` —— 自报虚高不再压死 todo 表的
  完成比（实测 6 个自报里 5 个落在 85–100，曾把 40% 的现实钉在 85%）；todo 表高于自报时以实测
  为准。时间基线冷启动时改用计划自身的步序（`source: "baseline:steps"`），首个进行中的步不再
  只剩一条流光。
- **热注入入口放大 + 常驻条（step-04-inject-prominence）**：页头入口放大为品牌色实色按钮
  （≥96×30，待拾取时带徒标）；右页 `kind=inject` 底部新增可回车直发的**常驻注入条**，
  会话标签栏席位不再需要先展开右页才能发。
- **本版新增 10 套浏览器量测的现代重锚（step-07）**：`measure-flow` 改为量「类型页」（旧两列
  「流程列」的继任者，含上限诚实提示与会话域空态）；`measure-effects` 改为量「动画与减少动效」；
  `measure-branches` 改为量「卫星圆点与每侧 2 槽上限」；`measure-detail` / `measure-settings`
  改为用当前 extras 契约（右页 `right/pageStep/pageType/openCall`）。为什么重要：旧量测的
  被测 UI 在会话4 已被移除，不管断言多细都只是在量空气。

- **热注入的完整撤回链路（step-03-unsteer）**：历史行「待会话拾取」时出现「撤回」按钮，
  走新增的 `POST /dsh-workflow/unsteer` → 宿主 `agent.inbox.remove(messageId)`；`/steer` 的
  200 同时带回它写下的 `messageId`。`stateVersion` 2→3：折叠新增收件箱台账 `inboxIds`
  （按宿主 `inboxProjectionDefinition` 的 splice 语义逐条重放），因为撤回的持久记录是
  `agent/inbox/spliced { outcome: "canceled" }`——**位置**，不是消息 id；只有台账能指出
  被移除的是本插件哪一行。旧检查点按契约丢弃重建。
- `selftest-fold` / `selftest-panel` / `selftest-shape` / `probe-steer` 同步扩充：位置撤销、
  已接下不被翻、越界 splice 不炸、行内按钮三态、宿主原文回显、三端点注册。
- **会话标签栏入口**：注册第三个席位 `conversation.view`（`id: workflow-map`, `order: 40`），
  排在 `chat(0) / trajectory(10) / context(20) / fleet(30)` 之后。点一下渲染的就是同一个
  `WorkflowMapPanel`——同一份轮询、同一份热注入、同一份设置，不是第二个实现。
- `selftest-shape` 新增 3 条断言（席位存在 / order 在编队之后 / 渲染同一个面板组件）。
### Fixed

- **多步同时流光（要求②的根因）**：`runningStep()` 取"第一个 running 行"，而合成步
  「规划与调研」只在 `openPlanStep` 里收尾，于是 todo-only 会话里它会一直 running，后续每一步
  再叠一个。实测 129 个真实会话中 **22 个同时有 2+ 个 running 步**（21 个含合成步）。
  新增 `soleRunning()`：每个 fold 事件后收敛为**唯一** running 行，多余的行按"有 startedAt 则
  closeStep，无则退回 pending"收尾；`stepProgress/report` 也改为归属 todo 表里真正
  `in_progress` 的行，不再一律给第一个 running 行。
  → 修复后 **0/135** 个会话出现多 running 步。
- **分步与对话界面不同步（要求①）**：fold 只增不删，重规划/改写标题后旧行残留。实测 97/129
  个会话结尾都带着当前 todo 表里已不存在的行。新增 `syncToTodos()`：视图**严格**按最新 todo
  表（按表自身顺序）产出分步，表里没有的行与其节点一并移除。
  → 修复后 **0/135** 个会话出现"地图有、对话没有"的分步。
- **已完成步显示「0 工具 0 文件」**：三个叠在一起的缺陷。
  1. `foldTodos` 按标题匹配，模型改写自身 todo 文案时会新建一行，旧行带着节点变孤儿 →
     改为"槽位 + 生命周期一致即就地改名"，并累积 `aliasKeys` 迁移该行已有节点。
  2. 新建行从未写入 `stepKey`（只有 `syncToTodos` 的 create 分支写），而节点用
     `normalizeTitle(title)` 作键 → 在 `newStep()` 里统一赋值。
  3. 全局 1200 节点上限按"丢弃最老节点"执行，而最老的恰好属于已完成的步 → 改为
     **公平淘汰**：从节点最多的那一步开始丢，单步永不被清空。
- **被拒审批不再标「需确认」（要求③）**：`foldApprovalDecided` 明确只在
  `outcome === "allowed-once"` 时删行（被拒仍待用户处理），但 `pendingConfirmSteps` 把任何
  `decided` 都当成已结束。已改为"asked 或 已决但未放行 都算未决"。同时在 `lib/index.js` 的
  状态修复函数里**补回 `outcome` 字段**——旧修复函数只拷 `state`，一次重启就把这个语义抹掉。
- **唯一流光与进度条（要求②）**：新增 `row.live`（store 侧唯一标记）并贯穿
  `.wf-prog-fill[data-live]`、`.wf-unit-link[data-live]`。只有唯一那一行的进度条滚动渐变、
  只有指向它的那一条连接线跑彩色流光；其余行即使状态是 running 也只是静态填充。
  未开始数字的 running 行不再用独立的 `wf-prog-slide` 滑块动画，改为同色系 30% 填充。

### Removed

- **实验性 composer 覆盖层（step-05）**：`wfUseTabCover` / `wfCoverOptIn` / 读写、
  `dsh-workflow-map:cover` 开关、`data-seat="tab"` 分流与整段覆盖 CSS 全部删除。它六轮实测都
  没成功（宿主把 composer 渲染在与面板不同分支，`transform/contain` 改写了包含块）；现状改为
  **如实保留**宿主原生输入框并用 `:has()` 在会话标签栏席位把它隐藏（切回对话页自动恢复）。
  删除面**不含** `conversation.view` 席位本身——那是会话标签栏入口。
- **「预计剩余时间」（step-06）**：按用户要求整体删除——进度条第二行现在只剩
  「N 分钟前估计」（`N` = 自数值落盘起的时长）。参考数据的宿主侧 `etaMs` / `etaMsFor`、
  快照 schema 校验、浏览器透传与渲染、词典键、CSS 全部移除；**Measure-timing** 断言全页
  不再存在 ETA 节点与「还剩」措辞。
- `tools/measure-tri.ps1` 退役至 `tools/retired/`：它量的步列展开三角随两列布局一并消失
  （现由 `measure-detail` / `measure-flow` 覆盖），详见该目录的 `README.md`。

### Tests
- 本版复跑（2026-10-27）实测：**离线 10 套 1505 条断言 + 浏览器量测 10 套 307 条**，共
  **23/23 套 exit 0**。逐套数字、命令与未核验项见 `evidence/session7-rerun.md`
  （离线：fold 184 / host 54 / orchestrator 140 / shape 138 / panel 470 / detail 119 /
  effects 166 / settings 43 / route 70 / steer 121；浏览器：panel 21 / timing 20 / inject 43 /
  dock 14 / flow 20 / effects 28 / branches 15 / detail 50 / settings 55 / main 41）。
- 真实日志只读回归：`check-real-injects` 折 145 个会话、**failures 0**；`audit-real`
  **AUDIT PASS**（四条硬约束）。

### Added (会话6 第二轮)

- **热注入「已撤销」状态**：新增折叠 `agent/inbox/discarded { message }`（宿主持久取消时发出），
  把热注入历史行从两态扩为三态：**已接下 / 待拾取 / 已撤销**。只有宿主真的发出该事件才会变
  “已撤销”，已接下的行永远不会被翻回。新增 3 条断言（discard→canceled、撤销后仍非 picked、
  已 picked 不被覆写）。
- `tools/audit-real.mjs`：真实日志只读审计（① 同步 ② 唯一 running ④ 注入），一条命令出结论。
- `docs/OPEN-SOURCE-GUIDE.md`：开源发布 + 手把手安装教程；已纳入 `files[]`。
- 断言总数：fold 145→**148**，shape 101→**104**，全套 **1329** 条。

### Notes

- 宿主半（`lib/index.js`、`src/fold.mjs`）改动**必须重启 DSH 进程**才生效；浏览器半
  （`src/client/*.js` → `client.js`）**F5 即生效**（profile 用 `link:` 软链）。
- 输入框（composer）在**所有**标签页下方保留，包括宿主自带的「对话」页——它由
  `conversation.content` 与 `conversation.view` **并列**渲染，不属于本插件。
- **本版需重启 DSH 一次**：宿主半同时改了 3 处（`lastEstimateAt` 估算时间戳、`/unsteer` 路由、
  删除 `etaMs`）。重启由用户选时机（会中断所有会话）。重启后可自查：`GET /dsh-workflow/state?sessionId=<id>`
  返回 200，且步行不再含 `etaMs`。
- **两个已定位、本版未修的外观/文案缺陷**（详细补做包见 `evidence/session7-rerun.md` §6）：
  - `OPEN-1`：品牌配色（`palette=brand`）的卡片外框规则仍指向会话4 之前的旧选择器
    （`.wf-step-item>.wf-step-card::after` / `.wf-node::after`），新的 `.wf-unit-card::after`
    还是彩虹渐变——功能不受影响，只是一档配色的差异少了外框。
  - `OPEN-2`：类型页副标题把 `{count}` 占位符原样印出（`RightPage.js` 只传了 `{step}`）。
- `publish` 与 `git push` 在本机**从未执行**；`evidence/session7-rerun.md` 的 §8 列明了全部
  未核验项。
