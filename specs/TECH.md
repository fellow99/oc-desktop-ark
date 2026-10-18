# TECH —— 技术选型（Technology Inventory）

> 本文件只记录**实际采用/明确排除**的技术与版本。版本号取自仓库内可验证的事实（SDK 包描述、`runtime.lock.json`、`package.json`、补丁头）。
> 证据口径：✅ 已核实 · 🔶 沿用同型工程 · ⬜ 待验证。

## 一、运行时与平台

| 类别 | 技术 | 版本 | 用途 | 证据 |
|---|---|---|---|---|
| 应用形态 | HarmonyOS Stage 模型（UIAbility + ArkUI） | — | 单窗口桌面应用，`deviceTypes: ["2in1","tablet"]` | ✅ 规划 §1.1 |
| 开发语言 | **ArkTS**（`.ets`） | — | 宿主层全部代码 | ✅ |
| 编译 SDK | HarmonyOS SDK | **6.1.1.125 / API 24** | `compileSdkVersion` / `targetSdkVersion` | ✅ `sdk-pkg.json` |
| 构建工具 | **hvigorw** | **6.24.2** | `assembleHap` / `assembleHar` | ✅ `hvigorw --version` |
| 包管理 | ohpm | 随 CLT 6 | HAR 依赖 | ✅ |
| 设备目标 | 2in1 / tablet | — | 不做 phone | ✅ 规划 §0.3 |

## 二、Node 运行时（进程内）

| 类别 | 技术 | 版本 | 用途 | 证据 |
|---|---|---|---|---|
| 运行时库 | **`@fellow99/node-bridge`** | `0.1.0`（HAR） | `NAPI 引导 + dlopen(libnode.so) + node::Start`，把 Node 放进应用进程 | ✅ 库 README |
| Node | **v24.2.0** | `modules 137` / `soname libnode.so.137` | 服务端运行时 | ✅ `runtime.lock.json` |
| 运行时产物 | `libnode-arm64.so` | **126,809,264 B** / SHA-256 `3019bf5f…` | `entry/libs/arm64-v8a/libnode.so`；产物目录 `../ohos-node-bridge/runtime/`（原 `ohos-node-runtime`，已归入桥工程） | ✅ |
| C++ 运行库 | `libc++_shared.so` | 取自 SDK `native/llvm/lib/aarch64-linux-ohos/` | 运行时依赖 | ✅ 库文档 §5.9 |
| 平台标识 | `process.platform = "openharmony"` / `arch = "arm64"` | — | 平台分支判断 | ✅ 库真机记录 |
| JIT | V8 JIT + **ACL** `kernel.ALLOW_WRITABLE_CODE_MEMORY` | — | 无 ACL 即 SIGTRAP；`--jitless` 会废掉 WASM | ✅ 库 §D.8 |

## 三、上游 opencode（服务端 + UI）

| 类别 | 技术 | 版本 | 用途 | 证据 |
|---|---|---|---|---|
| 上游仓库 | **opencode** | tag `v2.0.26` / 提交 **`9b4ec5714d`** / 分支 `Branch_v2.0.26` | 服务端 + Web UI 单一来源 | ✅ `git describe` |
| HTTP 服务 | Effect HTTP（`effect/unstable/http`） | 随上游 | `/api/*` + `/auth/*` + `/openapi.json` | ✅ `packages/server/src/process.ts` |
| UI | SolidJS（`packages/app`） | 随上游 | 由服务端**同源**托管的内嵌 SPA | ✅ `packages/cli/src/services/web-ui.ts` |
| UI 归档 | `app-archive.bin`（brotli + JSON 索引） | 随产物 | 内嵌 UI，从 `OPENCODE_NODE_ASSETS_DIR` 读取 | ✅ `packages/cli/src/app-assets.ts` |
| 数据库 | **`node:sqlite`（`DatabaseSync`）** | Node 内置 | 会话/消息持久化（WAL） | ✅ `packages/core/src/database/sqlite.node.ts:1` + `libnode-arm64.so` 符号 |
| 构建 | **bun** | **1.4.2**（本地 `.cache/bun/`，来自 npm registry） | `build-node.ts --bundle-only`；上游 `packageManager` 硬要求 `^1.4.2`，全局 1.3.14 会被脚本拒绝 | ✅ 本机实测（1.4.2 通过，1.3.14 报错退出） |
| 打包器 | Vite（SSR 单文件） | 随上游 | 产出 `dist-node/opencode.mjs` | ✅ `vite.node.config.ts` |
| 构建目标 | `OPENCODE_NODE_TARGET=node24` | 由补丁 0001 注入 | 对齐 Node 24.2.0（默认是 `node26`） | ✅ 补丁 0001 |
| 条件变体 | `resolve.conditions: ["ohos","node"]` | 由补丁 0001 注入 | 让 `*.ohos.ts` 命中 | ✅ 补丁 0001 |
| host 侧验证 | Node | **24.14.1** | `smoke-node24.mjs` 门禁 | ✅ 本机 |

