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
};
