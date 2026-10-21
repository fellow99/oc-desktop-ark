# spec.md —— `110-jitless` 无 JIT 模式（双形态兼容）

> **模块**：`110-jitless` ｜ **状态**：Proposed ｜ **日期**：2026-10-21 ｜ **应用**：OC Desktop Ark / `org.fellow99.oc.OCDesktopArk`
> **依据**：`docs/ACL配置.md`、`docs/ACL-无ACL评估.md`（P0–P4 与取证）；参考工程 `pi-desktop-ark/specs/108-jitless/`（同方案，真机已验证）；`specs/constitution.md`（A1 壳只做四件事 / A2 库不解释应用语义 / T5 事实优先 / G1 不静默失败）
> **编号**：功能需求 `FR-110-001` 起，验收场景 `AC-110-01` 起。编号一经发布不得复用。
> **证据口径**：✅ 实测 ｜ 🔶 沿用他工程 ｜ ⚠️ 推断 ｜ ⬜ 未取证。
> **落点**：本规格**只落在 `oc-desktop-ark/specs/110-jitless/`**，不进入父工程 `specs/`（需求约定）。
> **技术无关**：具体文件、脚本、依赖包名与落点一律见 [`plan.md`](./plan.md)；本文件只写行为与判据。

---

## 1. 背景与问题

无 ACL（`ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY` 未授予）⇒ V8 只能 `--jitless` 运行 ⇒ `typeof WebAssembly === 'undefined'`。本工程的载荷是 `opencode.mjs serve`（Hono + `node:http` 服务端 + `node:sqlite`，**无 Next.js / SWC**），在此形态下不是「变慢」，而是三道硬门（`docs/ACL-无ACL评估.md` §4）：

| 硬门 | 机制 | 现状 |
|---|---|---|
| ① `fetch`（Node 内建 undici，llhttp 为 WASM） | 一连接即抛 `WebAssembly is not defined` | ❌ **调模型主通道全废（致命）** |
| ② `opencode.mjs` 内嵌 **tree-sitter**（+ 各 grammar）WASM | 代码解析 / 语义搜索 / lsp-lite 不可用 | ❌ 代码类工具路径失败 |
| ③ `opencode.mjs` 内嵌 **photon**（`photon_rs_bg.wasm`） | 图片附件 EXIF / 缩放不可用 | ❌ 图片附件路径失败 |

**不受影响（重要）**：ArkWeb 页面里的 JS（渲染进程在系统权限域）、服务端 `node:http` 监听端（原生 C 版 llhttp）、`node:sqlite` / `fs` / `zlib` / `crypto`（原生，非 WASM）。

**与参考工程的载荷差异**：参考工程 `pi-desktop-ark` 是 Next.js + `node_modules` 树（组装期给每个 `undici`/`photon` 包改 `main` 指条件入口）；本工程是 **`opencode.mjs` 单文件 bundle（~16 MB）**。因此 `fetch/undici` 垫片可直接移植（不依赖包布局），而 photon / tree-sitter 的 WASM 入口在 bundle 内，需用**运行期能力开关 + 如实降级**而非「改包 main」。

---

## 2. 术语与形态

| 术语 | 定义 |
|---|---|
| **jit 形态** | V8 具备 JIT 与 WASM。前提：签名 Profile 授予 `ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY`。**现役形态，行为不得变化** |
| **compat 形态** | V8 以 `--jitless` 运行，`WebAssembly` 不存在。由**纯 JS 兼容层**支撑 |
| **模式判定** | 决定本次启动走 jit 还是 compat 的过程（见 `FR-110-001`） |
| **纯 JS 兼容层** | `payload/jitless/` 下的模块集合：HTTP 惰性 getter 封印、纯 JS `fetch` 垫片、undici 危险面接管、photon/tree-sitter 能力开关 |

---

## 3. 功能需求

### FR-110-001 运行形态：**编译期固定**（ArkTS 主进程侧）

**唯一开关**是构建期常量 `NODE_MODE`（`'compat'` | `'jit'`，**默认 `'compat'`**）。

1. 运行期**不得**存在任何形态切换入口：没有 `probeFlags` 参与形态决策、没有 want 参数、没有偏好设置项、没有 ACL 探测参与决策（ACL 探测只用于出依据串与诊断报告，不参与决策）。
   > **依据（沿用参考工程真机实测，必须保留）**：手机 `JUY-AL80`（API 26）上该权限查询**确为已授予**，但按 jit 启动后进程在 `libnode_bridge` 内 **SIGTRAP(TRAP_BRKPT)** 秒崩；同一 HAP 改 compat 则 1.6 s 就绪 ⇒ **权限位不是 JIT 可用性的预检**。`--jitless` 是进程级形态，而进程内 Node 每进程只起一次、失败即终态（库契约 §2.6），一次误判 = 整机不可用；代价不对称：jit 误判 = 应用不可用，compat 代价 = 7–10× 慢（功能完整）。
