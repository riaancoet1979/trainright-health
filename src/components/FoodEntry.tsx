import { useState } from 'react';
import { Search, Plus, X, Minus, Apple, Scale, CalendarDays } from 'lucide-react';
import { format, isToday } from 'date-fns';
import type { FoodItem, FoodEntry as FoodEntryType } from '../types';
import { calculatePortionNutrients, addFoodEntry, getAllFoods } from '../utils/storage';

interface FoodEntryProps {
  selectedDate: Date;
  onEntryAdded: () => void;
}

const FoodEntry = ({ selectedDate, onEntryAdded }: FoodEntryProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [portion, setPortion] = useState('100');
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [showResults, setShowResults] = useState(false);
  const [inputMode, setInputMode] = useState<'weight' | 'piece'>('weight');
  const [pieceCount, setPieceCount] = useState(1);

  const allFoods = getAllFoods();
  const filteredFoods = allFoods.filter(
    (food) =>
      food.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      food.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      food.brand?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFoodSelect = (food: FoodItem) => {
    setSelectedFood(food);
    setSearchTerm(food.name);
    setShowResults(false);
    // Auto-detect serving type
    if (food.servingType === 'piece') {
      setInputMode('piece');
      setPieceCount(1);
    } else {
      setInputMode('weight');
      setPortion('100');
    }
  };

  const calculateNutrients = () => {
    if (!selectedFood) return null;

    let totalWeight: number;
    if (inputMode === 'piece' && selectedFood.servingType === 'piece' && selectedFood.averageWeight) {
      totalWeight = pieceCount * selectedFood.averageWeight;
    } else {
      totalWeight = parseFloat(portion) || 0;
    }

    return {
      ...calculatePortionNutrients(
        selectedFood.calories,
        selectedFood.protein,
        selectedFood.carbs,
        selectedFood.fats,
        totalWeight
      ),
      totalWeight,
    };
  };

  const handleAddFood = () => {
    if (!selectedFood) return;

    const nutrients = calculateNutrients();
    if (!nutrients) return;

    const entry: FoodEntryType = {
      id: `${Date.now()}-${Math.random()}`,
      foodId: selectedFood.id,
      foodName: selectedFood.name,
      portion: nutrients.totalWeight,
      calories: nutrients.calories,
      protein: nutrients.protein,
      carbs: nutrients.carbs,
      fats: nutrients.fats,
      mealType,
      timestamp: new Date().toISOString(),
      pieceCount: inputMode === 'piece' ? pieceCount : undefined,
      servingType: inputMode,
    };

    addFoodEntry(selectedDate, entry);

    // Reset form
    setSelectedFood(null);
    setSearchTerm('');
    setPortion('100');
    setPieceCount(1);
    setInputMode('weight');
    onEntryAdded();
  };

  const nutrients = calculateNutrients();

  const loggingToday = isToday(selectedDate);

  return (
    <div className="card">
      <h3 className="text-xl font-bold mb-4">Add Food</h3>
      {!loggingToday && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-200">
          <CalendarDays className="w-4 h-4 flex-shrink-0" />
          <span>
            Logging to <strong>{format(selectedDate, 'EEE d MMM')}</strong> — not today.
          </span>
        </div>
      )}

      {/* Food Search */}
      <div className="relative mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowResults(true);
              setSelectedFood(null);
            }}
            onFocus={() => setShowResults(true)}
            placeholder="Search for food..."
            className="input-field pl-10"
          />
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedFood(null);
                setShowResults(false);
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {showResults && searchTerm && !selectedFood && (
          <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {filteredFoods.length > 0 ? (
              filteredFoods.slice(0, 20).map((food) => (
                <button
                  key={food.id}
                  onClick={() => handleFoodSelect(food)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{food.name}</span>
                    {food.isCustom && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {food.calories} cal • {food.protein}g protein • {food.category}
                    {food.brand && ` • ${food.brand}`}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-gray-500">No foods found</div>
            )}
          </div>
        )}
      </div>

      {/* Portion Input */}
      <div className="mb-4">
        {/* Mode Toggle (only for piece-based foods) */}
        {selectedFood?.servingType === 'piece' && (
          <div className="mb-3">
            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <button
                onClick={() => setInputMode('piece')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-medium transition-colors ${
                  inputMode === 'piece'
                    ? 'bg-white dark:bg-gray-700 shadow-sm'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <Apple className="w-4 h-4" />
                Pieces
              </button>
              <button
                onClick={() => setInputMode('weight')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-medium transition-colors ${
                  inputMode === 'weight'
                    ? 'bg-white dark:bg-gray-700 shadow-sm'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <Scale className="w-4 h-4" />
                Weight (g)
              </button>
            </div>
          </div>
        )}

        {/* Piece Mode UI */}
        {inputMode === 'piece' && selectedFood?.servingType === 'piece' ? (
          <div>
            <label className="block text-sm font-medium mb-2">Number of Pieces</label>

            {/* Quick Increment Buttons - Horizontal Scrollable */}
            <div className="mb-3 overflow-x-auto">
              <div className="flex gap-2 pb-2 min-w-min">
                {[1, 2, 3, 5, 10].map((count) => (
                  <button
                    key={count}
                    onClick={() => setPieceCount(count)}
                    className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium transition-colors ${
                      pieceCount === count
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            {/* Stepper Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPieceCount(Math.max(1, pieceCount - 1))}
                className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
                aria-label="Decrease"
              >
                <Minus className="w-5 h-5" />
              </button>

              <input
                type="number"
                value={pieceCount}
                onChange={(e) => setPieceCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="input-field text-center flex-1"
                min="1"
                step="1"
              />

              <button
                onClick={() => setPieceCount(pieceCount + 1)}
                className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
                aria-label="Increase"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* Calculated Weight Display */}
            {selectedFood.averageWeight && (
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                ≈ {pieceCount * selectedFood.averageWeight}g total
              </div>
            )}
          </div>
        ) : (
          /* Weight Mode UI */
          <div>
            <label className="block text-sm font-medium mb-2">Portion (grams)</label>
            <input
              type="number"
              value={portion}
              onChange={(e) => setPortion(e.target.value)}
              placeholder="100"
              className="input-field"
              min="0"
              step="1"
            />
          </div>
        )}
      </div>

      {/* Meal Type */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Meal Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setMealType(type)}
              className={`py-2 px-4 rounded-lg font-medium capitalize transition-colors ${
                mealType === type
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Nutrition Preview */}
      {selectedFood && nutrients && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <h4 className="font-semibold mb-2">
            Nutrition for{' '}
            {inputMode === 'piece' && selectedFood.servingType === 'piece'
              ? `${pieceCount} piece${pieceCount > 1 ? 's' : ''} (${nutrients.totalWeight}g)`
              : `${nutrients.totalWeight}g`}
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-600 dark:text-gray-400">Calories:</span>
              <span className="ml-2 font-medium">{nutrients.calories}</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Protein:</span>
              <span className="ml-2 font-medium">{nutrients.protein}g</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Carbs:</span>
              <span className="ml-2 font-medium">{nutrients.carbs}g</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Fats:</span>
              <span className="ml-2 font-medium">{nutrients.fats}g</span>
            </div>
          </div>
        </div>
      )}

      {/* Add Button */}
      <button
        onClick={handleAddFood}
        disabled={!selectedFood || !portion}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="w-5 h-5" />
        Add Food
      </button>
    </div>
  );
};

export default FoodEntry;
