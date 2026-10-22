# TEST_REPORT —— 203-plugin-workspace-picker 真机测试（oc-desktop-ark）

> 需求：`203-plugin-workspace-picker`｜用例：`specs/203-plugin-workspace-picker/test-cases.md`
> 日期：2026-10-22 ｜ 分支：`main`（未改动）｜ 真机：`HAD-W32`（2in1）/ OpenHarmony 系统版本见截图
> 产物：`entry-default-signed.hap` 120,071,704 B（debug，本地签名材料不入库）
> **敏感信息纪律**：DeepSeek key 只作应用内凭据，本文与仓库零落盘；隧道端口/reset token 等运行期信息不记录原值。

## 一、构建与部署

| 步骤 | 结果 | 证据 |
|---|---|---|
| `apply-patches.mjs` | ✅ 5 条（0001/0003/0006/**0007**/0008） | 汇总「已应用 5 / 跳过 0 / 失败 0」 |
| `build-opencode.mjs`（bun 1.4.2 / node24） | ✅ `dist-node/opencode.mjs` 16.4 MB | vite build 通过；`packages/app/dist/_assets/dialog-*.js` 含 `directory-picker-roots` |
| `collect-opencode.mjs --apply` | ✅ 916 文件 / 70.3 MB | 变化项：`assets/app-archive.bin`、`opencode.mjs`、`plugins/oc-plugin-workspace-roots/index.mjs` |
| `assembleHap` | ✅ BUILD SUCCESSFUL | 46 s |
| `hdc install -r` | ✅ install bundle successfully | 装后 `files/config/opencode/plugin/oc-plugin-workspace-roots/.materialize.json` digest 变化（18,624 B，`handleMkdir` ×2） |
| 启动 | ✅ `server.ready.json` 端口就绪 | `/api/info` version 含当日构建戳 `202610220636` |

> 注：`hdc` 在连续调用间偶发 `communication channel is being established`，测试脚本统一用「重试 + 间隔」包裹；本报告的命令均已按该方式执行。

## 二、能力侧 RPC（TC-203-R*，全部实测）

| 用例 | 结果 | 实测输出（脱敏摘要） |
|---|---|---|
| TC-203-R01 插件激活 | ✅ | `/api/plugin` 中 `oc-harmony-workspace-roots` → `state.status=active`，`source.type=local` |
| TC-203-R02 三根解析 | ✅ | `roots`：`sandbox=/data/storage/el2/base/haps/entry/files/workspace (available)`,`documents=/storage/Users/currentUser/Documents (available,needsPermission)`,`download=/storage/Users/currentUser/Download (available,needsPermission)` |
| TC-203-R03 沙箱列举 | ✅ | `browse{sandbox}` → `ok:true`，`entries=[.git, demo110, gitdemo, priv108, website108, vcs-probe.txt]`（含 `.git` ⇒ 隐藏项由 UI 过滤） |
| TC-203-R04 根围栏 | ✅ | `browse{sandbox, sub:'../../'}` → `ok:false, code:out-of-root` |
| TC-203-R05 文档未授权 | ✅ | `browse{documents}` → `ok:false, code:EPERM, message:"EPERM: … scandir '/storage/Users/currentUser/Documents'"` |
| TC-203-R06 权限预检 | ✅ | `permissionCheck{documents}` → `source:bridge, granted:false` + hint（假阴性说明） |
| TC-203-R07 权限申请 | ⚠️ 如实失败 | `permissionRequest{documents}` → 首次实测把信箱泵**永久卡死**（`host bridge: timeout name=perm.request`，此后 `perm.check` 亦 timeout）；修复（10 s 上限）后返回 `code:'timeout'`，泵保持存活（`done id=… ok=true resultBytes=184` + 心跳继续） |
| TC-203-R08/R09/R10/R11 mkdir | ✅ | 正例 `ok:true`；同名 `exists`；`../escape` → `invalid-name`；越界父 → `out-of-root`；无权限根 → `create-failed (EPERM)` |

## 三、界面侧（TC-203-U*，ArkWeb 真机 + `uitest`/`snapshot_display`/`dumpLayout`）

设备上界面元素可经 `uitest dumpLayout` 取到 ArkWeb 文本节点与 bounds，据此定位点击。

