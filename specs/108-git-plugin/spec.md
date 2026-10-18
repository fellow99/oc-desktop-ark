# Git 插件（108-git-plugin）—— 规格

> **模块**：`108-git-plugin` ｜ **状态**：Proposed ｜ **日期**：2026-10-18 ｜ **应用**：OC Desktop Ark / `org.fellow99.oc.OCDesktopArk`
> **依据**：`docs/000-工程规划.md` v0.3 §5.9（插件与 Git）、§8.1（能力对齐）、§12.1 A5（hmdfs / flock 风险）、§14.2；`specs/constitution.md`（C1–C6、S1–S7）
> **证据口径**：✅ 实测 ｜ 🔶 沿用 ｜ ⬜ 待验证
> **技术无关**：具体 git 库、版本号、依赖包名与文件落点一律见 [`plan.md`](./plan.md)；本文件只写行为与判据。

## 1. 概述
设备侧**没有可用的 git 命令**，而应用自带的版本库界面又必须工作。本模块把一个**纯 JavaScript 的 git 实现**作为壳专用插件嵌进服务端进程，让「模型能调 git 工具」「界面能看分支与差异」「用户能录入凭据」三件事同时成立。全部发生在应用进程内：不依赖外部二进制、不依赖原生模块、不新增权限、不改上游源码（UI 仅一条幂等补丁）。

### 1.1 三半与边界

| 半 | 内容 | 落点 |
|---|---|---|
| 工具半 | 21 个 `git_*` 工具（一动词一工具），模型在会话里直接调用 | 插件 `index.js` + `tools/*` |
| 界面半 | 以同 id **覆盖内置版本库 provider**，让上游自带的变更 / 分支 / 差异界面在无 git 的设备上工作 | 插件 `lib/vcs.js` |
| 凭据半 | 插件 RPC（4 个方法）+ 一条 UI 补丁新增「设置 → Git」页；凭据落 `~/.git-credentials`（`0600`） | 插件 `lib/credentials.js` + `patches/v2.0.26/0008-*` |

**范围包含**：插件本体与单测、构建期依赖物化（copy，禁软链）、启动期插件投放、L1 档位声明、宿主侧门禁脚本、真机闭环验收。
**不包含**：`rebase`（实现无此原语）、`blame`/`grep`、子模块 / worktree / LFS、SSH 传输、SHA-256 仓库、运行时按需安装依赖（L2）、任何 ArkTS 业务改动、任何权限声明变更、上游 `packages/**` 改动。

### 1.2 与其它模块的边界

| 模块 | 关系 |
|---|---|
| 101 | 启动编排；插件投放发生在 Node 侧启动流程内（C3） |
| 102 | 载荷流水线；插件源码与依赖随载荷物化进包 |
| 105 | 鉴权；与 git 凭据**互不复用**（两套凭据、两处文件） |
| 107 | 文案禁用词、权限面与许可清单的汇总判定 |
| 109 | 真机闭环（diff → 提交）纳入回归证据 |

## 2. 用户故事

| # | 角色 | 故事 |
|---|---|---|
| US-108-01 | 用户 | 我能在对话里让模型克隆并读懂一个公开仓库，不必先想办法装 git。 |
| US-108-02 | 用户 | 我能为带账号仓库在设置里填一次用户名/口令，之后 pull/push 不需要把口令交给模型。 |
| US-108-03 | 用户 | 应用自带的变更列表 / 分支 / 差异界面在有 `.git` 的目录里重新工作。 |
| US-108-04 | 用户 | 模型只能在我给出的工作区内读写，越界必须明确拒绝。 |
| US-108-05 | 用户 | 任何失败都如实说明原因（缺凭据 / 被拒 / 冲突 / 越界 / 网络不可达），不假装成功、不无限重试。 |
| US-108-06 | 维护者 | 我能在构建期看到工具表 / 依赖版本 / 体积是否符合约束，而不是等真机才发现。 |

## 3. 功能需求
> 级别：MUST / MUST NOT / SHOULD（RFC 2119）。编号 `FR-108-NNN` 永不复用。

