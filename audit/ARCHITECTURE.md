# Architecture Map — TrainRight Health

> Generated 2026-06-06 from a code-first audit of branch `main` @ `b9fad0c`.

## System type

**TrainRight Health** is a **single-user React 19 + TypeScript Progressive Web App** built with Vite. It is **not** an iOS native app, **not** a multi-tenant SaaS, and **not** a HealthKit consumer. All persistence is in browser `localStorage`. There is no backend, no authentication, and no server-side database — the deployment target is GitHub Pages.

The audit prompt describes a multi-user iOS HealthKit calisthenics coaching system. The audit below maps each prompt requirement to **what this code actually does**, marks N/A where the requirement does not apply, and notes any false claims the UI/docs make about features that do not exist.

## Components

### Entry points

| Path | Role |
|---|---|
| `index.html` + `src/main.tsx` | Vite/React bootstrap, mounts `<App />` |
| `src/App.tsx` | Top-level shell, 7-tab bottom nav (Cal / Train / Add / Stats / Fitness / Body / Settings) |
| `public/sw.js` + `vite-plugin-pwa` | Service worker / install / offline cache |
| `garmin_sync.py` | Out-of-process Python script that pulls Garmin Connect data |
| `.github/workflows/deploy.yml` | Builds and publishes `dist/` to GitHub Pages |

### Engines (`src/utils/*`)

| File | Responsibility |
|---|---|
| `training.ts` | Program-week resolution, readiness adjustment, session log CRUD, body-metric CRUD, day-type macro target lookup, full backup export/import, legacy `trainright_v1` migration |
| `health.ts` | Garmin-payload merge, `garmin_health.json` fetch, **readiness suggestion** from sleep + RHR-vs-14d-median |
| `coach.ts` | Deterministic daily insights + weekly review with exercise-progression recommendations |
| `nutrition.ts` | Analytics aggregations (calorie series, macro split, goal-achievement rate) — no BMR/TDEE engine |
| `suggestions.ts` | Smart food suggestions to close a daily macro deficit |
| `fitness.ts` | Pushup / step trends and PR detection |
| `foodValidation.ts` | Database validator (4×4×9 macro-vs-kcal sanity, range checks) |
| `storage.ts` | localStorage I/O for daily entries, settings, custom foods, achievements, body stats |

### Data / domain (`src/data/*`, `src/types/*`)

| File | Responsibility |
|---|---|
| `data/program.ts` | The 16-week, 4-phase calisthenics program with hard shoulder-safety rules baked into exercise metadata (`painFreeOnly`, `yellowSkip`, `leftFocus`) |
| `data/foodDatabase.ts` | Curated SA + global food database (per 100g macros) |
| `types/training.ts` | Program/session/body-metric types |
| `types/index.ts` | Nutrition/daily-entry types |

### UI (`src/components/*`)

7 tabs glued together in `App.tsx`:

- **Train** — selects today's session, shows readiness pickers, shoulder-pain slider, exercise rows with set logging, last-session placeholders, rest timer, bodyweight log, Coach daily card
- **Calendar / DailySummary** — per-date nutrition view
- **Add (FoodEntry / ExerciseEntry)** — log meals and ad-hoc cardio
- **Analytics** — Coach weekly review + Chart.js charts (calories/macros/goals)
- **Fitness** — pushup sets and step tracking
- **Body** — body-stat history and charts (weight, BF%, measurements)
- **Settings (ProgramSettings + Settings)** — program start date, day-type macro targets, theme, rest-timer minutes, pushup reminders, custom-food CRUD, full backup import/export, Garmin JSON import, legacy `trainright_v1` import

### Hooks

| File | Role |
|---|---|
| `hooks/useRestTimer.ts` | Countdown timer for inter-set rest |
| `hooks/usePushupReminders.ts` | Schedules browser notifications + optional Service-Worker push for daily pushup prompts |

## Data flow

