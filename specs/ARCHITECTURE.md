# ARCHITECTURE —— 整体架构

> 依据：`docs/000-工程规划.md` v0.3 §4/§5；运行时契约见 `@fellow99/node-bridge` / `@fellow99/node-runtime` 库文档（[fellow99/ohos-node-bridge](https://github.com/fellow99/ohos-node-bridge)）。
> 本文描述**目标形态**；标 ⬜ 的部分尚未落地（greenfield）。

## 一、分层

```
┌──────────────────────────────────────────────────────────────────────────┐
│ L4 渲染层：ArkWeb `Web`（应用进程内）                                     │
│    opencode v2 Web UI（SolidJS SPA）：fetch('/api/*') + SSE('/api/event') │
└───────────────────────────▲──────────────────────────────────────────────┘
                            │ 同源 HTTP（零 CORS / 零 preload / 零 IPC 载体）
┌───────────────────────────┴──────────────────────────────────────────────┐
│ L3 服务层：opencode v2.0.26 stock CLI bundle（Node 侧）                   │
│    `serve --hostname 127.0.0.1 --port 0`                                  │
│    /（内嵌 UI）· /api/*（协议面）· /auth/*（配对）· /api/event（SSE）      │
│    数据：node:sqlite（WAL）→ <filesDir>/data/opencode/opencode.db          │
└───────────────────────────▲──────────────────────────────────────────────┘
                            │ 同一进程内，import() 加载
┌───────────────────────────┴──────────────────────────────────────────────┐
│ L2 运行时层：@fellow99/node-bridge（HAR + libnode.so）                    │
│    dlopen(libnode.so) → node::Start → bootstrap.js → 应用入口              │
│    日志环 / 崩溃记录 / 宿主能力桥（HostBridge）/ 环境契约                    │
└───────────────────────────▲──────────────────────────────────────────────┘
                            │ ArkTS 调用 / 状态回读
┌───────────────────────────┴──────────────────────────────────────────────┐
│ L1 宿主层：ArkTS（EntryAbility + ArkUI）                                  │
│    启动编排（密码→载荷→start→就绪→loadUrl）· 加载页/错误页/诊断面板         │
│    宿主能力实现（权限/选择器/外链/通知）· 窗口与单实例                      │
└──────────────────────────────────────────────────────────────────────────┘
```

## 二、进程与线程

| 实体 | 所在 | 说明 |
|---|---|---|
| UIAbility（EntryAbility） | 应用主进程 / 主线程 | 窗口、ArkWeb、状态机 |
| Node 运行时 | **同一进程**的 detached 线程 | `node::Start` 每进程一次；崩溃 = 应用崩溃（C5） |
| ArkWeb 渲染 | 由 ArkWeb 内部管理（⬜ 进程模型待 P0-E 观测） | 只通过 HTTP 与服务交互 |
| 子进程 | **不创建**（不 spawn Node、不 fork） | 应用域子进程 JIT 被 seccomp 拦（SIGSYS） |

**没有**：Electron 主进程、Chromium 渲染进程、utility 进程、sidecar。

## 三、启动时序（失败可见）

```
onCreate
  → loadContent('pages/Index')：先显示 ArkTS 加载页（不是 data: 页）
  → 申请权限（必须在 loadContent 之后）
  → [1/5] 密码装配：<filesDir>/ark/connection.json 存在则复用，否则生成 (0600)
  → [2/5] 载荷：resfile/opencode 只读直读（命中即完成；回退 tar.gz 由 Node 自解）
  → [3/5] NodeRuntime.start({ scriptPath: bootstrap.js, env }) → 返回「已投递」
  → [4/5] 就绪轮询：读 <filesDir>/payload/server.ready.json / 日志 `ARK_SERVER_READY {json}`
  → [5/5] loadUrl('http://127.0.0.1:<port>/?auth_token=***') → onPageEnd → clearHistory()
  ↘ 任一步失败 → 错误页（阶段 + 原因 + 日志尾 + 「请重启应用」）
```

## 四、数据流

| 方向 | 载体 | 内容 |
|---|---|---|
| ArkTS → Node（启动） | 进程环境 + 命令行 | `OPENCODE_*` / `XDG_*` / `NO_PROXY` / `--hostname` / `--port 0` |
| Node → ArkTS（观测） | 文件 + 日志环 | `server.ready.json`、`logs/server.log`、`logs()`、`lastCrash()` |
| ArkTS → Node（能力） | `HostBridge.invoke(name, json)` | 权限/选择器/外链/通知 |
| UI ↔ 服务 | HTTP + SSE | 会话/消息/工具/权限/事件流 |
| 宿主 → UI（凭据） | 首屏 URL 查询参数 | `auth_token`（一次性，前端读完即抹除） |

## 五、关键架构决策（及代价）

| # | 决策 | 理由 | 代价 |
|---|---|---|---|
| A1 | 无 Electron/Chromium，ArkWeb 唯一渲染 | 合规（必须 ArkWeb）+ 体积（省 181 MB） | 失去 Chromium 兼容性兜底（R2） |
| A2 | Node 在**应用进程内** | 应用域子进程 JIT 被拦；`node::Start` 每进程一次 | 崩溃不可恢复（C5） |
| A3 | 服务端用**上游 stock CLI bundle**，不新增入口 | 避免长期分叉（C4） | 只能通过 `argv/env` 表达配置 |
| A4 | 端口 `0` + stdout 嗅探 + marker | 常量端口冲突会 abort 整个 App | 需要可靠的就绪判据 |
| A5 | 鉴权用 `?auth_token=` | 上游原生支持，零注入/零 Cookie API | token 短暂出现在 URL（需日志脱敏） |
| A6 | 载荷 `resfile` 直读优先 | 零解压、零首启等待（≈89 条目） | 只读；需 P0-G 验证 import/assets 可读 |
| A7 | 补丁集自有（0001/0003/0006） | 与 hos 解耦，只带必需项 | 共用 submodule ⇒ 必须基线守卫 + 串行构建 |
| A8 | `node:sqlite` 零补丁 | `libnode.so` 已编译该 binding（证据） | 运行期 WAL/lock 行为待真机复验 |

## 六、失败模式与处置

| 失败 | 观测点 | 处置 |
|---|---|---|
| 载荷缺失/不可读 | 阶段 2 文案 + `lastCrash` | 错误页；提示重装或切换 tar.gz 路线 |
| Node 启动失败（无 ACL / SIGTRAP） | `lastCrash().signal` | 错误页「缺少必需权限」；不提供假重试 |
| 服务端 import 失败 | `logs/server.log` 栈 | 错误页 + 栈尾；定位到模块（补丁/降级） |
| 端口被占 | `EADDRINUSE` 不会出现（port 0） | 若出现则视为缺陷，记录日志 |
| ArkWeb 打不开 loopback | `onErrorReceive` | 切路线 B（0.0.0.0 + LAN IP）或错误页 |
| 鉴权失败 | UI 停在登录页 | 诊断面板显示「凭据不匹配」+ 重置入口 |

## 七、部署拓扑

```
HAP（org.fellow99.oc.OCDesktopArk）
├── entry/libs/arm64-v8a/{libnode.so, libc++_shared.so}   ← provision 投放（不入库）
├── resfile/opencode/{opencode.mjs, assets/**}            ← 载荷（构建产物，不入库）
└── rawfile/boot.html                                     ← 加载页
运行时数据（沙箱，可写）
<filesDir>/
├── ark/connection.json          (0600)
├── data/opencode/opencode.db    (SQLite, WAL)
├── config/opencode/             (配置 + plugin/ 本地插件)
├── cache/ · state/ · tmp/ · workspace/ · logs/server.log · payload/{app.log,server.ready.json}
```
