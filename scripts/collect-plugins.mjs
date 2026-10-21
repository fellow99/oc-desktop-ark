#!/usr/bin/env node
/**
 * 108-git-plugin：把 `plugins/oc-plugin-git` 投放进载荷目录，并在**构建期**物化第三方依赖。
 *
 * 为什么要在构建期物化（规格 FR-108-041 / FR-108-042）：
 * 设备侧不能 `npm install`（没有 npm、没有网络假设、L1 只允许本地），插件必须在包内自带
 * `node_modules/`。而平台没有软链（A4）⇒ 只能整棵 copy。
 *
 * 为什么有工程内缓存（plan §6.5）：`npm install` 每次都要走网络，把已装好的一份按 pin 缓存到
 * `.cache/git-plugin-runtime/<pin>/node_modules`，重复构建直接复用；`--force` 才重建。
 *
 * 断言（失败即抛错，绝不静默产出空目录）：
 *   ① 依赖版本 = pin（isomorphic-git 精确版本、diff 主版本）；
 *   ② 传输入口 `isomorphic-git/http/node` 可解析；
 *   ③ 包数 = plan 记录的 56；总体积 ≤ 12 MB（NFR-108-002）；
 *   ④ 无 `.node` / `.so`（FR-108-001：不依赖原生模块）；
 *   ⑤ 无符号链接（A4：平台无 symlink）。
 *
 * 用法：
 *   node scripts/collect-plugins.mjs               # 物化 + 投放 + 断言 + 写清单
 *   node scripts/collect-plugins.mjs --check-only   # 只做静态断言（不联网、不写盘）
 *   node scripts/collect-plugins.mjs --force        # 忽略缓存重建依赖
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginSrc = path.join(root, 'plugins/oc-plugin-git')
const outDir = path.join(root, 'entry/src/main/resources/resfile/opencode/plugins/oc-plugin-git')
const cacheDir = path.join(root, '.cache/git-plugin-runtime')

/** 依赖 pin（与 `plugins/oc-plugin-git/lib/runtime.js` 的断言一致，双保险）。 */
export const PINS = {
  isomorphicGit: '1.44.2',
  diff: '9.0.0',
  diffMajor: 9,
  /** plan §3 R12：宿主实测 56 包 / 8,005,075 B */
  packages: 56,
  maxBytes: 12 * 1024 * 1024,
}

const CHECK_ONLY = process.argv.includes('--check-only')
const FORCE = process.argv.includes('--force')

function bytesOf(dir) {
  let total = 0
  let count = 0
  let packages = 0
  const native = []
  const symlinks = []
  function walk(current, rel) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) {
        symlinks.push(relPath)
        continue
      }
      if (entry.isDirectory()) {
        /* 顶层 `node_modules/<pkg>` 记一个包；`@scope/<pkg>` 记它下面的那个包，`@scope` 目录本身不算。 */
        if (entry.name.startsWith('.')) {
          /* npm 的 `.bin` / `.package-lock.json` 不是依赖包，也不进包体（见下方剔除） */
        } else if (rel === 'node_modules') { if (!entry.name.startsWith('@')) packages += 1 }
        else if (rel.startsWith('node_modules/@') && rel.split('/').length === 2) packages += 1
        walk(abs, relPath)
        continue
      }
      if (/\.(node|so)$/i.test(entry.name)) native.push(relPath)
      total += statSync(abs).size
      count += 1
    }
  }
  walk(dir, '')
  return { total, count, packages, native, symlinks }
}

/** 递归打包成「路径+大小+sha256」清单，用于幂等与审计。 */
function manifestOf(dir) {
  const files = []
  function walk(current, rel) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(abs, relPath)
      else if (!entry.isSymbolicLink()) {
        const buf = readFileSync(abs)
        files.push({ path: relPath, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') })
      }
    }
  }
  walk(dir, '')
  files.sort((a, b) => (a.path < b.path ? -1 : 1))
  const digest = createHash('sha256')
  for (const f of files) digest.update(`${f.path}\0${f.bytes}\0${f.sha256}\n`)
  return { files, digest: digest.digest('hex'), count: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) }
}

