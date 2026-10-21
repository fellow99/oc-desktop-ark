# 无 ACL 评估（零受限权限方案）

| 项 | 内容 |
|---|---|
| 日期 | 2026-07-04 |
| 状态 | **评估记录**：本版**不采用**零 ACL；本文留档其可行性、代价与落地路线 |
| 适用工程 | `oc-desktop-ark`（OC Desktop · HarmonyOS Edition：ArkTS 宿主 + ArkWeb 前端 + 进程内 Node 24 + 进程内 `opencode.mjs serve`） |
| 关联 | [`docs/ACL配置.md`](ACL配置.md)、[`docs/000-工程规划.md`](000-工程规划.md)、`pi-desktop-ark/docs/ACL-无ACL评估.md`（同源，载荷为 Next，可对照） |
| 判定口径 | ✅ 真机或本机实测 ｜ 🔶 沿用他工程实测 ｜ ⬜ 未取证 ｜ ⚠️ 推断（有证据链但未直接验证） |

---

## 1. 一句话结论

**能做到，但代价不是「变慢」，而是「要先把整条 WASM 依赖链和 fetch 拆掉」。**

当前载荷下，撤掉 `ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY` 后，V8 只能 `--jitless` ⇒ `WebAssembly` 整个对象**不存在**，于是：
① `opencode.mjs` 内嵌的 **tree-sitter（代码解析/搜索）与 photon（图片 EXIF/缩放）WASM** 全部失效；
② Node 自带 **undici 的 WASM 版 llhttp** 起不来 ⇒ `fetch` 全废（调模型的主通道）。

与 pi（Next 版）不同，本工程**没有 Next.js / SWC 这道硬门**（没有 `next.config.ts` 启动期转译），所以零 ACL 的「致命门」**只剩两道**（§4.1 WASM 工具链、§4.2 fetch）。要真正落地零 ACL，最少要做两件**架构级**改动（§6），并有四件可选取舍。

---

## 2. 现役权限面（本次定稿）

- `requestPermissions`：**6 项**（INTERNET / GET_NETWORK_INFO / KEEP_BACKGROUND_RUNNING / kernel.ALLOW_WRITABLE_CODE_MEMORY / READ_WRITE_DOCUMENTS_DIRECTORY / READ_WRITE_DOWNLOAD_DIRECTORY）
- `definePermissions`：仅 `kernel.ALLOW_WRITABLE_CODE_MEMORY`
- Ability 后台模式：`taskKeeping`
- **现役 ACL 只有 1 项**：`ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY`

**已撤销的 2 项 ACL**（本轮定稿，均不再出现在 `module.json5`）：

| 权限 | 等级 | 撤销依据 |
|---|---|---|
| `READ_PASTEBOARD` | `system_basic`（需 ACL） | 页面粘贴由 ArkWeb 自行读剪贴板；应用侧 0 处 `@ohos.pasteboard` 调用。真机：该权限从未授予时 Ctrl+V 仍可粘贴（pi 同源 REV-5） |
| `READ_WRITE_DESKTOP_DIRECTORY` | `system_basic`（需 ACL） | 桌面目录只是选择器的一个根；本版选择器只保留「沙箱/文档/下载」三根，不含桌面 |

**保留（normal 级，无需 ACL）**：`READ_WRITE_DOCUMENTS_DIRECTORY`、`READ_WRITE_DOWNLOAD_DIRECTORY`（`user_grant`，选择器点 Tab 授权）。

> 例外的「反向副作用」：撤销后**装机不再受那两条 ACL 的约束**（历史 `code:9568289` 的触发点只剩 JIT 一项）。

---

## 3. 零 ACL 在机制层意味着什么

| 能力 | 有 ACL（JIT 可用） | 零 ACL（必须 `--jitless`） |
|---|---|---|
| V8 Sparkplug / Maglev / TurboFan | 可用 | **全部关闭**，纯解释器执行 |
| `WebAssembly` | 可用 | **`typeof WebAssembly === 'undefined'`**（不是变慢，是不存在） |
| RegExp（irregexp） | 编译成机器码 | 退化为解释器 |
| 启动参数 | `--no-verify-heap` 即可 | **必须**带 `--jitless`；否则 V8 一申请可执行页就 SIGTRAP（探针实测 `CRASH sig=5`） |
| 计算性能 | 探针：热循环 **6–9 ms / 2e6** | 探针：**294–305 ms / 2e6**（≈40×，🔶 pi 同源） |
| N-API 原生库 / `fs` / `net` / `zlib` / `crypto` | 不受影响 | 不受影响 |
| ArkTS / ArkUI 产物 | 不受影响 | 不受影响 |
| **ArkWeb 页面里的 JS** | 不受影响 | **同样不受影响**（ArkWeb 渲染进程在系统权限域，与进程内 V8 jitless 无关，🔶 pi 同源 §5） |

