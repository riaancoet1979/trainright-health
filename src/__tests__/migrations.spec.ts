import { describe, it, expect, beforeEach } from 'vitest';
import {
  runMigrations, readSchemaMeta, writeSchemaMeta, markExported,
  daysSinceLastExport, shouldNudgeBackup, SCHEMA_META_KEY,
  LATEST_SCHEMA_VERSIONS, BACKUP_NUDGE_DAYS,
} from '../utils/migrations';

beforeEach(() => {
  localStorage.clear();
});

describe('runMigrations', () => {
  it('returns one entry per tracked store on first boot and stamps versions', () => {
    const ran = runMigrations();
    const stores = Object.keys(LATEST_SCHEMA_VERSIONS);
    expect(ran.map((r) => r.store).sort()).toEqual([...stores].sort());
    const meta = readSchemaMeta();
    for (const [s, v] of Object.entries(LATEST_SCHEMA_VERSIONS)) {
      expect(meta.versions[s]).toBe(v);
    }
  });

  it('is idempotent — second run reports no migrations', () => {
    runMigrations();
    const ran = runMigrations();
    expect(ran).toEqual([]);
  });

  it('preserves existing un-versioned payloads without dropping fields', () => {
    const legacy = {
      targets: { dailyCalories: 1850 },
      theme: 'dark',
      unknownFutureField: { kept: true },
    };
    localStorage.setItem('nutrition_tracker_user_settings', JSON.stringify(legacy));
    runMigrations();
    const after = JSON.parse(localStorage.getItem('nutrition_tracker_user_settings')!);
    expect(after).toEqual(legacy);
  });

  it('does not create empty payloads for absent stores', () => {
    runMigrations();
    expect(localStorage.getItem('nutrition_tracker_user_settings')).toBeNull();
    expect(localStorage.getItem('trainright_body_stats')).toBeNull();
  });

  it('records the latest version even when starting fresh', () => {
    runMigrations();
    const raw = localStorage.getItem(SCHEMA_META_KEY);
    expect(raw).not.toBeNull();
    const meta = JSON.parse(raw!);
    expect(meta.versions.nutrition_tracker_daily_entries).toBe(1);
    expect(meta.versions.health_training_v1).toBe(2);
  });

  it('does not roll back an already-recorded higher version', () => {
    // Simulate a future code version having stamped v2 for one store.
    writeSchemaMeta({ versions: { nutrition_tracker_user_settings: 2 } });
    runMigrations();
    const meta = readSchemaMeta();
    expect(meta.versions.nutrition_tracker_user_settings).toBe(2);
  });
});

describe('last-export tracking', () => {
  it('daysSinceLastExport returns null when never exported', () => {
    expect(daysSinceLastExport()).toBeNull();
  });

  it('shouldNudgeBackup is true when never exported', () => {
    expect(shouldNudgeBackup()).toBe(true);
  });

  it('markExported stamps an ISO timestamp and unblocks the nudge', () => {
    const now = new Date('2026-06-10T08:00:00Z');
    markExported(now.toISOString());
    const meta = readSchemaMeta();
    expect(meta.lastExportAt).toBe(now.toISOString());
    expect(shouldNudgeBackup(now)).toBe(false);
  });

  it(`shows the nudge again after ${BACKUP_NUDGE_DAYS} days`, () => {
    const exported = new Date('2026-05-01T08:00:00Z');
    markExported(exported.toISOString());
    const justBefore = new Date('2026-05-14T08:00:00Z'); // 13 days later
    expect(shouldNudgeBackup(justBefore)).toBe(false);
    const onThreshold = new Date('2026-05-15T08:00:00Z'); // 14 days later
    expect(shouldNudgeBackup(onThreshold)).toBe(true);
  });

  it('daysSinceLastExport ignores a malformed timestamp', () => {
    writeSchemaMeta({ versions: {}, lastExportAt: 'not-a-date' });
    expect(daysSinceLastExport()).toBeNull();
  });

  it('markExported preserves existing version stamps', () => {
    runMigrations();
    const before = readSchemaMeta().versions;
    markExported('2026-06-10T08:00:00Z');
    const after = readSchemaMeta();
    expect(after.versions).toEqual(before);
    expect(after.lastExportAt).toBe('2026-06-10T08:00:00Z');
  });
});

// ─────────────────────────────────────────────────────────────────
// health_training_v1 v1 → v2
// Calisthenics Foundation 16 (weekday keys) → Garage Block 12 (session keys)
// ─────────────────────────────────────────────────────────────────

