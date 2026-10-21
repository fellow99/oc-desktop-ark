# plan.md —— `110-jitless` 实现方案

> 对应需求：[`spec.md`](spec.md)。方案决策与反证见 `docs/ACL-无ACL评估.md`、参考工程 `pi-desktop-ark/specs/108-jitless/`。
> 取证口径：✅ 实测 ｜ 🔶 沿用 ｜ ⚠️ 推断 ｜ ⬜ 未取证。

## 1. 总体结构

```
ArkTS（编译期常量）                     Node 载荷（自适应安装）
─────────────────────┬──────────────────────────────────────────
BuildConfig.ets      │  opencode-server.js
  NODE_MODE(默认compat)│    ├ require('./jitless').installIfNeeded()  ← 在 import opencode.mjs 之前
NodeMode.ets         │    │    ├ sealHttpLazyUndici()   （WASM 缺失才做）
  ├ resolve()        │    │    ├ installFetchShim()     （node:http/https + stream/web）
  │   └ 只读 BuildConfig.NODE_MODE
  ├ probeJitAcl()    │    │    ├ patchPhoton()          （monkey-patch bundle 内 photon）
  └ flagsFor(mode)   │    │    └ patchTreeSitter()      （能力开关 + 降级提示）
        │             │    │    └ facts → server.log（三态）
        └ flags 串 ────┼──→ 库 node::Start(argv: [node, ...flags, script])
                      │    └ import opencode.mjs（serve）
                      │
投放期（scripts/collect-opencode.mjs）
  └ 把 payload/jitless/ 复制进 resfile/opencode/jitless/ + 纳入 manifest.sha256
```

**唯一开关**：`typeof WebAssembly === 'undefined'`（运行期）；ArkTS 侧**唯一**形态来源是编译期常量 `BuildConfig.NODE_MODE`。

## 2. 文件级改动清单

### 2.1 ArkTS 侧（`entry/src/main/ets/`）

| 文件 | 改动 |
|---|---|
| `common/BuildConfig.ets`（新） | 编译期常量 `NODE_MODE: string = 'compat'`（唯一形态开关；改它就是「出另一个变体」） |
| `common/NodeMode.ets`（新） | `resolve(): { mode, reason, flags }`（只读 `BuildConfig.NODE_MODE`）；`probeJitAcl()`（`abilityAccessCtrl.checkAccessTokenSync`，**仅出诊断依据串**，异常⇒按未授予）；**不引 UI、不读全局状态** |
| `entryability/EntryAbility.ets` | `onCreate` 用 `NodeMode.resolve()` 得到 `flags` ⇒ `AppStorage.setOrCreate('nodeFlags', flags)`；形态与依据落盘 `node-mode.json`（经 `OpencodeRuntime` 或 `NodeMode` 直写）。**移除** `probeFlags` 对形态的参与（release 本已禁用；compat/jit 由编译期常量决定） |
| `app/OpencodeRuntime.ets` | `options.flags` 仍读 `AppStorage('nodeFlags')`（由 EntryAbility 按形态拼好）；启动后把 `node-mode.json` 证据写出（`<filesDir>/payload/node-mode.json`）；诊断串含 `mode=…(reason)` |
| `pages/Index.ets` | 启动状态串加模式与依据（`mode=compat（编译期常量）`），不改布局 |
| `common/Constants.ets` | 新增 `JITLESS_FLAG='--jitless'`、`ACL_WRITABLE_CODE_MEMORY`、`NODE_MODE_FILE='node-mode.json'`、`NODE_MODE_KEY='nodeMode'` 常量 |

### 2.2 载荷兼容层（`payload/jitless/`，新增）

> 从参考工程 `pi-desktop-ark/payload/jitless/` 移植；**不依赖包布局**（本工程是 `opencode.mjs` 单文件 bundle，不做「改包 main」）。

