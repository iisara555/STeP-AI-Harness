#!/bin/bash
# Configures an administrator-approved HTTP MCP server in STeP Desktop's managed policy.
#   sudo -E bash configure-mcp.sh --name step-org --url https://mcp.step.internal/mcp
#   sudo bash configure-mcp.sh --name step-org --remove
#   sudo bash configure-mcp.sh --off
set -euo pipefail

NAME="step-org"
URL=""
TOKEN_ENV="STEP_MCP_AUTH_TOKEN"
REMOVE="false"
OFF="false"

while [ $# -gt 0 ]; do
  case "$1" in
    --name)
      NAME="${2:-}"
      shift 2
      ;;
    --url)
      URL="${2:-}"
      shift 2
      ;;
    --token-env)
      TOKEN_ENV="${2:-}"
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
  exec sudo -E bash "$0" --name "$NAME" ${URL:+--url "$URL"} --token-env "$TOKEN_ENV" \
    $([ "$REMOVE" = "true" ] && echo --remove) $([ "$OFF" = "true" ] && echo --off)
fi

if ! echo "$NAME" | grep -Eq '^[[:alnum:]_-]{1,60}$'; then
  echo "Invalid server name: $NAME" >&2
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

TOKEN=""
if [ "$OFF" != "true" ] && [ "$REMOVE" != "true" ]; then
  if [ -z "$URL" ]; then
    echo "--url is required when configuring an MCP server." >&2
    exit 1
  fi
  TOKEN="${!TOKEN_ENV:-}"
  if [ -z "$TOKEN" ] && [ -t 0 ]; then
    printf "Enter Bearer token for '%s' (leave blank for none): " "$NAME" >&2
    read -r -s TOKEN
    printf "\n" >&2
  fi
fi

STEP_CFG_FILE="$FILE" \
STEP_CFG_NAME="$NAME" \
STEP_CFG_URL="$URL" \
STEP_CFG_TOKEN="$TOKEN" \
STEP_CFG_REMOVE="$REMOVE" \
STEP_CFG_OFF="$OFF" \
"$NODE_BIN" -e '
const fs = require("node:fs");
const file = process.env.STEP_CFG_FILE;
const name = process.env.STEP_CFG_NAME;
const urlStr = process.env.STEP_CFG_URL;
const token = process.env.STEP_CFG_TOKEN;
const remove = process.env.STEP_CFG_REMOVE === "true";
const off = process.env.STEP_CFG_OFF === "true";

let policy = {};
if (fs.existsSync(file)) {
  const raw = fs.readFileSync(file, "utf8").trim();
  if (raw) policy = JSON.parse(raw);
}
if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
  throw new Error("Existing policy is not a JSON object");
}
policy.features = policy.features && typeof policy.features === "object" ? policy.features : {};
const existing = Array.isArray(policy.mcpServers) ? policy.mcpServers : [];

if (off) {
  policy.features.mcp = false;
}
if (remove) {
  policy.mcpServers = existing.filter((s) => s && s.name !== name);
} else if (!off) {
  const u = new URL(urlStr);
  const loopbackHttp = u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  if ((u.protocol !== "https:" && !loopbackHttp) || u.username || u.password || u.search || u.hash) {
    throw new Error("MCP server URL must be https:// (or loopback http://) with no credentials, query, or hash");
  }
  const entry = {
    name,
    transport: "http",
    url: urlStr,
    headers: token ? { Authorization: "Bearer " + token } : {},
  };
  policy.features.mcp = true;
  policy.mcpServers = [...existing.filter((s) => s && s.name !== name), entry];
}

const tmp = file + ".tmp." + process.pid;
fs.writeFileSync(tmp, JSON.stringify(policy, null, 2) + "\n", { mode: 0o644 });
fs.renameSync(tmp, file);
'

chown "$OWNER" "$DIR" "$FILE"
chmod 755 "$DIR"
chmod 644 "$FILE"

if [ "$OFF" = "true" ]; then
  echo "STeP Desktop: features.mcp is off ($FILE). Restart STeP Desktop."
elif [ "$REMOVE" = "true" ]; then
  echo "STeP Desktop: removed MCP server '$NAME' ($FILE). Restart STeP Desktop."
else
  echo "STeP Desktop: configured MCP server '$NAME' ($URL) and enabled features.mcp ($FILE). Restart STeP Desktop."
fi
