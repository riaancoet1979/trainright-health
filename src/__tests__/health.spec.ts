import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mergeGarminData, suggestReadiness, getHealthMetrics, saveHealthMetrics,
  hoursSinceSync, isHealthDataStale, lastSyncLabel, GARMIN_FILE,
} from '../utils/health';
import { getDailyEntry } from '../utils/storage';

beforeEach(() => {
  localStorage.clear();
});

describe('mergeGarminData', () => {
  it('stores metrics and pushes steps into daily entries', () => {
    const n = mergeGarminData({
      source: 'garmin',
      syncedAt: '2026-06-05',
      days: {
        '2026-06-04': { steps: 6200, sleepHours: 7.2, rhr: 52, hrv: 48 },
        '2026-06-05': { steps: 3100, rhr: 54 },
      },
    });
    expect(n).toBe(2);
    expect(getHealthMetrics().days['2026-06-04'].sleepHours).toBe(7.2);
    expect(getDailyEntry('2026-06-04').fitness?.steps.steps).toBe(6200);
  });

  it('never lowers manually-logged steps', () => {
    const entry = getDailyEntry('2026-06-04');
    entry.fitness = { pushups: { sets: [], totalReps: 0, setsCompleted: 0 }, steps: { steps: 9000, goal: 5000 } };
    // save via merge of higher value first to persist, then try lower
    mergeGarminData({ days: { '2026-06-04': { steps: 9000 } } });
    mergeGarminData({ days: { '2026-06-04': { steps: 4000 } } });
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
    mergeGarminData({ days: { ...baselineDays(), '2026-06-05': { sleepHours: 7.5, rhr: 53 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('green');
  });

  it('suggests yellow on short sleep', () => {
    mergeGarminData({ days: { ...baselineDays(), '2026-06-05': { sleepHours: 5.5, rhr: 53 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('yellow');
  });

  it('suggests yellow on elevated RHR (+5 vs baseline)', () => {
    mergeGarminData({ days: { ...baselineDays(), '2026-06-05': { sleepHours: 7.5, rhr: 58 } } });
    const s = suggestReadiness('2026-06-05');
    expect(s?.suggestion).toBe('yellow');
    expect(s?.rhrBaseline).toBe(52);
  });

  it('suggests red on very short sleep or big RHR spike', () => {
    mergeGarminData({ days: { ...baselineDays(), '2026-06-05': { sleepHours: 4.5, rhr: 53 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('red');
    localStorage.clear();
    mergeGarminData({ days: { ...baselineDays(), '2026-06-05': { sleepHours: 7.5, rhr: 63 } } });
    expect(suggestReadiness('2026-06-05')?.suggestion).toBe('red');
  });

  it('ignores RHR rule without enough baseline days', () => {
    mergeGarminData({ days: { '2026-06-05': { sleepHours: 7.5, rhr: 70 } } });
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
