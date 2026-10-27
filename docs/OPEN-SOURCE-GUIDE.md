# 开源发布与手把手教程

本文件回答两件事：**① 怎么把这个插件发布到 GitHub 与 DSH 社区；② 别人（以及换台电脑后的你）怎么从零装上并验证它。**
所有路径与命令都已在本机实测；标注【未核验】的地方是我没有实际执行过的步骤。

---

## 一、发布前的产物清单（已就绪）

`C:\Users\Administrator\Documents\dsh-plugins\dsh-workflow-map\` 下应有：

| 文件 | 作用 | 状态 |
|---|---|---|
| `package.json` | 包元数据；`private:false`、`repository`/`homepage`/`bugs`/`keywords`/`engines`/`scripts` 齐全 | ✅ |
| `LICENSE` | MIT 全文（此前只有 `license` 字段、没有文件） | ✅ 本次新增 |
| `CHANGELOG.md` | Keep a Changelog 格式，本版改动逐条留证 | ✅ 本次新增 |
| `.gitignore` | 排除 `*.bak`、`evidence/_tmp_*`、`node_modules` 等 | ✅ 本次新增 |
| `README.md` | 功能、架构、设计取舍 | ✅ 已有 |
| `index.js` / `lib/` / `src/` / `client.js` | 宿主半 + 浏览器半 + 生成物 | ✅ |
| `cordis.patch.yml` / `locale/` / `icon.svg` | bundle 补丁、词典、图标 | ✅ |
| `tools/` | 10 个自测/探针脚本（**不随 npm 包发布**，但应进 Git 仓库） | ✅ |

**发布前必改一处**：`package.json` 里的 `YOUR_GITHUB_USERNAME` 三处（`repository.url`、`homepage`、`bugs.url`）替换成你的 GitHub 用户名。

---

## 二、发布到 GitHub（手把手）

### 2.1 建仓库（网页操作，最省事）

1. 打开 <https://github.com/new>
2. **Repository name** 填 `dsh-workflow-map`
3. 可见性选 **Public**
4. **不要**勾选 "Add a README / .gitignore / license"（本地已有，勾了会冲突）
5. 点 **Create repository**

### 2.2 本地初始化并推送

在 PowerShell 里逐条执行（`你的用户名` 换成真实用户名）：

```powershell
cd C:\Users\Administrator\Documents\dsh-plugins\dsh-workflow-map

git init
git add -A
git status                      # 关键一步：确认没有 *.bak / node_modules / evidence/_tmp_*
git commit -m "feat: 会话标签栏入口 + 唯一流光收敛 + 严格 todo 同步 + 审批可撤销"
git branch -M main
git remote add origin https://github.com/你的用户名/dsh-workflow-map.git
git push -u origin main
```

> **为什么要先看 `git status`**：仓库里 `evidence/` 有 66 个历史截图/JSON，`client.js` 是 450 KB 生成物。
> 想瘦身就把 `evidence/` 也加进 `.gitignore`（我默认保留，因为它们是"这条结论从哪来"的证据）。

### 2.3 打 tag（可选但推荐）

```powershell
git tag -a v0.2.0 -m "v0.2.0 — 标签栏入口 / 唯一流光 / 严格同步 / 审批撤销"
git push origin v0.2.0
```

再在 GitHub 的 **Releases → Draft a new release** 里选中 `v0.2.0`，把 `CHANGELOG.md` 的 `[Unreleased]` 段粘进发布说明。

---

## 三、发布到 DSH 社区

DSH 插件生态走 npm 分发（`dsh bundle` 的 `patch` 字段由包内 `cordis.patch.yml` 提供）。

### 3.1 先做一次"能不能装"的本地验证

```powershell
cd C:\Users\Administrator\Documents\dsh-plugins\dsh-workflow-map
npm pack --dry-run
```

看输出里**必须**包含：`client.js`、`lib/`、`src/`、`index.js`、`cordis.patch.yml`、`package.json`、`LICENSE`、`CHANGELOG.md`、`icon.svg`。
如果少了，检查 `package.json` 的 `files` 数组。

### 3.2 发布

```powershell
npm login          # 首次需要，浏览器里授权
npm publish --access public
```

> `private` 已改为 `false`，可以正常 `publish`。若报 402，通常是包名被占用——把 `name` 改成 `@你的用户名/dsh-workflow-map`（scoped 包），并把 `package.json` 里的 `exports`/`files` 保持不变。

### 3.3 社区里怎么被检索到

- `keywords` 已包含 `deepseek-harness` / `dsh` / `cordis` / `plugin`，社区索引器按这些词抓。
- `description` 已写明「分步总览 / 工具类型 / 唯一流光进度条 / 热注入（steer）/ 「需确认」标注」，这就是搜索命中的主要文本（「预计剩余时间」已按用户要求在 0.3.0 删除，description 也已同步）。

---

## 四、别人怎么装上（手把手）

### 4.1 前置条件

- 已安装 **DeepSeek Harness**（Desktop 版或 CLI 均可）
- Node.js ≥ 20

### 4.2 三种安装方式，按场景选

#### 方式 A：从 npm 装（给普通用户）

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop"
pnpm add dsh-workflow-map
```

