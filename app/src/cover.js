// Nightpost poster painter — pure Canvas 2D, no libraries, no network, no external
// assets. Deterministic: the same state and canvas size always paint the same bytes.
//
// drawCover(ctx, w, h, state) paints, in order: vertical backdrop gradient, low sun
// with glow, procedural skyline silhouette, photo panels (cover-fit crop maths with
// per-panel pan x/y and zoom), caption over a shadow plate, then the enabled
// grain/halftone/vignette effects.

const TAU = Math.PI * 2;

/** Seeded PRNG (mulberry32) so skyline, stars and grain never depend on Math.random. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Poster layouts: fraction rects inside the content box (see layoutRects). */
export const LAYOUTS = {
  bigleft: {
    label: 'Big left · two right',
    count: 3,
    rects: [
      [0, 0, 0.625, 1],
      [0.645, 0, 0.355, 0.492],
      [0.645, 0.508, 0.355, 0.492],
    ],
  },
  grid: {
    label: 'Grid 2×2',
    count: 4,
    rects: [
      [0, 0, 0.493, 0.493],
      [0.507, 0, 0.493, 0.493],
      [0, 0.507, 0.493, 0.493],
      [0.507, 0.507, 0.493, 0.493],
    ],
  },
  bleed: { label: 'Full bleed', count: 1, full: true, rects: [[0, 0, 1, 1]] },
  stack: {
    label: 'Tall 3 stack',
    count: 3,
    rects: [
      [0, 0, 1, 0.327],
      [0, 0.3365, 1, 0.327],
      [0, 0.673, 1, 0.327],
    ],
  },
  strip: {
    label: 'Filmstrip 4',
    count: 4,
    rects: [
      [0, 0, 0.244, 1],
      [0.252, 0, 0.244, 1],
      [0.504, 0, 0.244, 1],
      [0.756, 0, 0.244, 1],
    ],
  },
};

export const GRADE_KEYS = ['sunset', 'neon', 'noir', 'clean'];

/** Grades drive every colour decision: sky, sun, skyline, accent, text, photo filter. */
const GRADES = {
  sunset: {
    sky: [
      [0, '#1b1140'],
      [0.42, '#5b2367'],
      [0.72, '#b4466c'],
      [1, '#ff9e5e'],
    ],
    sun: '#ffd9a3',
    glow: 'rgba(255,160,90,0.50)',
    skylineFar: '#2a1740',
    skyline: '#120b26',
    stars: 30,
    accent: '#ffb35c',
    text: '#fff3e4',
    filter: 'saturate(1.18) contrast(1.06)',
    wash: 'rgba(255,120,50,0.06)',
  },
  neon: {
    sky: [
      [0, '#04030c'],
      [0.5, '#160b33'],
      [0.78, '#33104f'],
      [1, '#4d1550'],
    ],
    sun: '#ff45c8',
    glow: 'rgba(255,70,205,0.45)',
    skylineFar: '#160b2b',
    skyline: '#070410',
    stars: 90,
    accent: '#3ee6ff',
    text: '#eef6ff',
    filter: 'saturate(1.35) contrast(1.12)',
    wash: 'rgba(120,30,255,0.05)',
    windows: true,
  },
  noir: {
    sky: [
      [0, '#101010'],
      [0.55, '#2a2a2a'],
      [1, '#484848'],
    ],
    sun: '#e6e6e6',
    glow: 'rgba(235,235,235,0.30)',
    skylineFar: '#1d1d1d',
    skyline: '#090909',
    stars: 50,
    accent: '#d8d8d8',
    text: '#f1f1f1',
    filter: 'grayscale(1) contrast(1.18) brightness(0.96)',
    wash: 'rgba(0,0,0,0.05)',
  },
  clean: {
    sky: [
      [0, '#d9e7f4'],
      [0.55, '#f4ecdd'],
      [1, '#f9e3c8'],
    ],
    sun: '#fffdf5',
    glow: 'rgba(255,215,150,0.55)',
    skylineFar: '#93a3b4',
    skyline: '#4e5a68',
    stars: 0,
    accent: '#1f6fd0',
    text: '#181d26',
    filter: 'saturate(1.04)',
    wash: 'rgba(90,130,190,0.04)',
  },
};

/** Panel rectangles in pixels for a layout at canvas size w×h.
 * Full bleed covers the whole canvas; every other layout sits in a content box that
 * leaves a sky band on top and a caption band at the bottom. */
