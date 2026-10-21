#!/usr/bin/env node
/**
 * 把上游产物 + 库引导器 + 本工程宿主脚本投放进 resfile，并生成 SHA-256 清单。
 *
 * 纪律：
 *   · 只清**生成物**，保留入库的 README.md（否则每次 collect 都制造一条删除）；
 *   · 缺失 `bootstrap.js` 直接失败（产出必然起不来的载荷没有意义）；
 *   · 裁剪只删**平台专属二进制子包**，保留纯 JS 入口（避免误删运行必需文件）；
 *   · 清单是 JSON（schema/baseline/form/node/target/files/totals），供门禁断言。
 *
 * 模式（review I2）：
 *   · 默认 **dry-run**：在临时目录里完整组装 + 生成清单 + 打印审计，不碰 resfile；
 *   · `--apply`：校验通过后才原子替换 resfile/opencode（先备份再换，失败回滚）。
 *   · CI 必须显式 `--apply`，避免"我就看看"误改发布归档。
 */
import { createHash } from 'node:crypto'
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { materializeGitPlugin } from './collect-plugins.mjs'
import { fileURLToPath } from 'node:url'

const APPLY = process.argv.includes('--apply')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.resolve(root, process.env.OPENCODE_DIR ?? '../opencode')
const distNode = path.join(repo, 'packages/cli/dist-node')
const bridgePayload = path.resolve(root, '../ohos-node-bridge/payload')
const out = path.join(root, 'entry/src/main/resources/resfile/opencode')
const NODE_VERSION = '24.2.0'
const BASELINE = process.env.EXPECTED_BASELINE ?? '9b4ec5714d'

if (!existsSync(path.join(distNode, 'opencode.mjs'))) {
  console.error(`✗ 缺少产物：${distNode}/opencode.mjs（先跑 scripts/build-opencode.mjs）`)
  process.exit(2)
}
if (!existsSync(path.join(bridgePayload, 'bootstrap.js'))) {
  console.error(`✗ 缺少库引导器：${bridgePayload}/bootstrap.js（scriptPath 指向它，缺了必然起不来）`)
  process.exit(2)
}

/**
 * 110-jitless：给 staged `opencode.mjs` 注入**唯一的** photon 守卫。
 *
 * 【为什么必须改 bundle】上游 bundle 里 photon 是 wasm-bindgen 胶水，`requirePhoton_rs()`
 * 在**模块初始化期**（`var photon_rsExports=requirePhoton_rs()`）就执行
 * `new WebAssembly.Module(bytes)` / `new WebAssembly.Instance(...)`。compat 形态
 * （`node --jitless` ⇒ `WebAssembly===undefined`）下这是**启动期硬失败**（真机实测：
 * `FATAL import failed: ReferenceError: WebAssembly is not defined`），不是懒加载降级。
 * 单文件 bundle 里 photon 的符号是 minified 内部符号，运行期无法 monkey-patch
 * ⇒ 只能在投放期做这一处**锚点唯一**的替换，把「初始化」改成「compat 取纯 JS 替身」。
 *
 * 【替换内容】`var photon_rsExports=requirePhoton_rs();`
 *   → `var photon_rsExports=(typeof WebAssembly==="undefined"&&globalThis.__PI_JITLESS_PHOTON__)
 *      ?globalThis.__PI_JITLESS_PHOTON__:requirePhoton_rs();`
 * 替身由 `jitless/index.js` 在 import bundle **之前**挂到 `globalThis.__PI_JITLESS_PHOTON__`。
 *
 * 【jit 形态零回归】`typeof WebAssembly!=="undefined"` ⇒ 仍走原生 `requirePhoton_rs()`。
 * 【安全网（三闸）】
 *   ① 锚点必须**恰好出现 1 次**（多于/少于都拒绝，绝不模糊替换 16 MB 文本）；
 *   ② 写盘后**重新读回**断言「含新式、不含旧锚点」，并核对文件长度变化；
 *   ③ 对改后文件跑 `node --check`（语法闸）。
 *   任一条不满足 ⇒ 抛错（调用方清理 staging 后退出，不留半成品）。
 *
 * 【为什么按 Buffer 处理】bundle 是 16 MB UTF-8 文本；`readFileSync(...,'utf8')` + `writeFileSync`
 * 会把任何非法 UTF-8 字节静默改成 U+FFFD，而 manifest 的 sha256 是**改后**再算的（改坏了也自洽）。
 * 按字节查找/拼接可完全避开这个风险。
 *
 * @param {string} file staged opencode.mjs 绝对路径
 * @param {string} stage staging 目录（仅用于日志里的相对展示）
 * @returns {{anchor: string, occurrences: number, applied: boolean}}
 * @throws {Error} 锚点数量异常 / 回读校验失败 / `node --check` 失败
 */
