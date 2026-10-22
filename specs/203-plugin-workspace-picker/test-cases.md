# test-cases.md —— `203-plugin-workspace-picker` 测试用例

> 环境：Windows + Git Bash；OHOS CLI tools（`hvigorw` / `hdc`）；真机 2-in-1（OpenHarmony 5.0 / API 12 级同型）。
> 关键路径（`<filesDir>` = `/data/app/el2/100/base/org.fellow99.oc.OCDesktopArk/files`；端口见 `files/payload/server.ready.json`）。
> **敏感信息纪律**：DeepSeek API key 只作应用内输入，本文与所有产物一律用占位符 `<DEEPSEEK_API_KEY>`。

## 一、静态与门禁（TC-203-S*）

| 编号 | 用例 | 步骤 | 期望 |
|---|---|---|---|
| TC-203-S01 | 插件语法与准入 | `node --check plugins/oc-plugin-workspace-roots/index.mjs`；`grep -n "require('node:child_process')\|\\.node'" 插件` | 0 错；零命中 |
| TC-203-S02 | 插件方法表 | `node -e "import('./plugins/oc-plugin-workspace-roots/index.mjs').then(m=>console.log(Object.keys(m.default.setup.toString())))"` 或静态检查 `methods` 键 | 恰好 6 项：`roots` `browse` `permissionCheck` `permissionRequest` `openAppInfo` `mkdir` |
| TC-203-S03 | 补丁双向可校验 | `cd ../opencode && git apply --check ../oc-desktop-ark/patches/v2.0.26/0007-*.patch`（干净基线）；应用后 `git apply --reverse --check` | 双向通过；`0007` 与 `0006`/`0008` 无冲突 |
| TC-203-S04 | 权限声明面未变 | `node scripts/check-acl-surface.mjs` | 通过；`requestPermissions` 仍为 6 项，无 `READ_WRITE_DESKTOP_DIRECTORY` |
| TC-203-S05 | 上游未入库修改 | `cd ../opencode && git status --porcelain`（仅补丁带来的改动，且这些改动来自 patch 文件） | 补丁内容与 patch 文件一致，源码树不入库 |
| TC-203-S06 | 文案禁用词 | 检索新增 i18n 键内容 | 无 `Harmony` / `DeepSeek` / `OpenCode` 指称 |

## 二、构建与部署（TC-203-B*）

| 编号 | 用例 | 步骤 | 期望 |
|---|---|---|---|
| TC-203-B01 | 补丁应用 | `node scripts/apply-patches.mjs` | 4 条补丁全部「applied/skip」且无失败 |
| TC-203-B02 | 上游产物 | `node scripts/build-opencode.mjs`（`OPENCODE_NODE_TARGET=node24`） | 产出 `dist-node/opencode.mjs`；`packages/app` vite build 成功 |
| TC-203-B03 | 载荷收集 | `node scripts/collect-opencode.mjs --apply` | 插件与 `app-archive` 就位；回读/语法校验通过 |
| TC-203-B04 | HAP 构建 | `hvigorw --mode module -p product=default -p buildMode=debug assembleHap` | BUILD SUCCESSFUL |
| TC-203-B05 | 安装与启动 | `hdc install -r entry-default-signed.hap`；`hdc shell aa start -b org.fellow99.oc.OCDesktopArk -a EntryAbility` | `install bundle successfully`；进程存活；服务端就绪 |

## 三、能力侧真机 RPC（TC-203-R*）

> 端口隧道：`PORT=$(hdc shell "cat <filesDir>/payload/server.ready.json" | ...)`；`hdc fport tcp:18400 tcp:$PORT`（建/用写进同一条命令）。

