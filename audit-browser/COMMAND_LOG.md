# Command Log

**Audit date:** 2026-06-06

Chronological record of all significant commands run during the QA audit.

---

## Browser Interactions (Chrome MCP)

| # | Action | Target | Outcome |
|---|---|---|---|
| 1 | Navigate | `https://riaancoet1979.github.io/trainright-health/` | App loaded |
| 2 | Screenshot | Full page | Confirmed Train tab active |
| 3 | DOM read | Full accessibility tree | Confirmed tab structure, readiness buttons, safety checkboxes |
| 4 | Click | GREEN readiness button | Exercise list visible |
| 5 | Click | YELLOW readiness button | Volume reduced, "(reduced — yellow)" labels |
| 6 | Click | RED readiness button | RED block message shown |
| 7 | Click | "Chest pain" safety checkbox | RED block triggered regardless of readiness |
| 8 | Click | Uncheck "Chest pain" | Exercise list restored |
| 9 | JavaScript exec | Set exercise weight/reps inputs via React controlled input technique | Weight "24", reps "10" set |
| 10 | Click | Log button | Set saved to localStorage |
| 11 | JavaScript exec | `localStorage.getItem('health_training_v1')` | Verified set in `exercises.kb_swing.sets` |
| 12 | JavaScript exec | Set bodyweight input to "85" | Weight set |
| 13 | Click | Bodyweight Log button | Saved to `bodyMetrics` |
| 14 | Click | Mark Complete button | `completed: true`, button shows "✓ Completed" |
| 15 | JavaScript exec | Read localStorage | Full state dump for data persistence baseline |
| 16 | Navigate | Hard reload (Ctrl+Shift+R equivalent) | Page reloaded |
| 17 | JavaScript exec | Read localStorage | All data preserved — persistence confirmed |
| 18 | Click | Calendar tab | Month grid shown |
| 19 | Click | Day 5 cell | Day detail: "Friday, June 5, 2026" |
| 20 | Click | Today button | Selected date reset |
| 21 | Click | Add tab | Food search shown |
| 22 | Type | "chicken breast" in food search | Filtered results appeared |
| 23 | Click | "Chicken Breast (Skinless)" | Nutrition preview shown |
| 24 | Click | Add Food button | Entry saved, form reset |
| 25 | Click | Stats tab | Weekly summary, Today's Progress, macro breakdown confirmed |
| 26 | Click | Fitness tab | Pushup tracking, steps tracking confirmed |
| 27 | Click | Body tab | History entries, charts confirmed |
| 28 | Click | Settings tab | All sections confirmed |
| 29 | Scroll (JS) | Content container | Used `scrollEl.scrollTop += 600` to scroll overflow-y-auto container |
| 30 | JavaScript exec | Read console messages | No errors |
| 31 | JavaScript exec | Read network requests | No external XHR/Fetch |

---

## Shell Commands (Bash / Node)

| # | Command | Purpose | Outcome |
|---|---|---|---|
| 1 | `find src -name "*.ts" -o -name "*.tsx"` | List source files | All 30 source files identified |
| 2 | `grep -n "totalCalories\|totalProtein"` storage.ts | Find float compute lines | Lines 195–213 identified |
| 3 | `grep -n "todayCalories\|todayProtein"` Analytics.tsx | Confirm display sites | Display uses raw totals |
| 4 | `npm install @rollup/rollup-linux-x64-gnu` | Fix missing native module | Installed |
| 5 | `npx vitest run --reporter=dot` | Full test run after fixes | **75/75 PASS** |

---

## Files Read (Code Review)

| File | Purpose |
|---|---|
| `src/components/Train.tsx` | Verify readiness logic, safety checklist, exercise display |
| `src/components/FoodEntry.tsx` | Understand Add tab structure for UX-001 fix |
| `src/components/Analytics.tsx` | Trace FP-001 to display sites |
| `src/utils/storage.ts` | Find nutrition total compute lines for FP-001 fix |

---

## Destructive Commands NOT Run

Per the audit brief, the following were not used at any point:
- `git reset --hard`
- `git clean -fd`
- `git checkout -- .`
- `git restore .`
- Any forced push or branch deletion

No real passwords, API keys, or secrets were printed or stored.
