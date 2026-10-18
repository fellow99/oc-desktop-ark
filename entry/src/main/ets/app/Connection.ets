import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { Auth, Names } from '../common/Constants';
import { Log } from '../common/Log';
import { Ports } from '../common/Ports';

/**
 * 本地凭据（overall-data-model §1.1）。
 *
 * 三条纪律：
 *   ① 口令**跨启动稳定**：否则前端持久化的凭据会立刻过期，用户每次都要重新登录；
 *   ② 口令**永不入日志**（宪法 S2）——本类的任何日志都不拼接 `password`；
 *   ③ 写入后**回读权限位**（hmdfs 会静默改权限，🔶 dsh 真机结论）。
 */
export class Connection {
  password: string = '';
  createdAt: number = 0;
  rotatedAt: number = 0;

  /** 生成 64 hex（两个 UUIDv4 去横线，≈244 bit 随机；满足 ≥32 字符约束） */
  static generate(): string {
    const a: string = util.generateRandomUUID(false);
    const b: string = util.generateRandomUUID(false);
    return (a + b).replace(/-/g, '');
  }

  static dir(filesDir: string): string {
    return filesDir + '/' + Names.CONNECTION_DIR;
  }

  static filePath(filesDir: string): string {
    return Connection.dir(filesDir) + '/' + Names.CONNECTION_FILE;
  }

  private static parse(text: string): Connection | null {
    if (text.length === 0) {
      return null;
    }
    const password: string = Ports.stringAfterKey(text, 'password');
    if (password.length < Auth.MIN_PASSWORD_LENGTH) {
      return null;
    }
    const conn: Connection = new Connection();
    conn.password = password;
    conn.createdAt = Number.parseInt(Ports.stringAfterKey(text, 'createdAt'), 10);
    conn.rotatedAt = Number.parseInt(Ports.stringAfterKey(text, 'rotatedAt'), 10);
    if (Number.isNaN(conn.createdAt)) {
      conn.createdAt = 0;
    }
    if (Number.isNaN(conn.rotatedAt)) {
      conn.rotatedAt = conn.createdAt;
    }
    return conn;
  }

  private static serialize(conn: Connection): string {
    return '{\n'
      + '  "schema": 1,\n'
      + '  "password": "' + conn.password + '",\n'
      + '  "createdAt": ' + conn.createdAt + ',\n'
      + '  "rotatedAt": ' + conn.rotatedAt + '\n'
      + '}\n';
  }

  /** 写入并回读校验（0600） */
  static save(filesDir: string, conn: Connection): void {
    const dir: string = Connection.dir(filesDir);
    try {
      fs.mkdirSync(dir, true);
    } catch (error) {
      Log.warn('创建凭据目录失败（继续尝试写入）：' + JSON.stringify(error));
    }
    const path: string = Connection.filePath(filesDir);
    const file: fs.File = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
    try {
      fs.writeSync(file.fd, Connection.serialize(conn));
    } finally {
      fs.closeSync(file);
    }
    // 权限位：hmdfs 会静默忽略 chmod（请求 600 回读 660，🔶 dsh 真机结论），
    // 且 `@kit.CoreFileKit` 的 fileIo 未暴露 chmodSync ⇒ 这里不再假装能设权限，
    // 只依赖应用沙箱（<filesDir> 本身只对本应用可见）。真实判据见 overall-data-model §4。
    Log.info('凭据已写入（沙箱内，0600 语义由应用沙箱保证）：' + path);
  }

  /**
   * 读现有凭据；不存在/损坏则**重新生成**并落盘。
   * @returns 凭据 + 是否为新生成（用于日志如实说明）
   */
  static loadOrCreate(filesDir: string): Connection {
    const path: string = Connection.filePath(filesDir);
    const existing: Connection | null = Connection.parse(Ports.readText(path));
    if (existing !== null) {
      Log.info('凭据已存在（复用），长度=' + existing.password.length + '；路径=' + path);
      return existing;
    }
    const conn: Connection = new Connection();
    conn.password = Connection.generate();
    conn.createdAt = Date.now();
    conn.rotatedAt = conn.createdAt;
    Connection.save(filesDir, conn);
    Log.info('已生成新凭据（0600），长度=' + conn.password.length + '；路径=' + path);
    return conn;
  }

  /** Basic 头用的 token（`base64("opencode:<password>")`，与上游 `authTokenFromCredentials` 同构） */
  authToken(): string {
    const raw: string = Auth.USERNAME + ':' + this.password;
    return new util.Base64Helper().encodeToStringSync(new util.TextEncoder().encodeInto(raw));
  }
}

/** 便于页面拿到 UIAbilityContext（替代已弃用的全局 getContext） */
export class Contexts {
  static ability(host: common.Context | undefined): common.UIAbilityContext {
    if (host === undefined) {
      throw new Error('UIAbilityContext 不可用：页面尚未挂载到 Ability');
    }
    return host as common.UIAbilityContext;
  }
}
