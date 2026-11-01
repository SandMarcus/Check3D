# Check3D

A mobile-first, browser-based 3D model inspection tool for GitHub Pages.

## Supported formats
- **STL** — binary and ASCII
- **3MF** — 3D Manufacturing Format
- **OBJ**
- **GLB** — binary glTF, including embedded materials and textures
- **GLTF** — self-contained files and embedded data URIs
- **PLY**

## Features
- Load supported 3D files locally in the browser
- Touch-friendly 3D orbit, pinch zoom and pan (Three.js OrbitControls)
- X, Y and Z clipping-plane section cuts
- Cut position slider, center cut and invert side
- Model dimensions, triangle count and file size
- Grid, wireframe, model color and quick camera views
- Responsive phone and desktop layouts

## Run locally
Because this project uses JavaScript modules, serve the folder through a local web server rather than opening `index.html` directly. For example, with Python installed:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Publish with GitHub Pages
1. Create or open your GitHub repository.
2. Upload the contents of this folder (keep `index.html` at the repository root).
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then save.
6. Open the Pages URL GitHub provides.

## Notes
- Three.js is loaded from jsDelivr, so the published page needs an internet connection.
- Files are read locally in the browser and are not uploaded to GitHub or a server.
- A `.gltf` file that references separate external texture or buffer files may not load when selected alone. Use `.glb` for a portable model.
- STL does not reliably contain unit metadata; this viewer assumes millimetres. Dimensions in other formats depend on the source model's units.
- The section cut is a visual clipping plane. It does not create a capped solid cross-section yet.
