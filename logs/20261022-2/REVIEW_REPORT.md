# REVIEW_REPORT —— 203-plugin-workspace-picker（oc-desktop-ark）

> 评审方式：`requesting-code-review`（派独立 reviewer 子代理，只读）→ `receiving-code-review`（逐条对代码事实核验后处置）
> 评审对象：`0007` 补丁（6 文件）、插件 `index.mjs`、ArkTS `HostCapabilities.ets`
> 日期：2026-10-22 ｜ 结论：**4 Critical 全部修复并复验**，Important 7 项中 7 项已修，Minor 7 项中 4 项已修、3 项记录

## 一、Critical（全部已修）

| # | 评审意见 | 核验 | 处置 |
|---|---|---|---|
| C1 | `0007` 补丁里混入了 0008 的 `settings.git.*` i18n 块，与 0008 上下文冲突，`apply-patches` 会失败 | ✅ 属实（`grep settings.git` 命中）：生成补丁时工作树里已应用 0008，`git diff` 把它的 i18n 改动一并带出 | 用「index 快照」法重新生成：先在干净基线只应用 0001/0003/0006/0008 并 `git add -A`，再覆盖本需求的 6 个文件后 `git diff` ⇒ 补丁只含本需求变更。复验：干净树上 5 条补丁 **5/0/0** 全绿，`--reverse --check` 通过 |
| C2 | 主目录「不可用」分支内容区全空白（无原因、无刷新） | ✅ 属实：`selectRoot` 只置 `access="unavailable"`，未置 `error`，两个 `<Show>` 都跳过 | `selectRoot` 不可用分支补 `setError(true)` + 用插件 `reason` 作原因文案；`刷新` 按钮由 `gated()` 统一渲染 |
| C3 | 沙箱根自动创建（FR-203-004）未实现，删掉 `<HOME>/workspace` 后默认 Tab 变不可用 | ✅ 属实：`handleRoots` 只 `statSync` | `handleRoots` 对**沙箱**根 `mkdirSync(recursive)`（用户目录绝不创建）；冒烟用例 `sandbox auto-create` 通过 |
| C4 | `browse` 回调没有「代」保护，晚到的结果会把权限门改成 granted，两个按钮消失 | ✅ 属实：`loads.schedule` 只在发起前判 `activeTreeNavigation` | 回调里固定 `owner`/`token`，`!activeTreeNavigation(token, navigation)` 直接丢弃结果；并加 `owner === rootId()` 双保险 |

## 二、Important（7/7 已修）

| # | 意见 | 处置 |
|---|---|---|
| I5 | 一个 `access` 信号同时表达「根可达」与「某子目录列举失败」 | 只有**根层**（`key === ""`）列举能改写可达性；子目录失败只走通用错误，不影响 `新建文件夹` 可用性 |
| I6 | 新建后树的选中未更新；`setSelected` 口径与上游不一致 | 选中值改为「绝对路径 + 尾斜杠」（对齐 `domain.selectedTreePath` 的目录约定）；真机复验：创建后选择行显示 `/…/未命名文件夹 2/` |
| I7 | 500 项截断静默丢条目（NFR-203-002） | 插件 `listDir` 返回 `total`/`truncated`（先算总数再截断）；`roots.ts` 透传；UI 在有截断时就地提示 `该目录条目过多，这里只列出前 500 项` |
| I8 | `newFolderErrors[code] ?? message ?? …` 会漏出未翻译的服务端文本、空消息会被当成「无错误」 | 改为 `newFolderErrors[code] \|\| 通用「创建失败」`，**不再展示服务端 message**（原始 `EACCES/EPERM` 与中文都只在控制台） |
| I9 | 宿主桥失败被当成「用户拒绝/请求无效」，UI 也不看 `bridgeUnavailable` | 插件区分 `code:'bridge'` + `bridgeUnavailable:true`；UI 按 `bridgeUnavailable` 选 `roots.bridgeUnavailable` 文案，否则给 `roots.requestHint` |
| I10 | 根围栏纯函数没有单测 | 新增 `roots.test.ts`（14 用例：`/a/b` vs `/a/bc`、尾斜杠、`..`、根为 `/`、默认名序列、隐藏项、自门控三态）；`bun test src/workspaces/selection/` **55 pass / 0 fail**（含上游 domain/picker 用例，无回归） |
| I11 | `isWithin` 在根为 `/` 时恒判否 | `prefix = base.endsWith("/") ? base : base + "/"`；单测覆盖 `isWithin("/", "/a") === true` |

