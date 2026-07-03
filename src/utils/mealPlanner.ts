// ── "Plan my remaining meals" macro solver ───────────────────────────────────
// Pure module (no React, no storage, no DOM) so it is trivially unit-testable.
//
// Given the macros still needed for the day and a set of candidate foods, we
// pick a gram portion of each food that, together, best fill the remaining
// protein / carbs / fats / calories. This is a bounded non-negative least
// squares problem solved with coordinate descent: for each food we solve the
// closed-form optimum holding the others fixed, clamp it to [0, cap], and
// repeat for a fixed number of passes. Each macro's error is normalised by its
// own target so that (say) a 10 g protein miss and a 100 kcal miss are weighed
// on comparable scales instead of calories dominating everything.

import type { MealSplit } from '../types';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

/** A candidate food, macros expressed per 100 g (matching FoodItem). */
export interface PlannerFood {
  id: string;
  name: string;
  calories: number; // per 100 g
  protein: number; // per 100 g
  carbs: number; // per 100 g
  fats: number; // per 100 g
  servingType?: 'weight' | 'piece';
  averageWeight?: number; // grams per piece (piece foods)
}

export interface AllocatedFood {
  food: PlannerFood;
  grams: number;
  /** Whole pieces, for servingType 'piece' foods. */
  pieceCount?: number;
  /** Macros this portion contributes. */
  macros: Macros;
}

export interface Allocation {
  /** One entry per allocated food (grams > 0 only). */
  items: AllocatedFood[];
  /** The macro target this allocation was solving for. */
  target: Macros;
  /** Sum of the items' macros. */
  totals: Macros;
  /** Per-macro percentage of target hit (0 when a target macro is 0). */
  pctOfTarget: Macros;
}

export interface MealPlan extends Allocation {
  meal: MealType;
}

export interface AllocateOptions {
  /** Cap on grams per weight food. Default DEFAULT_MAX_GRAMS. */
  maxGrams?: number;
  /** Cap on pieces per piece food. Default DEFAULT_MAX_PIECES. */
  maxPieces?: number;
  /** Coordinate-descent passes. Default SOLVER_PASSES. */
  passes?: number;
}

/** Default cap so the solver cannot suggest an absurd single portion. */
export const DEFAULT_MAX_GRAMS = 400;
/** Default piece cap for piece foods (e.g. no more than 12 eggs). */
export const DEFAULT_MAX_PIECES = 12;
/** Number of coordinate-descent passes. ~200 is plenty for a handful of foods. */
export const SOLVER_PASSES = 200;

const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fats'] as const;

/** Macros contributed by `grams` of `food` (per-100 g scaled). */
export function macrosForGrams(food: PlannerFood, grams: number): Macros {
  const f = grams / 100;
  return {
    calories: food.calories * f,
    protein: food.protein * f,
    carbs: food.carbs * f,
    fats: food.fats * f,
  };
}

/** The upper gram bound for a food given the caps (piece foods → pieces × avg weight). */
function capFor(food: PlannerFood, maxGrams: number, maxPieces: number): number {
  if (food.servingType === 'piece' && food.averageWeight && food.averageWeight > 0) {
    return maxPieces * food.averageWeight;
  }
  return maxGrams;
}

/**
 * Round a raw gram amount to a loggable portion.
 * Weight foods round to the nearest 5 g; piece foods round to whole pieces via
 * averageWeight (and report the piece count).
 */
export function roundPortion(
  food: PlannerFood,
  grams: number,
): { grams: number; pieceCount?: number } {
  if (food.servingType === 'piece' && food.averageWeight && food.averageWeight > 0) {
    const pieceCount = Math.max(0, Math.round(grams / food.averageWeight));
    return { grams: pieceCount * food.averageWeight, pieceCount };
  }
  return { grams: Math.max(0, Math.round(grams / 5) * 5) };
}

function zeroMacros(): Macros {
  return { calories: 0, protein: 0, carbs: 0, fats: 0 };
}

function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fats: a.fats + b.fats,
  };
}

function pctOf(totals: Macros, target: Macros): Macros {
  const pct = (t: number, tgt: number) => (tgt > 0 ? (t / tgt) * 100 : 0);
  return {
    calories: pct(totals.calories, target.calories),
    protein: pct(totals.protein, target.protein),
    carbs: pct(totals.carbs, target.carbs),
    fats: pct(totals.fats, target.fats),
  };
}

/**
 * Solve for raw (unrounded) gram portions of each food that best fill `target`,
 * each clamped to [0, cap]. A macro whose target is <= 0 is dropped from the
 * objective (weight 0), so an all-zero target — or an empty food list — yields
 * all-zero portions.
 */
