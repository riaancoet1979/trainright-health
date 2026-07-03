import { describe, expect, it } from 'vitest';
import type { MealSplit } from '../types';
import {
  allocatePortions,
  buildMealPlans,
  remainingMacros,
  roundPortion,
  macrosForGrams,
  DEFAULT_MAX_GRAMS,
  type Macros,
  type PlannerFood,
} from '../utils/mealPlanner';

// Three "clean" synthetic foods whose macro→calorie relationships are internally
// consistent (protein/carb 4 kcal·g⁻¹, fat 9 kcal·g⁻¹) so a target can be hit exactly.
const PROTEIN: PlannerFood = { id: 'p', name: 'Protein', calories: 400, protein: 100, carbs: 0, fats: 0 };
const CARB: PlannerFood = { id: 'c', name: 'Carb', calories: 400, protein: 0, carbs: 100, fats: 0 };
const FAT: PlannerFood = { id: 'f', name: 'Fat', calories: 900, protein: 0, carbs: 0, fats: 100 };

const DEFAULT_SPLIT: MealSplit = { breakfast: 25, lunch: 25, dinner: 35, snack: 15 };

describe('allocatePortions', () => {
  it('hits the target when a matching combination of foods exists', () => {
    // 50 g protein + 80 g carbs + 20 g fat → 50*4 + 80*4 + 20*9 = 700 kcal.
    const target: Macros = { protein: 50, carbs: 80, fats: 20, calories: 700 };
    const { items, totals } = allocatePortions([PROTEIN, CARB, FAT], target);

    const grams = (id: string) => items.find((i) => i.food.id === id)?.grams ?? 0;
    expect(grams('p')).toBeCloseTo(50, 0);
    expect(grams('c')).toBeCloseTo(80, 0);
    expect(grams('f')).toBeCloseTo(20, 0);
    expect(totals.calories).toBeCloseTo(700, 0);
  });

  it('reports resulting macros and per-macro % of target', () => {
    const target: Macros = { protein: 50, carbs: 80, fats: 20, calories: 700 };
    const { pctOfTarget } = allocatePortions([PROTEIN, CARB, FAT], target);
    expect(pctOfTarget.protein).toBeCloseTo(100, 0);
    expect(pctOfTarget.carbs).toBeCloseTo(100, 0);
    expect(pctOfTarget.fats).toBeCloseTo(100, 0);
    expect(pctOfTarget.calories).toBeCloseTo(100, 0);
  });

  it('never allocates a negative portion, even when the target overshoots', () => {
    const target: Macros = { protein: 10, carbs: 5, fats: 2, calories: 78 };
    const { items } = allocatePortions([PROTEIN, CARB, FAT], target);
    items.forEach((i) => expect(i.grams).toBeGreaterThanOrEqual(0));
  });

  it('respects the default per-food cap (400 g)', () => {
    // Demand far more protein than one food can supply under the cap.
    const target: Macros = { protein: 1000, carbs: 0, fats: 0, calories: 4000 };
    const { items } = allocatePortions([PROTEIN], target);
    expect(items[0].grams).toBeLessThanOrEqual(DEFAULT_MAX_GRAMS);
    expect(items[0].grams).toBe(400); // pinned at the cap, rounded to 5 g
  });

  it('respects a custom per-food cap via opts.maxGrams', () => {
    const target: Macros = { protein: 1000, carbs: 0, fats: 0, calories: 4000 };
    const { items } = allocatePortions([PROTEIN], target, { maxGrams: 120 });
    expect(items[0].grams).toBeLessThanOrEqual(120);
  });

  it('caps piece foods by piece count', () => {
    const egg: PlannerFood = {
      id: 'egg', name: 'Egg', calories: 155, protein: 13, carbs: 1, fats: 11,
      servingType: 'piece', averageWeight: 50,
    };
    const target: Macros = { protein: 1000, carbs: 0, fats: 0, calories: 4000 };
    const { items } = allocatePortions([egg], target, { maxPieces: 6 });
    expect(items[0].pieceCount).toBeLessThanOrEqual(6);
    expect(items[0].grams).toBeLessThanOrEqual(6 * 50);
  });

  it('returns no allocations for an empty food list without throwing', () => {
    const result = allocatePortions([], { protein: 40, carbs: 40, fats: 10, calories: 500 });
    expect(result.items).toEqual([]);
    expect(result.totals).toEqual({ calories: 0, protein: 0, carbs: 0, fats: 0 });
  });
});

describe('roundPortion', () => {
  it('rounds weight foods to the nearest 5 g', () => {
    expect(roundPortion(PROTEIN, 47).grams).toBe(45);
    expect(roundPortion(PROTEIN, 48).grams).toBe(50);
  });

  it('rounds piece foods to whole pieces via averageWeight', () => {
    const egg: PlannerFood = { id: 'egg', name: 'Egg', calories: 155, protein: 13, carbs: 1, fats: 11, servingType: 'piece', averageWeight: 50 };
    const r = roundPortion(egg, 130); // 2.6 pieces → 3 → 150 g
    expect(r.pieceCount).toBe(3);
    expect(r.grams).toBe(150);
  });
});

