# Security & Privacy Report

**Audit date:** 2026-06-06

Assessment of data handling, input security, localStorage privacy, and third-party risks.

---

## Data Storage

All user data is stored exclusively in the browser's localStorage. No data is sent to any external server.

| Check | Result | Notes |
|---|---|---|
| No external API calls during normal operation | ✅ Pass | Confirmed via network request monitoring |
| No user data uploaded to third-party service | ✅ Pass | Fully client-side |
| No authentication tokens stored | ✅ Pass | App has no login/auth system |
| No passwords or API keys in localStorage | ✅ Pass | Only training/nutrition data stored |
| No PII beyond what user explicitly enters | ✅ Pass | No name, email, or ID fields required |

---

## localStorage Keys — Content Review

| Key | Contains Sensitive Data | Classification |
|---|---|---|
| `health_training_v1` | Health training logs, bodyweight | Personal health data (user-entered) |
| `nutrition_tracker_daily_entries` | Food diary, calories | Personal health data (user-entered) |
| `nutrition_tracker_user_settings` | Macro targets | Non-sensitive preferences |
| `nutrition_tracker_custom_foods` | Custom food items | Non-sensitive |
| `nutrition_tracker_achievements` | Achievement data | Non-sensitive |
| `trainright_body_stats` | Weight, body fat, measurements | Personal health data (user-entered) |
| `health_metrics_v1` | Garmin sync data | Personal health data (device-synced) |

**Note:** localStorage is accessible to any JavaScript running on the same origin (`riaancoet1979.github.io`). Since this is a personal-use app on a private GitHub Pages URL, the risk surface is limited. For a multi-user or commercial deployment, encryption at rest would be recommended.

---

## Third-Party localStorage Injection (EXT-001)

During the audit, three unexpected localStorage keys were observed:

| Key | Source |
|---|---|
| `ethereum-https://riaancoet1979.github.io` | MetaMask or similar crypto wallet extension |
| `binance-https://riaancoet1979.github.io` | Binance wallet extension |
| `trust:cache:timestamp` | Trust Wallet extension |

These are injected by browser extensions, not by the app. They cannot read the app's health data (same-origin policy protects app keys). No action required from the app side.

**Recommendation:** The user may wish to disable wallet extensions when not using DeFi apps, as a general good practice.

---

## Input Validation

| Input | Validation Present | Notes |
|---|---|---|
| Bodyweight (kg) | ✅ Yes — `min=20 max=300` HTML attributes | Server-side not applicable (client-only) |
| Exercise weight/reps | ⚠️ Text inputs — no HTML min/max | Values stored as strings; non-numeric not blocked at HTML level |
| Food portion (grams) | ⚠️ Number input, no explicit min > 0 | Negative values may be accepted |
| Program start date | ✅ Yes — `<input type="date">` | Date format enforced by browser |
| Settings targets | ✅ Number inputs | Standard browser validation |

Note: No XSS injection risk — React's JSX rendering escapes all output. Stored strings are displayed through React state, not via `innerHTML`.

---

## XSS Assessment

| Vector | Risk | Notes |
|---|---|---|
| User input displayed back via React JSX | ✅ Safe | React escapes all JSX string output |
| localStorage values rendered in UI | ✅ Safe | Via React state, not innerHTML |
| Food database name display | ✅ Safe | Static JSON, no user-controlled injection |
| Notes textarea | ✅ Safe | Rendered as text content, not HTML |

No XSS vulnerability found.

---

## HTTPS / Transport Security

App deployed on GitHub Pages with enforced HTTPS. All assets loaded over HTTPS. No mixed-content warnings observed.

---

## Data Export

The "Export all data" feature serializes all localStorage keys to a JSON file downloaded to the user's device. This is intended behavior. The exported file contains personal health data — users should treat it like any other personal health document.

---

## Summary

For a personal-use PWA with no backend, the security posture is appropriate. No XSS vulnerabilities, no external data leakage, no credentials at risk. The health data stored in localStorage is personal but low-risk given the single-user, private-repo context.

| Category | Result |
|---|---|
| Data exfiltration | ✅ None found |
| XSS | ✅ Safe (React JSX escaping) |
| Authentication bypass | ✅ N/A (no auth system) |
| Sensitive data in network | ✅ None |
| Third-party extension injection | ℹ️ EXT-001 (browser extension, not app issue) |
