// Midnight Marquee — editor controller.
// Pure ES module. No network, no libraries, local files only.

import { drawCover, drawPanelThumb, getPanelRects, panelCount, GRADES } from './cover.js';
import { maybeRunShot, parseShot, RENDER_SIZES } from './shots.js';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 12;

const canvas = document.getElementById('preview');
const ctx = canvas ? canvas.getContext('2d') : null;

const state = {
  seed: 4177,
  layout: 'big-left-with-two-right',
  grade: 'sunset',
  align: 'left',
  tracking: 0.06,
  headline: 'SUNSET HEIST',
  kicker: 'NEON COAST PICTURES / CHAPTER ONE',
  caption: 'A midnight marquee original',
  effects: { grain: true, halftone: true, vignette: true },
  size: { w: 1080, h: 1350 },
  selected: 0,
  panels: [0, 1, 2, 3].map((i) => ({
    img: null,
    panX: i === 1 ? -0.18 : i === 2 ? 0.18 : 0,
    panY: 0,
    zoom: 1,
    label: `FRAME ${String(i + 1).padStart(2, '0')}`
  }))
};

/** Cover-fit overflow of a panel's photo, in canvas pixels. */
function panelOverflow(panel, rect) {
  const img = panel && panel.img;
  if (!img || !img.naturalWidth || !img.naturalHeight) return { x: rect.w, y: rect.h };
  const zoom = Math.max(1, Math.min(3, Number(panel.zoom) || 1));
  const base = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * zoom;
  return {
    x: Math.max(8, (img.naturalWidth * base - rect.w) / 2),
    y: Math.max(8, (img.naturalHeight * base - rect.h) / 2)
  };
}

/** Strict photo loader: settles on onload/onerror only, never decode(). */
function loadImage(src, label) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const name = label || src;
    const settleOk = () => {
      if (settled) return;
      settled = true;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) resolve(img);
      else reject(new Error(`${name}: image is broken or empty`));
    };
    const settleFail = () => {
      if (settled) return;
      settled = true;
      reject(new Error(`${name}: could not be decoded as an image`));
    };
    img.onload = settleOk;
    img.onerror = settleFail;
    img.decoding = 'async';
    img.src = src;
    if (img.complete) settleOk();
  });
}

function byId(id) {
  return document.getElementById(id);
}

function setStatus(message, isError) {
  const el = byId('status');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('is-error', Boolean(isError));
}

let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (!ctx) return;
    drawCover(ctx, canvas.width, canvas.height, state);
  });
}

function applyPreviewSize(size) {
  if (!canvas || !size) return;
  state.size = { w: size.w, h: size.h };
  canvas.width = size.w;
  canvas.height = size.h;
  document.querySelectorAll('.size-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.size === `${size.w}x${size.h}`);
  });
  requestRender();
}

function selectedPanel() {
  return state.panels[state.selected] || state.panels[0];
}

/* ------------------------------------------------------------------ */
/* Film strip                                                          */
/* ------------------------------------------------------------------ */

function buildFilmstrip() {
  const strip = byId('filmstrip');
  if (!strip) return;
  strip.textContent = '';
  state.panels.forEach((panel, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'frame-btn';
    btn.dataset.index = String(index);
    btn.title = `Select frame ${index + 1}`;
    const thumb = document.createElement('canvas');
    thumb.width = 120;
    thumb.height = 120;
    btn.appendChild(thumb);
    const num = document.createElement('span');
    num.className = 'frame-num';
    num.textContent = String(index + 1).padStart(2, '0');
    btn.appendChild(num);
    btn.addEventListener('click', () => selectPanel(index));
    strip.appendChild(btn);
  });
  refreshFilmstrip();
}

function refreshFilmstrip() {
  const strip = byId('filmstrip');
  if (!strip) return;
  const visible = panelCount(state.layout);
  Array.from(strip.children).forEach((btn, index) => {
    const panel = state.panels[index];
    const thumb = btn.querySelector('canvas');
    btn.classList.toggle('is-active', index === state.selected);
    btn.classList.toggle('is-empty', !panel.img);
    btn.title = index < visible ? `Frame ${index + 1}` : `Frame ${index + 1} (unused in this layout)`;
    if (thumb) {
      const tctx = thumb.getContext('2d');
      drawPanelThumb(tctx, thumb.width, thumb.height, panel, state.grade);
    }
  });
  const label = byId('selected-label');
  if (label) {
    const panel = selectedPanel();
    label.textContent = `Frame ${String(state.selected + 1).padStart(2, '0')} selected${panel.img ? '' : ' — empty'}`;
  }
}

