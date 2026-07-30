import assert from "node:assert/strict";
import test from "node:test";
import { AssetValidator } from "../../src/domain/assets";
import { CharacterAppearance } from "../../src/domain/character";
import { InMemoryReleaseRepository, ReleasePublisher } from "../../src/domain/release";
import { FixedClock, RuntimeBootstrap } from "../../src/domain/runtime";
import { ScheduleResolver } from "../../src/domain/schedule";
import type { ReleaseManifest } from "../../src/content/types";

function manifest(id = "r1"): ReleaseManifest {
  return {
    schemaVersion: 1,
    id,
    version: id,
    releasedAt: "2026-07-30T00:00:00.000Z",
    assets: [
      { id: "bg", layer: "background", source: { kind: "uri", uri: "/bg.png" } },
      { id: "chef", layer: "actor", source: { kind: "uri", uri: "/chef.png" } },
      { id: "fg", layer: "foreground", source: { kind: "uri", uri: "/fg.png" } },
    ],
    baseScenes: [{ id: "shop", name: "Shop", layers: [
      { assetId: "bg", layer: "background", zIndex: 0 },
      { assetId: "chef", layer: "actor", zIndex: 1 },
      { assetId: "fg", layer: "foreground", zIndex: 2 },
    ] }],
    weeklySchedule: {
      timeZone: "Asia/Taipei",
      entries: [
        { weekday: 1, state: "rest" },
        { weekday: 2, state: "prep" },
        { weekday: 3, state: "prep" },
        { weekday: 4, state: "prep" },
        { weekday: 5, state: "open", openTime: "13:00", closeTime: "18:00", sceneId: "shop" },
        { weekday: 6, state: "open", openTime: "13:00", closeTime: "18:00", sceneId: "shop" },
        { weekday: 0, state: "open", openTime: "13:00", closeTime: "18:00", sceneId: "shop" },
      ],
    },
    site: {
      brand: { english: "Goody Pâtisserie", chinese: "古迪法式甜點" },
      timeZone: "Asia/Taipei",
    },
  };
}

test("schedule resolves exact dates by priority, specificity, then release", () => {
  const resolver = new ScheduleResolver({
    weeklySchedule: { timeZone: "Asia/Taipei", entries: [{ weekday: 5, state: "open" }] },
    datedSchedules: [
      { id: "range", startDate: "2026-07-01", endDate: "2026-07-31", state: "prep", priority: 2, releasedAt: "2026-07-01T00:00:00Z" },
      { id: "exact-old", date: "2026-07-31", state: "rest", priority: 2, releasedAt: "2026-07-02T00:00:00Z" },
      { id: "exact-new", date: "2026-07-31", state: "closed", priority: 2, releasedAt: "2026-07-03T00:00:00Z" },
    ],
  });
  const result = resolver.resolve("2026-07-31");
  assert.equal(result.state, "closed");
  assert.equal(result.ruleId, "exact-new");
  assert.equal(result.source, "dated");
});

test("Goody weekly hours use Taipei time and close exactly at 18:00", () => {
  const resolver = new ScheduleResolver({
    weeklySchedule: {
      timeZone: "Asia/Taipei",
      entries: [
        { weekday: 5, state: "open", openTime: "13:00", closeTime: "18:00" },
      ],
    },
  });

  assert.equal(resolver.resolve(new Date("2026-07-31T04:59:00Z")).state, "closed");
  assert.equal(resolver.resolve(new Date("2026-07-31T05:00:00Z")).state, "open");
  assert.equal(resolver.resolve(new Date("2026-07-31T09:59:00Z")).state, "open");
  assert.equal(resolver.resolve(new Date("2026-07-31T10:00:00Z")).state, "closed");
});

