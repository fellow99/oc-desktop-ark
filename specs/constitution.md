# oc-desktop-ark 宪法（Constitution）

> **地位**：本文件是本工程的**最高约束**。`specs/**` 的任何 `spec.md` / `plan.md` 与实现，若与本文冲突，以本文为准。
> **来源**：条款不是发明的，而是从 `docs/000-工程规划.md`（v0.3）与两个参考工程（`@fellow99/node-bridge` 库契约、`pi-desktop-ark` 同形态落地、`oc-desktop-hos` 真机教训）中**抽取**而来。
> **修改**：改本文必须同时改 `docs/000-工程规划.md` 的对应章节，并在 `specs/SPECS_CHECKLIST.md` 登记影响面。

---

## 一、六条核心原则

### C1 壳薄、契约硬

ArkTS 层**只**做四件事：**启动编排 / 观测 / 宿主能力 / 渲染**。业务逻辑一律在 Node 侧（opencode 服务端）。

- 禁止在 ArkTS 里实现会话、消息、模型、工具调用等业务语义。
- ArkTS ↔ Node 的**唯一**业务通道是同源 HTTP/SSE；**不新增** preload 桥、自定义协议或 IPC 载体。
- 宿主能力只经 `HostBridge`（JSON 入出，名字必须已注册；未注册必须 reject，不得静默返回空）。

### C2 不隐藏平台真相

平台做不到的事，必须让用户看见，不许静默降级、不许假装成功。

- 终端 / PTY、内容搜索、MCP 外部进程、后台常驻、用户目录直写等缺口，UI 必须给出可读原因。
- 每个启动阶段都有**中文阶段文案 + 结构化日志**；失败必须落到错误页（含原因与日志尾）。
- `NodeRuntime.start()` 返回 ok 只代表**已投递**，不代表**已就绪**；就绪必须有独立判据（marker/日志/HTTP）。

### C3 谁写谁读

需要 Node 读取的文件，由 **Node 自己写**；ArkTS 不写业务文件、不解压业务载荷。

- 载荷若走 `tar.gz`，解包器在 Node 侧；ArkTS 只负责把归档放到只读位置。
- 幂等 marker 由写方维护；读方只读、不改。
- 日志同理：库写 `payload/app.log`，本工程写 `logs/server.log`，**不共文件**。

### C4 不改上游

对 `opencode` 只允许**幂等补丁**，不做长期分叉。

- 补丁判据：`git apply --reverse --check` 成功即「已应用」；应用后必须能反向校验通过。
- 补丁**不落在**既有补丁的上下文区间（前后各 3 行）；新补丁追加到列表末尾。
- 换上游基线必须**新建** `patches/<新 tag>/`，不就地改。
- 能用上游机制（`OPENCODE_*` 环境变量、条件变体、配置）解决的，**不打补丁**。

### C5 进程内 Node 崩溃是终态

`node::Start` 每进程只能一次，没有优雅重启路径。

- 载荷顶层必须有 `uncaughtException` / `unhandledRejection` 兜底，并把栈写进自己的日志。
- 崩溃后 UI 明确提示「请重启应用」，不提供假的「重试启动」。
- 端口冲突必须在设计上消除（`--port 0` + marker），不得依赖用户手动腾端口。

### C6 判据可证伪

每条需求/验收都写成「能观测到 X」或「X 消失」，不写「看起来正常」。

- 禁用判据：hilog「有没有那行」、`VmSize`、点击看起来生效。
- 允许判据：HTTP 端点 JSON 字段、marker 文件内容、两次 `dumpLayout` 差异、截图、SHA-256。
- 没实测的结论必须标 `⬜ 待验证`，不许写成结论。

---

## 二、工程纪律

### D1 文档权威顺序

1. 本宪法
2. `docs/000-工程规划.md`（唯一权威规划）
3. `specs/overall-*.md`（整体规格/方案/数据模型）
4. `specs/<NNN>-*/spec.md` + `plan.md`
5. 代码注释与 README

