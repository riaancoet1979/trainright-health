import { describe, it, expect, beforeEach } from 'vitest';
import { saveDailyEntry, addAchievement, getAchievements, exportFitnessData, resetAllFitnessData, getAllDailyEntries, exportAppBackup, importAppBackup } from '../utils/storage';

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

  it('restores full TrainRight app backups including nutrition, settings, custom foods, body stats, and training logs', () => {
    const backup = {
      exportedAt: '2026-06-28T15:14:30.923Z',
      app: 'trainright-health',
      nutrition_tracker_daily_entries: {
        '2026-06-28': {
          date: '2026-06-28',
          foodEntries: [],
          exercises: [],
          totalCalories: 123,
          totalProtein: 10,
          totalCarbs: 20,
          totalFats: 3,
          totalExerciseCalories: 0,
          netCalories: 123,
          fitness: { pushups: { sets: [], totalReps: 0, setsCompleted: 0 }, steps: { steps: 5000, goal: 5000 } },
        },
      },
      nutrition_tracker_user_settings: {
        targets: { dailyCalories: 2000, dailyProtein: 150, dailyCarbs: 200, dailyFats: 65 },
        theme: 'light',
        pushupReminders: { enabled: false, times: ['08:00'], weekend: true },
        restTimerSeconds: 120,
      },
      nutrition_tracker_custom_foods: [
        { id: 'custom-1', isCustom: true, name: '6 egg shake', servingType: 'weight', calories: 434, protein: 55, carbs: 14, fats: 16 },
      ],
      nutrition_tracker_achievements: null,
      trainright_body_stats: [{ id: 'body-1', date: '2026-06-01', weight: 81.5 }],
      health_training_v1: { logs: { '2026-06-28': { completed: true } }, bodyMetrics: [{ date: '2026-06-01', weight: 81.5 }] },
    };

    const result = importAppBackup(JSON.stringify(backup), 'replace');

    expect(result).toEqual({ success: true, count: 6, keys: [
      'nutrition_tracker_daily_entries',
      'nutrition_tracker_user_settings',
      'nutrition_tracker_custom_foods',
      'nutrition_tracker_achievements',
      'trainright_body_stats',
      'health_training_v1',
    ] });
    expect(JSON.parse(localStorage.getItem('nutrition_tracker_daily_entries')!)['2026-06-28'].totalCalories).toBe(123);
    expect(JSON.parse(localStorage.getItem('nutrition_tracker_custom_foods')!)).toHaveLength(1);
    expect(localStorage.getItem('nutrition_tracker_achievements')).toBeNull();
    expect(JSON.parse(localStorage.getItem('trainright_body_stats')!)[0].weight).toBe(81.5);
    expect(JSON.parse(localStorage.getItem('health_training_v1')!).logs['2026-06-28'].completed).toBe(true);
  });

  it('exports a full app backup with the app marker and tracked local storage keys', () => {
    localStorage.setItem('health_training_v1', JSON.stringify({ logs: { '2026-06-28': { completed: true } } }));
    localStorage.setItem('nutrition_tracker_custom_foods', JSON.stringify([{ id: 'custom-1', name: 'Shake', calories: 1, protein: 1, carbs: 1, fats: 1 }]));

    const exported = JSON.parse(exportAppBackup());

    expect(exported.app).toBe('trainright-health');
    expect(exported.exportedAt).toBeTruthy();
    expect(exported.health_training_v1.logs['2026-06-28'].completed).toBe(true);
    expect(exported.nutrition_tracker_custom_foods).toHaveLength(1);
  });
});
