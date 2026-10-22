# DEV_CHECKLIST —— 203-plugin-workspace-picker（oc-desktop-ark）

> 需求：`203-plugin-workspace-picker` ｜ 分支：`main`（**未改动**，需求要求「不改动分支」）
> 规格：`specs/203-plugin-workspace-picker/` ｜ 日期：2026-10-22 ｜ 环境：Windows + Git Bash；CLT 6.1.1.300；真机 `HAD-W32`（2in1）
> 敏感信息纪律：DeepSeek API key 只作运行时输入，**零落盘**（本目录与仓库无真实密钥）；设备上已存在的凭据由应用凭据库管理。

## 一、开工前的现状核对

| # | 事实 | 证据 |
|---|---|---|
| 1 | 本工程**已有**壳侧插件 `plugins/oc-plugin-workspace-roots/index.mjs`（roots/browse/permissionCheck/permissionRequest/openAppInfo 五方法），真机已验证 | `logs/20261021-2/TEST_REPORT.md` TC-110-27 |
| 2 | 缺的是**界面半**：`patches/v2.0.26/` 只有 0001/0003/0006/0008，无 0007 | `ls patches/v2.0.26` |
| 3 | `docs/ACL配置.md` §3 已把「三根 + 两按钮」定为用户契约（但写的是早期 `api/cwd/browse` 设想） | `docs/ACL配置.md:44-62` |
| 4 | 上游 `packages/app` 由本工程补丁机制改动，`build-opencode` 会重跑 `packages/app` 的 vite build 并内嵌 `app-archive.bin` | `packages/cli/script/build-app-assets.ts`（`apps/cli/script/app-assets.ts`） |

## 二、实现清单（按落点）

| # | 落点 | 改动 | 状态 |
|---|---|---|---|
| 1 | `plugins/oc-plugin-workspace-roots/index.mjs` | 新增 `mkdir` RPC（根围栏 + 单段名校验 + exists 判定）；`permissionRequest` 透传 `timeout` 并给出 `code:'timeout'`；注册日志加 mkdir | ✅ |
| 2 | `patches/v2.0.26/0007-workspace-roots-picker.patch`（新增） | 三根 Tab、权限门（两按钮）、新建文件夹、根围栏、browse 列举、自门控回退；`i18n/{en,zh}` 19 个键 | ✅ |
| 3 | `entry/src/main/ets/host/HostCapabilities.ets` | `permRequest` 加 10 s 上限 + `withTimeout`，超时如实返回 `timeout:true`（**修复：申请会把信箱泵永久卡死**） | ✅ |
| 4 | `specs/203-plugin-workspace-picker/{spec,plan,tasks,test-cases}.md` | 四件套 | ✅ |
| 5 | `specs/README.md` | 新增「五之二、业务功能（201–299）」+ 203 行 + 编号表 | ✅ |
| 6 | `docs/ACL配置.md` | §3 补「能力走插件 RPC」与两按钮/超时口径 | ✅ |
| 7 | `logs/20261022-2/{DEV_CHECKLIST,TEST_REPORT,REVIEW_REPORT}.md` | 过程产物 | ✅ |

**不做**：不改 ArkTS 权限声明；不加「桌面」根；不做主目录记忆（需求未要求）；不改 `packages/protocol` / `packages/server`。

## 三、构建链（实际执行）

```bash
cd oc-desktop-ark
node scripts/apply-patches.mjs                                  # 5 条补丁（0001/0003/0006/0007/0008）
BUN_BIN=<bun-1.4.2> OPENCODE_NODE_TARGET=node24 \
  node scripts/build-opencode.mjs --skip-install                # → packages/cli/dist-node/opencode.mjs（含新 UI）
node scripts/collect-opencode.mjs --apply                       # → resfile/opencode（916 文件 / 70.3 MB）
cmd //c "<CLT>/bin/hvigorw.bat assembleHap --mode module -p product=default -p buildMode=debug --no-daemon"
hdc install -r entry/build/default/outputs/default/entry-default-signed.hap
```

要点：
- 本机 `bun` 为 1.3.14，上游 `script/build-node.ts` 硬要求 `^1.4.2` ⇒ 必须用 `BUN_BIN` 指向 `bun-1.4.2.exe`（已在 `docs/000-工程规划.md` §102 登记）。
- 补丁序号必须让 `0007` 排在任何会修改 `i18n/*.ts` 的补丁**之前**或用**互不重叠的锚点**：本轮曾出现「先把 0008 的部分改动混进 0007」导致的上下文冲突，最终以「只对 5 个文件 `git diff`」的生成方式定稿，`git apply` 与 `--reverse --check` 双向通过。

## 四、真机暴露并修复的缺陷

| # | 症状 | 根因 | 修复 |
|---|---|---|---|
| D1 | 点「请求权限」后，**整个宿主能力面永久失效**（之后连 `perm.check` 都 `timeout`），只有重启应用才恢复 | 设备上「文件和文件夹」权限**不弹窗也不回调**，`requestPermissionsFromUser` 的 Promise 永不 resolve；文件信箱是**串行**派发 | `HostCapabilities.permRequest` 加 10 s 竞争超时，返回 `timeout:true`；插件透传 `code:'timeout'`；UI 给出「去 设置 › 本应用 › 文件和文件夹 开启后点刷新」的可照抄指引 |
| D2 | UI 曾把 `文档` 的失败只用「尚未获得该位置的访问权限」概括，用户不知道该去哪 | 归因文案过粗 | 申请未换来可读时改用 `dialog.directory.roots.requestHint`（含设置路径与「刷新」） |

## 五、遗留 / 待人工确认

- ⬜ `文档` 根「授权后 → 显示列表」的转换：本机 shell 无法授予该权限（`acm` 不可执行、`aa start` 设置页能力被拒），需人工在系统设置里开启后点「刷新」复验；同一机制已在 `下载` 根实测通过（该根此前已授权）。
- ⬜ AC-203-10「能力不可用 → 完整回退」未做真机反例（需临时改插件 id 重装）；代码路径为自门控（`probeWorkspaceRoots` 返回 undefined）。
