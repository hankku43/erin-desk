@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在安裝（第一次需要幾分鐘）...
rem 公司網路下載 Electron 失敗時，把下一行最前面的 rem 刪掉再執行一次
rem set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
if not exist config.json copy config.example.json config.json >nul
call npm install
if errorlevel 1 (
  echo.
  echo 安裝失敗，請確認已安裝 Node.js，或改用鏡像站（見本檔註解）
  pause
  exit /b 1
)
call npm test
echo.
echo 安裝完成！之後雙擊「啟動.bat」即可。
pause
