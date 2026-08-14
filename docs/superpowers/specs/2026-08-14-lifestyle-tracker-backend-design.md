# Phase A — Server + sync foundation

**Date:** 2026-08-14
**Status:** Approved design, ready for implementation planning
**Scope:** Phase A only. Phases B–E are described for context and are explicitly out of scope.

---

## 1. Problem

TrainRight Health is a React 19 + Vite PWA deployed to GitHub Pages. All state lives in six
`localStorage` keys (`src/utils/storage.ts`). Consequences:

- The phone and the PC cannot see the same data. The only bridge is manual JSON export/import.
- No external process can write an entry, so chat-based logging is impossible.
- Garmin data arrives as a static `gh-sync.json` bundled into the public Pages artifact, which
  `garmin_sync.py` itself documents as not private.

The user wants a system reachable from the PC, writable from Telegram, connected to Garmin, and
extensible into a full lifestyle tracker including trading results.

## 2. Decomposition

Five subsystems, in dependency order. Each gets its own spec → plan → implementation cycle.

| Phase | Deliverable | Depends on |
|---|---|---|
| **A** | Server + database + auth; PWA syncs instead of using `localStorage` as the source of truth; existing data migrated | — |
| **B** | Garmin sync writes into the database instead of `gh-sync.json` | A |
| **C** | Telegram capture + Hermes integration (REST + MCP) | A |
| **D** | PC dashboard — wide-screen layout, keyboard-first entry, richer charts | A |
| **E** | Trading results and further lifestyle domains | A |

**This document specifies Phase A.** Phase A must leave seams for B, C and E, but implement none
of them.

## 3. Decisions

All confirmed by the user on 2026-08-14.

| Decision | Choice | Rejected alternatives |
|---|---|---|
| Hosting | Cloudflare Worker (API) + Cloudflare D1 (database) | Self-hosted Docker on the PC; a single always-on container (Fly.io/Railway/VPS); Neon or Supabase Postgres |
| Offline behaviour | Cached reads + durable write outbox that flushes on reconnect | Read-only offline; full two-way merge / CRDT |
| Conflict resolution | Last-write-wins per row | Event sourcing; operational transform |
| Chat channel | Telegram | Discord; both |
| Capture ownership | Worker owns a dedicated always-on tracker bot; Hermes drains a pending inbox | Hermes owns Telegram and the tracker is API-only; two fully independent bots |
| Trading | Domain-pluggable schema, zero trading code in Phase A | Spec trading now; ignore trading entirely |
| Frontend hosting | Unchanged — GitHub Pages, existing deploy workflow | Move to Cloudflare Pages |

**Rationale for D1 over Postgres.** Same $0 cost, but D1 is native to Workers: no connection
string, no second vendor dashboard, and 30-day point-in-time restore included. The dataset is a
few megabytes against a 5 GB limit. Accepted risk: SQLite has weaker JSON querying and no
`generate_series`, so if Phase E's trading analytics need heavy time-series SQL, that is the
point at which a migration to Postgres gets evaluated. Phase A's schema uses plain typed columns
and portable SQL to keep that migration cheap.

**Rationale for last-write-wins.** The system has exactly one human user. Two devices editing the
same record within the same second is not a scenario worth paying event-sourcing complexity for.
Row-level granularity means a bot write and a phone write to *different* records never conflict at
all, which is the case that actually occurs.

## 4. Architecture

```
  Phone PWA ──┐                        ┌── PC browser (same PWA)
  (GitHub     │   HTTPS + Bearer       │   (GitHub Pages)
   Pages)     └──────────┬─────────────┘
                         ▼
              Cloudflare Worker
              ├─ POST /v1/sync/push      apply client mutations
              ├─ GET  /v1/sync/pull      changes since revision cursor
              ├─ /v1/records/*           direct REST (Hermes, scripts)   [seam for C]
              ├─ /mcp                    MCP server                       [seam for C]
              ├─ /tg/webhook             Telegram front door              [seam for C]
              ├─ /v1/ingest/garmin       Garmin cron target               [seam for B]
              └─ /v1/devices             device list / revoke
                         ▼
                  Cloudflare D1
```

Phase A implements `/v1/sync/*`, `/v1/devices`, and the auth layer. The other routes are named
here so the router and auth model accommodate them; they are **not built in Phase A**.

## 5. Data model

### 5.1 Sync envelope

Every syncable record carries the same four columns:

| Column | Type | Meaning |
|---|---|---|
| `id` | TEXT (uuid) | Generated **on the client**. Doubles as the idempotency key. |
| `revision` | INTEGER | Server-assigned, monotonic across the whole account. The sync cursor. |
| `updated_at` | TEXT (ISO 8601) | Client wall-clock at time of edit. Sole input to last-write-wins. |
| `deleted_at` | TEXT (ISO 8601), nullable | Soft delete, so deletions propagate instead of resurrecting. |

`revision` comes from a single account-wide counter table, incremented in the same transaction as
the write. One counter for all domains means one cursor for the client to track.

### 5.2 Domain tables

Each domain gets a real typed table sharing that envelope — not a generic JSON bucket. Typed
columns keep analytics honest and keep the eventual Postgres migration mechanical.

Phase A ports the six existing `localStorage` keys:

| Existing key | Table |
|---|---|
| `nutrition_tracker_daily_entries` | `food_entry`, `exercise`, `daily_fitness` |
| `nutrition_tracker_user_settings` | `user_settings` (singleton row) |
| `nutrition_tracker_custom_foods` | `custom_food` |
| `nutrition_tracker_achievements` | `achievement` |
| `trainright_body_stats` | `body_stat` |
| `health_training_v1` | `session_log`, `set_log` |

