// ============================================================
// TrainRight Health — training types
// ============================================================

export type DayKey = 'mon' | 'tue' | 'thu' | 'sat';
export type Readiness = 'green' | 'yellow' | 'red';

/**
 * Rotation-model session labels used from Phase 2 onward. A=Lower+Core,
 * B=Pull+Rehab, C=Push+Core, D=Hinge+Skills. The schedule rotates A->B->C->D
 * regardless of weekday — `DayKey` is preserved purely as a stable storage
 * key for legacy logs from the calendar-driven era.
 */
export type SessionLetter = 'A' | 'B' | 'C' | 'D';

export type ExerciseCategory =
  | 'squat' | 'hinge' | 'lunge' | 'core' | 'row' | 'pullup'
  | 'bench' | 'dip' | 'press' | 'rehab' | 'skill' | 'mobility' | 'conditioning';

/**
 * A prerequisite that must be true before the exercise is prescribed.
 *
 * Currently supported:
 *  - `top_of_range_x2`: the user must have hit the top of the rep range on every
 *    set of `sourceExerciseId` in the last 2 logged sessions of that exercise.
 *    Used to gate the strict pull-up behind enough completed band pull-up sets
 *    so the user only attempts strict reps after demonstrating capacity.
 */
export interface ExercisePrerequisite {
  kind: 'top_of_range_x2';
  /** ID of the prior exercise whose log will be inspected. */
  sourceExerciseId: string;
  /** Human-readable description shown in the UI when the prereq is unmet. */
  description: string;
  /** ID of the fallback exercise (defined in the same program) to use instead. */
  fallbackExerciseId: string;
}

export interface ProgramExercise {
  id: string;
  name: string;
  sets: number;
  /** Display spec, e.g. "8–10", "20–30 s", "×8 / side" */
  repsSpec: string;
  timed?: boolean;
  perSide?: boolean;
  equipment: string;
  category: ExerciseCategory;
  rest: string; // e.g. "90 s"
  rir?: string; // e.g. "2–3"
  cues?: string;
  regression?: string;
  progression?: string;
  /** Only perform if shoulder pain ≤ 2/10 on the day. */
  painFreeOnly?: boolean;
  /** Dropped when readiness is Yellow. */
  yellowSkip?: boolean;
  /** Extra left-side set to close the historical imbalance. */
  leftFocus?: boolean;
  /**
   * Hard prerequisite — if unmet, the exercise is auto-swapped for its
   * fallback regression and a banner explains why. Keeps users from attempting
   * strict skill work before the supporting capacity is in place.
   */
  prerequisite?: ExercisePrerequisite;
}

/** Acute red-flag symptoms collected on the Train tab. Any 'true' forces RED. */
export interface RedFlagState {
  chestPain?: boolean;
  dizziness?: boolean;
  breathlessness?: boolean;
  illness?: boolean;
  /** User has consulted a clinician and chosen to override the RED gate. */
  clinicianOverride?: boolean;
}

export interface ProgramDay {
  key: DayKey;
  label: string;
  goal: string;
  exercises: ProgramExercise[];
}

export interface ProgramPhase {
  phase: number;
  weeks: number[];
  label: string;
  focus: string;
  days: ProgramDay[];
}

export interface LoggedSet {
  weight: string; // free text — kg, band colour, "BW", box height
  reps: string;
  done: boolean;
  // ── Optional per-side fields (preserved from legacy TrainRight imports) ──
  // For per-side exercises (single-arm row, dead bug, etc.) the legacy format
  // recorded left/right separately. We keep those values around so future UI
  // work can render them; the canonical `weight` / `reps` / `done` above are
  // set from the right side (falling back to left) so existing consumers
  // (Coach progression detector, last-session display) keep working.
  leftWeight?: string;
  leftReps?: string;
  leftDone?: boolean;
  rightWeight?: string;
  rightReps?: string;
  rightDone?: boolean;
}

export interface ExerciseLog {
  sets: LoggedSet[];
  note?: string;
}

export interface SessionLog {
  dayKey: DayKey;
  /**
   * When the user manually picks a different day's workout for this date
   * (e.g. trains Monday's session on Sunday), this carries the chosen day key.
   * Engines and the UI treat it as the source of truth for "what was trained".
   * Optional + additive — undefined means "follow the natural day-of-week
   * schedule".
   */
  dayKeyOverride?: DayKey;
  weekNum: number;
  phase: number;
  readiness?: Readiness;
  shoulderPain?: number; // 0–10 on the day
  /**
   * Acute symptom screen collected at the top of the Train tab. Optional for
   * backward compatibility — undefined means "not asked", not "no symptoms".
   * When any flag is true (and clinicianOverride is false) the engine forces
   * readiness to RED regardless of the wearable suggestion or user picker.
   */
  redFlags?: RedFlagState;
  completed: boolean;
  notes: string;
  exercises: Record<string, ExerciseLog>;
}

export interface BodyMetric {
  date: string; // YYYY-MM-DD
  weight: number | '';
  bfp?: number | '';
  waist?: number | '';
  chest?: number | '';
}

export interface TrainingData {
  programStartDate: string | null; // YYYY-MM-DD (a Monday)
  logs: Record<string, SessionLog>; // keyed YYYY-MM-DD
  bodyMetrics: BodyMetric[];
  /** Raw legacy logs imported from the old TrainRight app, kept for history. */
  legacyTrainRight?: unknown;
}

export interface MacroTargets {
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFats: number;
}

export interface DayTypeTargets {
  training: MacroTargets;
  rest: MacroTargets;
}
