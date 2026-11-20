// Midnight Marquee — deterministic shot scenes.
// Booted by main.js when the URL carries ?shot=...  Supports exactly:
//   ?shot=cover&photo=pier&caption=Sunset%20Heist&size=1080x1080
//   ?shot=editor&photo=boulevard&caption=Boulevard%20Queen
//   ?shot=cover&photo=boulevard&caption=Neon%20Nights&preset=neon&size=1920x1080
// Samples load only from ./samples/<pier|boulevard>.jpg (allow-listed).
// The cover-shot page is drawn once and frozen; the editor shot stays live.

import { drawCover, loadImage, PANEL_COUNT, GRADES, DEFAULT_GRADE, DEFAULT_LAYOUT } from './cover.js';

const SAMPLE_PHOTOS = ['pier', 'boulevard'];
const SHOT_SIZES = ['1080x1080', '1080x1350', '1920x1080'];
const DEFAULT_COVER_SIZE = '1080x1080';

export async function startShot(params, env) {
  const mode = params.get('shot');
  if (mode !== 'cover' && mode !== 'editor') {
    env.showError('Unknown shot scene. Use shot=cover or shot=editor.');
    return 'error';
  }

  // Photo parameter: strict allow-list; anything else falls back visibly.
  const photoParam = params.get('photo') || 'pier';
  const photoName = SAMPLE_PHOTOS.includes(photoParam) ? photoParam : null;
  if (!photoName) {
    env.showError(`Unknown photo "${photoParam}" \u2014 using pier.jpg. Allowed: pier, boulevard.`);
  }
  const sampleUrl = `./samples/${photoName || 'pier'}.jpg`;

  // Caption: trimmed, bounded; used as the poster title.
  const caption = (params.get('caption') || '').trim().slice(0, 60);

  // Preset: grade allow-list; anything else falls back visibly to sunset.
  const presetParam = params.get('preset');
  const grade = GRADES.includes(presetParam) ? presetParam : null;
  if (presetParam && !grade) {
    env.showError(`Unknown preset "${presetParam}" \u2014 using sunset. Allowed: ${GRADES.join(', ')}.`);
  }

  let img;
  try {
    img = await loadImage(sampleUrl);
  } catch (err) {
    env.showError(`Sample image failed to load: ${sampleUrl} (${err.message})`);
    return 'error';
  }

  if (mode === 'cover') {
    // Size: allow-list; anything else falls back visibly to 1080x1080.
    const sizeParam = params.get('size') || DEFAULT_COVER_SIZE;
    const sizeOk = /^(\d{3,4})x(\d{3,4})$/.test(sizeParam) && SHOT_SIZES.includes(sizeParam);
    if (!sizeOk) {
      env.showError(`Unknown size "${sizeParam}" \u2014 using 1080x1080. Allowed: ${SHOT_SIZES.join(', ')}.`);
    }
    const [w, h] = (sizeOk ? sizeParam : DEFAULT_COVER_SIZE).split('x').map(Number);
    env.canvas.width = w;
    env.canvas.height = h;

    const slotCount = PANEL_COUNT[DEFAULT_LAYOUT] || 3;
    drawCover(env.canvas.getContext('2d'), w, h, {
      title: caption || 'Midnight Marquee',
      kicker: 'MIDNIGHT MARQUEE PRESENTS',
      caption: 'OFFLINE PREVIEW \u00B7 35MM',
      align: 'left',
      tracking: 6,
      grade: grade || DEFAULT_GRADE,
      layout: DEFAULT_LAYOUT,
      photos: [{ img, name: `${photoName || 'pier'}.jpg`, url: sampleUrl }],
      panels: Array.from({ length: slotCount }, () => ({ photoIndex: 0, pan: { x: 0.5, y: 0.5 }, zoom: 1 })),
      selected: -1,
      effects: { grain: true, halftone: false, vignette: true },
    });
    env.freezeCover();
    env.setStatus(`Cover shot: ${photoName || 'pier'}.jpg \u00B7 ${grade || DEFAULT_GRADE} \u00B7 ${w}\u00D7${h}`);
    return 'frozen';
  }

  // Editor shot: full live editor with the sample repeated across every panel.
  env.startEditor(
    [{ img, name: `${photoName || 'pier'}.jpg`, url: sampleUrl, objUrl: null }],
    {
      title: caption || 'Midnight Marquee',
      kicker: 'TONIGHT AT THE MARQUEE',
      caption: 'A MIDNIGHT MARQUEE PICTURE \u00B7 35MM',
    },
  );
  env.setStatus(`Editor shot: ${photoName || 'pier'}.jpg on every panel.`);
  return 'editor';
}
