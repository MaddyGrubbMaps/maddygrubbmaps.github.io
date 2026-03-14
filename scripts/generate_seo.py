#!/usr/bin/env python3
"""
generate_seo.py — runs in GitHub Actions on every push to main.
Patches HTML files directly (meta tags, alt text, responsive CSS),
then writes a review summary. The workflow handles the PR.
"""

import os
import re
import time
from pathlib import Path
from html.parser import HTMLParser
from datetime import date

import anthropic

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
REPO_ROOT  = Path(__file__).parent.parent
SITE_NAME  = "Maddy Grubb Maps"
SITE_URL   = "https://maddygrubbmaps.com"
OG_IMAGE   = f"{SITE_URL}/images/Logo.png"

SKIP_FILES = {"Blog-Template.html", "Post-Template.html", "post.html"}
SKIP_DIRS  = {".github", "scripts", "intlTelInput", "node_modules"}

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


# ---------------------------------------------------------------------------
# Find HTML files
# ---------------------------------------------------------------------------

def find_html_files():
    files = []
    for path in REPO_ROOT.rglob("*.html"):
        parts = set(path.relative_to(REPO_ROOT).parts)
        if parts & SKIP_DIRS:
            continue
        if path.name in SKIP_FILES:
            continue
        files.append(path)
    return sorted(files)


# ---------------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------------

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.h1    = ""
        self.body_words = []
        self.images = []
        self._in = {t: False for t in ("title", "h1", "body", "script", "style")}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in self._in:
            self._in[tag] = True
        if tag == "img" and attrs.get("src"):
            self.images.append({"src": attrs["src"], "alt": attrs.get("alt", "")})

    def handle_endtag(self, tag):
        if tag in ("title", "h1", "script", "style"):
            self._in[tag] = False

    def handle_data(self, data):
        text = data.strip()
        if not text:
            return
        if self._in["title"]:
            self.title += text
        elif self._in["h1"]:
            self.h1 += text
        elif self._in["body"] and not self._in["script"] and not self._in["style"]:
            self.body_words.append(text)

def parse_html(html):
    p = PageParser()
    p.feed(html)
    return {
        "title":        p.title.strip(),
        "h1":           p.h1.strip(),
        "body_preview": " ".join(p.body_words)[:500],
        "images":       p.images,
    }


# ---------------------------------------------------------------------------
# Claude API
# ---------------------------------------------------------------------------

def generate_meta_description(page_path, parsed):
    prompt = (
        f'SEO expert for "{SITE_NAME}" — freelance cartography and GIS portfolio.\n\n'
        f"Write a meta description (150–160 chars) for this page:\n"
        f"- File: {page_path.name}\n"
        f"- Title: {parsed['title']}\n"
        f"- H1: {parsed['h1']}\n"
        f"- Content: {parsed['body_preview'][:300]}\n\n"
        f"Rules: 150–160 chars exactly, action-oriented, include relevant keywords "
        f"(cartography, maps, GIS), professional tone. Return ONLY the description."
    )
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip().strip("\"'")


def generate_alt_text(img_src, page_path, parsed):
    filename = Path(img_src).stem.replace("-", " ").replace("_", " ")
    prompt = (
        f'Alt text for an image on "{SITE_NAME}" cartography portfolio.\n\n'
        f"Image filename (hint): {filename}\n"
        f"Page: {parsed['title'] or page_path.name}\n"
        f"Context: {parsed['body_preview'][:200]}\n\n"
        f"Rules: under 100 chars, describe what the image shows specifically, "
        f"no 'image of' prefix. Return ONLY the alt text."
    )
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=60,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip().strip("\"'")


# ---------------------------------------------------------------------------
# HTML patching
# ---------------------------------------------------------------------------

def patch_meta(html, name, content, prop="name"):
    attr    = f'{prop}="{name}"'
    pattern = rf'<meta\s[^>]*{re.escape(attr)}[^>]*/?\s*>'
    new_tag = f'<meta {prop}="{name}" content="{content}">'
    if re.search(pattern, html, re.IGNORECASE):
        return re.sub(pattern, new_tag, html, flags=re.IGNORECASE)
    return html.replace("</head>", f"  {new_tag}\n</head>", 1)


def patch_title(html, title):
    if re.search(r"<title>", html, re.IGNORECASE):
        return re.sub(r"<title>[^<]*</title>", f"<title>{title}</title>",
                      html, flags=re.IGNORECASE)
    return html.replace("</head>", f"  <title>{title}</title>\n</head>", 1)


