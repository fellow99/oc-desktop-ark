'use strict';
/*
 * jitless 兼容层的**唯一出口**（需求 110-jitless，oc-desktop-ark）
 *
 * 【为什么需要这一层】OHOS 不允许 W^X 的 JIT 页 ⇒ 宿主以 `--jitless` 启动 ⇒ V8 连带
 * 关掉 WASM ⇒ `WebAssembly === undefined`。于是 Node 自带的 undici 全线不可用：
 *   · 原生 `fetch`（解析器是 WASM 版 llhttp）一连接就抛 `WebAssembly is not defined`；
 *   · `node:http`/`node:https` 的惰性 getter（`lazyUndici`）会把 undici 拉起来。
 * 本目录下的模块就是这些缺口的纯 JS 补齐：`http-lazy-undici.js`（封印惰性 getter）、
 * `fetch-shim.js`（基于原生 `node:http/https` 的 fetch 实现）、`undici-shim.js`（防御资产，
 * 由 selftest 验证；本工程 bundle 不直接 require undici，故运行时不接线，见 REVIEW C1）。
 *
 * 【判据只有一个】`typeof WebAssembly === 'undefined'`。WASM 可用时**一个动作都不做**
 * —— jit 形态必须保持 100% 原生行为，任何"顺手装一下"都会让原生 undici 与垫片打架。
 *
 * 【调用方式】`payload/opencode-server.js` 在 import `opencode.mjs` 之前：
 *     const { installIfNeeded } = require('./jitless');
 *     const facts = installIfNeeded({ log, bundleMarks });
 * 本模块**不写任何文件**：`log` 回调由调用方负责落盘。
 *
 * 【返回事实（结构化三态）】`installed` / `kept` / `failed`：
 *     {
 *       active: boolean,        // 兼容层是否接管（= WASM 是否缺失）
 *       webAssembly: 'undefined' | 'defined',
 *       httpLazy: 'installed' | 'kept' | 'failed',
 *       sealed: string[],
 *       fetch: 'installed' | 'kept' | 'failed',
 *       globals: { Headers, Request, Response, FormData, Blob, File },
 *       fetchImpl: Function | null,
 *       wasm: { bundled, degraded },   // bundle 内嵌 WASM 能力的探测与降级事实
 *     }
 * 幂等：重复调用返回**同一个对象**，不重复安装。
 */

const { sealHttpLazyUndici } = require('./http-lazy-undici.js');
const { installFetchShim } = require('./fetch-shim.js');

const LOG_PREFIX = '[jitless]';
const NOOP = () => {};

/** 幂等缓存：`null` = 还没跑过。 */
let state = null;

/** 把各阶段的结果画成一行（日志里一眼能看出三态与细节）。 */
function describe(facts) {
  const globals = Object.entries(facts.globals)
    .map(([name, status]) => `${name}:${status}`)
    .join(', ');
  return `httpLazy=${facts.httpLazy}（${facts.sealed.length > 0 ? facts.sealed.join(', ') : '无'}）`
    + ` fetch=${facts.fetch}`
    + ` globals=${globals.length > 0 ? globals : '(无)'}`;
}

/**
 * 按需安装 jitless 兼容层。
 *
 * @param {object|function} [options] 选项对象（或直接传日志回调，兼容旧签名）：
 * @param {(line: string) => void} [options.log] 日志回调（调用方落盘；本模块不写文件）
 * @param {Record<string, boolean>} [options.bundleMarks] bundle 内嵌 WASM 标记探测结果
 *   （{photon, treeSitter, quickjs}，由调用方从 opencode.mjs 文本探测得到）
 * @returns {{active: boolean, webAssembly: 'undefined'|'defined', httpLazy: string, sealed: string[],
 *   fetch: string, globals: Record<string, string>, fetchImpl: Function|null, wasm: object}}
 */
function installIfNeeded(options) {
  const opts = typeof options === 'function' ? { log: options } : (options || {});
  const say = typeof opts.log === 'function' ? opts.log : NOOP;
  const bundleMarks = opts.bundleMarks || null;
  /* 幂等：第二次进来只回报事实，不再动任何全局/模块对象。 */
  if (state !== null) {
    say(`${LOG_PREFIX} 兼容层已安装过（幂等）：${describe(state)}`);
    return state;
  }

  if (typeof WebAssembly !== 'undefined') {
    say(`${LOG_PREFIX} WASM 可用：兼容层不安装`);
    state = {
      active: false,
      webAssembly: 'defined',
      httpLazy: 'kept',
      sealed: [],
      fetch: 'kept',
      globals: {},
      fetchImpl: null,
      wasm: { active: false, webAssembly: 'defined', bundled: bundleMarks || {}, degraded: [] },
    };
    return state;
  }


  /*
   * 顺序是承重的：**先封 getter、再接管 fetch**。
   * 反过来的话 `installFetchShim()` 里读 `globalThis.Headers` 之类的惰性属性时，
   * 可能先把 undici 拉起来（那一步在 jitless 下的表现取决于 Node 版本：本机是"能物化、
   * 发请求才炸"，但端侧不保证）。
   */
  let httpLazy = 'failed';
  let sealed = [];
  let httpDetail = null;
  try {
    const report = sealHttpLazyUndici(say);
    sealed = Array.from(report);
    httpLazy = typeof report.status === 'string' ? report.status : 'installed';
    httpDetail = report.detail === undefined ? null : report.detail;
    if (httpDetail !== null && Array.isArray(httpDetail.failed) && httpDetail.failed.length > 0) {
      say(`${LOG_PREFIX} 惰性 getter 封印有失败项：${httpDetail.failed.join('；')}`);
    }
  } catch (error) {
    /* 【为什么兜住】入口脚本没有第二次机会：这里抛出去就等于宿主起不来。
     * 记一行 failed 事实，继续装 fetch —— fetch 才是"能不能调模型"的决定项。 */
    say(`${LOG_PREFIX} 封印 node:http/https 惰性 getter 失败（继续安装 fetch）：${String(error)}`);
  }

   let fetchStatus = 'failed';
   let globals = {};
   let fetchImpl = null;
   try {
     const result = installFetchShim();
     fetchStatus = result.status;
     globals = result.globals;
     fetchImpl = result.fetch === undefined ? null : result.fetch;
   } catch (error) {
     say(`${LOG_PREFIX} 安装 fetch 垫片失败：${String(error)}`);
   }
 
   /* 110-jitless（本工程专属）：bundle 内嵌 photon/tree-sitter/quickjs 是懒加载的内部符号，
    * 无法 monkey-patch；这里按调用方给的 bundleMarks 出**结构化降级事实**
    * （FR-110-006/007/008/009），不崩进程。marks 缺省时只报 WebAssembly 状态。 */
   let wasm = { active: false, webAssembly: 'defined', bundled: {}, degraded: [] };
   try {
     wasm = require('./wasm-patch.js').wasmFacts(say, bundleMarks);
   } catch (error) {
     say(`${LOG_PREFIX} wasm 能力探测失败（不影响 fetch）：${String(error)}`);
   }
 
   state = {
     active: true,
     webAssembly: 'undefined',
     httpLazy,
     sealed,
     fetch: fetchStatus,
     globals,
     fetchImpl,
     wasm,
   };

  say(`${LOG_PREFIX} 兼容层安装完成：${describe(state)}`);
  return state;
}

module.exports = { installIfNeeded };
