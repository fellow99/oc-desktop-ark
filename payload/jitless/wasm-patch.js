'use strict';
/*
 * wasm-patch.js —— 110-jitless：bundle 内嵌 WASM 能力探测与降级事实
 *
 * 【为什么不是参考工程那种「monkey-patch / 改包 main」】
 * 参考工程 `pi-desktop-ark` 的 photon / tree-sitter 是独立 `node_modules` 包，组装期改 `main`
 * 指条件入口即可。本工程 `oc-desktop-ark` 的 `opencode.mjs` 是**单文件 bundle（~16 MB）**，
 * photon 的 `PhotonImage.new_from_byteslice` 与 tree-sitter 的 `Parser`/`Language` 都是
 * **bundle 内部的 minified 符号**（不是 npm 包导出），无法从进程外部拦截替换。
 *
 * 【这些模块是懒加载】
 * 本机 grep 取证：photon（`photon_rs_bg.wasm`）与 tree-sitter（`web-tree-sitter/tree-sitter.wasm`）
 * 的 `WebAssembly.instantiate*` 都在**工具/附件被调用时才触发**（图片附件 / 语义搜索），不是启动期。
 * ⇒ compat 形态（`WebAssembly===undefined`）下：
 *   · 启动**不受影响**（不触达 WASM）；
 *   · 首次用到图片附件 / 语义搜索时，上游自身的 `try/catch` 捕获 `WebAssembly is not defined`
 *     ⇒ 走上游既有的「图片附件不可用 / 语义搜索不可用」降级路径，**进程不崩**；
 *   · 纯文本 `ripgrep`/`grep` 搜索**非 WASM**，compat 下仍可用。
 *
 * 【本模块做什么（FR-110-006 / FR-110-007 / FR-110-008 / FR-110-009）】
 *   · 探测 `WebAssembly` 是否存在；
 *   · 探测 bundle 里**声明了**哪些 WASM 资产（photon / tree-sitter / quickjs），作为「会降级什么」
 *     的可审计事实；
 *   · 输出**结构化降级事实**（哪些能力在 compat 下不可用），并入 `installIfNeeded` 的 facts，
 *     让 `server.log` 与诊断面板能如实告知（宪法 G1 不静默失败 / T5 事实优先）；
 *   · **不**强行 monkey-patch（不可行），**不**崩进程。
 *
 * 【jit 形态】`WebAssembly` 可用 ⇒ 本模块只记一行「WASM 可用，无降级」，**不产生任何可观察差异**
 * （NFR-110-001 jit 零回归）。
 */

const LOG_PREFIX = '[jitless:wasm]';

/**
 * 在 bundle 源码文本里探测「声明了哪些 WASM 资产」。
 *
 * 只用于出诊断事实，**不**作为行为开关（行为开关只有 `typeof WebAssembly`）。
 *
 * @param {string} [bundleText] opencode.mjs 的源码文本（可选；拿不到则只报 WebAssembly 状态）
 * @returns {{photon: boolean, treeSitter: boolean, quickjs: boolean, wasmPaths: string[]}}
 */
function probeBundledWasm(bundleText) {
  const text = typeof bundleText === 'string' ? bundleText : '';
  return {
    photon: text.includes('photon_rs_bg.wasm') || text.includes('@silvia-odwyer/photon-node'),
    treeSitter: text.includes('web-tree-sitter/tree-sitter.wasm') || text.includes('OPENCODE_TREE_SITTER_WASM_PATH'),
    quickjs: /\bquickjs\b/i.test(text),
    wasmPaths: uniqueMatches(text, /[\w./@-]+\.wasm\b/g).slice(0, 64),
  };
}

function uniqueMatches(text, re) {
  const set = new Set();
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    set.add(m[0]);
    if (set.size > 512) break;
  }
  return Array.from(set);
}

/**
 * 计算 compat 形态下**将不可用**的能力清单（供日志 / 诊断面板如实告知）。
 * jit 形态返回空清单。
 *
 * @param {boolean} wasmAvailable
 * @param {{photon: boolean, treeSitter: boolean, quickjs: boolean}} probe
 * @returns {string[]}
 */
function degradedCapabilities(wasmAvailable, probe) {
  if (wasmAvailable) return [];
  const out = [];
  if (probe.treeSitter) out.push('语义搜索/tree-sitter 代码解析（已回退纯文本 ripgrep/grep 搜索）');
  if (probe.photon) out.push('图片附件 EXIF/缩放（photon，本档不可用；发图会明确提示）');
  if (probe.quickjs) out.push('code-mode（quickjs，本档不可用；触发时给出结构化错误）');
  return out;
}

/**
 * 产出 wasm-patch 阶段的事实对象（并入 `installIfNeeded` 的返回）。
 *
 * @param {(line: string) => void} [log]
 * @param {string} [bundleText]
 * @returns {{
 *   active: boolean, webAssembly: string,
 *   bundled: { photon: boolean, treeSitter: boolean, quickjs: boolean },
 *   degraded: string[]
 * }}
 */
function wasmFacts(log = () => {}, bundleText) {
  const wasmAvailable = typeof WebAssembly !== 'undefined';
  const probe = probeBundledWasm(bundleText);
  const degraded = degradedCapabilities(wasmAvailable, probe);

  if (wasmAvailable) {
    log(`${LOG_PREFIX} WASM 可用：无降级（jit 形态）`);
    return { active: false, webAssembly: 'defined', bundled: probe, degraded: [] };
  }

  const detail = degraded.length > 0
    ? `compat 形态不可用：${degraded.join('；')}`
    : 'compat 形态（未发现内嵌 WASM 资产）';
  log(`${LOG_PREFIX} ${detail}`);
  return { active: true, webAssembly: 'undefined', bundled: probe, degraded };
}

module.exports = { probeBundledWasm, degradedCapabilities, wasmFacts };
