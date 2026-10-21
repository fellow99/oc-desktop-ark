# STRUCTURE —— 目录与文件结构

> 现状（2026-10-18）：仅 `docs/`、`patches/`、`scripts/`、`specs/` 已有内容；`entry/` 等为**规划**。
> 标记：✅ 已存在 · 🚧 本次需求（000-scaffold）落地 · ⬜ 后续阶段。

## 一、仓库根

```
oc-desktop-ark/
├── AppScope/
│   ├── app.json5                          🚧 bundleName org.fellow99.oc.OCDesktopArk / label "OC Desktop Ark"
│   └── resources/base/{element,media}/     🚧 应用名与图标
├── build-profile.json5                    🚧 产品 / SDK 6.1.1(24) / 签名指针
├── hvigorfile.ts                          🚧 签名注入（不覆盖 DevEco 写入的配置）
├── oh-package.json5                       🚧 依赖 @fellow99/node-bridge（file:libs/*.har）
├── code-linter.json5                      🚧 ArkTS 静态检查规则
├── signing.debug.local.json.sample        🚧 签名材料模板（真材料 gitignore）
├── .gitignore                             🚧 忽略 .so / 载荷 / 签名 / 构建产物
├── libs/@fellow99/node-bridge.har         🚧 由 scripts/build-bridge-har.sh 产出（不入库）
├── entry/                                 🚧 主模块（HAP）
│   ├── build-profile.json5                🚧
│   ├── libs/arm64-v8a/                    🚧 libnode.so + libc++_shared.so（provision 投放，不入库）
│   ├── oh-package.json5                   🚧
│   └── src/main/
│       ├── module.json5                   🚧 权限声明面 + ability + 单实例
│       ├── ets/
│       │   ├── entryability/EntryAbility.ets      🚧 先 loadContent，再起 Node
│       │   ├── pages/Index.ets                    🚧 加载页 / ArkWeb / 错误页 / 诊断面板
│       │   ├── app/OpencodeRuntime.ets            🚧 启动编排（密码→载荷→start→marker→loadUrl）
│       │   ├── app/Connection.ets                 🚧 密码生成与持久化（0600）
│       │   ├── app/Payload.ets                    🚧 载荷路线判定（resfile / tar.gz / 缺失）
│       │   ├── common/BuildConfig.ets             🚧 110-jitless 编译期形态常量（NODE_MODE，默认 compat）
│       │   ├── common/NodeMode.ets                🚧 110-jitless 形态解析 + ACL 诊断 + node-mode.json 证据
│       │   ├── common/Constants.ets               🚧 唯一常量源（端口/路径/env 名/阶段文案；+NODE_MODE_FILE）
│       │   ├── common/Ports.ets                   🚧 就绪 marker 解析 + HTTP 探活
│       │   ├── common/WindowState.ets             ⬜ 窗口尺寸记忆
│       │   ├── host/HostCapabilities.ets          🚧 HostBridge 能力实现（perm/picker/openExternal/notify）
│       │   └── common/Log.ets                     🚧 hilog 统一前缀
│       └── resources/
│           ├── rawfile/boot.html                  🚧 首屏加载页
│           ├── resfile/opencode/                  🚧 载荷落点（gitignored；README 说明）
│           └── base/{element,media,profile}/      🚧
├── payload/                               🚧 Node 侧启动脚本（源码）
│   ├── opencode-server.js                 🚧 argv/env/chdir/stdout 嗅探/marker/异常兜底（import 前装 jitless 兼容层）
│   ├── jitless/                           🚧 110-jitless 纯 JS 兼容层（index/fetch-shim/undici-shim/http-lazy-undici/photon-shim/image-codec/wasm-patch/vendor/selftest）
│   └── lib/{env.js,ready.js,log.js}       🚧 环境装配 / 就绪 marker / 独立日志
├── patches/v2.0.26/                       ✅ 0001 / 0003 / 0006 + README
├── scripts/                               ✅ 已有 apply-patches.mjs
│   ├── apply-patches.mjs                  ✅ 幂等 + 基线/工作树守卫
│   ├── build-bridge-har.sh                🚧 构建 bridge HAR → libs/
│   ├── provision-runtime.sh               🚧 投放 libnode.so + libc++_shared.so
│   ├── build-opencode.mjs                 🚧 bun install + build-node --bundle-only
│   ├── collect-opencode.mjs               🚧 裁剪 assets + 投放 resfile（含 jitless/）+ SHA-256 清单
│   ├── check-acl-surface.mjs              🚧 110-jitless 权限声明面静态门禁（AC-110-06）
│   └── smoke-node24.mjs                   🚧 host 门禁（/api/info + SPA + SSE）
├── docs/
│   ├── 000-工程规划.md                    ✅ v0.3（唯一权威规划）
│   ├── README.md                          ⬜ 文档索引
│   ├── ACL申请清单.md                     ⬜ Phase 1
│   └── 真机验证记录.md                    ⬜ Phase 0 起
├── specs/                                 ✅ 本次需求的规格体系（见下）
├── logs/<YYYYMMDD>-N>/                    🚧 开发/评审/测试证据
└── README.md                              🚧 工程说明（构建/运行/已知限制）
```

