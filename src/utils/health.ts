// ============================================================
// TrainRight Health — Garmin / wearable health metrics
// Auto-loads gh-sync.json (written by garmin_sync.py), merges steps into daily
// entries, stores the complete Garmin daily wellness record, and produces a
// readiness SUGGESTION (never a diagnosis).
// ============================================================

import type { Readiness } from '../types/training';
import { captureAllDailyEntryChanges, getAllDailyEntries, getDailyEntry } from './storage';
import { dateKey } from './training';

export const HEALTH_KEY = 'health_metrics_v1';
const DAILY_ENTRIES_KEY = 'nutrition_tracker_daily_entries';
const DETAIL_RETENTION_DAYS = 90;

// Filename for the Garmin/wearable JSON served by the same origin as the app.
// Generated locally by protected Garmin sync. It is deliberately gitignored and
// must not be bundled into the public GitHub Pages deployment. Anyone able to
// access this file can read the health data, so local/private serving is required.
export const GARMIN_FILE = 'gh-sync.json';

export interface DayHealth {
  source?: string;
  steps?: number;
  stepGoal?: number;
  distanceKm?: number;
  totalCalories?: number;
  activeCalories?: number;
  bmrCalories?: number;
  rhr?: number;
  minHeartRate?: number;
  maxHeartRate?: number;
  hrv?: number;
  hrvWeeklyAvg?: number;
  hrvStatus?: string;
  sleepHours?: number;
  sleepScore?: number;
  deepSleepHours?: number;
  lightSleepHours?: number;
  remSleepHours?: number;
  awakeSleepHours?: number;
  averageSleepStress?: number;
  averageStress?: number;
  stressQualifier?: string;
  bodyBatteryWake?: number;
  bodyBatteryHigh?: number;
  bodyBatteryLow?: number;
  bodyBatteryLatest?: number;
  bodyBatteryCharged?: number;
  bodyBatteryDrained?: number;
  averageSpo2?: number;
  lowestSpo2?: number;
  averageRespiration?: number;
  moderateIntensityMinutes?: number;
  vigorousIntensityMinutes?: number;
  floorsAscended?: number;
  sedentaryHours?: number;
  activeHours?: number;
  garminDetails?: Record<string, unknown>;
}

export interface HealthMetrics {
  source?: string;
  syncedAt: string | null;
  days: Record<string, DayHealth>; // YYYY-MM-DD
  dateRange?: { start?: string; end?: string; timezone?: string };
  activities?: Record<string, unknown>[];
  bodyComposition?: { startDate?: string; endDate?: string; totalAverage?: Record<string, unknown>; records?: Record<string, unknown>[] };
  fitness?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
}

