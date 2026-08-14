import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const bootstrap = async (label: string) => {
  const res = await SELF.fetch('https://api.test/v1/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'test-bootstrap-code', label }),
  });
  return res.json<{ token: string; deviceId: string }>();
};

describe('device management', () => {
  it('lists devices without leaking token hashes', async () => {
    const { token } = await bootstrap('Lister');
    const res = await SELF.fetch('https://api.test/v1/devices', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ devices: Record<string, unknown>[] }>();
    expect(body.devices.length).toBeGreaterThan(0);
    expect(Object.keys(body.devices[0])).toEqual(
      expect.arrayContaining(['id', 'label', 'scope', 'createdAt', 'lastSeenAt']),
    );
    expect(JSON.stringify(body)).not.toContain('token_hash');
    expect(JSON.stringify(body)).not.toContain(token);
  });

  it('requires authentication', async () => {
    const res = await SELF.fetch('https://api.test/v1/devices');
    expect(res.status).toBe(401);
  });

  it('still 404s an unknown path rather than 401', async () => {
    const res = await SELF.fetch('https://api.test/v1/nonsense');
    expect(res.status).toBe(404);
  });

  it('revokes a device so its next request fails', async () => {
    const keeper = await bootstrap('Keeper');
    const victim = await bootstrap('Victim');

    const revoke = await SELF.fetch(`https://api.test/v1/devices/${victim.deviceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${keeper.token}` },
    });
    expect(revoke.status).toBe(200);

    const after = await SELF.fetch('https://api.test/v1/devices', {
      headers: { Authorization: `Bearer ${victim.token}` },
    });
    expect(after.status).toBe(401);
  });

  it('404s revoking an id that is not an active device', async () => {
    const { token } = await bootstrap('Revoker');
    const res = await SELF.fetch(`https://api.test/v1/devices/${crypto.randomUUID()}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });
});
