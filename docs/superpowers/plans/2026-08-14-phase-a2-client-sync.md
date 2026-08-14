# Phase A2 — Client Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing PWA read and write through the deployed Worker API so the phone and the PC share one source of truth, while keeping full offline capability.

**Architecture:** `localStorage` stays the working copy the UI reads, so ~12k lines of read paths are untouched. Every *write* to a tracked store is routed through one `writeStore()` helper that diffs the before/after snapshot, converts the difference into per-record sync mutations, and appends them to a durable IndexedDB outbox. A background client flushes the outbox to `POST /v1/sync/push` and applies `GET /v1/sync/pull` results back into the local stores.

**Tech Stack:** TypeScript, React 19, Vite, IndexedDB (no library), Vitest + jsdom. No new runtime dependencies.

**Depends on:** Phase A1, deployed and verified at `https://trainright-api.lifestyleapp.workers.dev`.

**Source spec:** [docs/superpowers/specs/2026-08-14-lifestyle-tracker-backend-design.md](../specs/2026-08-14-lifestyle-tracker-backend-design.md)

---

## Ground rules

1. **Never run `npm audit fix`; never modify the root `.npmrc`.** No new dependencies without asking.
2. **`git add` explicit paths only** — the repo shows ~30 files as modified from CRLF noise. Never `git add -A`.
3. **`src/data/program.ts` content is not modified.**
4. **The existing 141 tests must keep passing.** Run `npx vitest run` from the repo root.
5. Any `.ps1` written must be pure ASCII with no backtick continuations (see `worker/scripts/smoke-test.ps1`).

---

## Why this shape

The codebase analysis found that **every** single-record mutation is already implemented as a
whole-collection rewrite, and every one of them bottoms out in
`localStorage.setItem(KEY, JSON.stringify(wholeStore))`. There are ~13 such call sites across
`storage.ts` and `training.ts`.

That means we do **not** rewrite 25 mutators into per-record operations. We replace those ~13
`setItem` calls with `writeStore()`, which diffs old against new. This automatically covers paths
a mutator-level approach would miss — `importAppBackup`, `importAllData`, `resetAllFitnessData`,
and `getBodyStats`'s legacy-rename write.

Diff cost is a JSON parse plus a shallow compare over a few thousand records: sub-millisecond at
this data size, and it only runs on writes, which are user-initiated.

---

## Record identity

The server needs a stable `id` per record. Some stores already have one; the rest get a
**deterministic id derived from content**, so migration is idempotent and diffing is stable.

| Domain | Source | `id` |
|---|---|---|
| `food_entry` | `daily_entries[date].foodEntries[]` | existing `entry.id` |
| `exercise` | `daily_entries[date].exercises[]` | existing `entry.id` |
| `pushup_set` | `daily_entries[date].fitness.pushups.sets[]` | `` `${date}:${set.timestamp}` `` |
| `daily_steps` | `daily_entries[date].fitness.steps` | `date` |
| `custom_food` | `custom_foods[]` | existing `food.id` |
| `achievement` | `achievements[]` | existing `a.id` |
| `body_stat` | `body_stats[]` | existing `entry.id` |
| `session_log` | `training.logs[date]` | `date` |
| `exercise_log` | `training.logs[date].exercises[exId]` | `` `${date}:${exId}` `` |
| `set_log` | `...exercises[exId].sets[i]` | `` `${date}:${exId}:${i}` `` |
| `body_metric` | `training.bodyMetrics[]` | `m.date` |
| `user_settings` | `user_settings` + `training.programStartDate` | `'singleton'` |
| `legacy_blob` | `training.legacyTrainRight` | `'trainright-v1'` |

`achievements` can be `null` in a real backup (not absent, not `[]`) — every shredder must
tolerate `null`, `undefined`, and the wrong type without throwing.

`body_metric` numeric fields carry `""` for unset values in real data. SQLite will not coerce
`""` to a number, so **every shredder maps `"" -> undefined`** for numeric fields.

---

## File structure

| File | Responsibility |
|---|---|
| `src/sync/types.ts` | `Mutation`, `Change`, `SyncRecord`, `OutboxItem` |
| `src/sync/config.ts` | API base URL, device-token get/set/clear, cursor get/set |
| `src/sync/domains.ts` | Per-domain descriptors: `shred`, `applyChange`, `storeKey` |
| `src/sync/shred.ts` | Whole-store → `SyncRecord[]`, per store key |
| `src/sync/apply.ts` | `Change[]` → mutated store objects (inverse of shred) |
| `src/sync/outbox.ts` | IndexedDB durable queue: enqueue, list, ack, quarantine |
| `src/sync/writeStore.ts` | The single write gateway: diff + persist + enqueue |
| `src/sync/client.ts` | `push()` / `pull()` with backoff and cursor handling |
| `src/sync/engine.ts` | `syncNow()`, triggers, status subscription |
| `src/components/SyncSettings.tsx` | Pair device, show status, review quarantine |
| `src/__tests__/sync*.spec.ts` | Tests, including the real backup as a fixture |

---

## Task 1: Sync types and config

**Files:**
- Create: `src/sync/types.ts`, `src/sync/config.ts`
- Create: `src/__tests__/syncConfig.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  API_BASE, getDeviceToken, setDeviceToken, clearDeviceToken,
  getCursor, setCursor, isPaired,
} from '../sync/config';

describe('sync config', () => {
  beforeEach(() => localStorage.clear());

  it('points at the deployed worker', () => {
    expect(API_BASE).toBe('https://trainright-api.lifestyleapp.workers.dev');
  });

  it('reports unpaired before a token is stored', () => {
    expect(isPaired()).toBe(false);
    expect(getDeviceToken()).toBeNull();
  });

  it('round-trips a device token', () => {
    setDeviceToken('tok_abc');
    expect(getDeviceToken()).toBe('tok_abc');
    expect(isPaired()).toBe(true);
  });

  it('clears the token and the cursor together', () => {
    setDeviceToken('tok_abc');
    setCursor(42);
    clearDeviceToken();
    expect(getDeviceToken()).toBeNull();
    expect(getCursor()).toBe(0);
  });

  it('defaults the cursor to zero and round-trips it', () => {
    expect(getCursor()).toBe(0);
    setCursor(17);
    expect(getCursor()).toBe(17);
  });

  it('treats a corrupt cursor as zero rather than NaN', () => {
    localStorage.setItem('trainright_sync_cursor', 'banana');
    expect(getCursor()).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run syncConfig
```

Expected: FAIL — cannot resolve `../sync/config`.

- [ ] **Step 3: Write `src/sync/types.ts`**

```ts
/** A record as it travels to and from the server. */
export interface SyncRecord {
  domain: string;
  id: string;
  fields: Record<string, unknown>;
}

/** A pending local change, queued in the outbox. */
export interface Mutation {
  domain: string;
  id: string;
  updatedAt: string;
  deleted: boolean;
  fields: Record<string, unknown>;
}

/** A change delivered by the server. */
export interface Change {
  domain: string;
  id: string;
  updatedAt: string;
  deleted: boolean;
  fields: Record<string, unknown>;
}

export type OutboxState = 'pending' | 'quarantined';

export interface OutboxItem {
  /** IndexedDB auto-increment key. */
  seq?: number;
  mutation: Mutation;
  state: OutboxState;
  attempts: number;
  lastError?: string;
  queuedAt: string;
}

export interface PushResult {
  id: string;
  status: 'applied' | 'stale' | 'rejected';
  reason?: string;
}
```

- [ ] **Step 4: Write `src/sync/config.ts`**

```ts
export const API_BASE = 'https://trainright-api.lifestyleapp.workers.dev';

const TOKEN_KEY = 'trainright_sync_token';
const CURSOR_KEY = 'trainright_sync_cursor';

export const getDeviceToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const setDeviceToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

/** Unpairing must also reset the cursor, or a re-pair would skip everything
 *  the server already had. */
export const clearDeviceToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CURSOR_KEY);
};

export const isPaired = (): boolean => getDeviceToken() !== null;

export const getCursor = (): number => {
  const raw = localStorage.getItem(CURSOR_KEY);
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : 0;
};

export const setCursor = (revision: number): void => {
  localStorage.setItem(CURSOR_KEY, String(revision));
};
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run syncConfig
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/sync/types.ts src/sync/config.ts src/__tests__/syncConfig.spec.ts
git commit -m "feat(sync): add sync types and device/cursor config"
```

---

## Task 2: Shredders — whole store to records

This is the heart of the migration and of change capture. It must be **total**: never throw on
malformed, `null`, or legacy-shaped data, because it runs on every write.

