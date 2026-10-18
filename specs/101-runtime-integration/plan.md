# 101 运行时接入 — 技术方案（plan）

> 模块：`101-runtime-integration`｜文档：plan.md（怎么做）
> 对应规格：`./spec.md`（FR-101-001…013、AS-101-01…07）
> 权威顺序：`specs/constitution.md` → `docs/000-工程规划.md` → `overall-plan.md` → 本文
> 运行时的一切结论以 `ohos-node-bridge/docs/000-工程规划.md` 为准，本文只引用不复述。

## 1 技术上下文（运行时与依赖版本）

| 项 | 值 | 来源 |
|---|---|---|
| 应用形态 | ArkTS + ArkUI，Stage 模型，`deviceTypes: ["2in1","tablet"]` | `TECH.md:10-15` |
| SDK / 构建 | HarmonyOS 6.1.1.125 / API 24；hvigor 6.24.2 | `TECH.md:12-13` |
| 运行时库 | `@fellow99/node-bridge` **0.1.0**（HAR：`libs/@fellow99/node-bridge.har`） | `ohos-node-bridge/README.md:14` |
| 运行时 | Node **v24.2.0**，ABI **137**，`platform="openharmony"`、`arch="arm64"` | `TECH.md:22,25` |
| 运行时产物 | `libnode-arm64.so` **126,809,264 B**，SHA-256 `3019bf5f…` → `entry/libs/arm64-v8a/libnode.so` | `TECH.md:23`；`ohos-node-bridge/runtime.lock.json` |
| C++ 运行库 | `libc++_shared.so`（取自 SDK `native/llvm/lib/aarch64-linux-ohos/`） | `TECH.md:24`；`tools/provision.mjs:211` |
| 应用版本 | `versionName 2.0.26` / `versionCode 20026` | `TECH.md:83` |
| 启动 API | `NodeRuntime.getInstance().start(context,{scriptPath,env,flags,logPath})` / `logs(n)` / `lastCrash()` / `onStateChange` / `shutdown(reason)` | 库文档 §5.3:426-461 |

**硬前提**：`node::Start` 每进程一次；`dlopen` 只认裸名 `libnode.so`；`process.cwd()`=`/`、`execPath`=`/system/bin/appspawn`（库 `README.md:72-75`）。

## 2 宪法合规（逐条）

| 原则 | 判定 | 落地与证据 | 对应 FR |
|---|---|---|---|
| C1 壳薄契约硬 | ✅ | 编排类只做「投递 + 观测 + 读 marker」，无业务语义；ArkTS↔Node 无新通道（库文档 §5.4:488 方向 2 只有 start/shutdown） | FR-101-001、012 |
| C2 不隐藏平台真相 | ✅ | 六态状态机 + 每阶段中文文案 + 失败必带日志尾；`shutdown()` 如实说明「不真正停止」 | FR-101-006/007/009/011 |
| C3 谁写谁读 | ✅ | 就绪标记由 Node 侧 `payload/lib/ready.js` 写（102 交付），本模块只读不写；日志两通道不共文件 | FR-101-002、003 |
| C4 不改上游 | ✅ | 本模块零上游补丁；运行时选项全部走库 API 与 env | FR-101-005 |
| C5 崩溃是终态 | ✅ | 有崩溃记录即 `failed`，无「重试启动」；单实例 + `port 0` 消除端口冲突 | FR-101-008、010 |
| C6 判据可证伪 | ✅ | 就绪判据 = marker 文件内容 / 结构化日志行；投放判据 = SHA-256 + 退出码 | FR-101-002、004 |
| D3 单一事实源 | ⚠️ | 常量名只允许在 `common/Constants.ets` 与 `payload/lib/env.js` 镜像；实现时须用脚本比对两处变量名一致（宪法 D3） | FR-101-007 |
| D4 基线守卫 | ✅（不适用） | 本模块不打补丁；`../opencode` 的守卫由 102 负责 | — |
| S5 无调试通道 | ⚠️ | `flags` 在 release 构建固定为 `--no-verify-heap`，`--inspect`/`probeFlags` 只在 debug 生效（对照 `EntryAbility.ets:27-49`） | FR-101-013 |

