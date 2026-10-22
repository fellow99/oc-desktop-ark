# tasks.md —— `203-plugin-workspace-picker` 任务清单

> 依赖顺序执行；每条给出可判读的完成判据。`[PC]` 本机可验证，`[构建]` 需工具链，`[D]` 需真机。
> 敏感信息（DeepSeek API key 等）只作运行时输入，**不落盘任何文件**。

## T1 能力半：插件补 `mkdir` `[PC]`

- [x] T1.1 `definition.methods` 增加 `mkdir`（带 `input`/`output` JSON Schema；`events: {}` 保持不变）
- [x] T1.2 新增 `handleMkdir({ id, parent, name })`：根围栏 + 单段名校验 + `exists` 判定 + `mkdirSync`，全部结构化返回、不抛错
- [x] T1.3 `context.rpc.register` 的 handlers 接线 `mkdir`
- [x] **判据**：`node --check plugins/oc-plugin-workspace-roots/index.mjs` 为 0 错；方法表恰好 6 项；静态断言（无 `.node` / 无 `child_process`）通过

## T2 界面半：上游补丁 `patches/v2.0.26/0007-workspace-roots-picker.patch` `[PC]`

- [x] T2.1 `roots.ts`：常量（`ROOTS_RPC_ID`/`ROOT_IDS`/`USER_ROOT_IDS`）、纯函数（`relativeFromRoot`/`isWithin`/`filterHiddenEntries`/`defaultFolderName`）、RPC 封装（`probeWorkspaceRoots`/`browseRoot`/`mkdirInRoot`/`requestDirectoryPermission`），全部不抛错
- [x] T2.2 `dialog.tsx`：三根 Tab（`role="tablist"`，`data-root-id`）；`rootsMode` 自门控
- [x] T2.3 `dialog.tsx`：三根模式下 `load()` 改走 `browse`（服务端根围栏），隐藏路径输入块，`navigate`/`resolve` 前加根围栏
- [x] T2.4 `dialog.tsx`：权限门 —— 无权限时**不渲染树**，显示「请求权限」「刷新」两按钮 + 原因；请求权限后以一次真实列举为判据
- [x] T2.5 `dialog.tsx`：新建文件夹（默认名去重 → `mkdir` → 重列 → 选中）
- [x] T2.6 `dialog.css` + `i18n/{en,zh}.ts`：样式与中英文案键
- [x] **判据**：`git apply --check` 与 `git apply --reverse --check` 双向通过；`bun run build`（`packages/app`）成功

## T3 文档与索引 `[PC]`

- [x] T3.1 `specs/203-plugin-workspace-picker/{spec,plan,tasks,test-cases}.md`
- [x] T3.2 `specs/README.md`：模块索引与编号表加 `203`
- [x] T3.3 `docs/ACL配置.md` §3：补「实际能力走插件 RPC」与两按钮落点
- [x] **判据**：链接可达、编号不冲突

## T4 构建与部署 `[构建]`

- [x] T4.1 `node scripts/apply-patches.mjs`（4 条补丁全部生效）
- [x] T4.2 `node scripts/build-opencode.mjs`（含 `packages/app` 的 vite build）
- [x] T4.3 `node scripts/collect-opencode.mjs --apply`
- [x] T4.4 `hvigorw ... assembleHap` + `hdc install -r`
- [x] **判据**：BUILD SUCCESSFUL；安装成功；启动后服务端就绪

## T5 真机验证 `[D]`

- [x] T5.1 RPC：`roots` / `browse{sandbox}` / `browse{documents}` / `permissionCheck{documents}` / `mkdir`
- [x] T5.2 UI：三根 Tab 可见；沙箱直接列举
- [x] T5.3 UI：文档/下载无权限 → 两按钮（无列表）；请求权限 → 列表；刷新 → 重判
- [x] T5.4 UI：新建文件夹（默认名 + 去重 + 选中）
- [x] T5.5 端到端：沙箱 / 文档 / 下载各建工作区并各一次对话（含看图分析）
- [x] **判据**：验收场景 AC-203-01…11 逐条有结论，证据落 `logs/<date>-N/TEST_REPORT.md`

## T6 代码评审 `[PC]`

- [x] T6.1 `requesting-code-review`：分 Critical / Important / Minor 出报告
- [x] T6.2 `receiving-code-review`：逐条核对代码事实，修复 Critical + Important，记录驳回理由（如有）
- [x] **判据**：`REVIEW_REPORT.md` 无未处理 Critical

## T7 代码评审复验（2026-10-22）

- 4 Critical 全部修复：补丁去污染（5/0/0 可复现）、不可用主目录显示原因+刷新、沙箱根自动创建、browse 回调加代次/归属保护。
- 7 Important 全部修复；Minor 4 项修复、3 项记录理由（见 `logs/20261022-2/REVIEW_REPORT.md`）。
- 复验：补丁双向校验、`tsgo -b`、`bun test src/workspaces/selection/`（55 pass）、插件冒烟、真机重装后 UI 回归。
