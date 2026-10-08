@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node tools\check-node.js
if errorlevel 1 goto fail
echo 正在安裝（第一次需要幾分鐘）...
rem 下載來源：tools\pick-mirror.js 先看 Electron 下載過沒有，沒有就測 GitHub 官方和 npmmirror 鏡像站哪個快，挑快的
rem 想固定來源：在命令提示字元先打 set ERIN_DOWNLOAD=github（或 mirror），再從同一個視窗執行這個檔案
node tools\pick-mirror.js
if errorlevel 10 call :usemirror
rem 公司網路要透過 proxy 時（有設 HTTPS_PROXY），讓 Electron 的下載也走 proxy
if defined HTTPS_PROXY set ELECTRON_GET_USE_PROXY=1
if defined HTTPS_PROXY if not defined GLOBAL_AGENT_HTTPS_PROXY set "GLOBAL_AGENT_HTTPS_PROXY=%HTTPS_PROXY%"
if not exist config.json copy config.example.json config.json >nul
rem npm ci：照 package-lock.json 鎖定的版本一模一樣地裝，避免裝到跟開發時不一樣的版本
rem --foreground-scripts：看得到 Electron 的下載進度（慢的時候 30 秒後出現進度條），不會像卡住一樣沒反應
call npm ci --foreground-scripts
if not errorlevel 1 goto installed
echo.
echo 照鎖定版本安裝失敗，換另一個下載來源、改用 npm install 再試一次...
echo 如果艾琳正開著，請先右鍵 → 離開，再雙擊一次。
call :switchsource
call npm install --foreground-scripts
if errorlevel 1 goto installfail
:installed
call npm test
echo.
echo 安裝完成！之後雙擊「啟動.bat」即可。
pause
exit /b 0
:nonode
echo 找不到 Node.js：請到 https://nodejs.org 下載「LTS」版安裝，裝好後關掉這個視窗，再雙擊一次。
:fail
pause
exit /b 1
:installfail
echo.
echo 安裝失敗，請確認網路。公司網路的話，請看 README「常見問題」的「安裝卡住或失敗」
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
