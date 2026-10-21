# test-cases.md —— `108-git-plugin` 测试用例

> 对应 [`spec.md`](./spec.md) 的 `FR-108-*` / `NFR-108-*` 与 §5 验收场景；任务见 [`tasks.md`](./tasks.md)。
> 每条用例必须有**可复现命令**与**可判读期望**；不允许「应该可以」。
> 分层：**H = host（无设备/无网络）** → **D = 真机（hdc + 会话）** → **N = 负例必存**。
> **敏感信息纪律**：仓库 URL / 账号 / 口令 / API key 只作运行时输入，**不落盘**任何文档与日志。

---

## 一、Host 层（`node scripts/...`；不联网）

### TC-108-01 插件源静态契约
```bash
node scripts/collect-plugins.mjs --check-only
```
期望：`✓ --check-only：插件源静态断言通过`——21 个工具名齐全、依赖 pin（isomorphic-git@1.44.2 / diff@9.0.0）、
`package.json` 为 `type: module`、源码零 `child_process`/`spawn`/`exec`/`.node`。

### TC-108-02 依赖物化与断言
```bash
node scripts/collect-plugins.mjs            # 首次会 npm install 到 .cache/git-plugin-runtime
node scripts/collect-plugins.mjs            # 第二次应命中缓存（不联网）
```
期望：`✓ 投放 oc-plugin-git：828 文件 / 56 包 / 7.75 MB`；
断言覆盖版本 pin、`isomorphic-git/http/node` 入口存在、56 包、≤ 12 MB、无 `.node`/`.so`、无符号链接、`.bin` 已剔除。
反例（手工构造应失败）：改 `PINS.packages` → 抛「依赖包数不符」；删 `http/node` → 抛「缺少 HTTPS 传输入口」。

### TC-108-03 投放进载荷并由 manifest 覆盖
```bash
node scripts/collect-opencode.mjs
grep -c 'plugins/oc-plugin-git/index.js' entry/src/main/resources/resfile/opencode/manifest.sha256
```
期望：审计输出含 `git 插件：56 包 / 828 文件 / 7.75 MB`；manifest 里 `plugins/oc-plugin-git/**` 条目齐全（含 `node_modules`）。

### TC-108-04 宿主门禁（语法 + 契约 + 装配 + 离线闭环）
```bash
node scripts/verify-git-plugin.mjs
```
期望：末行 `✓ 108-git-plugin 门禁通过`，且包含
`装配：21 个工具注册成功` / `VCS provider 覆盖已注册（id=git）` / `RPC 定义可被上游接受` /
`离线闭环：git_init|add|commit|status|log|diff ✓`。

### TC-108-05 插件自带单测
```bash
cp -r .cache/git-plugin-runtime/node_modules plugins/oc-plugin-git/node_modules   # 仅本地跑测需要（gitignored）
node --test plugins/oc-plugin-git/tests/*.test.mjs
```
期望：`pass 34 / fail 0 / skipped 2`（跳过项是联网集成用例；如实 SKIP，不假绿）。

### TC-108-06 启动期投放幂等（PC 侧真实进程）
```bash
# 用 --jitless 起服务端（≈ 真机 compat 形态），连跑两次
node --jitless payload/opencode-server.js
```
期望：首次日志 `plugins 投放：2 个（新投放 2 …）`；第二次 `已最新 2`（摘要命中）；
`plugins facts={"ok":true,"plugins":["oc-plugin-git:copied"…]}`。

