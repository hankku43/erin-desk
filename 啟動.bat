@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 尚未安裝，請先執行「安裝.bat」
  pause
  exit /b 1
)
start "" /b npx electron .
