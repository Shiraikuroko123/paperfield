import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from src.research_atlas import app as atlas
from src.research_atlas import news


def demo_feed():
    return b"""<?xml version=\"1.0\"?><rss version=\"2.0\"><channel>
    <item><guid>demo-1</guid><title>Robot foundation model release</title>
    <link>https://deepmind.google/blog/demo-robot</link>
    <description>We release a vision-language-action model and benchmark. See arXiv:2608.12345.</description>
    <pubDate>Sat, 22 Aug 2026 10:00:00 GMT</pubDate></item>
    <item><guid>demo-2</guid><title>Untrusted link</title><link>https://evil.example/demo</link><description>robot</description></item>
    </channel></rss>"""


def secondary_demo_feed():
    return b"""<?xml version=\"1.0\"?><rss version=\"2.0\"><channel>
    <item><guid>relevant</guid><title>Robotics foundation model release</title>
    <link>https://techcrunch.com/robotics-model</link><description>A new VLA policy for manipulation.</description></item>
    <item><guid>irrelevant</guid><title>New data center financing</title>
    <link>https://techcrunch.com/data-center</link><description>Infrastructure investment news.</description></item>
    </channel></rss>"""


class AtlasNewsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = atlas.AtlasStore(Path(self.temp.name) / "atlas.db")

    def tearDown(self):
        self.temp.cleanup()

    def test_fresh_schema_seeds_allowlisted_sources(self):
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchone()[0], "17")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM news_sources").fetchone()[0], len(news.DEFAULT_NEWS_SOURCES))

    def test_feed_parser_rejects_untrusted_links_and_extracts_refs(self):
        source = self.store.get_news_source("deepmind")
        candidates = news.parse_feed(demo_feed(), type("Feed", (), source)())
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["source_url"], "https://deepmind.google/blog/demo-robot")
        self.assertIn("cross", candidates[0]["domains"])
        self.assertEqual(candidates[0]["related_paper_refs"], ["arxiv:2608.12345"])

    def test_feed_parser_keeps_long_first_party_feed_content(self):
        source = self.store.get_news_source("deepmind")
        payload = ("<?xml version=\"1.0\"?><rss version=\"2.0\"><channel>"
                   "<item><guid>long-1</guid><title>Robot model update</title>"
                   "<link>https://deepmind.google/blog/long-robot</link>"
                   "<content:encoded xmlns:content=\"http://purl.org/rss/1.0/modules/content/\"><![CDATA["
                   "<p>" + ("This is a long first-party update about robot learning. " * 8) + "</p>"
                   "]]></content:encoded></item></channel></rss>").encode()
        candidate = news.parse_feed(payload, type("Feed", (), source)())[0]
        self.assertEqual(candidate["content_status"], "cached")
        self.assertIn("long first-party update", candidate["body_text"])
        self.assertIn("<p>", candidate["body_html"])

    def test_secondary_feeds_drop_items_without_focus_terms(self):
        source = news.DEFAULT_NEWS_SOURCES[-2]
        candidates = news.parse_feed(secondary_demo_feed(), source)
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["title"], "Robotics foundation model release")
        self.assertIn("cross", candidates[0]["domains"])

    def test_github_sources_label_code_and_architecture_changes(self):
        release = next(item for item in news.DEFAULT_NEWS_SOURCES if item.key == "codex_releases")
        commit = next(item for item in news.DEFAULT_NEWS_SOURCES if item.key == "codex_commits")
        self.assertEqual(news.classify_item("v0.1.0", "", release)[2], "code_release")
        domains, topics, article_type, _importance = news.classify_item("Add harness runtime MCP support", "", commit)
        self.assertEqual(article_type, "code_change")
        self.assertIn("architecture", topics)
        self.assertIn("llm", domains)

    def test_github_release_api_reader_keeps_release_notes_and_assets(self):
        source = next(item for item in news.DEFAULT_NEWS_SOURCES if item.key == "codex_releases")

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return b'{"tag_name":"v1.2.3","name":"Harness update","published_at":"2026-08-22T10:00:00Z","body":"## Changes\\n\\nAdds a durable harness runtime and MCP handoff. This release includes enough context to be useful in the in-app reader.","assets":[{"name":"atlas-win.zip"}]}'

        with patch.object(news, "_open_github_api", return_value=Response()) as opener:
            body_html, body_text = news.fetch_article(source, "https://github.com/openai/codex/releases/tag/v1.2.3")
        self.assertIn("Harness update", body_text)
        self.assertIn("atlas-win.zip", body_text)
        self.assertIn("<h2>", body_html)
        self.assertIn("api.github.com", opener.call_args.args[0].full_url)

    def test_github_commit_api_reader_keeps_message_and_changed_files(self):
        source = next(item for item in news.DEFAULT_NEWS_SOURCES if item.key == "codex_commits")

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return b'{"sha":"abcdef1234567890","author":{"login":"atlas-bot"},"commit":{"message":"Improve harness runtime\\n\\nAdd explicit handoff state for tool sessions and document recovery behavior."},"files":[{"filename":"src/runtime.rs","status":"modified","additions":12,"deletions":3}]}'

        with patch.object(news, "_open_github_api", return_value=Response()):
            _body_html, body_text = news.fetch_article(source, "https://github.com/openai/codex/commit/abcdef1234567890")
        self.assertIn("Improve harness runtime", body_text)
        self.assertIn("src/runtime.rs", body_text)
        self.assertIn("+12 / -3", body_text)

    def test_news_monitor_can_refresh_only_first_party_code_sources(self):
        class FakeStore:
            def __init__(self):
                self.calls = []

            def list_news_sources(self, enabled_only=True):
                return [
                    {"key": "codex_commits", "source_kind": "github_commit"},
                    {"key": "openai", "source_kind": "official_lab"},
                ]

            def refresh_news(self, source_keys=None, limit_per_source=20):
                self.calls.append((source_keys, limit_per_source))
                return {"runs": [], "stats": {"total": 0}}

        fake = FakeStore()
        monitor = atlas.NewsSynchronizer(fake, interval_seconds=300, priority_interval_seconds=60)
        monitor.refresh_once(["codex_commits"])
        self.assertEqual(fake.calls, [(["codex_commits"], 30)])
        self.assertEqual(monitor.status()["last_scope"], "priority")
        self.assertEqual(monitor.status()["priority_interval_seconds"], 60.0)

    def test_sanitizer_removes_scripts_and_external_links(self):
        source = news.DEFAULT_NEWS_SOURCES[0]
        body, text = news.sanitize_article_html('<article><p>Hello <strong>Atlas</strong></p><script>alert(1)</script><a href="https://evil.example/x">bad</a><a href="https://openai.com/news/x">good</a></article>', source)
        self.assertNotIn("script", body.lower())
        self.assertNotIn("evil.example", body)
        self.assertIn('href="https://openai.com/news/x"', body)
        self.assertIn("Hello Atlas", text)

    def test_upsert_filter_and_owner_scoped_state(self):
        source = self.store.get_news_source("deepmind")
        run = self.store.start_news_fetch_run("deepmind")
        candidates = news.parse_feed(demo_feed(), type("Feed", (), source)())
        self.store.record_news_items(run["id"], candidates)
        self.store.finish_news_fetch_run(run["id"], "completed", {"fetched": 1, "accepted": 1})
        items = self.store.list_news_items("alice", {"domain": "embodied"}, 20)
        self.assertEqual(len(items), 1)
        self.assertFalse(items[0]["saved"])
        self.store.update_news_read_state(items[0]["id"], "alice", read=True, saved=True)
        self.assertEqual(len(self.store.list_news_items("alice", {"unread": True}, 20)), 0)
        self.assertEqual(len(self.store.list_news_items("bob", {"unread": True}, 20)), 1)
        self.assertEqual(self.store.news_stats("alice")["saved"], 1)

    def test_idempotent_upsert_does_not_duplicate(self):
        source = self.store.get_news_source("deepmind")
        candidates = news.parse_feed(demo_feed(), type("Feed", (), source)())
        for _ in range(2):
            run = self.store.start_news_fetch_run("deepmind")
            self.store.record_news_items(run["id"], candidates)
            self.store.finish_news_fetch_run(run["id"], "completed", {"fetched": 1, "accepted": 1})
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM news_items").fetchone()[0], 1)

    def test_news_state_routes_require_a_trusted_browser_origin(self):
        handler = type("Handler", (), {
            "headers": {"Origin": "https://not-atlas.example", "Host": "127.0.0.1:8795"},
            "require_private_origin": atlas.AtlasHandler.require_private_origin,
        })()
        with self.assertRaises(atlas.ForbiddenError):
            handler.require_private_origin()

    def test_redirect_handler_rejects_an_untrusted_target(self):
        handler = news._AllowlistedRedirectHandler(("openai.com",))
        with self.assertRaises(ValueError):
            handler.redirect_request(None, None, 302, "Found", {}, "https://evil.example/redirect")



if __name__ == "__main__":
    unittest.main()
