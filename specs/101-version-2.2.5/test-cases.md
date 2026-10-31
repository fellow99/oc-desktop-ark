# 101 — 版本更新：2.2.5 测试用例（ark）

> **回引:** `spec.md` / `plan.md` ｜ **最后更新:** 2026-10-31
> **本轮约束:** 无鸿蒙真机 —— 真机用例统一 **SKIP-无设备**；host 门禁为替代证据。

## 1. 环境

Windows + Node 24.14.1 + bun 1.4.4 + DevEco/hvigor；上游 `../opencode` @ v2.2.5 `9bbb8ce18c`。

## 2. 静态与构建用例

| 用例 | 关联 | 步骤 | 期望 | 结果 |
|---|---|---|---|---|
| TC-01 清理不伤跟踪文件 | AC-01 | `git status --porcelain` | 无 ` D ` | ⬜ |
| TC-02 版本号 | AC-02 | `AppScope/app.json5` | 2.2.5 / 20205 | ⬜ |
| TC-03 补丁正向 | AC-04 | 5 条 `git apply --check` | 全通过 | ⬜ |
| TC-04 补丁反向 | AC-04 | 应用后 `--reverse --check` | 全通过 | ⬜ |
| TC-05 守卫自洽 | AC-05 | apply-patches/collect-opencode 常量 | 9bbb8ce18c / v2.2.5 | ⬜ |
| TC-06 补丁器基线/脏树守卫 | AC-05 | `apply-patches.mjs --check` | 基线匹配、幂等判定正确 | ⬜ |
| TC-07 node24 构建 | AC-05 | build-opencode.mjs | dist-node 产出、无报错 | ⬜ |
| TC-08 载荷收集 + jitless 锚点 | AC-05/07 | collect-opencode --apply | 清单生成、photon 守卫注入命中 | ⬜ |
| TC-09 host 冒烟 | AC-07 | smoke-node24 / verify-runtime / verify-git-plugin / check-acl-surface | 全绿 | ⬜ |
| TC-10 HAP 产出与版本 | AC-02/06 | hvigorw assembleHap + 读 pack.info | HAP，2.2.5/20205 | ⬜ |

## 3. 真机基本功能（SKIP-无设备）

| 用例 | 步骤 | 期望 | 结果 |
|---|---|---|---|
| TC-11 安装启动 | hdc 安装/启动 | 非白屏 | ⏭ SKIP-无设备 |
| TC-12 DeepSeek Key | 运行时录入 `<API_KEY>` | 保存、模型可选 | ⏭ SKIP-无设备 |
| TC-13 工作区 | 沙箱新建测试目录 | 成功 | ⏭ SKIP-无设备 |
| TC-14 一次对话 | 「介绍一下你自己」 | SSE 流式回复 | ⏭ SKIP-无设备 |
| TC-15 图片分析 | 发图描述 | 图片识读回复（jitless photon 替身路径） | ⏭ SKIP-无设备 |

## 4. 环境能力抽查（对照 `../../docs/能力对照清单.md`；SKIP-无设备）

| 用例 | 步骤 | 期望 | 结果 |
|---|---|---|---|
| TC-16 内置工具名口径 | 检查 smoke/文档；上游 v2.2.5 内置工具名为 `shell`（保留 bash 别名） | 无写死 `bash` 的硬断言失败 | ⬜ host 可验 |
| TC-17 PTY 打桩 | 0003 桩 available=false | 终端不投放 | ⬜ 源码/构建可验 |
| TC-18 grep/glob 边界 | 无 JS 搜索插件（维持） | 平台不支持，不回归 | ⬜ 源码可验 |

## 5. 敏感信息

| 用例 | 步骤 | 期望 | 结果 |
|---|---|---|---|
| TC-19 暂存区/全库扫描 | diff 复查 + grep | 零明文 | ⬜ |
| TC-20 opencode 树恢复 | `git -C ../opencode status` | 干净 | ⬜ |
