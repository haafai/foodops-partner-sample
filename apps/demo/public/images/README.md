# Demo photos

The demo shows a photo for each restaurant and dish of the built-in mock menu. None are committed yet:
until they are, every picture renders as a tile with the item's initials, and the app requests no image.

## Generating them

The photos are AI-generated for this sample with `scripts/generate-images.py` at the repository root.
It needs Python 3.11+, `pip install google-genai pillow`, and a `GEMINI_API_KEY` in the environment.

    python scripts/generate-images.py            # generates the missing photos
    python scripts/generate-images.py --force    # regenerates all of them

The script writes JPEGs here (dishes and outlets 800 px wide, the hero 1200 px), then rewrites
`apps/demo/src/images/manifest.ts` so the app knows which photos exist. Commit both.

## What they are

Generated images carry a SynthID watermark. They show no people, text or logos, and are free to use
with this sample. When the API you integrate with sends its own `imageUrl`, that image is used instead.
