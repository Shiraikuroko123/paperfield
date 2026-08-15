import json
import tempfile
import threading
import unittest
import urllib.parse
import urllib.request
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

from src.research_atlas import app as atlas
from src.research_atlas import scanner


def atom_feed(
    arxiv_id="2608.01234v2",
    title="Grounded Action Models for Generalist Robot Manipulation",
    published="2026-08-09T10:00:00Z",
    updated="2026-08-10T12:30:00Z",
    doi="10.1000/atlas.test",
    summary="We evaluate a robot policy on documented manipulation tasks.",
):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>https://arxiv.org/abs/{arxiv_id}</id>
    <updated>{updated}</updated>
    <published>{published}</published>
    <title>{title}</title>
    <summary>{summary}</summary>
    <author><name>Ada Researcher</name></author>
    <author><name>Bo Scientist</name></author>
    <arxiv:doi>{doi}</arxiv:doi>
    <arxiv:primary_category term="cs.RO" />
    <category term="cs.RO" />
    <category term="cs.AI" />
  </entry>
</feed>""".encode("utf-8")


def rss_feed():
    return b"""<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
  <channel>
    <title>cs.RO updates on arXiv.org</title>
    <item>
      <title>Learning a Generalist Robot Policy for Dexterous Manipulation</title>
      <link>https://arxiv.org/abs/2608.07777</link>
      <description>arXiv:2608.07777v1 Announce Type: new Abstract: We study robot learning for dexterous manipulation.</description>
      <guid isPermaLink="false">oai:arXiv.org:2608.07777v1</guid>
      <category>cs.RO</category>
      <category>cs.AI</category>
      <pubDate>Tue, 11 Aug 2026 00:00:00 -0400</pubDate>
      <dc:creator>Ada Researcher, Bo Scientist</dc:creator>
    </item>
    <item>
      <title>Classical actuator calibration without learning</title>
      <link>https://arxiv.org/abs/2608.07778</link>
      <description>arXiv:2608.07778v1 Announce Type: new Abstract: A calibration procedure.</description>
      <guid isPermaLink="false">oai:arXiv.org:2608.07778v1</guid>
      <category>cs.RO</category>
      <pubDate>Tue, 11 Aug 2026 00:00:00 -0400</pubDate>
    </item>
  </channel>
</rss>"""


def official_feed():
    return b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Atlas Lab</title>
    <item>
      <title>World models for robot manipulation</title>
      <link>https://research.example/updates/world-model-robot</link>
      <description>We release a robot learning project and link arXiv:2608.01234.</description>
      <guid>atlas-world-model-robot</guid>
      <pubDate>Tue, 11 Aug 2026 08:00:00 +0000</pubDate>
    </item>
    <item>
      <title>Reagent calibration for imaging</title>
      <link>https://research.example/updates/reagent-calibration</link>
      <description>An unrelated imaging operations note.</description>
      <guid>atlas-gradient</guid>
      <pubDate>Tue, 11 Aug 2026 07:00:00 +0000</pubDate>
    </item>
    <item>
      <title>Robot policy hosted elsewhere</title>
      <link>https://untrusted.example/robot-policy</link>
      <description>A robot policy announcement.</description>
      <guid>atlas-external</guid>
      <pubDate>Tue, 11 Aug 2026 06:00:00 +0000</pubDate>
    </item>
  </channel>
</rss>"""


def official_spec():
    return scanner.OfficialFeedSpec(
        key="atlas_lab",
        label="Atlas Lab",
        url="https://research.example/feed.xml",
        article_hosts=("research.example",),
        domains=("embodied", "llm"),
    )