### 3.1 引擎与工具面

| 编号 | 需求 | 判据 |
|---|---|---|
| FR-108-001 | 插件 MUST 用**纯 JavaScript** 的 git 实现在设备侧完成操作；MUST NOT 依赖外部 git 命令、MUST NOT 依赖原生模块、MUST NOT 起子进程 | 插件目录零 `.node`/`.so`；源码零进程创建调用；构建期静态断言 |
| FR-108-002 | 插件 MUST 注册且仅注册 21 个工具：`git_init` `git_clone` `git_status` `git_diff` `git_log` `git_show` `git_add` `git_commit` `git_branch` `git_checkout` `git_reset` `git_merge` `git_cherry_pick` `git_revert` `git_stash` `git_tag` `git_remote` `git_fetch` `git_pull` `git_push` `git_config` | 构建期期望工具表 = 实现表；缺一个或改名即失败 |
| FR-108-003 | 每个工具 MUST 接受可选 `dir`（相对会话目录解析；缺省 = 会话目录）并 MUST 校验其落在项目根内 | 单测覆盖缺省/相对/越界三种输入 |
| FR-108-004 | 任何工具 MUST NOT 携带凭据字段（用户名/口令/token），凭据只经 FR-108-020 的文件读取 | 工具 schema 静态检查：凭据类字段零命中 |
| FR-108-005 | 上游库缺失的三项能力 MUST 自建：`git_show`（提交/树/对象/标签展示）、`git_diff`（统一 diff / 统计 / 二进制判定）、`git_revert`（反向提交，fail-closed） | 单测：show 元信息、diff 文本、revert 冲突拒绝 |
| FR-108-006 | `rebase` MUST NOT 交付；被请求时 MUST 明确回「本平台不支持（实现无此原语）」，MUST NOT 用 merge 冒充 | 对话用例：问到 rebase 时返回该文本 |
| FR-108-007 | 工具注册后 MUST 逐个复查注册表；任一缺失 MUST 抛错使插件状态为失败（fail-visible） | 反例：删一个工具 → 插件 `failed` 且日志点名 |
| FR-108-008 | 工具调用 MUST 支持取消（透传取消信号）；被取消 MUST NOT 记为失败 | 取消用例：返回「已取消」而非错误 |

### 3.2 围栏（安全属性）

| 编号 | 需求 | 判据 |
|---|---|---|
| FR-108-010 | 仓库根 MUST 唯一取自会话的项目根；解析结果不满足「等于根或以 `根 + 分隔符` 开头」时 MUST 拒绝，且 MUST NOT 触达文件系统 | 单测：`..`、绝对路径、根外软链三种输入全部拒绝 |
| FR-108-011 | 适配层 MUST 对每个路径做 `join → normalize → 前缀包含` 校验；越界 MUST 以 rejected promise 表达 | 契约测试断言方法签名与拒绝行为 |
| FR-108-012 | 适配层的**每个**方法 MUST 异步；MUST NOT 同步抛错（否则上游判成回调方言并永久挂起） | 契约测试：每方法 `AsyncFunction`；非法输入返回 rejected promise |
| FR-108-013 | 越界 MUST 明确拒绝并提示「把项目根换成目标目录」；MUST NOT 提供提权后放行 | 对话用例：越界提示可照抄 |
| FR-108-014 | 仓库内部写入 MUST 收在「仓库根」这**单点**围栏内，并在插件 README 如实披露该粒度 | README 存在该段落；单测覆盖根外写入拒绝 |

### 3.3 凭据

