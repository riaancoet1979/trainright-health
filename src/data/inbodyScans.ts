/**
 * Hard-coded InBody-270 body-composition assessments transcribed from device
 * printouts. Stored here (not pasted ad-hoc into the UI) so the importer is
 * deterministic, the values are version-controlled, and tests can refer to
 * the same source of truth as the runtime.
 *
 * Each constant is a `BodyStatEntry` (without `id`) — `importBodyAssessment`
 * upserts it into `trainright_body_stats` with a stable id derived from the
 * source fingerprint, so re-importing is idempotent.
 */

import type { BodyStatEntry } from '../types';

/** InBody 270 scan — Riaan, 26 May 2026, 13:13 local. */
export const INBODY_2026_05_26: Omit<BodyStatEntry, 'id'> = {
  date: '2026-05-26',
  measuredAt: '2026-05-26T13:13:00',
  source: 'inbody-270',
  sourceDevice: 'InBody 270',
  // Stable fingerprint so importing twice produces a single row. Combines
  // source, measured day, and the three most-distinctive primary metrics.
  sourceFingerprint: 'inbody-270:2026-05-26:w83.6:smm37.9:bfp19.7',

  // Primary measurements
  weight: 83.6,
  bodyFat: 19.7,

  // Core body composition
  totalBodyWaterL: 49.3,
  proteinMassKg: 13.2,
  mineralMassKg: 4.61,
  bodyFatMassKg: 16.5,
  skeletalMuscleMassKg: 37.9,
  fatFreeMassKg: 67.1,
  bmi: 26.4,
  smiKgM2: 8.6,
  inBodyScore: 83,
  inBodyScoreMax: 100,

  // Metabolic / device estimates (device estimates, NOT medical advice)
  basalMetabolicRateKcal: 1820,
  recommendedCalorieIntakeKcal: 2766,
  waistHipRatio: 0.93,
  visceralFatLevel: 8,
  obesityDegreePercent: 120,

  // Device weight-control suggestion (device recommendations, NOT app goals)
  targetWeightKg: 79.0,
  weightControlKg: -4.6,
  fatControlKg: -4.6,
  muscleControlKg: 0.0,

  // Segmental lean (kg + % of reference + device label)
  segmentalLean: [
    { region: 'leftArm',  massKg: 3.89,  refPercent: 111.2, classification: 'Normal' },
    { region: 'rightArm', massKg: 4.26,  refPercent: 121.9, classification: 'Over'   },
    { region: 'trunk',    massKg: 30.3,  refPercent: 108.8, classification: 'Normal' },
    { region: 'leftLeg',  massKg: 9.51,  refPercent: 97.9,  classification: 'Normal' },
    { region: 'rightLeg', massKg: 9.71,  refPercent: 99.9,  classification: 'Normal' },
  ],

  // Segmental fat (kg + % of reference + device label)
  segmentalFat: [
    { region: 'leftArm',  massKg: 0.9, refPercent: 135.7, classification: 'Normal' },
    { region: 'rightArm', massKg: 0.7, refPercent: 109.0, classification: 'Normal' },
    { region: 'trunk',    massKg: 9.4, refPercent: 212.0, classification: 'Over'   },
    { region: 'leftLeg',  massKg: 2.1, refPercent: 119.0, classification: 'Normal' },
    { region: 'rightLeg', massKg: 2.2, refPercent: 120.7, classification: 'Normal' },
  ],
};

/** All scans known to the app. Add new InBody printouts here. */
export const KNOWN_INBODY_SCANS = [INBODY_2026_05_26] as const;
