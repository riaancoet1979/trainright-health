import { describe, it, expect, beforeEach } from 'vitest';
import {
  getWeekNum, getDayKeyForDate, getSessionForDate, adjustForReadiness,
  setProgramStartDate, importTrainRightBackup, getTrainingData,
  getTargetsForDate, TRAINING_KEY,
  getNextRotationDayKey, getSpacingGuards, updateSessionLog,
  DAY_KEY_TO_LETTER, LETTER_TO_DAY_KEY,
  getDayTypeForDate, isDayTypeOverridden, setDayTypeOverride,
} from '../utils/training';
import {
  PHASES, getPhaseForWeek, DEFAULT_DAY_TYPE_TARGETS, PROGRAM_WEEKS,
  RECOMMENDED_START, PROGRAM_FINISH,
} from '../data/program';
import type { ProgramExercise } from '../types/training';

beforeEach(() => {
  localStorage.clear();
});

describe('program data', () => {
  it('covers every week of the block exactly once, with no gaps', () => {
    const weeks = PHASES.flatMap((p) => p.weeks);
    expect(weeks.sort((a, b) => a - b))
      .toEqual(Array.from({ length: PROGRAM_WEEKS }, (_, i) => i + 1));
  });

  // The whole point of the 12-week restructure: the block is anchored to a
  // finish date, not to "16 weeks from whenever you press start". If the
  // recommended start and the week count ever drift apart, the block stops
  // landing in the first week of December and nobody notices until November.
  it('the recommended start puts the final week in the first week of December 2026', () => {
    const start = new Date(RECOMMENDED_START + 'T00:00:00');
    expect(start.getDay(), 'recommended start is a Monday').toBe(1);
    const finalMonday = new Date(start);
    finalMonday.setDate(finalMonday.getDate() + (PROGRAM_WEEKS - 1) * 7);
    expect(finalMonday.getMonth()).toBe(10);      // November — the week STARTS 30 Nov
    expect(finalMonday.getDate()).toBe(30);
    const finalSunday = new Date(finalMonday);
    finalSunday.setDate(finalSunday.getDate() + 6);
    expect(finalSunday.toISOString().slice(0, 10)).toBe(PROGRAM_FINISH);
    expect(finalSunday.getMonth()).toBe(11);      // December
    expect(finalSunday.getDate()).toBeLessThanOrEqual(7); // first week of it
  });

  it('runs exactly one mid-block deload and finishes on a deload & retest', () => {
    const deloads = PHASES.filter((p) => p.label.toLowerCase().includes('deload'));
    expect(deloads).toHaveLength(2);
    expect(deloads[deloads.length - 1].weeks).toEqual([PROGRAM_WEEKS]);
    expect(deloads[deloads.length - 1].label.toLowerCase()).toContain('retest');
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

  it('Block B adds one set per day and Block C two, skipping fixed-set lifts', () => {
    const blockA = PHASES.find((p) => p.label.startsWith('Block A'))!;
    const blockB = PHASES.find((p) => p.label.startsWith('Block B'))!;
    const blockC = PHASES.find((p) => p.label.startsWith('Block C'))!;
    for (const key of ['push', 'pull', 'legs', 'upper', 'lower'] as const) {
      const a = blockA.days.find((d) => d.key === key)!.exercises;
      const b = blockB.days.find((d) => d.key === key)!.exercises;
      const c = blockC.days.find((d) => d.key === key)!.exercises;
      const total = (xs: typeof a) => xs.reduce((n, x) => n + x.sets, 0);
      expect(total(b), `${key} gains exactly one set in Block B`).toBe(total(a) + 1);
      expect(total(c), `${key} gains exactly two sets in Block C`).toBe(total(a) + 2);
      // The increase lands on the leading ELIGIBLE exercises, in order.
      const eligible = a.map((x, i) => (x.fixedSets ? -1 : i)).filter((i) => i >= 0);
      expect(b[eligible[0]].sets).toBe(a[eligible[0]].sets + 1);
      expect(c[eligible[0]].sets).toBe(a[eligible[0]].sets + 1);
      expect(c[eligible[1]].sets).toBe(a[eligible[1]].sets + 1);
    }
  });

  // At a four-rep max with a shoulder that is only recently sound, cluster
  // COUNT is the prescription, not a volume dial — progression there is reps
  // (5×2 → 5×3 → 5×4). A block that quietly added a sixth cluster would be
  // adding shoulder load, not useful work.
  it('never adds a set to the pull-up clusters in any block', () => {
    for (const p of PHASES) {
      const pullup = p.days.find((d) => d.key === 'pull')!
        .exercises.find((e) => e.category === 'pullup')!;
      expect(pullup.sets, `pull-up sets in ${p.label}`)
        .toBe(p.label.toLowerCase().includes('deload') ? 2 : 5);
    }
  });

  // Twelve weeks buys fewer weeks of progression, so each block also steps
  // EFFORT. Without this the compressed block would just be the old one with
  // four weeks cut out of the middle.
  it('each working block trains one notch harder than the last', () => {
    const rank = ['2–3', '2', '1–2', '1', '0–1'];
    const blockA = PHASES.find((p) => p.label.startsWith('Block A'))!;
    const blockB = PHASES.find((p) => p.label.startsWith('Block B'))!;
    const blockC = PHASES.find((p) => p.label.startsWith('Block C'))!;
    let stepped = 0;
    for (const key of ['push', 'pull', 'legs', 'upper', 'lower'] as const) {
      const a = blockA.days.find((d) => d.key === key)!.exercises;
      const b = blockB.days.find((d) => d.key === key)!.exercises;
      const c = blockC.days.find((d) => d.key === key)!.exercises;
      a.forEach((ex, i) => {
        const ra = rank.indexOf(ex.rir ?? '');
        if (ra === -1) {
          // "never to failure" / "hard but upright" are prescriptions, not
          // ladder positions — they must survive the step untouched.
          expect(b[i].rir, `${ex.id} in Block B`).toBe(ex.rir);
          expect(c[i].rir, `${ex.id} in Block C`).toBe(ex.rir);
          return;
        }
        expect(rank.indexOf(b[i].rir ?? ''), `${ex.id} Block B not easier`)
          .toBeGreaterThanOrEqual(ra);
        expect(rank.indexOf(c[i].rir ?? ''), `${ex.id} Block C not easier than B`)
          .toBeGreaterThanOrEqual(rank.indexOf(b[i].rir ?? ''));
        if (rank.indexOf(c[i].rir ?? '') > ra) stepped++;
      });
    }
    expect(stepped, 'the peak block is harder than the base block').toBeGreaterThan(10);
  });

  // Training alone in a garage with no spotter. A block that steps effort must
  // never step a loaded barbell lift past 1 rep in reserve.
  it('never prescribes a heavy barbell lift below 1 rep in reserve', () => {
    const heavy = new Set(['squat', 'hinge', 'bench', 'press', 'row']);
    for (const p of PHASES) {
      for (const d of p.days) {
        for (const ex of d.exercises) {
          if (!heavy.has(ex.category)) continue;
          expect(ex.rir, `${ex.id} in ${p.label}`).not.toBe('0–1');
          expect(ex.rir, `${ex.id} in ${p.label}`).not.toBe('0');
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
    // The live block: Monday 14 Sep start → week 12 is the week of 30 Nov.
    expect(getWeekNum('2026-11-30', RECOMMENDED_START)).toBe(PROGRAM_WEEKS);
    expect(getWeekNum(PROGRAM_FINISH, RECOMMENDED_START)).toBe(PROGRAM_WEEKS);
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

  it('resolves sessions to the correct phase across the live block', () => {
    setProgramStartDate(RECOMMENDED_START);
    expect(getSessionForDate('2026-09-14')?.phase).toBe(1);  // week 1  — Block A
    expect(getSessionForDate('2026-10-12')?.phase).toBe(1);  // week 5  — Block A
    expect(getSessionForDate('2026-10-19')?.phase).toBe(2);  // week 6  — deload
    expect(getSessionForDate('2026-10-26')?.phase).toBe(3);  // week 7  — Block B
    expect(getSessionForDate('2026-11-09')?.phase).toBe(3);  // week 9  — Block B
    expect(getSessionForDate('2026-11-16')?.phase).toBe(4);  // week 10 — Block C
    expect(getSessionForDate('2026-11-30')?.phase).toBe(5);  // week 12 — deload & retest
    expect(getSessionForDate('2026-11-30')?.isPastProgram).toBe(false);
    expect(getPhaseForWeek(11).phase).toBe(4);
  });

  it('past the final week repeats the peak block, not the deload', () => {
    expect(getPhaseForWeek(99).label).toContain('Block C');
    setProgramStartDate(RECOMMENDED_START);
    // The week after the finish: still gives a session, flagged as past the block.
    expect(getSessionForDate('2026-12-07')?.isPastProgram).toBe(true);
    expect(getSessionForDate('2026-12-07')?.phaseLabel).toContain('Block C');
  });
});

describe('readiness adjustment', () => {
  // Exercised with synthetic exercises rather than programme data: the
  // adjustment engine still supports painFreeOnly / yellowSkip for future
  // programmes, but Garage Block 12 sets neither, so asserting against real
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

// ─────────────────────────────────────────────────────────────────
// Deload wording. The card used to append "leave 4–5 reps in the tank; this
// is recovery, not training" onto a cue that already said "load it
// seriously" — telling the user to go hard and recover in the same sentence.
// ─────────────────────────────────────────────────────────────────

describe('deload cues do not contradict the prescription', () => {
  const deloadPhases = PHASES.filter((p) => p.label.toLowerCase().includes('deload'));
  const workingPhases = PHASES.filter((p) => !p.label.toLowerCase().includes('deload'));

  // Phrases that tell the user to push. None may survive into a deload week.
  const INTENSITY = [
    'load it seriously', 'heaviest', 'take it close', 'push these hard',
    'brutal', 'five short sets',
  ];

  it('no deload cue contains push-hard language', () => {
    for (const p of deloadPhases) {
      for (const d of p.days) {
        for (const ex of d.exercises) {
          const cue = (ex.cues ?? '').toLowerCase();
          for (const phrase of INTENSITY) {
            expect(cue, `${ex.id} in ${p.label}`).not.toContain(phrase);
          }
        }
      }
    }
  });

  it('every deload cue states the deload prescription once', () => {
    for (const p of deloadPhases) {
      for (const d of p.days) {
        for (const ex of d.exercises) {
          expect(ex.cues, `${ex.id} in ${p.label}`).toContain('Deload');
          expect(ex.cues!.match(/Deload/g)!.length, `${ex.id} repeats it`).toBe(1);
        }
      }
    }
  });

  it('a deload cue never claims a set count that differs from the prescription', () => {
    for (const p of deloadPhases) {
      for (const d of p.days) {
        for (const ex of d.exercises) {
          expect(ex.sets).toBe(2);
          expect(ex.cues, `${ex.id} in ${p.label}`).not.toMatch(/\bfive\b|\bfour sets\b/i);
        }
      }
    }
  });

  it('working weeks still carry the emphasis, folded into the cue', () => {
    const blockA = workingPhases.find((p) => p.label.startsWith('Block A'))!;
    const row = blockA.days.find((d) => d.key === 'pull')!
      .exercises.find((e) => e.id === 'bb_row')!;
    expect(row.cues).toContain('Torso around 45°');          // technique
    expect(row.cues).toContain('load it seriously');          // emphasis
    expect(row.cues).not.toContain('Deload');
  });

  it('emphasis is folded in, never left as a separate field to render twice', () => {
    for (const p of PHASES) {
      for (const d of p.days) {
        for (const ex of d.exercises) {
          expect(ex.emphasis, `${ex.id} in ${p.label}`).toBeUndefined();
        }
      }
    }
  });
});
