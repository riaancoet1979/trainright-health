import { beforeEach, describe, expect, it } from 'vitest';
import { addManualMealEntry, getDailyEntry } from '../utils/storage';

describe('manual meal macro entry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds one lunch entry from direct macro totals without a named food source', () => {
    addManualMealEntry('2026-06-24', {
      mealType: 'lunch',
      calories: 650,
      protein: 45,
      carbs: 70,
      fats: 18,
    });

    const day = getDailyEntry('2026-06-24');

    expect(day.foodEntries).toHaveLength(1);
    expect(day.foodEntries[0]).toMatchObject({
      foodId: 'manual-lunch-macros',
      foodName: 'Lunch totals',
      mealType: 'lunch',
      portion: 0,
      calories: 650,
      protein: 45,
      carbs: 70,
      fats: 18,
      servingType: 'manual',
      isManualMacroEntry: true,
    });
    expect(day.totalCalories).toBe(650);
    expect(day.totalProtein).toBe(45);
    expect(day.totalCarbs).toBe(70);
    expect(day.totalFats).toBe(18);
  });
});
