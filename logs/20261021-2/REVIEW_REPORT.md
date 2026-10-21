# REVIEW_REPORT —— 110-jitless 真机修复的代码评审（requesting / receiving）

> 评审对象：本轮为修复真机缺陷而改的 4 个文件（`scripts/collect-opencode.mjs`、`payload/jitless/index.js`、
> `plugins/oc-plugin-workspace-roots/index.mjs`、`entry/src/main/ets/app/OpencodeRuntime.ets`）
> 方式：`requesting-code-review` → 独立 code-reviewer 子代理（只读，只看 diff + 现文件）；
> 收敛：`receiving-code-review` → 逐条对照代码/实测核验，能修则修，不能证实的写明理由。
> 结论：**0 Critical / 5 Important / 4 Minor**；Important 全部已修并复测，Minor 修 4 条、1 条留作说明。

## 一、Important（全部已修）

| # | 评审意见 | 核验 | 处置 |
|---|---|---|---|
| I1 | bundle 补丁结果没有被校验：`writeFileSync` 不检查、不回读、不做语法检查；`bundleGuard.applied` 恒为 true | 成立 | `applyPhotonGuard` 扩成三闸：① 锚点恰好 1 次；② **回读落盘内容**断言「无旧锚点、恰有 1 处新式表达式」且长度符合预期；③ 对改后文件跑 `node --check`。任一条不满足抛错 |
| I2 | `exit(3)` 会把 staging 目录（建在 `resfile/` 同卷）留在资源树里，可能被打进 HAP | 成立（`try/finally` 是空的） | 锚点异常改为抛错，主流程 `catch` 里 `rmSync(stage)` 后 `exit(1)`；实测失败路径不再残留 `.collect-stage-*` |
| I3 | 先 `unlink` 再 `copy` 没有回滚：拷贝失败会「没有插件」且每次启动重演 | 成立 | 改为「拷到 `index.mjs.tmp` → 尺寸核对 → `renameSync` 原子替换」；失败保留旧文件并 warn |
| I4 | 只打日志不比尺寸，截断拷贝会被报成「已投放 N B」 | 成立 | 比较 `srcFile` 与 `destTmp` 字节数；不等则不替换、删 tmp、warn 可见 |
| I5 | 该回归没有自动化门禁；并质疑落盘 `opencode.mjs` 未被补丁 | **部分成立** | 自动化方面已用 I1 的三闸覆盖（每次 collect 都会校验，失败即中断）。**「未打补丁」结论不成立**：实测 `grep -c 'globalThis.__PI_JITLESS_PHOTON__'` = **1**、旧锚点 = **0**、`node --check` 通过（评审方的检索工具对超长行有截断，已在回报中自我标注为「信号而非结论」）。另：二次 collect 的清单对比 `+0/−0/≈0`，证明替换是确定性的 |

## 二、Minor

| # | 评审意见 | 处置 |
|---|---|---|
| M6 | 16 MB UTF-8 往返会把非法字节静默变 U+FFFD，而 manifest 是改后算哈希（坏也自洽） | ✅ 改为按 `Buffer` 查找/拼接，不做字符串解码 |
| M7 | `host.js` 解析把**可写**插件目录排在只读载荷根之前（能力面接管风险） | ✅ 顺序改为「只读载荷根 → 插件同目录 → 可写载荷根」，并在注释里写明为何顺序承重 |
| M8 | `photonGuard` 只在 compat 分支出现，`describe()` 不打印，头注释契约过期 | ✅ jit 分支补 `photonGuard:'n/a'`；`describe()` 打 `photonGuard=…`；头注释事实契约补该字段（含含义） |
| M9 | `ensureDir` 只判存在、不判是否为目录 | ✅ 存在时用 `statSync().isDirectory()` 校验，不是目录则 warn（不阻断） |
| M5b | `browse` 不解析符号链接，文档目录里的软链可枚举到范围外 | 说明：属既有行为、不在本次变更范围；已登记为后续项，不在本轮扩大改动 |

## 三、评审确认无问题的点（摘录）

- 锚点替换的幂等性：每次 collect 都从 `dist-node` 重新拷贝再打补丁，dry-run 与 `--apply` 跑同一份组装；不会把已打补丁的文件再喂给 `applyPhotonGuard`。
- `jit` 形态零回归：`installIfNeeded` 在 `typeof WebAssembly !== 'undefined'` 时提前返回，`photon-shim.js` 与 vendor 编解码器都不会被加载；注入的守卫左操作数为假 ⇒ 仍调原生 `requirePhoton_rs()`。
- `payloadOf()` 无越权：`id` 走 `ROOT_IDS` 白名单，`sub` 仍经 `path.resolve` + `startsWith(realRoot + sep)` 围栏；单键 `{input}` 才解包，三种方法都没有名为 `input` 的真实字段。
- `host.useFileMailbox(box, {})` 与 `host.js` 的 `{}` → 默认 `pollMs` 契约一致；`handlePermissionCheck` 不带 `ok` 字段也不会被判失败（`interpretRawResponse` 只在 `ok===false` 时拒绝）。
- 插件目录只有 `index.mjs`，collect 的单文件拷贝足够。

## 四、复测（修复后）

1. `node --check` ×（collect / 插件 / jitless index）全通过；collect dry-run + `--apply` 均打印「锚点已替换 + 回读/语法校验通过」。
2. 二次 `--apply` 清单对比 `+0 / −0 / ≈0`（确定性）；`resfile/` 下无 `.collect-stage-*` 残留。
3. HAP 重编（BUILD SUCCESSFUL）→ 重装 → 真机重启：`node-mode.json` = `compat`，`server.log` 出现 `photonGuard=armed`，无 `FATAL`。
4. 真机回归：插件 `active`、`browse{sandbox}` = `ok:true`、`permissionCheck{documents}` = `source:bridge`；
   文本会话 `7+5` → `12`（`finish=stop`）；看图会话正确识读界面（`finish=stop`）。
