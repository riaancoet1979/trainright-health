// ============================================================
// TrainRight Health — training engine
// Storage, program-week calculation, readiness adjustment,
// day-type nutrition targets, legacy TrainRight migration.
// ============================================================

import { format } from 'date-fns';
import { saveBodyStatEntry, getBodyStats } from './storage';
import type { BodyStatEntry } from '../types';
import type {
  TrainingData, SessionLog, DayKey, Readiness, ProgramDay,
  ProgramExercise, MacroTargets, DayTypeTargets, BodyMetric, LoggedSet,
  RedFlagState, SessionLetter,
} from '../types/training';
import { PHASES, getPhaseForWeek, DEFAULT_DAY_TYPE_TARGETS } from '../data/program';
import { getUserSettings, saveUserSettings } from './storage';

export const TRAINING_KEY = 'health_training_v1';

const DAY_INDEX: Record<number, DayKey | null> = {
  0: null, // Sun
  1: 'mon',
  2: 'tue',
  3: null, // Wed rest
  4: 'thu',
  5: null, // Fri rest
  6: 'sat',
};

// ── Storage ──
export const getTrainingData = (): TrainingData => {
  try {
    const raw = localStorage.getItem(TRAINING_KEY);
    if (raw) return JSON.parse(raw) as TrainingData;
  } catch { /* fall through */ }
  return { programStartDate: null, logs: {}, bodyMetrics: [] };
};

export const saveTrainingData = (d: TrainingData): void => {
  localStorage.setItem(TRAINING_KEY, JSON.stringify(d));
};

export const setProgramStartDate = (isoDate: string): void => {
  const d = getTrainingData();
  d.programStartDate = isoDate;
  saveTrainingData(d);
};

// ── Program week / day resolution ──
export const dateKey = (date: Date | string): string =>
  typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');

/** Program week number (1-based) for a date; null if before start or no start set. */
export const getWeekNum = (date: Date | string, startDate?: string | null): number | null => {
  const start = startDate ?? getTrainingData().programStartDate;
  if (!start) return null;
  const d = new Date(dateKey(date) + 'T00:00:00');
  const s = new Date(start + 'T00:00:00');
  // Normalise start to the Monday of its week
  const dow = (s.getDay() + 6) % 7; // Mon=0
  s.setDate(s.getDate() - dow);
  const diffDays = Math.floor((d.getTime() - s.getTime()) / 86400000);
  if (diffDays < 0) return null;
  return Math.floor(diffDays / 7) + 1;
};

export const getDayKeyForDate = (date: Date | string): DayKey | null => {
  const d = new Date(dateKey(date) + 'T00:00:00');
  return DAY_INDEX[d.getDay()];
};

export interface ResolvedSession {
  weekNum: number;
  phase: number;
  phaseLabel: string;
  phaseFocus: string;
  day: ProgramDay;
  isPastProgram: boolean; // beyond week 16
}

export interface SessionResolveOpts {
  /**
   * When set, resolve the session using this day key instead of the date's
   * natural day-of-week. Lets the user run e.g. Monday's workout on a Sunday.
   */
  dayKeyOverride?: DayKey | null;
}

/** The scheduled session for a date, or null (rest day / before start / no start). */
export const getSessionForDate = (
  date: Date | string,
  opts?: SessionResolveOpts,
): ResolvedSession | null => {
  const weekNum = getWeekNum(date);
  if (weekNum === null) return null;
  const dayKey = opts?.dayKeyOverride ?? getDayKeyForDate(date);
  if (!dayKey) return null;
  const effectiveWeek = Math.min(weekNum, 16);
  const phase = getPhaseForWeek(effectiveWeek);
  const day = phase.days.find((d) => d.key === dayKey);
  if (!day) return null;
  return {
    weekNum,
    phase: phase.phase,
    phaseLabel: phase.label,
    phaseFocus: phase.focus,
    day,
    isPastProgram: weekNum > 16,
  };
};

export const isTrainingDay = (date: Date | string): boolean =>
  getSessionForDate(date) !== null;

// ── Rotation model (A/B/C/D regardless of weekday) ──────────────────────────
//
// From Phase 2 onward the user rotates through 4 sessions in order. The
// canonical DayKey storage stays the same so historical logs keep working —
// these helpers translate between the two views and suggest the next session
// based on what was *actually trained last*, ignoring the calendar weekday.

