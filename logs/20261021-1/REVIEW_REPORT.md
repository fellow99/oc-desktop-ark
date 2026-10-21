# REVIEW_REPORT —— 110-jitless 无 JIT 模式

> 需求：`110-jitless` ｜ 规格：`specs/110-jitless/` ｜ 分支：`main`（不改分支）
> 评审日期：2026-10-21 ｜ 方式：`requesting-code-review` 派发 code-reviewer 子代理（静态评审，无 shell）
> 评审范围：`git diff 5d9151d bbee32f`（development 提交）+ spec/plan/tasks/test-cases
> 接收处理：按 `receiving-code-review` 纪律逐条核实（验证 → 采纳 / 技术性驳回），敏感信息不落盘。

## 一、评审结论（评审方）

**Fix-then-continue**：fetch 垫片、http getter 封印、ArkTS 形态链路扎实且有自测证据；但指出 2 条 Critical、10 条 Important、10 条 Minor。

## 二、逐条核实与处理（receiving）

### Critical

| # | 评审意见 | 核实结果（证据） | 处理 |
|---|---|---|---|
| C1 | undici-shim 未接线：compat 路径从不调用 `createUndiciShim`，FR-110-005 是死代码 | **部分有效（驳回接线动作，保留测试）**：对 `entry/src/main/resources/resfile/opencode/opencode.mjs` 取证，`undici` 仅命中 2 次：一处是 OpenAI SDK 错误文案字符串（`"import { fetch, ProxyAgent } from 'undici'"`），无 `require('undici')`/`from 'undici'` 真实导入。bundle 不直接 require undici；端侧 Node 24.2.0 也无 node_modules/undici 可被拦截。**Module._load 拦截是死代码且有误伤风险**。FR-110-005 的真实风险面（`node:http`/`https` 惰性 undici getter）已由 `http-lazy-undici.js` 封印 | 驳回接线；改 FR-110-005 措辞为「以 bundle 取证为准」；undici-shim 保留为已验证的防御资产（selftest 仍全绿）。**不装拦截器** |
| C2 | photon-shim 已投放但永不激活；compat 图片附件失败，与 FR-110-007/AC-110-09 矛盾 | **有效（事实修正，非加代码可解）**：bundle 取证——photon 是内联 emscripten：`new WebAssembly.Module(readFileSync(process.env.OPENCODE_PHOTON_WASM_PATH ?? resolve(...)))`，调用层 `PhotonImage.new_from_byteslice` 自带 `try/catch → new DecodeError`。无外部注入点（env 指向的是 .wasm 二进制路径，不能指向 JS）。tree-sitter 经 emscripten `WebAssembly.instantiate`，失败走 `abort()`（reject readyPromise） | 修订 FR-110-007 + AC-110-09 + TC-110-21 口径为「如实降级」（与 FR-110-006/008 同档）；shim 保留为已自测的替换资产；真机验证 DecodeError 实际用户表现 |

### Important

| # | 意见 | 核实 | 处理 |
|---|---|---|---|
| I1 | node-mode.json 缺 spec 要求的 deviceType/deviceModel/osFullName（FR-110-001 §3） | **有效**，NodeMode.ets:124-131 确实只写 5 字段 | ✅ 修：补 3 字段（`@ohos.deviceInfo`） |
| I2 | collect-opencode.mjs 无 --apply/dry-run、无逐步审计（NFR-110-004/T6.3） | **部分有效**：脚本已有控制台审计行与 removed 清单，但确无 dry-run 开关 | ✅ 修：加 `--apply`（默认 dry-run，列出计划动作，退出 0 不落盘）+ 每步文件数/字节数 |
| I3 | selftest 缺 307/308 重放覆盖（fetch-shim:718-728 有非平凡逻辑） | **有效**，现有 redirect 仅 301/303 | ✅ 修：加 redirect-307（method/body 原样重放）+ 308 流体丢弃用例 |
| I4 | opencode-server.js facts JSON 不可完全 grep（嵌套 wasm 事实被埋） | **有效** | ✅ 修：fetchImpl 序列化为标记串；wasm 事实单独一行 |
| I5 | wasmFacts 未传 bundleText ⇒ bundled/degraded 恒空，降级事实从不产出 | **有效**（index.js:143 无第二参） | ✅ 修：opencode-server.js 读 bundle 三个标记串（限量读取，不读全 16MB 进正则）传入 |
| I6 | Index.ets 未读 AppStorage('nodeMode')，plan T4.6 的 mode 状态串未实现 | **有效**，Index.ets:21 为硬编码文案 | ✅ 修：aboutToAppear 读 nodeMode 渲染 |
| I7 | index.js 头部仍是参考工程叙事（pi-jitless-entry.cjs），PI_JITLESS_DIR 是无消费者的残留 | **有效** | ✅ 修：删除 PI_JITLESS_DIR 赋值 + 头部改写为 110 口径 |
| I8 | NodeMode BASE_FLAGS 对 jit 也硬编码 --no-verify-heap，AC-110-10「与改造前一致」需核实 | **驳回**：改造前现役 flags 就是 `--no-verify-heap`（EntryAbility 既有），jit 变体带它才是「与改造前一致」；去掉反而引入差异 | 不改；在注释中写明依据 |
| I9 | photon.mjs upstream-image-resize-core 用例强耦合参考工程 pi-dist，缺目录即 SKIP 抛错 | **有效** | ✅ 修：改为「loud skip + 退出码不失败」，tasks/TEST_REPORT 标注该支为条件用例 |
| I10 | http-lazy-undici 状态：无属性可封时仍报 installed（空 sealed）；selftest 未断言 sealed≥1 | **有效** | ✅ 修：sealed 为空时状态报 `kept`；selftest 加 sealed.length≥1（compat）断言 |

