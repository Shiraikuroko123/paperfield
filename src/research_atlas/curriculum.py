from __future__ import annotations

import copy
import hashlib
import json
import re
from pathlib import Path, PurePosixPath
from typing import Any

import bleach
import markdown


CURRICULUM_SCHEMA_VERSION = 1
CURRICULUM_VERSION = "2026.08.14-atlas-lessons.2"
COURSE_CONTENT_ROOT = Path(__file__).resolve().parents[2] / "content" / "courses" / "课程"
COURSE_VENDOR_ROOT = COURSE_CONTENT_ROOT / "assets" / "vendor"
COURSE_MEDIA_SUFFIXES = {".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"}

LESSON_ALLOWED_TAGS = set(bleach.sanitizer.ALLOWED_TAGS).union(
    {
        "article",
        "aside",
        "br",
        "dd",
        "details",
        "div",
        "dl",
        "dt",
        "button",
        "fieldset",
        "figcaption",
        "figure",
        "form",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "img",
        "input",
        "kbd",
        "label",
        "legend",
        "output",
        "p",
        "picture",
        "pre",
        "section",
        "source",
        "span",
        "sub",
        "summary",
        "sup",
        "table",
        "tbody",
        "td",
        "tfoot",
        "th",
        "thead",
        "tr",
    }
)
LESSON_ALLOWED_ATTRIBUTES = {
    "*": ["class", "id", "title", "aria-hidden", "aria-label", "aria-describedby", "aria-live"],
    "a": ["href", "title", "target", "rel"],
    "button": ["type", "class", "data-diagnostic-score"],
    "form": ["class", "data-diagnostic"],
    "img": ["src", "alt", "title", "width", "height", "loading"],
    "input": ["type", "checked", "disabled", "id", "name", "value", "data-diagnostic-domain"],
    "label": ["for", "class"],
    "output": ["class", "id", "aria-live", "data-diagnostic-result"],
    "source": ["media", "srcset", "type"],
    "td": ["align", "colspan", "rowspan"],
    "th": ["align", "colspan", "rowspan", "scope"],
}


COURSE_LESSONS_BY_CHAPTER: dict[str, list[dict[str, str]]] = {
    "llm-math-learning": [
        {"label": "数学基础", "path": "llm/01-数学与PyTorch/01-数学基础"},
        {"label": "概率、损失与优化", "path": "llm/01-数学与PyTorch/03-概率损失与优化"},
    ],
    "llm-token-attention": [
        {"label": "Tokenization 与 Embedding", "path": "llm/02-Transformer与生成/01-Tokenization与Embedding"},
        {"label": "Attention 与 Transformer", "path": "llm/02-Transformer与生成/02-Attention与Transformer"},
        {"label": "解码与 KV Cache", "path": "llm/02-Transformer与生成/03-解码与KVCache"},
    ],
    "llm-pretraining-scaling": [
        {"label": "数据与预训练", "path": "llm/03-数据预训练与SFT/01-数据与预训练"},
        {"label": "Scaling 与训练稳定性", "path": "llm/03-数据预训练与SFT/02-Scaling与训练稳定性"},
    ],
    "llm-sft-peft": [
        {"label": "SFT 与 PEFT", "path": "llm/03-数据预训练与SFT/03-SFT与PEFT"},
    ],
    "llm-alignment-rl": [
        {"label": "对齐公式与项目读法", "path": "llm/04-对齐与RL基础/00-公式与项目读法"},
        {"label": "GRPO 与 KL", "path": "llm/04-对齐与RL基础/08"},
        {"label": "DPO reward 与 hacking", "path": "llm/04-对齐与RL基础/10"},
    ],
    "llm-reasoning-test-time": [
        {"label": "RL 与 test-time scaling", "path": "llm/04-对齐与RL基础/06"},
        {"label": "推理能力的阶段归因", "path": "llm/05-方法与前沿/18"},
    ],
    "llm-rag-agents": [
        {"label": "LLM 全景与核心术语", "path": "llm/00-导学与诊断/03-LLM全景与核心术语"},
        {"label": "工程桥接项目", "path": "llm/07-评测研究与项目/03-工程桥接项目"},
    ],
    "llm-multimodal": [
        {"label": "视觉、Transformer 与生成模型", "path": "embodied/01-数学与学习基础/03-视觉-Transformer与生成模型"},
        {"label": "VLM、VLA 与 Agent", "path": "embodied/04-操作数据与VLA/04-VLM-VLA跨本体与Agent"},
    ],
    "llm-training-serving": [
        {"label": "训练与推理系统总览", "path": "llm/06-训练与推理系统/00-模块说明"},
        {"label": "Continuous batching", "path": "llm/06-训练与推理系统/24"},
        {"label": "异步 RL 流水线", "path": "llm/06-训练与推理系统/27"},
    ],
    "llm-evaluation-research": [
        {"label": "评测与可复现研究", "path": "llm/07-评测研究与项目/01-评测与可复现研究"},
        {"label": "论文复现与消融", "path": "llm/07-评测研究与项目/02-论文复现与消融"},
    ],
    "embodied-robotics-control": [
        {"label": "坐标、位姿与运动学", "path": "embodied/02-机器人系统基础/01-坐标位姿与运动学"},
        {"label": "动力学与机器人控制", "path": "embodied/02-机器人系统基础/02-动力学与机器人控制"},
    ],
    "embodied-perception-state": [
        {"label": "硬件、传感器与安全", "path": "embodied/02-机器人系统基础/03-硬件传感器与安全"},
        {"label": "感知、状态估计与仿真", "path": "embodied/02-机器人系统基础/04-感知状态估计ROS2与仿真"},
    ],
    "embodied-rl-imitation": [
        {"label": "强化学习", "path": "embodied/03-策略学习/01-强化学习"},
        {"label": "模仿学习与生成式策略", "path": "embodied/03-策略学习/03-模仿学习与生成式策略"},
        {"label": "BC 到 ACT", "path": "embodied/03-策略学习/04-BC到ACT-专题"},
    ],
    "embodied-generative-policy": [
        {"label": "Diffusion Policy", "path": "embodied/03-策略学习/05-DiffusionPolicy-专题"},
        {"label": "π0 与 flow matching", "path": "embodied/03-策略学习/06-π0与flow-matching-专题"},
    ],
    "embodied-data-cross-embodiment": [
        {"label": "数据工程与数据集", "path": "embodied/04-操作数据与VLA/02-数据工程与数据集"},
        {"label": "具身数据问题", "path": "embodied/04-操作数据与VLA/03-数据问题-专题"},
        {"label": "跨本体基础模型", "path": "embodied/04-操作数据与VLA/06-跨本体基础模型-专题"},
    ],
    "embodied-vla": [
        {"label": "VLM、VLA 与 Agent", "path": "embodied/04-操作数据与VLA/04-VLM-VLA跨本体与Agent"},
        {"label": "从 VLM 到 VLA", "path": "embodied/04-操作数据与VLA/05-从VLM到VLA-专题"},
    ],
    "embodied-world-model-jepa": [
        {"label": "Sim2Real 与世界模型", "path": "embodied/05-主要分支与迁移/04-Sim2Real与世界模型"},
        {"label": "世界模型专题", "path": "embodied/05-主要分支与迁移/06-世界模型与具身智能-专题"},
    ],
    "embodied-wam": [
        {"label": "世界模型基础（WAM 先修）", "path": "embodied/05-主要分支与迁移/06-世界模型与具身智能-专题"},
    ],
    "embodied-navigation-locomotion-manipulation": [
        {"label": "导航、SLAM 与移动操作", "path": "embodied/05-主要分支与迁移/01-导航SLAM与移动操作"},
        {"label": "运动控制与人形机器人", "path": "embodied/05-主要分支与迁移/02-运动控制与人形机器人"},
        {"label": "机器人操作", "path": "embodied/04-操作数据与VLA/01-机器人操作"},
    ],
    "embodied-evaluation-sim2real": [
        {"label": "Sim2Real 专题", "path": "embodied/05-主要分支与迁移/05-Sim2Real-专题"},
        {"label": "评测与可复现研究", "path": "embodied/06-研究评测与项目/01-评测统计与可复现研究"},
        {"label": "评测危机", "path": "embodied/06-研究评测与项目/02-评测危机-专题"},
    ],
}


