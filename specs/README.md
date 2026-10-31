# specs/ —— OC Desktop · HarmonyOS Edition 规格索引

> **工程：** `oc-desktop-ark`（进程内 Node 24.2 + ArkWeb，无 Electron/Chromium）
> **版本：** 2.2.5 / `versionCode 20205`
> **上游基线：** opencode **v2.2.5**（`9bbb8ce18c` / `Branch_v2.2.5`）
> **方法：** `specs-as-built` —— 以源码、构建产物与真机证据为事实源。
> **父规范：** [`../../specs/constitution.md`](../../specs/constitution.md)、[`../../specs/011-version-2.2.5/`](../../specs/011-version-2.2.5/)、[`../../specs/013-branding/`](../../specs/013-branding/)。
> **最后更新：** 2026-11-01（按父宪法重排：版本 → `011`、品牌 → `013`、Git → `204`）

---

## 一、文档总览

| 层级 | 分类 | 文档数量 | 说明 |
|---|---|---|---|
| 公共 | `011` 版本更新 | 2 个版本四件套 | v2.1.2 / v2.2.5 |
| 公共 | `013` 品牌化 | 2（gap record） | 当前未实现，见目录 |
| 整体 | 项目级顶层 | 10 | README / STRUCTURE / TECH / ARCHITECTURE / constitution / checklist / overall-* |
| 基础 | `101–110` | 18（9 模块 × spec+plan） | 运行时、载荷、渲染、宿主、鉴权、上游、合规、回归、jitless |
| 插件 | `203–204` | 8 | 工作区选择、Git |
| **合计** | **14 个模块目录 + 10 顶层文档** | | 以实际目录为准 |

> 按需求约定：**不生成** `API.md` / `overall-api.md`；API 契约以上游 `/api/*` 为准。

---

## 二、项目级顶层文档

| 文档 | 路径 | 说明 |
|---|---|---|
| 方案总纲 | [ARCHITECTURE.md](./ARCHITECTURE.md) | 分层、进程模型、启动时序、失败模式 |
| 技术选型 | [TECH.md](./TECH.md) | 版本矩阵、明确不引入的技术、质量门 |
| 宪法原则 | [constitution.md](./constitution.md) | C1–C6、D1–D6、S1–S7 |
| 项目结构 | [STRUCTURE.md](./STRUCTURE.md) | 目录树、入口、产物 |
| 检查清单 | [SPECS_CHECKLIST.md](./SPECS_CHECKLIST.md) | 完成度与自检 |
| 整体规格 | [overall-spec.md](./overall-spec.md) | 技术无关能力与 FR |
| 整体方案 | [overall-plan.md](./overall-plan.md) | 技术上下文、实现、横切、测试 |
| 数据模型 | [overall-data-model.md](./overall-data-model.md) | Connection / Runtime / Payload / 权限 |
| 测试索引 | [overall-test-cases.md](./overall-test-cases.md) | TC-S / TC-H / TC-D / TC-R |

---

## 三、公共模块（`0XX`）

### 011 — 版本更新（Version）

| 版本 | 目录 | 文档 | 状态 |
|---|---|---|---|
| v2.1.2 | [011-version-2.1.2/](./011-version-2.1.2/) | spec / plan / tasks / test-cases | ✅ 历史锚点 |
| v2.2.5 | [011-version-2.2.5/](./011-version-2.2.5/) | spec / plan / tasks / test-cases | ✅ 当前；真机待补 `⬜` |

### 013 — 品牌化（Branding）

> **当前缺口**：壳层有 `OC Desktop Ark` 文案，但 Web UI 归档 `<title>` 仍为 `OpenCode`；无品牌补丁/脚本/守卫。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [013-branding/spec.md](./013-branding/spec.md) | 目标、当前缺口、验收 |
| 技术方案 | [013-branding/plan.md](./013-branding/plan.md) | 源码证据、补齐方案、风险 |

> **012-building-workflow：鸿蒙工程暂无**云端 tag 发布；本工程构建见 [`102-payload-pipeline`](./102-payload-pipeline/)。

---

## 四、基础功能模块（`1XX`）

### 101 — 运行时接入（Runtime Integration）

> bridge 投递、五阶段编排、就绪判据、单实例、崩溃终态。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [101-runtime-integration/spec.md](./101-runtime-integration/spec.md) | 启动阶段、就绪、崩溃 |
| 技术方案 | [101-runtime-integration/plan.md](./101-runtime-integration/plan.md) | `NodeRuntime.start`、marker、日志 |

### 102 — 载荷流水线（Payload Pipeline）

> 补丁 → bun → bundle-only → 裁剪 → resfile/ tar.gz → SHA-256 → host 门禁。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [102-payload-pipeline/spec.md](./102-payload-pipeline/spec.md) | 载荷形态、完整性、可复现 |
| 技术方案 | [102-payload-pipeline/plan.md](./102-payload-pipeline/plan.md) | 脚本契约、裁剪、体积 |

### 103 — ArkWeb 渲染壳（ArkWeb Shell）

> 加载页 → 同源 UI → 失败页/诊断；导航围栏与历史清理。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [103-arkweb-shell/spec.md](./103-arkweb-shell/spec.md) | 渲染、开关、失败可见、外链 |
| 技术方案 | [103-arkweb-shell/plan.md](./103-arkweb-shell/plan.md) | `Web` 组件、`onPageEnd`/`onError` |

### 104 — 宿主能力（Host Capabilities）

