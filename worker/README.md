# TrainRight API (Phase A1)

Cloudflare Worker + D1 backing the TrainRight PWA. Design spec:
`docs/superpowers/specs/2026-08-14-lifestyle-tracker-backend-design.md`.

This is a **separate npm package** from the root Vite app. Run every command from `worker/`.
Nothing here imports from `../src`, and nothing in `../src` imports from here.

## Commands

    npm test               # Vitest against a local Miniflare + D1
    npm run typecheck      # tsc --noEmit
    npm run dev            # local server on :8787
    npm run migrate:local  # apply migrations to the local D1
    npm run migrate:remote # apply migrations to the real D1
    npm run deploy         # publish the Worker

## One-time setup

    npx wrangler login
    npx wrangler d1 create trainright     # paste the printed database_id into wrangler.toml
    npx wrangler secret put BOOTSTRAP_CODE

Generate a strong bootstrap code with:

    node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"

For local `wrangler dev`, put it in `.dev.vars` instead (gitignored):

    BOOTSTRAP_CODE=some-local-dev-code

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | none | Liveness |
| `POST /v1/auth/bootstrap` | bootstrap code | Exchange the code for a device token |
| `GET /v1/devices` | bearer | List devices |
| `DELETE /v1/devices/:id` | bearer | Revoke a device |
| `POST /v1/sync/push` | bearer | Apply client mutations |
| `GET /v1/sync/pull?since=N` | bearer | Changes after revision N |

## Sync protocol

Push:

```json
{ "mutations": [
  { "domain": "food_entry", "id": "<client-generated uuid>",
    "updatedAt": "2026-08-14T06:11:00.000Z", "deleted": false,
    "fields": { "date": "2026-08-14", "foodName": "Chicken breast" } }
] }
```

Response — per-item status, so one bad record never fails the batch:

```json
{ "revision": 12, "results": [ { "id": "...", "status": "applied" } ] }
```

- `applied` — written.
- `stale` — the server row has an equal or newer `updatedAt`; the client should pull. An exact
  replay lands here, which is what makes retries free.
- `rejected` + `reason` — unknown domain or field, bad timestamp. The client should quarantine
  **that item only**; retrying cannot succeed.

Pull returns `{ revision, hasMore, changes[] }`. `revision` is the highest revision actually
delivered, so it is directly usable as the next cursor when paging.

## Design notes worth knowing before you edit

- **Last-write-wins on `updatedAt`, per row.** Deliberate: there is one human user, so two devices
  editing the same record in the same second is not worth event-sourcing complexity.
- **`applyMutation` branches on whether the row exists** rather than using
  `INSERT ... ON CONFLICT DO UPDATE`. SQLite validates NOT NULL on the proposed insert row before
  resolving the conflict, so an upsert rejects a delete (which carries no fields) against any
  table with a NOT NULL payload column.
- **`toSnake` does not split on digits.** `smiKgM2` must become `smi_kg_m2`, not `smi_kg_m_2`.
- Tombstones are never garbage-collected in Phase A. That is what tells other devices a record is
  gone.

## Adding a domain (e.g. trading in Phase E)

1. Add the table in a new `migrations/000N_*.sql` with the four envelope columns
   `id`, `revision`, `updated_at`, `deleted_at`, plus an index on `revision`.
2. Add one entry to `SYNC_DOMAINS` in `src/domains.ts`.
3. Add the table name to `EXPECTED_TABLES` in `test/schema.spec.ts`.
4. Run `npm test`. `test/domains.spec.ts` fails if any column is left unregistered — that guard
   exists because an unregistered column would silently never sync.

No change to `sync.ts` is ever required.