## 3 研究结论与依据

| # | 结论 | 依据（path:line） | 对应 FR |
|---|---|---|---|
| R1 | 启动必须两段式：`launch()` 只投递，就绪靠独立轮询；重复调用返「launching」而非再投递 | `pi-desktop-ark/entry/src/main/ets/app/PiDesktopRuntime.ets:215-231` | FR-101-001、008 |
| R2 | 端口两级来源：先读 marker，再解析库日志；两者都失败即 `port=0` → 失败态，绝不用常量端口 | 同上 `:531-566`；`common/Ports.ets:54-130`、`:196-240` | FR-101-002 |
| R3 | 只认**本轮**日志行：库 `logs()` 读的是跨启动累积的日志尾，不按投递时刻过滤会读到上一轮端口（真机实测缺陷） | `PiDesktopRuntime.ets:797-820`、`:546-557` | FR-101-003 |
| R4 | 投递前必须作废旧 marker，否则重启读到旧端口后立刻探活失败（真机实测：40477 vs 本轮 46619） | `PiDesktopRuntime.ets:270-276`、`:870-882` | FR-101-003 |
| R5 | 超时/轮询参数取 180 s / 500 ms / 60 s 三档，均常量集中 | `common/Constants.ets:146-153` | FR-101-002 |
| R6 | 关停只能如实上报：库 `shutdown()` 仅标记 + 触发 Node 钩子，`node::Start` 不返回 | 库文档 §5.3:459；`PiDesktopRuntime.ets:771-786` | FR-101-011 |
| R7 | 终止前回调必须**不取消**终止（返回 false），并同步先写一行日志（退出路径上最后一条证据） | `entryability/EntryAbility.ets:93-110` | FR-101-011 |
| R8 | 单实例靠 `launchType: "singleton"`；多实例互抢端口与 DB | `entry/src/main/module.json5:36`；规划 §6 #16 | FR-101-008 |
| R9 | 先 `loadContent`（加载页）再起 Node，权限申请也在其后，否则权限弹窗卡启动屏 | `EntryAbility.ets:52-70`；规划 §4.2 | FR-101-013 |
| R10 | 运行时以**构建好的 HAR** 消费：跨工程相对路径导入在 `useNormalizedOHMUrl` 下被 hvigor 拒（00309001） | 规划 §5.1；`ohos-node-bridge/README.md:56` | FR-101-005 |
| R11 | 投放只有一份实现（库 `tools/provision.mjs`）：幂等 + 七项 ELF 门禁 + SHA-256 锁定，任一不过硬失败 | `ohos-node-bridge/tools/provision.mjs:6-8`、`:185-196`、`:296-302`、`:309-322` | FR-101-004 |
| R12 | 环境分工：库设 `HOME`/`TMPDIR`/`NODE_OPTIONS`/`UV_USE_IO_URING`；本工程设 `XDG_*`/`OPENCODE_*`/`NO_PROXY`/`PATH` | 库文档 §5.6:505-515；`oc-desktop-hos/src-main/main.js:226-275` | FR-101-009 |

## 4 数据模型与状态机

| 实体（spec §4） | 技术落点 | 关键实现约束 |
|---|---|---|
| `RuntimeProvisioner` | `scripts/provision-runtime.sh` → `../ohos-node-bridge/tools/provision.mjs` | 唯一投放实现；哈希命中即跳过；门禁不过硬失败（FR-101-004） |
| `LaunchPlan` | `OpencodeRuntime.ets` 内 `start()` 的 options 装配（scriptPath/env/flags/logPath） | 投递前固定；`scriptPath` 恒为库 `bootstrap.js`（FR-101-001、005） |
| `ReadyMarker` | `common/Ports.ets:readMarker/parsePortFromMarker`（只读） | 写方 = `payload/lib/ready.js`；`1 ≤ port ≤ 65535`（FR-101-002、003） |
| `RuntimePhase` | `common/Constants.ets` 的六态枚举 + `OpencodeRuntime` 的转移表 | 单向；终态拒绝转移（FR-101-006） |
| `StageNotice` | `Constants.ets` 的阶段表 → `ARK_STAGE` 日志行 + 界面状态条 | 文案与日志一一对应，≥5 阶段（FR-101-007） |
| `DiagnosticSnapshot` | `OpencodeRuntime.getDiagnostics(): string`（JSON） | 只读、脱敏；日志尾 ≥50 行（FR-101-009） |

