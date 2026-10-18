#!/usr/bin/env node
/**
 * 把上游产物 + 库引导器 + 本工程宿主脚本投放进 resfile，并生成 SHA-256 清单。
 *
 * 纪律：
 *   · 只清**生成物**，保留入库的 README.md（否则每次 collect 都制造一条删除）；
 *   · 缺失 `bootstrap.js` 直接失败（产出必然起不来的载荷没有意义）；
 *   · 裁剪只删**平台专属二进制子包**，保留纯 JS 入口（避免误删运行必需文件）；
 *   · 清单是 JSON（schema/baseline/form/node/target/files/totals），供门禁断言。
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

// 保留入库文件
const keep = new Map()
for (const name of ['README.md', 'manifest.sha256']) {
  const p = path.join(out, name)
  if (existsSync(p)) keep.set(name, readFileSync(p))
}
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const [name, buf] of keep) {
  if (name === 'README.md') writeFileSync(path.join(out, name), buf)
}

// 1) 上游产物
cpSync(path.join(distNode, 'opencode.mjs'), path.join(out, 'opencode.mjs'))
if (existsSync(path.join(distNode, 'assets'))) {
  cpSync(path.join(distNode, 'assets'), path.join(out, 'assets'), { recursive: true })
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
    const rel = path.relative(path.join(out, 'assets'), abs).split(path.sep).join('/')
    if (entry.isDirectory()) {
      if (pruneDirs.some((re) => re.test(rel))) {
        rmSync(abs, { recursive: true, force: true })
        removed.push(rel)
      } else {
        prune(abs)
      }
    }
  }
}
prune(path.join(out, 'assets'))

// 3) 库引导器 + 宿主桥参考实现（host.js 可选）
cpSync(path.join(bridgePayload, 'bootstrap.js'), path.join(out, 'bootstrap.js'))
if (existsSync(path.join(bridgePayload, 'host.js'))) {
  cpSync(path.join(bridgePayload, 'host.js'), path.join(out, 'host.js'))
}

// 4) 本工程宿主脚本
cpSync(path.join(root, 'payload/opencode-server.js'), path.join(out, 'opencode-server.js'))
cpSync(path.join(root, 'payload/lib'), path.join(out, 'lib'), { recursive: true })

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
walk(out, '')
const entries = files
  .filter((f) => f.rel !== 'manifest.sha256' && f.rel !== 'README.md')
  .sort((a, b) => a.rel.localeCompare(b.rel))
  .map((f) => {
    const buf = readFileSync(f.abs)
    return {
      path: f.rel,
      sha256: createHash('sha256').update(buf).digest('hex'),
      size: statSync(f.abs).size,
      kind: f.rel === 'opencode.mjs' ? 'entry' : f.rel === 'assets/app-archive.bin' ? 'ui-archive' : 'asset',
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
writeFileSync(path.join(out, 'manifest.sha256'), JSON.stringify(manifest, null, 2) + '\n')

function safeBunVersion() {
  try {
    const bin = process.env.BUN_BIN || 'bun'
    const shell = process.platform === 'win32' && !process.env.BUN_BIN
    return execFileSync(bin, ['--version'], { encoding: 'utf8', shell }).trim()
  } catch {
    return 'unavailable'
  }
}

console.log(`✓ 投放完成：${entries.length} 个文件 / ${(manifest.totals.bytes / 1048576).toFixed(1)} MB → ${out}`)
console.log(`✓ 裁剪 ${removed.length} 个平台专属子包${removed.length ? '：' + removed.join(', ') : ''}`)
console.log(`✓ 清单：${path.join(out, 'manifest.sha256')}（JSON，schema=1）`)
