import hashlib
import json
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from unittest import mock

from src.research_atlas import app as atlas


EDITOR = {
    "editorName": "phase8-reviewer",
    "reason": "Review exact paper evidence for the Phase 8 claim lineage.",
}


def stage_content(index: int) -> dict:
    return {
        "summary": f"Source-bounded summary {index}.",
        "sections": [
            {
                "title": f"Claim {index}",
                "body": f"Action-conditioned model claim {index}.",
                "sourceKind": "paper_claim",
                "confidence": "high",
                "evidence": [
                    {
                        "page": index + 2,
                        "section": "3. Method",
                        "figure": f"Figure {index}",
                        "quote": f"Action-conditioned model claim {index}.",
                        "direction": "supports",
                    }
                ],
            }
        ],
    }


class Phase8Fixture:
    store: atlas.AtlasStore

    def create_claim(self, index: int, owner_id: str = "local") -> dict:
        source_hash = str(index) * 64
        task, reused = self.store.create_analysis_request(
            {
                "paper": {
                    "paperfieldId": f"arxiv:2608.1000{index}",
                    "title": f"Phase 8 paper {index}",
                    "published": f"2026-08-{10 + index:02d}",
                    "sourceUrl": f"https://arxiv.org/abs/2608.1000{index}",
                    "pdfUrl": f"https://arxiv.org/pdf/2608.1000{index}",
                },
                "sections": ["method"],
                "sourceSha256": source_hash,
            }
        )
        self.assertFalse(reused)
        self.store.update_analysis_stage(
            task["id"],
            "method",
            "complete",
            {
                "sourceBasis": "fulltext",
                "sourceSha256": source_hash,
                "model": "phase8-test-model",
                "promptVersion": "phase8-test-v1",
                "content": stage_content(index),
            },
        )
        if owner_id != "local":
            with self.store.connect() as db:
                db.execute(
                    "UPDATE analysis_requests SET owner_id=? WHERE id=?",
                    (owner_id, task["id"]),
                )
                db.execute(
                    "UPDATE paper_analyses SET owner_id=? WHERE analysis_request_id=?",
                    (owner_id, task["id"]),
                )
        imported = self.store.import_dossier_claims(
            {
                **EDITOR,
                "analysisRequestId": task["id"],
                "idempotencyKey": f"phase8-import-{index}",
            },
            owner_id,
        )
        self.assertEqual(imported["created"], 1)
        return imported["claims"][0]

    def create_reviewed_lineage(self) -> dict:
        claims = [self.create_claim(1), self.create_claim(2)]
        candidate = self.store.create_claim_candidate(
            {
                **EDITOR,
                "leftClaimId": claims[0]["id"],
                "rightClaimId": claims[1]["id"],
                "proposedRelation": "extends",
                "retrievalScore": 0.87,
                "modelScore": 0.76,
                "model": "candidate-test-model",
                "promptVersion": "candidate-test-v1",
                "idempotencyKey": "phase8-candidate",
            }
        )
        candidate = self.store.review_claim_candidate(
            candidate["id"],
            {**EDITOR, "decision": "approved", "relationType": "extends"},
        )
        cluster = self.store.create_claim_cluster(
            {
                **EDITOR,
                "label": "Action-conditioned world models",
                "description": "A human-reviewed claim cluster.",
                "idempotencyKey": "phase8-cluster",
            }
        )
        memberships = []
        for index, claim in enumerate(claims):
            membership = self.store.create_claim_membership(
                cluster["id"],
                {
                    **EDITOR,
                    "claimId": claim["id"],
                    "candidateId": candidate["id"],
                    "relationType": "extends",
                    "idempotencyKey": f"phase8-membership-{index}",
                },
            )
            memberships.append(
                self.store.review_claim_membership(
                    membership["id"], {**EDITOR, "decision": "approved"}
                )
            )
        thread = self.store.create_research_thread(
            {
                **EDITOR,
                "slug": "action-conditioned-world-models",
                "idempotencyKey": "phase8-thread",
            }
        )
        revision_payload = {
            **EDITOR,
            "title": "Action-conditioned world models",
            "problemStatement": "How learned dynamics become useful for embodied action.",
            "changeSummary": "Two reviewed, source-bounded claims are now related.",
            "whyItMatters": "The thread distinguishes evidence from similarity hints.",
            "competingRoutes": ["latent prediction", "pixel prediction"],
            "counterEvidence": ["No cross-embodiment conclusion is claimed."],
            "knownUnknowns": ["Transfer beyond the reported robots remains unknown."],
            "representativePapers": [
                claim["paper"]["canonical_ref"] for claim in claims
            ],
            "claims": [
                {
                    "claimId": claims[0]["id"],
                    "clusterId": cluster["id"],
                    "membershipId": memberships[0]["id"],
                    "role": "foundation",
                },
                {
                    "claimId": claims[1]["id"],
                    "clusterId": cluster["id"],
                    "membershipId": memberships[1]["id"],
                    "role": "latest_progress",
                },
            ],
            "relations": [{"candidateId": candidate["id"]}],
            "idempotencyKey": "phase8-revision-1",
        }
        revision = self.store.create_thread_revision(thread["id"], revision_payload)
        return {
            "claims": claims,
            "candidate": candidate,
            "cluster": cluster,
            "memberships": memberships,
            "thread": thread,
            "revision": revision,
            "revision_payload": revision_payload,
        }