class AtlasScannerParsingTests(unittest.TestCase):
    def test_arxiv_atom_parser_preserves_version_provenance_and_hash(self):
        candidate = scanner.parse_arxiv_feed(atom_feed(), scanner.DEFAULT_QUERY_SPECS[0])[0]

        self.assertEqual(candidate["sourceIdentifier"], "2608.01234")
        self.assertEqual(candidate["paper"]["version"], "v2")
        self.assertEqual(candidate["paper"]["authors"], ["Ada Researcher", "Bo Scientist"])
        self.assertEqual(candidate["categories"], ["cs.RO", "cs.AI"])
        self.assertEqual(len(candidate["payloadSha256"]), 64)
        self.assertEqual(candidate["sourceBasis"], "abstract")
        self.assertEqual(candidate["paper"]["sourceUrl"], "https://arxiv.org/abs/2608.01234v2")

    def test_query_url_has_bounded_date_window_and_domain_categories(self):
        start = datetime(2026, 8, 1, tzinfo=timezone.utc)
        end = datetime(2026, 8, 11, tzinfo=timezone.utc)
        url = scanner.ArxivClient.request_url(scanner.DEFAULT_QUERY_SPECS[0], start, end, 25)
        params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)

        self.assertEqual(params["max_results"], ["25"])
        self.assertIn("cat:cs.RO", params["search_query"][0])
        self.assertIn("submittedDate:[202608010000 TO 202608110000]", params["search_query"][0])

    def test_official_rss_fallback_is_keyword_filtered_and_labeled(self):
        candidates = scanner.parse_arxiv_rss(rss_feed(), scanner.DEFAULT_QUERY_SPECS[0])
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["sourceIdentifier"], "2608.07777")
        self.assertEqual(candidates[0]["paper"]["version"], "v1")
        self.assertEqual(candidates[0]["paper"]["authors"], ["Ada Researcher, Bo Scientist"])
        self.assertEqual(candidates[0]["sourceUpdatedAt"], "2026-08-11T04:00:00+00:00")

    def test_api_failure_falls_back_to_official_rss_with_provenance(self):
        timeouts = []

        def fetcher(url, timeout):
            timeouts.append(timeout)
            if "export.arxiv.org" in url:
                raise scanner.SourceError("arXiv API 返回 HTTP 429")
            return rss_feed()

        client = scanner.ArxivClient(fetcher=fetcher, sleeper=lambda _seconds: None)
        batch = client.fetch(
            scanner.DEFAULT_QUERY_SPECS[0],
            datetime(2026, 8, 1, tzinfo=timezone.utc),
            datetime(2026, 8, 11, 13, tzinfo=timezone.utc),
            20,
            45,
        )
        self.assertEqual(batch.transport, "rss")
        self.assertIn("HTTP 429", batch.fallback_reason)
        self.assertEqual(batch.request_url, "https://rss.arxiv.org/rss/cs.RO")
        self.assertEqual(len(batch.candidates), 1)
        self.assertEqual(timeouts, [12, 45])

    def test_official_feed_is_host_bounded_keyword_filtered_and_provenanced(self):
        batch = scanner.parse_official_feed(
            official_feed(),
            official_spec(),
            scanner.DEFAULT_QUERY_SPECS,
        )

        self.assertEqual(batch.fetched_count, 3)
        self.assertEqual(len(batch.candidates), 1)
        candidate = batch.candidates[0]
        self.assertEqual(candidate["sourceKind"], "first_party")
        self.assertEqual(candidate["sourceLabel"], "Atlas Lab")
        self.assertEqual(candidate["domains"], ["embodied"])
        self.assertEqual(candidate["relatedPaperRefs"], ["arxiv:2608.01234"])
        self.assertEqual(len(candidate["sourceIdentifier"]), 64)
        self.assertEqual(len(candidate["payloadSha256"]), 64)

    def test_term_extraction_preserves_author_definition_context(self):
        candidate = scanner.parse_arxiv_feed(
            atom_feed(
                title="JEPA-WAM: Learning Vision-Language-Action Policies with Joint-Embedding World Modeling",
                summary="Video-generation world action models (WAMs) are expensive. We introduce JEPA-WAM for robot control.",
                doi="",
            ),
            scanner.DEFAULT_QUERY_SPECS[0],
        )[0]
        terms = {item["displayTerm"]: item for item in scanner.extract_term_candidates(candidate)}

        self.assertEqual(terms["WAM"]["expansion"], "world action models")
        self.assertEqual(terms["WAM"]["extractionRule"], "explicit_acronym")
        self.assertIn("world action models (WAMs)", terms["WAM"]["contextText"])
        self.assertEqual(terms["JEPA-WAM"]["termKind"], "coined_name")
        self.assertNotIn("Vision-Language-Action", terms)


class AtlasScannerStoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = Path(self.directory.name) / "atlas.db"
        self.store = atlas.AtlasStore(self.database)

    def tearDown(self):
        self.directory.cleanup()

    def config(self, specs=scanner.DEFAULT_QUERY_SPECS):
        return scanner.ScannerConfig(
            database=self.database,
            query_specs=tuple(specs),
            days_back=14,
            max_results=20,
            timeout_seconds=10,
            request_delay_seconds=0,
            interval_seconds=3600,
        )

    def test_scanner_deduplicates_domains_and_records_unchanged_runs(self):
        calls = []

        def fetcher(url, timeout):
            calls.append((url, timeout))
            return atom_feed()

        runner = scanner.FrontierScanner(
            self.config(),
            store=self.store,
            client=scanner.ArxivClient(fetcher=fetcher, sleeper=lambda _seconds: None),
            sleeper=lambda _seconds: None,
        )
        now = datetime(2026, 8, 11, 13, 0, tzinfo=timezone.utc)
        first = runner.scan_once(now)
        second = runner.scan_once(now)

        self.assertEqual(first["status"], "completed")
        self.assertEqual(first["fetched_count"], 2)
        self.assertEqual(first["accepted_count"], 1)
        self.assertEqual(first["new_count"], 1)
        self.assertEqual(second["unchanged_count"], 1)
        self.assertEqual(len(calls), 4)
        candidate = self.store.list_frontier_candidates()[0]
        self.assertEqual(candidate["domains"], ["embodied", "llm"])
        self.assertEqual(len(candidate["matched_queries"]), 2)
        self.assertEqual(candidate["review_status"], "unreviewed")
        self.assertEqual(candidate["paper"]["canonical_ref"], "doi:10.1000/atlas.test")
        resolved = self.store.resolve_paper("arxiv:2608.01234")
        self.assertEqual(resolved["id"], candidate["paper"]["id"])
        self.assertEqual(self.store.frontier_source_state()["status"], "connected")

    def test_partial_source_failure_is_visible_without_discarding_good_candidates(self):
        class PartialClient:
            def fetch(self, spec, start, end, max_results, timeout_seconds):
                if spec.key == "llm":
                    raise scanner.SourceError("mocked upstream outage")
                return scanner.QueryBatch(
                    "https://export.arxiv.org/api/query?mock=1",
                    scanner.parse_arxiv_feed(atom_feed(doi=""), spec),
                )

        runner = scanner.FrontierScanner(
            self.config(),
            store=self.store,
            client=PartialClient(),
            sleeper=lambda _seconds: None,
        )
        run = runner.scan_once(datetime(2026, 8, 11, 13, 0, tzinfo=timezone.utc))

        self.assertEqual(run["status"], "partial")
        self.assertEqual(run["accepted_count"], 1)
        self.assertIn("mocked upstream outage", run["error_text"])
        self.assertEqual(self.store.frontier_source_state()["status"], "degraded")
        self.assertEqual(len(self.store.list_frontier_candidates()), 1)

    def test_term_evidence_distinguishes_single_naming_from_cross_paper_use(self):
        run = self.store.start_frontier_source_run("arxiv", [{"key": "embodied"}])
        first = scanner.parse_arxiv_feed(
            atom_feed(
                arxiv_id="2608.01234v1",
                title="JEPA-WAM: Joint-Embedding Robot Control",
                summary="Video world action models (WAMs) are expensive. We introduce JEPA-WAM.",
                doi="",
            ),
            scanner.DEFAULT_QUERY_SPECS[0],
        )[0]
        second = scanner.parse_arxiv_feed(
            atom_feed(
                arxiv_id="2608.01235v1",
                title="Evaluating WAM for Robot Policies",
                summary="We evaluate world action models (WAMs) for manipulation.",
                doi="",
            ),
            scanner.DEFAULT_QUERY_SPECS[0],
        )[0]
        counts = self.store.record_frontier_candidates(run["id"], "arxiv", [first, second])
        self.store.finish_frontier_source_run(run["id"], "completed", [], {"fetched": 2, **counts})
        extractions = scanner.extract_term_candidates(first) + scanner.extract_term_candidates(second)

        term_counts = self.store.record_frontier_term_candidates(extractions)
        wam = next(item for item in self.store.list_frontier_terms() if item["display_term"] == "WAM")

        self.assertEqual(term_counts["new_terms"], 2)
        self.assertEqual(wam["independent_paper_count"], 2)
        self.assertEqual(wam["adoption_status"], "cross_paper")
        self.assertEqual(wam["canonical_expansion"], "world action models")
        self.assertEqual(len(wam["evidence"]), 2)

        synchronized = self.store.record_frontier_term_candidates(
            [item for item in extractions if item["displayTerm"] == "WAM"],
            synchronize=True,
        )
        self.assertEqual(synchronized["removed_terms"], 1)
        self.assertEqual([item["display_term"] for item in self.store.list_frontier_terms()], ["WAM"])

    def test_term_signal_requires_review_and_preserves_revision_history(self):
        run = self.store.start_frontier_source_run("arxiv", [{"key": "embodied"}])
        first = scanner.parse_arxiv_feed(
            atom_feed(
                arxiv_id="2608.02001v1",
                title="4D-WAM: Trajectory Fields for World Action Models",
                summary="World action models (WAMs) use video and action supervision. We introduce 4D-WAM.",
                doi="",
            ),
            scanner.DEFAULT_QUERY_SPECS[0],
        )[0]
        second = scanner.parse_arxiv_feed(
            atom_feed(
                arxiv_id="2608.02002v1",
                title="JEPA-WAM: Joint-Embedding World Action Models",
                summary="We study world action models (WAMs) with joint-embedding objectives.",
                doi="",
            ),
            scanner.DEFAULT_QUERY_SPECS[0],
        )[0]
        counts = self.store.record_frontier_candidates(run["id"], "arxiv", [first, second])
        self.store.finish_frontier_source_run(run["id"], "completed", [], {"fetched": 2, **counts})
        self.store.record_frontier_term_candidates(
            scanner.extract_term_candidates(first) + scanner.extract_term_candidates(second)
        )
        wam = next(item for item in self.store.list_frontier_terms() if item["display_term"] == "WAM")
        evidence_ids = [item["candidate_id"] for item in wam["evidence"]]

        draft = self.store.create_frontier_signal_from_term(
            {
                "sourceTermId": wam["id"],
                "signalType": "terminology_shift",
                "title": "WAM 命名在近期论文中跨论文出现",
                "changeSummary": "两篇近期候选论文明确使用 World Action Models（WAMs）命名。",
                "evidenceCandidateIds": evidence_ids,
                "editorName": "测试编辑",
            }
        )

        self.assertEqual(draft["status"], "draft")
        self.assertEqual(draft["independent_paper_count"], 2)
        self.assertEqual([item["action"] for item in draft["revisions"]], ["created"])
        self.assertEqual(self.store.list_frontier_signals("published"), [])
        with self.assertRaisesRegex(atlas.AtlasError, "关注理由"):
            self.store.publish_frontier_signal(
                draft["id"],
                {"editorName": "测试编辑", "reviewReason": "已经完成来源核查并确认边界"},
            )

        updated = self.store.update_frontier_signal(
            draft["id"],
            {
                "whyItMatters": "相同命名开始被多篇论文复用，值得核查其问题定义和机制是否一致。",
                "knownUnknowns": "当前只有公开摘要语境，尚未核查全文定义、团队独立性与实验结论。",
                "reviewReason": "补充发布所需的关注理由和未知项",
                "editorName": "测试编辑",
            },
        )
        self.assertEqual(updated["revision"], 2)
        published = self.store.publish_frontier_signal(
            draft["id"],
            {"editorName": "测试编辑", "reviewReason": "逐条核对两篇论文的命名语境后发布"},
        )

        self.assertEqual(published["status"], "published")
        self.assertEqual(published["revision"], 3)
        self.assertEqual(
            [item["action"] for item in published["revisions"]],
            ["published", "updated", "created"],
        )
        promoted = next(item for item in self.store.list_frontier_terms() if item["display_term"] == "WAM")
        self.assertEqual(promoted["review_status"], "promoted")

        synchronized = self.store.record_frontier_term_candidates([], synchronize=True)
        self.assertEqual(synchronized["removed_terms"], 2)
        retained_wam = next(item for item in self.store.list_frontier_terms() if item["display_term"] == "WAM")
        self.assertEqual(retained_wam["review_status"], "promoted")
        self.assertEqual(len(self.store.list_frontier_signals("published")), 1)
        arxiv_radar = self.store.frontier_radar(sources=["arxiv"], limit=10)
        self.assertEqual(len(arxiv_radar["signals"]), 1)
        self.assertTrue(arxiv_radar["terms"])
        unrelated_radar = self.store.frontier_radar(sources=["untrusted-source"], limit=10)
        self.assertEqual(unrelated_radar["signals"], [])
        self.assertEqual(unrelated_radar["terms"], [])

    def test_official_update_scan_has_independent_source_state(self):
        config = replace(
            self.config(),
            official_feeds=(official_spec(),),
            official_max_results=10,
        )
        runner = scanner.FrontierScanner(
            config,
            store=self.store,
            updates_client=scanner.OfficialUpdatesClient(
                fetcher=lambda _url, _timeout: official_feed(),
                sleeper=lambda _seconds: None,
            ),
            sleeper=lambda _seconds: None,
        )

        run = runner.scan_official_updates_once(datetime(2026, 8, 11, 13, 0, tzinfo=timezone.utc))

        self.assertEqual(run["status"], "completed")
        self.assertEqual(run["fetched_count"], 3)
        self.assertEqual(run["accepted_count"], 1)
        self.assertEqual(self.store.frontier_update_source_state()["status"], "connected")
        self.assertEqual(self.store.frontier_source_state()["status"], "not_connected")
        self.assertEqual(self.store.list_frontier_updates()[0]["source_label"], "Atlas Lab")

    def test_active_source_run_is_single_flight(self):
        first = self.store.start_frontier_source_run("arxiv", [{"key": "embodied"}])
        with self.assertRaisesRegex(atlas.ConflictError, "正在运行"):
            self.store.start_frontier_source_run("arxiv", [{"key": "llm"}])
        self.store.finish_frontier_source_run(first["id"], "failed", [], {}, "stopped by test")


class AtlasScannerHttpTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = atlas.AtlasStore(Path(self.directory.name) / "atlas.db")
        run = self.store.start_frontier_source_run("arxiv", [{"key": "embodied"}])
        candidate = scanner.parse_arxiv_feed(
            atom_feed(
                title="JEPA-WAM: Joint-Embedding Robot Control",
                summary="Video world action models (WAMs) support robot policies.",
                doi="",
            ),
            scanner.DEFAULT_QUERY_SPECS[0],
        )[0]
        counts = self.store.record_frontier_candidates(run["id"], "arxiv", [candidate])
        self.store.finish_frontier_source_run(
            run["id"],
            "completed",
            [{"key": "embodied", "status": "completed"}],
            {"fetched": 1, **counts},
        )
        self.store.record_frontier_term_candidates(scanner.extract_term_candidates(candidate))
        update_run = self.store.start_frontier_source_run("official_updates", [{"key": "atlas_lab"}])
        update = scanner.parse_official_feed(
            official_feed(),
            official_spec(),
            scanner.DEFAULT_QUERY_SPECS,
        ).candidates[0]
        update_counts = self.store.record_frontier_updates(update_run["id"], [update])
        self.store.finish_frontier_source_run(
            update_run["id"],
            "completed",
            [{"key": "atlas_lab", "status": "completed"}],
            {"fetched": 3, **update_counts},
        )
        self.server = atlas.create_server(
            "127.0.0.1",
            0,
            self.store,
            "http://127.0.0.1:8765/",
            "http://127.0.0.1:4178/",
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()
        self.directory.cleanup()

    def get_json(self, path):
        with urllib.request.urlopen(f"{self.base_url}{path}", timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))

    def request_json(self, path, payload, headers=None):
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json", **(headers or {})},
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))

    def test_frontier_api_keeps_candidates_separate_from_published_signals(self):
        status, bootstrap = self.get_json("/api/bootstrap")
        self.assertEqual(status, 200)
        self.assertEqual(bootstrap["version"], atlas.APP_VERSION)
        self.assertEqual(bootstrap["frontier_status"], "candidate_source_connected")
        self.assertEqual(len(bootstrap["frontier_candidates"]), 1)
        self.assertEqual(len(bootstrap["frontier_updates"]), 1)
        self.assertGreaterEqual(len(bootstrap["terms"]), 1)
        self.assertEqual(bootstrap["signals"], [])

        _, trends = self.get_json("/api/trends")
        self.assertEqual(trends["status"], "candidate_review_pending")
        self.assertEqual(trends["items"], [])

        _, sources = self.get_json("/api/frontier/sources")
        self.assertEqual(sources["state"]["candidate_count"], 1)
        self.assertEqual(sources["update_state"]["candidate_count"], 1)
        self.assertEqual(sources["runs"][0]["status"], "completed")

        _, updates = self.get_json("/api/frontier/updates")
        self.assertEqual(updates["total"], 1)
        self.assertEqual(updates["items"][0]["source_kind"], "first_party")

        _, terms = self.get_json("/api/terms")
        self.assertEqual(terms["status"], "term_candidates_available")
        self.assertGreaterEqual(terms["total"], 1)

    def test_local_editor_api_keeps_drafts_private_until_explicit_publish(self):
        run = self.store.start_frontier_source_run("arxiv", [{"key": "embodied"}])
        second = scanner.parse_arxiv_feed(
            atom_feed(
                arxiv_id="2608.03002v1",
                title="4D-WAM: Trajectory-Aware World Action Models",
                summary="World action models (WAMs) can use trajectory fields for robot control.",
                doi="",
            ),
            scanner.DEFAULT_QUERY_SPECS[0],
        )[0]
        counts = self.store.record_frontier_candidates(run["id"], "arxiv", [second])
        self.store.finish_frontier_source_run(run["id"], "completed", [], {"fetched": 1, **counts})
        self.store.record_frontier_term_candidates(scanner.extract_term_candidates(second))
        _, terms = self.get_json("/api/terms")
        wam = next(item for item in terms["items"] if item["display_term"] == "WAM")
        payload = {
            "sourceTermId": wam["id"],
            "signalType": "terminology_shift",
            "title": "WAM 命名出现跨论文采用",
            "changeSummary": "两篇近期论文在公开摘要中明确使用 World Action Models（WAMs）命名。",
            "whyItMatters": "相同命名开始跨论文出现，需要进一步核查这些工作是否共享统一机制。",
            "knownUnknowns": "当前未核查全文定义、实验结论和研究团队之间的独立性。",
            "evidenceCandidateIds": [item["candidate_id"] for item in wam["evidence"]],
            "editorName": "本地测试编辑",
            "reviewReason": "建立待核查草稿，不作为公开科学结论",
        }
        with self.assertRaises(urllib.error.HTTPError) as bad_origin:
            self.request_json(
                "/api/editor/signals",
                payload,
                {"Origin": "https://example.invalid"},
            )
        self.assertEqual(bad_origin.exception.code, 403)

        status, draft = self.request_json("/api/editor/signals", payload)
        self.assertEqual(status, 201)
        self.assertEqual(draft["status"], "draft")
        _, bootstrap = self.get_json("/api/bootstrap")
        self.assertEqual(bootstrap["signals"], [])
        self.assertNotIn("signal_drafts", bootstrap)
        private_request = urllib.request.Request(
            f"{self.base_url}/api/private/bootstrap",
            headers={"Origin": self.base_url},
        )
        with urllib.request.urlopen(private_request, timeout=5) as response:
            private_bootstrap = json.loads(response.read().decode("utf-8"))
        self.assertEqual(len(private_bootstrap["signal_drafts"]), 1)
        _, trends = self.get_json("/api/trends")
        self.assertEqual(trends["items"], [])

        status, published = self.request_json(
            f"/api/editor/signals/{draft['id']}/publish",
            {"editorName": "本地测试编辑", "reviewReason": "已逐条核对两篇来源语境并确认未知项"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(published["status"], "published")
        _, trends = self.get_json("/api/trends")
        self.assertEqual(trends["status"], "published_signals_available")
        self.assertEqual(len(trends["items"]), 1)
        self.assertEqual(trends["items"][0]["revision"], 2)


if __name__ == "__main__":
    unittest.main()
