// Midnight Marquee — the poster cover renderer.
//
// drawCover(ctx, w, h, state) paints the whole poster in one pass:
// backdrop sky, sun glow, city skyline, cover-fit photo panels with
// per-panel pan/zoom, the bottom-left title block on a shadow plate,
// then the colour grade and the print effects (grain, halftone, vignette).
//
// There are no image files, no fonts, no libraries and no network here.
// Photo panels use a user-loaded image, or one of the built-in procedural
// scenes drawn once onto an offscreen canvas with a seeded generator, so
// the same scene name always renders the same picture.

export const SCENES = ["marquee", "pier", "boulevard"];
export const GRADE_NAMES = ["sunset", "neon", "noir", "clean"];

const SCENE_SIZE = 1600;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Small deterministic PRNG so procedural art is identical on every run. */
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

/** The starting editor state, overridable key by key. */
export function defaultState(overrides = {}) {
  return {
    layout: "big-left",
    grade: "sunset",
    kicker: "A NOIR CABARET IN FOUR ACTS",
    headline: "MIDNIGHT MARQUEE",
    caption: "Opening Night",
    align: "left",
    tracking: 0.1, // fraction of the kicker font size
    effects: { grain: true, halftone: false, vignette: true },
    panels: [
      { panX: 0, panY: 0, zoom: 1 },
      { panX: 0, panY: 0, zoom: 1 },
      { panX: 0, panY: 0, zoom: 1 },
      { panX: 0, panY: 0, zoom: 1 }
    ],
    photo: null, // HTMLImageElement, or null for the procedural scene
    photoName: "marquee", // scene name used when photo is null
    selected: -1,
    ...overrides
  };
}

/** Panel rectangles for each layout, in fractions of the canvas. */
export function panelRects(layout, w, h) {
  const F = {
    "big-left": [
      [0.03, 0.03, 0.56, 0.94],
      [0.605, 0.03, 0.365, 0.455],
      [0.605, 0.505, 0.365, 0.465]
    ],
    grid: [
      [0.03, 0.03, 0.46, 0.465],
      [0.51, 0.03, 0.46, 0.465],
      [0.03, 0.515, 0.46, 0.455],
      [0.51, 0.515, 0.46, 0.455]
    ],
    full: [[0, 0, 1, 1]],
    stack: [
      [0.04, 0.04, 0.92, 0.28],
      [0.04, 0.36, 0.92, 0.28],
      [0.04, 0.68, 0.92, 0.28]
    ],
    strip: [
      [0.03, 0.03, 0.226, 0.94],
      [0.268, 0.03, 0.226, 0.94],
      [0.506, 0.03, 0.226, 0.94],
      [0.744, 0.03, 0.226, 0.94]
    ]
  };
  const list = F[layout] || F["big-left"];
  return list.map(([x, y, rw, rh]) => ({ x: x * w, y: y * h, w: rw * w, h: rh * h }));
}

/** Allowlist: an unknown or missing scene name falls back to "marquee". */
export function sceneName(requested) {
  return SCENES.includes(requested) ? requested : "marquee";
}

// ---------------------------------------------------------------------------
// Procedural scenes
// ---------------------------------------------------------------------------

const sceneCache = new Map();

/** A cached offscreen canvas for a scene name, safe to drawImage anywhere. */
export function getSceneImage(name) {
  const key = sceneName(name);
  let canvas = sceneCache.get(key);
  if (!canvas) {
    canvas = buildScene(key);
    sceneCache.set(key, canvas);
  }
  return canvas;
}

function buildScene(name) {
  const canvas = document.createElement("canvas");
  canvas.width = SCENE_SIZE;
  canvas.height = SCENE_SIZE;
  const ctx = canvas.getContext("2d");
  if (name === "pier") paintPier(ctx);
  else if (name === "boulevard") paintBoulevard(ctx);
  else paintMarquee(ctx);
  return canvas;
}