### Minor（择低风险者修，其余登记）

| # | 意见 | 处理 |
|---|---|---|
| m1 | multipart boundary 前缀 `----pijitless` 泄露参考工程品牌 | ✅ 改中性前缀 |
| m2 | Response.clone() 抛「未实现」 | 登记（opencode 不调用，YAGNI） |
| m3 | 普通对象 input 被当 Request | 登记（上游不会这么调） |
| m4 | stream body pump 无超时 | 登记（流契约如此，加注释） |
| m5 | getGlobalDispatcher 构造期 eager 调用与「绝不触发 WASM」措辞 | ✅ 措辞改准确（try/catch 兜底） |
| m6 | quickjs 探测正则过宽 | ✅ 随 I5 改更具体标记 |
| m7 | photon-shim 2s console.error 不经 DEBUG 门 | 登记（留痕是刻意设计） |
| m8 | OpencodeRuntime 二次 resolve() 致 ACL 探测跑两次 | ✅ 修：EntryAbility 存决策，Runtime 复用（AppStorage 持有者） |
| m9 | check-acl-surface stripComments 不处理字符串内 // | ✅ 修：加字符串感知的小型状态机 |
| m10 | collect selftest 排除用 includes 子串 | ✅ 随 I2 改 path.relative 精确判断 |

## 三、处理结果

- Critical：2 条均经证据核实，处理方式为**修订规格口径（C2）+ 驳回无效接线（C1）**，非「带病放行」——规格改后实现与验收一致。
- Important：8 条采纳修复（I1–I7、I9、I10），1 条技术性驳回（I8，附依据），I2 部分采纳。
- Minor：6 修（m1/m5/m6/m8/m9/m10），4 登记。
- 修复后重跑（2026-10-21 本机证据）：
  - `node --check`：`payload/jitless/**`、`scripts/*.mjs`、`payload/opencode-server.js` 全部通过；
  - `node --jitless payload/jitless/selftest/run.mjs`：fetch/photon 两支 PASS（307/308 重放与流式拒绝用例在内，photon 22 过 / 2 跳：pi-dist 缺失，loud skip）；对照组（无 --jitless）同样全绿；
  - `node scripts/check-acl-surface.mjs`：requestPermissions=6、definePermissions=1，AC-110-06 通过；stripComments 字符串感知行为另用 3 组用例验证（URL 内 `//`、字符串内 `/* */`、尾逗号）；
  - `node scripts/collect-opencode.mjs`：dry-run 审计 86 文件 / 62.5 MB / jitless 42 文件 / selftest 0 泄漏；`--apply` 首次暴露 **EXDEV**（TEMP 在 C:、resfile 在 D:，rename 跨卷失败，已自动回滚）⇒ staging 改到 resfile 同卷 `.collect-stage-XXXX` 后 apply 成功；二次 apply `+0/−0/≈0` 幂等；manifest 抽 3 文件 SHA 对盘一致；
  - `hvigorw assembleHap`：BUILD SUCCESSFUL（修了两处评审改造引入的编译问题：`deviceInfo.deviceModel` 在 API 24 不存在 → `productModel`；调用方误用不存在的 `NodeMode.*` 命名空间式导出 → 改为具名导入 `decision/writeNodeModeEvidence`，此问题 bbee32f 即存在、本次构建首次全量编译 ArkTS 时暴露）；
  - HAP 核对：`entry-default-unsigned.hap`（111.5 MB，未签名）含 `resources/resfile/opencode/jitless/` 42 项、`manifest.sha256`，selftest 0 项；残留告警仅打包器建议移除 vendor `index.d.ts`（源码检查 WARN，不影响产物）。
- 评审方静态评审未执行命令；所有结论由我在本机以 grep/取证/自测/构建复核。

## 四、遗留（如实登记）

- 真机：TC-110-18…25（设备当前 `hdc list targets` 为空）；C2 的 DecodeError 用户可见表现需真机确认。
- 图片附件 compat 形态不支持（规格已改为如实降级）；若未来要求 compat 发图，路线 = 给上游提注入点或换 ArkTS 原生解码桥（本需求范围外，spec §6）。
