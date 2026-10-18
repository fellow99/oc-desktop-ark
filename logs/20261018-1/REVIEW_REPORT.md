# REVIEW_REPORT —— 000-scaffold 实现评审（第 1 轮）

> 评审方式：`requesting-code-review`（派发只读 code-reviewer，按 Critical / Important / Minor 分类）
> 处理方式：`receiving-code-review`（逐条核对 → 修复 / 记录延后 / 反驳并给依据）
> 日期：2026-10-18 · 评审对象：commit `7ac2d08`（feat/entry 骨架）
> 结论：**ready-with-fixes** → 修复后重新编译通过（`BUILD SUCCESSFUL`）

## 一、总体结论

骨架的编排、守卫与日志纪律成立；但有 **2 个 Critical**（首屏凭据被 URL 解码破坏、`ArrayBuffer` 解码方式错误）会导致真机表现为「登录页 / 每次启动重新登录」，**已全部修复并重新编译**。
Important 中与「必然失败 / 假承诺」相关的项已修；需要新功能面（诊断面板、导航围栏、Basic 探活、归档路线）的项**明确延后**到 Phase 1/2 并登记，不在本阶段假装实现。

## 二、Critical（2/2 已修复）

| # | 位置 | 问题 | 处理 |
|---|---|---|---|
| C1 | `OpencodeRuntime`（拼接 URL）+ `Connection.authToken` | base64 含 `+`，未 percent-encode ⇒ `URLSearchParams` 解成空格 ⇒ 凭据错 | ✅ 改为 `encodeURIComponent(token)`；注释写明原因 |
| C2 | `Ports.readText` | `ArrayBuffer.toString()` 不是 UTF-8 解码 ⇒ marker 恒空、凭据每次重生 | ✅ 改为 `buffer.from(ab.slice(0, read)).toString('utf-8')`（`@kit.ArkTS` 的 buffer） |

## 三、Important 处理（14 修 / 5 延后）

| # | 位置 | 问题 | 处理 |
|---|---|---|---|
| 1 | `OpencodeRuntime.buildEnv` | 未设 `OPENCODE_NODE_ASSETS_DIR` ⇒ `/` 空页 | ✅ 设为 `plan.readonlyRoot + '/assets'` |
| 2 | `Payload.plan` | 判据用宿主脚本 ⇒ 产物缺失也判「直读命中」 | ✅ 判据改为 `opencode.mjs + assets/app-archive.bin` |
| 3 | `Payload.plan` / 编排 | archive 路线未接线却打印「回退」 | ✅ 如实判为「归档回退未接线（Phase 1）」并**快速失败**（不留 180 s 假等待） |
| 4 | `Connection.parse` | `createdAt/rotatedAt` 按字符串解析数字 ⇒ 恒 0 | ✅ 改用 `Ports.numberAfterKey` |
| 5 | `Connection.generate` | 2×UUID=244 bit < 256 | ✅ 改为 3×UUID ≈366 bit（96 hex） |
| 6 | `Connection.save` | 非原子、无备份 | ✅ 临时文件 + rename；损坏文件先备份 `*.bad-<ts>` |
| 7 | `OpencodeRuntime` | 未驱动库状态机 | ✅ 成功 `markRunning()`；投递失败/超时/fatal `markFailed(reason)` |
| 8 | `OpencodeRuntime` | 超时文案缺证据 | ✅ 加尝试次数、marker 路径、`crash.signal ?? 'unknown'`、日志尾 800 字 |
| 9 | `HostCapabilities.install` | 从未被调用 | ✅ 在 `start()` 成功后接线并记摘要日志 |
| 10 | `HostCapabilities` | 8 项能力 / 放行 mailto / 非法 JSON | ✅ 收敛为 7 项、只允许 http(s) 并记录拒绝、失败统一 `JSON.stringify` |
| 11 | `payload/opencode-server.js` | 嗅探不跨 chunk | ✅ 64 字符滚动尾部 + 一次性闩；新增 `ARK_SERVER_FATAL` 快速失败 |
| 12 | `payload/lib/env.js` | 未前置 `/system/bin` | ✅ `PATH=/system/bin:...`（ArkTS 侧同样设置） |
| 13 | `scripts/build-opencode.mjs` | `OPENCODE_NODE_TARGET` 未注入子进程 | ✅ 注入 env；未设置直接失败（AS-102-04） |
| 14 | `scripts/apply-patches.mjs` | `--reset --yes` 未先打印将删项 | ✅ 先打印 `git diff --stat` 与 `git clean -nd`，再执行 |
| 15 | `scripts/collect-opencode.mjs` | 按 scope 误删纯 JS 入口 / 删 README / 缺 bootstrap 仍 exit 0 / 清单非 JSON | ✅ 只删平台专属子包（包 id 正则）、保留 README、缺 bootstrap exit 2、清单改 JSON（schema/baseline/form/node/target/files/totals） |
| 16 | `scripts/provision-runtime.sh` | 自建 cp，未委托库 | ✅ 委托 `tools/provision.mjs --out`（七项 ELF 门禁 + SHA-256） |
| 17 | `module.json5` | 多声明 `FILE_ACCESS_PERSIST` | ✅ 删除（声明面 = 使用面） |
| 18 | `Index.ets` | 加载失败会永久空白 | ✅ 加 `onErrorReceive` + 30 s 看门狗 + 错误页（含原因）；`clearHistory` 仅对本机 origin |
| 19 | `Ports.readText` | 无上限 | ✅ 上限 64 KB |

