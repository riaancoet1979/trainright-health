import type { Env } from './env';
import { json, error } from './http';

const TOKEN_BYTES = 32;

const base64url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const sha256 = (value: string): Promise<ArrayBuffer> =>
  crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

/** SHA-256 as lowercase hex. Tokens are high-entropy, so no salt is needed. */
export const hashToken = async (token: string): Promise<string> => {
  const digest = await sha256(token);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Constant-time secret comparison.
 *
 * Both sides are hashed to a fixed 32 bytes first, which guarantees the equal
 * lengths `timingSafeEqual` requires (it throws otherwise) and stops the
 * comparison leaking the length of the expected secret. A hand-rolled
 * XOR-over-characters loop is not a substitute: JS engines are free to optimise
 * it into something that short-circuits.
 */
const secretsMatch = async (provided: string, expected: string): Promise<boolean> => {
  const [a, b] = await Promise.all([sha256(provided), sha256(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
};

export const handleBootstrap = async (request: Request, env: Env): Promise<Response> => {
  let body: { code?: unknown; label?: unknown; scope?: unknown };
  try {
    body = await request.json();
  } catch {
    return error(request, env, 400, 'bad_json', 'Request body must be JSON.');
  }

  // Fail closed. An unset secret would otherwise be encoded as the literal
  // string "undefined", handing a token to anyone who guesses it.
  if (typeof env.BOOTSTRAP_CODE !== 'string' || env.BOOTSTRAP_CODE.length < 16) {
    return error(
      request, env, 503, 'not_configured',
      'BOOTSTRAP_CODE is missing or too short (min 16 chars). '
      + 'Set it with: npx wrangler secret put BOOTSTRAP_CODE',
    );
  }

  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return error(request, env, 400, 'missing_label', 'A device label is required.');

  const scope = body.scope === 'hermes' || body.scope === 'ingest' ? body.scope : 'app';

  if (typeof body.code !== 'string' || !(await secretsMatch(body.code, env.BOOTSTRAP_CODE))) {
    return error(request, env, 401, 'bad_code', 'Bootstrap code rejected.');
  }

  const token = base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  const deviceId = crypto.randomUUID();

  await env.DB.prepare(
    'INSERT INTO device (id, label, token_hash, scope, created_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(deviceId, label, await hashToken(token), scope, new Date().toISOString()).run();

  return json(request, env, { token, deviceId, label, scope });
};

export interface Device {
  id: string;
  label: string;
  scope: string;
}

/**
 * Resolve the Bearer token on a request to a device row, or null. Updates
 * last_seen_at as a side effect so the Settings device list is useful.
 */
export const authenticate = async (request: Request, env: Env): Promise<Device | null> => {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;

  const row = await env.DB.prepare(
    'SELECT id, label, scope FROM device WHERE token_hash = ? AND revoked_at IS NULL',
  ).bind(await hashToken(token)).first<Device>();
  if (!row) return null;

  await env.DB.prepare('UPDATE device SET last_seen_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), row.id).run();

  return row;
};

export const handleListDevices = async (request: Request, env: Env): Promise<Response> => {
  const { results } = await env.DB.prepare(
    `SELECT id, label, scope, created_at, last_seen_at, revoked_at
     FROM device ORDER BY created_at`,
  ).all<{
    id: string; label: string; scope: string;
    created_at: string; last_seen_at: string | null; revoked_at: string | null;
  }>();

  return json(request, env, {
    devices: results.map((row) => ({
      id: row.id,
      label: row.label,
      scope: row.scope,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at,
    })),
  });
};

export const handleRevokeDevice = async (
  request: Request,
  env: Env,
  deviceId: string,
): Promise<Response> => {
  const result = await env.DB.prepare(
    'UPDATE device SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
  ).bind(new Date().toISOString(), deviceId).run();

  if (!result.meta.changes) {
    return error(request, env, 404, 'no_such_device', 'No active device with that id.');
  }
  return json(request, env, { revoked: deviceId });
};
