// ============================================================
// TrainRight Health — Garage Block 12
// 12-week push/pull/legs/upper/lower hypertrophy block — 5 days/week
//
// CALENDAR-ANCHORED (2026-09-16). This block is not "16 weeks from
// whenever you press start" — it is built backwards from a fixed finish:
// the last week is the first week of December 2026. Starting Monday
// 14 September 2026 puts week 12 on the week of Monday 30 November and
// ends the block on Sunday 6 December.
//
// Losing four weeks against the old 16-week plan is paid for by
// compressing the progression rather than truncating it: the mid-block
// deload happens once instead of twice, the build and peak blocks are
// shorter, and each block now steps INTENSITY down the RIR ladder as
// well as adding sets. Peak volume is identical to the old week 13–15 —
// it is simply reached in week 10 instead of week 13.
//
//   Push  — chest, shoulders, triceps
//   Pull  — back, rear delts, biceps
//   Legs  — quad-led, calves, core
//   Upper — second dose, lighter and higher rep
//   Lower — hinge-led, unilateral, carries
//
// Every muscle is trained TWICE a week. That is the whole point of the
// split: the 2025 dose-response evidence says weekly SET VOLUME drives
// hypertrophy and frequency barely matters once volume is equated — but
// there is a per-session ceiling (~11 productive sets), so a muscle
// trained once a week is capped below its useful weekly dose.
//
// Equipment: adjustable bench, squat/bench rack, pull-up bar, barbell +
// plates, EZ bar + plates, dumbbells, 2 kettlebells.
//
// CONSTRAINTS (confirmed 2026-09-10):
//  - No dips anywhere. Triceps volume comes from EZ/DB extension lines.
//  - Pull-ups are bodyweight only and programmed as CLUSTERS, never to
//    failure inside a block. See PULLUP_NOTE.
//  - Unilateral work leads with the LEFT side; the right matches whatever
//    the left did cleanly, never more.
// ============================================================

import type {
  ProgramPhase, ProgramDay, ProgramExercise, DayTypeTargets, SessionKey,
} from '../types/training';

export const PROGRAM_NAME = 'Garage Block 12';

/**
 * Length of the block in weeks. Single source of truth — the week clamp in
 * the training engine and the phase-preview cards all read this instead of
 * hard-coding a number, which is how the old 16 ended up in five places.
 */
export const PROGRAM_WEEKS = 12;

/**
 * Monday the block is written to start on, so week 12 lands on the week of
 * Monday 30 November 2026 and the block closes on Sunday 6 December — the
 * first week of December, as asked. Used to prefill the start-date pickers;
 * a different start date still works, it just moves the finish.
 */
export const RECOMMENDED_START = '2026-09-14';
export const PROGRAM_FINISH = '2026-12-06';

export const SESSION_NOTE =
  'Five to ten minutes of general warm-up, then two ramp-up sets on the first heavy lift of the day.';

export const WARMUP = [
  'Cat-cow + thoracic rotations ×8',
  'Band pull-aparts ×15',
  'Band external rotation ×12 / side',
  'Scap push-up ×10',
  'Deep squat hold 30 s',
  'Two ramp-up sets on the first lift (50% and 75% of working weight)',
];

// ── Nutrition targets (confirmed 2026-09-10) ──
//
// Protein and fat are held IDENTICAL across both day types; carbs are the
// only lever. Protein protects lean mass in a deficit and fat holds hormones
// steady, so neither is what you cut on an easier day — 50 g of carbs is.
// That also makes the difference a single number to remember.
//
//   Training  190×4 + 180×4 + 69×9 = 760 + 720 + 621 = 2,101 kcal
//   Rest      190×4 + 130×4 + 69×9 = 760 + 520 + 621 = 1,901 kcal
export const DEFAULT_DAY_TYPE_TARGETS: DayTypeTargets = {
  training: { dailyCalories: 2101, dailyProtein: 190, dailyCarbs: 180, dailyFats: 69 },
  rest: { dailyCalories: 1901, dailyProtein: 190, dailyCarbs: 130, dailyFats: 69 },
};