**明确延后（登记为 Phase 1/2，不当场假实现）**：

| 项 | 去处 | 理由 |
|---|---|---|
| Basic 探活 `/api/info`（FR-105-007） | 105 Phase 1 | 需要 ArkTS 侧 HTTP 客户端与重试策略；当前用 marker + ArkWeb 首屏兜底，已在规格登记 |
| 诊断面板 / `getDiagnostics()`（FR-101-009、103-008） | 101/103 Phase 1 | 需要 UI 承载面（弹窗/面板）与脱敏字段设计 |
| 导航围栏 `onLoadIntercept` / `onWindowNew`（103-005/006） | 103 Phase 1 | 外链策略需与「系统浏览器可达」一起验收 |
| 归档路线真实接线（`NodeRuntimeOptions.archive` 传参 + 解包后运行根） | 102 Phase 1 | 需先有 `tar.gz` 产物与解包器；当前先支持 resfile 直读，路线②如实判不可用 |
| 门禁跑「产品入口 + 投放后 resfile」与清单断言（102-008/009） | 102 Phase 1 | 依赖载荷产物；本阶段无产物（未联网构建） |

## 四、Minor 处理

- 修：`Index` 的 `abilityContext()` 同步抛错（改 try/catch 落错误页）；`Page_WATCHDOG_MS` 死常量（已实际使用）；`HostCapabilities` 死代码 `perm.request`（已删）；`build-opencode` 的 bun ENOENT 提示；`apply-patches` 的 git 错误空详情。
- 保留：`Index` 500 ms 轮询已降到 1 s + `logs(50)`（见下）；`Constants.NAMES` 作为能力清单的**声明面**保留（用于与 `module.json5` 比对，属有意保留）。
- 不改：`payload/opencode-server.js` 的 `version: '2.0.26'` 已改为从 `ARK_VERSION` 读取（宿主在 `buildEnv` 传入），不再硬编码。

## 五、与规格的偏差（已更新到规格或登记）

| FR | 现状 |
|---|---|
| FR-101-002 | 已记录就绪通道（`channel=marker/log`） |
| FR-101-003 | 已实现「投递前删除旧 marker + 记作废日志」 |
| FR-101-006 | 已调用 `markRunning/markFailed`（库状态机被驱动） |
| FR-101-009 / 103-008 | 延后：诊断面板仍在 UI 层实现 |
| FR-102-005/007/009 | 裁剪改为包 id、清单改 JSON；「断言」留给 Phase 1 门禁 |
| FR-103-005/006 | 延后：导航围栏 |
| FR-105-002/003/006/011 | 已修（熵、原子写、percent-encode、损坏备份） |
| FR-105-007 | 延后：Basic 探活 |
| 规划 §5.6 | `PATH` 已前置 `/system/bin`；`os.tmpdir` patch 仍为 ⬜（库/载荷 Phase 1） |

## 六、复验证据

| 门 | 结果 |
|---|---|
| `node --check`（7 个脚本/载荷） | ✅ 全部通过 |
| `bash -n`（2 个 shell 脚本） | ✅ 通过 |
| `node scripts/apply-patches.mjs --check` | ✅ 基线 `9b4ec5714d`、工作树干净、3 条可应用 |
| `hvigorw assembleHap` | ✅ BUILD SUCCESSFUL（修复后重新编译） |
| HAP 内容 | ✅ 16 entries（含 `libnode.so`、`resfile/opencode/README.md`、`rawfile/boot.html`） |

## 七、第 2 轮（Critical 复审）

按 `requesting-code-review` 的要求，Critical 修复后应复审确认。本轮复审范围为 C1/C2 两处修复 + 其直接影响面（`Ports` / `OpencodeRuntime` / `Index` 编译与调用链），结论：**已消除**（重新编译通过；两处实现与本轮评审建议逐字一致）。完整第二轮全量评审留待 Phase 1 载荷产物就位后执行（当前无产物，无法覆盖运行期路径）。
