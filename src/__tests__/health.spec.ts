import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mergeGarminData, suggestReadiness, getHealthMetrics, saveHealthMetrics,
  hoursSinceSync, isHealthDataStale, lastSyncLabel, GARMIN_FILE,
} from '../utils/health';
import { getDailyEntry, exportAppBackup } from '../utils/storage';
import { clearOutbox, listPending } from '../sync/outbox';

beforeEach(() => {
  localStorage.clear();
});

describe('mergeGarminData', () => {
  it('stores metrics and pushes steps into daily entries', () => {
    const n = mergeGarminData({
      source: 'garmin_connect',
      syncedAt: '2026-06-05T12:00:00+02:00',
      days: {
        '2026-06-04': { steps: 6200, sleepHours: 7.2, rhr: 52, hrv: 48 },
        '2026-06-05': { steps: 3100, rhr: 54 },
      },
    });
    expect(n).toBe(2);
    expect(getHealthMetrics().days['2026-06-04'].sleepHours).toBe(7.2);
    expect(getDailyEntry('2026-06-04').fitness?.steps.steps).toBe(6200);
  });

  it('queues Garmin step changes in the private synchronization outbox after commit', async () => {
    await clearOutbox();
    expect(mergeGarminData({
      source: 'garmin_connect',
      syncedAt: '2026-06-05T12:00:00+02:00',
      days: { '2026-06-05': { steps: 6200 } },
    })).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const pending = await listPending();
    expect(pending.some((item) => item.mutation.id === '2026-06-05' && item.mutation.fields.steps === 6200)).toBe(true);
    await clearOutbox();
  });

  it('preserves every supported Garmin daily statistic with source provenance', () => {
    mergeGarminData({
      source: 'garmin_connect',
      syncedAt: '2026-08-14T06:00:00+02:00',
      days: {
        '2026-08-13': {
          steps: 9829,
          distanceKm: 8.813,
          totalCalories: 3082,
          activeCalories: 1019,
          sleepHours: 8.63,
          rhr: 59,
          hrv: 47,
          garminDetails: { hydration: { valueInML: 1800, goalInML: 2500 } },
        },
      },
      activities: [{ activityType: 'strength_training', startTimeLocal: '2026-08-13 15:00:00' }],
      bodyComposition: { records: [{ calendarDate: '2026-08-13', weight: 96500 }] },
      fitness: { fitnessAge: { fitnessAge: 44 } },
      provenance: { identifiersAndLocationsRemoved: true },
    });
    const metrics = getHealthMetrics();
    expect(metrics.source).toBe('garmin_connect');
    expect(metrics.days['2026-08-13']).toEqual({
      steps: 9829,
      distanceKm: 8.813,
      totalCalories: 3082,
      activeCalories: 1019,
      sleepHours: 8.63,
      rhr: 59,
      hrv: 47,
      garminDetails: { hydration: { valueInML: 1800, goalInML: 2500 } },
    });
    expect(metrics.activities).toHaveLength(1);
    expect(metrics.bodyComposition?.records).toHaveLength(1);
    expect(metrics.fitness?.fitnessAge).toEqual({ fitnessAge: 44 });
    expect(metrics.provenance?.identifiersAndLocationsRemoved).toBe(true);
  });

  it('rejects malformed or non-Garmin payloads without changing stored history', () => {
    saveHealthMetrics({ syncedAt: '2026-08-13T06:00:00+02:00', days: { '2026-08-12': { steps: 5000 } } });
    expect(mergeGarminData({ source: 'other', days: { '2026-08-13': { steps: 9000 } } })).toBe(0);
    expect(mergeGarminData({ source: 'garmin_connect', days: { 'not-a-date': { steps: 9000 } } })).toBe(0);
    expect(mergeGarminData({ source: 'garmin_connect', days: { '2026-08-13': { steps: Number.NaN } } })).toBe(0);
    expect(getHealthMetrics()).toEqual({
      syncedAt: '2026-08-13T06:00:00+02:00',
      days: { '2026-08-12': { steps: 5000 } },
    });
  });

  it('rejects adversarial malformed structures without storage or fitness side effects', () => {
    const original = { syncedAt: '2026-08-13T06:00:00+02:00', days: { '2026-08-12': { steps: 5000 } } };
    const malformed = [
      null,
      { source: 'garmin_connect', days: { '2026-08-13': {} } },
      { source: 'garmin_connect', days: { '2026-08-13': [] } },
      { source: 'garmin_connect', days: { '2026-08-13': { garminDetails: {} } } },
      { source: 'garmin_connect', days: { '2026-08-13': { garminDetails: { summary: { status: '   ' } } } } },
      { source: 'garmin_connect', days: { '2026-08-13': { hrvStatus: 'x'.repeat(129) } } },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: '9000' } } },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: {} } } },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: [] } } },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000, unknownMetric: 1 } } },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, unknownTop: true },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000, garminDetails: { summary: { key: 'SECRET' } } } } },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, activities: [{ key: 'SECRET' }] },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, fitness: { fitnessAge: { key: 'SECRET' } } },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, provenance: { unexpected: true } },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, activities: [null] },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, bodyComposition: { records: [null] } },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, dateRange: { start: 'bad', end: '2026-08-13' } },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, dateRange: { start: '2026-08-14', end: '2026-08-13' } },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, dateRange: {} },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, fitness: [] },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, fitness: {} },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, provenance: {} },
      { source: 'garmin_connect', days: { '2026-08-13': { steps: 9000 } }, bodyComposition: {} },
    ];

    for (const payload of malformed) {
      localStorage.clear();
      saveHealthMetrics(original);
      expect(mergeGarminData(payload as Parameters<typeof mergeGarminData>[0])).toBe(0);
      expect(getHealthMetrics()).toEqual(original);
      expect(localStorage.length).toBe(1);
    }
  });

  it('rolls back health and fitness storage if the second generation write fails', () => {
    expect(mergeGarminData({
      source: 'garmin_connect',
      syncedAt: '2026-08-13T06:00:00+02:00',
      days: { '2026-08-12': { steps: 5000 } },
    })).toBe(1);
    const previousHealth = localStorage.getItem('health_metrics_v1');
    const previousDaily = localStorage.getItem('nutrition_tracker_daily_entries');
    const originalSetItem = Storage.prototype.setItem;
    let calls = 0;
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      calls++;
      if (calls === 2) throw new DOMException('quota', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    });

    expect(mergeGarminData({
      source: 'garmin_connect',
      syncedAt: '2026-08-14T06:00:00+02:00',
      days: { '2026-08-13': { steps: 9000 } },
    })).toBe(0);
    setSpy.mockRestore();

    expect(localStorage.getItem('health_metrics_v1')).toBe(previousHealth);
    expect(localStorage.getItem('nutrition_tracker_daily_entries')).toBe(previousDaily);
  });

  it('atomically replaces overlapping days and retains older activity/body history', () => {
    mergeGarminData({
      source: 'garmin_connect',
      days: { '2026-08-12': { steps: 5000, sleepHours: 7 } },
      activities: [{ activityType: 'walking', startTimeLocal: '2026-08-12 10:00:00' }],
      bodyComposition: { records: [{ calendarDate: '2026-08-12', weight: 96000 }] },
    });
    mergeGarminData({
      source: 'garmin_connect',
      days: { '2026-08-12': { steps: 5100 }, '2026-08-13': { steps: 6000 } },
      activities: [{ activityType: 'strength_training', startTimeLocal: '2026-08-13 15:00:00' }],
      bodyComposition: { records: [{ calendarDate: '2026-08-13', weight: 95500 }] },
    });
    const metrics = getHealthMetrics();
    expect(metrics.days['2026-08-12']).toEqual({ steps: 5100 });
    expect(metrics.activities?.map((item) => item.activityType)).toEqual(['walking', 'strength_training']);
    expect(metrics.bodyComposition?.records).toHaveLength(2);
  });

  it('retains normalized history while compacting source details older than 90 days', () => {
    saveHealthMetrics({
      syncedAt: '2026-01-02T06:00:00+02:00',
      days: { '2026-01-01': { steps: 4000, garminDetails: { summary: { totalSteps: 4000 } } } },
    });

    expect(mergeGarminData({
      source: 'garmin_connect',
      syncedAt: '2026-08-14T06:00:00+02:00',
      days: { '2026-08-14': { steps: 9000, garminDetails: { summary: { totalSteps: 9000 } } } },
      provenance: { identifiersAndLocationsRemoved: true },
    })).toBe(1);

    const health = getHealthMetrics();
    expect(health.days['2026-01-01'].steps).toBe(4000);
    expect(health.days['2026-01-01'].garminDetails).toBeUndefined();
    expect(health.days['2026-08-14'].garminDetails).toBeDefined();
    expect(health.provenance).toMatchObject({ detailRetentionDays: 90, historicalNormalizedDaysRetained: true });
  });

  it('includes Garmin health history in the full TrainRight backup', () => {
    mergeGarminData({ source: 'garmin_connect', days: { '2026-08-13': { steps: 9829, hrv: 47 } } });
    const backup = JSON.parse(exportAppBackup());
    expect(backup.health_metrics_v1.days['2026-08-13']).toEqual({ steps: 9829, hrv: 47 });
  });

  it('never lowers manually-logged steps', () => {
    const entry = getDailyEntry('2026-06-04');
    entry.fitness = { pushups: { sets: [], totalReps: 0, setsCompleted: 0 }, steps: { steps: 9000, goal: 5000 } };
    // save via merge of higher value first to persist, then try lower
    mergeGarminData({ source: 'garmin_connect', days: { '2026-06-04': { steps: 9000 } } });
    mergeGarminData({ source: 'garmin_connect', days: { '2026-06-04': { steps: 4000 } } });
    expect(getDailyEntry('2026-06-04').fitness?.steps.steps).toBe(9000);
  });
});

