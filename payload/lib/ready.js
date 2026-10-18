'use strict';
/**
 * 就绪证据与独立日志（overall-data-model §1.2；宪法 C3「谁写谁读」）。
 *
 * - 就绪 marker 由 **本进程** 原子写（临时文件 + rename），ArkTS 只读；
 * - 日志写到 `<filesDir>/logs/server.log`，**不与**库的 `payload/app.log` 共文件。
 */
const fs = require('node:fs');
const path = require('node:path');

/** @param {string} file @param {string} line */
function appendLog(file, line) {
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // 日志失败不得影响启动；错误仍会经 stderr 进库的日志环
  }
}

/**
 * 原子写就绪 marker。
 * @param {string} file @param {{port:number,host:string,version:string,startedAt:number}} info
 */
function writeReady(file, info) {
  const payload = {
    schema: 1,
    port: info.port,
    host: info.host,
    url: `http://${info.host}:${info.port}`,
    pid: process.pid,
    startedAt: info.startedAt,
    version: info.version,
  };
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, text);
  fs.renameSync(`${file}.tmp`, file);
  return payload;
}

module.exports = { appendLog, writeReady };
