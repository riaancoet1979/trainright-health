@echo off
REM TrainRight Health - daily Garmin sync.
REM Writes public/gh-sync.json (+ dist/gh-sync.json if present), read only by
REM the app running locally on this PC (npm run dev / vite preview). Never
REM committed or pushed - public/ and dist/ are gitignored, and the live
REM GitHub Pages deploy deliberately rejects this file if it appears there.
cd /d "%~dp0"
python garmin_sync.py
echo Done. Local gh-sync.json refreshed - open the app via "npm run dev" to see it.
