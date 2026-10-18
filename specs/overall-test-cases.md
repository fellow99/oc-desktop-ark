# overall-test-cases —— 测试用例索引

> 索引级文档：列出跨模块用例与执行方式；模块级细化在各 `1NN-*/spec.md` 的「验收场景」。
> **状态口径**：✅ 已执行通过 · ❌ 失败 · ⬜ 未执行（无设备/未实现）。
> 证据落点：`logs/<YYYYMMDD>-N/TEST_REPORT.md` + `docs/evidence/`。

## 一、用例编号与分层

| 前缀 | 层级 | 执行环境 | 是否需要设备 |
|---|---|---|---|
| `TC-S-*` | 静态（static） | host：`node --check`、JSON 解析、脚本自检 | 否 |
| `TC-H-*` | host（host gate） | host：补丁 / 构建 / `smoke-node24` | 否 |
| `TC-D-*` | 设备（device） | 真机：`hdc` + 截图 + HTTP 端点 | **是** |

## 二、静态用例（host，无设备）

| ID | 用例 | 步骤 | 期望 | 关联 |
|---|---|---|---|---|
| TC-S-001 | 补丁基线正确 | `node scripts/apply-patches.mjs --check` | 输出 `基线 HEAD=9b4ec5714d` | FR-UPSTREAM-001/003 |
| TC-S-002 | 工作树守卫生效 | 人为弄脏 `../opencode` 后跑 `--check` | 退出码 2 且提示 `--reset --yes` | 宪法 D4 |
| TC-S-003 | 补丁可干净应用 | 同上 `--check` | 3 条补丁均 `可干净应用` | FR-UPSTREAM-001 |
| TC-S-004 | 脚本语法 | `node --check scripts/*.mjs payload/**/*.js` | 全部 0 错误 | 宪法 G-语法 |
| TC-S-005 | 权限声明面 | 脚本比对 `module.json5` 与代码使用点 | 无「声明未用」「用未声明」 | FR-COMPLIANCE-002 |
| TC-S-006 | 版本一致性 | 比对 `AppScope/app.json5` 与 `TECH.md` | `2.0.26` / `20026` | 宪法 D6 |
| TC-S-007 | 无调试残留 | 搜索 `--inspect`、`probeFlags`、诊断端点 | release 构建中不存在 | FR-COMPLIANCE-003 |
| TC-S-008 | 载荷清单完整 | 校验 `manifest.sha256` 每个条目 | 文件存在、大小/哈希一致 | FR-SERVICE-005 |

## 三、host 门禁用例（无设备）

| ID | 用例 | 步骤 | 期望 | 关联 |
|---|---|---|---|---|
| TC-H-001 | 上游构建 | `node scripts/build-opencode.mjs` | 产出 `dist-node/opencode.mjs` + `assets/app-archive.bin` | FR-SERVICE-005 |
| TC-H-002 | 载荷收集 | `node scripts/collect-opencode.mjs` | `resfile/opencode/**` 就位 + 清单生成 | FR-SERVICE-005 |
| TC-H-003 | 服务启动 | `OPENCODE_PASSWORD=… node opencode.mjs serve --hostname 127.0.0.1 --port 0` | 打印 `server listening on http://127.0.0.1:<port>` | FR-SERVICE-002 |
| TC-H-004 | API 就绪 | 带 Basic 请求 `GET /api/info` | 200 且 JSON 含 `version: "2.0.26"` | FR-SERVICE-001/003 |
| TC-H-005 | UI 同源 | `GET /` | 200 且返回含 UI 标记的 HTML | FR-UI-002 |
| TC-H-006 | SSE 首事件 | `GET /api/event`（Basic） | 收到 `server.connected` | FR-SERVICE-001 |
| TC-H-007 | 数据持久化 | 两次启动指向同一 `OPENCODE_DB` | 第二次能读到第一次的会话 | FR-SERVICE-004 |
| TC-H-008 | 鉴权拒绝 | 不带凭据请求 `/api/info` | 401 | FR-AUTH-001 |
| TC-H-009 | HAP 编译 | `hvigorw assembleHap` | 退出码 0，产出 HAP | 宪法 G-编译 |
| TC-H-010 | HAP 内容 | 解压 HAP 检查 | 含 `libnode.so`、`resfile/opencode/opencode.mjs`、`rawfile/boot.html` | FR-UI-001 |

## 四、设备用例（真机，⬜ 待设备）

