#!/usr/bin/env node
/**
 * verify-git-plugin.mjs —— 108-git-plugin 的**宿主侧门禁**（不联网、不需要设备）。
 *
 * 四段：
 *   ① 语法：插件本体（index.js + lib/**）逐个 `node --check`；
 *   ② 静态契约：21 个工具名、RPC 四个方法、definition 形状（`events` + 每方法 `input/output`）；
 *   ③ 装配冒烟：用**桩上下文**跑一遍 `setup()`，断言 21 个工具 + VCS provider + RPC 都注册成功；
 *   ④ 离线闭环：在临时目录用插件自己的工具跑 init → add → commit → status → log → diff。
 *
 * 为什么要在临时目录跑：插件源码目录**不该**长期携带 `node_modules`（那是构建产物）。
 * 门禁需要 `isomorphic-git` / `diff` 时，从「已物化的 resfile」或工程缓存复制一份到临时目录再用。
 *
 * 用法：
 *   node scripts/verify-git-plugin.mjs            # 全量（缺依赖时明确失败，不静默跳过）
 *   node scripts/verify-git-plugin.mjs --pure     # 只跑 ①②（无第三方依赖）
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = path.join(root, 'plugins/oc-plugin-git')
const materializedDir = path.join(root, 'entry/src/main/resources/resfile/opencode/plugins/oc-plugin-git')
const cacheModules = path.join(root, '.cache/git-plugin-runtime/node_modules')
const PURE = process.argv.includes('--pure')

const EXPECTED_TOOLS = [
  'git_init', 'git_clone', 'git_status', 'git_diff', 'git_log', 'git_show', 'git_add', 'git_commit',
  'git_branch', 'git_checkout', 'git_reset', 'git_merge', 'git_cherry_pick', 'git_revert', 'git_stash',
  'git_tag', 'git_remote', 'git_fetch', 'git_pull', 'git_push', 'git_config',
]
const EXPECTED_RPC = ['credentials.describe', 'credentials.list', 'credentials.save', 'credentials.remove']

let failures = 0
function ok(message) { console.log(`✓ ${message}`) }
function bad(message, detail) {
  failures += 1
  console.error(`✗ ${message}${detail ? '\n  ' + detail : ''}`)
}

/* ---------------------------------------------------------------- ① 语法 */
function checkSyntax() {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'tests') continue
        walk(abs)
      } else if (entry.name.endsWith('.js')) files.push(abs)
    }
  }
  walk(pluginDir)
  for (const file of files) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    if (r.status !== 0) bad(`语法检查失败：${path.relative(root, file)}`, (r.stderr || '').slice(0, 300))
  }
  ok(`语法：${files.length} 个文件通过 node --check`)
}

/* ------------------------------------------------------------ ② 静态契约 */
async function checkContract() {
  const mod = await import(pathToFileURL(path.join(pluginDir, 'index.js')).href)
  const names = mod.TOOL_NAMES ?? []
  const missing = EXPECTED_TOOLS.filter((t) => !names.includes(t))
  const extra = names.filter((t) => !EXPECTED_TOOLS.includes(t))
  if (missing.length === 0 && extra.length === 0 && names.length === 21) ok('工具表：21 个且与规格逐一相符')
  else bad(`工具表不符：缺 ${missing.join(',') || '无'}｜多 ${extra.join(',') || '无'}｜共 ${names.length}`)

  const def = mod.__definitionForTest ?? null
  if (def === null) {
    /* 允许没有测试钩子：退化为文本断言（definition 必须是字面量对象，见 index.js） */
    const text = readFileSync(path.join(pluginDir, 'index.js'), 'utf8')
    const hasEvents = /events:\s*\{\s*\}/.test(text)
    const hasMethods = EXPECTED_RPC.every((m) => text.includes(`"${m}"`))
    const hasSchemas = (text.match(/input:\s*\{/g) ?? []).length >= 4 && (text.match(/output:/g) ?? []).length >= 4
    if (hasEvents && hasMethods && hasSchemas) ok('RPC 定义形状：events + 4 方法 + input/output schema')
    else bad('RPC 定义形状不符（缺 events / 方法 / schema）')
  }
}

/* --------------------------------------------------------- ③ 装配冒烟 */
async function checkSetup() {
  const mod = await import(pathToFileURL(path.join(pluginDir, 'index.js')).href)
  const tools = new Map()
  const vcs = []
  const rpc = []
  const context = {
    location: { directory: process.cwd(), project: { directory: process.cwd() } },
    tool: {
      transform: async (fn) => {
        fn({ add: (t) => tools.set(t.name, t), get: (n) => tools.get(n), errors: undefined })
      },
    },
    vcs: { transform: async (fn) => { fn({ add: (p) => vcs.push(p) }) } },
    rpc: {
      register: async (definition, handlers) => {
        rpc.push({ definition, handlers })
        return { dispose() {} }
      },
    },
  }
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('setup() 超时 20 s（疑似 await 卡住）')), 20000))
  await Promise.race([mod.default.setup(context), timeout])
  if (tools.size === 21) ok('装配：21 个工具注册成功')
  else bad(`装配：工具注册数 ${tools.size} ≠ 21`)
  if (vcs.length === 1 && vcs[0].id === 'git') ok('装配：VCS provider 覆盖已注册（id=git）')
  else bad(`装配：VCS provider 未注册或 id 不符（${vcs.map((v) => v.id).join(',') || '无'}）`)
  const entry = rpc[0]
  if (entry && entry.definition.events && EXPECTED_RPC.every((m) => entry.definition.methods[m]?.input)) {
    ok('装配：RPC 定义可被上游接受（events + 每方法 input/output）')
  } else {
    bad('装配：RPC 定义形状异常')
  }
  if (entry && Object.values(entry.handlers).every((h) => h.constructor.name === 'AsyncFunction')) {
    ok('装配：RPC handler 全为 async（上游 promise 方言要求）')
  } else {
    bad('装配：存在非 async 的 RPC handler')
  }
}