def _course_source_title(source: Path) -> str:
    for line in source.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^#\s+(.+?)\s*$", line)
        if not match:
            continue
        title = bleach.clean(match.group(1), tags=set(), strip=True)
        title = re.sub(r"[`*_]", "", title).strip()
        if title:
            return title
    return source.stem


def list_course_lesson_sources(course_root: Path = COURSE_CONTENT_ROOT) -> list[dict[str, str]]:
    """Return every first-party LLM and embodied Markdown lesson in teaching order."""

    root = Path(course_root).resolve()
    lessons: list[dict[str, str]] = []
    for track_id in ("llm", "embodied"):
        track_root = root / track_id
        if not track_root.is_dir():
            continue
        for source in sorted(track_root.rglob("*.md"), key=lambda path: path.as_posix()):
            relative = source.relative_to(root).as_posix()
            lessons.append(
                {
                    "track_id": track_id,
                    "path": relative[:-3],
                    "label": _course_source_title(source),
                }
            )
    return lessons


def _fallback_course_chapter(path: str) -> str:
    """Attach a source lesson to the closest Atlas knowledge chapter."""

    name = path.rsplit("/", 1)[-1]
    if path.startswith("llm/"):
        if path.startswith("llm/02-"):
            return "llm-token-attention"
        if path.startswith("llm/03-"):
            return "llm-sft-peft" if name.startswith("03-") else "llm-pretraining-scaling"
        if path.startswith("llm/04-"):
            if name.removesuffix(".md") in {"09", "11"}:
                return "llm-training-serving"
            return "llm-reasoning-test-time" if name.removesuffix(".md") == "06" else "llm-alignment-rl"
        if path.startswith("llm/05-"):
            return "llm-reasoning-test-time"
        if path.startswith("llm/06-"):
            return "llm-training-serving"
        if path.startswith("llm/07-") or path.startswith("llm/附录/") or name == "35题索引":
            return "llm-evaluation-research"
        return "llm-math-learning"

    if path.startswith("embodied/02-"):
        return "embodied-perception-state" if name.startswith(("03-", "04-")) else "embodied-robotics-control"
    if path.startswith("embodied/03-"):
        return "embodied-generative-policy" if name.startswith(("05-", "06-")) else "embodied-rl-imitation"
    if path.startswith("embodied/04-"):
        if name.startswith("01-"):
            return "embodied-navigation-locomotion-manipulation"
        if name.startswith(("02-", "03-", "06-")):
            return "embodied-data-cross-embodiment"
        return "embodied-vla"
    if path.startswith("embodied/05-"):
        if name.startswith(("01-", "02-", "03-")):
            return "embodied-navigation-locomotion-manipulation"
        if name.startswith(("04-", "06-")):
            return "embodied-world-model-jepa"
        return "embodied-evaluation-sim2real"
    if path.startswith("embodied/06-") or path.startswith("embodied/附录/"):
        return "embodied-evaluation-sim2real"
    if path.startswith("embodied/01-") and name.startswith("03-"):
        return "embodied-perception-state"
    return "embodied-robotics-control"


def _complete_course_lesson_map(
    curated: dict[str, list[dict[str, str]]],
    sources: list[dict[str, str]],
) -> dict[str, list[dict[str, str]]]:
    completed = copy.deepcopy(curated)
    for source in sources:
        track_prefix = f"{source['track_id']}-"
        linked_in_source_track = any(
            chapter_id.startswith(track_prefix)
            and any(item["path"] == source["path"] for item in lessons)
            for chapter_id, lessons in completed.items()
        )
        if not linked_in_source_track:
            completed[_fallback_course_chapter(source["path"])].append(
                {"label": source["label"], "path": source["path"]}
            )
    for lessons in completed.values():
        unique = {item["path"]: item for item in lessons}
        lessons[:] = sorted(
            unique.values(),
            key=lambda item: (0 if item["path"].endswith("/README") else 1, item["path"]),
        )
    return completed


COURSE_LESSON_SOURCES = list_course_lesson_sources()
COURSE_LESSONS_BY_CHAPTER = _complete_course_lesson_map(
    COURSE_LESSONS_BY_CHAPTER,
    COURSE_LESSON_SOURCES,
)


def normalize_course_lesson_path(value: str) -> str:
    raw = str(value or "").strip().replace("\\", "/")
    raw = re.sub(r"/+", "/", raw).strip("/")
    if raw.endswith("/index.html"):
        raw = raw[: -len("/index.html")]
    elif raw.endswith(".html"):
        raw = raw[:-5]
    elif raw.endswith(".md"):
        raw = raw[:-3]
    if raw in {"", "index", "README"}:
        return "README"
    parts = PurePosixPath(raw).parts
    if not parts or parts[0] not in {"embodied", "llm"}:
        raise ValueError("课程正文路径不属于 Atlas 教材")
    if any(part in {"", ".", ".."} or part.startswith(".") for part in parts):
        raise ValueError("课程正文路径无效")
    return "/".join(parts)


def _course_lesson_source(path: str, course_root: Path) -> tuple[str, Path]:
    normalized = normalize_course_lesson_path(path)
    root = Path(course_root).resolve()
    relative = PurePosixPath(normalized)
    base = root.joinpath(*relative.parts)
    candidates = [base.with_suffix(".md"), base / "README.md"]
    if normalized == "README":
        candidates = [root / "README.md"]
    for candidate in candidates:
        resolved = candidate.resolve()
        if not resolved.is_relative_to(root):
            continue
        if resolved.is_file():
            canonical = resolved.relative_to(root).as_posix()
            return canonical[:-3] if canonical.endswith(".md") else canonical, resolved
    raise ValueError("课程正文不存在")


def resolve_course_asset_path(path: str, course_root: Path = COURSE_CONTENT_ROOT) -> Path:
    """Resolve an allowlisted course image without exposing arbitrary repository files."""

    raw = str(path or "").strip().replace("\\", "/")
    raw = re.sub(r"/+", "/", raw).strip("/")
    parts = PurePosixPath(raw).parts
    if (
        not parts
        or parts[0] not in {"embodied", "llm"}
        or any(part in {"", ".", ".."} or part.startswith(".") for part in parts)
        or Path(parts[-1]).suffix.casefold() not in COURSE_MEDIA_SUFFIXES
    ):
        raise ValueError("课程媒体路径无效")
    root = Path(course_root).resolve()
    source = root.joinpath(*parts).resolve()
    if not source.is_relative_to(root) or not source.is_file():
        raise ValueError("课程媒体不存在")
    return source


def _lesson_context(path: str) -> tuple[list[str], str]:
    chapter_ids: list[str] = []
    label = ""
    for chapter_id, lessons in COURSE_LESSONS_BY_CHAPTER.items():
        for lesson in lessons:
            if lesson["path"] != path:
                continue
            chapter_ids.append(chapter_id)
            if not label:
                label = lesson["label"]
    return chapter_ids, label


def _flatten_toc(tokens: list[dict[str, Any]]) -> list[dict[str, Any]]:
    flattened: list[dict[str, Any]] = []
    for token in tokens:
        name = bleach.clean(str(token.get("name") or ""), tags=set(), strip=True)
        flattened.append(
            {
                "id": str(token.get("id") or ""),
                "title": name,
                "level": int(token.get("level") or 1),
            }
        )
        flattened.extend(_flatten_toc(token.get("children") or []))
    return flattened


