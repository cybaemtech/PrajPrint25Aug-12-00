@echo off
setlocal

if not exist node_modules (
  echo Installing dependencies...
  call npm install
)

echo Starting Print API on http://localhost:3001
start "Print API" cmd /k "node server/index.js"

timeout /t 2 /nobreak >nul

echo Starting frontend on http://localhost:5000
start "Frontend" cmd /k "npx vite"

echo.
echo Both servers are starting in separate windows.
echo Open http://localhost:5000 in your browser.
echo Close the windows to stop the servers.
pause
