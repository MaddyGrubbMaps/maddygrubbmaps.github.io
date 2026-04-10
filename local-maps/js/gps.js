// gps.js — geolocation state machine
// States: idle → acquiring → active → lost | off-map | denied

import { configReady } from './config.js';

// GPS state — one of: idle, acquiring, active, lost, off-map, denied
let state = 'idle';
let lastPosition = null;
const listeners = [];

export function onGPSState(fn) {
  listeners.push(fn);
}

function setState(newState, position = null) {
  state = newState;
  if (position) lastPosition = position;
  listeners.forEach(fn => fn(state, lastPosition));
}

export function getGPSState() { return state; }
export function getLastPosition() { return lastPosition; }

function isInBounds(lat, lng, bboxWGS84) {
  const [minLng, minLat, maxLng, maxLat] = bboxWGS84;
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

export async function startGPS() {
  if (!('geolocation' in navigator)) {
    setState('denied');
    return;
  }

  setState('acquiring');
  const config = await configReady;
  let timeoutCount = 0;

  navigator.geolocation.watchPosition(
    (pos) => {
      timeoutCount = 0; // reset on any successful fix
      const { latitude: lat, longitude: lng, accuracy, altitude, heading } = pos.coords;
      const inBounds = isInBounds(lat, lng, config.bboxWGS84);
      setState(inBounds ? 'active' : 'off-map', { lat, lng, accuracy, altitude, heading });
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        setState('denied');
      } else if (err.code === err.TIMEOUT) {
        timeoutCount++;
        setState(timeoutCount >= 3 ? 'struggling' : 'acquiring');
      } else if (state === 'active') {
        setState('lost');
      } else {
        setState('acquiring');
      }
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
  );
}
