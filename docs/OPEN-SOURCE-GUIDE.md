# 发布指南

本文件面向**维护者**：如何把 `dsh-workflow-map` 发布到 GitHub 与 npm，以及改代码后该跑哪些检查。

> 命令里的 `<repo>` 指本仓库的本地路径，`<你的用户名>` 指 GitHub 用户名。

---

## 一、发布前的产物清单

仓库根目录应包含：

| 文件 | 作用 |
|---|---|
| `package.json` | 包元数据：`private: false`、`repository` / `homepage` / `bugs` / `keywords` / `engines` / `scripts` |
| `LICENSE` | MIT 全文 |
| `CHANGELOG.md` | Keep a Changelog 格式 |
| `README.md` | 面向使用者的说明 |
| `.gitignore` | 排除 `node_modules`、`*.bak*`、构建与测量产物 |
| `index.js` / `lib/` / `src/` | 宿主半与浏览器半源码 |
| `client.js` | 浏览器半生成物（`node tools/build-client.mjs` 产出，不手改） |
| `cordis.patch.yml` | 挂载声明 |
| `locale/` / `icon.svg` | 词典与图标 |
| `tools/` | 自测、探针、浏览器量测（**不随 npm 包发布**，进 Git） |

**发布前核对**：`package.json` 里 `repository.url`、`homepage`、`bugs.url` 三处必须指向真实的 GitHub 用户名与仓库名；
仓库改名或 fork 后要同步改这三处。

---

## 二、发布到 GitHub

> 下面的 `v0.3.0` 只是示例版本号；**当前版本见 `package.json`** 的 `version` 字段。

### 2.1 建仓库

在 <https://github.com/new> 建一个**空**仓库，仓库名与 `package.json` 的 `name` 一致。

⚠️ **不要**勾选 "Add a README / .gitignore / license"：本地已有，勾选会导致首次推送冲突。

### 2.2 初始化并推送

```bash
cd <repo>

git init
git add -A
git status                      # 确认没有 *.bak* / node_modules / 临时文件
git commit -m "feat: v0.3.0 初始发布"
git branch -M main
git remote add origin https://github.com/<你的用户名>/dsh-workflow-map.git
git push -u origin main
```

### 2.3 打标签

```bash
git tag -a v0.3.0 -m "v0.3.0"
git push origin v0.3.0
```

再到仓库页 **Releases → Draft a new release**，选中该 tag，把 `CHANGELOG.md` 里对应段落
粘进发布说明，发布。

### 2.4 建议补充的门面

发布后到仓库页右侧 **About** 齿轮里填：

- **Description**：一句话说明这是什么、解决什么问题；
- **Topics**：`deepseek-harness`、`dsh`、`cordis`、`plugin`、`workflow`、`progress`；
- 一份**截图**（静态界面截图 + 一段动效 GIF 更能体现差异化）。

---

## 三、发布到 npm

> 当前版本见 `package.json` 的 `version`；`pnpm pack --dry-run` 的版本行、`npm publish`
> 与 `git tag` 都以该值为准。

### 3.1 先自验包内容

```bash
pnpm pack --dry-run
```

必须满足：

- 第一行为 `package: dsh-workflow-map@<版本>`；
- 含 `client.js`、`lib/`、`src/`、`index.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、
  `README.md`、`CHANGELOG.md`、`LICENSE`、`docs/OPEN-SOURCE-GUIDE.md`、`docs/host-compatibility.md`；
- **不含** `tools/`、`evidence/`、`*.bak*` 与本地草稿。

`files[]` 是白名单：以**文件**（而非目录）列出，能避免整目录被连带发布。

### 3.2 发布

```bash
npm login
npm publish --access public
```

若报 **402**（包名被占用），把 `package.json` 的 `name` 改为 `@<你的用户名>/dsh-workflow-map`，
再执行一次 `npm publish --access public`。

### 3.3 检索

`keywords` 已含 `deepseek-harness` / `dsh` / `cordis` / `plugin` / `bundle` / `workflow` / `progress` / `ui`；
`description` 写明主要能力，这是搜索命中的主要文本。

---

## 四、安装方式（给使用者）

### 方式一：让 agent 安装

```
用 plugin_manager 安装 dsh-workflow-map，路径是 <插件的绝对路径>
```

只有返回 `applied` 才算生效。

### 方式二：命令行

```bash
cd "$HOME/.dsh/profiles/desktop"
pnpm add dsh-workflow-map
```

再把 `"dsh-workflow-map"` 追加到该目录 `package.json` 的 `dsh.profile.bundles` 数组末尾，重启 DSH。

### 方式三：本地源码

```bash
cd "$HOME/.dsh/profiles/desktop"
pnpm add "dsh-workflow-map@link:<repo>"
```

### 装完验证三步

```bash
# 1) 文件在位
ls "$HOME/.dsh/profiles/desktop/node_modules/dsh-workflow-map"

