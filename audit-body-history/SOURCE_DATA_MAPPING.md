# Source-data mapping — 26 May 2026 InBody-270 scan

**Source:** InBody 270 printout, measured 2026-05-26 at 13:13 local.
**Operator:** Riaan (single-user PWA — same person as the app user).
**Transcribed:** 2026-06-06, values typed verbatim from the printout into
`src/data/inbodyScans.ts`.

Confidence is **high** for every numeric field — they were copied as digits from
the printout. Confidence is **medium** for classification labels (Normal / Over)
because the InBody printout uses the same labels and they were typed verbatim;
the only risk is a transcription typo.

## Identity & provenance

| InBody printout field | Stored field | Value | Unit | Confidence |
|---|---|---|---|---|
| Measurement timestamp | `measuredAt` | `2026-05-26T13:13:00` | ISO 8601 | high |
| Date (day only) | `date` | `2026-05-26` | YYYY-MM-DD | high |
| Device | `sourceDevice` | `InBody 270` | label | high |
| Device family | `source` | `inbody-270` | enum | high |
| Derived for idempotency | `sourceFingerprint` | `inbody-270:2026-05-26:w83.6:smm37.9:bfp19.7` | derived | high |
| When imported (set at runtime) | `importedAt` | runtime ISO timestamp | ISO 8601 | high |

## Primary measurements

| InBody printout field | Stored field | Value | Unit | Confidence |
|---|---|---|---|---|
| Weight | `weight` | 83.6 | kg | high |
| Body fat % (PBF) | `bodyFat` | 19.7 | % | high |

## Body composition (Item Analysis)

| InBody printout field | Stored field | Value | Unit | Confidence |
|---|---|---|---|---|
| Total Body Water | `totalBodyWaterL` | 49.3 | L | high |
| Protein | `proteinMassKg` | 13.2 | kg | high |
| Minerals | `mineralMassKg` | 4.61 | kg | high |
| Body Fat Mass | `bodyFatMassKg` | 16.5 | kg | high |
| Skeletal Muscle Mass | `skeletalMuscleMassKg` | 37.9 | kg | high |
| Fat-Free Mass | `fatFreeMassKg` | 67.1 | kg | high |
| BMI | `bmi` | 26.4 | kg/m² | high |
| Skeletal Muscle Index | `smiKgM2` | 8.6 | kg/m² | high |
| InBody Score | `inBodyScore` | 83 | /100 | high |
| Score maximum | `inBodyScoreMax` | 100 | constant | high |

## Metabolic / device estimates

These are **device-generated estimates** — the app surfaces them with an explicit
"Device estimate — not medical advice" caveat in the UI.

| InBody printout field | Stored field | Value | Unit | Confidence |
|---|---|---|---|---|
| Basal Metabolic Rate | `basalMetabolicRateKcal` | 1820 | kcal/day | high |
| Recommended Calorie Intake | `recommendedCalorieIntakeKcal` | 2766 | kcal/day | high |
| Waist-Hip Ratio | `waistHipRatio` | 0.93 | ratio | high |
| Visceral Fat Level | `visceralFatLevel` | 8 | level | high |
| Obesity Degree | `obesityDegreePercent` | 120 | % | high |

## Device weight-control suggestion

These are **device recommendations**, never propagated to the app's actual
calorie / training targets. Surfaced read-only with an explicit
"InBody device estimate — not an automatic app target" caveat.

| InBody printout field | Stored field | Value | Unit | Confidence |
|---|---|---|---|---|
| Target Weight | `targetWeightKg` | 79.0 | kg | high |
| Weight Control | `weightControlKg` | -4.6 | kg | high |
| Fat Control | `fatControlKg` | -4.6 | kg | high |
| Muscle Control | `muscleControlKg` | 0.0 | kg | high |

## Segmental analysis — Lean

Stored as `BodyStatEntry.segmentalLean: SegmentalMeasurement[]`.

| Region | massKg | refPercent | classification | Confidence |
|---|---|---|---|---|
| Left Arm  | 3.89 | 111.2 | Normal | high |
| Right Arm | 4.26 | 121.9 | Over   | high |
| Trunk     | 30.3 | 108.8 | Normal | high |
| Left Leg  | 9.51 | 97.9  | Normal | high |
| Right Leg | 9.71 | 99.9  | Normal | high |

## Segmental analysis — Fat

Stored as `BodyStatEntry.segmentalFat: SegmentalMeasurement[]`.

| Region | massKg | refPercent | classification | Confidence |
|---|---|---|---|---|
| Left Arm  | 0.9 | 135.7 | Normal | high |
| Right Arm | 0.7 | 109.0 | Normal | high |
| Trunk     | 9.4 | 212.0 | Over   | high |
| Left Leg  | 2.1 | 119.0 | Normal | high |
| Right Leg | 2.2 | 120.7 | Normal | high |

## Fields intentionally NOT mapped

| InBody printout field | Why omitted |
|---|---|
| Subject ID / member number | No multi-user model; the PWA has one user |
| Phase angle | Not on the InBody 270 printout |
| Impedance values (Z) per 5 frequencies | Device-internal diagnostic; not surfaced |

## 3 June 2026 entry

The legacy `trainright-backup-2026-06-03 (1).json` carried a single weight entry
for 2026-06-03 (`weight: 82.5 kg`, no other measurements). **This was not
fabricated.** It remains a single-metric entry — only the weight chart shows the
point; the other charts simply don't include it.

## Idempotency contract

`importBodyAssessment(INBODY_2026_05_26)` is safe to re-run:

1. First call → `{ action: 'added', id: 'body-inbody-270_2026-05-26_w83_6_smm37_9_bfp19_7' }`.
2. Second call (identical input) → `{ action: 'unchanged', id: <same> }`.
3. Same call after legacy partial row exists (no fingerprint, same date) →
   `{ action: 'enriched', id: <legacy id>, enrichedFields: [...] }`. Pre-existing
   non-empty values (e.g. user-edited weight) are preserved.

Tested by 6 regression tests in
`src/__tests__/safetyRegression.spec.ts > InBody assessment import`.
