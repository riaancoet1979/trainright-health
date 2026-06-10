# Apple Health / Wearable Validation

> **Native Apple HealthKit is not used by this app.** The README is explicit, the deploy target is a PWA, and there is no Swift / Capacitor / Cordova bridge in the repo. The audit-prompt section on HealthKit is therefore evaluated against the **Garmin Connect** equivalent, which is what the app actually integrates with.

## Garmin Connect adapter

| Concern | Evidence |
|---|---|
| Authentication | `garmin_sync.py` uses `garminconnect` Python SDK; supports MFA; tokens cached in `.garmin_tokens/` (gitignored) |
| Read-only | Only `get_user_summary`, `get_sleep_data`, `get_hrv_data` are called — no write APIs |
| Least-privilege | Pulls only steps, RHR, sleep seconds, HRV — minimum needed for the readiness engine |
| Failure handling | `safe()` wrapper turns any per-day API failure into `{}` and the day is skipped, not faked |
| Idempotency | `mergeGarminData` upserts per-date; running the sync twice produces no duplicates |
| Time-zone | Garmin Connect already buckets by the watch's local day. The app keys days `YYYY-MM-DD` and never re-buckets — acceptable. Documented limitation: if user changes time-zone mid-day, the affected day may merge two devices' partial counts. |
| Unit conversion | Sleep seconds → hours via `/3600`, integer truncation for HR / HRV / steps — verified |
| Step monotonic merge | App never lowers logged steps: `if (day.steps > entry.fitness.steps.steps)` — verified by `__tests__/health.spec.ts > "never lowers manually-logged steps"` |
| False claims of connection | UI labels suggestion as `"Garmin suggests …"` and shows nothing when no data is present — verified at `Train.tsx:172-183` |
| Privacy of synced output | **High-severity finding H-01** — output file was committed and deployed publicly. **Fixed in this pass.** |
| Stale-data labelling | New in this pass — readiness card surfaces "last synced X h ago" and warns when > 48 h |

## Mock / fixture coverage

`__tests__/health.spec.ts` already covers:

| Scenario | Test |
|---|---|
| No data → null suggestion | "returns null with no data" |
| Normal sleep + RHR → green | "suggests green when sleep and RHR are normal" |
| <6 h sleep → yellow | "suggests yellow on short sleep" |
| +5 RHR vs baseline → yellow | "suggests yellow on elevated RHR" |
| <5 h sleep or +10 RHR → red | "suggests red on very short sleep or big RHR spike" |
| Not enough baseline samples → RHR rule disabled | "ignores RHR rule without enough baseline days" |
| Steps monotonicity | "never lowers manually-logged steps" |
| Garmin merge stores all 4 metrics | "stores metrics and pushes steps into daily entries" |

Added in this pass (`audit/regression/healthStaleness.spec.ts`):

- Suggestion is not produced for a date with no data record (covered by existing test but added as documentation).
- New helper `isHealthDataStale()` returns true when `syncedAt` is null or older than 48 h.
- New helper `staleMessage(syncedAt)` produces a human-readable hours-since label.

## Native iOS HealthKit verification

**BLOCKED — not applicable.** This is a web app. The audit prompt's HealthKit-specific assertions cannot be made; the README states the constraint up-front. No fake "we read HealthKit" claim is made anywhere in the code or UI.

## Conclusion

The Garmin adapter is sound. The privacy hole was the deploy artifact, not the integration. The stale-data UX gap is closed. There are no false claims of integration the user-facing surface couldn't back up.
