@echo off
cd /d "C:\Users\ACER\Claude Cowork\Health app"
if exist .git\index.lock del /f .git\index.lock
git add src/components/BodyStats.tsx
git commit -m "Fix: add arms/neck to measurements chart, show all body metrics"
git push
echo.
echo Done! Press any key to close.
pause
