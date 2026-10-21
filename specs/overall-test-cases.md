# overall-test-cases —— 测试用例索引

> 索引级文档：**只管分层、编号与引用关系**；可执行细节与判据在模块 `test-cases.md` 里，不在此重复。
> **状态口径**：✅ 已执行通过 · ❌ 失败 · ⚠️ 部分通过（有明确降级/限制） · ⬜ 未执行（无设备/未实现）。
> 证据落点：`logs/<YYYYMMDD>-N/TEST_REPORT.md` + `docs/evidence/`。

## 〇、引用关系（唯一入口表）

> 规则：**一份用例只写在一处**。跨模块的用例登记在本文；模块细节登记在 `specs/<编号>/test-cases.md`。
> 本文只引用模块文件，不复制其内容；模块文件反向以「关联」列指回本文的分层。

| 层 | 编号前缀 | 执行环境 | 需设备 | 用例所在文件 |
|---|---|---|---|---|
| 静态 | `TC-S-*` | host：`node --check`、JSON 解析、脚本自检 | 否 | 本文 §二 |
| host 门禁 | `TC-H-*` | host：补丁 / 构建 / `smoke-node24` | 否 | 本文 §三 |
| 设备（全局） | `TC-D-*` | 真机：`hdc` + 界面 | **是** | 本文 §四 |
| 回归 | `TC-R-*` | host + 真机 | 部分 | 本文 §五 |
| 模块：110-jitless（PC 自测） | `TC-110-0x` | host：`node --jitless`（≈ 真机 compat） | 否 | [110-jitless/test-cases.md](110-jitless/test-cases.md) |
| 模块：110-jitless（静态/投放门禁） | `TC-110-1x` | host：`check-acl-surface` / `collect-opencode` / `node --check` | 否 | 同上 |
| 模块：110-jitless（真机） | `TC-110-2x` | 真机：`hdc` + HTTP + 模型凭据（运行时注入） | **是** | 同上 |

**模块文件清单（本索引引用的全部模块用例）**

| 模块 | 文件 | 覆盖的全局用例 | 说明 |
|---|---|---|---|
| 110-jitless | [110-jitless/test-cases.md](110-jitless/test-cases.md) | `TC-S-005`、`TC-D-002/003/004/005/009` | 无 JIT 双形态；实证 `TC-D-002/003`（ACL 反证/正证）与 compat 下的可用性 |

