# 上架合规（107-compliance）—— 实现方案

> **模块**：`107-compliance` ｜ **状态**：Proposed ｜ **日期**：2026-10-18 ｜ 对应规格：[`spec.md`](./spec.md)
> **依据**：`docs/000-工程规划.md` v0.3 §13 / §10 / §12.1；`specs/constitution.md`（C1–C6、S1–S7、质量门）｜ 证据口径：✅ 实测 ｜ 🔶 沿用 ｜ ⬜ 待验证

## 1. 技术上下文

| 项 | 值 | 来源 |
|---|---|---|
| host | Windows + Git-Bash；脚本用 Node **24.14.1**（仅工具脚本，非门禁口径） | `TECH.md` §三 |
| SDK / 构建 | HarmonyOS 6.1.1(24) / hvigor 6.24.2 | `TECH.md` §一 |
| 被检对象 | ① 签名 HAP（包内取证）② 源文件（`module.json5` / `app.json5` / 资源）③ 文档（README / 关于页文案） | 规划 附录 A |
| HAP 落点 | `entry/build/default/outputs/default/entry-default-signed.hap` | `STRUCTURE.md` §五 |
| 包解析 | Node 内建 `node:zlib` + 自写 ZIP 中央目录读取（**不引第三方依赖**，门禁可离线跑） | 本方案 §6.2 |
| 权限真值 | 本机 SDK `sdk/default/openharmony/toolchains/lib/PermissionDefinitions.json`（735 条，只读） | 🔶 `oc-desktop-hos/docs/ACL申请清单.md:38` |
| 设备 | 2in1 / tablet 真机（`hdc`） | 规划 §0.3 |
| 改动面 | **只新增脚本与文档**；ArkTS 仅 103 落地的 AI 标识节点，权限面由 101/106 落地 | §8 |
| 非目标 | 不实现权限申请流程、不改上游、不改补丁、不在 ArkTS 里加审核逻辑 | — |

## 2. 宪法合规
| 原则 | 本模块如何满足 | 落点 |
|---|---|---|
| **C1 壳薄契约硬** | 合规判定全部在 host 脚本（构建/发布期）；壳层唯一新增物是 AI 标识常驻节点（103 的渲染面），不改业务通道 | §6.1 |
| **C2 不隐藏平台真相** | ACL 缺失即安装失败/启动失败可见；门禁把 `skip` 逐项列出，**不把未检查当通过**；`--source-only` 输出 `incomplete` | §6.6 |
| **C3 谁写谁读** | 报告与证据 JSON 由脚本自己写、自己读；文档只引用；ArkTS 不解析合规文件 | §4、§5 |
| **C4 不改上游** | 只**读**上游产物与包；文案检查靠构建期资源与补丁，不 fork UI 源码 | §6.4 |
| **C5 崩溃终态** | 任一断言失败即非零退出并阻断流水线；不产出「半合规」签名包；无 ACL 时产品不启动属预期终态 | §5.1 |
| **C6 判据可证伪** | 每条 G 项 = 正向断言 + 反向用例（`--self-test`）；人工项必须有截图/`dumpLayout`，无证据即不通过 | §7.1 |

**安全条款映射**：`S4`（ACL 按真实需要）→ FR-107-021 差集；`S5`（无调试通道）→ FR-107-016；`S7`（不绕签名）→ FR-107-004。