| 文件 | 职责 | 来源 |
|---|---|---|
| `index.js` | `installIfNeeded(log)`：`typeof WebAssembly` 开关 + 编排 + 结构化三态日志；**唯一出口**；幂等 | 移植（去掉 photon/undici「改包 main」相关，保留 seal+fetch+facts） |
| `http-lazy-undici.js` | 封印 `node:http`/`node:https` 惰性 undici getter（`globalAgent`→Agent 实例、`maxHeaderSize`→16KB 数值，其余→`{}`） | 移植（含两处本机实测差异注释） |
| `fetch-shim.js` | 纯 JS `fetch`（`Headers`/`Request`/`Response`/`FormData`/`Blob`/`File` + SSE + 重定向 + 中止 + 能力判据） | 移植（~1073 行） |
| `undici-shim.js` | compat 形态 undici 面：`install()` 空操作、dispatcher 惰性、`request/stream/pipeline/connect/upgrade` 明确 reject（`ERR_JITLESS_UNDICI_WASM`） | 移植 + 适配 bundle |
| `photon-shim.js` | 同步 photon API 面 + 惰性解码（jpeg-js / pngjs / 自实现 Lanczos3） | 移植（~475 行） |
| `image-codec.js` | 文件头宽高解析（JPEG/PNG/GIF/WebP）+ 解码/编码分派 | 移植（~317 行） |
| `wasm-patch.js`（新） | **本工程专属**：在 import `opencode.mjs` 前，按 `WebAssembly===undefined` monkey-patch bundle 内 photon / tree-sitter 调用入口；jit 形态不替换；降级路径输出结构化提示 | 新写（参考工程无 bundle，需新写） |
| `vendor/jpeg-js/`、`vendor/pngjs/`、`vendor/VENDOR.json` | vendored 纯 JS 编解码器（锁 sha256） | 移植 |
| `selftest/run.mjs` | PC 侧自检：`node --jitless payload/jitless/selftest/run.mjs`（fetch/undici 面/图片/http getter） | 移植 + 适配 |

`payload/opencode-server.js`：在 `import(pathToFileURL(entry))` **之前**加：`const { installIfNeeded } = require('./jitless'); const facts = installIfNeeded(log); log('jitless ' + JSON.stringify(facts));`

### 2.3 投放期（`scripts/collect-opencode.mjs`）

| 步骤 | 说明 |
|---|---|
| `copyJitlessRuntime(resfileDir)` | 把 `payload/jitless/` 复制进 `resfile/opencode/jitless/`（含 `vendor/`）；`selftest/` **排除**（开发期工具） |
| `manifest` | `jitless/**` 全部纳入 `manifest.sha256`（AC-110-05） |
| 审计 | 每步打印「复制了哪些文件、体积合计」；默认 dry run，`--apply` 才落盘 |

> 归档里 `opencode-server.js` 的 `require('./jitless')` 用**相对路径**，因此兼容层必须与入口**同目录部署**（`resfile/opencode/jitless/`）。

### 2.4 权限声明面（`entry/src/main/module.json5`）

- 核对 `requestPermissions` / `definePermissions`：**只保留** `kernel.ALLOW_WRITABLE_CODE_MEMORY`（ACL）+ `READ_WRITE_DOCUMENTS_DIRECTORY` / `READ_WRITE_DOWNLOAD_DIRECTORY`（normal）；
- 若仍有 `READ_PASTEBOARD` / `READ_WRITE_DESKTOP_DIRECTORY` ⇒ **移除**（FR-110-002）；
- 新增静态门禁脚本 `scripts/check-acl-surface.mjs`：解析 `module.json5` 与代码使用点，断言声明面与 FR-110-002 一致（并入 TC-S-005 口径）。

### 2.5 文档

- `docs/ACL-无ACL评估.md` 追加一节「110-jitless 落地结果」；
- `specs/SPECS_CHECKLIST.md`、`specs/STRUCTURE.md` 登记 M-110；
- `specs/overall-test-cases.md` 追加 `TC-110-*` 段并重排引用关系（见 test-cases.md）。

