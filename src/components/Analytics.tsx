import { useMemo, useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import {
  Chart,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getAllDailyEntries } from '../utils/storage';
import { getTargetsForDate } from '../utils/training';
import type { DailyEntry } from '../types';

// Register Chart.js components centrally (also used by FitnessAnalytics)
Chart.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
);

const STEP_GOAL = 5000;

const chartOptions = (targetLine?: number) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { enabled: true },
  },
  scales: {
    y: {
      beginAtZero: true,
      ...(targetLine
        ? {
            suggestedMax: targetLine * 1.2,
          }
        : {}),
      grid: { color: 'rgba(128,128,128,0.1)' },
    },
    x: {
      grid: { display: false },
    },
  },
});

const ChartPlaceholder = () => (
  <div className="h-full flex items-center justify-center text-sm text-gray-400">
    Loading chart…
  </div>
);

const TargetLine = ({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) => (
  <div
    className="flex items-center gap-1.5 text-xs mt-1"
    style={{ color }}
  >
    <span
      className="inline-block w-6 border-t-2 border-dashed"
      style={{ borderColor: color }}
    />
    <span>
      Target: {value.toLocaleString()} {label}
    </span>
  </div>
);

const Analytics = () => {
  const allEntries = getAllDailyEntries();
  const todayTargets = getTargetsForDate(new Date());
  const today = format(new Date(), 'yyyy-MM-dd');

  // Week navigation: 0 = current 7 days, -1 = last week, -2 = two weeks ago…
  const [weekOffset, setWeekOffset] = useState(0);

  // Lazy-load Bar chart component
  type BarComponent = typeof import('react-chartjs-2')['Bar'];
  const [BarComp, setBarComp] = useState<BarComponent | null>(null);
  useEffect(() => {
    let mounted = true;
    import('react-chartjs-2')
      .then((mod) => {
        if (mounted) setBarComp(() => mod.Bar ?? null);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Compute 7-day window based on weekOffset
  const weekDays = useMemo(() => {
    const windowEnd = subDays(new Date(), Math.abs(weekOffset) * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(windowEnd, 6 - i);
      const dateStr = format(d, 'yyyy-MM-dd');
      return {
        dateStr,
        label: format(d, 'EEE d'),
        entry: allEntries[dateStr] as DailyEntry | undefined,
      };
    });
  }, [allEntries, weekOffset]);

  const weekLabel = useMemo(() => {
    const windowEnd = subDays(new Date(), Math.abs(weekOffset) * 7);
    const windowStart = subDays(windowEnd, 6);
    return `${format(windowStart, 'd MMM')} – ${format(windowEnd, 'd MMM yyyy')}`;
  }, [weekOffset]);

  const todayEntry = allEntries[today] as DailyEntry | undefined;

  // Chart data arrays
  const chartLabels = weekDays.map((d) => d.label);
  const caloriesData = weekDays.map((d) => d.entry?.totalCalories ?? 0);
  const proteinData = weekDays.map((d) => d.entry?.totalProtein ?? 0);
  const stepsData = weekDays.map((d) => d.entry?.fitness?.steps?.steps ?? 0);
  const pushupsData = weekDays.map((d) => d.entry?.fitness?.pushups?.setsCompleted ?? 0);

  // Weekly averages for selected window
  const weekEntries = weekDays.filter((d) => d.entry).map((d) => d.entry!);

  const avgCalories =
    weekEntries.length > 0
      ? Math.round(weekEntries.reduce((s, e) => s + e.totalCalories, 0) / weekEntries.length)
      : 0;
  const avgProtein =
    weekEntries.length > 0
      ? Math.round(weekEntries.reduce((s, e) => s + e.totalProtein, 0) / weekEntries.length)
      : 0;
  const avgSteps =
    weekEntries.length > 0
      ? Math.round(
          weekEntries.reduce((s, e) => s + (e.fitness?.steps?.steps ?? 0), 0) /
            weekEntries.length,
        )
      : 0;
  const pushupDaysCompleted = weekEntries.filter(
    (e) => (e.fitness?.pushups?.setsCompleted ?? 0) > 0,
  ).length;
  const avgPushupSets =
    weekEntries.length > 0
      ? Math.round(
          weekEntries.reduce((s, e) => s + (e.fitness?.pushups?.setsCompleted ?? 0), 0) /
            weekEntries.length,
        )
      : 0;

  // Today-specific data (progress bars only shown for current week)
  const todayCalories = todayEntry?.totalCalories ?? 0;
  const todayProtein = todayEntry?.totalProtein ?? 0;
  const todayCarbs = todayEntry?.totalCarbs ?? 0;
  const todayFats = todayEntry?.totalFats ?? 0;
  const todayPushups = todayEntry?.fitness?.pushups?.setsCompleted ?? 0;
  const todaySteps = todayEntry?.fitness?.steps?.steps ?? 0;

  const caloriesPercent = Math.round((todayCalories / todayTargets.dailyCalories) * 100);
  const proteinProgressPct = Math.round((todayProtein / todayTargets.dailyProtein) * 100);
  const stepsPercent = Math.round((todaySteps / STEP_GOAL) * 100);

  // Macro percentages (today)
  const totalMacros = todayCalories > 0 ? todayCalories : 1;
  const proteinCalsPct = Math.round(((todayProtein * 4) / totalMacros) * 100);
  const carbsCalsPct = Math.round(((todayCarbs * 4) / totalMacros) * 100);
  const fatsCalsPct = Math.round(((todayFats * 9) / totalMacros) * 100);

  // Macro percentages (week average)
  const weekProteinCal =
    weekEntries.length > 0
      ? weekEntries.reduce((s, e) => s + e.totalProtein * 4, 0) / weekEntries.length
      : 0;
  const weekCarbsCal =
    weekEntries.length > 0
      ? weekEntries.reduce((s, e) => s + e.totalCarbs * 4, 0) / weekEntries.length
      : 0;
  const weekFatsCal =
    weekEntries.length > 0
      ? weekEntries.reduce((s, e) => s + e.totalFats * 9, 0) / weekEntries.length
      : 0;
  const weekTotalMacrosCal = weekProteinCal + weekCarbsCal + weekFatsCal || 1;
  const weekProteinPct = Math.round((weekProteinCal / weekTotalMacrosCal) * 100);
  const weekCarbsPct = Math.round((weekCarbsCal / weekTotalMacrosCal) * 100);
  const weekFatsPct = Math.round((weekFatsCal / weekTotalMacrosCal) * 100);

  // Calorie streak (always from today, not week-relative)
  const calorieStreak = useMemo(() => {
    let streak = 0;
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const d = format(subDays(now, i), 'yyyy-MM-dd');
      const e = allEntries[d];
      if (e && e.totalCalories > 0) streak++;
      else break;
    }
    return streak;
  }, [allEntries]);

  const weekGoalPct =
    weekEntries.length > 0
      ? Math.round(
          (weekEntries.filter((e) => e.totalCalories >= todayTargets.dailyCalories * 0.9).length /
            weekEntries.length) *
            100,
        )
      : 0;

  // Reusable bar chart dataset builder
  const makeBarData = (data: number[], color: string, label: string) => ({
    labels: chartLabels,
    datasets: [
      {
        label,
        data,
        backgroundColor: color,
        borderRadius: 4,
        barPercentage: 0.7,
      },
    ],
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Analytics</h1>

      {/* ── Week Navigator ── */}
      <section className="card p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="font-semibold text-sm">
              {weekOffset === 0
                ? 'This Week'
                : weekOffset === -1
                  ? 'Last Week'
                  : `${Math.abs(weekOffset)} weeks ago`}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{weekLabel}</p>
          </div>
          <button
            onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
            disabled={weekOffset >= 0}
            className={`p-2 rounded-lg transition-colors ${
              weekOffset < 0
                ? 'hover:bg-gray-100 dark:hover:bg-gray-700'
                : 'opacity-30 cursor-not-allowed'
            }`}
            aria-label="Next week"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ── Today's Progress (current week only) ── */}
      {weekOffset === 0 && (
        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-6">Today's Progress</h2>

          <div className="space-y-6">
            {/* Calories */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="font-semibold">Calories</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {todayCalories} / {todayTargets.dailyCalories}
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
                  {todayProtein}g / {todayTargets.dailyProtein}g
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-green-500 h-3 transition-all duration-300"
                  style={{ width: `${Math.min(100, proteinProgressPct)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{proteinProgressPct}% of target</p>
            </div>

            {/* Steps */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="font-semibold">Steps</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {todaySteps.toLocaleString()} / {STEP_GOAL.toLocaleString()}
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

            {/* Macro Breakdown (today) */}
            <div>
              <p className="font-semibold mb-3">Macro Breakdown</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                    {proteinCalsPct}%
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Protein</p>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {carbsCalsPct}%
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Carbs</p>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600 dark:text-red-400">
                    {fatsCalsPct}%
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
      )}

      {/* ── Weekly Charts ── */}
      <section className="card p-6">
        <h2 className="text-2xl font-bold mb-6">Charts</h2>

        <div className="space-y-8">
          {/* Calories Chart */}
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Daily Calories
            </p>
            <div className="h-36">
              {BarComp ? (
                <BarComp
                  data={makeBarData(caloriesData, 'rgba(59,130,246,0.75)', 'Calories')}
                  options={chartOptions(todayTargets.dailyCalories)}
                />
              ) : (
                <ChartPlaceholder />
              )}
            </div>
            <TargetLine
              value={todayTargets.dailyCalories}
              label="cal target"
              color="rgba(59,130,246,0.6)"
            />
          </div>

          {/* Protein Chart */}
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Daily Protein (g)
            </p>
            <div className="h-36">
              {BarComp ? (
                <BarComp
                  data={makeBarData(proteinData, 'rgba(34,197,94,0.75)', 'Protein (g)')}
                  options={chartOptions(todayTargets.dailyProtein)}
                />
              ) : (
                <ChartPlaceholder />
              )}
            </div>
            <TargetLine
              value={todayTargets.dailyProtein}
              label="g target"
              color="rgba(34,197,94,0.7)"
            />
          </div>

          {/* Steps Chart */}
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Daily Steps
            </p>
            <div className="h-36">
              {BarComp ? (
                <BarComp
                  data={makeBarData(stepsData, 'rgba(168,85,247,0.75)', 'Steps')}
                  options={chartOptions(STEP_GOAL)}
                />
              ) : (
                <ChartPlaceholder />
              )}
            </div>
            <TargetLine value={STEP_GOAL} label="step goal" color="rgba(168,85,247,0.7)" />
          </div>

          {/* Pushup Sets Chart */}
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Pushup Sets per Day
            </p>
            <div className="h-36">
              {BarComp ? (
                <BarComp
                  data={makeBarData(pushupsData, 'rgba(99,102,241,0.75)', 'Sets')}
                  options={chartOptions()}
                />
              ) : (
                <ChartPlaceholder />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Week Summary ── */}
      <section className="card p-6">
        <h2 className="text-2xl font-bold mb-6">
          {weekOffset === 0 ? 'This Week' : weekOffset === -1 ? 'Last Week' : `${Math.abs(weekOffset)} Weeks Ago`}
          {' '}Summary
        </h2>

        <div className="space-y-6">
          {/* Avg Calories */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-semibold">Average Calories</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{avgCalories} cal/day</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-500 h-3 transition-all duration-300"
                style={{ width: `${Math.min(100, (avgCalories / todayTargets.dailyCalories) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Based on {weekEntries.length} days of data</p>
          </div>

          {/* Avg Protein */}
          <div>
            <div className="flex justify-between mb-2">
              <span className="font-semibold">Average Protein</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{avgProtein}g/day</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-green-500 h-3 transition-all duration-300"
                style={{ width: `${Math.min(100, (avgProtein / todayTargets.dailyProtein) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Target: {todayTargets.dailyProtein}g/day</p>
          </div>

          {/* Avg Steps */}
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
                style={{ width: `${Math.min(100, (avgSteps / STEP_GOAL) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Goal: {STEP_GOAL.toLocaleString()} steps/day</p>
          </div>

          {/* Week Macro Mix */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="font-semibold mb-3">Macro Mix (week avg)</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">
                  {weekProteinPct}%
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Protein</p>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {weekCarbsPct}%
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Carbs</p>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-600 dark:text-red-400">
                  {weekFatsPct}%
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Fats</p>
              </div>
            </div>
          </div>

          {/* Pushup Days */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Days with Pushups</span>
              <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {pushupDaysCompleted} / 7
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Avg {avgPushupSets} set{avgPushupSets !== 1 ? 's' : ''}/day ·{' '}
              {pushupDaysCompleted === 7
                ? '🎉 Perfect week!'
                : pushupDaysCompleted >= 5
                  ? 'Great effort!'
                  : 'Keep going!'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Achievements & Streaks (always shows current streak) ── */}
      <section className="card p-6">
        <h2 className="text-2xl font-bold mb-6">Achievements</h2>

        <div className="space-y-4">
          {/* Calorie Streak */}
          <div className="p-4 rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">Nutrition Streak</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Consecutive days with food logged
                </p>
              </div>
              <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {calorieStreak}
              </span>
            </div>
          </div>

          {/* Week Data Summary */}
          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="font-semibold mb-3">Week Data</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-600 dark:text-gray-400">Days Tracked</p>
                <p className="font-bold">{weekEntries.length}/7</p>
              </div>
              <div>
                <p className="text-gray-600 dark:text-gray-400">Calorie Goal Met</p>
                <p className="font-bold">{weekGoalPct}%</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Empty State */}
      {weekEntries.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-2">No data for this week</p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            {weekOffset === 0
              ? 'Start logging your meals and fitness to see analytics here'
              : 'No data was recorded for this period'}
          </p>
        </div>
      )}
    </div>
  );
};

export default Analytics;
