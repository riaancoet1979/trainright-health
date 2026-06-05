import { useState } from 'react';
import { Activity, Plus } from 'lucide-react';
import type { Exercise } from '../types';
import { addExercise } from '../utils/storage';

interface ExerciseEntryProps {
  selectedDate: Date;
  onEntryAdded: () => void;
}

const ExerciseEntry = ({ selectedDate, onEntryAdded }: ExerciseEntryProps) => {
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('30');
  const [type, setType] = useState<'cardio' | 'strength' | 'walking' | 'other'>('cardio');
  const [caloriesPerMinute, setCaloriesPerMinute] = useState('5');

  const calculateCaloriesBurned = () => {
    const durationNum = parseFloat(duration) || 0;
    const calsPerMin = parseFloat(caloriesPerMinute) || 0;
    return Math.round(durationNum * calsPerMin);
  };

  const handleAddExercise = () => {
    if (!name || !duration) return;

    const exercise: Exercise = {
      id: `${Date.now()}-${Math.random()}`,
      name,
      duration: parseFloat(duration),
      caloriesBurned: calculateCaloriesBurned(),
      type,
      timestamp: new Date().toISOString(),
    };

    addExercise(selectedDate, exercise);

    // Reset form
    setName('');
    setDuration('30');
    setCaloriesPerMinute('5');
    onEntryAdded();
  };

  // Preset activities with estimated calories per minute
  const presetActivities = [
    { name: 'Walking (Moderate)', type: 'walking' as const, calsPerMin: 4 },
    { name: 'Running', type: 'cardio' as const, calsPerMin: 10 },
    { name: 'Cycling', type: 'cardio' as const, calsPerMin: 8 },
    { name: 'Swimming', type: 'cardio' as const, calsPerMin: 9 },
    { name: 'Weight Training', type: 'strength' as const, calsPerMin: 6 },
    { name: 'Yoga', type: 'other' as const, calsPerMin: 3 },
    { name: 'HIIT', type: 'cardio' as const, calsPerMin: 12 },
  ];

  const handlePresetSelect = (activity: typeof presetActivities[0]) => {
    setName(activity.name);
    setType(activity.type);
    setCaloriesPerMinute(activity.calsPerMin.toString());
  };

  const totalCalories = calculateCaloriesBurned();

  return (
    <div className="card">
      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Activity className="w-6 h-6" />
        Add Activity
      </h3>

      {/* Quick Presets */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Quick Add</label>
        <div className="grid grid-cols-2 gap-2">
          {presetActivities.map((activity) => (
            <button
              key={activity.name}
              onClick={() => handlePresetSelect(activity)}
              className="py-2 px-3 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              {activity.name}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Name */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Activity Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Morning Run"
          className="input-field"
        />
      </div>

      {/* Activity Type */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(['cardio', 'strength', 'walking', 'other'] as const).map((activityType) => (
            <button
              key={activityType}
              onClick={() => setType(activityType)}
              className={`py-2 px-4 rounded-lg font-medium capitalize transition-colors ${
                type === activityType
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {activityType}
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Duration (minutes)</label>
        <input
          type="number"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="30"
          className="input-field"
          min="1"
          step="1"
        />
      </div>

      {/* Calories per Minute */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Calories per Minute (estimate)
        </label>
        <input
          type="number"
          value={caloriesPerMinute}
          onChange={(e) => setCaloriesPerMinute(e.target.value)}
          placeholder="5"
          className="input-field"
          min="0"
          step="0.5"
        />
        <p className="text-xs text-gray-500 mt-1">
          Adjust based on intensity (light: 3-5, moderate: 5-8, intense: 8-12)
        </p>
      </div>

      {/* Calorie Preview */}
      <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
        <div className="text-sm text-gray-600 dark:text-gray-400">Estimated Calories Burned</div>
        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
          {totalCalories} cal
        </div>
      </div>

      {/* Add Button */}
      <button
        onClick={handleAddExercise}
        disabled={!name || !duration}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="w-5 h-5" />
        Add Activity
      </button>
    </div>
  );
};

export default ExerciseEntry;
