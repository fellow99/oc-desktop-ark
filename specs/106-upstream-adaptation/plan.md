# 106 上游适配 — 技术方案（plan）

> 模块：`106-upstream-adaptation`｜文档：plan.md（怎么做）
> 对应规格：`./spec.md`（FR-106-001…018、AS-106-01…09）
> 权威顺序：`specs/constitution.md` → `docs/000-工程规划.md` → `overall-plan.md` → 本文
> 补丁事实源：`patches/v2.0.26/README.md` 与三份补丁文件；本文不复述 hunk 内容，只写判据与落点。

## 1 技术上下文

| 项 | 值 | 来源 |
|---|---|---|
| 上游 | opencode `v2.0.26` / 提交 **`9b4ec5714d`** / 分支 `Branch_v2.0.26`（submodule `../opencode`，两工程共用） | `patches/v2.0.26/README.md:3-5`；`git rev-parse HEAD` |
| 构建链 | `bun install --os=* --cpu=*` → `bun run --cwd packages/cli script/build-node.ts --target=linux-arm64 --bundle-only` | 规划 §5.2.1:292-303；`packages/cli/script/build-node.ts:27` |
| 打包器 | Vite SSR 单文件（`ssr: src/node/index.ts` → `dist-node/opencode.mjs`） | `packages/cli/vite.node.config.ts:285-296` |
| 构建目标 | `OPENCODE_NODE_TARGET=node24`（上游默认 `node26`） | `TECH.md:39`；补丁 `0001` |
| 条件变体 | `resolve.conditions: ["ohos","node"]`（普通与 SSR 两条链） | `TECH.md:40`；补丁 `0001` |
| 变体表 | `#sqlite` / `#pty` / `#persistent-pty-binary` / `#fff` / `#photon-wasm` / `#shell-parser-wasm` / `#v1-migration` | `packages/core/package.json:32-76`；规划 §5.7:415 |
| 运行时 | Node **v24.2.0**，`nodeModuleVersion 137`，`soname libnode.so.137`，部署名 `libnode.so` | `ohos-node-bridge/runtime.lock.json`（`runtimes[0]`）；`TECH.md:22-23` |
| 补丁器 | `scripts/apply-patches.mjs`（基线/工作树守卫 + 反向判据） | `scripts/apply-patches.mjs:33,80-165` |
| host 门禁 | Node **24.14.1** 跑 `smoke-node24.mjs` | `TECH.md:41`；规划 §7.3:520-529 |
| 构建机 | bun **1.3.14** | `TECH.md:37` |

## 2 宪法合规（逐条）

| 原则 | 判定 | 落地与证据 | 对应 FR |
|---|---|---|---|
| C1 壳薄契约硬 | ✅ | 补丁只改**构建条件 / 变体映射 / 解析鲁棒性**，不引入业务分支；运行期只消费 stock 产物 | FR-106-005/006 |
| C2 不隐藏平台真相 | ✅ | PTY 打桩给 `available=false` + 可读原因；shell 不可读视为不可用，不伪造可用 | FR-106-009/014 |
| C3 谁写谁读 | ✅ | 补丁不引入「ArkTS 侧写业务文件」；数据库由 Node 自己建/写，产物由 Node 自己 import | FR-106-011 |
| C4 不改上游 | ✅ | 幂等 + 可逆 + 基线守卫 + 换基线新建目录；禁止 `--3way`；能用 env 解决的（`OPENCODE_DISABLE_FFF` 等）不打补丁 | FR-106-003/004/015/018 |
| C5 崩溃是终态 | ✅ | 打桩的首要判据是「加载期不崩」；不把 import 期异常留给运行期崩溃去暴露 | FR-106-010/016 |
| C6 判据可证伪 | ✅ | 判据 = 退出码、`--reverse --check`、SHA-256、`server listening on …` 日志行、助手是否回复 | FR-106-003/013/016/017 |
| D3 单一事实源 | ✅ | 补丁清单只在 `patches/v2.0.26/README.md` + 脚本目录扫描；版本只在锁定文件 | FR-106-005/017 |
| D4 基线守卫 | ✅ | HEAD 必须 `9b4ec5714d`、工作树必须干净；`--reset --yes` 才允许丢弃改动 | FR-106-001/002 |

