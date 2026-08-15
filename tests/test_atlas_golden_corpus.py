import copy
import unittest

from src.research_atlas.golden_corpus import (
    GoldenCorpusError,
    load_claim_lineage_corpus,
    validate_claim_lineage_corpus,
)


class ClaimLineageGoldenCorpusTests(unittest.TestCase):
    def test_released_corpus_is_deterministic_dual_domain_and_release_ready(self):
        first = load_claim_lineage_corpus()
        second = load_claim_lineage_corpus()

        self.assertEqual(first, second)
        self.assertEqual(first["version"], "2026.08-release.1")
        self.assertEqual(first["status"], "released")
        self.assertEqual(first["stats"]["domains"], ["embodied", "llm"])
        self.assertGreater(first["stats"]["positive_count"], 0)
        self.assertGreater(first["stats"]["negative_count"], 0)
        self.assertRegex(first["corpus_sha256"], r"^[a-f0-9]{64}$")
        self.assertTrue(first["release_ready"])
        self.assertEqual(first["release_issues"], [])
        self.assertEqual(
            first["stats"]["fully_reviewed_count"], first["stats"]["item_count"]
        )
        for item in first["items"]:
            self.assertGreaterEqual(len(item["reviews"]), 2)
            self.assertEqual(
                len({review["reviewer_id"] for review in item["reviews"]}),
                len(item["reviews"]),
            )

    def test_second_independent_reviews_and_released_status_open_the_gate(self):
        corpus = load_claim_lineage_corpus()
        corpus.pop("corpus_sha256")
        corpus.pop("release_ready")
        corpus.pop("release_issues")
        corpus.pop("stats")
        corpus["status"] = "released"
        for item in corpus["items"]:
            item["reviews"].append(
                {
                    "reviewer_id": "independent-reviewer",
                    "decision": "accepted",
                    "reviewed_at": "2026-08-13",
                    "note": "Independent source and relationship review completed.",
                }
            )

        released = validate_claim_lineage_corpus(corpus)
        self.assertTrue(released["release_ready"])
        self.assertEqual(
            released["stats"]["fully_reviewed_count"],
            released["stats"]["item_count"],
        )

    def test_invalid_locator_or_duplicate_reviewer_is_rejected(self):
        corpus = load_claim_lineage_corpus()
        for field in ("corpus_sha256", "release_ready", "release_issues", "stats"):
            corpus.pop(field)
        invalid_locator = copy.deepcopy(corpus)
        invalid_locator["items"][0]["left"]["source_locator"] = {"url": "https://example.test"}
        with self.assertRaisesRegex(GoldenCorpusError, "exact source locator"):
            validate_claim_lineage_corpus(invalid_locator)

        repeated_reviewer = copy.deepcopy(corpus)
        repeated_reviewer["items"][0]["reviews"].append(
            copy.deepcopy(repeated_reviewer["items"][0]["reviews"][0])
        )
        with self.assertRaisesRegex(GoldenCorpusError, "repeats a reviewer"):
            validate_claim_lineage_corpus(repeated_reviewer)


if __name__ == "__main__":
    unittest.main()
