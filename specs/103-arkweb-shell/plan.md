# 103 渲染壳 — 技术方案（plan）

> 模块：`103-arkweb-shell`｜文档：plan.md（怎么做）
> 对应规格：`./spec.md`（FR-103-001…013、AS-103-01…10）
> 权威顺序：`specs/constitution.md` → `docs/000-工程规划.md` → `overall-plan.md` → 本文
> 渲染责任：运行时库**不参与渲染**（库文档 §5.1:412、§6.1:604），页面、加载页、错误页全部由本工程实现。

## 1 技术上下文（运行时与依赖版本）

| 项 | 值 | 来源 |
|---|---|---|
| 渲染容器 | ArkWeb `Web` 组件（`@kit.ArkWeb`）+ `webview.WebviewController` | `TECH.md:47`；`pi-desktop-ark/entry/src/main/ets/pages/Index.ets:1-2,34` |
| SDK / 构建 | HarmonyOS 6.1.1.125 / API 24；hvigor 6.24.2 | `TECH.md:12-13` |
| 设备类型 | `2in1` / `tablet`（不做 phone） | `TECH.md:15` |
| 服务地址 | `http://127.0.0.1:<真实端口>/`（端口由 101 从就绪标记/日志取得，非常量） | 规划 §5.3、`overall-plan.md:50` |
| 首屏导航 | `?auth_token=<base64("opencode:"+口令)>`，前端读取后立即从地址栏抹除 | 规划 §5.5.1；`packages/app/src/entry.tsx:81` |
| 明文 HTTP | `http://` 属明文；是否需 `cleartextTraffic` 由 P0-D 裁决 ⬜ | 规划 §5.3:336 |
| 加载页 | 应用内 ArkTS 页/覆盖层（**不是** `data:` 页） | 规划 §7.4:535 |
| 界面来源 | 服务端内嵌 SPA（内嵌 UI 归档 `app-archive.bin`），同源 HTTP + SSE | 规划 §2.2(c) |

## 2 宪法合规（逐条）

| 原则 | 判定 | 落地与证据 | 对应 FR |
|---|---|---|---|
| C1 壳薄契约硬 | ✅ | 页面只做「加载 / 围栏 / 展示」；无业务路由、无 preload 桥、无自定义协议 | FR-103-001、005 |
| C2 不隐藏平台真相 | ✅ | 失败必进错误页并带阶段 + 原因 + 日志尾；清历史失败、能力缺失都上诊断面板 | FR-103-004、007、008、010 |
| C3 谁写谁读 | ✅ | 壳只读就绪结果与日志，不写业务文件、不解压载荷 | FR-103-003 |
| C4 不改上游 | ✅ | 界面品牌/文案改动只在本工程产物与壳层，不动上游源码 | FR-103-013 |
| C5 崩溃终态 | ✅ | 错误页固定「请重启应用」，无「重试启动」；「重新探活」只重读证据不重启运行时 | FR-103-007 |
| C6 判据可证伪 | ✅ | 判据 = 加载完成回调 + 页内 `fetch` 200 + 8 项能力记录 + `dumpLayout` 差异 | FR-103-002、010 |
| S1/S3 安全边界 | ✅ | 只放行 `127.0.0.1:<port>`；地址与日志一律 `?auth_token=***` | FR-103-005、008 |
| S5 调试通道 | ⚠️ | 容器调试开关只在 debug 构建打开（`applicationInfo.debug` 判定），release 关闭 | FR-103-001 |
| G2 无浏览器语义 | ✅ | 不声明 `entity.system.browsable` / `ohos.want.action.viewData`；外链走系统 | FR-103-012 |
| G6 AI 标识 | ✅ | 壳底部常驻灰字，可用两次 `dumpLayout` 差异断言 | FR-103-013 |

## 3 研究结论与依据

