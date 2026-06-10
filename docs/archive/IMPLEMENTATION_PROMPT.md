# Implementation Prompt — TrainRight Health Professional Upgrade
Copy-paste everything below this line into a new Claude session with the Health app folder connected.

---

Upgrade my TrainRight Health app (`C:\Users\ACER\Claude Cowork\Health app`, repo `riaancoet1979/trainright-health`, live at https://riaancoet1979.github.io/trainright-health/) per the findings in `APP_ANALYSIS_2026-06-10.md`. Load the trainright-health-coach skill first and follow its build/deploy rules exactly.

## Non-negotiable constraints
- Never delete `.npmrc`; never run `npm audit fix`.
- Build/test in a `/tmp` copy (mounted folder is slow and delete-blocked), copy results back.
- `npx tsc -b` and `npx vitest run` must pass (86+ tests) before every push. Add tests for new logic.
- Do not change `src/data/program.ts` program content or any coach-engine safety rules.
- Never do anything destructive to localStorage data shapes without a migration — my phone holds months of real logs.
- Deploy = push to main (GitHub Actions → Pages). Work in small, independently deployable commits in this order.

## Phase 1 — Garmin auto-sync via GitHub Actions (Option A) [DO FIRST]
1. New workflow `.github/workflows/garmin-sync.yml`: daily cron ~04:30 UTC (06:30 SAST) + workflow_dispatch. Steps: checkout → setup Python → `pip install garminconnect` → restore `.garmin_tokens/` from a repo secret `GARMIN_TOKENS_B64` (base64 of the token dir contents) → run `garmin_sync.py` → publish the JSON so the live Pages site serves it.
2. Use an unguessable filename, e.g. `gh_<random hex>.json`: parameterise the output name in `garmin_sync.py` and in `fetchGarminFile()` (`src/utils/health.ts`) via a constant. Keep `garmin_health.json` ignored; the new name is generated in CI only (simplest: sync workflow builds the site and includes the JSON in the Pages artifact, or commits it to a `gh-pages`-served path — pick the simplest reliable approach with the current deploy.yml and explain it).
3. Walk me through the one-time steps I must do: creating `GARMIN_TOKENS_B64` from my PC's `.garmin_tokens/` folder and adding it in repo Settings → Secrets. Give me exact commands.
4. Surface staleness: show a visible banner on the Train tab when `isHealthDataStale()` (>48 h), with last-sync label. Test it.
5. Verify end-to-end: trigger workflow_dispatch, confirm the live app absorbs fresh data on my phone.

## Phase 2 — Visible polish
6. **PWA icons**: replace the placeholder `pwa-192x192.png` / `pwa-512x512.png` with a proper designed icon (green dumbbell+pulse mark on dark background), include a maskable 512 variant and `apple-touch-icon` (180×180) wired into `index.html` and the manifest.
7. **Kill alert()/confirm()** (16 call sites in Settings.tsx, BodyStats.tsx, Achievements.tsx): build a small reusable `<Toast>` (success/error, auto-dismiss) and `<ConfirmDialog>` component, dark-mode aware, and replace every native dialog. No new dependencies.

## Phase 3 — Data safety
8. **Schema versioning**: add `schemaVersion` to each localStorage store (`nutrition_tracker_*`, `health_training_v1`, `health_metrics_v1`) with a boot-time migration runner (current data = v1, migrate forward only, never drop unknown fields). Tests for the runner.
9. **Backup nudge**: track last export date; show a gentle banner in Settings (and a dot on the Settings nav icon) when no export in 14+ days. Keep manual Export all data as-is.

## Phase 4 — Code structure & hygiene
10. Split oversized components, behaviour-identical refactors only: `Settings.tsx` (948) → DataManagement / NutritionTargets / Appearance / Reminders sections; `BodyStats.tsx` (899) → entry form / history list / charts; `Analytics.tsx` (611) and `Train.tsx` (605) → extract their chart/sub-panel pieces. Verify with tests + manual diff of rendered behaviour.
11. Hygiene sweep: remove the 6 `any` types, strip 10 stray `console.*` from production paths, delete dead code.
12. Repo cleanup: move all one-off `.bat` scripts to `scripts/`, audit folders to `docs/audits/`, archive `HANDOFF_INBODY_FEATURE.md` to docs, set package.json version `1.0.0`, update CHANGELOG.md.

## Phase 5 — UX & performance
13. Bundle split: `manualChunks` for react/chart.js vendors or lazy-load chart-heavy tabs; target main chunk < 300 kB.
14. Empty states: friendly "no data yet" prompts on Calendar/Stats/Fitness/Body tabs instead of blank panels.
15. Accessibility pass: `aria-current` on nav, labels on icon-only buttons, ≥44px touch targets, chart `aria-label` summaries.
16. CoachDaily on rest days: render a recovery-focused card (sleep/steps/readiness + tomorrow's session preview) instead of nothing.

After each phase: run tsc + vitest, deploy, and tell me what to check on my phone (one reload picks up the new service worker). At the end, update README and the analysis file with what was done.