export const DAY_KEY_TO_LETTER: Record<DayKey, SessionLetter> = {
  mon: 'A',
  tue: 'B',
  thu: 'C',
  sat: 'D',
};

export const LETTER_TO_DAY_KEY: Record<SessionLetter, DayKey> = {
  A: 'mon',
  B: 'tue',
  C: 'thu',
  D: 'sat',
};

const ROTATION_ORDER: SessionLetter[] = ['A', 'B', 'C', 'D'];

/** The session letter actually trained on a log, honouring dayKeyOverride. */
const loggedLetter = (log: SessionLog): SessionLetter =>
  DAY_KEY_TO_LETTER[log.dayKeyOverride ?? log.dayKey];

/**
 * Suggest the next session to train in A->B->C->D rotation, based on the most
 * recent COMPLETED log strictly before `beforeDate`. If there is no completed
 * history, default to A (Lower + Core). After D, cycle back to A.
 */
export const getNextRotationDayKey = (beforeDate: Date | string): DayKey => {
  const td = getTrainingData();
  const before = dateKey(beforeDate);
  const completed = Object.entries(td.logs)
    .filter(([d, l]) => d < before && l.completed)
    .sort((a, b) => b[0].localeCompare(a[0])); // newest first
  if (completed.length === 0) return LETTER_TO_DAY_KEY.A;
  const lastLetter = loggedLetter(completed[0][1]);
  const idx = ROTATION_ORDER.indexOf(lastLetter);
  const nextLetter = ROTATION_ORDER[(idx + 1) % ROTATION_ORDER.length];
  return LETTER_TO_DAY_KEY[nextLetter];
};

export interface SpacingGuard {
  kind: 'consecutive_days' | 'push_pull_back_to_back' | 'high_weekly_volume';
  message: string;
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return format(d, 'yyyy-MM-dd');
};

/**
 * Coaching warnings (not hard blocks) for the spacing of the planned session
 * relative to recent history. Surfaces three patterns:
 *  - consecutive_days: about to log a third consecutive training day
 *  - push_pull_back_to_back: B (Pull) directly after C (Push) or vice versa
 *  - high_weekly_volume: would be the 5th completed session in the last 7 days
 */
export const getSpacingGuards = (
  date: Date | string,
  plannedDayKey: DayKey,
): SpacingGuard[] => {
  const td = getTrainingData();
  const today = dateKey(date);
  const out: SpacingGuard[] = [];

  const wasCompletedOn = (iso: string): SessionLog | undefined => {
    const l = td.logs[iso];
    return l && l.completed ? l : undefined;
  };

  // 1) Consecutive days: the two prior days were both completed sessions
  const d1 = wasCompletedOn(addDays(today, -1));
  const d2 = wasCompletedOn(addDays(today, -2));
  if (d1 && d2) {
    out.push({
      kind: 'consecutive_days',
      message: '3rd consecutive training day — consider resting today.',
    });
  }

  // 2) Pull (B) and Push (C) back-to-back on adjacent calendar days
  const plannedLetter = DAY_KEY_TO_LETTER[plannedDayKey];
  if (d1 && (plannedLetter === 'B' || plannedLetter === 'C')) {
    const prevLetter = loggedLetter(d1);
    const conflict =
      (plannedLetter === 'B' && prevLetter === 'C') ||
      (plannedLetter === 'C' && prevLetter === 'B');
    if (conflict) {
      out.push({
        kind: 'push_pull_back_to_back',
        message: 'Pull and Push back-to-back stresses the shoulder — insert a rest day or run A/D between.',
      });
    }
  }

  // 3) High weekly volume: 4 completed sessions in the last 7 days already
  let weekly = 0;
  for (let i = 1; i <= 7; i++) {
    if (wasCompletedOn(addDays(today, -i))) weekly++;
  }
  if (weekly >= 4) {
    out.push({
      kind: 'high_weekly_volume',
      message: `${weekly} sessions in the last 7 days — extra training is bonus volume, keep it light.`,
    });
  }

  return out;
};

// ── Red-flag enforcement (H-02) ──
/**
 * Return true when any acute red-flag symptom is set on the session log and the
 * user has not explicitly overridden with clinician guidance. The Train tab
 * uses this to force RED readiness regardless of the wearable suggestion.
 */
