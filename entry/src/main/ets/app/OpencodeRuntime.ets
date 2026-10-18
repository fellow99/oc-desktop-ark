import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { NodeLogEntry, NodeRuntime, NodeRuntimeOptions } from '@fellow99/node-bridge';
import { EnvNames, Names, Stage, Timing } from '../common/Constants';
import { Log } from '../common/Log';
import { Ports, ReadyInfo } from '../common/Ports';
import { HostCapabilities } from '../host/HostCapabilities';
import { Connection } from './Connection';
import { Payload, PayloadPlan, PayloadRoute } from './Payload';

/** 启动结果（供页面直接渲染，成功/失败都带人读原因） */
export class LaunchResult {
  ok: boolean = false;
  url: string = '';
  message: string = '';
}

/**
 * 启动编排（工程规划 §4.2 / §5.2；模块 101）。
 *
 * 五阶段与判据：
 *   1 凭据：`Connection.loadOrCreate`（原子写；损坏先备份）
 *   2 载荷：`Payload.plan`（判据 = 上游产物，不是宿主脚本）
 *   3 投递：`NodeRuntime.start`（返回 ok ≠ 就绪，C2）
 *   4 就绪：marker / 本轮日志 `ARK_SERVER_READY`；`ARK_SERVER_FATAL` 快速失败
 *   5 加载：页面 `loadUrl(url + '?auth_token=' + encodeURIComponent(token))`
 */
export class OpencodeRuntime {
  private static instance: OpencodeRuntime | null = null;
  private runtime: NodeRuntime = NodeRuntime.getInstance();
  private launched: boolean = false;
  private startedAt: number = 0;
  private connection: Connection = new Connection();
  private attempts: number = 0;

  static get(): OpencodeRuntime {
    if (OpencodeRuntime.instance === null) {
      OpencodeRuntime.instance = new OpencodeRuntime();
    }
    return OpencodeRuntime.instance;
  }

  private static wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  private buildEnv(context: common.UIAbilityContext, plan: PayloadPlan, readyPath: string,
    serverLog: string): Record<string, string> {
    const env: Record<string, string> = {};
    env[EnvNames.XDG_DATA_HOME] = context.filesDir + '/data';
    env[EnvNames.XDG_CACHE_HOME] = context.filesDir + '/cache';
    env[EnvNames.XDG_CONFIG_HOME] = context.filesDir + '/config';
    env[EnvNames.XDG_STATE_HOME] = context.filesDir + '/state';
    env[EnvNames.OPENCODE_DB] = context.filesDir + '/data/opencode/opencode.db';
    env[EnvNames.OPENCODE_DISABLE_CHANNEL_DB] = '1';
    env[EnvNames.OPENCODE_DISABLE_MODELS_FETCH] = '1';
    env[EnvNames.OPENCODE_FILEWATCHER_DISABLE] = '1';
    env[EnvNames.OPENCODE_DISABLE_FFF] = '1';
    env[EnvNames.OPENCODE_DISABLE_AUTOUPDATE] = '1';
    env[EnvNames.OPENCODE_CLIENT] = 'desktop';
    env[EnvNames.OPENCODE_LOG_LEVEL] = 'info';
    env[EnvNames.OPENCODE_PASSWORD] = this.connection.password;
    // 非 SEA 产物从该变量读 app-archive.bin；不设 ⇒ `/` 空页（review Important-1）
    env[EnvNames.OPENCODE_NODE_ASSETS_DIR] = plan.readonlyRoot + '/assets';
    env[EnvNames.NO_PROXY] = '127.0.0.1,localhost,::1';
    env[EnvNames.NO_PROXY_LOWER] = '127.0.0.1,localhost,::1';
    env[EnvNames.PATH] = '/system/bin:' + context.filesDir + '/bin';
    env[EnvNames.ARK_READY_FILE] = readyPath;
    env[EnvNames.ARK_SERVER_LOG] = serverLog;
    env[EnvNames.ARK_HOST] = '127.0.0.1';
    env[EnvNames.ARK_VERSION] = '2.0.26';
    return env;
  }

  /** 汇总本轮日志文本（`at=0` 的行保留；可解析时间的按 `startedAt` 过滤上一轮） */
  private logsSince(count: number): string {
    const entries: NodeLogEntry[] = this.runtime.logs(count);
    let text: string = '';
    for (const entry of entries) {
      if (entry.at === 0 || entry.at >= this.startedAt) {
        text += entry.text + '\n';
      }
    }
    return text;
  }

