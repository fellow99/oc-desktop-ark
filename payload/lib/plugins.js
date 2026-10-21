'use strict';
/*
 * plugins.js —— 108-git-plugin：**启动期插件投放**（Node 侧，C3「谁写谁读」）。
 *
 * 【为什么是 Node 而不是 ArkTS】
 * 上游 opencode 只在**启动时**做一次插件发现，而且要读的是**可写配置目录**下的
 * `opencode/plugin/<name>/`（只读 resfile 里的插件不会被扫描）。本工程没有 Electron 主进程，
 * `oc-desktop-hos` 的 `materializePlugins()`（`src-main/main.js`）在 ArkTS 侧也不该复刻：
 * 插件目录里带 `node_modules/`（56 包 / 800+ 文件），逐文件走 ArkTS 的 `@ohos.file.fs` 又慢又易错。
 * ⇒ 由**要读它的那一侧**（Node 服务端进程，import bundle 之前）整棵 copy。
 *
 * 【幂等】以「源目录内容摘要」为判据：目标目录里的 `.materialize.json` 记录上次投放的
 * `digest`（= 排序后的 `相对路径\0大小\0sha256` 的 sha256）。命中就不动盘；不命中才整目录替换，
 * 因此改插件后重装**一定**生效（110-jitless 真机上「插件永远是首次装机那份」的教训）。
 *
 * 【失败语义】任何异常都不抛给调用方打断启动：记 `failed` 事实 + 日志，返回结构化结果。
 * 插件缺失只降级（工具/界面/凭据不可用），不阻断服务。
 *
 * 【禁用软链】平台没有 symlink（A4）⇒ 用 `fs.cpSync({ recursive:true })` 真实复制。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MARKER = '.materialize.json';
const SCHEMA = 1;

/**
 * 目录内容摘要：只对**常规文件**取 sha256，跳过软链与标记文件本身。
 *
 * @param {string} dir
 * @returns {{digest: string, files: number, bytes: number}}
 */
function digestDir(dir) {
  const entries = [];
  const walk = (current, rel) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      const relPath = rel ? rel + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!rel && entry.name === '.' ) continue;
        walk(abs, relPath);
        continue;
      }
      if (!relPath.endsWith(MARKER)) {
        const stat = fs.statSync(abs);
        entries.push({ rel: relPath, size: stat.size, abs });
      }
    }
  };
  walk(dir, '');
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for (const e of entries) {
    hash.update(e.rel + '\0' + e.size + '\0');
    hash.update(crypto.createHash('sha256').update(fs.readFileSync(e.abs)).digest('hex'));
    hash.update('\n');
    bytes += e.size;
  }
  return { digest: hash.digest('hex'), files: entries.length, bytes };
}

/**
 * 投放**一个**插件目录。
 *
 * @param {string} srcDir 只读源目录（resfile/opencode/plugins/<name>）
 * @param {string} targetParent 可写插件扫描目录（<filesDir>/config/opencode/plugin）
 * @param {(line: string) => void} log
 * @returns {{name: string, action: 'copied'|'up-to-date'|'failed', files?: number, bytes?: number, error?: string}}
 */
function materializeOne(srcDir, targetParent, log) {
  const name = path.basename(srcDir);
  const target = path.join(targetParent, name);
  const markerPath = path.join(target, MARKER);
  try {
    const { digest, files, bytes } = digestDir(srcDir);
    /* 命中判据必须同时看**目标**：只比对「源 ↔ 标记」时，目标被改写/删文件也会被当成最新
     * （`shell` 工具与应用同 UID，能改到插件目录 ⇒ 被改过的插件会被一直 import）。
     * 命中 = 标记一致 **且** 目标目录自身摘要等于源摘要；标记只用来记来源。 */
    if (fs.existsSync(target) && fs.existsSync(markerPath)) {
      try {
        const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        if (marker && marker.schema === SCHEMA && marker.digest === digest) {
          if (digestDir(target).digest === digest) return { name, action: 'up-to-date', files, bytes };
        }
      } catch {
        /* 标记或目标坏了就重投（不信任） */
      }
    }
    /* 原子替换：先拷到同目录临时目录，成功后再换上去。中途失败（ENOSPC / 进程被杀）不会毁掉
     * 上一份可用插件——828 文件级别的拷贝最容易踩这个坑。 */
    fs.mkdirSync(targetParent, { recursive: true });
    const staging = target + '.tmp-' + process.pid;
    fs.rmSync(staging, { recursive: true, force: true });
    try {
      fs.cpSync(srcDir, staging, { recursive: true });
      fs.rmSync(target, { recursive: true, force: true });
      fs.renameSync(staging, target);
    } catch (error) {
      fs.rmSync(staging, { recursive: true, force: true });
      throw error;
    }
    fs.writeFileSync(markerPath, JSON.stringify({
      schema: SCHEMA, name, digest, files, bytes, materializedAt: Date.now(),
    }, null, 2) + '\n');
    return { name, action: 'copied', files, bytes };
  } catch (error) {
    return { name, action: 'failed', error: String((error && error.message) || error) };
  }
}

