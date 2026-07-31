import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHomography,
  buildClippedProjectiveSurfaceGeometry,
  buildProjectiveMeshGeometry,
  computeSquareToQuadHomography,
  getProjectiveClipPolygon,
  getProjectiveUnderlayPolygon,
  invertHomography,
  mapProjectivePoint,
  validateProjectiveQuadGeometry,
} from "../../src/game/projective-surface.ts";

const profile = {
  localSize: { width: 100, height: 80 },
  corners: [
    { x: 10, y: 20 },
    { x: 130, y: 10 },
    { x: 145, y: 105 },
    { x: 0, y: 110 },
  ],
  subdivisions: { x: 4, y: 16 },
};

test("square-to-quad homography maps all ordered corners exactly and inverts", () => {
  const matrix = computeSquareToQuadHomography(profile);
  assert.ok(matrix);
  const inverse = invertHomography(matrix);
  assert.ok(inverse);
  const locals = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  profile.corners.forEach((corner, index) => {
    const mapped = applyHomography(matrix, locals[index]);
    assert.ok(mapped);
    assert.ok(Math.abs(mapped.x - corner.x) < 1e-8);
    assert.ok(Math.abs(mapped.y - corner.y) < 1e-8);
    const roundTrip = applyHomography(inverse, mapped);
    assert.ok(roundTrip);
    assert.ok(Math.abs(roundTrip.x - locals[index].x) < 1e-8);
    assert.ok(Math.abs(roundTrip.y - locals[index].y) < 1e-8);
  });
  const mappedTopLeft = mapProjectivePoint(profile, { x: 0, y: 0 });
  const mappedBottomRight = mapProjectivePoint(profile, { x: 100, y: 80 });
  assert.ok(mappedTopLeft && Math.abs(mappedTopLeft.x - profile.corners[0].x) < 1e-8 && Math.abs(mappedTopLeft.y - profile.corners[0].y) < 1e-8);
  assert.ok(mappedBottomRight && Math.abs(mappedBottomRight.x - profile.corners[2].x) < 1e-8 && Math.abs(mappedBottomRight.y - profile.corners[2].y) < 1e-8);
});

test("affine parallelogram uses the g=h=0 branch", () => {
  const matrix = computeSquareToQuadHomography([
    { x: 10, y: 20 },
    { x: 130, y: 10 },
    { x: 145, y: 105 },
    { x: 25, y: 115 },
  ]);
  assert.ok(matrix);
  assert.equal(matrix.g, 0);
  assert.equal(matrix.h, 0);
});

test("mesh UVs mirror without changing world positions", () => {
  const normal = buildProjectiveMeshGeometry({
    profile,
    localPosition: { x: 50, y: 40 },
    frame: { width: 40, height: 32 },
    scale: 1,
  });
  const flipped = buildProjectiveMeshGeometry({
    profile,
    localPosition: { x: 50, y: 40 },
    frame: { width: 40, height: 32 },
    scale: 1,
    flipX: true,
  });
  assert.ok(normal && flipped);
  assert.deepEqual(
    flipped.vertices.map((value, index) => index % 4 === 2 ? value : undefined).filter((value) => value !== undefined),
    normal.vertices.map((value, index) => index % 4 === 2 ? 1 - value : undefined).filter((value) => value !== undefined),
  );
  for (let index = 0; index < normal.vertices.length; index += 4) {
    assert.equal(flipped.vertices[index], normal.vertices[index]);
    assert.equal(flipped.vertices[index + 1], normal.vertices[index + 1]);
  }
});

test("project strength defaults to exact full projection", () => {
  const options = {
    profile,
    localPosition: { x: 50, y: 40 },
    frame: { width: 40, height: 32 },
    scale: 1,
  };
  assert.deepEqual(
    buildProjectiveMeshGeometry(options),
    buildProjectiveMeshGeometry({ ...options, strength: 1 }),
  );
});

test("known-size local anchors map to intended world centres", () => {
  const copper = {
    localSize: { width: 1536, height: 1024 },
    corners: [
      { x: 12.284, y: -128.387 },
      { x: 1548.284, y: -128.387 },
      { x: 1548.284, y: 895.613 },
      { x: 12.284, y: 895.613 },
    ],
    subdivisions: { x: 1, y: 1 },
  };
  const upperArt = {
    localSize: { width: 1536, height: 1024 },
    corners: [
      { x: 1338.363, y: -121.004 },
      { x: 2874.363, y: -121.004 },
      { x: 2874.363, y: 902.996 },
      { x: 1338.363, y: 902.996 },
    ],
    subdivisions: { x: 1, y: 1 },
  };
  const copperCenter = mapProjectivePoint(copper, { x: 62.676, y: 383.367 });
  const upperCenter = mapProjectivePoint(upperArt, { x: 82.437, y: 405.984 });
  assert.ok(copperCenter && Math.abs(copperCenter.x - 74.96) < 1e-3 && Math.abs(copperCenter.y - 254.98) < 1e-3);
  assert.ok(upperCenter && Math.abs(upperCenter.x - 1420.8) < 1e-3 && Math.abs(upperCenter.y - 284.98) < 1e-3);
});

