# Backport upstream GetDParameter: /D is last and may contain unquoted spaces.
!macro LightMailGetDParameter outVar
  Push $R8
  Push $R9
  Push $R7
  Push $R6
  Push $R5
  ${StdUtils.GetAllParameters} $R8 "0"
  StrCpy $R9 ""
  StrLen $R7 $R8
  IntOp $R7 $R7 - 2
  StrCpy $R6 0
  ${Do}
    StrCpy $R5 $R8 3 $R6
    ${If} $R5 == "/D="
    ${OrIf} $R5 == "/d="
      IntOp $R6 $R6 + 3
      StrCpy $R9 $R8 "" $R6
      ${Break}
    ${EndIf}
    IntOp $R6 $R6 + 1
  ${LoopUntil} $R6 > $R7
  StrCpy ${outVar} $R9
  Pop $R5
  Pop $R6
  Pop $R7
  Pop $R9
  Pop $R8
!macroend

# Never terminate the user's running client during installation or removal.
# Checking the target file also permits a separate validation installation.
!macro customCheckAppRunning
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ClearErrors
    FileOpen $R0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" a
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Please exit Light Mail before updating or removing this installation." /SD IDOK
      SetErrorLevel 2
      Quit
    ${Else}
      FileClose $R0
    ${EndIf}
  ${EndIf}
!macroend
