import importlib.util
import io
import json
import os
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from datetime import date, timedelta
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock


SPEC = importlib.util.spec_from_file_location(
    "paperfield_app",
    Path(__file__).resolve().parents[1] / "src" / "paperfield" / "app.py",
)
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

    def test_ai_request_falls_back_to_chat_when_responses_is_empty(self):
        class FakeResponse:
            def __init__(self, content):
                self.content = content
                self.headers = {"Content-Type": "application/json"}

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return self.content

        calls = []
        response_payload = json.dumps({"choices": [{"message": {"content": "chat fallback works"}}]}).encode("utf-8")

        def fake_urlopen(request, timeout=0):
            calls.append(request.full_url)
            return FakeResponse(b"" if request.full_url.endswith("/responses") else response_payload)

        connection = {
            "key": "test-key",
            "base_url": "https://example.test/v1",
            "model": "test-model",
            "provider": "test-provider",
            "wire_api": "responses",
        }
        APP.PaperExplainer._wire_preferences.clear()
        with mock.patch.object(APP.urllib.request, "urlopen", side_effect=fake_urlopen):
            output = APP.PaperExplainer._request_text("hello", connection, timeout=3)

        self.assertEqual(output, "chat fallback works")
        self.assertEqual(calls, ["https://example.test/v1/responses", "https://example.test/v1/chat/completions"])

    def test_ai_request_sends_selected_reasoning_effort(self):
        class FakeResponse:
            headers = {"Content-Type": "application/json"}

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({"output_text": "reasoned answer"}).encode("utf-8")

        payloads = []

        def fake_urlopen(request, timeout=0):
            payloads.append(json.loads(request.data.decode("utf-8")))
            return FakeResponse()

        connection = {
            "key": "test-key",
            "base_url": "https://example.test/v1",
            "model": "test-model",
            "provider": "reasoning-test-provider",
            "wire_api": "responses",
            "reasoning_effort": "ultra",
        }
        APP.PaperExplainer._wire_preferences.clear()
        with mock.patch.object(APP.urllib.request, "urlopen", side_effect=fake_urlopen):
            output = APP.PaperExplainer._request_text("hello", connection, timeout=3)

        self.assertEqual(output, "reasoned answer")
        self.assertEqual(payloads[0]["reasoning"], {"effort": "ultra"})

    def test_ai_request_downgrades_unsupported_reasoning_effort(self):
        class FakeResponse:
            headers = {"Content-Type": "application/json"}

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({"output_text": "fallback answer"}).encode("utf-8")

        efforts = []

        def fake_urlopen(request, timeout=0):
            payload = json.loads(request.data.decode("utf-8"))
            effort = payload.get("reasoning", {}).get("effort", "")
            efforts.append(effort)
            if effort == "ultra":
                raise urllib.error.HTTPError(request.full_url, 400, "unsupported effort", {}, io.BytesIO(b"{}"))
            return FakeResponse()

        connection = {
            "key": "test-key",
            "base_url": "https://example.test/v1",
            "model": "test-model",
            "provider": "reasoning-fallback-provider",
            "wire_api": "responses",
            "reasoning_effort": "ultra",
        }
        APP.PaperExplainer._wire_preferences.clear()
        with mock.patch.object(APP.urllib.request, "urlopen", side_effect=fake_urlopen):
            output = APP.PaperExplainer._request_text("hello", connection, timeout=3)

        self.assertEqual(output, "fallback answer")
        self.assertEqual(efforts, ["ultra", "max"])