# 2) 宿主接口可用（期望 200 + JSON）
curl "http://127.0.0.1:<GUI端口>/dsh-workflow/state?sessionId=<会话ID>"

# 3) 界面上：左栏图标、会话标签栏入口、主内容区面板
```

---

## 五、改代码后的检查

```bash
# 改过 src/client/*.js 必须重新生成浏览器半
node tools/build-client.mjs

# 离线自测（10 套）
node tools/selftest-fold.mjs          # 折叠语义
node tools/selftest-host.mjs          # 注册、schema、投影接线
node tools/selftest-orchestrator.mjs  # PAE 计划读取与合并
node tools/selftest-shape.mjs         # 包骨架、配置、files 白名单
node tools/selftest-panel.mjs         # 渲染树、样式、交互
node tools/selftest-detail.mjs        # 节点/分步详情
node tools/selftest-effects.mjs       # 动画与减少动效
node tools/selftest-settings.mjs      # 设置与导出
node tools/probe-route.mjs            # 真实 HTTP 路由
node tools/probe-steer.mjs            # 注入 / 撤回通道
```

合计 **1533 条离线断言**。也可一条命令：

```bash
npm test
```

**真实日志只读回归**（不需要写权限）：

```bash
node tools/check-real-injects.mjs     # 批量折叠历史会话，报告注入/审批/失败数
node tools/audit-real.mjs             # 四条硬约束审计
```

**浏览器量测**（需要一份 Chromium；脚本会自动探测 Chrome / Edge）：

```bash
pwsh -File tools/measure-panel.ps1     # 单页地基
pwsh -File tools/measure-timing.ps1    # 进度条第二行与 ETA 缺席
pwsh -File tools/measure-inject.ps1    # 热注入常驻条 / 历史三态 / 撤回
pwsh -File tools/measure-dock.ps1      # 常驻注入条几何
pwsh -File tools/measure-flow.ps1      # 类型页调用清单与上限提示
pwsh -File tools/measure-effects.ps1   # 动画与减少动效
pwsh -File tools/measure-branches.ps1  # 卫星圆点与侧位上限
pwsh -File tools/measure-detail.ps1    # 节点 / 分步详情
pwsh -File tools/measure-settings.ps1  # 设置卡与导出
pwsh -File tools/measure-main.ps1      # 单页几何与交互
```

合计 **308 条浏览器量测**（0.3.4 起 `measure-main` 另含浅色/深色主题对比检查，数字以脚本实际输出为准）。

> `tools/retired/` 里是量「已移除界面」的历史脚本，**不属于验证链**，不期望通过。

---

## 六、四条硬约束

改完代码后，用真实日志自查这四项：

| # | 约束 | 判定方法 |
|---|---|---|
| ① | 地图分步 == 对话当前 todo 表 | 视图分步标题集合 ⊆ todo 表标题集合，且顺序一致 |
| ② | 有且只有一个分步处于「进行中」 | `steps.filter(s => s.status === 'running').length <= 1` |
| ③ | 需人工确认的分步打「需确认」 | `step.pendingConfirm.length > 0 \|\| plan.confirmations[planIndex]` |
| ④ | 热注入可用且可追溯 | `view.injects[]` 里 `pickedUp` 区分「已接下 / 待拾取」 |

一条命令：

```bash
node tools/audit-real.mjs
```

---

## 七、已知边界

1. **输入框（composer）不属于本插件。** 它由宿主在与面板并列的位置渲染，插件无法从自己这一侧移除它。
   会话标签栏席位用 `:has()` 规则让它在那一页收起，切回对话页自动恢复；这是样式层的处理，
   不改宿主结构。
2. **宿主半改动需要重启 DSH。** `lib/index.js`、`src/fold.mjs`、`src/route.js` 属 ESM 模块缓存，
   禁用/启用 bundle 或开新会话都不生效。
3. **每步节点有上限**：单步 300、全会话 1200。淘汰从节点最多的步开始，已完成步不会被清空；
   超出时界面会说明「另有 N 个节点宿主未发送」。
4. **`git push` 与 `npm publish` 需要账号凭据**，本指南只描述流程，不在 CI 中自动执行。

---

## 八、目录速查

```
dsh-workflow-map/
├─ index.js              包入口，再导出 lib/index.js
├─ lib/index.js          宿主半：会话投影 + 三条 HTTP 端点
├─ src/
│  ├─ fold.mjs           事件 → 状态 → 视图（纯函数）
│  ├─ orchestrator.mjs   只读 PAE 计划文件
│  ├─ route.js           /state · /steer · /unsteer
│  └─ client/            浏览器半源码（构建时内联）
├─ client.js             生成物，禁止手改
├─ cordis.patch.yml      挂载声明
├─ locale/{zh,en}.json   词典
├─ docs/                 发布指南与宿主兼容性核验
├─ tools/                自测 · 探针 · 浏览器量测
├─ CHANGELOG.md
├─ LICENSE (MIT)
└─ README.md
```
