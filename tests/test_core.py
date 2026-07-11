import importlib.util
import tempfile
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("paperfield_app", Path(__file__).resolve().parents[1] / "app.py")
APP = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(APP)


class ClassifierTests(unittest.TestCase):
    def setUp(self):
        self.classifier = APP.PaperClassifier(APP.load_config(), APP.VENUE_CATALOG)

    def test_embodied_multimodal_classification(self):
        paper = {
            "title": "A Vision-Language-Action Model for Dexterous Robot Manipulation",
            "abstract": "We study embodied robot learning with tactile sensing and a multimodal large language model.",
            "venue": "CoRL",
            "journal_ref": "",
        }
        topics = self.classifier.classify(paper)
        self.assertIn("具身智能", topics)
        self.assertTrue(any(topic in topics for topic in ["触觉与灵巧操作", "多模态大模型"]))

    def test_quality_rewards_top_venue(self):
        paper = {
            "title": "Embodied model",
            "abstract": "embodied robot learning",
            "venue": "ICRA 2026",
            "journal_ref": "",
            "citation_count": 9,
            "published": APP.utc_now().date().isoformat(),
            "topics": ["具身智能"],
        }
        self.assertGreaterEqual(self.classifier.quality(paper), 60)

    def test_recommendation_score_is_explainable(self):
        paper = {
            "id": "paper",
            "title": "Vision-Language-Action Robot",
            "abstract": "robot learning",
            "venue": "CoRL",
            "venue_tier": "顶级会议",
            "citation_count": 16,
            "published": APP.utc_now().date().isoformat(),
            "topics": ["具身智能", "多模态大模型"],
            "pdf_url": "https://example.com/paper.pdf",
        }
        score = self.classifier.recommendation(paper, "具身智能", has_project=True)
        self.assertEqual(len(score["components"]), 5)
        self.assertAlmostEqual(score["total"], sum(item["score"] for item in score["components"]), places=1)
        self.assertLessEqual(score["total"], 100)


class ExplanationTests(unittest.TestCase):
    def test_fallback_is_labeled(self):
        explanation = APP.PaperExplainer()._fallback(
            {
                "title": "Test",
                "abstract": "We introduce a robot learning method. Experiments show improved manipulation accuracy.",
                "topics": ["具身智能"],
            }
        )
        self.assertEqual(explanation["mode"], "abstract")
        self.assertIn("具身智能", explanation["one_sentence"])

    def test_long_fulltext_context_keeps_beginning_middle_and_end(self):
        text = "BEGIN" + "a" * 70000 + "MIDDLE" + "b" * 70000 + "END"
        context = APP.PaperExplainer._paper_context(text)
        self.assertIn("BEGIN", context)
        self.assertIn("MIDDLE", context)
        self.assertIn("END", context)


