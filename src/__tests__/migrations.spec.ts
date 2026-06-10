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
    expect(meta.versions.health_training_v1).toBe(1);
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
