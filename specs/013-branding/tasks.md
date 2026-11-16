# 013-branding-r2 — 包名修改 任务记录（HarmonyOS Ark Edition）

> **需求编号:** 013-branding-r2 ｜ **git 分支:** 不改动 ｜ **日期:** 2026-11-02

## 变更

| 项 | 现值 | 新值 |
|---|---|---|
| `AppScope/app.json5` `bundleName` | `top.fellow99.oc.OCDesktopArk` | `top.fellow99.oc.OCDesktopArk` |
| `hvigorfile.ts` 签名提示文案（2 处） | `top.fellow99.oc.OCDesktopArk` | `top.fellow99.oc.OCDesktopArk` |
| `entry/src/main/module.json5` ACL 注释 | `top.fellow99.oc.OCDesktopArk` | `top.fellow99.oc.OCDesktopArk` |

## 验收

- `hvigorw assembleHap` 编译通过；包内 `bundleName` 为新值。
