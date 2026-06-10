# Findings

Findings are ordered by severity. Each row maps to the affected requirement and includes the fix that was implemented in this pass (see audit/REMEDIATION_LOG.md for verification commands and audit/CHANGES.md for the full diff).

> Total open findings on baseline: **3 High · 7 Medium · 4 Low**. None Critical *as defined by the prompt's own rubric* (no auth bypass, no cross-user exposure — there are no users; no AI mutating protected state; no destructive nutrition).
>
> The single Critical-tier candidate was **H-01 (Garmin JSON deployed publicly)**. It is currently latent (the committed file is `{"days":[]}`), so I classify it **High** rather than Critical, and ship a fix in the same pass so it cannot escalate.

---

## H-01 — Garmin health JSON is committed to git and deployed to public GitHub Pages

| | |
|---|---|
| Severity | **HIGH** |
| Requirement | PRV-06, GA-08 |
| Files | `garmin_sync.py:28-32`, `public/garmin_health.json`, `.gitignore` |
| Evidence | `git ls-files public/garmin_health.json` returns the file. `garmin_sync.py` writes the sync output to **both** `public/` and `dist/`. `public/` is the deploy artifact for GitHub Pages. |
| Current content | `{"days":[]}` (empty) — so no PII has leaked yet |
| User impact | The next `python garmin_sync.py` + `git add public` + `git push` publishes 14 days of sleep duration, resting heart rate, HRV, and step counts to a publicly readable URL forever (commit history). |
| Root cause | The dual-write was added so both `npm run dev` (`public/`) and `npm run build` (`dist/`) could find the JSON. `public/` was the wrong choice — it ships to production. |
| Fix | (1) Stop writing the file to `public/` from the Python script (write only to `dist/` for prod and a new `public/.gitignored garmin_health.json` is no longer relied on). (2) Add `garmin_health.json` to `.gitignore` to defend against future re-introduction. (3) Replace the committed file with an empty `{"days":[]}` placeholder explicitly noted in the README. (4) `dist/` is already gitignored, so a single output target keeps deve + prod working. (5) Add comments explaining the constraint. The dev server serves files from `public/` and from the root, so we instead write to the project root **and** to `dist/`, and rely on Vite's `publicDir` fallthrough. |
| Confidence | High |
| Status | **FIXED** in this pass |

## H-02 — No red-flag symptom screening on the Train tab (only shoulder pain)

| | |
|---|---|
| Severity | **HIGH** |
| Requirement | S-02, R-03 |
| Files | `src/components/Train.tsx:168-219`, `src/utils/training.ts:115-144` |
| Evidence | The only acute-symptom input is the *shoulder pain* slider. The RED-day block (`Train.tsx:240-244`) mentions chest pain / dizziness / unusual breathlessness — **but only after the user has manually selected RED**. There is no prompt that asks the user whether they have any of these symptoms before they begin the workout. |
| User impact | A user with chest pain or dizziness who hasn't manually selected RED will be served a normal hard workout with no warning. |
| Root cause | Readiness assumes the user will self-classify accurately. There is no scripted screen. |
| Fix | Add a `RedFlagChecklist` component that always appears above the readiness pickers on the Train tab. It exposes four binary "happening today?" questions (chest pain or pressure, dizziness or fainting, unusual breathlessness, current fever/illness). If **any** answer is yes, the readiness is *forced* to RED, the value is persisted in the session log, the regular pickers are disabled with a clear message, and the user is directed to seek medical help — with a one-tap "I've checked with a clinician" override that, when used, still keeps RED selected. Persists in the existing `SessionLog` schema via a new optional `redFlags` field (backward compatible — undefined behaves like the old code). |
| Confidence | High |
| Status | **FIXED** in this pass |

## H-03 — Strict pull-up prescribed in Phase 4 regardless of hang-time prerequisite

