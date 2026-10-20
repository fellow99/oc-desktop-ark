/**
 * oc-plugin-workspace-roots —— 「工作区选择器」的壳侧能力面（oc-desktop-ark）。
 *
 * 为什么必须是插件：渲染层是 ArkWeb 同源加载的网页，**看不到真实家目录**（`HOME` 已被宿主
 * 改写为沙箱 `filesDir`），也**触达不到 ArkTS**（目录权限申请 / 应用信息页深链只在主进程可达）。
 * 插件运行在**服务端进程**（与 `opencode.mjs serve` 同进程），这两件事天然成立。
 *
 * 与 oc-desktop-hos 版的差异（本版三根 + 新权限交互，见 docs/ACL配置.md §3）：
 *   · 根清单只有 **沙箱 / 文档 / 下载**（不含桌面：桌面属 system_basic + 必须 ACL，本版不申请）；
 *   · 权限桥不是 Electron `systemPreferences.callArkTSAsyncFunction`，而是**文件信箱**
 *     （`host.js#invoke` → ArkTS `HostCapabilities` 的 `perm.check` / `perm.request` / `perm.openAppInfo`）；
 *   · 点「文档」「下载」Tab **不主动请求权限**：有权限→列表；无权限→`请求权限`+`刷新` 两按钮
 *     （交互在 UI 侧；本插件只暴露 check / request / browse 三个原子能力）。
 *
 * 数据面边界：本 RPC 只承载**壳侧原生能力**（三根路径、权限预检/申请、目录枚举）。
 * 传输：`POST /api/rpc/oc-harmony-workspace-roots/<method>`，载荷 `{ input }`，返回 `{ output }`。
 * 结果约定：所有方法**不抛错**，统一返回 `{ ok, code, message, ... }`；`code` 是稳定字符串。
 *
 * 准入：不依赖 PTY、不 spawn、不依赖原生模块；只用 node 内建与宿主桥 `host.js`。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
const PLUGIN_ID = 'oc-harmony-workspace-roots';
const LOG_PREFIX = '[oc-desktop]';

/** 三个主目录，顺序即 UI Tab 顺序（沙箱在前）。桌面刻意**不在**清单里（见头注释）。 */
const ROOT_IDS = ['sandbox', 'documents', 'download'];

/** 每个 root 对应的 ArkTS 权限名（沙箱免授权）。与 module.json5 的 requestPermissions 一致。 */
const PERM_BY_ROOT = {
  documents: 'ohos.permission.READ_WRITE_DOCUMENTS_DIRECTORY',
  download: 'ohos.permission.READ_WRITE_DOWNLOAD_DIRECTORY',
};

/**
 * 宿主桥 `host.js` 的解析：优先与载荷同目录（resfile 只读直读时两者同层），
 * 找不到则退回 `NODE_BRIDGE_PAYLOAD_ROOT/host.js`，再找不到 `undefined`（能力降级为 not-bridge）。
 */
function resolveHost() {
  const candidates = [];
  const here = path.dirname(new URL(import.meta.url).pathname);
  candidates.push(path.join(here, 'host.js'));
  if (process.env.NODE_BRIDGE_PAYLOAD_ROOT) {
    candidates.push(path.join(process.env.NODE_BRIDGE_PAYLOAD_ROOT, 'host.js'));
  }
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return nodeRequire(p);
    } catch (e) {
      console.log(`${LOG_PREFIX} workspace-roots: 加载 host.js 失败 ${p}: ${e && e.message}`);
    }
  }
  return undefined;
}

const host = resolveHost();
const HOME = process.env.HOME || process.env.USERPROFILE || '';

/** 用户主目录（文档/下载的根）。默认 `/storage/Users/currentUser`，可用 OC_HOS_USER_HOME 覆盖。 */
function userHome() {
  return process.env.OC_HOS_USER_HOME || '/storage/Users/currentUser';
}