**Files:**
- Create: `src/sync/shred.ts`
- Create: `src/__tests__/syncShred.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { shredStore, STORE_KEYS } from '../sync/shred';

describe('shredStore — daily entries', () => {
  const store = {
    '2026-08-14': {
      date: '2026-08-14',
      foodEntries: [{
        id: 'f1', foodId: 'chicken', foodName: 'Chicken', portion: 220,
        calories: 363, protein: 68, carbs: 0, fats: 8,
        mealType: 'lunch', timestamp: '2026-08-14T12:00:00.000Z',
      }],
      exercises: [{
        id: 'e1', name: 'Walk', duration: 30, caloriesBurned: 120,
        type: 'walking', timestamp: '2026-08-14T13:00:00.000Z',
      }],
      totalCalories: 363, totalProtein: 68, totalCarbs: 0, totalFats: 8,
      totalExerciseCalories: 120, netCalories: 243,
      fitness: {
        pushups: { sets: [{ reps: 12, timestamp: '2026-08-14T07:00:00.000Z' }], totalReps: 12, setsCompleted: 1 },
        steps: { steps: 8000, goal: 5000 },
      },
    },
  };

  it('extracts a food entry keyed by its own id', () => {
    const records = shredStore('nutrition_tracker_daily_entries', store);
    const food = records.find((r) => r.domain === 'food_entry');
    expect(food?.id).toBe('f1');
    expect(food?.fields.foodName).toBe('Chicken');
    expect(food?.fields.date).toBe('2026-08-14');
  });

  it('gives a pushup set a deterministic id', () => {
    const records = shredStore('nutrition_tracker_daily_entries', store);
    const set = records.find((r) => r.domain === 'pushup_set');
    expect(set?.id).toBe('2026-08-14:2026-08-14T07:00:00.000Z');
    expect(set?.fields.reps).toBe(12);
  });

  it('gives daily steps the date as its id', () => {
    const records = shredStore('nutrition_tracker_daily_entries', store);
    const steps = records.find((r) => r.domain === 'daily_steps');
    expect(steps?.id).toBe('2026-08-14');
    expect(steps?.fields).toMatchObject({ date: '2026-08-14', steps: 8000, goal: 5000 });
  });
});

describe('shredStore — resilience', () => {
  it.each(STORE_KEYS)('returns [] for null in %s', (key) => {
    expect(shredStore(key, null)).toEqual([]);
  });

  it.each(STORE_KEYS)('returns [] for undefined in %s', (key) => {
    expect(shredStore(key, undefined)).toEqual([]);
  });

  it.each(STORE_KEYS)('returns [] for a wrong-typed value in %s', (key) => {
    expect(shredStore(key, 'nonsense')).toEqual([]);
  });

  it('skips a malformed daily entry without throwing', () => {
    const records = shredStore('nutrition_tracker_daily_entries', {
      '2026-08-14': { date: '2026-08-14', foodEntries: 'not an array' },
    });
    expect(records.filter((r) => r.domain === 'food_entry')).toEqual([]);
  });
});

describe('shredStore — training', () => {
  const training = {
    programStartDate: '2026-06-07',
    logs: {
      '2026-06-07': {
        dayKey: 'mon', weekNum: 0, phase: 0, completed: true, notes: 'ok',
        shoulderPain: 2,
        exercises: {
          goblet_squat: { note: 'felt good', sets: [{ weight: '10', reps: '15', done: true }] },
        },
      },
    },
    bodyMetrics: [{ date: '2026-05-26', weight: 83.6, bfp: 19.7, waist: '', chest: '' }],
  };

  it('extracts the session keyed by date', () => {
    const records = shredStore('health_training_v1', training);
    const session = records.find((r) => r.domain === 'session_log');
    expect(session?.id).toBe('2026-06-07');
    expect(session?.fields.dayKey).toBe('mon');
    expect(session?.fields.completed).toBe(true);
  });

  it('extracts set logs with deterministic composite ids and string values', () => {
    const records = shredStore('health_training_v1', training);
    const set = records.find((r) => r.domain === 'set_log');
    expect(set?.id).toBe('2026-06-07:goblet_squat:0');
    expect(set?.fields.weight).toBe('10');
    expect(set?.fields.reps).toBe('15');
    expect(set?.fields.done).toBe(true);
  });

  it('extracts the per-exercise note as its own record', () => {
    const records = shredStore('health_training_v1', training);
    const log = records.find((r) => r.domain === 'exercise_log');
    expect(log?.id).toBe('2026-06-07:goblet_squat');
    expect(log?.fields.note).toBe('felt good');
  });

  it('maps empty-string numerics to undefined, never zero', () => {
    const records = shredStore('health_training_v1', training);
    const metric = records.find((r) => r.domain === 'body_metric');
    expect(metric?.fields.weight).toBe(83.6);
    expect(metric?.fields).not.toHaveProperty('waist');
    expect(metric?.fields).not.toHaveProperty('chest');
  });
});

describe('shredStore — achievements', () => {
  it('tolerates a null achievements store, which real backups contain', () => {
    expect(shredStore('nutrition_tracker_achievements', null)).toEqual([]);
  });

  it('extracts achievements by id', () => {
    const records = shredStore('nutrition_tracker_achievements', [
      { id: 'a1', name: 'First workout', date: '2026-06-07' },
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ domain: 'achievement', id: 'a1' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run syncShred
```

Expected: FAIL — cannot resolve `../sync/shred`.

- [ ] **Step 3: Write `src/sync/shred.ts`**

```ts
import type { SyncRecord } from './types';

export const STORE_KEYS = [
  'nutrition_tracker_daily_entries',
  'nutrition_tracker_user_settings',
  'nutrition_tracker_custom_foods',
  'nutrition_tracker_achievements',
  'trainright_body_stats',
  'health_training_v1',
] as const;

export type StoreKey = typeof STORE_KEYS[number];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

/**
 * Copy `keys` from `source`, dropping undefined, null and empty string.
 * Real data carries "" in numeric fields such as bodyMetrics.waist; SQLite will
 * not coerce "" to a number, so it must never reach the wire.
 */
const pick = (source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
};

const FOOD_FIELDS = ['foodId', 'foodName', 'portion', 'calories', 'protein', 'carbs',
  'fats', 'mealType', 'timestamp', 'pieceCount', 'servingType', 'isManualMacroEntry'] as const;
const EXERCISE_FIELDS = ['name', 'duration', 'caloriesBurned', 'type', 'timestamp'] as const;
const CUSTOM_FOOD_FIELDS = ['name', 'calories', 'protein', 'carbs', 'fats', 'category',
  'brand', 'servingType', 'averageWeight', 'isCustom'] as const;
const BODY_STAT_FIELDS = ['date', 'weight', 'bodyFat', 'waist', 'chest', 'hips', 'leftArm',
  'rightArm', 'neck', 'thighL', 'thighR', 'shoulderWidth', 'measuredAt', 'importedAt', 'source',
  'sourceDevice', 'sourceFingerprint', 'totalBodyWaterL', 'proteinMassKg', 'mineralMassKg',
  'bodyFatMassKg', 'skeletalMuscleMassKg', 'fatFreeMassKg', 'bmi', 'smiKgM2', 'inBodyScore',
  'inBodyScoreMax', 'basalMetabolicRateKcal', 'recommendedCalorieIntakeKcal', 'waistHipRatio',
  'visceralFatLevel', 'obesityDegreePercent', 'targetWeightKg', 'weightControlKg', 'fatControlKg',
  'muscleControlKg', 'segmentalLean', 'segmentalFat', 'needsReview', 'reviewFields', 'notes'] as const;
const SESSION_FIELDS = ['dayKey', 'dayKeyOverride', 'weekNum', 'phase', 'readiness',
  'shoulderPain', 'redFlags', 'completed', 'notes'] as const;
const SET_FIELDS = ['weight', 'reps', 'done', 'leftWeight', 'leftReps', 'leftDone',
  'rightWeight', 'rightReps', 'rightDone'] as const;

const shredDailyEntries = (store: unknown): SyncRecord[] => {
  if (!isObject(store)) return [];
  const records: SyncRecord[] = [];

  for (const [date, rawEntry] of Object.entries(store)) {
    if (!isObject(rawEntry)) continue;

    if (isArray(rawEntry.foodEntries)) {
      for (const item of rawEntry.foodEntries) {
        if (!isObject(item) || typeof item.id !== 'string') continue;
        records.push({
          domain: 'food_entry',
          id: item.id,
          fields: { date, ...pick(item, FOOD_FIELDS) },
        });
      }
    }

    if (isArray(rawEntry.exercises)) {
      for (const item of rawEntry.exercises) {
        if (!isObject(item) || typeof item.id !== 'string') continue;
        records.push({
          domain: 'exercise',
          id: item.id,
          fields: { date, ...pick(item, EXERCISE_FIELDS) },
        });
      }
    }

    const fitness = rawEntry.fitness;
    if (isObject(fitness)) {
      const pushups = fitness.pushups;
      if (isObject(pushups) && isArray(pushups.sets)) {
        for (const item of pushups.sets) {
          if (!isObject(item) || typeof item.timestamp !== 'string') continue;
          records.push({
            domain: 'pushup_set',
            id: `${date}:${item.timestamp}`,
            fields: { date, reps: item.reps, timestamp: item.timestamp },
          });
        }
      }

      const steps = fitness.steps;
      if (isObject(steps) && typeof steps.steps === 'number') {
        records.push({
          domain: 'daily_steps',
          id: date,
          fields: { date, steps: steps.steps, goal: typeof steps.goal === 'number' ? steps.goal : 5000 },
        });
      }
    }
  }

  return records;
};

const shredTraining = (store: unknown): SyncRecord[] => {
  if (!isObject(store)) return [];
  const records: SyncRecord[] = [];

  const logs = store.logs;
  if (isObject(logs)) {
    for (const [date, rawLog] of Object.entries(logs)) {
      if (!isObject(rawLog)) continue;

      records.push({
        domain: 'session_log',
        id: date,
        fields: { date, ...pick(rawLog, SESSION_FIELDS) },
      });

      const exercises = rawLog.exercises;
      if (!isObject(exercises)) continue;

      for (const [exerciseId, rawExercise] of Object.entries(exercises)) {
        if (!isObject(rawExercise)) continue;

        records.push({
          domain: 'exercise_log',
          id: `${date}:${exerciseId}`,
          fields: {
            sessionDate: date,
            exerciseId,
            ...pick(rawExercise, ['note']),
          },
        });

        if (!isArray(rawExercise.sets)) continue;
        rawExercise.sets.forEach((rawSet, index) => {
          if (!isObject(rawSet)) return;
          records.push({
            domain: 'set_log',
            id: `${date}:${exerciseId}:${index}`,
            fields: {
              sessionDate: date,
              exerciseId,
              setIndex: index,
              ...pick(rawSet, SET_FIELDS),
            },
          });
        });
      }
    }
  }

  if (isArray(store.bodyMetrics)) {
    for (const rawMetric of store.bodyMetrics) {
      if (!isObject(rawMetric) || typeof rawMetric.date !== 'string') continue;
      records.push({
        domain: 'body_metric',
        id: rawMetric.date,
        fields: pick(rawMetric, ['date', 'weight', 'bfp', 'waist', 'chest']),
      });
    }
  }

  if (store.legacyTrainRight !== undefined && store.legacyTrainRight !== null) {
    records.push({
      domain: 'legacy_blob',
      id: 'trainright-v1',
      fields: { kind: 'trainright_v1', payload: store.legacyTrainRight },
    });
  }

  return records;
};

const shredUserSettings = (store: unknown): SyncRecord[] => {
  if (!isObject(store)) return [];
  const targets = isObject(store.targets) ? store.targets : {};

  const fields: Record<string, unknown> = {
    dailyCalories: targets.dailyCalories ?? 0,
    dailyProtein: targets.dailyProtein ?? 0,
    dailyCarbs: targets.dailyCarbs ?? 0,
    dailyFats: targets.dailyFats ?? 0,
    theme: typeof store.theme === 'string' ? store.theme : 'light',
    ...pick(store, ['pushupReminders', 'restTimerSeconds', 'mealSplit', 'staples']),
  };

  return [{ domain: 'user_settings', id: 'singleton', fields }];
};

const shredCustomFoods = (store: unknown): SyncRecord[] => {
  if (!isArray(store)) return [];
  return store.flatMap((item) => {
    if (!isObject(item) || typeof item.id !== 'string') return [];
    return [{ domain: 'custom_food', id: item.id, fields: pick(item, CUSTOM_FOOD_FIELDS) }];
  });
};

const shredAchievements = (store: unknown): SyncRecord[] => {
  if (!isArray(store)) return [];
  return store.flatMap((item) => {
    if (!isObject(item) || typeof item.id !== 'string') return [];
    return [{ domain: 'achievement', id: item.id, fields: pick(item, ['name', 'date']) }];
  });
};

const shredBodyStats = (store: unknown): SyncRecord[] => {
  if (!isArray(store)) return [];
  return store.flatMap((item) => {
    if (!isObject(item) || typeof item.id !== 'string') return [];
    return [{ domain: 'body_stat', id: item.id, fields: pick(item, BODY_STAT_FIELDS) }];
  });
};

const SHREDDERS: Record<StoreKey, (store: unknown) => SyncRecord[]> = {
  nutrition_tracker_daily_entries: shredDailyEntries,
  nutrition_tracker_user_settings: shredUserSettings,
  nutrition_tracker_custom_foods: shredCustomFoods,
  nutrition_tracker_achievements: shredAchievements,
  trainright_body_stats: shredBodyStats,
  health_training_v1: shredTraining,
};

/** Total function: never throws, whatever shape `store` is. */
export const shredStore = (key: string, store: unknown): SyncRecord[] => {
  const shredder = SHREDDERS[key as StoreKey];
  if (!shredder) return [];
  try {
    return shredder(store);
  } catch {
    return [];
  }
};
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run syncShred
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync/shred.ts src/__tests__/syncShred.spec.ts
git commit -m "feat(sync): shred whole localStorage stores into per-record sync records"
```

