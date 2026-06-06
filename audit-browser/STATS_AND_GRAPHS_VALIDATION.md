# Stats & Graphs Validation

**Audit date:** 2026-06-06

Validates all numeric displays, chart renders, and computed summaries in the Stats, Body, and Calendar tabs.

---

## Stats Tab

### S-001: Weekly Summary Panel

| Metric | Data Source | Observed Value | Expected Behavior | Result |
|---|---|---|---|---|
| Sessions completed | `health_training_v1.logs[date].completed` | "1/4" | Count of days completed / weekly target | ✅ Pass |
| Sleep average | `health_metrics_v1` Garmin data | "—" | Shows dash when no data | ✅ Pass |
| Steps average | `health_metrics_v1` | "—" | Shows dash when no data | ✅ Pass |
| Protein average | `nutrition_tracker_daily_entries` | "243g" (from logged entries) | 7-day rolling average | ✅ Pass |
| Kcal average | `nutrition_tracker_daily_entries` | "2503" | 7-day rolling average | ✅ Pass |
| Weight delta | `trainright_body_stats` | "—" | Shows dash with <2 readings | ✅ Pass |

### S-002: Today's Progress Section

| Metric | Observed | Expected Behavior | Result |
|---|---|---|---|
| Calories progress | Shows current vs target (e.g. 2503/2000) | Matches today's entries | ✅ Pass |
| Protein progress | Shows g vs target | Matches today's entries | ✅ Pass |
| Steps progress | Shows steps vs goal | Shows 0/5000 | ✅ Pass |
| Numeric precision | Values may show floating-point issues | `2007.7199999999998` seen | ❌ FP-001 |

### S-003: Macro Breakdown Display

| Element | Observed | Result |
|---|---|---|
| Carbs percentage | Displayed | ✅ Pass |
| Fats percentage | Displayed | ✅ Pass |
| Protein percentage | Displayed | ✅ Pass |
| Total sums to ~100% | Math consistent | ✅ Pass |

### S-004: Achievements Section

| Feature | Observed | Result |
|---|---|---|
| Nutrition streak shown | "Nutrition Streak" achievement visible | ✅ Pass |
| Achievement metadata | Name and description present | ✅ Pass |

### S-005: Week Summary

| Metric | Observed | Result |
|---|---|---|
| Days tracked | Count of days with nutrition entries | ✅ Pass |
| Avg goal met | Percentage calculation | ✅ Pass |
| Days with pushups | "1/7" shown | ✅ Pass |

---

## Body Tab Charts

### G-001: Progress Charts Section

| Chart | Rendered | Has Data | Result |
|---|---|---|---|
| Weight chart | ✅ Rendered | 2 data points (May 1: 87.2 kg, Jun 5: 85.5 kg) | ✅ Pass |
| Measurements chart | ✅ Rendered | Historical entries | ✅ Pass |

Note: Charts use react-chartjs-2. Rendering confirmed visually via browser screenshot. No chart.js console errors observed.

### G-002: Body Stats History Accuracy

| Entry | Date | Weight | Result |
|---|---|---|---|
| Entry 1 | May 1, 2026 | 87.2 kg | ✅ Pass |
| Entry 2 | Jun 5, 2026 | 85.5 kg | ✅ Pass |
| Trend | Down (87.2 → 85.5 = −1.7 kg) | "Latest: 85.5 kg" | ✅ Pass |

---

## Calendar Tab Stats

### C-001: Day Detail Nutrition Summary

| Date | Kcal | Protein | Carbs | Fats | Result |
|---|---|---|---|---|---|
| Jun 5 | Data present | Data present | Data present | Data present | ✅ Pass |

### C-002: Day Detail Fitness Stats

| Metric | Value (Jun 5) | Source | Result |
|---|---|---|---|
| Pushup sets | 1/5 | `health_training_v1` | ✅ Pass |
| Pushup reps | 20/100 | `health_training_v1` | ✅ Pass |
| Steps | 0/5000 | Steps tracking store | ✅ Pass |

---

## Known Issues

| ID | Area | Description |
|---|---|---|
| FP-001 | Stats / Today's Progress | Floating-point arithmetic produces unrounded decimals (e.g. `2007.7199999999998`). Needs `toFixed(1)` or `Math.round()` wrapper on display values. |

---

## Summary

All chart components render without errors. All statistics pull from correct data sources and compute correctly. The single failing check (FP-001) is a display formatting issue — the underlying arithmetic is correct, just needs rounding before display.

**Stats and graphs are functionally correct.** FP-001 is a display-only polish issue.
