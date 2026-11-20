// Nightpost editor shell — state, controls, pointer/wheel/keyboard interaction, PNG
// exports and the deterministic shot facade. Plain ES modules, relative imports only,
// no libraries, no network: photos come from ./samples or the user's own files.

import { drawCover, layoutRects, LAYOUTS, GRADE_KEYS } from './cover.js';
import { parseShot, runShot } from './shots.js';

const SAMPLES = ['pier', 'boulevard'];
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const MAX_PHOTO_PIXELS = 40_000_000;
const EXPORT_SIZES = { '1080x1080': [1080, 1080], '1080x1350': [1080, 1350], '1920x1080': [1920, 1080] };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const state = {
  layout: 'bigleft',
  grade: 'sunset',
  caption: 'SUNSET HEIST',
  captionLines: null,
  kicker: 'A ONE-NIGHT JOB',
  align: 'center',
  tracking: 2,
  effects: { grain: true, halftone: false, vignette: true },
  photos: [],
  panels: [],
  selected: 0,
  showSelection: true,
  frozen: false,
};

const $ = (id) => document.getElementById(id);
const canvas = $('poster');
const ctx = canvas.getContext('2d');
const stage = $('stage');
const headlineInput = $('headline');
const kickerInput = $('kicker');
const alignSelect = $('align');
const trackingInput = $('tracking');
const trackingVal = $('tracking-val');
const layoutSelect = $('layout');
const gradeSelect = $('grade');
const exportSizeSelect = $('export-size');
const fileInput = $('file');
const statusEl = $('status');
const panelInfo = $('panel-info');

const view = { w: 960, h: 640 };
let coverSize = null;
let queued = false;
let drag = null;

function setStatus(msg) {
  statusEl.textContent = msg;
}

/**
 * Load an image and resolve once onload fires. drawImage is valid at that
 * point; awaiting img.decode() can hang in Chromium (the promise never
 * settles even though onload fired), so decode is deliberately not awaited.
 */
function loadImage(url) {
  const img = new Image();
  const loaded = new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image failed: ' + url));
  });
  img.decoding = 'async';
  if (img.complete && img.naturalWidth > 0) {
    // A url already complete before src is assigned means this Image object
    // was reused or pre-populated by the caller; a fresh Image() is also
    // complete but has naturalWidth 0, so the width check keeps it out.
    return Promise.resolve(img);
  }
  img.src = url;
  if (img.complete && img.naturalWidth > 0) {
    // Already available synchronously (e.g. cache hit); the load is done.
    return Promise.resolve(img);
  }
  return loaded.then(() => img);
}

/** One built-in sample photo, shared by name; resolves to its library index. */
async function ensureSample(name) {
  const clean = SAMPLES.includes(name) ? name : 'pier';
  const at = state.photos.findIndex((p) => p.name === clean);
  if (at >= 0) return at;
  try {
    const img = await loadImage('./samples/' + clean + '.jpg');
    state.photos.push({ name: clean, img, sample: true });
    return state.photos.length - 1;
  } catch (err) {
    setStatus('Sample failed to load: ' + clean);
    return -1;
  }
}

function ensurePanelCount() {
  const n = LAYOUTS[state.layout]?.count ?? 3;
  while (state.panels.length < n) {
    state.panels.push({ photo: state.photos.length ? 0 : -1, panX: 0, panY: 0, zoom: 1 });
  }
  if (state.panels.length > n) state.panels.length = n;
  if (state.selected >= n) state.selected = n - 1;
}

function render(force) {
  if (state.frozen && !force) return;
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.max(80, Math.floor(rect.width));
  const ch = Math.max(80, Math.floor(rect.height));
  view.w = cw;
  view.h = ch;
  const pw = Math.round(cw * dpr);
  const ph = Math.round(ch * dpr);
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawCover(ctx, cw, ch, state);
}

function scheduleRender() {
  if (queued || state.frozen) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    render(false);
  });
}

function updatePanelInfo() {
  const p = state.panels[state.selected];
  if (!p) {
    panelInfo.textContent = 'No panel selected.';
    return;
  }
  const name = state.photos[p.photo]?.name ?? 'empty';
  panelInfo.textContent = 'Panel ' + (state.selected + 1) + '/' + state.panels.length + ' · ' + name + ' · zoom ' + (p.zoom || 1).toFixed(2) + '×';
}

function selectPanel(i) {
  if (i < 0 || i >= state.panels.length) return;
  state.selected = i;
  updatePanelInfo();
  refreshStrip();
}

// ---------------------------------------------------------------- interaction

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (view.w / rect.width),
    y: (e.clientY - rect.top) * (view.h / rect.height),
  };
}

