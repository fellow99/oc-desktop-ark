# DEV_CHECKLIST — 101-version-2.2.5（oc-desktop-ark）

> 日志目录：logs/20261031-1/ ｜ 开始：2026-10-31

## 里程碑
- [ ] M1 静态收敛（清理 / 版本号 / 守卫）
- [ ] M2 补丁迁移（v2.2.5）
- [ ] M3 构建链
- [ ] M4 测试 + 代码评审
- [ ] M5 提交 + 本地 tag

## 执行记录
（按时间追加命令/结果/产物路径）
# 101-version-2.2.5 开发执行日志（ark）

## 构建结果（2026-10-31）
- 版本：versionName 2.2.5 / versionCode 20205；守卫基线 9bbb8ce18c / patches/v2.2.5；bun ^1.4.4。
- 补丁：5/5 在干净 v2.2.5 应用（0001/0006 直用；0003/0007/0008 用 hos 重生成版，语义一致）。
- build-opencode（OPENCODE_NODE_TARGET=node24, bun 1.4.4）成功。
- collect-opencode：
  · photon 守卫注入（1 锚点替换+回读+语法闸）；
  · shellScanner 守卫**删除**——v2.2.5 parse.ts scan() 已无条件纯 JS ShellScan，WASM 分叉被上游移除；
  · 902 文件/65.2MB，jitless 42 文件，git 插件 56 包/828 文件（isomorphic-git@1.44.2+diff@9.0.0）。
- collect-plugins：工作区选择器 + git 插件投放成功。
- smoke-node24（host v24.14.1，--allow-version-drift，设备目标 v24.2.0）：全绿（11903 端口、/api/info 200、/ 9631B、无凭据 401、SSE server.connected）。
- verify-git-plugin：离线闭环 6 动作通过（108 门禁）。
- check-acl-surface：6 requestPermissions + 1 definePermission，无越界声明。
- verify-runtime：ohpm 装 @fellow99/node-bridge@0.1.0 + @fellow99/node-runtime@24.2.0；
  libnode.so 126809264B sha256 匹配锁值；删除 v2.1.2 遗留双来源 entry/libs/*.so（gitignored）。
- HAP：hvigor assembleHap BUILD SUCCESSFUL → entry-default-unsigned.hap。
  本机 DevEco 6.1.0.850 / API23 / model 6.1.0，临时覆盖 model 6.1.0 + target 6.1.0(23) 编译，覆盖未入库；缺 debug 签名材料，真机侧载跳过-无设备。
