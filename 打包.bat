@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在把艾琳打包成給朋友用的安裝程式（第一次會下載打包工具，需要幾分鐘）...
rem 公司網路下載 Electron 失敗時，把下一行最前面的 rem 刪掉再執行一次
rem set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
if not exist node_modules\electron-builder (
  call npm install
  if errorlevel 1 (
    echo.
    echo 安裝打包工具失敗，請確認網路，或改用鏡像站（見本檔註解）
    pause
    exit /b 1
  )
)
call npm test
if errorlevel 1 (
  echo.
  echo 測試沒有全部通過，先不打包。請把上面的訊息截圖給幫你改程式的人。
  pause
  exit /b 1
)
call npm run dist
if errorlevel 1 (
  echo.
  echo 打包遇到問題，改用不換圖示的方式再試一次...
  call npx electron-builder --win -c.win.signAndEditExecutable=false
  if errorlevel 1 (
    echo.
    echo 打包失敗，請把上面的訊息截圖給幫你改程式的人。
    pause
    exit /b 1
  )
)
echo.
echo 完成！dist 資料夾裡有兩個檔案可以給朋友：
echo   Erin-Setup-版本.exe      安裝程式：雙擊就裝好，會建桌面捷徑
echo   Erin-版本-portable.zip   免安裝版：解壓縮後雙擊 Erin.exe
start "" "%~dp0dist"
pause
