import type { Env } from './env';
import { json, error } from './http';
import { SYNC_DOMAINS, type DomainSpec } from './domains';
import { toSnake } from './case';
import { nextRevision, currentRevision } from './revision';

interface Mutation {
  domain: string;
  id: string;
  updatedAt: string;
  deleted?: boolean;
  fields?: Record<string, unknown>;
}

type PushResult =
  | { id: string; status: 'applied' }
  | { id: string; status: 'stale' }
  | { id: string; status: 'rejected'; reason: string };

/** Convert a camelCase field value into what D1 should store. */
const toColumnValue = (spec: DomainSpec, field: string, value: unknown): unknown => {
  if (value === undefined || value === null) return null;
  if (spec.jsonFields.includes(field)) return JSON.stringify(value);
  if (spec.booleanFields.includes(field)) return value ? 1 : 0;
  return value as string | number;
};

const validate = (
  mutation: unknown,
): { ok: true; value: Mutation } | { ok: false; reason: string } => {
  if (typeof mutation !== 'object' || mutation === null) {
    return { ok: false, reason: 'Mutation must be an object.' };
  }
  const m = mutation as Record<string, unknown>;
  if (typeof m.domain !== 'string' || !SYNC_DOMAINS[m.domain]) {
    return { ok: false, reason: `Unknown domain "${String(m.domain)}".` };
  }
  if (typeof m.id !== 'string' || !m.id) {
    return { ok: false, reason: 'Mutation id must be a non-empty string.' };
  }
  if (typeof m.updatedAt !== 'string' || Number.isNaN(Date.parse(m.updatedAt))) {
    return { ok: false, reason: 'updatedAt must be an ISO 8601 timestamp.' };
  }
  if (m.fields !== undefined
      && (typeof m.fields !== 'object' || m.fields === null || Array.isArray(m.fields))) {
    return { ok: false, reason: 'fields must be an object.' };
  }

  const spec = SYNC_DOMAINS[m.domain];
  const fields = (m.fields ?? {}) as Record<string, unknown>;
  for (const field of Object.keys(fields)) {
    if (!spec.fields.includes(field)) {
      return { ok: false, reason: `Unknown field "${field}" for domain "${spec.name}".` };
    }
  }

  return {
    ok: true,
    value: {
      domain: m.domain,
      id: m.id,
      updatedAt: m.updatedAt,
      deleted: m.deleted === true,
      fields,
    },
  };
};

const applyMutation = async (db: D1Database, mutation: Mutation): Promise<PushResult> => {
  const spec = SYNC_DOMAINS[mutation.domain];

  const existing = await db
    .prepare(`SELECT updated_at FROM ${spec.table} WHERE id = ?`)
    .bind(mutation.id)
    .first<{ updated_at: string }>();

  // Last-write-wins. Equal timestamps count as already-applied, which is what
  // makes an exact replay a no-op instead of a pointless write.
  if (existing && Date.parse(existing.updated_at) >= Date.parse(mutation.updatedAt)) {
    return { id: mutation.id, status: 'stale' };
  }

  const revision = await nextRevision(db);
  const deletedAt = mutation.deleted ? mutation.updatedAt : null;

  const payloadFields = Object.keys(mutation.fields ?? {});
  const payloadValues = payloadFields.map(
    (field) => toColumnValue(spec, field, mutation.fields![field]),
  );

  if (existing) {
    // UPDATE, not INSERT ... ON CONFLICT. SQLite checks NOT NULL on the proposed
    // insert row *before* conflict resolution, so an upsert would reject a
    // delete — which legitimately carries no fields — against a table with any
    // NOT NULL payload column. Updating touches only the columns we were given,
    // so a field-less delete tombstones the row without blanking it.
    const assignments = [
      'revision = ?',
      'updated_at = ?',
      'deleted_at = ?',
      ...payloadFields.map((field) => `${toSnake(field)} = ?`),
    ];
    await db.prepare(
      `UPDATE ${spec.table} SET ${assignments.join(', ')} WHERE id = ?`,
    ).bind(revision, mutation.updatedAt, deletedAt, ...payloadValues, mutation.id).run();

    return { id: mutation.id, status: 'applied' };
  }

  // First write for this id. A partial first write *should* fail loudly on a
  // NOT NULL column rather than create a half-record.
  const columns = ['id', 'revision', 'updated_at', 'deleted_at', ...payloadFields.map(toSnake)];
  const values = [mutation.id, revision, mutation.updatedAt, deletedAt, ...payloadValues];

  await db.prepare(
    `INSERT INTO ${spec.table} (${columns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
  ).bind(...values).run();

  return { id: mutation.id, status: 'applied' };
};

export const handleSyncPush = async (request: Request, env: Env): Promise<Response> => {
  let body: { mutations?: unknown };
  try {
    body = await request.json();
  } catch {
    return error(request, env, 400, 'bad_json', 'Request body must be JSON.');
  }

  if (!Array.isArray(body.mutations)) {
    return error(request, env, 400, 'bad_shape', 'Body must be { "mutations": [...] }.');
  }
  if (body.mutations.length > 500) {
    return error(request, env, 400, 'batch_too_large', 'Send at most 500 mutations per request.');
  }

  const results: PushResult[] = [];
  for (const raw of body.mutations) {
    const checked = validate(raw);
    if (!checked.ok) {
      const id = typeof (raw as { id?: unknown })?.id === 'string'
        ? (raw as { id: string }).id
        : 'unknown';
      results.push({ id, status: 'rejected', reason: checked.reason });
      continue;
    }
    results.push(await applyMutation(env.DB, checked.value));
  }

  return json(request, env, { revision: await currentRevision(env.DB), results });
};
