import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { getAllDailyEntries, getUserSettings } from '../utils/storage';
import type { DailyEntry } from '../types';

const Analytics = () => {
  const allEntries = getAllDailyEntries();
  const userSettings = getUserSettings();
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayEntry = allEntries[today];

  // Calculate stats for last 7 days
  const last7Days = useMemo(() => {
    const days: DailyEntry[] = [];
    for (let i = 0; i < 7; i++) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      if (allEntries[d]) days.push(allEntries[d]);
    }
    return days;
  }, [allEntries]);

  // Today's nutrition
  const todayCalories = todayEntry?.totalCalories ?? 0;
  const todayProtein = todayEntry?.totalProtein ?? 0;
  const todayCarbs = todayEntry?.totalCarbs ?? 0;
  const todayFats = todayEntry?.totalFats ?? 0;

  // Today's fitness
  const todayPushups = todayEntry?.fitness?.pushups?.setsCompleted ?? 0;
  const todaySteps = todayEntry?.fitness?.steps?.steps ?? 0;

  // Weekly averages
  const avgCalories = useMemo(() => {
    if (last7Days.length === 0) return 0;
    const total = last7Days.reduce((sum, e) => sum + e.totalCalories, 0);
    return Math.round(total / last7Days.length);
  }, [last7Days]);

  const avgProtein = useMemo(() => {
    if (last7Days.length === 0) return 0;
    const total = last7Days.reduce((sum, e) => sum + e.totalProtein, 0);
    return Math.round(total / last7Days.length);
  }, [last7Days]);

  const avgSteps = useMemo(() => {
    if (last7Days.length === 0) return 0;
    const total = last7Days.reduce((sum, e) => sum + (e.fitness?.steps?.steps ?? 0), 0);
    return Math.round(total / last7Days.length);
  }, [last7Days]);

  // Weekly pushup completion (how many days had at least 1 set)
  const pushupDaysCompleted = useMemo(() => {
    return last7Days.filter(e => (e.fitness?.pushups?.setsCompleted ?? 0) > 0).length;
  }, [last7Days]);

  // Goal achievement streak
  const calorieStreak = useMemo(() => {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = format(subDays(today, i), 'yyyy-MM-dd');
      const entry = allEntries[d];
      if (entry && entry.totalCalories > 0) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }, [allEntries]);

  // Macro percentages
  const totalMacros = todayCalories > 0 ? todayCalories : 1;
  const proteinCals = todayProtein * 4;
  const carbsCals = todayCarbs * 4;
  const fatsCals = todayFats * 9;
  const proteinPercent = Math.round((proteinCals / totalMacros) * 100);
  const carbsPercent = Math.round((carbsCals / totalMacros) * 100);
  const fatsPercent = Math.round((fatsCals / totalMacros) * 100);

  // Progress percentages
  const caloriesPercent = Math.round((todayCalories / userSettings.targets.dailyCalories) * 100);
  const proteinPercent2 = Math.round((todayProtein / userSettings.targets.dailyProtein) * 100);
  const stepsPercent = Math.round((todaySteps / 10000) * 100);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Analytics</h1>

      {/* Today's Progress */}
      <section className="card p-6">
        <h2 className="text-2xl font-bold mb-6">Today's Progress</h2>

        <div className="space-y-6">
          {/* Calories */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-semibold">Calories</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {todayCalories} / {userSettings.targets.dailyCalories}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-500 h-3 transition-all duration-300"
                style={{ width: `${Math.min(100, caloriesPercent)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{caloriesPercent}% of target</p>
          </div>

          {/* Protein */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-semibold">Protein</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {todayProtein}g / {userSettings.targets.dailyProtein}g
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-green-500 h-3 transition-all duration-300"
                style={{ width: `${Math.min(100, proteinPercent2)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{proteinPercent2}% of target</p>
          </div>

          {/* Steps */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-semibold">Steps</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {todaySteps.toLocaleString()} / 10,000
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-purple-500 h-3 transition-all duration-300"
                style={{ width: `${Math.min(100, stepsPercent)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{stepsPercent}% of goal</p>
          </div>

          {/* Macro Breakdown */}
          <div>
            <p className="font-semibold mb-3">Macro Breakdown</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">
                  {proteinPercent}%
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Protein</p>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {carbsPercent}%
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Carbs</p>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-600 dark:text-red-400">
                  {fatsPercent}%
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Fats</p>
              </div>
            </div>
          </div>

          {/* Pushups Today */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Pushup Sets Today</span>
              <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {todayPushups}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Weekly Summary */}
      <section className="card p-6">
        <h2 className="text-2xl font-bold mb-6">This Week</h2>

        <div className="space-y-6">
          {/* Weekly Calories */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-semibold">Average Calories</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{avgCalories} cal/day</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-500 h-3 transition-all duration-300"
                style={{ width: `${Math.min(100, (avgCalories / userSettings.targets.dailyCalories) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Based on {last7Days.length} days of data</p>
          </div>

          {/* Weekly Protein */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-semibold">Average Protein</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{avgProtein}g/day</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-green-500 h-3 transition-all duration-300"
                style={{ width: `${Math.min(100, (avgProtein / userSettings.targets.dailyProtein) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Target: {userSettings.targets.dailyProtein}g/day</p>
          </div>

          {/* Weekly Steps */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-semibold">Average Steps</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {avgSteps.toLocaleString()} steps/day
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-purple-500 h-3 transition-all duration-300"
                style={{ width: `${Math.min(100, (avgSteps / 10000) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Goal: 10,000 steps/day</p>
          </div>

          {/* Pushup Days Completed */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Days with Pushups</span>
              <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {pushupDaysCompleted} / 7
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {pushupDaysCompleted === 7
                ? '🎉 Perfect week!'
                : pushupDaysCompleted >= 5
                  ? 'Great effort!'
                  : 'Keep going!'}
            </p>
          </div>
        </div>
      </section>

      {/* Achievements & Streaks */}
      <section className="card p-6">
        <h2 className="text-2xl font-bold mb-6">Achievements</h2>

        <div className="space-y-4">
          {/* Calorie Streak */}
          <div className="p-4 rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">Nutrition Streak</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Consecutive days with food logged</p>
              </div>
              <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">{calorieStreak}</span>
            </div>
          </div>

          {/* Data Summary */}
          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="font-semibold mb-3">Week Summary</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-600 dark:text-gray-400">Days Tracked</p>
                <p className="font-bold">{last7Days.length}/7</p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Avg Goal Met</p>
                <p className="font-bold">
                  {last7Days.length > 0
                    ? Math.round(
                        (last7Days.filter(
                          (e) =>
                            e.totalCalories >=
                            userSettings.targets.dailyCalories * 0.9,
                        ).length /
                          last7Days.length) *
                          100,
                      )
                    : 0}
                  %
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Empty State */}
      {last7Days.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-2">No data yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Start logging your meals and fitness to see analytics here
          </p>
        </div>
      )}
    </div>
  );
};

export default Analytics;
