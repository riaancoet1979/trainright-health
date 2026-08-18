"""
TrainRight Health — Garmin Connect sync
Pulls the last 32 days of Garmin daily health and wellness statistics and writes
gh-sync.json, which the app auto-loads. The output filename MUST match
GARMIN_FILE in src/utils/health.ts.

Setup (once):
    pip install garminconnect
    python garmin_sync.py --login    (asks for email/password, may ask MFA code;
                                      token is saved so you won't log in again)
    python garmin_sync.py --bootstrap-sync  (pairs this script with the sync
                                              Worker so it can push into it;
                                              asks for the bootstrap code once)

Run (daily, or schedule with Task Scheduler / run_garmin_sync.bat):
    python garmin_sync.py                 (compact log, writes public/ + dist/)
    python garmin_sync.py --verbose       (prints per-day metrics — for debugging)
    python garmin_sync.py --public-only   (CI mode: writes only public/, build copies it)

Privacy:
    The output is private per-device health data. public/ and dist/ are
    gitignored and are served locally only. The GitHub workflow validates the
    importer but deliberately deletes the payload without uploading it.
"""

import getpass
import json
import math
import os
import re
import sys
import tempfile
from datetime import date, datetime, timedelta

import requests

try:
    from garminconnect import Garmin
except ImportError:
    print("Missing dependency. Run:  pip install garminconnect")
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
# Use the protected shared token store. Never copy Garmin credentials into the
# repository. GARMIN_TOKEN_DIR can override this for CI, where .garmin_tokens is
# restored from the encrypted GitHub secret.
TOKEN_DIR = os.environ.get(
    "GARMIN_TOKEN_DIR",
    os.path.join(os.path.expanduser("~"), "AppData", "Local", "hermes", "private", "garminconnect")
    if os.name == "nt" else os.path.join(HERE, ".garmin_tokens"),
)
# Filename MUST match GARMIN_FILE in src/utils/health.ts.
OUT_NAME = "gh-sync.json"
# Local runs: write to public/ (dev server) AND dist/ (preview server).
# CI runs: --public-only, then vite build copies public/ into dist/.
OUT_FILES_FULL = [
    os.path.join(HERE, "public", OUT_NAME),
    os.path.join(HERE, "dist", OUT_NAME),
]
OUT_FILES_PUBLIC = [os.path.join(HERE, "public", OUT_NAME)]
# Same protected directory Garmin's own tokens live in — never inside the repo,
# never served by the app. A device token for pushing into the sync Worker,
# separate from anything the browser holds.
SYNC_TOKEN_FILE = os.path.join(TOKEN_DIR, "trainright_sync_token.txt")
# Matches API_BASE in src/sync/config.ts — keep the two in sync if either changes.
API_BASE = "https://trainright-api.lifestyleapp.workers.dev"
DAYS = 32
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


def bootstrap_sync() -> None:
    """One-time pairing so this script can push into the sync Worker. Manual
    only — never called from main(), so the scheduled run can never hit this
    interactive prompt.

    Reads TRAINRIGHT_BOOTSTRAP_CODE if set, so the code can be piped in without
    a masked prompt — pasting into a hidden prompt silently yields nothing or a
    partial value on some Windows terminals, which is indistinguishable from a
    wrong code without the length echo below."""
    code = os.environ.get("TRAINRIGHT_BOOTSTRAP_CODE") or getpass.getpass("Bootstrap code: ")
    # Strip: a trailing newline or space from a paste would otherwise be sent
    # verbatim and rejected, with nothing on screen to explain why.
    code = code.strip()
    if not code:
        raise RuntimeError(
            "No bootstrap code received — the hidden prompt registered nothing.\n"
            "Copy the code to your clipboard, then in PowerShell:\n"
            "  $env:TRAINRIGHT_BOOTSTRAP_CODE = Get-Clipboard\n"
            "  python garmin_sync.py --bootstrap-sync\n"
            "  Remove-Item Env:TRAINRIGHT_BOOTSTRAP_CODE\n"
            "Or in Command Prompt:\n"
            "  set TRAINRIGHT_BOOTSTRAP_CODE=your-code-here\n"
            "  python garmin_sync.py --bootstrap-sync"
        )
    # Length only, never the value — enough to tell a truncated paste from a
    # wrong code, which is the exact ambiguity that made this fail silently.
    print(f"Read a {len(code)}-character bootstrap code.")

    response = requests.post(
        f"{API_BASE}/v1/auth/bootstrap",
        json={"code": code, "label": "Garmin Sync (Python)", "scope": "ingest"},
        timeout=15,
    )
    if response.status_code != 200:
        body = response.json() if response.content else {}
        message = (body.get("error") or {}).get("message", f"HTTP {response.status_code}")
        raise RuntimeError(f"Bootstrap failed: {message}")

    token = response.json()["token"]
    os.makedirs(os.path.dirname(SYNC_TOKEN_FILE), exist_ok=True)
    with open(SYNC_TOKEN_FILE, "w", encoding="utf-8") as f:
        f.write(token)
    print(f"Sync device paired — token saved to {SYNC_TOKEN_FILE}")


