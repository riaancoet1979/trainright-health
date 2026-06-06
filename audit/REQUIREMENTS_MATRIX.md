# Requirements Traceability Matrix

Each row from the audit prompt is mapped to the actual code, given a status, and tied to any FINDINGS that arose. Where a requirement does not apply to a single-user PWA, **N/A** is set with a reason; the prompt expressly accepts N/A as a status.

Statuses: ✅ Fully · 🟡 Partial · 🟦 Implemented-but-unverified · 🛑 Broken · ❌ Missing · ⚠️ Misleading · ⬜ N/A.

## Onboarding

| ID | Requirement | Code | Status | Evidence / Finding |
|---|---|---|---|---|
| ON-01 | Account creation, login, multi-user onboarding | none — single-user PWA, no auth | ⬜ N/A | README & architecture; out of scope for single-user PWA |
| ON-02 | Collect age, height, weight, sex, activity level | hard-coded in `PROGRAM.md` for one user; only `bodyMetric.weight` is stored | 🟡 Partial | Targets are pre-baked, not derived from inputs — `data/program.ts:34` |
| ON-03 | Equipment / availability / goals | hard-coded in `program.ts`; user picks **start date** only | 🟡 Partial | `Train.tsx:46-72` |
| ON-04 | Onboarding pause/resume | trivially true: start-date input persists in localStorage | ✅ Fully | `getTrainingData()` |
| ON-05 | Missing-field validation on essential inputs | bodyweight/macro-target inputs reject NaN, negative, >9999 | ✅ Fully | `Train.tsx:359`, `Settings.tsx:141-167` |
| ON-06 | Save / resume | localStorage round-trip every change | ✅ Fully | `__tests__/storageFitness.spec.ts` |

## Week 1 baseline assessment

| ID | Requirement | Code | Status |
|---|---|---|---|
| W1-01 | Week 1 = submaximal assessment | Phase 1 explicitly labelled `Assessment`, every set has `rir: '2-3'`/`AMRAP-2` | ✅ Fully — `program.ts:67-110` |
| W1-02 | Record per-set weight/reps + notes | `Train.tsx:282-303`, `notes` textarea line 323 | ✅ Fully |
| W1-03 | Mobility screen present | `mobility_screen` exercise on Saturday | ✅ Fully — `program.ts:106` |

## 16-week program / phases

| ID | Requirement | Status | Notes |
|---|---|---|---|
| P-01 | 4 phases × 16 weeks | ✅ Fully | `__tests__/training.spec.ts` already asserts this. Tests verified passing. |
| P-02 | Push / Pull / Legs / Core / Skills / Mobility coverage | ✅ Fully | All categories present in every phase |
| P-03 | Week 16 deload + retest | ✅ Fully | `wk16_retest` exercise injected, comment + cue explain |
| P-04 | Continuation after week 16 | 🟡 Partial | `Train.tsx:153` shows `(program complete — repeat Phase 4)` but doesn't introduce a *new* maintenance phase |
| P-05 | Strict pull-up prerequisite (≥30 s pain-free hang) | 🛑 **Broken** | **Finding H-03** — text in program comments + `progression` field is not enforced; `strict_pullup` appears unconditionally Wk 12+ |

## Progression engine

| ID | Requirement | Code | Status |
|---|---|---|---|
| PR-01 | Double-progression rule (reps → load) | encoded in `progression` strings + Coach detection | ✅ Fully (advisory) — `coach.ts:228-260` |
| PR-02 | Recovery / pain gating | `painFreeOnly` filter + Yellow set-reduction + Red skip | ✅ Fully — `training.ts:115-144`, tests `training.spec.ts` |
| PR-03 | Stall detection / deload trigger | weekly review flags 2+ Yellow/Red days → "hold all progressions" | ✅ Fully — `coach.ts:207` |
| PR-04 | Partial-sets shouldn't progress an exercise | `sets.length >= ex.sets - 1` accepts 1 missing set | 🟡 Partial — see Finding M-05 |
| PR-05 | Missed sessions handled | week tally + "consistency before progression" insight | ✅ Fully — `coach.ts:201` |

## Readiness engine

| ID | Requirement | Code | Status |
|---|---|---|---|
| R-01 | Green/Yellow/Red classification | sleep + RHR-vs-14d-median | ✅ Fully — `health.ts:121-128`, six dedicated tests pass |
| R-02 | Trend-based, not single value | RHR ≥ +5/+10 vs *median* of last 14 days; requires ≥5 baseline samples | ✅ Fully — `health.ts:108-116` |
| R-03 | User symptoms can override wearable | shoulder slider drives `painFreeOnly` skip + RED is user-choosable | 🟡 Partial — only shoulder pain is asked. **Finding H-02**: no chest-pain/dizziness/illness intake. |
| R-04 | Missing-data handling | `suggestReadiness` returns `null` when no data; UI omits the suggestion strip | ✅ Fully — `health.ts:106`, `Train.tsx:172-183` |
| R-05 | Stale wearable data detection | `syncedAt` is stored but not surfaced or guarded against | 🟡 Partial — **Finding M-01** |