| | |
|---|---|
| Severity | **HIGH** |
| Requirement | P-05, PR-02 |
| Files | `src/data/program.ts:166-167` (comment-only prerequisite), `src/data/program.ts:222-234` (`strict_pullup` exercise) |
| Evidence | PROGRAM.md and the program.ts inline comment both state: *"First strict pull-up attempt wk 9-10 IF hang ≥ 30 s pain-free"*. The Phase 4 day Tue lists `strict_pullup` unconditionally for weeks 12-16, and there is no programmatic gate. The `progression` text on `band_pullup` (Phase 3 wk 9-10) only describes the test — it doesn't block. |
| User impact | A user whose shoulder is not ready (no pain-free 30-second dead hang yet) will be guided into a strict pull-up cluster set, which is the most shoulder-loaded move in the program — exactly the situation the safety rule was written to prevent. |
| Root cause | The prerequisite is documentation; the code never reads the prior weeks' logged hang time. |
| Fix | Add a `prerequisite` field to `ProgramExercise` (`{ kind: 'min_hang_seconds', value: 30 }`). Add an `evaluatePrerequisites(exercises, logs, beforeDate)` helper in `training.ts` that, when a prerequisite is unmet, swaps the exercise's effective name for its regression and surfaces a banner explaining *why* (the most-recent logged hang time + the threshold). `adjustForReadiness` calls it in `adjustForReadiness` so all readiness paths see the same fallback. Existing exercises with no prerequisite behave identically. Add 4 regression tests. |
| Confidence | High |
| Status | **FIXED** in this pass |

## M-01 — Stale Garmin data is silently used as if it were fresh

| | |
|---|---|
| Severity | Medium |
| Requirement | R-05, UI-07, GA-05 |
| Files | `src/components/Train.tsx:172-183`, `src/utils/health.ts:32-67` |
| Evidence | `syncedAt` is stored in `health_metrics_v1.syncedAt` but never displayed. `suggestReadiness` checks "is there a day record" but doesn't check "was it produced recently". If the user hasn't run `garmin_sync.py` for a week, today's date won't have a record and the suggestion will silently be `null` — fine. But sleep data for *yesterday* (used by Coach insights) can still come from an old sync, with no staleness label. |
| Fix | Surface "Garmin last synced: <date>" in the readiness panel; if older than 48 h, show a yellow "Sync may be stale — run `garmin_sync.py`" notice. Coach's daily insight that uses sleep gains a *"sleep figure may be stale"* caveat when it relies on `last sync > 48 h`. Backward-compatible: behavior unchanged when sync is fresh. |
| Status | **FIXED** in this pass |

## M-02 — Cascading `setState` inside `useEffect` (4 occurrences)

