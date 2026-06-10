import { describe, it, expect, beforeEach } from 'vitest';
import {
  getWeekNum, getDayKeyForDate, getSessionForDate, adjustForReadiness,
  setProgramStartDate, importTrainRightBackup, getTrainingData,
  getTargetsForDate, TRAINING_KEY,
} from '../utils/training';
import { PHASES, getPhaseForWeek, DEFAULT_DAY_TYPE_TARGETS } from '../data/program';

beforeEach(() => {
  localStorage.clear();
});

describe('program data', () => {
  it('covers weeks 1–16 across 4 phases', () => {
    const weeks = PHASES.flatMap((p) => p.weeks);
    expect(weeks.sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it('every phase has all 4 training days', () => {
    for (const p of PHASES) {
      expect(p.days.map((d) => d.key).sort()).toEqual(['mon', 'sat', 'thu', 'tue']);
    }
  });

  it('contains no overhead pressing anywhere', () => {
    for (const p of PHASES) {
      for (const d of p.days) {
        for (const ex of d.exercises) {
          expect(ex.name.toLowerCase()).not.toContain('overhead');
          expect(ex.id).not.toContain('ohp');
        }
      }
    }
  });

  it('all hanging/dip/landmine work is flagged painFreeOnly where it loads the shoulder overhead or in support', () => {
    const mustBePainFree = ['scap_pull_supported', 'pullup_eccentric', 'strict_pullup', 'dips', 'weighted_dips', 'landmine_press', 'dead_hang_supported', 'dragon_flag'];
    for (const p of PHASES) {
      for (const d of p.days) {
        for (const ex of d.exercises) {
          if (mustBePainFree.includes(ex.id)) {
            expect(ex.painFreeOnly, `${ex.id} in phase ${p.phase}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('week calculation', () => {
  it('computes week number from a Monday start', () => {
    expect(getWeekNum('2026-06-08', '2026-06-08')).toBe(1);
    expect(getWeekNum('2026-06-14', '2026-06-08')).toBe(1); // Sunday same week
    expect(getWeekNum('2026-06-15', '2026-06-08')).toBe(2);
    expect(getWeekNum('2026-09-26', '2026-06-08')).toBe(16);
  });

  it('snaps a mid-week start date to that Monday', () => {
    // Start Wednesday 10 June → week 1 begins Monday 8 June
    expect(getWeekNum('2026-06-08', '2026-06-10')).toBe(1);
    expect(getWeekNum('2026-06-15', '2026-06-10')).toBe(2);
  });

  it('returns null before the program starts', () => {
    expect(getWeekNum('2026-06-01', '2026-06-08')).toBeNull();
  });

  it('maps weekdays to training days (Mon/Tue/Thu/Sat)', () => {
    expect(getDayKeyForDate('2026-06-08')).toBe('mon');
    expect(getDayKeyForDate('2026-06-09')).toBe('tue');
    expect(getDayKeyForDate('2026-06-10')).toBeNull(); // Wed
    expect(getDayKeyForDate('2026-06-11')).toBe('thu');
    expect(getDayKeyForDate('2026-06-12')).toBeNull(); // Fri
    expect(getDayKeyForDate('2026-06-13')).toBe('sat');
    expect(getDayKeyForDate('2026-06-14')).toBeNull(); // Sun
  });

  it('resolves sessions to the correct phase', () => {
    setProgramStartDate('2026-06-08');
    expect(getSessionForDate('2026-06-08')?.phase).toBe(1); // week 1
    expect(getSessionForDate('2026-06-16')?.phase).toBe(2); // week 2 Tue
    expect(getSessionForDate('2026-07-16')?.phase).toBe(3); // week 6 Thu
    expect(getSessionForDate('2026-09-26')?.phase).toBe(4); // week 16 Sat
    expect(getPhaseForWeek(11).phase).toBe(3);
  });
});

describe('readiness adjustment', () => {
  const phase2tue = PHASES[1].days.find((d) => d.key === 'tue')!;

  it('green keeps everything when pain ≤ 2', () => {
    const adj = adjustForReadiness(phase2tue.exercises, 'green', 0);
    expect(adj.every((e) => !e.skipped)).toBe(true);
    expect(adj[0].adjustedSets).toBe(adj[0].sets);
  });

  it('shoulder pain > 2 removes painFreeOnly exercises even on green', () => {
    const adj = adjustForReadiness(phase2tue.exercises, 'green', 7);
    const scap = adj.find((e) => e.id === 'scap_pull_supported')!;
    expect(scap.skipped).toBe(true);
    const band = adj.find((e) => e.id === 'band_pullup')!;
    expect(band.skipped).toBe(false);
  });

  it('yellow drops marked accessories and reduces sets (min 2)', () => {
    const adj = adjustForReadiness(phase2tue.exercises, 'yellow', 0);
    const row = adj.find((e) => e.id === 'single_arm_row')!;
    expect(row.skipped).toBe(true);
    const pullup = adj.find((e) => e.id === 'band_pullup')!;
    expect(pullup.adjustedSets).toBe(pullup.sets - 1);
    for (const e of adj.filter((x) => !x.skipped)) {
      expect(e.adjustedSets).toBeGreaterThanOrEqual(2);
    }
  });

  it('red skips everything', () => {
    const adj = adjustForReadiness(phase2tue.exercises, 'red', 0);
    expect(adj.every((e) => e.skipped)).toBe(true);
  });
});

describe('day-type nutrition targets', () => {
  it('returns training targets on training days, rest otherwise', () => {
    setProgramStartDate('2026-06-08');
    expect(getTargetsForDate('2026-06-08')).toEqual(DEFAULT_DAY_TYPE_TARGETS.training);
    expect(getTargetsForDate('2026-06-10')).toEqual(DEFAULT_DAY_TYPE_TARGETS.rest); // Wed
    expect(getTargetsForDate('2026-06-14')).toEqual(DEFAULT_DAY_TYPE_TARGETS.rest); // Sun
  });
});

describe('TrainRight legacy migration', () => {
  it('imports sessions with real data and skips empty phantom entries', () => {
    const legacy = {
      profile: { name: 'Riaan', age: 46, heightCm: 178 },
      bodyMetrics: [
        { date: '2026-05-01', weight: 83.5 },
        { date: '2026-05-08', weight: '82.9' },
        { date: '2026-05-15', weight: 0 }, // invalid → skipped
      ],
      logs: {
        '2026-05-04': {
          weekNum: 1, dayKey: 'mon', phase: 1, completed: true, notes: 'felt good',
          exercises: { goblet_squat: { sets: [{ weight: '16', reps: '10', done: true }] } },
        },
        '2026-05-06': { weekNum: 1, dayKey: 'wed', phase: 1, completed: false, notes: '', exercises: {} }, // phantom
      },
    };
    const r = importTrainRightBackup(JSON.stringify(legacy));
    expect(r.sessionsImported).toBe(1);
    expect(r.metricsImported).toBe(2);
    const d = getTrainingData();
    expect(d.logs['2026-05-04'].exercises['goblet_squat'].sets[0].weight).toBe('16');
    expect(d.logs['2026-05-06']).toBeUndefined();
    expect(d.bodyMetrics.map((m) => m.weight)).toEqual([83.5, 82.9]);
    expect(localStorage.getItem(TRAINING_KEY)).toBeTruthy();
  });
});
