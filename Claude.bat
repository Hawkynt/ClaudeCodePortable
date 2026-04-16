@echo off
REM ==========================================================================
REM  ClaudeCodePortable bootstrap (Windows)
REM    Ensures a SHA256-verified portable Node is installed under app/node,
REM    then hands off to launcher/launcher.mjs. Everything else -- Git, bash,
REM    perl, python, PowerShell, profile management, session menus, Explorer
REM    integration -- lives in the Node launcher.
REM ==========================================================================

setlocal EnableDelayedExpansion

set "PORTABLE_ROOT=%~dp0"
set "PORTABLE_ROOT=%PORTABLE_ROOT:~0,-1%"
set "APP_DIR=%PORTABLE_ROOT%\app"
set "NODE_DIR=%APP_DIR%\node"

set "NODE_VERSION=22.16.0"
set "NODE_ARCH=win-x64"
set "NODE_SUBDIR=node-v%NODE_VERSION%-%NODE_ARCH%"
set "NODE_BIN=%NODE_DIR%\%NODE_SUBDIR%"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_SUBDIR%.zip"
set "NODE_SHA256=21c2d9735c80b8f86dab19305aa6a9f6f59bbc808f68de3eef09d5832e3bfbbd"

if not exist "%APP_DIR%"  mkdir "%APP_DIR%"
if not exist "%NODE_DIR%" mkdir "%NODE_DIR%"

if not exist "%NODE_BIN%\node.exe" (
    echo Bootstrapping Node.js %NODE_VERSION% ^(first run only^)...
    set "NODE_ZIP=%NODE_DIR%\node.zip"
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_DIR%\node.zip' -UseBasicParsing" || (
        echo ERROR: Failed to download Node.js.
        exit /b 1
    )
    for /f %%h in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 -LiteralPath '%NODE_DIR%\node.zip').Hash.ToLower()"') do set "NODE_ACTUAL=%%h"
    if /i not "!NODE_ACTUAL!"=="%NODE_SHA256%" (
        echo ERROR: SHA256 mismatch for Node.js archive.
        echo   expected: %NODE_SHA256%
        echo   actual:   !NODE_ACTUAL!
        del /q "%NODE_DIR%\node.zip" >nul 2>&1
        exit /b 1
    )
    powershell -NoProfile -Command "Expand-Archive -Path '%NODE_DIR%\node.zip' -DestinationPath '%NODE_DIR%' -Force" || (
        echo ERROR: Failed to extract Node.js.
        exit /b 1
    )
    del /q "%NODE_DIR%\node.zip" >nul 2>&1
)

set "PATH=%NODE_BIN%;%PATH%"
"%NODE_BIN%\node.exe" "%PORTABLE_ROOT%\launcher\launcher.mjs" %*
endlocal
exit /b %ERRORLEVEL%