export const hasActiveRedFlag = (rf: RedFlagState | undefined): boolean => {
  if (!rf) return false;
  if (rf.clinicianOverride) return false;
  return Boolean(rf.chestPain || rf.dizziness || rf.breathlessness || rf.illness);
};

/** Apply red-flag override on top of the user's chosen readiness. */
export const effectiveReadiness = (
  picked: Readiness,
  redFlags: RedFlagState | undefined,
): Readiness => (hasActiveRedFlag(redFlags) ? 'red' : picked);

// ── Prerequisite evaluation (H-03) ──
const topOfRange = (repsSpec: string): number | null => {
  const m = repsSpec.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (m) return parseInt(m[2], 10);
  const single = repsSpec.match(/×\s*(\d+)/);
  if (single) return parseInt(single[1], 10);
  return null;
};

/**
 * Decide whether the user has met the prerequisite for an exercise. Looks at
 * the last 2 logged sessions of `sourceExerciseId` strictly before `beforeDate`
 * and returns true only if every set in both sessions is marked `done` AND
 * meets the top of the source exercise's rep range.
 *
 * Returns true when no prerequisite is defined (so existing exercises are
 * unaffected) and when the program does not contain the source exercise.
 */
export const meetsPrerequisite = (
  ex: ProgramExercise,
  beforeDate: Date | string,
): boolean => {
  if (!ex.prerequisite) return true;
  const td = getTrainingData();
  const before = dateKey(beforeDate);
  // Find the source exercise definition anywhere in the program — we need its
  // sets and repsSpec to know what "top of range" means.
  let sourceDef: ProgramExercise | undefined;
  for (const phase of PHASES) {
    for (const day of phase.days) {
      const found = day.exercises.find((e) => e.id === ex.prerequisite!.sourceExerciseId);
      if (found) { sourceDef = found; break; }
    }
    if (sourceDef) break;
  }
  if (!sourceDef) return true; // unknown source — fail open, don't block silently
  const requiredTop = topOfRange(sourceDef.repsSpec);
  if (requiredTop === null) return true;
  const requiredSets = sourceDef.sets;

  const candidates = Object.entries(td.logs)
    .filter(([d, l]) => d < before && l.exercises[ex.prerequisite!.sourceExerciseId])
    .sort((a, b) => b[0].localeCompare(a[0])) // newest first
    .slice(0, 2);
  if (candidates.length < 2) return false;
  return candidates.every(([, log]) => {
    const sets = log.exercises[ex.prerequisite!.sourceExerciseId].sets;
    const doneSets = sets.filter((s) => s.done);
    if (doneSets.length < requiredSets) return false;
    return doneSets.every((s) => {
      const reps = parseInt(s.reps, 10);
      return !Number.isNaN(reps) && reps >= requiredTop;
    });
  });
};

/** Find an exercise definition anywhere in the program by id. */
const findExerciseInProgram = (id: string): ProgramExercise | undefined => {
  for (const phase of PHASES) {
    for (const day of phase.days) {
      const ex = day.exercises.find((e) => e.id === id);
      if (ex) return ex;
    }
  }
  return undefined;
};

/**
 * Apply prerequisite gating: where unmet, swap the exercise for its fallback
 * regression and tag it with `prerequisiteUnmet` so the UI can explain why.
 */
export const applyPrerequisites = (
  exercises: ProgramExercise[],
  beforeDate: Date | string,
): Array<ProgramExercise & { prerequisiteUnmet?: string }> => exercises.map((ex) => {
  if (!ex.prerequisite || meetsPrerequisite(ex, beforeDate)) return ex;
  const fallback = findExerciseInProgram(ex.prerequisite.fallbackExerciseId);
  if (!fallback) return { ...ex, prerequisiteUnmet: ex.prerequisite.description };
  return { ...fallback, prerequisiteUnmet: ex.prerequisite.description };
});

// ── Readiness adjustment ──
export interface AdjustedExercise extends ProgramExercise {
  adjustedSets: number;
  skipped: boolean;
  skipReason?: string;
  prerequisiteUnmet?: string;
}

/**
 * Apply readiness + shoulder pain to the day's exercise list.
 * Green: as written. Yellow: drop accessories/skills marked yellowSkip, −1 set
 * on remaining (min 2). Red: everything skipped (rest / mobility only).
 * Shoulder pain > 2 also skips painFreeOnly exercises at any readiness.
 */
