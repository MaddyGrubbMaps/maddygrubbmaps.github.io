/* =========================================================
   "Where We Work" — interactive globe + project list.
   Ported from Globe Viewer.html. Self-contained IIFE.
   Loaded with `defer`; expects window.d3 + window.topojson.
   ========================================================= */
(async function () {
  const canvas = document.querySelector('canvas.mgm-where-globe');
  const listEl = document.getElementById('mgm-where-projects');
  if (!canvas || !listEl || !window.d3 || !window.topojson) return;

  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Hi-DPI: render at 2x for crisp lines. SIZE follows the canvas's CSS box.
  const SCALE = 2;
  let SIZE = 480;
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    SIZE = Math.max(280, Math.round(rect.width));
    canvas.width  = SIZE * SCALE;
    canvas.height = SIZE * SCALE;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  }
  resizeCanvas();

  // Globe palette — preserved from the design reference (do not swap to brand
  // CSS vars; this is the tuned hand-drawn aesthetic).
  const WATER  = '#233e81';
  const LAND   = '#297b6f';
  const INK    = '#f9a526';
  const ACCENT = '#af553d';
  const PAPER  = '#f4f1ec';

  // ── Hand-drawn jitter wrapper ─────────────────────────
  const JITTER_INTERVAL = 220;
  let jitterSeed = 1;
  let jitterIndex = 0;
  function pseudo(seed, i) {
    const x = Math.sin(seed * 9301 + i * 49297) * 233280;
    return x - Math.floor(x);
  }
  function makeRoughCtx(real, amount) {
    return {
      beginPath() { real.beginPath(); jitterIndex = 0; },
      closePath() { real.closePath(); },
      moveTo(x, y) {
        const dx = (pseudo(jitterSeed, jitterIndex++) - 0.5) * amount;
        const dy = (pseudo(jitterSeed, jitterIndex++) - 0.5) * amount;
        real.moveTo(x + dx, y + dy);
      },
      lineTo(x, y) {
        const dx = (pseudo(jitterSeed, jitterIndex++) - 0.5) * amount;
        const dy = (pseudo(jitterSeed, jitterIndex++) - 0.5) * amount;
        real.lineTo(x + dx, y + dy);
      },
      arc(...args) { real.arc(...args); },
    };
  }
  const roughCtx = makeRoughCtx(ctx, 1.4);

  // Projection — orthographic (front-hemisphere only), recomputed on resize.
  let R = SIZE * (210 / 480), cx = SIZE / 2, cy = SIZE / 2;
  const projection = d3.geoOrthographic()
    .scale(R).translate([cx, cy]).clipAngle(90).precision(0.4);
  function syncProjectionToSize() {
    R  = SIZE * (210 / 480);
    cx = SIZE / 2;
    cy = SIZE / 2;
    projection.scale(R).translate([cx, cy]);
  }
  syncProjectionToSize();
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { resizeCanvas(); syncProjectionToSize(); }).observe(canvas);
  }

  const path      = d3.geoPath(projection, ctx);
  const roughPath = d3.geoPath(projection, roughCtx);
  const graticule = d3.geoGraticule().step([20, 20])();
  const equator   = { type: 'LineString', coordinates: d3.range(-180, 181, 2).map(x => [x, 0]) };

  // ── Data loading ─────────────────────────────────────────
  let land = null, rivers = null, lakes = null, PROJECTS = [];
  try {
    const world = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r => r.json());
    land = topojson.feature(world, world.objects.land);
  } catch (e) {
    console.warn('[where] world atlas fetch failed', e);
  }
  try {
    rivers = await fetch('data/rivers.json').then(r => r.json());
    lakes  = await fetch('data/lakes.json').then(r => r.json());
  } catch (e) {
    console.warn('[where] hydrology fetch failed', e);
  }
  try {
    PROJECTS = await fetch('data/globe-projects.json').then(r => r.json());
  } catch (e) {
    console.error('[where] projects fetch failed', e);
    return;
  }

  // Pre-compute per-river taper weights (mouth wide → headwater thin).
  function computeRiverTapers(riverFC, landFC) {
    if (!riverFC || !landFC) return [];
    const coastPts = [];
    const visit = (g) => {
      if (!g) return;
      if (g.type === 'Polygon') g.coordinates.forEach(r => r.forEach(p => coastPts.push(p)));
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(poly => poly.forEach(r => r.forEach(p => coastPts.push(p))));
    };
    landFC.features.forEach(f => visit(f.geometry));
    const buckets = new Map();
    for (const [lon, lat] of coastPts) {
      const k = Math.round(lon) + ',' + Math.round(lat);
      if (!buckets.has(k)) buckets.set(k, [lon, lat]);
    }
    function nearestCoastDeg(pt) {
      const [lo, la] = pt;
      let best = Infinity;
      for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
        const k = Math.round(lo + dx) + ',' + Math.round(la + dy);
        const cp = buckets.get(k);
        if (!cp) continue;
        const d = Math.hypot(cp[0] - lo, cp[1] - la);
        if (d < best) best = d;
      }
      return best;
    }
    const out = [];
    for (const f of riverFC.features) {
      const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
      for (const line of lines) {
        if (line.length < 2) continue;
        const dStart = nearestCoastDeg(line[0]);
        const dEnd   = nearestCoastDeg(line[line.length - 1]);
        const mouthAtStart = dStart <= dEnd;
        const n = line.length;
        const weights = new Array(n);
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          weights[i] = mouthAtStart ? (1 - t) : t;
        }
        out.push({ line, weights });
      }
    }
    return out;
  }
  const riverTapers = computeRiverTapers(rivers, land);

  // ── Interactive rotation ──────────────────────────────
  let lambda = 0;
  let phi    = -18;
  let lastTs = null;
  let dragging = false;
  let lastX = 0, lastY = 0;

  // Page-scroll nudge — gentle longitude tweak as the user scrolls past.
  let lastScrollY = window.scrollY || 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY || 0;
    const dy = y - lastScrollY;
    lastScrollY = y;
    if (dragging || targetRotation || reducedMotion) return;
    lambda += dy * 0.18;
  }, { passive: true });

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    lambda += dx * 0.35;
    phi    -= dy * 0.35;
    if (phi >  85) phi =  85;
    if (phi < -85) phi = -85;
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  };
  canvas.addEventListener('pointerup',     endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave',  endDrag);

  // ── Selection ────────────────────────────────────────────
  let selectedProject = null;
  let targetRotation  = null;

  function selectProject(project) {
    if (selectedProject && selectedProject.id === project.id) {
      selectedProject = null;
      targetRotation  = null;
      renderList();
      return;
    }
    selectedProject = project;
    targetRotation  = [-project.coords[0], -project.coords[1]];
    renderList();
  }

  // ── List render ──────────────────────────────────────────
  function renderList() {
    const frag = document.createDocumentFragment();
    PROJECTS.forEach((p, i) => {
      const isOpen = selectedProject && selectedProject.id === p.id;
      const li = document.createElement('li');
      li.className = 'mgm-where-project';
      li.setAttribute('aria-expanded', String(!!isOpen));
      li.innerHTML = `
        <button class="mgm-where-project-row" type="button">
          <span class="mgm-where-project-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="mgm-where-project-title-block">
            <span class="mgm-where-project-title">${p.title}</span>
          </span>
          <span class="mgm-where-project-region">${p.region}</span>
        </button>
        <div class="mgm-where-project-body">
          <div class="mgm-where-project-body-inner">
            <div class="mgm-where-project-body-content">
              <figure class="mgm-where-project-figure">
                <img class="mgm-where-project-figure-img" src="${p.img}" alt="${p.title}" loading="lazy" />
              </figure>
              <p class="mgm-where-project-desc">${p.description}</p>
            </div>
          </div>
        </div>`;
      li.querySelector('.mgm-where-project-row').addEventListener('click', () => selectProject(p));
      // Click the project image → open the existing site-wide lightbox at full
      // ratio. Stops propagation so it doesn't also toggle the accordion row.
      const figImg = li.querySelector('.mgm-where-project-figure-img');
      if (figImg) {
        figImg.addEventListener('click', (e) => {
          e.stopPropagation();
          openLightbox(p);
        });
      }
      frag.appendChild(li);
    });
    listEl.replaceChildren(frag);
  }
  renderList();

  function openLightbox(project) {
    const lb     = document.getElementById('mgm-lightbox');
    const lbImg  = document.getElementById('mgm-lightbox-img');
    const lbCap  = document.getElementById('mgm-lightbox-caption');
    if (!lb || !lbImg) return;
    lbImg.src = project.img;
    lbImg.alt = project.title;
    if (lbCap) {
      // Title + description, two paragraphs joined by blank line — the
      // lightbox CSS rule sets white-space: pre-line so this renders multi-line.
      lbCap.textContent = project.description
        ? `${project.title}\n\n${project.description}`
        : project.title;
    }
    lb.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  // ── Mobile pin popup ───────────────────────────────────────
  // ≤880px viewports: project list is hidden, so a tap on a pin
  // opens a positioned popup near the pin with title + region +
  // image + description. Tap the popup image to fullscreen the
  // map in the lightbox.
  const popupLayer = document.getElementById('mgm-where-popup-layer');
  let activePopup = null;
  let activePopupPin = null;

  function isMobile() {
    return window.matchMedia('(max-width: 880px)').matches;
  }

  function buildPopup(project) {
    const el = document.createElement('div');
    el.className = 'mgm-where-popup';
    el.innerHTML = `
      <button type="button" class="mgm-where-popup-close" aria-label="Close">×</button>
      <img class="mgm-where-popup-img" src="${project.img}" alt="${project.title}" loading="lazy">
      <div class="mgm-where-popup-body">
        <p class="mgm-where-popup-title">${project.title}</p>
        <p class="mgm-where-popup-region">${project.region}</p>
        <p class="mgm-where-popup-desc">${project.description}</p>
      </div>`;
    el.querySelector('.mgm-where-popup-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeMobilePopup();
    });
    el.querySelector('.mgm-where-popup-img').addEventListener('click', (e) => {
      e.stopPropagation();
      openLightbox(project);
    });
    return el;
  }

  function openMobilePopup(project) {
    if (!popupLayer) return;
    closeMobilePopup();
    activePopupPin = project;
    // Rotate the globe so the pin lands roughly 25% from the top of the disc.
    // phi = -lat + LAT_OFFSET shifts the pin north on screen so the popup,
    // which sits below the pin, fits comfortably in the lower 75% of the globe.
    const LAT_OFFSET = 25;
    targetRotation = [-project.coords[0], -project.coords[1] + LAT_OFFSET];
    activePopup = buildPopup(project);
    popupLayer.appendChild(activePopup);
    popupLayer.setAttribute('aria-hidden', 'false');
    positionMobilePopup();
  }

  function closeMobilePopup() {
    if (activePopup && activePopup.parentNode) {
      activePopup.parentNode.removeChild(activePopup);
    }
    activePopup = null;
    activePopupPin = null;
    if (popupLayer) popupLayer.setAttribute('aria-hidden', 'true');
  }

  function positionMobilePopup() {
    if (!activePopup || !activePopupPin) return;
    const p = pinScreenPos(activePopupPin.coords);
    if (!p) {
      // Pin rotated out of view — close.
      closeMobilePopup();
      return;
    }
    // Popup sits below the pin's surface anchor; arrow at popup's top points up.
    // X is clamped so the popup never extends past the canvas edges; the arrow
    // shifts within the popup so it still points at the actual pin position.
    const stageRect = canvas.getBoundingClientRect();
    const stageW = stageRect.width;
    const popupW = activePopup.offsetWidth || 240;
    const HALF = popupW / 2;
    const MARGIN = 8;
    const minCenter = HALF + MARGIN;
    const maxCenter = stageW - HALF - MARGIN;
    let popupCenterX = p[0];
    if (popupCenterX < minCenter) popupCenterX = minCenter;
    if (popupCenterX > maxCenter) popupCenterX = maxCenter;

    const popupLeft = popupCenterX - HALF;
    let arrowX = p[0] - popupLeft;
    arrowX = Math.max(18, Math.min(popupW - 18, arrowX));
    const arrowPct = (arrowX / popupW) * 100;

    activePopup.style.left = popupCenterX + 'px';
    activePopup.style.top  = p[1] + 'px';
    activePopup.style.setProperty('--arrow-x', arrowPct + '%');
  }

  // ── Click-vs-drag distinction on the canvas ─────────────
  let downX = 0, downY = 0, downMoved = false;
  canvas.addEventListener('pointerdown', (e) => {
    downX = e.clientX; downY = e.clientY; downMoved = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) downMoved = true;
  });
  function pinVisible(coords) {
    const r = projection.rotate();
    return d3.geoDistance(coords, [-r[0], -r[1]]) < Math.PI / 2;
  }
  function pinScreenPos(coords) {
    if (!pinVisible(coords)) return null;
    return projection(coords);
  }
  function hitTestPin(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const PIN_R = SIZE * (8 / 480);
    const PIN_H = SIZE * (22 / 480);
    let hit = null, bestD = Infinity;
    for (const pin of PROJECTS) {
      const p = pinScreenPos(pin.coords);
      if (!p) continue;
      const bulbY = p[1] - (PIN_H - PIN_R);
      const d = Math.hypot(p[0] - mx, bulbY - my);
      const hitR = PIN_R * 1.6;
      if (d < hitR && d < bestD) { hit = pin; bestD = d; }
    }
    return hit;
  }
  canvas.addEventListener('pointerup', (e) => {
    if (downMoved) return;
    const hit = hitTestPin(e.clientX, e.clientY);
    if (!hit) {
      // Tap on empty globe (mobile only) closes any open popup.
      if (isMobile()) closeMobilePopup();
      return;
    }
    if (isMobile()) {
      // Toggle: tap same pin twice closes the popup.
      if (activePopupPin && activePopupPin.id === hit.id) closeMobilePopup();
      else openMobilePopup(hit);
    } else {
      selectProject(hit);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) return;
    const hit = hitTestPin(e.clientX, e.clientY);
    canvas.classList.toggle('is-pin-hover', !!hit);
  });

  // ── Draw loop ────────────────────────────────────────────
  function angDiff(a, b) {
    let d = (b - a) % 360;
    if (d > 180)  d -= 360;
    if (d < -180) d += 360;
    return d;
  }
  function lerpDeg(a, b, t) {
    return a + angDiff(a, b) * t;
  }

  function draw(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;

    if (targetRotation && !dragging) {
      const speed = Math.min(1, dt / 700);
      lambda = lerpDeg(lambda, targetRotation[0], speed);
      phi    = lerpDeg(phi,    targetRotation[1], speed);
      if (Math.abs(angDiff(lambda, targetRotation[0])) < 0.2 &&
          Math.abs(phi - targetRotation[1])           < 0.2) {
        lambda = targetRotation[0];
        phi    = targetRotation[1];
        targetRotation = null;
      }
    } else if (!dragging && !selectedProject && !activePopupPin && !reducedMotion) {
      lambda += dt * (360 / 48000);
    }

    projection.rotate([lambda, phi, 0]);
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Ocean
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fillStyle = WATER;
    ctx.fill();

    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';

    // Graticule
    ctx.beginPath();
    roughPath(graticule);
    ctx.lineWidth   = 0.5;
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.55;
    ctx.stroke();

    // Equator
    ctx.beginPath();
    roughPath(equator);
    ctx.lineWidth   = 1.6;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Land
    if (land) {
      ctx.beginPath();
      roughPath(land);
      ctx.fillStyle = LAND;
      ctx.fill();
      ctx.beginPath();
      roughPath(land);
      ctx.lineWidth   = 0.8;
      ctx.strokeStyle = LAND;
      ctx.stroke();
    }

    // Lakes
    if (lakes) {
      ctx.beginPath();
      roughPath(lakes);
      ctx.fillStyle = WATER;
      ctx.fill();
      ctx.beginPath();
      roughPath(lakes);
      ctx.lineWidth   = 0.8;
      ctx.strokeStyle = WATER;
      ctx.stroke();
    }

    // Rivers
    if (riverTapers.length) drawTaperedRivers();

    // Globe rim
    ctx.beginPath();
    roughPath({ type: 'Sphere' });
    ctx.lineWidth   = 4.4;
    ctx.strokeStyle = INK;
    ctx.stroke();

    drawPins();

    // Mobile popup follows the pin as the globe rotates / drags.
    if (activePopupPin) positionMobilePopup();
  }

  function drawTaperedRivers() {
    const W_MAX = 0.8;
    const W_MIN = 0.25;
    const r = projection.rotate();
    const center = [-r[0], -r[1]];
    ctx.strokeStyle = WATER;
    ctx.lineCap = 'round';
    const J = 1.4;
    const jx = () => (pseudo(jitterSeed, jitterIndex++) - 0.5) * J;
    const jy = () => (pseudo(jitterSeed, jitterIndex++) - 0.5) * J;
    for (const { line, weights } of riverTapers) {
      const firstVis = d3.geoDistance(line[0], center) < Math.PI / 2;
      const lastVis  = d3.geoDistance(line[line.length - 1], center) < Math.PI / 2;
      if (!firstVis && !lastVis) continue;
      const pts = new Array(line.length);
      for (let i = 0; i < line.length; i++) {
        pts[i] = (d3.geoDistance(line[i], center) < Math.PI / 2) ? projection(line[i]) : null;
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (!a || !b) continue;
        const w = W_MIN + (W_MAX - W_MIN) * ((weights[i] + weights[i + 1]) / 2);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(a[0] + jx(), a[1] + jy());
        ctx.lineTo(b[0] + jx(), b[1] + jy());
        ctx.stroke();
      }
    }
  }

  function drawPins() {
    const PIN_R  = SIZE * (8 / 480);
    const PIN_H  = SIZE * (22 / 480);
    const HOLE_R = SIZE * (3.6 / 480);
    for (const pin of PROJECTS) {
      const p = pinScreenPos(pin.coords);
      if (!p) continue;
      const isSelected = (selectedProject && selectedProject.id === pin.id) ||
                         (activePopupPin && activePopupPin.id === pin.id);
      const [ax, ay] = p;
      const cxh = ax;
      const cyh = ay - (PIN_H - PIN_R);
      const dy = ay - cyh;
      const dist = Math.hypot(0, dy);
      const a = Math.asin(PIN_R / dist);
      ctx.beginPath();
      const rx = cxh + Math.cos(Math.PI / 2 - a) * PIN_R;
      const ry = cyh + Math.sin(Math.PI / 2 - a) * PIN_R;
      ctx.moveTo(ax, ay);
      ctx.lineTo(rx, ry);
      ctx.arc(cxh, cyh, PIN_R, Math.PI / 2 - a, Math.PI / 2 + a, true);
      ctx.lineTo(ax, ay);
      ctx.closePath();
      ctx.fillStyle = isSelected ? ACCENT : INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cxh, cyh, HOLE_R, 0, Math.PI * 2);
      ctx.fillStyle = PAPER;
      ctx.fill();
    }
  }

  function frame(ts) {
    const newSeed = reducedMotion ? 1 : (Math.floor(ts / JITTER_INTERVAL) || 1);
    if (newSeed !== jitterSeed) jitterSeed = newSeed;
    draw(ts);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
