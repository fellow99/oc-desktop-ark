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
import { execFileSync } from 'node:child_process'
import path from 'node:path'
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
  return { manifest, removed, jitlessAudit, pluginCopied }
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
} finally {
  // apply 成功后才把 stage 移交给 resfile；失败/dry-run 都清理临时目录
}
const { manifest, removed, jitlessAudit, pluginCopied } = result
const previous = readPreviousManifest()
const report = audit(manifest, previous, jitlessAudit)

console.log(`── collect 审计${APPLY ? '（--apply）' : '（dry-run；加 --apply 才写入 resfile）'} ──`)
console.log(`文件总数 ${manifest.totals.count} / ${(manifest.totals.bytes / 1048576).toFixed(1)} MB`)
console.log(`裁剪平台子包 ${removed.length} 个${removed.length ? '：' + removed.join(', ') : ''}`)
console.log(`jitless 兼容层：${report.jitlessCount} 个文件入库（另排除 selftest 项 ${jitlessAudit.skippedSelftest}）`)
console.log(`工作区选择器插件：${pluginCopied ? '已投放' : '⚠ 源缺失，未投放（不阻断）'}`)
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
