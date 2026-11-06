# 宿主兼容性核验（DSH `0.2.1-rc.1` – `0.2.2-rc.1`）

要回答的问题：本插件声明的宿主范围，在 `0.2.1` 全系列（`rc.1` 至 `rc.5`）以及升级后的 `0.2.2-rc.1` 上是否真的有依据。

结论以 `package.json` 的 `engines.dsh` 为唯一声明口径。下文记录该口径的判据、核验方法与逐条证据，供使用者自行复核。

---

## 一、声明

```json
"engines": {
  "node": ">=20",
  "dsh": ">=0.2.1-rc.1 <0.3.0-0 || >=0.2.2-rc.1 <0.3.0-0"
}
```

区间含义：

区间含义（两段并集，2026-11-06 修订）：

- 第一段 `>=0.2.1-rc.1 <0.3.0-0`：覆盖 `0.2.1` 元组上的预发布与正式版。显式预发布标签使 npm / pnpm 默认判据能匹配 `0.2.1-rc.x`。
- 第二段 `>=0.2.2-rc.1 <0.3.0-0`：显式覆盖 `0.2.2` 元组的预发布链。DSH 自身闸门带 `includePrerelease`，旧的单段区间本已覆盖 `0.2.2-rc.1`；但 npm / pnpm 默认 engines 检查对跨元组预发布判为不匹配，故补这一段使两套判据都通过。
- 上界 `<0.3.0-0`：排除 `0.3.0` 及其预发布（`0.3.0-0` 是 `0.3.0` 预发布的最小值），即不声称兼容下一 minor。
- 已知边界：`0.2.3-rc.x` 及更高 `0.2.x` 元组的预发布，在 npm / pnpm 默认判据下仍不匹配（默认 semver 只允许与区间内比较符同元组的预发布参与匹配）；DSH 闸门不受影响。将来升到这些版本需再增一段并集。
本插件不使用 `dsh.host` 之类的自定义元数据字段：宿主包由 `peerDependencies` 声明（均为可选 peer），版本闸门由 `engines.dsh` 单独决定。

---

## 二、`engines.dsh` 由谁判定：两种判据

同一个区间字符串会被两套判据读取，结论不完全相同，声明必须同时满足两者。

### 2.1 DSH 自身的兼容性判定

`@deepseek-ai/dsh-app-boot` 的 `evaluatePluginCompatibility()` 是安装与启用期的判定入口：

```js
// @deepseek-ai/dsh-app-boot  lib/index.js:252-284（节选，省略参数校验与回落分支的具体实现）
function satisfies(runtimeVersion, range) {
  return range.trim() !== "" && semver.satisfies(runtimeVersion, range, { includePrerelease: true });
}
function unmetRequirements(fields, runtimeVersion) {
  const engines = Object.hasOwn(fields, "engines") ? objectOf$1(fields.engines, "Plugin manifest engines") : {};
  if (Object.hasOwn(engines, "dsh")) {
    const range = engines.dsh;
    if (typeof range !== "string") throw new Error("Plugin manifest engines.dsh must be a string");
    return satisfies(runtimeVersion, range) ? {} : { "engines.dsh": range };
  }
  // 没有 engines.dsh 时，回落到逐个 @deepseek-ai/dsh / @deepseek-ai/dsh-* peer 的 range 判定
}
```

`@deepseek-ai/dsh-plugin-manager` 在三个位置调用它，未满足即抛 `incompatible-version`：

| 位置 | 场景 |
|---|---|
| `lib/types/index.js:368` | 列出 bundle 时逐个核对 |
| `lib/types/index.js:660` | 安装（`add`）前核对 |
| `lib/types/index.js:857` | 启用（`enable`）前核对 |

同一包对外的 `requirements` 字段说明也把键名写死为 `engines.dsh`（`lib/typert.host.js:59`）：

> "Only the requirements the running version does not satisfy, keyed `engines.dsh` or by DSH peer package name."

### 2.2 npm / pnpm 自身的 engines 检查

