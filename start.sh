#!/usr/bin/env bash
# 重生避难所 · macOS / Linux 启动脚本
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  未找到 Node.js，请先安装：https://nodejs.org"
  echo ""
  exit 1
fi
echo ""
echo "  重生避难所 · 本地服务启动中…"
echo "  游戏地址：http://localhost:8787/  （按 Ctrl+C 停止）"
echo ""
node server.js