def load_course_lesson(path: str, course_root: Path = COURSE_CONTENT_ROOT) -> dict[str, Any]:
    """Render one repository-owned lesson for the embedded Atlas reader."""

    normalized, source = _course_lesson_source(path, course_root)
    text = source.read_text(encoding="utf-8")
    extensions = [
        "abbr",
        "admonition",
        "attr_list",
        "def_list",
        "fenced_code",
        "footnotes",
        "md_in_html",
        "sane_lists",
        "tables",
        "toc",
    ]
    extension_configs: dict[str, Any] = {"toc": {"permalink": False}}
    try:
        import pymdownx  # noqa: F401
    except ImportError:
        pass
    else:
        extensions.extend(
            [
                "pymdownx.arithmatex",
                "pymdownx.details",
                "pymdownx.tabbed",
                "pymdownx.tasklist",
            ]
        )
        extension_configs["pymdownx.arithmatex"] = {"generic": True}
        extension_configs["pymdownx.tasklist"] = {"custom_checkbox": True}
    renderer = markdown.Markdown(extensions=extensions, extension_configs=extension_configs)
    rendered = renderer.convert(text)
    safe_html = bleach.clean(
        rendered,
        tags=LESSON_ALLOWED_TAGS,
        attributes=LESSON_ALLOWED_ATTRIBUTES,
        protocols={"http", "https", "mailto"},
        strip=True,
        strip_comments=True,
    )
    chapter_ids, mapped_label = _lesson_context(normalized)
    heading = re.search(r"^#\s+(.+?)\s*$", text, flags=re.MULTILINE)
    title = mapped_label or (heading.group(1) if heading else source.stem)
    title = re.sub(r"[`*_]", "", title).strip()
    sha256 = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return {
        "schema_version": 1,
        "path": normalized,
        "track_id": normalized.split("/", 1)[0] if "/" in normalized else "",
        "chapter_ids": chapter_ids,
        "title": title,
        "html": safe_html,
        "toc": _flatten_toc(getattr(renderer, "toc_tokens", [])),
        "source_path": f"content/courses/课程/{source.relative_to(Path(course_root).resolve()).as_posix()}",
        "source_url": (
            "https://github.com/Shiraikuroko123/paperfield/blob/main/"
            f"content/courses/课程/{source.relative_to(Path(course_root).resolve()).as_posix()}"
        ),
        "source_sha256": sha256,
        "content_chars": len(text),
        "reading_minutes": max(1, round(len(text) / 650)),
        "has_math": bool(re.search(r"\$\$|\\\(|\\\[", text)),
        "mermaid_diagrams": len(re.findall(r"^```mermaid\s*$", text, flags=re.MULTILINE)),
    }


def _paper(reference: str, title: str, role: str = "锚点论文", evidence: str = "verified_reference") -> dict[str, str]:
    return {
        "ref": reference,
        "title": title,
        "role": role,
        "evidence_status": evidence,
    }


def _concept(concept_id: str, name: str, summary: str) -> dict[str, str]:
    return {"id": concept_id, "name": name, "summary": summary}


