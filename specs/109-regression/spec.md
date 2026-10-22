# 回归基线（109-regression）—— 规格

> **模块**：`109-regression` ｜ **状态**：Proposed ｜ **日期**：2026-10-18 ｜ **应用**：OC Desktop Ark / `org.fellow99.oc.OCDesktopArk`
> **依据**：`docs/000-工程规划.md` v0.3 §11 Phase 4（回归四件套）、§7.3（host 门禁）、§7.2（体积预算）、§7.4（首启代价）、§5.2.3（就绪判据）、附录 A（四条取证通道）、§15（证据落点）
> **证据口径**：✅ 实测 ｜ 🔶 沿用 ｜ ⬜ 待验证 ｜ **不写「看起来正常」**
> **技术无关**：脚本、命令与阈值常量见 [`plan.md`](./plan.md)；本文件只写口径与判据。

## 1. 概述
回归不是「再跑一遍看看」，而是**每次关键输入变化后，用同一套判据证明没有退化**。本模块把「能跑」变成「可复现地知道没退化」：四项指标、明确的触发时机、可复核的证据、与设备同版本的 host 门禁，以及四条缺一不可的真机取证通道。

**范围包含**：回归四件套（签名 HAP SHA-256、首启耗时、包体、`/api/info` + 首屏关键字段）；触发条件与自动判定；证据留存与复跑；host 门禁（设备同版本 Node）口径；四条真机取证通道；四态结论与逐轮 diff。
**不包含**：功能验收本身（由 101–108 各自规格定义）；性能优化；压测与长跑稳定性（单独观察项）；上游构建与补丁正确性（106/102 负责）。

### 1.1 与其它模块的边界

| 模块 | 关系 |
|---|---|
| 101 / 102 / 103 | 产出被回归的包与运行路径；回归只观测不改实现 |
| 106 | 上游基线变更时提供新产物；触发条件依赖它的 tag 与补丁集 |
| 107 | 合规报告是回归结论的**前置门**（不合规不得判 pass） |
| 108 | 插件体积与首启增量纳入包体项；真机 diff→提交作为补充证据 |

## 2. 用户故事

| # | 角色 | 故事 |
|---|---|---|
| US-109-01 | 维护者 | 我升级运行时后，能立刻知道包体、首启与接口有没有退化。 |
| US-109-02 | 发布者 | 我能拿到一份带证据路径的回归记录，而不是一句「测过了」。 |
| US-109-03 | 审核者 | 我能复核任意一轮结论：命令、原始输出与时间点都在。 |
| US-109-04 | 用户 | 我不会因为某次「顺手升级」而拿到一个启动更慢、界面更空的版本。 |
| US-109-05 | 维护者 | 阈值被调整过时，我能看到原因与生效轮次，而不是悄悄放宽。 |

## 3. 功能需求
> 级别：MUST / MUST NOT / SHOULD（RFC 2119）。编号 `FR-109-NNN` 永不复用。

### 3.1 回归四件套

| 编号 | 需求 | 判据 |
|---|---|---|
| FR-109-001 | 每轮回归 MUST 产出四项指标：① 签名 HAP 的 SHA-256 ② 首启耗时 ③ 包体 ④ `/api/info` 与首屏关键字段 | 四项均有值、采集时间与证据路径；缺一即 `incomplete` |
| FR-109-002 | 每项 MUST 有明确采集点、基线来源与判定规则；任一项 `regressed` MUST 阻断发布 | 判定规则写在配置内，不靠口头约定 |
| FR-109-003 | 首启耗时 MUST 分段：进程启动 → Node 就绪（marker 出现）→ UI 首屏（`onPageEnd`）；MUST NOT 只报总时长 | 三段分别有值且总和与总时长一致（±0.5 s） |
| FR-109-004 | 首屏关键字段 MUST 为结构化断言：会话列表容器存在、非错误页/加载页、`/api/info` 的 `version` 与页面标记一致 | 断言逐项 pass/fail；截图不能替代结构化字段 |
| FR-109-005 | 签名 HAP SHA-256 MUST 作为产物锚点：同一产物重算一致；跨构建一致性 MUST 单独记录（未签名包 SHOULD 一致；签名包允许差异并注明原因） | 记录里区分「同产物重算」与「跨构建对比」两种结论 |
| FR-109-006 | 包体 MUST 记录两项：签名 HAP 字节数、载荷条目数与字节数；并 MUST 与预算对比（签名 HAP SHOULD ≤ 140 MB，插件体积增量 ≤ 12 MB） | 超预算即 `regressed`，并给出与上轮的差值 |

### 3.2 触发时机