**运行时的一切结论以 `@fellow99/node-bridge` / `@fellow99/node-runtime` 的库文档（[fellow99/ohos-node-bridge](https://github.com/fellow99/ohos-node-bridge)）与本工程根 `runtime.lock.json` 为准**，本工程只引用不复述。

### D2 证据标注

所有文档与代码评审结论必须带标记：`✅ 实测` / `🔶 沿用` / `⬜ 待验证` / `⚠️ 冲突`。推断不得冒充实测。

### D3 单一事实源

- 端口/路径/环境变量名：只在 `entry/src/main/ets/common/Constants.ets` 与 `payload/lib/env.js` 定义一次，两边**镜像**而非各写一套。
- 补丁清单：只在 `patches/v2.0.26/README.md` 与 `scripts/apply-patches.mjs` 的目录扫描逻辑中体现。
- 版本号：`AppScope/app.json5` 一处定义，其余引用。

### D4 共享 submodule 的基线守卫

`../opencode` 被 `oc-desktop-hos` 与本工程**共用**。因此：

- 打补丁前必须校验 `HEAD = 9b4ec5714d` 且工作树干净；
- **同一时刻只允许一个工程处于「已打补丁」状态**，构建必须串行；
- 需要丢弃本地改动时必须显式 `--reset --yes`（先 `git clean -nd` 打印将删除项）。

### D5 提交纪律

- 使用 **Conventional Commits**：`<type>[scope]: <description>`，type 仅取 `feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`。
- 一个逻辑变更一个提交；描述用祈使句、现在时、<72 字符。
- 签名材料、证书口令、API Key **永不入库**。
- 不 `--force`、不 `--no-verify`、不改 git config。

### D6 版本与分支

- 版本：`versionName 2.0.26` / `versionCode 20026`（`major*10000 + minor*100 + patch`），与上游对齐。
- 分支：遵循需求方指定；**未指定时不在子模块内新建分支**。

---

## 三、安全边界

| # | 规则 |
|---|---|
| S1 | 服务端只监听 `127.0.0.1`（路线 B 时才 `0.0.0.0`，且必须保留密码 + 随机端口 + UI 提示） |
| S2 | 密码由宿主生成，落 `<filesDir>/ark/connection.json`（0600）；**不进日志、不进崩溃记录** |
| S3 | `?auth_token=` 只用于一次首屏导航；日志与诊断面板只记录 `?auth_token=***` |
| S4 | ACL 按**真实需要**申报；多一项必须写理由（声明面 = 使用面，脚本比对） |
| S5 | 不在 release 构建保留 `--inspect`、`probeFlags`、诊断端点等调试通道 |
| S6 | 目录访问必须经用户授权（Picker / `fileShare`），不假设用户目录可读写 |
| S7 | 上架版本不得包含任何绕过平台签名或可执行内存控制的组件（G11） |

---

## 四、质量门（缺一不可）

| 门 | 命令 / 判据 | 通过标准 |
|---|---|---|
| G-补丁 | `node scripts/apply-patches.mjs --check` | 基线正确、工作树干净、3 条补丁均可干净应用 |
| G-语法 | `node --check scripts/*.mjs payload/**/*.js` | 无语法错误 |
| G-载荷 | `node scripts/build-opencode.mjs` + `collect-opencode.mjs` | 产出 `dist-node/opencode.mjs` + `assets/app-archive.bin` |
| G-host | `node scripts/smoke-node24.mjs` | `/api/info` 200、`/` 返回 SPA、SSE 首事件 |
| G-编译 | `hvigorw assembleHap` | 产出 HAP（有签名材料则签名） |
| G-规格 | `specs/SPECS_CHECKLIST.md` | 所有条目 ✅，无 🚧 遗留 |
| G-评审 | `REVIEW_REPORT.md` | 无 Critical 未决项 |

**任一红门不得进入下一阶段**；红门必须记录到 `logs/<YYYYMMDD>-<N>/` 并在报告中如实说明。

---

## 五、治理

### 5.1 规格编号

- 项目级：`P-01..P-09`（见 `SPECS_CHECKLIST.md`）
- 模块级：`1NN-<模块>-<二级模块>`，`NN` 从 `01` 起；**跳号不回填**，新模块追加。
- 需求级：`<需求编号>` 目录（如 `000-scaffold`）只在其生命周期内存在，归档后合入模块规格。

### 5.2 变更控制

| 变更 | 必须同步 |
|---|---|
| 上游 tag 升级 | `docs/000-工程规划.md` 文档头、`patches/<新 tag>/`、`TECH.md`、`overall-plan.md`、`runtime.lock.json` 引用 |
| 运行时升级（bridge） | `TECH.md`、`overall-plan.md`、`SPECS_CHECKLIST.md`、回归四件套 |
| ACL 变更 | `docs/ACL申请清单.md`、`overall-data-model.md` 的权限实体、`107-compliance` |
| 包名/显示名变更 | 三处同步（`AppScope` + 三套 `string.json`）、备案材料、`constitution.md` §D6 |

### 5.3 非目标（不得悄悄扩张）

- 不随包分发 Chromium / Electron；不做 phone 适配；不做 PTY；不做自有 ELF 分发；不做插件在线安装（v1）。

---

## 六、参考工程与许可

| 工程 | 关系 | 许可 |
|---|---|---|
| `opencode`（v2.0.26） | 上游，仅幂等补丁 | MIT |
| `@fellow99/node-bridge` / `@fellow99/node-runtime`（ohpm 包） | 运行时依赖（双包：接口与加载器 / Node 引擎本体） | MIT（runtime 包随附 Node.js 官方 LICENSE） |
| `pi-desktop-ark` | 同形态参考（骨架来源） | MIT |
| `oc-desktop-hos` | 能力对照基线 + 补丁根因来源 | MIT |
| Node.js v24.2.0 | 随包分发运行时 | MIT（含 V8/OpenSSL/ICU 等第三方许可） |

随包分发必须附第三方许可清单（见 `107-compliance` 的 G4）。
