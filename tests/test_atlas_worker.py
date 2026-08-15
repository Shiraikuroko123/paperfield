import json
import socket
import tempfile
import unittest
from pathlib import Path

import fitz

from src.research_atlas import worker
from src.research_atlas.schema_validation import SchemaValidationError, validate_json_schema


def public_resolver(host, port, type=None):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]


def private_resolver(host, port, type=None):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))]


def worker_config(root, wire_api="chat_completions"):
    return worker.WorkerConfig(
        atlas_url="http://127.0.0.1:8795",
        worker_token="test-worker-token-with-enough-entropy",
        worker_id="test-worker",
        api_key="test-api-key",
        api_base_url="https://model.example/v1",
        model="test-model",
        wire_api=wire_api,
        material_dir=Path(root) / "materials",
        poll_seconds=1,
        lease_seconds=300,
        max_pdf_bytes=1024 * 1024,
        download_timeout=10,
        model_timeout=30,
        max_source_chars=20000,
        max_output_tokens=2000,
        reasoning_effort="",
    )


def stage_payload():
    return {
        "sourceBasis": "fulltext",
        "sourceSha256": "a" * 64,
        "content": {
            "summary": "Evidence-bounded summary.",
            "sections": [
                {
                    "title": "Claim",
                    "body": "The supplied page supports this claim.",
                    "sourceKind": "paper_claim",
                    "confidence": "high",
                    "evidence": [{"page": 1, "direction": "supports"}],
                }
            ],
        },
    }


class FakeResponse:
    def __init__(self, status=200, headers=None, content=b"", payload=None):
        self.status_code = status
        self.headers = headers or {}
        self.content = content
        self.payload = payload
        self.closed = False

    def iter_content(self, chunk_size=65536):
        for index in range(0, len(self.content), chunk_size):
            yield self.content[index:index + chunk_size]

    def json(self):
        if self.payload is None:
            raise ValueError("no json")
        return self.payload

    def close(self):
        self.closed = True


class FakeDownloadSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.urls = []
        self.trust_env = True

    def get(self, url, **kwargs):
        self.urls.append(url)
        return self.responses.pop(0)


class FakeModelSession:
    def __init__(self, payload):
        self.payload = payload
        self.requests = []

    def post(self, url, **kwargs):
        self.requests.append((url, kwargs))
        return FakeResponse(payload=self.payload)


class WorkerMaterialTests(unittest.TestCase):
    def test_public_url_validation_rejects_private_dns_resolution(self):
        with self.assertRaisesRegex(worker.MaterialError, "非公网"):
            worker.validate_public_http_url("https://papers.example/paper.pdf", private_resolver)
        self.assertEqual(
            worker.validate_public_http_url("https://papers.example/paper.pdf#page=2", public_resolver),
            "https://papers.example/paper.pdf",
        )

    def test_downloader_revalidates_redirect_and_checks_pdf_signature(self):
        pdf_bytes = b"%PDF-1.7\nmock-pdf-content"
        session = FakeDownloadSession(
            [
                FakeResponse(302, {"Location": "https://cdn.example/final.pdf"}),
                FakeResponse(200, {"Content-Type": "application/pdf"}, pdf_bytes),
            ]
        )
        downloader = worker.PublicPdfDownloader(1024, 10, session=session, resolver=public_resolver)
        result = downloader.download("https://papers.example/start")
        self.assertEqual(result.content, pdf_bytes)
        self.assertEqual(result.source_url, "https://cdn.example/final.pdf")
        self.assertEqual(len(result.sha256), 64)
        self.assertFalse(session.trust_env)

        invalid = worker.PublicPdfDownloader(
            1024,
            10,
            session=FakeDownloadSession([FakeResponse(200, {}, b"<html>not a pdf</html>")]),
            resolver=public_resolver,
        )
        with self.assertRaisesRegex(worker.MaterialError, "PDF 文件签名"):
            invalid.download("https://papers.example/not-pdf")

    def test_pymupdf_extraction_preserves_page_markers_and_hash(self):
        document = fitz.open()
        first = document.new_page()
        first.insert_text((72, 72), "Page one method evidence")
        second = document.new_page()
        second.insert_text((72, 72), "Page two experiment evidence")
        content = document.tobytes()
        document.close()

        parsed = worker.extract_pdf_text(content)
        self.assertEqual(parsed.page_count, 2)
        self.assertIn("--- 第 1 页 ---", parsed.fulltext)
        self.assertIn("Page two experiment evidence", parsed.fulltext)
        self.assertEqual(parsed.source_sha256, worker.hashlib.sha256(content).hexdigest())


