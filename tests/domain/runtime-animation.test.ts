import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeExperience } from "../../src/content/runtime-experience";
import { validateRuntimeExperience } from "../../src/domain/experience";
import { getDemoRuntimeExperience } from "../../src/runtime/demo";

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function animatedExperience(): RuntimeExperience {
  const value = getDemoRuntimeExperience();
  value.assets = [
    ...value.assets,
    {
      id: "animated-shopkeeper",
      kind: "character",
      loadType: "spritesheet",
      uri: "/imagegen/animated-shopkeeper.png",
      frame: { width: 32, height: 48 },
      frameCount: 4,
      animations: [
        { id: "idle", frames: [0, 1], frameRate: 8 },
        { id: "walk", frames: [2, 3], frameRate: 12, repeat: -1, repeatDelayMs: 20, yoyo: true },
      ],
    },
  ];
  value.spawns.characters = [
    ...value.spawns.characters,
    {
      id: "animated-player",
      kind: "character",
      assetId: "animated-shopkeeper",
      animation: {
        defaultClip: "idle",
        movingClip: "walk",
        movementThreshold: 0.01,
        stopDelayMs: 120,
      },
    },
  ];
  value.layouts.landscape.player = { ...value.layouts.landscape.player, spawnId: "animated-player" };
  value.layouts.portrait.player = { ...value.layouts.portrait.player, spawnId: "animated-player" };
  return value;
}

test("v3 animation fields remain optional", () => {
  const value = getDemoRuntimeExperience();
  assert.equal(validateRuntimeExperience(value).valid, true);
});

test("spritesheet animation clips validate frame and playback options", () => {
  const result = validateRuntimeExperience(animatedExperience());
  assert.equal(result.valid, true, JSON.stringify(result.issues));
});

test("animation clips reject malformed values and duplicate ids", () => {
  const value = animatedExperience();
  const asset = value.assets.find((candidate) => candidate.id === "animated-shopkeeper");
  assert.ok(asset && asset.loadType === "spritesheet");
  asset.animations = [
    { id: "idle", frames: [0], frameRate: 8 },
    { id: "idle", frames: [1.5], frameRate: 61, repeat: -2, repeatDelayMs: 60001, yoyo: "yes" as never },
  ];
  const result = validateRuntimeExperience(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "duplicate" && issue.path.endsWith(".id")));
  assert.ok(result.issues.some((issue) => issue.code === "animation-frames"));
  assert.ok(result.issues.some((issue) => issue.code === "animation-frame-rate"));
  assert.ok(result.issues.some((issue) => issue.code === "animation-repeat"));
  assert.ok(result.issues.some((issue) => issue.code === "animation-repeat-delay"));
  assert.ok(result.issues.some((issue) => issue.code === "animation-yoyo"));
});

test("animation clips stay within the declared spritesheet frame count", () => {
  const missingCount = animatedExperience();
  const missingCountAsset = missingCount.assets.find((candidate) => candidate.id === "animated-shopkeeper");
  assert.ok(missingCountAsset);
  delete missingCountAsset.frameCount;
  const missingCountResult = validateRuntimeExperience(missingCount);
  assert.equal(missingCountResult.valid, false);
  assert.ok(missingCountResult.issues.some((issue) => issue.code === "animation-frame-count"));

  const outOfRange = animatedExperience();
  const outOfRangeAsset = outOfRange.assets.find((candidate) => candidate.id === "animated-shopkeeper");
  assert.ok(outOfRangeAsset?.animations);
  outOfRangeAsset.animations = [{ id: "idle", frames: [0, 4], frameRate: 8 }];
  const outOfRangeResult = validateRuntimeExperience(outOfRange);
  assert.equal(outOfRangeResult.valid, false);
  assert.ok(outOfRangeResult.issues.some((issue) => issue.code === "animation-frames"));
});

test("animations are spritesheet-only and spawn bindings reference known clips", () => {
  const nonSpritesheet = animatedExperience();
  const imageAsset = nonSpritesheet.assets.find((candidate) => candidate.id === "shopkeeper");
  assert.ok(imageAsset);
  imageAsset.animations = [{ id: "idle", frames: [0], frameRate: 8 }];
  const nonSpritesheetResult = validateRuntimeExperience(nonSpritesheet);
  assert.equal(nonSpritesheetResult.valid, false);
  assert.ok(nonSpritesheetResult.issues.some((issue) => issue.code === "animation-load-type"));

  const unknownClip = copy(animatedExperience());
  const spawn = unknownClip.spawns.characters.find((candidate) => candidate.id === "animated-player");
  assert.ok(spawn?.animation);
  spawn.animation = { ...spawn.animation, defaultClip: "missing" };
  const unknownClipResult = validateRuntimeExperience(unknownClip);
  assert.equal(unknownClipResult.valid, false);
  assert.ok(unknownClipResult.issues.some((issue) => issue.code === "reference" && issue.path.endsWith("defaultClip")));
});