/**
 * 把所有插件从只读载荷根投放进可写插件扫描目录（幂等）。
 *
 * 调用时机承重：必须在 `import('opencode.mjs')` **之前**（上游只在启动时发现插件）。
 *
 * @param {object} options
 * @param {string} options.sourceRoot 只读载荷根（含 `plugins/` 子目录）
 * @param {string} options.configDir 可写配置根（`$XDG_CONFIG_HOME/opencode/plugin`）
 * @param {(line: string) => void} [options.log]
 * @returns {{ok: boolean, dir: string, plugins: Array<object>, reason?: string}}
 */
function materializePlugins(options) {
  const opts = options || {};
  const log = typeof opts.log === 'function' ? opts.log : () => {};
  const sourceRoot = opts.sourceRoot;
  const configDir = opts.configDir;
  if (typeof sourceRoot !== 'string' || sourceRoot.length === 0
    || typeof configDir !== 'string' || configDir.length === 0) {
    return { ok: false, dir: configDir || '', plugins: [], reason: 'bad-args' };
  }
  const srcPluginsDir = path.join(sourceRoot, 'plugins');
  if (!fs.existsSync(srcPluginsDir)) {
    /* 源里没有 plugins/ 说明载荷不完整（或 RUN_ROOT 指错）⇒ 不能报成功。 */
    return { ok: false, dir: configDir, plugins: [], reason: 'no-plugins-in-payload' };
  }
  let names = [];
  try {
    names = fs.readdirSync(srcPluginsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch (error) {
    return { ok: false, dir: configDir, plugins: [], reason: 'read-failed:' + String((error && error.message) || error) };
  }
  const plugins = [];
  for (const name of names) {
    const result = materializeOne(path.join(srcPluginsDir, name), configDir, log);
    plugins.push(result);
  }
  const failed = plugins.filter((p) => p.action === 'failed');
  const copied = plugins.filter((p) => p.action === 'copied');
  const line = `plugins 投放：${plugins.length} 个（新投放 ${copied.length} / 已最新 ${plugins.length - copied.length - failed.length}`
    + ` / 失败 ${failed.length}）→ ${configDir}`;
  log(line);
  for (const p of plugins) {
    log(`  · ${p.name}: ${p.action}${p.files !== undefined ? ` (${p.files} 文件 / ${p.bytes} B)` : ''}`
      + `${p.error ? ' ' + p.error : ''}`);
  }
  /* 反向清理：载荷里已经没有的插件（回退/改名）必须从配置目录删掉，否则设备会一直加载旧插件。
   * 只删**我们自己建的**（带 .materialize.json 标记），不碰用户手工放的插件。 */
  const pruned = [];
  try {
    for (const entry of fs.readdirSync(configDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || names.includes(entry.name)) continue;
      const stale = path.join(configDir, entry.name);
      if (!fs.existsSync(path.join(stale, MARKER))) continue;
      fs.rmSync(stale, { recursive: true, force: true });
      pruned.push(entry.name);
    }
  } catch (error) {
    log(`插件清理失败（继续）：${String((error && error.message) || error)}`);
  }
  if (pruned.length > 0) log(`插件清理：移除载荷里已不存在的 ${pruned.join(', ')}`);
  return { ok: failed.length === 0, dir: configDir, plugins, pruned };
}

module.exports = { materializePlugins, digestDir };
