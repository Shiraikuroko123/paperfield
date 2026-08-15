import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from unittest import mock

# Importing Paperfield normally creates its process-wide store. Point that
# import-time store at an isolated test database so a running local Paperfield
# instance cannot lock the test suite's production database.
os.environ.setdefault(
    "PAPERFIELD_DB_PATH",
    str(Path(tempfile.gettempdir()) / f"phase5-paperfield-import-{uuid.uuid4().hex}.db"),
)
from src.paperfield import app as paperfield
from src.research_atlas import app as atlas


def paper_payload(index: int = 1, *, domain: str = "embodied") -> dict:
    return {
        "paperfieldId": f"arxiv:2608.{index:05d}",
        "title": f"Research paper {index:05d}",
        "abstract": f"Evidence about {domain} methods and evaluation number {index}.",
        "authors": ["Researcher"],
        "published": "2026-08-11",
        "sourceUrl": f"https://arxiv.org/abs/2608.{index:05d}",
        "pdfUrl": f"https://arxiv.org/pdf/2608.{index:05d}",
        "topics": [domain],
    }


def stage_content() -> dict:
    return {
        "summary": "A source-bounded method explanation.",
        "sections": [
            {
                "title": "Training objective",
                "body": "The objective is reconstructed from the cited method section.",
                "sourceKind": "paper_claim",
                "confidence": "high",
                "evidence": [
                    {
                        "label": "Method",
                        "page": 3,
                        "section": "3. Method",
                        "figure": "Figure 2",
                        "quote": "The objective is optimized jointly.",
                        "sourceUrl": "https://arxiv.org/pdf/2608.00001",
                        "direction": "supports",
                    }
                ],
            }
        ],
    }


class Phase5MigrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "atlas.db"

    def tearDown(self):
        self.directory.cleanup()

    def test_fresh_schema_is_current_and_reopen_is_idempotent(self):
        first = atlas.AtlasStore(self.database)
        first.close()
        second = atlas.AtlasStore(self.database)
        second.close()
        with sqlite3.connect(self.database) as db:
            version = db.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchone()[0]
            migrations = db.execute("SELECT version, checksum FROM schema_migrations").fetchall()
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertEqual(version, str(atlas.SCHEMA_VERSION))
        self.assertEqual(len([row for row in migrations if row[0] == atlas.SCHEMA_VERSION]), 1)
        self.assertTrue({"focus_profiles", "saved_items", "research_digests", "research_views"}.issubset(tables))

    def test_v7_to_v8_and_future_schema_rejection(self):
        atlas.AtlasStore(self.database).close()
        phase5_tables = (
            "paperfield_sync_runs", "paperfield_sync_objects", "sync_checkpoints",
            "focus_profiles", "saved_items", "research_digests", "atlas_backup_runs",
        )
        with sqlite3.connect(self.database) as db:
            db.execute("PRAGMA foreign_keys=OFF")
            for table in phase5_tables:
                db.execute(f"DROP TABLE IF EXISTS {table}")
            db.execute("DELETE FROM schema_migrations WHERE version > 7")
            db.execute("UPDATE app_metadata SET value='7' WHERE key='schema_version'")
        atlas.AtlasStore(self.database).close()
        with sqlite3.connect(self.database) as db:
            self.assertEqual(
                db.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchone()[0],
                str(atlas.SCHEMA_VERSION),
            )
            db.execute("UPDATE app_metadata SET value='99' WHERE key='schema_version'")
        with self.assertRaisesRegex(atlas.AtlasError, "高于当前程序"):
            atlas.AtlasStore(self.database)

    def test_failed_migration_rolls_back(self):
        atlas.AtlasStore(self.database).close()
        with sqlite3.connect(self.database) as db:
            db.execute("DELETE FROM schema_migrations WHERE version > 7")
            db.execute("UPDATE app_metadata SET value='7' WHERE key='schema_version'")

        class FailingStore(atlas.AtlasStore):
            @staticmethod
            def _migrate_v7_to_v8(db):
                db.execute("CREATE TABLE phase5_should_rollback(value TEXT)")
                raise RuntimeError("migration failure")

        with self.assertRaisesRegex(RuntimeError, "migration failure"):
            FailingStore(self.database)
        with sqlite3.connect(self.database) as db:
            self.assertIsNone(
                db.execute("SELECT name FROM sqlite_master WHERE name='phase5_should_rollback'").fetchone()
            )
            self.assertEqual(
                db.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchone()[0],
                "7",
            )

    def test_future_schema_is_rejected_without_changing_database_bytes(self):
        atlas.AtlasStore(self.database).close()
        connection = sqlite3.connect(self.database)
        try:
            with connection:
                connection.execute("UPDATE app_metadata SET value='99' WHERE key='schema_version'")
        finally:
            connection.close()
        before = hashlib.sha256(self.database.read_bytes()).hexdigest()

        with self.assertRaisesRegex(atlas.AtlasError, "高于当前程序"):
            atlas.AtlasStore(self.database)

        self.assertEqual(hashlib.sha256(self.database.read_bytes()).hexdigest(), before)

    def test_migration_ledger_rejects_missing_or_tampered_records(self):
        mutations = {
            "missing": f"DELETE FROM schema_migrations WHERE version={atlas.SCHEMA_VERSION}",
            "name": f"UPDATE schema_migrations SET name='unexpected' WHERE version={atlas.SCHEMA_VERSION}",
            "checksum": f"UPDATE schema_migrations SET checksum='tampered' WHERE version={atlas.SCHEMA_VERSION}",
        }
        for label, statement in mutations.items():
            with self.subTest(label=label):
                database = Path(self.directory.name) / f"atlas-{label}.db"
                atlas.AtlasStore(database).close()
                connection = sqlite3.connect(database)
                try:
                    with connection:
                        connection.execute(statement)
                finally:
                    connection.close()
                before = hashlib.sha256(database.read_bytes()).hexdigest()
                with self.assertRaisesRegex(atlas.AtlasError, "schema"):
                    atlas.AtlasStore(database)
                self.assertEqual(hashlib.sha256(database.read_bytes()).hexdigest(), before)