const PHOTON_ANCHOR = 'var photon_rsExports=requirePhoton_rs();'
const PHOTON_REPLACEMENT = 'var photon_rsExports=(typeof WebAssembly==="undefined"'
  + '&&globalThis.__PI_JITLESS_PHOTON__)?globalThis.__PI_JITLESS_PHOTON__:requirePhoton_rs();'

/**
 * 110-jitless（任务：shell 工具纯 JS 解析）：命令扫描器在 compat 下改走**纯 JS portable 扫描器**。
 *
 * 上游 `scan$2` 只有一条分叉：
 *     return tn?.portable ? yield* scanPortable(...) : yield* scanLegacy(...)
 * `scanLegacy` 走 web-tree-sitter（WASM）⇒ compat 下 `shell` 工具直接抛
 * `WebAssembly is not defined`。而 `scanPortable` 用的是 bundle 自带的**纯 JS**
 * `ShellScan`（`scan(命令, "bash"|"zsh"|"posix")` / `scanPowerShell`），无 WASM 依赖。
 *
 * ⇒ 把分叉条件补上「compat 形态」：`tn?.portable || typeof WebAssembly === "undefined"`。
 *   · jit 形态：`WebAssembly` 存在 ⇒ 表达式与原值等价，行为零变化（配置项仍由用户决定）；
 *   · compat 形态：强制 portable，命令解析不再依赖 WASM。
 * 若上游把 portable 扫描器判成 `opaque`，工具会**明确报错**（"cannot analyze command"），不静默放行。
 */
const SHELL_SCANNER_ANCHOR = 'return tn?.portable?yield*scanPortable(ct,$t,en):yield*scanLegacy(ct,$t,en)'
const SHELL_SCANNER_REPLACEMENT = 'return (tn?.portable||typeof WebAssembly==="undefined")'
  + '?yield*scanPortable(ct,$t,en):yield*scanLegacy(ct,$t,en)'

/**
 * 对 staged bundle 做**一处**锚点替换，并过三闸。
 *
 * 三闸：① 锚点恰好出现 1 次（多/少都拒绝，绝不模糊替换 16 MB 文本）；
 *      ② 回读落盘内容断言「无旧锚点、恰有 1 处新式」且长度符合预期；
 *      ③ 对改后文件跑 `node --check`。
 *
 * 按 Buffer 处理：bundle 是 UTF-8 文本，用字符串往返会把非法字节静默改成 U+FFFD，
 * 而 manifest 的 sha256 是**改后**再算的（改坏了也自洽）。
 *
 * @throws {Error} 任一闸不通过（调用方清理 staging 后退出）
 */