PUSH_BATCH_SIZE = 200  # Server caps a single push at 500 mutations; chunk well under it.


def _read_sync_token():
    if not os.path.isfile(SYNC_TOKEN_FILE):
        return None
    with open(SYNC_TOKEN_FILE, encoding="utf-8") as f:
        token = f.read().strip()
    return token or None


def push_garmin_daily(days: dict, synced_at: str) -> None:
    """Push each day as a garmin_daily mutation. Never raises — a push failure
    must never prevent gh-sync.json from having already been written; the next
    scheduled run is the retry, since Garmin is re-queried fresh every time."""
    token = _read_sync_token()
    if not token:
        print("Sync push skipped: not paired. Run: python garmin_sync.py --bootstrap-sync")
        return

    mutations = [
        {"domain": "garmin_daily", "id": day, "updatedAt": synced_at, "deleted": False, "fields": fields}
        for day, fields in days.items()
    ]

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    pushed = 0
    try:
        for i in range(0, len(mutations), PUSH_BATCH_SIZE):
            batch = mutations[i:i + PUSH_BATCH_SIZE]
            response = requests.post(
                f"{API_BASE}/v1/sync/push", headers=headers, json={"mutations": batch}, timeout=30,
            )
            if response.status_code != 200:
                print(f"Sync push failed: HTTP {response.status_code}")
                return
            results = response.json().get("results", [])
            rejected = [r for r in results if r.get("status") == "rejected"]
            for r in rejected:
                print(f"Sync push: {r.get('id')} rejected — {r.get('reason')}")
            pushed += len(batch) - len(rejected)
    except requests.RequestException as exc:
        print(f"Sync push failed: {type(exc).__name__}: {exc}")
        return

    print(f"Sync push: {pushed}/{len(mutations)} day(s) pushed to the phone/PC sync.")


PRIVATE_KEY_PARTS = (
    "user", "profile", "uuid", "device", "owner", "email", "password", "token",
    "imageurl", "privacy", "latitude", "longitude", "location", "address", "city",
    "country", "postal", "coordinate", "polyline", "mapurl", "firstname", "lastname",
    "fullname", "displayname", "serial", "account", "phone", "contact", "pointlat",
    "pointlon",
)
SAFE_STAT_KEY_PARTS = (
    "summary", "wellness", "calendar", "date", "timestamp", "timezone", "starttime",
    "endtime", "duration", "second", "minute", "hour", "count", "total", "average",
    "avg", "minimum", "maximum", "min", "max", "goal", "value", "score", "status",
    "qualifier", "level", "calorie", "kilocalorie", "distance", "meter", "step", "heart",
    "rate", "hrv", "stress", "battery", "spo2", "oxygen", "respiration", "sleep", "floor",
    "intensity", "hydration", "weight", "bmi", "fat", "muscle", "bone", "water", "vo2",
    "training", "recovery", "fitness", "age", "load", "pace", "speed", "cadence", "power",
    "elevation", "temperature", "energy", "efficiency", "aerobic", "anaerobic", "lactate",
    "threshold", "descriptor", "unit", "measurement", "restless", "awake", "deep", "light",
    "rem", "wake", "bed", "event", "split", "type", "sport", "activity",
    "moderate", "vigorous", "sedentary", "active", "charged", "drained", "ascended",
    "seconds", "minutes", "hours", "days", "hourly", "values", "scores", "levels",
    "calories", "meters", "steps", "averages", "events", "measurements", "descriptors",
    "statuses",
)
SAFE_TEXT_TOKENS = {
    "calendar", "date", "timestamp", "time", "timezone", "status", "qualifier",
    "type", "unit", "descriptor", "measurement",
}
SAFE_ID_KEYS = {"timezoneid"}
IDENTIFIER_KEY_SUFFIXES = (
    "primarykey", "recordkey", "activitykey", "personkey", "subjectkey", "accountkey",
    "ownerkey", "userkey", "profilekey", "devicekey",
)
RAW_SAMPLE_KEYS = {
    "wellnessepochspo2datadtolist", "sleepmovement", "bodybatteryvaluesarray",
    "respirationvaluesarray", "wellnessepochrespirationdatadtolist", "heartratevalues",
    "sleepheartrate", "stressvaluesarray", "hrvreadings", "sleepbodybattery",
    "sleepstress", "hrvdata", "sleeplevels", "sleeprestlessmoments",
}