| # | 结论 | 依据（path:line） | 对应 FR |
|---|---|---|---|
| R1 | 容器必须显式 `domStorageAccess(true)` + `databaseAccess(true)`；缺 `databaseAccess` 时部分存储 API 不可用、SPA 首屏可能崩 | `pi-desktop-ark/entry/src/main/ets/pages/Index.ets:379-385`；规划 §5.3:335；`TECH.md:48` | FR-103-001 |
| R2 | 首屏用 `$rawfile('boot.html')` 本地页，就绪后 `loadUrl(真实地址)`；加载页必须有本地首屏否则白屏无法诊断 | `Index.ets:11-15,378-379`；规划 §7.4:535 | FR-103-003 |
| R3 | `onPageEnd` 里同时做三件事：判定地址属于本机服务 → `clearHistory()`（只做一次，失败记 warn）→ 置 READY | `Index.ets:389-409` | FR-103-003、004 |
| R4 | `onLoadIntercept` 必须判 `isMainFrame()`：子框架一律放行；主框架只放行本地页与本机服务；其余阻断并转外链后返回 `true` | `Index.ets:410-423` | FR-103-005 |
| R5 | `onWindowNew` 不静默丢弃：把新窗口控制器指回当前容器，再由 onLoadIntercept 分流 | `Index.ets:424-429` | FR-103-006 |
| R6 | 错误页一次切换 + 注入失败详情；注入失败只 warn（错误页自身仍有内置文案） | `Index.ets:92-117`、`:120-133` | FR-103-007 |
| R7 | 错误载荷固定字段：state / stage / detail / lastError / hint / diagnostics / appLog；`hint` 为「请重启应用」 | `Index.ets:120-133` | FR-103-007、008 |
| R8 | 错误页与诊断信息不得依赖本地服务：pi 用 rawfile 错误页，本工程改为 ArkTS 覆盖层（`STRUCTURE.md:28` 已把「错误页/诊断面板」放在 `pages/Index.ets`；`rawfile/` 只规划了 `boot.html`） | `STRUCTURE.md:28,38`；`Index.ets:93-104` | FR-103-007 |
| R9 | 返回键必须主动拦截，否则会回到已被清历史清除的加载页或直接退出 | `Index.ets:236`（注释与实现） | FR-103-004 |
| R10 | 容器配置面结论：`javaScriptAccess` / `domStorageAccess` / `databaseAccess` 必备；不预设注入；仅当 P0-E 缺能力才用 `javaScriptOnDocumentStart` 兜底 | 规划 §5.3:334-342 | FR-103-001、011 |
| R11 | loopback 可达性是**未裁决冲突 X1**：一侧说渲染进程访问 `127.0.0.1` 被拦，一侧说首选 loopback；必须 P0-D 专项探针裁决 | 规划 §2.5:181、§5.4:344-353 | FR-103-002 |
| R12 | P0-D 判据：容器加载回环地址 → 加载完成回调 **且** 页内 `fetch` 成功；失败记录证据并切路线 B（`0.0.0.0` + 局域网 IP + 口令 + UI 提示） | 规划 §5.4:351、§11:662 | FR-103-002 |
| R13 | P0-E 八项：`localStorage` / `IndexedDB` / `fetch` / SSE ≥60 s / `crypto.subtle` / blob worker / wasm / CSP（含 `sha256-` 内联脚本） | 规划 §5.3:342、§11:663 | FR-103-010 |
| R14 | Service Worker 生产构建会 `register('/sw.js')`；不支持时**无害失败**，不作为判据 | 规划 §5.3:341 | FR-103-010 |
| R15 | 明文 HTTP 是否默认放行未定；必要时在 `module.json5` 配 `cleartextTraffic` | 规划 §5.3:336 | FR-103-002 |
| R16 | 阶段文案必须由编排器产出、壳只渲染；`data:` 式加载页被明确否定 | 规划 §4.2:261、§7.4:535；`Index.ets:54-89`（页面只读 runtime 状态） | FR-103-009 |

## 4 数据模型与状态机

| 实体（spec §4） | 技术落点 | 关键实现约束 |
|---|---|---|
| `ShellView` | `pages/Index.ets` 的 `webview.WebviewController` 单实例 | 一次启动只 `loadUrl` 一次；错误态单向（FR-103-003、007） |
| `ViewConfig` | `Web(...)` 的属性链（`javaScriptAccess`/`domStorageAccess`/`databaseAccess`）与 `module.json5` | 存储两项恒为开；调试开关按 `applicationInfo.debug`（FR-103-001） |
| `BootPage` | `pages/Index.ets` 的加载页覆盖层 + `rawfile/boot.html` 骨架 | 应用内渲染；只显示 101 给的阶段文案（FR-103-003、009） |
| `MainView` | `Web.loadUrl(<就绪地址> + '?auth_token=' + 令牌)` | 地址只来自 `getUrl()`；缺省不猜端口（FR-103-003） |
| `ErrorPage` | `pages/Index.ets` 的错误态覆盖层（ArkTS 组件） | 不依赖容器；`hint` 固定「请重启应用」（FR-103-007） |
| `DiagnosticPanel` | `pages/Index.ets` 的调试弹层（`@State diagText`） | 打开时读一次 `getDiagnostics()`；地址脱敏（FR-103-008） |
| `NavigationFence` | `onLoadIntercept`（主框架）+ `onWindowNew`（新窗口回流） | 前缀严格匹配；子框架放行；默认拒绝（FR-103-005、006） |
| `CapabilityMatrix` | 主界面首屏后的一次性探针脚本（`runJavaScript`）+ `[ark][shell] cap` 日志 | 8 项逐条结论+证据；缺项标红（FR-103-010、011） |
| `StageNotice` | 消费 `getStage()`；渲染位置 = 加载页状态条 | 由 101 产生，本模块只渲染（FR-103-009） |

