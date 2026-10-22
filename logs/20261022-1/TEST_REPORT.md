# TEST_REPORT —— 108-git-plugin + shell 纯 JS 解析（真机）

> 日期：2026-10-22 ｜ 分支 `main`（未改动）｜ 设备：`HAD-W32`（2in1）/ OpenHarmony 7.0.0.109 / API 26
> 需求：任务1「shell 工具依赖 tree-sitter WASM → 纯 JS 解析」；任务2「实现 108-git-plugin」
> 用例：`specs/108-git-plugin/test-cases.md`（新）+ `specs/110-jitless/test-cases.md`
> **敏感信息**：API key / 仓库 URL / 账号 / 口令只作运行时输入，本文零落盘（已全仓扫描复核）。

## 一、构建与部署

| 步骤 | 结果 |
|---|---|
| 补丁 | 4 条（0001/0003/0006 + **0008 Git 设置页**）应用成功 |
| bundle 重建 | bun **1.4.2**（临时装到 scratch，不动系统）→ `opencode.mjs` 16,452 kB（含 0008 UI） |
| bundle 守卫 | photon 初始化 + **shell 命令扫描器**：各 1 处锚点替换 + 回读 + `node --check` 通过 |
| 依赖物化 | `isomorphic-git@1.44.2` + `diff@9.0.0` → 56 包 / 828 文件 / **7.76 MB**（≤12 MB） |
| 载荷 | 916 文件 / 70.3 MB（原 86 / 62.5 MB） |
| HAP | BUILD SUCCESSFUL，**120,052,473 B**（114.5 MiB，原 111.6 MB，+8.4 MB） |
| 安装/启动 | `install bundle successfully`；`plugins 投放：2 个（新投放 2 / 失败 0）` |

## 二、任务1：shell 工具纯 JS 解析（TC-108-20）

真机会话里用 `shell` 工具：

| 命令 | 修复前 | 修复后 |
|---|---|---|
| `echo shell-ok-108` | 工具直接报 `WebAssembly is not defined` | ✅ 输出 `shell-ok-108`，exit 0 |
| `git --version` | 同上（工具不可用） | ✅ `/bin/sh: git: inaccessible or not found`，exit 127 |

实现：投放期单锚点替换，把上游分叉条件补成
`(tn?.portable || typeof WebAssembly === "undefined")` ⇒ compat 走 bundle 自带的**纯 JS** `ShellScan`，
jit 形态表达式等价（行为不变）。三闸校验（锚点唯一 / 回读 / `node --check`）每次 collect 都跑。

## 三、任务2：108-git-plugin

### Host（无设备）

| 用例 | 结果 |
|---|---|
| TC-108-01 静态契约 | ✅ `collect-plugins --check-only`：21 工具 / 依赖 pin / 无子进程 / 无原生模块 |
| TC-108-02 依赖物化 + 断言 | ✅ 56 包 / 828 文件 / 7.76 MB；版本、传输入口、包数、体积、无 `.node/.so`、无软链、`.bin` 剔除 |
| TC-108-03 投放 + manifest | ✅ `plugins/oc-plugin-git/**` 全量进 manifest |
| TC-108-04 宿主门禁 | ✅ `verify-git-plugin.mjs`：语法 + 契约 + 装配（21 工具 / VCS 注册 / RPC 形状 / handler 全 async）+ 离线闭环 init→add→commit→status→log→diff |
| TC-108-05 插件单测 | ✅ `node --test`：**34 过 / 0 失败 / 2 跳过**（跳过项需联网） |
| TC-108-06 投放幂等 | ✅ 首启 copied，重启 up-to-date（摘要命中） |
| TC-108-07 补丁幂等 | ✅ 4 条可反向校验 |
| TC-108-08 权限面 | ✅ requestPermissions=6 / definePermissions=1（零新增） |

### 真机

