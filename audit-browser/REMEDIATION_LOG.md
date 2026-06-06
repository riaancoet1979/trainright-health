# Remediation Log

**Audit date:** 2026-06-06

Documents all fixes applied during this audit, their implementation, and verification.

---

## Applied Fixes

### FIX-001 — Floating-Point Precision (resolves FP-001)

| Field | Value |
|---|---|
| **Finding ID** | FP-001 |
| **Severity** | MEDIUM |
| **File changed** | `src/utils/storage.ts` |
| **Date applied** | 2026-06-06 |

**Problem:** Nutrition totals computed by summing food entry macros produced JavaScript floating-point artefacts (e.g. `2007.7199999999998` instead of `2007.72`). Affected `totalCalories`, `totalProtein`, `totalCarbs`, `totalFats` in both `addFoodEntry` and `deleteFoodEntry` functions.

**Fix applied:**
- `totalCalories` — wrapped in `Math.round()` (integer precision appropriate for calories)
- `totalProtein`, `totalCarbs`, `totalFats` — wrapped in `Math.round(x * 10) / 10` (1 decimal place, matches individual entry precision)

Applied in both `addFoodEntry` and `deleteFoodEntry` (two locations, same pattern).

**Before:**
```ts
dailyEntry.totalCalories = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.calories, 0);
dailyEntry.totalProtein = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.protein, 0);
```

**After:**
```ts
dailyEntry.totalCalories = Math.round(dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.calories, 0));
dailyEntry.totalProtein = Math.round(dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.protein, 0) * 10) / 10;
```

**Verification:** All 75 unit tests pass. No new test failures. FP-001 resolved at source — all consumers (Analytics, DailySummary, Calendar) automatically receive rounded values.

**Non-regression:** No logic changed; only display precision corrected. No existing test assertions on raw float values.

---

### FIX-002 — Add Tab Date Context Indicator (resolves UX-001)

| Field | Value |
|---|---|
| **Finding ID** | UX-001 |
| **Severity** | MEDIUM |
| **File changed** | `src/components/FoodEntry.tsx` |
| **Date applied** | 2026-06-06 |

**Problem:** When a user selects a past date in the Calendar tab, then navigates to Add tab, food entries are logged to the selected past date with no visual indication. Users can silently log food to the wrong date.

**Fix applied:**
- Added `import { format, isToday } from 'date-fns'` to existing date-fns dependency (already in package.json)
- Added `import { CalendarDays } from 'lucide-react'` to existing icon import
- Computed `const loggingToday = isToday(selectedDate)` 
- Added an amber warning banner that renders only when `!loggingToday`:

```tsx
{!loggingToday && (
  <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-200">
    <CalendarDays className="w-4 h-4 flex-shrink-0" />
    <span>
      Logging to <strong>{format(selectedDate, 'EEE d MMM')}</strong> — not today.
    </span>
  </div>
)}
```

**Result:** When the user is about to log food to a non-today date (e.g. "Fri 5 Jun"), an amber banner appears immediately below the "Add Food" heading. When logging to today, nothing is shown (no visual clutter for normal use).

**Verification:** All 75 unit tests pass. No new test failures. Banner is purely additive — no existing functionality removed.

**Non-regression:** The `selectedDate` prop was already received and used by `addFoodEntry(selectedDate, entry)`. No change to the data flow. Only added a read-only display that checks if `selectedDate` equals today.

---

## Pending Findings (Not Fixed This Session)

| ID | Severity | Reason Not Fixed |
|---|---|---|
| TR-001 | LOW | Needs clarification from Riaan — mobility volume under YELLOW may be intentional |
| FDB-001 | LOW | Food database data correction — low risk, no code logic change needed |
| DATE-001 | LOW | Requires adding a midnight-crossing timer — deferred to next session |
| A-001 | LOW | Accessibility labels — deferred; no functional impact |
| A-002 | LOW | Chart accessibility — deferred; no functional impact |
| A-003 | LOW | WCAG contrast — deferred |
| RD-001 | LOW | Touch targets — deferred |

---

## Test Run After Fixes

```
Test Files  9 passed (9)
      Tests  75 passed (75)
```

**All 75 tests pass after fixes. No regressions.**
