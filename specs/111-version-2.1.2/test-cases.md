# 111 — 版本更新：2.1.2 测试用例

> **回引:** `spec.md` §5 ｜ **执行落点:** `logs/20261022-3/TEST_CHECKLIST.md` / `TEST_REPORT.md`
> **敏感信息纪律:** 模型 Key 与 GIT 账号/密码**只在运行时输入**，一切产出物中占位（`<API_KEY>` / `<USER>` / `<PASSWORD>`）。

## 1. 环境

| 项 | 值（执行时填写实测值） |
|---|---|
| 设备序列号 | `3QC0226526001227`（`hdc list targets`） |
| 设备型号 / 系统 / API | ⬜ 执行时记录 |
| 设备类型 | 2in1 / tablet |
| HAP 版本 | `2.1.2` / `20102` |
| 上游基线 | opencode `v2.1.2` / `a517687fde` |
| 运行期 | Node v24.2.0（`@fellow99/node-bridge`）+ ArkWeb |

## 2. 静态与构建用例

| 用例 | 关联 | 步骤 | 期望 | 结果 |
|---|---|---|---|---|
| TC-01 清理不伤已跟踪文件 | AC-01 | `git status --porcelain` | 无 ` D ` 行；`entry/libs/`、`libs/` 完好 | ⬜ |
| TC-02 版本号 | AC-02 | 读 `AppScope/app.json5` | `2.1.2` / `20102` | ⬜ |
| TC-03 补丁正向 | AC-04 | `patches/v2.1.2/*.patch` 逐条 `git apply --check` | 全部通过 | ⬜ |
| TC-04 补丁反向 | AC-04 | 应用后逐条 `git apply --reverse --check` | 全部通过 | ⬜ |
| TC-05 补丁器守卫 | AC-05 | `node scripts/apply-patches.mjs --check` | 报告基线 `a517687fde` 匹配、状态一致 | ⬜ |
| TC-06 host 冒烟 | AC-05 | `node scripts/smoke-node24.mjs --allow-version-drift` | 全绿 | ⬜ |
| TC-07 HAP 产出与版本 | AC-02/06 | 构建输出 + 解包读版本 | `entry-default-signed.hap`，`2.1.2`/`20102` | ⬜ |

## 3. 真机基本功能用例

| 用例 | 关联 | 步骤 | 期望 | 结果 |
|---|---|---|---|---|
| TC-08 安装启动就绪 | AC-07 | 卸载 → 安装 → `aa start` | ArkWeb 加载服务端 UI，非白屏、非「载荷缺失」 | ⬜ |
| TC-09 模型配置 | FR-ark-107 | 设置页输入 DeepSeek API Key（`<API_KEY>`） | 保存成功；可选 `deepseek-flash` | ⬜ |
| TC-10 工作区 | FR-ark-107 | 新建工作区（沙箱内新建测试目录） | 目录创建成功并成为当前工作区 | ⬜ |
| TC-11 一次对话 | FR-ark-107 | 发送一条问候消息 | 助手正常回复 | ⬜ |
| TC-12 图片分析对话 | FR-ark-107 | 发送一张图片并要求描述 | 助手基于图片内容回复 | ⬜ |

## 4. GIT 仓库操作用例

> 凭证纪律：`<USER>` / `<PASSWORD>` 仅在应用 Git 凭据页运行时输入；结束后**删除凭据条目**。

| 用例 | 关联 | 步骤 | 期望 | 结果 |
|---|---|---|---|---|
| TC-13 无账号 clone | FR-ark-107 | clone `https://github.com/fellow99/pi-desktop-website.git` | clone 成功，`git log` 可读 | ⬜ |
| TC-14 无账号常用操作 | FR-ark-107 | `status` / `branch` / `diff` / `log` | 输出正常 | ⬜ |
| TC-15 带账号凭据保存 | FR-ark-107/108 | Git 凭据页录入 `<USER>` / `<PASSWORD>`（`gjgit.pcitech.com:8080` force_test.git） | 保存成功；口令只显示长度 | ⬜ |
| TC-16 带账号 clone/pull | FR-ark-107 | 用已存凭据 clone / pull 私有仓库 | 成功，无 401 | ⬜ |
| TC-17 带账号 commit/push | FR-ark-107 | 测试分支提交并推送 | push 成功 | ⬜ |
| TC-18 凭据清理 | FR-ark-108 | 删除凭据条目 | 条目移除、无残留 | ⬜ |

## 5. 环境能力抽查用例

| 用例 | 关联 | 步骤 | 期望 | 结果 |
|---|---|---|---|---|
| TC-19 启动链路 | AC-07 | 启动日志（hilog）检查 | Node 注入成功、服务端就绪、无 SIGTRAP | ⬜ |
| TC-20 数据库 | AC-07 | 对话后 `<filesDir>/data/opencode/opencode.db` | WAL 读写正常（`node:sqlite`/better-sqlite3 两级后端） | ⬜ |
| TC-21 网络 fetch | FR-ark-107 | TC-11 对话即网络用例 | 模型 API 可达 | ⬜ |
| TC-22 工作区文件系域能力 | FR-ark-107 | 工作区内读写文件 | 正常 | ⬜ |

## 6. 敏感信息扫描用例

| 用例 | 关联 | 步骤 | 期望 | 结果 |
|---|---|---|---|---|
| TC-23 暂存区扫描 | AC-09 | `git diff --staged` 逐文件复查 | 无 Key/账号/密码明文 | ⬜ |
| TC-24 全库扫描 | AC-09 | 新增/变更文件敏感串 grep | 零命中 | ⬜ |
| TC-25 设备侧清理 | AC-09 | 确认凭据页条目已删除 | 无残留 | ⬜ |
