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


class FeedTests(unittest.TestCase):
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

    def test_crossref_created_date_is_parsed(self):
        self.assertEqual(APP.iso_date({"date-time": "2026-07-11T08:30:00Z"}), "2026-07-11")

    def test_venue_catalog_normalizes_top_platforms(self):
        metadata = APP.VENUE_CATALOG.describe("IEEE Robotics Autom. Lett.", source="DBLP")
        self.assertEqual(metadata["canonical_venue"], "IEEE RA-L")
        self.assertEqual(metadata["venue_tier"], "顶级期刊")
        self.assertEqual(metadata["platform"], "IEEE Xplore")

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


if __name__ == "__main__":
    unittest.main()
