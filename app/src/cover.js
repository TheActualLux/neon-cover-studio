// Midnight Marquee — cover renderer.
// Draws a light-on-dark cinematic poster: deterministic duotone backdrop with a
// procedural skyline, a large hero photo panel plus a narrow vertical film-strip
// column beside it, a bottom-left title block, and optional grain / halftone /
// vignette passes applied after all content. Pure Canvas2D, no external assets.

export const GRADES = ['sunset', 'neon', 'noir', 'clean'];

export const LAYOUTS = [
  'big-left-with-two-right',
  '2x2',
  'full-bleed',
  'tall-3-stack',
  '4-strip',
];

// Slot count per layout; keep in sync with panelRects().
export const PANEL_COUNT = {
  'big-left-with-two-right': 3,
  '2x2': 4,
  'full-bleed': 1,
  'tall-3-stack': 4,
  '4-strip': 4,
};

export const DEFAULT_GRADE = 'sunset';
export const DEFAULT_LAYOUT = 'big-left-with-two-right';

// ---------------------------------------------------------------------------
// Small deterministic helpers
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Rounded rectangle that does not depend on ctx.roundRect availability.
function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Image loading — onload-based, never decode()
// ---------------------------------------------------------------------------

/**
 * Load an image and resolve on onload. Never calls img.decode().
 * Resolves immediately when img.complete && naturalWidth > 0 is already true
 * (before or right after src is set — a cached src can complete synchronously).
 * Rejects visibly on error.
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const settle = (ok, value) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      if (ok) resolve(value);
      else reject(value);
    };
    img.onload = () => settle(true, img);
    img.onerror = () => settle(false, new Error('image failed to load: ' + src));
    if (img.complete && img.naturalWidth > 0) {
      settle(true, img);
      return;
    }
    img.src = src;
    // Cached responses can finish before the load event dispatches.
    if (img.complete && img.naturalWidth > 0) {
      settle(true, img);
    }
  });
}

// ---------------------------------------------------------------------------
// Layout geometry
// ---------------------------------------------------------------------------

/**
 * Panel rects for a layout, in canvas pixels. kind: 'hero' (large frame) or
 * 'strip' (narrow vertical film-strip cell).
 */
export function panelRects(layout, w, h) {
  const m = 0.02; // outer margin
  const g = 0.014; // gutter
  const rects = [];
  switch (layout) {
    case 'big-left-with-two-right': {
      const heroW = 0.62;
      const rx = m + heroW + g;
      const rw = 1 - rx - m;
      const cellH = (1 - 2 * m - g) / 2;
      rects.push({ x: m, y: m, w: heroW, h: 1 - 2 * m, kind: 'hero' });
      rects.push({ x: rx, y: m, w: rw, h: cellH, kind: 'strip' });
      rects.push({ x: rx, y: m + cellH + g, w: rw, h: cellH, kind: 'strip' });
      break;
    }
    case 'tall-3-stack': {
      const heroW = 0.55;
      const rx = m + heroW + g;
      const rw = 1 - rx - m;
      const cellH = (1 - 2 * m - 2 * g) / 3;
      rects.push({ x: m, y: m, w: heroW, h: 1 - 2 * m, kind: 'hero' });
      for (let i = 0; i < 3; i++) {
        rects.push({ x: rx, y: m + i * (cellH + g), w: rw, h: cellH, kind: 'strip' });
      }
      break;
    }
    case '4-strip': {
      const cw = (1 - 2 * m - 3 * g) / 4;
      for (let i = 0; i < 4; i++) {
        rects.push({ x: m + i * (cw + g), y: m, w: cw, h: 1 - 2 * m, kind: 'strip' });
      }
      break;
    }
    case '2x2': {
      const cw = (1 - 2 * m - g) / 2;
      const ch = (1 - 2 * m - g) / 2;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          rects.push({ x: m + c * (cw + g), y: m + r * (ch + g), w: cw, h: ch, kind: r === 0 && c === 0 ? 'hero' : 'strip' });
        }
      }
      break;
    }
    case 'full-bleed':
    default:
      rects.push({ x: 0, y: 0, w: 1, h: 1, kind: 'hero' });
      break;
  }
  return rects.map((r) => ({
    x: Math.round(r.x * w),
    y: Math.round(r.y * h),
    w: Math.round(r.w * w),
    h: Math.round(r.h * h),
    kind: r.kind,
  }));
}

