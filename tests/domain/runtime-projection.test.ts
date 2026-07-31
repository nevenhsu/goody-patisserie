import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeExperience, RuntimePlacement, RuntimeProjectionProfile } from "../../src/content/runtime-experience";
import { validateRuntimeExperience } from "../../src/domain/experience";

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const profile: RuntimeProjectionProfile = {
  id: "counter-quad",
  kind: "projective-quad",
  localSize: { width: 100, height: 50 },
  corners: [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 460, y: 330 },
    { x: 120, y: 300 },
  ],
  subdivisions: { x: 2, y: 3 },
};

function baseExperience(): RuntimeExperience {
  return {
    schemaVersion: 3,
    mode: "released",
    release: { id: "test-release", version: "1" },
    assets: [
      { id: "background", kind: "scene", loadType: "image", uri: "/imagegen/background.png" },
      { id: "item", kind: "item", loadType: "image", uri: "/imagegen/item.png" },
      { id: "weather", kind: "weather", loadType: "image", uri: "/imagegen/weather.png" },
      { id: "player", kind: "character", loadType: "image", uri: "/imagegen/player.png" },
    ],
    layouts: {
      landscape: {
        projections: [copy(profile)],
        world: { width: 800, height: 600 },
        player: {
          spawnId: "player",
          position: { x: 0.5, y: 0.8 },
          movementBounds: { minX: 0.1, maxX: 0.9, minY: 0.7, maxY: 0.9 },
          scale: 1,
          depth: 1,
        },
        placements: [
          { id: "background", type: "asset", assetId: "background", layer: "background", position: { x: 0.5, y: 0.5 }, scale: 1, depth: 0 },
          { id: "projected", type: "asset", assetId: "item", layer: "stage", position: { x: 0.5, y: 0.5 }, scale: 1, depth: 1, projection: { mode: "project", ref: profile.id, localPosition: { x: 50, y: 20 } } },
          { id: "foreground", type: "asset", assetId: "item", layer: "foreground", position: { x: 0.5, y: 0.5 }, scale: 1, depth: 2 },
        ],
      },
      portrait: {
        projections: [],
        world: { width: 600, height: 800 },
        player: {
          spawnId: "player",
          position: { x: 0.5, y: 0.8 },
          movementBounds: { minX: 0.1, maxX: 0.9, minY: 0.7, maxY: 0.9 },
          scale: 1,
          depth: 1,
        },
        placements: [
          { id: "background", type: "asset", assetId: "background", layer: "background", position: { x: 0.5, y: 0.5 }, scale: 1, depth: 0 },
          { id: "stage", type: "asset", assetId: "item", layer: "stage", position: { x: 0.5, y: 0.5 }, scale: 1, depth: 1 },
          { id: "foreground", type: "asset", assetId: "item", layer: "foreground", position: { x: 0.5, y: 0.5 }, scale: 1, depth: 2 },
        ],
      },
    },
    spawns: { characters: [{ id: "player", kind: "character", assetId: "player" }], animals: [], items: [] },
    actions: [],
    weather: { defaultTone: "sunny", presentations: [{ tone: "sunny" }] },
    interactions: [],
    modalPayloads: [],
  };
}

test("valid v3 projective profile and placement validate", () => {
  const result = validateRuntimeExperience(baseExperience());
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.equal(result.value?.schemaVersion, 3);
});

test("schema v2 migrates cloned layouts to v3 projections", () => {
  const value = copy(baseExperience()) as unknown as Record<string, unknown>;
  const layouts = value.layouts as Record<string, Record<string, unknown>>;
  for (const layout of Object.values(layouts)) {
    for (const placement of layout.placements as Array<Record<string, unknown>>) delete placement.projection;
  }
  value.schemaVersion = 2;
  const original = copy(value);
  const result = validateRuntimeExperience(value);
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.equal(result.value?.schemaVersion, 3);
  assert.deepEqual(result.value?.layouts.landscape.projections, []);
  assert.deepEqual(result.value?.layouts.portrait.projections, []);
  assert.deepEqual(value, original);
});

