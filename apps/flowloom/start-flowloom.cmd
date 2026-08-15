@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [Flowloom] Node.js or npm was not found.
  echo Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [Flowloom] Installing dependencies for the first run...
  call npm.cmd install
  if errorlevel 1 (
    echo [Flowloom] Dependency installation failed.
    pause
    exit /b 1
  )
)

echo [Flowloom] Starting at http://127.0.0.1:5173/
echo Keep this window open. Press Ctrl+C to stop the local server.
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:5173/'"
call npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort

endlocal
