// Midnight Marquee — editor controller.
// Owns state, DOM wiring, and the render loop; delegates drawing to cover.js
// and shot-scene boot to shots.js. Plain ES module, relative imports only.

import { drawCover, loadImage, panelRects, coverGeom, PANEL_COUNT, GRADES, LAYOUTS, DEFAULT_GRADE, DEFAULT_LAYOUT } from './cover.js';
import { startShot } from './shots.js';

// ---------------------------------------------------------------------------
// DOM handles
// ---------------------------------------------------------------------------

const canvas = document.getElementById('poster');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const stageHint = document.getElementById('stageHint');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const photoInput = document.getElementById('photoInput');
const shuffleBtn = document.getElementById('shuffleBtn');
const photoCountEl = document.getElementById('photoCount');
const titleInput = document.getElementById('titleInput');
const kickerInput = document.getElementById('kickerInput');
const captionInput = document.getElementById('captionInput');
const trackingInput = document.getElementById('trackingInput');
const trackingOut = document.getElementById('trackingOut');
const gradeSeg = document.getElementById('gradeSeg');
const alignSeg = document.getElementById('alignSeg');
const layoutSeg = document.getElementById('layoutSeg');
const sizeSeg = document.getElementById('sizeSeg');
const fxGrain = document.getElementById('fxGrain');
const fxHalftone = document.getElementById('fxHalftone');
const fxVignette = document.getElementById('fxVignette');
const exportBtn = document.getElementById('exportBtn');

const EXPORT_SIZES = [
  { id: '1080x1080', w: 1080, h: 1080 },
  { id: '1080x1350', w: 1080, h: 1350 },
  { id: '1920x1080', w: 1920, h: 1080 },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  title: 'Sunset Heist',
  kicker: 'TONIGHT AT THE MARQUEE',
  caption: 'A MIDNIGHT MARQUEE PICTURE \u00B7 35MM',
  align: 'left',
  tracking: 6,
  grade: DEFAULT_GRADE,
  layout: DEFAULT_LAYOUT,
  photos: [],       // [{ img, name, url, objUrl }]
  panels: [],       // per layout slot: { photoIndex, pan:{x,y}, zoom }
  selected: -1,
  effects: { grain: true, halftone: false, vignette: true },
};

let exportSize = EXPORT_SIZES[0];
let exporting = false;
let dirty = true;
let frozen = false; // cover-shot pages freeze: the loop must not repaint
let pendingLoads = 0;

function defaultPanel(photoIndex) {
  return { photoIndex, pan: { x: 0.5, y: 0.5 }, zoom: 1 };
}

function rebuildPanels() {
  const want = PANEL_COUNT[state.layout] || 3;
  const next = [];
  for (let i = 0; i < want; i++) {
    const prev = state.panels[i];
    if (prev) {
      // Keep the user's pan/zoom/photo choice, but revive slots that were
      // empty before any photo existed (photoIndex -1) or that point past
      // the current photo list.
      if (prev.photoIndex < 0 || prev.photoIndex >= state.photos.length) {
        prev.photoIndex = state.photos.length ? i % state.photos.length : -1;
      }
      next.push(prev);
    } else {
      next.push(defaultPanel(state.photos.length ? i % state.photos.length : -1));
    }
  }
  state.panels = next;
  if (state.selected >= want) state.selected = want - 1;
}

