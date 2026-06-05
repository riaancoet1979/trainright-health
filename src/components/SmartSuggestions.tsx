import { useMemo } from 'react';
import { Lightbulb, Plus } from 'lucide-react';
import { getSuggestions, getCategorySuggestions } from '../utils/suggestions';
import type { DailyEntry, FoodItem } from '../types';
import type { FoodSuggestion, NutrientDeficit } from '../utils/suggestions';
import { getUserSettings } from '../utils/storage';

interface SmartSuggestionsProps {
  dailyEntry: DailyEntry;
  onQuickAdd: (food: FoodItem, portion: number) => void;
}

const SmartSuggestions = ({ dailyEntry, onQuickAdd }: SmartSuggestionsProps) => {
  const userSettings = getUserSettings();

  // Calculate current deficit
  const deficit = useMemo((): NutrientDeficit => {
    return {
      calories: Math.max(0, userSettings.targets.dailyCalories - dailyEntry.totalCalories),
      protein: Math.max(0, userSettings.targets.dailyProtein - dailyEntry.totalProtein),
      carbs: Math.max(0, userSettings.targets.dailyCarbs - dailyEntry.totalCarbs),
      fats: Math.max(0, userSettings.targets.dailyFats - dailyEntry.totalFats),
    };
  }, [dailyEntry, userSettings]);

  // Get IDs of foods already eaten today
  const eatenFoodIds = useMemo(() => {
    return dailyEntry.foodEntries.map((e) => e.foodId);
  }, [dailyEntry.foodEntries]);

  // Get suggestions
  const suggestions = useMemo(
    () => getSuggestions(deficit, eatenFoodIds, 4),
    [deficit, eatenFoodIds],
  );

  // Get category-specific suggestions
  const categorySuggestions = useMemo(
    () => getCategorySuggestions(deficit, eatenFoodIds),
    [deficit, eatenFoodIds],
  );

  // If no deficit, don't show suggestions
  if (deficit.calories === 0 && deficit.protein === 0 && deficit.carbs === 0 && deficit.fats === 0) {
    return (
      <div className="card p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🎉</span>
          <h3 className="font-semibold text-green-800 dark:text-green-200">Goals Met!</h3>
        </div>
        <p className="text-sm text-green-700 dark:text-green-300">
          You've hit all your nutrition targets for today!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Deficit Summary */}
      <div className="card p-6">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold mb-3 text-lg">Smart Suggestions</h3>

            {/* Deficit display */}
            <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Still needed today:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                {deficit.calories > 0 && (
                  <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    <span className="font-bold">{deficit.calories}</span> cal
                  </div>
                )}
                {deficit.protein > 0 && (
                  <div className="p-2 rounded bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                    <span className="font-bold">{deficit.protein.toFixed(1)}</span>g protein
                  </div>
                )}
                {deficit.carbs > 0 && (
                  <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                    <span className="font-bold">{deficit.carbs.toFixed(1)}</span>g carbs
                  </div>
                )}
                {deficit.fats > 0 && (
                  <div className="p-2 rounded bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                    <span className="font-bold">{deficit.fats.toFixed(1)}</span>g fat
                  </div>
                )}
              </div>
            </div>

            {/* Top suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                  Top Recommendations
                </p>
                {suggestions.map((suggestion, idx) => (
                  <SuggestionCard
                    key={`${suggestion.food.id}-${idx}`}
                    suggestion={suggestion}
                    onAdd={() => onQuickAdd(suggestion.food, suggestion.portion)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category-based suggestions */}
      {(categorySuggestions.highProtein.length > 0 ||
        categorySuggestions.quickCalories.length > 0 ||
        categorySuggestions.balanced.length > 0) && (
        <div className="card p-6">
          <h3 className="font-semibold mb-4">Browse by Category</h3>

          <div className="space-y-4">
            {/* High Protein */}
            {categorySuggestions.highProtein.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  💪 High Protein
                </p>
                <div className="space-y-2">
                  {categorySuggestions.highProtein.map((suggestion, idx) => (
                    <SuggestionCard
                      key={`hp-${suggestion.food.id}-${idx}`}
                      suggestion={suggestion}
                      onAdd={() => onQuickAdd(suggestion.food, suggestion.portion)}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Quick Calories */}
            {categorySuggestions.quickCalories.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  ⚡ Quick Calories
                </p>
                <div className="space-y-2">
                  {categorySuggestions.quickCalories.map((suggestion, idx) => (
                    <SuggestionCard
                      key={`qc-${suggestion.food.id}-${idx}`}
                      suggestion={suggestion}
                      onAdd={() => onQuickAdd(suggestion.food, suggestion.portion)}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Balanced */}
            {categorySuggestions.balanced.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  ⚖️ Balanced Meals
                </p>
                <div className="space-y-2">
                  {categorySuggestions.balanced.map((suggestion, idx) => (
                    <SuggestionCard
                      key={`bal-${suggestion.food.id}-${idx}`}
                      suggestion={suggestion}
                      onAdd={() => onQuickAdd(suggestion.food, suggestion.portion)}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface SuggestionCardProps {
  suggestion: FoodSuggestion;
  onAdd: () => void;
  compact?: boolean;
}

const SuggestionCard = ({ suggestion, onAdd, compact = false }: SuggestionCardProps) => {
  const efficiencyColors = {
    excellent: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    great: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    good: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    okay: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between p-2 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{suggestion.food.name}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {suggestion.match.calories}cal • {suggestion.match.protein}g P • {suggestion.portion}g
          </p>
        </div>
        <button
          onClick={onAdd}
          className="ml-2 p-2 rounded bg-primary-600 hover:bg-primary-700 text-white transition-colors flex-shrink-0"
          title="Quick add this food"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1">
          <p className="font-medium">{suggestion.food.name}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Portion: {suggestion.portion}g</p>
        </div>
        <span
          className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${efficiencyColors[suggestion.efficiency]}`}
        >
          {suggestion.efficiency === 'excellent'
            ? '⭐ Perfect'
            : suggestion.efficiency === 'great'
              ? '✓ Great'
              : suggestion.efficiency === 'good'
                ? '◐ Good'
                : '○ Okay'}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1 mb-3 text-xs text-center">
        <div className="p-1 rounded bg-blue-50 dark:bg-blue-900/20">
          <span className="font-bold text-blue-700 dark:text-blue-400">{suggestion.match.calories}</span>
          <p className="text-gray-600 dark:text-gray-400">cal</p>
        </div>
        <div className="p-1 rounded bg-green-50 dark:bg-green-900/20">
          <span className="font-bold text-green-700 dark:text-green-400">{suggestion.match.protein}g</span>
          <p className="text-gray-600 dark:text-gray-400">P</p>
        </div>
        <div className="p-1 rounded bg-amber-50 dark:bg-amber-900/20">
          <span className="font-bold text-amber-700 dark:text-amber-400">{suggestion.match.carbs}g</span>
          <p className="text-gray-600 dark:text-gray-400">C</p>
        </div>
        <div className="p-1 rounded bg-red-50 dark:bg-red-900/20">
          <span className="font-bold text-red-700 dark:text-red-400">{suggestion.match.fats}g</span>
          <p className="text-gray-600 dark:text-gray-400">F</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">{suggestion.reason}</p>
        <button
          onClick={onAdd}
          className="px-3 py-1 rounded bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors flex items-center gap-1 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>
    </div>
  );
};

export default SmartSuggestions;
