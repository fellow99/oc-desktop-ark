# 111 — 版本更新：2.1.2 任务清单

> **回引:** `spec.md` / `plan.md` ｜ **最后更新:** 2026-10-22
> 里程碑 M1–M5 顺序推进。日志目录：`logs/20261022-3/`。

## M1 静态收敛（T01–T03）

### T01 — 规格与日志目录落地
| 项 | 内容 |
|---|---|
| 动作 | 建立 `specs/111-version-2.1.2/`（本四件套）与 `logs/20261022-3/` |
| 完成判据 | 4 个规格文件存在且非空 |

### T02 — 清理中间/临时文件
| 项 | 内容 |
|---|---|
| 回引 | FR-ark-101、plan D2 |
| 动作 | 按 `plan.md` §3 清单删除；删除前断言命中 `.gitignore`；保留清单不触碰 |
| 完成判据 | `git status --porcelain` 无 ` D ` 行；`entry/libs/arm64-v8a/`、`libs/` 完好 |

### T03 — 版本号 2.1.2 / 20102 与补丁器基线更新
| 项 | 内容 |
|---|---|
| 回引 | FR-ark-102/103、plan D4 |
| 动作 | `AppScope/app.json5` → `2.1.2`/`20102`；`README.md` / `specs/README.md` 版本行同步；`apply-patches.mjs` 两处默认值 |
| 完成判据 | `grep` 复查无「当前版本 2.0.26」语义残留（历史锚点除外） |

## M2 补丁迁移（T04–T05）

### T04 — 补丁逐条评估与迁移
| 项 | 内容 |
|---|---|
| 回引 | FR-ark-104、plan D3 |
| 动作 | 5 条旧补丁逐条 `git -C ../opencode apply --check`；通过→复制；失败→按 v2.1.2 重生成 |
| 完成判据 | `patches/v2.1.2/` 每条补丁双向 `--check` 通过 |

### T05 — 补丁目录 README 重写
| 项 | 内容 |
|---|---|
| 动作 | 新基线表 + 补丁清单 + 生成命令 |
| 完成判据 | README 与实际 `.patch` 一一对应 |

## M3 构建与部署（T06–T08）

### T06 — opencode 产物与运行时
| 项 | 内容 |
|---|---|
| 回引 | FR-ark-105 |
| 动作 | `build-bridge-har.sh`（幂等）→ `provision-runtime.sh`（幂等）→ `apply-patches.mjs` → `build-opencode.mjs` → `collect-opencode.mjs` → `smoke-node24.mjs` |
| 完成判据 | resfile 投放完成；冒烟全绿 |

### T07 — HAP 构建
| 项 | 内容 |
|---|---|
| 回引 | FR-ark-105、plan D5 |
| 动作 | `hvigorw assembleHap --mode module -p product=default -p buildMode=debug --no-daemon` |
| 完成判据 | `entry-default-signed.hap` 产出；版本 `2.1.2`/`20102` |

### T08 — 真机部署
| 项 | 内容 |
|---|---|
| 回引 | FR-ark-106 |
| 动作 | `hdc uninstall org.fellow99.oc.OCDesktopArk` → `app install -r` → `aa start -a EntryAbility` |
| 完成判据 | 安装成功 + ArkWeb 界面加载非白屏 |

## M4 测试与报告（T09–T11）

### T09 — 真机测试执行
| 项 | 内容 |
|---|---|
| 回引 | FR-ark-107/108 |
| 动作 | `test-cases.md` §3/§4/§5；凭证运行时输入，文档占位 |
| 完成判据 | 每条用例有结论；`TEST_REPORT.md` 产出 |

### T10 — 代码评审
| 项 | 内容 |
|---|---|
| 动作 | `requesting-code-review` → `receiving-code-review` → `REVIEW_REPORT.md` |
| 完成判据 | 无未处理 Critical/Important 项 |

### T11 — 敏感信息扫描
| 项 | 内容 |
|---|---|
| 动作 | 暂存区复查 + 敏感串扫描；设备侧凭据条目删除确认 |
| 完成判据 | 扫描零命中 |

## M5 提交（T12）

### T12 — 规范提交
| 项 | 内容 |
|---|---|
| 回引 | FR-ark-109 |
| 动作 | `git-commit` 技能前缀；`build-profile.json5` 本地签名 diff 不提交 |
| 完成判据 | `git log` 前缀合规；`git status` 仅剩本地签名 diff |
