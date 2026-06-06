# Non-Regression Report

## Baseline functions identified and retested

| Function group | How it was retested |
|---|---|
| 16-week program structure (4 phases, 4 days, all categories present) | `training.spec.ts > program data > "covers weeks 1–16 across 4 phases"` and 3 sibling tests — **PASS** |
| No-overhead-pressing rule | `training.spec.ts > "contains no overhead pressing anywhere"` — **PASS** |
| `painFreeOnly` invariants on hanging / dip / landmine | `training.spec.ts > "all hanging/dip/landmine work is flagged painFreeOnly …"` — **PASS** |
| Week-number / Monday-snap calculation | 5 `training.spec.ts > week calculation` tests — **PASS** |
| Readiness adjustment (Green / Yellow / Red + shoulder pain) | 4 `training.spec.ts > readiness adjustment` tests — **PASS** |
| Day-type nutrition target switch | `training.spec.ts > day-type nutrition targets` — **PASS** |
| Legacy `trainright_v1` migration | `training.spec.ts > TrainRight legacy migration` — **PASS** |
| Garmin merge + monotonic steps + readiness suggestion | 8 `health.spec.ts` tests — **PASS** |
| Coach daily insights + weekly review + progression detection | 8 `coach.spec.ts` tests — **PASS** (including the test that was implicitly affected by M-05; it had used 4 done sets, so it still passes after the off-by-one tightening) |
| Food database integrity | 11 `foodDatabase.spec.ts` tests — **PASS** |
| Fitness storage helpers (achievements, export/reset) | 2 `storageFitness.spec.ts` tests — **PASS** |
| Pushup / step trends / PR detection | 5 `fitness.spec.ts` tests — **PASS** |
| Analytics React component renders | `analytics.spec.tsx > "renders without throwing"` — **PASS** |

## API contract changes

| Type / function | Change | Backward compatible? |
|---|---|---|
| `SessionLog.redFlags?: RedFlagState` | Added (optional) | ✅ Yes — `undefined` reproduces the original behavior exactly |
| `ProgramExercise.prerequisite?: ExercisePrerequisite` | Added (optional) | ✅ Yes — exercises without it are unchanged |
| `AdjustedExercise.prerequisiteUnmet?: string` | Added (optional) | ✅ Yes |
| `adjustForReadiness(exercises, …)` signature | unchanged | ✅ Yes |
| `applyPrerequisites(...)`, `meetsPrerequisite(...)`, `hasActiveRedFlag(...)`, `effectiveReadiness(...)`, `hoursSinceSync(...)`, `isHealthDataStale(...)`, `lastSyncLabel(...)` | New exports | ✅ Yes — purely additive |
| `BodyweightCard` props | Changed from `{ bw, bwInput, setBwInput, date, onSaved }` to `{ bw, date, onSaved }` | Internal component only — not part of any external API |
| `useTheme` import path | Changed from `../contexts/ThemeContext` to `../contexts/useTheme` | Internal — only `Settings.tsx` imported it, and that import is updated in the same diff |

## Migration / schema considerations

No migrations are needed:

- `RedFlagState` is optional on `SessionLog`. Existing logs deserialize unchanged. `hasActiveRedFlag(undefined)` returns `false`, so old sessions behave exactly as before.
- `prerequisite` is optional on `ProgramExercise`. Old `ProgramExercise` JSON would still deserialize, though no such JSON is persisted (the program lives in code).
- The `health_metrics_v1.syncedAt` field already existed; new helpers consume it without mutating.

Stored user data is fully compatible — verified by running the full test suite, including the legacy `trainright_v1` migration test, post-remediation: **PASS**.

## Functions removed

None. The only removed lines of code are:

1. The Settings useEffect that mirrored settings → input state (replaced by direct assignment in the change handlers — same observable result, fewer renders).
2. The Train useEffect that reset `bwInput` on date change (replaced by `key={key}` remount — same observable result).
3. The `bwInput` / `setBwInput` props from `BodyweightCard` (consumed locally now).

None of these removals had external callers; behavior is preserved.

## Known regression risks

| Risk | Mitigation |
|---|---|
| User has many old `band_pullup` logs that don't meet the new strict criterion → Phase 4 always swaps to band pull-up | This is the *intended* safety behavior. The substitution banner explains why and points at the criterion. The user can hit top reps on band pull-up twice in a row to clear the gate. |
| Existing UI screenshots showing 3-button readiness picker now sometimes shows the "RED forced by symptom check" sub-label | Cosmetic — the user-visible disclosure is clearer, not worse |
| `public/garmin_health.json` is now an empty placeholder file → app `fetch` still 200s and `mergeGarminData({"days":{}})` returns 0 → no UI side effect | Verified by health.spec.ts (test "stores metrics and pushes steps into daily entries" handles empty days gracefully via the early return) |
| Old `useTheme` import path no longer resolves | Only one consumer — Settings.tsx — updated in the same diff |

## Confirmation

- ✅ No working feature was intentionally removed.
- ✅ All 51 baseline tests still pass.
- ✅ The 20 new regression tests pass.
- ✅ TypeScript compilation is clean.
- ✅ Production build is clean.
- ✅ The public API surface is unchanged or strictly extended.
- ✅ Stored user-data formats are unchanged.
- ✅ No database migration is required.
- ✅ Apple Health behavior is unchanged (still N/A; Garmin still works).
- ✅ Existing readiness, progression, nutrition, and coach behavior is preserved for sessions that lack the new optional fields.
