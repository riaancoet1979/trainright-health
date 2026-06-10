# Test Report

## Totals

| | Baseline | After remediation |
|---|---:|---:|
| Test files | 8 | 9 |
| Tests | 51 | **71** |
| Passing | 51 | 71 |
| Failing | 0 | 0 |
| Skipped | 0 | 0 |

## Existing tests retained

All 51 baseline tests still pass without modification.

| Spec | Tests |
|---|---:|
| `foodDatabase.spec.ts` | 11 |
| `fitness.spec.ts` | 5 |
| `training.spec.ts` | 15 |
| `storageFitness.spec.ts` | 2 |
| `health.spec.ts` | 8 |
| `coach.spec.ts` | 8 |
| `analytics.spec.ts` | 1 |
| `analytics.spec.tsx` | 1 |

## Tests added — `safetyRegression.spec.ts` (20)

| Block | Tests | Covers |
|---|---:|---|
| `H-02 acute symptom screen forces RED` | 6 | `hasActiveRedFlag`, `effectiveReadiness` — null safety, clinician override, every symptom field |
| `H-03 strict pull-up prerequisite` | 6 | program data tagging, missing-history denial, 1-session denial, 2-session approval, `applyPrerequisites` swap behavior, untouched exercises stay put |
| `M-01 stale Garmin sync detection` | 5 | `hoursSinceSync`, `isHealthDataStale`, `lastSyncLabel` — never synced, fresh, 47 h, 49 h, malformed timestamp |
| `M-05 coach progression off-by-one` | 2 | denial with 1 missing set, approval with all sets done |
| `L-04 bodyweight clamp` | 1 | engine round-trip preserves an in-range value |

## Commands run

```
npx vitest run --reporter=verbose
npx tsc -b
npx eslint .
npm run build
```

## Unresolved failures

None.

## Skipped tests

None.

## Coverage

Vitest is configured without a coverage reporter in `vitest.config.ts` (no `c8` / `v8` plugin in `package.json`). Coverage figures were not gathered for this pass to avoid adding a dependency. The safety-relevant code paths (`adjustForReadiness`, `applyPrerequisites`, `meetsPrerequisite`, `hasActiveRedFlag`, `effectiveReadiness`, `hoursSinceSync`, `isHealthDataStale`, Coach progression detection) all have explicit assertions in the test suite; visual inspection of the new spec confirms each branch is exercised.
