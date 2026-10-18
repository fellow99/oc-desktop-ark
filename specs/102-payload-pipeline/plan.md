# 102 载荷流水线 — 技术方案（plan）

> 模块：`102-payload-pipeline`｜文档：plan.md（怎么做）
> 对应规格：`./spec.md`（FR-102-001…012、AS-102-01…09）
> 权威顺序：`specs/constitution.md` → `docs/000-工程规划.md` → `overall-plan.md` → 本文
> 补丁归属与基线：`patches/v2.0.26/README.md`（本工程自有补丁目录）

## 1 技术上下文（运行时与依赖版本）

| 项 | 值 | 来源 |
|---|---|---|
| 上游 | opencode **tag v2.0.26** / 提交 **`9b4ec5714d`** / 分支 `Branch_v2.0.26` / `package.json version = 2.0.26` | `TECH.md:32`；规划 §0 文档头 |
| 目标运行时 | Node **v24.2.0**（ABI 137、`platform=openharmony`、`arch=arm64`） | `TECH.md:22,25` |
| 构建目标 | `OPENCODE_NODE_TARGET=node24`（补丁 0001 注入，默认 `node26`） | `TECH.md:39`；规划 §5.2.1 |
| 产物目标 | `--target=linux-arm64 --bundle-only`（不产 SEA；JS 部分平台无关） | 规划 §5.2.1:294-303 |
| 包管理器 | 上游 `packageManager` 契约 **bun ^1.4.2**；本机实测 **1.3.14** ⚠️ | `oc-desktop-hos/scripts/build-opencode.mjs:56`；`TECH.md:37` |
| 产物 | `packages/cli/dist-node/opencode.mjs` + `dist-node/assets/**`（含内嵌 UI 归档 `app-archive.bin`） | 规划 §5.2.1:297；`collect-opencode.mjs:76-83` |
| 投放 | `entry/src/main/resources/resfile/opencode/**`（直读优先）；清单 `resfile/opencode/manifest.sha256` | `STRUCTURE.md:39,119`；规划 §5.8 |
| host 门禁运行时 | 规划要求 **Node 24.2.0**（与设备一致）；本机为 **24.14.1** ⚠️ | 规划 §7.3:520-529；`TECH.md:41` |
| 应用侧 SDK / 构建 | HarmonyOS 6.1.1.125 / API 24；hvigor 6.24.2（仅投放目标相关） | `TECH.md:12-13` |

⚠️ 两处必须显式登记的版本差异：bun（契约 1.4.2 vs 本机 1.3.14）与 host 门禁 Node（24.2.0 vs 24.14.1）。处置见 §6，禁止静默按本机版本产出（C6）。

## 2 宪法合规（逐条）

| 原则 | 判定 | 落地与证据 | 对应 FR |
|---|---|---|---|
| C1 壳薄契约硬 | ✅ | 流水线全在 host 脚本；应用侧不解析载荷、不生成清单 | FR-102-007、011 |
| C2 不隐藏平台真相 | ✅ | 每条门禁失败即非零退出并打印响应码/缺件；裁剪必有理由 | FR-102-009、012 |
| C3 谁写谁读 | ✅ | 解包器在 Node 侧（`payload/lib`，102 交付源码）；ArkTS 不解压业务载荷 | FR-102-006 |
| C4 不改上游 | ✅ | 只打 3 条幂等补丁；构建差异靠环境变量与补丁，不新增上游脚本 | FR-102-001、011 |
| C5 崩溃终态 | ✅（间接） | 门禁禁止「先上机再说」；产物缺陷在 host 阶段拦住 | FR-102-008 |
| C6 判据可证伪 | ✅ | 判据 = 退出码 + 清单哈希 + HTTP 状态码 + 首个 SSE 事件 | FR-102-007、008、009 |
| D3 单一事实源 | ⚠️ | 补丁清单只在 `patches/v2.0.26/README.md` 与 `apply-patches.mjs` 目录扫描中体现；脚本 MUST NOT 再硬编码文件名列表 | FR-102-001 |
| D4 基线守卫 | ✅ | HEAD=`9b4ec5714d` + 工作树干净 + `--reset --yes` 双参数 | FR-102-002 |

