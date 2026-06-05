/**
 * Food Database Validation Utility
 * Ensures all foods have realistic nutritional data
 */

import type { FoodItem } from '../types';
import { foodDatabase } from '../data/foodDatabase';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    totalFoods: number;
    validFoods: number;
    problematicFoods: string[];
  };
}

/**
 * Validate a single food item
 */
export const validateFood = (food: FoodItem): { valid: boolean; issues: string[] } => {
  const issues: string[] = [];

  // Check required fields
  if (!food.id) issues.push('Missing ID');
  if (!food.name) issues.push('Missing name');

  // Check nutritional data
  if (food.calories === undefined || food.calories === null) {
    issues.push('Missing calories');
  } else if (food.calories < 0) {
    issues.push('Negative calories');
  } else if (food.calories === 0 && food.name.toLowerCase() !== 'water') {
    // Most foods should have calories (except water)
    issues.push('Zero calories (unusual for non-water items)');
  }

  if (food.protein === undefined || food.protein === null) {
    issues.push('Missing protein');
  } else if (food.protein < 0) {
    issues.push('Negative protein');
  }

  if (food.carbs === undefined || food.carbs === null) {
    issues.push('Missing carbs');
  } else if (food.carbs < 0) {
    issues.push('Negative carbs');
  }

  if (food.fats === undefined || food.fats === null) {
    issues.push('Missing fats');
  } else if (food.fats < 0) {
    issues.push('Negative fats');
  }

  // Check macro sum (rough validation: macros * 4, 4, 9 should roughly equal calories ±20%)
  if (
    food.calories > 0 &&
    food.protein !== undefined &&
    food.carbs !== undefined &&
    food.fats !== undefined
  ) {
    const calculatedCalories = food.protein * 4 + food.carbs * 4 + food.fats * 9;
    const difference = Math.abs(calculatedCalories - food.calories);
    const percentDifference = (difference / food.calories) * 100;

    // Allow higher variance for low-calorie foods (vegetables, etc.) where measurement error is more significant
    const tolerance = food.calories < 50 ? 35 : 20;

    if (percentDifference > tolerance) {
      issues.push(
        `Macro mismatch: calculated ${Math.round(calculatedCalories)} cal vs stated ${food.calories} cal (${percentDifference.toFixed(1)}% diff)`,
      );
    }
  }

  // Check serving type consistency
  if (food.servingType === 'piece' && !food.averageWeight) {
    issues.push('Piece-based food missing averageWeight');
  }

  // Check category
  if (!food.category) {
    issues.push('Missing category');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
};

/**
 * Validate entire food database
 */
export const validateDatabase = (): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const problematicFoods: string[] = [];
  let validCount = 0;

  foodDatabase.forEach((food) => {
    const { valid, issues } = validateFood(food);

    if (valid) {
      validCount++;
    } else {
      problematicFoods.push(food.name);
      issues.forEach((issue) => {
        errors.push(`${food.name}: ${issue}`);
      });
    }

    // Additional warnings
    if (food.protein > 50) {
      warnings.push(`${food.name}: Very high protein (${food.protein}g)`);
    }
    if (food.calories > 900) {
      warnings.push(`${food.name}: Very high calories (${food.calories})`);
    }
  });

  return {
    isValid: problematicFoods.length === 0,
    errors,
    warnings,
    summary: {
      totalFoods: foodDatabase.length,
      validFoods: validCount,
      problematicFoods,
    },
  };
};

/**
 * Get foods by nutritional profile
 */
export const getFoodsByProfile = (profile: 'high-protein' | 'high-calorie' | 'low-calorie') => {
  return foodDatabase.filter((food) => {
    switch (profile) {
      case 'high-protein':
        return food.protein > 15; // per 100g
      case 'high-calorie':
        return food.calories > 300; // per 100g
      case 'low-calorie':
        return food.calories < 50; // per 100g
      default:
        return false;
    }
  });
};

/**
 * Check if database has critical issues
 */
export const hasCriticalIssues = (): boolean => {
  const result = validateDatabase();
  return result.errors.length > 0;
};

/**
 * Log validation results to console
 */
export const logValidationResults = (): void => {
  const result = validateDatabase();

  console.log('📊 Food Database Validation Results:');
  console.log(`Total foods: ${result.summary.totalFoods}`);
  console.log(`Valid foods: ${result.summary.validFoods}`);
  console.log(`Problematic foods: ${result.summary.problematicFoods.length}`);

  if (result.errors.length > 0) {
    console.error('❌ Errors:');
    result.errors.forEach((err) => console.error(`  - ${err}`));
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️ Warnings:');
    result.warnings.forEach((warn) => console.warn(`  - ${warn}`));
  }

  if (result.isValid) {
    console.log('✅ Database validation passed!');
  }
};
