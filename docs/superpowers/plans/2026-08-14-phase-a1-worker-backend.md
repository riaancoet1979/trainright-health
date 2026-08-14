# Phase A1 — Worker Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployed, tested Cloudflare Worker + D1 API that stores every TrainRight record and serves a push/pull sync protocol, so the PWA can later run from both the phone and the PC against one source of truth.

**Architecture:** A standalone `worker/` package (its own `package.json`, never mixed with the root Vite app) exposes `POST /v1/sync/push` and `GET /v1/sync/pull`. Every record carries a sync envelope — client-generated `id`, server-assigned monotonic `revision`, client `updated_at`, nullable `deleted_at`. Conflicts resolve last-write-wins on `updated_at`. A domain registry drives all sync behaviour, so adding a domain later (trading, Phase E) is one table plus one registry entry.

**Tech Stack:** Cloudflare Workers (TypeScript, no framework), Cloudflare D1 (SQLite), Wrangler 4, Vitest with `@cloudflare/vitest-pool-workers`.

**Source spec:** [docs/superpowers/specs/2026-08-14-lifestyle-tracker-backend-design.md](../specs/2026-08-14-lifestyle-tracker-backend-design.md)

**Out of scope (do not build):** Telegram webhook, MCP server, Garmin ingest endpoint, any change to files under `src/`, any UI. Routes for those are *named* in the spec but are Phase B/C work.

---

## Ground rules for the implementer

You have not seen this codebase. Three things will bite you if you don't know them:

1. **Never run `npm audit fix`, and never modify the root `.npmrc`.** The repo owner has been burned by this. Dependency changes are limited to `worker/package.json`.
2. **The root project must keep working.** Do not touch root `package.json`, root `vitest.config.ts`, or anything under `src/`. `worker/` is a separate npm package with its own `node_modules`.
3. **This repo is on Windows with `core.autocrlf` behaviour that makes `git status` noisy.** Many files show as modified with no real change. **Always `git add` explicit paths — never `git add -A` or `git add .`.**

Run every command from the `worker/` directory unless the step says otherwise.

---

## File structure

| File | Responsibility |
|---|---|
| `worker/package.json` | Worker-only dependencies and scripts |
| `worker/wrangler.toml` | Worker name, D1 binding, secrets, vars |
| `worker/tsconfig.json` | TypeScript config for the Worker runtime |
| `worker/vitest.config.ts` | Vitest + workers pool + migration loading |
| `worker/migrations/0001_init.sql` | Complete initial D1 schema |
| `worker/src/env.ts` | `Env` binding types |
| `worker/src/http.ts` | JSON responses, CORS, error shapes |
| `worker/src/index.ts` | Router — maps method+path to handlers |
| `worker/src/case.ts` | camelCase ↔ snake_case conversion |
| `worker/src/domains.ts` | The domain registry — the trading seam |
| `worker/src/revision.ts` | Account-wide monotonic revision counter |
| `worker/src/auth.ts` | Bootstrap, token issue/verify, device rows |
| `worker/src/sync.ts` | Push and pull handlers |
| `worker/test/*.spec.ts` | One spec file per source module |

Each source file has one responsibility and stays small. `sync.ts` is the only file that knows the protocol; it learns about domains only through `domains.ts`.

---

## Task 1: Scaffold the Worker project

**Files:**
- Create: `worker/package.json`, `worker/wrangler.toml`, `worker/tsconfig.json`, `worker/vitest.config.ts`, `worker/.gitignore`
- Create: `worker/src/env.ts`, `worker/src/http.ts`, `worker/src/index.ts`
- Create: `worker/test/env.d.ts`, `worker/test/health.spec.ts`

- [ ] **Step 1: Create the D1 database and capture its ID**

From the repository root:

```bash
mkdir -p worker
cd worker
npx wrangler login
npx wrangler d1 create trainright
```

The command prints a `database_id` (a UUID). Copy it — you paste it into `wrangler.toml` in Step 3. If `wrangler d1 create` reports the database already exists, run `npx wrangler d1 list` and take the ID from there.

- [ ] **Step 2: Create `worker/package.json`**

Write the file with scripts only, so npm resolves and pins real version ranges rather than a
non-reproducible `"latest"`:

```json
{
  "name": "trainright-api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "deploy": "wrangler deploy",
    "migrate:local": "wrangler d1 migrations apply trainright --local",
    "migrate:remote": "wrangler d1 migrations apply trainright --remote"
  }
}
```

Then install the dependencies so npm writes concrete versions into `package.json` and pins them
in `package-lock.json`:

```bash
npm i -D wrangler @cloudflare/workers-types @cloudflare/vitest-pool-workers typescript@~5.9.3
```

`@cloudflare/vitest-pool-workers` pins the Vitest versions it supports, and that pin changes over
time. **Do not guess a Vitest version.** After installing, run:

```bash
npm ls vitest
```

If Vitest is absent, or npm printed a peer-dependency error naming a required range, install
exactly what it asked for — for example `npm i -D vitest@3.2.0` — then re-run `npm ls vitest`
until it resolves with no error. Record the resolved version in the Step 13 commit message.

- [ ] **Step 3: Create `worker/wrangler.toml`**

Replace `<DATABASE_ID>` with the UUID from Step 1. Replace `<YOUR_PAGES_ORIGIN>` with the GitHub Pages origin the PWA is served from (find it with `git remote -v` — for `github.com/<user>/<repo>` the origin is `https://<user>.github.io`).

```toml
name = "trainright-api"
main = "src/index.ts"
compatibility_date = "2026-08-01"

[vars]
ALLOWED_ORIGINS = "<YOUR_PAGES_ORIGIN>,http://localhost:5173"

[[d1_databases]]
binding = "DB"
database_name = "trainright"
database_id = "<DATABASE_ID>"
migrations_dir = "migrations"
```

`BOOTSTRAP_CODE` is deliberately **not** in this file — it is a secret, set in Task 6.

- [ ] **Step 4: Create `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers/types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 5: Create `worker/.gitignore`**

```
node_modules/
.wrangler/
dist/
.dev.vars
```

`.dev.vars` holds local secrets and must never be committed.

- [ ] **Step 6: Create `worker/src/env.ts`**

```ts
export interface Env {
  DB: D1Database;
  /** Comma-separated list of origins allowed to call this API. */
  ALLOWED_ORIGINS: string;
  /** One-time code a browser presents to obtain a device token. Secret. */
  BOOTSTRAP_CODE: string;
}
```

- [ ] **Step 7: Create `worker/src/http.ts`**

```ts
import type { Env } from './env';

export const corsHeaders = (request: Request, env: Env): Record<string, string> => {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

export const json = (
  request: Request,
  env: Env,
  body: unknown,
  status = 200,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
  });

export const error = (
  request: Request,
  env: Env,
  status: number,
  code: string,
  message: string,
): Response => json(request, env, { error: { code, message } }, status);
```

- [ ] **Step 8: Write the failing test**

Create `worker/test/env.d.ts`. Note: `ProvidedEnv` was removed in vitest-pool-workers 0.21 —
the test `env` is now typed by declaration-merging into the global `Cloudflare.Env`:

```ts
import type { Env as AppEnv } from '../src/env';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
```

Create `worker/test/health.spec.ts`:

```ts
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
```

These rely on `ALLOWED_ORIGINS` from `wrangler.toml`, which `vitest.config.ts` loads via
`wrangler.configPath` — `http://localhost:5173` is in that list, so the assertions are
deterministic regardless of your Pages origin.

- [ ] **Step 9: Create `worker/vitest.config.ts`**

`migrations/` does not exist yet, so guard the read — Task 2 creates it.

**Version note.** vitest-pool-workers 0.21 removed the `@cloudflare/vitest-pool-workers/config`
subpath and `defineWorkersConfig`. It is now a Vite *plugin*: what used to be
`test.poolOptions.workers` is the argument to `cloudflareTest()`. If you are on an older 0.8.x
version you will need the old form instead — the package ships a codemod at
`dist/codemods/vitest-v3-to-v4.mjs` that documents the exact mapping.