npm 与 pnpm 用不带 `includePrerelease` 的默认 semver 语义检查 `engines`。

### 2.3 两者对各候选区间的判定（内核自带 semver，2026-11-06 实测）
| 运行时版本 | 旧单段 `>=0.2.1-rc.1 <0.3.0-0`（npm 默认） | 旧单段（DSH 闸门） | **现行并集**（npm 默认） | **现行并集**（DSH 闸门） |
|---|---|---|---|---|
| `0.2.1-rc.1` | 通过 | 通过 | 通过 | 通过 |
| `0.2.1-rc.5` | 通过 | 通过 | 通过 | 通过 |
| `0.2.1` | 通过 | 通过 | 通过 | 通过 |
| `0.2.2-rc.1` | **不通过** | 通过 | **通过** | 通过 |
| `0.2.2-rc.2` | **不通过** | 通过 | **通过** | 通过 |
| `0.2.2` | 通过 | 通过 | 通过 | 通过 |
| `0.2.3-rc.1` | 不通过 | 通过 | 不通过 | 通过 |
| `0.3.0-0` | 不通过 | 不通过 | 不通过 | 不通过 |
| `0.3.0` | 不通过 | 不通过 | 不通过 | 不通过 |

现行并集 = `>=0.2.1-rc.1 <0.3.0-0 || >=0.2.2-rc.1 <0.3.0-0`。

由此得到两个写法上的硬要求：

1. **每一段起点必须落在目标元组上。** 默认 semver 只允许「与区间内某个比较符同元组」的预发布版本参与匹配；单段 `>=0.2.1-rc.1 <0.3.0-0` 的 npm 默认判据因此静默排除 `0.2.2-rc.x`。写成 `>=0.1.0-rc.1` 同理会排除全部 `0.2.1` 预发布。补第二段 `>=0.2.2-rc.1` 即修好 `0.2.2` 线。
2. **上界取 `<0.3.0-0`。** 写成 `<0.3.0` 会在 DSH 闸门（`includePrerelease`）下把 `0.3.0-rc.x` 也算作通过，与「不声称兼容下一 minor」冲突。

DSH 闸门带 `includePrerelease`，因此 `0.2.x` 后续元组的预发布也会通过；并集里各段是为了兼顾 **npm / pnpm 默认 engines 判据**。上界始终 `<0.3.0-0`，整条 `0.3` 线不在声明内。

---

## 三、逐版本核验表

| 版本 | 取样方式 | 结论 |
|---|---|---|
| `0.2.1-rc.1` | npm 闭包元数据（206 包）+ 9 个契约点的逐文件 SHA / 锚点窗口 | 契约面与 `rc.5` 一致；闭包比 `rc.3` 少 3 个包（见 §4.3） |
| `0.2.1-rc.2` | 同上 | 同上 |
| `0.2.1-rc.3` | 同上 + 隔离实机运行（插件加载、面板注入、视图路由） | 基线版本 |
| `0.2.1-rc.4` | npm 闭包元数据 + 5 个变动包逐文件 SHA + 契约锚点窗口 | 契约面无变化 |
| `0.2.1-rc.5` | npm 闭包元数据 + 逐文件比对 + **隔离 `DSH_HOME` 实机运行**（`--dump-config` 解析、web 宿主启动、`/dsh-workflow/*` 三种端点实测，见 §3.1） | 契约面无变化，且宿主半在 `rc.5` 上实机应答 |
| `0.2.2-rc.1` | **升级后本机内核实机核验**：启用态 / 豁免表、宿主半 ESM 链接、九个契约点、活体 `workflowView` 投影写入（见 §3.2） | 适配；加载期无硬失败，无需改源码 |

`rc.4` 的结论来自与 `rc.3` 的逐文件比对，不是实机运行结论（见 §8）。`rc.5` 已补做隔离实机运行，`0.2.2-rc.1` 已补做升级后活体核验，记录见下两节。

### 3.1 `rc.5` 隔离实机运行记录（2026-10-30）

