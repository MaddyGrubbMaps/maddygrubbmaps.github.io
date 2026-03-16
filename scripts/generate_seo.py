#!/usr/bin/env python3
"""
generate_seo.py — runs in GitHub Actions on every push to main.

Cache behaviour:
  - scripts/seo_cache.json stores every approved meta description and alt text.
  - On each run, cached values are applied instantly (no API call).
  - The API is only called for pages/images not yet in the cache.
  - The updated cache is committed as part of the seo-draft PR.
  - Merging the PR locks those values in permanently.

Run modes:
  - push:             only processes HTML files changed in that commit.
  - workflow_dispatch: processes all HTML files (full site refresh).
"""

import os
import re
import time
import urllib.request
import json
from pathlib import Path
from html.parser import HTMLParser
from datetime import date

import anthropic

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
REPO_ROOT  = Path(__file__).parent.parent
REPO       = "MaddyGrubbMaps/maddygrubbmaps.github.io"
CACHE_PATH = REPO_ROOT / "scripts" / "seo_cache.json"
SITE_NAME  = "Maddy Grubb Maps"
SITE_URL   = "https://maddygrubbmaps.com"
OG_IMAGE   = f"{SITE_URL}/images/Logo.png"

SKIP_FILES = {"Blog-Template.html", "Post-Template.html", "post.html"}
SKIP_DIRS  = {".github", "scripts", "intlTelInput", "node_modules"}

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


# ---------------------------------------------------------------------------
# Cache — keyed by page path or image filename
# ---------------------------------------------------------------------------

def load_cache():
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"meta": {}, "titles": {}, "alt": {}}


def save_cache(cache):
    CACHE_PATH.write_text(
        json.dumps(cache, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# Find HTML files — changed only (push) or all (manual)
# ---------------------------------------------------------------------------

def get_changed_html_files():
    sha = os.environ.get("GITHUB_SHA", "")
    if not sha:
        return None
    try:
        req = urllib.request.Request(
            f"https://api.github.com/repos/{REPO}/commits/{sha}",
            headers={"Accept": "application/vnd.github.v3+json"}
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        changed = []
        for f in data.get("files", []):
            if f["status"] in ("added", "modified") and f["filename"].endswith(".html"):
                path = REPO_ROOT / f["filename"]
                if path.exists() and path.name not in SKIP_FILES:
                    parts = set(Path(f["filename"]).parts)
                    if not (parts & SKIP_DIRS):
                        changed.append(path)
        return sorted(changed)
    except Exception as e:
        print(f"⚠ Could not fetch changed files: {e} — falling back to all files")
        return None


def find_all_html_files():
    files = []
    for path in REPO_ROOT.rglob("*.html"):
        parts = set(path.relative_to(REPO_ROOT).parts)
        if parts & SKIP_DIRS:
            continue
        if path.name in SKIP_FILES:
            continue
        files.append(path)
    return sorted(files)


def find_html_files():
    event = os.environ.get("GITHUB_EVENT_NAME", "")
    if event == "workflow_dispatch":
        print("Manual run — processing all HTML files.")
        return find_all_html_files()
    changed = get_changed_html_files()
    if changed is not None:
        if not changed:
            print("No HTML files changed in this push — nothing to do.")
            return []
        print(f"Push detected — processing {len(changed)} changed file(s) only.")
        return changed
    return find_all_html_files()


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


def ensure_og_image(html):
    if 'property="og:image"' not in html:
        tag = f'  <meta property="og:image" content="{OG_IMAGE}">\n'
        return html.replace("</head>", tag + "</head>", 1)
    return html


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    today      = date.today().isoformat()
    cache      = load_cache()
    html_files = find_html_files()

    if not html_files:
        return

    print(f"Cache: {len(cache['meta'])} pages, {len(cache['alt'])} images already cached.\n")

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
        rel    = str(page_path.relative_to(REPO_ROOT))
        html   = page_path.read_text(encoding="utf-8")
        print(f"Processing {rel}...")
        parsed = parse_html(html)

        # --- Meta description (cache-first) ---
        if rel in cache["meta"]:
            meta = cache["meta"][rel]
            print(f"  ✓ meta description from cache")
        else:
            try:
                meta = generate_meta_description(page_path, parsed)
                cache["meta"][rel] = meta
                time.sleep(0.3)
                print(f"  ✓ meta description generated")
            except Exception as e:
                print(f"  ⚠ Meta API error: {e}")
                meta = ("Custom cartography and GIS services by Maddy Grubb. "
                        "Trail maps, climate maps, and outdoor recreation cartography.")

        # --- Page title (cache-first) ---
        if rel in cache["titles"]:
            page_title = cache["titles"][rel]
        else:
            raw_title  = parsed["title"].replace(f" | {SITE_NAME}", "").strip()
            page_title = f"{raw_title} | {SITE_NAME}" if raw_title else SITE_NAME
            cache["titles"][rel] = page_title

        html = patch_meta(html, "description", meta)
        html = patch_meta(html, "og:description", meta, prop="property")
        html = patch_title(html, page_title)
        html = patch_meta(html, "og:title", page_title, prop="property")
        html = ensure_og_image(html)

        # --- Alt text (cache-first, only blank images) ---
        all_imgs   = parsed["images"]
        alt_summary = []
        cached_count = 0

        for img in all_imgs:
            filename = Path(img["src"]).name
            if not filename:
                continue

            if filename in cache["alt"]:
                # Apply from cache regardless of whether it's blank in the export
                alt = cache["alt"][filename]
                html = patch_img_alt(html, filename, alt)
                cached_count += 1
            elif not img["alt"].strip():
                # New image — generate and cache
                try:
                    alt = generate_alt_text(img["src"], page_path, parsed)
                    cache["alt"][filename] = alt
                    time.sleep(0.2)
                except Exception as e:
                    print(f"  ⚠ Alt API error for {filename}: {e}")
                    alt = "Cartography work by Maddy Grubb Maps"
                html = patch_img_alt(html, filename, alt)
                alt_summary.append(f"  - `{filename}` → {alt}")

        if cached_count:
            print(f"  ✓ {cached_count} images restored from cache")
        if alt_summary:
            print(f"  ✓ {len(alt_summary)} new images generated")

        # --- Write back ---
        page_path.write_text(html, encoding="utf-8")

        # --- Review block (only show new/changed items) ---
        is_new_meta = rel not in cache["meta"] or True  # always show for changed pages
        review_lines += [f"## `{rel}`", ""]
        review_lines += [f"**Meta description:** {meta}", ""]
        review_lines += [f"**Page title:** {page_title}", ""]
        if alt_summary:
            review_lines += ["**New alt text:**", ""] + alt_summary + [""]
        if cached_count and not alt_summary:
            review_lines += [f"_{cached_count} image(s) restored from cache — no changes._", ""]
        review_lines += ["---", ""]

    # Save updated cache
    save_cache(cache)
    print(f"\n✓ Cache saved ({len(cache['meta'])} pages, {len(cache['alt'])} images)")

    review_lines += [
        "_Generated by `scripts/generate_seo.py`._",
        "_To override any value, edit `scripts/seo_cache.json` directly._",
    ]

    review_path = REPO_ROOT / "_seo_review.md"
    review_path.write_text("\n".join(review_lines), encoding="utf-8")
    print(f"✅ Done. Review summary written to _seo_review.md")


if __name__ == "__main__":
    main()
