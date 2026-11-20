import { drawCover, LAYOUTS } from './cover.js';
import { applyShot } from './shots.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#preview-canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const stage = $('#canvas-stage');
const state = {
  images: [], panels: [], layout: 'big-left-with-two-right', headline: 'SUNSET STORIES', kicker: 'A STORY AFTER DARK',
  align: 'left', tracking: .02, grade: 'sunset', effects: { grain: true, halftone: true, vignette: true },
  selectedPanel: 0, exportSize: '1080x1080',
};
let imageFiles = [];
let selectedPhoto = 0;
let zoomScale = 1;
let dragging = null;
let toastTimer;
let exportReturnFocus = null;
let frozenShot = false;
let renderQueued = false;

function dimensions(size = state.exportSize) {
  const [w, h] = size.split('x').map(Number);
  return { w, h };
}
function ensurePanels() {
  const count = LAYOUTS[state.layout].length;
  while (state.panels.length < count) state.panels.push({ imageIndex: state.panels.length, panX: 0, panY: 0, zoom: 1.04 });
  state.panels.length = count;
  state.selectedPanel = Math.min(state.selectedPanel, count - 1);
}
function announce(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}
function queueRender() {
  if (frozenShot || renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderPreview(); });
}
function renderPreview() {
  const { w, h } = dimensions();
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.clearRect(0, 0, w, h);
  drawCover(ctx, w, h, state);
  canvas.setAttribute('aria-label', `${state.headline || 'Untitled cover'}, ${w} by ${h} pixels`);
  $('#canvas-dimensions').textContent = `${w} × ${h}`;
  stage.style.setProperty('--shot-ratio', String(w / h));
  stage.classList.toggle('has-images', state.images.length > 0);
  stage.classList.toggle('is-zoomed', zoomScale !== 1);
  if (!document.body.classList.contains('shot-mode')) drawSelection();
}
function drawSelection() {
  if (!state.images.length) return;
  const { w, h } = dimensions(), box = LAYOUTS[state.layout][state.selectedPanel];
  if (!box) return;
  ctx.save(); ctx.strokeStyle = 'rgba(255,224,190,.94)'; ctx.lineWidth = Math.max(1, w * .002); ctx.setLineDash([w * .009, w * .006]);
  ctx.strokeRect(box.x * w + ctx.lineWidth, box.y * h + ctx.lineWidth, box.w * w - ctx.lineWidth * 2, box.h * h - ctx.lineWidth * 2); ctx.restore();
}
function updatePhotoStrip() {
  const strip = $('#photo-strip'); strip.replaceChildren();
  state.images.forEach((image, index) => {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `photo-thumb${index === selectedPhoto ? ' active' : ''}`;
    button.setAttribute('aria-label', `Use photo ${index + 1} in selected panel`);
    const thumb = document.createElement('img'); thumb.src = image.src; thumb.alt = ''; button.append(thumb);
    button.addEventListener('click', () => assignPhoto(index)); strip.append(button);
  });
  $('#photo-count').textContent = `${state.images.length} ${state.images.length === 1 ? 'image' : 'images'}`;
}
function setPanel(index) {
  state.selectedPanel = Math.max(0, Math.min(index, LAYOUTS[state.layout].length - 1));
  if (state.images.length) selectedPhoto = ((state.panels[state.selectedPanel].imageIndex % state.images.length) + state.images.length) % state.images.length;
  updatePhotoStrip(); queueRender();
}
function assignPhoto(index) {
  if (!state.images.length) return;
  selectedPhoto = (index + state.images.length) % state.images.length;
  Object.assign(state.panels[state.selectedPanel], { imageIndex: selectedPhoto, panX: 0, panY: 0, zoom: 1.04 });
  updatePhotoStrip(); queueRender();
}
function createImage(file) {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file), image = new Image();
    image.onload = () => resolve({ image, src });
    image.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Unsupported image')); };
    image.src = src;
  });
}
async function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('image/'));
  if (!files.length) { announce('Choose an image file to get started.'); return; }
  const results = await Promise.allSettled(files.map(createImage));
  const fresh = results.filter((item) => item.status === 'fulfilled').map((item) => item.value);
  const rejected = results.length - fresh.length;
  if (!fresh.length) { announce('Those images could not be opened.'); return; }
  const first = state.images.length;
  state.images.push(...fresh.map((item) => item.image)); imageFiles.push(...fresh);
  if (!first) { ensurePanels(); state.panels.forEach((panel, index) => { panel.imageIndex = index % state.images.length; }); }
  selectedPhoto = Math.min(first, state.images.length - 1);
  state.panels[state.selectedPanel].imageIndex = selectedPhoto;
  updatePhotoStrip(); queueRender(); announce(`${fresh.length} ${fresh.length === 1 ? 'photo' : 'photos'} added${rejected ? ` · ${rejected} could not be opened` : ''}.`);
}
function hitPanel(event) {
  const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
  return LAYOUTS[state.layout].findIndex((box) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
}
function panBy(dx, dy) {
  const box = LAYOUTS[state.layout][state.selectedPanel], panel = state.panels[state.selectedPanel];
  const image = state.images[((panel.imageIndex % state.images.length) + state.images.length) % state.images.length];
  if (!image || !box) return;
  const rect = canvas.getBoundingClientRect(), pw = box.w * rect.width, ph = box.h * rect.height;
  const fit = Math.max(pw / image.width, ph / image.height) * panel.zoom;
  const overX = Math.max(0, image.width * fit - pw), overY = Math.max(0, image.height * fit - ph);
  if (overX) panel.panX = Math.max(-1, Math.min(1, panel.panX + dx * 2 / overX));
  if (overY) panel.panY = Math.max(-1, Math.min(1, panel.panY + dy * 2 / overY));
  queueRender();
}
function setGrade(grade, repaint = true) {
  state.grade = grade;
  document.querySelectorAll('.grade-option').forEach((button) => { const active = button.dataset.grade === grade; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  if (repaint) queueRender();
}
function setLayout(layout, repaint = true) {
  state.layout = layout; ensurePanels();
  document.querySelectorAll('.layout-option').forEach((button) => { const active = button.dataset.layout === layout; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  $('#preview-mode').textContent = ({ 'big-left-with-two-right': 'FEATURE CUT', '2x2': 'FOUR FRAME', 'full-bleed': 'FULL BLEED', 'tall-3-stack': 'THREE UP', '4-strip': 'FOUR STRIP' })[layout];
  selectedPhoto = state.panels[state.selectedPanel]?.imageIndex || 0; updatePhotoStrip(); if (repaint) queueRender();
}
function shufflePhotos() {
  if (state.images.length < 2) { announce(state.images.length ? 'Add another photo to shuffle.' : 'Add photos to shuffle your cover.'); return; }
  for (let i = state.images.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [state.images[i], state.images[j]] = [state.images[j], state.images[i]]; [imageFiles[i], imageFiles[j]] = [imageFiles[j], imageFiles[i]]; }
  state.panels.forEach((panel) => { panel.imageIndex = Math.floor(Math.random() * state.images.length); panel.panX = 0; panel.panY = 0; });
  selectedPhoto = state.panels[state.selectedPanel]?.imageIndex || 0; updatePhotoStrip(); queueRender(); announce('A fresh arrangement, just like that.');
}
function openExport() {
  const dialog = $('#export-dialog');
  if (dialog.hidden) exportReturnFocus = document.activeElement;
  dialog.hidden = false;
  $('#dialog-export').focus();
}
function closeExport() {
  $('#export-dialog').hidden = true;
  if (exportReturnFocus?.isConnected) exportReturnFocus.focus();
  exportReturnFocus = null;
}
function setExportSize(size, repaint = true) {
  state.exportSize = size;
  document.querySelectorAll('.size-option').forEach((button) => { const active = button.dataset.size === size; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  if (repaint) queueRender();
}
function exportPng() {
  const button = $('#dialog-export'), { w, h } = dimensions();
  const output = document.createElement('canvas'); output.width = w; output.height = h;
  button.disabled = true; button.textContent = 'Preparing your PNG…';
  try {
    drawCover(output.getContext('2d', { alpha: false }), w, h, state);
    output.toBlob((blob) => {
      button.disabled = false; button.innerHTML = 'Download PNG <span>↓</span>';
      if (!blob) { announce('PNG export failed. Try another canvas size.'); return; }
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `afterglow-${w}x${h}.png`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500); closeExport(); announce(`Your ${w} × ${h} cover is ready.`);
    }, 'image/png');
  } catch (error) {
    console.error('PNG export failed:', error);
    button.disabled = false; button.innerHTML = 'Download PNG <span>↓</span>';
    announce('PNG export failed. Try another canvas size.');
  }
}
function bindEditor() {
  window.addEventListener('pagehide', () => imageFiles.forEach((item) => URL.revokeObjectURL(item.src)), { once: true });
  $('#photo-input').addEventListener('change', (event) => { addFiles(event.target.files); event.target.value = ''; });
  $('#empty-add-button').addEventListener('click', () => $('#photo-input').click());
  const dropzone = $('#dropzone');
  ['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.remove('is-over'); }));
  dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
  window.addEventListener('dragover', (event) => event.preventDefault()); window.addEventListener('drop', (event) => event.preventDefault());
  window.addEventListener('paste', (event) => { const files = [...(event.clipboardData?.items || [])].map((item) => item.getAsFile()).filter(Boolean); if (files.length) { event.preventDefault(); addFiles(files); } });
  $('#layout-grid').addEventListener('click', (event) => { const button = event.target.closest('[data-layout]'); if (button) setLayout(button.dataset.layout); });
  $('#grade-grid').addEventListener('click', (event) => { const button = event.target.closest('[data-grade]'); if (button) setGrade(button.dataset.grade); });
  $('#headline').addEventListener('input', (event) => { state.headline = event.target.value; queueRender(); });
  $('#kicker').addEventListener('input', (event) => { state.kicker = event.target.value; queueRender(); });
  $('#tracking').addEventListener('input', (event) => { const value = Number(event.target.value); state.tracking = value / 100; $('#tracking-value').textContent = `${value > 0 ? '+' : ''}${value}`; queueRender(); });
  document.querySelectorAll('.align-button').forEach((button) => button.addEventListener('click', () => { state.align = button.dataset.align; document.querySelectorAll('.align-button').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); }); queueRender(); }));
  document.querySelectorAll('[data-effect]').forEach((input) => input.addEventListener('change', () => { state.effects[input.dataset.effect] = input.checked; queueRender(); }));
  canvas.addEventListener('pointerdown', (event) => { const index = hitPanel(event); if (index < 0) return; setPanel(index); if (!state.images.length) return; canvas.setPointerCapture(event.pointerId); dragging = { x: event.clientX, y: event.clientY, id: event.pointerId }; stage.classList.add('is-dragging'); });
  canvas.addEventListener('pointermove', (event) => { if (!dragging || dragging.id !== event.pointerId) return; panBy(event.clientX - dragging.x, event.clientY - dragging.y); dragging.x = event.clientX; dragging.y = event.clientY; });
  const finishDrag = () => { dragging = null; stage.classList.remove('is-dragging'); };
  canvas.addEventListener('pointerup', finishDrag); canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('dblclick', (event) => { const index = hitPanel(event); if (index >= 0) { setPanel(index); assignPhoto(selectedPhoto + 1); } });
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); if (!state.images.length) return; const index = hitPanel(event); if (index >= 0) setPanel(index); const panel = state.panels[state.selectedPanel]; panel.zoom = Math.max(1, Math.min(3.5, panel.zoom * Math.exp(-event.deltaY * .001))); queueRender(); }, { passive: false });
  $('#shuffle-button').addEventListener('click', shufflePhotos);
  $('#zoom-in').addEventListener('click', () => { zoomScale = Math.min(1.45, zoomScale + .1); canvas.style.transform = `scale(${zoomScale})`; $('#zoom-readout').textContent = `${Math.round(zoomScale * 100)}%`; stage.classList.toggle('is-zoomed', zoomScale !== 1); });
  $('#zoom-out').addEventListener('click', () => { zoomScale = Math.max(.8, zoomScale - .1); canvas.style.transform = `scale(${zoomScale})`; $('#zoom-readout').textContent = zoomScale === 1 ? 'FIT' : `${Math.round(zoomScale * 100)}%`; stage.classList.toggle('is-zoomed', zoomScale !== 1); });
  $('#top-export').addEventListener('click', openExport); $('#export-button').addEventListener('click', openExport); $('#dialog-export').addEventListener('click', exportPng);
  $('#export-dialog').addEventListener('click', (event) => { if (event.target.matches('[data-close-dialog]')) closeExport(); const size = event.target.closest('[data-size]')?.dataset.size; if (size) setExportSize(size); });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#export-dialog').hidden) closeExport();
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const target = event.target; if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
    if (event.key.toLowerCase() === 'e') { event.preventDefault(); openExport(); }
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); shufflePhotos(); }
    const number = Number(event.key); if (number >= 1 && number <= 4) setGrade(['sunset', 'neon', 'noir', 'clean'][number - 1]);
  });
}
async function start() {
  ensurePanels(); const shot = new URLSearchParams(location.search).get('shot');
  if (shot) {
    const applied = await applyShot(shot, state, {
      setExportSize: (size) => setExportSize(size, false),
      setLayout: (layout) => setLayout(layout, false),
      setGrade: (grade) => setGrade(grade, false),
      updatePhotoStrip,
      loadSample: async (name) => { const image = new Image(); image.src = `./samples/${name}.jpg`; await image.decode(); state.images = [image]; state.panels = LAYOUTS[state.layout].map(() => ({ imageIndex: 0, panX: 0, panY: 0, zoom: 1.04 })); },
    });
    if (applied) {
      if (shot === 'cover') { document.body.classList.add('shot-mode'); frozenShot = true; } else bindEditor();
      renderPreview(); return;
    }
  }
  bindEditor(); renderPreview();
}
start().catch((error) => { console.error('Afterglow could not start:', error); announce('The studio could not load that scene.'); });
