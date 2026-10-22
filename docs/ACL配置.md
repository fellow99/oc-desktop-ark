# ACL 与权限配置（`org.fellow99.oc.OCDesktopArk`）

> **口径**：与 `pi-desktop-ark/docs/ACL配置.md` **同源**（基准：`pi-desktop-hos/docs/ACL申请清单.md`），但**载荷不同**——本工程跑的是 `opencode.mjs serve`（Hono + `node:http` 服务端 + `node:sqlite`），**没有 Next.js / SWC**。
> 落点：`entry/src/main/module.json5`（单一模块应用，声明面集中在 entry）。
> **规划**：`docs/000-工程规划.md` 是摘要与验收判据；**本文给完整明细与判据**。

## 1. 声明面（目标 = 调整后的代码事实）

| 项 | 内容 | 与 pi 的关系 |
| --- | --- | --- |
| `requestPermissions` | **6 项**：`INTERNET`、`GET_NETWORK_INFO`、`KEEP_BACKGROUND_RUNNING`、`kernel.ALLOW_WRITABLE_CODE_MEMORY`、`READ_WRITE_DOCUMENTS_DIRECTORY`、`READ_WRITE_DOWNLOAD_DIRECTORY` | 比 pi（21 项）少，因为本工程**没有 `web_engine`（ArkWeb 走 `Web` 组件自带权限）与 electron 那批声明**；文档/下载保留，桌面/剪贴板撤销 |
| 其中带 `reason` + `usedScene` | **2 项**（文档 / 下载；`EntryAbility` / `inuse`） | 文案取自 `resources/base/element/string.json` |
| `definePermissions` | **仅** `kernel.ALLOW_WRITABLE_CODE_MEMORY` | ✅ 受限权限两处成对出现（requestPermissions 声明 + definePermissions 定义）；`LOCK_WINDOW_CURSOR` 本工程用不到（无 electron 窗口锁定需求） |
| Ability 后台模式 | `EntryAbility.backgroundModes = ["taskKeeping"]` | ✅ 一致 |
| `launchType` | `singleton` | 端口随机 + 数据目录唯一的前提 |

### 1.1 ACL（受限权限，需按本包名申请）：现役 **1 项**

| # | 权限 | 用途 | 判定 |
| --- | --- | --- | --- |
| 1 | `ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY` | 进程内 Node/V8 的 JIT（**无它 V8 走 JIT 即 SIGTRAP**，属应用级失败） | `system_basic` + `provisionEnable=true` ⇒ 需 ACL |