export function layoutRects(layout, w, h) {
  const def = LAYOUTS[layout] ?? LAYOUTS.bigleft;
  if (def.full) return [{ x: 0, y: 0, w, h }];
  const box = { x: w * 0.05, y: h * 0.155, w: w * 0.9, h: h * 0.7 };
  return def.rects.map(([fx, fy, fw, fh]) => ({
    x: box.x + fx * box.w,
    y: box.y + fy * box.h,
    w: fw * box.w,
    h: fh * box.h,
  }));
}

const HEAD_FONT = (px) => `900 ${px}px system-ui, "Segoe UI", Arial, sans-serif`;
const KICK_FONT = (px) => `700 ${px}px system-ui, "Segoe UI", Arial, sans-serif`;

/** One row of buildings standing on a horizon near the bottom of the canvas. */
function skylineLayer(ctx, w, h, seed, color, unit, lit) {
  const rnd = mulberry32(seed);
  const horizon = h * 0.868;
  let x = -unit * 40;
  while (x < w + unit * 40) {
    const bw = unit * (24 + rnd() * 80);
    const bh = unit * (50 + rnd() * 240);
    const top = horizon - bh;
    ctx.fillStyle = color;
    ctx.fillRect(x, top, bw, h - top);
    if (rnd() < 0.3) {
      ctx.fillRect(x + bw * 0.4, top - unit * (14 + rnd() * 30), Math.max(1, unit * 3), unit * (20 + rnd() * 34));
    }
    if (lit) {
      const cols = Math.max(1, Math.floor(bw / (unit * 14)));
      const rows = Math.max(1, Math.floor(bh / (unit * 18)));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rnd() < 0.18) {
            ctx.fillStyle = rnd() < 0.7 ? lit : '#ffd980';
            ctx.globalAlpha = 0.55 + rnd() * 0.45;
            ctx.fillRect(x + unit * 5 + c * unit * 14, top + unit * 8 + r * unit * 18, unit * 6, unit * 9);
          }
        }
      }
      ctx.globalAlpha = 1;
    }
    x += bw + unit * (6 + rnd() * 22);
  }
}

/** Greedy word-wrap of one caption segment to maxW (already horizontally scaled
 * width). Keeps words and attached punctuation whole; a single word wider than the
 * whole text area is split by character so nothing escapes the plate. */
