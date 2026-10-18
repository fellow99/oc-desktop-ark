'use strict';
/**
 * opencode 服务端宿主入口（工程规划 §5.2.2；模块 101/102）。
 *
 * 由库的 `bootstrap.js` 经 `NODE_BRIDGE_ENTRY` 解析后执行。职责固定为五步：
 *   ① 装配环境（payload/lib/env.js）
 *   ② chdir 到沙箱工作区（**必须在 import 之前**；服务端的「项目根」= cwd）
 *   ③ 安装 stdout 嗅探：命中 `server listening on <url>` ⇒ 写 marker + 打印 `ARK_SERVER_READY`
 *      （**滚动缓冲**：该行可能被拆到多个 write 里）
 *   ④ 设 process.argv 为 `serve` 语义
 *   ⑤ 动态 import 产物；异常写日志且**不 process.exit**（进程内 Node 崩溃会带走整个 App）
 */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { buildEnv } = require('./lib/env');
const { appendLog, writeReady } = require('./lib/ready');

const FILES_DIR = process.env.HOME || process.env.USERPROFILE || '';
const SERVER_LOG = process.env.ARK_SERVER_LOG || (FILES_DIR ? path.join(FILES_DIR, 'logs', 'server.log') : '');
const READY_FILE = process.env.ARK_READY_FILE || (FILES_DIR ? path.join(FILES_DIR, 'payload', 'server.ready.json') : '');
const HOST = process.env.ARK_HOST || '127.0.0.1';
const VERSION = process.env.ARK_VERSION || '2.0.26';
const RUN_ROOT = process.env.NODE_BRIDGE_READONLY_ROOT || process.env.NODE_BRIDGE_PAYLOAD_ROOT || process.cwd();
const STARTED_AT = Date.now();

function log(line) {
  appendLog(SERVER_LOG, line);
  try {
    process.stdout.write(`[ark] ${line}\n`);
  } catch {
    // stdout 不可用时不阻断启动
  }
}

/** 宿主可识别的致命行：ArkTS 侧命中即快速失败，不必等满 180 s */
function fatal(reason) {
  log(`FATAL ${reason}`);
  try {
    process.stdout.write(`ARK_SERVER_FATAL ${JSON.stringify({ reason })}\n`);
  } catch {
    // 忽略
  }
}

/** 从 URL 取端口 */
function portOf(url) {
  const m = /:(\d{1,5})(?:\/|$)/.exec(url || '');
  return m ? Number(m[1]) : 0;
}

/**
 * 嗅探 `server listening on <url>`：上游 `server-process.ts` 的唯一就绪信号。
 * 维护 64 字符滚动尾部，处理跨 chunk 的行；成功写 marker 后加闩，只写一次。
 */
function installStdoutSniffer() {
  const original = process.stdout.write.bind(process.stdout);
  let tail = '';
  let written = false;
  process.stdout.write = function patched(chunk, encoding, callback) {
    try {
      if (!written) {
        const text = tail + (typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        const at = text.indexOf('server listening on ');
        if (at >= 0) {
          const url = text.slice(at + 'server listening on '.length).trim().split(/\s/)[0];
          const port = portOf(url);
          if (port > 0 && READY_FILE) {
            written = true;
            const info = writeReady(READY_FILE, { port, host: HOST, version: VERSION, startedAt: STARTED_AT });
            original(`[ark] marker written: ${READY_FILE} port=${port}\n`);
            original(`ARK_SERVER_READY ${JSON.stringify(info)}\n`);
          }
        }
        tail = text.slice(-64);
      }
    } catch (error) {
      original(`[ark] stdout sniffer failed: ${error && error.message}\n`);
    }
    return original(chunk, encoding, callback);
  };
}

function main() {
  if (!FILES_DIR) {
    fatal('HOME 未注入（库应把 HOME 指向 filesDir）');
    return;
  }

  // ① 环境
  Object.assign(process.env, buildEnv(process.env, FILES_DIR));

  // ② cwd = 沙箱工作区（opencode 无 --directory 开关，项目根就是 cwd）
  const workspace = path.join(FILES_DIR, 'workspace');
  try {
    fs.mkdirSync(workspace, { recursive: true });
    process.chdir(workspace);
    log(`cwd=${process.cwd()}`);
  } catch (error) {
    log(`chdir failed: ${error && error.message}（继续，但路径必须已绝对化）`);
  }

  // ③ 嗅探
  installStdoutSniffer();

  // ④ argv（CLI 语义；密码来自 env，不会被打印）
  const entry = path.join(RUN_ROOT, 'opencode.mjs');
  if (!fs.existsSync(entry)) {
    fatal(`产物缺失: ${entry}`);
    return;
  }
  process.argv = ['node', 'opencode.mjs', 'serve', '--hostname', HOST, '--port', '0'];
  log(`serve hostname=${HOST} port=0 entry=${entry} version=${VERSION}`);

  // 顶层兜底：进程内 Node 的未捕获异常会 abort 整个 App（C5），这里只记录不退出
  process.on('uncaughtException', (error) => {
    log(`uncaughtException: ${error && error.stack ? error.stack : String(error)}`);
  });
  process.on('unhandledRejection', (reason) => {
    log(`unhandledRejection: ${reason && reason.stack ? reason.stack : String(reason)}`);
  });

  // ⑤ 加载产物
  import(pathToFileURL(entry).href).catch((error) => {
    fatal(`import failed: ${error && error.stack ? error.stack : String(error)}`);
  });
}

main();
