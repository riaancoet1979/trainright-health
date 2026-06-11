"""
TrainRight Health — Garmin Connect sync
Pulls the last 14 days of steps, sleep, resting HR and HRV from Garmin
Connect and writes gh-sync.json, which the app auto-loads. The output
filename MUST match GARMIN_FILE in src/utils/health.ts.

Setup (once):
    pip install garminconnect
    python garmin_sync.py --login    (asks for email/password, may ask MFA code;
                                      token is saved so you won't log in again)

Run (daily, or schedule with Task Scheduler / run_garmin_sync.bat):
    python garmin_sync.py                 (compact log, writes public/ + dist/)
    python garmin_sync.py --verbose       (prints per-day metrics — for debugging)
    python garmin_sync.py --public-only   (CI mode: writes only public/, build copies it)

Privacy:
    The output file is per-device personal health data. The local paths
    (public/, dist/) are gitignored. In CI (Option A), the file IS bundled
    into the GitHub Pages artifact — the URL is reachable but unguessable
    enough to deter casual scanning; do not treat as private.
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
# Filename MUST match GARMIN_FILE in src/utils/health.ts.
OUT_NAME = "gh-sync.json"
# Local runs: write to public/ (dev server) AND dist/ (preview server).
# CI runs: --public-only, then vite build copies public/ into dist/.
OUT_FILES_FULL = [
    os.path.join(HERE, "public", OUT_NAME),
    os.path.join(HERE, "dist", OUT_NAME),
]
OUT_FILES_PUBLIC = [os.path.join(HERE, "public", OUT_NAME)]
DAYS = 14
VERBOSE = "--verbose" in sys.argv or "-v" in sys.argv
PUBLIC_ONLY = "--public-only" in sys.argv


def login() -> Garmin:
    # Token store: garminconnect >= 0.3 saves/loads garmin_tokens.json in the
    # directory passed to login(); GARMINTOKENS pins it for all code paths.
    os.environ.setdefault("GARMINTOKENS", TOKEN_DIR)

    # 1) Try saved tokens in our project dir
    try:
        g = Garmin()
        g.login(TOKEN_DIR)
        return g
    except Exception:
        pass

    # 2) A previous (crashed) login may have auto-saved tokens to the
    #    library default ~/.garminconnect — adopt them into TOKEN_DIR.
    default_store = os.path.expanduser("~/.garminconnect")
    default_file = os.path.join(default_store, "garmin_tokens.json")
    if os.path.isfile(default_file):
        try:
            os.makedirs(TOKEN_DIR, exist_ok=True)
            import shutil
            shutil.copy2(default_file, os.path.join(TOKEN_DIR, "garmin_tokens.json"))
            g = Garmin()
            g.login(TOKEN_DIR)
            print(f"Adopted existing tokens from {default_store} -> {TOKEN_DIR}")
            return g
        except Exception:
            pass

    # 3) Interactive login (new API: prompt_mfa callback, login(path) saves tokens)
    import getpass
    email = input("Garmin Connect email: ").strip()
    password = getpass.getpass("Garmin Connect password: ")
    g = Garmin(email, password, prompt_mfa=lambda: input("MFA code from your email/phone: ").strip())
    g.login(TOKEN_DIR)
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
    out_files = OUT_FILES_PUBLIC if PUBLIC_ONLY else OUT_FILES_FULL
    for out_file in out_files:
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