function selectPanel(index) {
  state.selected = Math.max(0, Math.min(state.panels.length - 1, index));
  syncPanelControls();
  refreshFilmstrip();
  requestRender();
}

function syncPanelControls() {
  const panel = selectedPanel();
  const zoom = byId('panel-zoom');
  const panX = byId('panel-pan-x');
  const panY = byId('panel-pan-y');
  if (zoom) zoom.value = String(panel.zoom);
  if (panX) panX.value = String(panel.panX);
  if (panY) panY.value = String(panel.panY);
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

function syncUI() {
  const map = {
    layout: state.layout,
    grade: state.grade,
    headline: state.headline,
    kicker: state.kicker,
    caption: state.caption,
    tracking: state.tracking
  };
  Object.entries(map).forEach(([id, value]) => {
    const el = byId(id);
    if (!el) return;
    if (el.type === 'range' || el.tagName === 'SELECT') el.value = String(value);
    else el.value = String(value);
  });
  document.querySelectorAll('#align button').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.align === state.align);
  });
  document.querySelectorAll('.size-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.size === `${state.size.w}x${state.size.h}`);
  });
  ['grain', 'halftone', 'vignette'].forEach((key) => {
    const el = byId(`fx-${key}`);
    if (el) el.checked = state.effects[key] !== false;
  });
  syncPanelControls();
}

function bindUI() {
  const file = byId('file');
  const pick = byId('pick');
  if (pick && file) {
    pick.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      if (file.files && file.files.length) addFiles(file.files);
      file.value = '';
    });
  }

  const layout = byId('layout');
  if (layout) {
    layout.addEventListener('change', () => {
      state.layout = layout.value;
      refreshFilmstrip();
      requestRender();
    });
  }

  const grade = byId('grade');
  if (grade) {
    grade.addEventListener('change', () => setGrade(grade.value));
  }

  const headline = byId('headline');
  if (headline) {
    headline.addEventListener('input', () => {
      state.headline = headline.value.toUpperCase().slice(0, 60);
      requestRender();
    });
  }

  const kicker = byId('kicker');
  if (kicker) {
    kicker.addEventListener('input', () => {
      state.kicker = kicker.value.slice(0, 64);
      requestRender();
    });
  }

  const caption = byId('caption');
  if (caption) {
    caption.addEventListener('input', () => {
      state.caption = caption.value.slice(0, 90);
      requestRender();
    });
  }

  const tracking = byId('tracking');
  if (tracking) {
    tracking.addEventListener('input', () => {
      state.tracking = Number(tracking.value) || 0;
      requestRender();
    });
  }

  document.querySelectorAll('#align button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.align = btn.dataset.align || 'left';
      document.querySelectorAll('#align button').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      requestRender();
    });
  });

  ['grain', 'halftone', 'vignette'].forEach((key) => {
    const el = byId(`fx-${key}`);
    if (!el) return;
    el.addEventListener('change', () => {
      state.effects[key] = el.checked;
      requestRender();
    });
  });

  const zoom = byId('panel-zoom');
  if (zoom) {
    zoom.addEventListener('input', () => {
      selectedPanel().zoom = Math.max(1, Math.min(3, Number(zoom.value) || 1));
      requestRender();
    });
  }
  const panX = byId('panel-pan-x');
  if (panX) {
    panX.addEventListener('input', () => {
      selectedPanel().panX = Math.max(-1, Math.min(1, Number(panX.value) || 0));
      requestRender();
    });
  }
  const panY = byId('panel-pan-y');
  if (panY) {
    panY.addEventListener('input', () => {
      selectedPanel().panY = Math.max(-1, Math.min(1, Number(panY.value) || 0));
      requestRender();
    });
  }
  const reset = byId('reset-panel');
  if (reset) {
    reset.addEventListener('click', () => {
      const panel = selectedPanel();
      panel.zoom = 1;
      panel.panX = 0;
      panel.panY = 0;
      syncPanelControls();
      requestRender();
    });
  }

  const sizes = byId('sizes');
  if (sizes) {
    sizes.addEventListener('click', (event) => {
      const btn = event.target.closest('.size-btn');
      if (!btn) return;
      const size = RENDER_SIZES[btn.dataset.size];
      if (size) applyPreviewSize(size);
    });
  }

  const exportBtn = byId('export');
  if (exportBtn) exportBtn.addEventListener('click', () => exportPng(state.size));

  const shuffle = byId('shuffle');
  if (shuffle) shuffle.addEventListener('click', shuffleCover);

  bindPointer();
  bindKeyboard();
  bindDropAndPaste();
}

