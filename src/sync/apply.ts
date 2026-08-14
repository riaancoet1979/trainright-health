import type { Change } from './types';
import { writeStore, setSuppressCapture } from './writeStore';
import { STORE_KEYS, type StoreKey } from './shred';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const read = (key: string): unknown => {
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/** Which store a domain lives in. */
const STORE_OF: Record<string, StoreKey> = {
  food_entry: 'nutrition_tracker_daily_entries',
  exercise: 'nutrition_tracker_daily_entries',
  pushup_set: 'nutrition_tracker_daily_entries',
  daily_steps: 'nutrition_tracker_daily_entries',
  custom_food: 'nutrition_tracker_custom_foods',
  achievement: 'nutrition_tracker_achievements',
  body_stat: 'trainright_body_stats',
  user_settings: 'nutrition_tracker_user_settings',
  session_log: 'health_training_v1',
  exercise_log: 'health_training_v1',
  set_log: 'health_training_v1',
  body_metric: 'health_training_v1',
  legacy_blob: 'health_training_v1',
};

const emptyDay = (date: string) => ({
  date,
  foodEntries: [] as unknown[],
  exercises: [] as unknown[],
  totalCalories: 0,
  totalProtein: 0,
  totalCarbs: 0,
  totalFats: 0,
  totalExerciseCalories: 0,
  netCalories: 0,
  fitness: {
    pushups: { sets: [] as unknown[], totalReps: 0, setsCompleted: 0 },
    steps: { steps: 0, goal: 5000 },
  },
});

const upsertById = (list: unknown, id: string, value: unknown, deleted: boolean): unknown[] => {
  const array = Array.isArray(list) ? [...list] : [];
  const index = array.findIndex((item) => isObject(item) && item.id === id);
  if (deleted) {
    if (index >= 0) array.splice(index, 1);
    return array;
  }
  if (index >= 0) array[index] = value;
  else array.push(value);
  return array;
};

/** Recompute the derived totals a DailyEntry carries, so the UI stays consistent. */
const recomputeTotals = (day: Record<string, unknown>): void => {
  const foods = Array.isArray(day.foodEntries) ? day.foodEntries : [];
  const exercises = Array.isArray(day.exercises) ? day.exercises : [];
  const sum = (items: unknown[], field: string): number =>
    items.reduce<number>((total, item) => (
      total + (isObject(item) && typeof item[field] === 'number' ? (item[field] as number) : 0)
    ), 0);

  day.totalCalories = sum(foods, 'calories');
  day.totalProtein = sum(foods, 'protein');
  day.totalCarbs = sum(foods, 'carbs');
  day.totalFats = sum(foods, 'fats');
  day.totalExerciseCalories = sum(exercises, 'caloriesBurned');
  day.netCalories = (day.totalCalories as number) - (day.totalExerciseCalories as number);
};

const applyToDailyEntries = (store: unknown, change: Change): unknown => {
  const entries = isObject(store) ? { ...store } : {};
  const date = String(change.fields.date ?? '');
  if (!date) return entries;

  const existing = entries[date];
  const day: Record<string, unknown> = isObject(existing)
    ? { ...existing }
    : (emptyDay(date) as unknown as Record<string, unknown>);
  day.date = date;

  if (change.domain === 'food_entry') {
    const { date: _date, ...rest } = change.fields;
    day.foodEntries = upsertById(day.foodEntries, change.id, { id: change.id, ...rest }, change.deleted);
    recomputeTotals(day);
  } else if (change.domain === 'exercise') {
    const { date: _date, ...rest } = change.fields;
    day.exercises = upsertById(day.exercises, change.id, { id: change.id, ...rest }, change.deleted);
    recomputeTotals(day);
  } else {
    const baseFitness = emptyDay(date).fitness as unknown as Record<string, unknown>;
    const fitness: Record<string, unknown> = isObject(day.fitness) ? { ...day.fitness } : baseFitness;

    if (change.domain === 'pushup_set') {
      const pushups: Record<string, unknown> = isObject(fitness.pushups)
        ? { ...fitness.pushups }
        : { sets: [], totalReps: 0, setsCompleted: 0 };
      const sets = Array.isArray(pushups.sets) ? [...pushups.sets] : [];
      const index = sets.findIndex((s) => isObject(s) && s.timestamp === change.fields.timestamp);

      if (change.deleted) {
        if (index >= 0) sets.splice(index, 1);
      } else {
        const value = { reps: change.fields.reps, timestamp: change.fields.timestamp };
        if (index >= 0) sets[index] = value;
        else sets.push(value);
      }

      pushups.sets = sets;
      pushups.totalReps = sets.reduce<number>((total, s) => (
        total + (isObject(s) && typeof s.reps === 'number' ? (s.reps as number) : 0)
      ), 0);
      pushups.setsCompleted = sets.length;
      fitness.pushups = pushups;
    }

    if (change.domain === 'daily_steps' && !change.deleted) {
      fitness.steps = {
        steps: change.fields.steps ?? 0,
        goal: change.fields.goal ?? 5000,
      };
    }

    day.fitness = fitness;
  }

  entries[date] = day;
  return entries;
};

const applyToTraining = (store: unknown, change: Change): unknown => {
  const training: Record<string, unknown> = isObject(store)
    ? { ...store }
    : { programStartDate: null, logs: {}, bodyMetrics: [] };

  if (change.domain === 'body_metric') {
    const metrics = Array.isArray(training.bodyMetrics) ? [...training.bodyMetrics] : [];
    const index = metrics.findIndex((m) => isObject(m) && m.date === change.id);
    if (change.deleted) {
      if (index >= 0) metrics.splice(index, 1);
    } else if (index >= 0) {
      metrics[index] = { ...change.fields };
    } else {
      metrics.push({ ...change.fields });
    }
    training.bodyMetrics = metrics;
    return training;
  }

  if (change.domain === 'legacy_blob') {
    if (!change.deleted) training.legacyTrainRight = change.fields.payload;
    return training;
  }

  const logs: Record<string, unknown> = isObject(training.logs) ? { ...training.logs } : {};

  if (change.domain === 'session_log') {
    if (change.deleted) {
      delete logs[change.id];
    } else {
      const previous = isObject(logs[change.id]) ? (logs[change.id] as Record<string, unknown>) : {};
      const { date: _date, ...rest } = change.fields;
      logs[change.id] = { ...previous, ...rest, exercises: previous.exercises ?? {} };
    }
    training.logs = logs;
    return training;
  }

  const sessionDate = String(change.fields.sessionDate ?? '');
  const exerciseId = String(change.fields.exerciseId ?? '');
  if (!sessionDate || !exerciseId) return training;

  const session: Record<string, unknown> = isObject(logs[sessionDate])
    ? { ...(logs[sessionDate] as Record<string, unknown>) }
    : {};
  const exercises: Record<string, unknown> = isObject(session.exercises) ? { ...session.exercises } : {};
  const exercise: Record<string, unknown> = isObject(exercises[exerciseId])
    ? { ...(exercises[exerciseId] as Record<string, unknown>) }
    : { sets: [] };

  if (change.domain === 'exercise_log') {
    if (change.deleted) {
      delete exercises[exerciseId];
    } else {
      if (change.fields.note !== undefined) exercise.note = change.fields.note;
      exercises[exerciseId] = exercise;
    }
  }

  if (change.domain === 'set_log') {
    const sets = Array.isArray(exercise.sets) ? [...exercise.sets] : [];
    const setIndex = Number(change.fields.setIndex ?? -1);
    if (Number.isInteger(setIndex) && setIndex >= 0) {
      if (change.deleted) {
        if (setIndex < sets.length) sets.splice(setIndex, 1);
      } else {
        const { sessionDate: _s, exerciseId: _e, setIndex: _i, ...rest } = change.fields;
        // Sets are positional; pad rather than misplace an out-of-order arrival.
        while (sets.length < setIndex) sets.push({ weight: '', reps: '', done: false });
        sets[setIndex] = rest;
      }
    }
    exercise.sets = sets;
    exercises[exerciseId] = exercise;
  }

  session.exercises = exercises;
  logs[sessionDate] = session;
  training.logs = logs;
  return training;
};

const applyToArrayStore = (store: unknown, change: Change): unknown =>
  upsertById(Array.isArray(store) ? store : [], change.id, { id: change.id, ...change.fields }, change.deleted);

const applyToUserSettings = (store: unknown, change: Change): unknown => {
  if (change.deleted) return store;
  const current = isObject(store) ? { ...store } : {};
  const f = change.fields;
  return {
    ...current,
    targets: {
      dailyCalories: f.dailyCalories,
      dailyProtein: f.dailyProtein,
      dailyCarbs: f.dailyCarbs,
      dailyFats: f.dailyFats,
    },
    theme: f.theme ?? 'light',
    ...(f.pushupReminders !== undefined ? { pushupReminders: f.pushupReminders } : {}),
    ...(f.restTimerSeconds !== undefined ? { restTimerSeconds: f.restTimerSeconds } : {}),
    ...(f.mealSplit !== undefined ? { mealSplit: f.mealSplit } : {}),
    ...(f.staples !== undefined ? { staples: f.staples } : {}),
  };
};

/**
 * Fold pulled changes into the local stores. Capture is suppressed throughout,
 * or every pull would bounce straight back out as a push.
 */
export const applyChanges = async (changes: Change[]): Promise<void> => {
  if (!changes.length) return;

  const touched = new Map<StoreKey, unknown>();
  for (const key of STORE_KEYS) touched.set(key, read(key));

  const changedStores = new Set<StoreKey>();

  for (const change of changes) {
    const storeKey = STORE_OF[change.domain];
    if (!storeKey) continue;
    changedStores.add(storeKey);
    const current = touched.get(storeKey);

    if (storeKey === 'nutrition_tracker_daily_entries') {
      touched.set(storeKey, applyToDailyEntries(current, change));
    } else if (storeKey === 'health_training_v1') {
      touched.set(storeKey, applyToTraining(current, change));
    } else if (storeKey === 'nutrition_tracker_user_settings') {
      touched.set(storeKey, applyToUserSettings(current, change));
    } else {
      touched.set(storeKey, applyToArrayStore(current, change));
    }
  }

  setSuppressCapture(true);
  try {
    for (const key of changedStores) {
      const value = touched.get(key);
      if (value === undefined) continue;
      await writeStore(key, value);
    }
  } finally {
    setSuppressCapture(false);
  }
};
