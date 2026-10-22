# 回归基线（109-regression）—— 实现方案

> **模块**：`109-regression` ｜ **状态**：Proposed ｜ **日期**：2026-10-18 ｜ 对应规格：[`spec.md`](./spec.md)
> **依据**：`docs/000-工程规划.md` v0.3 §11 Phase 4 / §7.3 / §7.4 / §5.2.3 / §5.10 / 附录 A；`specs/constitution.md`（C2、C6、质量门 G-host）
> 证据口径：✅ 规划原文/本机可核对 ｜ 🔶 沿用 `oc-desktop-hos` ｜ ⬜ 本工程待实测

## 1. 技术上下文

| 项 | 值 | 来源 |
|---|---|---|
| host | Windows + Git-Bash；工具脚本 Node 24.14.1，**门禁必须 24.2.x** | `TECH.md` §三 |
| 设备 | 2in1 / tablet 真机（`hdc`：`install` / `aa start` / `snapshot_display` / `uitest` / `fport` / `hilog`） | 规划 附录 A |
| 被测产物 | `entry/build/default/outputs/default/entry-default-signed.hap` | `STRUCTURE.md` §五 |
| 运行时就绪证据 | `<filesDir>/payload/server.ready.json`（`port` / `startedAt`） | 规划 §5.2.3 |
| 日志通道 | 库日志环 / `logs/server.log` / `payload/app.log` | 规划 §5.10 |
| 证据落点 | `docs/证据/` → `docs/evidence/<YYYY-MM-DD>-regression-N/`；记录追加到 `docs/真机验证记录.md` | 规划 §15 |
| 触发输入 | `runtime.lock.json`（本工程根）、`git -C ../opencode describe --tags`、`manifest.sha256`、`patches/v2.0.26/` 列表、`AppScope/app.json5` 版本 | 本方案 §6.1 |
| 现有门禁 | `scripts/smoke-node24.mjs`（101/102 落地） | 宪法 G-host |

## 2. 宪法合规

| 原则 | 本模块如何满足 | 落点 |
|---|---|---|
| **C1 壳薄契约硬** | 回归只在 host 与设备外部观测，不改 ArkTS、不改服务端；判据全部是外部可观测量 | §6.3、§6.4 |
| **C2 不隐藏平台真相** | 未测即 `skip`，缺通道即 `incomplete`，版本不符即 `blocked`；不把「没测」写成「通过」 | §6.5 |
| **C3 谁写谁读** | 报告与证据由脚本自己写；`docs/真机验证记录.md` 以 append-only 追加轮次段，不改既有内容 | §6.5 |
| **C4 不改上游** | 只读 `../opencode` 的 tag 与产物；不修改上游工作树 | §6.1 |
| **C5 崩溃终态** | 回归判定失败即非零退出并阻断发布；崩溃/`lastCrash` 非空直接 `blocked` | §6.4 |
| **C6 判据可证伪** | 每项都有采集点、期望、实际、证据路径；阈值可审计、变更留痕 | §4.2、§7.1 |

## 3. 研究结论（引用规划 § 号 + 参考工程 `path:line`）

