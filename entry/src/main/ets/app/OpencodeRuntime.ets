import { common } from '@kit.AbilityKit';
import { NodeLogEntry, NodeRuntime, NodeRuntimeOptions } from '@fellow99/node-bridge';
import { EnvNames, Names, Stage, Timing } from '../common/Constants';
import { Log } from '../common/Log';
import { Ports, ReadyInfo } from '../common/Ports';
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
 * 五个阶段与判据：
 *   1 凭据：`Connection.loadOrCreate`（0600，跨启动稳定）
 *   2 载荷：`Payload.plan`（文件存在性判定，不做编译期开关）
 *   3 投递：`NodeRuntime.start`（返回 ok ≠ 就绪，C2）
 *   4 就绪：marker / 本轮日志 `ARK_SERVER_READY`（**只认本轮**）
 *   5 加载：由页面 `loadUrl(url + '?auth_token=…')`
 */
export class OpencodeRuntime {
  private static instance: OpencodeRuntime | null = null;
  private runtime: NodeRuntime = NodeRuntime.getInstance();
  private launched: boolean = false;
  private startedAt: number = 0;
  private connection: Connection = new Connection();

  static get(): OpencodeRuntime {
    if (OpencodeRuntime.instance === null) {
      OpencodeRuntime.instance = new OpencodeRuntime();
    }
    return OpencodeRuntime.instance;
  }

  /** 已投递过就不再投递（`node::Start` 每进程一次，C5） */
  alreadyLaunched(): boolean {
    return this.launched;
  }

  /** 本轮启动时刻（用于过滤上一轮遗留的 marker/日志） */
  launchStartedAt(): number {
    return this.startedAt;
  }

  private static wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  private buildEnv(context: common.UIAbilityContext, readyPath: string, serverLog: string): Record<string, string> {
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
    env[EnvNames.NO_PROXY] = '127.0.0.1,localhost,::1';
    env[EnvNames.NO_PROXY_LOWER] = '127.0.0.1,localhost,::1';
    env[EnvNames.ARK_READY_FILE] = readyPath;
    env[EnvNames.ARK_SERVER_LOG] = serverLog;
    env[EnvNames.ARK_HOST] = '127.0.0.1';
    return env;
  }

  /** 汇总本轮日志文本（只保留 `startedAt` 之后的行；`at=0` 的行保留，库未能解析时间戳） */
  private logsSince(): string {
    const entries: NodeLogEntry[] = this.runtime.logs(300);
    let text: string = '';
    for (const entry of entries) {
      if (entry.at === 0 || entry.at >= this.startedAt) {
        text += entry.text + '\n';
      }
    }
    return text;
  }

  /**
   * 执行启动（幂等：重复调用直接返回上一次结果）。
   * @param onStage 阶段回调（中文文案直接上屏）
   */
  async launch(context: common.UIAbilityContext, onStage: (stage: string) => void): Promise<LaunchResult> {
    const result: LaunchResult = new LaunchResult();
    if (this.launched) {
      result.ok = false;
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
    if (plan.route === PayloadRoute.MISSING) {
      result.message = plan.decision;
      Log.error('启动失败（载荷）：' + plan.decision);
      return result;
    }

    // 准备目录（宿主负责「可写根」的形状；Node 只往里写自己的文件）
    const readyPath: string = context.filesDir + '/payload/' + Names.READY_FILE;
    const serverLog: string = context.filesDir + '/' + Names.LOG_DIR + '/' + Names.SERVER_LOG;
    try {
      const fileIo = await import('@kit.CoreFileKit');
      fileIo.fileIo.mkdirSync(context.filesDir + '/payload', true);
      fileIo.fileIo.mkdirSync(context.filesDir + '/' + Names.LOG_DIR, true);
      fileIo.fileIo.mkdirSync(context.filesDir + '/' + Names.WORKSPACE_DIR, true);
    } catch (error) {
      Log.warn('创建沙箱目录失败（继续，Node 侧会再试）：' + JSON.stringify(error));
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
      env: this.buildEnv(context, readyPath, serverLog),
      flags: AppStorage.get<string>('nodeFlags') ?? '--no-verify-heap'
    };
    const started = this.runtime.start(context, options);
    Log.info('NodeRuntime.start → ok=' + started.ok + ' code=' + started.code + ' state=' + started.state
      + '；' + started.message);
    if (!started.ok) {
      result.message = '运行时投递失败（code=' + started.code + '）：' + started.message;
      return result;
    }

    // 4/5 等就绪（marker 优先，其次本轮日志）
    onStage(Stage.WAITING);
    const deadline: number = Date.now() + Timing.READY_TIMEOUT_MS;
    let ready: ReadyInfo = new ReadyInfo();
    while (Date.now() < deadline) {
      ready = Ports.readMarker(readyPath);
      if (ready.ok() && ready.startedAt >= this.startedAt) {
        break;
      }
      const fromLog: ReadyInfo = Ports.parseReadyLog(this.logsSince());
      if (fromLog.ok()) {
        ready = fromLog;
        break;
      }
      await OpencodeRuntime.wait(Timing.READY_INTERVAL_MS);
    }

    if (!ready.ok()) {
      const crash = this.runtime.lastCrash();
      result.message = '等待服务就绪超时（' + Timing.READY_TIMEOUT_MS + ' ms）；'
        + (crash === null ? '无崩溃记录' : '崩溃=' + crash.signal + ' 阶段=' + crash.stage);
      Log.error(result.message + '；日志尾=' + this.logsSince().slice(-400));
      return result;
    }

    // 5/5 交回页面加载
    onStage(Stage.LOADING);
    result.ok = true;
    result.url = ready.url() + '/?auth_token=' + this.connection.authToken();
    Log.info('服务就绪：' + ready.url() + '（version=' + ready.version + '，startedAt=' + ready.startedAt + '）');
    return result;
  }
}
