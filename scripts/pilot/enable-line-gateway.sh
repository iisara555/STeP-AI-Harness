#!/bin/bash
# Enables LINE Draft Gateway features and registers a compatible provider endpoint in managed policy.
#   sudo bash enable-line-gateway.sh --name step-line-ai --base-url http://127.0.0.1:11434/v1 --protocol openai --allowlist /etc/step/line-allowlist.json
#   sudo bash enable-line-gateway.sh --off
set -euo pipefail

NAME="step-line-ai"
BASE_URL="http://127.0.0.1:11434/v1"
PROTOCOL="openai"
ALLOWLIST_PATH=""
OFF="false"

while [ $# -gt 0 ]; do
  case "$1" in
    --name)
      NAME="${2:-}"
      shift 2
      ;;
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --protocol)
      PROTOCOL="${2:-}"
      shift 2
      ;;
    --allowlist)
      ALLOWLIST_PATH="${2:-}"
      shift 2
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
  exec sudo bash "$0" --name "$NAME" --base-url "$BASE_URL" --protocol "$PROTOCOL" \
    ${ALLOWLIST_PATH:+--allowlist "$ALLOWLIST_PATH"} $([ "$OFF" = "true" ] && echo --off)
fi

if [ "$PROTOCOL" != "openai" ] && [ "$PROTOCOL" != "anthropic" ]; then
  echo "--protocol must be openai or anthropic." >&2
  exit 1
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

STEP_LINE_FILE="$FILE" \
STEP_LINE_NAME="$NAME" \
STEP_LINE_BASE_URL="$BASE_URL" \
STEP_LINE_PROTOCOL="$PROTOCOL" \
STEP_LINE_OFF="$OFF" \
"$NODE_BIN" -e '
const fs = require("node:fs");
const file = process.env.STEP_LINE_FILE;
const name = process.env.STEP_LINE_NAME;
const baseUrl = process.env.STEP_LINE_BASE_URL;
const protocol = process.env.STEP_LINE_PROTOCOL;
const off = process.env.STEP_LINE_OFF === "true";

let policy = {};
if (fs.existsSync(file)) {
  const raw = fs.readFileSync(file, "utf8").trim();
  if (raw) policy = JSON.parse(raw);
}
if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
  throw new Error("Existing policy is not a JSON object");
}
policy.features = policy.features && typeof policy.features === "object" ? policy.features : {};

if (off) {
  policy.features.lineGateway = false;
} else {
  const u = new URL(baseUrl);
  const loopbackHttp = u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  if ((u.protocol !== "https:" && !loopbackHttp) || u.username || u.password || u.search || u.hash) {
    throw new Error("BaseUrl must be https:// (or loopback http://) with no credentials, query, or hash");
  }
  const existing = Array.isArray(policy.providers?.compatible) ? policy.providers.compatible : [];
  policy.features.lineGateway = true;
  policy.features.headless = true;
  policy.features.compatibleProviders = true;
  policy.providers = {
    ...(policy.providers || {}),
    compatible: [...existing.filter((p) => p && p.name !== name), { name, baseUrl, protocol }],
  };
}

const tmp = file + ".tmp." + process.pid;
fs.writeFileSync(tmp, JSON.stringify(policy, null, 2) + "\n", { mode: 0o644 });
fs.renameSync(tmp, file);
'

chown "$OWNER" "$DIR" "$FILE"
chmod 755 "$DIR"
chmod 644 "$FILE"

if [ -n "$ALLOWLIST_PATH" ] && [ -f "$ALLOWLIST_PATH" ]; then
  ALLOW_DIR="$(dirname "$ALLOWLIST_PATH")"
  chown "$OWNER" "$ALLOW_DIR" "$ALLOWLIST_PATH"
  chmod 755 "$ALLOW_DIR"
  chmod 644 "$ALLOWLIST_PATH"
  echo "Locked permissions on allowlist: $ALLOWLIST_PATH"
fi

if [ "$OFF" = "true" ]; then
  echo "STeP Desktop: features.lineGateway is off ($FILE)."
else
  echo "STeP Desktop: enabled lineGateway, headless, compatibleProviders ($NAME -> $BASE_URL) in ($FILE)."
fi
