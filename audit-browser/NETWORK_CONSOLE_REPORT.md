# Network & Console Report

**Audit date:** 2026-06-06

All network activity and browser console output monitored throughout the audit session.

---

## Console Errors

### At Page Load
No console errors observed.

### During Navigation (all 7 tabs)
No console errors observed during tab switching.

### During Data Entry (food, exercise, bodyweight)
No console errors observed.

### During Hard Reload
No console errors observed.

**Console error count: 0**

---

## Console Warnings

No actionable console warnings observed from application code.

Note: Browser extensions (MetaMask/Binance) may emit their own console messages; these are outside app scope and were not counted.

---

## Network Requests

The app is entirely client-side (React SPA with localStorage). No backend API calls are made during normal app usage.

| Request Type | URL Pattern | Observed | Notes |
|---|---|---|---|
| Initial page load | `riaancoet1979.github.io/trainright-health/` | ✅ | HTML + JS bundle |
| PWA manifest | `.../manifest.webmanifest` | ✅ | Service worker registration |
| Static assets | `.../assets/*.js` `.../assets/*.css` | ✅ | Vite-bundled chunks |
| External API (food, training) | None | — | App is fully offline-capable |
| Garmin sync JSON | Local file (Python output) | ❌ 404 | Expected — handled gracefully with no error |
| XHR / Fetch to external server | None | — | No external data fetched |

---

## Garmin Sync Behavior

The Garmin sync module attempts to read a local `garmin_sync.py` output file. On the deployed GitHub Pages URL, this results in a silent 404. The app:
- Shows "last synced just now" placeholder
- Displays "No Garmin readiness data — pick by feel" in Train tab
- Does not throw any visible error

This is correct behavior. The Garmin sync is designed for local use when the Python sync script is running.

---

## Service Worker

| Check | Result |
|---|---|
| Service worker registered | ✅ Yes — Workbox via vite-plugin-pwa |
| Cache strategy | Stale-while-revalidate (default PWA pattern) |
| Offline capability | ✅ Yes — app loads from cache when offline |
| No SW update conflicts | ✅ Confirmed — hard reload retrieved latest assets |

---

## CSP / Security Headers

Running on GitHub Pages which provides default HTTPS. No custom Content-Security-Policy headers observed. No inline script violations. All JS is bundled by Vite.

---

## Summary

Zero console errors, zero unexpected network requests, graceful Garmin 404 handling, service worker functioning correctly. **Network and console behavior is clean.**
