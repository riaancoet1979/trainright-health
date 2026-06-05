import { describe, it, expect, beforeEach } from 'vitest';
import { saveDailyEntry, addAchievement, getAchievements, exportFitnessData, resetAllFitnessData, getAllDailyEntries } from '../utils/storage';

beforeEach(() => {
  localStorage.clear();
});

describe('fitness storage helpers', () => {
  it('stores and retrieves achievements', () => {
    addAchievement({ id: 'a1', name: 'Test Badge', date: new Date().toISOString() });
    const items = getAchievements();
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('a1');
  });

  it('exports and resets fitness data', () => {
    const entry = {
      date: '2026-01-01',
      foodEntries: [],
      exercises: [],
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFats: 0,
      totalExerciseCalories: 0,
      netCalories: 0,
      fitness: { pushups: { sets: [{ reps: 20, timestamp: new Date().toISOString() }], totalReps: 20, setsCompleted: 1 }, steps: { steps: 3000, goal: 10000 } },
    };

    saveDailyEntry(entry as any);

    const exported = exportFitnessData();
    expect(exported).toContain('pushups');

    resetAllFitnessData();
    const all = getAllDailyEntries();
    expect(all['2026-01-01']!.fitness.pushups.totalReps).toBe(0);
    expect(all['2026-01-01']!.fitness.steps.steps).toBe(0);
  });
});
