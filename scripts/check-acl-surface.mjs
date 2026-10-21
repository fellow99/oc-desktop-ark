#!/usr/bin/env node
/**
 * check-acl-surface.mjs —— 110-jitless：权限声明面静态门禁（AC-110-06 / FR-110-002）
 *
 * 断言 entry/src/main/module.json5 的权限声明面与规格一致：
 *   - ACL（definePermissions）只保留 ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY；
 *   - requestPermissions 只含 6 项：INTERNET / GET_NETWORK_INFO / KEEP_BACKGROUND_RUNNING /
 *     kernel.ALLOW_WRITABLE_CODE_MEMORY / READ_WRITE_DOCUMENTS_DIRECTORY / READ_WRITE_DOWNLOAD_DIRECTORY；
 *   - 不得出现 READ_PASTEBOARD / READ_WRITE_DESKTOP_DIRECTORY（docs/ACL配置.md §1.2 已撤销）；
 *   - 文档/下载是 normal 级（user_grant），因此不进 definePermissions。
 *
 * 用法：
 *   node scripts/check-acl-surface.mjs            # 退出码 0=通过 / 非 0=不通过
 *
 * 只读，不落盘。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_JSON5 = path.resolve(HERE, '..', 'entry', 'src', 'main', 'module.json5');

// 引号/斜杠字符用码位构造，避免本文件自身的注释/字符串里出现成对照抄时的阅读混淆
const Q_DOUBLE = String.fromCharCode(34); // "
const Q_SINGLE = String.fromCharCode(39); // '
const Q_TEMPLATE = String.fromCharCode(96); // `
const BACKSLASH = String.fromCharCode(92); // \
const SLASH = '/';
const ASTERISK = '*';
const NEWLINE = '\n';

/**
 * 去掉注释（json5 容错解析，无依赖）。review m9：必须字符串感知 ——
 * 朴素正则会把字符串值里的 // 或块注释起止符当注释删掉（如 reason/URL 文本含斜杠），
 * 造成「改一行说明字符串，门禁却解析失败/误判」的诡异耦合。这里逐字符扫描，
 * 只在引号外识别注释，并一并去掉 JSON 不容忍的尾逗号。
 */
function stripComments(text) {
  let out = '';
  let quote = null; // 当前字符串引号：Q_DOUBLE / Q_SINGLE / Q_TEMPLATE / null
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quote !== null) {
      out += ch;
      if (escaped) { escaped = false; continue; }
      if (ch === BACKSLASH) { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === Q_DOUBLE || ch === Q_SINGLE || ch === Q_TEMPLATE) { quote = ch; out += ch; continue; }
    if (ch === SLASH && next === SLASH) {
      while (i < text.length && text[i] !== NEWLINE) i += 1;
      continue; // 行注释：整行吃掉（换行由外层结构容忍）
    }
    if (ch === SLASH && next === ASTERISK) {
      i += 2;
      while (i < text.length && !(text[i] === ASTERISK && text[i + 1] === SLASH)) i += 1;
      i += 1;
      continue;
    }
    out += ch;
  }
  return out.replace(/,(\s*[}\]])/g, '$1'); // 去尾逗号（json5 容忍，JSON.parse 不容忍）
}

/** 期望的 requestPermissions 集合（顺序无关） */
const EXPECTED_REQUEST = new Set([
  'ohos.permission.INTERNET',
  'ohos.permission.GET_NETWORK_INFO',
  'ohos.permission.KEEP_BACKGROUND_RUNNING',
  'ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY',
  'ohos.permission.READ_WRITE_DOCUMENTS_DIRECTORY',
  'ohos.permission.READ_WRITE_DOWNLOAD_DIRECTORY',
]);

/** 期望的 definePermissions（ACL）只这一项 */
const EXPECTED_DEFINE = new Set([
  'ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY',
]);

/** 明确不得出现的权限（docs/ACL配置.md §1.2 撤销项） */
const FORBIDDEN = new Set([
  'ohos.permission.READ_PASTEBOARD',
  'ohos.permission.READ_WRITE_DESKTOP_DIRECTORY',
]);

function fail(msg) {
  console.error('[FAIL] ' + msg);
  process.exitCode = 1;
}

let text;
try {
  text = readFileSync(MODULE_JSON5, 'utf8');
} catch (e) {
  fail('无法读取 ' + MODULE_JSON5 + '：' + e.message);
  process.exit(1);
}

let obj;
try {
  obj = JSON.parse(stripComments(text));
} catch (e) {
  fail('module.json5 解析失败：' + e.message);
  process.exit(1);
}

const mod = obj && obj.module;
if (!mod) {
  fail('module.json5 缺少顶层 module 对象');
  process.exit(1);
}

const requestNames = (mod.requestPermissions ?? [])
  .map((p) => (typeof p === 'string' ? p : p && p.name))
  .filter(Boolean);
const defineNames = (mod.definePermissions ?? [])
  .map((p) => (typeof p === 'string' ? p : p && p.name))
  .filter(Boolean);

const requestSet = new Set(requestNames);
const defineSet = new Set(defineNames);

let ok = true;

// 1) requestPermissions 与期望一致
for (const expected of EXPECTED_REQUEST) {
  if (!requestSet.has(expected)) {
    fail('requestPermissions 缺少应有项：' + expected);
    ok = false;
  }
}
for (const actual of requestNames) {
  if (!EXPECTED_REQUEST.has(actual)) {
    fail('requestPermissions 含不应有项：' + actual);
    ok = false;
  }
}

// 2) definePermissions 只含 JIT ACL
for (const expected of EXPECTED_DEFINE) {
  if (!defineSet.has(expected)) {
    fail('definePermissions 缺少应有项（ACL）：' + expected);
    ok = false;
  }
}
for (const actual of defineNames) {
  if (!EXPECTED_DEFINE.has(actual)) {
    fail('definePermissions 含不应有项：' + actual + '（ACL 只保留 kernel.ALLOW_WRITABLE_CODE_MEMORY）');
    ok = false;
  }
}

// 3) 禁止项不得出现
for (const forbidden of FORBIDDEN) {
  if (requestSet.has(forbidden) || defineSet.has(forbidden)) {
    fail('发现已撤销权限（docs/ACL配置.md §1.2）：' + forbidden);
    ok = false;
  }
}

if (ok) {
  console.log('[OK] 权限声明面合规：requestPermissions=' + requestNames.length
    + ' 项（含 JIT ACL + 2 个 normal 用户目录权限），definePermissions='
    + defineNames.length + ' 项（仅 kernel.ALLOW_WRITABLE_CODE_MEMORY）；'
    + '无 READ_PASTEBOARD / READ_WRITE_DESKTOP_DIRECTORY');
  console.log('  AC-110-06 通过');
} else {
  console.error('\n权限声明面不合规（见上）。当前：\n  requestPermissions=['
    + requestNames.join(', ') + ']\n  definePermissions=[' + defineNames.join(', ') + ']');
  process.exit(1);
}