核验环境的内核是 `rc.3`，因此不改动既有环境：在 `<临时目录>\wfmap-rc5-run\` 另起一套 `npm i @deepseek-ai/dsh@0.2.1-rc.5`，`DSH_HOME=<临时目录>\wfmap-rc5-run\home`（隔离），新 profile `wfmap5` 的 `dsh.profile.bundles` = `dsh-base` + `dsh-web-app` + `dsh-workflow-map`（后者以 `link:` 指向本仓库的工作副本，未改动源文件）。全程不写 `~/.dsh`、不改动任何既有 profile。

**A 级：`rc.5` 的 loader 解析本插件 manifest 与 patch，通过**

```text
node <run>\node_modules\@deepseek-ai\dsh\lib\bin.js --profile wfmap5 --dump-config
# 退出码 0；stdout 1234 行；stderr 0 行
# 末尾三行即本插件层：
#   # == dsh-workflow-map
#   - id: workflow-map
#     name: dsh-workflow-map
# stdout 全文无 unknown / invalid / unresolved / warn / error 类告警
```

**B 级：在 `rc.5` 宿主上路由实机应答，通过**

同一套 `rc.5` 起 web 宿主（`--profile wfmap5 --port <port> --no-open --host 127.0.0.1`），逐端点实测（响应头均为 `content-type: application/json; charset=utf-8`，与 `src/route.js` 的契约一致）：

| 请求 | 状态 | 响应体（原文） | 说明 |
|---|---|---|---|
| `GET /dsh-workflow/state?sessionId=none` | `404` | `{"ok":false,"error":"unknown session"}` | 前缀路由已挂上；`sessions` 服务在 `rc.5` 上可用（否则会是 503） |
| `GET /dsh-workflow/state`（无 `sessionId`） | `400` | `{"ok":false,"error":"sessionId is required"}` | 参数校验分支 |
| `POST /dsh-workflow/steer` | `404` | `{"ok":false,"error":"unknown session"}` | 热注入通道已挂上 |
| `POST /dsh-workflow/unsteer` | `404` | `{"ok":false,"error":"unknown session"}` | 撤回通道已挂上 |
| `GET /dsh-workflow/nope` | `404` | `{"ok":false,"error":"not found","path":"/dsh-workflow/state \| /dsh-workflow/steer \| /dsh-workflow/unsteer"}` | 前缀内部路由表，证明命中的是本插件的 handler，而非宿主兜底 404 |

对照：同一宿主上 `GET /` 返回 `401 dsh web authentication required; reopen the URL printed by dsh web.`（`dsh-client-connection` 的页面鉴权闸门，`lib/index.js:576`），属宿主行为，不影响插件路由。

**两个会把人带偏的坑（实测）**

1. **系统代理会把 `127.0.0.1` 也拦走。** 代理配置的 `ProxyOverride` 不含 `localhost`/`127.0.0.1` 时，`Invoke-WebRequest http://127.0.0.1:<port>/...` 会返回 **404 且空体**，看着像「插件没挂」。改用裸 socket 或 `-NoProxy` 后立即看到 `401`（页面）与本插件的 JSON（路由）。**结论：HTTP 404 不能单独作为「路由未注册」的证据。**
2. **`--profile <name>` 后面不能再跟 `web`。** `dsh --profile wfmap5 web` 报 `too many arguments. Expected 0 arguments but got 1: web`（`web` 是 profile 名，不是子命令）；正确写法是 `dsh --profile wfmap5 --port <port> --no-open --host 127.0.0.1`。

**复跑命令**（升级到 `rc.5` 后任选一个临时目录执行，不改动既有环境；`<port>` 任选一个空闲端口）：

```powershell
$run="$env:TEMP\wfmap-rc5-run"; $env:DSH_HOME="$run\home"
node "$run\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile wfmap5 --port <port> --no-open --host 127.0.0.1
# 另开窗口（-NoProxy 是关键，否则会被系统代理拦成假 404）：
Invoke-WebRequest 'http://127.0.0.1:<port>/dsh-workflow/state?sessionId=none' -SkipHttpErrorCheck -NoProxy
# 期望：404 + {"ok":false,"error":"unknown session"}
```

