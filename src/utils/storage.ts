import type { DailyEntry, UserSettings, FoodEntry, Exercise, FoodItem } from '../types';
import { format } from 'date-fns';
import { foodDatabase } from '../data/foodDatabase';

const STORAGE_KEYS = {
  DAILY_ENTRIES: 'nutrition_tracker_daily_entries',
  USER_SETTINGS: 'nutrition_tracker_user_settings',
  CUSTOM_FOODS: 'nutrition_tracker_custom_foods',
  ACHIEVEMENTS: 'nutrition_tracker_achievements',
};

// User Settings
export const getUserSettings = (): UserSettings => {
  const stored = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
  if (stored) {
    return JSON.parse(stored);
  }
  return {
    targets: {
      dailyCalories: 2000,
      dailyProtein: 150,
      dailyCarbs: 200,
      dailyFats: 65,
    },
    theme: 'light',
    pushupReminders: {
      enabled: false,
      times: ['08:00', '11:00', '14:00', '17:00', '20:00'],
      weekend: true,
    },
    restTimerSeconds: 120,
  };
};

export const saveUserSettings = (settings: UserSettings): void => {
  localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(settings));
};

// Daily Entries
export const getAllDailyEntries = (): Record<string, DailyEntry> => {
  const stored = localStorage.getItem(STORAGE_KEYS.DAILY_ENTRIES);
  if (stored) {
    return JSON.parse(stored);
  }
  return {};
};

export const getDailyEntry = (date: Date | string): DailyEntry => {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  const allEntries = getAllDailyEntries();

  if (allEntries[dateStr]) {
    return allEntries[dateStr];
  }

  return {
    date: dateStr,
    foodEntries: [],
    exercises: [],
    totalCalories: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFats: 0,
    totalExerciseCalories: 0,
    netCalories: 0,
    fitness: {
      pushups: {
        sets: [],
        totalReps: 0,
        setsCompleted: 0,
      },
      steps: {
        steps: 0,
        goal: 5000,
      },
    },
  };
};

// Steps helpers
export const setSteps = (date: Date | string, steps: number): void => {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  const dailyEntry = getDailyEntry(dateStr);

  if (!dailyEntry.fitness) {
    dailyEntry.fitness = { pushups: { sets: [], totalReps: 0, setsCompleted: 0 }, steps: { steps: 0, goal: 5000 } };
  }

  dailyEntry.fitness.steps.steps = Math.max(0, Math.floor(steps));
  saveDailyEntry(dailyEntry);
};

export const addSteps = (date: Date | string, amount: number): void => {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  const dailyEntry = getDailyEntry(dateStr);

  if (!dailyEntry.fitness) {
    dailyEntry.fitness = { pushups: { sets: [], totalReps: 0, setsCompleted: 0 }, steps: { steps: 0, goal: 5000 } };
  }

  dailyEntry.fitness.steps.steps = Math.max(0, dailyEntry.fitness.steps.steps + Math.floor(amount));
  saveDailyEntry(dailyEntry);
};

export const getYesterdaySteps = (date: Date | string): number => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const yesterday = new Date(dateObj);
  yesterday.setDate(dateObj.getDate() - 1);
  const yEntry = getDailyEntry(format(yesterday, 'yyyy-MM-dd'));
  return yEntry.fitness?.steps?.steps || 0;
};

export const saveDailyEntry = (entry: DailyEntry): void => {
  const allEntries = getAllDailyEntries();
  allEntries[entry.date] = entry;
  localStorage.setItem(STORAGE_KEYS.DAILY_ENTRIES, JSON.stringify(allEntries));
};

// Achievements
export interface Achievement {
  id: string;
  name: string;
  date: string; // ISO date when awarded
}

export const getAchievements = (): Achievement[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS);
  if (stored) return JSON.parse(stored);
  return [];
};

export const addAchievement = (achievement: Achievement): void => {
  const items = getAchievements();
  if (items.find(a => a.id === achievement.id)) return; // no duplicates
  items.push(achievement);
  localStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(items));
};

export const clearAchievements = (): void => {
  localStorage.removeItem(STORAGE_KEYS.ACHIEVEMENTS);
};

// Export / Reset fitness data
export const exportFitnessData = (): string => {
  const all = getAllDailyEntries();
  // extract fitness data only
  const fitnessOnly: Record<string, any> = {};
  Object.keys(all).forEach(k => {
    fitnessOnly[k] = all[k].fitness || {};
  });
  return JSON.stringify(fitnessOnly, null, 2);
};

