; Aster's per-user Windows installer.
;
; Build it after `wails build` from this directory:
;   makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\Aster.exe project.nsi
; The release workflow calls Wails with -nsis, which writes the WebView2
; bootstrapper under tmp\ and then runs makensis with the same define.
;
; Everything here is per-user on purpose: OTA updates install without an
; elevation prompt and land where internal/updater/install_windows.go looks
; for the executable: %LOCALAPPDATA%\Programs\Aster\Aster.exe.

Unicode true

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "version.nsh"
!include "aster_tools.nsh"

!ifdef ARG_WAILS_AMD64_BINARY
  !define ASTER_ARCH "amd64"
  !define ASTER_BINARY "${ARG_WAILS_AMD64_BINARY}"
!else
  !ifdef ARG_WAILS_ARM64_BINARY
    !define ASTER_ARCH "arm64"
    !define ASTER_BINARY "${ARG_WAILS_ARM64_BINARY}"
  !else
    !error "Pass -DARG_WAILS_AMD64_BINARY=... or -DARG_WAILS_ARM64_BINARY=..."
  !endif
!endif

Name "Aster"
BrandingText "Aster Clinic"
OutFile "..\..\bin\Aster-${ASTER_VERSION}-windows-${ASTER_ARCH}-setup.exe"
; The location is fixed because the in-app updater launches the downloaded
; setup silently and then starts this exact path.
InstallDir "$LOCALAPPDATA\Programs\Aster"
RequestExecutionLevel user
SetCompressor /SOLID lzma

VIProductVersion "${ASTER_VERSION_QUAD}"
VIFileVersion "${ASTER_VERSION_QUAD}"
VIAddVersionKey "CompanyName" "Aster Clinic"
VIAddVersionKey "FileDescription" "Aster Clinic Installer"
VIAddVersionKey "ProductVersion" "${ASTER_VERSION}"
VIAddVersionKey "FileVersion" "${ASTER_VERSION}"
VIAddVersionKey "LegalCopyright" "Aster Clinic"
VIAddVersionKey "ProductName" "Aster"

ManifestDPIAware true

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Aster.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Aster"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Aster" SEC_MAIN
  !insertmacro aster.ensureWebView2

  SetOutPath "$INSTDIR"
  File "/oname=Aster.exe" "${ASTER_BINARY}"

  CreateDirectory "$SMPROGRAMS\Aster"
  CreateShortCut "$SMPROGRAMS\Aster\Aster.lnk" "$INSTDIR\Aster.exe"
  CreateShortCut "$DESKTOP\Aster.lnk" "$INSTDIR\Aster.exe"

  WriteRegStr HKCU "Software\Aster" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Aster" "Version" "${ASTER_VERSION}"
  !insertmacro aster.writeUninstaller
SectionEnd

Section "Uninstall"
  ; The installer writes its keys in the 64-bit view; the uninstaller has to
  ; read the same view or Windows keeps a stale "Aster" entry forever.
  SetRegView 64

  ; Clinic data lives in %APPDATA%\Aster and is deliberately kept: removing
  ; the application must never delete patient records.
  Delete "$DESKTOP\Aster.lnk"
  RMDir /r "$SMPROGRAMS\Aster"
  RMDir /r "$INSTDIR"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aster"
  DeleteRegKey HKCU "Software\Aster"
SectionEnd
