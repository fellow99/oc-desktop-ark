# SPECS_CHECKLIST —— 规格完成度

 > 更新：2026-10-21 · 需求 `110-jitless`（无 JIT 模式）
> 状态口径：✅ Done（已生成并自检） · 🚧 In Progress · ⬜ Pending
> 生成方式：`specs-as-built` 方法（源码/规划为唯一事实源；技术无关的 spec + 技术具体的 plan 成对生成）

## 一、项目级文档（P-01 … P-09）

| # | 文档 | 路径 | 行数 | 状态 |
|---|---|---|---|---|
| P-01 | 目录与文件结构 | [STRUCTURE.md](./STRUCTURE.md) | 121 | ✅ Done |
| P-02 | 技术选型 | [TECH.md](./TECH.md) | 89 | ✅ Done |
| P-03 | 整体架构 | [ARCHITECTURE.md](./ARCHITECTURE.md) | 106 | ✅ Done |
| P-04 | 宪法原则 | [constitution.md](./constitution.md) | 169 | ✅ Done |
| P-05 | 整体规格 | [overall-spec.md](./overall-spec.md) | 111 | ✅ Done |
| P-06 | 整体技术方案 | [overall-plan.md](./overall-plan.md) | 119 | ✅ Done |
| P-07 | 数据模型 | [overall-data-model.md](./overall-data-model.md) | 139 | ✅ Done |
| P-08 | 测试用例索引 | [overall-test-cases.md](./overall-test-cases.md) | 91 | ✅ Done |
| P-09 | 文档索引 | [README.md](./README.md) | — | ✅ Done |
| — | 完成度追踪 | [SPECS_CHECKLIST.md](./SPECS_CHECKLIST.md) | — | ✅ Done |

> 按需求约定：**不生成** `API.md` / `overall-api.md`（接口契约以上游 `/openapi.json` 为准，见 `overall-data-model.md` §5）。

## 二、模块级文档（M-101 … M-109）

| # | 模块 | spec.md | plan.md | 行数（spec/plan） | 状态 |
|---|---|---|---|---|---|
| M-101 | 运行时接入 | [spec](./101-runtime-integration/spec.md) | [plan](./101-runtime-integration/plan.md) | 151 / 135 | ✅ Done |
| M-102 | 载荷流水线 | [spec](./102-payload-pipeline/spec.md) | [plan](./102-payload-pipeline/plan.md) | 158 / 149 | ✅ Done |
| M-103 | ArkWeb 渲染壳 | [spec](./103-arkweb-shell/spec.md) | [plan](./103-arkweb-shell/plan.md) | 160 / 155 | ✅ Done |
| M-104 | 宿主能力 | [spec](./104-host-capabilities/spec.md) | [plan](./104-host-capabilities/plan.md) | 158 / 137 | ✅ Done |
| M-105 | 鉴权与凭据 | [spec](./105-auth/spec.md) | [plan](./105-auth/plan.md) | 158 / 134 | ✅ Done |
| M-106 | 上游适配 | [spec](./106-upstream-adaptation/spec.md) | [plan](./106-upstream-adaptation/plan.md) | 157 / 139 | ✅ Done |
| M-107 | 合规与上架 | [spec](./107-compliance/spec.md) | [plan](./107-compliance/plan.md) | 159 / 160 | ✅ Done |
| M-108 | 版本库插件 | [spec](./108-git-plugin/spec.md) | [plan](./108-git-plugin/plan.md) | 160 / 156 | ✅ Done |
 | M-109 | 回归基线 | [spec](./109-regression/spec.md) | [plan](./109-regression/plan.md) | 151 / 160 | ✅ Done |
 | M-110 | 无 JIT 模式（双形态兼容） | [spec](./110-jitless/spec.md) | [plan](./110-jitless/plan.md) | 167 / 110 | 🚧 In Progress |

 **合计**：10 个模块目录 / **19** 个模块文档（110 另含 tasks/test-cases）+ **9** 个项目级文档。

## 三、自检结果（2026-10-18）

| 检查项 | 方法 | 结果 |
|---|---|---|
| 文件齐全 | `find specs -name '*.md'` | ✅ 9 模块 ×2 + 8 项目级 + README + 本清单 |
| 结构完整 | 每个模块 spec/plan 均 8 个 `##` 章 | ✅ |
| 无占位符 | 扫描 `TODO` / `TBD` / `FIXME` / `[fill in]` | ✅ 0 命中 |
| FR 编号可追溯 | plan 引用的 `FR-1NN-NNN` 均存在于同模块 spec | ✅ |
| 证据可核 | plan 的 `path:line` 指向真实源码 | ✅ 抽样 30+ 条 |
| spec 技术无关 | 抽查 spec 无框架名/文件路径 | ✅（107/108 例外处已用条目 ID 表达） |
| 表格自洽 | 所有 Markdown 表格列数与表头一致 | ✅ |
| 与规划一致 | 包名/版本/端口/补丁编号/ACL 与 `docs/000-工程规划.md` v0.3 对齐 | ✅ |

## 四、未完成 / 后续需求

| 项 | 状态 | 说明 |
|---|---|---|
| `overall-api.md` / `API.md` | ⬜ 按需求排除 | 上游 `/openapi.json` 即契约 |
| 模块 `tasks.md` | ⬜ 未生成 | 本需求为搭建，任务已在 `docs/000-工程规划.md` §11 分阶段给出 |
| 模块 `test-cases.md` | ⬜ 未生成 | 用例索引见 `overall-test-cases.md`（TC-S/H/D/R） |
| 真机验收（TC-D-*） | ⬜ 待设备 | 设备缺席，已在 `overall-test-cases.md` §四登记 |
| 载荷脚本与 host 门禁 | ✅ | `scripts/{verify-runtime,build-opencode,collect-opencode,smoke-node24}` 与 `payload/opencode-server.js` 已落地；2026-10-18 实测：载荷 43 文件 / 62.3 MB，host 门禁全绿 |
