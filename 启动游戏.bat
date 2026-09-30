@echo off
cd /d "%~dp0"
chcp 65001 >nul
title 重生避难所 - 本地存档服务

set "NODE_EXE="

rem --- 1) 依赖总线里的 Node（fnm 装的 24.x，SQLite 无警告）---
for /d %%d in ("E:\bus\node\node-versions\*") do (
  if exist "%%d\installation\node.exe" set "NODE_EXE=%%d\installation\node.exe"
)

rem --- 2) 系统 PATH 里的 Node ---
if not defined NODE_EXE (
  for /f "delims=" %%i in ('where node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%i"
  )
)

rem --- 3) 兜底：WorkBuddy 自带 Node ---
if not defined NODE_EXE (
  if exist "C:\Users\gblyh\.workbuddy\binaries\node\versions\22.22.2-3\node.exe" (
    set "NODE_EXE=C:\Users\gblyh\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
  )
)

if not defined NODE_EXE goto :nonode

echo.
echo   使用 Node：%NODE_EXE%
echo   正在启动本地存档服务 ...
echo   游戏地址：http://localhost:8787/
echo.
echo   *** 这个黑窗口要一直开着，关掉就停止存档 ***
echo.

start "" http://localhost:8787/
"%NODE_EXE%" server.js

echo.
echo   服务已停止。存档已写入 shelter.db
echo   如果上面出现报错（例如提到 sqlite），说明 Node 版本太低，需 22.5 以上（推荐 24）。
echo.
pause
exit /b 0

:nonode
echo.
echo   [!] 没找到 Node.js，无法启动本地存档服务。
echo.
echo   已按顺序找过这 3 个地方：
echo     1. E:\bus\node\node-versions\*\installation\node.exe
echo     2. 系统 PATH 里的 node
echo     3. WorkBuddy 自带的 node
echo.
echo   最快的解决办法：在这台机器上建依赖总线，会自动装好 Node。
echo   步骤见：E:\OneDrive\obsidian\记忆\新机建总线-执行方案.md
echo.
pause
exit /b 1
