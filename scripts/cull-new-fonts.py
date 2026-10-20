#!/usr/bin/env python3
"""Drops newly added fonts that would add nothing visible to the cache.

Runs in the weekly font workflow after fetch-fonts.js. A font counts as new
when it's in ../fonts.js but not in the committed (HEAD) fonts.js. Each new
font is dropped when:

  - its cached Latin file has no English letters (so English text would just
    fall back to the browser default), or
  - it belongs to a family we already trimmed by hand (Playwrite, Edu), or
  - its English letters look the same as a font already in the cache.

"Look the same" uses the test from the original cull: draw the sample glyphs
below, scale each one to the same box, and take the RMS pixel difference
against every cached font. Under MAX_DIFF counts as a duplicate. Color fonts
are never dropped this way, since they look different in a browser than in
these grayscale renders.

Dropped fonts are removed from fonts.js, their .woff2 is deleted, and they're
recorded in culled-fonts.json so check-new-fonts.js never re-adds them. To
keep a font this script drops, add it to NEVER_CULL and remove its entry from
culled-fonts.json; the next weekly run will add it back.
"""

import io
import json
import os
import re
import subprocess
import sys
import unicodedata

import numpy as np
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS_JS = os.path.join(ROOT, "fonts.js")
FONTS_DIR = os.path.join(ROOT, "fonts")
CULLED_JSON = os.path.join(ROOT, "scripts", "culled-fonts.json")

SAMPLE = "AaBbEeGgKkMmQqRrSsWwYy&?0123456789"
LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
CELL = 32
# The original cull used 0.10 with a hand review. The real design variants
# that scored close (Inter Tight 0.092, Share Tech 0.093, Nova Round 0.099,
# Zen Maru Gothic 0.083) all sit above 0.08, while true duplicates like
# Signika Negative (0.079) and Fira Mono (0.073) sit below it.
MAX_DIFF = 0.08
HAND_TRIMMED = ("Playwrite ", "Edu ")
NEVER_CULL = set()


def slug(name):
    # Matches Common.slugifyFont in common.js.
    plain = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")


def parse_fonts_js(src):
    return json.loads("[" + src.split("[", 1)[1].rsplit("]", 1)[0].rstrip().rstrip(",") + "]")


def write_fonts_js(names):
    body = ",\n".join(f"  {json.dumps(n)}" for n in names)
    with open(FONTS_JS, "w") as f:
        f.write(f"window.googleFonts = [\n{body}\n];\n")


def load(name):
    font = TTFont(os.path.join(FONTS_DIR, slug(name) + ".woff2"))
    font.flavor = None
    return font


def has_english_letters(font):
    cmap = font.getBestCmap() or {}
    glyphs = font.getGlyphSet()
    for ch in LETTERS:
        if ord(ch) not in cmap:
            continue
        pen = BoundsPen(glyphs)
        glyphs[cmap[ord(ch)]].draw(pen)
        if pen.bounds:
            return True
    return False


def is_color(font):
    return any(t in font for t in ("COLR", "SVG ", "sbix", "CBDT"))


def signature(font):
    """Each sample glyph drawn and scaled into a CELL x CELL box, flattened."""
    cmap = font.getBestCmap() or {}
    buf = io.BytesIO()
    font.save(buf)
    buf.seek(0)
    pil = ImageFont.truetype(buf, 40)
    cells = []
    for ch in SAMPLE:
        img = Image.new("L", (CELL * 2, CELL * 2), 0)
        if ord(ch) in cmap:
            ImageDraw.Draw(img).text((CELL // 2, CELL // 4), ch, font=pil, fill=255)
        cell = Image.new("L", (CELL, CELL), 0)
        bbox = img.getbbox()
        if bbox:
            g = img.crop(bbox)
            w, h = g.size
            s = (CELL - 2) / max(w, h)
            g = g.resize((max(1, round(w * s)), max(1, round(h * s))), Image.BILINEAR)
            cell.paste(g, ((CELL - g.size[0]) // 2, (CELL - g.size[1]) // 2))
        cells.append(np.asarray(cell, dtype=np.float32) / 255)
    return np.stack(cells).ravel()


def main():
    names = parse_fonts_js(open(FONTS_JS).read())
    committed = set(
        parse_fonts_js(subprocess.check_output(["git", "show", "HEAD:fonts.js"], cwd=ROOT, text=True))
    )
    new = [n for n in names if n not in committed and n not in NEVER_CULL]
    if not new:
        print("No new fonts to check.")
        return

    culled = {}

    # Cheap checks first, so the full signature pass only runs when needed.
    to_compare = []
    for name in new:
        font = load(name)
        if not has_english_letters(font):
            culled[name] = (None, "no English letters")
        elif name.startswith(HAND_TRIMMED):
            culled[name] = (None, "hand-trimmed family")
        elif is_color(font):
            print(f"  keep {name} (color font)")
        else:
            to_compare.append((name, font))

    if to_compare:
        # Compare against every cached non-color font that has a real
        # signature, plus earlier new fonts that survive this run.
        pool_names, pool_sigs = [], []
        for name in names:
            if name in committed:
                font = load(name)
                if is_color(font):
                    continue
                sig = signature(font)
                if sig.any():
                    pool_names.append(name)
                    pool_sigs.append(sig)
        for name, font in to_compare:
            sig = signature(font)
            if not sig.any():
                # Our renderer couldn't draw it; don't guess.
                print(f"  keep {name} (could not render to compare)")
                continue
            diffs = np.sqrt(((np.stack(pool_sigs) - sig) ** 2).mean(axis=1))
            i = int(diffs.argmin())
            if diffs[i] < MAX_DIFF:
                culled[name] = (pool_names[i], f"matches {pool_names[i]} (diff {diffs[i]:.3f})")
            else:
                print(f"  keep {name} (closest: {pool_names[i]}, diff {diffs[i]:.3f})")
                pool_names.append(name)
                pool_sigs.append(sig)

    # Hand-trimmed families map to their nearest kept sibling when we can name one.
    for name, (match, why) in list(culled.items()):
        if why == "hand-trimmed family":
            prefix = next(p for p in HAND_TRIMMED if name.startswith(p))
            siblings = [n for n in names if n.startswith(prefix) and n in committed]
            if siblings:
                sig = signature(load(name))
                best = min(siblings, key=lambda s: ((signature(load(s)) - sig) ** 2).mean())
                culled[name] = (best, f"{prefix.strip()} family, closest to {best}")

    if not culled:
        print(f"All {len(new)} new fonts look distinct.")
        return

    write_fonts_js([n for n in names if n not in culled])
    for name in culled:
        os.remove(os.path.join(FONTS_DIR, slug(name) + ".woff2"))
    existing = json.load(open(CULLED_JSON))
    existing.update({n: match for n, (match, _) in culled.items()})
    with open(CULLED_JSON, "w") as f:
        json.dump(dict(sorted(existing.items())), f, indent=2)
        f.write("\n")

    lines = [f"Dropped {len(culled)} of {len(new)} new fonts:"]
    lines += [f"- {n}: {why}" for n, (_, why) in sorted(culled.items())]
    print("\n".join(lines))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    sys.exit(main())
