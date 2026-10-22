# 工作区选择器（203-plugin-workspace-picker）—— 实现方案

> **模块**：`203-plugin-workspace-picker` ｜ **状态**：Proposed ｜ **日期**：2026-10-22 ｜ 对应规格：[`spec.md`](./spec.md)
> **依据**：`docs/ACL配置.md` §3；`docs/000-工程规划.md` §5.9（插件投放）、§5.6（HOME 改写）；`specs/108-git-plugin/plan.md`（同型插件落点）；`specs/constitution.md`（C1–C6）
> 证据口径：✅ 本机核对上游/本工程源码 ｜ 🔶 沿用 `oc-desktop-hos` / 110 真机记录 ｜ ⬜ 本模块待真机

## 1. 技术上下文

| 项 | 值 | 来源 |
|---|---|---|
| 渲染层 | ArkWeb 同源加载 `http://127.0.0.1:<port>/`（上游 `packages/app` 的 SolidJS SPA，随 CLI 产物内嵌 `app-archive.bin`） | 规划 §5.3；`packages/cli/script/app-assets.ts:12`（`buildAppArchive` 跑 `packages/app` 的 `bun run build`） |
| 平台身份 | ArkWeb 下 `platform === "web"` ⇒ 恒定走应用内 `DirectoryPickerDialog` | ✅ `packages/app/src/runtime/platform/web.ts:6`、`packages/app/src/workspaces/selection/policy.ts:4-8` |
| 能力通道 | 插件 RPC `POST /api/rpc/:rpcID/:method`，载荷 `{ input }`，返回 `{ output }`；客户端 `sdk.api.rpc.call` 已生成 | ✅ `packages/protocol/src/groups/rpc.ts:14`、`packages/client/src/promise/generated/client.ts:1689` |
| 插件 id | `oc-harmony-workspace-roots`（与 `plugins/oc-plugin-workspace-roots/index.mjs` 的 `definition.id` 一致） | ✅ 本工程插件源码 |
| 运行期落点 | `<filesDir>/config/opencode/plugin/oc-plugin-workspace-roots/index.mjs`（可写）；`host.js` 在只读载荷根 | ✅ 110 测试报告 C2/C3 |
| 构建期落点 | `entry/src/main/resources/resfile/opencode/plugins/oc-plugin-workspace-roots/index.mjs` | ✅ `scripts/collect-opencode.mjs:267` |
| 沙箱根 | `<filesDir>/workspace`（宿主改 `HOME` 后 `path.join(HOME,'workspace')`） | ✅ 插件 `rootPath('sandbox')` |
| 用户根 | `/storage/Users/currentUser/{Documents,Download}`，可用 `OC_HOS_USER_HOME` 覆盖 | ✅ 插件 `userHome()` |
| 权限桥 | `host.invoke('perm.check'/'perm.request'/'perm.openAppInfo')`，经 `ARK_HOST_MAILBOX` 文件信箱 | ✅ 插件 `resolveHost()` + `useFileMailbox` |
| 补丁基线 | `../opencode` HEAD `9b4ec5714d`（v2.0.26） | ✅ `scripts/apply-patches.mjs:EXPECTED` |

## 2. 宪法合规

| 原则 | 满足方式 | 落点 |
|---|---|---|
| **C1 壳薄契约硬** | 能力半只扩插件方法（`mkdir` 一个），不新增协议组/路由；界面半只改既有对话框组件 | §5、§6 |
| **C2 不隐藏平台真相** | 无权限时只显示两按钮 + 可读原因；桥不可用、目录不存在、越界均有独立归因 | §5.3、§6.4 |
| **C3 谁写谁读** | 插件投放链路未改；`mkdir` 由插件用 `node:fs` 自己写 | §6.2 |
| **C4 不改上游** | 唯一上游改动 = `patches/v2.0.26/0007-workspace-roots-picker.patch`（幂等、可反向校验） | §6.1 |
| **C5 崩溃终态** | 插件方法全部 async 且不抛错；`mkdir` 失败结构化返回 | §6.2 |
| **C6 判据可证伪** | 补丁 `--reverse --check`、插件方法表断言、真机三根 + 权限门 + 建目录 + 对话 | §7 |

## 3. 研究结论（源码 `path:line`）

