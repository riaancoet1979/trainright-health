# Garage Block 16 — Riaan's Programme & Nutrition Plan
**Built:** 2026-09-10 · **Replaces:** Calisthenics Foundation 16 (2026-06-05)
**App:** TrainRight Health (this folder) — the programme below is encoded in `src/data/program.ts`.

---

## What changed and why

The previous programme was a 4-day calisthenics block built around a left
shoulder at 7/10 on overhead and hanging work. That constraint has been
professionally assessed and resolved, so the shoulder-specific scaffolding
(no-overhead rule, feet-supported hanging progression, pain-gated exercises)
is gone. The daily pain slider and readiness gating remain in the app for
general use, but no exercise is flagged `painFreeOnly` any more.

The old split also trained each muscle **once** a week. The 2025 Pelland et al.
dose-response meta-regression (67 studies, 2,058 participants) found weekly
**set volume** drives hypertrophy with ~100% posterior probability, while
frequency showed effects "compatible with negligible" once volume was equated.
But Remmert et al. found a per-session ceiling at roughly **11 fractional sets**
— past that, extra sets in the same workout stop adding growth. On a
once-a-week split that session ceiling becomes the weekly ceiling. Hence five
days, every muscle twice.

## Profile
- 5 training days/week, 45–60 minutes each
- Equipment: adjustable bench (incline + flat), squat/bench rack, pull-up bar,
  barbell + plates, EZ bar + plates, assorted dumbbells, 2 kettlebells
- **No dips** — not in the programme anywhere
- **Pull-ups bodyweight only**, ~4 rep max — programmed as clusters
- Unilateral work leads with the **left** side; the right matches, never exceeds

## The split

| Day | Session | Focus | Sets |
|---|---|---|---|
| Mon | **Push** | Chest, shoulders, triceps | 19 |
| Tue | **Pull** | Back, rear delts, biceps | 20 |
| Wed | **Legs** | Quad-led, calves, core | 17 |
| Thu | *rest* | | |
| Fri | **Upper** | Second dose — lighter, higher rep | 18 |
| Sat | **Lower + Core** | Hinge-led, unilateral, carries | 18 |
| Sun | *rest* | | |

Sessions rotate **Push → Pull → Legs → Upper → Lower** by rotation, not by
weekday. The app suggests the next session from the most recent completed log
and any session can be run on any date via the day-key override.

**Spacing guards** (warnings, not blocks):
- Four consecutive training days — three is by design, four is not.
- Muscle overlap with yesterday: Push↔Upper, Pull↔Upper, Legs↔Lower.
  Push↔Pull back-to-back is fine and is deliberately *not* flagged.
- Six or more sessions in the last 7 days.

## Blocks

| Weeks | Block | What changes |
|---|---|---|
| 1–5 | **A — Accumulate** | Bottom of every rep range, +1 rep/set/week, 2–3 RIR drifting to 1–2 |
| 6 | **Deload** | 2 sets each at ~60%, 4–5 RIR. Retest max pull-up. |
| 7–11 | **B — Add a set** | +1 set on the first exercise of each day, 1–2 RIR |
| 12 | **Deload** | As week 6 |
| 13–15 | **C — Peak** | +1 set on the second exercise too; isolation to 0–1 RIR |
| 16 | **Deload & retest** | Retest heavy 5s on bench, squat, row + max pull-up |

## Weekly volume, against target

| Muscle | Direct | + indirect | Target |
|---|---|---|---|
| Back | 17 | 19 | 14–20 |
| Chest | 13 | 13 | 12–16 |
| Quads | 12 | 14 | 12–16 |
| Hams & glutes | 10 | 13 | 10–14 |
| Side delts | 8 | 12 | 10–16 |
| Calves | 8 | 8 | 8–12 |
| Triceps | 7 | 12 | 8–14 |
| Biceps | 5 | 11 | 8–12 |
| Rear delts | 3 | 7 | 6–10 |
| Core | 5 | 7 | 6–10 |

Indirect sets count as half — a barbell row is a full set for back and half a
set for biceps. That half-counting method predicted real-world growth better
than any other in the 2025 analysis, which is why arms get no dedicated day
and still land in range.

## Rules encoded in the app

1. **Rest**: long enough that the next set does not collapse, not a second
   longer. No hypertrophy benefit past 90 s (2024 Bayesian meta-analysis); the
   only band that measurably underperforms is under 60 s. Isolation 90 s,
   secondary compounds 2 min, heavy compounds 2–3 min. Each exercise carries
   its own `restSeconds` and ticking a set starts *that* timer.
2. **RIR**: reps in reserve controls intensity, not the rep count. Anything
   from 5 to 30 reps grows muscle at roughly the same rate if the set finishes
   close to failure. Logged per set, not just prescribed.
3. **Double progression**: hold the weight until every set hits the top of its
   range at target RIR, then +2.5 kg upper / +5 kg lower and back to the bottom.
   Two sessions with no rep added is a stall — drop 10% and rebuild.
4. **Pull-ups are clusters, never to failure inside a block.** 5×2–3 well short
   of failure. When 5×3 is easy, go to 5×4. True max only in weeks 6, 12, 16.
5. **Log weight × reps × RIR every set.** Double progression is guesswork
   without last week's numbers.

Full text of each rule lives in `PROGRAM_NOTES` in `src/data/program.ts` and
renders in the app under "Programme notes".

## Swaps

| Lift | Substitute |
|---|---|
| Barbell Overhead Press | Seated DB press, neutral grip, left leading |
| Barbell Bench Press | Flat DB press |
| Dumbbell Pullover | Shorter-range KB pullover, or drop and add a row set |
| Hanging Leg Raise | Lying leg raise / bench knee tuck |
| Barbell Hip Thrust | KB swings 4×15, or single-leg glute bridges |
| Front Squat | Goblet squat, heavier KB, higher reps |

## History from the old programme

Existing logs are preserved. The `health_training_v1` **v1 → v2 migration**
rewrites stored day keys onto the new sessions so past sessions keep
resolving, keep rendering their sets, and keep counting in the weekly review:

| Old | New |
|---|---|
| `mon` (Lower + Core) | `legs` |
| `tue` (Pull + Rehab) | `pull` |
| `thu` (Push + Core) | `push` |
| `sat` (Hinge + Skills) | `lower` |

`DayKey` remains a tolerant union of both sets, so a log synced from a device
still running the old build resolves rather than breaking the rotation.

## Nutrition

Unchanged from the previous plan — see `DEFAULT_DAY_TYPE_TARGETS` and
`LEAN_GAIN_TARGETS` in `src/data/program.ts`.

| Day type | kcal | Protein | Carbs | Fat |
|---|---|---|---|---|
| Training (fat loss) | 2,000 | 160 g | 130 g | 95 g |
| Rest (fat loss) | 1,850 | 160 g | 95 g | 95 g |
| Training (lean gain) | 2,350 | 160 g | 215 g | 95 g |
| Rest (lean gain) | 2,150 | 160 g | 165 g | 95 g |

**⚠️ These were calibrated for a 4-day week.** A fifth training day shifts
weekly energy balance and one rest day became a training day. Revisit once
the bodyweight trend over 3–4 weeks is visible.