function requestRender() {
  dirty = true;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function showError(text) {
  errorEl.textContent = text;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.textContent = '';
  errorEl.hidden = true;
}

function updatePhotoCount() {
  const n = state.photos.length;
  photoCountEl.textContent = n === 0
    ? 'No photos loaded'
    : `${n} photo${n === 1 ? '' : 's'} loaded`;
}

function updatePanelStatus() {
  const sel = state.selected;
  const slotNote = sel >= 0 ? ` \u00B7 panel ${sel + 1}/${state.panels.length} selected` : '';
  setStatus(`${state.photos.length} photo${state.photos.length === 1 ? '' : 's'} \u00B7 ${state.layout} \u00B7 ${state.grade}${slotNote}`);
}

// ---------------------------------------------------------------------------
// Render loop — renders only when dirty so the UI stays responsive while
// images load in the background.
// ---------------------------------------------------------------------------

function render() {
  drawCover(ctx, canvas.width, canvas.height, state);
}

function tick() {
  if (dirty && !frozen) {
    dirty = false;
    render();
  }
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

// ---------------------------------------------------------------------------
// Photo intake: file input, drag/drop, Ctrl+V paste
// ---------------------------------------------------------------------------

const MAX_PHOTOS = 30;

async function addFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f && typeof f.type === 'string' && f.type.startsWith('image/'));
  if (!files.length) {
    setStatus('No usable image files in that drop or picker selection.');
    return;
  }
  clearError();
  let added = 0;
  for (const file of files) {
    if (state.photos.length >= MAX_PHOTOS) {
      setStatus(`Photo limit reached (${MAX_PHOTOS}); ${file.name} skipped.`);
      break;
    }
    const objUrl = URL.createObjectURL(file);
    pendingLoads++;
    setStatus(`Loading ${file.name}\u2026 (${pendingLoads} pending)`);
    try {
      const img = await loadImage(objUrl);
      state.photos.push({ img, name: file.name, url: objUrl, objUrl });
      added++;
      updatePhotoCount();
      requestRender();
      setStatus(`Loaded ${file.name} (${state.photos.length} total)`);
    } catch (err) {
      URL.revokeObjectURL(objUrl); // failed loads must not leak a blob URL
      showError(`Could not load ${file.name}: ${err.message}`);
    } finally {
      pendingLoads--;
    }
  }
  if (added > 0) {
    rebuildPanels();
    requestRender();
    updatePanelStatus();
  }
}

photoInput.addEventListener('change', () => {
  addFiles(photoInput.files);
  photoInput.value = ''; // allow re-picking the same file
});

// Window-level dragover/drop so a stray drop outside the stage cannot navigate.
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  stage.classList.add('drag-over');
});
window.addEventListener('dragleave', (e) => {
  if (e.target === document || e.relatedTarget === null) stage.classList.remove('drag-over');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  stage.classList.remove('drag-over');
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
    addFiles(e.dataTransfer.files);
  }
});

// Teardown hygiene: every blob URL we minted is revoked when the page goes
// away, so long editing sessions that reload never leak object URLs.
window.addEventListener('pagehide', () => {
  for (const p of state.photos) {
    if (p.objUrl) URL.revokeObjectURL(p.objUrl);
  }
});

document.addEventListener('paste', (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) {
    e.preventDefault();
    addFiles(files);
  }
});

// ---------------------------------------------------------------------------
// Segmented controls (built once; grade/align/layout/size are buttons, never selects)
// ---------------------------------------------------------------------------

function buildSeg(host, entries, onPick, initialId) {
  const buttons = new Map();
  for (const entry of entries) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = entry.label;
    b.dataset.id = entry.id;
    b.setAttribute('aria-pressed', String(entry.id === initialId));
    b.addEventListener('click', () => {
      onPick(entry.id);
      syncSeg(host, entry.id);
    });
    host.appendChild(b);
    buttons.set(entry.id, b);
  }
  host._sync = (id) => {
    for (const [id0, b] of buttons) {
      b.setAttribute('aria-pressed', String(id0 === id));
    }
  };
  host._sync(initialId);
}

function syncSeg(host, id) {
  if (host && host._sync) host._sync(id);
}

buildSeg(alignSeg, [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
], (id) => { state.align = id; requestRender(); }, state.align);

buildSeg(gradeSeg, GRADES.map((g, i) => ({ id: g, label: `${i + 1} ${g}` })),
  (id) => setGrade(id, true), state.grade);

buildSeg(layoutSeg, LAYOUTS.map((l) => ({ id: l, label: l })),
  (id) => setLayout(id), state.layout);

buildSeg(sizeSeg, EXPORT_SIZES.map((s) => ({ id: s.id, label: `${s.w}\u00D7${s.h}` })),
  (id) => setSize(id), exportSize.id);

function setGrade(id, viaClick) {
  if (!GRADES.includes(id)) return;
  state.grade = id;
  syncSeg(gradeSeg, id);
  requestRender();
  updatePanelStatus();
  if (!viaClick) setStatus(`Grade: ${id}`);
}

function setLayout(id) {
  if (!LAYOUTS.includes(id)) return;
  state.layout = id;
  syncSeg(layoutSeg, id);
  rebuildPanels();
  requestRender();
  updatePanelStatus();
}