---

## Task 3: Real-backup fixture test

Proves the shredders survive the user's actual data, including its known hazards.

**Files:**
- Create: `src/__tests__/syncRealBackup.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shredStore, STORE_KEYS } from '../sync/shred';

const backup = JSON.parse(
  readFileSync(join(process.cwd(), 'trainright-health-backup-2026-06-28 (1).json'), 'utf-8'),
) as Record<string, unknown>;

describe('shredding the real backup', () => {
  it('never throws on any store', () => {
    for (const key of STORE_KEYS) {
      expect(() => shredStore(key, backup[key])).not.toThrow();
    }
  });

  it('handles the null achievements store this backup actually contains', () => {
    expect(backup.nutrition_tracker_achievements).toBeNull();
    expect(shredStore('nutrition_tracker_achievements', backup.nutrition_tracker_achievements)).toEqual([]);
  });

  it('produces records for every populated store', () => {
    const counts = Object.fromEntries(
      STORE_KEYS.map((key) => [key, shredStore(key, backup[key]).length]),
    );
    expect(counts.nutrition_tracker_daily_entries).toBeGreaterThan(0);
    expect(counts.nutrition_tracker_custom_foods).toBe(21);
    expect(counts.trainright_body_stats).toBe(2);
    expect(counts.health_training_v1).toBeGreaterThan(0);
    expect(counts.nutrition_tracker_user_settings).toBe(1);
  });

  it('assigns every record a non-empty id and a known domain', () => {
    const known = new Set([
      'food_entry', 'exercise', 'pushup_set', 'daily_steps', 'custom_food',
      'achievement', 'body_stat', 'session_log', 'exercise_log', 'set_log',
      'body_metric', 'user_settings', 'legacy_blob',
    ]);
    for (const key of STORE_KEYS) {
      for (const record of shredStore(key, backup[key])) {
        expect(record.id, `${key} record id`).toBeTruthy();
        expect(known.has(record.domain), `unknown domain ${record.domain}`).toBe(true);
      }
    }
  });

  it('assigns ids that are unique within each domain', () => {
    const seen = new Map<string, Set<string>>();
    for (const key of STORE_KEYS) {
      for (const record of shredStore(key, backup[key])) {
        if (!seen.has(record.domain)) seen.set(record.domain, new Set());
        const ids = seen.get(record.domain)!;
        expect(ids.has(record.id), `duplicate ${record.domain} id ${record.id}`).toBe(false);
        ids.add(record.id);
      }
    }
  });

  it('is deterministic — shredding twice gives identical output', () => {
    for (const key of STORE_KEYS) {
      expect(shredStore(key, backup[key])).toEqual(shredStore(key, backup[key]));
    }
  });

  it('never emits an empty string as a field value', () => {
    for (const key of STORE_KEYS) {
      for (const record of shredStore(key, backup[key])) {
        for (const [field, value] of Object.entries(record.fields)) {
          expect(value, `${record.domain}.${field}`).not.toBe('');
        }
      }
    }
  });

  it('preserves training set weights and reps as strings', () => {
    const sets = shredStore('health_training_v1', backup.health_training_v1)
      .filter((r) => r.domain === 'set_log');
    expect(sets.length).toBeGreaterThan(0);
    for (const set of sets) {
      if (set.fields.weight !== undefined) expect(typeof set.fields.weight).toBe('string');
      if (set.fields.reps !== undefined) expect(typeof set.fields.reps).toBe('string');
    }
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run syncRealBackup
```

Expected: PASS. If the uniqueness test fails, the id scheme collides on real data and must be
fixed in `shred.ts` before going further — do not weaken the test.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/syncRealBackup.spec.ts
git commit -m "test(sync): shred the real 2026-06-28 backup as a fixture"
```

---

## Task 4: IndexedDB outbox

`localStorage` is not durable enough for unsent writes — iOS Safari evicts it under storage
pressure, and losing the outbox loses data that exists nowhere else.

**Files:**
- Create: `src/sync/outbox.ts`
- Create: `src/__tests__/syncOutbox.spec.ts`

- [ ] **Step 1: Add the test dependency**

`jsdom` has no IndexedDB. Install the standard shim as a dev dependency only:

```bash
npm install --save-dev --force fake-indexeddb
```

`--force` is required on this machine; plain `npm ci` fails on `@rollup/rollup-linux-x64-gnu`.

- [ ] **Step 2: Write the failing test**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { enqueue, listPending, ack, quarantine, listQuarantined, clearOutbox, countPending } from '../sync/outbox';
import type { Mutation } from '../sync/types';

const mutation = (id: string): Mutation => ({
  domain: 'achievement', id, updatedAt: '2026-08-14T12:00:00.000Z',
  deleted: false, fields: { name: 'x', date: '2026-08-14' },
});

describe('outbox', () => {
  beforeEach(async () => { await clearOutbox(); });

  it('starts empty', async () => {
    expect(await listPending()).toEqual([]);
    expect(await countPending()).toBe(0);
  });

  it('enqueues and lists in insertion order', async () => {
    await enqueue(mutation('a'));
    await enqueue(mutation('b'));
    const pending = await listPending();
    expect(pending.map((i) => i.mutation.id)).toEqual(['a', 'b']);
    expect(pending[0].attempts).toBe(0);
    expect(pending[0].state).toBe('pending');
  });

  it('acks by seq, removing only those items', async () => {
    await enqueue(mutation('a'));
    await enqueue(mutation('b'));
    const [first] = await listPending();
    await ack([first.seq!]);
    expect((await listPending()).map((i) => i.mutation.id)).toEqual(['b']);
  });

  it('quarantines an item out of the pending list', async () => {
    await enqueue(mutation('a'));
    const [item] = await listPending();
    await quarantine(item.seq!, 'Unknown field "nonsense"');
    expect(await listPending()).toEqual([]);
    const held = await listQuarantined();
    expect(held).toHaveLength(1);
    expect(held[0].lastError).toContain('nonsense');
  });

  it('collapses repeated mutations of the same record to the latest', async () => {
    await enqueue({ ...mutation('a'), fields: { name: 'first', date: '2026-08-14' } });
    await enqueue({ ...mutation('a'), fields: { name: 'second', date: '2026-08-14' } });
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation.fields.name).toBe('second');
  });

  it('keeps mutations of different records separate', async () => {
    await enqueue(mutation('a'));
    await enqueue(mutation('b'));
    expect(await countPending()).toBe(2);
  });

  it('survives a fresh connection', async () => {
    await enqueue(mutation('a'));
    const pending = await listPending();
    expect(pending).toHaveLength(1);
  });
});
```