## 3. 关键实现要点（易错处，均来自参考工程本机/真机实测）

1. **`fetch` 具名/全局接管只在 WASM 缺失时做**：`WebAssembly` 可用时一个动作都不做，否则原生 undici 与垫片打架（`maxHeaderSize` 被换后原生 fetch 报 `http module header size invalid`）。
2. **封印惰性 getter 只在 compat 做**：`globalAgent` 换成 `{}` 会让 `https.request` 报 `Protocol "https:" not supported`（必须换成 `new mod.Agent()`）；`maxHeaderSize` 换成**数值**（16KB）而非 `{}`。
3. **顺序承重**：**先封 getter、再接管 fetch**；反过来可能在读 `globalThis.Headers` 时先把 undici 拉起来。
4. **`FormData`/`Headers` 判据用能力不用 `instanceof`**：跨来源 `instanceof` 必然漏判（真实事故：请求头全丢 ⇒ 401）。
5. **`photon` 必须同步**：上游 `image-resize-core.js` 全程无 `await`。
6. **`photon` 惰性解码**：先取宽高、命中「已达标」就返回原始字节 ⇒ 只解析文件头即可不付解码代价（「已达标」路径实测 `decodes=0`）。
7. **`--jitless` 位置**：必须在 `flags` 串里（库把 `flags` 全部排在 `scriptPath` 之前）；放进 argv 之后会被当成脚本参数。
8. **bundle 内 photon/tree-sitter 是 monkey-patch 而非改包 main**：本工程无独立 `node_modules`，需在 import 前拦截；jit 形态不替换（NFR-110-001 零回归）。
9. **release 合规**：运行期无形态切换入口；`node-mode.json` 依据串 = 「编译期常量 `BuildConfig.NODE_MODE=…`」。
10. **敏感信息不落盘**：DeepSeek API key / git 账号密码 / 测试 URL 只进运行时 env / 命令参数，**绝不**写进 specs/logs/文档（NFR-110-005）。

## 4. 风险与对策

| 风险 | 对策 |
|---|---|
| 真机 jitless 冷启动可能超过 `READY_TIMEOUT_MS=180s` | 先 PC 侧实测；参考工程设备冷启 ≈0.9–1.6 s（`.next`/bundle 读取快），预期不超时；若超则只在 compat 形态上调高 |
| `opencode.mjs` bundle 内 photon/tree-sitter 入口位置未知 | 先 grep 定位调用点（`new_from_byteslice` / `resize` / tree-sitter `Parser`/`Language`），写 `wasm-patch.js` 做能力开关；定位不到则按 FR-110-006「如实降级」（结构化提示，不崩） |
| 解释器下图片解码慢（~15×） | 惰性解码 + 前端已有压缩；超限图才付代价，日志记录耗时（NFR-110-006） |
| 上游 SSE 解析对 `Response` 有额外期望 | PC 侧 selftest 覆盖 GET/POST/SSE/中止；真机对话作为最终判据 |
| 真机未连（当前 `hdc list targets` 为空） | 先 PC 侧全量 + 构建 + HAP 产出；真机用例（AC-110-07…10）待设备连上后执行 |

## 5. 验证策略

1. **PC 优先**（`node --jitless` 秒级迭代，本机 Node v24.14.1 已确认 `WebAssembly=undefined`）：`payload/jitless/selftest/run.mjs` 覆盖 AC-110-01…04；
2. **静态门禁**：`scripts/check-acl-surface.mjs`（AC-110-06）+ `node --check payload/**/*.js`；
3. **投放门禁**：`collect-opencode.mjs --apply` 后校验 `resfile/opencode/jitless/` + `manifest.sha256`（AC-110-05）；
4. **构建**：`hvigorw assembleHap`（TC-H-009）产出 HAP；
5. **真机**：AC-110-07…12（需 hdc 在线与对应 Profile），命令见 test-cases.md §三。
