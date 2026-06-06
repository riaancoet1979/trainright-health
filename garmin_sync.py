"""
TrainRight Health — Garmin Connect sync
Pulls the last 14 days of steps, sleep, resting HR and HRV from Garmin
Connect and writes garmin_health.json, which the app auto-loads.

Setup (once):
    pip install garminconnect
    python garmin_sync.py --login    (asks for email/password, may ask MFA code;
                                      token is saved so you won't log in again)

Run (daily, or schedule with Task Scheduler / run_garmin_sync.bat):
    python garmin_sync.py            (compact log)
    python garmin_sync.py --verbose  (prints per-day metrics — for debugging)

Privacy:
    The output file is per-device personal health data. Both target paths
    (public/, dist/) are gitignored — the file is never committed and never
    deployed to public GitHub Pages. See audit/SECURITY_PRIVACY.md.
"""

import json
import os
import sys
from datetime import date, timedelta

try:
    from garminconnect import Garmin
except ImportError:
    print("Missing dependency. Run:  pip install garminconnect")
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN_DIR = os.path.join(HERE, ".garmin_tokens")
# Written to: public/ (dev server picks it up) and dist/ (production build
# serves it). Both paths are gitignored — see .gitignore. Never commit these.
OUT_FILES = [
    os.path.join(HERE, "public", "garmin_health.json"),
    os.path.join(HERE, "dist", "garmin_health.json"),
]
DAYS = 14
VERBOSE = "--verbose" in sys.argv or "-v" in sys.argv


def login() -> Garmin:
    # Try saved tokens first
    try:
        g = Garmin()
        g.login(TOKEN_DIR)
        return g
    except Exception:
        pass
    # Interactive login
    import getpass
    email = input("Garmin Connect email: ").strip()
    password = getpass.getpass("Garmin Connect password: ")
    g = Garmin(email=email, password=password, return_on_mfa=True)
    result1, result2 = g.login()
    if result1 == "needs_mfa":
        code = input("MFA code from your email/phone: ").strip()
        g.resume_login(result2, code)
    g.garth.dump(TOKEN_DIR)
    print(f"Login OK — tokens saved to {TOKEN_DIR}")
    return g


def safe(fn, default=None):
    try:
        return fn()
    except Exception:
        return default


def main() -> None:
    g = login()
    out = {}
    today = date.today()
    for i in range(DAYS):
        d = today - timedelta(days=i)
        ds = d.isoformat()
        entry = {}

        summary = safe(lambda: g.get_user_summary(ds)) or {}
        steps = summary.get("totalSteps")
        rhr = summary.get("restingHeartRate")
        if steps is not None:
            entry["steps"] = int(steps)
        if rhr is not None:
            entry["rhr"] = int(rhr)

        sleep = safe(lambda: g.get_sleep_data(ds)) or {}
        daily_sleep = (sleep.get("dailySleepDTO") or {})
        secs = daily_sleep.get("sleepTimeSeconds")
        if secs:
            entry["sleepHours"] = round(secs / 3600, 2)

        hrv = safe(lambda: g.get_hrv_data(ds)) or {}
        hrv_summary = (hrv.get("hrvSummary") or {})
        last_night = hrv_summary.get("lastNightAvg")
        if last_night is not None:
            entry["hrv"] = int(last_night)

        if entry:
            out[ds] = entry
        if VERBOSE:
            print(f"{ds}: {entry or 'no data'}")
        else:
            # Compact log: just the date + a metric-count summary, no raw values
            print(f"{ds}: {len(entry)} metric(s)" if entry else f"{ds}: no data")

    payload = {"source": "garmin", "syncedAt": today.isoformat(), "days": out}
    for out_file in OUT_FILES:
        os.makedirs(os.path.dirname(out_file), exist_ok=True)
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=1)
        print(f"Wrote {out_file}")
    print(f"\n{len(out)} days synced. Open the app to absorb it.")


if __name__ == "__main__":
    if "--login" in sys.argv:
        login()
    else:
        main()
