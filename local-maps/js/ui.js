// ui.js — DOM rendering, all screens and state updates
// This is the only module that touches the DOM directly.

import { configReady, B2_BASE } from './config.js';
import { getMaps, addMap, removeMap, setLastCode, getMapByCode } from './maps-store.js';
import { initMap, updateGPSDot, updateDotHeading, setMapBearing, getMap } from './map.js';
import { startGPS, onGPSState, getLastPosition } from './gps.js';
import { onHeading, getHeading, requestCompass, stopCompass } from './compass.js';
import { registerServiceWorker, enumerateTileUrls, estimateSizeMB, saveMapOffline, isMapCached, clearMapCache, getProgressCheckpoint, OPFS_SUPPORTED } from './offline.js';

// ─── Icon SVGs ────────────────────────────────────────────────────────────────
// Minimal Lucide-compatible SVGs for each UI control

const ICONS = {
  mapPin: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  mapPinLg: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  close: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  chevronRight: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  compass: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
  track: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 19 21 12 14 5 21 12 2"/></svg>`,
  pdf: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  offline: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
  alertCircle: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  info: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  download: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  compassRose: `<svg width="15" height="15" viewBox="0 0 14 14" fill="none"><polygon points="7,1.5 9.5,7 7,6 4.5,7" fill="#ffffff"/><polygon points="7,12.5 4.5,7 7,8 9.5,7" fill="rgba(255,255,255,0.28)"/><circle cx="7" cy="7" r="1.3" fill="#23435e"/></svg>`,
  check: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  locate: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>`,
  layers: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  trash:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
};

// ─── URL sanitization ─────────────────────────────────────────────────────────
// Validate that a URL from config is http(s) before using it in src/href.
function safeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? url : null;
  } catch { return null; }
}

// ─── Tablet state tracking ────────────────────────────────────────────────────
// Needed so updateOnlineStatus can re-render the tablet top bar with current GPS state.

let _lastGPSState    = 'idle';
let _lastGPSPosition = null;
let _onlineStatus    = navigator.onLine;

// ─── Onboarding ───────────────────────────────────────────────────────────────

const ONBOARDED_KEY = 'lm-onboarded';

function hasOnboarded() {
  try { return localStorage.getItem(ONBOARDED_KEY) === '1'; } catch { return false; }
}

function setOnboarded() {
  try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* private browsing */ }
}

// ─── Brevo subscription ───────────────────────────────────────────────────────

let _secrets = null;
async function getSecrets() {
  if (_secrets) return _secrets;
  const res = await fetch(`${B2_BASE}/secrets.json`);
  if (!res.ok) throw new Error(`Failed to load secrets (${res.status})`);
  _secrets = await res.json();
  return _secrets;
}

async function subscribeToBrevo(email) {
  try {
    const { brevoApiKey, brevoListId } = await getSecrets();
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify({
        email,
        listIds: [brevoListId],
        updateEnabled: true,
      }),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

function buildOnboarding(config, onEnable, onSkip) {
  const el = document.getElementById('onboarding');
  el.style.display = 'flex';
  showOnboardingScreen1(config, el, onEnable, onSkip);
}

function showOnboardingScreen1(config, el, onEnable, onSkip) {
  const hasDesc  = !!(config.description);
  const thumbSrc = safeUrl(config.thumbnailUrl);

  el.innerHTML = `
    <div class="onboarding-card">
      <div class="onboarding-thumb">
        ${thumbSrc
          ? `<img src="${thumbSrc}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:0.875rem;">`
          : ICONS.mapPinLg}
      </div>
      <h2 class="onboarding-title font-header" id="ob1-title"></h2>
      <p class="onboarding-byline">Shared by MaddyGrubbMaps</p>
      ${hasDesc ? `<p class="onboarding-map-desc" id="ob1-desc"></p>` : ''}
      <hr class="onboarding-divider" />
      <input class="onboarding-email" id="ob-email" type="email" placeholder="your@email.com" autocomplete="email" />
      <button class="onboarding-cta" id="ob-subscribe">Send me updates from MaddyGrubbMaps</button>
      <p class="onboarding-subscribe-feedback" id="ob-feedback"></p>
      <button class="onboarding-skip" id="ob-continue">Skip \u2192</button>
    </div>
  `;
  el.querySelector('#ob1-title').textContent = config.title;
  if (hasDesc) el.querySelector('#ob1-desc').textContent = config.description;

  document.getElementById('ob-subscribe').onclick = async () => {
      const emailEl   = document.getElementById('ob-email');
      const btn       = document.getElementById('ob-subscribe');
      const feedback  = document.getElementById('ob-feedback');
      const email     = emailEl.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        feedback.textContent = 'Please enter a valid email.';
        feedback.style.color = 'rgba(255,255,255,0.55)';
        return;
      }
      btn.textContent  = 'Subscribing\u2026';
      btn.disabled     = true;
      const ok = await subscribeToBrevo(email);
      if (ok) {
        feedback.textContent = '\u2713 Subscribed!';
        feedback.style.color = '#4ade80';
        btn.textContent      = 'Subscribed';
        setTimeout(() => showOnboardingScreen2(config, el, onEnable, onSkip), 800);
      } else {
        feedback.textContent = 'Something went wrong — try again.';
        feedback.style.color = 'rgba(255,255,255,0.55)';
        btn.textContent      = 'Subscribe';
        btn.disabled         = false;
      }
    };

  document.getElementById('ob-continue').onclick = () =>
    showOnboardingScreen2(config, el, onEnable, onSkip);
}

function showOnboardingScreen2(config, el, onEnable, onSkip) {
  const thumbSrc = safeUrl(config.thumbnailUrl);

  el.innerHTML = `
    <div class="onboarding-card">
      <div class="onboarding-thumb">
        ${thumbSrc
          ? `<img src="${thumbSrc}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:0.875rem;">`
          : ICONS.mapPinLg}
      </div>
      <h2 class="onboarding-title font-header" id="ob2-title"></h2>
      <p class="onboarding-byline">Shared by MaddyGrubbMaps</p>
      <div class="onboarding-info">
        <span style="flex-shrink:0;margin-top:1px">${ICONS.info}</span>
        <p>This map shows your live GPS location. Your position is never stored or shared.</p>
      </div>
      <button class="onboarding-cta" id="ob-enable">Enable Location Access</button>
      <button class="onboarding-skip" id="ob-skip">Skip \u2192</button>
    </div>
  `;
  el.querySelector('#ob2-title').textContent = config.title;

  document.getElementById('ob-enable').onclick = () => {
    el.style.display = 'none';
    setOnboarded();
    onEnable();
  };

  document.getElementById('ob-skip').onclick = () => {
    el.style.display = 'none';
    setOnboarded();
    onSkip();
  };
}

// ─── Sheet open / close ───────────────────────────────────────────────────────

function openSheet() {
  document.getElementById('sheet-overlay').classList.add('is-open');
}

function closeSheet() {
  document.getElementById('sheet-overlay').classList.remove('is-open');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// ─── Chrome builders ──────────────────────────────────────────────────────────

function buildTopBar(config) {
  const el = document.getElementById('top-bar');
  el.innerHTML = `
    <button class="title-pill" id="title-pill" aria-label="Map info">
      <img class="title-pill-logo" src="/assets/logo.webp" alt="Local Maps" />
      <span class="title-pill-sep"></span>
      <span class="title-pill-text font-header" id="title-pill-text"></span>
    </button>
    <div class="top-bar-right">
      <div class="status-pill">
        <span class="status-dot" id="status-dot"></span>
        <span class="status-label" id="status-label"></span>
      </div>
      <button class="maps-btn" id="maps-btn" aria-label="My maps">
        ${ICONS.layers}
        <span class="maps-btn-label">Maps</span>
      </button>
      <div id="tablet-top-right" class="tablet-top-right" style="display:none"></div>
    </div>
  `;
  el.hidden = false;
  document.getElementById('title-pill-text').textContent = config.title;
  document.getElementById('title-pill').addEventListener('click', openSheet);
  document.getElementById('maps-btn').addEventListener('click', () => openMapsSheet(config));
}

function buildSheet(config) {
  // fileUrl: new field name; fall back to pdfUrl for maps already on B2
  const fileUrl  = safeUrl(config.fileUrl || config.pdfUrl || null);
  const thumbSrc = safeUrl(config.thumbnailUrl);
  const fileExt  = fileUrl ? fileUrl.split('.').pop().toUpperCase() : null;

  const descSection = config.description ? `
    <div class="sheet-section">
      <p class="sheet-label">About this map</p>
      <p class="sheet-desc" id="sheet-desc"></p>
    </div>` : '';

  const downloadRow = fileUrl ? `
    <a class="sheet-link sheet-link--download" href="${fileUrl}" download target="_blank" rel="noopener"
       style="margin-bottom:0.5rem">
      <div class="sheet-link-icon">${ICONS.download}</div>
      <span class="sheet-link-text">Download map file <span class="sheet-link-ext" id="sheet-file-ext"></span></span>
      <span class="sheet-link-chevron">${ICONS.download}</span>
    </a>` : '';

  document.getElementById('sheet-overlay').innerHTML = `
    <div class="sheet-backdrop" id="sheet-backdrop"></div>
    <div class="sheet">
      <div class="sheet-handle-row">
        <div class="sheet-handle"></div>
      </div>
      <button class="sheet-close" id="sheet-close" aria-label="Close">
        ${ICONS.close}
      </button>
      <div class="sheet-body">
        <div class="sheet-header">
          <div class="sheet-thumbnail">
            ${thumbSrc
              ? `<img src="${thumbSrc}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:0.625rem;">`
              : ICONS.mapPinLg}
          </div>
          <div>
            <h2 class="sheet-title font-header" id="sheet-title"></h2>
            <p class="sheet-subtitle">Shared by MaddyGrubbMaps</p>
          </div>
        </div>
        <div class="sheet-dates">
          <div class="sheet-date-row">
            <span class="sheet-date-label">Originally shared</span>
            <span class="sheet-date-value">${formatDate(config.dateShared)}</span>
          </div>
          <div class="sheet-divider"></div>
          <div class="sheet-date-row">
            <span class="sheet-date-label">Last updated</span>
            <span class="sheet-date-value">${formatDate(config.dateUpdated)}</span>
          </div>
        </div>
        ${descSection}
        ${downloadRow}
        <a class="sheet-link" href="https://maddygrubbmaps.com" target="_blank" rel="noopener">
          <div class="sheet-link-icon">${ICONS.mapPinLg}</div>
          <span class="sheet-link-text">maddygrubbmaps.com</span>
          <span class="sheet-link-chevron">${ICONS.chevronRight}</span>
        </a>
      </div>
    </div>
  `;

  const overlay = document.getElementById('sheet-overlay');
  overlay.querySelector('#sheet-title').textContent = config.title;
  if (config.description) overlay.querySelector('#sheet-desc').textContent = config.description;
  if (fileExt) overlay.querySelector('#sheet-file-ext').textContent = fileExt;
  overlay.addEventListener('click', (e) => {
    if (e.target.id === 'sheet-backdrop' || e.target.id === 'sheet-close') closeSheet();
  });
}

// ─── Track Up ─────────────────────────────────────────────────────────────────

let _trackUpActive = false;

const COMPASS_SEEN_KEY = 'lm-compass-seen';

function showCompassDeniedFeedback() {
  const el = document.getElementById('status-banner');
  if (!el) return;
  el.innerHTML = `
    <span class="banner-icon">${ICONS.alertCircle}</span>
    <span class="banner-text">Compass access denied \u2014 enable in Settings, then reload</span>
  `;
  el.hidden = false;
  setTimeout(() => {
    el.hidden = true;
    updateStatusBanner(_lastGPSState);
  }, 4000);
}

async function enterTrackUp() {
  const needsIOSPermission =
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function';

  if (needsIOSPermission) {
    const alreadySeen = localStorage.getItem(COMPASS_SEEN_KEY) === '1';
    if (alreadySeen) {
      // Skip our explanation sheet — go straight to iOS system prompt
      const ok = await requestCompass();
      if (ok) activateTrackUp(); else showCompassDeniedFeedback();
    } else {
      openCompassPerm(
        async () => {
          try { localStorage.setItem(COMPASS_SEEN_KEY, '1'); } catch { /* private browsing */ }
          const ok = await requestCompass();
          if (ok) activateTrackUp(); else showCompassDeniedFeedback();
        },
        () => {}, // "Not Now"
      );
    }
  } else {
    const ok = await requestCompass();
    if (ok) activateTrackUp(); else showCompassDeniedFeedback();
  }
}

function activateTrackUp() {
  _trackUpActive = true;
  document.getElementById('btn-track')?.classList.add('right-btn--active');
  const h = getHeading();
  if (h != null) applyHeadingToMap(h);
}

function exitTrackUp() {
  _trackUpActive = false;
  stopCompass();
  setMapBearing(0);
  document.getElementById('btn-track')?.classList.remove('right-btn--active');
  const rose = document.getElementById('compass-rose');
  if (rose) rose.style.transform = '';
}

function applyHeadingToMap(heading) {
  setMapBearing(heading);
  const rose = document.getElementById('compass-rose');
  if (rose) rose.style.transform = `rotate(${heading}deg)`;
}

function buildRightControls(config) {
  document.getElementById('north-arrow').innerHTML = `
    <div class="right-btn-group">
      <button class="right-btn right-btn--dim" id="btn-track" aria-label="Track up" aria-disabled="true">
        ${ICONS.track}
      </button>
      <button class="right-btn right-btn--dim" id="btn-locate" aria-label="Pan to my location" aria-disabled="true">
        ${ICONS.locate}
      </button>
      <button class="right-btn" id="btn-offline" aria-label="Save for offline">
        ${ICONS.offline}
      </button>
    </div>
    <div class="compass-rose" id="compass-rose">
      ${ICONS.compassRose}
    </div>
    <button class="right-btn right-btn--zoom" id="btn-zoom-in"  aria-label="Zoom in">+</button>
    <button class="right-btn right-btn--zoom" id="btn-zoom-out" aria-label="Zoom out">−</button>
  `;
  document.getElementById('btn-track').addEventListener('click', () => {
    const active = !document.getElementById('btn-track').classList.contains('right-btn--dim');
    if (!active) {
      // GPS not running — retry, or show help if permanently denied
      if (_lastGPSState === 'denied') { showLocationHelp(); return; }
      startGPS();
      return;
    }
    if (_trackUpActive) exitTrackUp(); else enterTrackUp();
  });
  document.getElementById('btn-locate').addEventListener('click', () => {
    const active = !document.getElementById('btn-locate').classList.contains('right-btn--dim');
    if (!active) {
      if (_lastGPSState === 'denied') { showLocationHelp(); return; }
      startGPS();
      return;
    }
    const map = getMap(); if (!map) return;
    const pos = getLastPosition();
    if (pos) map.panTo([pos.lat, pos.lng]);
  });
  document.getElementById('btn-offline').addEventListener('click', () => openOfflineSheet(config));
  document.getElementById('btn-zoom-in').addEventListener('click',  () => { const map = getMap(); if (!map) return; map.zoomIn(); });
  document.getElementById('btn-zoom-out').addEventListener('click', () => { const map = getMap(); if (!map) return; map.zoomOut(); });
  isMapCached(config.uuid).then(saved => updateOfflineButtonState(saved));

  // Hide Track Up on non-touch devices — no compass hardware present
  if (navigator.maxTouchPoints === 0) {
    const btn = document.getElementById('btn-track');
    if (btn) btn.style.display = 'none';
  }
}

function buildBottomBar(config) {
  document.getElementById('bottom-bar').innerHTML = `
    <div class="coords-row">
      <span class="coords-text" id="coords-latlng">\u2014</span>
      <span class="coords-text" id="coords-elev"></span>
    </div>
  `;
  updateOnlineStatus(navigator.onLine);
}

// ─── State updaters ───────────────────────────────────────────────────────────

function updateOnlineStatus(online) {
  _onlineStatus = online;
  const dot   = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  if (dot && label) {
    dot.className = 'status-dot ' + (online ? 'status-dot--online' : 'status-dot--offline');
    label.textContent = online ? 'Online' : 'Offline';
  }
  updateTabletTopBar(_lastGPSState, _lastGPSPosition);
}

function formatLat(lat) {
  return `${Math.abs(lat).toFixed(3)}\u00b0${lat >= 0 ? 'N' : 'S'}`;
}

function formatLng(lng) {
  return `${Math.abs(lng).toFixed(3)}\u00b0${lng >= 0 ? 'E' : 'W'}`;
}

function formatElev(altM) {
  const ft = Math.round(altM * 3.28084);
  return `${ft.toLocaleString()} ft`;
}

function updateCoords(state, position) {
  const latLng = document.getElementById('coords-latlng');
  const elev   = document.getElementById('coords-elev');
  if (!latLng || !elev) return;

  if (state === 'active' && position) {
    latLng.textContent = `${formatLat(position.lat)}\u2002\u2002${formatLng(position.lng)}`;
    elev.textContent   = position.altitude != null ? formatElev(position.altitude) : '';
  } else if (state === 'acquiring') {
    latLng.textContent = '\u2014';
    elev.textContent   = '';
  } else {
    latLng.textContent = '\u2014';
    elev.textContent   = '';
  }
}

// Button enable/disable rules per GPS state:
// active:    compass=on, track=on
// off-map:   compass=on, track=off  (have GPS fix, just outside bounds)
// lost:      compass=on, track=off  (had fix, lost signal)
// acquiring/denied/idle: both off
function updateNavButtons(state) {
  const btnTrack  = document.getElementById('btn-track');
  const btnLocate = document.getElementById('btn-locate');
  if (!btnTrack) return;
  const trackOn  = state === 'active';
  const locateOn = state === 'active' || state === 'off-map';
  // Use a CSS class for visual dim — keeps buttons tappable so users can re-prompt permissions
  btnTrack.classList.toggle('right-btn--dim', !trackOn);
  btnTrack.setAttribute('aria-disabled', String(!trackOn));
  btnLocate.classList.toggle('right-btn--dim', !locateOn);
  btnLocate.setAttribute('aria-disabled', String(!locateOn));
  if (!trackOn && _trackUpActive) exitTrackUp();
}

const BANNER_STATES = {
  'acquiring':  { icon: 'alertCircle', text: 'Acquiring GPS\u2026' },
  'struggling': { icon: 'alertCircle', text: 'GPS is struggling \u2014 weak signal', action: 'Dismiss' },
  'lost':       { icon: 'alertCircle', text: 'GPS signal lost' },
  'denied':     { icon: 'alertCircle', text: 'Location access denied', action: 'How to fix \u2192' },
};

function updateStatusBanner(state) {
  const el = document.getElementById('status-banner');
  if (!el) return;
  const content = BANNER_STATES[state];
  if (!content) { el.hidden = true; return; }
  el.innerHTML = `
    <span class="banner-icon">${ICONS[content.icon]}</span>
    <span class="banner-text">${content.text}</span>
    ${content.action ? `<button class="banner-action" id="banner-action">${content.action}</button>` : ''}
  `;
  el.hidden = false;
  if (content.action) {
    document.getElementById('banner-action').onclick =
      state === 'struggling' ? () => { el.hidden = true; } : showLocationHelp;
  }
}

// ─── Tablet top bar right ─────────────────────────────────────────────────────

let _tabletCache = { state: null, lat: null, lng: null, online: null };

function updateTabletTopBar(state, position) {
  const el = document.getElementById('tablet-top-right');
  if (!el) return;

  // Skip rebuild if nothing visible has changed (GPS fires ~1Hz)
  const lat = position?.lat ?? null;
  const lng = position?.lng ?? null;
  if (state === _tabletCache.state && lat === _tabletCache.lat
      && lng === _tabletCache.lng && _onlineStatus === _tabletCache.online) return;
  _tabletCache = { state, lat, lng, online: _onlineStatus };

  const online = _onlineStatus;
  const onlineEl = `
    <div class="tablet-online-indicator">
      <div class="tablet-online-dot ${online ? 'tablet-online-dot--online' : 'tablet-online-dot--offline'}"></div>
      <span class="tablet-online-label">${online ? 'Online' : 'Offline'}</span>
    </div>`;

  if (state === 'active' && position) {
    const coords = `${formatLat(position.lat)}&ensp;&ensp;${formatLng(position.lng)}`;
    const elev   = position.altitude != null
      ? `<span class="tablet-elev">${Math.round(position.altitude * 3.28084).toLocaleString()} ft</span>` : '';
    el.innerHTML = `<span class="tablet-coords">${coords}</span>${elev}${onlineEl}`;

  } else if (state === 'acquiring') {
    el.innerHTML = `
      <div class="tablet-status-pill">${ICONS.alertCircle} Locating\u2026</div>
      ${onlineEl}`;

  } else if (state === 'struggling') {
    el.innerHTML = `
      <div class="tablet-status-pill">${ICONS.alertCircle} GPS weak signal</div>
      ${onlineEl}`;

  } else if (state === 'lost') {
    el.innerHTML = `
      <span class="tablet-coords" style="opacity:0.35">\u2014 \u2014 \u2014</span>
      <div class="tablet-status-pill">${ICONS.alertCircle} GPS signal lost</div>
      ${onlineEl}`;

  } else if (state === 'off-map' && position) {
    const coords = `${formatLat(position.lat)}&ensp;&ensp;${formatLng(position.lng)}`;
    const elev   = position.altitude != null
      ? `<span class="tablet-elev">${Math.round(position.altitude * 3.28084).toLocaleString()} ft</span>` : '';
    el.innerHTML = `
      <span class="tablet-coords">${coords}</span>${elev}
      <div class="tablet-status-pill">${ICONS.info} Outside map area</div>`;

  } else if (state === 'denied') {
    el.innerHTML = `
      <div class="tablet-status-pill">${ICONS.alertCircle} Location access denied</div>
      <button class="tablet-fix-btn" id="tablet-fix-btn">How to fix \u2192</button>`;
    document.getElementById('tablet-fix-btn')?.addEventListener('click', showLocationHelp);

  } else {
    el.innerHTML = onlineEl;
  }
}

// ─── Permission Sheets ────────────────────────────────────────────────────────

function openPermSheet({ iconHtml, title, subtitle, body, cta, onConfirm, dismissText, onDismiss }) {
  const el = document.getElementById('perm-overlay');
  el.innerHTML = `
    <div class="perm-backdrop" id="perm-backdrop"></div>
    <div class="perm-sheet" id="perm-sheet">
      <div class="offline-handle-row"><div class="offline-handle"></div></div>
      <div class="offline-body">
        <div class="offline-header">
          <div class="offline-icon-wrap">${iconHtml}</div>
          <div>
            <div class="offline-title font-header">${title}</div>
            <div class="offline-subtitle">${subtitle}</div>
          </div>
        </div>
        <p class="offline-desc">${body}</p>
        <button class="offline-cta" id="perm-confirm">${cta}</button>
        ${dismissText ? `<button class="offline-cancel" id="perm-dismiss">${dismissText}</button>` : ''}
      </div>
    </div>
  `;
  el.classList.add('is-open');
  requestAnimationFrame(() => document.getElementById('perm-sheet').classList.add('is-open'));
  document.getElementById('perm-backdrop').onclick = () => { closePermSheet(); onDismiss?.(); };
  document.getElementById('perm-confirm').onclick  = () => { closePermSheet(); onConfirm(); };
  if (dismissText) {
    document.getElementById('perm-dismiss').onclick = () => { closePermSheet(); onDismiss?.(); };
  }
}

function closePermSheet() {
  const el    = document.getElementById('perm-overlay');
  const sheet = document.getElementById('perm-sheet');
  if (sheet) sheet.classList.remove('is-open');
  el.classList.remove('is-open');
}

function openLocationPerm(onConfirm) {
  openPermSheet({
    iconHtml:    ICONS.mapPinLg,
    title:       'Allow Location Access',
    subtitle:    'To show your position on the map',
    body:        'Your location is only used to display your position on this map. It is never stored, shared, or tracked beyond this session.',
    cta:         'Allow Location Access',
    onConfirm,
    dismissText: null,
  });
}

function openCompassPerm(onConfirm, onDismiss) {
  openPermSheet({
    iconHtml:    ICONS.compass,
    title:       'Enable Compass',
    subtitle:    'Required for heading on iOS',
    body:        'Compass access lets the app show which direction you\u2019re facing and rotates the map to match your heading in Track Up mode.',
    cta:         'Enable Compass',
    onConfirm,
    dismissText: 'Not Now',
    onDismiss,
  });
}

function showLocationHelp() {
  const isIOS = 'standalone' in navigator;
  const body = isIOS
    ? 'Go to <b>Settings \u2192 Privacy &amp; Security \u2192 Location Services \u2192 Safari</b> and set to <b>While Using App</b>. Then reload this page.'
    : 'Tap the <b>lock icon</b> in your browser address bar, then <b>Site Settings \u2192 Location \u2192 Allow</b>. Then reload this page.';
  openPermSheet({
    iconHtml:    ICONS.alertCircle,
    title:       'Location Blocked',
    subtitle:    'Permission was denied by your browser',
    body,
    cta:         'Reload Page',
    onConfirm:   () => location.reload(),
    dismissText: 'Dismiss',
    onDismiss:   null,
  });
}

// ─── Install Guide ────────────────────────────────────────────────────────────

// Capture Android install prompt before it fires
let _installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _installPrompt = e;
});

const INSTALL_DISMISSED_KEY = 'lm-install-dismissed';

function shouldShowInstallGuide() {
  // Android: show if the native prompt is available and not already installed
  if (_installPrompt) return true;
  // iOS Safari: show if not already in standalone mode and not dismissed
  const isIOS        = 'standalone' in navigator;
  const isStandalone = window.navigator.standalone === true;
  const isDismissed  = localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
  return isIOS && !isStandalone && !isDismissed;
}

function closeInstallGuide() {
  const el    = document.getElementById('install-overlay');
  const sheet = document.getElementById('install-sheet');
  if (sheet) sheet.classList.remove('is-open');
  el.classList.remove('is-open');
}

function dismissInstallGuide() {
  try { localStorage.setItem(INSTALL_DISMISSED_KEY, '1'); } catch { /* private browsing */ }
  closeInstallGuide();
}

const SHARE_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;

function showInstallGuide() {
  if (!shouldShowInstallGuide()) return;

  const el = document.getElementById('install-overlay');

  // Android path — trigger native install prompt
  if (_installPrompt) {
    el.innerHTML = `
      <div class="install-backdrop" id="install-backdrop"></div>
      <div class="install-sheet" id="install-sheet">
        <div class="offline-handle-row"><div class="offline-handle"></div></div>
        <div class="offline-body">
          <div class="offline-header">
            <div class="offline-icon-wrap">${SHARE_ICON}</div>
            <div>
              <div class="offline-title font-header">Add to Home Screen</div>
              <div class="offline-subtitle">Use this map like an app</div>
            </div>
          </div>
          <p class="offline-desc">Install Local Maps on your home screen for quicker access and a full-screen experience.</p>
          <button class="offline-cta" id="install-confirm">Add to Home Screen</button>
          <button class="offline-cancel" id="install-dismiss">Not now</button>
        </div>
      </div>
    `;
    el.classList.add('is-open');
    requestAnimationFrame(() => document.getElementById('install-sheet')?.classList.add('is-open'));
    document.getElementById('install-backdrop').onclick = dismissInstallGuide;
    document.getElementById('install-dismiss').onclick  = dismissInstallGuide;
    document.getElementById('install-confirm').onclick  = async () => {
      closeInstallGuide();
      await _installPrompt.prompt();
      _installPrompt = null;
    };
    return;
  }

  // iOS Safari path — step-by-step instructions
  el.innerHTML = `
    <div class="install-backdrop" id="install-backdrop"></div>
    <div class="install-sheet" id="install-sheet">
      <div class="offline-handle-row"><div class="offline-handle"></div></div>
      <div class="offline-body">
        <div class="offline-header">
          <div class="offline-icon-wrap">${SHARE_ICON}</div>
          <div>
            <div class="offline-title font-header">Add to Home Screen</div>
            <div class="offline-subtitle">Use this map like an app</div>
          </div>
        </div>
        <div class="install-steps">
          <div class="install-step">
            <div class="install-step-num">1</div>
            <div class="install-step-text">Tap the <strong>Share</strong> button ${SHARE_ICON} at the bottom of Safari</div>
          </div>
          <div class="install-step">
            <div class="install-step-num">2</div>
            <div class="install-step-text">Scroll down and tap <strong>Add to Home Screen</strong></div>
          </div>
          <div class="install-step">
            <div class="install-step-num">3</div>
            <div class="install-step-text">Tap <strong>Add</strong> in the top right corner</div>
          </div>
        </div>
        <button class="offline-cancel" id="install-dismiss">Not now</button>
      </div>
    </div>
  `;
  el.classList.add('is-open');
  requestAnimationFrame(() => document.getElementById('install-sheet')?.classList.add('is-open'));
  document.getElementById('install-backdrop').onclick = dismissInstallGuide;
  document.getElementById('install-dismiss').onclick  = dismissInstallGuide;
}

// ─── Offline Sheet ────────────────────────────────────────────────────────────

let _offlineController = null;
let _offlineConfig     = null;
let _offlineTileUrls   = null;
let _mapIsSaved        = false;

function openOfflineSheet(config) {
  _offlineConfig   = config;
  _offlineTileUrls = enumerateTileUrls(config);

  const el = document.getElementById('offline-overlay');
  el.innerHTML = `
    <div class="offline-backdrop" id="offline-backdrop"></div>
    <div class="offline-sheet" id="offline-sheet"></div>
  `;
  document.getElementById('offline-backdrop').onclick = closeOfflineSheet;
  el.classList.add('is-open');
  // Next frame so CSS transition fires
  requestAnimationFrame(async () => {
    document.getElementById('offline-sheet').classList.add('is-open');
    if (_mapIsSaved) {
      renderOfflineDone();
    } else {
      const checkpoint = OPFS_SUPPORTED
        ? await getProgressCheckpoint(config.uuid)
        : null;
      if (checkpoint && checkpoint.done > 0 && checkpoint.done < checkpoint.total) {
        renderOfflineResume(checkpoint);
      } else {
        renderOfflineConfirm();
      }
    }
  });
}

function closeOfflineSheet() {
  if (_offlineController) {
    _offlineController.abort();
    _offlineController = null;
  }
  const el    = document.getElementById('offline-overlay');
  const sheet = document.getElementById('offline-sheet');
  if (sheet) sheet.classList.remove('is-open');
  el.classList.remove('is-open');
}

function renderOfflineResume(checkpoint) {
  const pct = Math.round(checkpoint.done / checkpoint.total * 100);
  document.getElementById('offline-sheet').innerHTML = `
    <div class="offline-handle-row"><div class="offline-handle"></div></div>
    <div class="offline-body">
      <div class="offline-title font-header" style="margin-bottom:0.5rem">Download Paused</div>
      <p class="offline-desc">${pct}% downloaded before the last session ended. Resume to finish saving this map.</p>
      <div class="progress-track" style="margin-bottom:1.5rem">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <button class="offline-cta" id="offline-resume">Resume Download</button>
      <button class="offline-cancel" id="offline-start-over">Start Over</button>
    </div>
  `;
  document.getElementById('offline-resume').onclick = () => _startOfflineDownloadNow();
  document.getElementById('offline-start-over').onclick = async () => {
    await clearMapCache(_offlineConfig.uuid);
    renderOfflineConfirm();
  };
}

function renderOfflineConfirm() {
  const sizeMB = estimateSizeMB(_offlineTileUrls.length, _offlineConfig);
  const minZ   = _offlineConfig.tileMinZoom ?? 13;
  const maxZ   = _offlineConfig.tileMaxZoom ?? 18;

  document.getElementById('offline-sheet').innerHTML = `
    <div class="offline-handle-row"><div class="offline-handle"></div></div>
    <div class="offline-body">
      <div class="offline-header">
        <div class="offline-icon-wrap">${ICONS.offline}</div>
        <div>
          <div class="offline-title font-header">Save Map for Offline</div>
          <div class="offline-subtitle">${_offlineConfig.title}</div>
        </div>
      </div>
      <div class="offline-info-row">
        <span class="offline-info-label">Estimated download</span>
        <span class="offline-info-value">~${sizeMB} MB</span>
      </div>
      <p class="offline-desc">Map tiles for zoom levels ${minZ}–${maxZ} will be saved on your device. Use this map without an internet connection.</p>
      <button class="offline-cta" id="offline-download">Download &amp; Save</button>
      <button class="offline-cancel" id="offline-cancel">Cancel</button>
    </div>
  `;
  document.getElementById('offline-download').onclick = startOfflineDownload;
  document.getElementById('offline-cancel').onclick   = closeOfflineSheet;
}

function renderOfflineDownloading(done, total) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  document.getElementById('offline-sheet').innerHTML = `
    <div class="offline-handle-row"><div class="offline-handle"></div></div>
    <div class="offline-body">
      <div class="offline-title font-header" style="margin-bottom:0.25rem">Saving Map\u2026</div>
      <div class="offline-subtitle" style="margin-bottom:1rem">${_offlineConfig.title} \u00b7 ~${estimateSizeMB(_offlineTileUrls.length, _offlineConfig)} MB</div>
      <div class="progress-track">
        <div class="progress-fill" id="progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="progress-labels">
        <span>Caching tiles\u2026</span>
        <span id="progress-count">${done.toLocaleString()} / ${total.toLocaleString()}</span>
      </div>
      <button class="offline-cancel" id="offline-cancel">Cancel</button>
    </div>
  `;
  document.getElementById('offline-cancel').onclick = closeOfflineSheet;
}

function updateOfflineProgress(done, total) {
  const fill  = document.getElementById('progress-fill');
  const count = document.getElementById('progress-count');
  if (!fill || !count) return;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  fill.style.width    = `${pct}%`;
  count.textContent   = `${done.toLocaleString()} / ${total.toLocaleString()}`;
}

function renderOfflineDone() {
  document.getElementById('offline-sheet').innerHTML = `
    <div class="offline-handle-row"><div class="offline-handle"></div></div>
    <div class="offline-body" style="text-align:center;padding-top:0.5rem">
      <div class="offline-done-icon">${ICONS.check}</div>
      <div class="offline-title font-header" style="margin-bottom:0.5rem">Map Saved!</div>
      <p class="offline-desc" style="margin-bottom:1.5rem">You can now use this map without an internet connection.</p>
      <button class="offline-cta" id="offline-done">Done</button>
    </div>
  `;
  document.getElementById('offline-done').onclick = () => {
    updateOfflineButtonState(true);
    const sheet = document.getElementById('offline-sheet');
    const afterClose = () => {
      sheet.removeEventListener('transitionend', afterClose);
      showInstallGuide();
    };
    sheet.addEventListener('transitionend', afterClose);
    closeOfflineSheet();
  };
}

function renderOfflineQuotaWarning(neededMB, availableMB) {
  document.getElementById('offline-sheet').innerHTML = `
    <div class="offline-handle-row"><div class="offline-handle"></div></div>
    <div class="offline-body">
      <div class="offline-title font-header" style="margin-bottom:0.5rem">Not Enough Space</div>
      <p class="offline-desc">This map needs ~${neededMB} MB but your device only has ~${availableMB} MB available. The download may fail or be incomplete.</p>
      <button class="offline-cta" id="offline-quota-continue">Download Anyway</button>
      <button class="offline-cancel" id="offline-quota-cancel">Cancel</button>
    </div>
  `;
  document.getElementById('offline-quota-continue').onclick = () => _startOfflineDownloadNow();
  document.getElementById('offline-quota-cancel').onclick   = closeOfflineSheet;
}

function renderOfflinePartialWarning(failedCount, total) {
  const pct = Math.round(failedCount / total * 100);
  document.getElementById('offline-sheet').innerHTML = `
    <div class="offline-handle-row"><div class="offline-handle"></div></div>
    <div class="offline-body" style="text-align:center;padding-top:0.5rem">
      <div class="offline-done-icon">${ICONS.alertCircle}</div>
      <div class="offline-title font-header" style="margin-bottom:0.5rem">Partially Saved</div>
      <p class="offline-desc" style="margin-bottom:1.5rem">${failedCount.toLocaleString()} of ${total.toLocaleString()} tiles (${pct}%) failed to download — likely a weak connection. The map may have gaps. Try saving again on a better connection.</p>
      <button class="offline-cta" id="offline-partial-done">Got it</button>
    </div>
  `;
  document.getElementById('offline-partial-done').onclick = () => {
    closeOfflineSheet();
    updateOfflineButtonState(true);
  };
}

async function startOfflineDownload() {
  // Storage quota check before committing to the download
  if (navigator.storage?.estimate) {
    try {
      const { quota, usage } = await navigator.storage.estimate();
      const available = quota - usage;
      const needed    = estimateSizeMB(_offlineTileUrls.length, _offlineConfig) * 1024 * 1024;
      if (available < needed) {
        renderOfflineQuotaWarning(
          Math.round(needed    / 1024 / 1024),
          Math.round(available / 1024 / 1024),
        );
        return;
      }
    } catch { /* estimate unavailable — proceed */ }
  }
  _startOfflineDownloadNow();
}

async function _startOfflineDownloadNow() {
  _offlineController  = new AbortController();
  const total         = _offlineTileUrls.length;
  renderOfflineDownloading(0, total);

  try {
    const { failedCount } = await saveMapOffline(
      _offlineConfig.uuid,
      _offlineTileUrls,
      (done, total) => updateOfflineProgress(done, total),
      _offlineController.signal,
    );
    if (!_offlineController?.signal.aborted) {
      _offlineController = null;
      if (failedCount > total * 0.05) {
        renderOfflinePartialWarning(failedCount, total);
      } else {
        renderOfflineDone();
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') closeOfflineSheet();
  }
}

function updateOfflineButtonState(saved) {
  _mapIsSaved = saved;
  const btn = document.getElementById('btn-offline');
  if (!btn) return;
  btn.classList.toggle('right-btn--saved', saved);
  btn.title = saved ? 'Map saved offline' : 'Save for offline';
}

// ─── Code resolution ──────────────────────────────────────────────────────────

// Normalise a user-typed code to uppercase alphanumeric + hyphen
function normaliseCode(raw) {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

// Fetch codes/<CODE>.json → { uuid }, then config.json → { title, thumbnailUrl }
async function resolveCode(rawCode) {
  const code = normaliseCode(rawCode);
  if (!code) throw new Error('empty');

  const codeRes = await fetch(`${B2_BASE}/codes/${code}.json`);
  if (!codeRes.ok) throw new Error('not_found');
  const { uuid } = await codeRes.json();

  const cfgRes = await fetch(`${B2_BASE}/${uuid}/config.json`);
  if (!cfgRes.ok) throw new Error('config_failed');
  const cfg = await cfgRes.json();

  return { code, uuid, title: cfg.title || 'Untitled Map', thumbnailUrl: cfg.thumbnailUrl || null };
}

// ─── Code Entry Screen ────────────────────────────────────────────────────────

// Renders a code entry form into `container`.
// opts.isFullScreen — true when replacing the whole app (first launch)
// opts.onBack       — called when user taps Back (add-map flow)
function renderCodeEntry(container, opts = {}) {
  container.innerHTML = `
    <div class="${opts.isFullScreen ? 'code-entry-screen' : 'offline-body'}" style="${opts.isFullScreen ? '' : 'padding-top:0.25rem'}">
      <div class="code-entry-card" style="${opts.isFullScreen ? '' : 'max-width:none;padding:0 0.25rem'}">
        ${opts.isFullScreen ? `<img class="code-entry-logo" src="/assets/logo.webp" alt="Local Maps" />` : ''}
        <h2 class="code-entry-heading font-header">${opts.isFullScreen ? 'Enter your map code' : 'Add a map'}</h2>
        <p class="code-entry-hint">Your code was provided by MaddyGrubbMaps</p>
        <input class="code-entry-input" id="ce-input" type="text"
               placeholder="e.g. PARVIN-4K2"
               autocomplete="off" autocorrect="off" autocapitalize="characters"
               spellcheck="false" maxlength="20" />
        <p class="code-entry-error" id="ce-error"></p>
        <button class="onboarding-cta" id="ce-submit" style="width:100%;margin-top:0.25rem">Open Map</button>
        ${opts.onBack ? `<button class="code-entry-back" id="ce-back">\u2190 Back</button>` : ''}
      </div>
    </div>
  `;

  const input   = container.querySelector('#ce-input');
  const errorEl = container.querySelector('#ce-error');
  const submit  = container.querySelector('#ce-submit');

  // Auto-uppercase and filter as user types
  input.addEventListener('input', () => {
    const cursor = input.selectionStart;
    input.value = normaliseCode(input.value);
    input.setSelectionRange(cursor, cursor);
    errorEl.textContent = '';
  });

  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit.click(); });

  submit.addEventListener('click', async () => {
    const raw = input.value.trim();
    if (!raw) return;
    submit.disabled   = true;
    submit.textContent = 'Checking\u2026';
    errorEl.textContent = '';

    try {
      const mapData = await resolveCode(raw);
      addMap(mapData);
      window.location.replace(`/?map=${mapData.uuid}`);
    } catch (err) {
      errorEl.textContent = err.message === 'not_found'
        ? 'Code not found \u2014 check with your guide'
        : 'Something went wrong \u2014 check your connection';
      submit.disabled   = false;
      submit.textContent = 'Open Map';
    }
  });

  if (opts.onBack) {
    container.querySelector('#ce-back').addEventListener('click', opts.onBack);
  }

  // Auto-focus on next frame (avoids keyboard flash on iOS during sheet animation)
  requestAnimationFrame(() => input.focus());
}

// Full-screen code entry — shown when no maps are saved at all
function showFullScreenCodeEntry() {
  renderCodeEntry(document.getElementById('app'), { isFullScreen: true });
}

// ─── Maps Sheet ───────────────────────────────────────────────────────────────

function closeMapsSheet() {
  const overlay = document.getElementById('maps-overlay');
  const sheet   = document.getElementById('maps-sheet');
  if (sheet)   sheet.classList.remove('is-open');
  overlay.classList.remove('is-open');
}

function attachSwipeDelete(rowEl, code, onDelete) {
  const inner    = rowEl.querySelector('.map-row-inner');
  const REVEAL   = 80;   // px inner slides left to expose delete button
  const TRIGGER  = 55;   // px at which we commit to showing delete
  let startX = 0, startY = 0, swiping = false, revealed = false;

  rowEl.addEventListener('touchstart', e => {
    startX  = e.touches[0].clientX;
    startY  = e.touches[0].clientY;
    swiping = false;
    inner.style.transition = 'none';
  }, { passive: true });

  rowEl.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!swiping && Math.abs(dy) > Math.abs(dx)) return;
    swiping = true;
    if (dx < 0) inner.style.transform = `translateX(${Math.max(dx, -REVEAL)}px)`;
    else if (revealed) inner.style.transform = `translateX(${Math.min(0, -REVEAL + dx)}px)`;
  }, { passive: true });

  rowEl.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    inner.style.transition = 'transform 0.2s ease';
    if (dx < -TRIGGER) { inner.style.transform = `translateX(-${REVEAL}px)`; revealed = true; }
    else               { inner.style.transform = 'translateX(0)'; revealed = false; }
  });

  rowEl.querySelector('.map-row-delete').addEventListener('click', onDelete);
}

async function openMapsSheet(config) {
  const overlay = document.getElementById('maps-overlay');
  const count   = getMaps().length;
  const countLabel = count === 1 ? '1 map on this device' : `${count} maps on this device`;

  overlay.innerHTML = `
    <div class="maps-backdrop" id="maps-backdrop"></div>
    <div class="maps-sheet" id="maps-sheet">
      <div class="offline-handle-row"><div class="offline-handle"></div></div>
      <div class="maps-header">
        <div>
          <div class="maps-header-title font-header">My Maps</div>
          <div class="maps-header-count"></div>
        </div>
        <button class="maps-close-btn" id="maps-close-btn" aria-label="Close">${ICONS.close}</button>
      </div>
      <div class="maps-list" id="maps-list"></div>
      <div class="maps-footer">
        <button class="maps-add-btn" id="maps-add-btn">+ Add map</button>
      </div>
    </div>
  `;

  // XSS-safe count
  overlay.querySelector('.maps-header-count').textContent = countLabel;

  overlay.classList.add('is-open');
  requestAnimationFrame(() => document.getElementById('maps-sheet').classList.add('is-open'));

  document.getElementById('maps-backdrop').addEventListener('click', closeMapsSheet);
  document.getElementById('maps-close-btn').addEventListener('click', closeMapsSheet);
  document.getElementById('maps-add-btn').addEventListener('click', () => {
    renderCodeEntry(document.getElementById('maps-sheet'), {
      onBack: () => openMapsSheet(config),
    });
  });

  _renderMapsList(config);
}

function _renderMapsList(config) {
  const listEl     = document.getElementById('maps-list');
  if (!listEl) return;
  const maps       = getMaps();
  const activeCode = maps.find(m => m.uuid === config.uuid)?.code ?? null;

  if (maps.length === 0) {
    listEl.innerHTML = `<p class="maps-empty">No maps saved yet.</p>`;
    return;
  }

  listEl.innerHTML = maps.map(m => {
    const isActive  = m.code === activeCode;
    const thumbSrc  = safeUrl(m.thumbnailUrl);
    return `
      <div class="map-row${isActive ? ' map-row--active' : ''}" data-code="${m.code}">
        <div class="map-row-inner">
          <div class="map-row-thumb">
            <img src="${thumbSrc || '/assets/map-thumb-default.png'}" alt="">
          </div>
          <div class="map-row-info">
            <div class="map-row-title-row">
              <div class="map-row-title"></div>
              ${isActive ? `<span class="map-badge map-badge--open">Open</span>` : ''}
            </div>
            <div class="map-row-subtitle"></div>
          </div>
          <div class="map-row-actions">
            <button class="map-row-action map-row-action--cache" data-code="${m.code}" aria-label="Save offline">
              ${ICONS.offline}
              <span>Cache</span>
            </button>
            <button class="map-row-action map-row-action--delete" aria-label="Remove map">
              ${ICONS.trash}
              <span>Del</span>
            </button>
          </div>
        </div>
      </div>`;
  }).join('');

  // XSS-safe text content
  maps.forEach(m => {
    const row = listEl.querySelector(`.map-row[data-code="${m.code}"]`);
    if (!row) return;
    row.querySelector('.map-row-title').textContent    = m.title;
    row.querySelector('.map-row-subtitle').textContent = m.code;

    // Tap row body to switch map (skip if already active)
    if (m.code !== activeCode) {
      row.querySelector('.map-row-inner').addEventListener('click', e => {
        if (e.target.closest('.map-row-actions')) return; // don't switch on button click
        setLastCode(m.code);
        window.location.replace(`/?map=${m.uuid}`);
      });
    }

    // Delete button
    row.querySelector('.map-row-action--delete').addEventListener('click', async () => {
      await clearMapCache(m.uuid);
      removeMap(m.code);
      if (m.code === activeCode) {
        const remaining = getMaps();
        if (remaining.length > 0) {
          window.location.replace(`/?map=${remaining[0].uuid}`);
        } else {
          closeMapsSheet();
          showFullScreenCodeEntry();
        }
      } else {
        _renderMapsList(config);
      }
    });
  });

  // Async: update cache button state per row
  maps.forEach(async m => {
    const cached = await isMapCached(m.uuid);
    const btn    = listEl.querySelector(`.map-row-action--cache[data-code="${m.code}"]`);
    if (!btn) return;
    if (cached) {
      btn.classList.add('is-cached');
      btn.querySelector('span').textContent = 'Cached';
    }
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  await registerServiceWorker();

  let config;
  try {
    config = await configReady;
  } catch (err) {
    if (err.noUUID) {
      showFullScreenCodeEntry();
      return;
    }
    const appEl = document.getElementById('app');
    appEl.innerHTML = `
      <div style="
        position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
        background:#1f6460;padding:2rem;text-align:center;
        font-family:'DM Mono',monospace;color:rgba(255,255,255,0.7);
      ">
        <div>
          <div style="font-size:2rem;margin-bottom:1rem;">📍</div>
          <div style="color:#fff;margin-bottom:0.5rem;">Map not found</div>
          <div class="boot-err-msg" style="font-size:0.8rem;"></div>
        </div>
      </div>`;
    appEl.querySelector('.boot-err-msg').textContent = err.message;
    return;
  }

  // Keep URL accurate (e.g. when launched from store without a ?map= param)
  if (!new URLSearchParams(window.location.search).get('map')) {
    window.history.replaceState(null, '', `/?map=${config.uuid}`);
  }

  // Register this map in the store if it has a code (handles the case where
  // the user accesses via a fresh share link that includes the code as a param)
  const codeParam = new URLSearchParams(window.location.search).get('code');
  if (codeParam && !getMapByCode(normaliseCode(codeParam))) {
    addMap({ code: normaliseCode(codeParam), uuid: config.uuid,
             title: config.title, thumbnailUrl: config.thumbnailUrl || null });
  }

  // Build chrome before map init so it appears immediately
  buildTopBar(config);
  buildRightControls(config);
  buildBottomBar(config);
  buildSheet(config);

  // Init map
  await initMap();

  // Online/offline status
  window.addEventListener('online',  () => updateOnlineStatus(true));
  window.addEventListener('offline', () => updateOnlineStatus(false));

  // GPS state → dot + chrome
  onGPSState((state, position) => {
    _lastGPSState    = state;
    _lastGPSPosition = position;
    updateGPSDot(state, position);
    updateCoords(state, position);
    updateNavButtons(state);
    updateStatusBanner(state);
    updateTabletTopBar(state, position);
  });

  // Compass heading → dot heading cone + map rotation when Track Up active
  onHeading((heading) => {
    updateDotHeading(heading, getLastPosition());
    if (_trackUpActive) applyHeadingToMap(heading);
  });

  if (hasOnboarded()) {
    await startGPS();
  } else {
    buildOnboarding(
      config,
      () => startGPS(),                           // "Enable Location Access"
      () => {},                                   // "Skip" — map stays up, no GPS
    );
  }
}

boot();