```ts
import path from 'node:path';
import { cloudflareTest, readD1Migrations, type D1Migration } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      let migrations: D1Migration[] = [];
      try {
        migrations = await readD1Migrations(migrationsDir);
      } catch {
        // Task 2 creates migrations/. Until then, run against an empty schema.
        migrations = [];
      }

      return {
        singleWorker: true,
        isolatedStorage: true,
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BOOTSTRAP_CODE: 'test-bootstrap-code',
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
```

Create `worker/test/apply-migrations.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

`isolatedStorage: true` gives every test file a clean database, so tests cannot leak rows into each other.

- [ ] **Step 10: Run the test to verify it fails**

```bash
npm test
```

Expected: FAIL — `src/index.ts` does not exist, so the Worker has no entrypoint.

- [ ] **Step 11: Write the minimal implementation**

Create `worker/src/index.ts`:

```ts
import type { Env } from './env';
import { corsHeaders, json, error } from './http';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json(request, env, { ok: true });
    }

    return error(request, env, 404, 'not_found', `No route for ${request.method} ${url.pathname}`);
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 12: Run the test to verify it passes**

```bash
npm test
```

Expected: PASS, 5 tests.

- [ ] **Step 13: Commit**

```bash
cd ..
git add worker/package.json worker/package-lock.json worker/wrangler.toml worker/tsconfig.json worker/vitest.config.ts worker/.gitignore worker/src worker/test
git commit -m "feat(worker): scaffold Cloudflare Worker with health endpoint and test harness"
```

---

## Task 2: Initial D1 schema

Every table carries the same four envelope columns — `id`, `revision`, `updated_at`, `deleted_at` — because the sync engine handles all domains identically.

Two deliberate exceptions to "typed columns": `segmental_lean` / `segmental_fat` on `body_stat`, `red_flags` on `session_log`, and the JSON columns on `user_settings` are stored as JSON text. They are nested arrays and objects that are never queried by their inner fields, so normalising them would buy nothing and cost joins.

**Files:**
- Create: `worker/migrations/0001_init.sql`
- Create: `worker/test/schema.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/test/schema.spec.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const EXPECTED_TABLES = [
  'achievement', 'body_metric', 'body_stat', 'custom_food', 'daily_steps',
  'device', 'exercise', 'exercise_log', 'food_entry', 'legacy_blob',
  'meta', 'pushup_set', 'session_log', 'set_log', 'user_settings',
];

const SYNCED_TABLES = EXPECTED_TABLES.filter((t) => t !== 'meta' && t !== 'device');

describe('schema', () => {
  it('creates every expected table', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(EXPECTED_TABLES);
  });

  it('gives every synced table the full envelope', async () => {
    for (const table of SYNCED_TABLES) {
      const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
      const columns = results.map((r) => r.name);
      expect(columns, `${table} envelope`).toEqual(
        expect.arrayContaining(['id', 'revision', 'updated_at', 'deleted_at']),
      );
    }
  });

  it('seeds the revision counter at zero', async () => {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key='revision'").first<{ value: number }>();
    expect(row?.value).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- schema
```

Expected: FAIL — `no such table: meta`.

- [ ] **Step 3: Write the migration**

Create `worker/migrations/0001_init.sql`:

```sql
-- Account-wide monotonic revision counter. One counter for all domains means
-- the client tracks exactly one sync cursor.
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT INTO meta (key, value) VALUES ('revision', 0);

-- Authenticated clients. Single human user; a "device" is a browser, Hermes,
-- or a scheduled job. Only the token hash is stored.
CREATE TABLE device (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  scope        TEXT NOT NULL DEFAULT 'app',
  created_at   TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at   TEXT
);
CREATE INDEX idx_device_token_hash ON device (token_hash);

CREATE TABLE food_entry (
  id                    TEXT PRIMARY KEY,
  revision              INTEGER NOT NULL,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT,
  date                  TEXT NOT NULL,
  food_id               TEXT NOT NULL,
  food_name             TEXT NOT NULL,
  portion               REAL NOT NULL,
  calories              REAL NOT NULL,
  protein               REAL NOT NULL,
  carbs                 REAL NOT NULL,
  fats                  REAL NOT NULL,
  meal_type             TEXT NOT NULL,
  timestamp             TEXT NOT NULL,
  piece_count           REAL,
  serving_type          TEXT,
  is_manual_macro_entry INTEGER
);
CREATE INDEX idx_food_entry_revision ON food_entry (revision);
CREATE INDEX idx_food_entry_date ON food_entry (date);

CREATE TABLE exercise (
  id              TEXT PRIMARY KEY,
  revision        INTEGER NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  date            TEXT NOT NULL,
  name            TEXT NOT NULL,
  duration        REAL NOT NULL,
  calories_burned REAL NOT NULL,
  type            TEXT NOT NULL,
  timestamp       TEXT NOT NULL
);
CREATE INDEX idx_exercise_revision ON exercise (revision);
CREATE INDEX idx_exercise_date ON exercise (date);

CREATE TABLE pushup_set (
  id         TEXT PRIMARY KEY,
  revision   INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  date       TEXT NOT NULL,
  reps       INTEGER NOT NULL,
  timestamp  TEXT NOT NULL
);
CREATE INDEX idx_pushup_set_revision ON pushup_set (revision);
CREATE INDEX idx_pushup_set_date ON pushup_set (date);

-- id is the YYYY-MM-DD date: one steps row per day.
CREATE TABLE daily_steps (
  id         TEXT PRIMARY KEY,
  revision   INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  date       TEXT NOT NULL,
  steps      INTEGER NOT NULL,
  goal       INTEGER NOT NULL
);
CREATE INDEX idx_daily_steps_revision ON daily_steps (revision);

CREATE TABLE custom_food (
  id             TEXT PRIMARY KEY,
  revision       INTEGER NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT,
  name           TEXT NOT NULL,
  calories       REAL NOT NULL,
  protein        REAL NOT NULL,
  carbs          REAL NOT NULL,
  fats           REAL NOT NULL,
  category       TEXT,
  brand          TEXT,
  serving_type   TEXT,
  average_weight REAL,
  is_custom      INTEGER
);
CREATE INDEX idx_custom_food_revision ON custom_food (revision);

CREATE TABLE achievement (
  id         TEXT PRIMARY KEY,
  revision   INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  name       TEXT NOT NULL,
  date       TEXT NOT NULL
);
CREATE INDEX idx_achievement_revision ON achievement (revision);

CREATE TABLE body_stat (
  id                              TEXT PRIMARY KEY,
  revision                        INTEGER NOT NULL,
  updated_at                      TEXT NOT NULL,
  deleted_at                      TEXT,
  date                            TEXT NOT NULL,
  weight                          REAL,
  body_fat                        REAL,
  waist                           REAL,
  chest                           REAL,
  hips                            REAL,
  left_arm                        REAL,
  right_arm                       REAL,
  neck                            REAL,
  thigh_l                         REAL,
  thigh_r                         REAL,
  shoulder_width                  REAL,
  measured_at                     TEXT,
  imported_at                     TEXT,
  source                          TEXT,
  source_device                   TEXT,
  source_fingerprint              TEXT,
  total_body_water_l              REAL,
  protein_mass_kg                 REAL,
  mineral_mass_kg                 REAL,
  body_fat_mass_kg                REAL,
  skeletal_muscle_mass_kg         REAL,
  fat_free_mass_kg                REAL,
  bmi                             REAL,
  smi_kg_m2                       REAL,
  in_body_score                   REAL,
  in_body_score_max               REAL,
  basal_metabolic_rate_kcal       REAL,
  recommended_calorie_intake_kcal REAL,
  waist_hip_ratio                 REAL,
  visceral_fat_level              REAL,
  obesity_degree_percent          REAL,
  target_weight_kg                REAL,
  weight_control_kg               REAL,
  fat_control_kg                  REAL,
  muscle_control_kg               REAL,
  segmental_lean                  TEXT,
  segmental_fat                   TEXT,
  needs_review                    INTEGER,
  review_fields                   TEXT,
  notes                           TEXT
);
CREATE INDEX idx_body_stat_revision ON body_stat (revision);
CREATE INDEX idx_body_stat_date ON body_stat (date);
CREATE INDEX idx_body_stat_fingerprint ON body_stat (source_fingerprint);

-- id is the YYYY-MM-DD date: one training session per day.
CREATE TABLE session_log (
  id               TEXT PRIMARY KEY,
  revision         INTEGER NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT,
  date             TEXT NOT NULL,
  day_key          TEXT NOT NULL,
  day_key_override TEXT,
  week_num         INTEGER NOT NULL,
  phase            INTEGER NOT NULL,
  readiness        TEXT,
  shoulder_pain    REAL,
  red_flags        TEXT,
  completed        INTEGER NOT NULL,
  notes            TEXT
);
CREATE INDEX idx_session_log_revision ON session_log (revision);

-- One row per exercise within a session; carries the free-text note.
CREATE TABLE exercise_log (
  id           TEXT PRIMARY KEY,
  revision     INTEGER NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  session_date TEXT NOT NULL,
  exercise_id  TEXT NOT NULL,
  note         TEXT
);
CREATE INDEX idx_exercise_log_revision ON exercise_log (revision);
CREATE INDEX idx_exercise_log_session ON exercise_log (session_date);

-- weight and reps are TEXT on purpose: the app records free text such as
-- "BW", "red band", or "22.5" and must not lose that.
CREATE TABLE set_log (
  id           TEXT PRIMARY KEY,
  revision     INTEGER NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  session_date TEXT NOT NULL,
  exercise_id  TEXT NOT NULL,
  set_index    INTEGER NOT NULL,
  weight       TEXT,
  reps         TEXT,
  done         INTEGER,
  left_weight  TEXT,
  left_reps    TEXT,
  left_done    INTEGER,
  right_weight TEXT,
  right_reps   TEXT,
  right_done   INTEGER
);
CREATE INDEX idx_set_log_revision ON set_log (revision);
CREATE INDEX idx_set_log_session ON set_log (session_date, exercise_id);

-- Legacy TrainRight body metrics, kept as their own domain so the import is
-- lossless rather than lossily folded into body_stat.
CREATE TABLE body_metric (
  id         TEXT PRIMARY KEY,
  revision   INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  date       TEXT NOT NULL,
  weight     REAL,
  bfp        REAL,
  waist      REAL,
  chest      REAL
);
CREATE INDEX idx_body_metric_revision ON body_metric (revision);

-- Singleton row, id = 'singleton'.
CREATE TABLE user_settings (
  id                 TEXT PRIMARY KEY,
  revision           INTEGER NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT,
  daily_calories     REAL NOT NULL,
  daily_protein      REAL NOT NULL,
  daily_carbs        REAL NOT NULL,
  daily_fats         REAL NOT NULL,
  theme              TEXT NOT NULL,
  pushup_reminders   TEXT,
  rest_timer_seconds INTEGER,
  meal_split         TEXT,
  staples            TEXT,
  program_start_date TEXT
);
CREATE INDEX idx_user_settings_revision ON user_settings (revision);

-- Opaque legacy payloads (TrainingData.legacyTrainRight) preserved verbatim so
-- no historical data is lost during migration.
CREATE TABLE legacy_blob (
  id         TEXT PRIMARY KEY,
  revision   INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  kind       TEXT NOT NULL,
  payload    TEXT NOT NULL
);
CREATE INDEX idx_legacy_blob_revision ON legacy_blob (revision);
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- schema
```