/**
 * Lean-gain targets to switch to when body fat is ~15–16%. Same shape: protein
 * and fat unchanged from the recomp numbers, carbs carry the surplus.
 *   Training  190×4 + 255×4 + 69×9 = 2,401 kcal
 *   Rest      190×4 + 205×4 + 69×9 = 2,201 kcal
 */
export const LEAN_GAIN_TARGETS: DayTypeTargets = {
  training: { dailyCalories: 2401, dailyProtein: 190, dailyCarbs: 255, dailyFats: 69 },
  rest: { dailyCalories: 2201, dailyProtein: 190, dailyCarbs: 205, dailyFats: 69 },
};

/** The five sessions, in the order they are trained. */
export const SESSION_KEYS: SessionKey[] = ['push', 'pull', 'legs', 'upper', 'lower'];

// ════════════════════════════════════════════════════════════
// PROGRAMME NOTES — rendered in the app so the reasoning travels with
// the programme instead of living in a chat log.
// ════════════════════════════════════════════════════════════

export interface ProgramNote {
  id: string;
  title: string;
  body: string;
}

export const REST_RULE: ProgramNote = {
  id: 'rest',
  title: 'Rest long enough that the next set does not collapse — and not a second longer',
  body:
    'The 2024 Bayesian meta-analysis found no further hypertrophy benefit past 90 seconds; the ' +
    'only band that measurably underperforms is under a minute. Longer rests on the heavy ' +
    'compounds exist to protect your reps, not because rest itself builds anything. Isolation ' +
    'work gets 90 s, secondary compounds 2 min, heavy compounds 2–3 min. Ticking a set starts ' +
    'that exercise’s own rest timer.',
};

export const RIR_GUIDE: ProgramNote = {
  id: 'rir',
  title: 'RIR — reps in reserve',
  body:
    'How many more reps you could have done before failing. 2–3 RIR: working, bar still moving ' +
    'fast. 1–2 RIR: last rep slows noticeably, you would get one more, maybe. 0–1 RIR: last rep ' +
    'is a grind. 0 RIR is failure. Most people overestimate how many reps they have left — it ' +
    'sharpens after a few weeks. Never take a heavy barbell lift to failure while training alone.',
};

export const PROGRESSION_RULE: ProgramNote = {
  id: 'progression',
  title: 'Double progression',
  body:
    'Stay at the same weight until every set hits the TOP of its rep range at the target RIR. ' +
    'Then add weight and drop back to the bottom of the range: 2.5 kg on upper-body lifts, 5 kg ' +
    'on squats, RDLs and hip thrusts. Two sessions with no rep added is a stall, not a bad day — ' +
    'drop the load 10% and build back. If the same lift stalls twice in one block, swap it for ' +
    'its substitute rather than fighting it.',
};

export const EFFORT_RULE: ProgramNote = {
  id: 'effort',
  title: 'Rep range matters less than effort',
  body:
    'Anything from 5 to 30 reps builds muscle at roughly the same rate provided the set finishes ' +
    'close to failure. So pick the rep range by what is safe to load, and control intensity with ' +
    'RIR rather than the rep count. That is why heavy compounds sit at 5–8 and isolation work at ' +
    '12–25 — the loading differs, not the growth.',
};

export const PULLUP_NOTE: ProgramNote = {
  id: 'pullups',
  title: 'Pull-ups: four reps is a strength ceiling, not a volume tool',
  body:
    'At a four-rep max, sets to failure buy a lot of fatigue for very little total work — maybe ' +
    'twelve hard reps a session, every one under high shoulder load. Clusters solve this: five ' +
    'sets of two or three, each stopping well short of failure, gets the same reps at a fraction ' +
    'of the joint cost and adds reps faster because you practise the movement fresh every set. ' +
    'Never take a pull-up set to failure during a block. When 5×3 feels easy, go to 5×4. Retest ' +
    'a true max only in the deload weeks — 6 and 12. Barbell rows and chest-supported rows ' +
    'carry the back volume in the meantime.',
};

