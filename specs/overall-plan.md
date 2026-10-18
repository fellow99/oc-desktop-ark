# overall-plan —— 整体技术方案

> 本文是 `overall-spec.md` 的技术对应物（HOW）。模块级细节见 `1NN-*/plan.md`。
> 依据：`docs/000-工程规划.md` v0.3；运行时契约见 `ohos-node-bridge/docs/000-工程规划.md`（只引用不复制）。

## 1. 技术上下文

| 项 | 值 | 来源 |
|---|---|---|
| 应用 | ArkTS + ArkUI，Stage 模型，`2in1` / `tablet` | `TECH.md` |
| SDK / 构建 | HarmonyOS 6.1.1(24) / hvigor 6.24.2 | `hvigorw --version`、`sdk-pkg.json` |
| Node 运行时 | `@fellow99/node-bridge` 0.1.0 + `libnode.so` v24.2.0（ABI 137） | 库 `runtime.lock.json` |
| 服务端 | opencode v2.0.26（`9b4ec5714d`）stock CLI bundle，`serve` 语义 | 上游源码 |
| 渲染 | ArkWeb `Web`（同源加载本地服务） | 规划 §5.3 |
| 数据 | `node:sqlite`（WAL）→ `<filesDir>/data/opencode/opencode.db` | 规划 §5.6 |
| 构建机 | Windows + Git-Bash + Node 24.14.1 + bun 1.3.14 | 本机实测 |

**关键前提**：`node::Start` 每进程一次；`dlopen` 只认裸名 `libnode.so`；应用域子进程 JIT 被 seccomp 拦。

## 2. 宪法合规

| 原则 | 判定 | 说明 |
|---|---|---|
| C1 壳薄契约硬 | ✅ | ArkTS 仅 6 个源文件承担启动/观测/能力/渲染；业务全在 Node |
| C2 不隐藏平台真相 | ✅ | 5 阶段状态机 + 错误页 + 诊断面板；降级项显式列出 |
| C3 谁写谁读 | ✅ | 载荷解包（若走 tar.gz）由 Node 执行；marker 由写方维护 |
| C4 不改上游 | ✅ | 3 条幂等补丁（0001/0003/0006），正反向校验 |
| C5 崩溃终态 | ✅ | 载荷顶层兜底 + `lastCrash()` + 「请重启应用」 |
| C6 判据可证伪 | ✅ | 每条验收对应可观测事实（见 `overall-test-cases.md`） |

## 3. 实施策略（分层）

| 层 | 落地物 | 责任模块 |
|---|---|---|
| L1 宿主 | `EntryAbility` / `Index` / `OpencodeRuntime` / `Connection` / `Payload` / `Constants` / `Ports` / `HostCapabilities` | 101、103、104、105 |
| L2 运行时 | bridge HAR + `bootstrap.js` + `libnode.so` 投放 | 101 |
| L3 服务 | `payload/opencode-server.js` + `dist-node` 载荷 | 102 |
| 适配 | `patches/v2.0.26` + 构建参数 | 106 |
| 合规 | 权限声明面 + 清单 | 107 |
| VCS | 本地插件（isomorphic-git） | 108 |
| 质量 | 门禁脚本 + 回归四件套 | 109 |

## 4. 关键实现约定

### 4.1 启动编排（101）

1. `onWindowStageCreate` **先** `loadContent`（加载页），随后才申请权限与起 Node（避免权限弹窗卡启动屏）。
2. `Payload.plan()` 按**文件存在性**判定路线（resfile → tar.gz → 缺失），不做编译期开关。
3. `NodeRuntime.start({ scriptPath: bootstrap.js, env, flags })` 返回后立即进入就绪轮询（500 ms 间隔，上限 180 s）。
4. 就绪判据：`<filesDir>/payload/server.ready.json` 的 `port > 0`，或库日志中的 `ARK_SERVER_READY {json}`（**只认本轮**，按启动时刻过滤）。
5. `loadUrl(url + '?auth_token=' + token)`；`onPageEnd` 成功后 `clearHistory()`。

### 4.2 载荷（102）

- 产物：`dist-node/opencode.mjs` + `dist-node/assets/**`（含 `app-archive.bin`）。
- 投放：`resfile/opencode/**`（只读直读）；`manifest.sha256` 记录每个文件哈希。
- 回退：`resfile/opencode/opencode-dist.tar.gz` + Node 侧解包（SHA-256 marker 幂等）。
- 裁剪：删除非 arm64 原生件与 `opencode-pty` ELF；**保留** photon / tree-sitter wasm。

