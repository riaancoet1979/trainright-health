import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { SYNC_DOMAINS, ENVELOPE_COLUMNS } from '../src/domains';
import { toSnake } from '../src/case';

describe('SYNC_DOMAINS', () => {
  it('registers a table that exists for every domain', async () => {
    for (const domain of Object.values(SYNC_DOMAINS)) {
      const row = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
      ).bind(domain.table).first<{ name: string }>();
      expect(row?.name, `missing table for domain ${domain.name}`).toBe(domain.table);
    }
  });

  it('only declares fields that exist as columns', async () => {
    for (const domain of Object.values(SYNC_DOMAINS)) {
      const { results } = await env.DB.prepare(`PRAGMA table_info(${domain.table})`).all<{ name: string }>();
      const columns = new Set(results.map((r) => r.name));
      for (const field of domain.fields) {
        expect(columns.has(toSnake(field)), `${domain.name}.${field} -> ${toSnake(field)}`).toBe(true);
      }
    }
  });

  it('covers every non-envelope column of every registered table', async () => {
    for (const domain of Object.values(SYNC_DOMAINS)) {
      const { results } = await env.DB.prepare(`PRAGMA table_info(${domain.table})`).all<{ name: string }>();
      const envelope: readonly string[] = ENVELOPE_COLUMNS;
      const payloadColumns = results
        .map((r) => r.name)
        .filter((name) => !envelope.includes(name));
      const declared = new Set(domain.fields.map(toSnake));
      for (const column of payloadColumns) {
        expect(declared.has(column), `${domain.table}.${column} is not in the registry`).toBe(true);
      }
    }
  });

  it('keys each domain by its own name', () => {
    for (const [key, domain] of Object.entries(SYNC_DOMAINS)) {
      expect(key).toBe(domain.name);
    }
  });

  it('declares json and boolean fields that are themselves registered fields', () => {
    for (const domain of Object.values(SYNC_DOMAINS)) {
      for (const field of [...domain.jsonFields, ...domain.booleanFields]) {
        expect(domain.fields.includes(field), `${domain.name}.${field}`).toBe(true);
      }
    }
  });
});