## Garmin / wearable integration (Apple Health adapted)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| GA-01 | Authorization & least-privilege | ✅ Fully | Interactive OAuth-style login in `garmin_sync.py`; token stored in `.garmin_tokens/` (gitignored) |
| GA-02 | Read-only | ✅ Fully | `garmin_sync.py` only calls `get_user_summary`/`get_sleep_data`/`get_hrv_data` |
| GA-03 | Permission-denied / failure handling | ✅ Fully | `safe(fn, default=None)` wrapper, `fetchGarminFile` returns null on 4xx/5xx |
| GA-04 | Unit conversion | ✅ Fully | seconds→hours sleep (`/3600`), int truncation for HR/HRV/steps |
| GA-05 | Time-zone / midnight boundary | 🟡 Partial | Uses Garmin's per-day summary keyed `YYYY-MM-DD` → relies on Garmin's local-time bucketing. Acceptable but undocumented. |
| GA-06 | Duplicate prevention | ✅ Fully | Merge is idempotent: spread `{...m.days[ds], ...day}` replaces same-day metrics, steps only updated if higher than logged value (`health.ts:58`) |
| GA-07 | False "Apple Health connected" claims | ✅ Fully | UI says `"Garmin suggests …"` only, README is explicit. |
| GA-08 | Privacy of synced data | 🛑 **Critical** | **Finding H-01** — sync writes to `public/garmin_health.json`, deployed to public GitHub Pages |
| GA-09 | Apple HealthKit native | ⬜ N/A | Web app — see ARCHITECTURE.md |

## Nutrition engine

| ID | Requirement | Code | Status |
|---|---|---|---|
| N-01 | Calorie / macro calculation | targets hard-coded for this single user; `getTargetsForDate` switches training/rest | ✅ Fully *as designed* — N/A for "BMR formula audit" |
| N-02 | Day-type adjustment | `isTrainingDay(date)` selects training vs rest target | ✅ Fully — covered by `training.spec.ts` |
| N-03 | Independent recalculation of targets | DEFAULT_DAY_TYPE_TARGETS table matches PROGRAM.md ±0; lean-gain alt table matches | ✅ Fully — `data/program.ts:33-42` |
| N-04 | Allergen / dietary preference filter | not implemented | ❌ Missing | User-controlled — N/A for single-user "omnivore" deployment; documented |
| N-05 | Under-18 guardrails | not implemented | ⬜ N/A | App user is 46; documented |
| N-06 | Unsafe deficit prevention | weekly review flags weight loss > 0.8 kg/wk → "add ~150 kcal/day" | ✅ Fully — `coach.ts:218` |
| N-07 | "Don't eat back exercise calories" | targets are fixed per day type; exercise calories shown but never auto-added to target | ✅ Fully (by construction) |
| N-08 | Food-database sanity | `foodValidation.ts` cross-checks macros vs kcal (4×4×9) with tolerance | ✅ Fully — `foodDatabase.spec.ts` 11 tests passing |
| N-09 | Macro / kcal range validation on user-added foods | 0–9999 kcal, 0–999.9 g macros, name 3–100 chars, dup-name detect | ✅ Fully — `Settings.tsx:127-167` |

## Safety / red-flag handling

| ID | Requirement | Code | Status |
|---|---|---|---|
| S-01 | Shoulder-pain gating | slider drives `painFreeOnly` skip; UI banner reminds physio referral | ✅ Fully |
| S-02 | Chest pain / dizziness / fainting screening | message inside the RED-day block tells user to seek medical help, **only if they manually picked RED** | 🟡 Partial — **Finding H-02** |
| S-03 | "Don't train through it" warning | UI line 211 "If this persists, see a physio" | ✅ Fully |
| S-04 | Repeated max-test prevention | program never assigns more than `AMRAP-2` even in Week 1 | ✅ Fully |
| S-05 | Excessive failure training prevention | every set has RIR (≥1) | ✅ Fully |
| S-06 | Dangerous-equipment prevention | only off-the-shelf equipment listed | ✅ Fully |
| S-07 | Medical disclaimer placement | RED banner contains the strongest disclaimer; PROGRAM.md has one | 🟡 Partial — no global disclaimer in onboarding |
| S-08 | Scope-of-practice referrals | "see a physio" appears with shoulder pain, "get medical help, not a workout" appears on RED | ✅ Fully |
| S-09 | Under-18 safeguards | ⬜ N/A — single-user 46 yo |

## Privacy / security

