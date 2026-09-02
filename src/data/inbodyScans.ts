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

/** InBody 270 scan — Riaan, 3 July 2026, 13:20 local. */
export const INBODY_2026_07_03: Omit<BodyStatEntry, 'id'> = {
  date: '2026-07-03',
  measuredAt: '2026-07-03T13:20:00',
  source: 'inbody-270',
  sourceDevice: 'InBody 270',
  sourceFingerprint: 'inbody270-2026-07-03T1320-89.8-41.3-18.9',

  // Primary measurements
  weight: 89.8,
  bodyFat: 18.9,

  // Core body composition
  totalBodyWaterL: 53.4,
  proteinMassKg: 14.3,
  mineralMassKg: 5.08,
  bodyFatMassKg: 17.0,
  skeletalMuscleMassKg: 41.3,
  fatFreeMassKg: 72.8,
  bmi: 28.3,
  smiKgM2: 9.2,
  inBodyScore: 89,
  inBodyScoreMax: 100,

  // Metabolic / device estimates (device estimates, NOT medical advice)
  basalMetabolicRateKcal: 1943,
  recommendedCalorieIntakeKcal: 2876,
  waistHipRatio: 0.92,
  visceralFatLevel: 8,
  obesityDegreePercent: 129,

  // Device weight-control suggestion (device recommendations, NOT app goals)
  targetWeightKg: 85.7,
  weightControlKg: -4.1,
  fatControlKg: -4.1,
  muscleControlKg: 0.0,

  // Segmental lean (kg + % of reference + device label)
  segmentalLean: [
    { region: 'leftArm',  massKg: 4.37,  refPercent: 122.3, classification: 'Over'   },
    { region: 'rightArm', massKg: 4.71,  refPercent: 131.7, classification: 'Over'   },
    { region: 'trunk',    massKg: 32.9,  refPercent: 115.4, classification: 'Over'   },
    { region: 'leftLeg',  massKg: 9.97,  refPercent: 100.4, classification: 'Normal' },
    { region: 'rightLeg', massKg: 10.26, refPercent: 103.3, classification: 'Normal' },
  ],

  // Segmental fat (kg + % of reference + device label)
  segmentalFat: [
    { region: 'leftArm',  massKg: 0.8, refPercent: 131.0, classification: 'Normal' },
    { region: 'rightArm', massKg: 0.7, refPercent: 106.0, classification: 'Normal' },
    { region: 'trunk',    massKg: 9.9, refPercent: 224.0, classification: 'Over'   },
    { region: 'leftLeg',  massKg: 2.1, refPercent: 117.9, classification: 'Normal' },
    { region: 'rightLeg', massKg: 2.2, refPercent: 120.1, classification: 'Normal' },
  ],
};

/** InBody 270 scan — Riaan, 6 August 2026, 12:04 local. */
export const INBODY_2026_08_06: Omit<BodyStatEntry, 'id'> = {
  date: '2026-08-06',
  measuredAt: '2026-08-06T12:04:00',
  source: 'inbody-270',
  sourceDevice: 'InBody 270',
  sourceFingerprint: 'inbody270-2026-08-06T1204-90.0-42.3-17.6',

  // Primary measurements
  weight: 90.0,
  bodyFat: 17.6,

  // Core body composition
  totalBodyWaterL: 54.3,
  proteinMassKg: 14.7,
  mineralMassKg: 5.09,
  bodyFatMassKg: 15.9,
  skeletalMuscleMassKg: 42.3,
  fatFreeMassKg: 74.1,
  bmi: 28.4,
  smiKgM2: 9.4,
  inBodyScore: 92,
  inBodyScoreMax: 100,

  // Metabolic / device estimates (device estimates, NOT medical advice)
  basalMetabolicRateKcal: 1971,
  recommendedCalorieIntakeKcal: 2879,
  waistHipRatio: 0.92,
  visceralFatLevel: 7,
  obesityDegreePercent: 129,

  // Device weight-control suggestion (device recommendations, NOT app goals)
  targetWeightKg: 87.2,
  weightControlKg: -2.8,
  fatControlKg: -2.8,
  muscleControlKg: 0.0,

  // Segmental lean (kg + % of reference + device label)
  segmentalLean: [
    { region: 'leftArm',  massKg: 4.48,  refPercent: 125.3, classification: 'Over'   },
    { region: 'rightArm', massKg: 4.78,  refPercent: 133.7, classification: 'Over'   },
    { region: 'trunk',    massKg: 33.5,  refPercent: 117.6, classification: 'Over'   },
    { region: 'leftLeg',  massKg: 10.11, refPercent: 101.7, classification: 'Normal' },
    { region: 'rightLeg', massKg: 10.31, refPercent: 103.7, classification: 'Normal' },
  ],

  // Segmental fat (kg + % of reference + device label)
  segmentalFat: [
    { region: 'leftArm',  massKg: 0.7, refPercent: 111.5, classification: 'Normal' },
    { region: 'rightArm', massKg: 0.6, refPercent: 88.7,  classification: 'Normal' },
    { region: 'trunk',    massKg: 9.3, refPercent: 211.0, classification: 'Over'   },
    { region: 'leftLeg',  massKg: 2.0, refPercent: 109.8, classification: 'Normal' },
    { region: 'rightLeg', massKg: 2.0, refPercent: 111.5, classification: 'Normal' },
  ],
};

/** All scans known to the app, oldest first. Add new InBody printouts here. */
export const KNOWN_INBODY_SCANS = [INBODY_2026_05_26, INBODY_2026_07_03, INBODY_2026_08_06] as const;
