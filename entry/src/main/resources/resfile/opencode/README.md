# 载荷落点（`resfile/opencode/`）

本目录是 **opencode 服务端载荷**的落点，由 `scripts/collect-opencode.mjs` 投放；**产物不入库**（`.gitignore` 已排除）。

## 期望内容（路线 ①：只读直读）

```
resfile/opencode/
├── bootstrap.js               # 库引导器（来自 payload/bridge/bootstrap.js，vendored 自 @fellow99/node-bridge）
├── opencode-server.js         # 本工程宿主入口（来自 payload/opencode-server.js）
├── host.js                    # 库的宿主桥参考实现（来自 payload/bridge/host.js）
├── manifest.sha256            # 每个文件的 SHA-256（唯一事实源；**入库**）
└── assets/
    ├── app-archive.bin        # 内嵌 Web UI（brotli 归档）
    ├── @silvia-odwyer/photon-node/photon_rs_bg.wasm
    └── web-tree-sitter/…      # tree-sitter wasm（保留）
```

## 期望内容（路线 ②：归档回退）

```
resfile/opencode/
├── bootstrap.js
├── opencode-dist.tar.gz       # 由 Node 侧流式解包到 <filesDir>/opencode-dist/
└── manifest.sha256
```

## 纪律

1. **只有 `resfile` 是真实磁盘目录**（安装时落盘）；`rawfile` 只能经 `resourceManager` 读，Node 的 `fs` 打不开。
2. **谁写谁读**（宪法 C3）：解包由 Node 执行；ArkTS 只做存在性判定与传参。
3. 运行时 `.node` 原生件**不能从本目录 `dlopen`**（v1 无原生 addon；`node:sqlite` 已内建于 `libnode.so`）。
4. `manifest.sha256` 校验失败 ⇒ 拒绝启动并报出具体文件（`Payload.verify`，⬜ Phase 1 实现）。