## 3. 研究结论（引用，不重复论证）
| # | 结论 | 证据 |
|---|---|---|
| R1 | G2「无浏览器语义」的落地口径：EntryAbility 的 skills 不含 `entity.system.browsable` 与 `ohos.want.action.viewData` | 规划 §13 G2（`docs/000-工程规划.md:746`）、§6 #16（`:491`）；🔶 `oc-desktop-hos/README.md:96` |
| R2 | **`definePermissions` 是模块级（HAR）声明，不出现在合并后的包内 `module.json`** ⇒ 只查包会漏判，必须「源文件 + 包内」双查 | 🔶 `oc-desktop-hos/docs/ACL申请清单.md:251` |
| R3 | 权限断言按**五组**组织：禁止 / 剪裁 / 必需 / 需 reason / 双处声明 | 🔶 `oc-desktop-hos/scripts/collect-runtime.mjs:190` `:213` `:227` `:259`，断言 `:713-777` |
| R4 | 调试通道清理可用「启动参数里删 `--inspect`」实现；本工程改用「字符串 + 端口」双判据 | 🔶 `oc-desktop-hos/scripts/collect-runtime.mjs:129-135` |
| R5 | 包内取证口径：**必须查 HAP 不查磁盘**；`.so` 的 `compress_type` 应为 8（DEFLATE） | 规划 附录 A（`docs/000-工程规划.md:889-891`） |
| R6 | 受限权限判定：`provisionEnable == true` 且 `availableLevel ∈ {system_basic, system_core}`；名字带 `kernel.` 不等于受限 | 规划 §10.1；🔶 `oc-desktop-hos/docs/ACL申请清单.md:29-38` |
| R7 | Profile 不含 ACL 时 `hdc install` 直接失败（`9568289 / PermissionName: …`）——成对声明缺一即安装失败 | 规划 §10.2（`:641`） |
| R8 | AI 标识判据是**两次 `dumpLayout` 差异**（可见性/透明度），可用 `uitest` 断言 | 规划 §13 G6（`:750`）；🔶 `oc-desktop-hos/docs/工程规划-V2.md:812` |
| R9 | 图标必须 1024×1024、纯色不透明（无 Alpha） | 🔶 `oc-desktop-hos/docs/工程规划-V2.md:809` |
| R10 | 材料口径原文：「主界面是应用自带本地界面，由 ArkWeb 加载本机服务，非浏览器上网」 | 规划 §12.1 R10（`:717`） |
| R11 | 改名必须三处同步（`AppScope/app.json5` + 三套 locale 的 `EntryAbility_label`），漏一处即出现旧名 | 规划 §5.11（`:466`）；🔶 `oc-desktop-hos/docs/ACL申请清单.md:246-247` |
| R12 | HAP 内原生库**不需要** `.codesign`、不需要二进制证书；本工程唯一原生件是 Node 运行时 + C++ 运行库（`libnode.so` / `libc++_shared.so`） | 规划 §13 G5（`:749`）；🔶 `oc-desktop-hos/docs/工程规划-V2.md:786-793`；`TECH.md` §二 |

> ⚠️ 唯一与直觉冲突的是 **R2**：只解包 HAP 检查会漏掉 `definePermissions` 配对问题。

## 4. 数据模型
### 4.1 `specs/107-compliance/compliance.config.json`（单点配置，脚本唯一输入）
| 字段 | 类型 | 说明 |
|---|---|---|
| `bundleName` / `expectedLabel` / `minVersionCode` | string/number | 三一致比对与版本递增下界（上一版登记值） |
| `canonicalStatement` | string | R10 原文，逐字比对 |
| `forbiddenTokens[]` / `kernelDenyList[]` / `debugTokens[]` | string[] | 禁用词（内测/测试/预览版/Beta/试用 + 平台指称）、内核类库名、调试标记（`--inspect` / `probeFlags` / 诊断端点） |
| `requiredPermissions[]` / `dualDeclared[]` / `exempt[]` | string[] | 三组权限断言；`exempt` 每项带 `reason` |
| `nativeAllowList[]` | string[] | 允许出现的原生库（R12） |

### 4.2 `docs/evidence/<date>-compliance/compliance.report.json`
```
{ "schema": 1, "generatedAt": <epoch ms>, "mode": "full|source-only",
  "items": [ { "id": "G1..G11|ACL-1..3", "status": "pass|fail|skip", "expected": "...",
               "actual": "...", "evidence": "path#anchor", "date": "...", "device": "..." } ],
  "summary": { "pass": 0, "fail": 0, "skip": 0 } }
```
**不变式**：`status=fail` ⇒ 退出码 1；`summary.skip > 0` ⇒ 整体不得判 pass（`--source-only` 输出 `incomplete`）。同目录另存 `licenses.json`（`LicenseEntry[]` + `NativeArtifact[]`）、`permission-diff.json`（`PermissionDiff`）、`material-statement.json`（`canonicalText` + `occurrences[{path,line,exact}]`）、`icon.json`（尺寸/alpha/两处 SHA-256）。

