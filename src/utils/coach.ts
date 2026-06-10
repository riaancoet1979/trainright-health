// ============================================================
// TrainRight Health — Coach engine
// Deterministic coaching rules over sleep, steps, food and
// training logs. Produces daily insights and a weekly review
// with actionable recommendations. Rules follow the coach
// protocol: suggest, never silently change the program.
// ============================================================

import { format } from 'date-fns';
import { getAllDailyEntries } from './storage';
import { getHealthMetrics } from './health';
import {
  getTrainingData, getSessionForDate, getTargetsForDate, dateKey, getWeekNum,
} from './training';
import { getPhaseForWeek } from '../data/program';
import type { SessionLog, LoggedSet } from '../types/training';

/**
 * Historical exercise IDs whose logs should also count toward the current ID's
 * progression analysis. Used when a phase moves from a regression to its
 * earned progression: Phase 1 logged `hollow_hold`; Phase 2 prescribes
 * `hollow_rock`, but the user's first hollow_rock weeks should still be
 * informed by the hold history.
 *
 * Keys are CURRENT (program-side) IDs; values are HISTORICAL IDs to fall back
 * to when the current ID has no log on a given session.
 */
export const EXERCISE_ID_ALIASES: Record<string, string[]> = {
  hollow_rock: ['hollow_hold'],
};

/** Resolve the logged set list for an exercise, consulting the alias map
 *  when the canonical ID has no entry on this session. */
const setsForExercise = (
  log: SessionLog,
  exId: string,
): LoggedSet[] | undefined => {
  if (log.exercises[exId]) return log.exercises[exId].sets;
  for (const alias of EXERCISE_ID_ALIASES[exId] ?? []) {
    if (log.exercises[alias]) return log.exercises[alias].sets;
  }
  return undefined;
};

export type InsightLevel = 'good' | 'warn' | 'action';

export interface Insight {
  level: InsightLevel;
  text: string;
}

const fmt = (d: Date): string => format(d, 'yyyy-MM-dd');

// ── Daily insights ──
export const dailyInsights = (date: Date | string): Insight[] => {
  const out: Insight[] = [];
  const d0 = new Date(dateKey(date) + 'T00:00:00');
  const yesterday = new Date(d0);
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = fmt(yesterday);

  const entries = getAllDailyEntries();
  const yEntry = entries[yKey];
  const yTargets = getTargetsForDate(yKey);

  // Yesterday's nutrition vs target
  if (yEntry && yEntry.totalCalories > 0) {
    const proteinGap = Math.round(yTargets.dailyProtein - (yEntry.totalProtein || 0));
    const kcalDev = Math.round((yEntry.totalCalories || 0) - yTargets.dailyCalories);
    if (proteinGap > 30) {
      out.push({ level: 'action', text: `Yesterday's protein was ${proteinGap}g under target (${Math.round(yEntry.totalProtein)}g vs ${yTargets.dailyProtein}g). Front-load the shake today.` });
    } else if (proteinGap > 15) {
      out.push({ level: 'warn', text: `Protein slightly under yesterday (${Math.round(yEntry.totalProtein)}g vs ${yTargets.dailyProtein}g).` });
    } else {
      out.push({ level: 'good', text: `Protein on point yesterday (${Math.round(yEntry.totalProtein)}g).` });
    }
    if (kcalDev > 300) {
      out.push({ level: 'warn', text: `Calories ran ${kcalDev} over target yesterday — keep today tight, don't compensate by skipping meals.` });
    } else if (kcalDev < -400) {
      out.push({ level: 'warn', text: `Calories ${Math.abs(kcalDev)} under target yesterday — too big a deficit costs muscle. Eat to target today.` });
    }
  } else {
    out.push({ level: 'warn', text: 'No food logged yesterday — the coach engine can only steer what you log.' });
  }

  // Sleep last night
  const hm = getHealthMetrics();
  const today = hm.days[dateKey(date)];
  if (today?.sleepHours !== undefined) {
    if (today.sleepHours < 6) {
      out.push({ level: 'action', text: `Sleep ${today.sleepHours}h — expect reduced output. Respect the Yellow suggestion if shown; protect technique.` });
    } else if (today.sleepHours >= 7) {
      out.push({ level: 'good', text: `Sleep ${today.sleepHours}h — green light from recovery.` });
    }
  }

  // 7-day step trend
  const stepVals: number[] = [];
  for (let i = 1; i <= 7; i++) {
    const p = new Date(d0);
    p.setDate(p.getDate() - i);
    const e = entries[fmt(p)];
    const s = e?.fitness?.steps?.steps ?? hm.days[fmt(p)]?.steps;
    if (s !== undefined && s > 0) stepVals.push(s);
  }
  if (stepVals.length >= 3) {
    const avg = Math.round(stepVals.reduce((a, b) => a + b, 0) / stepVals.length);
    if (avg < 3500) {
      out.push({ level: 'warn', text: `Steps averaging ${avg.toLocaleString()}/day — below your 5,000 goal. Calorie targets assume ~5k; add a short walk or trim ~100 kcal.` });
    } else {
      out.push({ level: 'good', text: `Steps averaging ${avg.toLocaleString()}/day over the last week.` });
    }
  }

  return out;
};

