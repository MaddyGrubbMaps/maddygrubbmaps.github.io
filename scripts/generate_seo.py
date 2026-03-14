#!/usr/bin/env python3
"""
generate_seo.py — runs in GitHub Actions on every push to main.
Fetches all HTML pages, generates SEO content via Claude API,
and populates the Notion review databases. Nothing is written to the repo.
"""

import os
import re
import time
import requests
from pathlib import Path
from html.parser import HTMLParser
from datetime import date

import anthropic

# ---------------------------------------------------------------------------
# Config — from GitHub Actions secrets
# ---------------------------------------------------------------------------
REPO            = "MaddyGrubbMaps/maddygrubbmaps.github.io"
RAW_BASE        = f"https://raw.githubusercontent.com/{REPO}/main"
SITE_NAME       = "Maddy Grubb Maps"

ANTHROPIC_API_KEY   = os.environ["ANTHROPIC_API_KEY"]
NOTION_TOKEN        = os.environ["NOTION_TOKEN"]
NOTION_PAGES_DB_ID  = os.environ.get("NOTION_PAGES_DB_ID",  "f542c52e-233c-4c29-a425-03c8a5c6e920")
NOTION_IMAGES_DB_ID = os.environ.get("NOTION_IMAGES_DB_ID", "c4471e1b-2d78-4eb2-bddf-1fc97ee636dd")

SKIP_FILES = {"Blog-Template.html", "Post-Template.html", "post.html"}
SCAN_FOLDERS = ["", "Adventures_Posts", "Client-Types", "Map-Pages", "blog"]

anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

NOTION_HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}


# ---------------------------------------------------------------------------
# Fetch HTML files from GitHub
# ---------------------------------------------------------------------------

def fetch_html_files():
    files = []
    for folder in SCAN_FOLDERS:
        url = f"https://api.github.com/repos/{REPO}/contents/{folder}"
        resp = requests.get(url, timeout=10)
        if not resp.ok:
            continue
        for item in resp.json():
            if item["type"] == "file" and item["name"].endswith(".html"):
                if item["name"] in SKIP_FILES:
                    continue
                path = item["path"]
                html = requests.get(f"{RAW_BASE}/{path}", timeout=10).text
                files.append((path, html))
                time.sleep(0.1)
    return files


# ---------------------------------------------------------------------------
# HTML parsing (stdlib only — no beautifulsoup needed in generate step)
# ---------------------------------------------------------------------------

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.h1 = ""
        self.body_words = []
        self.images = []
        self._in = {"title": False, "h1": False, "body": False, "script": False, "style": False}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for t in ("title", "h1", "body", "script", "style"):
            if tag == t:
                self._in[t] = True
        if tag == "img" and attrs.get("src"):
            self.images.append({"src": attrs["src"], "alt": attrs.get("alt", "")})

    def handle_endtag(self, tag):
        for t in ("title", "h1", "script", "style"):
            if tag == t:
                self._in[t] = False

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
        f'You are an SEO expert for a freelance cartography and GIS portfolio site called "{SITE_NAME}".\n\n'
        f"Write a meta description (150–160 characters) for this page:\n"
        f"- File: {page_path}\n"
        f"- Title tag: {parsed['title']}\n"
        f"- H1: {parsed['h1']}\n"
        f"- Content preview: {parsed['body_preview'][:300]}\n\n"
        f"Rules: 150–160 chars, action-oriented, include relevant keywords (cartography, maps, GIS), "
        f"professional tone. Return ONLY the description text."
    )
    msg = anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip().strip("\"'")


def generate_alt_text(img_src, page_path, parsed):
    filename = Path(img_src).stem.replace("-", " ").replace("_", " ")
    prompt = (
        f'Generate alt text for an image on a cartography portfolio site ("{SITE_NAME}").\n\n'
        f"Image filename (hint): {filename}\n"
        f"Page: {parsed['title'] or page_path}\n"
        f"Page context: {parsed['body_preview'][:200]}\n\n"
        f"Rules: under 100 chars, describe specifically what the image shows, "
        f"no 'image of' prefix. Return ONLY the alt text."
    )
    msg = anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=60,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip().strip("\"'")


# ---------------------------------------------------------------------------
# Notion helpers
# ---------------------------------------------------------------------------

def notion_find_existing(db_id, title_prop, title_value):
    resp = requests.post(
        f"https://api.notion.com/v1/databases/{db_id}/query",
        headers=NOTION_HEADERS,
        json={"filter": {"property": title_prop, "title": {"equals": title_value}}},
        timeout=10,
    )
    results = resp.json().get("results", [])
    return results[0]["id"] if results else None


def notion_upsert(db_id, title_prop, title_value, props_data):
    """Create or update a Notion DB row. Never overwrites Status on existing rows."""
    existing_id = notion_find_existing(db_id, title_prop, title_value)

    props = {title_prop: {"title": [{"text": {"content": title_value[:2000]}}]}}
    for key, value in props_data.items():
        if key == "Status":
            if not existing_id:   # only set on creation
                props[key] = {"select": {"name": value}}
        elif key == "Last Run":
            props[key] = {"date": {"start": value}}
        else:
            props[key] = {"rich_text": [{"text": {"content": str(value)[:2000]}}]}

    if existing_id:
        update = {k: v for k, v in props.items() if k != "Status"}
        requests.patch(
            f"https://api.notion.com/v1/pages/{existing_id}",
            headers=NOTION_HEADERS,
            json={"properties": update},
            timeout=10,
        )
    else:
        requests.post(
            "https://api.notion.com/v1/pages",
            headers=NOTION_HEADERS,
            json={"parent": {"database_id": db_id}, "properties": props},
            timeout=10,
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    today = date.today().isoformat()

    print("Fetching HTML files from GitHub...")
    files = fetch_html_files()
    print(f"Found {len(files)} pages.\n")

    for page_path, html in files:
        print(f"Processing {page_path}...")
        parsed = parse_html(html)

        # --- Meta description ---
        try:
            meta = generate_meta_description(page_path, parsed)
            time.sleep(0.3)
        except Exception as e:
            print(f"  ⚠ Meta API error: {e}")
            meta = "Custom cartography and GIS services by Maddy Grubb. Trail maps, climate maps, and outdoor recreation cartography."

        raw_title = parsed["title"].replace(" | Maddy Grubb Maps", "").strip()
        page_title = f"{raw_title} | {SITE_NAME}" if raw_title else SITE_NAME

        notion_upsert(
            NOTION_PAGES_DB_ID, "Page", page_path,
            {"Meta Description": meta, "Page Title": page_title,
             "OG Description": meta, "Status": "Draft", "Last Run": today},
        )
        print(f"  ✓ Page SEO → Notion")

        # --- Alt text for blank images ---
        blank_imgs = [img for img in parsed["images"] if not img["alt"].strip()]
        print(f"  {len(blank_imgs)} images need alt text")

        for img in blank_imgs:
            filename = Path(img["src"]).name
            try:
                alt = generate_alt_text(img["src"], page_path, parsed)
                time.sleep(0.2)
            except Exception as e:
                print(f"  ⚠ Alt API error for {filename}: {e}")
                alt = "Cartography work by Maddy Grubb Maps"

            notion_upsert(
                NOTION_IMAGES_DB_ID, "Image", filename,
                {"Alt Text": alt, "Page": page_path, "Status": "Draft"},
            )

        if blank_imgs:
            print(f"  ✓ {len(blank_imgs)} images → Notion")

    print(f"\n✅ Done. Review at: https://www.notion.so/323d0b23a28b815bbb77f41f4f4b1089")


if __name__ == "__main__":
    main()