export const resetAllFitnessData = (): void => {
  const all = getAllDailyEntries();
  Object.keys(all).forEach(k => {
    all[k].fitness = { pushups: { sets: [], totalReps: 0, setsCompleted: 0 }, steps: { steps: 0, goal: 5000 } };
  });
  localStorage.setItem(STORAGE_KEYS.DAILY_ENTRIES, JSON.stringify(all));
};

export const addFoodEntry = (date: Date | string, foodEntry: FoodEntry): void => {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  const dailyEntry = getDailyEntry(dateStr);

  dailyEntry.foodEntries.push(foodEntry);
  dailyEntry.totalCalories = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.calories, 0);
  dailyEntry.totalProtein = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.protein, 0);
  dailyEntry.totalCarbs = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.carbs, 0);
  dailyEntry.totalFats = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.fats, 0);
  dailyEntry.netCalories = dailyEntry.totalCalories - dailyEntry.totalExerciseCalories;

  saveDailyEntry(dailyEntry);
};

export const deleteFoodEntry = (date: Date | string, entryId: string): void => {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  const dailyEntry = getDailyEntry(dateStr);

  dailyEntry.foodEntries = dailyEntry.foodEntries.filter(entry => entry.id !== entryId);
  dailyEntry.totalCalories = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.calories, 0);
  dailyEntry.totalProtein = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.protein, 0);
  dailyEntry.totalCarbs = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.carbs, 0);
  dailyEntry.totalFats = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.fats, 0);
  dailyEntry.netCalories = dailyEntry.totalCalories - dailyEntry.totalExerciseCalories;

  saveDailyEntry(dailyEntry);
};

export const addExercise = (date: Date | string, exercise: Exercise): void => {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  const dailyEntry = getDailyEntry(dateStr);

  dailyEntry.exercises.push(exercise);
  dailyEntry.totalExerciseCalories = dailyEntry.exercises.reduce((sum, ex) => sum + ex.caloriesBurned, 0);
  dailyEntry.netCalories = dailyEntry.totalCalories - dailyEntry.totalExerciseCalories;

  saveDailyEntry(dailyEntry);
};

export const deleteExercise = (date: Date | string, exerciseId: string): void => {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  const dailyEntry = getDailyEntry(dateStr);

  dailyEntry.exercises = dailyEntry.exercises.filter(ex => ex.id !== exerciseId);
  dailyEntry.totalExerciseCalories = dailyEntry.exercises.reduce((sum, ex) => sum + ex.caloriesBurned, 0);
  dailyEntry.netCalories = dailyEntry.totalCalories - dailyEntry.totalExerciseCalories;

  saveDailyEntry(dailyEntry);
};

// Calculate portion nutrients
export const calculatePortionNutrients = (
  caloriesPer100g: number,
  proteinPer100g: number,
  carbsPer100g: number,
  fatsPer100g: number,
  portionGrams: number
) => {
  const multiplier = portionGrams / 100;
  return {
    calories: Math.round(caloriesPer100g * multiplier),
    protein: Math.round(proteinPer100g * multiplier * 10) / 10,
    carbs: Math.round(carbsPer100g * multiplier * 10) / 10,
    fats: Math.round(fatsPer100g * multiplier * 10) / 10,
  };
};

// Custom Foods Management
export const getCustomFoods = (): FoodItem[] => {
  const stored = localStorage.getItem(STORAGE_KEYS.CUSTOM_FOODS);
  if (stored) {
    return JSON.parse(stored);
  }
  return [];
};

export const saveCustomFoods = (foods: FoodItem[]): void => {
  localStorage.setItem(STORAGE_KEYS.CUSTOM_FOODS, JSON.stringify(foods));
};

export const addCustomFood = (food: Omit<FoodItem, 'id' | 'isCustom'>): FoodItem => {
  const customFoods = getCustomFoods();
  const newFood: FoodItem = {
    ...food,
    id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    isCustom: true,
  };
  customFoods.push(newFood);
  saveCustomFoods(customFoods);
  return newFood;
};

export const updateCustomFood = (id: string, updates: Partial<FoodItem>): boolean => {
  const customFoods = getCustomFoods();
  const index = customFoods.findIndex(f => f.id === id);
  if (index === -1) return false;

  customFoods[index] = { ...customFoods[index], ...updates };
  saveCustomFoods(customFoods);
  return true;
};

