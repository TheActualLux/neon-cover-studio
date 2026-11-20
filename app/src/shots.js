// Deterministic, one-paint preview scenes selected through URL query parameters.
const SIZES = {
  '1080x1080': { w: 1080, h: 1080 },
  '1080x1350': { w: 1080, h: 1350 },
  '1920x1080': { w: 1920, h: 1080 },
};
const GRADES = ['sunset', 'neon', 'noir', 'clean'];
const PHOTOS = ['pier', 'boulevard'];

export function parseShot(search) {
  const params = new URLSearchParams(search || '');
  const mode = params.get('shot');
  if (!mode) return null;
  if (mode !== 'cover' && mode !== 'editor') throw new Error('Unknown shot mode: ' + mode);
  const photo = PHOTOS.includes(params.get('photo')) ? params.get('photo') : 'pier';
  const sizeKey = params.get('size') || '1080x1080';
  return {
    mode,
    photo,
    caption: (params.get('caption') || (photo === 'pier' ? 'Sunset Heist' : 'Neon Nights')).slice(0, 72),
    grade: GRADES.includes(params.get('preset')) ? params.get('preset') : 'sunset',
    size: SIZES[sizeKey] || SIZES['1080x1080'],
  };
}

export async function runShot(shot, api) {
  if (!shot || !api) throw new TypeError('A parsed shot and scene API are required.');
  await api.usePhotoEverywhere(shot.photo);
  api.setCaption(shot.caption);
  api.setGrade(shot.grade);
  await api.whenImagesReady();
  if (shot.mode === 'cover') api.enterCoverMode(shot.size);
  api.drawOnce();
  api.freeze();
}
