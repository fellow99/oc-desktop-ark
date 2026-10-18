# overall-data-model —— 数据模型

> 范围：**本工程自有**的实体（ArkTS 宿主 + Node 启动脚本 + 构建产物）。上游 opencode 的会话/消息实体只做**引用**（见 §5），不复制其定义。

## 1. 宿主侧实体（ArkTS）

### 1.1 Connection（本地凭据）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `schema` | number | 固定 `1` | 结构版本 |
| `password` | string | base64url，32 字节随机 → 43 字符 | 服务端口令；**永不入日志** |
| `createdAt` | number | epoch ms | 首次生成时间 |
| `rotatedAt` | number | epoch ms，≥ createdAt | 最近轮换时间 |

- 落点：`<filesDir>/ark/connection.json`，权限 **0600**（写入后回读校验，hmdfs 可能静默改权限）。
- 生命周期：首启生成 → 之后复用 → 仅在「用户重置」或「文件损坏」时轮换。
- 不变式：`password` 长度 ≥ 32；文件不可解析时**重新生成**并在诊断面板记录原因。

### 1.2 ServerReady（服务就绪证据）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `schema` | number | `1` | |
| `port` | number | 1–65535 | OS 分配的真实端口 |
| `host` | string | 默认 `127.0.0.1` | 监听地址 |
| `url` | string | `http://<host>:<port>` | 便于直接加载 |
| `pid` | number | > 0 | 诊断用（进程内 Node 与宿主同 pid） |
| `startedAt` | number | epoch ms | 本轮启动时刻（用于过滤旧 marker） |
| `version` | string | `2.0.26` | 上游版本 |

- 落点：`<filesDir>/payload/server.ready.json`；由 **Node 侧**原子写（临时文件 + rename）。
- 判据：存在且 `port > 0` 且 `startedAt ≥ 本轮启动时刻`。

### 1.3 PayloadPlan（载荷路线）

| 字段 | 类型 | 取值 | 说明 |
|---|---|---|---|
| `route` | enum | `readonly` / `archive` / `missing` | 按**文件存在性**判定，非编译期开关 |
| `readonlyRoot` | string | 绝对路径 | `resfile/opencode` |
| `entry` | string | `opencode-server.js`（相对运行根） | 交库经 `NODE_BRIDGE_ENTRY` 解析 |
| `scriptPath` | string | 绝对路径 | 库 `bootstrap.js` |
| `archivePath` | string | 绝对路径或空 | 回退路线的 tar.gz |
| `manifestPath` | string | 绝对路径或空 | `manifest.sha256` |
| `verified` | boolean | — | 清单校验是否通过 |

### 1.4 RuntimeState（启动状态机）

```
idle → password → payload → starting → waiting_ready → ready
                                           │
                                           └→ failed（终态，需重启应用）
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `phase` | enum | 上表 6 个阶段 + `failed` |
| `detail` | string | 中文阶段文案（上屏） |
| `at` | number | epoch ms |
| `error` | `{stage,message,hint,detail}` \| null | 失败时填充 |

- `ready` 只能由**观测证据**触发（marker / 本轮日志行），不能由 `start()` 返回值触发（C2）。
- `failed` 是终态：不提供「重试启动」（C5）。

### 1.5 HostCapability

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | `runtime.facts` / `perm.check` / `perm.openAppInfo` / `fs.pickFolder` / `fs.pickFiles` / `shell.openExternal` / `notify.show` |
| `async` | boolean | 是否允许返回 Promise（选择器/权限/通知为 true） |
| `args` | object | JSON 入参（由各能力约定） |
| `result` | object \| string | JSON 出参；失败为 `{error:{code,message}}` |

- 未注册的名字：**reject**（不返回空、不崩溃）。
- 单次载荷上限 8 MiB（库契约）。

### 1.6 PermissionDeclaration（权限声明）

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | `ohos.permission.*` |
| `level` | enum | `normal` / `system_basic`（ACL）/ `user_grant` |
| `reason` | string | 必填（带 reason 的项） |
| `usedScene` | `{abilities:[], when:'inuse'}` | 必填（带 reason 的项） |
| `usedAt` | string[] | 代码中的使用点（文件:函数），用于「声明面 = 使用面」比对 |

### 1.7 UpstreamArtifact（构建产物）

| 字段 | 类型 | 说明 |
|---|---|---|
| `file` | string | 相对 `resfile/opencode/` 的路径 |
| `sha256` | string | 64 hex |
| `size` | number | 字节 |
| `kind` | enum | `entry`（opencode.mjs）/ `asset`（assets/**）/ `ui-archive`（app-archive.bin） |

- 汇总文件：`resfile/opencode/manifest.sha256`（唯一事实源，入库）。

## 2. 构建侧配置（非运行时数据）

| 名称 | 落点 | 说明 |
|---|---|---|
| 上游基线 | `patches/v2.0.26/` + `EXPECTED_BASELINE` | `9b4ec5714d` |
| Node 运行时 | `ohos-node-bridge/runtime.lock.json` | v24.2.0 / ABI 137 / SHA-256 |
| 构建目标 | `OPENCODE_NODE_TARGET=node24` | 对齐运行时 |
| 应用版本 | `AppScope/app.json5` | `2.0.26` / `20026` |

## 3. 关系

```
Connection 1 ──1 ServerReady        （口令 → 服务实例）
PayloadPlan 1 ──1 RuntimeState      （载荷路线 → 启动阶段）
RuntimeState 1 ──* HostCapability   （阶段内可调用能力）
UpstreamArtifact * ──1 PayloadPlan  （清单校验）
PermissionDeclaration * ──1 EntryAbility（声明面）
```

## 4. 校验规则（代码必须实现）

| 规则 | 检查点 |
|---|---|
| `port` ∈ [1,65535] 且 marker 的 `startedAt` ≥ 本轮启动时刻 | `Ports.parseMarker()` |
| `password` 非空且长度 ≥ 32 | `Connection.load()` |
| `connection.json` 写入后回读权限位 | `Connection.save()` |
| 清单中每个文件的大小与 SHA-256 匹配 | `Payload.verify()`（⬜ 实现） |
| `XDG_*` 全部位于 `<filesDir>` 之下 | `env.js` 启动自检 |
| 未注册能力名 → 抛错 | `HostBridge` 派发 |

## 5. 引用的上游实体（不复制定义）

| 实体 | 用途 | 权威定义 |
|---|---|---|
| `Session` / `Message` / `Part` | 会话与消息 | 上游 `packages/schema`、`/openapi.json` |
| `Permission`（工具审批） | 审批交互 | 上游 `/session/:id/permissions/:permissionID` |
| `Provider` / `Model` | 模型与凭据 | 上游 `/provider`、`/provider/auth` |
| `Project` / `Location` | 工作区/项目根 | 上游 `/project`、`/path` |
| `FileDiff` | diff 视图 | 上游 `/session/:id/diff` |
| `Event`（SSE） | 事件流 | 上游 `/api/event` |

> 上游契约以 `/openapi.json` 与官方文档为准；本工程不维护第二份定义（避免漂移）。