| 编号 | 需求 | 判据 |
|---|---|---|
| FR-108-020 | 凭据 MUST 存 `<filesDir>/.git-credentials`（`~` 已指向沙箱），格式 MUST 与 git 原生凭据存储同形（一行一条带 userinfo 的 URL），权限 MUST `0600`；写入 MUST 原子替换 | 真机 `stat` 为 600；写入后回读一致 |
| FR-108-021 | 匹配 MUST 按「协议 + 主机[:端口]」（大小写不敏感）；带路径行 MUST 前缀匹配且优先；同分时靠后覆盖靠前；坏行/注释 MUST 跳过而不抛错 | 单测 9+ 例（含百分号编码往返） |
| FR-108-022 | 认证 MUST 仅在服务端要求时触发；未命中 MUST 返回取消并报「主机 + 设置入口 + 文件路径 + 可照抄占位行」；MUST NOT 把裸 401/403/404 抛给模型；被拒最多重试 1 次 | 对话用例：缺凭据/错口令两种 |
| FR-108-023 | 插件 MUST 经 RPC 提供 `credentials.describe` / `list` / `save` / `remove`；handler MUST 异步；MUST NOT 回传口令值（只给长度） | RPC 响应无口令字段；四方法均有单测 |
| FR-108-024 | 渲染层 MUST 经一条最小上游补丁新增「设置 → Git」页：口令框为密码类型、保存后只显示「已配置（长度 N）」、显示凭据文件绝对路径；RPC 不可达时整页 MUST 隐藏（自门控） | 真机走查 + 反例：停用插件后该 Tab 不出现 |
| FR-108-025 | 凭据明文 MUST NOT 出现在对话记录、日志、配置文件、提交与文档 | 四类载体检索零命中 |

### 3.4 界面（版本库 provider 覆盖）

| 编号 | 需求 | 判据 |
|---|---|---|
| FR-108-030 | 插件 MUST 以同 id 覆盖内置 provider，使上游自带的变更 / 分支 / 差异界面可用；MUST NOT 依赖上游源码改动 | 真机界面显示分支与变更；hilog 有诊断行 |
| FR-108-031 | provider MUST 实现 `init` / `info` / `base` / `branches` / `status` / `diff`，语义与上游契约一致（`branch.{current,default}`、`string[]`、`{file,additions,deletions,status}`、含 patch 的差异项） | 与上游类型逐字段对齐；单测覆盖空仓库与有 HEAD 两种 |
| FR-108-032 | 覆盖 MUST 可单点回退（去掉注册即回到「仅工具」），回退后 21 个工具 MUST 不受影响 | 回退构建 + 工具表仍为 21 |
| FR-108-033 | 注册成功 MUST 打印一行诊断（工具数 / provider / 凭据路径）；工具与 provider 注册 MUST 分别容错并各自留日志 | hilog / `server.log` 命中该行；故障注入时另一侧仍可用 |

### 3.5 落点、物化与档位
| 编号 | 需求 | 判据 |
|---|---|---|
| FR-108-040 | 插件 MUST 只在「配置目录下的插件扫描目录」生效（`<filesDir>/config/opencode/plugin/oc-plugin-git/`）；MUST NOT 从只读载荷目录直接加载 | 真机 `GET /api/plugin` 可见该插件；只读目录方案反例复现失败 |
| FR-108-041 | 依赖 MUST 在构建期预物化进插件目录内的依赖目录；MUST NOT 运行时安装（L1 仅本地）；MUST NOT 使用软链，一律 copy | 产物内依赖在位、无 symlink；断网启动插件仍加载 |
| FR-108-042 | 物化 MUST 断言：依赖版本 = pin、传输入口存在、包数与总体积上限、无原生库文件；失败 MUST 抛错（不静默产出空目录） | 构建日志；删除一个包 → 构建失败 |
| FR-108-043 | 插件源码 MUST 通过既有静态断言（无 PTY / 无子进程 / 无原生模块 / 无 exec 家族）与语法检查；依赖目录 MUST NOT 被这些断言扫描 | 构建日志全绿；`--check-only` 同结论 |
| FR-108-044 | 第三方模块 MUST 懒加载（首次工具调用时装载），MUST NOT 在模块顶层 import | 构建期工具元数据检查（会装载插件）在无依赖目录时仍能收集工具表 |
| FR-108-045 | 插件 MUST NOT 新增权限声明、MUST NOT 改 ArkTS 宿主能力面（0008 仅改设置页 UI） | 权限声明差集为空；ArkTS diff 为 0 |

