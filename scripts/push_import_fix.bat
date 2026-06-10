@echo off
cd /d "%~dp0"
echo === Staging import fix ===
git add src/components/ProgramSettings.tsx src/utils/training.ts
git commit -m "Fix import backup: button+ref pattern for iOS Safari + add body_stats to ALL_KEYS"
echo === Pushing ===
git push origin main
echo === Done ===
pause
