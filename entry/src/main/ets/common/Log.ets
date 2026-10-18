import { hilog } from '@kit.PerformanceAnalysisKit';

/** 统一日志域与标签（诊断面板 / hilog 都用它） */
export const LOG_DOMAIN: number = 0x0c00;
export const LOG_TAG: string = 'OCArk';

/** 统一日志出口：一行一个事件，前缀固定，便于 hilog 过滤与截图取证 */
export class Log {
  static info(message: string): void {
    hilog.info(LOG_DOMAIN, LOG_TAG, '[ark] %{public}s', message);
  }

  static warn(message: string): void {
    hilog.warn(LOG_DOMAIN, LOG_TAG, '[ark] %{public}s', message);
  }

  static error(message: string): void {
    hilog.error(LOG_DOMAIN, LOG_TAG, '[ark] %{public}s', message);
  }
}