| 用例 | 结果 | 证据 |
|---|---|---|
| TC-203-U01 三根 Tab | ✅ | 「打开项目」对话框顶部恰好 3 个 Tab：`沙箱 [550,485][634,532]`、`文档 [637,485][722,532]`、`下载 [725,485][809,532]`；无「桌面」 |
| TC-203-U02 沙箱直接列举 | ✅ | 列表 `demo110 / gitdemo / priv108 / tc203a / website108`；`.git` **未渲染**；无文件行（`vcs-probe.txt` 未出现） |
| TC-203-U03 无手动路径输入 | ✅ | 三根模式下 `directory-picker-path` 块（路径输入 + 建议浮层）整块不渲染；仅底部只读路径行 |
| TC-203-U04 根围栏导航 | ✅ | 根层无「上级/根目录」入口；UI 侧 `navigate()` 前判 `isWithin(activeRoot.path, value)`，服务端再判一次（R05） |
| TC-203-U05 文档无权限 → 两按钮 | ✅ | 点「文档」：**无系统弹窗**、无列表；`dumpLayout` 显示 `尚未获得该位置的访问权限` + 恰好两个按钮 `请求权限 [551,635][685,682]`、`刷新 [687,635][772,682]`；「选择文件夹」禁用、「新建文件夹」禁用 |
| TC-203-U06 请求权限 | ⚠️ 本机不弹窗 | 点「请求权限」→ 按钮进入「加载中」→ 10 s 后如实给出 `尚未获得权限。若系统没有弹出授权窗，请到 设置 › 本应用 › 文件和文件夹 中手动开启，然后点「刷新」。`；**不假装成功**，且宿主桥保持可用（随后 `刷新`/`browse` 正常） |
| TC-203-U07 刷新 | ✅ | 点「刷新」→ 重新 `roots` + `browse` → 仍无权限 ⇒ 保持两按钮态并回到标准原因文案；无报错、无白屏 |
| TC-203-U08 下载（已授权）→ 列表 | ✅ | 点「下载」→ 直接列出 `/storage/Users/currentUser/Download`：`com.dingtalk.hmos.pc/ com.haitai.htbrowser/ com.huawei.hmos.browser/ com.huawei.hmsapp.music/ com.ohos.locationdialog/ com.ss.feishu_pc/ pi203-download/ 未命名文件夹/ BrowserShell&ElectronShell.zip camera-lens-damage-replacement.png …` |
| TC-203-U09 新建文件夹 + 默认名去重 | ✅ | 下载根：默认名「未命名文件夹」→ `创建` → 目录出现且被选中；沙箱：在已选中目录内连建两次，第二次默认名为「未命名文件夹 2」 |
| TC-203-U10/U11 采纳建工作区 | ✅ | 沙箱 → `选择文件夹` → 侧栏新增项目，`/api/project` 出现 `/data/storage/el2/base/haps/entry/files/workspace/未命名文件夹`；下载 → 出现 `/storage/Users/currentUser/Download/未命名文件夹` |
| TC-203-U12 记忆 | ✅（N/A） | 本版不做记忆：重开对话框恒为「沙箱」 |

## 四、端到端（TC-203-E*）

模型：`deepseek` / `deepseek-flash`；会话由应用自身服务端创建，`location` = 上述工作区。

| 用例 | 结果 | 实测回答（摘要） |
|---|---|---|
| E01 沙箱工作区（UI 新建）+ 对话 | ✅ | 问 `7 乘以 8` → `56` |
| E01 沙箱工作区 + 看图分析 | ✅ | 附件为界面截图（经 `POST /api/experimental/fs/write` 写入该工作区）→ 模型答：「图中是 OpenHarmony 桌面环境，中央的 'OC Desktop Ark' 窗口弹出了 '打开项目' 对话框：左侧是 项目/添加项目/设置/帮助 侧边栏，中间列出沙箱、文档、下载三个标签页下的一串包名目录（如 com.dingtalk.hmos.pc、com.huawei.hmos.browser 等），底部显示路径 /storage/Users/currentUser/Download 及 取消/选择文件夹 按钮…」 |
| E02 下载工作区（UI 新建）+ 对话 | ✅ | 问 `2+3` → `5` |
| E02 下载工作区 + 看图分析 | ✅ | 附件 `/storage/Users/currentUser/Download/camera-lens-damage-replacement.png` → 模型正确识别为「相机镜头维修场景实拍照片：左侧拆下的镜头模组前镜片有放射状裂纹，右侧一只完好黑色镜头，前景金属台面有镊子和螺丝刀」 |
| E03 文档工作区 | ⛔ 阻塞 | 文档根未授权（`EPERM`），设备上无法通过 shell 授予（`acm` 不可执行；`aa start …AppInfoAbility` 报 `10107102` 权限不足）⇒ 需人工在系统设置开启后复验；**同一机制已在下载根实测通过** |
| E04 能力不可用回退 | ⬜ 未执行 | 需临时改插件 id 重装；代码路径为自门控（`probeWorkspaceRoots` 返回 `undefined` → 上游对话框原样） |

