@echo off
cd /d "%~dp0"
echo === Restoring Coach files accidentally deleted in last commit ===
git add src/components/Coach.tsx src/utils/coach.ts src/__tests__/coach.spec.ts
git commit -m "Restore Coach component files accidentally deleted in previous commit"
echo === Pushing fix ===
git push origin main
echo === Done ===
pause
