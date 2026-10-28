# Stamps

Open `index.html`. Drop, paste, or choose an image and it becomes a postage stamp: a rectangle with semicircular perforations cut along all four edges. Download a transparent PNG sized to 1800 px on its long edge. No dependencies or build step.

- **Image:** click the source card, drop a file anywhere on the page, or paste from the clipboard. A generated dune sample is loaded on first visit and is replaced once you supply your own image.
- **Perforations:** the count is taken along the long edge; the short edge receives as many holes as fit at the same spacing. Hole size is a fraction of that spacing, capped below half so adjacent notches never overlap. Corners stay square, and the paper border never collapses into the holes.
- **Paper:** six tints from ecru to ink. A fine grain and a hairline inner edge are applied inside the silhouette; the edge line flips light on dark paper.
- **Export:** the download button renders a fresh canvas at export resolution rather than upscaling the preview. The background outside the perforated outline is fully transparent.

The preview renders at 1500 px on the long edge and is scaled down with CSS, so it stays sharp on high-density screens. Images are decoded locally with `createImageBitmap` (with an `<img>` fallback), drawn to a canvas, and never leave the browser. The photo is centre-cropped to fit the frame, and the stamp aspect follows the image within a 0.66–1.5 range so extreme panoramas still read as stamps.