2. 要 jit 变体 ⇒ 改常量后重新构建（并在 `AppScope/app.json5` 区分版本号/渠道）。
3. 形态与依据必须落盘：`<filesDir>/payload/node-mode.json`（`mode`/`reason`/`flags`/`debugBuild`/`deviceType`/`deviceModel`/`osFullName`），因为部分机型（手机）对三方应用的 hilog 完全不可见。
4. `compat` ⇒ 交给库的 Node 参数**必须包含 `--jitless`**，且位于脚本路径之前（库保证 `flags` 全排在 scriptPath 前）。
5. 「所有 `deviceTypes` 默认 compat」是产品决策：`2in1` / `tablet` / `phone` / `tv` 不做设备间区分。

> 现有 `EntryAbility` 的 `probeFlags` 调试通道（`--no-verify-heap`）在 release 构建已禁用（宪法 S5）；本需求将形态从「运行期 flags」收敛为「编译期常量 + 诊断用 ACL 探测」。

### FR-110-002 权限声明面收敛

- `module.json5` 的 `requestPermissions` / `definePermissions` 中，**只保留** `kernel.ALLOW_WRITABLE_CODE_MEMORY` 这一条 ACL；
- `READ_PASTEBOARD`、`READ_WRITE_DESKTOP_DIRECTORY` 若仍残留在声明面，**必须移除**（`docs/ACL配置.md` §1.2 已定稿撤销：ArkWeb 自读剪贴板；选择器只留「沙箱/文档/下载」三根）；
- 保留 normal 级（**无需 ACL**）：`READ_WRITE_DOCUMENTS_DIRECTORY`、`READ_WRITE_DOWNLOAD_DIRECTORY`；
- 交付时必须有一处**可执行的静态门禁**证明声明面与上述一致（无「声明未用」「用未声明」，与既有 TC-S-005 同口径）。

### FR-110-003 载荷侧自适应安装（Node 主线程）

`payload/opencode-server.js` 必须在 **import `opencode.mjs` 之前**调用兼容层；兼容层以 `typeof WebAssembly === 'undefined'` 为**唯一开关**：

1. `WebAssembly` 可用 ⇒ **一个动作都不做**（jit 形态零影响），仅记一行事实；
2. 不可用 ⇒ 依次：封印 `node:http`/`node:https` 的惰性 undici getter → 安装纯 JS `fetch` 垫片（含 `Headers`/`Request`/`Response`/`FormData`/`Blob`/`File` 缺则补）→ 记录安装结果；
3. 安装结果必须是**可 grep 的结构化日志**（`installed` / `kept` / `failed` 三态），不得静默成功（宪法 G1）。

### FR-110-004 `fetch` 纯 JS 实现（**调模型主通道，必做**）

必须支持（以 `opencode` 服务端的真实调用面为准）：

| 能力 | 要求 |
|---|---|
| `fetch(input, init)` | `method` / `headers`（对象、数组、原生 `Headers`、`Map`）/ `body`（string、`Buffer`、TypedArray、`FormData`、`Blob`、`ReadableStream`）/ `signal`（中止） |
| 响应 | `ok` / `status` / `statusText` / `headers`（`get`/`has`/`forEach`/迭代）/ `text()` / `json()` / `arrayBuffer()` / `body` 为**标准 `ReadableStream`**（SSE 流式解析依赖 `getReader()`） |
| 重定向 | 最多 5 跳；303 改写为 GET |
| 编码 | 请求头/体按**能力判据**识别外来 `Headers`/`FormData`（**禁止**只用 `instanceof`：跨实现会静默丢头/丢体） |
| 传输层 | 只允许 `node:http` / `node:https`（**原生 llhttp**）+ `node:stream/web`；**不得**触碰 undici / WASM |

### FR-110-005 undici 危险面接管

**载荷事实（2026-10-21 review C1 取证修正）**：对 16 MB `resfile/opencode/opencode.mjs` 全文 grep，
字面量 `'undici'` 仅出现 2 次，唯一的 `from 'undici'` 位于 **OpenAI SDK 的一条错误消息字符串**内
（提示用户如何自行配置代理），不是真实的 `import`/`require`；bundle 运行时**并不加载 undici 包**。
因此早期设想的「拦截 `Module._load('undici')`」**不接线**（拦截一个永不发生的加载只会增加风险面）。
真正的 undici 风险面是 Node 内置的 `node:http`/`node:https` 惰性 getter（`lazyUndici`），
已由 `http-lazy-undici.js` 封印（见 FR-110-004）。本条按如下口径落地：