export const CALENDAR_NOTE: ProgramNote = {
  id: 'calendar',
  title: 'Twelve weeks, finishing the first week of December',
  body:
    'The block is anchored to a finish date rather than run open-ended. Start Monday ' +
    '14 September 2026 and week 12 is the week of Monday 30 November, closing on Sunday ' +
    '6 December. Four weeks shorter than a standard block means the progression is denser, ' +
    'not shorter: one mid-block deload instead of two, and every block steps both volume and ' +
    'effort — Block A at the prescribed reps in reserve, Block B one notch harder with an extra ' +
    'set, Block C one notch harder again with two. Heavy barbell lifts never go below 1 rep in ' +
    'reserve, whatever the block says, because you train alone.',
};

export const LOGGING_RULE: ProgramNote = {
  id: 'logging',
  title: 'Log weight × reps × RIR for every set',
  body:
    'Without last week’s numbers, double progression is guesswork — and guesswork is how five ' +
    'days a week turns into maintenance. The app shows last session’s sets under each exercise: ' +
    'beat them or match them, and write down why when you cannot.',
};

export const PROGRAM_NOTES: ProgramNote[] = [
  CALENDAR_NOTE, REST_RULE, RIR_GUIDE, PROGRESSION_RULE, EFFORT_RULE, PULLUP_NOTE, LOGGING_RULE,
];

/** Weekly set volume this split delivers, against the target range. */
export interface VolumeRow {
  muscle: string;
  direct: number;
  fractional: number;
  targetLow: number;
  targetHigh: number;
}

export const WEEKLY_VOLUME: VolumeRow[] = [
  { muscle: 'Back', direct: 17, fractional: 19, targetLow: 14, targetHigh: 20 },
  { muscle: 'Chest', direct: 13, fractional: 13, targetLow: 12, targetHigh: 16 },
  { muscle: 'Quads', direct: 12, fractional: 14, targetLow: 12, targetHigh: 16 },
  { muscle: 'Hams & glutes', direct: 10, fractional: 13, targetLow: 10, targetHigh: 14 },
  { muscle: 'Side delts', direct: 8, fractional: 12, targetLow: 10, targetHigh: 16 },
  { muscle: 'Calves', direct: 8, fractional: 8, targetLow: 8, targetHigh: 12 },
  { muscle: 'Triceps', direct: 7, fractional: 12, targetLow: 8, targetHigh: 14 },
  { muscle: 'Biceps', direct: 5, fractional: 11, targetLow: 8, targetHigh: 12 },
  { muscle: 'Rear delts', direct: 3, fractional: 7, targetLow: 6, targetHigh: 10 },
  { muscle: 'Core', direct: 5, fractional: 7, targetLow: 6, targetHigh: 10 },
];

export const VOLUME_NOTE =
  'Indirect sets count as half. A barbell row is a full set for back and half a set for biceps — ' +
  'that half-counting method predicted real-world growth better than any other in the 2025 ' +
  'dose-response analysis, which is why arms get no dedicated day here and still land in range.';

/** Swaps to reach for when a lift bothers a joint or stalls twice. */
export interface Swap { from: string; to: string }

export const SWAPS: Swap[] = [
  { from: 'Barbell Overhead Press', to: 'Seated dumbbell press, neutral grip, left arm leading.' },
  { from: 'Barbell Bench Press', to: 'Flat dumbbell press — the free path lets each shoulder find its own groove.' },
  { from: 'Dumbbell Pullover', to: 'Straight-arm kettlebell pullover with a shorter range, or drop it and add a set of rows.' },
  { from: 'Hanging Leg Raise', to: 'Lying leg raise or bench knee tuck — no hanging load on the shoulder.' },
  { from: 'Barbell Hip Thrust', to: 'Kettlebell swings, 4 × 15, or single-leg glute bridges off the bench.' },
  { from: 'Front Squat', to: 'Goblet squat with the heavier kettlebell, higher reps.' },
];

