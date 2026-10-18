# 规格文档索引（`oc-desktop-ark/specs`）

**项目名称：** OC Desktop Ark（`oc-desktop-ark`）
**版本：** 2.0.26（`versionCode 20026`）
**技术栈：** ArkTS / ArkWeb · `@fellow99/node-bridge`（Node v24.2.0）· opencode v2.0.26 · `node:sqlite`
**生成方式：** `specs-as-built`（以源码与规划为事实源；技术无关的 `spec.md` + 技术具体的 `plan.md` 成对）
**最后更新：** 2026-10-18

---

## 一、文档总览

| 层级 | 分类 | 文档数量 | 说明 |
|------|------|---------|------|
| 整体 | 项目级顶层文档 | 6 | STRUCTURE / TECH / ARCHITECTURE / constitution / SPECS_CHECKLIST / README |
| 整体 | 整体规格文档 | 4 | overall-spec / overall-plan / overall-data-model / overall-test-cases |
| 模块 | 运行时与服务（101–103） | 6 | 接入、载荷、渲染壳 |
| 模块 | 能力与适配（104–106） | 6 | 宿主能力、鉴权、上游适配 |
| 模块 | 治理与质量（107–109） | 6 | 合规、版本库插件、回归 |
| **合计** | **9 目录 / 18 模块文档 + 10 顶层文档** | | |

> 按需求约定：**不生成** `API.md` / `overall-api.md`。

---

## 二、项目级顶层文档

| 文档 | 路径 | 说明 |
|------|------|------|
| **方案总纲** | [ARCHITECTURE.md](./ARCHITECTURE.md) | 分层、进程模型、启动时序、失败模式、部署拓扑 |
| **技术选型** | [TECH.md](./TECH.md) | 版本矩阵、明确不引入的技术、质量门 |
| **宪法原则** | [constitution.md](./constitution.md) | C1–C6 原则、D1–D6 纪律、S1–S7 安全边界、质量门 |
| **项目结构** | [STRUCTURE.md](./STRUCTURE.md) | 目录树（现状/规划）、入口清单、产物清单 |
| **检查清单** | [SPECS_CHECKLIST.md](./SPECS_CHECKLIST.md) | 完成度与自检结果 |

### 整体规格文档

| 文档 | 路径 | 说明 |
|------|------|------|
| **整体规格** | [overall-spec.md](./overall-spec.md) | 技术无关的系统能力与 FR（RUNTIME/SERVICE/UI/AUTH/HOST/UPSTREAM/COMPLIANCE/VCS） |
| **整体方案** | [overall-plan.md](./overall-plan.md) | 技术上下文、宪法合规、实现约定、横切关注点、测试与部署 |
| **数据模型** | [overall-data-model.md](./overall-data-model.md) | Connection / ServerReady / PayloadPlan / RuntimeState / HostCapability / 权限 / 产物 |
| **测试用例索引** | [overall-test-cases.md](./overall-test-cases.md) | TC-S（静态）/ TC-H（host）/ TC-D（设备）/ TC-R（回归） |

---

## 三、运行时与服务（101–103）

### 101 — 运行时接入（Runtime Integration）

> 把 bridge 投进应用进程，编排「凭据 → 载荷 → 投递 → 就绪 → 加载」五阶段，并把失败变成可截图的文字。

| 文档 | 链接 | 说明 |
|------|------|------|
| 功能规格 | [101-runtime-integration/spec.md](./101-runtime-integration/spec.md) | 启动阶段、就绪判据、单实例、崩溃语义 |
| 技术方案 | [101-runtime-integration/plan.md](./101-runtime-integration/plan.md) | `NodeRuntime.start` 契约、marker、日志过滤、阶段机 |

### 102 — 载荷流水线（Payload Pipeline）

> 上游补丁 → `bun` → `build-node --bundle-only` → 裁剪 → `resfile` 投放 → SHA-256 清单 → host 门禁。

| 文档 | 链接 | 说明 |
|------|------|------|
| 功能规格 | [102-payload-pipeline/spec.md](./102-payload-pipeline/spec.md) | 载荷形态、完整性、可复现构建 |
| 技术方案 | [102-payload-pipeline/plan.md](./102-payload-pipeline/plan.md) | 脚本契约、基线守卫、裁剪规则、体积预算 |

### 103 — ArkWeb 渲染壳（ArkWeb Shell）

> 应用内加载页 → 同源加载本机 UI → 失败页/诊断；导航围栏与历史清理。

| 文档 | 链接 | 说明 |
|------|------|------|
| 功能规格 | [103-arkweb-shell/spec.md](./103-arkweb-shell/spec.md) | 渲染通道、必备开关、失败可见、外链 |
| 技术方案 | [103-arkweb-shell/plan.md](./103-arkweb-shell/plan.md) | `Web` 组件配置、`onPageEnd`/`onError`、探针 P0-D/P0-E |

---

## 四、能力与适配（104–106）

### 104 — 宿主能力（Host Capabilities）

> 权限 / 目录选择 / 外链 / 通知经 `HostBridge` 暴露；未注册必须显式拒绝。

