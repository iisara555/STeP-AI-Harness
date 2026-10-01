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
