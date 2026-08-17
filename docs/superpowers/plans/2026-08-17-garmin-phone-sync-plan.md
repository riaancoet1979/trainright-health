# Garmin Phone Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `garmin_sync.py` pushes each day's Garmin metrics into the deployed sync Worker as a new `garmin_daily` domain, so RHR/HRV/sleep/body-battery/etc. reach the phone through the same pipe the rest of the app already uses — closing the gap left by `fa625b6`'s privacy fix.

**Architecture:** One new apply-only domain. The Worker gets a new D1 table + registry entry (generic — it doesn't know or care who writes to it). The browser's `apply.ts` gains one case that merges incoming `garmin_daily` changes into the existing `health_metrics_v1` shape, so `HealthDashboard.tsx` needs zero changes. Python gets its own paired device (scope `ingest`) and pushes after every local sync, chunked at 200 mutations, never blocking the local `gh-sync.json` write on failure.

**Tech Stack:** Cloudflare D1 (SQL migration), TypeScript (Worker + client, existing patterns only), Python + `requests` (already a transitive dependency via `garminconnect`, no new pip install).

**Depends on:** Phase A1 (deployed Worker) and Phase A2 (deployed client sync) — both live at `https://trainright-api.lifestyleapp.workers.dev`.

**Source spec:** [docs/superpowers/specs/2026-08-17-garmin-phone-sync-design.md](../specs/2026-08-17-garmin-phone-sync-design.md)

---

## Ground rules

1. **Never run `npm audit fix`; never modify `.npmrc`.**
2. **`git add` explicit paths only** — this repo has persistent CRLF noise; never `git add -A`.
3. Worker commands run from `worker/`; everything else from the repo root.
4. No changes to `HealthDashboard.tsx`, the existing `daily_steps` browser-absorption path, or `src/data/program.ts`.
5. The 500-mutation and 2,000,000-byte push caps (`worker/src/sync.ts:129,171`) are real, already-hit-once limits (see the 2026-08-14 batch-cap incident). Respect them from the first line of Python code that calls the endpoint, not after something breaks.

---

## Task 1: Worker — `garmin_daily` domain

**Files:**
- Create: `worker/migrations/0002_garmin_daily.sql`
- Modify: `worker/src/domains.ts`, `worker/test/schema.spec.ts`

- [ ] **Step 1: Write the failing test**

Edit `worker/test/schema.spec.ts` — add `'garmin_daily'` to `EXPECTED_TABLES`, alphabetically between `food_entry` and `legacy_blob`:

```ts
const EXPECTED_TABLES = [
  'achievement', 'body_metric', 'body_stat', 'custom_food', 'daily_steps',
  'device', 'exercise', 'exercise_log', 'food_entry', 'garmin_daily', 'legacy_blob',
  'meta', 'pushup_set', 'session_log', 'set_log', 'user_settings',
];
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd worker
npx vitest run schema
```

Expected: FAIL — actual table list is missing `garmin_daily`.

- [ ] **Step 3: Write the migration**

Create `worker/migrations/0002_garmin_daily.sql`. Column names are `toSnake()` of the `DayHealth`
interface fields in `src/utils/health.ts:22-60`, verified by hand (no back-to-back-capital edge
cases like `smiKgM2` here, so the mechanical conversion is unambiguous):

```sql
-- One row per calendar date. Written only by garmin_sync.py (scope 'ingest');
-- the browser only ever pulls this domain, never writes it — see domains.ts.
CREATE TABLE garmin_daily (
  id                          TEXT PRIMARY KEY,
  revision                    INTEGER NOT NULL,
  updated_at                  TEXT NOT NULL,
  deleted_at                  TEXT,
  source                      TEXT,
  steps                       REAL,
  step_goal                   REAL,
  distance_km                 REAL,
  total_calories               REAL,
  active_calories              REAL,
  bmr_calories                 REAL,
  rhr                          REAL,
  min_heart_rate                REAL,
  max_heart_rate                REAL,
  hrv                          REAL,
  hrv_weekly_avg                 REAL,
  hrv_status                    TEXT,
  sleep_hours                   REAL,
  sleep_score                   REAL,
  deep_sleep_hours                REAL,
  light_sleep_hours               REAL,
  rem_sleep_hours                REAL,
  awake_sleep_hours               REAL,
  average_sleep_stress              REAL,
  average_stress                 REAL,
  stress_qualifier                TEXT,
  body_battery_wake                REAL,
  body_battery_high                REAL,
  body_battery_low                 REAL,
  body_battery_latest               REAL,
  body_battery_charged              REAL,
  body_battery_drained               REAL,
  average_spo2                  REAL,
  lowest_spo2                   REAL,
  average_respiration               REAL,
  moderate_intensity_minutes           REAL,
  vigorous_intensity_minutes           REAL,
  floors_ascended                 REAL,
  sedentary_hours                 REAL,
  active_hours                  REAL,
  garmin_details                 TEXT
);
CREATE INDEX idx_garmin_daily_revision ON garmin_daily (revision);
```

(Column whitespace above is cosmetic only — SQLite doesn't care; keep it readable, don't chase
alignment by hand if it drifts.)

- [ ] **Step 4: Register the domain**

Append to `worker/src/domains.ts`, inside `SYNC_DOMAINS`, after `legacy_blob`:

```ts
  // Apply-only from the browser's perspective: only garmin_sync.py (device
  // scope 'ingest') ever pushes this domain. Field list mirrors DayHealth in
  // src/utils/health.ts:22-60 exactly.
  garmin_daily: domain(
    'garmin_daily',
    ['source', 'steps', 'stepGoal', 'distanceKm', 'totalCalories', 'activeCalories',
     'bmrCalories', 'rhr', 'minHeartRate', 'maxHeartRate', 'hrv', 'hrvWeeklyAvg',
     'hrvStatus', 'sleepHours', 'sleepScore', 'deepSleepHours', 'lightSleepHours',
     'remSleepHours', 'awakeSleepHours', 'averageSleepStress', 'averageStress',
     'stressQualifier', 'bodyBatteryWake', 'bodyBatteryHigh', 'bodyBatteryLow',
     'bodyBatteryLatest', 'bodyBatteryCharged', 'bodyBatteryDrained', 'averageSpo2',
     'lowestSpo2', 'averageRespiration', 'moderateIntensityMinutes',
     'vigorousIntensityMinutes', 'floorsAscended', 'sedentaryHours', 'activeHours',
     'garminDetails'],
    { json: ['garminDetails'] },
  ),
```

- [ ] **Step 5: Run the schema test**

```bash
npx vitest run schema
```

Expected: PASS, 3 tests (the migration hasn't been applied to the local test DB yet — the
`vitest.config.ts` setup reads `migrations/` fresh on every run via `readD1Migrations`, so no
extra step is needed; it picks up `0002_garmin_daily.sql` automatically).

- [ ] **Step 6: Run the domain registry guard test**

```bash
npx vitest run domains
```

Expected: PASS. This is the test that already exists and fails the build if a column is
registered without a matching table column, or vice versa — it now also covers `garmin_daily`
automatically, no changes needed to `worker/test/domains.spec.ts` itself.

- [ ] **Step 7: Run the full worker suite and typecheck**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: all pass, clean.

- [ ] **Step 8: Commit**

```bash
cd ..
git add worker/migrations/0002_garmin_daily.sql worker/src/domains.ts worker/test/schema.spec.ts
git commit -m "feat(worker): add garmin_daily domain"
```

---

## Task 2: Client — `apply.ts` merges `garmin_daily` into `health_metrics_v1`

`garmin_daily` is deliberately **not** added to `src/sync/shred.ts`'s `STORE_KEYS`. The browser
never originates this domain, so it must never be captured outbound. `writeStore()` already
handles an untracked key correctly (`src/sync/writeStore.ts` — `TRACKED.has(key)` is false, so it
falls through to a plain `localStorage.setItem`, no diff, no enqueue), so no changes are needed
there at all.

**Files:**
- Modify: `src/sync/apply.ts`
- Modify: `src/__tests__/syncApply.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/syncApply.spec.ts`:

```ts
describe('applyChanges — garmin_daily', () => {
  const garminChange = (id: string, over: Partial<Change> = {}): Change => ({
    domain: 'garmin_daily', id, updatedAt: '2026-08-17T06:30:00.000Z', deleted: false,
    fields: { source: 'garmin_connect', steps: 8421, rhr: 58, hrv: 47, sleepHours: 7.2 },
    ...over,
  });

  it('creates a health_metrics_v1 day the dashboard can read', async () => {
    await applyChanges([garminChange('2026-08-16')]);
    const stored = JSON.parse(localStorage.getItem('health_metrics_v1')!);
    expect(stored.days['2026-08-16']).toMatchObject({ steps: 8421, rhr: 58, hrv: 47 });
  });

  it('replaces the whole day on a second push rather than merging fields', async () => {
    await applyChanges([garminChange('2026-08-16')]);
    await applyChanges([garminChange('2026-08-16', {
      fields: { source: 'garmin_connect', steps: 9000 },
    })]);
    const stored = JSON.parse(localStorage.getItem('health_metrics_v1')!);
    expect(stored.days['2026-08-16']).toEqual({ source: 'garmin_connect', steps: 9000 });
  });

  it('removes the day on a tombstone', async () => {
    await applyChanges([garminChange('2026-08-16')]);
    await applyChanges([garminChange('2026-08-16', { deleted: true, fields: {} })]);
    const stored = JSON.parse(localStorage.getItem('health_metrics_v1')!);
    expect(stored.days).not.toHaveProperty('2026-08-16');
  });

  it('preserves other HealthMetrics fields untouched', async () => {
    localStorage.setItem('health_metrics_v1', JSON.stringify({
      syncedAt: '2026-08-17T06:00:00.000Z',
      days: { '2026-08-15': { steps: 5000 } },
      dateRange: { start: '2026-07-17', end: '2026-08-17' },
    }));
    await applyChanges([garminChange('2026-08-16')]);
    const stored = JSON.parse(localStorage.getItem('health_metrics_v1')!);
    expect(stored.syncedAt).toBe('2026-08-17T06:00:00.000Z');
    expect(stored.dateRange).toEqual({ start: '2026-07-17', end: '2026-08-17' });
    expect(stored.days['2026-08-15']).toEqual({ steps: 5000 });
    expect(stored.days['2026-08-16']).toMatchObject({ steps: 8421 });
  });

  it('never queues what it applies', async () => {
    await applyChanges([garminChange('2026-08-16')]);
    await flush();
    expect(await listPending()).toEqual([]);
  });
});
```

This file already imports `applyChanges`, `Change`, `listPending`, `clearOutbox`, and a `flush`
helper from earlier tests in the same file — reuse them, don't reimport.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run syncApply
```

Expected: FAIL — `garmin_daily` isn't in `STORE_OF`, so `applyChanges` silently drops the change
(`storeKey` is `undefined`, the loop `continue`s) and `health_metrics_v1` is never written.

- [ ] **Step 3: Widen the type and add the merge case**

In `src/sync/apply.ts`, change the import and add a widened type alongside the existing ones:

```ts
import type { Change } from './types';
import { writeStore, setSuppressCapture } from './writeStore';
import { STORE_KEYS, type StoreKey } from './shred';

/**
 * health_metrics_v1 is deliberately NOT in shred.ts's STORE_KEYS — the browser
 * never originates garmin_daily changes, only garmin_sync.py does. Widening the
 * type here (rather than adding it to STORE_KEYS) keeps writeStore() treating it
 * as untracked: a plain localStorage.setItem, no diff, no outbound capture.
 * Kept as a literal, not imported from utils/health.ts, to preserve the existing
 * one-way dependency direction (utils/ -> sync/, never the reverse).
 */
type ApplyTargetKey = StoreKey | 'health_metrics_v1';
```

Widen `STORE_OF` and add the new entry:

```ts
const STORE_OF: Record<string, ApplyTargetKey> = {
  food_entry: 'nutrition_tracker_daily_entries',
  exercise: 'nutrition_tracker_daily_entries',
  pushup_set: 'nutrition_tracker_daily_entries',
  daily_steps: 'nutrition_tracker_daily_entries',
  custom_food: 'nutrition_tracker_custom_foods',
  achievement: 'nutrition_tracker_achievements',
  body_stat: 'trainright_body_stats',
  user_settings: 'nutrition_tracker_user_settings',
  session_log: 'health_training_v1',
  exercise_log: 'health_training_v1',
  set_log: 'health_training_v1',
  body_metric: 'health_training_v1',
  legacy_blob: 'health_training_v1',
  garmin_daily: 'health_metrics_v1',
};
```

Add the merge function near the other `applyTo*` functions (after `applyToUserSettings`):

```ts
/**
 * garmin_sync.py always sends the full day object, never a partial patch, so
 * this replaces the whole day rather than merging field-by-field — matching
 * how body_metric already treats a record as replace-whole-object-by-id.
 */
const applyToHealthMetrics = (store: unknown, change: Change): unknown => {
  const current: Record<string, unknown> = isObject(store) ? { ...store } : { syncedAt: null, days: {} };
  const days: Record<string, unknown> = isObject(current.days) ? { ...current.days } : {};

  if (change.deleted) {
    delete days[change.id];
  } else {
    days[change.id] = change.fields;
  }

  current.days = days;
  return current;
};
```

Update the dispatch and the two `Map`/`Set` type parameters inside `applyChanges`:

```ts
export const applyChanges = async (changes: Change[]): Promise<void> => {
  if (!changes.length) return;

  const touched = new Map<ApplyTargetKey, unknown>();
  for (const key of STORE_KEYS) touched.set(key, read(key));

  const changedStores = new Set<ApplyTargetKey>();

  for (const change of changes) {
    const storeKey = STORE_OF[change.domain];
    if (!storeKey) continue;
    changedStores.add(storeKey);
    const current = touched.get(storeKey);

    if (storeKey === 'nutrition_tracker_daily_entries') {
      touched.set(storeKey, applyToDailyEntries(current, change));
    } else if (storeKey === 'health_training_v1') {
      touched.set(storeKey, applyToTraining(current, change));
    } else if (storeKey === 'nutrition_tracker_user_settings') {
      touched.set(storeKey, applyToUserSettings(current, change));
    } else if (storeKey === 'health_metrics_v1') {
      touched.set(storeKey, applyToHealthMetrics(current, change));
    } else {
      touched.set(storeKey, applyToArrayStore(current, change));
    }
  }

  setSuppressCapture(true);
  try {
    for (const key of changedStores) {
      const value = touched.get(key);
      if (value === undefined) continue;
      await writeStore(key, value);
    }
  } finally {
    setSuppressCapture(false);
  }
};
```

(`writeStore('health_metrics_v1', value)` hits the untracked branch — see the note above the
type alias. No change to `writeStore.ts` is needed or correct.)

- [ ] **Step 4: Run the tests**

```bash
npx vitest run syncApply
```

Expected: PASS, all tests including the 5 new ones.

- [ ] **Step 5: Run the full client suite, typecheck, build**

```bash
cd ..
npx vitest run
npx tsc -b
npm run build
```

Expected: all pass — this must not regress any of the ~280 existing tests.

- [ ] **Step 6: Commit**

```bash
git add src/sync/apply.ts src/__tests__/syncApply.spec.ts
git commit -m "feat(sync): apply garmin_daily changes into health_metrics_v1"
```

---

## Task 3: Python — one-time device pairing (`--bootstrap-sync`)

Interactive-only, mirroring exactly how `--login` already works — **never called from `main()`**,
so the scheduled 06:30 run can never hit an interactive prompt (that exact failure mode is what
took down the old CI cron; see the 2026-08-17 investigation).

**Files:**
- Modify: `garmin_sync.py`
- Modify: `tests/test_garmin_sync.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_garmin_sync.py`:

```python
class GarminSyncBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.token_file = os.path.join(self.tmp_dir, "trainright_sync_token.txt")
        patcher = patch("garmin_sync.SYNC_TOKEN_FILE", self.token_file)
        self.addCleanup(patcher.stop)
        patcher.start()

    def test_bootstrap_sync_saves_token_on_success(self):
        response = unittest.mock.Mock(status_code=200)
        response.json.return_value = {"token": "tok_abc123", "deviceId": "d1"}
        with patch("garmin_sync.getpass.getpass", return_value="the-bootstrap-code"), \
             patch("garmin_sync.requests.post", return_value=response) as post:
            garmin_sync.bootstrap_sync()

        self.assertTrue(os.path.isfile(self.token_file))
        with open(self.token_file, encoding="utf-8") as f:
            self.assertEqual(f.read().strip(), "tok_abc123")
        called_url, called_kwargs = post.call_args[0][0], post.call_args[1]
        self.assertTrue(called_url.endswith("/v1/auth/bootstrap"))
        self.assertEqual(called_kwargs["json"]["scope"], "ingest")
        self.assertEqual(called_kwargs["json"]["code"], "the-bootstrap-code")

    def test_bootstrap_sync_does_not_save_a_token_on_rejection(self):
        response = unittest.mock.Mock(status_code=401)
        response.json.return_value = {"error": {"code": "bad_code", "message": "Bootstrap code rejected."}}
        with patch("garmin_sync.getpass.getpass", return_value="wrong"), \
             patch("garmin_sync.requests.post", return_value=response):
            with self.assertRaises(RuntimeError):
                garmin_sync.bootstrap_sync()

        self.assertFalse(os.path.isfile(self.token_file))
```

Add two new imports at the top of the test file — `from unittest.mock import patch` already
exists (line 6), leave it as-is:

```python
import unittest.mock

import garmin_sync
```

(`garmin_sync` as a module import is new — the existing tests only import specific names via
`from garmin_sync import ...`. Add the module import alongside that line, not instead of it —
both forms are used: the module import for `patch("garmin_sync.X", ...)` targets, the named
imports for the existing tests that call `extract_day` etc. directly.)

- [ ] **Step 2: Run it and watch it fail**

```bash
python -m pytest tests/test_garmin_sync.py -k Bootstrap -q
```

Expected: FAIL — `garmin_sync.bootstrap_sync` and `garmin_sync.SYNC_TOKEN_FILE` don't exist yet.

- [ ] **Step 3: Add `requests`, the token path, and `bootstrap_sync()`**

In `garmin_sync.py`, add the import near the top (after the existing `try/except` for
`garminconnect`):

```python
import requests
```

Add near `TOKEN_DIR` (same section, so the two paths are visually grouped):

```python
# Same protected directory Garmin's own tokens live in — never inside the repo,
# never served by the app. A device token for pushing into the sync Worker,
# separate from anything the browser holds.
SYNC_TOKEN_FILE = os.path.join(TOKEN_DIR, "trainright_sync_token.txt")
# Matches API_BASE in src/sync/config.ts — keep the two in sync if either changes.
API_BASE = "https://trainright-api.lifestyleapp.workers.dev"
```

Add `bootstrap_sync()` near `login()`:

```python
def bootstrap_sync() -> None:
    """One-time pairing so this script can push into the sync Worker. Manual
    only — never called from main(), so the scheduled run can never hit this
    interactive prompt."""
    import getpass
    code = getpass.getpass("Bootstrap code: ")
    response = requests.post(
        f"{API_BASE}/v1/auth/bootstrap",
        json={"code": code, "label": "Garmin Sync (Python)", "scope": "ingest"},
        timeout=15,
    )
    if response.status_code != 200:
        body = response.json() if response.content else {}
        message = (body.get("error") or {}).get("message", f"HTTP {response.status_code}")
        raise RuntimeError(f"Bootstrap failed: {message}")

    token = response.json()["token"]
    os.makedirs(os.path.dirname(SYNC_TOKEN_FILE), exist_ok=True)
    with open(SYNC_TOKEN_FILE, "w", encoding="utf-8") as f:
        f.write(token)
    print(f"Sync device paired — token saved to {SYNC_TOKEN_FILE}")
```

- [ ] **Step 4: Wire the CLI flag**

At the bottom of `garmin_sync.py`, change:

```python
if __name__ == "__main__":
    if "--login" in sys.argv:
        login()
    else:
        main()
```

to:

```python
if __name__ == "__main__":
    if "--login" in sys.argv:
        login()
    elif "--bootstrap-sync" in sys.argv:
        bootstrap_sync()
    else:
        main()
```

- [ ] **Step 5: Update the module docstring**

In the `Setup (once):` section at the top of the file, add a line after the `--login` line:

```
    python garmin_sync.py --bootstrap-sync  (pairs this script with the sync
                                              Worker so it can push into it;
                                              asks for the bootstrap code once)
```

- [ ] **Step 6: Run the tests**

```bash
python -m pytest tests/test_garmin_sync.py -q
```

Expected: PASS, all tests including the 2 new ones (13 total).

- [ ] **Step 7: Commit**

```bash
git add garmin_sync.py tests/test_garmin_sync.py
git commit -m "feat(garmin): add --bootstrap-sync for pairing with the sync Worker"
```

---

## Task 4: Python — push each day's metrics after sync

**Files:**
- Modify: `garmin_sync.py`
- Modify: `tests/test_garmin_sync.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_garmin_sync.py`:

```python
class GarminSyncPushTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.token_file = os.path.join(self.tmp_dir, "trainright_sync_token.txt")
        patcher = patch("garmin_sync.SYNC_TOKEN_FILE", self.token_file)
        self.addCleanup(patcher.stop)
        patcher.start()

    def _write_token(self, token="tok_test"):
        with open(self.token_file, "w", encoding="utf-8") as f:
            f.write(token)

    def test_skips_silently_with_no_token(self):
        with patch("garmin_sync.requests.post") as post:
            garmin_sync.push_garmin_daily({"2026-08-16": {"steps": 100}}, "2026-08-17T06:30:00")
        post.assert_not_called()

    def test_pushes_one_mutation_per_day_with_the_right_shape(self):
        self._write_token()
        response = unittest.mock.Mock(status_code=200)
        response.json.return_value = {"revision": 1, "results": [{"id": "2026-08-16", "status": "applied"}]}
        with patch("garmin_sync.requests.post", return_value=response) as post:
            garmin_sync.push_garmin_daily({"2026-08-16": {"steps": 100, "rhr": 55}}, "2026-08-17T06:30:00")

        post.assert_called_once()
        url, kwargs = post.call_args[0][0], post.call_args[1]
        self.assertTrue(url.endswith("/v1/sync/push"))
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer tok_test")
        mutation = kwargs["json"]["mutations"][0]
        self.assertEqual(mutation["domain"], "garmin_daily")
        self.assertEqual(mutation["id"], "2026-08-16")
        self.assertEqual(mutation["deleted"], False)
        self.assertEqual(mutation["fields"], {"steps": 100, "rhr": 55})
        self.assertEqual(mutation["updatedAt"], "2026-08-17T06:30:00")

    def test_chunks_at_200_mutations_per_request(self):
        self._write_token()
        fake_days = {f"2020-01-{i:02d}" if i <= 31 else f"2020-02-{i - 31:02d}": {"steps": i} for i in range(1, 451)}
        response = unittest.mock.Mock(status_code=200)
        response.json.return_value = {"revision": 1, "results": []}

        with patch("garmin_sync.requests.post", return_value=response) as post:
            garmin_sync.push_garmin_daily(fake_days, "2026-08-17T06:30:00")

        sizes = [len(call.kwargs["json"]["mutations"]) for call in post.call_args_list]
        self.assertGreater(len(sizes), 1)
        self.assertTrue(all(size <= 200 for size in sizes))
        self.assertEqual(sum(sizes), 450)

    def test_a_failed_request_does_not_raise(self):
        self._write_token()
        with patch("garmin_sync.requests.post", side_effect=requests.RequestException("offline")):
            try:
                garmin_sync.push_garmin_daily({"2026-08-16": {"steps": 100}}, "2026-08-17T06:30:00")
            except Exception as exc:  # noqa: BLE001 - this is exactly what must not happen
                self.fail(f"push_garmin_daily raised {exc!r}; it must never block the local write")

    def test_a_rejected_day_does_not_stop_the_rest_of_the_batch(self):
        self._write_token()
        response = unittest.mock.Mock(status_code=200)
        response.json.return_value = {
            "revision": 1,
            "results": [
                {"id": "2026-08-15", "status": "rejected", "reason": "bad field"},
                {"id": "2026-08-16", "status": "applied"},
            ],
        }
        with patch("garmin_sync.requests.post", return_value=response):
            # Must not raise even though one day was rejected server-side.
            garmin_sync.push_garmin_daily(
                {"2026-08-15": {"steps": 1}, "2026-08-16": {"steps": 2}}, "2026-08-17T06:30:00",
            )
```

Add `import requests` to the test file's imports too, since `test_a_failed_request_does_not_raise`
references `requests.RequestException`.

- [ ] **Step 2: Run it and watch it fail**

```bash
python -m pytest tests/test_garmin_sync.py -k Push -q
```

Expected: FAIL — `garmin_sync.push_garmin_daily` doesn't exist yet.

- [ ] **Step 3: Write `push_garmin_daily`**

Add to `garmin_sync.py`, after `bootstrap_sync()`:

```python
PUSH_BATCH_SIZE = 200  # Server caps a single push at 500 mutations; chunk well under it.


def _read_sync_token():
    if not os.path.isfile(SYNC_TOKEN_FILE):
        return None
    with open(SYNC_TOKEN_FILE, encoding="utf-8") as f:
        token = f.read().strip()
    return token or None


def push_garmin_daily(days: dict, synced_at: str) -> None:
    """Push each day as a garmin_daily mutation. Never raises — a push failure
    must never prevent gh-sync.json from having already been written; the next
    scheduled run is the retry, since Garmin is re-queried fresh every time."""
    token = _read_sync_token()
    if not token:
        print("Sync push skipped: not paired. Run: python garmin_sync.py --bootstrap-sync")
        return

    mutations = [
        {"domain": "garmin_daily", "id": day, "updatedAt": synced_at, "deleted": False, "fields": fields}
        for day, fields in days.items()
    ]

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    pushed = 0
    try:
        for i in range(0, len(mutations), PUSH_BATCH_SIZE):
            batch = mutations[i:i + PUSH_BATCH_SIZE]
            response = requests.post(
                f"{API_BASE}/v1/sync/push", headers=headers, json={"mutations": batch}, timeout=30,
            )
            if response.status_code != 200:
                print(f"Sync push failed: HTTP {response.status_code}")
                return
            results = response.json().get("results", [])
            rejected = [r for r in results if r.get("status") == "rejected"]
            for r in rejected:
                print(f"Sync push: {r.get('id')} rejected — {r.get('reason')}")
            pushed += len(batch) - len(rejected)
    except requests.RequestException as exc:
        print(f"Sync push failed: {type(exc).__name__}: {exc}")
        return

    print(f"Sync push: {pushed}/{len(mutations)} day(s) pushed to the phone/PC sync.")
```

- [ ] **Step 4: Wire it into `main()`**

Per spec §5, only `out` (the day-level metrics dict) is pushed — `activities_raw`, `body_raw`,
`training_raw`, `fitness_age_raw`, and `max_metrics_raw` (all already gathered earlier in `main()`
for the local `gh-sync.json` payload) are deliberately never passed to `push_garmin_daily`.

In `main()`, after `write_json_transaction(out_files, payload)` and its `print(f"Wrote...")` loop
— i.e. as the last thing `main()` does, so a push failure can only ever happen after the local
files are already safely written:

```python
    for out_file in out_files:
        print(f"Wrote {out_file}")
    print(f"\n{len(out)} days synced. Open the app to absorb it.")
    push_garmin_daily(out, payload["syncedAt"])
```

- [ ] **Step 5: Run the tests**

```bash
python -m pytest tests/test_garmin_sync.py -q
```

Expected: PASS, all tests (18 total: 11 original + 2 bootstrap + 5 push).

- [ ] **Step 6: Commit**

```bash
git add garmin_sync.py tests/test_garmin_sync.py
git commit -m "feat(garmin): push daily metrics into the sync Worker after every run"
```

---

## Task 5: Deploy and verify end to end

- [ ] **Step 1: Full pre-deploy verification**

```bash
cd worker && npx vitest run && npx tsc --noEmit && cd ..
npx vitest run
npx tsc -b
npm run build
python -m pytest tests/test_garmin_sync.py -q
```

Expected: everything green.

- [ ] **Step 2: Apply the migration to the real database**

```bash
cd worker
npx wrangler d1 migrations apply trainright --remote
```

Expected: `0002_garmin_daily.sql` applied successfully.

- [ ] **Step 3: Deploy the Worker**

```bash
npx wrangler deploy
```

- [ ] **Step 4: Smoke-test the new table directly**

```bash
npx wrangler d1 execute trainright --remote --command "SELECT COUNT(*) AS n FROM garmin_daily" --json
```

Expected: `{"n": 0}` — table exists, empty, no error.

- [ ] **Step 5: Push and deploy the client**

```bash
cd ..
git push origin main
```

Wait for CI (watch with `gh run list --branch main --limit 3`, don't grep the minified bundle for
strings — confirm via `gh run list` succeeding, then hash-match the deployed
`assets/index-*.js` against a fresh local `npm run build` if a stronger check is wanted).

- [ ] **Step 6: Pair the Python script — this is the user's step, not automatable**

The bootstrap code is a secret this plan's author should not see. Hand off explicitly:

```
cd "c:\Users\ACER\Claude Cowork\Health app"
python garmin_sync.py --bootstrap-sync
```

Enter the same bootstrap code used to pair the PC and phone. Expected output:
`Sync device paired — token saved to ...\trainright_sync_token.txt`.

- [ ] **Step 7: Run a real sync and verify data lands**

```bash
python garmin_sync.py
```

Expected: writes `gh-sync.json` as always, then prints
`Sync push: N/32 day(s) pushed to the phone/PC sync.` with N close to 32 (some early days may
have no Garmin data at all, which is normal).

Then verify server-side:

```bash
cd worker
npx wrangler d1 execute trainright --remote --command "SELECT COUNT(*) AS n FROM garmin_daily" --json
```

Expected: `n` close to 32, not 0.

- [ ] **Step 8: Verify on the phone**

Open the app on the phone (hard-refresh if needed — pull to refresh in the browser, then reopen
the home-screen icon). Go to the Health tab. Expected: RHR/HRV/sleep/body-battery numbers for
recent days, not just steps.

- [ ] **Step 9: List the new device alongside PC and Phone**

```bash
npx wrangler d1 execute trainright --remote --command "SELECT label, scope FROM device WHERE revoked_at IS NULL" --json
```

Expected: three active devices — PC, Phone, and "Garmin Sync (Python)" with `scope: "ingest"`.

- [ ] **Step 10: Verify a push failure never blocks the local write**

This is the one property that can't be proven by a unit test alone (it depends on `main()`'s
statement order, not just `push_garmin_daily`'s internals) — verify it for real, once:

```bash
mv "$USERPROFILE/AppData/Local/hermes/private/garminconnect/trainright_sync_token.txt" \
   "$USERPROFILE/AppData/Local/hermes/private/garminconnect/trainright_sync_token.txt.bak"
python garmin_sync.py
```

Expected: `Wrote .../gh-sync.json` still prints, then
`Sync push skipped: not paired. Run: python garmin_sync.py --bootstrap-sync` — the run succeeds
end to end despite the "missing token" condition. Then restore it:

```bash
mv "$USERPROFILE/AppData/Local/hermes/private/garminconnect/trainright_sync_token.txt.bak" \
   "$USERPROFILE/AppData/Local/hermes/private/garminconnect/trainright_sync_token.txt"
```

---

## Done criteria

- [ ] `npx vitest run` (worker + client), `npx tsc -b`/`npx tsc --noEmit`, `npm run build`, and
      `python -m pytest tests/test_garmin_sync.py` all pass.
- [ ] `garmin_daily` table exists in remote D1 with data in it after a real sync run.
- [ ] HealthDashboard on the phone shows RHR/HRV/sleep data, not just steps.
- [ ] A push failure (verified by temporarily renaming the token file) does not prevent
      `gh-sync.json` from being written.
- [ ] No changes to `HealthDashboard.tsx`, `src/sync/shred.ts`, `src/sync/writeStore.ts`, or
      `src/data/program.ts`.
