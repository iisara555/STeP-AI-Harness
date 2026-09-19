#!/usr/bin/env bash
set -euo pipefail

VERSION="v22.23.2"
BASE_URL="https://nodejs.org/dist/${VERSION}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ASC="$TMP_DIR/SHASUMS256.txt.asc"
SUMS="$TMP_DIR/SHASUMS256.txt"
KEYRING="$TMP_DIR/nodejs-keyring.kbx"

curl -fsSL --proto '=https' --tlsv1.2 "$BASE_URL/SHASUMS256.txt.asc" -o "$ASC"
curl -fsSL --proto '=https' --tlsv1.2 "https://github.com/nodejs/release-keys/raw/HEAD/gpg/pubring.kbx" -o "$KEYRING"
gpgv --keyring="$KEYRING" --output "$SUMS" "$ASC"

expected_lines=(
  "61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6  node-v22.23.2-darwin-arm64.tar.gz"
  "58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026  node-v22.23.2-darwin-x64.tar.gz"
  "fec025a6da31757e3b6af84c5a1628e9d38442ca99a2161091d78f2fcfa35ef3  node-v22.23.2-win-arm64.zip"
  "1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97  node-v22.23.2-win-x64.zip"
)

for line in "${expected_lines[@]}"; do
  grep -Fqx "$line" "$SUMS"
done

grep -Fq 'STEP_NODE_VERSION="22.23.2"' install/macos-runtime.sh
grep -Fq '61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6' install/macos-runtime.sh
grep -Fq '58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026' install/macos-runtime.sh

grep -Fq '$StepNodeVersion = "22.23.2"' install/windows-runtime.ps1
grep -Fq 'fec025a6da31757e3b6af84c5a1628e9d38442ca99a2161091d78f2fcfa35ef3' install/windows-runtime.ps1
grep -Fq '1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97' install/windows-runtime.ps1

echo "Node runtime pins verified against signed Node.js SHASUMS for $VERSION"