class Phase8StoreTests(Phase8Fixture, unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "atlas.db"
        self.store = atlas.AtlasStore(self.database)

    def tearDown(self):
        self.store.close()
        self.directory.cleanup()

    def test_fresh_schema_and_development_shape_repair(self):
        with sqlite3.connect(self.database) as db:
            version = db.execute(
                "SELECT value FROM app_metadata WHERE key='schema_version'"
            ).fetchone()[0]
            tables = {
                row[0]
                for row in db.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            columns = {
                row[1] for row in db.execute("PRAGMA table_info(claim_candidates)")
            }
            claim_columns = {
                row[1] for row in db.execute("PRAGMA table_info(scientific_claims)")
            }
        self.assertEqual(version, str(atlas.SCHEMA_VERSION))
        self.assertIn("claim_import_runs", tables)
        self.assertIn("reviewed_relation", columns)
        self.assertIn("owner_id", claim_columns)

    def test_claims_and_candidates_are_strictly_owner_scoped(self):
        local_claim = self.create_claim(1)
        other_claim = self.create_claim(2, "other-researcher")
        self.assertEqual(
            [item["id"] for item in self.store.list_scientific_claims()],
            [local_claim["id"]],
        )
        self.assertEqual(
            [
                item["id"]
                for item in self.store.list_scientific_claims(
                    owner_id="other-researcher"
                )
            ],
            [other_claim["id"]],
        )
        with self.assertRaises(atlas.NotFoundError):
            self.store.create_claim_candidate(
                {
                    **EDITOR,
                    "leftClaimId": local_claim["id"],
                    "rightClaimId": other_claim["id"],
                    "proposedRelation": "extends",
                }
            )
        with sqlite3.connect(self.database) as db:
            db.execute("PRAGMA foreign_keys=ON")
            with self.assertRaisesRegex(sqlite3.IntegrityError, "owner mismatch"):
                db.execute(
                    """
                    INSERT INTO claim_candidates(
                        id, owner_id, left_claim_id, right_claim_id,
                        proposed_relation, request_sha256, created_at, updated_at
                    ) VALUES ('cross-owner', 'local', ?, ?, 'extends', ?, ?, ?)
                    """,
                    (
                        local_claim["id"],
                        other_claim["id"],
                        "a" * 64,
                        atlas.utc_now(),
                        atlas.utc_now(),
                    ),
                )

    def test_same_claim_content_can_be_imported_by_two_owners(self):
        local_claim = self.create_claim(1)
        with self.store.connect() as db:
            db.execute(
                "UPDATE analysis_requests SET owner_id='other-researcher' WHERE id=?",
                (local_claim["analysis_request_id"],),
            )
            db.execute(
                "UPDATE paper_analyses SET owner_id='other-researcher' "
                "WHERE analysis_request_id=?",
                (local_claim["analysis_request_id"],),
            )
        imported = self.store.import_dossier_claims(
            {
                **EDITOR,
                "analysisRequestId": local_claim["analysis_request_id"],
                "idempotencyKey": "phase8-other-owner-same-claim",
            },
            "other-researcher",
        )
        other_claim = imported["claims"][0]
        self.assertEqual(imported["created"], 1)
        self.assertNotEqual(local_claim["id"], other_claim["id"])
        self.assertEqual(local_claim["claim_sha256"], other_claim["claim_sha256"])

    def test_v14_migration_invalidates_legacy_caller_supplied_eval_scores(self):
        lineage = self.create_reviewed_lineage()
        golden = self.store.create_claim_golden_item(
            {
                **EDITOR,
                "domain": "embodied",
                "leftClaimId": lineage["claims"][0]["id"],
                "rightClaimId": lineage["claims"][1]["id"],
                "expectedCluster": True,
                "expectedRelation": "extends",
                "expectedLocators": ["page"],
            }
        )
        with self.store.connect() as db:
            db.execute("DELETE FROM schema_migrations WHERE version>=14")
            db.execute("UPDATE app_metadata SET value='13' WHERE key='schema_version'")
            db.execute(
                """
                INSERT INTO claim_eval_runs(
                    id, owner_id, input_sha256, item_count, metrics_json, created_at
                ) VALUES ('legacy-eval', 'local', ?, 1, ?, ?)
                """,
                (
                    "a" * 64,
                    json.dumps(
                        {"locator_completeness": 1.0, "reviewer_agreement": 1.0}
                    ),
                    atlas.utc_now(),
                ),
            )
            db.execute(
                """
                INSERT INTO claim_eval_results(
                    run_id, golden_item_id, locator_complete, reviewer_agreement
                ) VALUES ('legacy-eval', ?, 1, 1.0)
                """,
                (golden["id"],),
            )
        self.store.close()
        self.store = atlas.AtlasStore(self.database)
        migrated = self.store.get_claim_evaluation("legacy-eval")
        self.assertIsNone(migrated["metrics"]["locator_completeness"])
        self.assertIsNone(migrated["metrics"]["reviewer_agreement"])
        self.assertFalse(migrated["results"][0]["locator_complete"])
        self.assertIsNone(migrated["results"][0]["reviewer_agreement"])
        self.assertEqual(migrated["results"][0]["predicted_locators"], [])

    def test_v14_migration_rejects_corrupt_published_thread_and_rolls_back(self):
        lineage = self.create_reviewed_lineage()
        with self.store.connect() as db:
            for trigger in (
                "thread_revision_status_transition_guard",
                "thread_revision_public_metadata_guard",
                "thread_revision_date_format_guard",
                "thread_revision_date_format_guard_update",
            ):
                db.execute(f"DROP TRIGGER IF EXISTS {trigger}")
            db.execute("DELETE FROM schema_migrations WHERE version>=15")
            db.execute("UPDATE app_metadata SET value='14' WHERE key='schema_version'")
            db.execute(
                "UPDATE research_thread_revisions SET status='published', reviewer='legacy', "
                "review_reason='legacy publish', published_at='not-a-date' "
                "WHERE thread_id=? AND revision=1",
                (lineage["thread"]["id"],),
            )
            db.execute(
                "UPDATE research_threads SET current_published_revision=1 WHERE id=?",
                (lineage["thread"]["id"],),
            )
        self.store.close()
        with self.assertRaisesRegex(atlas.AtlasError, "published_at"):
            atlas.AtlasStore(self.database)
        with sqlite3.connect(self.database) as db:
            self.assertEqual(
                db.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchone()[0],
                "14",
            )
            self.assertIsNone(
                db.execute("SELECT version FROM schema_migrations WHERE version=15").fetchone()
            )

    def test_reopen_rejects_invalid_json_and_public_projection_never_decodes_it(self):
        lineage = self.create_reviewed_lineage()
        with self.store.connect() as db:
            db.execute("DROP TRIGGER thread_revision_public_json_guard_update")
            db.execute(
                "UPDATE research_thread_revisions SET delta_json='not-json' WHERE thread_id=? AND revision=1",
                (lineage["thread"]["id"],),
            )
        self.store.close()
        with self.assertRaisesRegex(atlas.AtlasError, "delta JSON"):
            atlas.AtlasStore(self.database)
        self.store = object.__new__(atlas.AtlasStore)
        self.store.path = self.database
        self.store._lock = threading.RLock()
        with self.assertRaisesRegex(atlas.AtlasError, "delta JSON"):
            with self.store.connect() as db:
                thread = db.execute("SELECT * FROM research_threads WHERE id=?", (lineage["thread"]["id"],)).fetchone()
                row = db.execute(
                    "SELECT * FROM research_thread_revisions WHERE thread_id=? AND revision=1",
                    (lineage["thread"]["id"],),
                ).fetchone()
                self.store._thread_revision_from_row(db, thread, row, public=True)

    def test_revision_date_trigger_rejects_invalid_direct_sql(self):
        lineage = self.create_reviewed_lineage()
        with self.store.connect() as db:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "valid ISO timestamps"):
                db.execute(
                    "UPDATE research_thread_revisions SET created_at='not-a-date' WHERE thread_id=? AND revision=1",
                    (lineage["thread"]["id"],),
                )

    def test_direct_sql_cannot_break_reviewed_lineage_composition(self):
        lineage = self.create_reviewed_lineage()
        unrelated = self.create_claim(3)
        with sqlite3.connect(self.database) as db:
            db.execute("PRAGMA foreign_keys=ON")
            with self.assertRaisesRegex(
                sqlite3.IntegrityError, "membership integrity"
            ):
                db.execute(
                    """
                    INSERT INTO claim_cluster_memberships(
                        id, cluster_id, claim_id, candidate_id, relation_type,
                        status, created_at, updated_at
                    ) VALUES ('bad-membership', ?, ?, ?, 'extends', 'pending', ?, ?)
                    """,
                    (
                        lineage["cluster"]["id"],
                        unrelated["id"],
                        lineage["candidate"]["id"],
                        atlas.utc_now(),
                        atlas.utc_now(),
                    ),
                )
            with self.assertRaisesRegex(
                sqlite3.IntegrityError, "current revision must be published"
            ):
                db.execute(
                    "UPDATE research_threads SET current_published_revision=99 WHERE id=?",
                    (lineage["thread"]["id"],),
                )

    def test_direct_sql_cannot_publish_or_delete_public_thread_revisions(self):
        lineage = self.create_reviewed_lineage()
        with self.store.connect() as db:
            with self.assertRaisesRegex(
                sqlite3.IntegrityError, "controlled transition"
            ):
                db.execute(
                    """
                    UPDATE research_thread_revisions
                    SET status='published', reviewer='sql-reviewer',
                        review_reason='bypass application review', published_at=?
                    WHERE thread_id=? AND revision=1
                    """,
                    (atlas.utc_now(), lineage["thread"]["id"]),
                )
        self.store.transition_thread_revision(
            lineage["thread"]["id"], 1, "publish", EDITOR
        )
        with self.store.connect() as db:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable"):
                db.execute(
                    "DELETE FROM research_thread_revisions WHERE thread_id=? AND revision=1",
                    (lineage["thread"]["id"],),
                )
        self.store.transition_thread_revision(
            lineage["thread"]["id"], 1, "retract", EDITOR
        )
        with self.store.connect() as db:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable"):
                db.execute(
                    "DELETE FROM research_thread_revisions WHERE thread_id=? AND revision=1",
                    (lineage["thread"]["id"],),
                )

    def test_thread_public_arrays_reject_nested_and_oversized_json(self):
        lineage = self.create_reviewed_lineage()
        nested = dict(lineage["revision_payload"])
        nested["idempotencyKey"] = "phase8-nested-public-array"
        nested["knownUnknowns"] = [{"unsafe": "nested"}]
        with self.assertRaisesRegex(atlas.AtlasError, "entries must be strings"):
            self.store.create_thread_revision(lineage["thread"]["id"], nested)
        with self.store.connect() as db:
            for raw in (
                json.dumps([{"unsafe": "nested"}]),
                json.dumps(["x" * 2001]),
                json.dumps([str(index) for index in range(31)]),
            ):
                with self.subTest(raw_length=len(raw)), self.assertRaisesRegex(
                    sqlite3.IntegrityError, "public arrays"
                ):
                    db.execute(
                        """
                        UPDATE research_thread_revisions
                        SET competing_routes_json=?
                        WHERE thread_id=? AND revision=1
                        """,
                        (raw, lineage["thread"]["id"]),
                    )

    def test_rollback_audit_failure_leaves_no_partial_revision(self):
        lineage = self.create_reviewed_lineage()
        self.store.transition_thread_revision(
            lineage["thread"]["id"], 1, "publish", EDITOR
        )
        with self.store.connect() as db:
            before = db.execute(
                "SELECT COUNT(*) FROM research_thread_revisions WHERE thread_id=?",
                (lineage["thread"]["id"],),
            ).fetchone()[0]
        with mock.patch.object(
            self.store,
            "_record_editor_audit",
            side_effect=atlas.AtlasError("injected audit failure"),
        ):
            with self.assertRaisesRegex(atlas.AtlasError, "injected audit failure"):
                self.store.rollback_thread_revision(
                    lineage["thread"]["id"],
                    1,
                    {**EDITOR, "idempotencyKey": "phase8-failed-rollback"},
                )
        with self.store.connect() as db:
            after = db.execute(
                "SELECT COUNT(*) FROM research_thread_revisions WHERE thread_id=?",
                (lineage["thread"]["id"],),
            ).fetchone()[0]
            idempotency = db.execute(
                """
                SELECT COUNT(*) FROM operation_idempotency
                WHERE operation_kind='thread_revision'
                  AND idempotency_key='phase8-failed-rollback'
                """
            ).fetchone()[0]
        self.assertEqual(after, before)
        self.assertEqual(idempotency, 0)

    def test_golden_items_and_evaluations_reject_cross_owner_links(self):
        local = self.create_reviewed_lineage()
        other_claims = [
            self.create_claim(3, "other-researcher"),
            self.create_claim(4, "other-researcher"),
        ]
        with self.assertRaises(atlas.NotFoundError):
            self.store.create_claim_golden_item(
                {
                    **EDITOR,
                    "domain": "embodied",
                    "leftClaimId": local["claims"][0]["id"],
                    "rightClaimId": local["claims"][1]["id"],
                    "expectedCluster": True,
                    "expectedRelation": "extends",
                    "expectedLocators": ["page"],
                },
                "other-researcher",
            )
        local_golden = self.store.create_claim_golden_item(
            {
                **EDITOR,
                "domain": "embodied",
                "leftClaimId": local["claims"][0]["id"],
                "rightClaimId": local["claims"][1]["id"],
                "expectedCluster": True,
                "expectedRelation": "extends",
                "expectedLocators": ["page"],
            }
        )
        other_golden = self.store.create_claim_golden_item(
            {
                **EDITOR,
                "domain": "embodied",
                "leftClaimId": other_claims[0]["id"],
                "rightClaimId": other_claims[1]["id"],
                "expectedCluster": True,
                "expectedRelation": "extends",
                "expectedLocators": ["page"],
            },
            "other-researcher",
        )
        with self.assertRaises(atlas.NotFoundError):
            self.store.create_claim_evaluation(
                {
                    **EDITOR,
                    "results": [
                        {
                            "goldenItemId": local_golden["id"],
                            "predictedCluster": True,
                            "predictedRelation": "extends",
                            "predictedLocators": ["page"],
                        }
                    ],
                },
                "other-researcher",
            )
        evaluation = self.store.create_claim_evaluation(
            {
                **EDITOR,
                "results": [
                    {
                        "goldenItemId": local_golden["id"],
                        "predictedCluster": True,
                        "predictedRelation": "extends",
                        "predictedLocators": ["page"],
                    }
                ],
            }
        )
        with self.store.connect() as db:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "owner mismatch"):
                db.execute(
                    """
                    UPDATE claim_eval_results SET golden_item_id=?
                    WHERE run_id=? AND golden_item_id=?
                    """,
                    (other_golden["id"], evaluation["id"], local_golden["id"]),
                )

    def test_claim_import_is_idempotent_and_rejects_changed_request(self):
        claim = self.create_claim(1)
        task_id = claim["analysis_request_id"]
        repeated = self.store.import_dossier_claims(
            {
                **EDITOR,
                "analysisRequestId": task_id,
                "idempotencyKey": "phase8-import-1",
            }
        )
        self.assertTrue(repeated["idempotent_replay"])
        self.assertEqual(repeated["claims"][0]["id"], claim["id"])
        other = self.create_claim(2)
        with self.assertRaises(atlas.ConflictError):
            self.store.import_dossier_claims(
                {
                    **EDITOR,
                    "analysisRequestId": other["analysis_request_id"],
                    "idempotencyKey": "phase8-import-1",
                }
            )

    def test_import_rejects_unhashed_stage_and_rolls_back_all_claims(self):
        first = self.create_claim(1)
        with self.store.connect() as db:
            task = db.execute(
                "SELECT * FROM analysis_requests WHERE id=?",
                (first["analysis_request_id"],),
            ).fetchone()
            analysis = db.execute(
                "SELECT * FROM paper_analyses WHERE analysis_request_id=?",
                (first["analysis_request_id"],),
            ).fetchone()
            content = json.loads(analysis["content_json"])
            content["critique"] = {
                "source_basis": "fulltext",
                "source_sha256": "",
                "attempt": 1,
                "sections": [
                    {
                        "claim_id": "claim-invalid-late-stage",
                        "title": "Invalid",
                        "body": "This late-stage claim has no source hash.",
                        "source_kind": "paper_claim",
                        "evidence": [{"page": 9, "quote": "Invalid."}],
                    }
                ],
            }
            db.execute(
                "UPDATE paper_analyses SET content_json=?, updated_at=? WHERE id=?",
                (json.dumps(content), atlas.utc_now(), analysis["id"]),
            )
        before = len(self.store.list_scientific_claims())
        with self.assertRaisesRegex(atlas.AtlasError, "source SHA-256"):
            self.store.import_dossier_claims(
                {
                    **EDITOR,
                    "analysisRequestId": task["id"],
                    "idempotencyKey": "invalid-late-stage-import",
                }
            )
        self.assertEqual(len(self.store.list_scientific_claims()), before)

    def test_pending_and_rejected_relations_never_enter_public_projection(self):
        claims = [self.create_claim(1), self.create_claim(2)]
        pending = self.store.create_claim_candidate(
            {
                **EDITOR,
                "leftClaimId": claims[0]["id"],
                "rightClaimId": claims[1]["id"],
                "proposedRelation": "supports",
            }
        )
        rejected = self.store.create_claim_candidate(
            {
                **EDITOR,
                "leftClaimId": claims[0]["id"],
                "rightClaimId": claims[1]["id"],
                "proposedRelation": "unclear",
            }
        )
        self.store.review_claim_candidate(
            rejected["id"], {**EDITOR, "decision": "rejected"}
        )
        self.assertEqual(self.store.list_public_threads(), [])
        for claim in claims:
            with self.assertRaises(atlas.NotFoundError):
                self.store.public_scientific_claim(claim["id"])
        public = json.dumps(self.store.bootstrap(), ensure_ascii=False)
        self.assertNotIn(pending["id"], public)
        self.assertNotIn(rejected["id"], public)

    def test_publish_public_projection_provenance_and_score_isolation(self):
        lineage = self.create_reviewed_lineage()
        published = self.store.transition_thread_revision(
            lineage["thread"]["id"], 1, "publish", EDITOR
        )
        self.assertEqual(published["status"], "published")
        public = self.store.public_research_thread(lineage["thread"]["slug"])
        serialized = json.dumps(public, ensure_ascii=False)
        self.assertEqual(len(public["claims"]), 2)
        self.assertEqual(len(public["relations"]), 1)
        self.assertNotIn("retrieval_score", serialized)
        self.assertNotIn("model_score", serialized)
        self.assertNotIn("review_reason", serialized)
        locator = public["claims"][0]["claim"]["evidence"][0]["source_locator"]
        self.assertRegex(locator["content_sha256"], r"^[a-f0-9]{64}$")
        self.assertGreater(locator["page"], 0)
        self.assertTrue(public["claims"][0]["claim"]["paper"]["paperfield_path"])
        evidence_path = public["claims"][0]["claim"]["evidence"][0]["paperfield_path"]
        evidence_query = urllib.parse.parse_qs(
            urllib.parse.urlparse(evidence_path).query
        )
        self.assertEqual(evidence_query["page"], [str(locator["page"])])
        self.assertEqual(evidence_query["section"], [locator["section"]])
        self.assertEqual(evidence_query["figure"], [locator["figure"]])
        self.assertEqual(evidence_query["quote"], [locator["quote"]])

    def test_published_revision_and_children_are_immutable_but_retract_is_legal(self):
        lineage = self.create_reviewed_lineage()
        self.store.transition_thread_revision(lineage["thread"]["id"], 1, "publish", EDITOR)
        with sqlite3.connect(self.database) as db:
            db.execute("PRAGMA foreign_keys=ON")
            with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable"):
                db.execute(
                    "UPDATE research_thread_revisions SET title='mutated' WHERE thread_id=? AND revision=1",
                    (lineage["thread"]["id"],),
                )
            with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable"):
                db.execute(
                    "DELETE FROM research_thread_claims WHERE thread_id=? AND revision=1",
                    (lineage["thread"]["id"],),
                )
            with self.assertRaisesRegex(sqlite3.IntegrityError, "immutable"):
                db.execute(
                    "DELETE FROM scientific_claims WHERE id=?",
                    (lineage["claims"][0]["id"],),
                )
        retracted = self.store.transition_thread_revision(
            lineage["thread"]["id"], 1, "retract", EDITOR
        )
        self.assertEqual(retracted["status"], "retracted")
        self.assertEqual(self.store.list_public_threads(), [])

    def test_rollback_creates_new_draft_and_preserves_old_content_hash(self):
        lineage = self.create_reviewed_lineage()
        first = self.store.transition_thread_revision(
            lineage["thread"]["id"], 1, "publish", EDITOR
        )
        rolled = self.store.rollback_thread_revision(
            lineage["thread"]["id"],
            1,
            {**EDITOR, "idempotencyKey": "phase8-rollback"},
        )
        self.assertEqual(rolled["revision"], 2)
        self.assertEqual(rolled["status"], "draft")
        stored_first = self.store.get_research_thread(
            lineage["thread"]["id"], "local", 1
        )
        self.assertEqual(stored_first["content_sha256"], first["content_sha256"])
        self.assertEqual(stored_first["status"], "published")

    def test_flowloom_export_requires_confirmation_and_published_revision(self):
        lineage = self.create_reviewed_lineage()
        with self.assertRaisesRegex(atlas.AtlasError, "confirmation"):
            self.store.export_thread_context(
                lineage["thread"]["id"], {**EDITOR, "confirmed": False}
            )
        self.store.transition_thread_revision(lineage["thread"]["id"], 1, "publish", EDITOR)
        context = self.store.export_thread_context(
            lineage["thread"]["id"], {**EDITOR, "confirmed": True}
        )
        self.assertEqual(context["schema_version"], 1)
        self.assertEqual(context["revision"], 1)
        self.assertEqual(context["claims"][0]["claim_id"], lineage["claims"][0]["id"])
        self.assertRegex(context["content_sha256"], r"^[a-f0-9]{64}$")

    def test_golden_evaluation_metrics_recompute_and_remain_private(self):
        lineage = self.create_reviewed_lineage()
        golden = self.store.create_claim_golden_item(
            {
                **EDITOR,
                "domain": "embodied",
                "leftClaimId": lineage["claims"][0]["id"],
                "rightClaimId": lineage["claims"][1]["id"],
                "expectedCluster": True,
                "expectedRelation": "extends",
                "expectedLocators": ["page", "section"],
            }
        )
        evaluation = self.store.create_claim_evaluation(
            {
                **EDITOR,
                "model": "eval-model",
                "promptVersion": "eval-v1",
                "codeVersion": "phase8-test",
                "idempotencyKey": "phase8-eval",
                "results": [
                    {
                        "goldenItemId": golden["id"],
                        "predictedCluster": True,
                        "predictedRelation": "extends",
                        "predictedLocators": ["section", "page", "page"],
                        "abstained": False,
                    }
                ],
            }
        )
        self.assertEqual(evaluation["metrics"]["candidate_recall"], 1.0)
        self.assertEqual(evaluation["metrics"]["relation_accuracy"], 1.0)
        confusion = evaluation["metrics"]["relation_confusion_matrix"]
        self.assertEqual(confusion["counts"]["extends"]["extends"], 1)
        self.assertEqual(evaluation["metrics"]["locator_completeness"], 1.0)
        self.assertIsNone(evaluation["metrics"]["reviewer_agreement"])
        self.assertEqual(
            evaluation["results"][0]["predicted_locators"], ["section", "page"]
        )
        self.assertNotIn("claim_evaluation", json.dumps(self.store.bootstrap()))

    def test_golden_locators_are_validated_and_evaluation_rejects_self_scores(self):
        lineage = self.create_reviewed_lineage()
        with self.assertRaisesRegex(atlas.AtlasError, "invalid locator"):
            self.store.create_claim_golden_item(
                {
                    **EDITOR,
                    "domain": "embodied",
                    "leftClaimId": lineage["claims"][0]["id"],
                    "rightClaimId": lineage["claims"][1]["id"],
                    "expectedCluster": True,
                    "expectedRelation": "extends",
                    "expectedLocators": ["page", "made_up_locator"],
                }
            )
        golden = self.store.create_claim_golden_item(
            {
                **EDITOR,
                "domain": "embodied",
                "leftClaimId": lineage["claims"][0]["id"],
                "rightClaimId": lineage["claims"][1]["id"],
                "expectedCluster": True,
                "expectedRelation": "extends",
                "expectedLocators": ["page", "section"],
            }
        )
        for field, value in (("locatorComplete", True), ("reviewerAgreement", 1.0)):
            with self.subTest(field=field), self.assertRaisesRegex(
                atlas.AtlasError, "server-derived"
            ):
                self.store.create_claim_evaluation(
                    {
                        **EDITOR,
                        "results": [
                            {
                                "goldenItemId": golden["id"],
                                "predictedCluster": True,
                                "predictedRelation": "extends",
                                "predictedLocators": ["page"],
                                "abstained": False,
                                field: value,
                            }
                        ],
                    }
                )
        evaluation = self.store.create_claim_evaluation(
            {
                **EDITOR,
                "results": [
                    {
                        "goldenItemId": golden["id"],
                        "predictedCluster": True,
                        "predictedRelation": "extends",
                        "predictedLocators": ["page"],
                        "abstained": False,
                    }
                ],
            }
        )
        self.assertEqual(evaluation["metrics"]["locator_completeness"], 0.0)

    def test_future_schema_rejection_preserves_database_bytes(self):
        self.store.close()
        with sqlite3.connect(self.database) as db:
            db.execute("PRAGMA journal_mode=DELETE")
            db.execute(
                "UPDATE app_metadata SET value=? WHERE key='schema_version'", ("99",)
            )
        before = self.database.read_bytes()
        before_hash = hashlib.sha256(before).hexdigest()
        with self.assertRaisesRegex(atlas.AtlasError, "高于当前程序支持"):
            atlas.AtlasStore(self.database)
        after = self.database.read_bytes()
        self.assertEqual(hashlib.sha256(after).hexdigest(), before_hash)
        self.assertEqual(after, before)


