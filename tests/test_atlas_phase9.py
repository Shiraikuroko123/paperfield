import hashlib
import http.cookiejar
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

os.environ.setdefault(
    "PAPERFIELD_DB_PATH",
    str(Path(tempfile.gettempdir()) / "phase9-paperfield-import.db"),
)

from src.paperfield import app as paperfield
from src.research_atlas import app as atlas


def catalog_item(seq: int, paper_id: str, title: str) -> dict:
    payload = {
        "paperfieldId": paper_id,
        "title": title,
        "abstract": "catalog test",
        "authors": ["Researcher"],
        "venue": "arXiv",
        "published": "2026-08-13",
        "updated": "2026-08-13",
        "source": "arxiv",
        "sourceUrl": f"https://arxiv.org/abs/{paper_id.split(':', 1)[-1]}",
        "pdfUrl": "",
        "doi": "",
        "topics": ["embodied"],
        "fetchedAt": "2026-08-13T00:00:00+00:00",
    }
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return {
        "seq": seq,
        "kind": "paper",
        "externalId": paper_id,
        "operation": "upsert",
        "deleted": False,
        "changedAt": "2026-08-13T00:00:00+00:00",
        "payloadSha256": hashlib.sha256(canonical.encode()).hexdigest(),
        "payload": payload,
    }


