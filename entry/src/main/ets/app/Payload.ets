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
  /** 上游产物绝对路径（诊断用） */
  productPath: string = '';
  decision: string = '';
}

/**
 * 载荷判定（工程规划 §5.8）。
 *
 * **判据是上游产物**（`opencode.mjs` + `assets/app-archive.bin`），不是宿主脚本 ——
 * 宿主脚本由 collect 每次必投，拿它当判据会把「产物缺失」误判成「直读命中」。
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

    const productAbs: string = readonlyRoot + '/opencode.mjs';
    const uiAbs: string = readonlyRoot + '/assets/app-archive.bin';
    const bootstrapAbs: string = readonlyRoot + '/' + Names.BOOTSTRAP_FILE;
    const hostAbs: string = readonlyRoot + '/' + Names.ENTRY_FILE;
    plan.productPath = productAbs;

    const hasProduct: boolean = Payload.exists(productAbs) && Payload.exists(uiAbs);
    const hasHost: boolean = Payload.exists(hostAbs) && Payload.exists(bootstrapAbs);

    if (hasProduct && hasHost) {
      plan.route = PayloadRoute.READONLY;
      plan.entry = Names.ENTRY_FILE;
      plan.scriptPath = bootstrapAbs;
      plan.decision = 'resfile 直读命中：' + productAbs + ' + assets/app-archive.bin；引导器=' + bootstrapAbs;
      Log.info('载荷路线=' + plan.route + '；' + plan.decision);
      return plan;
    }

    const archiveAbs: string = readonlyRoot + '/opencode-dist.tar.gz';
    if (Payload.exists(archiveAbs) && Payload.exists(bootstrapAbs)) {
      // 归档路线在本阶段**未接线**（NodeRuntimeOptions.archive 尚未传参）。
      // 如实判定为「不可用」，而不是打印一句「回退」然后必然超时（C2）。
      plan.route = PayloadRoute.ARCHIVE;
      plan.archivePath = archiveAbs;
      plan.scriptPath = bootstrapAbs;
      plan.decision = '归档回退未接线（Phase 1）：检测到 ' + archiveAbs
        + '，但本版本只支持 resfile 直读；请用 collect-opencode.mjs 投放产物';
      Log.error(plan.decision);
      return plan;
    }

    plan.route = PayloadRoute.MISSING;
    plan.decision = '载荷缺失：期望 ' + productAbs + ' + ' + uiAbs
      + ' 与宿主脚本 ' + hostAbs + ' / ' + bootstrapAbs
      + '；请先运行 scripts/collect-opencode.mjs 投放';
    Log.error(plan.decision);
    return plan;
  }
}
