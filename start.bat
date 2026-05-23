@echo off
echo Starting The Moon Tea...
start "Print Server" cmd /k "npm run print-server"
start "Web App" cmd /k "npm run dev"
timeout /t 4 /nobreak > nul
start http://localhost:3000/order
