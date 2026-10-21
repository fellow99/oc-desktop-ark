#!/usr/bin/env node
/**
 * check-acl-surface.mjs —— 110-jitless：权限声明面静态门禁（AC-110-06 / FR-110-002）
 *
 * 断言 `entry/src/main/module.json5` 的权限声明面与规格一致：
 *   · ACL（`definePermissions`）**只保留** `ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY`；
 *   · `requestPermissions` 只含 6 项：INTERNET / GET_NETWORK_INFO / KEEP_BACKGROUND_RUNNING /
 *     kernel.ALLOW_WRITABLE_CODE_MEMORY / READ_WRITE_DOCUMENTS_DIRECTORY / READ_WRITE_DOWNLOAD_DIRECTORY；
 *   · **不得**出现 `READ_PASTEBOARD` / `READ_WRITE_DESKTOP_DIRECTORY`（docs/ACL配置.md §1.2 已撤销）；
 *   · 文档/下载是 normal 级（user_grant）⇒ **不进** `definePermissions`。
 *
 * 用法：
 *   node scripts/check-acl-surface.mjs            # 退出码 0=通过 / 1=不通过
 *
 * 只读，不落盘。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_JSON5 = path.resolve(HERE, '..', 'entry', 'src', 'main', 'module.json5');

/** 去掉 // 行注释与 /* *\/ 块注释（json5 的注释容错解析，够用且无依赖） */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1'); // 去尾逗号（json5 容忍，JSON.parse 不容忍）
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

/** 期望的 definePermissions（ACL）**只**这一项 */
const EXPECTED_DEFINE = new Set([
  'ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY',
]);

/** 明确不得出现的权限（docs/ACL配置.md §1.2 撤销项） */
const FORBIDDEN = new Set([
  'ohos.permission.READ_PASTEBOARD',
  'ohos.permission.READ_WRITE_DESKTOP_DIRECTORY',
]);

function fail(msg) {
  console.error('✗ ' + msg);
  process.exitCode = 1;
}

let text;
try {
  text = readFileSync(MODULE_JSON5, 'utf8');
} catch (e) {
  fail(`无法读取 ${MODULE_JSON5}：${e.message}`);
  process.exit(1);
}

let obj;
try {
  obj = JSON.parse(stripComments(text));
} catch (e) {
  fail(`module.json5 解析失败：${e.message}`);
  process.exit(1);
}

const mod = obj && obj.module;
if (!mod) {
  fail('module.json5 缺少顶层 `module` 对象');
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
    fail(`requestPermissions 缺少应有项：${expected}`);
    ok = false;
  }
}
for (const actual of requestNames) {
  if (!EXPECTED_REQUEST.has(actual)) {
    fail(`requestPermissions 含不应有项：${actual}`);
    ok = false;
  }
}

// 2) definePermissions 只含 JIT ACL
for (const expected of EXPECTED_DEFINE) {
  if (!defineSet.has(expected)) {
    fail(`definePermissions 缺少应有项（ACL）：${expected}`);
    ok = false;
  }
}
for (const actual of defineNames) {
  if (!EXPECTED_DEFINE.has(actual)) {
    fail(`definePermissions 含不应有项：${actual}（ACL 只保留 kernel.ALLOW_WRITABLE_CODE_MEMORY）`);
    ok = false;
  }
}

// 3) 禁止项不得出现
for (const forbidden of FORBIDDEN) {
  if (requestSet.has(forbidden) || defineSet.has(forbidden)) {
    fail(`发现已撤销权限（docs/ACL配置.md §1.2）：${forbidden}`);
    ok = false;
  }
}

if (ok) {
  console.log(`✓ 权限声明面合规：requestPermissions=${requestNames.length} 项（含 JIT ACL + 2 个 normal 用户目录权限），`
    + `definePermissions=${defineNames.length} 项（仅 kernel.ALLOW_WRITABLE_CODE_MEMORY）；无 READ_PASTEBOARD / READ_WRITE_DESKTOP_DIRECTORY`);
  console.log('  AC-110-06 通过');
} else {
  console.error(`\n权限声明面不合规（见上）。当前：\n  requestPermissions=[${requestNames.join(', ')}]\n  definePermissions=[${defineNames.join(', ')}]`);
}