The collapse behaviour matters: typing in a notes field fires a write per keystroke, and without
collapsing, the outbox would grow unboundedly for a single record.

- [ ] **Step 3: Run it and watch it fail**

```bash
npx vitest run syncOutbox
```

Expected: FAIL — cannot resolve `../sync/outbox`.

- [ ] **Step 4: Write `src/sync/outbox.ts`**

```ts
import type { Mutation, OutboxItem } from './types';

const DB_NAME = 'trainright-sync';
const DB_VERSION = 1;
const STORE = 'outbox';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
        store.createIndex('state', 'state', { unique: false });
        // One pending item per record: repeated edits collapse onto it.
        store.createIndex('recordKey', 'recordKey', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
};

const tx = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

interface StoredItem extends OutboxItem {
  recordKey: string;
}

const keyOf = (mutation: Mutation): string => `${mutation.domain}:${mutation.id}`;

const allItems = (): Promise<StoredItem[]> =>
  tx('readonly', (store) => store.getAll() as IDBRequest<StoredItem[]>);

/**
 * Append a mutation. If a pending mutation for the same record already exists,
 * it is replaced — the newest state of a record is the only one worth sending,
 * and a notes field firing a write per keystroke would otherwise flood the queue.
 */
export const enqueue = async (mutation: Mutation): Promise<void> => {
  const existing = (await allItems()).find(
    (item) => item.state === 'pending' && item.recordKey === keyOf(mutation),
  );

  const item: StoredItem = {
    seq: existing?.seq,
    recordKey: keyOf(mutation),
    mutation,
    state: 'pending',
    attempts: 0,
    queuedAt: new Date().toISOString(),
  };

  await tx('readwrite', (store) => store.put(item));
};

export const listPending = async (): Promise<OutboxItem[]> =>
  (await allItems()).filter((item) => item.state === 'pending').sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

export const listQuarantined = async (): Promise<OutboxItem[]> =>
  (await allItems()).filter((item) => item.state === 'quarantined').sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

export const countPending = async (): Promise<number> => (await listPending()).length;

export const ack = async (seqs: number[]): Promise<void> => {
  for (const seq of seqs) {
    await tx('readwrite', (store) => store.delete(seq));
  }
};

export const recordAttempt = async (seq: number, error: string): Promise<void> => {
  const item = await tx('readonly', (store) => store.get(seq) as IDBRequest<StoredItem | undefined>);
  if (!item) return;
  await tx('readwrite', (store) => store.put({ ...item, attempts: item.attempts + 1, lastError: error }));
};

export const quarantine = async (seq: number, reason: string): Promise<void> => {
  const item = await tx('readonly', (store) => store.get(seq) as IDBRequest<StoredItem | undefined>);
  if (!item) return;
  await tx('readwrite', (store) => store.put({ ...item, state: 'quarantined', lastError: reason }));
};

export const discardQuarantined = async (seq: number): Promise<void> => {
  await tx('readwrite', (store) => store.delete(seq));
};

export const clearOutbox = async (): Promise<void> => {
  await tx('readwrite', (store) => store.clear());
};
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run syncOutbox
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/sync/outbox.ts src/__tests__/syncOutbox.spec.ts package.json package-lock.json
git commit -m "feat(sync): durable IndexedDB outbox with per-record collapsing"
```

---

## Task 5: writeStore — the single write gateway

**Files:**
- Create: `src/sync/writeStore.ts`
- Create: `src/__tests__/syncWriteStore.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { writeStore, setSuppressCapture } from '../sync/writeStore';
import { listPending, clearOutbox } from '../sync/outbox';

const KEY = 'nutrition_tracker_custom_foods';
const food = (id: string, name: string) => ({
  id, name, calories: 100, protein: 10, carbs: 5, fats: 2, isCustom: true,
});

describe('writeStore', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
    setSuppressCapture(false);
  });

  it('persists the value to localStorage', async () => {
    await writeStore(KEY, [food('a', 'Bacon')]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([food('a', 'Bacon')]);
  });

  it('enqueues an upsert for a new record', async () => {
    await writeStore(KEY, [food('a', 'Bacon')]);
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation).toMatchObject({ domain: 'custom_food', id: 'a', deleted: false });
    expect(pending[0].mutation.fields.name).toBe('Bacon');
  });

  it('enqueues nothing when the value is unchanged', async () => {
    await writeStore(KEY, [food('a', 'Bacon')]);
    await clearOutbox();
    await writeStore(KEY, [food('a', 'Bacon')]);
    expect(await listPending()).toEqual([]);
  });

  it('enqueues only the record that changed', async () => {
    await writeStore(KEY, [food('a', 'Bacon'), food('b', 'Eggs')]);
    await clearOutbox();
    await writeStore(KEY, [food('a', 'Bacon'), { ...food('b', 'Eggs'), calories: 200 }]);
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation.id).toBe('b');
  });

  it('enqueues a tombstone for a removed record', async () => {
    await writeStore(KEY, [food('a', 'Bacon'), food('b', 'Eggs')]);
    await clearOutbox();
    await writeStore(KEY, [food('a', 'Bacon')]);
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].mutation).toMatchObject({ id: 'b', deleted: true });
  });

  it('captures nothing while suppressed, but still persists', async () => {
    setSuppressCapture(true);
    await writeStore(KEY, [food('a', 'Bacon')]);
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(await listPending()).toEqual([]);
  });

  it('ignores untracked keys entirely', async () => {
    await writeStore('some_ui_flag', { dismissed: true });
    expect(await listPending()).toEqual([]);
    expect(JSON.parse(localStorage.getItem('some_ui_flag')!)).toEqual({ dismissed: true });
  });

  it('treats a first write over absent storage as all-new, not as a diff', async () => {
    await writeStore(KEY, [food('a', 'Bacon'), food('b', 'Eggs')]);
    expect(await listPending()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run syncWriteStore
```

Expected: FAIL — cannot resolve `../sync/writeStore`.

- [ ] **Step 3: Write `src/sync/writeStore.ts`**

```ts
import { shredStore, STORE_KEYS, type StoreKey } from './shred';
import { enqueue } from './outbox';
import type { Mutation, SyncRecord } from './types';

const TRACKED = new Set<string>(STORE_KEYS);

/**
 * While applying changes pulled from the server we must not re-enqueue them,
 * or every pull would bounce straight back as a push.
 */
let suppressCapture = false;

export const setSuppressCapture = (value: boolean): void => {
  suppressCapture = value;
};

const readCurrent = (key: string): unknown => {
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const index = (records: SyncRecord[]): Map<string, SyncRecord> => {
  const map = new Map<string, SyncRecord>();
  for (const record of records) map.set(`${record.domain}:${record.id}`, record);
  return map;
};

const diff = (before: SyncRecord[], after: SyncRecord[], updatedAt: string): Mutation[] => {
  const previous = index(before);
  const next = index(after);
  const mutations: Mutation[] = [];

  for (const [key, record] of next) {
    const old = previous.get(key);
    if (old && JSON.stringify(old.fields) === JSON.stringify(record.fields)) continue;
    mutations.push({
      domain: record.domain, id: record.id, updatedAt, deleted: false, fields: record.fields,
    });
  }

  for (const [key, record] of previous) {
    if (next.has(key)) continue;
    mutations.push({
      domain: record.domain, id: record.id, updatedAt, deleted: true, fields: {},
    });
  }

  return mutations;
};

/**
 * The single gateway for writing a tracked store. Persists to localStorage and
 * queues the difference for sync. Untracked keys are persisted only.
 */
export const writeStore = async (key: string, value: unknown): Promise<void> => {
  if (!TRACKED.has(key)) {
    localStorage.setItem(key, JSON.stringify(value));
    return;
  }

  const before = suppressCapture ? [] : shredStore(key as StoreKey, readCurrent(key));
  localStorage.setItem(key, JSON.stringify(value));
  if (suppressCapture) return;

  const after = shredStore(key as StoreKey, value);
  const updatedAt = new Date().toISOString();

  for (const mutation of diff(before, after, updatedAt)) {
    await enqueue(mutation);
  }
};

/** Removing a whole store tombstones every record that was in it. */
export const removeStore = async (key: string): Promise<void> => {
  if (!TRACKED.has(key)) {
    localStorage.removeItem(key);
    return;
  }

  const before = suppressCapture ? [] : shredStore(key as StoreKey, readCurrent(key));
  localStorage.removeItem(key);
  if (suppressCapture) return;

  const updatedAt = new Date().toISOString();
  for (const record of before) {
    await enqueue({ domain: record.domain, id: record.id, updatedAt, deleted: true, fields: {} });
  }
};
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run syncWriteStore
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sync/writeStore.ts src/__tests__/syncWriteStore.spec.ts
git commit -m "feat(sync): writeStore gateway diffs stores into sync mutations"
```

---

## Task 6: Route existing writes through the gateway

**Files:**
- Modify: `src/utils/storage.ts` (10 `setItem`/`removeItem` sites)
- Modify: `src/utils/training.ts` (2 sites)
- Create: `src/__tests__/syncIntegration.spec.ts`

`writeStore` is async but every existing mutator is sync. Changing 25 signatures would ripple into
every component. Instead the mutators call it **fire-and-forget with an explicit error handler** —
the localStorage write inside `writeStore` happens synchronously before its first `await`, so
existing read-after-write behaviour is preserved exactly.

