import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from src.research_atlas import app as atlas
from src.research_atlas.curriculum import (
    build_curriculum,
    list_course_lesson_sources,
    load_course_lesson,
    resolve_course_asset_path,
)


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "paperfield_platform_app",
    ROOT / "src" / "paperfield" / "app.py",
)
paperfield = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(paperfield)

RELEASE_SPEC = importlib.util.spec_from_file_location(
    "paperfield_release_builder",
    ROOT / "scripts" / "build-release.py",
)
release_builder = importlib.util.module_from_spec(RELEASE_SPEC)
assert RELEASE_SPEC.loader
RELEASE_SPEC.loader.exec_module(release_builder)


class CurriculumIntegrationTests(unittest.TestCase):
    def test_atlas_preloads_curriculum_for_the_initial_navigation_count(self):
        source = (ROOT / "src" / "research_atlas" / "static" / "app.js").read_text(encoding="utf-8")

        self.assertIn(
            "await Promise.all([loadFrontierRadar(), loadKnowledgeViews(), loadCurriculum()]);",
            source,
        )
        self.assertIn('if (state.activeView !== "curriculum") return;', source)
        self.assertIn("curriculumTreeWideQuery", source)
        self.assertIn("if (curriculumLessonLocation(lessonPath))", source)
        self.assertIn("courseContentAssetUrl(resolved)", source)
        self.assertIn("enhanceCourseDiagnostics(body)", source)
        atlas_html = (ROOT / "src" / "research_atlas" / "static" / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="curriculumTreePanel"', atlas_html)
        self.assertIn('id="curriculumLessonCount"', atlas_html)

    def test_every_atlas_chapter_links_to_existing_course_markdown(self):
        payload = build_curriculum()
        course_root = ROOT / "content" / "courses" / "课程"
        source_paths = {item["path"] for item in list_course_lesson_sources(course_root)}
        chapters = [
            chapter
            for track in payload["tracks"]
            for module in track["modules"]
            for chapter in module["chapters"]
        ]
        linked_paths = {
            lesson["path"]
            for chapter in chapters
            for lesson in chapter["course_lessons"]
        }

        self.assertEqual(len(chapters), 20)
        self.assertEqual(len(source_paths), 98)
        self.assertEqual(linked_paths, source_paths)
        self.assertEqual(payload["stats"]["course_source_files"], 98)
        self.assertEqual(payload["stats"]["course_lesson_unique"], 98)
        self.assertGreaterEqual(payload["stats"]["course_lesson_links"], 98)
        for chapter in chapters:
            self.assertTrue(chapter["course_lessons"], chapter["id"])
            for lesson in chapter["course_lessons"]:
                source = course_root / f"{lesson['path']}.md"
                if not source.is_file():
                    source = course_root / lesson["path"] / "README.md"
                self.assertTrue(source.is_file(), f"{chapter['id']} -> {source}")

    def test_curriculum_hash_is_deterministic_and_track_filter_is_consistent(self):
        first = build_curriculum()
        second = build_curriculum()
        embodied = build_curriculum("embodied")

        self.assertEqual(first["catalog_sha256"], second["catalog_sha256"])
        self.assertEqual([track["id"] for track in embodied["tracks"]], ["embodied"])
        self.assertEqual(embodied["stats"]["chapters"], 10)
        embodied_sources = sum(item["track_id"] == "embodied" for item in list_course_lesson_sources())
        self.assertEqual(embodied["stats"]["course_source_files"], embodied_sources)
        self.assertEqual(embodied["stats"]["course_lesson_unique"], embodied_sources)
        self.assertGreaterEqual(embodied["stats"]["course_lesson_links"], embodied_sources)

    def test_embedded_lesson_renders_math_toc_and_sanitized_html(self):
        lesson = load_course_lesson("llm/04-对齐与RL基础/08")

        self.assertEqual(lesson["track_id"], "llm")
        self.assertIn("llm-alignment-rl", lesson["chapter_ids"])
        self.assertTrue(lesson["has_math"])
        self.assertTrue(lesson["toc"])
        self.assertIn("<h1", lesson["html"])
        self.assertIn('<pre><code class="language-mermaid">', lesson["html"])
        self.assertEqual(len(lesson["source_sha256"]), 64)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "llm" / "test.md"
            source.parent.mkdir(parents=True)
            source.write_text(
                "# 安全测试\n\n<script>alert(1)</script>\n\n[危险](javascript:alert(1))\n",
                encoding="utf-8",
            )
            rendered = load_course_lesson("llm/test", root)
        self.assertNotIn("<script", rendered["html"].lower())
        self.assertNotIn("javascript:", rendered["html"].lower())

    def test_prerequisite_diagnostic_keeps_labels_but_not_course_scripts(self):
        lesson = load_course_lesson("llm/00-导学与诊断/02-先修诊断与个性化路径")

        self.assertIn('<form class="diagnostic" data-diagnostic="">', lesson["html"])
        self.assertEqual(lesson["html"].count('data-diagnostic-domain="'), 18)
        self.assertGreaterEqual(lesson["html"].count("<label>"), 18)
        self.assertIn("data-diagnostic-score", lesson["html"])
        self.assertIn("data-diagnostic-result", lesson["html"])
        self.assertNotIn("onclick", lesson["html"].lower())
        self.assertNotIn("<script", lesson["html"].lower())

    def test_course_media_resolver_allows_images_and_rejects_other_files(self):
        asset = resolve_course_asset_path("llm/assets/images/course-map.svg")
        self.assertTrue(asset.is_file())
        self.assertEqual(asset.suffix, ".svg")
        with self.assertRaises(ValueError):
            resolve_course_asset_path("llm/../../README.md")
        with self.assertRaises(ValueError):
            resolve_course_asset_path("llm/README.md")

    def test_embedded_lesson_rejects_parent_traversal(self):
        with self.assertRaises(ValueError):
            load_course_lesson("llm/../../README")


class ContractTests(unittest.TestCase):
    def test_platform_scripts_use_health_and_verified_process_metadata(self):
        run_source = (ROOT / "scripts" / "run-platform.ps1").read_text(encoding="utf-8")
        stop_source = (ROOT / "scripts" / "stop-platform.ps1").read_text(encoding="utf-8")
        helper_source = (ROOT / "scripts" / "platform-process.ps1").read_text(encoding="utf-8")
        standalone_atlas = (ROOT / "scripts" / "run-atlas.ps1").read_text(encoding="utf-8")
        standalone_atlas_cmd = (ROOT / "scripts" / "run-atlas.cmd").read_text(encoding="utf-8")

        self.assertIn("$atlasHealthy = Test-PlatformHealth", run_source)
        self.assertIn("if ($atlasHealthy)", run_source)
        self.assertNotIn("Atlas is healthy but no listener was found", run_source)
        self.assertNotIn("Get-NetTCPConnection", run_source)
        self.assertNotIn("Get-NetTCPConnection", stop_source)
        self.assertIn("Stop-PlatformService", stop_source)
        self.assertIn("Enter-PlatformLifecycleLock", run_source)
        self.assertIn("Enter-PlatformLifecycleLock", stop_source)
        self.assertIn("started_ticks", helper_source)
        self.assertIn("executable_path", helper_source)
        self.assertIn("script_path", helper_source)
        self.assertIn("Test-PlatformProcessState", helper_source)
        self.assertIn("Get-PlatformListeners", helper_source)
        self.assertIn('-TimeoutSeconds 180', run_source)
        self.assertIn('$workerDiagnostics.config.ready -eq $true', run_source)
        self.assertIn('Write-PlatformProcessState -RuntimeDir $runtimeDir -Name "atlas-worker"', run_source)
        self.assertIn('worker_connected -eq $true', run_source)
        self.assertIn('worker_last_seen', run_source)
        self.assertIn('Get-CimInstance Win32_Process', run_source)
        self.assertIn('$externalWorkerActive', run_source)
        self.assertIn('Name = "atlas-worker"', stop_source)
        self.assertIn('Pattern = "research_atlas[\\\\/]worker\\.py"', stop_source)
        self.assertIn("Get-PlatformProxyToken -RuntimeDir $runtimeDir", standalone_atlas)
        self.assertIn("PAPERFIELD_ATLAS_PROXY_TOKEN", standalone_atlas)
        self.assertIn("RESEARCH_ATLAS_PAPERFIELD_PROXY_TOKEN", standalone_atlas)
        self.assertIn("@AtlasArguments", standalone_atlas)
        self.assertIn("run-atlas.ps1", standalone_atlas_cmd)

    def test_course_math_and_mermaid_assets_are_local_versioned_and_lazy(self):
        config = (ROOT / "content" / "courses" / "mkdocs.yml").read_text(encoding="utf-8")
        vendor_root = ROOT / "content" / "courses" / "课程" / "assets" / "vendor"

        self.assertNotIn("cdn.jsdelivr.net", config)
        self.assertIn("assets/vendor/mathjax-3.2.2/tex-mml-chtml.js", config)
        self.assertIn("assets/vendor/mermaid-11.16.1/mermaid.min.js", config)
        self.assertTrue((vendor_root / "mathjax-3.2.2" / "LICENSE").is_file())
        self.assertTrue((vendor_root / "mermaid-11.16.1" / "LICENSE").is_file())
        self.assertGreater(
            len(list((vendor_root / "mathjax-3.2.2" / "output" / "chtml" / "fonts" / "woff-v2").glob("*.woff"))),
            20,
        )
        atlas_html = (ROOT / "src" / "research_atlas" / "static" / "index.html").read_text(encoding="utf-8")
        atlas_js = (ROOT / "src" / "research_atlas" / "static" / "app.js").read_text(encoding="utf-8")
        self.assertNotIn("course-assets/mathjax-3.2.2/tex-mml-chtml.js", atlas_html)
        self.assertNotIn("course-assets/mermaid-11.16.1/mermaid.min.js", atlas_html)
        self.assertIn("ensureCourseMathRuntime", atlas_js)
        self.assertIn("ensureCourseMermaidRuntime", atlas_js)
        self.assertIn("course-assets/mathjax-3.2.2/tex-mml-chtml.js", atlas_js)
        self.assertIn("course-assets/mermaid-11.16.1/mermaid.min.js", atlas_js)

    def test_analysis_dialog_keeps_permissions_and_actions_visible(self):
        atlas_css = (ROOT / "src" / "research_atlas" / "static" / "styles.css").read_text(encoding="utf-8")
        atlas_html = (ROOT / "src" / "research_atlas" / "static" / "index.html").read_text(encoding="utf-8")

        self.assertIn("#analysisForm { height: min(90dvh, 48rem); grid-template-rows: auto minmax(0, 1fr) auto auto; }", atlas_css)
        self.assertIn('id="analysisAllowDownload"', atlas_html)
        self.assertIn('id="analysisAllowExternal"', atlas_html)
        self.assertIn('id="analysisSubmit">加入队列</button>', atlas_html)

    def test_news_and_frontier_update_details_keep_external_links_visible(self):
        atlas_js = (ROOT / "src" / "research_atlas" / "static" / "app.js").read_text(encoding="utf-8")
        atlas_html = (ROOT / "src" / "research_atlas" / "static" / "index.html").read_text(encoding="utf-8")
        atlas_css = (ROOT / "src" / "research_atlas" / "static" / "styles.css").read_text(encoding="utf-8")

        self.assertIn('const sourceLink = item.source_url', atlas_js)
        self.assertIn('news-reader-actions">${sourceLink}', atlas_js)
        self.assertIn('这是 GitHub 提交记录', atlas_js)
        self.assertIn('function openFrontierUpdateDetail(updateId', atlas_js)
        self.assertIn('data-frontier-update-id="${escapeHtml(update.id)}"', atlas_js)
        self.assertIn('打开官方原文 ↗', atlas_js)
        self.assertIn('id="updateDetailDialog"', atlas_html)
        self.assertIn('.update-detail-actions', atlas_css)

    def test_atlas_primary_paper_links_open_the_paperfield_reader(self):
        atlas_js = (ROOT / "src" / "research_atlas" / "static" / "app.js").read_text(encoding="utf-8")
        atlas_html = (ROOT / "src" / "research_atlas" / "static" / "index.html").read_text(encoding="utf-8")
        paperfield_js = (ROOT / "src" / "paperfield" / "static" / "app.js").read_text(encoding="utf-8")

        self.assertIn('base.searchParams.set("reader", "1");', atlas_js)
        self.assertIn('base.searchParams.set("paper", String(paperfieldId).trim());', atlas_js)
        paper_url_start = atlas_js.index("function paperfieldPaperUrl(paper)")
        paper_url_end = atlas_js.index("\nfunction paperfieldReferenceUrl", paper_url_start)
        paper_url_markup = atlas_js[paper_url_start:paper_url_end]
        self.assertLess(paper_url_markup.index("paperfield_id"), paper_url_markup.index("canonical_ref"))
        self.assertIn('return reference ? paperfieldReferenceUrl(reference) : "";', paper_url_markup)
        candidate_start = atlas_js.index("function candidateRowMarkup(candidate)")
        candidate_end = atlas_js.index("\nfunction filteredUpdates()", candidate_start)
        candidate_markup = atlas_js[candidate_start:candidate_end]
        self.assertIn('class="paper-title-link" href="${escapeHtml(paperfieldLink)}"', candidate_markup)
        self.assertIn('class="button button-primary" href="${escapeHtml(paperfieldLink)}">在 Paperfield 精读', candidate_markup)
        self.assertIn("外部来源 · arXiv", candidate_markup)
        self.assertNotIn(">打开 arXiv</a>", candidate_markup)

        ranked_start = atlas_js.index("function frontierItemMarkup(item, kind, index)")
        ranked_end = atlas_js.index("\nfunction renderFrontierDiagnostics", ranked_start)
        ranked_markup = atlas_js[ranked_start:ranked_end]
        self.assertIn("paperfieldPaperUrl(item.paper || { canonical_ref: reference })", ranked_markup)
        self.assertIn('class="button button-primary" href="${escapeHtml(paperLink)}">在 Paperfield 精读', ranked_markup)

        self.assertIn("function prepareReaderLoading({", paperfield_js)
        self.assertIn('statusTitle: "正在定位论文"', paperfield_js)
        self.assertIn("const readerReady = openReader(payload.paper_id, locator);", paperfield_js)
        self.assertIn("await Promise.all([readerReady, catalogRefresh]);", paperfield_js)
        self.assertIn("payload.imported ? catalogReady.then(refreshCatalog) : catalogReady", paperfield_js)
        self.assertIn("const initialCatalogReady = Promise.all([", paperfield_js)
        self.assertIn("await Promise.all([initialCatalogReady, initialPaperReady]);", paperfield_js)

        evidence_start = atlas_js.index("function evidenceMarkup(items = [])")
        evidence_end = atlas_js.index("\nfunction dossierStageMarkup", evidence_start)
        evidence_markup = atlas_js[evidence_start:evidence_end]
        self.assertIn('const source = paperfieldUrl ? `<a href="${escapeHtml(paperfieldUrl)}">', evidence_markup)
        self.assertIn("外部论文来源", evidence_markup)
        self.assertIn('id="dossierSourceLink"', atlas_html)
        self.assertIn(">外部论文来源</a>", atlas_html)

    def test_flowloom_marks_reviewed_flagship_templates_in_the_picker(self):
        dialog = (ROOT / "apps" / "flowloom" / "src" / "components" / "ScientificDialog.tsx").read_text(encoding="utf-8")
        styles = (ROOT / "apps" / "flowloom" / "src" / "scientific.css").read_text(encoding="utf-8")

        self.assertIn("FLAGSHIP_TEMPLATE_IDS", dialog)
        self.assertIn('data-flagship-template={flagship ? \'true\' : undefined}', dialog)
        self.assertIn("旗舰</span>", dialog)
        self.assertIn(".schematic-flagship-label", styles)
        self.assertNotIn("data-gold-case", dialog)
        self.assertNotIn("Gold</span>", dialog)
        self.assertNotIn(".schematic-gold-label", styles)

    def test_flowloom_keeps_the_reviewed_gold_benchmark_in_the_unified_build(self):
        flowloom = ROOT / "apps" / "flowloom"
        benchmark = flowloom / "public" / "benchmarks" / "compiled"
        paperfield_html = (ROOT / "src" / "paperfield" / "static" / "index.html").read_text(
            encoding="utf-8"
        )
        source = json.loads(
            (flowloom / "benchmarks" / "figure-benchmark-gold.json").read_text(encoding="utf-8")
        )
        manifest = json.loads((benchmark / "manifest.json").read_text(encoding="utf-8"))
        source_gold_cases = [item for item in source["cases"] if item["trainingRole"] == "gold"]
        gold_cases = [
            item for item in manifest["reviewWorkbench"]["cases"]
            if item["trainingRole"] == "gold"
        ]
        human_review = json.loads(
            (
                flowloom
                / "benchmarks"
                / "human-reviews"
                / "imitation-diffusion-policy-human-review.json"
            ).read_text(encoding="utf-8")
        )
        release_files = set(release_builder.unified_workspace_files())

        self.assertEqual([item["id"] for item in source_gold_cases], ["imitation-diffusion-policy"])
        self.assertEqual([item["id"] for item in gold_cases], ["imitation-diffusion-policy"])
        self.assertEqual(gold_cases[0]["page"], "imitation-diffusion-policy.html")
        self.assertEqual(human_review["weightedScore"], 5)
        self.assertTrue((benchmark / "imitation-diffusion-policy.svg").is_file())
        self.assertIn("apps/flowloom/benchmarks/figure-benchmark-gold.json", release_files)
        self.assertIn(
            "apps/flowloom/public/benchmarks/compiled/imitation-diffusion-policy.svg",
            release_files,
        )
        self.assertIn(
            'GOLD_BENCHMARK_PATH = \'benchmarks/compiled/imitation-diffusion-policy.html\'',
            (flowloom / "src" / "App.tsx").read_text(encoding="utf-8"),
        )
        flowloom_app = (flowloom / "src" / "App.tsx").read_text(encoding="utf-8")
        scientific_dialog = (
            flowloom / "src" / "components" / "ScientificDialog.tsx"
        ).read_text(encoding="utf-8")
        self.assertIn(
            '<b class="case-tab-badge">Gold</b>',
            (benchmark / "index.html").read_text(encoding="utf-8"),
        )
        self.assertNotIn(
            'href="/flowloom/benchmarks/compiled/imitation-diffusion-policy.html"',
            paperfield_html,
        )
        self.assertNotIn('<span>Gold 基准</span><b>Diffusion Policy</b>', paperfield_html)
        self.assertIn("onOpenGoldBenchmark={openGoldBenchmark}", flowloom_app)
        self.assertNotIn("gold-cases-button", flowloom_app)
        self.assertNotIn("id: 'gold-cases'", flowloom_app)
        self.assertIn("onOpenGoldBenchmark: () => void", scientific_dialog)
        self.assertIn('<span>Gold 基准</span>', scientific_dialog)

    def test_unified_product_links_point_to_the_paperfield_repository(self):
        course_config = (ROOT / "content" / "courses" / "mkdocs.yml").read_text(encoding="utf-8")
        flowloom_readme = (ROOT / "apps" / "flowloom" / "README.md").read_text(encoding="utf-8")

        self.assertIn("repo_url: https://github.com/Shiraikuroko123/paperfield", course_config)
        self.assertIn("tree/main/content/courses/课程/embodied/labs", course_config)
        self.assertIn("tree/main/content/courses/课程/llm/labs", course_config)
        self.assertNotIn("repo_url: https://github.com/Shiraikuroko123/ai-systems-courses", course_config)
        self.assertIn("github.com/Shiraikuroko123/paperfield/tree/main/apps/flowloom", flowloom_readme)

    def test_platform_build_handles_native_stderr_by_exit_code(self):
        source = (ROOT / "scripts" / "build-platform.ps1").read_text(encoding="utf-8")

        self.assertIn("function Invoke-PlatformNative", source)
        self.assertIn('$ErrorActionPreference = "Continue"', source)
        self.assertIn("$exitCode = $LASTEXITCODE", source)
        self.assertIn("if ($exitCode -ne 0)", source)
        self.assertIn('Join-Path $root "tmp"', source)
        self.assertIn("$isDirectBuildChild", source)
        self.assertNotIn("[System.IO.Path]::GetTempPath()", source)
        self.assertIn("function Enter-PlatformBuildLock", source)
        self.assertIn('Join-Path $BuildRoot "platform-build.lock"', source)
        self.assertIn("[System.IO.FileShare]::None", source)
        self.assertIn('Join-Path $temporaryBuildRoot "npm-cache"', source)
        self.assertIn('"--prefer-offline"', source)
        self.assertIn('"--no-audit"', source)
        self.assertIn('"--no-fund"', source)

    def test_platform_build_stages_web_assets_before_publishing(self):
        source = (ROOT / "scripts" / "build-platform.ps1").read_text(encoding="utf-8")

        self.assertIn("function Publish-PlatformDirectory", source)
        self.assertIn('"flowloom-dist-stage-$PID-"', source)
        self.assertIn('"--outDir", $flowloomStagedDist', source)
        self.assertNotIn("courses-site-stage", source)
        self.assertNotIn("mkdocs", source)
        self.assertIn("Move-Item -LiteralPath $StagedDirectory -Destination $TargetDirectory", source)
        self.assertIn("Move-Item -LiteralPath $backup -Destination $TargetDirectory", source)

    def test_all_delivery_paths_include_the_unified_workspaces(self):
        dockerfile = (ROOT / "deploy" / "docker" / "Dockerfile").read_text(encoding="utf-8")
        dockerignore = (ROOT / "deploy" / "docker" / "Dockerfile.dockerignore").read_text(encoding="utf-8")
        compose = (ROOT / "deploy" / "compose.yaml").read_text(encoding="utf-8")
        release = (ROOT / "scripts" / "build-release.py").read_text(encoding="utf-8")
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

        self.assertIn("FROM node:22-slim AS flowloom-build", dockerfile)
        self.assertNotIn("AS courses-build", dockerfile)
        self.assertIn("content/courses/课程 ./content/courses/课程", dockerfile)
        self.assertIn("scripts/run-container.py", dockerfile)
        self.assertIn("RESEARCH_ATLAS_DB_PATH: /data/atlas/atlas.db", compose)
        self.assertIn("apps/flowloom/node_modules", dockerignore)
        self.assertIn("content/courses/site", dockerignore)
        self.assertIn("GENERATED_TREES", release)
        self.assertIn('ROOT / "apps" / "flowloom" / "dist"', release)
        self.assertNotIn('ROOT / "content" / "courses" / "site"', release)
        self.assertIn("npm test --prefix apps/flowloom", ci)
        self.assertIn("content/courses/mkdocs.yml", ci)

    def test_release_builder_collects_uncommitted_unified_sources_without_dependencies(self):
        files = set(release_builder.unified_workspace_files())
        expected = {
            "apps/flowloom/src/App.tsx",
            "content/courses/mkdocs.yml",
            "docs/MONOREPO_INTEGRATION.md",
            "packages/research-contracts/schemas/paper-context.schema.json",
            "provenance.json",
            "scripts/run-platform.ps1",
            "scripts/stop-platform.ps1",
            "src/research_atlas/app.py",
        }

        self.assertTrue(expected.issubset(files), expected - files)
        self.assertFalse(any("/node_modules/" in f"/{path}/" for path in files))
        self.assertFalse(any(path.startswith("apps/flowloom/dist/") for path in files))
        self.assertFalse(any(path.startswith("content/courses/site/") for path in files))

    def test_nested_standalone_deployment_workflows_are_removed(self):
        self.assertFalse((ROOT / "apps" / "flowloom" / ".github" / "workflows" / "deploy-pages.yml").exists())
        self.assertFalse((ROOT / "content" / "courses" / ".github" / "workflows" / "deploy-pages.yml").exists())

    def test_pdf_page_flowloom_transfer_requires_confirmation_before_capture(self):
        source = (ROOT / "src" / "paperfield" / "static" / "app.js").read_text(encoding="utf-8")
        start = source.index("async function sendCurrentPdfPageToFlowloom()")
        end = source.index("\nfunction ", start + 1)
        implementation = source[start:end]

        confirmation = implementation.index("window.confirm(")
        capture = implementation.index("captureRenderedPdfPage(page)")
        opening = implementation.index("window.open(")
        sending = implementation.index("target.postMessage(")
        self.assertLess(confirmation, capture)
        self.assertLess(confirmation, opening)
        self.assertLess(confirmation, sending)
        self.assertIn("if (!confirmed) return;", implementation[confirmation:capture])
        self.assertIn("Flowloom", implementation[confirmation:capture])

    def test_cross_window_targets_are_same_origin_or_loopback_only(self):
        source = (ROOT / "src" / "paperfield" / "static" / "app.js").read_text(encoding="utf-8")
        self.assertIn("function isSameOriginOrLoopbackTarget(url)", source)
        self.assertIn('["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)', source)
        for function_name in ("openAtlasBridge", "sendCurrentPdfPageToFlowloom"):
            start = source.index(f"function {function_name}")
            end = source.find("\nfunction ", start + 1)
            implementation = source[start:] if end == -1 else source[start:end]
            validation = implementation.index("isSameOriginOrLoopbackTarget(targetUrl)")
            self.assertLess(validation, implementation.index("window.open("))

    def test_flowloom_clears_incoming_atlas_context_when_ai_dialog_closes(self):
        source = (ROOT / "apps" / "flowloom" / "src" / "App.tsx").read_text(encoding="utf-8")
        self.assertIn("const closeAi = useCallback", source)
        self.assertIn("setIncomingPaperContext(undefined)", source)
        self.assertIn("onClose={closeAi}", source)

    def test_atlas_locator_opens_reader_searches_fulltext_and_highlights_match(self):
        source = (ROOT / "src" / "paperfield" / "static" / "app.js").read_text(
            encoding="utf-8"
        )
        html = (ROOT / "src" / "paperfield" / "static" / "index.html").read_text(
            encoding="utf-8"
        )
        self.assertIn(
            'const PAPER_LOCATOR_QUERY_FIELDS = ["section", "figure", "table", "equation", "quote"]',
            source,
        )
        self.assertIn("const initialPaperLocator = paperLocatorFromParams(initialParams);", source)
        self.assertIn("? openReader(initialPaperId, initialPaperLocator)", source)
        init_start = source.index("async function init()")
        init_implementation = source[init_start:]
        self.assertLess(
            init_implementation.index("? openReader(initialPaperId, initialPaperLocator)"),
            init_implementation.index("const paperSelectionReady = initialCatalogReady.then("),
        )
        start = source.index("async function applyPendingReaderLocator()")
        end = source.index("\nasync function ", start + 1)
        implementation = source[start:end]
        self.assertIn("/locate?", implementation)
        self.assertIn("await focusReaderPage(targetPage)", implementation)
        self.assertIn("highlightReaderLocator(shell, result.query)", implementation)
        self.assertIn("highlightReaderLocator(shell, result.query)", implementation)
        self.assertIn("result.reason === \"fulltext_unavailable\"", implementation)

    def test_shared_contracts_are_valid_json_and_references_resolve(self):
        schema_root = ROOT / "packages" / "research-contracts" / "schemas"
        expected = {
            "source-locator.schema.json",
            "paper-context.schema.json",
            "course-chapter.schema.json",
            "figure-context.schema.json",
            "project-context.schema.json",
            "claim-thread-context.schema.json",
        }
        self.assertEqual({path.name for path in schema_root.glob("*.json")}, expected)
        for path in schema_root.glob("*.json"):
            schema = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
            self.assertEqual(schema["type"], "object")
            for definition in _schema_references(schema):
                if definition.startswith("#") or "://" in definition:
                    continue
                self.assertTrue((schema_root / definition).is_file(), f"{path.name}: {definition}")

    def test_atlas_thread_ui_uses_public_projection_and_confirmed_flowloom_bridge(self):
        source = (ROOT / "src" / "research_atlas" / "static" / "app.js").read_text(
            encoding="utf-8"
        )
        html = (ROOT / "src" / "research_atlas" / "static" / "index.html").read_text(
            encoding="utf-8"
        )
        start = source.index("async function sendPublicThreadToFlowloom(")
        end = source.index("\nfunction ", start + 1)
        implementation = source[start:end]
        confirmation = implementation.index("window.confirm(")
        export_request = implementation.index("/flowloom-export")
        opening = implementation.index("window.open(")
        sending = implementation.index("target.postMessage(")
        self.assertIn('api("/api/threads?limit=200")', source)
        self.assertNotIn('state.knowledge.selected?.entity_kind === "thread"', source)
        self.assertLess(confirmation, export_request)
        self.assertLess(confirmation, opening)
        self.assertLess(confirmation, sending)
        self.assertIn("if (!confirmed) return;", implementation[confirmation:export_request])
        self.assertIn('type: "atlas:claim-thread"', implementation)
        self.assertIn('message.type === "flowloom:thread-accepted"', implementation)
        self.assertIn('id="threadPublicCount"', html)
        self.assertIn('data-view-panel="threads"', html)

    def test_provenance_pins_all_imported_repositories(self):
        manifest = json.loads((ROOT / "provenance.json").read_text(encoding="utf-8"))
        sources = {item["name"]: item for item in manifest["sources"]}
        self.assertEqual(sources["flowloom"]["commit"], "a563c5e35f33d91bd0631a1e1739c3bf96bf3891")
        self.assertEqual(sources["ai-systems-courses"]["commit"], "670ef7215798bb8c634fb26f9b76eda10851333d")
        self.assertEqual(sources["Paper-Notes"]["destination"], None)
        self.assertEqual(sources["MathJax"]["version"], "3.2.2")
        self.assertEqual(sources["Mermaid"]["version"], "11.16.1")


def _schema_references(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "$ref" and isinstance(item, str):
                yield item
            else:
                yield from _schema_references(item)
    elif isinstance(value, list):
        for item in value:
            yield from _schema_references(item)


class UnifiedHttpTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        self.flowloom = root / "flowloom"
        self.flowloom.mkdir()
        (self.flowloom / "index.html").write_text("<h1>Flowloom mounted</h1>", encoding="utf-8")

        self.atlas_store = atlas.AtlasStore(root / "atlas.db")
        self.atlas_server = atlas.create_server(
            "127.0.0.1",
            0,
            self.atlas_store,
            "http://127.0.0.1:8765/",
            "http://127.0.0.1:8765/flowloom/",
        )
        self.atlas_thread = threading.Thread(target=self.atlas_server.serve_forever, daemon=True)
        self.atlas_thread.start()

        self.originals = {
            "AUTH": paperfield.AUTH,
            "FLOWLOOM_DIST_DIR": paperfield.FLOWLOOM_DIST_DIR,
            "ATLAS_INTERNAL_URL": paperfield.ATLAS_INTERNAL_URL,
        }
        paperfield.AUTH = paperfield.AuthService(root / "users.json", required=False)
        paperfield.FLOWLOOM_DIST_DIR = self.flowloom
        paperfield.ATLAS_INTERNAL_URL = f"http://127.0.0.1:{self.atlas_server.server_port}"

        self.paperfield_server = ThreadingHTTPServer(("127.0.0.1", 0), paperfield.AppHandler)
        self.paperfield_thread = threading.Thread(target=self.paperfield_server.serve_forever, daemon=True)
        self.paperfield_thread.start()
        self.base_url = f"http://127.0.0.1:{self.paperfield_server.server_port}"

    def tearDown(self):
        self.paperfield_server.shutdown()
        self.paperfield_server.server_close()
        self.paperfield_thread.join(timeout=5)
        self.atlas_server.shutdown()
        self.atlas_server.server_close()
        self.atlas_thread.join(timeout=5)
        for name, value in self.originals.items():
            setattr(paperfield, name, value)
        self.directory.cleanup()

    def get(self, path):
        with urllib.request.urlopen(f"{self.base_url}{path}", timeout=10) as response:
            return response.status, response.headers, response.read()

    def get_without_redirect(self, path):
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, request, response, code, message, headers, new_url):
                return None

        opener = urllib.request.build_opener(NoRedirect())
        try:
            response = opener.open(f"{self.base_url}{path}", timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.code, response.headers, response.read()

    def test_platform_status_and_mounted_workspaces(self):
        status, _, body = self.get("/api/platform")
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(status, 200)
        self.assertTrue(all(item["ready"] for item in payload["workspaces"]))
        self.assertEqual([item["id"] for item in payload["workspaces"]], ["paperfield", "atlas", "flowloom"])

        _, flow_headers, flow_body = self.get("/flowloom/")
        self.assertIn("text/html", flow_headers["Content-Type"])
        self.assertIn(b"Flowloom mounted", flow_body)
        _, _, course_body = self.get("/courses/")
        self.assertIn(b"Research Atlas", course_body)

    def test_atlas_and_legacy_course_routes_have_canonical_redirects(self):
        status, headers, _ = self.get_without_redirect("/atlas?view=curriculum")
        self.assertEqual(status, 301)
        self.assertEqual(headers["Location"], "/atlas/?view=curriculum")

        status, headers, _ = self.get_without_redirect("/courses/embodied/")
        self.assertEqual(status, 301)
        location = urllib.parse.urlparse(headers["Location"])
        query = urllib.parse.parse_qs(location.query)
        self.assertEqual(location.path, "/atlas/")
        self.assertEqual(query["view"], ["curriculum"])
        self.assertEqual(query["track"], ["embodied"])
        self.assertEqual(query["lesson"], ["embodied/README"])

    def test_legacy_benchmark_bookmarks_redirect_to_the_mounted_flowloom_app(self):
        status, headers, _ = self.get_without_redirect(
            "/benchmarks/compiled/imitation-diffusion-policy.html?review=gold"
        )

        self.assertEqual(status, 301)
        self.assertEqual(
            headers["Location"],
            "/flowloom/benchmarks/compiled/imitation-diffusion-policy.html?review=gold",
        )

    def test_atlas_api_is_available_under_paperfield_origin(self):
        status, headers, body = self.get("/atlas/api/curriculum?track=embodied")
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(status, 200)
        self.assertIn("application/json", headers["Content-Type"])
        self.assertEqual(payload["stats"]["chapters"], 10)
        embodied_sources = sum(item["track_id"] == "embodied" for item in list_course_lesson_sources())
        self.assertEqual(payload["stats"]["course_source_files"], embodied_sources)
        self.assertEqual(payload["stats"]["course_lesson_unique"], embodied_sources)

        status, headers, body = self.get(
            "/atlas/api/curriculum/lesson?path="
            + urllib.parse.quote("embodied/05-主要分支与迁移/06-世界模型与具身智能-专题")
        )
        lesson = json.loads(body.decode("utf-8"))
        self.assertEqual(status, 200)
        self.assertIn("application/json", headers["Content-Type"])
        self.assertEqual(lesson["track_id"], "embodied")
        self.assertIn("<h1", lesson["html"])

        status, headers, body = self.get("/atlas/course-assets/mermaid-11.16.1/LICENSE")
        self.assertEqual(status, 200)
        self.assertTrue(headers["Content-Type"])
        self.assertTrue(body)

        status, headers, body = self.get(
            "/atlas/api/curriculum/asset?path="
            + urllib.parse.quote("embodied/assets/images/course-map.svg")
        )
        self.assertEqual(status, 200)
        self.assertIn("image/svg+xml", headers["Content-Type"])
        self.assertIn(b"<svg", body[:500])

        status, _, html = self.get("/atlas/?view=curriculum&track=embodied&chapter=embodied-wam")
        self.assertEqual(status, 200)
        self.assertIn(b"Research Atlas", html)

        status, _, html = self.get(
            "/courses/embodied/05-%E4%B8%BB%E8%A6%81%E5%88%86%E6%94%AF%E4%B8%8E%E8%BF%81%E7%A7%BB/"
            "06-%E4%B8%96%E7%95%8C%E6%A8%A1%E5%9E%8B%E4%B8%8E%E5%85%B7%E8%BA%AB%E6%99%BA%E8%83%BD-%E4%B8%93%E9%A2%98/"
        )
        self.assertEqual(status, 200)
        self.assertIn(b"Research Atlas", html)

    def test_static_mount_rejects_encoded_parent_traversal(self):
        with self.assertRaises(urllib.error.HTTPError) as rejected:
            self.get("/flowloom/%2e%2e/secret.txt")
        self.assertEqual(rejected.exception.code, 403)

    def test_private_atlas_routes_are_classified_as_private(self):
        handler = paperfield.AppHandler
        self.assertTrue(handler.atlas_requires_private_access("/api/private/bootstrap", "GET"))
        self.assertTrue(handler.atlas_requires_private_access("/api/private/learning-progress", "POST"))
        self.assertTrue(handler.atlas_standard_access_allowed("/api/private/learning-progress", "POST"))
        self.assertFalse(handler.atlas_standard_access_allowed("/api/private/bootstrap", "GET"))
        self.assertTrue(handler.atlas_requires_private_access("/api/papers/context", "POST"))
        self.assertFalse(handler.atlas_requires_private_access("/api/curriculum", "GET"))
        self.assertFalse(handler.atlas_requires_private_access("/api/curriculum/lesson", "GET"))


if __name__ == "__main__":
    unittest.main()
