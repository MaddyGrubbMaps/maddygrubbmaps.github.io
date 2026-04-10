// config.js — fetch and parse the map's config.json from Backblaze B2
// Exports a single promise: configReady
// All other modules import and await this before doing anything map-related.

import { getLastUUID } from './maps-store.js';

export const B2_BASE = 'https://f004.backblazeb2.com/file/local-maps';

function getMapUUID() {
  // URL param is source of truth (direct links, switches via location.replace)
  const params = new URLSearchParams(window.location.search);
  const urlUUID = params.get('map');
  if (urlUUID) return urlUUID;
  // Fall back to last-used map from the store (home screen launch, etc.)
  return getLastUUID();
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
// err.noUUID = true when there are simply no maps saved yet (show code entry, not error screen).
export const configReady = (async () => {
  const uuid = getMapUUID();
  if (!uuid) {
    const err = new Error('No maps saved — enter a map code to get started');
    err.noUUID = true;
    throw err;
  }
  const config = await fetchConfig(uuid);
  validateConfig(config);
  const ext = config.tileExt || '.png';
  config._tileBase = `${B2_BASE}/${uuid}/tiles/{z}/{x}/{y}${ext}`;
  return config;
})();
