# patches/v2.1.2 —— opencode v2.1.2 上游补丁（5 条）

本目录是**上游补丁**（不是本工程的构建脚本），由 `scripts/apply-patches.mjs` 幂等应用到
`../opencode`，再由 `scripts/build-opencode.mjs` / `scripts/collect-opencode.mjs` 构建投放。
契约见 `docs/000-工程规划.md` 与 `specs/106-upstream-adaptation`。

## 基线（改动与验证的唯一基准）

| 项 | 值 |
|---|---|
| 仓库 | `../opencode`（上游，submodule） |
| tag | **v2.1.2** |
| 提交 | **a517687fde**（`release: v2.1.2`），分支 `Branch_v2.1.2` |
| 补丁头路径 | `a/packages/...` → `b/packages/...`（`git apply` 默认 `-p1`） |

换基线必须**新建** `patches/<新 tag>/` 目录重生成补丁，本目录只对 v2.1.2 成立
（`scripts/apply-patches.mjs` 的 `EXPECTED=a517687fde` 会前置校验）。

## 与 v2.0.26 的关系（迁移记录，2026-10-22）

v2.0.26 → v2.1.2 上游漂移 **1815 个提交**。5 条补丁逐条在新基线
`git apply --check` **全部通过**（上游演进未触及补丁上下文），按迁移策略
**原样复制**（内容零改动），编号/落点/作用与 `patches/v2.0.26/` 完全一致；
该目录作为 2.0.26 轮历史锚点原地保留。

> 上游 effect 3.x → 4.0.1 的子路径导出变更（`effect/unstable/*` → `effect/*`）只影响
> `packages/core/src/database/*` 落点；本工程不含 0002（sqlite ohos 变体，Node 24.2.0 设备侧
> `node:sqlite` 可用，两级后端策略由 106 规格的宿主能力覆盖），因此无需该适配。
> `oc-desktop-hos` 的 `patches/v2.1.2/0002` 已按 effect 4 重生成，见其 README。

## 补丁清单

| 编号 | 落点文件 | 作用（摘要） |
|---|---|---|
| `0001-node-target-ohos.patch` | `packages/cli/vite.node.config.ts` | ① `build.target` 支持 `OPENCODE_NODE_TARGET` 覆盖（本工程 Node 24 构建链）；② `resolve.conditions` 增 `ohos` 条件变体优先。 |
| `0003-runtime-stubs-ohos.patch` | `packages/core/package.json` + 新文件 `pty.ohos.ts` / `binary.ohos.ts` | PTY 打桩（`available=false`），避免 `@lydell/node-pty` 顶层加载失败中断 bundle import。 |
| `0006-shell-select-ohos.patch` | `packages/core/src/shell/select.ts` | ① `stat()` 的 `EACCES` 与 `ENOENT` 一视同仁；② `fallback()` 增认 `OC_SHELL_FALLBACK`。 |
| `0007-workspace-roots-picker.patch` | 新文件 `workspaces/selection/roots.ts`(+test)；改 `dialog.tsx`、`i18n/*` | 需求 203：工作区目录选择对话框升级为四主目录，自门控回退上游行为。 |
| `0008-git-credentials-settings.patch` | 新文件 `settings/git/*`；改 `settings/{route,pages,shell}.tsx`、`i18n/*` | 需求 204：「设置 → Git」凭据页，自门控。能力侧由壳插件 `plugins/oc-plugin-git` 提供。 |

## 生成命令（可复现）

```bash
# 在 ../opencode（干净 v2.1.2 工作树）上验证：
git apply <patch>                 # 正向可应用（未应用态）
git apply -R --check <patch>      # 应用态反向可应用
# 本轮（v2.1.2）为 v2.0.26 原样复制：cp ../patches/v2.0.26/*.patch ./
```