function hitPanel(x, y) {
  const rects = layoutRects(state.layout, view.w, view.h);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

canvas.addEventListener('pointerdown', (e) => {
  if (state.frozen || e.button !== 0) return;
  const pt = canvasPoint(e);
  const i = hitPanel(pt.x, pt.y);
  if (i < 0) return;
  selectPanel(i);
  const p = state.panels[i];
  drag = { i, sx: e.clientX, sy: e.clientY, panX: p.panX, panY: p.panY };
  canvas.style.cursor = 'grabbing';
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag || state.frozen) return;
  const r = layoutRects(state.layout, view.w, view.h)[drag.i];
  const p = state.panels[drag.i];
  if (!r || !p) return;
  p.panX = clamp(drag.panX + (e.clientX - drag.sx) / r.w, -0.75, 0.75);
  p.panY = clamp(drag.panY + (e.clientY - drag.sy) / r.h, -0.75, 0.75);
  scheduleRender();
});

function endDrag(e) {
  if (!drag) return;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch (_) {
    /* pointer already released */
  }
  drag = null;
  canvas.style.cursor = 'grab';
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener('dblclick', (e) => {
  if (state.frozen || state.photos.length === 0) return;
  const pt = canvasPoint(e);
  const i = hitPanel(pt.x, pt.y);
  if (i < 0) return;
  const p = state.panels[i];
  p.photo = ((p.photo ?? -1) + 1) % state.photos.length;
  selectPanel(i);
  setStatus('Panel ' + (i + 1) + ': ' + state.photos[p.photo].name);
  scheduleRender();
});

// ---- photo library strip: thumbnail per photo, click assigns it to the selected
// panel, × removes a user photo. Samples stay in the library permanently.

function drawThumb(tc, img, tw, th) {
  const s = Math.max(tw / img.width, th / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  tc.drawImage(img, (tw - dw) / 2, (th - dh) / 2, dw, dh);
}

function refreshStrip() {
  if (state.frozen) return;
  const strip = $('photo-strip');
  strip.hidden = state.photos.length === 0;
  strip.textContent = '';
  state.photos.forEach((ph, i) => {
    const item = document.createElement('div');
    item.className = 'thumb' + (state.panels[state.selected]?.photo === i ? ' active' : '');
    item.title = 'Use “' + ph.name + '” on panel ' + (state.selected + 1);
    const t = document.createElement('canvas');
    t.width = 96;
    t.height = 64;
    const tc = t.getContext('2d');
    if (tc && ph.img) drawThumb(tc, ph.img, 96, 64);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = ph.name;
    item.append(t, name);
    if (!ph.sample) {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'remove';
      rm.textContent = '×';
      rm.setAttribute('aria-label', 'Remove ' + ph.name);
      item.appendChild(rm);
      rm.addEventListener('click', (e) => {
        e.stopPropagation();
        removePhoto(i);
      });
    }
    item.addEventListener('click', () => {
      const p = state.panels[state.selected];
      if (!p) return;
      p.photo = i;
      updatePanelInfo();
      refreshStrip();
      scheduleRender();
      setStatus('Panel ' + (state.selected + 1) + ': ' + ph.name);
    });
    strip.appendChild(item);
  });
}

function removePhoto(i) {
  if (state.frozen) return;
  if (state.photos[i]?.sample) {
    setStatus('Built-in samples stay in the library.');
    return;
  }
  state.photos.splice(i, 1);
  for (const p of state.panels) {
    if (p.photo === i) p.photo = state.photos.length ? 0 : -1;
    else if (p.photo > i) p.photo -= 1;
  }
  updatePanelInfo();
  refreshStrip();
  scheduleRender();
  setStatus('Photo removed.');
}

canvas.addEventListener('wheel', (e) => {
  if (state.frozen) return;
  e.preventDefault();
  const pt = canvasPoint(e);
  let i = hitPanel(pt.x, pt.y);
  if (i < 0) i = state.selected;
  const p = state.panels[i];
  if (!p) return;
  p.zoom = clamp((p.zoom || 1) * Math.exp(-e.deltaY * 0.0016), 1, 5);
  selectPanel(i);
  scheduleRender();
}, { passive: false });

// ---------------------------------------------------------------- photos in

async function addFile(file) {
  if (!file || !PHOTO_TYPES.has(file.type)) throw new Error('Use a JPEG, PNG, WebP or GIF photo.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Photo is larger than 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const pixels = img.naturalWidth * img.naturalHeight;
    if (!pixels || pixels > MAX_PHOTO_PIXELS || Math.max(img.naturalWidth, img.naturalHeight) > 12000) {
      throw new Error('Photo dimensions are unsupported (maximum 40 megapixels).');
    }
    const rawName = (file.name || 'pasted image').replace(/\.[^.]+$/, '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    state.photos.push({ name: (rawName || 'pasted image').slice(0, 48), img, sample: false });
    return true;
  } finally {
    // The image has fully loaded (onload fired), so the URL is safe to release.
    URL.revokeObjectURL(url);
  }
}

async function addFiles(list) {
  if (state.frozen) return 0;
  let added = 0;
  let skipped = 0;
  for (const f of Array.from(list ?? [])) {
    try {
      if (await addFile(f)) added++;
    } catch (_) {
      skipped++;
    }
  }
  if (added) {
    const first = state.photos.length - added;
    const sel = state.panels[state.selected];
    if (sel) sel.photo = first;
    updatePanelInfo();
    refreshStrip();
    scheduleRender();
  }
  if (added && skipped) setStatus(`Added ${added} photo${added === 1 ? '' : 's'}; skipped ${skipped} unsupported or oversized file${skipped === 1 ? '' : 's'}.`);
  else if (added) setStatus('Added ' + added + (added === 1 ? ' photo.' : ' photos.'));
  else if (skipped) setStatus(`No photos added: ${skipped} unsupported, oversized or unreadable file${skipped === 1 ? '' : 's'}.`);
  return added;
}

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = '';
});

stage.addEventListener('dragover', (e) => e.preventDefault());
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  // A stage drop must not also be handled by the window-level drop target below.
  e.stopPropagation();
  addFiles(e.dataTransfer?.files);
});

