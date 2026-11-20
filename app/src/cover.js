const GRADES = {
  sunset: { sky: ['#eb633b', '#f17c43', '#f59a50', '#ffd080'], glow: '#ffb253', tint: 'rgba(241,105,49,.25)', shadowTint: 'rgba(14,91,104,.34)', ink: '#17333b', text: '#fff5e9' },
  neon: { sky: ['#100f35', '#30205c', '#702e78', '#de5a78'], glow: '#f85ba5', tint: 'rgba(63,55,220,.23)', ink: '#100f28', text: '#fff8ff' },
  noir: { sky: ['#12151d', '#282b35', '#55535a', '#888078'], glow: '#e9c7a0', tint: 'rgba(21,24,32,.25)', ink: '#101115', text: '#fffdf7' },
  clean: { sky: ['#182b3b', '#3d6074', '#a06e69', '#ecc291'], glow: '#ffe0a4', tint: 'rgba(53,101,124,.09)', ink: '#12202a', text: '#fffaf1' },
};

const LAYOUTS = {
  'big-left': [[.045, .045, .586, .91], [.646, .045, .309, .443], [.646, .512, .309, .443]],
  grid: [[.045, .045, .443, .443], [.512, .045, .443, .443], [.045, .512, .443, .443], [.512, .512, .443, .443]],
  full: [[0, 0, 1, 1]],
  stack: [[.045, .045, .91, .29], [.045, .355, .91, .29], [.045, .665, .91, .29]],
  strips: [[.045, .045, .91, .2075], [.045, .27, .91, .2075], [.045, .495, .91, .2075], [.045, .72, .91, .2075]],
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function hashRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function drawSky(ctx, w, h, grade) {
  const palette = GRADES[grade] || GRADES.sunset;
  const sky = ctx.createLinearGradient(0, 0, w * .12, h);
  sky.addColorStop(0, palette.sky[0]);
  sky.addColorStop(.42, palette.sky[1]);
  sky.addColorStop(.76, palette.sky[2]);
  sky.addColorStop(1, palette.sky[3]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const sunX = w * .72;
  const sunY = h * .405;
  const sunR = Math.min(w, h) * .105;
  const halo = grade === 'sunset'
    ? ctx.createRadialGradient(sunX, sunY, sunR * .12, sunX, sunY, sunR * 3.5)
    : ctx.createRadialGradient(sunX, sunY, sunR * .24, sunX, sunY, sunR * 2.45);
  if (grade === 'sunset') {
    halo.addColorStop(0, `${palette.glow}b8`);
    halo.addColorStop(.26, `${palette.glow}82`);
    halo.addColorStop(.62, `${palette.glow}38`);
    halo.addColorStop(1, `${palette.glow}00`);
  } else {
    halo.addColorStop(0, `${palette.glow}65`);
    halo.addColorStop(.38, `${palette.glow}28`);
    halo.addColorStop(1, `${palette.glow}00`);
  }
  ctx.fillStyle = halo;
  ctx.fillRect(sunX - sunR * 2.5, sunY - sunR * 2.5, sunR * 5, sunR * 5);
  const disc = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR);
  disc.addColorStop(0, '#fff0c3');
  disc.addColorStop(.55, palette.glow);
  disc.addColorStop(1, '#f08c73');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();

  // A repeatable, hand-drawn-feeling waterfront skyline behind the photo panels.
  const random = hashRandom(317);
  const baseY = h * .84;
  ctx.fillStyle = '#171724';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, baseY + h * .035);
  let x = 0;
  while (x < w) {
    const bw = w * (.018 + random() * .038);
    const bh = h * (.035 + random() * .14);
    ctx.lineTo(x, baseY - bh);
    ctx.lineTo(x + bw * .12, baseY - bh);
    if (random() > .69) {
      const roof = bw * (.12 + random() * .22);
      ctx.lineTo(x + bw * .12, baseY - bh - roof);
      ctx.lineTo(x + bw * .2, baseY - bh - roof * 1.08);
      ctx.lineTo(x + bw * .26, baseY - bh);
    }
    ctx.lineTo(x + bw, baseY - bh);
    x += bw;
    ctx.lineTo(x, baseY + h * .035);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // Sparse, warm windows give the silhouette a little life.
  const windows = hashRandom(912);
  ctx.fillStyle = `${palette.glow}62`;
  for (let i = 0; i < 100; i++) {
    const wx = windows() * w;
    const wy = baseY - h * (.035 + windows() * .12);
    if (windows() > .48) ctx.fillRect(wx, wy, Math.max(1, w * .0025), Math.max(1, h * .005));
  }
  const horizon = ctx.createLinearGradient(0, baseY - h * .03, 0, h);
  horizon.addColorStop(0, 'rgba(235,117,98,.06)');
  horizon.addColorStop(1, 'rgba(11,12,21,.72)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, baseY - h * .03, w, h - baseY + h * .03);
}

function drawPanel(ctx, w, h, panel, index, state) {
  const [nx, ny, nw, nh] = panel.rect;
  const x = nx * w, y = ny * h, pw = nw * w, ph = nh * h;
  const radius = Math.min(w, h) * (state.layout === 'full' ? 0 : .008);
  ctx.save();
  ctx.beginPath();
  if (radius && typeof ctx.roundRect === 'function') ctx.roundRect(x, y, pw, ph, radius);
  else ctx.rect(x, y, pw, ph);
  ctx.clip();
  const photo = panel.photo;
  if (photo && photo.naturalWidth) {
    const scale = Math.max(pw / photo.naturalWidth, ph / photo.naturalHeight) * Math.max(.1, panel.zoom || 1);
    const dw = photo.naturalWidth * scale;
    const dh = photo.naturalHeight * scale;
    const overflowX = Math.max(0, dw - pw);
    const overflowY = Math.max(0, dh - ph);
    const dx = x + (pw - dw) / 2 - (panel.panX || 0) * overflowX * .5;
    const dy = y + (ph - dh) / 2 - (panel.panY || 0) * overflowY * .5;
    ctx.drawImage(photo, dx, dy, dw, dh);
    const palette = GRADES[state.grade] || GRADES.sunset;
    ctx.fillStyle = palette.tint;
    ctx.fillRect(x, y, pw, ph);
    if (palette.shadowTint) {
      const tealShadows = ctx.createLinearGradient(0, y + ph * .24, 0, y + ph);
      tealShadows.addColorStop(0, 'rgba(14,91,104,0)');
      tealShadows.addColorStop(.5, palette.shadowTint);
      tealShadows.addColorStop(1, 'rgba(8,66,83,.46)');
      ctx.fillStyle = tealShadows;
      ctx.fillRect(x, y, pw, ph);
    }
    if (state.grade === 'noir') {
      ctx.fillStyle = 'rgba(6,8,14,.17)';
      ctx.fillRect(x, y, pw, ph);
    }
  } else {
    const empty = ctx.createLinearGradient(x, y, x + pw, y + ph);
    empty.addColorStop(0, '#392e4b');
    empty.addColorStop(1, '#a54d63');
    ctx.fillStyle = empty;
    ctx.fillRect(x, y, pw, ph);
    ctx.fillStyle = 'rgba(255,220,184,.22)';
    ctx.beginPath();
    ctx.arc(x + pw * (.68 - index * .08), y + ph * .34, Math.min(pw, ph) * .16, 0, Math.PI * 2);
    ctx.fill();
  }
  const shade = ctx.createLinearGradient(0, y + ph * .34, 0, y + ph);
  shade.addColorStop(0, 'rgba(13,10,22,0)');
  shade.addColorStop(1, 'rgba(13,10,22,.27)');
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, pw, ph);
  ctx.restore();
  if (state.layout !== 'full') {
    ctx.strokeStyle = 'rgba(255,236,221,.29)';
    ctx.lineWidth = Math.max(1, Math.min(w, h) * .002);
    ctx.strokeRect(x, y, pw, ph);
  }
}

function trackedWidth(ctx, text, tracking) {
  let width = 0;
  for (const char of text) width += ctx.measureText(char).width;
  return width + Math.max(0, text.length - 1) * tracking;
}
function fillTracked(ctx, text, x, y, tracking) {
  let cursor = x;
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + tracking;
  }
}

