# test-cases.md —— `110-jitless` 测试用例

> 对应 [`spec.md`](spec.md) 的 `AC-110-xx`。分三层：**PC 侧（`node --jitless`，秒级迭代）** → **静态/投放门禁** → **真机**。
> 每条用例必须有可复现命令与可判读的期望输出；不允许「应该可以」。
> **证据口径**：`AC-110` 的真机证据**只认真机**；PC 侧同一脚本仅用于开发期快速迭代。
> **敏感信息**：DeepSeek API key / git 账号密码 / 测试 URL 只进运行时 env / 命令参数，**不落盘**任何文件/文档/日志。

---

## 一、PC 侧（本机 Node v24.14.1，`--jitless` ≈ 真机 compat 形态）

### TC-110-01 复现基线：WASM 缺失
```bash
node --jitless -e "console.log(typeof WebAssembly)"   # 期望 undefined
node -e "console.log(typeof WebAssembly)"             # 对照：object
```

### TC-110-02 兼容层安装事实
```bash
node --jitless payload/jitless/selftest/run.mjs --only=install
```
期望：日志含 `WebAssembly=undefined`、`httpLazy=installed(sealed n)`、`fetch=installed`、`globals: Headers/Request/Response/FormData/Blob/File` 三态之一；**不得**出现 `failed`。（AC-110-01）

### TC-110-03 fetch：GET 文本
本地 HTTP 服务返回 `hello-GET`：
```bash
node --jitless payload/jitless/selftest/run.mjs --only=fetch-get
```
期望：`status=200`、`text()='hello-GET'`。

### TC-110-04 fetch：POST JSON + 自定义头
期望：服务端收到的 `authorization` 头与 `content-type` 与请求一致（防「头全丢 ⇒ 401」回归）；回包 `json()` 解析正确。

### TC-110-05 fetch：SSE 流式（关键）
服务端分 5 块 `data: {...}\n\n` 慢速写出。
期望：`response.body.getReader()` 可用，逐块读到（**不是**全部缓冲后一次性返回），最后 `done=true`。（AC-110-02）

### TC-110-06 fetch：中止
`AbortController` 在 100 ms 后 abort。期望：`fetch` 以 `AbortError` 拒绝；套接字被销毁。

### TC-110-07 fetch：FormData 与 Blob
期望：服务端解析出与发送一致的字段与文件字节（防 `[object FormData]` 回归）。

### TC-110-08 fetch：重定向
301 → 302 → 200。期望：最多 5 跳后得到最终响应；303 + POST 改写为 GET。

### TC-110-09 undici 危险面
```bash
node --jitless payload/jitless/selftest/run.mjs --only=undici
```
期望：compat 下 `install()` 调用后 `globalThis.fetch` **仍是**垫片；`request/stream/pipeline/connect/upgrade` 明确 reject（`code=ERR_JITLESS_UNDICI_WASM`）。（AC-110-03）

### TC-110-10 photon：惰性解码（常用路径零解码）
构造一张 800×600 JPEG：期望 `new_from_byteslice` 后 `get_width()=800`/`get_height()=600`，自检日志 `decoded=0`；`get_bytes()` 返回合法 PNG。（AC-110-04）

### TC-110-11 photon：resize + 双编码
2000×1500 PNG → `resize(img,1000,750,Lanczos3)`：期望尺寸正确；`get_bytes()` 为 PNG；`get_bytes_jpeg(80)` 为 JPEG（魔数 `FFD8`）。（AC-110-04）

### TC-110-12 tree-sitter / code-mode 降级
compat 下触发语义搜索 / code-mode：期望得到**结构化降级提示**（「本档不支持语义搜索，已回退文本搜索」/ code-mode 不可用），**进程不崩**；纯文本 grep 搜索仍可用。（AC-110-11）

### TC-110-13 jit 形态零回归（PC 对照）
不带 `--jitless` 跑同一份 selftest：期望兼容层**不安装**（`WASM available, nothing to do`）；原生 `fetch`/`undici`/`photon` 保持原生。

---

## 二、静态 / 投放门禁（host，无设备）

### TC-110-14 权限声明面
```bash
node scripts/check-acl-surface.mjs
```
期望：`module.json5` 只含 JIT ACL（`definePermissions`）+ 6 项 `requestPermissions`（INTERNET / GET_NETWORK_INFO / KEEP_BACKGROUND_RUNNING / kernel.ALLOW_WRITABLE_CODE_MEMORY / READ_WRITE_DOCUMENTS_DIRECTORY / READ_WRITE_DOWNLOAD_DIRECTORY）；**无** `READ_PASTEBOARD` / `READ_WRITE_DESKTOP_DIRECTORY`。（AC-110-06）

### TC-110-15 脚本语法
```bash
node --check scripts/*.mjs payload/jitless/*.js payload/*.js
```
期望：全部 0 错。

