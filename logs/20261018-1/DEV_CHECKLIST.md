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
