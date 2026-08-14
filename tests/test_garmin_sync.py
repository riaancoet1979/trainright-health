import json
import os
import tempfile
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from garmin_sync import extract_day, sanitize_stats, validate_payload, write_json_transaction


class GarminExtractionTests(unittest.TestCase):
    def test_extracts_complete_daily_health_summary(self):
        summary = {
            "totalSteps": 9829,
            "totalDistanceMeters": 8813,
            "totalKilocalories": 3082,
            "activeKilocalories": 1019,
            "bmrKilocalories": 2063,
            "restingHeartRate": 59,
            "minHeartRate": 48,
            "maxHeartRate": 148,
            "averageStressLevel": 24,
            "bodyBatteryAtWakeTime": 77,
            "bodyBatteryHighestValue": 88,
            "bodyBatteryLowestValue": 31,
            "bodyBatteryMostRecentValue": 42,
            "bodyBatteryChargedValue": 57,
            "bodyBatteryDrainedValue": 46,
            "averageSpo2": 96.0,
            "lowestSpo2": 88,
            "avgWakingRespirationValue": 14.0,
            "moderateIntensityMinutes": 12,
            "vigorousIntensityMinutes": 18,
            "floorsAscended": 6,
            "sedentarySeconds": 36000,
            "activeSeconds": 7200,
        }
        sleep = {"dailySleepDTO": {
            "sleepTimeSeconds": 31080,
            "deepSleepSeconds": 5400,
            "lightSleepSeconds": 18000,
            "remSleepSeconds": 6480,
            "awakeSleepSeconds": 1200,
            "averageRespirationValue": 13.5,
            "averageSpO2Value": 95,
            "avgSleepStress": 12,
            "sleepScores": {"overall": {"value": 82}},
        }}
        hrv = {"hrvSummary": {"lastNightAvg": 47, "weeklyAvg": 45, "status": "BALANCED"}}

        day = extract_day(summary, sleep, hrv)

        self.assertEqual(day["steps"], 9829)
        self.assertEqual(day["distanceKm"], 8.813)
        self.assertEqual(day["sleepHours"], 8.63)
        self.assertEqual(day["sleepScore"], 82)
        self.assertEqual(day["hrv"], 47)
        self.assertEqual(day["hrvStatus"], "BALANCED")
        self.assertEqual(day["vigorousIntensityMinutes"], 18)
        self.assertEqual(day["sedentaryHours"], 10.0)
        self.assertEqual(day["source"], "garmin_connect")

    def test_sanitizer_preserves_stats_and_timestamps_but_removes_identifiers(self):
        raw = {
            "calendarDate": "2026-08-14",
            "startTimestampLocal": "2026-08-14T06:00:00",
            "valueInML": 2000,
            "userProfilePK": 123,
            "activityId": 987,
            "activityPK": 988,
            "primaryKey": 989,
            "recordKey": 990,
            "key": "SECRET-IDENTIFIER",
            "startLatitude": -29.1,
            "startLongitude": 26.2,
            "ownerDisplayName": "Private",
            "firstName": "Private",
            "serialNumber": "SECRET-SERIAL",
            "startPointLat": -29.1,
            "unexpected": "junk",
            "nested": {"weeklyTotal": 150, "deviceId": 456},
            "series": [1, 2, 3],
            "spO2HourlyAverages": [{"startTimestampLocal": "2026-08-14T06:00:00", "averageValue": 96}],
            "heartRateValues": [[1, 60], [2, 61]],
        }
        self.assertEqual(
            sanitize_stats(raw),
            {
                "calendarDate": "2026-08-14",
                "startTimestampLocal": "2026-08-14T06:00:00",
                "valueInML": 2000,
                "spO2HourlyAverages": [{"startTimestampLocal": "2026-08-14T06:00:00", "averageValue": 96}],
            },
        )

    def test_sleep_nulls_fall_back_to_summary_and_zero_score_is_preserved(self):
        day = extract_day(
            {"averageSpo2": 96, "lowestSpo2": 91, "avgWakingRespirationValue": 14.2},
            {"dailySleepDTO": {
                "averageSpO2Value": None,
                "lowestSpO2Value": None,
                "averageRespirationValue": None,
                "sleepScores": {"overall": {"value": 0}},
            }},
            {},
        )
        self.assertEqual(day["averageSpo2"], 96.0)
        self.assertEqual(day["lowestSpo2"], 91.0)
        self.assertEqual(day["averageRespiration"], 14.2)
        self.assertEqual(day["sleepScore"], 0)

    def test_normalized_status_strings_are_nonempty_and_bounded(self):
        day = extract_day(
            {"totalSteps": 10, "stressQualifier": "   "},
            {},
            {"hrvSummary": {"status": "x" * 129}},
        )
        self.assertNotIn("stressQualifier", day)
        self.assertNotIn("hrvStatus", day)

    def test_validation_rejects_empty_shell_days(self):
        shells = {
            (date(2026, 7, 1) + timedelta(days=offset)).isoformat(): {
                "source": "garmin_connect", "garminDetails": {}
            }
            for offset in range(32)
        }
        with self.assertRaisesRegex(RuntimeError, "contain no metrics"):
            validate_payload({"source": "garmin_connect", "days": shells}, [])
        whitespace_shells = {
            day_key: {"source": "garmin_connect", "garminDetails": {"summary": {"status": "   "}}}
            for day_key in shells
        }
        with self.assertRaisesRegex(RuntimeError, "contain no metrics"):
            validate_payload({"source": "garmin_connect", "days": whitespace_shells}, [])

    def test_validation_rejects_non_finite_statistics(self):
        days = {
            (date(2026, 7, 1) + timedelta(days=offset)).isoformat(): {
                "source": "garmin_connect", "steps": 1000
            }
            for offset in range(32)
        }
        days["2026-07-01"]["averageSpo2"] = float("nan")
        with self.assertRaisesRegex(RuntimeError, "non-finite"):
            validate_payload({"source": "garmin_connect", "days": days}, [])

    def test_multi_destination_write_rolls_back_if_second_install_fails(self):
        with tempfile.TemporaryDirectory() as root:
            first = os.path.join(root, "public", "gh-sync.json")
            second = os.path.join(root, "dist", "gh-sync.json")
            for path in (first, second):
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as handle:
                    json.dump({"generation": "old"}, handle)

            real_replace = os.replace

            def fail_second_temp(src, dst):
                if dst == second and src.endswith(".tmp"):
                    raise OSError("simulated second destination failure")
                return real_replace(src, dst)

            with patch("garmin_sync.os.replace", side_effect=fail_second_temp):
                with self.assertRaisesRegex(OSError, "simulated"):
                    write_json_transaction([first, second], {"generation": "new"})

            for path in (first, second):
                with open(path, encoding="utf-8") as handle:
                    self.assertEqual(json.load(handle), {"generation": "old"})

    def test_rollback_continues_and_retains_backup_when_one_restore_fails(self):
        with tempfile.TemporaryDirectory() as root:
            first = os.path.join(root, "public", "gh-sync.json")
            second = os.path.join(root, "dist", "gh-sync.json")
            for path in (first, second):
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as handle:
                    json.dump({"generation": "old"}, handle)

            real_replace = os.replace
            real_remove = os.remove

            def fail_install_and_first_restore(src, dst):
                if dst == second and src.endswith(".tmp"):
                    raise OSError("simulated install failure")
                if dst == first and src.endswith(".bak"):
                    raise OSError("simulated first restore failure")
                return real_replace(src, dst)

            def fail_first_new_remove(path):
                if path == first:
                    raise OSError("simulated remove failure")
                return real_remove(path)

            with patch("garmin_sync.os.replace", side_effect=fail_install_and_first_restore), \
                 patch("garmin_sync.os.remove", side_effect=fail_first_new_remove):
                with self.assertRaisesRegex(RuntimeError, "rollback incomplete"):
                    write_json_transaction([first, second], {"generation": "new"})

            with open(second, encoding="utf-8") as handle:
                self.assertEqual(json.load(handle), {"generation": "old"})
            retained = [name for name in os.listdir(os.path.dirname(first)) if name.endswith(".bak")]
            self.assertEqual(len(retained), 1)

    def test_backup_cleanup_failure_does_not_roll_back_committed_generation(self):
        with tempfile.TemporaryDirectory() as root:
            first = os.path.join(root, "public", "gh-sync.json")
            second = os.path.join(root, "dist", "gh-sync.json")
            for path in (first, second):
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as handle:
                    json.dump({"generation": "old"}, handle)

            real_remove = os.remove

            def fail_nonempty_backup_cleanup(path):
                if path.endswith(".bak") and os.path.exists(path) and os.path.getsize(path) > 0:
                    raise OSError("simulated backup cleanup failure")
                return real_remove(path)

            with patch("garmin_sync.os.remove", side_effect=fail_nonempty_backup_cleanup):
                write_json_transaction([first, second], {"generation": "new"})

            for path in (first, second):
                with open(path, encoding="utf-8") as handle:
                    self.assertEqual(json.load(handle), {"generation": "new"})

    def test_validation_rejects_endpoint_failures_without_overwriting_history(self):
        with self.assertRaisesRegex(RuntimeError, "Garmin endpoint failures"):
            validate_payload(
                {"source": "garmin_connect", "days": {"2026-08-14": {"steps": 10}}},
                ["2026-08-13:summary"],
            )

    def test_validation_rejects_empty_or_incomplete_day_ranges(self):
        with self.assertRaisesRegex(RuntimeError, "expected 32 daily records"):
            validate_payload({"source": "garmin_connect", "days": {}}, [])


if __name__ == "__main__":
    unittest.main()
