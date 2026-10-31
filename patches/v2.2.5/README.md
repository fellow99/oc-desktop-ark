# patches/v2.2.5 — oc-desktop-ark 上游幂等补丁

基线：opencode **v2.2.5**（tag `v2.2.5` / 提交 `9bbb8ce18c` / 分支 `Branch_v2.2.5`）。
与 `oc-desktop-hos` 共用同一套 Web 层补丁语义（node24 目标除外，见 0001）。

| 补丁 | 作用 | v2.2.5 迁移 |
| --- | --- | --- |
| 0001-node-target-ohos.patch | 构建目标锁 node24（对齐 libnode v24.2.0 / ABI 137） | 干净应用（沿用 ark 版） |
| 0003-runtime-stubs-ohos.patch | core 导出图打桩 + persistent-pty/pty OHOS 空实现（available=false） | 按 v2.2.5 导出图重生成（含 v2.2.4 持久化终端新结构） |
| 0006-shell-select-ohos.patch | shell 选择器 OHOS 化 | 干净应用（`shell/select.ts` 落点仍在） |
| 0007-workspace-roots-picker.patch | 工作区根目录选择器（纯逻辑 `roots.ts` + 四主目录 UI + 18 i18n key） | 按新 `workspaces/selection`（domain/policy/picker 拆分）重生成 |
| 0008-git-credentials-settings.patch | 设置页 Git 凭据入口（新 settings 架构：route/pages/shell 接线） | 按 v2.2.5 settings 重生成 |

## 与 v2.1.2 的差异

- 0003 覆盖 v2.2.4 引入的持久化 Desktop 终端：新增 `persistent-pty/binary.ohos.ts` 与
  `pty/pty.ohos.ts` 打桩，仍保持 `available = false` 平台边界。
- **bundle 级 shell 扫描器守卫移除**：v2.2.5 `packages/core/src/shell/parse.ts` 的 `scan()`
  已无条件走纯 JS `ShellScan`，v2.1.2 的 scanPortable↔scanLegacy(web-tree-sitter WASM)
  分叉被上游移除，compat（无 WebAssembly）下天然不依赖 WASM。对应 `collect-opencode.mjs`
  中 `shellScanner` 守卫删除，仅保留 `photon` 守卫。
- `bash` 内置工具在 v2.2.5 更名为 `shell`（保留 `bash → shell` 别名）；ark 自带同名
  `shell` 插件继续按同名优先覆盖内置工具。

## 验证

- 干净 v2.2.5 工作树逐条 `git apply --check`：5/5 通过。
- `apply-patches.mjs`：基线 9bbb8ce18c，5/5 应用、0 失败。
- build（node24 / bun 1.4.4）→ collect（photon 守卫注入、jitless 42 文件、902 文件/65.2MB）
  → smoke-node24（/api/info 200、/ 200、server.connected、无凭据 401）全绿。
- verify-git-plugin（离线闭环）、check-acl-surface、verify-runtime（node-runtime 24.2.0 锁值）通过。
- hvigor assembleHap BUILD SUCCESSFUL（产出 entry-default-unsigned.hap；本机缺 debug 签名材料）。
