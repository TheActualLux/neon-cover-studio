// Deterministic screenshot pages for Midnight Marquee.
// ?shot=cover|editor & photo & caption & preset & size

import { drawCover, panelCount } from './cover.js';

export const SAMPLE_PHOTOS = {
  pier: '/samples/pier.jpg',
  boulevard: '/samples/boulevard.jpg'
};

export const RENDER_SIZES = {
  '1080x1080': { w: 1080, h: 1080 },
  '1080x1350': { w: 1080, h: 1350 },
  '1920x1080': { w: 1920, h: 1080 }
};

export const SHOT_SEED = 8271;

function sizeFrom(input) {
  if (input && RENDER_SIZES[input]) return { key: input, ...RENDER_SIZES[input] };
  if (input) {
    const match = /^(\d{2,5})x(\d{2,5})$/.exec(input.trim());
    if (match) {
      const w = Number(match[1]);
      const h = Number(match[2]);
      if (w >= 320 && h >= 320 && w <= 4096 && h <= 4096) return { key: `${w}x${h}`, w, h };
    }
  }
  return null;
}

/** Parse the screenshot contract from a query string. */
export function parseShot(search) {
  const params = new URLSearchParams(search === undefined ? window.location.search : search);
  const mode = params.get('shot');
  if (mode !== 'cover' && mode !== 'editor') return null;

  const photo = params.get('photo');
  const caption = params.get('caption') || '';
  const preset = params.get('preset');
  const size = sizeFrom(params.get('size'));

  if (mode === 'cover' && !photo) return null;

  return {
    mode,
    photo: photo && SAMPLE_PHOTOS[photo] ? photo : null,
    caption,
    preset: preset,
    size
  };
}

function spreadPhoto(state, img) {
  const count = panelCount(state.layout);
  for (let i = 0; i < state.panels.length; i += 1) {
    const panel = state.panels[i];
    panel.img = img;
    panel.panX = i === 0 ? 0 : i % 2 === 0 ? -0.22 : 0.22;
    panel.panY = i === 1 ? -0.18 : i === 2 ? 0.16 : 0;
    panel.zoom = 1 + i * 0.05;
  }
  state.selected = 0;
  return count;
}

/** Apply a shot preset to the editor state (deterministic, no randomness). */
export function applyShotState(state, shot) {
  state.seed = SHOT_SEED;
  state.effects = { grain: true, halftone: true, vignette: true };
  state.align = 'left';
  state.tracking = 0.06;

  if (shot.mode === 'cover') {
    const landscape = shot.size ? shot.size.w > shot.size.h : false;
    state.layout = landscape ? 'big-left-with-two-right' : '2x2';
    state.size = shot.size || RENDER_SIZES['1080x1080'];
    state.headline = (shot.caption || 'Midnight Marquee').toUpperCase();
    state.kicker = 'NEON COAST PICTURES';
    state.caption = 'A midnight marquee original';
  } else {
    state.layout = 'big-left-with-two-right';
    state.size = RENDER_SIZES['1080x1350'];
    state.headline = (shot.caption || 'Boulevard Queen').toUpperCase();
    state.kicker = 'NEON COAST PICTURES / CHAPTER ONE';
    state.caption = 'Cover art study — amber and violet duotone';
  }

  if (shot.preset && ['sunset', 'neon', 'noir', 'clean'].includes(shot.preset)) {
    state.grade = shot.preset;
  } else {
    state.grade = 'sunset';
  }
  return state;
}

/**
 * Run a screenshot page. Needs the editor state and the app's strict loader.
 * Returns true when a shot was rendered (the caller should stop normal boot).
 */
export async function maybeRunShot({ shot, state, loadImage }) {
  if (!shot) return false;
  applyShotState(state, shot);

  document.body.classList.add('shot', `shot-${shot.mode}`);
  if (shot.caption) document.title = `${shot.caption} — Midnight Marquee`;

  const img = shot.photo ? await loadImage(SAMPLE_PHOTOS[shot.photo], shot.photo) : null;
  if (img) spreadPhoto(state, img);

  if (shot.mode === 'cover') {
    const app = document.getElementById('app');
    if (app && app.parentNode) app.parentNode.removeChild(app);
    const size = shot.size || RENDER_SIZES['1080x1080'];
    const canvas = document.createElement('canvas');
    canvas.id = 'shot-canvas';
    canvas.width = size.w;
    canvas.height = size.h;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    canvas.setAttribute('aria-label', state.headline);
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    drawCover(ctx, size.w, size.h, state);
    document.documentElement.dataset.shotReady = '1';
    return true;
  }

  // Editor shot: keep the whole studio, load the sample into the preview.
  const hint = document.getElementById('drop-hint');
  if (hint) hint.hidden = true;
  const preview = document.getElementById('preview');
  if (preview) {
    preview.width = state.size.w;
    preview.height = state.size.h;
    drawCover(preview.getContext('2d'), state.size.w, state.size.h, state);
  }
  document.documentElement.dataset.shotReady = '1';
  return true;
}
