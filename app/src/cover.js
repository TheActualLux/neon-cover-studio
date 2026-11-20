const GRADES = {
  sunset: { sky: ['#f3b36e', '#e66e57', '#403849'], tint: 'rgba(255,116,64,.15)', filter: 'saturate(1.18) contrast(1.04)' },
  neon: { sky: ['#482878', '#c34079', '#151b35'], tint: 'rgba(95,67,255,.20)', filter: 'saturate(1.45) contrast(1.12)' },
  noir: { sky: ['#73777a', '#343c43', '#111820'], tint: 'rgba(15,24,32,.30)', filter: 'grayscale(1) contrast(1.22)' },
  clean: { sky: ['#92c3cf', '#e9b78a', '#28384a'], tint: 'rgba(255,232,201,.07)', filter: 'saturate(.92) contrast(1.02)' },
};
export const LAYOUTS = {
  'big-left-with-two-right': [{ x: 0, y: 0, w: .635, h: 1 }, { x: .65, y: 0, w: .35, h: .493 }, { x: .65, y: .507, w: .35, h: .493 }],
  '2x2': [{ x: 0, y: 0, w: .493, h: .493 }, { x: .507, y: 0, w: .493, h: .493 }, { x: 0, y: .507, w: .493, h: .493 }, { x: .507, y: .507, w: .493, h: .493 }],
  'full-bleed': [{ x: 0, y: 0, w: 1, h: 1 }],
  'tall-3-stack': [{ x: 0, y: 0, w: 1, h: .49 }, { x: 0, y: .505, w: .493, h: .495 }, { x: .507, y: .505, w: .493, h: .495 }],
  '4-strip': [{ x: 0, y: 0, w: .2425, h: 1 }, { x: .2525, y: 0, w: .2425, h: 1 }, { x: .505, y: 0, w: .2425, h: 1 }, { x: .7575, y: 0, w: .2425, h: 1 }],
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function drawBackdrop(ctx, w, h, grade) {
  const colors = GRADES[grade].sky;
  const backdrop = ctx.createLinearGradient(0, 0, w * .28, h);
  colors.forEach((color, index) => backdrop.addColorStop(index / (colors.length - 1), color));
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, w, h);

  const halo = ctx.createRadialGradient(w * .72, h * .54, 0, w * .72, h * .54, w * .37);
  halo.addColorStop(0, grade === 'neon' ? 'rgba(245,76,155,.46)' : 'rgba(255,207,121,.52)');
  halo.addColorStop(1, 'rgba(255,170,106,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  const radius = Math.min(w, h) * .105;
  const sun = ctx.createRadialGradient(w * .72, h * .54, radius * .18, w * .72, h * .54, radius * 1.1);
  sun.addColorStop(0, '#fff1c6'); sun.addColorStop(.74, '#ffc579'); sun.addColorStop(1, 'rgba(255,153,104,0)');
  ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(w * .72, h * .54, radius, 0, Math.PI * 2); ctx.fill();

  const horizon = h * .7;
  ctx.fillStyle = grade === 'neon' ? '#28223e' : grade === 'noir' ? '#202a31' : '#493c4b';
  ctx.beginPath(); ctx.moveTo(0, horizon + h * .05);
  let x = 0; let i = 0;
  while (x < w) {
    const seed = Math.abs(Math.sin(i * 78.23 + 4.19));
    const width = w * (.018 + seed * .039);
    const height = h * (.04 + Math.abs(Math.cos(i * 19.7 + 2)) * .14);
    ctx.lineTo(x, horizon - height); ctx.lineTo(x, horizon + h * .05); ctx.lineTo(x + width, horizon + h * .05);
    x += width; i++;
  }
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,214,150,.55)';
  for (let n = 0; n < 95; n++) {
    const wx = ((n * 97.37) % 997) / 997 * w;
    const wy = horizon - h * (.025 + ((n * 31.71) % 100) / 100 * .11);
    if (wy > horizon - h * .16) ctx.fillRect(wx, wy, Math.max(1, w * .003), Math.max(1, h * .004));
  }
}
function drawPanel(ctx, rect, image, panel, grade) {
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.fillStyle = '#2d3340'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (image?.width && image?.height) {
    const fit = Math.max(rect.w / image.width, rect.h / image.height);
    const zoom = clamp(Number(panel.zoom) || 1, 1, 3.5);
    const dw = image.width * fit * zoom, dh = image.height * fit * zoom;
    const overX = Math.max(0, dw - rect.w), overY = Math.max(0, dh - rect.h);
    const px = clamp(Number(panel.panX) || 0, -1, 1), py = clamp(Number(panel.panY) || 0, -1, 1);
    ctx.filter = GRADES[grade].filter;
    ctx.drawImage(image, rect.x + (rect.w - dw) / 2 + overX * px / 2, rect.y + (rect.h - dh) / 2 + overY * py / 2, dw, dh);
    ctx.filter = 'none'; ctx.fillStyle = GRADES[grade].tint; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.strokeStyle = 'rgba(255,244,223,.8)'; ctx.lineWidth = Math.max(1, rect.w * .003);
  ctx.strokeRect(rect.x + ctx.lineWidth / 2, rect.y + ctx.lineWidth / 2, rect.w - ctx.lineWidth, rect.h - ctx.lineWidth);
  ctx.restore();
}
function drawCaption(ctx, w, h, state) {
  const title = String(state.headline || 'SUNSET STORIES').trim().toUpperCase();
  const kicker = String(state.kicker || '').trim().toUpperCase();
  if (!title && !kicker) return;
  const align = ['left', 'center', 'right'].includes(state.align) ? state.align : 'left';
  const x = align === 'left' ? w * .075 : align === 'right' ? w * .925 : w / 2;
  const base = h * .87;
  const size = h * (title.length > 19 ? .09 : title.length > 12 ? .105 : .125);
  const spacing = clamp(Number(state.tracking) || 0, -.08, .18) * size;
  const font = `900 ${size}px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.save(); ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.textAlign = align; ctx.lineJoin = 'round';
  const chars = [...title];
  const width = chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) + spacing * Math.max(0, chars.length - 1);
  const scaleX = Math.min(1, w * .84 / Math.max(1, width));
  ctx.translate(x, base); ctx.scale(scaleX, 1); ctx.translate(-x, -base);
  if (kicker) {
    ctx.font = `700 ${size * .22}px Inter, ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = align; ctx.fillStyle = '#ffd49a'; ctx.shadowColor = 'rgba(8,12,20,.6)'; ctx.shadowBlur = h * .009;
    ctx.fillText(kicker, x, base - size * 1.03); ctx.shadowBlur = 0;
  }
  const plateW = Math.min(w * .86, width * scaleX + h * .055);
  const plateX = align === 'left' ? x - h * .022 : align === 'right' ? x - plateW + h * .022 : x - plateW / 2;
  ctx.fillStyle = 'rgba(11,16,25,.34)'; ctx.beginPath(); ctx.roundRect(plateX, base - size * .94, plateW, size * 1.28, h * .012); ctx.fill();
  ctx.font = font; ctx.textAlign = 'left'; ctx.fillStyle = '#fff1d6'; ctx.strokeStyle = 'rgba(31,18,28,.72)'; ctx.lineWidth = size * .055;
  ctx.shadowColor = 'rgba(12,10,20,.66)'; ctx.shadowBlur = h * .02; ctx.shadowOffsetY = h * .007;
  let cursor = align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
  chars.forEach((char, index) => { ctx.strokeText(char, cursor, base); ctx.fillText(char, cursor, base); cursor += ctx.measureText(char).width + (index < chars.length - 1 ? spacing : 0); });
  ctx.restore();
}
function drawFinish(ctx, w, h, effects) {
  if (effects.grain) {
    let seed = 142857;
    const rand = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
    ctx.save(); ctx.globalAlpha = .13; ctx.fillStyle = '#fff4d6';
    for (let i = 0, count = Math.floor(w * h / 760); i < count; i++) { const x = rand() * w, y = rand() * h, s = Math.max(1, w / 850 * (.5 + rand() * 1.5)); ctx.fillRect(x, y, s, s); }
    ctx.restore();
  }
  if (effects.halftone) {
    ctx.save(); ctx.globalAlpha = .14; ctx.fillStyle = '#171627'; const step = Math.max(7, Math.round(w / 78));
    for (let y = step / 2; y < h * .78; y += step) for (let x = step / 2; x < w; x += step) {
      const distance = Math.hypot((x - w * .8) / w, (y - h * .55) / h), radius = step * clamp(.45 - distance * .7, .05, .34);
      if (radius > step * .08) { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
  if (effects.vignette) {
    const shade = ctx.createRadialGradient(w * .5, h * .47, Math.min(w, h) * .23, w * .5, h * .5, Math.max(w, h) * .77);
    shade.addColorStop(0, 'rgba(8,10,20,0)'); shade.addColorStop(.72, 'rgba(8,10,20,.12)'); shade.addColorStop(1, 'rgba(8,10,20,.72)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
  }
}
export function drawCover(ctx, w, h, state = {}) {
  const grade = GRADES[state.grade] ? state.grade : 'sunset';
  drawBackdrop(ctx, w, h, grade);
  const layout = LAYOUTS[state.layout] || LAYOUTS['big-left-with-two-right'];
  const images = state.images || [], panels = state.panels || [];
  layout.forEach((box, index) => {
    const panel = panels[index] || {}, imageIndex = Number.isInteger(panel.imageIndex) ? panel.imageIndex : index;
    const image = images.length ? images[((imageIndex % images.length) + images.length) % images.length] : null;
    drawPanel(ctx, { x: box.x * w, y: box.y * h, w: box.w * w, h: box.h * h }, image, panel, grade);
  });
  drawCaption(ctx, w, h, state);
  drawFinish(ctx, w, h, { grain: true, halftone: true, vignette: true, ...state.effects });
}
