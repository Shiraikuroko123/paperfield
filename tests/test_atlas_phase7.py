import gc
import json
import sqlite3
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

from src.research_atlas import app as atlas


class Phase7StoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "atlas.db"
        self.store = atlas.AtlasStore(self.database)

    def tearDown(self):
        self.store = None
        self.directory.cleanup()

    def test_view_run_retry_reuses_resource_without_new_snapshot(self):
        self.store.upsert_paper(
            {"paperfieldId": "arxiv:phase7", "title": "World action model", "abstract": "robot policy"}
        )
        view = self.store.create_research_view(
            {
                "name": "Phase 7 search",
                "viewKind": "search",
                "definition": {"query": "world action", "kinds": ["paper"], "limit": 10},
            }
        )
        payload = {"idempotencyKey": "phase7-view-run-retry"}
        first = self.store.apply_research_view(view["id"], "local", payload)
        repeated = self.store.apply_research_view(view["id"], "local", payload)

        self.assertFalse(first["idempotent_replay"])
        self.assertTrue(repeated["idempotent_replay"])
        self.assertEqual(first["run"]["id"], repeated["run"]["id"])
        self.assertEqual(first["run"]["search_snapshot_id"], repeated["run"]["search_snapshot_id"])
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM research_view_runs").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM search_snapshots").fetchone()[0], 1)
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM operation_idempotency").fetchone()[0], 1
            )

    def test_view_run_idempotency_key_conflict_and_owner_isolation(self):
        first_view = self.store.create_research_view(
            {"name": "First", "viewKind": "focus", "definition": {}}, "local"
        )
        second_view = self.store.create_research_view(
            {"name": "Second", "viewKind": "focus", "definition": {}}, "local"
        )
        payload = {"idempotencyKey": "phase7-shared-key"}
        self.store.apply_research_view(first_view["id"], "local", payload)
        with self.assertRaises(atlas.ConflictError):
            self.store.apply_research_view(second_view["id"], "local", payload)

        other_view = self.store.create_research_view(
            {"name": "Other owner", "viewKind": "focus", "definition": {}}, "other"
        )
        other = self.store.apply_research_view(other_view["id"], "other", payload)
        self.assertFalse(other["idempotent_replay"])

    def test_bundle_retry_reuses_original_bytes_and_rejects_changed_request(self):
        view = self.store.create_research_view(
            {"name": "Bundle", "viewKind": "focus", "definition": {}}
        )
        run = self.store.apply_research_view(view["id"])["run"]
        payload = {"viewRunId": run["id"], "idempotencyKey": "phase7-bundle-retry"}
        first = self.store.create_provenance_bundle(payload)
        repeated = self.store.create_provenance_bundle(payload)

        self.assertFalse(first["idempotent_replay"])
        self.assertTrue(repeated["idempotent_replay"])
        self.assertEqual(first["id"], repeated["id"])
        self.assertEqual(first["bundle_sha256"], repeated["bundle_sha256"])
        self.assertEqual(first["markdown"], repeated["markdown"])
        with self.assertRaises(atlas.ConflictError):
            self.store.create_provenance_bundle(
                {**payload, "paperIds": [999999]}
            )
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM provenance_bundles").fetchone()[0], 1)

    def test_bundle_retry_returns_even_after_snapshot_expiry(self):
        self.store.upsert_paper(
            {"paperfieldId": "arxiv:phase7-expiry", "title": "Expiring snapshot", "abstract": "robot"}
        )
        view = self.store.create_research_view(
            {
                "name": "Expiry",
                "viewKind": "search",
                "definition": {"query": "expiring", "kinds": ["paper"], "limit": 10},
            }
        )
        run = self.store.apply_research_view(view["id"])["run"]
        payload = {"viewRunId": run["id"], "idempotencyKey": "phase7-expired-bundle"}
        first = self.store.create_provenance_bundle(payload)
        with self.store.connect() as db:
            db.execute(
                "UPDATE search_snapshots SET expires_at='2000-01-01T00:00:00+00:00' WHERE id=?",
                (run["search_snapshot_id"],),
            )
        replay = self.store.create_provenance_bundle(payload)
        self.assertTrue(replay["idempotent_replay"])
        self.assertEqual(first["id"], replay["id"])
        self.assertEqual(first["bundle_sha256"], replay["bundle_sha256"])

    def test_successive_runs_record_hash_verified_delta(self):
        first_paper = self.store.upsert_paper(
            {"paperfieldId": "arxiv:phase7-a", "title": "Robot policy A", "abstract": "embodied"}
        )
        view = self.store.create_research_view(
            {
                "name": "Delta",
                "viewKind": "search",
                "definition": {"query": "robot policy", "kinds": ["paper"], "limit": 10},
            }
        )
        baseline = self.store.apply_research_view(
            view["id"], "local", {"idempotencyKey": "phase7-delta-a"}
        )["run"]
        second_paper = self.store.upsert_paper(
            {"paperfieldId": "arxiv:phase7-b", "title": "Robot policy B", "abstract": "embodied"}
        )
        current = self.store.apply_research_view(
            view["id"], "local", {"idempotencyKey": "phase7-delta-b"}
        )["run"]

        self.assertTrue(baseline["delta"]["baseline"])
        self.assertEqual(current["previous_run_id"], baseline["id"])
        self.assertEqual(current["delta"]["added_count"], 1)
        self.assertEqual(current["delta"]["added"][0]["ref"], second_paper["canonical_ref"])
        self.assertEqual(current["delta"]["unchanged_count"], 1)
        self.assertEqual(first_paper["canonical_ref"], baseline["result"]["items"][0]["canonical_ref"])
        canonical = json.dumps(
            current["delta"], ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        import hashlib

        self.assertEqual(
            current["delta_sha256"], hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        )
        bundle = self.store.create_provenance_bundle({"viewRunId": current["id"]})
        self.assertEqual(bundle["bundle"]["run"]["delta_sha256"], current["delta_sha256"])

    def test_same_second_runs_form_strict_sequence_and_latest_is_tail(self):
        view = self.store.create_research_view(
            {"name": "Frozen clock", "viewKind": "focus", "definition": {}}
        )
        fixed_now = "2026-08-12T05:00:00+00:00"
        runs = []
        with mock.patch.object(atlas, "utc_now", return_value=fixed_now):
            for index in range(5):
                runs.append(
                    self.store.apply_research_view(
                        view["id"],
                        "local",
                        {"idempotencyKey": f"phase7-frozen-{index}"},
                    )["run"]
                )

        self.assertEqual([run["run_sequence"] for run in runs], [1, 2, 3, 4, 5])
        self.assertEqual(runs[0]["previous_run_id"], "")
        for previous, current in zip(runs, runs[1:]):
            self.assertEqual(current["previous_run_id"], previous["id"])
            self.assertEqual(current["run_sequence"], previous["run_sequence"] + 1)
        listed = self.store.list_research_view_runs("local", view["id"], 10)
        self.assertEqual(listed[0]["id"], runs[-1]["id"])
        self.assertEqual(listed[0]["run_sequence"], 5)

    def test_cleanup_at_exact_capacity_does_not_evict_without_incoming_snapshot(self):
        with self.store.connect() as db:
            now = atlas.utc_now()
            expires = atlas.utc_after(3600)
            for index in range(atlas.SEARCH_SNAPSHOT_MAX_ACTIVE_PER_OWNER):
                db.execute(
                    """
                    INSERT INTO search_snapshots(
                        id, owner_id, fingerprint, query_json, watermark, paper_max_id,
                        project_max_rowid, result_count, result_sha256, max_items,
                        created_at, expires_at, last_accessed_at
                    ) VALUES (?, 'local', ?, '{}', ?, 0, 0, 0, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"00000000-0000-0000-0000-{index:012d}",
                        f"fingerprint-{index}",
                        now,
                        "0" * 64,
                        atlas.SEARCH_SNAPSHOT_MAX_ITEMS,
                        now,
                        expires,
                        now,
                    ),
                )
        cleaned = self.store.cleanup_search_snapshots("local")
        self.assertEqual(cleaned["capacity_snapshots"], 0)
        self.assertEqual(cleaned["active_snapshots"], atlas.SEARCH_SNAPSHOT_MAX_ACTIVE_PER_OWNER)

        created = self.store.search_catalog(owner_id="local")
        self.assertTrue(created["snapshot_id"])
        with self.store.connect() as db:
            self.assertEqual(
                db.execute(
                    "SELECT COUNT(*) FROM search_snapshots WHERE owner_id='local'"
                ).fetchone()[0],
                atlas.SEARCH_SNAPSHOT_MAX_ACTIVE_PER_OWNER,
            )

    def test_expired_snapshot_cleanup_is_owner_scoped(self):
        expired_at = "2000-01-01T00:00:00+00:00"
        with self.store.connect() as db:
            for owner, suffix, count in (("local", "1", 2), ("other", "2", 3)):
                db.execute(
                    """
                    INSERT INTO search_snapshots(
                        id, owner_id, fingerprint, query_json, watermark, paper_max_id,
                        project_max_rowid, result_count, result_sha256, max_items,
                        created_at, expires_at, last_accessed_at
                    ) VALUES (?, ?, ?, '{}', ?, 0, 0, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"00000000-0000-0000-0000-00000000000{suffix}",
                        owner,
                        f"expired-{owner}",
                        expired_at,
                        count,
                        "0" * 64,
                        atlas.SEARCH_SNAPSHOT_MAX_ITEMS,
                        expired_at,
                        expired_at,
                        expired_at,
                    ),
                )

        cleaned = self.store.cleanup_search_snapshots("local")
        self.assertEqual(cleaned["expired_snapshots"], 1)
        self.assertEqual(cleaned["expired_items"], 2)
        with self.store.connect() as db:
            self.assertEqual(
                db.execute(
                    "SELECT COUNT(*) FROM search_snapshots WHERE owner_id='local'"
                ).fetchone()[0],
                0,
            )
            self.assertEqual(
                db.execute(
                    "SELECT COUNT(*) FROM search_snapshots WHERE owner_id='other'"
                ).fetchone()[0],
                1,
            )

    def _complete_private_export(self):
        self.store.update_focus_profile(
            {"domains": ["embodied"], "keywords": ["world model"]}
        )
        self.store.save_item(
            {
                "itemKind": "paper",
                "itemRef": "arxiv:2608.01234",
                "title": "Portable private paper",
                "tags": ["frontier"],
                "note": "Read the failure analysis.",
            }
        )
        first_digest = self.store.create_research_digest(
            {
                "periodStart": "2026-08-01",
                "periodEnd": "2026-08-07",
                "asOf": "2026-08-07T12:00:00+00:00",
            }
        )
        second_digest = self.store.create_research_digest(
            {
                "periodStart": "2026-08-08",
                "periodEnd": "2026-08-12",
                "asOf": "2026-08-12T12:00:00+00:00",
            }
        )
        self.assertEqual(second_digest["previous_digest_id"], first_digest["id"])
        view = self.store.create_research_view(
            {
                "name": "Portable focus",
                "description": "Explicit private scope",
                "viewKind": "focus",
                "definition": {
                    "domains": ["embodied"],
                    "keywords": ["world model"],
                },
            }
        )
        baseline = self.store.apply_research_view(
            view["id"], "local", {"idempotencyKey": "phase7-export-run-a"}
        )["run"]
        current = self.store.apply_research_view(
            view["id"], "local", {"idempotencyKey": "phase7-export-run-b"}
        )["run"]
        self.assertEqual(current["previous_run_id"], baseline["id"])
        bundle = self.store.create_provenance_bundle(
            {
                "viewRunId": current["id"],
                "idempotencyKey": "phase7-export-bundle",
            }
        )
        now = atlas.utc_now()
        with self.store.connect() as db:
            self.store._upsert_notification(
                db,
                owner_id="local",
                notification_kind="paper_lead",
                evidence_level="unreviewed_abstract_lead",
                title="Portable lead",
                body="A lead is not a reviewed conclusion.",
                source_kind="frontier_candidate",
                source_ref="candidate:portable",
                source_revision="sha256:portable",
                payload={"evidence_boundary": "lead_only"},
                now=now,
            )
        notification = self.store.list_notifications()[0]
        self.store.mark_notification_read(notification["id"])
        exported = self.store.export_research_data()
        return exported, view, current, bundle

    def test_private_workspace_export_import_round_trip_and_replay(self):
        exported, view, current, bundle = self._complete_private_export()
        serialized = json.dumps(exported, ensure_ascii=False)
        self.assertEqual(exported["schema_version"], atlas.RESEARCH_DATA_SCHEMA_VERSION)
        self.assertNotIn("operation_idempotency", exported)
        self.assertNotIn("phase7-export-run-a", serialized)
        self.assertNotIn("phase7-export-run-b", serialized)
        self.assertNotIn("phase7-export-bundle", serialized)
        self.assertTrue(
            {
                "research_views",
                "research_view_runs",
                "notifications",
                "provenance_bundles",
            }.issubset(exported)
        )

        restored_path = Path(self.directory.name) / "restored.db"
        restored = atlas.AtlasStore(restored_path)
        try:
            dry_payload = {**exported, "dryRun": True}
            dry_run = restored.import_research_data(dry_payload, "restored")
            self.assertTrue(dry_run["dry_run"])
            self.assertEqual(dry_run["created"]["research_view_runs"], 2)
            with restored.connect() as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM research_views").fetchone()[0], 0)

            imported = restored.import_research_data(
                {**exported, "dryRun": False}, "restored"
            )
            self.assertTrue(imported["imported"])
            self.assertEqual(imported["created"]["research_views"], 1)
            self.assertEqual(imported["created"]["research_view_runs"], 2)
            self.assertEqual(imported["created"]["notifications"], 1)
            self.assertEqual(imported["created"]["provenance_bundles"], 1)
            self.assertEqual(
                restored.get_research_view(view["id"], "restored")["name"],
                "Portable focus",
            )
            self.assertEqual(
                restored.get_research_view_run(current["id"], "restored")["previous_run_id"],
                exported["research_view_runs"][0]["id"],
            )
            restored_bundle = restored.get_provenance_bundle(bundle["id"], "restored")
            self.assertEqual(restored_bundle["bundle_sha256"], bundle["bundle_sha256"])
            self.assertTrue(restored.verify_provenance_bundle(restored_bundle)["valid"])
            self.assertTrue(restored.list_notifications("restored")[0]["read"])
            with restored.connect() as db:
                self.assertEqual(
                    db.execute("SELECT COUNT(*) FROM operation_idempotency").fetchone()[0],
                    0,
                )

            replay = restored.import_research_data(
                {**exported, "dryRun": False}, "restored"
            )
            self.assertEqual(sum(replay["created"].values()), 0)
            self.assertEqual(replay["reused"]["research_view_runs"], 2)
            self.assertFalse(replay["focus_profile_updated"])
        finally:
            restored.close()

    def test_private_workspace_import_rejects_cross_owner_ids(self):
        exported, _view, _run, _bundle = self._complete_private_export()
        target = atlas.AtlasStore(Path(self.directory.name) / "owners.db")
        try:
            target.import_research_data({**exported, "dryRun": False}, "alpha")
            with self.assertRaises(atlas.ConflictError):
                target.import_research_data({**exported, "dryRun": False}, "beta")
            with target.connect() as db:
                self.assertEqual(
                    db.execute(
                        "SELECT COUNT(*) FROM research_views WHERE owner_id='beta'"
                    ).fetchone()[0],
                    0,
                )
                self.assertEqual(
                    db.execute(
                        "SELECT COUNT(*) FROM saved_items WHERE owner_id='beta'"
                    ).fetchone()[0],
                    0,
                )
        finally:
            target.close()
            gc.collect()

    def test_private_workspace_import_verifies_bundle_and_rolls_back_late_failure(self):
        exported, _view, _run, _bundle = self._complete_private_export()
        tampered = json.loads(json.dumps(exported))
        tampered["provenance_bundles"][0]["markdown"] += "tampered"
        target = atlas.AtlasStore(Path(self.directory.name) / "atomic.db")
        try:
            with self.assertRaisesRegex(atlas.AtlasError, "verification failed"):
                target.import_research_data({**tampered, "dryRun": False})
            with mock.patch.object(
                target, "_record_editor_audit", side_effect=RuntimeError("late audit failure")
            ):
                with self.assertRaisesRegex(RuntimeError, "late audit failure"):
                    target.import_research_data({**exported, "dryRun": False})
            with target.connect() as db:
                for table in (
                    "focus_profiles",
                    "saved_items",
                    "research_digests",
                    "research_views",
                    "research_view_runs",
                    "research_notifications",
                    "provenance_bundles",
                ):
                    self.assertEqual(
                        db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0],
                        0,
                        table,
                    )
        finally:
            target.close()
            gc.collect()

    def test_private_workspace_import_rejects_resigned_semantic_delta_tampering(self):
        exported, _view, _run, _bundle = self._complete_private_export()
        tampered = json.loads(json.dumps(exported))
        tampered["provenance_bundles"] = []
        changed_run = next(
            run for run in tampered["research_view_runs"] if run["previous_run_id"]
        )
        changed_run["delta"]["unchanged_count"] += 1
        import hashlib

        canonical_delta = json.dumps(
            changed_run["delta"],
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        changed_run["delta_sha256"] = hashlib.sha256(
            canonical_delta.encode("utf-8")
        ).hexdigest()

        target = atlas.AtlasStore(Path(self.directory.name) / "semantic-delta.db")
        try:
            with self.assertRaisesRegex(
                atlas.AtlasError, "delta does not match its predecessor result"
            ):
                target.import_research_data({**tampered, "dryRun": False}, "restored")
            with target.connect() as db:
                for table in (
                    "focus_profiles",
                    "saved_items",
                    "research_digests",
                    "research_views",
                    "research_view_runs",
                    "research_notifications",
                    "provenance_bundles",
                ):
                    self.assertEqual(
                        db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0],
                        0,
                        table,
                    )
            db.close()
        finally:
            target.close()
            gc.collect()

    def _assert_resigned_invalid_chain_rejected(self, mutation):
        view = self.store.create_research_view(
            {"name": "Three run chain", "viewKind": "focus", "definition": {}}
        )
        for index in range(3):
            self.store.apply_research_view(
                view["id"],
                "local",
                {"idempotencyKey": f"phase7-chain-{index}"},
            )
        exported = self.store.export_research_data()
        tampered = json.loads(json.dumps(exported))
        tampered["provenance_bundles"] = []
        runs = sorted(tampered["research_view_runs"], key=lambda run: run["run_sequence"])
        mutation(runs)
        import hashlib

        by_id = {run["id"]: run for run in runs}
        for run in runs:
            previous = by_id.get(run["previous_run_id"])
            run["delta"] = self.store._research_run_delta(
                run["view_kind"],
                run["result"],
                previous["result"] if previous else None,
                run["previous_run_id"],
            )
            canonical_delta = json.dumps(
                run["delta"], ensure_ascii=False, sort_keys=True, separators=(",", ":")
            )
            run["delta_sha256"] = hashlib.sha256(
                canonical_delta.encode("utf-8")
            ).hexdigest()

        target = atlas.AtlasStore(Path(self.directory.name) / f"chain-{id(mutation)}.db")
        try:
            with self.assertRaisesRegex(
                atlas.AtlasError, "chain|sequence|baseline|fork|disconnected|adjacent"
            ):
                target.import_research_data({**tampered, "dryRun": True}, "restored")
            with self.assertRaises(atlas.AtlasError):
                target.import_research_data({**tampered, "dryRun": False}, "restored")
            with target.connect() as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM research_views").fetchone()[0], 0)
                self.assertEqual(
                    db.execute("SELECT COUNT(*) FROM research_view_runs").fetchone()[0], 0
                )
            db.close()
        finally:
            target.close()
            gc.collect()

    def test_private_workspace_import_rejects_resigned_skipped_predecessor(self):
        def skip_middle(runs):
            self.assertEqual(len(runs), 3)
            runs[2]["previous_run_id"] = runs[0]["id"]

        self._assert_resigned_invalid_chain_rejected(skip_middle)

    def test_private_workspace_import_rejects_resigned_multiple_baselines(self):
        def add_baseline(runs):
            self.assertEqual(len(runs), 3)
            runs[1]["previous_run_id"] = ""

        self._assert_resigned_invalid_chain_rejected(add_baseline)


