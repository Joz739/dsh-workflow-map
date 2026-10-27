# dsh-workflow-map

**给 DeepSeek Harness 加一张「活的」工作流地图。**

侧边栏图标、会话标签页、主内容区——三个入口，同一张面板。它把当前会话拆成一颗颗**分步**，每一步的进度、调了哪些工具、动了哪些文件、产出什么报告，全部摊在一页上看完。运行中的那一步会有流光、有呼吸点，像心跳一样告诉你 agent 还在干活。

![license](https://img.shields.io/badge/license-MIT-blue)
![platform](https://img.shields.io/badge/platform-DeepSeek%20Harness-brightgreen)
![node](https://img.shields.io/badge/node-%E2%89%A520-informational)
![version](https://img.shields.io/badge/version-0.3.0-success)

---

## 为什么需要它

DeepSeek Harness 跑长任务时会刷出成百上千条消息。想回答「现在到哪一步了 / 它在干什么 / 还有多久」这三个问题，
原本只能往上翻聊天记录。这个插件把答案变成一屏：

| 你原本要做的 | 现在 |
|---|---|
| 翻日志数第几步 | 一条**串行主流程**，每步一张卡 |
| 猜它现在在跑什么 | 运行中的卡有**彩色流光外框 + 呼吸点** |
| 找「刚才改了哪个文件」 | 点卡片 → 右页列出该步的**工具/文件类型清单** |
| 想知道「它到底写了什么代码」 | 点某一次调用 → 展开**参数全文 + 结果 + 错误** |
| 等它跑完才能补一句要求 | **热注入**：不用等，随时插一句话进去 |

---

## 五个亮点

### 1. 热注入：中途改主意，不用打断它

会话正在跑的时候，直接告诉它「顺便把单元测试也补上」。这句话会进入**下一步**的执行队列，
**不打断当前轮次**，也不丢上下文。

- 入口在页头，是醒目的品牌色按钮，不需要先展开任何面板；
- 右页还有一条**常驻输入条**，敲回车就发；
- 发出去的每一条都留档，状态分三种：**待拾取 / 已接下 / 已撤销**——
  「HTTP 200」不等于「它已经看到了」，这个区别只有这插件给你分清。

### 2. 后悔药：发错了可以撤回

热注入的历史行旁边有个**撤回**按钮。只要会话还没取走那条消息，点一下就能把它抽回来。

这是整条链路里最难做对的部分：撤回后**刷新页面，状态依然正确**——
因为它不靠插件自己记状态，而是把宿主的收件箱变动**重放**一遍。已经取走的消息撤不回来，
按钮会直接告诉你为什么（宿主原话回显，不吞错）。

### 3. 进度条：数字从哪来，写得明明白白

每张卡下面有一根 6 px 轨道，和一行小字：

```
~62% 估算 · 3 分钟前估计
```

关键在**诚实**：

- 模型自报一个数 → 标 `自报`；
- 待办清单里 10 项完成 6 项 → 用它算，封顶 99%（没做完就不说 100%）；
- 都没有 → 拿「本会话已完步的耗时中位数」推，封顶 90%；
- **已结束的步**才固定 100%。

还会额外标一行「**N 分钟前估计**」——告诉你这个数字有多旧。旧数字也是信息，
但**不给你一个假装新鲜的假数字**。想调深度就在设置里切「只看标题」，第二行整段消失。

### 4. 一页看完，不玩嵌套

一条向下的主线，每步一张卡；卡的两侧伸出**圆形的工具/文件类型接口**，直线连过去。
点圆点 → 右页打开「这一类调用」；点卡片 → 右页打开「这一步的记录」。两个方向都用同一套面板，
不会越点越深、也不会丢上下文。

侧边接口按左右分工：左边是**读取类**（read / grep / glob / 查路径），右边是**写入与执行类**
（edit / write / pwsh）。每侧最多摆 2 个，超出的会明说「另有 N 类未画在两侧」，
而不是悄悄藏起来。

### 5. 会话标签栏也有一个

除了左栏图标，会话区顶部的标签栏（对话 / 轨迹 / 上下文 / 编队 之后）也多一个入口。
同一个面板、同一份数据、同一份设置——不是第二个实现。切到这一页时，下方的输入框会被收起来，
让面板独占空间；切回对话页自动还原。

---

## 安装

### 方式一：让 agent 装（最省事）

在 DeepSeek Harness 会话里说：

```
用 plugin_manager 安装 dsh-workflow-map，路径是 <插件的绝对路径>
```

只有返回结果里写着 `applied` 才算真的生效，其它状态都不算。

### 方式二：命令行

```bash
cd "$HOME/.dsh/profiles/desktop"
pnpm add dsh-workflow-map
```

然后把 `"dsh-workflow-map"` 追加到该目录 `package.json` 的 `dsh.profile.bundles` 数组末尾。

### 方式三：本地源码开发

```bash
cd "$HOME/.dsh/profiles/desktop"
pnpm add "dsh-workflow-map@link:/path/to/dsh-workflow-map"
```

`link:` 装的是符号链接：改界面按 **F5** 就生效，改后台要**重启 DSH**。

### 装完怎么确认

```
1. 文件在：node_modules/dsh-workflow-map 存在
2. 接口活：GET http://127.0.0.1:<GUI端口>/dsh-workflow/state?sessionId=<会话ID> 返回 200 + JSON
3. 界面在：左栏有「工作流」图标，点开出现面板
```

---

## 什么时候要重启

插件分两半，生效方式不同：

| 你改了什么 | 怎么生效 | 为什么 |
|---|---|---|
| 面板外观、布局、交互 | **F5 刷新** | 浏览器半是纯前端，按需重新拉取 |
| 折叠逻辑、HTTP 路由、会话投影 | **重启 DSH** | 宿主半在进程启动时加载一次 |

已发布的版本装上后**重启一次**即可，之后界面调整只要 F5。

---

## 它会读什么，不会读什么

透明说明，因为工作流面板看的是你的会话内容：

**会读**
- 会话事件日志（`todo/write`、工具调用与结果、轮次起止、进度上报、审批与提问）；
- PAE 计划文件 `<项目>/.pae/<会话ID>/orchestrator.json`——**只读**，用 `mtime+size` 做缓存键，不写一个字节。

**不会读**
- 文件正文。`content` / `old_str` / `new_str` 这类字段**根本不进状态**：
  你让它写五千字，面板的体积不会因此变大。
- 任何网络请求。全部数据来自本地进程与本地文件。

**会截断**
- 参数与结果各留 200 字（UI 上明确标注「宿主上限 200 字」）；
- 单步最多 300 个节点，全会话最多 1200 个；超了会说「另有 N 个节点宿主未发送」，
  不会假装全都在。淘汰策略是从**节点最多**的步开始丢，已完成步不会被清空。

---

## 面板里的快捷键与手势

| 操作 | 效果 |
|---|---|
| 点卡片 | 右页打开这一步的记录（报告、产物、统计） |
| 点圆形接口 | 右页打开这一类的调用清单 |
| 点某一行调用 | 就地展开参数全文、结果、错误 |
| `Esc` | 关掉右页（不会关掉整个面板） |
| 齿轮 | 设置：配色（彩虹/品牌/低饱和）、动效（完整/始终/减少）、详情深度、节点上限 |
| 复制按钮 | 路径、命令、快照——1.5 秒回执「已复制」 |

**动效**这一项值得单说：「减少」会把面板内所有动画关掉（`prefers-reduced-motion` 也会自动生效）；
「始终」则在会话空闲时也让流光继续跑，适合当背景指示。

---

## 导出

齿轮里有四种导出：复制 Markdown / 复制 JSON / 下载 Markdown / 下载 JSON。
导出的是**当前会话的工作流快照**——分步、状态、百分比来源、节点清单、报告的产物路径。
适合贴进 issue、存档，或者丢给另一个 agent 让它接着干。

---

## 兼容性与边界

- **DeepSeek Harness** 0.2.x 及以上；宿主半依赖会话投影与 `webServer` 注册能力。
- **Node.js ≥ 20**。
- 额外端点只有三个，且挂在宿主已有的端口上，**不新开监听**：
  `GET /dsh-workflow/state`、`POST /dsh-workflow/steer`、`POST /dsh-workflow/unsteer`。
- 输入框（composer）**不属于本插件**。它由宿主在与面板并列的位置渲染，插件不去覆盖它，
  只在会话标签页这一席位上让它让位。

---

## 开发

```bash
# 改完浏览器半源码后必须重新生成 client.js
node tools/build-client.mjs

# 离线自测（10 套）
node tools/selftest-fold.mjs        # 折叠语义
node tools/selftest-host.mjs        # 注册、schema、投影接线
node tools/selftest-orchestrator.mjs # PAE 计划读取与合并
node tools/selftest-shape.mjs       # 包骨架、配置、白名单
node tools/selftest-panel.mjs       # 渲染树、样式、交互
node tools/selftest-detail.mjs      # 节点/分步详情
node tools/selftest-effects.mjs     # 动画与减少动效
node tools/selftest-settings.mjs    # 设置与导出
node tools/probe-route.mjs          # 真实 HTTP 路由
node tools/probe-steer.mjs          # 注入/撤回通道

# 真实日志只读回归
node tools/check-real-injects.mjs
node tools/audit-real.mjs

# 无头浏览器量测（需要本机 Chromium；脚本会自动探测 Chrome / Edge）
pwsh -File tools/measure-panel.ps1
pwsh -File tools/measure-flow.ps1
pwsh -File tools/measure-effects.ps1
pwsh -File tools/measure-detail.ps1
pwsh -File tools/measure-settings.ps1
```

合计 **1505 条离线断言 + 307 条浏览器量测**，另有真实日志回归（折叠本机上百个历史会话、零失败）。
`client.js` 是**生成物**（首行有 GENERATED 标记），不要手改。

---

## 目录

```
dsh-workflow-map/
├─ index.js              包入口（再导出 lib/index.js）
├─ lib/index.js          宿主半：会话投影 + 三条 HTTP 端点
├─ src/
│  ├─ fold.mjs           事件 → 状态 → 视图（纯函数，无时钟、无 IO）
│  ├─ orchestrator.mjs   只读 PAE 计划文件
│  ├─ route.js           /state · /steer · /unsteer
│  └─ client/            浏览器半源码（构建时内联为单文件）
├─ client.js             生成物
├─ cordis.patch.yml      挂载声明
├─ locale/               中英词典
├─ docs/                 开源发布指南
└─ tools/                自测、探针、浏览器量测
```

---

## 许可

MIT。可商用、可修改、可再分发，保留版权声明即可。

---

## 反馈

遇到问题时，能提供这些信息会让定位快很多：

- DSH 版本、插件版本（`package.json` 里的 `version`）；
- `GET /dsh-workflow/state?sessionId=<id>` 的返回（**注意：里面含你的任务标题与文件路径，提交前自行删减**）；
- 面板截图（哪一块不对）。
