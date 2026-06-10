# Calisthenics Foundation 16 — Riaan's Program & Nutrition Plan
**Built:** 2026-06-05 · **Athlete:** Riaan, 46, 178 cm, 81 kg, ~19% BF
**App:** TrainRight Health (this folder) — the program below is encoded in `src/data/program.ts`.

---

## Profile summary (from onboarding)
- 4 training days/week: **Mon, Tue, Thu, Sat** — 20 min treadmill + 40–50 min training
- Goal: balanced all-round → a bit more fat loss, then lean gain
- Skills wanted: pull-ups & dips, L-sit, handstand, pistol squat
- Recent: 101 kg → 81 kg (was on retatrutide, stopped ~3 weeks ago, weight stable)
- Sleep: 7–8 h winter, ~6 h summer
- **Left shoulder: 7/10 pain on overhead and hanging, slight on incline bench**
- Strength: band pull-ups ×5, push-ups 10–15, dips 6–8, DB bench 40 kg 4×10, dead hang 12 s
- Equipment: DBs, KBs, bench, squat rack, barbell + 2×15 kg plates, pull-up/dip bars, 1 band, landmine, treadmill
- Steps: ~5,000/day realistic (goal set accordingly)

## Hard safety rules (encoded in the app)
1. **No overhead pressing anywhere.** Landmine press is the only inclined line, and only at shoulder pain ≤ 2/10 on the day.
2. **All hanging starts feet-supported.** Progress hang time only at pain ≤ 2/10.
3. **Handstand deferred** until pain-free + physio clearance.
4. Daily shoulder-pain slider (0–10) auto-removes pain-restricted exercises above 2/10.
5. Readiness Green/Yellow/Red adjusts every session (Yellow: −1 set, accessories dropped; Red: rest).
6. **Get the shoulder professionally assessed.** 7/10 is not a "train through it" number.

## Phases
| Phase | Weeks | Focus |
|---|---|---|
| 1 — Assessment | 1 | Submaximal baselines (RIR 2–3), technique, shoulder tolerance map |
| 2 — Foundation | 2–5 | Scap control, pain-free hang build, push/pull balance, pistol + L-sit groundwork |
| 3 — Strength & Skill | 6–11 | Barbell squat/RDL, assistance → zero on pull-ups, dip loading, adv-tuck L-sit, low-box pistol. First strict pull-up attempt wk 9–10 IF hang ≥ 30 s pain-free |
| 4 — Integration | 12–16 | Strict pull-up clusters, weighted dips, full pistols, one-leg→full L-sit. **Week 16 = deload + retest** |

## Weekly split — sessions A/B/C/D (rotation, not weekday-locked)
From Phase 2 (Week 2 onward) the four sessions are labelled by **letter**, not weekday. Train them in **A → B → C → D** order; after D, cycle back to A. The app suggests the next session based on the most recent completed log, and you can manually pick any session on any date via the day-key override.

- **A — Lower + Core:** squat pattern (goblet → barbell), pistol track, single-leg hinge, hollow work
- **B — Pull + Shoulder rehab:** pull-up progression, inverted rows, scap pulls (feet supported), supported dead hang, band pull-aparts + external rotations (extra left-side set)
- **C — Push + Core:** DB bench, dip track, push-up progressions, landmine press (pain-free only), close-grip floor press (the only triceps line — overhead extensions are **banned**), anti-extension/rotation core
- **D — Hinge + Skills + Conditioning:** KB swings, RDL, L-sit track, pistol practice, KB intervals, mobility, optional dragon-flag finisher

**Spacing rules** (the app warns when violated):
- Max 2 consecutive training days.
- No B (Pull) ↔ C (Push) on consecutive days — both load the shoulder; insert a rest day or run A/D between.
- ≥ 4 sessions in the last 7 days = bonus volume, keep extras light.

Internal day keys (`mon`/`tue`/`thu`/`sat`) are preserved in the data so historical logs from the calendar-driven era still render and count.

## Week 2 calibration (Phase 2, set 2026-06-10 from assessment)
Restated from the Week 1 assessment outcomes:
- **Goblet squat** 16–20 kg (10 kg was far too light).
- **Single-arm row** 16–20 kg.
- **KB swing** 16 kg if available.
- **DB bench** ~15–17.5 kg/hand where 10 reps = RIR 2.
- **Reverse lunge** start 10 kg DBs.
- **DB RDL** move toward barbell RDL 40–50 kg.
- **Hollow rock** 3×12–15 replaces hollow hold (earned 3×45 s).
- **Dead hang (feet supported)** 3×15–20 s — builds toward the ≥30 s hang gate before strict pull-ups.
- **Scap pulls (supported)** **regressed** to 2×5 with maximum foot support — only at pain ≤ 2/10, otherwise sub band scap depressions.
- **Dips** +1 rep per session while ≤ 2/10.
- **Landmine press** add 2.5–5 kg (bar-only ×15 was pain-free week 1). Stop on any pain.
- **Close-grip floor press** 3×10–12 — shoulder-safe triceps line. Replaces all overhead / behind-head extensions (pain 2→4/10 week 1).
- **Dragon flag** (optional D finisher) 2×5 slow — pain-free only.

## Progression rules (double progression)
Progress only when: all sets at top of rep range, clean technique, target RIR met, no concerning pain, recovery OK. One variable at a time: reps → sets → ROM → slower eccentric → less assistance → harder variation → load.

## 16-week targets (realistic, not guaranteed)
- 3–5 strict pull-ups · 4×10 clean dips (or 5×5 weighted) · 15–20 s tuck/one-leg L-sit · full pistol both sides · 25+ push-ups · pain-free hang ≥ 45 s
- Body: ~15–16% BF by ~wk 9, then lean gain

## Nutrition (encoded in the app — auto-switches by day type)
| Day type | kcal | Protein | Carbs | Fat |
|---|---|---|---|---|
| Training (phase: fat loss) | 2,000 | 160 g | 130 g | 95 g |
| Rest (phase: fat loss) | 1,850 | 160 g | 95 g | 95 g |
| Training (lean gain, ~wk 9+) | 2,350 | 160 g | 215 g | 95 g |
| Rest (lean gain) | 2,150 | 160 g | 165 g | 95 g |

- Fibre 30 g+ · Water 2.5–3 L · Weekly weigh-in trend, not daily
- Shake (×2 daily, breakfast + lunch): **50 g whey + 3 whole eggs + 200 ml full-cream milk** ≈ 38 g protein each
- Main meal 17:00–18:00: protein-first (250–300 g meat/chicken/fish), vegetables, carbs scaled to day type
- Post-retatrutide: appetite will rebound — protein and the day-type targets are the guardrails. Discuss the transition with your doctor.
- Switch to the Lean-gain preset in Settings when BF ~15–16% and training is progressing (around week 9).

## Week 1 (assessment) — what to record
Every session: weights/reps per set, RIR feel, shoulder pain 0–10, session notes. Sat: mobility screen notes (deep squat, wrist extension, shoulder ROM). End of week 1 → review together, finalise weeks 2–16 details.
