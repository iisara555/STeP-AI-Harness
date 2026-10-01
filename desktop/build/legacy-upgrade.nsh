; Only the known 0.3.2 same-directory upgrade avoids the legacy uninstaller.
; InstallApplicationFiles replaces managed binaries; AppData is outside INSTDIR.
; Other versions and destination changes keep electron-builder's normal uninstall.
!macro stepUninstallOldVersion ROOT_KEY
  Push $R8
  Push $R9
  !insertmacro readReg $R8 "${ROOT_KEY}" "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
  !insertmacro readReg $R9 "${ROOT_KEY}" "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $R8 == "0.3.2"
  ${AndIf} $R9 != ""
  ${AndIf} $R9 == $INSTDIR
  ${AndIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${AndIf} ${FileExists} "$INSTDIR\${UNINSTALL_FILENAME}"
    DetailPrint "Updating STeP 0.3.2 in its existing folder; preserving user data."
    ClearErrors
    StrCpy $R0 0
  ${Else}
    !insertmacro uninstallOldVersion ${ROOT_KEY}
    !insertmacro handleUninstallResult ${ROOT_KEY}
  ${EndIf}
  Pop $R9
  Pop $R8
!macroend
