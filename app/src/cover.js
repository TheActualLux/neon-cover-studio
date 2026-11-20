// Deterministic poster rendering with the browser's built-in Canvas 2D API.
// No asset, font, or network dependencies: the city, light and print finish are drawn here.
export const GRADE_KEYS = ['sunset', 'neon', 'noir', 'clean'];

export const LAYOUTS = {
  bigleft: { count: 3 },
  grid: { count: 4 },
  full: { count: 1 },
  stack: { count: 3 },
  strip: { count: 4 },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const GRADE = {
  sunset: { top: '#171329', mid: '#b45556', low: '#f2a65e', sun: '#ffe0a0', tint: 'rgba(231,113,77,.15)', ink: '#fff4df', accent: '#f3b777' },
  neon: { top: '#090f27', mid: '#37316e', low: '#d6437c', sun: '#ffb0d1', tint: 'rgba(32,218,238,.14)', ink: '#f5f2ff', accent: '#6cf0ef' },
  noir: { top: '#111319', mid: '#34323a', low: '#7b7174', sun: '#ddd5c9', tint: 'rgba(10,12,20,.35)', ink: '#f4f0e8', accent: '#d0b99f' },
  clean: { top: '#234858', mid: '#6f9ca0', low: '#e7bd8b', sun: '#fff0c8', tint: 'rgba(255,221,170,.08)', ink: '#fffaf0', accent: '#f6c894' },
};

/** Responsive photo rectangles in the same coordinate system as the canvas. */
export function layoutRects(layout, w, h) {
  const gap = Math.max(3, Math.min(w, h) * 0.008);
  const g = gap;
  switch (layout) {
    case 'grid':
      return [
        { x: 0, y: 0, w: (w - g) / 2, h: (h - g) / 2 },
        { x: (w + g) / 2, y: 0, w: (w - g) / 2, h: (h - g) / 2 },
        { x: 0, y: (h + g) / 2, w: (w - g) / 2, h: (h - g) / 2 },
        { x: (w + g) / 2, y: (h + g) / 2, w: (w - g) / 2, h: (h - g) / 2 },
      ];
    case 'full':
      return [{ x: 0, y: 0, w, h }];
    case 'stack':
      return [
        { x: 0, y: 0, w, h: (h - 2 * g) * 0.52 },
        { x: 0, y: (h - 2 * g) * 0.52 + g, w, h: (h - 2 * g) * 0.27 },
        { x: 0, y: (h - 2 * g) * 0.79 + 2 * g, w, h: (h - 2 * g) * 0.21 },
      ];
    case 'strip':
      return Array.from({ length: 4 }, (_, i) => ({ x: i * ((w - 3 * g) / 4 + g), y: 0, w: (w - 3 * g) / 4, h }));
    case 'bigleft':
    default:
      return [
        { x: 0, y: 0, w: (w - g) * 0.61, h },
        { x: (w - g) * 0.61 + g, y: 0, w: (w - g) * 0.39, h: (h - g) / 2 },
        { x: (w - g) * 0.61 + g, y: (h + g) / 2, w: (w - g) * 0.39, h: (h - g) / 2 },
      ];
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawSkyline(ctx, w, h, grade) {
  const horizon = h * 0.76;
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.56, h * 0.015, w * 0.5, h * 0.56, h * 0.47);
  glow.addColorStop(0, grade.sun + '44');
  glow.addColorStop(0.34, grade.low + '22');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const sunX = w * 0.5;
  const sunY = h * 0.49;
  const sunR = Math.min(w, h) * 0.115;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.72, sunX, sunY, sunR * 2.35);
  sunGlow.addColorStop(0, grade.sun + '66');
  sunGlow.addColorStop(1, 'rgba(255,190,130,0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(sunX - sunR * 2.5, sunY - sunR * 2.5, sunR * 5, sunR * 5);
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fillStyle = grade.sun;
  ctx.globalAlpha = 0.88;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Thin horizontal bands give the sun a screen-printed cut without bitmap assets.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    const yy = sunY + sunR * (0.18 + i * 0.16);
    const band = sunR * (1.8 - i * 0.13);
    ctx.fillRect(sunX - band / 2, yy, band, Math.max(1, sunR * 0.035));
  }
  ctx.restore();

  const skyline = ctx.createLinearGradient(0, horizon - h * 0.26, 0, h);
  skyline.addColorStop(0, '#191923');
  skyline.addColorStop(1, '#0b0c12');
  ctx.fillStyle = skyline;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  const blocks = [
    [0.00, .14, .21], [.08, .22, .13], [.15, .12, .20], [.23, .26, .11], [.33, .18, .19],
    [.43, .27, .12], [.53, .15, .18], [.62, .22, .12], [.70, .13, .20], [.79, .26, .13], [.89, .17, .19], [.96, .23, .14],
  ];
  for (const [x, height, width] of blocks) {
    const bx = x * w;
    const bw = width * w;
    const bh = height * h;
    ctx.lineTo(bx, horizon);
    ctx.lineTo(bx, horizon - bh);
    if (height > .2) {
      ctx.lineTo(bx + bw * .34, horizon - bh);
      ctx.lineTo(bx + bw * .34, horizon - bh - h * .035);
      ctx.lineTo(bx + bw * .46, horizon - bh - h * .035);
      ctx.lineTo(bx + bw * .46, horizon - bh);
    }
    ctx.lineTo(bx + bw, horizon - bh);
    ctx.lineTo(bx + bw, horizon);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Small, reproducible lit windows.
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 42; col++) {
      const x = w * (0.015 + col * 0.024 + ((row % 2) * .006));
      const y = horizon - h * (.035 + ((col * 13 + row * 7) % 17) / 100) - row * h * .017;
      if (x < w && y > horizon - h * .28 && ((col * 17 + row * 31) % 5) < 2) {
        ctx.fillStyle = (col + row) % 3 ? '#f3bd79' : '#92c7d3';
        ctx.globalAlpha = grade.top === '#111319' ? .33 : .5;
        ctx.fillRect(x, y, Math.max(1, w * .002), Math.max(1, h * .004));
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawBackdrop(ctx, w, h, grade) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, grade.top);
  sky.addColorStop(0.5, grade.mid);
  sky.addColorStop(1, grade.low);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  drawSkyline(ctx, w, h, grade);
  const sheen = ctx.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, 'rgba(255,255,255,.06)');
  sheen.addColorStop(.46, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(9,7,17,.19)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
}

function drawPhoto(ctx, rect, photo, panel, grade, index) {
  ctx.save();
  roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, Math.max(2, Math.min(rect.w, rect.h) * .008));
  ctx.clip();
  if (photo?.img && photo.img.naturalWidth > 0) {
    const img = photo.img;
    const fit = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight);
    const zoom = clamp(Number(panel?.zoom) || 1, 1, 5);
    const dw = img.naturalWidth * fit * zoom;
    const dh = img.naturalHeight * fit * zoom;
    const overflowX = Math.max(0, dw - rect.w);
    const overflowY = Math.max(0, dh - rect.h);
    const px = clamp(Number(panel?.panX) || 0, -.75, .75);
    const py = clamp(Number(panel?.panY) || 0, -.75, .75);
    const dx = rect.x - overflowX * (px + 1) / 2;
    const dy = rect.y - overflowY * (py + 1) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.fillStyle = grade.tint;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    const shade = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
    shade.addColorStop(0, 'rgba(8,9,18,.06)');
    shade.addColorStop(1, 'rgba(8,8,17,.27)');
    ctx.fillStyle = shade;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  } else {
    const placeholder = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
    placeholder.addColorStop(0, '#262537');
    placeholder.addColorStop(1, '#594252');
    ctx.fillStyle = placeholder;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = grade.accent;
    ctx.globalAlpha = .62;
    ctx.beginPath();
    ctx.arc(rect.x + rect.w * (.35 + index * .08), rect.y + rect.h * .32, Math.min(rect.w, rect.h) * .12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = .7;
    ctx.font = `600 ${Math.max(10, Math.min(rect.w, rect.h) * .045)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('ADD A PHOTO', rect.x + rect.w / 2, rect.y + rect.h * .72);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function trackedWidth(ctx, text, tracking) {
  const base = ctx.measureText(text).width;
  return base + Math.max(0, text.length - 1) * tracking;
}

function fitLine(ctx, text, maxWidth, size, tracking) {
  ctx.font = `900 ${size}px Arial, Helvetica, sans-serif`;
  const measured = trackedWidth(ctx, text, tracking);
  return measured > maxWidth ? size * maxWidth / measured : size;
}

function makeCaptionLines(ctx, text, maxWidth, fontSize, tracking) {
  const source = Array.isArray(text) ? text.join(' ') : String(text ?? '');
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = '';
  ctx.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && trackedWidth(ctx, candidate, tracking) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawCaption(ctx, w, h, state, grade) {
  const margin = Math.max(w, h) * .075;
  const blockW = w - margin * 2;
  const kicker = String(state.kicker ?? '').trim();
  const rawCaption = state.captionLines || state.caption || '';
  const baseSize = Math.min(w, h) * .108;
  const tracking = clamp(Number(state.tracking) || 0, 0, 10) * Math.min(w, h) / 1080;
  const lines = makeCaptionLines(ctx, rawCaption, blockW * .9, baseSize, tracking);
  const lineH = baseSize * .9;
  const kickerH = kicker ? baseSize * .27 : 0;
  const padY = baseSize * .25;
  const plateH = Math.min(h * .38, Math.max(baseSize * .93, lines.length * lineH + kickerH + padY * 2));
  const bottom = h * .91;
  const plateY = bottom - plateH;
  const plateX = margin * .58;
  const plateWidth = w - plateX * 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.42)';
  ctx.shadowBlur = Math.min(w, h) * .035;
  ctx.shadowOffsetY = Math.min(w, h) * .012;
  ctx.fillStyle = 'rgba(12,11,19,.79)';
  roundedRect(ctx, plateX, plateY, plateWidth, plateH, Math.min(w, h) * .018);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = grade.accent;
  roundedRect(ctx, plateX, plateY, Math.max(3, w * .009), plateH, Math.min(w, h) * .01);
  ctx.fill();

  const align = ['left', 'right', 'center'].includes(state.align) ? state.align : 'center';
  const x = align === 'left' ? plateX + margin * .7 : align === 'right' ? plateX + plateWidth - margin * .7 : w / 2;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = grade.ink;
  const textTop = plateY + padY + kickerH;
  const availableH = Math.max(baseSize * .5, plateH - padY * 2 - kickerH);
  const safeLines = lines.length ? lines : [''];
  const actualLineH = Math.min(lineH, availableH / safeLines.length);
  for (let i = 0; i < safeLines.length; i++) {
    const label = safeLines[i];
    const size = fitLine(ctx, label, plateWidth - margin * 1.4, actualLineH * 1.05, tracking);
    ctx.font = `900 ${size}px Arial, Helvetica, sans-serif`;
    ctx.save();
    if (tracking > 0 && 'letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
    ctx.fillText(label, x, textTop + actualLineH * (i + .5), plateWidth - margin * 1.4);
    ctx.restore();
  }
  if (kicker) {
    const kSize = Math.max(8, Math.min(w, h) * .017);
    ctx.fillStyle = grade.accent;
    ctx.font = `700 ${kSize}px Arial, Helvetica, sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.max(1, tracking * .65)}px`;
    const kickerX = align === 'left' ? x : align === 'right' ? x : x;
    const kickerY = plateY + padY + kSize * .58;
    ctx.fillText(kicker.toUpperCase(), kickerX, kickerY, plateWidth - margin * 1.4);
  }
  ctx.restore();
}

function seededNoise(ctx, w, h) {
  const step = Math.max(2, Math.round(Math.min(w, h) / 250));
  const cols = Math.ceil(w / step);
  const rows = Math.ceil(h / step);
  const image = ctx.createImageData(cols, rows);
  let seed = 0x6d2b79f5;
  for (let i = 0; i < image.data.length; i += 4) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const value = (seed >>> 0) & 255;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 18;
  }
  const noise = document.createElement('canvas');
  noise.width = cols;
  noise.height = rows;
  noise.getContext('2d').putImageData(image, 0, 0);
  ctx.save();
  ctx.globalAlpha = .32;
  ctx.globalCompositeOperation = 'soft-light';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(noise, 0, 0, cols, rows, 0, 0, w, h);
  ctx.restore();
}

function drawHalftone(ctx, w, h, color) {
  const step = Math.max(8, Math.min(w, h) / 62);
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = .105;
  for (let y = step * .5; y < h; y += step) {
    for (let x = step * .5; x < w; x += step) {
      const d = Math.hypot((x - w * .5) / w, (y - h * .5) / h);
      const r = Math.max(0, step * .16 * (1 - d * 1.25));
      if (r > .4) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawVignette(ctx, w, h) {
  const v = ctx.createRadialGradient(w * .5, h * .48, Math.min(w, h) * .24, w * .5, h * .5, Math.max(w, h) * .75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(.7, 'rgba(0,0,0,.1)');
  v.addColorStop(1, 'rgba(0,0,0,.53)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** Paint the full composition onto any 2D context. */
export function drawCover(ctx, w, h, state = {}) {
  if (!ctx || !(w > 0) || !(h > 0)) return;
  const grade = GRADE[state.grade] || GRADE.sunset;
  ctx.save();
  // The caller owns the canvas transform (including preview device-pixel ratio).
  // All geometry here stays in the caller's logical w × h coordinate space.
  ctx.clearRect(0, 0, w, h);
  drawBackdrop(ctx, w, h, grade);
  const layout = LAYOUTS[state.layout] ? state.layout : 'bigleft';
  const rects = layoutRects(layout, w, h);
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    const panel = state.panels?.[i] || { panX: 0, panY: 0, zoom: 1 };
    const photo = state.photos?.[panel.photo];
    drawPhoto(ctx, rect, photo, panel, grade, i);
    if (state.showSelection && i === state.selected) {
      ctx.save();
      ctx.strokeStyle = '#fff1dc';
      ctx.lineWidth = Math.max(1.5, Math.min(w, h) * .003);
      ctx.setLineDash([Math.min(w, h) * .009, Math.min(w, h) * .006]);
      ctx.strokeRect(rect.x + ctx.lineWidth, rect.y + ctx.lineWidth, rect.w - 2 * ctx.lineWidth, rect.h - 2 * ctx.lineWidth);
      ctx.restore();
    }
  }
  drawCaption(ctx, w, h, state, grade);
  if (state.effects?.halftone) drawHalftone(ctx, w, h, grade.ink);
  if (state.effects?.grain) seededNoise(ctx, w, h);
  if (state.effects?.vignette) drawVignette(ctx, w, h);
  ctx.restore();
}
