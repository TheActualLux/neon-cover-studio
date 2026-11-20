import { drawCover, LAYOUTS } from './cover.js';
import { runShot } from './shots.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#cover');
const ctx = canvas.getContext('2d', { alpha: false });
const status = $('#status');
const captionInput = $('#caption');
const kickerInput = $('#kicker');
const sizeInput = $('#size');
const SIZE_KEY = 'afterglow-export-size';
const VALID_SIZES = new Set(['1080x1080', '1080x1350', '1920x1080']);
try {
  const rememberedSize = localStorage.getItem(SIZE_KEY);
  if (VALID_SIZES.has(rememberedSize)) sizeInput.value = rememberedSize;
} catch { /* Storage may be disabled; the editor still works for this session. */ }
const photos = [];
const state = {
  caption: captionInput.value,
  kicker: kickerInput.value,
  grade: 'sunset',
  layout: 'big-left',
  align: 'center',
  tracking: Number($('#tracking').value),
  grain: $('#grain').checked,
  halftone: $('#halftone').checked,
  vignette: $('#vignette').checked,
  panels: Array.from({ length: 4 }, () => ({ photo: null, panX: 0, panY: 0, zoom: 1 })),
};
let selectedPanel = 0;
let selectedPhoto = null;
let frozen = false;
let dragging = null;

function activeRects() { return LAYOUTS[state.layout] || LAYOUTS['big-left']; }
function setStatus(message) { status.textContent = message; }
function currentPanel() { return state.panels[selectedPanel] || state.panels[0]; }
function updateCanvasSize(value = sizeInput.value) {
  const [width, height] = value.split('x').map(Number);
  canvas.width = width;
  canvas.height = height;
  canvas.style.aspectRatio = `${width} / ${height}`;
  canvas.setAttribute('aria-label', `${width} by ${height} cover art preview`);
}
function redraw() {
  if (frozen) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCover(ctx, canvas.width, canvas.height, state);
  $('#empty-hint').hidden = photos.length > 0;
  canvas.classList.toggle('has-photo', photos.length > 0);
}

