#!/usr/bin/env python3
"""Adds every font from typefree.org that looks different from the cache.

Downloads typefree's catalog, takes each family's regular upright file (a
variable font is pinned to weight 400), trims it to the same Latin range as
the Google Fonts files, and saves it as ../fonts/<slug>.woff2. Families that
share a name with a cached Google font, have no English letters, or match a
cached font under cull-new-fonts.py's test are skipped.

Writes ../typefree-fonts.js (window.typefreeFonts, family -> [category,
release date, homepage], read by the homepage and the /fonts/ explorer) and
../fonts/TYPEFREE-LICENSES.md. Safe to re-run: it rebuilds both from scratch
and removes woff2 files for families it no longer keeps.
"""

import datetime
import importlib.util
import io
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from fontTools import configLogger, subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TYPEFREE_JS = os.path.join(ROOT, "typefree-fonts.js")
LICENSES_MD = os.path.join(ROOT, "fonts", "TYPEFREE-LICENSES.md")
BASE = "https://www.typefree.org/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
# The unicode-range Google serves for its "latin" subset.
LATIN = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,"
    "U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
)
# Typefree category -> index in fonts-meta.js's categories.
CATEGORIES = {"Sans Serif": 0, "Serif": 1, "Display": 2, "Blackletter": 2, "Script": 3, "Monospace": 4}
WEIGHT_PREFERENCE =["Regular", "Book", "Variable", "Medium", "Light", "SemiBold", "Semi Bold"]

spec = importlib.util.spec_from_file_location("cull", os.path.join(ROOT, "scripts", "cull-new-fonts.py"))
cull = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cull)


def fetch(path):
    url = BASE + urllib.parse.quote(path)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def load_typefree_js():
    # Prettier rewrites the file as JS rather than JSON, so let node read it.
    if not os.path.exists(TYPEFREE_JS):
        return {}
    script = "global.window = {}; require(process.argv[1]); console.log(JSON.stringify(window.typefreeFonts));"
    return json.loads(subprocess.check_output(["node", "-e", script, TYPEFREE_JS], text=True))


def display_name(name):
    return name.rstrip("* ").strip()


def pick_variant(variants):
    upright = [v for v in variants if not v.get("italic")] or variants
    regular_width = [v for v in upright if v.get("width") in ("Regular", None)] or upright

    def rank(v):
        w = v.get("weight")
        return WEIGHT_PREFERENCE.index(w) if w in WEIGHT_PREFERENCE else len(WEIGHT_PREFERENCE)

    return min(regular_width, key=rank)


def convert(raw):
    """Static, Latin-only woff2 bytes from any ttf/otf/woff/woff2."""
    font = TTFont(io.BytesIO(raw))
    if "fvar" in font:
        axes = {a.axisTag: a for a in font["fvar"].axes}
        pins = {tag: a.defaultValue for tag, a in axes.items()}
        if "wght" in axes:
            pins["wght"] = min(max(400, axes["wght"].minValue), axes["wght"].maxValue)
        font = instancer.instantiateVariableFont(font, pins)
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    opts.flavor = "woff2"
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(LATIN))
    sub.subset(font)
    font.flavor = "woff2"
    out = io.BytesIO()
    font.save(out)
    return out.getvalue()


def prepare(entry):
    v = pick_variant(entry["variants"])
    try:
        return entry, v, convert(fetch(v["file"])), None
    except Exception as err:  # noqa: BLE001
        return entry, v, None, f"{type(err).__name__}: {err}"


def category_of(entry):
    """Index into fonts-meta.js's categories, from typefree's first usable one."""
    for cat in entry.get("kategorien", []):
        if cat in CATEGORIES:
            return CATEGORIES[cat]
    return -1


def release_date(font):
    """The creation date stored in the font file, if it's plausible."""
    created = datetime.datetime(1904, 1, 1) + datetime.timedelta(seconds=font["head"].created)
    if 1990 <= created.year <= datetime.date.today().year:
        return created.date().isoformat()
    return ""


def text_of(value):
    """First non-blank line. Some entries are localized, like {"fr": "..."}."""
    if isinstance(value, dict):
        value = next(iter(value.values()), "")
    lines = [" ".join(line.split()) for line in (value or "").splitlines()]
    return next((line for line in lines if line), "")


