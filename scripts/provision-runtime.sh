#!/usr/bin/env bash
# 投放 Node 运行时到 entry/libs/arm64-v8a/（不入库）。
# 唯一实现是兄弟工程的 tools/provision.mjs（幂等 + 七项 ELF 门禁 + SHA-256 锁定）；
# 本脚本只做**委托**，不自己 cp（FR-101-004）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRIDGE="${BRIDGE_DIR:-$ROOT/../ohos-node-bridge}"
SDK="${DEVECO_SDK_HOME:-D:/oh-workspace/command-line-tools-6/sdk}"
OUT="$ROOT/entry/libs/arm64-v8a"

[ -f "$BRIDGE/tools/provision.mjs" ] || { echo "✗ 找不到库的投放工具：$BRIDGE/tools/provision.mjs"; exit 2; }
[ -d "$SDK" ] || { echo "✗ DEVECO_SDK_HOME 无效：$SDK"; exit 2; }

echo "→ 委托库的 provision.mjs（七项 ELF 门禁 + SHA-256）"
node "$BRIDGE/tools/provision.mjs" --out "$OUT"

LIBCXX="$SDK/default/openharmony/native/llvm/lib/aarch64-linux-ohos/libc++_shared.so"
[ -f "$LIBCXX" ] || { echo "✗ 找不到 libc++_shared.so：$LIBCXX"; exit 2; }
cp "$LIBCXX" "$OUT/libc++_shared.so"

[ -f "$OUT/libnode.so" ] || { echo "✗ 投放后缺少 libnode.so"; exit 1; }
echo "✓ $OUT/libnode.so（$(stat -c%s "$OUT/libnode.so") B）"
echo "✓ $OUT/libc++_shared.so（$(stat -c%s "$OUT/libc++_shared.so") B）"