function setSize(id) {
  const size = EXPORT_SIZES.find((s) => s.id === id);
  if (!size) return;
  exportSize = size;
  syncSeg(sizeSeg, id);
  canvas.width = size.w;
  canvas.height = size.h;
  requestRender();
  setStatus(`Preview + export set to ${size.w}\u00D7${size.h}`);
}

// Text + tracking controls
titleInput.addEventListener('input', () => { state.title = titleInput.value; requestRender(); });
kickerInput.addEventListener('input', () => { state.kicker = kickerInput.value; requestRender(); });
captionInput.addEventListener('input', () => { state.caption = captionInput.value; requestRender(); });
trackingInput.addEventListener('input', () => {
  state.tracking = Number(trackingInput.value) || 0;
  trackingOut.textContent = String(state.tracking);
  requestRender();
});

// Effects
function bindFx(box, key) {
  box.addEventListener('change', () => {
    state.effects[key] = box.checked;
    requestRender();
  });
}
bindFx(fxGrain, 'grain');
bindFx(fxHalftone, 'halftone');
bindFx(fxVignette, 'vignette');

// ---------------------------------------------------------------------------
// Shuffle (R)
// ---------------------------------------------------------------------------

function shuffle() {
  const n = state.photos.length;
  if (!n) {
    setStatus('Add photos first, then shuffle.');
    return;
  }
  for (const p of state.panels) {
    p.photoIndex = Math.floor(Math.random() * n);
    p.pan = { x: Math.random(), y: Math.random() };
  }
  requestRender();
  setStatus('Shuffled panel photos.');
}
shuffleBtn.addEventListener('click', shuffle);

// ---------------------------------------------------------------------------
// Panel interaction: select, pan, zoom, cycle
// ---------------------------------------------------------------------------

function panelAt(px, py) {
  const rects = panelRects(state.layout, canvas.width, canvas.height);
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) return i;
  }
  return -1;
}

let dragging = false;
let dragMoved = false;
let dragStart = null;

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const pt = canvasPoint(e);
  const idx = panelAt(pt.x, pt.y);
  state.selected = idx;
  requestRender();
  updatePanelStatus();
  if (idx >= 0) {
    dragging = true;
    dragMoved = false;
    dragStart = { ...pt, pan: { ...state.panels[idx].pan } };
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging || state.selected < 0) return;
  const pt = canvasPoint(e);
  const rect = panelRects(state.layout, canvas.width, canvas.height)[state.selected];
  const panel = state.panels[state.selected];
  const photo = state.photos[panel.photoIndex];
  if (!photo || !photo.img || !photo.img.naturalWidth) return;
  const geom = coverGeom(photo.img, rect, panel.pan, panel.zoom);
  if (geom.maxDX <= 0 && geom.maxDY <= 0) return;
  const dx = pt.x - dragStart.x;
  const dy = pt.y - dragStart.y;
  dragMoved = Math.abs(dx) > 2 || Math.abs(dy) > 2;
  const nx = geom.maxDX > 0
    ? clamp01(dragStart.pan.x - dx / geom.maxDX)
    : 0.5;
  const ny = geom.maxDY > 0
    ? clamp01(dragStart.pan.y - dy / geom.maxDY)
    : 0.5;
  panel.pan = { x: nx, y: ny };
  requestRender();
});

canvas.addEventListener('pointerup', () => {
  dragging = false;
});

canvas.addEventListener('pointercancel', () => {
  dragging = false;
});

canvas.addEventListener('wheel', (e) => {
  const pt = canvasPoint(e);
  const idx = state.selected >= 0 ? state.selected : panelAt(pt.x, pt.y);
  if (idx < 0) return;
  e.preventDefault();
  const panel = state.panels[idx];
  const photo = state.photos[panel.photoIndex];
  if (!photo || !photo.img || !photo.img.naturalWidth) return;
  const rect = panelRects(state.layout, canvas.width, canvas.height)[idx];
  const before = coverGeom(photo.img, rect, panel.pan, panel.zoom);
  // Point-stable zoom: keep the image point under the cursor fixed.
  const u = (pt.x - rect.x + before.px * before.maxDX) / before.scale;
  const v = (pt.y - rect.y + before.py * before.maxDY) / before.scale;
  const zoom = clamp(before.zoom * Math.exp(-e.deltaY * 0.0012), 1, 4);
  const after = coverGeom(photo.img, rect, { x: 0.5, y: 0.5 }, zoom);
  const nx = after.maxDX > 0 ? clamp01((u * after.scale - (pt.x - rect.x)) / after.maxDX) : 0.5;
  const ny = after.maxDY > 0 ? clamp01((v * after.scale - (pt.y - rect.y)) / after.maxDY) : 0.5;
  panel.zoom = zoom;
  panel.pan = { x: nx, y: ny };
  requestRender();
}, { passive: false });

