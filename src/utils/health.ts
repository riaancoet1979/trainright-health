// ============================================================
// TrainRight Health — Garmin / wearable health metrics
// Auto-loads dist/garmin_health.json (written by garmin_sync.py),
// merges steps into daily entries, stores sleep/RHR/HRV, and
// produces a readiness SUGGESTION (never a diagnosis).
// ============================================================

import type { Readiness } from '../types/training';
import { getDailyEntry, saveDailyEntry } from './storage';
import { dateKey } from './training';

export const HEALTH_KEY = 'health_metrics_v1';

export interface DayHealth {
  steps?: number;
  sleepHours?: number;
  rhr?: number;
  hrv?: number;
}

export interface HealthMetrics {
  syncedAt: string | null;
  days: Record<string, DayHealth>; // YYYY-MM-DD
}

export interface GarminPayload {
  source?: string;
  syncedAt?: string;
  days?: Record<string, DayHealth>;
}

export const getHealthMetrics = (): HealthMetrics => {
  try {
    const raw = localStorage.getItem(HEALTH_KEY);
    if (raw) return JSON.parse(raw) as HealthMetrics;
  } catch { /* fall through */ }
  return { syncedAt: null, days: {} };
};

export const saveHealthMetrics = (m: HealthMetrics): void => {
  localStorage.setItem(HEALTH_KEY, JSON.stringify(m));
};

/** Merge a Garmin payload: store metrics + push steps into daily entries. */
export const mergeGarminData = (payload: GarminPayload): number => {
  if (!payload.days) return 0;
  const m = getHealthMetrics();
  let merged = 0;
  for (const [ds, day] of Object.entries(payload.days)) {
    m.days[ds] = { ...m.days[ds], ...day };
    merged++;
    // Steps: take Garmin value when it exceeds what's logged
    if (day.steps !== undefined) {
      const entry = getDailyEntry(ds);
      if (!entry.fitness) {
        entry.fitness = { pushups: { sets: [], totalReps: 0, setsCompleted: 0 }, steps: { steps: 0, goal: 5000 } };
      }
      if (day.steps > (entry.fitness.steps.steps || 0)) {
        entry.fitness.steps.steps = day.steps;
        saveDailyEntry(entry);
      }
    }
  }
  m.syncedAt = payload.syncedAt ?? new Date().toISOString();
  saveHealthMetrics(m);
  return merged;
};

/** Fetch garmin_health.json from the app origin (same folder as the app). */
export const fetchGarminFile = async (): Promise<number | null> => {
  try {
    const res = await fetch(`garmin_health.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const payload = (await res.json()) as GarminPayload;
    return mergeGarminData(payload);
  } catch {
    return null; // offline / file absent — use last merged data
  }
};

// ── Sync staleness (M-01) ──
/** Hours since the most recent successful Garmin sync; null if never synced. */
export const hoursSinceSync = (m: HealthMetrics = getHealthMetrics()): number | null => {
  if (!m.syncedAt) return null;
  const t = Date.parse(m.syncedAt);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 36e5;
};

/** True when no sync has happened in `thresholdHours` (default 48). */
export const isHealthDataStale = (thresholdHours = 48): boolean => {
  const h = hoursSinceSync();
  return h === null || h > thresholdHours;
};

/** Human-readable label for the last sync, e.g. "5 h ago" / "2 d ago" / "never". */
export const lastSyncLabel = (m: HealthMetrics = getHealthMetrics()): string => {
  const h = hoursSinceSync(m);
  if (h === null) return 'never';
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

// ── Readiness suggestion ──
export interface ReadinessSuggestion {
  suggestion: Readiness;
  reasons: string[];
  sleepHours?: number;
  rhr?: number;
  rhrBaseline?: number;
  hrv?: number;
}

const median = (arr: number[]): number => {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Suggest readiness from last night's sleep + RHR vs the previous 14-day
 * median. Trends + thresholds, not medical rules. Returns null when there
 * is no data for the date.
 */
export const suggestReadiness = (date: Date | string): ReadinessSuggestion | null => {
  const m = getHealthMetrics();
  const ds = dateKey(date);
  const today = m.days[ds];
  if (!today || (today.sleepHours === undefined && today.rhr === undefined)) return null;

  const baselineVals: number[] = [];
  const d0 = new Date(ds + 'T00:00:00');
  for (let i = 1; i <= 14; i++) {
    const prev = new Date(d0);
    prev.setDate(prev.getDate() - i);
    const pd = m.days[dateKey(prev)];
    if (pd?.rhr !== undefined) baselineVals.push(pd.rhr);
  }
  const rhrBaseline = baselineVals.length >= 5 ? median(baselineVals) : undefined;

  const reasons: string[] = [];
  let score = 0; // 0 = green, 1 = yellow, 2 = red

  if (today.sleepHours !== undefined) {
    if (today.sleepHours < 5) { score = Math.max(score, 2); reasons.push(`Sleep ${today.sleepHours}h (<5h)`); }
    else if (today.sleepHours < 6) { score = Math.max(score, 1); reasons.push(`Sleep ${today.sleepHours}h (<6h)`); }
  }
  if (today.rhr !== undefined && rhrBaseline !== undefined) {
    const delta = today.rhr - rhrBaseline;
    if (delta >= 10) { score = Math.max(score, 2); reasons.push(`RHR ${today.rhr} (+${Math.round(delta)} vs baseline)`); }
    else if (delta >= 5) { score = Math.max(score, 1); reasons.push(`RHR ${today.rhr} (+${Math.round(delta)} vs baseline)`); }
  }

  const suggestion: Readiness = score === 2 ? 'red' : score === 1 ? 'yellow' : 'green';
  if (reasons.length === 0) reasons.push('Sleep and RHR look normal');
  return {
    suggestion,
    reasons,
    sleepHours: today.sleepHours,
    rhr: today.rhr,
    rhrBaseline,
    hrv: today.hrv,
  };
};