def patch_img_alt(html, filename, alt_text):
    safe_alt = alt_text.replace('"', "&quot;")
    escaped  = re.escape(filename)

    def replacer(m):
        tag = m.group(0)
        if re.search(r"\balt=", tag, re.IGNORECASE):
            return re.sub(r'alt="[^"]*"', f'alt="{safe_alt}"', tag, flags=re.IGNORECASE)
        return re.sub(r"\s*/?>$", f' alt="{safe_alt}">', tag.rstrip())

    pattern = rf'<img\b[^>]*\bsrc="[^"]*{escaped}[^"]*"[^>]*/?\s*>'
    return re.sub(pattern, replacer, html, flags=re.IGNORECASE)


def inject_responsive_css(html, page_path):
    if "responsive-fixes.css" in html:
        return html
    depth  = len(page_path.relative_to(REPO_ROOT).parts) - 1
    prefix = "../" * depth
    link   = f'  <link rel="stylesheet" href="{prefix}responsive-fixes.css" media="screen">\n'
    return html.replace("</head>", link + "</head>", 1)


def ensure_og_image(html):
    if 'property="og:image"' not in html:
        tag = f'  <meta property="og:image" content="{OG_IMAGE}">\n'
        return html.replace("</head>", tag + "</head>", 1)
    return html


# ---------------------------------------------------------------------------
# Copy responsive CSS to repo root
# ---------------------------------------------------------------------------

def sync_responsive_css():
    src  = REPO_ROOT / "scripts" / "responsive_fixes.css"
    dest = REPO_ROOT / "responsive-fixes.css"
    if src.exists():
        dest.write_text(src.read_text())
        return True
    return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    today    = date.today().isoformat()
    html_files = find_html_files()
    print(f"Found {len(html_files)} pages to process.\n")

    sync_responsive_css()
    print("✓ responsive-fixes.css synced to root\n")

    review_lines = [
        f"# SEO & Accessibility Review — {today}",
        "",
        "Review the changes below. **Merge this PR** to publish them to your live site.",
        "If anything looks wrong, edit the files on this branch before merging.",
        "",
        "---",
        "",
    ]

    for page_path in html_files:
        rel  = page_path.relative_to(REPO_ROOT)
        html = page_path.read_text(encoding="utf-8")
        print(f"Processing {rel}...")
        parsed = parse_html(html)

        # --- Meta description ---
        try:
            meta = generate_meta_description(page_path, parsed)
            time.sleep(0.3)
        except Exception as e:
            print(f"  ⚠ Meta API error: {e}")
            meta = ("Custom cartography and GIS services by Maddy Grubb. "
                    "Trail maps, climate maps, and outdoor recreation cartography.")

        raw_title  = parsed["title"].replace(f" | {SITE_NAME}", "").strip()
        page_title = f"{raw_title} | {SITE_NAME}" if raw_title else SITE_NAME

        html = patch_meta(html, "description", meta)
        html = patch_meta(html, "og:description", meta, prop="property")
        html = patch_title(html, page_title)
        html = patch_meta(html, "og:title", page_title, prop="property")
        html = ensure_og_image(html)

        # --- Alt text for blank images ---
        blank_imgs = [img for img in parsed["images"] if not img["alt"].strip()]
        print(f"  {len(blank_imgs)} images need alt text")

        alt_summary = []
        for img in blank_imgs:
            filename = Path(img["src"]).name
            try:
                alt = generate_alt_text(img["src"], page_path, parsed)
                time.sleep(0.2)
            except Exception as e:
                print(f"  ⚠ Alt API error for {filename}: {e}")
                alt = "Cartography work by Maddy Grubb Maps"
            html = patch_img_alt(html, filename, alt)
            alt_summary.append(f"  - `{filename}` → {alt}")

        # --- Responsive CSS ---
        html = inject_responsive_css(html, page_path)

        # --- Write back ---
        page_path.write_text(html, encoding="utf-8")
        print(f"  ✓ patched")

        # --- Review block ---
        review_lines += [
            f"## `{rel}`",
            "",
            f"**Meta description:** {meta}",
            "",
            f"**Page title:** {page_title}",
            "",
        ]
        if alt_summary:
            review_lines += ["**Alt text added:**", ""] + alt_summary + [""]
        review_lines.append("---")
        review_lines.append("")

    review_lines += [
        "_Generated automatically by `scripts/generate_seo.py`._",
        "_Edit `scripts/page_config.json` to override any value on future runs._",
    ]

    review_path = REPO_ROOT / "_seo_review.md"
    review_path.write_text("\n".join(review_lines), encoding="utf-8")
    print(f"\n✅ Done. Review summary written to _seo_review.md")


if __name__ == "__main__":
    main()