The exact column list per table is derived from `src/types/index.ts` and `src/types/training.ts`
during implementation; every field currently persisted must survive the round trip.

### 5.3 The trading seam

Domains are registered in one place — a `SYNC_DOMAINS` registry listing table name, TypeScript
type, and validation schema. The sync engine iterates the registry and knows nothing else about
any domain.

Adding trading in Phase E is therefore: one new table, one registry entry, one UI tab. No change
to sync, auth, migration or any existing table.

## 6. Authentication

There is exactly one user. No signup flow, no password table.

- **Browsers.** First visit prompts for a bootstrap code held as a Worker secret. On success the
  server issues a 32-byte random device token and stores only its SHA-256 hash, alongside a
  device row (`id`, `label`, `created_at`, `last_seen_at`). The client stores the token and sends
  it as `Authorization: Bearer`. Settings lists devices and can revoke any of them.
- **Hermes** and the **Garmin cron** get separate scoped API keys, so rotating Hermes's key does
  not log the phone out.
- **Telegram** requests are verified by Telegram's `X-Telegram-Bot-Api-Secret-Token` header *and*
  a hard allowlist of the owner's chat ID.

No secret is ever stored in plaintext server-side. No secret is committed to the repository.

## 7. Client changes

`src/utils/storage.ts` is 796 lines mixing persistence, merge logic and backup. It changes anyway,
so Phase A splits it along its existing responsibilities:

- **`src/sync/outbox.ts`** — durable queue of pending mutations, stored in **IndexedDB**. iOS
  Safari can evict `localStorage` under storage pressure, and unsent writes are the one thing that
  cannot be lost.
- **`src/sync/client.ts`** — push/pull, exponential backoff, cursor persistence.
- **`src/sync/repository.ts`** — the API components call. A write updates the local cache and
  enqueues an outbox item; a failure to enqueue fails the write rather than losing it.
- **`src/utils/storage.ts`** — retains cache read/write and backup export/import only.

**Cached reads stay in `localStorage`.** Making reads async would touch most of the ~12k-line
codebase for no Phase A benefit. This is a deliberate blast-radius limit. The ~5 MB
`localStorage` ceiling is a known future constraint, revisited in Phase E.

`src/data/program.ts` content is not modified.

## 8. Migration of existing data

The existing `exportAppBackup()` already produces the required shape; the repository contains a
real example at `trainright-health-backup-2026-06-28 (1).json`.

A one-time Settings action, **"Upload my data to the server"**, converts the current
`localStorage` contents into rows and pushes them. Record IDs are **deterministic, derived from
record content** — the same fingerprint approach `importBodyAssessment` already uses — so running
the action twice imports nothing the second time.

The action is available until the user runs it successfully, then hidden behind an "advanced"
disclosure rather than removed.

## 9. Error handling

- Outbox items retry with exponential backoff (1s, 2s, 4s … capped at 5 minutes). After **6
  failed attempts** an item is **quarantined and surfaced in the UI** ("2 entries failed to sync —
  review"), where it can be retried or discarded by hand. Nothing is ever silently dropped.
  A 4xx response other than 408/429 quarantines immediately — retrying a rejected payload cannot
  succeed.
- A sync status line shows last-synced time and pending count, in the spirit of the existing
  staleness banner.
- Every mutation is idempotent by client UUID, so retrying after an ambiguous timeout is safe.
- A pull that returns a revision lower than the stored cursor is treated as a server reset: the
  client re-pulls from zero rather than silently diverging.
- Auth failure (401) clears the device token and returns the user to the bootstrap prompt; it does
  **not** clear cached data or the outbox.

## 10. Testing

Vitest is already configured and passing. Phase A adds:

- **Outbox:** enqueue, flush, retry, quarantine, survive page reload.
- **Sync:** cursor advance, last-write-wins resolution, tombstone propagation, interleaved
  two-device writes converging.
- **Migration:** import `trainright-health-backup-2026-06-28 (1).json` as a fixture **twice**, and
  assert identical row counts and identical content.
- **Worker handlers:** via `@cloudflare/vitest-pool-workers` against a local D1 instance.
- **Regression:** the existing suite must continue to pass unchanged.

## 11. Acceptance criteria

Phase A is done when all of the following hold:

1. A meal logged on the PC appears on the phone, with no manual action, within 30 seconds of the
   phone being foregrounded and online.
2. With the phone in airplane mode, three sets can be logged; on reconnect all three appear on the
   PC exactly once.
3. All pre-existing data is present and correct after migration, and re-running the migration
   changes nothing.
4. Revoking a device from Settings causes that device's next request to fail with 401.
5. `tsc -b` and `vitest` both pass.
6. Recurring infrastructure cost is $0.

## 12. Out of scope for Phase A

Named explicitly so they are not smuggled in: the Telegram bot and its parser, the MCP server,
Hermes integration, moving Garmin sync off `gh-sync.json`, the PC dashboard layout, any trading
feature, multi-user support, and any change to `src/data/program.ts` content.

## 13. Follow-on note

Once Phase B moves Garmin ingestion into the database, `gh-sync.json` stops being published into
the public Pages artifact. That closes the privacy gap documented in `garmin_sync.py` lines 26–29.
This is a Phase B outcome, recorded here so it is not forgotten.