### 3.2 `0.2.2-rc.1` 升级后活体核验记录（2026-11-06）

背景：DSH 于 2026-11-04 17:30 更新安装目录，asar 内 331 个 `@deepseek-ai/*` 包全部为
`0.2.2-rc.1`（`@deepseek-ai/dsh-desktop-runtime@0.2.2-rc.1`、`cordis@4.1.0`）。本轮不改既有环境，
直接在**正在运行的本机内核**上做只读探针 + 活体状态检查，不动 `~/.dsh` 以外的任何配置。

**A 级：声明闸门**

- `dsh-app-boot/lib/index.js` 内 `satisfies()` 仍是
  `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`；`evaluatePluginCompatibility()`
  读 `engines.dsh` 的路径未变。
- 用内核自带 `semver` 实测：旧单段区间对 `0.2.2-rc.1` 为 npm 默认 `false` / DSH 闸门 `true`；
  现行并集为 `true` / `true`。`0.3.0-0`、`0.3.0` 在两套判据下均被排除。
- `plugin_manager list_version_exemptions` 返回 `runtimeVersion: "0.2.2-rc.1"`, `exemptions: {}`；
  `list_bundles` 中 `dsh-workflow-map@1.0.0` 为 `enabled: true, installed: true`，
  row `workflow-map` 在位 —— 无 `incompatible-version` 拦截、无需豁免。

**B 级：加载链**

宿主半 `lib/index.js` 顶层只 import `../src/fold.mjs`、`../src/orchestrator.mjs`、
`../src/route.js` 与 `node:crypto`，**不静态 import 任何 `@deepseek-ai/*` 包**（宿主服务靠 cordis
`inject` 字符串在运行时解析）。照抄该加载链用 `ELECTRON_RUN_AS_NODE` 对内核实件做 ESM 链接：

```text
LINK host-half OK  exports=PROJECTION_KEY,apply,default,inject,makeSteerSource,makeUnsteerSource,name,packageName,routeInfo,selfCheck
  name=workflow-map  packageName=dsh-workflow-map  inject=["sessionProjections","sessions","webServer","agents"]
LINK peer dsh-agent-loop OK / LINK peer dsh-llm OK / LINK control dsh-tools OK
```

⇒ 无 `SyntaxError: does not provide an export named …`；与 `dsh-mall` 那种「加载链静态 import
被移除的导出」的硬不兼容不是同一性质。

**C 级：九个契约点**

新内核实件逐项扫描（命中数即出现次数）：

| 契约点 | 提供方 | 命中 |
|---|---|---|
| `sidebar.panellist` 槽 | `dsh-client-ui-sidebar/lib/client.js` | 9 |
| `conversation.view` 槽 | `dsh-client-ui-conversation/lib/client.js` | 4 |
| `data-composer-seat` / `data-conversation-content` / `data-conversation-scroll` | 同上 | 1 / 1 / 3 |
| `DefaultConversationViews` | 同上 | 3 |
| `sessionProjections` / `sessions` / `webServer` / `agents` | 宿主半四个服务包 | 9 / 8 / 2 / 23 |

`list_bundles` 里 `session-projection`、`session`、`agent-loop`、`webserver`、`tools` 等
均为 `enabled: true, fiberPhase: active`。

**D 级：活体投影**

当前会话（`session-3ca619ce-…`，即本轮请求）的投影缓存
`~/.dsh/storages/session_projcache/sessions/<id>.json` 内 `workflowView` 段落
`ver: 6, seq: 17, stateVersion: 6`，`task` 文本就是本轮请求正文 ⇒ 宿主半正在新内核上
持续折叠本会话事件并发布 wire view，不是「能加载但功能已哑」。

**结论**：**适配**。本次只做声明层同步（`engines.dsh` / `peerDependencies` / `keywords` 与文档），
不改源码、不发 npm 新版本、不推送远端、不打 tag / Release。