| 用例 | 结果 | 证据 |
|---|---|---|
| TC-108-09 插件加载 | ✅ | `/api/plugin`：`oc-ark-git {status: active}`；`node.log`：`[ark] plugin oc-ark-git: tools=21 vcsProvider=git(override) credentials=<path> root=<workspace>` |
| TC-108-10 本地全链 | ✅ | 会话内 init → write → add → commit(`8c4bf2d078`) → status(`No changes`) → log |
| TC-108-11 公开仓 clone | ✅ | `git_clone` depth=1 成功（~11.5 s），`git_log` 得 `4d661d0eda`，`git_branch` `* main`，`ls` 列出 8 项 |
| TC-108-12 带账号仓 | ✅ | 先 `credentials.save`（RPC）→ `git_clone` 私有仓成功（528 ms，HEAD `899c37d7d5`，与 host `ls-remote` 一致）；命令里**无**任何用户名/口令 |
| TC-108-13 凭据权限 | ✅ | `credentials.describe`：`mode="600"`、`count=1`；`credentials.list` 只回 `passwordLength=6`，**不回显口令** |
| TC-108-16 VCS 界面覆盖 | ✅（修复后） | `/api/vcs` → `{"provider":"git","branch":{"current":"main","default":"main"}}`；`/api/vcs/branch` → `["main"]`；`/api/vcs/diff?mode=working` → 带 `---/+++/@@` 的真实 patch；`/api/vcs/status` → 文件级 additions/deletions |
| TC-108-19 compat 下 git | ✅ | 上述 10/11/12 均在 `--jitless`（compat）形态完成 |
| TC-108-20 shell 工具 | ✅ | 见 §二 |
| TC-108-21 包体 | ✅ | HAP +8.4 MB（插件 7.76 MB + 0008 UI），低于 NFR 12 MB 上限（单插件） |

简单测试（用户在 §调试/测试 里列的）：**创建工作区** ✅（`demo110` / `gitdemo` / `priv108` / `website108`）、
**一次对话** ✅（`7+5`→`12`、`3+3`→`6` 等多次 `finish=stop`）、**看图分析** ✅（本轮重跑，正确识读截图界面文字）。
DeepSeek 凭据沿用上一轮写入的应用内凭据库（未重新落盘）。

## 四、VCS provider 覆盖：从「未生效」到「已生效」的完整取证

### 4.1 现象（修复前）

`vcs.transform(...)` 返回成功、诊断行也写 `vcsProvider=git(override)`，但三个接口全空：

```
GET /api/vcs          → {"branch":{}}
GET /api/vcs/status   → []
GET /api/vcs/branch   → []
```

关键指征：响应里**没有 `provider` 字段**。上游 `Vcs.Info = { provider?: string; branch: {current?, default?} }`，
`Vcs.info()` 直接返回缓存对象 `an.info`（初值 `{branch:{}}`），只有 refresh 选中 provider 后才会写成
`{...providerInfo, provider: pid}`。**没有 provider 字段 ⇒ 从来没有选中过任何 provider**，而不是「选中了但返回空」。

### 4.2 上游代码路径（bundle 内取证）

```js
const rn = $t.vcs                                   // location.vcs（Project.resolve 得出）
const an = { info: { branch: {} } }                 // 缓存的 info
const hn = create$2({ name: "vcs", initial: () => ({ providers: new Map }),
  editor: vn => ({ add: bn => vn.providers.set(bn.id, bn),
                   default: { get: () => vn.selection, set: bn => vn.selection = bn } }),
  notify: () => reconcile(tn, nn, () => wn()) });
const _n = () => { const vn = hn.get(), bn = vn.selection ?? rn?.type; return bn ? vn.providers.get(bn) : undefined };  // selected()
const wn = ("Vcs.refresh")(… 有 selected ⇒ an.info = {...info, provider: pid} ; 否则 an.info = {branch:{}} …);
info: ("Vcs.info")(function* () { return an.info })   // 直接给缓存
```

两条硬约束：

1. `selected() = state.selection ?? location.vcs?.type`。设备**没有 git 二进制** ⇒
   `Project.resolve` 里的 `Git.repo.discover`（`git rev-parse`）永远失败 ⇒ `location.vcs` 恒 `undefined`；
   于是**只有** plugin 自己 `editor.default.set("git")` 才可能被选中。
2. `Vcs.info()` 是缓存；只有 `notify()`（editor 变更 → `reconcile` → `refresh`）或仓库文件事件才会重算。

### 4.3 真正的根因（本地桩上下文复现）

`plugins/oc-plugin-git/index.js` 的 transform 回调里用了 `VCS_PROVIDER_ID`，但**只 import 了
`createVcsProvider`**，没有 import 这个常量 ⇒ 回调一旦被执行就抛
`ReferenceError: VCS_PROVIDER_ID is not defined`：

