#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STD_SRC="$ROOT_DIR/docs/print-bridge-installer"
WIN7_SRC="$ROOT_DIR/docs/print-bridge-installer-win7"
TMP_DIR="$(mktemp -d)"
OUT_DIR="$TMP_DIR/out"
STD_ZIP="$OUT_DIR/amwali-print-bridge.zip"
WIN7_ZIP="$OUT_DIR/amwali-print-bridge-win7.zip"
STD_ASSET="$ROOT_DIR/src/assets/amwali-print-bridge.zip.asset.json"
WIN7_ASSET="$ROOT_DIR/src/assets/amwali-print-bridge-win7.zip.asset.json"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

require_one_bridge() {
  local src="$1"
  local label="$2"
  local count
  count="$(find "$src" -maxdepth 1 -type f -name 'print-bridge-v*-clean.js' | wc -l | tr -d ' ')"
  if [[ "$count" != "1" ]]; then
    echo "ERROR: $label must contain exactly one print-bridge-v*-clean.js file, found $count" >&2
    find "$src" -maxdepth 1 -type f -name 'print-bridge-v*-clean.js' -print >&2
    exit 1
  fi
  if [[ ! -f "$src/print-bridge-v6.3.7-clean.js" ]]; then
    echo "ERROR: $label must use print-bridge-v6.3.7-clean.js only" >&2
    exit 1
  fi
}

require_no_duplicate_node() {
  local src="$1"
  local label="$2"
  local count
  count="$(find "$src" -maxdepth 1 -type f -name 'node-v*-x64.msi' | wc -l | tr -d ' ')"
  if (( count > 0 )); then
    echo "ERROR: $label must not store Node installers in the repo. They are added only in a temporary packaging folder." >&2
    find "$src" -maxdepth 1 -type f -name 'node-v*-x64.msi' -print >&2
    exit 1
  fi
}

require_one_bridge "$STD_SRC" "Windows 10/11 source"
require_one_bridge "$WIN7_SRC" "Windows 7 source"
require_no_duplicate_node "$STD_SRC" "Windows 10/11 source"
require_no_duplicate_node "$WIN7_SRC" "Windows 7 source"

mkdir -p "$OUT_DIR"
rm -f "$STD_ZIP" "$WIN7_ZIP"

STD_WORK="$TMP_DIR/std"
cp -R "$STD_SRC" "$STD_WORK"
if [[ ! -f "$STD_WORK/node-v24.16.0-x64.msi" ]]; then
  curl -fL --retry 3 --retry-delay 2 \
    "https://nodejs.org/dist/v24.16.0/node-v24.16.0-x64.msi" \
    -o "$STD_WORK/node-v24.16.0-x64.msi"
fi
(cd "$STD_WORK" && zip -qr9 "$STD_ZIP" .)

WIN7_WORK="$TMP_DIR/win7"
cp -R "$WIN7_SRC" "$WIN7_WORK"
if [[ ! -f "$WIN7_WORK/node-v13.14.0-x64.msi" ]]; then
  curl -fL --retry 3 --retry-delay 2 \
    "https://nodejs.org/dist/v13.14.0/node-v13.14.0-x64.msi" \
    -o "$WIN7_WORK/node-v13.14.0-x64.msi"
fi
(cd "$WIN7_WORK" && zip -qr9 "$WIN7_ZIP" .)

echo "Built $STD_ZIP"
echo "Built $WIN7_ZIP"

echo "Standard ZIP bridge/node files:"
unzip -l "$STD_ZIP" | awk '{print $4}' | grep -E '^(print-bridge-v|node-v)' || true
echo "Windows 7 ZIP bridge/node files:"
unzip -l "$WIN7_ZIP" | awk '{print $4}' | grep -E '^(print-bridge-v|node-v)' || true

lovable-assets create --file "$STD_ZIP" --filename "amwali-print-bridge.zip" > "$STD_ASSET"
lovable-assets create --file "$WIN7_ZIP" --filename "amwali-print-bridge-win7.zip" > "$WIN7_ASSET"

echo "Updated $STD_ASSET"
echo "Updated $WIN7_ASSET"