- [ ] **Step 1: Write the failing test**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { addCustomFood, saveDailyEntry, getDailyEntry, addAchievement } from '../utils/storage';
import { listPending, clearOutbox } from '../sync/outbox';

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('existing mutators feed the outbox', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
  });

  it('addCustomFood enqueues a custom_food upsert', async () => {
    addCustomFood({ name: 'Bacon', calories: 520, protein: 37, carbs: 0, fats: 42 });
    await flush();
    const pending = await listPending();
    expect(pending.map((i) => i.mutation.domain)).toContain('custom_food');
  });

  it('saveDailyEntry enqueues a food_entry upsert', async () => {
    const entry = getDailyEntry('2026-08-14');
    entry.foodEntries.push({
      id: 'f1', foodId: 'chicken', foodName: 'Chicken', portion: 220,
      calories: 363, protein: 68, carbs: 0, fats: 8,
      mealType: 'lunch', timestamp: '2026-08-14T12:00:00.000Z',
    });
    saveDailyEntry(entry);
    await flush();
    const pending = await listPending();
    expect(pending.some((i) => i.mutation.domain === 'food_entry' && i.mutation.id === 'f1')).toBe(true);
  });

  it('addAchievement enqueues an achievement upsert', async () => {
    addAchievement({ id: 'a1', name: 'First workout', date: '2026-08-14' });
    await flush();
    const pending = await listPending();
    expect(pending.some((i) => i.mutation.domain === 'achievement')).toBe(true);
  });

  it('reads still see the value synchronously right after a write', () => {
    const entry = getDailyEntry('2026-08-14');
    entry.totalCalories = 1234;
    saveDailyEntry(entry);
    expect(getDailyEntry('2026-08-14').totalCalories).toBe(1234);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run syncIntegration
```

Expected: FAIL — nothing is enqueued yet.

- [ ] **Step 3: Add the bridge to `src/utils/storage.ts`**

Add near the top, after the existing imports:

```ts
import { writeStore, removeStore } from '../sync/writeStore';

/**
 * Persist a tracked store and queue the change for sync.
 *
 * Deliberately fire-and-forget: every caller is a synchronous mutator used
 * throughout the component tree, and making them async would ripple into every
 * call site. The localStorage write inside writeStore happens synchronously
 * before its first await, so read-after-write still behaves as it always has.
 * A queueing failure is surfaced rather than swallowed.
 */
const persist = (key: string, value: unknown): void => {
  void writeStore(key, value).catch((error) => {
    console.error('[sync] failed to queue change for', key, error);
  });
};

const forget = (key: string): void => {
  void removeStore(key).catch((error) => {
    console.error('[sync] failed to queue removal for', key, error);
  });
};
```

- [ ] **Step 4: Replace every tracked write in `storage.ts`**

Replace each of these exactly:

| Line (approx) | Before | After |
|---|---|---|
| in `importAppBackup` | `localStorage.setItem(key, JSON.stringify(value))` | `persist(key, value)` |
| in `importAppBackup` (replace mode) | `localStorage.removeItem(key)` | `forget(key)` |
| `saveUserSettings` | `localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(settings))` | `persist(STORAGE_KEYS.USER_SETTINGS, settings)` |
| `saveDailyEntry` | `localStorage.setItem(STORAGE_KEYS.DAILY_ENTRIES, JSON.stringify(allEntries))` | `persist(STORAGE_KEYS.DAILY_ENTRIES, allEntries)` |
| `addAchievement` | `localStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(items))` | `persist(STORAGE_KEYS.ACHIEVEMENTS, items)` |
| `clearAchievements` | `localStorage.removeItem(STORAGE_KEYS.ACHIEVEMENTS)` | `forget(STORAGE_KEYS.ACHIEVEMENTS)` |
| `importFitnessData` | `localStorage.setItem(STORAGE_KEYS.DAILY_ENTRIES, ...)` | `persist(STORAGE_KEYS.DAILY_ENTRIES, entries)` |
| `resetAllFitnessData` | `localStorage.setItem(STORAGE_KEYS.DAILY_ENTRIES, ...)` | `persist(STORAGE_KEYS.DAILY_ENTRIES, entries)` |
| `saveCustomFoods` | `localStorage.setItem(STORAGE_KEYS.CUSTOM_FOODS, JSON.stringify(foods))` | `persist(STORAGE_KEYS.CUSTOM_FOODS, foods)` |
| `_saveBodyStats` | `localStorage.setItem(STORAGE_KEYS.BODY_STATS, JSON.stringify(entries))` | `persist(STORAGE_KEYS.BODY_STATS, entries)` |

**Leave `getBodyStats`'s write alone for now** — Task 7 handles it, because a read path that
writes would enqueue phantom mutations on every page load.

- [ ] **Step 5: Replace the writes in `src/utils/training.ts`**

Add the import:

```ts
import { writeStore } from '../sync/writeStore';
```

Then replace `saveTrainingData`:

```ts
export const saveTrainingData = (d: TrainingData): void => {
  void writeStore(TRAINING_KEY, d).catch((error) => {
    console.error('[sync] failed to queue training change', error);
  });
};
```

and in `importAllData`, replace `localStorage.setItem(k, JSON.stringify(data[k]))` with:

```ts
      void writeStore(k, data[k]).catch((error) => {
        console.error('[sync] failed to queue imported store', k, error);
      });
