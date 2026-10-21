import { abilityAccessCtrl, bundleManager, Permissions } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { Log } from './Log';
import { NODE_MODE } from './BuildConfig';
import { Names } from './Constants';

/**
 * 110-jitless：**Node 运行形态**（jit / compat）。
 *
 * 背景：无 ACL（`ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY` 未授予）时 V8 只能
 * `--jitless` 运行 ⇒ `WebAssembly` 整个对象不存在 ⇒ 载荷里依赖 WASM 的模块（undici 的
 * llhttp ⇒ fetch、photon 图片、tree-sitter 语义搜索）全部失效；无 ACL 却按 jit 起就是
 * **启动即崩**（SIGTRAP/SIGABRT），不是「变慢」。
 *
 * **形态由编译期常量决定**（`BuildConfig.NODE_MODE`，默认 `compat`）—— 运行期**没有**调试
 * 参数、没有设置项、没有 ACL 探测参与决策。理由见 `BuildConfig.ets` 文件头与
 * `docs/ACL-无ACL评估.md`（手机 `JUY-AL80` 上权限 granted 仍 SIGTRAP ⇒ 权限位不可预检）。
 *
 * 纪律：本文件**不引 UI**（只用 `Log` 打事实 + 返回纯数据 + 写证据文件），因此可脱离页面推演。
 */

/** 形态常量（与 `specs/110-jitless/spec.md` §2 术语一致） */
export const NODE_MODE_JIT: string = 'jit';
export const NODE_MODE_COMPAT: string = 'compat';

/** 交给库的 Node 参数（`--jitless` 由本模块按形态追加；库保证 flags 全部排在脚本路径之前） */
const BASE_FLAGS: string = '--no-verify-heap';
const JITLESS_FLAG: string = '--jitless';

/** JIT 所需的 ACL（`system_basic` + `provisionEnable`，见 module.json5 与 docs/ACL配置.md） */
const ACL_WRITABLE_CODE_MEMORY: string = 'ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY';

/** 权限探测读数（ArkTS 不接受匿名结构体） */
export class AclProbe {
  readonly granted: boolean;
  readonly detail: string;

  constructor(granted: boolean, detail: string) {
    this.granted = granted;
    this.detail = detail;
  }
}

/** 形态判定结果（含**依据**：只报形态不报依据，出问题时无法归因） */
export class NodeModeDecision {
  readonly mode: string;
  readonly reason: string;

  constructor(mode: string, reason: string) {
    this.mode = mode;
    this.reason = reason;
  }

  isCompat(): boolean {
    return this.mode === NODE_MODE_COMPAT;
  }

  /** 实际交给库的 flags 串（compat 带 `--jitless`，jit 不带） */
  flags(): string {
    return this.isCompat() ? BASE_FLAGS + ' ' + JITLESS_FLAG : BASE_FLAGS;
  }

  /** 一行可读事实（hilog / 诊断串共用） */
  describe(): string {
    return 'mode=' + this.mode + '（依据：' + this.reason + '）';
  }
}

/**
 * 探测 JIT 所需的 ACL 当前是否被授予（**只用于诊断依据串，不参与形态决策**）。
 *
 * 为什么用 `checkAccessTokenSync`：ACL 是**签名 Profile** 授予的系统级权限（`system_basic`），
 * 运行时申请不会弹窗也不会通过；我们只需要知道「现在有没有」。
 * 查询失败 ⇒ 按**未授予**处理：compat 只是慢，jit 在无 ACL 设备上是**必崩**，两害相权只能选慢。
 */
export function probeJitAcl(): AclProbe {
  try {
    const info: bundleManager.BundleInfo = bundleManager.getBundleInfoForSelfSync(
      bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
    const tokenId: number = info.appInfo.accessTokenId;
    const manager: abilityAccessCtrl.AtManager = abilityAccessCtrl.createAtManager();
    const status: abilityAccessCtrl.GrantStatus =
      manager.checkAccessTokenSync(tokenId, ACL_WRITABLE_CODE_MEMORY as Permissions);
    const granted: boolean = status === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
    return new AclProbe(granted, ACL_WRITABLE_CODE_MEMORY + ' → ' + status
      + (granted ? '（PERMISSION_GRANTED）' : '（未授予）'));
  } catch (e) {
    const detail: string = '权限查询失败：' + JSON.stringify(e);
    Log.warn('NodeMode：ACL 探测异常，仅影响诊断依据（不改变形态）｜' + detail);
    return new AclProbe(false, detail);
  }
}

/**
 * 解析本次启动形态 —— **只认编译期常量**（`BuildConfig.NODE_MODE`）。
 * 切到 jit 的唯一方式：把 `BuildConfig.NODE_MODE` 改成 `'jit'` 后重新构建。
 */
export function resolve(): NodeModeDecision {
  const probe: AclProbe = probeJitAcl();
  const built: string = NODE_MODE === NODE_MODE_JIT ? NODE_MODE_JIT : NODE_MODE_COMPAT;
  const detail: string = '编译期常量 BuildConfig.NODE_MODE=' + built
    + '（运行期不可切换）｜诊断读数：' + probe.detail;
  return new NodeModeDecision(built, detail);
}

/**
 * 形态证据落盘（FR-110-001 §3 / FR-110-009）。
 *
 * 为什么落盘：部分机型（尤其手机）对三方应用的 hilog **完全不可见**，`node-mode.json` 是
 * 唯一可靠的「这次启动是什么形态、为什么」的持久证据。写失败不得影响启动。
 *
 * @param filesDir 应用 filesDir（证据写到 `<filesDir>/payload/node-mode.json`）
 * @param decision 形态判定结果
 * @param debugBuild 是否 debug 构建（`applicationInfo.debug`）
 */
export function writeNodeModeEvidence(filesDir: string, decision: NodeModeDecision, debugBuild: boolean): void {
  try {
    const dir: string = filesDir + '/payload';
    try {
      fs.mkdirSync(dir, true);
    } catch {
      // 目录已存在
    }
    const record: Record<string, string | boolean> = {
      'schema': '1',
      'mode': decision.mode,
      'reason': decision.reason,
      'flags': decision.flags(),
      'debugBuild': debugBuild,
      'writtenAt': new Date().toISOString(),
    };
    const payload: string = JSON.stringify(record, null, 2) + '\n';
    const file: string = dir + '/' + Names.NODE_MODE_FILE;
    const fh = fs.openSync(file, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
    try {
      fs.writeSync(fh.fd, payload);
    } finally {
      fs.closeSync(fh);
    }
    Log.info('node-mode 证据已写：' + file + '（mode=' + decision.mode + '）');
  } catch (e) {
    Log.warn('node-mode 证据写失败（不影响启动）：' + JSON.stringify(e));
  }
}