function createImage(file, label = file.name) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url, label });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not open ${label}`));
    };
    image.src = url;
  });
}
function loadSample(name) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ image, url: new URL(`../samples/${name}.jpg`, import.meta.url).href, label: name });
    image.onerror = () => reject(new Error(`Could not load the ${name} sample`));
    image.src = new URL(`../samples/${name}.jpg`, import.meta.url).href;
  });
}
function assignPhoto(photo, panelIndex = selectedPanel) {
  const panel = state.panels[panelIndex];
  panel.photo = photo?.image || null;
  panel.panX = 0;
  panel.panY = 0;
  panel.zoom = 1;
  selectedPanel = panelIndex;
  selectedPhoto = photo;
  updatePhotoRail();
  redraw();
}
function updatePhotoRail() {
  const rail = $('#photo-rail');
  rail.replaceChildren();
  for (const photo of photos) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `photo-thumb${selectedPhoto === photo ? ' is-selected' : ''}`;
    button.title = `${photo.label} · add to selected panel`;
    button.setAttribute('aria-label', `Use ${photo.label} in selected panel`);
    const image = document.createElement('img');
    image.src = photo.url;
    image.alt = '';
    button.append(image);
    button.addEventListener('click', () => assignPhoto(photo));
    rail.append(button);
  }
  $('#photo-count').textContent = `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`;
  $('#empty-hint').hidden = photos.length > 0;
}
async function addFiles(fileList) {
  if (frozen) return;
  const files = [...fileList].filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;
  let added = 0;
  for (const file of files) {
    try {
      const photo = await createImage(file);
      photos.push(photo);
      if (added === 0) assignPhoto(photo, selectedPanel);
      added++;
    } catch (error) {
      setStatus(error.message);
    }
  }
  updatePhotoRail();
  if (added) setStatus(`${added} ${added === 1 ? 'photo' : 'photos'} ready · drag the preview to reframe`);
}
async function addSample(name) {
  try {
    let photo = photos.find((entry) => entry.label === name);
    if (!photo) {
      photo = await loadSample(name);
      photos.push(photo);
    }
    assignPhoto(photo);
    setStatus(`${name === 'pier' ? 'Pier at dusk' : 'Boulevard'} added to panel ${selectedPanel + 1}`);
  } catch (error) {
    setStatus(error.message);
  }
}

function activateGrade(grade) {
  state.grade = grade;
  document.querySelectorAll('.grade-option').forEach((button) => {
    const active = button.dataset.grade === grade;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  redraw();
}
function activateLayout(layout) {
  state.layout = layout;
  document.querySelectorAll('.layout-option').forEach((button) => {
    const active = button.dataset.layout === layout;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  selectedPanel = Math.min(selectedPanel, activeRects().length - 1);
  redraw();
}
function activateAlignment(align) {
  state.align = align;
  document.querySelectorAll('[data-align]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.align === align)));
  redraw();
}
function panelAtPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  const px = (event.clientX - bounds.left) / bounds.width;
  const py = (event.clientY - bounds.top) / bounds.height;
  return activeRects().findIndex(([x, y, width, height]) => px >= x && px <= x + width && py >= y && py <= y + height);
}
function pointerDown(event) {
  if (frozen) return;
  const index = panelAtPointer(event);
  if (index < 0) return;
  selectedPanel = index;
  const panel = currentPanel();
  dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, panel };
  canvas.setPointerCapture(event.pointerId);
  canvas.focus({ preventScroll: true });
  updatePhotoRail();
}
function pointerMove(event) {
  if (!dragging || dragging.id !== event.pointerId || !dragging.panel.photo) return;
  const bounds = canvas.getBoundingClientRect();
  const [, , nw, nh] = activeRects()[selectedPanel];
  const width = nw * canvas.width;
  const height = nh * canvas.height;
  const photo = dragging.panel.photo;
  const scale = Math.max(width / photo.naturalWidth, height / photo.naturalHeight) * dragging.panel.zoom;
  const overflowX = Math.max(1, photo.naturalWidth * scale - width);
  const overflowY = Math.max(1, photo.naturalHeight * scale - height);
  const samples = event.getCoalescedEvents?.() || [event];
  let dx = 0;
  let dy = 0;
  for (const sample of samples) {
    dx += sample.clientX - dragging.x;
    dy += sample.clientY - dragging.y;
    dragging.x = sample.clientX;
    dragging.y = sample.clientY;
  }
  if (Math.abs(dx) + Math.abs(dy) > 0) dragging.moved = true;
  dragging.panel.panX = Math.max(-1.5, Math.min(1.5, dragging.panel.panX - dx * canvas.width / bounds.width / overflowX * 2));
  dragging.panel.panY = Math.max(-1.5, Math.min(1.5, dragging.panel.panY - dy * canvas.height / bounds.height / overflowY * 2));
  redraw();
}
function pointerUp(event) {
  if (dragging && dragging.id === event.pointerId) dragging = null;
}
function wheelZoom(event) {
  if (frozen) return;
  const index = panelAtPointer(event);
  if (index < 0) return;
  event.preventDefault();
  selectedPanel = index;
  const panel = currentPanel();
  panel.zoom = Math.max(1, Math.min(3.5, panel.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
  updatePhotoRail();
  redraw();
}
function cyclePhoto() {
  if (frozen || !photos.length) return;
  const current = currentPanel().photo;
  const currentIndex = photos.findIndex((photo) => photo.image === current);
  assignPhoto(photos[(currentIndex + 1 + photos.length) % photos.length], selectedPanel);
}

function safeFilename() {
  const slug = state.caption.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'afterglow-cover';
  return slug;
}
function exportPng() {
  const [width, height] = sizeInput.value.split('x').map(Number);
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const outputContext = output.getContext('2d', { alpha: false });
  drawCover(outputContext, width, height, state);
  $('#export').disabled = true;
  setStatus(`Rendering ${width} × ${height} PNG…`);
  output.toBlob((blob) => {
    $('#export').disabled = false;
    if (!blob) {
      setStatus('PNG export failed. Please try again.');
      return;
    }
    const filename = `${safeFilename()}-${width}x${height}.png`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Saved ${filename}`);
  }, 'image/png');
}