class Phase8HttpTests(Phase8Fixture, unittest.TestCase):
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
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.directory.cleanup()

    def request(self, path: str, method: str = "GET", payload=None, origin=True):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if origin:
            headers["Origin"] = self.base
        request = urllib.request.Request(
            self.base + path, data=data, method=method, headers=headers
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))

    def test_http_public_projection_and_idempotent_status_codes(self):
        lineage = self.create_reviewed_lineage()
        self.store.transition_thread_revision(lineage["thread"]["id"], 1, "publish", EDITOR)
        status, listing = self.request("/api/threads", origin=False)
        self.assertEqual(status, 200)
        self.assertEqual(listing["total"], 1)
        status, thread = self.request(
            f"/api/threads/{lineage['thread']['slug']}", origin=False
        )
        self.assertEqual(status, 200)
        self.assertNotIn("model_score", json.dumps(thread))
        status, claim = self.request(
            f"/api/claims/{lineage['claims'][0]['id']}", origin=False
        )
        self.assertEqual(status, 200)
        self.assertEqual(claim["id"], lineage["claims"][0]["id"])

        payload = {
            **EDITOR,
            "slug": "http-idempotency-thread",
            "idempotencyKey": "http-phase8-thread",
        }
        status, first = self.request("/api/editor/threads", "POST", payload)
        self.assertEqual(status, 201)
        status, repeated = self.request("/api/editor/threads", "POST", payload)
        self.assertEqual(status, 200)
        self.assertEqual(first["id"], repeated["id"])
        changed = {**payload, "slug": "http-conflicting-thread"}
        with self.assertRaises(urllib.error.HTTPError) as conflict:
            self.request("/api/editor/threads", "POST", changed)
        self.assertEqual(conflict.exception.code, 409)

    def test_http_private_routes_reject_cross_origin(self):
        request = urllib.request.Request(
            self.base + "/api/editor/claims",
            headers={"Origin": "https://attacker.invalid"},
        )
        with self.assertRaises(urllib.error.HTTPError) as forbidden:
            urllib.request.urlopen(request, timeout=5)
        self.assertEqual(forbidden.exception.code, 403)


if __name__ == "__main__":
    unittest.main()