> 新增模块时：① 在 `specs/<编号>/test-cases.md` 里编号自己的用例；② 只在上表加一行；③ 不要在本文件复制模块用例正文。
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
| 2026-10-21 | 真机 USB（HAD-W32 / HarmonyOS 7.0.0.111 / API 26） | TC-D-001/003/004/006/009；TC-S-008；TC-H-009/010 | ✅ 通过（详见 §十 与 `logs/20261021-2/TEST_REPORT.md`） | `logs/20261021-2/` |
| 2026-10-21 | 真机 | TC-D-002（无 ACL 反证） | ⬜ 未执行（本形态需换 Profile 重签，见 §十 声明边界） | — |

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
 
 ## 九、模块用例：110-jitless 无 JIT 模式（详见 [110-jitless/test-cases.md](110-jitless/test-cases.md)）
 
 > 需求 110-jitless：去掉 JIT ACL 外的其余 ACL；`kernel.ALLOW_WRITABLE_CODE_MEMORY` 做**双形态兼容**（编译期 `NODE_MODE`，默认 `compat` = `--jitless` + 纯 JS 兼容层；`jit` = 现有环境）。
 > 用例分三层：PC 侧自测（`node --jitless`，开发期迭代）→ 静态/投放门禁（host）→ 真机。
 
 | ID | 层 | 用例 | 关联 AC |
 |---|---|---|---|
 | TC-110-01 | PC | WASM 缺失基线（`typeof WebAssembly`） | AC-110-01 |
 | TC-110-02 | PC | 兼容层安装事实（三态无 failed） | AC-110-01 |
 | TC-110-03 | PC | fetch GET 文本 | AC-110-02 |
 | TC-110-04 | PC | fetch POST JSON + 自定义头 | AC-110-02 |
 | TC-110-05 | PC | fetch SSE 流式（getReader） | AC-110-02 |
 | TC-110-06 | PC | fetch 中止（AbortError） | AC-110-02 |
 | TC-110-07 | PC | fetch FormData / Blob | AC-110-02 |
 | TC-110-08 | PC | fetch 重定向（5 跳 / 303→GET） | AC-110-02 |
 | TC-110-09 | PC | undici 危险面（install 空操作 / reject） | AC-110-03 |
 | TC-110-10 | PC | photon 惰性解码（零解码） | AC-110-04 |
 | TC-110-11 | PC | photon resize + 双编码 | AC-110-04 |
 | TC-110-12 | PC | tree-sitter / code-mode 降级 | AC-110-11 |
 | TC-110-13 | PC | jit 形态零回归（对照） | NFR-110-001 |
 | TC-110-14 | 门禁 | 权限声明面（check-acl-surface） | AC-110-06 |
 | TC-110-15 | 门禁 | 脚本语法（node --check） | — |
 | TC-110-16 | 门禁 | 投放门禁（jitless 入 resfile + manifest） | AC-110-05 |
 | TC-110-17 | 门禁 | 无运行期形态切换残留 | AC-110-12 |
 | TC-110-18 | 真机 | 运行形态（编译期 compat） | AC-110-07 |
 | TC-110-19 | 真机 | 启动到就绪（冷启动耗时） | AC-110-07 |
 | TC-110-20 | 真机 | 真实对话（stopReason=stop / SSE） | AC-110-08 |
 | TC-110-21 | 真机 | 图片附件（视觉模型识读） | AC-110-09 |
 | TC-110-22 | 真机 | git 插件闭环（无账号 + 带账号） | FR-VCS-001 |
 | TC-110-23 | 真机 | 降级如实（不崩） | AC-110-11 |
 | TC-110-24 | 真机 | jit 变体回归（零回归） | AC-110-10 |
 | TC-110-25 | 真机 | release 合规 | AC-110-12 |
| TC-110-26 | 门禁+真机 | bundle 守卫：photon 初始化期不触达 WASM（锚点唯一；jit 回落原生） | AC-110-04 |
| TC-110-27 | 真机 | 工作区选择器 RPC（`roots`/`browse`/`permissionCheck`；插件 active + 宿主桥已接线） | FR-HOST-003 |
| TC-110-28 | 真机 | `shell` 工具在 compat 下的表现（如实失败即算达标；当前为已知限制） | AC-110-11 |
 
 > 与既有 `TC-D-002`（无 ACL 反证 SIGTRAP）/`TC-D-003`（有 ACL 正证）的关系：本模块在其上叠加「compat 形态下纯 JS 兼容层使 fetch/图片可用」。
 > **敏感信息纪律**：DeepSeek API key / git 账号密码 / 测试 URL 只进运行时 env / 命令参数，**不落盘**任何文档/日志/证据。
 
 ## 十、执行记录（110-jitless）
 
| 2026-10-21 | host（PC，`node --jitless` v24.7.0） | TC-110-01…13 | ✅ 全绿（2 支 PASS；22 过 / 0 失败 / 2 跳过＝pi-dist 缺失） | `logs/20261021-2/TEST_REPORT.md` |
| 2026-10-21 | host（静态/投放门禁） | TC-110-14…17、TC-110-26（锚点注入） | ✅ 全绿 | 同上 |
| 2026-10-21 | 真机（HAD-W32 / API 26） | TC-110-18/19/20/21/27 | ✅（compat 启动 1.6 s；真实对话 `finish=stop`；看图分析正确；工作区三根 + browse 可用） | 同上 |
| 2026-10-21 | 真机 | TC-110-23（降级如实） / TC-110-28（shell 工具） | ⚠️ 部分：不崩、失败可见；但 `shell` 工具直接报 `WebAssembly is not defined`（限制已登记） | 同上 |
| 2026-10-21 | 真机 | TC-110-22（git 闭环） | ❌ 阻塞：设备无 `git` 二进制（`exit 127`），且 108-git-plugin 未实现/未投放 | 同上 |
| 2026-10-21 | 真机 | TC-110-24（jit 变体） / TC-110-25（release 合规） | ⬜ 未执行（需改 `NODE_MODE` 重编 / release 包） | — |