### TC-110-16 投放门禁
```bash
node scripts/collect-opencode.mjs --apply
```
期望：`resfile/opencode/jitless/` 存在且含 `index.js`/`fetch-shim.js`/`undici-shim.js`/`photon-shim.js`/`image-codec.js`/`wasm-patch.js`/`vendor/*`；`manifest.sha256` 覆盖全部 `jitless/**`；`selftest/` **不在** resfile。（AC-110-05）

### TC-110-17 无运行期形态切换残留
```bash
grep -rn "probeFlags" entry/src/main/ets  # 不得参与 flags 决策
```
期望：release 构建路径中 `probeFlags` 不进入 `nodeFlags`（形态只由 `BuildConfig.NODE_MODE` 决定）。（AC-110-12）

---

## 三、真机（需 hdc 在线；Profile 含 JIT ACL）

> 通道命令（建/用同一条，`hdc fport` 规则只在创建它的那次调用内有效）：
```bash
# 取真实端口 + 建隧道（同一条命令内建+用）
PORT=$(hdc shell "cat <filesDir>/payload/server.ready.json" | python -c "import sys,json;print(json.load(sys.stdin)['port'])")
hdc fport tcp:18400 tcp:$PORT   # 与后续 curl 写在同一条命令里
```

### TC-110-18 运行形态（编译期 compat）
```bash
hdc shell aa start -b org.fellow99.oc.OCDesktopArk -a EntryAbility
hdc shell "cat <filesDir>/payload/node-mode.json"
hdc shell "tail -50 <filesDir>/payload/node.log"
```
期望：`node-mode.json` 的 `reason` 形如「编译期常量 `BuildConfig.NODE_MODE=compat`（运行期不可切换）」；载荷日志 `WebAssembly=undefined`；`flags` 含 `--jitless`。（AC-110-07）

### TC-110-19 启动到就绪
期望：`server.ready.json` 写出，marker 端口可探活，ArkWeb 加载 opencode UI 且可交互；记录**冷启动耗时**（纳入 NFR-110-006 基线）。（AC-110-07）

### TC-110-20 真实对话（关键）
期望：一次对话 `stopReason=stop`，SSE 流式可见（调模型走纯 JS fetch）。（AC-110-08）
> DeepSeek API key 仅运行时 env 注入，**不落盘**。

### TC-110-21 图片附件
期望：发一张 ≤ 限制的 JPEG 成功（视觉模型识读）；超限图被缩放后成功；失败则用户可见明确提示且对话可继续。（AC-110-09）

### TC-110-22 git 插件闭环
期望：
- 无账号仓库：clone/ls/commit 成功；
- 带账号仓库：填一次凭据后 pull/push 成功（凭据落 `~/.git-credentials` 0600，**不落盘文档**）。

### TC-110-23 降级如实
期望：compat 形态触发语义搜索 / code-mode 得到结构化降级提示，进程**不崩**，UI 可继续。（AC-110-11）

### TC-110-24 jit 变体回归
把 `BuildConfig.NODE_MODE` 改成 `'jit'` 重新构建、重装：
```bash
hdc shell "cat <filesDir>/payload/node-mode.json"   # 期望 mode=jit、flags 不含 --jitless
```
期望：`mode=jit`、`execArgv` **不含** `--jitless`；启动/对话/图片与改造前一致（jit 零回归）。（AC-110-10）

### TC-110-25 release 合规
release 包启动：期望无运行期形态切换入口；`node-mode.json` 依据串 = 编译期常量。（AC-110-12）

---

## 四、overall-test-cases.md 引用关系（重排）

本模块用例并入 `specs/overall-test-cases.md` 的分层索引：

| 层 | 本模块用例 | 说明 |
|---|---|---|
| 静态（TC-S-*） | TC-S-005（权限声明面，现含 check-acl-surface） | 复用既有静态门禁口径 |
| host（TC-H-*） | TC-110-14/15/16/17（静态/投放门禁） | 无设备，host 可跑 |
| PC 自测 | TC-110-01…13（`node --jitless`） | 开发期迭代，非真机验收证据 |
| 设备（TC-D-*） | TC-110-18…25 | 需 hdc 在线 + Profile 含 JIT ACL |

> 既有 `TC-D-002`（无 ACL 反证：Profile 不含 JIT ACL ⇒ SIGTRAP）与 `TC-D-003`（有 ACL 正证）仍适用；本模块在其上叠加「compat 形态下纯 JS 兼容层使服务可用」。

---

## 通过判据

- PC 侧（TC-110-01…13）全绿；
- 静态/投放门禁（TC-110-14…17）全绿；
- 真机：TC-110-18…20 必须通过；TC-110-21/23 允许「如实降级」但必须有可见提示；TC-110-24/25 不能回归；
- 敏感信息（API key / 账号密码 / 测试 URL）**零落盘**。