## 3 研究结论与依据

| # | 结论 | 依据（path:line） | 对应 FR |
|---|---|---|---|
| R1 | 上游默认 `build.target = "node26"`、`conditions: ["node"]`、`ssr: {noExternal:true}` ⇒ 三处都是「平台差异」入口 | `packages/cli/vite.node.config.ts:117,285,288` | FR-106-006/007 |
| R2 | `0001` 实际改 4 处：普通 `conditions` 前置 `ohos`、SSR `resolve.conditions` 同步、`target` 改 env 注入、`node:sea` 命名导入改兼容层 | `patches/v2.0.26/0001-node-target-ohos.patch:5-39`；规划 §9:610 | FR-106-006/007/008 |
| R3 | `node:sea` 的 `getAssetKeys` 在 Node 24 存在 ⇒ 兼容层走原函数，属**中性**改动（不改变非 SEA 路径） | 同上补丁 `:18-24`；规划 §9:610 | FR-106-008 |
| R4 | `#pty` 的 node 变体在**模块顶层** `createRequire(...)("@lydell/node-pty")`；无 ohos 构件 ⇒ 加载失败会中断整个 bundle | `packages/core/src/pty/pty.node.ts:1-10`；规划 §5.7:420 | FR-106-009/010 |
| R5 | `#persistent-pty-binary` 的 node 变体直接返回 `opencode-pty` 二进制名，设备上无处可执行 | `packages/core/src/persistent-pty/binary.node.ts:1-6`；规划 §5.7:421 | FR-106-009 |
| R6 | `0003` 打桩：两个变体各加 `ohos` 条目 + 两个 stub（`available=false`、调用即抛） | `patches/v2.0.26/0003-runtime-stubs-ohos.patch:5-87`；规划 §9:612 | FR-106-009/010 |
| R7 | `#sqlite` 的 node 变体就是 `node:sqlite` 的 `DatabaseSync`，无第三方依赖 | `packages/core/src/database/sqlite.node.ts:1`；规划 §5.7:419 | FR-106-011 |
| R8 | `libnode-arm64.so` 内含 `node::sqlite::DatabaseSync` / `StatementSync` / `node_sqlite3.BackupJob`；host Node 24.14 交叉验证 `require('node:sqlite')` 无需 flag ⇒ `0002/0004` 取消、`better-sqlite3` 排期取消 | 规划 §5.7:419、§11 P0-B:660、§附录 C v0.2:909；`TECH.md:59` | FR-106-011 |
| R9 | `0006` 根因：应用域对系统路径 `stat` 抛 `EACCES`（不是 `ENOENT`），`throwIfNoEntry` 兜不住 ⇒ `environment()` 每次模型请求前失败，表现为「助手永不回复」 | `packages/core/src/shell/select.ts:55-57,86-93,172-174`；`oc-desktop-hos/src-main/main.js:246-253`；`oc-desktop-hos/patches/v2.0.26/README.md:28` | FR-106-013/014 |
| R10 | 设备上可用 shell 是 `/system/bin/sh`；三重保证：`SHELL` 指向它、`OC_SHELL_FALLBACK` 兜底、`PATH` 前置 `/system/bin` | `oc-desktop-hos/src-main/main.js:254-264`；补丁 `0006:23-31` | FR-106-014 |
| R11 | 幂等判据是 `git apply --reverse --check`；应用后必须再次反向校验（不留半应用） | `scripts/apply-patches.mjs:117-154`；规划 §9:597 | FR-106-003/004 |
| R12 | 基线守卫：HEAD 前缀必须等于 `9b4ec5714d`（可用 `EXPECTED_BASELINE` 覆盖），工作树脏则拒绝；`--reset` 需 `--yes` 并先打印 `git clean -nd` | `scripts/apply-patches.mjs:33,80-109` | FR-106-001/002 |
| R13 | 报告三态与退出码：`+` 可应用 / `=` 已应用 / `!` 冲突；退出码 0/1/2 | `scripts/apply-patches.mjs:24,117-165` | FR-106-017 |
| R14 | `ohos` 条件条目放在变体条件对象内、`node`/`default` 之前，与 `conditions:["ohos","node"]` 配合（按键顺序取首个命中） | `oc-desktop-hos/patches/v2.0.26/README.md:112-113`；`0003:7-19` | FR-106-006 |
| R15 | ABI 风险：SONAME 是 `libnode.so.137`，HAP 内文件名是 `libnode.so` ⇒ 任何以 `DT_NEEDED` 链接 libnode 的 addon 都会找不到；v1 不引入 addon | `ohos-node-bridge/docs/000-工程规划.md:1081-1083,1115`；`runtime.lock.json`；规划 §5.8:435 | FR-106-012 |
| R16 | 产物可加载是独立判据：`import(opencode.mjs)` 不中断 + 打印 `server listening on …` + `/api/info` 200 | 规划 §7.3:520-529、§11 P0-C:661；`packages/cli/src/server-process.ts:190-192` | FR-106-016 |