## 4. 关键实体
| 实体 | 字段 | 说明 |
|---|---|---|
| `CredentialEntry` | `protocol` / `host`（含可选端口）/ `username` / `passwordLength` / `hasPath` | 仅出现在 RPC 输出；**不含口令值** |
| `CredentialFile` | `path`（`<filesDir>/.git-credentials`）/ `mode`（`600`）/ `count` | §3.3 的文件形态 |
| `GitToolResult` | `content: string` / `metadata?: object` | 工具返回值；`content` 为模型可读文本 |
| `AttributableError` | `content` 文本（缺凭据 / 越界 / 非仓库 / 冲突 / 服务端拒绝） | 以返回值上报，步骤不终结；意外异常才 `throw` |
| `VcsProvider` | `id: "git"` / `name` / `init` / `info` / `base` / `branches` / `status` / `diff` | 覆盖内置实现 |
| `DiffResult` | `file` / `patch` / `additions` / `deletions` / `status` / `binary?` | `binary=true` 时无内容级 diff |
| `RuntimePin` | git 实现版本 / diff 组件版本 | 构建期 pin + 装载时断言（具体值见 plan） |
| `PluginDiagnostics` | `tools=21` / `vcsProvider=git(override)` / `credentials=<path>` / `runtime=ok\|missing` | 日志行字段，供 109 取证 |

## 5. 验收场景
1. **装配与工具可见（正常 + 负例必存）**：`GET /api/plugin` 中插件为已加载；会话内 21 个 `git_*` 工具可见；工具表与实现不符 → 构建期失败。
2. **本地仓库全链（正常）**：空目录 `git_init` → 写文件 → `git_add` → `git_commit` → `git_status`/`git_log`/`git_diff` 全部成功，作者身份来自 `git_config` 或默认占位值。
3. **无账号远端只读 + 浅克隆（正常 + 负例必存）**：远端 refs 探测、`depth`/`singleBranch` 克隆、`fetch`/`pull` 成功；无凭据 `push` **预期失败**且报「未配置凭据 + 主机 + 文件路径」。
4. **带账号仓库读写（正常，副作用标注）**：设置页写入 `0600` 凭据 → 认证通过 → 克隆 → 只读链 → 新建测试分支 → 提交 → 推送测试分支 → 附注标签 → 收尾删除测试分支（默认分支不作为首次验证对象）。
5. **缺凭据与凭据被拒（负例必存）**：删除凭据后报错点名主机与入口；错误口令报「凭据被拒绝」，最多重试 1 次，无无限重试。
6. **围栏（负例必存）**：`dir` 指向项目根之外（含 `..`、绝对路径）→ 拒绝并说明；根外文件**未被创建**。
7. **异步契约（负例必存）**：适配层任一方法被同步调用时返回 rejected promise 而非抛错；契约测试断言每方法为异步函数。
8. **界面覆盖生效（正常 + 回退）**：有 `.git` 的工作区显示当前分支与变更，点开有 patch 文本；去掉注册后界面回到既有降级状态、工具仍 21 个可用。
9. **凭据页自门控（负例必存）**：插件未加载/RPC 不可达时「设置 → Git」不出现，导航与路由回退上游行为，不弹错误框。
10. **构建期门禁（正常 + 反向）**：静态断言 + 21 项工具元数据 + 物化断言全绿；`--check-only` 跳过物化仍全绿；缺 `package.json`、工具名不符、包数不符三种反向用例按预期失败。
11. **`revert` fail-closed（负例必存）**：先制造工作区分叉再 `git_revert` → 拒绝执行并列出冲突路径，用户改动未被覆盖。
12. **真机闭环（回归口径）**：在有 `.git` 的工作区完成一次「看 diff → 提交」；结果写入 `docs/真机验证记录.md`，证据落 `docs/evidence/`（供 109 复用）。
13. **性能与文件系统语义（观察项）**：在 5 MB 级仓库跑 init/add/commit/status/diff 基准并记录耗时；`flock` 不可用时多进程语义降级为进程内锁，必须在报告中如实登记。