**未覆盖**：未跑「完整回合的端到端画布渲染」，也未做 `0.2.2` 正式版与 `0.3.x` 的核验。

---

## 四、闭包级别比对

### 4.1 方法

以 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app` 的依赖并集为闭包，共 **206 个包名**。对每个包从 npm registry 取 `dist.unpackedSize` 与 `dist.fileCount`，逐版本比较；任一版本组合不同即进入人工取证。

用 registry 元数据做初筛、再用逐文件 SHA-256 取证，是因为元数据能覆盖全部 206 个包，而逐文件下载只对筛出的少数包做。

### 4.2 差异分布

206 个包中有 **24 个**在 `rc.1`–`rc.5` 之间存在差异，全部集中在三段边界上：

| 变化边界 | 包数 | 包 |
|---|---|---|
| `rc.1 → rc.2` | 5 | `dsh-web`、`dsh-web-search-deepseek`、`dsh-web-deepseek-api`、`dsh-client-ui-deepseek-model-label-1017`、`dsh-client-ui-settings-web-search` |
| `rc.1 → rc.2` 且 `rc.2 → rc.3` | 1 | `dsh-agent-preset` |
| `rc.2 → rc.3` | 13 | `dsh-llm-deepseek-api-key`、`dsh-api-session-controller`、`dsh-api-remotes`、`dsh-client-ui-entry-customization`、`dsh-client-ui-plugin-manager`、`dsh-client-ui-settings-general`、`dsh-client-ui-agent-preset`、`dsh-client-ui-sidebar-right`、`dsh-client-ui-workspace`、`dsh-client-ui-sidebar`、`dsh-tool-cordis`、`dsh-web-frontend`、`dsh-client-product-analytics` |
| `rc.2 → rc.3` 且 `rc.3 → rc.4` | 2 | `dsh-llm-deepseek-account`、`dsh-client-ui-conversation` |
| `rc.3 → rc.4` | 1 | `dsh-mcp-resources` |
| `rc.4 → rc.5` | 1 | `dsh-client-ui-chat` |
| 三个边界都有 | 1 | `dsh-cordis-client-runner` |

其中 `dsh-client-ui-sidebar` 与 `dsh-client-ui-conversation` 属于本插件的契约面，其锚点级比对见 §5。

### 4.3 版本缺席

| 包 | 缺席版本 | 说明 |
|---|---|---|
| `dsh-web-deepseek-api` | `rc.1` | 首次发布于 `rc.2` |
| `dsh-client-ui-deepseek-model-label-1017` | `rc.1` | 首次发布于 `rc.2` |
| `dsh-client-ui-entry-customization` | `rc.1`、`rc.2` | 首次发布于 `rc.3` |
| `cordis-plugin-timer`、`schemastery` | 全部 | 第三方依赖，不随 DSH 的 `rc` 编号发布 |

`rc.1` 的 profile 因此比 `rc.3` 少 3 个客户端包。这 3 个包都与本插件的契约面无关（模型标签角标、入口定制、API 通道包），缺失不影响本插件加载。

### 4.4 `rc.3 → rc.5` 之间真正改动的 5 个包

| 包 | `rc.3` | `rc.4` | `rc.5` | 改动文件 | 是否触及本插件契约 |
|---|---|---|---|---|---|
| `dsh-llm-deepseek-account` | 35661 B / 10 | 35735 B / 10 | 35735 B / 10 | `lib/index.js`、三个 README、`package.json` | 否：`lib/index.js` 只改 1 行，日志级别 `console.info` → `console.error` |
| `dsh-mcp-resources` | 30771 B / 11 | 30844 B / 11 | 30844 B / 11 | 三个 README、`package.json` | 否：无代码改动 |
| `dsh-client-ui-chat` | 857882 B / 106 | 同 `rc.3` | 859933 B / 107 | `lib/client.js`、3 个 `*.d.ts`、新增 `reasoning-text.d.ts`、README、`package.json` | 否：改动集中在推理正文渲染（新增 `conversation.chat.reasoning.content` 槽、`ReasoningBodyOwnerProps.text` 拆成 `rawText` + 显示文本） |
| `dsh-client-ui-conversation` | 1130507 B / 89 | 1131117 B / 89 | 同 `rc.4` | `lib/client.js`、`locales.d.ts`、README、`package.json` | 否：92 个 bundle 分区中仅 `locales.js` 与 `skeleton/ConversationSession.js` 变化 |
| `dsh-cordis-client-runner` | 483933 B / 20 | 同 `rc.3` | 484021 B / 20 | `lib/client.js`、`package.json` | 否：12 行变化全部是槽文档文本与 `sources` 源行号（`slots.ts:441` → `:447`） |

`dsh-client-ui-conversation` 的改动按 bundle 内 `//#region` 分区逐一比对：`lib/types/client/locales.js`（词条增删）与 `lib/types/client/skeleton/ConversationSession.js`（输入框手势与文件选择绑定重构）。本插件依赖的槽注册、DOM 属性都不在这两个分区内。