class Phase5StoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.store = atlas.AtlasStore(self.root / "atlas.db")

    def tearDown(self):
        self.directory.cleanup()

    def test_catalog_search_has_real_total_stable_cursor_and_filters(self):
        for index in range(1, 31):
            self.store.upsert_paper(paper_payload(index, domain="embodied" if index % 2 else "llm"))
        first = self.store.search_catalog(query="Research paper", kinds=["paper"], domains=["embodied"], limit=7)
        self.assertEqual(first["total"], 15)
        self.assertEqual(len(first["items"]), 7)
        self.assertTrue(first["next_cursor"])
        second = self.store.search_catalog(
            query="Research paper",
            kinds=["paper"],
            domains=["embodied"],
            limit=7,
            cursor=first["next_cursor"],
        )
        self.assertFalse({item["ref"] for item in first["items"]} & {item["ref"] for item in second["items"]})
        with self.assertRaisesRegex(atlas.AtlasError, "cursor"):
            self.store.search_catalog(query="different", cursor=first["next_cursor"])

    def test_catalog_search_cursor_pins_same_second_inserts_and_update_order(self):
        original_refs = set()
        for index in range(1, 13):
            paper = self.store.upsert_paper(paper_payload(index))
            original_refs.add(str(paper["id"]))
        for index in range(1, 5):
            full_name = f"atlas/project-{index}"
            self.store.upsert_project(
                {
                    "fullName": full_name,
                    "description": f"Project {index}",
                    "topics": ["embodied"],
                }
            )
            original_refs.add(full_name)

        first = self.store.search_catalog(limit=5)
        decoded = atlas.decode_search_cursor(first["next_cursor"])
        self.assertEqual(decoded["watermark"], first["watermark"])
        self.assertEqual(decoded["paper_max_id"], 12)
        self.assertEqual(decoded["project_max_rowid"], 4)

        # Both writes happen in the same timestamp second as the first page.
        # Refreshing an existing row must not move it, and newly created rows
        # must not enter the cursor's snapshot.
        self.store.upsert_paper({**paper_payload(8), "abstract": "A longer refreshed abstract."})
        self.store.upsert_paper(paper_payload(99))
        self.store.upsert_project(
            {"fullName": "atlas/project-3", "description": "Updated project", "topics": ["embodied"]}
        )
        self.store.upsert_project(
            {"fullName": "atlas/project-new", "description": "New project", "topics": ["embodied"]}
        )

        returned = {item["ref"] for item in first["items"]}
        cursor = first["next_cursor"]
        totals = {first["total"]}
        while cursor:
            page = self.store.search_catalog(limit=5, cursor=cursor)
            self.assertFalse(returned & {item["ref"] for item in page["items"]})
            returned.update(item["ref"] for item in page["items"])
            totals.add(page["total"])
            cursor = page["next_cursor"]

        self.assertEqual(returned, original_refs)
        self.assertEqual(totals, {len(original_refs)})
        self.assertNotIn("atlas/project-new", returned)

    def test_catalog_search_created_indexes_and_30k_regression(self):
        created_at = "2026-08-01T00:00:00+00:00"
        rows = (
            (
                f"arxiv:2501.{index:05d}",
                f"{'Needle' if index % 10 == 0 else 'Catalog'} paper {index:05d}",
                f"{'needle' if index % 10 == 0 else 'catalog'} paper {index:05d}",
                "A bounded catalog abstract.",
                "[]",
                "",
                "2025-01-01",
                "",
                f"https://arxiv.org/abs/2501.{index:05d}",
                "",
                "",
                '["embodied"]',
                created_at,
                created_at,
            )
            for index in range(30_000)
        )
        with self.store.connect() as db:
            db.executemany(
                """
                INSERT INTO canonical_papers(
                    canonical_ref, title, normalized_title, abstract, authors_json,
                    venue, published, current_version, source_url, pdf_url, doi,
                    topics_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            indexes = {
                row["name"]
                for row in db.execute(
                    "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%_created'"
                ).fetchall()
            }
        self.assertTrue(
            {"idx_canonical_papers_created", "idx_research_projects_created"}.issubset(indexes)
        )

        started = time.perf_counter()
        limited = self.store.search_catalog(query="Needle", kinds=["paper"], limit=40)
        limited_elapsed = time.perf_counter() - started
        started = time.perf_counter()
        unfiltered = self.store.search_catalog(kinds=["paper"], limit=40)
        unfiltered_elapsed = time.perf_counter() - started
        started = time.perf_counter()
        continued = self.store.search_catalog(
            query="Needle", kinds=["paper"], limit=40, cursor=limited["next_cursor"]
        )
        continued_elapsed = time.perf_counter() - started

        self.assertEqual(limited["total"], 3_000)
        self.assertEqual(unfiltered["total"], 30_000)
        self.assertEqual(len(continued["items"]), 40)
        self.assertLess(max(limited_elapsed, unfiltered_elapsed, continued_elapsed), 5.0)

    def test_paperfield_sync_replay_tombstone_and_recreate_converge(self):
        payload = paper_payload()

        def page(cursor, sequence, item_payload, *, deleted=False):
            canonical = json.dumps(
                item_payload or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":")
            )
            return {
                "schemaVersion": 1,
                "cursor": cursor,
                "nextCursor": sequence,
                "watermark": sequence,
                "hasMore": False,
                "items": [
                    {
                        "seq": sequence,
                        "kind": "paper",
                        "externalId": payload["paperfieldId"],
                        "deleted": deleted,
                        "payload": None if deleted else item_payload,
                        "payloadSha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
                    }
                ],
            }

        editor = {"editorName": "phase5-test", "reason": "Verify replay and tombstone convergence."}
        source_url = "http://127.0.0.1:8765/api/atlas/catalog"
        first_page = page(0, 1, payload)
        first = self.store.apply_paperfield_sync_page(
            first_page, source_url=source_url, editor_payload=editor
        )
        replay = self.store.apply_paperfield_sync_page(
            first_page, source_url=source_url, editor_payload=editor
        )

        self.assertFalse(first["idempotent_replay"])
        self.assertTrue(replay["idempotent_replay"])
        self.assertEqual(replay["id"], first["id"])
        self.assertEqual(len(self.store.list_paperfield_sync_runs()), 1)
        self.assertEqual(self.store.search_catalog(kinds=["paper"])["total"], 1)
        with self.assertRaisesRegex(atlas.AtlasError, "理由"):
            self.store.apply_paperfield_sync_page(
                first_page,
                source_url=source_url,
                editor_payload={"editorName": "phase5-test", "reason": "short"},
            )
        self.assertEqual(len(self.store.list_paperfield_sync_runs()), 1)

        deleted = self.store.apply_paperfield_sync_page(
            page(1, 2, None, deleted=True),
            source_url=source_url,
            editor_payload=editor,
        )
        self.assertEqual(deleted["deleted_count"], 1)
        self.assertEqual(self.store.search_catalog(kinds=["paper"])["total"], 0)
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM canonical_papers").fetchone()[0], 1)

        recreated_payload = {**payload, "title": "Research paper recreated"}
        recreated = self.store.apply_paperfield_sync_page(
            page(2, 3, recreated_payload),
            source_url=source_url,
            editor_payload=editor,
        )
        self.assertEqual(recreated["updated_count"], 1)
        visible = self.store.search_catalog(kinds=["paper"])
        self.assertEqual(visible["total"], 1)
        self.assertEqual(visible["items"][0]["title"], "Research paper recreated")

    def test_research_import_validates_all_items_before_atomic_write(self):
        self.store.update_focus_profile({"domains": ["llm"], "keywords": ["baseline"]})
        before_focus = self.store.get_focus_profile()
        payload = {
            "schema_version": 1,
            "dryRun": False,
            "focus_profile": {"domains": ["embodied"], "keywords": ["world model"]},
            "saved_items": [
                {"itemKind": "paper", "itemRef": "arxiv:2608.00001", "title": "Valid"},
                {"itemKind": "unsupported", "itemRef": "invalid", "title": "Invalid"},
            ],
        }

        with self.assertRaisesRegex(atlas.AtlasError, "saved item"):
            self.store.import_research_data(payload)

        self.assertEqual(self.store.get_focus_profile(), before_focus)
        self.assertEqual(self.store.list_saved_items(), [])

        dangling_entity = {
            "schema_version": 1,
            "dryRun": False,
            "focus_profile": {"domains": ["embodied"]},
            "saved_items": [
                {"itemKind": "method", "itemRef": "missing-method", "title": "Dangling"}
            ],
        }
        with self.assertRaises(atlas.NotFoundError):
            self.store.import_research_data(dangling_entity)
        self.assertEqual(self.store.get_focus_profile(), before_focus)
        self.assertEqual(self.store.list_saved_items(), [])

        dry_run = self.store.import_research_data(
            {
                "schema_version": 1,
                "dryRun": True,
                "focus_profile": {"domains": ["embodied"]},
                "saved_items": [
                    {"itemKind": "paper", "itemRef": "arxiv:2608.00001", "title": "Valid"}
                ],
            }
        )
        self.assertTrue(dry_run["dry_run"])
        self.assertEqual(self.store.get_focus_profile(), before_focus)
        self.assertEqual(self.store.list_saved_items(), [])

    def test_dossier_claim_ids_coverage_and_exports_are_reproducible(self):
        source_hash = "a" * 64
        task, _ = self.store.create_analysis_request(
            {"paper": paper_payload(), "sections": ["method"], "sourceSha256": source_hash}
        )
        self.store.update_analysis_stage(
            task["id"],
            "method",
            "complete",
            {
                "sourceBasis": "fulltext",
                "sourceSha256": source_hash,
                "model": "test-model",
                "promptVersion": "phase5-test-v1",
                "content": stage_content(),
            },
        )
        dossier = self.store.get_paper(task["canonical_paper_id"])["dossier"]
        claim = dossier["content"]["method"]["sections"][0]
        evidence = claim["evidence"][0]
        self.assertRegex(claim["claim_id"], r"^claim-[a-f0-9]{20}$")
        self.assertEqual(evidence["source_sha256"], source_hash)
        self.assertEqual(dossier["coverage"]["located_claims"], 1)
        exported = self.store.export_dossier(task["canonical_paper_id"], "json")
        self.assertEqual(exported["schema_version"], 1)
        self.assertEqual(exported["paper"]["current_version"], "")
        self.assertEqual(exported["stages"]["method"]["source_sha256"], source_hash)
        markdown = self.store.export_dossier(task["canonical_paper_id"], "markdown")
        self.assertIn("Training objective", markdown["content"])
        self.assertIn("Paperfield", markdown["content"])

    def test_focus_saved_items_private_radar_and_digest(self):
        self.store.upsert_paper(paper_payload())
        term_a = self.store.create_editor_entity(
            {
                "entityKind": "method", "canonicalName": "World action model", "status": "active",
                "editorName": "tester", "reason": "Create reviewed method for focus testing.",
            }
        )
        profile = self.store.update_focus_profile(
            {
                "domains": ["embodied"], "keywords": ["world action"],
                "methodIds": [term_a["id"]], "sourceKeys": ["arxiv"],
            }
        )
        self.assertEqual(profile["method_ids"], [term_a["id"]])
        saved = self.store.save_item(
            {"itemKind": "paper", "itemRef": "arxiv:2608.00001", "title": "Research paper 00001"}
        )
        repeated = self.store.save_item(
            {"itemKind": "paper", "itemRef": "arxiv:2608.00001", "title": "Research paper 00001"}
        )
        self.assertEqual(saved["id"], repeated["id"])
        radar = self.store.private_radar()
        self.assertEqual(radar["scope"]["domains"], ["embodied"])
        digest = self.store.create_research_digest(
            {"periodStart": "2026-08-04", "periodEnd": "2026-08-11", "asOf": "2026-08-11T23:59:59+00:00"}
        )
        repeated_digest = self.store.create_research_digest(
            {"periodStart": "2026-08-04", "periodEnd": "2026-08-11", "asOf": "2026-08-11T23:59:59+00:00"}
        )
        self.assertEqual(digest["id"], repeated_digest["id"])
        self.assertEqual(digest["digest_type"], "private")
        self.store.delete_saved_item(saved["id"])
        self.assertEqual(self.store.list_saved_items(), [])

    def test_public_knowledge_projection_is_reviewed_and_cycle_bounded(self):
        method = self.store.create_editor_entity(
            {
                "entityKind": "method", "canonicalName": "Method A", "status": "active",
                "description": "Reviewed method.", "editorName": "tester",
                "reason": "Create reviewed method for public projection.",
            }
        )
        problem = self.store.create_editor_entity(
            {
                "entityKind": "problem", "canonicalName": "Problem B", "status": "active",
                "editorName": "tester", "reason": "Create reviewed problem for public projection.",
            }
        )
        hidden = self.store.create_editor_entity(
            {
                "entityKind": "thread", "canonicalName": "Candidate thread", "status": "candidate",
                "editorName": "tester", "reason": "Keep this thread private until reviewed.",
            }
        )
        relation = self.store.create_editor_relationship(
            {
                "fromEntityId": method["id"], "toEntityId": problem["id"], "relationType": "uses",
                "status": "active", "editorName": "tester", "reason": "Link reviewed entities with evidence.",
                "evidence": [{
                    "label": "paper evidence", "sourceRef": "arxiv:2608.00001",
                    "direction": "supports", "publishedAt": "2026-08-09", "page": 4,
                    "section": "4. Experiments",
                }],
            }
        )
        unrelated_problem = self.store.create_editor_entity(
            {
                "entityKind": "problem", "canonicalName": "Unrelated problem", "status": "active",
                "editorName": "tester", "reason": "Create an unrelated reviewed graph component.",
            }
        )
        unrelated_thread = self.store.create_editor_entity(
            {
                "entityKind": "thread", "canonicalName": "Unrelated thread", "status": "active",
                "editorName": "tester", "reason": "Create an unrelated reviewed graph component.",
            }
        )
        unrelated_relation = self.store.create_editor_relationship(
            {
                "fromEntityId": unrelated_thread["id"], "toEntityId": unrelated_problem["id"],
                "relationType": "related_to", "status": "active", "editorName": "tester",
                "reason": "Verify filtered public graph relation boundaries.",
            }
        )
        projection = self.store.public_knowledge(entity_kind="method")
        self.assertEqual([item["id"] for item in projection["items"]], [method["id"]])
        self.assertEqual([item["id"] for item in projection["relationships"]], [relation["id"]])
        self.assertNotIn(unrelated_relation["id"], json.dumps(projection))
        self.assertNotIn(hidden["id"], json.dumps(projection))
        detail = self.store.public_knowledge_entity(method["id"], depth=4, max_nodes=20, max_edges=1)
        self.assertEqual(detail["outgoing"][0]["id"], relation["id"])
        self.assertLessEqual(len(detail["graph"]["nodes"]), 20)
        self.assertLessEqual(len(detail["graph"]["relationships"]), 1)
        self.assertEqual(detail["graph"]["max_edges"], 1)
        self.assertEqual(detail["timeline"][0]["source_date"], "2026-08-09")
        self.assertEqual(detail["outgoing"][0]["evidence"][0]["page"], 4)

    def test_sqlite_backup_manifest_and_tamper_rejection(self):
        self.store.upsert_paper(paper_payload())
        backup = self.store.create_backup(self.root / "backups", {"editorName": "tester", "reason": "Phase 5 backup test."})
        backup_path = Path(backup["path"])
        self.assertTrue(backup_path.exists())
        self.assertEqual(hashlib.sha256(backup_path.read_bytes()).hexdigest(), backup["database_sha256"])
        checked = self.store.validate_backup(backup_path, backup["manifest"])
        self.assertEqual(checked["integrity"], "ok")
        backup_path.write_bytes(backup_path.read_bytes() + b"tamper")
        with self.assertRaisesRegex(atlas.AtlasError, "SHA-256"):
            self.store.validate_backup(backup_path, backup["manifest"])


class Phase5HttpTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = atlas.AtlasStore(Path(self.directory.name) / "atlas.db")
        self.server = atlas.create_server(
            "127.0.0.1", 0, self.store, "http://127.0.0.1:8765/", "http://127.0.0.1:4178/"
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()
        self.directory.cleanup()

    def request(self, path, method="GET", payload=None, headers=None):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}{path}", data=data, method=method,
            headers={"Content-Type": "application/json", **(headers or {})},
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8")), response.headers

    def test_public_bootstrap_excludes_private_data(self):
        self.store.create_analysis_request({"paper": paper_payload(), "sections": ["method"]})
        _, public, _ = self.request("/api/bootstrap")
        self.assertNotIn("analysis_requests", public)
        self.assertNotIn("signal_drafts", public)
        self.assertNotIn("saved_items", public)
        self.assertNotIn("focus_profile", public)
        _, private, _ = self.request("/api/private/bootstrap", headers={"Origin": self.base_url})
        self.assertEqual(len(private["analysis_requests"]), 1)
        self.assertIn("saved_items", private)

    def test_search_rejects_bad_cursor_and_private_origin_is_enforced(self):
        self.store.upsert_paper(paper_payload())
        _, result, _ = self.request("/api/search?q=Research&kind=paper&limit=1")
        self.assertEqual(result["total"], 1)
        with self.assertRaises(urllib.error.HTTPError) as bad_cursor:
            self.request("/api/search?cursor=not-a-cursor")
        self.assertEqual(bad_cursor.exception.code, 400)
        with self.assertRaises(urllib.error.HTTPError) as bad_origin:
            self.request("/api/private/bootstrap", headers={"Origin": "https://attacker.invalid"})
        self.assertEqual(bad_origin.exception.code, 403)

        with self.assertRaises(urllib.error.HTTPError) as bad_post_origin:
            self.request(
                "/api/private/learning-progress",
                method="POST",
                payload={"chapterId": "embodied-robotics-control", "status": "learning"},
                headers={"Origin": "https://attacker.invalid"},
            )
        self.assertEqual(bad_post_origin.exception.code, 403)

    def test_local_editor_backup_routes_remain_available(self):
        status, backup, _ = self.request(
            "/api/editor/backups/export",
            method="POST",
            payload={"editorName": "tester", "reason": "Verify local backup route policy."},
        )
        self.assertEqual(status, 201)

        status, listing, _ = self.request("/api/editor/backups")
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in listing["items"]], [backup["id"]])

        status, manifest, _ = self.request(f"/api/editor/backups/{backup['id']}/manifest")
        self.assertEqual(status, 200)
        self.assertEqual(manifest["id"], backup["id"])

        status, verified, _ = self.request(
            "/api/editor/backups/verify",
            method="POST",
            payload={
                "backupId": backup["id"],
                "editorName": "tester",
                "reason": "Verify the newly created local backup.",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(verified["integrity"], "ok")

    def test_worker_and_scanner_diagnostics_do_not_disclose_secrets(self):
        _, diagnostics, _ = self.request("/api/private/diagnostics", headers={"Origin": self.base_url})
        serialized = json.dumps(diagnostics).lower()
        self.assertNotIn("api_key", serialized)
        self.assertNotIn("token", serialized)
        self.assertIn("worker", diagnostics)
        self.assertIn("scanner", diagnostics)

    def test_worker_and_scanner_cli_dry_run_are_read_only(self):
        root = Path(__file__).resolve().parents[1]
        environment = os.environ.copy()
        # Keep the worker in its credential-missing inspection path.  The
        # values are deliberately unique so a future diagnostic regression
        # cannot accidentally echo a secret-shaped value.
        environment.update(
            {
                "RESEARCH_ATLAS_WORKER_TOKEN": "dry-run-token-value-should-not-appear",
                "RESEARCH_ATLAS_OPENAI_API_KEY": "dry-run-api-key-value-should-not-appear",
                "RESEARCH_ATLAS_OPENAI_MODEL": "",
                "PYTHONIOENCODING": "utf-8",
            }
        )
        worker = subprocess.run(
            [sys.executable, "-m", "src.research_atlas.worker", "--dry-run"],
            cwd=root,
            env=environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=20,
            check=False,
        )
        self.assertEqual(worker.returncode, 0, worker.stderr)
        worker_payload = json.loads(worker.stdout)
        self.assertTrue(worker_payload["dry_run"])
        self.assertFalse(worker_payload["writes_performed"])
        self.assertNotIn("dry-run-token-value", worker.stdout)
        self.assertNotIn("dry-run-api-key-value", worker.stdout)

        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "scanner-should-not-exist.db"
            scanner = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "src.research_atlas.scanner",
                    "--dry-run",
                    "--db",
                    str(database),
                    "--domains",
                    "embodied",
                    "--skip-official-updates",
                ],
                cwd=root,
                env=environment,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=20,
                check=False,
            )
            self.assertEqual(scanner.returncode, 0, scanner.stderr)
            scanner_payload = json.loads(scanner.stdout)
            self.assertTrue(scanner_payload["dry_run"])
            self.assertFalse(scanner_payload["writes_performed"])
            self.assertFalse(scanner_payload["network_requests_performed"])
            self.assertFalse(database.exists())


class PaperfieldCatalogPhase5Tests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = paperfield.PaperStore(Path(self.directory.name) / "paperfield.db")

    def tearDown(self):
        self.directory.cleanup()

    def test_sequence_hash_cursor_and_tombstone(self):
        payload = {
            "id": "arxiv:2608.00001", "title": "Catalog paper", "abstract": "abstract",
            "authors": ["Researcher"], "institutions": [], "venue": "arXiv",
            "published": "2026-08-11", "updated": "2026-08-11", "source": "arxiv",
            "source_url": "https://arxiv.org/abs/2608.00001", "pdf_url": "", "doi": "",
            "journal_ref": "", "topics": ["embodied"], "subtopics": [], "quality_score": 1,
            "citation_count": 0, "fetched_at": "2026-08-11T00:00:00+00:00",
        }
        self.store.upsert(payload)
        page = self.store.atlas_catalog_page(0, 1)
        self.assertEqual(page["items"][0]["seq"], page["nextCursor"])
        self.assertEqual(page["items"][0]["payload"]["title"], "Catalog paper")
        canonical = json.dumps(page["items"][0]["payload"], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        self.assertEqual(page["items"][0]["payloadSha256"], hashlib.sha256(canonical.encode()).hexdigest())
        old_watermark = page["watermark"]
        updated = dict(payload)
        updated.update(
            {
                "title": "Catalog paper revised",
                "abstract": "revised abstract",
                "updated": "2026-08-12",
            }
        )
        self.store.upsert(updated)
        replay = self.store.atlas_catalog_page(0, 1)
        self.assertEqual(replay["watermark"], old_watermark + 1)
        self.assertEqual(replay["items"][0]["payload"]["title"], "Catalog paper")
        next_page = self.store.atlas_catalog_page(page["nextCursor"], 10)
        self.assertEqual(next_page["items"][0]["payload"]["title"], "Catalog paper revised")
        with self.store.connect() as db:
            db.execute("DELETE FROM papers WHERE id='arxiv:2608.00001'")
        tombstone = self.store.atlas_catalog_page(next_page["nextCursor"], 10)
        self.assertTrue(tombstone["items"][-1]["deleted"])
        self.assertIsNone(tombstone["items"][-1]["payload"])
        with self.store.connect() as db:
            columns = {row["name"] for row in db.execute("PRAGMA table_info(atlas_catalog_changes)").fetchall()}
            self.assertIn("payload_json", columns)
            self.assertIn("payload_sha256", columns)
            event = db.execute(
                "SELECT payload_json, payload_sha256 FROM atlas_catalog_changes WHERE operation='delete' ORDER BY seq DESC LIMIT 1"
            ).fetchone()
            self.assertEqual(event["payload_json"], "{}")
            self.assertEqual(event["payload_sha256"], hashlib.sha256(b"{}").hexdigest())
        with self.assertRaises(ValueError):
            self.store.atlas_catalog_page(tombstone["watermark"] + 1, 10)

    def test_catalog_page_rejects_unknown_event_operation(self):
        payload = {
            "id": "arxiv:2608.00009", "title": "Catalog validation", "abstract": "abstract",
            "authors": [], "institutions": [], "venue": "arXiv", "published": "2026-08-11",
            "updated": "2026-08-11", "source": "arxiv", "source_url": "", "pdf_url": "",
            "doi": "", "journal_ref": "", "topics": [], "subtopics": [], "quality_score": 0,
            "citation_count": 0, "fetched_at": "2026-08-11T00:00:00+00:00",
        }
        self.store.upsert(payload)
        with self.store.connect() as db:
            db.execute("UPDATE atlas_catalog_changes SET operation='unknown' WHERE object_id=?", (payload["id"],))
        with self.assertRaisesRegex(ValueError, "operation"):
            self.store.atlas_catalog_page(0, 10)

    def test_catalog_snapshot_backfill_runs_once_per_schema_version(self):
        path = Path(self.directory.name) / "paperfield.db"
        with mock.patch.object(
            paperfield.PaperStore,
            "_backfill_atlas_catalog_snapshots",
            wraps=paperfield.PaperStore._backfill_atlas_catalog_snapshots,
        ) as backfill:
            # setUp created the first store, so this is the only migration
            # call we expect for an already initialized schema-2 database.
            paperfield.PaperStore(path)
            self.assertEqual(backfill.call_count, 0)
            self.store.upsert(
                {
                    "id": "paper-schema-2",
                    "title": "Catalog snapshot",
                    "abstract": "A test paper",
                    "authors": ["Researcher"],
                    "institutions": [],
                    "venue": "arXiv",
                    "published": "2026-08-12",
                    "updated": "2026-08-12",
                    "source": "arXiv",
                    "source_url": "https://arxiv.org/abs/1",
                    "pdf_url": "",
                    "doi": "",
                    "journal_ref": "",
                    "topics": ["embodied"],
                    "subtopics": [],
                    "quality_score": 1,
                    "citation_count": 0,
                    "fetched_at": "2026-08-12T00:00:00+00:00",
                }
            )
            paperfield.PaperStore(path)
            self.assertEqual(backfill.call_count, 0)

        with sqlite3.connect(path) as db:
            payload, digest = db.execute(
                "SELECT payload_json, payload_sha256 FROM atlas_catalog_changes WHERE object_id='paper-schema-2'"
            ).fetchone()
            self.assertIn("Catalog snapshot", payload)
            self.assertEqual(digest, hashlib.sha256(payload.encode("utf-8")).hexdigest())

    def test_complete_legacy_snapshots_restore_schema_marker_without_backfill(self):
        path = Path(self.directory.name) / "complete-legacy.db"
        store = paperfield.PaperStore(path)
        store.upsert(
            {
                "id": "paper-complete-legacy",
                "title": "Complete legacy snapshot",
                "abstract": "A complete immutable catalog event.",
                "authors": ["Researcher"],
                "institutions": [],
                "venue": "arXiv",
                "published": "2026-08-13",
                "updated": "2026-08-13",
                "source": "arXiv",
                "source_url": "https://arxiv.org/abs/2608.00010",
                "pdf_url": "",
                "doi": "",
                "journal_ref": "",
                "topics": ["embodied"],
                "subtopics": [],
                "quality_score": 1,
                "citation_count": 0,
                "fetched_at": "2026-08-13T00:00:00+00:00",
            }
        )
        with store.connect() as db:
            db.execute(
                "DELETE FROM app_metadata WHERE key IN "
                "('atlas_catalog_schema_version', 'atlas_catalog_trigger_version')"
            )

        with mock.patch.object(
            paperfield.PaperStore,
            "_backfill_atlas_catalog_snapshots",
            wraps=paperfield.PaperStore._backfill_atlas_catalog_snapshots,
        ) as backfill:
            reopened = paperfield.PaperStore(path)
            self.assertEqual(backfill.call_count, 0)
            with reopened.connect() as db:
                markers = dict(
                    db.execute(
                        "SELECT key, value FROM app_metadata WHERE key LIKE 'atlas_catalog_%'"
                    ).fetchall()
                )
            self.assertEqual(markers["atlas_catalog_schema_version"], "2")
            self.assertEqual(markers["atlas_catalog_trigger_version"], "2")

    def test_invalid_legacy_snapshot_still_uses_safe_backfill(self):
        path = Path(self.directory.name) / "invalid-legacy.db"
        store = paperfield.PaperStore(path)
        store.upsert(
            {
                "id": "paper-invalid-legacy",
                "title": "Invalid legacy snapshot",
                "abstract": "The stored event hash will be damaged.",
                "authors": ["Researcher"],
                "institutions": [],
                "venue": "arXiv",
                "published": "2026-08-13",
                "updated": "2026-08-13",
                "source": "arXiv",
                "source_url": "https://arxiv.org/abs/2608.00011",
                "pdf_url": "",
                "doi": "",
                "journal_ref": "",
                "topics": ["embodied"],
                "subtopics": [],
                "quality_score": 1,
                "citation_count": 0,
                "fetched_at": "2026-08-13T00:00:00+00:00",
            }
        )
        with store.connect() as db:
            db.execute(
                "DELETE FROM app_metadata WHERE key IN "
                "('atlas_catalog_schema_version', 'atlas_catalog_trigger_version')"
            )
            db.execute(
                "UPDATE atlas_catalog_changes SET payload_sha256='' "
                "WHERE object_id='paper-invalid-legacy'"
            )

        with mock.patch.object(
            paperfield.PaperStore,
            "_backfill_atlas_catalog_snapshots",
            wraps=paperfield.PaperStore._backfill_atlas_catalog_snapshots,
        ) as backfill:
            reopened = paperfield.PaperStore(path)
            self.assertEqual(backfill.call_count, 1)
            with reopened.connect() as db:
                payload, digest = db.execute(
                    "SELECT payload_json, payload_sha256 FROM atlas_catalog_changes "
                    "WHERE object_id='paper-invalid-legacy'"
                ).fetchone()
            self.assertEqual(digest, hashlib.sha256(payload.encode("utf-8")).hexdigest())
            # MagicMock retains positional arguments, including the migration
            # connection, until reset. Release it before Windows removes the
            # temporary SQLite file in tearDown.
            backfill.reset_mock()


if __name__ == "__main__":
    unittest.main()
