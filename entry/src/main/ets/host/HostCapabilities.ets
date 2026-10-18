import { common, Want } from '@kit.AbilityKit';
import { NodeRuntime } from '@fellow99/node-bridge';
import { Log } from '../common/Log';
import { Ports } from '../common/Ports';

/**
 * 宿主能力桥的 ArkTS 侧（工程规划 §6；模块 104）。
 *
 * 纪律（库契约 §5.4 + 宪法 C1/C2）：
 *   ① 能力名用**冻结的七项**（`overall-data-model §1.5`）；未注册的调用在 Node 侧得到 `unregistered`；
 *   ② 注册了但本阶段未实现的能力**如实返回 not-implemented**，不假装能用；
 *   ③ 绝不调用未注册的宿主函数（旧壳 `ExternalWeb.Open` 的崩溃教训）。
 */
export class HostCapabilities {
  static readonly NAMES: string[] = [
    'runtime.facts',
    'perm.check',
    'perm.openAppInfo',
    'fs.pickFiles',
    'fs.pickFolder',
    'shell.openExternal',
    'notify.show'
  ];

  private static notImplemented(name: string): string {
    return '{"ok":false,"error":"not-implemented","detail":"' + name + ' 将在 Phase 2 实现"}';
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

    const deferred: string[] = ['perm.check', 'perm.openAppInfo', 'fs.pickFiles', 'fs.pickFolder', 'notify.show'];
    for (const name of deferred) {
      host.register(name, (argsJson: string): string => HostCapabilities.notImplemented(name));
      implemented++;
    }

    const summary: string = '宿主能力已注册 ' + implemented + ' 项（实现 2 项，其余如实 not-implemented）';
    Log.info(summary);
    return summary;
  }
}