TRACKS: list[dict[str, Any]] = [
    {
        "id": "llm",
        "title": "大模型研究路线",
        "short_title": "LLM",
        "summary": "从表示与 Transformer 出发，沿预训练、后训练、推理、代理和系统评测进入前沿论文。",
        "outcome": "能够从目标函数、估计器、数据、计算与证据五个维度拆解一篇新论文。",
        "modules": [
            {
                "id": "llm-foundations",
                "order": 1,
                "title": "表示与生成基础",
                "summary": "先建立符号、概率、优化与序列建模共同语言。",
                "chapters": [
                    {
                        "id": "llm-math-learning",
                        "order": 1,
                        "code": "L1",
                        "title": "概率、优化与学习目标",
                        "kind": "foundation",
                        "status": "stable",
                        "summary": "把最大似然、交叉熵、KL、梯度估计和泛化边界放进同一套符号系统。",
                        "prerequisites": [],
                        "learning_goals": [
                            "从概率模型写出负对数似然与 token 级交叉熵",
                            "区分经验风险、代理目标和最终任务指标",
                            "识别有偏估计、方差与优化稳定性之间的权衡",
                        ],
                        "theory": ["最大似然估计", "经验风险最小化", "KL 散度与分布偏移", "随机梯度估计"],
                        "math_focus": ["-log pθ(x)", "KL(p||q)", "E[g(x)] 的 Monte Carlo 估计", "链式法则与反向传播"],
                        "research_pain_points": ["训练 loss 与真实能力并不等价", "离线数据分布不能覆盖部署时输入", "尺度增长会改变优化与统计假设"],
                        "assessment": "这是后续所有方法比较的坐标系。只记公式不检查随机变量、归一化维度和采样分布，无法判断新 loss 是否真的改变了问题。",
                        "concepts": [
                            _concept("maximum-likelihood", "最大似然", "用观测数据选择使其概率最大的参数。"),
                            _concept("kl-divergence", "KL 散度", "衡量一个分布相对另一个分布的信息损失，非对称且不是距离。"),
                            _concept("gradient-estimator", "梯度估计器", "用样本近似总体梯度，其偏差和方差决定可训练性。"),
                        ],
                        "papers": [],
                        "projects": [],
                        "frontier_queries": ["optimization", "scaling law"],
                    },
                    {
                        "id": "llm-token-attention",
                        "order": 2,
                        "code": "L2",
                        "title": "Token、Attention 与 Transformer",
                        "kind": "core",
                        "status": "stable",
                        "summary": "理解离散 token 如何进入连续表示，以及注意力如何在上下文中路由信息。",
                        "prerequisites": ["llm-math-learning"],
                        "learning_goals": [
                            "推导缩放点积注意力并解释 mask 的作用",
                            "区分 tokenization、embedding、position encoding 与 context mixing",
                            "从序列长度和隐藏维度分析计算与内存瓶颈",
                        ],
                        "theory": ["子词建模", "自注意力", "残差网络", "位置表示"],
                        "math_focus": ["softmax(QKᵀ/√d)V", "causal mask", "O(T²D) 与 O(TD²)", "残差路径的梯度传播"],
                        "research_pain_points": ["长上下文的二次注意力与 KV cache", "token 边界引入的表示偏差", "位置外推和检索精度下降"],
                        "assessment": "Transformer 是可变的设计族，不是一个固定模块。比较论文时要把位置编码、norm、attention 变体和训练长度逐项对齐。",
                        "concepts": [
                            _concept("tokenization", "Tokenization", "把离散输入映射为有限词表中的序列。"),
                            _concept("self-attention", "Self-Attention", "由同一序列产生查询、键和值并进行内容寻址。"),
                            _concept("kv-cache", "KV Cache", "自回归解码时复用历史键和值，换取显存以减少重复计算。"),
                        ],
                        "papers": [
                            _paper("arxiv:1508.07909", "Neural Machine Translation of Rare Words with Subword Units", "子词基础"),
                            _paper("arxiv:1706.03762", "Attention Is All You Need", "Transformer 锚点"),
                        ],
                        "projects": [],
                        "frontier_queries": ["long context", "attention architecture", "tokenization"],
                    },
                ],
            },
            {
                "id": "llm-training",
                "order": 2,
                "title": "预训练与适配",
                "summary": "理解能力如何从数据、计算和训练配方中形成。",
                "chapters": [
                    {
                        "id": "llm-pretraining-scaling",
                        "order": 3,
                        "code": "L3",
                        "title": "预训练、数据与 Scaling",
                        "kind": "core",
                        "status": "stable",
                        "summary": "研究模型容量、数据规模、数据质量和计算预算如何共同决定预训练结果。",
                        "prerequisites": ["llm-token-attention"],
                        "learning_goals": ["解释自回归预训练目标", "区分参数扩展、数据扩展与计算最优", "审计数据配比、去重和污染风险"],
                        "theory": ["自监督学习", "经验缩放律", "计算最优分配", "数据混合"],
                        "math_focus": ["L(N,D)=A/N^α+B/D^β+E", "训练 FLOPs 约 6ND", "幂律拟合与外推误差"],
                        "research_pain_points": ["高质量数据不足", "benchmark 污染", "小范围幂律被过度外推", "MoE 与长上下文改变成本模型"],
                        "assessment": "Scaling law 是特定模型族和预算区间内的经验关系，不是自然定律。可信论文必须同时报告数据、计算和外推区间。",
                        "concepts": [
                            _concept("autoregressive-pretraining", "自回归预训练", "根据前缀预测下一个 token 的条件最大似然训练。"),
                            _concept("scaling-law", "Scaling Law", "用经验幂律近似性能与模型、数据或计算之间的关系。"),
                            _concept("data-mixture", "数据混合", "控制不同来源、任务和质量层数据在训练中的权重。"),
                        ],
                        "papers": [
                            _paper("arxiv:2001.08361", "Scaling Laws for Neural Language Models"),
                            _paper("arxiv:2203.15556", "Training Compute-Optimal Large Language Models", "计算最优锚点"),
                        ],
                        "projects": [],
                        "frontier_queries": ["data curation", "scaling law", "mixture of experts"],
                    },
                    {
                        "id": "llm-sft-peft",
                        "order": 4,
                        "code": "L4",
                        "title": "SFT、PEFT 与能力适配",
                        "kind": "core",
                        "status": "stable",
                        "summary": "从监督数据构造、loss mask 到低秩适配，理解基础模型如何变成可用模型。",
                        "prerequisites": ["llm-pretraining-scaling"],
                        "learning_goals": ["写出 response-only SFT 目标", "解释 LoRA 的低秩假设", "选择全参、LoRA、QLoRA 或 RAG 的适用边界"],
                        "theory": ["条件最大似然", "低秩参数化", "量化误差", "灾难性遗忘"],
                        "math_focus": ["W'=W+BA", "rank r 与参数量", "loss mask 的归一化", "量化尺度与误差"],
                        "research_pain_points": ["高质量指令数据昂贵", "表面格式对齐掩盖能力退化", "低秩容量是否覆盖目标任务"],
                        "assessment": "PEFT 降低的是适配成本，不自动提高数据质量或泛化。公平比较必须对齐训练 token、基础模型、rank 和解码设置。",
                        "concepts": [
                            _concept("supervised-finetuning", "监督微调", "在输入输出示例上继续最小化条件生成损失。"),
                            _concept("lora", "LoRA", "冻结原权重并学习低秩增量矩阵。"),
                            _concept("loss-mask", "Loss Mask", "决定哪些 token 对优化目标贡献梯度。"),
                        ],
                        "papers": [
                            _paper("arxiv:2106.09685", "LoRA: Low-Rank Adaptation of Large Language Models"),
                            _paper("arxiv:2305.14314", "QLoRA: Efficient Finetuning of Quantized LLMs"),
                        ],
                        "projects": [],
                        "frontier_queries": ["parameter efficient finetuning", "instruction tuning"],
                    },
                ],
            },
            {
                "id": "llm-posttraining",
                "order": 3,
                "title": "后训练与推理",
                "summary": "把偏好、奖励、采样和测试时计算放进同一个决策框架。",
                "chapters": [
                    {
                        "id": "llm-alignment-rl",
                        "order": 5,
                        "code": "L5",
                        "title": "RLHF、DPO 与在线强化学习",
                        "kind": "core",
                        "status": "active",
                        "summary": "区分 SFT、偏好建模、策略优化和 verifier 驱动的在线学习。",
                        "prerequisites": ["llm-sft-peft"],
                        "learning_goals": ["推导 PPO ratio 与 clipping", "从 Bradley-Terry 模型推导 DPO", "识别 reward hacking、off-policy 偏差和长度偏置"],
                        "theory": ["策略梯度", "KL 正则化控制", "偏好最大似然", "重要性采样"],
                        "math_focus": ["E[min(rA,clip(r)A)]", "β log πθ/πref", "pairwise logistic loss", "group-relative advantage"],
                        "research_pain_points": ["奖励模型可被利用", "在线 rollout 成本高", "不同 reducer 与采样配方造成不可比", "verifier 覆盖有限"],
                        "assessment": "许多新算法主要改变样本权重、归一化或数据流。只有在同 prompt、verifier、rollout token 和基础模型下做替换消融，才能判断方法增益。",
                        "concepts": [
                            _concept("rlhf", "RLHF", "用人类偏好训练奖励信号并优化语言模型策略。"),
                            _concept("dpo", "DPO", "把 KL 正则化最优策略代入偏好模型得到的直接分类目标。"),
                            _concept("importance-ratio", "Importance Ratio", "用新旧策略概率比修正采样分布差异。"),
                        ],
                        "papers": [
                            _paper("arxiv:2203.02155", "Training Language Models to Follow Instructions with Human Feedback", "RLHF 锚点"),
                            _paper("arxiv:2305.18290", "Direct Preference Optimization: Your Language Model is Secretly a Reward Model", "DPO 锚点"),
                            _paper("arxiv:1707.06347", "Proximal Policy Optimization Algorithms", "PPO 基础"),
                        ],
                        "projects": [],
                        "frontier_queries": ["LLM reinforcement learning", "verifiable reward", "preference optimization"],
                    },
                    {
                        "id": "llm-reasoning-test-time",
                        "order": 6,
                        "code": "L6",
                        "title": "推理与 Test-Time Compute",
                        "kind": "frontier",
                        "status": "active",
                        "summary": "研究显式推理轨迹、搜索、采样与验证器如何把额外推理预算转化为答案质量。",
                        "prerequisites": ["llm-alignment-rl"],
                        "learning_goals": ["区分过程监督与结果监督", "分解 pass@k、self-consistency 与搜索", "审计推理 token、并行样本和 verifier 成本"],
                        "theory": ["潜变量推理轨迹", "采样与重排序", "搜索", "测试时缩放"],
                        "math_focus": ["pass@k", "majority vote", "P(answer|trace)P(trace|prompt)", "预算约束下的最优分配"],
                        "research_pain_points": ["长思维链不等于正确推理", "训练数据泄漏", "评测只计答案不计推理成本", "verifier 可能成为新瓶颈"],
                        "assessment": "应把生成器、搜索策略、采样数、验证器和停止规则分开消融。只比较最终准确率会把更多算力误写成新算法。",
                        "concepts": [
                            _concept("chain-of-thought", "Chain-of-Thought", "在答案前生成中间推理文本的提示或训练范式。"),
                            _concept("test-time-compute", "Test-Time Compute", "在参数固定时增加采样、搜索或验证预算。"),
                            _concept("verifier", "Verifier", "对候选解答或中间步骤提供可训练或规则化判别信号。"),
                        ],
                        "papers": [
                            _paper("arxiv:2201.11903", "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models"),
                            _paper("arxiv:2203.11171", "Self-Consistency Improves Chain of Thought Reasoning in Language Models"),
                            _paper("arxiv:2501.12948", "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning", "前沿锚点"),
                        ],
                        "projects": [],
                        "frontier_queries": ["reasoning model", "test-time scaling", "process reward"],
                    },
                ],
            },
            {
                "id": "llm-augmented",
                "order": 4,
                "title": "外部知识与多模态",
                "summary": "研究模型如何访问环境、工具、记忆和非文本信号。",
                "chapters": [
                    {
                        "id": "llm-rag-agents",
                        "order": 7,
                        "code": "L7",
                        "title": "RAG、记忆、工具调用与 Agent",
                        "kind": "frontier",
                        "status": "active",
                        "summary": "把检索、规划、调用、观察和记忆看成可测量的闭环，而不是把 Agent 当作标签。",
                        "prerequisites": ["llm-reasoning-test-time"],
                        "learning_goals": ["分解检索召回、生成忠实度与端到端成功率", "设计工具调用状态机", "区分上下文记忆、参数记忆与外部记忆"],
                        "theory": ["信息检索", "部分可观测决策过程", "规划与执行", "外部记忆"],
                        "math_focus": ["P(y|x,z)P(z|x)", "recall@k 与 MRR", "轨迹成功概率", "延迟与成本预算"],
                        "research_pain_points": ["检索错误会被流畅生成掩盖", "长轨迹误差复合", "工具接口变化", "基准容易过拟合"],
                        "assessment": "Agent 系统的增益必须落到检索、规划、工具选择或恢复机制中的具体一项，并报告端到端失败分布。",
                        "concepts": [
                            _concept("rag", "RAG", "从外部语料检索证据并条件化生成。"),
                            _concept("tool-use", "工具调用", "模型通过结构化接口触发外部能力并消费结果。"),
                            _concept("agent-loop", "Agent Loop", "观察、决策、行动、反馈和状态更新组成的循环。"),
                        ],
                        "papers": [
                            _paper("arxiv:2005.11401", "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"),
                            _paper("arxiv:2210.03629", "ReAct: Synergizing Reasoning and Acting in Language Models"),
                            _paper("arxiv:2302.04761", "Toolformer: Language Models Can Teach Themselves to Use Tools"),
                        ],
                        "projects": [],
                        "frontier_queries": ["LLM agent", "retrieval augmented generation", "memory"],
                    },
                    {
                        "id": "llm-multimodal",
                        "order": 8,
                        "code": "L8",
                        "title": "多模态表征与生成",
                        "kind": "core",
                        "status": "active",
                        "summary": "理解视觉、音频和文本如何进入共享或协同表示，并区分感知、对齐与生成能力。",
                        "prerequisites": ["llm-token-attention", "llm-sft-peft"],
                        "learning_goals": ["比较对比学习、投影器和 cross-attention", "区分视觉语言预训练与指令微调", "审计分辨率、token 数和模态数据配比"],
                        "theory": ["对比学习", "跨模态对齐", "多模态 tokenization", "条件生成"],
                        "math_focus": ["InfoNCE", "cross-attention", "图像 patch 数与上下文成本", "多任务损失加权"],
                        "research_pain_points": ["语言先验压过视觉证据", "细粒度空间关系损失", "多模态幻觉", "训练数据难以审计"],
                        "assessment": "多模态模型的语言能力可能掩盖视觉失败。评测必须包含感知控制项、反事实图像和可定位证据。",
                        "concepts": [
                            _concept("contrastive-alignment", "对比对齐", "拉近匹配模态表示并推远不匹配样本。"),
                            _concept("vision-projector", "视觉投影器", "把视觉编码器输出映射到语言模型可消费的表示空间。"),
                            _concept("multimodal-hallucination", "多模态幻觉", "输出与输入视觉或其他模态证据不一致的内容。"),
                        ],
                        "papers": [
                            _paper("arxiv:2103.00020", "Learning Transferable Visual Models From Natural Language Supervision", "CLIP 锚点"),
                            _paper("arxiv:2304.08485", "Visual Instruction Tuning", "LLaVA 锚点"),
                        ],
                        "projects": [],
                        "frontier_queries": ["multimodal language model", "vision language reasoning"],
                    },
                ],
            },
            {
                "id": "llm-systems-evaluation",
                "order": 5,
                "title": "系统与科学判断",
                "summary": "把训练、推理效率和可信评测纳入方法结论。",
                "chapters": [
                    {
                        "id": "llm-training-serving",
                        "order": 9,
                        "code": "L9",
                        "title": "训练并行与推理系统",
                        "kind": "systems",
                        "status": "active",
                        "summary": "理解模型并行、显存分片、连续批处理和 KV 管理如何限定可研究的问题。",
                        "prerequisites": ["llm-pretraining-scaling", "llm-token-attention"],
                        "learning_goals": ["建立参数、激活、优化器和 KV cache 显存账本", "比较数据/张量/流水线并行", "解释连续批处理与分页 KV"],
                        "theory": ["并行计算", "通信复杂度", "排队与批处理", "内存虚拟化"],
                        "math_focus": ["all-reduce 通信量", "pipeline bubble", "吞吐与延迟", "KV bytes/token"],
                        "research_pain_points": ["算法收益依赖特定 kernel 和硬件", "吞吐测试条件不统一", "训练与推理栈快速变更"],
                        "assessment": "系统论文必须固定硬件、精度、序列分布、batch 策略和正确性。单一 tokens/s 不能支撑通用优越性。",
                        "concepts": [
                            _concept("tensor-parallel", "张量并行", "把单层矩阵运算拆到多个设备并协同执行。"),
                            _concept("zero", "ZeRO", "对优化器状态、梯度和参数进行分片以降低单卡冗余。"),
                            _concept("paged-attention", "PagedAttention", "用分页式 KV 内存管理降低碎片并支持动态请求。"),
                        ],
                        "papers": [
                            _paper("arxiv:1909.08053", "Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism"),
                            _paper("arxiv:1910.02054", "ZeRO: Memory Optimizations Toward Training Trillion Parameter Models"),
                            _paper("arxiv:2309.06180", "Efficient Memory Management for Large Language Model Serving with PagedAttention"),
                        ],
                        "projects": [],
                        "frontier_queries": ["LLM serving", "distributed training", "inference efficiency"],
                    },
                    {
                        "id": "llm-evaluation-research",
                        "order": 10,
                        "code": "L10",
                        "title": "评测、可靠性与研究复现",
                        "kind": "research",
                        "status": "stable",
                        "summary": "用可复现协议连接论文主张、实验设计、统计不确定性、失败样本与发布边界。",
                        "prerequisites": ["llm-alignment-rl", "llm-rag-agents", "llm-training-serving"],
                        "learning_goals": ["把每个主张映射到基线、数据和统计量", "识别污染、选择偏差和缺失对照", "设计最小可证伪消融"],
                        "theory": ["实验设计", "统计不确定性", "可复现性", "模型与数据文档"],
                        "math_focus": ["置信区间", "效应量", "多重比较", "paired bootstrap"],
                        "research_pain_points": ["基准饱和与数据污染", "只报告平均分", "基线预算不匹配", "负结果与失败案例缺失"],
                        "assessment": "真正的前沿判断来自证据差异，而不是论文数量或新名词。先重建实验合同，再评价方法是否改变了能力边界。",
                        "concepts": [
                            _concept("claim-evidence-map", "主张-证据映射", "把论文每项主张绑定到可复核实验和来源定位。"),
                            _concept("ablation", "消融实验", "在其余条件受控时移除或替换一个机制。"),
                            _concept("reproducibility", "可复现性", "第三方能依据公开材料重建关键实验结果。"),
                        ],
                        "papers": [
                            _paper("arxiv:1810.03993", "Model Cards for Model Reporting"),
                            _paper("arxiv:1803.09010", "Datasheets for Datasets"),
                        ],
                        "projects": [],
                        "frontier_queries": ["LLM evaluation", "benchmark contamination", "reproducibility"],
                    },
                ],
            },
        ],
    },
    {
        "id": "embodied",
        "title": "具身智能研究路线",
        "short_title": "Embodied AI",
        "summary": "从机器人系统与策略学习进入 VLA、世界模型、JEPA 和 World Action Models。",
        "outcome": "能够判断一个具身方法究竟改善了感知、预测、规划、控制、数据效率还是评测协议。",
        "modules": [
            {
                "id": "embodied-foundations",
                "order": 1,
                "title": "机器人与表征基础",
                "summary": "先建立坐标、动力学、闭环控制和部分可观测性。",
                "chapters": [
                    {
                        "id": "embodied-robotics-control",
                        "order": 1,
                        "code": "E1",
                        "title": "机器人、MDP 与闭环控制",
                        "kind": "foundation",
                        "status": "stable",
                        "summary": "把坐标与动力学、状态估计、规划、控制、强化学习和系统延迟放进闭环。",
                        "prerequisites": [],
                        "learning_goals": ["区分状态、观测、动作和控制目标", "解释 MDP/POMDP 与反馈控制的接口", "识别控制频率、延迟和动作空间约束"],
                        "theory": ["刚体运动与动力学", "MDP/POMDP", "反馈控制", "模型预测控制"],
                        "math_focus": ["SE(3) 位姿", "xₜ₊₁=f(xₜ,uₜ)", "Bellman 方程", "闭环稳定性与延迟"],
                        "research_pain_points": ["仿真动力学与真机不一致", "高层动作不可直接执行", "观测延迟和控制带宽常被论文忽略"],
                        "assessment": "任何端到端模型最终都受机器人形态、动作接口和闭环频率约束。忽略这些条件的跨模型比较没有解释力。",
                        "concepts": [
                            _concept("mdp", "MDP", "用状态、动作、转移、奖励和折扣描述序贯决策。"),
                            _concept("feedback-control", "反馈控制", "根据当前误差持续修正执行，而非一次性开环输出。"),
                            _concept("action-space", "动作空间", "策略可输出的控制量及其坐标系、范围和频率。"),
                        ],
                        "papers": [
                            _paper("arxiv:1707.06347", "Proximal Policy Optimization Algorithms", "策略优化基础"),
                            _paper("arxiv:1703.06907", "Domain Randomization for Transferring Deep Neural Networks from Simulation to the Real World", "迁移锚点"),
                        ],
                        "projects": [],
                        "frontier_queries": ["robot control", "sim-to-real", "model predictive control"],
                    },
                    {
                        "id": "embodied-perception-state",
                        "order": 2,
                        "code": "E2",
                        "title": "感知、状态估计与自监督表征",
                        "kind": "core",
                        "status": "active",
                        "summary": "研究语义、几何、时间和本体状态如何形成可供控制使用的表示。",
                        "prerequisites": ["embodied-robotics-control", "llm-token-attention"],
                        "learning_goals": ["区分单帧感知、时序状态估计与预测表示", "比较语义视觉和空间视觉特征", "解释 joint embedding 的训练信号"],
                        "theory": ["视觉表征学习", "滤波与状态估计", "时序建模", "Joint-Embedding Predictive Architecture"],
                        "math_focus": ["p(zₜ|o≤t)", "contrastive/non-contrastive loss", "latent prediction", "可观测性"],
                        "research_pain_points": ["互联网语义特征缺少毫米级几何", "像素预测浪费容量", "冻结表征与任务适配冲突", "遮挡和接触状态难观测"],
                        "assessment": "强视觉基座不自动等于强控制表征。必须用动作相关探针、空间扰动和闭环任务验证表示是否保留可执行信息。",
                        "concepts": [
                            _concept("state-estimation", "状态估计", "从噪声和部分观测中推断控制所需的隐藏状态。"),
                            _concept("jepa", "JEPA", "在表征空间预测目标而非逐像素重建。"),
                            _concept("semantic-geometric-features", "语义-几何双表征", "结合类别语义与空间细节以服务操作。"),
                        ],
                        "papers": [
                            _paper("arxiv:2304.07193", "DINOv2: Learning Robust Visual Features without Supervision"),
                            _paper(
                                "arxiv:2404.08471",
                                "Revisiting Feature Prediction for Learning Visual Representations from Video",
                                "V-JEPA / JEPA 锚点",
                            ),
                        ],
                        "projects": [],
                        "frontier_queries": ["robot representation learning", "JEPA", "video representation"],
                    },
                ],
            },
            {
                "id": "embodied-policy-learning",
                "order": 2,
                "title": "策略学习",
                "summary": "从交互式强化学习进入示范学习和生成式动作分布。",
                "chapters": [
                    {
                        "id": "embodied-rl-imitation",
                        "order": 3,
                        "code": "E3",
                        "title": "强化学习、模仿学习与 ACT",
                        "kind": "core",
                        "status": "stable",
                        "summary": "理解奖励优化与示范学习的不同数据合同，以及行为克隆在闭环中的分布偏移。",
                        "prerequisites": ["embodied-robotics-control", "embodied-perception-state"],
                        "learning_goals": ["推导行为克隆目标与复合误差", "解释 DAgger 的分布修正", "拆解 ACT 的动作分块、CVAE 与时间集成"],
                        "theory": ["策略梯度", "行为克隆", "数据聚合", "条件变分自编码器"],
                        "math_focus": ["min E[-log π(a|o)]", "covariate shift", "ELBO", "action chunk 与 temporal ensemble"],
                        "research_pain_points": ["真机 RL 交互昂贵", "示范不覆盖恢复状态", "动作分块降低反应性", "任务与机器人间数据不可直接复用"],
                        "assessment": "ACT 改善动作连贯性和误差累积，但没有消除分布外状态。评价时必须加入扰动恢复，而不只看静态成功视频。",
                        "concepts": [
                            _concept("behavior-cloning", "Behavior Cloning", "用专家观测动作对监督训练策略。"),
                            _concept("compounding-error", "复合误差", "小偏差把策略带离示范分布并在闭环中累积。"),
                            _concept("action-chunking", "Action Chunking", "一次预测一段未来动作以学习连贯技能。"),
                        ],
                        "papers": [
                            _paper("arxiv:2304.13705", "Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware", "ACT 锚点"),
                            _paper("arxiv:2109.11978", "Learning to Walk in Minutes Using Massively Parallel Deep Reinforcement Learning", "并行 RL 锚点"),
                        ],
                        "projects": [{"label": "LeRobot", "url": "https://github.com/huggingface/lerobot", "role": "数据与策略实现"}],
                        "frontier_queries": ["imitation learning", "action chunking", "robot reinforcement learning"],
                    },
                    {
                        "id": "embodied-generative-policy",
                        "order": 4,
                        "code": "E4",
                        "title": "Diffusion 与 Flow Policy",
                        "kind": "core",
                        "status": "active",
                        "summary": "把机器人策略视为条件动作分布，比较扩散、flow matching 和自回归动作头。",
                        "prerequisites": ["embodied-rl-imitation", "llm-math-learning"],
                        "learning_goals": ["写出条件去噪与 flow matching 目标", "解释多模态动作分布", "比较采样步数、控制频率和闭环反应性"],
                        "theory": ["扩散生成模型", "score matching", "flow matching", "receding-horizon control"],
                        "math_focus": ["εθ(xₜ,o,t)", "dx/dt=vθ(x,t|o)", "噪声到动作路径", "滚动时域执行"],
                        "research_pain_points": ["多步采样影响实时性", "训练目标与闭环成功率间有鸿沟", "动作归一化和时间对齐敏感", "不同执行协议难公平比较"],
                        "assessment": "Flow matching 不是天然优于扩散。要固定网络、数据、动作 horizon、积分步数和控制频率，才能判断路径或求解器带来的真实收益。",
                        "concepts": [
                            _concept("diffusion-policy", "Diffusion Policy", "条件于观测迭代去噪生成动作序列。"),
                            _concept("flow-matching", "Flow Matching", "学习把简单分布连续运输到数据分布的速度场。"),
                            _concept("receding-horizon", "滚动时域", "生成一段动作、只执行前部并用新观测重新规划。"),
                        ],
                        "papers": [
                            _paper("arxiv:2303.04137", "Diffusion Policy: Visuomotor Policy Learning via Action Diffusion"),
                            _paper("arxiv:2210.02747", "Flow Matching for Generative Modeling", "理论基础"),
                            _paper("arxiv:2410.24164", "π0: A Vision-Language-Action Flow Model for General Robot Control", "VLA 动作头"),
                        ],
                        "projects": [{"label": "openpi", "url": "https://github.com/Physical-Intelligence/openpi", "role": "π0 系列实现"}],
                        "frontier_queries": ["diffusion policy", "flow matching robot", "action generation"],
                    },
                ],
            },
            {
                "id": "embodied-foundation-models",
                "order": 3,
                "title": "数据与 VLA",
                "summary": "研究跨任务、跨场景和跨本体数据如何进入通用策略。",
                "chapters": [
                    {
                        "id": "embodied-data-cross-embodiment",
                        "order": 5,
                        "code": "E5",
                        "title": "机器人数据与跨本体学习",
                        "kind": "core",
                        "status": "active",
                        "summary": "拆解轨迹采集、动作 schema、质量过滤、混合配比与跨机器人对齐。",
                        "prerequisites": ["embodied-rl-imitation"],
                        "learning_goals": ["审计一份机器人轨迹数据集", "区分任务、场景、操作者和本体多样性", "解释动作空间与动力学异构"],
                        "theory": ["离线策略学习", "数据混合", "域适配", "跨本体条件化"],
                        "math_focus": ["trajectory distribution", "normalization statistics", "mixture weights", "action remapping"],
                        "research_pain_points": ["采集与重置昂贵", "失败轨迹标注不一致", "不同机器人动作不可直接拼接", "数据规模统计口径混乱"],
                        "assessment": "轨迹数量不是充分统计量。可信工作应报告任务覆盖、有效时长、成功失败分布、动作频率、质量过滤和机器人条件。",
                        "concepts": [
                            _concept("robot-trajectory", "机器人轨迹", "时间对齐的观测、状态、动作、指令和结果序列。"),
                            _concept("cross-embodiment", "跨本体", "在不同形态、传感器、动作空间和动力学间共享模型或数据。"),
                            _concept("data-mixture-robotics", "机器人数据混合", "控制不同任务和机器人数据进入训练的权重。"),
                        ],
                        "papers": [
                            _paper("arxiv:2212.06817", "RT-1: Robotics Transformer for Real-World Control at Scale"),
                            _paper("arxiv:2310.08864", "Open X-Embodiment: Robotic Learning Datasets and RT-X Models", "跨本体锚点"),
                        ],
                        "projects": [{"label": "Open X-Embodiment", "url": "https://robotics-transformer-x.github.io/", "role": "数据与模型资源"}],
                        "frontier_queries": ["robot dataset", "cross embodiment", "robot data quality"],
                    },
                    {
                        "id": "embodied-vla",
                        "order": 6,
                        "code": "E6",
                        "title": "Vision-Language-Action",
                        "kind": "frontier",
                        "status": "active",
                        "summary": "研究视觉语言预训练如何迁移到动作输出，以及离散 token、连续动作头和分层控制的差异。",
                        "prerequisites": ["embodied-generative-policy", "embodied-data-cross-embodiment", "llm-multimodal"],
                        "learning_goals": ["拆解 VLM backbone、动作表示和机器人条件", "区分语义泛化与控制泛化", "比较自回归动作 token 与连续动作专家"],
                        "theory": ["多模态预训练迁移", "条件策略", "动作 tokenization", "分层控制"],
                        "math_focus": ["π(a|image,language,state)", "离散动作量化", "continuous action likelihood", "多任务混合损失"],
                        "research_pain_points": ["互联网知识不等于物理能力", "高层语义和低层频率冲突", "跨本体动作接口", "公开评测和第三方复现不足"],
                        "assessment": "VLA 的进步需要拆成语义、空间、动作精度、恢复和跨本体五类。单个平均成功率无法说明是哪一层受益。",
                        "concepts": [
                            _concept("vla", "VLA", "输入视觉、语言和机器人状态并输出可执行动作的模型。"),
                            _concept("action-tokenization", "动作 Tokenization", "把连续动作离散化并复用语言模型生成接口。"),
                            _concept("action-expert", "动作专家", "在共享多模态主干外专门生成高频连续动作的模块。"),
                        ],
                        "papers": [
                            _paper("arxiv:2307.15818", "RT-2: Vision-Language-Action Models Transfer Web Knowledge to Robotic Control"),
                            _paper("arxiv:2406.09246", "OpenVLA: An Open-Source Vision-Language-Action Model", "开放基线"),
                            _paper("arxiv:2410.24164", "π0: A Vision-Language-Action Flow Model for General Robot Control", "连续动作前沿"),
                        ],
                        "projects": [
                            {"label": "OpenVLA", "url": "https://github.com/openvla/openvla", "role": "开放 VLA"},
                            {"label": "openpi", "url": "https://github.com/Physical-Intelligence/openpi", "role": "flow 动作专家"},
                        ],
                        "frontier_queries": ["vision language action", "VLA", "robot foundation model"],
                    },
                ],
            },
            {
                "id": "embodied-predictive-intelligence",
                "order": 4,
                "title": "预测式智能",
                "summary": "从潜在动力学预测进入联合未来与动作建模。",
                "chapters": [
                    {
                        "id": "embodied-world-model-jepa",
                        "order": 7,
                        "code": "E7",
                        "title": "World Model 与 JEPA",
                        "kind": "frontier",
                        "status": "active",
                        "summary": "比较像素预测、潜在动力学和 joint-embedding prediction 对规划与表征的作用。",
                        "prerequisites": ["embodied-perception-state", "embodied-rl-imitation"],
                        "learning_goals": ["区分生成式世界模型与预测式表征", "写出 latent dynamics 与 imagination rollout", "判断预测目标是否保留控制相关变量"],
                        "theory": ["潜在状态空间模型", "模型式强化学习", "JEPA", "规划中的想象 rollout"],
                        "math_focus": ["zₜ₊₁=f(zₜ,aₜ)", "p(o|z)", "latent prediction loss", "model predictive rollouts"],
                        "research_pain_points": ["长时预测误差累积", "像素质量与控制价值不一致", "潜变量可能遗漏接触细节", "规划成本和模型偏差耦合"],
                        "assessment": "好的预测目标应由下游决策价值验证。更清晰的视频或更低 latent loss 都不能单独证明更强控制。",
                        "concepts": [
                            _concept("world-model", "World Model", "学习环境状态随动作变化的预测模型。"),
                            _concept("latent-dynamics", "潜在动力学", "在压缩表征空间预测状态转移。"),
                            _concept("jepa-prediction", "Joint-Embedding Prediction", "预测目标表征并避免逐像素生成全部细节。"),
                        ],
                        "papers": [
                            _paper("arxiv:1803.10122", "World Models", "概念锚点"),
                            _paper("arxiv:1912.01603", "Dream to Control: Learning Behaviors by Latent Imagination"),
                            _paper(
                                "arxiv:2404.08471",
                                "Revisiting Feature Prediction for Learning Visual Representations from Video",
                                "V-JEPA 锚点",
                            ),
                        ],
                        "projects": [],
                        "frontier_queries": ["world model robotics", "JEPA robot", "latent planning"],
                    },
                    {
                        "id": "embodied-wam",
                        "order": 8,
                        "code": "E8",
                        "title": "World Action Models 与 JEPA-WAM",
                        "kind": "frontier",
                        "status": "needs_review",
                        "summary": "观察把未来视觉动态和动作生成联合建模的新近路线，以及阶段级语义预测、3D/4D 表征和数据效率问题。",
                        "prerequisites": ["embodied-vla", "embodied-world-model-jepa"],
                        "learning_goals": ["区分 World Model、VLA 与 WAM 的训练合同", "解释短期物理未来和阶段级语义未来", "设计拆分预测分支与动作分支贡献的消融"],
                        "theory": ["联合视频-动作建模", "逆动力学", "阶段级 latent prediction", "预测与控制共享表征"],
                        "math_focus": ["p(video_future,action|observation,instruction)", "multi-branch objective", "latent target prediction", "representation alignment"],
                        "research_pain_points": ["未来视频监督昂贵且可能偏离动作价值", "预测和动作分支的因果贡献不清", "短时 horizon 不支持长任务", "术语快速扩散但独立复现尚少"],
                        "assessment": "WAM 是值得追踪的候选范式，不是已经取代 VLA 的共识。当前应重点检查计算匹配基线、预测分支消融、闭环恢复和跨任务复现。",
                        "concepts": [
                            _concept("wam", "World Action Model", "联合预测环境未来与机器人动作的模型族。"),
                            _concept("stage-jepa", "Stage-JEPA", "预测下一任务阶段的目标表征，而非只预测短时像素变化。"),
                            _concept("prediction-action-coupling", "预测-动作耦合", "让未来建模与动作生成共享信息或目标。"),
                        ],
                        "papers": [
                            _paper("arxiv:2608.10780", "JEPA-WAM: Stage-Level Joint-Embedding Prediction for World-Action Models in Robot Manipulation", "当前候选", "unreviewed_abstract_candidate"),
                            _paper("arxiv:2608.08023", "4D-WAM: Infusing Spatiotemporal Awareness into World Action Models through Trajectory Fields", "当前候选", "unreviewed_abstract_candidate"),
                            _paper("arxiv:2608.08558", "Vid2WAM: Distilling Video Diffusion Priors into World Action Models", "当前候选", "unreviewed_abstract_candidate"),
                        ],
                        "projects": [],
                        "frontier_queries": ["World Action Model", "WAM", "JEPA-WAM"],
                    },
                ],
            },
            {
                "id": "embodied-systems-research",
                "order": 5,
                "title": "具身分支与科学验证",
                "summary": "把导航、运动、操作和迁移放回具体本体与评测条件。",
                "chapters": [
                    {
                        "id": "embodied-navigation-locomotion-manipulation",
                        "order": 9,
                        "code": "E9",
                        "title": "导航、Locomotion、操作与触觉",
                        "kind": "branching",
                        "status": "active",
                        "summary": "比较移动、全身控制、灵巧操作和触觉任务对状态、动作、数据和安全的不同要求。",
                        "prerequisites": ["embodied-rl-imitation", "embodied-generative-policy"],
                        "learning_goals": ["区分导航规划、运动控制和接触操作", "解释本体选择如何改变方法", "识别位置、力、触觉和全身协调的评测差异"],
                        "theory": ["SLAM 与规划", "全身控制", "接触动力学", "多传感器融合"],
                        "math_focus": ["occupancy/belief map", "contact constraints", "whole-body objective", "force/position control"],
                        "research_pain_points": ["不同分支的成功率不可横向比较", "接触和触觉数据稀缺", "人形展示与任务有效性脱节", "安全边界难标准化"],
                        "assessment": "不要用单一路线的热度建立技术等级。SLAM、locomotion、操作和 VLA 解决的是不同闭环层级，真正前沿常发生在接口处。",
                        "concepts": [
                            _concept("locomotion", "Locomotion", "在动力学和接触约束下实现身体稳定移动。"),
                            _concept("manipulation", "Manipulation", "通过末端执行器或手与对象接触并改变其状态。"),
                            _concept("tactile-feedback", "触觉反馈", "用接触、力或形变信号补足视觉不可见状态。"),
                        ],
                        "papers": [
                            _paper("arxiv:2107.04034", "RMA: Rapid Motor Adaptation for Legged Robots"),
                            _paper("arxiv:2109.11978", "Learning to Walk in Minutes Using Massively Parallel Deep Reinforcement Learning"),
                        ],
                        "projects": [],
                        "frontier_queries": ["robot locomotion", "dexterous manipulation", "tactile policy", "mobile manipulation"],
                    },
                    {
                        "id": "embodied-evaluation-sim2real",
                        "order": 10,
                        "code": "E10",
                        "title": "Benchmark、Sim-to-Real 与失败审计",
                        "kind": "research",
                        "status": "stable",
                        "summary": "建立能区分感知、规划、控制、数据和迁移失败的具身评测协议。",
                        "prerequisites": ["embodied-data-cross-embodiment", "embodied-vla", "embodied-wam", "embodied-navigation-locomotion-manipulation"],
                        "learning_goals": ["设计真机/仿真分层评测", "报告试验次数、置信区间和失败类别", "检查数据泄漏、场景重叠与隐性真机调参"],
                        "theory": ["域随机化", "实验设计", "鲁棒性评测", "失败模式分析"],
                        "math_focus": ["binomial confidence interval", "paired trials", "domain shift", "success/time/safety multi-objective"],
                        "research_pain_points": ["演示视频选择偏差", "测试次数小且无置信区间", "仿真榜单与真机脱节", "硬件和控制器未对齐"],
                        "assessment": "具身论文的最小可信单元是带任务条件、试验次数和失败样本的闭环结果。没有这些信息时，应把结论保持为候选而非趋势。",
                        "concepts": [
                            _concept("sim-to-real", "Sim-to-Real", "把仿真中学习的策略迁移到真实系统并处理域差异。"),
                            _concept("failure-taxonomy", "失败分类", "把失败定位到感知、计划、动作、接触、恢复或安全层。"),
                            _concept("embodied-benchmark", "具身 Benchmark", "固定任务、环境、机器人、协议与指标的可比较评测。"),
                        ],
                        "papers": [
                            _paper("arxiv:2306.03310", "LIBERO: Benchmarking Knowledge Transfer for Lifelong Robot Learning"),
                            _paper(
                                "arxiv:2405.05941",
                                "Evaluating Real-World Robot Manipulation Policies in Simulation",
                                "SimplerEnv 评测锚点",
                            ),
                            _paper("arxiv:1703.06907", "Domain Randomization for Transferring Deep Neural Networks from Simulation to the Real World"),
                        ],
                        "projects": [{"label": "LIBERO", "url": "https://github.com/Lifelong-Robot-Learning/LIBERO", "role": "操作学习 benchmark"}],
                        "frontier_queries": ["robot benchmark", "sim-to-real evaluation", "robot failure analysis"],
                    },
                ],
            },
        ],
    },
]


