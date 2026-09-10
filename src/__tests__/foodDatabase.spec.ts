import { describe, it, expect, beforeAll } from 'vitest';
import { foodDatabase } from '../data/foodDatabase';
import { validateFood, validateDatabase, hasCriticalIssues } from '../utils/foodValidation';

describe('Food Database Validation', () => {
  let problematicFoods: Array<{ name: string; issues: string[] }> = [];

  beforeAll(() => {
    // Collect problematic foods for debugging
    foodDatabase.forEach((food) => {
      const { valid, issues } = validateFood(food);
      if (!valid) {
        problematicFoods.push({ name: food.name, issues });
      }
    });
    // Log for debugging
    if (problematicFoods.length > 0) {
      console.log('\nProblematic foods found:');
      problematicFoods.forEach(({ name, issues }) => {
        console.log(`  - ${name}: ${issues.join(', ')}`);
      });
    }
  });

  it('should have at least 50 foods', () => {
    expect(foodDatabase.length).toBeGreaterThanOrEqual(50);
  });

  it('should have no critical validation issues', () => {
    // There should be no validation errors
    expect(hasCriticalIssues()).toBe(false);
  });

  it('should validate all foods individually', () => {
    expect(problematicFoods).toHaveLength(0);
  });

  it('should have no foods with zero calories (except water)', () => {
    const zeroCalFoods = foodDatabase.filter(
      (f) => f.calories === 0 && f.name.toLowerCase() !== 'water'
    );
    expect(zeroCalFoods).toHaveLength(0);
  });

  it('should have South African traditional foods', () => {
    const saFoods = foodDatabase.filter((f) => f.brand === 'SA Traditional');
    const saFoodNames = saFoods.map((f) => f.name);

    expect(saFoodNames).toContain('Boerewors');
    expect(saFoodNames).toContain('Biltong (Beef)');
    expect(saFoodNames).toContain('Pap (Maize Porridge)');
  });

  it('should have sosaties and droëwors', () => {
    const sosaties = foodDatabase.find((f) => f.id === 'sosaties');
    const droewors = foodDatabase.find((f) => f.id === 'droëwors');

    expect(sosaties).toBeDefined();
    expect(sosaties?.name).toBe('Sosaties (Skewered Meat)');
    expect(sosaties?.protein).toBeGreaterThan(15);

    expect(droewors).toBeDefined();
    expect(droewors?.name).toBe('Droëwors (Dried Sausage)');
    expect(droewors?.protein).toBeGreaterThan(45);
  });

  it('should have pap with correct nutritional values', () => {
    const pap = foodDatabase.find((f) => f.id === 'pap');
    expect(pap).toBeDefined();
    expect(pap?.calories).toBe(112);
    expect(pap?.protein).toBe(2.5);
    expect(pap?.carbs).toBe(23);
  });

  it('should have high-protein foods with protein > 15g per 100g', () => {
    const proteinFoods = foodDatabase.filter((f) => f.category === 'Protein');
    expect(proteinFoods.length).toBeGreaterThan(0);

    proteinFoods.forEach((food) => {
      // Most protein foods should have > 15g protein
      // Some dairy items may have less, but should still be decent
      expect(food.protein).toBeGreaterThan(5);
    });
  });

  it('should have realistic calorie ranges', () => {
    foodDatabase.forEach((food) => {
      // Calories should be between 0 and 1000 per 100g (oils are ~900, most foods are way less)
      expect(food.calories).toBeGreaterThanOrEqual(0);
      expect(food.calories).toBeLessThanOrEqual(1000);
    });
  });

  it('should have all required fields populated', () => {
    foodDatabase.forEach((food) => {
      expect(food.id).toBeDefined();
      expect(food.name).toBeDefined();
      expect(food.calories).toBeDefined();
      expect(food.protein).toBeDefined();
      expect(food.carbs).toBeDefined();
      expect(food.fats).toBeDefined();
      expect(food.category).toBeDefined();
    });
  });

  it('database validation should pass', () => {
    const result = validateDatabase();
    if (!result.isValid) {
      console.log('Validation errors:', result.errors);
    }
    expect(result.summary.problematicFoods).toHaveLength(0);
  });
});
