# Flower

A floating, flat-color Three.js flower. Every petal, leaf, seed, and stem is procedural 3D geometry.

## Run

Open Flower from the repository's main project list while serving the repository with any static HTTP server. This loads the pinned Three.js modules from jsDelivr, so no separate Flower server or build step is needed. For example, run `python3 -m http.server 8000` in the repository root, then open `http://localhost:8000/`.

For development with hot reload and a local npm installation of Three.js:

```sh
cd flower
npm install
npm run dev
```

Open the local URL Vite prints. `npm run build` creates a production build in `dist/`; `npm run preview` serves that build. Node.js 20.19+ or 22.12+ is required by Vite.

- Shape the bloom, petal count, petal length, and curl.
- Change stem height and bend, leaf length, and leaf count.
- Set sway and slow spin, or pause motion with the button below the flower.
- Pick one of five color palettes, make a random flower, or reset the shape.
- Drag to orbit, scroll or pinch to zoom, and use the circular arrow to reset the camera.
- Double-click any slider to restore its default. Sliders also support keyboard arrows and Home/End.

The layout adapts to small screens. The system reduced-motion preference disables idle movement and parameter transitions by default. Fonts use Google Fonts with local sans-serif fallbacks. The static version loads Three.js from jsDelivr; Vite development and production builds use the installed npm dependency instead.

Petal widths adapt to the number of petals and how far the bloom has opened. Each petal stays inside its own angular sector, and the two layers share a radial curve with a gap between them. Curl lifts the petals without folding them through their neighbors. Petals can overlap in the camera's view while their 3D surfaces stay separate.

`npm test` checks triangle-mesh intersections across the slider ranges and during animated transitions. The collision library is a development dependency used only by the tests.

`src/main.js` contains the scene and controls, `src/petal-geometry.js` defines the separated petal surfaces, and `src/style.css` contains the layout and styling. No image assets or 3D models are needed.