## 6. 非功能需求
| 编号 | 需求 | 级别 |
|---|---|---|
| NFR-108-001 | 启动 MUST NOT 因本模块劣化：第三方模块懒加载，`setup()` 不做网络/磁盘重活 | MUST |
| NFR-108-002 | 包体增量 MUST ≤ 12 MB（实测值记录在 plan §3） | MUST |
| NFR-108-003 | `git_clone`（`depth:1`，中型公开仓库）SHOULD 在 60 s 内完成；超时 MUST 如实报已用时与建议 | SHOULD |
| NFR-108-004 | 插件日志 MUST 带统一前缀（`[ark]`）；凭据只打印主机与长度，MUST NOT 打印值 | MUST |
| NFR-108-005 | 任何失败 MUST 可见（返回值或日志至少其一），MUST NOT 静默成功或返回空结果 | MUST |
| NFR-108-006 | 工具输出 MUST 有硬上限（单文件 diff 256 KiB、单次总量 1 MiB、行截断），超限 MUST 显式标注 | MUST |
| NFR-108-007 | 文件系统语义风险 MUST 被观测并登记：大小写不敏感、无软链/硬链、`flock` 不支持 | MUST |

## 7. 假设与约束
| # | 假设 / 约束 | 影响 |
|---|---|---|
| A1 | 设备无 git 二进制（toybox 不提供），且不可能通过申请权限解决 | 纯 JS 是唯一路线 |
| A2 | `HOME` = `<filesDir>`、`XDG_CONFIG_HOME` = `<filesDir>/config` | 凭据与插件落点据此推导 |
| A3 | 插件激活顺序晚于内置 provider，且编辑器语义为「同 id 后写者胜」 | 覆盖成立；若上游改为禁止覆盖则走回退（FR-108-032） |
| A4 | 平台无软链、`hmdfs` 大小写不敏感、`flock` 不支持 | 依赖 copy 物化；并发语义降级须登记（NFR-108-007） |
| A5 | 本壳无审批 / 提权交互面 | 越界只能拒绝，不做「申请后放行」 |
| A6 | 目标主机网络可达（同类设备上部分公网主机超时已记录） | 无账号用例允许换可达等价仓库并如实记录 |
| A7 | 上游基线 pin v2.0.26 | 升级需复跑装配、工具表与界面覆盖三项 |

## 8. 依赖
| 依赖 | 类型 | 用途 | 状态 |
|---|---|---|---|
| 纯 JavaScript git 实现 + 其 HTTPS 传输入口 | 第三方（构建期物化） | 全部 git 操作 | 选型与版本见 plan §1.2 |
| diff 组件（纯 JS） | 第三方（构建期物化） | 统一 diff / 统计 | 同上 |
| 上游插件契约：工具注册、版本库注册、RPC 注册 | 上游 SDK | 三半的注册点 | ✅ 已存在 |
| 上游设置页注册点 | 上游源码 | 「设置 → Git」入口 | ✅ 需一条幂等补丁 |
| 上游 RPC 传输（`POST /api/rpc/:id/:method`） | 上游协议 | 页面 → 插件 | ✅ 存在 |
| `payload/opencode-server.js` 与 `payload/lib/*` | 本工程（101/102） | 启动期插件投放 | 🚧 需新增投放步骤 |
| `scripts/collect-opencode.mjs` | 本工程（102） | 载荷组装与物化入口 | 🚧 需扩展 |
| `docs/204-插件-GIT.md`（`oc-desktop-hos`） | 参考工程 | 已验证的设计与踩坑清单 | 🔶 只引用不复制 |
| `specs/107-compliance` / `109-regression` | 兄弟模块 | 文案与权限面判定、真机闭环证据 | 🚧 |
| Node 内建 `fs` / `fs/promises` / `path` | 运行时 | 适配层、凭据文件 | ✅ 可用 |
