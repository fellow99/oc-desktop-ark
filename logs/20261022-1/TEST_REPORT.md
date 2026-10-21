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
| TC-108-16 VCS 界面覆盖 | ❌ **未生效** | `/api/vcs` → `{"branch":{}}`、`/api/vcs/status` → `[]`、`/api/vcs/branch` → `[]`（响应里**没有** `provider` 字段 ⇒ 上游没选中我们的 provider） |
| TC-108-19 compat 下 git | ✅ | 上述 10/11/12 均在 `--jitless`（compat）形态完成 |
| TC-108-20 shell 工具 | ✅ | 见 §二 |
| TC-108-21 包体 | ✅ | HAP +8.4 MB（插件 7.76 MB + 0008 UI），低于 NFR 12 MB 上限（单插件） |

简单测试（用户在 §调试/测试 里列的）：**创建工作区** ✅（`demo110` / `gitdemo` / `priv108` / `website108`）、
**一次对话** ✅（`7+5`→`12`、`3+3`→`6` 等多次 `finish=stop`）、**看图分析** ✅（本轮重跑，正确识读截图界面文字）。
DeepSeek 凭据沿用上一轮写入的应用内凭据库（未重新落盘）。

## 四、VCS provider 未生效：取证与结论

现象：`vcs.transform(...)` 返回成功、诊断行报 `git(override)`，但 `/api/vcs` 三类接口都返回空且**没有** `provider` 字段。

代码取证（bundle 内）：上游 `Vcs` 的 editor 形状是 `{add, default:{get,set}}`，
`selected()` = `state.selection ?? location.vcs?.type`：

- `location.vcs` 由 `Project.resolve` 调 `git rev-parse` 得到 —— **设备没有 git 二进制**，永远算不出来（恒 `undefined`）；
- `selection` 需要 plugin 显式 `editor.default.set("git")` 才会被设置。

本轮已按此加了 `editor.default.set(VCS_PROVIDER_ID)`（并把「注册 ≠ 被选中」写进注释），
但真机仍为空 ⇒ **本版本 plugin 侧 editor 很可能只暴露了 `add`**（`editor.default` 为 undefined，可选调用被跳过）。
⇒ 结论：**VCS 界面覆盖在本版本不可用**，属 spec FR-108-030/031 未达成；按 FR-108-032 的「仅工具」回退，
界面维持上游降级态（空），不崩。下一步需要确认 plugin promise 适配器是否透出 `default.set`，
或改走一条上游补丁（把 `location.vcs` 的判定从「git 可执行」改为「provider 存在」）。

## 五、本轮修掉的评审问题（详见 REVIEW_REPORT.md）

Critical/Important 已修：VCS 选择（`editor.default.set` + `vcs.reload` 挂钩，**接口未透出 ⇒ 仍未生效**）、
插件投放的「目标摘要校验」（防被改写/删文件仍报最新）、原子投放（tmp + rename，防中途失败毁掉旧插件）、
载荷移除后清理陈旧插件、包计数不再把 `@scope` 当包、静态断言覆盖 `.cjs/.mjs`、
凭据文件 `0600` **回读校验**（不达标即 `write-failed`）。

## 六、遗留

1. **VCS 界面覆盖未生效**（§四）：需确认 plugin 适配器是否透出 `editor.default.set`，否则需一条上游补丁。
2. 依赖树无 lockfile（评审 Important 5）：`npm install` 无 lock ⇒ 传递依赖可能漂移。建议提交
   `package-lock.json` 并改 `npm ci`；本轮已在缓存里固定一份，但未入库。
3. `collect-opencode` 冷缓存时会联网装依赖（评审 Important 6）：CI 需预置 `.cache/git-plugin-runtime`。
4. 围栏的 `realpath` 与 `readWorkdir` 未完全走 `fence.resolveWithin`（评审 Minor 11）；`dir` 缺省用 setup 期 cwd（Minor 12）。
5. `verify-git-plugin.mjs` 尚未断言「`editor.default.set` 被调用」、也还没有 `payload/lib/plugins.js` 的单测（Minor 9）。
