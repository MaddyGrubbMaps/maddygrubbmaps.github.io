// offline.js — Service Worker registration and offline tile caching
// Tiles are written to OPFS (Origin Private File System) for durable storage.
// Cache Storage is used as a legacy fallback for any pre-OPFS saves.

const SW_PATH = '/sw.js';

export const OPFS_SUPPORTED = !!(
  typeof navigator !== 'undefined' &&
  navigator.storage &&
  typeof navigator.storage.getDirectory === 'function'
);

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register(SW_PATH);
    // Request persistent storage — meaningful on Android; silently ignored on iOS
    if (navigator.storage?.persist) navigator.storage.persist();
  } catch (err) {
    console.warn('Service worker registration failed:', err);
  }
}

// ─── Tile enumeration ─────────────────────────────────────────────────────────

function lngToTileX(lng, z) {
  return Math.floor((lng + 180) / 360 * Math.pow(2, z));
}

function latToTileY(lat, z) {
  const rad = lat * Math.PI / 180;
  return Math.floor(
    (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, z)
  );
}

// Returns all tile URLs for the map's bbox across its native zoom range
export function enumerateTileUrls(config) {
  const [minLng, minLat, maxLng, maxLat] = config.bboxWGS84;
  const minZoom = config.tileMinZoom ?? 13;
  const maxZoom = config.tileMaxZoom ?? 18;
  const baseUrl = config._tileBase;
  const urls = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const xMin = lngToTileX(minLng, z);
    const xMax = lngToTileX(maxLng, z);
    const yMin = latToTileY(maxLat, z); // higher lat = smaller tile y
    const yMax = latToTileY(minLat, z);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        urls.push(baseUrl.replace('{z}', z).replace('{x}', x).replace('{y}', y));
      }
    }
  }

  return urls;
}

// Returns estimated download size in MB.
// Uses exact tilesTotalBytes from config.json if available (set at upload time);
// falls back to 22 KB/tile average for older maps that predate this field.
export function estimateSizeMB(tileCount, config) {
  if (config?.tilesTotalBytes) return Math.round(config.tilesTotalBytes / 1024 / 1024);
  return Math.round(tileCount * 22 / 1024);
}

// ─── OPFS helpers ─────────────────────────────────────────────────────────────

const PROGRESS_FILE = '_progress.json';

// Extract z, x, y, ext from a tile URL
function parseTileCoords(url) {
  const m = url.match(/\/tiles\/(\d+)\/(\d+)\/(\d+)(\.\w+)?/);
  if (!m) return null;
  return { z: m[1], x: m[2], y: m[3], ext: m[4] || '.png' };
}

async function getOPFSMapDir(uuid, create = false) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(`map-${uuid}`, { create });
}

async function writeProgressCheckpoint(uuid, done, total) {
  try {
    const dir = await getOPFSMapDir(uuid, true);
    const fh  = await dir.getFileHandle(PROGRESS_FILE, { create: true });
    const w   = await fh.createWritable();
    await w.write(JSON.stringify({ done, total, ts: Date.now() }));
    await w.close();
  } catch { /* non-fatal */ }
}

async function clearProgressCheckpoint(uuid) {
  try {
    const dir = await getOPFSMapDir(uuid, false);
    await dir.removeEntry(PROGRESS_FILE);
  } catch { /* already gone */ }
}

export async function getProgressCheckpoint(uuid) {
  if (!OPFS_SUPPORTED) return null;
  try {
    const dir  = await getOPFSMapDir(uuid, false);
    const fh   = await dir.getFileHandle(PROGRESS_FILE);
    const file = await fh.getFile();
    return JSON.parse(await file.text());
  } catch { return null; }
}

async function writeOPFSTile(uuid, z, x, y, ext, buffer) {
  const dir  = await getOPFSMapDir(uuid, true);
  const fh   = await dir.getFileHandle(`${z}-${x}-${y}${ext}`, { create: true });
  const writable = await fh.createWritable();
  await writable.write(buffer);
  await writable.close();
}

// ─── Cache state ──────────────────────────────────────────────────────────────

export async function isMapCached(uuid) {
  // OPFS check — preferred, more durable than Cache Storage
  if (OPFS_SUPPORTED) {
    try {
      const dir = await getOPFSMapDir(uuid, false);
      const iter = dir.values();
      const first = await iter.next();
      return !first.done;
    } catch { /* directory doesn't exist — not cached */ }
  }

  // Cache Storage fallback (legacy saves from before OPFS migration)
  try {
    const keys = await caches.keys();
    if (!keys.includes(`map-${uuid}`)) return false;
    const cache   = await caches.open(`map-${uuid}`);
    const entries = await cache.keys();
    return entries.length > 0;
  } catch {
    return false;
  }
}

export async function clearMapCache(uuid) {
  // Clear OPFS
  if (OPFS_SUPPORTED) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(`map-${uuid}`, { recursive: true });
    } catch { /* already gone */ }
  }
  // Clear Cache Storage
  try { await caches.delete(`map-${uuid}`); } catch { /* ignore */ }
}

// ─── Download ─────────────────────────────────────────────────────────────────

// Downloads and stores all tiles for the map in OPFS.
//   uuid:       config.uuid
//   urls:       from enumerateTileUrls(config)
//   onProgress: fn(done, total) — called after each tile
//   signal:     AbortSignal from AbortController (optional)
export async function saveMapOffline(uuid, urls, onProgress, signal) {
  const total   = urls.length;
  const useOPFS = OPFS_SUPPORTED;

  // Build set of already-downloaded tiles so a resume skips them
  let existingTiles = new Set();
  if (useOPFS) {
    try {
      const dir = await getOPFSMapDir(uuid, false);
      for await (const [name] of dir.entries()) {
        if (name !== PROGRESS_FILE) existingTiles.add(name);
      }
    } catch { /* dir doesn't exist yet — fresh download */ }
  }

  let done = existingTiles.size;
  if (done > 0) onProgress(done, total); // seed progress bar for resumed downloads

  // Legacy Cache Storage path for browsers without OPFS (no resume support)
  const cache = useOPFS ? null : await caches.open(`map-${uuid}`);

  // Only queue tiles we don't have yet
  const queue = useOPFS
    ? urls.filter(url => {
        const c = parseTileCoords(url);
        return !c || !existingTiles.has(`${c.z}-${c.x}-${c.y}${c.ext}`);
      })
    : [...urls];

  let failedCount   = 0;
  let checkpointCtr = 0;
  const CONCURRENCY = 6;

  await writeProgressCheckpoint(uuid, done, total);

  const worker = async () => {
    while (queue.length > 0) {
      if (signal?.aborted) return;
      const url = queue.shift();
      try {
        const res = await fetch(url, { mode: 'cors', signal });
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          const type   = res.headers.get('content-type') || 'image/png';

          if (useOPFS) {
            const coords = parseTileCoords(url);
            if (coords) {
              await writeOPFSTile(uuid, coords.z, coords.x, coords.y, coords.ext, buffer);
            }
          } else {
            await cache.put(url, new Response(buffer, {
              status: 200,
              headers: { 'Content-Type': type },
            }));
          }
        } else {
          failedCount++;
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
        failedCount++;
      }
      done++;
      onProgress(done, total);
      if (++checkpointCtr % 50 === 0) {
        writeProgressCheckpoint(uuid, done, total); // fire-and-forget
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await clearProgressCheckpoint(uuid);
  return { failedCount };
}
