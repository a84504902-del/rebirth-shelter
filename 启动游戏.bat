@echo off
cd /d "%~dp0"
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js not found. Please install Node.js from https://nodejs.org
  echo.
  pause
  exit /b 1
)
echo.
echo   Starting Rebirth Shelter local server...
echo   (Keep this window open while playing. Closing it stops saving.)
echo.
start "" http://localhost:8787/
node server.js
pause
