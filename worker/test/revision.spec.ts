import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { nextRevision, currentRevision } from '../src/revision';

describe('revision counter', () => {
  it('starts at zero', async () => {
    expect(await currentRevision(env.DB)).toBe(0);
  });

  it('increases by one on each call', async () => {
    const a = await nextRevision(env.DB);
    const b = await nextRevision(env.DB);
    const c = await nextRevision(env.DB);
    expect(b).toBe(a + 1);
    expect(c).toBe(b + 1);
  });

  it('reports the latest issued value', async () => {
    const issued = await nextRevision(env.DB);
    expect(await currentRevision(env.DB)).toBe(issued);
  });

  it('never issues the same value twice under concurrency', async () => {
    const issued = await Promise.all(
      Array.from({ length: 25 }, () => nextRevision(env.DB)),
    );
    expect(new Set(issued).size).toBe(issued.length);
  });
});
