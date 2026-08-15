import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from src.research_atlas import app as atlas


EDITOR = "phase4-test-editor"
REASON = "Phase 4 acceptance test requires an auditable reason."


def sample_paper(identifier: str, title: str, topics=None):
    return {
        "paperfieldId": f"arxiv:{identifier}",
        "title": title,
        "abstract": f"Abstract for {title}, used to verify L1 structured extraction.",
        "authors": ["Atlas Test Author"],
        "venue": "TestConf",
        "published": "2026-08-01",
        "sourceUrl": f"https://arxiv.org/abs/{identifier}",
        "pdfUrl": f"https://arxiv.org/pdf/{identifier}",
        "topics": topics or ["Embodied AI", "Vision-Language-Action"],
    }


class AtlasPhase4StoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = atlas.AtlasStore(Path(self.directory.name) / "atlas.db")

    def tearDown(self):
        self.directory.cleanup()

    @staticmethod
    def editor_payload(**overrides):
        payload = {"editorName": EDITOR, "reason": REASON}
        payload.update(overrides)
        return payload

    def create_entity(self, kind, name, **overrides):
        payload = self.editor_payload(
            entityKind=kind,
            canonicalName=name,
            description=f"Curated description for {name}.",
            status="candidate",
            sourceKind="editor_test",
            sourceRef=f"test:{kind}:{name.casefold().replace(' ', '-')}",
            metadata={"fixture": True},
        )
        payload.update(overrides)
        return self.store.create_editor_entity(payload)

    def test_batch_preview_decisions_and_apply_only_approved_item(self):
        first = self.store.upsert_paper(sample_paper("2608.00001", "Embodied Foundation Model"))
        second = self.store.upsert_paper(sample_paper("2608.00002", "World Action Model"))
        batch = self.store.create_editor_batch(
            self.editor_payload(
                batchKind="l1_structure",
                dryRun=False,
                scope={"paperIds": [first["id"], second["id"]]},
            )
        )

        self.assertEqual(batch["status"], "queued")
        self.assertFalse(batch["dry_run"])
        self.assertEqual(batch["metrics"]["total"], 2)
        self.assertEqual({item["status"] for item in batch["items"]}, {"pending"})

        previewed = self.store.preview_editor_batch(batch["id"], self.editor_payload())
        self.assertEqual(previewed["status"], "previewed")
        self.assertEqual({item["status"] for item in previewed["items"]}, {"proposed"})
        self.assertTrue(all(item["proposed"] for item in previewed["items"]))
        self.assertTrue(all(item["diff"] for item in previewed["items"]))

        approved_item, rejected_item = previewed["items"]
        approved = self.store.decide_editor_batch_item(
            batch["id"], approved_item["id"], "approve", self.editor_payload()
        )
        rejected = self.store.decide_editor_batch_item(
            batch["id"], rejected_item["id"], "reject", self.editor_payload()
        )
        self.assertEqual(approved["status"], "approved")
        self.assertEqual(rejected["status"], "rejected")

        applied = self.store.apply_editor_batch(batch["id"], self.editor_payload())
        self.assertEqual(applied["status"], "completed")
        self.assertEqual(applied["metrics"]["completed"], 1)
        self.assertEqual(applied["metrics"]["rejected"], 1)
        self.assertEqual(applied["metrics"]["failed"], 0)
        self.assertIn("duration_ms", applied["metrics"])
        self.assertGreaterEqual(applied["metrics"]["actual_work"], 1)

        entities = self.store.list_editor_entities(entity_kind="paper")
        self.assertEqual(len(entities), 1)
        self.assertEqual(
            entities[0]["metadata"]["canonical_paper_id"],
            int(approved_item["item_ref"]),
        )
        actions = {event["action"] for event in self.store.list_editor_audit()}
        self.assertTrue(
            {
                "batch_created",
                "batch_previewed",
                "batch_item_approved",
                "batch_item_rejected",
                "batch_applied",
            }.issubset(actions)
        )

    def test_batch_pause_resume_cancel_and_retry_are_audited(self):
        paper = self.store.upsert_paper(sample_paper("2608.00003", "Robot Learning Systems"))
        batch = self.store.create_editor_batch(
            self.editor_payload(
                batchKind="l1_structure",
                scope={"paperIds": [paper["id"]]},
            )
        )

        paused = self.store.transition_editor_batch(batch["id"], "pause", self.editor_payload())
        self.assertEqual(paused["status"], "paused")
        resumed = self.store.transition_editor_batch(batch["id"], "resume", self.editor_payload())
        self.assertEqual(resumed["status"], "queued")
        cancelled = self.store.transition_editor_batch(batch["id"], "cancel", self.editor_payload())
        self.assertEqual(cancelled["status"], "cancelled")

        # Retry is reserved for failed work. Corrupt only the queued item's
        # reference to create a deterministic, recoverable preview failure.
        failed_paper = self.store.upsert_paper(sample_paper("2608.00006", "Retry Fixture"))
        failed_batch = self.store.create_editor_batch(
            self.editor_payload(
                batchKind="l1_structure",
                scope={"paperIds": [failed_paper["id"]]},
            )
        )
        with self.store.connect() as db:
            db.execute(
                "UPDATE editor_batch_items SET item_ref='not-a-paper-id' WHERE batch_id=?",
                (failed_batch["id"],),
            )
        failed = self.store.preview_editor_batch(failed_batch["id"], self.editor_payload())
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["items"][0]["status"], "failed")
        retried = self.store.transition_editor_batch(failed_batch["id"], "retry", self.editor_payload())
        self.assertEqual(retried["status"], "queued")
        self.assertEqual(retried["items"][0]["status"], "pending")
        self.assertGreaterEqual(retried["items"][0]["attempt"], 2)

        actions = [event["action"] for event in self.store.list_editor_audit()]
        for action in ("batch_paused", "batch_resumed", "batch_cancelled", "batch_retried"):
            self.assertIn(action, actions)

    def test_reviewed_entity_cannot_be_silently_overwritten(self):
        reviewed = self.create_entity(
            "method",
            "Action Chunking",
            status="active",
            metadata={"curated": True},
        )

        with self.assertRaises(atlas.ConflictError):
            self.store.create_editor_entity(
                self.editor_payload(
                    id=reviewed["id"],
                    entityKind="method",
                    canonicalName="Action Chunking",
                    description="Generated replacement that has not been approved.",
                    status="candidate",
                    sourceKind="model_recompute",
                    sourceRef="model:phase4-v2",
                    metadata={"curated": False},
                )
            )

        unchanged = self.store.get_editor_entity(reviewed["id"])
        self.assertEqual(unchanged["description"], "Curated description for Action Chunking.")
        self.assertEqual(unchanged["metadata"], {"curated": True})
        self.assertIsNotNone(unchanged["reviewed_at"])

        explicitly_corrected = self.store.update_editor_entity(
            reviewed["id"],
            self.editor_payload(description="Editor-approved corrected description."),
        )
        self.assertEqual(explicitly_corrected["description"], "Editor-approved corrected description.")
        self.assertEqual(explicitly_corrected["revision"], 2)

    def test_entity_creation_requires_an_auditable_reason(self):
        with self.assertRaises(atlas.AtlasError):
            self.store.create_editor_entity(
                {
                    "editorName": EDITOR,
                    "entityKind": "term",
                    "canonicalName": "Unreasoned Entity",
                }
            )
        self.assertEqual(self.store.list_editor_entities(), [])

    def test_alias_conflicts_and_merge_rewire_relationships(self):
        source = self.create_entity("term", "Vision Language Action Model")
        target = self.create_entity("term", "VLA")
        method = self.create_entity("method", "Action Expert")
        alias = self.store.add_editor_entity_alias(
            source["id"],
            self.editor_payload(alias="Vision-Language-Action", aliasKind="abbreviation_expansion"),
        )
        self.assertEqual(alias["entity_id"], source["id"])
        with self.assertRaises(atlas.ConflictError):
            self.store.add_editor_entity_alias(
                target["id"],
                self.editor_payload(alias="vision language action", aliasKind="normalized_variant"),
            )

        relationship = self.store.create_editor_relationship(
            self.editor_payload(
                fromEntityId=source["id"],
                toEntityId=method["id"],
                relationType="uses",
                status="active",
                sourceKind="paper_claim",
                sourceRef="arxiv:2608.00004",
                evidence=[
                    {
                        "label": "Method section",
                        "sourceRef": "arxiv:2608.00004#section-3",
                        "direction": "supports",
                    }
                ],
            )
        )
        merged = self.store.merge_editor_entities(
            source["id"],
            self.editor_payload(targetEntityId=target["id"]),
        )

        self.assertEqual(merged["source"]["status"], "merged")
        self.assertEqual(merged["source"]["merged_into_id"], target["id"])
        target_aliases = {item["alias"] for item in merged["target"]["aliases"]}
        self.assertIn("Vision Language Action Model", target_aliases)
        self.assertIn("Vision-Language-Action", target_aliases)
        rewired = next(
            item
            for item in self.store.list_editor_relationships(entity_id=target["id"])
            if item["id"] == relationship["id"]
        )
        self.assertEqual(rewired["from_entity_id"], target["id"])
        self.assertEqual(rewired["to_entity_id"], method["id"])
        self.assertEqual(rewired["status"], "active")
        self.assertIn("entity_merged", {event["action"] for event in self.store.list_editor_audit()})

    def test_coverage_recompute_lists_metrics_and_writes_audit_event(self):
        self.store.upsert_paper(
            sample_paper("2608.00005", "Embodied Coverage Anchor", ["Embodied AI"])
        )
        gaps = self.store.recompute_editor_coverage(
            self.editor_payload(
                scope={
                    "domains": ["embodied"],
                    "layers": ["candidate_ingest", "anchor_depth", "relationship_review"],
                },
            )
        )

        self.assertEqual(len(gaps), 3)
        self.assertEqual({gap["domain"] for gap in gaps}, {"embodied"})
        self.assertEqual(
            {gap["layer"] for gap in gaps},
            {"candidate_ingest", "anchor_depth", "relationship_review"},
        )
        self.assertTrue(all("paper_count" in gap["metrics"] for gap in gaps))
        listed = self.store.list_editor_coverage(domain="embodied")
        self.assertEqual({gap["id"] for gap in listed}, {gap["id"] for gap in gaps})
        audits = self.store.list_editor_audit(action="coverage_recomputed")
        self.assertEqual(len(audits), 1)
        self.assertEqual(audits[0]["actor"], EDITOR)
        self.assertEqual(audits[0]["after"]["gap_count"], 3)