class FeedTests(unittest.TestCase):
    def test_acm_mm_edition_name_uses_correct_ordinal(self):
        self.assertEqual(APP.PaperSources.ordinal(32), "32nd")
        self.assertEqual(APP.PaperSources.ordinal(33), "33rd")
        self.assertEqual(APP.PaperSources.ordinal(34), "34th")

    def test_future_issue_dates_are_hidden(self):
        today = APP.utc_now().date()
        base = {
            "id": "paper",
            "title": "Embodied paper",
            "abstract": "robot learning",
            "authors": [],
            "venue": "Test",
            "source": "Test",
            "status": "unread",
            "favorite": False,
            "topics": ["具身智能"],
            "quality_score": 1,
            "citation_count": 0,
        }
        visible = {**base, "published": today.isoformat()}
        future = {**base, "id": "future", "published": (today + APP.timedelta(days=14)).isoformat()}

        self.assertEqual(APP.filter_papers([visible, future], {}), [visible])

    def test_coverage_distinguishes_visible_scheduled_and_blocked_venues(self):
        today = APP.utc_now().date()
        entries = [
            {"name": "Visible", "tier": "顶级会议", "kind": "会议", "platform": "Test"},
            {"name": "Scheduled", "tier": "顶级会议", "kind": "会议", "platform": "Test"},
            {"name": "Blocked", "tier": "顶级会议", "kind": "会议", "platform": "Test"},
        ]
        papers = [
            {"title": "Visible paper", "venue": "Visible", "published": today.isoformat()},
            {
                "title": "Scheduled paper",
                "venue": "Scheduled",
                "published": (today + APP.timedelta(days=30)).isoformat(),
            },
        ]
        coverage = APP.build_catalog_coverage(
            entries,
            papers,
            {"Blocked": {"status": "blocked", "error_text": "browser challenge verification"}},
        )
        by_venue = {item["venue"]: item for item in coverage["items"]}

        self.assertEqual(coverage["covered"], 1)
        self.assertEqual(coverage["indexed"], 2)
        self.assertEqual(by_venue["Scheduled"]["availability_status"], "scheduled")
        self.assertEqual(by_venue["Blocked"]["availability_status"], "blocked")

    def test_openreview_challenge_is_a_blocked_source(self):
        self.assertEqual(
            APP.venue_sync_error_status("OpenReview requires browser challenge verification"),
            "blocked",
        )

    def test_crossref_created_date_is_parsed(self):
        self.assertEqual(APP.iso_date({"date-time": "2026-07-11T08:30:00Z"}), "2026-07-11")

    def test_venue_catalog_normalizes_top_platforms(self):
        metadata = APP.VENUE_CATALOG.describe("IEEE Robotics Autom. Lett.", source="DBLP")
        self.assertEqual(metadata["canonical_venue"], "IEEE RA-L")
        self.assertEqual(metadata["venue_tier"], "顶级期刊")
        self.assertEqual(metadata["platform"], "IEEE Xplore")

    def test_venue_catalog_matches_proceedings_titles(self):
        metadata = APP.VENUE_CATALOG.describe(
            "Proceedings of the 32nd ACM International Conference on Multimedia"
        )
        self.assertEqual(metadata["canonical_venue"], "ACM MM")

    def test_notable_institution_aliases_are_marked(self):
        matches = APP.INSTITUTION_CATALOG.match(
            ["Department of Electronic Engineering, Tsinghua University, Beijing, China"]
        )
        self.assertEqual(matches[0]["id"], "tsinghua-ai")

    def test_arxiv_is_labeled_as_unconfirmed_preprint(self):
        metadata = APP.VENUE_CATALOG.describe("arXiv", source="arXiv")
        self.assertEqual(metadata["venue_tier"], "预印本")
        self.assertEqual(metadata["publication_status"], "尚未确认录用")

    def test_same_title_merges_preprint_and_official_record(self):
        with tempfile.TemporaryDirectory() as directory:
            store = APP.PaperStore(Path(directory) / "papers.db")
            base = {
                "title": "A Vision-Language-Action Model for Robot Learning",
                "abstract": "robot learning",
                "authors": ["Researcher"],
                "institutions": ["Tsinghua University"],
                "published": "2026-01-01",
                "updated": "2026-01-01",
                "source_url": "https://example.com/paper",
                "pdf_url": "",
                "doi": "",
                "journal_ref": "",
                "topics": ["具身智能"],
                "quality_score": 50,
                "citation_count": 0,
            }
            store.upsert({**base, "id": "arxiv:1", "venue": "arXiv", "source": "arXiv"})
            inserted = store.upsert({**base, "id": "pmlr:1", "venue": "CoRL", "source": "PMLR"})

            self.assertFalse(inserted)
            self.assertEqual(store.count(), 1)
            self.assertEqual(store.list_papers()[0]["venue"], "CoRL")
            self.assertEqual(store.list_papers()[0]["notable_institutions"][0]["id"], "tsinghua-ai")

    def test_project_name_links_to_paper_method_name(self):
        paper = {
            "title": "OpenVLA: An Open-Source Vision-Language-Action Model",
            "id": "arxiv:2406.09246",
            "doi": "",
            "source_url": "https://arxiv.org/abs/2406.09246",
            "pdf_url": "",
        }
        project = {
            "name": "OpenVLA",
            "full_name": "openvla/openvla",
            "description": "Official implementation",
            "homepage": "",
            "topics": ["vision-language-action"],
        }

        match = APP.paper_project_match(paper, project)
        self.assertIsNotNone(match)
        self.assertGreaterEqual(match[0], 90)

    def test_asset_state_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            store = APP.PaperStore(Path(directory) / "papers.db")
            saved = store.save_asset(
                "paper",
                {"provider": "arXiv", "access_status": "ready", "page_count": 12, "text_chars": 42000},
            )
            self.assertEqual(saved["provider"], "arXiv")
            self.assertEqual(saved["page_count"], 12)
            self.assertEqual(store.assets_for_papers(["paper"])["paper"]["text_chars"], 42000)

    def test_pdf_url_safety_rejects_local_networks(self):
        self.assertFalse(APP.PaperAssetService._safe_remote_url("http://127.0.0.1/private.pdf"))
        self.assertFalse(APP.PaperAssetService._safe_remote_url("file:///tmp/paper.pdf"))
        self.assertTrue(APP.PaperAssetService._safe_remote_url("https://arxiv.org/pdf/1234.5678"))


if __name__ == "__main__":
    unittest.main()
