# 011-version-2.4.1 技术方案（oc-desktop-ark，As-Built）

> 对应规格：[spec.md](./spec.md) ｜ 最后更新：2026-11-25

## 1. 基线

| 项 | 值 |
|---|---|
| 上游 | `opencode` submodule，tag `v2.4.1` / `6f0514052a` / `Branch_v2.4.1` |
| 应用 | `2.4.1` / `20401` |
| 补丁 | `patches/v2.4.1/`（3 条；历史目录只读） |
| 构建 bun | 1.4.5（上游要求 ^1.4.4） |

## 2. 补丁矩阵

| 补丁 | 迁移 |
|---|---|
| `0001-node-target-ohos` | 原样 |
| `0003-runtime-stubs-ohos` | 原样 |
| `0006-shell-select-ohos` | **重生成** |
| `0007-workspace-roots-picker` | ⬜ 待重做 |
| `0008-git-credentials-settings` | ⬜ 待重做 |

## 3. 命令链

```bash
node scripts/verify-runtime.mjs
node scripts/apply-patches.mjs
OPENCODE_NODE_TARGET=node24 node scripts/build-opencode.mjs --skip-install
node scripts/collect-plugins.mjs
node scripts/collect-opencode.mjs --apply
node scripts/smoke-node24.mjs --allow-version-drift
# HAP：devecocli build（SignHap 失败 → 产出 entry-default-unsigned.hap）
```

## 4. 结果

- 补丁 3/3 应用、0 失败；bundle（node24）成功。
- 载荷 902 文件 / 73.1 MB；photon 守卫「1 处锚点已替换 + 回读/语法校验通过」。
- `smoke-node24 --allow-version-drift` 全绿：`/api/info` 200、`/` 200（9461 B）、SSE `server.connected`、无凭据 401。
- `entry-default-unsigned.hap` 122.9 MB，`versionName 2.4.1` / `versionCode 20401`。
- 签名：`SignHap` 报 `00303242 Signature material verification failed` → 仅 unsigned 产物。

## 5. 待收敛项

| # | 项 | 状态 | 建议 |
|---|---|---|---|
| V-01 | `0007` 工作区主目录选择器在新状态机架构上重做 | ⬜ | `roots.ts` 纯逻辑可复用 + 扩展 `tree-machine` |
| V-02 | `0008` Git 凭据页在 settings 状态机上重做 | ⬜ | 按新 `settings/shell.tsx` + `pages.ts` 接线 |
| V-03 | 鸿蒙真机回归（签名材料） | ⬜ | 在 DevEco 重新生成 signing configs |
| V-04 | host smoke 版本漂移（host v24.7.0 vs 目标 v24.2.0） | ⚠️ | 用 v24.2.0 host 复跑可取证 |