test("guided profile maps each band and shares exact guide row", () => {
  const guided = {
    localSize: { width: 100, height: 100 },
    corners: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 110 },
      { x: 0, y: 120 },
    ],
    horizontalGuides: [{ localY: 40, left: { x: 0, y: 48 }, right: { x: 100, y: 42 } }],
    subdivisions: { x: 2, y: 4 },
  };
  const guideLeft = mapProjectivePoint(guided, { x: 0, y: 40 });
  const guideMiddle = mapProjectivePoint(guided, { x: 50, y: 40 });
  const guideRight = mapProjectivePoint(guided, { x: 100, y: 40 });
  assert.ok(guideLeft && Math.abs(guideLeft.x) < 1e-8 && Math.abs(guideLeft.y - 48) < 1e-8);
  assert.ok(guideMiddle && Math.abs(guideMiddle.x - 50) < 1e-8 && Math.abs(guideMiddle.y - 45) < 1e-8);
  assert.ok(guideRight && Math.abs(guideRight.x - 100) < 1e-8 && Math.abs(guideRight.y - 42) < 1e-8);
  const before = mapProjectivePoint(guided, { x: 50, y: 40 - 1e-7 });
  const after = mapProjectivePoint(guided, { x: 50, y: 40 + 1e-7 });
  assert.ok(before && after && Math.abs(before.x - after.x) < 1e-5 && Math.abs(before.y - after.y) < 1e-5);
  const geometry = buildProjectiveMeshGeometry({
    profile: guided,
    localPosition: { x: 50, y: 50 },
    frame: { width: 40, height: 80 },
    scale: 1,
  });
  assert.ok(geometry);
  assert.ok(geometry.vertices.some((value, index) => index % 4 === 1 && Math.abs(value - 45) < 1e-8));
});

test("4x16 mesh has expected Phaser counts and valid indices", () => {
  const geometry = buildProjectiveMeshGeometry({
    profile,
    localPosition: { x: 50, y: 40 },
    frame: { width: 384, height: 448 },
    scale: 0.32,
  });
  assert.ok(geometry);
  assert.equal(geometry.vertices.length / 4, 85);
  assert.equal(geometry.indices.length / 4, 128);
  assert.equal(geometry.indices.length, 128 * 4);
  for (let index = 0; index < geometry.indices.length; index += 4) {
    const [a, b, c, page] = geometry.indices.slice(index, index + 4);
    assert.ok(a >= 0 && a < 85 && b >= 0 && b < 85 && c >= 0 && c < 85);
    assert.equal(page, 0);
  }
  assert.ok(geometry.vertices.every(Number.isFinite));
});

test("clipped projective mesh covers exact convex polygon with bounded UVs", () => {
  const floorProfile = {
    localSize: { width: 1536, height: 512 },
    corners: [
      { x: 192, y: 826 },
      { x: 1354, y: 832 },
      { x: 1536, y: 1024 },
      { x: 0, y: 1024 },
    ],
    subdivisions: { x: 4, y: 16 },
  };
  const clipPolygon = [
    { x: 0, y: 968 },
    { x: 192, y: 826 },
    { x: 1354, y: 832 },
    { x: 1536, y: 968 },
    { x: 1536, y: 1024 },
    { x: 0, y: 1024 },
  ];
  const geometry = buildClippedProjectiveSurfaceGeometry({
    profile: floorProfile,
    clipPolygon,
    uvInsetX: 0.05,
  });
  assert.ok(geometry);
  const vertices = Array.from({ length: geometry.vertices.length / 4 }, (_, index) => ({
    x: geometry.vertices[index * 4],
    y: geometry.vertices[index * 4 + 1],
    u: geometry.vertices[index * 4 + 2],
    v: geometry.vertices[index * 4 + 3],
  }));
  for (const point of clipPolygon) {
    assert.ok(vertices.some((vertex) => Math.hypot(vertex.x - point.x, vertex.y - point.y) < 1e-7));
  }
  assert.ok(vertices.every((vertex) => vertex.u >= 0 && vertex.u <= 1 && vertex.v >= 0 && vertex.v <= 1));
  assert.ok(geometry.indices.length > 0 && geometry.indices.length % 4 === 0);
});

test("invalid and non-invertible quads are rejected", () => {
  const bowTie = {
    ...profile,
    corners: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }],
  };
  assert.equal(validateProjectiveQuadGeometry(bowTie).valid, false);
  assert.equal(computeSquareToQuadHomography(bowTie), null);
  assert.equal(buildProjectiveMeshGeometry({
    profile: bowTie,
    localPosition: { x: 0, y: 0 },
    frame: { width: 1, height: 1 },
    scale: 1,
  }), null);
});

test("clip and underlay polygons retain ordered bottom edge", () => {
  assert.deepEqual(getProjectiveClipPolygon(profile), profile.corners);
  assert.deepEqual(getProjectiveUnderlayPolygon(profile, 140), [
    profile.corners[3],
    profile.corners[2],
    { x: 150.5263157894737, y: 140 },
    { x: -3.333333333333332, y: 140 },
  ]);
});