---

## 4. 零 ACL 的两道硬门（本工程实际形态）

> 与 pi 的**关键差异**：pi 有「硬门一 = Next 启动期 SWC（WASM）」，本工程**没有 Next/SWC**，所以这道门不存在。本工程的两道硬门是「内嵌 WASM 工具链」与「undici fetch」。

### 4.1 硬门一：`opencode.mjs` 内嵌的 WASM 工具链（tree-sitter / photon）

**载荷事实（本机 grep，✅ 已取证）**：`opencode.mjs` 内嵌多份 emscripten WASM——
- `web-tree-sitter/tree-sitter.wasm`（+ 各语言 grammar：`tree-sitter-bash`、`tree-sitter-powershell`、`tree-sitter-zig`、`assets/zig/…` 等）：opencode 的**代码解析/语义搜索/lsp-lite** 依赖它；
- `silvia-odwyer/photon-node/photon_rs_bg.wasm`：**图片附件**的 EXIF 方向校正 / 缩放；
- `WebAssembly.instantiate*` / `WebAssembly.Memory` / `new WebAssembly.Module` 等调用点遍布 bundle（本机 grep 命中 `WebAssembly` 33 处、`wasm` 568 处）。

**零 ACL 后果（⚠️ 推断，链路完整但缺一行真机 JS 报错）**：
`--jitless` ⇒ `typeof WebAssembly === 'undefined'` ⇒ 上述 `WebAssembly.*` 调用在**首次触及时抛 `WebAssembly is not defined`**：
- tree-sitter 不可用 ⇒ **代码搜索 / 文件解析 / lsp-lite 类工具**不可用（对话里涉及读代码、grep、LSP 的工具路径失败）；
- photon 不可用 ⇒ **图片附件**（发图给模型）路径失败。

> 与 pi §4.1 的区别：pi 是「启动即崩」（Next 转译 `next.config.ts` 在启动期必触发 SWC）；本工程 tree-sitter/photon 多为**懒加载**（工具/附件被调用时才 instantiate），所以更可能是「启动能起来、用到对应工具/图片时该能力失效」，而非启动即崩。**需真机确认**（§9 未取证 #1）。

### 4.2 硬门二：Node 自带 undici 的 WASM llhttp ⇒ `fetch` 全废

**本机复现（Node v24.x，与 pi §4.2 同源，🔶 可本机秒级复现）**：

```
$ node --jitless -e "console.log(typeof WebAssembly)"
undefined
$ node --jitless -e "fetch('http://127.0.0.1:38999/x').catch(e=>console.log(e.cause))"
# → WebAssembly is not defined
```

`opencode.mjs` 的 `serve` 服务端与模型调用走 **`fetch` / undici**（本机 grep 命中 `undici` 5 处；LLM 对话、`/api/*` 代理、网页抓取全走它）。
⇒ **jitless 下 `fetch` 直接不可用** ⇒ 即便 §4.1 修好，**第一次真实对话仍会失败**（调模型的主通道断了）。

> 他工程同源台账（dshm，Node 22/24 均复现）：`unhandledRejection: ReferenceError: WebAssembly is not defined at lazyllhttp (node:internal/deps/undici/undici:5988:9)`；触发点是 `node:http` 的惰性 getter ⇒ `lazyUndici`；封掉 `node:http` 惰性 getter 后该报错消失（dshm `docs/50` E33–E39）；`--no-experimental-fetch` 在 Node 24 已移除、无效。

### 4.3 服务端自身（`node:http`）是否受影响？

`opencode serve` 的**监听端**用 `node:http`（原生 llhttp 走 C 实现，非 WASM）⇒ **纯 `http.createServer` 的监听不受 jitless 影响**。受影响的是**出站**（undici 的 WASM llhttp）与**内嵌 WASM 工具链**（§4.1）。⇒ 服务「起得来、监听正常」，但「出站 fetch + WASM 工具」不可用。⚠️ 推断，需真机确认监听是否稳定（§9 未取证 #2）。

---

## 5. 载荷里的 WASM 与影响面

本机 grep（`opencode.mjs`）确认的内嵌 WASM：

| # | 文件 | 谁在用 | 零 ACL 后果 | 判定 |
|---|---|---|---|---|
| 1 | `web-tree-sitter/tree-sitter.wasm` + 各 grammar（bash/powershell/zig/…） | 代码解析 / 语义搜索 / lsp-lite | 代码相关工具路径失败 | 需处理或砍功能 |
| 2 | `silvia-odwyer/photon-node/photon_rs_bg.wasm` | 图片附件 EXIF/缩放 | 图片附件路径失败 | 需处理或砍功能 |
| 3 | undici 的 llhttp（Node 内置，不在 bundle 里） | `fetch` / 模型调用 / 网页抓取 | **致命**：`fetch` 抛 `WebAssembly is not defined` | 必须处理 |

