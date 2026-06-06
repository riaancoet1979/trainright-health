# Accessibility Assessment

**Audit date:** 2026-06-06

Assessment of keyboard navigation, form labels, color contrast, and ARIA attributes.

---

## Keyboard Navigation

| Element | Keyboard Accessible | Notes |
|---|---|---|
| Bottom navigation tabs | ✅ Yes | Standard `<button>` elements, focusable |
| Readiness buttons (GREEN/YELLOW/RED) | ✅ Yes | `<button>` elements |
| Safety checkboxes | ✅ Yes | `<input type="checkbox">` with labels |
| Shoulder pain slider | ✅ Yes | `<input type="range">`, keyboard adjustable |
| Exercise Log button | ✅ Yes | `<button>` |
| Mark Complete button | ✅ Yes | `<button>` |
| Food search input | ✅ Yes | `<input>` with focus state |
| Add Food button | ✅ Yes | `<button>`, disabled state uses HTML disabled attr |
| Settings inputs | ✅ Yes | Standard `<input>` and `<select>` |

---

## Form Labels

| Input | Has Label | Method | Result |
|---|---|---|---|
| Bodyweight input | ⚠️ Implicit | Placeholder "kg" serves as hint, no explicit `<label>` | ⚠️ Partial |
| Exercise weight inputs | ⚠️ Implicit | Placeholder "kg / band" — no explicit `<label for>` | ⚠️ Partial |
| Exercise reps inputs | ⚠️ Implicit | Placeholder "reps" — no explicit `<label for>` | ⚠️ Partial |
| Food search | ✅ Yes | "Search food..." placeholder + surrounding context | ⚠️ Partial |
| Meal type select | ✅ Yes | Label present | ✅ Pass |
| Settings date input | ✅ Yes | Label text above | ✅ Pass |
| Safety checkboxes | ✅ Yes | Label text beside each checkbox | ✅ Pass |
| Portion input | ✅ Yes | Label "Portion (g):" present | ✅ Pass |

Note: Missing explicit `<label for>` on exercise inputs and bodyweight input is an accessibility gap (particularly for screen reader users), but does not affect sighted keyboard users.

---

## Color Contrast

| Element | Colors Used | Estimated Contrast | Result |
|---|---|---|---|
| Body text on white | #1f2937 on #ffffff | ~16:1 | ✅ Pass |
| GREEN readiness button | White text on green | ~4.5:1 (estimated) | ✅ Pass |
| YELLOW readiness button | White text on amber | ~3.0:1 (estimated) | ⚠️ May fail WCAG AA for small text |
| RED readiness button | White text on red | ~5.1:1 (estimated) | ✅ Pass |
| Disabled Add Food button | Gray text on lighter gray | ~2.5:1 | ⚠️ May fail for small text |
| Navigation active (green) | Green text on white | ~4.5:1 (estimated) | ✅ Pass |

Note: Contrast values are estimated from Tailwind color classes; full WCAG 2.1 AA audit requires a contrast analyzer tool.

---

## ARIA Attributes

| Element | ARIA Usage | Result |
|---|---|---|
| Navigation buttons | No explicit role (semantically correct `<button>`) | ✅ Acceptable |
| Exercise log sections | No ARIA landmarks — sections are div-based | ⚠️ Could use `role="region"` |
| Charts (react-chartjs-2) | Canvas elements — no alt text provided | ⚠️ Accessibility gap for screen reader users |
| Safety checkboxes | Wrapped in `<label>` — implicit association | ✅ Pass |

---

## Focus Indicators

Standard browser focus rings observed on buttons and inputs. No CSS that removes `:focus` outlines entirely was detected.

---

## Findings Summary

| ID | Area | Severity | Description |
|---|---|---|---|
| A-001 | Form labels | Low | Exercise weight/reps inputs lack explicit `<label for>` — use aria-label or label elements |
| A-002 | Chart accessibility | Low | Canvas charts have no alt text or aria-label for screen reader users |
| A-003 | Color contrast | Low | YELLOW button and disabled states may not meet WCAG AA 4.5:1 for small text |

None of these are blockers for sighted users. Full WCAG 2.1 AA compliance would require addressing A-001 through A-003.
