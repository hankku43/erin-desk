@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node tools\check-node.js
if errorlevel 1 goto fail
echo 正在把艾琳打包成給朋友用的安裝程式（第一次會下載打包工具，需要幾分鐘）...
rem 下載來源：tools\pick-mirror.js 先看 Electron 下載過沒有，沒有就測 GitHub 官方和 npmmirror 鏡像站哪個快，挑快的
rem 想固定來源：在命令提示字元先打 set ERIN_DOWNLOAD=github（或 mirror），再從同一個視窗執行這個檔案
node tools\pick-mirror.js
if errorlevel 10 call :usemirror
rem 公司網路要透過 proxy 時（有設 HTTPS_PROXY），讓 Electron 的下載也走 proxy
if defined HTTPS_PROXY set ELECTRON_GET_USE_PROXY=1
if defined HTTPS_PROXY if not defined GLOBAL_AGENT_HTTPS_PROXY set "GLOBAL_AGENT_HTTPS_PROXY=%HTTPS_PROXY%"
rem 套件跟 package-lock.json 一樣才直接打包；有新套件（例如自動更新的 electron-updater）就先重新安裝，不然安裝檔會少東西
node tools\deps-ok.js
if not errorlevel 1 goto ready
rem npm ci：照 package-lock.json 鎖定的版本裝，打出來的安裝檔才會跟測試過的一樣
call npm ci --foreground-scripts
if not errorlevel 1 goto ready
echo.
echo 照鎖定版本安裝失敗，換另一個下載來源、改用 npm install 再試一次...
call :switchsource
call npm install --foreground-scripts
if errorlevel 1 goto installfail
:ready
call npm test
if errorlevel 1 goto testfail
call npm run dist
if not errorlevel 1 goto done
echo.
echo 打包遇到問題，改用不換圖示的方式再試一次...
call npx electron-builder --win --publish never -c.win.signAndEditExecutable=false
if errorlevel 1 goto packfail
:done
echo.
echo 完成！dist 資料夾裡的安裝程式可以給朋友（雙擊就裝好，會建桌面捷徑）。
rem 列出要上傳到 GitHub Release 的檔案（自動更新要 latest.yml 和 blockmap），並檢查 latest.yml 對得上
node tools\release-files.js
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
echo 安裝打包工具失敗，請確認網路。公司網路的話，請看 README「常見問題」的「安裝卡住或失敗」
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
:usemirror
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
exit /b 0
:switchsource
if defined ERIN_DOWNLOAD exit /b 0
if defined ELECTRON_MIRROR goto usegithub
call :usemirror
echo 改從 npmmirror 鏡像站下載
exit /b 0
:usegithub
set ELECTRON_MIRROR=
set ELECTRON_BUILDER_BINARIES_MIRROR=
echo 改從 GitHub 官方下載
exit /b 0
