# Findings Report

**Audit date:** 2026-06-06

All findings from the full browser QA audit, classified by severity and including recommended fixes.

---

## Severity Scale

| Level | Definition |
|---|---|
| CRITICAL | Data loss, security vulnerability, or app unusable |
| HIGH | Core feature broken or significantly impaired |
| MEDIUM | Usability issue or data display error — fix before next release |
| LOW | Minor visual/UX issue — fix when convenient |
| INFO | Observation only — no action required |

---

## Active Findings

### FP-001 — Floating-Point Precision Display

| Field | Value |
|---|---|
| **ID** | FP-001 |
| **Severity** | MEDIUM |
| **Area** | Stats tab — Today's Progress |
| **Description** | Nutrition values computed from food database macros × grams display as unrounded floats. Example observed: `2007.7199999999998` instead of `2007.72`. This is a JavaScript floating-point arithmetic artefact. The underlying calculation is correct; only the display format is wrong. |
| **Reproduction** | Navigate to Stats tab → observe Today's Progress nutrition values with multiple food entries. |
| **Root cause** | Missing `toFixed(1)` or `Math.round()` wrapper around computed display values. |
| **Fix** | Wrap all numeric display values in a helper: `const fmt = (n: number) => Math.round(n * 10) / 10` or use `n.toFixed(1)`. Apply to all nutrition total displays. |
| **Test to add** | Unit test: `expect(formatNutrition(2007.7199999999998)).toBe('2007.7')` |
| **Status** | Open |

---

### UX-001 — Add Tab Missing Date Context Indicator

| Field | Value |
|---|---|
| **ID** | UX-001 |
| **Severity** | MEDIUM |
| **Area** | Add tab |
| **Description** | When the user selects a past date in the Calendar tab (e.g. June 5), then navigates to the Add tab, food is logged to the selected past date — not to today. The Add tab shows no indication of which date food is being logged to. A user unaware of this can silently log data to the wrong date. |
| **Reproduction** | 1. Navigate to Calendar. 2. Click June 5. 3. Navigate to Add tab. 4. Add food. 5. Check localStorage — entry appears under June 5, not June 6. |
| **Root cause** | `selectedDate` state in `App.tsx` persists across tab changes. The Add tab UI does not display `selectedDate`. |
| **Fix** | Add a date badge or banner to the Add tab header. Example: when `selectedDate !== today`, show a yellow banner: "Logging to: Friday, June 5 · Tap to switch to today". When `selectedDate === today`, show nothing (or a subtle "Today" badge). |
| **Test to add** | User journey test: after selecting past date, verify Add tab banner renders correctly. |
| **Status** | Open |

---

## Low Severity Findings

### TR-001 — Mobility Screen Volume Under YELLOW

| Field | Value |
|---|---|
| **ID** | TR-001 |
| **Severity** | LOW |
| **Area** | Train tab — YELLOW readiness |
| **Description** | The Mobility section displays "2 × 5 min (reduced — yellow)" under YELLOW readiness, but shows "1 × 5 min" under GREEN. This appears to increase volume for mobility work under YELLOW, which is counter-intuitive. |
| **Possible explanation** | This may be intentional — mobility/stretching may be expanded on reduced-volume days as compensatory recovery work. |
| **Recommended action** | Confirm intent with training program designer (Riaan). If intentional, add a comment to Train.tsx explaining the logic. If a bug, revert to 1× for mobility under YELLOW. |
| **Status** | Needs clarification |

---

### FDB-001 — Bacon (Grilled) Food Database Entry

| Field | Value |
|---|---|
| **ID** | FDB-001 |
| **Severity** | LOW |
| **Area** | Food database |
| **Description** | Bacon (Grilled) has identical values for protein and fat: both show as 35.01g (or similar) per 100g. This appears to be a copy-paste data entry error. |
| **Reference values** | USDA: Bacon (cured, cooked) per 100g = Protein ~37g, Fat ~42g. Protein ≠ Fat for any real bacon product. |
| **Fix** | Correct the Bacon (Grilled) entry in the food database JSON. Verify against USDA FoodData Central. |
| **Status** | Open |

---

### DATE-001 — No Midnight Auto-Refresh

| Field | Value |
|---|---|
| **ID** | DATE-001 |
| **Severity** | LOW |
| **Area** | App lifecycle |
| **Description** | If the app is open and the clock passes midnight, the displayed date does not update. The user would continue seeing yesterday's training session until they reload the page. |
| **Fix** | Add a `setInterval` or `requestAnimationFrame` check that compares the stored date with `new Date().toISOString().slice(0, 10)`. On mismatch (midnight crossed), reload or update the date state. |
| **Test to add** | Mock Date to simulate midnight crossing, verify date state updates. |
| **Status** | Open |

---

## Informational

### EXT-001 — Browser Extension localStorage Injection

| Field | Value |
|---|---|
| **ID** | EXT-001 |
| **Severity** | INFO |
| **Area** | localStorage |
| **Description** | Three localStorage keys injected by MetaMask/Binance/Trust Wallet browser extensions are present: `ethereum-https://...`, `binance-https://...`, `trust:cache:timestamp`. These are harmless — they cannot read app data (same-origin policy) and the app ignores them. |
| **Action** | No app change needed. User may disable wallet extensions on non-DeFi sites as a general practice. |
| **Status** | Informational |

---

## Findings Summary Table

| ID | Severity | Area | Status |
|---|---|---|---|
| FP-001 | MEDIUM | Stats — nutrition display | Open |
| UX-001 | MEDIUM | Add tab — date context | Open |
| TR-001 | LOW | Train — YELLOW mobility | Needs clarification |
| FDB-001 | LOW | Food database | Open |
| DATE-001 | LOW | App lifecycle | Open |
| EXT-001 | INFO | localStorage | Informational |

**No CRITICAL or HIGH findings.**
