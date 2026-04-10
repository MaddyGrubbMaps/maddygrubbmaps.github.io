// compass.js — DeviceOrientation handling and iOS 13+ permission

let heading = null;
let compassActive = false;
const listeners = [];

export function onHeading(fn) {
  listeners.push(fn);
}

export function getHeading() { return heading; }
export function isCompassActive() { return compassActive; }

function handleOrientation(e) {
  // webkitCompassHeading is iOS; fallback to alpha for Android
  const h = e.webkitCompassHeading != null
    ? e.webkitCompassHeading
    : e.alpha != null ? (360 - e.alpha) % 360 : null;

  if (h == null) return;
  heading = h;
  listeners.forEach(fn => fn(heading));
}

export async function requestCompass() {
  // iOS 13+ requires explicit permission for DeviceOrientationEvent
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    const permission = await DeviceOrientationEvent.requestPermission();
    if (permission !== 'granted') return false;
  }

  window.addEventListener('deviceorientationabsolute', handleOrientation, true);
  window.addEventListener('deviceorientation', handleOrientation, true);
  compassActive = true;
  return true;
}

export function stopCompass() {
  window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
  window.removeEventListener('deviceorientation', handleOrientation, true);
  compassActive = false;
  heading = null;
}
