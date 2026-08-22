import tempfile
import threading
import unittest
from pathlib import Path

from src.research_atlas import app as atlas


class FakeScanner:
    def __init__(self):
        self.calls = []
        self.second_cycle = threading.Event()

    def scan_once(self):
        self.calls.append("papers")
        if self.calls.count("papers") >= 2:
            self.second_cycle.set()
        return {
            "source_name": "arxiv",
            "status": "completed",
            "fetched_count": 2,
            "accepted_count": 1,
            "new_count": 1,
            "updated_count": 0,
            "error_text": "",
            "finished_at": "2026-08-22T00:00:00+00:00",
            "term_candidates": {"new_terms": 1},
        }

    def scan_official_updates_once(self):
        self.calls.append("official")
        return {
            "source_name": "official_updates",
            "status": "completed",
            "fetched_count": 1,
            "accepted_count": 1,
            "new_count": 1,
            "updated_count": 0,
            "error_text": "",
            "finished_at": "2026-08-22T00:00:00+00:00",
        }


class AtlasRefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = atlas.AtlasStore(Path(self.temp.name) / "atlas.db")

    def tearDown(self):
        self.temp.cleanup()

    def test_refresh_settings_are_persisted_and_bounded(self):
        self.assertEqual(self.store.get_refresh_settings()["news_interval_seconds"], 300)
        settings = self.store.update_refresh_settings(
            {
                "news_interval_seconds": 1,
                "frontier_interval_seconds": 99999999,
                "news_enabled": False,
                "frontier_enabled": True,
            }
        )
        self.assertEqual(settings["news_interval_seconds"], 60)
        self.assertEqual(settings["frontier_interval_seconds"], 604800)
        self.assertFalse(self.store.get_refresh_settings()["news_enabled"])

    def test_frontier_synchronizer_runs_both_deterministic_sources(self):
        scanner = FakeScanner()
        synchronizer = atlas.FrontierSynchronizer(scanner, interval_seconds=900)
        result = synchronizer.refresh_once()
        self.assertEqual(scanner.calls, ["papers", "official"])
        self.assertEqual(result["runs"][0]["source"], "arxiv")
        self.assertEqual(result["runs"][1]["source"], "official_updates")
        self.assertFalse(synchronizer.status()["running"])
        self.assertFalse(synchronizer.status()["last_error"])

    def test_frontier_synchronizer_repeats_on_its_configured_schedule(self):
        scanner = FakeScanner()
        synchronizer = atlas.FrontierSynchronizer(scanner, enabled=True)
        # Production intervals are bounded to 15 minutes or more. Shorten the
        # already-normalized value here so the scheduler loop can be exercised.
        synchronizer.interval_seconds = 0.02
        synchronizer.start()
        try:
            self.assertTrue(scanner.second_cycle.wait(1.0))
            self.assertGreaterEqual(scanner.calls.count("papers"), 2)
            self.assertGreaterEqual(scanner.calls.count("official"), 2)
        finally:
            synchronizer.stop()
        self.assertTrue(synchronizer.status()["next_run_at"])

    def test_coordinator_applies_policy_and_refreshes_all(self):
        scanner = FakeScanner()
        lock = threading.RLock()
        news = atlas.NewsSynchronizer(self.store, enabled=False, operation_lock=lock)
        frontier = atlas.FrontierSynchronizer(scanner, enabled=False, operation_lock=lock)
        coordinator = atlas.RefreshCoordinator(self.store, news, frontier)
        status = coordinator.apply_settings(
            {
                "news_interval_seconds": 600,
                "frontier_interval_seconds": 1800,
                "news_enabled": True,
                "frontier_enabled": False,
            }
        )
        self.assertEqual(status["settings"]["news_interval_seconds"], 600)
        self.assertEqual(status["frontier"]["interval_seconds"], 1800)
        self.assertTrue(news.policy_event.is_set())
        self.assertTrue(frontier.policy_event.is_set())
        news.policy_event.clear()
        frontier.policy_event.clear()
        coordinator.apply_settings(status["settings"])
        self.assertFalse(news.policy_event.is_set())
        self.assertFalse(frontier.policy_event.is_set())
        result = coordinator.refresh("all")
        self.assertEqual(scanner.calls, ["papers", "official"])
        self.assertEqual(result["kind"], "all")


if __name__ == "__main__":
    unittest.main()