/** 解析一个 root 的路径（沙箱 = HOME/workspace；文档/下载 = userHome 下）。 */
function rootPath(id) {
  if (id === 'sandbox') return HOME ? path.join(HOME, 'workspace') : '';
  if (id === 'documents') return path.join(userHome(), 'Documents');
  if (id === 'download') return path.join(userHome(), 'Download');
  return '';
}

/** 目录是否存在且可读（区分 ENOENT 与 EACCES，避免把「没授权」误报成「目录不存在」，见 ACL配置 §5.5） */
function statRoot(p) {
  try {
    const st = fs.statSync(p);
    return { exists: true, isDir: st.isDirectory(), error: '' };
  } catch (e) {
    if (e && e.code === 'ENOENT') return { exists: false, isDir: false, error: 'ENOENT' };
    return { exists: false, isDir: false, error: e && e.code ? e.code : String(e && e.message || e) };
  }
}

/** 列目录（上限 500 项，按名称排序；错误结构化返回，不抛） */
function listDir(p) {
  try {
    const entries = fs.readdirSync(p, { withFileTypes: true });
    const items = entries
      .map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1))
      .slice(0, 500);
    return { ok: true, code: '', message: '', entries: items, count: items.length };
  } catch (e) {
    const code = e && e.code === 'EACCES' ? 'EACCES' : e && e.code ? e.code : 'error';
    return { ok: false, code, message: (e && e.message) || String(e), entries: [], count: 0 };
  }
}

function outcome(code, message) {
  return { ok: false, code, message };
}

// ── handlers（全部 async：上游对返回值直接 .then()，同步返回会变成 rpc.internal）──

/** 三个主目录解析（路径 + 是否存在 + 是否需要授权）。 */
async function handleRoots() {
  const roots = ROOT_IDS.map((id) => {
    const p = rootPath(id);
    const st = p ? statRoot(p) : { exists: false, isDir: false, error: 'no-path' };
    return {
      id,
      path: p,
      available: !!st.exists && st.isDir,
      needsPermission: !!PERM_BY_ROOT[id],
      reason: st.exists ? '' : st.error,
    };
  });
  for (const r of roots) {
    console.log(`${LOG_PREFIX} workspace-root ${new Date().toISOString()} ${r.id}=${r.available ? r.path : '<unavailable: ' + r.reason + '>'}`);
  }
  return { home: HOME, userHome: userHome(), roots };
}

/** 列某个 root（或 root 内子路径）的目录。`input = { id, sub }`（sub 相对 root 的子路径，可为 ''）。 */
async function handleBrowse(input) {
  const id = input && typeof input.id === 'string' ? input.id : '';
  const sub = input && typeof input.sub === 'string' ? input.sub : '';
  if (ROOT_IDS.indexOf(id) < 0) return { ...outcome('root-unknown', `未知主目录：${id || '<empty>'}`), entries: [], count: 0 };
  const root = rootPath(id);
  if (!root) return { ...outcome('root-unavailable', '主目录路径不可用'), entries: [], count: 0 };
  // 根围栏：sub 消解后必须仍在 root 内（防 `..` 逃逸）
  const target = sub ? path.resolve(root, sub) : root;
  const realRoot = path.resolve(root);
  if (target !== realRoot && !target.startsWith(realRoot + path.sep)) {
    return { ...outcome('out-of-root', `子路径超出主目录范围：${sub}`), entries: [], count: 0 };
  }
  const st = statRoot(target);
  if (!st.exists) return { ...outcome(st.error === 'ENOENT' ? 'not-found' : st.error, `目录不可用：${target}`), entries: [], count: 0 };
  if (!st.isDir) return { ...outcome('not-a-dir', `不是目录：${target}`), entries: [], count: 0 };
  return listDir(target);
}

