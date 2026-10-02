@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node tools\check-node.js
if errorlevel 1 goto fail
echo 正在安裝（第一次需要幾分鐘）...
rem 公司網路下載 Electron 失敗時，把下一行最前面的 rem 刪掉再執行一次
rem set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
if not exist config.json copy config.example.json config.json >nul
rem npm ci：照 package-lock.json 鎖定的版本一模一樣地裝，避免裝到跟開發時不一樣的版本
call npm ci
if not errorlevel 1 goto installed
echo.
echo 照鎖定版本安裝失敗，改用 npm install 再試一次...
echo 如果艾琳正開著，請先右鍵 → 離開，再雙擊一次。
call npm install
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
echo 安裝失敗，請確認網路，或改用鏡像站（見本檔註解）
pause
exit /b 1