  /**
   * 执行启动（幂等：重复调用直接返回失败，避免第二次 `node::Start`）。
   */
  async launch(context: common.UIAbilityContext, onStage: (stage: string) => void): Promise<LaunchResult> {
    const result: LaunchResult = new LaunchResult();
    if (this.launched) {
      result.message = '运行时已投递过（node::Start 每进程一次）；若未就绪请重启应用';
      return result;
    }
    this.startedAt = Date.now();
    this.launched = true;

    // 1/5 凭据
    onStage(Stage.PASSWORD);
    this.connection = Connection.loadOrCreate(context.filesDir);

    // 2/5 载荷
    onStage(Stage.PAYLOAD);
    const plan: PayloadPlan = Payload.plan(context);
    if (plan.route !== PayloadRoute.READONLY) {
      result.message = plan.decision;
      Log.error('启动失败（载荷）：' + plan.decision);
      return result;
    }

    // 目录与「作废旧 marker」（FR-101-003：投递前删除 + 记一条作废日志）
    const readyPath: string = context.filesDir + '/payload/' + Names.READY_FILE;
    const serverLog: string = context.filesDir + '/' + Names.LOG_DIR + '/' + Names.SERVER_LOG;
    try {
      fs.mkdirSync(context.filesDir + '/payload', true);
      fs.mkdirSync(context.filesDir + '/' + Names.LOG_DIR, true);
      fs.mkdirSync(context.filesDir + '/' + Names.WORKSPACE_DIR, true);
      if (fs.accessSync(readyPath)) {
        fs.unlinkSync(readyPath);
        Log.info('已作废上一轮 marker：' + readyPath);
      }
    } catch (error) {
      Log.warn('准备沙箱目录/作废 marker 失败（继续）：' + JSON.stringify(error));
    }

    // 3/5 投递
    onStage(Stage.STARTING);
    const options: NodeRuntimeOptions = {
      scriptPath: plan.scriptPath,
      entry: plan.entry,
      readonlyRoot: plan.readonlyRoot,
      payloadRoot: context.filesDir + '/payload',
      cwd: context.filesDir + '/' + Names.WORKSPACE_DIR,
      logPath: context.filesDir + '/payload/node.log',
      env: this.buildEnv(context, plan, readyPath, serverLog),
      flags: AppStorage.get<string>('nodeFlags') ?? '--no-verify-heap'
    };
    const started = this.runtime.start(context, options);
    Log.info('NodeRuntime.start → ok=' + started.ok + ' code=' + started.code + ' state=' + started.state
      + '；' + started.message);
    if (!started.ok) {
      result.message = '运行时投递失败（code=' + started.code + '）：' + started.message;
      this.runtime.markFailed(result.message);
      return result;
    }

    // 宿主能力桥必须在 start 之后接线（传输层依赖运行时单例）
    const caps: string = HostCapabilities.install(this.runtime, context);
    Log.info(caps);

    // 4/5 等就绪
    onStage(Stage.WAITING);
    const deadline: number = Date.now() + Timing.READY_TIMEOUT_MS;
    let ready: ReadyInfo = new ReadyInfo();
    let channel: string = 'none';
    let fatal: string = '';
    while (Date.now() < deadline) {
      this.attempts++;
      ready = Ports.readMarker(readyPath);
      if (ready.ok() && ready.startedAt >= this.startedAt) {
        channel = 'marker';
        break;
      }
      const logs: string = this.logsSince(50);
      fatal = Ports.parseFatal(logs);
      if (fatal.length > 0) {
        break;
      }
      const fromLog: ReadyInfo = Ports.parseReadyLog(logs);
      if (fromLog.ok()) {
        ready = fromLog;
        channel = 'log';
        break;
      }
      if (this.attempts % 10 === 0) {
        Log.info('等待就绪：第 ' + this.attempts + ' 次（marker=' + readyPath + '）');
      }
      await OpencodeRuntime.wait(Timing.READY_INTERVAL_MS);
    }

    if (fatal.length > 0) {
      this.runtime.markFailed('server fatal: ' + fatal);
      result.message = '服务端报告致命错误：' + fatal + '（详见 ' + serverLog + '）';
      Log.error(result.message);
      return result;
    }

    if (!ready.ok()) {
      const crash = this.runtime.lastCrash();
      const crashText: string = crash === null
        ? '无崩溃记录'
        : '崩溃=' + (crash.signal ?? 'unknown') + ' 阶段=' + crash.stage;
      const tail: string = this.logsSince(80).slice(-800);
      result.message = '等待服务就绪超时（' + Timing.READY_TIMEOUT_MS + ' ms，尝试 ' + this.attempts + ' 次）；'
        + 'marker=' + readyPath + '；' + crashText + '；日志尾=' + tail;
      this.runtime.markFailed(result.message);
      Log.error(result.message);
      return result;
    }

    // 5/5 交回页面加载（token 必须 percent-encode：base64 含 '+'）
    onStage(Stage.LOADING);
    this.runtime.markRunning();
    result.ok = true;
    result.url = ready.url() + '/?auth_token=' + encodeURIComponent(this.connection.authToken());
    Log.info('服务就绪（通道=' + channel + '）：' + ready.url() + '（version=' + ready.version
      + '，startedAt=' + ready.startedAt + '）');
    return result;
  }
}