function setGrade(id) {
  if (!GRADES.includes(id)) return;
  state.grade = id;
  const grade = byId('grade');
  if (grade) grade.value = id;
  refreshFilmstrip();
  requestRender();
}

function bindKeyboard() {
  const arrows = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1]
  };
  document.addEventListener('keydown', (event) => {
    const tag = (event.target && event.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();

    // Nudge the selected frame; Shift moves by a larger step.
    if (Object.prototype.hasOwnProperty.call(arrows, event.key)) {
      const [ax, ay] = arrows[event.key];
      const step = event.shiftKey ? 0.15 : 0.05;
      const panel = selectedPanel();
      panel.panX = Math.max(-1, Math.min(1, panel.panX + ax * step));
      panel.panY = Math.max(-1, Math.min(1, panel.panY + ay * step));
      syncPanelControls();
      requestRender();
      setStatus(`Frame ${String(state.selected + 1).padStart(2, '0')} nudged.`);
      event.preventDefault();
      return;
    }

    // Cycle the selected frame with [ and ].
    if (event.key === '[' || event.key === ']') {
      const step = event.key === ']' ? 1 : -1;
      selectPanel((state.selected + step + state.panels.length) % state.panels.length);
      event.preventDefault();
      return;
    }
    if (['1', '2', '3', '4'].includes(key)) {
      setGrade(GRADES[Number(key) - 1]);
      event.preventDefault();
      return;
    }
    if (key === 'e') {
      exportPng(state.size);
      event.preventDefault();
      return;
    }
    if (key === 'r') {
      shuffleCover();
      event.preventDefault();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Photo input                                                         */
/* ------------------------------------------------------------------ */

function onPanelPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * sx;
  const y = (event.clientY - rect.top) * sy;
  const rects = getPanelRects(canvas.width, canvas.height, state.layout);
  for (let i = rects.length - 1; i >= 0; i -= 1) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return { index: i, x, y, rect: r };
    }
  }
  return null;
}

function bindPointer() {
  if (!canvas) return;
  let drag = null;

  canvas.addEventListener('pointerdown', (event) => {
    const hit = onPanelPoint(event);
    if (!hit) return;
    if (hit.index !== state.selected) selectPanel(hit.index);
    const panel = state.panels[hit.index];
    drag = {
      id: event.pointerId,
      index: hit.index,
      startX: event.clientX,
      startY: event.clientY,
      panX: panel.panX,
      panY: panel.panY,
      rect: hit.rect,
      // Real overflow of the cover-fit photo, so a drag tracks the pointer 1:1.
      overflow: panelOverflow(panel, hit.rect)
    };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const panel = state.panels[drag.index];
    const scaleX = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    const scaleY = canvas.height / Math.max(1, canvas.getBoundingClientRect().height);
    const dx = (event.clientX - drag.startX) * scaleX;
    const dy = (event.clientY - drag.startY) * scaleY;
    const spanX = Math.max(8, drag.overflow.x);
    const spanY = Math.max(8, drag.overflow.y);
    panel.panX = Math.max(-1, Math.min(1, drag.panX - dx / spanX));
    panel.panY = Math.max(-1, Math.min(1, drag.panY - dy / spanY));
    syncPanelControls();
    requestRender();
  });

  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener(
    'wheel',
    (event) => {
      const hit = onPanelPoint(event);
      if (!hit) return;
      const panel = state.panels[hit.index];
      const delta = Math.sign(event.deltaY) * Math.min(0.12, Math.abs(event.deltaY) * 0.0012);
      panel.zoom = Math.max(1, Math.min(3, panel.zoom - delta));
      if (hit.index !== state.selected) selectPanel(hit.index);
      syncPanelControls();
      requestRender();
      event.preventDefault();
    },
    { passive: false }
  );
}

function bindDropAndPaste() {
  const frame = byId('hero-frame') || document.body;

  ['dragenter', 'dragover'].forEach((type) => {
    document.addEventListener(type, (event) => {
      event.preventDefault();
      document.body.classList.add('dragging');
    });
  });
  ['dragleave', 'dragend'].forEach((type) => {
    document.addEventListener(type, (event) => {
      if (event.relatedTarget) return;
      document.body.classList.remove('dragging');
    });
  });
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    document.body.classList.remove('dragging');
    const files = event.dataTransfer ? Array.from(event.dataTransfer.files || []) : [];
    if (files.length) addFiles(files);
  });
  if (frame && frame !== document.body) {
    frame.addEventListener('dragover', (event) => event.preventDefault());
  }

  document.addEventListener('paste', (event) => {
    const data = event.clipboardData;
    if (!data) return;
    const files = Array.from(data.files || []);
    if (files.length) {
      event.preventDefault();
      addFiles(files);
    }
  });
}