/**
 * Cover-fit geometry for one image in one rect.
 * pan is normalized: p.x, p.y in [0, 1]; 0 = image left/top edge aligned to the
 * rect, 1 = right/bottom edge aligned, 0.5 = centered. zoom >= 1.
 * Returns { sx, sy, sw, sh, dx, dy, dw, dh, scale } for drawImage plus clamped pan.
 */
export function coverGeom(img, rect, pan, zoom) {
  const z = clamp(zoom, 1, 4);
  const base = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight);
  const scale = base * z;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const maxDX = Math.max(0, dw - rect.w);
  const maxDY = Math.max(0, dh - rect.h);
  const px = clamp(pan && Number.isFinite(pan.x) ? pan.x : 0.5, 0, 1);
  const py = clamp(pan && Number.isFinite(pan.y) ? pan.y : 0.5, 0, 1);
  return {
    sx: 0,
    sy: 0,
    sw: img.naturalWidth,
    sh: img.naturalHeight,
    dx: rect.x - px * maxDX,
    dy: rect.y - py * maxDY,
    dw,
    dh,
    scale,
    maxDX,
    maxDY,
    px,
    py,
  };
}

// ---------------------------------------------------------------------------
// Grade presets
// ---------------------------------------------------------------------------

const GRADE_LOOK = {
  sunset: {
    filter: 'saturate(1.18) contrast(1.06) sepia(0.16) hue-rotate(-8deg)',
    tint: { warm: 'rgba(255,158,64,0.14)', cool: 'rgba(96,52,140,0.10)' },
    haze: 'rgba(255,170,80,0.05)',
  },
  neon: {
    filter: 'saturate(1.5) contrast(1.14)',
    tint: { warm: 'rgba(64,220,255,0.12)', cool: 'rgba(150,70,255,0.16)' },
    haze: 'rgba(160,90,255,0.06)',
  },
  noir: {
    filter: 'grayscale(1) contrast(1.35) brightness(0.92)',
    tint: { warm: 'rgba(200,210,255,0.05)', cool: 'rgba(8,8,16,0.10)' },
    haze: 'rgba(220,225,255,0.03)',
  },
  clean: {
    filter: 'saturate(1.04) contrast(1.02)',
    tint: { warm: 'rgba(255,244,230,0.03)', cool: 'rgba(20,18,34,0.05)' },
    haze: 'rgba(255,255,255,0.02)',
  },
};

// ---------------------------------------------------------------------------
// Backdrop: duotone gradient, skyline, atmosphere
// ---------------------------------------------------------------------------