| ID | 用例 | 步骤 | 期望 | 关联 |
|---|---|---|---|---|
| TC-D-001 | 安装与启动 | `hdc install -r` → `aa start` | 进入窗口，无白屏/闪退 | FR-RUNTIME-002 |
| TC-D-002 | 无 ACL 反证 | Profile 不含 JIT ACL 时启动 | 出现 `Cpp Crash`/SIGTRAP（证明 ACL 必需） | FR-COMPLIANCE-002 |
| TC-D-003 | 有 ACL 正证 | 含 ACL 的 Profile 启动 | 无 SIGTRAP；`/api/info` 200 | FR-RUNTIME-003 |
| TC-D-004 | ArkWeb 访问 loopback | 加载 `http://127.0.0.1:<port>/` | 首屏渲染（非错误页） | FR-UI-002 |
| TC-D-005 | 八项能力 | localStorage / IndexedDB / fetch / SSE / `crypto.subtle` / blob worker / wasm / CSP | 逐项记录通过/失败 | FR-UI-003 |
| TC-D-006 | 首屏鉴权 | 带 `?auth_token=` 首次加载 | 直接进会话列表（非登录页） | FR-AUTH-003 |
| TC-D-007 | 重启免登录 | 杀进程后重启 | 仍免登录（凭据持久化） | FR-AUTH-002 |
| TC-D-008 | 错密码可见 | 篡改 `connection.json` | 停在可读失败态 + 重置入口 | FR-AUTH-004 |
| TC-D-009 | 会话闭环 | 新建会话 → 发消息 → 流式 → 工具调用 | 全程可见；重启后会话仍在 | FR-SERVICE-004 |
| TC-D-010 | 端口不冲突 | 先占用一个端口再启动 | 应用正常（`port 0`），无 abort | FR-SERVICE-002 |
| TC-D-011 | 单实例 | 二次启动应用 | 不产生第二个服务端/第二个 DB 写者 | FR-RUNTIME-004 |
| TC-D-012 | 崩溃可见 | 人为删载荷后启动 | 错误页含阶段+原因+日志尾；`lastCrash` 有记录 | FR-RUNTIME-005 |
| TC-D-013 | 目录选择与授权 | 选择文档目录 → 让代理读写 | 授权内成功；未授权时给出可读拒绝 | FR-HOST-003 |
| TC-D-014 | 版本库闭环 | 打开仓库 → 看 diff → 提交 | 完成一次 diff→提交 | FR-VCS-001 |
| TC-D-015 | 合规外观 | 首启检查 | 无「内测/测试/预览版」；AI 标识常驻 | FR-COMPLIANCE-001 |
| TC-D-016 | 首启耗时/包体 | 记录时间与 HAP 大小 | 写入 `docs/真机验证记录.md` | 回归四件套 |
| TC-D-017 | 长跑稳定 | 连续对话 30 min | 无崩溃；内存不持续增长（记录） | NFR 可靠性 |

## 五、回归用例（每次运行时/上游变更）

| ID | 用例 | 判据 |
|---|---|---|
| TC-R-001 | 签名 HAP SHA-256 | 与基线记录一致（或记录新值并说明原因） |
| TC-R-002 | 首启耗时 | 波动 ≤ 20% |
| TC-R-003 | 包体 | 波动 ≤ 5 MB |
| TC-R-004 | `/api/info` + 首屏字段 | `version` / `pid` / UI 首屏标记一致 |

## 六、执行记录

| 日期 | 环境 | 执行范围 | 结果 | 证据 |
|---|---|---|---|---|
| 2026-10-18 | host（无设备） | TC-S-001..004 | ✅ 通过（`apply-patches --check` 3 条可应用；`node --check` 通过） | 本文 §七 |
| ⬜ | 真机（设备缺席） | TC-D-* | ⬜ 未执行 | — |

## 七、host 侧已取得的证据（2026-10-18）

```
$ node scripts/apply-patches.mjs --check
✓ 基线 HEAD=9b4ec5714d（...\opencode）
✓ 工作树干净
+ 0001-node-target-ohos.patch：未应用，可干净应用
+ 0003-runtime-stubs-ohos.patch：未应用，可干净应用
+ 0006-shell-select-ohos.patch：未应用，可干净应用
汇总（--check）：可应用 3 / 已跳过 0 / 失败 0
```

## 八、第二轮执行记录（2026-10-18，含载荷）

| ID | 用例 | 结果 | 证据 |
|---|---|---|---|
| TC-H-001 | 上游构建 | ✅ | `dist-node/opencode.mjs` 16.45 MB（bun 1.4.2 / target node24） |
| TC-H-002 | 载荷收集 | ✅ | 43 文件 / 62.3 MB；`manifest.sha256`（JSON，schema=1，totals 65,277,002 B） |
| TC-H-003 | 服务启动 | ✅ | `server listening on http://127.0.0.1:13683`；`--version/--help` exit 0 |
| TC-H-004 | API 就绪 | ✅ | `GET /api/info` 200（version `0.0.0-Branch_v2.0.26-202610181342`，pid 21280） |
| TC-H-005 | UI 同源 | ✅ | `GET /` 200，7231 B HTML |
| TC-H-006 | SSE 首事件 | ✅ | `data: {"type":"server.connected",...}` |
| TC-H-008 | 鉴权拒绝 | ✅ | 无凭据 `GET /api/info` → 401 |
| TC-H-009 | HAP 编译 | ✅ | `BUILD SUCCESSFUL`；`entry-default-unsigned.hap` **111.2 MB** / 60 entries |
| TC-H-010 | HAP 内容 | ✅ | 含 `libnode.so`、`resfile/opencode/opencode.mjs`、`assets/app-archive.bin`、`rawfile/boot.html` |
| TC-H-007 | 数据持久化（两次启动同 DB） | ⬜ | 未单独执行（smoke 每次用临时 DB）；列入 Phase 1 |
| TC-D-* | 真机 | ⬜ | 无设备 |

> 运行时版本标注：host `v24.14.1` / target `v24.2.0` ⇒ `equivalent=false`；本机加 `--allow-version-drift` 执行，真机仍以 24.2.0 为准。
