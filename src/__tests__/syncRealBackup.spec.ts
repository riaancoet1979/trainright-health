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

  it('preserves the InBody fingerprints verbatim, without parsing them', () => {
    const stats = shredStore('trainright_body_stats', backup.trainright_body_stats);
    const fingerprints = stats
      .map((s) => s.fields.sourceFingerprint)
      .filter((f): f is string => typeof f === 'string');
    expect(fingerprints.length).toBeGreaterThan(0);
    for (const fingerprint of fingerprints) {
      expect(fingerprint).toBe(fingerprint.trim());
    }
  });
});
