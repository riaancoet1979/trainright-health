import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shredStore, STORE_KEYS } from '../sync/shred';
import { applyChanges } from '../sync/apply';
import { clearOutbox } from '../sync/outbox';
import type { Change, SyncRecord } from '../sync/types';

const backup = JSON.parse(
  readFileSync(join(process.cwd(), 'trainright-health-backup-2026-06-28 (1).json'), 'utf-8'),
) as Record<string, unknown>;

const sortRecords = (records: SyncRecord[]): SyncRecord[] =>
  [...records].sort((a, b) => `${a.domain}|${a.id}`.localeCompare(`${b.domain}|${b.id}`));

const asChanges = (records: SyncRecord[]): Change[] => records.map((record) => ({
  domain: record.domain,
  id: record.id,
  updatedAt: '2026-08-14T12:00:00.000Z',
  deleted: false,
  fields: record.fields,
}));

const reshredAll = (): SyncRecord[] => STORE_KEYS.flatMap((key) => {
  const raw = localStorage.getItem(key);
  return shredStore(key, raw === null ? undefined : JSON.parse(raw));
});

describe('shred -> apply -> shred round trip on real data', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
  });

  it('reproduces every record exactly', async () => {
    const original = STORE_KEYS.flatMap((key) => shredStore(key, backup[key]));
    expect(original.length).toBeGreaterThan(50);

    await applyChanges(asChanges(original));

    expect(sortRecords(reshredAll())).toEqual(sortRecords(original));
  });

  it('leaves every day readable with a matching date key', async () => {
    const original = STORE_KEYS.flatMap((key) => shredStore(key, backup[key]));
    await applyChanges(asChanges(original));

    const entries = JSON.parse(localStorage.getItem('nutrition_tracker_daily_entries')!);
    const days = Object.keys(entries);
    expect(days.length).toBeGreaterThan(0);
    for (const day of days) {
      expect(Array.isArray(entries[day].foodEntries)).toBe(true);
      expect(entries[day].date).toBe(day);
    }
  });

  it('rebuilds training logs with their exercises intact', async () => {
    const original = STORE_KEYS.flatMap((key) => shredStore(key, backup[key]));
    await applyChanges(asChanges(original));

    const training = JSON.parse(localStorage.getItem('health_training_v1')!);
    const dates = Object.keys(training.logs);
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) {
      expect(typeof training.logs[date].exercises).toBe('object');
    }
  });

  it('is stable across a second round trip', async () => {
    const original = STORE_KEYS.flatMap((key) => shredStore(key, backup[key]));
    await applyChanges(asChanges(original));
    const first = reshredAll();

    await applyChanges(asChanges(first));
    const second = reshredAll();

    expect(sortRecords(second)).toEqual(sortRecords(first));
  });
});
