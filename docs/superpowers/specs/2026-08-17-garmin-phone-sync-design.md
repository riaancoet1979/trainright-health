# Garmin phone sync — design

**Date:** 2026-08-17
**Status:** Approved design, ready for implementation planning
**Depends on:** Phase A1 (Worker + D1, deployed) and Phase A2 (client sync, deployed)

---

## 1. Problem

`fa625b6` (2026-08-14) fixed a real privacy leak — Garmin data used to be baked into the public
GitHub Pages deploy — by making CI actively reject any build where it appears in the Pages
artifact. The side effect: `gh-sync.json` now only exists on whichever machine runs
`garmin_sync.py`, readable only by that machine's own `npm run dev`. The phone, where the app is
actually used day to day, has had no path to Garmin data since.

The problem is narrower than "zero Garmin data reaches the phone." `mergeGarminData` in
`src/utils/health.ts` already calls `captureAllDailyEntryChanges`, which diffs into the *existing*
`daily_steps` sync domain from Phase A2 — so the step count can already reach the phone, but only
if the PC's browser happens to be opened locally after a sync, which nothing makes automatic. Every
other Garmin metric (resting heart rate, HRV, sleep stages, body battery, stress, SpO2,
respiration) has never had a sync path of any kind.

## 2. Decision

Confirmed via AskUserQuestion on 2026-08-17: the PC keeps pulling from Garmin exactly as today
(`garminconnect`, the existing headless-with-saved-token flow, the `TrainRight Garmin Sync`
Task Scheduler entry at 06:30). `garmin_sync.py` gains one additional step: after writing
`gh-sync.json` as it always has, it **pushes** the day's metrics into the same Cloudflare Worker
the browser already syncs through.

Cloud-side pulling (a Worker fetching Garmin directly) was considered and rejected.
`garminconnect` is an unofficial, reverse-engineered library replicating Garmin's SSO/OAuth login
flow; there is no equivalent JS package, and porting that flow into a Worker is meaningfully more
work and a new thing that can break, for no benefit over reusing Python auth that already works,
is already scheduled, and was verified today with a real headless run (32 days, exit 0).

## 3. Architecture

```
garmin_sync.py (06:30, Task Scheduler)
  |
  |-- writes public/gh-sync.json           (unchanged, local-only, gitignored)
  |
  `-- shreds today's absorbed DayHealth
      records into garmin_daily mutations
      -> POST /v1/sync/push (chunked <=500)
              |
              v
        Cloudflare Worker + D1
              |
              v
   Phone / PC pull on their next sync
              |
              v
   apply.ts merges into health_metrics_v1
   (localStorage), keyed by date
              |
              v
   HealthDashboard.tsx — unchanged,
   reads getHealthMetrics() exactly as today
