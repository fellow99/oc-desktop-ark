#!/usr/bin/env node
/**
 * host 门禁（无设备即可跑；工程规划 §7.3）。
 *
 * 判据（缺一不可）：
 *   ① 产物可加载并打印 `server listening on http://127.0.0.1:<port>`
 *   ② 带 Basic 的 `GET /api/info` 返回 200 且 `version` 非空
 *   ③ `GET /` 返回 HTML（含 UI 标记）
 *   ④ 不带凭据的 `GET /api/info` 返回 401
 *   ⑤ `GET /api/event`（SSE）能读到首个事件
 *
 * 用法：node scripts/smoke-node24.mjs [--keep]
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.resolve(root, process.env.OPENCODE_DIR ?? '../opencode')
const distNode = path.join(repo, 'packages/cli/dist-node')
const entry = path.join(distNode, 'opencode.mjs')
const keep = process.argv.includes('--keep')
const allowDrift = process.argv.includes('--allow-version-drift')

// 版本等价标注（FR-102-008）：设备是 v24.2.0，本机可能不同 —— 不静默宣称等价
const TARGET_NODE = 'v24.2.0'
const hostNode = process.version
const equivalent = /^v24\.2\./.test(hostNode)
console.log(`运行时：host=${hostNode} target=${TARGET_NODE} equivalent=${equivalent}`)
if (!equivalent && !allowDrift) {
  console.error(`✗ host Node ${hostNode} 与设备 ${TARGET_NODE} 不等价；`
    + '确需继续请加 --allow-version-drift（结论会标注 equivalent=false）')
  process.exit(3)
}

if (!existsSync(entry)) {
  console.error(`✗ 缺少产物：${entry}（先跑 scripts/build-opencode.mjs）`)
  process.exit(2)
}

/** `--version` / `--help` 自检（TC-H-003 的前置） */
function selfCheck(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entry, ...args], { cwd: repo, stdio: 'ignore' })
    const timer = setTimeout(() => child.kill('SIGKILL'), 20000)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}
const versionOk = await selfCheck(['--version'])
const helpOk = await selfCheck(['--help'])
console.log(`${versionOk ? '✅' : '❌'} 产物 --version；${helpOk ? '✅' : '❌'} 产物 --help`)
if (!versionOk || !helpOk) {
  console.error('✗ 产物基本启动自检失败（--version/--help），不进入 HTTP 门禁')
  process.exit(1)
}
const assets = path.join(distNode, 'assets')
const password = 'smoke-' + Math.random().toString(36).slice(2)
const tmp = mkdtempSync(path.join(os.tmpdir(), 'oc-ark-smoke-'))
const workspace = path.join(tmp, 'workspace')
mkdirSync(workspace, { recursive: true })

const env = {
  ...process.env,
  OPENCODE_NODE_ASSETS_DIR: assets,
  OPENCODE_PASSWORD: password,
  OPENCODE_DISABLE_MODELS_FETCH: '1',
  OPENCODE_FILEWATCHER_DISABLE: '1',
  OPENCODE_DISABLE_FFF: '1',
  OPENCODE_DISABLE_AUTOUPDATE: '1',
  XDG_DATA_HOME: path.join(tmp, 'data'),
  XDG_CACHE_HOME: path.join(tmp, 'cache'),
  XDG_CONFIG_HOME: path.join(tmp, 'config'),
  XDG_STATE_HOME: path.join(tmp, 'state'),
  NO_PROXY: '127.0.0.1,localhost',
}

const basic = 'Basic ' + Buffer.from(`opencode:${password}`).toString('base64')
const child = spawn(process.execPath, [entry, 'serve', '--hostname', '127.0.0.1', '--port', '0'], {
  cwd: workspace,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''
child.stdout.on('data', (d) => (stdout += d.toString()))
child.stderr.on('data', (d) => (stderr += d.toString()))

function waitPort(timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      const m = /server listening on http:\/\/[^:]+:(\d+)/.exec(stdout)
      if (m) {
        clearInterval(timer)
        resolve(Number(m[1]))
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        reject(new Error(`超时未打印监听地址；stderr 尾=${stderr.slice(-800)}`))
      }
    }, 200)
  })
}

function pass(name, detail) {
  console.log(`✅ ${name}${detail ? '：' + detail : ''}`)
}
function fail(name, detail) {
  console.error(`❌ ${name}${detail ? '：' + detail : ''}`)
  failures++
}
let failures = 0

try {
  const port = await waitPort()
  pass('① 服务监听', `port=${port}`)
  const base = `http://127.0.0.1:${port}`

  const info = await fetch(`${base}/api/info`, { headers: { authorization: basic } })
  const infoText = await info.text()
  if (info.status === 200 && /"version"\s*:\s*"/.test(infoText)) pass('② /api/info 200', infoText.slice(0, 120))
  else fail('② /api/info', `status=${info.status} body=${infoText.slice(0, 200)}`)

  const unauth = await fetch(`${base}/api/info`)
  if (unauth.status === 401) pass('④ 无凭据 401')
  else fail('④ 无凭据应 401', `status=${unauth.status}`)

  const page = await fetch(`${base}/`, { headers: { authorization: basic } })
  const html = await page.text()
  if (page.status === 200 && /<html|<!doctype/i.test(html)) pass('③ / 返回 HTML', `${html.length} B`)
  else fail('③ /', `status=${page.status} len=${html.length}`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const sse = await fetch(`${base}/api/event`, { headers: { authorization: basic }, signal: controller.signal })
    const reader = sse.body?.getReader()
    const first = reader ? await reader.read() : { value: undefined }
    clearTimeout(timer)
    const text = first.value ? Buffer.from(first.value).toString('utf8') : ''
    if (sse.status === 200 && text.length > 0) pass('⑤ SSE 首事件', text.slice(0, 80).replace(/\n/g, ' '))
    else fail('⑤ SSE', `status=${sse.status} first=${text.slice(0, 80)}`)
    try { await reader?.cancel() } catch {}
  } catch (error) {
    clearTimeout(timer)
    fail('⑤ SSE', error && error.message)
  }
} catch (error) {
  fail('① 服务监听', error && error.message)
} finally {
  child.kill('SIGTERM')
  if (!keep) {
    console.log(`\n临时目录（已保留供排查）：${tmp}`)
    console.log(`产物日志：stdout ${stdout.length} B / stderr ${stderr.length} B`)
  }
  if (failures > 0) {
    console.error(`\n✗ host 门禁失败：${failures} 项`)
    setTimeout(() => process.exit(1), 300)
  } else {
    console.log('\n✓ host 门禁全绿')
    setTimeout(() => process.exit(0), 300)
  }
}