### TC-108-07 patch 幂等
```bash
node scripts/apply-patches.mjs --check
```
期望：4 条补丁（0001/0003/0006/**0008**）「已应用」或「可干净应用」；`0008` 可 `--reverse --check`。

### TC-108-08 不改权限面
```bash
node scripts/check-acl-surface.mjs
```
期望：`requestPermissions=6 / definePermissions=1` 与 110 基线一致（本模块零新增权限，FR-108-045）。

---

## 二、真机层（`hdc`；需 API key / 网络）

> 通道：`hdc fport tcp:18400 tcp:<filesDir>/payload/server.ready.json 的 port`，Basic 认证用服务端 `OPENCODE_PASSWORD`。
> 会话内调用工具走 `POST /api/session/{id}/prompt`（让模型调 `git_*`），或直接 `POST /api/rpc/oc-ark-git/*`。

### TC-108-09 插件加载与工具可见
```bash
GET /api/plugin                     # 期望 oc-ark-git: {status: active}
GET /api/model                      # 前置：模型可用
```
期望：`active`；`server.log` 含 `[ark] plugin oc-ark-git: tools=21 vcsProvider=git(override) credentials=<路径> root=<根>`。

### TC-108-10 本地仓库全链（D）
会话里依次：`git_init` → 写文件（write 工具）→ `git_add` → `git_commit` → `git_status` → `git_log` → `git_diff`。
期望：每步都返回可读结果；`git_status` 为 `No changes`；`git_log` 含刚提交的标题；`git_diff` 含 patch 文本。

### TC-108-11 无账号远端 clone（D）
```text
git_clone({ url: "<无账号公开仓库的 https 地址>", depth: 1 })
```
期望：clone 成功并列出默认分支与文件；仓库落在会话目录内。（仓库地址由执行者运行时给出，**不写入文档**。）
负例（N）：对同一远端 `git_push` → 明确报「未配置凭据 + 主机 + 设置入口 + 文件路径」，**不是**裸 401。

### TC-108-12 带账号仓库读写（D，凭据运行时注入）
```bash
POST /api/rpc/oc-ark-git/credentials.save
  { "input": { "host": "<私有 git 主机:端口>", "username": "<u>", "password": "<p>" } }
```
期望：`{ ok: true, code: "ok", path: "<filesDir>/.git-credentials" }`；随后
`git_clone({ url: "http://<host:port>/<group>/<repo>.git" })` 成功、`git_pull` 成功。
**口令不回显**：`credentials.list` 只给 `passwordLength`。

### TC-108-13 凭据文件权限（D）
```bash
hdc shell "stat -c '%a' <filesDir>/.git-credentials"
```
期望：`600`。（hmdfs 可能静默改权限 ⇒ 写入后必须回读校验，失败即 `write-failed`。）

### TC-108-14 围栏负例（N）
```text
git_status({ dir: "../../" }) / git_status({ dir: "/data" })
```
期望：拒绝并给可照抄指引（「把项目根换成目标目录」），且**未产生任何文件系统写入**。

### TC-108-15 revert fail-closed（N）
先制造工作区分叉（本地提交与远端/索引冲突）再 `git_revert`。
期望：拒绝执行并列出冲突路径，用户改动未被覆盖。

### TC-108-16 VCS 界面覆盖（D）
在有 `.git` 的工作区打开变更/分支界面。
期望：显示当前分支与变更条目，点开有 patch 文本（覆盖内置 provider；否则内置 provider 会因无 git 二进制返回空）。

### TC-108-17 回退隔离（D/N）
停用插件（把插件目录改名）后重启。
期望：界面回到上游降级态（空），**不崩**；`/api/plugin` 无 `oc-ark-git`。

### TC-108-18 设置页自门控（D）
插件缺失/RPC 不可达时打开「设置」。
期望：「Git」Tab 不出现（不弹错误框）；插件回来后 Tab 出现，保存口令后显示「已配置（长度 N）」。

---

## 三、与其它模块的交叉

### TC-108-19 110-jitless 联动：compat 下工具可用（D）
在 `--jitless`（compat）形态下跑 TC-108-10。
期望：全链可用（纯 JS git 不依赖 WASM；`shell` 工具走纯 JS portable 扫描器，不触达 tree-sitter）。

### TC-108-20 110-jitless 联动：shell 工具可用（D）
会话里 `shell` 工具执行 `git --version` 与 `echo ok`。
期望：工具**不再**报 `WebAssembly is not defined`；`echo ok` 返回 `ok`（`git` 若不存在则应给「命令不存在」的可读失败，而不是工具崩溃）。

### TC-108-21 包体与首启（D）
记录 HAP 体积与首启耗时（含插件投放）。
期望：包体增量 ≈ 7.75 MB（≤ 12 MB，NFR-108-002）；首启增量记录在案（投放摘要命中时不再复制）。

---

## 通过判据

- Host（TC-108-01…08）全绿；
- 真机必须通过：TC-108-09/10/11/12/13/19/20；
- 负例必存且行为符合预期：TC-108-11 负例、14、15、17、18；
- 敏感信息（仓库 URL / 账号 / 口令 / key）**零落盘**。
