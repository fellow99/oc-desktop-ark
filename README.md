# OC Desktop · HarmonyOS Edition（`oc-desktop-ark`）

> **版别定位：HarmonyOS Edition** —— OC Desktop 的两个鸿蒙版别之一；
> 另一个是 [`oc-desktop-hos`](../oc-desktop-hos)（**Electron on HarmonyOS Edition**：Electron 37 自带 Node）。
>
> 本版**无 Electron、无 Chromium**：进程内 Node（`@fellow99/node-bridge`，v24.2.0）
> 承载 opencode v2 服务端，**ArkWeb** 同源渲染其 Web UI。
>
> 本工程**非 opencode 团队构建**，与 [opencode](https://github.com/anomalyco/opencode) 无隶属关系；opencode 为上游开源项目（MIT），
> 本工程仅是其桌面形态在 HarmonyOS 上的第三方移植。

| 项 | 值 |
|---|---|
| 应用名 / 包名 | **OC Desktop Ark** / `org.fellow99.oc.OCDesktopArk` |
| 版本 | `2.1.2` / `versionCode 20102` |
| 目标设备 | `2in1` / `tablet`（不做 phone） |
| 上游基线 | opencode **v2.1.2**（tag `v2.1.2` / 提交 `a517687fde` / 分支 `Branch_v2.1.2`） |
| Node 运行时 | `@fellow99/node-bridge@0.1.0` + `@fellow99/node-runtime@24.2.0`（ohpm 双包）→ **Node v24.2.0**（ABI 137，`platform=openharmony`） |
| 渲染 | **ArkWeb** `Web` 组件（应用进程内） |
| 数据 | `node:sqlite`（WAL）→ `<filesDir>/data/opencode/opencode.db` |
| 规划 | [`docs/000-工程规划.md`](docs/000-工程规划.md)（**唯一权威规划**） |
| 规格 | [`specs/README.md`](specs/README.md)（项目级 + 9 个模块） |

## 快速开始

```bash
# ① 安装运行时双包（ohpm 中心仓；版本钉死在 oh-package.json5）
ohpm install
# @fellow99/node-bridge@0.1.0（接口与加载器）
# @fellow99/node-runtime@24.2.0（Node 引擎本体；libnode.so 随 assembleHap 合并进 HAP）

# ② 校验运行时锁值（libnode.so SHA-256/体积 = runtime.lock.json；幂等；不符硬失败）
node scripts/verify-runtime.mjs

# ③ 上游产物与载荷（补丁 → bun → bundle-only → 裁剪 → resfile）
node scripts/apply-patches.mjs
node scripts/build-opencode.mjs
node scripts/collect-opencode.mjs

# ④ host 门禁（无设备即可跑）
node scripts/smoke-node24.mjs

# ⑤ 构建 HAP
export DEVECO_SDK_HOME='D:\oh-workspace\command-line-tools\sdk'
export PATH="/d/oh-workspace/command-line-tools/tool/node:$PATH"
cmd //c "D:\\oh-workspace\\command-line-tools\\bin\\hvigorw.bat assembleHap \
  --mode module -p product=default -p buildMode=debug --no-daemon"
```

产物：`entry/build/default/outputs/default/entry-default-signed.hap`（无签名材料时为 `entry-default-unsigned.hap`）。

## 装机前必须知道

| # | 事项 |
|---|---|
| 1 | **签名材料不入库**：在 DevEco 里为 `org.fellow99.oc.OCDesktopArk` 生成证书，或提供 `signing.debug.local.json` |
| 2 | **JIT 需要 ACL**：`ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY` 必须按本包名获批；无它启动即 SIGTRAP（`--jitless` 会废掉 WASM，等于废掉 fetch） |
| 3 | **载荷必须先投放**：`resfile/opencode/` 为空时应用会显示「载荷缺失」错误页（这是预期行为，不是白屏） |

## 目录

```
AppScope/     应用级配置（bundleName / 版本 / 图标 / 显示名）
entry/        主模块：ArkTS 宿主（EntryAbility / pages / app / common / host）+ 资源
payload/      Node 侧启动脚本（opencode-server.js + lib/*）
patches/      上游幂等补丁（v2.1.2；v2.0.26 目录为历史锚点）
scripts/      构建与门禁流水线
specs/        规格体系（项目级 + 9 个模块）
docs/         工程规划（唯一权威）
logs/         开发/评审/测试证据（按 <YYYYMMDD>-N 归档）
```

## 已知限制（继承自运行时与平台）

`node::Start` 每进程一次（崩溃即终态）· `process.cwd()` 启动时为 `/`（已由编排显式 chdir）· `os.cpus()` 长度 0 ·
应用域子进程 JIT 被 seccomp 拦 · PTY / 系统 git / `rg` 不可用 · 后台常驻与开机自启不可用。

详细结论与证据见 `docs/000-工程规划.md` §2.3 / §8.4 与 `specs/overall-plan.md`。

## 许可

MIT（见 `LICENSE`）。随包分发 Node.js 运行时适用其上游许可（见 `specs/107-compliance` 的 G4）。
