!ifdef BUILD_UNINSTALLER
  !include "LogicLib.nsh"

  ; Keep this directory name synchronized with OMNIPAW_DATA_ROOT_DIR in core/utils/data-paths.ts.
  !macro customUnInstallSection
    Section /o "删除所有本地数据 · Remove all local data" SEC_OMNIPAW_DELETE_DATA
      SetShellVarContext current
      DetailPrint "Removing OmniPaw local data: $APPDATA\omnipaw"
      RMDir /r "$APPDATA\omnipaw"

      IfFileExists "$APPDATA\omnipaw\*.*" 0 omnipawDataRemoved
      MessageBox MB_ICONEXCLAMATION|MB_OK "部分本地数据无法删除，请确认相关文件没有被其他程序占用。$\r$\nSome local data could not be removed. Make sure no other program is using these files."

      omnipawDataRemoved:
    SectionEnd
  !macroend
!endif
