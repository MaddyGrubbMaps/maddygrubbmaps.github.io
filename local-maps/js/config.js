// config.js — fetch and parse the map's config.json from Backblaze B2
// Exports a single promise: configReady
// All other modules import and await this before doing anything map-related.
//
// Supported URL formats:
//   /?map=<uuid>        — direct UUID link (internal routing, map switches)
//   /?code=<CODE>       — shareable code link (e.g. sent to clients)

import { getLastUUID, getMapByCode, addMap, setLastCode } from './maps-store.js';

export const B2_BASE = 'https://f004.backblazeb2.com/file/local-maps';

// Returns { uuid, code } — code is non-null only when we arrived via ?code=
async function resolveUUID() {
  const params = new URLSearchParams(window.location.search);

  // ?map=uuid — highest priority (internal routing)
  const urlUUID = params.get('map');
  if (urlUUID) return { uuid: urlUUID, code: null };

  // ?code=CODE — resolve to UUID
  const urlCode = params.get('code');
  if (urlCode) {
    const code = urlCode.trim().toUpperCase();
    // Already in store? Skip the B2 lookup
    const existing = getMapByCode(code);
    if (existing) return { uuid: existing.uuid, code };
    // Fetch code → uuid mapping from B2
    const res = await fetch(`${B2_BASE}/codes/${code}.json`);
    if (!res.ok) {
      const err = new Error(`Map code "${code}" was not found. Check the code and try again.`);
      err.badCode = true;
      throw err;
    }
    const { uuid } = await res.json();
    return { uuid, code };
  }

  // Fall back to last-used map
  return { uuid: getLastUUID(), code: null };
}

async function fetchConfig(uuid) {
  const url = `${B2_BASE}/${uuid}/config.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load map config (${res.status})`);
  return res.json();
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Map config is invalid');
  const b = config.bboxWGS84;
  if (!Array.isArray(b) || b.length !== 4 || !b.every(n => typeof n === 'number' && isFinite(n))) {
    throw new Error('Map config is missing a valid bboxWGS84 — this map may have been uploaded incorrectly');
  }
}

// Resolved with the config object, or rejected with an error.
// err.noUUID = true  → no maps saved yet (show code entry screen)
// err.badCode = true → ?code= param was invalid (show code entry with error)
export const configReady = (async () => {
  const { uuid, code } = await resolveUUID();

  if (!uuid) {
    const err = new Error('No maps saved — enter a map code to get started');
    err.noUUID = true;
    throw err;
  }

  const config = await fetchConfig(uuid);
  validateConfig(config);

  // Arrived via ?code= — save to maps-store and clean up URL
  if (code) {
    addMap({
      code,
      uuid,
      title:        config.name         || code,
      thumbnailUrl: config.thumbnailUrl  || null,
    });
    setLastCode(code);
    // Replace ?code= with ?map= so the address bar URL is directly shareable too
    history.replaceState(null, '', `/?map=${uuid}`);
  }

  const ext = config.tileExt || '.png';
  config._tileBase = `${B2_BASE}/${uuid}/tiles/{z}/{x}/{y}${ext}`;
  return config;
})();
