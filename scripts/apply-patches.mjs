#!/usr/bin/env node
/**
 * 幂等补丁器 —— oc-desktop-ark / 工程规划 §9、patches/v2.0.26/README.md
 *
 * 解决的问题：`../opencode` 是 **oc-desktop-hos 与本工程共用** 的 submodule，
 * 两个工程各自有一套补丁。若不设守卫，「另一个工程留下的脏工作树」会被当成
 * 「本工程已打补丁」，或者直接 `git apply` 失败在半路，留下**半应用**状态。
 *
 * 因此本脚本的规则是：
 *   ① HEAD 必须是锁定基线（默认 9b4ec5714d，可用 EXPECTED_BASELINE 覆盖）；
 *   ② 工作树必须干净（`git status --porcelain` 为空），否则拒绝执行；
 *      确实要丢弃本地改动时显式 `--reset --yes`（先 `git clean -nd` 打印将删除项）；
 *   ③ 每条补丁的幂等判据是 `git apply --reverse --check` 成功 ⇒ 已应用，跳过；
 *   ④ 应用后再次 `--reverse --check`，不通过即失败（不留半应用状态）。
 *
 * 用法：
 *   node scripts/apply-patches.mjs                 # 幂等应用全部
 *   node scripts/apply-patches.mjs --check         # 只报告状态，不改文件
 *   node scripts/apply-patches.mjs --list          # 列出补丁
 *   node scripts/apply-patches.mjs --only 0001     # 只处理匹配前缀的一条
 *   node scripts/apply-patches.mjs --reset --yes   # 还原 ../opencode 工作树（危险）
 *   node scripts/apply-patches.mjs --repo <path>   # 覆盖仓库路径（默认 ../opencode）
 *
 * 退出码：0 成功；1 补丁失败；2 前置条件不满足（基线/工作树/参数）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const patchDir = path.join(root, 'patches', 'v2.0.26')
const EXPECTED = (process.env.EXPECTED_BASELINE ?? '9b4ec5714d').trim()
const args = process.argv.slice(2)
const has = (name) => args.includes(name)
const valueOf = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const repo = path.resolve(root, valueOf('--repo') ?? '../opencode')
const checkOnly = has('--check')
const listOnly = has('--list')
const only = valueOf('--only')

function fail(code, message) {
  console.error(`✗ ${message}`)
  process.exit(code)
}

function git(...argv) {
  const result = spawnSync('git', ['-C', repo, ...argv], { encoding: 'utf8' })
  return result
}

function gitOrFail(...argv) {
  const r = git(...argv)
  if (r.status !== 0) {
    const detail = (r.stderr || r.stdout || '').trim().split('\n').slice(0, 6).join('\n  ')
    fail(1, `git ${argv.join(' ')} 失败：\n  ${detail}`)
  }
  return (r.stdout || '').trim()
}

// —— 0. 参数与目录 ——
if (!existsSync(path.join(repo, '.git'))) fail(2, `不是 git 仓库：${repo}（用 --repo 指定）`)
if (!existsSync(patchDir)) fail(2, `补丁目录不存在：${patchDir}`)

const patches = readdirSync(patchDir)
  .filter((name) => name.endsWith('.patch'))
  .sort()
  .filter((name) => (only === undefined ? true : name.startsWith(only)))

if (patches.length === 0) fail(2, `没有匹配的补丁${only === undefined ? '' : `（--only ${only}）`}`)

if (listOnly) {
  for (const name of patches) console.log(`- ${name}`)
  process.exit(0)
}

// —— 1. 基线守卫 ——
const head = gitOrFail('rev-parse', '--short', 'HEAD')
if (!head.startsWith(EXPECTED)) {
  fail(2, `HEAD=${head} 与锁定基线 ${EXPECTED} 不符。\n  换基线必须新建 patches/<新 tag>/（工程规划 §9），不要就地改。`)
}
console.log(`✓ 基线 HEAD=${head}（${repo}）`)

// —— 2. 工作树守卫（因为 ../opencode 是两工程共用）——
let dirty = gitOrFail('status', '--porcelain')
if (dirty.length > 0) {
  if (has('--reset')) {
    if (!has('--yes')) {
      console.error('将要删除/还原的内容（git clean -nd）：')
      console.error(gitOrFail('clean', '-nd', '--', 'packages') || '  （无未跟踪文件）')
      fail(2, '--reset 需要同时给 --yes 才执行（避免误删另一半工程的改动）')
    }
    gitOrFail('checkout', '--', '.')
    gitOrFail('clean', '-fd', '--', 'packages')
    dirty = gitOrFail('status', '--porcelain')
    if (dirty.length > 0) fail(2, `--reset 后工作树仍不干净：\n  ${dirty.split('\n').slice(0, 8).join('\n  ')}`)
    console.log('✓ 已还原工作树（--reset --yes）')
  } else {
    const shown = dirty.split('\n').slice(0, 8).join('\n  ')
    fail(
      2,
      `../opencode 工作树不干净（可能是另一个工程打过补丁）：\n  ${shown}\n` +
        '  → 先提交/清理，或在确认可丢弃时执行：node scripts/apply-patches.mjs --reset --yes',
    )
  }
}
console.log('✓ 工作树干净')

// —— 3. 逐条处理 ——
const applied = []
const skipped = []
const failed = []

for (const name of patches) {
  const file = path.join(patchDir, name)
  const reverse = git('apply', '--reverse', '--check', file)
  if (reverse.status === 0) {
    skipped.push(name)
    console.log(`= ${name}：已应用（reverse-check 通过），跳过`)
    continue
  }
  if (checkOnly) {
    const forward = git('apply', '--check', file)
    if (forward.status === 0) {
      applied.push(name)
      console.log(`+ ${name}：未应用，可干净应用`)
    } else {
      failed.push(name)
      const detail = (forward.stderr || '').trim().split('\n').slice(0, 4).join('\n    ')
      console.log(`! ${name}：未应用且**不能干净应用**（上下文冲突）\n    ${detail}`)
    }
    continue
  }
  const forward = git('apply', '--check', file)
  if (forward.status !== 0) {
    failed.push(name)
    const detail = (forward.stderr || '').trim().split('\n').slice(0, 6).join('\n    ')
    console.log(`! ${name}：不能干净应用（上下文冲突）\n    ${detail}`)
    continue
  }
  gitOrFail('apply', file)
  // 不留半应用状态：应用后必须能反向校验
  const verify = git('apply', '--reverse', '--check', file)
  if (verify.status !== 0) {
    failed.push(name)
    console.log(`! ${name}：应用后反向校验失败（补丁链不一致）`)
    continue
  }
  applied.push(name)
  console.log(`+ ${name}：已应用`)
}

// —— 4. 汇总 ——
const label = checkOnly ? '（--check：未修改任何文件）' : ''
const doneLabel = checkOnly ? '可应用' : '已应用'
console.log(
  `\n汇总${label}：${doneLabel} ${applied.length} / 已跳过 ${skipped.length} / 失败 ${failed.length}` +
    (applied.length > 0 ? `\n  ${doneLabel}：${applied.join(', ')}` : '') +
    (failed.length > 0 ? `\n  失败：${failed.join(', ')}` : ''),
)

if (failed.length > 0) process.exit(1)
