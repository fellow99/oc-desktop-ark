import { AbilityConstant, ConfigurationConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { Log } from '../common/Log';

/**
 * OC Desktop Ark 主 Ability（工程规划 §4.2）。
 *
 * 两条硬顺序（真机教训）：
 *   ① **先 `loadContent`，再起 Node**：权限弹窗若在首帧前出现会卡启动屏（APP_INPUT_BLOCK）；
 *   ② 起 Node 的动作放在**页面**里（`pages/Index`），这样阶段文本能直接画在界面上。
 *
 * 单实例由 `module.json5` 的 `launchType: "singleton"` 保证（多实例会互抢端口与数据目录）。
 */
export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    try {
      this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET);
    } catch (error) {
      Log.warn('setColorMode 失败：' + JSON.stringify(error));
    }

    // 调试通道：仅 debug 构建允许 `aa start ... --ps probeFlags "--jitless"`。
    // release 构建一律忽略（宪法 S5）。
    let flags: string = '--no-verify-heap';
    const debugBuild: boolean = this.context.applicationInfo.debug;
    if (debugBuild) {
      const params: Record<string, Object> | undefined = want.parameters;
      if (params !== undefined) {
        const raw: Object | undefined = params['probeFlags'];
        if (raw !== undefined) {
          const text: string = raw as string;
          if (text.length > 0) {
            flags = text;
          }
        }
      }
    } else {
      Log.info('probeFlags 调试通道在 release 构建中已禁用（applicationInfo.debug=false）');
    }
    AppStorage.setOrCreate<string>('nodeFlags', flags);
    Log.info('onCreate flags=' + flags + ' debug=' + debugBuild + ' filesDir=' + this.context.filesDir);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        Log.error('loadContent 失败：' + JSON.stringify(err));
        return;
      }
      Log.info('loadContent ok（随后由页面投递 Node）');
    });
  }

  onForeground(): void {
    Log.info('onForeground');
  }

  onBackground(): void {
    Log.info('onBackground（进程内 Node 随应用存活，不做后台保活）');
  }

  /**
   * 关停：进程内 Node 没有优雅退出接口，`shutdown()` 只是**标记位**。
   * 这里如实记录，不假装能停下来（宪法 C5 / 库契约 §2.6）。
   */
  onPrepareToTerminate(): boolean {
    Log.info('onPrepareToTerminate：进程内 Node 随应用结束（无优雅停止路径）');
    return false;
  }
}
