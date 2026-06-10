import { describe, it, expect, beforeEach } from 'vitest';
import { dailyInsights, weeklyReview } from '../utils/coach';
import { setProgramStartDate, getTrainingData, saveTrainingData, addBodyMetric } from '../utils/training';
import { mergeGarminData } from '../utils/health';
import { getDailyEntry, saveDailyEntry } from '../utils/storage';

// Program week: Mon 2026-06-08 — use week 2 (2026-06-15+) for phase 2
const MON = '2026-06-15';

beforeEach(() => {
  localStorage.clear();
  setProgramStartDate('2026-06-08');
});

const logFood = (date: string, calories: number, protein: number) => {
  const e = getDailyEntry(date);
  e.totalCalories = calories;
  e.totalProtein = protein;
  e.foodEntries = [{
    id: '1', foodId: 'x', foodName: 'x', portion: 100, calories, protein,
    carbs: 0, fats: 0, mealType: 'dinner', timestamp: date,
  }];
  saveDailyEntry(e);
};

describe('dailyInsights', () => {
  it('flags a big protein gap from yesterday', () => {
    logFood('2026-06-15', 1900, 100); // 60g under 160 target
    const ins = dailyInsights('2026-06-16');
    expect(ins.some((i) => i.level === 'action' && i.text.includes('protein'))).toBe(true);
  });

  it('praises protein on target and flags short sleep', () => {
    logFood('2026-06-15', 2000, 158);
    mergeGarminData({ days: { '2026-06-16': { sleepHours: 5.5 } } });
    const ins = dailyInsights('2026-06-16');
    expect(ins.some((i) => i.level === 'good' && i.text.includes('Protein on point'))).toBe(true);
    expect(ins.some((i) => i.level === 'action' && i.text.includes('Sleep 5.5h'))).toBe(true);
  });

  it('warns when nothing was logged', () => {
    const ins = dailyInsights('2026-06-16');
    expect(ins.some((i) => i.text.includes('No food logged'))).toBe(true);
  });
});

describe('weeklyReview', () => {
  it('counts sessions and flags poor consistency', () => {
    const td = getTrainingData();
    td.logs['2026-06-15'] = { dayKey: 'mon', weekNum: 2, phase: 2, completed: true, notes: '', exercises: {} };
    saveTrainingData(td);
    const r = weeklyReview(MON);
    expect(r.sessionsPlanned).toBe(4);
    expect(r.sessionsCompleted).toBe(1);
    expect(r.recommendations.some((x) => x.text.includes('consistency'))).toBe(true);
  });

  it('flags recovery problems with 2+ yellow/red days', () => {
    const td = getTrainingData();
    td.logs['2026-06-15'] = { dayKey: 'mon', weekNum: 2, phase: 2, readiness: 'yellow', completed: true, notes: '', exercises: {} };
    td.logs['2026-06-16'] = { dayKey: 'tue', weekNum: 2, phase: 2, readiness: 'red', completed: false, notes: '', exercises: {} };
    saveTrainingData(td);
    const r = weeklyReview(MON);
    expect(r.readinessCounts.yellow).toBe(1);
    expect(r.readinessCounts.red).toBe(1);
    expect(r.recommendations.some((x) => x.text.includes('recovery is lagging'))).toBe(true);
  });

  it('flags too-fast weight loss and computes the trend', () => {
    addBodyMetric({ date: '2026-06-09', weight: 81.5 });
    addBodyMetric({ date: '2026-06-12', weight: 81.3 });
    addBodyMetric({ date: '2026-06-16', weight: 80.2 });
    addBodyMetric({ date: '2026-06-19', weight: 80.0 });
    const r = weeklyReview(MON);
    expect(r.weightChangeKg).toBeLessThan(-0.8);
    expect(r.recommendations.some((x) => x.text.includes('too fast'))).toBe(true);
  });

  it('recommends progression when an exercise hits top reps twice', () => {
    const td = getTrainingData();
    // goblet_squat in phase 2: 4 sets ×8–12 → top 12
    const sets = Array.from({ length: 4 }, () => ({ weight: '20', reps: '12', done: true }));
    td.logs['2026-06-15'] = { dayKey: 'mon', weekNum: 2, phase: 2, completed: true, notes: '', exercises: { goblet_squat: { sets } } };
    td.logs['2026-06-08'] = { dayKey: 'mon', weekNum: 1, phase: 1, completed: true, notes: '', exercises: { goblet_squat: { sets } } };
    saveTrainingData(td);
    const r = weeklyReview(MON);
    const rec = r.exerciseRecs.find((x) => x.exerciseName.includes('Goblet'));
    expect(rec).toBeDefined();
    expect(rec?.action).toBe('progress');
  });

  it('flags low average protein across the week', () => {
    logFood('2026-06-15', 1800, 90);
    logFood('2026-06-16', 1850, 110);
    const r = weeklyReview(MON);
    expect(r.avgProtein).toBe(100);
    expect(r.recommendations.some((x) => x.text.includes('Average protein'))).toBe(true);
  });

  it('counts hollow_hold history toward hollow_rock progression (alias)', () => {
    // Phase-2 hollow_rock prescribes 3 sets ×12–15 reps (top = 15). Earlier
    // sessions were logged under the Phase-1 ID hollow_hold; the alias map
    // should let those count when the user hits top on both.
    const td = getTrainingData();
    const sets = Array.from({ length: 3 }, () => ({ weight: '', reps: '15', done: true }));
    td.logs['2026-06-08'] = { dayKey: 'mon', weekNum: 1, phase: 1, completed: true, notes: '', exercises: { hollow_hold: { sets } } };
    td.logs['2026-06-15'] = { dayKey: 'mon', weekNum: 2, phase: 2, completed: true, notes: '', exercises: { hollow_hold: { sets } } };
    saveTrainingData(td);
    const r = weeklyReview(MON);
    const rec = r.exerciseRecs.find((x) => x.exerciseName.includes('Hollow Rocks'));
    expect(rec).toBeDefined();
    expect(rec?.action).toBe('progress');
  });
});