export interface GarminPayload {
  source?: string;
  syncedAt?: string;
  days?: Record<string, DayHealth>;
  dateRange?: HealthMetrics['dateRange'];
  activities?: HealthMetrics['activities'];
  bodyComposition?: HealthMetrics['bodyComposition'];
  fitness?: HealthMetrics['fitness'];
  provenance?: HealthMetrics['provenance'];
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

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SYNC_TIMEZONE = /(Z|[+-]\d{2}:\d{2})$/;

const isValidDayKey = (value: string): boolean => {
  if (!ISO_DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const hasOnlyFiniteNumbers = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(hasOnlyFiniteNumbers);
  if (value && typeof value === 'object') return Object.values(value).every(hasOnlyFiniteNumbers);
  return true;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isRecordArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every((item) => isRecord(item) && hasOnlyFiniteNumbers(item));
const isSanitizedRecordArray = (value: unknown): value is Record<string, unknown>[] =>
  isRecordArray(value) && value.every((item) => Object.keys(item).length > 0 && isSanitizedDetailRecord(item));
const hasExactKeys = (value: Record<string, unknown>, allowed: Set<string>): boolean =>
  Object.keys(value).every((key) => allowed.has(key));

const NUMERIC_DAY_FIELDS = new Set([
  'steps', 'stepGoal', 'distanceKm', 'totalCalories', 'activeCalories', 'bmrCalories',
  'rhr', 'minHeartRate', 'maxHeartRate', 'hrv', 'hrvWeeklyAvg', 'sleepHours', 'sleepScore',
  'deepSleepHours', 'lightSleepHours', 'remSleepHours', 'awakeSleepHours', 'averageSleepStress',
  'averageStress', 'bodyBatteryWake', 'bodyBatteryHigh', 'bodyBatteryLow', 'bodyBatteryLatest',
  'bodyBatteryCharged', 'bodyBatteryDrained', 'averageSpo2', 'lowestSpo2', 'averageRespiration',
  'moderateIntensityMinutes', 'vigorousIntensityMinutes', 'floorsAscended', 'sedentaryHours',
  'activeHours',
]);
const STRING_DAY_FIELDS = new Set(['source', 'hrvStatus', 'stressQualifier']);
const ALLOWED_DAY_FIELDS = new Set([...NUMERIC_DAY_FIELDS, ...STRING_DAY_FIELDS, 'garminDetails']);
const ALLOWED_PAYLOAD_FIELDS = new Set(['source', 'syncedAt', 'dateRange', 'days', 'activities', 'bodyComposition', 'fitness', 'provenance']);
const DETAIL_GROUPS = new Set(['summary', 'sleep', 'hrv', 'hydration', 'spo2', 'respiration', 'intensity', 'heartRates', 'stress', 'bodyBattery']);
const SAFE_DETAIL_TOKENS = new Set([
  'summary','wellness','calendar','date','timestamp','timezone','starttime','endtime','duration','second','minute','hour','count','total','average','avg','minimum','maximum','min','max','goal','value','score','status','qualifier','level','calorie','kilocalorie','distance','meter','step','heart','rate','hrv','stress','battery','spo2','oxygen','respiration','sleep','floor','intensity','hydration','weight','bmi','fat','muscle','bone','water','vo2','training','recovery','fitness','age','load','pace','speed','cadence','power','elevation','temperature','energy','efficiency','aerobic','anaerobic','lactate','threshold','descriptor','unit','measurement','restless','awake','deep','light','rem','wake','bed','event','split','type','sport','activity','moderate','vigorous','sedentary','active','charged','drained','ascended','seconds','minutes','hours','days','hourly','values','scores','levels','calories','meters','steps','averages','events','measurements','descriptors','statuses',
]);
const SAFE_DETAIL_TEXT_TOKENS = new Set(['calendar','date','timestamp','time','timezone','status','qualifier','type','unit','descriptor','measurement']);
const PRIVATE_DETAIL_PARTS = ['user','profile','uuid','device','owner','email','password','token','imageurl','privacy','latitude','longitude','location','address','city','country','postal','coordinate','polyline','mapurl','firstname','lastname','fullname','displayname','serial','account','phone','contact','pointlat','pointlon'];
const PRIVATE_KEY_SUFFIXES = ['primarykey','recordkey','activitykey','personkey','subjectkey','accountkey','ownerkey','userkey','profilekey','devicekey'];

const normalizeDetailKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');
const detailKeyTokens = (key: string): Set<string> => new Set(
  key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part.toLowerCase()),
);
const isSafeDetailKey = (key: string): boolean => {
  const normalized = normalizeDetailKey(key);
  if (normalized === 'key') return false;
  if (normalized !== 'timezoneid' && (normalized.endsWith('id') || normalized.endsWith('pk'))) return false;
  if (PRIVATE_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return false;
  if (PRIVATE_DETAIL_PARTS.some((part) => normalized.includes(part))) return false;
  return [...SAFE_DETAIL_TOKENS].some((part) => normalized.includes(part));
};
const isSanitizedDetailValue = (value: unknown, key: string): boolean => {
  if (value === null) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') {
    return value.trim().length > 0 && value.length <= 128 && [...detailKeyTokens(key)].some((token) => SAFE_DETAIL_TEXT_TOKENS.has(token));
  }
  if (Array.isArray(value)) return value.every((item) => isRecord(item) ? isSanitizedDetailRecord(item) : isSanitizedDetailValue(item, key));
  return isRecord(value) && isSanitizedDetailRecord(value);
};
const isSanitizedDetailRecord = (value: Record<string, unknown>): boolean => Object.entries(value).every(
  ([key, item]) => isSafeDetailKey(key) && isSanitizedDetailValue(item, key),
);
const isValidGarminDetails = (value: unknown): boolean => isRecord(value)
  && Object.keys(value).length > 0
  && Object.entries(value).every(([group, item]) => DETAIL_GROUPS.has(group)
    && (Array.isArray(item) ? item.every((entry) => isRecord(entry) && isSanitizedDetailRecord(entry)) : isRecord(item) && isSanitizedDetailRecord(item)))
  && hasMeaningfulData(value);

const hasMeaningfulData = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasMeaningfulData);
  if (isRecord(value)) return Object.values(value).some(hasMeaningfulData);
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
};

