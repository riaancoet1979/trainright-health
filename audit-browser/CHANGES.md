# Changes Applied During Audit

**Audit date:** 2026-06-06

Summary of all code changes made during the QA audit session.

---

## src/utils/storage.ts

**Purpose:** Fixed floating-point display precision for nutrition totals (FP-001).

**Change 1 — addFoodEntry function (lines ~195–199):**

```diff
- dailyEntry.totalCalories = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.calories, 0);
- dailyEntry.totalProtein = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.protein, 0);
- dailyEntry.totalCarbs = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.carbs, 0);
- dailyEntry.totalFats = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.fats, 0);
+ dailyEntry.totalCalories = Math.round(dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.calories, 0));
+ dailyEntry.totalProtein = Math.round(dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.protein, 0) * 10) / 10;
+ dailyEntry.totalCarbs = Math.round(dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.carbs, 0) * 10) / 10;
+ dailyEntry.totalFats = Math.round(dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.fats, 0) * 10) / 10;
```

**Change 2 — deleteFoodEntry function (lines ~209–213):**

```diff
- dailyEntry.totalCalories = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.calories, 0);
- dailyEntry.totalProtein = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.protein, 0);
- dailyEntry.totalCarbs = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.carbs, 0);
- dailyEntry.totalFats = dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.fats, 0);
+ dailyEntry.totalCalories = Math.round(dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.calories, 0));
+ dailyEntry.totalProtein = Math.round(dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.protein, 0) * 10) / 10;
+ dailyEntry.totalCarbs = Math.round(dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.carbs, 0) * 10) / 10;
+ dailyEntry.totalFats = Math.round(dailyEntry.foodEntries.reduce((sum, entry) => sum + entry.fats, 0) * 10) / 10;
```

---

## src/components/FoodEntry.tsx

**Purpose:** Added date context banner so user knows which date food is being logged to (UX-001).

**Change 1 — Import additions (top of file):**

```diff
  import { useState } from 'react';
- import { Search, Plus, X, Minus, Apple, Scale } from 'lucide-react';
+ import { Search, Plus, X, Minus, Apple, Scale, CalendarDays } from 'lucide-react';
+ import { format, isToday } from 'date-fns';
  import type { FoodItem, FoodEntry as FoodEntryType } from '../types';
  import { calculatePortionNutrients, addFoodEntry, getAllFoods } from '../utils/storage';
```

**Change 2 — Date context banner in JSX (inside return statement):**

```diff
+ const loggingToday = isToday(selectedDate);
+
  return (
    <div className="card">
      <h3 className="text-xl font-bold mb-4">Add Food</h3>
+     {!loggingToday && (
+       <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-200">
+         <CalendarDays className="w-4 h-4 flex-shrink-0" />
+         <span>
+           Logging to <strong>{format(selectedDate, 'EEE d MMM')}</strong> — not today.
+         </span>
+       </div>
+     )}
```

---

## No Other Files Changed

All other source files, configuration files, test files, package.json, and git history are unchanged.

---

## Test Result After Changes

```
Test Files  9 passed (9)
      Tests  75 passed (75)
   Duration  ~103s
```
