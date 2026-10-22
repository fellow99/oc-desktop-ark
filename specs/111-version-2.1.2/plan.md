# 111 — 版本更新：2.1.2 技术方案

> **回引:** `specs/111-version-2.1.2/spec.md` ｜ **模块:** release ｜ **最后更新:** 2026-10-22
> **上游基线:** opencode `v2.1.2`（`a517687fde`）｜ **运行期:** 进程内 Node v24.2.0 + ArkWeb

## 1. 决策

| # | 决策 | 依据 | 回引 |
|---|---|---|---|
| D1 | 版本规则沿用 `major*10000 + minor*100 + patch` → `2.1.2` = **20102** | 与 `oc-desktop-hos` 对齐（`AppScope/app.json5` 注释） | FR-ark-102 |
| D2 | 清理**显式枚举清单**；保留 `oh_modules/`、`libs/`（bridge HAR）、`entry/libs/arm64-v8a/`（libnode.so 投放物）、`entry/build` 之外一律不动源码 | `git clean` 会误删运行时投放物（≈121 MB 重建成本高） | FR-ark-101 |
| D3 | 补丁迁移：逐条 `git apply --check`；通过→复制入 `patches/v2.1.2/`；失败→按 v2.1.2 源码重生成；`patches/v2.0.26/` 原地保留 | `apply-patches.mjs` 头注「换基线必须重生成补丁并新建 patches/<新tag>/」 | FR-ark-104 |
| D4 | `apply-patches.mjs` 更新两处：`patchDir` → `patches/v2.1.2`、`EXPECTED` 默认 → `a517687fde`；`build-opencode.mjs` / `collect-opencode.mjs` 中如有基线引用同步改 | spec U3 | FR-ark-105 |
| D5 | 构建工具链用环境变量覆盖：`HVIGORW=/d/oh-workspace/command-line-tools/bin/hvigorw.bat`、`DEVECO_SDK_HOME` 指向本机 SDK | spec U4（脚本默认 `command-line-tools-6` 不存在） | FR-ark-105 |
| D6 | 测试凭证零落盘；GIT 凭据测试后删除 | spec §6 | FR-ark-108 |
| D7 | 同一时刻只有一个版别处于「已打补丁」状态：本工程补丁应用→构建→收集完成后，opencode 工作树按需复位（由补丁器幂等守卫保证） | 父工程 README「责任分界」 | FR-ark-104 |

## 2. 步骤

| 步 | 动作 | 命令 / 落点 | 出口判据 |
|---|---|---|---|
| S0 | 记录基线 | `hdc list targets`、`git -C ../opencode describe --tags` | 写入 `logs/20261022-3/` |
| S1 | 清理中间/临时产物 | §3 清单 | AC-01 |
| S2 | 版本号 | `AppScope/app.json5` → `2.1.2`/`20102`；`README.md`、`specs/README.md` 同步 | AC-02/03 |
| S3 | 补丁器基线更新 | `scripts/apply-patches.mjs` 两处（D4） | `--check` 自洽 |
| S4 | 补丁迁移 | 逐条评估 → `patches/v2.1.2/` + README | AC-04 |
| S5 | 运行时接入与锁值校验 | `ohpm install`（双包，`oh-package.json5` 钉死）→ `node scripts/verify-runtime.mjs`（幂等） | `oh_modules/@fellow99/node-runtime` 的 `libnode.so` SHA = `runtime.lock.json` 锁值 |
| S6 | opencode 产物 | `node scripts/apply-patches.mjs` → `node scripts/build-opencode.mjs` → `node scripts/collect-opencode.mjs` | resfile 就绪 |
| S7 | host 门禁 | `node scripts/smoke-node24.mjs --allow-version-drift` | 全绿 |
| S8 | HAP 构建 | `hvigorw assembleHap --mode module -p product=default -p buildMode=debug --no-daemon`（D5 环境变量） | AC-06 |
| S9 | 部署 | `hdc uninstall org.fellow99.oc.OCDesktopArk` → `app install -r` → `aa start` | AC-07 |
| S10 | 真机测试 | `test-cases.md` | AC-08 |
| S11 | 代码评审 | `requesting-code-review` + `receiving-code-review` | REVIEW_REPORT |
| S12 | 敏感信息扫描 + 提交 | spec §6 + `git-commit` 规范前缀 | AC-09/10 |

## 3. 清理清单（D2）

**删除（构建产物与临时文件；删除前逐条断言命中 `.gitignore`）**

| 类别 | 路径 |
|---|---|
| hvigor 生成物 | `entry/build/`、`.hvigor/`、`entry/oh_modulesTest/`（如存在） |
| 构建暂存 | `.stage/`（如存在） |
| resfile 投放物 | `entry/src/main/resources/resfile/opencode/`（构建脚本会重新投放） |
| 临时日志 | 工程根散落 `*.log`（不含 `docs/`、`logs/` 内文档） |

**保留**：`oh_modules/`、`libs/`（bridge HAR）、`entry/libs/arm64-v8a/`（libnode/libc++_shared 投放物）、
`.cache/`、`signing.*.local.json*`、`.idea/`、`logs/` 历史证据。

## 4. 风险

| # | 风险 | 缓解 |
|---|---|---|
| R1 | 0007/0008 落点（workspaces/settings）上游大幅演进 | 以 v2.1.2 源码重生成；重生成后跑 `verify-git-plugin.mjs` 与插件自检 |
| R2 | 上游 v2.1 breaking 改动导致 bundle 或冒烟失败 | 冒烟门禁前移暴露；必要时回报用户（「冲突即终止」） |
| R3 | bun 版本不满足 ^1.4.2（本机 1.3.14） | 仿 hos 的 `.cache/bun/bun-1.4.2.exe` 机制（构建脚本自带解析/下载） |
| R4 | 凭证落盘 | D6 占位纪律 + S12 扫描 |