class Phase9StoreTests(unittest.TestCase):
    def test_learning_progress_is_explicit_and_prerequisite_aware(self):
        with tempfile.TemporaryDirectory() as directory:
            store = atlas.AtlasStore(Path(directory) / "atlas.db")
            initial = store.learning_projection("alice")
            self.assertGreater(initial["stats"]["total"], 0)
            self.assertEqual(initial["stats"]["mastered"], 0)
            first = initial["items"][0]
            updated = store.update_learning_progress(
                {"chapterId": first["chapter_id"], "status": "mastered", "confidence": 85},
                "alice",
            )
            self.assertEqual(updated["item"]["status"], "mastered")
            self.assertEqual(updated["item"]["confidence"], 85)
            self.assertEqual(store.learning_projection("bob")["stats"]["mastered"], 0)
            self.assertEqual(initial["track_stats"][first["track_id"]]["total"], 10)

    def test_learning_progress_export_import_round_trip_and_legacy_v2_compatibility(self):
        with tempfile.TemporaryDirectory() as directory:
            source = atlas.AtlasStore(Path(directory) / "source.db")
            source.update_learning_progress(
                {
                    "chapterId": "embodied-robotics-control",
                    "status": "learning",
                    "confidence": 65,
                    "note": "Revisit the dynamics derivation.",
                },
                "alice",
            )
            exported = source.export_research_data("alice")
            self.assertEqual(len(exported["learning_progress"]), 1)

            restored = atlas.AtlasStore(Path(directory) / "restored.db")
            preview = restored.import_research_data({**exported, "dryRun": True}, "bob")
            self.assertEqual(preview["created"]["learning_progress"], 1)
            imported = restored.import_research_data({**exported, "dryRun": False}, "bob")
            self.assertEqual(imported["created"]["learning_progress"], 1)
            item = next(
                item for item in restored.learning_projection("bob")["items"]
                if item["chapter_id"] == "embodied-robotics-control"
            )
            self.assertEqual(item["status"], "learning")
            self.assertEqual(item["confidence"], 65)
            self.assertEqual(item["note"], "Revisit the dynamics derivation.")
            replay = restored.import_research_data({**exported, "dryRun": False}, "bob")
            self.assertEqual(replay["reused"]["learning_progress"], 1)

            legacy_v2 = {key: value for key, value in exported.items() if key != "learning_progress"}
            legacy_preview = restored.import_research_data({**legacy_v2, "dryRun": True}, "legacy")
            self.assertEqual(legacy_preview["learning_progress"], 0)

    def test_dossier_status_update_preserves_existing_confidence_and_note(self):
        with tempfile.TemporaryDirectory() as directory:
            store = atlas.AtlasStore(Path(directory) / "atlas.db")
            store.update_learning_progress(
                {
                    "chapterId": "embodied-robotics-control",
                    "status": "learning",
                    "confidence": 70,
                    "note": "Keep this note.",
                },
                "alice",
            )
            result = store.update_learning_progress(
                {"chapterId": "embodied-robotics-control", "status": "review"},
                "alice",
            )
            self.assertEqual(result["item"]["confidence"], 70)
            self.assertEqual(result["item"]["note"], "Keep this note.")

    def test_curriculum_context_and_deep_link_are_part_of_paper_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            store = atlas.AtlasStore(Path(directory) / "atlas.db")
            paper = store.upsert_paper(
                {
                    "canonicalRef": "arxiv:1706.03762",
                    "paperfieldId": "arxiv:1706.03762",
                    "title": "Attention Is All You Need",
                }
            )
            self.assertTrue(paper["curriculum"]["matched"])
            self.assertEqual(paper["curriculum"]["chapters"][0]["chapter_id"], "llm-token-attention")
            self.assertIn("reader=1", store._paperfield_path(paper))

    def test_compact_catalog_returns_latest_event_per_object(self):
        with tempfile.TemporaryDirectory() as directory:
            store = paperfield.PaperStore(Path(directory) / "papers.db")
            base = {
                "id": "arxiv:2608.90001",
                "title": "old",
                "abstract": "abstract",
                "authors": [],
                "institutions": [],
                "venue": "arXiv",
                "published": "2026-08-13",
                "updated": "2026-08-13",
                "source": "arxiv",
                "source_url": "",
                "pdf_url": "",
                "doi": "",
                "journal_ref": "",
                "topics": [],
                "subtopics": [],
                "quality_score": 0,
                "citation_count": 0,
                "fetched_at": "2026-08-13T00:00:00+00:00",
            }
            store.upsert(base)
            store.upsert({**base, "title": "new"})
            store.upsert({**base, "id": "arxiv:2608.90002", "title": "second"})
            page = store.atlas_catalog_page(0, 10, compact=True)
            self.assertTrue(page["compacted"])
            self.assertEqual(len(page["items"]), 2)
            self.assertEqual([item["payload"]["title"] for item in page["items"]], ["new", "second"])

    def test_synchronizer_advances_checkpoint_and_replays_idempotently(self):
        with tempfile.TemporaryDirectory() as directory:
            store = atlas.AtlasStore(Path(directory) / "atlas.db")
            pages = {
                0: {
                    "schemaVersion": 1,
                    "cursor": 0,
                    "nextCursor": 1,
                    "watermark": 2,
                    "hasMore": True,
                    "compacted": True,
                    "items": [catalog_item(1, "arxiv:2608.91001", "first")],
                },
                1: {
                    "schemaVersion": 1,
                    "cursor": 1,
                    "nextCursor": 2,
                    "watermark": 2,
                    "hasMore": False,
                    "compacted": True,
                    "items": [catalog_item(2, "arxiv:2608.91002", "second")],
                },
                2: {
                    "schemaVersion": 1,
                    "cursor": 2,
                    "nextCursor": 2,
                    "watermark": 2,
                    "hasMore": False,
                    "compacted": True,
                    "items": [],
                },
            }

            def fake_fetch(_base, cursor, _limit, _token):
                return pages[cursor], f"http://paperfield.test/api/atlas/catalog?cursor={cursor}&compact=1"

            synchronizer = atlas.PaperfieldCatalogSynchronizer(
                store,
                "http://paperfield.test/",
                max_pages=4,
                page_limit=2,
            )
            with mock.patch.object(atlas, "fetch_paperfield_catalog_page", side_effect=fake_fetch):
                first = synchronizer.sync_once()
                second = synchronizer.sync_once()
            self.assertEqual(first["pages"], 2)
            self.assertEqual(first["checkpoint"]["cursor_value"], 2)
            # Reaching the watermark is a no-op; polling must not create an
            # empty audit run on every interval.
            self.assertEqual(second["pages"], 0)
            self.assertEqual(len(store.list_papers()), 2)
            self.assertEqual(len(store.list_paperfield_sync_runs()), 2)


