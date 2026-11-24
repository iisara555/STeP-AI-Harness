#!/bin/bash
# Approves or removes an administrator-reviewed Skill Pack digest in STeP Desktop's managed policy.
#   sudo bash enable-skill-pack.sh --digest <64-hex-sha256>
#   sudo bash enable-skill-pack.sh --digest <64-hex> --remove
#   sudo bash enable-skill-pack.sh --off
set -euo pipefail

DIGEST=""
REMOVE="false"
OFF="false"

while [ $# -gt 0 ]; do
  case "$1" in
    --digest)
      DIGEST="${2:-}"
      shift 2
      ;;
    --remove)
      REMOVE="true"
      shift
      ;;
    --off)
      OFF="true"
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [ "$(id -u)" != 0 ]; then
  exec sudo bash "$0" ${DIGEST:+--digest "$DIGEST"} \
    $([ "$REMOVE" = "true" ] && echo --remove) $([ "$OFF" = "true" ] && echo --off)
fi

if [ "$OFF" != "true" ] || [ "$REMOVE" = "true" ]; then
  if ! echo "$DIGEST" | grep -Eq '^[a-f0-9]{64}$'; then
    echo "--digest must be a 64-character lowercase SHA-256 hex string." >&2
    exit 1
  fi
fi

NODE_BIN="$(command -v node || true)"
for candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
  if [ -z "$NODE_BIN" ] && [ -x "$candidate" ]; then
    NODE_BIN="$candidate"
  fi
done
if [ -z "$NODE_BIN" ]; then
  echo "Node.js is required to safely update desktop-policy.json." >&2
  exit 1
fi

OS_NAME="$(uname -s)"
if [ "$OS_NAME" = "Darwin" ]; then
  DIR="/Library/Application Support/STeP"
  OWNER="root:wheel"
else
  DIR="/etc/step"
  OWNER="root:root"
fi
FILE="$DIR/desktop-policy.json"
mkdir -p "$DIR"

STEP_PACK_FILE="$FILE" \
STEP_PACK_DIGEST="$DIGEST" \
STEP_PACK_REMOVE="$REMOVE" \
STEP_PACK_OFF="$OFF" \
"$NODE_BIN" -e '
const fs = require("node:fs");
const file = process.env.STEP_PACK_FILE;
const digest = process.env.STEP_PACK_DIGEST;
const remove = process.env.STEP_PACK_REMOVE === "true";
const off = process.env.STEP_PACK_OFF === "true";

let policy = {};
if (fs.existsSync(file)) {
  const raw = fs.readFileSync(file, "utf8").trim();
  if (raw) policy = JSON.parse(raw);
}
if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
  throw new Error("Existing policy is not a JSON object");
}
policy.features = policy.features && typeof policy.features === "object" ? policy.features : {};
const existing = Array.isArray(policy.skillPacks?.approvedDigests) ? policy.skillPacks.approvedDigests : [];

if (off) {
  policy.features.skillPacks = false;
}
if (remove) {
  policy.skillPacks = {
    ...(policy.skillPacks || {}),
    approvedDigests: existing.filter((d) => d !== digest),
  };
} else if (!off) {
  const next = [...new Set([...existing, digest])];
  if (next.length > 100) throw new Error("approvedDigests exceeds maximum of 100 entries");
  policy.features.skillPacks = true;
  policy.skillPacks = {
    ...(policy.skillPacks || {}),
    approvedDigests: next,
  };
}

const tmp = file + ".tmp." + process.pid;
fs.writeFileSync(tmp, JSON.stringify(policy, null, 2) + "\n", { mode: 0o644 });
fs.renameSync(tmp, file);
'

chown "$OWNER" "$DIR" "$FILE"
chmod 755 "$DIR"
chmod 644 "$FILE"

if [ "$OFF" = "true" ]; then
  echo "STeP Desktop: features.skillPacks is off ($FILE). Restart STeP Desktop."
elif [ "$REMOVE" = "true" ]; then
  echo "STeP Desktop: removed approved Skill Pack digest $DIGEST ($FILE). Restart STeP Desktop."
else
  echo "STeP Desktop: approved Skill Pack digest $DIGEST and enabled features.skillPacks ($FILE). Restart STeP Desktop."
fi