class Phase7MigrationTests(unittest.TestCase):
    @staticmethod
    def _replace_with_v10_run_table(db):
        db.execute("DROP INDEX IF EXISTS idx_research_view_runs_sequence")
        db.execute("DROP INDEX IF EXISTS idx_research_view_runs_view")
        db.execute("ALTER TABLE research_view_runs RENAME TO research_view_runs_v11")
        db.execute(
            """
            CREATE TABLE research_view_runs (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                view_id TEXT NOT NULL,
                view_name TEXT NOT NULL,
                view_kind TEXT NOT NULL,
                view_revision INTEGER NOT NULL,
                definition_json TEXT NOT NULL,
                evidence_boundary_json TEXT NOT NULL,
                search_snapshot_id TEXT NOT NULL DEFAULT '',
                result_json TEXT NOT NULL,
                result_sha256 TEXT NOT NULL,
                previous_run_id TEXT NOT NULL DEFAULT '',
                delta_json TEXT NOT NULL DEFAULT '{}',
                delta_sha256 TEXT NOT NULL DEFAULT '',
                run_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            INSERT INTO research_view_runs(
                id, owner_id, view_id, view_name, view_kind, view_revision,
                definition_json, evidence_boundary_json, search_snapshot_id,
                result_json, result_sha256, previous_run_id, delta_json,
                delta_sha256, run_at
            )
            SELECT id, owner_id, view_id, view_name, view_kind, view_revision,
                   definition_json, evidence_boundary_json, search_snapshot_id,
                   result_json, result_sha256, previous_run_id, delta_json,
                   delta_sha256, run_at
            FROM research_view_runs_v11
            """
        )
        db.execute("DROP TABLE research_view_runs_v11")
        db.execute(
            "CREATE INDEX idx_research_view_runs_view "
            "ON research_view_runs(owner_id, view_id, run_at DESC)"
        )

    @staticmethod
    def _replace_with_v9_run_table(db):
        db.execute("DROP INDEX IF EXISTS idx_research_view_runs_view")
        db.execute("ALTER TABLE research_view_runs RENAME TO research_view_runs_v10")
        db.execute(
            """
            CREATE TABLE research_view_runs (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                view_id TEXT NOT NULL,
                view_name TEXT NOT NULL,
                view_kind TEXT NOT NULL,
                view_revision INTEGER NOT NULL,
                definition_json TEXT NOT NULL,
                evidence_boundary_json TEXT NOT NULL,
                search_snapshot_id TEXT NOT NULL DEFAULT '',
                result_json TEXT NOT NULL,
                result_sha256 TEXT NOT NULL,
                run_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            INSERT INTO research_view_runs(
                id, owner_id, view_id, view_name, view_kind, view_revision,
                definition_json, evidence_boundary_json, search_snapshot_id,
                result_json, result_sha256, run_at
            )
            SELECT id, owner_id, view_id, view_name, view_kind, view_revision,
                   definition_json, evidence_boundary_json, search_snapshot_id,
                   result_json, result_sha256, run_at
            FROM research_view_runs_v10
            """
        )
        db.execute("DROP TABLE research_view_runs_v10")
        db.execute(
            "CREATE INDEX idx_research_view_runs_view "
            "ON research_view_runs(owner_id, view_id, run_at DESC)"
        )

    def test_v9_migrates_operation_ledger_and_run_delta_columns(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "atlas.db"
            atlas.AtlasStore(database).close()
            db = sqlite3.connect(database)
            try:
                db.execute("DROP TABLE operation_idempotency")
                db.execute("DELETE FROM schema_migrations WHERE version > 9")
                db.execute("UPDATE app_metadata SET value='9' WHERE key='schema_version'")
                # SQLite cannot drop columns portably. A v9 database simply has
                # no ledger; the additive columns are harmless when already present.
                db.commit()
            finally:
                db.close()
            atlas.AtlasStore(database).close()
            db = sqlite3.connect(database)
            try:
                columns = {
                    row[1] for row in db.execute("PRAGMA table_info(research_view_runs)")
                }
                tables = {
                    row[0]
                    for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
                }
                self.assertEqual(
                    db.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchone()[0],
                    str(atlas.SCHEMA_VERSION),
                )
                # Fully materialize all cursors before Windows removes the
                # temporary database at context exit.
                list(db.execute("PRAGMA wal_checkpoint(TRUNCATE)"))
            finally:
                db.close()
            self.assertTrue(
                {"run_sequence", "previous_run_id", "delta_json", "delta_sha256"}.issubset(
                    columns
                )
            )
            self.assertIn("operation_idempotency", tables)

    def test_v10_phase7_bundle_gains_sequence_and_is_resigned(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "atlas-v10-bundle.db"
            source = atlas.AtlasStore(database)
            view = source.create_research_view(
                {"name": "v10 bundle", "viewKind": "focus", "definition": {}}
            )
            run = source.apply_research_view(view["id"])["run"]
            bundle = source.create_provenance_bundle({"viewRunId": run["id"]})
            source.close()

            with sqlite3.connect(database) as db:
                legacy_bundle = json.loads(
                    db.execute(
                        "SELECT bundle_json FROM provenance_bundles WHERE id=?",
                        (bundle["id"],),
                    ).fetchone()[0]
                )
                self.assertIn("delta", legacy_bundle["run"])
                legacy_bundle["run"].pop("run_sequence")
                canonical_bundle = json.dumps(
                    legacy_bundle,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                import hashlib

                legacy_sha = hashlib.sha256(canonical_bundle.encode("utf-8")).hexdigest()
                manifest = json.loads(
                    db.execute(
                        "SELECT manifest_json FROM provenance_bundles WHERE id=?",
                        (bundle["id"],),
                    ).fetchone()[0]
                )
                manifest["bundle_sha256"] = legacy_sha
                manifest["content_bytes"] = len(canonical_bundle.encode("utf-8"))
                db.execute(
                    """
                    UPDATE provenance_bundles
                    SET bundle_json=?, manifest_json=?, bundle_sha256=?
                    WHERE id=?
                    """,
                    (
                        canonical_bundle,
                        json.dumps(
                            manifest,
                            ensure_ascii=False,
                            sort_keys=True,
                            separators=(",", ":"),
                        ),
                        legacy_sha,
                        bundle["id"],
                    ),
                )
                self._replace_with_v10_run_table(db)
                db.execute("DELETE FROM schema_migrations WHERE version > 10")
                db.execute("UPDATE app_metadata SET value='10' WHERE key='schema_version'")

            migrated = atlas.AtlasStore(database)
            try:
                migrated_run = migrated.get_research_view_run(run["id"])
                migrated_bundle = migrated.get_provenance_bundle(bundle["id"])
                self.assertEqual(migrated_run["run_sequence"], 1)
                self.assertEqual(migrated_bundle["bundle"]["run"]["run_sequence"], 1)
                self.assertNotEqual(migrated_bundle["bundle_sha256"], legacy_sha)
                self.assertTrue(migrated.verify_provenance_bundle(migrated_bundle)["valid"])
                with migrated.connect() as db:
                    self.assertEqual(
                        db.execute(
                            "SELECT COUNT(*) FROM schema_migrations WHERE version=11"
                        ).fetchone()[0],
                        1,
                    )
                db.close()
            finally:
                migrated.close()

    def test_v9_historical_runs_backfill_and_round_trip_with_legacy_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "atlas-v9.db"
            source = atlas.AtlasStore(database)
            source.upsert_paper(
                {
                    "paperfieldId": "arxiv:phase7-migrate-a",
                    "title": "Historical robot policy A",
                    "abstract": "embodied",
                }
            )
            view = source.create_research_view(
                {
                    "name": "Historical migration",
                    "viewKind": "search",
                    "definition": {
                        "query": "historical robot policy",
                        "kinds": ["paper"],
                        "limit": 10,
                    },
                }
            )
            baseline = source.apply_research_view(view["id"])["run"]
            second_paper = source.upsert_paper(
                {
                    "paperfieldId": "arxiv:phase7-migrate-b",
                    "title": "Historical robot policy B",
                    "abstract": "embodied",
                }
            )
            current = source.apply_research_view(view["id"])["run"]
            with source.connect() as db:
                db.execute(
                    "UPDATE research_view_runs SET run_at=? WHERE id=?",
                    ("2026-08-11T00:00:01+00:00", baseline["id"]),
                )
                db.execute(
                    "UPDATE research_view_runs SET run_at=? WHERE id=?",
                    ("2026-08-11T00:00:02+00:00", current["id"]),
                )
            db.close()
            bundle = source.create_provenance_bundle({"viewRunId": current["id"]})
            source.close()

            with sqlite3.connect(database) as db:
                legacy_bundle = json.loads(
                    db.execute(
                        "SELECT bundle_json FROM provenance_bundles WHERE id=?",
                        (bundle["id"],),
                    ).fetchone()[0]
                )
                for key in ("previous_run_id", "delta", "delta_sha256"):
                    legacy_bundle["run"].pop(key, None)
                canonical_bundle = json.dumps(
                    legacy_bundle,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                import hashlib

                legacy_sha = hashlib.sha256(canonical_bundle.encode("utf-8")).hexdigest()
                manifest = json.loads(
                    db.execute(
                        "SELECT manifest_json FROM provenance_bundles WHERE id=?",
                        (bundle["id"],),
                    ).fetchone()[0]
                )
                manifest["bundle_sha256"] = legacy_sha
                manifest["content_bytes"] = len(canonical_bundle.encode("utf-8"))
                db.execute(
                    """
                    UPDATE provenance_bundles
                    SET bundle_json=?, manifest_json=?, bundle_sha256=?
                    WHERE id=?
                    """,
                    (
                        canonical_bundle,
                        json.dumps(
                            manifest,
                            ensure_ascii=False,
                            sort_keys=True,
                            separators=(",", ":"),
                        ),
                        legacy_sha,
                        bundle["id"],
                    ),
                )
                self._replace_with_v9_run_table(db)
                db.execute("DROP TABLE operation_idempotency")
                db.execute("DELETE FROM schema_migrations WHERE version > 9")
                db.execute("UPDATE app_metadata SET value='9' WHERE key='schema_version'")
            db.close()

            migrated = atlas.AtlasStore(database)
            try:
                migrated_baseline = migrated.get_research_view_run(baseline["id"])
                migrated_current = migrated.get_research_view_run(current["id"])
                self.assertEqual(migrated_baseline["previous_run_id"], "")
                self.assertTrue(migrated_baseline["delta"]["baseline"])
                self.assertEqual(migrated_current["previous_run_id"], baseline["id"])
                self.assertEqual(migrated_current["delta"]["added_count"], 1)
                self.assertEqual(
                    migrated_current["delta"]["added"][0]["ref"],
                    second_paper["canonical_ref"],
                )
                exported = migrated.export_research_data()
                self.assertEqual(
                    exported["provenance_bundles"][0]["bundle_sha256"], legacy_sha
                )
            finally:
                migrated.close()

            restored = atlas.AtlasStore(Path(directory) / "restored.db")
            try:
                preview = restored.import_research_data({**exported, "dryRun": True}, "restored")
                self.assertEqual(preview["created"]["research_view_runs"], 2)
                imported = restored.import_research_data(
                    {**exported, "dryRun": False}, "restored"
                )
                self.assertEqual(imported["created"]["research_view_runs"], 2)
                restored_current = restored.get_research_view_run(current["id"], "restored")
                self.assertEqual(restored_current["previous_run_id"], baseline["id"])
                restored_bundle = restored.get_provenance_bundle(bundle["id"], "restored")
                self.assertEqual(restored_bundle["bundle_sha256"], legacy_sha)
                self.assertTrue(restored.verify_provenance_bundle(restored_bundle)["valid"])
            finally:
                restored.close()

    def test_reopen_repairs_early_v10_empty_run_deltas_idempotently(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "atlas-v10.db"
            store = atlas.AtlasStore(database)
            view = store.create_research_view(
                {"name": "Early v10", "viewKind": "focus", "definition": {}}
            )
            first = store.apply_research_view(view["id"])["run"]
            second = store.apply_research_view(view["id"])["run"]
            with store.connect() as db:
                db.execute(
                    "UPDATE research_view_runs SET run_at=? WHERE id=?",
                    ("2026-08-12T00:00:01+00:00", first["id"]),
                )
                db.execute(
                    "UPDATE research_view_runs SET run_at=? WHERE id=?",
                    ("2026-08-12T00:00:02+00:00", second["id"]),
                )
                db.execute(
                    "UPDATE research_view_runs "
                    "SET previous_run_id='', delta_json='{}', delta_sha256=''"
                )
            db.close()
            store.close()

            atlas.AtlasStore(database).close()
            with sqlite3.connect(database) as db:
                first_state = db.execute(
                    """
                    SELECT id, previous_run_id, delta_json, delta_sha256
                    FROM research_view_runs ORDER BY run_at, id
                    """
                ).fetchall()
            db.close()
            self.assertEqual(first_state[0][1], "")
            self.assertEqual(first_state[1][1], first_state[0][0])
            self.assertTrue(first_state[0][3])
            self.assertTrue(first_state[1][3])

            atlas.AtlasStore(database).close()
            with sqlite3.connect(database) as db:
                second_state = db.execute(
                    """
                    SELECT id, previous_run_id, delta_json, delta_sha256
                    FROM research_view_runs ORDER BY run_at, id
                    """
                ).fetchall()
            db.close()
            self.assertEqual(second_state, first_state)

    def test_v9_delta_backfill_failure_rolls_back_schema_migration(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "atlas-invalid-v9.db"
            store = atlas.AtlasStore(database)
            view = store.create_research_view(
                {"name": "Invalid history", "viewKind": "focus", "definition": {}}
            )
            store.apply_research_view(view["id"])
            store.close()
            with sqlite3.connect(database) as db:
                self._replace_with_v9_run_table(db)
                db.execute(
                    "UPDATE research_view_runs SET result_sha256=?",
                    ("0" * 64,),
                )
                db.execute("DROP TABLE operation_idempotency")
                db.execute("DELETE FROM schema_migrations WHERE version > 9")
                db.execute("UPDATE app_metadata SET value='9' WHERE key='schema_version'")
            db.close()

            with self.assertRaisesRegex(atlas.AtlasError, "result SHA-256 is invalid"):
                atlas.AtlasStore(database)

            db = sqlite3.connect(database)
            try:
                version = db.execute(
                    "SELECT value FROM app_metadata WHERE key='schema_version'"
                ).fetchone()[0]
                ledger_count = db.execute(
                    "SELECT COUNT(*) FROM schema_migrations WHERE version IN (10, 11)"
                ).fetchone()[0]
                columns = {
                    row[1] for row in db.execute("PRAGMA table_info(research_view_runs)")
                }
                operation_table = db.execute(
                    "SELECT 1 FROM sqlite_master "
                    "WHERE type='table' AND name='operation_idempotency'"
                ).fetchone()
                list(db.execute("PRAGMA wal_checkpoint(TRUNCATE)"))
            finally:
                db.close()
            self.assertEqual(version, "9")
            self.assertEqual(ledger_count, 0)
            self.assertFalse(
                {"previous_run_id", "delta_json", "delta_sha256"}.intersection(columns)
            )
            self.assertIsNone(operation_table)


class Phase7HttpTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = atlas.AtlasStore(Path(self.directory.name) / "atlas.db")
        self.server = atlas.create_server(
            "127.0.0.1",
            0,
            self.store,
            "http://127.0.0.1:8765/",
            "http://127.0.0.1:4178/",
        )
        import threading

        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.directory.cleanup()

    def request(self, path, payload):
        request = urllib.request.Request(
            self.base + path,
            data=json.dumps(payload).encode(),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode())

    def test_http_retry_switches_created_to_ok_and_returns_same_ids(self):
        status, view = self.request(
            "/api/private/views",
            {"name": "HTTP retry", "viewKind": "focus", "definition": {}},
        )
        self.assertEqual(status, 201)
        payload = {"idempotencyKey": "phase7-http-run"}
        status, first = self.request(f"/api/private/views/{view['id']}/run", payload)
        self.assertEqual(status, 201)
        status, repeated = self.request(f"/api/private/views/{view['id']}/run", payload)
        self.assertEqual(status, 200)
        self.assertEqual(first["run"]["id"], repeated["run"]["id"])

        bundle_payload = {
            "viewRunId": first["run"]["id"],
            "idempotencyKey": "phase7-http-bundle",
        }
        status, bundle = self.request("/api/private/provenance-bundles", bundle_payload)
        self.assertEqual(status, 201)
        status, repeated_bundle = self.request(
            "/api/private/provenance-bundles", bundle_payload
        )
        self.assertEqual(status, 200)
        self.assertEqual(bundle["id"], repeated_bundle["id"])

        status, separate_namespace = self.request(
            f"/api/private/views/{view['id']}/run",
            {"idempotencyKey": "phase7-http-bundle"},
        )
        # Operation kinds have separate namespaces, so the same literal key is
        # valid for a view run and a bundle export.
        self.assertEqual(status, 201)
        self.assertFalse(separate_namespace["idempotent_replay"])


if __name__ == "__main__":
    unittest.main()
