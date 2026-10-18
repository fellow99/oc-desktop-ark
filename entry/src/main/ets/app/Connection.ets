import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { Auth, Names } from '../common/Constants';
import { Log } from '../common/Log';
import { Ports } from '../common/Ports';

/**
 * 本地凭据（overall-data-model §1.1）。
 *
 * 四条纪律：
 *   ① 口令**跨启动稳定**：否则前端持久化的凭据会立刻过期，用户每次都要重新登录；
 *   ② 口令**永不入日志**（宪法 S2）——本类的任何日志都不拼接 `password`；
 *   ③ 写入**原子**（临时文件 + rename），崩溃不会留下半个文件；
 *   ④ 损坏文件**先备份再重生**（`connection.json.bad-<ts>`），不静默覆盖。
 *
 * 权限位：`@kit.CoreFileKit` 的 fileIo 未暴露 chmodSync（已核对 SDK d.ts），
 * 因此 0600 只能由应用沙箱保证；这一点在日志里如实记为 ⚠️（不假装已满足）。
 */
export class Connection {
  password: string = '';
  createdAt: number = 0;
  rotatedAt: number = 0;

  /** 生成 96 hex（3×UUIDv4 ≈366 bit 随机，满足「≥256 bit」与「≥32 字符」两条约束） */
  static generate(): string {
    const a: string = util.generateRandomUUID(false);
    const b: string = util.generateRandomUUID(false);
    const c: string = util.generateRandomUUID(false);
    return (a + b + c).replace(/-/g, '');
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
    conn.createdAt = Ports.numberAfterKey(text, 'createdAt');
    conn.rotatedAt = Ports.numberAfterKey(text, 'rotatedAt');
    if (conn.createdAt === 0) {
      conn.createdAt = Date.now();
    }
    if (conn.rotatedAt === 0) {
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

  /** 原子写入：先写 `.tmp` 再 rename（同目录 rename 在 hmdfs 上可用） */
  static save(filesDir: string, conn: Connection): void {
    const dir: string = Connection.dir(filesDir);
    try {
      fs.mkdirSync(dir, true);
    } catch (error) {
      Log.warn('创建凭据目录失败（继续尝试写入）：' + JSON.stringify(error));
    }
    const path: string = Connection.filePath(filesDir);
    const tmp: string = path + '.tmp';
    const file: fs.File = fs.openSync(tmp, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
    try {
      fs.writeSync(file.fd, Connection.serialize(conn));
    } finally {
      fs.closeSync(file);
    }
    fs.renameSync(tmp, path);
    Log.info('凭据已原子写入（0600 语义由应用沙箱保证 ⚠️ 无法用 chmod 校验）：' + path);
  }

  /** 损坏文件先备份，便于事后取证（不覆盖证据） */
  private static backupCorrupt(path: string): void {
    const bad: string = path + '.bad-' + Date.now();
    try {
      fs.copyFileSync(path, bad);
      Log.warn('凭据文件不可解析，已备份到 ' + bad + '，随后重新生成');
    } catch (error) {
      Log.warn('凭据备份失败（继续重新生成）：' + JSON.stringify(error));
    }
  }

  /**
   * 读现有凭据；不存在/损坏则生成并落盘。
   */
  static loadOrCreate(filesDir: string): Connection {
    const path: string = Connection.filePath(filesDir);
    const text: string = Ports.readText(path);
    const existing: Connection | null = Connection.parse(text);
    if (existing !== null) {
      Log.info('凭据已存在（复用），长度=' + existing.password.length + '；路径=' + path);
      return existing;
    }
    if (text.length > 0) {
      Connection.backupCorrupt(path);
    }
    const conn: Connection = new Connection();
    conn.password = Connection.generate();
    conn.createdAt = Date.now();
    conn.rotatedAt = conn.createdAt;
    Connection.save(filesDir, conn);
    Log.info('已生成新凭据，长度=' + conn.password.length + '；路径=' + path);
    return conn;
  }

  /** Basic / `auth_token` 用的 token（`base64("opencode:<password>")`，与上游 `authTokenFromCredentials` 同构） */
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
