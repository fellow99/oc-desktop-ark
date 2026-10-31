# 112 — 版本更新：2.2.5 任务清单（ark）

> **回引:** `spec.md` / `plan.md` ｜ **最后更新:** 2026-10-31 ｜ 日志：`logs/20261031-1/`

## M1 静态收敛

- **T01** 建 `specs/112-version-2.2.5/` 四件套 + `logs/20261031-1/DEV_CHECKLIST.md`
- **T02** 按 plan §3 清理，逐条断言 `.gitignore`；`git status` 无 ` D `
- **T03** `AppScope/app.json5` → 2.2.5/20205；README 同步；脚本守卫（apply-patches/collect-opencode EXPECTED=9bbb8ce18c、patchDir=v2.2.5）；smoke 工具名口径；bun 1.4.4

## M2 补丁迁移

- **T04** 建 `patches/v2.2.5/`：复制 0001/0006；重生成 **0003/0007/0008**；逐条双向 `--check`
- **T05** 重写 `patches/v2.2.5/README.md`（基线表/清单/生成命令）

## M3 构建

- **T06** `apply-patches --check` → 实应 → `OPENCODE_NODE_TARGET=node24 BUN_BIN=<1.4.4> node scripts/build-opencode.mjs`
- **T07** `collect-plugins` → `collect-opencode --apply`（确认 photon 锚点注入）
- **T08** `smoke-node24`、verify-runtime、verify-git-plugin、check-acl-surface 全绿
- **T09** hvigorw `assembleHap`（debug）产出、版本元数据 2.2.5/20205

## M4 测试与评审

- **T10** 真机测试 **跳过（无设备）**，test-cases 标注 SKIP
- **T11** 代码评审（requesting/receiving）→ REVIEW_REPORT；处理 Critical/Important
- **T12** 敏感扫描；`../opencode` 树恢复干净

## M5 提交

- **T13** Conventional Commits 前缀分批提交；签名本地 diff 不入库；`git tag v2.2.5`；不 push
