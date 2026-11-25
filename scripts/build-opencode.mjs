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
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.resolve(root, process.env.OPENCODE_DIR ?? '../opencode')
const target = process.env.OPENCODE_TARGET ?? 'linux-arm64'
const nodeTarget = (process.env.OPENCODE_NODE_TARGET ?? '').trim()
const bundleOnly = !process.argv.includes('--with-sea')

// AS-102-04：未显式指定 node24 即判失败（否则上游按默认 node26 产出，与设备运行时错位）
if (nodeTarget === '') {
  console.error('✗ 必须显式设置 OPENCODE_NODE_TARGET=node24（对齐 libnode v24.2.0 / ABI 137）')
  process.exit(2)
}

// Windows 上 bun 是 npm 的 .cmd 垫片（没有 bun.exe）：默认需经 shell；
// 提供 BUN_BIN（如本地 .cache/bun/bun-1.4.2/bun.exe）时直接执行。
const WIN = process.platform === 'win32'
const BUN = process.env.BUN_BIN || 'bun'
const useShell = WIN && !process.env.BUN_BIN

// 上游 packageManager 要求 bun ^1.4.4（v2.2.5 packageManager）：本机版本偏低时只告警，不静默
const bunProbe = spawnSync(BUN, ['--version'], { encoding: 'utf8', shell: useShell })
const bunVersion = bunProbe.status === 0 ? (bunProbe.stdout || '').trim() : ''
if (bunVersion === '') {
  console.error('✗ 未找到 bun（请安装 1.4.4，或用 PATH 指向 .cache/bun/bun-1.4.4）')
  process.exit(2)
}
const [bunMajor, bunMinor] = bunVersion.split('.').map((v) => Number.parseInt(v, 10))
if (bunMajor < 1 || (bunMajor === 1 && bunMinor < 4)) {
  console.warn(`⚠ 上游要求 bun ^1.4.4，本机 ${bunVersion}；产物可能与门禁/真机不一致（102 plan §1 已登记）`)
} else {
  console.log(`bun ${bunVersion}`)
}

function run(cmd, args, cwd, extraEnv = {}) {
  console.log(`→ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv }, shell: WIN })
  if (r.error && r.error.code === 'ENOENT') {
    console.error(`✗ 未找到 ${cmd}（请安装 bun 1.3+，或用 PATH 指向它）`)
    process.exit(2)
  }
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
// 上游 build-node.ts 只认 OPENCODE_TARGET 环境变量（`--target=` 从未被解析）。
// 必须显式注入：缺省时 `--bundle-only` 会退回**构建机**平台（Windows 上即 win32-x64），
// 产物里会带 win32 原生件而设备侧一个 linux-arm64 原生件都没有（review C1）。

const skipInstall = process.argv.includes('--skip-install')
if (!skipInstall) {
  run(BUN, ['install', '--os=*', '--cpu=*'], repo, { OPENCODE_NODE_TARGET: nodeTarget })
}
run(BUN, ['run', '--cwd', 'packages/cli', 'script/build-node.ts', ...flags], repo, {
  OPENCODE_NODE_TARGET: nodeTarget,
  OPENCODE_TARGET: target,
})

// 目标守卫（review C1）：产物 assets 里出现非目标平台的原生子包即失败，
// 避免「构建机平台悄悄顶替设备目标」这一类假绿。
const assetsDir = path.join(repo, 'packages/cli/dist-node/assets')
if (existsSync(assetsDir)) {
  const foreign = readdirSync(assetsDir, { recursive: true })
    .map((item) => String(item).split(path.sep).join("/"))
    .filter((item) => /-(win32|darwin)-/.test(item) && !item.includes("-ohos-"))
  if (foreign.length > 0) {
    console.error(`✗ 产物含非目标平台（${target}）原生件：${foreign.slice(0, 5).join(', ')}`)
    process.exit(1)
  }
}

const out = path.join(repo, 'packages/cli/dist-node')
if (!existsSync(path.join(out, 'opencode.mjs'))) {
  console.error(`✗ 未产出 opencode.mjs：${out}`)
  process.exit(1)
}
console.log(`✓ 产物：${out}（OPENCODE_NODE_TARGET=${nodeTarget}；下一步 node scripts/collect-opencode.mjs）`)
