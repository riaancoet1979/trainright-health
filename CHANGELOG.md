# Changelog

## 2026-10-01 — Last-session carry-over fix, arm & rear-delt volume

### Fixed — last week's numbers not carrying over
- Root cause: `getLastExerciseLog` only counted sets whose circle had been
  ticked. Weight and reps typed without ticking were saved and synced but never
  read back, so only an exercise that happened to be ticked (usually the first,
  to start the rest timer) showed up the following week.
- New `isSetLogged()` — a set counts when ticked OR when reps are filled in.
  Used by the last-session lookup, the prerequisite check and the Coach
  progression detector, so all three agree.
- Deload weeks (new `deload` flag on `ProgramPhase`, `isDeloadWeek()`) are
  skipped when a working week exists; returned only as a fallback.
- Train tab: last session's sets shown in bold with RIR and date, a
  **Fill from last** button per exercise (fills empty weight/reps only, never
  ticks, never copies RIR), and extra Block B/C sets fall back to the last
  logged set for their placeholder.

### Programme — arm and rear-delt additions
- Pull: + Incline Dumbbell Curl 2×10–15.
- Upper: + Bent-Over Rear-Delt Raise 3×15–25; Hammer Curl 2 → 3 sets.
- Weekly volume: biceps 5 → 8 direct (14 fractional, target 8–14); rear delts
  3 → 6 direct (10 fractional).

### Tests
- 7 new tests across `training.spec` and `trainSession.spec`; full suite green.

## 1.0.0 — 2026-06-10

### Phase 1 — Garmin auto-sync (Option A)
- GitHub Action runs `garmin_sync.py` daily at 04:30 UTC, writes `gh-sync.json` to Pages, app auto-absorbs on Train-tab mount
- Shared `GARMIN_FILE` constant + contract test in health.spec.ts
- StalenessBanner above every Train.tsx return path

### Phase 2 — Polish + Week 2 calibration
- Real PWA icons (192/512/maskable + 180 apple-touch) generated from script
- Toast/ConfirmProvider replaces all 16 native `alert()`/`confirm()` sites
- Day labels A/B/C/D (Lower+Core / Pull+Rehab / Push+Core / Hinge+Skills)
- New exercises: `hollow_rock`, `dead_hang_supported`, `cg_floor_press`, `dragon_flag`
- Cues updated with Week 1 assessment outcomes (16–20 kg goblet/row, 16 kg KB swing, scap pulls regressed to 2×5, +1 dip per session)
- `dead_hang_supported` and `dragon_flag` added to `mustBePainFree` test list

### Phase 3 — Data safety
- `src/utils/migrations.ts` schema-version meta blob + forward-only runner; runs at App boot
- `exportAllData` stamps `lastExportAt`; ProgramSettings shows an amber backup-nudge banner after 14 days or when never exported
- 12 new tests in `migrations.spec`

### Phase 5 — UX & performance
- Analytics tab now lazy-loads `react-chartjs-2`; central Chart.js registration; week-navigation bar charts (calories/protein/steps/pushups) with target lines + weekly averages
- Vite `manualChunks` splits react / chart.js / date-fns / lucide; `Analytics` and `BodyStats` lazy()-loaded → main bundle 387 kB → 344 kB raw (100 kB gzip)
- Fitness `DEFAULT_STEP_GOAL` → 5,000 with re-read tick on writes
- ProgramSettings import buttons use refs (iOS Safari label-click fix)
- `suggestions.ts` capped at `MAX_PORTION_G = 300 g`
- Bottom nav: `aria-current="page"` + per-button `aria-label` + 44 px touch targets; `<nav aria-label>` wrapper
- Train rest-day renders CoachDaily insights + next-session-preview card

### Rotation model
- `SessionLetter` A/B/C/D type + `DAY_KEY_TO_LETTER` / `LETTER_TO_DAY_KEY` round-trip maps
- `getNextRotationDayKey(beforeDate)` — picks the next session in A→B→C→D order from the most recent completed log
- `getSpacingGuards(date, plannedDayKey)` — warns on 3rd consecutive day, B↔C back-to-back, ≥4 sessions/7 days
- Dismissible Week 2 Coach-notes banner; DayPickerCard shows the rotation suggestion with an emerald "next" chip
- `EXERCISE_ID_ALIASES` lets `hollow_hold` history count toward `hollow_rock` progression

### Hygiene
- Removed remaining `any` types in `ErrorBoundary.tsx` (typed `React.ErrorInfo`) and `Analytics.tsx` (typed lazy Bar component)
- `foodValidation.printValidationReport` console output now dev-only
- `package.json` version → 1.0.0

## 0.x — earlier
- feat(fitness): Add Fitness analytics card with 7-day pushups and steps charts
- feat(fitness): Implement fitness utilities (`src/utils/fitness.ts`) for weekly metrics, streaks, and personal records
- feat(fitness): Add achievements support, export/reset helpers and UI (`src/components/Achievements.tsx`)
- feat(fitness): Add rest timer hook (`src/hooks/useRestTimer.ts`) and UI integration
- feat(fitness): Adaptive reminders and weekly summary notification scheduling in `usePushupReminders`
- test: Add unit tests for fitness utilities and storage helpers
- docs: Update README and `.github/copilot-instructions.md` with new features