const isValidDayHealth = (value: unknown): value is DayHealth => {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  if (entries.filter(([key]) => key !== 'source').length === 0) return false;
  for (const [key, item] of entries) {
    if (!ALLOWED_DAY_FIELDS.has(key)) return false;
    if (NUMERIC_DAY_FIELDS.has(key) && (typeof item !== 'number' || !Number.isFinite(item))) return false;
    if (STRING_DAY_FIELDS.has(key) && (
      typeof item !== 'string' || item.trim().length === 0 || item.length > 128
    )) return false;
    if (key === 'source' && item !== 'garmin_connect') return false;
    if (key === 'garminDetails' && !isValidGarminDetails(item)) return false;
  }
  return entries.some(([key, item]) => NUMERIC_DAY_FIELDS.has(key) || (key === 'garminDetails' && hasMeaningfulData(item)));
};

const isValidDateRange = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (!isRecord(value) || Object.keys(value).length === 0 || !hasExactKeys(value, new Set(['start', 'end', 'timezone']))) return false;
  const { start, end, timezone } = value;
  if (typeof start !== 'string' || !isValidDayKey(start)) return false;
  if (typeof end !== 'string' || !isValidDayKey(end)) return false;
  if (timezone !== undefined && typeof timezone !== 'string') return false;
  return !(typeof start === 'string' && typeof end === 'string' && start > end);
};

const FITNESS_FIELDS = new Set(['trainingStatus', 'fitnessAge', 'maxMetrics']);
const BODY_FIELDS = new Set(['startDate', 'endDate', 'totalAverage', 'records']);
const PROVENANCE_FIELDS = new Set(['importer', 'endpoints', 'normalizedUnits', 'aggregateListsAndEventsIncluded', 'rawHighFrequencySampleArraysIncluded', 'excludedHighFrequencyKeys', 'identifiersAndLocationsRemoved']);
const ENDPOINT_NAMES = new Set(['user_summary','sleep_data','hrv_data','hydration_data','spo2_data','respiration_data','intensity_minutes_data','heart_rates','stress_data','body_battery','activities_by_date','body_composition','training_status','fitness_age','max_metrics']);
const RAW_SAMPLE_NAMES = new Set(['bodybatteryvaluesarray','heartratevalues','hrvdata','hrvreadings','respirationvaluesarray','sleepbodybattery','sleepheartrate','sleeplevels','sleepmovement','sleeprestlessmoments','sleepstress','stressvaluesarray','wellnessepochrespirationdatadtolist','wellnessepochspo2datadtolist']);
const isValidProvenance = (value: unknown): boolean => {
  if (!isRecord(value) || Object.keys(value).length === 0 || !hasExactKeys(value, PROVENANCE_FIELDS)) return false;
  if (value.importer !== undefined && value.importer !== 'garmin_sync.py') return false;
  if (value.endpoints !== undefined && (!Array.isArray(value.endpoints) || !value.endpoints.every((item) => typeof item === 'string' && ENDPOINT_NAMES.has(item)))) return false;
  if (value.normalizedUnits !== undefined && (!isRecord(value.normalizedUnits) || !Object.entries(value.normalizedUnits).every(([key, unit]) => NUMERIC_DAY_FIELDS.has(key) && typeof unit === 'string' && unit.length > 0 && unit.length <= 32))) return false;
  for (const key of ['aggregateListsAndEventsIncluded','rawHighFrequencySampleArraysIncluded','identifiersAndLocationsRemoved']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return false;
  }
  if (value.excludedHighFrequencyKeys !== undefined && (!Array.isArray(value.excludedHighFrequencyKeys) || !value.excludedHighFrequencyKeys.every((item) => typeof item === 'string' && RAW_SAMPLE_NAMES.has(item)))) return false;
  return true;
};