---

## 五、契约面逐项核对

本插件只依赖九个契约点。下表每个点都给出提供方、用法与 `rc.1` ↔ `rc.5` 的比对证据。

| 契约点 | 提供方 | 本插件用法 | `rc.1` ↔ `rc.5` 证据 | 结论 |
|---|---|---|---|---|
| `sidebar.panellist` 槽 | `dsh-client-ui-sidebar` | 注册左栏面板项（`kind: 'list'`） | 槽声明在 `rc.1` 与 `rc.3` 逐字节相同：`kind: 'list'; scope: 'root'; owner: SidebarPanelIconOwnerProps` | 未变 |
| `main` 槽 | `dsh-client-ui-layout` | 注册主内容面板（`kind: 'keyed'`） | 整包除 `package.json` 外逐文件 SHA-256 相同（`lib/client.js` = `686fb83c91c8ff8d…`） | 未变 |
| `conversation.view` 槽 | `dsh-client-ui-conversation` | 注册会话标签栏视图 | 4 处锚点窗口（`DefaultConversationViews` 的 `renderSlot`、`apply.js` 的 `entries` / `subscribe` / `children`）在 `rc.1`/`rc.3`/`rc.4`/`rc.5` 逐字节相同 | 未变 |
| 输入框座位 DOM | `dsh-client-ui-conversation` | 选中本插件视图时隐藏输入框 | `data-composer-seat`（1 处）、`data-conversation-content`（1 处）、`data-conversation-scroll`（3 处）的上下文窗口逐字节相同 | 未变 |
| `sessionProjections` 服务 | `dsh-session-projection` | 注册会话投影 | `lib/index.js` SHA-256 `7dc2b212819baf4f…` 相同 | 未变 |
| `sessions` 服务 | `dsh-session` | 按会话号取会话 | `lib/index.js` SHA-256 `2f5dd07cb5c744a2…` 相同 | 未变 |
| `webServer` 服务 | `dsh-host-webserver` | 注册面板数据路由 | `lib/index.js` SHA-256 `08907285802f0edd…` 相同 | 未变 |
| `agents` 服务 | `dsh-agent-loop` | 读运行中的 agent 状态 | `lib/index.js` SHA-256 `cf57e3ecd487ac5c…` 相同 | 未变 |
| 会话事件 / JSONL 格式 | `dsh-session-persistence-jsonl` | 折叠会话事件为步骤序列 | `lib/worker.cjs` SHA-256 `4b0f235e772792d7…` 相同 | 未变 |

输入框座位的实测嵌套（`dsh-client-ui-conversation` `rc.5` 的 `lib/client.js`）：

```text
div[data-conversation-content]
└─ div[data-conversation-scroll]
   ├─ Views            ← 选中的 conversation.view 占据位
   └─ div[data-composer-seat]
```

本插件依赖的 DOM 只有这一条父子链与两个 `data-*` 属性，不依赖 class 名或内部组件。

