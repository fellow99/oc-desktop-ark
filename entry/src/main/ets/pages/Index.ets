import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { Contexts } from '../app/Connection';
import { OpencodeRuntime, LaunchResult } from '../app/OpencodeRuntime';
import { Log } from '../common/Log';
import { Stage } from '../common/Constants';

/**
 * 主界面（工程规划 §4.2 / §5.3；模块 103）。
 *
 * 形态：
 *   ① 未就绪时显示**应用内加载页**（阶段文本 + 颜色块），绝不白屏；
 *   ② 就绪后 `loadUrl('http://127.0.0.1:<port>/?auth_token=…')`，由本机服务渲染 UI；
 *   ③ 首屏成功后 `clearHistory()`（返回键不该回到加载页）；
 *   ④ 失败时切到错误页（阶段 + 原因 + 「请重启应用」），并保留诊断区。
 */
@Entry
@Component
struct Index {
  @State stage: string = Stage.IDLE;
  @State detail: string = '正在准备启动…';
  @State url: string = '';
  @State failed: boolean = false;
  @State errorText: string = '';
  @State pageLoaded: boolean = false;
  private controller: webview.WebviewController = new webview.WebviewController();
  private launched: boolean = false;
  private historyCleared: boolean = false;

  aboutToAppear(): void {
    this.start();
  }

  private abilityContext(): common.UIAbilityContext {
    const host: common.Context | undefined = this.getUIContext().getHostContext();
    return Contexts.ability(host);
  }

  private start(): void {
    if (this.launched) {
      return;
    }
    this.launched = true;
    const context: common.UIAbilityContext = this.abilityContext();
    OpencodeRuntime.get().launch(context, (stage: string) => {
      this.stage = stage;
      this.detail = stage;
      Log.info('阶段：' + stage);
    }).then((result: LaunchResult) => {
      if (!result.ok) {
        this.failed = true;
        this.stage = Stage.FAILED;
        this.errorText = result.message;
        return;
      }
      this.url = result.url;
      this.stage = Stage.READY;
      this.detail = '界面加载中…';
    }).catch((error: Object) => {
      this.failed = true;
      this.stage = Stage.FAILED;
      this.errorText = '启动编排异常：' + JSON.stringify(error);
      Log.error(this.errorText);
    });
  }

  build() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      if (this.url.length > 0) {
        Web({ src: this.url, controller: this.controller })
          .domStorageAccess(true)
          .databaseAccess(true)
          .javaScriptAccess(true)
          .fileAccess(false)
          .width('100%')
          .height('100%')
          .onPageEnd(() => {
            this.pageLoaded = true;
            this.detail = '已加载';
            if (!this.historyCleared) {
              this.historyCleared = true;
              try {
                this.controller.clearHistory();
              } catch (error) {
                Log.warn('clearHistory 失败：' + JSON.stringify(error));
              }
            }
          })
      } else {
        Column({ space: 12 }) {
          Text('OC Desktop Ark')
            .fontSize(22)
            .fontWeight(FontWeight.Bold)
          if (this.failed) {
            Text('启动失败')
              .fontSize(16)
              .fontColor('#B3261E')
            Text(this.errorText)
              .fontSize(13)
              .fontColor('#444444')
              .width('86%')
              .textAlign(TextAlign.Center)
            Text('请重启应用（进程内 Node 无法原地重启）')
              .fontSize(12)
              .fontColor('#777777')
          } else {
            LoadingProgress()
              .width(36)
              .height(36)
            Text(this.stage)
              .fontSize(14)
              .fontColor('#333333')
            Text(this.detail)
              .fontSize(12)
              .fontColor('#777777')
          }
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
      }

      // AI 生成内容标识（合规 G6）：常驻灰字
      Text('内容由 AI 生成，仅供参考')
        .fontSize(11)
        .fontColor('#999999')
        .margin({ right: 12, bottom: 8 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#FFFFFF')
  }
}
