// maps-store.js — persists the list of maps saved on this device
// All reads/writes are synchronous localStorage operations.

const STORE_KEY = 'lm-maps-v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || { maps: [], lastCode: null };
  } catch { return { maps: [], lastCode: null }; }
}

function save(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* private browsing */ }
}

export function getMaps() {
  return load().maps;
}

export function getLastCode() {
  return load().lastCode;
}

// Returns the UUID for the last-used map, or null if none saved.
export function getLastUUID() {
  const { lastCode, maps } = load();
  return maps.find(m => m.code === lastCode)?.uuid ?? null;
}

// Add or update a map entry. Moves it to top of list and sets it as last-used.
export function addMap({ code, uuid, title, thumbnailUrl }) {
  const store = load();
  const idx = store.maps.findIndex(m => m.code === code);
  const entry = { code, uuid, title, thumbnailUrl, addedAt: new Date().toISOString() };
  if (idx >= 0) store.maps[idx] = { ...store.maps[idx], ...entry };
  else store.maps.unshift(entry);
  store.lastCode = code;
  save(store);
}

// Remove a map entry. Moves lastCode to the next available map.
export function removeMap(code) {
  const store = load();
  store.maps = store.maps.filter(m => m.code !== code);
  if (store.lastCode === code) store.lastCode = store.maps[0]?.code ?? null;
  save(store);
}

export function setLastCode(code) {
  const store = load();
  store.lastCode = code;
  save(store);
}

export function getMapByCode(code) {
  return load().maps.find(m => m.code === code) ?? null;
}
