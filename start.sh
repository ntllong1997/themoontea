#!/bin/bash
echo "Starting The Moon Tea..."

cmd.exe /c start "Print Server" cmd /k "npm run print-server"
cmd.exe /c start "Web App" cmd /k "npm run dev"

sleep 5
cmd.exe /c start http://localhost:3000/order
