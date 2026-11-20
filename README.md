# Midnight Marquee

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/TheActualLux/neon-cover-studio/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/TheActualLux/neon-cover-studio/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

A dark two-column poster cover studio. A hero frame on the left previews the cover live;
a film strip on the right holds the panel thumbnails, type controls and effects. The
composition is drawn entirely with the Canvas 2D API — procedural backdrop, sun glow,
skyline silhouettes, cover-fit photo panels with per-frame pan and zoom, shadow-plate
captions, and an amber/violet duotone grade with grain, halftone and vignette.

Everything runs in the browser as plain ES modules. There are no libraries, no build
step, no network calls and no external fonts or images; the only photos shipped are the
two read-only samples under `app/samples/`.

## Using the studio

- **Photos** — use *Add photos*, drag files onto the window, or paste from the clipboard.
  JPEG, PNG, WebP and GIF up to 20 MB are accepted; anything else is refused with a message.
- **Frames** — click a frame in the preview or in the film strip to select it. Drag inside
  a frame to pan, scroll to zoom. Arrow keys nudge the selected frame, `[` and `]` cycle
  frames, and each frame's zoom/pan sliders are in the sidebar.
- **Layouts** — `big-left-with-two-right`, `2x2`, `full-bleed`, `tall-3-stack`, `4-strip`.
- **Type** — kicker, headline and caption, with left/center/right alignment and tracking.
- **Grades** — sunset, neon, noir and clean; keys `1`–`4` switch grades.
- **Export** — `E` (or *Export PNG*) renders a fresh offscreen canvas at
  1080 × 1080, 1080 × 1350 or 1920 × 1080 and downloads the PNG.
- **Shuffle** — `R` draws a new deterministic seed and fresh framing for every frame.

## Screenshot pages

The studio exposes deterministic pages for capture, driven only by the query string:

```
/?shot=cover&photo=pier&caption=Sunset%20Heist&size=1080x1080
/?shot=editor&photo=boulevard&caption=Boulevard%20Queen
/?shot=cover&photo=boulevard&caption=Neon%20Nights&preset=neon&size=1920x1080
```

`shot=cover` renders the canvas alone at the requested size; `shot=editor` renders the
whole studio with the sample loaded. `photo` selects `pier` or `boulevard`, `preset`
selects a grade, and `size` is `WIDTHxHEIGHT`.

## Running it

Serve the repository root (not `app/`) so `/samples/...` resolves:

```
node serve.ts --port 8093
```

Then open <http://127.0.0.1:8093/>. Node 26 runs the TypeScript server and entry directly.

## Building the output

```
MAKEFUN_OUTPUT_DIR=out node main.ts
```

The entry preflights the studio first: every authored app file must exist, every relative
module import reachable from `app/index.html` must resolve to a real file, and no file may
exceed 262144 bytes (screenshots are additionally capped at four). It then copies `app/`
and `screenshots/` into the output directory (`/output` by default, overridable with
`MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` through the shared `buildDossier` helper.

## Layout

```
app/index.html        studio shell
app/style.css         dark amber/violet theme
app/src/cover.js      drawCover(ctx, w, h, state) — the whole poster
app/src/main.js       editor controller: photos, frames, type, export
app/src/shots.js      deterministic screenshot pages
app/samples/          read-only sample photos
main.ts               preflight, copy and dossier entry
```
