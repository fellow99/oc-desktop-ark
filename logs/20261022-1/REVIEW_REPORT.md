# REVIEW_REPORT —— 108-git-plugin + shell 纯 JS 解析

> 评审方式：`requesting-code-review` → 独立 code-reviewer 子代理（只读，看 live 代码 + 核心 diff）；
> 收敛：`receiving-code-review` → 逐条对照代码/真机核验，能修则修，不能修的写明原因与下一步。
> 结论：**2 Critical / 4 Important / 7 Minor**；Critical+Important 已处理（1 条受上游接口限制未彻底解决），Minor 修 4 条。

## 一、Critical

| # | 意见 | 核验 | 处置 |
|---|---|---|---|
| C1 | `/api/vcs` 永远选不到插件 provider：上游 `Vcs.selected()` = `editor.selection ?? location.vcs?.type`，而设备无 git ⇒ `location.vcs` 恒 undefined；且 `Vcs.info()` 有缓存。注册成功 ≠ 被选中。`setTimeout` 补注册是无效 hack | ✅ 成立（bundle 内 `vcs` editor 形状确为 `{add, default:{get,set}}`，`selected()` 如上） | 已删 `setTimeout` 循环；改为在 transform 里 `editor.default.set("git")`，并在**每次工具执行后**调 `context.vcs.reload()`（`workspace.reloadVcs`）。**真机仍为空** ⇒ 本版本插件适配器很可能只透出 `add`（`editor.default` 为 undefined，可选调用被跳过）。已在 TEST_REPORT §四 登记为未达成项 + 两条候选修法 |
| C2 | `payload/lib/plugins.js` 的幂等只比对「源 ↔ 标记」，目标被改写/删文件也报 `up-to-date`（同 UID 的 shell 工具能改到插件目录）⇒ 被改过的插件会一直 import | ✅ 成立 | 命中判据改为「标记一致 **且** 目标目录摘要 == 源摘要」（`digestDir(target)`）；标记只记来源 |

## 二、Important

| # | 意见 | 处置 |
|---|---|---|
| I3 | 先 `rm -rf` 再 `cpSync`，中途失败（ENOSPC/被杀）会毁掉上一份可用插件 | ✅ 改原子投放：`cpSync → <target>.tmp-<pid>` → `rm target` → `rename`，失败清 tmp 并抛错 |
| I4 | 载荷里移除/改名的插件不会被清理，设备会一直加载旧插件 | ✅ 加分反向清理：只删**带我们标记**、且不在源列表里的目录，日志点名 |
| I5 | 依赖树不可复现（无 lockfile，`cacheHit()` 只看两个直接依赖版本；传递依赖可漂移/被投毒） | ⚠️ 部分：本轮未引入 lockfile（时间/范围），已登记为遗留 2，并给出修法（提交 `package-lock.json` + `npm ci`）。现有断言仍能挡住「包数变化 / 原生库 / 体积 / 入口缺失」 |
| I6 | `collect-opencode` 冷缓存时会联网 `npm install`；`--force/--check-only` 通过 `process.argv` 跨脚本泄漏 | ⚠️ 部分：未改接口（时间/范围），已登记为遗留 3，CI 需预置 `.cache/git-plugin-runtime` |

## 三、Minor

| # | 意见 | 处置 |
|---|---|---|
| M7 | 包计数把 `@scope` 目录本身也当包 | ✅ 已修：`rel === 'node_modules'` 时跳过 `@` 开头的目录 |
| M8 | 「无子进程/无原生模块」只扫 `.js` | ✅ 已修：`/\.(c|m)?js$/` |
| M10 | 凭据 `0600` 只在 `try{}catch{}` 里 chmod，失败仍返回 ok | ✅ 已修：`rename` 后**回读 mode**，不足再 chmod 一次，仍不足即抛（上层转 `write-failed`） |
| M13 | 载荷无 `plugins/` 时返回 `ok:true`（假成功） | ✅ 已修：改 `ok:false, reason:'no-plugins-in-payload'` |
| M9 | 门禁没有断言 `editor.default.set`、也没有 `plugins.js` 单测 | ⬜ 未做（遗留 5）：门禁脚本改动因时间未落地，已在报告登记 |
| M11 | `repo.js` 的 `.git` 探测与 `readWorkdir` 未走 realpath/`resolveWithin`，软链可逃逸围栏 | ⬜ 未做（遗留 4）：属围栏加固，需与 104/107 的安全口径一起回归 |
| M12 | 缺省 `dir` 用 setup 期 `location.directory`，与 per-call `cwd` 可能不一致 | ⬜ 未做（遗留 4）：同上，改动会牵动 21 个工具的入参语义 |

## 四、评审确认无问题的点（摘录）

- 投放期 bundle 锚点替换：每次从 `dist-node` 重新拷贝后打补丁 ⇒ 幂等；`occurrences===1` + 回读 + `node --check` 三闸；
  jit 形态表达式与原值等价（`typeof WebAssembly` 为 `"object"` ⇒ `portable || false ≡ portable`）。
- 凭据面：口令从不过 RPC（只回 `passwordLength`）、userinfo 百分号编码、host/协议白名单、临时文件 + rename 写入。
- 工具表：21 个且与规格逐一相符；`setup()` 用桩上下文可在 20 s 内完成；RPC handler 全 async。
- ArkTS 交棒：`XDG_CONFIG_HOME` 在投放前已由 `buildEnv` 设好，Node 侧 `mkdirSync(recursive)` 幂等 ⇒ 无首启/升级时序风险。
- 「agent 可写目录里放插件并由服务端 import」确实把「可写文件」升级成「下次启动执行代码」，
  单 UID 下增量权限有限，但已通过 C2/I3 把「篡改长期驻留」压缩为「下次启动被覆盖」。