class FeedTests(unittest.TestCase):
    def test_arxiv_focus_queries_use_updated_date_and_deduplicate(self):
        config = {
            "arxiv_categories": ["cs.RO"],
            "arxiv_focus_queries": ['all:"digital twin"'],
            "arxiv_focus_pages": 2,
            "max_results_per_source": 1,
        }
        classifier = mock.Mock()
        classifier.classify.return_value = ["embodied-ai"]
        classifier.quality.return_value = 80
        source = APP.PaperSources(config, classifier)

        def feed(arxiv_id, title):
            return f"""<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
          <entry>
            <id>https://arxiv.org/abs/{arxiv_id}</id>
            <updated>2026-05-21T08:00:00Z</updated>
            <published>2026-02-10T08:00:00Z</published>
            <title>{title}</title>
            <summary>Digital twin robot learning for real-world manipulation.</summary>
            <author><name>Rui Zhou</name></author>
            <link href="https://arxiv.org/pdf/{arxiv_id}" type="application/pdf" />
          </entry>
        </feed>""".encode()
        requests = []

        def fake_urlopen(request, timeout=0):
            requests.append(request.full_url)
            params = APP.urllib.parse.parse_qs(APP.urllib.parse.urlsplit(request.full_url).query)
            if params["sortBy"] == ["submittedDate"]:
                return io.BytesIO(feed("2602.09023v1", "TwinRL: Digital Twin-Driven Reinforcement Learning"))
            if params["start"] == ["0"]:
                return io.BytesIO(feed("2607.00001v1", "A New Digital Twin Paper"))
            return io.BytesIO(feed("2602.09023v4", "TwinRL: Digital Twin-Driven Reinforcement Learning"))

        with mock.patch.object(APP.urllib.request, "urlopen", side_effect=fake_urlopen), mock.patch.object(
            APP.time, "sleep"
        ) as sleep:
            papers = source.fetch_arxiv()

        self.assertEqual({paper["id"] for paper in papers}, {"arxiv:2602.09023", "arxiv:2607.00001"})
        self.assertEqual(len(requests), 3)
        normal = APP.urllib.parse.parse_qs(APP.urllib.parse.urlsplit(requests[0]).query)
        focused = APP.urllib.parse.parse_qs(APP.urllib.parse.urlsplit(requests[1]).query)
        focused_page_two = APP.urllib.parse.parse_qs(APP.urllib.parse.urlsplit(requests[2]).query)
        self.assertEqual(normal["sortBy"], ["submittedDate"])
        self.assertEqual(focused["sortBy"], ["lastUpdatedDate"])
        self.assertIn('all:"digital twin"', focused["search_query"][0])
        self.assertEqual(focused_page_two["start"], ["1"])
        self.assertEqual(sleep.call_args_list, [mock.call(3), mock.call(3)])

    def test_beta_auth_hashes_password_and_limits_accounts(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "auth-users.json"
            auth = APP.AuthService(path, required=False)
            account = auth.upsert_user("tester-one", "123456", "Tester One", "beta")

            self.assertEqual(account["username"], "tester-one")
            self.assertEqual(account["role"], "beta")
            self.assertEqual(auth.authenticate("tester-one", "123456")["display_name"], "Tester One")
            self.assertIsNone(auth.authenticate("tester-one", "incorrect"))
            self.assertNotIn("123456", path.read_text(encoding="utf-8"))

            for index in range(2, 5):
                auth.upsert_user(f"tester-{index}", "123456")
            with self.assertRaisesRegex(ValueError, "最多允许 4 个"):
                auth.upsert_user("tester-five", "123456")

    def test_beta_auth_protects_api_and_creates_session_cookie(self):
        with tempfile.TemporaryDirectory() as directory:
            auth = APP.AuthService(Path(directory) / "auth-users.json", required=True)
            auth.upsert_user("tester", "123456")
            original_auth = APP.AUTH
            APP.AUTH = auth
            server = ThreadingHTTPServer(("127.0.0.1", 0), APP.AppHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_port}"
            try:
                with self.assertRaises(urllib.error.HTTPError) as denied:
                    urllib.request.urlopen(f"{base}/api/papers", timeout=5)
                self.assertEqual(denied.exception.code, 401)

                request = urllib.request.Request(
                    f"{base}/api/auth/login",
                    data=json.dumps({"username": "tester", "password": "123456"}).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=5) as response:
                    cookie = response.headers["Set-Cookie"].split(";", 1)[0]
                me_request = urllib.request.Request(f"{base}/api/auth/me", headers={"Cookie": cookie})
                with urllib.request.urlopen(me_request, timeout=5) as response:
                    me = json.loads(response.read().decode("utf-8"))
                self.assertEqual(me["user"]["username"], "tester")
                self.assertFalse(me["host_ai_allowed"])

                ai_request = urllib.request.Request(
                    f"{base}/api/papers/test/explain",
                    data=b"{}",
                    headers={"Content-Type": "application/json", "Cookie": cookie},
                    method="POST",
                )
                with self.assertRaises(urllib.error.HTTPError) as denied_ai:
                    urllib.request.urlopen(ai_request, timeout=5)
                self.assertEqual(denied_ai.exception.code, 403)
                ai_payload = json.loads(denied_ai.exception.read().decode("utf-8"))
                self.assertTrue(ai_payload["local_ai_required"])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)
                APP.AUTH = original_auth

    def test_cloud_can_be_explicitly_disabled_for_beta_profile(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.dict(
            os.environ,
            {
                "PAPERFIELD_DISABLE_CLOUD": "1",
                "PAPERFIELD_S3_BUCKET": "personal-bucket",
                "PAPERFIELD_S3_ACCESS_KEY_ID": "personal-key",
                "PAPERFIELD_S3_SECRET_ACCESS_KEY": "personal-secret",
            },
        ):
            cloud = APP.S3ObjectStorage(APP.PaperStore(Path(directory) / "papers.db"))
            self.assertFalse(cloud.configured)
            self.assertEqual(cloud.bucket, "")

    def test_weekly_candidate_rotation_is_stable_and_changes_next_week(self):
        ranked = [(100 - index, {"id": f"paper-{index}"}, {}, None) for index in range(35)]
        this_week = date(2026, 7, 6)
        first = APP.rotate_daily_candidates(ranked, 5, "具身智能", this_week)[:5]
        repeated = APP.rotate_daily_candidates(ranked, 5, "具身智能", this_week)[:5]
        next_week = APP.rotate_daily_candidates(ranked, 5, "具身智能", this_week + timedelta(days=7))[:5]
        self.assertEqual([item[1]["id"] for item in first], [item[1]["id"] for item in repeated])
        self.assertTrue({item[1]["id"] for item in first}.isdisjoint({item[1]["id"] for item in next_week}))

    def test_weekly_preparation_round_robins_topics_and_generates_fulltext_explanations(self):
        recommendations = {
            "rotation_week_start": "2026-07-06",
            "rotation_week_end": "2026-07-12",
            "groups": [
                {"items": [{"id": "a1", "title": "A1"}, {"id": "a2", "title": "A2"}]},
                {"items": [{"id": "b1", "title": "B1"}, {"id": "b2", "title": "B2"}]},
            ],
        }

        class FakeStore:
            def __init__(self):
                self.papers = {paper_id: {"id": paper_id, "title": paper_id, "explanation": None} for paper_id in ("a1", "b1")}

            def get_paper(self, paper_id):
                return self.papers[paper_id]

            def save_explanation(self, paper_id, explanation):
                self.papers[paper_id]["explanation"] = explanation

        class FakeAssets:
            def prepare(self, paper):
                return {"pdf_available": True, "fulltext_available": True, "provider": "arXiv", "page_count": 12}

            def fulltext(self, paper_id):
                return f"full text for {paper_id}"

            def reading_notes(self, paper_id, fulltext):
                return None

            def save_reading_notes(self, paper_id, fulltext, notes):
                pass

        class FakeExplainer:
            def connection(self):
                return {"provider": "test"}

            def explain(self, paper, fulltext, notes, callback):
                callback([{"method": [paper["id"]]}])
                return {"mode": "ai", "reading_basis": "fulltext", "provider": "test", "model": "test-model"}

        class FakeArchive:
            def __init__(self):
                self.paper_ids = []

            def backup_paper_async(self, paper_id):
                self.paper_ids.append(paper_id)

        with tempfile.TemporaryDirectory() as directory:
            store = FakeStore()
            archive = FakeArchive()
            service = APP.WeeklyPreparationService(
                store,
                FakeAssets(),
                FakeExplainer(),
                archive,
                {
                    "weekly_preparation_enabled": True,
                    "weekly_pdf_preparation_max_papers": 2,
                    "weekly_explanation_preparation_max_papers": 2,
                    "weekly_preparation_delay_seconds": 0,
                },
                Path(directory) / "weekly.json",
                lambda: recommendations,
            )
            result = service.run(recommendations)

        self.assertEqual([paper["id"] for paper in service.candidates(recommendations)], ["a1", "b1", "a2", "b2"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["pdf_ready"], 2)
        self.assertEqual(result["explanation_ready"], 2)
        self.assertEqual(archive.paper_ids, ["a1", "b1"])

    def test_weekly_selection_stays_frozen_when_asset_scores_change(self):
        today = APP.utc_now().date()
        week_start = today - timedelta(days=today.weekday())
        calls = []

        class FakeStore:
            def list_papers(self):
                return [
                    {
                        "id": paper_id,
                        "title": paper_id,
                        "topics": ["topic"],
                        "pdf_url": f"https://arxiv.org/pdf/2607.0000{index}",
                    }
                    for index, paper_id in enumerate(("a", "b", "c"), start=1)
                ]

            def assets_for_papers(self, paper_ids):
                return {"a": {"local_pdf_path": "cached.pdf", "text_chars": 10000}}

        def ranking_loader(topic, per_topic):
            calls.append(len(calls))
            ids = ("a", "b") if len(calls) == 1 else ("c", "b")
            items = [
                {
                    "id": paper_id,
                    "recommendation_topic": "topic",
                    "recommendation_score": 90 - index,
                    "score_breakdown": [],
                }
                for index, paper_id in enumerate(ids)
            ]
            return {
                "groups": [{"topic": "topic", "items": items}],
                "window_days": 45,
                "rotation_week_start": week_start.isoformat(),
                "rotation_week_end": (week_start + timedelta(days=6)).isoformat(),
            }

        with tempfile.TemporaryDirectory() as directory:
            service = APP.WeeklySelectionService(
                FakeStore(),
                {"daily_recommendations_per_topic": 2, "recommendation_window_days": 45},
                Path(directory) / "selection.json",
                ranking_loader,
            )
            first = service.get()
            repeated = service.get()
            rebuilt = service.rebuild()

        self.assertEqual([paper["id"] for paper in first["items"]], ["a", "b"])
        self.assertEqual([paper["id"] for paper in repeated["items"]], ["a", "b"])
        self.assertEqual([paper["id"] for paper in rebuilt["items"]], ["c", "b"])
        self.assertEqual(len(calls), 2)
        self.assertTrue(first["items"][0]["fulltext_cached"])

    def test_weekly_selection_uses_public_reserves_when_primary_pdf_is_unavailable(self):
        today = APP.utc_now().date()
        week_start = today - timedelta(days=today.weekday())

        class FakeStore:
            def list_papers(self):
                return [
                    {"id": "blocked", "title": "Blocked", "topics": ["topic"], "pdf_url": "https://publisher.example/blocked.pdf"},
                    {"id": "reserve", "title": "Reserve", "topics": ["topic"], "pdf_url": "https://arxiv.org/pdf/2607.12345"},
                ]

            def assets_for_papers(self, paper_ids):
                return {"blocked": {"access_status": "unavailable"}}

        def ranking_loader(topic, per_topic):
            return {
                "groups": [{
                    "topic": "topic",
                    "items": [{"id": "blocked", "recommendation_topic": "topic", "recommendation_score": 95, "score_breakdown": []}],
                    "reserves": [{"id": "reserve", "recommendation_topic": "topic", "recommendation_score": 90, "score_breakdown": []}],
                }],
                "window_days": 45,
                "rotation_week_start": week_start.isoformat(),
                "rotation_week_end": (week_start + timedelta(days=6)).isoformat(),
            }

        with tempfile.TemporaryDirectory() as directory:
            service = APP.WeeklySelectionService(
                FakeStore(),
                {"daily_recommendations_per_topic": 1, "recommendation_window_days": 45},
                Path(directory) / "selection.json",
                ranking_loader,
            )
            selection = service.get()

        self.assertEqual([paper["id"] for paper in selection["items"]], ["reserve"])
        self.assertEqual(
            [paper["id"] for paper in APP.WeeklyPreparationService.candidates(selection)],
            ["blocked", "reserve"],
        )

    def test_runtime_settings_persist_pdf_directory_cache_and_billing_day(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            settings = APP.RuntimeSettings(root / "settings.json")
            saved = settings.update(
                {
                    "pdf_storage_mode": "hybrid",
                    "local_pdf_dir": str(root / "library"),
                    "local_cache_max_mb": 4096,
                    "shared_storage_max_mb": 3072,
                    "r2_billing_cycle_day": 11,
                    "ai_reasoning_effort": "ultra",
                },
                cloud_configured=True,
            )
            loaded = APP.RuntimeSettings(root / "settings.json").get()
            self.assertEqual(saved, loaded)
            self.assertTrue((root / "library").is_dir())
            self.assertEqual(loaded["shared_storage_max_mb"], 3072)
            self.assertEqual(loaded["r2_billing_cycle_day"], 11)
            self.assertEqual(loaded["ai_reasoning_effort"], "ultra")
            weights = settings.update_recommendation_weights(
                {
                    "academic": 20,
                    "relevance": 40,
                    "freshness": 15,
                    "evidence": 15,
                    "impact_reproducibility": 10,
                }
            )
            self.assertEqual(weights["relevance"], 40)
            self.assertEqual(APP.RuntimeSettings(root / "settings.json").get()["recommendation_weights"], weights)
            decimal_weights = settings.update_recommendation_weights(
                {
                    "academic": 20.5,
                    "relevance": 39.5,
                    "freshness": 15,
                    "evidence": 15,
                    "impact_reproducibility": 10,
                }
            )
            self.assertEqual(decimal_weights["academic"], 20.5)
            self.assertEqual(sum(decimal_weights.values()), 100)
            self.assertEqual(settings.update_ai_model_override("gpt-test-model"), "gpt-test-model")
            self.assertEqual(APP.RuntimeSettings(root / "settings.json").get()["ai_model_override"], "gpt-test-model")
            self.assertEqual(settings.update_ai_model_override(""), "")
            with self.assertRaisesRegex(ValueError, "之和必须等于 100"):
                settings.update_recommendation_weights({**weights, "academic": 21})

    def test_public_pdf_access_prefers_verified_and_arxiv_candidates(self):
        verified = APP.public_pdf_access({"id": "paper", "pdf_url": ""}, {"local_pdf_path": "cached.pdf"})
        self.assertEqual(verified["state"], "verified")
        self.assertEqual(verified["priority"], 3)

        arxiv = APP.public_pdf_access({"id": "arxiv:2607.12345", "pdf_url": ""})
        self.assertEqual(arxiv["state"], "source")
        self.assertEqual(arxiv["priority"], 2)

        unavailable = APP.public_pdf_access(
            {"id": "paper", "pdf_url": "https://openaccess.thecvf.com/content.pdf"},
            {"access_status": "unavailable"},
        )
        self.assertEqual(unavailable["state"], "unavailable")

    def test_pdf_resolver_discovers_arxiv_from_semantic_scholar_title_match(self):
        with tempfile.TemporaryDirectory() as directory:
            store = APP.PaperStore(Path(directory) / "papers.db")
            assets = APP.PaperAssetService(store, APP.S3ObjectStorage(store), APP.RuntimeSettings(Path(directory) / "settings.json"))

            def request_json(url):
                if "api.openalex.org" in url:
                    return {"results": []}
                if "api.semanticscholar.org" in url:
                    return {
                        "data": [
                            {
                                "title": "A Public Preprint",
                                "openAccessPdf": None,
                                "externalIds": {"ArXiv": "2607.12345"},
                            }
                        ]
                    }
                raise AssertionError(url)

            paper = {"id": "paper", "title": "A Public Preprint", "doi": "", "source_url": "", "pdf_url": ""}
            with mock.patch.object(APP.PaperAssetService, "_request_json", side_effect=request_json):
                candidates = assets.candidate_urls(paper)

        self.assertIn("https://arxiv.org/pdf/2607.12345", [url for url, _ in candidates])

    def test_pdf_cache_removal_tolerates_open_windows_file(self):
        locked = mock.Mock()
        locked.unlink.side_effect = PermissionError("in use")
        self.assertFalse(APP.PaperAssetService._try_remove(locked))

        removable = mock.Mock()
        removable.exists.return_value = False
        self.assertTrue(APP.PaperAssetService._try_remove(removable))
        removable.unlink.assert_called_once_with(missing_ok=True)

    def test_cloud_pdf_restore_is_single_flight_for_concurrent_reader_requests(self):
        class FakeCloud:
            configured = True

            def __init__(self):
                self.calls = 0
                self.started = threading.Event()
                self.release = threading.Event()

            def download(self, key, target):
                self.calls += 1
                self.started.set()
                self.release.wait(3)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b"%PDF-restored")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = APP.PaperStore(root / "papers.db")
            settings = APP.RuntimeSettings(root / "settings.json")
            settings.update({"local_pdf_dir": str(root / "pdfs")}, cloud_configured=True)
            cloud = FakeCloud()
            assets = APP.PaperAssetService(store, cloud, settings)
            store.save_asset("paper", {"cloud_pdf_key": "papers/paper.pdf", "storage_mode": "cloud"})
            results = []
            errors = []

            def restore():
                try:
                    results.append(assets.pdf_path("paper"))
                except Exception as error:
                    errors.append(error)

            first = threading.Thread(target=restore)
            second = threading.Thread(target=restore)
            first.start()
            self.assertTrue(cloud.started.wait(2))
            second.start()
            time.sleep(0.05)
            cloud.release.set()
            first.join(3)
            second.join(3)

            self.assertFalse(errors)
            self.assertEqual(cloud.calls, 1)
            self.assertEqual(len(results), 2)
            self.assertTrue(all(path and path.exists() for path in results))

    def test_page_image_renders_cached_pdf_as_jpeg(self):
        import fitz

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = APP.PaperStore(root / "papers.db")
            settings = APP.RuntimeSettings(root / "settings.json")
            settings.update({"local_pdf_dir": str(root / "pdfs")}, cloud_configured=True)
            assets = APP.PaperAssetService(store, APP.S3ObjectStorage(store), settings)
            pdf_path = settings.pdf_dir / "paper.pdf"
            document = fitz.open()
            page = document.new_page()
            page.insert_text((72, 72), "A compatible PDF page.")
            document.save(pdf_path)
            document.close()
            store.save_asset("paper", {"local_pdf_path": str(pdf_path), "storage_mode": "local"})

            image = assets.page_image("paper", 1)

            self.assertTrue(image and image.startswith(b"\xff\xd8\xff"))
            self.assertIsNone(assets.page_image("paper", 2))

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

    def test_cloud_namespace_isolates_shared_objects_and_enforces_limit(self):
        class FakeBody(io.BytesIO):
            pass

        class FakeClient:
            def __init__(self):
                self.objects = {}

            def put_object(self, Bucket, Key, Body, ContentType):
                self.objects[Key] = Body.read() if hasattr(Body, "read") else Body

            def get_object(self, Bucket, Key):
                return {"Body": FakeBody(self.objects[Key])}

            def list_objects_v2(self, **options):
                prefix = options.get("Prefix", "")
                return {
                    "IsTruncated": False,
                    "Contents": [
                        {"Key": key, "Size": len(value)}
                        for key, value in self.objects.items()
                        if key.startswith(prefix)
                    ],
                }

        with tempfile.TemporaryDirectory() as directory, mock.patch.dict(
            os.environ,
            {
                "PAPERFIELD_DISABLE_CLOUD": "0",
                "PAPERFIELD_S3_BUCKET": "test",
                "PAPERFIELD_S3_ENDPOINT": "https://example.r2.cloudflarestorage.com",
                "PAPERFIELD_S3_ACCESS_KEY_ID": "key",
                "PAPERFIELD_S3_SECRET_ACCESS_KEY": "secret",
                "PAPERFIELD_CLOUD_PREFIX": "community-beta",
                "PAPERFIELD_SHARED_STORAGE_MAX_MB": "128",
            },
        ):
            store = APP.PaperStore(Path(directory) / "papers.db")
            cloud = APP.S3ObjectStorage(store)
            cloud._client_value = FakeClient()
            cloud.upload_bytes(b"test", "papers/example/paper.pdf", "application/pdf")

            self.assertIn("community-beta/papers/example/paper.pdf", cloud._client_value.objects)
            self.assertTrue(store.has_cloud_object("papers/example/paper.pdf"))
            self.assertEqual(cloud.download_bytes("papers/example/paper.pdf"), b"test")
            inventory = cloud.refresh_inventory()
            self.assertEqual(inventory["object_count"], 1)
            self.assertEqual(inventory["total_bytes"], 4)

            cloud.shared_storage_limit_bytes = 4
            with self.assertRaisesRegex(RuntimeError, "共享云端资料库"):
                cloud.upload_bytes(b"larger", "papers/example/paper.pdf", "application/pdf")
            with self.assertRaisesRegex(ValueError, "对象路径"):
                cloud.remote_key("../private")

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
            expected_chat = []
            for index in range(14):
                question = f"question-{index}"
                answer = f"answer-{index}"
                store.add_chat_message("paper", "user", question)
                store.add_chat_message("paper", "assistant", answer)
                expected_chat.extend([question, answer])
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
            self.assertEqual(
                [item["content"] for item in store.chat_history("paper", 0)],
                expected_chat,
            )

    def test_project_workspace_groups_files_and_sanitizes_readme(self):
        files = [
            "README.md", "CHANGELOG.md", "CONTRIBUTING.md", "docs/guide.md",
            "src/model.py", "scripts/train.py", "configs/base.yaml", "tests/test_model.py",
        ]
        with tempfile.TemporaryDirectory() as directory:
            service = APP.ProjectAssetService(APP.PaperStore(Path(directory) / "papers.db"))
            groups = {item["label"]: item["files"] for item in service.file_groups(files)}
            entries = service.file_entries(files)
            sections = {item["label"]: [entry["path"] for entry in item["items"]] for item in service.reading_sections(entries)}
            important = [item["path"] for item in service.important_documents(entries)]
            rendered = service._readme_html(
                "# Project\n<script>alert(1)</script>\n[Guide](docs/guide.md)\n<div align=\"center\">\n    <a href=\"https://example.com\">Author</a>\n    ![](assets/demo.png)\n</div>",
                "owner/project", "main", "README.md",
            )
            self.assertIn("README.md", groups["开始阅读"])
            self.assertIn("scripts/train.py", groups["训练与推理"])
            self.assertIn("README.md", sections["从这里开始"])
            self.assertIn("scripts/train.py", sections["运行链路"])
            self.assertIn("README.md", important)
            self.assertIn("CHANGELOG.md", important)
            self.assertIn("CONTRIBUTING.md", important)
            self.assertTrue(all(item["important_document"] for item in entries if item["path"].endswith(".md")))
            self.assertFalse(next(item for item in entries if item["path"] == "src/model.py")["important_document"])
            self.assertEqual(next(item for item in entries if item["path"] == "src/model.py")["language"], "Python")
            self.assertNotIn("<script", rendered)
            self.assertNotIn("alert(1)", rendered)
            self.assertIn("github.com/owner/project/blob/main/docs/guide.md", rendered)
            self.assertIn("raw.githubusercontent.com/owner/project/main/assets/demo.png", rendered)
            self.assertIn('<a href="https://example.com">Author</a>', rendered)
            self.assertNotIn("&lt;a href", rendered)

    def test_html_translation_preserves_code_and_document_structure(self):
        class FakeTranslator:
            @staticmethod
            def translate(text, source="en", target="zh"):
                return {
                    "text": text.replace("Hello world", "你好，世界").replace("Run the model", "运行模型"),
                    "provider": "test",
                }

        document = APP.TranslatableHtml()
        document.feed(
            "<h1>Hello world</h1>"
            "<pre><code>pip install package</code></pre>"
            "<p>Run the model</p>"
        )
        rendered, provider = document.translated_html(FakeTranslator(), "zh")
        self.assertIn("<h1>你好，世界</h1>", rendered)
        self.assertIn("<code>pip install package</code>", rendered)
        self.assertIn("<p>运行模型</p>", rendered)
        self.assertEqual(provider, "test")

    def test_project_document_translation_restores_from_cloud_cache(self):
        class FakeAssets:
            @staticmethod
            def file(full_name, path):
                return {
                    "content": "# Hello world",
                    "rendered_html": "<h1>Hello world</h1><pre><code>pip install package</code></pre>",
                    "important_document": True,
                }

        class FakeTranslator:
            def __init__(self):
                self.calls = 0

            def translate(self, text, source="en", target="zh"):
                self.calls += 1
                return {"text": text.replace("Hello world", "你好，世界"), "provider": "test"}

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
            original_translation_dir = APP.PROJECT_DOC_TRANSLATION_DIR
            APP.PROJECT_DOC_TRANSLATION_DIR = Path(directory) / "translations"
            try:
                store = APP.PaperStore(Path(directory) / "papers.db")
                cloud = FakeCloud(store)
                translator = FakeTranslator()
                service = APP.ProjectDocumentTranslationService(store, cloud, FakeAssets(), translator)
                generated = service.translate("owner/project", "README.md", "zh")
                service._local_path("owner/project", "README.md", "zh").unlink()
                restored = service.translate("owner/project", "README.md", "zh")

                self.assertFalse(generated["cached"])
                self.assertTrue(generated["cloud_backed_up"])
                self.assertTrue(restored["cached"])
                self.assertTrue(restored["cloud_backed_up"])
                self.assertIn("<h1>你好，世界</h1>", restored["html"])
                self.assertEqual(translator.calls, 1)
            finally:
                APP.PROJECT_DOC_TRANSLATION_DIR = original_translation_dir

    def test_weekly_project_recommendations_are_stable_capped_and_rotate(self):
        week_start = date(2026, 7, 6)
        pushed_at = f"{(week_start - timedelta(days=1)).isoformat()}T12:00:00+00:00"
        projects = [
            {
                "full_name": f"owner/project-{index}", "description": "embodied AI", "topics": ["embodied-ai"],
                "categories": ["具身智能" if index % 2 else "大语言模型"], "pushed_at": pushed_at,
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
            result = APP.weekly_project_recommendations(10, week_start)
            repeated = APP.weekly_project_recommendations(10, week_start)
            next_week = APP.weekly_project_recommendations(10, week_start + timedelta(days=7))
        finally:
            APP.STORE = original_store

        self.assertEqual(result["total"], 4)
        self.assertLessEqual(len(result["items"]), 4)
        self.assertIn("score_breakdown", result["items"][0])
        self.assertEqual(result["rotation_week_start"], "2026-07-06")
        self.assertEqual(
            [item["full_name"] for item in result["items"]],
            [item["full_name"] for item in repeated["items"]],
        )
        self.assertNotEqual(
            [item["full_name"] for item in result["items"]],
            [item["full_name"] for item in next_week["items"]],
        )

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

    def test_project_prepare_returns_immediately_and_finishes_in_background(self):
        with tempfile.TemporaryDirectory() as directory:
            original_repo_dir = APP.PROJECT_REPO_DIR
            APP.PROJECT_REPO_DIR = Path(directory) / "repos"
            started = threading.Event()
            release = threading.Event()
            try:
                store = APP.PaperStore(Path(directory) / "papers.db")
                assets = APP.ProjectAssetService(store)
                project = {
                    "full_name": "owner/project",
                    "default_branch": "main",
                    "description": "test repository",
                    "language": "Python",
                    "stars": 0,
                    "linked_paper_count": 0,
                    "papers": [],
                }

                def fake_download(_project, target):
                    target.mkdir(parents=True, exist_ok=True)
                    (target / "README.md").write_text("# Test repository", encoding="utf-8")
                    (target / "main.py").write_text("print('ready')", encoding="utf-8")
                    started.set()
                    self.assertTrue(release.wait(3))
                    return 2, 31, str(target / "README.md")

                with mock.patch.object(assets, "_download", side_effect=fake_download):
                    initial = assets.prepare(project)
                    self.assertTrue(started.wait(2))
                    self.assertTrue(initial["preparing"])
                    self.assertFalse(initial["ready"])
                    release.set()
                    deadline = time.monotonic() + 3
                    finished = assets.workspace(project)
                    while finished["preparing"] and time.monotonic() < deadline:
                        time.sleep(0.03)
                        finished = assets.workspace(project)

                self.assertTrue(finished["ready"])
                self.assertFalse(finished["preparing"])
                self.assertEqual(finished["readme_path"], "README.md")
                self.assertIn("# Test repository", finished["readme"])
            finally:
                APP.PROJECT_REPO_DIR = original_repo_dir

    def test_large_project_skips_full_archive_before_network_download(self):
        with tempfile.TemporaryDirectory() as directory:
            original_repo_dir = APP.PROJECT_REPO_DIR
            APP.PROJECT_REPO_DIR = Path(directory) / "repos"
            try:
                assets = APP.ProjectAssetService(APP.PaperStore(Path(directory) / "papers.db"))
                project = {"full_name": "owner/project", "default_branch": "main", "size_kb": 97 * 1024}
                with mock.patch.object(APP.urllib.request, "urlopen") as request:
                    with self.assertRaisesRegex(ValueError, "超过完整压缩包抓取阈值"):
                        assets._download_archive(project, assets._repo_path(project["full_name"]))
                request.assert_not_called()
            finally:
                APP.PROJECT_REPO_DIR = original_repo_dir

    def test_project_download_uses_selective_fallback_after_archive_error(self):
        with tempfile.TemporaryDirectory() as directory:
            original_repo_dir = APP.PROJECT_REPO_DIR
            APP.PROJECT_REPO_DIR = Path(directory) / "repos"
            try:
                assets = APP.ProjectAssetService(APP.PaperStore(Path(directory) / "papers.db"))
                project = {"full_name": "owner/project", "default_branch": "main"}
                expected = (3, 120, "README.md")
                with mock.patch.object(assets, "_download_archive", side_effect=TimeoutError("slow")):
                    with mock.patch.object(assets, "_download_selective", return_value=expected) as selective:
                        self.assertEqual(assets._download(project, assets._repo_path(project["full_name"])), expected)
                selective.assert_called_once()
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

    def test_paper_sort_only_scores_when_recommendation_is_used(self):
        self.assertFalse(APP.paper_sort_requires_recommendation_score({"sort": ["quality"]}))
        self.assertFalse(APP.paper_sort_requires_recommendation_score({"sort": ["date"], "sort_secondary": ["quality"]}))
        self.assertTrue(APP.paper_sort_requires_recommendation_score({"sort": ["recommendation"]}))
        self.assertTrue(APP.paper_sort_requires_recommendation_score({"sort": ["citations"]}))
        self.assertTrue(
            APP.paper_sort_requires_recommendation_score(
                {"sort": ["quality"], "sort_secondary": ["recommendation"]}
            )
        )

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

    def test_author_suggestions_are_loaded_on_demand(self):
        with tempfile.TemporaryDirectory() as directory:
            store = APP.PaperStore(Path(directory) / "papers.db")
            base = {
                "title": "Embodied paper", "abstract": "robot learning", "institutions": [],
                "venue": "CoRL", "published": "2026-01-01", "updated": "2026-01-01",
                "source": "test", "source_url": "https://example.com", "pdf_url": "", "doi": "",
                "journal_ref": "", "topics": ["具身智能"], "quality_score": 50, "citation_count": 0,
            }
            store.upsert({**base, "id": "paper-1", "authors": ["Ada Lovelace", "Grace Hopper"]})
            store.upsert({**base, "id": "paper-2", "title": "Language model", "authors": ["Adam Smith"]})

            self.assertEqual(store.author_suggestions("a"), [])
            self.assertEqual(store.author_suggestions("lov"), ["Ada Lovelace"])
            self.assertEqual(store.author_suggestions("ad"), ["Ada Lovelace", "Adam Smith"])

    def test_papers_by_ids_avoids_loading_unrelated_records(self):
        with tempfile.TemporaryDirectory() as directory:
            store = APP.PaperStore(Path(directory) / "papers.db")
            base = {
                "title": "Embodied paper", "abstract": "robot learning", "authors": ["Researcher"], "institutions": [],
                "venue": "CoRL", "published": "2026-01-01", "updated": "2026-01-01",
                "source": "test", "source_url": "https://example.com", "pdf_url": "", "doi": "",
                "journal_ref": "", "topics": ["具身智能"], "quality_score": 50, "citation_count": 0,
            }
            store.upsert({**base, "id": "paper-1"})
            store.upsert({**base, "id": "paper-2", "title": "Language model"})

            selected = store.papers_by_ids(["paper-2", "missing", "paper-2"])

            self.assertEqual(list(selected), ["paper-2"])
            self.assertEqual(selected["paper-2"]["title"], "Language model")

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
