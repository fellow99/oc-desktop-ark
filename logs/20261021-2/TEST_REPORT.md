# TEST_REPORT —— 110-jitless 真机全量测试（构建 → 部署 → 调试/测试）

> 需求：`110-jitless`（无 JIT 模式）｜用例：`specs/110-jitless/test-cases.md` + `specs/overall-test-cases.md`
> 日期：2026-10-21 ｜ 分支：`main`（未改动）
> 环境：Windows + Git Bash；Node `v24.7.0`（PC）；OHOS command-line-tools 6（hvigor/ohpm）
> 真机：`HAD-W32`（2in1）/ `OpenHarmony-7.0.0.109` / API `26` / 序列号已隐去
> **敏感信息纪律**：DeepSeek API key、git 账号口令、测试仓库 URL 一律只作运行时输入（命令参数 / 应用内凭据库），
> 本文与仓库内任何文档**零落盘**（已用关键字全仓扫描复核，见 §七）。

---

## 一、构建与部署

| 步骤 | 命令（摘要） | 结果 |
|---|---|---|
| 上游补丁基线 | `node scripts/apply-patches.mjs` | ✅ 3 条补丁应用成功（基线 `9b4ec5714d`） |
| bridge HAR | `scripts/build-bridge-har.sh`（`HVIGORW`/`DEVECO_SDK_HOME` 覆盖为本地 CLT） | ✅ `libs/@fellow99/node-bridge.har` 502,276 B |
| Node 运行时投放 | `scripts/provision-runtime.sh` | ✅ `libnode.so` v24.2.0 + `libc++_shared.so`；七项 ELF 门禁全 OK |
| 载荷收集 | `node scripts/collect-opencode.mjs --apply` | ✅ 86 文件 / 62.5 MB；**bundle 守卫已注入 + 回读/语法校验通过** |
| HAP 构建 | `hvigorw --mode module -p product=default -p buildMode=debug assembleHap` | ✅ BUILD SUCCESSFUL |
| 安装 | `hdc install -r entry-default-signed.hap` | ✅ `install bundle successfully` |
| 启动 | `hdc shell aa start -b org.fellow99.oc.OCDesktopArk -a EntryAbility` | ✅ 进程存活（含 `:gpu` / `:render` 子进程） |

产物：`entry/build/default/outputs/default/entry-default-signed.hap`，111,615,480 B（106.5 MiB）
SHA-256：`755d3783350abea6ee99d50d2828cc8ab6b8ec8bd127b47f3efd78d4c598a71b`
（签名材料在本机 `build-profile.json5` 本地改动里，**不入库**。）

启动证据（`files/payload/node-mode.json`）：
```json
{"mode":"compat","flags":"--no-verify-heap --jitless","debugBuild":true,"deviceType":"2in1","deviceModel":"HAD-W32",
 "aclGranted":true,"aclDetail":"ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY → 0（PERMISSION_GRANTED）",
 "reason":"编译期常量 BuildConfig.NODE_MODE=compat（运行期不可切换）…"}
```

---

## 二、PC 侧（TC-110-01…13）

`node --jitless payload/jitless/selftest/run.mjs`：**2 支全 PASS**，photon 面 22 过 / 0 失败 / 2 跳过
（跳过项为 pi-dist 上游集成，缺参考工程；如实 SKIP，不假绿）。
fetch/undici 面 16/16；`node --jitless -e "typeof WebAssembly"` = `undefined`（对照 jit = `object`）。
jit 形态同脚本零回归（兼容层不安装）。

---

## 三、门禁用例（TC-110-14…17、TC-110-26）

| 用例 | 结果 | 证据 |
|---|---|---|
| TC-110-14 权限声明面 | ✅ | `check-acl-surface`：requestPermissions=6（含 JIT ACL + 2 个用户目录）、definePermissions=1（仅 `kernel.ALLOW_WRITABLE_CODE_MEMORY`），无 READ_PASTEBOARD / READ_WRITE_DESKTOP_DIRECTORY |
| TC-110-15 脚本语法 | ✅ | `node --check`（`scripts/*.mjs`、`payload/jitless/*.js`、插件、`opencode-server.js`）0 错 |
| TC-110-16 投放门禁 | ✅ | `collect-opencode`：jitless 42 文件入库、`selftest/` 排除、manifest 覆盖全部条目 |
| TC-110-17 无运行期切换 | ✅ | 形态只由 `BuildConfig.NODE_MODE` 决定；`probeJitAcl()` 仅进诊断依据串 |
| **TC-110-26 bundle 守卫** | ✅ | 锚点恰好 1 处替换；落盘产物 `grep -c` = 1（新式）/ 0（旧锚点）；`node --check` 通过；注入后二次 collect 内容不变（确定性） |

