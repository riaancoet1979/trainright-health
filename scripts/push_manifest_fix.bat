@echo off
cd /d "%~dp0"
echo === Staging manifest fix ===
git add public/manifest.webmanifest index.html vite.config.ts
git commit -m "Fix iOS homescreen: static manifest with correct start_url + scope for GitHub Pages"
echo === Pushing ===
git push origin main
echo === Done ===
pause
