import { format, subDays } from 'date-fns';
import type { DailyEntry } from '../types';

export const getCaloriesSeries = (allEntries: Record<string, DailyEntry>, days = 7) => {
  const today = new Date();
  const labels: string[] = [];
  const values: number[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(today, i);
    const key = format(d, 'yyyy-MM-dd');
    labels.push(format(d, 'EEE'));
    values.push(allEntries[key]?.totalCalories || 0);
  }

  return { labels, values };
};

export const macroBreakdown = (allEntries: Record<string, DailyEntry>, days = 7) => {
  const today = new Date();
  let protein = 0;
  let carbs = 0;
  let fats = 0;
  for (let i = 0; i < days; i++) {
    const d = subDays(today, i);
    const key = format(d, 'yyyy-MM-dd');
    const e = allEntries[key];
    if (!e) continue;
    protein += e.totalProtein || 0;
    carbs += e.totalCarbs || 0;
    fats += e.totalFats || 0;
  }

  const total = protein + carbs + fats || 1;
  return { protein, carbs, fats, proteinPct: Math.round((protein / total) * 100), carbsPct: Math.round((carbs / total) * 100), fatsPct: Math.round((fats / total) * 100) };
};

export const nutritionGoalAchievementRate = (allEntries: Record<string, DailyEntry>, targets: { dailyCalories: number }, days = 7) => {
  const today = new Date();
  let met = 0;
  for (let i = 0; i < days; i++) {
    const d = subDays(today, i);
    const key = format(d, 'yyyy-MM-dd');
    const e = allEntries[key];
    if (!e) continue;
    const pct = (e.totalCalories / targets.dailyCalories) * 100;
    if (pct >= 90 && pct <= 110) met++;
  }
  return Math.round((met / days) * 100);
};

export default { getCaloriesSeries, macroBreakdown, nutritionGoalAchievementRate };
