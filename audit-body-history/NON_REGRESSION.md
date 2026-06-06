# Non-regression — body-composition history feature

**Date:** 2026-06-06
**Verdict:** ✅ No working feature removed. Backward compatibility intact.

## Pre-feature baseline

- Commit on `main` immediately before this change: `99882a0`
- Test suite: **75 / 75 passing** (`npx vitest run`)
- `npx tsc -b` clean
- `npm run build` clean

## Post-feature state

- **Test suite: 81 / 81 passing** (75 prior + 6 new in `safetyRegression.spec.ts`)
- `npx tsc -b` clean
- `npm run build` clean
- Pre-existing tests **not modified** — they pass unchanged

## Schema migration

`BodyStatEntry` was extended additively. Every new field is **optional**.

- Existing stored entries in `localStorage["trainright_body_stats"]` deserialize
  unchanged — the missing fields simply read as `undefined`.
- The `_migrateBodyStatEntry` pass added in commit 99882a0 still runs on every
  `getBodyStats()` read. It handles the legacy renames (`leftArmCirc → leftArm`,
  `rightArmCirc → rightArm`, `leftThigh → thighL`, `rightThigh → thighR`,
  `bfp → bodyFat`). The new InBody fields use new names, so they bypass the
  migration entirely.
- `saveBodyStatEntry`, `deleteBodyStatEntry`, and `updateBodyStatEntry` were not
  changed. Their behaviour is identical.

## UI invariants preserved

- The existing `+ Log Entry` button still opens the form, still pre-fills tape
  measurements from the last entry (the 2026-06-06 BodyStats UX pattern), and
  still clears with the "Clear pre-fill" link. **Untouched.**
- The existing latest-snapshot card still shows Weight / Body Fat / Waist /
  Chest cards. **Untouched.**
- The existing `chartsRef` scroll-to-charts behaviour after save is **preserved
  verbatim**. This was a user/linter addition in the pre-feature state, called
  out in the handoff doc as "must keep". Lines 178 (ref) and 261 (scroll call)
  in the post-feature file.
- The existing weight / body-fat charts render unchanged. The new InBody
  series are appended **after** the existing measurement series — old
  positioning is identical for entries without InBody data.
- The history list still renders one row per entry, with the expand/collapse
  pattern from the 2026-06-06 audit. The detail panel renders the existing
  detail-card grid **first**, then conditionally appends InBody sections only
  when the entry has InBody-style data. Entries without InBody data look
  identical to before.

## Engine invariants preserved

- `_migrateBodyStatEntry` is unchanged.
- The `importTrainRightBackup` legacy importer is unchanged. Its existing tests
  (`imports per-side sets…`, `imports extended body-metric fields…`, etc.) pass
  unchanged.
- `weight === 0` as a legacy skip sentinel in `importTrainRightBackup` is
  preserved — the new importer does **not** touch that code path.
- All safety / readiness / coach engine code paths are untouched. H-02, H-03,
  M-01, M-05, L-04 regression tests pass unchanged.

## Idempotency proof

Verified by `src/__tests__/safetyRegression.spec.ts > InBody assessment import`:

| Test | What it proves |
|---|---|
| `adds a new scan when none exists` | First-import path writes a full row |
| `enriches the existing legacy 26 May entry without duplicating` | Same-day legacy row enriches, doesn't duplicate; legacy id preserved |
| `is idempotent — second import returns "unchanged"` | Re-running the same scan twice produces one row + `action: 'unchanged'` |
| `does not overwrite a user-edited weight` | User-edited `weight` and `bodyFat` survive; other fields enrich around them |
| `preserves importedAt across re-imports` | `importedAt` set on first import, never overwritten |
| `uses a stable id derived from fingerprint` | Same fingerprint → same id, deterministic and reproducible |

## Files touched

| Path | Touch type | Risk |
|---|---|---|
| `src/types/index.ts` | additive (optional fields) | none |
| `src/data/inbodyScans.ts` | new file | none — pure data |
| `src/utils/storage.ts` | added `importBodyAssessment` after `updateBodyStatEntry`; tightened a pre-existing `as BodyStatEntry` cast to `as unknown as BodyStatEntry` to satisfy strict TS | low — cast is semantically identical |
| `src/components/BodyStats.tsx` | added import button, helper components, rich detail panel, chart series, dynamic `unit` on the measurements loop | low — additive UI, gated by `isRichInBody(e)` |
| `src/__tests__/safetyRegression.spec.ts` | added one `describe` block with 6 tests | none — additive test |
| `audit-body-history/*.md` | new docs | none — documentation only |

## Files explicitly NOT touched (per handoff doc)

- `.github/workflows/deploy.yml`, `public/`, `eslint.config.js`, `postcss.config.js`,
  `tailwind.config.js`, `tsconfig.*`, `vitest.config.ts`, `vite.svg`, `App.css`,
  `index.css`, `main.tsx`, `*.bat` files. All show as `M` in `git status` due to
  CRLF normalisation — they are **not** staged for this feature commit.
- Other components (Analytics, ProgramSettings, ErrorBoundary, etc.) — not part
  of this feature scope.

## Manual acceptance checks

Run on the deployed PWA to confirm no UI regression:

- [ ] Body tab loads. Existing entries display unchanged.
- [ ] Tap an entry **without** InBody data → detail panel shows the legacy
      detail-card grid only. No empty "Body Composition" or "Segmental Lean"
      sections appear.
- [ ] Tap "Import 26 May InBody" → alert says "added" (or "enriched" /
      "unchanged" depending on prior state). The 26 May row auto-expands to
      show the full InBody detail panel.
- [ ] The detail panel for 26 May shows the **measured vs added** date
      distinction ("Measured: 26 May 2026 13:13 · Added: 6 Jun 2026").
- [ ] Tap "Import 26 May InBody" a second time → alert says "No change — scan
      is already up to date." No duplicate row appears.
- [ ] The Measurements chart section now includes Skeletal Muscle, Body Fat
      Mass, Fat-Free Mass, Total Body Water, InBody Score, BMR, Visceral Fat
      Level, BMI as single-point charts.
- [ ] The 3 June weight (82.5 kg) is still graphed as a single weight point.
      No other metric chart accidentally includes 3 June.