---

## 四、真机用例（TC-110-18…28）

| 用例 | 结果 | 证据（摘要） |
|---|---|---|
| TC-110-18 运行形态 | ✅ | `node-mode.json`：`mode=compat`、`flags` 含 `--jitless`、ACL 已授予 |
| TC-110-19 启动到就绪 | ✅ | `node.log`：`[bootstrap] node=v24.2.0 platform=openharmony`；`server.ready.json` 写出（port 动态）；`GET /api/info` 200、无凭据 401、`GET /` 200（UI 7231 B） |
| TC-110-20 真实对话 | ✅ | 会话 `finish=stop`，正文 `2` / `6` / `12`（三次独立会话），tokens/cost 有值；SSE 采样收到 `session.text.delta`、`session.step.ended`、`session.execution.succeeded` 等 17 条事件 |
| TC-110-21 图片附件 | ✅ | 发 3120×2080 JPEG（截图），**compat 下经纯 JS photon 替身**完成缩放/重编码，视觉模型正确识读出界面文字（「OC Desktop Ark」「搜索会话/项目/添加项目」「这里还没有内容，创建一个会话以开始」），`finish=stop` |
| TC-110-22 git 插件闭环 | ❌ 阻塞 | 见 §六 |
| TC-110-23 降级如实 | ⚠️ 部分 | 语义搜索/websearch 失败但**可见**（`Web search cancelled`），进程不崩、UI 可继续；但 `shell` 工具直接报 `WebAssembly is not defined`（见 §六.2） |
| TC-110-24 jit 变体回归 | ⬜ 未执行 | 需改 `BuildConfig.NODE_MODE='jit'` 重编重装（本轮未做，避免覆盖已验证的 compat 包） |
| TC-110-25 release 合规 | ⬜ 未执行 | 需 release 包（签名材料只配了 debug） |
| TC-110-27 工作区选择器 RPC | ✅ | 插件 `state=active`；`roots` 返回沙箱/文档/下载三根；`browse{sandbox}` → `ok:true, entries:[demo110]`；`permissionCheck{documents}` → `source=bridge`、`granted:false` + hint |
| TC-110-28 `shell` 工具 | ⚠️ 限制登记 | 工具返回原始 `WebAssembly is not defined`；进程存活（判据「不崩/可见」达标，可用性未达标） |

附带验证（overall §三/§四）：
- TC-H-009/010：HAP 编译成功；包内含 `libnode.so`、`resfile/opencode/opencode.mjs`、`jitless/**`、UI 资源。
- 工具链：模型走 write 工具在沙箱工作区创建 `demo110/hello.txt`（内容 `jitless-ok`），落盘可读 —— 工作区可写 + 工具闭环成立。
- 多工作区：`POST /api/session?location=<sandbox>/demo110` 创建成功，会话 `location.directory` 正确。

---

## 五、本轮发现并修复的 4 个缺陷（均为真机暴露、PC 侧未覆盖）

| # | 现象（真机取证） | 根因 | 修复 |
|---|---|---|---|
| C1 | 服务 import 期 `FATAL import failed: ReferenceError: WebAssembly is not defined`（compat 完全不可用；`server.ready.json` 却是旧值，极易误判为「启动成功」） | photon 的 wasm-bindgen 胶水在**模块初始化期**就 `new WebAssembly.Module(...)`；单文件 bundle 内符号无法运行期 monkey-patch | 投放期给 bundle 注入唯一锚点守卫（`collect-opencode.mjs#applyPhotonGuard`），compat 取 `globalThis.__PI_JITLESS_PHOTON__`（纯 JS 替身），jit 仍走原生；三闸校验（锚点唯一 / 回读 / `node --check`） |
| C2 | 工作区插件 `status=failed`：`TypeError: Cannot convert undefined or null to object at Object.entries` | 上游 `Rpc.register` 对 `definition.events` 直接 `Object.entries`，且每方法需 `input`/`output` schema | 定义补 `events:{}` + 每方法 draft 2020-12 JSON Schema；handler 用 `payloadOf()` 兼容「已解包/未解包」两种入参 |
| C3 | `permissionCheck` 恒返回「宿主桥不可用」/ `transport-unavailable` | `host.js` 在**只读** resfile 根（插件在同名可写目录找不到）；且未 `useFileMailbox()` | `resolveHost()` 增加 `NODE_BRIDGE_READONLY_ROOT`（**只读优先**，避免可写目录接管能力面）；加载后接线 `ARK_HOST_MAILBOX` |
| C4 | 改插件后重装**永远不生效**（设备上仍是首次装机那份，13242 vs 11536 B） | OpenHarmony `fs.mkdirSync(path,true)` 对已存在目录抛 EEXIST ⇒ 共用大 try 整段跳过插件投放；`copyFileSync` 对已存在目标不覆盖 | 新增 `ensureDir()`（幂等 + 类型校验）逐项兜住；投放改为「拷到 `.tmp` → 尺寸核对 → rename 原子替换」，失败保留旧文件且可见 |

