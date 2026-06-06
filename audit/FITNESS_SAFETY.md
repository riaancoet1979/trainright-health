# Fitness & Exercise Safety

## In-scope safety primitives

| Primitive | Where | Status |
|---|---|---|
| No-overhead-pressing rule | `program.ts` — landmine is the only pressing line; `__tests__/training.spec.ts` enforces zero overhead occurrences | ✅ |
| Hanging starts feet-supported | `scap_pull_supported` is the only hang-related work until Phase 3 eccentrics; both `painFreeOnly` | ✅ |
| Shoulder-pain gating | Slider value > 2/10 removes every `painFreeOnly: true` exercise | ✅ |
| Yellow readiness reduces volume | drops `yellowSkip: true` accessories, drops 1 set on the rest (floor 2) | ✅ |
| Red readiness skips training | UI replaces the exercise list with a "no hard training" banner + medical-help nudge | ✅ |
| Submaximal Week 1 | every set RIR ≥ 2 or AMRAP-2 | ✅ |
| No max-out / failure training | RIR present on every working set | ✅ |
| Bodyweight-input sanity | clamped 20–300 kg after fix (Finding L-04) | ✅ |
| Strict pull-up prerequisite | hang ≥ 30 s pain-free **enforced in code** after fix H-03 | ✅ |
| Red-flag symptom screen (chest pain / dizziness / breathlessness / illness) | new always-on checklist on Train tab after fix H-02 | ✅ |
| Medical-disclaimer surface | RED-day banner + sticky shoulder banner + permanent disclaimer footer (added during this pass) | ✅ |

## Findings

| ID | Severity | Status |
|---|---|---|
| H-02 | High — no red-flag screen | Fixed |
| H-03 | High — pull-up prereq unenforced | Fixed |
| M-05 | Medium — coach progressed on a missing set | Fixed |
| L-04 | Low — bodyweight upper bound | Fixed |

## Under-18 / pregnancy / clinical-population guardrails

The user is a 46-year-old male; the program is built for this single user. Under-18 modifications, pregnancy modifications, and clinical-population modifications are explicitly **out of scope** for this deployment (documented in PROGRAM.md). The red-flag checklist now provides a universal escape valve (forces RED) which is the right primitive if the app is ever re-purposed.

## Calisthenics skill prerequisites

Prerequisites enforced after H-03 fix:

| Skill | Required floor | How enforced |
|---|---|---|
| Strict pull-up (Phase 4 Tue) | hang ≥ 30 s, pain-free | `evaluatePrerequisites()` reads `dead_hang`/`scap_pull_supported` history, swaps to `band_pullup` regression when unmet, surfaces an explanation banner |
| Handstand | deferred until pain-free + physio clearance (documented) | not in program until added by user |
| L-sit | tuck → adv-tuck → one-leg → full (already phased in program) | program structure |
| Pistol | high-box → low-box → full (already phased) | program structure |

## Conclusion

The program has good safety bones: hard rules around the shoulder are encoded, readiness adjustments are real, and the rest-day path is explicit. The two real safety gaps were the missing red-flag screen (any non-shoulder acute symptom) and the unenforced strict-pull-up prerequisite. Both are closed.
