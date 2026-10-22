import { abilityAccessCtrl, bundleManager, common, Permissions, Want } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { NodeRuntime } from '@fellow99/node-bridge';
import { Log } from '../common/Log';
import { Ports } from '../common/Ports';

/**
 * 宿主能力桥的 ArkTS 侧（工程规划 §6；模块 104）。
 *
 * 纪律（库契约 §5.4 + 宪法 C1/C2）：
 *   ① 能力名用**冻结的八项**（`overall-data-model §1.5`）；未注册的调用在 Node 侧得到 `unregistered`；
 *   ② 注册了但本阶段未实现的能力**如实返回 not-implemented**，不假装能用；
 *   ③ 绝不调用未注册的宿主函数（旧壳 `ExternalWeb.Open` 的崩溃教训）。
 *
 * 权限能力（perm.check / perm.request / perm.openAppInfo）服务于「工作区选择器」的
 * 文档/下载两根（docs/ACL配置.md §3）。交互契约：点 Tab **不请求**（走 check），
 * 点「请求权限」才走 request；`requestPermissionsFromUser` 是**异步**能力（等用户点按），
 * 因此注册为 `Promise<string>`，由文件信箱的 `dispatchAsync` 分发。
 */
export class HostCapabilities {
  static readonly NAMES: string[] = [
    'runtime.facts',
    'perm.check',
    'perm.request',
    'perm.openAppInfo',
    'fs.pickFiles',
    'fs.pickFolder',
    'shell.openExternal',
    'notify.show'
  ];

  /**
   * `perm.request` 的上限（ms）。
   *
   * 为什么必须有：文件信箱的派发是**串行**的（一个 promise 不 resolve，后面的消息全部不派发）。
   * 本 runtime 对「文件和文件夹」权限可能既不弹窗也不回调 ⇒ 不设上限会把整个宿主能力面卡死。
   * 取 10 s：足够覆盖正常的用户点按，又不至于让 UI 长时间无反馈。
   */
  static readonly REQUEST_TIMEOUT_MS: number = 10000;