## 5. 接口契约
### 5.1 命令与退出码
| 命令 | 作用 | 退出码 |
|---|---|---|
| `node scripts/verify-compliance.mjs [--hap <path>] [--report <path>] [--source-only] [--self-test]` | G1–G11 制品与包内断言；`--source-only` 为无 HAP 的源码级检查（Phase 0–2） | 0 通过 / 1 失败 / 2 前置不满足（无 HAP 且未加 `--source-only`）/ 3 `incomplete`（有 skip） |
| `node scripts/check-permissions.mjs [--report <path>] [--self-test]` | 声明面 = 使用面 + 五组权限断言 | 同上 |
| `node scripts/verify-materials.mjs [--self-test]` | 许可清单、禁用词、三一致、材料口径 | 同上 |

**只读契约**：三个脚本 MUST NOT 写工作树；`--report` 默认落 `docs/evidence/<YYYY-MM-DD>-compliance/`（与 109 共用该目录）。

### 5.2 消费关系
| 本模块提供 | 消费方 |
|---|---|
| `compliance.report.json` + 退出码 | 发布流水线（阻断）、`109-regression`（回归结论不得为 pass） |
| `permission-diff.json` | `docs/ACL申请清单.md` 的「声明现状」章节、101/106 实现者 |
| `material-statement.json` | 提审材料、README、「关于」页 |

## 6. 实现策略
### 6.1 执行顺序（单次运行）
1. 读 `compliance.config.json`（缺失即退出 2）→ 2. 读源文件（`app.json5` / `module.json5` / 三套 `string.json`）→ 3. 解析 HAP（若提供）→ 4. 逐项断言（收集全部，不 fail-fast）→ 5. 写报告与 `docs/evidence/` → 6. 汇总退出码。

### 6.2 HAP 解析（无第三方依赖）
- 读文件尾找 `End of Central Directory`（签名 `0x06054b50`）→ 中央目录逐条取 `filename` / `compress_type` / 大小；只解压 `module.json`、`resources.index`、`resources/base/media/*`、`libs/**`。
- 断言：原生库集合 ⊆ `nativeAllowList`；`kernelDenyList` 零命中；`resfile/opencode/opencode.mjs` 存在（`TC-H-010`）；**不反编译** `ets/modules.abc`（只做存在性与字符串级检查，局限如实登记）。

### 6.3 权限差集（`check-permissions.mjs`）
- **声明面**：源 `module.json5` 的 `requestPermissions[].name` + `definePermissions[].name`（R2 要求查源）。
- **使用面**：扫描 `entry/src/main/ets/**`、`payload/**` 的已知调用点，按 `specs/107-compliance/permissions.map.json` 映射到权限名（映射表入库、可评审）。
- **差集与五组**：`declaredOnly` / `usedOnly` 双向输出，`exempt` 必须带 `reason` 且被打印；必需项在位、`dualDeclared` 各命中 2 处、禁止项零命中、`reason` + `usedScene` 齐备（R3）。

### 6.4 文案、许可与口径（`verify-materials.mjs`）
- 禁用词（FR-107-009/010）：遍历三套 locale、`rawfile/boot.html`、`payload/**`、`README.md`，命中原样打印 `path:line`。
- 三一致与许可（FR-107-005/006/011）：`bundleName` / `expectedLabel` / 备案主体名逐字比对，旧名零命中；`licenses.json` 与 `manifest.sha256`、原生库清单交叉比对，缺项即失败。
- 口径（FR-107-022）：`canonicalStatement` 必须在 README、关于页文案、材料文件中逐字出现；出现「浏览器上网」「浏览器应用」等矛盾措辞即失败。

