import { describe, it, expect } from 'vitest';
import { format, subDays } from 'date-fns';
import {
  get7DaySeries,
  weeklyPushupCompletionRate,
  steps7DayAverage,
  getStreaks,
  getPersonalRecords,
} from '../utils/fitness';

import type { DailyEntry } from '../types';

const makeEntries = () => {
  const entries: Record<string, DailyEntry> = {};
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const d = subDays(today, i);
    const k = format(d, 'yyyy-MM-dd');
    entries[k] = {
      date: k,
      foodEntries: [],
      exercises: [],
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFats: 0,
      totalExerciseCalories: 0,
      netCalories: 0,
      fitness: {
        pushups: { sets: [], totalReps: i === 0 ? 120 : i === 1 ? 80 : i === 2 ? 100 : i === 3 ? 0 : 50, setsCompleted: 0 },
        steps: { steps: i * 1000, goal: 10000 },
      },
    } as DailyEntry;
  }

  return entries;
};

describe('fitness utils', () => {
  it('computes 7-day series correctly', () => {
    const entries = makeEntries();
    const series = get7DaySeries(entries, 'pushups');
    expect(series.values.length).toBe(7);
  });

  it('calculates weekly pushup completion rate', () => {
    const entries = makeEntries();
    // In the mock: one day 120 (met), one 100 (met) -> 2/7 -> ~29%
    const pct = weeklyPushupCompletionRate(entries, 100);
    expect(pct).toBeGreaterThanOrEqual(28);
    expect(pct).toBeLessThanOrEqual(31);
  });

  it('calculates steps 7-day average', () => {
    const entries = makeEntries();
    const avg = steps7DayAverage(entries);
    // steps: 0,1000,2000,3000,4000,5000,6000 => sum 21000 /7 = 3000
    expect(avg).toBe(3000);
  });

  it('computes streaks', () => {
    const entries = makeEntries();
    const pushupStreak = getStreaks(entries, 'pushups', 1);
    expect(pushupStreak.longest).toBeGreaterThanOrEqual(pushupStreak.current);
  });

  it('finds personal records', () => {
    const entries = makeEntries();
    const rec = getPersonalRecords(entries);
    expect(rec.bestPushups.reps).toBeGreaterThan(0);
    expect(rec.bestSteps.steps).toBeGreaterThan(0);
  });
});