class WorkerModelTests(unittest.TestCase):
    def setUp(self):
        self.schema = json.loads(
            (worker.PACKAGE_DIR / "schemas" / "analysis-stage-complete.schema.json").read_text(encoding="utf-8")
        )

    def test_local_schema_validator_rejects_additional_properties(self):
        payload = stage_payload()
        validate_json_schema(payload, self.schema)
        payload["unexpected"] = True
        with self.assertRaises(SchemaValidationError):
            validate_json_schema(payload, self.schema)

    def test_openai_compatible_call_is_mocked_and_uses_strict_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            config = worker_config(directory)
            session = FakeModelSession(
                {"choices": [{"message": {"content": json.dumps(stage_payload())}}]}
            )
            model = worker.OpenAICompatibleModel(config, self.schema, session=session)
            result = model.generate("Analyze the supplied page.")
            self.assertEqual(result["sourceBasis"], "fulltext")
            request_payload = session.requests[0][1]["json"]
            self.assertTrue(request_payload["response_format"]["json_schema"]["strict"])
            self.assertEqual(request_payload["model"], "test-model")
            provider_schema = request_payload["response_format"]["json_schema"]["schema"]
            self.assertEqual(
                set(provider_schema["required"]),
                set(provider_schema["properties"]),
            )

    def test_responses_incomplete_reason_is_explicit(self):
        with tempfile.TemporaryDirectory() as directory:
            config = worker_config(directory, wire_api="responses")
            session = FakeModelSession(
                {
                    "status": "incomplete",
                    "incomplete_details": {"reason": "max_output_tokens"},
                    "output": [],
                }
            )
            model = worker.OpenAICompatibleModel(config, self.schema, session=session)
            with self.assertRaisesRegex(worker.ModelError, "模型生成未完成：max_output_tokens"):
                model.generate("Analyze the supplied page.")

    def test_responses_refusal_is_explicit(self):
        with tempfile.TemporaryDirectory() as directory:
            config = worker_config(directory, wire_api="responses")
            session = FakeModelSession(
                {
                    "status": "completed",
                    "output": [
                        {
                            "type": "message",
                            "content": [{"type": "refusal", "refusal": "policy restriction"}],
                        }
                    ],
                }
            )
            model = worker.OpenAICompatibleModel(config, self.schema, session=session)
            with self.assertRaisesRegex(worker.ModelError, "模型拒绝生成结构化输出：policy restriction"):
                model.generate("Analyze the supplied page.")

    def test_chat_incomplete_finish_reason_is_explicit(self):
        with tempfile.TemporaryDirectory() as directory:
            config = worker_config(directory)
            session = FakeModelSession(
                {"choices": [{"finish_reason": "length", "message": {"content": ""}}]}
            )
            model = worker.OpenAICompatibleModel(config, self.schema, session=session)
            with self.assertRaisesRegex(worker.ModelError, "模型生成未完成：finish_reason=length"):
                model.generate("Analyze the supplied page.")

    def test_fulltext_evidence_rejects_unverifiable_quote(self):
        payload = stage_payload()
        payload["content"]["sections"][0]["evidence"][0]["quote"] = "invented quotation"
        with self.assertRaisesRegex(worker.ModelError, "无法在解析文本中复核"):
            worker.validate_fulltext_evidence(
                payload,
                "--- 第 1 页 ---\nActual source sentence.",
                "https://papers.example/paper.pdf",
            )


class FakeAtlas:
    def __init__(self):
        self.material_actions = []
        self.stage_actions = []
        self.released = []

    def material_action(self, task_id, action, payload, lease_token):
        self.material_actions.append((task_id, action, payload, lease_token))
        return {}

    def stage_action(self, task_id, stage, action, payload, lease_token):
        self.stage_actions.append((task_id, stage, action, payload, lease_token))
        return {}

    def release(self, task_id, lease_token):
        self.released.append((task_id, lease_token))


class FailingDownloader:
    def download(self, source_url):
        raise worker.MaterialError("mocked download failure")


class WorkerRecoveryTests(unittest.TestCase):
    def test_material_failure_is_recorded_without_real_network_or_model_call(self):
        with tempfile.TemporaryDirectory() as directory:
            config = worker_config(directory)
            atlas = FakeAtlas()
            runner = worker.AtlasWorker(
                config,
                atlas=atlas,
                downloader=FailingDownloader(),
                cache=worker.MaterialCache(config.material_dir),
                analyzer=object(),
            )
            claim = {
                "leaseToken": "lease-token",
                "purpose": "analyze",
                "task": {
                    "id": "task-1",
                    "paper": {"title": "Test paper"},
                    "material": {
                        "status": "authorized",
                        "source_url": "https://papers.example/paper.pdf",
                        "external_processing_authorized": True,
                    },
                    "progress": [{"key": "method", "status": "pending"}],
                },
            }
            with self.assertRaisesRegex(worker.MaterialError, "mocked download failure"):
                runner.process_claim(claim)
            self.assertEqual([item[1] for item in atlas.material_actions], ["download-start", "fail"])
            self.assertEqual(atlas.stage_actions[0][2], "fail")
            self.assertEqual(atlas.released, [("task-1", "lease-token")])


if __name__ == "__main__":
    unittest.main()