function cleanLabel(name) {
  return String(name || 'FRAME')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 22)
    .toUpperCase() || 'FRAME';
}

async function addFiles(fileList) {
  const files = Array.from(fileList || []).slice(0, MAX_FILES);
  const accepted = [];
  for (const file of files) {
    const type = String(file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.has(type)) {
      setStatus(`${file.name || 'file'}: unsupported type — use JPEG, PNG, WebP or GIF.`, true);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus(`${file.name || 'file'}: too large — 20 MB maximum.`, true);
      continue;
    }
    if (file.size === 0) {
      setStatus(`${file.name || 'file'}: empty file.`, true);
      continue;
    }
    accepted.push(file);
  }
  if (!accepted.length) return;

  setStatus(`Loading ${accepted.length} photo${accepted.length === 1 ? '' : 's'}…`);
  let index = state.selected;
  let loaded = 0;
  for (const file of accepted) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url, file.name);
      const panel = state.panels[index];
      panel.img = img;
      panel.zoom = 1;
      panel.panX = 0;
      panel.panY = 0;
      panel.label = cleanLabel(file.name);
      state.selected = index;
      loaded += 1;
      index = (index + 1) % panelCount(state.layout);
    } catch (error) {
      setStatus(error.message || 'Photo could not be loaded.', true);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (loaded) {
    const hint = byId('drop-hint');
    if (hint) hint.hidden = true;
    setStatus(`Loaded ${loaded} photo${loaded === 1 ? '' : 's'}. Drag inside a frame to pan.`);
  }
  syncPanelControls();
  refreshFilmstrip();
  requestRender();
}

/* ------------------------------------------------------------------ */
/* Export + shuffle                                                    */
/* ------------------------------------------------------------------ */

function slugFor(size) {
  return `midnight-marquee-${size.w}x${size.h}.png`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

let exporting = false;

async function exportPng(size) {
  if (exporting) {
    setStatus('Still encoding the previous PNG…');
    return;
  }
  const target = size && size.w ? size : state.size;
  exporting = true;
  const exportBtn = byId('export');
  if (exportBtn) exportBtn.disabled = true;
  setStatus(`Encoding ${target.w} × ${target.h} PNG…`);
  const offscreen = document.createElement('canvas');
  offscreen.width = target.w;
  offscreen.height = target.h;
  const octx = offscreen.getContext('2d', { alpha: false });
  if (!octx) {
    setStatus('Canvas 2D is unavailable — export failed.', true);
    return;
  }
  drawCover(octx, target.w, target.h, state);
  try {
    const blob = await new Promise((resolve, reject) => {
      offscreen.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('PNG encoding failed'));
      }, 'image/png');
    });
    downloadBlob(blob, slugFor(target));
    setStatus(`Exported ${target.w} × ${target.h} PNG (${Math.round(blob.size / 1024)} KB).`);
  } catch (error) {
    setStatus(`Export failed: ${error.message}`, true);
  } finally {
    exporting = false;
    if (exportBtn) exportBtn.disabled = false;
  }
}

function shuffleCover() {
  state.seed = Math.floor(Math.random() * 999983) + 17;
  state.panels.forEach((panel) => {
    panel.zoom = 1 + Math.random() * 0.9;
    panel.panX = (Math.random() * 2 - 1) * 0.55;
    panel.panY = (Math.random() * 2 - 1) * 0.45;
  });
  syncPanelControls();
  refreshFilmstrip();
  requestRender();
  setStatus('Shuffled framing. R again for another take.');
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  buildFilmstrip();
  bindUI();
  syncUI();

  const shot = parseShot();
  if (shot) {
    const ran = await maybeRunShot({ shot, state, loadImage });
    if (ran) {
      // Sync the studio chrome with the shot preset (film-strip thumbs follow the grade).
      syncUI();
      refreshFilmstrip();
      return;
    }
  }

  requestRender();
  setStatus('Ready. Drop a photo or pick one to begin.');
}

boot().catch((error) => {
  setStatus(`Studio error: ${error.message}`, true);
});