/** 权限预检（点 Tab 时调用，**不请求**）。沙箱恒 granted。 */
async function handlePermissionCheck(input) {
  const id = input && typeof input.id === 'string' ? input.id : '';
  if (id === 'sandbox') return { granted: true, source: 'sandbox', message: '' };
  const perm = PERM_BY_ROOT[id];
  if (!perm) return { granted: false, source: 'unknown-root', message: `未知主目录：${id || '<empty>'}` };
  if (!host) return { granted: false, source: 'unavailable', message: '宿主桥不可用（权限只能在系统设置中调整）' };
  try {
    const r = await host.invoke('perm.check', { name: perm });
    return { granted: !!r && r.granted === true, source: 'bridge', permission: perm, message: (r && r.message) || '', hint: (r && r.hint) || '' };
  } catch (e) {
    return { granted: false, source: 'unavailable', permission: perm, message: (e && e.message) || String(e) };
  }
}

/** 主动申请目录权限（点「请求权限」按钮时调用）。返回逐项 authResult。 */
async function handlePermissionRequest(input) {
  const id = input && typeof input.id === 'string' ? input.id : '';
  if (id === 'sandbox') return { ok: true, code: '0', granted: true, bridgeUnavailable: false, message: '' };
  const perm = PERM_BY_ROOT[id];
  if (!perm) return { ok: false, code: '-1', granted: false, bridgeUnavailable: false, message: `未知主目录：${id || '<empty>'}` };
  if (!host) return { ok: false, code: '-1', granted: false, bridgeUnavailable: true, message: '权限申请桥不可用（请在系统设置中开启）' };
  try {
    const r = await host.invoke('perm.request', { permissions: [perm] });
    const granted = !!(r && r.granted > 0);
    return { ok: true, code: granted ? '0' : String(r && r.denied ? '-1' : '2'), granted, bridgeUnavailable: false, permission: perm, message: (r && r.message) || '' };
  } catch (e) {
    return { ok: false, code: '-1', granted: false, bridgeUnavailable: false, message: (e && e.message) || String(e) };
  }
}

/** 深链到本应用信息页（权限归因落地；被拒后只能去系统设置改授权）。 */
async function handleOpenAppInfo() {
  if (!host) return { ok: false, message: '应用信息页桥不可用' };
  try {
    const r = await host.invoke('perm.openAppInfo', {});
    return { ok: !!(r && r.ok !== false), message: (r && r.message) || '' };
  } catch (e) {
    return { ok: false, message: (e && e.message) || String(e) };
  }
}

/**
 * 上游插件契约：默认导出 `{ id, setup }`；`setup` 返回值是清理函数。
 * 缺失 `context.rpc.register` 时**抛错**（fail-visible：插件在 inventory 里变 failed，
 * 而不是静默什么都不注册，导致 UI 回退）。
 */
export default {
  id: PLUGIN_ID,
  async setup(context) {
    if (!context || !context.rpc || typeof context.rpc.register !== 'function') {
      throw new Error(`${PLUGIN_ID}: unexpected plugin context (missing context.rpc.register)`);
    }
    const definition = {
      id: PLUGIN_ID,
      name: 'OC Workspace Roots',
      description: '沙箱 / 文档 / 下载 三根工作区选择器（含权限预检、申请与目录枚举）',
      methods: {
        roots: { description: '三个主目录的解析（路径 / 是否存在 / 是否需要授权）' },
        browse: { description: '列某个 root（或 root 内子路径）的目录' },
        permissionCheck: { description: '权限预检（点 Tab 时，不请求）' },
        permissionRequest: { description: '主动申请目录权限（点「请求权限」按钮时）' },
        openAppInfo: { description: '深链到本应用信息页' },
      },
    };
    const registration = await context.rpc.register(definition, {
      roots: async () => handleRoots(),
      browse: async (input) => handleBrowse(input),
      permissionCheck: async (input) => handlePermissionCheck(input),
      permissionRequest: async (input) => handlePermissionRequest(input),
      openAppInfo: async () => handleOpenAppInfo(),
    });
    console.log(`${LOG_PREFIX} plugin ${PLUGIN_ID} registered (roots, browse, permissionCheck, permissionRequest, openAppInfo)`);
    return () => {
      Promise.resolve(registration && registration.dispose && registration.dispose()).catch(() => {});
    };
  },
};
