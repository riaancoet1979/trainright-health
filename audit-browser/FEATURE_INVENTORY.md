# Feature Inventory

**Audit date:** 2026-06-06

All user-facing features enumerated and their tested status recorded.

---

## Navigation

| Feature | Status | Notes |
|---|---|---|
| Bottom navigation bar (7 buttons) | ✅ Pass | Cal, Train, Add, Stats, Fitness, Body, Settings all functional |
| Active tab highlighting | ✅ Pass | Active tab shows `text-primary-600` (green) |
| Page title "TrainRight Health" | ✅ Pass | Shown in header on all tabs |

---

## Train Tab

| Feature | Status | Notes |
|---|---|---|
| Session header (week, phase, day name) | ✅ Pass | "Week 1 · Phase 1 — Assessment (Week 1) / Sat 6 Jun — Hinge + Skills — baseline" |
| Session description | ✅ Pass | Sub-heading shows session intent |
| Mark Complete / ✓ Completed button | ✅ Pass | Toggles state, saves `completed: true` to localStorage |
| Readiness selector (GREEN / YELLOW / RED) | ✅ Pass | Three styled buttons, selected state highlighted |
| Garmin readiness hint | ✅ Pass | Shows "No Garmin readiness data — pick by feel" when no data |
| Readiness description text | ✅ Pass | Shows "Full session as written" / "Reduced volume, accessories dropped" / "Rest / gentle mobility only" |
| Shoulder pain slider (0–10) | ✅ Pass | Range input, value displayed as "0/10" |
| Nutrition target display | ✅ Pass | Shows day-appropriate target (training vs rest) |
| Safety checklist (4 items) | ✅ Pass | Checkboxes: Chest pain, Dizziness, Breathlessness, Fever |
| Safety checkbox forces RED | ✅ Pass | Any tick immediately overrides readiness to RED |
| Coach daily insights | ✅ Pass | Shows data-driven coaching messages |
| Warm-up section | ✅ Pass | Static warm-up protocol displayed |
| Exercise list (GREEN) | ✅ Pass | Full session exercises shown |
| Exercise list (YELLOW) | ✅ Pass | Reduced sets, labeled "(reduced — yellow)" |
| Exercise list (RED) | ✅ Pass | Replaced with RED day blocking message |
| Exercise set input (weight) | ✅ Pass | Text input, placeholder "kg / band" |
| Exercise set input (reps/sec) | ✅ Pass | Text input, placeholder "reps" or "sec" for holds |
| Log button (per exercise) | ✅ Pass | Saves set data to `exercises` in localStorage |
| Bodyweight input | ✅ Pass | Number input (placeholder "kg"), min 20 / max 300 |
| Bodyweight Log button | ✅ Pass | Saves to `bodyMetrics` in localStorage |
| Bodyweight "last" display | ✅ Pass | Shows "last: 85 kg (2026-06-06)" after logging |
| Session notes textarea | ✅ Pass | Saves on blur |
| Rest day display | ✅ Pass | Shows rest day message on non-training days |

---

## Calendar Tab

| Feature | Status | Notes |
|---|---|---|
| Month header ("June 2026") | ✅ Pass | Correct month shown |
| "Today" button | ✅ Pass | Snaps selectedDate back to today |
| Calendar grid (Sun–Sat) | ✅ Pass | 35 day cells rendered |
| Day click → date selection | ✅ Pass | Click day 5 → shows "Friday, June 5, 2026" detail |
| Day detail: food entries count | ✅ Pass | "1 food entries • 0 activities" |
| Day detail: pushups | ✅ Pass | "1/5 sets • 20/100 reps" for Jun 5 |
| Day detail: steps | ✅ Pass | "0/5000" |
| Day detail: training/rest label | ✅ Pass | "Training day" / "Rest day" based on day of week |
| Day detail: nutrition goals | ✅ Pass | Shows kcal, protein, carbs, fats vs target |
| Smart Suggestions section | ✅ Pass | Shows AI-powered food recommendations |
| Legend (Target Met / Close / Missed / No Data) | ✅ Pass | Color-coded legend shown |

---

## Add Tab

| Feature | Status | Notes |
|---|---|---|
| Food search input | ✅ Pass | Live search across food database |
| Search results dropdown | ✅ Pass | Shows matching foods with cal/protein preview |
| Food selection | ✅ Pass | Click result → fills search field, shows Nutrition preview |
| Nutrition preview (100g) | ✅ Pass | Shows Cal, Protein, Carbs, Fats for selected food |
| Portion (grams) input | ✅ Pass | Default 100g, user-editable |
| Meal type selector | ✅ Pass | Breakfast (default), Lunch, Dinner, Snack |
| Add Food button (greyed when no food) | ✅ Pass | Disabled until food selected |
| Add Food button (active) | ✅ Pass | Green when food selected; resets form after add |
| Food persisted to selected date | ✅ Pass | Saves to `nutrition_tracker_daily_entries[selectedDate]` |
| Add Activity — Quick Add | ✅ Pass | Walking, Running, Cycling, Swimming, Weight Training, Yoga, HIIT |
| Add Activity — Type selector | ✅ Pass | Cardio / Strength / Walking / Other |
| Add Activity — Duration input | ✅ Pass | Minutes input, default 30 |
| Add Activity — Calories per Minute | ✅ Pass | Default 5 cal/min |
| Estimated Calories Burned display | ✅ Pass | Live calculation (30 × 5 = 150 cal default) |
| Add Activity button | ✅ Pass | Visible and enabled |

