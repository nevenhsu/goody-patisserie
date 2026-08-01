import assert from "node:assert/strict";
import test from "node:test";
import { getCoverZoom, getViewportCamera, selectViewportOrientation } from "../../src/game/viewport.ts";

const layouts = {
  landscape: { world: { width: 1536, height: 1024 } },
  portrait: { world: { width: 390, height: 844 } },
};

function visibleWorldBounds(camera, viewportWidth, viewportHeight) {
  const width = viewportWidth / camera.zoom;
  const height = viewportHeight / camera.zoom;
  return {
    left: camera.layout.world.width / 2 - width / 2,
    right: camera.layout.world.width / 2 + width / 2,
    top: camera.layout.world.height / 2 - height / 2,
    bottom: camera.layout.world.height / 2 + height / 2,
  };
}

function closeTo(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test("viewport orientation uses width tie for landscape", () => {
  assert.equal(selectViewportOrientation(1600, 900), "landscape");
  assert.equal(selectViewportOrientation(900, 1600), "portrait");
  assert.equal(selectViewportOrientation(1000, 1000), "landscape");
});

test("cover zoom fills viewport while preserving world aspect", () => {
  assert.equal(getCoverZoom(1600, 900, 1536, 1024), 1600 / 1536);
  assert.equal(getCoverZoom(390, 844, 390, 844), 1);
  assert.equal(getCoverZoom(1000, 1000, 1536, 1024), 1000 / 1024);
});

test("camera helper selects matching manifest layout", () => {
  const landscape = getViewportCamera(1200, 700, layouts);
  assert.equal(landscape.orientation, "landscape");

  const portrait = getViewportCamera(390, 844, layouts);
  assert.equal(portrait.orientation, "portrait");
  assert.equal(portrait.layout, layouts.portrait);
});

test("canonical 390x844 portrait is an exact centered cover", () => {
  const camera = getViewportCamera(390, 844, layouts);
  assert.equal(camera.zoom, 1);
  assert.deepEqual(visibleWorldBounds(camera, 390, 844), { left: 0, right: 390, top: 0, bottom: 844 });
});

test("430x932 keeps the same portrait layout with centered cover crop", () => {
  const camera = getViewportCamera(430, 932, layouts);
  const visible = visibleWorldBounds(camera, 430, 932);
  assert.equal(camera.orientation, "portrait");
  assert.equal(camera.layout, layouts.portrait);
  assert.equal(camera.zoom, 932 / 844);
  closeTo(visible.left, 0.3004291845493583);
  closeTo(visible.right, 389.69957081545064);
  closeTo(visible.top, 0);
  closeTo(visible.bottom, 844);
});
