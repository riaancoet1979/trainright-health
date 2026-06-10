// ============================================================
// TrainRight Health — 16-week calisthenics-hybrid program
// Built for Riaan (46, 178 cm, ~81 kg) — 4 days/week
// Mon: Lower + Core (pistol track)
// Tue: Pull + Shoulder rehab
// Thu: Push + Core (dip track)
// Sat: Hinge + Skills (L-sit) + conditioning
//
// HARD RULES (left shoulder, 7/10 pain overhead + hanging):
//  - NO overhead pressing anywhere in this program.
//  - All hanging starts feet-supported; progress only at pain ≤ 2/10.
//  - Landmine press is the only inclined pressing line, painFreeOnly.
//  - Handstand work is deferred until pain-free + physio clearance.
//  - Every session is preceded by 20 min treadmill (logged as cardio).
// ============================================================

import type { ProgramPhase, DayTypeTargets } from '../types/training';

export const PROGRAM_NAME = 'Calisthenics Foundation 16';
export const TREADMILL_NOTE = '20 min treadmill before every session (easy–moderate, nasal breathing pace).';

export const WARMUP = [
  'Cat-cow + thoracic rotations ×8',
  'Band pull-aparts ×15',
  'Band external rotation ×12 / side',
  'Scap push-up ×10',
  'Deep squat hold 30 s',
  'Wrist circles + palm lifts ×10',
];

// ── Nutrition targets aligned to the program ──
// Calibrated for ~5,000 steps/day average activity.
export const DEFAULT_DAY_TYPE_TARGETS: DayTypeTargets = {
  training: { dailyCalories: 2000, dailyProtein: 160, dailyCarbs: 130, dailyFats: 95 },
  rest: { dailyCalories: 1850, dailyProtein: 160, dailyCarbs: 95, dailyFats: 95 },
};

/** Lean-gain targets to switch to around week 9 if body fat ~15–16%. */
export const LEAN_GAIN_TARGETS: DayTypeTargets = {
  training: { dailyCalories: 2350, dailyProtein: 160, dailyCarbs: 215, dailyFats: 95 },
  rest: { dailyCalories: 2150, dailyProtein: 160, dailyCarbs: 165, dailyFats: 95 },
};

/** Daily steps goal — realistic with treadmill sessions. */
export const DEFAULT_STEPS_GOAL = 5000;

export const TRAINING_DAY_KEYS = ['mon', 'tue', 'thu', 'sat'] as const;

const REHAB_BLOCK = [
  {
    id: 'band_pull_apart', name: 'Band Pull-Aparts', sets: 3, repsSpec: '×15–20',
    equipment: 'Band', category: 'rehab' as const, rest: '45 s',
    cues: 'Squeeze shoulder blades, no shrug.',
  },
  {
    id: 'band_ext_rot', name: 'Band External Rotation', sets: 3, repsSpec: '×15 / side',
    perSide: true, equipment: 'Band', category: 'rehab' as const, rest: '45 s', leftFocus: true,
    cues: 'Elbow pinned to ribs. Slow. Extra set left side.',
  },
];

