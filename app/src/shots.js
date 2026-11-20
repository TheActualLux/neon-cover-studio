// Midnight Marquee — deterministic shot entry.
//
// The page boots one of three ways, driven only by the query string:
//
//   ?shot=cover  &photo=pier      &caption=Sunset%20Heist [&preset=neon] [&size=1080x1080]
//       → a bare canvas at the requested size, nothing else on the page.
//   ?shot=editor &photo=boulevard &caption=Boulevard%20Queen
//       → the full editor, prefilled with that scene and caption.
//   (no shot parameter)
//       → the plain editor.
//
// Every parameter is allowlisted or sanitized: scene names must be one of
// the built-in procedural scenes, the preset must be a known grade, the
// size must match digits x digits and is clamped, and the caption is
// trimmed of control characters and length-capped before it is used as
// plain text. Shots are app rendering only — nothing here captures files.

import { GRADE_NAMES, defaultState, drawCover, getSceneImage, sceneName } from "./cover.js";
import { bootEditor } from "./main.js";

const params = new URLSearchParams(window.location.search);
const shot = (params.get("shot") || "").toLowerCase();

if (shot === "editor") {
  bootEditor({
    photoName: sceneName(params.get("photo")),
    caption: cleanText(params.get("caption"), 80)
  });
} else if (shot === "cover") {
  document.body.dataset.mode = "shot";
  const [w, h] = parseSize(params.get("size"));
  const grade = GRADE_NAMES.includes(params.get("preset")) ? params.get("preset") : "sunset";
  const state = defaultState({
    layout: "full",
    grade,
    caption: cleanText(params.get("caption"), 80),
    photo: getSceneImage(sceneName(params.get("photo")))
  });
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.id = "shot-canvas";
  drawCover(canvas.getContext("2d"), w, h, state);
  document.body.appendChild(canvas);
} else {
  bootEditor();
}

/** Keep plain, printable, bounded text for canvas or input values. */
function cleanText(value, max) {
  if (!value) return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

/** "WxH" with digits only, clamped to a sane canvas range. */
function parseSize(value) {
  const match = /^(?:\s*)(\d{2,4})x(\d{2,4})(?:\s*)$/.exec(value || "");
  const clampDim = (n) => Math.min(3840, Math.max(64, Number(n)));
  if (!match) return [1080, 1080];
  return [clampDim(match[1]), clampDim(match[2])];
}