然后在该 profile 的 `package.json` 里，把 `dsh-workflow-map` 追加到 **`dsh.profile.bundles` 数组末尾**，
并确保 `cordis.patch.yml` 允许它（bundle 自带的 patch 已经写了 `id: workflow-map`）。

改完**重启 DSH 进程**（宿主半要重启才生效）。

#### 方式 B：从本地源码装（给开发/改代码的人）

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop"
pnpm add "dsh-workflow-map@link:C:/Users/你现在放代码的路径/dsh-workflow-map"
```

`link:` 会建符号链接，**改浏览器半只需 F5，改宿主半仍需重启**。

#### 方式 C：用 `plugin_manager`（推荐，免手改 JSON）

在 DSH 会话里让我调用：

```
plugin_manager action=install_bundle target=<插件的绝对路径>
```

它会自己写 profile 的 `package.json` 与 patch，并返回 `application` 字段——**只有返回 `applied` 才算真的生效**。

### 4.3 验证装好了（三步，缺一不可）

```powershell
# 1. 包在不在
Test-Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-workflow-map"

# 2. 宿主 HTTP 端点活不活（把 <会话ID> 换成任意一个真实会话）
Invoke-WebRequest "http://127.0.0.1:<GUI端口>/dsh-workflow/state?sessionId=<会话ID>" -UseBasicParsing
# 期望：200 + JSON，含 "steps"[] 与 "counts"

# 3. 页面里三个入口都在
```

界面上应能看到：
- 左栏菜单里有 **工作流地图**
- 顶部标签栏有 **工作流地图**（在「对话 / 上下文 / 编队」之后）
- 点任一入口，出现同一份面板

---

## 五、自测与回归（改代码之后必须跑）

```powershell
cd C:\Users\Administrator\Documents\dsh-plugins\dsh-workflow-map

node tools\build-client.mjs          # 改过 src/client/*.js 后必须跑（生成 client.js）