```

- [ ] **Step 6: Run the whole suite**

```bash
npx vitest run
```

Expected: PASS — the 141 existing tests plus the new sync tests. Existing tests that assert on
`localStorage` contents still pass because `writeStore` writes synchronously.

- [ ] **Step 7: Commit**

```bash
git add src/utils/storage.ts src/utils/training.ts src/__tests__/syncIntegration.spec.ts
git commit -m "feat(sync): route every tracked store write through the sync gateway"
```

---

## Task 7: Silence the read-path write

`getBodyStats` rewrites the whole array when it migrates legacy field names. Left alone it queues
a mutation for every body-stat record on every page load.

**Files:**
- Modify: `src/utils/storage.ts`
- Create: `src/__tests__/syncReadPath.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { getBodyStats } from '../utils/storage';
import { listPending, clearOutbox } from '../sync/outbox';

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('getBodyStats read path', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
  });

  it('does not queue mutations when only normalising legacy fields', async () => {
    localStorage.setItem('trainright_body_stats', JSON.stringify([
      { id: 'b1', date: '2026-05-26', weight: 83.6, bodyfat: 19.7 },
    ]));
    getBodyStats();
    await flush();
    expect(await listPending()).toEqual([]);
  });

  it('still normalises and persists the legacy shape', async () => {
    localStorage.setItem('trainright_body_stats', JSON.stringify([
      { id: 'b1', date: '2026-05-26', weight: 83.6, bodyfat: 19.7 },
    ]));
    const stats = getBodyStats();
    expect(stats[0].id).toBe('b1');
    expect(getBodyStats()[0].id).toBe('b1');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run syncReadPath
```

Expected: FAIL — one pending mutation is queued.

- [ ] **Step 3: Fix it**

In `getBodyStats`, keep the raw write and add a comment:

```ts
  if (needsSave) {
    // Deliberately a raw write, NOT persist(): this is a read path that
    // normalises legacy field names. Queueing it would enqueue every body-stat
    // record on every page load, and the normalisation is deterministic, so
    // every device reaches the same result on its own.
    localStorage.setItem(STORAGE_KEYS.BODY_STATS, JSON.stringify(entries));
  }
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run syncReadPath
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/storage.ts src/__tests__/syncReadPath.spec.ts
git commit -m "fix(sync): keep the body-stats read path from queuing phantom mutations"
```

---

## Task 8: Apply server changes locally

The inverse of shredding: fold a pulled `Change` back into the nested store shape the UI reads.

**Files:**
- Create: `src/sync/apply.ts`
- Create: `src/__tests__/syncApply.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { applyChanges } from '../sync/apply';
import { listPending, clearOutbox } from '../sync/outbox';
import { getDailyEntry, getCustomFoods } from '../utils/storage';
import type { Change } from '../sync/types';

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

const change = (over: Partial<Change>): Change => ({
  domain: 'custom_food', id: 'c1', updatedAt: '2026-08-14T12:00:00.000Z',
  deleted: false, fields: { name: 'Bacon', calories: 520, protein: 37, carbs: 0, fats: 42 },
  ...over,
});

describe('applyChanges', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
  });

  it('inserts a custom food the UI can then read', async () => {
    await applyChanges([change({})]);
    expect(getCustomFoods().map((f) => f.name)).toContain('Bacon');
  });

  it('removes a record on a tombstone', async () => {
    await applyChanges([change({})]);
    await applyChanges([change({ deleted: true, fields: {} })]);
    expect(getCustomFoods()).toEqual([]);
  });

  it('inserts a food entry into the right day', async () => {
    await applyChanges([change({
      domain: 'food_entry', id: 'f1',
      fields: {
        date: '2026-08-14', foodId: 'chicken', foodName: 'Chicken', portion: 220,
        calories: 363, protein: 68, carbs: 0, fats: 8,
        mealType: 'lunch', timestamp: '2026-08-14T12:00:00.000Z',
      },
    })]);
    expect(getDailyEntry('2026-08-14').foodEntries.map((f) => f.id)).toEqual(['f1']);
  });

  it('never queues what it applies', async () => {
    await applyChanges([change({})]);
    await flush();
    expect(await listPending()).toEqual([]);
  });

  it('ignores an unknown domain rather than throwing', async () => {
    await expect(applyChanges([change({ domain: 'trading_trade' })])).resolves.not.toThrow();
  });

  it('is idempotent — applying the same change twice changes nothing', async () => {
    await applyChanges([change({})]);
    const first = getCustomFoods();
    await applyChanges([change({})]);
    expect(getCustomFoods()).toEqual(first);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run syncApply
```

Expected: FAIL — cannot resolve `../sync/apply`.

- [ ] **Step 3: Write `src/sync/apply.ts`**

```ts
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
  date, foodEntries: [], exercises: [],
  totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0,
  totalExerciseCalories: 0, netCalories: 0,
  fitness: {
    pushups: { sets: [], totalReps: 0, setsCompleted: 0 },
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

const applyToDailyEntries = (store: unknown, change: Change): unknown => {
  const entries = isObject(store) ? { ...store } : {};
  const date = String(change.fields.date ?? '');
  if (!date) return entries;

  const day = isObject(entries[date]) ? { ...(entries[date] as Record<string, unknown>) } : emptyDay(date);

  if (change.domain === 'food_entry') {
    const { date: _d, ...rest } = change.fields;
    day.foodEntries = upsertById(day.foodEntries, change.id, { id: change.id, ...rest }, change.deleted);
  } else if (change.domain === 'exercise') {
    const { date: _d, ...rest } = change.fields;
    day.exercises = upsertById(day.exercises, change.id, { id: change.id, ...rest }, change.deleted);
  } else {
    const fitness = isObject(day.fitness) ? { ...day.fitness } : emptyDay(date).fitness;

    if (change.domain === 'pushup_set') {
      const pushups = isObject(fitness.pushups) ? { ...fitness.pushups } : { sets: [], totalReps: 0, setsCompleted: 0 };
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
      pushups.totalReps = sets.reduce((sum, s) => sum + (isObject(s) && typeof s.reps === 'number' ? s.reps : 0), 0);
      pushups.setsCompleted = sets.length;
      fitness.pushups = pushups;
    }

    if (change.domain === 'daily_steps' && !change.deleted) {
      fitness.steps = { steps: change.fields.steps ?? 0, goal: change.fields.goal ?? 5000 };
    }

    day.fitness = fitness;
  }

  entries[date] = day;
  return entries;
};

const applyToTraining = (store: unknown, change: Change): unknown => {
  const training = isObject(store)
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

  const logs = isObject(training.logs) ? { ...training.logs } : {};

  if (change.domain === 'session_log') {
    if (change.deleted) {
      delete logs[change.id];
    } else {
      const existing = isObject(logs[change.id]) ? (logs[change.id] as Record<string, unknown>) : {};
      const { date: _d, ...rest } = change.fields;
      logs[change.id] = { ...existing, ...rest, exercises: existing.exercises ?? {} };
    }
    training.logs = logs;
    return training;
  }

  const sessionDate = String(change.fields.sessionDate ?? '');
  const exerciseId = String(change.fields.exerciseId ?? '');
  if (!sessionDate || !exerciseId) return training;

  const session = isObject(logs[sessionDate]) ? { ...(logs[sessionDate] as Record<string, unknown>) } : {};
  const exercises = isObject(session.exercises) ? { ...session.exercises } : {};
  const exercise = isObject(exercises[exerciseId])
    ? { ...(exercises[exerciseId] as Record<string, unknown>) }
    : { sets: [] };

  if (change.domain === 'exercise_log') {
    if (change.deleted) delete exercises[exerciseId];
    else {
      if (change.fields.note !== undefined) exercise.note = change.fields.note;
      exercises[exerciseId] = exercise;
    }
  }

  if (change.domain === 'set_log') {
    const sets = Array.isArray(exercise.sets) ? [...exercise.sets] : [];
    const setIndex = Number(change.fields.setIndex ?? -1);
    if (setIndex >= 0) {
      if (change.deleted) {
        if (setIndex < sets.length) sets.splice(setIndex, 1);
      } else {
        const { sessionDate: _s, exerciseId: _e, setIndex: _i, ...rest } = change.fields;
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
      dailyCalories: f.dailyCalories, dailyProtein: f.dailyProtein,
      dailyCarbs: f.dailyCarbs, dailyFats: f.dailyFats,
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

  for (const change of changes) {
    const storeKey = STORE_OF[change.domain];
    if (!storeKey) continue;
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
    for (const [key, value] of touched) {
      if (value === undefined) continue;
      await writeStore(key, value);
    }
  } finally {
    setSuppressCapture(false);
  }
};
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run syncApply
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sync/apply.ts src/__tests__/syncApply.spec.ts
git commit -m "feat(sync): fold pulled changes back into local store shapes"
```

---

## Task 9: Round-trip property test

The strongest guarantee available: shred the real backup, apply it into an empty store, shred
again, and require the two record sets to match.

**Files:**
- Create: `src/__tests__/syncRoundTrip.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shredStore, STORE_KEYS } from '../sync/shred';
import { applyChanges } from '../sync/apply';
import { clearOutbox } from '../sync/outbox';
import type { Change } from '../sync/types';

const backup = JSON.parse(
  readFileSync(join(process.cwd(), 'trainright-health-backup-2026-06-28 (1).json'), 'utf-8'),
) as Record<string, unknown>;

const sortRecords = <T extends { domain: string; id: string }>(records: T[]): T[] =>
  [...records].sort((a, b) => (a.domain + a.id).localeCompare(b.domain + b.id));

describe('shred -> apply -> shred round trip on real data', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
  });

  it('reproduces every record exactly', async () => {
    const original = STORE_KEYS.flatMap((key) => shredStore(key, backup[key]));
    expect(original.length).toBeGreaterThan(50);

    const changes: Change[] = original.map((record) => ({
      domain: record.domain,
      id: record.id,
      updatedAt: '2026-08-14T12:00:00.000Z',
      deleted: false,
      fields: record.fields,
    }));

    await applyChanges(changes);

    const rebuilt = STORE_KEYS.flatMap((key) => {
      const raw = localStorage.getItem(key);
      return shredStore(key, raw === null ? undefined : JSON.parse(raw));
    });

    expect(sortRecords(rebuilt)).toEqual(sortRecords(original));
  });

  it('leaves the day totals readable after a rebuild', async () => {
    const original = STORE_KEYS.flatMap((key) => shredStore(key, backup[key]));
    await applyChanges(original.map((record) => ({
      domain: record.domain, id: record.id,
      updatedAt: '2026-08-14T12:00:00.000Z', deleted: false, fields: record.fields,
    })));

    const entries = JSON.parse(localStorage.getItem('nutrition_tracker_daily_entries')!);
    const days = Object.keys(entries);
    expect(days.length).toBeGreaterThan(0);
    for (const day of days) {
      expect(Array.isArray(entries[day].foodEntries)).toBe(true);
      expect(entries[day].date).toBe(day);
    }
  });
});
```

This is the test that catches an asymmetry between `shred` and `apply` — the single most likely
source of silent data loss in A2.

- [ ] **Step 2: Run it**

```bash
npx vitest run syncRoundTrip
```

Expected: PASS. A failure names the differing records; fix `apply.ts` (or `shred.ts`) until they
match. **Do not weaken the assertion.**

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/syncRoundTrip.spec.ts
git commit -m "test(sync): round-trip the real backup through shred and apply"
```

---

## Task 10: Sync client

**Files:**
- Create: `src/sync/client.ts`
- Create: `src/__tests__/syncClient.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { bootstrapDevice, pushMutations, pullChanges } from '../sync/client';
import { setDeviceToken, clearDeviceToken } from '../sync/config';
import type { Mutation } from '../sync/types';

const mutation: Mutation = {
  domain: 'achievement', id: 'a1', updatedAt: '2026-08-14T12:00:00.000Z',
  deleted: false, fields: { name: 'x', date: '2026-08-14' },
};

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }));

describe('sync client', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDeviceToken();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('bootstraps and stores the returned token', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ token: 'tok_1', deviceId: 'd1' })));
    const result = await bootstrapDevice('secret-code', 'Riaan PC');
    expect(result.ok).toBe(true);
    expect(localStorage.getItem('trainright_sync_token')).toBe('tok_1');
  });

  it('reports a rejected bootstrap code without storing anything', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ error: { code: 'bad_code' } }, 401)));
    const result = await bootstrapDevice('wrong', 'Riaan PC');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/code/i);
    expect(localStorage.getItem('trainright_sync_token')).toBeNull();
  });

  it('sends the bearer token when pushing', async () => {
    setDeviceToken('tok_1');
    const fetchMock = vi.fn(() => jsonResponse({ revision: 3, results: [{ id: 'a1', status: 'applied' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await pushMutations([mutation]);
    expect(results[0].status).toBe('applied');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok_1');
  });

  it('throws when pushing while unpaired', async () => {
    await expect(pushMutations([mutation])).rejects.toThrow(/not paired/i);
  });

  it('pulls changes and reports the new cursor', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({
      revision: 9, hasMore: false,
      changes: [{ domain: 'achievement', id: 'a1', updatedAt: 'x', deleted: false, fields: {} }],
    })));

    const page = await pullChanges(0);
    expect(page.revision).toBe(9);
    expect(page.changes).toHaveLength(1);
    expect(page.hasMore).toBe(false);
  });

  it('surfaces a server error rather than returning empty', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ error: { code: 'boom', message: 'nope' } }, 500)));
    await expect(pullChanges(0)).rejects.toThrow(/nope/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run syncClient
```

Expected: FAIL — cannot resolve `../sync/client`.

- [ ] **Step 3: Write `src/sync/client.ts`**

```ts
import { API_BASE, getDeviceToken, setDeviceToken } from './config';
import type { Change, Mutation, PushResult } from './types';

export type BootstrapResult = { ok: true; deviceId: string } | { ok: false; error: string };

const parseError = async (response: Response): Promise<string> => {
  try {
    const body = await response.json() as { error?: { code?: string; message?: string } };
    return body.error?.message ?? body.error?.code ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const authHeaders = (): Record<string, string> => {
  const token = getDeviceToken();
  if (!token) throw new Error('Device is not paired with the server.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
};

export const bootstrapDevice = async (code: string, label: string): Promise<BootstrapResult> => {
  const response = await fetch(`${API_BASE}/v1/auth/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, label }),
  });

  if (!response.ok) return { ok: false, error: await parseError(response) };

  const body = await response.json() as { token: string; deviceId: string };
  setDeviceToken(body.token);
  return { ok: true, deviceId: body.deviceId };
};

