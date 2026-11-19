; Aster's per-user NSIS support macros.
;
; Wails rewrites wails_tools.nsh on every build, so the installer project uses
; this file instead. It installs without administrator rights: the app lives
; under %LOCALAPPDATA%\Programs\Aster and all registry keys are per-user.

!include "LogicLib.nsh"

!define ASTER_WEBVIEW2_GUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

; Install the Evergreen WebView2 runtime only when it is missing. Windows 11
; and up-to-date Windows 10 usually already have it.
!macro aster.ensureWebView2
  SetRegView 64
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${ASTER_WEBVIEW2_GUID}" "pv"
  StrCmp $0 "" 0 aster_webview2_done
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\${ASTER_WEBVIEW2_GUID}" "pv"
  StrCmp $0 "" 0 aster_webview2_done

  DetailPrint "Installing Microsoft Edge WebView2 Runtime..."
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "tmp\MicrosoftEdgeWebview2Setup.exe"
  ExecWait '"$PLUGINSDIR\MicrosoftEdgeWebview2Setup.exe" /silent /install'
  SetOutPath "$INSTDIR"

aster_webview2_done:
!macroend

!macro aster.writeUninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aster" "DisplayName" "Aster"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aster" "DisplayVersion" "${ASTER_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aster" "Publisher" "Aster Clinic"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aster" "DisplayIcon" "$INSTDIR\Aster.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aster" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aster" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aster" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aster" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aster" "NoRepair" 1

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aster" "EstimatedSize" "$0"
!macroend