def license_of(variants):
    for v in variants:
        url = text_of(v.get("licenseURL"))
        if url:
            return url if "://" in url else "https://" + url
    for v in variants:
        text = text_of(v.get("license"))
        if text:
            return text[:120] + ("…" if len(text) > 120 else "")
    return ""


def main():
    configLogger(level="ERROR")
    catalog = json.loads(fetch("fonts/fonts-extended.json"))
    google = cull.parse_fonts_js(open(cull.FONTS_JS).read())
    google_set = set(google)
    culled_google = set(json.load(open(cull.CULLED_JSON)))
    previous = set(load_typefree_js())

    skipped = {}
    todo = []
    seen = set()
    for entry in catalog:
        name = display_name(entry["name"])
        if name in google_set or name in culled_google:
            skipped[name] = "same family as a Google font"
        elif cull.slug(name) in seen:
            skipped[name] = "duplicate name in catalog"
        else:
            seen.add(cull.slug(name))
            todo.append(entry)

    print(f"Downloading {len(todo)} of {len(catalog)} typefree families...")
    with ThreadPoolExecutor(12) as pool:
        prepared = list(pool.map(prepare, todo))

    print("Signing cached Google fonts...")
    pool_names, pool_sigs = [], []
    for name in google:
        font = cull.load(name)
        if cull.is_color(font):
            continue
        sig = cull.signature(font)
        if sig.any():
            pool_names.append(name)
            pool_sigs.append(sig)

    kept = {}
    for entry, variant, data, error in prepared:
        name = display_name(entry["name"])
        if error:
            skipped[name] = f"could not convert ({error})"
            continue
        font = TTFont(io.BytesIO(data))
        font.flavor = None
        if not cull.has_english_letters(font):
            skipped[name] = "no English letters"
            continue
        if not cull.is_color(font):
            sig = cull.signature(font)
            if sig.any():
                diffs = np.sqrt(((np.stack(pool_sigs) - sig) ** 2).mean(axis=1))
                i = int(diffs.argmin())
                if diffs[i] < cull.MAX_DIFF:
                    skipped[name] = f"matches {pool_names[i]} (diff {diffs[i]:.3f})"
                    continue
                print(f"  keep {name} (closest: {pool_names[i]}, diff {diffs[i]:.3f})")
                pool_names.append(name)
                pool_sigs.append(sig)
        kept[name] = (entry, release_date(font), data)

    for name in previous - set(kept):
        path = os.path.join(cull.FONTS_DIR, cull.slug(name) + ".woff2")
        if os.path.exists(path):
            os.remove(path)
    for name, (_, _, data) in kept.items():
        with open(os.path.join(cull.FONTS_DIR, cull.slug(name) + ".woff2"), "wb") as f:
            f.write(data)

    names = sorted(kept)
    body = ",\n".join(
        f"  {json.dumps(n, ensure_ascii=False)}: "
        f"[{category_of(kept[n][0])}, {json.dumps(kept[n][1])}, {json.dumps(kept[n][0]['link'])}]"
        for n in names
    )
    with open(TYPEFREE_JS, "w") as f:
        f.write(f"window.typefreeFonts = {{\n{body}\n}};\n")

    safe = lambda s: (s or "").replace("|", "\\|").replace("\n", " ").strip()  # noqa: E731
    lines = [
        "# Fonts from typefree.org — Licenses & Attributions",
        "",
        "These `.woff2` files are trimmed copies of fonts listed on",
        "[typefree.org](https://typefree.org), each released for free use by its",
        "designer. See each family's homepage for its full license terms.",
        "",
        "This file is generated by `scripts/import-typefree-fonts.py`. Do not edit by hand.",
        "",
        "| Family | Designer | Homepage | License |",
        "| --- | --- | --- | --- |",
    ]
    for n in names:
        entry = kept[n][0]
        lines.append(
            f"| {safe(n)} | {safe(entry.get('author'))} | {safe(entry['link'])} | {safe(license_of(entry['variants']))} |"
        )
    with open(LICENSES_MD, "w") as f:
        f.write("\n".join(lines) + "\n")

    print(f"Kept {len(kept)}, skipped {len(skipped)}:")
    for name, why in sorted(skipped.items()):
        print(f"- {name}: {why}")


if __name__ == "__main__":
    sys.exit(main())