**ReadyMarker**（`<filesDir>/payload/server.ready.json`，由 102 写入，本模块只读）：

```json
{ "schema": 1, "url": "http://127.0.0.1:41234", "port": 41234, "pid": 12345, "at": 1760000000000 }
```

读取规则：文件存在 → 解析 JSON → `port` 为整数且 `1 ≤ port ≤ 65535` 才有效；解析异常按「无标记」处理并记 warn（不抛）。

**状态机**（`common/Constants.ets` 定义枚举，`app/OpencodeRuntime.ets` 持有）：

```
idle ──start()投递──▶ starting ──marker/log命中──▶ running ──关停请求──▶ stopping ──▶ stopped
                          │                              │
                          └────超时/崩溃/异常────────────┴──▶ failed（终态，不提供重启）
```

转移不变量：终态（`failed`/`stopped`）拒绝任何转移；`running` 下再次 `start()` 直接返回现状；每次转移写 `[ark][runtime] phase=<old>→<new> reason=<…>`。

## 5 接口契约

**提供（对 103/104/109）**

| 成员 | 签名 | 语义 |
|---|---|---|
| 启动 | `launch(ctx, flags): Promise<string>` | 只投递并进入轮询，返回人读状态串；失败串含「下一步该做什么」 |
| 状态 | `getState(): RuntimePhase` / `getStage(): string` | 供界面状态条与阶段文案 |
| 地址 | `getUrl(): string` / `getUrlOrPending(): string` | 未就绪返回 `''` / `'(端口未就绪)'`（对照 `PiDesktopRuntime.ets:192-201`） |
| 快照 | `getDiagnostics(): string` | JSON：state/phase/url/lastError/logTail/crash；已脱敏 |
| 关停 | `shutdown(reason): Promise<string>` | 返回如实描述，不承诺停止 |

**消费（对库）**：`start(context,{scriptPath, env, flags, logPath})`、`logs(n)`、`lastCrash()`、`onStateChange`、`shutdown(reason)`（库文档 §5.3:451-461）。
`scriptPath` 一律指向库的 `bootstrap.js`；应用入口经 `NODE_BRIDGE_ENTRY` 解析（规划 §5.2.2:315）。

**事件/日志**：`ARK_STAGE <n> <中文文案>`（每阶段一条）、`ARK_SERVER_READY {json}`（102 打印，仅作通道 ② 输入）、`[ark][runtime] phase=…`（状态转移）。日志环容量 500 行（库默认，库文档 §5.3:442）。

## 6 实现策略