// ════════════════════════════════════════════════════════════
// THE FIVE SESSIONS
//
// Defined once, then derived per block with block-specific set counts.
// Hand-writing 30 near-identical day objects is how programmes drift out
// of sync with themselves.
// ════════════════════════════════════════════════════════════

type Ex = ProgramExercise;

const PUSH: Ex[] = [
  {
    id: 'bb_bench', name: 'Barbell Bench Press', sets: 4, repsSpec: '5–8',
    equipment: 'Barbell + rack', category: 'bench', rest: '2–3 min', restSeconds: 150, rir: '2–3',
    cues: 'Touch the same spot every rep and keep the elbows tucked to about 60°.',
    emphasis: 'Your heaviest press of the week.',
    progression: '+2.5 kg when all sets hit 8 at 2 RIR',
  },
  {
    id: 'bb_ohp', name: 'Barbell Overhead Press', sets: 3, repsSpec: '6–10',
    equipment: 'Barbell + rack', category: 'press', rest: '2–3 min', restSeconds: 150, rir: '2',
    cues: 'Out of the rack, standing. Never grind the last rep — if the bar slows badly, rack it and call the set.',
    regression: 'Seated DB press, neutral grip, left arm leading',
  },
  {
    id: 'incline_db_press', name: 'Incline Dumbbell Press', sets: 3, repsSpec: '8–12',
    equipment: 'Dumbbells + bench', category: 'bench', rest: '2 min', restSeconds: 120, rir: '1–2',
    leftFocus: true,
    cues: 'Bench at 30°. Left arm sets the pace — match the right to whatever the left can do cleanly.',
  },
  {
    id: 'db_lateral', name: 'Dumbbell Lateral Raise', sets: 4, repsSpec: '12–20',
    equipment: 'Dumbbells', category: 'isolation', rest: '90 s', restSeconds: 90, rir: '0–1',
    cues: 'Light and strict, no swing.',
    emphasis: 'This is where side-delt width comes from — pressing alone will not build it.',
  },
  {
    id: 'ez_skullcrusher', name: 'EZ-Bar Skullcrusher', sets: 3, repsSpec: '10–15',
    equipment: 'EZ bar + bench', category: 'isolation', rest: '90 s', restSeconds: 90, rir: '1',
    cues: 'Lower behind the forehead, not to it. Elbows stay pointed at the ceiling.',
  },
  {
    id: 'db_oh_ext', name: 'Dumbbell Overhead Triceps Extension', sets: 2, repsSpec: '12–20',
    equipment: 'Dumbbell + bench', category: 'isolation', rest: '90 s', restSeconds: 90, rir: '0–1',
    cues: 'Seated, one dumbbell in both hands. Full stretch at the bottom — that is the point of doing it overhead.',
  },
];

