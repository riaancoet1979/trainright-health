// ============================================================
// TrainRight Health — schema migration runner
//
// Stores schema versions and the "last-exported" timestamp in a SINGLE
// out-of-band meta blob (`health_schema_meta`) so existing store reads and
// writes do not need to change. Every known store is currently at v1 — the
// runner stamps that version on first boot of versioned code, so any future
// shape change can plug in a v1→v2 migration without touching callsites.
//
// Hard rules (per build-discipline memory):
//  - Forward-only: never delete unknown fields from existing payloads.
//  - Idempotent: safe to call on every boot.
//  - Non-destructive: when a store has no data, leave it absent.
// ============================================================
import { format } from 'date-fns';

export const SCHEMA_META_KEY = 'health_schema_meta';

/**
 * Stores tracked by the migration runner. The current shape of every store
 * is version 1. To add a v1→v2 migration: bump the value here and add the
 * matching entry to MIGRATIONS below.
 */
export const LATEST_SCHEMA_VERSIONS: Record<string, number> = {
  nutrition_tracker_user_settings: 1,
  nutrition_tracker_custom_foods: 1,
  nutrition_tracker_daily_entries: 1,
  nutrition_tracker_achievements: 1,
  health_training_v1: 2,
  health_metrics_v1: 1,
  trainright_body_stats: 1,
};

export interface SchemaMeta {
  versions: Record<string, number>;
  /** ISO 8601 timestamp of the most recent successful exportAllData() call. */
  lastExportAt?: string;
}

export const readSchemaMeta = (): SchemaMeta => {
  try {
    const raw = localStorage.getItem(SCHEMA_META_KEY);
    if (!raw) return { versions: {} };
    const parsed = JSON.parse(raw) as Partial<SchemaMeta>;
    return {
      versions: parsed.versions ?? {},
      lastExportAt: parsed.lastExportAt,
    };
  } catch {
    return { versions: {} };
  }
};

export const writeSchemaMeta = (meta: SchemaMeta): void => {
  localStorage.setItem(SCHEMA_META_KEY, JSON.stringify(meta));
};

/**
 * Migration step function. Reads the raw value from localStorage and returns
 * the migrated value (any JSON-serialisable shape). Returning `undefined`
 * leaves the store as-is (used for no-op stamp migrations).
 */
type StepFn = (raw: unknown) => unknown;


/**
 * health_training_v1 v1 → v2 — Calisthenics Foundation 16 (4 days, keyed by
 * weekday) → Garage Block 12 (5 sessions, keyed by movement).
 *
 * Rewrites every log's `dayKey` and `dayKeyOverride` onto the new session
 * keys so historical sessions keep resolving against the programme and keep
 * counting in the weekly review. Without this, old logs resolve to days that
 * no longer exist: the set data survives on disk but stops rendering, which
 * reads to the user as data loss.
 *
 * Mapping follows the closest movement match:
 *   mon (Lower + Core)   → legs
 *   tue (Pull + Rehab)   → pull
 *   thu (Push + Core)    → push
 *   sat (Hinge + Skills) → lower
 *
 * Forward-only and idempotent: keys already migrated are left alone, and
 * every other field on the log is preserved untouched.
 */
const LEGACY_TO_SESSION: Record<string, string> = {
  mon: 'legs',
  tue: 'pull',
  thu: 'push',
  sat: 'lower',
};

export const migrateTrainingV1toV2 = (raw: unknown): unknown => {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as { logs?: Record<string, Record<string, unknown>> };
  if (!data.logs || typeof data.logs !== 'object') return undefined;

  let changed = false;
  const logs: Record<string, Record<string, unknown>> = {};
  for (const [date, log] of Object.entries(data.logs)) {
    if (!log || typeof log !== 'object') { logs[date] = log; continue; }
    const next = { ...log };
    const dk = next.dayKey;
    if (typeof dk === 'string' && LEGACY_TO_SESSION[dk]) {
      next.dayKey = LEGACY_TO_SESSION[dk];
      changed = true;
    }
    const dko = next.dayKeyOverride;
    if (typeof dko === 'string' && LEGACY_TO_SESSION[dko]) {
      next.dayKeyOverride = LEGACY_TO_SESSION[dko];
      changed = true;
    }
    logs[date] = next;
  }
  if (!changed) return undefined; // nothing to rewrite — leave the store as-is
  return { ...data, logs };
};

