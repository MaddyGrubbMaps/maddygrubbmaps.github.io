#!/usr/bin/env python3
"""
apply_from_notion.py — triggered manually via GitHub Actions workflow_dispatch.
Reads Approved rows from Notion, patches HTML files in the repo, commits back.
"""

import os
import re
import base64
import time
import requests
from pathlib import Path

REPO             = "MaddyGrubbMaps/maddygrubbmaps.github.io"
SITE_URL         = "https://maddygrubbmaps.com"
SITE_NAME        = "Maddy Grubb Maps"

GITHUB_TOKEN        = os.environ["GITHUB_TOKEN"]
NOTION_TOKEN        = os.environ["NOTION_TOKEN"]
NOTION_PAGES_DB_ID  = os.environ.get("NOTION_PAGES_DB_ID",  "f542c52e-233c-4c29-a425-03c8a5c6e920")
NOTION_IMAGES_DB_ID = os.environ.get("NOTION_IMAGES_DB_ID", "c4471e1b-2d78-4eb2-bddf-1fc97ee636dd")

NOTION_HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}
GITHUB_HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json",
}


# ---------------------------------------------------------------------------
# Notion: fetch approved rows
# ---------------------------------------------------------------------------

def _rich_text(prop):
    t = prop.get("type", "")
    items = prop.get("title", []) if t == "title" else prop.get("rich_text", [])
    return "".join(i.get("plain_text", "") for i in items)


def get_approved_pages():
    resp = requests.post(
        f"https://api.notion.com/v1/databases/{NOTION_PAGES_DB_ID}/query",
        headers=NOTION_HEADERS,
        json={"filter": {"property": "Status", "select": {"equals": "Approved"}},
              "page_size": 100},
        timeout=10,
    )
    out = []
    for row in resp.json().get("results", []):
        p = row["properties"]
        out.append({
            "page_path":       _rich_text(p.get("Page", {})),
            "meta_description": _rich_text(p.get("Meta Description", {})),
            "page_title":      _rich_text(p.get("Page Title", {})),
            "og_description":  _rich_text(p.get("OG Description", {})),
        })
    return out


def get_approved_images():
    resp = requests.post(
        f"https://api.notion.com/v1/databases/{NOTION_IMAGES_DB_ID}/query",
        headers=NOTION_HEADERS,
        json={"filter": {"property": "Status", "select": {"equals": "Approved"}},
              "page_size": 100},
        timeout=10,
    )
    out = []
    for row in resp.json().get("results", []):
        p = row["properties"]
        out.append({
            "image_filename": _rich_text(p.get("Image", {})),
            "alt_text":       _rich_text(p.get("Alt Text", {})),
            "page_path":      _rich_text(p.get("Page", {})),
        })
    return out


# ---------------------------------------------------------------------------
# GitHub: read/write files
# ---------------------------------------------------------------------------

def gh_get(path):
    resp = requests.get(
        f"https://api.github.com/repos/{REPO}/contents/{path}",
        headers=GITHUB_HEADERS, timeout=10,
    )
    if not resp.ok:
        return None, None
    data = resp.json()
    content = base64.b64decode(data["content"]).decode("utf-8")
    return content, data["sha"]


def gh_put(path, content, sha, message):
    encoded = base64.b64encode(content.encode("utf-8")).decode("utf-8")
    body = {"message": message, "content": encoded}
    if sha:
        body["sha"] = sha
    resp = requests.put(
        f"https://api.github.com/repos/{REPO}/contents/{path}",
        headers=GITHUB_HEADERS, json=body, timeout=10,
    )
    if not resp.ok:
        print(f"  ✗ GitHub error: {resp.status_code} {resp.text[:200]}")
    return resp.ok


# ---------------------------------------------------------------------------
# HTML patching (regex-based, no external deps)
# ---------------------------------------------------------------------------

def patch_meta(html, name, content, prop="name"):
    attr = f'{prop}="{name}"'
    pattern = rf'<meta\s[^>]*{re.escape(attr)}[^>]*/?\s*>'
    new_tag = f'<meta {prop}="{name}" content="{content}">'
    if re.search(pattern, html, re.IGNORECASE):
        return re.sub(pattern, new_tag, html, flags=re.IGNORECASE)
    return html.replace("</head>", f"  {new_tag}\n</head>", 1)


