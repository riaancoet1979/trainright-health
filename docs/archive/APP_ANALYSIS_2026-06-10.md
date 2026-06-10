# TrainRight Health — Full App Analysis & Improvement Plan
**Date:** 2026-06-10 · **Verified against:** live codebase, `tsc -b` (clean), `vitest run` (86/86 pass), `vite build` (OK)

---

## 1. Current state — what's healthy

- TypeScript compiles clean, all 86 tests pass, CI deploy pipeline works.
- Safety/training logic (coach engine, readiness, Monday-snap, migrations) is well-tested.
- PWA installs and updates correctly (skipWaiting, relative manifest paths).
- Good docs (README, PROGRAM.md, architecture notes).

The foundation is solid. The gaps below are what separate it from a professional product.

---

## 2. CRITICAL — Garmin/Apple Watch link is effectively broken on your iPhone

**This is the answer to "it needs to be linked with my Garmin or Apple Watch."**

How it works today:
1. `garmin_sync.py` runs manually on your PC → writes `public/garmin_health.json` + `dist/garmin_health.json`.
2. Both paths are now **gitignored** (privacy fix) → the file is **never deployed to GitHub Pages**.
3. The live app on your iPhone fetches `garmin_health.json` → **404 every time**.

Result: your iPhone PWA (the primary device) gets **zero** Garmin data unless you manually paste JSON via Settings → Import. The wearable link only ever worked when serving `dist/` from the PC.

### Fix options (pick one)

**Option A — Garmin auto-sync via GitHub Actions (recommended, free, no new apps)**
- Add a scheduled workflow (daily ~06:00 SAST cron) that runs `garmin_sync.py` in CI.
- Store the Garmin auth tokens (`.garmin_tokens/` contents, base64) as a GitHub Actions **secret** — the `garminconnect`/garth tokens auto-refresh, so login is one-time.
- Workflow writes `garmin_health.json` into the Pages artifact → live app picks it up automatically on every open.
- **Tradeoff:** the JSON (steps/sleep/RHR/HRV, no GPS) becomes publicly reachable again on Pages. Mitigations: random unguessable filename (e.g. `gh_7f3a9c.json`), or accept it (you accepted this before).
- Effort: ~1 hour. Zero ongoing maintenance. Works while you sleep.

**Option B — Apple Watch via Health Auto Export (if you want Watch data, not Garmin)**
- The iOS app **Health Auto Export** (premium, ~once-off/annual fee) can POST Apple Health metrics (steps, sleep, RHR, HRV) on a schedule to any REST endpoint.
- Needs a tiny free endpoint (Cloudflare Worker + KV) to receive the POST and serve it back to the app with a key; change `fetchGarminFile()` to fetch from the Worker URL.
- **Benefit:** fully private (data never on public Pages), works from the phone itself, no PC involved.
- Effort: ~half a day (Worker + app change + app setup).

**Option C — minimum effort, PC-dependent**
- Windows Task Scheduler runs `run_garmin_sync.bat` daily **and** commits/pushes the JSON (revert the gitignore). Same privacy tradeoff as A but depends on your PC being on.

**My recommendation:** Option A now (your Garmin is already wired in, tokens exist, sync script is proven). Add Option B later only if you switch to Apple Watch as primary wearable.

---

## 3. HIGH priority — professionalism gaps

| # | Finding | Fix |
|---|---|---|
| H1 | **Oversized components**: Settings.tsx (948 lines), BodyStats.tsx (899), Analytics.tsx (611), Train.tsx (605). Hard to maintain, every change risks regressions. | Split each into 3–5 sub-components (e.g. Settings → DataManagement, NutritionTargets, Appearance, Reminders). |
| H2 | **16 `alert()`/`confirm()` calls** (Settings, BodyStats, Achievements). Native dialogs look unprofessional and behave poorly in installed PWAs on iOS. | One reusable toast + modal-confirm component (no library needed, ~100 lines). |
| H3 | **No localStorage schema versioning.** 6+ storage keys, no version field — a future shape change can silently corrupt years of logs. | Add `{schemaVersion: n}` to each store + a small migration runner on app boot. |
| H4 | **No automatic backup.** All data lives in iPhone Safari localStorage; iOS *can* evict it. One manual "Export all data" button is the only protection. | Weekly auto-export reminder + (better) auto-backup JSON to the same Worker/Gist used for sync. |
| H5 | **Placeholder PWA icons** (192px = 547 bytes, 512px = 1.9 KB — flat color). The home-screen icon is the single most visible "professional" signal. | Generate a proper icon set (dumbbell/heart mark, maskable variant, Apple touch icon). |
| H6 | **Single 500+ kB JS chunk** (Chart.js + React bundled together). Slower first load on mobile data. | `manualChunks` split: vendor-react / vendor-chart, or lazy-load chart components per tab. |
| H7 | **Repo clutter**: 8 one-off `.bat` scripts, 3 `audit*` folders, `HANDOFF_INBODY_FEATURE.md`, version `0.0.0` in package.json. | Move .bat → `scripts/`, audits → `docs/audits/`, adopt real versioning (1.0.0) + update CHANGELOG. |

---

## 4. MEDIUM priority

- **Accessibility:** only 11 `aria-` attributes app-wide; nav buttons lack `aria-current`; charts have no text alternatives; some touch targets < 44px. iOS users with larger text settings will hit layout issues.
- **Untested UI:** utils are well-covered, but Settings, BodyStats, Train, Fitness components have no tests — exactly where the most code (and the import/export logic) lives. Add smoke + import-roundtrip tests.
- **Code hygiene:** 6 `any` types, 10 stray `console.*` calls in production paths — quick sweep.
- **Empty/loading states:** several tabs render blank with no data instead of a friendly "log your first…" prompt; no offline indicator despite being a PWA.
- **Garmin staleness surfacing:** `isHealthDataStale()` exists in health.ts but the "data is X days old" warning deserves a visible banner on the Train tab (it gates readiness quality).
- **CoachDaily only renders on session days** — rest-day recovery guidance is a natural extension.

## 5. LOW priority / ideas

- Lighthouse PWA pass (likely quick wins: meta description, theme-color sync with dark mode).
- Add ESLint to CI (currently only build+tsc gate deploys).
- Optional second user profile (Loenie) — architecture already mostly supports it.
- Week-16 retest flow in-app (currently a manual coaching step).

---

## 6. Suggested order of work

1. **Garmin auto-sync workflow (Option A)** — fixes the thing you actually asked for. ~1 h.
2. **PWA icons + toast/confirm replacement (H5, H2)** — biggest visible polish per hour. ~2–3 h.
3. **Schema versioning + auto-backup (H3, H4)** — protects years of data. ~3 h.
4. **Split Settings.tsx & BodyStats.tsx (H1) + hygiene sweep** — maintainability. ~1 day.
5. **Bundle split + a11y + empty states (H6, medium items)** — ~1 day.
6. Repo cleanup (H7) — 30 min, any time.

Each step is independently deployable; tests + `tsc -b` gate every push as usual.
