# TEST_REPORT —— 110-jitless 无 JIT 模式（PC / 门禁 / 构建）

> 需求：`110-jitless` ｜ 用例：`specs/110-jitless/test-cases.md`
> 日期：2026-10-21 ｜ 环境：Windows + Node v24.14.1（PC）/ OHOS command-line-tools 6（HAP 构建）
> 真机用例（TC-110-18…25）：**未执行**（`hdc list targets` = `[Empty]`），见文末遗留。

## 一、PC 自测（TC-110-01…13）

| 用例面 | 命令 | 结果 |
|---|---|---|
| compat 形态（`--jitless`） | `node --jitless payload/jitless/selftest/run.mjs` | ✅ 2 支全 PASS；photon 22 过 / 0 失败 / 2 跳过（pi-dist 缺失，loud SKIP：`upstream-image-resize-core`、`exif-orientation-6-via-upstream`） |
| jit 对照（WASM 可用） | `node payload/jitless/selftest/run.mjs` | ✅ 2 支全 PASS，同口径 22 过 / 2 跳过 |
| fetch 用例数 | fetch-undici.mjs | 16/16（两形态各一遍），含评审新增：303 POST→GET 丢 body、307/308 保方法重放 in-memory body、307 流式 body 响错 `ERR_JITLESS_STREAM_REPLAY_UNSUPPORTED` |
| 静态护栏（用例 11） | 同上 | ✅ index.js 不写 `PI_JITLESS_DIR`/`SHIM_DIR`（对去注释源码断言）；稳态封印幂等事实 `seal.status==='kept'` |

说明：photon 2000x1500 JPEG 解码在 `--jitless` 下约 4.3 s（WASM 对照 <0.2 s 量级），慢但功能正确——与「compat 保可用、不保性能」口径一致。

## 二、静态 / 投放门禁（TC-110-14…17）

| 用例 | 命令 | 结果 |
|---|---|---|
| TC-110-14 权限声明面 | `node scripts/check-acl-surface.mjs` | ✅ requestPermissions=6、definePermissions=1（仅 kernel.ALLOW_WRITABLE_CODE_MEMORY），无 READ_PASTEBOARD / READ_WRITE_DESKTOP_DIRECTORY。m9 修复后 stripComments 为字符级状态机（引号/转义态），另以 3 组行为用例验证 URL 内 `//`、字符串内 `/* */`、尾逗号 |
| TC-110-15 脚本语法 | `node --check`（payload/jitless 全部 .js/.mjs、scripts/*.mjs、opencode-server.js） | ✅ 0 错 |
| TC-110-16 投放门禁 | `node scripts/collect-opencode.mjs`（dry-run）+ `--apply` | ✅ dry-run：86 文件 / 62.5 MB，jitless 42 文件，selftest 排除 1，裁剪 opencode-pty 1 个，+42/−0/≈1。apply：见下「EXDEV 事件」 |
| TC-110-17 无运行期切换 | 代码核查 | ✅ 形态只由 `BuildConfig.NODE_MODE` 决定；`probeJitAcl()` 仅进诊断依据串/证据文件；无 probeFlags/want/设置项参与 flags |

### EXDEV 事件（apply 首跑暴露，已修）

`--apply` 首次失败：staging 在系统 TEMP（C:），resfile 在 D:，`renameSync` 跨卷抛 EXDEV；备份→替换流程正确回滚（旧 resfile 原样恢复，无半截产物）。修复：staging 改在 `resfile/` 同卷建 `.collect-stage-XXXX`。
修复后：apply 成功；二次 apply 报告 `+0 / −0 / ≈0`（幂等）；manifest 抽 `jitless/index.js`、`jitless/fetch-shim.js`、`opencode-server.js` 的 SHA-256 与落盘一致；resfile 内无 selftest、无残留 backup/stage 目录。

## 三、HAP 构建（TC-110-19 的构建侧前置）

`hvigorw.bat assembleHap -p product=default -p buildMode=debug`：**BUILD SUCCESSFUL in ~12 s**。

构建期修复 2 个 ArkTS 编译错误（bbee32f 已潜伏，本次首次全量编译暴露）：
1. `deviceInfo.deviceModel` 在 API 24 类型定义中不存在 → 改用 `deviceInfo.productModel`（证据字段名仍为 `deviceModel`）；
2. 两个调用方写成 `NodeMode.decision()` 命名空间式导入，但 NodeMode.ets 从无此导出 → 改具名导入 `decision as nodeModeDecision` / `writeNodeModeEvidence` / `NodeModeDecision`。

产物核对（`entry/build/default/outputs/default/entry-default-unsigned.hap`，111.5 MB，未签名）：
- 含 `resources/resfile/opencode/jitless/**` 42 项 + `manifest.sha256`；selftest 0 项；
- 残留 WARN 均不阻断：Connection.ets 4 条既有「may throw」、未配置签名（预期，签名材料不入库）、打包器建议移除 vendor `jpeg-js/index.d.ts`（源码文件检查 WARN，不影响产物功能）。

## 四、遗留 / 阻塞

- **真机 TC-110-18…25 未执行**：无 hdc 目标。设备接入后按 test-cases.md §三 跑：compat 启动→node-mode.json 证据→真实对话（key 仅运行时 env）→图片 DecodeError 可见提示→jit 变体零回归→release 合规。
- HAP 当前未签名，装机需先配 signing（`signing.<mode>.local.json` 或环境变量）。
- photon upstream 2 用例依赖参考工程 pi-dist（`PI_DIST_UTILS` 可指定），当前环境跳过，不影响本工程资产自测结论。
