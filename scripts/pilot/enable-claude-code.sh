#!/bin/bash
# Turns on "your plan through Claude Code" in STeP Desktop on this Mac, for the pilot (docs/claude-subscription.md).
#   sudo bash enable-claude-code.sh        turn it on
#   sudo bash enable-claude-code.sh --off  turn it off again
# It writes features.claudeSubscription to /Library/Application Support/STeP/desktop-policy.json. STeP Desktop trusts that
# file only when root owns it and its folder and nobody else can write them. An existing policy with other settings is
# not overwritten: add the line by hand then. Restart STeP Desktop afterwards.
set -euo pipefail
if [ "$(id -u)" != 0 ]; then exec sudo bash "$0" "$@"; fi
dir="/Library/Application Support/STeP"
file="$dir/desktop-policy.json"
value=true
[ "${1:-}" = "--off" ] && value=false
mkdir -p "$dir"
if [ -s "$file" ] && ! grep -Eq '^[[:space:]]*\{[[:space:]]*"features"[[:space:]]*:[[:space:]]*\{[[:space:]]*"claudeSubscription"[[:space:]]*:[[:space:]]*(true|false)[[:space:]]*\}[[:space:]]*\}[[:space:]]*$' "$file"; then
  echo "$file already holds other settings. Add \"claudeSubscription\": $value under \"features\" by hand." >&2
  exit 1
fi
printf '{ "features": { "claudeSubscription": %s } }\n' "$value" > "$file"
chown root:wheel "$dir" "$file"
chmod 755 "$dir"
chmod 644 "$file"
state=on
[ "$value" = false ] && state=off
echo "STeP Desktop: your plan through Claude Code is $state on this Mac ($file). Restart STeP Desktop."
