export interface FoodItem {
  id: string;
  name: string;
  calories: number; // per 100g
  protein: number; // per 100g
  carbs: number; // per 100g
  fats: number; // per 100g
  category?: string;
  brand?: string;
  servingType?: 'weight' | 'piece';
  averageWeight?: number; // grams per piece (required if servingType='piece')
  isCustom?: boolean;
}

export interface FoodEntry {
  id: string;
  foodId: string;
  foodName: string;
  portion: number; // in grams
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  timestamp: string;
  pieceCount?: number;
  servingType?: 'weight' | 'piece';
}

export interface Exercise {
  id: string;
  name: string;
  duration: number; // in minutes
  caloriesBurned: number;
  type: 'cardio' | 'strength' | 'walking' | 'other';
  timestamp: string;
}

export interface PushupSet {
  reps: number;
  timestamp: string; // ISO string
}

export interface PushupData {
  sets: PushupSet[];
  totalReps: number;
  setsCompleted: number;
}

export interface StepsData {
  steps: number;
  goal: number;
}

export interface DailyEntry {
  date: string; // YYYY-MM-DD format
  foodEntries: FoodEntry[];
  exercises: Exercise[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  totalExerciseCalories: number;
  netCalories: number;
  fitness?: {
    pushups: PushupData;
    steps: StepsData;
  };
}

export interface UserTargets {
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFats: number;
}

export interface UserSettings {
  targets: UserTargets;
  theme: 'light' | 'dark';
  pushupReminders?: {
    enabled: boolean;
    times: string[]; // 'HH:mm' strings
    weekend: boolean;
  };
  restTimerSeconds?: number;
}

export interface DayStatus {
  date: string;
  status: 'met' | 'close' | 'missed' | 'future';
  progress: number; // percentage
}

// ─── Body-composition assessment (InBody and similar devices) ────────────────

export type SegmentalRegion = 'leftArm' | 'rightArm' | 'trunk' | 'leftLeg' | 'rightLeg';
export type SegmentalClassification = 'Low' | 'Normal' | 'Over' | 'Under' | 'High';

export interface SegmentalMeasurement {
  region: SegmentalRegion;
  /** Mass in kg (lean OR fat depending on which array it lives in). */
  massKg: number;
  /** Device-reported percentage of reference. */
  refPercent?: number;
  /** Device classification text (Normal, Over, Under, etc.). */
  classification?: SegmentalClassification;
}

export type BodyStatSource =
  | 'manual'
  | 'inbody-270'
  | 'inbody-other'
  | 'legacy-trainright'
  | 'scale';

export interface BodyStatEntry {
  id: string;
  date: string; // YYYY-MM-DD — the measurement day (always set; existing field)

  // ── Existing primary fields (unchanged) ──
  weight?: number; // kg
  bodyFat?: number; // %
  waist?: number; // cm
  chest?: number; // cm
  hips?: number; // cm
  leftArm?: number; // cm
  rightArm?: number; // cm
  neck?: number; // cm

  // ── Added in 2026-06-06 legacy-import pass (unchanged) ──
  thighL?: number; // cm — left thigh circumference
  thighR?: number; // cm — right thigh circumference
  shoulderWidth?: number; // cm — bi-acromial width

  // ── Body-composition assessment fields (additive, all optional) ──
  /** ISO 8601 datetime when the measurement was taken on the device. Lets the
   *  UI show "Measured: 26 May 2026 at 13:13" while `date` keeps the day key. */
  measuredAt?: string;
  /** ISO 8601 datetime when the record was first persisted into this app. */
  importedAt?: string;
  /** Where the entry came from. Defaults to 'manual' when unset. */
  source?: BodyStatSource;
  /** Source device label, e.g. "InBody 270". Distinct from `source` so we can
   *  show a friendly device name without enumerating every model. */
  sourceDevice?: string;
  /** Stable fingerprint used for idempotent re-import — derived from
   *  source + measuredAt + weight + smm + body fat %. */
  sourceFingerprint?: string;

  // ── Core body-composition values from InBody ──
  totalBodyWaterL?: number;
  proteinMassKg?: number;
  mineralMassKg?: number;
  bodyFatMassKg?: number;
  skeletalMuscleMassKg?: number;
  fatFreeMassKg?: number;
  bmi?: number;
  smiKgM2?: number; // skeletal muscle index
  /** InBody score (typically 0–100). */
  inBodyScore?: number;
  inBodyScoreMax?: number;

  // ── Metabolic / device estimates ──
  basalMetabolicRateKcal?: number;
  recommendedCalorieIntakeKcal?: number;
  waistHipRatio?: number;
  visceralFatLevel?: number;
  obesityDegreePercent?: number;

  // ── Device weight-control recommendations ──
  targetWeightKg?: number;
  weightControlKg?: number;
  fatControlKg?: number;
  muscleControlKg?: number;

  // ── Segmental analysis ──
  segmentalLean?: SegmentalMeasurement[];
  segmentalFat?: SegmentalMeasurement[];

  // ── Per-field review metadata for OCR / uncertain imports ──
  needsReview?: boolean;
  /** Field IDs that the user has not yet confirmed. UI can highlight them. */
  reviewFields?: string[];

  notes?: string;
}