| # | 结论 | 证据 |
|---|---|---|
| R1 | 上游对话框的列举走 `listPickerDirectory(sdk, location, absolute)` → `fs/list`；**不做根限制** | ✅ `packages/app/src/workspaces/selection/dialog.tsx:143-160`、`domain.ts:387` |
| R2 | 上游对话框的树组件 `FileTree` 只吃「相对当前根的路径集合」，因此换数据源只需换 `load()` 里的列举调用，无需改树 | ✅ `dialog.tsx:169-176`、`:277-296`（`onExpansionChange` → `load`） |
| R3 | 上游把「路径输入 + 建议浮层」放在 `pathArea` 块里；隐藏该块即可去除任意路径入口 | ✅ `dialog.tsx:341-410` |
| R4 | 上游 `resolve()` 用 `policy.result(root(), selected(), rootValid())` 产出绝对路径 | ✅ `dialog.tsx:319-330`、`domain.ts:45-49` |
| R5 | 本工程插件已有 `roots`/`browse`/`permissionCheck`/`permissionRequest`/`openAppInfo` 五方法，**真机已验证**；缺 `mkdir` | ✅ `plugins/oc-plugin-workspace-roots/index.mjs`；110 报告 TC-110-27 |
| R6 | 插件 `browse` 已在服务端做「root 内包含性 + 存在性 + 类型」判定，并返回稳定错误码 | ✅ 插件 `handleBrowse`（`out-of-root`/`not-found`/`not-a-dir`/`EACCES`） |
| R7 | 插件定义形状承重：`definition.events` 必须存在，每方法必须有 `input`/`output` schema，否则插件 `failed` | ✅ 插件头注释（真机取证 2026-10-21）；110 报告 C2 |
| R8 | 权限查询接口在本平台可能不可靠（「开关已开仍返回 false」🔶 hos 结论）⇒ 以列举成功为事实判据 | 🔶 `oc-desktop-hos/docs/203-插件-选择工作区目录.md` §F8 |
| R9 | `docs/ACL配置.md` §3 已把「三根 + 两按钮」定为用户契约，但其中的 `api/cwd/browse?root=...` 是早期设想，实际能力走 RPC | ✅ `docs/ACL配置.md:44-62` vs 插件实现 |
| R10 | 补丁按文件名排序应用；新增 `0007-*` 会排在 `0006`/`0008` 之间，`git apply --reverse --check` 作为幂等判据 | ✅ `scripts/apply-patches.mjs` 头注释 |

## 4. 数据模型

```
RootSet          { home, userHome, roots: RootInfo[] }
RootInfo         { id:'sandbox'|'documents'|'download', path, available, needsPermission, reason }
BrowseResult     { ok, code, message, entries: {name,type}[], count }
PermissionCheck  { granted, source, message, hint }
PermissionResult { ok, code, granted, bridgeUnavailable, message }
MkdirResult      { ok, code, message, path }
```

渲染层状态机（`rootsMode` 开启时）：

```
permState: 'checking' | 'granted' | 'denied' | 'unavailable'
  ├ checking      → 树区显示 loading
  ├ granted       → 树可浏览（browse 逐级列举）
  ├ denied        → 树区不渲染，显示「请求权限」「刷新」两按钮 + 原因
  └ unavailable   → 同上（原因不同：桥不可用 / 目录不存在）
```

## 5. 接口契约

### 5.1 插件 RPC（`POST /api/rpc/oc-harmony-workspace-roots/<method>`）

| 方法 | input | output（要点） |
|---|---|---|
| `roots` | `{}` | `{ home, userHome, roots[] }` |
| `browse` | `{ id, sub? }` | `{ ok, code, message, entries[], count }` |
| `permissionCheck` | `{ id }` | `{ granted, source, message, hint? }` |
| `permissionRequest` | `{ id }` | `{ ok, code, granted, bridgeUnavailable, message }` |
| `openAppInfo` | `{}` | `{ ok, message }` |
| **`mkdir`（新增）** | `{ id, parent, name }` | `{ ok, code, message, path }`；`code` ∈ `invalid-name`/`invalid-parent`/`out-of-root`/`root-unavailable`/`root-unknown`/`exists`/`create-failed` |