class Phase9ProxyTests(unittest.TestCase):
    PROXY_TOKEN = "phase9-proxy-token-with-high-entropy-8c6df2f4a2e74f3e"

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = atlas.AtlasStore(Path(self.directory.name) / "atlas.db")
        self.server = atlas.create_server(
            "127.0.0.1",
            0,
            self.store,
            "http://127.0.0.1:8765/",
            "http://127.0.0.1:8765/flowloom/",
            proxy_token=self.PROXY_TOKEN,
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.directory.cleanup()

    def request(self, path, *, method="GET", payload=None, owner="", role="", origin=""):
        body = json.dumps(payload).encode() if payload is not None else None
        headers = {
            "Host": "mosaic-bok-confound.ngrok-free.dev",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Prefix": "/atlas",
            "X-Atlas-Proxy-Token": self.PROXY_TOKEN,
        }
        if owner:
            headers["X-Paperfield-User"] = owner
        if role:
            headers["X-Paperfield-Role"] = role
        if origin:
            headers["Origin"] = origin
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.server.server_port}{path}",
            data=body,
            headers=headers,
            method=method,
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=10) as response:
            return response.status, json.loads(response.read().decode())

    def test_proxy_config_uses_mounted_same_origin_paths(self):
        status, payload = self.request("/api/config")
        self.assertEqual(status, 200)
        self.assertEqual(payload["paperfield_base_url"], "/")
        self.assertEqual(payload["flowloom_base_url"], "/flowloom/")
        self.assertNotIn("127.0.0.1", payload["paperfield_base_url"])
        self.assertNotIn("paperfield_internal_url", payload)
        self.assertIn("https://mosaic-bok-confound.ngrok-free.dev", payload["allowed_paperfield_origins"])

    def test_public_proxy_origin_is_accepted_by_bridge(self):
        status, payload = self.request(
            "/api/bridge",
            method="POST",
            payload={
                "type": "paperfield:paper-context",
                "version": 1,
                "messageId": "atlas-public-bridge-001",
                "bridgeToken": "token-with-more-than-sixteen-chars",
                "sourceOrigin": "https://mosaic-bok-confound.ngrok-free.dev",
                "paper": {"paperfieldId": "arxiv:2608.92001", "title": "Public bridge paper"},
            },
        )
        self.assertEqual(status, 202)
        self.assertEqual(payload["type"], "atlas:context-accepted")

    def test_forwarded_owner_without_proxy_token_is_rejected(self):
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.server.server_port}/api/private/learning-progress",
            headers={
                "Host": "mosaic-bok-confound.ngrok-free.dev",
                "X-Forwarded-Proto": "https",
                "X-Forwarded-Prefix": "/atlas",
                "X-Paperfield-User": "attacker",
            },
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with self.assertRaises(urllib.error.HTTPError) as blocked:
            opener.open(request, timeout=10)
        self.assertEqual(blocked.exception.code, 403)

    def test_privileged_account_roles_can_use_editor_through_trusted_proxy(self):
        public_origin = "https://mosaic-bok-confound.ngrok-free.dev"
        for role in ("beta", "editor"):
            with self.subTest(role=role):
                status, payload = self.request(
                    "/api/editor/coverage",
                    owner=f"{role}-user",
                    role=role,
                    origin=public_origin,
                )
                self.assertEqual(status, 200)
                self.assertIn("items", payload)

        for role in ("standard", ""):
            with self.subTest(role=role), self.assertRaises(urllib.error.HTTPError) as blocked:
                self.request(
                    "/api/editor/coverage",
                    owner="standard-user",
                    role=role,
                    origin=public_origin,
                )
            self.assertEqual(blocked.exception.code, 403)

        with self.assertRaises(urllib.error.HTTPError) as blocked_origin:
            self.request(
                "/api/editor/coverage",
                owner="editor-user",
                role="editor",
                origin="https://attacker.example",
            )
        self.assertEqual(blocked_origin.exception.code, 403)

    def test_private_detail_routes_resolve_only_the_forwarded_owner(self):
        local_view = self.store.create_research_view(
            {"name": "Local private view", "viewKind": "focus", "definition": {}},
            "local",
        )
        local_run = self.store.apply_research_view(local_view["id"], "local")["run"]
        local_bundle = self.store.create_provenance_bundle(
            {"viewRunId": local_run["id"]},
            "local",
        )
        alice_view = self.store.create_research_view(
            {"name": "Alice private view", "viewKind": "focus", "definition": {}},
            "alice",
        )
        alice_run = self.store.apply_research_view(alice_view["id"], "alice")["run"]
        alice_bundle = self.store.create_provenance_bundle(
            {"viewRunId": alice_run["id"]},
            "alice",
        )

        local_paths = (
            f"/api/private/research-views/{local_view['id']}",
            f"/api/private/research-view-runs/{local_run['id']}",
            f"/api/private/provenance-bundles/{local_bundle['id']}",
        )
        for path in local_paths:
            with self.subTest(path=path), self.assertRaises(urllib.error.HTTPError) as blocked:
                self.request(
                    path,
                    owner="alice",
                    role="editor",
                    origin="https://mosaic-bok-confound.ngrok-free.dev",
                )
            self.assertEqual(blocked.exception.code, 404)

        alice_paths = (
            (f"/api/private/views/{alice_view['id']}", alice_view["id"]),
            (f"/api/private/view-runs/{alice_run['id']}", alice_run["id"]),
            (f"/api/private/provenance-bundles/{alice_bundle['id']}", alice_bundle["id"]),
        )
        for path, expected_id in alice_paths:
            with self.subTest(path=path):
                status, payload = self.request(path, owner="alice")
            self.assertEqual(status, 200)
            self.assertEqual(payload["id"], expected_id)

        for path, _ in alice_paths:
            with self.subTest(path=path, owner="bob"), self.assertRaises(urllib.error.HTTPError) as blocked:
                self.request(path, owner="bob")
            self.assertEqual(blocked.exception.code, 404)

    def test_platform_backups_are_never_available_through_the_account_proxy(self):
        backup = self.store.create_backup(
            editor_payload={
                "editorName": "test setup",
                "reason": "Create a backup record for proxy-boundary verification.",
            }
        )
        read_paths = (
            "/api/private/backups",
            f"/api/private/backups/{backup['id']}/manifest",
            "/api/editor/backups",
            f"/api/editor/backups/{backup['id']}/manifest",
        )
        for path in read_paths:
            with self.subTest(method="GET", path=path), self.assertRaises(urllib.error.HTTPError) as blocked:
                self.request(path, owner="alice")
            self.assertEqual(blocked.exception.code, 403)

        action_paths = (
            "/api/private/backups",
            "/api/private/backups/validate",
            "/api/private/backups/export",
            "/api/private/backups/verify",
            "/api/private/backups/restore",
            "/api/private/backups/import",
            "/api/editor/backups/export",
            "/api/editor/backups/verify",
            "/api/editor/backups/restore",
            "/api/editor/backups/import",
        )
        for path in action_paths:
            with self.subTest(method="POST", path=path), self.assertRaises(urllib.error.HTTPError) as blocked:
                self.request(
                    path,
                    method="POST",
                    payload={},
                    owner="alice",
                    role="editor",
                    origin="https://mosaic-bok-confound.ngrok-free.dev",
                )
            self.assertEqual(blocked.exception.code, 403)

        self.assertEqual([item["id"] for item in self.store.list_backups()], [backup["id"]])


