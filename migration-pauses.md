# Pending Decisions — Skip-and-Resume Queue

Things I'd normally pause to ask Maddy about, but skipped per her instruction to keep moving. Each item is reversible. Review and approve/deny later.

Format: each pause is a single section with **What**, **Where**, **My choice**, **Why I skipped asking**, and **Status** (open / approved / denied).

---

## Open

### CNAME.txt deletion
- **What:** Deleted `CNAME.txt` (18 bytes) alongside the canonical `CNAME` (18 bytes, identical content: the custom domain).
- **Where:** Repo root.
- **My choice:** Delete it — GitHub Pages only reads the no-extension `CNAME` file; `CNAME.txt` was a leftover artifact (likely from a rename or initial drag-and-drop).
- **Why I skipped asking:** Trivially reversible (`echo maddygrubbmaps.com > CNAME.txt`) and almost certainly inert. Wanted to flag because anything touching domain config deserves visibility.
- **Status:** open

### Globe-projects thumbnail images are unoptimized
- **What:** `images/globe-projects/*.png` are HUGE — `mount-rainier-washington.png` is 22 MB, `grand-teton-wyoming.png` is 12 MB, others 2–7 MB each. Total folder ~85 MB.
- **Where:** `images/globe-projects/`.
- **My choice:** Commit them as-is for now (they're already in the working tree and referenced by the homepage globe section).
- **Why I skipped asking:** Optimization is its own task and would block the migration. The site is currently loading these full-size on the homepage either way.
- **Recommendation:** A separate cleanup pass converts each to WebP at ~1200×1200 max, target ~300–500 KB each. That's a ~99% size reduction with no visible quality loss at thumbnail size. Once optimized, original PNGs can be deleted (history bloat is permanent unless BFG-cleaned, but that's a downstream concern).
- **Status:** open

### Prior uncommitted homepage redesign work
- **What:** The working tree carries uncommitted edits from the previous session's homepage redesign — `index.html`, `index.css`, `brand.css` (entirely new file), `data/`, `images/divider.svg`, `images/globe-projects/`, `where.js`. There are also small uncommitted edits on `Contact.html`, `Custom-Cartography.html`, `Portfolio.html`, `Client-Types/Landowners-Ranches.html` (likely earlier brand.css `<link>` additions).
- **Where:** Repo root + several subfolders.
- **My choice:** Leave them out of my Step 1 commit. My migration commits will only touch files I modify in this session.
- **Why I skipped asking:** Each migration step's commit should be cleanly scoped to that step's changes. The prior work is the *foundation* the migration sits on, but it predates this session and warrants its own commit (or several) on its own terms.
- **Recommendation:** Maddy commits the prior homepage work as a "baseline: homepage brand redesign" commit before further migration work — or after, in any order. It will not block subsequent migration steps because the working tree retains those changes for rendering/testing.
- **Status:** open

---

## Resolved

_(none yet)_
