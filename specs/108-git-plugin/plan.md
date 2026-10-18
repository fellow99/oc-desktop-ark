# Git 插件（108-git-plugin）—— 实现方案

> **模块**：`108-git-plugin` ｜ **状态**：Proposed ｜ **日期**：2026-10-18 ｜ 对应规格：[`spec.md`](./spec.md)
> **依据**：`docs/000-工程规划.md` v0.3 §5.9 / §8.1 / §8.4 / §12.1 A5；`specs/constitution.md`（C1–C6、S1–S7）｜ 证据口径：✅ 本机核对上游源码 ｜ 🔶 沿用 `oc-desktop-hos` ｜ ⬜ 待真机
## 1. 技术上下文

| 项 | 值 | 来源 |
|---|---|---|
| 运行时 | 进程内 Node **v24.2.0**（ABI 137），与服务端同进程 | `TECH.md` §二 |
| git 引擎 | **isomorphic-git@1.44.2** + `isomorphic-git/http/node`（纯 JS、无 `.node`、不 spawn） | 🔶 `oc-desktop-hos/docs/204-插件-GIT.md` §3 F1 |
| diff 组件 | **diff@9.0.0**（零依赖，统一 diff 语义） | 同上 D11 |
| 标识 | 目录 `plugins/oc-plugin-git/`；插件 `id` = RPC id = **`oc-ark-git`** | `plugins/README` 体例（🔶 hos） |
| 构建期落点 | `entry/src/main/resources/resfile/opencode/plugins/oc-plugin-git/**`（含 `node_modules/`，gitignored） | `STRUCTURE.md` §五 |
| 运行期落点 | `<filesDir>/config/opencode/plugin/oc-plugin-git/`（**只有配置目录下的 `plugin/`、`plugins/` 会被扫描**） | 规划 §5.9（`docs/000-工程规划.md:445`） |
| 环境 | `HOME=<filesDir>`、`XDG_CONFIG_HOME=<filesDir>/config` ⇒ 凭据 = `<filesDir>/.git-credentials` | 规划 §5.6（`:392-407`） |
| 构建链 | `build-opencode` → `collect-opencode` → **`collect-plugins`（新增）** → `smoke-node24` → `assembleHap` | 规划 §7.1 |
| 依赖 pin | `ISOMORPHIC_GIT_VERSION='1.44.2'`、`JSDIFF_VERSION='9.0.0'`（构建常量 + 装载断言，双保险） | 本方案 §6.5 |
## 2. 宪法合规

| 原则 | 本模块如何满足 | 落点 |
|---|---|---|
| **C1 壳薄契约硬** | 插件只扩展能力面（工具 / 版本库 / 凭据 RPC），不实现 UI、不新增 IPC 载体；页面走既有 RPC 通道 | §5、§6.1 |
| **C2 不隐藏平台真相** | `rebase` / SSH / SHA-256 仓库明确不支持；缺凭据给可照抄指引；hmdfs 与 `flock` 限制写进 README 与 109 报告 | §6.7 |
| **C3 谁写谁读** | 插件投放与依赖复制由 **Node 自己**做（`payload/lib/plugins.js`），ArkTS 不碰插件文件；幂等 marker 由写方维护 | §6.5 |
| **C4 不改上游** | 唯一改动是 `patches/v2.0.26/0008-git-credentials-settings.patch`（设置页），可反向校验；`packages/**` 零改动 | §6.4 |
| **C5 崩溃终态** | 插件 `setup()` 抛错只让插件 `failed`，不拖垮服务端；工具与 VCS 注册分别 try/catch，崩溃不静默 | §6.6 |
| **C6 判据可证伪** | 断言全部可执行：工具表、版本 pin、包数/体积、异步契约、越界拒绝、`0600`、真机 diff→提交 | §7 |

**安全条款映射**：`S2/S3`（口令与 token 不入日志）→ NFR-108-004；`S6`（目录经授权）→ 围栏（§6.2）。
## 3. 研究结论（引用规划 § 号 + 源码 `path:line`；编号跳空 = 该条已并入前一行）

