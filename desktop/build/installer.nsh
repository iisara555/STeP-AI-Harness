; Check the exact executable name. The default directory-prefix check can
; mistake unrelated processes for the application. Never terminate those processes.
!include "${BUILD_RESOURCES_DIR}\legacy-upgrade.nsh"
!macro customCheckAppRunning
  step_check_running:
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${If} $R0 == 0
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Please close ${PRODUCT_NAME}, then click Retry. No application will be closed automatically." /SD IDCANCEL IDRETRY step_check_running
      Quit
    ${ElseIf} $R0 != 603
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Unable to check whether ${PRODUCT_NAME} is running. Click Retry to check again." /SD IDCANCEL IDRETRY step_check_running
      Quit
    ${EndIf}
!macroend

; Uninstalling asks whether to remove this person's data too: tasks, AI connections (with their encrypted keys),
; settings and the OCR runtime in %APPDATA%. The box starts unticked, so the default keeps everything for a
; reinstall. Updates and silent uninstalls never show the page and never remove data. Work files in the person's
; work folder (output/) and the profile shared with Setup-STeP-Skills (~/.step-ai/profile.json) are not touched.
; Expanded where the uninstaller defines its pages, after MUI2 and the NSIS plugins are loaded; this file itself
; is included before them.
!macro customUnWelcomePage
  !include nsDialogs.nsh
  Var stepDeleteDataBox
  Var stepDeleteData

  ; Updates run the old uninstaller silently, which shows no pages; customUnInstall checks isUpdated again.
  Function un.stepDataPage
    !insertmacro MUI_HEADER_TEXT "ข้อมูลในเครื่องนี้ · Your data" "เลือกว่าจะเก็บหรือลบ · Keep or remove it"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 60u "STeP Desktop เก็บประวัติงาน การเชื่อมต่อ AI และการตั้งค่าไว้ในเครื่องนี้ ถ้าเก็บไว้ ติดตั้งใหม่แล้วงานเดิมจะกลับมา$\r$\n$\r$\nSTeP Desktop keeps your tasks, AI connections and settings on this computer. Keep them to get your work back after a reinstall."
    Pop $0
    ${NSD_CreateCheckbox} 0 66u 100% 14u "ลบประวัติงาน การเชื่อมต่อ AI และการตั้งค่าด้วย · Also remove them"
    Pop $stepDeleteDataBox
    ${NSD_SetState} $stepDeleteDataBox $stepDeleteData
    ${NSD_CreateLabel} 0 86u 100% 30u "ไฟล์ผลงานในโฟลเดอร์งานไม่ถูกลบ · Files in your work folder are not removed."
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function un.stepDataLeave
    ${NSD_GetState} $stepDeleteDataBox $stepDeleteData
  FunctionEnd
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.stepDataPage un.stepDataLeave
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
  ${AndIf} $stepDeleteData == ${BST_CHECKED}
    DetailPrint "Removing STeP Desktop data"
    ${If} $installMode == "all"
      SetShellVarContext current
    ${EndIf}
    RMDir /r "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    !ifdef APP_PACKAGE_NAME
      RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    !endif
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  ${EndIf}
!macroend
