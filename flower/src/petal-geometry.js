import * as THREE from "three";

// Petals are graphs of the same radial surface. Angular sectors separate
// neighbors, and a vertical offset separates the two layers at every radius.
// Curl changes height without pulling a petal back through the flower's axis.
export function createPetalGeometry({ count, open, length, curl, layer }) {
  const rows = 24;
  const columns = 12;
  const layerCount = count - layer * 2;
  const halfSector = (Math.PI / layerCount) * 0.88;
  const angle = -1.39 + open * 1.49;
  const rootRadius = 0.1 + open * 0.17;
  const radialSpan = length * Math.cos(angle);
  const rise = -length * Math.sin(angle);
  const cup = length * curl * 0.46 * Math.cos(angle);
  const layerSize = 1 - layer * 0.19;
  // Exceeds edge cupping, scalloping, shell thickness and triangulation error.
  const layerHeight = layer * (0.1 * length + 0.025) - 0.025;
  const positions = [];
  const indices = [];

  for (let side = 0; side < 2; side++) {
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const u = t * layerSize;
      const radius = rootRadius + radialSpan * u;
      const outline = Math.pow(Math.sin(Math.PI * t), 0.62);
      const naturalWidth =
        length * layerSize * 0.39 * outline * (0.6 + t * 0.65);
      const angularWidth = Math.min(
        halfSector,
        Math.atan2(naturalWidth, radius),
      );
      for (let column = 0; column <= columns; column++) {
        const across = (column / columns) * 2 - 1;
        const theta = across * angularWidth;
        const edgeCup = length * 0.035 * across ** 2 * Math.sin(Math.PI * u);
        const scallop =
          length * 0.008 * Math.cos(across * Math.PI * 3) * u ** 5;
        const thickness = length * 0.006 * Math.sin(Math.PI * t);
        const y =
          layerHeight +
          rise * u +
          cup * u * u +
          edgeCup +
          scallop +
          (side === 0 ? thickness : -thickness);
        positions.push(radius * Math.sin(theta), y, radius * Math.cos(theta));
      }
    }
  }

  const stride = columns + 1;
  const surfaceCount = (rows + 1) * stride;
  for (let side = 0; side < 2; side++) {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = side * surfaceCount + row * stride + column;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        if (side === 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
  }
  for (let row = 0; row < rows; row++) {
    for (const column of [0, columns]) {
      const a = row * stride + column;
      const b = a + stride;
      if (column === 0)
        indices.push(
          a,
          a + surfaceCount,
          b,
          b,
          a + surfaceCount,
          b + surfaceCount,
        );
      else
        indices.push(
          a,
          b,
          a + surfaceCount,
          b,
          b + surfaceCount,
          a + surfaceCount,
        );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