SOURCES = [
    {
        "id": "ai-systems-courses",
        "repository": "https://github.com/Shiraikuroko123/ai-systems-courses",
        "commit": "670ef7215798bb8c634fb26f9b76eda10851333d",
        "observed_at": "2026-08-12",
        "use": "章节颗粒度、两条路线和先修顺序的结构参考",
        "license": "同一作者仓库已迁入 content/courses；仓库未声明根许可证，公开再分发前需补充许可",
        "content_imported": True,
        "destination": "content/courses",
    },
    {
        "id": "paper-notes",
        "repository": "https://github.com/zhaoyang97/Paper-Notes",
        "commit": "3d15a51576cb764ffe818686282896477bef9de9",
        "observed_at": "2026-08-12",
        "use": "顶会分类和论文线索覆盖的参考；所有讲解需回到原论文重写",
        "license": "CC BY-NC-SA 4.0",
        "content_imported": False,
    },
]


def _validate_track(track: dict[str, Any]) -> None:
    chapters = [chapter for module in track["modules"] for chapter in module["chapters"]]
    chapter_ids = [chapter["id"] for chapter in chapters]
    if len(chapter_ids) != len(set(chapter_ids)):
        raise ValueError(f"duplicate curriculum chapter id in {track['id']}")
    orders = [int(chapter["order"]) for chapter in chapters]
    if orders != list(range(1, len(chapters) + 1)):
        raise ValueError(f"curriculum order is not contiguous in {track['id']}")
    all_ids = {
        chapter["id"]
        for candidate_track in TRACKS
        for module in candidate_track["modules"]
        for chapter in module["chapters"]
    }
    for chapter in chapters:
        if chapter["id"] not in COURSE_LESSONS_BY_CHAPTER:
            raise ValueError(f"missing course lesson mapping for {chapter['id']}")
        missing = set(chapter["prerequisites"]) - all_ids
        if missing:
            raise ValueError(f"unknown prerequisites for {chapter['id']}: {sorted(missing)}")


