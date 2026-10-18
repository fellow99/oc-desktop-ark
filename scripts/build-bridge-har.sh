#!/usr/bin/env bash
# 构建 @fellow99/node-bridge 的 HAR 并拷进本工程（HAR 不入库）。
# 依赖：DevEco Studio / CLT 的 hvigorw 与 node；兄弟工程 ../ohos-node-bridge。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRIDGE="${BRIDGE_DIR:-$ROOT/../ohos-node-bridge}"
HVIGORW="${HVIGORW:-D:/oh-workspace/command-line-tools-6/bin/hvigorw.bat}"
export DEVECO_SDK_HOME="${DEVECO_SDK_HOME:-D:/oh-workspace/command-line-tools-6/sdk}"
export PATH="${NODE_BIN:-D:/oh-workspace/deveco-studio-6/tools/node}:$PATH"

[ -f "$BRIDGE/build-profile.json5" ] || { echo "✗ 找不到兄弟工程：$BRIDGE（用 BRIDGE_DIR 指定）"; exit 2; }
[ -f "$HVIGORW" ] || { echo "✗ 找不到 hvigorw：$HVIGORW（用 HVIGORW 指定）"; exit 2; }

echo "→ 构建 bridge HAR（$BRIDGE）"
( cd "$BRIDGE" && cmd //c "$(cygpath -w "$HVIGORW") --mode module -p module=library@default assembleHar --no-daemon" )

HAR="$BRIDGE/library/build/default/outputs/default/library.har"
[ -f "$HAR" ] || { echo "✗ 未产出 HAR：$HAR"; exit 1; }

mkdir -p "$ROOT/libs/@fellow99"
cp "$HAR" "$ROOT/libs/@fellow99/node-bridge.har"
echo "✓ $ROOT/libs/@fellow99/node-bridge.har（$(stat -c%s "$ROOT/libs/@fellow99/node-bridge.har") B）"
sha256sum "$ROOT/libs/@fellow99/node-bridge.har" | awk '{print "  sha256=" $1}'
