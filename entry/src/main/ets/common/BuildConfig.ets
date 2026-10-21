/**
 * BuildConfig —— **编译期**运行配置（110-jitless：本工程唯一的形态开关）。
 *
 * 产品决策（沿用参考工程 `pi-desktop-ark` 真机实测，见 `docs/ACL-无ACL评估.md`）：
 * **运行期不做任何形态切换**。`--jitless` 是进程级形态，而进程内 Node（`node::Start`）
 * 每进程只能起一次、失败即终态（`ohos-node-bridge` 契约 §2.6），一次误判 = 整机不可用。
 * 代价不对称：jit 误判 = 应用不可用；compat 代价 = 7–10× 慢（功能完整，仅 WASM 能力降级）。
 *
 *   · 形态 = **构建期常量**（本文件的 `NODE_MODE`），改它就是「出另一个变体」，重新编译即生效；
 *   · 运行期**没有**调试参数、没有设置项、没有 ACL 探测参与决策（见 `common/NodeMode.ets`）；
 *   · 默认 `compat`：所有 `deviceTypes`（2in1 / tablet）默认都按 `--jitless` 跑
 *     ⇒ 即使签名 Profile **未**授予 `kernel.ALLOW_WRITABLE_CODE_MEMORY`（无 ACL）也能起。
 *
 * 为什么默认 compat 而不是 jit（实测依据）：手机 `JUY-AL80`（API 26）上
 * `ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY` 查询结果为**已授予**，但按 jit 启动后
 * 进程在 `libnode_bridge` 内 **SIGTRAP(TRAP_BRKPT)** 秒崩；同一 HAP 改 compat 则 1.6 s 正常就绪
 * ⇒ **权限位不能作为 JIT 可用性的预检**。
 *
 * 出 jit 变体的做法：把下面改成 `'jit'` 后重新构建（建议同时在 `AppScope/app.json5` 里区分版本号/渠道）。
 */
export const NODE_MODE: string = 'compat';
