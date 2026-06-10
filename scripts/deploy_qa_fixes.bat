@echo off
cd /d "%~dp0"
echo === TrainRight Health — Deploy QA Fixes ===
echo.

REM Remove stale git lock if present
if exist ".git\index.lock" (
    del /f ".git\index.lock"
    echo [1] Removed stale git lock.
) else (
    echo [1] No lock file found, continuing.
)

echo.
echo [2] Staging files...
git add src/utils/storage.ts src/components/FoodEntry.tsx audit-browser/ package.json package-lock.json
echo     git add exit code: %errorlevel%

echo.
echo [3] Committing...
git commit -m "fix: floating-point nutrition display + Add tab date context (QA audit)"
echo     git commit exit code: %errorlevel%

echo.
echo [4] Pushing to GitHub...
git push
echo     git push exit code: %errorlevel%

echo.
echo === FINISHED — see exit codes above ===
echo 0 = success, anything else = error
echo.
pause
