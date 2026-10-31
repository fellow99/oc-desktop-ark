# 013 — 品牌化（HarmonyOS Ark Edition）功能规格（gap record）

> **Module:** 013-branding ｜ **Status:** Not Implemented（gap） ｜ **Last Updated:** 2026-11-01
> **应用:** OC Desktop Ark / `org.fellow99.oc.OCDesktopArk`
> **上游基线:** opencode v2.2.5（`9bbb8ce18c`）
> **父规格:** [`../../specs/013-branding/spec.md`](../../specs/013-branding/spec.md)（父工程公共品牌化）
> **源码证据:** `entry/src/main/resources/resfile/opencode/assets/app-archive.bin` 解包实测 `<title>OpenCode`、`OC Desktop` 0 处；`patches/v2.2.5/` 无品牌化补丁；`scripts/` 无 `branding`/`verify-branding` 脚本；壳层 `AppScope`/`EntryAbility` 资源显示 `OC Desktop Ark`。

## 1. 模块概述

### 1.1 目的

定义 Ark 版品牌化应达到的目标，并**如实记录当前缺口**：壳层已有 `OC Desktop Ark` 文案，但上游 Web UI 仍暴露 `OpenCode` 品牌。

### 1.2 当前问题

- `app-archive.bin` 内 `index.html` 的 `<title>` 仍为 `OpenCode`；
- `OC Desktop` 在归档中 0 处，PWA manifest/favicon/字标仍可能是上游品牌；
- 没有品牌化补丁、构建期变换或品牌守卫；
- 与父宪法“Web UI 标题 MUST 以 OC Desktop 开头”不符。

### 1.3 范围

**包含**：Web UI title/manifest/字标、应用显示名、图标、加载页/关于页、非官方声明、品牌守卫。

**当前不包含（因为未实现）**：补丁与脚本落地；本文件只记录缺口、验收目标与补齐计划。

## 2. 用户故事

- 作为鸿蒙用户，我希望 Web UI 标题显示 `OC Desktop`，而不是 `OpenCode`。
- 作为合规评审者，我希望能用一条命令确认 Ark 版品牌没有回退。
- 作为维护者，我希望在升级上游后能发现品牌漂移，而不是靠人工打开页面看。

## 3. 功能需求（目标）

- **FR-013-001**：应用显示名 MUST 为 `OC Desktop`（当前资源为 `OC Desktop Ark`，需产品确认是否保留版别后缀）。
- **FR-013-002**：Web UI 首页 `<title>` MUST 以 `OC Desktop` 开头。
- **FR-013-003**：PWA manifest、favicon、字标 MUST 使用 OC Desktop 物料；MUST NOT 以 `OpenCode` 作为主标识。
- **FR-013-004**：应用图标 MUST 来自父工程 `assets/` 或确定性派生物料。
- **FR-013-005**：加载页/关于页 MUST 含非官方声明与第三方许可指引。
- **FR-013-006**：品牌化 MUST 通过幂等补丁或构建期变换实现；MUST NOT 长期 fork 上游 UI。
- **FR-013-007**：品牌守卫 MUST 在构建/冒烟阶段运行；失败 MUST 阻断发布。
- **FR-013-008**：在上游升级后 MUST 重跑守卫并记录结果。

## 4. 关键实体

| 实体 | 当前值 | 目标 |
|---|---|---|
| 应用显示名 | `OC Desktop Ark` | `OC Desktop`（待产品确认） |
| Web UI title | `OpenCode` | `OC Desktop` |
| 图标 | 壳层图标/加载页 | 父工程物料派生 |
| 品牌守卫 | 无 | `verify-branding.mjs` 等价 |
| 非官方声明 | 壳层加载页有部分文案 | 关于页/许可完整 |

## 5. 验收场景（目标）

### 场景 1：Web UI 标题

- Given Ark 版启动并加载 UI
- When 读取 `document.title` 或解包 `app-archive.bin`
- Then 以 `OC Desktop` 开头

### 场景 2：品牌守卫

- Given 仓库
- When 执行品牌守卫
- Then 通过；若 title 回退到 `OpenCode` 则失败

### 场景 3：非官方声明

- Given 关于页/加载页
- When 查看
- Then 可见非官方声明与许可入口

### 场景 4：当前缺口（as-built）

- Given 当前 v2.2.5 归档
- When 解包检查
- Then `<title>=OpenCode`、`OC Desktop` 0 处；本规格必须标 `❌`，不得标 ✅

## 6. 非功能需求

- 品牌化不显著增加包体；
- 补丁/脚本可幂等重跑；
- 不引入未校验的网络物料。

## 7. 假设与约束

- Ark 载荷优先从 `resfile/opencode/` 只读直读；品牌化必须在构建期改归档或在运行时变换，需与 `102-artifact-bootstrap` 协调。
- 上游 `index.html`/manifest 位置随版本可能变化；补丁需按 tag 重建。
- 壳层 `OC Desktop Ark` 是否保留后缀需产品确认 `[NEEDS CLARIFICATION]`。

## 8. 依赖

- 父工程 `assets/` 与 `013-branding`；
- `102-artifact-bootstrap`（载荷投放）；
- `106-upstream-adaptation`（补丁）；
- `109-regression`（升级后回归）。