function paintPier(ctx) {
  const rng = mulberry32(0x11e5);
  const S = SCENE_SIZE;
  const sky = ctx.createLinearGradient(0, 0, 0, S * 0.64);
  sky.addColorStop(0, "#2a0f38");
  sky.addColorStop(0.5, "#8a2436");
  sky.addColorStop(0.82, "#d96c2f");
  sky.addColorStop(1, "#f2a65a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, S, S * 0.64);

  // Sun with a soft halo, low over the water.
  const cx = S * 0.5, cy = S * 0.46, r = S * 0.11;
  for (const [rr, a] of [[r * 2.4, 0.12], [r * 1.7, 0.2], [r * 1.25, 0.3]]) {
    ctx.fillStyle = `rgba(255,190,110,${a})`;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffd9a0";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Water with a shimmering reflection column.
  const sea = ctx.createLinearGradient(0, S * 0.64, 0, S);
  sea.addColorStop(0, "#6e2440");
  sea.addColorStop(0.35, "#3a1530");
  sea.addColorStop(1, "#120a1e");
  ctx.fillStyle = sea;
  ctx.fillRect(0, S * 0.64, S, S * 0.36);
  ctx.save();
  for (let i = 0; i < 90; i++) {
    const y = S * 0.65 + rng() * S * 0.33;
    const spread = (y - S * 0.64) * 0.9 + S * 0.06;
    const x = cx + (rng() - 0.5) * spread * 2;
    ctx.globalAlpha = 0.05 + rng() * 0.2;
    ctx.fillStyle = "#ffcf8f";
    ctx.fillRect(x, y, S * (0.01 + rng() * 0.05), S * 0.004);
  }
  ctx.restore();

  // Birds.
  ctx.strokeStyle = "rgba(20,8,20,0.8)";
  ctx.lineWidth = S * 0.004;
  for (let i = 0; i < 7; i++) {
    const x = S * (0.1 + rng() * 0.8), y = S * (0.08 + rng() * 0.3), s = S * (0.012 + rng() * 0.014);
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.8, x, y);
    ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.8, x + s, y);
    ctx.stroke();
  }

  // Pier deck, posts and two silhouettes at the rail.
  ctx.fillStyle = "#0c0614";
  ctx.fillRect(0, S * 0.8, S, S * 0.2);
  ctx.beginPath();
  ctx.moveTo(0, S * 0.8);
  ctx.lineTo(S, S * 0.78);
  ctx.lineTo(S, S * 0.82);
  ctx.lineTo(0, S * 0.84);
  ctx.closePath();
  ctx.fill();
  for (const px of [0.08, 0.24, 0.42, 0.6, 0.78, 0.94]) {
    ctx.fillRect(S * px, S * 0.82, S * 0.012, S * 0.18);
  }
  ctx.strokeStyle = "#0c0614";
  ctx.lineWidth = S * 0.006;
  for (const py of [0.74, 0.78]) {
    ctx.beginPath();
    ctx.moveTo(0, S * py);
    ctx.lineTo(S, S * (py - 0.01));
    ctx.stroke();
  }
  for (const px of [0.3, 0.68]) {
    ctx.fillStyle = "#0c0614";
    ctx.beginPath();
    ctx.arc(S * px, S * 0.735, S * 0.014, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(S * px - S * 0.016, S * 0.74, S * 0.032, S * 0.08);
  }
}

function paintBoulevard(ctx) {
  const rng = mulberry32(0x07e5);
  const S = SCENE_SIZE;
  const bg = ctx.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, "#05010f");
  bg.addColorStop(0.6, "#1b0740");
  bg.addColorStop(1, "#2a0a4e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // Building silhouettes both sides of a vanishing road.
  for (const side of [-1, 1]) {
    let x = side < 0 ? 0 : S * 0.62;
    while (x < (side < 0 ? S * 0.38 : S)) {
      const bw = S * (0.04 + rng() * 0.07);
      const bh = S * (0.2 + rng() * 0.42);
      ctx.fillStyle = "#0a0714";
      ctx.fillRect(x, S * 0.62 - bh, bw, bh + S * 0.1);
      for (let wy = 0; wy < bh - S * 0.03; wy += S * 0.032) {
        for (let wx = 0; wx < bw - S * 0.012; wx += S * 0.022) {
          if (rng() < 0.28) {
            ctx.fillStyle = rng() < 0.5 ? "rgba(255,179,71,0.75)" : "rgba(126,249,255,0.6)";
            ctx.fillRect(x + wx + S * 0.008, S * 0.62 - bh + wy + S * 0.012, S * 0.008, S * 0.014);
          }
        }
      }
      x += bw + S * 0.006;
    }
  }

  // Road.
  const road = ctx.createLinearGradient(0, S * 0.62, 0, S);
  road.addColorStop(0, "#120b20");
  road.addColorStop(1, "#231238");
  ctx.fillStyle = road;
  ctx.beginPath();
  ctx.moveTo(S * 0.38, S * 0.62);
  ctx.lineTo(S * 0.62, S * 0.62);
  ctx.lineTo(S * 0.86, S);
  ctx.lineTo(S * 0.14, S);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,179,71,0.85)";
  for (let y = S * 0.66; y < S; y += S * 0.075) {
    const w = (y - S * 0.62) * 0.05 + S * 0.004;
    ctx.fillRect(S * 0.5 - w / 2, y, w, S * 0.03);
  }

  // Neon signs with glow.
  const neon = ["#7ef9ff", "#ff4fd8", "#ffb347", "#8a5cff"];
  for (let i = 0; i < 9; i++) {
    const sx = S * (rng() < 0.5 ? 0.04 + rng() * 0.26 : 0.68 + rng() * 0.26);
    const sy = S * (0.2 + rng() * 0.34);
    const sw = S * (0.016 + rng() * 0.03);
    const sh = S * (0.08 + rng() * 0.16);
    ctx.save();
    ctx.shadowColor = neon[i % neon.length];
    ctx.shadowBlur = S * 0.03;
    ctx.strokeStyle = neon[i % neon.length];
    ctx.lineWidth = S * 0.006;
    if (rng() < 0.4) {
      ctx.strokeRect(sx, sy, sh, sw); // horizontal blade sign
    } else {
      ctx.strokeRect(sx, sy, sw, sh); // vertical sign
    }
    ctx.restore();
  }

  // Streetlights with pools of light on the wet road.
  for (const [px, py] of [[0.3, 0.56], [0.7, 0.56], [0.24, 0.72], [0.76, 0.72]]) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const pool = ctx.createRadialGradient(S * px, S * (py + 0.08), 0, S * px, S * (py + 0.08), S * 0.12);
    pool.addColorStop(0, "rgba(255,200,140,0.35)");
    pool.addColorStop(1, "rgba(255,200,140,0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
    ctx.fillStyle = "#0c0814";
    ctx.fillRect(S * px - S * 0.002, S * (py - 0.1), S * 0.004, S * 0.18);
    ctx.fillStyle = "rgba(255,214,150,0.9)";
    ctx.beginPath();
    ctx.arc(S * px, S * (py - 0.1), S * 0.008, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rain streaks.
  ctx.strokeStyle = "rgba(200,190,255,0.12)";
  ctx.lineWidth = S * 0.0015;
  for (let i = 0; i < 60; i++) {
    const x = rng() * S, y = rng() * S, l = S * (0.01 + rng() * 0.03);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - l * 0.15, y + l);
    ctx.stroke();
  }
}

function paintMarquee(ctx) {
  const rng = mulberry32(0x42e5);
  const S = SCENE_SIZE;
  const bg = ctx.createRadialGradient(S * 0.5, S * 0.42, S * 0.05, S * 0.5, S * 0.5, S * 0.75);
  bg.addColorStop(0, "#2a1046");
  bg.addColorStop(0.6, "#150a26");
  bg.addColorStop(1, "#0a0716");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // Stars.
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.15 + rng() * 0.5;
    ctx.fillStyle = "#e8e2ff";
    ctx.fillRect(rng() * S, rng() * S * 0.6, S * 0.002, S * 0.002);
  }
  ctx.globalAlpha = 1;

  // Spotlight beams crossing behind the sign.
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const [bx, dir] of [[0.12, 1], [0.88, -1]]) {
    const beam = ctx.createLinearGradient(S * bx, S, S * 0.5, S * 0.25);
    beam.addColorStop(0, "rgba(255,179,71,0.3)");
    beam.addColorStop(1, "rgba(255,179,71,0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(S * bx, S);
    ctx.lineTo(S * (bx + dir * 0.34), S * 0.08);
    ctx.lineTo(S * (bx + dir * 0.48), S * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // The marquee sign: glowing panel framed by bulb lights.
  const sign = { x: S * 0.14, y: S * 0.2, w: S * 0.72, h: S * 0.42 };
  ctx.save();
  ctx.shadowColor = "rgba(255,179,71,0.8)";
  ctx.shadowBlur = S * 0.06;
  ctx.fillStyle = "#1d1130";
  ctx.fillRect(sign.x, sign.y, sign.w, sign.h);
  ctx.restore();
  ctx.strokeStyle = "rgba(255,179,71,0.55)";
  ctx.lineWidth = S * 0.006;
  ctx.strokeRect(sign.x, sign.y, sign.w, sign.h);

  // Bulbs around the sign, alternating amber and violet.
  const step = S * 0.036;
  for (let x = sign.x; x <= sign.x + sign.w; x += step) {
    for (const y of [sign.y, sign.y + sign.h]) {
      bulb(ctx, x, y, Math.round(x / step) % 2 === 0 ? "#ffd28a" : "#b18cff", S * 0.007);
    }
  }
  for (let y = sign.y + step; y < sign.y + sign.h; y += step) {
    bulb(ctx, sign.x, y, "#ffd28a", S * 0.007);
    bulb(ctx, sign.x + sign.w, y, "#ffd28a", S * 0.007);
  }

  // Abstract show silhouettes inside the sign: a singer and a saxophone arc.
  ctx.fillStyle = "rgba(240,228,255,0.16)";
  ctx.beginPath();
  ctx.moveTo(sign.x + sign.w * 0.3, sign.y + sign.h * 0.9);
  ctx.quadraticCurveTo(sign.x + sign.w * 0.36, sign.y + sign.h * 0.2, sign.x + sign.w * 0.44, sign.y + sign.h * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sign.x + sign.w * 0.37, sign.y + sign.h * 0.26, sign.h * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(126,249,255,0.35)";
  ctx.lineWidth = S * 0.01;
  ctx.beginPath();
  ctx.arc(sign.x + sign.w * 0.62, sign.y + sign.h * 0.55, sign.h * 0.22, Math.PI * 1.2, Math.PI * 1.9);
  ctx.stroke();

  // Crowd heads along the bottom.
  ctx.fillStyle = "#080510";
  ctx.beginPath();
  ctx.moveTo(0, S);
  for (let x = 0; x <= S; x += S * 0.05) {
    const r = S * (0.022 + rng() * 0.014);
    const y = S * (0.9 + rng() * 0.03);
    ctx.lineTo(x - r, S);
    ctx.arc(x, y, r, Math.PI, 0);
  }
  ctx.lineTo(S, S);
  ctx.closePath();
  ctx.fill();
}

function bulb(ctx, x, y, color, r) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 4;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Photo loading
// ---------------------------------------------------------------------------

/**
 * Load an image URL or data URL. Resolves through onload/onerror, and
 * immediately when the image has already finished loading. Never decode().
 */
export function loadPhoto(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const finish = (ok, arg) => {
      if (settled) return;
      settled = true;
      if (ok) resolve(arg);
      else reject(arg);
    };
    img.onload = () => finish(true, img);
    img.onerror = () => finish(false, new Error("the image could not be loaded"));
    img.alt = "";
    img.src = url;
    // A cached or data-URL image can be complete before onload fires.
    if (img.complete && img.naturalWidth > 0) finish(true, img);
  });
}

// ---------------------------------------------------------------------------
// Colour grades
// ---------------------------------------------------------------------------

const GRADES = {
  sunset: {
    sky: [["#1c0b2e", 0], ["#4a1230", 0.45], ["#8a2436", 0.72], ["#3a1430", 1]],
    glow: "rgba(255,179,71,0.4)",
    glowX: 0.5,
    glowY: 0.56,
    ink: "#150823",
    windows: "#ffb347",
    accent: "#ffb347",
    title: "#f7f0e4",
    caption: "rgba(240,222,236,0.88)",
    tints: [
      ["overlay", "rgba(255,140,60,0.16)"],
      ["soft-light", "rgba(255,60,120,0.1)"]
    ]
  },
  neon: {
    sky: [["#05010f", 0], ["#12043a", 0.55], ["#2a0854", 0.82], ["#160428", 1]],
    glow: "rgba(138,92,255,0.42)",
    glowX: 0.62,
    glowY: 0.5,
    ink: "#080212",
    windows: "#7ef9ff",
    accent: "#8be9ff",
    title: "#f2ecff",
    caption: "rgba(214,200,255,0.88)",
    tints: [
      ["overlay", "rgba(120,40,255,0.18)"],
      ["screen", "rgba(0,255,220,0.06)"]
    ]
  },
  noir: {
    sky: [["#0b0b0e", 0], ["#202026", 0.6], ["#33333a", 0.85], ["#16161a", 1]],
    glow: "rgba(255,255,255,0.22)",
    glowX: 0.5,
    glowY: 0.5,
    ink: "#0d0d10",
    windows: "#e8e8e8",
    accent: "#d9d9de",
    title: "#f2f2f4",
    caption: "rgba(226,226,232,0.85)",
    tints: [
      ["saturation", "hsl(0,0%,50%)"],
      ["multiply", "rgba(28,28,36,0.18)"]
    ]
  },
  clean: {
    sky: [["#0c1020", 0], ["#141a30", 0.6], ["#1d2440", 1]],
    glow: "rgba(255,255,255,0.16)",
    glowX: 0.5,
    glowY: 0.5,
    ink: "#0a0e1c",
    windows: "#9fb4ff",
    accent: "#c8d4ff",
    title: "#f4f4f6",
    caption: "rgba(220,226,240,0.9)",
    tints: [["overlay", "rgba(255,255,255,0.05)"]]
  }
};

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

function drawBackdrop(ctx, w, h, grade) {
  const g = GRADES[grade] || GRADES.sunset;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  for (const [color, at] of g.sky) sky.addColorStop(at, color);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Sun glow.
  const glow = ctx.createRadialGradient(w * g.glowX, h * g.glowY, 0, w * g.glowX, h * g.glowY, Math.min(w, h) * 0.55);
  glow.addColorStop(0, g.glow);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawSkyline(ctx, w, h, grade) {
  const g = GRADES[grade] || GRADES.sunset;
  const rng = mulberry32(0x20261117);
  const base = h * 0.74;
  const u = Math.min(w, h) / 1080;
  let x = -w * 0.02;
  while (x < w * 1.02) {
    const bw = w * (0.03 + rng() * 0.06);
    const bh = h * (0.05 + rng() * 0.16);
    ctx.fillStyle = g.ink;
    ctx.fillRect(x, base - bh, bw, bh + h * 0.02);
    // A few lit windows.
    const cols = Math.max(1, Math.floor(bw / (w * 0.014)));
    const rows = Math.max(1, Math.floor(bh / (h * 0.028)));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (rng() < 0.16) {
          ctx.globalAlpha = 0.35 + rng() * 0.5;
          ctx.fillStyle = g.windows;
          ctx.fillRect(x + w * 0.004 + c * (bw / cols), base - bh + h * 0.012 + r * (bh / rows), Math.max(1, 3 * u), Math.max(1, 4 * u));
        }
      }
    }
    ctx.globalAlpha = 1;
    x += bw + w * 0.004;
  }
}

