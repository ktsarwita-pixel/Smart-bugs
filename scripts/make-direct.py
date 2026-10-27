#!/usr/bin/env python3
"""
Build the optimized single-file "run directly" HTML.

Usage (from project root):
    npm run build
    python3 scripts/make-direct.py [output.html]

Requires: fontTools + brotli  (pip install fonttools brotli)

What it does, on top of Vite's single-file output (dist/index.html):
  1. Downloads the 3 Google Fonts (latin subsets only).
  2. De-duplicates faces that point at the same font file
     (Newsreader italic 400/500 are one variable file Google serves
     twice — merging them saves ~84 KB of base64).
  3. Subsets every font to the characters the game actually renders
     (ASCII + the punctuation/symbols used in src/), shrinking them
     a further ~50-70%.
  4. Embeds the results as base64 data URIs, so the final HTML needs
     zero network and runs from file:// with a double-click.
"""
import base64
import io
import re
import sys
import urllib.request
import pathlib

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
CSS_URL = (
    "https://fonts.googleapis.com/css2?family=Press+Start+2P"
    "&family=IBM+Plex+Mono:wght@400;500;600;700"
    "&family=Newsreader:ital,wght@0,400;1,400;1,500&display=swap"
)

# Characters to keep: printable ASCII + latin-1 letters (EN/ID names)
# + every symbol the UI renders. Emojis are left to the OS emoji font.
KEEP_UNICODE = (
    [f"U+{c:04X}" for c in range(0x20, 0x7F)]
    + [f"U+{c:04X}" for c in range(0xA0, 0x100)]
    + [
        "U+03A3",  # Σ (ΣATK)
        "U+2013", "U+2014", "U+2018", "U+2019", "U+201C", "U+201D",
        "U+2022", "U+2026", "U+2192", "U+21BB", "U+2212", "U+2248",
        "U+25B8", "U+25BE", "U+2605", "U+2715",
    ]
)


def fetch(url: str, binary: bool = False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if binary else data.decode("utf-8")


def subset_font(woff2_bytes: bytes, pin_weight: int | None = None) -> bytes:
    """Subset a woff2 font to KEEP_UNICODE; returns new woff2 bytes.

    Variable fonts (Newsreader italic is served wght 200–800) are first
    instantiated to a single static weight — the game only uses it for
    italic flavour text, so one weight is indistinguishable in practice
    and ~2.7× smaller than keeping the whole variation space.
    """
    from fontTools import subset
    from fontTools.ttLib import TTFont

    font = TTFont(io.BytesIO(woff2_bytes))
    if pin_weight and "fvar" in font:
        from fontTools.varLib.instancer import instantiateVariableFont

        instantiateVariableFont(font, {"wght": pin_weight}, inplace=True)
    opts = subset.Options(flavor="woff2")
    opts.layout_features = ["kern", "liga", "tnum"]
    opts.name_IDs = []
    opts.notdef_outline = True
    ss = subset.Subsetter(opts)
    ss.populate(unicodes=[int(u[2:], 16) for u in KEEP_UNICODE])
    ss.subset(font)
    out = io.BytesIO()
    font.save(out)
    return out.getvalue()


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    dist = root / "dist" / "index.html"
    if not dist.exists():
        sys.exit("dist/index.html not found — run `npm run build` first.")
    target = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / "Smart-Bugs-RUN-DIRECTLY.html"

    css = fetch(CSS_URL)
    blocks = re.findall(r"/\*\s*latin\s*\*/\s*@font-face\s*\{[^}]+\}", css)

    # Group by (family, style, url) — merge weights of duplicate files.
    groups: dict[tuple[str, str, str], list[str]] = {}
    order: list[tuple[str, str, str]] = []
    for b in blocks:
        fam = re.search(r"font-family:\s*'([^']+)'", b).group(1)
        sty = re.search(r"font-style:\s*(\w+)", b).group(1)
        wt = re.search(r"font-weight:\s*([^;]+);", b).group(1).strip()
        url = re.search(r"url\((https://[^)]+\.woff2)\)", b).group(1)
        key = (fam, sty, url)
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(wt)

    faces = []
    total_before = total_after = 0
    for fam, sty, url in order:
        raw = fetch(url, binary=True)
        first_weight = int(groups[(fam, sty, url)][0])
        small = subset_font(raw, pin_weight=first_weight)
        total_before += len(raw)
        total_after += len(small)
        weights = groups[(fam, sty, url)]
        weight_decl = weights[0] if len(weights) == 1 else f"{weights[0]} {weights[-1]}"
        b64 = base64.b64encode(small).decode()
        faces.append(
            "@font-face{"
            f"font-family:'{fam}';font-style:{sty};font-weight:{weight_decl};"
            f"font-display:swap;src:url(data:font/woff2;base64,{b64}) format('woff2');"
            "}"
        )
        print(f"  {fam} {sty} {weight_decl}: {len(raw)//1024} KB -> {len(small)//1024} KB (subset)")

    print(f"Fonts total: {total_before//1024} KB -> {total_after//1024} KB "
          f"({len(faces)} faces, duplicates merged)")

    font_style = (
        "<style>\n/* Embedded subset fonts (was Google Fonts) — works offline / file:// */\n"
        + "\n".join(faces)
        + "\n</style>"
    )

    html = dist.read_text(encoding="utf-8")
    html = re.sub(r'<link rel="preconnect"[^>]*>\s*', "", html)
    html = re.sub(r'<link[^>]*href="https://fonts\.googleapis\.com/css2[^>]*>\s*', "", html)
    html = html.replace("</head>", font_style + "\n</head>", 1)
    comment = (
        "<!-- MAGIC WILDLIFE — DIRECT RUN FILE (optimized build): all project files "
        "(React, Three.js, Tailwind, subset fonts, game code) are bundled inside "
        "this ONE file. Open it in a browser (double-click). No server/npm/internet "
        "needed. Regenerate with: npm run build && python3 scripts/make-direct.py -->\n"
    )
    target.write_text(comment + html, encoding="utf-8")
    print(f"Wrote {target}  ({target.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
