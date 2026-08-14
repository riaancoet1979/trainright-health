import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('GET /health', () => {
  it('reports ok', async () => {
    const res = await SELF.fetch('https://api.test/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('404s an unknown route', async () => {
    const res = await SELF.fetch('https://api.test/nope');
    expect(res.status).toBe(404);
  });
});

// CORS is the classic silent killer for a browser client on a different origin
// than the API, so it gets tested rather than assumed.
describe('CORS', () => {
  it('answers a preflight from an allowed origin', async () => {
    const res = await SELF.fetch('https://api.test/v1/sync/push', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('echoes the allowed origin on a normal response', async () => {
    const res = await SELF.fetch('https://api.test/health', {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('does not grant access to an unlisted origin', async () => {
    const res = await SELF.fetch('https://api.test/health', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