const PULL: Ex[] = [
  {
    id: 'pullup_cluster', name: 'Pull-up — clusters', sets: 5, repsSpec: '2–3',
    fixedSets: true,
    equipment: 'Pull-up bar', category: 'pullup', rest: '90 s', restSeconds: 90, rir: 'never to failure',
    cues: 'Dead-hang start, chin over the bar, controlled on the way down. Stop each set well short of failure.',
    emphasis: 'Five short sets beat four sets grinding to four — they add reps faster. Read the pull-up note below.',
    progression: 'When 5×3 feels easy, go to 5×4. Retest a true max only in deload weeks.',
  },
  {
    id: 'bb_row', name: 'Barbell Bent-Over Row', sets: 4, repsSpec: '6–10',
    equipment: 'Barbell', category: 'row', rest: '2–3 min', restSeconds: 150, rir: '2',
    cues: 'Torso around 45°, pull to the belly button.',
    emphasis: 'This is the main back builder — load it seriously.',
    progression: '+2.5 kg when all sets hit 10 at 2 RIR',
  },
  {
    id: 'sa_db_row', name: 'Single-Arm Dumbbell Row', sets: 3, repsSpec: '10–15 / side',
    perSide: true, leftFocus: true,
    equipment: 'Dumbbell + bench', category: 'row', rest: '2 min', restSeconds: 120, rir: '1',
    cues: 'Hand and knee on the bench. Left side first, and the right side gets the same reps — not more.',
  },
  {
    id: 'db_pullover', name: 'Dumbbell Pullover', sets: 2, repsSpec: '12–15',
    equipment: 'Dumbbell + bench', category: 'row', rest: '90 s', restSeconds: 90, rir: '1',
    cues: 'Lying across or along the bench. Go only as deep as the shoulder allows without pinching — depth is not the goal here.',
  },
  {
    id: 'rear_delt_flye', name: 'Rear-Delt Dumbbell Flye', sets: 3, repsSpec: '15–20',
    equipment: 'Dumbbells + bench', category: 'isolation', rest: '90 s', restSeconds: 90, rir: '0–1',
    cues: 'Chest down on the incline bench.',
    emphasis: 'Rear delts are the cheapest shoulder insurance in the programme — do not skip them.',
  },
  {
    id: 'ez_curl', name: 'EZ-Bar Curl', sets: 3, repsSpec: '8–12',
    equipment: 'EZ bar', category: 'isolation', rest: '90 s', restSeconds: 90, rir: '1',
    cues: 'Elbows pinned to the ribs. No swing — if the hips move, the weight is wrong.',
  },
];

const LEGS: Ex[] = [
  {
    id: 'back_squat', name: 'Back Squat', sets: 4, repsSpec: '5–8',
    equipment: 'Barbell + rack', category: 'squat', rest: '2–3 min', restSeconds: 180, rir: '2–3',
    cues: 'Safety pins set at your bottom position, every set, no exceptions when you are training alone.',
    progression: '+5 kg when all sets hit 8 at 2 RIR',
  },
  {
    id: 'rdl', name: 'Romanian Deadlift', sets: 3, repsSpec: '8–12',
    equipment: 'Barbell', category: 'hinge', rest: '2–3 min', restSeconds: 150, rir: '2',
    cues: 'Stop where the hamstring stretch runs out, not where the plates touch the floor.',
    progression: '+5 kg when all sets hit 12 at 2 RIR',
  },
  {
    id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', sets: 3, repsSpec: '8–12 / leg',
    perSide: true, leftFocus: true,
    equipment: 'Dumbbells + bench', category: 'lunge', rest: '90 s', restSeconds: 90, rir: '1–2',
    cues: 'Rear foot on the bench, dumbbells at your sides.',
    emphasis: 'Brutal, and the single best quad and glute builder you own without machines.',
  },
  {
    id: 'standing_calf_raise', name: 'Standing Barbell Calf Raise', sets: 4, repsSpec: '12–20',
    equipment: 'Barbell + rack', category: 'calf', rest: '90 s', restSeconds: 90, rir: '0–1',
    cues: 'Bar in the rack, toes on a plate for a deeper stretch. Two-second pause at the bottom.',
  },
  {
    id: 'hanging_leg_raise', name: 'Hanging Leg Raise', sets: 3, repsSpec: '10–15',
    equipment: 'Pull-up bar', category: 'core', rest: '90 s', restSeconds: 90, rir: '1',
    cues: 'If hanging bothers the shoulder, swap to a lying leg raise on the bench. Same job, no traction on the joint.',
    regression: 'Lying leg raise or bench knee tuck',
  },
];

