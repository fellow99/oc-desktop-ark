# 013-branding 技术方案（Ark gap / 补齐计划）

> 对应规格：[spec.md](./spec.md)
> 父规格：[`../../specs/013-branding/plan.md`](../../specs/013-branding/plan.md)
> 最后更新：2026-11-01
> 状态：**未实现**。本文件记录当前源码事实、缺口与可执行补齐方案，不作为已交付说明。

## 1. 技术上下文

| 项 | 值 | 来源 |
|---|---|---|
| 平台 | HarmonyOS Stage / ArkTS / ArkWeb | `entry/src/main` |
| 上游 | opencode v2.2.5 `9bbb8ce18c` | `patches/v2.2.5/README.md` |
| 载荷 | resfile 直读 / tar.gz 回退 | `entry/src/main/resources/resfile/opencode/`、`payload/` |
| 归档 | `assets/app-archive.bin` | 构建产物 |
| 当前应用名 | `OC Desktop Ark` | `AppScope/resources/base/element/string.json` |
| 当前 UI 标题 | `OpenCode` | 归档解包实测 |
| 品牌补丁 | 无 | `patches/v2.2.5/` 5 条，无 0010 |
| 品牌脚本 | 无 | `scripts/` 无 branding/verify-branding |
| 品牌守卫 | 无 | `smoke-node24.mjs` 无 title 断言 |

## 2. 宪法合规

| 条款 | 判定 | 说明 |
|---|---|---|
| FR-013-001 | ⚠️ | 应用名 `OC Desktop Ark`，是否保留后缀待产品确认 |
| FR-013-002 | ❌ | Web UI title 仍 `OpenCode` |
| FR-013-003 | ❌ | manifest/favicon/字标未验证为 OC Desktop |
| FR-013-007 | ❌ | 无品牌守卫 |
| FR-013-008 | ❌ | 无升级后品牌回归 |

## 3. 研究结论

1. **壳层与 Web UI 是两套资源**：`AppScope`/`EntryAbility` 的 `OC Desktop Ark` 只影响应用名/加载页，不影响归档内 `index.html`。
2. **归档未品牌化**：解包 `app-archive.bin` 实测 `<title>=OpenCode`，`OC Desktop` 0 处。
3. **无补丁/脚本**：`patches/v2.2.5/` 无品牌补丁；`scripts/` 无品牌变换/守卫。
4. **可复用 hos/android 经验**：hos 在 `collect-opencode` 阶段改归档 + `verify-branding`；android 用最小 title 补丁 + smoke 断言。ark 更适合构建期改归档（resfile 直读），可参考 hos 的 `branding.mjs`。

## 4. 数据模型

```
ArkBrandingInput {
  archive: "entry/src/main/resources/resfile/opencode/assets/app-archive.bin"
  title: "OpenCode -> OC Desktop"
  manifest: "site.webmanifest"
  icons: "assets/*"
}
ArkBrandingCheck {
  title_prefix: "OC Desktop"
  opencode_residue: "allowed only for protected service names"
  icon_assets: "present"
}
```

## 5. 接口契约

### 5.1 提供（目标）

- 构建期品牌变换脚本/补丁；
- `verify-branding.mjs` 等价守卫；
- `smoke-node24` title 断言。

### 5.2 消费

- 父工程 `assets/`；
- `app-archive.bin` / `index.html` / manifest；
- `collect-opencode.mjs` 或 `apply-patches.mjs` 的构建阶段。

## 6. 实现策略（补齐计划）

### 6.1 方案 A：构建期改归档（推荐）

1. 新增 `scripts/lib/branding.mjs`（可参考 hos 同名脚本）：
   - 解包/解码 `app-archive.bin`；
   - 替换 `index.html` 的 `<title>`、PWA manifest、字标；
   - 保护上游服务名/法律声明（`OpenCode Console`、`OpenCode Go` 等）；
   - 重新编码归档，保持 SHA-256 清单一致。
2. 在 `collect-opencode.mjs` 末尾调用品牌变换；
3. 新增 `scripts/verify-branding.mjs`：
   - 断言 title 以 `OC Desktop` 开头；
   - 断言 `OC Desktop` 出现、受保护串保留；
   - 失败非零退出；
4. 在 `smoke-node24.mjs` 增加 title 断言。

### 6.2 方案 B：幂等补丁

1. 新建 `patches/v2.2.5/0010-branding-oc-desktop.patch`（编号按实际可用位）；
2. 改 `packages/app/index.html` title / manifest；
3. 在 `apply-patches.mjs` 中纳入；
4. 仍需 `verify-branding` 守卫。

> 推荐 A：ark 的载荷是 resfile 直读，构建期变换不需要改上游源码，且与 hos 经验一致；若归档格式复杂，退回 B。

### 6.3 资源显示名

- 将 `AppScope`/`EntryAbility` 资源从 `OC Desktop Ark` 改为 `OC Desktop`（若产品确认统一命名）；
- 版别后缀仅保留在 README/关于页/仓库名。

### 6.4 错误处理

- 品牌变换失败 → 构建失败；
- 归档校验失败 → 不投放；
- title 断言失败 → smoke 失败。

## 7. 测试与验证（补齐后）

| 项 | 命令 | 通过标准 |
|---|---|---|
| 归档 title | 解包 `app-archive.bin` | `<title>OC Desktop...` |
| 品牌残留 | 解包/搜索 | `OpenCode` 仅出现在受保护服务名/许可 |
| 守卫 | `node scripts/verify-branding.mjs` | 退出码 0 |
| smoke | `node scripts/smoke-node24.mjs` | title 断言通过 |
| 真机 | 安装启动 | Web UI 标题/图标/关于页符合 |

## 8. 文件清单

| 文件 | 当前状态 | 目标 |
|---|---|---|
| `entry/src/main/resources/resfile/opencode/assets/app-archive.bin` | 未品牌化 | 构建期变换 |
| `scripts/collect-opencode.mjs` | 无品牌步骤 | 接入品牌变换 |
| `scripts/lib/branding.mjs` | 不存在 | 新建 |
| `scripts/verify-branding.mjs` | 不存在 | 新建 |
| `scripts/smoke-node24.mjs` | 无 title 断言 | 增加断言 |
| `AppScope/resources/base/element/string.json` | `OC Desktop Ark` | `OC Desktop`（待确认） |
| `specs/013-branding/spec.md` | gap record | 实现后转 as-built |

## 9. 缺口清单

| # | 项 | 状态 | 处置 |
|---|---|---|---|
| ARK-BR-01 | Web UI title 未品牌化 | ❌ | 方案 A/B |
| ARK-BR-02 | 无品牌守卫 | ❌ | 新增 `verify-branding` |
| ARK-BR-03 | 应用名带 Ark 后缀 | ⚠️ | 产品确认 |
| ARK-BR-04 | PWA/favicon/字标未验证 | ⬜ | 补齐后断言 |
| ARK-BR-05 | 真机品牌证据 | ⬜ | 有设备时截图 |