## 3 研究结论与依据

| # | 结论 | 依据（path:line） | 对应 FR |
|---|---|---|---|
| R1 | 基线守卫顺序固定：① `rev-parse --short HEAD` 与 `EXPECTED_BASELINE`（默认 `9b4ec5714d`）前缀比对 → ② `status --porcelain` 为空 → ③ 才进入逐条应用 | `oc-desktop-ark/scripts/apply-patches.mjs:33`、`:80-110` | FR-102-002 |
| R2 | 幂等判定只认 `git apply --reverse --check`；应用后再做一次反向校验，不通过即失败（不留半应用） | 同上 `:117-154` | FR-102-001 |
| R3 | 脏树默认拒绝（退出码 2），`--reset` 缺 `--yes` 时先打印 `git clean -nd -- packages` 再拒绝 | 同上 `:90-108` | FR-102-002 |
| R4 | 补丁集为 3 条：`0001-node-target-ohos`（必需）、`0003-runtime-stubs-ohos`（必需）、`0006-shell-select-ohos`（待 P0-J）；`0002/0004/0005` 明确不需要 | `patches/v2.0.26/README.md:9-17`；规划 §9:606-616 | FR-102-001 |
| R5 | 构建前必须校验上游 `package.json version = 2.0.26` 与补丁目录非空，否则报错而不是继续 | `oc-desktop-hos/scripts/build-opencode.mjs:72-85` | FR-102-002、003 |
| R6 | bun 版本不合格时**不回落到 PATH**，而是用缓存/下载的固定版本（避免报错误导向上游脚本） | 同上 `:114-144` | FR-102-003、004 |
| R7 | 依赖安装必须 `bun install --os=* --cpu=*`（否则跨平台可选依赖缺失） | 同上 `:184-187`；规划 §5.2.1:294 | FR-102-004 |
| R8 | 构建后立即断言 `opencode.mjs` 与 `assets/app-archive.bin` 同时存在；缺 UI 归档则根路径 404 | 同上 `:190-203`；规划 §2.2(c) | FR-102-003、009 |
| R9 | 裁剪按「包 id」粒度匹配（scoped 包用 `@scope/pkg`），规则为排除 `node-pty-{darwin,win32}`、`@parcel/watcher-{darwin,win32,linux-x64}`、`fff-bin-*`、`ffi-rs-*` 与 `opencode-pty/`（持久终端 ELF） | `oc-desktop-hos/scripts/collect-opencode.mjs:64-71`、`:164-200` | FR-102-005 |
| R10 | 归档必须 `tar --format=ustar`（解包器只实现 ustar），打包后 `tar -tzf` 逐条校验：必需条目在场、应裁条目缺席 | 同上 `:100-115`、`:202-221` | FR-102-005、009 |
| R11 | 清单哈希取归档整体 SHA-256 并打印前 16 位；marker 幂等必须**内容比对**（只比存在性会导致就地升级不生效） | 同上 `:103-104`；`oc-desktop-hos/src-main/tar-extract.js:8-9`、`:24-65` | FR-102-006、007 |
| R12 | 解包必须流式（禁一次性读入）、拒绝越界条目、跳过 symlink/hardlink 并计数上报 | `oc-desktop-hos/src-main/tar-extract.js:71-172`（越界拒绝 `:122-124`，链接跳过 `:128-131`） | FR-102-006 |
| R13 | host 门禁五项：`--version`/`--help`（含 `serve`）、`/api/info` 200、`/` 返回含 `<html` 的 SPA、`/api/event` 首个事件 `server.connected` | `oc-desktop-hos/scripts/smoke-node22.mjs:67-132` | FR-102-008 |
| R14 | 门禁必须校验解释器版本并打印；版本不符即失败（本工程改为「显式 `--allow-version-drift` 才降级为非等价证据」） | 同上 `:45`、`:59-60` | FR-102-008 |
| R15 | 运行时侧环境必须显式给 `OPENCODE_NODE_ASSETS_DIR`（指向 `assets/`），并在 import 前 `chdir` 到沙箱工作区 | `oc-desktop-hos/src-main/sidecar.js:43-48`、`:57-65` | FR-102-006 |
| R16 | 直读路线的前提是「包内只读目录可 import 且可读 assets」——⬜ P0-G 裁决；失败退归档 | 规划 §5.8:428-435、§12.1 A1 | FR-102-006 |

