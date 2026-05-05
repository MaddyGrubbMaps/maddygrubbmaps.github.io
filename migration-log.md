# Migration Log

Running ledger of design decisions, token additions, pattern changes, and notable conversions during the Nicepage → Brand migration. Each entry should make the *why* legible without re-reading the diff.

---

## 2026-05-04

### Step 1 — cleanup pass ✅
- Created this log + `migration-pauses.md` for the skip-and-resume queue.
- Explore agent audit: zero inbound references to deletion list across the site. Sitemap/robots/llms all clean.
- **Deleted files:** `Landing-Page.html`, `Landing-Page.css`, `Blog-Template.css`, `Post-Template.css`, `pinegrow.json`, `projectdb.pgml`, `CNAME.txt` (duplicate of `CNAME`).
- **Deleted folders:** `blog/`, `_pgbackup/`, `_pginfo/`.
- **Removed footers** (`<footer id="sec-71e6">`) from 10 pages: `Journal.html`, all 7 Adventure posts, `Map-Pages/photorealistic_blender_maps.html`, `Client-Types/Landowners-Ranches.html`. Other Client-Types/top-level pages had no footer.
- Sitemap/robots/llms left untouched — no edits needed.
- One executive decision logged in `migration-pauses.md`: deletion of `CNAME.txt`.
