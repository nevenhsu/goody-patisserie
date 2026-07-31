import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeExperience } from "../../src/content/runtime-experience";
import {
  getRuntimeExperience,
  selectOrientationLayout,
  validateRuntimeExperience,
} from "../../src/runtime";
import {
  createPayloadRuntimeExperienceSource,
  type PayloadRuntimeReader,
} from "../../src/runtime/payload";

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function releasedExperience(id = "release-2026-07", version = "2026.07.1") {
  const value = copy(await getRuntimeExperience());
  value.mode = "released";
  value.release = { id, version };
  return value;
}

test("runtime experience validates full asset, spawn, action, interaction, and orientation contract", async () => {
  const value = copy(await getRuntimeExperience());
  value.assets = [
    ...value.assets,
    {
      id: "test-spritesheet",
      kind: "character",
      loadType: "spritesheet",
      uri: "/imagegen/test-spritesheet.png",
      frame: { width: 32, height: 48 },
    },
    {
      id: "test-atlas",
      kind: "item",
      loadType: "atlas",
      uri: "/imagegen/test-atlas.png",
      atlasDataUri: "/imagegen/test-atlas.json",
    },
  ];

  const result = validateRuntimeExperience(value);
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.deepEqual(new Set(value.assets.map((asset) => asset.kind)), new Set(["scene", "character", "weather", "item", "animal"]));
  assert.deepEqual(new Set(value.assets.map((asset) => asset.loadType)), new Set(["image", "spritesheet", "atlas"]));
  assert.deepEqual(new Set(value.layouts.landscape.placements.map((placement) => placement.layer)), new Set(["background", "stage", "foreground", "weather"]));
  assert.ok(value.layouts.landscape.placements.filter((placement) => placement.layer === "background").length > 1);
  assert.equal(value.spawns.characters.length > 0 && value.spawns.animals.length > 0 && value.spawns.items.length > 0, true);
  assert.deepEqual(new Set(value.actions.map((action) => action.type)), new Set(["tween", "particle-loop"]));
});

test("released content can keep a container separate from swappable pastry content", async () => {
  const value = copy(await getRuntimeExperience());
  value.assets = [
    ...value.assets,
    { id: "released-cabinet", kind: "item", loadType: "image", uri: "/imagegen/released-cabinet-v1.png" },
    { id: "released-pastry-a", kind: "item", loadType: "image", uri: "/imagegen/released-pastry-a-v1.png" },
    { id: "released-pastry-b", kind: "item", loadType: "image", uri: "/imagegen/released-pastry-b-v1.png" },
  ];
  value.spawns.items = [
    ...value.spawns.items,
    { id: "released-pastry-a", kind: "item", assetId: "released-pastry-a" },
    { id: "released-pastry-b", kind: "item", assetId: "released-pastry-b" },
  ];
  value.layouts.landscape.placements = [
    ...value.layouts.landscape.placements,
    { id: "released-cabinet", type: "asset", assetId: "released-cabinet", layer: "stage", position: { x: 0.5, y: 0.5 }, scale: 0.4, depth: 32 },
    { id: "released-pastry", type: "spawn", spawnId: "released-pastry-a", layer: "stage", position: { x: 0.5, y: 0.5 }, scale: 0.08, depth: 33 },
  ];

  const cabinetBefore = value.layouts.landscape.placements.find((placement) => placement.id === "released-cabinet");
  value.layouts.landscape.placements = value.layouts.landscape.placements.map((placement) =>
    placement.id === "released-pastry" && placement.type === "spawn"
      ? { ...placement, spawnId: "released-pastry-b" }
      : placement,
  );
  const cabinetAfter = value.layouts.landscape.placements.find((placement) => placement.id === "released-cabinet");
  assert.deepEqual(cabinetAfter, cabinetBefore);
  assert.equal(validateRuntimeExperience(value).valid, true);
});

test("spawn placements may select a layout-specific asset of the same kind", async () => {
  const value = copy(await getRuntimeExperience());
  const placement = value.layouts.landscape.placements.find(
    (candidate) => candidate.id === "land-pandan-pearl-sugar-choux" && candidate.type === "spawn",
  );
  assert.ok(placement && placement.type === "spawn");
  assert.equal(placement.assetId, "pastry-pandan-pearl-sugar-choux-landscape-v2");
  assert.equal(validateRuntimeExperience(value).valid, true);

  placement.assetId = "missing-layout-specific-asset";
  assert.equal(validateRuntimeExperience(value).valid, false);

  placement.assetId = "cafe-reference-landscape";
  assert.equal(validateRuntimeExperience(value).valid, false);
});

