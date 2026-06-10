# Claude Code Prompt — Week 2 Plan + Flexible Schedule
Paste everything below into Claude Code with the repo `C:\Users\ACER\Claude Cowork\Health app` (riaancoet1979/trainright-health).

---

Update my TrainRight Health app (React+TS+Vite PWA, GitHub Pages) with my Week 2 training calibration and a flexible (non-weekday) schedule. Load the trainright-health-coach skill if available and follow its rules.

## Constraints (non-negotiable)
- Never delete `.npmrc`; never run `npm audit fix`.
- `npx tsc -b` and `npx vitest run` (86+ tests) must pass before push; add/update tests for everything you change, especially `training.spec.ts` and `safetyRegression.spec.ts`.
- localStorage holds months of real logs (`health_training_v1`, `nutrition_tracker_*`). Any data-shape change needs a forward migration — never drop or reshape existing logs destructively.
- Do NOT weaken any shoulder safety rule (`painFreeOnly`, `yellowSkip`, no-overhead-pressing). These are load-bearing.
- Deploy = commit + push to main → GitHub Actions → Pages. Small, independently deployable commits.
- Keep `PROGRAM.md` in the repo in sync with `src/data/program.ts`.

## Part 1 — Flexible schedule (replace weekday-driven sessions with a rotation)
Today sessions are keyed to weekdays (mon/tue/thu/sat in `src/data/program.ts`, resolved in `src/utils/training.ts`; a per-date `dayKeyOverride` already exists). I no longer train on fixed days. Convert to a **rotation model**:

1. Rename the four sessions to **A — Lower + Core**, **B — Pull + Shoulder rehab**, **C — Push + Core**, **D — Hinge + Skills + Conditioning** (keep existing day keys internally for backward compatibility with saved logs; map mon→A, tue→B, thu→C, sat→D — do not rewrite stored logs).
2. New session resolution: the Train tab suggests the **next session in A→B→C→D order based on the most recent completed log**, regardless of weekday. Completing D cycles back to A. The existing override UI stays so I can pick any session manually.
3. Week number advances every completed D (full cycle) OR per calendar week — pick whichever is simpler to implement cleanly, but a week must never advance past one per 7 calendar days (phases assume ~4 sessions/week).
4. Add **spacing guards** (warnings, not blocks) shown on the Train tab:
   - "3rd consecutive training day — consider resting" after 2 days in a row.
   - "Pull and Push back-to-back stresses the shoulder — insert a rest day or A/D session" when the suggested/selected session is B directly after C or C directly after B (consecutive calendar days).
   - "4 sessions in the last 7 days done — extra sessions are bonus volume, keep them light."
5. Tests: rotation order, cycle wrap, override interaction, the three guards, week-advance cap, and that pre-rotation logs (dayKey mon/tue/thu/sat) still render and count correctly.

## Part 2 — Week 2 calibration (edit Phase 2 in `src/data/program.ts`)
Coach review of assessment week (2026-06-07 → 06-10) decided the following. Apply to Phase 2 (weeks 2–5):

**Session A — Lower + Core**
- `goblet_squat`: keep 4×8–12; set cues to "Start 16–20 kg. Week 1 @10 kg was far too light. RIR 2–3."
- `box_pistol`: keep 3×6/side; progression "Lower the box once all sets clean."
- `sl_glute_bridge`: 3×12/side; add cue "2 s pause at top."
- `hollow_hold` → REPLACE with `hollow_rock` "Hollow Rocks", 3 sets, ×12–15, category core, cues "Earned: held 3×45 s in assessment. Lower back stays pressed down." Keep `hollow_hold` listed as its regression.
- `reverse_lunge`: keep, cue "Start 10 kg DBs."

**Session B — Pull + Shoulder rehab**
- `band_pullup`: keep 4×5–8; progression unchanged.
- `inverted_row`: keep 4×8–12.
- `scap_pull_supported`: sets 2, repsSpec '×5', cues "REGRESSED: pain in week 1. Maximum foot support, partial ROM, only at pain ≤2/10 — otherwise do band scap depressions instead." Keep `painFreeOnly: true`.
- NEW exercise `dead_hang_supported` "Dead Hang (feet supported)", 3 sets, repsSpec '15–20 s', timed, equipment 'Bar + Box', category pullup, `painFreeOnly: true`, cues "Tolerated 3×15 s in week 1. Feet take load as needed. Stop above 2/10. This builds toward the ≥30 s hang gate for strict pull-ups."
- `single_arm_row`: cue "16–20 kg — 10 kg was too light", keep leftFocus extra set.
- Rehab block unchanged.

**Session C — Push + Core**
- `db_bench`: keep 4×8–10; cue "Pick a weight where 10 reps = RIR 2 (~15–17.5 kg/hand to start)."
- `dips`: keep 3×5–8; cue add "+1 rep per session while ≤2/10."
- `pushup`: keep 3×8–15.
- `landmine_press`: keep 3×8/side; cue "Add 2.5–5 kg — bar-only ×15 was pain-free in week 1. Stop on any pain." Keep painFreeOnly.
- `dead_bug`: unchanged.
- NEW exercise `cg_floor_press` "Close-Grip Floor Press (triceps)", 3 sets, '×10–12', equipment 'Barbell', category bench, rest '90 s', rir '2', cues "Shoulder-safe triceps line. REPLACES all overhead/behind-head extensions — those are banned (pain 2→4/10 in week 1)."

**Session D — Hinge + Skills + Conditioning**
- `kb_swing`: cue "16 kg if available — 10 kg too light for ballistic work."
- `db_rdl`: repsSpec stays 4×8–10; cue "Move to barbell RDL 40–50 kg."
- `tuck_lsit`: keep 4 sets 10–15 s; cues "Strong in week 1 (4×20 s) — now flatten back, lift knees higher; quality over duration."
- `side_plank`: 3×25–30 s/side.
- NEW optional exercise `dragon_flag` "Dragon Flag (optional finisher)", 2 sets, '×5 slow', equipment 'Bench', category core, `painFreeOnly: true`, `yellowSkip: true`, cues "Only at shoulder ≤2/10. Slow eccentrics, no arch."
- `mobility_block`: unchanged — and make it visually non-skippable (e.g. listed before the optional finisher).

## Part 3 — Supporting changes
1. Train tab: show a short "Coach notes — Week 2" banner (dismissible, stored in localStorage) summarising: rotation A→B→C→D, max 2 consecutive days, no B↔C back-to-back, protein ≥160 g daily, no overhead barbell work.
2. Update `PROGRAM.md` to describe the rotation model and Week 2 calibration.
3. If exercise IDs are referenced in coach engine (`src/utils/coach.ts`) or tests, update consistently (`hollow_hold`→`hollow_rock` handling: coach must still recognise old logs).
4. Run full test suite + `tsc -b`, then deploy. Tell me what to verify on my phone (one reload for the new service worker).
