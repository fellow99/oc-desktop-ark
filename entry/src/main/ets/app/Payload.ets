import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { Names } from '../common/Constants';
import { Log } from '../common/Log';

/** 载荷路线（按**文件存在性**判定，不做编译期开关） */
export enum PayloadRoute {
  READONLY = 'readonly',
  ARCHIVE = 'archive',
  MISSING = 'missing'
}

/** 载荷装配计划（overall-data-model §1.3） */
export class PayloadPlan {
  route: PayloadRoute = PayloadRoute.MISSING;
  readonlyRoot: string = '';
  /** 应用入口（相对运行根，交库经 NODE_BRIDGE_ENTRY 解析） */
  entry: string = '';
  /** `node::Start` 实际执行的脚本 = 库引导器绝对路径 */
  scriptPath: string = '';
  archivePath: string = '';
  decision: string = '';
}

/**
 * 载荷判定（工程规划 §5.8）。
 *
 * HAP 里**只有 resfile 是真实磁盘目录**；rawfile 只能经 resourceManager 读，
 * Node 的 `fs` 打不开它。因此这里只认 `context.resourceDir` 下的文件。
 */
export class Payload {
  private static exists(path: string): boolean {
    try {
      return fs.accessSync(path);
    } catch (error) {
      return false;
    }
  }

  static plan(context: common.UIAbilityContext): PayloadPlan {
    const plan: PayloadPlan = new PayloadPlan();
    const readonlyRoot: string = context.resourceDir + '/' + Names.PAYLOAD_DIR;
    plan.readonlyRoot = readonlyRoot;

    const entryAbs: string = readonlyRoot + '/' + Names.ENTRY_FILE;
    const bootstrapAbs: string = readonlyRoot + '/' + Names.BOOTSTRAP_FILE;
    const hasEntry: boolean = Payload.exists(entryAbs);
    const hasBootstrap: boolean = Payload.exists(bootstrapAbs);

    if (hasEntry && hasBootstrap) {
      plan.route = PayloadRoute.READONLY;
      plan.entry = Names.ENTRY_FILE;
      plan.scriptPath = bootstrapAbs;
      plan.decision = 'resfile 直读命中：' + entryAbs + '；引导器=' + bootstrapAbs + '（零解压）';
      Log.info('载荷路线=' + plan.route + '；' + plan.decision);
      return plan;
    }

    const archiveAbs: string = readonlyRoot + '/opencode-dist.tar.gz';
    if (Payload.exists(archiveAbs) && hasBootstrap) {
      plan.route = PayloadRoute.ARCHIVE;
      plan.entry = Names.ENTRY_FILE;
      plan.scriptPath = bootstrapAbs;
      plan.archivePath = archiveAbs;
      plan.decision = '归档回退：' + archiveAbs + '；由 Node 侧解包（幂等 marker）';
      Log.info('载荷路线=' + plan.route + '；' + plan.decision);
      return plan;
    }

    plan.route = PayloadRoute.MISSING;
    plan.decision = '载荷缺失：期望 ' + entryAbs + ' 与 ' + bootstrapAbs
      + '（或 ' + archiveAbs + '）；请先运行 scripts/collect-opencode.mjs 投放';
    Log.error(plan.decision);
    return plan;
  }
}
