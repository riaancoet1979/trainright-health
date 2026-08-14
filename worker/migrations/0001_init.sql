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