const UPPER: Ex[] = [
  {
    id: 'incline_bb_press', name: 'Incline Barbell Press', sets: 4, repsSpec: '8–12',
    equipment: 'Barbell + rack + bench', category: 'bench', rest: '2 min', restSeconds: 120, rir: '2',
    cues: 'Bench at 30° in the rack.',
    emphasis: 'Higher reps than Push day by design — this is the second dose, not a repeat of it.',
  },
  {
    id: 'chest_supported_row', name: 'Chest-Supported Dumbbell Row', sets: 4, repsSpec: '10–15',
    equipment: 'Dumbbells + incline bench', category: 'row', rest: '2 min', restSeconds: 120, rir: '1',
    cues: 'Face-down on the incline bench.',
    emphasis: 'The chest support takes the lower back out of it entirely, so you can push these hard.',
  },
  {
    id: 'db_flye', name: 'Dumbbell Flye', sets: 2, repsSpec: '15–20',
    equipment: 'Dumbbells + bench', category: 'isolation', rest: '90 s', restSeconds: 90, rir: '0–1',
    cues: 'Slight incline, soft elbows, controlled. Go by stretch, not by depth.',
  },
  {
    id: 'db_lateral_light', name: 'Dumbbell Lateral Raise', sets: 4, repsSpec: '15–25',
    equipment: 'Dumbbells', category: 'isolation', rest: '90 s', restSeconds: 90, rir: '0–1',
    cues: 'Strict, no swing.',
    emphasis: 'Lighter than Push day, more reps — side delts recover fast and tolerate this frequency well.',
  },
  {
    id: 'db_hammer_curl', name: 'Dumbbell Hammer Curl', sets: 2, repsSpec: '10–15',
    equipment: 'Dumbbells', category: 'isolation', rest: '90 s', restSeconds: 90, rir: '1',
    cues: 'Neutral grip hits the brachialis, which is what actually pushes the bicep up.',
  },
  {
    id: 'ez_oh_ext', name: 'EZ-Bar Overhead Triceps Extension', sets: 2, repsSpec: '12–20',
    equipment: 'EZ bar + bench', category: 'isolation', rest: '90 s', restSeconds: 90, rir: '0–1',
    cues: 'Seated with back support.',
    emphasis: 'Last thing in the session — take it close.',
  },
];

const LOWER: Ex[] = [
  {
    id: 'front_squat', name: 'Front Squat', sets: 3, repsSpec: '6–10',
    equipment: 'Barbell + rack', category: 'squat', rest: '2–3 min', restSeconds: 150, rir: '2',
    cues: 'Cross-arm grip is fine.',
    emphasis: 'Different enough from Legs-day back squat to count as a second quad stimulus rather than a repeat.',
    regression: 'Goblet squat with the heavier kettlebell, higher reps',
  },
  {
    id: 'hip_thrust', name: 'Barbell Hip Thrust', sets: 4, repsSpec: '8–12',
    equipment: 'Barbell + bench', category: 'hinge', rest: '2 min', restSeconds: 120, rir: '1–2',
    cues: 'Shoulder blades on the bench edge, a folded towel under the bar. Pause a full second at the top of every rep.',
    regression: 'Kettlebell swings 4×15, or single-leg glute bridges off the bench',
  },
  {
    id: 'sl_rdl', name: 'Single-Leg Romanian Deadlift', sets: 3, repsSpec: '10–12 / leg',
    perSide: true, leftFocus: true,
    equipment: 'Kettlebell', category: 'hinge', rest: '90 s', restSeconds: 90, rir: '1–2',
    cues: 'Kettlebell in the opposite hand. Left leg leads. Balance is part of the exercise — do not chase load here.',
  },
  {
    id: 'goblet_walking_lunge', name: 'Kettlebell Goblet Walking Lunge', sets: 2, repsSpec: '10–12 / leg',
    perSide: true,
    equipment: 'Kettlebell', category: 'lunge', rest: '90 s', restSeconds: 90, rir: '1–2',
    cues: 'Short garage? Reverse lunges in place work just as well. Same reps either way.',
  },
  {
    id: 'sl_calf_raise', name: 'Single-Leg Dumbbell Calf Raise', sets: 4, repsSpec: '12–20 / leg',
    perSide: true,
    equipment: 'Dumbbell', category: 'calf', rest: '90 s', restSeconds: 90, rir: '0–1',
    cues: 'Toes on a plate, dumbbell in the same-side hand, free hand on the rack for balance.',
  },
  {
    id: 'suitcase_carry', name: 'Kettlebell Suitcase Carry', sets: 2, repsSpec: '40 m / side',
    perSide: true, timed: true,
    equipment: 'Kettlebell', category: 'core', rest: '90 s', restSeconds: 90, rir: 'hard but upright',
    cues: 'One kettlebell, ribs down, do not lean.',
    emphasis: 'Trains the obliques and the grip at once, and finishes the week honestly.',
  },
];

