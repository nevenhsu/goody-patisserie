import assert from "node:assert/strict";
import test from "node:test";
import { getCoverZoom, getViewportCamera, selectViewportOrientation } from "../../src/game/viewport.ts";

test("viewport orientation uses width tie for landscape", () => {
  assert.equal(selectViewportOrientation(1600, 900), "landscape");
  assert.equal(selectViewportOrientation(900, 1600), "portrait");
  assert.equal(selectViewportOrientation(1000, 1000), "landscape");
});

test("cover zoom fills viewport while preserving world aspect", () => {
  assert.equal(getCoverZoom(1600, 900, 1536, 1024), 1600 / 1536);
  assert.equal(getCoverZoom(390, 844, 1086, 1448), 844 / 1448);
  assert.equal(getCoverZoom(1000, 1000, 1536, 1024), 1000 / 1024);
});

test("camera helper selects matching manifest layout", () => {
  const layouts = {
    landscape: { world: { width: 1536, height: 1024 } },
    portrait: { world: { width: 1086, height: 1448 } },
  };
  assert.equal(getViewportCamera(1200, 700, layouts).orientation, "landscape");
  assert.equal(getViewportCamera(700, 1200, layouts).orientation, "portrait");
});