## 三、Minor

| # | 意见 | 处置 |
|---|---|---|
| M12 | `withTimeout` 定时器不清理 | `.finally` 里 `clearTimeout`（保留 `work` 先胜时不留唤醒） |
| M13 | 死代码：`USER_ROOT_IDS`、`openAppPermissionSettings`、`RootSet.home/userHome` | 删除前两者；`home/userHome` 保留（插件诊断输出的契约字段，`asRootSet` 解析它；UI 不读，已在 spec §4 注明「诊断用」）。插件 `permissionCheck` 保留：它是能力面的一部分，测试用例 TC-203-R06 直接调用 |
| M14 | `mkdir` 的 `existsSync` + `mkdirSync` 有 TOCTOU，`EEXIST` 被映射成 `create-failed` | 改为直接 `mkdirSync(dest,{recursive:false})`，`EEXIST → exists` |
| M17 | 申请返回后用的是「当前 Tab」而不是「发起时的 Tab」 | `requestRootPermission` 先固定 `const id = rootId()`，之后 `selectRoot(id)` |
| M15 | 围栏是**词法**包含性判定，不是真实路径（symlink 可绕过） | **不采纳**：本平台无 `symlink`（规划 §8.4 / A4 已登记），且根路径由插件解析、UI 不可注入。已在 `spec.md` §8 如实披露为「UI + 插件层围栏，非内核沙箱」 |
| M16 | `permissionRequest` 在拒绝/超时时仍 `ok:true`，`code:'timeout'` 不在文档集合内 | 部分采纳：`code` 集合已在 spec §4 补上 `timeout`/`bridge`；`ok` 语义保留为「调用本身是否被宿主拒绝」（与 `roots`/`browse` 的 `ok` 含义不同，已在 spec 注明） |
| M18 | roots effect 与 `selectRoot` 可能各导航一次 | **不采纳**：`navigation` 递增让后发者胜，重复一次 RPC 无副作用；改动会增加状态耦合。已在 spec §7 记录为已知行为 |

## 四、复验（修复后）

| 项 | 结果 |
|---|---|
| 补丁可复现 | ✅ 干净基线 5 条补丁 5/0/0；`--reverse --check` 通过；补丁只含 6 个文件、零 `settings.git` 残留 |
| TypeScript | ✅ `tsgo -b` 无错误 |
| 单测 | ✅ `bun test src/workspaces/selection/` 55 pass / 0 fail |
| 插件冒烟（PC） | ✅ 20/21（唯一 FAIL 是 PC 上 `Documents` 真实存在，断言前提不成立，非缺陷） |
| 真机（重装后） | ✅ `roots` 三根；`browse{sandbox}` 返回 `total/truncated`；`mkdir` 空名 `invalid-name`；UI：三 Tab、文档两按钮、`请求权限`→可照抄指引、下载列表、新建默认名去重「未命名文件夹 2」+ 创建后选择行为 `/…/未命名文件夹 2/` |
| ArkTS 编译 | ✅ `assembleHap` BUILD SUCCESSFUL |

## 五、未处理的已知项（非阻塞）

1. **树内选中高亮**：`@pierre/trees` 的公开 API 没有「按路径设置选中」的方法，`setSelected` 只驱动选择结果与「打开」回传值；真机上表现为「选择行/回传值正确，树内行高亮不由我们驱动」。已记入 spec §7。
2. **能力不可用回退（AC-203-10）** 与 **文档根授权后列表演示** 需人工复验（见 TEST_REPORT §六）。