function patchBundleOnce(file, stage, label, anchor, replacement) {
  const anchorBytes = Buffer.from(anchor, 'utf8')
  const replacementBytes = Buffer.from(replacement, 'utf8')

  /* ① 锚点唯一性 */
  const original = readFileSync(file)
  const occurrences = countOccurrences(original, anchorBytes)
  if (occurrences !== 1) {
    throw new Error(`${label} 锚点数量异常（期望 1，实测 ${occurrences}）：${anchor}`
      + ' ｜ 上游 bundle 结构变了 ⇒ 必须人工确认新锚点后再投放（拒绝模糊替换）。')
  }
  const at = original.indexOf(anchorBytes)
  writeFileSync(file, Buffer.concat([
    original.subarray(0, at), replacementBytes, original.subarray(at + anchorBytes.length),
  ]))

  /* ② 回读校验（只认落盘内容，不认内存里的 Buffer） */
  const written = readFileSync(file)
  const expectedSize = original.length - anchorBytes.length + replacementBytes.length
  if (written.length !== expectedSize) {
    throw new Error(`${label} 回读长度不符：期望 ${expectedSize} B，实测 ${written.length} B`)
  }
  if (countOccurrences(written, anchorBytes) !== 0) {
    throw new Error(`${label} 回读仍有旧锚点（替换未生效）`)
  }
  if (countOccurrences(written, replacementBytes) !== 1) {
    throw new Error(`${label} 回读找不到新表达式（替换未生效）`)
  }

  /* ③ 语法闸：Node 解析改后的 ESM */
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (check.status !== 0) {
    throw new Error(`${label} 改后文件语法检查失败（exit=${check.status}）：${(check.stderr || '').slice(0, 400)}`)
  }

  console.log(`${label}：1 处锚点已替换 + 回读/语法校验通过（${path.relative(stage, file) || file}）`)
  return { anchor, occurrences, applied: true }
}

/** photon 初始化守卫（compat 下取纯 JS 替身，jit 仍走原生）。 */
function applyPhotonGuard(file, stage) {
  return patchBundleOnce(file, stage, '守卫 photon 初始化', PHOTON_ANCHOR, PHOTON_REPLACEMENT)
}

/** shell 命令扫描器守卫（compat 下走纯 JS portable 扫描器）。 */
function applyShellScannerGuard(file, stage) {
  return patchBundleOnce(file, stage, '守卫 shell 命令扫描器', SHELL_SCANNER_ANCHOR, SHELL_SCANNER_REPLACEMENT)
}

/**
 * 本工程的**全部** bundle 级守卫（顺序无关；逐个独立三闸）。
 * 新增守卫时只往这里加一条，`assemble()` 会自动执行并回传到诊断行。
 */
const BUNDLE_GUARDS = [
  { name: 'photon', label: 'photon 初始化', apply: applyPhotonGuard },
  { name: 'shellScanner', label: 'shell 命令扫描器', apply: applyShellScannerGuard },
]

/** 在 Buffer 里数非重叠出现次数。 */
function countOccurrences(haystack, needle) {
  let count = 0
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) return count
    count += 1
    from = at + needle.length
  }
}

/**
 * 在 staging 目录里完成全部组装，返回 manifest 与审计事实。
 * 组装逻辑与输出布局**与是否 apply 无关** —— dry-run 跑的就是真组装，
 * 这样审计结果才代表 apply 后的真实内容（review I2）。
 */