def _normalize_key(key):
    return "".join(ch for ch in key.lower() if ch.isalnum())


def _is_private_key(key):
    normalized = _normalize_key(key)
    if normalized in SAFE_ID_KEYS:
        return False
    if normalized.endswith(("id", "pk")) or normalized.endswith(IDENTIFIER_KEY_SUFFIXES):
        return True
    return any(part in normalized for part in PRIVATE_KEY_PARTS)


def _key_tokens(key):
    expanded = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", str(key))
    return {part.lower() for part in re.split(r"[^A-Za-z0-9]+", expanded) if part}


def _is_safe_stat_key(key):
    normalized = _normalize_key(key)
    return normalized in SAFE_ID_KEYS or bool(_key_tokens(key).intersection(SAFE_STAT_KEY_PARTS))


def sanitize_value(value, key=None):
    if isinstance(value, dict):
        clean = {}
        for child_key, item in value.items():
            if _is_private_key(child_key) or not _is_safe_stat_key(child_key):
                continue
            sanitized = sanitize_value(item, child_key)
            if sanitized is not None:
                clean[child_key] = sanitized
        return clean
    if isinstance(value, list):
        if key and _normalize_key(key) in RAW_SAMPLE_KEYS:
            return None
        return [item for raw in value if (item := sanitize_value(raw, key)) is not None]
    if isinstance(value, str):
        if key and _key_tokens(key).intersection(SAFE_TEXT_TOKENS) and len(value) <= 128:
            return value
        return None
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return None


def sanitize_stats(value):
    """Preserve Garmin statistics/samples while removing IDs and location data."""
    clean = sanitize_value(value)
    return clean if isinstance(clean, dict) else {}


def sanitize_records(records):
    clean = sanitize_value(records or [])
    return clean if isinstance(clean, list) else []


def safe(fn, label, errors, default=None):
    try:
        return fn()
    except Exception as exc:
        errors.append(f"{label}:{type(exc).__name__}")
        return default


def _has_meaningful_data(value):
    if isinstance(value, dict):
        return any(key != "source" and _has_meaningful_data(item) for key, item in value.items())
    if isinstance(value, list):
        return any(_has_meaningful_data(item) for item in value)
    if isinstance(value, str):
        return bool(value.strip())
    return value is not None


def _has_non_finite(value):
    if isinstance(value, float):
        return not math.isfinite(value)
    if isinstance(value, dict):
        return any(_has_non_finite(item) for item in value.values())
    if isinstance(value, list):
        return any(_has_non_finite(item) for item in value)
    return False