```
                    ┌──────────────────┐
 Garmin Connect ◄───┤ garmin_sync.py   │  (Python CLI, run by user)
                    └────────┬─────────┘
                             │ writes garmin_health.json
                             ▼
                ┌────────────────────────────┐
                │ public/garmin_health.json  │  ← committed to git (privacy risk H-01)
                │ dist/garmin_health.json    │  ← gitignored build artifact
                └────────┬───────────────────┘
                         │ fetch('garmin_health.json')
                         ▼
                ┌────────────────────────────┐
                │ health.ts:mergeGarminData  │
                └────────┬───────────────────┘
                         │ updates daily steps + health_metrics_v1
                         ▼
            ┌──────────────────────────────────────┐
            │ localStorage (single browser, no PII │
            │ ever leaves the device)              │
            │   • health_metrics_v1                │
            │   • health_training_v1               │
            │   • nutrition_tracker_daily_entries  │
            │   • nutrition_tracker_user_settings  │
            │   • nutrition_tracker_custom_foods   │
            │   • nutrition_tracker_achievements   │
            │   • trainright_body_stats            │
            └─────┬────────────────┬───────┬───────┘
                  │                │       │
                  ▼                ▼       ▼
            training.ts        coach.ts  Analytics.tsx
            (readiness         (insights, (charts)
             + day-type        weekly
             targets)          review)
                  │
                  ▼
              Train.tsx UI (readiness picker, set logging)
```

## Trust boundaries

| Boundary | Notes |
|---|---|
| Browser ↔ localStorage | Same-origin only. PWA can be installed but data is per-browser/per-device. No cross-device sync. |
| Browser ↔ same-origin `garmin_health.json` | Fetched from app's own origin. **No auth.** Anyone able to reach the published URL can read the file. |
| Python script ↔ Garmin Connect | Credentials prompted interactively; token cache in `.garmin_tokens/` (git-ignored). |
| GitHub Actions ↔ GitHub Pages | Builds `dist/`, publishes the entire `public/` tree, including any health JSON checked in. |

There is **no** server-side trust boundary because there is no server. Authentication, authorization, multi-tenant isolation, and similar concerns from the prompt do not map; per-device localStorage is the entire data model.

## External services

- **Garmin Connect** (read-only, out-of-band Python script)
- **GitHub Pages** (static hosting, public by default)
- **Browser Notification API** + **Service Worker** (pushup reminders)
- **No AI/LLM, no analytics, no crash reporting, no third-party data sinks.** Coach output is fully deterministic.

## Storage locations

All in browser `localStorage` (no SQLite, IndexedDB, or remote DB):

| Key | Owner | Shape |
|---|---|---|
| `health_training_v1` | `training.ts` | `{ programStartDate, logs[date], bodyMetrics[], legacyTrainRight? }` |
| `health_metrics_v1` | `health.ts` | `{ syncedAt, days[date]={steps,sleepHours,rhr,hrv} }` |
| `nutrition_tracker_daily_entries` | `storage.ts` | `Record<date, DailyEntry>` |
| `nutrition_tracker_user_settings` | `storage.ts` | targets, theme, reminders, rest timer |
| `nutrition_tracker_custom_foods` | `storage.ts` | user-added foods |
| `nutrition_tracker_achievements` | `storage.ts` | award log |
| `trainright_body_stats` | `storage.ts` | body-stat entries |

## AI integration

**There is no AI integration in the running code.** The Coach engine (`coach.ts`) is rule-based. The footer text in `CoachWeekly` mentions *"your coach in Claude for the judgment work"* but this is descriptive — there is no API call, no prompt, no model invocation. Audit phases 10 (AI / Prompt) and Section 24 (AI-output validation) of the prompt therefore evaluate to **N/A**.

## Apple Health / HealthKit integration

**There is no Apple Health / HealthKit integration in this code base.** The README is explicit: *"Apple Health itself can't be read by a web app — Garmin Connect is the data source (your watch syncs there first anyway)."* The wearable adapter is **Garmin Connect** via `garmin_sync.py`. The audit prompt's HealthKit-specific questions are evaluated against the Garmin equivalent and clearly labelled in the requirements matrix.
