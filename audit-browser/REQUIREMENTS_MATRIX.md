# Requirements Traceability Matrix

**Audit date:** 2026-06-06

Maps each requirement from the QA brief to its tested result.

| ID | Requirement | Test Method | Result | Finding |
|---|---|---|---|---|
| R-01 | App loads without error at GitHub Pages URL | Navigate to URL, observe load | ✅ Pass | — |
| R-02 | 7 navigation tabs present and functional | Click each tab button | ✅ Pass | — |
| R-03 | Train tab shows today's session header | DOM inspection | ✅ Pass | — |
| R-04 | Readiness: GREEN shows full session | Click GREEN, count exercises | ✅ Pass | — |
| R-05 | Readiness: YELLOW reduces volume | Click YELLOW, verify "(reduced — yellow)" labels and 2-set minimum | ✅ Pass | TR-001 (mobility screen minor) |
| R-06 | Readiness: RED blocks exercise list | Click RED, verify blocking message | ✅ Pass | — |
| R-07 | Safety checkbox forces RED regardless of readiness button | Tick "Chest pain" checkbox, verify RED block appears | ✅ Pass | — |
| R-08 | Safety checklist items are medical symptoms only | Read all 4 checkbox labels | ✅ Pass | — |
| R-09 | Shoulder pain slider present (0–10) | DOM inspection | ✅ Pass | — |
| R-10 | Exercise set logging: weight + reps inputs, Log button | Fill inputs, click Log, verify localStorage | ✅ Pass | — |
| R-11 | Logged set saved to localStorage under correct date key | Read `health_training_v1.logs[date].exercises` | ✅ Pass | — |
| R-12 | Mark Complete saves `completed: true` | Click button, read localStorage | ✅ Pass | — |
| R-13 | Mark Complete button changes to "✓ Completed" | Observe button text after click | ✅ Pass | — |
| R-14 | Bodyweight input validates min 20 / max 300 | Code review (Train.tsx); test boundary omitted (min/max attr present) | ✅ Pass (code) | — |
| R-15 | Bodyweight logs to bodyMetrics in localStorage | Fill input, click Log, read localStorage | ✅ Pass | — |
| R-16 | Session notes textarea saves on blur | Code review; JS simulation confirmed blur fires | ⚠️ Partial | NOTE-001 (JS env limitation) |
| R-17 | Coach daily insights show data-driven messages | Observe coach section with prior data | ✅ Pass | — |
| R-18 | Calendar: month grid with all days | Navigate to Cal tab, inspect DOM | ✅ Pass | — |
| R-19 | Calendar: click date → day detail panel | Click day 5, verify "Friday, June 5, 2026" | ✅ Pass | — |
| R-20 | Calendar: day detail shows nutrition, training, pushup data | Inspect day 5 detail | ✅ Pass | — |
| R-21 | "Today" button resets selected date | Click Today button | ✅ Pass | — |
| R-22 | Add tab: food search is live-filtered | Type "chicken breast" → see filtered results | ✅ Pass | — |
| R-23 | Add tab: selecting food shows nutrition preview | Click "Chicken Breast (Skinless)" | ✅ Pass | — |
| R-24 | Add tab: Add Food saves to selected date in localStorage | Click Add Food, verify localStorage | ✅ Pass | — |
| R-25 | Add tab: Add Food resets form after successful add | Observe form after Add Food | ✅ Pass | — |
| R-26 | Add tab: date context visible to user | Inspect Add tab UI | ❌ Fail | UX-001 |
| R-27 | Add Activity: quick-add buttons present | Observe Fitness section | ✅ Pass | — |
| R-28 | Add Activity: custom duration + cal/min + estimated calories | Inspect activity form | ✅ Pass | — |
| R-29 | Stats: weekly summary (sessions, sleep, steps, protein, kcal) | Navigate to Stats tab | ✅ Pass | — |
| R-30 | Stats: today's progress vs targets | Inspect Today's Progress section | ✅ Pass | — |
| R-31 | Stats: macro breakdown display | Inspect macro section | ✅ Pass | — |
| R-32 | Stats: nutrition values display with correct precision | Inspect displayed values | ❌ Fail | FP-001 |
| R-33 | Fitness: pushup set/reps tracking | Inspect Fitness tab | ✅ Pass | — |
| R-34 | Fitness: steps tracking with quick-set buttons | Inspect steps section | ✅ Pass | — |
| R-35 | Fitness: completed set history | Inspect history section | ✅ Pass | — |
| R-36 | Body tab: body stats entry form | Navigate to Body tab | ✅ Pass | — |
| R-37 | Body tab: history entries with all stats | Inspect history list | ✅ Pass | — |
| R-38 | Body tab: progress chart rendered | Observe charts section | ✅ Pass | — |
| R-39 | Settings: program start date editable | Inspect date input | ✅ Pass | — |
| R-40 | Settings: training/rest day targets editable | Inspect target inputs | ✅ Pass | — |
| R-41 | Settings: Fat-loss and Lean-gain presets | Observe preset buttons | ✅ Pass | — |
| R-42 | Settings: Export all data button | Observe export button | ✅ Pass | — |
| R-43 | Settings: Import full backup | Observe import button | ✅ Pass | — |
| R-44 | Settings: Theme toggle (light/dark) | Observe theme toggle | ✅ Pass | — |
| R-45 | Settings: Pushup reminders with time management | Inspect reminders section | ✅ Pass | — |
| R-46 | Settings: Custom foods management | Inspect custom foods section | ✅ Pass | — |
| R-47 | Full data persistence after page reload | Reload page, verify all localStorage data | ✅ Pass | — |
| R-48 | 75 unit tests pass | Run `npm test` | ✅ Pass | — |
| R-49 | No console errors at load or during navigation | Monitor browser console | ✅ Pass | — |
| R-50 | No working features removed (non-regression) | Feature inventory comparison | ✅ Pass | — |
| R-51 | App date auto-updates when midnight passes | Functional test | ❌ Fail | DATE-001 |
| R-52 | Garmin sync — handles absence of sync file gracefully | Observe load behavior | ✅ Pass | — |

**Legend:** ✅ Pass | ❌ Fail | ⚠️ Partial