> 探针实测（库文档 §D.8，[fellow99/ohos-node-bridge](https://github.com/fellow99/ohos-node-bridge)，与 pi 同源）：声明 `kernel.EXEMPT_ANONYMYOUS_EXECUTABLE_MEMORY` 等**开放权限不能替代**第 1 项——仍 SIGTRAP。故第 1 项是**刚性前置**。
> 为什么必须是它：本工程的 `opencode.mjs` 依赖 **JIT 编译**（V8 Sparkplug/Maglev/TurboFan）跑整条服务端 + 工具链；jitless 解释器下不仅慢 7–10×，还会触发两道 WASM/fetch 硬门（见 `ACL-无ACL评估.md` §4）。

### 1.2 撤销的 2 项 ACL（本轮定稿，均不再出现在 `module.json5`）

| 权限 | 等级 | 撤销依据 |
| --- | --- | --- |
| `ohos.permission.READ_PASTEBOARD` | `system_basic` + `user_grant` ⇒ 需 ACL | 页面粘贴由 **ArkWeb 自己**读剪贴板：应用侧 0 处 `@ohos.pasteboard` 调用，前端只用 DOM `paste` 事件；真机该权限 `grantStatus=-1`（从未授予）时 Ctrl+V 仍能粘贴（pi 同源实测 REV-5） |
| `ohos.permission.READ_WRITE_DESKTOP_DIRECTORY` | `system_basic` + `user_grant` ⇒ 需 ACL | 桌面目录只是「工作区选择器」的一个根；本版选择器**只保留「沙箱 / 文档 / 下载」三根**，不含桌面（见 §3）⇒ 不申请只少一个 Tab |

> 撤销后**装机不再受那两条 ACL 约束**（历史 `code:9568289` 的触发点只剩 JIT 一项）。

## 2. 保留的 2 项「用户目录」权限（normal 级，**不需 ACL**）

| 权限 | 等级 | 用途 |
| --- | --- | --- |
| `ohos.permission.READ_WRITE_DOCUMENTS_DIRECTORY` | `normal` + `user_grant` | 工作区选择器「文档」根：`/storage/Users/currentUser/Documents`。点「文档」Tab 时经 `perm.request` 弹授权窗，授予后列举 |
| `ohos.permission.READ_WRITE_DOWNLOAD_DIRECTORY` | `normal` + `user_grant` | 「下载」根：`/storage/Users/currentUser/Download`。同上 |

> 这两项是 `user_grant`：**装完不会自动授予**，需运行期请求一次（§3.2 的选择器交互）。`normal` 级 ⇒ **不需要 ACL、不需要写进 Profile**，与 JIT 那条 ACL 完全分属两个面。

## 3. 工作区选择器的三根与权限模型

> 落点：工作区选择对话框（对标 `oc-desktop-hos` 补丁 0007，但根清单与权限交互按本版调整）。

| 根 | `id` | 路径 | 授权 | 点击 Tab 行为 |
| --- | --- | --- | --- | --- |
| 沙箱 | `sandbox` | `<filesDir>/workspace` | 无（应用自有沙箱，天然可读写） | 直接列目录 |
| 文档 | `documents` | `/storage/Users/currentUser/Documents` | `READ_WRITE_DOCUMENTS_DIRECTORY`（user_grant） | **不主动请求**；有权限→列表；无权限→`请求权限`+`刷新` 两按钮 |
| 下载 | `download` | `/storage/Users/currentUser/Download` | `READ_WRITE_DOWNLOAD_DIRECTORY`（user_grant） | 同上 |

**交互契约（用户明确需求，区别于 hos 的「点 Tab 即自动请求」模型）**：
- 点「文档」「下载」Tab **不触发权限请求**；
- 有权限 ⇒ 显示目录列表；
- 无权限 ⇒ **不显示列表**，改显示两个按钮：
  - `请求权限`：点击才发起 `perm.request`（`requestPermissionsFromUser`）；
  - `刷新`：重新 `perm.check` 判断权限并重渲染（列表或两按钮）。

**实现落点（2026-10-22 起，需求 `203-plugin-workspace-picker`）**：
- 能力面走**壳专用插件 RPC**：`POST /api/rpc/oc-harmony-workspace-roots/{roots,browse,permissionCheck,permissionRequest,openAppInfo,mkdir}`
  （早先设想的 `api/cwd/browse?root=…` HTTP 端点**未采用**，目录枚举也走 `browse`，由服务端做根围栏）。
- 界面面走上游幂等补丁 `patches/v2.0.26/0007-workspace-roots-picker.patch`（三根 Tab / 权限门两按钮 / 新建文件夹）。
- **判据是列举**：权限是否生效以 `browse` 是否成功为准，不只信 `perm.check`（已知假阴性）。
- ⚠️ 真机实测（2026-10-22）：本 runtime 的 `requestPermissionsFromUser` 对这两项权限**可能既不弹窗也不回调**。
  因此 `perm.request` 侧加了 10 s 上限并如实返回 `timeout:true`（否则会把文件信箱的**串行**派发泵永久卡死，
  连 `perm.check` 都失效，只能重启应用）；UI 相应给出「去 设置 › 本应用 › 文件和文件夹 手动开启后点刷新」的可照抄指引。

> 桌面（`desktop`）本版**不作为根**：它属 `system_basic` + 必须 ACL（§1.2 已撤销）⇒ 不留一个永远打不开的 Tab。外部任意目录可留待 `fs.pickFolder`（系统选择器，URI、仅本会话）后续接线，不在本版。

## 4. 装机与授权：判据与复验步骤

### 4.1 装机判据（Profile 与声明面必须一致）

**声明面 ≠ 授权面**：安装时的授权校验以**签名 Profile** 为准（pi 同源实测 §2.1）。因此：
- **只申请 1 条 ACL（JIT）**：重新生成签名 Profile 时，`acls.allowed-acls` 里**只需** `ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY`；
- `READ_PASTEBOARD` / `READ_WRITE_DESKTOP_DIRECTORY` 已从声明面撤销 ⇒ Profile 里即便残留这两条 ACL 也**无害**（多余项，重建时可去掉）；
- 文档/下载是 `normal` 级 ⇒ **不进 Profile**，运行期 `user_grant` 弹窗。

> ⚠️ 真机待办：本工程的 `TC-D-*`（含装机 + JIT 生效 + 文档/下载授权矩阵）**尚未执行**（无真机）。下表是**预期判据**，落地时按 `pi-desktop-ark/docs/ACL配置.md §5` 的四机矩阵逐项复跑。

### 4.2 复验步骤（Profile 变更后必做）

```bash
# 1) 装机（Profile 含 JIT ACL 才装得上）
hdc install -r entry/build/default/outputs/default/entry-default-signed.hap

# 2) 取真实端口并建隧道（端口随机；hdc 规则寿命只覆盖创建它的那次调用 ⇒ 建/用写进同一条）
PORT=$(hdc shell "cat <filesDir>/payload/server.ready.json" | python -c "import sys,json;print(json.load(sys.stdin)['port'])")
hdc fport tcp:18400 tcp:$PORT

# 3) JIT 生效判据：/api/info 正常返回（无 SIGTRAP / Cpp Crash）；hilog 无 Cpp Crash
curl -s http://127.0.0.1:18400/api/info

# 4) 文档/下载授权（user_grant）：先 check（403/EACCES），再 request（authResult 0/-1/2），再 browse
curl -s "http://127.0.0.1:18400/api/cwd/browse?root=documents"   # 未授权预期 403
```

`authResult` 三个取值（本地 SDK `security/PermissionRequestResult.d.ts`）：`0` 已授予 / `-1` 用户拒绝 / `2` 请求无效。

## 5. 与运行时投放的关系

ACL 只决定**内存权限**，不影响库与原生库的加载：`libnode.so` / `libc++_shared.so` 由 `@fellow99/node-runtime`（ohpm 包）随 `assembleHap` 合并进 HAP，`libnode_bridge.so` 随 `@fellow99/node-bridge`（ohpm 包）打包（锁值由 `scripts/verify-runtime.mjs` 校验）。`opencode.mjs` + `assets/app-archive.bin` 由 `scripts/collect-opencode.mjs` 投放进 `resfile/opencode/`（resfile 只读直读，零解压）。

## 6. 未取证清单（⬜ 待真机）

| # | 项 | 说明 |
| --- | --- | --- |
| 1 | 装机 + JIT 生效（`/api/info` 200、无 Cpp Crash） | 无真机；HAP 尚未签名 |
| 2 | 文档/下载四机授权矩阵（2in1 / 平板 / 手机 / TV） | 复用 pi `ACL配置.md §5` 步骤，逐台复跑 |
| 3 | 撤销 `READ_PASTEBOARD` 后前端 Ctrl+V 粘贴 | 预期与 pi 一致（ArkWeb 自读剪贴板），真机确认 |
| 4 | `--jitless` 下 opencode 服务端启动/对话 | 见 `ACL-无ACL评估.md`（预期触发 WASM/fetch 硬门） |