  /** 给任意 Promise 加超时：超时返回 `undefined`（调用方据此如实上报，不假装成功）。 */
  private static withTimeout<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
    let handle: number = -1;
    const guard: Promise<undefined> = new Promise<undefined>((resolve: (value: undefined) => void) => {
      handle = setTimeout(() => {
        resolve(undefined);
      }, ms);
    });
    // work 先结束时清定时器（否则每次成功申请都留一个 10 s 的唤醒，测试里会拖住事件循环）
    const clear = (): void => {
      if (handle !== -1) {
        clearTimeout(handle);
        handle = -1;
      }
    };
    return Promise.race([work as Promise<T | undefined>, guard]).finally(clear);
  }

  private static notImplemented(name: string): string {
    return '{"ok":false,"error":"not-implemented","detail":"' + name + ' 将在后续阶段实现"}';
  }

  private static ok(payload: string): string {
    return '{"ok":true,"result":' + payload + '}';
  }
  private static fail(code: string, detail: string): string {
    // 必须整体 JSON.stringify：手拼会把 detail 里的引号变成非法 JSON
    return JSON.stringify({ ok: false, error: code, detail: detail });
  }

  static install(runtime: NodeRuntime, context: common.UIAbilityContext): string {
    const host = runtime.host;
    let implemented: number = 0;

    host.register('runtime.facts', (argsJson: string): string => {
      return HostCapabilities.ok('{"platform":"openharmony","mode":"in-process","filesDir":"'
        + context.filesDir + '"}');
    });
    implemented++;

    host.register('shell.openExternal', async (argsJson: string): Promise<string> => {
      const url: string = Ports.stringAfterKey(argsJson, 'url');
      if (url.length === 0) {
        Log.warn('shell.openExternal 缺少 url（已拒绝）');
        return HostCapabilities.fail('bad-args', '缺少 url');
      }
      // 只允许 http/https（FR-104-012）；其余一律拒绝并记录
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        Log.warn('shell.openExternal 拒绝非 http(s) 链接：' + url);
        return HostCapabilities.fail('scheme-rejected', '只允许 http/https');
      }
      const want: Want = { action: 'ohos.want.action.viewData', uri: url };
      try {
        await context.startAbility(want);
        return HostCapabilities.ok('{"opened":true}');
      } catch (error) {
        Log.warn('openExternal 失败：' + JSON.stringify(error));
        return HostCapabilities.fail('start-ability-failed', String(error));
      }
    });
    implemented++;

    // perm.check：权限预检（点 Tab 时，**不请求**）。同步能力。
    host.register('perm.check', (argsJson: string): string => {
      return HostCapabilities.permCheck(argsJson);
    });
    implemented++;

    // perm.request：主动申请目录权限（点「请求权限」按钮时）。异步（等用户点按）。
    host.register('perm.request', (argsJson: string): Promise<string> => {
      return HostCapabilities.permRequest(context, argsJson);
    });
    implemented++;

    // perm.openAppInfo：深链到本应用信息页（权限归因落地）。异步。
    host.register('perm.openAppInfo', (argsJson: string): Promise<string> => {
      return HostCapabilities.openAppInfo(context, argsJson);
    });
    implemented++;

    const deferred: string[] = ['fs.pickFiles', 'fs.pickFolder', 'notify.show'];
    for (const name of deferred) {
      host.register(name, (argsJson: string): string => HostCapabilities.notImplemented(name));
      implemented++;
    }

    const summary: string = '宿主能力已注册 ' + implemented + ' 项（实现 5 项：runtime.facts / shell.openExternal / perm.check / perm.request / perm.openAppInfo；其余如实 not-implemented）';
    Log.info(summary);
    return summary;
  }

  /**
   * `perm.check`：查当前权限授予状态（对齐 pi 的 `checkAccessTokenSync`）。
   *
   * ⚠️ 真机已知偏差（pi 同源，工程规划 §5 第 9 条）：授予后 `checkPermission` 仍可能返回 false
   * （假阴性）。因此返回带 `hint`，让调用方知道「false 不等于不能用」，最终以真实读写（browse）为准。
   */
  private static permCheck(argsJson: string): string {
    const permission: string = Ports.stringAfterKey(argsJson, 'name');
    if (permission.length === 0) {
      return HostCapabilities.fail('bad-args', '缺少 name 字段');
    }
    let granted: boolean = false;
    let detail: string = '';
    try {
      const info: bundleManager.BundleInfo = bundleManager.getBundleInfoForSelfSync(
        bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
      const tokenId: number = info.appInfo.accessTokenId;
      const manager: abilityAccessCtrl.AtManager = abilityAccessCtrl.createAtManager();
      // 权限名来自能力参数（动态字符串）：显式断言（协议要求 Permissions 字面量联合），
      // 非法名字由 API 自己报错并被 catch 成结构化 detail —— 不预判、不吞错。
      const status: abilityAccessCtrl.GrantStatus = manager.checkAccessTokenSync(
        tokenId, permission as Permissions);
      granted = status === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
      detail = 'checkAccessTokenSync 返回 ' + status + (granted ? '（PERMISSION_GRANTED）' : '（未授予）');
    } catch (e) {
      detail = '权限查询失败：' + JSON.stringify(e);
      Log.error('perm.check 失败：' + detail);
    }
    return JSON.stringify({
      ok: true,
      capability: 'perm.check',
      permission: permission,
      granted: granted,
      detail: detail,
      hint: '真机已知假阴性：授予后仍可能报 false；判断能不能用请看真实读写结果（browse 是否 200）'
    });
  }

  /**
   * `perm.request`：对话框内主动弹授权窗。
   *
   * 为什么必须「主动申请」：`checkAccessTokenSync` 只读当前状态；`user_grant` 类权限若从不申请，
   * 调用方永远看到 `granted:false`，而用户也不知道该去哪儿点。
   *
   * 参数：`{ "permissions": ["ohos.permission.…"] }`（优先）或 `{ "name": "…" }`（单值简写）。
   * 返回逐项 `authResult`（0 = 已授予，-1 = 拒绝，2 = 请求无效）：**逐项上报**，不聚合成一个布尔。
   */
  private static async permRequest(context: common.UIAbilityContext, argsJson: string): Promise<string> {
    const list: string[] = HostCapabilities.permissionList(argsJson);
    if (list.length === 0) {
      const single: string = Ports.stringAfterKey(argsJson, 'name');
      if (single.length > 0) {
        list.push(single);
      }
    }
    if (list.length === 0) {
      return HostCapabilities.fail('bad-args', '需要 permissions 数组或 name 字段');
    }
    const typed: Permissions[] = [];
    for (const p of list) {
      typed.push(p as Permissions);
    }
    try {
      const manager: abilityAccessCtrl.AtManager = abilityAccessCtrl.createAtManager();
      // 真机取证（2026-10-22）：本 runtime 上这两项「文件和文件夹」权限**可能不弹窗**，此时
      // `requestPermissionsFromUser` 的 Promise 永不 resolve ⇒ 文件信箱的**串行**派发泵会被卡死，
      // 之后所有宿主能力（含 perm.check）永久超时、只有重启应用才能恢复。
      // 因此这里必须设上限：超时即如实返回 `timeout:true`，由 UI 引导去系统设置开启后点「刷新」。
      const result = await HostCapabilities.withTimeout(
        manager.requestPermissionsFromUser(context, typed), HostCapabilities.REQUEST_TIMEOUT_MS);

      if (result === undefined) {
        Log.warn('perm.request 超时（' + HostCapabilities.REQUEST_TIMEOUT_MS +
          'ms 未返回）：本 runtime 可能不弹窗，需在系统设置里手动开启');
        return JSON.stringify({
          ok: true,
          capability: 'perm.request',
          requested: list.length,
          granted: 0,
          denied: 0,
          timeout: true,
          results: []
        });
      }
      let grantedCount: number = 0;
      let deniedCount: number = 0;
      const rows: string[] = [];
      for (let i = 0; i < result.permissions.length; i++) {
        const code: number = i < result.authResults.length ? result.authResults[i] : -1;
        const okItem: boolean = code === 0;
        if (okItem) {
          grantedCount = grantedCount + 1;
        } else {
          deniedCount = deniedCount + 1;
        }
        rows.push(JSON.stringify({ permission: result.permissions[i], authResult: code, granted: okItem }));
      }
      Log.info('perm.request：申请 ' + list.length + ' 项，授予 ' + grantedCount + '，拒绝 ' + deniedCount);
      // 内联进 JSON.stringify（与 perm.check/openAppInfo 同形）：先把字面量赋给 `Object` 会触发
      // arkts-no-untyped-obj-literals（Object 无声明形状，字面量无从对应）。
      return JSON.stringify({
        ok: true,
        capability: 'perm.request',
        requested: list.length,
        granted: grantedCount,
        denied: deniedCount,
        results: JSON.parse('[' + rows.join(',') + ']')
      });
    } catch (e) {
      const err = e as BusinessError;
      const code: number = typeof err.code === 'number' ? err.code : -1;
      const message: string = typeof err.message === 'string' ? err.message : String(e);
      Log.error('perm.request 失败：' + code + '｜' + message);
      return HostCapabilities.fail('request-failed', code + '｜' + message);
    }
  }

  /**
   * `perm.openAppInfo`：跳到本应用的「应用信息」页（权限归因的落地动作）。
   *
   * 为什么不是 `openApplicationInfoEntry`：**本 SDK 没有这个 API**（pi 同源实测）。
   * 系统设置页的公开入口是 want 的 action `ohos.settings.application.details`。
   * `parameters` 里同时给 `bundleName` 与 `pushParams` 两种键（不同版本设置应用取不同键）。
   */
  private static async openAppInfo(context: common.UIAbilityContext, argsJson: string): Promise<string> {
    let self: string = '';
    try {
      const info: bundleManager.BundleInfo = bundleManager.getBundleInfoForSelfSync(
        bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT);
      self = info.name;
    } catch (e) {
      return HostCapabilities.fail('bundle-info-unavailable', String(e));
    }
    if (self.length === 0) {
      return HostCapabilities.fail('bundle-info-unavailable', 'getBundleInfoForSelfSync 返回的 name 为空');
    }
    const params: Record<string, Object> = { 'bundleName': self, 'pushParams': self };
    const want: Want = {
      bundleName: 'com.huawei.hmos.settings',
      abilityName: 'com.huawei.hmos.settings.MainAbility',
      action: 'ohos.settings.application.details',
      parameters: params
    };
    try {
      await context.startAbility(want);
      return JSON.stringify({ ok: true, capability: 'perm.openAppInfo', bundleName: self, target: 'system-settings' });
    } catch (e) {
      Log.warn('perm.openAppInfo 失败：' + String(e));
      return HostCapabilities.fail('deep-link-failed', String(e) + '；请手动打开「设置 → 应用和元服务 → OC Desktop Ark → 权限」');
    }
  }

  /**
   * 从能力参数 JSON 里取一个**字符串数组**字段（`{"permissions":["a","b"]}`）。
   *
   * 为什么手写而不用 `JSON.parse(...) as Record<string,string[]>`：能力参数是**外部输入**
   * （Node 侧拼出来的），解析失败必须退化成「空数组」，而不是把异常抛进宿主桥。
   * 只做最小解析：找到键、跳到 `[`、逐个取引号内文本。畸形输入返回空数组（调用方按 bad-args 拒绝）。
   */
  private static permissionList(argsJson: string): string[] {
    const out: string[] = [];
    if (argsJson.length === 0) {
      return out;
    }
    const keyAt: number = argsJson.indexOf('"permissions"');
    if (keyAt < 0) {
      return out;
    }
    let i: number = argsJson.indexOf('[', keyAt);
    if (i < 0) {
      return out;
    }
    i++;
    while (i < argsJson.length) {
      const ch: string = argsJson.charAt(i);
      if (ch === ']') {
        break;
      }
      if (ch !== '"') {
        i++;
        continue;
      }
      let j: number = i + 1;
      let text: string = '';
      while (j < argsJson.length) {
        const c: string = argsJson.charAt(j);
        if (c === '\\' && j + 1 < argsJson.length) {
          const next: string = argsJson.charAt(j + 1);
          if (next === '"' || next === '\\') {
            text += next;
            j += 2;
            continue;
          }
          text += c;
          j++;
          continue;
        }
        if (c === '"') {
          break;
        }
        text += c;
        j++;
      }
      if (text.length > 0) {
        out.push(text);
      }
      i = j + 1;
    }
    return out;
  }
}