def build_curriculum(track_id: str = "") -> dict[str, Any]:
    """Return the Atlas learning graph linked to repository-owned lessons."""

    for track in TRACKS:
        _validate_track(track)
    normalized_track = str(track_id or "").strip().casefold()
    if normalized_track and normalized_track not in {track["id"] for track in TRACKS}:
        raise ValueError("unknown curriculum track")
    tracks = copy.deepcopy(
        [track for track in TRACKS if not normalized_track or track["id"] == normalized_track]
    )
    relationships: list[dict[str, str]] = []
    chapter_total = 0
    concept_total = 0
    paper_refs: set[str] = set()
    frontier_total = 0
    linked_course_paths: set[str] = set()
    for track in tracks:
        flattened = [chapter for module in track["modules"] for chapter in module["chapters"]]
        for module in track["modules"]:
            relationships.append({"kind": "contains", "from": track["id"], "to": module["id"]})
            for chapter in module["chapters"]:
                relationships.append({"kind": "contains", "from": module["id"], "to": chapter["id"]})
                chapter["module_id"] = module["id"]
                chapter["module_title"] = module["title"]
                chapter["course_lessons"] = copy.deepcopy(COURSE_LESSONS_BY_CHAPTER[chapter["id"]])
                linked_course_paths.update(lesson["path"] for lesson in chapter["course_lessons"])
                chapter_total += 1
                concept_total += len(chapter["concepts"])
                paper_refs.update(paper["ref"] for paper in chapter["papers"])
                frontier_total += int(chapter["status"] in {"active", "needs_review"})
                for prerequisite in chapter["prerequisites"]:
                    relationships.append({"kind": "prerequisite", "from": prerequisite, "to": chapter["id"]})
        for current, following in zip(flattened, flattened[1:]):
            relationships.append({"kind": "next", "from": current["id"], "to": following["id"]})
            current["next_chapter_id"] = following["id"]
            following["previous_chapter_id"] = current["id"]
        track["chapter_count"] = len(flattened)
        track["module_count"] = len(track["modules"])
        track["course_lesson_count"] = len(
            {
                lesson["path"]
                for chapter in flattened
                for lesson in chapter["course_lessons"]
            }
        )
        track["default_chapter_id"] = flattened[0]["id"] if flattened else ""
    selected_track_ids = {track["id"] for track in tracks}
    course_source_files = sum(
        source["track_id"] in selected_track_ids
        for source in COURSE_LESSON_SOURCES
    )
    payload = {
        "schema_version": CURRICULUM_SCHEMA_VERSION,
        "curriculum_version": CURRICULUM_VERSION,
        "as_of_date": "2026-08-14",
        "content_policy": "atlas_editorial_graph_with_sanitized_first_party_lessons_loaded_on_demand",
        "tracks": tracks,
        "relationships": relationships,
        "sources": copy.deepcopy(SOURCES),
        "stats": {
            "tracks": len(tracks),
            "modules": sum(len(track["modules"]) for track in tracks),
            "chapters": chapter_total,
            "concepts": concept_total,
            "paper_refs": len(paper_refs),
            "frontier_chapters": frontier_total,
            "course_source_files": course_source_files,
            "course_lesson_unique": len(linked_course_paths),
            "course_lesson_links": sum(
                len(chapter["course_lessons"])
                for track in tracks
                for module in track["modules"]
                for chapter in module["chapters"]
            ),
        },
    }
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    payload["catalog_sha256"] = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return payload
