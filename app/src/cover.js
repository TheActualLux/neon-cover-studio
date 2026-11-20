// Midnight Marquee — procedural cover renderer.
// Pure canvas 2D. No network, no fonts, no libraries. Deterministic per seed.

const TAU = Math.PI * 2;
const FONT = '"Arial Narrow", "Helvetica Neue", system-ui, sans-serif';

export const GRADES = ['sunset', 'neon', 'noir', 'clean'];
export const LAYOUTS = [
  'big-left-with-two-right',
  '2x2',
  'full-bleed',
  'tall-3-stack',
  '4-strip'
];

const GRADE_PRESETS = {
  sunset: {
    label: 'Sunset',
    imageFilter: 'saturate(1.16) contrast(1.06) brightness(1.02)',
    tint: ['#ff9a3c', '#7a2bd6'],
    tintAlpha: 0.34,
    tintMode: 'soft-light',
    backdrop: ['#150b19', '#301026'],
    glow: ['rgba(255,150,70,0.55)', 'rgba(255,120,60,0.0)'],
    sun: '#ffb266',
    accent: '#ffb347',
    accent2: '#a86bff',
    headline: '#fff2e0',
    caption: 'rgba(246,232,255,0.78)'
  },
  neon: {
    label: 'Neon',
    imageFilter: 'saturate(1.45) contrast(1.12) brightness(1.03)',
    tint: ['#ff4fd8', '#3a7bff'],
    tintAlpha: 0.30,
    tintMode: 'overlay',
    backdrop: ['#0a0616', '#241046'],
    glow: ['rgba(190,90,255,0.55)', 'rgba(80,60,255,0.0)'],
    sun: '#d08bff',
    accent: '#ff7ae0',
    accent2: '#5fbcff',
    headline: '#f6f0ff',
    caption: 'rgba(232,224,255,0.80)'
  },
  noir: {
    label: 'Noir',
    imageFilter: 'grayscale(1) contrast(1.24) brightness(0.96)',
    tint: ['#ffcf9a', '#6d5a86'],
    tintAlpha: 0.16,
    tintMode: 'soft-light',
    backdrop: ['#08070b', '#16141c'],
    glow: ['rgba(240,220,190,0.30)', 'rgba(240,220,190,0.0)'],
    sun: '#e8dcc8',
    accent: '#f0e2cc',
    accent2: '#9c8fb5',
    headline: '#fbf7ef',
    caption: 'rgba(231,226,218,0.74)'
  },
  clean: {
    label: 'Clean',
    imageFilter: 'saturate(1.04) contrast(1.03)',
    tint: ['#ffd9a0', '#8ea8ff'],
    tintAlpha: 0.14,
    tintMode: 'soft-light',
    backdrop: ['#0d0e14', '#1b2130'],
    glow: ['rgba(255,225,180,0.38)', 'rgba(255,225,180,0.0)'],
    sun: '#ffe7c2',
    accent: '#ffd9a0',
    accent2: '#9fc0ff',
    headline: '#fdfaf4',
    caption: 'rgba(236,238,246,0.80)'
  }
};

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function presetOf(grade) {
  return GRADE_PRESETS[grade] || GRADE_PRESETS.sunset;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** Panel rectangles for a layout, in canvas pixels. */
export function getPanelRects(w, h, layout) {
  const m = Math.min(w, h) * 0.05;
  const g = Math.min(w, h) * 0.017;
  const r = Math.min(w, h) * 0.012;
  const ax = m;
  const ay = m;
  const aw = w - m * 2;
  const ah = h - m * 2;

  if (layout === '2x2') {
    const cw = (aw - g) / 2;
    const ch = (ah - g) / 2;
    return [
      { x: ax, y: ay, w: cw, h: ch, r },
      { x: ax + cw + g, y: ay, w: cw, h: ch, r },
      { x: ax, y: ay + ch + g, w: cw, h: ch, r },
      { x: ax + cw + g, y: ay + ch + g, w: cw, h: ch, r }
    ];
  }

  if (layout === 'full-bleed') {
    return [{ x: 0, y: 0, w, h, r: 0 }];
  }

  if (layout === 'tall-3-stack') {
    const cw = (aw - g * 2) / 3;
    return [
      { x: ax, y: ay, w: cw, h: ah, r },
      { x: ax + cw + g, y: ay, w: cw, h: ah, r },
      { x: ax + (cw + g) * 2, y: ay, w: cw, h: ah, r }
    ];
  }

  if (layout === '4-strip') {
    const rh = (ah - g * 3) / 4;
    return [0, 1, 2, 3].map((i) => ({ x: ax, y: ay + (rh + g) * i, w: aw, h: rh, r }));
  }

  // big-left-with-two-right (default)
  const lw = aw * 0.585;
  const rx = ax + lw + g;
  const rw = aw - lw - g;
  const rh = (ah - g) / 2;
  return [
    { x: ax, y: ay, w: lw, h: ah, r },
    { x: rx, y: ay, w: rw, h: rh, r },
    { x: rx, y: ay + rh + g, w: rw, h: rh, r }
  ];
}

export function panelCount(layout) {
  if (layout === 'full-bleed') return 1;
  if (layout === '2x2' || layout === '4-strip') return 4;
  return 3;
}

function drawBackdrop(ctx, w, h, preset, seed) {
  const rnd = mulberry32(seed ^ 0x1d2c3b4a);

  const sky = ctx.createLinearGradient(0, 0, w, h);
  sky.addColorStop(0, preset.backdrop[0]);
  sky.addColorStop(1, preset.backdrop[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Sun glow behind the frames.
  const sx = w * 0.72;
  const sy = h * 0.26;
  const sr = Math.min(w, h) * 0.62;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
  glow.addColorStop(0, preset.glow[0]);
  glow.addColorStop(1, preset.glow[1]);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.55;
  const disc = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.min(w, h) * 0.12);
  disc.addColorStop(0, preset.sun);
  disc.addColorStop(0.55, preset.sun);
  disc.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(sx, sy, Math.min(w, h) * 0.12, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Skyline silhouette with scattered window lights.
  const baseY = h * 0.9;
  let x = -w * 0.02;
  ctx.fillStyle = 'rgba(5,3,9,0.72)';
  while (x < w) {
    const bw = w * (0.035 + rnd() * 0.075);
    const bh = h * (0.07 + rnd() * 0.22);
    const by = baseY - bh;
    ctx.fillRect(x, by, bw, bh + h * 0.2);
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.18)';
    ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.0012);
    ctx.beginPath();
    ctx.moveTo(x, by);
    ctx.lineTo(x + bw, by);
    ctx.stroke();

    const cols = Math.max(2, Math.floor(bw / (w * 0.014)));
    const rows = Math.max(3, Math.floor(bh / (h * 0.035)));
    for (let c = 0; c < cols; c += 1) {
      for (let r2 = 0; r2 < rows; r2 += 1) {
        if (rnd() > 0.26) continue;
        ctx.fillStyle = rnd() > 0.5 ? 'rgba(255, 196, 110, 0.42)' : 'rgba(168, 107, 255, 0.34)';
        ctx.fillRect(
          x + (c + 0.3) * (bw / cols),
          by + (r2 + 0.3) * (bh / rows),
          Math.max(1, bw / cols * 0.22),
          Math.max(1, bh / rows * 0.22)
        );
      }
    }
    x += bw + w * (0.004 + rnd() * 0.01);
  }

  // A thin marquee rail.
  ctx.fillStyle = 'rgba(255, 179, 71, 0.22)';
  ctx.fillRect(0, baseY + h * 0.012, w, Math.max(1, h * 0.0016));
}

function drawPanelSurface(ctx, rect, panel, preset) {
  const img = panel && panel.img;
  ctx.save();
  if (rect.r > 0) roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.r);
  else {
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.clip();

  ctx.fillStyle = '#09060e';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    const zoom = clamp(Number(panel.zoom) || 1, 1, 3);
    const base = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight);
    const s = base * zoom;
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    const maxX = Math.max(0, (dw - rect.w) / 2);
    const maxY = Math.max(0, (dh - rect.h) / 2);
    const panX = clamp(Number(panel.panX) || 0, -1, 1);
    const panY = clamp(Number(panel.panY) || 0, -1, 1);
    const dx = rect.x + (rect.w - dw) / 2 - panX * maxX;
    const dy = rect.y + (rect.h - dh) / 2 - panY * maxY;

    try {
      ctx.filter = preset.imageFilter;
    } catch (err) {
      /* filter is best-effort */
    }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.filter = 'none';

    // Amber/violet duotone pass over the photo.
    const tint = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
    tint.addColorStop(0, preset.tint[0]);
    tint.addColorStop(1, preset.tint[1]);
    ctx.save();
    ctx.globalCompositeOperation = preset.tintMode;
    ctx.globalAlpha = preset.tintAlpha;
    ctx.fillStyle = tint;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  } else {
    ctx.save();
    ctx.strokeStyle = 'rgba(168, 107, 255, 0.22)';
    ctx.lineWidth = Math.max(1, rect.w * 0.004);
    const step = Math.max(14, rect.w * 0.06);
    for (let i = -rect.h; i < rect.w; i += step) {
      ctx.beginPath();
      ctx.moveTo(rect.x + i, rect.y + rect.h);
      ctx.lineTo(rect.x + i + rect.h, rect.y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 179, 71, 0.55)';
    ctx.font = `600 ${Math.max(9, Math.min(rect.w, rect.h) * 0.055)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DROP A PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.restore();
  }

  // Inner shadow + frame edge.
  const inner = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  inner.addColorStop(0, 'rgba(8,4,14,0.34)');
  inner.addColorStop(0.28, 'rgba(8,4,14,0)');
  inner.addColorStop(1, 'rgba(8,4,14,0.46)');
  ctx.fillStyle = inner;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.34)';
  ctx.lineWidth = Math.max(1, Math.min(rect.w, rect.h) * 0.0024);
  if (rect.r > 0) roundRectPath(ctx, rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, rect.r);
  else ctx.rect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.stroke();
  ctx.restore();
}

function drawShadowPlate(ctx, rect, panel, index, unit) {
  const label = (panel && panel.label) || `FRAME ${String(index + 1).padStart(2, '0')}`;
  const num = String(index + 1).padStart(2, '0');
  const pad = unit * 0.02;
  const fs = Math.max(9, unit * 0.024);
  ctx.save();
  ctx.font = `700 ${fs}px ${FONT}`;
  const textW = ctx.measureText(`${num}  ${label}`).width;
  const plateW = Math.min(rect.w - pad * 2, textW + fs * 2.2);
  const plateH = fs * 2;
  const px = rect.x + pad;
  const py = rect.y + rect.h - plateH - pad;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
  ctx.shadowBlur = unit * 0.022;
  ctx.shadowOffsetX = unit * 0.006;
  ctx.shadowOffsetY = unit * 0.008;
  ctx.fillStyle = 'rgba(10, 6, 16, 0.84)';
  roundRectPath(ctx, px, py, plateW, plateH, fs * 0.28);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = '#ffb347';
  ctx.fillRect(px + fs * 0.55, py + plateH * 0.28, fs * 0.3, plateH * 0.44);

  ctx.fillStyle = 'rgba(255, 240, 226, 0.9)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${fs}px ${FONT}`;
  ctx.fillText(`${num}  ${label}`.slice(0, 34), px + fs * 1.15, py + plateH / 2 + fs * 0.04);
  ctx.restore();
}

function measureTracked(ctx, text, tracking) {
  let total = 0;
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i += 1) {
    total += ctx.measureText(chars[i]).width;
    if (i < chars.length - 1) total += tracking;
  }
  return total;
}

