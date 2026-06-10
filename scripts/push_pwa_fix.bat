@echo off
cd /d "%~dp0"
echo === Staging PWA manifest fix ===
git add vite.config.ts index.html
git commit -m "Fix PWA start_url and scope for GitHub Pages + add iOS homescreen meta tags"
echo === Pushing ===
git push origin main
echo === Done ===
pause
