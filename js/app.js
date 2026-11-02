import { createViewer } from './viewer.js?v=20261102-21';

const APP_VERSION = '1.3.0';
const $ = (id) => document.getElementById(id);
const viewer = createViewer($('viewerCanvas'), $('viewport'));
let currentFile = null;
let modelInfo = null;
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
  let info;
  try { info = await viewer.load(file); }
  catch (error) { console.error('3D model loading failed:', error); toast(`Load error: ${(error?.message || String(error)).slice(0, 110)}`); return; }
  currentFile = file;
  modelInfo = info;
  viewer.resetModelPosition();
  resetMoveControls();
  const moveLimit = Math.max(info.size.x, info.size.y, info.size.z, 1) * 2;
  ['x','y','z'].forEach(axis => {
    const slider = $('move' + axis.toUpperCase());
    slider.min = -moveLimit; slider.max = moveLimit; slider.step = Math.max(moveLimit / 2000, 0.01);
  });
  $('welcome').hidden = true; $('welcome').classList.add('is-hidden'); $('modelHud').hidden = false;
  $('modelName').textContent = file.name; $('fileSize').textContent = formatBytes(file.size);
  $('triangleCount').textContent = info.triangles.toLocaleString();
  $('meshIntegrity').textContent = info.watertight ? 'Watertight' : `Mesh issues (${info.boundaryEdges} open · ${info.nonManifoldEdges} non-manifold · ${info.orientationErrors} winding · ${info.degenerateTriangles} degenerate)`;
  const issueCount = info.boundaryEdges + info.nonManifoldEdges + info.orientationErrors + info.degenerateTriangles;
  $('integrityStatus').textContent = info.watertight ? 'PASS' : 'ISSUES FOUND';
  $('integrityStatus').className = 'integrity-status ' + (info.watertight ? 'is-pass' : 'is-warning');
  $('integrityHeadline').textContent = info.watertight ? 'No topology issues detected' : issueCount.toLocaleString() + ' topology findings';
  $('integritySummary').textContent = info.watertight
    ? info.triangles.toLocaleString() + ' triangles checked. The mesh passed all four integrity checks.'
    : info.triangles.toLocaleString() + ' valid triangles checked. Review the findings below before exporting or printing.';
  $('openEdgeCount').textContent = info.boundaryEdges.toLocaleString();
  $('nonManifoldCount').textContent = info.nonManifoldEdges.toLocaleString();
  $('windingCount').textContent = info.orientationErrors.toLocaleString();
  $('degenerateCount').textContent = info.degenerateTriangles.toLocaleString();
  const checks = [
    ['Open edges', info.boundaryEdges],
    ['Non-manifold edges', info.nonManifoldEdges],
    ['Face winding', info.orientationErrors],
    ['Degenerate triangles', info.degenerateTriangles]
  ];
  $('integrityChecklist').innerHTML = checks.map(([label, count]) =>
    '<div class="integrity-check"><span>' + label + '</span><strong class="' + (count ? 'has-issues' : 'is-clear') + '">' +
    (count ? count.toLocaleString() + ' found' : 'Clear') + '</strong></div>'
  ).join('');
  const integrityObjects = Array.isArray(info.objects) ? info.objects : [];
  $('integrityObjects').innerHTML = integrityObjects.map(object => {
    const issues = object.boundaryEdges + object.nonManifoldEdges + object.orientationErrors + object.degenerateTriangles;
    const detail = [
      object.boundaryEdges ? object.boundaryEdges + ' open' : '',
      object.nonManifoldEdges ? object.nonManifoldEdges + ' non-manifold' : '',
      object.orientationErrors ? object.orientationErrors + ' winding' : '',
      object.degenerateTriangles ? object.degenerateTriangles + ' degenerate' : ''
    ].filter(Boolean).join(' · ');
    return '<div class="integrity-object"><div class="integrity-object-copy"><strong>' + escapeHtml(object.name) + '</strong><small>' +
      object.triangles.toLocaleString() + ' triangles · ' + (issues ? escapeHtml(detail) : 'No issues found') +
      '</small></div>' + (issues ? '<button type="button" class="option-button integrity-highlight-button" data-integrity-object="' + object.id + '">Highlight ' + issues.toLocaleString() + '</button>' : '<span class="integrity-object-pass">Clear</span>') + '</div>';
  }).join('') || '<p class="note">No mesh objects found.</p>';
  $('integrityObjects').querySelectorAll('[data-integrity-object]').forEach(button => button.addEventListener('click', () => {
    if (typeof viewer.highlightIntegrityObject !== 'function') return toast('Object highlighting is not available in this build.');
    const count = viewer.highlightIntegrityObject(Number(button.dataset.integrityObject));
    toast(count ? 'Highlighted ' + count.toLocaleString() + ' affected triangles.' : 'No highlightable faces found.');
  }));
  if (typeof viewer.clearIntegrityHighlight === 'function') {
    $('clearIntegrityHighlight').onclick = () => viewer.clearIntegrityHighlight();
  }

  $('dimX').textContent = `${info.size.x.toFixed(2)} mm`; $('dimY').textContent = `${info.size.y.toFixed(2)} mm`; $('dimZ').textContent = `${info.size.z.toFixed(2)} mm`;
  $('modelSizeHud').textContent = `${info.size.x.toFixed(1)} × ${info.size.y.toFixed(1)} × ${info.size.z.toFixed(1)} mm`;
  $('bugReportButton').disabled = false;
  $('cutSlider').disabled = false; $('cutPositionInput').disabled = false; $('centerCut').disabled = false; $('invertCut').disabled = false; $('cutSlider').value = 0;
  viewer.setCut('z', 0, false); updateCutOutput(); toast('3D model loaded successfully.');
}
function resetMoveControls() { ['x','y','z'].forEach(axis => { $('move' + axis.toUpperCase()).value = 0; $('move' + axis.toUpperCase() + 'Value').value = 0; }); }
['x','y','z'].forEach(axis => {
  const slider = $('move' + axis.toUpperCase()), valueInput = $('move' + axis.toUpperCase() + 'Value');
  slider.addEventListener('input', () => { const value = Number(slider.value); valueInput.value = value; viewer.setModelPosition(axis, value); });
  valueInput.addEventListener('change', () => { const min = Number(slider.min), max = Number(slider.max), value = Math.max(min, Math.min(max, Number(valueInput.value) || 0)); valueInput.value = value; slider.value = value; viewer.setModelPosition(axis, value); });
});
$('resetMove').addEventListener('click', () => { viewer.resetModelPosition(); resetMoveControls(); });
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1048576).toFixed(2)} MB`; }
function updateCutOutput() { const value = viewer.getCutPosition(); const cutBounds = viewer.getCutBounds(); $('cutPositionInput').value = currentFile ? value.toFixed(2) : ''; $('cutPositionInput').min = cutBounds.min; $('cutPositionInput').max = cutBounds.max; $('rangeMin').textContent = currentFile ? `${cutBounds.min.toFixed(1)} mm` : 'Min'; $('rangeMax').textContent = currentFile ? `${cutBounds.max.toFixed(1)} mm` : 'Max'; if (currentFile) { const d = viewer.getCutDiagnostics(); $('cutDiagnostics').textContent = `Cut diagnostics · ${d.triangles.toLocaleString()} triangles checked · ${d.segments.toLocaleString()} segments · ${d.nodes.toLocaleString()} nodes · ${d.loops} closed loops · ${d.degree1} open / ${d.degree3plus} branched nodes · ${d.regions} filled regions / ${d.capTriangles.toLocaleString()} cap triangles · nearest endpoint pairs: ${(d.endpointPairs || []).map(pair => `[${pair.a.join(', ')} ↔ ${pair.b.join(', ')}: ${pair.distance}]`).join(' ') || 'none'}`; } else $('cutDiagnostics').textContent = 'Cut diagnostics will appear when a model is loaded.'; }
let selectedAxis = 'z';
document.querySelectorAll('.axis-button').forEach(button => button.addEventListener('click', () => { selectedAxis = button.dataset.axis; document.querySelectorAll('.axis-button').forEach(b => b.classList.toggle('selected', b === button)); viewer.setCut(selectedAxis, Number($('cutSlider').value) / 1000, $('invertCut').getAttribute('aria-pressed') === 'true'); updateCutOutput(); }));
$('cutSlider').addEventListener('input', () => { viewer.setCut(selectedAxis, Number($('cutSlider').value) / 1000, $('invertCut').getAttribute('aria-pressed') === 'true'); updateCutOutput(); });
$('cutPositionInput').addEventListener('change', () => { const input = $('cutPositionInput'); if (!currentFile || input.value === '') return; const bounds = viewer.getCutBounds(); const position = Math.max(bounds.min, Math.min(bounds.max, Number(input.value))); viewer.setCutPosition(selectedAxis, position, $('invertCut').getAttribute('aria-pressed') === 'true'); const ratio = (position - bounds.min) / (bounds.max - bounds.min || 1); $('cutSlider').value = Math.round(ratio * 1000); updateCutOutput(); });
$('centerCut').addEventListener('click', () => { $('cutSlider').value = 500; viewer.setCut(selectedAxis, .5, $('invertCut').getAttribute('aria-pressed') === 'true'); updateCutOutput(); });
$('invertCut').addEventListener('click', () => { const position = viewer.getCutPosition(); const next = $('invertCut').getAttribute('aria-pressed') !== 'true'; $('invertCut').setAttribute('aria-pressed', String(next)); $('invertCut').textContent = next ? 'Invert side: on' : 'Invert side'; viewer.setCutPosition(selectedAxis, position, next); updateCutOutput(); });
async function createBugReport() {
  if (!currentFile) return toast('Load a 3D model before reporting a bug.');
  const issueTab = window.open('about:blank', '_blank');
  try {
    const diagnostics = $('cutDiagnostics').textContent;
    const image = new Image(); image.src = viewer.captureScreenshot();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    const reportCanvas = document.createElement('canvas');
    reportCanvas.width = image.naturalWidth; reportCanvas.height = image.naturalHeight + 150;
    const ctx = reportCanvas.getContext('2d');
    ctx.fillStyle = '#101318'; ctx.fillRect(0, 0, reportCanvas.width, reportCanvas.height); ctx.drawImage(image, 0, 0);
    ctx.fillStyle = '#f1f3f6'; ctx.font = 'bold 22px system-ui'; ctx.fillText('Check3D cut bug report', 24, image.naturalHeight + 36);
    ctx.fillStyle = '#b9c5d4'; ctx.font = '15px system-ui';
    const details = ['File: ' + currentFile.name, 'Cut: ' + selectedAxis.toUpperCase() + ' = ' + viewer.getCutPosition().toFixed(3) + ' mm · Invert: ' + ($('invertCut').getAttribute('aria-pressed') === 'true' ? 'on' : 'off'), diagnostics];
    let y = image.naturalHeight + 65;
    for (const line of details) { let row = ''; for (const word of line.split(' ')) { const test = row ? row + ' ' + word : word; if (ctx.measureText(test).width > reportCanvas.width - 48 && row) { ctx.fillText(row, 24, y); y += 22; row = word; } else row = test; } if (row) { ctx.fillText(row, 24, y); y += 22; } }
    const blob = await new Promise(resolve => reportCanvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not create screenshot image.');
    const fileName = 'Check3D-v' + APP_VERSION + '-bug-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
    const downloadUrl = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = downloadUrl; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
    const body = ['## Bug description', 'Describe what looks wrong and where it happens.', '', '## Reproduction details', '- Model: ' + currentFile.name, '- Model size: ' + modelInfo.size.x.toFixed(2) + ' × ' + modelInfo.size.y.toFixed(2) + ' × ' + modelInfo.size.z.toFixed(2) + ' mm', '- Cut axis: ' + selectedAxis.toUpperCase(), '- Cut position: ' + viewer.getCutPosition().toFixed(3) + ' mm', '- Invert side: ' + ($('invertCut').getAttribute('aria-pressed') === 'true' ? 'On' : 'Off'), '- App version: ' + APP_VERSION, '', '## Diagnostics', '```text', diagnostics, '```', '', '**Screenshot:** Attach the downloaded ' + fileName + ' image before submitting.', '', '_The original 3D file is not uploaded._'].join('\n');
    const issueTitle = 'Check3D v' + APP_VERSION + ' – Cut bug: ' + currentFile.name;
    const url = 'https://github.com/SandMarcus/Check3D/issues/new?title=' + encodeURIComponent(issueTitle) + '&body=' + encodeURIComponent(body) + '&labels=bug';
    if (issueTab) issueTab.location.href = url; else window.location.href = url;
    toast('Screenshot saved. Attach it to the GitHub report.');
  } catch (error) { if (issueTab) issueTab.close(); console.error('Bug report creation failed:', error); toast('Could not create bug report: ' + (error.message || error)); }
}
$('bugReportButton').addEventListener('click', createBugReport);

$('clearCut').addEventListener('click', () => { $('cutSlider').value = 0; $('invertCut').setAttribute('aria-pressed', 'false'); $('invertCut').textContent = 'Invert side'; viewer.clearCut(); updateCutOutput(); });
$('resetView').addEventListener('click', () => viewer.fit());
$('showGrid').addEventListener('change', e => viewer.showGrid(e.target.checked)); $('gridToggle').addEventListener('change', e => { $('showGrid').checked = e.target.checked; viewer.showGrid(e.target.checked); });
$('wireframe').addEventListener('change', e => { if (e.target.checked) { $('xray').checked = false; $('clay').checked = false; viewer.setDisplayMode('wireframe'); } else viewer.setDisplayMode('solid'); });
$('xray').addEventListener('change', e => { if (e.target.checked) { $('wireframe').checked = false; $('clay').checked = false; viewer.setDisplayMode('xray'); } else viewer.setDisplayMode('solid'); });
$('clay').addEventListener('change', e => { if (e.target.checked) { $('wireframe').checked = false; $('xray').checked = false; viewer.setDisplayMode('clay'); } else viewer.setDisplayMode('solid'); });
$('backgroundSelect').addEventListener('change', e => viewer.setBackground(e.target.value));
['x','y','z'].forEach(axis => { const slider = $('rotate' + axis.toUpperCase()), output = $('rotate' + axis.toUpperCase() + 'Value'); slider.addEventListener('input', () => { output.value = slider.value; viewer.setModelRotation(axis, Number(slider.value)); }); output.addEventListener('change', () => { const value = Math.max(-180, Math.min(180, Number(output.value) || 0)); output.value = value; slider.value = value; viewer.setModelRotation(axis, value); }); });
$('resetRotation').addEventListener('click', () => { viewer.resetModelRotation(); ['x','y','z'].forEach(axis => { $('rotate' + axis.toUpperCase()).value = 0; $('rotate' + axis.toUpperCase() + 'Value').value = 0; }); });
$('autoRotate').addEventListener('change', e => viewer.setAutoRotate(e.target.checked)); $('modelColor').addEventListener('input', e => viewer.setColor(e.target.value));
document.querySelectorAll('[data-view], [data-camera]').forEach(button => button.addEventListener('click', () => viewer.setView(button.dataset.view || button.dataset.camera)));
document.querySelectorAll('.tool-tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.tool-tab').forEach(t => t.classList.toggle('active', t === tab)); ['cutPanel','infoPanel','viewPanel','rotationPanel','movePanel','integrityPanel'].forEach(id => $(id).hidden = id !== tab.dataset.panel); }));
const viewport = $('viewport'); viewport.addEventListener('dragover', e => { e.preventDefault(); viewport.classList.add('dragging'); }); viewport.addEventListener('dragleave', () => viewport.classList.remove('dragging')); viewport.addEventListener('drop', e => { e.preventDefault(); viewport.classList.remove('dragging'); const file = e.dataTransfer.files?.[0]; if (file) loadFile(file); });
document.querySelectorAll('.group-toggle').forEach(toggle => toggle.addEventListener('click', () => { const expanded = toggle.getAttribute('aria-expanded') === 'true'; toggle.setAttribute('aria-expanded', String(!expanded)); $(toggle.getAttribute('aria-controls')).hidden = expanded; }));

let printerCatalog = null;
const fallbackProfile = { name: 'Generic estimate · 0.20 mm', layerHeight: 0.20 };
async function loadPrinterCatalog() {
  try {
    const response = await fetch('./data/printer-catalog.json?v=20261102-01');
    if (!response.ok) throw new Error('Catalogue request failed');
    printerCatalog = await response.json();
    $('sliceManufacturer').innerHTML = '<option value="">Choose manufacturer</option>' + printerCatalog.vendors.map(v => '<option value="' + v.id + '">' + v.name + '</option>').join('');
    $('slicePrinterNote').textContent = 'Choose a manufacturer and exact printer model. Profile names are taken from the OrcaSlicer bundled catalogue; not every profile is manufacturer-maintained.';
  } catch (error) { console.error('Printer profile catalogue failed to load:', error); $('slicePrinterNote').textContent = 'Printer catalogue unavailable. Generic estimate is being used.'; }
}
function selectedVendor() { return printerCatalog?.vendors.find(v => v.id === $('sliceManufacturer').value) || null; }
function modelAlias(model, vendor) { return model.toLowerCase().startsWith(vendor.toLowerCase()) ? model.slice(vendor.length).trim() : model; }
function updatePrinterProfiles() {
  const vendor = selectedVendor(), modelSelect = $('slicePrinter'), previousModel = modelSelect.value;
  modelSelect.innerHTML = '<option value="">Choose printer model</option>' + (vendor ? vendor.models.map((m,i) => '<option value="' + i + '">' + m + '</option>').join('') : '');
  if (vendor && previousModel && Number(previousModel) < vendor.models.length) modelSelect.value = previousModel;
  updateProcessProfiles();
}
function getProcessProfiles() {
  const vendor = selectedVendor(), modelSelect = $('slicePrinter');
  const model = vendor && modelSelect.value !== '' ? vendor.models[Number(modelSelect.value)] : '';
  const alias = model && vendor ? modelAlias(model, vendor.name).toLowerCase() : '';
  return vendor && model ? vendor.processes.filter(p => p.name.toLowerCase().includes(alias)) : [];
}
function updateProcessProfiles() {
  const vendor = selectedVendor(), modelSelect = $('slicePrinter'), profileSelect = $('sliceProfile'), model = vendor && modelSelect.value !== '' ? vendor.models[Number(modelSelect.value)] : '', profiles = getProcessProfiles();
  if (!profiles.length) { profileSelect.innerHTML = '<option value="generic">Generic estimate · 0.20 mm</option>'; profileSelect.value = 'generic'; $('slicePrinterNote').textContent = model ? 'No model-specific process presets were found. Using a generic estimate.' : 'Choose a manufacturer and exact printer model.'; return; }
  profileSelect.innerHTML = profiles.map((p,i) => '<option value="' + i + '">' + p.name + '</option>').join(''); profileSelect.value = '0';
  $('slicePrinterNote').textContent = vendor.name + ' · ' + model + '. Process preset names are sourced from the OrcaSlicer bundle. The estimator uses the preset layer height; it does not execute the full slicer profile.';
}
function activeProfile() { const profiles = getProcessProfiles(), chosen = profiles[Number($('sliceProfile').value)], layer = chosen?.layerHeight || fallbackProfile.layerHeight; return { name: chosen?.name || fallbackProfile.name, layer }; }
const materials = { pla: { density: 1.24, flow: 8.5 }, petg: { density: 1.27, flow: 7.5 }, abs: { density: 1.04, flow: 9 }, asa: { density: 1.07, flow: 8.5 }, tpu: { density: 1.21, flow: 3.5 } };
function estimatePrint() {
  if (!modelInfo?.volume || modelInfo.volume <= 0) { toast('Could not calculate mesh volume. Check that the model is a closed solid.'); return; }
  const profile = activeProfile(), material = materials[$('sliceMaterial').value], infill = Number($('sliceInfill').value) / 100, height = modelInfo.size.z;
  const mode = $('sliceModelType').value;
  const wallThickness = 0.8;
  let printedVolume;
  if (mode === 'shell') {
    const shellVolume = Math.max(0, modelInfo.surfaceArea || 0) * wallThickness;
    const infillVolume = modelInfo.volume * infill * 0.72;
    printedVolume = Math.min(modelInfo.volume, shellVolume + infillVolume);
  } else {
    const materialFactor = Math.min(1, Math.max(0.12, 0.28 + infill * (1 - 0.28) * 0.72));
    printedVolume = modelInfo.volume * materialFactor;
  }
  const grams = printedVolume / 1000 * material.density;
  const filamentMm = printedVolume / (Math.PI * Math.pow(1.75 / 2, 2));
  const layers = Math.max(1, Math.ceil(height / profile.layer));
  const extrusionMinutes = printedVolume / material.flow / 60;
  const timeMinutes = (extrusionMinutes * 1.35 + layers * 0.16) * (materials[$('sliceMaterial').value] === materials.tpu ? 1.25 : 1);
  $('sliceGrams').textContent = grams < 10 ? grams.toFixed(1) + ' g' : Math.round(grams) + ' g';
  $('sliceLength').textContent = (filamentMm / 1000).toFixed(2) + ' m of 1.75 mm filament';
  $('sliceTime').textContent = formatDuration(timeMinutes); $('sliceLayers').textContent = layers.toLocaleString() + ' layers';
  $('sliceNote').textContent = mode === 'shell' ? 'Shell estimate assumes approximately 0.8 mm of printed wall material plus the selected infill. It is a planning estimate, not a full slicer calculation.' : 'Solid-model estimate assumes the loaded model volume is a solid and applies the selected infill. It is a planning estimate, not a full slicer calculation.';
}
function formatDuration(minutes) { const total = Math.max(1, Math.round(minutes)), hours = Math.floor(total / 60), mins = total % 60; return hours ? hours + ' h ' + mins + ' min' : mins + ' min'; }
function openSlice() { if (!currentFile) { toast('Open a 3D model first.'); return; } $('sliceModal').hidden = false; estimatePrint(); }
$('sliceButton').addEventListener('click', openSlice); $('closeSlice').addEventListener('click', () => $('sliceModal').hidden = true); $('sliceModal').addEventListener('click', event => { if (event.target === $('sliceModal')) $('sliceModal').hidden = true; });
$('sliceInfill').addEventListener('input', () => { $('infillLabel').textContent = $('sliceInfill').value + '%'; if (!$('sliceModal').hidden) estimatePrint(); });
$('sliceManufacturer').addEventListener('change', () => { updatePrinterProfiles(); if (!$('sliceModal').hidden) estimatePrint(); }); $('slicePrinter').addEventListener('change', () => { updateProcessProfiles(); if (!$('sliceModal').hidden) estimatePrint(); });
['sliceProfile','sliceMaterial','sliceModelType'].forEach(id => $(id).addEventListener('change', () => { if (!$('sliceModal').hidden) estimatePrint(); })); $('recalculateSlice').addEventListener('click', estimatePrint); loadPrinterCatalog();