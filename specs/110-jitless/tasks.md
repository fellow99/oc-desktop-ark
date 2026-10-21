# tasks.md —— `110-jitless` 任务清单

> 依赖顺序执行；每条任务给出可判读的完成判据。`[PC]` 本机可验证（`node --jitless`），`[D]` 需真机。
> 敏感信息（API key / 账号密码 / 测试 URL）只进运行时 env / 命令参数，**不落盘任何文件**。

## T1 载荷兼容层移植（`payload/jitless/`）`[PC]`

- [ ] T1.1 建 `payload/jitless/`，移植 `index.js` / `http-lazy-undici.js` / `fetch-shim.js` / `undici-shim.js`（去「改包 main」，保留 seal+fetch+facts）
- [ ] T1.2 移植 `photon-shim.js` / `image-codec.js`
- [ ] T1.3 移植 `vendor/jpeg-js/`、`vendor/pngjs/`、`vendor/VENDOR.json`（校验 sha256）
- [ ] T1.4 新写 `wasm-patch.js`：import `opencode.mjs` 前按 `WebAssembly===undefined` monkey-patch bundle 内 photon / tree-sitter 入口（先 grep 定位调用点）；jit 形态不替换；降级路径输出结构化提示
- [ ] **判据**：`node --check payload/jitless/*.js` 全 0 错；`node --jitless payload/jitless/selftest/run.mjs` 安装日志三态齐全无 `failed`

## T2 载荷入口接线（`payload/opencode-server.js`）`[PC]`

- [ ] T2.1 在 `import(pathToFileURL(entry))` 之前调用 `require('./jitless').installIfNeeded(log)` 并记事实
- [ ] **判据**：`node --jitless` 跑入口，日志含 `jitless {"active":true,...}`；jit 对照（不带 `--jitless`）`active:false`

## T3 兼容层自测（`payload/jitless/selftest/`）`[PC]`

- [ ] T3.1 移植/编写 `run.mjs`：覆盖 fetch GET/POST/SSE/中止/FormData/Blob/重定向、undici 面、photon 惰性解码/resize、http getter 封印
- [ ] **判据**：`node --jitless payload/jitless/selftest/run.mjs` 全绿（对照 AC-110-01…04）

## T4 ArkTS 形态常量（`entry/src/main/ets/`）`[编译]`

- [ ] T4.1 新增 `common/BuildConfig.ets`（`NODE_MODE='compat'` 默认）
- [ ] T4.2 新增 `common/NodeMode.ets`（`resolve()` 只读 BuildConfig；`probeJitAcl()` 仅诊断；`flagsFor(mode)`）
- [ ] T4.3 `common/Constants.ets` 加 `JITLESS_FLAG`/`ACL_WRITABLE_CODE_MEMORY`/`NODE_MODE_FILE`/`NODE_MODE_KEY`
- [ ] T4.4 `EntryAbility.ets`：按 `NodeMode.resolve()` 拼 `nodeFlags`（compat 带 `--jitless`），移除 `probeFlags` 对形态的参与
- [ ] T4.5 `OpencodeRuntime.ets`：启动后写 `node-mode.json`（mode/reason/flags/device…）；诊断串含 mode+依据
- [ ] T4.6 `pages/Index.ets`：状态串加 `mode=…(reason)`
- [ ] **判据**：`hvigorw assembleHap` 编译 0 错；release 构建代码中无运行期形态切换入口（grep `probeFlags` 不参与 flags）

## T5 权限声明面收敛（`module.json5`）`[静态]`

- [ ] T5.1 核对/移除 `READ_PASTEBOARD` / `READ_WRITE_DESKTOP_DIRECTORY`；保留 JIT ACL + 两个 normal 用户目录权限
- [ ] T5.2 新写 `scripts/check-acl-surface.mjs`（解析 module.json5，断言声明面 = FR-110-002）
- [ ] **判据**：`node scripts/check-acl-surface.mjs` 通过（AC-110-06）

## T6 投放期（`scripts/collect-opencode.mjs`）`[PC]`

- [ ] T6.1 `copyJitlessRuntime()`：`payload/jitless/` → `resfile/opencode/jitless/`（含 vendor，排除 selftest）
- [ ] T6.2 `jitless/**` 纳入 `manifest.sha256`
- [ ] T6.3 审计输出 + dry-run 默认
- [ ] **判据**：`node scripts/collect-opencode.mjs --apply` 后 `resfile/opencode/jitless/` 齐、manifest 覆盖（AC-110-05）

## T7 文档与规格登记 `[静态]`

- [ ] T7.1 `docs/ACL-无ACL评估.md` 追加「110-jitless 落地结果」
- [ ] T7.2 `specs/SPECS_CHECKLIST.md`、`specs/STRUCTURE.md` 登记 M-110
- [ ] T7.3 `specs/overall-test-cases.md` 追加 `TC-110-*` 段 + 重排引用关系
- [ ] **判据**：无占位符（TODO/TBD）；表格自洽；FR/AC 编号可追溯

## T8 Code Review `[评审]`

- [ ] T8.1 `requesting-code-review` 派发评审（spec 对照 + diff）
- [ ] T8.2 `receiving-code-review` 核实每条：验证、反驳无效项、按优先级修 Critical/Important
- [ ] **判据**：无 Critical 遗留；`REVIEW_REPORT.md` 落 `logs/<date>-N/`

## T9 测试（PC 全量 + 构建）`[PC]`

- [ ] T9.1 整理 `overall-test-cases.md` 引用关系
- [ ] T9.2 PC 侧 `node --jitless` 全量单测（T3 自测 + fetch/undici/photon 面）
- [ ] T9.3 静态门禁（check-acl-surface + node --check + 无调试残留）
- [ ] T9.4 投放门禁 + `hvigorw assembleHap` 产出 HAP
- [ ] **判据**：PC 侧用例全绿；HAP 产出；`TEST_REPORT.md` 落 logs

## T10 真机部署与验收 `[D]`（待设备连上）

- [ ] T10.1 `hdc list targets` 确认设备在线
- [ ] T10.2 装 HAP（Profile 含 JIT ACL 才装得上）→ `aa start`（默认 compat）
- [ ] T10.3 `node-mode.json` 验证 `mode=compat`、`--jitless` 生效
- [ ] T10.4 真实对话（`stopReason=stop`，SSE 流式）— DeepSeek API key 仅运行时 env
- [ ] T10.5 图片附件（视觉模型识读）
- [ ] T10.6 git 插件：无账号仓库 + 带账号仓库（账号密码仅运行时）
- [ ] T10.7 jit 变体回归（改 `NODE_MODE='jit'` 重构建，验证零回归）
- [ ] **判据**：AC-110-07…12 通过；敏感信息未落盘