function drawPanel(ctx, rect, panel, state, index) {
  const src = state.photo || getSceneImage(state.photoName);
  const sw = src.naturalWidth || src.width;
  const sh = src.naturalHeight || src.height;
  const zoom = clamp(panel.zoom || 1, 1, 4);

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  const s = Math.max(rect.w / sw, rect.h / sh) * zoom;
  const dw = sw * s;
  const dh = sh * s;
  const maxX = Math.max(0, (dw - rect.w) / 2);
  const maxY = Math.max(0, (dh - rect.h) / 2);
  const ox = rect.x + (rect.w - dw) / 2 + clamp(panel.panX || 0, -1, 1) * rect.w;
  const oy = rect.y + (rect.h - dh) / 2 + clamp(panel.panY || 0, -1, 1) * rect.h;
  // The pan offsets above are clamped to what still covers the panel.
  const cx = clamp(ox, rect.x + (rect.w - dw) / 2 - maxX, rect.x + (rect.w - dw) / 2 + maxX);
  const cy = clamp(oy, rect.y + (rect.h - dh) / 2 - maxY, rect.y + (rect.h - dh) / 2 + maxY);
  ctx.drawImage(src, cx, cy, dw, dh);
  ctx.restore();

  const u = Math.min(rect.w, rect.h);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = Math.max(1, u * 0.004);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

  if (state.selected === index) {
    ctx.save();
    ctx.strokeStyle = "#ffb347";
    ctx.lineWidth = Math.max(2, u * 0.01);
    ctx.setLineDash([u * 0.05, u * 0.035]);
    ctx.strokeRect(rect.x + ctx.lineWidth, rect.y + ctx.lineWidth, rect.w - ctx.lineWidth * 2, rect.h - ctx.lineWidth * 2);
    ctx.restore();
  }
}