const isValidGarminPayload = (value: unknown): value is GarminPayload & { source: 'garmin_connect'; days: Record<string, DayHealth> } => {
  if (!isRecord(value) || !hasExactKeys(value, ALLOWED_PAYLOAD_FIELDS) || value.source !== 'garmin_connect' || !isRecord(value.days) || Object.keys(value.days).length === 0) return false;
  const payload = value as GarminPayload;
  const days = value.days as Record<string, DayHealth>;
  if (payload.syncedAt !== undefined && (
    typeof payload.syncedAt !== 'string'
    || !SYNC_TIMEZONE.test(payload.syncedAt)
    || Number.isNaN(Date.parse(payload.syncedAt))
  )) return false;
  if (!isValidDateRange(payload.dateRange)) return false;
  if (payload.activities !== undefined && !isSanitizedRecordArray(payload.activities)) return false;
  if (payload.bodyComposition !== undefined) {
    if (!isRecord(payload.bodyComposition) || Object.keys(payload.bodyComposition).length === 0 || !hasExactKeys(payload.bodyComposition, BODY_FIELDS)) return false;
    if (payload.bodyComposition.startDate !== undefined && (typeof payload.bodyComposition.startDate !== 'string' || !isValidDayKey(payload.bodyComposition.startDate))) return false;
    if (payload.bodyComposition.endDate !== undefined && (typeof payload.bodyComposition.endDate !== 'string' || !isValidDayKey(payload.bodyComposition.endDate))) return false;
    if (payload.bodyComposition.records !== undefined && !isSanitizedRecordArray(payload.bodyComposition.records)) return false;
    if (payload.bodyComposition.totalAverage !== undefined && (!isRecord(payload.bodyComposition.totalAverage) || !isSanitizedDetailRecord(payload.bodyComposition.totalAverage))) return false;
  }
  if (payload.fitness !== undefined) {
    if (!isRecord(payload.fitness) || Object.keys(payload.fitness).length === 0 || !hasExactKeys(payload.fitness, FITNESS_FIELDS)) return false;
    if (payload.fitness.trainingStatus !== undefined && (!isRecord(payload.fitness.trainingStatus) || Object.keys(payload.fitness.trainingStatus).length === 0 || !isSanitizedDetailRecord(payload.fitness.trainingStatus))) return false;
    if (payload.fitness.fitnessAge !== undefined && (!isRecord(payload.fitness.fitnessAge) || Object.keys(payload.fitness.fitnessAge).length === 0 || !isSanitizedDetailRecord(payload.fitness.fitnessAge))) return false;
    if (payload.fitness.maxMetrics !== undefined && !isSanitizedRecordArray(payload.fitness.maxMetrics)) return false;
  }
  if (payload.provenance !== undefined && !isValidProvenance(payload.provenance)) return false;
  if (!hasOnlyFiniteNumbers(payload)) return false;
  return Object.entries(days).every(([dayKey, day]) => isValidDayKey(dayKey) && isValidDayHealth(day));
};

const mergeRecords = (
  existing: Record<string, unknown>[] = [],
  incoming: Record<string, unknown>[] = [],
  keyFields: string[],
): Record<string, unknown>[] => {
  const records = new Map<string, Record<string, unknown>>();
  const keyFor = (record: Record<string, unknown>): string => {
    const parts = keyFields.map((field) => record[field]).filter((value) => value !== undefined);
    return parts.length ? JSON.stringify(parts) : JSON.stringify(record);
  };
  for (const record of [...existing, ...incoming]) records.set(keyFor(record), record);
  return [...records.values()];
};

