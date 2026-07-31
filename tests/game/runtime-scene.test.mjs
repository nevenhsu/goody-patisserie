import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { validateRuntimeExperience } from "../../src/domain/experience.ts";
import { GameBridge } from "../../src/game/bridge.ts";
import {
  getInteractionDetailForTarget,
  getRenderableAssetIds,
  getRuntimeAnimationKey,
  getRuntimeAssetKey,
  getWeatherParticleAction,
  placementAssetId,
  resolveTweenRange,
} from "../../src/game/scene.ts";
import { getViewportCamera } from "../../src/game/viewport.ts";
import { getDemoRuntimeExperience } from "../../src/runtime/demo.ts";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

function readPngHeader(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG", `not a PNG: ${file}`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes.readUInt8(25),
  };
}

test("client guard accepts RuntimeExperience v3 and rejects stale bootstrap", () => {
  const experience = getDemoRuntimeExperience();
  assert.equal(validateRuntimeExperience(experience).valid, true);
  assert.equal(validateRuntimeExperience({ kind: "goody-runtime-bootstrap", version: 1 }).valid, false);
  assert.ok(experience.assets.every((asset) => asset.uri.startsWith("/imagegen/")));
  assert.equal(new Set(experience.assets.map((asset) => getRuntimeAssetKey(asset.id))).size, experience.assets.length);
});

test("demo assets are shipped and match the delivery manifest", () => {
  const experience = getDemoRuntimeExperience();
  const manifest = JSON.parse(readFileSync(`${projectRoot}public/imagegen/asset-manifest.json`, "utf8"));
  const spec = JSON.parse(readFileSync(`${projectRoot}public/imagegen/asset-spec.json`, "utf8"));
  const delivered = new Map(manifest.assets.map((entry) => [entry.id, entry]));

  assert.equal(manifest.assetSpecVersion, spec.schemaVersion);
  assert.deepEqual(new Set(delivered.keys()), new Set(experience.assets.map((asset) => asset.id)));
  for (const asset of experience.assets) {
    const entry = delivered.get(asset.id);
    assert.ok(entry, `missing delivery entry: ${asset.id}`);
    assert.equal(entry.file, asset.uri);
    const file = `${projectRoot}public${entry.file}`;
    assert.equal(existsSync(file), true, `missing file: ${entry.file}`);
    assert.deepEqual(entry.canvas, spec.classes[entry.class].canvas);
    if (entry.frame) assert.deepEqual(entry.frame, spec.classes[entry.class].frame);
    assert.deepEqual(entry.anchor, spec.classes[entry.class].anchor);
    const png = readPngHeader(file);
    assert.deepEqual([png.width, png.height], entry.canvas, `wrong canvas: ${entry.file}`);
    if (asset.id.startsWith("concept-") && !asset.id.includes("-canonical-v")) {
      assert.equal(png.colorType, 6, `concept asset needs RGBA: ${entry.file}`);
    }
  }
});

test("every delivered demo asset is visible in the desktop render graph", () => {
  const experience = getDemoRuntimeExperience();
  const spawns = new Map([
    ...experience.spawns.characters,
    ...experience.spawns.animals,
    ...experience.spawns.items,
  ].map((spawn) => [spawn.id, spawn]));
  const visibleAssetIds = new Set();

  for (const placement of experience.layouts.landscape.placements) {
    if (placement.layer === "weather") continue;
    const assetId = placementAssetId(placement, spawns);
    if (assetId) visibleAssetIds.add(assetId);
  }
  visibleAssetIds.add(spawns.get(experience.layouts.landscape.player.spawnId)?.assetId);
  const weatherAction = getWeatherParticleAction(experience);
  if (weatherAction) visibleAssetIds.add(weatherAction.assetId);
  visibleAssetIds.delete(undefined);

  assert.equal(visibleAssetIds.size, 34);
  assert.deepEqual(visibleAssetIds, new Set(experience.assets.map((asset) => asset.id)));
});

