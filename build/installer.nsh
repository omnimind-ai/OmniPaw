!ifdef BUILD_UNINSTALLER
  !include "LogicLib.nsh"
  !include "MUI2.nsh"
  !include "nsDialogs.nsh"

  Var OmniPawDeleteDataCheckbox
  Var OmniPawDeleteDataRequested

  !macro customUnWelcomePage
    UninstPage custom un.OmniPawDataOptionsPageCreate un.OmniPawDataOptionsPageLeave
  !macroend

  ; Register the cleanup section after electron-builder checks whether it should add
  ; a components page. The section remains part of the uninstall progress page.
  !macro customHeader
    !include "uninstaller-data-section.nsh"
  !macroend

  Function un.OmniPawDataOptionsPageCreate
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    !insertmacro MUI_HEADER_TEXT "本地数据 · Local data" "保留或删除本地数据 · Keep or remove local data"

    ${NSD_CreateLabel} 0 0 100% 30u "默认保留设置、聊天记录、模型和其他本地数据。$\r$\nSettings, chats, models, and other local data are kept by default."
    Pop $0

    ${NSD_CreateCheckbox} 0 42u 100% 18u "删除所有本地数据 · Remove all local data"
    Pop $OmniPawDeleteDataCheckbox

    ${If} $OmniPawDeleteDataRequested == ${BST_CHECKED}
      ${NSD_Check} $OmniPawDeleteDataCheckbox
    ${Else}
      ${NSD_Uncheck} $OmniPawDeleteDataCheckbox
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function un.OmniPawDataOptionsPageLeave
    ${NSD_GetState} $OmniPawDeleteDataCheckbox $OmniPawDeleteDataRequested
  FunctionEnd
!endif