### 6.5 真机项（人工 + 工具断言）
| 项 | 步骤 | 证据 |
|---|---|---|
| AI 标识（FR-107-008） | 首屏 `uitest dumpLayout` → 滚动后再次 dump → 比对节点存在性与 `opacity` | 两份 XML + diff 片段 |
| 隐私链接（FR-107-015） | 点击 → `onPageEnd` + 落地页标题 | 截图 + hilog 行 |
| ACL 反证/正证（FR-107-018） | 无 ACL Profile 安装失败；有 ACL 启动无 SIGTRAP | `hdc install` 输出 / `hilog` 过滤结果 |
| 包内清理（FR-107-016） | 安装后确认无调试端口监听 | 端到端探测（附录 A ③ 通道） |

### 6.6 失败与降级
| 场景 | 行为 |
|---|---|
| 无 HAP（未构建） | 非 `--source-only` 时退出 2；`--source-only` 输出 `incomplete`，**不得**打印「通过」 |
| 配置缺失/损坏 | 退出 2 并打印期望路径 |
| 图标素材缺失 / 真机缺席 | 对应项 `skip` + 原因，整体 `incomplete`（host 侧开发不阻断，提审阻断） |
| SDK 权限目录不可读 | 权限分组退化为配置内静态表，报告标注 `source=config` |

## 7. 测试考虑
### 7.1 host 正向 + 反向（`--self-test`）
| 用例 | 注入 | 期望 |
|---|---|---|
| ST-01 | ability 加 `entity.system.browsable` | 失败，点名 G2 |
| ST-02 | 包内塞 `libelectron.so` | 失败，点名 G3 |
| ST-03 | 删 `licenses.json` 一条 | 失败，点名 G4 缺项 |
| ST-04 | locale 塞「预览版」 | 失败，打印 `path:line` |
| ST-05 | 图标 1023×1023 / 带 Alpha | 失败，点名 G7 图标 |
| ST-06 | `definePermissions` 删一项 | 失败，点名双处声明 |
| ST-07 | 加一个无使用点权限 | 失败，点名 `declaredOnly` |
| ST-08 | 关于页删除口径句 | 失败，点名 FR-107-022 |

反向用例在 `os.tmpdir()` 构造副本运行，**不污染工作树**（NFR-107-001）。

### 7.2 真机与联动
- 真机四项按 §6.5 执行，证据写 `docs/真机验证记录.md` 对应轮次 + `docs/evidence/<date>-compliance/`。
- 与 `109-regression`：回归结算读本模块 `compliance.report.json`，`fail` / `incomplete` ⇒ 回归结论不得为 pass；用例编号复用 `overall-test-cases.md` 的 TC-S-005 / 007、TC-D-002 / 003 / 015，不另立体系。

## 8. 文件清单
### 8.1 新增
| 路径 | 说明 |
|---|---|
| `scripts/verify-compliance.mjs` | G1–G11 制品与包内断言 + 报告 |
| `scripts/check-permissions.mjs` | 声明面 = 使用面、五组权限断言、`definePermissions` 双查 |
| `scripts/verify-materials.mjs` | 许可清单、禁用词、三一致、材料口径 |
| `scripts/lib/compliance/{zip.mjs,hap.mjs,permissions.mjs,copy.mjs,report.mjs}` | 最小 ZIP 读取、HAP 断言、权限差集、文案检索、报告写盘 |
| `specs/107-compliance/{compliance.config.json,permissions.map.json}` | 单点配置（§4.1）与使用点映射表（§6.3，可评审） |
| `specs/107-compliance/{spec.md,plan.md}` | 本模块规格与方案 |
| `docs/ACL申请清单.md` | Phase 1：申请口径、回退顺序（与 `S4` 一致） |
| `docs/evidence/<YYYY-MM-DD>-compliance/**` | 报告与真机证据（只留 JSON/文本，不入库原始大文件） |

### 8.2 修改
| 路径 | 改动 |
|---|---|
| `entry/src/main/module.json5` | 仅权限声明面（由 101 落地；本模块只断言不改） |
| `entry/src/main/resources/{base,en_US,zh_CN}/element/string.json` | 显示名/关于页文案（由 103/101 落地） |

### 8.3 明确不改
- 上游 `../opencode`（任何文件）、`patches/v2.0.26/**`；ArkTS 业务逻辑（会话/模型/工具）。
- AI 标识由 103 实现（本模块只断言）；`build-profile.json5` 的签名材料不入库。