| 编号 | 用例 | 步骤 | 期望 |
|---|---|---|---|
| TC-203-R01 | 插件激活 | `curl -s http://127.0.0.1:18400/api/plugin` | `oc-harmony-workspace-roots` 为 `active`（非 `failed`），日志含 `registered (roots, browse, permissionCheck, permissionRequest, openAppInfo, mkdir)` |
| TC-203-R02 | 三根解析 | `POST /api/rpc/oc-harmony-workspace-roots/roots` `{"input":{}}` | `roots` 三根：`sandbox` 必 `available:true`（`<filesDir>/workspace`）；`documents`/`download` 路径为 `/storage/Users/currentUser/*`；hilog 有 3 行 `workspace-root` |
| TC-203-R03 | 沙箱列举 | `browse {"input":{"id":"sandbox"}}` | `ok:true`，`entries` 为目录列表 |
| TC-203-R04 | 根围栏 | `browse {"input":{"id":"sandbox","sub":"../../"}}` | `ok:false`，`code:"out-of-root"` |
| TC-203-R05 | 文档未授权列举 | `browse {"input":{"id":"documents"}}`（先撤销授权） | `ok:false`，`code:"EACCES"`（或 bridge 失败归因） |
| TC-203-R06 | 权限预检 | `permissionCheck {"input":{"id":"documents"}}` | `source:"bridge"`；未授权 `granted:false` 且带 `hint` |
| TC-203-R07 | 权限申请 | `permissionRequest {"input":{"id":"documents"}}` | 返回结果码（`0`/`-1`/`2`）与 `granted`；真机弹窗出现（若该 runtime 支持） |
| TC-203-R08 | 建目录（正例） | `mkdir {"input":{"id":"sandbox","parent":"<sandbox>","name":"tc203"}}` | `ok:true`，`path` = `<sandbox>/tc203`；磁盘存在 |
| TC-203-R09 | 建目录（同名） | 重复 R08 | `ok:false`，`code:"exists"` |
| TC-203-R10 | 建目录（非法名） | `name:"../x"`、`name:"."`、`name:""` | `code:"invalid-name"` |
| TC-203-R11 | 建目录（越界父） | `parent:"/storage/Users/currentUser"` + `id:"sandbox"` | `code:"out-of-root"` |

## 四、界面侧真机交互（TC-203-U*）

| 编号 | 用例 | 步骤 | 期望 |
|---|---|---|---|
| TC-203-U01 | 三根 Tab | 打开「选择工作区」对话框 | 顶部 3 个 Tab：沙箱/文档/下载；无「桌面」；默认沙箱选中 |
| TC-203-U02 | 沙箱直接列举 | 观察树 | 列出 `<filesDir>/workspace` 的直接子目录（无文件行、无 `.` 前缀行） |
| TC-203-U03 | 无手动路径输入 | 检查对话框 | 无路径输入框、无建议浮层 |
| TC-203-U04 | 根围栏导航 | 在根层点「上级」/面包屑越过根 | 视图不变、无报错 |
| TC-203-U05 | 文档无权限 → 两按钮 | 撤销文档授权后点「文档」 | 无系统弹窗；无列表；恰好 2 个按钮「请求权限」「刷新」+ 原因文案 |
| TC-203-U06 | 请求权限 → 列表 | 点「请求权限」并同意 | 列表自动出现，可进入子目录并选中 |
| TC-203-U07 | 刷新 → 列表 | 在系统设置里打开开关后点「刷新」 | 列表出现（无需重开对话框） |
| TC-203-U08 | 拒绝后状态 | 点「请求权限」并拒绝 | 仍为两按钮态 + 可读原因，不静默、不假装成功 |
| TC-203-U09 | 新建文件夹 | 点「新建文件夹」 | 默认名「未命名文件夹」；再建一次为「未命名文件夹 2」 |
| TC-203-U10 | 创建后选中 | 提交创建 | 新目录出现在树中且为选中态；「打开」回传其绝对路径 |
| TC-203-U11 | 采纳建工作区 | 选中沙箱子目录 → 「打开」 | 工作区创建成功，根为该绝对路径 |

## 五、端到端（TC-203-E*）

| 编号 | 用例 | 步骤 | 期望 |
|---|---|---|---|
| TC-203-E01 | 沙箱工作区 + 对话 + 看图 | 沙箱新目录建工作区 → 设置 DeepSeek key（`<DEEPSEEK_API_KEY>`）→ 模型 `deepseek-flash` → 一次文本对话 → 发一张图片做看图分析 | 三次交互均成功返回；看图分析有内容 |
| TC-203-E02 | 文档工作区 + 对话 + 看图 | 授权文档 → 文档下新目录建工作区 → 同 E01 | 同上 |
| TC-203-E03 | 下载工作区 + 对话 + 看图 | 授权下载 → 下载下新目录建工作区 → 同 E01 | 同上 |
| TC-203-E04 | 能力不可用回退 | 重命名为不可加载（或临时改 `definition.id`）后重开对话框 | 无 Tab、无权限门；上游路径输入照常（完整回退，无半残） |

## 六、结果记录

逐条把「通过 / 失败 / 未取证」与证据（命令输出、截图、hilog 片段）写入 `logs/<YYYYMMDD>-N/TEST_REPORT.md`；未取证项必须显式标注 ⬜，不得以「应该可行」代替。
