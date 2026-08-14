import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { authenticate, hashToken } from '../src/auth';

const makeDevice = async (label: string, opts: { revoked?: boolean } = {}) => {
  const token = 'token-for-' + label;
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO device (id, label, token_hash, scope, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, label, await hashToken(token), 'app', new Date().toISOString(),
         opts.revoked ? new Date().toISOString() : null).run();
  return { id, token };
};

const withAuth = (token?: string) =>
  new Request('https://api.test/v1/sync/pull', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

describe('authenticate', () => {
  it('accepts a valid token and returns the device', async () => {
    const { id, token } = await makeDevice('Valid');
    const device = await authenticate(withAuth(token), env);
    expect(device?.id).toBe(id);
    expect(device?.scope).toBe('app');
  });

  it('rejects a missing header', async () => {
    expect(await authenticate(withAuth(), env)).toBeNull();
  });

  it('rejects an unknown token', async () => {
    expect(await authenticate(withAuth('not-a-real-token'), env)).toBeNull();
  });

  it('rejects a malformed authorization scheme', async () => {
    const { token } = await makeDevice('Basic');
    const request = new Request('https://api.test/v1/sync/pull', {
      headers: { Authorization: `Basic ${token}` },
    });
    expect(await authenticate(request, env)).toBeNull();
  });

  it('rejects a revoked device', async () => {
    const { token } = await makeDevice('Revoked', { revoked: true });
    expect(await authenticate(withAuth(token), env)).toBeNull();
  });

  it('records last_seen_at on success', async () => {
    const { id, token } = await makeDevice('Seen');
    await authenticate(withAuth(token), env);
    const row = await env.DB.prepare('SELECT last_seen_at FROM device WHERE id = ?')
      .bind(id).first<{ last_seen_at: string | null }>();
    expect(row?.last_seen_at).toBeTruthy();
  });
});