/** Validate and absorb one complete Garmin generation. */
export const mergeGarminData = (payload: GarminPayload): number => {
  if (!isValidGarminPayload(payload)) return 0;
  const m = getHealthMetrics();
  const allEntries = getAllDailyEntries();
  let merged = 0;
  for (const [ds, day] of Object.entries(payload.days)) {
    // Each daily Garmin response is a complete generation. Replacing it avoids
    // retaining stale fields that disappeared from the latest source response.
    m.days[ds] = day;
    merged++;
    if (day.steps !== undefined) {
      const entry = allEntries[ds] ?? getDailyEntry(ds);
      if (!entry.fitness) {
        entry.fitness = { pushups: { sets: [], totalReps: 0, setsCompleted: 0 }, steps: { steps: 0, goal: 5000 } };
      }
      if (day.steps > (entry.fitness.steps.steps || 0)) {
        entry.fitness.steps.steps = day.steps;
        allEntries[ds] = entry;
      }
    }
  }
  const newestDay = Object.keys(payload.days).sort().at(-1)!;
  const detailCutoff = new Date(`${newestDay}T00:00:00Z`);
  detailCutoff.setUTCDate(detailCutoff.getUTCDate() - (DETAIL_RETENTION_DAYS - 1));
  const detailCutoffKey = detailCutoff.toISOString().slice(0, 10);
  for (const [dayKey, historicalDay] of Object.entries(m.days)) {
    if (dayKey < detailCutoffKey) delete historicalDay.garminDetails;
  }

  m.source = payload.source;
  if (payload.syncedAt) m.syncedAt = payload.syncedAt;
  if (payload.dateRange) {
    m.dateRange = {
      start: [m.dateRange?.start, payload.dateRange.start].filter(Boolean).sort()[0],
      end: [m.dateRange?.end, payload.dateRange.end].filter(Boolean).sort().at(-1),
      timezone: payload.dateRange.timezone ?? m.dateRange?.timezone,
    };
  }
  if (payload.activities) {
    m.activities = mergeRecords(m.activities, payload.activities, ['startTimeLocal', 'activityName', 'activityType']);
  }
  if (payload.bodyComposition) {
    m.bodyComposition = {
      ...m.bodyComposition,
      ...payload.bodyComposition,
      records: mergeRecords(
        m.bodyComposition?.records,
        payload.bodyComposition.records,
        ['calendarDate', 'timestampGMT', 'weight'],
      ),
    };
  }
  if (payload.fitness) m.fitness = payload.fitness;
  if (payload.provenance) {
    m.provenance = {
      ...payload.provenance,
      detailRetentionDays: DETAIL_RETENTION_DAYS,
      historicalNormalizedDaysRetained: true,
    };
  }

  const previousHealth = localStorage.getItem(HEALTH_KEY);
  const previousDailyEntries = localStorage.getItem(DAILY_ENTRIES_KEY);
  try {
    localStorage.setItem(HEALTH_KEY, JSON.stringify(m));
    localStorage.setItem(DAILY_ENTRIES_KEY, JSON.stringify(allEntries));
  } catch {
    try {
      if (previousHealth === null) localStorage.removeItem(HEALTH_KEY);
      else localStorage.setItem(HEALTH_KEY, previousHealth);
    } catch { /* retain the original error outcome */ }
    try {
      if (previousDailyEntries === null) localStorage.removeItem(DAILY_ENTRIES_KEY);
      else localStorage.setItem(DAILY_ENTRIES_KEY, previousDailyEntries);
    } catch { /* retain any recoverable prior generation */ }
    return 0;
  }
  // Queue the already-committed daily generation for TrainRight sync.
  captureAllDailyEntryChanges(
    previousDailyEntries ? JSON.parse(previousDailyEntries) as Record<string, ReturnType<typeof getDailyEntry>> : {},
    allEntries,
  );
  return merged;
};

/** Fetch garmin_health.json from the app origin (same folder as the app). */
export const fetchGarminFile = async (): Promise<number | null> => {
  try {
    const res = await fetch(`${GARMIN_FILE}?t=${Date.now()}`, { cache: 'no-store' });
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