export const PHASES: ProgramPhase[] = [
  // ────────────────────────────────────────────────────────
  // PHASE 1 — WEEK 1: ASSESSMENT & TECHNIQUE
  // Everything submaximal: stop with 2–3 clean reps in reserve.
  // ────────────────────────────────────────────────────────
  {
    phase: 1, weeks: [1], label: 'Phase 1 — Assessment (Week 1)',
    focus: 'Baseline tests, technique, shoulder tolerance mapping. Nothing to failure.',
    days: [
      {
        key: 'mon', label: 'Lower + Core — baseline', goal: 'Squat pattern quality, single-leg baseline, core endurance.',
        exercises: [
          { id: 'goblet_squat', name: 'Goblet Squat', sets: 3, repsSpec: '×10', equipment: 'DB/KB', category: 'squat', rest: '90 s', rir: '3', cues: 'Heels down, chest tall, full depth if comfortable.', regression: 'Box squat', progression: 'Heavier DB' },
          { id: 'box_pistol', name: 'Box Pistol (high box)', sets: 2, repsSpec: '×5 / side', perSide: true, equipment: 'Box/Bench', category: 'skill', rest: '90 s', rir: '3', cues: 'Sit back slow, stand without rocking.', regression: 'Higher box', progression: 'Lower box' },
          { id: 'sl_glute_bridge', name: 'Single-Leg Glute Bridge', sets: 2, repsSpec: '×10 / side', perSide: true, equipment: 'BW', category: 'hinge', rest: '60 s', rir: '3' },
          { id: 'hollow_hold', name: 'Hollow Hold', sets: 3, repsSpec: '15–20 s', timed: true, equipment: 'BW', category: 'core', rest: '60 s', cues: 'Lower back pressed into floor.' },
          { id: 'plank_hold', name: 'Plank', sets: 2, repsSpec: 'to RIR ~15 s', timed: true, equipment: 'BW', category: 'core', rest: '60 s' },
        ],
      },
      {
        key: 'tue', label: 'Pull + Shoulder rehab — baseline', goal: 'Vertical pull baseline, pain-free hanging tolerance, scap control.',
        exercises: [
          { id: 'band_pullup', name: 'Band-Assisted Pull-Up', sets: 3, repsSpec: '×4–5', equipment: 'Band + Bar', category: 'pullup', rest: '2 min', rir: '2–3', cues: 'Full hang to chin over. Control down.', regression: 'Foot on box assist', progression: 'More reps' },
          { id: 'inverted_row', name: 'Inverted Row (bar in rack)', sets: 3, repsSpec: '×8', equipment: 'Barbell + Rack', category: 'row', rest: '90 s', rir: '2–3', cues: 'Body rigid, pull chest to bar.', regression: 'Higher bar', progression: 'Lower bar / feet elevated' },
          { id: 'scap_pull_supported', name: 'Scapular Pulls (feet supported)', sets: 3, repsSpec: '×6', equipment: 'Bar + Box', category: 'pullup', rest: '60 s', painFreeOnly: true, cues: 'Feet take weight. Shrug down, no elbow bend. STOP at any shoulder pain.' },
          ...REHAB_BLOCK,
        ],
      },
      {
        key: 'thu', label: 'Push + Core — baseline', goal: 'Push-up and dip baseline, bench reference, shoulder-safe pressing map.',
        exercises: [
          { id: 'pushup', name: 'Push-Up (test)', sets: 2, repsSpec: 'AMRAP −2', equipment: 'BW', category: 'bench', rest: '2 min', rir: '2', cues: 'Stop 2 clean reps before failure.' },
          { id: 'db_bench', name: 'Flat DB Bench Press', sets: 3, repsSpec: '×10', equipment: 'DB + Bench', category: 'bench', rest: '90 s', rir: '3', cues: 'Moderate weight, 45° elbows.' },
          { id: 'dips', name: 'Dips (test)', sets: 2, repsSpec: '×4–6', equipment: 'Bars', category: 'dip', rest: '2 min', rir: '2–3', painFreeOnly: true, cues: 'Shallow depth first. STOP on any shoulder pain.', regression: 'Bench dips, feet on floor' },
          { id: 'dead_bug', name: 'Dead Bug', sets: 3, repsSpec: '×10 / side', perSide: true, equipment: 'BW', category: 'core', rest: '60 s' },
        ],
      },
      {
        key: 'sat', label: 'Hinge + Skills — baseline', goal: 'Hinge technique, L-sit baseline, mobility screen.',
        exercises: [
          { id: 'kb_swing', name: 'KB Swing (technique)', sets: 3, repsSpec: '×12', equipment: 'KB', category: 'hinge', rest: '90 s', rir: '3', cues: 'Hips snap, arms relaxed.' },
          { id: 'db_rdl', name: 'DB Romanian Deadlift', sets: 3, repsSpec: '×10', equipment: 'DB', category: 'hinge', rest: '90 s', rir: '3' },
          { id: 'tuck_lsit', name: 'Tuck L-Sit Support Hold (test)', sets: 3, repsSpec: '8–12 s', timed: true, equipment: 'Dip bars', category: 'skill', rest: '90 s', cues: 'Push bars away, knees to chest. Shoulders down.', regression: 'Support hold, feet on floor' },
          { id: 'side_plank', name: 'Side Plank', sets: 2, repsSpec: '20 s / side', perSide: true, timed: true, equipment: 'BW', category: 'core', rest: '60 s' },
          { id: 'mobility_screen', name: 'Mobility screen: deep squat, wrist ext., shoulder ROM', sets: 1, repsSpec: '5 min', timed: true, equipment: 'BW', category: 'mobility', rest: '—', cues: 'Note restrictions in session notes.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────
  // PHASE 2 — WEEKS 2–5: FOUNDATION
  // Calibrated 2026-06-10 after assessment week. Phase-2 sessions are
  // labelled A/B/C/D to match the rotation model (see SESSION_LETTER
  // map below) — internal day keys (mon/tue/thu/sat) are preserved
  // for backward compatibility with logs from the calendar-driven era.
  // ────────────────────────────────────────────────────────
  {
    phase: 2, weeks: [2, 3, 4, 5], label: 'Phase 2 — Foundation (Weeks 2–5)',
    focus: 'Scap control, pain-free hanging build, push/pull balance, pistol + L-sit groundwork. Double progression: hit top reps on all sets → progress.',
    days: [
      {
        key: 'mon', label: 'A — Lower + Core', goal: 'Build squat strength and single-leg control.',
        exercises: [
          { id: 'goblet_squat', name: 'Goblet Squat', sets: 4, repsSpec: '×8–12', equipment: 'DB/KB', category: 'squat', rest: '90 s', rir: '2–3', cues: 'Start 16–20 kg. Week 1 @10 kg was far too light. RIR 2–3.', progression: 'At 4×12 → heavier DB or barbell back squat' },
          { id: 'box_pistol', name: 'Box Pistol', sets: 3, repsSpec: '×6 / side', perSide: true, equipment: 'Box/Bench', category: 'skill', rest: '90 s', rir: '2', progression: 'Lower the box once all sets clean.', yellowSkip: true },
          { id: 'sl_glute_bridge', name: 'Single-Leg Glute Bridge', sets: 3, repsSpec: '×12 / side', perSide: true, equipment: 'BW', category: 'hinge', rest: '60 s', rir: '2', cues: '2 s pause at top.' },
          { id: 'hollow_rock', name: 'Hollow Rocks', sets: 3, repsSpec: '×12–15', equipment: 'BW', category: 'core', rest: '60 s', cues: 'Earned: held 3×45 s in assessment. Lower back stays pressed down.', regression: 'Hollow hold 20–30 s (id: hollow_hold)' },
          { id: 'reverse_lunge', name: 'Reverse Lunge (DB)', sets: 3, repsSpec: '×8 / side', perSide: true, equipment: 'DB', category: 'lunge', rest: '90 s', rir: '2', cues: 'Start 10 kg DBs.', yellowSkip: true },
        ],
      },
      {
        key: 'tue', label: 'B — Pull + Shoulder rehab', goal: 'Reduce pull-up assistance, build pain-free hang tolerance.',
        exercises: [
          { id: 'band_pullup', name: 'Band-Assisted Pull-Up', sets: 4, repsSpec: '×5–8', equipment: 'Band + Bar', category: 'pullup', rest: '2 min', rir: '2', progression: 'At 4×8 → slow 3 s eccentric, then less band stretch' },
          { id: 'inverted_row', name: 'Inverted Row', sets: 4, repsSpec: '×8–12', equipment: 'Barbell + Rack', category: 'row', rest: '90 s', rir: '2', progression: 'Lower bar → feet on box' },
          { id: 'scap_pull_supported', name: 'Scapular Pulls (feet supported)', sets: 2, repsSpec: '×5', equipment: 'Bar + Box', category: 'pullup', rest: '60 s', painFreeOnly: true, cues: 'REGRESSED: pain in week 1. Maximum foot support, partial ROM, only at pain ≤2/10 — otherwise do band scap depressions instead.', progression: 'Less foot support ONLY at pain ≤ 2/10' },
          { id: 'dead_hang_supported', name: 'Dead Hang (feet supported)', sets: 3, repsSpec: '15–20 s', timed: true, equipment: 'Bar + Box', category: 'pullup', rest: '90 s', painFreeOnly: true, cues: 'Tolerated 3×15 s in week 1. Feet take load as needed. Stop above 2/10. This builds toward the ≥30 s hang gate for strict pull-ups.' },
          { id: 'single_arm_row', name: 'Single-Arm DB Row', sets: 3, repsSpec: '×10 / side', perSide: true, equipment: 'DB', category: 'row', rest: '90 s', rir: '2', leftFocus: true, cues: '16–20 kg — 10 kg was too light.', yellowSkip: true },
          ...REHAB_BLOCK,
        ],
      },
      {
        key: 'thu', label: 'C — Push + Core', goal: 'Press strength + dip volume, shoulder-safe lines only.',
        exercises: [
          { id: 'db_bench', name: 'Flat DB Bench Press', sets: 4, repsSpec: '×8–10', equipment: 'DB + Bench', category: 'bench', rest: '2 min', rir: '2', cues: 'Pick a weight where 10 reps = RIR 2 (~15–17.5 kg/hand to start).' },
          { id: 'dips', name: 'Dips', sets: 3, repsSpec: '×5–8', equipment: 'Bars', category: 'dip', rest: '2 min', rir: '2', painFreeOnly: true, cues: 'Depth only as pain-free. Build reps before depth. +1 rep per session while ≤2/10.', regression: 'Bench dips' },
          { id: 'pushup', name: 'Push-Up', sets: 3, repsSpec: '×8–15', equipment: 'BW', category: 'bench', rest: '90 s', rir: '2', progression: 'At 3×15 → feet elevated' },
          { id: 'landmine_press', name: 'Landmine Press', sets: 3, repsSpec: '×8 / side', perSide: true, equipment: 'Landmine', category: 'press', rest: '90 s', rir: '2', painFreeOnly: true, leftFocus: true, cues: 'Add 2.5–5 kg — bar-only ×15 was pain-free in week 1. Stop on any pain.', yellowSkip: true },
          { id: 'cg_floor_press', name: 'Close-Grip Floor Press (triceps)', sets: 3, repsSpec: '×10–12', equipment: 'Barbell', category: 'bench', rest: '90 s', rir: '2', cues: 'Shoulder-safe triceps line. REPLACES all overhead/behind-head extensions — those are banned (pain 2→4/10 in week 1).' },
          { id: 'dead_bug', name: 'Dead Bug', sets: 3, repsSpec: '×10 / side', perSide: true, equipment: 'BW', category: 'core', rest: '60 s' },
        ],
      },
      {
        key: 'sat', label: 'D — Hinge + Skills + Conditioning', goal: 'Posterior chain, L-sit build, engine work.',
        exercises: [
          { id: 'kb_swing', name: 'KB Swing', sets: 4, repsSpec: '×15', equipment: 'KB', category: 'hinge', rest: '90 s', rir: '2', cues: '16 kg if available — 10 kg too light for ballistic work.' },
          { id: 'db_rdl', name: 'DB/BB Romanian Deadlift', sets: 4, repsSpec: '×8–10', equipment: 'DB/Barbell', category: 'hinge', rest: '2 min', rir: '2', cues: 'Move to barbell RDL 40–50 kg.' },
          { id: 'tuck_lsit', name: 'Tuck L-Sit Hold', sets: 4, repsSpec: '10–15 s', timed: true, equipment: 'Dip bars', category: 'skill', rest: '90 s', cues: 'Strong in week 1 (4×20 s) — now flatten back, lift knees higher; quality over duration.', progression: 'At 4×15 s → flatten back, lift knees higher', yellowSkip: true },
          { id: 'side_plank', name: 'Side Plank', sets: 3, repsSpec: '25–30 s / side', perSide: true, timed: true, equipment: 'BW', category: 'core', rest: '60 s' },
          { id: 'mobility_block', name: 'Mobility: deep squat, thoracic, wrist prep', sets: 1, repsSpec: '8 min', timed: true, equipment: 'BW', category: 'mobility', rest: '—' },
          { id: 'dragon_flag', name: 'Dragon Flag (optional finisher)', sets: 2, repsSpec: '×5 slow', equipment: 'Bench', category: 'core', rest: '90 s', painFreeOnly: true, yellowSkip: true, cues: 'Only at shoulder ≤2/10. Slow eccentrics, no arch.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────
  // PHASE 3 — WEEKS 6–11: STRENGTH & SKILL
  // ────────────────────────────────────────────────────────
  {
    phase: 3, weeks: [6, 7, 8, 9, 10, 11], label: 'Phase 3 — Strength & Skill (Weeks 6–11)',
    focus: 'Heavier lower body, pull-up assistance to zero, dip loading, L-sit advanced tuck, pistol to low box. First strict pull-up attempts ~week 9–10 IF hang ≥ 30 s pain-free.',
    days: [
      {
        key: 'mon', label: 'Lower strength + pistol', goal: 'Heavier squat pattern, pistol depth.',
        exercises: [
          { id: 'bb_back_squat', name: 'Barbell Back Squat', sets: 4, repsSpec: '×6–8', equipment: 'Barbell + Rack', category: 'squat', rest: '2–3 min', rir: '2', cues: 'You have 2×15 kg plates — stay in 6–8 rep range, add tempo when bar maxed.', regression: 'Goblet squat', progression: '3 s pause squat when plates max out' },
          { id: 'box_pistol_low', name: 'Pistol to Low Box', sets: 4, repsSpec: '×5 / side', perSide: true, equipment: 'Low box', category: 'skill', rest: '90 s', rir: '2', progression: 'Assisted full pistol (hold rack upright)', yellowSkip: true },
          { id: 'sl_rdl', name: 'Single-Leg DB RDL', sets: 3, repsSpec: '×8 / side', perSide: true, equipment: 'DB', category: 'hinge', rest: '90 s', rir: '2' },
          { id: 'hollow_rocks', name: 'Hollow Rocks', sets: 3, repsSpec: '×10–15', equipment: 'BW', category: 'core', rest: '60 s' },
        ],
      },
      {
        key: 'tue', label: 'Pull-up build + rehab', goal: 'Assistance down, eccentrics in, row strength up.',
        exercises: [
          { id: 'band_pullup', name: 'Band Pull-Up (reducing assist)', sets: 5, repsSpec: '×5–8', equipment: 'Band + Bar', category: 'pullup', rest: '2 min', rir: '1–2', progression: 'Wk 9–10: test ONE strict rep if hang ≥ 30 s pain-free' },
          { id: 'pullup_eccentric', name: 'Pull-Up Eccentric (5 s down)', sets: 3, repsSpec: '×3–5', equipment: 'Bar + Box', category: 'pullup', rest: '2 min', painFreeOnly: true, cues: 'Jump to top from box, lower 5 s. Pain-free only.', yellowSkip: true },
          { id: 'inverted_row_elev', name: 'Inverted Row (feet elevated)', sets: 4, repsSpec: '×8–12', equipment: 'Barbell + Rack + Box', category: 'row', rest: '90 s', rir: '2' },
          { id: 'single_arm_row', name: 'Single-Arm DB Row (heavy)', sets: 4, repsSpec: '×8 / side', perSide: true, equipment: 'DB', category: 'row', rest: '90 s', rir: '2', leftFocus: true },
          ...REHAB_BLOCK,
        ],
      },
      {
        key: 'thu', label: 'Push strength + dip loading', goal: 'Heavier bench, dips toward weighted.',
        exercises: [
          { id: 'db_bench', name: 'Flat DB Bench Press (heavy)', sets: 4, repsSpec: '×6–8', equipment: 'DB + Bench', category: 'bench', rest: '2–3 min', rir: '2' },
          { id: 'dips', name: 'Dips', sets: 4, repsSpec: '×6–10', equipment: 'Bars', category: 'dip', rest: '2 min', rir: '2', painFreeOnly: true, progression: 'At 4×10 clean → add load (backpack/dip belt)' },
          { id: 'pushup_decline', name: 'Decline / Archer Push-Up', sets: 3, repsSpec: '×8–12', equipment: 'BW + Box', category: 'bench', rest: '90 s', rir: '2', yellowSkip: true },
          { id: 'landmine_press', name: 'Landmine Press', sets: 4, repsSpec: '×8 / side', perSide: true, equipment: 'Landmine', category: 'press', rest: '90 s', rir: '2', painFreeOnly: true, leftFocus: true },
          { id: 'band_antirotation', name: 'Band Anti-Rotation Press', sets: 3, repsSpec: '×10 / side', perSide: true, equipment: 'Band', category: 'core', rest: '60 s' },
        ],
      },
      {
        key: 'sat', label: 'Hinge + L-sit + engine', goal: 'Heavy hinge, advanced-tuck L-sit, conditioning.',
        exercises: [
          { id: 'bb_rdl', name: 'Barbell RDL', sets: 4, repsSpec: '×6–8', equipment: 'Barbell', category: 'hinge', rest: '2–3 min', rir: '2' },
          { id: 'kb_swing_heavy', name: 'KB Swing (heavier)', sets: 5, repsSpec: '×15', equipment: 'KB', category: 'hinge', rest: '90 s', rir: '2' },
          { id: 'adv_tuck_lsit', name: 'Advanced Tuck L-Sit', sets: 4, repsSpec: '10–15 s', timed: true, equipment: 'Dip bars', category: 'skill', rest: '90 s', progression: 'At 4×15 s → one leg extended', yellowSkip: true },
          { id: 'pistol_practice', name: 'Pistol Skill Practice', sets: 3, repsSpec: '×3–5 / side', perSide: true, equipment: 'BW/Rack assist', category: 'skill', rest: '90 s', cues: 'Quality only. Stop when form degrades.', yellowSkip: true },
          { id: 'conditioning_finisher', name: 'Finisher: KB swing intervals 20 s on / 40 s off', sets: 1, repsSpec: '6–8 min', timed: true, equipment: 'KB', category: 'conditioning', rest: '—', yellowSkip: true },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────
  // PHASE 4 — WEEKS 12–16: INTEGRATION & RETEST
  // Week 16 = deload + full retest.
  // ────────────────────────────────────────────────────────
  {
    phase: 4, weeks: [12, 13, 14, 15, 16], label: 'Phase 4 — Integration (Weeks 12–16)',
    focus: 'Strict pull-up clusters, weighted dips, full pistols, one-leg → full L-sit. Week 16: deload volume, retest all baselines.',
    days: [
      {
        key: 'mon', label: 'Lower strength + full pistol', goal: 'Consolidate squat strength, full pistol attempts.',
        exercises: [
          { id: 'bb_back_squat', name: 'Barbell Back Squat', sets: 5, repsSpec: '×5', equipment: 'Barbell + Rack', category: 'squat', rest: '2–3 min', rir: '2', progression: 'Pause reps / 1.5 reps when plates max out' },
          { id: 'full_pistol', name: 'Full Pistol (or lowest box)', sets: 5, repsSpec: '×3–5 / side', perSide: true, equipment: 'BW', category: 'skill', rest: '2 min', rir: '1–2', regression: 'Rack-assisted', yellowSkip: true },
          { id: 'sl_rdl', name: 'Single-Leg DB RDL', sets: 3, repsSpec: '×8 / side', perSide: true, equipment: 'DB', category: 'hinge', rest: '90 s', rir: '2' },
          { id: 'hollow_rocks', name: 'Hollow Rocks', sets: 3, repsSpec: '×15', equipment: 'BW', category: 'core', rest: '60 s' },
        ],
      },
      {
        key: 'tue', label: 'Strict pull-ups + rehab', goal: 'Strict reps in clusters, band back-off volume.',
        exercises: [
          {
            id: 'strict_pullup', name: 'Strict Pull-Up Clusters', sets: 5, repsSpec: '×2–5',
            equipment: 'Bar', category: 'pullup', rest: '2–3 min', rir: '1', painFreeOnly: true,
            cues: 'Quality singles/doubles beat sloppy fives.', regression: 'Band-assisted',
            // SAFETY GATE (H-03): Only attempt strict reps after demonstrating
            // capacity on the band pull-up. If the user has not hit the top of
            // the band-pullup rep range on both of their last two sessions,
            // swap to a band_pullup set instead and explain why in the UI.
            prerequisite: {
              kind: 'top_of_range_x2',
              sourceExerciseId: 'band_pullup',
              description: 'Hit top of band pull-up rep range in 2 consecutive sessions first',
              fallbackExerciseId: 'band_pullup',
            },
          },
          { id: 'band_pullup', name: 'Band Pull-Up (back-off)', sets: 2, repsSpec: '×8', equipment: 'Band + Bar', category: 'pullup', rest: '90 s', rir: '2' },
          { id: 'inverted_row_elev', name: 'Inverted Row (feet elevated)', sets: 4, repsSpec: '×10–12', equipment: 'Barbell + Rack + Box', category: 'row', rest: '90 s', rir: '2' },
          ...REHAB_BLOCK,
        ],
      },
      {
        key: 'thu', label: 'Weighted dips + press', goal: 'Load the dip, heavy bench, press integrity.',
        exercises: [
          { id: 'weighted_dips', name: 'Weighted Dips', sets: 5, repsSpec: '×5–8', equipment: 'Bars + backpack', category: 'dip', rest: '2–3 min', rir: '2', painFreeOnly: true, regression: 'Bodyweight dips' },
          { id: 'db_bench', name: 'Flat DB Bench Press', sets: 5, repsSpec: '×5–6', equipment: 'DB + Bench', category: 'bench', rest: '2–3 min', rir: '2' },
          { id: 'archer_pushup', name: 'Archer Push-Up', sets: 3, repsSpec: '×6–10 / side', perSide: true, equipment: 'BW', category: 'bench', rest: '90 s', rir: '2', yellowSkip: true },
          { id: 'landmine_press', name: 'Landmine Press', sets: 3, repsSpec: '×8 / side', perSide: true, equipment: 'Landmine', category: 'press', rest: '90 s', rir: '2', painFreeOnly: true, leftFocus: true },
        ],
      },
      {
        key: 'sat', label: 'Hinge + L-sit + retest (wk 16)', goal: 'Full L-sit attempts; week 16 = retest everything.',
        exercises: [
          { id: 'bb_rdl', name: 'Barbell RDL', sets: 4, repsSpec: '×6', equipment: 'Barbell', category: 'hinge', rest: '2–3 min', rir: '2' },
          { id: 'oneleg_lsit', name: 'One-Leg → Full L-Sit', sets: 5, repsSpec: '8–15 s', timed: true, equipment: 'Dip bars', category: 'skill', rest: '90 s', progression: 'Extend both legs as able', yellowSkip: true },
          { id: 'kb_swing_heavy', name: 'KB Swing', sets: 4, repsSpec: '×15', equipment: 'KB', category: 'hinge', rest: '90 s', rir: '2' },
          { id: 'side_plank', name: 'Side Plank (loaded)', sets: 3, repsSpec: '30 s / side', perSide: true, timed: true, equipment: 'BW/DB', category: 'core', rest: '60 s' },
          { id: 'wk16_retest', name: 'WEEK 16 ONLY — Retest: pull-ups, dips, L-sit, pistol, push-ups, hang', sets: 1, repsSpec: 'Replace session', equipment: '—', category: 'skill', rest: '—', cues: 'Deload week: do retests fresh instead of normal session.' },
        ],
      },
    ],
  },
];

export const getPhaseForWeek = (weekNum: number): ProgramPhase => {
  const p = PHASES.find((ph) => ph.weeks.includes(weekNum));
  return p ?? PHASES[PHASES.length - 1];
};