function drawCaption(ctx, w, h, state) {
  const text = String(state.caption || '').trim().toUpperCase();
  const kicker = String(state.kicker || '').trim().toUpperCase();
  if (!text && !kicker) return;
  const size = Math.min(w, h) * .087;
  const tracking = Math.min(Math.min(w, h) * .012, Math.max(0, state.tracking || 0) * Math.min(w, h) / 1080);
  const align = ['left', 'right', 'center'].includes(state.align) ? state.align : 'center';
  const margin = w * .075;
  const baseY = h * .895;
  const palette = GRADES[state.grade] || GRADES.sunset;
  const maxWidth = w - margin * 2;
  ctx.save();
  ctx.font = `900 ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  const width = trackedWidth(ctx, text, tracking);
  const horizontalScale = text ? Math.min(1, maxWidth / Math.max(1, width)) : 1;
  const anchorX = align === 'left' ? margin : align === 'right' ? w - margin : w / 2;
  const actualWidth = width * horizontalScale;
  const leftX = align === 'left' ? anchorX : align === 'right' ? anchorX - actualWidth : anchorX - actualWidth / 2;
  const lineHeight = size * 1.12;
  const kickerY = kicker ? baseY - lineHeight * .93 : baseY;
  const textY = kicker ? baseY : baseY + size * .06;
  const platePadX = w * .027;
  const plateTop = kicker ? kickerY - size * .78 : textY - size * .8;
  const plateBottom = textY + size * .31;
  const plateX = Math.max(0, leftX - platePadX);
  const plateW = Math.min(w - plateX, actualWidth + platePadX * 2);
  const plate = ctx.createLinearGradient(0, plateTop, 0, plateBottom);
  plate.addColorStop(0, 'rgba(16,12,23,.03)');
  plate.addColorStop(.34, 'rgba(16,12,23,.40)');
  plate.addColorStop(1, 'rgba(16,12,23,.65)');
  ctx.fillStyle = plate;
  ctx.fillRect(plateX, plateTop, plateW, plateBottom - plateTop + h * .04);
  if (kicker) {
    ctx.font = `700 ${Math.min(w, h) * .019}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = '#ffd2a9';
    ctx.shadowColor = 'rgba(13,7,15,.8)';
    ctx.shadowBlur = size * .12;
    const kWidth = ctx.measureText(kicker).width;
    const kX = align === 'left' ? anchorX : align === 'right' ? anchorX - kWidth : anchorX - kWidth / 2;
    ctx.fillText(kicker, kX, kickerY);
  }
  if (text) {
    ctx.font = `900 ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = palette.text;
    ctx.strokeStyle = palette.ink;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * .035;
    ctx.shadowColor = 'rgba(9,7,15,.76)';
    ctx.shadowBlur = size * .2;
    ctx.shadowOffsetY = size * .035;
    ctx.translate(leftX, textY);
    ctx.scale(horizontalScale, 1);
    ctx.strokeText(text, 0, 0);
    fillTracked(ctx, text, 0, 0, tracking);
  }
  ctx.restore();
}

function drawHalftone(ctx, w, h) {
  const spacing = Math.max(6, Math.round(Math.min(w, h) / 105));
  const maxR = spacing * .27;
  const startY = h * .48;
  for (let y = startY; y < h; y += spacing) {
    const fade = (y - startY) / (h - startY);
    for (let x = 0; x < w; x += spacing) {
      const sideFade = Math.min(1, Math.max(0, (Math.abs(x - w * .5) / (w * .5) - .3) * 1.7));
      const radius = maxR * fade * sideFade;
      if (radius < .45) continue;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Draw the complete poster into an existing 2D context at the supplied pixel size. */
export function drawCover(ctx, w, h, state = {}) {
  const safeState = { ...state, grade: GRADES[state.grade] ? state.grade : 'sunset' };
  drawSky(ctx, w, h, safeState.grade);
  const panels = Array.isArray(safeState.panels) ? safeState.panels : [];
  const rects = LAYOUTS[safeState.layout] || LAYOUTS['big-left'];
  rects.forEach((rect, index) => {
    const panel = panels[index] || {};
    drawPanel(ctx, w, h, { rect, photo: panel.photo || null, panX: panel.panX || 0, panY: panel.panY || 0, zoom: panel.zoom || 1 }, index, safeState);
  });
  drawCaption(ctx, w, h, safeState);

  if (safeState.halftone) {
    ctx.save();
    ctx.fillStyle = safeState.grade === 'noir' ? 'rgba(255,244,225,.09)' : 'rgba(24,12,27,.13)';
    drawHalftone(ctx, w, h);
    ctx.restore();
  }
  if (safeState.grain) {
    const random = hashRandom(12973);
    const count = Math.round(w * h / (safeState.grade === 'sunset' ? 68 : 145));
    ctx.save();
    for (let i = 0; i < count; i++) {
      const light = random() > .53;
      const strength = safeState.grade === 'sunset' ? 1.7 : 1;
      ctx.fillStyle = light ? `rgba(255,244,230,${random() * .11 * strength})` : `rgba(13,10,22,${random() * .13 * strength})`;
      ctx.fillRect(random() * w, random() * h, Math.max(1, w / 1080), Math.max(1, h / 1350));
    }
    ctx.restore();
  }
  if (safeState.vignette) {
    ctx.save();
    const vignette = ctx.createRadialGradient(w * .5, h * .46, Math.min(w, h) * .25, w * .5, h * .48, Math.max(w, h) * .76);
    vignette.addColorStop(0, 'rgba(7,6,15,0)');
    vignette.addColorStop(.7, 'rgba(7,6,15,.10)');
    vignette.addColorStop(1, 'rgba(7,6,15,.58)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

export { LAYOUTS };
