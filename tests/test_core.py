import importlib.util
import io
import tempfile
import unittest
from datetime import date, timedelta
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

    def test_agent_keyword_does_not_match_gradient(self):
        paper = {
            "title": "Stochastic Gradient Optimization",
            "abstract": "A general convex optimization method.",
            "venue": "NeurIPS",
            "journal_ref": "NeurIPS",
        }
        self.assertNotIn("智能体", self.classifier.classify(paper))

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
    def test_weekly_candidate_rotation_is_stable_and_changes_next_week(self):
        ranked = [(100 - index, {"id": f"paper-{index}"}, {}, None) for index in range(35)]
        this_week = date(2026, 7, 6)
        first = APP.rotate_daily_candidates(ranked, 5, "具身智能", this_week)[:5]
        repeated = APP.rotate_daily_candidates(ranked, 5, "具身智能", this_week)[:5]
        next_week = APP.rotate_daily_candidates(ranked, 5, "具身智能", this_week + timedelta(days=7))[:5]
        self.assertEqual([item[1]["id"] for item in first], [item[1]["id"] for item in repeated])
        self.assertTrue({item[1]["id"] for item in first}.isdisjoint({item[1]["id"] for item in next_week}))

    def test_runtime_settings_persist_pdf_directory_cache_and_billing_day(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            settings = APP.RuntimeSettings(root / "settings.json")
            saved = settings.update(
                {
                    "pdf_storage_mode": "hybrid",
                    "local_pdf_dir": str(root / "library"),
                    "local_cache_max_mb": 4096,
                    "r2_billing_cycle_day": 11,
                },
                cloud_configured=True,
            )
            loaded = APP.RuntimeSettings(root / "settings.json").get()
            self.assertEqual(saved, loaded)
            self.assertTrue((root / "library").is_dir())
            self.assertEqual(loaded["r2_billing_cycle_day"], 11)

    def test_cloud_operations_are_counted_and_inventory_is_recorded(self):
        class FakeBody(io.BytesIO):
            pass

        class FakeClient:
            def __init__(self):
                self.objects = {}

            def put_object(self, Bucket, Key, Body, ContentType):
                self.objects[Key] = Body.read()

            def get_object(self, Bucket, Key):
                return {"Body": FakeBody(self.objects[Key])}

            def list_objects_v2(self, **options):
                return {
                    "IsTruncated": False,
                    "Contents": [{"Key": key, "Size": len(value)} for key, value in self.objects.items()],
                }

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = APP.PaperStore(root / "papers.db")
            cloud = APP.S3ObjectStorage(store)
            cloud.bucket = "test"
            cloud.endpoint = "https://example.r2.cloudflarestorage.com"
            cloud.access_key = "key"
            cloud.secret_key = "secret"
            cloud._client_value = FakeClient()
            source = root / "paper.pdf"
            source.write_bytes(b"%PDF-test")
            cloud.upload(source, "papers/test/paper.pdf", "application/pdf")
            cloud.download("papers/test/paper.pdf", root / "restored.pdf")
            inventory = cloud.refresh_inventory()
            usage = store.cloud_usage()
            self.assertEqual(usage["class_a"], 2)
            self.assertEqual(usage["class_b"], 1)
            self.assertEqual(inventory["object_count"], 1)
            self.assertEqual(inventory["total_bytes"], len(b"%PDF-test"))

    def test_cloud_status_reports_missing_configuration_without_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = APP.PaperStore(root / "papers.db")
            cloud = APP.S3ObjectStorage(store)
            cloud.endpoint = None
            cloud.bucket = ""
            cloud.access_key = ""
            cloud.secret_key = ""
            settings = APP.RuntimeSettings()
            status = cloud.status(settings)
            self.assertFalse(status["configured"])
            self.assertEqual(
                status["missing_configuration"],
                ["S3 endpoint", "bucket", "Access Key ID", "Secret Access Key"],
            )

    def test_reading_archive_backs_up_and_restores_explanation_and_chat(self):
        class FakeCloud:
            configured = True

            def __init__(self, store):
                self.store = store
                self.objects = {}

            def upload_bytes(self, content, key, content_type="application/json"):
                self.objects[key] = content
                self.store.save_cloud_object(key, len(content))

            def download_bytes(self, key):
                return self.objects[key]

        with tempfile.TemporaryDirectory() as directory:
            store = APP.PaperStore(Path(directory) / "papers.db")
            store.upsert(
                {
                    "id": "paper", "title": "Paper", "abstract": "Abstract", "authors": ["Author"],
                    "institutions": [], "venue": "CoRL", "published": "2026-01-01", "updated": "2026-01-01",
                    "source": "test", "source_url": "https://example.com", "pdf_url": "", "doi": "",
                    "journal_ref": "", "topics": ["具身智能"], "quality_score": 80, "citation_count": 0,
                }
            )
            store.update_state("paper", {"status": "read", "favorite": True, "notes": "important"})
            store.save_explanation("paper", {"mode": "fulltext", "one_sentence": "explained"})
            store.add_chat_message("paper", "user", "question")
            store.add_chat_message("paper", "assistant", "answer")
            archive = APP.ReadingArchiveService(store, FakeCloud(store))
            self.assertTrue(archive.backup_paper("paper"))

            db = store.connect()
            try:
                db.execute("DELETE FROM user_state WHERE paper_id = ?", ("paper",))
                db.execute("DELETE FROM paper_chat_messages WHERE paper_id = ?", ("paper",))
                db.commit()
            finally:
                db.close()
            self.assertTrue(archive.restore_paper_if_needed("paper"))
            restored = store.get_paper("paper")
            self.assertEqual(restored["status"], "read")
            self.assertEqual(restored["explanation"]["one_sentence"], "explained")
            self.assertEqual([item["content"] for item in store.chat_history("paper")], ["question", "answer"])

    def test_project_workspace_groups_files_and_sanitizes_readme(self):
        files = ["README.md", "src/model.py", "scripts/train.py", "configs/base.yaml", "tests/test_model.py"]
        with tempfile.TemporaryDirectory() as directory:
            service = APP.ProjectAssetService(APP.PaperStore(Path(directory) / "papers.db"))
            groups = {item["label"]: item["files"] for item in service.file_groups(files)}
            entries = service.file_entries(files)
            sections = {item["label"]: [entry["path"] for entry in item["items"]] for item in service.reading_sections(entries)}
            rendered = service._readme_html(
                "# Project\n<script>alert(1)</script>\n[Guide](docs/guide.md)\n<div align=\"center\">\n    <a href=\"https://example.com\">Author</a>\n    ![](assets/demo.png)\n</div>",
                "owner/project", "main", "README.md",
            )
            self.assertIn("README.md", groups["开始阅读"])
            self.assertIn("scripts/train.py", groups["训练与推理"])
            self.assertIn("README.md", sections["从这里开始"])
            self.assertIn("scripts/train.py", sections["运行链路"])
            self.assertEqual(next(item for item in entries if item["path"] == "src/model.py")["language"], "Python")
            self.assertNotIn("<script", rendered)
            self.assertNotIn("alert(1)", rendered)
            self.assertIn("github.com/owner/project/blob/main/docs/guide.md", rendered)
            self.assertIn("raw.githubusercontent.com/owner/project/main/assets/demo.png", rendered)
            self.assertIn('<a href="https://example.com">Author</a>', rendered)
            self.assertNotIn("&lt;a href", rendered)

    def test_daily_project_recommendations_are_capped_at_four(self):
        now = APP.utc_now().isoformat()
        projects = [
            {
                "full_name": f"owner/project-{index}", "description": "embodied AI", "topics": ["embodied-ai"],
                "categories": ["具身智能" if index % 2 else "大语言模型"], "pushed_at": now,
                "stars": 100 - index, "linked_paper_count": index % 3, "language": "Python", "license": "MIT",
                "homepage": "",
            }
            for index in range(8)
        ]

        class FakeStore:
            @staticmethod
            def list_projects():
                return projects

        original_store = APP.STORE
        APP.STORE = FakeStore()
        try:
            result = APP.daily_project_recommendations(10)
        finally:
            APP.STORE = original_store

        self.assertEqual(result["total"], 4)
        self.assertLessEqual(len(result["items"]), 4)
        self.assertIn("score_breakdown", result["items"][0])

    def test_project_source_reader_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            original_repo_dir = APP.PROJECT_REPO_DIR
            APP.PROJECT_REPO_DIR = Path(directory) / "repos"
            try:
                store = APP.PaperStore(Path(directory) / "papers.db")
                assets = APP.ProjectAssetService(store)
                root = assets._repo_path("owner/project")
                root.mkdir(parents=True)
                (root / "main.py").write_text("print('safe')", encoding="utf-8")
                (Path(directory) / "secret.txt").write_text("secret", encoding="utf-8")
                store.save_project_asset(
                    "owner/project",
                    {"local_repo_path": str(root), "file_count": 1, "source_chars": 13},
                )

                source = assets.file("owner/project", "main.py")
                self.assertEqual(source["content"], "print('safe')")
                self.assertEqual(source["language"], "Python")
                self.assertEqual(source["line_count"], 1)
                self.assertIsNone(assets.file("owner/project", "../secret.txt"))
            finally:
                APP.PROJECT_REPO_DIR = original_repo_dir

    def test_connector_normalizes_crossref_metadata(self):
        connector = APP.PaperConnector(APP.STORE, APP.SOURCES, APP.CLASSIFIER)
        paper = connector._crossref_paper(
            {
                "DOI": "10.1000/test",
                "title": ["A Vision-Language-Action Model"],
                "container-title": ["Conference on Robot Learning"],
                "author": [{"given": "Ada", "family": "Lovelace", "affiliation": [{"name": "Tsinghua University"}]}],
                "published": {"date-parts": [[2026, 7, 1]]},
                "URL": "https://doi.org/10.1000/test",
            }
        )

        self.assertEqual(paper["id"], "doi:10.1000/test")
        self.assertEqual(paper["venue"], "CoRL")
        self.assertEqual(paper["authors"], ["Ada Lovelace"])
        self.assertIn("具身智能", paper["topics"])

    def test_project_multi_sort_uses_stars_when_link_counts_match(self):
        projects = [
            {"full_name": "low", "description": "", "topics": [], "categories": [], "language": "", "pushed_at": "2026-01-01", "linked_paper_count": 2, "stars": 10, "forks": 1, "open_issues": 0},
            {"full_name": "high", "description": "", "topics": [], "categories": [], "language": "", "pushed_at": "2025-01-01", "linked_paper_count": 2, "stars": 100, "forks": 1, "open_issues": 0},
            {"full_name": "linked", "description": "", "topics": [], "categories": [], "language": "", "pushed_at": "2024-01-01", "linked_paper_count": 3, "stars": 1, "forks": 1, "open_issues": 0},
        ]

        result = APP.filter_projects(projects, {"sort": ["links"], "sort_secondary": ["stars"]})

        self.assertEqual([item["full_name"] for item in result], ["linked", "high", "low"])

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

    def test_imported_pdf_can_archive_and_restore_from_cloud(self):
        import fitz

        class FakeCloud:
            configured = True
            provider = "Test Cloud"

            def __init__(self):
                self.objects = {}

            def upload(self, path, key, content_type):
                self.objects[key] = path.read_bytes()

            def download(self, key, target):
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(self.objects[key])

        with tempfile.TemporaryDirectory() as directory:
            original_pdf_dir = APP.PDF_DIR
            original_fulltext_dir = APP.FULLTEXT_DIR
            APP.PDF_DIR = Path(directory) / "pdfs"
            APP.FULLTEXT_DIR = Path(directory) / "fulltext"
            try:
                store = APP.PaperStore(Path(directory) / "papers.db")
                assets = APP.PaperAssetService(store, FakeCloud())
                document = fitz.open()
                for _ in range(20):
                    page = document.new_page()
                    page.insert_textbox((72, 72, 520, 760), "Embodied intelligence full text. " * 18)
                pdf_bytes = document.tobytes()
                document.close()

                imported = assets.import_pdf({"id": "paper", "title": "Imported"}, pdf_bytes, "paper.pdf")
                archived = assets.archive_to_cloud("paper", remove_local=True)

                self.assertTrue(imported["fulltext_available"])
                self.assertTrue(archived["cloud_available"])
                self.assertFalse(archived["local_cached"])
                restored = assets.archive_to_cloud("paper", remove_local=False)
                self.assertEqual(restored["storage_mode"], "hybrid")
                self.assertTrue(restored["local_cached"])
            finally:
                APP.PDF_DIR = original_pdf_dir
                APP.FULLTEXT_DIR = original_fulltext_dir

    def test_pdf_url_safety_rejects_local_networks(self):
        self.assertFalse(APP.PaperAssetService._safe_remote_url("http://127.0.0.1/private.pdf"))
        self.assertFalse(APP.PaperAssetService._safe_remote_url("file:///tmp/paper.pdf"))
        self.assertTrue(APP.PaperAssetService._safe_remote_url("https://arxiv.org/pdf/1234.5678"))


if __name__ == "__main__":
    unittest.main()