| ID | Requirement | Status | Notes |
|---|---|---|---|
| PRV-01 | Authentication | ⬜ N/A | No backend, no user accounts |
| PRV-02 | Authorization | ⬜ N/A | Same |
| PRV-03 | Multi-user isolation | ⬜ N/A | Browser-local |
| PRV-04 | Secrets management | ✅ Fully | No secrets in repo; Garmin password prompted interactively |
| PRV-05 | Health-data storage | ✅ Fully (local) | All metrics in `localStorage`; never POSTed anywhere |
| PRV-06 | Health-data transmission | 🛑 **Critical** | **Finding H-01** — `public/garmin_health.json` is committed → published to GitHub Pages → publicly readable. Currently empty but the next `git add` after `python garmin_sync.py` leaks 14 days of sleep/HR/HRV/steps. |
| PRV-07 | Account / data deletion | ✅ Fully | `Settings.tsx:376` (Reset Fitness Data), full backup → import = round-trip restore |
| PRV-08 | Consent UX | ⬜ N/A | Single-user, no third-party data flow |
| PRV-09 | Logging leakage | ✅ Fully | No telemetry, no analytics calls |
| PRV-10 | Input validation | ✅ Fully | Custom food form validated; readiness inputs constrained; weight `parseFloat` guarded |
| PRV-11 | XSS surfaces | ✅ Fully | No `dangerouslySetInnerHTML`; all user input rendered as text |
| PRV-12 | Secure local storage | 🟡 Partial | localStorage is plain-text (browser-OS protected). No encryption-at-rest. Acceptable for single-user health journal; documented. |
| PRV-13 | Third-party AI data sharing | ⬜ N/A | No AI integration |

## Data integrity / persistence

| ID | Requirement | Status | Notes |
|---|---|---|---|
| DI-01 | Migrations safe | ✅ Fully | Schema is additive (`bodyMetrics: []` default, day-type targets falls back to default) |
| DI-02 | Duplicate / concurrent updates | 🟡 Partial | Two tabs editing the same date would last-writer-wins. Acceptable for single-user device. |
| DI-03 | Import / export round-trip | ✅ Fully | `exportAllData` + `importAllData` cover all 6 keys; legacy `trainright_v1` migration also covered |
| DI-04 | Legacy compatibility | ✅ Fully | `importTrainRightBackup` tested; covers empty phantoms |
| DI-05 | Body-stat dual write | ✅ Fully | Recent commit `f6c4ecb` keeps `trainright_body_stats` + `bodyMetrics` in sync |

## UI / accessibility

| ID | Requirement | Status | Notes |
|---|---|---|---|
| UI-01 | Doesn't claim "saved" before persistence | every saver writes synchronously to localStorage before re-render | ✅ Fully |
| UI-02 | Doesn't claim Garmin sync OK when it failed | `mergeGarminData` returns 0 on empty / `fetchGarminFile` returns null | ✅ Fully |
| UI-03 | aria-labels on icon-only buttons | `aria-label="toggle set done"`, `"previous week"`, `"next week"` | 🟡 Partial — body-stat delete/edit, calendar arrows still icon-only |
| UI-04 | Keyboard navigation | all inputs are native, focus order is DOM order | ✅ Fully |
| UI-05 | Color contrast in dark mode | Tailwind palette, dark variant on every text color | ✅ Fully (eye-balled) |
| UI-06 | Empty / offline states | rest-day card, no-program card, no-data Garmin card | ✅ Fully |
| UI-07 | Stale-data label on health metrics | `syncedAt` never displayed | 🟡 Partial — **Finding M-01** |

## Build / infrastructure

| ID | Requirement | Status | Notes |
|---|---|---|---|
| BI-01 | Project builds | ✅ Fully | `npm run build` passes in 5.24 s |
| BI-02 | Tests pass | ✅ Fully | 51/51 |
| BI-03 | Lint clean | 🛑 **Broken** | 47 errors — see Findings M-02..M-04 |
| BI-04 | Type check clean | ✅ Fully | `tsc -b` clean |
| BI-05 | CI builds + deploys | ✅ Fully | `.github/workflows/deploy.yml` runs on `main` push |
| BI-06 | Dependency freshness | 🟡 Partial | `browserslist-db` is 6 months old (cosmetic warn); React 19, Vite 7 are current |

## Phases of the prompt evaluated to N/A

The following audit phases are inapplicable because the system is intentionally a single-user, browser-only PWA without an LLM, a backend, or HealthKit:

- **Phase 10 — AI / Prompt audit** — no AI integration
- **Phase 6 — HealthKit native** — replaced by Garmin equivalence; native iOS HealthKit explicitly disclaimed in README
- **Multi-user isolation / cross-user data exposure** — single tenant
- **JWT / session / CSRF / SSRF / SQLi** — no server, no DB