describe('health_training_v1 v1→v2 day-key migration', () => {
  const TRAINING = 'health_training_v1';

  const seedV1 = (logs: Record<string, unknown>) => {
    localStorage.setItem(TRAINING, JSON.stringify({
      programStartDate: '2026-06-08',
      logs,
      bodyMetrics: [{ date: '2026-06-09', weight: 81.2 }],
    }));
    // Pretend the store is at v1 so the runner performs the v2 step.
    localStorage.setItem('health_schema_meta', JSON.stringify({
      versions: { health_training_v1: 1 },
    }));
  };

  const readTraining = () =>
    JSON.parse(localStorage.getItem(TRAINING)!) as {
      logs: Record<string, { dayKey?: string; dayKeyOverride?: string; notes?: string;
        exercises?: Record<string, unknown> }>;
      bodyMetrics: unknown[];
      programStartDate: string;
    };

  it('rewrites every legacy day key onto its new session', () => {
    seedV1({
      '2026-06-08': { dayKey: 'mon', weekNum: 1, phase: 1, completed: true, notes: '', exercises: {} },
      '2026-06-09': { dayKey: 'tue', weekNum: 1, phase: 1, completed: true, notes: '', exercises: {} },
      '2026-06-11': { dayKey: 'thu', weekNum: 1, phase: 1, completed: true, notes: '', exercises: {} },
      '2026-06-13': { dayKey: 'sat', weekNum: 1, phase: 1, completed: true, notes: '', exercises: {} },
    });
    runMigrations();
    const d = readTraining();
    expect(d.logs['2026-06-08'].dayKey).toBe('legs');
    expect(d.logs['2026-06-09'].dayKey).toBe('pull');
    expect(d.logs['2026-06-11'].dayKey).toBe('push');
    expect(d.logs['2026-06-13'].dayKey).toBe('lower');
  });

  it('rewrites dayKeyOverride too', () => {
    seedV1({
      '2026-06-14': {
        dayKey: 'mon', dayKeyOverride: 'mon', weekNum: 1, phase: 1,
        completed: true, notes: '', exercises: {},
      },
    });
    runMigrations();
    const d = readTraining();
    expect(d.logs['2026-06-14'].dayKey).toBe('legs');
    expect(d.logs['2026-06-14'].dayKeyOverride).toBe('legs');
  });

  it('preserves every other field on the log — sets, notes, completion', () => {
    seedV1({
      '2026-06-08': {
        dayKey: 'mon', weekNum: 1, phase: 1, completed: true,
        notes: 'felt strong', readiness: 'green', shoulderPain: 1,
        exercises: { goblet_squat: { sets: [{ weight: '16', reps: '10', done: true }], note: 'deep' } },
      },
    });
    runMigrations();
    const log = readTraining().logs['2026-06-08'] as Record<string, unknown>;
    expect(log.notes).toBe('felt strong');
    expect(log.completed).toBe(true);
    expect(log.readiness).toBe('green');
    expect(log.shoulderPain).toBe(1);
    const ex = (log.exercises as Record<string, { sets: unknown[]; note: string }>).goblet_squat;
    expect(ex.sets).toHaveLength(1);
    expect(ex.note).toBe('deep');
  });

  it('preserves top-level fields outside logs', () => {
    seedV1({ '2026-06-08': { dayKey: 'mon', completed: true, notes: '', exercises: {} } });
    runMigrations();
    const d = readTraining();
    expect(d.programStartDate).toBe('2026-06-08');
    expect(d.bodyMetrics).toHaveLength(1);
  });

  it('leaves already-migrated keys untouched and is idempotent', () => {
    seedV1({
      '2026-06-08': { dayKey: 'push', completed: true, notes: '', exercises: {} },
      '2026-06-09': { dayKey: 'tue', completed: true, notes: '', exercises: {} },
    });
    runMigrations();
    const first = readTraining();
    expect(first.logs['2026-06-08'].dayKey).toBe('push');
    expect(first.logs['2026-06-09'].dayKey).toBe('pull');

    // Re-stamp to v1 and run again — the result must not drift.
    localStorage.setItem('health_schema_meta', JSON.stringify({
      versions: { health_training_v1: 1 },
    }));
    runMigrations();
    expect(readTraining().logs).toEqual(first.logs);
  });

  it('does not create a store when there is no training data', () => {
    localStorage.setItem('health_schema_meta', JSON.stringify({
      versions: { health_training_v1: 1 },
    }));
    runMigrations();
    expect(localStorage.getItem(TRAINING)).toBeNull();
  });
});