**不受影响（重要）**：
- ArkWeb 页面里的 JS（渲染进程在系统权限域，与进程内 V8 jitless 无关，🔶 pi 同源 §5）；
- 服务端 `node:http` 监听端（原生 C llhttp，§4.3）；
- `node:sqlite`（opencode 的本地 DB）、`fs`、`zlib`、`crypto`（原生，非 WASM）。

---

## 6. 若要落地零 ACL：分阶段路线与判据

| 阶段 | 动作 | 判据（必须实测） |
|---|---|---|
| P0 | 固化 `--jitless`（release 也生效；本工程现由 `AppStorage.nodeFlags` 给 `--no-verify-heap`，需加 jitless 通道） | 设备启动到「就绪」（`ARK_SERVER_READY`）不再出现 SIGTRAP / SIGABRT |
| P1 | 装纯 JS `fetch` 垫片 + 封 `node:http` 惰性 getter（阻断 undici WASM 初始化） | 一次**真实对话**成功（`stopReason=stop`），SSE 流式正常 |
| P2 | 代码解析：tree-sitter 换纯 JS / 或降级（关 lsp-lite，保留 ripgrep/grep 文本搜索） | 对话里读代码 / grep 可用，或 UI 明确「本档不支持语义搜索」 |
| P3 | 图片附件：换纯 JS（`jpeg-js`+`pngjs`）或走 ArkTS 原生，或砍掉 | 发一张图成功，或 UI 明确「本档不支持图片」 |
| P4 | 性能与回归 | 冷启动、首屏、工具调用耗时对比表；把 §3 的 40× 纳入验收基线 |

**不要做的事**：
- 不要用 `--no-experimental-fetch`（Node 24 已移除，传了直接 `invalid negation`）；
- 不要只覆盖 `globalThis.fetch` 就以为绕开 undici（触发点在 `node:http` 惰性 getter，dshm E36 已否证）；
- 不要把「解释器模式」当成「只是慢」——对本工程，`fetch` 断 = **主对话不可用**。

---

## 7. 与 pi（Next 版）零 ACL 评估的对照

| 维度 | `pi-desktop-ark`（Next） | `oc-desktop-ark`（opencode） |
|---|---|---|
| 启动期 WASM 硬门 | **有**：Next 转译 `next.config.ts`（SWC WASM）⇒ 启动即崩 | **无**（没有 Next/SWC） |
| 内嵌 WASM 工具链 | photon / quickjs / source-map | **tree-sitter（+grammar）/ photon** |
| fetch 硬门 | 有（undici WASM llhttp） | **有（同一条）** |
| 零 ACL 后果形态 | 启动即崩（§4.1）+ fetch 废 | 更可能是「启动能起、用到 tree-sitter/图片/fetch 时该能力失效」+ fetch 废 |
| 共同结论 | **保留** JIT ACL；零 ACL 留档为有代价的备选路线 | **同** |

> 共同依据：`ALLOW_WRITABLE_CODE_MEMORY` 在部分设备（尤其手机）申请不下来时，才需要走零 ACL；而零 ACL 的代价是 `fetch`（主通道）+ 内嵌 WASM 工具链，**不是「变慢」而是「拆链」**。

---

## 8. 同源工程的做法（可直接复用）

- **`dshm`（真实应用，明确选择零 ACL）**：`--jitless` 钉在脚本路径之前；`fetch` 用 960 行纯 JS 垫片（原生 llhttp + `node:stream/web`）+ 封 `node:http` 惰性 getter；TS 擦除换 `@babel/standalone`；tar 解包/终端改纯 JS。每个替换都配「没有垫片必须失败」的门禁，且先在 PC `node --jitless` 秒级复现。
- **`harmonyos-node-notes`（知识库）**：SIGTRAP 的修法就是 `--jitless`，并明确警告 `--jitless` 关 WebAssembly、`fetch`（undici llhttp 是 WASM）会启动即崩。
- **可直接借用**：`hostcore/app/fetch-shim.js` 的覆盖面与陷阱注释（`FormData` 的 `instanceof`、`node:http` 惰性 getter）；「PC 先复现、真机只验结论」的迭代方式。

---

## 9. 未取证清单（⬜ 待真机）

