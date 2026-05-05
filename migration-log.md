# Migration Log

## ✅ Foundation migration complete (2026-05-04)

The site is fully on the brand system: shared header, brand fonts, brand.css, paper background, mgm- pattern library. 18 pages migrated across 10 commits. ~4,500 lines net deleted. The contact form is wired to a Cloudflare Worker awaiting Maddy's deployment of Brevo credentials.

**Foundation steps shipped:** 1–10 plus the closure pass (Step 11 logged as deferred).

**Polish work logged in `migration-pauses.md`:**
- Pattern C (Portfolio gallery rebuild)
- Pattern D (Custom-Cartography accordion + carousel rebuild)
- Pattern B (Client-Types full section restyle, Adventures editorial pass if wanted)
- Step 11 final cleanup (drop Nicepage runtime once polish is done)
- Globe-projects PNG optimization (~85 MB → ~5 MB)
- CNAME.txt deletion verification
- Prior uncommitted homepage work (bundled into Step 2 commit)

**Maddy's next action:** follow `worker/README.md` to deploy the Brevo Worker, then update `BREVO_WORKER_URL` in `Contact.html`.

---

## Step-by-step log


Running ledger of design decisions, token additions, pattern changes, and notable conversions during the Nicepage → Brand migration. Each entry should make the *why* legible without re-reading the diff.

---

## 2026-05-04

### Step 11 — Closure (Nicepage runtime drop deferred) ✅
- Smoke-tested all 18 pages via `python3 -m http.server` + curl: every page returns 200, has the placeholder header, brand.css link, and mgm-header.js script tag.
- Verified `partials/header.html`, `mgm-header.js`, `brand.css` all reachable from both root + subfolder contexts.
- Updated `sitemap.xml` lastmod to today (2026-05-04) for all 11 page entries.
- **Did not drop `nicepage.css` / `nicepage.js`** — see `migration-pauses.md`. Still load-bearing for Portfolio gallery, Custom-Cartography accordion + carousel, and most pages' `u-*` section markup. The runtime drop should happen as the absolute last cleanup once Pattern B/C/D polish is complete.

---

### Step 10 — Contact form rewrite ✅
- Stripped all reCAPTCHA scripts (~200 lines), Nicepage form processor markup, and the now-unused Contact.css.
- New form is 4 fields (name, email, message, hidden honeypot) + status region with `aria-live="polite"`.
- Submit handler: client-side validate, disable button + show "Sending…", `fetch()` JSON to the Brevo Worker, surface success or error message in the status region.
- **Worker URL placeholder:** Maddy edits one line in `Contact.html` (line ~126, search `BREVO_WORKER_URL`) after deploying the Worker per `worker/README.md`.
- **Brand styling** (added to brand.css):
  - Form on paper bg, max-width 560px, vertically stacked rows.
  - Labels: mono uppercase 11px (matches eyebrow scale).
  - Inputs: hairline `--rule` border, focus → `--teal` border + faint teal tint.
  - Submit: existing `.mgm-btn` (orange pill).
  - Status: success → teal-tinted block w/ teal-deep text + teal left rule; error → red-tinted block w/ red-deep text + red left rule.
  - Honeypot: absolutely positioned off-screen (`left: -10000px`) so screen readers reading sequentially can pick it up but real users never see it.
  - "Prefer email or phone?" direct contact links below form, mono eyebrow + body sans links with teal underline on hover.
- **Line accounting:** Contact.html 384 → 159 lines. Contact.css 87 → deleted.

---

### Step 9 — Brevo Worker (code written, awaiting deployment) ✅
- Wrote a Cloudflare Worker (`worker/contact.js`) that receives POST requests from the contact form, validates name/email/message, runs an optional Turnstile spam check, and relays the message via Brevo's transactional email API (`POST /v3/smtp/email`).
- **Validation:** required fields, email format, max-length, honeypot (`website` field — bots fill it, real users don't see it).
- **Security:** API key never in client-side code; lives only as a Worker secret. CORS scoped to `https://maddygrubbmaps.com` (override `ALLOWED_ORIGIN` for dev/staging).
- **Error UX:** Worker returns `{ok:true}` or `{ok:false, error:...}` with appropriate HTTP status. The contact form will surface these messages via an `aria-live` region.
- **Email body:** branded HTML (paper bg, navy headings, teal accent rule).
- **Files added:**
  - `worker/contact.js` — the Worker code.
  - `worker/wrangler.toml` — config (name, compat date, allowed origin).
  - `worker/README.md` — step-by-step setup guide for Maddy: Brevo signup → verified sender → API key → `wrangler secret put` → `wrangler deploy`.
- **Action required from Maddy:** run the steps in `worker/README.md`. Until then, the contact form (rewritten in Step 10) won't actually deliver — but the Worker URL is configurable via a single line in `Contact.html`.

---

### Step 8 — Custom-Cartography (Pattern A only) ✅
- Replaced inline header with shared placeholder (`data-path-root=""`).
- brand.css link + brand fonts URL already in place from the Step 2 homepage baseline.
- **Pattern B + D (widget rebuilds) deferred** — see `migration-pauses.md`. The 3-card grid, FAQ accordion (13 items), and testimonial carousel still use Nicepage's widgets driven by `nicepage.js`. Functional, just not on the brand system yet.

---

### Step 7 — Portfolio (Pattern A only) ✅
- Replaced inline header with shared placeholder (`data-path-root=""`).
- brand.css link + brand fonts URL were already in place from the homepage baseline commit (Step 2).
- **Pattern C (gallery rebuild) deferred** — see `migration-pauses.md`. The 4 gallery sections still use Nicepage's `u-gallery` lightbox driven by `nicepage.js`. Functional, just not on the brand system yet.

---

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