| # | 结论 | 证据 |
|---|---|---|
| R1 | 回归四件套的定义：签名 HAP SHA-256、首启耗时、包体、`/api/info` + 首屏关键字段；**每次 `runtime.lock.json` 或上游 tag 变更后重跑** | 规划 §11 Phase 4（`docs/000-工程规划.md:696-698`） |
| R2 | 首启耗时是「dlopen + `node::Start` ≈ 0.85–0.9 s」+「服务端起（大 bundle import，估 2–6 s）」，必须分段记录 | 规划 §7.4（`:531-535`） |
| R3 | 就绪判据可观测：marker 的 `port > 0`、`GET /api/info` 200、ArkWeb `onPageEnd` 且首屏非错误页 | 规划 §5.2.3（`:321-328`） |
| R4 | host 门禁六项：`--version` / `--help`、`serve` 启动、`/api/info` 200、`/` 返回 SPA、SSE 首事件；且**必须与设备同版本 Node** | 规划 §7.3（`:520-527`）；🔶 `oc-desktop-hos/README.md:70`（`smoke-node22.mjs` 同构） |
| R5 | 「host 门禁只能证明 Node 24 能跑，不能证明 ohos libnode 能跑」——两者不可互相替代 | 规划 §7.3 尾注（`:529`） |
| R6 | 包体预算：签名 HAP **≈90–140 MB**（对照 hos 250.4 MB）；载荷 35.4 MB / 89 条目 | 规划 §7.2（`:510-518`） |
| R7 | 四条取证通道：截图 / `uitest uiInput` / `fport` + HTTP / `hilog`，**缺一不可** | 规划 附录 A（`:883-892`） |
| R8 | 禁止的判据：不用 hilog「有没有那行」判执行、不用「点击看起来生效」判 UI | 规划 §5.10（`:456`） |
| R9 | 证据纪律：禁止编造实测；每条结论必须齐备「结论/证据/日期/设备」四列；失败证据与成功证据同等重要 | 🔶 `oc-desktop-hos/docs/真机验证记录.md:6-11`、`:44-52` |
| R10 | 轮次记录头字段：`R-YYYYMMDD-NN` / 设备型号 / 系统版本 / HAP 版本 / 产物指纹 / 签名类型 | 🔶 同上 `:15-28` |
| R11 | 逐字节一致性守卫（参考工程 10.13）证明「同源码两构建产物不稳定」是真实风险类别；本工程据此把「跨构建哈希」降级为记录项而非常规判据 | 🔶 `oc-desktop-hos/scripts/collect-runtime.mjs` 阶段 10.13（`:372`） |
| R12 | 本工程告警阈值沿用既有用例口径：首启波动 **≤ 20%**、包体波动 **≤ 5 MB** | 🔶 `specs/overall-test-cases.md` §五（TC-R-002 / TC-R-003） |
| R13 | 签名是否引入构建差异（时间戳/随机盐）本工程未实测 ⇒ 不作绝对判据，仅记录 | ⬜ 本方案决策（A5），真机复验后回写 |

## 4. 数据模型

### 4.1 `specs/109-regression/regression.config.json`（阈值与触发定义，单点）
```
{ "schema": 1,
  "triggers": ["runtimeLock", "upstreamTag", "payloadManifest", "patches", "appVersion"],
  "thresholds": {
    "coldStartPct": { "value": 20, "changedAt": "...", "reason": "沿用 TC-R-002" },
    "hapSizeDeltaMb": { "value": 5, "changedAt": "...", "reason": "沿用 TC-R-003" },
    "hapSizeBudgetMb": { "value": 140, "changedAt": "...", "reason": "规划 §7.2 预算上限" },
    "pluginDeltaMb": { "value": 12, "changedAt": "...", "reason": "108 NFR-108-002" } },
  "nodeGate": "24.2.x",
  "channels": ["screenshot", "uitest", "http", "hilog"] }
```

### 4.2 `baseline.json`（基线，只由 pass 轮次推进）
| 字段 | 说明 |
|---|---|
| `runId` / `date` / `device` / `versionCode` | 基线来源轮次 |
| `hapSha256` / `hapBytes` / `payloadEntries` / `payloadBytes` | 产物锚点与包体 |
| `coldStart {totalMs, nodeReadyMs, firstScreenMs}` | 首启三段 |
| `apiInfo {version, pid}` / `firstScreen {listContainer, notErrorPage}` | 接口与首屏字段 |
| `fingerprints {runtimeLock, upstreamTag, manifest, patches, appVersion}` | 触发指纹 |

### 4.3 `report.json`（每轮输出）与证据
- 报告：`{ schema, run:{id,date,device,versionCode,hapSha256,trigger}, metrics[], gates[], compliance:{path,result}, result, diffWithPrevious[] }`。
- 证据目录：`docs/evidence/<YYYY-MM-DD>-regression-N/`，含 `report.json`、`api-info.json`、`screenshot.png`、`dump-before.xml` / `dump-after.xml`、`hilog.txt`、`commands.md`。
- `docs/真机验证记录.md`：append-only 追加一段（§6.5 模板），不改既有轮次。

## 5. 接口契约

