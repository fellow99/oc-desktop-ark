# 104 宿主能力 — 技术方案（plan）

> 模块：`104-host-capabilities`｜文档：plan.md（怎么做）
> 对应规格：`./spec.md`（FR-104-001…018、AS-104-01…08）
> 权威顺序：`specs/constitution.md` → `docs/000-工程规划.md` → `overall-plan.md` → 本文
> 运行时契约以 `@fellow99/node-bridge` / `@fellow99/node-runtime` 库文档（[fellow99/ohos-node-bridge](https://github.com/fellow99/ohos-node-bridge)）为准，本文只引用不复述。

## 1 技术上下文

| 项 | 值 | 来源 |
|---|---|---|
| 宿主语言/框架 | ArkTS + ArkUI，Stage 模型，`deviceTypes: ["2in1","tablet"]` | `TECH.md:10-15` |
| 运行时库 | `@fellow99/node-bridge` 0.1.0（ohpm 包） | [ohpm 中心仓](https://ohpm.openharmony.cn/#/cn/detail/@fellow99/node-bridge) |
| 能力桥 API | `runtime.host.register(name, handler)` / `unregister` / `list` / `has` | 库文档 §5.3:463-468 |
| 处理器签名 | `(argsJson: string) => string \| Promise<string>`；JSON 字符串入出 | `library/src/main/ets/runtime/Types.ets:158-169` |
| 传输两条路 | 文件信箱 `dispatchAsync`（await Promise）与原生槽位 `pumpTick`（同步，遇 Promise 报 `async-handler-on-sync-path`） | `Types.ets:162-167` |
| 文件选择 | `@kit.CoreFileKit`：`picker.DocumentViewPicker` / `fileShare` / `fileUri` | `oc-desktop-hos/web_engine/src/main/ets/adapter/PermissionManagerAdapter.ets:227-248` |
| 权限 API | `@kit.AbilityKit`：`abilityAccessCtrl` + `bundleManager` | `pi-desktop-ark/entry/src/main/ets/host/HostCapabilities.ets:203-234` |
| 外链 | `Want{ action:'ohos.want.action.viewData', entities:['entity.system.browsable'] }` | 同上 `:508-536`；规划 §6 #8:483 |
| 通知 | `@kit.NotificationKit` 的 `notificationManager.publish` | 同上 `:466-500` |
| 日志 | `@kit.PerformanceAnalysisKit` hilog（统一前缀 `[ark]`） | `pi-desktop-ark/.../common/Constants.ets:242-254` |
| 代码落点 | `entry/src/main/ets/host/HostCapabilities.ets` | `STRUCTURE.md:35`、规划 §14.1:796 |

## 2 宪法合规（逐条）

| 原则 | 判定 | 落地与证据 | 对应 FR |
|---|---|---|---|
| C1 壳薄契约硬 | ✅ | 只做平台动作，不实现业务；能力名/JSON 形状冻结；不给 ArkTS 加业务通道（库文档 §5.4:488 方向 2 只有 start/shutdown） | FR-104-001/002 |
| C2 不隐藏平台真相 | ✅ | 未实现→`not-implemented`；PTY→`supported:false` + `reason` + `evidence`；权限假阴性写入 `hint`；取消与失败分开（pi `:39-47`、`:156-164`、`:233`、`:402-403`） | FR-104-003/005/009/011/014 |
| C3 谁写谁读 | ✅ | 选择器只回传路径/标识，**不回传内容**；需要读文件的调用方自己读；能力不代写业务文件（库文档 §5.4:492、§5.5:500） | FR-104-007/008 |
| C4 不改上游 | ✅ | 本模块零补丁；能力桥是库的公开 API，不改库、不改上游 | — |
| C5 崩溃是终态 | ✅ | 未注册/非法参数一律返回结构化错误，绝不调用未注册处理器（旧壳 `ExternalWeb.Open` 事故，库文档 §5.4:491）；能力实现不触碰 Node 线程 | FR-104-003/004/006 |
| C6 判据可证伪 | ✅ | 判据 = 返回 JSON 字段 + 自检日志行 + 真机 TC-D-013；不用「点击看起来生效」（规划 §5.10:456） | FR-104-016/017 |
| D3 单一事实源 | ⚠️ | 能力名与超时常量只放 `common/Constants.ets`；实现部用脚本比对注册名与常量表（`verify-capabilities.mjs`） | FR-104-001 |
| S4 声明面=使用面 | ⚠️ | 本模块**不新增**权限；只使用 §10.1 已申报项；`107` 的比对脚本把本模块使用点列为 `usedAt` | FR-104-005 |
| S6 目录访问经授权 | ✅ | 选择器 + `fileShare` 激活；不假设用户目录可读写；失败给可读拒绝 | FR-104-010/011 |

## 3 研究结论与依据

| # | 结论 | 依据（path:line） | 对应 FR |
|---|---|---|---|
| R1 | 能力清单冻结为 7 项；库只负责「注册表 + 传输」，每个能力的实现属消费方 | 库文档 §5.4:490-492、§6.1:603；`overall-plan.md:69` | FR-104-001 |
| R2 | 未注册名字必须明确 reject；「注册了却假装能用」更糟——未实现项要如实返回 not-implemented | 库文档 §5.4:491；pi `HostCapabilities.ets:16-18`、`:539-551` | FR-104-003/018 |
| R3 | 处理器入参/出参都是 JSON 字符串；异步能力只能走文件信箱，同步槽位遇 Promise 如实报错 | `Types.ets:158-169`；库文档 §5.4:487-489 | FR-104-002/015 |
| R4 | 安装后必须核对注册面完整性，缺项要 `Log.error`（否则 Node 侧只看到 `unregistered`） | pi `HostCapabilities.ets:129-138` | FR-104-001 |
| R5 | `perm.check` 用 `bundleManager` 取 tokenId + `checkAccessTokenSync`；返回值必须带归因、下一步与假阴性提示 | pi `:203-234`、`:242-281`；规划 §6 #9:484 | FR-104-005 |
| R6 | 去应用设置没有 `openApplicationInfoEntry`；用 action `ohos.settings.application.details`，并同时给 `bundleName` 与 `pushParams` 两个键 | pi `:346-392`（`:373-378`） | FR-104-006 |
| R7 | 选择器返回 **URI 而非路径**（`file://…`）；用户取消要单列 `cancelled`；持久化授权失败不推翻本次可用 | pi `:395-454`（`:399-405`、`:415-418`、`:419-435`） | FR-104-007/008/009/010 |
| R8 | 平台语义：Picker 授权仅临时有效，**每次启动须重新 `activatePermission`**，且必须传真实路径；卸载即清空 | `oc-desktop-hos/.../PermissionManagerAdapter.ets:227-248`；`oc-desktop-hos/specs/011-workspace-auth/spec.md:16`、`plan.md:14`；规划 §8.4:584 | FR-104-011 |
| R9 | 外链只放行 http(s)，其它 scheme 交系统解析等于交出控制权；失败一律记日志 | pi `:508-536`（`:512-517`） | FR-104-012 |
| R10 | 通知缺少正文无意义；失败错误码（如 1600004/11800001）通常表示通知总开关关闭，应回传而不是再弹系统窗 | pi `:456-500`（`:469-472`、`:491-499`） | FR-104-013 |
| R11 | 运行事实是平台能力的**唯一序列化点**：状态/阶段/版本/pid/日志/错误 + 能力标志；标志硬编码 `supported:false` 不伪造 | pi `:147-195`（`:156-164`） | FR-104-014 |
| R12 | 能力自检清单默认空数组（出厂不弹窗/不通知/不选择），验证时临时填 `<name>\|<argsJson>` | pi `Constants.ets:98-113` | FR-104-017 |
| R13 | 能力注册必须在 `start()` **之前**完成（先有注册面，再有传输） | pi `PiDesktopRuntime.ets:289-295` | FR-104-015 |

## 4 数据模型

**注册表状态**（内存）：`{ registered: string[], missing: string[], deferred: string[] }`；`missing` 非空即视为实现缺陷并 `Log.error`（R4）。

**CapabilityResult**（所有能力的出参基形；与 `overall-data-model.md:65-75` 对齐）：

```json
{ "ok": true, "capability": "perm.check", "…": "各能力字段" }
{ "ok": false, "capability": "fs.pickFolder", "error": "cancelled", "detail": "…", "hint": "…", "nextStep": "…" }
```

**DirectoryGrant**（`<filesDir>/ark/grants.json`，本模块写、本模块读）：

| 字段 | 类型 | 约束 |
|---|---|---|
| `rootId` | string | `workspace` / `desktop` / `documents` / `download` / `picked-<n>` |
| `path` | string | 绝对路径；必须在授权范围内，否则置空并记 `error` |
| `uri` | string | 平台返回的资源标识（仅备查，不作为跨启动凭据） |
| `mode` | `'rw'` | 读写 |
| `persisted` | boolean | 上次 `persistPermission` 是否成功 |
| `activatedAt` | number | 本次启动重新激活成功的时刻；`0` = 未激活 |
| `lastError` | string | 最近一次激活/选择失败原因（空串=无） |

**CapabilityFlag**：`{ capability, supported, reason, evidence, plan }`；v1 只有 `terminal.pty` 一项，`supported` 恒 `false`。

## 5 接口契约

| 能力名 | 入参（JSON） | 成功出参要点 | 失败码 |
|---|---|---|---|
| `runtime.facts` | `{}`（参数原样回显） | `state`/`stage`/`bridgeVersion`/`node`/`platform`/`arch`/`pid`/`logPath`/`logEntries`/`lastError`/`hostBridge`/`capabilities` | — |
| `perm.check` | `{name}` | `granted`、`attribution`、`nextStep`、`hint` | `bad-args` |
| `perm.openAppInfo` | `{}` | `bundleName`、`target`、`action` | `bundle-info-unavailable`、`deep-link-failed` |
| `fs.pickFolder` | `{}` | `count`、`items[{path,uri,usable}]`、`persisted` | `cancelled`、`pick-failed` |
| `fs.pickFiles` | `{}` | 同上（条目上限为常量 32） | `cancelled`、`pick-failed` |
| `shell.openExternal` | `{url}` | `url`、`mode:"system-browser"` | `bad-args`、`scheme-not-allowed`、`start-ability-threw` |
| `notify.show` | `{title?, text, id?}` | `id`、`published:true` | `bad-args`、`publish-failed` |

- 未注册名字由**库**拒绝（`unregistered`）；本模块不注册的名字不得出现在 `NAMES` 常量里（FR-104-003）。
- 单次 JSON 载荷 ≤ 8 MiB（库契约 §5.4:492）；超限由库报错，本模块不吞。
- 交互能力的超时由调用方传（建议 300 000 ms）；本模块不把默认超时写死为 15 s。

## 6 实现策略

- **注册时机**：`OpencodeRuntime.launch()` 在 `runtime.start()` 之前调用 `HostCapabilities.install(runtime, context)`；安装返回人读摘要（已实现 / 占位 / 缺失）并写日志（R13、R4）。
- **结果拼装**：全部手写 JSON 字符串 + `escapeJson`，不把外部入参 `JSON.parse` 后做类型断言；字段读取用 `stringField` / `stringArrayField`（畸形输入→空值→`bad-args`），绝不向传输层抛异常（R2、pi `:646-690`）。
- **选择器**：`DocumentViewPicker(context)` + `selectMode`（FOLDER 单选 / FILE 多选 ≤ 32）；返回后先做 URI→路径转换（`fileUri`），转换失败则 `usable:false` 并保留 `uri`；取消单列 `cancelled`（R7）。
- **授权**：选择成功即 `fileShare.persistPermission`（best-effort，失败只置 `persisted:false`）；**每次启动**读 `grants.json` 对每项 `fileShare.activatePermission(policies)`，失败写 `lastError` 并在诊断面板可见（R8、FR-104-011）。
- **去设置页**：`bundleManager.getBundleInfoForSelfSync` 取本包名 → `startAbility` 到设置应用（双键参数），失败带手动路径提示（R6）。
- **外链**：先做 scheme 白名单（仅 http/https）→ `startAbility(viewData)`；`catch` 与 Promise `catch` 都写日志，返回结构化错误（R9）。
- **通知**：`text` 空即 `bad-args`；`id` 缺省按时间取；错误码原样回传 + 下一步提示（R10）。
- **运行事实**：`capabilitiesJson()` 是平台能力标志的**唯一**序列化点，`runtime.facts` 与诊断面板都读它（R11）。
- **自检**：`HOST_PROBE_CAPABILITIES` 默认 `[]`；非空时按 `<name>|<argsJson>` 逐条 `dispatchAsync` 并把结果追加到 `<filesDir>/capability-probe.log`（失败也留痕）（R12）。
- **不做**：不注册空实现；不新增权限；不在能力里做业务判断（C1）。

## 7 测试考虑

| 层级 | 用例 | 判据 |
|---|---|---|
| 单元（host） | `stringField` / `stringArrayField` 畸形输入、scheme 白名单、结果拼装、`DirectoryGrant` 读写 | 纯函数返回确定值；畸形输入不抛 |
| 静态门 | `scripts/verify-capabilities.mjs`：`NAMES` 常量 ⇄ 实际注册名 ⇄ `module.json5` 使用点 | 三处集合一致；缺项退出码非 0 |
| host 门 | `node --check`（脚本）+ ArkTS 编译 | 无语法/类型错误 |
| 真机 AS-104-01 | 自检清单填入 7 项（每次一项），启动后取 `capability-probe.log` | 7/7 有结构化结果；无崩溃 |
| 真机 AS-104-02 | 调用未注册名（如 `perm.request`） | 返回未注册错误；应用继续运行 |
| 真机 AS-104-03 | 选目录 / 取消 / 选不可转换条目 | 三种结果可区分；取消不触发重试 |
| 真机 AS-104-04/TC-D-013 | 选文档目录 → 重启 → 让代理读写 | 授权内成功；未授权时给可读拒绝（`EACCES` 不等于崩溃） |
| 真机 AS-104-06/07 | 打开 `file://` 外链、关通知总开关后发通知 | 均返回可判定错误 + 日志行 |
| 负样本 | 能力名与常量表不一致、handler 返回 Promise 走同步槽位 | 分别被静态门与 `async-handler-on-sync-path` 抓住 |

## 8 文件清单

| 路径 | 作用 | 状态 |
|---|---|---|
| `entry/src/main/ets/host/HostCapabilities.ets` | 7 项能力的注册与实现、结果拼装、`capabilitiesJson()` | 🚧 新建（参照 `pi-desktop-ark/.../host/HostCapabilities.ets`） |
| `entry/src/main/ets/common/Constants.ets` | 能力名常量、超时、自检清单、`escapeJson`、`Log` | 🚧 新建（与 101/105 共用同一文件，按段落分工） |
| `entry/src/main/ets/common/Log.ets` | hilog 统一前缀 `[ark]` 与脱敏入口 | 🚧 新建 |
| `entry/src/main/ets/app/OpencodeRuntime.ets` | 在 `start()` 前调用 `install()`；暴露能力摘要给诊断 | 🚧 修改（101 主实现） |
| `entry/src/main/ets/pages/Index.ets` | 诊断面板展示能力标志与 `lastError` | 🚧 修改（103 主实现） |
| `entry/src/main/ets/app/Connection.ets` | 不涉及（目录授权记录落 `ark/grants.json`，与凭据分离） | — |
| `entry/src/main/module.json5` | 仅使用 §10.1 已申报权限；不新增 | 🚧 修改（与 107 协同） |
| `scripts/verify-capabilities.mjs` | 注册名 ⇄ 常量表 ⇄ 声明面比对 | 🚧 新建 |
| `docs/真机验证记录.md` | 记录 AS-104-01…08 的证据（日志行 + 截图 + 返回 JSON） | 🚧 追加 |
| `specs/104-host-capabilities/{spec.md,plan.md}` | 本规格与方案 | ✅ 本次 |
