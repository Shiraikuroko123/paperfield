#!/usr/bin/env python3
"""Create publication-figure accessibility simulations and verify raster outputs."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


CVD_MATRICES = {
    "protanopia": np.array(
        [[0.56667, 0.43333, 0.0], [0.55833, 0.44167, 0.0], [0.0, 0.24167, 0.75833]],
        dtype=np.float32,
    ),
    "deuteranopia": np.array(
        [[0.625, 0.375, 0.0], [0.7, 0.3, 0.0], [0.0, 0.3, 0.7]],
        dtype=np.float32,
    ),
    "tritanopia": np.array(
        [[0.95, 0.05, 0.0], [0.0, 0.43333, 0.56667], [0.0, 0.475, 0.525]],
        dtype=np.float32,
    ),
}

VISUAL_EQUIVALENCE_THRESHOLDS = {
    "structuralSsim": 0.985,
    "contentStructuralSsim": 0.985,
    "edgePrecision": 0.95,
    "edgeRecall": 0.95,
    "missingInkRate": 0.06,
    "meanAbsoluteError": 0.03,
    "minimumInkMassRatio": 0.95,
    "maximumInkMassRatio": 1.05,
}


def transform_image(source: Image.Image, mode: str) -> Image.Image:
    rgb = np.asarray(source.convert("RGB"), dtype=np.float32)
    if mode == "grayscale":
        luminance = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        output = np.repeat(luminance[..., None], 3, axis=2)
    else:
        output = rgb @ CVD_MATRICES[mode].T
    return Image.fromarray(np.clip(output, 0, 255).astype(np.uint8), "RGB")


def raster_stats(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
        luminance = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        return {
            "path": path.as_posix(),
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "luminanceMean": round(float(luminance.mean()), 4),
            "luminanceStdDev": round(float(luminance.std()), 4),
            "luminanceRange": round(float(luminance.max() - luminance.min()), 4),
            "nonBlank": bool(luminance.std() >= 3.0 and luminance.max() - luminance.min() >= 32.0),
        }


def luminance_array(image: Image.Image) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    return rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def global_ssim(reference: np.ndarray, candidate: np.ndarray) -> float:
    reference_mean = float(reference.mean())
    candidate_mean = float(candidate.mean())
    reference_delta = reference - reference_mean
    candidate_delta = candidate - candidate_mean
    reference_variance = float(np.mean(reference_delta * reference_delta))
    candidate_variance = float(np.mean(candidate_delta * candidate_delta))
    covariance = float(np.mean(reference_delta * candidate_delta))
    c1 = (0.01 * 255) ** 2
    c2 = (0.03 * 255) ** 2
    numerator = (2 * reference_mean * candidate_mean + c1) * (2 * covariance + c2)
    denominator = (
        (reference_mean**2 + candidate_mean**2 + c1)
        * (reference_variance + candidate_variance + c2)
    )
    return numerator / denominator if denominator else 1.0


def structural_ssim(reference: np.ndarray, candidate: np.ndarray) -> float:
    height, width = reference.shape
    target_size = (max(1, round(width / 8)), max(1, round(height / 8)))
    reference_image = (
        Image.fromarray(np.clip(reference, 0, 255).astype(np.uint8), "L")
        .resize(target_size, Image.Resampling.LANCZOS)
        .filter(ImageFilter.GaussianBlur(radius=1))
    )
    candidate_image = (
        Image.fromarray(np.clip(candidate, 0, 255).astype(np.uint8), "L")
        .resize(target_size, Image.Resampling.LANCZOS)
        .filter(ImageFilter.GaussianBlur(radius=1))
    )
    return global_ssim(
        np.asarray(reference_image, dtype=np.float32),
        np.asarray(candidate_image, dtype=np.float32),
    )


def content_bounds(reference: np.ndarray, candidate: np.ndarray) -> tuple[slice, slice]:
    foreground = (reference < 250) | (candidate < 250)
    rows, columns = np.nonzero(foreground)
    if not len(rows):
        return slice(0, reference.shape[0]), slice(0, reference.shape[1])
    padding = 12
    top = max(0, int(rows.min()) - padding)
    bottom = min(reference.shape[0], int(rows.max()) + padding + 1)
    left = max(0, int(columns.min()) - padding)
    right = min(reference.shape[1], int(columns.max()) + padding + 1)
    return slice(top, bottom), slice(left, right)


def edge_map(luminance: np.ndarray) -> np.ndarray:
    smoothed = np.asarray(
        Image.fromarray(np.clip(luminance, 0, 255).astype(np.uint8), "L")
        .filter(ImageFilter.GaussianBlur(radius=0.55)),
        dtype=np.float32,
    )
    gradient_y, gradient_x = np.gradient(smoothed)
    return np.hypot(gradient_x, gradient_y) >= 12


def dilate(mask: np.ndarray, radius: int = 2) -> np.ndarray:
    size = radius * 2 + 1
    expanded = Image.fromarray(mask.astype(np.uint8) * 255, "L").filter(ImageFilter.MaxFilter(size))
    return np.asarray(expanded, dtype=np.uint8) > 0


def compare_raster_pair(reference_path: Path, candidate_path: Path) -> dict[str, object]:
    with Image.open(reference_path) as reference_image, Image.open(candidate_path) as candidate_image:
        reference_rgb = reference_image.convert("RGB")
        candidate_rgb = candidate_image.convert("RGB")
        original_reference_size = reference_rgb.size
        original_candidate_size = candidate_rgb.size
        if candidate_rgb.size != reference_rgb.size:
            width_delta = abs(candidate_rgb.width - reference_rgb.width)
            height_delta = abs(candidate_rgb.height - reference_rgb.height)
            if width_delta <= 1 and height_delta <= 1:
                aligned_size = (
                    min(candidate_rgb.width, reference_rgb.width),
                    min(candidate_rgb.height, reference_rgb.height),
                )
                reference_rgb = reference_rgb.crop((0, 0, *aligned_size))
                candidate_rgb = candidate_rgb.crop((0, 0, *aligned_size))
            else:
                candidate_rgb = candidate_rgb.resize(reference_rgb.size, Image.Resampling.LANCZOS)

        reference = luminance_array(reference_rgb)
        candidate = luminance_array(candidate_rgb)
        region = content_bounds(reference, candidate)
        reference_content = reference[region]
        candidate_content = candidate[region]
        reference_edges = edge_map(reference_content)
        candidate_edges = edge_map(candidate_content)
        reference_edge_count = max(1, int(reference_edges.sum()))
        candidate_edge_count = max(1, int(candidate_edges.sum()))
        edge_recall = float((reference_edges & dilate(candidate_edges)).sum()) / reference_edge_count
        edge_precision = float((candidate_edges & dilate(reference_edges)).sum()) / candidate_edge_count

        reference_dark = reference_content < 235
        candidate_dark = candidate_content < 235
        missing_ink = reference_dark & ~dilate(candidate_dark)
        missing_ink_rate = float(missing_ink.sum()) / max(1, int(reference_dark.sum()))
        reference_ink = np.clip(255 - reference_content, 0, 255)
        candidate_ink = np.clip(255 - candidate_content, 0, 255)
        ink_mass_ratio = float(candidate_ink.sum()) / max(1.0, float(reference_ink.sum()))

        metrics = {
            "stem": reference_path.stem,
            "reference": reference_path.as_posix(),
            "candidate": candidate_path.as_posix(),
            "referenceSize": list(original_reference_size),
            "candidateSize": list(original_candidate_size),
            "globalSsim": round(global_ssim(reference, candidate), 6),
            "contentSsim": round(global_ssim(reference_content, candidate_content), 6),
            "structuralSsim": round(structural_ssim(reference, candidate), 6),
            "contentStructuralSsim": round(structural_ssim(reference_content, candidate_content), 6),
            "edgePrecision": round(edge_precision, 6),
            "edgeRecall": round(edge_recall, 6),
            "missingInkRate": round(missing_ink_rate, 6),
            "inkMassRatio": round(ink_mass_ratio, 6),
            "meanAbsoluteError": round(float(np.mean(np.abs(reference - candidate))) / 255, 6),
        }
        failures: list[str] = []
        thresholds = VISUAL_EQUIVALENCE_THRESHOLDS
        for metric in ("structuralSsim", "contentStructuralSsim", "edgePrecision", "edgeRecall"):
            if float(metrics[metric]) < thresholds[metric]:
                failures.append(f"{metric} {metrics[metric]} < {thresholds[metric]}")
        for metric in ("missingInkRate", "meanAbsoluteError"):
            if float(metrics[metric]) > thresholds[metric]:
                failures.append(f"{metric} {metrics[metric]} > {thresholds[metric]}")
        if ink_mass_ratio < thresholds["minimumInkMassRatio"] or ink_mass_ratio > thresholds["maximumInkMassRatio"]:
            failures.append(
                "inkMassRatio "
                f"{metrics['inkMassRatio']} outside "
                f"[{thresholds['minimumInkMassRatio']}, {thresholds['maximumInkMassRatio']}]"
            )
        metrics["passed"] = not failures
        metrics["failures"] = failures
        return metrics


def make_contact_sheet(paths: list[Path], output: Path, columns: int = 3) -> None:
    if not paths:
        return
    tile_width, tile_height, caption_height = 720, 480, 34
    rows = math.ceil(len(paths) / columns)
    sheet = Image.new("RGB", (columns * tile_width, rows * (tile_height + caption_height)), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, path in enumerate(paths):
        with Image.open(path) as source:
            preview = source.convert("RGB")
            preview.thumbnail((tile_width - 20, tile_height - 20), Image.Resampling.LANCZOS)
            x = index % columns * tile_width + (tile_width - preview.width) // 2
            y = index // columns * (tile_height + caption_height) + (tile_height - preview.height) // 2
            sheet.paste(preview, (x, y))
            draw.text((index % columns * tile_width + 10, y + tile_height), path.stem, fill="black", font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=94)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    png_dir = root / "png"
    accessibility_dir = root / "accessibility"
    accessibility_dir.mkdir(parents=True, exist_ok=True)

    core_paths = sorted(png_dir.glob("*.png"))
    color_paths = [path for path in core_paths if path.stem.endswith("-conference")]
    derived_paths: list[Path] = []
    for source_path in color_paths:
        with Image.open(source_path) as source:
            for mode in ("grayscale", *CVD_MATRICES):
                target = accessibility_dir / f"{source_path.stem}-{mode}.png"
                transform_image(source, mode).save(target, dpi=(300, 300))
                derived_paths.append(target)

    pdf_render_paths = sorted((root / "pdf-renders").glob("*.png"))
    pdf_render_by_stem = {path.stem: path for path in pdf_render_paths}
    visual_equivalence: list[dict[str, object]] = []
    for reference_path in core_paths:
        candidate_path = pdf_render_by_stem.get(reference_path.stem)
        if candidate_path is None:
            visual_equivalence.append({
                "stem": reference_path.stem,
                "reference": reference_path.as_posix(),
                "passed": False,
                "failures": ["Matching Poppler PDF render is missing"],
            })
        else:
            visual_equivalence.append(compare_raster_pair(reference_path, candidate_path))
    all_paths = core_paths + derived_paths + pdf_render_paths
    stats = [raster_stats(path) for path in all_paths]
    expected_dimensions = {
        "single-column": (round(89 / 25.4 * 300), round(70 / 25.4 * 300)),
        "double-column": (round(180 / 25.4 * 300), round(120 / 25.4 * 300)),
        "presentation": (round(180 / 25.4 * 300), round(101.25 / 25.4 * 300)),
    }
    failures: list[str] = []
    for item in stats:
        path = str(item["path"])
        expected = next((size for name, size in expected_dimensions.items() if name in path), None)
        if expected:
            actual = (int(item["width"]), int(item["height"]))
            tolerance = 1 if "/pdf-renders/" in path.replace("\\", "/") else 0
            if any(abs(value - target) > tolerance for value, target in zip(actual, expected)):
                failures.append(f"Unexpected raster dimensions: {path}: {actual} != {expected} (+/-{tolerance}px)")
        if not item["nonBlank"]:
            failures.append(f"Blank or near-blank raster: {path}")
    for comparison in visual_equivalence:
        if not comparison["passed"]:
            failures.append(
                f"PNG/PDF visual mismatch: {comparison['stem']}: "
                + "; ".join(str(value) for value in comparison["failures"])
            )

    make_contact_sheet(core_paths, root / "contact-sheets" / "core-exports.jpg")
    make_contact_sheet(derived_paths, root / "contact-sheets" / "accessibility-simulations.jpg", columns=4)
    make_contact_sheet(pdf_render_paths, root / "contact-sheets" / "pdf-poppler-renders.jpg")
    report = {
        "coreRasterCount": len(core_paths),
        "accessibilityVariantCount": len(derived_paths),
        "pdfRenderCount": len(pdf_render_paths),
        "visualEquivalencePairCount": len(visual_equivalence),
        "visualEquivalencePassedCount": sum(1 for item in visual_equivalence if item["passed"]),
        "visualEquivalenceThresholds": VISUAL_EQUIVALENCE_THRESHOLDS,
        "visualEquivalence": visual_equivalence,
        "expectedDimensions": expected_dimensions,
        "simulationNote": "CVD matrices are review simulations, not a clinical vision model.",
        "failures": failures,
        "rasters": stats,
    }
    (root / "raster-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if failures:
        for failure in failures:
            print(failure)
        return 1
    print(json.dumps({
        key: report[key]
        for key in (
            "coreRasterCount",
            "accessibilityVariantCount",
            "pdfRenderCount",
            "visualEquivalencePairCount",
            "visualEquivalencePassedCount",
        )
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