| 文档 | 链接 | 说明 |
|------|------|------|
| 功能规格 | [104-host-capabilities/spec.md](./104-host-capabilities/spec.md) | 7 项能力冻结命名、失败语义、每次启动重新授权 |
| 技术方案 | [104-host-capabilities/plan.md](./104-host-capabilities/plan.md) | `HostBridge.register`、`fileShare`、`startAbility` |

### 105 — 鉴权与凭据（Auth）

> 口令持久化 + `?auth_token=` 首屏 + 配对 Cookie 备选；日志一律脱敏。

| 文档 | 链接 | 说明 |
|------|------|------|
| 功能规格 | [105-auth/spec.md](./105-auth/spec.md) | 口令必填、跨启动稳定、首屏免输入、错口令可见 |
| 技术方案 | [105-auth/plan.md](./105-auth/plan.md) | `entry.tsx:81`、`api.ts:5`、`auth.ts`、`connection.json`、`redactUrl()` |

### 106 — 上游适配（Upstream Adaptation）

> 幂等补丁（0001/0003/0006）、`node24` 目标、`ohos` 条件、PTY 打桩、`node:sqlite` 零补丁。

| 文档 | 链接 | 说明 |
|------|------|------|
| 功能规格 | [106-upstream-adaptation/spec.md](./106-upstream-adaptation/spec.md) | 基线锁定、幂等、补丁最小化、产物可加载 |
| 技术方案 | [106-upstream-adaptation/plan.md](./106-upstream-adaptation/plan.md) | 逐个 hunk、`apply-patches.mjs`、ABI 137、P0-J |

---

## 五、治理与质量（107–109）

### 107 — 合规与上架（Compliance）

> G1–G11、ACL 三项、声明面=使用面、审核材料口径。

| 文档 | 链接 | 说明 |
|------|------|------|
| 功能规格 | [107-compliance/spec.md](./107-compliance/spec.md) | 合规条目与判定方式 |
| 技术方案 | [107-compliance/plan.md](./107-compliance/plan.md) | 三个校验脚本、HAP 解析、反向用例 |

### 108 — 版本库插件（Git Plugin）

> 纯 JS 版本库能力（不依赖系统 git / 原生模块 / 子进程）。

| 文档 | 链接 | 说明 |
|------|------|------|
| 功能规格 | [108-git-plugin/spec.md](./108-git-plugin/spec.md) | 工具表、凭据、VCS 覆盖、插件落点、L1 |
| 技术方案 | [108-git-plugin/plan.md](./108-git-plugin/plan.md) | 引擎版本、RPC id、物化投放、hmdfs 风险 |

### 109 — 回归基线（Regression）

> 回归四件套、触发条件、证据留存、四通道取证。

| 文档 | 链接 | 说明 |
|------|------|------|
| 功能规格 | [109-regression/spec.md](./109-regression/spec.md) | 四件套与阈值、结论四态 |
| 技术方案 | [109-regression/plan.md](./109-regression/plan.md) | `regress.mjs` 子命令、指纹触发、追加式记录 |

---

## 六、模块编号一览

| 编号 | 模块名 | 英文名 | 分类 |
|------|--------|--------|------|
| 101 | 运行时接入 | runtime-integration | 运行时与服务 |
| 102 | 载荷流水线 | payload-pipeline | 运行时与服务 |
| 103 | ArkWeb 渲染壳 | arkweb-shell | 运行时与服务 |
| 104 | 宿主能力 | host-capabilities | 能力与适配 |
| 105 | 鉴权与凭据 | auth | 能力与适配 |
| 106 | 上游适配 | upstream-adaptation | 能力与适配 |
| 107 | 合规与上架 | compliance | 治理与质量 |
| 108 | 版本库插件 | git-plugin | 治理与质量 |
| 109 | 回归基线 | regression | 治理与质量 |

> 编号跳号规则：新增模块**追加**，不回填；`1NN` 与 `docs/000-工程规划.md` §14.2 保持一致。

---

## 七、模块文档结构规范

| 文件 | 说明 |
|------|------|
| `spec.md` | 8 章：概述 / 用户故事 / 功能需求（FR-NNN-NNN + RFC2119）/ 关键实体 / 验收场景 / 非功能 / 假设约束 / 依赖。**技术无关**。 |
| `plan.md` | 8 章：技术上下文 / 宪法合规 / 研究结论（引规划 §与源码 path:line）/ 数据模型 / 接口契约 / 实现策略 / 测试考虑 / 文件清单。**技术具体**。 |

可选扩展（本需求未生成）：`tasks.md`、`api.md`、`data-model.md`、`pages.md`、`test-cases.md`。

---

## 八、快速导航

| 目标读者 | 推荐顺序 |
|---------|---------|
| **新加入开发者** | constitution → STRUCTURE → overall-spec → 101 spec → 103 spec |
| **架构师** | ARCHITECTURE → TECH → overall-plan → 106 plan |
| **ArkTS 开发** | 101/103/104/105 的 spec+plan → `entry/src/main/ets/**` |
| **Node/构建开发** | 102/106 的 spec+plan → `payload/**`、`scripts/**`、`patches/**` |
| **测试 / QA** | overall-test-cases → 109 spec+plan → 107（合规验收） |
| **产品/合规** | overall-spec → 107 spec（G1–G11 与材料口径） |

---

**文档维护者：** OC Desktop Ark 开发团队