/** 缓存里的依赖是否命中 pin。 */
function cacheHit() {
  const igPkg = path.join(cacheDir, 'node_modules/isomorphic-git/package.json')
  const diffPkg = path.join(cacheDir, 'node_modules/diff/package.json')
  if (!existsSync(igPkg) || !existsSync(diffPkg)) return false
  try {
    const ig = JSON.parse(readFileSync(igPkg, 'utf8'))
    const df = JSON.parse(readFileSync(diffPkg, 'utf8'))
    return ig.version === PINS.isomorphicGit && Number.parseInt(df.version, 10) === PINS.diffMajor
  } catch {
    return false
  }
}

/** 从 npm registry 安装到缓存目录（构建期唯一联网点）。 */
function installDeps() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'oc-git-runtime-'))
  console.log(`→ 物化依赖：isomorphic-git@${PINS.isomorphicGit} + diff@${PINS.diff}（npm install → ${tmp}）`)
  writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
    name: 'oc-git-runtime', private: true, version: '0.0.0',
    dependencies: { 'isomorphic-git': PINS.isomorphicGit, diff: PINS.diff },
  }, null, 2))
  try {
    execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'],
      { cwd: tmp, stdio: 'inherit', shell: process.platform === 'win32' })
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true })
    throw new Error(`依赖物化失败（npm install）：${error && error.message ? error.message : error}`)
  }
  const staged = path.join(tmp, 'node_modules')
  if (!existsSync(staged)) {
    rmSync(tmp, { recursive: true, force: true })
    throw new Error('npm install 未产出 node_modules（拒绝静默产出空目录）')
  }
  rmSync(cacheDir, { recursive: true, force: true })
  mkdirSync(cacheDir, { recursive: true })
  cpSync(staged, path.join(cacheDir, 'node_modules'), { recursive: true })
  rmSync(tmp, { recursive: true, force: true })
  console.log(`✓ 依赖已缓存：${path.join(cacheDir, 'node_modules')}`)
}

function assertPluginSource() {
  if (!existsSync(path.join(pluginSrc, 'index.js'))) {
    throw new Error(`插件源缺失：${pluginSrc}/index.js`)
  }
  const pkg = JSON.parse(readFileSync(path.join(pluginSrc, 'package.json'), 'utf8'))
  if (pkg.type !== 'module') throw new Error('插件 package.json 必须 type=module（上游用真实 ESM import 装载）')
  for (const [name, version] of Object.entries({ 'isomorphic-git': PINS.isomorphicGit, diff: PINS.diff })) {
    if (!pkg.dependencies || pkg.dependencies[name] !== version) {
      throw new Error(`插件 package.json 依赖 pin 不符：${name} 期望 ${version}，实际 ${pkg.dependencies && pkg.dependencies[name]}`)
    }
  }
  /* 21 个工具 + 名称表（构建期静态断言，FR-108-002） */
  const toolsIndex = readFileSync(path.join(pluginSrc, 'lib/tools/index.js'), 'utf8')
  const expected = [
    'git_init', 'git_clone', 'git_status', 'git_diff', 'git_log', 'git_show', 'git_add', 'git_commit',
    'git_branch', 'git_checkout', 'git_reset', 'git_merge', 'git_cherry_pick', 'git_revert', 'git_stash',
    'git_tag', 'git_remote', 'git_fetch', 'git_pull', 'git_push', 'git_config',
  ]
  for (const name of expected) {
    if (!toolsIndex.includes(`"${name}"`) && !toolsIndex.includes(`'${name}'`)) {
      throw new Error(`工具表缺少 ${name}（FR-108-002：注册且仅注册 21 个）`)
    }
  }
  /* 源码准入：无子进程、无原生模块（FR-108-001） */
  const banned = [/child_process/, /\bspawnSync?\b/, /\bexecFileSync?\b/, /require\(["']\.node["']\)/]
  const walkSource = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'tests' || entry.name === 'node_modules') continue
        walkSource(abs)
      } else if (/\.(c|m)?js$/.test(entry.name)) {
        const text = readFileSync(abs, 'utf8')
        for (const re of banned) {
          if (re.test(text)) throw new Error(`插件源码命中禁用面（${re}）：${path.relative(root, abs)}`)
        }
      }
    }
  }
  walkSource(pluginSrc)
  return pkg
}

/** 把插件源（不含 tests）与依赖投放进目标目录。
 *  @param {string} dest 目标目录（resfile 侧）
 *  @returns {{dir: string, manifest: object, stats: object}}
 */
