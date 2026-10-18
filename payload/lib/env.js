'use strict';
/**
 * 应用语义环境的**唯一事实源**（Node 侧）。
 *
 * 与 `entry/src/main/ets/common/Constants.ets` 的 `EnvNames` **镜像**：变量名只在这里定义一次，
 * ArkTS 侧只负责把同名变量塞进 `options.env`（库只做透明传递，不解释业务语义）。
 *
 * 纪律：**不设置** HOME / TMPDIR / NODE_OPTIONS —— 那是库的职责（库契约 §5.6）。
 */

/** @param {Record<string,string|undefined>} base @param {string} filesDir */
function buildEnv(base, filesDir) {
  const env = Object.assign({}, base);
  env.XDG_DATA_HOME = `${filesDir}/data`;
  env.XDG_CACHE_HOME = `${filesDir}/cache`;
  env.XDG_CONFIG_HOME = `${filesDir}/config`;
  env.XDG_STATE_HOME = `${filesDir}/state`;
  env.OPENCODE_DB = `${filesDir}/data/opencode/opencode.db`;
  env.OPENCODE_DISABLE_CHANNEL_DB = '1';
  env.OPENCODE_DISABLE_MODELS_FETCH = '1';
  env.OPENCODE_FILEWATCHER_DISABLE = '1';
  env.OPENCODE_DISABLE_FFF = '1';
  env.OPENCODE_DISABLE_AUTOUPDATE = '1';
  env.OPENCODE_CLIENT = 'desktop';
  env.OPENCODE_LOG_LEVEL = env.OPENCODE_LOG_LEVEL || 'info';
  env.NO_PROXY = '127.0.0.1,localhost,::1';
  env.no_proxy = env.NO_PROXY;
  // bash 工具要能找到 sh/toybox（规划 §5.6：优先绝对路径，PATH 前置 /system/bin）
  env.PATH = `/system/bin:${env.PATH || ''}`;
  return env;
}

module.exports = { buildEnv };