## 五、门禁

| 项 | 结果 |
|---|---|
| 补丁双向校验 | ✅ `git apply` / `git apply --reverse --check` 均通过；5 条补丁在干净基线按序全绿 |
| 补丁内容边界 | ✅ 仅 6 个文件（`i18n/en.ts`、`i18n/zh.ts`、`selection/dialog.css`、`selection/dialog.tsx`、`selection/roots.ts`、`selection/roots.test.ts`），`packages/protocol` / `packages/server` 零改动；零 `settings.git` 残留 |
| TypeScript | ✅ `packages/app` `tsgo -b` 无错误（注：Windows 上 `src/custom-elements.d.ts` 是软链文本，需临时展开该文件才能跑全量 typecheck，已在测试后还原） |
| ArkTS 编译 | ✅ `assembleHap` 通过 |
| 权限声明面 | ✅ `module.json5` 未改动（`requestPermissions` 仍 6 项，无桌面目录权限） |
| 敏感信息 | ✅ 仓库与日志零真实密钥（DeepSeek key 只在运行时经应用凭据接口输入） |

## 六、未取证清单

| # | 项 | 原因 |
|---|---|---|
| 1 | 「文档」授权后 → 自动显示列表 | 设备上无法脚本授予该权限，需人工在系统设置开启后点「刷新」（功能路径已由「下载」根实测等价验证） |
| 2 | AC-203-10 完整回退 | 需临时改插件 `id` 重装复验 |
| 3 | 真机 UI 层的会话内「看图」按钮（附件选择器） | 上游 `fs.pickFiles` 在本工程为 not-implemented；本轮看图分析经应用自身 `experimental/fs/write` 落盘 + 会话附件完成，等价验证了模型侧图片链路 |

## 七、代码评审后的复验（2026-10-22 第二轮）

评审暴露 4 Critical / 7 Important（详见 `REVIEW_REPORT.md`）。修复后重新构建、重装、重跑：

| 项 | 结果 |
|---|---|
| 补丁可复现 | ✅ 干净基线 `apply-patches` = 5 应用 / 0 跳过 / 0 失败；`git apply --reverse --check` 通过 |
| TypeScript | ✅ `tsgo -b` 无错误 |
| 单测（新增） | ✅ `bun test src/workspaces/selection/` = 55 pass / 0 fail（`roots.test.ts` 14 例 + 上游 domain/picker 用例无回归） |
| 插件冒烟（PC） | ✅ 20/21（唯一 FAIL 因 PC 上 `Documents` 真实存在，断言前提不成立） |
| 重装后 RPC | ✅ `roots` 三根；`browse{sandbox}` 返回 `count/total/truncated`；`mkdir` 空名 → `invalid-name` |
| 重装后 UI | ✅ 三 Tab；文档 → 两按钮；`请求权限` → 可照抄指引（宿主桥仍可用）；下载 → 列表；新建默认名「未命名文件夹 2」（同级去重）；创建后选择行 `/storage/Users/currentUser/Download/未命名文件夹 2/` |
| ArkTS 编译 | ✅ BUILD SUCCESSFUL（含 `withTimeout` 清定时器） |

## 八、设备上的测试残留（不影响仓库）

- 下载根：`未命名文件夹`、`未命名文件夹 2`（本轮 UI 新建验证产生）。
- 沙箱根：`未命名文件夹`（含嵌套 `未命名文件夹`）、`tc203a`、`tc203-shot.jpeg`（看图分析附件）。
- 设备项目列表里有一条乱码路径记录（`/storage/Users/currentUser/Download/δ…`）：本轮早期用 shell 直接拼中文路径调 API 所致；`/api/project` 无删除端点（DELETE 返回 404），无法通过接口清理，留在设备上无害（指向不存在的目录）。后续如需清理，用 UI 的「更多选项」或清应用数据。
