/**
 * 唯一常量源（宪法 D3）。
 *
 * 与 `payload/lib/env.js` 的变量名**镜像**：两边任何一处改名都必须同步另一处，
 * 否则 Node 侧会读不到宿主给的路径（契约见 docs/000-工程规划.md §5.6）。
 */
export class Names {
  /** 载荷目录（相对 resfile 根） */
  static readonly PAYLOAD_DIR: string = 'opencode';
  /** 应用入口（相对载荷根；由库 bootstrap 经 NODE_BRIDGE_ENTRY 解析） */
  static readonly ENTRY_FILE: string = 'opencode-server.js';
  /** 库引导器（必须与载荷一起投放；scriptPath 指向它） */
  static readonly BOOTSTRAP_FILE: string = 'bootstrap.js';
  /** 就绪 marker（Node 侧原子写） */
  static readonly READY_FILE: string = 'server.ready.json';
  /** 凭据目录 / 文件（0600） */
  static readonly CONNECTION_DIR: string = 'ark';
  static readonly CONNECTION_FILE: string = 'connection.json';
  /** 本工程自己的日志目录（与库的 payload/app.log 分开，见宪法 C3） */
  static readonly LOG_DIR: string = 'logs';
  /** 本工程自己的日志文件（LOG_DIR 下） */
  static readonly SERVER_LOG: string = 'server.log';
  /** 沙箱工作区（服务端 cwd；opencode 的项目根 = cwd） */
  static readonly WORKSPACE_DIR: string = 'workspace';
  /** 工作区选择器插件目录（相对沙箱 config 根；opencode 的插件发现目录） */
  static readonly PLUGIN_DIR: string = 'opencode/plugin';
  /** 宿主能力桥文件信箱目录（Node 写 .req / ArkTS 泵读它；两侧同路径、同 UID） */
  static readonly MAILBOX_DIR: string = 'host-mailbox';
}

/** 环境变量名（与 payload/lib/env.js 镜像） */
export class EnvNames {
  static readonly XDG_DATA_HOME: string = 'XDG_DATA_HOME';
  static readonly XDG_CACHE_HOME: string = 'XDG_CACHE_HOME';
  static readonly XDG_CONFIG_HOME: string = 'XDG_CONFIG_HOME';
  static readonly XDG_STATE_HOME: string = 'XDG_STATE_HOME';
  static readonly OPENCODE_DB: string = 'OPENCODE_DB';
  static readonly OPENCODE_PASSWORD: string = 'OPENCODE_PASSWORD';
  static readonly OPENCODE_CLIENT: string = 'OPENCODE_CLIENT';
  static readonly OPENCODE_DISABLE_CHANNEL_DB: string = 'OPENCODE_DISABLE_CHANNEL_DB';
  static readonly OPENCODE_DISABLE_MODELS_FETCH: string = 'OPENCODE_DISABLE_MODELS_FETCH';
  static readonly OPENCODE_FILEWATCHER_DISABLE: string = 'OPENCODE_FILEWATCHER_DISABLE';
  static readonly OPENCODE_DISABLE_FFF: string = 'OPENCODE_DISABLE_FFF';
  static readonly OPENCODE_LOG_LEVEL: string = 'OPENCODE_LOG_LEVEL';
  static readonly OPENCODE_DISABLE_AUTOUPDATE: string = 'OPENCODE_DISABLE_AUTOUPDATE';
  static readonly NO_PROXY: string = 'NO_PROXY';
  static readonly NO_PROXY_LOWER: string = 'no_proxy';
  static readonly PATH: string = 'PATH';
  /** 本工程自定义：就绪 marker 的落点（Node 侧读它写文件） */
  static readonly ARK_READY_FILE: string = 'ARK_READY_FILE';
  /** 本工程自定义：服务端日志落点 */
  static readonly ARK_SERVER_LOG: string = 'ARK_SERVER_LOG';
  /** 本工程自定义：监听地址（127.0.0.1 / 0.0.0.0） */
  static readonly ARK_HOST: string = 'ARK_HOST';
  /** 非 SEA 产物读 `app-archive.bin` 的目录（不设 ⇒ `/` 空页） */
  /** 非 SEA 产物读 `app-archive.bin` 的目录（不设 ⇒ `/` 空页） */
  static readonly OPENCODE_NODE_ASSETS_DIR: string = 'OPENCODE_NODE_ASSETS_DIR';
  /** 本工程自定义：宿主能力桥文件信箱目录（Node 侧 host.js 与 ArkTS 泵读同一个串） */
  static readonly ARK_HOST_MAILBOX: string = 'ARK_HOST_MAILBOX';
  /** 版本（唯一事实源仍是 AppScope/app.json5；这里只做运行时透传） */
  static readonly ARK_VERSION: string = 'ARK_VERSION';
}

/** 启动阶段文案（上屏 + 日志同一份，C2） */
export class Stage {
  static readonly IDLE: string = 'idle|尚未启动';
  static readonly PASSWORD: string = '1/5|准备本地凭据';
  static readonly PAYLOAD: string = '2/5|检查应用载荷';
  static readonly STARTING: string = '3/5|启动内置运行时';
  static readonly WAITING: string = '4/5|等待本地服务就绪';
  static readonly LOADING: string = '5/5|加载界面';
  static readonly READY: string = 'ready|已就绪';
  static readonly FAILED: string = 'failed|启动失败';
}

/** 超时与节奏 */
export class Timing {
  /** 等待就绪的上限（首启含 import 大 bundle，给足余量） */
  static readonly READY_TIMEOUT_MS: number = 180000;
  /** 就绪轮询间隔 */
  static readonly READY_INTERVAL_MS: number = 500;
  /** 页面加载后的看门狗（超时仍无内容则判失败） */
  static readonly PAGE_WATCHDOG_MS: number = 30000;
}

/** 鉴权常量 */
export class Auth {
  /** 上游固定用户名（packages/server/src/auth.ts） */
  static readonly USERNAME: string = 'opencode';
  /** 口令最小长度（生成 64 hex，见 Connection） */
  static readonly MIN_PASSWORD_LENGTH: number = 32;
}
