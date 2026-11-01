import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createViewer(canvas, container) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x101318);
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000000);
  camera.position.set(150, 130, 150);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.screenSpacePanning = true;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 1.2;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x39404d, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1, 2, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb9d5ff, 0.8);
  fill.position.set(-2, -1, -1);
  scene.add(fill);

  const grid = new THREE.GridHelper(200, 40, 0x667080, 0x303641);
  grid.position.y = -0.01;
  scene.add(grid);

  let mesh = null;
  let bounds = null;
  let cutAxis = 'z';
  let cutRatio = 0;
  let inverted = false;
  let cutPlane = null;

  function resize() {
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener('orientationchange', resize);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  resize();

  function disposeMesh() {
    if (!mesh) return;
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh = null;
  }

  async function load(file) {
    const buffer = await file.arrayBuffer();
    const geometry = new STLLoader().parse(buffer);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    disposeMesh();
    const material = new THREE.MeshStandardMaterial({
      color: 0xb9c5d4, roughness: 0.72, metalness: 0.05,
      side: THREE.DoubleSide, clippingPlanes: []
    });
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    bounds = geometry.boundingBox.clone();
    fit();
    grid.scale.setScalar(Math.max(bounds.getSize(new THREE.Vector3()).length() / 200, 0.01));
    grid.position.set(bounds.getCenter(new THREE.Vector3()).x, bounds.min.y, bounds.getCenter(new THREE.Vector3()).z);
    applyCut();
    return getInfo();
  }

  function fit() {
    if (!mesh || !bounds) return;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const distance = maxDim * 1.9;
    camera.position.set(center.x + distance, center.y + distance * 0.75, center.z + distance);
    camera.near = Math.max(maxDim / 10000, 0.001);
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.minDistance = maxDim * 0.03;
    controls.maxDistance = maxDim * 30;
    controls.update();
  }

  function applyCut() {
    if (!mesh || !bounds) return;
    const min = bounds.min;
    const max = bounds.max;
    const axisIndex = { x: 0, y: 1, z: 2 }[cutAxis];
    const lo = min.getComponent(axisIndex);
    const hi = max.getComponent(axisIndex);
    const position = lo + (hi - lo) * cutRatio;
    const normal = new THREE.Vector3();
    normal.setComponent(axisIndex, inverted ? -1 : 1);
    cutPlane = new THREE.Plane(normal, inverted ? position : -position);
    mesh.material.clippingPlanes = [cutPlane];
    mesh.material.needsUpdate = true;
  }

  return {
    load,
    fit,
    getInfo() {
      if (!mesh) return null;
      const size = bounds.getSize(new THREE.Vector3());
      const position = mesh.geometry.attributes.position;
      return { size, triangles: Math.floor(position.count / 3) };
    },
    setCut(axis, ratio, invert = false) {
      cutAxis = axis;
      cutRatio = Math.max(0, Math.min(1, ratio));
      inverted = invert;
      applyCut();
    },
    clearCut() {
      if (mesh) mesh.material.clippingPlanes = [];
      cutRatio = 0;
      inverted = false;
    },
    getCutPosition() {
      if (!bounds) return 0;
      const i = { x: 0, y: 1, z: 2 }[cutAxis];
      return bounds.min.getComponent(i) + (bounds.max.getComponent(i) - bounds.min.getComponent(i)) * cutRatio;
    },
    getCutBounds() {
      if (!bounds) return { min: 0, max: 0 };
      const i = { x: 0, y: 1, z: 2 }[cutAxis];
      return { min: bounds.min.getComponent(i), max: bounds.max.getComponent(i) };
    },
    showGrid(value) { grid.visible = value; },
    setWireframe(value) { if (mesh) mesh.material.wireframe = value; },
    setColor(value) { if (mesh) mesh.material.color.set(value); },
    setAutoRotate(value) { controls.autoRotate = value; },
    setView(view) {
      if (!mesh || !bounds) return;
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const d = Math.max(size.x, size.y, size.z, 1) * 2.2;
      if (view === 'front') camera.position.set(center.x, center.y, center.z + d);
      if (view === 'top') camera.position.set(center.x, center.y + d, center.z);
      if (view === 'side') camera.position.set(center.x + d, center.y, center.z);
      controls.target.copy(center);
      controls.update();
    }
  };
}
