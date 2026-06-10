# Security & Privacy

## Threat model

This is a **single-user PWA** that runs entirely in the browser. The threats that apply are not the OWASP-Top-10 server threats but the data-leak threats of a static site that handles fitness/health data:

1. Personal health metrics (sleep, HRV, resting HR) being published unintentionally with the deployed artifact.
2. Garmin Connect credentials being persisted in tracked files.
3. Public source maps revealing personal program contents in a way an end-user wouldn't expect.
4. Browser-storage data being leaked to third-party scripts (analytics, error reporting, CDN trackers).

The threats that **do not apply** in any meaningful sense and have not been pursued:

- Cross-user access (no users).
- Server-side auth / authz / SSRF / SQLi / etc. (no server).
- JWT or session hijacking (no sessions).
- AI-output injection or training-data poisoning (no AI).
- Tenant isolation (single tenant).

## Findings

| ID | Severity | Topic | Status |
|---|---|---|---|
| H-01 | High | `public/garmin_health.json` committed and deployed publicly | Fixed |
| M-07 | Medium | `garmin_sync.py` prints raw metrics by default | Fixed |
| — | n/a | Garmin password persistence | Already safe — interactive `getpass`, no token in tracked files |
| — | n/a | localStorage at-rest encryption | Accepted risk — local journal on a personal device |
| — | n/a | XSS surface | Clean — no `dangerouslySetInnerHTML`, no `eval`, no `innerHTML` writes |
| — | n/a | Third-party analytics / telemetry | None present (verified with `grep -rE "(google-analytics|sentry|posthog|amplitude)" src public` → 0 matches) |
| — | n/a | Source-maps in production | Default Vite config does not emit them |

## Authentication / Authorization

Not applicable — there are no users. All state is per-device localStorage.

## Health-data flow

```
Garmin Connect ── garmin_sync.py ──► local file (gitignored after fix)
                                    │
                                    ▼
                          fetch('garmin_health.json')
                                    │
                                    ▼
                              localStorage
                                    │
                                    ▼
                     UI only — never POSTed off-device
```

After fix H-01:

- `garmin_sync.py` writes to `garmin_health.json` (project root) and `dist/garmin_health.json` only.
- `garmin_health.json` and `dist/` are both git-ignored.
- The previous `public/garmin_health.json` is reset to `{"days":[]}` (already empty in baseline) and `public/garmin_health.json` is excluded going forward.
- The dev server falls back to the project root so a developer running `npm run dev` still picks up live Garmin syncs without committing them.

## Secrets

| Asset | Storage | Status |
|---|---|---|
| Garmin email + password | `input()` / `getpass.getpass()` at runtime | Never stored on disk in clear text |
| Garmin OAuth tokens | `./.garmin_tokens/` | git-ignored (`.gitignore:4`) — verified |
| API keys (LLM, analytics, etc.) | None — not used | n/a |

## Logging risk

- `garmin_sync.py` previously printed per-day metric dicts (Finding M-07). Fixed to a count summary unless `--verbose`.
- Front-end has no `console.log` of health data in production paths.

## Data-deletion controls

- `Settings.tsx` → *Reset Fitness Data* clears fitness sub-tree of every daily entry.
- `ProgramSettings.tsx` → *Export all data* gives the user a JSON snapshot of every key the app uses.
- A complete reset is one `localStorage.clear()` away (the user can do this via DevTools).

## Consent

No remote services receive health data. No consent UI is required for the data flows that actually exist.

## Audit conclusion

After remediation, the only externally observable surface is the static site itself: HTML, CSS, JS, a service worker, and a small empty placeholder JSON. No PII can be leaked through this surface. Garmin sync is now fully local-only.