## 4 数据模型与流水线阶段

| 实体（spec §4） | 技术落点 | 关键实现约束 |
|---|---|---|
| `PatchSet` | `patches/v2.0.26/*.patch` + `README.md` | 目录即集合；`apply-patches.mjs` 只扫描目录，不硬编码清单（FR-102-001、D3） |
| `BaselineGuard` | `scripts/apply-patches.mjs:80-110` | HEAD=`9b4ec5714d` 且 `status --porcelain` 为空（FR-102-002、D4） |
| `BuildArtifact` | `../opencode/packages/cli/dist-node/{opencode.mjs,assets/**}` | 入口与 `assets/app-archive.bin` 必须同时存在（FR-102-003、009） |
| `PruneRule` | `scripts/collect-opencode.mjs` 的 `PRUNE_PATTERNS`（下表 PR-1…PR-4） | 按包 id 粒度；与归档校验共用同一数据（FR-102-005） |
| `Payload` | `entry/src/main/resources/resfile/opencode/**`（直读）/ `opencode-dist.tar.gz`（回退） | 形态由直读可行性决定，不做编译期开关（FR-102-006） |
| `PayloadManifest` | `resfile/opencode/manifest.sha256`（下例） | 只含哈希；确定性序列化（FR-102-007） |
| `DropTarget` | `resfile/opencode/`（只读）/ `<filesDir>/opencode-dist/`（可写，仅回退） | 业务文件只落这两处（C3） |
| `GateReport` | `scripts/smoke-node24.mjs` 的检查项与退出码 | 全绿才允许上机；打印 `equivalent`（FR-102-008、009） |

**PayloadManifest**（`entry/src/main/resources/resfile/opencode/manifest.sha256`，JSON 单行，入库）：

```json
{"schema":1,"baseline":"9b4ec5714d","form":"resfile|archive","node":"24.2.0","target":"node24",
 "toolchain":{"bun":"1.4.2"},"files":[{"path":"opencode.mjs","size":0,"sha256":"…"}],
 "totals":{"files":89,"bytes":0}}
```

**归档回退的幂等 marker**：`<filesDir>/opencode-dist/opencode-dist.version`，内容 = 归档 SHA-256（换行结尾）；与归档实测哈希不同即重解压（`tar-extract.js:53-58`）。

**裁剪规则表**（`PruneRule`，与清单/门禁共用同一份数据）：

| 规则 | 匹配（包 id） | 理由 |
|---|---|---|
| PR-1 | `@lydell/node-pty-darwin-*` / `-win32-*` | 非目标平台原生件 |
| PR-2 | `@parcel/watcher-{darwin,win32,linux-x64}*` | 无 ohos 构件；`OPENCODE_FILEWATCHER_DISABLE=1` 已关 |
| PR-3 | `@ff-labs/fff-bin-{darwin,win32,linux-x64}*`、`@yuuang/ffi-rs-*` | Node 26 FFI 特性，设备不可用 |
| PR-4 | `opencode-pty/` | 持久终端助手 ELF；PTY 平台级不可用 |

**阶段**（`scripts/*` 共用编号，日志前缀 `[ark][payload]`）：
`S0 preflight`（基线/版本/补丁目录）→ `S1 patch`（守卫 + 幂等）→ `S2 install` → `S3 build`（断言入口 + assets）→ `S4 collect`（裁剪 → 打包 → 校验 → 投放 → 清单）→ `S5 smoke`（门禁）。