## 四、渲染与数据通道

| 类别 | 技术 | 版本 | 用途 | 证据 |
|---|---|---|---|---|
| 渲染容器 | **ArkWeb `Web` 组件**（`@kit.ArkWeb`） | SDK 内置 | 唯一渲染通道；无 Chromium | ✅ 规划 §5.3 |
| 存储能力 | `domStorageAccess(true)` + `databaseAccess(true)` | — | 否则 `localStorage === null`，SPA 首屏崩 | 🔶 dsh PoC |
| 业务通道 | **同源 HTTP + SSE**（`/api/event`） | — | 零 CORS、零 preload 桥、零 IPC 载体 | ✅ 规划 §2.2 |
| 鉴权 | `?auth_token=<base64("opencode:"+pwd)>` → SDK 自动 Basic | — | 首屏一次导航 | ✅ `packages/app/src/entry.tsx:81` |
| 备选鉴权 | 配对 Cookie `opencode_session_<port>` | — | 路线 A 不可用时 | ✅ `packages/server/src/auth.ts` |
| 宿主能力 | `HostBridge`（JSON/NAPI，可返回 Promise） | 库 0.1.0 | 权限/选择器/外链/通知 | ✅ 库 §5.4 |

## 五、明确**不引入**的技术

| 技术 | 原因 |
|---|---|
| Electron / Chromium / `libelectron.so` | 合规（必须 ArkWeb）+ 体积（181 MB） |
| `better-sqlite3` | `node:sqlite` 已在 `libnode.so` 内；无需 ABI 137 自建产物 |
| `@lydell/node-pty` / `opencode-pty` | 无 ohos 构件；PTY 平台级不可用 → 打桩（补丁 0003） |
| `@parcel/watcher` | 无 ohos 构件 → `OPENCODE_FILEWATCHER_DISABLE=1` |
| `@ff-labs/fff-node` / `--experimental-ffi` | Node 26 特性，Node 24 不支持 → `OPENCODE_DISABLE_FFF=1` |
| `ripgrep`（运行时下载 ELF） | 应用域不可执行自有 ELF；下载即失败 → 降级 |
| 插件 npm 在线安装（L2） | 联网 + 落盘 + 执行第三方 JS；v1 只允许本地插件（L1） |
| Service Worker 依赖 | ArkWeb 若不支持则**无害失败**，不作为功能判据 |

## 六、质量门与工具链

| 类别 | 工具 | 用途 |
|---|---|---|
| 补丁门 | `scripts/apply-patches.mjs --check` | HEAD=基线、工作树干净、补丁可干净应用 |
| 语法门 | `node --check` | scripts / payload 语法 |
| 载荷门 | `scripts/build-opencode.mjs` + `collect-opencode.mjs` | 产物与 SHA-256 清单 |
| host 门 | `scripts/smoke-node24.mjs` | `/api/info`、SPA、SSE |
| 编译门 | `hvigorw assembleHap` | HAP（签名材料存在则签名） |
| 真机取证 | `hdc` + `snapshot_display` + `uitest uiInput` + `hilog` + `hdc fport` | 四条通道 |
| 提交规范 | Conventional Commits | `feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert` |

## 七、版本矩阵（改动需同步的地方）

| 版本 | 值 | 落点 |
|---|---|---|
| 应用版本 | `2.0.26` / `20026` | `AppScope/app.json5` |
| 上游基线 | `v2.0.26` / `9b4ec5714d` | `patches/v2.0.26/`、`scripts/apply-patches.mjs`（`EXPECTED_BASELINE`）、`docs/000-工程规划.md` 文档头 |
| Node 运行时 | `v24.2.0` / ABI `137` | `ohos-node-bridge/runtime.lock.json`、`TECH.md`、`overall-plan.md` |
| SDK | HarmonyOS `6.1.1(24)` | `build-profile.json5` |
| hvigor | `6.24.2` | 构建日志 |

> ⚠️ 工具链差异会致命（同源码不同 hvigor/SDK 产出不同 `ets/modules.abc`，🔶 dsh 教训）⇒ 构建机必须固定本文的 SDK 与 hvigor 版本。
