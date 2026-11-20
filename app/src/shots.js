// Deterministic screenshot scenes. Each scene is prepared in the live editor, painted, then frozen.
export async function runShot(shot, query, editor) {
  if (shot !== 'cover' && shot !== 'editor') return;

  const name = query.get('photo') || 'pier';
  const caption = query.get('caption') || 'Sunset Heist';
  const preset = query.get('preset');
  const size = query.get('size') || '1080x1080';
  const allowedSizes = new Set(['1080x1080', '1080x1350', '1920x1080']);
  const allowedGrades = new Set(['sunset', 'neon', 'noir', 'clean']);

  document.body.classList.add(shot === 'cover' ? 'shot-cover' : 'shot-editor');
  const sample = await editor.loadSample(name);
  editor.setCaption(caption);
  if (allowedGrades.has(preset)) editor.setGrade(preset);
  if (allowedSizes.has(size)) editor.setSize(size);

  if (shot === 'cover') {
    const neonLandscape = preset === 'neon' && size === '1920x1080';
    editor.setLayout(neonLandscape ? 'full' : 'big-left');
    editor.prepareCover(sample);
  } else {
    editor.setLayout('big-left');
    await editor.prepareEditor(sample);
  }

  editor.setStatus(`${name} · ${caption}`);
  editor.redraw();
  editor.freeze();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
