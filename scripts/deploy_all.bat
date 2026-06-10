@echo off
cd /d "%~dp0"
echo === TrainRight Health — Full Deploy ===
echo.

REM Remove stale git lock if present
if exist ".git\index.lock" (
    del /f ".git\index.lock"
    echo [1] Removed stale git lock.
) else (
    echo [1] No lock file found.
)

echo.
echo [2] Clearing any bad staged state...
git restore --staged .
echo     git restore exit code: %errorlevel%

echo.
echo [3] Staging source code changes...
git add src/components/Analytics.tsx
git add src/components/BodyStats.tsx
git add src/components/FoodEntry.tsx
git add src/utils/storage.ts
echo     git add src exit code: %errorlevel%

echo.
echo [4] Staging all bat files...
git add deploy_all.bat
git add deploy_bodystats_charts.bat
git add deploy_qa_fixes.bat
git add deploy_stats_charts.bat
git add fix_ci.bat
git add push_fixes.bat
git add push_import_fix.bat
git add push_manifest_fix.bat
git add push_pwa_fix.bat
echo     git add bats exit code: %errorlevel%

echo.
echo [5] Committing...
git commit -m "feat: body stats charts always visible + auto-scroll on save; stats tab week nav + bar charts; QA fixes (FP-001, UX-001)"
echo     git commit exit code: %errorlevel%

echo.
echo [6] Pushing to GitHub...
git push
echo     git push exit code: %errorlevel%

echo.
echo === FINISHED ===
echo GitHub Pages rebuilds in ~60 seconds after a successful push.
echo.
pause