$('#photo-input').addEventListener('change', (event) => {
  addFiles(event.target.files);
  event.target.value = '';
});
$('#dropzone').addEventListener('dragover', (event) => {
  event.preventDefault();
  $('#dropzone').classList.add('is-dragging');
});
$('#dropzone').addEventListener('dragleave', () => $('#dropzone').classList.remove('is-dragging'));
$('#dropzone').addEventListener('drop', (event) => {
  event.preventDefault();
  $('#dropzone').classList.remove('is-dragging');
  addFiles(event.dataTransfer.files);
});
document.addEventListener('dragover', (event) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
document.addEventListener('drop', (event) => { if (event.dataTransfer?.files.length && !$('#dropzone').contains(event.target)) { event.preventDefault(); addFiles(event.dataTransfer.files); } });
document.addEventListener('paste', (event) => {
  if (frozen) return;
  const files = [...(event.clipboardData?.items || [])].filter((item) => item.type.startsWith('image/')).map((item) => item.getAsFile()).filter(Boolean);
  if (files.length) addFiles(files);
});
captionInput.addEventListener('input', () => { state.caption = captionInput.value; redraw(); });
kickerInput.addEventListener('input', () => { state.kicker = kickerInput.value; redraw(); });
$('#tracking').addEventListener('input', (event) => {
  state.tracking = Number(event.target.value);
  $('#tracking-value').value = event.target.value;
  $('#tracking-value').textContent = event.target.value;
  redraw();
});
$('#size').addEventListener('change', () => {
  try { localStorage.setItem(SIZE_KEY, sizeInput.value); } catch { /* Size remains selected until this tab closes. */ }
  updateCanvasSize();
  redraw();
});
['grain', 'halftone', 'vignette'].forEach((effect) => {
  $(`#${effect}`).addEventListener('change', (event) => { state[effect] = event.target.checked; redraw(); });
});
document.querySelectorAll('.grade-option').forEach((button) => button.addEventListener('click', () => activateGrade(button.dataset.grade)));
document.querySelectorAll('.layout-option').forEach((button) => button.addEventListener('click', () => activateLayout(button.dataset.layout)));
document.querySelectorAll('[data-align]').forEach((button) => button.addEventListener('click', () => activateAlignment(button.dataset.align)));
document.querySelectorAll('[data-sample]').forEach((button) => button.addEventListener('click', () => addSample(button.dataset.sample)));
$('#export').addEventListener('click', exportPng);
canvas.addEventListener('pointerdown', pointerDown);
canvas.addEventListener('pointermove', pointerMove);
canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', pointerUp);
canvas.addEventListener('dblclick', (event) => { event.preventDefault(); cyclePhoto(); });
canvas.addEventListener('wheel', wheelZoom, { passive: false });
document.addEventListener('keydown', (event) => {
  const target = event.target;
  const editingText = target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'));
  if (editingText || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (event.key.toLowerCase() === 'e') { event.preventDefault(); exportPng(); }
  if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    if (photos.length) {
      const shuffled = [...photos];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      activeRects().forEach((_, index) => { state.panels[index].photo = shuffled[index % shuffled.length].image; state.panels[index].panX = 0; state.panels[index].panY = 0; state.panels[index].zoom = 1; });
      selectedPhoto = shuffled[0];
      updatePhotoRail();
      redraw();
      setStatus('Photos shuffled across the panels');
    }
  }
  const gradeKeys = { '1': 'sunset', '2': 'neon', '3': 'noir', '4': 'clean' };
  if (gradeKeys[event.key]) activateGrade(gradeKeys[event.key]);
});

updateCanvasSize();
updatePhotoRail();
redraw();

const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot) {
  runShot(shot, query, {
    loadSample,
    setCaption(text) { captionInput.value = text; state.caption = text; },
    setGrade(grade) { activateGrade(grade); },
    setSize(size) { sizeInput.value = size; updateCanvasSize(size); },
    setLayout: activateLayout,
    setStatus,
    prepareCover(sample) {
      photos.push(sample);
      selectedPhoto = sample;
      activeRects().forEach((_, index) => { state.panels[index].photo = sample.image; });
      updatePhotoRail();
    },
    async prepareEditor(sample) {
      for (let i = 0; i < 4; i++) {
        const photo = i === 0 ? sample : { ...sample };
        if (i > 0) photo.label = `${sample.label}-${i + 1}`;
        photos.push(photo);
        state.panels[i].photo = sample.image;
      }
      selectedPhoto = sample;
      updatePhotoRail();
    },
    redraw,
    freeze() { frozen = true; },
  }).catch((error) => setStatus(error.message));
} else {
  redraw();
}