/** One line of display type with letter tracking. Returns its width. */
function drawTracked(ctx, text, x, y, tracking, align) {
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + tracking;
  total = Math.max(0, total - tracking);
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  return total;
}

function wrapHeadline(ctx, headline, maxWidth) {
  const words = headline.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (ctx.measureText(words.join(" ")).width <= maxWidth) return [words.join(" ")];
  // Two balanced lines: pick the middle-most split that fits.
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    if (ctx.measureText(a).width <= maxWidth && ctx.measureText(b).width <= maxWidth) best = [a, b];
  }
  return best || [headline];
}

function drawTitleBlock(ctx, w, h, state) {
  const g = GRADES[state.grade] || GRADES.sunset;
  const u = Math.min(w, h) / 1080;
  const margin = w * 0.03;
  const pad = 26 * u;
  const kickerSize = Math.max(11, 30 * u);
  const headSize = Math.max(18, 78 * u);
  const captionSize = Math.max(12, 34 * u);
  const kickerText = String(state.kicker || "").toUpperCase();
  const captionText = String(state.caption || "");
  const align = ["left", "center", "right"].includes(state.align) ? state.align : "left";
  const tracking = kickerSize * clamp(Number(state.tracking) || 0, 0, 0.5);
  ctx.textAlign = "left";

  ctx.font = `900 ${headSize}px "Arial Black", Impact, "Segoe UI", sans-serif`;
  const headLines = wrapHeadline(ctx, String(state.headline || ""), w * 0.8 - pad * 2);

  // Measure the plate.
  ctx.font = `700 ${kickerSize}px "Segoe UI", Arial, sans-serif`;
  const kickerWidth = kickerText ? drawTrackedWidth(ctx, kickerText, tracking) : 0;
  ctx.font = `italic 500 ${captionSize}px Georgia, "Times New Roman", serif`;
  const captionWidth = captionText ? ctx.measureText(captionText).width : 0;
  let headWidth = 0;
  ctx.font = `900 ${headSize}px "Arial Black", Impact, "Segoe UI", sans-serif`;
  for (const line of headLines) headWidth = Math.max(headWidth, ctx.measureText(line).width);

  const inner = Math.max(kickerWidth, headWidth, captionWidth);
  if (inner <= 0) return;
  const plateW = inner + pad * 2;
  const lineHeights = [
    kickerText ? kickerSize * 1.5 : 0,
    ...headLines.map(() => headSize * 1.12),
    captionText ? captionSize * 1.7 : 0
  ].filter((v) => v > 0);
  const plateH = lineHeights.reduce((a, b) => a + b, 0) + pad * 1.4;
  const bm = h * 0.045;
  const plateX = align === "center" ? (w - plateW) / 2 : align === "right" ? w - margin - plateW : margin;
  const plateY = h - bm - plateH;

  // Shadow plate.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 20 * u;
  ctx.shadowOffsetY = 8 * u;
  ctx.fillStyle = "rgba(8,6,16,0.6)";
  roundRect(ctx, plateX, plateY, plateW, plateH, 14 * u);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = Math.max(1, u);
  roundRect(ctx, plateX, plateY, plateW, plateH, 14 * u);
  ctx.stroke();

  // Text, laid out top to bottom inside the plate.
  const anchorX = align === "center" ? plateX + plateW / 2 : align === "right" ? plateX + plateW - pad : plateX + pad;
  ctx.textBaseline = "alphabetic";
  let y = plateY + pad * 0.7;

  if (kickerText) {
    ctx.font = `700 ${kickerSize}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = g.accent;
    y += kickerSize;
    drawTracked(ctx, kickerText, anchorX, y, tracking, align);
    y += kickerSize * 0.5;
    // Short accent rule.
    const ruleW = 34 * u;
    const rx = align === "center" ? anchorX - ruleW / 2 : align === "right" ? anchorX - ruleW : anchorX;
    ctx.fillStyle = g.accent;
    ctx.fillRect(rx, y + kickerSize * 0.25, ruleW, Math.max(1, 2 * u));
    y += kickerSize * 0.45;
  }

  ctx.fillStyle = g.title;
  ctx.textAlign = "left";
  for (const line of headLines) {
    y += headSize * 0.96;
    if (align === "center") {
      const lw = ctx.measureText(line).width;
      ctx.fillText(line, anchorX - lw / 2, y);
    } else if (align === "right") {
      const lw = ctx.measureText(line).width;
      ctx.fillText(line, anchorX - lw, y);
    } else {
      ctx.fillText(line, anchorX, y);
    }
  }

  if (captionText) {
    ctx.font = `italic 500 ${captionSize}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = g.caption;
    y += captionSize * 1.15;
    if (align === "center") {
      const lw = ctx.measureText(captionText).width;
      ctx.fillText(captionText, anchorX - lw / 2, y);
    } else if (align === "right") {
      ctx.fillText(captionText, anchorX - ctx.measureText(captionText).width, y);
    } else {
      ctx.fillText(captionText, anchorX, y);
    }
  }
}