**壳视图状态**（`Index.ets` 的 `@State`，与 101 的 `RuntimePhase` 解耦）：

```
boot ──就绪(running)+loadUrl──▶ main ──首屏成功──▶ main(historyCleared=true)
  │                               │
  └──失败/超时/崩溃──▶ error ◀────┘（onErrorReceive / onHttpErrorReceive / 快照含 crash）
```

不变量：`error` 为单向（不自动回 `main`）；`historyCleared` 只置一次；`loadUrl` 每次启动最多一次。

**NavigationFence 判定表**（`allow` 集合按前缀严格匹配，`String.startsWith` 而非包含匹配）：

| 请求 | 主框架 | 判定 | 动作 |
|---|---|---|---|
| `$rawfile('boot.html')` / 应用内相对页 | 是 | 放行 | — |
| `http://127.0.0.1:<port>/*` | 是 | 放行 | — |
| 其它 `http(s)://*` | 是 | 阻断 | `openExternal(url)`；返回 `true` |
| 任意子框架请求 | 否 | 放行 | — |
| `window.open` / `target=_blank` | — | 记录 warn | `handler.setWebController(this.controller)` 后回流 |

**CapabilityMatrix**（8 项，运行期探针写入诊断快照）：

| # | 能力 | 探针 | 通过判据 |
|---|---|---|---|
| 1 | `localStorage` | 写入并回读一个键 | 回读值相等；`localStorage !== null` |
| 2 | `IndexedDB` | 打开一个临时库并建对象仓库 | `onsuccess` 触发且 `objectStoreNames` 含该仓库 |
| 3 | `fetch` | 同源 `GET /api/info`（带 Basic） | `status === 200` |
| 4 | SSE 长连接 | `EventSource('/api/event')` 保持 ≥60 s | 收到首个事件且连接未断 |
| 5 | `crypto.subtle` | `digest('SHA-256', bytes)` | 返回 32 字节且与已知值一致 |
| 6 | blob worker | `new Worker(URL.createObjectURL(blob))` 回声 | 收到 worker 回传消息 |
| 7 | wasm | 实例化 8 字节最小模块 | 导出函数可调用 |
| 8 | CSP（`sha256-` 内联） | 首屏无 CSP 违规（监听 `securitypolicyviolation`） | 无违规事件，内联主题脚本生效 |

## 5 接口契约

**消费（来自 101，唯一来源）**

| 成员 | 用途 | 约束 |
|---|---|---|
| `getState()` / `getStage()` | 驱动加载页状态条与阶段文案 | 只读；不参与判断是否切页以外的事 |
| `getUrl()` / `getUrlOrPending()` | 拼主界面地址 | 空串即「未就绪」，禁止自行拼端口 |
| `getDiagnostics()` | 诊断面板 JSON | 已脱敏；页面只展示不修改 |
| `launch()` 的完成回调 | 触发切换或错误页 | 回调里根据 `getState()` 决定 `main` / `error` |

**提供（给 104 / 105 / 109）**

- `openExternal(url)` 调用 104 的宿主能力（未注册必须 reject，壳侧记 warn 后仍阻断导航，C1）。
- 主界面地址由 105 提供的「一次性令牌」拼装；壳只负责在日志与面板中脱敏为 `?auth_token=***`。
- 对 109：暴露 `dumpLayout` 可断言的三处文本 —— 阶段文案、错误页 `hint`、AI 标识。

**事件/日志**：`[ark][shell] nav allow|block <reason> <url脱敏>`、`[ark][shell] loadUrl <url脱敏>`、`[ark][shell] clearHistory ok|fail`、`[ark][shell] cap <n> <name> <pass|fail> <evidence>`。

## 6 实现策略

