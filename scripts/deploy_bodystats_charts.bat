@echo off
cd /d "%~dp0"
echo === TrainRight Health — Deploy Body Stats + Analytics Charts ===
echo.

REM Remove stale git lock if present
if exist ".git\index.lock" (
    del /f ".git\index.lock"
    echo [1] Removed stale git lock.
) else (
    echo [1] No lock file found, continuing.
)

echo.
echo [2] Staging changed files...
git add src/components/BodyStats.tsx src/components/Analytics.tsx
echo     git add exit code: %errorlevel%

echo.
echo [3] Committing...
git commit -m "feat: body stats progress charts always visible + auto-scroll on save; stats tab week navigation + bar charts"
echo     git commit exit code: %errorlevel%

echo.
echo [4] Pushing to GitHub...
git push
echo     git push exit code: %errorlevel%

echo.
echo === FINISHED ===
echo 0 = success, anything else = error
echo.
pause
