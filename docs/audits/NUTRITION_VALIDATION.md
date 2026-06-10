# Nutrition Validation

## What the app actually calculates

The nutrition engine in this app is **not** a TDEE / Mifflin-St-Jeor calculator. It uses **fixed per-phase macro targets** that are baked in, plus a day-type switch (training vs rest). This is appropriate for a single-user personalised plan where targets were decided once during onboarding (see `PROGRAM.md` for the rationale and the user's body composition / phase).

| Source | Target |
|---|---|
| `DEFAULT_DAY_TYPE_TARGETS.training` | 2,000 kcal · 160 P · 130 C · 95 F |
| `DEFAULT_DAY_TYPE_TARGETS.rest`     | 1,850 kcal · 160 P · 95 C · 95 F |
| `LEAN_GAIN_TARGETS.training`        | 2,350 kcal · 160 P · 215 C · 95 F |
| `LEAN_GAIN_TARGETS.rest`            | 2,150 kcal · 160 P · 165 C · 95 F |

## Independent recalculation

Cross-check using 4 kcal/g protein, 4 kcal/g carb, 9 kcal/g fat:

| Preset | Protein kcal | Carb kcal | Fat kcal | Sum | Stated | Δ |
|---|---:|---:|---:|---:|---:|---:|
| Fat-loss training | 640 | 520 | 855 | 2,015 | 2,000 | +0.75 % |
| Fat-loss rest     | 640 | 380 | 855 | 1,875 | 1,850 | +1.35 % |
| Lean-gain training| 640 | 860 | 855 | 2,355 | 2,350 | +0.21 % |
| Lean-gain rest    | 640 | 660 | 855 | 2,155 | 2,150 | +0.23 % |

All four presets reconcile within ~1.5 % of the stated kcal value — within rounding noise. **PASS.**

## Day-type switching

`getTargetsForDate(date)` returns `training` when `isTrainingDay(date)` is true and `rest` otherwise. Verified by existing test `training.spec.ts > "returns training targets on training days, rest otherwise"` (passes).

## Food-database sanity

`foodValidation.ts` recomputes each food's kcal from `4·P + 4·C + 9·F` and flags items whose stated kcal differ by more than 20 % (35 % for sub-50-kcal foods, which is correct given fibre / alcohol / water content). Run by `__tests__/foodDatabase.spec.ts`: 11 tests pass, including a full-database sweep.

## User-input validation on custom foods

`Settings.tsx` enforces:

- Name 3–100 chars, no duplicate (case-insensitive)
- Calories 0–9,999
- Each macro 0–999.9 g
- Piece-based foods require average-weight 1–9,999 g
- Warning shown when `|stated kcal − 4·P + 4·C + 9·F| > 20 %`

This matches and slightly exceeds the prompt's "weakened validation" guard.

## Calorie-deficit safety

Weekly review checks:

- Average protein < 130 g → action insight ("at risk of losing muscle in a deficit")
- Weight loss > 0.8 kg/week → action insight ("too fast, add ~150 kcal/day")
- Calories < target − 400 yesterday → warning ("eat to target today")

The lower bound is **never** allowed to undercut 1,850 kcal in the shipped presets. There is no UI path that would set a starvation-level target without user override; the Settings input has `min="0"` (preserved) but the program presets cannot be invalidated by user input.

## What the prompt asked that does not apply

| Topic | Why N/A |
|---|---|
| BMR / TDEE formula audit | App uses fixed presets, not a formula |
| Under-18 protections | App user is 46 |
| Allergen filtering | Single-user omnivore deployment; the food database includes all known allergens and the user picks |
| Vegan / vegetarian / halal preset | Out of scope for this deployment |

## Conclusion

Nutrition implementation is correct for what it claims to do. The reconciliation passes within 1.5 %, the food database validator is solid, user-input bounds prevent the obvious foot-guns, and the Coach engine surfaces the dangerous trends (under-protein, too-fast weight loss) the audit prompt asked for. No remediation required in this section.