Expected: PASS, 3 tests. If the first test fails, the error message lists the actual table names — reconcile against `EXPECTED_TABLES` (it is alphabetical).

- [ ] **Step 5: Apply the migration locally and remotely**

```bash
npm run migrate:local
npm run migrate:remote
```

Expected: both report the migration applied. `migrate:remote` writes to the real D1 database.

- [ ] **Step 6: Commit**

```bash
cd ..
git add worker/migrations/0001_init.sql worker/test/schema.spec.ts
git commit -m "feat(worker): initial D1 schema for all sync domains"
```

---

## Task 3: camelCase ↔ snake_case conversion

The client's TypeScript types are camelCase; D1 columns are snake_case. One deterministic converter, tested, used everywhere.

**Files:**
- Create: `worker/src/case.ts`
- Create: `worker/test/case.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/test/case.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toSnake, toCamel } from '../src/case';

describe('toSnake', () => {
  it.each([
    ['foodId', 'food_id'],
    ['bmi', 'bmi'],
    ['thighL', 'thigh_l'],
    ['smiKgM2', 'smi_kg_m2'],
    ['totalBodyWaterL', 'total_body_water_l'],
    ['isManualMacroEntry', 'is_manual_macro_entry'],
    ['recommendedCalorieIntakeKcal', 'recommended_calorie_intake_kcal'],
  ])('%s -> %s', (input, expected) => {
    expect(toSnake(input)).toBe(expected);
  });
});

describe('toCamel', () => {
  it.each([
    ['food_id', 'foodId'],
    ['bmi', 'bmi'],
    ['thigh_l', 'thighL'],
    ['smi_kg_m2', 'smiKgM2'],
    ['total_body_water_l', 'totalBodyWaterL'],
  ])('%s -> %s', (input, expected) => {
    expect(toCamel(input)).toBe(expected);
  });
});

describe('round trip', () => {
  it('is stable for every camelCase field we sync', () => {
    const fields = ['foodId', 'thighL', 'smiKgM2', 'totalBodyWaterL', 'isManualMacroEntry', 'bmi'];
    for (const field of fields) {
      expect(toCamel(toSnake(field))).toBe(field);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- case
```

Expected: FAIL — cannot resolve `../src/case`.

- [ ] **Step 3: Write the implementation**

Create `worker/src/case.ts`:

```ts
/**
 * camelCase -> snake_case. Digits are treated as word starts so `smiKgM2`
 * becomes `smi_kg_m2` and round-trips cleanly.
 */
export const toSnake = (input: string): string =>
  input
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Za-z])(\d)/g, '$1_$2')
    .toLowerCase();

/** snake_case -> camelCase. Inverse of `toSnake`. */
export const toCamel = (input: string): string =>
  input.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- case
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
cd ..
git add worker/src/case.ts worker/test/case.spec.ts
git commit -m "feat(worker): add camelCase/snake_case field conversion"
```

---

## Task 4: The domain registry

This is the trading seam from the spec. `sync.ts` must never name a table directly.

**Files:**
- Create: `worker/src/domains.ts`
- Create: `worker/test/domains.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/test/domains.spec.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { SYNC_DOMAINS, ENVELOPE_COLUMNS } from '../src/domains';
import { toSnake } from '../src/case';

describe('SYNC_DOMAINS', () => {
  it('registers a table that exists for every domain', async () => {
    for (const domain of Object.values(SYNC_DOMAINS)) {
      const row = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
      ).bind(domain.table).first<{ name: string }>();
      expect(row?.name, `missing table for domain ${domain.name}`).toBe(domain.table);
    }
  });

  it('only declares fields that exist as columns', async () => {
    for (const domain of Object.values(SYNC_DOMAINS)) {
      const { results } = await env.DB.prepare(`PRAGMA table_info(${domain.table})`).all<{ name: string }>();
      const columns = new Set(results.map((r) => r.name));
      for (const field of domain.fields) {
        expect(columns.has(toSnake(field)), `${domain.name}.${field} -> ${toSnake(field)}`).toBe(true);
      }
    }
  });

  it('covers every non-envelope column of every registered table', async () => {
    for (const domain of Object.values(SYNC_DOMAINS)) {
      const { results } = await env.DB.prepare(`PRAGMA table_info(${domain.table})`).all<{ name: string }>();
      const envelope: readonly string[] = ENVELOPE_COLUMNS;
      const payloadColumns = results
        .map((r) => r.name)
        .filter((name) => !envelope.includes(name));
      const declared = new Set(domain.fields.map(toSnake));
      for (const column of payloadColumns) {
        expect(declared.has(column), `${domain.table}.${column} is not in the registry`).toBe(true);
      }
    }
  });

  it('keys each domain by its own name', () => {
    for (const [key, domain] of Object.entries(SYNC_DOMAINS)) {
      expect(key).toBe(domain.name);
    }
  });
});
```

