import json
import os
import tempfile
import unittest
import unittest.mock
from datetime import date, timedelta
from unittest.mock import patch

import requests

import garmin_sync
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


class GarminSyncBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.token_file = os.path.join(self.tmp_dir, "trainright_sync_token.txt")
        patcher = patch("garmin_sync.SYNC_TOKEN_FILE", self.token_file)
        self.addCleanup(patcher.stop)
        patcher.start()

    def test_bootstrap_sync_saves_token_on_success(self):
        response = unittest.mock.Mock(status_code=200)
        response.json.return_value = {"token": "tok_abc123", "deviceId": "d1"}
        with patch("garmin_sync.getpass.getpass", return_value="the-bootstrap-code"), \
             patch("garmin_sync.requests.post", return_value=response) as post:
            garmin_sync.bootstrap_sync()

        self.assertTrue(os.path.isfile(self.token_file))
        with open(self.token_file, encoding="utf-8") as f:
            self.assertEqual(f.read().strip(), "tok_abc123")
        called_url, called_kwargs = post.call_args[0][0], post.call_args[1]
        self.assertTrue(called_url.endswith("/v1/auth/bootstrap"))
        self.assertEqual(called_kwargs["json"]["scope"], "ingest")
        self.assertEqual(called_kwargs["json"]["code"], "the-bootstrap-code")

    def test_bootstrap_sync_does_not_save_a_token_on_rejection(self):
        response = unittest.mock.Mock(status_code=401)
        response.json.return_value = {"error": {"code": "bad_code", "message": "Bootstrap code rejected."}}
        with patch("garmin_sync.getpass.getpass", return_value="wrong"), \
             patch("garmin_sync.requests.post", return_value=response):
            with self.assertRaises(RuntimeError):
                garmin_sync.bootstrap_sync()

        self.assertFalse(os.path.isfile(self.token_file))


class GarminSyncPushTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.token_file = os.path.join(self.tmp_dir, "trainright_sync_token.txt")
        patcher = patch("garmin_sync.SYNC_TOKEN_FILE", self.token_file)
        self.addCleanup(patcher.stop)
        patcher.start()

    def _write_token(self, token="tok_test"):
        with open(self.token_file, "w", encoding="utf-8") as f:
            f.write(token)

    def test_skips_silently_with_no_token(self):
        with patch("garmin_sync.requests.post") as post:
            garmin_sync.push_garmin_daily({"2026-08-16": {"steps": 100}}, "2026-08-17T06:30:00")
        post.assert_not_called()

    def test_pushes_one_mutation_per_day_with_the_right_shape(self):
        self._write_token()
        response = unittest.mock.Mock(status_code=200)
        response.json.return_value = {"revision": 1, "results": [{"id": "2026-08-16", "status": "applied"}]}
        with patch("garmin_sync.requests.post", return_value=response) as post:
            garmin_sync.push_garmin_daily({"2026-08-16": {"steps": 100, "rhr": 55}}, "2026-08-17T06:30:00")

        post.assert_called_once()
        url, kwargs = post.call_args[0][0], post.call_args[1]
        self.assertTrue(url.endswith("/v1/sync/push"))
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer tok_test")
        mutation = kwargs["json"]["mutations"][0]
        self.assertEqual(mutation["domain"], "garmin_daily")
        self.assertEqual(mutation["id"], "2026-08-16")
        self.assertEqual(mutation["deleted"], False)
        self.assertEqual(mutation["fields"], {"steps": 100, "rhr": 55})
        self.assertEqual(mutation["updatedAt"], "2026-08-17T06:30:00")

    def test_chunks_at_200_mutations_per_request(self):
        self._write_token()
        fake_days = {f"2020-01-{i:02d}" if i <= 31 else f"2020-02-{i - 31:02d}": {"steps": i} for i in range(1, 451)}
        response = unittest.mock.Mock(status_code=200)
        response.json.return_value = {"revision": 1, "results": []}

        with patch("garmin_sync.requests.post", return_value=response) as post:
            garmin_sync.push_garmin_daily(fake_days, "2026-08-17T06:30:00")

        sizes = [len(call.kwargs["json"]["mutations"]) for call in post.call_args_list]
        self.assertGreater(len(sizes), 1)
        self.assertTrue(all(size <= 200 for size in sizes))
        self.assertEqual(sum(sizes), 450)

    def test_a_failed_request_does_not_raise(self):
        self._write_token()
        with patch("garmin_sync.requests.post", side_effect=requests.RequestException("offline")):
            try:
                garmin_sync.push_garmin_daily({"2026-08-16": {"steps": 100}}, "2026-08-17T06:30:00")
            except Exception as exc:  # noqa: BLE001 - this is exactly what must not happen
                self.fail(f"push_garmin_daily raised {exc!r}; it must never block the local write")

    def test_a_rejected_day_does_not_stop_the_rest_of_the_batch(self):
        self._write_token()
        response = unittest.mock.Mock(status_code=200)
        response.json.return_value = {
            "revision": 1,
            "results": [
                {"id": "2026-08-15", "status": "rejected", "reason": "bad field"},
                {"id": "2026-08-16", "status": "applied"},
            ],
        }
        with patch("garmin_sync.requests.post", return_value=response):
            # Must not raise even though one day was rejected server-side.
            garmin_sync.push_garmin_daily(
                {"2026-08-15": {"steps": 1}, "2026-08-16": {"steps": 2}}, "2026-08-17T06:30:00",
            )


if __name__ == "__main__":
    unittest.main()
