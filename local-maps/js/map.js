// map.js — Leaflet map init, tile layer, and GPS dot rendering

import { configReady } from './config.js';

let map          = null;
let dotMarker    = null;   // L.marker — GPS dot + heading cone
let accuracyRing = null;   // L.circle — accuracy radius
let pulseMarker  = null;   // L.marker — acquiring pulse animation

// ─── Map init ─────────────────────────────────────────────────────────────────

export async function initMap() {
  const config = await configReady;

  const [minLng, minLat, maxLng, maxLat] = config.bboxWGS84;

  // 5% padding around the map extent — scales with map size
  const latPad = (maxLat - minLat) * 0.05;
  const lngPad = (maxLng - minLng) * 0.05;

  map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    rotate: true,
    touchRotate: false,
    maxBounds: [
      [minLat - latPad, minLng - lngPad],
      [maxLat + latPad, maxLng + lngPad],
    ],
    maxBoundsViscosity: 1.0,
  });

  // Tile layer — XYZ scheme
  const tileLayer = L.tileLayer(config._tileBase, {
    tms: false,
    minNativeZoom: config.tileMinZoom ?? 13,
    maxNativeZoom: config.tileMaxZoom ?? 18,
    minZoom: 10,
    maxZoom: 22,
    keepBuffer: 4,
    crossOrigin: true,
  }).addTo(map);

  // Adaptive background: sample tile colors and match the map background
  const _samples = [];
  tileLayer.on('tileload', (e) => {
    if (_samples.length >= 8) return;
    try {
      const cv = document.createElement('canvas');
      cv.width = 4; cv.height = 4;
      const ctx = cv.getContext('2d');
      ctx.drawImage(e.tile, 0, 0, 4, 4);
      const d = ctx.getImageData(0, 0, 4, 4).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const px = d.length / 4;
      _samples.push([r / px, g / px, b / px]);
      if (_samples.length === 6) {
        const avg = (i) => Math.round(_samples.reduce((s, t) => s + t[i], 0) / _samples.length);
        map.getContainer().style.backgroundColor = `rgb(${avg(0)},${avg(1)},${avg(2)})`;
      }
    } catch { /* CORS blocked — skip */ }
  });

  const bounds = [[minLat, minLng], [maxLat, maxLng]];
  map.fitBounds(bounds);

  // Lock minZoom to full-extent view, then zoom in to fill the screen.
  // Small screens get +2 since the viewport covers less map area.
  const fitZoom   = map.getBoundsZoom(bounds);
  const zoomBoost = window.innerWidth < 600 ? 2 : 1;
  map.setMinZoom(fitZoom);
  map.setZoom(fitZoom + zoomBoost);

  return map;
}

export function getMap() { return map; }

export function setMapBearing(degrees) {
  if (map && typeof map.setBearing === 'function') map.setBearing(degrees);
}

// ─── GPS dot SVG builder ──────────────────────────────────────────────────────

function buildDotSVG(heading, dimmed) {
  const size     = 48;
  const cx       = size / 2;
  const cy       = size / 2;
  const r        = 9;
  const opacity  = dimmed ? 0.38 : 1;

  // Heading cone — only shown when heading data is available
  const cone = heading != null ? (() => {
    const coneH  = 22;
    const coneW  = 9;
    const tipY   = cy - r - coneH;
    // Rotate the cone around the dot center to match heading
    // heading: 0 = north (up), clockwise
    return `
      <g transform="rotate(${heading}, ${cx}, ${cy})" opacity="${dimmed ? 0.25 : 0.55}">
        <polygon
          points="${cx},${tipY} ${cx - coneW},${cy - r + 2} ${cx + coneW},${cy - r + 2}"
          fill="rgba(59,130,246,0.85)"
        />
      </g>`;
  })() : '';

  // Accuracy ring is drawn separately as an L.circle — not in this SVG

  return `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${size}" height="${size}"
         viewBox="0 0 ${size} ${size}"
         style="overflow:visible">
      ${cone}
      <!-- outer white ring -->
      <circle cx="${cx}" cy="${cy}" r="${r + 2.5}"
              fill="white" opacity="${opacity}"
              filter="drop-shadow(0 1px 3px rgba(0,0,0,0.35))"/>
      <!-- blue dot -->
      <circle cx="${cx}" cy="${cy}" r="${r}"
              fill="#3b82f6" opacity="${opacity}"/>
    </svg>`;
}

function buildPulseSVG() {
  const size = 48;
  const cx   = size / 2;
  const cy   = size / 2;
  return `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${size}" height="${size}"
         viewBox="0 0 ${size} ${size}"
         style="overflow:visible">
      <circle cx="${cx}" cy="${cy}" r="14"
              fill="none"
              stroke="rgba(59,130,246,0.5)"
              stroke-width="2"
              stroke-dasharray="5 3">
        <animateTransform attributeName="transform"
          type="rotate"
          from="0 ${cx} ${cy}"
          to="360 ${cx} ${cy}"
          dur="2s"
          repeatCount="indefinite"/>
      </circle>
    </svg>`;
}

function makeIcon(svg) {
  return L.divIcon({
    className:  '',
    html:       svg,
    iconSize:   [48, 48],
    iconAnchor: [24, 24],
  });
}

// ─── GPS dot update ───────────────────────────────────────────────────────────

// Called from ui.js whenever GPS state changes
// state: 'idle' | 'acquiring' | 'active' | 'off-map' | 'lost' | 'denied'
// position: { lat, lng, accuracy, altitude, heading } | null
export function updateGPSDot(state, position) {
  if (!map) return;

  // Always clear existing layers first
  if (dotMarker)    { map.removeLayer(dotMarker);    dotMarker    = null; }
  if (accuracyRing) { map.removeLayer(accuracyRing); accuracyRing = null; }
  if (pulseMarker)  { map.removeLayer(pulseMarker);  pulseMarker  = null; }

  if (state === 'acquiring') {
    // Pulsing ring in map center — no position yet
    const center = map.getCenter();
    pulseMarker = L.marker(center, {
      icon: makeIcon(buildPulseSVG()),
      zIndexOffset: 900,
      interactive: false,
    }).addTo(map);
    return;
  }

  if (state !== 'active' && state !== 'lost') return;
  if (!position) return;

  const latlng  = [position.lat, position.lng];
  const dimmed  = state === 'lost';
  const heading = position.heading != null && !dimmed ? position.heading : null;

  // Accuracy ring — only when active and accuracy is known
  if (state === 'active' && position.accuracy) {
    accuracyRing = L.circle(latlng, {
      radius:      position.accuracy,
      color:       'rgba(59,130,246,0.4)',
      weight:      1,
      fillColor:   'rgba(59,130,246,0.08)',
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);
  }

  // GPS dot
  dotMarker = L.marker(latlng, {
    icon:          makeIcon(buildDotSVG(heading, dimmed)),
    zIndexOffset:  1000,
    interactive:   false,
  }).addTo(map);
}

// ─── Heading update (compass active) ─────────────────────────────────────────

// Called from ui.js when compass heading changes without a full GPS state change
export function updateDotHeading(heading, position) {
  if (!map || !position) return;
  if (dotMarker) {
    dotMarker.setIcon(makeIcon(buildDotSVG(heading, false)));
  }
}
