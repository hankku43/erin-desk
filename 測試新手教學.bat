@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 尚未安裝，請先執行「安裝.bat」
  pause
  exit /b 1
)
rem 用一個全新的測試資料夾開艾琳，看朋友第一次打開時的樣子（新手教學、新手任務）
rem 平常的存檔、設定、週計畫都不會被動到；測試資料夾每次都會清空重來
set "QUEST_NPC_HOME=%TEMP%\艾琳的任務櫃台-測試"
if exist "%QUEST_NPC_HOME%" rmdir /s /q "%QUEST_NPC_HOME%"
echo 用全新的測試資料夾開啟艾琳：
echo   %QUEST_NPC_HOME%
echo 你平常的艾琳可以繼續開著，兩個會同時出現在畫面上。
start "" /b npx electron .