canvas.addEventListener('dblclick', (e) => {
  const pt = canvasPoint(e);
  const idx = panelAt(pt.x, pt.y);
  if (idx < 0 || !state.photos.length) return;
  state.selected = idx; // double-click both cycles and selects the panel
  const panel = state.panels[idx];
  panel.photoIndex = (panel.photoIndex + 1) % state.photos.length;
  requestRender();
  updatePanelStatus();
  setStatus(`Panel ${idx + 1} now shows ${state.photos[panel.photoIndex].name}`);
});

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------------------------------------------------------------------------
// Keyboard: 1-4 grade, E export, R shuffle (never while typing)
// ---------------------------------------------------------------------------

function typingTarget(e) {
  const t = e.target;
  return t && (
    t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' ||
    t.isContentEditable
  );
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;   // never hijack browser combos
  if (typingTarget(e)) return;                      // never hijack typing
  const key = e.key;
  if (key >= '1' && key <= '4') {
    setGrade(GRADES[Number(key) - 1], false);
    e.preventDefault();
  } else if ((key === 'e' || key === 'E') && !e.repeat) {
    e.preventDefault();
    exportPNG();
  } else if ((key === 'r' || key === 'R') && !e.repeat) {
    e.preventDefault();
    shuffle();
  }
});

// ---------------------------------------------------------------------------
// Export: fresh canvas at the chosen size, then toBlob
// ---------------------------------------------------------------------------

async function exportPNG() {
  if (exporting) return; // one export at a time; guard against double E
  exporting = true;
  exportBtn.disabled = true;
  clearError();
  setStatus(`Exporting ${exportSize.w}\u00D7${exportSize.h} PNG\u2026`);
  // Keyboard users: pressing E moves focus when the download anchor steals it.
  // Remember who was focused and hand it back when the export settles.
  const focusOwner = document.activeElement;
  try {
    const out = document.createElement('canvas');
    out.width = exportSize.w;
    out.height = exportSize.h;
    const outCtx = out.getContext('2d');
    drawCover(outCtx, out.width, out.height, state);
    const blob = await new Promise((resolve, reject) => {
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))), 'image/png');
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `midnight-marquee-${exportSize.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus(`Exported midnight-marquee-${exportSize.id}.png`);
  } catch (err) {
    showError(`Export failed: ${err.message}`);
  } finally {
    exporting = false;
    exportBtn.disabled = false;
    if (focusOwner && typeof focusOwner.focus === 'function' && document.contains(focusOwner)) {
      focusOwner.focus();
    }
  }
}
exportBtn.addEventListener('click', exportPNG);

// ---------------------------------------------------------------------------
// Boot — shot scenes via shots.js, otherwise plain editor
// ---------------------------------------------------------------------------

rebuildPanels();
updatePhotoCount();
updatePanelStatus();
requestRender();

const shotParams = new URLSearchParams(window.location.search);
if (shotParams.has('shot')) {
  startShot(shotParams, {
    canvas,
    setStatus,
    showError,
    startEditor: (samplePhotos, overrides) => {
      state.photos = samplePhotos;
      state.title = overrides.title;
      state.kicker = overrides.kicker;
      state.caption = overrides.caption;
      titleInput.value = overrides.title;
      kickerInput.value = overrides.kicker;
      captionInput.value = overrides.caption;
      rebuildPanels();
      updatePhotoCount();
      updatePanelStatus();
      requestRender();
    },
    freezeCover: () => {
      document.body.classList.add('shot-freeze');
      frozen = true; // drawn once by shots.js; stop the render loop
    },
  }).then((result) => {
    if (result === 'frozen') setStatus('Cover shot rendered \u2014 page frozen.');
  }).catch((err) => {
    showError(`Shot scene failed: ${err.message}`);
  });
} else {
  setStatus('Ready \u2014 add photos, or drop / paste images anywhere.');
}