test("demo composes empty containers, wall art, and eleven swappable pastry assets", async () => {
  const value = copy(await getRuntimeExperience());
  const assets = new Map(value.assets.map((asset) => [asset.id, asset]));
  const itemSpawns = new Map(value.spawns.items.map((spawn) => [spawn.id, spawn]));
  const pastryFiles = {
    "pandan-pearl-sugar-choux": "goody-pastry-pandan-pearl-sugar-choux-v1.png",
    "pandan-thai-tea-saint-honore": "goody-pastry-pandan-thai-tea-saint-honore-v1.png",
    "pandan-thai-tea-saint-honore-6-inch": "goody-pastry-pandan-thai-tea-saint-honore-6-inch-v1.png",
    "pistachio-cherry-tart": "goody-pastry-pistachio-cherry-tart-v1.png",
    "muscat-white-wine": "goody-pastry-muscat-white-wine-v1.png",
    "pandan-thai-tea-cake-roll": "goody-pastry-pandan-thai-tea-cake-roll-v1.png",
    "vanilla-basque-cheesecake-slice": "goody-pastry-vanilla-basque-cheesecake-slice-v1.png",
    "vanilla-basque-cheesecake-6-inch": "goody-pastry-vanilla-basque-cheesecake-6-inch-v1.png",
    "pandan-madeleine-2-pack": "goody-pastry-pandan-madeleine-2-pack-v1.png",
    "pistachio-cherry-dacquoise": "goody-pastry-pistachio-cherry-dacquoise-v1.png",
    "vanilla-canele": "goody-pastry-vanilla-canele-v1.png",
  } as const;

  assert.equal(assets.get("display-cabinet")?.uri, "/imagegen/goody-display-cabinet-v1.png");
  assert.equal(assets.get("oven-tray")?.uri, "/imagegen/goody-item-oven-tray-v1.png");
  assert.equal(assets.get("painting-tokyo")?.uri, "/imagegen/goody-wall-art-tokyo-v1.png");
  assert.equal(assets.get("painting-melbourne")?.uri, "/imagegen/goody-wall-art-melbourne-v1.png");
  for (const [pastryId, file] of Object.entries(pastryFiles)) {
    const spawn = itemSpawns.get(pastryId);
    assert.ok(spawn, `missing pastry spawn: ${pastryId}`);
    assert.equal(assets.get(spawn.assetId)?.uri, `/imagegen/${file}`);
    for (const orientation of ["landscape", "portrait"] as const) {
      assert.ok(value.layouts[orientation].placements.some((placement) => placement.type === "spawn" && placement.spawnId === pastryId));
    }
  }

  const cabinetBefore = value.layouts.landscape.placements.find((placement) => placement.id === "land-display-cabinet");
  value.layouts.landscape.placements = value.layouts.landscape.placements.map((placement) =>
    placement.id === "land-pandan-pearl-sugar-choux" && placement.type === "spawn"
      ? { ...placement, spawnId: "vanilla-canele" }
      : placement,
  );
  assert.deepEqual(
    value.layouts.landscape.placements.find((placement) => placement.id === "land-display-cabinet"),
    cabinetBefore,
  );
  assert.equal(validateRuntimeExperience(value).valid, true);
});

