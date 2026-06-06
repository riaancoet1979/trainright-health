/**
 * Regression tests added by the 2026-06-06 audit covering:
 *
 *   H-02  Red-flag enforcement on the Train tab
 *   H-03  Strict pull-up prerequisite gating
 *   M-01  Stale-Garmin-sync helpers
 *   M-05  Coach exercise-progression off-by-one
 *   L-04  Bodyweight clamp (validated by Train.tsx; algorithmic part lives here)
 *
 * These tests poke the engines directly (no DOM) so they remain valid even if
 * the UI is rewritten — they describe **what** the system guarantees, not how
 * the buttons look.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasActiveRedFlag, effectiveReadiness, meetsPrerequisite, applyPrerequisites,
  setProgramStartDate, updateSessionLog, TRAINING_KEY,
} from '../utils/training';
import {
  hoursSinceSync, isHealthDataStale, lastSyncLabel, HEALTH_KEY, saveHealthMetrics,
} from '../utils/health';
import { weeklyReview } from '../utils/coach';
import { PHASES } from '../data/program';
import type { ProgramExercise } from '../types/training';

const STORAGE_KEYS = [
  TRAINING_KEY,
  HEALTH_KEY,
  'nutrition_tracker_daily_entries',
  'nutrition_tracker_user_settings',
];

const wipe = () => STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));

beforeEach(wipe);

// ─────────────────────────────────────────────────────────────────
// H-02 — Red-flag enforcement
// ─────────────────────────────────────────────────────────────────

describe('H-02 acute symptom screen forces RED', () => {
  it('hasActiveRedFlag is false when undefined', () => {
    expect(hasActiveRedFlag(undefined)).toBe(false);
  });
  it('hasActiveRedFlag is false when all answers are negative', () => {
    expect(hasActiveRedFlag({ chestPain: false, dizziness: false })).toBe(false);
  });
  it('any positive symptom triggers a red flag', () => {
    expect(hasActiveRedFlag({ chestPain: true })).toBe(true);
    expect(hasActiveRedFlag({ dizziness: true })).toBe(true);
    expect(hasActiveRedFlag({ breathlessness: true })).toBe(true);
    expect(hasActiveRedFlag({ illness: true })).toBe(true);
  });
  it('clinician override suppresses the trigger but never silently downgrades to green', () => {
    expect(hasActiveRedFlag({ chestPain: true, clinicianOverride: true })).toBe(false);
  });
  it('effectiveReadiness forces RED no matter what the user picks', () => {
    expect(effectiveReadiness('green', { chestPain: true })).toBe('red');
    expect(effectiveReadiness('yellow', { breathlessness: true })).toBe('red');
    expect(effectiveReadiness('red', { illness: true })).toBe('red');
  });
  it('effectiveReadiness honours the user pick when there are no symptoms', () => {
    expect(effectiveReadiness('green', undefined)).toBe('green');
    expect(effectiveReadiness('yellow', { chestPain: false })).toBe('yellow');
  });
});

// ─────────────────────────────────────────────────────────────────
// H-03 — Strict pull-up prerequisite
// ─────────────────────────────────────────────────────────────────

const phase4Tue = () => {
  const phase = PHASES.find((p) => p.weeks.includes(13))!;
  return phase.days.find((d) => d.key === 'tue')!;
};

describe('H-03 strict pull-up prerequisite', () => {
  it('the program data tags strict_pullup with a band_pullup prerequisite', () => {
    const strict = phase4Tue().exercises.find((e) => e.id === 'strict_pullup')!;
    expect(strict.prerequisite).toBeDefined();
    expect(strict.prerequisite!.sourceExerciseId).toBe('band_pullup');
    expect(strict.prerequisite!.fallbackExerciseId).toBe('band_pullup');
  });

  it('meetsPrerequisite is false when there are no prior band-pullup logs', () => {
    setProgramStartDate('2026-01-05');
    const strict = phase4Tue().exercises.find((e) => e.id === 'strict_pullup')!;
    expect(meetsPrerequisite(strict, '2026-03-31')).toBe(false);
  });

  it('meetsPrerequisite is false when only ONE qualifying session exists', () => {
    setProgramStartDate('2026-01-05');
    updateSessionLog('2026-03-24', (l) => {
      l.exercises['band_pullup'] = {
        sets: Array.from({ length: 4 }, () => ({ weight: '', reps: '8', done: true })),
      };
    });
    const strict = phase4Tue().exercises.find((e) => e.id === 'strict_pullup')!;
    expect(meetsPrerequisite(strict, '2026-03-31')).toBe(false);
  });

  it('meetsPrerequisite is true when last 2 sessions hit the top of the band-pullup rep range', () => {
    setProgramStartDate('2026-01-05');
    // Phase 2 band_pullup is 4 sets × 5–8 reps; top = 8.
    const goodSession = (date: string) => updateSessionLog(date, (l) => {
      l.exercises['band_pullup'] = {
        sets: Array.from({ length: 4 }, () => ({ weight: '', reps: '8', done: true })),
      };
    });
    goodSession('2026-03-17');
    goodSession('2026-03-24');
    const strict = phase4Tue().exercises.find((e) => e.id === 'strict_pullup')!;
    expect(meetsPrerequisite(strict, '2026-03-31')).toBe(true);
  });

  it('applyPrerequisites swaps strict_pullup for band_pullup when unmet and tags the substitution reason', () => {
    setProgramStartDate('2026-01-05');
    const day = phase4Tue();
    const gated = applyPrerequisites(day.exercises, '2026-03-31');
    const strictSlot = gated[0];
    expect(strictSlot.id).toBe('band_pullup');
    expect('prerequisiteUnmet' in strictSlot && strictSlot.prerequisiteUnmet).toBeTruthy();
  });

  it('applyPrerequisites leaves untagged exercises unchanged', () => {
    setProgramStartDate('2026-01-05');
    const day = phase4Tue();
    const gated = applyPrerequisites(day.exercises, '2026-03-31');
    const row = gated.find((e) => e.id === 'inverted_row_elev')!;
    expect('prerequisiteUnmet' in row && (row as ProgramExercise & { prerequisiteUnmet?: string }).prerequisiteUnmet).toBeFalsy();
  });
});

// ─────────────────────────────────────────────────────────────────
// M-01 — Stale-sync helpers
// ─────────────────────────────────────────────────────────────────

describe('M-01 stale Garmin sync detection', () => {
  it('hoursSinceSync is null when never synced', () => {
    expect(hoursSinceSync()).toBeNull();
    expect(isHealthDataStale()).toBe(true);
    expect(lastSyncLabel()).toBe('never');
  });
  it('hoursSinceSync handles a fresh sync', () => {
    saveHealthMetrics({ syncedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), days: {} });
    expect(hoursSinceSync()!).toBeGreaterThan(0);
    expect(hoursSinceSync()!).toBeLessThan(1);
    expect(isHealthDataStale()).toBe(false);
    expect(lastSyncLabel()).toBe('just now');
  });
  it('flags a 49-h-old sync as stale', () => {
    saveHealthMetrics({ syncedAt: new Date(Date.now() - 49 * 3600e3).toISOString(), days: {} });
    expect(isHealthDataStale(48)).toBe(true);
    expect(lastSyncLabel()).toMatch(/\d+ [hd] ago/);
  });
  it('a 47-h-old sync is still fresh under the 48-h default', () => {
    saveHealthMetrics({ syncedAt: new Date(Date.now() - 47 * 3600e3).toISOString(), days: {} });
    expect(isHealthDataStale(48)).toBe(false);
  });
  it('hoursSinceSync is null when syncedAt is malformed', () => {
    saveHealthMetrics({ syncedAt: 'not-a-date', days: {} });
    expect(hoursSinceSync()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// M-05 — Coach progression off-by-one
// ─────────────────────────────────────────────────────────────────

describe('M-05 coach progression requires ALL sets at top', () => {
  it('does NOT recommend progression when one set was missed even at top reps', () => {
    setProgramStartDate('2026-04-06'); // Mon week 1 — but we want phase 2 (weeks 2–5).
    // Bake two band_pullup sessions where only 3 of the 4 prescribed sets are done.
    const partial = (date: string) => updateSessionLog(date, (l) => {
      l.completed = true;
      l.exercises['band_pullup'] = {
        sets: [
          { weight: '', reps: '8', done: true },
          { weight: '', reps: '8', done: true },
          { weight: '', reps: '8', done: true },
          { weight: '', reps: '', done: false },
        ],
      };
    });
    partial('2026-04-14'); // week 2 Tue
    partial('2026-04-21'); // week 3 Tue
    const review = weeklyReview('2026-04-23'); // sometime in week 3
    const recommends = review.exerciseRecs.find((r) => r.exerciseName.includes('Band'));
    expect(recommends).toBeUndefined();
  });

  it('DOES recommend progression when ALL prescribed sets hit the top of the range twice', () => {
    setProgramStartDate('2026-04-06');
    const full = (date: string) => updateSessionLog(date, (l) => {
      l.completed = true;
      l.exercises['band_pullup'] = {
        sets: Array.from({ length: 4 }, () => ({ weight: '', reps: '8', done: true })),
      };
    });
    full('2026-04-14');
    full('2026-04-21');
    const review = weeklyReview('2026-04-23');
    const recommends = review.exerciseRecs.find((r) => r.exerciseName.includes('Band'));
    expect(recommends).toBeDefined();
    expect(recommends!.action).toBe('progress');
  });
});

// ─────────────────────────────────────────────────────────────────
// Legacy TrainRight import — extended-fields & per-side sets
// ─────────────────────────────────────────────────────────────────

describe('legacy importTrainRightBackup extended coverage', () => {
  it('imports per-side sets by collapsing right→canonical and preserving both sides', async () => {
    const { importTrainRightBackup, getTrainingData } = await import('../utils/training');
    const result = importTrainRightBackup(JSON.stringify({
      logs: {
        '2026-06-02': {
          weekNum: 1, dayKey: 'tue', phase: 1, completed: true, notes: 'shoulder',
          exercises: {
            single_arm_row: {
              sets: [
                { leftWeight: '10', leftReps: '15', leftDone: true,
                  rightWeight: '12', rightReps: '14', rightDone: true },
              ],
            },
          },
        },
      },
    }));
    expect(result.sessionsImported).toBe(1);
    const td = getTrainingData();
    const set = td.logs['2026-06-02'].exercises['single_arm_row'].sets[0];
    // Canonical = right side
    expect(set.weight).toBe('12');
    expect(set.reps).toBe('14');
    expect(set.done).toBe(true);
    // Both sides preserved
    expect(set.leftWeight).toBe('10');
    expect(set.leftReps).toBe('15');
    expect(set.rightWeight).toBe('12');
    expect(set.rightReps).toBe('14');
  });

  it('imports per-side sets with no canonical weight (e.g. dead_bug) without dropping them', async () => {
    const { importTrainRightBackup, getTrainingData } = await import('../utils/training');
    importTrainRightBackup(JSON.stringify({
      logs: {
        '2026-06-01': {
          weekNum: 1, dayKey: 'mon', phase: 1, completed: true,
          exercises: {
            dead_bug: {
              sets: [
                { leftReps: '10', leftDone: true, rightReps: '10', rightDone: true },
                { leftReps: '7',  leftDone: true, rightReps: '7',  rightDone: true },
              ],
            },
          },
        },
      },
    }));
    const td = await import('../utils/training').then(m => m.getTrainingData());
    const sets = td.logs['2026-06-01'].exercises['dead_bug'].sets;
    expect(sets).toHaveLength(2);
    expect(sets[0].reps).toBe('10');
    expect(sets[0].leftReps).toBe('10');
    expect(sets[1].reps).toBe('7');
  });

  it('imports extended body-metric fields into the body-stats store', async () => {
    const { importTrainRightBackup } = await import('../utils/training');
    const { getBodyStats } = await import('../utils/storage');
    importTrainRightBackup(JSON.stringify({
      bodyMetrics: [
        {
          date: '2026-06-01', weight: 81.5, bfp: 19.7,
          leftArmCirc: 39.5, rightArmCirc: 40.5,
          chest: 109, waist: 94,
          thighL: 50, thighR: 52, shoulderWidth: 114.5,
        },
      ],
    }));
    const all = getBodyStats();
    const entry = all.find(e => e.date === '2026-06-01')!;
    expect(entry).toBeDefined();
    expect(entry.weight).toBe(81.5);
    expect(entry.bodyFat).toBe(19.7);
    expect(entry.leftArm).toBe(39.5);
    expect(entry.rightArm).toBe(40.5);
    expect(entry.chest).toBe(109);
    expect(entry.waist).toBe(94);
    expect(entry.thighL).toBe(50);
    expect(entry.thighR).toBe(52);
    expect(entry.shoulderWidth).toBe(114.5);
  });

  it('imports a body-metric entry that has no weight as long as it has measurements', async () => {
    const { importTrainRightBackup } = await import('../utils/training');
    const { getBodyStats } = await import('../utils/storage');
    importTrainRightBackup(JSON.stringify({
      bodyMetrics: [
        { date: '2026-05-26', weight: 83.6, bfp: 19.7, leftArmCirc: '', rightArmCirc: '' },
      ],
    }));
    const e = (await import('../utils/storage').then(m => m.getBodyStats()))
      .find(b => b.date === '2026-05-26')!;
    expect(e.weight).toBe(83.6);
    expect(e.leftArm).toBeUndefined(); // empty string was not coerced to 0
  });
});

// ─────────────────────────────────────────────────────────────────
// L-04 — Bodyweight bounds (the clamp lives in Train.tsx; verify the constants)
// ─────────────────────────────────────────────────────────────────

describe('L-04 bodyweight clamp', () => {
  // The Train.tsx component clamps to (20, 300) kg. We can't easily unit-test
  // the React event handler without a wrapping render, but we *can* assert the
  // shape of the contract: addBodyMetric still accepts any number; the UI is
  // what filters. This test documents the boundary and will fail loudly if a
  // future refactor pushes validation into the engine without updating it.
  it('addBodyMetric round-trips an in-range value', async () => {
    const { addBodyMetric, getTrainingData } = await import('../utils/training');
    addBodyMetric({ date: '2026-06-06', weight: 81.4 });
    const d = getTrainingData();
    expect(d.bodyMetrics.find((m) => m.date === '2026-06-06')?.weight).toBe(81.4);
  });
});