`mkdir` 规则（服务端独立判定，不依赖 UI）：
1. `id` 必须属于三根，否则 `root-unknown`；解析路径为空 ⇒ `root-unavailable`。
2. `parent` 消解后必须仍在 root 内（`target === root || target.startsWith(root + sep)`），否则 `out-of-root`。
3. `name` 必须是非空单段：拒绝 `/`、`\`、控制字符、`.`、`..`、长度 > 255 ⇒ `invalid-name`。
4. 已存在 ⇒ `exists`；`fs.mkdirSync` 失败 ⇒ `create-failed`（带系统 code）。

### 5.2 渲染层策略模块（补丁新增 `roots.ts`）

| 导出 | 作用 |
|---|---|
| `ROOT_IDS` / `USER_ROOT_IDS` / `ROOTS_RPC_ID` | 常量（顺序即 Tab 顺序；沙箱无需授权） |
| `probeWorkspaceRoots(sdk)` | 探测能力；不可达返回 `undefined`（自门控） |
| `browseRoot(sdk,{id,sub})` | 列举；返回结构化结果（不抛错） |
| `browseRelative(sdk,{id,sub})` | 同上的 `{ok,code,message,entries}` 映射，供 `load()` 用 |
| `mkdirInRoot(sdk,{id,parent,name})` | 建目录 |
| `requestDirectoryPermission(sdk,id)` | 发起授权 |
| `relativeFromRoot(root,path)` | 绝对路径 → 根内相对分段（越界返回 `undefined`） |
| `defaultFolderName(existing,base)` | 默认名去重 |
| `filterHiddenEntries(entries)` | 过滤 `.` 前缀项 |

### 5.3 UI 状态与动作

| 动作 | 行为 |
|---|---|
| 打开对话框 | `probeWorkspaceRoots` → 成功则三根模式，默认 `sandbox`；失败则完整回退上游 |
| 点 Tab | 置 `rootId`；`sandbox` → 直接列举；`documents`/`download` → `browse` 探测（**不请求**）→ 成功列树 / 失败进权限门 |
| 点「请求权限」 | `permissionRequest` → 重新探测（`browse`）→ 列表或两按钮 + 原因 |
| 点「刷新」 | 重新 `roots` + `browse` 探测 → 列表或两按钮 + 原因 |
| 新建文件夹 | 输入默认名（同级去重）→ `mkdir` → 重列当前层 → 选中新目录 |
| 采纳 | `isWithin(root, path)` 再判 → `onSelect(绝对路径)` |

## 6. 实现策略

### 6.1 界面半（补丁 `patches/v2.0.26/0007-workspace-roots-picker.patch`）

改动面严格限定在 `packages/app/src/workspaces/selection/` 与两处 i18n：

| 文件 | 改动 |
|---|---|
| `runtime/i18n/{en,zh}.ts` | 新增 `dialog.directory.roots.*`、`dialog.directory.newFolder.*` 文案键（中英成对） |
| `workspaces/selection/dialog.css` | 新增 `.directory-picker-roots` 样式 |
| `workspaces/selection/roots.ts` | 新增：常量 + 纯函数 + RPC 封装（自门控） |
| `workspaces/selection/dialog.tsx` | 新增三根 Tab、权限门、新建文件夹；三根模式下以 `browse` 替换 `fs/list` 列举、隐藏路径输入、导航与采纳前根围栏 |

自门控：`probeWorkspaceRoots` 抛错或形状不符 ⇒ `roots.latest === undefined` ⇒ 所有 203 分支关闭，行为与上游一致。

### 6.2 能力半（插件 `mkdir`）

- 在 `definition.methods` 加 `mkdir`（带 `input`/`output` JSON Schema），在 `context.rpc.register` 的 handlers 加 `mkdir: async (payload) => handleMkdir(payloadOf(payload))`。
- `handleMkdir` 全部同步 fs + 结构化返回，不抛错。
- 不新增依赖、不 spawn、不用原生模块（准入不变）。

### 6.3 构建链

```
node scripts/apply-patches.mjs          # 新增 0007 幂等生效
node scripts/build-opencode.mjs         # bun 产物（含 packages/app 的 vite build → app-archive）
node scripts/collect-opencode.mjs --apply
hvigorw --mode module -p product=default -p buildMode=debug assembleHap
hdc install -r entry/build/default/outputs/default/entry-default-signed.hap
```

### 6.4 失败可见

- 列举失败：树区**不显示**上游「无法读取此文件夹」，改为权限门（两按钮 + 原因）。
- 桥不可用：原因文案点名「权限桥不可用」。
- `mkdir` 失败：输入框下方就地显示可归因文案，输入态保留。

## 7. 测试考虑

| 层 | 手段 | 覆盖 |
|---|---|---|
| 静态 | `node --check` 插件；插件方法表断言（6 方法）；补丁 `--reverse --check`；`check-acl-surface` | FR-203-040/041/043 |
| 真机 RPC | `hdc fport` + curl 调 `roots` / `browse` / `permissionCheck` / `mkdir` | FR-203-004/005/010/031-033 |
| 真机 UI | ArkWeb 交互：三根 Tab、权限门两按钮、请求/刷新、新建文件夹、采纳 | FR-203-001/002/011-014/020-026/030/034 |
| 端到端 | 沙箱 / 文档 / 下载各建一个工作区并各完成一次对话（含看图分析） | AC-203-09 |

用例编号与步骤见 [`test-cases.md`](./test-cases.md)。

## 8. 文件清单

| # | 文件 | 类型 |
|---|---|---|
| 1 | `plugins/oc-plugin-workspace-roots/index.mjs` | 改（+`mkdir`） |
| 2 | `patches/v2.0.26/0007-workspace-roots-picker.patch` | 新增 |
| 3 | `specs/203-plugin-workspace-picker/{spec,plan,tasks,test-cases}.md` | 新增 |
| 4 | `specs/README.md` | 改（模块索引 + 203 行） |
| 5 | `docs/ACL配置.md` | 改（§3 补「实际能力走 RPC」与两按钮实现落点） |
| 6 | `logs/<YYYYMMDD>-N/{DEV_CHECKLIST,REVIEW_REPORT,TEST_REPORT}.md` | 新增（过程产物） |