test("demo weekly menu matches 07/31-08/02 service and all eleven SKUs", async () => {
  const value = await getRuntimeExperience();
  const menu = value.modalPayloads.find((payload) => payload.panel === "weekly-menu");
  assert.ok(menu && menu.panel === "weekly-menu");
  assert.deepEqual(menu.dateRange, {
    start: "2026-07-31",
    end: "2026-08-02",
    label: "07/31(五)－08/02(日)",
  });
  assert.equal(menu.hours, "13:00-18:00");
  assert.deepEqual(
    menu.items.map(({ sku, name, priceTwd }) => [sku, name, priceTwd]),
    [
      ["01", "斑蘭珍珠糖泡芙", 120],
      ["02", "斑蘭泰奶聖多諾", 220],
      ["03", "斑蘭泰奶聖多諾 6吋", 1300],
      ["04", "開心果櫻桃塔", 220],
      ["05", "麝香白酒", 200],
      ["06", "斑蘭泰奶蛋糕捲", 450],
      ["07", "香草巴斯克乳酪 切片", 130],
      ["08", "香草巴斯克乳酪 6吋", 750],
      ["09", "斑蘭瑪德蓮 2入", 100],
      ["10", "開心果櫻桃達克瓦茲", 90],
      ["11", "香草可麗露", 80],
    ],
  );
  assert.deepEqual(menu.items[0].badges, ["新品"]);
  assert.deepEqual(menu.items[1].notes, ["建議當天吃完"]);
  assert.deepEqual(menu.items[2].notes, ["建議當天吃完"]);
  assert.deepEqual(menu.items[4].notes, ["含酒"]);
});

test("runtime validation rejects dangling refs, bad normalized values, target mismatch, and unknown modal payloads", async () => {
  const value = copy(await getRuntimeExperience());
  const landscape = value.layouts.landscape;
  landscape.placements = landscape.placements.map((placement, index) =>
    index === 0 && placement.type === "asset"
      ? { ...placement, assetId: "missing-asset", position: { x: 1.2, y: 0.5 } }
      : placement,
  );
  value.spawns = {
    ...value.spawns,
    animals: value.spawns.animals.map((spawn, index) =>
      index === 0 ? { ...spawn, actionIds: ["rain-loop"] } : spawn,
    ),
  };
  value.interactions = value.interactions.map((interaction, index) =>
    index === 0
      ? { ...interaction, action: { ...interaction.action, payloadKey: "missing-payload" } }
      : interaction,
  );

  const result = validateRuntimeExperience(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "reference" && issue.path.includes("assetId")));
  assert.ok(result.issues.some((issue) => issue.code === "normalized-point"));
  assert.ok(result.issues.some((issue) => issue.code === "action-target"));
  assert.ok(result.issues.some((issue) => issue.path.endsWith("payloadKey")));
});

test("orientation selection uses portrait only when height exceeds width", async () => {
  const value = await getRuntimeExperience();
  assert.equal(selectOrientationLayout(value, 1600, 900), value.layouts.landscape);
  assert.equal(selectOrientationLayout(value, 900, 1600), value.layouts.portrait);
  assert.equal(selectOrientationLayout(value, 1000, 1000), value.layouts.landscape);
});

test("Payload source requests and returns only matching published releases", async () => {
  const manifest = await releasedExperience();
  let receivedFind: Parameters<PayloadRuntimeReader["find"]>[0] | undefined;
  const reader: PayloadRuntimeReader = {
    findGlobal: async () => ({ defaultReleaseKey: manifest.release.id }),
    find: async (args) => {
      receivedFind = args;
      return {
        docs: [{
          key: manifest.release.id,
          version: manifest.release.version,
          status: "released",
          _status: "published",
          manifest,
        }],
      };
    },
  };

  const loaded = await createPayloadRuntimeExperienceSource(reader).load();
  assert.deepEqual(loaded?.release, manifest.release);
  assert.equal(receivedFind?.draft, false);
  assert.equal(receivedFind?.overrideAccess, false);
  assert.deepEqual(receivedFind?.where.and[1], { status: { equals: "released" } });
  assert.deepEqual(receivedFind?.where.and[2], { _status: { equals: "published" } });

  const draftReader: PayloadRuntimeReader = {
    ...reader,
    find: async () => ({
      docs: [{
        key: manifest.release.id,
        version: manifest.release.version,
        status: "released",
        _status: "draft",
        manifest,
      }],
    }),
  };
  assert.equal(await createPayloadRuntimeExperienceSource(draftReader).load(), null);
});

test("runtime source falls back to built-in demo when empty, invalid, or unavailable", async () => {
  const empty = await getRuntimeExperience({ load: () => null });
  const invalid = await getRuntimeExperience({ load: () => ({ schemaVersion: 999 }) });
  const unavailable = await getRuntimeExperience({ load: () => { throw new Error("D1 unavailable"); } });

  for (const value of [empty, invalid, unavailable] satisfies RuntimeExperience[]) {
    assert.equal(value.mode, "demo");
    assert.equal(value.schemaVersion, 3);
  }
});