function solveRawGrams(
  foods: PlannerFood[],
  target: Macros,
  maxGrams: number,
  maxPieces: number,
  passes: number,
): number[] {
  const n = foods.length;
  if (n === 0) return [];

  // Per-macro weight = 1 / target^2  → error normalised by the target.
  const weights = MACRO_KEYS.map((k) => {
    const t = target[k];
    return t > 0 ? 1 / (t * t) : 0;
  });

  // a[i][m] = grams→macro contribution (per gram) of food i for macro m.
  const a = foods.map((food) => MACRO_KEYS.map((k) => food[k] / 100));
  const caps = foods.map((food) => capFor(food, maxGrams, maxPieces));

  // Denominator of the closed-form step: sum_m w_m * a_im^2 (constant per food).
  const denom = a.map((ai) => ai.reduce((s, aim, m) => s + weights[m] * aim * aim, 0));

  const g = new Array<number>(n).fill(0);
  // pred[m] = current predicted total for macro m across all foods.
  const pred = MACRO_KEYS.map(() => 0);

  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < n; i++) {
      if (denom[i] === 0) continue; // food contributes nothing weighted — skip

      // Optimal g_i (others fixed): numer / denom, where the residual for each
      // macro excludes food i's current contribution.
      let numer = 0;
      for (let m = 0; m < MACRO_KEYS.length; m++) {
        const residual = target[MACRO_KEYS[m]] - (pred[m] - g[i] * a[i][m]);
        numer += weights[m] * a[i][m] * residual;
      }

      let gi = numer / denom[i];
      if (gi < 0) gi = 0;
      if (gi > caps[i]) gi = caps[i];

      const delta = gi - g[i];
      if (delta !== 0) {
        for (let m = 0; m < MACRO_KEYS.length; m++) pred[m] += delta * a[i][m];
        g[i] = gi;
      }
    }
  }

  return g;
}

/**
 * Allocate gram portions of `foods` to best fill `target`. Returns rounded,
 * loggable portions (5 g / whole pieces) plus the resulting macros and per-macro
 * % of target. Foods that round to 0 g are dropped from `items`.
 */
export function allocatePortions(
  foods: PlannerFood[],
  target: Macros,
  opts: AllocateOptions = {},
): Allocation {
  const maxGrams = opts.maxGrams ?? DEFAULT_MAX_GRAMS;
  const maxPieces = opts.maxPieces ?? DEFAULT_MAX_PIECES;
  const passes = opts.passes ?? SOLVER_PASSES;

  const raw = solveRawGrams(foods, target, maxGrams, maxPieces, passes);

  const items: AllocatedFood[] = [];
  for (let i = 0; i < foods.length; i++) {
    const { grams, pieceCount } = roundPortion(foods[i], raw[i]);
    if (grams <= 0) continue;
    items.push({ food: foods[i], grams, pieceCount, macros: macrosForGrams(foods[i], grams) });
  }

  const totals = items.reduce((acc, it) => addMacros(acc, it.macros), zeroMacros());
  return { items, target, totals, pctOfTarget: pctOf(totals, target) };
}

/**
 * Remaining macros for the day = target − consumed, floored at 0 per macro.
 * e.g. protein target 180, consumed 100 → remaining 80 (never 180, never < 0).
 */
export function remainingMacros(target: Macros, consumed: Macros): Macros {
  return {
    calories: Math.max(0, target.calories - consumed.calories),
    protein: Math.max(0, target.protein - consumed.protein),
    carbs: Math.max(0, target.carbs - consumed.carbs),
    fats: Math.max(0, target.fats - consumed.fats),
  };
}

export interface BuildMealPlansArgs {
  foods: PlannerFood[];
  /** Remaining macros for the whole day (already floored at 0). */
  remaining: Macros;
  meals: MealType[];
  mealSplit: MealSplit;
  opts?: AllocateOptions;
}

/**
 * Split the remaining macros across the selected meals (in proportion to their
 * configured percentages) and allocate portions for each meal. Shares are
 * normalised across only the selected meals; if every selected meal is 0%, an
 * even split is used.
 */
export function buildMealPlans({
  foods,
  remaining,
  meals,
  mealSplit,
  opts,
}: BuildMealPlansArgs): MealPlan[] {
  const clamped: Macros = {
    calories: Math.max(0, remaining.calories),
    protein: Math.max(0, remaining.protein),
    carbs: Math.max(0, remaining.carbs),
    fats: Math.max(0, remaining.fats),
  };

  const totalPct = meals.reduce((s, meal) => s + (mealSplit[meal] || 0), 0);

  return meals.map((meal) => {
    const frac =
      totalPct > 0 ? (mealSplit[meal] || 0) / totalPct : meals.length > 0 ? 1 / meals.length : 0;

    const target: Macros = {
      calories: clamped.calories * frac,
      protein: clamped.protein * frac,
      carbs: clamped.carbs * frac,
      fats: clamped.fats * frac,
    };

    const allocation = allocatePortions(foods, target, opts);
    return { meal, ...allocation };
  });
}
