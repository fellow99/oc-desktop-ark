import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { Contexts } from '../app/Connection';
import { OpencodeRuntime, LaunchResult } from '../app/OpencodeRuntime';
import { Log } from '../common/Log';
import { Stage, Timing } from '../common/Constants';

/**
 * 主界面（工程规划 §4.2 / §5.3；模块 103）。
 *
 * 形态：
 *   ① 未就绪时显示**应用内加载页**（阶段文本），绝不白屏；
 *   ② 就绪后 `loadUrl('http://127.0.0.1:<port>/?auth_token=…')`，由本机服务渲染 UI；
 *   ③ 首屏成功后 `clearHistory()`（仅当 URL 属于本机服务）；
 *   ④ 加载失败 / HTTP 错误 / 看门狗超时 ⇒ 错误页（阶段 + 原因 + 「请重启应用」）。
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
  private watchdog: number = -1;

  aboutToAppear(): void {
    this.start();
  }

  aboutToDisappear(): void {
    this.clearWatchdog();
  }

  private abilityContext(): common.UIAbilityContext {
    const host: common.Context | undefined = this.getUIContext().getHostContext();
    return Contexts.ability(host);
  }

  private clearWatchdog(): void {
    if (this.watchdog >= 0) {
      clearTimeout(this.watchdog);
      this.watchdog = -1;
    }
  }

  private fail(reason: string): void {
    if (this.failed) {
      return;
    }
    this.clearWatchdog();
    this.failed = true;
    this.stage = Stage.FAILED;
    this.errorText = reason;
    Log.error('界面失败：' + reason);
  }

  private start(): void {
    if (this.launched) {
      return;
    }
    this.launched = true;
    let context: common.UIAbilityContext;
    try {
      context = this.abilityContext();
    } catch (error) {
      this.fail('无法获取 UIAbilityContext：' + JSON.stringify(error));
      return;
    }
    OpencodeRuntime.get().launch(context, (stage: string) => {
      this.stage = stage;
      this.detail = stage;
      Log.info('阶段：' + stage);
    }).then((result: LaunchResult) => {
      if (!result.ok) {
        this.fail(result.message);
        return;
      }
      this.url = result.url;
      this.stage = Stage.READY;
      this.detail = '界面加载中…';
      // 看门狗：loadUrl 失败可能不触发 onPageEnd（例如 ArkWeb 访问不到 loopback）
      this.watchdog = setTimeout(() => {
        if (!this.pageLoaded) {
          this.fail('界面在 ' + Timing.PAGE_WATCHDOG_MS + ' ms 内未加载完成；'
            + '可能是 ArkWeb 无法访问本机服务（见 P0-D 探针）');
        }
      }, Timing.PAGE_WATCHDOG_MS);
    }).catch((error: Object) => {
      this.fail('启动编排异常：' + JSON.stringify(error));
    });
  }

  /** 只有本机服务地址才清历史，避免把外链也清掉 */
  private isLocalServiceUrl(loaded: string): boolean {
    const local: string = this.url.length > 0 ? this.url : '';
    if (local.length === 0 || loaded.length === 0) {
      return false;
    }
    const cut: number = local.indexOf('?');
    const origin: string = cut > 0 ? local.substring(0, cut) : local;
    return loaded.startsWith(origin);
  }

  private onLoaded(loaded: string): void {
    this.pageLoaded = true;
    this.detail = '已加载';
    this.clearWatchdog();
    if (!this.historyCleared && this.isLocalServiceUrl(loaded)) {
      this.historyCleared = true;
      try {
        this.controller.clearHistory();
      } catch (error) {
        Log.warn('clearHistory 失败：' + JSON.stringify(error));
      }
    }
  }

  build() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      if (this.url.length > 0 && !this.failed) {
        Web({ src: this.url, controller: this.controller })
          .domStorageAccess(true)
          .databaseAccess(true)
          .javaScriptAccess(true)
          .fileAccess(false)
          .width('100%')
          .height('100%')
          .onPageEnd(() => {
            this.onLoaded(this.controller.getUrl());
          })
          .onErrorReceive((event: OnErrorReceiveEvent) => {
            const url: string = event.request.getRequestUrl();
            const info: string = event.error.getErrorInfo();
            this.fail('界面加载失败（' + url + '）：' + info);
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