### 4.3 鉴权（105）

- 密码：`crypto.randomBytes(32).toString('base64url')`（ArkTS 侧用 `@ohos.security.cryptoFramework` 或等价 API；⬜ 实现时确认），落 `connection.json`（0600）。
- 首屏：`auth_token = base64("opencode:" + password)`。
- 日志：URL 一律脱敏为 `?auth_token=***`。
- 备选：`POST /api/pair`（Basic）→ `/auth/connect/<code>` → `opencode_session_<port>` Cookie。

### 4.4 宿主能力（104）

- 注册名：`runtime.facts` / `perm.check` / `perm.openAppInfo` / `fs.pickFolder` / `fs.pickFiles` / `shell.openExternal` / `notify.show`。
- 入参/出参均为 JSON 字符串；未注册即 reject；单次载荷 ≤ 8 MiB。
- 目录选择器返回**沙箱内可访问路径**；授权走 `fileShare.activatePermission`。

### 4.5 上游适配（106）

- 补丁：`0001`（conditions / ssr conditions / build target env / `node:sea` 兼容）、`0003`（PTY 打桩）、`0006`（shell select 的 EACCES，待判）。
- 关闭项：`OPENCODE_DISABLE_FFF=1`、`OPENCODE_FILEWATCHER_DISABLE=1`、`OPENCODE_DISABLE_MODELS_FETCH=1`。
- 数据项：`XDG_*` → `<filesDir>/*`、`OPENCODE_DB` 显式、`OPENCODE_DISABLE_CHANNEL_DB=1`。

## 5. 横切关注点

| 关注点 | 方案 |
|---|---|
| 日志 | 三通道：库 `logs()` / `logs/server.log` / `logs/.../app.log`；统一前缀 `[ark]` |
| 错误处理 | 阶段化错误对象 `{stage, message, hint, detail}`；错误页展示 + 可复制 |
| 安全 | 见宪法 S1–S7；口令与 token 不落日志 |
| 单实例 | `launchType: singleton` + `port 0` + 不再起第二个 Node |
| 关停 | `onPrepareToTerminate` → `runtime.shutdown()`（仅标记位；如实提示） |
| 可观测 | `runtime.facts`（节点/平台/版本/状态）+ 诊断面板 |

## 6. 测试策略

| 层级 | 手段 | 触发 |
|---|---|---|
| 静态 | `node --check`、JSON5 解析、权限声明面比对 | 每次提交 |
| 补丁 | `apply-patches.mjs --check` | 每次构建前 |
| 载荷 | `build-opencode` → `collect-opencode` → `smoke-node24` | 载荷变更 |
| 编译 | `hvigorw assembleHap` | 每阶段 |
| 真机 | `hdc` 安装 → 启动 → `/api/info` / 首屏 / SSE → 会话持久化 | 有设备时 |
| 回归 | 四件套（HAP 哈希 / 首启耗时 / 包体 / 接口与首屏字段） | 运行时或上游变更 |

## 7. 部署与发布

1. `build-bridge-har.sh` → `libs/@fellow99/node-bridge.har`
2. `provision-runtime.sh` → `entry/libs/arm64-v8a/{libnode.so,libc++_shared.so}`
3. `apply-patches` → `build-opencode` → `collect-opencode` → `resfile/opencode/**`
4. `smoke-node24` 全绿
5. `hvigorw assembleHap -p product=default -p buildMode=debug|release`
6. 签名材料由 `hvigorfile.ts` 从 `signing.<mode>.local.json` 注入（不入库）
7. 上架：`107-compliance` 清单 + 备案/隐私/AI 标识材料

## 8. 未决与风险（与规划 §12 对齐）

| 项 | 状态 | 影响 |
|---|---|---|
| ArkWeb → `127.0.0.1` 可达性 | ⬜ P0-D | 决定网络路线 A/B |
| ArkWeb 八项能力（SSE/IndexedDB/`crypto.subtle`/blob worker/wasm/CSP） | ⬜ P0-E | 决定是否需要注入兜底 |
| 大 bundle 在 ohos libnode 上 import | ⬜ P0-C | 决定是否需要进一步补丁 |
| `shell-select` 是否必需 | ⬜ P0-J | 0006 是否进必需集 |
| SQLite WAL / 文件锁在 hmdfs | ⬜ | 并发写行为 |
