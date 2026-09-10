import { describe, it, expect, beforeEach } from 'vitest';
import {
  getWeekNum, getDayKeyForDate, getSessionForDate, adjustForReadiness,
  setProgramStartDate, importTrainRightBackup, getTrainingData,
  getTargetsForDate, TRAINING_KEY,
  getNextRotationDayKey, getSpacingGuards, updateSessionLog,
  DAY_KEY_TO_LETTER, LETTER_TO_DAY_KEY,
  getDayTypeForDate, isDayTypeOverridden, setDayTypeOverride,
} from '../utils/training';
import { PHASES, getPhaseForWeek, DEFAULT_DAY_TYPE_TARGETS } from '../data/program';
import type { ProgramExercise } from '../types/training';

beforeEach(() => {
  localStorage.clear();
});

describe('program data', () => {
  it('covers weeks 1–16 across its phases', () => {
    const weeks = PHASES.flatMap((p) => p.weeks);
    expect(weeks.sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it('every phase has all 5 sessions', () => {
    for (const p of PHASES) {
      expect(p.days.map((d) => d.key).sort())
        .toEqual(['legs', 'lower', 'pull', 'push', 'upper']);
    }
  });

  it('contains NO dips anywhere — the standing equipment constraint', () => {
    for (const p of PHASES) {
      for (const d of p.days) {
        for (const ex of d.exercises) {
          expect(ex.name.toLowerCase(), `${ex.id} in phase ${p.phase}`).not.toContain('dip');
          expect(ex.category, `${ex.id} in phase ${p.phase}`).not.toBe('dip');
        }
      }
    }
  });

  it('programmes pull-ups as clusters and never prescribes them to failure', () => {
    for (const p of PHASES) {
      const pull = p.days.find((d) => d.key === 'pull')!;
      const pullup = pull.exercises.find((e) => e.category === 'pullup');
      expect(pullup, `phase ${p.phase} has a pull-up`).toBeTruthy();
      // Deload weeks relax the RIR wording and cap every lift at 2 sets; a
      // block week must keep the cluster shape and the instruction.
      if (p.label.includes('Block')) {
        expect(pullup!.rir).toBe('never to failure');
        expect(pullup!.sets).toBeGreaterThanOrEqual(5); // clusters, not 3 hard sets
      }
    }
  });

  it('every exercise carries a machine-readable rest so the timer is per-exercise', () => {
    for (const p of PHASES) {
      for (const d of p.days) {
        for (const ex of d.exercises) {
          expect(typeof ex.restSeconds, `${ex.id} in phase ${p.phase}`).toBe('number');
          expect(ex.restSeconds!, `${ex.id} rest is at least 60 s`).toBeGreaterThanOrEqual(60);
        }
      }
    }
  });

  it('no isolation exercise rests longer than 120 s — nothing past 90 s adds growth there', () => {
    for (const p of PHASES) {
      for (const d of p.days) {
        for (const ex of d.exercises) {
          if (ex.category === 'isolation' || ex.category === 'calf') {
            expect(ex.restSeconds!, `${ex.id} in phase ${p.phase}`).toBeLessThanOrEqual(120);
          }
        }
      }
    }
  });

  it('deload weeks cap every exercise at 2 sets', () => {
    for (const p of PHASES.filter((x) => x.label.toLowerCase().includes('deload'))) {
      for (const d of p.days) {
        for (const ex of d.exercises) {
          expect(ex.sets, `${ex.id} in ${p.label}`).toBe(2);
        }
      }
    }
  });

  it('Block B adds a set to the first exercise, Block C to the first two', () => {
    const blockA = PHASES.find((p) => p.label.startsWith('Block A'))!;
    const blockB = PHASES.find((p) => p.label.startsWith('Block B'))!;
    const blockC = PHASES.find((p) => p.label.startsWith('Block C'))!;
    for (const key of ['push', 'pull', 'legs', 'upper', 'lower'] as const) {
      const a = blockA.days.find((d) => d.key === key)!.exercises;
      const b = blockB.days.find((d) => d.key === key)!.exercises;
      const c = blockC.days.find((d) => d.key === key)!.exercises;
      expect(b[0].sets, `${key} first exercise, Block B`).toBe(a[0].sets + 1);
      expect(b[1].sets, `${key} second exercise, Block B`).toBe(a[1].sets);
      expect(c[0].sets, `${key} first exercise, Block C`).toBe(a[0].sets + 1);
      expect(c[1].sets, `${key} second exercise, Block C`).toBe(a[1].sets + 1);
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

  it('maps weekdays to sessions — rest lands after Legs and after Lower', () => {
    expect(getDayKeyForDate('2026-06-08')).toBe('push');  // Mon
    expect(getDayKeyForDate('2026-06-09')).toBe('pull');  // Tue
    expect(getDayKeyForDate('2026-06-10')).toBe('legs');  // Wed
    expect(getDayKeyForDate('2026-06-11')).toBeNull();    // Thu — rest
    expect(getDayKeyForDate('2026-06-12')).toBe('upper'); // Fri
    expect(getDayKeyForDate('2026-06-13')).toBe('lower'); // Sat
    expect(getDayKeyForDate('2026-06-14')).toBeNull();    // Sun — rest
  });

  it('resolves sessions to the correct phase', () => {
    setProgramStartDate('2026-06-08');
    expect(getSessionForDate('2026-06-08')?.phase).toBe(1);  // week 1  — Block A
    expect(getSessionForDate('2026-07-15')?.phase).toBe(2);  // week 6  — deload
    expect(getSessionForDate('2026-07-22')?.phase).toBe(3);  // week 7  — Block B
    expect(getSessionForDate('2026-08-26')?.phase).toBe(4);  // week 12 — deload
    expect(getSessionForDate('2026-09-02')?.phase).toBe(5);  // week 13 — Block C
    expect(getSessionForDate('2026-09-23')?.phase).toBe(6);  // week 16 — deload
    expect(getPhaseForWeek(11).phase).toBe(3);
  });

  it('past week 16 repeats the peak block, not the deload', () => {
    expect(getPhaseForWeek(99).label).toContain('Block C');
  });
});

describe('readiness adjustment', () => {
  // Exercised with synthetic exercises rather than programme data: the
  // adjustment engine still supports painFreeOnly / yellowSkip for future
  // programmes, but Garage Block 16 sets neither, so asserting against real
  // days would pass vacuously and prove nothing.
  const ex = (over: Partial<ProgramExercise> & { id: string }): ProgramExercise => ({
    name: over.id, sets: 4, repsSpec: '8–12', equipment: 'Barbell',
    category: 'bench', rest: '2 min', restSeconds: 120, ...over,
  });
  const sample: ProgramExercise[] = [
    ex({ id: 'main' }),
    ex({ id: 'accessory', sets: 3, yellowSkip: true }),
    ex({ id: 'shoulder_sensitive', sets: 3, painFreeOnly: true }),
    ex({ id: 'small', sets: 2 }),
  ];

  it('green keeps everything when pain ≤ 2', () => {
    const adj = adjustForReadiness(sample, 'green', 0);
    expect(adj.every((e) => !e.skipped)).toBe(true);
    expect(adj[0].adjustedSets).toBe(adj[0].sets);
  });

  it('shoulder pain > 2 removes painFreeOnly exercises even on green', () => {
    const adj = adjustForReadiness(sample, 'green', 7);
    expect(adj.find((e) => e.id === 'shoulder_sensitive')!.skipped).toBe(true);
    expect(adj.find((e) => e.id === 'main')!.skipped).toBe(false);
  });

  it('yellow drops marked accessories and reduces sets (min 2)', () => {
    const adj = adjustForReadiness(sample, 'yellow', 0);
    expect(adj.find((e) => e.id === 'accessory')!.skipped).toBe(true);
    const main = adj.find((e) => e.id === 'main')!;
    expect(main.adjustedSets).toBe(main.sets - 1);
    for (const e of adj.filter((x) => !x.skipped)) {
      expect(e.adjustedSets).toBeGreaterThanOrEqual(2);
    }
  });

  it('red skips everything', () => {
    const adj = adjustForReadiness(sample, 'red', 0);
    expect(adj.every((e) => e.skipped)).toBe(true);
  });

  it('a real Garage Block session survives a yellow day with ≥2 sets everywhere', () => {
    const push = PHASES[0].days.find((d) => d.key === 'push')!;
    const adj = adjustForReadiness(push.exercises, 'yellow', 0);
    for (const e of adj.filter((x) => !x.skipped)) {
      expect(e.adjustedSets, e.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('day-type nutrition targets', () => {
  it('returns training targets on training days, rest otherwise', () => {
    setProgramStartDate('2026-06-08');
    expect(getTargetsForDate('2026-06-08')).toEqual(DEFAULT_DAY_TYPE_TARGETS.training); // Mon
    expect(getTargetsForDate('2026-06-10')).toEqual(DEFAULT_DAY_TYPE_TARGETS.training); // Wed
    expect(getTargetsForDate('2026-06-11')).toEqual(DEFAULT_DAY_TYPE_TARGETS.rest);     // Thu
    expect(getTargetsForDate('2026-06-14')).toEqual(DEFAULT_DAY_TYPE_TARGETS.rest);     // Sun
  });
});

describe('rotation model A/B/C/D/E', () => {
  it('DAY_KEY_TO_LETTER and LETTER_TO_DAY_KEY round-trip for the five sessions', () => {
    for (const k of ['push', 'pull', 'legs', 'upper', 'lower'] as const) {
      expect(LETTER_TO_DAY_KEY[DAY_KEY_TO_LETTER[k]]).toBe(k);
    }
  });

  it('maps every legacy day key to a letter so old logs never break the rotation', () => {
    // A missing letter used to make indexOf() return -1, which pinned the
    // suggestion to the first session forever after any pre-migration log.
    for (const k of ['mon', 'tue', 'thu', 'sat'] as const) {
      expect(DAY_KEY_TO_LETTER[k], k).toBeTruthy();
    }
  });

  it('defaults to Push when no history exists', () => {
    expect(getNextRotationDayKey('2026-06-15')).toBe('push');
  });

  it('rotates push → pull → legs → upper → lower → push', () => {
    setProgramStartDate('2026-06-08');
    const complete = (iso: string, dayKey: 'push' | 'pull' | 'legs' | 'upper' | 'lower') =>
      updateSessionLog(iso, (l) => { l.dayKey = dayKey; l.completed = true; });

    complete('2026-06-15', 'push');
    expect(getNextRotationDayKey('2026-06-16')).toBe('pull');

    complete('2026-06-16', 'pull');
    expect(getNextRotationDayKey('2026-06-17')).toBe('legs');

    complete('2026-06-17', 'legs');
    expect(getNextRotationDayKey('2026-06-19')).toBe('upper');

    complete('2026-06-19', 'upper');
    expect(getNextRotationDayKey('2026-06-20')).toBe('lower');

    complete('2026-06-20', 'lower');
    expect(getNextRotationDayKey('2026-06-22')).toBe('push'); // wraps
  });

  it('advances correctly from a legacy log (thu = old Push day → Pull next)', () => {
    setProgramStartDate('2026-06-08');
    updateSessionLog('2026-06-15', (l) => { l.dayKey = 'thu'; l.completed = true; });
    expect(getNextRotationDayKey('2026-06-16')).toBe('pull');
  });

  it('honours dayKeyOverride when deciding "what was last trained"', () => {
    setProgramStartDate('2026-06-08');
    updateSessionLog('2026-06-14', (l) => {
      l.dayKey = 'push';
      l.dayKeyOverride = 'push';
      l.completed = true;
    });
    expect(getNextRotationDayKey('2026-06-15')).toBe('pull');
  });

  it('ignores incomplete logs when picking the next session', () => {
    updateSessionLog('2026-06-15', (l) => { l.dayKey = 'pull'; l.completed = false; });
    expect(getNextRotationDayKey('2026-06-16')).toBe('push');
  });
});

describe('spacing guards', () => {
  it('returns no guards when there is no recent history', () => {
    expect(getSpacingGuards('2026-06-15', 'push')).toEqual([]);
  });

  it('does NOT warn on three consecutive days — that is the plan', () => {
    updateSessionLog('2026-06-13', (l) => { l.dayKey = 'push'; l.completed = true; });
    updateSessionLog('2026-06-14', (l) => { l.dayKey = 'pull'; l.completed = true; });
    const guards = getSpacingGuards('2026-06-15', 'legs');
    expect(guards.some((g) => g.kind === 'consecutive_days')).toBe(false);
  });

  it('warns on the fourth consecutive training day', () => {
    updateSessionLog('2026-06-12', (l) => { l.dayKey = 'push'; l.completed = true; });
    updateSessionLog('2026-06-13', (l) => { l.dayKey = 'pull'; l.completed = true; });
    updateSessionLog('2026-06-14', (l) => { l.dayKey = 'legs'; l.completed = true; });
    const guards = getSpacingGuards('2026-06-15', 'upper');
    expect(guards.some((g) => g.kind === 'consecutive_days')).toBe(true);
  });

  it('warns when Upper follows Push on adjacent days (shared pressing)', () => {
    updateSessionLog('2026-06-14', (l) => { l.dayKey = 'push'; l.completed = true; });
    const guards = getSpacingGuards('2026-06-15', 'upper');
    expect(guards.some((g) => g.kind === 'muscle_overlap')).toBe(true);
  });

  it('warns when Lower follows Legs on adjacent days (shared quads/hams)', () => {
    updateSessionLog('2026-06-14', (l) => { l.dayKey = 'legs'; l.completed = true; });
    const guards = getSpacingGuards('2026-06-15', 'lower');
    expect(guards.some((g) => g.kind === 'muscle_overlap')).toBe(true);
  });

  it('does NOT warn on Pull after Push — that pair is fine back-to-back', () => {
    updateSessionLog('2026-06-14', (l) => { l.dayKey = 'push'; l.completed = true; });
    const guards = getSpacingGuards('2026-06-15', 'pull');
    expect(guards.some((g) => g.kind === 'muscle_overlap')).toBe(false);
  });

  it('does not warn about weekly volume at four sessions — five is the programme', () => {
    for (let i = 1; i <= 4; i++) {
      const d = new Date('2026-06-15T00:00:00');
      d.setDate(d.getDate() - i);
      updateSessionLog(d.toISOString().slice(0, 10), (l) => { l.dayKey = 'push'; l.completed = true; });
    }
    const guards = getSpacingGuards('2026-06-15', 'pull');
    expect(guards.some((g) => g.kind === 'high_weekly_volume')).toBe(false);
  });

  it('warns when 5+ sessions were completed in the previous 7 days', () => {
    for (let i = 1; i <= 5; i++) {
      const d = new Date('2026-06-15T00:00:00');
      d.setDate(d.getDate() - i);
      updateSessionLog(d.toISOString().slice(0, 10), (l) => { l.dayKey = 'push'; l.completed = true; });
    }
    const guards = getSpacingGuards('2026-06-15', 'pull');
    expect(guards.some((g) => g.kind === 'high_weekly_volume')).toBe(true);
  });

  it('legacy logs still resolve in guards (back-compat)', () => {
    // 'thu' was the old Push day → overlaps with Upper.
    updateSessionLog('2026-06-14', (l) => { l.dayKey = 'thu'; l.completed = true; });
    const guards = getSpacingGuards('2026-06-15', 'upper');
    expect(guards.some((g) => g.kind === 'muscle_overlap')).toBe(true);
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

// ─────────────────────────────────────────────────────────────────
// Manual training / rest day choice
// ─────────────────────────────────────────────────────────────────

describe('day type and macro targets', () => {
  beforeEach(() => setProgramStartDate('2026-06-08'));

  it('training and rest differ by carbohydrate only', () => {
    const { training, rest } = DEFAULT_DAY_TYPE_TARGETS;
    expect(training.dailyProtein).toBe(rest.dailyProtein);
    expect(training.dailyFats).toBe(rest.dailyFats);
    expect(training.dailyCarbs - rest.dailyCarbs).toBe(50);
  });

  it('the stated calorie totals actually add up from the macros', () => {
    const kcal = (t: { dailyProtein: number; dailyCarbs: number; dailyFats: number }) =>
      t.dailyProtein * 4 + t.dailyCarbs * 4 + t.dailyFats * 9;
    expect(kcal(DEFAULT_DAY_TYPE_TARGETS.training))
      .toBe(DEFAULT_DAY_TYPE_TARGETS.training.dailyCalories);
    expect(kcal(DEFAULT_DAY_TYPE_TARGETS.rest))
      .toBe(DEFAULT_DAY_TYPE_TARGETS.rest.dailyCalories);
  });

  it('follows the schedule when nothing is overridden', () => {
    expect(getDayTypeForDate('2026-06-08')).toBe('training'); // Mon — Push
    expect(getDayTypeForDate('2026-06-11')).toBe('rest');     // Thu — rest
    expect(isDayTypeOverridden('2026-06-08')).toBe(false);
  });

  it('a manual rest day on a scheduled training day switches the targets', () => {
    setDayTypeOverride('2026-06-08', 'rest');
    expect(getDayTypeForDate('2026-06-08')).toBe('rest');
    expect(isDayTypeOverridden('2026-06-08')).toBe(true);
    expect(getTargetsForDate('2026-06-08')).toEqual(DEFAULT_DAY_TYPE_TARGETS.rest);
  });

  it('a manual training day on a scheduled rest day switches the targets', () => {
    setDayTypeOverride('2026-06-11', 'training'); // Thu
    expect(getDayTypeForDate('2026-06-11')).toBe('training');
    expect(getTargetsForDate('2026-06-11')).toEqual(DEFAULT_DAY_TYPE_TARGETS.training);
  });

  it('clearing the override returns the date to the schedule', () => {
    setDayTypeOverride('2026-06-08', 'rest');
    setDayTypeOverride('2026-06-08', null);
    expect(getDayTypeForDate('2026-06-08')).toBe('training');
    expect(isDayTypeOverridden('2026-06-08')).toBe(false);
  });

  it('the override is per date and does not leak to other days', () => {
    setDayTypeOverride('2026-06-08', 'rest');
    expect(getDayTypeForDate('2026-06-09')).toBe('training'); // Tue — Pull
    expect(isDayTypeOverridden('2026-06-09')).toBe(false);
  });

  it('the override survives alongside a logged session', () => {
    updateSessionLog('2026-06-08', (l) => { l.completed = true; l.notes = 'trained anyway'; });
    setDayTypeOverride('2026-06-08', 'rest');
    const log = getTrainingData().logs['2026-06-08'];
    expect(log.completed).toBe(true);
    expect(log.notes).toBe('trained anyway');
    expect(log.dayTypeOverride).toBe('rest');
  });
});
