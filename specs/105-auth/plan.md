# 105 鉴权与凭据 — 技术方案（plan）

> 模块：`105-auth`｜文档：plan.md（怎么做）
> 对应规格：`./spec.md`（FR-105-001…017、AS-105-01…08）
> 权威顺序：`specs/constitution.md` → `docs/000-工程规划.md` → `overall-plan.md` → 本文
> 上游契约以 `opencode` v2.0.26（`9b4ec5714d`）源码为准，本文只引用不复述。

## 1 技术上下文

| 项 | 值 | 来源 |
|---|---|---|
| 宿主 | ArkTS + ArkUI，Stage 模型；凭据文件读写用 `@kit.CoreFileKit` 的 `fileIo` | `TECH.md:10-11` |
| 凭据落点 | `<filesDir>/ark/connection.json`，权限 **0600** | 规划 §5.5.4:378-386；`overall-data-model.md:7-18` |
| 凭据结构 | `{ schema:1, password, createdAt, rotatedAt }` | `overall-data-model.md:9-18` |
| 随机源 | `@kit.CryptoArchitectureKit` 的 `cryptoFramework`（32 字节）+ base64url 编码 | `overall-plan.md:62`（⬜ 具体 API 名以本机 SDK 为准） |
| 注入键 | `OPENCODE_PASSWORD`（上游另认 `OPENCODE_SERVER_PASSWORD`，本工程不设，避免第二来源） | `packages/cli/src/env.ts:10-11`；`oc-desktop-hos/src-main/main.js:270-271` |
| 注入通道 | 库的 `NodeRuntimeOptions.env`（合并进进程环境，在库默认值之后） | `@fellow99/node-bridge` 类型声明（`oh_modules/@fellow99/node-bridge` `.d.ets`；源码 [fellow99/ohos-node-bridge](https://github.com/fellow99/ohos-node-bridge) `library/src/main/ets/runtime/Types.ets:81-86`） |
| 服务端强制口令 | 无口令即 `Missing server password` 失败 | `packages/server/src/process.ts:52-53` |
| 首屏凭据 | URL 查询参数 `auth_token` = `base64("opencode:"+pwd)` | `packages/app/src/entry.tsx:81-82`、`packages/app/src/runtime/server/api.ts:5-7` |
| 后续请求 | 前端 SDK 自动加 `Authorization: Basic …` | `packages/app/src/runtime/server/api.ts:22-36` |
| 探活 | ArkTS 侧 `@kit.NetworkKit` 带 Basic 请求 `GET /api/info` | 规划 §5.2.3:326、§12.2 O4:731 |
| Cookie 备选 | `opencode_session_<port>`，HMAC 派生、30 天、httpOnly/sameSite=lax/path=/ | `packages/server/src/auth.ts:16,39-61`；`packages/server/src/handlers/server.ts:44-52` |
| 配对端点 | `POST /api/pair` → `GET /auth/connect/:code` | `packages/protocol/src/groups/server.ts:53-76` |
| 配置目录 | `<filesDir>/ark/`（与 `data/`、`config/`、`logs/` 同级，见部署拓扑） | `ARCHITECTURE.md:100-105` |

## 2 宪法合规（逐条）

| 原则 | 判定 | 落地与证据 | 对应 FR |
|---|---|---|---|
| C1 壳薄契约硬 | ✅ | 宿主只做「生成 / 持久化 / 注入 / 拼一次 URL / 探活」；鉴权判定全在服务端中间件（`authorization.ts:57-70`），宿主不复刻规则 | FR-105-001/006/007 |
| C2 不隐藏平台真相 | ✅ | 缺口令、错口令、探活失败、Cookie 能力缺失都上报为可见失败；不假装免密成功（规划 §5.5.3:372-376） | FR-105-001/011/013 |
| C3 谁写谁读 | ✅ | `connection.json` 由 ArkTS 写、ArkTS 读；Node 侧不读它（只从 env 拿口令）；日志各写各的、不共文件（规划 §5.5.4:386） | FR-105-003/005 |
| C4 不改上游 | ✅ | 零补丁：`auth_token` 与 Cookie 都是上游**既有**机制（`entry.tsx:81`、`auth.ts`），不新增鉴权分支 | FR-105-006/008/015 |
| C5 崩溃是终态 | ✅ | 鉴权失败只进入失败态，不重启运行时（`node::Start` 每进程一次）；不把重置口令当「修复」手段 | FR-105-016 |
| C6 判据可证伪 | ✅ | 判据 = 首屏会话列表（TC-D-006）、重启免登录（TC-D-007）、401（TC-H-008）、日志零明文、`stat` 权限位 | FR-105-004/012/013 |
| S1 只监听回环 | ✅ | 默认路线 A `127.0.0.1`；路线 B 必须有密码 + 随机端口 + UI 提示（规划 §5.4:344-353） | FR-105-001 |
| S2 口令不进日志/崩溃 | ✅ | 注入只走 env；日志只记长度/来源等非敏感摘要；凭据文件之外的任何位置都不出现明文 | FR-105-005/012/014 |
| S3 `auth_token` 脱敏 | ✅ | 统一 `redactUrl()`：查询参数值替换为 `***`；错误页只显示阶段与状态码 | FR-105-012 |

## 3 研究结论与依据

| # | 结论 | 依据（path:line） | 对应 FR |
|---|---|---|---|
| R1 | 服务端**永远有密码**：`ServerProcess.start` 缺 `password` 直接失败；CLI 从 `OPENCODE_PASSWORD`（或 `OPENCODE_SERVER_PASSWORD`）取 | `packages/server/src/process.ts:52-53`；`packages/cli/src/env.ts:10-11`；规划 §2.2(b):129 | FR-105-001 |
| R2 | 前端原生消费 `?auth_token=`：`authFromToken()` → `ServerConnection.password`，随后 `clearAuthToken()` 抹掉参数 | `packages/app/src/entry.tsx:81-82`；规划 §2.2(e):140-142 | FR-105-006 |
| R3 | token 编码固定为 `btoa("opencode:"+password)`；解码后按第一个 `:` 切分取 password | `packages/app/src/runtime/server/api.ts:5-20` | FR-105-006 |
| R4 | 之后所有 API 调用由 SDK 自动加 Basic 头，**不需要宿主注入** | `packages/app/src/runtime/server/api.ts:22-36`；`packages/app/src/runtime/server/health.ts`（SSE 同源） | FR-105-015 |
| R5 | 中间件认三样：`auth_token` 查询参数、`Basic` 头、会话 Cookie；三者任一通过即放行 | `packages/server/src/middleware/authorization.ts:11,31-38,57-70` | FR-105-007/009 |
| R6 | 会话 Cookie 名带端口（同主机不同端口共享 Cookie 空间）；30 天 TTL；HMAC 密钥由口令派生 ⇒ **轮换即撤销全部会话** | `packages/server/src/auth.ts:16,39-61`（`:39` 注释明确） | FR-105-008/010 |
| R7 | Cookie 只在**同源**可用：`origin` 与 `host` 不一致即拒绝 | `packages/server/src/middleware/authorization.ts:63-70` | FR-105-009 |
| R8 | 配对流程：Basic 调 `POST /api/pair` 取 `code`；浏览器（`accept: text/html`）导航 `/auth/connect/<code>` 得 302 + Set-Cookie；JSON 客户端拿 token | `packages/server/src/handlers/server.ts:29-52`；`packages/protocol/src/groups/server.ts:53-76` | FR-105-008 |
| R9 | 401 的 `WWW-Authenticate` 只对非浏览器/导航请求下发（避免浏览器弹原生登录框卡住 SPA） | `packages/server/src/middleware/authorization.ts:42-55` | FR-105-013 |
| R10 | 已落地参考：Electron 侧口令来自 env（缺省随机 32B base64url）、写连接文件用 `mode: 0o600`、Cookie 名带端口 | `oc-desktop-hos/src-main/main.js:176,270-271,713-753,755-780` | FR-105-003/008 |
| R11 | 密码只经 env 交 Node，`connection.json` 在 ArkTS 侧读写（Node 不需要读） | 规划 §5.5.4:384-386 | FR-105-005 |
| R12 | 安全边界：完整 URL 禁止入日志（`?auth_token=***`）；回环路线攻击面=同机应用 | 规划 §5.5.3:374-376；`constitution.md:111-112`（S2/S3） | FR-105-012 |
| R13 | 轮换边界：仅「用户主动重置」或「文件损坏」；重置=重新登录 | 规划 §5.5.4:384-386、§12 A4:721、O10:737 | FR-105-010/011 |

## 4 数据模型

**Credential 文件**（`<filesDir>/ark/connection.json`，UTF-8）：

```json
{ "schema": 1, "password": "<32B base64url>", "createdAt": 1760000000000, "rotatedAt": 1760000000000 }
```

不变式：`password` 长度 ≥ 32 且只含 base64url 字符；`rotatedAt ≥ createdAt`；文件权限 0600；解析失败即视为损坏（FR-105-011）。

**内存 `CredentialState`**：`{ password, createdAt, rotatedAt, source: 'new'|'reused'|'rotated', filePath }`；`source` 只用于日志（不含值）。

**鉴权阶段机**（与 `overall-data-model.md:47-63` 的启动阶段对齐）：

```
idle → credential（生成/复用）→ injected（env 已装配）→ probe（Basic /api/info）
     → navigated（loadUrl 带 token）→ ready（onPageEnd）
                └→ failed（missing-password / probe-401 / probe-timeout / corrupt-file）
```

**`ProbeResult`**：`{ ok, status, version, attempts, detail, at }`；`ok = status===200 && version.length>0`。

**`CookieFallback`**（仅备选）：`{ cookieName: "opencode_session_<port>", sameSite:'lax', httpOnly:true, path:'/', ttlDays:30, source:'pair' }`。

## 5 接口契约

| 契约 | 内容 |
|---|---|
| env | `OPENCODE_PASSWORD=<口令>` **必设**；不设 `OPENCODE_SERVER_PASSWORD`（避免双来源）；值不得含 `\n`（库按换行分隔 env） |
| 首屏 URL | `http://<host>:<port>/?auth_token=<base64("opencode:"+password)>`；日志形态 `http://<host>:<port>/?auth_token=***` |
| 探活 | `GET /api/info` + `Authorization: Basic <token>`；成功 = 200 且 JSON 含 `version`（对照 TC-H-004） |
| 配对（备选） | `POST /api/pair`（Basic）→ `{code, expires_in}`；`GET /auth/connect/<code>` 带 `Accept: text/html` → 302 + `Set-Cookie: opencode_session_<port>`；JSON 客户端则直接拿 `{token}` |
| 失败码 | `missing-password` / `probe-401` / `probe-timeout` / `corrupt-file` / `rotate-required`（全部映射到可见文案 + 下一步） |
| 日志 | 只允许 `passwordLen=`、`source=`、`cookieName=`、`?auth_token=***`；禁止 `Authorization`、token、口令 |
| 对外方法 | `Connection.load(ctx): CredentialState`、`Connection.reset(ctx): CredentialState`、`Auth.firstScreenUrl(base, password): string`、`Auth.redactUrl(url): string`、`Auth.probe(base, password): ProbeResult` |

## 6 实现策略

- **生成**：`cryptoFramework.createRandom()` 取 32 字节 → base64url（无 `+ / =`，可直接进 URL 与 Basic）；失败即 `failed('missing-password')`，**不**降级为固定口令（FR-105-002）。
- **持久化**：先写 `connection.json.tmp` → `fsync` → `rename` 覆盖；打开时权限 0600；写完 `stat` 回读校验，权限不符记 `warn` 并按平台能力重试一次（hmdfs 可能静默改权限，规划 §8.4:586）。
- **读取与损坏处理**：不存在 → 生成；解析失败/字段缺失/长度不足 → 原文件改名 `connection.json.bad-<ts>` → 重新生成 → 记录 `corrupt-file` 与备份路径（FR-105-011）。
- **注入**：`OpencodeRuntime` 在 `buildAppEnv()` 里写 `env['OPENCODE_PASSWORD']`，随 `options.env` 交给库（R1/R11）；不写 argv、不写 marker、不写日志。
- **首屏**：先加载应用内加载页 → `Auth.probe()`（退避重试，参考 `PROBE_ATTEMPTS=20 / 500 ms`）→ 成功则 `loadUrl(firstScreenUrl(...))` → `onPageEnd` 后 `clearHistory()`（103 负责视图，105 只提供 URL 与结果）。
- **脱敏**：所有 URL 打印前过 `redactUrl()`（正则替换 `auth_token` 值）；诊断快照与错误页复用同一函数（单一事实源）。
- **配对备选**：`fetch POST /api/pair`（Basic）→ 用 `WebCookieManager` 写 Cookie 或直接导航 `/auth/connect/<code>`；两条路都走**同源**；Cookie 能力缺失时只走导航并记录 `cookie-unavailable`（FR-105-008/009）。
- **轮换**：用户执行「重置凭据」→ 覆盖 `password` 与 `rotatedAt` → 旧会话因 HMAC 密钥变化自然失效（R6）；界面提示「需要重新登录」（FR-105-010）。
- **重试**：探活失败只重试探活，不重置口令；失败态提供「重试探活」与「重置凭据」两个不同动作（FR-105-016）。
- **不做**：不实现请求头注入/代理（ArkWeb 无等价能力，规划 §5.5.1:363）；不把口令写进 `grants.json`（FR-105-017）。

## 7 测试考虑

| 层级 | 用例 | 判据 |
|---|---|---|
| 单元（host） | `redactUrl`（含无参数/多参数/编码值）、token 生成与 `base64("opencode:"+pwd)` 等价、`Credential` 解析/损坏分支 | 纯函数确定输出；损坏输入得到 `corrupt-file` |
| 静态门 | 检索日志字符串常量：不得出现 `OPENCODE_PASSWORD` 的值拼接、`Authorization`、`auth_token=` 后接变量 | 零命中（CI grep） |
| host 门 | 起本地服务（`OPENCODE_PASSWORD=… --port 0`）后 `curl -u opencode:<pwd> /api/info`；不带凭据再请求 | 200；401（TC-H-004/TC-H-008） |
| 真机 AS-105-01/TC-D-006 | 首启看首屏 | 会话列表出现，非登录页 |
| 真机 AS-105-02/TC-D-007 | 杀进程重启 | 仍免登录；`connection.json` 内容不变 |
| 真机 AS-105-03/TC-D-008 | 篡改 `password` 后启动 | 「凭据不匹配」+ 401 + 重置入口，可截图 |
| 真机 AS-105-05 | `hdc shell` 读日志/诊断/错误页文本 | 口令与完整 URL 零命中；仅 `?auth_token=***` |
| 真机 AS-105-06 | 重置后旧 Cookie/旧 token 请求 | 401；界面提示重新登录（O10） |
| 真机 AS-105-08 | `stat -c %a connection.json` | `600`；结构字段齐全 |

## 8 文件清单

| 路径 | 作用 | 状态 |
|---|---|---|
| `entry/src/main/ets/app/Connection.ets` | 口令生成/读取/原子写/损坏备份/轮换；0600 回读校验 | 🚧 新建（`STRUCTURE.md:30`） |
| `entry/src/main/ets/app/OpencodeRuntime.ets` | `buildAppEnv()` 注入 `OPENCODE_PASSWORD`；把 `probe` 结果纳入阶段状态 | 🚧 修改（101 主实现） |
| `entry/src/main/ets/common/Constants.ets` | env 键名、探活重试参数、`redactUrl` 所需常量 | 🚧 新建（与 101/104 共用，按段落分工） |
| `entry/src/main/ets/pages/Index.ets` | 首屏 `loadUrl(firstScreenUrl(...))`、失败页与「重置凭据」入口 | 🚧 修改（103 主实现） |
| `entry/src/main/ets/entryability/EntryAbility.ets` | 启动第一阶段调用 `Connection.load()`；关停不触碰凭据 | 🚧 修改（101 主实现） |
| `<filesDir>/ark/connection.json` | 运行期凭据（0600，不入库） | 🚧 运行时产物 |
| `<filesDir>/ark/connection.json.bad-<ts>` | 损坏时的备份（用于取证，内容含口令 ⇒ 不出沙箱） | 🚧 运行时产物 |
| `scripts/verify-auth.mjs` | host 侧 token 等价、`redactUrl`、日志明文 grep 门 | 🚧 新建 |
| `docs/真机验证记录.md` | 记录 AS-105-01…08 的证据（HTTP 状态、截图、`stat` 输出） | 🚧 追加 |
| `specs/105-auth/{spec.md,plan.md}` | 本规格与方案 | ✅ 本次 |