class Phase9PaperfieldAccessTests(unittest.TestCase):
    PROXY_TOKEN = "phase9-proxy-token-with-high-entropy-8c6df2f4a2e74f3e"

    def test_standard_accounts_can_only_use_model_free_learning_progress_private_route(self):
        handler = paperfield.AppHandler
        self.assertTrue(handler.atlas_standard_access_allowed("/api/private/learning-progress", "GET"))
        self.assertTrue(handler.atlas_standard_access_allowed("/api/private/learning-progress", "POST"))
        self.assertFalse(handler.atlas_standard_access_allowed("/api/private/bootstrap", "GET"))
        self.assertFalse(handler.atlas_standard_access_allowed("/api/private/export", "GET"))
        self.assertFalse(handler.atlas_standard_access_allowed("/api/analysis-requests", "POST"))

    def test_authenticated_proxy_injects_owner_and_isolates_learning_progress(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas_store = atlas.AtlasStore(root / "atlas.db")
            atlas_server = atlas.create_server(
                "127.0.0.1",
                0,
                atlas_store,
                "http://127.0.0.1:8765/",
                "http://127.0.0.1:8765/flowloom/",
                proxy_token=self.PROXY_TOKEN,
            )
            atlas_thread = threading.Thread(target=atlas_server.serve_forever, daemon=True)
            atlas_thread.start()

            auth = paperfield.AuthService(root / "auth-users.json", required=True)
            auth.upsert_user("alice", "alice-pass", role="standard")
            auth.upsert_user("bob", "bob-pass", role="standard")
            auth.upsert_user("curator", "curator-pass", role="editor")
            atlas_url = f"http://127.0.0.1:{atlas_server.server_port}"

            with mock.patch.object(paperfield, "AUTH", auth), mock.patch.object(
                paperfield, "ATLAS_INTERNAL_URL", atlas_url
            ), mock.patch.object(
                paperfield, "PAPERFIELD_ATLAS_PROXY_TOKEN", self.PROXY_TOKEN
            ):
                paperfield_server = paperfield.ThreadingHTTPServer(
                    ("127.0.0.1", 0), paperfield.AppHandler
                )
                paperfield_thread = threading.Thread(
                    target=paperfield_server.serve_forever, daemon=True
                )
                paperfield_thread.start()
                base = f"http://127.0.0.1:{paperfield_server.server_port}"

                def account_client(username: str, password: str):
                    cookies = http.cookiejar.CookieJar()
                    client = urllib.request.build_opener(
                        urllib.request.ProxyHandler({}),
                        urllib.request.HTTPCookieProcessor(cookies),
                    )
                    request = urllib.request.Request(
                        f"{base}/api/auth/login",
                        data=json.dumps(
                            {"username": username, "password": password}
                        ).encode("utf-8"),
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    with client.open(request, timeout=10) as response:
                        self.assertEqual(response.status, 200)
                    return client

                def json_request(client, path: str, *, payload=None, headers=None):
                    body = json.dumps(payload).encode("utf-8") if payload is not None else None
                    request_headers = {"Accept": "application/json", **(headers or {})}
                    if body is not None:
                        request_headers["Content-Type"] = "application/json"
                    request = urllib.request.Request(
                        f"{base}{path}",
                        data=body,
                        headers=request_headers,
                        method="POST" if body is not None else "GET",
                    )
                    with client.open(request, timeout=10) as response:
                        return response.status, json.loads(response.read().decode("utf-8"))

                try:
                    alice = account_client("alice", "alice-pass")
                    bob = account_client("bob", "bob-pass")
                    curator = account_client("curator", "curator-pass")
                    chapter_id = "embodied-robotics-control"

                    status, alice_update = json_request(
                        alice,
                        "/atlas/api/private/learning-progress",
                        payload={
                            "chapterId": chapter_id,
                            "status": "mastered",
                            "confidence": 90,
                        },
                        headers={"X-Paperfield-User": "bob"},
                    )
                    self.assertEqual(status, 200)
                    self.assertEqual(alice_update["item"]["status"], "mastered")

                    _, alice_projection = json_request(
                        alice, "/atlas/api/private/learning-progress"
                    )
                    _, bob_projection = json_request(
                        bob, "/atlas/api/private/learning-progress"
                    )
                    self.assertEqual(alice_projection["owner_id"], "alice")
                    self.assertEqual(bob_projection["owner_id"], "bob")
                    self.assertEqual(alice_projection["stats"]["mastered"], 1)
                    self.assertEqual(bob_projection["stats"]["mastered"], 0)

                    with self.assertRaises(urllib.error.HTTPError) as blocked:
                        json_request(bob, "/atlas/api/private/bootstrap")
                    self.assertEqual(blocked.exception.code, 403)

                    editor_status, editor_payload = json_request(
                        curator,
                        "/atlas/api/editor/coverage",
                        headers={"Origin": base},
                    )
                    self.assertEqual(editor_status, 200)
                    self.assertIn("items", editor_payload)

                    with self.assertRaises(urllib.error.HTTPError) as spoofed_role:
                        json_request(
                            bob,
                            "/atlas/api/editor/coverage",
                            headers={"Origin": base, "X-Paperfield-Role": "editor"},
                        )
                    self.assertEqual(spoofed_role.exception.code, 403)
                finally:
                    paperfield_server.shutdown()
                    paperfield_server.server_close()
                    paperfield_thread.join(timeout=5)

            atlas_server.shutdown()
            atlas_server.server_close()
            atlas_thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