// Dropping image files anywhere on the window adds photos; drops that bubble up from
// the stage are already handled above. Non-file drags (e.g. text) keep native behavior.
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer && Array.from(e.dataTransfer.types ?? []).includes('Files')) {
    e.preventDefault();
  }
});
window.addEventListener('drop', (e) => {
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  e.preventDefault();
  addFiles(files);
});

window.addEventListener('paste', (e) => {
  if (state.frozen) return;
  const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
  if (files.length) {
    e.preventDefault();
    addFiles(files);
  }
});

// ---------------------------------------------------------------- actions

function setGrade(name) {
  if (!GRADE_KEYS.includes(name)) return;
  state.grade = name;
  gradeSelect.value = name;
  scheduleRender();
  setStatus('Grade: ' + name);
}

function shufflePhotos() {
  if (state.photos.length === 0) {
    setStatus('No photos yet — add some first.');
    return;
  }
  for (const p of state.panels) p.photo = Math.floor(Math.random() * state.photos.length);
  refreshStrip();
  scheduleRender();
  setStatus('Photos shuffled.');
}

let exporting = false;

function exportPNG() {
  if (exporting) return;
  const key = exportSizeSelect.value;
  const size = EXPORT_SIZES[key];
  if (!size) {
    setStatus('Unknown export size.');
    return;
  }
  const [w, h] = size;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cctx = c.getContext('2d');
  if (!cctx) {
    setStatus('Export failed: no 2D context.');
    return;
  }
  const prevSel = state.showSelection;
  exporting = true;
  try {
    state.showSelection = false;
    drawCover(cctx, w, h, state);
  } catch (_) {
    exporting = false;
    setStatus('Export failed while drawing the poster.');
    return;
  } finally {
    state.showSelection = prevSel;
  }
  try {
    c.toBlob((blob) => {
      if (!blob) {
        exporting = false;
        setStatus('Export failed: PNG encoding returned nothing.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
      a.download = 'nightpost-cover-' + w + 'x' + h + '-' + stamp + '.png';
      try {
        document.body.appendChild(a);
        a.click();
        setStatus('Exported ' + w + '×' + h + ' PNG.');
      } catch (_) {
        setStatus('Export failed while saving the PNG.');
      } finally {
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        exporting = false;
      }
    }, 'image/png');
  } catch (_) {
    exporting = false;
    setStatus('Export failed while encoding the PNG.');
  }
}

// ---------------------------------------------------------------- keyboard

window.addEventListener('keydown', (e) => {
  if (state.frozen) return;
  const t = e.target;
  if (t && (t.isContentEditable || (t.matches && t.matches('input, textarea, select')))) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const gradeIndex = ['1', '2', '3', '4'].indexOf(e.key);
  if (gradeIndex >= 0) {
    setGrade(GRADE_KEYS[gradeIndex]);
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'e') {
    exportPNG();
    return;
  }
  if (k === 'r') {
    shufflePhotos();
    return;
  }
  // Arrow keys nudge the selected panel's pan; + and − zoom it.
  const p = state.panels[state.selected];
  if (!p) return;
  const step = e.shiftKey ? 0.15 : 0.04;
  if (e.key === 'ArrowLeft') p.panX = clamp(p.panX - step, -0.75, 0.75);
  else if (e.key === 'ArrowRight') p.panX = clamp(p.panX + step, -0.75, 0.75);
  else if (e.key === 'ArrowUp') p.panY = clamp(p.panY - step, -0.75, 0.75);
  else if (e.key === 'ArrowDown') p.panY = clamp(p.panY + step, -0.75, 0.75);
  else if (e.key === '+' || e.key === '=') p.zoom = clamp((p.zoom || 1) * 1.12, 1, 5);
  else if (e.key === '-' || e.key === '_') p.zoom = clamp((p.zoom || 1) / 1.12, 1, 5);
  else return;
  e.preventDefault();
  updatePanelInfo();
  scheduleRender();
});

// ---------------------------------------------------------------- controls

function syncInputs() {
  headlineInput.value = state.caption;
  kickerInput.value = state.kicker;
  alignSelect.value = state.align;
  trackingInput.value = String(state.tracking);
  trackingVal.textContent = String(state.tracking);
  layoutSelect.value = state.layout;
  gradeSelect.value = state.grade;
}

function wireEditor() {
  headlineInput.addEventListener('input', () => {
    state.caption = headlineInput.value;
    state.captionLines = null; // user text keeps its own layout
    scheduleRender();
  });
  kickerInput.addEventListener('input', () => {
    state.kicker = kickerInput.value;
    scheduleRender();
  });
  alignSelect.addEventListener('change', () => {
    state.align = alignSelect.value;
    scheduleRender();
  });
  trackingInput.addEventListener('input', () => {
    state.tracking = Number(trackingInput.value);
    trackingVal.textContent = String(state.tracking);
    scheduleRender();
  });
  layoutSelect.addEventListener('change', () => {
    state.layout = layoutSelect.value;
    ensurePanelCount();
    updatePanelInfo();
    scheduleRender();
  });
  gradeSelect.addEventListener('change', () => setGrade(gradeSelect.value));
  $('fx-grain').addEventListener('change', (e) => {
    state.effects.grain = e.target.checked;
    scheduleRender();
  });
  $('fx-halftone').addEventListener('change', (e) => {
    state.effects.halftone = e.target.checked;
    scheduleRender();
  });
  $('fx-vignette').addEventListener('change', (e) => {
    state.effects.vignette = e.target.checked;
    scheduleRender();
  });
  $('shuffle').addEventListener('click', shufflePhotos);
  $('export').addEventListener('click', exportPNG);
  $('reset-panel').addEventListener('click', () => {
    const p = state.panels[state.selected];
    if (!p) return;
    p.panX = 0;
    p.panY = 0;
    p.zoom = 1;
    updatePanelInfo();
    scheduleRender();
    setStatus('Panel ' + (state.selected + 1) + ' reset.');
  });
}

// ---------------------------------------------------------------- shot facade

/** Deliberate stacked-headline display for deterministic shots: a two-word caption
 * breaks between its words ("Sunset Heist" renders as two lines). The user's typed
 * caption and the input's display label are untouched — this only shapes how the
 * shot scene paints it; all other captions rely on the wrapper in cover.js. */
function displayLines(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  return words.length === 2 ? words : null;
}

const shotApi = {
  async usePhotoEverywhere(name) {
    const idx = await ensureSample(name);
    if (idx < 0) return;
    for (const p of state.panels) {
      p.photo = idx;
      p.panX = 0;
      p.panY = 0;
      p.zoom = 1;
    }
    updatePanelInfo();
  },
  setCaption(text) {
    state.caption = text;
    state.captionLines = displayLines(text);
    headlineInput.value = text;
  },
  setGrade(name) {
    if (!GRADE_KEYS.includes(name)) return;
    state.grade = name;
    gradeSelect.value = name;
  },
  whenImagesReady() {
    // Every photo entered the library through loadImage(), so loading is done.
    return Promise.resolve();
  },
  enterCoverMode(size) {
    state.showSelection = false;
    coverSize = size;
    canvas.width = size.w;
    canvas.height = size.h;
    document.body.style.setProperty('--shot-aspect', String(size.w / size.h));
    document.body.classList.add('cover-only');
  },
  drawOnce() {
    if (coverSize) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawCover(ctx, coverSize.w, coverSize.h, state);
    } else {
      state.showSelection = false;
      render(true);
    }
  },
  freeze() {
    state.frozen = true;
  },
};

// ---------------------------------------------------------------- boot

ensurePanelCount();
syncInputs();
wireEditor();
new ResizeObserver(() => scheduleRender()).observe(stage);

const shot = parseShot(window.location.search);
if (shot) {
  runShot(shot, shotApi).then(
    () => setStatus('Deterministic scene: ' + shot.mode),
    (err) => console.error('nightpost: shot scene failed', err),
  );
} else {
  bootDefault();
}

async function bootDefault() {
  const idx = await ensureSample('pier');
  if (idx >= 0) {
    for (const p of state.panels) {
      if (p.photo < 0) p.photo = idx;
    }
  }
  updatePanelInfo();
  refreshStrip();
  scheduleRender();
  setStatus('Ready — click a panel, drag to pan, wheel to zoom, double-click to cycle photos.');
}