§4.2 表里其余 22 个变动包与本插件的九个契约点没有交集：不注册 `conversation.chat.*` 系列槽、不读设置页组件、不调用搜索工具、不依赖 API 网关包。

---

## 六、安装闸门生效性

结论：`engines.dsh` 不是装饰性字段，安装与启用期都会被读取。

| 环节 | 证据 |
|---|---|
| 判定实现 | `dsh-app-boot` 的 `evaluatePluginCompatibility()` → `unmetRequirements()`（§2.1 引文） |
| 判定实现版本一致 | `dsh-app-boot` `0.2.1-rc.1` 与 `0.2.1-rc.5` 除 `package.json` 外逐文件 SHA-256 相同（`lib/index.js` = `5135179ac810e4f6…`）；`0.2.2-rc.1` 上 `satisfies()` 仍为 `semver.satisfies(runtimeVersion, range, {includePrerelease: true})`（2026-11-06 读 asar 内实件确认） |
| 安装期调用 | `dsh-plugin-manager` 三处调用（§2.1 表），未满足抛 `incompatible-version`，并在 `requirements` 里给出 `engines.dsh` 键 |
| 调用方版本一致 | `dsh-plugin-manager` `rc.3` 与 `rc.5` 除 `package.json` 外逐文件 SHA-256 相同 |

由此可推出两条可验证的后果：

1. 在 `0.2.1-rc.1`–`0.2.1-rc.5` 以及 `0.2.2-rc.1` 内核上安装或启用，本插件的现行 `engines.dsh` 判定通过，不会有 `incompatible-version`；`0.2.2-rc.1` 已实测 `enabled:true`、`exemptions:{}`。
2. 在 `0.3.0` 及以后的内核上，`engines.dsh` 判定不通过（§2.3），安装或启用会被上述任一调用点拦下并给出明确的 `engines.dsh: ">=0.2.1-rc.1 <0.3.0-0 || >=0.2.2-rc.1 <0.3.0-0"` 说明。这属于预期行为：不兼容时应显式失败，而不是勉强加载。

---

## 七、可复跑命令
以下命令只需 Node.js 20 以上。前两条只需 npm registry 访问；第三条需要环境里能解析到 `semver`（`npm i semver`，或使用 DSH 安装目录自带的副本）。

**1) 闭包元数据对比（206 包 × 5 个版本）**

```bash
node -e '
const { readFileSync } = require("node:fs");
const names = readFileSync("closure-names.txt", "utf8").split(/\r?\n/).filter(Boolean);
const V = ["0.2.1-rc.1","0.2.1-rc.2","0.2.1-rc.3","0.2.1-rc.4","0.2.1-rc.5"];
let i = 0; const rows = [];
(async () => {
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < names.length) {
      const name = names[i++];
      const p = await (await fetch("https://registry.npmjs.org/" + name.replace("/", "%2f"))).json();
      const pick = (v) => { const d = p.versions?.[v]?.dist; return d ? [d.unpackedSize, d.fileCount] : null; };
      const row = V.map((v) => JSON.stringify(pick(v)));
      if (new Set(row).size > 1) rows.push({ name, row });
    }
  }));
  console.log(rows.length, JSON.stringify(rows, null, 1));
})();
'
```

`closure-names.txt` 是 `dsh-base` 与 `dsh-web-app` 依赖并集的包名清单（每行一个）。换用别的清单会得到别的闭包，比较结果随之变化。

**2) 单包逐文件 SHA-256 比对**

```bash
# 取两个版本的 tarball，解包后逐文件比对
npm pack @deepseek-ai/dsh-session-projection@0.2.1-rc.1
npm pack @deepseek-ai/dsh-session-projection@0.2.1-rc.5
tar -xzf deepseek-ai-dsh-session-projection-0.2.1-rc.1.tgz -C rc1
tar -xzf deepseek-ai-dsh-session-projection-0.2.1-rc.5.tgz -C rc5
diff -r rc1/package rc5/package   # 期望：仅 package.json 不同
```

