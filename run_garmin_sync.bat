@echo off
REM TrainRight Health - daily Garmin sync + push to GitHub Pages
cd /d "%~dp0"
python garmin_sync.py
git add public/garmin_health.json
git commit -m "Garmin sync %date%" >nul 2>&1
git push >nul 2>&1
echo Done. GitHub Pages will rebuild with fresh Garmin data (~1 min).
