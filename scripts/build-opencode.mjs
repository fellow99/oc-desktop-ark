#!/usr/bin/env node
/**
 * 构建上游 opencode 的 Node 产物（bundle-only）。
 *
 * 前置：`node scripts/apply-patches.mjs` 已应用补丁（本脚本**不**自动打补丁，
 * 以免绕过基线/工作树守卫 —— 守卫在 apply-patches 里）。
 *
 * 产物：../opencode/packages/cli/dist-node/{opencode.mjs, assets/**}
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.resolve(root, process.env.OPENCODE_DIR ?? '../opencode')
const target = process.env.OPENCODE_TARGET ?? 'linux-arm64'
const nodeTarget = process.env.OPENCODE_NODE_TARGET ?? 'node24'
const bundleOnly = !process.argv.includes('--with-sea')

function run(cmd, args, cwd) {
  console.log(`→ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env })
  if (r.status !== 0) {
    console.error(`✗ 命令失败（exit=${r.status}）：${cmd} ${args.join(' ')}`)
    process.exit(r.status ?? 1)
  }
}

if (!existsSync(path.join(repo, 'package.json'))) {
  console.error(`✗ 找不到上游仓库：${repo}（用 OPENCODE_DIR 指定）`)
  process.exit(2)
}

const flags = ['--bundle-only']
if (bundleOnly) flags.push('--target=' + target)

run('bun', ['install', '--os=*', '--cpu=*'], repo)
run('bun', ['run', '--cwd', 'packages/cli', 'script/build-node.ts', ...flags], repo)

const out = path.join(repo, 'packages/cli/dist-node')
if (!existsSync(path.join(out, 'opencode.mjs'))) {
  console.error(`✗ 未产出 opencode.mjs：${out}`)
  process.exit(1)
}
console.log(`✓ 产物：${out}（OPENCODE_NODE_TARGET=${nodeTarget}；下一步 node scripts/collect-opencode.mjs）`)