- **架构模式**：单例编排器 + 纯函数解析层。`app/OpencodeRuntime.ets` 持状态与流程；`common/Ports.ets` 只做 `parsePortFromMarker` / `parsePortFromLog` / `evidenceLine`（纯函数，可离线单测）；`common/Log.ets` 统一 hilog 前缀。
- **关键算法（就绪轮询）**：循环至 `deadline=now+180_000`：① 读 marker（`fs.statSync`→`open`→`read`→UTF-8 解码，对照 `Ports.ets:75-110`）；② 取 `logs(200)` 过滤 `at >= launchStartedAt` 后正则取 `port`；命中即 `running` 并记录通道与证据行；每 10 次未命中打一条 info；到期置 `failed` 并写错误详情（FR-101-002/003）。
- **错误处理**：分阶段 `fail(stage, error)`，错误对象固定 `{stage, message, hint, detail}`（`overall-plan.md:84`）；`hint` 必须含「请重启应用」或「换产物 / 更新锁定文件」等可执行动作；任何 catch 不得吞掉原因（C2）。
- **性能**：`start()` 只入队（返回 ≤ 200 ms 量级）；轮询在页面侧异步进行，不在 UI 线程做文件轮询的重活；`logs()` 每次只取 200 行，诊断面板按需拉取。
- **实现顺序**（对应 Phase 0 出口）：P0-A 投放（FR-101-004/005）→ 库启动 + `logs()` 接通（FR-101-001）→ marker/日志双通道（FR-101-002/003）→ 状态机与诊断（FR-101-006/009）→ 关停（FR-101-011）→ 单实例（FR-101-008）。

## 7 测试考虑

| 层级 | 用例 | 判据 |
|---|---|---|
| 单元（host，可跑 `node --test`） | marker 解析（缺字段/端口 0/端口越界/坏 JSON）、日志解析（多轮行、无时间戳行）、状态机转移表 | 纯函数返回确定值；非法输入不抛 |
| 静态门 | `node --check` + ArkTS 编译 | 无语法/类型错误（宪法 G-语法） |
| 真机 P0-A | `./scripts/provision-runtime.sh --check` + `hvigorw assembleHap` | 七项 ELF 门禁全绿；HAP 内 `libnode.so` SHA-256 = 锁定值 |
| 真机 P0-H | 占用端口后启动、二次启动 | 应用不崩；marker 端口 = 实际监听端口；无第二个实例 |
| 真机 P0-I | 删载荷 / 占端口 / 错口令 | 错误页出现阶段文案 + 日志尾；`lastCrash()` 有记录 |
| 负样本 | 人为把 marker 写成上一轮端口 | 状态不得进入 `running`（验证 FR-101-003） |

## 8 文件清单

| 路径 | 作用 | 状态 |
|---|---|---|
| `entry/src/main/ets/app/OpencodeRuntime.ets` | 启动编排 + 状态机 + 诊断快照 | 🚧 新建 |
| `entry/src/main/ets/common/Ports.ets` | marker 读取/解析、日志端口解析、证据行 | 🚧 新建（参照 `pi-desktop-ark/.../common/Ports.ets`） |
| `entry/src/main/ets/common/Constants.ets` | 常量唯一源：六态枚举、阶段文案、`READY_MARKER_NAME='server.ready.json'`、超时/间隔 | 🚧 新建 |
| `entry/src/main/ets/common/Log.ets` | hilog 统一前缀 `[ark]` | 🚧 新建 |
| `entry/src/main/ets/entryability/EntryAbility.ets` | 先 `loadContent`；`onPrepareToTerminate` → `shutdown()` 且返回 `false` | 🚧 新建 |
| `entry/src/main/module.json5` | `launchType: "singleton"`、`backgroundModes`、权限声明面 | 🚧 新建 |
| `oh-package.json5` / `entry/oh-package.json5` | `@fellow99/node-bridge: file:libs/@fellow99/node-bridge.har` | 🚧 新建 |
| `libs/@fellow99/node-bridge.har` | 运行时库产物（不入库） | 🚧 由构建产出 |
| `scripts/build-bridge-har.sh` | `hvigorw assembleHar` → 拷贝 HAR | 🚧 新建 |
| `scripts/provision-runtime.sh` | 委托 `../ohos-node-bridge/tools/provision.mjs --out entry/libs/arm64-v8a` | 🚧 新建 |
| `entry/libs/arm64-v8a/{libnode.so,libc++_shared.so}` | 运行时投放目标（不入库） | 🚧 投放产出 |
| `<filesDir>/payload/server.ready.json` | 就绪标记运行期产物（写方 102） | 🚧 运行时 |
| `<filesDir>/node-bridge/last-crash.json` | 崩溃记录（库写，本模块读） | 🚧 运行时 |
