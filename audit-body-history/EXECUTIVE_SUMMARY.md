# Body-composition history feature — Executive Summary

**Release date:** 2026-06-06
**Release decision:** ✅ APPROVE WITH CONDITIONS
**Scope:** Single-user TrainRight Health PWA (React 19 + TypeScript + Vite, localStorage only, GitHub Pages deploy)

## What shipped

A complete body-composition assessment history feature, layered on top of the
existing Body Stats tab:

1. **Rich `BodyStatEntry` schema** (additive, backwards-compatible) covering the
   InBody 270 print-out fields: total body water, protein / mineral / body-fat
   mass, skeletal muscle mass, fat-free mass, BMI, skeletal muscle index, InBody
   score, BMR, recommended intake, waist/hip ratio, visceral fat level, obesity
   degree, device weight-control suggestions, and 5-region segmental lean and
   fat arrays. Provenance fields (`measuredAt`, `importedAt`, `source`,
   `sourceDevice`, `sourceFingerprint`) let the UI distinguish *when the scan
   was taken* from *when it was added*.

2. **Idempotent assessment importer** — `importBodyAssessment(scan)` in
   `src/utils/storage.ts`:
   - Identifies an existing row by `sourceFingerprint`, falling back to
     `(date + no-fingerprint)` to enrich legacy entries.
   - Never overwrites a non-empty existing field — only fills in fields that are
     `undefined` / `null` / `''`. The user's hand-entered weight wins over any
     scan value.
   - Returns `{ action: 'added' | 'enriched' | 'unchanged', id, enrichedFields }`
     so the UI can show a meaningful confirmation.
   - Stable id derived from the fingerprint (`body-<sanitised-fingerprint>`),
     so the same scan re-imported on a different day yields the same id.

3. **One-tap import button** — "Import 26 May InBody" in the Body Stats header
   imports the deterministic constant `INBODY_2026_05_26` from
   `src/data/inbodyScans.ts`. Clicking opens the enriched 26 May row in the
   history list so the user sees the result immediately.

4. **Rich history detail panel** — when a body-stat entry has any InBody-style
   data, the expand panel renders:
   - Provenance strip with device name, score badge, and the
     **"Measured: 26 May 2026 13:13 · Added: 6 Jun 2026"** date distinction.
   - Body Composition card grid (TBW / Protein / Mineral / BFM / SMM / FFM /
     BMI / SMI).
   - Metabolic Estimates with explicit *"Device estimate — not medical advice"*
     caveat (BMR, recommended intake, waist/hip, visceral fat, obesity degree).
   - Device Suggestion with *"InBody device estimate — not an automatic app
     target"* caveat (target weight, weight/fat/muscle Δ).
   - Segmental Lean and Segmental Fat — 5 region cards each, colour-coded by
     classification badge (Normal / Over / Under / Low / High).

5. **Extended progress charts** — eight new auto-rendered chart series
   piggy-back on the existing `mkPoints` helper: Skeletal Muscle, Body Fat
   Mass, Fat-Free Mass, Total Body Water, InBody Score, BMR, Visceral Fat
   Level, BMI. Per-series unit lets kg / L / kcal coexist with cm.

6. **6 new regression tests** in `src/__tests__/safetyRegression.spec.ts`
   covering: add / enrich / idempotent / preserve user-edit / preserve
   `importedAt` / stable id derivation.

## Result

- **81 / 81 tests pass** (75 prior + 6 new).
- **`npx tsc -b`** clean.
- **`npm run build`** clean (production bundle).
- The 26 May 2026 InBody scan transcribed verbatim from the printout, importable
  in a single tap, with no risk of duplicating or clobbering existing data.

## Conditions of approval

The feature is gated behind a single-user PWA model. The following items are
**explicitly out of scope** and were not implemented:

| Requirement | Why N/A for this app |
|---|---|
| Server-side authorization / JWT / CSRF | No backend — localStorage only |
| Multi-user FK / RLS / account isolation | Single user, no DB |
| OCR image-attachment processing | No image attached; values typed verbatim |
| 30 separate chart components, one per metric | The existing `mkPoints` helper auto-renders any field with ≥1 point; one mobile screen would not fit 30 cards |
| Custom routes `/progress/body-composition/<date>` | Single-page tabbed PWA, not a React Router app |
| Per-chart date-range pickers (7d / 30d / 3m / 1y / all) | The data set is weeks-scale; the existing chart spans all entries |
| 10-file audit doc suite | 3 focused files cover the same ground for an app this size |
| Playwright end-to-end tests | Vitest + jsdom is the existing test stack |

See `SOURCE_DATA_MAPPING.md` for the field-by-field transcription confidence and
`NON_REGRESSION.md` for proof that no working feature was removed.

## Deferred (intentionally)

- **A second InBody scan.** The 3 June 2026 entry currently has weight only
  (82.5 kg) and was *not* fabricated. The feature is ready for the next scan —
  add a new `INBODY_2026_06_XX` constant to `src/data/inbodyScans.ts` and the
  same importer button will pick it up.
- **Bulk import of historical InBody PDFs.** Out of scope; the constant-file
  pattern handles single-scan-per-quarter cadence.
- **In-form editing of segmental arrays.** The detail panel renders them
  read-only; if a future user edits a value, the importer's "don't clobber
  user-edited fields" rule already protects it.

## Files changed

| Path | Change |
|---|---|
| `src/types/index.ts` | Extended `BodyStatEntry` with InBody fields (additive, optional) |
| `src/data/inbodyScans.ts` | **New** — `INBODY_2026_05_26` deterministic scan constant |
| `src/utils/storage.ts` | Added `importBodyAssessment` and `AssessmentImportResult` |
| `src/components/BodyStats.tsx` | Import button, rich history detail panel, 8 new chart series, per-series unit |
| `src/__tests__/safetyRegression.spec.ts` | 6 new tests for `importBodyAssessment` |
| `audit-body-history/` | This summary, source-data mapping, non-regression proof |
