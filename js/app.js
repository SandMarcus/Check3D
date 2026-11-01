import { createViewer } from './viewer.js?v=20261101-5';

const $ = (id) => document.getElementById(id);
const viewer = createViewer($('viewerCanvas'), $('viewport'));
let currentFile = null;
let toastTimer;

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function openPicker() { $('fileInput').click(); }
$('openButton').addEventListener('click', openPicker);
$('welcomeOpen').addEventListener('click', openPicker);
$('fileInput').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (file) await loadFile(file);
  event.target.value = '';
});

async function loadFile(file) {
  const supported = /\.(stl|3mf|obj|glb|gltf|ply)$/i.test(file.name);
  if (!supported) return toast('Unsupported file. Choose STL, 3MF, OBJ, GLB, GLTF or PLY.');

  // Keep file parsing errors separate from UI updates. Once the viewer has
  // loaded the model, a later interface issue must not report a false load error.
  let info;
  try {
    info = await viewer.load(file);
  } catch (error) {
    console.error('3D model loading failed:', error);
    const detail = error?.message || String(error);
    toast(`Load error: ${detail.slice(0, 110)}`);
    return;
  }

  currentFile = file;
  $('welcome').hidden = true;
  $('welcome').classList.add('is-hidden');
  $('modelHud').hidden = false;
  $('modelName').textContent = file.name;
  $('fileSize').textContent = formatBytes(file.size);
  $('triangleCount').textContent = info.triangles.toLocaleString();
  $('dimX').textContent = `${info.size.x.toFixed(2)} mm`;
  $('dimY').textContent = `${info.size.y.toFixed(2)} mm`;
  $('dimZ').textContent = `${info.size.z.toFixed(2)} mm`;
  $('modelSizeHud').textContent = `${info.size.x.toFixed(1)} × ${info.size.y.toFixed(1)} × ${info.size.z.toFixed(1)} mm`;
  $('cutSlider').disabled = false;
  $('centerCut').disabled = false;
  $('invertCut').disabled = false;
  $('cutSlider').value = 0;
  viewer.setCut('z', 0, false);
  updateCutOutput();
  toast('3D model loaded successfully.');
}
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function updateCutOutput() {
  const value = viewer.getCutPosition();
  $('cutOutput').textContent = currentFile ? `${value.toFixed(2)} mm` : '—';
  $('rangeMin').textContent = currentFile ? `${viewer.getCutBounds().min.toFixed(1)} mm` : 'Min';
  $('rangeMax').textContent = currentFile ? `${viewer.getCutBounds().max.toFixed(1)} mm` : 'Max';
}
let selectedAxis = 'z';
document.querySelectorAll('.axis-button').forEach(button => {
  button.addEventListener('click', () => {
    selectedAxis = button.dataset.axis;
    document.querySelectorAll('.axis-button').forEach(b => b.classList.toggle('selected', b === button));
    viewer.setCut(selectedAxis, Number($('cutSlider').value) / 1000, $('invertCut').getAttribute('aria-pressed') === 'true');
    updateCutOutput();
  });
});
$('cutSlider').addEventListener('input', () => {
  viewer.setCut(selectedAxis, Number($('cutSlider').value) / 1000, $('invertCut').getAttribute('aria-pressed') === 'true');
  updateCutOutput();
});
$('centerCut').addEventListener('click', () => {
  $('cutSlider').value = 500;
  viewer.setCut(selectedAxis, .5, $('invertCut').getAttribute('aria-pressed') === 'true');
  updateCutOutput();
});
$('invertCut').addEventListener('click', () => {
  const next = $('invertCut').getAttribute('aria-pressed') !== 'true';
  $('invertCut').setAttribute('aria-pressed', String(next));
  $('invertCut').textContent = next ? 'Invert side: on' : 'Invert side';
  viewer.setCut(selectedAxis, Number($('cutSlider').value) / 1000, next);
});
$('clearCut').addEventListener('click', () => {
  $('cutSlider').value = 0;
  $('invertCut').setAttribute('aria-pressed', 'false');
  $('invertCut').textContent = 'Invert side';
  viewer.clearCut();
  updateCutOutput();
});
$('resetView').addEventListener('click', () => viewer.fit());
$('showGrid').addEventListener('change', e => viewer.showGrid(e.target.checked));
$('gridToggle').addEventListener('change', e => { $('showGrid').checked = e.target.checked; viewer.showGrid(e.target.checked); });
$('wireframe').addEventListener('change', e => viewer.setWireframe(e.target.checked));
$('autoRotate').addEventListener('change', e => viewer.setAutoRotate(e.target.checked));
$('modelColor').addEventListener('input', e => viewer.setColor(e.target.value));
document.querySelectorAll('[data-view], [data-camera]').forEach(button => button.addEventListener('click', () => viewer.setView(button.dataset.view || button.dataset.camera)));

document.querySelectorAll('.tool-tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tool-tab').forEach(t => t.classList.toggle('active', t === tab));
  ['cutPanel', 'infoPanel', 'viewPanel'].forEach(id => $(id).hidden = id !== tab.dataset.panel);
}));

// Drag-and-drop is available on desktop; mobile users use the native file picker.
const viewport = $('viewport');
viewport.addEventListener('dragover', e => { e.preventDefault(); viewport.classList.add('dragging'); });
viewport.addEventListener('dragleave', () => viewport.classList.remove('dragging'));
viewport.addEventListener('drop', e => {
  e.preventDefault(); viewport.classList.remove('dragging');
  const file = e.dataTransfer.files?.[0];
  if (file) loadFile(file);
});
