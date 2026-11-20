// Deterministic render scenes, driven by the URL, for screenshots and gate checks.
// The page stays offline and identical between runs: parse the query, load the named
// sample, apply the caption and preset, wait for the real image decode, draw once,
// freeze. No timing guesses — every await is an actual image decode.
//
// Scenes:
//   ?shot=cover&photo=pier&caption=Sunset%20Heist&size=1080x1080
//       -> the cover alone, full page, no editor chrome, sunset grade, big-left panels.
//   ?shot=editor&photo=boulevard&caption=Boulevard%20Queen
//       -> the whole editor, boulevard in every panel, controls visible.
//   ?shot=cover&photo=boulevard&caption=Neon%20Nights&preset=neon&size=1920x1080
//       -> the canvas alone, landscape, neon grade.

/** Parse the query into a scene descriptor, or null when this is an ordinary visit. */
export function parseShot(search) {
  const q = new URLSearchParams(search);
  const mode = q.get('shot');
  if (mode !== 'cover' && mode !== 'editor') return null;
  const m = /^(\d{1,4})x(\d{1,4})$/.exec(q.get('size') ?? '');
  return {
    mode,
    photo: q.get('photo') ?? 'pier',
    caption: q.get('caption') ?? '',
    preset: q.get('preset') ?? '',
    size: m ? { w: Math.min(Number(m[1]), 4096), h: Math.min(Number(m[2]), 4096) } : { w: 1080, h: 1080 },
  };
}

/** Drive the editor through one scene and freeze it. api is the editor facade from
 * main.js (see shotApi there). */
export async function runShot(shot, api) {
  document.body.classList.add(shot.mode === 'cover' ? 'shot-cover' : 'shot-editor');
  await api.usePhotoEverywhere(shot.photo);
  if (shot.caption) api.setCaption(shot.caption);
  if (shot.preset) api.setGrade(shot.preset);
  await api.whenImagesReady();
  if (shot.mode === 'cover') api.enterCoverMode(shot.size);
  api.drawOnce();
  api.freeze();
  return shot;
}
