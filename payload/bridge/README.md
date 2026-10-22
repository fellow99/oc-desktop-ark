# payload/bridge —— 库引导器（vendored）

`bootstrap.js` 与 `host.js` 来自 [`@fellow99/node-bridge`](https://ohpm.openharmony.cn/#/cn/detail/@fellow99/node-bridge)
v0.1.0 的上游仓库 [fellow99/ohos-node-bridge](https://github.com/fellow99/ohos-node-bridge)（`payload/`，MIT）。

**为什么要 vendor**：ohpm 发布的 HAR 只含 ArkTS 字节码 + 引导件 `.so` + rawfile 事实源，
**不随包分发 payload JS**（库 README「消费方接入」第 ③ 步：载荷自备）。本工程以
`collect-opencode.mjs` 把这两个文件投放进 `resfile/opencode/`（`scriptPath` 指向 `bootstrap.js`）。

- `bootstrap.js`：载荷引导器（resfile 只读直读 → 入口解析 → 崩溃兜底）；
- `host.js`：Node→ArkTS 宿主桥参考实现（104 宿主能力）。
- 未 vendor `lib/tar-extract.js`：仅 `NODE_BRIDGE_ARCHIVE` 归档解包路径懒加载，本应用固定走
  resfile 只读直读（零解压），该路径不可达。

升级库版本时同步更新这两个文件并以 `node --check` 验证。