## 4 数据模型

**补丁清单**（`patches/v2.0.26/`；SHA-256 见 README）：

| 编号 | 落点 | 作用 | 必要性 | 当前 `--check` |
|---|---|---|---|---|
| `0001` | `packages/cli/vite.node.config.ts` | `ohos` 条件（普通 + SSR）、`target` 可注入、`node:sea` 兼容层 | ✅ 必需 | 可干净应用 |
| `0003` | `packages/core/package.json` + `pty.ohos.ts` + `binary.ohos.ts` | PTY / 常驻 PTY 打桩 | ✅ 必需 | 可干净应用 |
| `0006` | `packages/core/src/shell/select.ts` | `stat` 不可读视同不可用 + `OC_SHELL_FALLBACK` | 🔶 P0-J 判定 | 可干净应用 |

**变体矩阵**（`packages/core/package.json:32-76` + 补丁 0003）：

| 变体 | `ohos` 命中 | 处置 | 依据 |
|---|---|---|---|
| `#sqlite` | 无（保留 `node`） | 零补丁，用内置 `node:sqlite` | R7/R8 |
| `#pty` | `pty.ohos.ts`（打桩） | `available=false`、调用即抛 | R4/R6 |
| `#persistent-pty-binary` | `binary.ohos.ts`（打桩） | 同上 | R5/R6 |
| `#fff` | 无 | 以 `OPENCODE_DISABLE_FFF=1` 关闭 | 规划 §5.7:422 |
| `#photon-wasm` / `#shell-parser-wasm` | 无 | 保留 `node` 变体（WASM 可跑，需 ACL/JIT） | 规划 §5.7:423 |
| `#v1-migration` | 无 | 保留（`node` = noop） | 规划 §5.7:424 |

**判定记录 `DecisionRecord`**（`docs/真机验证记录.md` 的一节）：`{ 判据, 设备, 系统/API, 日期, 现象, 日志证据, 结论, 是否打 0006 }`；`0006` 的结论必须能被下一个读者按同样步骤复现（FR-106-013）。

**`RuntimeLock` 快照**：`{ node: v24.2.0, abi: 137, soname: libnode.so.137, deployAs: libnode.so, sha256: 3019bf5f… }`。

**`ArtifactManifest`**（102 产出，本模块只校验）：`{ entry: opencode.mjs, assets: app-archive.bin, fileCount, target: node24, sha256[] }`；本模块额外断言「无 `.node`」。

