"""Generate the demo's photos with the Gemini image model and record them in the manifest.

Run by hand, never by npm scripts or CI:

    GEMINI_API_KEY=... python scripts/generate-images.py [--force]
"""
from __future__ import annotations

import argparse
import io
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "apps" / "demo" / "public" / "images"
MANIFEST = ROOT / "apps" / "demo" / "src" / "images" / "manifest.ts"
MODEL = "gemini-3-pro-image-preview"
STYLE = (
    "Photorealistic food photography, natural daylight, shallow depth of field, 50mm lens, "
    "warm tones, no people, no hands, no text, no logos, no watermarks."
)

# (relative path, aspect ratio, width in pixels, subject)
SHOTS: list[tuple[str, str, int, str]] = [
    ("outlets/marine-drive.jpg", "4:3", 800, "A bright seaside cafe counter in a tropical island capital, morning light, pastries and a coffee machine."),
    ("outlets/lagoon-kiosk.jpg", "4:3", 800, "A small wooden beach kiosk beside a turquoise lagoon at golden hour, palm shade."),
    ("dishes/classic-burger.jpg", "4:3", 800, "A beef burger with lettuce, tomato and house sauce on a wooden board."),
    ("dishes/chicken-burger.jpg", "4:3", 800, "A grilled chicken thigh burger with crunchy slaw on a ceramic plate."),
    ("dishes/fish-burger.jpg", "4:3", 800, "A crisp reef-fish fillet burger with tartare sauce and a lime wedge."),
    ("dishes/veggie-burger.jpg", "4:3", 800, "A chickpea patty burger with fresh greens on a seeded bun."),
    ("dishes/lime-juice.jpg", "4:3", 800, "A tall glass of fresh lime juice with ice and a slice of lime."),
    ("dishes/iced-coffee.jpg", "4:3", 800, "An iced coffee in a glass with condensation on a cafe table."),
    ("dishes/fries.jpg", "4:3", 800, "A paper cone of golden fries with two small dips, garlic and chilli."),
    ("dishes/onion-rings.jpg", "4:3", 800, "A basket of crisp onion rings lined with paper."),
    ("hero.jpg", "16:9", 1200, "A cafe table seen from above with burgers, fries, lime juice and iced coffee, tropical setting."),
]


def generate(client, types, subject: str, aspect: str):
    response = client.models.generate_content(
        model=MODEL,
        contents=[f"{subject} {STYLE}"],
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(aspect_ratio=aspect, image_size="1K"),
        ),
    )
    for part in response.parts:
        if part.inline_data:
            return part.inline_data.data
    raise RuntimeError("the model returned no image")


def save(data: bytes, target: Path, width: int) -> None:
    from PIL import Image

    image = Image.open(io.BytesIO(data)).convert("RGB")
    if image.width > width:
        height = round(image.height * width / image.width)
        image = image.resize((width, height), Image.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="JPEG", quality=80, optimize=True)


def write_manifest() -> list[str]:
    present = sorted(f"/images/{path}" for path, _, _, _ in SHOTS if (IMAGES / path).is_file())
    lines = "".join(f"  '{path}',\n" for path in present)
    MANIFEST.write_text(
        "/**\n"
        " * The bundled photos that exist under `public/images`, as site-absolute paths.\n"
        " * `scripts/generate-images.py` rewrites this file after it generates photos.\n"
        " * Empty means every picture renders as a branded tile and nothing is requested.\n"
        " */\n"
        f"export const AVAILABLE_IMAGES: ReadonlySet<string> = new Set<string>([\n{lines}]);\n",
        encoding="utf-8",
    )
    return present


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="regenerate photos that already exist")
    args = parser.parse_args()

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        print("GEMINI_API_KEY is not set; nothing generated.", file=sys.stderr)
        return 2

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=key)
    for path, aspect, width, subject in SHOTS:
        target = IMAGES / path
        if target.is_file() and not args.force:
            print(f"keep      {path}")
            continue
        print(f"generate  {path}")
        save(generate(client, types, subject, aspect), target, width)

    present = write_manifest()
    print(f"manifest lists {len(present)} of {len(SHOTS)} photos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