```

Nothing about the existing `daily_steps`/browser-absorption path changes — it keeps working
exactly as it does today, as a second, independent path that also happens to carry the step count.
`garmin_daily` is additive, not a replacement.

## 4. New domain: `garmin_daily`

One row per calendar date. Columns mirror `DayHealth` (`src/utils/health.ts:22-60`) directly —
same names, `toSnake`-converted, following the pattern every other domain already uses.

| DayHealth field | Column | Type |
|---|---|---|
| `source` | `source` | TEXT |
| `steps` | `steps` | REAL |
| `stepGoal` | `step_goal` | REAL |
| `distanceKm` | `distance_km` | REAL |
| `totalCalories` | `total_calories` | REAL |
| `activeCalories` | `active_calories` | REAL |
| `bmrCalories` | `bmr_calories` | REAL |
| `rhr` | `rhr` | REAL |
| `minHeartRate` | `min_heart_rate` | REAL |
| `maxHeartRate` | `max_heart_rate` | REAL |
| `hrv` | `hrv` | REAL |
| `hrvWeeklyAvg` | `hrv_weekly_avg` | REAL |
| `hrvStatus` | `hrv_status` | TEXT |
| `sleepHours` | `sleep_hours` | REAL |
| `sleepScore` | `sleep_score` | REAL |
| `deepSleepHours` | `deep_sleep_hours` | REAL |
| `lightSleepHours` | `light_sleep_hours` | REAL |
| `remSleepHours` | `rem_sleep_hours` | REAL |
| `awakeSleepHours` | `awake_sleep_hours` | REAL |
| `averageSleepStress` | `average_sleep_stress` | REAL |
| `averageStress` | `average_stress` | REAL |
| `stressQualifier` | `stress_qualifier` | TEXT |
| `bodyBatteryWake` | `body_battery_wake` | REAL |
| `bodyBatteryHigh` | `body_battery_high` | REAL |
| `bodyBatteryLow` | `body_battery_low` | REAL |
| `bodyBatteryLatest` | `body_battery_latest` | REAL |
| `bodyBatteryCharged` | `body_battery_charged` | REAL |
| `bodyBatteryDrained` | `body_battery_drained` | REAL |
| `averageSpo2` | `average_spo2` | REAL |
| `lowestSpo2` | `lowest_spo2` | REAL |
| `averageRespiration` | `average_respiration` | REAL |
| `moderateIntensityMinutes` | `moderate_intensity_minutes` | REAL |
| `vigorousIntensityMinutes` | `vigorous_intensity_minutes` | REAL |
| `floorsAscended` | `floors_ascended` | REAL |
| `sedentaryHours` | `sedentary_hours` | REAL |
| `activeHours` | `active_hours` | REAL |
| `garminDetails` | `garmin_details` | TEXT (JSON) |

Plus the standard envelope (`id`, `revision`, `updated_at`, `deleted_at`). `id` is the date
(`YYYY-MM-DD`) — same convention as `session_log`, `daily_steps`, `body_metric`. No separate
`date` field is needed in the payload: `daily_steps`/`session_log` carry a redundant `date` field
only because they're *shredded out* of app data where the date is an outer object key discovered
independently of the record; `garmin_daily` is apply-only and Python controls the field list
directly, so `apply.ts` uses `change.id` as the date when writing into
`HealthMetrics.days[change.id]` — the same pattern `body_metric` already uses.

## 5. Scope cut for v1

Explicitly **excluded**: `HealthMetrics.activities[]` (individual workouts) and
`HealthMetrics.bodyComposition.records[]` (Garmin's own scale readings, which overlap
conceptually with the existing InBody-driven `body_stat` domain). Day-level metrics are what
drive the app's actual features today — the readiness suggestion, the steps merge, the
HealthDashboard trend views. Activities and Garmin body composition can be a later addition if
ever needed; nothing in this design blocks adding them as further domains.

## 6. `garmin_daily` is apply-only

Unlike every other domain, the browser never originates `garmin_daily` mutations — only Python
does. This is deliberately asymmetric:

- `worker/src/domains.ts` registers it like any other domain (push/pull both work generically,
  the Worker doesn't know or care who writes).
- `src/sync/apply.ts` gains a case that merges a `garmin_daily` change into
  `HealthMetrics.days[date]` (the existing `health_metrics_v1` shape), so `HealthDashboard.tsx`
  needs **zero changes** — it keeps calling `getHealthMetrics()` exactly as today.
- `src/sync/shred.ts` does **not** gain a case for it. `health_metrics_v1` is not added to
  `STORE_KEYS`. The browser has no code path that could ever push a `garmin_daily` mutation,
  which is correct: the user never hand-edits their RHR.

## 7. Auth for the Python pusher

Python gets its own device, paired once via the same `/v1/auth/bootstrap` endpoint the browser
already uses, with `scope: 'ingest'` — already a valid value in the deployed Worker's scope enum
(`worker/src/auth.ts:56`), so **no Worker auth changes are needed for this.**

`garmin_sync.py` gains a `--bootstrap-sync` flag (mirroring the existing `--login` flag's shape):
prompts once for the bootstrap code, stores the returned token in a local, gitignored file
alongside `.garmin_tokens/` (never inside a directory served by the app). Every subsequent run
reads that token and pushes silently; if the token is missing, the push step is skipped with a
one-line log message rather than failing the whole sync — `gh-sync.json` must always be written
regardless of whether the phone-sync piece is configured, since local Garmin absorption is the
higher-priority, already-working path.

## 8. Batch cap, from day one

`POST /v1/sync/push` caps at 500 mutations per request (`worker/src/sync.ts`) — the exact limit
that quarantined a real upload once already this project (see the 2026-08-14 batch-cap incident).
Python chunks at 200 mutations per request from the first line of code that calls the endpoint,
matching the client engine's `PUSH_BATCH_SIZE`. A single day's `garmin_daily` push is one mutation
per day synced (up to `DAYS = 32` per run), so this is not likely to bite in practice — chunking
anyway costs nothing and removes the class of bug entirely rather than trusting today's volume to
stay low forever.

## 9. Idempotency

Mutation `id` = date, `updatedAt` = the sync run's timestamp. Re-running the daily sync naturally
produces a last-write-wins upsert via the server logic that already exists — no new dedup logic
required anywhere.

## 10. Error handling

- A push failure (network error, 5xx) is logged and the sync continues — `gh-sync.json` still
  gets written either way. The next day's run will push again; nothing is lost, since Python
  re-derives the full 32-day window from Garmin every run rather than tracking its own delta.
- A `rejected` result for an individual day (malformed field, unknown domain) is logged with its
  reason and skipped; it does not fail the whole run.
- No local retry/quarantine queue is needed on the Python side — unlike the browser's outbox,
  there is nothing here that must survive a process restart. The next scheduled run is the retry.

## 11. Testing

- `worker/test/domains.spec.ts`'s existing guard (every column must be registered) extends
  automatically once `garmin_daily` is added to both the migration and `SYNC_DOMAINS` — no new
  test needed there, it already fails the build if they drift.
- `worker/migrations/0002_garmin_daily.sql` gets the same schema test coverage as
  `0001_init.sql` (table exists, envelope present).
- `src/sync/apply.ts`'s new case gets a unit test: a `garmin_daily` change round-trips into
  `health_metrics_v1.days[date]` correctly, and — critically — is never re-enqueued (the same
  "never queues what it applies" test already written for every other domain in
  `src/__tests__/syncApply.spec.ts`).
- `tests/test_garmin_sync.py` (already exists, 11 tests, all passing) gets tests for the new push
  step: chunking behaviour at >500 records (using a shortened fake date range to keep it fast),
  and that a push failure does not prevent `gh-sync.json` from being written.
- No real Garmin or Cloudflare credentials in tests — the Python push tests mock the HTTP call,
  same as the existing suite already does for Garmin API calls.

## 12. Acceptance criteria

1. Running `garmin_sync.py` with a bootstrap token configured writes `gh-sync.json` locally *and*
   results in `garmin_daily` rows appearing in D1 for the synced date range.
2. With no bootstrap token configured, `garmin_sync.py` still writes `gh-sync.json` successfully
   and logs that the push step was skipped — never a hard failure.
3. Opening the app on the phone after a PC sync shows RHR/HRV/sleep/body battery for the synced
   days in HealthDashboard, with no changes needed to that component.
4. A `garmin_sync.py` run of the full 32-day window pushes without hitting the 500-mutation cap.
5. `npx vitest run` (worker + client), `npx tsc -b`, `npm run build`, and
   `python -m pytest tests/test_garmin_sync.py` all pass.

## 13. Out of scope

Individual Garmin activities/workouts, Garmin's own body-composition scale records, any change to
`HealthDashboard.tsx`'s rendering, any change to the existing `daily_steps`/browser-absorption
path, moving the Garmin pull into the cloud.