---

## Stats Tab

| Feature | Status | Notes |
|---|---|---|
| Weekly header (program week) | ✅ Pass | "Wk of 1 Jun (program wk 1)" |
| Sessions completed counter | ✅ Pass | "1/4" |
| Sleep avg | ✅ Pass | Shows "—" when no Garmin data |
| Steps avg | ✅ Pass | Shows average or "—" |
| Protein avg | ✅ Pass | "243g" (calculated from logged data) |
| Kcal avg | ✅ Pass | "2503" |
| Weight delta | ✅ Pass | Shows "—" with insufficient data |
| Coach weekly summary | ✅ Pass | Data-driven insights shown |
| Analytics — Today's Progress | ✅ Pass | Calories, Protein, Steps vs targets |
| Macro Breakdown (pie) | ✅ Pass | Carbs / Fats / Protein percentages |
| Pushup Sets Today | ✅ Pass | Shows count |
| This Week — Average Calories | ✅ Pass | With "Based on N days of data" |
| This Week — Average Protein | ✅ Pass | With target comparison |
| This Week — Average Steps | ✅ Pass | With goal comparison |
| Days with Pushups | ✅ Pass | "1/7" |
| Achievements section | ✅ Pass | Nutrition Streak shown |
| Week Summary | ✅ Pass | Days Tracked, Avg Goal Met |

---

## Fitness Tab

| Feature | Status | Notes |
|---|---|---|
| Sets counter (N/5 sets) | ✅ Pass | "1/5 sets" with progress bar |
| Reps counter (N/100) | ✅ Pass | "20/100" with progress bar |
| COMPLETE SET button | ✅ Pass | Logs a set at default reps |
| Steps — Today N/5,000 | ✅ Pass | Progress bar shown |
| Steps quick-set buttons (5K–15K) | ✅ Pass | 5K, 8K, 10K, 12K, 15K buttons |
| Steps manual input | ✅ Pass | Number input with "Set" button |
| Yesterday's steps | ✅ Pass | "Yesterday: 0 steps" |
| Add custom set section | ✅ Pass | Input pre-filled "20", Add Set button |
| Completed sets history | ✅ Pass | Shows "20 reps — 4:54 PM, Jun 5" |

---

## Body Tab

| Feature | Status | Notes |
|---|---|---|
| + Log Entry button | ✅ Pass | Opens entry form |
| Weight input (kg) | ✅ Pass | Present in form |
| Body Fat input (%) | ✅ Pass | Present |
| Waist input (cm) | ✅ Pass | Present |
| Chest input | ✅ Pass | Present |
| Progress Charts section | ✅ Pass | Rendered |
| Measurements section | ✅ Pass | Rendered |
| History entries | ✅ Pass | "2 entries" shown; 87.2 kg (May 1) and 85.5 kg (Jun 5) |
| Trend indicator | ✅ Pass | "Latest: 85.5 kg" with trend |
| Per-entry stat breakdown | ✅ Pass | Shows weight, BF%, waist, chest per entry |

---

## Settings Tab

| Feature | Status | Notes |
|---|---|---|
| Program start date picker | ✅ Pass | Date input, currently 2026-06-05 |
| Training day targets (kcal, P, C, F) | ✅ Pass | 2000 / 160 / 130 / 95 |
| Rest day targets (kcal, P, C, F) | ✅ Pass | 1850 / 160 / 95 / 95 |
| Save button | ✅ Pass | Present and enabled |
| Fat-loss preset | ✅ Pass | Button present |
| Lean-gain preset | ✅ Pass | Button present with tooltip |
| Data migration & backup section | ✅ Pass | Export all data, Import full backup, Import Garmin JSON, Import old TrainRight |
| Theme toggle | ✅ Pass | Light/dark switch |
| Fitness section | ✅ Pass | Rest timer (2 min default) |
| Export Fitness Data | ✅ Pass | Button present |
| Import Fitness Backup | ✅ Pass | File input present |
| Reset Fitness Data | ✅ Pass | Button present |
| Daily Targets (nutrition tracker) | ✅ Pass | Separate from training targets (2000 cal, 150g P, 200g C, 65g F) |
| Macro Split display | ✅ Pass | Protein 30%, Carbs 40%, Fats 29% |
| Pushup Reminders enable toggle | ✅ Pass | Checkbox |
| Reminder times list | ✅ Pass | 08:00, 11:00, 14:00, 17:00, 20:00 |
| Add reminder time input | ✅ Pass | Time picker |
| Include weekends checkbox | ✅ Pass | Present |
| Notification permission status | ✅ Pass | "Current permission: default" |
| Manage Custom Foods | ✅ Pass | "No custom foods yet" — Add New option |
