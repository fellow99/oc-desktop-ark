# patches/v2.0.26 —— oc-desktop-ark 自有补丁集

> **归属**：本工程**自带**补丁目录（2026-10-18 决策 C：不与 `oc-desktop-hos` 共用同一套补丁目录）。
> **基线**：opencode `tag v2.0.26` / 提交 **`9b4ec5714d`** / 分支 `Branch_v2.0.26`。
> **编号**：沿用 `oc-desktop-hos/patches/v2.0.26/` 的编号，便于逐条对照；**缺号表示本工程不需要该补丁**（不重排编号）。

## 清单（4 条）

| 编号 | 落点 | 作用 | 必要性 |
|---|---|---|---|
| `0001-node-target-ohos.patch` | `packages/cli/vite.node.config.ts` | ① `resolve.conditions` 与 `ssr.resolve.conditions` 前置 `"ohos"`；② `build.target` 改为 `process.env.OPENCODE_NODE_TARGET ?? "node26"`（本工程设 **`node24`**）；③ `node:sea` 的 `getAssetKeys` 兼容层（Node 22 无该导出；Node 24 有 ⇒ 自动走原函数，**中性**） | ✅ 必需 |
| `0003-runtime-stubs-ohos.patch` | `packages/core/package.json`（`#pty`、`#persistent-pty-binary`）+ `pty.ohos.ts` + `binary.ohos.ts` | PTY 打桩（`available=false`，调用即抛）。**必需**：`pty.node.ts` 在模块顶层 `createRequire`，加载失败会中断整个 bundle 的 import | ✅ 必需 |
| `0006-shell-select-ohos.patch` | `packages/core/src/shell/select.ts`（2 处） | `stat()` 对系统路径抛 `EACCES`（不是 `ENOENT`）⇒ 冒泡到 `environment()`，表现为「会话建得出、助手永不回复」；改为「不可读视同不可用」，并支持 `OC_SHELL_FALLBACK` | 🔶 待 P0-J 判定（命中则必需） |
| `0008-git-credentials-settings.patch` | `packages/app/src/settings/{route,pages,surface}.tsx`、`settings/git/*`（新增）、`runtime/i18n/{en,zh}.ts` | 108-git-plugin：「设置 → Git」页（凭据录入/删除/文件路径展示；口令只显示长度；RPC 不可达时**整页自门控隐藏**）。**自门控**意味着插件缺失时上游界面零变化 | ✅ 108 必需（FR-108-024） |

## 与 `oc-desktop-hos` 补丁集的差异

| hos 编号 | hos 用途 | 本工程 |
|---|---|---|
| `0002-sqlite-ohos` | `node:sqlite` 无 binding ⇒ better-sqlite3 | ❌ **不需要**：`libnode-arm64.so` 已编译 `node::sqlite`（`DatabaseSync` / `StatementSync` / `node_sqlite3.BackupJob`），host Node 24.14 交叉验证可用 |
| `0004-tui-zed-sqlite-ohos` | TUI 的 `#zed-sqlite` 静态 `import "node:sqlite"` | ❌ **不需要**（同上） |
| `0005-string-width-ohos` | 曾是 icudtl 损坏的误判 | ❌ 不需要（本工程无 `icudtl.dat`） |
| `0007` | 工作区选择器（UI 补丁） | ⬜ 未采用（本工程的工作区选择器走插件 RPC，不改上游 UI） |
| `0008` | Git 设置页（UI 补丁） | ✅ **已采用**（108-git-plugin；仅把 RPC id 由 `oc-harmony-git` 改为 `oc-ark-git`） |

## 纪律（与 hos 相同，另加一条「基线守卫」）

1. **幂等判据**：`git apply --reverse --check <patch>` 成功 ⇒ 视为已应用，跳过。
2. **不落在既有补丁上下文区间**：新补丁与已有补丁的 hunk 上下文默认前后各 3 行不重叠；新补丁追加到列表末尾。
3. **正反向往返**：`apply` 后必须能 `--reverse --check` 通过；必要时 `--reverse` 还原后 SHA-256 与原文一致。
4. **换基线新建目录**：`patches/<新 tag>/`，不覆盖本目录。
5. **基线守卫（本工程新增，因为补丁目录是自有的）**：`../opencode` 是**两个工程共用**的 submodule。`scripts/apply-patches.mjs` 在打补丁前**要求工作树干净**（`git status --porcelain` 为空）并校验 HEAD = `9b4ec5714d`；只有一个工程处于「已打补丁」状态时才允许构建。工作树脏则拒绝执行，需显式 `--reset --yes`（先 `git clean -nd` 打印将删除的未跟踪文件）。

## 命令

```bash
node scripts/apply-patches.mjs --check     # 只报告：已应用 / 未应用 / 冲突
node scripts/apply-patches.mjs             # 幂等应用（工作树必须干净）
node scripts/apply-patches.mjs --only 0001 # 只处理一条
node scripts/apply-patches.mjs --reset --yes  # 慎用：先还原工作树，然后继续应用补丁
node scripts/apply-patches.mjs --check --reset --yes  # 只还原、不应用（离开时把 ../opencode 还原干净）
```

## SHA-256

| 文件 | SHA-256 |
|---|---|
| `0001-node-target-ohos.patch` | `e9a1f12375ca98419a20c5d2272d0dd4f4f595ca3218357993313039e14fd180` |
| `0003-runtime-stubs-ohos.patch` | `3996badf0bb2f0a5bfa4c5c0ecb747ff3f9be5ab6b46fe9f46b87ff1e2042487` |
| `0006-shell-select-ohos.patch` | `0df89e7f01bdb44572aea8697b7fb5f9ad50c73a404a8ce51c8c53bdd932633f` |
| `0008-git-credentials-settings.patch` | `1b6671045ca2bb1560a9abb7828e01252c8ab8ba3515dfbf617ee04ff310aec7` |

> 0001/0003/0006 与 `oc-desktop-hos/patches/v2.0.26/` 中的同名文件**逐字节一致**（含上文 SHA-256 校验）；
> 0008 源自同名文件但**改了一处**：RPC id `oc-harmony-git` → `oc-ark-git`（与本工程插件 id 对齐），因此 SHA-256 不同。
> 差异只体现在**应用集合**与**构建参数**（`OPENCODE_NODE_TARGET=node24`）上。