- `undici-shim.js`（条件入口 + `createUndiciShim`）作为**已自测的防御资产保留**：仅当未来 bundle
  引入真实 `import ... from 'undici'`（依赖升级/换打包方式）时，经组装期条件入口接线；当前不进入运行时链路；
- 防御资产的行为契约仍被 selftest 钉死：compat 形态下 `undici.install()` 必须为**空操作**
  （不得把 `globalThis.fetch` 换回 WASM 版）；`setGlobalDispatcher`/`getGlobalDispatcher` 为惰性内存记录
  （不主动求值真实 undici 的默认 dispatcher）；`request/stream/pipeline/connect/upgrade` 覆写为
  **明确 reject**（`code=ERR_JITLESS_UNDICI_WASM`，信息指路改用 `fetch`），不静默；
- jit 形态（`WebAssembly` 可用）下条件入口**原样透出**真实模块，100% 原生。

### FR-110-006 tree-sitter 代码解析：**能力开关 + 如实降级**

- compat 形态下，依赖 tree-sitter（WASM）的**语义搜索 / lsp-lite / 代码结构解析**不可用；
- **保留**基于 `ripgrep` / `grep` 的纯文本搜索（非 WASM，compat 下仍可用）；
- 触发语义搜索时必须给出**结构化降级提示**（「本档不支持语义搜索，已回退文本搜索」），**不得**崩进程、不得静默失败；
- jit 形态下行为与现役完全一致。

### FR-110-007 图片能力（photon → 纯 JS 垫片 / 如实降级）

**载荷事实（2026-10-21 本机 grep 取证，修正本条早期假设）**：`opencode.mjs` 对 photon 是**双层结构**：
1. **调用层**：`nn.PhotonImage.new_from_byteslice(...)`，且**自带 `try/catch`**（`catch:()=>new DecodeError(...)`）⇒ 解码失败是**受控降级**（上游把 `DecodeError` 转为用户可见提示），不崩进程；
2. **加载层**：bundle 内联 emscripten 实例化 `new WebAssembly.Module(readFileSync(__OPENCODE_PHOTON_WASM_PATH))`，WASM 路径来自 `process.env.OPENCODE_PHOTON_WASM_PATH`（默认 `<assetsRoot>/@silvia-odwyer/photon-node/photon_rs_bg.wasm`）。

⇒ 「monkey-patch bundle 内 photon 入口」在本工程**不可行**（调用方与 WASM 加载方都是 minified 内部符号，无外部拦截点）；纯 JS 垫片无法注入为 photon 本体。**本条需求按如下口径落地**：

- compat 形态下**图片附件路径不可用**：触发图片附件时走上游既有 `DecodeError` 降级路径 ⇒ 用户可见「图片处理失败」提示，**对话可继续、进程不崩**；
- 纯 JS 编解码能力（`photon-shim.js` + `image-codec.js` + vendor `jpeg-js`/`pngjs`，锁 sha256）**保留并全量自测**（`payload/jitless/selftest/photon.mjs`）：作为已验证的降级/替换资产，供未来上游提供注入点（环境变量指向 JS 实现 / 上游拆分 photon 为独立包）时直接启用；
- jit 形态（`WebAssembly` 可用）行为与现役完全一致（原生 photon）；
- **验收口径变更**：AC-110-09 的 compat 主分支为「发图得到明确提示且对话可继续」（与 tree-sitter/code-mode 同口径的如实降级）；「发图成功（视觉模型识读）」仅对 **jit 变体**成立。

### FR-110-008 code-mode（quickjs）降级

- `opencode.mjs` 内嵌 `quickjs`（WASM）用于 code-mode；compat 形态下**不可用**；
- 触发时给出结构化错误；**不得**崩进程；工具不注册时 UI 可继续。

### FR-110-009 可诊断性

- 载荷启动日志（`server.log` / 库 `node.log`）必须包含：`WebAssembly` 是否存在、兼容层每一环的安装结果、`--jitless` 是否生效；
- ArkTS 侧诊断串 / 状态必须显示当前模式（`jit` / `compat`）与判定依据；
- 形态证据落盘 `node-mode.json`（FR-110-001 §3）。

---

## 4. 非功能需求

