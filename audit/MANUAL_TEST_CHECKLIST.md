# Manual Test Checklist

Reusable for every release. Run after every non-trivial change.

## Environment

- [ ] `npm install` runs clean
- [ ] `npm run build` succeeds
- [ ] `npx vitest run` shows 71/71
- [ ] `npx tsc -b` shows no errors

## Train tab — safety primitives

- [ ] Open the app, set a program start date in the past (e.g. 8 weeks ago)
- [ ] Navigate to a Tue (Pull day)
- [ ] Verify the **Safety check** card is visible above the readiness picker
- [ ] Tick **chest pain** — verify
  - readiness banner shows "Today is a RED day"
  - Green / Yellow buttons are disabled
  - exercise list collapses to the RED-day banner
- [ ] Tick **clinician override** — verify the symptoms remain on record but the picker becomes interactive again (RED still selected unless changed)
- [ ] Untick everything — verify Green/Yellow re-enable and the regular exercise list returns

## Train tab — shoulder pain

- [ ] Set shoulder pain slider to 3 — verify any `painFreeOnly` exercises move into the "Removed today" block with the explicit pain reason

## Train tab — strict pull-up prerequisite

- [ ] Navigate to a Phase 4 Tue (week ≥ 12)
- [ ] With no logged `band_pullup` sessions at top reps, the first exercise should appear as **Band Pull-Up** with an amber **Prerequisite not met** sub-label
- [ ] Log two Phase 2 Tue sessions where every band-pullup set has reps = 8 and is marked done
- [ ] Reload the Phase 4 Tue — first exercise should now be **Strict Pull-Up Clusters** with no substitution banner

## Train tab — bodyweight

- [ ] Enter `810` in bodyweight — expect an amber warning, no save
- [ ] Enter `0` — expect "positive number" warning
- [ ] Enter `81.4` — expect a successful save and the "last:" stamp updates

## Readiness — stale Garmin

- [ ] In DevTools, set `localStorage.getItem('health_metrics_v1')` to an object with `syncedAt` 3 days ago — verify the Train tab shows "Last sync: 3 d ago — may be stale"
- [ ] Run `python garmin_sync.py` and reload — verify the stale notice disappears within a moment (page refresh)

## Privacy

- [ ] Run `git status` — `public/garmin_health.json` should not be listed (the gitignore is doing its job)
- [ ] Run `git ls-files public/` — should show `manifest.webmanifest`, `pwa-*.png`, `sw.js`, `vite.svg`. Should NOT show `garmin_health.json`
- [ ] Run `python garmin_sync.py` and confirm the log shows date + metric count, not raw metric values; rerun with `--verbose` to confirm verbose mode still works

## Coach — weekly review

- [ ] On the Analytics tab, navigate weeks back and forth — counters update; ChevronRight cannot go past the current week
- [ ] Log a band-pullup session with only 3 of 4 sets done at 8 reps — verify no "ready to progress" recommendation for that exercise

## Storage / portability

- [ ] Settings → Export all data — saves a JSON file
- [ ] Settings → Import full backup → choose that file — confirms imports
- [ ] Settings → Reset Fitness Data — fitness sub-tree is cleared but program logs survive

## PWA

- [ ] iOS Safari → Share → Add to Home Screen — icon appears
- [ ] Launch from home screen — app loads, works offline (after first online visit)

## Accessibility

- [ ] Tab through the Train tab — every input is reachable
- [ ] Toggle dark theme — every text element keeps readable contrast