## 二、specs 目录

```
specs/
├── README.md                 本次生成（文档索引）
├── SPECS_CHECKLIST.md        完成度追踪
├── STRUCTURE.md              ← 本文件
├── TECH.md                   技术选型
├── ARCHITECTURE.md           整体架构
├── constitution.md           宪法
├── overall-spec.md           整体规格
├── overall-plan.md           整体技术方案
├── overall-data-model.md     数据模型
├── overall-test-cases.md     测试用例索引
├── 101-runtime-integration/{spec.md,plan.md}
├── 102-payload-pipeline/{spec.md,plan.md}
├── 103-arkweb-shell/{spec.md,plan.md}
├── 104-host-capabilities/{spec.md,plan.md}
├── 105-auth/{spec.md,plan.md}
├── 106-upstream-adaptation/{spec.md,plan.md}
├── 107-compliance/{spec.md,plan.md}
├── 108-git-plugin/{spec.md,plan.md}
├── 109-regression/{spec.md,plan.md}
└── 110-jitless/{spec.md,plan.md,tasks.md,test-cases.md}   🚧 无 JIT 双形态兼容（编译期 NODE_MODE + payload/jitless 纯 JS 兼容层）
```

> 按需求约定：本需求的规格**只落在 `oc-desktop-ark/specs/`**，不进入父工程 `specs/`。
> 不生成 `API.md` / `overall-api.md`（需求明确排除）。

## 三、页面与入口清单

| 入口 | 文件 | 说明 |
|---|---|---|
| UIAbility | `entry/src/main/ets/entryability/EntryAbility.ets` | `launchType: singleton`；`onWindowStageCreate` 先 `loadContent` |
| 主页面 | `entry/src/main/ets/pages/Index.ets` | 加载页 → ArkWeb（`loadUrl` 本地服务）→ 失败时错误页 |
| 首屏静态页 | `entry/src/main/resources/rawfile/boot.html` | 纯 HTML，显示阶段文案（不依赖本地服务） |
| Node 入口 | `payload/opencode-server.js` | 由库 `bootstrap.js` 经 `NODE_BRIDGE_ENTRY` 解析 |
| 应用内路由 | 无（单页） | 业务路由全部由服务端 SPA 承担 |

## 四、关键配置文件

| 文件 | 作用 |
|---|---|
| `AppScope/app.json5` | bundleName / 版本 / 图标 / label |
| `build-profile.json5` | 产品、SDK、签名配置指针 |
| `entry/src/main/module.json5` | 权限、Ability、`backgroundModes`、设备类型 |
| `oh-package.json5` | HAR 依赖 |
| `patches/v2.0.26/README.md` | 补丁清单与纪律 |
| `runtime.lock.json`（兄弟工程） | Node 运行时版本与 SHA-256（只读引用） |
| `<filesDir>/ark/connection.json` | 运行时凭据（0600，不入库） |

## 五、构建产物

| 产物 | 路径 | 是否入库 |
|---|---|---|
| bridge HAR | `libs/@fellow99/node-bridge.har` | ❌ |
| 运行时 SO | `entry/libs/arm64-v8a/libnode.so`、`libc++_shared.so` | ❌ |
| 载荷 | `entry/src/main/resources/resfile/opencode/**` | ❌ |
| 载荷清单 | `entry/src/main/resources/resfile/opencode/manifest.sha256` | ✅（仅哈希） |
| HAP | `entry/build/default/outputs/default/entry-default-signed.hap` | ❌ |
| 签名材料 | `signing.*.local.json` | ❌ |