interface DaySpec {
  key: SessionKey;
  label: string;
  goal: string;
  exercises: Ex[];
}

const DAY_SPECS: DaySpec[] = [
  { key: 'push', label: 'Push', goal: 'Chest, shoulders and triceps — the heaviest pressing of the week.', exercises: PUSH },
  { key: 'pull', label: 'Pull', goal: 'Back, rear delts and biceps. Pull-ups as clusters; rows carry the volume.', exercises: PULL },
  { key: 'legs', label: 'Legs', goal: 'Quad-led, plus calves and core. Squat heavy, hinge second.', exercises: LEGS },
  { key: 'upper', label: 'Upper', goal: 'Second dose for the upper body — lighter, higher rep, not a repeat of Push.', exercises: UPPER },
  { key: 'lower', label: 'Lower + Core', goal: 'Hinge-led, unilateral work and carries. Posterior chain and single-leg control.', exercises: LOWER },
];

/**
 * The reps-in-reserve ladder, easiest first. Stepping an exercise down this
 * list is how a block gets HARDER without changing the exercise or the rep
 * range — which is the lever a 12-week block needs, because there is no
 * longer room to buy progression with weeks alone.
 */
const RIR_LADDER = ['2–3', '2', '1–2', '1', '0–1'] as const;

/**
 * Categories that never go below 1 rep in reserve, whatever the block steps
 * to. These are the loaded barbell lifts: grinding the last rep alone in a
 * garage with no spotter is how people get pinned under a bench.
 */
const HEAVY_CATEGORIES = new Set(['squat', 'hinge', 'bench', 'press', 'row']);

/** Shift a prescribed RIR `step` notches harder, respecting the floor. */
const stepRir = (ex: Ex, step: number): string | undefined => {
  if (step <= 0 || !ex.rir) return ex.rir;
  const i = RIR_LADDER.indexOf(ex.rir as typeof RIR_LADDER[number]);
  if (i === -1) return ex.rir; // "never to failure", "hard but upright" — untouched
  const floor = HEAVY_CATEGORIES.has(ex.category)
    ? RIR_LADDER.indexOf('1')
    : RIR_LADDER.length - 1;
  return RIR_LADDER[Math.min(i + step, floor)];
};

/**
 * Build the five days for a block.
 *  - `extraSets`: how many of the day's LEADING exercises gain a set
 *    (Block A = 0, Block B = 1, Block C = 2). Exercises marked `fixedSets`
 *    are skipped and the increase passes to the next one down, so Pull day
 *    puts its extra sets on the rows rather than stacking pull-up clusters.
 *  - `rirStep`: how many notches harder than prescribed this block trains.
 *  - `deload`: cap every exercise at 2 sets and rewrite the RIR guidance.
 */