describe('remainingMacros', () => {
  it('subtracts consumed from target and floors at 0 (180 target − 100 eaten → 80)', () => {
    const target: Macros = { calories: 2400, protein: 180, carbs: 220, fats: 70 };
    const consumed: Macros = { calories: 1200, protein: 100, carbs: 90, fats: 30 };
    const r = remainingMacros(target, consumed);
    expect(r.protein).toBe(80);
    expect(r.calories).toBe(1200);
    expect(r.carbs).toBe(130);
    expect(r.fats).toBe(40);
  });

  it('never returns a negative remaining when a macro is over-eaten', () => {
    const target: Macros = { calories: 2000, protein: 150, carbs: 200, fats: 60 };
    const consumed: Macros = { calories: 2500, protein: 200, carbs: 260, fats: 90 };
    expect(remainingMacros(target, consumed)).toEqual({ calories: 0, protein: 0, carbs: 0, fats: 0 });
  });
});

describe('buildMealPlans', () => {
  const remaining: Macros = { protein: 100, carbs: 160, fats: 40, calories: 1400 };

  it('splits the remaining macros between meals in proportion to their mealSplit %', () => {
    const plans = buildMealPlans({
      foods: [PROTEIN, CARB, FAT],
      remaining,
      meals: ['dinner', 'snack'],
      mealSplit: DEFAULT_SPLIT,
    });
    const dinner = plans.find((p) => p.meal === 'dinner')!;
    const snack = plans.find((p) => p.meal === 'snack')!;

    // Only dinner (35) + snack (15) are planned → shares are 35/50 and 15/50.
    expect(dinner.target.calories).toBeCloseTo(1400 * (35 / 50), 3);
    expect(snack.target.calories).toBeCloseTo(1400 * (15 / 50), 3);
    expect(dinner.target.protein).toBeGreaterThan(snack.target.protein);
  });

  it('produces portions that roughly fill each meal target', () => {
    const plans = buildMealPlans({
      foods: [PROTEIN, CARB, FAT],
      remaining,
      meals: ['dinner', 'snack'],
      mealSplit: DEFAULT_SPLIT,
    });
    const dinner = plans.find((p) => p.meal === 'dinner')!;
    expect(dinner.totals.calories).toBeGreaterThan(dinner.target.calories * 0.85);
    expect(dinner.totals.calories).toBeLessThan(dinner.target.calories * 1.15);
  });

  it('respects the 180-vs-100→80 remaining case end to end', () => {
    // Whole day: protein target 180, 100 already eaten → planner solves to 80 g protein.
    const dayTarget: Macros = { calories: 320, protein: 180, carbs: 0, fats: 0 };
    const consumed: Macros = { calories: 0, protein: 100, carbs: 0, fats: 0 };
    const rem = remainingMacros(dayTarget, consumed); // protein 80
    const plans = buildMealPlans({
      foods: [PROTEIN],
      remaining: rem,
      meals: ['dinner'],
      mealSplit: { breakfast: 0, lunch: 0, dinner: 100, snack: 0 },
    });
    // 80 g of a pure-protein-per-100 g food → 80 g portion, ~80 g protein.
    expect(plans[0].totals.protein).toBeCloseTo(80, 0);
    expect(plans[0].items[0].grams).toBeCloseTo(80, 0);
  });

  it('handles an empty food list without throwing', () => {
    const plans = buildMealPlans({
      foods: [],
      remaining,
      meals: ['dinner', 'snack'],
      mealSplit: DEFAULT_SPLIT,
    });
    expect(plans).toHaveLength(2);
    plans.forEach((p) => {
      expect(p.items).toEqual([]);
      expect(p.totals).toEqual({ calories: 0, protein: 0, carbs: 0, fats: 0 });
    });
  });

  it('floors negative remaining macros at zero', () => {
    const over: Macros = { protein: -20, carbs: -50, fats: -5, calories: -300 };
    const plans = buildMealPlans({
      foods: [PROTEIN, CARB, FAT],
      remaining: over,
      meals: ['dinner'],
      mealSplit: DEFAULT_SPLIT,
    });
    expect(plans[0].target).toEqual({ calories: 0, protein: 0, carbs: 0, fats: 0 });
    expect(plans[0].items).toEqual([]);
  });

  it('falls back to an even split when all planned meals are 0%', () => {
    const zeroSplit: MealSplit = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    const plans = buildMealPlans({
      foods: [PROTEIN],
      remaining,
      meals: ['dinner', 'snack'],
      mealSplit: zeroSplit,
    });
    expect(plans[0].target.calories).toBeCloseTo(1400 / 2, 3);
    expect(plans[1].target.calories).toBeCloseTo(1400 / 2, 3);
  });
});

describe('macrosForGrams', () => {
  it('scales per-100 g macros to the given grams', () => {
    expect(macrosForGrams(PROTEIN, 50)).toEqual({ calories: 200, protein: 50, carbs: 0, fats: 0 });
  });
});
