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
    // No description given — the entry keeps the generic label and carries no
    // description field at all rather than an empty string.
    expect(day.foodEntries[0].description).toBeUndefined();
  });

  it('records what the meal was and uses it as the entry name', () => {
    addManualMealEntry('2026-06-24', {
      mealType: 'dinner',
      description: 'Steak, sweet potato and green beans',
      calories: 720, protein: 55, carbs: 60, fats: 26,
    });

    const entry = getDailyEntry('2026-06-24').foodEntries[0];
    expect(entry.description).toBe('Steak, sweet potato and green beans');
    expect(entry.foodName).toBe('Steak, sweet potato and green beans');
    expect(entry.isManualMacroEntry).toBe(true);
    expect(entry.calories).toBe(720);
  });

  it('trims the description and ignores a blank one', () => {
    addManualMealEntry('2026-06-25', {
      mealType: 'breakfast',
      description: '   ',
      calories: 400, protein: 38, carbs: 30, fats: 14,
    });
    const blank = getDailyEntry('2026-06-25').foodEntries[0];
    expect(blank.description).toBeUndefined();
    expect(blank.foodName).toBe('Breakfast totals');

    addManualMealEntry('2026-06-26', {
      mealType: 'snack',
      description: '  Shake  ',
      calories: 300, protein: 38, carbs: 12, fats: 10,
    });
    const trimmed = getDailyEntry('2026-06-26').foodEntries[0];
    expect(trimmed.description).toBe('Shake');
  });

  it('caps a very long description rather than storing it unbounded', () => {
    addManualMealEntry('2026-06-27', {
      mealType: 'lunch',
      description: 'x'.repeat(500),
      calories: 500, protein: 40, carbs: 40, fats: 18,
    });
    const entry = getDailyEntry('2026-06-27').foodEntries[0];
    expect(entry.description).toHaveLength(200);
  });

  it('still totals correctly with several described meals on one day', () => {
    addManualMealEntry('2026-06-28', {
      mealType: 'breakfast', description: 'Shake and eggs',
      calories: 500, protein: 45, carbs: 20, fats: 25,
    });
    addManualMealEntry('2026-06-28', {
      mealType: 'dinner', description: 'Chicken, rice, broccoli',
      calories: 700, protein: 60, carbs: 70, fats: 18,
    });
    const day = getDailyEntry('2026-06-28');
    expect(day.foodEntries).toHaveLength(2);
    expect(day.totalCalories).toBe(1200);
    expect(day.totalProtein).toBe(105);
    expect(day.foodEntries.map((e) => e.description))
      .toEqual(['Shake and eggs', 'Chicken, rice, broccoli']);
  });
});