node tools\selftest-fold.mjs           # 184 条
node tools\selftest-host.mjs           #  54 条
node tools\selftest-orchestrator.mjs   # 140 条
node tools\selftest-shape.mjs          # 138 条
node tools\selftest-panel.mjs          # 470 条
node tools\selftest-detail.mjs         # 119 条
node tools\selftest-effects.mjs        # 166 条
node tools\selftest-settings.mjs       #  43 条
node tools\probe-route.mjs             #  70 条
node tools\probe-steer.mjs             # 121 条
```

合计 **1505** 条断言（上表 10 套；数字为 2026-10-27 全链复跑实测，逐套证据见 `evidence/session7-rerun.md`）。也可一条命令：

```powershell
npm test
```

**真实日志回归**（只读，不写 `.dsh`）：

```powershell
npm run test:real
```

它会折叠本机全部会话日志并报告：热注入条目、未决审批、折叠失败数。
2026-10-27 实测：折 145 个会话、含热注入行 10 个、含未决审批 1 个、failures 0；
另有一条四约束审计 `node tools\audit-real.mjs`（输出 AUDIT PASS）。

**浏览器量测系列**（本地无头 Chromium；本机无 Chrome，脚本会自动探测 Edge）：

```powershell
pwsh -File tools\measure-panel.ps1      # 21 条：单页地基（间距 / 进度轨 / 页头不动 / 内部滚动）
pwsh -File tools\measure-timing.ps1     # 20 条：第二行只剩「N 分钟前估计」，全页无 ETA 措辞
pwsh -File tools\measure-inject.ps1     # 43 条：热注入常驻条 / 历史三态 / 撤回 / 取消发送
pwsh -File tools\measure-dock.ps1       # 14 条：常驻注入条与右列几何
pwsh -File tools\measure-flow.ps1       # 20 条：类型页调用清单 + 上限诚实提示 + 陈旧键关页
pwsh -File tools\measure-effects.ps1    # 28 条：动画与减少动效（static → 0 个动画对象）
pwsh -File tools\measure-branches.ps1   # 15 条：卫星圆点 + 每侧 2 槽上限诚实提示
pwsh -File tools\measure-detail.ps1     # 50 条：右页节点/分步详情（等宽 / 剪贴板 / Esc）
pwsh -File tools\measure-settings.ps1   # 55 条：设置卡 + 根属性 + 导出 + 损坏降级
pwsh -File tools\measure-main.ps1       # 41 条：单页几何与交互（居中策略 / 窄窗）
```

合计 **307** 条浏览器量测（十套）。不想逐条粘的话：`pwsh -File tools\_scratch\chain-rerun.ps1`
会按顺序跑完整条链并写 `evidence\session7-rerun.raw.log`（_scratch 属开发工具，不随包发布）。

> `tools\retired\` 里是量「已移除 UI」的旧脚本（当前只有 `measure-tri.ps1`），**不属于验证链**，
> 也不期望通过——见该目录的 `README.md`。

---

## 六、四条硬约束（本版验收口径）

改完代码后，用真实日志自查这四项——本版已全部达标（135 个会话）：

| # | 约束 | 判定方法 | 本版结果 |
|---|---|---|---|
| ① | 地图分步 == 对话当前 todo 表 | 视图分步标题集合 ⊆ todo 表标题集合，且顺序一致 | **0 例不一致** |
| ② | 有且只有一个分步处于「进行中」 | `steps.filter(s => s.status === 'running').length <= 1` | **0 例多 running** |
| ③ | 需人工确认的分步打「需确认」 | `step.pendingConfirm.length > 0 \|\| plan.confirmations[planIndex]` | 审批/提问两路均已覆盖 |
| ④ | 热注入可用且可追溯 | `view.injects[]` 里 `pickedUp` 区分"已接下/待拾取" | 已实现 |

自查脚本（可直接粘）：

```powershell
# 把下面这个脚本存成 tools\audit-real.mjs 后再跑
# 它逐会话折叠真实日志并统计 ①② 的违例数
node tools\audit-real.mjs
```

---

## 七、已知边界（如实登记）

1. **输入框（composer）不是插件的**。它由宿主在 `conversation.content` 里与 `conversation.view` **并列**渲染，
   连宿主自带的「对话」标签页下方也有它。插件**不能**从自己这一侧彻底移除它。
   会话6 曾对**标签栏席位**做覆盖层（`data-seat="tab"` + 实测矩形定位），六轮实测均失败（`fixed` 的包含块被祖先
   `transform`/`contain` 改写，`absolute` 反推偏移会把面板自身推出可见区）；**该实验性覆盖层已在 step-05 整体删除**
   （`wfUseTabCover` / `wfCoverOptIn` / `dsh-workflow-map:cover` / `data-seat` / 覆盖 CSS 全部不存在）。
   现状：工作流页下方就是宿主原生 composer——**如实保留、可见且可用**，与「对话」标签页一致。
2. **宿主半改动必须重启 DSH**。`lib/index.js`、`src/fold.mjs` 属 ESM 模块缓存，禁/启 bundle、开新会话都不生效。
   重启会中断所有会话，请自行选时机。
3. **每步节点有上限**：单步 300、全局 1200。本版把全局淘汰从"丢最老"改成"从节点最多的步开始丢"，
   避免已完成步被清空；但超长会话里仍会出现「另有 N 个节点宿主未发送」。
4. **`npm publish` 与 GitHub 推送未在本机执行**【未核验】——上面命令按官方流程写，首次推送前请先 `git status` 核对。

---

## 八、目录速查

```
dsh-workflow-map/
├─ index.js                 包入口，re-export lib/index.js
├─ lib/index.js             宿主半：会话投影 + 两条 HTTP 路由
├─ src/
│  ├─ fold.mjs              事件 → 状态 → 视图（纯函数，全部单测在这里）
│  ├─ orchestrator.mjs      只读 PAE .pae/<sessionId>/orchestrator.json
│  ├─ route.js              GET /dsh-workflow/state · POST /dsh-workflow/steer
│  └─ client/               浏览器半源码（11 个 chunk，由 build 内联）
├─ client.js                生成物，禁止手改
├─ cordis.patch.yml         bundle 补丁（挂宿主行）
├─ locale/{zh,en}.json      插件元数据词典
├─ tools/                  10 个自测 + 1 个真实日志回归
├─ evidence/               历史截图与测量 JSON（结论的出处）
├─ CHANGELOG.md
├─ LICENSE (MIT)
└─ README.md
```
