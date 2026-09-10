@echo off
REM TrainRight Health — serve the built app on the local network
REM Install on iPhone: open http://<this-pc-ip>:8080 in Safari -> Share -> Add to Home Screen
cd /d "%~dp0dist"
echo Serving TrainRight Health at http://localhost:8080
ipconfig | findstr /i "IPv4"
python -m http.server 8080