def patch_title(html, title):
    if re.search(r'<title>', html, re.IGNORECASE):
        return re.sub(r'<title>[^<]*</title>', f'<title>{title}</title>', html, flags=re.IGNORECASE)
    return html.replace("</head>", f"  <title>{title}</title>\n</head>", 1)


def patch_img_alt(html, filename, alt_text):
    safe_alt = alt_text.replace('"', '&quot;')
    escaped  = re.escape(filename)

    def replacer(m):
        tag = m.group(0)
        if re.search(r'\balt=', tag, re.IGNORECASE):
            return re.sub(r'alt="[^"]*"', f'alt="{safe_alt}"', tag, flags=re.IGNORECASE)
        # Insert alt before closing > or />
        return re.sub(r'\s*/?>$', f' alt="{safe_alt}">', tag.rstrip())

    pattern = rf'<img\b[^>]*\bsrc="[^"]*{escaped}[^"]*"[^>]*/?\s*>'
    return re.sub(pattern, replacer, html, flags=re.IGNORECASE)


def inject_responsive_css(html, page_path):
    if "responsive-fixes.css" in html:
        return html
    depth  = len(Path(page_path).parts) - 1
    prefix = "../" * depth
    link   = f'  <link rel="stylesheet" href="{prefix}responsive-fixes.css" media="screen">\n'
    return html.replace("</head>", link + "</head>", 1)


def ensure_og_image(html):
    if 'property="og:image"' not in html:
        tag = f'  <meta property="og:image" content="{SITE_URL}/images/Logo.png">\n'
        return html.replace("</head>", tag + "</head>", 1)
    return html


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("Fetching approved data from Notion...")
    pages  = get_approved_pages()
    images = get_approved_images()
    print(f"  {len(pages)} pages, {len(images)} images approved\n")

    if not pages and not images:
        print("Nothing approved — nothing to do.")
        return

    # Build lookup: image filename -> alt text
    image_alts = {img["image_filename"]: img["alt_text"] for img in images}

    # Gather all page paths that need work
    page_map = {p["page_path"]: p for p in pages}
    for img in images:
        if img["page_path"] and img["page_path"] not in page_map:
            page_map[img["page_path"]] = None

    # Push responsive-fixes.css to repo root
    css_src, _ = gh_get("scripts/responsive_fixes.css")
    if css_src:
        _, dest_sha = gh_get("responsive-fixes.css")
        gh_put("responsive-fixes.css", css_src, dest_sha,
               "chore: update responsive-fixes.css")
        print("✓ responsive-fixes.css pushed to root\n")

    # Patch each page
    changed = 0
    for page_path, page_data in page_map.items():
        if not page_path:
            continue
        print(f"Patching {page_path}...")
        html, sha = gh_get(page_path)
        if not html:
            print(f"  ⚠ Could not fetch — skipping")
            continue

        original = html

        if page_data:
            if page_data["meta_description"]:
                html = patch_meta(html, "description",   page_data["meta_description"])
                html = patch_meta(html, "og:description", page_data["og_description"] or page_data["meta_description"], prop="property")
            if page_data["page_title"]:
                html = patch_title(html, page_data["page_title"])
                html = patch_meta(html, "og:title", page_data["page_title"], prop="property")
            html = ensure_og_image(html)

        for filename, alt_text in image_alts.items():
            if filename in html:
                html = patch_img_alt(html, filename, alt_text)

        html = inject_responsive_css(html, page_path)

        if html != original:
            ok = gh_put(page_path, html, sha, f"seo: update meta & accessibility — {page_path}")
            print(f"  {'✓ committed' if ok else '✗ failed'}")
            if ok:
                changed += 1
            time.sleep(0.5)
        else:
            print(f"  — no changes needed")

    print(f"\n✅ Done. {changed} files updated and committed.")


if __name__ == "__main__":
    main()