| # | 结论 | 证据 |
|---|---|---|
| R1 | 上游 git provider **必然 spawn `git`**（`make(processes, …)` + `ChildProcess.make(gitExecutable, …)`），无 git 设备上必失败 | ✅ `packages/core/src/plugin/vcs/git.ts:31-47`（`id: "git"` 在 `:42`） |
| R2 | `VcsEditor.add` = `Map.set(provider.id, provider)` ⇒ 同 id 后注册者胜；插件激活晚于 `internal.pre`（含内置 VCS）⇒ 我们的注册在后 | ✅ `packages/core/src/vcs.ts:84`、`packages/core/src/plugin/supervisor.ts:153-157` |
| R4 | 本地插件经真实 ESM `import()` 装载；裸包名解析对 `node_modules` 直接放行 ⇒ 插件自带 `node_modules/` 可解析 | ✅ `packages/plugin/src/source.node.ts:18-37` |
| R5 | 插件**无 UI 钩子**；设置页只能走上游补丁（`SettingsRootTab` + `pageIcons`，`branch` 图标已存在） | ✅ `packages/app/src/settings/route.ts:1-14`、`settings/pages.ts:5-41`、`packages/ui/src/icons/catalog.ts:33` |
| R6 | 插件只认**配置目录下的扫描目录**（放只读载荷不生效）；`HOME` / `XDG_CONFIG_HOME` 被宿主改写 ⇒ 凭据落在 `<filesDir>/.git-credentials` | 规划 §5.9（`docs/000-工程规划.md:445`）、§5.6（`:392`）；🔶 `oc-desktop-hos/src-main/main.js:236-241` |
| R8 | 设备无 `symlink`、无硬链 ⇒ 依赖物化只能 **copy**；原子写只走 `rename` | 规划 §8.4（`:585`）；🔶 `oc-desktop-hos/docs/鸿蒙环境能力清单-v2.0.26.md:146-147` |
| R9 | `flock` 不支持 → 库视为成功，锁语义退化为**进程内锁** | 规划 §2.3（`:158`）、风险 A5（`:722`）、开放问题 O6（`:733`） |
| R10 | 21 工具面、仓库根 chroot、`dir` 解析与越界拒绝已由同型插件验证 | 🔶 `oc-desktop-hos/docs/204-插件-GIT.md` §8、§10 |
| R11 | **promise 方言坑**：适配器同步抛错 ⇒ 库判成 callback 风格 ⇒ 全部调用永久挂起 | 🔶 同上 F8（真机事故：工具结果未知、会话卡死） |
| R12 | 依赖闭包 56 包 / **8,005,075 B ≈ 8.0 MB**（宿主实测）；上限断言 ≤ 12 MB | 🔶 同上 §3 F2、§19 L3 |
| R13 | 凭据单一真值（git 原生格式、`0600`、页面为唯一入口、口令永不回显）；`show`/`diff`/`revert` 需自建；SSH 风格 URL 会丢 scp 账号名 | 🔶 同上 §9（D8）、F5、F11 |
| R14 | 插件投放须在服务端 **import 之前**完成（服务端启动时发现插件） | 规划 §5.2.2（`:307-315`）时序 |
## 4. 数据模型
### 4.1 凭据文件（`<filesDir>/.git-credentials`，git 原生）
| 规则 | 语义 |
|---|---|
| 文件示例 | `https://<用户名>:<口令>@git.example.com`（裸主机）；`https://<用户名>:<口令>@git.example.com/team/repo.git`（带路径行，前缀优先） |
| 编码 / 权限 | userinfo 两段百分号编码（`%3A`/`%40`/`%2F` 原样往返）；写入用「临时文件 + `rename`」原子替换，随后强制 `0600` 并**回读校验**（hmdfs 可能静默改权限） |
| 匹配 / 优先级 | `protocol` + `host[:port]`（大小写不敏感）；带路径行前缀优先，同分时文件靠后 > 靠前 |
| 写 / 删 | 同「协议 + 主机 + 用户名」视为同一条（替换）；删除只删匹配行，删空即删文件 |
| 容忍 | 空行 / `#` 注释 / 非 URL / 无 userinfo 一律跳过，不抛错 |
### 4.2 物化清单（构建期产物，供断言与幂等）
`{ "schema":1, "isomorphicGit":"1.44.2", "diff":"9.0.0", "packages":56, "bytes":8005075, "transportEntry":"isomorphic-git/http/node", "builtAt":"<epoch ms>", "source":"npm" }`
### 4.3 工具 I/O 与版本库结构
| 项 | 约定 |
|---|---|
| 公共输入 | `dir?: string`（相对会话目录；缺省会话目录；必须落在项目根内） |
| 输出 | `{ content: string, metadata?: object }`；`content` 为模型可读文本（status 分组 / 提交摘要 / diff / 冲突列表） |
| 可归因失败 | 以 `{ content }` 返回（不终结步骤）；意外异常才 `throw`（上游包成 `Tool.Error`） |
| `info()` / `base()` / `branches()` / `status()` | `{ branch: { current?, default? } }` ／ `{ name, ref, source: "default" } \| null` ／ `string[]` ／ `[{ file, additions, deletions, status: added\|deleted\|modified }]` |
| `diff(mode)` | `[{ file, patch, additions, deletions, status, binary? }]`；`mode ∈ working\|branch\|committed` |
## 5. 接口契约
### 5.1 本模块提供
| 契约 | 消费方 | 说明 |
|---|---|---|
| 21 个 `git_*` 工具 | 模型（会话） | 名字即有效名；凭据字段零存在 |
| `oc-ark-git` 的 4 个 RPC 方法 | 设置页（补丁 0008） | 见 §5.3 |
| 版本库 provider `id:"git"` | 上游 `Vcs` 服务与自带界面 | 覆盖内置实现 |
| 诊断行 | hilog / `logs/server.log` / 109 | `[ark] plugin oc-ark-git: tools=21 vcsProvider=git(override) credentials=<path> runtime=ok` |
### 5.2 本模块消费
| 消费项 | 来源 | 说明 |
|---|---|---|
| `context.location.{directory, project.directory}` + `context.{tool.transform, vcs.transform, rpc.register}` | 上游插件 SDK | 围栏根/会话目录 + 三个注册点 |
| `process.env.HOME` + 工具执行上下文的 `signal` | 宿主 / 上游 | 凭据路径；透传取消 |
| `<filesDir>/config/opencode/plugin/` | 本工程（投放） | 插件扫描目录 |
### 5.3 RPC（`rpcID = "oc-ark-git"`，handler 全 async）
| 方法 | 输入 | 输出 |
|---|---|---|
| `credentials.describe` | `{}` | `{ path, exists, mode, count, message }`（`mode` 为八进制字符串 `"600"`） |
| `credentials.list` | `{}` | `{ path, entries: [{ protocol, host, username, passwordLength, hasPath }] }`（**永不回传口令**） |
| `credentials.save` | `{ protocol?, host, username, password }` | `{ ok, code, message, path }` |
| `credentials.remove` | `{ protocol?, host, username }` | `{ ok, code, message }` |

