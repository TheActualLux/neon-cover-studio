const PHOTOS = new Set(['pier', 'boulevard']);
const SIZES = new Set(['1080x1080', '1080x1350', '1920x1080']);
export async function applyShot(name, state, api) {
  if (!['cover', 'editor'].includes(name)) return false;
  const query = new URLSearchParams(location.search);
  const photo = PHOTOS.has(query.get('photo')) ? query.get('photo') : 'pier';
  const preset = ['sunset', 'neon', 'noir', 'clean'].includes(query.get('preset')) ? query.get('preset') : 'sunset';
  const size = SIZES.has(query.get('size')) ? query.get('size') : '1080x1080';
  state.layout = 'big-left-with-two-right'; state.grade = preset;
  state.headline = query.get('caption') || (photo === 'pier' ? 'SUNSET HEIST' : 'BOULEVARD QUEEN');
  state.kicker = name === 'cover' ? 'A STORY AFTER DARK' : 'A CITY OF SECOND CHANCES';
  state.align = 'left'; state.tracking = .025; state.effects = { grain: true, halftone: true, vignette: true };
  state.exportSize = size;
  await api.loadSample(photo);
  state.panels.forEach((panel, index) => { panel.imageIndex = 0; panel.panX = 0; panel.panY = 0; panel.zoom = index === 0 ? 1.08 : 1.03; });
  const headline = document.querySelector('#headline'), kicker = document.querySelector('#kicker'), tracking = document.querySelector('#tracking');
  if (headline) headline.value = state.headline;
  if (kicker) kicker.value = state.kicker;
  if (tracking) tracking.value = String(Math.round(state.tracking * 100));
  const display = document.querySelector('#tracking-value'); if (display) display.textContent = `+${Math.round(state.tracking * 100)}`;
  api.setExportSize(size); api.setLayout(state.layout); api.setGrade(state.grade); api.updatePhotoStrip();
  return true;
}