> 另修 5 条评审意见（Important/Minor）：collect 的 patch 结果回读校验与语法闸、失败清理 staging（防 `.collect-stage-*` 进包）、
> UTF-8 往返改按 Buffer 字节处理、`photonGuard` 事实在 jit 分支与摘要行补齐、`ensureDir` 类型校验。

---

## 六、遗留 / 阻塞（需决策）

1. **Git 闭环（TC-110-22）不可测**，两个独立原因：
   - 设备侧**没有 git 二进制**：经用户 shell 通道执行 `git --version` → `exit 127`（`/bin/sh: git: inaccessible or not found`）；
   - 本构建**没有 `108-git-plugin`**：`plugins/` 只有 `oc-plugin-workspace-roots`，插件 inventory 里也没有纯 JS git 工具（`specs/108-git-plugin/spec.md` 的 21 个 `git_*` 工具尚未实现/投放）。
   - 已做的替代取证（**host 侧、不入文档**）：https 公开仓库 `ls-remote` 成功；带账号仓库在**关闭本机 http 代理**后 `ls-remote` 成功（首轮 502 是本机 `http.proxy=127.0.0.1:7890` 导致，非仓库问题），凭据有效。
     ⇒ 网络与凭据都没有问题，缺的是设备侧 git 能力。
2. **`shell` 工具在 compat 下不可用（TC-110-28）**：`shell` 的命令解析依赖 tree-sitter WASM（`assets/tree-sitter-bash/tree-sitter-bash.wasm`），compat 下抛 `WebAssembly is not defined`。
   影响：模型无法执行命令（也直接导致「让模型自己跑 git」这条路走不通）。修法需要产品决策（纯 JS 命令解析 / 允许「不解析直接执行」但弱化权限判定），本轮**未擅自改**。
3. **`jit` 变体与 release 包未测**（TC-110-24/25）：需要改 `NODE_MODE` 重编与另一套签名材料。
4. 启动后仍有 1 条 `unhandledRejection: WebAssembly is not defined（lazyllhttp/undici）` 被顶层兜住（不崩）；来源是某处仍触达内建 undici 的代码路径，属噪声级，已登记。

---

## 七、敏感信息核查

- 全仓（`specs/ docs/ logs/ plugins/ payload/ entry/src/main/ets/ scripts/`）关键字扫描：`sk-dc5d…` / 账号 / 口令 / 两个测试仓库域名 → **0 命中**。
- API key 只经应用内凭据接口（`POST /api/integration/deepseek/connect/key`）写入应用私有库（`auth.json` 在沙箱内，未落盘到仓库/文档）。
- 测试仓库凭据只出现在命令行参数里（host 侧 `--anyauth` 探测与 `ls-remote`），未写入 `~/.git-credentials`（已复核该文件不存在）。
- 本报告隐去设备序列号与端口号（动态）。

---

## 八、文档整理

- `specs/overall-test-cases.md`：新增 **§〇 引用关系（唯一入口表）**，把分散重复的分层表合并；模块用例只留一行指向
  `specs/110-jitless/test-cases.md`；补 TC-110-26/27/28 与 §六、§十 执行记录（真机环境、逐项结果）。
- `specs/110-jitless/test-cases.md`：新增 TC-110-26/27/28 三条（含背景与判据）；§四 引用映射与 overall 对齐
  （静态/门禁/PC/真机四层不再重复登记）。

---

## 九、结论

- **compat（无 JIT）形态在真机上可用**：启动 1.6 s 级、模型对话、看图分析、工作区选择器三根全部通过；
  fetch/图片链路走的是纯 JS 实现，不再依赖 WASM。
- **jit 形态零回归**：PC 侧对照通过；注入的守卫以 `typeof WebAssembly` 为唯一开关。
- **未达标项**：git 闭环（缺设备侧 git 能力）、`shell` 工具可用性、jit/release 两轮未跑。三项均已在 §六 给出原因与下一步。
