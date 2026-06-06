# Browser Environment

**Audit date:** 2026-06-06  
**App URL:** https://riaancoet1979.github.io/trainright-health/

## Browser

| Property | Value |
|---|---|
| Browser | Google Chrome (via Claude-in-Chrome MCP) |
| Viewport | 1568 × 698 px (desktop) |
| Protocol | HTTPS |
| Origin | https://riaancoet1979.github.io |
| PWA manifest | https://riaancoet1979.github.io/trainright-health/manifest.webmanifest |
| Service worker | Registered via vite-plugin-pwa (Workbox) |

## App Technical Stack

| Property | Value |
|---|---|
| Framework | React 18 + TypeScript |
| Build tool | Vite 7.x |
| Styling | Tailwind CSS |
| Charts | react-chartjs-2 + chart.js; custom SVG MiniLineChart in BodyStats |
| Icons | lucide-react |
| Date handling | date-fns |
| Storage | localStorage only (no backend) |
| PWA | vite-plugin-pwa with Workbox |
| Deployment | GitHub Pages (base: /trainright-health/) |
| Test runner | Vitest (jsdom environment) |
| Node (sandbox) | v22.22.0, npm 10.9.4 |

## localStorage Keys (observed)

| Key | Purpose |
|---|---|
| `health_training_v1` | Program logs, readiness, sets, bodyweight, program start date |
| `nutrition_tracker_daily_entries` | Daily food and activity entries |
| `nutrition_tracker_user_settings` | Nutrition targets (separate from training targets) |
| `nutrition_tracker_custom_foods` | User-created custom food items |
| `nutrition_tracker_achievements` | Streak and achievement data |
| `trainright_body_stats` | Body measurement history (weight, body fat, waist, etc.) |
| `health_metrics_v1` | Garmin sync timestamp and merged health metrics |

### Third-party keys (browser extension — not app)
| Key | Source |
|---|---|
| `ethereum-https://riaancoet1979.github.io` | MetaMask or similar crypto wallet extension |
| `binance-https://riaancoet1979.github.io` | Binance wallet extension |
| `trust:cache:timestamp` | Trust Wallet extension |

These injected keys are irrelevant to app function and pose no risk.

## Console Errors at Load

No console errors observed during initial page load or during any tab navigation.

## Network Requests

The app is entirely client-side. No XHR or Fetch API calls were made to external servers during testing. The Garmin sync module attempted to fetch a local file (`garmin_sync.py` output JSON) but correctly handled the 404 silently, showing "last synced just now" with no data.

## Service Worker

Service worker registered successfully. No caching conflicts observed during hard reload testing.
