#!/usr/bin/env node
/**
 * 把上游产物 + 库引导器 + 本工程宿主脚本投放进 resfile，并生成 SHA-256 清单。
 *
 * 投放内容（路线 ①：只读直读）：
 *   resfile/opencode/{opencode.mjs, assets/**, bootstrap.js, host.js, opencode-server.js, lib/*}
 *   resfile/opencode/manifest.sha256（唯一入库的清单）
 *
 * 同时做两件裁剪：删除非本平台原生件与 `opencode-pty` 助手 ELF（设备侧不可执行）。
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.resolve(root, process.env.OPENCODE_DIR ?? '../opencode')
const distNode = path.join(repo, 'packages/cli/dist-node')
const bridgePayload = path.resolve(root, '../ohos-node-bridge/payload')
const out = path.join(root, 'entry/src/main/resources/resfile/opencode')

if (!existsSync(path.join(distNode, 'opencode.mjs'))) {
  console.error(`✗ 缺少产物：${distNode}/opencode.mjs（先跑 scripts/build-opencode.mjs）`)
  process.exit(2)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// 1) 上游产物
cpSync(path.join(distNode, 'opencode.mjs'), path.join(out, 'opencode.mjs'))
if (existsSync(path.join(distNode, 'assets'))) {
  cpSync(path.join(distNode, 'assets'), path.join(out, 'assets'), { recursive: true })
}

// 2) 裁剪：非 arm64 / 非 ohos 原生件与不可执行 ELF
const prune = ['opencode-pty', '@lydell', '@parcel', '@ff-labs', '@yuuang']
for (const name of prune) {
  const p = path.join(out, 'assets', name)
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true })
    console.log(`- 裁剪 assets/${name}`)
  }
}

// 3) 库引导器（scriptPath 指向它）+ 宿主桥参考实现
for (const file of ['bootstrap.js', 'host.js']) {
  const src = path.join(bridgePayload, file)
  if (existsSync(src)) {
    cpSync(src, path.join(out, file))
    console.log(`+ 库文件 ${file}`)
  } else {
    console.warn(`! 缺少库文件 ${src}（运行期会以「引导器缺失」失败）`)
  }
}

// 4) 本工程宿主脚本
cpSync(path.join(root, 'payload/opencode-server.js'), path.join(out, 'opencode-server.js'))
cpSync(path.join(root, 'payload/lib'), path.join(out, 'lib'), { recursive: true })
console.log('+ 宿主脚本 opencode-server.js + lib/')

// 5) 清单（相对路径 + sha256 + size）
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
const lines = files
  .filter((f) => f.rel !== 'manifest.sha256' && f.rel !== 'README.md')
  .sort((a, b) => a.rel.localeCompare(b.rel))
  .map((f) => {
    const buf = readFileSync(f.abs)
    const sha = createHash('sha256').update(buf).digest('hex')
    return `${sha}  ${String(statSync(f.abs).size).padStart(10)}  ${f.rel}`
  })
writeFileSync(path.join(out, 'manifest.sha256'), lines.join('\n') + '\n')

const total = files.reduce((n, f) => n + statSync(f.abs).size, 0)
console.log(`✓ 投放完成：${files.length} 个文件 / ${(total / 1024 / 1024).toFixed(1)} MB → ${out}`)
console.log(`✓ 清单：${path.join(out, 'manifest.sha256')}（${lines.length} 条）`)