## 5 接口契约

**提供（CLI，供 109 与人工）**

| 命令 | 参数 | 退出码语义 |
|---|---|---|
| `node scripts/apply-patches.mjs` | `--check` / `--list` / `--only <前缀>` / `--reset --yes` / `--repo <path>` | 0 成功；1 补丁失败；2 前置条件不满足 |
| `node scripts/build-opencode.mjs` | `--skip-install` / `--no-smoke` / `--bun <path>` | 非零 = 阶段失败（日志指明阶段） |
| `node scripts/collect-opencode.mjs` | `--product <dir>` / `--out <dir>` / `--no-app-copy` | 非零 = 缺件/裁剪校验失败 |
| `node scripts/smoke-node24.mjs` | `--node <path>` / `--product <dir>` / `--timeout <ms>` / `--allow-version-drift` | 非零 = 门禁红 |

**消费（环境变量）**：`OPENCODE_NODE_TARGET=node24`（补丁 0001 读取）、`OCR_OPENCODE_DIR`（默认 `../opencode`）、`OCR_OPENCODE_BASELINE`、`EXPECTED_BASELINE`、`OCR_SMOKE_TIMEOUT_MS`。变量名 MUST 与 `payload/lib/env.js` 镜像（D3）。

**事件/输出**：每阶段一行 `[ark][payload] <stage> <ok|fail> <计数>`；清单写入后打印 `manifest sha256 前缀 + 条目数`；门禁打印 `node=<version> equivalent=<true|false>`。

## 6 实现策略

- **架构模式**：一条「阶段化管道 + 纯函数库」，`scripts/lib/` 提供 `runOrFail`/`sha256File`/`copyTree`/`isElfAarch64` 等原语；每阶段一个函数、失败即抛，主函数只做编排（对照 `build-opencode.mjs:60-70`）。
- **关键算法 1（幂等补丁）**：`for patch of sorted(dir)`: `git apply --reverse --check` 成功 → 跳过；否则 `git apply --check` → 失败即报「上下文冲突」并退出 1（禁 `--3way`）→ `git apply` → 再次 `--reverse --check` 必须成功。守卫在循环之前一次性完成（FR-102-001/002）。
- **关键算法 2（清单生成）**：先按 `PruneRule` 裁剪，再对投放根做**确定性遍历**（路径字典序、只算文件、跳过自身 `manifest.sha256`），逐文件 `sha256File`，最后整体序列化为单行 JSON（键序固定）⇒ 重复构建哈希集合可复现（FR-102-007）。
- **关键算法 3（门禁）**：进程内起子进程跑 `serve --hostname 127.0.0.1 --port 0`，解析 stdout 的 `server listening on <url>` 得端口（**不用**预选端口逻辑，避免与产品路径分叉）；随后四项 HTTP 断言，任一项失败打印响应码与输出尾部 2000 字节后退出（FR-102-008）。
- **版本冲突处置**：bun 固定为 `.cache/bun/bun-1.4.2[.exe]`（缺失则下载）；凭 `bun --version` 判定，不满足 `^1.4.2` 即失败并给出「删缓存重跑」。门禁 Node 默认解析 `.cache/node/node-v24.2.0-<platform>-<arch>`；本机 24.14.1 只在 `--allow-version-drift` 下使用且必须打印 `equivalent=false`（FR-102-003/008）。
- **错误处理**：所有 catch 收敛到 `fail(stage, error)`，打印阶段 + 原因 + 处置建议；产物保留现场不自动回滚（FR-102-012）。
- **性能**：`--skip-install` 与 `.stage/` 暂存目录支持增量；裁剪与哈希遍历单遍完成；归档打包用系统 `tar`（禁止把 35 MB 载荷读进内存）。

## 7 测试考虑

