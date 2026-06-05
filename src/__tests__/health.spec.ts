import { describe, it, expect, beforeEach } from 'vitest';
import { mergeGarminData, suggestReadiness, getHealthMetrics } from '../utils/health';
import { getDailyEntry } from '../utils/storage';

beforeEach(() => {
  localStorage.clear();
});

describe('mergeGarminData', () => {
  it('stores metrics and pushes steps into daily entries', () => {
    const n = mergeGarminData({
      source: 'garmin',
      syncedAt: '2026-06-05',
      days: {
        '2026-06-04': { steps: 6200, sleepHours: 7.2, rhr: 52, hrv: 48 },
        '2026-06-05': { steps: 3100, rhr: 54 },
      },
    });
    expect(n).toBe(2);
    expect(getHealthMetrics().days['2026-06-04'].sleepHours).toBe(7.2);
    expect(getDailyEntry('2026-06-04').fitness?.steps.steps).toBe(6200);
  });

  it('never lowers manually-logged steps', () => {
    const entry = getDailyEntry('2026-06-04');
    entry.fitness = { pushups: { sets: [], totalReps: 0, setsCompleted: 0 }, steps: { steps: 9000, goal: 5000 } };
    // save via merge of higher value first to persist, then try lower
    mergeGarminData({ days: { '2026-06-04': { steps: 9000 } } });
    mergeGarminData({ days: { '2026-06-04': { steps: 4000 } } });
    expect(getDailyEntry('2026-06-04').fitness?.steps.steps).toBe(9000);
  });
});

describe('suggestReadiness', () => {
  const baselineDays = () => {
    const days: Record<string, { rhr: number }> = {};
    for (let i = 1; i <= 10; i++) {
      const d = new Date('2026-06-05T00:00:00');
      d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = { rhr: 52 };
    }
    return days;
  };

  it('returns null with no data', () => {
    expect(suggestReadiness('2026-06-05')).toBeNull();
  });

  it('suggests green when sleep and RHR are normal', () => {
    mergeGarminData({ days: { ...baselineDays(), '2026-06-05': { sleepHours: 7.5, rhr: 53 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('green');
  });

  it('suggests yellow on short sleep', () => {
    mergeGarminData({ days: { ...baselineDays(), '2026-06-05': { sleepHours: 5.5, rhr: 53 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('yellow');
  });

  it('suggests yellow on elevated RHR (+5 vs baseline)', () => {
    mergeGarminData({ days: { ...baselineDays(), '2026-06-05': { sleepHours: 7.5, rhr: 58 } } });
    const s = suggestReadiness('2026-06-05');
    expect(s?.suggestion).toBe('yellow');
    expect(s?.rhrBaseline).toBe(52);
  });

  it('suggests red on very short sleep or big RHR spike', () => {
    mergeGarminData({ days: { ...baselineDays(), '2026-06-05': { sleepHours: 4.5, rhr: 53 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('red');
    localStorage.clear();
    mergeGarminData({ days: { ...baselineDays(), '2026-06-05': { sleepHours: 7.5, rhr: 63 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('red');
  });

  it('ignores RHR rule without enough baseline days', () => {
    mergeGarminData({ days: { '2026-06-05': { sleepHours: 7.5, rhr: 70 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('green');
  });
});