`code ∈ ok | invalid-host | invalid-username | invalid-password | invalid-protocol | write-failed | not-found`。页面行为：口令框 `type="password"`；保存后只显示「已配置（长度 N）」；显示绝对路径；`describe` 失败 ⇒ 该 Tab 不渲染（自门控）。
## 6. 实现策略
### 6.1 装配（`plugins/oc-plugin-git/index.js`）
1. 读 `context.location` → 计算 `root`（项目根）与 `cwd`（会话目录）；`context.tool.transform` 注册 21 个工具并逐个 `editor.get(name)` 复查，缺失即 `throw`（插件 `failed`）。
3. `context.vcs.transform` 与 `context.rpc.register` 各自独立 try/catch（失败只记日志、不连带另一侧），最后打印诊断行；第三方模块一律首次调用时 `import()`（§6.5）。
### 6.2 文件系统适配器（`lib/fs-adapter.js`）
- 方法集：`readFile` `writeFile` `unlink` `readdir` `mkdir` `rmdir` `stat` `lstat` `chmod` `readlink` `symlink` `rm`（`rm` 必须实现）。
- **全部 `async`**；非法路径返回 `Promise.reject(Object.assign(new Error("OutsideRepository"), { code: "EPERM" }))`，**不得同步抛**（R11）。
- 路径：`join(root, rel)` → `normalize` → 前缀包含校验 → `node:fs/promises`；`symlink` / `readlink` 直接拒绝（R8）；围栏粒度 = 仓库根**单点**，库内部写入不逐次经上游校验（README 如实披露）。
### 6.3 凭据与认证（`lib/credentials.js` / `lib/auth.js`）
- 解析/匹配/写入/删除按 §4.1；`describe` 的 `mode` 来自 `stat` 实读，不用常量假装。
- `onAuth({url})`：按协议 + host 查凭据 → 命中返回 `{ username, password }`；未命中 `{ cancel: true }`，工具报「未配置凭据 + 主机 + 设置入口 + 文件路径 + 可照抄占位行」；`onAuthFailure` 报「凭据被拒绝」+ 主机，最多重试 1 次；日志只打印 `host` 与 `passwordLength`。
- SSH 风格 URL 先转 HTTPS（R13），错误提示说明「HTTPS 用户名必须来自凭据或参数」。
### 6.4 界面补丁（`patches/v2.0.26/0008-git-credentials-settings.patch`）
| 文件 | 改动 |
|---|---|
| `packages/app/src/settings/route.ts` | `SettingsRootTab` 增 `"git"`，`rootTabs` 同步 |
| `packages/app/src/settings/pages.ts` | `pageIcons.git = "branch"`、`pageLabels.git = "settings.git.title"` |
| `packages/app/src/settings/git/git.tsx` + `git.css`（新增） | 路径展示 + 表单 + 列表 + 删除；自门控 |
| `packages/app/src/settings/surface.tsx`、`runtime/i18n/{en,zh}.ts` | 渲染分支接入 + 文案键（过 107 禁用词检查） |