- **架构模式**：单页三态覆盖层。`Stack` 承载 `Web` + `BootPage` 覆盖层 + `ErrorPage` 覆盖层 + 底部常驻条（AI 标识 + 诊断入口）；`Web` 从启动起就存在（`$rawfile('boot.html')`），靠覆盖层切换视觉状态，避免重复创建控制器（对照 `Index.ets:373-460`）。
- **关键算法（切换）**：就绪回调到达 → 若 `switched` 已为 true 直接返回 → `loadUrl(url + '?auth_token=' + token)` → 记 `switched=true`；`onPageEnd` 判定 `startsWith(serviceOrigin)` 后 `clearHistory()` 一次并置 `main`。所有分支失败 → `showErrorPage()`（单向）。
- **导航围栏实现**：`onLoadIntercept` 内先取 `getRequestUrl()` 与 `isMainFrame()`；非主框架 `return false`；白名单 `startsWith` 命中 `return false`；否则 `openExternal(url)` 并 `return true`（FR-103-005）。禁用「包含匹配」，避免 `127.0.0.1.evil.com` 绕过。
- **错误处理**：错误对象 `{stage, message, hint, detail}`；`hint` 固定「请重启应用」；`detail` 取 `getDiagnostics()` 的日志尾（≤50 行）与 `tailAppLog`（≤8 KiB）。错误页本身是 ArkTS 覆盖层，不依赖容器，因此容器崩溃时仍可见。
- **性能**：覆盖层切换为状态变量赋值（≤1 帧）；诊断面板只在打开时读一次快照并缓存；能力探针只在主界面首屏后执行一次（第 4 项 SSE 计时 60 s，不阻塞界面）。
- **注入策略**：默认零注入（FR-103-011）；若 P0-E 判定某项缺失且影响首屏，才在 `onControllerAttached` 后注册文档开始脚本，并把脚本 SHA-256 与移除条件写进 `docs/真机验证记录.md`。

## 7 测试考虑

| 层级 | 手段 | 判据 |
|---|---|---|
| 静态 | ArkTS 编译 + `node --check`（脚本类） | 无类型/语法错误 |
| 交互（host 不可测） | 真机 `hdc shell uitest uiInput click` + `snapshot_display` | 点击外链后应用仍在前台且无新容器页 |
| 布局 | 两次 `uitest dumpLayout` 差异 | 阶段文案变化、AI 标识常驻（G6） |
| P0-D | 应用内最小 HTTP 服务 + 容器加载回环地址 | 加载完成回调 + 页内 `fetch` 200；失败即记录并切路线 B（FR-103-002） |
| P0-E | 8 项探针一次性执行并落 JSON | 8 行「结论 + 证据」；缺项标红并进 FR-103-011 决策 |
| 负样本 | `window.open` / `target=_blank` / 直接改地址到外部站点 / 返回键 | 分别：warn + 回流分流 / `openExternal` / 不回加载页 |
| 失败可见 | 人为让首批载荷缺失（根路径 404） | 错误页出现阶段 + 原因 + 日志尾 + `hint`（P0-I） |

## 8 文件清单

| 路径 | 作用 | 状态 |
|---|---|---|
| `entry/src/main/ets/pages/Index.ets` | 三态覆盖层：`Web` + 加载页 + 错误页 + 诊断面板 + 底部常驻条 | 🚧 新建 |
| `entry/src/main/resources/rawfile/boot.html` | 加载页静态骨架（纯 HTML，显示阶段文案占位） | 🚧 新建 |
| `entry/src/main/ets/common/Constants.ets` | 壳侧常量：`ERROR_HINT`、`DIAG_LOG_LINES=50`、`DIAG_TAIL_BYTES=8192`、AI 标识文案 | 🚧 新建（与 101 共用同一文件，常量分区） |
| `entry/src/main/ets/app/OpencodeRuntime.ets` | 被消费方：状态/阶段/地址/诊断快照 | 🚧 101 提供 |
| `entry/src/main/ets/host/HostCapabilities.ets` | `shell.openExternal` 实现（围栏分流目标） | 🚧 104 提供 |
| `entry/src/main/module.json5` | `cleartextTraffic`（若 P0-D 判定需要）、`INTERNET`、设备类型 | 🚧 新建 |
| `docs/真机验证记录.md` | P0-D / P0-E 逐项记录（含注入决策与移除条件） | ⬜ Phase 0 起 |
| `docs/evidence/` | 探针原始 JSON、截图、`dumpLayout` 文本 | ⬜ Phase 0 起 |
