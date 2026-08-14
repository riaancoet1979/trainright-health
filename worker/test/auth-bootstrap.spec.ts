import { SELF, env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const bootstrap = (body: unknown) =>
  SELF.fetch('https://api.test/v1/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /v1/auth/bootstrap', () => {
  it('issues a token for the correct code', async () => {
    const res = await bootstrap({ code: 'test-bootstrap-code', label: 'Riaan PC' });
    expect(res.status).toBe(200);
    const body = await res.json<{ token: string; deviceId: string }>();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.deviceId).toHaveLength(36);
  });

  it('rejects a wrong code without creating a device', async () => {
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM device').first<{ n: number }>();
    const res = await bootstrap({ code: 'wrong', label: 'Attacker' });
    expect(res.status).toBe(401);
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM device').first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });

  it('requires a label', async () => {
    const res = await bootstrap({ code: 'test-bootstrap-code' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-JSON body', async () => {
    const res = await SELF.fetch('https://api.test/v1/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json at all',
    });
    expect(res.status).toBe(400);
  });

  it('never stores the raw token', async () => {
    const res = await bootstrap({ code: 'test-bootstrap-code', label: 'Phone' });
    const { token } = await res.json<{ token: string }>();
    const row = await env.DB.prepare('SELECT token_hash FROM device WHERE label = ?')
      .bind('Phone').first<{ token_hash: string }>();
    expect(row?.token_hash).toBeDefined();
    expect(row?.token_hash).not.toBe(token);
    expect(row?.token_hash).toHaveLength(64);
  });

  it('issues a different token every time', async () => {
    const a = await (await bootstrap({ code: 'test-bootstrap-code', label: 'A' })).json<{ token: string }>();
    const b = await (await bootstrap({ code: 'test-bootstrap-code', label: 'B' })).json<{ token: string }>();
    expect(a.token).not.toBe(b.token);
  });

  it('records the requested scope, defaulting to app', async () => {
    const res = await bootstrap({ code: 'test-bootstrap-code', label: 'Hermes', scope: 'hermes' });
    expect((await res.json<{ scope: string }>()).scope).toBe('hermes');

    const plain = await bootstrap({ code: 'test-bootstrap-code', label: 'Browser', scope: 'nonsense' });
    expect((await plain.json<{ scope: string }>()).scope).toBe('app');
  });
});
