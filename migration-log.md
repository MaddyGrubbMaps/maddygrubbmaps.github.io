# Migration Log

Running ledger of design decisions, token additions, pattern changes, and notable conversions during the Nicepage → Brand migration. Each entry should make the *why* legible without re-reading the diff.

---

## 2026-05-04

### Step 2 — shared header extraction ✅
- **Created `partials/header.html`** — single source of truth for the site nav. Uses `{{path}}` token everywhere a root-relative path is needed. Resolves cleanly for both root pages (`""`) and subfolder pages (`"../"`).
- **Created `mgm-header.js`** — fetches the partial, substitutes tokens, injects into `<header id="sec-cdd0">` placeholder, then rebinds all interactivity: hamburger open/close/overlay click, scroll state (`mgm-at-top` ↔ `body.mgm-header-scrolled` at 60px), mobile submenu tap-to-expand (capture phase + `stopImmediatePropagation`), and active-page nav highlight.
- **Why bind hamburger ourselves:** Nicepage's own JS scans for `.u-hamburger-link` at DOMContentLoaded — by then our placeholder is empty, so its bindings would no-op. Our handler toggles `body.u-offcanvas-opened` directly, which is what Nicepage's CSS keys off.
- **Path-rooting strategy:** all submenu links go through root (`{{path}}Client-Types/X.html`) instead of sibling refs (`X.html`). Slightly longer paths from inside `Client-Types/` (`../Client-Types/X.html`) but eliminates the need for two tokens.
- **`index.html` placeholder:** 117 lines of inline header markup → 3 lines (placeholder + script tag).
- **Removed duplicated IIFEs from index.html:** scroll-nav and tap-to-expand handlers are now owned by `mgm-header.js`. Kept the lightbox IIFE since it's homepage-specific.
- **Removed `<style class="u-overlap-style">` cruft** — declared `transparency: 0` which isn't a valid CSS property.
- **Brand.css additions:**
  - `.mgm-logo-link` wrapper for the now-clickable home logo (previously a Pinegrow `data-href` that did nothing).
  - `.u-nav-3 .mgm-nav-journal { display: none }` at ≤767px — Journal is desktop-only per Maddy's directive.
  - Active-page highlight rule on `.mgm-nav-active` (var(--teal) when scrolled, #B8D4C7 at-top white-text state).
- **Validation:** JS syntax clean (`node --check`); partial substitutes for both root + subfolder; counts match (2× Portfolio links, 2× journal items in desktop+mobile, 1× logo image). No `{{path}}` leakage.

---

### Step 1 — cleanup pass ✅
- Created this log + `migration-pauses.md` for the skip-and-resume queue.
- Explore agent audit: zero inbound references to deletion list across the site. Sitemap/robots/llms all clean.
- **Deleted files:** `Landing-Page.html`, `Landing-Page.css`, `Blog-Template.css`, `Post-Template.css`, `pinegrow.json`, `projectdb.pgml`, `CNAME.txt` (duplicate of `CNAME`).
- **Deleted folders:** `blog/`, `_pgbackup/`, `_pginfo/`.
- **Removed footers** (`<footer id="sec-71e6">`) from 10 pages: `Journal.html`, all 7 Adventure posts, `Map-Pages/photorealistic_blender_maps.html`, `Client-Types/Landowners-Ranches.html`. Other Client-Types/top-level pages had no footer.
- Sitemap/robots/llms left untouched — no edits needed.
- One executive decision logged in `migration-pauses.md`: deletion of `CNAME.txt`.
