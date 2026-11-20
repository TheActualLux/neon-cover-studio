# Midnight Marquee

A poster-cover studio for the make.fun `gta6-cover-art-01` bounty: a dark
theatre-styled editor that renders a polished "Midnight Marquee" cover on a
canvas — amber and violet duotone, a hero cover frame flanked by film-strip
control panels, and a bottom-left title block pressed over a shadow plate.

Everything runs offline in the browser. There are no image files, no fonts,
no libraries, no build step and no network: photo panels come from your own
pictures or from built-in procedural scenes (a sunset pier, a neon boulevard,
a marquee stage) drawn from seeded canvas primitives.

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/TheActualLux/neon-cover-studio/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/TheActualLux/neon-cover-studio/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

## Running it

Open `app/index.html` directly, or serve the folder with the bundled static
server:

```
node serve.ts --port 8093
```

then visit `http://localhost:8093/`. The server is a small Node standard
library script that serves `app/` on the loopback interface and refuses
paths outside it.

## The studio

- **Photo** — load a local image, drag and drop it onto the cover, or paste
  one from the clipboard. The Pier / Boulevard / Marquee buttons swap in the
  built-in procedural scenes; Clear returns to the default scene.
- **Title block** — headline, kicker and caption text, left / center / right
  alignment, and letter tracking for the display type. The headline wraps to
  two balanced lines when one line would not fit.
- **Layout & panels** — five layouts: big-left with two right panels, a 2 × 2
  grid, full bleed, a tall three-stack and four vertical strips. Click a
  panel to select it, drag to pan it inside its frame, scroll to zoom it
  (or use the zoom slider, or Reset panel).
- **Grade & effects** — four colour grades (sunset, neon, noir, clean) and
  three print effects (grain, halftone, vignette) applied over the finished
  poster, caption included.
- **Export** — renders a fresh canvas and downloads a PNG at 1080 × 1080,
  1080 × 1350 or 1920 × 1080.
- **Keyboard** — `1`–`4` switch grade, `E` exports, `R` shuffles the panel
  pan/zoom (and the scene, when no photo is loaded).

## Deterministic shots

The same page renders fixed scenes from the query string; nothing is
captured or written to disk:

```
/?shot=cover&photo=pier&caption=Sunset%20Heist&size=1080x1080
/?shot=editor&photo=boulevard&caption=Boulevard%20Queen
/?shot=cover&photo=boulevard&caption=Neon%20Nights&preset=neon&size=1280x720
```

`shot=cover` shows only a canvas at the requested size; `shot=editor` boots
the editor prefilled with the named scene and caption. Parameters are
allowlisted: unknown scene names or presets fall back to defaults, and the
size is parsed as digits only and clamped.

## Layout of this repository

```
app/index.html      the page: hero cover frame, film-strip controls, title block
app/style.css       the dark amber/violet theatre chrome
app/src/cover.js    drawCover(ctx, w, h, state) — the whole poster renderer
app/src/main.js     the editor: input, panels, controls, export, shortcuts
app/src/shots.js    the deterministic shot entry point
main.ts             preflight + output: copies app/ and screenshots/ and
                    writes dossier.json through the vendored builder
vendor/             make.fun's dossier builder (the only vendored code)
serve.ts            the tiny local static server
screenshots/        the entry's three app renders
```

## Building an entry

`node main.ts` runs a preflight over the authored app — every expected file
present, the module import graph reachable from `app/index.html` and staying
inside `app/`, no network or root-absolute references, size limits respected,
screenshot dimensions reported — then copies `app/` and `screenshots/` into
`MAKEFUN_OUTPUT_DIR` (default `/output`) and writes `dossier.json` with the
vendored `buildDossier`. Node's standard library only; no install step.

## Licence

See `LICENSE`.