describe('suggestReadiness', () => {
  const baselineDays = () => {
    const days: Record<string, { rhr: number }> = {};
    for (let i = 1; i <= 10; i++) {
      const d = new Date('2026-06-05T00:00:00');
      d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = { rhr: 52 };
    }
    return days;
  };

  it('returns null with no data', () => {
    expect(suggestReadiness('2026-06-05')).toBeNull();
  });

  it('suggests green when sleep and RHR are normal', () => {
    mergeGarminData({ source: 'garmin_connect', days: { ...baselineDays(), '2026-06-05': { sleepHours: 7.5, rhr: 53 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('green');
  });

  it('suggests yellow on short sleep', () => {
    mergeGarminData({ source: 'garmin_connect', days: { ...baselineDays(), '2026-06-05': { sleepHours: 5.5, rhr: 53 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('yellow');
  });

  it('suggests yellow on elevated RHR (+5 vs baseline)', () => {
    mergeGarminData({ source: 'garmin_connect', days: { ...baselineDays(), '2026-06-05': { sleepHours: 7.5, rhr: 58 } } });
    const s = suggestReadiness('2026-06-05');
    expect(s?.suggestion).toBe('yellow');
    expect(s?.rhrBaseline).toBe(52);
  });

  it('suggests red on very short sleep or big RHR spike', () => {
    mergeGarminData({ source: 'garmin_connect', days: { ...baselineDays(), '2026-06-05': { sleepHours: 4.5, rhr: 53 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('red');
    localStorage.clear();
    mergeGarminData({ source: 'garmin_connect', days: { ...baselineDays(), '2026-06-05': { sleepHours: 7.5, rhr: 63 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('red');
  });

  it('ignores RHR rule without enough baseline days', () => {
    mergeGarminData({ source: 'garmin_connect', days: { '2026-06-05': { sleepHours: 7.5, rhr: 70 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('green');
  });
});

// ── Sync staleness — drives the StalenessBanner on the Train tab ──────────────
describe('sync staleness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('returns null hours and "never" when nothing has synced', () => {
    expect(hoursSinceSync()).toBeNull();
    expect(lastSyncLabel()).toBe('never');
    expect(isHealthDataStale()).toBe(true); // null counts as stale
  });

  it('reports recent sync as fresh', () => {
    saveHealthMetrics({ syncedAt: new Date('2026-06-10T08:00:00Z').toISOString(), days: {} });
    expect(hoursSinceSync()).toBeCloseTo(4, 0);
    expect(lastSyncLabel()).toBe('4 h ago');
    expect(isHealthDataStale()).toBe(false);
    expect(isHealthDataStale(2)).toBe(true); // custom threshold
  });

  it('reports 49h-old sync as stale (default 48h threshold)', () => {
    saveHealthMetrics({ syncedAt: new Date('2026-06-08T11:00:00Z').toISOString(), days: {} });
    expect(isHealthDataStale()).toBe(true);
    expect(lastSyncLabel()).toBe('2 d ago');
  });

  it('handles malformed syncedAt gracefully', () => {
    saveHealthMetrics({ syncedAt: 'not-a-date', days: {} });
    expect(hoursSinceSync()).toBeNull();
    expect(lastSyncLabel()).toBe('never');
    expect(isHealthDataStale()).toBe(true);
  });
});

// ── Filename contract with garmin_sync.py ──
describe('GARMIN_FILE constant', () => {
  it('matches the OUT_NAME baked into garmin_sync.py — they must stay in sync', () => {
    // If you rename one, rename the other. This test exists so the rename
    // can't ship half-done. See garmin_sync.py: OUT_NAME.
    expect(GARMIN_FILE).toBe('gh-sync.json');
  });
});