补丁纪律：`git apply --reverse --check` 判幂等；不落在 0001/0003/0006 上下文区间；追加到 `patches/v2.0.26/README.md` 列表末尾。
### 6.5 构建期物化 + 启动期投放（本工程最关键的新增步骤）
- **构建期**（`scripts/collect-plugins.mjs`）：`discoverPlugins` → 静态断言 + 工具元数据（`import` 插件跑 `setup()` 收表，故必须懒加载）→ 投放源码到 `resfile/opencode/plugins/oc-plugin-git/` → 在 `os.tmpdir()` 暂存 `npm install --omit=dev isomorphic-git@1.44.2 diff@9.0.0` → **整棵 `node_modules/` copy** 到该目录 → 断言（版本、`http/node` 入口、包数 56、体积 ≤ 12 MB、无 `.node`/`.so`）→ 写 §4.2 清单。幂等：版本命中走工程内缓存 `.cache/git-plugin-runtime/`；`--force-plugin-runtime` 强制重建；失败抛错不静默。
- **启动期**（`payload/lib/plugins.js`，由 `opencode-server.js` 在 `import(opencode.mjs)` **之前**调用，R14）：把 `resfile/.../plugins/oc-plugin-git/**` **copy** 到 `<filesDir>/config/opencode/plugin/oc-plugin-git/`（禁 symlink），以「源清单 SHA-256 + 目标文件数」判幂等；失败写 `logs/server.log` 并继续启动（插件缺失只降级，不阻断服务）。
- **为什么必须补这一步**：本工程没有 Electron 主进程，`oc-desktop-hos` 的 `materializePlugins()`（`src-main/main.js:304-335`）在本工程**不存在**；投放必须由 Node 侧完成（C3）。
### 6.6 错误处理与降级
| 场景 | 行为 | 降级 |
|---|---|---|
| 依赖未物化 / 版本不符 / `vcs.transform` 缺失 | 工具返回「git 运行时缺失（期望 1.44.2）」或按需降级；诊断行标 `runtime=missing`，日志点名缺哪个注册点 | 其它插件与服务不受影响；可回到「仅工具」 |
| provider 运行期异常 | catch 内 `[ark]` 归因行，返回保守值（空 status / 空 diff） | 上游 `protect` 亦兜底（🔶 204 F10） |
| RPC 失败 / 凭据写失败 | 设置页 `describe` 失败自行隐藏；`save` 返回 `write-failed` + 原因 | 凭据功能不可用，工具可用 |
| 越界 / 缺凭据 / 冲突 | 按 §4.3「可归因失败」返回文本 | 不重试、不静默 |
### 6.7 性能与文件系统语义（风险 A5）
- 基准：5 MB 级仓库跑 `init → add → commit → status → diff`，记录每步耗时与峰值内存，结果写 `docs/真机验证记录.md`。
- `flock` 不支持（R9）：多进程写安全性不成立；本工程只有一个进程写仓库，结论如实登记，不宣称「并发安全」。
- 降级预案：若写链在 hmdfs 上不可用或不可接受，**只保留只读链**（status / diff / log / show）并在 README 与 UI 提示中说明，不静默失败。
## 7. 测试考虑
### 7.1 host 侧
```bash
node --test plugins/oc-plugin-git/tests/        # 纯函数 + 异步契约 + 围栏 + 凭据
node scripts/verify-git-plugin.mjs              # 门禁：单测 + 临时目录真实 init/add/commit/status/log/diff（不联网）
node scripts/collect-plugins.mjs --check-only   # 静态断言 + 21 项工具元数据（不物化）
node scripts/collect-plugins.mjs                # 含物化断言 + 清单
```
- 单测覆盖：凭据解析/匹配/写入/删除与 `0600`、chroot 拒绝、diff 渲染与二进制判定、status 分组、revert 冲突、**每方法 `AsyncFunction`**；`verify-git-plugin.mjs` 非零退出即失败，`--self-test` 用反向用例（同名不同大小写、缺 `package.json`、工具名不符）证明断言能失败。
### 7.2 真机
- 装包启动后取 `<filesDir>/payload/server.ready.json` 的 `port`，`hdc fport` 后以 Basic 请求 `GET /api/plugin` 确认插件已加载（`/api/info` 200 为前置）；`hdc shell "hilog -x | grep -E 'oc-ark-git|Cpp Crash'"` 取诊断行。
- 闭环验收：仓库内造改动 → 界面看 diff → 会话内 `git_add` + `git_commit` → 结果写 `docs/真机验证记录.md` + `docs/evidence/`（供 109 复用）。
- 对话用例按 `oc-desktop-hos/docs/204-插件-GIT.md` §18 的 AN/AR/AW 序列执行；**默认分支不作为首次写链目标**（避免不可回滚副作用）。
### 7.3 与 109 的联动
- 真机闭环结果作为 109 的补充证据；插件体积与首启增量纳入回归四件套的包体项。
## 8. 文件清单
### 8.1 新增
| 路径 | 说明 |
|---|---|
| `plugins/oc-plugin-git/{package.json,index.js,README.md,lib/**,tests/**}` | 包清单（`type: module`、两依赖）、装配、8 个能力模块 + 21 工具、单测（含异步契约） |
| `plugins/oc-plugin-git/lib/tools/*.js` + `tests/*.test.mjs` | 21 个工具（一文件一工具）与 `node --test` 单测 |
| `scripts/collect-plugins.mjs` / `scripts/verify-git-plugin.mjs` | 投放 + 物化 + 断言 + 清单 / 宿主门禁 |
| `payload/lib/plugins.js` | 启动期幂等 copy 到配置目录（C3） |
| `patches/v2.0.26/0008-git-credentials-settings.patch` | 「设置 → Git」页（自门控） |
| `specs/108-git-plugin/{spec.md,plan.md}` | 本模块规格与方案 |
### 8.2 修改
| 路径 | 改动 |
|---|---|
| `payload/opencode-server.js` | 在 `import(opencode.mjs)` 前调用 `plugins.materialize()`（R14），失败只记日志 |
| `scripts/collect-opencode.mjs` | 载荷组装后串联 `collect-plugins`（或复用其导出函数） |
| `patches/v2.0.26/README.md` | 登记 0008（补丁列表末尾） |
### 8.3 明确不改
- 上游 `packages/**`（除 0008 补丁外零改动）、`module.json5` 权限声明面、ArkTS 宿主、服务端 `serve` 参数、鉴权链路（105）、载荷裁剪规则（102）。