export const pushMutations = async (mutations: Mutation[]): Promise<PushResult[]> => {
  const response = await fetch(`${API_BASE}/v1/sync/push`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ mutations }),
  });

  if (!response.ok) throw new Error(await parseError(response));
  const body = await response.json() as { revision: number; results: PushResult[] };
  return body.results;
};

export interface PullPage {
  revision: number;
  hasMore: boolean;
  changes: Change[];
}

export const pullChanges = async (since: number): Promise<PullPage> => {
  const response = await fetch(`${API_BASE}/v1/sync/pull?since=${since}`, {
    headers: authHeaders(),
  });

  if (!response.ok) throw new Error(await parseError(response));
  return await response.json() as PullPage;
};
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run syncClient
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sync/client.ts src/__tests__/syncClient.spec.ts
git commit -m "feat(sync): HTTP client for bootstrap, push and pull"
```

---

## Task 11: Sync engine

**Files:**
- Create: `src/sync/engine.ts`
- Create: `src/__tests__/syncEngine.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { syncNow, getStatus, subscribeStatus } from '../sync/engine';
import { enqueue, listPending, listQuarantined, clearOutbox } from '../sync/outbox';
import { setDeviceToken, clearDeviceToken, getCursor } from '../sync/config';
import type { Mutation } from '../sync/types';

const mutation = (id: string): Mutation => ({
  domain: 'achievement', id, updatedAt: '2026-08-14T12:00:00.000Z',
  deleted: false, fields: { name: 'x', date: '2026-08-14' },
});

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }));

