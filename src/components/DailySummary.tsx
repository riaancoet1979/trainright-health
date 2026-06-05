import { format } from 'date-fns';
import { Trash2, Activity } from 'lucide-react';
import type { DailyEntry, FoodItem } from '../types';
import { deleteFoodEntry, deleteExercise, addFoodEntry } from '../utils/storage';
import { getTargetsForDate, isTrainingDay } from '../utils/training';
import SmartSuggestions from './SmartSuggestions';

interface DailySummaryProps {
  selectedDate: Date;
  dailyEntry: DailyEntry;
  onUpdate: () => void;
}

const DailySummary = ({ selectedDate, dailyEntry, onUpdate }: DailySummaryProps) => {
  const targets = getTargetsForDate(selectedDate);
  const trainingDay = isTrainingDay(selectedDate);

  const handleDeleteFood = (entryId: string) => {
    deleteFoodEntry(selectedDate, entryId);
    onUpdate();
  };

  const handleDeleteExercise = (exerciseId: string) => {
    deleteExercise(selectedDate, exerciseId);
    onUpdate();
  };

  const handleQuickAddFood = (food: FoodItem, portion: number) => {
    // Default to lunch as meal type if not specified
    const mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' = 'lunch';
    const foodEntry = {
      id: `${Date.now()}-${Math.random()}`,
      foodId: food.id,
      foodName: food.name,
      portion,
      calories: (food.calories / 100) * portion,
      protein: (food.protein / 100) * portion,
      carbs: (food.carbs / 100) * portion,
      fats: (food.fats / 100) * portion,
      mealType,
      timestamp: new Date().toISOString(),
      servingType: food.servingType,
      pieceCount: food.servingType === 'piece' ? Math.round(portion / (food.averageWeight || 100)) : undefined,
    };
    addFoodEntry(selectedDate, foodEntry);
    onUpdate();
  };

  const getProgressColor = (current: number, target: number): string => {
    const percentage = (current / target) * 100;
    if (percentage >= 90 && percentage <= 110) return 'bg-green-500';
    if (percentage >= 80 && percentage <= 120) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getProgressPercentage = (current: number, target: number): number => {
    return Math.min((current / target) * 100, 100);
  };

  // Group food entries by meal type
  const mealGroups = {
    breakfast: dailyEntry.foodEntries.filter((e) => e.mealType === 'breakfast'),
    lunch: dailyEntry.foodEntries.filter((e) => e.mealType === 'lunch'),
    dinner: dailyEntry.foodEntries.filter((e) => e.mealType === 'dinner'),
    snack: dailyEntry.foodEntries.filter((e) => e.mealType === 'snack'),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-2">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</h2>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {dailyEntry.foodEntries.length} food entries • {dailyEntry.exercises.length} activities
        </div>
        {dailyEntry.fitness && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Pushups</div>
                <div className="font-medium">{dailyEntry.fitness.pushups.setsCompleted}/5 sets • {dailyEntry.fitness.pushups.totalReps}/100 reps</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Steps</div>
                <div className="font-medium">{dailyEntry.fitness.steps.steps}/{dailyEntry.fitness.steps.goal}</div>
              </div>
            </div>

            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full mt-2 overflow-hidden">
              <div
                className="h-2 bg-primary-600 rounded-full"
                style={{ width: `${Math.min(100, (dailyEntry.fitness.pushups.totalReps / 100) * 100)}%` }}
              />
            </div>

            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full mt-3 overflow-hidden">
              <div
                className="h-2 bg-primary-600 rounded-full"
                style={{ width: `${Math.min(100, (dailyEntry.fitness.steps.steps / dailyEntry.fitness.steps.goal) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Progress Bars */}
      <div className="card">
        <h3 className="text-lg font-bold mb-4">Daily Progress
          <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${trainingDay ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
            {trainingDay ? 'Training day' : 'Rest day'}
          </span>
        </h3>
        <div className="space-y-4">
          {/* Calories */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-medium">Calories</span>
              <span className="text-sm">
                {dailyEntry.totalCalories} / {targets.dailyCalories}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${getProgressColor(
                  dailyEntry.totalCalories,
                  targets.dailyCalories
                )}`}
                style={{
                  width: `${getProgressPercentage(
                    dailyEntry.totalCalories,
                    targets.dailyCalories
                  )}%`,
                }}
              ></div>
            </div>
          </div>

          {/* Protein */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-medium">Protein</span>
              <span className="text-sm">
                {dailyEntry.totalProtein}g / {targets.dailyProtein}g
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${getProgressColor(
                  dailyEntry.totalProtein,
                  targets.dailyProtein
                )}`}
                style={{
                  width: `${getProgressPercentage(
                    dailyEntry.totalProtein,
                    targets.dailyProtein
                  )}%`,
                }}
              ></div>
            </div>
          </div>

          {/* Carbs */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-medium">Carbs</span>
              <span className="text-sm">
                {dailyEntry.totalCarbs}g / {targets.dailyCarbs}g
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${getProgressColor(
                  dailyEntry.totalCarbs,
                  targets.dailyCarbs
                )}`}
                style={{
                  width: `${getProgressPercentage(
                    dailyEntry.totalCarbs,
                    targets.dailyCarbs
                  )}%`,
                }}
              ></div>
            </div>
          </div>

          {/* Fats */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-medium">Fats</span>
              <span className="text-sm">
                {dailyEntry.totalFats}g / {targets.dailyFats}g
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${getProgressColor(
                  dailyEntry.totalFats,
                  targets.dailyFats
                )}`}
                style={{
                  width: `${getProgressPercentage(
                    dailyEntry.totalFats,
                    targets.dailyFats
                  )}%`,
                }}
              ></div>
            </div>
          </div>

          {/* Net Calories */}
          {dailyEntry.totalExerciseCalories > 0 && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between text-sm">
                <span>Food Calories:</span>
                <span>{dailyEntry.totalCalories}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Exercise Calories:</span>
                <span className="text-red-500">-{dailyEntry.totalExerciseCalories}</span>
              </div>
              <div className="flex justify-between font-bold mt-2">
                <span>Net Calories:</span>
                <span>{dailyEntry.netCalories}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Smart Suggestions */}
      <SmartSuggestions dailyEntry={dailyEntry} onQuickAdd={handleQuickAddFood} />

      {/* Food Entries by Meal */}
      {Object.entries(mealGroups).map(
        ([mealType, entries]) =>
          entries.length > 0 && (
            <div key={mealType} className="card">
              <h3 className="text-lg font-bold mb-4 capitalize">{mealType}</h3>
              <div className="space-y-3">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{entry.foodName}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {entry.servingType === 'piece' && entry.pieceCount ? (
                          <>
                            {entry.pieceCount} piece{entry.pieceCount > 1 ? 's' : ''} ({entry.portion}g)
                          </>
                        ) : (
                          <>{entry.portion}g</>
                        )}{' '}
                        • {entry.calories} cal • {entry.protein}g protein •{' '}
                        {entry.carbs}g carbs • {entry.fats}g fats
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteFood(entry.id)}
                      className="ml-4 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
      )}

      {/* Exercises */}
      {dailyEntry.exercises.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Activities
          </h3>
          <div className="space-y-3">
            {dailyEntry.exercises.map((exercise) => (
              <div
                key={exercise.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <div className="flex-1">
                  <div className="font-medium">{exercise.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {exercise.duration} min • {exercise.caloriesBurned} cal burned •{' '}
                    {exercise.type}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteExercise(exercise.id)}
                  className="ml-4 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {dailyEntry.foodEntries.length === 0 && dailyEntry.exercises.length === 0 && (
        <div className="card text-center py-12 text-gray-500">
          <p className="text-lg">No entries for this day yet.</p>
          <p className="text-sm mt-2">Start by adding your first food or activity!</p>
        </div>
      )}
    </div>
  );
};

export default DailySummary;
