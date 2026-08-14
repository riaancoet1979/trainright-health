import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { getBodyStats } from '../utils/storage';
import { listPending, clearOutbox } from '../sync/outbox';

const flush = () => new Promise((resolve) => setTimeout(resolve, 60));

describe('getBodyStats read path', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearOutbox();
  });

  it('does not queue mutations when only normalising legacy fields', async () => {
    localStorage.setItem('trainright_body_stats', JSON.stringify([
      { id: 'b1', date: '2026-05-26', weight: 83.6, bodyfat: 19.7 },
    ]));
    getBodyStats();
    await flush();
    expect(await listPending()).toEqual([]);
  });

  it('still normalises and persists the legacy shape', async () => {
    localStorage.setItem('trainright_body_stats', JSON.stringify([
      { id: 'b1', date: '2026-05-26', weight: 83.6, bodyfat: 19.7 },
    ]));
    const stats = getBodyStats();
    expect(stats[0].id).toBe('b1');
    expect(getBodyStats()[0].id).toBe('b1');
  });

  it('queues nothing on repeated reads of already-clean data', async () => {
    localStorage.setItem('trainright_body_stats', JSON.stringify([
      { id: 'b1', date: '2026-05-26', weight: 83.6, bodyFat: 19.7 },
    ]));
    getBodyStats();
    getBodyStats();
    getBodyStats();
    await flush();
    expect(await listPending()).toEqual([]);
  });
});
