# Garage Block 12 — Riaan's Programme & Nutrition Plan
**Built:** 2026-09-10 · **Restructured:** 2026-09-16 (16 weeks → 12, calendar-anchored)
**Replaces:** Calisthenics Foundation 16 (2026-06-05)
**Runs:** Mon 14 September 2026 → Sun 6 December 2026
**App:** TrainRight Health (this folder) — the programme below is encoded in `src/data/program.ts`.

---

## Why twelve weeks, not sixteen

The block is anchored to a **finish date**, not to "sixteen weeks from whenever
you press start". The last week had to be the first week of December 2026.
Starting Monday **14 September** puts week 12 on the week of Monday
**30 November**, closing Sunday **6 December**.

Four fewer weeks are paid for by compressing the progression rather than
cutting the end off it:

- **One mid-block deload instead of two.** Week 6 only. Twelve weeks does not
  justify two full down-weeks, and the second one used to cost a week of work
  right before the peak.
- **Blocks B and C are shorter** — three weeks and two, against five and three.
- **Every block now steps effort as well as volume.** Previously only the set
  count moved and RIR was described in prose; now the prescription itself
  steps one notch down the RIR ladder per block (`rirStep` in
  `src/data/program.ts`). Block A trains at the printed RIR, Block B one notch
  harder, Block C one harder again.
- **Peak volume is unchanged** — the old week 13–15 loading. It is simply
  reached in week 10 instead of week 13.

Two hard floors survive the compression:

- **Heavy barbell lifts never go below 1 RIR**, whatever the block steps to
  (`HEAVY_CATEGORIES`). Squat, bench, overhead press, row and RDL. He trains
  alone with no spotter.
- **Pull-up clusters never gain a set** (`fixedSets: true`). At a four-rep max
  the cluster count is the prescription, not a volume dial — progression there
  is reps, 5×2 → 5×3 → 5×4. A block's extra set passes down to the next
  eligible exercise, so Pull day puts it on the rows.

`PROGRAM_WEEKS`, `RECOMMENDED_START` and `PROGRAM_FINISH` are exported from
`src/data/program.ts` and are the single source of truth — the engine, the
Train tab and the Settings summary all read them rather than hard-coding a
number, which is how the old `16` ended up in five separate places.

## What changed from the calisthenics block

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

| Weeks | Dates (from 14 Sep) | Block | What changes |
|---|---|---|---|
| 1–5 | 14 Sep – 18 Oct | **A — Accumulate** | Bottom of every rep range, +1 rep/set/week, at the printed RIR |
| 6 | 19 – 25 Oct | **Deload** | 2 sets each at ~60%, 4–5 RIR. Retest max pull-up. |
| 7–9 | 26 Oct – 15 Nov | **B — Build** | +1 set per day, and one notch harder: 2–3 RIR becomes 2 |
| 10–11 | 16 – 29 Nov | **C — Peak** | +2 sets per day, one notch harder again: isolation to 0–1, heavy barbell stops at 1 |
| 12 | 30 Nov – 6 Dec | **Deload & retest** | Retest heavy 5s on bench, squat, row + max pull-up |

Past week 12 the app keeps working: it rolls back onto the **peak** block, not
the final deload, and the session header says the block is complete. (The old
build clamped to the final week instead, which pinned anyone running past the
finish to two sets at 60% forever with nothing on screen explaining why.)

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
   of failure. When 5×3 is easy, go to 5×4. True max only in weeks 6 and 12.
   Cluster count never rises with the block — see `fixedSets`.
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

**Confirmed 2026-09-10.** Protein and fat are held identical across both day
types; carbohydrate is the only lever. Protein protects lean mass in a deficit
and fat holds hormones steady, so neither is what you cut on an easier day —
50 g of carbs is. It also makes the difference one number to remember.

| Day type | kcal | Protein | Carbs | Fat |
|---|---|---|---|---|
| **Training** | 2,101 | 190 g | 180 g | 69 g |
| **Rest** | 1,901 | 190 g | 130 g | 69 g |

Both totals are exact: 190×4 + 180×4 + 69×9 = 2,101 · 190×4 + 130×4 + 69×9 = 1,901.

**Lean-gain preset** (switch around 15–16% body fat) keeps the same shape, with
carbs carrying the surplus: training 2,401 (190/255/69), rest 2,201 (190/205/69).

### Choosing the day type

The programme schedule sets the default — the five training days are training
days, Thursday and Sunday are rest days. The **Daily Progress** card carries a
Training day / Rest day toggle: tapping the other option overrides that date
only, and the macro targets follow immediately. A line underneath says whether
you are following the schedule or have overridden it, with a link back.

Tapping the option the schedule already implies clears the override rather than
pinning it, so a day always snaps back to the plan.

The choice is stored on that date's session log as `dayTypeOverride` and syncs
across devices.
