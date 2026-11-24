#!/usr/bin/env bash
set -euo pipefail

dmg="$1"
report="$2"
required="${STEP_DESKTOP_REQUIRE_TRUSTED_INSTALLERS:-false}"
configured="${STEP_DESKTOP_APPLE_NOTARIZATION_CONFIGURED:-false}"
integrity='not checked'
gatekeeper='not checked'
app_ticket='not checked'
dmg_ticket='not checked'
mount_dir=$(mktemp -d)
mounted=false

finish() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach "$mount_dir" -force || true
  fi
  rmdir "$mount_dir" || true
  cat > "$report" <<REPORT
{"signatureIntegrity":"$integrity","gatekeeper":"$gatekeeper","appTicket":"$app_ticket","dmgTicket":"$dmg_ticket"}
REPORT
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    {
      printf '### macOS installer checks\n'
      printf -- '- App signature integrity: %s\n' "$integrity"
      printf -- '- Gatekeeper assessment: %s\n' "$gatekeeper"
      printf -- '- App notarization ticket: %s\n' "$app_ticket"
      printf -- '- DMG notarization ticket: %s\n' "$dmg_ticket"
      printf -- '- First open on a staff Mac: not tested\n'
    } >> "$GITHUB_STEP_SUMMARY"
  fi
}
trap finish EXIT

hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$mount_dir"
mounted=true
app="$mount_dir/STeP Desktop.app"
integrity='failed'
codesign --verify --deep --strict --verbose=2 "$app"
test -s "$mount_dir/อ่านก่อนเปิดครั้งแรก.html"
integrity='passed'

if assessment=$(spctl --assess --type execute --verbose=4 "$app" 2>&1); then
  gatekeeper='accepted'
  if [[ "$assessment" == *'source=Notarized Developer ID'* ]]; then
    gatekeeper='notarized Developer ID'
  fi
else
  gatekeeper='rejected'
fi
printf '%s\n' "$assessment"

app_ticket='not validated'
if xcrun stapler validate "$app"; then app_ticket='validated'; fi
dmg_ticket='not validated'
if xcrun stapler validate "$dmg"; then dmg_ticket='validated'; fi

if [[ "$required" == true || "$configured" == true ]]; then
  if [[ "$gatekeeper" != 'notarized Developer ID' || "$app_ticket" != 'validated' || "$dmg_ticket" != 'validated' ]]; then
    printf '%s\n' 'Trusted installer checks require notarized Developer ID and validated app and DMG tickets.' >&2
    exit 1
  fi
fi