function wrapSegment(ctx, segment, maxW, SX) {
  const lines = [];
  let cur = '';
  for (const word of String(segment).split(/\s+/).filter(Boolean)) {
    for (;;) {
      const candidate = cur ? cur + ' ' + word : word;
      if (!cur || ctx.measureText(candidate).width * SX <= maxW) {
        if (!cur && ctx.measureText(word).width * SX > maxW) {
          let chunk = '';
          for (const ch of Array.from(word)) {
            if (chunk && ctx.measureText(chunk + ch).width * SX > maxW) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          cur = chunk;
        } else {
          cur = candidate;
        }
        break;
      }
      lines.push(cur);
      cur = '';
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Multi-line bold sans caption, word-wrapped and fitted to the plate, horizontally
 * scaled, over a shadow plate; kicker above. state.captionLines (optional; set by the
 * deterministic shot facade) supplies explicit display lines; otherwise the caption
 * wraps on words and explicit newlines. At most MAX_LINES caption lines are drawn and
 * every line, the kicker and the plate stay inside the plate bounds. */
function drawCaption(ctx, w, h, state, unit, g) {
  const caption = String(state.caption ?? '').trim();
  const kicker = String(state.kicker ?? '').trim().toUpperCase();
  if (!caption && !kicker) return;
  const SX = 1.16;
  const canLS = typeof ctx.letterSpacing === 'string';
  const prevLS = canLS ? ctx.letterSpacing : '0px';
  const ls = (state.tracking ?? 0) * unit + 'px';
  const maxTextW = w * 0.84;
  const MAX_LINES = 3;

  const explicit = Array.isArray(state.captionLines) && state.captionLines.length
    ? state.captionLines.map((s) => String(s ?? ''))
    : null;

  // Wrap the caption and measure the kicker at a given headline size.
  const layoutAt = (size) => {
    if (canLS) ctx.letterSpacing = ls;
    ctx.font = HEAD_FONT(size);
    const lines = [];
    for (const seg of explicit ?? caption.split('\n')) {
      lines.push(...wrapSegment(ctx, seg, maxTextW, SX));
    }
    const capW = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0) * SX;
    let kickW = 0;
    if (kicker) {
      ctx.font = KICK_FONT(size * 0.26);
      kickW = ctx.measureText(kicker).width * SX;
    }
    return { fs: size, lines, capW, kickW };
  };

  let fs = unit * 116;
  let lay = layoutAt(fs);
  // Fit width and the bounded line count: shrink until every wrapped line and the
  // kicker fit the text width, and the caption uses at most MAX_LINES lines.
  for (let i = 0; i < 40; i++) {
    const widestAll = Math.max(lay.capW, lay.kickW);
    const overW = widestAll > maxTextW;
    const overL = lay.lines.length > MAX_LINES;
    if ((!overW && !overL) || fs <= unit * 4) break;
    const f = Math.min(
      overW ? maxTextW / widestAll : 1,
      overL ? (MAX_LINES / lay.lines.length) * 0.9 : 1,
    );
    fs *= Math.max(0.5, f) * 0.985;
    lay = layoutAt(fs);
  }

  const padTop = unit * 24;
  const padBottom = unit * 30;
  const gap = unit * 12;
  // Fit height: the plate never grows past half the canvas, so it can never escape it.
  const maxTextH = h * 0.5 - padTop - padBottom;
  const textHAt = (l) =>
    (kicker ? l.fs * 0.26 + gap : 0)
    + (l.lines.length ? (l.lines.length - 1) * l.fs * 0.94 + l.fs * 0.78 : 0);
  for (let i = 0; i < 6 && textHAt(lay) > maxTextH && fs > unit * 2; i++) {
    fs *= (maxTextH / textHAt(lay)) * 0.97;
    lay = layoutAt(fs);
  }

  const lines = lay.lines;
  const lineStep = fs * 0.94;
  const padX = unit * 36;
  const textW = Math.max(lay.capW, lay.kickW);
  const plateW = textW + padX * 2;
  const headH = lines.length ? fs * 0.78 + (lines.length - 1) * lineStep : 0;
  const textH = (kicker ? fs * 0.26 + gap : 0) + headH;
  const plateH = padTop + textH + padBottom;
  const marginX = w * 0.045;
  const align = state.align ?? 'center';
  let px;
  if (align === 'left') px = marginX;
  else if (align === 'right') px = w - marginX - plateW;
  else px = (w - plateW) / 2;
  const py = h - h * 0.036 - plateH;

  ctx.save();
  const plateGrad = ctx.createLinearGradient(0, py, 0, py + plateH);
  plateGrad.addColorStop(0, 'rgba(7,9,16,0.80)');
  plateGrad.addColorStop(1, 'rgba(7,9,16,0.55)');
  ctx.fillStyle = plateGrad;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(px, py, plateW, plateH, unit * 10);
    ctx.fill();
  } else {
    ctx.fillRect(px, py, plateW, plateH);
  }
  ctx.fillStyle = g.accent;
  ctx.fillRect(px + unit * 8, py, Math.max(0, plateW - unit * 16), Math.max(2, unit * 4));

  ctx.textBaseline = 'alphabetic';
  const tx = px + padX;
  let ty = py + padTop;
  if (kicker) {
    if (canLS) ctx.letterSpacing = ls;
    ctx.font = KICK_FONT(fs * 0.26);
    ctx.fillStyle = g.accent;
    ctx.save();
    ctx.translate(tx, ty + fs * 0.26);
    ctx.scale(SX, 1);
    ctx.fillText(kicker, 0, 0);
    ctx.restore();
    ty += fs * 0.26 + gap;
  }
  if (caption || lines.length) {
    if (canLS) ctx.letterSpacing = ls;
    ctx.font = HEAD_FONT(fs);
    ctx.fillStyle = g.text;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = unit * 10;
    ctx.shadowOffsetY = unit * 4;
    ctx.translate(tx, ty + fs * 0.78);
    ctx.scale(SX, 1);
    // Per-line alignment inside the plate's text area (unscaled units).
    const textArea = lay.capW / SX;
    for (let i = 0; i < lines.length; i++) {
      const lw = ctx.measureText(lines[i]).width;
      let x0 = 0;
      if (align === 'center') x0 = (textArea - lw) / 2;
      else if (align === 'right') x0 = textArea - lw;
      ctx.fillText(lines[i], Math.max(0, x0), i * lineStep);
    }
    ctx.restore();
  }
  if (canLS) ctx.letterSpacing = prevLS;
  ctx.restore();
}

/** One photo panel: cover-fit crop, centred, then shifted by pan (fraction of panel
 * size) and scaled by zoom. Placeholder fill when the panel has no photo. */
function drawPanel(ctx, r, panel, state, g, unit, index) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  const img = panel && state.photos ? state.photos[panel.photo]?.img : null;
  if (img && img.width > 0 && img.height > 0) {
    const zoom = Math.min(6, Math.max(1, panel.zoom || 1));
    const s = Math.max(r.w / img.width, r.h / img.height) * zoom;
    const dw = img.width * s;
    const dh = img.height * s;
    const panX = Math.max(-0.75, Math.min(0.75, panel.panX || 0));
    const panY = Math.max(-0.75, Math.min(0.75, panel.panY || 0));
    const dx = r.x + (r.w - dw) / 2 + panX * r.w;
    const dy = r.y + (r.h - dh) / 2 + panY * r.h;
    ctx.filter = g.filter || 'none';
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = 'rgba(8,10,18,0.94)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(r.x, r.y + r.h - unit * 5, r.w, unit * 5);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, unit * 2);
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  if (state.showSelection && panel && index === state.selected) {
    ctx.save();
    ctx.setLineDash([unit * 10, unit * 8]);
    ctx.strokeStyle = g.accent;
    ctx.lineWidth = Math.max(2, unit * 3);
    ctx.strokeRect(r.x + unit * 4, r.y + unit * 4, r.w - unit * 8, r.h - unit * 8);
    ctx.restore();
  }
}

function fxHalftone(ctx, w, h, unit) {
  const s = Math.max(6, Math.round(unit * 9));
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const cc = c.getContext('2d');
  if (!cc) return;
  cc.fillStyle = 'rgba(0,0,0,0.55)';
  cc.beginPath();
  cc.arc(s / 2, s / 2, s * 0.22, 0, TAU);
  cc.fill();
  const pat = ctx.createPattern(c, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function fxGrain(ctx, w, h, seed) {
  const n = 180;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const cc = c.getContext('2d');
  if (!cc) return;
  const id = cc.createImageData(n, n);
  const rnd = mulberry32(seed);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = (rnd() * 255) | 0;
    id.data[i] = v;
    id.data[i + 1] = v;
    id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  cc.putImageData(id, 0, 0);
  const pat = ctx.createPattern(c, 'repeat');
  if (!pat) return;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function fxVignette(ctx, w, h) {
  const g0 = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.34, w / 2, h * 0.5, Math.hypot(w, h) * 0.62);
  g0.addColorStop(0, 'rgba(0,0,0,0)');
  g0.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.save();
  ctx.fillStyle = g0;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Paint the whole poster at logical size w×h. state: {layout, grade, caption, kicker,
 * align, tracking, effects:{grain,halftone,vignette}, photos:[{name,img}],
 * panels:[{photo,panX,panY,zoom}], selected, showSelection}. */
export function drawCover(ctx, w, h, state) {
  const g = GRADES[state.grade] ?? GRADES.sunset;
  const unit = Math.min(w, h) / 1080;
  const seed = (Math.imul(w | 0, 73856093) ^ Math.imul(h | 0, 19349663)) >>> 0;

  // 1. vertical backdrop gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  for (const [p, c] of g.sky) sky.addColorStop(p, c);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // stars over the dark grades
  if (g.stars) {
    const rnd = mulberry32(seed ^ 0x59d2);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < g.stars; i++) {
      const x = rnd() * w;
      const y = rnd() * h * 0.42;
      const s2 = unit * (1 + rnd() * 2);
      ctx.globalAlpha = 0.15 + rnd() * 0.45;
      ctx.fillRect(x, y, s2, s2);
    }
    ctx.globalAlpha = 1;
  }

  // 2. low sun with glow
  const sunX = w * 0.5;
  const sunY = h * 0.085;
  const sunR = unit * 95;
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 4.4);
  glow.addColorStop(0, g.glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = g.sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, TAU);
  ctx.fill();

  // 3. procedural skyline silhouette (far row, then near row with lit windows on neon)
  skylineLayer(ctx, w, h, seed ^ 0x51ed, g.skylineFar, unit, null);
  skylineLayer(ctx, w, h, seed ^ 0x2b1f, g.skyline, unit, g.windows ? g.accent : null);

  // 4. photo panels
  const rects = layoutRects(state.layout, w, h);
  const panels = Array.isArray(state.panels) ? state.panels : [];
  for (let i = 0; i < rects.length; i++) {
    drawPanel(ctx, rects[i], panels[i], state, g, unit, i);
  }

  // grade wash to unify the photos with the sky
  if (g.wash) {
    ctx.save();
    ctx.fillStyle = g.wash;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // 5. caption plate
  drawCaption(ctx, w, h, state, unit, g);

  // 6. enabled effects
  const fx = state.effects || {};
  if (fx.halftone) fxHalftone(ctx, w, h, unit);
  if (fx.grain) fxGrain(ctx, w, h, seed ^ 0xa17f);
  if (fx.vignette) fxVignette(ctx, w, h);
}
