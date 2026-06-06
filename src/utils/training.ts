// ============================================================
// TrainRight Health — training engine
// Storage, program-week calculation, readiness adjustment,
// day-type nutrition targets, legacy TrainRight migration.
// ============================================================

import { format } from 'date-fns';
import { saveBodyStatEntry, getBodyStats } from './storage';
import type {
  TrainingData, SessionLog, DayKey, Readiness, ProgramDay,
  ProgramExercise, MacroTargets, DayTypeTargets, BodyMetric, LoggedSet,
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

/** The scheduled session for a date, or null (rest day / before start / no start). */
export const getSessionForDate = (date: Date | string): ResolvedSession | null => {
  const weekNum = getWeekNum(date);
  if (weekNum === null) return null;
  const dayKey = getDayKeyForDate(date);
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

// ── Readiness adjustment ──
export interface AdjustedExercise extends ProgramExercise {
  adjustedSets: number;
  skipped: boolean;
  skipReason?: string;
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
interface LegacySet { weight?: string | number; reps?: string | number; done?: boolean }
interface LegacyExLog { sets?: LegacySet[] }
interface LegacyLog {
  weekNum?: number; dayKey?: string; phase?: number;
  completed?: boolean; notes?: string;
  exercises?: Record<string, LegacyExLog>;
}
interface LegacyData {
  profile?: unknown;
  bodyMetrics?: Array<{ date?: string; weight?: number | string; bfp?: number | string; waist?: number | string; chest?: number | string }>;
  logs?: Record<string, LegacyLog>;
}

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
        const sets: LoggedSet[] = (exLog.sets ?? []).map((s) => ({
          weight: String(s.weight ?? ''),
          reps: String(s.reps ?? ''),
          done: Boolean(s.done),
        }));
        if (sets.some((s) => s.done || s.weight !== '' || s.reps !== '')) {
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
      const w = typeof m.weight === 'string' ? parseFloat(m.weight) : m.weight;
      if (w === undefined || Number.isNaN(w) || w === 0) continue;
      if (!d.bodyMetrics.some((x) => x.date === m.date)) {
        d.bodyMetrics.push({
          date: m.date,
          weight: w,
          bfp: typeof m.bfp === 'string' ? parseFloat(m.bfp) || '' : m.bfp ?? '',
          waist: typeof m.waist === 'string' ? parseFloat(m.waist) || '' : m.waist ?? '',
          chest: typeof m.chest === 'string' ? parseFloat(m.chest) || '' : m.chest ?? '',
        });
        // Also write to the BodyStats component's store (trainright_body_stats)
        const existing = getBodyStats();
        if (!existing.some((e) => e.date === m.date)) {
          const bf = typeof m.bfp === 'string' ? parseFloat(m.bfp) : m.bfp;
          const ws = typeof m.waist === 'string' ? parseFloat(m.waist) : m.waist;
          const ch = typeof m.chest === 'string' ? parseFloat(m.chest) : m.chest;
          saveBodyStatEntry({
            id: `body-legacy-${m.date}-${Math.random().toString(36).slice(2, 6)}`,
            date: m.date,
            weight: w,
            ...(bf && !isNaN(bf) ? { bodyFat: bf } : {}),
            ...(ws && !isNaN(ws) ? { waist: ws } : {}),
            ...(ch && !isNaN(ch) ? { chest: ch } : {}),
          });
        }
        metricsImported++;
      }
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
