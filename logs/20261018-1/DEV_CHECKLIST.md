# DEV_CHECKLIST —— 000-scaffold 工程搭建

> 日期：2026-10-18 · 阶段：Development（实现 + 编译）
> 证据：`entry/build/default/outputs/default/entry-default-unsigned.hap`（16 entries / 解压 122.5 MB）

## 一、落地清单

| # | 项 | 文件 | 状态 |
|---|---|---|---|
| 1 | 应用级配置（包名/版本/图标/显示名） | `AppScope/app.json5`、`AppScope/resources/base/{element,media}` | ✅ |
| 2 | 工程级构建配置 | `build-profile.json5`、`hvigorfile.ts`、`oh-package.json5`、`hvigor/hvigor-config.json5` | ✅ |
| 3 | 主模块配置（能力/设备/权限/单实例） | `entry/build-profile.json5`、`entry/oh-package.json5`、`entry/hvigorfile.ts`、`entry/src/main/module.json5` | ✅ |
| 4 | 资源（字符串三套/颜色/图标/页面表） | `entry/src/main/resources/{base,en_US,zh_CN}` | ✅ |
| 5 | 宿主编排 | `ets/app/{OpencodeRuntime,Connection,Payload}.ets` | ✅ |
| 6 | 常量/端口/日志 | `ets/common/{Constants,Ports,Log}.ets` | ✅ |
| 7 | 宿主能力桥 | `ets/host/HostCapabilities.ets`（2 项实现 + 6 项如实 not-implemented） | ✅ |
| 8 | Ability 与页面 | `ets/entryability/EntryAbility.ets`、`ets/pages/Index.ets`、`rawfile/boot.html` | ✅ |
| 9 | Node 侧宿主脚本 | `payload/opencode-server.js`、`payload/lib/{env,ready}.js` | ✅ |
| 10 | 载荷落点说明 | `entry/src/main/resources/resfile/opencode/README.md` | ✅ |
| 11 | 构建流水线 | `scripts/{build-bridge-har.sh,provision-runtime.sh,build-opencode.mjs,collect-opencode.mjs,smoke-node24.mjs,apply-patches.mjs}` | ✅ |
| 12 | 补丁基线 | `patches/v2.0.26/{0001,0003,0006}` + README | ✅ |
| 13 | 依赖与运行时投放 | `libs/@fellow99/node-bridge.har`（502 KB）、`entry/libs/arm64-v8a/{libnode.so(121 MB),libc++_shared.so}` | ✅（不入库） |

## 二、构建与门禁证据

| 门 | 命令 | 结果 |
|---|---|---|
| 补丁门 | `node scripts/apply-patches.mjs --check` | ✅ 基线 `9b4ec5714d`、工作树干净、3 条补丁可干净应用 |
| 工具链门 | `node scripts/smoke-node24.mjs`（首行） | ✅ 打印 `equivalent=true/false`；本机 `v24.14.1` → `equivalent=false`，需 `--allow-version-drift` 才继续（102 plan 登记的 ⚠️） |
| 语法门 | `node --check scripts/*.mjs payload/*.js payload/lib/*.js` | ✅ 7/7 通过 |
| Shell | `bash -n scripts/*.sh` | ✅ 2/2 通过 |
| 依赖 | `ohpm install --all` | ✅ 0.12 s |
| 编译门 | `hvigorw assembleHap -p buildMode=debug` | ✅ BUILD SUCCESSFUL（首次 10.8 s，增量 1.4 s） |
| 产物门 | 解压 HAP | ✅ 16 entries；`libs/arm64-v8a/{libnode.so,libnode_bridge.so,libnode_host_client.so,libc++_shared.so}`；`resources/resfile/opencode/README.md`；`resources/rawfile/boot.html` |

**已知未做**（如实登记，不掩盖）：
- 未生成载荷（`build-opencode.mjs` 需联网 `bun install` + 上游构建）⇒ 运行时会停在「载荷缺失」错误页（预期行为）。
- 未签名（无 `signing.debug.local.json`）⇒ `entry-default-unsigned.hap`。
- 无真机 ⇒ `TC-D-*` 全部 `⬜`。

## 三、与规格的对应

| 规格 | 实现落点 |
|---|---|
| 101 五阶段编排 | `OpencodeRuntime.launch`（Password→Payload→Start→WaitReady→Loading） |
| 102 载荷判定 | `Payload.plan`（readonly / archive / missing）+ `collect-opencode.mjs` |
| 103 ArkWeb 壳 | `Index.ets`（加载页/错误页/AI 标识/clearHistory） |
| 104 宿主能力 | `HostCapabilities.install`（未实现项如实 not-implemented） |
| 105 鉴权 | `Connection`（64 hex / 复用 / 只经 env）+ `auth_token` 首屏 URL |
| 106 上游适配 | `patches/v2.0.26` + `OPENCODE_NODE_TARGET=node24`（在 build-opencode 中透传） |
| 107 合规 | `module.json5` 声明面（9 项，其中 3 项 ACL）+ AI 标识 |
| 108 版本库插件 | ⬜ Phase 2（本阶段不做） |
| 109 回归基线 | ⬜ 待设备；host 侧门禁脚本已就位 |

## 四、载荷构建与 host 门禁（2026-10-18 第二轮，已实测）

| 步骤 | 命令 | 结果 |
|---|---|---|
| bun 版本门 | `bun --version` → 1.3.14 | ❌ 上游 `build-node.ts` 硬要求 `^1.4.2`（`packages/script/src/index.ts:17`），直接抛错 |
| 本地 bun 1.4.2 | `npm i bun@1.4.2` → `.cache/bun/node_modules/bun/bin/bun.exe`（npm 镜像，GitHub 不可达） | ✅ `1.4.2`；通过 `BUN_BIN` 传给脚本，不改全局 |
| 补丁 | `apply-patches` | ✅ 3 条应用（0001/0003/0006） |
| 上游构建 | `build-opencode --skip-install`（node_modules 由 1.3.14 安装，5670 包） | ✅ `dist-node/opencode.mjs` **16.45 MB**，vite 5812 modules / 25.18 s |
| 投放 | `collect-opencode` | ✅ **43 文件 / 62.3 MB**；裁剪 `opencode-pty`；清单 JSON（toolchain node `v24.14.1` / bun `1.4.2`，totals 65,277,002 B） |
| HAP | `hvigorw assembleHap` | ✅ **111.2 MB** / 60 entries（含 `resfile/opencode/{opencode.mjs,assets/app-archive.bin,bootstrap.js}`） |
| host 门禁 | `smoke-node24 --allow-version-drift` | ✅ 全绿：`port=13683`；`/api/info` 200；无凭据 401；`/` 7231 B；SSE `server.connected`；`--version/--help` 通过 |
| 还原 | `apply-patches --check --reset --yes` | ✅ `../opencode` 工作树干净，3 条补丁可再应用 |

**观察（登记待办）**：`/api/info` 的 `version` 为 `0.0.0-Branch_v2.0.26-202610181342`（上游 `Script.version` 由构建环境推导），与 `AppScope` 的 `2.0.26` 不同。它只用于诊断展示，不影响鉴权/端口；若要统一，需在构建期固定 version 来源（Phase 1）。