The third test is the important one: it fails the build if someone adds a column and forgets the registry, which would otherwise cause silent data loss on sync.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- domains
```

Expected: FAIL — cannot resolve `../src/domains`.

- [ ] **Step 3: Write the implementation**

Create `worker/src/domains.ts`:

```ts
export const ENVELOPE_COLUMNS = ['id', 'revision', 'updated_at', 'deleted_at'] as const;

export interface DomainSpec {
  /** Wire name, identical to the table name. */
  readonly name: string;
  readonly table: string;
  /** camelCase payload fields, excluding the envelope. */
  readonly fields: readonly string[];
  /** Subset of `fields` stored as JSON text and parsed on the way out. */
  readonly jsonFields: readonly string[];
  /** Subset of `fields` stored as 0/1 and returned as booleans. */
  readonly booleanFields: readonly string[];
}

const domain = (
  name: string,
  fields: readonly string[],
  options: { json?: readonly string[]; boolean?: readonly string[] } = {},
): DomainSpec => ({
  name,
  table: name,
  fields,
  jsonFields: options.json ?? [],
  booleanFields: options.boolean ?? [],
});

export const SYNC_DOMAINS: Record<string, DomainSpec> = {
  food_entry: domain(
    'food_entry',
    ['date', 'foodId', 'foodName', 'portion', 'calories', 'protein', 'carbs', 'fats',
     'mealType', 'timestamp', 'pieceCount', 'servingType', 'isManualMacroEntry'],
    { boolean: ['isManualMacroEntry'] },
  ),

  exercise: domain(
    'exercise',
    ['date', 'name', 'duration', 'caloriesBurned', 'type', 'timestamp'],
  ),

  pushup_set: domain('pushup_set', ['date', 'reps', 'timestamp']),

  daily_steps: domain('daily_steps', ['date', 'steps', 'goal']),

  custom_food: domain(
    'custom_food',
    ['name', 'calories', 'protein', 'carbs', 'fats', 'category', 'brand',
     'servingType', 'averageWeight', 'isCustom'],
    { boolean: ['isCustom'] },
  ),

  achievement: domain('achievement', ['name', 'date']),

  body_stat: domain(
    'body_stat',
    ['date', 'weight', 'bodyFat', 'waist', 'chest', 'hips', 'leftArm', 'rightArm', 'neck',
     'thighL', 'thighR', 'shoulderWidth', 'measuredAt', 'importedAt', 'source', 'sourceDevice',
     'sourceFingerprint', 'totalBodyWaterL', 'proteinMassKg', 'mineralMassKg', 'bodyFatMassKg',
     'skeletalMuscleMassKg', 'fatFreeMassKg', 'bmi', 'smiKgM2', 'inBodyScore', 'inBodyScoreMax',
     'basalMetabolicRateKcal', 'recommendedCalorieIntakeKcal', 'waistHipRatio', 'visceralFatLevel',
     'obesityDegreePercent', 'targetWeightKg', 'weightControlKg', 'fatControlKg', 'muscleControlKg',
     'segmentalLean', 'segmentalFat', 'needsReview', 'reviewFields', 'notes'],
    { json: ['segmentalLean', 'segmentalFat', 'reviewFields'], boolean: ['needsReview'] },
  ),

  session_log: domain(
    'session_log',
    ['date', 'dayKey', 'dayKeyOverride', 'weekNum', 'phase', 'readiness',
     'shoulderPain', 'redFlags', 'completed', 'notes'],
    { json: ['redFlags'], boolean: ['completed'] },
  ),

  exercise_log: domain('exercise_log', ['sessionDate', 'exerciseId', 'note']),

  set_log: domain(
    'set_log',
    ['sessionDate', 'exerciseId', 'setIndex', 'weight', 'reps', 'done',
     'leftWeight', 'leftReps', 'leftDone', 'rightWeight', 'rightReps', 'rightDone'],
    { boolean: ['done', 'leftDone', 'rightDone'] },
  ),

  body_metric: domain('body_metric', ['date', 'weight', 'bfp', 'waist', 'chest']),

  user_settings: domain(
    'user_settings',
    ['dailyCalories', 'dailyProtein', 'dailyCarbs', 'dailyFats', 'theme',
     'pushupReminders', 'restTimerSeconds', 'mealSplit', 'staples', 'programStartDate'],
    { json: ['pushupReminders', 'mealSplit', 'staples'] },
  ),

  legacy_blob: domain('legacy_blob', ['kind', 'payload'], { json: ['payload'] }),
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- domains
```

Expected: PASS, 4 tests. If the third test fails naming a column, add the camelCase equivalent to that domain's `fields`.

- [ ] **Step 5: Commit**

```bash
cd ..
git add worker/src/domains.ts worker/test/domains.spec.ts
git commit -m "feat(worker): add domain registry driving all sync behaviour"
```

---

## Task 5: Revision counter

**Files:**
- Create: `worker/src/revision.ts`
- Create: `worker/test/revision.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/test/revision.spec.ts`:

```ts
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- revision
```

Expected: FAIL — cannot resolve `../src/revision`.

- [ ] **Step 3: Write the implementation**

Create `worker/src/revision.ts`:

```ts
/**
 * Issue the next account-wide revision. The UPDATE ... RETURNING runs as a
 * single statement, so two concurrent callers can never receive the same value.
 */
export const nextRevision = async (db: D1Database): Promise<number> => {
  const row = await db
    .prepare("UPDATE meta SET value = value + 1 WHERE key = 'revision' RETURNING value")
    .first<{ value: number }>();
  if (!row) throw new Error('revision counter row missing — migrations not applied');
  return row.value;
};

/** The highest revision issued so far. Used as the pull cursor high-water mark. */
export const currentRevision = async (db: D1Database): Promise<number> => {
  const row = await db
    .prepare("SELECT value FROM meta WHERE key = 'revision'")
    .first<{ value: number }>();
  if (!row) throw new Error('revision counter row missing — migrations not applied');
  return row.value;
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- revision
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd ..
git add worker/src/revision.ts worker/test/revision.spec.ts
git commit -m "feat(worker): add monotonic account-wide revision counter"
```

---

## Task 6: Bootstrap a device token

**Files:**
- Create: `worker/src/auth.ts`
- Create: `worker/test/auth-bootstrap.spec.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/test/auth-bootstrap.spec.ts`:

```ts
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

  it('never stores the raw token', async () => {
    const res = await bootstrap({ code: 'test-bootstrap-code', label: 'Phone' });
    const { token } = await res.json<{ token: string }>();
    const row = await env.DB.prepare('SELECT token_hash FROM device WHERE label = ?')
      .bind('Phone').first<{ token_hash: string }>();
    expect(row?.token_hash).toBeDefined();
    expect(row?.token_hash).not.toBe(token);
    expect(row?.token_hash).toHaveLength(64);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- auth-bootstrap
```

Expected: FAIL — all four tests return 404 because the route does not exist.

- [ ] **Step 3: Write the implementation**

Create `worker/src/auth.ts`:

```ts
import type { Env } from './env';
import { json, error } from './http';

const TOKEN_BYTES = 32;

const base64url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** SHA-256 as lowercase hex. Tokens are high-entropy, so no salt is needed. */
export const hashToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Length-independent, content-constant-time comparison of two short strings. */
const timingSafeEqual = (a: string, b: string): boolean => {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
};

export const handleBootstrap = async (request: Request, env: Env): Promise<Response> => {
  let body: { code?: unknown; label?: unknown; scope?: unknown };
  try {
    body = await request.json();
  } catch {
    return error(request, env, 400, 'bad_json', 'Request body must be JSON.');
  }

  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return error(request, env, 400, 'missing_label', 'A device label is required.');

  const scope = body.scope === 'hermes' || body.scope === 'ingest' ? body.scope : 'app';

  if (typeof body.code !== 'string' || !timingSafeEqual(body.code, env.BOOTSTRAP_CODE)) {
    return error(request, env, 401, 'bad_code', 'Bootstrap code rejected.');
  }

  const token = base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  const deviceId = crypto.randomUUID();

  await env.DB.prepare(
    'INSERT INTO device (id, label, token_hash, scope, created_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(deviceId, label, await hashToken(token), scope, new Date().toISOString()).run();

  return json(request, env, { token, deviceId, label, scope });
};
```

- [ ] **Step 4: Wire the route into `worker/src/index.ts`**

Replace the whole file:

```ts
import type { Env } from './env';
import { corsHeaders, json, error } from './http';
import { handleBootstrap } from './auth';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (route === 'GET /health') return json(request, env, { ok: true });
    if (route === 'POST /v1/auth/bootstrap') return handleBootstrap(request, env);

    return error(request, env, 404, 'not_found', `No route for ${route}`);
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS, all suites including the 4 new bootstrap tests.

- [ ] **Step 6: Set the real bootstrap secret**

Generate a strong code and store it as a Worker secret (never in `wrangler.toml`):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
npx wrangler secret put BOOTSTRAP_CODE
```

Paste the generated value when prompted. Save it in your password manager — you type it once per browser.

For local `wrangler dev`, create `worker/.dev.vars` (gitignored):

```
BOOTSTRAP_CODE=some-local-dev-code
```

- [ ] **Step 7: Commit**

```bash
cd ..
git add worker/src/auth.ts worker/src/index.ts worker/test/auth-bootstrap.spec.ts
git commit -m "feat(worker): issue device tokens from a bootstrap code"
```

---

## Task 7: Bearer authentication

**Files:**
- Modify: `worker/src/auth.ts`
- Create: `worker/test/auth-bearer.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/test/auth-bearer.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- auth-bearer
```

Expected: FAIL — `authenticate` is not exported from `../src/auth`.

- [ ] **Step 3: Add the implementation**

Append to `worker/src/auth.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- auth-bearer
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd ..
git add worker/src/auth.ts worker/test/auth-bearer.spec.ts
git commit -m "feat(worker): authenticate requests by bearer device token"
```

---

## Task 8: Device list and revoke

**Files:**
- Modify: `worker/src/auth.ts`, `worker/src/index.ts`
- Create: `worker/test/devices.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/test/devices.spec.ts`:

```ts
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
  });

  it('requires authentication', async () => {
    const res = await SELF.fetch('https://api.test/v1/devices');
    expect(res.status).toBe(401);
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- devices
```

Expected: FAIL — `/v1/devices` returns 404.

- [ ] **Step 3: Add the handlers**

Append to `worker/src/auth.ts`:

```ts
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
```

- [ ] **Step 4: Wire the routes**

Replace `worker/src/index.ts`. Note the ordering: the handler is **resolved before**
authentication runs, so an unknown path returns 404 rather than a misleading 401 — which is what
keeps the `/nope` test from Task 1 passing.

```ts
import type { Env } from './env';
import { corsHeaders, json, error } from './http';
import {
  authenticate,
  handleBootstrap,
  handleListDevices,
  handleRevokeDevice,
} from './auth';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    // ── Public routes ──
    if (route === 'GET /health') return json(request, env, { ok: true });
    if (route === 'POST /v1/auth/bootstrap') return handleBootstrap(request, env);

    // ── Protected routes: resolve first, authenticate second ──
    const revokeMatch = url.pathname.match(/^\/v1\/devices\/([0-9a-f-]{36})$/);
    let handler: (() => Promise<Response>) | null = null;

    if (route === 'GET /v1/devices') {
      handler = () => handleListDevices(request, env);
    } else if (request.method === 'DELETE' && revokeMatch) {
      handler = () => handleRevokeDevice(request, env, revokeMatch[1]);
    }

    if (!handler) return error(request, env, 404, 'not_found', `No route for ${route}`);

    const device = await authenticate(request, env);
    if (!device) {
      return error(request, env, 401, 'unauthorized', 'Valid device token required.');
    }

    return handler();
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
cd ..
git add worker/src/auth.ts worker/src/index.ts worker/test/devices.spec.ts
git commit -m "feat(worker): list and revoke devices"
```

---

## Task 9: Sync push

The heart of the system. Each mutation is upserted under last-write-wins on `updatedAt`, keyed by the client-generated `id`, which makes replays free.

**Wire format.** Request:

```json
{
  "mutations": [
    { "domain": "food_entry", "id": "uuid", "updatedAt": "2026-08-14T06:11:00.000Z",
      "deleted": false, "fields": { "date": "2026-08-14", "foodName": "Chicken breast" } }
  ]
}
```

Response:

```json
{
  "revision": 12,
  "results": [ { "id": "uuid", "status": "applied" } ]
}
```

`status` is `applied`, `stale` (server row is newer — client should pull), or `rejected` with a `reason` (client quarantines that item only).

**Files:**
- Create: `worker/src/sync.ts`
- Create: `worker/test/sync-push.spec.ts`
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/test/sync-push.spec.ts`:

```ts
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

let token = '';

beforeAll(async () => {
  const res = await SELF.fetch('https://api.test/v1/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'test-bootstrap-code', label: 'Push tests' }),
  });
  token = (await res.json<{ token: string }>()).token;
});

const push = (mutations: unknown[]) =>
  SELF.fetch('https://api.test/v1/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mutations }),
  });

const meal = (id: string, updatedAt: string, foodName = 'Chicken breast') => ({
  domain: 'food_entry',
  id,
  updatedAt,
  deleted: false,
  fields: {
    date: '2026-08-14', foodId: 'chicken', foodName, portion: 220,
    calories: 363, protein: 68, carbs: 0, fats: 8,
    mealType: 'lunch', timestamp: `${updatedAt}`, isManualMacroEntry: false,
  },
});

describe('POST /v1/sync/push', () => {
  it('requires authentication', async () => {
    const res = await SELF.fetch('https://api.test/v1/sync/push', {
      method: 'POST', body: '{"mutations":[]}',
    });
    expect(res.status).toBe(401);
  });

  it('inserts a new record and assigns a revision', async () => {
    const id = crypto.randomUUID();
    const res = await push([meal(id, '2026-08-14T12:00:00.000Z')]);
    expect(res.status).toBe(200);
    const body = await res.json<{ revision: number; results: { id: string; status: string }[] }>();
    expect(body.results).toEqual([{ id, status: 'applied' }]);
    expect(body.revision).toBeGreaterThan(0);

    const row = await env.DB.prepare('SELECT food_name, portion, is_manual_macro_entry FROM food_entry WHERE id = ?')
      .bind(id).first<{ food_name: string; portion: number; is_manual_macro_entry: number }>();
    expect(row?.food_name).toBe('Chicken breast');
    expect(row?.portion).toBe(220);
    expect(row?.is_manual_macro_entry).toBe(0);
  });

  it('is idempotent when the same mutation is replayed', async () => {
    const id = crypto.randomUUID();
    const mutation = meal(id, '2026-08-14T12:00:00.000Z');
    await push([mutation]);
    await push([mutation]);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM food_entry WHERE id = ?')
      .bind(id).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('applies a newer update and reports an older one as stale', async () => {
    const id = crypto.randomUUID();
    await push([meal(id, '2026-08-14T12:00:00.000Z', 'First')]);
    await push([meal(id, '2026-08-14T13:00:00.000Z', 'Second')]);
    const stale = await push([meal(id, '2026-08-14T11:00:00.000Z', 'Older')]);
    const body = await stale.json<{ results: { status: string }[] }>();
    expect(body.results[0].status).toBe('stale');

    const row = await env.DB.prepare('SELECT food_name FROM food_entry WHERE id = ?')
      .bind(id).first<{ food_name: string }>();
    expect(row?.food_name).toBe('Second');
  });

  it('records a delete as a tombstone rather than removing the row', async () => {
    const id = crypto.randomUUID();
    await push([meal(id, '2026-08-14T12:00:00.000Z')]);
    await push([{ domain: 'food_entry', id, updatedAt: '2026-08-14T14:00:00.000Z', deleted: true, fields: {} }]);
    const row = await env.DB.prepare('SELECT deleted_at FROM food_entry WHERE id = ?')
      .bind(id).first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).toBe('2026-08-14T14:00:00.000Z');
  });

  it('rejects an unknown domain without failing the batch', async () => {
    const goodId = crypto.randomUUID();
    const res = await push([
      { domain: 'trading_trade', id: crypto.randomUUID(), updatedAt: '2026-08-14T12:00:00.000Z', deleted: false, fields: {} },
      meal(goodId, '2026-08-14T12:00:00.000Z'),
    ]);
    const body = await res.json<{ results: { status: string; reason?: string }[] }>();
    expect(body.results[0].status).toBe('rejected');
    expect(body.results[0].reason).toContain('trading_trade');
    expect(body.results[1].status).toBe('applied');
  });

  it('rejects an unknown field without failing the batch', async () => {
    const id = crypto.randomUUID();
    const mutation = meal(id, '2026-08-14T12:00:00.000Z');
    const res = await push([{ ...mutation, fields: { ...mutation.fields, nonsense: 1 } }]);
    const body = await res.json<{ results: { status: string; reason?: string }[] }>();
    expect(body.results[0].status).toBe('rejected');
    expect(body.results[0].reason).toContain('nonsense');
  });

  it('stores JSON fields as text and preserves structure', async () => {
    const id = crypto.randomUUID();
    await push([{
      domain: 'body_stat', id, updatedAt: '2026-08-14T12:00:00.000Z', deleted: false,
      fields: {
        date: '2026-08-14', weight: 87.4,
        segmentalLean: [{ region: 'leftArm', massKg: 3.1, classification: 'Normal' }],
      },
    }]);
    const row = await env.DB.prepare('SELECT segmental_lean FROM body_stat WHERE id = ?')
      .bind(id).first<{ segmental_lean: string }>();
    expect(JSON.parse(row!.segmental_lean)).toEqual([
      { region: 'leftArm', massKg: 3.1, classification: 'Normal' },
    ]);
  });

  it('rejects a batch that is not shaped as {mutations: []}', async () => {
    const res = await SELF.fetch('https://api.test/v1/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nope: true }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- sync-push
```

Expected: FAIL — `/v1/sync/push` returns 404.

- [ ] **Step 3: Write the implementation**

Create `worker/src/sync.ts`:

```ts
import type { Env } from './env';
import { json, error } from './http';
import { SYNC_DOMAINS, ENVELOPE_COLUMNS, type DomainSpec } from './domains';
import { toSnake, toCamel } from './case';
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

const validate = (mutation: unknown): { ok: true; value: Mutation } | { ok: false; reason: string } => {
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
    value: { domain: m.domain, id: m.id, updatedAt: m.updatedAt, deleted: m.deleted === true, fields },
  };
};

const applyMutation = async (db: D1Database, mutation: Mutation): Promise<PushResult> => {
  const spec = SYNC_DOMAINS[mutation.domain];

  const existing = await db
    .prepare(`SELECT updated_at FROM ${spec.table} WHERE id = ?`)
    .bind(mutation.id)
    .first<{ updated_at: string }>();

  // Last-write-wins. Equal timestamps are treated as already-applied, which is
  // what makes an exact replay a no-op instead of a pointless write.
  if (existing && Date.parse(existing.updated_at) >= Date.parse(mutation.updatedAt)) {
    return { id: mutation.id, status: 'stale' };
  }

  const revision = await nextRevision(db);
  const deletedAt = mutation.deleted ? mutation.updatedAt : null;

  const payloadFields = Object.keys(mutation.fields ?? {});
  const columns = ['id', 'revision', 'updated_at', 'deleted_at', ...payloadFields.map(toSnake)];
  const values = [
    mutation.id,
    revision,
    mutation.updatedAt,
    deletedAt,
    ...payloadFields.map((field) => toColumnValue(spec, field, mutation.fields![field])),
  ];

  // Envelope columns are always overwritten; payload columns only when present,
  // so a delete carrying no fields does not blank the record.
  const updates = ['revision = excluded.revision', 'updated_at = excluded.updated_at', 'deleted_at = excluded.deleted_at']
    .concat(payloadFields.map((field) => `${toSnake(field)} = excluded.${toSnake(field)}`));

  await db.prepare(
    `INSERT INTO ${spec.table} (${columns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}`,
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
      const id = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : 'unknown';
      results.push({ id, status: 'rejected', reason: checked.reason });
      continue;
    }
    results.push(await applyMutation(env.DB, checked.value));
  }

  return json(request, env, { revision: await currentRevision(env.DB), results });
};
```

Note the deliberate `INSERT ... ON CONFLICT` shape: a NOT NULL column is only satisfiable if the client sends it on first write, which is correct — a partial first write *should* fail loudly rather than create a half-record.

- [ ] **Step 4: Wire the route**

In `worker/src/index.ts`, add the import:

```ts
import { handleSyncPush } from './sync';
```

and add one branch to the protected-route chain, directly after the `DELETE` device branch:

```ts
    } else if (route === 'POST /v1/sync/push') {
      handler = () => handleSyncPush(request, env);
    }
```

So the chain now reads `if (GET /v1/devices) … else if (DELETE device) … else if (POST
/v1/sync/push) …`, and the `if (!handler) return 404` line stays exactly where it is.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- sync-push
```

Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
cd ..
git add worker/src/sync.ts worker/src/index.ts worker/test/sync-push.spec.ts
git commit -m "feat(worker): sync push with last-write-wins upsert and per-item results"
```

---

## Task 10: Sync pull

**Files:**
- Modify: `worker/src/sync.ts`, `worker/src/index.ts`
- Create: `worker/test/sync-pull.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/test/sync-pull.spec.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

let token = '';

beforeAll(async () => {
  const res = await SELF.fetch('https://api.test/v1/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'test-bootstrap-code', label: 'Pull tests' }),
  });
  token = (await res.json<{ token: string }>()).token;
});

const push = (mutations: unknown[]) =>
  SELF.fetch('https://api.test/v1/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mutations }),
  });

interface PullBody {
  revision: number;
  hasMore: boolean;
  changes: { domain: string; id: string; updatedAt: string; deleted: boolean; fields: Record<string, unknown> }[];
}

const pull = async (since: number, limit?: number): Promise<PullBody> => {
  const url = new URL('https://api.test/v1/sync/pull');
  url.searchParams.set('since', String(since));
  if (limit !== undefined) url.searchParams.set('limit', String(limit));
  const res = await SELF.fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  return res.json<PullBody>();
};

const meal = (id: string, updatedAt: string, foodName: string) => ({
  domain: 'food_entry', id, updatedAt, deleted: false,
  fields: {
    date: '2026-08-14', foodId: 'chicken', foodName, portion: 220,
    calories: 363, protein: 68, carbs: 0, fats: 8,
    mealType: 'lunch', timestamp: updatedAt, isManualMacroEntry: false,
  },
});

describe('GET /v1/sync/pull', () => {
  it('requires authentication', async () => {
    const res = await SELF.fetch('https://api.test/v1/sync/pull?since=0');
    expect(res.status).toBe(401);
  });

  it('returns everything from revision zero', async () => {
    const id = crypto.randomUUID();
    await push([meal(id, '2026-08-14T12:00:00.000Z', 'Chicken breast')]);
    const body = await pull(0);
    const change = body.changes.find((c) => c.id === id);
    expect(change?.domain).toBe('food_entry');
    expect(change?.fields.foodName).toBe('Chicken breast');
    expect(change?.deleted).toBe(false);
  });

  it('returns nothing when the cursor is current', async () => {
    await push([meal(crypto.randomUUID(), '2026-08-14T12:00:00.000Z', 'Anything')]);
    const first = await pull(0);
    const second = await pull(first.revision);
    expect(second.changes).toEqual([]);
    expect(second.revision).toBe(first.revision);
  });

  it('returns only changes after the cursor', async () => {
    const before = await pull(0);
    const id = crypto.randomUUID();
    await push([meal(id, '2026-08-14T15:00:00.000Z', 'Later meal')]);
    const after = await pull(before.revision);
    expect(after.changes.map((c) => c.id)).toEqual([id]);
  });

  it('propagates deletions as tombstones', async () => {
    const id = crypto.randomUUID();
    await push([meal(id, '2026-08-14T12:00:00.000Z', 'Doomed')]);
    const mid = await pull(0);
    await push([{ domain: 'food_entry', id, updatedAt: '2026-08-14T16:00:00.000Z', deleted: true, fields: {} }]);
    const after = await pull(mid.revision);
    const change = after.changes.find((c) => c.id === id);
    expect(change?.deleted).toBe(true);
  });

  it('converts booleans and JSON back to real types', async () => {
    const id = crypto.randomUUID();
    await push([{
      domain: 'body_stat', id, updatedAt: '2026-08-14T12:00:00.000Z', deleted: false,
      fields: {
        date: '2026-08-14', weight: 87.4, needsReview: true,
        segmentalLean: [{ region: 'leftArm', massKg: 3.1 }],
      },
    }]);
    const body = await pull(0);
    const change = body.changes.find((c) => c.id === id);
    expect(change?.fields.needsReview).toBe(true);
    expect(change?.fields.segmentalLean).toEqual([{ region: 'leftArm', massKg: 3.1 }]);
    expect(change?.fields.weight).toBe(87.4);
  });

  it('omits columns the record has no value for', async () => {
    const id = crypto.randomUUID();
    await push([{
      domain: 'body_stat', id, updatedAt: '2026-08-14T12:00:00.000Z', deleted: false,
      fields: { date: '2026-08-14', weight: 87.4 },
    }]);
    const body = await pull(0);
    const change = body.changes.find((c) => c.id === id);
    expect(change?.fields).not.toHaveProperty('notes');
    expect(change?.fields).not.toHaveProperty('segmentalFat');
  });

  it('pages with limit and reports hasMore', async () => {
    const start = await pull(0);
    await push([
      meal(crypto.randomUUID(), '2026-08-14T17:00:00.000Z', 'One'),
      meal(crypto.randomUUID(), '2026-08-14T17:01:00.000Z', 'Two'),
      meal(crypto.randomUUID(), '2026-08-14T17:02:00.000Z', 'Three'),
    ]);

    const page = await pull(start.revision, 2);
    expect(page.changes).toHaveLength(2);
    expect(page.hasMore).toBe(true);

    const lastRevision = page.revision;
    const rest = await pull(lastRevision, 2);
    expect(rest.changes).toHaveLength(1);
    expect(rest.hasMore).toBe(false);
  });

  it('rejects a non-numeric cursor', async () => {
    const res = await SELF.fetch('https://api.test/v1/sync/pull?since=banana', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
  });
});
```

Note: when paging, `revision` in the response is the **highest revision included in this page**, not the global maximum — that is what makes it usable directly as the next cursor.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- sync-pull
```

Expected: FAIL — `/v1/sync/pull` returns 404.

- [ ] **Step 3: Add the implementation**

Append to `worker/src/sync.ts`:

```ts
const DEFAULT_PULL_LIMIT = 500;
const MAX_PULL_LIMIT = 1000;

interface Change {
  domain: string;
  id: string;
  updatedAt: string;
  deleted: boolean;
  revision: number;
  fields: Record<string, unknown>;
}

/** Turn a D1 row into the wire shape, dropping nulls and decoding JSON/booleans. */
const rowToChange = (spec: DomainSpec, row: Record<string, unknown>): Change => {
  const fields: Record<string, unknown> = {};
  const envelope: readonly string[] = ENVELOPE_COLUMNS;

  for (const [column, value] of Object.entries(row)) {
    if (envelope.includes(column)) continue;
    if (value === null) continue;

    const field = toCamel(column);
    if (spec.jsonFields.includes(field)) {
      fields[field] = JSON.parse(value as string);
    } else if (spec.booleanFields.includes(field)) {
      fields[field] = value === 1;
    } else {
      fields[field] = value;
    }
  }

  return {
    domain: spec.name,
    id: row.id as string,
    updatedAt: row.updated_at as string,
    deleted: row.deleted_at !== null,
    revision: row.revision as number,
    fields,
  };
};

export const handleSyncPull = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);

  const sinceParam = url.searchParams.get('since') ?? '0';
  const since = Number(sinceParam);
  if (!Number.isInteger(since) || since < 0) {
    return error(request, env, 400, 'bad_cursor', '`since` must be a non-negative integer.');
  }

  const limitParam = url.searchParams.get('limit');
  const limit = limitParam === null
    ? DEFAULT_PULL_LIMIT
    : Math.min(Math.max(Number(limitParam) || DEFAULT_PULL_LIMIT, 1), MAX_PULL_LIMIT);

  // Over-fetch by one per domain so `hasMore` is exact after the merge.
  const perDomain = limit + 1;
  const collected: Change[] = [];

  for (const spec of Object.values(SYNC_DOMAINS)) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM ${spec.table} WHERE revision > ? ORDER BY revision LIMIT ?`,
    ).bind(since, perDomain).all<Record<string, unknown>>();

    for (const row of results) collected.push(rowToChange(spec, row));
  }

  collected.sort((a, b) => a.revision - b.revision);
  const page = collected.slice(0, limit);
  const hasMore = collected.length > page.length;

  // The cursor is the highest revision actually delivered, so a paged client
  // resumes exactly where it stopped. With nothing new, hold the old cursor.
  const cursor = page.length ? page[page.length - 1].revision : since;

  return json(request, env, {
    revision: hasMore ? cursor : Math.max(cursor, await currentRevision(env.DB)),
    hasMore,
    changes: page.map(({ revision: _revision, ...change }) => change),
  });
};
```

- [ ] **Step 4: Wire the route**

In `worker/src/index.ts`, extend the sync import:

```ts
import { handleSyncPush, handleSyncPull } from './sync';
```

and add one more branch after the push branch:

```ts
    } else if (route === 'GET /v1/sync/pull') {
      handler = () => handleSyncPull(request, env);
    }
```

`route` is built from `url.pathname` only, so the `?since=…` query string does not affect the
match.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS, every suite.

- [ ] **Step 6: Commit**

```bash
cd ..
git add worker/src/sync.ts worker/src/index.ts worker/test/sync-pull.spec.ts
git commit -m "feat(worker): sync pull with revision cursor, tombstones and paging"
```

---

## Task 11: Two-device convergence test

The acceptance criteria are about two devices agreeing. Test that directly rather than trusting the parts.

**Files:**
- Create: `worker/test/convergence.spec.ts`

- [ ] **Step 1: Write the test**

Create `worker/test/convergence.spec.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const tokens: Record<string, string> = {};

const bootstrap = async (label: string) => {
  const res = await SELF.fetch('https://api.test/v1/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'test-bootstrap-code', label }),
  });
  tokens[label] = (await res.json<{ token: string }>()).token;
};

beforeAll(async () => {
  await bootstrap('Phone');
  await bootstrap('PC');
});

const push = (device: string, mutations: unknown[]) =>
  SELF.fetch('https://api.test/v1/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[device]}` },
    body: JSON.stringify({ mutations }),
  });

const pull = async (device: string, since: number) => {
  const res = await SELF.fetch(`https://api.test/v1/sync/pull?since=${since}`, {
    headers: { Authorization: `Bearer ${tokens[device]}` },
  });
  return res.json<{
    revision: number;
    changes: { id: string; deleted: boolean; fields: Record<string, unknown> }[];
  }>();
};

const set = (id: string, updatedAt: string, reps: string) => ({
  domain: 'set_log', id, updatedAt, deleted: false,
  fields: {
    sessionDate: '2026-08-14', exerciseId: 'goblet-squat',
    setIndex: 0, weight: '20', reps, done: true,
  },
});

describe('two-device convergence', () => {
  it('delivers offline writes from the phone to the PC exactly once', async () => {
    const pcStart = await pull('PC', 0);

    // Phone was offline and flushes three queued sets at once.
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await push('Phone', [
      set(ids[0], '2026-08-14T06:00:00.000Z', '8'),
      set(ids[1], '2026-08-14T06:03:00.000Z', '8'),
      set(ids[2], '2026-08-14T06:06:00.000Z', '7'),
    ]);

    const pcAfter = await pull('PC', pcStart.revision);
    expect(pcAfter.changes.map((c) => c.id).sort()).toEqual([...ids].sort());

    // A replay of the same flush must not duplicate anything.
    await push('Phone', [set(ids[0], '2026-08-14T06:00:00.000Z', '8')]);
    const pcReplay = await pull('PC', pcAfter.revision);
    expect(pcReplay.changes).toEqual([]);
  });

  it('converges both devices on the later edit of the same record', async () => {
    const id = crypto.randomUUID();
    await push('Phone', [set(id, '2026-08-14T07:00:00.000Z', '8')]);
    await push('PC', [set(id, '2026-08-14T07:05:00.000Z', '10')]);
    await push('Phone', [set(id, '2026-08-14T07:02:00.000Z', '9')]);

    const phoneView = await pull('Phone', 0);
    const pcView = await pull('PC', 0);
    const fromPhone = phoneView.changes.find((c) => c.id === id);
    const fromPC = pcView.changes.find((c) => c.id === id);

    expect(fromPhone?.fields.reps).toBe('10');
    expect(fromPC?.fields.reps).toBe('10');
  });

  it('propagates a deletion made on one device to the other', async () => {
    const id = crypto.randomUUID();
    await push('PC', [set(id, '2026-08-14T08:00:00.000Z', '8')]);
    const phoneStart = await pull('Phone', 0);
    await push('PC', [{ domain: 'set_log', id, updatedAt: '2026-08-14T08:30:00.000Z', deleted: true, fields: {} }]);

    const phoneAfter = await pull('Phone', phoneStart.revision);
    expect(phoneAfter.changes.find((c) => c.id === id)?.deleted).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npm test -- convergence
```

Expected: PASS, 3 tests. These should pass without new implementation — if any fails, the bug is real and lives in Task 9 or 10. Fix it there.

- [ ] **Step 3: Commit**

```bash
cd ..
git add worker/test/convergence.spec.ts
git commit -m "test(worker): verify two-device convergence and offline flush"
```

---

## Task 12: Deploy and smoke-test

**Files:**
- Create: `worker/README.md`

- [ ] **Step 1: Confirm the whole suite and types are clean**

```bash
npm test
npm run typecheck
```

Expected: all tests PASS, `tsc --noEmit` prints nothing.

- [ ] **Step 2: Deploy**

```bash
npm run migrate:remote
npm run deploy
```

Wrangler prints the deployed URL, e.g. `https://trainright-api.<subdomain>.workers.dev`. Note it — call it `$API` below.

- [ ] **Step 3: Smoke-test the live API**

Substitute your real URL and bootstrap code.

```bash
API=https://trainright-api.<subdomain>.workers.dev

curl -s $API/health
# expect: {"ok":true}

curl -s -X POST $API/v1/auth/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"code":"<YOUR_BOOTSTRAP_CODE>","label":"Smoke test"}'
# expect: {"token":"...","deviceId":"...","label":"Smoke test","scope":"app"}

TOKEN=<paste the token from the previous response>

curl -s -X POST $API/v1/sync/push \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"mutations":[{"domain":"achievement","id":"11111111-1111-1111-1111-111111111111","updatedAt":"2026-08-14T12:00:00.000Z","deleted":false,"fields":{"name":"Smoke test","date":"2026-08-14"}}]}'
# expect: {"revision":1,"results":[{"id":"1111...","status":"applied"}]}

curl -s "$API/v1/sync/pull?since=0" -H "Authorization: Bearer $TOKEN"
# expect the achievement back, with "deleted":false

curl -s $API/v1/sync/pull?since=0
# expect: 401 unauthorized
```

- [ ] **Step 4: Clean up the smoke-test data and device**

```bash
curl -s -X POST $API/v1/sync/push \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"mutations":[{"domain":"achievement","id":"11111111-1111-1111-1111-111111111111","updatedAt":"2026-08-14T12:30:00.000Z","deleted":true,"fields":{}}]}'

curl -s $API/v1/devices -H "Authorization: Bearer $TOKEN"
# find the "Smoke test" device id, then:
curl -s -X DELETE $API/v1/devices/<smoke-test-device-id> -H "Authorization: Bearer $TOKEN"
```

The tombstone stays in the table by design — that is what tells other devices the record is gone.

- [ ] **Step 5: Write `worker/README.md`**

```markdown
# TrainRight API (Phase A1)

Cloudflare Worker + D1 backing the TrainRight PWA. See the design spec at
`docs/superpowers/specs/2026-08-14-lifestyle-tracker-backend-design.md`.

## Commands

    npm test              # Vitest against a local Miniflare + D1
    npm run typecheck     # tsc --noEmit
    npm run dev           # local server on :8787
    npm run migrate:local # apply migrations to the local D1
    npm run migrate:remote# apply migrations to the real D1
    npm run deploy        # publish the Worker

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | none | Liveness |
| `POST /v1/auth/bootstrap` | bootstrap code | Exchange the code for a device token |
| `GET /v1/devices` | bearer | List devices |
| `DELETE /v1/devices/:id` | bearer | Revoke a device |
| `POST /v1/sync/push` | bearer | Apply client mutations |
| `GET /v1/sync/pull?since=N` | bearer | Changes after revision N |

## Secrets

`BOOTSTRAP_CODE` is a Worker secret (`npx wrangler secret put BOOTSTRAP_CODE`).
Local development reads it from `.dev.vars`, which is gitignored. No secret
belongs in `wrangler.toml`.

## Adding a domain (e.g. trading in Phase E)

1. Add the table to a new `migrations/000N_*.sql`, with the four envelope
   columns `id`, `revision`, `updated_at`, `deleted_at` and a revision index.
2. Add one entry to `SYNC_DOMAINS` in `src/domains.ts`.
3. Run `npm test`. `test/domains.spec.ts` fails if any column is unregistered.

No change to `sync.ts` is ever required.
```

- [ ] **Step 6: Commit**

```bash
cd ..
git add worker/README.md
git commit -m "docs(worker): document endpoints, secrets and how to add a domain"
```

---

## Done criteria for A1

- [ ] `npm test` passes in `worker/` — 12 suites.
- [ ] `npm run typecheck` is clean.
- [ ] The Worker is deployed and `/health` responds over the public URL.
- [ ] Bootstrap issues a token; an unauthenticated sync call returns 401.
- [ ] Push then pull round-trips a record, including JSON and boolean fields.
- [ ] Revoking a device makes its next request fail with 401.
- [ ] Nothing under `src/` changed: `git diff --stat main -- src/` is empty.
- [ ] Recurring cost is $0 (Workers and D1 free tiers).

**Next:** Phase A2 — client outbox, repository split, data migration, cutover.