export const adjustForReadiness = (
  exercises: ProgramExercise[],
  readiness: Readiness,
  shoulderPain: number,
): AdjustedExercise[] => {
  return exercises.map((ex) => {
    let skipped = false;
    let skipReason: string | undefined;
    let adjustedSets = ex.sets;

    if (readiness === 'red') {
      skipped = true;
      skipReason = 'RED day — rest or gentle mobility only';
    } else {
      if (ex.painFreeOnly && shoulderPain > 2) {
        skipped = true;
        skipReason = `Shoulder ${shoulderPain}/10 — pain-free only (needs ≤ 2)`;
      }
      if (!skipped && readiness === 'yellow') {
        if (ex.yellowSkip) {
          skipped = true;
          skipReason = 'YELLOW day — accessory dropped';
        } else {
          adjustedSets = Math.max(2, ex.sets - 1);
        }
      }
    }
    return { ...ex, adjustedSets, skipped, skipReason };
  });
};

// ── Session logs ──
export const getSessionLog = (date: Date | string): SessionLog | null => {
  const d = getTrainingData();
  return d.logs[dateKey(date)] ?? null;
};

export const ensureSessionLog = (date: Date | string): SessionLog => {
  const d = getTrainingData();
  const key = dateKey(date);
  if (!d.logs[key]) {
    const sess = getSessionForDate(date);
    d.logs[key] = {
      dayKey: sess?.day.key ?? 'mon',
      weekNum: sess?.weekNum ?? 0,
      phase: sess?.phase ?? 0,
      completed: false,
      notes: '',
      exercises: {},
    };
    saveTrainingData(d);
  }
  return d.logs[key];
};

export const updateSessionLog = (
  date: Date | string,
  mutate: (log: SessionLog) => void,
): SessionLog => {
  const d = getTrainingData();
  const key = dateKey(date);
  if (!d.logs[key]) {
    const sess = getSessionForDate(date);
    d.logs[key] = {
      dayKey: sess?.day.key ?? 'mon',
      weekNum: sess?.weekNum ?? 0,
      phase: sess?.phase ?? 0,
      completed: false,
      notes: '',
      exercises: {},
    };
  }
  mutate(d.logs[key]);
  saveTrainingData(d);
  return d.logs[key];
};

/** Last logged sets for an exercise before a date — for placeholder prefills only. */
export const getLastExerciseLog = (
  exId: string,
  beforeDate: Date | string,
): { date: string; sets: LoggedSet[] } | null => {
  const d = getTrainingData();
  const before = dateKey(beforeDate);
  const dates = Object.keys(d.logs).filter((k) => k < before).sort().reverse();
  for (const k of dates) {
    const ex = d.logs[k].exercises[exId];
    if (ex && ex.sets.some((s) => s.done)) return { date: k, sets: ex.sets };
  }
  return null;
};

// ── Body metrics ──
export const addBodyMetric = (m: BodyMetric): void => {
  const d = getTrainingData();
  d.bodyMetrics = d.bodyMetrics.filter((x) => x.date !== m.date);
  d.bodyMetrics.push(m);
  d.bodyMetrics.sort((a, b) => a.date.localeCompare(b.date));
  saveTrainingData(d);
};

export const latestBodyweight = (): BodyMetric | null => {
  const d = getTrainingData();
  for (let i = d.bodyMetrics.length - 1; i >= 0; i--) {
    if (d.bodyMetrics[i].weight !== '') return d.bodyMetrics[i];
  }
  return null;
};

// ── Day-type nutrition targets ──
export const getDayTypeTargets = (): DayTypeTargets => {
  const s = getUserSettings() as ReturnType<typeof getUserSettings> & {
    dayTypeTargets?: DayTypeTargets;
  };
  return s.dayTypeTargets ?? DEFAULT_DAY_TYPE_TARGETS;
};

export const saveDayTypeTargets = (t: DayTypeTargets): void => {
  const s = getUserSettings() as ReturnType<typeof getUserSettings> & {
    dayTypeTargets?: DayTypeTargets;
  };
  s.dayTypeTargets = t;
  saveUserSettings(s);
};

/** Effective macro targets for a date: training-day vs rest-day. */
export const getTargetsForDate = (date: Date | string): MacroTargets => {
  const t = getDayTypeTargets();
  return isTrainingDay(date) ? t.training : t.rest;
};

