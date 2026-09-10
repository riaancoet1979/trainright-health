import { format, subDays } from 'date-fns';
import type { DailyEntry } from '../types';

export interface SevenDaySeries {
  labels: string[];
  values: number[];
}

export const get7DaySeries = (allEntries: Record<string, DailyEntry>, key: 'pushups' | 'steps') : SevenDaySeries => {
  const today = new Date();
  const labels: string[] = [];
  const values: number[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = subDays(today, i);
    const dateStr = format(d, 'yyyy-MM-dd');
    const entry = allEntries[dateStr];
    labels.push(format(d, 'EEE'));

    if (key === 'pushups') {
      values.push(entry?.fitness?.pushups?.totalReps || 0);
    } else {
      values.push(entry?.fitness?.steps?.steps || 0);
    }
  }

  return { labels, values };
};

export const weeklyPushupCompletionRate = (allEntries: Record<string, DailyEntry>, goal = 100): number => {
  const series = get7DaySeries(allEntries, 'pushups').values;
  const met = series.filter((v) => v >= goal).length;
  return Math.round((met / series.length) * 100);
};

export const steps7DayAverage = (allEntries: Record<string, DailyEntry>): number => {
  const series = get7DaySeries(allEntries, 'steps').values;
  const total = series.reduce((s, v) => s + v, 0);
  return Math.round(total / series.length);
};

export const getStreaks = (allEntries: Record<string, DailyEntry>, key: 'pushups' | 'steps', minThreshold = 1) => {
  // returns { current: number, longest: number }
  const series = get7DaySeries(allEntries, key).values;
  let longest = 0;
  let current = 0;
  let running = 0;

  for (let i = 0; i < series.length; i++) {
    if (series[i] >= minThreshold) {
      running++;
      if (running > longest) longest = running;
    } else {
      running = 0;
    }
  }

  // current streak (from most recent backwards)
  current = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] >= minThreshold) current++;
    else break;
  }

  return { current, longest };
};

export const getPersonalRecords = (allEntries: Record<string, DailyEntry>) => {
  let bestPushups = { date: '', reps: 0 };
  let bestSteps = { date: '', steps: 0 };

  Object.keys(allEntries).forEach((date) => {
    const e = allEntries[date];
    const reps = e.fitness?.pushups?.totalReps || 0;
    const steps = e.fitness?.steps?.steps || 0;

    if (reps > bestPushups.reps) bestPushups = { date, reps };
    if (steps > bestSteps.steps) bestSteps = { date, steps };
  });

  return { bestPushups, bestSteps };
};

export default {
  get7DaySeries,
  weeklyPushupCompletionRate,
  steps7DayAverage,
  getStreaks,
  getPersonalRecords,
};