| 编号 | 要求 |
|---|---|
| NFR-110-001 | **jit 形态零回归**：所有兼容动作以 `typeof WebAssembly === 'undefined'` 为唯一开关；jit 形态下不得新增可观察行为差异（网络、图片、启动耗时） |
| NFR-110-002 | 不修改上游：`opencode` 源目录**只读**；所有改动发生在 `oc-desktop-ark`（ArkTS 源码 + `payload/` + `scripts/` + `specs/`） |
| NFR-110-003 | 新增第三方依赖体积 < 500 KB（纯 JS），且必须 vendor 进 `payload/jitless/vendor/` 并锁 sha256（离线可构建） |
| NFR-110-004 | 组装/投放脚本默认 dry run；新增步骤必须能被逐条审计（打印「改了什么、为什么」） |
| NFR-110-005 | 合规：release 构建不得存在运行期形态切换通道（既有 G9 / S5 约束不变）；敏感信息（API key / 账号密码 / 测试 URL）**不落盘任何文档** |
| NFR-110-006 | 解释器模式下冷启动 / 图片解码 / 工具调用耗时纳入验收基线（允许 7–10× 慢，功能完整） |

---

## 5. 验收场景

| 编号 | 场景 | 判据 |
|---|---|---|
| AC-110-01 | PC 侧 compat 复现 | `node --jitless` 跑载荷入口：`WebAssembly === undefined`，兼容层安装日志齐全（`installed`/`kept`，无 `failed`） |
| AC-110-02 | PC 侧真实 HTTP | compat 形态下 `fetch` 打通本地 HTTP（GET 文本 / POST JSON / SSE 分块），`response.body.getReader()` 可用 |
| AC-110-03 | PC 侧 undici 面 | compat 形态下 `install()` 后 `globalThis.fetch` **仍是**垫片；危险方法明确 reject（`ERR_JITLESS_UNDICI_WASM`） |
| AC-110-04 | PC 侧图片 | compat 形态下：≤ 限制的 JPEG/PNG 走「零解码」早退；超限图能被缩放并重新编码（魔数校验） |
| AC-110-05 | 投放门禁 | 投放脚本后：`resfile/opencode/jitless/` 存在且含 `index.js`/`fetch-shim.js`/`undici-shim.js`/`photon-shim.js`/`vendor/*`；`manifest.sha256` 覆盖全部 |
| AC-110-06 | 权限声明面 | 静态门禁：`module.json5` 只含 JIT ACL + 两个 normal 用户目录权限，无 `READ_PASTEBOARD`/`READ_WRITE_DESKTOP_DIRECTORY` |
| AC-110-07 | 真机 compat 启动 | 装 compat 变体（默认 `NODE_MODE='compat'`）⇒ Node 起、服务就绪（marker）、ArkWeb 可交互 |
| AC-110-08 | 真机 compat 对话 | 一次真实对话成功（`stopReason=stop`），SSE 流式可见（调模型走纯 JS fetch） |
| AC-110-09 | 真机 compat 图片 | compat 形态：发图得到**明确提示**（上游 `DecodeError` 降级）且**对话可继续**（FR-110-007 口径）；jit 变体：发图成功（视觉模型识读） |
| AC-110-10 | 真机 jit 回归 | 改 `NODE_MODE='jit'` 重新构建 ⇒ 不带 `--jitless`；启动/对话/图片与改造前一致（jit 零回归） |
| AC-110-11 | 降级如实 | compat 形态触发语义搜索 / code-mode 得到结构化降级提示，进程不崩 |
| AC-110-12 | release 合规 | release 包无运行期形态切换入口；`node-mode.json` 依据串为编译期常量 |

---

## 6. 范围外

- 不改 `opencode` 上游源码；
- 不做 ArkTS 原生图片解码桥（`@ohos.multimedia.image`）；
- 不替换 `quickjs`（code-mode 在 compat 形态下不可用，如实告知）；
- 不改 Git 分支、不 `git push`；
- 本需求模块**不添加到父工程 `specs/`**，只落 `oc-desktop-ark/specs/110-jitless/`。

---

## 7. 与参考工程 `pi-desktop-ark/108-jitless` 的对照

| 维度 | `pi-desktop-ark`（Next） | `oc-desktop-ark`（opencode，本工程） |
|---|---|---|
| 启动期 WASM 硬门 | 有：Next 转译 `next.config.ts`（SWC WASM）⇒ 启动即崩 | **无**（没有 Next/SWC） |
| 内嵌 WASM 工具链 | photon / quickjs / source-map | **tree-sitter（+grammar）/ photon / quickjs** |
| fetch 硬门 | 有（undici WASM llhttp） | **有（同一条，致命）** |
| 载荷形态 | Next + `node_modules` 树（组装期改包 `main`） | **`opencode.mjs` 单文件 bundle**（运行期能力开关 + monkey-patch） |
| 零 ACL 后果 | 启动即崩 + fetch 废 | 启动能起、用到 tree-sitter/图片/fetch 时该能力失效 + fetch 废 |
| 结论 | 保留 JIT ACL；jitless 作双形态兼容 | **同**：jitless 作**双形态兼容**（默认 compat，jit 可编译期切换） |
