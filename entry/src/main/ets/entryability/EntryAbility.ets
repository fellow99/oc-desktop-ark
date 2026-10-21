 import { AbilityConstant, ConfigurationConstant, UIAbility, Want } from '@kit.AbilityKit';
 import { window } from '@kit.ArkUI';
 import { Log } from '../common/Log';
import { decision as nodeModeDecision, NodeModeDecision } from '../common/NodeMode';

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

     // 110-jitless：Node 运行形态由**编译期常量** `BuildConfig.NODE_MODE` 决定（默认 compat）。
     // 运行期**没有**任何形态切换入口（无 probeFlags / want 参数 / 设置项 / ACL 探测参与决策）——
     // `--jitless` 是进程级形态，一次误判 = 整机不可用（见 common/NodeMode.ets 文件头）。
    const decision: NodeModeDecision = nodeModeDecision();
     const flags: string = decision.flags();
     const debugBuild: boolean = this.context.applicationInfo.debug;
     AppStorage.setOrCreate<string>('nodeFlags', flags);
     AppStorage.setOrCreate<string>('nodeMode', decision.mode);
     Log.info('onCreate ' + decision.describe() + ' flags=' + flags
       + ' debug=' + debugBuild + ' filesDir=' + this.context.filesDir);
 
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