| 编号 | 需求 | 判据 |
|---|---|---|
| FR-109-007 | 触发条件 MUST 至少包含：`runtime.lock.json` 变更、上游 tag/基线变更；SHOULD 包含载荷清单（`manifest.sha256`）变更、补丁集变更、应用版本变更 | 配置内逐条列出，缺一项即视为配置不完整 |
| FR-109-008 | 触发 MUST 自动判定（比对已记录指纹），MUST NOT 依赖人工提醒 | 判定脚本给出 triggered/not-triggered 与理由 |
| FR-109-009 | 每次触发 MUST 开一轮记录（轮次编号/日期/设备/版本/产物指纹）；未触发的轮次 MUST NOT 标记为「已回归」 | 记录中「触发事件」字段为空时不得写 pass |
| FR-109-010 | 触发判定 MUST 可复核：打印哪些指纹变了、旧值与新值 | 输出包含字段名与前后值 |

### 3.3 证据留存

| 编号 | 需求 | 判据 |
|---|---|---|
| FR-109-011 | 每轮 MUST 写入 `docs/真机验证记录.md`，四列齐备：结论 / 证据 / 日期 / 设备 | 缺列即该轮不成立 |
| FR-109-012 | 原始证据 MUST 落 `docs/evidence/YYYY-MM-DD-*.md`，含命令原文、原始 JSON、日志尾、截图路径 | 文件存在且可被第三方按命令复跑 |
| FR-109-013 | 失败证据与成功证据同等留存；MUST NOT 只留结论或只留「已通过」 | 失败轮次同样有完整证据文件 |
| FR-109-014 | 证据 MUST 可复现；不可复现的项 MUST 标 `unreproducible` 并说明原因，MUST NOT 记为 pass | 复跑一次结果一致即视为可复现 |

### 3.4 host 门禁口径

| 编号 | 需求 | 判据 |
|---|---|---|
| FR-109-015 | 回归 MUST 执行 host 门禁并覆盖：Node 版本自证、CLI 自证、`serve` 启动、`/api/info` 200、`/` 返回含 UI 标记的页面、SSE 首事件 | 六项逐项记录结论 |
| FR-109-016 | 门禁 MUST 断言 `node --version` 为 **24.2.x**（与运行时锁定一致）；不一致即 `blocked`，MUST NOT 用其它 Node 版本的结果代替 | 版本不符时报告首行即标 `blocked` |
| FR-109-017 | host 门禁结论 MUST 与真机结论并列记录，MUST NOT 互相替代 | 两者各有独立字段，结论可不同 |
| FR-109-018 | 门禁失败 MUST 阻断上真机（不把不确定产物推到设备） | 失败时报告状态为 `blocked`，真机项全为 `skip` |

### 3.5 四条真机取证通道

| 编号 | 需求 | 判据 |
|---|---|---|
| FR-109-019 | 一轮完整回归 MUST 齐备四通道：① 截图（`snapshot_display`）② 输入注入（`uitest uiInput`）③ 服务端（`fport` + HTTP 请求）④ 日志（`hilog` 过滤）；缺一 MUST 记为 `incomplete` | 四通道各自有产物路径与时间点 |
| FR-109-020 | 判据 MUST 以应用域/服务端观测为准：MUST NOT 用 hilog「有没有那行」判执行，MUST NOT 用「点击看起来生效」判 UI | 执行判据只取 HTTP 字段、marker 内容、两次 `dumpLayout` 差异或截图 |
| FR-109-021 | 四通道的命令原文与关键输出 MUST 入证据文件；截图 MUST 附路径与采集时刻 | 证据文件可独立复现该轮 |

### 3.6 结论口径

| 编号 | 需求 | 判据 |
|---|---|---|
| FR-109-022 | 每轮 MUST 给出四态结论：`pass` / `regressed` / `blocked` / `incomplete`，并与上一轮逐项 diff | 报告含逐项差值（含「无变化」） |
| FR-109-023 | 合规报告（107）为 `fail` 或 `incomplete` 时，回归 MUST NOT 判 `pass` | 联动字段出现在报告汇总中 |
| FR-109-024 | 阈值变更 MUST 记录原因与生效轮次，MUST NOT 静默放宽 | 阈值表含 `changedAt` / `reason` |
| FR-109-025 | 首启耗时波动 MUST 以相对基线判定（基线 = 上一轮 pass 值；默认允许 ±20%），并 MUST 同时记录绝对值 | 报告同时给百分比与毫秒数 |

## 4. 关键实体

| 实体 | 字段 | 说明 |
|---|---|---|
| `RegressionRun` | `id`（`R-YYYYMMDD-NN`）/ `date` / `device` / `versionCode` / `hapSha256` / `trigger` / `result` | 一轮回归的头部 |
| `MetricSample` | `key` / `value` / `unit` / `collectedAt` / `source` / `evidence` | 单项指标；`source` 标明采集通道 |
| `Threshold` | `key` / `baseline` / `tolerance`（% 或绝对值）/ `changedAt` / `reason` | 阈值单点定义 |
| `TriggerFingerprint` | `name`（runtime.lock / upstream tag / manifest / patches / appVersion）/ `value` / `changed` | 触发判定输入 |
| `EvidenceRef` | `path` / `channel`（screenshot/uitest/http/hilog）/ `collectedAt` | 证据引用 |
| `GateResult` | `check` / `status`（pass/fail/skip）/ `expected` / `actual` | host 门禁与真机断言的统一结果 |
| `RegressionReport` | `run` / `metrics[]` / `gates[]` / `compliance`（引用 107 报告）/ `result` / `diffWithPrevious` | 输出物 |

