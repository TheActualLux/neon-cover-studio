# Midnight Marquee — offline poster cover studio

A small, dependency-free web app that turns a photo and a few words into poster cover art and exports it as a PNG at 1080x1080, 1080x1350 and 1920x1080.

Everything is drawn with canvas 2D and CSS: no libraries, no build step, no network, no font or image files. The bundled sample photographs live in `app/samples/`.

## Run it

```
node serve.ts --port 8093
```

Then open http://localhost:8093 — the editor loads with the sample photo already placed. Use `?shot=cover&photo=pier&caption=Sunset%20Heist&size=1080x1080`, `?shot=editor&photo=boulevard&caption=Boulevard%20Queen` or `?shot=cover&photo=boulevard&caption=Neon%20Nights&preset=neon&size=1920x1080` for the deterministic scenes used by the screenshots.

## What it does

- Photo library from file picker, drag-drop or Ctrl+V paste; click a panel to select it, drag to pan, wheel to zoom, double-click to cycle photos.
- Headline, kicker, caption, alignment and letter spacing, with a shadow plate behind the type.
- Five layouts (big-left with two right, 2x2, full-bleed, tall 3-stack, 4-strip) and four grades (sunset, neon, noir, clean), plus grain, halftone and vignette.
- PNG export through a fresh full-size canvas and `toBlob`; keys 1-4 pick a grade, E exports, R shuffles photos.

Entry for the make.fun poster competition:

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/TheActualLux/neon-cover-studio/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/TheActualLux/neon-cover-studio/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Built at [make.fun](https://make.fun).
