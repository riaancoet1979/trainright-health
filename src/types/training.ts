// ============================================================
// TrainRight Health — training types
// ============================================================

export type DayKey = 'mon' | 'tue' | 'thu' | 'sat';
export type Readiness = 'green' | 'yellow' | 'red';

export type ExerciseCategory =
  | 'squat' | 'hinge' | 'lunge' | 'core' | 'row' | 'pullup'
  | 'bench' | 'dip' | 'press' | 'rehab' | 'skill' | 'mobility' | 'conditioning';

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
}

export interface ExerciseLog {
  sets: LoggedSet[];
  note?: string;
}

export interface SessionLog {
  dayKey: DayKey;
  weekNum: number;
  phase: number;
  readiness?: Readiness;
  shoulderPain?: number; // 0–10 on the day
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
