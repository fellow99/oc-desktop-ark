# 011 — 版本更新：2.2.5 技术方案（ark）

> **回引:** `spec.md` ｜ **最后更新:** 2026-10-31 ｜ **日志目录:** `logs/20261031-1/`
> **上游基线:** opencode `v2.2.5`（`9bbb8ce18c`）｜ Node v24.2 / ArkWeb / 默认 jitless compat

## 1. 决策

| # | 决策 | 依据 | 回引 |
|---|---|---|---|
| D1 | 版本号 `2.2.5` = **20205** | 前序规则 | FR-ver-102 |
| D2 | 清理沿用显式清单 + `.gitignore` 断言；保留 oh_modules/node_modules/.cache/签名/bridge 物料 | 前序 | FR-ver-101 |
| D3 | 补丁：0001/0006 原样复制；0003/0007/0008 在 v2.2.5 干净树重生成（编号语义不变） | `--check` 实测 | FR-ver-104 |
| D4 | 守卫更新：`apply-patches.mjs`（patchDir、EXPECTED）、`collect-opencode.mjs`（BASELINE） | 脚本 | FR-ver-105 |
| D5 | bun 用 **1.4.4**（`BUN_BIN` 指向本地 1.4.4；上游 packageManager 硬校验） | 上游 | FR-ver-105 |
| D6 | 工具名 `bash→shell`：ark 走上游内置；host smoke 若写死 `bash` 同步为新口径（别名兼容，不阻断） | v2.2.5 U2 | U2 |
| D7 | jitless photon 守卫：在新 bundle 重新确认唯一锚点 `var photon_rsExports=requirePhoton_rs();`，漂移则更新注入锚点 | 110 规格 | U5 |
| D8 | 无真机：FR-106/107 跳过；host 门禁（smoke-node24/verify-runtime/verify-git-plugin/check-acl-surface）替代 | 用户约束 | FR-ver-107 |
| D9 | 构建后 `../opencode` 树恢复干净；串行于 hos 之后执行 | 单工作树 | R3 |

## 2. 步骤

| 步 | 动作 | 出口判据 |
|---|---|---|
| S0 | 记录基线/工具链 | 写入日志 |
| S1 | 清理（§3） | AC-01 |
| S2 | 版本号 + README | AC-02/03 |
| S3 | 守卫/脚本更新（D4/D5/D6） | 脚本自洽 |
| S4 | 补丁迁移 + README | AC-04 |
| S5 | `apply-patches --check` → 实应 → `build-opencode`(node24) → `collect-plugins` → `collect-opencode --apply`（含 photon 锚点） | AC-05/07 |
| S6 | `smoke-node24` + verify-runtime + verify-git-plugin + check-acl-surface | AC-07 |
| S7 | hvigorw assembleHap（debug） | AC-06 |
| S8 | 真机测试 | 跳过-无设备 |
| S9 | 代码评审 | REVIEW_REPORT |
| S10 | 敏感扫描 + opencode 树恢复 | AC-08 |
| S11 | 提交 + 本地 tag v2.2.5（不 push） | AC-09 |

## 3. 清理清单

**删除（断言命中 .gitignore）**：`.hvigor/`、`entry/build/`、`**/build/`（hvigor 生成物）、`.stage/`、
`entry/src/main/resources/resfile/opencode/`（collect 产物，以新产物为准）、`oh_modules/.vite` 等缓存、工程根散落 `*.log`。

**保留**：`oh_modules/`、`node_modules/`、`.cache/`、`payload/bridge/`、`payload/jitless/`、签名本地文件、`logs/`、`patches/`、`specs/`、`plugins/`。

## 4. 风险

| # | 风险 | 缓解 |
|---|---|---|
| R1 | 0007/0008 新结构重生成 | 功能等价移植 + host 插件单测 |
| R2 | photon 锚点随 bundle 漂移 | collect-opencode 注入守卫失败即定位新唯一锚点 |
| R3 | 共用 opencode 树污染 | 串行 + 结束恢复干净 |
| R4 | 无签名材料导致只产未签名 HAP | 以编译成功/版本元数据为 AC-06 证据 |
| R5 | 凭证落盘 | 占位符 + 提交前扫描 |