| 命令 | 作用 | 退出码 |
|---|---|---|
| `node scripts/regress.mjs --trigger-check` | 只比对指纹并打印差异（不跑回归） | 0 已触发 / 4 未触发 / 2 前置缺失 |
| `node scripts/regress.mjs --host-only` | 跑 host 门禁 + 四件套中可 host 采到的项（SHA-256、包体） | 0 pass / 1 regressed / 2 blocked / 3 incomplete |
| `node scripts/regress.mjs --device` | 追加真机四项与四通道（含装机、启动、采集） | 同上（+ 缺通道 → 3） |
| `node scripts/regress.mjs --report <path>` | 指定报告落点（默认证据目录） | 同上 |
| `node scripts/regress.mjs --self-test` | 反向用例（§7.1），不接触真机 | 0 全部按预期失败 / 1 有用例未按预期 |

**只读契约**：除 `docs/evidence/**`、`docs/真机验证记录.md`（append-only）与指定 `--report` 外不写任何文件；不修改 `../opencode` 工作树。**消费**：107 的 `compliance.report.json`（存在则读，缺失记 `compliance: absent` 并整体 `incomplete`）。

## 6. 实现策略

### 6.1 触发判定（`--trigger-check`）
计算五个指纹：`runtime.lock.json` 内容 SHA-256；`git -C ../opencode describe --tags --always`（失败时用 `patches/<tag>/` 目录名兜底并标注）；`resfile/opencode/manifest.sha256` 的 SHA-256；`patches/v2.0.26/*.patch` 文件名+哈希列表的 SHA-256；`AppScope/app.json5` 的 `versionCode`。与 `baseline.json` 逐项比对，打印 `name / old / new / changed`；任一 `changed` 即 triggered（`退出码 0`）。

### 6.2 host 门禁（六项，Node 24.2.x）
`node --version` 断言 `24.2.` 前缀（不符即 `blocked`，不启动后续）→ 调用既有 `scripts/smoke-node24.mjs` 并解析其六项结论（`--version` / `--help` / `serve` / `/api/info` 200 / `/` SPA 标记 / SSE 首事件）→ 任一失败即 `blocked`（R4、R5）。门禁失败不进入真机步骤（FR-109-018）。
### 6.3 四件套采集
| 指标 | host 可采 | 真机采法 |
|---|---|---|
| 签名 HAP SHA-256 | `sha256sum` 直接算（同产物重算一致性） | 装机后 `hdc file recv` 同名产物再算一次（可选，用于传输完整性） |
| 首启耗时 | — | t0 = `aa start` 发出时刻；t1 = `/api/info` 首次 200；t2 = `dumpLayout` 首次出现会话列表容器；三段分别记录，另用 hilog 时间戳交叉校验（R2、R3） |
| 包体 | HAP 字节数 + `manifest.sha256` 条目数与总字节 | — |
| `/api/info` + 首屏字段 | — | `fport` + Basic 请求取 JSON（`version` / `pid`）；`dumpLayout` 断言容器存在、无错误页/加载页文案 |

**实现说明**：t1 用 host 侧轮询 HTTP（500 ms 间隔，上限 180 s），不用「日志里出现某行」；t2 用 `uitest dumpLayout` 轮询 + 节点断言。首次精度 ⬜ 待 Phase 0（P0-K）实测后回写本表。
### 6.4 四通道与结果计算
- 通道命令（原文入 `commands.md`）：`hdc shell snapshot_display -f /data/local/tmp/s.jpeg && hdc file recv …`；`hdc shell uitest uiInput click <x> <y>`；`hdc fport tcp:4096 tcp:<port>` + `curl -s -u opencode:<pwd> http://127.0.0.1:4096/api/info`；`hdc shell "hilog -x | grep -E 'Cpp Crash|\[ark\]|org.fellow99.oc'"`。
- 结果优先级：`blocked`（门禁/版本/崩溃）> `regressed`（任一指标越阈）> `incomplete`（缺通道或 `skip`）> `pass`。
- 崩溃判据：`hilog` 出现 `Cpp Crash` 或 `lastCrash()` 非空 ⇒ `blocked`（C5）。
### 6.5 证据与记录
- 先建 `<date>-regression-N/`，逐文件写；`report.json` 最后写（保证原子的「报告存在即完整」）。
- `docs/真机验证记录.md` 追加模板（字段沿用 R10）：
  `### R-YYYYMMDD-NN（<触发原因>）` + 表：日期 / 设备 / 系统版本 / HAP 版本 / 产物指纹 / 签名类型 / 四件套值 / 四通道路径 / 结论。
