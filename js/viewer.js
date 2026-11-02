import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createViewer(canvas, container) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x101318);
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000000);
  camera.up.set(0, 0, 1);
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
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.01;
  scene.add(grid);

  let modelRoot = null;
  let bounds = null;
  let cutAxis = 'z';
  let cutRatio = 0;
  let inverted = false;
  let cutPlane = null;
  let capGroup = null;
  let modelPivot = null;
  let pivotOrigin = new THREE.Vector3();
  const modelPosition = { x: 0, y: 0, z: 0 };
  let displayMode = 'solid';
  let backgroundMode = 'dark';
  const modelRotation = { x: 0, y: 0, z: 0 };

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

  function eachMaterial(callback) {
    if (!modelRoot) return;
    modelRoot.traverse(object => {
      if (!object.isMesh || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(callback);
    });
  }

  function disposeCap() {
    if (!capGroup) return;
    scene.remove(capGroup);
    capGroup.traverse(object => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material?.dispose());
    });
    capGroup = null;
  }

  function disposeModel() {
    disposeCap();
    if (!modelRoot) return;
    scene.remove(modelRoot);
    modelRoot.traverse(object => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material?.dispose());
    });
    modelRoot = null;
    bounds = null;
  }

  async function parseFile(file, buffer) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (extension === 'stl') {
      const geometry = new STLLoader().parse(buffer);
      geometry.computeVertexNormals();
      return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: 0xb9c5d4, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide
      }));
    }
    if (extension === '3mf') return new ThreeMFLoader().parse(buffer);
    if (extension === 'obj') return new OBJLoader().parse(new TextDecoder().decode(buffer));
    if (extension === 'ply') {
      const geometry = new PLYLoader().parse(buffer);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: 0xb9c5d4, roughness: 0.72, metalness: 0.05,
        side: THREE.DoubleSide, vertexColors: geometry.hasAttribute('color')
      });
      return new THREE.Mesh(geometry, material);
    }
    if (extension === 'glb' || extension === 'gltf') {
      const loader = new GLTFLoader();
      return await new Promise((resolve, reject) => {
        loader.parse(buffer, '', result => resolve(result.scene), reject);
      });
    }
    throw new Error('Unsupported file format');
  }

  function getInfo() {
    if (!modelRoot || !bounds) return null;
    const size = bounds.getSize(new THREE.Vector3());
    let triangles = 0;
    let volume = 0;
    let surfaceArea = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    modelRoot.updateMatrixWorld(true);
    modelRoot.traverse(object => {
      if (!object.isMesh || !object.geometry?.attributes.position) return;
      const geometry = object.geometry;
      const positions = geometry.attributes.position;
      const index = geometry.index;
      const count = index ? index.count : positions.count;
      triangles += Math.floor(count / 3);
      for (let i = 0; i + 2 < count; i += 3) {
        const ia = index ? index.getX(i) : i;
        const ib = index ? index.getX(i + 1) : i + 1;
        const ic = index ? index.getX(i + 2) : i + 2;
        a.fromBufferAttribute(positions, ia).applyMatrix4(object.matrixWorld);
        b.fromBufferAttribute(positions, ib).applyMatrix4(object.matrixWorld);
        c.fromBufferAttribute(positions, ic).applyMatrix4(object.matrixWorld);
        volume += a.dot(b.clone().cross(c)) / 6;
        ab.subVectors(b, a);
        ac.subVectors(c, a);
        surfaceArea += ab.cross(ac).length() * 0.5;
      }
    });
    return { size, triangles, volume: Math.abs(volume), surfaceArea };
  }

  async function load(file) {
    const buffer = await file.arrayBuffer();
    const loaded = await parseFile(file, buffer);
    const root = loaded.isObject3D ? loaded : new THREE.Group().add(loaded);
    root.updateMatrixWorld(true);
    const nextBounds = new THREE.Box3().setFromObject(root);
    if (nextBounds.isEmpty()) throw new Error('The file does not contain a visible 3D mesh');

    root.traverse(object => {
      if (!object.isMesh) return;
      if (!object.material) object.material = new THREE.MeshStandardMaterial({ color: 0xb9c5d4 });
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => {
        material.side = THREE.DoubleSide;
        if (material.color && material.userData.check3dOriginalColor === undefined) material.userData.check3dOriginalColor = material.color.getHex();
        material.clippingPlanes = [];
        material.needsUpdate = true;
      });
    });

    disposeModel();
    const center = nextBounds.getCenter(new THREE.Vector3());
    modelPivot = new THREE.Group();
    pivotOrigin.copy(center);
    modelPosition.x = modelPosition.y = modelPosition.z = 0;
    modelPivot.position.copy(center);
    root.position.sub(center);
    modelPivot.add(root);
    modelRoot = modelPivot;
    scene.add(modelRoot);
    modelRoot.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(modelRoot);
    fit();
    const size = bounds.getSize(new THREE.Vector3());
    const modelCenter = bounds.getCenter(new THREE.Vector3());
    grid.scale.setScalar(Math.max(size.length() / 200, 0.01));
    grid.position.set(modelCenter.x, modelCenter.y, bounds.min.z);
    applyCut();
    return getInfo();
  }

  function fit() {
    if (!modelRoot || !bounds) return;
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

  function applyDisplayMode() {
    eachMaterial(material => {
      material.wireframe = displayMode === 'wireframe';
      material.transparent = displayMode === 'xray';
      material.opacity = displayMode === 'xray' ? 0.28 : 1;
      material.depthWrite = displayMode !== 'xray';
      if (material.color) {
        if (displayMode === 'clay') material.color.set(0xb9c1cc);
        else if (material.userData.check3dUserColor) material.color.set(material.userData.check3dUserColor);
        else if (material.userData.check3dOriginalColor !== undefined) material.color.setHex(material.userData.check3dOriginalColor);
      }
      material.needsUpdate = true;
    });
  }

  function projectPoint(point, axis) {
    if (axis === 'x') return { u: point.y, v: point.z };
    if (axis === 'y') return { u: point.x, v: point.z };
    return { u: point.x, v: point.y };
  }

  function unprojectPoint(u, v, axis, planeValue) {
    if (axis === 'x') return new THREE.Vector3(planeValue, u, v);
    if (axis === 'y') return new THREE.Vector3(u, planeValue, v);
    return new THREE.Vector3(u, v, planeValue);
  }

  function addUniquePoint(points, point, epsilon = 1e-5) {
    for (const existing of points) {
      if (existing.distanceToSquared(point) <= epsilon * epsilon) return existing;
    }
    points.push(point.clone());
    return points[points.length - 1];
  }

  function buildCutCap() {
    disposeCap();
    if (!modelRoot || !cutPlane) return;

    const axis = cutAxis;
    const axisIndex = { x: 0, y: 1, z: 2 }[axis];
    const planeValue = cutPlane.constant * (cutPlane.normal.getComponent(axisIndex) < 0 ? -1 : 1);
    const segments = [];
    const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const planeDistance = point => cutPlane.distanceToPoint(point);
    const eps = Math.max((bounds?.getSize(new THREE.Vector3()).length() || 1) * 1e-6, 1e-5);

    modelRoot.updateMatrixWorld(true);
    modelRoot.traverse(object => {
      if (!object.isMesh || !object.geometry?.attributes.position) return;
      const geometry = object.geometry;
      const positions = geometry.attributes.position;
      const index = geometry.index;
      const count = index ? index.count : positions.count;
      for (let i = 0; i + 2 < count; i += 3) {
        const ia = index ? index.getX(i) : i;
        const ib = index ? index.getX(i + 1) : i + 1;
        const ic = index ? index.getX(i + 2) : i + 2;
        p[0].fromBufferAttribute(positions, ia).applyMatrix4(object.matrixWorld);
        p[1].fromBufferAttribute(positions, ib).applyMatrix4(object.matrixWorld);
        p[2].fromBufferAttribute(positions, ic).applyMatrix4(object.matrixWorld);
        const d = p.map(planeDistance);
        const intersections = [];
        for (let e = 0; e < 3; e++) {
          const a = p[e];
          const b = p[(e + 1) % 3];
          const da = d[e];
          const db = d[(e + 1) % 3];
          if (Math.abs(da) <= eps) intersections.push(a.clone());
          if ((da < -eps && db > eps) || (da > eps && db < -eps)) {
            const t = da / (da - db);
            intersections.push(a.clone().lerp(b, t));
          }
        }
        const unique = [];
        intersections.forEach(point => addUniquePoint(unique, point, eps));
        if (unique.length === 2 && unique[0].distanceToSquared(unique[1]) > eps * eps) segments.push(unique);
      }
    });

    if (!segments.length) return;

    const loops = [];
    const unused = segments.slice();
    while (unused.length) {
      const first = unused.pop();
      const loop = [first[0], first[1]];
      let extended = true;
      while (extended) {
        extended = false;
        const end = loop[loop.length - 1];
        for (let i = 0; i < unused.length; i++) {
          const seg = unused[i];
          if (seg[0].distanceToSquared(end) <= eps * eps) {
            loop.push(seg[1]); unused.splice(i, 1); extended = true; break;
          }
          if (seg[1].distanceToSquared(end) <= eps * eps) {
            loop.push(seg[0]); unused.splice(i, 1); extended = true; break;
          }
        }
      }
      if (loop.length >= 3 && loop[loop.length - 1].distanceToSquared(loop[0]) <= eps * eps) {
        loop.pop();
        loops.push(loop);
      }
    }

    if (!loops.length) return;

    const projected = loops.map(loop => loop.map(point => projectPoint(point, axis)));
    const areas = projected.map(loop => {
      let area = 0;
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        area += a.u * b.v - b.u * a.v;
      }
      return area * 0.5;
    });

    const capMeshes = [];
    const used = new Set();
    const pointInLoop = (point, loop) => {
      let inside = false;
      for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[i], b = loop[j];
        const intersects = ((a.v > point.v) !== (b.v > point.v)) && (point.u < (b.u - a.u) * (point.v - a.v) / ((b.v - a.v) || 1e-12) + a.u);
        if (intersects) inside = !inside;
      }
      return inside;
    };

    for (let i = 0; i < projected.length; i++) {
      if (used.has(i) || Math.abs(areas[i]) < eps * eps) continue;
      const contour = projected[i];
      const holes = [];
      for (let j = 0; j < projected.length; j++) {
        if (i === j || used.has(j) || Math.abs(areas[j]) < eps * eps) continue;
        if (pointInLoop(projected[j][0], contour)) {
          holes.push(projected[j]);
          used.add(j);
        }
      }
      used.add(i);

      const triangles = THREE.ShapeUtils.triangulateShape(contour, holes);
      if (!triangles.length) continue;
      const vertices = [];
      const pointMap = [];
      const allPoints = [contour, ...holes];
      allPoints.forEach(loop => loop.forEach(pt => pointMap.push(unprojectPoint(pt.u, pt.v, axis, planeValue))));
      triangles.forEach(tri => {
        tri.forEach(index => vertices.push(pointMap[index].x, pointMap[index].y, pointMap[index].z));
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: 0xb9c5d4,
        roughness: 0.72,
        metalness: 0.05,
        side: THREE.DoubleSide,
        clippingPlanes: []
      });
      const mesh = new THREE.Mesh(geometry, material);
      capMeshes.push(mesh);
    }

    if (capMeshes.length) {
      capGroup = new THREE.Group();
      capMeshes.forEach(mesh => capGroup.add(mesh));
      scene.add(capGroup);
    }
  }

  function applyCut() {
    if (!modelRoot || !bounds) return;
    const axisIndex = { x: 0, y: 1, z: 2 }[cutAxis];
    const lo = bounds.min.getComponent(axisIndex);
    const hi = bounds.max.getComponent(axisIndex);
    const position = lo + (hi - lo) * cutRatio;
    const normal = new THREE.Vector3();
    normal.setComponent(axisIndex, inverted ? -1 : 1);
    cutPlane = new THREE.Plane(normal, inverted ? position : -position);
    eachMaterial(material => {
      material.clippingPlanes = [cutPlane];
      material.needsUpdate = true;
    });
    buildCutCap();
  }

  return {
    load, fit, getInfo,
    setCut(axis, ratio, invert = false) { cutAxis = axis; cutRatio = Math.max(0, Math.min(1, ratio)); inverted = invert; applyCut(); },
    clearCut() {
      eachMaterial(material => { material.clippingPlanes = []; material.needsUpdate = true; });
      disposeCap();
      cutRatio = 0;
      inverted = false;
    },
    getCutPosition() { if (!bounds) return 0; const i = { x: 0, y: 1, z: 2 }[cutAxis]; return bounds.min.getComponent(i) + (bounds.max.getComponent(i) - bounds.min.getComponent(i)) * cutRatio; },
    getCutBounds() { if (!bounds) return { min: 0, max: 0 }; const i = { x: 0, y: 1, z: 2 }[cutAxis]; return { min: bounds.min.getComponent(i), max: bounds.max.getComponent(i) }; },
    showGrid(value) { grid.visible = value; },
    setWireframe(value) { displayMode = value ? 'wireframe' : 'solid'; applyDisplayMode(); },
    setDisplayMode(mode) { displayMode = mode; applyDisplayMode(); },
    setBackground(mode) { backgroundMode = mode; const colors = { dark: 0x101318, white: 0xe9edf2, sunset: 0x3a2930 }; renderer.setClearColor(colors[mode] ?? colors.dark); scene.background = new THREE.Color(colors[mode] ?? colors.dark); grid.visible = grid.visible; },
    setModelPosition(axis, value) { if (!modelPivot || !['x', 'y', 'z'].includes(axis)) return; modelPosition[axis] = Number(value) || 0; modelPivot.position.set(pivotOrigin.x + modelPosition.x, pivotOrigin.y + modelPosition.y, pivotOrigin.z + modelPosition.z); modelPivot.updateMatrixWorld(true); bounds = new THREE.Box3().setFromObject(modelPivot); applyCut(); },
    resetModelPosition() { if (!modelPivot) return; modelPosition.x = modelPosition.y = modelPosition.z = 0; modelPivot.position.copy(pivotOrigin); modelPivot.updateMatrixWorld(true); bounds = new THREE.Box3().setFromObject(modelPivot); applyCut(); },
    setModelRotation(axis, degrees) { if (!modelPivot || !['x', 'y', 'z'].includes(axis)) return; modelRotation[axis] = THREE.MathUtils.clamp(degrees, -180, 180); modelPivot.rotation.set(THREE.MathUtils.degToRad(modelRotation.x), THREE.MathUtils.degToRad(modelRotation.y), THREE.MathUtils.degToRad(modelRotation.z)); modelPivot.updateMatrixWorld(true); bounds = new THREE.Box3().setFromObject(modelPivot); applyCut(); },
    resetModelRotation() { if (!modelPivot) return; modelRotation.x = modelRotation.y = modelRotation.z = 0; modelPivot.rotation.set(0, 0, 0); modelPivot.updateMatrixWorld(true); bounds = new THREE.Box3().setFromObject(modelPivot); applyCut(); },
    setColor(value) { eachMaterial(material => { material.userData.check3dUserColor = value; if (material.color && displayMode !== 'clay') material.color.set(value); }); },
    setAutoRotate(value) { controls.autoRotate = value; },
    setView(view) { if (!modelRoot || !bounds) return; const center = bounds.getCenter(new THREE.Vector3()); const size = bounds.getSize(new THREE.Vector3()); const d = Math.max(size.x, size.y, size.z, 1) * 2.2; if (view === 'front') camera.position.set(center.x, center.y - d, center.z); if (view === 'top') camera.position.set(center.x, center.y, center.z + d); if (view === 'side') camera.position.set(center.x + d, center.y, center.z); controls.target.copy(center); controls.update(); }
  };
}
