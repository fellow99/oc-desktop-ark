import { common, Want } from '@kit.AbilityKit';
import { NodeRuntime } from '@fellow99/node-bridge';
import { Log } from '../common/Log';
import { Ports } from '../common/Ports';

/**
 * 宿主能力桥的 ArkTS 侧（工程规划 §6 第 8/9/10 条；模块 104）。
 *
 * 三条纪律（库契约 §5.4 + 宪法 C1）：
 *   ① 能力名用冻结字符串；未注册的调用在 Node 侧得到 `unregistered`（这是对的）；
 *   ② 注册了但未实现的能力**如实返回 not-implemented**，不假装能用（C2）；
 *   ③ 绝不调用未注册的宿主函数（旧壳 `ExternalWeb.Open` 就是这么把应用打崩的）。
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

  private static notImplemented(name: string): string {
    return '{"ok":false,"error":"not-implemented","detail":"' + name + ' 将在 Phase 2 实现"}';
  }

  private static ok(payload: string): string {
    return '{"ok":true,"result":' + payload + '}';
  }

  static install(runtime: NodeRuntime, context: common.UIAbilityContext): string {
    const host = runtime.host;
    let implemented: number = 0;

    host.register('runtime.facts', (argsJson: string): string => {
      return HostCapabilities.ok('{"platform":"openharmony","mode":"in-process","pid":' + process.pid
        + ',"filesDir":"' + context.filesDir + '"}');
    });
    implemented++;

    host.register('shell.openExternal', async (argsJson: string): Promise<string> => {
      const url: string = Ports.stringAfterKey(argsJson, 'url');
      if (url.length === 0) {
        return '{"ok":false,"error":"bad-args","detail":"缺少 url"}';
      }
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
        return '{"ok":false,"error":"scheme-rejected","detail":"只允许 http/https/mailto"}';
      }
      const want: Want = { action: 'ohos.want.action.viewData', uri: url };
      try {
        await context.startAbility(want);
        return HostCapabilities.ok('{"opened":true}');
      } catch (error) {
        Log.warn('openExternal 失败：' + JSON.stringify(error));
        return '{"ok":false,"error":"start-ability-failed","detail":"' + JSON.stringify(error) + '"}';
      }
    });
    implemented++;

    const deferred: string[] = ['perm.check', 'perm.request', 'perm.openAppInfo', 'fs.pickFiles',
      'fs.pickFolder', 'notify.show'];
    for (const name of deferred) {
      host.register(name, (argsJson: string): string => HostCapabilities.notImplemented(name));
      implemented++;
    }

    const summary: string = '宿主能力已注册 ' + implemented + ' 项（实现 2 项，其余如实 not-implemented）';
    Log.info(summary);
    return summary;
  }
}
