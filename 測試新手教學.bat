@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules goto noinstall
start "" /b npx electron . --erin-test
echo 已用全新的測試資料夾開啟艾琳，平常的存檔不受影響。
echo 測試資料在 %TEMP%\erin-onboarding-test ，每次執行都會清空重來。
exit /b 0

:noinstall
echo 尚未安裝，請先執行「安裝.bat」
pause