export function materializeGitPlugin(dest = outDir) {
  assertPluginSource()
  if (!cacheHit()) {
    if (CHECK_ONLY) throw new Error('依赖缓存缺失（--check-only 模式不联网）；先跑一次不带 --check-only 的投放')
    installDeps()
  }
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  cpSync(path.join(pluginSrc, 'index.js'), path.join(dest, 'index.js'))
  cpSync(path.join(pluginSrc, 'package.json'), path.join(dest, 'package.json'))
  if (existsSync(path.join(pluginSrc, 'README.md'))) cpSync(path.join(pluginSrc, 'README.md'), path.join(dest, 'README.md'))
  cpSync(path.join(pluginSrc, 'lib'), path.join(dest, 'lib'), { recursive: true })
  cpSync(path.join(cacheDir, 'node_modules'), path.join(dest, 'node_modules'), { recursive: true })
  /* `.bin` 是 npm 的可执行垫片目录：设备侧用不到，且内含 exec 脚本 ⇒ 一律剔除。 */
  rmSync(path.join(dest, 'node_modules/.bin'), { recursive: true, force: true })

  /* ---------------- 断言（失败即抛错） ---------------- */
  const igPkg = JSON.parse(readFileSync(path.join(dest, 'node_modules/isomorphic-git/package.json'), 'utf8'))
  if (igPkg.version !== PINS.isomorphicGit) {
    throw new Error(`isomorphic-git 版本不符：期望 ${PINS.isomorphicGit}，实际 ${igPkg.version}`)
  }
  const diffPkg = JSON.parse(readFileSync(path.join(dest, 'node_modules/diff/package.json'), 'utf8'))
  if (Number.parseInt(diffPkg.version, 10) !== PINS.diffMajor) {
    throw new Error(`diff 主版本不符：期望 ${PINS.diffMajor}.x，实际 ${diffPkg.version}`)
  }
  const transport = path.join(dest, 'node_modules/isomorphic-git/http/node/index.js')
  const transportMjs = path.join(dest, 'node_modules/isomorphic-git/http/node/index.cjs')
  if (!existsSync(transport) && !existsSync(transportMjs)) {
    throw new Error('缺少 HTTPS 传输入口 isomorphic-git/http/node（克隆/推送会不可用）')
  }
  const stats = bytesOf(dest)
  if (stats.packages !== PINS.packages) {
    throw new Error(`依赖包数不符：期望 ${PINS.packages}，实际 ${stats.packages}（依赖树变了 ⇒ 复核 plan §3 R12）`)
  }
  if (stats.total > PINS.maxBytes) {
    throw new Error(`插件体积超限：${stats.total} B > ${PINS.maxBytes} B（NFR-108-002）`)
  }
  if (stats.native.length > 0) throw new Error(`插件含原生库（禁止）：${stats.native.join(', ')}`)
  if (stats.symlinks.length > 0) throw new Error(`插件含符号链接（平台不支持）：${stats.symlinks.join(', ')}`)

  const manifest = manifestOf(dest)
  writeFileSync(path.join(dest, 'materialize.json'), JSON.stringify({
    schema: 1,
    plugin: 'oc-plugin-git',
    isomorphicGit: PINS.isomorphicGit,
    diff: PINS.diff,
    packages: stats.packages,
    files: manifest.count,
    bytes: manifest.bytes,
    digest: manifest.digest,
    builtAt: Date.now(),
  }, null, 2) + '\n')
  return { dir: dest, manifest, stats }
}

function main() {
  if (CHECK_ONLY) {
    assertPluginSource()
    console.log('✓ --check-only：插件源静态断言通过（21 工具 / 依赖 pin / 无子进程 / 无原生模块）')
    return
  }
  if (FORCE) rmSync(cacheDir, { recursive: true, force: true })
  const started = Date.now()
  const { stats, manifest } = materializeGitPlugin(outDir)
  console.log(`✓ 投放 oc-plugin-git：${stats.count} 文件 / ${stats.packages} 包 /`
    + ` ${(stats.total / 1048576).toFixed(2)} MB（${Date.now() - started} ms）`)
  console.log(`  依赖：isomorphic-git@${PINS.isomorphicGit} + diff@${PINS.diff}｜digest=${manifest.digest.slice(0, 16)}…`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
