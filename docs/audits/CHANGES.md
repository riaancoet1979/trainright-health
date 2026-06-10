# Changes

## Files created

| Path | Purpose |
|---|---|
| `audit/EXECUTIVE_SUMMARY.md` | Top-level audit decision + status |
| `audit/ARCHITECTURE.md` | System map and data flow |
| `audit/REQUIREMENTS_MATRIX.md` | Prompt requirements → code with status |
| `audit/FINDINGS.md` | All findings with evidence and fix plan |
| `audit/SECURITY_PRIVACY.md` | Threat model + privacy audit |
| `audit/FITNESS_SAFETY.md` | Exercise / red-flag safety audit |
| `audit/NUTRITION_VALIDATION.md` | Macro / kcal reconciliation |
| `audit/APPLE_HEALTH_VALIDATION.md` | Garmin equivalence audit |
| `audit/COMMAND_LOG.md` | Every command run, with results |
| `audit/REMEDIATION_LOG.md` | Per-finding fix log |
| `audit/REMEDIATION_PLAN.md` | Prioritised remaining work |
| `audit/NON_REGRESSION_REPORT.md` | Confirmation that existing behavior is preserved |
| `audit/CHANGES.md` | This file |
| `audit/TEST_REPORT.md` | Test totals + new coverage |
| `audit/MANUAL_TEST_CHECKLIST.md` | Reusable release checklist |
| `audit/FINAL_VERIFICATION.md` | Final results + decision |
| `src/components/RedFlagChecklist.tsx` | New acute-symptom UI screen (H-02) |
| `src/contexts/useTheme.ts` | Theme hook split from provider (M-06) |
| `src/__tests__/safetyRegression.spec.ts` | 20 new regression tests |

## Files modified

| Path | What changed |
|---|---|
| `.gitignore` | Added `public/garmin_health.json`, `/garmin_health.json`, `/*.local.bat` |
| `garmin_sync.py` | Docstring expanded; default to non-verbose log; `--verbose` flag added |
| `public/garmin_health.json` | Reset to `{"source":"placeholder","syncedAt":null,"days":{}}` |
| `README.md` | React 18 → React 19 |
| `src/types/training.ts` | Added `ExercisePrerequisite`, `RedFlagState`, optional `prerequisite` on `ProgramExercise`, optional `redFlags` on `SessionLog` |
| `src/data/program.ts` | Tagged `strict_pullup` with its `band_pullup` prerequisite |
| `src/utils/training.ts` | Added `hasActiveRedFlag`, `effectiveReadiness`, `meetsPrerequisite`, `applyPrerequisites`, helper `findExerciseInProgram` |
| `src/utils/health.ts` | Added `hoursSinceSync`, `isHealthDataStale`, `lastSyncLabel` |
| `src/utils/coach.ts` | Tightened progression rule from `>= ex.sets - 1` to `>= ex.sets` (M-05) |
| `src/contexts/ThemeContext.tsx` | Hook split out to `useTheme.ts`; context now exported for the hook file |
| `src/components/Settings.tsx` | Removed setState-in-effect mirror; updated `useTheme` import |
| `src/components/Train.tsx` | Renders `RedFlagChecklist`; applies prerequisites; shows stale-sync label; disables picker when symptoms force RED; explains exercise substitution; bodyweight clamp (20–300 kg); `BodyweightCard` is re-keyed instead of effect-reset |

## Files deleted

None.

## Files renamed

None.

## User-visible changes

| Screen | Before | After |
|---|---|---|
| Train tab | Shoulder slider was the only acute-symptom input | New "Safety check — anything happening today?" card with 4 binary symptom checkboxes always visible above the readiness picker |
| Train tab readiness banner | "Garmin suggests …" or hidden | Same, plus "Last sync: X h ago" stamp and a yellow "may be stale" notice when > 48 h since last sync |
| Train tab readiness picker | All three buttons enabled regardless of symptoms | When a symptom is checked, Green/Yellow are disabled and a "(forced by symptom check)" sub-label appears |
| Train tab strict pull-up (Phase 4 Tue, weeks 12–16) | Always shown as Strict Pull-Up Clusters | Substituted with Band Pull-Up + an amber banner explaining the prerequisite when the user has not hit the top of the band-pullup rep range in the previous 2 sessions |
| Bodyweight log | Accepted any positive number | Rejects values outside 20–300 kg with an inline warning |
| Settings → Daily Targets | Same behaviour | Same behaviour, one fewer render per change |

## Internal changes

- New engine helpers for symptom screening and prerequisite evaluation are pure functions; they read from existing localStorage and program data.
- The Coach progression criterion is now exactly "all prescribed sets at top of range".
- The Theme hook lives in its own file so Vite Fast Refresh works correctly.

## Configuration changes

- `.gitignore` extended (see above).
- No package.json change.
- No env-var change.

## Migration changes

None.

## Dependency changes

None.

## Breaking changes

None.

## Upgrade instructions

For an existing user pulling this branch:

1. `npm install` (no new packages, just safe).
2. If you previously had `public/garmin_health.json` checked in, `git pull` will keep the placeholder file. The next `python garmin_sync.py` run will overwrite it locally with your fresh data and the gitignore rule will keep it out of git.
3. Old session logs without a `redFlags` field will work exactly as before — the screen treats "not asked" the same way it always did (no symptoms recorded). The first time you open Train on a date, take 5 seconds to answer the new checklist.
4. If your shoulder still won't pass a pain-free 30-second dead hang in band-pullup form, expect Phase 4 Tue to substitute the strict pull-up for band pull-up until two consecutive band-pullup sessions hit the top of the rep range.