function drawBackdrop(ctx, w, h, u) {
  // Base sky: deep indigo falling to near-black.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#181030');
  sky.addColorStop(0.55, '#0e0a1c');
  sky.addColorStop(1, '#060509');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Duotone glows: amber low-left, violet upper-right (soft-light, subtle).
  const amber = ctx.createRadialGradient(w * 0.18, h * 0.9, 0, w * 0.18, h * 0.9, Math.max(w, h) * 0.6);
  amber.addColorStop(0, 'rgba(255,158,64,0.20)');
  amber.addColorStop(1, 'rgba(255,158,64,0)');
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = amber;
  ctx.fillRect(0, 0, w, h);

  const violet = ctx.createRadialGradient(w * 0.82, h * 0.12, 0, w * 0.82, h * 0.12, Math.max(w, h) * 0.55);
  violet.addColorStop(0, 'rgba(150,84,255,0.22)');
  violet.addColorStop(1, 'rgba(150,84,255,0)');
  ctx.fillStyle = violet;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  // Procedural skyline silhouette along the lower third (seeded, stable).
  const rand = mulberry32(0x5eed1234);
  const horizon = h * 0.82;
  let x = -20 * u;
  ctx.fillStyle = '#0b0817';
  while (x < w + 40 * u) {
    const bw = (34 + rand() * 92) * u;
    const bh = (50 + rand() * 250) * u;
    const by = horizon - bh;
    ctx.fillRect(x, by, bw, bh + h - horizon);
    // Rooftop details: antenna or setback.
    if (rand() < 0.3) {
      ctx.fillRect(x + bw * 0.4, by - 18 * u, 3 * u, 18 * u);
    }
    // Lit windows: sparse amber dots.
    const cols = Math.max(1, Math.floor(bw / (16 * u)));
    const rows = Math.max(1, Math.floor(bh / (20 * u)));
    for (let c = 0; c < cols; c++) {
      for (let rIdx = 0; rIdx < rows; rIdx++) {
        if (rand() < 0.14) {
          ctx.fillStyle = rand() < 0.7 ? 'rgba(255,176,88,0.5)' : 'rgba(190,140,255,0.45)';
          ctx.fillRect(x + 6 * u + c * 16 * u, by + 8 * u + rIdx * 20 * u, 4 * u, 6 * u);
        }
      }
    }
    ctx.fillStyle = '#0b0817';
    x += bw + 6 * u;
  }

  // Atmosphere haze bands drifting over the skyline.
  for (let i = 0; i < 3; i++) {
    const y = horizon - (40 + i * 55) * u;
    const band = ctx.createLinearGradient(0, y, 0, y + 46 * u);
    band.addColorStop(0, 'rgba(255,170,90,0)');
    band.addColorStop(0.5, 'rgba(255,170,90,0.05)');
    band.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, y, w, 46 * u);
  }

  // Marquee moon: soft glow disc.
  const mg = ctx.createRadialGradient(w * 0.78, h * 0.16, 0, w * 0.78, h * 0.16, 90 * u);
  mg.addColorStop(0, 'rgba(255,214,150,0.5)');
  mg.addColorStop(0.25, 'rgba(255,196,120,0.18)');
  mg.addColorStop(1, 'rgba(255,196,120,0)');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.16, 90 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(246,226,190,0.9)';
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.16, 26 * u, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function drawPlaceholder(ctx, rect, u) {
  const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  g.addColorStop(0, 'rgba(24,18,42,0.9)');
  g.addColorStop(1, 'rgba(12,9,24,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // Diagonal hatch.
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,176,88,0.10)';
  ctx.lineWidth = 2 * u;
  for (let d = -rect.h; d < rect.w; d += 26 * u) {
    ctx.beginPath();
    ctx.moveTo(rect.x + d, rect.y + rect.h);
    ctx.lineTo(rect.x + d + rect.h, rect.y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(214,196,246,0.55)';
  ctx.font = `600 ${Math.round(20 * u)}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EMPTY FRAME', rect.x + rect.w / 2, rect.y + rect.h / 2);
}

function drawTint(ctx, rect, look, u) {
  // Grade tint: warm wash from one corner, cool wash from the other.
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.globalCompositeOperation = 'soft-light';
  const warm = ctx.createLinearGradient(rect.x, rect.y + rect.h, rect.x + rect.w, rect.y);
  warm.addColorStop(0, look.tint.warm);
  warm.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = warm;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const cool = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  cool.addColorStop(0, look.tint.cool);
  cool.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cool;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // Thin light leak at the panel edge keeps the duotone readable.
  ctx.globalCompositeOperation = 'source-over';
  const edge = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y);
  edge.addColorStop(0, look.haze);
  edge.addColorStop(0.2, 'rgba(0,0,0,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

function drawStripChrome(ctx, rect, u) {
  // Film strip: dark leader bands with punched sprocket holes on both edges.
  const bandW = Math.max(10, 16 * u);
  const holeW = Math.max(5, 8 * u);
  const holeH = Math.max(8, 13 * u);
  const step = holeH + Math.max(8, 12 * u);
  for (const side of ['left', 'right']) {
    const bx = side === 'left' ? rect.x : rect.x + rect.w - bandW;
    ctx.fillStyle = 'rgba(8,6,14,0.94)';
    ctx.fillRect(bx, rect.y, bandW, rect.h);
    for (let y = rect.y + step * 0.5; y + holeH <= rect.y + rect.h - 4 * u; y += step) {
      const hx = bx + (bandW - holeW) / 2;
      ctx.fillStyle = 'rgba(4,3,8,0.9)';
      rr(ctx, hx, y, holeW, holeH, Math.min(3 * u, holeW / 2));
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,176,88,0.16)';
      ctx.lineWidth = Math.max(1, u);
      ctx.stroke();
    }
  }
  // Frame line between leader and picture area.
  ctx.strokeStyle = 'rgba(255,190,110,0.14)';
  ctx.lineWidth = Math.max(1, u);
  ctx.beginPath();
  ctx.moveTo(rect.x + bandW, rect.y);
  ctx.lineTo(rect.x + bandW, rect.y + rect.h);
  ctx.moveTo(rect.x + rect.w - bandW, rect.y);
  ctx.lineTo(rect.x + rect.w - bandW, rect.y + rect.h);
  ctx.stroke();
}

function drawHeroFrame(ctx, rect, u) {
  // Thin amber frame with corner ticks for the hero panel.
  ctx.strokeStyle = 'rgba(255,190,110,0.28)';
  ctx.lineWidth = Math.max(1, 2 * u);
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  const t = 16 * u;
  ctx.strokeStyle = 'rgba(255,206,140,0.65)';
  ctx.lineWidth = Math.max(1.5, 3 * u);
  const corners = [
    [rect.x + 2, rect.y + 2, 1, 1],
    [rect.x + rect.w - 2, rect.y + 2, -1, 1],
    [rect.x + 2, rect.y + rect.h - 2, 1, -1],
    [rect.x + rect.w - 2, rect.y + rect.h - 2, -1, -1],
  ];
  for (const [cx0, cy0, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx0 + sx * t, cy0);
    ctx.lineTo(cx0, cy0);
    ctx.lineTo(cx0, cy0 + sy * t);
    ctx.stroke();
  }
}

function drawPanel(ctx, rect, slot, state, u) {
  const look = GRADE_LOOK[state.grade] || GRADE_LOOK[DEFAULT_GRADE];
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  const photo = state.photos && state.panels[slot] && state.photos[state.panels[slot].photoIndex];
  if (photo && photo.img && photo.img.naturalWidth > 0) {
    const geom = coverGeom(photo.img, rect, state.panels[slot].pan, state.panels[slot].zoom);
    ctx.filter = look.filter;
    ctx.drawImage(photo.img, geom.sx, geom.sy, geom.sw, geom.sh, geom.dx, geom.dy, geom.dw, geom.dh);
    ctx.filter = 'none';
    drawTint(ctx, rect, look, u);
  } else {
    drawPlaceholder(ctx, rect, u);
  }
  ctx.restore();

  // Selected panel gets an amber outline on top of everything in the panel.
  if (state.selected === slot) {
    ctx.strokeStyle = 'rgba(255,190,110,0.9)';
    ctx.lineWidth = Math.max(2, 3 * u);
    ctx.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
    ctx.setLineDash([8 * u, 6 * u]);
    ctx.strokeStyle = 'rgba(180,130,255,0.7)';
    ctx.lineWidth = Math.max(1, 2 * u);
    ctx.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
    ctx.setLineDash([]);
  }

  if (rect.kind === 'strip') {
    drawStripChrome(ctx, rect, u);
  } else {
    drawHeroFrame(ctx, rect, u);
  }
}

// ---------------------------------------------------------------------------
// Title block — anchored bottom-left
// ---------------------------------------------------------------------------

function wrapTitle(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = line + ' ' + words[i];
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines.slice(0, 3); // never wrap past three lines
}

function drawTitleBlock(ctx, w, h, u, state) {
  const align = state.align === 'center' ? 'center' : state.align === 'right' ? 'right' : 'left';
  const padX = Math.round(w * (align === 'center' ? 0.5 : 0.055));
  const padRight = Math.round(w * (align === 'center' ? 0.5 : 0.055));
  const titleSize = Math.round(84 * u);
  const kickerSize = Math.round(22 * u);
  const captionSize = Math.round(26 * u);
  const titleFont = `900 ${titleSize}px "Arial Black", "Segoe UI", Arial, sans-serif`;
  const tracking = clamp(Number(state.tracking) || 0, 0, 20) * u;

  // Legibility scrim over the bottom of the composition.
  const scrimTop = h * 0.52;
  const scrim = ctx.createLinearGradient(0, scrimTop, 0, h);
  scrim.addColorStop(0, 'rgba(6,4,12,0)');
  scrim.addColorStop(0.55, 'rgba(6,4,12,0.55)');
  scrim.addColorStop(1, 'rgba(6,4,12,0.88)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, scrimTop, w, h - scrimTop);

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  const title = String(state.title || '').toUpperCase().trim();
  const kicker = String(state.kicker || '').toUpperCase().trim();
  const caption = String(state.caption || '').trim();

  ctx.font = titleFont;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
  const maxTextW = w - padX - padRight - 40 * u;
  const titleLines = title ? wrapTitle(ctx, title, maxTextW) : [];
  const lineH = Math.round(titleSize * 1.04);

  const captionH = caption ? captionSize + 14 * u : 0;
  const kickerH = kicker ? kickerSize + 10 * u : 0;
  const blockH = kickerH + titleLines.length * lineH + captionH;

  let y = h - 52 * u - blockH + kickerSize; // baseline of kicker

  if (kicker) {
    ctx.font = `700 ${kickerSize}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = '#ffb454';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.max(2, tracking * 0.9)}px`;
    ctx.fillText(kicker, padX, y);
  }

  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
  ctx.font = titleFont;
  ctx.fillStyle = '#f5f2ff';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 14 * u;
  ctx.shadowOffsetY = 3 * u;
  let ty = y + kickerH + lineH * 0.82;
  for (const lineText of titleLines) {
    ctx.fillText(lineText, padX, ty);
    ty += lineH;
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (caption) {
    ctx.font = `500 ${captionSize}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = 'rgba(185,168,216,0.92)';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.max(1, tracking * 0.4)}px`;
    ctx.fillText(caption, padX, ty - lineH + captionSize + 8 * u);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Effects — always applied after all content
// ---------------------------------------------------------------------------

let grainTile = null;

function getGrainTile() {
  if (grainTile) return grainTile;
  const size = 160;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const cx = c.getContext('2d');
  const img = cx.createImageData(size, size);
  const rand = mulberry32(0x9e3779b9);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.round(rand() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

function drawEffects(ctx, w, h, u, effects) {
  if (!effects) return;
  if (effects.halftone) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(12,8,22,0.30)';
    const step = Math.max(6, 11 * u);
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        const t = 0.5 + 0.5 * Math.sin(x * 0.021) * Math.cos(y * 0.017);
        const r = t * step * 0.30;
        if (r <= 0.2) continue;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  if (effects.grain) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.09;
    const pattern = ctx.createPattern(getGrainTile(), 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }
  if (effects.vignette) {
    const diag = Math.hypot(w, h);
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.42, diag * 0.22, w * 0.5, h * 0.42, diag * 0.62);
    vg.addColorStop(0, 'rgba(4,3,8,0)');
    vg.addColorStop(1, 'rgba(4,3,8,0.58)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Draw the whole poster onto ctx at w×h from state:
 * {
 *   title, kicker, caption,        // strings
 *   align,                         // 'left' | 'center' | 'right'
 *   tracking,                      // 0..20 letter-spacing units
 *   grade,                         // 'sunset' | 'neon' | 'noir' | 'clean'
 *   layout,                        // one of LAYOUTS
 *   photos,                        // [{ img, name, url }]
 *   panels,                        // [{ photoIndex, pan:{x,y}, zoom }] per slot
 *   selected,                      // selected panel index or -1
 *   effects,                       // { grain, halftone, vignette }
 * }
 */
export function drawCover(ctx, w, h, state) {
  const u = Math.min(w, h) / 1080;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  drawBackdrop(ctx, w, h, u);
  const rects = panelRects(state.layout, w, h);
  for (let i = 0; i < rects.length; i++) {
    drawPanel(ctx, rects[i], i, state, u);
  }
  drawTitleBlock(ctx, w, h, u, state);
  drawEffects(ctx, w, h, u, state.effects);
  ctx.restore();
}
