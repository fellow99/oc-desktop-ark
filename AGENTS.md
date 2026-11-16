# AGENTS.md — oc-desktop-ark（HarmonyOS Edition）

> 本文件定义了本工程中 AI Agent 必须遵守的规范与工作流程。
> 父工程总纲见 [`../AGENTS.md`](../AGENTS.md)；本文件聚焦本版别特有约束。

---

## 一、工程定位

**HarmonyOS Edition** —— OC Desktop 的两个鸿蒙版别之一（另一个是 [`../oc-desktop-hos`](../oc-desktop-hos)）。
本版**无 Electron、无 Chromium**：进程内 Node（`@fellow99/node-bridge`，v24.2.0）承载 opencode v2 服务端，**ArkWeb** 同源渲染其 Web UI。

| 项 | 值 |
|---|---|
| 应用名 / 包名 | **OC Desktop Ark** / `top.fellow99.oc.OCDesktopArk` |
| 版本 | `2.2.5` / `versionCode 20205` |
| 目标设备 | `2in1` / `tablet` |
| 上游基线 | opencode **v2.2.5**（`9bbb8ce18c` / `Branch_v2.2.5`） |
| Node 运行时 | `@fellow99/node-bridge@0.1.0` + `@fellow99/node-runtime@24.2.0` → Node v24.2.0（ABI 137） |
| 渲染 | **ArkWeb** `Web` 组件（应用进程内） |
| 数据 | `node:sqlite`（WAL）→ `<filesDir>/data/opencode/opencode.db` |
| 规划 | `docs/000-工程规划.md`（**唯一权威规划**） |
| 规格 | `specs/README.md`（项目级 + 14 个模块） |

> 本工程**非 opencode 团队构建**，与上游无隶属关系；opencode 仅是其桌面形态在鸿蒙上的第三方移植。
> 本版默认 **jitless 兼容形态**（纯 JS fetch 垫片 / photon 垫片 / wasm 降级）；目标 2in1 / 平板。

---

## 二、目录结构

```
AppScope/            应用级配置（bundleName / 版本 / 图标 / 显示名）
entry/src/main/ets/  鸿蒙应用 ArkTS 源码（EntryAbility / 页面 / ArkWeb 装配）
scripts/             构建流水线（apply-patches / build-opencode / collect-opencode / verify-runtime / smoke-node24）
patches/             对上游的幂等补丁（0001/0003/0006/0007/0008）
specs/               NNN-name/{spec.md,plan.md} 规格体系
docs/                工程规划 + 能力清单
```

---

## 三、快速开始 / 构建

```bash
# ① 安装运行时双包（版本钉死在 oh-package.json5）
ohpm install

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

---

## 四、CodeGraph 代码地图（规范）

### 4.1 索引
- 本工程根目录已有**独立** `.codegraph/` 索引；父工程根目录另有聚合索引。
- 验证：`codegraph status`；缺索引 `codegraph init -i`。

### 4.2 查询
- 本工程内检索 → 在本目录执行；跨子工程（如与 hos 同名 `EntryAbility`）→ 到父工程目录。
- **优先使用 codegraph**（代码库探索铁律），grep/Read 仅作细节确认。

### 4.3 更新（强约束）
> 本工程**已配置 `post-commit` 钩子**，提交后自动 `codegraph sync`。

```bash
cd /d/opencode-workspace/oc-desktop-ark && codegraph sync
# 再到父工程，让聚合索引同步
cd /d/opencode-workspace && codegraph sync
```

- 日常 `codegraph sync`（增量）；切换分支/大重构 `codegraph index`（全量）；锁残留 `codegraph unlock`。

---

## 五、规格体系（specs）

本工程 `specs/` 模块（部分）：
- **基础（1XX）**：`101-runtime-integration`、`102-payload-pipeline`、`103-arkweb-shell`、`104-host-capabilities`、`105-auth`、`106-upstream-adaptation`、`107-compliance`、`109-regression`、`110-jitless`
- **插件（2XX）**：`203-plugin-workspace-picker`、`204-plugin-git`
- **公共（0XX）**：`011-version-*`、`013-branding`

规范编写用 `specs-as-built`；开发用 `specs-based-devflow`；规格说明用 `speckit-*`。权威顺序：父宪法 → 父 overall → 工程规划 → 本文档 overall → 模块 spec/plan。

---

## 六、鸿蒙开发规范

- 写 ArkTS/ArkUI/Stage 模型代码（UIAbility、AbilityStage、ArkWeb 装配）**必须用 `harmonyos-app-dev`** 技能。
- 设备/模拟器操作、`hdc`/`aa`/`bm install`/`hilog`/`uitest` 等 **必须用 `harmonyos-app-testing`** 技能。
- 两技能按场景互斥使用。

---

## 七、通用规范
- 中文交互/文档/提交注释；英文代码与术语。
- Git 提交用 Conventional Commits（加载 `git-commit` 技能，11 种 type，≤72 字符，禁 `--no-verify`）。
- 严禁提交敏感信息；禁 `as any`/`@ts-ignore`/空 `catch`。
- 多步骤任务先建 Todo；修复 Bug 只做最小改动；`opencode/` 只读，改动走 `patches/`。
- 调试用 `systematic-debugging`；代码审查用 `requesting/receiving-code-review`；需求规划用 `brainstorming`。

---
> **最后更新**：2026-11-02 · 上游基线 v2.2.5