| # | 项 | 说明 |
|---|---|---|
| 1 | `--jitless` 下 opencode 服务端是否「启动能起」 | §4.1 推断为懒加载 ⇒ 能起；需真机确认 `ARK_SERVER_READY` 是否出现、首次对话/工具是否崩 |
| 2 | `node:http` 监听端在 jitless 下是否稳定 | §4.3 推断为原生 C llhttp、不受影响；需真机长跑确认 |
| 3 | tree-sitter / photon 具体失败表现 | 未单独测（工具/图片附件未在 jitless 下试过） |
| 4 | 零 ACL 下真实对话的失败点 | 预期 `fetch` 抛 `WebAssembly is not defined`；需真机复现并定位 |
| 5 | 撤销 `READ_PASTEBOARD` 后前端粘贴 | 预期与 pi 一致（ArkWeb 自读剪贴板），真机确认 |

---

## 附：本轮实测命令与读数（可复跑）

```bash
# 1) 零 ACL 现场（设备）：jitless 启动 ⇒ 看是否 ARK_SERVER_READY / 是否崩
hdc shell 'aa start -b org.fellow99.oc.OCDesktopArk -a EntryAbility --ps probeFlags "--jitless"'
hdc shell "tail -40 <filesDir>/payload/node.log"
hdc shell "hilog" | grep -a "LastFatalMessage\|Signal:SIGABRT\|Cpp Crash"

# 2) 对照（默认 --no-verify-heap）⇒ 存活、/api/info 正常
hdc shell "aa start -b org.fellow99.oc.OCDesktopArk -a EntryAbility"

# 3) fetch / WASM（本机，Node v24.x）
node --jitless -e "console.log(typeof WebAssembly)"          # undefined
node --jitless -e "fetch('http://127.0.0.1:38999/x').catch(e=>console.log(e.cause))"
#   → WebAssembly is not defined

# 4) 载荷里的 WASM 清单
grep -aoE "[a-zA-Z0-9_./-]+\.wasm" entry/src/main/resources/resfile/opencode/opencode.mjs | sort -u
#   → tree-sitter.wasm / 各 grammar / photon_rs_bg.wasm / …（见 §5）
```

**结论**：本版**保留** `kernel.ALLOW_WRITABLE_CODE_MEMORY`，零 ACL 作为一条有明确代价与执行清单的**备选路线**留档。若未来需要上手机/平板档（ACL 申请不下来），按 §6 的 P0→P4 逐阶段推进，每阶段的判据必须真机实测，不得以「应该可以」代替。

---

## 10. 110-jitless 落地结果（2026-10-21）

> 需求 `110-jitless`（规格 `specs/110-jitless/`）把本文 §6 的 P0→P4 路线**部分落地**：JIT ACL **仍保留在声明面**（`module.json5` 不变，装机仍需 Profile 授权），但运行形态改为**编译期双形态**，默认 `compat`（`--jitless` + 纯 JS 兼容层），使「无 ACL 授权 / JIT 不可用」的设备也能正常启动使用。

| 阶段 | 动作 | 状态 | 判据 |
|---|---|---|---|
| P0 | 编译期常量 `BuildConfig.NODE_MODE`（默认 `compat`）；`compat` ⇒ flags 必含 `--jitless`；`jit` 变体改常量重构建 | ✅ 已实现 | `node-mode.json` 证据落盘；release 无运行期切换入口 |
| P1 | 纯 JS `fetch` 垫片（`payload/jitless/fetch-shim.js`，node:http/https + stream/web）+ 封印 `node:http` 惰性 undici getter | ✅ 已实现（PC `node --jitless` 全绿：GET/POST/SSE/中止/FormData/Blob/重定向） | AC-110-02/03；真机对话待设备 |
| P2 | tree-sitter 降级：bundle 内懒加载 WASM 无法 monkey-patch ⇒ `wasm-patch.js` 探测并出**结构化降级事实**，走上游既有 try/catch 降级路径（纯文本 ripgrep/grep 保留） | ✅ 已实现（降级事实 + 不崩） | AC-110-11（真机确认待设备） |
| P3 | 图片（photon）：同 P2 —— bundle 内符号不可替换；纯 JS 编解码器（`jpeg-js`+`pngjs`，vendor 锁 sha256）与 `photon-shim.js` 已就绪（PC selftest 覆盖惰性解码/resize/双编码），bundle 侧走降级事实 | 🚧 部分（PC 层就绪；bundle 内 photon 入口待真机确认降级表现） | AC-110-04（PC 绿）/ AC-110-09（真机待设备） |
| P4 | 性能与回归 | ⬜ 待真机 | 解释器 7–10× 慢纳入基线（NFR-110-006） |

**与本文原结论的关系**：本文 §1/§7 的「保留 JIT ACL，零 ACL 留档为有代价备选路线」不变；110-jitless 把「备选路线」升级为**默认运行形态**（compat），同时保留 jit 编译期变体 ⇒ 双形态兼容，代价与执行清单即本文 §6 路线。