describe('sync engine', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
    clearDeviceToken();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does nothing while unpaired', async () => {
    await enqueue(mutation('a'));
    await syncNow();
    expect(await listPending()).toHaveLength(1);
    expect(getStatus().state).toBe('unpaired');
  });

  it('pushes pending items and clears them on success', async () => {
    setDeviceToken('tok_1');
    await enqueue(mutation('a'));
    vi.stubGlobal('fetch', vi.fn((url: string) => (
      String(url).includes('/push')
        ? jsonResponse({ revision: 1, results: [{ id: 'a', status: 'applied' }] })
        : jsonResponse({ revision: 1, hasMore: false, changes: [] })
    )));

    await syncNow();
    expect(await listPending()).toEqual([]);
  });

  it('clears an item the server reports as stale', async () => {
    setDeviceToken('tok_1');
    await enqueue(mutation('a'));
    vi.stubGlobal('fetch', vi.fn((url: string) => (
      String(url).includes('/push')
        ? jsonResponse({ revision: 1, results: [{ id: 'a', status: 'stale' }] })
        : jsonResponse({ revision: 1, hasMore: false, changes: [] })
    )));

    await syncNow();
    expect(await listPending()).toEqual([]);
  });

  it('quarantines a rejected item instead of retrying forever', async () => {
    setDeviceToken('tok_1');
    await enqueue(mutation('a'));
    vi.stubGlobal('fetch', vi.fn((url: string) => (
      String(url).includes('/push')
        ? jsonResponse({ revision: 1, results: [{ id: 'a', status: 'rejected', reason: 'Unknown field "x"' }] })
        : jsonResponse({ revision: 1, hasMore: false, changes: [] })
    )));

    await syncNow();
    expect(await listPending()).toEqual([]);
    const held = await listQuarantined();
    expect(held).toHaveLength(1);
    expect(held[0].lastError).toContain('Unknown field');
  });

  it('advances the cursor after a pull', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ revision: 42, hasMore: false, changes: [] })));
    await syncNow();
    expect(getCursor()).toBe(42);
  });

  it('records an error status and keeps items when the network fails', async () => {
    setDeviceToken('tok_1');
    await enqueue(mutation('a'));
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));

    await syncNow();
    expect(await listPending()).toHaveLength(1);
    expect(getStatus().state).toBe('error');
  });

  it('notifies subscribers as status changes', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ revision: 1, hasMore: false, changes: [] })));
    const seen: string[] = [];
    const unsubscribe = subscribeStatus((status) => seen.push(status.state));
    await syncNow();
    unsubscribe();
    expect(seen).toContain('syncing');
    expect(seen).toContain('idle');
  });

  it('does not run two syncs concurrently', async () => {
    setDeviceToken('tok_1');
    const fetchMock = vi.fn(() => jsonResponse({ revision: 1, hasMore: false, changes: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([syncNow(), syncNow()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run syncEngine
```

Expected: FAIL — cannot resolve `../sync/engine`.

- [ ] **Step 3: Write `src/sync/engine.ts`**

```ts
import { getCursor, setCursor, isPaired } from './config';
import { pushMutations, pullChanges } from './client';
import { listPending, ack, quarantine, recordAttempt, countPending } from './outbox';
import { applyChanges } from './apply';

export type SyncState = 'unpaired' | 'idle' | 'syncing' | 'error';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const MAX_ATTEMPTS = 6;

let status: SyncStatus = { state: 'unpaired', pending: 0, lastSyncedAt: null, lastError: null };
let running = false;
const listeners = new Set<(status: SyncStatus) => void>();

const emit = (next: Partial<SyncStatus>): void => {
  status = { ...status, ...next };
  for (const listener of listeners) listener(status);
};

export const getStatus = (): SyncStatus => status;

export const subscribeStatus = (listener: (status: SyncStatus) => void): (() => void) => {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
};

/**
 * Push everything queued, then pull everything new. Safe to call at any time:
 * concurrent calls collapse into one, and a failure leaves the outbox intact.
 */
export const syncNow = async (): Promise<void> => {
  if (running) return;
  if (!isPaired()) {
    emit({ state: 'unpaired', pending: await countPending() });
    return;
  }

  running = true;
  emit({ state: 'syncing', lastError: null });

  try {
    const pending = await listPending();
    if (pending.length) {
      const results = await pushMutations(pending.map((item) => item.mutation));
      const bySeq = new Map(pending.map((item) => [item.mutation.id, item]));
      const done: number[] = [];

      for (const result of results) {
        const item = bySeq.get(result.id);
        if (!item?.seq) continue;

        if (result.status === 'applied' || result.status === 'stale') {
          done.push(item.seq);
        } else {
          // A rejected payload cannot succeed on retry: quarantine it for review.
          await quarantine(item.seq, result.reason ?? 'Rejected by server');
        }
      }
      await ack(done);
    }

    let cursor = getCursor();
    for (let page = 0; page < 50; page += 1) {
      const result = await pullChanges(cursor);
      if (result.changes.length) await applyChanges(result.changes);
      cursor = result.revision;
      setCursor(cursor);
      if (!result.hasMore) break;
    }

    emit({
      state: 'idle',
      pending: await countPending(),
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Count the attempt against each pending item, and give up on any that have
    // failed too often rather than retrying forever.
    for (const item of await listPending()) {
      if (!item.seq) continue;
      await recordAttempt(item.seq, message);
      if (item.attempts + 1 >= MAX_ATTEMPTS) {
        await quarantine(item.seq, `Failed ${MAX_ATTEMPTS} times: ${message}`);
      }
    }

    emit({ state: 'error', pending: await countPending(), lastError: message });
  } finally {
    running = false;
  }
};

/** Sync on load, on reconnect, on tab focus, and every five minutes. */
export const startAutoSync = (): (() => void) => {
  const trigger = () => { void syncNow(); };

  trigger();
  window.addEventListener('online', trigger);
  window.addEventListener('focus', trigger);
  const interval = window.setInterval(trigger, 5 * 60 * 1000);

  return () => {
    window.removeEventListener('online', trigger);
    window.removeEventListener('focus', trigger);
    window.clearInterval(interval);
  };
};
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run syncEngine
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sync/engine.ts src/__tests__/syncEngine.spec.ts
git commit -m "feat(sync): sync engine with push, pull, quarantine and status"
```

---

## Task 12: Pairing and status UI, wired into the app

**Files:**
- Create: `src/components/SyncSettings.tsx`
- Modify: `src/components/Settings.tsx`, `src/App.tsx`
- Create: `src/__tests__/syncSettings.spec.tsx`

React 19 tests in this repo need an explicit `import React` and a flush of at least 50 ms — see
`src/__tests__/ui.spec.tsx` for the established pattern.

- [ ] **Step 1: Write the failing test**

```tsx
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SyncSettings from '../components/SyncSettings';
import { clearDeviceToken, setDeviceToken } from '../sync/config';

const flush = () => new Promise((resolve) => setTimeout(resolve, 60));

describe('SyncSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDeviceToken();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('offers pairing when unpaired', () => {
    render(<SyncSettings />);
    expect(screen.getByLabelText(/pairing code/i)).toBeTruthy();
  });

  it('stores the token on a successful pair', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ token: 'tok_1', deviceId: 'd1' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))));

    render(<SyncSettings />);
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /pair this device/i }));
    await flush();

    expect(localStorage.getItem('trainright_sync_token')).toBe('tok_1');
  });

  it('shows the server message when pairing is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ error: { code: 'bad_code', message: 'Bootstrap code rejected.' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    ))));

    render(<SyncSettings />);
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /pair this device/i }));
    await flush();

    expect(screen.getByText(/rejected/i)).toBeTruthy();
  });

  it('shows sync status once paired', async () => {
    setDeviceToken('tok_1');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ revision: 1, hasMore: false, changes: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))));

    render(<SyncSettings />);
    await flush();
    expect(screen.getByRole('button', { name: /sync now/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run syncSettings
```

Expected: FAIL — cannot resolve `../components/SyncSettings`.

- [ ] **Step 3: Write `src/components/SyncSettings.tsx`**

Match the existing Tailwind conventions in `Settings.tsx` — `dark:` variants on every colour, and
`rounded-lg border` cards.

```tsx
import { useEffect, useState } from 'react';
import { RefreshCw, Link2, Unlink, AlertTriangle } from 'lucide-react';
import { bootstrapDevice } from '../sync/client';
import { isPaired, clearDeviceToken } from '../sync/config';
import { syncNow, subscribeStatus, type SyncStatus } from '../sync/engine';
import { listQuarantined, discardQuarantined } from '../sync/outbox';
import type { OutboxItem } from '../sync/types';

const SyncSettings = () => {
  const [paired, setPaired] = useState(isPaired());
  const [code, setCode] = useState('');
  const [label, setLabel] = useState(() => (
    /iPhone|iPad|Android/i.test(navigator.userAgent) ? 'Phone' : 'PC'
  ));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [held, setHeld] = useState<OutboxItem[]>([]);

  useEffect(() => subscribeStatus(setStatus), []);

  useEffect(() => {
    void listQuarantined().then(setHeld);
  }, [status?.lastSyncedAt, status?.pending]);

  const pair = async () => {
    setBusy(true);
    setError(null);
    const result = await bootstrapDevice(code.trim(), label.trim() || 'Device');
    setBusy(false);
    if (result.ok) {
      setCode('');
      setPaired(true);
      void syncNow();
    } else {
      setError(result.error);
    }
  };

  const unpair = () => {
    clearDeviceToken();
    setPaired(false);
  };

  if (!paired) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Link2 className="w-4 h-4" /> Sync across devices
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Pair this device to share data with your other devices. You need the pairing code you
          set on the server.
        </p>

        <label className="block text-sm">
          <span className="text-gray-700 dark:text-gray-300">This device is called</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-700 dark:text-gray-300">Pairing code</span>
          <input
            type="password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-label="Pairing code"
            className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100"
          />
        </label>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          onClick={() => void pair()}
          disabled={busy || !code.trim()}
          className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? 'Pairing...' : 'Pair this device'}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <RefreshCw className="w-4 h-4" /> Sync
      </h3>

      <dl className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
        <div className="flex justify-between">
          <dt>Status</dt>
          <dd className="text-gray-900 dark:text-gray-100">{status?.state ?? 'idle'}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Waiting to send</dt>
          <dd className="text-gray-900 dark:text-gray-100">{status?.pending ?? 0}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Last synced</dt>
          <dd className="text-gray-900 dark:text-gray-100">
            {status?.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleTimeString() : 'never'}
          </dd>
        </div>
      </dl>

      {status?.lastError && (
        <p className="text-sm text-red-600 dark:text-red-400">{status.lastError}</p>
      )}

      {held.length > 0 && (
        <div className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {held.length} change{held.length === 1 ? '' : 's'} could not be sent
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
            {held.map((item) => (
              <li key={item.seq} className="flex justify-between gap-2">
                <span>{item.mutation.domain}: {item.lastError}</span>
                <button
                  onClick={() => void discardQuarantined(item.seq!).then(() => listQuarantined().then(setHeld))}
                  className="underline shrink-0"
                >
                  discard
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => void syncNow()}
          className="flex-1 rounded bg-blue-600 px-4 py-2 text-white"
        >
          Sync now
        </button>
        <button
          onClick={unpair}
          className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-700 dark:text-gray-300 flex items-center gap-1"
        >
          <Unlink className="w-4 h-4" /> Unpair
        </button>
      </div>
    </div>
  );
};

export default SyncSettings;
```

- [ ] **Step 4: Mount it in `Settings.tsx`**

Add the import and render `<SyncSettings />` as the first card in the settings list, above the
existing targets section.

- [ ] **Step 5: Start auto-sync in `App.tsx`**

Add the import and an effect inside the `App` component — **not** at module scope, so it is
cleaned up correctly:

```tsx
import { startAutoSync } from './sync/engine';

// inside App(), alongside the other effects:
useEffect(() => startAutoSync(), []);
```

- [ ] **Step 6: Run everything**

```bash
npx vitest run
npx tsc -b
```

Expected: all tests pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/SyncSettings.tsx src/components/Settings.tsx src/App.tsx src/__tests__/syncSettings.spec.tsx
git commit -m "feat(sync): pairing and status UI, auto-sync on load and focus"
```

---

## Task 13: First-run upload of existing data

Pairing a device that already holds data must push that data up. This reuses the shredders, so
there is no separate migration path to keep correct.

**Files:**
- Modify: `src/sync/engine.ts`, `src/components/SyncSettings.tsx`
- Create: `src/__tests__/syncFirstUpload.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { queueFullUpload } from '../sync/engine';
import { listPending, clearOutbox } from '../sync/outbox';

describe('queueFullUpload', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
  });

  it('queues nothing when there is no local data', async () => {
    await queueFullUpload();
    expect(await listPending()).toEqual([]);
  });

  it('queues every existing record', async () => {
    localStorage.setItem('nutrition_tracker_custom_foods', JSON.stringify([
      { id: 'c1', name: 'Bacon', calories: 520, protein: 37, carbs: 0, fats: 42 },
      { id: 'c2', name: 'Eggs', calories: 140, protein: 12, carbs: 1, fats: 10 },
    ]));

    await queueFullUpload();
    const pending = await listPending();
    expect(pending.map((i) => i.mutation.id).sort()).toEqual(['c1', 'c2']);
    expect(pending.every((i) => i.mutation.deleted === false)).toBe(true);
  });

  it('is idempotent - running twice queues each record once', async () => {
    localStorage.setItem('nutrition_tracker_custom_foods', JSON.stringify([
      { id: 'c1', name: 'Bacon', calories: 520, protein: 37, carbs: 0, fats: 42 },
    ]));

    await queueFullUpload();
    await queueFullUpload();
    expect(await listPending()).toHaveLength(1);
  });
});
```

Idempotence comes free from the outbox collapsing per record, which is why that behaviour was
built in Task 4.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run syncFirstUpload
```

Expected: FAIL — `queueFullUpload` is not exported.

- [ ] **Step 3: Add it to `src/sync/engine.ts`**

```ts
import { shredStore, STORE_KEYS } from './shred';
import { enqueue } from './outbox';

/**
 * Queue every record currently in local storage for upload. Used once, when a
 * device that already holds data is paired. Idempotent: the outbox keeps one
 * pending mutation per record, so running it twice queues each record once.
 */
export const queueFullUpload = async (): Promise<void> => {
  const updatedAt = new Date().toISOString();

  for (const key of STORE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    for (const record of shredStore(key, parsed)) {
      await enqueue({
        domain: record.domain, id: record.id, updatedAt, deleted: false, fields: record.fields,
      });
    }
  }
};
```

- [ ] **Step 4: Offer it after pairing in `SyncSettings.tsx`**

After a successful pair, before `syncNow()`:

```tsx
    if (result.ok) {
      setCode('');
      setPaired(true);
      // A device that already holds data must upload it, or the first pull
      // would make the server's empty state look authoritative.
      await queueFullUpload();
      void syncNow();
    }
```

- [ ] **Step 5: Run everything**

```bash
npx vitest run
npx tsc -b
```

- [ ] **Step 6: Commit**

```bash
git add src/sync/engine.ts src/components/SyncSettings.tsx src/__tests__/syncFirstUpload.spec.ts
git commit -m "feat(sync): upload existing local data when a device is paired"
```

---

## Task 14: Build, deploy, verify

- [ ] **Step 1: Full verification**

```bash
npx vitest run
npx tsc -b
npm run build
```

All three must succeed. `npm run build` runs `tsc -b && vite build`.

- [ ] **Step 2: Commit and deploy**

```bash
git add -u src
git commit -m "chore: phase A2 client sync"
git push origin main
```

CI builds and publishes to GitHub Pages in roughly 30 seconds.

- [ ] **Step 3: Verify on the PC**

1. Open the deployed app, go to Settings, pair with the bootstrap code, label it "PC".
2. Confirm "Waiting to send" counts down to 0 and "Last synced" fills in.

- [ ] **Step 4: Verify on the phone**

1. Open the app on the phone, pair it, label it "Phone".
2. Confirm the PC's data appears.

**Pair the device that holds your real data first.** Conflicts resolve last-write-wins per record,
and the first upload stamps every record with the time it was queued — so if an empty device
uploads after a full one, its tombstones would win. There are no tombstones on a first upload, so
the risk is limited to records that exist on both sides, but pairing the fullest device first
avoids the question entirely.

- [ ] **Step 5: Verify offline capture**

1. On the phone, enable airplane mode.
2. Log three sets on the Train tab.
3. Confirm Settings shows "Waiting to send: 3".
4. Disable airplane mode, wait for a sync, confirm the count returns to 0.
5. Refresh the PC and confirm all three sets appear exactly once.

That is acceptance criteria 1 and 2 from the spec.

---

## Done criteria

- [ ] `npx vitest run` passes — the 141 existing tests plus roughly 60 new ones.
- [ ] `npx tsc -b` and `npm run build` both clean.
- [ ] The real backup round-trips through shred and apply with zero record differences.
- [ ] A meal logged on the PC appears on the phone within 30 seconds of it being foregrounded.
- [ ] Three sets logged in airplane mode arrive exactly once after reconnecting.
- [ ] Rejected mutations appear in Settings for review rather than disappearing.
- [ ] `src/data/program.ts` is unchanged.

## Out of scope

`health_metrics_v1` (absorbed Garmin data) is **not** synced in A2 — it is regenerable from Garmin
and Phase B rewrites that path. Also excluded: the three `pushup_*` reminder keys and
`health_coach_notes_v2_dismissed`, which are device-local UI state.