```
[ark] plugin oc-ark-git: vcs provider registration failed: VCS_PROVIDER_ID is not defined
[ark] plugin oc-ark-git: tools=21 vcsProvider=none …
```

而真机上这条错误**没有**冒到 setup 的日志里，因为上游 `vcs.transform(fn)` 的 `fn` 是**异步**执行的
（真机日志顺序可证：先打 `… vcsSelection=n/a`，**之后**才打 `vcs editor: …`）。于是：

- 注册回调抛错 → `providers` 里没有我们的 `git` → `selection` 也没设 → `selected()` 恒 undefined → 三个接口全空；
- 我们的诊断行只反映「transform 这个 promise 走了没」，**不反映副作用**，所以它报了假成功 `git(override)`；
- 之前试过的「`setTimeout` 补注册」「`editor.default.set`」都没用，因为**回调本身就挂了**。

### 4.4 修复

1. `import { VCS_PROVIDER_ID, createVcsProvider } from "./lib/vcs.js"`（补齐常量导入）。
2. transform 内显式 `editor.default.set("git")`——注册 ≠ 被选中（真机上 `location.vcs` 永远算不出来）。
3. 诊断改为**副作用**口径：回调里打 `vcs editor: keys=add,default default=true selection=git`，
   setup 结尾那行把未知状态写成 `pending(见下一行 vcs editor)`，不再假装成功。
4. 每次工具执行后 `context.vcs.reload()`（`Vcs.info()` 有缓存，改仓库后必须刷新）。

### 4.5 修复后真机结果

```
GET /api/vcs                    → {"provider":"git","branch":{"current":"main","default":"main"}}
GET /api/vcs/branch             → ["main"]
GET /api/vcs/status             → [{"file":"demo110/hello.txt","additions":1,"deletions":0,"status":"added"}, …]
GET /api/vcs/diff?mode=working  → [{"file":"demo110/hello.txt",
                                   "patch":"--- a/demo110/hello.txt
+++ b/demo110/hello.txt
@@ -0,0 +1,1 @@
+jitless-ok
", …}]
node.log                        → [ark] vcs editor: keys=add,default default=true selection=git
```

⇒ 应用自带的变更/分支/差异界面在**没有 git 二进制**的设备上重新工作（FR-108-030/031 达成）。

### 4.6 教训（已写进代码注释）

- 「注册成功」的日志必须来自**回调内部**，不能来自 `await transform(...)` 之后——异步回调和 try/catch 会合谋制造假绿。
- 上游 `Vcs` 是「**注册 + 选中**」两步，缺一步就是空实现；`location.vcs` 在无 git 设备上永远推导不出来。

## 五、本轮修掉的评审问题（详见 REVIEW_REPORT.md）

Critical/Important 已修：VCS 选择（`VCS_PROVIDER_ID` 导入 + `editor.default.set` + `vcs.reload` 挂钩，**已生效**）、
插件投放的「目标摘要校验」（防被改写/删文件仍报最新）、原子投放（tmp + rename，防中途失败毁掉旧插件）、
载荷移除后清理陈旧插件、包计数不再把 `@scope` 当包、静态断言覆盖 `.cjs/.mjs`、
凭据文件 `0600` **回读校验**（不达标即 `write-failed`）。

## 六、遗留

1. ~~VCS 界面覆盖未生效~~ **已修复**（根因：`VCS_PROVIDER_ID` 未 import + 诊断口径错误；见 §四）。
2. 依赖树无 lockfile（评审 Important 5）：`npm install` 无 lock ⇒ 传递依赖可能漂移。建议提交
   `package-lock.json` 并改 `npm ci`；本轮已在缓存里固定一份，但未入库。
3. `collect-opencode` 冷缓存时会联网装依赖（评审 Important 6）：CI 需预置 `.cache/git-plugin-runtime`。
4. 围栏的 `realpath` 与 `readWorkdir` 未完全走 `fence.resolveWithin`（评审 Minor 11）；`dir` 缺省用 setup 期 cwd（Minor 12）。
5. `verify-git-plugin.mjs` 尚未断言「`editor.default.set` 被调用」、也还没有 `payload/lib/plugins.js` 的单测（Minor 9）。