test("asset validator catches missing layers and dangling references", () => {
  const value = manifest();
  const result = new AssetValidator().validate({
    ...value,
    assets: value.assets.filter((asset) => asset.id !== "fg"),
    baseScenes: [{ ...value.baseScenes[0], layers: [...value.baseScenes[0].layers, { assetId: "missing", layer: "foreground", zIndex: 3 }] }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "missing-layer"));
  assert.ok(result.issues.some((issue) => issue.code === "reference"));
});

test("release validation rejects weekly schedule references to unknown scenes", async () => {
  const repository = new InMemoryReleaseRepository();
  const publisher = new ReleasePublisher(repository);
  const value = manifest();

  await assert.rejects(
    () => publisher.publish({
      ...value,
      weeklySchedule: {
        ...value.weeklySchedule,
        entries: value.weeklySchedule.entries.map((entry) =>
          entry.weekday === 5 ? { ...entry, sceneId: "missing-scene" } : entry),
      },
    }),
    /validation failed/i,
  );
});

test("character appearance enforces ordering and synchronized animation tags", () => {
  const result = CharacterAppearance.validate({
    characterId: "chef",
    traits: { hair: "dark" },
    synchronizedAnimationTags: ["idle", "bake"],
    layers: [
      { id: "body", slot: "body", assetId: "body", zIndex: 1, animationTags: ["idle"] },
      { id: "hair", slot: "hair", assetId: "hair", zIndex: 0, animationTags: ["idle", "bake"] },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "order"));
  assert.ok(result.issues.some((issue) => issue.code === "animation-sync"));
});

test("release publisher keeps snapshots immutable and runtime serves stale weather last-known", async () => {
  const repository = new InMemoryReleaseRepository();
  const publisher = new ReleasePublisher(repository);
  await publisher.publish(manifest());
  await assert.rejects(() => publisher.publish({ ...manifest(), site: { ...manifest().site, brand: { ...manifest().site.brand, english: "Changed" } } }), /immutable/);
  const clock = new FixedClock(new Date("2026-07-31T00:00:00.000Z"));
  const runtime = new RuntimeBootstrap(repository, {
    clock,
    weatherMaxAgeMs: 60_000,
    weatherAdapter: { getCurrent: () => ({ locationId: "taipei", observedAt: "2026-07-30T00:00:00.000Z", temperatureC: 29, code: 1, label: "晴朗" }) },
  });
  const result = await runtime.bootstrap();
  assert.equal(result.activeManifest.id, "r1");
  assert.equal(result.weather.stale, true);
  assert.equal(result.weather.lastKnown?.temperatureC, 29);
});

test("weather fallback never crosses release locations", async () => {
  const repository = new InMemoryReleaseRepository();
  const publisher = new ReleasePublisher(repository);
  const taipei = {
    ...manifest("taipei"),
    site: {
      ...manifest("taipei").site,
      weatherLocation: { id: "taipei", label: "台北", latitude: 25.03, longitude: 121.56 },
    },
  } satisfies ReleaseManifest;
  const kaohsiung = {
    ...manifest("kaohsiung"),
    site: {
      ...manifest("kaohsiung").site,
      weatherLocation: { id: "kaohsiung", label: "高雄", latitude: 22.62, longitude: 120.31 },
    },
  } satisfies ReleaseManifest;
  await publisher.publish(taipei);

  let failWeather = false;
  const runtime = new RuntimeBootstrap(repository, {
    weatherAdapter: {
      getCurrent: () => {
        if (failWeather) throw new Error("weather unavailable");
        return { locationId: "taipei", observedAt: "2026-07-30T00:00:00Z", temperatureC: 29, code: 1, label: "晴朗" };
      },
    },
  });
  await runtime.bootstrap(new Date("2026-07-30T00:01:00Z"));
  await publisher.publish(kaohsiung);
  failWeather = true;

  const result = await runtime.bootstrap(new Date("2026-07-30T00:02:00Z"));
  assert.equal(result.weather.lastKnown, null);
  assert.equal(result.weather.stale, true);
});
