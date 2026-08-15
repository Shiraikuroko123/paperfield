from __future__ import annotations

import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "docs" / "research" / "arxiv-figure-corpus.json"
OUTPUT = ROOT / "output" / "research" / "contact-sheets"
FONT_REGULAR = Path("C:/Windows/Fonts/arial.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")

SHEET_WIDTH = 1900
SHEET_HEIGHT = 1160
COLS = 5
ROWS = 2
CELL_WIDTH = SHEET_WIDTH // COLS
CELL_HEIGHT = (SHEET_HEIGHT - 60) // ROWS
IMAGE_HEIGHT = 390


def font(path: Path, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


BODY_FONT = font(FONT_REGULAR, 19)
SMALL_FONT = font(FONT_REGULAR, 16)
BOLD_FONT = font(FONT_BOLD, 20)
TITLE_FONT = font(FONT_BOLD, 27)


def load_representative(paper: dict) -> Image.Image | None:
    paths = paper.get("representativeFigure", {}).get("localAnalysisImages", []) if paper.get("representativeFigure") else []
    for relative_path in paths:
        path = ROOT / relative_path
        if not path.exists():
            continue
        try:
            with Image.open(path) as source:
                return ImageOps.exif_transpose(source).convert("RGB")
        except (OSError, ValueError):
            continue
    return None


def draw_cell(sheet: Image.Image, paper: dict, index: int) -> None:
    col = index % COLS
    row = index // COLS
    left = col * CELL_WIDTH
    top = 60 + row * CELL_HEIGHT
    draw = ImageDraw.Draw(sheet)
    draw.rectangle(
        (left + 8, top + 8, left + CELL_WIDTH - 8, top + CELL_HEIGHT - 8),
        fill="#ffffff",
        outline="#ccd3da",
        width=2,
    )

    preview = load_representative(paper)
    image_box = (left + 18, top + 18, left + CELL_WIDTH - 18, top + IMAGE_HEIGHT)
    box_width = image_box[2] - image_box[0]
    box_height = image_box[3] - image_box[1]
    if preview is not None:
        preview.thumbnail((box_width, box_height), Image.Resampling.LANCZOS)
        image_left = image_box[0] + (box_width - preview.width) // 2
        image_top = image_box[1] + (box_height - preview.height) // 2
        sheet.paste(preview, (image_left, image_top))
    else:
        draw.rectangle(image_box, fill="#f2f4f6", outline="#b8c1ca")
        draw.text((image_box[0] + 18, image_box[1] + box_height // 2 - 10), "Representative image unavailable", fill="#6b7280", font=SMALL_FONT)

    text_top = top + IMAGE_HEIGHT + 12
    draw.text((left + 18, text_top), paper["arxivId"], fill="#0f566e", font=BOLD_FONT)
    figure = paper.get("representativeFigure") or {}
    draw.text((left + CELL_WIDTH - 18, text_top), figure.get("label", "No figure"), fill="#5f6b76", font=SMALL_FONT, anchor="ra")
    title_lines = textwrap.wrap(paper["title"], width=42)[:3]
    draw.multiline_text((left + 18, text_top + 31), "\n".join(title_lines), fill="#17212b", font=BODY_FONT, spacing=4)
    tags = ", ".join(figure.get("tags", {}).get("composition", [])[:3])
    draw.text((left + 18, top + CELL_HEIGHT - 38), tags or "unclassified", fill="#6b7280", font=SMALL_FONT)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    for domain, value in corpus["domains"].items():
        papers = value["papers"]
        for sheet_index, start in enumerate(range(0, len(papers), COLS * ROWS), start=1):
            chunk = papers[start : start + COLS * ROWS]
            sheet = Image.new("RGB", (SHEET_WIDTH, SHEET_HEIGHT), "#eef1f3")
            draw = ImageDraw.Draw(sheet)
            label = "LLM" if domain == "llm" else "Embodied intelligence / VLA"
            draw.text((18, 14), f"Flowloom arXiv Figure Atlas - {label} - {start + 1:02d}-{start + len(chunk):02d}", fill="#17212b", font=TITLE_FONT)
            for index, paper in enumerate(chunk):
                draw_cell(sheet, paper, index)
            path = OUTPUT / f"{domain}-{sheet_index:02d}.jpg"
            sheet.save(path, quality=91, optimize=True)
            print(path)


if __name__ == "__main__":
    main()
