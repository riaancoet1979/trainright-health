export interface FoodItem {
  id: string;
  name: string;
  calories: number; // per 100g
  protein: number; // per 100g
  carbs: number; // per 100g
  fats: number; // per 100g
  category?: string;
  brand?: string;
  servingType?: 'weight' | 'piece';
  averageWeight?: number; // grams per piece (required if servingType='piece')
  isCustom?: boolean;
}

export interface FoodEntry {
  id: string;
  foodId: string;
  foodName: string;
  portion: number; // in grams
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  timestamp: string;
  pieceCount?: number;
  servingType?: 'weight' | 'piece';
}

export interface Exercise {
  id: string;
  name: string;
  duration: number; // in minutes
  caloriesBurned: number;
  type: 'cardio' | 'strength' | 'walking' | 'other';
  timestamp: string;
}

export interface PushupSet {
  reps: number;
  timestamp: string; // ISO string
}

export interface PushupData {
  sets: PushupSet[];
  totalReps: number;
  setsCompleted: number;
}

export interface StepsData {
  steps: number;
  goal: number;
}

export interface DailyEntry {
  date: string; // YYYY-MM-DD format
  foodEntries: FoodEntry[];
  exercises: Exercise[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  totalExerciseCalories: number;
  netCalories: number;
  fitness?: {
    pushups: PushupData;
    steps: StepsData;
  };
}

export interface UserTargets {
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFats: number;
}

export interface UserSettings {
  targets: UserTargets;
  theme: 'light' | 'dark';
  pushupReminders?: {
    enabled: boolean;
    times: string[]; // 'HH:mm' strings
    weekend: boolean;
  };
  restTimerSeconds?: number;
}

export interface DayStatus {
  date: string;
  status: 'met' | 'close' | 'missed' | 'future';
  progress: number; // percentage
}
