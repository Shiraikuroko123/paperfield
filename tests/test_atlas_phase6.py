import json
import sqlite3
import tempfile
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from src.research_atlas import app as atlas


class Phase6StoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "atlas.db"
        self.store = atlas.AtlasStore(self.database)

    def tearDown(self):
        self.store = None
        self.directory.cleanup()

    def test_schema_current_and_reopen(self):
        atlas.AtlasStore(self.database)
        with sqlite3.connect(self.database) as db:
            self.assertEqual(
                db.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchone()[0],
                str(atlas.SCHEMA_VERSION),
            )
            self.assertEqual(
                db.execute(
                    "SELECT COUNT(*) FROM schema_migrations WHERE version=?",
                    (atlas.SCHEMA_VERSION,),
                ).fetchone()[0],
                1,
            )

    def test_view_run_is_immutable_and_revisioned(self):
        view = self.store.create_research_view({"name": "Embodied", "viewKind": "search", "definition": {"query": "robot", "kinds": ["paper"], "limit": 10}})
        run = self.store.apply_research_view(view["id"])["run"]
        self.assertEqual(run["view_revision"], 1)
        updated = self.store.update_research_view(view["id"], {"name": "Embodied", "viewKind": "search", "definition": {"query": "world model", "kinds": ["paper"], "limit": 10}, "expectedRevision": 1})
        self.assertEqual(updated["revision"], 2)
        self.assertEqual(self.store.get_research_view_run(run["id"])["view_revision"], 1)

    def test_bundle_hash_recomputes(self):
        view = self.store.create_research_view({"name": "Empty", "viewKind": "focus", "definition": {}})
        run = self.store.apply_research_view(view["id"])["run"]
        bundle = self.store.create_provenance_bundle({"viewRunId": run["id"]})
        checked = self.store.verify_provenance_bundle(bundle)
        self.assertTrue(checked["valid"])

    def test_deleted_view_run_can_still_export_historical_bundle(self):
        view = self.store.create_research_view({"name": "Historical", "viewKind": "focus", "definition": {}})
        run = self.store.apply_research_view(view["id"])["run"]
        self.store.delete_research_view(view["id"])
        bundle = self.store.create_provenance_bundle({"viewRunId": run["id"]})
        self.assertEqual(bundle["bundle"]["view"]["name"], "Historical")
        self.assertTrue(bundle["bundle"]["view"].get("deleted"))
        self.assertTrue(self.store.verify_provenance_bundle(bundle)["valid"])

    def test_expired_snapshot_metadata_never_projects_items(self):
        self.store.upsert_paper({"paperfieldId": "arxiv:phase6", "title": "Snapshot paper", "abstract": "x"})
        result = self.store.search_catalog(kinds=["paper"], limit=10, owner_id="local")
        with self.store.connect() as db:
            db.execute(
                "UPDATE search_snapshots SET expires_at='2000-01-01T00:00:00+00:00' WHERE id=?",
                (result["snapshot_id"],),
            )
        snapshot = self.store.get_search_snapshot(result["snapshot_id"], "local", include_items=True)
        self.assertEqual(snapshot["status"], "expired")
        self.assertEqual(snapshot["items"], [])
        self.assertTrue(snapshot["items_truncated"])

    def test_bundle_verifier_checks_markdown_manifest(self):
        view = self.store.create_research_view({"name": "Manifest", "viewKind": "focus", "definition": {}})
        run = self.store.apply_research_view(view["id"])["run"]
        bundle = self.store.create_provenance_bundle({"viewRunId": run["id"]})
        self.assertTrue(self.store.verify_provenance_bundle(bundle)["valid"])
        bundle["markdown"] += "\nTampered"
        checked = self.store.verify_provenance_bundle(bundle)
        self.assertFalse(checked["valid"])
        self.assertFalse(checked["markdown_valid"])


class Phase6HttpTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "atlas.db"
        self.store = atlas.AtlasStore(self.database)
        self.server = atlas.create_server("127.0.0.1", 0, self.store, "http://127.0.0.1:8765/", "http://127.0.0.1:4178/")
        import threading
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.directory.cleanup()

    def request(self, path, method="GET", payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(self.base + path, data=data, method=method, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode())

    def test_workspace_routes_and_compat_alias(self):
        status, view = self.request("/api/private/views", "POST", {"name": "Route", "viewKind": "focus", "definition": {}})
        self.assertEqual(status, 201)
        status, listing = self.request("/api/private/research-views")
        self.assertEqual(status, 200)
        self.assertEqual(listing["items"][0]["id"], view["id"])
        status, run_response = self.request(f"/api/private/views/{view['id']}/run", "POST", {})
        self.assertEqual(status, 201)
        status, _ = self.request("/api/private/notifications/refresh", "POST", {})
        self.assertEqual(status, 200)
        status, _ = self.request(f"/api/private/views/{view['id']}", "DELETE", {})
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()