export const deleteCustomFood = (id: string): boolean => {
  const customFoods = getCustomFoods();
  const filtered = customFoods.filter(f => f.id !== id);
  if (filtered.length === customFoods.length) return false;

  saveCustomFoods(filtered);
  return true;
};

export const exportCustomFoods = (): string => {
  const customFoods = getCustomFoods();
  return JSON.stringify(customFoods, null, 2);
};

export const importCustomFoods = (
  jsonString: string,
  mode: 'merge' | 'replace'
): { success: boolean; count?: number; error?: string } => {
  try {
    const imported = JSON.parse(jsonString);
    if (!Array.isArray(imported)) {
      return { success: false, error: 'Invalid format: expected array' };
    }

    // Validate structure
    const valid = imported.every(item =>
      item.name &&
      typeof item.calories === 'number' &&
      typeof item.protein === 'number' &&
      typeof item.carbs === 'number' &&
      typeof item.fats === 'number'
    );

    if (!valid) {
      return { success: false, error: 'Invalid food data structure' };
    }

    // Regenerate IDs to avoid conflicts
    const newFoods = imported.map(food => ({
      ...food,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      isCustom: true,
    }));

    if (mode === 'replace') {
      saveCustomFoods(newFoods);
    } else {
      const existingFoods = getCustomFoods();
      saveCustomFoods([...existingFoods, ...newFoods]);
    }

    return { success: true, count: newFoods.length };
  } catch (error) {
    return { success: false, error: 'Failed to parse JSON' };
  }
};

// Pushup / Fitness helpers
export const addPushupSet = (date: Date | string, reps: number): void => {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  const dailyEntry = getDailyEntry(dateStr);

  if (!dailyEntry.fitness) {
    dailyEntry.fitness = { pushups: { sets: [], totalReps: 0, setsCompleted: 0 }, steps: { steps: 0, goal: 5000 } };
  }

  const set = { reps, timestamp: new Date().toISOString() };
  dailyEntry.fitness.pushups.sets.push(set);
  dailyEntry.fitness.pushups.totalReps = dailyEntry.fitness.pushups.sets.reduce((s, st) => s + st.reps, 0);
  dailyEntry.fitness.pushups.setsCompleted = dailyEntry.fitness.pushups.sets.length;

  saveDailyEntry(dailyEntry);
};

export const deletePushupSet = (date: Date | string, timestamp: string): boolean => {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  const dailyEntry = getDailyEntry(dateStr);

  if (!dailyEntry.fitness) return false;

  const before = dailyEntry.fitness.pushups.sets.length;
  dailyEntry.fitness.pushups.sets = dailyEntry.fitness.pushups.sets.filter(s => s.timestamp !== timestamp);
  if (dailyEntry.fitness.pushups.sets.length === before) return false;

  dailyEntry.fitness.pushups.totalReps = dailyEntry.fitness.pushups.sets.reduce((s, st) => s + st.reps, 0);
  dailyEntry.fitness.pushups.setsCompleted = dailyEntry.fitness.pushups.sets.length;

  saveDailyEntry(dailyEntry);
  return true;
};

export const updatePushupSet = (date: Date | string, timestamp: string, reps: number): boolean => {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  const dailyEntry = getDailyEntry(dateStr);

  if (!dailyEntry.fitness) return false;

  const index = dailyEntry.fitness.pushups.sets.findIndex(s => s.timestamp === timestamp);
  if (index === -1) return false;

  dailyEntry.fitness.pushups.sets[index].reps = reps;
  dailyEntry.fitness.pushups.totalReps = dailyEntry.fitness.pushups.sets.reduce((s, st) => s + st.reps, 0);
  dailyEntry.fitness.pushups.setsCompleted = dailyEntry.fitness.pushups.sets.length;

  saveDailyEntry(dailyEntry);
  return true;
};

// Helper to get merged food database (default + custom)
export const getAllFoods = (): FoodItem[] => {
  return [...foodDatabase, ...getCustomFoods()];
};

// Check if food name is duplicate (case-insensitive)
export const isFoodNameDuplicate = (name: string, excludeId?: string): boolean => {
  const allFoods = getAllFoods();
  const nameLower = name.toLowerCase().trim();
  return allFoods.some(
    food => food.name.toLowerCase().trim() === nameLower && food.id !== excludeId
  );
};
