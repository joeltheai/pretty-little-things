# Flower

Open `index.html`, or choose **flower** from the main project list. Plain HTML, CSS, and JavaScript; no installation, build step, or server needed.

- Shape the bloom, petal count, length, and curl.
- Change stem height and bend, leaf length, and leaf count.
- Set sway and spin, pause motion, pick a palette, or randomize the flower.
- Drag to rotate, scroll or pinch to zoom. The circular arrow resets the camera.
- Double-click a slider to reset it. Arrow keys and Home/End work too.

Petal widths follow their spacing, and the two layers keep a gap to prevent intersections. The layout adapts to small screens and respects reduced motion.

`flower.js` contains the scene, geometry, and controls. `flower.css` contains the styles. `vendor/three.min.js` is a local copy of Three.js r180 with OrbitControls, under the included MIT license. Fonts load optionally from Google Fonts and fall back to local sans-serif fonts when offline. The flower itself needs no network connection.
