# Remediation Plan

## Immediate release blockers — DONE in this pass

| ID | Title | Effort | Status |
|---|---|---|---|
| H-01 | `garmin_sync.py` JSON committed to public repo | Small | ✅ Fixed |
| H-02 | Red-flag screen missing for chest pain / dizziness / illness | Medium | ✅ Fixed |
| H-03 | Strict pull-up prerequisite not enforced | Medium | ✅ Fixed |

## Fix before beta (these went in too)

| ID | Title | Effort | Status |
|---|---|---|---|
| M-01 | Stale-sync UX | Small | ✅ Fixed |
| M-02 (Settings, Train) | setState-in-effect | Small | ✅ Fixed |
| M-05 | Coach off-by-one in progression check | Small | ✅ Fixed |
| M-06 | Fast Refresh broken by `useTheme` | Small | ✅ Fixed |
| M-07 | `garmin_sync.py` verbose by default | Small | ✅ Fixed |
| L-04 | Bodyweight clamp | Small | ✅ Fixed |
| L-01 | README version | Small | ✅ Fixed |

## Fix before general release (deferred to a focused follow-up pass)

| ID | Title | Effort | Status |
|---|---|---|---|
| M-02 (FitnessAnalytics) | Last setState-in-effect | Small | Deferred — needs a useMemo refactor in the chart-data prep |
| M-03 | Empty `catch {}` blocks | Medium | Deferred — touches 7 files; non-behavioural |
| M-04 | `any` types in storage / hooks / fitness analytics | Small | Deferred — purely type-safety hygiene |

These are intentionally batched into a separate "linter cleanup" PR because:

1. None of them change runtime behaviour.
2. They span more files than safety-critical findings and would dilute the audit diff.
3. The current 45 ESLint errors do not block `npm run build`.

## Post-release improvements

| Topic | Notes |
|---|---|
| `vitest --coverage` | Add `@vitest/coverage-v8` and a `coverage` script; target ≥ 80 % on `utils/` |
| Service worker testing | Add a smoke test that verifies `precache` size is non-zero |
| HRV / RHR baseline window configurable | Currently hard-coded to 14 days; expose in Settings |
| Multi-device localStorage backup encryption | Optional — adds genuine effort if shifting to multi-device |
| README → onboarding page | Replace text-only setup section with a guided in-app onboarding |
| Time-zone change handling | Document and add a small day-boundary test |

## Effort sizing legend

- **Small** ≤ 1 hour of focused work
- **Medium** half a day
- **Large** more than a day or multiple modules