## 5 接口契约

| 契约 | 内容 |
|---|---|
| 补丁 CLI | `node scripts/apply-patches.mjs` / `--check`（只报告）/ `--list` / `--only <前缀>` / `--reset --yes` / `--repo <path>` |
| 退出码 | `0` 成功；`1` 某条补丁失败或应用后反向校验失败；`2` 前置条件不满足（基线/工作树/参数） |
| 基线 | `EXPECTED_BASELINE` 默认 `9b4ec5714d`；只比较短哈希前缀 |
| 构建 env | `OPENCODE_NODE_TARGET=node24` **必设**；`OPENCODE_NODE_ASSETS_DIR=<dist-node>/assets`（运行期，102 设）；禁设 `NODE_OPTIONS`（库清空） |
| shell env | `SHELL=/system/bin/sh`、`OC_SHELL_FALLBACK=/system/bin/sh`、`PATH` 前置 `/system/bin`（由 102 的 `payload/lib/env.js` 设置） |
| 变体契约 | `ohos` key 必须在 `node`/`default` 之前；打桩模块**不得**有顶层 `require`/`createRequire` 原生加载；`available` 必须是布尔导出 |
| 产物门禁 | `import` 不中断 + 打印 `server listening on http://127.0.0.1:<port>` + `GET /api/info`（Basic）200 + `GET /` 含 UI 标记 |
| 禁止项 | 不 `--3way`；不 `--jitless`（WASM 全废）；不在上游工作树直接改文件；不新增上游构建脚本 |

## 6 实现策略

- **补丁生成**：永远在独立 worktree（`git worktree add --detach 9b4ec5714d`）内改；新增文件先 `git add -N`；每条补丁单独 `git diff -- <落点>` 导出；生成后立即用 `--check`/`--reverse --check` 双向验证（R11/R13）。
- **`0001` 落地**：三个 hunk / 四处改动 —— ① `conditions: ["ohos","node"]`；② `ssr: { noExternal:true, resolve:{ conditions:["ohos","node"] } }`（漏这处则服务端仍解析 `node` 变体）；③ `target: process.env.OPENCODE_NODE_TARGET ?? "node26"`；④ `node:sea` 兼容层（R2/R3）。
- **`0003` 落地**：两个 stub 只导出类型 + `available=false` + 抛错函数；**不 import 任何原生模块**，从 `./pty.js` 只取 `type`（R4/R6）。
- **`0006` 判定**：先不打补丁跑 P0-J（真实对话 + 服务端日志）；命中「EACCES + 助手不回复」才应用并在判定记录写证据；不命中则把补丁移出应用集合（脚本只扫描 `patches/v2.0.26/*.patch`，可用子目录 `optional/` 归档），并同步 `patches/v2.0.26/README.md` 的必要性列。
- **SQLite**：保持 `#sqlite` 无 `ohos` 条目；产物不得出现 `better-sqlite3`；设备侧只复验「建库 → WAL → 写入回读 → 重启后仍可读」（R7/R8）。
- **原生件**：收集阶段删除 `.node`/`opencode-pty` ELF；断言产物无 `.node`；ABI 必须与 `nodeModuleVersion=137` 一致（R15）。
- **构建**：`bun install --os=* --cpu=*` → `OPENCODE_NODE_TARGET=node24 bun run ... --bundle-only`；目标值写进构建日志与产物清单（FR-106-007）。
- **门禁**：host 侧用 Node 24.14 跑 `smoke-node24.mjs`；设备侧 P0-C 只验「import 不中断 + listening + /api/info」（R16）。
- **回写**：任何补丁增删、基线变更、`0006` 结论 MUST 回写 `patches/v2.0.26/README.md`、`docs/000-工程规划.md` §9 与 `overall-plan.md:73-77`（宪法 §5.2 变更控制）。

