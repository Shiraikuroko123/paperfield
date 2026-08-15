import json
import tempfile
import unittest
from pathlib import Path

from src.research_atlas import app as atlas
from src.research_atlas.schema_validation import validate_json_schema


class FlowloomPaperContextTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = atlas.AtlasStore(Path(self.directory.name) / "atlas.db")
        self.source_hash = "a" * 64
        self.task, _ = self.store.create_analysis_request(
            {
                "paper": {
                    "paperfieldId": "arxiv:2406.09246",
                    "title": "OpenVLA: An Open-Source Vision-Language-Action Model",
                    "abstract": "A VLA policy maps visual and language inputs to robot actions.",
                    "authors": ["Moo Jin Kim", "Karl Pertsch"],
                    "sourceUrl": "https://arxiv.org/abs/2406.09246",
                    "pdfUrl": "https://arxiv.org/pdf/2406.09246",
                    "topics": ["VLA", "Embodied AI"],
                },
                "sections": ["method"],
                "sourceSha256": self.source_hash,
            }
        )
        self.store.update_analysis_stage(
            self.task["id"],
            "method",
            "complete",
            {
                "sourceBasis": "fulltext",
                "sourceSha256": self.source_hash,
                "content": {
                    "summary": "The method connects visual-language features to an action policy.",
                    "sections": [
                        {
                            "title": "Action policy",
                            "body": "The policy predicts robot actions from visual and language tokens.",
                            "sourceKind": "paper_claim",
                            "confidence": "high",
                            "evidence": [
                                {
                                    "label": "Method",
                                    "page": 4,
                                    "section": "3. Method",
                                    "quote": "We predict robot actions conditioned on visual and language tokens.",
                                    "sourceUrl": "https://arxiv.org/pdf/2406.09246",
                                }
                            ],
                        }
                    ],
                },
            },
        )

    def tearDown(self):
        self.directory.cleanup()

    def test_export_requires_confirmation_and_preserves_source_bounds(self):
        with self.assertRaisesRegex(atlas.AtlasError, "explicit confirmation"):
            self.store.export_paper_flowloom_context(
                self.task["canonical_paper_id"],
                {"editorName": "test editor", "reason": "Testing explicit export confirmation."},
            )

        context = self.store.export_paper_flowloom_context(
            self.task["canonical_paper_id"],
            {
                "confirmed": True,
                "editorName": "test editor",
                "reason": "Testing the bounded paper context export.",
            },
        )
        self.assertEqual(context["canonical_paper_ref"], "arxiv:2406.09246")
        self.assertEqual(context["source_sha256"], self.source_hash)
        self.assertIn("reader=1", context["paperfield_path"])
        self.assertEqual(context["provenance"]["producer"], "research-atlas")
        self.assertTrue(context["provenance"]["source_bounded"])
        self.assertEqual(len(context["claims"]), 1)
        evidence = context["claims"][0]["evidence"][0]
        self.assertEqual(evidence["source_locator"]["page"], 4)
        self.assertEqual(evidence["source_locator"]["content_sha256"], self.source_hash)
        self.assertIn("page=4", evidence["paperfield_path"])
        self.assertIn("vla-policy", context["template_ids"])
        schema = json.loads(
            (
                Path(__file__).parents[1]
                / "packages"
                / "research-contracts"
                / "schemas"
                / "paper-context.schema.json"
            ).read_text(encoding="utf-8")
        )
        validate_json_schema(context, schema)
        audit = self.store.list_editor_audit(1)
        self.assertEqual(audit[0]["action"], "paper_context_exported")

    def test_export_does_not_cross_owner_dossier_boundary(self):
        with self.assertRaisesRegex(atlas.NotFoundError, "dossier"):
            self.store.export_paper_flowloom_context(
                self.task["canonical_paper_id"],
                {
                    "confirmed": True,
                    "editorName": "other editor",
                    "reason": "Verifying owner-scoped dossier isolation.",
                },
                "other-owner",
            )


if __name__ == "__main__":
    unittest.main()