// ── Legacy TrainRight (trainright_v1) migration ──
interface LegacySet {
  weight?: string | number;
  reps?: string | number;
  done?: boolean;
  // Per-side fields used by older TrainRight builds for asymmetric exercises
  // (single-arm row, dead bug, etc.). When present, we collapse them into the
  // canonical weight/reps/done by preferring the right side (typically the
  // dominant side) and falling back to the left.
  leftWeight?: string | number;
  leftReps?: string | number;
  leftDone?: boolean;
  rightWeight?: string | number;
  rightReps?: string | number;
  rightDone?: boolean;
}
interface LegacyExLog { sets?: LegacySet[] }
interface LegacyLog {
  weekNum?: number; dayKey?: string; phase?: number;
  completed?: boolean; notes?: string;
  exercises?: Record<string, LegacyExLog>;
}
interface LegacyBodyMetric {
  date?: string;
  weight?: number | string;
  bfp?: number | string;
  waist?: number | string;
  chest?: number | string;
  hips?: number | string;
  neck?: number | string;
  // Per-side circumferences in older backups
  leftArmCirc?: number | string;
  rightArmCirc?: number | string;
  // Tape measurements only in older backups
  thighL?: number | string;
  thighR?: number | string;
  shoulderWidth?: number | string;
}
interface LegacyData {
  profile?: unknown;
  bodyMetrics?: LegacyBodyMetric[];
  logs?: Record<string, LegacyLog>;
}

/** Parse a legacy value (number or numeric string) into a number, or undefined
 *  when the value is missing / empty / unparseable. Treats 0 as a real value. */
const toNum = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
};

export interface MigrationResult {
  sessionsImported: number;
  metricsImported: number;
}

/**
 * Import a JSON dump of the old TrainRight localStorage value (`trainright_v1`).
 * Sessions are stored under their original dates; body metrics merged.
 * The raw payload is also retained under legacyTrainRight.
 */
