# tasks.md —— `108-git-plugin` 任务拆解

> 对应 [`spec.md`](./spec.md) / [`plan.md`](./plan.md) ｜ 用例见 [`test-cases.md`](./test-cases.md)
> 状态口径：✅ 完成（有可复现证据）｜🚧 进行中｜⬜ 未开始｜❌ 阻塞
> 证据落点：`logs/<YYYYMMDD>-N/TEST_REPORT.md`、`node scripts/verify-git-plugin.mjs` 输出

## 一、任务清单

| # | 任务 | 落点 | 关联 FR | 依赖 | 状态 |
|---|---|---|---|---|---|
| T108-01 | 移植插件本体（21 工具 + 8 能力模块）到本工程，`PLUGIN_ID`/`RPC_ID` = `oc-ark-git` | `plugins/oc-plugin-git/**` | FR-108-001/002 | — | ✅ |
| T108-02 | 构建期依赖物化（isomorphic-git 1.44.2 + diff 9.0.0）与工程内缓存 | `scripts/collect-plugins.mjs` | FR-108-041/042 | T108-01 | ✅ |
| T108-03 | 物化断言：版本 pin / 传输入口 / 56 包 / ≤ 12 MB / 无原生库 / 无软链 / `.bin` 剔除 | 同上 | FR-108-042/NFR-108-002 | T108-02 | ✅ |
| T108-04 | 载荷投放：插件目录（含 `node_modules`）进 `resfile/opencode/plugins/oc-plugin-git/` 并计入 manifest | `scripts/collect-opencode.mjs` | FR-108-040/041 | T108-02 | ✅ |
| T108-05 | 启动期投放：Node 侧把 `plugins/*` 整棵 copy 到 `$XDG_CONFIG_HOME/opencode/plugin/`（幂等摘要） | `payload/lib/plugins.js` + `payload/opencode-server.js` | FR-108-040/C3 | T108-04 | ✅ |
| T108-06 | 移除 ArkTS 侧单插件投放（改由 Node 负责，避免两套写者） | `entry/src/main/ets/app/OpencodeRuntime.ets` | C3 | T108-05 | ✅ |
| T108-07 | 「设置 → Git」页 UI 补丁（自门控；口令只显示长度） | `patches/v2.0.26/0008-git-credentials-settings.patch` | FR-108-024 | — | ✅（进包，真机走查见 TC-108-20） |
| T108-08 | 宿主侧门禁脚本：语法 + 契约 + 装配冒烟 + 离线闭环 | `scripts/verify-git-plugin.mjs` | FR-108-002/031/NFR-108-005 | T108-01 | ✅ |
| T108-09 | 插件自带单测（凭据/围栏/适配器/渲染）全绿 | `plugins/oc-plugin-git/tests/**` | FR-108-021/012/011 | T108-01 | ✅（34 过 / 2 跳过，跳过项需联网） |
| T108-10 | 21 工具注册 + VCS provider 覆盖 + 凭据 RPC 三条注册线各自容错 | `plugins/oc-plugin-git/index.js` | FR-108-007/033 | T108-01 | ✅ |
| T108-11 | 诊断行（工具数 / provider / 凭据路径 / root） | 同上 | FR-108-033 | T108-10 | ✅ |
| T108-12 | 真机：插件 `active` + 21 工具可见 | 真机 `/api/plugin` + 会话 | FR-108-040/002 | T108-05 | ⬜ |
| T108-13 | 真机：本地仓库全链 init→add→commit→status→log→diff | 真机会话 | FR-108-005 | T108-12 | ⬜ |
| T108-14 | 真机：无账号远端 clone（公开仓库） | 真机会话 | US-108-01 | T108-12 | ⬜ |
| T108-15 | 真机：带账号仓库（凭据 → clone → pull） | 真机会话 + 凭据 RPC | FR-108-020/022 | T108-12 | ⬜ |
| T108-16 | 真机：围栏负例（`..` / 绝对路径越界拒绝） | 真机会话 | FR-108-010/013 | T108-12 | ⬜ |
| T108-17 | 真机：`.git-credentials` 权限 0600 与「口令不回显」 | 真机 `stat` + RPC 输出 | FR-108-020/023 | T108-15 | ⬜ |
| T108-18 | 真机：`revert` fail-closed（工作区分叉时拒绝） | 真机会话 | FR-108-005 | T108-13 | ⬜ |

## 二、执行顺序（依赖链）

```
T108-01 ─┬─ T108-02 ─ T108-03 ─ T108-04 ─ T108-05 ─ T108-06 ─┐
         ├─ T108-08 ─ T108-09                                  ├─ 构建 HAP ─ T108-12 ─┬─ T108-13 ─ T108-18
         └─ T108-10 ─ T108-11                                  │                       ├─ T108-14
T108-07 ─────────────────────────────────────────────────────┘                       ├─ T108-15 ─ T108-17
                                                                                     └─ T108-16
```

## 三、本轮不做（与 spec §1.1「不包含」一致）

- `rebase`（实现无此原语）；`blame` / `grep`；子模块 / worktree / LFS；SSH 传输；SHA-256 仓库。
- 运行时按需安装依赖（L2）：依赖只在构建期物化。
- 任何 `module.json5` 权限声明变更、任何 ArkTS 宿主能力面变更。