## 7 测试考虑

| 层级 | 用例 | 判据 |
|---|---|---|
| 静态 | `node scripts/apply-patches.mjs --check`（TC-S-001/003） | 输出基线/工作树正常；3 条均「已应用」或「可应用」；冲突 0 |
| 静态（负） | 人为弄脏 `../opencode` 后 `--check`（TC-S-002） | 退出码 2；提示 `--reset --yes`；不自动清理 |
| 静态（负） | 改 HEAD 到别的提交后 `--check` | 退出码 2；提示新建补丁目录；工作树零改动 |
| 往返 | 干净 worktree 按 `0001→0003→0006` 应用 → 逐条 `--reverse --check` → 反向 | 全部通过；`git status --porcelain -uall` 只含声明落点；还原后逐字节一致 |
| 补丁语义 | `grep` 产物：`Pseudo-terminals are unavailable on HarmonyOS` 存在；无顶层 `@lydell/node-pty` 加载 | 打桩命中；无原生加载 |
| 构建门 | `build-opencode.mjs` + `collect-opencode.mjs`（TC-H-001/002） | 产出 `opencode.mjs` + `assets/app-archive.bin`；目标 `node24`；无 `.node` |
| host 门 | `smoke-node24.mjs`（TC-H-003/004/005/006/007） | listening 行；`/api/info` 200；`/` SPA；SSE 首事件；两次启动同库可读 |
| 设备门 | P0-C：进程内 `import` 产物 | 不中断；listening 行；`/api/info` 200；无「缺少导出/模块」栈 |
| 设备门 | P0-J + AS-106-08 | 助手回复成功；或应用 `0006` 后回复成功；判定记录可复现 |
| 设备门 | AS-106-06/07/09 | 终端返回不支持；重启后会话仍在；产物无 `.node`；ABI 137 |

## 8 文件清单

| 路径 | 作用 | 状态 |
|---|---|---|
| `patches/v2.0.26/0001-node-target-ohos.patch` | 条件变体 + 目标注入 + `node:sea` 兼容层 | ✅ 已存在（本次复核，不改） |
| `patches/v2.0.26/0003-runtime-stubs-ohos.patch` | PTY / 常驻 PTY 打桩 | ✅ 已存在（本次复核，不改） |
| `patches/v2.0.26/0006-shell-select-ohos.patch` | shell 解析鲁棒性（条件启用） | ✅ 已存在（P0-J 后决定去留） |
| `patches/v2.0.26/README.md` | 补丁清单/必要性/SHA-256/纪律 | ✅ 已存在（结论变化时回写） |
| `scripts/apply-patches.mjs` | 基线 + 工作树守卫、幂等应用、三态报告 | ✅ 已存在（本次复核，不改） |
| `scripts/build-opencode.mjs` | `bun install` + `build-node --bundle-only`（`OPENCODE_NODE_TARGET=node24`） | 🚧 新建（102 流水线第 ①② 步） |
| `scripts/collect-opencode.mjs` | 裁剪 `.node`/`opencode-pty` ELF、组装载荷、SHA-256 清单 | 🚧 新建（102 主实现） |
| `scripts/smoke-node24.mjs` | host 门禁：listening / `/api/info` / SPA / SSE / 持久化 | 🚧 新建（102/109 共用） |
| `payload/lib/env.js` | `SHELL` / `OC_SHELL_FALLBACK` / `PATH` / `OPENCODE_*` 装配（含 `0006` 的回落值） | 🚧 新建（102 主实现） |
| `docs/真机验证记录.md` | P0-B/P0-C/P0-J 的证据与判定记录 | 🚧 追加 |
| `docs/000-工程规划.md` §9 | 补丁集结论回写（`0006` 去留、目标版本） | 🚧 必要时修改 |
| `specs/106-upstream-adaptation/{spec.md,plan.md}` | 本规格与方案 | ✅ 本次 |
