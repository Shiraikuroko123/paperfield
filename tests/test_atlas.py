import json
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from src.research_atlas import app as atlas


def sample_paper(**overrides):
    payload = {
        "paperfieldId": "arxiv:2406.09246",
        "title": "OpenVLA: An Open-Source Vision-Language-Action Model",
        "abstract": "A public abstract used only as paper metadata.",
        "authors": ["Moo Jin Kim", "Karl Pertsch"],
        "venue": "CoRL",
        "published": "2024-06-13",
        "sourceUrl": "https://arxiv.org/abs/2406.09246v2",
        "pdfUrl": "https://arxiv.org/pdf/2406.09246v2",
        "topics": ["Embodied AI", "Vision-Language-Action"],
    }
    payload.update(overrides)
    return payload


def sample_stage_content(stage="method"):
    return {
        "summary": f"{stage} 阶段的可审计摘要。",
        "sections": [
            {
                "title": "作者主张",
                "body": "该条目只复述有明确原文位置的内容。",
                "sourceKind": "paper_claim",
                "confidence": "high",
                "evidence": [
                    {
                        "label": "Method section",
                        "page": 3,
                        "section": "3. Method",
                        "sourceUrl": "https://arxiv.org/pdf/2406.09246",
                        "direction": "supports",
                    }
                ],
            }
        ],
    }


class AtlasCanonicalReferenceTests(unittest.TestCase):
    def test_analysis_stage_schema_matches_runtime_enums(self):
        schema_path = atlas.PACKAGE_DIR / "schemas" / "analysis-stage-complete.schema.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        self.assertEqual(set(schema["properties"]["sourceBasis"]["enum"]), atlas.SOURCE_BASIS)
        source_kinds = schema["$defs"]["section"]["properties"]["sourceKind"]["enum"]
        self.assertEqual(set(source_kinds), atlas.CONTENT_SOURCE_KINDS)

    def test_doi_has_priority_over_other_identifiers(self):
        reference = atlas.canonical_paper_ref(
            sample_paper(doi="https://doi.org/10.1000/Test.Paper")
        )
        self.assertEqual(reference, "doi:10.1000/test.paper")

    def test_arxiv_version_is_removed_from_canonical_reference(self):
        self.assertEqual(
            atlas.canonical_paper_ref(sample_paper()),
            "arxiv:2406.09246",
        )
        self.assertEqual(atlas.source_version(sample_paper()), "v2")

    def test_openreview_and_title_fallbacks_are_stable(self):
        openreview = atlas.canonical_paper_ref(
            {
                "title": "A Test Paper",
                "published": "2026-01-01",
                "sourceUrl": "https://openreview.net/forum?id=abcDEF123",
            }
        )
        self.assertEqual(openreview, "openreview:abcDEF123")
        first = atlas.canonical_paper_ref({"title": "A Test Paper", "published": "2026"})
        second = atlas.canonical_paper_ref({"title": "A  Test Paper!", "published": "2026-08-01"})
        self.assertEqual(first, second)
        self.assertTrue(first.startswith("title:2026:"))


class AtlasStoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.database = self.root / "atlas" / "atlas.db"
        self.store = atlas.AtlasStore(self.database)

    def tearDown(self):
        self.directory.cleanup()

    def test_atlas_uses_an_independent_database(self):
        paperfield_db = self.root / "paperfield.db"
        with sqlite3.connect(paperfield_db) as connection:
            connection.execute("CREATE TABLE sentinel(value TEXT NOT NULL)")
            connection.execute("INSERT INTO sentinel(value) VALUES('paperfield-only')")

        second_store = atlas.AtlasStore(self.database)
        second_store.upsert_paper(sample_paper())

        self.assertEqual(second_store.path, self.database.resolve())
        self.assertNotEqual(second_store.path, paperfield_db.resolve())
        with sqlite3.connect(paperfield_db) as connection:
            self.assertEqual(connection.execute("SELECT value FROM sentinel").fetchone()[0], "paperfield-only")
        with sqlite3.connect(self.database) as connection:
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertIn("canonical_papers", tables)
        self.assertNotIn("papers", tables)

    def test_canonical_ref_expected_title_rejects_conflicting_identity(self):
        canonical_ref = "arxiv:2406.09246"
        created = self.store.upsert_paper(
            sample_paper(canonicalRef=canonical_ref, expectedTitle=sample_paper()["title"])
        )
        self.assertEqual(created["canonical_ref"], canonical_ref)

        with self.assertRaises(atlas.ConflictError):
            self.store.upsert_paper(
                sample_paper(
                    canonicalRef=canonical_ref,
                    title="A Different Paper",
                    expectedTitle=sample_paper()["title"],
                )
            )

        with self.assertRaises(atlas.ConflictError):
            self.store.upsert_paper(
                {
                    "canonical_ref": canonical_ref,
                    "expected_title": "A Different Existing Identity",
                }
            )

        persisted = self.store.resolve_paper(canonical_ref)
        self.assertEqual(persisted["title"], sample_paper()["title"])

    def test_analysis_requests_are_idempotent_and_persistent(self):
        request = {
            "paper": sample_paper(),
            "sections": ["method", "math", "experiments", "code", "lineage"],
            "sourceVersion": "v2",
        }
        created, reused = self.store.create_analysis_request(request)
        repeated, repeated_reused = self.store.create_analysis_request(request)

        self.assertFalse(reused)
        self.assertTrue(repeated_reused)
        self.assertEqual(created["id"], repeated["id"])
        self.assertEqual(created["status"], "queued")

        reopened = atlas.AtlasStore(self.database)
        persisted = reopened.get_analysis_request(created["id"])
        self.assertEqual(persisted["requested_sections"], request["sections"])
        self.assertEqual(persisted["paper"]["canonical_ref"], "arxiv:2406.09246")
        self.assertEqual(persisted["paper"]["abstract"], sample_paper()["abstract"])
        self.assertEqual(persisted["paper"]["pdf_url"], sample_paper()["pdfUrl"])
        self.assertFalse(persisted["material"]["download_authorized"])

    def test_material_authorization_gates_atomic_worker_claim(self):
        task, _ = self.store.create_analysis_request({"paper": sample_paper(), "sections": ["method"]})
        self.assertIsNone(self.store.claim_analysis_request("worker-one"))

        authorized = self.store.authorize_analysis_material(
            task["id"],
            {"allowPublicPdfDownload": True, "allowExternalModelProcessing": True},
        )
        self.assertEqual(authorized["material"]["authorization_mode"], "public_pdf_external")
        claim = self.store.claim_analysis_request("worker-one", 300)
        self.assertIsNotNone(claim)
        self.assertEqual(claim["purpose"], "analyze")
        self.assertEqual(claim["task"]["id"], task["id"])
        self.assertIsNone(self.store.claim_analysis_request("worker-two", 300))
        with self.assertRaises(atlas.UnauthorizedError):
            self.store.validate_worker_lease(task["id"], "wrong-token")
        self.store.validate_worker_lease(task["id"], claim["leaseToken"])

    def test_material_lifecycle_records_exact_hash_and_parse_stats(self):
        task, _ = self.store.create_analysis_request(
            {
                "paper": sample_paper(),
                "sections": ["method"],
                "materialAuthorization": {
                    "allowPublicPdfDownload": True,
                    "allowExternalModelProcessing": True,
                },
            }
        )
        claim = self.store.claim_analysis_request("worker-one", 300)
        lease = claim["leaseToken"]
        source_hash = "c" * 64
        self.store.update_analysis_material(task["id"], "download-start", {}, lease)
        self.store.update_analysis_material(
            task["id"],
            "downloaded",
            {"sourceSha256": source_hash, "byteSize": 4096, "mediaType": "application/pdf"},
            lease,
        )
        self.store.update_analysis_material(task["id"], "parse-start", {}, lease)
        ready = self.store.update_analysis_material(
            task["id"],
            "ready",
            {"sourceSha256": source_hash, "pageCount": 17, "extractedCharacters": 42000},
            lease,
        )
        self.assertEqual(ready["material"]["status"], "ready")
        self.assertEqual(ready["material"]["source_sha256"], source_hash)
        self.assertEqual(ready["task"]["source_sha256"], source_hash)

    def test_expired_lease_preserves_failed_attempt_and_reclaims_task(self):
        task, _ = self.store.create_analysis_request(
            {
                "paper": sample_paper(),
                "sections": ["method"],
                "materialAuthorization": {
                    "allowPublicPdfDownload": True,
                    "allowExternalModelProcessing": True,
                },
            }
        )
        first = self.store.claim_analysis_request("worker-one", 300)
        self.store.update_analysis_stage(task["id"], "method", "start", {"model": "test-model"})
        with self.store.connect() as db:
            db.execute(
                "UPDATE analysis_requests SET lease_expires_at='2000-01-01T00:00:00+00:00' WHERE id=?",
                (task["id"],),
            )
        second = self.store.claim_analysis_request("worker-two", 300)
        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertNotEqual(first["leaseToken"], second["leaseToken"])
        history = self.store.get_analysis_stage(task["id"], "method")["attempts"]
        self.assertEqual(history[0]["attempt"], 2)
        self.assertEqual(history[0]["status"], "pending")
        self.assertEqual(history[1]["status"], "failed")
        self.assertIn("lease", history[1]["error_text"])

    def test_analysis_status_transitions_enforce_the_state_machine(self):
        task, _ = self.store.create_analysis_request({"paper": sample_paper(), "sections": ["method"]})
        self.assertEqual(self.store.transition_analysis_request(task["id"], "pause")["status"], "paused")
        self.assertEqual(self.store.transition_analysis_request(task["id"], "resume")["status"], "queued")
        self.assertEqual(self.store.transition_analysis_request(task["id"], "cancel")["status"], "cancelled")
        with self.assertRaises(atlas.ConflictError):
            self.store.transition_analysis_request(task["id"], "pause")
        self.assertEqual(self.store.transition_analysis_request(task["id"], "retry")["status"], "queued")

    def test_stage_results_build_a_versioned_dossier(self):
        source_hash = "a" * 64
        task, _ = self.store.create_analysis_request(
            {"paper": sample_paper(sourceSha256=source_hash), "sections": ["method"], "sourceSha256": source_hash}
        )
        for stage in task["progress"]:
            updated = self.store.update_analysis_stage(
                task["id"],
                stage["key"],
                "complete",
                {
                    "sourceBasis": "fulltext",
                    "sourceSha256": source_hash,
                    "model": "test-model",
                    "promptVersion": "atlas-stage-v1",
                    "content": sample_stage_content(stage["key"]),
                },
            )
        self.assertEqual(updated["status"], "completed")
        self.assertEqual(updated["percent"], 100)

        dossier = self.store.get_paper(updated["canonical_paper_id"])["dossier"]
        self.assertIsNotNone(dossier)
        self.assertEqual(dossier["analysis_level"], "fulltext")
        self.assertEqual(dossier["source_basis"], "fulltext")
        self.assertEqual(dossier["status"], "completed")
        self.assertEqual(dossier["visibility"], "private")
        self.assertEqual(dossier["content"]["method"]["sections"][0]["source_kind"], "paper_claim")
        self.assertEqual(dossier["content"]["method"]["sections"][0]["evidence"][0]["page"], 3)

    def test_stage_contract_rejects_untraceable_claims_and_unhashed_fulltext(self):
        task, _ = self.store.create_analysis_request({"paper": sample_paper(), "sections": ["method"]})
        without_evidence = sample_stage_content()
        without_evidence["sections"][0]["evidence"] = []
        with self.assertRaisesRegex(atlas.AtlasError, "证据定位"):
            self.store.update_analysis_stage(
                task["id"], "method", "complete", {"sourceBasis": "abstract", "content": without_evidence}
            )
        with self.assertRaisesRegex(atlas.AtlasError, "source SHA-256"):
            self.store.update_analysis_stage(
                task["id"], "method", "complete", {"sourceBasis": "fulltext", "content": sample_stage_content()}
            )
        with self.assertRaisesRegex(atlas.AtlasError, "JSON Schema"):
            self.store.update_analysis_stage(
                task["id"],
                "method",
                "complete",
                {"sourceBasis": "abstract", "content": sample_stage_content(), "unexpected": True},
            )

    def test_failed_stage_retry_preserves_attempt_history(self):
        task, _ = self.store.create_analysis_request({"paper": sample_paper(), "sections": ["math"]})
        failed = self.store.update_analysis_stage(
            task["id"], "math", "fail", {"error": "公式编号未能定位"}
        )
        self.assertEqual(failed["status"], "failed")
        retried = self.store.transition_analysis_request(task["id"], "retry", "math")
        math_stage = next(item for item in retried["progress"] if item["key"] == "math")
        self.assertEqual(math_stage["attempt"], 2)
        self.assertEqual(math_stage["status"], "pending")
        history = self.store.get_analysis_stage(task["id"], "math")["attempts"]
        self.assertEqual([item["attempt"] for item in history], [2, 1])
        self.assertEqual(history[1]["error_text"], "公式编号未能定位")

    def test_partial_cancelled_task_does_not_remain_running(self):
        task, _ = self.store.create_analysis_request({"paper": sample_paper(), "sections": ["math"]})
        self.store.update_analysis_stage(
            task["id"],
            "structure",
            "complete",
            {"sourceBasis": "metadata", "content": sample_stage_content("structure")},
        )
        cancelled = self.store.transition_analysis_request(task["id"], "cancel")
        self.assertEqual(cancelled["status"], "cancelled")
        self.store.transition_analysis_request(task["id"], "retry", "math")
        updated = self.store.update_analysis_stage(
            task["id"],
            "math",
            "complete",
            {"sourceBasis": "metadata", "content": sample_stage_content("math")},
        )
        self.assertEqual(updated["status"], "partial")

    def test_dossier_top_level_hash_is_blank_for_mixed_materials(self):
        task, _ = self.store.create_analysis_request({"paper": sample_paper(), "sections": ["method"]})
        for stage, source_hash in (("structure", "a" * 64), ("method", "b" * 64)):
            self.store.update_analysis_stage(
                task["id"],
                stage,
                "complete",
                {
                    "sourceBasis": "fulltext",
                    "sourceSha256": source_hash,
                    "content": sample_stage_content(stage),
                },
            )
        dossier = self.store.get_paper(task["canonical_paper_id"])["dossier"]
        self.assertEqual(dossier["source_sha256"], "")
        self.assertEqual(dossier["content"]["structure"]["source_sha256"], "a" * 64)
        self.assertEqual(dossier["content"]["method"]["source_sha256"], "b" * 64)

    def test_schema_upgrade_backfills_legacy_progress(self):
        task, _ = self.store.create_analysis_request({"paper": sample_paper(), "sections": ["method"]})
        with self.store.connect() as db:
            db.execute("DELETE FROM analysis_stage_runs WHERE analysis_request_id=?", (task["id"],))
        reopened = atlas.AtlasStore(self.database)
        restored = reopened.get_analysis_request(task["id"])
        self.assertEqual([item["key"] for item in restored["progress"]], ["structure", "claims", "method", "citations"])

    def test_bridge_rejects_unknown_origins_and_deduplicates_messages(self):
        envelope = {
            "type": "paperfield:paper-context",
            "version": 1,
            "messageId": "bridge-message-001",
            "bridgeToken": "one-time-token-with-enough-entropy",
            "sourceOrigin": "http://127.0.0.1:8765",
            "paper": sample_paper(),
        }
        accepted = self.store.process_bridge(envelope, {"http://127.0.0.1:8765"})
        duplicate = self.store.process_bridge(envelope, {"http://127.0.0.1:8765"})

        self.assertEqual(accepted["type"], "atlas:context-accepted")
        self.assertTrue(duplicate["duplicate"])
        self.assertEqual(accepted["paper"]["id"], duplicate["paper"]["id"])

        rejected = {**envelope, "messageId": "bridge-message-002", "sourceOrigin": "http://attacker.invalid"}
        with self.assertRaisesRegex(atlas.AtlasError, "允许列表"):
            self.store.process_bridge(rejected, {"http://127.0.0.1:8765"})
        self.assertEqual(len(self.store.list_papers()), 1)

    def test_bridge_analysis_request_never_grants_material_permissions(self):
        envelope = {
            "type": "paperfield:analysis-request",
            "version": 1,
            "messageId": "bridge-analysis-001",
            "bridgeToken": "one-time-token-with-enough-entropy",
            "sourceOrigin": "http://127.0.0.1:8765",
            "paper": sample_paper(),
            "request": {
                "sections": ["method"],
                "materialAuthorization": {
                    "allowPublicPdfDownload": True,
                    "allowExternalModelProcessing": True,
                },
            },
        }
        accepted = self.store.process_bridge(envelope, {"http://127.0.0.1:8765"})
        material = accepted["task"]["material"]
        self.assertFalse(material["download_authorized"])
        self.assertFalse(material["external_processing_authorized"])
        self.assertIsNone(self.store.claim_analysis_request("worker-one"))


class AtlasHttpTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = atlas.AtlasStore(Path(self.directory.name) / "atlas.db")
        self.server = atlas.create_server(
            "127.0.0.1",
            0,
            self.store,
            "http://127.0.0.1:8765/",
            "http://127.0.0.1:4178/",
            worker_token="test-worker-token-with-enough-entropy",
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()
        self.directory.cleanup()

    def request_json(self, path, method="GET", payload=None, headers=None):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={"Content-Type": "application/json", **(headers or {})} if data is not None else (headers or {}),
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8")), response.headers

    def test_http_context_resolution_and_analysis_lifecycle(self):
        status, health, headers = self.request_json("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(health["status"], "ok")
        self.assertEqual(Path(health["database"]), self.store.path)
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")

        status, paper, _ = self.request_json("/api/papers/context", "POST", sample_paper())
        self.assertEqual(status, 201)
        reference = urllib.parse.quote(paper["canonical_ref"], safe="")
        status, resolved, _ = self.request_json(f"/api/papers/resolve?ref={reference}")
        self.assertEqual(status, 200)
        self.assertTrue(resolved["found"])
        self.assertEqual(resolved["paper"]["id"], paper["id"])

        request = {"paper": sample_paper(), "sections": ["method", "math"]}
        status, created, _ = self.request_json("/api/analysis-requests", "POST", request)
        self.assertEqual(status, 201)
        status, repeated, _ = self.request_json("/api/analysis-requests", "POST", request)
        self.assertEqual(status, 200)
        self.assertTrue(repeated["reused"])
        self.assertEqual(created["task"]["id"], repeated["task"]["id"])

        task_id = created["task"]["id"]
        status, paused, _ = self.request_json(f"/api/analysis-requests/{task_id}/pause", "POST", {})
        self.assertEqual(status, 200)
        self.assertEqual(paused["status"], "paused")

    def test_worker_stage_api_requires_token_and_publishes_dossier(self):
        _, created, _ = self.request_json(
            "/api/analysis-requests",
            "POST",
            {"paper": sample_paper(), "sections": ["method"]},
        )
        task_id = created["task"]["id"]
        path = f"/api/analysis-requests/{task_id}/stages/method/start"
        with self.assertRaises(urllib.error.HTTPError) as rejected:
            self.request_json(path, "POST", {"model": "test-model"})
        self.assertEqual(rejected.exception.code, 403)

        worker_headers = {"X-Atlas-Worker-Token": "test-worker-token-with-enough-entropy"}
        status, running, _ = self.request_json(
            path,
            "POST",
            {"model": "test-model", "promptVersion": "atlas-stage-v1"},
            worker_headers,
        )
        self.assertEqual(status, 200)
        self.assertEqual(next(item for item in running["progress"] if item["key"] == "method")["status"], "running")
        status, updated, _ = self.request_json(
            f"/api/analysis-requests/{task_id}/stages/method/complete",
            "POST",
            {
                "sourceBasis": "abstract",
                "model": "test-model",
                "promptVersion": "atlas-stage-v1",
                "content": sample_stage_content(),
            },
            worker_headers,
        )
        self.assertEqual(status, 200)
        paper_id = updated["canonical_paper_id"]
        _, dossier, _ = self.request_json(f"/api/papers/{paper_id}/dossier")
        self.assertEqual(dossier["dossier"]["analysis_level"], "abstract")
        self.assertIn("method", dossier["dossier"]["content"])

    def test_http_flowloom_context_route_requires_confirmation_and_filters_claims(self):
        _, created, _ = self.request_json(
            "/api/analysis-requests",
            "POST",
            {"paper": sample_paper(), "sections": ["method"]},
        )
        task_id = created["task"]["id"]
        worker_headers = {"X-Atlas-Worker-Token": "test-worker-token-with-enough-entropy"}
        stage_path = f"/api/analysis-requests/{task_id}/stages/method/start"
        self.request_json(stage_path, "POST", {"model": "test-model"}, worker_headers)
        source_hash = "c" * 64
        content = sample_stage_content()
        content["sections"].append(
            {
                "title": "unlocated-source",
                "body": "unlocated source cannot be a drawing fact",
                "sourceKind": "insufficient_information",
                "confidence": "unknown",
                "evidence": [],
            }
        )
        _, updated, _ = self.request_json(
            f"/api/analysis-requests/{task_id}/stages/method/complete",
            "POST",
            {
                "sourceBasis": "fulltext",
                "sourceSha256": source_hash,
                "model": "test-model",
                "promptVersion": "atlas-stage-v1",
                "content": content,
            },
            worker_headers,
        )
        paper_id = updated["canonical_paper_id"]

        with self.assertRaises(urllib.error.HTTPError) as unconfirmed:
            self.request_json(
                f"/api/papers/{paper_id}/flowloom-context",
                "POST",
                {"confirmed": False, "editorName": "test-editor", "reason": "not yet"},
            )
        self.assertEqual(unconfirmed.exception.code, 400)

        status, context, _ = self.request_json(
            f"/api/papers/{paper_id}/flowloom-context",
            "POST",
            {
                "confirmed": True,
                "editorName": "test-editor",
                "reason": "Verify the bounded Flowloom HTTP export.",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(context["claims"]), 1)
        self.assertEqual(context["claims"][0]["source_sha256"], source_hash)
        self.assertEqual(context["claims"][0]["evidence"][0]["source_locator"]["content_sha256"], source_hash)
        self.assertIn("unlocated source cannot be a drawing fact", context["insufficient_information"])
        self.assertEqual(self.store.list_editor_audit(1)[0]["action"], "paper_context_exported")

    def test_http_worker_claim_requires_material_consent_and_lease_token(self):
        _, created, _ = self.request_json(
            "/api/analysis-requests",
            "POST",
            {"paper": sample_paper(), "sections": ["method"]},
        )
        task_id = created["task"]["id"]
        worker_headers = {"X-Atlas-Worker-Token": "test-worker-token-with-enough-entropy"}
        _, empty, _ = self.request_json(
            "/api/worker/claim",
            "POST",
            {"workerId": "http-worker"},
            worker_headers,
        )
        self.assertIsNone(empty["claim"])
        self.request_json(
            f"/api/analysis-requests/{task_id}/material-authorization",
            "POST",
            {"allowPublicPdfDownload": True, "allowExternalModelProcessing": True},
        )
        _, claimed, _ = self.request_json(
            "/api/worker/claim",
            "POST",
            {"workerId": "http-worker", "leaseSeconds": 300},
            worker_headers,
        )
        lease = claimed["claim"]["leaseToken"]
        stage_path = f"/api/analysis-requests/{task_id}/stages/method/start"
        with self.assertRaises(urllib.error.HTTPError) as missing_lease:
            self.request_json(stage_path, "POST", {"model": "test-model"}, worker_headers)
        self.assertEqual(missing_lease.exception.code, 401)
        status, running, _ = self.request_json(
            stage_path,
            "POST",
            {"model": "test-model"},
            {**worker_headers, "X-Atlas-Lease-Token": lease},
        )
        self.assertEqual(status, 200)
        self.assertEqual(next(item for item in running["progress"] if item["key"] == "method")["status"], "running")


if __name__ == "__main__":
    unittest.main()
