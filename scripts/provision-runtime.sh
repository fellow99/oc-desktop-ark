#!/usr/bin/env bash
# 投放 Node 运行时到 entry/libs/arm64-v8a/（不入库）：libnode.so + libc++_shared.so。
# 唯一事实源：../ohos-node-bridge/runtime.lock.json（版本、SHA-256、来源）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRIDGE="${BRIDGE_DIR:-$ROOT/../ohos-node-bridge}"
LOCK="$BRIDGE/runtime.lock.json"
SDK="${DEVECO_SDK_HOME:-D:/oh-workspace/command-line-tools-6/sdk}"
OUT="$ROOT/entry/libs/arm64-v8a"

[ -f "$LOCK" ] || { echo "✗ 缺少锁文件：$LOCK"; exit 2; }
SO_SRC="$(ls "$BRIDGE"/runtime/node-v*/libnode-arm64.so 2>/dev/null | head -1)"
[ -n "${SO_SRC:-}" ] || { echo "✗ 找不到 libnode-arm64.so（先跑库的 tools/provision.mjs）"; exit 2; }
LIBCXX="$SDK/default/openharmony/native/llvm/lib/aarch64-linux-ohos/libc++_shared.so"
[ -f "$LIBCXX" ] || { echo "✗ 找不到 libc++_shared.so：$LIBCXX"; exit 2; }

EXPECTED="$(node -e "const l=require('$LOCK');console.log(l.runtimes.find(r=>r.node===l.active.node).sha256)")"
ACTUAL="$(sha256sum "$SO_SRC" | awk '{print $1}')"
[ "$EXPECTED" = "$ACTUAL" ] || { echo "✗ SHA-256 不匹配：期望 $EXPECTED / 实际 $ACTUAL"; exit 1; }

mkdir -p "$OUT"
cp "$SO_SRC" "$OUT/libnode.so"
cp "$LIBCXX" "$OUT/libc++_shared.so"
echo "✓ $OUT/libnode.so（$(stat -c%s "$OUT/libnode.so") B，sha256=$ACTUAL）"
echo "✓ $OUT/libc++_shared.so（$(stat -c%s "$OUT/libc++_shared.so") B）"
