@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Android Remote - Keep this window open
"runtime\node.exe" "app\launcher.mjs"
if errorlevel 1 pause
endlocal
