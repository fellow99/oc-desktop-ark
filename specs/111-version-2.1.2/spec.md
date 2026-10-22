# 111 — 版本更新：2.1.2 功能规格

> **Module:** release ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-22
> **需求编号:** 101-version-2.1.2（跨工程需求；本工程规格目录编号顺延为 **111**，101–110 / 203 已占用）
> **需求名称:** 版本更新：2.1.2
> **git 分支:** 不改动（不新建、不切换、不重命名；沿用 `main`，与 `./opencode` 的 `Branch_v2.1.2` 无关）
> **涉及工程:** `oc-desktop-ark`（父工程 `D:\opencode-workspace\`）
> **上游基线:** opencode **v2.1.2**（tag `v2.1.2` / 提交 `a517687fde` / 分支 `Branch_v2.1.2`）
> **运行期:** 进程内 Node **v24.2.0**（`@fellow99/node-bridge`，ABI 137）+ **ArkWeb**（无 Electron / Chromium）

## 1. 目的

把 `oc-desktop-ark` 的上游基线从 opencode `v2.0.26`（`9b4ec5714d`）推进到 **`v2.1.2`**（`a517687fde`），
工程版本号固化为 **`2.1.2` / `versionCode 20102`**；清理中间/临时文件，把补丁集迁移到新基线
（新建 `patches/v2.1.2/`），重新编译构建并部署真机，随后完成环境能力与基本功能测试。

## 2. 范围

**In scope**

- 工程**中间文件 / 临时文件**清理（显式枚举清单，见 `plan.md` §3）。
- **版本号** `2.1.2` / `20102`（`AppScope/app.json5`、`README.md`、`specs/README.md` 同步）。
- **补丁集迁移**：`patches/v2.0.26/`（5 条：0001/0003/0006/0007/0008）→ `patches/v2.1.2/`。
- **补丁器基线更新**：`scripts/apply-patches.mjs` 的 `patchDir` 与 `EXPECTED` 默认值。
- **重新编译构建**：`ohpm install` → `verify-runtime.mjs` → `apply-patches` → `build-opencode` → `collect-opencode` → `smoke-node24` → `hvigorw assembleHap`。
- **真机部署与测试**（`test-cases.md`）。
- **敏感信息纪律**（§6）。

**Out of scope**

- **不改上游一个字节（直接编辑）**；**不改 git 分支**；**不动 Node 运行时基线**（`@fellow99/node-runtime@24.2.0` 不变）；
  **不做上架材料**；**不改插件体系与规格体系既有结论**。

## 3. 上游事实

| # | 事实 | 影响 |
|---|---|---|
| U1 | `../opencode` HEAD = `a517687fde`（`release: v2.1.2`），tag `v2.1.2` 存在，分支 `Branch_v2.1.2`，工作树干净 | 基线就绪 |
| U2 | 两基线间 **1815 个提交**；`packages/app/src/workspaces`（submenu 共享）、`packages/app/src/settings` 有实质演进 | 0007 / 0008 大概率冲突，需重生成 |
| U3 | 本工程补丁器守卫：HEAD 必须等于 `EXPECTED`（默认 `9b4ec5714d`）且工作树干净 | S3 改默认值为 `a517687fde` |
| U4 | 构建脚本默认工具链路径 `command-line-tools-6` 在本机不存在 | 构建时用 `HVIGORW` / `DEVECO_SDK_HOME` 环境变量覆盖为本机实际路径 |

## 4. 需求条目

- **FR-ark-101**（MUST）：清理中间/临时文件；不得删除源码、配置、文档、`patches/`、`specs/`、`payload/`、
  依赖目录（`oh_modules/`、`libs/`）与签名材料；清理后 `git status` 不得出现已跟踪文件被删除。
- **FR-ark-102**（MUST）：`AppScope/app.json5` 的 `versionName = "2.1.2"`、`versionCode = 20102`。
- **FR-ark-103**（MUST）：版本号同步 `README.md` / `specs/README.md`；无「当前版本 2.0.26」语义残留（历史锚点除外）。
- **FR-ark-104**（MUST）：新建 `patches/v2.1.2/`，每条补丁满足正向 `--check` 与应用后 `--reverse --check`；
  `patches/v2.0.26/` 原地保留（历史锚点）。
- **FR-ark-105**（MUST）：构建链全绿（含 `smoke-node24` host 门禁），产出签名 HAP。
- **FR-ark-106**（MUST）：真机部署成功：卸载 → 安装 → 启动 → ArkWeb 界面加载非白屏。
- **FR-ark-107**（MUST）：真机测试通过（`test-cases.md`）。
- **FR-ark-108**（MUST）：**敏感信息不落盘**（§6）。
- **FR-ark-109**（SHOULD）：提交按 `git-commit` 技能规范前缀；本地签名配置不入库。

## 5. 验收标准

| # | 标准 | 证据 |
|---|---|---|
| AC-01 | 清理完成且不伤已跟踪文件 | `git status --porcelain` 无 ` D ` 行 |
| AC-02 | 版本号 `2.1.2` / `20102` | `AppScope/app.json5` + HAP `pack.info` |
| AC-03 | 文档无旧版本残留语义 | `grep` 复查记录 |
| AC-04 | `patches/v2.1.2/` 往返可应用 | 逐条 `--check` 记录 |
| AC-05 | 构建链全绿 | 各阶段日志（`logs/20261022-3/`） |
| AC-06 | HAP 签名产出 | `entry-default-signed.hap` 存在 |
| AC-07 | 真机安装启动就绪 | `hdc` 安装输出 + 界面加载 |
| AC-08 | 测试用例全执行 | `TEST_REPORT.md` 每条用例有结论 |
| AC-09 | 敏感信息零落盘 | §6 扫描记录 |
| AC-10 | 提交规范 | `git log` 前缀符合 git-commit 技能 |

## 6. 敏感信息纪律（不落盘）

| 类别 | 纪律 |
|---|---|
| 模型 API Key | 只在**应用 UI 运行时**输入；一切文档写占位符 `<API_KEY>` |
| GIT 账号/密码 | 只在**应用 Git 凭据页运行时**输入；文档写 `<USER>` / `<PASSWORD>`；测试后**删除凭据条目** |
| 内网测试 URL | 可写仓库地址；**不写** URL 内嵌凭证形式 |
| 本地签名配置 | `build-profile.json5` 本地签名 diff 与 `signing.*.local.json` 不入库 |
| 提交前检查 | 暂存区 diff 人工复查 + 敏感串扫描（`logs/20261022-3/`） |
