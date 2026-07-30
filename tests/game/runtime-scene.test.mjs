import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateRuntimeExperience } from "../../src/domain/experience.ts";
import { GameBridge } from "../../src/game/bridge.ts";
import {
  getInteractionDetailForTarget,
  getRenderableAssetIds,
  getRuntimeAssetKey,
  getWeatherParticleAction,
  resolveTweenRange,
  shouldRenderPlacementImage,
} from "../../src/game/scene.ts";
import { getViewportCamera } from "../../src/game/viewport.ts";
import { getDemoRuntimeExperience } from "../../src/runtime/demo.ts";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

test("client guard accepts RuntimeExperience v2 and rejects stale bootstrap", () => {
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
    assert.equal(existsSync(`${projectRoot}public${entry.file}`), true, `missing file: ${entry.file}`);
    assert.deepEqual(entry.canvas, spec.classes[entry.class].canvas);
    assert.deepEqual(entry.anchor, spec.classes[entry.class].anchor);
  }
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

test("weather placement is an emitter anchor, not a static image", () => {
  const experience = getDemoRuntimeExperience();
  const weatherPlacements = experience.layouts.landscape.placements.filter(
    (placement) => placement.layer === "weather",
  );

  assert.ok(weatherPlacements.length > 0);
  assert.equal(weatherPlacements.every((placement) => !shouldRenderPlacementImage(placement)), true);
  assert.equal(getWeatherParticleAction(experience), undefined);

  experience.weather.defaultTone = "rain";
  assert.equal(getWeatherParticleAction(experience)?.id, "rain-loop");
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
