import { buffer } from '@kit.ArkTS';
import { fileIo as fs } from '@kit.CoreFileKit';
import { Log } from './Log';

/**
 * 就绪 marker 的解析结果。
 *
 * marker 由 **Node 侧**原子写（临时文件 + rename），字段见 overall-data-model §1.2。
 */
export class ReadyInfo {
  port: number = 0;
  host: string = '127.0.0.1';
  startedAt: number = 0;
  version: string = '';

  ok(): boolean {
    return this.port > 0 && this.port <= 65535;
  }

  url(): string {
    return 'http://' + this.host + ':' + this.port;
  }
}

/**
 * 端口 / 就绪判据工具。
 *
 * 设计取舍（与 pi-desktop-ark 同口径）：**手写解析**而非 `JSON.parse` ——
 * ArkTS 侧不需要为此引入动态对象类型，失败时还能直接给出「文本里有没有这个键」的证据。
 */
export class Ports {
  /** 读文本文件（读不到返回空串，不抛）。上限 64 KB，避免被写坏的 marker 拖垮 UI 线程 */
  static readText(path: string): string {
    if (path.length === 0) {
      return '';
    }
    try {
      if (!fs.accessSync(path)) {
        return '';
      }
      const stat: fs.Stat = fs.statSync(path);
      if (stat.size <= 0) {
        return '';
      }
      const size: number = stat.size > 65536 ? 65536 : stat.size;
      const file: fs.File = fs.openSync(path, fs.OpenMode.READ_ONLY);
      try {
        const ab: ArrayBuffer = new ArrayBuffer(size);
        const read: number = fs.readSync(file.fd, ab);
        if (read <= 0) {
          return '';
        }
        // 必须走 @kit.ArkTS 的 buffer：ArrayBuffer.toString() 在 ArkTS 里不是 UTF-8 解码
        return buffer.from(ab.slice(0, read)).toString('utf-8');
      } finally {
        fs.closeSync(file);
      }
    } catch (error) {
      Log.warn('读取失败 ' + path + '：' + JSON.stringify(error));
      return '';
    }
  }

  /** 取 `"key": <number>` 的数值；找不到返回 0（`Connection` 的 createdAt 也用它） */
  static numberAfterKey(text: string, key: string): number {
    const marker: string = '"' + key + '"';
    const at: number = text.indexOf(marker);
    if (at < 0) {
      return 0;
    }
    let i: number = at + marker.length;
    while (i < text.length && (text.charAt(i) === ':' || text.charAt(i) === ' ')) {
      i++;
    }
    let digits: string = '';
    while (i < text.length) {
      const ch: string = text.charAt(i);
      if (ch >= '0' && ch <= '9') {
        digits += ch;
        i++;
      } else {
        break;
      }
    }
    if (digits.length === 0) {
      return 0;
    }
    return Number.parseInt(digits, 10);
  }

  /** 取 `"key": "value"` 的字符串；找不到返回空串 */
  static stringAfterKey(text: string, key: string): string {
    const marker: string = '"' + key + '"';
    const at: number = text.indexOf(marker);
    if (at < 0) {
      return '';
    }
    let i: number = at + marker.length;
    while (i < text.length && (text.charAt(i) === ':' || text.charAt(i) === ' ')) {
      i++;
    }
    if (i >= text.length || text.charAt(i) !== '"') {
      return '';
    }
    i++;
    let value: string = '';
    while (i < text.length) {
      const ch: string = text.charAt(i);
      if (ch === '"') {
        break;
      }
      value += ch;
      i++;
    }
    return value;
  }

  /** 解析 marker 文本（不含 JSON 解析器） */
  static parseMarker(text: string): ReadyInfo {
    const info: ReadyInfo = new ReadyInfo();
    info.port = Ports.numberAfterKey(text, 'port');
    info.startedAt = Ports.numberAfterKey(text, 'startedAt');
    const host: string = Ports.stringAfterKey(text, 'host');
    info.host = host.length > 0 ? host : '127.0.0.1';
    info.version = Ports.stringAfterKey(text, 'version');
    return info;
  }

  /** 读 marker 文件并解析；文件不存在/非法时返回 `port = 0` */
  static readMarker(path: string): ReadyInfo {
    return Ports.parseMarker(Ports.readText(path));
  }

  /** 从库日志里找 `ARK_SERVER_READY {"port":N,...}` */
  static parseReadyLog(text: string): ReadyInfo {
    const at: number = text.lastIndexOf('ARK_SERVER_READY');
    if (at < 0) {
      return new ReadyInfo();
    }
    return Ports.parseMarker(text.substring(at));
  }

  /** 从库日志里找 `ARK_SERVER_FATAL {"reason":"..."}`（宿主可快速失败，不必等满超时） */
  static parseFatal(text: string): string {
    const at: number = text.lastIndexOf('ARK_SERVER_FATAL');
    if (at < 0) {
      return '';
    }
    const tail: string = text.substring(at);
    const reason: string = Ports.stringAfterKey(tail, 'reason');
    return reason.length > 0 ? reason : 'unknown（详见 server.log）';
  }
}