## 5. 验收场景

1. **建立基线（正常）**：首轮回归四项齐全，阈值以实测值写入基线，结论 `pass`。
2. **运行时升级触发（正常）**：改 `runtime.lock.json` → 判定 triggered 并打印旧值/新值；未改其它字段时只跑该轮，不改基线。
3. **上游 tag 变更触发（正常 + 负例必存）**：tag 变化 → 触发；无任何指纹变化 → not-triggered，且报告**不得**出现「已回归」。
4. **包体回退（负例必存）**：人为让载荷多出 20 MB → `regressed`，报告给出与上轮差值。
5. **首启耗时回退（负例必存）**：注入延迟使总时长 +30% → `regressed`；分段值可见，能定位到「Node 就绪」段。
6. **首屏字段缺失（负例必存）**：隐藏会话列表容器 → 结构化断言失败 → `regressed`（截图仍「好看」不得判 pass）。
7. **`/api/info` 失败（负例必存）**：错密码或服务未就绪 → 门禁 401/超时 → `blocked`。
8. **host 门禁版本不符（负例必存）**：用非 24.2.x 的 Node 跑 → `blocked`，且真机项全部 `skip`。
9. **四通道不全（负例必存）**：只截屏、未跑 `uitest`/HTTP/hilog → `incomplete`，MUST NOT 判 pass。
10. **可复现性（正常 + 负例）**：同产物重算哈希一致；两次采集差超阈 → 第二次标 `unreproducible` 并复查。
11. **合规联动（负例必存）**：107 报告为 `fail` → 回归结论 `regressed`/`blocked`，不得 `pass`。
12. **阈值变更留痕（正常）**：把容差从 20% 调到 30% → 阈值表新增 `changedAt` 与 `reason`，历史轮次结论不被追溯改写。

## 6. 非功能需求

| 编号 | 需求 | 级别 |
|---|---|---|
| NFR-109-001 | 回归 MUST 只读工程（除 `docs/` 证据与报告外不写任何文件），可重复执行 | MUST |
| NFR-109-002 | host 侧一轮回归 SHOULD 在 10 min 内完成（不含装机与人工操作） | SHOULD |
| NFR-109-003 | 报告 MUST 自包含：仅凭报告 + `docs/evidence/` 即可复核结论 | MUST |
| NFR-109-004 | 证据 MUST NOT 被后续轮次覆盖；同一天多轮用序号区分 | MUST |
| NFR-109-005 | 结论 MUST 区分「未测」与「通过」，MUST NOT 用空格代替 | MUST |

## 7. 假设与约束

| # | 假设 / 约束 | 影响 |
|---|---|---|
| A1 | 真机可用（缺设备时真机项全 `skip`，结论只能 `incomplete`） | 无设备不阻止 host 侧回归，但不得宣布通过 |
| A2 | host 侧存在与运行时一致的 Node 24.2.x（桥的锁文件为准） | 版本不符只能 `blocked` |
| A3 | 上游基线按 tag 固定（v2.0.26 / `9b4ec5714d`） | 基线变更即触发一轮 |
| A4 | 首启耗时受设备负载影响 | 以绝对值 + 相对基线的双口径判定 |
| A5 | 签名可能引入构建差异（时间戳等） | 跨构建哈希只作记录，不作绝对判据 |

## 8. 依赖

| 依赖 | 类型 | 用途 | 状态 |
|---|---|---|---|
| `docs/000-工程规划.md` §11 Phase 4、§7.3、附录 A | 规划 | 四件套、门禁、取证通道的权威口径 | ✅ v0.3 |
| `specs/constitution.md`（C2 / C6、质量门 G-host） | 宪法 | 「判据可证伪」与门禁定义 | ✅ |
| `specs/overall-test-cases.md` TC-R-001..004、TC-H-003..006 | 用例索引 | 复用编号与判据 | ✅ |
| `runtime.lock.json`（本工程根） | 本工程 | 触发指纹 + Node 版本真值 | ✅ 只读引用 |
| `patches/v2.0.26/` 与 `manifest.sha256` | 本工程 | 触发指纹 | 🚧 |
| `entry/build/.../entry-default-signed.hap` | 构建产物 | SHA-256、包体、装机 | 🚧 |
| `scripts/smoke-node24.mjs` | 本工程（101/102） | host 门禁执行体 | 🚧 |
| `docs/真机验证记录.md`、`docs/evidence/` | 文档 | 记录与证据落点 | ⬜ Phase 0 起 |
| `specs/107-compliance` 的报告 | 兄弟模块 | 结论联动（FR-109-023） | 🚧 |
| `hdc`（含 `snapshot_display` / `uitest` / `fport` / `hilog`） | 工具链 | 四条取证通道 | ✅ 可用 |