function drawTracked(ctx, text, x, baseline, tracking, align) {
  const total = measureTracked(ctx, text, tracking);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i += 1) {
    ctx.fillText(chars[i], cx, baseline);
    cx += ctx.measureText(chars[i]).width + tracking;
  }
  ctx.textAlign = prevAlign;
  return total;
}

function wrapTracked(ctx, text, maxW, tracking) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measureTracked(ctx, next, tracking) > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function fitHeadline(ctx, text, maxW, maxLines, baseSize, trackingEm) {
  let size = baseSize;
  const floor = baseSize * 0.38;
  for (; size > floor; size -= Math.max(1, baseSize * 0.03)) {
    const tracking = size * trackingEm;
    ctx.font = `800 ${size}px ${FONT}`;
    const lines = wrapTracked(ctx, text, maxW, tracking);
    if (lines.length <= maxLines) {
      const widest = lines.reduce((acc, l) => Math.max(acc, measureTracked(ctx, l, tracking)), 0);
      if (widest <= maxW) return { size, tracking, lines };
    }
  }
  const tracking = size * trackingEm;
  ctx.font = `800 ${size}px ${FONT}`;
  return { size, tracking, lines: wrapTracked(ctx, text, maxW, tracking).slice(0, maxLines + 1) };
}

function drawScrim(ctx, w, h) {
  const scrim = ctx.createLinearGradient(0, h, 0, h * 0.42);
  scrim.addColorStop(0, 'rgba(6, 3, 11, 0.94)');
  scrim.addColorStop(0.6, 'rgba(6, 3, 11, 0.62)');
  scrim.addColorStop(1, 'rgba(6, 3, 11, 0)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, h * 0.4, w, h * 0.6);

  const side = ctx.createLinearGradient(0, h, w * 0.78, h * 0.62);
  side.addColorStop(0, 'rgba(10, 5, 18, 0.55)');
  side.addColorStop(1, 'rgba(10, 5, 18, 0)');
  ctx.fillStyle = side;
  ctx.fillRect(0, h * 0.4, w * 0.8, h * 0.6);
}

function drawTextBlock(ctx, w, h, state, preset) {
  const unit = Math.min(w, h);
  const m = unit * 0.05;
  const align = state.align === 'center' || state.align === 'right' ? state.align : 'left';
  const anchorX = align === 'left' ? m * 1.3 : align === 'center' ? w / 2 : w - m * 1.3;
  const blockW = w * (align === 'center' ? 0.74 : 0.64);
  const trackingEm = clamp(Number(state.tracking) || 0.05, 0, 0.24);

  const kickerText = String(state.kicker || '').toUpperCase();
  const headlineText = String(state.headline || 'MIDNIGHT MARQUEE').toUpperCase();
  const captionText = String(state.caption || '');

  const baseSize = Math.max(26, unit * 0.112);
  const fitted = fitHeadline(ctx, headlineText, blockW, 3, baseSize, trackingEm);
  const size = fitted.size;
  const captionSize = Math.max(10, size * 0.26 * 1.05);
  const kickerSize = Math.max(9, size * 0.24);
  const captionTracking = captionSize * 0.06;
  const kickerTracking = kickerSize * trackingEm;

  const blockBottom = h - m * 1.4;
  const captionBaseline = blockBottom;
  ctx.font = `500 ${captionSize}px ${FONT}`;
  const captionLines = wrapTracked(ctx, captionText, blockW, captionTracking).slice(0, 2);
  let ruleY = captionBaseline - captionSize * 1.35;
  const ruleW = Math.max(size * 1.7, unit * 0.09);

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Caption.
  if (captionText) {
    ctx.font = `500 ${captionSize}px ${FONT}`;
    ctx.fillStyle = preset.caption;
    captionLines.forEach((line, i) => {
      drawTracked(ctx, line, anchorX, ruleY + captionSize * (1.15 + i * 1.4), captionTracking, align);
    });
  }

  // Amber → violet rule above the caption.
  const grad = ctx.createLinearGradient(anchorX, ruleY, anchorX + ruleW, ruleY);
  grad.addColorStop(0, preset.accent);
  grad.addColorStop(1, preset.accent2);
  ctx.fillStyle = grad;
  const ruleX = align === 'center' ? anchorX - ruleW / 2 : align === 'right' ? anchorX - ruleW : anchorX;
  ctx.fillRect(ruleX, ruleY, ruleW, Math.max(2, unit * 0.006));

  // Headline, drawn upward from the rule.
  const lineStep = size * 0.96;
  const lines = fitted.lines;
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = preset.headline;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = unit * 0.014;
  ctx.shadowOffsetY = unit * 0.004;
  const lastBaseline = ruleY - size * 0.75;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const baseline = lastBaseline - (lines.length - 1 - i) * lineStep;
    drawTracked(ctx, lines[i], anchorX, baseline, fitted.tracking, align);
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Kicker above the headline.
  if (kickerText) {
    ctx.font = `700 ${kickerSize}px ${FONT}`;
    ctx.fillStyle = preset.accent;
    const firstBaseline = lastBaseline - (lines.length - 1) * lineStep;
    drawTracked(ctx, kickerText, anchorX, firstBaseline - size * 1.05, kickerTracking, align);
  }

  // Catalog marker, top right.
  ctx.font = `700 ${Math.max(8, unit * 0.019)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 236, 216, 0.5)';
  ctx.textAlign = 'right';
  const marker = `MM / 2026 / ${String(state.seed || 0).slice(0, 6)}`;
  ctx.fillText(marker, w - m * 1.3, m * 1.5);
  ctx.restore();
}

function drawSprockets(ctx, w, h, preset) {
  const unit = Math.min(w, h);
  const count = Math.max(8, Math.round(w / (unit * 0.055)));
  const holeW = unit * 0.022;
  const holeH = unit * 0.014;
  const gap = w / count;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 6, 16, 0.72)';
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.2)';
  ctx.lineWidth = Math.max(1, unit * 0.0015);
  for (let i = 0; i < count; i += 1) {
    const cx = gap * (i + 0.5);
    for (const cy of [unit * 0.022, h - unit * 0.022]) {
      roundRectPath(ctx, cx - holeW / 2, cy - holeH / 2, holeW, holeH, holeH * 0.32);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = preset.accent2;
  ctx.fillRect(0, 0, w, Math.max(1, unit * 0.002));
  ctx.fillRect(0, h - Math.max(1, unit * 0.002), w, Math.max(1, unit * 0.002));
  ctx.restore();
}

let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const data = g.createImageData(size, size);
  let s = 0x9e3779b9;
  for (let i = 0; i < data.data.length; i += 4) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s |= 0;
    const v = (s >>> 24) & 0xff;
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  grainTile = canvas;
  return canvas;
}

function drawGrain(ctx, w, h) {
  const pattern = ctx.createPattern(getGrainTile(), 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawHalftone(ctx, w, h, seed) {
  const unit = Math.min(w, h);
  const step = Math.max(7, unit * 0.013);
  const rnd = mulberry32((seed ^ 0x5bf03635) >>> 0);
  ctx.save();
  ctx.fillStyle = '#ffd0a0';
  ctx.globalAlpha = 0.05;
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      const wave = Math.sin(x * 0.014 + y * 0.019);
      const r = step * 0.24 * (0.5 + 0.5 * wave) * (0.65 + 0.5 * rnd());
      if (r < 0.35) continue;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawVignette(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.24, w / 2, h * 0.5, Math.max(w, h) * 0.78);
  g.addColorStop(0, 'rgba(4, 2, 8, 0)');
  g.addColorStop(0.72, 'rgba(4, 2, 8, 0.22)');
  g.addColorStop(1, 'rgba(4, 2, 8, 0.72)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Draw a small cover-fit panel preview (film-strip thumbnail). */
export function drawPanelThumb(ctx, w, h, panel, grade) {
  const preset = presetOf(grade);
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  drawPanelSurface(ctx, { x: 0, y: 0, w, h, r: Math.min(w, h) * 0.04 }, panel, preset);
  ctx.restore();
}

/**
 * Render the full poster cover.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {object} state
 */
export function drawCover(ctx, w, h, state) {
  if (!ctx || !(w > 0) || !(h > 0)) return;
  const st = state || {};
  const preset = presetOf(st.grade);
  const layout = LAYOUTS.includes(st.layout) ? st.layout : 'big-left-with-two-right';
  const seed = Number.isFinite(Number(st.seed)) ? Number(st.seed) : 4177;
  const effects = st.effects || {};
  const panels = Array.isArray(st.panels) ? st.panels : [];

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  drawBackdrop(ctx, w, h, preset, seed);

  const rects = getPanelRects(w, h, layout);
  const unit = Math.min(w, h);
  rects.forEach((rect, i) => {
    drawPanelSurface(ctx, rect, panels[i], preset);
    if (layout !== 'full-bleed') drawShadowPlate(ctx, rect, panels[i], i, unit);
  });

  if (layout === 'full-bleed') drawSprockets(ctx, w, h, preset);

  drawScrim(ctx, w, h);
  drawTextBlock(ctx, w, h, st, preset);

  if (effects.halftone !== false) drawHalftone(ctx, w, h, seed);
  if (effects.grain !== false) drawGrain(ctx, w, h);
  if (effects.vignette !== false) drawVignette(ctx, w, h);

  ctx.restore();
}

export default drawCover;
