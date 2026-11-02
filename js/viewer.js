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
      return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb9c5d4, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide }));
    }
    if (extension === '3mf') return new ThreeMFLoader().parse(buffer);
    if (extension === 'obj') return new OBJLoader().parse(new TextDecoder().decode(buffer));
    if (extension === 'ply') {
      const geometry = new PLYLoader().parse(buffer);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb9c5d4, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide, vertexColors: geometry.hasAttribute('color') }));
    }
    if (extension === 'glb' || extension === 'gltf') {
      const loader = new GLTFLoader();
      return await new Promise((resolve, reject) => loader.parse(buffer, '', result => resolve(result.scene), reject));
    }
    throw new Error('Unsupported file format');
  }

  function getInfo() {
    if (!modelRoot || !bounds) return null;
    const size = bounds.getSize(new THREE.Vector3());
    let triangles = 0, volume = 0, surfaceArea = 0;
    const edgeCounts = new Map();
    const weldEpsilon = Math.max(size.length() * 1e-7, 1e-7);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    modelRoot.updateMatrixWorld(true);
    modelRoot.traverse(object => {
      if (!object.isMesh || !object.geometry?.attributes.position) return;
      const geometry = object.geometry, positions = geometry.attributes.position, index = geometry.index;
      const count = index ? index.count : positions.count;
      triangles += Math.floor(count / 3);
      for (let i = 0; i + 2 < count; i += 3) {
        const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
        a.fromBufferAttribute(positions, ia).applyMatrix4(object.matrixWorld);
        b.fromBufferAttribute(positions, ib).applyMatrix4(object.matrixWorld);
        c.fromBufferAttribute(positions, ic).applyMatrix4(object.matrixWorld);
        volume += a.dot(b.clone().cross(c)) / 6;
        ab.subVectors(b, a); ac.subVectors(c, a); surfaceArea += ab.cross(ac).length() * 0.5;
      }
    });
    let boundaryEdges=0,nonManifoldEdges=0;
    for(const uses of edgeCounts.values()){if(uses===1)boundaryEdges++;else if(uses!==2)nonManifoldEdges++;}
    return {size,triangles,volume:Math.abs(volume),surfaceArea,watertight:edgeCounts.size>0&&boundaryEdges===0&&nonManifoldEdges===0,boundaryEdges,nonManifoldEdges};
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
    const size = bounds.getSize(new THREE.Vector3()), modelCenter = bounds.getCenter(new THREE.Vector3());
    grid.scale.setScalar(Math.max(size.length() / 200, 0.01));
    grid.position.set(modelCenter.x, modelCenter.y, bounds.min.z);
    applyCut();
    return getInfo();
  }

  function fit() {
    if (!modelRoot || !bounds) return;
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1), distance = maxDim * 1.9;
    camera.position.set(center.x + distance, center.y + distance * 0.75, center.z + distance);
    camera.near = Math.max(maxDim / 10000, 0.001); camera.far = maxDim * 100; camera.updateProjectionMatrix();
    controls.target.copy(center); controls.minDistance = maxDim * 0.03; controls.maxDistance = maxDim * 30; controls.update();
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
    for (const existing of points) if (existing.distanceToSquared(point) <= epsilon * epsilon) return existing;
    points.push(point.clone()); return points[points.length - 1];
  }

  function buildCutCap() {
    disposeCap();
    if (!modelRoot || !cutPlane || !bounds) return;
    const axis = cutAxis, axisIndex = { x: 0, y: 1, z: 2 }[axis];
    const lo = bounds.min.getComponent(axisIndex), hi = bounds.max.getComponent(axisIndex);
    const planeValue = lo + (hi - lo) * cutRatio;
    const segments = [], p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const planeDistance = point => cutPlane.distanceToPoint(point);
    const eps = Math.max(bounds.getSize(new THREE.Vector3()).length() * 1e-6, 1e-5);

    modelRoot.updateMatrixWorld(true);
    modelRoot.traverse(object => {
      if (!object.isMesh || !object.geometry?.attributes.position) return;
      const geometry = object.geometry, positions = geometry.attributes.position, index = geometry.index;
      const count = index ? index.count : positions.count;
      for (let i = 0; i + 2 < count; i += 3) {
        const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
        p[0].fromBufferAttribute(positions, ia).applyMatrix4(object.matrixWorld);
        p[1].fromBufferAttribute(positions, ib).applyMatrix4(object.matrixWorld);
        p[2].fromBufferAttribute(positions, ic).applyMatrix4(object.matrixWorld);
        const d = p.map(planeDistance), intersections = [];
        for (let e = 0; e < 3; e++) {
          const a = p[e], b = p[(e + 1) % 3], da = d[e], db = d[(e + 1) % 3];
          if (Math.abs(da) <= eps) intersections.push(a.clone());
          if ((da < -eps && db > eps) || (da > eps && db < -eps)) intersections.push(a.clone().lerp(b, da / (da - db)));
        }
        const unique = [];
        intersections.forEach(point => addUniquePoint(unique, point, eps));
        if (unique.length === 2 && unique[0].distanceToSquared(unique[1]) > eps * eps) segments.push(unique);
      }
    });
    if (!segments.length) return;

    // Weld duplicated STL triangle vertices into a graph; closed contours have degree 2.
    const nodeKey = point => [point.x, point.y, point.z].map(value => Math.round(value / eps)).join(',');
    const nodes = new Map(), adjacency = new Map(), edgeKeys = new Set();
    const getNode = point => { const key=nodeKey(point); if(!nodes.has(key)) nodes.set(key,point.clone()); if(!adjacency.has(key)) adjacency.set(key,[]); return key; };
    for (const segment of segments) {
      const a=getNode(segment[0]), b=getNode(segment[1]); if(a===b) continue;
      const edgeKey=a<b?a+'|'+b:b+'|'+a; if(edgeKeys.has(edgeKey)) continue;
      edgeKeys.add(edgeKey); adjacency.get(a).push(b); adjacency.get(b).push(a);
    }
    const loops=[], visitedEdges=new Set();
    const edgeKeyFor=(a,b)=>a<b?a+'|'+b:b+'|'+a;
    for(const [startKey,neighbors] of adjacency) {
      if(neighbors.length!==2) continue;
      for(const firstNext of neighbors) {
        if(visitedEdges.has(edgeKeyFor(startKey,firstNext))) continue;
        const points=[nodes.get(startKey)]; let previous=startKey,current=firstNext,closed=false,guard=0;
        while(guard++<=edgeKeys.size+1) {
          const edgeKey=edgeKeyFor(previous,current); if(visitedEdges.has(edgeKey)) break;
          visitedEdges.add(edgeKey);
          if(current===startKey){closed=true;break;}
          if(adjacency.get(current)?.length!==2) break;
          points.push(nodes.get(current));
          const next=adjacency.get(current).find(key=>key!==previous); if(!next) break;
          previous=current;current=next;
        }
        if(closed&&points.length>=3) loops.push(points);
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
    const pointInLoop = (point, loop) => {
      let inside = false;
      for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[i], b = loop[j];
        if (((a.v > point.v) !== (b.v > point.v)) && point.u < (b.u - a.u) * (point.v - a.v) / ((b.v - a.v) || 1e-12) + a.u) inside = !inside;
      }
      return inside;
    };

    // Determine true nesting depth. A simple "any enclosing loop = hole" rule
    // breaks nested solids/cavities and can turn a solid CAD section into a shell.
    // Even nesting depth is material; odd depth is a cavity.
    const parent = new Array(projected.length).fill(-1);
    for (let i = 0; i < projected.length; i++) {
      const point = projected[i][0];
      let best = -1, bestArea = Infinity;
      for (let j = 0; j < projected.length; j++) {
        if (i === j || Math.abs(areas[j]) <= Math.abs(areas[i])) continue;
        if (pointInLoop(point, projected[j])) {
          const area = Math.abs(areas[j]);
          if (area < bestArea) { best = j; bestArea = area; }
        }
      }
      parent[i] = best;
    }
    const depth = new Array(projected.length).fill(0);
    for (let i = 0; i < projected.length; i++) {
      let current = parent[i], guard = 0;
      while (current >= 0 && guard++ < projected.length) { depth[i]++; current = parent[current]; }
    }

    const capMeshes = [];
    for (let i = 0; i < projected.length; i++) {
      if (Math.abs(areas[i]) < eps * eps || depth[i] % 2 !== 0) continue;

      // Only direct odd-depth children belong as holes of this filled region.
      const holes = [];
      for (let j = 0; j < projected.length; j++) {
        if (parent[j] === i && depth[j] === depth[i] + 1) holes.push(projected[j]);
      }

      const triangles = THREE.ShapeUtils.triangulateShape(projected[i], holes);
      if (!triangles.length) continue;

      const pointMap = [];
      [projected[i], ...holes].forEach(loop => loop.forEach(pt => pointMap.push(unprojectPoint(pt.u, pt.v, axis, planeValue))));
      const vertices = [];
      triangles.forEach(tri => tri.forEach(index => {
        const point = pointMap[index];
        vertices.push(point.x, point.y, point.z);
      }));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({ color: 0xb9c5d4, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide, clippingPlanes: [] });
      capMeshes.push(new THREE.Mesh(geometry, material));
    }

    if (capMeshes.length) {
      capGroup = new THREE.Group();
      capMeshes.forEach(mesh => capGroup.add(mesh));
      scene.add(capGroup);
    }
  }

  function applyCut() {
    if (!modelRoot || !bounds) return;
    const axisIndex = { x: 0, y: 1, z: 2 }[cutAxis], lo = bounds.min.getComponent(axisIndex), hi = bounds.max.getComponent(axisIndex);
    const position = lo + (hi - lo) * cutRatio, normal = new THREE.Vector3();
    normal.setComponent(axisIndex, inverted ? -1 : 1);
    cutPlane = new THREE.Plane(normal, inverted ? position : -position);
    eachMaterial(material => { material.clippingPlanes = [cutPlane]; material.needsUpdate = true; });
    buildCutCap();
  }

  return {
    load, fit, getInfo,
    setCut(axis, ratio, invert = false) { cutAxis = axis; cutRatio = Math.max(0, Math.min(1, ratio)); inverted = invert; applyCut(); },
    clearCut() { eachMaterial(material => { material.clippingPlanes = []; material.needsUpdate = true; }); disposeCap(); cutRatio = 0; inverted = false; },
    getCutPosition() { if (!bounds) return 0; const i = { x: 0, y: 1, z: 2 }[cutAxis]; return bounds.min.getComponent(i) + (bounds.max.getComponent(i) - bounds.min.getComponent(i)) * cutRatio; },
    getCutBounds() { if (!bounds) return { min: 0, max: 0 }; const i = { x: 0, y: 1, z: 2 }[cutAxis]; return { min: bounds.min.getComponent(i), max: bounds.max.getComponent(i) }; },
    showGrid(value) { grid.visible = value; },
    setWireframe(value) { displayMode = value ? 'wireframe' : 'solid'; applyDisplayMode(); },
    setDisplayMode(mode) { displayMode = mode; applyDisplayMode(); },
    setBackground(mode) { backgroundMode = mode; const colors = { dark: 0x101318, white: 0xe9edf2, sunset: 0x3a2930 }; renderer.setClearColor(colors[mode] ?? colors.dark); scene.background = new THREE.Color(colors[mode] ?? colors.dark); },
    setModelPosition(axis, value) { if (!modelPivot || !['x', 'y', 'z'].includes(axis)) return; modelPosition[axis] = Number(value) || 0; modelPivot.position.set(pivotOrigin.x + modelPosition.x, pivotOrigin.y + modelPosition.y, pivotOrigin.z + modelPosition.z); modelPivot.updateMatrixWorld(true); bounds = new THREE.Box3().setFromObject(modelPivot); applyCut(); },
    resetModelPosition() { if (!modelPivot) return; modelPosition.x = modelPosition.y = modelPosition.z = 0; modelPivot.position.copy(pivotOrigin); modelPivot.updateMatrixWorld(true); bounds = new THREE.Box3().setFromObject(modelPivot); applyCut(); },
    setModelRotation(axis, degrees) { if (!modelPivot || !['x', 'y', 'z'].includes(axis)) return; modelRotation[axis] = THREE.MathUtils.clamp(degrees, -180, 180); modelPivot.rotation.set(THREE.MathUtils.degToRad(modelRotation.x), THREE.MathUtils.degToRad(modelRotation.y), THREE.MathUtils.degToRad(modelRotation.z)); modelPivot.updateMatrixWorld(true); bounds = new THREE.Box3().setFromObject(modelPivot); applyCut(); },
    resetModelRotation() { if (!modelPivot) return; modelRotation.x = modelRotation.y = modelRotation.z = 0; modelPivot.rotation.set(0, 0, 0); modelPivot.updateMatrixWorld(true); bounds = new THREE.Box3().setFromObject(modelPivot); applyCut(); },
    setColor(value) { eachMaterial(material => { material.userData.check3dUserColor = value; if (material.color && displayMode !== 'clay') material.color.set(value); }); },
    setAutoRotate(value) { controls.autoRotate = value; },
    setView(view) { if (!modelRoot || !bounds) return; const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3()), d = Math.max(size.x, size.y, size.z, 1) * 2.2; if (view === 'front') camera.position.set(center.x, center.y - d, center.z); if (view === 'top') camera.position.set(center.x, center.y, center.z + d); if (view === 'side') camera.position.set(center.x + d, center.y, center.z); controls.target.copy(center); controls.update(); }
  };
}
