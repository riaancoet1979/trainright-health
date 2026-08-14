import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const EXPECTED_TABLES = [
  'achievement', 'body_metric', 'body_stat', 'custom_food', 'daily_steps',
  'device', 'exercise', 'exercise_log', 'food_entry', 'legacy_blob',
  'meta', 'pushup_set', 'session_log', 'set_log', 'user_settings',
];

const SYNCED_TABLES = EXPECTED_TABLES.filter((t) => t !== 'meta' && t !== 'device');

describe('schema', () => {
  it('creates every expected table', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(EXPECTED_TABLES);
  });

  it('gives every synced table the full envelope', async () => {
    for (const table of SYNCED_TABLES) {
      const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
      const columns = results.map((r) => r.name);
      expect(columns, `${table} envelope`).toEqual(
        expect.arrayContaining(['id', 'revision', 'updated_at', 'deleted_at']),
      );
    }
  });

  it('seeds the revision counter at zero', async () => {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key='revision'").first<{ value: number }>();
    expect(row?.value).toBe(0);
  });
});