const buildDays = (opts: { extraSets: number; rirStep?: number; deload?: boolean }): ProgramDay[] =>
  DAY_SPECS.map((spec) => ({
    key: spec.key,
    label: spec.label,
    goal: opts.deload
      ? `${spec.goal} Deload — 2 sets per exercise at ~60% of your last working load.`
      : spec.goal,
    exercises: ((): ProgramExercise[] => {
      let remaining = opts.deload ? 0 : opts.extraSets;
      return spec.exercises.map((ex): ProgramExercise => {
        const gainsASet = remaining > 0 && !ex.fixedSets;
        if (gainsASet) remaining -= 1;
        return {
          ...ex,
          sets: opts.deload ? 2 : ex.sets + (gainsASet ? 1 : 0),
          rir: opts.deload ? '4–5' : stepRir(ex, opts.rirStep ?? 0),
          // In a working week the technique cue and its emphasis read as one
          // line. In a DELOAD the emphasis is dropped entirely: "load it
          // seriously" or "your heaviest press of the week" directly
          // contradicts the 2-set, 4–5 RIR prescription printed immediately
          // above it, which is exactly how the card ended up telling you to go
          // hard and recover at once.
          cues: opts.deload
            ? [ex.cues, 'Deload — 2 sets at about 60% of your usual load, 4–5 reps left in the tank.']
                .filter(Boolean).join(' ')
            : [ex.cues, ex.emphasis].filter(Boolean).join(' '),
          emphasis: undefined,
        };
      });
    })(),
  }));

export const PHASES: ProgramPhase[] = [
  {
    phase: 1,
    weeks: [1, 2, 3, 4, 5],
    label: 'Block A — Accumulate (Weeks 1–5)',
    focus:
      'Weeks of 14 Sep – 12 Oct. Start at the bottom of every rep range and add one rep per set ' +
      'per week. Train at the reps in reserve printed on each exercise — this block is about ' +
      'building the loads you will push in Blocks B and C, so resist going early.',
    days: buildDays({ extraSets: 0 }),
  },
  {
    phase: 2,
    weeks: [6],
    label: 'Week 6 — Deload',
    focus:
      'Week of 19 Oct. Same exercises, 2 sets each, 60% of your week-5 loads, 4–5 reps in ' +
      'reserve. The only deload before the finish, so take it properly. Retest your max pull-up ' +
      'at the end of the week.',
    days: buildDays({ extraSets: 0, deload: true }),
  },
  {
    phase: 3,
    weeks: [7, 8, 9],
    label: 'Block B — Build (Weeks 7–9)',
    focus:
      'Weeks of 26 Oct – 9 Nov. One extra set on the first exercise of each day, and everything ' +
      'moves one notch harder — where Block A said 2–3 reps in reserve, this block says 2. ' +
      'Loads restart 5% below your week-5 top set and climb past it inside three weeks.',
    days: buildDays({ extraSets: 1, rirStep: 1 }),
  },
  {
    phase: 4,
    weeks: [10, 11],
    label: 'Block C — Peak (Weeks 10–11)',
    focus:
      'Weeks of 16 Nov – 23 Nov. Extra set on the second exercise too, and another notch of ' +
      'effort: isolation work finishes at 0–1 reps in reserve, heavy barbell lifts stop at 1 and ' +
      'go no further. Highest volume and highest effort of the block, and only two weeks of it — ' +
      'that is the trade for finishing in December.',
    days: buildDays({ extraSets: 2, rirStep: 2 }),
  },
  {
    phase: 5,
    weeks: [12],
    label: 'Week 12 — Deload & retest',
    focus:
      'Week of 30 Nov, finishing Sunday 6 December. Two sets per exercise at 60%. Then retest a ' +
      'heavy set of five on bench, squat and row, and your max pull-up. Those numbers are the ' +
      'starting loads for whatever comes after Christmas.',
    days: buildDays({ extraSets: 2, deload: true }),
  },
];

export const getPhaseForWeek = (weekNum: number): ProgramPhase => {
  const p = PHASES.find((ph) => ph.weeks.includes(weekNum));
  // Past the final week the block repeats from its peak phase, not the deload.
  return p ?? PHASES[PHASES.length - 2];
};