test("landscape layers contain transparent and visible pixels", async () => {
  const manifest = JSON.parse(readFileSync(`${projectRoot}public/imagegen/asset-manifest.json`, "utf8"));
  const layers = manifest.assets.filter((entry) => entry.class === "scene-landscape-layer");
  assert.ok(layers.length > 0);
  for (const entry of layers) {
    const { data, info } = await sharp(`${projectRoot}public${entry.file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let minAlpha = 255;
    let maxAlpha = 0;
    for (let index = 3; index < data.length; index += info.channels) {
      minAlpha = Math.min(minAlpha, data[index]);
      maxAlpha = Math.max(maxAlpha, data[index]);
    }
    assert.ok(minAlpha < 255, `layer needs transparent pixels: ${entry.file}`);
    assert.ok(maxAlpha > 0, `layer needs visible pixels: ${entry.file}`);
  }
});

test("desktop weekly menu uses a paper clipboard", async () => {
  const experience = getDemoRuntimeExperience();
  const landscapeMenu = experience.layouts.landscape.placements.find((placement) => placement.id === "land-menu");
  const spawns = new Map(experience.spawns.items.map((spawn) => [spawn.id, spawn]));

  assert.deepEqual(landscapeMenu, {
    id: "land-menu",
    type: "spawn",
    spawnId: "menu-board",
    assetId: "menu-clipboard-landscape",
    layer: "foreground",
    position: { x: 0.2018229167, y: 0.3271484375 },
    scale: 0.18,
    depth: 36,
  });
  assert.equal(placementAssetId(landscapeMenu, spawns), "menu-clipboard-landscape");

  const file = `${projectRoot}public/imagegen/goody-item-menu-clipboard-landscape-v1.png`;
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let creamPaperPixels = 0;
  let darkClipPixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const [red, green, blue, alpha] = data.subarray(offset, offset + 4);
      if (alpha > 16) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (x >= 98 && x <= 286 && y >= 88 && y <= 394 && alpha > 128 && red > 150 && green > 130 && blue > 90) {
        creamPaperPixels += 1;
      }
      if (x >= 132 && x <= 252 && y >= 28 && y <= 84 && alpha > 128 && red + green + blue < 330) {
        darkClipPixels += 1;
      }
    }
  }
  assert.deepEqual([info.width, info.height], [384, 448]);
  assert.deepEqual([minX, minY, maxX, maxY], [74, 28, 310, 412]);
  assert.ok(creamPaperPixels > 1000, "clipboard must visibly hold cream paper");
  assert.ok(darkClipPixels > 100, "clipboard must have a dark top spring clip");
});

test("landscape pastries share one canvas and contact baseline while preserving size hierarchy", async () => {
  const manifest = JSON.parse(readFileSync(`${projectRoot}public/imagegen/asset-manifest.json`, "utf8"));
  const expectedBounds = new Map([
    ["pastry-pandan-pearl-sugar-choux-landscape-v2", [111, 117]],
    ["pastry-pandan-thai-tea-saint-honore-landscape-v2", [150, 122]],
    ["pastry-pandan-thai-tea-saint-honore-6-inch-landscape-v2", [206, 144]],
    ["pastry-pistachio-cherry-tart-landscape-v2", [111, 94]],
    ["pastry-muscat-white-wine-landscape-v2", [122, 117]],
    ["pastry-pandan-thai-tea-cake-roll-landscape-v2", [139, 106]],
    ["pastry-vanilla-basque-cheesecake-slice-landscape-v2", [156, 100]],
    ["pastry-vanilla-basque-cheesecake-6-inch-landscape-v2", [233, 128]],
    ["pastry-pandan-madeleine-2-pack-landscape-v2", [133, 78]],
    ["pastry-pistachio-cherry-dacquoise-landscape-v2", [122, 83]],
    ["pastry-vanilla-canele-landscape-v2", [78, 100]],
  ]);
  const entries = manifest.assets.filter((entry) => entry.class === "pastry-display-256");
  const visibleBounds = new Map();
  assert.equal(entries.length, expectedBounds.size);

  for (const entry of entries) {
    assert.deepEqual(entry.canvas, [256, 256], `wrong pastry canvas: ${entry.id}`);
    assert.deepEqual(entry.anchor, [0.5, 0.859375], `wrong pastry anchor: ${entry.id}`);
    const { data, info } = await sharp(`${projectRoot}public${entry.file}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        if (data[(y * info.width + x) * info.channels + 3] <= 16) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const bounds = [maxX - minX + 1, maxY - minY + 1];
    visibleBounds.set(entry.id, bounds);
    assert.deepEqual(bounds, expectedBounds.get(entry.id), entry.id);
    assert.ok(Math.abs((minX + maxX) / 2 - 128) <= 1, `off-center pastry: ${entry.id}`);
    assert.equal(maxY, 220, `wrong contact baseline: ${entry.id}`);
  }

  const experience = getDemoRuntimeExperience();
  const rows = new Map();
  for (const placement of experience.layouts.landscape.placements) {
    if (placement.type !== "spawn" || !placement.assetId?.endsWith("-landscape-v2")) continue;
    const row = rows.get(placement.position.y) ?? [];
    row.push(placement);
    rows.set(placement.position.y, row);
  }
  assert.deepEqual([...rows.values()].map((row) => row.length).sort(), [5, 6]);
  for (const row of rows.values()) {
    row.sort((left, right) => left.position.x - right.position.x);
    for (let index = 1; index < row.length; index += 1) {
      const previous = row[index - 1];
      const current = row[index];
      const previousWidth = visibleBounds.get(previous.assetId)[0] * previous.scale;
      const currentWidth = visibleBounds.get(current.assetId)[0] * current.scale;
      const gap = (current.position.x - previous.position.x) * 1536 - (previousWidth + currentWidth) / 2;
      assert.ok(gap >= 7.5, `pastry silhouettes need an 8px gap: ${previous.id} -> ${current.id} (${gap})`);
    }
  }
});

test("floor canonical v3 is a true 16 by 8 grid", async () => {
  const spec = JSON.parse(readFileSync(`${projectRoot}public/imagegen/asset-spec.json`, "utf8"));
  const floorClass = spec.classes["scene-projective-floor-16x8"];
  assert.deepEqual(floorClass, {
    canvas: [1536, 512],
    anchor: [0.5, 0.5],
    grid: [16, 8],
    pitch: [96, 64],
    grout: 4,
  });

  const { data, info } = await sharp(`${projectRoot}public/imagegen/goody-floor-canonical-v3.png`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => {
    const index = (y * info.width + x) * info.channels;
    return [...data.subarray(index, index + 3)];
  };
  const grout = pixel(1, 1);

  for (let column = 0; column < floorClass.grid[0]; column += 1) {
    assert.deepEqual(pixel(column * floorClass.pitch[0] + 1, 12), grout);
    assert.notDeepEqual(pixel(column * floorClass.pitch[0] + floorClass.grout + 8, 12), grout);
  }
  for (let row = 0; row < floorClass.grid[1]; row += 1) {
    assert.deepEqual(pixel(12, row * floorClass.pitch[1] + 1), grout);
    assert.notDeepEqual(pixel(12, row * floorClass.pitch[1] + floorClass.grout + 8), grout);
  }
});

test("left magnetic knife rack keeps its baked perspective canvas contract", async () => {
  const manifest = JSON.parse(readFileSync(`${projectRoot}public/imagegen/asset-manifest.json`, "utf8"));
  const entry = manifest.assets.find((asset) => asset.id === "concept-side-prop-left-magnetic-knife-rack-perspective");
  assert.ok(entry);
  assert.equal(entry.class, "side-prop-magnetic-knife-rack-perspective");
  assert.deepEqual(entry.canvas, [220, 170]);
  assert.deepEqual(entry.anchor, [0.5, 0.3411764706]);

  const { data, info } = await sharp(`${projectRoot}public${entry.file}`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (x < 12 || x > 208 || y < 20 || y > 164) {
        assert.equal(alpha, 0, `knife rack alpha escaped approved bbox at ${x},${y}`);
      }
      if (alpha <= 16) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  assert.deepEqual({ minX, minY, maxX, maxY }, { minX: 12, minY: 20, maxX: 208, maxY: 164 });
});

test("manifest intended display matches runtime placement scales", () => {
  const experience = getDemoRuntimeExperience();
  const manifest = JSON.parse(readFileSync(`${projectRoot}public/imagegen/asset-manifest.json`, "utf8"));
  const entries = new Map(manifest.assets.map((entry) => [entry.id, entry]));
  const spawnAssets = new Map([
    ...experience.spawns.characters,
    ...experience.spawns.animals,
    ...experience.spawns.items,
  ].map((spawn) => [spawn.id, spawn.assetId]));

  for (const orientation of ["landscape", "portrait"]) {
    const layout = experience.layouts[orientation];
    const scales = new Map();
    const addScale = (assetId, scale) => {
      const values = scales.get(assetId) ?? new Set();
      values.add(scale);
      scales.set(assetId, values);
    };
    for (const placement of layout.placements) {
      const assetId = placement.type === "asset"
        ? placement.assetId
        : placement.assetId ?? spawnAssets.get(placement.spawnId);
      if (assetId) addScale(assetId, placement.scale);
    }
    const playerAssetId = spawnAssets.get(layout.player.spawnId);
    if (playerAssetId) addScale(playerAssetId, layout.player.scale);

    for (const [assetId, assetScales] of scales) {
      assert.equal(assetScales.size, 1, `${orientation} uses multiple scales for ${assetId}`);
      const entry = entries.get(assetId);
      assert.ok(entry, `manifest missing ${assetId}`);
      const scale = [...assetScales][0];
      const basis = entry.frame ?? entry.canvas;
      const expected = basis.map((size) => Number((size * scale).toFixed(6)));
      assert.deepEqual(entry.intendedDisplay[orientation], expected, `${orientation} intendedDisplay mismatch: ${assetId}`);
    }
  }
});

test("desktop concept scene keeps exact structure, replaceable content, and depth contracts", () => {
  const experience = getDemoRuntimeExperience();
  const landscape = experience.layouts.landscape;
  const byId = new Map(landscape.placements.map((placement) => [placement.id, placement]));
  const structureIds = ["land-wall-left", "land-wall-center", "land-wall-right", "land-floor"];

  for (const id of structureIds) {
    const placement = byId.get(id);
    assert.ok(placement && placement.type === "asset", `missing structure: ${id}`);
    assert.deepEqual(placement.position, { x: 0.5, y: 0.5 });
    assert.equal(placement.scale, 1);
  }
  assert.deepEqual(structureIds.map((id) => byId.get(id)?.depth), [0, 1, 2, 20]);

  const stools = landscape.placements.filter(
    (placement) => placement.type === "asset" && placement.assetId === "concept-stool",
  );
  assert.equal(stools.length, 6);
  assert.equal(stools.every((placement) => placement.depth === 40), true);

  const depths = Object.fromEntries([
    "land-oven",
    "land-oven-tray",
    "land-oven-curtain",
    "land-counter-base",
    "land-counter-top",
    "land-mixer",
    "land-display-cabinet",
    "land-pandan-pearl-sugar-choux",
    "land-stool-1",
    "land-cat",
  ].map((id) => [id, byId.get(id)?.depth]));
  assert.deepEqual(depths, {
    "land-oven": 9,
    "land-oven-tray": 10,
    "land-oven-curtain": 11,
    "land-counter-base": 30,
    "land-counter-top": 31,
    "land-mixer": 32,
    "land-display-cabinet": 33,
    "land-pandan-pearl-sugar-choux": 34,
    "land-stool-1": 40,
    "land-cat": 52,
  });

  assert.deepEqual(landscape.projections.map((projection) => projection.id), ["wall-left", "wall-right", "floor"]);
  assert.deepEqual(landscape.projections.find((projection) => projection.id === "wall-left"), {
    id: "wall-left",
    kind: "projective-quad",
    localSize: { width: 384, height: 1024 },
    corners: [{ x: 0, y: 0 }, { x: 192, y: 0 }, { x: 192, y: 826 }, { x: 0, y: 968 }],
    horizontalGuides: [{ localY: 672, left: { x: 0, y: 674 }, right: { x: 192, y: 613 } }],
    subdivisions: { x: 4, y: 16 },
  });
  assert.deepEqual(landscape.projections.find((projection) => projection.id === "wall-right"), {
    id: "wall-right",
    kind: "projective-quad",
    localSize: { width: 384, height: 1024 },
    corners: [{ x: 1354, y: 0 }, { x: 1536, y: 0 }, { x: 1536, y: 968 }, { x: 1354, y: 832 }],
    horizontalGuides: [{ localY: 672, left: { x: 1354, y: 613 }, right: { x: 1536, y: 674 } }],
    subdivisions: { x: 4, y: 16 },
  });
  assert.deepEqual(landscape.projections.find((projection) => projection.id === "floor"), {
    id: "floor",
    kind: "projective-quad",
    localSize: { width: 1536, height: 512 },
    corners: [{ x: 192, y: 826 }, { x: 1354, y: 832 }, { x: 1536, y: 1024 }, { x: 0, y: 1024 }],
    subdivisions: { x: 4, y: 16 },
  });
  const oldProjectedSidePropIds = [
    "land-copper-pan-left",
    "land-copper-pan-right",
    "land-utensil-rack",
    "land-whisk",
    "land-rolling-pin",
    "land-ladle",
    "land-wall-art-upper",
    "land-wall-art-lower",
    "land-wall-shelf",
    "land-plant",
  ];
  assert.equal(oldProjectedSidePropIds.some((id) => byId.has(id)), false);
  const bakedSideProps = {
    "land-side-prop-left-pan-pair": {
      id: "land-side-prop-left-pan-pair", type: "asset", assetId: "concept-side-prop-left-pan-pair-perspective", layer: "stage",
      position: { x: 0.06640625, y: 0.2503043945 }, scale: 0.6, depth: 13,
    },
    "land-side-prop-left-utensil-rail": {
      id: "land-side-prop-left-utensil-rail", type: "asset", assetId: "concept-side-prop-left-utensil-rail-perspective", layer: "stage",
      position: { x: 0.0625, y: 0.3847045898 }, scale: 0.55, depth: 14,
    },
    "land-side-prop-left-magnetic-knife-rack": {
      id: "land-side-prop-left-magnetic-knife-rack", type: "asset", assetId: "concept-side-prop-left-magnetic-knife-rack-perspective", layer: "stage",
      position: { x: 0.0625, y: 0.53271484375 }, scale: 0.5, depth: 15,
    },
    "land-side-prop-right-tokyo-frame": {
      id: "land-side-prop-right-tokyo-frame", type: "asset", assetId: "concept-side-prop-right-tokyo-frame-perspective", layer: "stage",
      position: { x: 0.927177, y: 0.25981525 }, scale: 0.48, depth: 16,
    },
    "land-side-prop-right-melbourne-frame": {
      id: "land-side-prop-right-melbourne-frame", type: "asset", assetId: "concept-side-prop-right-melbourne-frame-perspective", layer: "stage",
      position: { x: 0.927177, y: 0.38191375 }, scale: 0.48, depth: 16,
    },
    "land-side-prop-right-plant-shelf": {
      id: "land-side-prop-right-plant-shelf", type: "asset", assetId: "concept-side-prop-right-plant-shelf-perspective", layer: "stage",
      position: { x: 0.927177, y: 0.4995963 }, scale: 0.45, depth: 17,
    },
  };
  for (const [id, expected] of Object.entries(bakedSideProps)) {
    assert.deepEqual(byId.get(id), expected);
    assert.equal(byId.get(id)?.projection, undefined, `baked side prop must be a normal image: ${id}`);
  }
  const knifeRack = byId.get("land-side-prop-left-magnetic-knife-rack");
  assert.ok(knifeRack);
  const knifeRackCenterY = knifeRack.position.y * landscape.world.height;
  assert.equal(knifeRackCenterY + (58 - 85) * knifeRack.scale, 532, "artistic anchor must stay at Pro world y");
  assert.deepEqual([
    knifeRackCenterY + (20 - 85) * knifeRack.scale,
    knifeRackCenterY + (164 - 85) * knifeRack.scale,
  ], [513, 585]);
  assert.equal(byId.has("land-side-prop-left-mold-pair"), false);
  assert.equal(byId.get("land-wall-left")?.assetId, "concept-side-wall-canonical-v2");
  assert.equal(byId.get("land-wall-right")?.assetId, "concept-side-wall-canonical-v2");
  assert.equal(byId.get("land-floor")?.assetId, "concept-floor-canonical-v3");
  assert.equal(byId.has("land-floor-left-underlay"), false);
  assert.equal(byId.has("land-floor-right-underlay"), false);
  assert.equal(landscape.placements.some((placement) =>
    placement.type === "asset" && ["concept-wall-left", "concept-wall-right", "concept-floor"].includes(placement.assetId),
  ), false);
  assert.equal(byId.get("land-wall-left")?.projection?.mode, "clip");
  assert.equal(byId.get("land-wall-right")?.projection?.mode, "clip");
  assert.deepEqual(byId.get("land-floor")?.projection, {
    mode: "clip",
    ref: "floor",
    sourceRect: { x: 0, y: 0, width: 1536, height: 512 },
    clipPolygon: [
      { x: 0, y: 968 },
      { x: 192, y: 826 },
      { x: 1354, y: 832 },
      { x: 1536, y: 968 },
      { x: 1536, y: 1024 },
      { x: 0, y: 1024 },
    ],
    uvInsetX: 0.05,
  });
  assert.deepEqual(landscape.player, {
    spawnId: "player-landscape",
    position: { x: 0.79, y: 0.58 },
    movementBounds: { minX: 0.176, maxX: 0.82, minY: 0.56, maxY: 0.58 },
    scale: 0.81,
    depth: 29,
  });
  assert.deepEqual(byId.get("land-cat"), {
    id: "land-cat",
    type: "spawn",
    spawnId: "cat-landscape",
    layer: "foreground",
    position: { x: 0.835, y: 0.8894 },
    scale: 0.36,
    depth: 52,
  });

  const requiredSpawns = new Set(["calendar", "menu-board", "cat-landscape", ...experience.spawns.items
    .filter((spawn) => spawn.id !== "calendar" && spawn.id !== "menu-board")
    .map((spawn) => spawn.id)]);
  const landscapeSpawns = new Set(
    landscape.placements.filter((placement) => placement.type === "spawn").map((placement) => placement.spawnId),
  );
  for (const spawnId of requiredSpawns) assert.equal(landscapeSpawns.has(spawnId), true, `missing landscape spawn: ${spawnId}`);

  const pastrySpawnIds = [
    "pandan-pearl-sugar-choux",
    "pandan-thai-tea-saint-honore",
    "pandan-thai-tea-saint-honore-6-inch",
    "pistachio-cherry-tart",
    "muscat-white-wine",
    "pandan-thai-tea-cake-roll",
    "vanilla-basque-cheesecake-slice",
    "vanilla-basque-cheesecake-6-inch",
    "pandan-madeleine-2-pack",
    "pistachio-cherry-dacquoise",
    "vanilla-canele",
  ];
  const spawnMap = new Map([
    ...experience.spawns.characters,
    ...experience.spawns.animals,
    ...experience.spawns.items,
  ].map((spawn) => [spawn.id, spawn]));
  const landscapePastries = pastrySpawnIds.map((spawnId) => landscape.placements.find(
    (placement) => placement.type === "spawn" && placement.spawnId === spawnId,
  ));
  assert.deepEqual(
    landscapePastries.map((placement) => placement?.scale),
    Array(11).fill(0.34),
  );
  assert.deepEqual(
    landscapePastries.map((placement) => placement?.position),
    [
      { x: 0.50382, y: 0.52219 },
      { x: 0.54243, y: 0.52219 },
      { x: 0.59159, y: 0.52219 },
      { x: 0.63645, y: 0.52219 },
      { x: 0.67199, y: 0.52219 },
      { x: 0.50367, y: 0.5759 },
      { x: 0.54152, y: 0.5759 },
      { x: 0.58979, y: 0.5759 },
      { x: 0.6355, y: 0.5759 },
      { x: 0.66893, y: 0.5759 },
      { x: 0.69628, y: 0.5759 },
    ],
  );
  assert.deepEqual(
    landscapePastries.map((placement) => placement?.assetId),
    pastrySpawnIds.map((spawnId) => `pastry-${spawnId}-landscape-v2`),
  );

  assert.deepEqual(experience.layouts.portrait.player, {
    spawnId: "player-landscape",
    position: { x: 0.5, y: 0.79 },
    movementBounds: { minX: 0.12, maxX: 0.88, minY: 0.64, maxY: 0.89 },
    scale: 0.27,
    depth: 50,
  });
  assert.deepEqual(
    experience.layouts.portrait.placements.map((placement) => placement.id),
    ["port-wall", "port-floor", "port-counter"],
  );
  assert.deepEqual(
    landscapePastries.map((placement) => placementAssetId(placement, spawnMap)),
    pastrySpawnIds.map((spawnId) => `pastry-${spawnId}-landscape-v2`),
  );
});

test("desktop character and animal use generic eight-frame spritesheet clips", () => {
  const experience = getDemoRuntimeExperience();
  const assets = new Map(experience.assets.map((asset) => [asset.id, asset]));
  const spawns = new Map([
    ...experience.spawns.characters,
    ...experience.spawns.animals,
  ].map((spawn) => [spawn.id, spawn]));

  const player = spawns.get("player-landscape");
  const cat = spawns.get("cat-landscape");
  assert.equal(player?.assetId, "shopkeeper-animated");
  assert.deepEqual(player?.animation, {
    defaultClip: "idle",
    movingClip: "moving",
    autoplay: true,
    flipWithMovement: true,
    movementThreshold: 0.1,
    stopDelayMs: 120,
  });
  assert.equal(cat?.assetId, "cat-animated");
  assert.deepEqual(cat?.animation, { defaultClip: "idle", autoplay: true });

  const characterAsset = assets.get("shopkeeper-animated");
  const catAsset = assets.get("cat-animated");
  assert.deepEqual(characterAsset?.frame, { width: 512, height: 768 });
  assert.equal(characterAsset?.frameCount, 8);
  assert.deepEqual(characterAsset?.animations?.map((clip) => clip.frames), [[0, 1, 2, 3], [4, 5, 6, 7]]);
  assert.deepEqual(catAsset?.frame, { width: 512, height: 384 });
  assert.equal(catAsset?.frameCount, 8);
  assert.deepEqual(catAsset?.animations?.[0]?.frames, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(getRuntimeAnimationKey("shopkeeper-animated", "idle"), "goody-runtime-shopkeeper-animated-idle");

  assert.equal(spawns.has("player-portrait"), false);
  assert.equal(spawns.has("cat-portrait"), false);
});

test("interaction mapping returns typed modal action for arbitrary content target", () => {
  const experience = getDemoRuntimeExperience();
  const original = experience.interactions[0];
  experience.interactions = [{
    ...original,
    id: "content-added-interaction",
    triggers: [{ type: "click", targetId: "content-added-item" }],
  }];

  assert.deepEqual(getInteractionDetailForTarget(experience, "content-added-item"), {
    interactionId: "content-added-interaction",
    targetId: "content-added-item",
    action: original.action,
  });
  assert.equal(getInteractionDetailForTarget(experience, "unrelated-item"), undefined);
});

test("renderer accepts released assets without a demo ID allowlist", () => {
  const experience = getDemoRuntimeExperience();
  experience.assets = [
    ...experience.assets,
    {
      id: "content-added-weather",
      kind: "weather",
      loadType: "image",
      uri: "/imagegen/content-added-weather-v1.png",
    },
    {
      id: "content-added-clickable-item",
      kind: "item",
      loadType: "image",
      uri: "/imagegen/content-added-clickable-item-v1.png",
    },
  ];

  const assetIds = getRenderableAssetIds(experience);
  assert.equal(assetIds.has("content-added-weather"), true);
  assert.equal(assetIds.has("content-added-clickable-item"), true);
});

test("desktop demo ships no inactive weather image", () => {
  const experience = getDemoRuntimeExperience();
  const weatherPlacements = experience.layouts.landscape.placements.filter(
    (placement) => placement.layer === "weather",
  );

  assert.deepEqual(weatherPlacements, []);
  assert.equal(getWeatherParticleAction(experience), undefined);

  experience.weather.defaultTone = "rain";
  assert.equal(getWeatherParticleAction(experience), undefined);
});

test("bridge carries discrete input gate and modal events in order", () => {
  const bridge = new GameBridge();
  const events = [];
  const stopInput = bridge.on("goody:input", ({ enabled }) => events.push(`input:${enabled}`));
  const stopInteraction = bridge.on("goody:interaction", ({ interactionId }) => events.push(`interaction:${interactionId}`));

  bridge.emit("goody:input", { enabled: false });
  assert.equal(bridge.isInputEnabled(), false);
  bridge.emit("goody:interaction", {
    interactionId: "open-calendar",
    targetId: "calendar",
    action: { type: "open-modal", panel: "calendar", payloadKey: "goody-calendar" },
  });
  stopInput();
  stopInteraction();

  assert.deepEqual(events, ["input:false", "interaction:open-calendar"]);
});

test("cover camera centers both orientation layouts without stretching", () => {
  const experience = getDemoRuntimeExperience();
  const landscape = getViewportCamera(1440, 900, experience.layouts);
  const portrait = getViewportCamera(390, 844, experience.layouts);

  assert.equal(landscape.orientation, "landscape");
  assert.equal(landscape.zoom, Math.max(1440 / landscape.layout.world.width, 900 / landscape.layout.world.height));
  assert.equal(portrait.orientation, "portrait");
  assert.equal(portrait.zoom, Math.max(390 / portrait.layout.world.width, 844 / portrait.layout.world.height));
});

test("normalized position tween resolves against current world", () => {
  const range = resolveTweenRange(
    { id: "bob", type: "tween", targetId: "animal", property: "y", from: 0, to: -0.01, durationMs: 800 },
    { x: 100, y: 500, scale: 0.2, alpha: 1, rotation: 0 },
    { width: 1200, height: 1000 },
  );
  assert.deepEqual(range, { properties: ["y"], from: 500, to: 490 });
});
