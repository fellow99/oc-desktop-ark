# DEV_CHECKLIST —— 110-jitless 无 JIT 模式

> 需求：`110-jitless` ｜ 规格：`specs/110-jitless/` ｜ 分支：`main`（不改分支）
> 敏感信息（API key / 账号密码 / 测试 URL）只进运行时 env / 命令参数，**不落盘**。

## 任务进度

| 任务 | 内容 | 状态 |
|---|---|---|
| T1 | 移植 `payload/jitless/`（index/http-lazy/fetch/undici/photon/image-codec/vendor/selftest + wasm-patch） | ✅ |
| T2 | `payload/opencode-server.js` import 前接线 `installIfNeeded` | ✅ |
| T3 | `payload/jitless/selftest/run.mjs` PC 自测 | ✅ |
| T4 | ArkTS `BuildConfig.ets` / `NodeMode.ets` / `Constants.ets` / `EntryAbility.ets` / `OpencodeRuntime.ets` / `Index.ets` | ✅ |
| T5 | `module.json5` 权限面核对 + `scripts/check-acl-surface.mjs` | ✅ |
| T6 | `scripts/collect-opencode.mjs` 投放 `jitless/` + manifest | ✅ |
| T7 | 文档登记（ACL-无ACL评估 / SPECS_CHECKLIST / STRUCTURE / overall-test-cases） | ✅ |
| T8 | Code Review（requesting + receiving） | ⬜ |
| T9 | PC 全量测试 + 构建 HAP | ⬜ |
| T10 | 真机部署（待设备） | ⬜ |

## 开发日志

- 2026-10-21 规格四件套已生成并提交（spec/plan/tasks/test-cases + overall-test-cases 引用关系 + SPECS_CHECKLIST M-110）。
- 2026-10-21 T1–T7 完成：`payload/jitless/`（fetch/undici/photon 纯 JS 垫片 + vendor 239KB + wasm-patch 降级事实）；`opencode-server.js` import 前接线；ArkTS 编译期形态（`BuildConfig.NODE_MODE` 默认 compat，`NodeMode` 诊断+证据落盘）；权限面静态门禁 `check-acl-surface.mjs`；投放脚本含 jitless 复制+manifest；文档登记（ACL-无ACL评估 §10、STRUCTURE、SPECS_CHECKLIST、overall-test-cases §九/§十、tasks T1–T7 勾选）。PC 自测：`node --jitless selftest` 14/14 fetch + 22/22 photon 通过；jit 对照 0 回归。