**3) 区间判定矩阵（含现行并集）**

```bash
node -e '
const semver = require("semver");
const ranges = [
  ">=0.2.1-rc.1 <0.3.0-0",                                    // 旧单段
  ">=0.2.1-rc.1 <0.3.0-0 || >=0.2.2-rc.1 <0.3.0-0"     // 现行并集
];
const versions = ["0.2.1-rc.1","0.2.1-rc.5","0.2.1","0.2.2-rc.1","0.2.2-rc.2","0.2.2","0.2.3-rc.1","0.3.0-0","0.3.0"];
for (const r of ranges) {
  console.log("== " + r + " ==");
  for (const v of versions) console.log("  " + v.padEnd(14) + " npmDefault=" + semver.satisfies(v, r) + "  dshGate=" + semver.satisfies(v, r, { includePrerelease: true }));
}
'
```

复跑要点：`0.2.2-rc.1` 在旧单段下 `npmDefault=false / dshGate=true`，在现行并集下两者皆 `true`；`0.3.0-0` 与 `0.3.0` 在两套判据下皆为 `false`。

---

## 八、限制声明

- **动态核验范围**：截至 2026-11-06，`0.2.1-rc.3` 是实机运行过的版本；`0.2.1-rc.5` 已在隔离 `DSH_HOME` 的临时区实机启动并实测路由应答（§3.1），但不覆盖「真实会话内的投影内容」；`0.2.2-rc.1` 在升级后的本机内核上做了活体核验（§3.2），含当前会话的 `workflowView` 投影写入，但**未跑完整回合的端到端画布渲染**。`0.2.1-rc.4` 仍只做了静态比对，未实机启动。
- **比对对象**：只比对 npm 上已发布的产物，不覆盖未发布的仓库提交。
- **闭包口径**：206 个包名按 `dsh-base` 与 `dsh-web-app` 的依赖并集确定；更换清单会改变闭包边界。
- **第三方依赖**：闭包内含 `cordis`、`schemastery`、`zod` 等第三方包，它们不随 DSH 的 `rc` 编号发布，这里不对其版本承诺做任何声明。
- **上界外版本**：`0.3.0` 及以后未做任何核验，声明上也不覆盖。
- **npm / pnpm 默认判据的残余边界**：`0.2.3-rc.x` 及以上 `0.2.x` 元组预发布在默认判据下仍不匹配；DSH 闸门通过。若将来升级到这些版本，需再增并集段。
- **本次为声明层改动**：只改 `engines.dsh` / `peerDependencies` / `keywords` 与文档，未改源码、未发 npm 新版本、未推送远端、未打 tag / Release。

---

## 九、复核记录

| 项 | 取值 |
|---|---|
| 复核日期 | 2026-10-30（`0.2.1` 线）＋ 2026-11-06（`0.2.2-rc.1` 实机核验与声明修订） |
| 数据来源 | `registry.npmjs.org` 发布产物 |
| semver 实现 | 7.8.5（`0.2.1` 线矩阵）；`0.2.2-rc.1` 矩阵用升级后内核自带 `semver`（`satisfies`，分别带与不带 `includePrerelease`） |
| 闭包规模 | 206 个包名，24 个存在版本间差异 |
| 逐文件比对包 | `dsh-app-boot`、`dsh-session`、`dsh-session-projection`、`dsh-host-webserver`、`dsh-agent-loop`、`dsh-session-persistence-jsonl`、`dsh-plugin-manager`、`dsh-client-ui-layout`、`dsh-client-ui-sidebar`、`dsh-client-ui-conversation`、`dsh-client-ui-chat`、`dsh-cordis-client-runner`、`dsh-llm-deepseek-account`、`dsh-mcp-resources` |
| 实机运行内核 | `0.2.1-rc.3`（基线运行内核）；`0.2.1-rc.5`（隔离 `DSH_HOME` 临时区，仅路由与 loader 层）；`0.2.2-rc.1`（升级后本机内核，活体：启用态 / ESM 链接 / 契约点 / 投影写入） |