test("projection refs and local positions are validated", () => {
  const missingRef = baseExperience();
  const placement = missingRef.layouts.landscape.placements[1];
  assert.equal(placement.type, "asset");
  placement.projection = { mode: "project", ref: "missing", localPosition: { x: 0, y: 0 } };
  const missingResult = validateRuntimeExperience(missingRef);
  assert.equal(missingResult.valid, false);
  assert.ok(missingResult.issues.some((issue) => issue.code === "projection-ref"));

  const outOfBounds = baseExperience();
  const outPlacement = outOfBounds.layouts.landscape.placements[1];
  assert.equal(outPlacement.type, "asset");
  outPlacement.projection = { mode: "project", ref: profile.id, localPosition: { x: 101, y: 20 } };
  const outResult = validateRuntimeExperience(outOfBounds);
  assert.equal(outResult.valid, false);
  assert.ok(outResult.issues.some((issue) => issue.code === "projection-local-position"));
});

test("project strength defaults valid and rejects values outside zero to one", () => {
  const value = baseExperience();
  const placement = value.layouts.landscape.placements[1];
  assert.equal(placement.type, "asset");
  placement.projection = { mode: "project", ref: profile.id, localPosition: { x: 50, y: 20 }, strength: 0.45 };
  assert.equal(validateRuntimeExperience(value).valid, true);
  placement.projection = { mode: "project", ref: profile.id, localPosition: { x: 50, y: 20 }, strength: 1.01 };
  const result = validateRuntimeExperience(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "projection-strength"));
});

test("projected spritesheets are rejected because mesh animation is unsupported", () => {
  const value = baseExperience();
  const assets = [...value.assets];
  assets[1] = {
    id: "item",
    kind: "item",
    loadType: "spritesheet",
    uri: "/imagegen/item.png",
    frame: { width: 32, height: 32 },
    frameCount: 1,
    animations: [{ id: "idle", frames: [0], frameRate: 1 }],
  };
  value.assets = assets;
  const result = validateRuntimeExperience(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "projection-spritesheet"));
});

test("guided profiles require ordered rows and convex non-crossing bands", () => {
  const guided = baseExperience();
  guided.layouts.landscape.projections = [{
    ...copy(profile),
    localSize: { width: 100, height: 100 },
    corners: [{ x: 100, y: 100 }, { x: 500, y: 100 }, { x: 460, y: 330 }, { x: 120, y: 300 }],
    horizontalGuides: [{ localY: 40, left: { x: 110, y: 180 }, right: { x: 490, y: 170 } }],
  }];
  assert.equal(validateRuntimeExperience(guided).valid, true, JSON.stringify(validateRuntimeExperience(guided).issues));

  const outOfOrder = copy(guided);
  outOfOrder.layouts.landscape.projections[0].horizontalGuides = [
    { localY: 40, left: { x: 110, y: 180 }, right: { x: 490, y: 170 } },
    { localY: 35, left: { x: 110, y: 220 }, right: { x: 490, y: 210 } },
  ];
  assert.equal(validateRuntimeExperience(outOfOrder).valid, false);

  const crossing = copy(guided);
  crossing.layouts.landscape.projections[0].horizontalGuides = [
    { localY: 40, left: { x: 490, y: 170 }, right: { x: 110, y: 180 } },
  ];
  assert.equal(validateRuntimeExperience(crossing).valid, false);
});

test("profiles reject malformed, degenerate, self-intersecting, non-convex, wrong-wound, and noninvertible quads", () => {
  const cases: RuntimeProjectionProfile[] = [
    { ...copy(profile), corners: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] },
    { ...copy(profile), corners: [{ x: 0, y: 0 }, { x: 3, y: 3 }, { x: 3, y: 0 }, { x: 0, y: 3 }] },
    { ...copy(profile), corners: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 4 }] },
    { ...copy(profile), corners: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }].reverse() as unknown as RuntimeProjectionProfile["corners"] },
    { ...copy(profile), corners: [{ x: 0, y: 0 }, { x: 1e9, y: 0 }, { x: 1e9, y: 1 }, { x: 0, y: 1 }] },
  ];
  for (const invalidProfile of cases) {
    const value = baseExperience();
    value.layouts.landscape.projections = [invalidProfile];
    assert.equal(validateRuntimeExperience(value).valid, false);
  }
});