function assemble(stage) {
  // 保留入库文件（README.md 原样回写；旧 manifest 只用于审计对比，不复制进 staging）
  const readmePath = path.join(out, 'README.md')
  if (existsSync(readmePath)) writeFileSync(path.join(stage, 'README.md'), readFileSync(readmePath))

  // 1) 上游产物
  cpSync(path.join(distNode, 'opencode.mjs'), path.join(stage, 'opencode.mjs'))
  if (existsSync(path.join(distNode, 'assets'))) {
    cpSync(path.join(distNode, 'assets'), path.join(stage, 'assets'), { recursive: true })
  }

  /* 110-jitless：bundle 级守卫（compat 形态不触达 WASM）；逐条锚点唯一 + 回读 + 语法闸。 */
  const bundleFile = path.join(stage, 'opencode.mjs')
  const bundleGuard = {}
  for (const guard of BUNDLE_GUARDS) {
    bundleGuard[guard.name] = guard.apply(bundleFile, stage)
  }

  // 2) 裁剪：只删「非目标平台」的二进制子包与不可执行 ELF
  const pruneDirs = [
    /^opencode-pty$/,
    /^@lydell\/node-pty-(darwin|win32|linux-x64)/,
    /^@parcel\/watcher-(darwin|win32|linux-x64|android)/,
    /^@ff-labs\/fff-bin-(darwin|win32|linux-x64)/,
    /^@yuuang\/ffi-rs-(darwin|win32|linux-x64)/,
  ]
  const removed = []
  function prune(dir) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (!entry.isDirectory()) continue
      /* review m10：用相对 assets 根的路径判裁剪，而不是 includes(目录名) ——
       * 深层包若恰好含同名片段（如 .../node-pty-darwin-extra/）不会误伤，
       * 顶层 assets/opencode-pty 也不会因绝对路径分隔符差异漏判。 */
      const rel = path.relative(path.join(stage, 'assets'), abs).split(path.sep).join('/')
      if (pruneDirs.some((re) => re.test(rel))) {
        rmSync(abs, { recursive: true, force: true })
        removed.push(rel)
      } else {
        prune(abs)
      }
    }
  }
  prune(path.join(stage, 'assets'))

  // 3) 库引导器 + 宿主桥参考实现（host.js 可选）
  cpSync(path.join(bridgePayload, 'bootstrap.js'), path.join(stage, 'bootstrap.js'))
  if (existsSync(path.join(bridgePayload, 'host.js'))) {
    cpSync(path.join(bridgePayload, 'host.js'), path.join(stage, 'host.js'))
  }

  // 4) 本工程宿主脚本
  cpSync(path.join(root, 'payload/opencode-server.js'), path.join(stage, 'opencode-server.js'))
  cpSync(path.join(root, 'payload/lib'), path.join(stage, 'lib'), { recursive: true })

  // 4.2) 110-jitless：纯 JS 兼容层（payload/jitless/ → staging/jitless/）。
  // opencode-server.js 用相对路径 `require('./jitless')`，故兼容层必须与入口同目录部署。
  // 排除 selftest/（开发期工具，不进发布归档）。
  const jitlessAudit = { copied: [], skippedSelftest: 0, missing: false }
  const jitlessSrc = path.join(root, 'payload/jitless')
  if (existsSync(jitlessSrc)) {
    const jitlessDest = path.join(stage, 'jitless')
    mkdirSync(jitlessDest, { recursive: true })
    cpSync(jitlessSrc, jitlessDest, {
      recursive: true,
      filter: (src) => {
        const rel = path.relative(jitlessSrc, src).split(path.sep).join('/')
        if (rel === 'selftest' || rel.startsWith('selftest/')) {
          if (src !== jitlessSrc) jitlessAudit.skippedSelftest += 1
          return false
        }
        if (src !== jitlessSrc) jitlessAudit.copied.push(rel)
        return true
      },
    })
  } else {
    jitlessAudit.missing = true
  }

  // 4.5) 工作区选择器插件（plugins/ → staging/plugins/）。
  const pluginSrc = path.join(root, 'plugins/oc-plugin-workspace-roots/index.mjs')
  let pluginCopied = false
  if (existsSync(pluginSrc)) {
    const pluginDestDir = path.join(stage, 'plugins/oc-plugin-workspace-roots')
    mkdirSync(pluginDestDir, { recursive: true })
    cpSync(pluginSrc, path.join(pluginDestDir, 'index.mjs'))
    pluginCopied = true
  }

  /* 4.6) 108-git-plugin：插件本体 + **构建期物化**的依赖（node_modules，56 包）。
   * 断言在 collect-plugins 里：版本 pin、传输入口、包数、体积、无原生库、无软链。
   * 失败即抛错（由 assemble 的调用方清理 staging 后退出），绝不产出空目录。 */
  const gitPluginAudit = materializeGitPlugin(path.join(stage, 'plugins/oc-plugin-git'))

  // 5) 清单（JSON）
  const files = []
  function walk(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs, rel)
      else files.push({ rel, abs })
    }
  }
  walk(stage, '')
  const entries = files
    .filter((f) => f.rel !== 'manifest.sha256' && f.rel !== 'README.md')
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .map((f) => {
      const buf = readFileSync(f.abs)
      return {
        path: f.rel,
        sha256: createHash('sha256').update(buf).digest('hex'),
        size: statSync(f.abs).size,
        kind: f.rel === 'opencode.mjs' ? 'entry'
          : f.rel === 'assets/app-archive.bin' ? 'ui-archive' : 'asset',
      }
    })
  const manifest = {
    schema: 1,
    baseline: BASELINE,
    form: 'readonly',
    node: NODE_VERSION,
    target: 'linux-arm64',
    toolchain: { node: process.version, bun: safeBunVersion() },
    removed,
    files: entries,
    totals: {
      count: entries.length,
      bytes: entries.reduce((n, e) => n + e.size, 0),
    },
  }
  writeFileSync(path.join(stage, 'manifest.sha256'), JSON.stringify(manifest, null, 2) + '\n')
  return { manifest, removed, jitlessAudit, pluginCopied, bundleGuard, gitPluginAudit }
}