/* ------------------------------------------------------------ ④ 离线闭环 */
async function checkOfflineFlow() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'oc-git-gate-'))
  const work = path.join(tmp, 'work')
  try {
    /* 插件源码不含 node_modules ⇒ 复制一份「源码 + 已物化依赖」到临时目录再跑 */
    const sandbox = path.join(tmp, 'plugin')
    mkdirSync(sandbox, { recursive: true })
    cpSync(path.join(pluginDir, 'index.js'), path.join(sandbox, 'index.js'))
    cpSync(path.join(pluginDir, 'package.json'), path.join(sandbox, 'package.json'))
    cpSync(path.join(pluginDir, 'lib'), path.join(sandbox, 'lib'), { recursive: true })
    const modules = existsSync(path.join(materializedDir, 'node_modules'))
      ? path.join(materializedDir, 'node_modules')
      : cacheModules
    if (!existsSync(modules)) {
      bad('离线闭环：找不到已物化的 node_modules（先跑 node scripts/collect-plugins.mjs）')
      return
    }
    cpSync(modules, path.join(sandbox, 'node_modules'), { recursive: true })

    mkdirSync(work, { recursive: true })
    writeFileSync(path.join(work, 'hello.txt'), 'hello-git\n')

    const mod = await import(pathToFileURL(path.join(sandbox, 'index.js')).href + `?t=${Date.now()}`)
    const tools = new Map()
    await mod.default.setup({
      location: { directory: work, project: { directory: work } },
      tool: { transform: async (fn) => { fn({ add: (t) => tools.set(t.name, t), get: (n) => tools.get(n) }) } },
      vcs: { transform: async () => {} },
      rpc: { register: async () => ({ dispose() {} }) },
    })
    const call = async (name, input) => {
      const tool = tools.get(name)
      if (!tool) throw new Error(`工具缺失：${name}`)
      const out = await tool.execute(input, { sessionID: 'gate', messageID: 'gate', agent: 'build', signal: undefined, cwd: work })
      return typeof out === 'string' ? out : (out?.content ?? JSON.stringify(out))
    }
    /* 不传 `dir`：缺省 = 会话目录（execute 上下文的 cwd）。传绝对路径会撞上 Windows 8.3 短名
     * （ADMINI~1 vs Administrator）导致围栏误判 —— 这正是围栏该拦的形状，但门禁要测的是主链路。 */
    const steps = [
      ['git_init', {}, /initiali[sz]ed|already/i],
      ['git_add', { files: ['hello.txt'] }, /hello\.txt/],
      ['git_commit', { message: 'gate: 首次提交', author: { name: 'gate', email: 'gate@example.invalid' } }, /gate/],
      ['git_status', {}, /No changes|clean|无改动/i],
      ['git_log', { limit: 5 }, /gate: 首次提交/],
      ['git_diff', {}, /./],
    ]
    for (const [name, input, re] of steps) {
      const text = await call(name, input)
      if (re.test(text)) ok(`离线闭环：${name} ✓`)
      else bad(`离线闭环：${name} 输出不符预期`, text.slice(0, 300))
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

async function main() {
  checkSyntax()
  await checkContract()
  if (PURE) {
    console.log('\n--pure：跳过装配冒烟与离线闭环')
  } else {
    await checkSetup()
    await checkOfflineFlow()
  }
  if (failures > 0) {
    console.error(`\n✗ 门禁失败：${failures} 项`)
    process.exit(1)
  }
  console.log('\n✓ 108-git-plugin 门禁通过')
}

await main()
