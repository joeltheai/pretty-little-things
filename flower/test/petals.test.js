import assert from "node:assert/strict";
import test from "node:test";
import { Matrix4 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { createPetalGeometry } from "../src/petal-geometry.js";

function assertSeparated(pose) {
  const geometries = [0, 1].map((layer) => {
    const geometry = createPetalGeometry({ ...pose, layer });
    geometry.boundsTree = new MeshBVH(geometry);
    return geometry;
  });
  const transform = new Matrix4();
  let pairs = 0;
  const check = (first, second, rotation) => {
    transform.makeRotationY(rotation);
    assert.equal(
      geometries[first].boundsTree.intersectsGeometry(
        geometries[second],
        transform,
      ),
      false,
      `Petals intersect: ${JSON.stringify({ ...pose, first, second, rotation })}`,
    );
    pairs++;
  };
  try {
    // Rotational symmetry lets one petal represent every petal in its layer.
    for (let layer = 0; layer < 2; layer++) {
      const count = pose.count - layer * 2;
      for (let i = 1; i < count; i++)
        check(layer, layer, (i * Math.PI * 2) / count);
    }
    // Different layer counts create many relative angles: check every pair.
    for (let outer = 0; outer < pose.count; outer++) {
      for (let inner = 0; inner < pose.count - 2; inner++) {
        check(
          0,
          1,
          (inner * Math.PI * 2) / (pose.count - 2) +
            0.34 -
            (outer * Math.PI * 2) / pose.count,
        );
      }
    }
  } finally {
    geometries.forEach((geometry) => geometry.dispose());
  }
  return pairs;
}

test("petal surfaces stay separate across the slider ranges", (context) => {
  let poses = 0;
  let pairs = 0;
  for (let count = 5; count <= 16; count++) {
    for (const open of [0, 0.01, 0.1, 0.25, 0.5, 0.78, 1]) {
      for (const curl of [0, 0.35, 1]) {
        for (const length of [0.65, 1.35, 1.9]) {
          pairs += assertSeparated({ count, open, curl, length });
          poses++;
        }
      }
    }
  }
  context.diagnostic(
    `${poses} flower shapes; ${pairs} triangle-mesh pair checks`,
  );
});

test("petals stay separate during interpolated slider transitions", (context) => {
  let pairs = 0;
  // Reproduce the app's exponential interpolation, including a petal-count jump.
  let open = 0.78;
  let curl = 0.35;
  let length = 1.35;
  for (let frame = 0; frame < 60; frame++) {
    const secondHalf = frame >= 30;
    const blend = 1 - Math.exp(-12 / 60);
    open += ((secondHalf ? 1 : 0) - open) * blend;
    curl += ((secondHalf ? 0 : 1) - curl) * blend;
    length += ((secondHalf ? 0.65 : 1.9) - length) * blend;
    pairs += assertSeparated({
      count: secondHalf ? 5 : 16,
      open,
      curl,
      length,
    });
  }
  context.diagnostic(
    `60 transition frames; ${pairs} triangle-mesh pair checks`,
  );
});