/**
 * Per-store, per-target-version migrations. Each entry takes the store from
 * (version - 1) to (version). For the v0 → v1 introduction step, every store
 * is a no-op stamp — existing data IS v1, we just start tracking it.
 */
const MIGRATIONS: Record<string, Record<number, StepFn>> = {
  nutrition_tracker_user_settings: { 1: () => undefined },
  nutrition_tracker_custom_foods: { 1: () => undefined },
  nutrition_tracker_daily_entries: { 1: () => undefined },
  nutrition_tracker_achievements: { 1: () => undefined },
  health_training_v1: { 1: () => undefined, 2: migrateTrainingV1toV2 },
  health_metrics_v1: { 1: () => undefined },
  trainright_body_stats: { 1: () => undefined },
};

/**
 * Walk every tracked store from its recorded version up to the latest and
 * persist the new version stamps. Returns the list of (store, fromVersion,
 * toVersion) tuples migrated, useful for tests / debug logging.
 */
export const runMigrations = (): Array<{
  store: string;
  fromVersion: number;
  toVersion: number;
}> => {
  const meta = readSchemaMeta();
  const ran: Array<{ store: string; fromVersion: number; toVersion: number }> = [];

  for (const [storeKey, latest] of Object.entries(LATEST_SCHEMA_VERSIONS)) {
    const current = meta.versions[storeKey] ?? 0;
    if (current >= latest) continue;

    const steps = MIGRATIONS[storeKey] ?? {};
    let from = current;
    while (from < latest) {
      const targetVersion = from + 1;
      const step = steps[targetVersion];
      if (step) {
        let raw: unknown = null;
        const stored = localStorage.getItem(storeKey);
        if (stored) {
          try { raw = JSON.parse(stored); } catch { raw = null; }
        }
        const next = step(raw);
        if (next !== undefined && stored !== null) {
          // Only write back when the migration actually transformed something
          // AND the store had data to begin with. Treat undefined as "no-op
          // stamp" so we never create empty payloads.
          localStorage.setItem(storeKey, JSON.stringify(next));
        }
      }
      from = targetVersion;
    }
    meta.versions[storeKey] = latest;
    ran.push({ store: storeKey, fromVersion: current, toVersion: latest });
  }

  writeSchemaMeta(meta);
  return ran;
};

// ── Last-export tracker ─────────────────────────────────────────────────────

/** Stamp the meta blob with `now`. Called from exportAllData on success. */
export const markExported = (nowIso: string = new Date().toISOString()): void => {
  const meta = readSchemaMeta();
  meta.lastExportAt = nowIso;
  writeSchemaMeta(meta);
};

/**
 * Whole days since the last export, or null when never exported. Uses
 * date-fns' yyyy-MM-dd formatting so a daylight-savings change inside the
 * window doesn't add a phantom day.
 */
export const daysSinceLastExport = (now: Date = new Date()): number | null => {
  const meta = readSchemaMeta();
  if (!meta.lastExportAt) return null;
  try {
    const last = new Date(meta.lastExportAt);
    if (Number.isNaN(last.getTime())) return null;
    const lastDay = new Date(format(last, 'yyyy-MM-dd') + 'T00:00:00');
    const nowDay = new Date(format(now, 'yyyy-MM-dd') + 'T00:00:00');
    const diff = Math.floor((nowDay.getTime() - lastDay.getTime()) / 86400000);
    return Math.max(0, diff);
  } catch {
    return null;
  }
};

/** Threshold used by the Settings nudge banner. */
export const BACKUP_NUDGE_DAYS = 14;

/**
 * True when the user should be nudged to back up. Captures the "never
 * exported" case AND the "exported a while ago" case.
 */
export const shouldNudgeBackup = (now: Date = new Date()): boolean => {
  const days = daysSinceLastExport(now);
  if (days === null) return true;
  return days >= BACKUP_NUDGE_DAYS;
};
