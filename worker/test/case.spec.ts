import { describe, it, expect } from 'vitest';
import { toSnake, toCamel } from '../src/case';

describe('toSnake', () => {
  it.each([
    ['foodId', 'food_id'],
    ['bmi', 'bmi'],
    ['thighL', 'thigh_l'],
    ['smiKgM2', 'smi_kg_m2'],
    ['totalBodyWaterL', 'total_body_water_l'],
    ['isManualMacroEntry', 'is_manual_macro_entry'],
    ['recommendedCalorieIntakeKcal', 'recommended_calorie_intake_kcal'],
  ])('%s -> %s', (input, expected) => {
    expect(toSnake(input)).toBe(expected);
  });
});

describe('toCamel', () => {
  it.each([
    ['food_id', 'foodId'],
    ['bmi', 'bmi'],
    ['thigh_l', 'thighL'],
    ['smi_kg_m2', 'smiKgM2'],
    ['total_body_water_l', 'totalBodyWaterL'],
  ])('%s -> %s', (input, expected) => {
    expect(toCamel(input)).toBe(expected);
  });
});

describe('round trip', () => {
  it('is stable for every camelCase field we sync', () => {
    const fields = ['foodId', 'thighL', 'smiKgM2', 'totalBodyWaterL', 'isManualMacroEntry', 'bmi'];
    for (const field of fields) {
      expect(toCamel(toSnake(field))).toBe(field);
    }
  });
});