// ── Weekly review ──
export interface ExerciseRecommendation {
  exerciseName: string;
  action: 'progress' | 'hold';
  reason: string;
  how?: string;
}

export interface WeeklyReview {
  weekStart: string;
  weekNum: number | null;
  sessionsPlanned: number;
  sessionsCompleted: number;
  readinessCounts: { green: number; yellow: number; red: number };
  avgSleep: number | null;
  avgSteps: number | null;
  daysLogged: number;
  avgProtein: number | null;
  avgCalories: number | null;
  weightChangeKg: number | null; // this week avg vs previous week avg
  recommendations: Insight[];
  exerciseRecs: ExerciseRecommendation[];
}

const mondayOf = (date: Date | string): Date => {
  const d = new Date(dateKey(date) + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d;
};

/** Parse "×8–12", "×5–8", "15 s" specs to the top of the rep range. */
const topOfRange = (repsSpec: string): number | null => {
  const m = repsSpec.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (m) return parseInt(m[2], 10);
  const single = repsSpec.match(/×\s*(\d+)/);
  if (single) return parseInt(single[1], 10);
  return null;
};

export const weeklyReview = (dateInWeek: Date | string): WeeklyReview => {
  const monday = mondayOf(dateInWeek);
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    weekDates.push(fmt(d));
  }
  const weekNum = getWeekNum(weekDates[0]);
  const td = getTrainingData();
  const entries = getAllDailyEntries();
  const hm = getHealthMetrics();

  // Sessions
  let sessionsPlanned = 0;
  let sessionsCompleted = 0;
  const readinessCounts = { green: 0, yellow: 0, red: 0 };
  for (const ds of weekDates) {
    // Honor the user's per-day workout override so a Sunday log running
    // Monday's session still counts in the weekly planned/completed totals.
    const log = td.logs[ds];
    const sess = getSessionForDate(ds, { dayKeyOverride: log?.dayKeyOverride });
    if (sess) {
      sessionsPlanned++;
      if (log?.completed) sessionsCompleted++;
      if (log?.readiness) readinessCounts[log.readiness]++;
    }
  }

  // Sleep & steps
  const sleeps: number[] = [];
  const steps: number[] = [];
  for (const ds of weekDates) {
    const h = hm.days[ds];
    if (h?.sleepHours !== undefined) sleeps.push(h.sleepHours);
    const s = entries[ds]?.fitness?.steps?.steps ?? h?.steps;
    if (s !== undefined && s > 0) steps.push(s);
  }
  const avgSleep = sleeps.length ? +(sleeps.reduce((a, b) => a + b, 0) / sleeps.length).toFixed(1) : null;
  const avgSteps = steps.length ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : null;

  // Nutrition
  let daysLogged = 0; let pSum = 0; let cSum = 0;
  for (const ds of weekDates) {
    const e = entries[ds];
    if (e && e.totalCalories > 0) {
      daysLogged++;
      pSum += e.totalProtein || 0;
      cSum += e.totalCalories || 0;
    }
  }
  const avgProtein = daysLogged ? Math.round(pSum / daysLogged) : null;
  const avgCalories = daysLogged ? Math.round(cSum / daysLogged) : null;

  // Weight trend: this week's average vs previous week's average
  const weekSet = new Set(weekDates);
  const prevMonday = new Date(monday); prevMonday.setDate(prevMonday.getDate() - 7);
  const prevSet = new Set(Array.from({ length: 7 }, (_, i) => {
    const d = new Date(prevMonday); d.setDate(d.getDate() + i); return fmt(d);
  }));
  const thisW: number[] = []; const prevW: number[] = [];
  for (const m of td.bodyMetrics) {
    if (typeof m.weight !== 'number') continue;
    if (weekSet.has(m.date)) thisW.push(m.weight);
    else if (prevSet.has(m.date)) prevW.push(m.weight);
  }
  const weightChangeKg = thisW.length && prevW.length
    ? +((thisW.reduce((a, b) => a + b, 0) / thisW.length) - (prevW.reduce((a, b) => a + b, 0) / prevW.length)).toFixed(2)
    : null;

  // ── Recommendations ──
  const recs: Insight[] = [];
  if (sessionsPlanned > 0) {
    if (sessionsCompleted < Math.min(3, sessionsPlanned)) {
      recs.push({ level: 'action', text: `${sessionsCompleted}/${sessionsPlanned} sessions completed — consistency before progression. Repeat this week's loads, don't advance.` });
    } else if (sessionsCompleted === sessionsPlanned) {
      recs.push({ level: 'good', text: `All ${sessionsPlanned} sessions completed.` });
    }
  }
  if (readinessCounts.yellow + readinessCounts.red >= 2) {
    recs.push({ level: 'action', text: `${readinessCounts.yellow + readinessCounts.red} Yellow/Red days this week — recovery is lagging. Hold all progressions next week; if it repeats, take a deload (halve sets, keep technique).` });
  }
  if (avgSleep !== null && avgSleep < 6.5) {
    recs.push({ level: 'warn', text: `Average sleep ${avgSleep}h — under 6.5h chronic sleep blunts strength gains and appetite control. This is your highest-leverage fix.` });
  }
  if (avgProtein !== null && avgProtein < 130) {
    recs.push({ level: 'action', text: `Average protein ${avgProtein}g/day vs 160g target — at risk of losing muscle in a deficit. Two full shakes daily are non-negotiable.` });
  }
  if (weightChangeKg !== null) {
    if (weightChangeKg < -0.8) {
      recs.push({ level: 'action', text: `Weight dropped ${Math.abs(weightChangeKg)}kg vs last week — too fast (target ≤0.7kg/wk). Add ~150 kcal/day (carbs) in Settings.` });
    } else if (weightChangeKg > 0.3 && daysLogged >= 4) {
      recs.push({ level: 'warn', text: `Weight up ${weightChangeKg}kg this week while in fat-loss phase. Check logging accuracy before cutting — one week is noise; act only if it repeats.` });
    } else if (weightChangeKg <= 0 && weightChangeKg >= -0.7) {
      recs.push({ level: 'good', text: `Weight trend ${weightChangeKg}kg this week — right in the sustainable fat-loss band.` });
    }
  } else {
    recs.push({ level: 'warn', text: 'Not enough bodyweight logs to compute a trend — log weight 2–3×/week (same time of day).' });
  }

  // ── Exercise progression analysis ──
  const exerciseRecs: ExerciseRecommendation[] = [];
  if (weekNum) {
    const phase = getPhaseForWeek(Math.min(weekNum, 16));
    // Look at the last two logged instances of each main exercise
    const allLogs = Object.entries(td.logs).sort((a, b) => a[0].localeCompare(b[0]));
    for (const day of phase.days) {
      for (const ex of day.exercises) {
        if (ex.category === 'mobility' || ex.category === 'rehab' || ex.category === 'conditioning') continue;
        const top = topOfRange(ex.repsSpec);
        if (!top) continue;
        const instances = allLogs
          .filter(([, l]) => setsForExercise(l, ex.id)?.some((s) => s.done))
          .slice(-2);
        if (instances.length < 2) continue;
        // M-05: require ALL prescribed sets to be done at top-of-range, not
        // `>= ex.sets - 1`. Previously a 4×8-12 exercise progressed after 3
        // sets at 12 reps; the design rule is "all sets at the top of the
        // range" so the off-by-one was a real bug.
        const allAtTop = instances.every(([, l]) => {
          const sets = (setsForExercise(l, ex.id) ?? []).filter((s) => s.done);
          return sets.length >= ex.sets && sets.every((s) => {
            const reps = parseInt(s.reps, 10);
            return !Number.isNaN(reps) && reps >= top;
          });
        });
        if (allAtTop) {
          exerciseRecs.push({
            exerciseName: ex.name,
            action: 'progress',
            reason: `All sets at ${top}+ reps in the last two sessions`,
            how: ex.progression ?? 'Add a small amount of load or one rep per set',
          });
        }
      }
    }
  }

  return {
    weekStart: fmt(monday), weekNum, sessionsPlanned, sessionsCompleted,
    readinessCounts, avgSleep, avgSteps, daysLogged, avgProtein, avgCalories,
    weightChangeKg, recommendations: recs, exerciseRecs,
  };
};