function drawTrackedWidth(ctx, text, tracking) {
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + tracking;
  return Math.max(0, total - tracking);
}

function drawGrade(ctx, w, h, grade) {
  const g = GRADES[grade] || GRADES.sunset;
  for (const [op, color] of g.tints) {
    ctx.save();
    ctx.globalCompositeOperation = op;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Print effects
// ---------------------------------------------------------------------------

let grainTile = null;

function grainPattern(ctx) {
  if (!grainTile) {
    grainTile = document.createElement("canvas");
    grainTile.width = 192;
    grainTile.height = 192;
    const g = grainTile.getContext("2d");
    const img = g.createImageData(192, 192);
    const rng = mulberry32(0xc0ffee);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 108 + Math.floor(rng() * 80); // around neutral 128 for 'overlay'
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  return ctx.createPattern(grainTile, "repeat");
}

function drawGrain(ctx, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = grainPattern(ctx);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawHalftone(ctx, w, h) {
  const step = Math.max(6, Math.round(Math.min(w, h) / 90));
  const cols = Math.ceil(w / step);
  const rows = Math.ceil(h / step);
  const small = document.createElement("canvas");
  small.width = cols;
  small.height = rows;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(ctx.canvas, 0, 0, cols, rows);
  const data = sctx.getImageData(0, 0, cols, rows).data;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(10,8,18,0.85)";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      const rad = (1 - lum) * step * 0.38;
      if (rad > 0.35) {
        ctx.beginPath();
        ctx.arc(c * step + step / 2, r * step + step / 2, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawVignette(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// The cover
// ---------------------------------------------------------------------------

/**
 * Paint the whole poster for the given state onto ctx at w×h.
 * state is a defaultState() shape; nothing is mutated.
 */
export function drawCover(ctx, w, h, state) {
  const grade = GRADE_NAMES.includes(state.grade) ? state.grade : "sunset";
  const rects = panelRects(state.layout, w, h);
  const panels = state.panels || [];

  drawBackdrop(ctx, w, h, grade);
  if (state.layout !== "full") drawSkyline(ctx, w, h, grade);

  rects.forEach((rect, i) => {
    drawPanel(ctx, rect, panels[i] || { panX: 0, panY: 0, zoom: 1 }, state, i);
  });

  drawTitleBlock(ctx, w, h, state);
  drawGrade(ctx, w, h, grade);

  const fx = state.effects || {};
  if (fx.grain) drawGrain(ctx, w, h);
  if (fx.halftone) drawHalftone(ctx, w, h);
  if (fx.vignette) drawVignette(ctx, w, h);
}