| 层级 | 用例 | 判据 |
|---|---|---|
| 单元（`node --test`） | 裁剪规则匹配（scoped / 非 scoped / 空 id）、清单序列化稳定性、越界条目路径判定 | 纯函数返回确定结果；不依赖网络 |
| 门禁自检 | `apply-patches.mjs --check` 在脏树/错基线上的退出码 | 分别为 2 / 2，且文件未被修改 |
| 负样本 | 删 `assets/app-archive.bin` 后跑门禁 | 非零退出并打印「内嵌 UI 未生效」类原因（FR-102-009） |
| 集成 | `build-opencode.mjs --no-smoke` 后跑 `collect-opencode.mjs` + `smoke-node24.mjs` | 清单存在、必需条目在场、四项 HTTP 断言全绿 |
| 复现性 | 连续两次 collect，比较清单 `files[].sha256` 集合 | 集合相同（FR-102-007） |
| 真机（转交） | P0-C（进程内 import + serve）、P0-G（直读）、P0-K（体积/首启） | 由 101/109 记录，不在本模块内闭环 |

## 8 文件清单

| 路径 | 作用 | 状态 |
|---|---|---|
| `scripts/apply-patches.mjs` | 幂等补丁 + 基线/工作树守卫 | ✅ 已存在（165 行） |
| `patches/v2.0.26/0001-node-target-ohos.patch` | conditions / `ssr.resolve.conditions` / `build.target` / `node:sea` 兼容 | ✅ 已存在 |
| `patches/v2.0.26/0003-runtime-stubs-ohos.patch` | `#pty`、`#persistent-pty-binary` 打桩 | ✅ 已存在 |
| `patches/v2.0.26/0006-shell-select-ohos.patch` | `stat()` 的 `EACCES` 视同不可用 + `OC_SHELL_FALLBACK` | ✅ 已存在（待 P0-J 判定） |
| `patches/v2.0.26/README.md` | 补丁清单、纪律、SHA-256 | ✅ 已存在 |
| `scripts/build-opencode.mjs` | preflight → patch → install → build（断言入口 + assets） | 🚧 新建 |
| `scripts/collect-opencode.mjs` | 裁剪 → 打包（ustar）→ 归档校验 → 投放 → 生成 `manifest.sha256` | 🚧 新建 |
| `scripts/smoke-node24.mjs` | host 门禁（CLI + `/api/info` + `/` + `/api/event`） | 🚧 新建 |
| `scripts/lib/util.mjs` | `runOrFail` / `sha256File` / `copyTree` / `isElfAarch64` / `parseArgs` | 🚧 新建 |
| `payload/opencode-server.js` | 宿主入口：env → `chdir` → stdout 嗅探 → `argv` → `import` → 异常兜底 | 🚧 新建（102 交付，101 消费其 marker） |
| `payload/lib/env.js` | 应用语义环境（`XDG_*`/`OPENCODE_*`/`NO_PROXY`/`PATH`）单一事实源 | 🚧 新建 |
| `payload/lib/ready.js` | 原子写 `<filesDir>/payload/server.ready.json` + 打印 `ARK_SERVER_READY {json}` | 🚧 新建 |
| `payload/lib/log.js` | 独立日志通道 `<filesDir>/logs/server.log`（不与库 `app.log` 共文件） | 🚧 新建 |
| `entry/src/main/resources/resfile/opencode/**` | 载荷落点（不入库；`README.md` 说明来源与重建命令） | 🚧 由 collect 产出 |
| `entry/src/main/resources/resfile/opencode/manifest.sha256` | 载荷清单（只含哈希，入库） | 🚧 由 collect 产出 |
| `entry/src/main/resources/resfile/opencode/opencode-dist.tar.gz` | 归档回退形态（仅当直读不可行；P0-G 裁决后启用） | ⬜ 条件产出 |
| `.cache/bun/`、`.cache/node/` | 固定版本工具缓存（不入库） | 🚧 本地 |