export const importTrainRightBackup = (json: string): MigrationResult => {
  const legacy = JSON.parse(json) as LegacyData;
  const d = getTrainingData();
  let sessionsImported = 0;
  let metricsImported = 0;

  if (legacy.logs) {
    for (const [date, log] of Object.entries(legacy.logs)) {
      const exercises: Record<string, { sets: LoggedSet[] }> = {};
      let hasData = false;
      for (const [exId, exLog] of Object.entries(log.exercises ?? {})) {
        const sets: LoggedSet[] = (exLog.sets ?? []).map((s) => {
          // Collapse per-side data into canonical fields. Prefer right side
          // (typically dominant); fall back to left. The original per-side
          // values are preserved as optional fields so a future UI pass can
          // render them without re-importing.
          const rightW = s.rightWeight ?? s.weight;
          const rightR = s.rightReps ?? s.reps;
          const rightD = s.rightDone ?? s.done;
          const canonWeight = String(rightW ?? s.leftWeight ?? '');
          const canonReps   = String(rightR ?? s.leftReps   ?? '');
          const canonDone   = Boolean(rightD ?? s.leftDone  ?? false);
          const out: LoggedSet = {
            weight: canonWeight,
            reps:   canonReps,
            done:   canonDone,
          };
          if (s.leftWeight !== undefined)  out.leftWeight  = String(s.leftWeight);
          if (s.leftReps   !== undefined)  out.leftReps    = String(s.leftReps);
          if (s.leftDone   !== undefined)  out.leftDone    = Boolean(s.leftDone);
          if (s.rightWeight !== undefined) out.rightWeight = String(s.rightWeight);
          if (s.rightReps   !== undefined) out.rightReps   = String(s.rightReps);
          if (s.rightDone   !== undefined) out.rightDone   = Boolean(s.rightDone);
          return out;
        });
        // A set counts as "has data" when it has any canonical OR per-side info
        const hasSetData = (s: LoggedSet) =>
          s.done || s.weight !== '' || s.reps !== '' ||
          s.leftDone || s.rightDone ||
          s.leftWeight !== undefined || s.rightWeight !== undefined ||
          s.leftReps !== undefined   || s.rightReps !== undefined;
        if (sets.some(hasSetData)) {
          exercises[exId] = { sets };
          hasData = true;
        }
      }
      if (!hasData && !log.completed && !(log.notes ?? '').trim()) continue;
      if (!d.logs[date]) {
        d.logs[date] = {
          dayKey: (['mon', 'tue', 'thu', 'sat'].includes(log.dayKey ?? '') ? log.dayKey : 'mon') as DayKey,
          weekNum: log.weekNum ?? 0,
          phase: log.phase ?? 0,
          completed: Boolean(log.completed),
          notes: log.notes ?? '',
          exercises,
        };
        sessionsImported++;
      }
    }
  }

  if (legacy.bodyMetrics) {
    for (const m of legacy.bodyMetrics) {
      if (!m.date) continue;
      const w = toNum(m.weight);
      // Older builds sometimes wrote weight=0 as a "no weight recorded" sentinel.
      // Preserve that skip rule (matches existing migration test) but also drop
      // entries that have neither weight nor any tape measurement.
      if (w === 0) continue;
      const anyMeasure = [m.bfp, m.waist, m.chest, m.hips, m.neck,
        m.leftArmCirc, m.rightArmCirc, m.thighL, m.thighR, m.shoulderWidth]
        .some((v) => toNum(v) !== undefined);
      if (w === undefined && !anyMeasure) continue;
      const existing = getBodyStats();
      const alreadyOnSameDate = d.bodyMetrics.some((x) => x.date === m.date);
      const alreadyInBodyStore = existing.some((e) => e.date === m.date);

      if (!alreadyOnSameDate) {
        // Internal training-store metric (only stores the older 4-field shape;
        // keep backwards compatible — extra fields live in body-stats store).
        d.bodyMetrics.push({
          date: m.date,
          weight: w ?? '',
          bfp: toNum(m.bfp) ?? '',
          waist: toNum(m.waist) ?? '',
          chest: toNum(m.chest) ?? '',
        });
      }
      // Always upsert the richer body-stats entry — captures every field this
      // backup format carries (arm circumferences, thighs, shoulder width).
      if (!alreadyInBodyStore) {
        const entry: BodyStatEntry = {
          id: `body-legacy-${m.date}-${Math.random().toString(36).slice(2, 6)}`,
          date: m.date,
        };
        const set = <K extends keyof BodyStatEntry>(k: K, v: number | undefined) => {
          if (v !== undefined) (entry as unknown as Record<string, unknown>)[k] = v;
        };
        set('weight',        w);
        set('bodyFat',       toNum(m.bfp));
        set('waist',         toNum(m.waist));
        set('chest',         toNum(m.chest));
        set('hips',          toNum(m.hips));
        set('neck',          toNum(m.neck));
        set('leftArm',       toNum(m.leftArmCirc));
        set('rightArm',      toNum(m.rightArmCirc));
        set('thighL',        toNum(m.thighL));
        set('thighR',        toNum(m.thighR));
        set('shoulderWidth', toNum(m.shoulderWidth));
        saveBodyStatEntry(entry);
      }
      if (!alreadyOnSameDate || !alreadyInBodyStore) metricsImported++;
    }
    d.bodyMetrics.sort((a, b) => a.date.localeCompare(b.date));
  }

  d.legacyTrainRight = legacy;
  saveTrainingData(d);
  return { sessionsImported, metricsImported };
};

// ── Full backup (every key this app uses) ──
const ALL_KEYS = [
  'nutrition_tracker_daily_entries',
  'nutrition_tracker_user_settings',
  'nutrition_tracker_custom_foods',
  'nutrition_tracker_achievements',
  'trainright_body_stats',
  TRAINING_KEY,
];

export const exportAllData = (): string => {
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), app: 'trainright-health' };
  for (const k of ALL_KEYS) {
    const raw = localStorage.getItem(k);
    out[k] = raw ? JSON.parse(raw) : null;
  }
  return JSON.stringify(out, null, 2);
};

/**
 * Import a full backup. Accepts either this app's exportAllData() format or a
 * raw dump of the old nutrition app's localStorage (same key names).
 */
export const importAllData = (json: string): string[] => {
  const data = JSON.parse(json) as Record<string, unknown>;
  const imported: string[] = [];
  for (const k of ALL_KEYS) {
    if (data[k] !== undefined && data[k] !== null) {
      localStorage.setItem(k, JSON.stringify(data[k]));
      imported.push(k);
    }
  }
  // Also accept a bare trainright_v1 dump nested in a full backup
  if (data['trainright_v1']) {
    importTrainRightBackup(JSON.stringify(data['trainright_v1']));
    imported.push('trainright_v1');
  }
  return imported;
};

export const PHASES_EXPORT = PHASES;