class AtlasPhase4HttpSecurityTests(unittest.TestCase):
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
        request_headers = dict(headers or {})
        if data is not None:
            request_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers=request_headers,
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))

    def test_editor_endpoints_reject_bad_origin_before_read_or_write(self):
        bad_origin = {"Origin": "https://example.invalid"}
        with self.assertRaises(urllib.error.HTTPError) as get_rejected:
            self.request_json("/api/editor/batches", headers=bad_origin)
        self.assertEqual(get_rejected.exception.code, 403)

        with self.assertRaises(urllib.error.HTTPError) as post_rejected:
            self.request_json(
                "/api/editor/entities",
                "POST",
                {
                    "entityKind": "term",
                    "canonicalName": "Rejected Remote Entity",
                    "editorName": EDITOR,
                    "reason": REASON,
                },
                bad_origin,
            )
        self.assertEqual(post_rejected.exception.code, 403)
        self.assertEqual(self.store.list_editor_entities(), [])

        with self.assertRaises(urllib.error.HTTPError) as missing_reason:
            self.request_json(
                "/api/editor/entities",
                "POST",
                {
                    "entityKind": "term",
                    "canonicalName": "Missing Reason Entity",
                    "editorName": EDITOR,
                },
                {"Origin": self.base_url},
            )
        self.assertEqual(missing_reason.exception.code, 400)
        self.assertEqual(self.store.list_editor_entities(), [])

        status, body = self.request_json(
            "/api/editor/entities",
            "POST",
            {
                "entityKind": "term",
                "canonicalName": "Same-Origin Entity",
                "description": "Created through the local-only editor API.",
                "editorName": EDITOR,
                "reason": REASON,
            },
            {"Origin": self.base_url},
        )
        self.assertEqual(status, 201)
        self.assertEqual(body["canonical_name"], "Same-Origin Entity")

        status, collection = self.request_json(
            "/api/editor/entities",
            headers={"Origin": self.base_url},
        )
        self.assertEqual(status, 200)
        self.assertEqual(collection["total"], 1)
        self.assertEqual(collection["items"][0]["id"], body["id"])

        status, bootstrap = self.request_json("/api/bootstrap")
        self.assertEqual(status, 200)
        self.assertEqual(bootstrap["knowledge_entities"], [])
        self.assertEqual(bootstrap["knowledge_relationships"], [])
        self.assertNotIn("editor_batches", bootstrap)
        self.assertNotIn("coverage_gaps", bootstrap)
        self.assertNotIn("editor_audit", bootstrap)
        self.assertEqual(bootstrap["stats"]["knowledge_entities"], 1)

    def test_editor_batch_http_round_trip_and_non_loopback_rejection(self):
        status, paper = self.request_json(
            "/api/papers/context",
            "POST",
            sample_paper("2608.10090", "HTTP Batch Round Trip"),
        )
        self.assertEqual(status, 201)
        editor_headers = {"Origin": self.base_url}
        status, batch = self.request_json(
            "/api/editor/batches",
            "POST",
            {
                "batchKind": "l1_structure",
                "scope": {"paperIds": [paper["id"]]},
                "dryRun": False,
                "editorName": EDITOR,
                "reason": REASON,
            },
            editor_headers,
        )
        self.assertEqual(status, 201)
        self.assertEqual(batch["metrics"]["total"], 1)
        batch_id = batch["id"]

        status, previewed = self.request_json(
            f"/api/editor/batches/{batch_id}/preview",
            "POST",
            {"editorName": EDITOR, "reason": REASON},
            editor_headers,
        )
        self.assertEqual(status, 200)
        self.assertEqual(previewed["items"][0]["status"], "proposed")
        item_id = previewed["items"][0]["id"]

        status, approved = self.request_json(
            f"/api/editor/batches/{batch_id}/items/{item_id}/approve",
            "POST",
            {"editorName": EDITOR, "reason": REASON},
            editor_headers,
        )
        self.assertEqual(status, 200)
        self.assertEqual(approved["status"], "approved")

        status, applied = self.request_json(
            f"/api/editor/batches/{batch_id}/apply",
            "POST",
            {"editorName": EDITOR, "reason": REASON},
            editor_headers,
        )
        self.assertEqual(status, 200)
        self.assertEqual(applied["status"], "completed")
        self.assertEqual(applied["metrics"]["completed"], 1)

        handler = atlas.AtlasHandler.__new__(atlas.AtlasHandler)
        handler.client_address = ("192.0.2.1", 12345)
        handler.headers = {"Host": self.base_url.split("//", 1)[1], "Origin": self.base_url}
        with self.assertRaises(atlas.ForbiddenError):
            handler.require_local_editor()


if __name__ == "__main__":
    unittest.main()
