#!/usr/bin/env node
/**
 * verify-runtime.mjs —— 运行时锁值校验（FR-101-004，ohpm 双包形态）。
 *
 * 背景：运行时经 ohpm registry 双包接入（@fellow99/node-bridge + @fellow99/node-runtime），
 * libnode.so / libc++_shared.so 由 runtime 包随 assembleHap 合并进 HAP，宿主**不再手工投放**。
 * 本脚本是**唯一**的锁值校验实现：在 ohpm install 之后、assembleHap 之前跑，
 * 断言「安装到 oh_modules 的运行时包内容」与 `runtime.lock.json` 锁值逐字一致。
 *
 * 校验项（任一不符 ⇒ 退出码 2，构建不得继续）：
 *   ① runtime.lock.json 存在且可解析；
 *   ② oh_modules/@fellow99/node-runtime 存在，包版本 = lock.runtime.version；
 *   ③ 其 libs/arm64-v8a/libnode.so 的体积 + SHA-256 = lock.runtime.libnode 锁值；
 *   ④ 其 libs/arm64-v8a/libc++_shared.so 存在且非空；
 *   ⑤ oh_modules/@fellow99/node-bridge 存在，包版本 = lock.bridge.version；
 *   ⑥ entry/libs/arm64-v8a/ 下**不得**出现 libnode.so / libc++_shared.so
 *      （双来源守卫：运行时包与手工投放两种来源择一，同放会在 HAP 内产生同名冲突）。
 *
 * 幂等：纯只读校验，不写任何文件；重复执行结果一致。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lockPath = path.join(root, 'runtime.lock.json')
const ohModules = path.join(root, 'oh_modules')
const entryLibs = path.join(root, 'entry/libs/arm64-v8a')

function fail(messages) {
  for (const m of messages) console.error(`✗ ${m}`)
  console.error('\n处置：换正确的 @fellow99/node-runtime 包（ohpm install 重装），')
  console.error('或确认上游 Node 运行时确实升级后，明确更新 runtime.lock.json 锁值再重试。')
  process.exit(2)
}

if (!existsSync(lockPath)) {
  fail([`缺少锁文件：${lockPath}（运行时唯一事实源，不得删除）`])
}
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))

const problems = []
const runtimePkg = path.join(ohModules, '@fellow99', 'node-runtime')
const bridgePkg = path.join(ohModules, '@fellow99', 'node-bridge')

/* 包存在性 + 版本一致性（oh-package.json5 由 hvigor 产出为单行 JSON；容错解析） */
function readPkgVersion(pkgDir) {
  const p = path.join(pkgDir, 'oh-package.json5')
  if (!existsSync(p)) return null
  const text = readFileSync(p, 'utf8')
  try {
    return JSON.parse(text).version ?? null
  } catch {
    const m = text.match(/"version"\s*:\s*"([^"]+)"/)
    return m ? m[1] : null
  }
}

if (!existsSync(runtimePkg)) {
  problems.push(`未找到运行时包：oh_modules/@fellow99/node-runtime（先跑 ohpm install）`)
} else {
  const v = readPkgVersion(runtimePkg)
  if (v !== lock.runtime.version) {
    problems.push(`runtime 包版本不符：期望 ${lock.runtime.version}，实测 ${v ?? '（无法解析）'}`)
  }
}

/* libnode.so 体积 + SHA-256 锁值 */
const libnodeRel = lock.runtime.libnode.file // libs/arm64-v8a/libnode.so
const libnode = path.join(runtimePkg, ...libnodeRel.split('/'))
if (!existsSync(libnode)) {
  problems.push(`运行时包内缺 ${libnodeRel}（包内容不完整，重装 @fellow99/node-runtime）`)
} else {
  const buf = readFileSync(libnode)
  const size = buf.length
  const sha = createHash('sha256').update(buf).digest('hex')
  if (size !== lock.runtime.libnode.size) {
    problems.push(`libnode.so 体积不符：期望 ${lock.runtime.libnode.size} B，实测 ${size} B`)
  }
  if (sha !== lock.runtime.libnode.sha256) {
    problems.push(`libnode.so SHA-256 不符：期望 ${lock.runtime.libnode.sha256}，实测 ${sha}`)
  }
}

/* libc++_shared.so 存在且非空 */
const libcxx = path.join(runtimePkg, 'libs', 'arm64-v8a', lock.runtime.libcxx)
if (!existsSync(libcxx) || statSync(libcxx).size === 0) {
  problems.push(`运行时包内缺非空的 libs/arm64-v8a/${lock.runtime.libcxx}`)
}

/* bridge 包存在性 + 版本 */
if (!existsSync(bridgePkg)) {
  problems.push(`未找到主包：oh_modules/@fellow99/node-bridge（先跑 ohpm install）`)
} else {
  const v = readPkgVersion(bridgePkg)
  if (v !== lock.bridge.version) {
    problems.push(`bridge 包版本不符：期望 ${lock.bridge.version}，实测 ${v ?? '（无法解析）'}`)
  }
}

/* 双来源守卫：entry/libs 下不得手工投放同名 .so */
for (const name of ['libnode.so', lock.runtime.libcxx]) {
  if (existsSync(path.join(entryLibs, name))) {
    problems.push(`entry/libs/arm64-v8a/${name} 不应存在（与运行时包双来源冲突；删除它，统一由 @fellow99/node-runtime 提供）`)
  }
}

if (problems.length > 0) fail(problems)

console.log(`✓ 运行时锁值校验全过：@fellow99/node-bridge@${lock.bridge.version} + @fellow99/node-runtime@${lock.runtime.version}`)
console.log(`  libnode.so：${lock.runtime.libnode.size} B / sha256=${lock.runtime.libnode.sha256.slice(0, 16)}…（= runtime.lock.json 锁值）`)
console.log(`  双来源守卫：entry/libs/arm64-v8a/ 无同名 .so ✅`)