function safeBunVersion() {
  try {
    const bin = process.env.BUN_BIN || 'bun'
    const shell = process.platform === 'win32' && !process.env.BUN_BIN
    return execFileSync(bin, ['--version'], { encoding: 'utf8', shell }).trim()
  } catch {
    return 'unavailable'
  }
}

/** 读旧清单（resfile 里的 manifest.sha256）；不存在/损坏返回 null。 */
function readPreviousManifest() {
  const p = path.join(out, 'manifest.sha256')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/** 逐文件审计：本次 vs 上次（新增/删除/内容变化），jitless 完整性专项。 */
function audit(manifest, previous, jitlessAudit) {
  const problems = []
  const jitlessFiles = manifest.files.filter((f) => f.path.startsWith('jitless/'))
  const required = [
    'jitless/index.js',
    'jitless/http-lazy-undici.js',
    'jitless/fetch-shim.js',
    'jitless/undici-shim.js',
    'jitless/photon-shim.js',
    'jitless/image-codec.js',
    'jitless/wasm-patch.js',
  ]
  for (const rel of required) {
    if (!manifest.files.some((f) => f.path === rel)) problems.push(`缺少必需的兼容层文件：${rel}`)
  }
  if (manifest.files.some((f) => f.path.startsWith('jitless/selftest/'))) {
    problems.push('selftest/ 不得进入发布归档（应在 collect 时排除）')
  }
  if (jitlessAudit.missing) problems.push('payload/jitless 源目录缺失（compat 形态将不可用）')

  const changes = { added: [], removed: [], changed: [] }
  if (previous !== null && Array.isArray(previous.files)) {
    const oldMap = new Map(previous.files.map((f) => [f.path, f]))
    const newSet = new Set(manifest.files.map((f) => f.path))
    for (const f of manifest.files) {
      const old = oldMap.get(f.path)
      if (old === undefined) changes.added.push(f.path)
      else if (old.sha256 !== f.sha256 || old.size !== f.size) changes.changed.push(f.path)
    }
    for (const path2 of oldMap.keys()) {
      if (!newSet.has(path2)) changes.removed.push(path2)
    }
  }
  return { problems, changes, jitlessCount: jitlessFiles.length }
}

// ── 主流程：永远先组装到临时目录（dry-run 与 apply 跑同一份产物）─────────────
// staging 必须与 out 同卷：最终交换走 rename（原子替换），跨卷（系统 TEMP 在 C:、
// 仓库在 D: 时）rename 会抛 EXDEV。因此用 resfile 旁边的 .collect-stage-XXXX。
const stageParent = path.dirname(out)
mkdirSync(stageParent, { recursive: true })
const stage = mkdtempSync(path.join(stageParent, '.collect-stage-'))
let result
try {
  result = assemble(stage)
} catch (error) {
  /* 失败必须清掉 staging：stage 建在 resfile/ 同卷，残留目录会被打进 HAP
   * （且 .gitignore 只忽略 resfile/opencode/*，残留会成为未跟踪文件）。 */
  rmSync(stage, { recursive: true, force: true })
  console.error(`✗ 组装失败（已清理 staging）：${error && error.message ? error.message : String(error)}`)
  process.exit(1)
}
const { manifest, removed, jitlessAudit, pluginCopied, bundleGuard, gitPluginAudit } = result
const previous = readPreviousManifest()
const report = audit(manifest, previous, jitlessAudit)

console.log(`── collect 审计${APPLY ? '（--apply）' : '（dry-run；加 --apply 才写入 resfile）'} ──`)
console.log(`文件总数 ${manifest.totals.count} / ${(manifest.totals.bytes / 1048576).toFixed(1)} MB`)
console.log(`裁剪平台子包 ${removed.length} 个${removed.length ? '：' + removed.join(', ') : ''}`)
console.log(`jitless 兼容层：${report.jitlessCount} 个文件入库（另排除 selftest 项 ${jitlessAudit.skippedSelftest}）`)
console.log('bundle 守卫：' + BUNDLE_GUARDS
  .map((guard) => `${guard.label}=${bundleGuard[guard.name]?.applied ? '已注入' : '未注入'}`)
  .join(' ｜ ') + '（jit 形态行为不变）')
console.log(`工作区选择器插件：${pluginCopied ? '已投放' : '⚠ 源缺失，未投放（不阻断）'}`)
console.log('git 插件：' + `${gitPluginAudit.stats.packages} 包 / ${gitPluginAudit.stats.count} 文件 / `
  + `${(gitPluginAudit.stats.total / 1048576).toFixed(2)} MB（含物化依赖 node_modules）`)
if (previous === null) {
  console.log('旧清单：不存在（首次投放或 resfile 已被清理）')
} else {
  console.log(`相比旧清单：+${report.changes.added.length} / −${report.changes.removed.length}`
    + ` / ≈${report.changes.changed.length} 内容变化`)
  const preview = [...report.changes.added.slice(0, 8), ...report.changes.removed.slice(0, 8),
    ...report.changes.changed.slice(0, 8)]
  for (const line of preview) console.log(`   · ${line}`)
  if (report.changes.added.length + report.changes.removed.length + report.changes.changed.length > 24) {
    console.log('   · …（其余见 manifest.sha256 对比）')
  }
}
if (report.problems.length > 0) {
  for (const p of report.problems) console.error(`✗ ${p}`)
  rmSync(stage, { recursive: true, force: true })
  process.exit(1)
}

if (!APPLY) {
  console.log('')
  console.log(`✓ dry-run 组装完成：${stage}`)
  console.log('  审计通过；确认无误后重跑并加 --apply 才会替换 resfile/opencode。')
  rmSync(stage, { recursive: true, force: true })
  process.exit(0)
}

// ── apply：备份 → 替换 → 失败回滚 ───────────────────────────────────────────
mkdirSync(path.dirname(out), { recursive: true })
const backup = out + '.collect-backup'
rmSync(backup, { recursive: true, force: true })
let hadBackup = false
if (existsSync(out)) {
  renameSync(out, backup)
  hadBackup = true
}
try {
  renameSync(stage, out)
} catch (error) {
  rmSync(out, { recursive: true, force: true })
  if (hadBackup) renameSync(backup, out)
  console.error(`✗ 替换 resfile 失败，已回滚：${String(error)}`)
  rmSync(stage, { recursive: true, force: true })
  process.exit(1)
}
rmSync(backup, { recursive: true, force: true })

console.log(`✓ 投放完成：${manifest.totals.count} 个文件 / ${(manifest.totals.bytes / 1048576).toFixed(1)} MB → ${out}`)
console.log(`✓ 清单：${path.join(out, 'manifest.sha256')}（JSON，schema=1）`)
