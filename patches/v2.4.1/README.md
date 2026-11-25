# patches/v2.4.1 — oc-desktop-ark 上游幂等补丁

基线：opencode **v2.4.1**（tag `v2.4.1` / 提交 `6f0514052a` / 分支 `Branch_v2.4.1`）。
与 `oc-desktop-hos` / `oc-desktop-android` 共用同一套补丁语义（node 目标除外，见 0001）。

| 补丁 | 落点 | 作用 | 为什么上游不能直接接受 | v2.4.1 迁移 |
| --- | --- | --- | --- | --- |
| `0001-node-target-ohos.patch` | `packages/cli/vite.node.config.ts` | 构建目标锁 node24（对齐 libnode v24.2.0 / ABI 137）+ `ohos` 条件优先 | 上游只支持 darwin/linux/win32 三平台与 node26 SEA | 原样复用（`--check` 通过） |
| `0003-runtime-stubs-ohos.patch` | `packages/core/package.json` + `pty/pty.ohos.ts`、`persistent-pty/binary.ohos.ts` | `#pty` / `#persistent-pty-binary` 增 ohos 变体，`available = false` | 上游无 ohos 原生 pty 产物；应用沙箱无法执行随包 ELF | 原样复用（`pty.node.ts` 表面未变） |
| `0006-shell-select-ohos.patch` | `packages/core/src/shell/select.ts` | `stat()` 吞 `EACCES`；`fallback()` 支持 `OC_SHELL_FALLBACK` | 应用域对系统路径 `stat` 抛 `EACCES`，上游只在 win32 分支处理平台差异 | **重生成**（上游新增 `Bus` 事件 / `isAppExecutionAlias` / zsh `nomatch`） |

## v2.2.5 → v2.4.1 迁移记录（需求 011-version-2.4.1，2026-11-25）

上游漂移 **1435 提交 / 10167 文件**。原 5 条补丁中：

- **原样复用（2 条）**：`0001` / `0003`（`git apply --check` 干净通过）。
- **重生成（1 条）**：`0006`（`select.ts` 上游重构，语义不变、锚点更新）。
- **本轮未迁移（2 条，⬜ 待重做）**：
  - `0007-workspace-roots-picker`：v2.3.0 起 `packages/app/src/workspaces/selection/` 重构为显式状态机
    （`tree-machine.ts` / `combobox-machine.ts` / `queue-machine.ts`），v2.2.5 的 imperative 钩子失效。
  - `0008-git-credentials-settings`：`packages/app/src/settings/shell.tsx` 重构为状态机 + i18n 漂移。

两者均为**自门控**功能（RPC/插件不可达时完整回退上游行为），故基座升级可先落地。
重做任务见 `specs/011-version-2.4.1/tasks.md` T1-3 / T1-4。

## 验证（2026-11-25）

- 干净 v2.4.1 工作树逐条 `git apply --check`：3/3 通过；`apply-patches.mjs` 3/3 应用、0 失败。
- 语义门禁：应用后 `script/build-node.ts --bundle-only`（`OPENCODE_NODE_TARGET=node24`）退出码 0。
- 载荷：`collect-plugins` + `collect-opencode --apply` → 902 文件 / 73.1 MB；photon 锚点**恰 1 处**注入成功。
- 门禁：`smoke-node24`（`--allow-version-drift`，host v24.7.0 vs 目标 v24.2.0）全绿：
  `/api/info` 200、`/` 200、SSE `server.connected`、无凭据 401。
