# Migration Log

Running ledger of design decisions, token additions, pattern changes, and notable conversions during the Nicepage → Brand migration. Each entry should make the *why* legible without re-reading the diff.

---

## 2026-05-04

### Step 6 — Client-Types pages (Pattern A) ✅
- Applied Pattern A (typography + shared header) to all 5 Client-Types pages: Climate-Conservation-Community, Outdoor-Recreation, Landowners-Ranches, Snow-Skiing, Art.
- **Decision:** Shipped Pattern A instead of the planned Pattern B. See `migration-pauses.md` for rationale and Step 6b followup.
- Same per-file edits as Adventures + Map-Pages: header replacement (`data-path-root="../"`), brand fonts URL, brand.css link, white-bg sweep on per-page CSS (mostly no-ops since pages inherit from nicepage.css's `.u-body` rule which brand.css now overrides).
- All 5 verified via grep + live curl: 1 placeholder, 0 legacy headers, 1 brand.css link each.

---

### Step 5 — Journal restyle ✅
- Full Pattern B conversion of `Journal.html` — three pages of design ground laid down for the rest of the migration to consume.
- **Hero (`#sec-87f9`):** legacy single `<p>` with bg-image → `mgm-hero-section` + `mgm-journal-hero` modifier with eyebrow ("Journal") + h1 ("I like to go on adventures.") + sub ("Sometimes I make maps and art about these trips."). User-written copy preserved verbatim, just typographically restructured into role-appropriate elements per brand system.
- **Adventure post grid (`#sec-13d6` first list):** Nicepage `u-list/u-repeater/u-list-item` markup → semantic `<a class="mgm-journal-card">` with edge-to-edge photo + eyebrow date + Newsreader title + body excerpt. New pattern lives in brand.css. Card excerpts cleaned (e.g. "April 2024 - Two weeks…" → eyebrow "April 2024" + excerpt "Two weeks…").
- **Substack callout (`#sec-13d6` second list):** standalone two-column featured callout (`mgm-substack-card`) on `--paper-2` surface with orange-deep hover accent. New pattern, distinct from the post grid because it's an external link to ongoing series (different IA from a single post).
- **Generic hero pattern:** moved `.mgm-hero-section` structural rules (position, flex centering, content sizing, white title color, parallax with iOS fallback) from `index.css` (homepage-only) → `brand.css` so any page can build a hero. `index.css` keeps homepage-specific bg-image; `Journal.css` shrinks to just bg-image + min-height for the editorial-scale hero (266 lines → 9 lines).
- **Design decisions made (executive):**
  - Card title font: Newsreader 500 (editorial feel for a journal context — different from `mgm-what-card`'s sans).
  - Card title hover color: `var(--teal)` for posts, `var(--orange-deep)` for Substack — orange marks the off-site/ongoing-series treatment.
  - Eyebrow color: `var(--teal-deep)` for posts, `var(--orange-deep)` for Substack.
  - Substack CTA: arrow that grows wider gap on hover (8px → 14px) — small interaction reward.
  - Section padding: standard `var(--section-pad-y)` (72px) on both subsections.
  - Substack section: `var(--paper-2)` surface to differentiate from the white-on-paper post grid.

---

### Step 4 — Map-Pages (Pattern A) ✅
- Converted `Map-Pages/photorealistic_blender_maps.html` using Pattern A (typography-only).
- **Decision:** chose Pattern A over Pattern B because the existing layout (hero with 3 anchor jumps + 3 case-study sections) reads cleanly with brand typography alone. No need for premium section restyling on a low-traffic detail page; can revisit if Maddy wants polish later.
- Same per-file edits as Adventure posts: header replacement, brand fonts, brand.css link.
- CSS sweep: 0 white-background substitutions (same inheritance pattern — paper now applies via global `body` rule).

---

### Step 3 — Adventure posts (Pattern A) ✅
- Applied Pattern A (typography-only conversion) to all 7 Adventure posts.
- **Method:** I converted Greece-Roadtrip.html by hand to validate the pattern in subfolder context, then ran a perl batch on the other 6 (arizona-trail, Sinks-Canyon-50k, Kerry-Way, Colorado-Trail, A-Teton-Winter, The-Cretan-Way). Faster than briefing an agent for what's mechanical search-and-replace.
- **Per file:**
  - Inline header markup (~60 lines) → 3-line placeholder + script tag with `data-path-root="../"`.
  - Google Fonts URL: Alata-only → all 4 brand fonts (Newsreader / Manrope / JetBrains Mono / Alata).
  - Added `<link rel="stylesheet" href="../brand.css" media="screen">`.
- **CSS white-bg sweep:** ran a regex over all 7 page-CSS files (`background(-color)?: #fff/#ffffff/white` → `var(--paper)`). Result: zero substitutions across all 7. Adventure posts never set body or section backgrounds explicitly — they were inheriting white from `nicepage.css`'s `.u-body { background-color: white }`. Now that brand.css overrides with `var(--paper)`, all 7 pages inherit paper automatically.
- **Footers** were already removed in Step 1.
- **Validation:** all 7 confirmed to have exactly 1 placeholder, 0 legacy headers, 1 brand.css link. Subfolder asset resolution verified via local server (`partials/header.html`, `mgm-header.js`, `brand.css` all 200 OK from subfolder context).
- **Line counts:** 1531 lines → 991 lines across 7 posts (~540 lines of duplicated nav markup eliminated).

---

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