- 追加失败（文件被占用）不静默：报告仍写，退出码记 `incomplete` 并在 stderr 指出需手工粘贴的块。
### 6.6 失败与降级
| 场景 | 行为 |
|---|---|
| 无设备 | 真机项 `skip`，结论 `incomplete`；host 部分照常产出 |
| 无 HAP / 未构建 | 退出 2，不生成「回归通过」报告 |
| Node 版本不符 | `blocked`，不继续 |
| 107 报告缺失 | `compliance: absent` ⇒ `incomplete`（不得 pass） |
| 阈值被改 | 必须带 `changedAt`/`reason`，否则配置文件校验失败（退出 2） |
## 7. 测试考虑
### 7.1 `--self-test` 反向用例（全部在 `os.tmpdir()` 构造）
| 用例 | 注入 | 期望 |
|---|---|---|
| RT-01 | 指纹全相同 | not-triggered（exit 4），不写轮次 |
| RT-02 | 改 `runtime.lock.json` 一个字节 | triggered，打印 old/new |
| RT-03 | 载荷多 20 MB | `regressed`，差值为正 |
| RT-04 | 首启 +30% | `regressed`，指出分段 |
| RT-05 | `apiInfo` 缺 `version` | `regressed` |
| RT-06 | 缺 hilog 通道 | `incomplete` |
| RT-07 | 门禁 Node 版本不符 | `blocked`，真机全 `skip` |
| RT-08 | 阈值缺 `reason` | 配置校验失败（exit 2） |
| RT-09 | 107 报告为 fail | 结论非 pass |
### 7.2 真机一轮（验收口径）
按 §6.4 采齐四通道；首启三段、包体、SHA-256 与 `/api/info` 全量入报告；记录追加到 `docs/真机验证记录.md`。要素不全即 `incomplete`，不得以「设备上看着正常」替代。
### 7.3 与其它门禁的关系
- 顺序：`apply-patches --check` → `build/collect` → `smoke-node24` → 本模块 host → 安装 → 本模块 device → 107 合规（发布前）。
- 本模块不重复 107 的断言：只读其报告并做结论联动（FR-109-023）。
## 8. 文件清单
### 8.1 新增
| 路径 | 说明 |
|---|---|
| `scripts/regress.mjs` | 入口：触发判定 / host-only / device / self-test |
| `scripts/lib/regression/{fingerprint.mjs,baseline.mjs,hostgate.mjs,device.mjs,evidence.mjs,report.mjs}` | 指纹、基线读写、门禁解析、设备采集、证据写盘、结果计算 |
| `specs/109-regression/regression.config.json` | 阈值与触发定义（§4.1） |
| `specs/109-regression/baseline.json` | 基线（首轮 pass 后生成，入库） |
| `specs/109-regression/{spec.md,plan.md}` | 本模块规格与方案 |
| `docs/evidence/<YYYY-MM-DD>-regression-N/**` | 每轮证据（截图/nolog 原始片段，大文件不入库） |
| `docs/回归基线.md` | 当前基线与历史结论索引（人读） |
### 8.2 修改
| 路径 | 改动 |
|---|---|
| `docs/真机验证记录.md` | 每轮 append-only 追加一段（脚本生成，人工可复核） |
| `specs/SPECS_CHECKLIST.md` | 登记 109 完成度（由需求方维护） |
### 8.3 明确不改
- 上游 `../opencode`（含 tag 与工作树）、`patches/v2.0.26/**`、ArkTS 与服务端实现。
- `scripts/smoke-node24.mjs` 的判据（本模块只调用与解析，不复制其逻辑）；如需新判据，另开模块。
- `docs/ACL申请清单.md` 与 107 的配置（阈值与合规判定各自单点定义）。
