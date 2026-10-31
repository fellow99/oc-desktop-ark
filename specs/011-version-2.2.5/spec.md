# 011 — 版本更新：2.2.5 功能规格（ark）

> **Module:** 011-version-2.2.5 ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-31
> **需求编号:** 011-version-2.2.5 ｜ **需求名称:** 版本更新：2.2.5
> **git 分支:** 不改动（沿用 `main`）
> **涉及工程:** `oc-desktop-ark`（父工程 `D:\opencode-workspace\`）
> **上游基线:** opencode **v2.2.5**（tag `v2.2.5` / 提交 `9bbb8ce18c` / 分支 `Branch_v2.2.5`）
> **运行期:** 进程内 Node v24.2.0（@fellow99/node-bridge，ABI 137）+ ArkWeb；默认 jitless compat 形态
> **前序规格:** `specs/011-version-2.1.2/`

## 1. 目的

把 `oc-desktop-ark` 上游基线从 `v2.1.2`（`a517687fde`）推进到 **`v2.2.5`**（`9bbb8ce18c`），
版本固化为 **`2.2.5` / `versionCode 20205`**；清理中间/临时文件，补丁集迁移到 `patches/v2.2.5/`，
重新构建并通过 host 门禁。

## 2. 范围

**In scope**

- 中间/临时文件清理（显式清单，见 plan）。
- 版本号 `2.2.5` / `20205`（`AppScope/app.json5`、README、文档）。
- 补丁迁移（5 条）：
  - 原样复用：0001 / 0006（`--check` 通过）。
  - **重生成**：0003（package.json 导出图漂移）、0007（workspaces/selection 重构）、0008（settings 重排重锚）。
- 守卫更新：`scripts/apply-patches.mjs` 的 `patchDir=patches/v2.2.5`、`EXPECTED=9bbb8ce18c`；
  `scripts/collect-opencode.mjs` 的 `BASELINE=9bbb8ce18c`；相关注释中的 v2.1.2 锚点。
- bun：上游 `packageManager=1.4.4`，以 `BUN_BIN` 指向 1.4.4（与 hos 共用 `.cache` 或本地下载）。
- 重新构建：`apply-patches` → `build-opencode`（OPENCODE_NODE_TARGET=node24）→ `collect-plugins` → `collect-opencode --apply` → `smoke-node24` → hvigorw `assembleHap`。
- jitless 双形态（110 规格）：collect-opencode 的 photon 守卫注入需在新 bundle 上仍锚点唯一，构建期校验。
- 敏感信息不落盘。

**Out of scope**

- 不直接编辑上游入库；只经 `patches/`。不改分支。
- **鸿蒙真机测试跳过（无设备）**；host 门禁为替代证据。
- PTY 仍打桩；不做插件在线安装、MCP stdio。
- Web UI 品牌化沿用现状（ark 无品牌化补丁，能力清单 W-04 已登记，不在本版本新增）。

## 3. 上游漂移评估（对本工程）

| # | 事实 | 影响 |
|---|---|---|
| U1 | 区间 1117 提交；v2.2.0 UI 改版、`@opencode/ai` 重构 | ark 不直接 import `@opencode/ai`；同源 Web UI 跟随 |
| U2 | 内置 `bash→shell` 改名 | ark **无 shell 插件、走上游内置工具**：升级后模型看到的工具名为 `shell`（上游保留 `bash` 别名，旧调用自动改写）；smoke 若断言工具名需同步 |
| U3 | v2.2.4 持久终端重构 | 0003 的 ohos 桩按新 `pty-binding.ts` 复核；`available=false` 不变 |
| U4 | workspaces/selection 重构、settings 重排 | 0007/0008 重生成；ark 选择器为三根（沙箱/文档/下载，无桌面），语义不变 |
| U5 | photon/image：图片生成实验默认不影响；图片分析链路保留 | jitless photon 替身（110）需在新 bundle 重新锚定 |
| U6 | bun 1.4.4 | 构建期使用 1.4.4 |

## 4. 需求条目

- **FR-ver-101**（MUST）：清理不伤已跟踪文件（`git status` 无 ` D `）。
- **FR-ver-102**（MUST）：`AppScope/app.json5` = `2.2.5` / `20205`。
- **FR-ver-103**（MUST）：README/文档版本同步，无「当前版本 2.1.2」残留（历史锚点除外）。
- **FR-ver-104**（MUST）：`patches/v2.2.5/` 5 条补丁双向 `--check` 通过；`patches/v2.1.2/` 保留。
- **FR-ver-105**（MUST）：构建链全绿（apply-patches 守卫、build/collect、jitless 守卫、smoke-node24、assembleHap）。
- **FR-ver-106/107**（SKIP-本轮）：真机部署/测试 —— 无设备，标注跳过；host 门禁替代。
- **FR-ver-108**（MUST）：敏感信息不落盘。
- **FR-ver-109**（SHOULD）：Conventional Commits 前缀提交；本地 tag `v2.2.5`，不 push。

## 5. 验收标准

| # | 标准 | 证据 |
|---|---|---|
| AC-01 | 清理不伤跟踪文件 | `git status` 无 ` D ` |
| AC-02 | 版本 2.2.5/20205 | app.json5 + HAP pack.info |
| AC-03 | 文档无旧版残留 | grep 记录 |
| AC-04 | 补丁双向可应用 | 逐条 check 记录 |
| AC-05 | 构建链全绿 | 日志 |
| AC-06 | HAP 产出（未签名亦可，无签名材料时验证编译） | assembleHap 输出 |
| AC-07 | host 门禁全绿（含 jitless photon 锚点、verify-runtime、verify-git-plugin） | 脚本输出 |
| AC-08 | 敏感信息零落盘 + opencode 树恢复干净 | 扫描记录 |
| AC-09 | 提交规范 + 本地 tag | git log / git tag |

## 6. 敏感信息纪律

同 hos 规格 §6：Key/账号/密码一律运行时输入、文档占位 `<API_KEY>`/`<USER>`/`<PASSWORD>`；签名本地文件不入库；提交前暂存区复查 + 全库扫描。
