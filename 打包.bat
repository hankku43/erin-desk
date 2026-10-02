@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node tools\check-node.js
if errorlevel 1 goto fail
echo 正在把艾琳打包成給朋友用的安裝程式（第一次會下載打包工具，需要幾分鐘）...
rem 公司網路下載 Electron 失敗時，把下一行最前面的 rem 刪掉再執行一次
rem set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
if exist node_modules\electron-builder goto ready
rem npm ci：照 package-lock.json 鎖定的版本裝，打出來的安裝檔才會跟測試過的一樣
call npm ci
if not errorlevel 1 goto ready
echo.
echo 照鎖定版本安裝失敗，改用 npm install 再試一次...
call npm install
if errorlevel 1 goto installfail
:ready
call npm test
if errorlevel 1 goto testfail
call npm run dist
if not errorlevel 1 goto done
echo.
echo 打包遇到問題，改用不換圖示的方式再試一次...
call npx electron-builder --win -c.win.signAndEditExecutable=false
if errorlevel 1 goto packfail
:done
echo.
echo 完成！dist 資料夾裡有兩個檔案可以給朋友：
echo   Erin-Setup-版本.exe      安裝程式：雙擊就裝好，會建桌面捷徑
echo   Erin-版本-portable.zip   免安裝版：解壓縮後雙擊 Erin.exe
start "" "%~dp0dist"
pause
exit /b 0
:nonode
echo 找不到 Node.js：請到 https://nodejs.org 下載「LTS」版安裝，裝好後關掉這個視窗，再雙擊一次。
:fail
pause
exit /b 1
:installfail
echo.
echo 安裝打包工具失敗，請確認網路，或改用鏡像站（見本檔註解）
pause
exit /b 1
:testfail
echo.
echo 測試沒有全部通過，先不打包。請把上面的訊息截圖給幫你改程式的人。
pause
exit /b 1
:packfail
echo.
echo 打包失敗，請把上面的訊息截圖給幫你改程式的人。
pause
exit /b 1
