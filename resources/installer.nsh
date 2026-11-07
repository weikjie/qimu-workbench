; Adds a direct "使用栖木工作台打开" verb to the Windows context menu for
; Markdown files. electron-builder's fileAssociations registers the application
; and the "打开方式" entry; this script makes the action one click away.
!define QIMU_MARKDOWN_PROGID "Qimu.Workbench.Markdown"

!macro QIMU_ADD_MARKDOWN_VERB EXT
  WriteRegStr SHELL_CONTEXT "Software\Classes\SystemFileAssociations\${EXT}\shell\QimuWorkbench" "" "使用栖木工作台打开"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SystemFileAssociations\${EXT}\shell\QimuWorkbench" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr SHELL_CONTEXT "Software\Classes\SystemFileAssociations\${EXT}\shell\QimuWorkbench\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro QIMU_REMOVE_MARKDOWN_VERB EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\QimuWorkbench"
  DeleteRegKey HKLM "Software\Classes\SystemFileAssociations\${EXT}\shell\QimuWorkbench"
!macroend

!macro customInstall
  !insertmacro QIMU_ADD_MARKDOWN_VERB ".md"
  !insertmacro QIMU_ADD_MARKDOWN_VERB ".markdown"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)'
!macroend

!macro customUnInstall
  !insertmacro QIMU_REMOVE_MARKDOWN_VERB ".md"
  !insertmacro QIMU_REMOVE_MARKDOWN_VERB ".markdown"

  ; electron-builder removes the ProgId itself, but leaves a stale default
  ; extension value pointing at it. Only clear the value if it is still ours.
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.md" ""
  StrCmp $0 "${QIMU_MARKDOWN_PROGID}" 0 +2
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.md" ""
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.markdown" ""
  StrCmp $0 "${QIMU_MARKDOWN_PROGID}" 0 +2
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.markdown" ""

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)'
!macroend