> 权限 / 目录选择 / 外链 / 通知经 `HostBridge` 暴露；未注册必须显式拒绝。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [104-host-capabilities/spec.md](./104-host-capabilities/spec.md) | 能力表、失败语义、授权 |
| 技术方案 | [104-host-capabilities/plan.md](./104-host-capabilities/plan.md) | `HostBridge.register`、`fileShare` |

### 105 — 鉴权与凭据（Auth）

> 口令持久化 + `?auth_token=` 首屏 + 配对 Cookie 备选；日志脱敏。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [105-auth/spec.md](./105-auth/spec.md) | 口令、首屏、错口令、安全 |
| 技术方案 | [105-auth/plan.md](./105-auth/plan.md) | `entry.tsx`、`api.ts`、`auth.ts` |

### 106 — 上游适配（Upstream Adaptation）

> 幂等补丁、`node24` 目标、`ohos` 条件、PTY 打桩、`node:sqlite` 零补丁。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [106-upstream-adaptation/spec.md](./106-upstream-adaptation/spec.md) | 基线、幂等、最小补丁 |
| 技术方案 | [106-upstream-adaptation/plan.md](./106-upstream-adaptation/plan.md) | hunk、`apply-patches`、ABI |

### 107 — 合规与上架（Compliance）

> G1–G11、ACL 三项、声明面=使用面、审核材料口径。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [107-compliance/spec.md](./107-compliance/spec.md) | 合规条目与判定 |
| 技术方案 | [107-compliance/plan.md](./107-compliance/plan.md) | 校验脚本、HAP 解析、反向用例 |

### 109 — 回归基线（Regression）

> 回归四件套、触发条件、证据留存、四通道取证。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [109-regression/spec.md](./109-regression/spec.md) | 指标、阈值、四态结论 |
| 技术方案 | [109-regression/plan.md](./109-regression/plan.md) | `regress.mjs`、指纹触发 |

### 110 — 无 JIT 双形态（Jitless）

> 编译期双形态、`--jitless` + 纯 JS fetch/photon shim + wasm 降级；默认 compat。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [110-jitless/spec.md](./110-jitless/spec.md) | 双形态、降级、判据 |
| 技术方案 | [110-jitless/plan.md](./110-jitless/plan.md) | shim、守卫、构建 |
| 任务清单 | [110-jitless/tasks.md](./110-jitless/tasks.md) | 落地任务 |
| 测试用例 | [110-jitless/test-cases.md](./110-jitless/test-cases.md) | TC-110-* |

---

## 五、补丁 / 插件模块（`2XX`）

### 203 — 工作区选择器（Workspace Picker）

> 三根（沙箱/文档/下载）切换、逐级浏览、mkdir、权限门；插件 RPC + 补丁 0007。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [203-plugin-workspace-picker/spec.md](./203-plugin-workspace-picker/spec.md) | 三根、围栏、权限、回退 |
| 技术方案 | [203-plugin-workspace-picker/plan.md](./203-plugin-workspace-picker/plan.md) | RPC、补丁、状态机 |
| 任务清单 | [203-plugin-workspace-picker/tasks.md](./203-plugin-workspace-picker/tasks.md) | T1–T6 |
| 测试用例 | [203-plugin-workspace-picker/test-cases.md](./203-plugin-workspace-picker/test-cases.md) | TC-203-* |

### 204 — Git 插件（Git Plugin）

> 从原 `108-git-plugin` 迁移；isomorphic-git，21 个工具 + VCS 覆盖 + 凭据页。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [204-plugin-git/spec.md](./204-plugin-git/spec.md) | 工具表、凭据、VCS、L1 |
| 技术方案 | [204-plugin-git/plan.md](./204-plugin-git/plan.md) | 引擎、RPC、物化、hmdfs 风险 |
| 任务清单 | [204-plugin-git/tasks.md](./204-plugin-git/tasks.md) | 落地任务 |
| 测试用例 | [204-plugin-git/test-cases.md](./204-plugin-git/test-cases.md) | 插件用例 |

---

## 六、编号迁移表

| 旧编号 | 新编号 | 说明 |
|---|---|---|
| `101-version-*` | `011-version-*` | 公共版本模块 |
| `108-git-plugin` | `204-plugin-git` | Git 插件 → 2XX |
| `111-version-2.1.2` / `112-version-2.2.5` | `011-version-*` | 历史版本目录统一 |

> `012-building-workflow` 在鸿蒙工程暂无；`103-branding` 已迁移为 `013-branding`。

---

## 七、编写约定

1. `spec.md` 与 `plan.md` 成对；`spec.md` 技术无关，`plan.md` 技术具体。
2. FR 编号 `FR-<模块编号>-<三位序号>`；模块编号取目录三位编号。
3. 证据标记：`✅ 实测` / `🔶 沿用` / `⬜ 待验证` / `⚠️ 冲突`；不把推断当实测。
4. 上游基线统一写 `opencode v2.2.5（Branch_v2.2.5）`；历史结论在 `011-version-*` 保留。
5. 规格中不写真实凭据；示例用 `<DEEPSEEK_API_KEY>` / `***`。
6. 新增模块按父宪法编号规则追加；不回填、不复用。

---

## 八、快速导航

| 目标读者 | 推荐顺序 |
|---|---|
| 新加入开发者 | `../../specs/constitution.md` → `101-runtime-integration` → `103-arkweb-shell` |
| ArkTS 开发 | `101` / `103` / `104` / `105` 的 spec+plan → `entry/src/main/ets/**` |
| Node/构建 | `102-payload-pipeline` → `106-upstream-adaptation` → `payload/**`、`scripts/**` |
| 插件 | `203-plugin-workspace-picker` → `204-plugin-git` |
| 测试/合规 | `109-regression` → `107-compliance` → `011-version-2.2.5` |