test("projection budgets and weather prohibition are enforced", () => {
  const tooManyProfiles = baseExperience();
  tooManyProfiles.layouts.landscape.projections = Array.from({ length: 9 }, (_, index) => ({ ...copy(profile), id: `p-${index}` }));
  assert.equal(validateRuntimeExperience(tooManyProfiles).valid, false);

  const tooManyVertices = baseExperience();
  tooManyVertices.layouts.landscape.projections = [{ ...copy(profile), subdivisions: { x: 8, y: 24 } }];
  const projectedPlacements: RuntimePlacement[] = Array.from({ length: 33 }, (_, index) => ({
    id: `projected-${index}`,
    type: "asset" as const,
    assetId: "item",
    layer: "stage" as const,
    position: { x: 0.5, y: 0.5 },
    scale: 1,
    depth: index,
    projection: { mode: "project" as const, ref: profile.id, localPosition: { x: 0, y: 0 } },
  }));
  tooManyVertices.layouts.landscape.placements = [
    ...tooManyVertices.layouts.landscape.placements,
    ...projectedPlacements,
  ];
  assert.equal(validateRuntimeExperience(tooManyVertices).valid, false);

  const projectedWeather = baseExperience();
  projectedWeather.layouts.landscape.placements = [
    ...projectedWeather.layouts.landscape.placements,
    { id: "weather", type: "asset", assetId: "weather", layer: "weather", position: { x: 0.5, y: 0.5 }, scale: 1, depth: 3, projection: { mode: "project", ref: profile.id, localPosition: { x: 0, y: 0 } } },
  ];
  assert.equal(validateRuntimeExperience(projectedWeather).valid, false);
});

test("clip and underlay projection source rectangles require finite geometry", () => {
  const value = baseExperience();
  const placement = value.layouts.landscape.placements[1];
  assert.equal(placement.type, "asset");
  placement.projection = { mode: "clip", ref: profile.id, sourceRect: { x: 0, y: 0, width: 20, height: 10 } };
  assert.equal(validateRuntimeExperience(value).valid, true);
  placement.projection = { mode: "underlay", ref: profile.id, sourceRect: { x: 0, y: 0, width: 20, height: 10 }, edgeY: 14 };
  assert.equal(validateRuntimeExperience(value).valid, true);
  placement.projection = { mode: "clip", ref: profile.id, sourceRect: { x: 0, y: 0, width: 0, height: 10 } };
  assert.equal(validateRuntimeExperience(value).valid, false);
});

test("clip polygons require convex screen-positive winding and bounded uvInsetX", () => {
  const value = baseExperience();
  const placement = value.layouts.landscape.placements[1];
  assert.equal(placement.type, "asset");
  const polygon = [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 460, y: 330 },
    { x: 120, y: 300 },
  ];
  placement.projection = {
    mode: "clip",
    ref: profile.id,
    sourceRect: { x: 0, y: 0, width: 20, height: 10 },
    clipPolygon: polygon,
    uvInsetX: 0.05,
  };
  assert.equal(validateRuntimeExperience(value).valid, true);

  placement.projection = { ...placement.projection, clipPolygon: [...polygon].reverse() };
  assert.equal(validateRuntimeExperience(value).valid, false);
  placement.projection = {
    ...placement.projection,
    clipPolygon: [polygon[0], polygon[1], { x: 200, y: 150 }, polygon[3]],
  };
  assert.equal(validateRuntimeExperience(value).valid, false);
  placement.projection = { ...placement.projection, clipPolygon: polygon, uvInsetX: 0.5 };
  const insetResult = validateRuntimeExperience(value);
  assert.equal(insetResult.valid, false);
  assert.ok(insetResult.issues.some((issue) => issue.code === "projection-uv-inset"));
});