| | |
|---|---|
| Severity | Medium |
| Files | `src/components/Settings.tsx:47-50`, `src/components/Train.tsx:43`, `src/components/FitnessAnalytics.tsx:78-80` (eslint already flags) |
| Evidence | `npx eslint .` baseline — 4 instances of `react-hooks/set-state-in-effect`. React 19's new rule. Can trigger extra renders or render loops in edge cases. |
| Fix | Derive the values rather than mirroring them in state (`useMemo` for derived; remove the effect entirely where the synchronisation isn't actually needed). For `Train.tsx` `bwInput`-reset-on-date-change, keep it but rekey the field with `key={dateKey}` so React re-mounts and the local state resets without a side-effect. |
| Status | **FIXED** in this pass |

## M-03 — Empty `catch {}` blocks swallow errors silently

| | |
|---|---|
| Severity | Medium |
| Files | `src/utils/storage.ts:177`, `src/components/Settings.tsx:43,67,84,334`, `src/hooks/usePushupReminders.ts:17,48,103,107,148,153,175,178` |
| Evidence | ESLint `no-empty` + `no-unused-vars` for `e`. |
| Fix | Where the error is genuinely ignorable (e.g., legacy Safari fall-back) leave the rationale in a single-line comment. Where it isn't (notification scheduler, settings dispatcher) at least log to `console.debug` so the failure isn't silent during dev. No behavioral change to happy paths. |
| Status | **FIXED** in this pass |

## M-04 — `any` types in storage / fitness analytics / pushup reminders

| | |
|---|---|
| Severity | Medium |
| Files | `src/utils/storage.ts:148`, `src/components/FitnessAnalytics.tsx:58`, `src/hooks/usePushupReminders.ts:102` |
| Fix | Replace `any` with the concrete `DailyEntry['fitness']` shape (storage), `BodyStatEntry` (fitness analytics), `ServiceWorkerRegistration` (pushup reminders). |
| Status | **FIXED** in this pass |

## M-05 — Coach exercise-progression check accepts one missing set

| | |
|---|---|
| Severity | Medium |
| Files | `src/utils/coach.ts:243-249` |
| Evidence | `sets.length >= ex.sets - 1` means a 4-set exercise progresses on 3 completed sets, despite the design rule "all sets at the top of the rep range". |
| Fix | Require `sets.length >= ex.sets`. The change is conservative — it cannot accidentally cause progression. Update / add coach test for this boundary. |
| Status | **FIXED** in this pass |

## M-06 — `ThemeContext` re-export breaks Fast Refresh

| | |
|---|---|
| Severity | Medium |
| Files | `src/contexts/ThemeContext.tsx:43` |
| Evidence | ESLint `react-refresh/only-export-components` — co-locating the `useTheme` hook with the provider component disables Fast Refresh for any consumer. |
| Fix | Move `useTheme` to `src/contexts/useTheme.ts`; provider stays in `ThemeContext.tsx`. Existing imports updated. Behaviour identical. |
| Status | **FIXED** in this pass |

## M-07 — `garmin_sync.py` print noise can leak data when piped to logs

| | |
|---|---|
| Severity | Medium (Privacy) |
| Files | `garmin_sync.py:96` |
| Evidence | Each day's metric dict is `print()`ed by date (e.g. `2026-06-06: {'steps': 7421, 'rhr': 58, 'sleepHours': 6.8}`). If the user redirects stdout to a log file in `git`-tracked location (or a CI runner), the data lands there. |
| Fix | Default to a single per-day count summary; emit raw metrics only when `--verbose` is passed. Backward-compatible (still works without flag). |
| Status | **FIXED** in this pass |

## L-01 — README still claims React 18; project is on React 19

| Severity | Low |
| Files | `README.md:101` |
| Fix | Bump claim to React 19 + Vite 7. |
| Status | **FIXED** in this pass |

## L-02 — Untracked `push_*.bat` / `fix_ci.bat` helper scripts clutter the repo root

| Severity | Low |
| Files | Untracked: `fix_ci.bat`, `push_fixes.bat`, `push_import_fix.bat`, `push_manifest_fix.bat`, `push_pwa_fix.bat` |
| Fix | Per non-regression rule, these are pre-existing user scripts and NOT deleted. Add a `*.local.bat` pattern to `.gitignore` so the user can park future ones without polluting `git status`. The existing files remain untracked. |
| Status | **DOCUMENTED** (no fix applied — user files preserved) |

## L-03 — `getCurrentMealType` uses local time but no time-zone label

| Severity | Low |
| Files | `src/utils/suggestions.ts:29-36` |
| Fix | Documented in comment; behavior intentional for single-user device. |
| Status | **ACCEPTED RISK** |

## L-04 — Bodyweight input does not enforce sane upper bound

| Severity | Low |
| Files | `src/components/Train.tsx:357-365` |
| Evidence | Accepts any `parseFloat(...) > 0`. Typo entering `810` instead of `81.0` would log nonsense and skew weekly trend. |
| Fix | Clamp to (20, 300) kg; show a warning otherwise. |
| Status | **FIXED** in this pass |
