import type { FoodItem } from '../types';
import { foodDatabase } from '../data/foodDatabase';
import { getCustomFoods } from './storage';

export interface NutrientDeficit {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface FoodSuggestion {
  food: FoodItem;
  portion: number; // in grams
  match: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
  efficiency: 'excellent' | 'great' | 'good' | 'okay';
  reason: string;
  score: number; // 0-100
}

/**
 * Determine the current meal time for context-appropriate suggestions
 */
export const getCurrentMealType = (): 'breakfast' | 'lunch' | 'dinner' | 'snack' => {
  const hour = new Date().getHours();
  
  if (hour >= 6 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 18) return 'snack';
  return 'dinner';
};

/**
 * Calculate efficiency score based on how well a food matches the deficit
 * Prioritizes protein efficiency and calorie alignment
 */
const calculateEfficiencyScore = (
  food: FoodItem,
  portion: number,
  deficit: NutrientDeficit,
): { score: number; efficiency: 'excellent' | 'great' | 'good' | 'okay' } => {
  const foodCalories = (food.calories / 100) * portion;
  const foodProtein = (food.protein / 100) * portion;
  const foodCarbs = (food.carbs / 100) * portion;
  const foodFats = (food.fats / 100) * portion;

  // Calculate how well the food matches each macro need
  const calorieMatch = Math.max(0, 100 - Math.abs(foodCalories - deficit.calories) / 5);
  const proteinMatch = deficit.protein > 0
    ? Math.min(100, (foodProtein / deficit.protein) * 100)
    : 50;
  
  // Protein efficiency: grams of protein per calorie
  const proteinPerCalorie = foodCalories > 0 ? foodProtein / foodCalories : 0;
  const proteinEfficiency = proteinPerCalorie * 50; // weight protein highly

  // Overall score: balance between meeting deficit and macro efficiency
  let score =
    calorieMatch * 0.3 +
    proteinMatch * 0.4 +
    proteinEfficiency * 0.3;

  // Bonus if food covers multiple needs
  if (deficit.protein > 5 && foodProtein > 0) score += 10;
  if (deficit.carbs > 10 && foodCarbs > 0) score += 5;
  if (deficit.fats > 5 && foodFats > 0) score += 5;

  let efficiency: 'excellent' | 'great' | 'good' | 'okay' = 'okay';
  if (score >= 80) efficiency = 'excellent';
  else if (score >= 65) efficiency = 'great';
  else if (score >= 50) efficiency = 'good';

  return { score: Math.min(100, score), efficiency };
};

/**
 * Calculate optimal portion size for a food to match deficit
 */
const MAX_PORTION_G = 300; // realistic single-serving cap

const calculateOptimalPortion = (
  food: FoodItem,
  deficit: NutrientDeficit,
): number => {
  // If protein is the main need, target that
  if (deficit.protein > 10) {
    if (food.protein > 0) {
      return Math.min(MAX_PORTION_G, Math.round((deficit.protein / food.protein) * 100));
    }
  }

  // Otherwise target calories
  if (food.calories > 0) {
    return Math.min(MAX_PORTION_G, Math.round((deficit.calories / food.calories) * 100));
  }

  // Default to 100g
  return 100;
};

/**
 * Get smart food suggestions based on nutrient deficit
 */
export const getSuggestions = (
  deficit: NutrientDeficit,
  eatenFoodIds: string[] = [],
  maxSuggestions: number = 5,
): FoodSuggestion[] => {
  const allFoods = [...foodDatabase, ...getCustomFoods()];

  // Filter out foods already eaten today
  const availableFoods = allFoods.filter((f) => !eatenFoodIds.includes(f.id));

  // Priority filtering based on deficit
  let candidates = availableFoods;

  // If significant protein deficit, prioritize high-protein foods
  if (deficit.protein > 15) {
    const proteinFoods = availableFoods
      .filter((f) => f.protein > 15)
      .sort((a, b) => b.protein - a.protein);
    candidates = proteinFoods;
  }

  // If significant calorie deficit but low protein, suggest balanced foods
  if (deficit.calories > 500 && deficit.protein < 10) {
    candidates = availableFoods
      .filter((f) => f.calories > 150 && f.protein > 10)
      .sort((a, b) => b.calories - a.calories);
  }

  // Generate suggestions
  const suggestions: FoodSuggestion[] = candidates.map((food) => {
    const portion = calculateOptimalPortion(food, deficit);
    const { score, efficiency } = calculateEfficiencyScore(food, portion, deficit);

    const foodCalories = (food.calories / 100) * portion;
    const foodProtein = (food.protein / 100) * portion;
    const foodCarbs = (food.carbs / 100) * portion;
    const foodFats = (food.fats / 100) * portion;

    let reason = '';
    if (efficiency === 'excellent') {
      reason = 'Perfect match for your deficit';
    } else if (efficiency === 'great') {
      reason = `High protein: ${Math.round(foodProtein)}g`;
    } else if (efficiency === 'good') {
      reason = `Good source of protein and calories`;
    } else {
      reason = `Adds to daily intake`;
    }

    return {
      food,
      portion,
      match: {
        calories: Math.round(foodCalories),
        protein: Math.round(foodProtein * 10) / 10,
        carbs: Math.round(foodCarbs * 10) / 10,
        fats: Math.round(foodFats * 10) / 10,
      },
      efficiency,
      reason,
      score,
    };
  });

  // Sort by score and return top suggestions
  return suggestions.sort((a, b) => b.score - a.score).slice(0, maxSuggestions);
};

/**
 * Get category-specific suggestions (high-protein, quick calories, balanced)
 */
export const getCategorySuggestions = (
  deficit: NutrientDeficit,
  eatenFoodIds: string[] = [],
): {
  highProtein: FoodSuggestion[];
  quickCalories: FoodSuggestion[];
  balanced: FoodSuggestion[];
} => {
  const allFoods = [...foodDatabase, ...getCustomFoods()];
  const availableFoods = allFoods.filter((f) => !eatenFoodIds.includes(f.id));

  // High protein suggestions
  const highProtein = availableFoods
    .filter((f) => f.protein > 15)
    .map((food) => {
      const portion = calculateOptimalPortion(food, deficit);
      const { score, efficiency } = calculateEfficiencyScore(food, portion, deficit);
      const foodCalories = (food.calories / 100) * portion;
      const foodProtein = (food.protein / 100) * portion;
      const foodCarbs = (food.carbs / 100) * portion;
      const foodFats = (food.fats / 100) * portion;

      return {
        food,
        portion,
        match: {
          calories: Math.round(foodCalories),
          protein: Math.round(foodProtein * 10) / 10,
          carbs: Math.round(foodCarbs * 10) / 10,
          fats: Math.round(foodFats * 10) / 10,
        },
        efficiency,
        reason: `${Math.round(foodProtein)}g protein`,
        score,
      };
    })
    .sort((a, b) => b.match.protein - a.match.protein)
    .slice(0, 2);

  // Quick calories suggestions
  const quickCalories = availableFoods
    .filter((f) => f.calories > 200 && f.fats > 5)
    .map((food) => {
      const portion = 50; // smaller portion for calorie-dense foods
      const { score, efficiency } = calculateEfficiencyScore(food, portion, deficit);
      const foodCalories = (food.calories / 100) * portion;
      const foodProtein = (food.protein / 100) * portion;
      const foodCarbs = (food.carbs / 100) * portion;
      const foodFats = (food.fats / 100) * portion;

      return {
        food,
        portion,
        match: {
          calories: Math.round(foodCalories),
          protein: Math.round(foodProtein * 10) / 10,
          carbs: Math.round(foodCarbs * 10) / 10,
          fats: Math.round(foodFats * 10) / 10,
        },
        efficiency,
        reason: `${Math.round(foodCalories)} cal in small portion`,
        score,
      };
    })
    .sort((a, b) => b.match.calories - a.match.calories)
    .slice(0, 2);

  // Balanced suggestions
  const balanced = availableFoods
    .filter((f) => f.protein > 8 && f.carbs > 10)
    .map((food) => {
      const portion = 100;
      const { score, efficiency } = calculateEfficiencyScore(food, portion, deficit);
      const foodCalories = (food.calories / 100) * portion;
      const foodProtein = (food.protein / 100) * portion;
      const foodCarbs = (food.carbs / 100) * portion;
      const foodFats = (food.fats / 100) * portion;

      return {
        food,
        portion,
        match: {
          calories: Math.round(foodCalories),
          protein: Math.round(foodProtein * 10) / 10,
          carbs: Math.round(foodCarbs * 10) / 10,
          fats: Math.round(foodFats * 10) / 10,
        },
        efficiency,
        reason: `Balanced macros: ${Math.round(foodProtein)}g P, ${Math.round(foodCarbs)}g C`,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  return { highProtein, quickCalories, balanced };
};