def validate_payload(payload, errors):
    """Fail closed so a broken sync cannot replace the last known-good history."""
    if errors:
        raise RuntimeError(f"Garmin endpoint failures: {', '.join(errors[:5])}")
    if payload.get("source") != "garmin_connect":
        raise RuntimeError("unexpected Garmin payload source")
    days = payload.get("days") or {}
    if len(days) != DAYS:
        raise RuntimeError(f"expected {DAYS} daily records, got {len(days)}")
    for day_key, day in days.items():
        try:
            date.fromisoformat(day_key)
        except (TypeError, ValueError) as exc:
            raise RuntimeError(f"invalid Garmin day key: {day_key}") from exc
        if not isinstance(day, dict) or not _has_meaningful_data(day):
            raise RuntimeError("one or more Garmin daily records contain no metrics")
    if _has_non_finite(payload):
        raise RuntimeError("Garmin payload contains non-finite numeric values")


def _write_temp_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, temp_path = tempfile.mkstemp(
        dir=os.path.dirname(path), prefix=f".{os.path.basename(path)}.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=1, allow_nan=False)
            f.flush()
            os.fsync(f.fileno())
        return temp_path
    except Exception:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise


def write_json_transaction(paths, payload):
    """Publish one generation to all local destinations, rolling back on failure."""
    lock_path = os.path.join(HERE, ".garmin_sync.lock")
    lock_fd = None
    temps = {}
    backups = {}
    installed = []
    committed = False
    try:
        lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        for path in paths:
            temps[path] = _write_temp_json(path, payload)
        for path in paths:
            if os.path.exists(path):
                fd, backup = tempfile.mkstemp(
                    dir=os.path.dirname(path), prefix=f".{os.path.basename(path)}.", suffix=".bak"
                )
                os.close(fd)
                os.remove(backup)
                os.replace(path, backup)
                backups[path] = backup
        for path in paths:
            os.replace(temps[path], path)
            installed.append(path)
        committed = True
    except Exception as original_error:
        rollback_errors = []
        for path in reversed(installed):
            if os.path.exists(path):
                try:
                    os.remove(path)
                except OSError as exc:
                    rollback_errors.append(f"remove {path}: {exc}")
        for path, backup in backups.items():
            if os.path.exists(backup):
                try:
                    os.replace(backup, path)
                except OSError as exc:
                    rollback_errors.append(f"restore {path}: {exc}")
        if rollback_errors:
            raise RuntimeError(
                "Garmin output rollback incomplete; recovery backups retained: "
                + "; ".join(rollback_errors)
            ) from original_error
        raise
    finally:
        for temp_path in temps.values():
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
        # Backup cleanup happens only after commit. A cleanup failure must leave
        # the new generation intact; it may leave a harmless .bak for recovery.
        if committed:
            for backup in backups.values():
                if os.path.exists(backup):
                    try:
                        os.remove(backup)
                    except OSError:
                        pass
        if lock_fd is not None:
            os.close(lock_fd)
            if os.path.exists(lock_path):
                try:
                    os.remove(lock_path)
                except OSError:
                    pass


def _sleep_score(value):
    if isinstance(value, dict):
        return value.get("value") if value.get("value") is not None else value.get("score")
    return value


def _first_non_none(*values):
    return next((value for value in values if value is not None), None)


def extract_day(summary, sleep, hrv):
    """Extract useful daily Garmin health/wellness statistics without secrets."""
    summary = summary or {}
    dto = (sleep or {}).get("dailySleepDTO") or {}
    hrv_summary = (hrv or {}).get("hrvSummary") or {}
    day = {"source": "garmin_connect"}

    def add(key, value, transform=None):
        if value is None:
            return
        try:
            day[key] = transform(value) if transform else value
        except (TypeError, ValueError):
            return

    def add_text(key, value):
        if not isinstance(value, str):
            return
        bounded = value.strip()
        if bounded and len(bounded) <= 128:
            day[key] = bounded

    add("steps", summary.get("totalSteps"), int)
    add("stepGoal", summary.get("dailyStepGoal"), int)
    add("distanceKm", summary.get("totalDistanceMeters"), lambda v: round(float(v) / 1000, 3))
    add("totalCalories", summary.get("totalKilocalories"), int)
    add("activeCalories", summary.get("activeKilocalories"), int)
    add("bmrCalories", summary.get("bmrKilocalories"), int)
    add("rhr", summary.get("restingHeartRate"), int)
    add("minHeartRate", summary.get("minHeartRate"), int)
    add("maxHeartRate", summary.get("maxHeartRate"), int)
    add("averageStress", summary.get("averageStressLevel"), int)
    add_text("stressQualifier", summary.get("stressQualifier"))
    add("bodyBatteryWake", summary.get("bodyBatteryAtWakeTime"), int)
    add("bodyBatteryHigh", summary.get("bodyBatteryHighestValue"), int)
    add("bodyBatteryLow", summary.get("bodyBatteryLowestValue"), int)
    add("bodyBatteryLatest", summary.get("bodyBatteryMostRecentValue"), int)
    add("bodyBatteryCharged", summary.get("bodyBatteryChargedValue"), int)
    add("bodyBatteryDrained", summary.get("bodyBatteryDrainedValue"), int)
    add("averageSpo2", _first_non_none(dto.get("averageSpO2Value"), summary.get("averageSpo2")), float)
    add("lowestSpo2", _first_non_none(dto.get("lowestSpO2Value"), summary.get("lowestSpo2")), float)
    add("averageRespiration", _first_non_none(dto.get("averageRespirationValue"), summary.get("avgWakingRespirationValue")), float)
    add("moderateIntensityMinutes", summary.get("moderateIntensityMinutes"), int)
    add("vigorousIntensityMinutes", summary.get("vigorousIntensityMinutes"), int)
    add("floorsAscended", summary.get("floorsAscended"), int)
    add("sedentaryHours", summary.get("sedentarySeconds"), lambda v: round(float(v) / 3600, 2))
    add("activeHours", summary.get("activeSeconds"), lambda v: round(float(v) / 3600, 2))

    add("sleepHours", dto.get("sleepTimeSeconds"), lambda v: round(float(v) / 3600, 2))
    add("deepSleepHours", dto.get("deepSleepSeconds"), lambda v: round(float(v) / 3600, 2))
    add("lightSleepHours", dto.get("lightSleepSeconds"), lambda v: round(float(v) / 3600, 2))
    add("remSleepHours", dto.get("remSleepSeconds"), lambda v: round(float(v) / 3600, 2))
    add("awakeSleepHours", dto.get("awakeSleepSeconds"), lambda v: round(float(v) / 3600, 2))
    add("sleepScore", _sleep_score((dto.get("sleepScores") or {}).get("overall")), int)
    add("averageSleepStress", dto.get("avgSleepStress"), int)
    add("hrv", hrv_summary.get("lastNightAvg"), int)
    add("hrvWeeklyAvg", hrv_summary.get("weeklyAvg"), int)
    add_text("hrvStatus", hrv_summary.get("status"))
    return day


def main() -> None:
    g = login()
    out = {}
    errors = []
    today = date.today()
    for i in range(DAYS):
        d = today - timedelta(days=i)
        ds = d.isoformat()
        summary = safe(lambda: g.get_user_summary(ds), f"{ds}:summary", errors) or {}
        sleep = safe(lambda: g.get_sleep_data(ds), f"{ds}:sleep", errors) or {}
        hrv = safe(lambda: g.get_hrv_data(ds), f"{ds}:hrv", errors) or {}
        hydration = safe(lambda: g.get_hydration_data(ds), f"{ds}:hydration", errors) or {}
        spo2 = safe(lambda: g.get_spo2_data(ds), f"{ds}:spo2", errors) or {}
        respiration = safe(lambda: g.get_respiration_data(ds), f"{ds}:respiration", errors) or {}
        intensity = safe(lambda: g.get_intensity_minutes_data(ds), f"{ds}:intensity", errors) or {}
        heart_rates = safe(lambda: g.get_heart_rates(ds), f"{ds}:heart_rates", errors) or {}
        stress = safe(lambda: g.get_stress_data(ds), f"{ds}:stress", errors) or {}
        body_battery = safe(lambda: g.get_body_battery(ds, ds), f"{ds}:body_battery", errors, []) or []
        entry = extract_day(summary, sleep, hrv)
        entry["garminDetails"] = {
            "summary": sanitize_stats(summary),
            "sleep": sanitize_stats(sleep),
            "hrv": sanitize_stats(hrv),
            "hydration": sanitize_stats(hydration),
            "spo2": sanitize_stats(spo2),
            "respiration": sanitize_stats(respiration),
            "intensity": sanitize_stats(intensity),
            "heartRates": sanitize_stats(heart_rates),
            "stress": sanitize_stats(stress),
            "bodyBattery": sanitize_records(body_battery),
        }
        # Do not write source-only empty days.
        if len(entry) > 1:
            out[ds] = entry
        if VERBOSE:
            print(f"{ds}: {entry if len(entry) > 1 else 'no data'}")
        else:
            # Compact log: date + metric count only; no health values in logs.
            count = max(0, len(entry) - 1)
            print(f"{ds}: {count} metric(s)" if count else f"{ds}: no data")

    start_date = (today - timedelta(days=DAYS - 1)).isoformat()
    end_date = today.isoformat()
    activities_raw = safe(
        lambda: g.get_activities_by_date(start_date, end_date), "range:activities", errors, []
    ) or []
    body_raw = safe(
        lambda: g.get_body_composition(start_date, end_date), "range:body_composition", errors, {}
    ) or {}
    training_raw = safe(lambda: g.get_training_status(end_date), "latest:training_status", errors, {}) or {}
    fitness_age_raw = safe(lambda: g.get_fitnessage_data(end_date), "latest:fitness_age", errors, {}) or {}
    max_metrics_raw = safe(lambda: g.get_max_metrics(end_date), "latest:max_metrics", errors, []) or []

    payload = {
        "source": "garmin_connect",
        "syncedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "dateRange": {"start": start_date, "end": end_date, "timezone": "local dates from Garmin Connect"},
        "days": out,
        "activities": sanitize_records(activities_raw),
        "bodyComposition": {
            "startDate": body_raw.get("startDate"),
            "endDate": body_raw.get("endDate"),
            "totalAverage": sanitize_stats(body_raw.get("totalAverage") or {}),
            "records": sanitize_records(body_raw.get("dateWeightList") or []),
        },
        "fitness": {
            "trainingStatus": sanitize_stats(training_raw),
            "fitnessAge": sanitize_stats(fitness_age_raw),
            "maxMetrics": sanitize_records(max_metrics_raw),
        },
        "provenance": {
            "importer": "garmin_sync.py",
            "endpoints": [
                "user_summary", "sleep_data", "hrv_data", "hydration_data", "spo2_data",
                "respiration_data", "intensity_minutes_data", "heart_rates", "stress_data",
                "body_battery", "activities_by_date", "body_composition", "training_status",
                "fitness_age", "max_metrics",
            ],
            "normalizedUnits": {
                "steps": "count", "stepGoal": "count", "distanceKm": "km",
                "totalCalories": "kcal", "activeCalories": "kcal", "bmrCalories": "kcal",
                "rhr": "bpm", "minHeartRate": "bpm", "maxHeartRate": "bpm",
                "sleepHours": "hours", "deepSleepHours": "hours", "lightSleepHours": "hours",
                "remSleepHours": "hours", "awakeSleepHours": "hours", "hrv": "ms",
                "hrvWeeklyAvg": "ms", "averageSpo2": "percent", "lowestSpo2": "percent",
                "averageRespiration": "breaths/min", "moderateIntensityMinutes": "minutes",
                "vigorousIntensityMinutes": "minutes", "floorsAscended": "floors",
                "sedentaryHours": "hours", "activeHours": "hours",
            },
            "aggregateListsAndEventsIncluded": True,
            "rawHighFrequencySampleArraysIncluded": False,
            "excludedHighFrequencyKeys": sorted(RAW_SAMPLE_KEYS),
            "identifiersAndLocationsRemoved": True,
        },
    }
    validate_payload(payload, errors)
    out_files = OUT_FILES_PUBLIC if PUBLIC_ONLY else OUT_FILES_FULL
    write_json_transaction(out_files, payload)
    for out_file in out_files:
        print(f"Wrote {out_file}")
    print(f"\n{len(out)} days synced. Open the app to absorb it.")
    push_garmin_daily(out, payload["syncedAt"])


if __name__ == "__main__":
    if "--login" in sys.argv:
        login()
    elif "--bootstrap-sync" in sys.argv:
        bootstrap_sync()
    else:
        main()
