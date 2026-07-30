import {
  RUNTIME_EXPERIENCE_SCHEMA_VERSION,
  type RuntimeAction,
  type RuntimeAsset,
  type RuntimeAssetKind,
  type RuntimeExperience,
  type RuntimeModalPayload,
  type RuntimeOrientation,
  type RuntimeOrientationLayout,
  type RuntimeSpawn,
  type RuntimeWeatherTone,
} from "../content/runtime-experience";
import type { ValidationIssue } from "./errors";

export type RuntimeExperienceValidationResult = {
  valid: boolean;
  issues: readonly ValidationIssue[];
  value?: RuntimeExperience;
};

const ASSET_KINDS = new Set<RuntimeAssetKind>([
  "scene",
  "character",
  "weather",
  "item",
  "animal",
]);
const LOAD_TYPES = new Set(["image", "spritesheet", "atlas"]);
const WEATHER_TONES = new Set<RuntimeWeatherTone>([
  "sunny",
  "cloudy",
  "rain",
  "storm",
  "fog",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function add(issues: ValidationIssue[], path: string, code: string, message: string) {
  issues.push({ path, code, message });
}

function inUnitRange(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validatePoint(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!isRecord(value) || !inUnitRange(value.x) || !inUnitRange(value.y)) {
    add(issues, path, "normalized-point", "x and y must be finite numbers from 0 to 1");
  }
}

function validateBounds(value: unknown, path: string, issues: ValidationIssue[]) {
  if (
    !isRecord(value) ||
    !inUnitRange(value.minX) ||
    !inUnitRange(value.maxX) ||
    !inUnitRange(value.minY) ||
    !inUnitRange(value.maxY)
  ) {
    add(issues, path, "normalized-bounds", "bounds must be finite numbers from 0 to 1");
    return;
  }
  if (value.minX > value.maxX || value.minY > value.maxY) {
    add(issues, path, "normalized-bounds", "minimum bounds cannot exceed maximum bounds");
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function validateRuntimeExperience(value: unknown): RuntimeExperienceValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [{ path: "experience", code: "required", message: "runtime experience must be an object" }],
    };
  }

  if (value.schemaVersion !== RUNTIME_EXPERIENCE_SCHEMA_VERSION) {
    add(issues, "schemaVersion", "schema", "runtime experience schemaVersion must be 2");
  }
  if (value.mode !== "demo" && value.mode !== "released") {
    add(issues, "mode", "mode", "mode must be demo or released");
  }
  if (!isRecord(value.release) || !nonEmpty(value.release.id) || !nonEmpty(value.release.version)) {
    add(issues, "release", "required", "release id and version are required");
  }

  const assets = Array.isArray(value.assets) ? value.assets : [];
  if (!Array.isArray(value.assets)) add(issues, "assets", "required", "assets must be an array");
  const assetsById = new Map<string, RuntimeAsset>();
  assets.forEach((rawAsset, index) => {
    const path = `assets[${index}]`;
    if (!isRecord(rawAsset)) {
      add(issues, path, "shape", "asset must be an object");
      return;
    }
    if (!nonEmpty(rawAsset.id)) add(issues, `${path}.id`, "required", "asset id is required");
    else if (assetsById.has(rawAsset.id)) add(issues, `${path}.id`, "duplicate", `duplicate asset id: ${rawAsset.id}`);
    else assetsById.set(rawAsset.id, rawAsset as RuntimeAsset);
    if (!ASSET_KINDS.has(rawAsset.kind as RuntimeAssetKind)) add(issues, `${path}.kind`, "kind", "unknown asset kind");
    if (!LOAD_TYPES.has(rawAsset.loadType as string)) add(issues, `${path}.loadType`, "load-type", "unknown asset loadType");
    if (!nonEmpty(rawAsset.uri)) add(issues, `${path}.uri`, "required", "asset URI is required");
    if (value.mode === "demo" && nonEmpty(rawAsset.uri) && !rawAsset.uri.startsWith("/imagegen/")) {
      add(issues, `${path}.uri`, "demo-uri", "demo asset URI must live under /imagegen");
    }
    if (rawAsset.loadType === "spritesheet") {
      const frame = rawAsset.frame;
      if (!isRecord(frame) || !(Number(frame.width) > 0) || !(Number(frame.height) > 0)) {
        add(issues, `${path}.frame`, "required", "spritesheet frame width and height are required");
      }
    }
    if (rawAsset.loadType === "atlas") {
      if (!nonEmpty(rawAsset.atlasDataUri)) add(issues, `${path}.atlasDataUri`, "required", "atlas data URI is required");
      else if (value.mode === "demo" && !rawAsset.atlasDataUri.startsWith("/imagegen/")) {
        add(issues, `${path}.atlasDataUri`, "demo-uri", "demo atlas URI must live under /imagegen");
      }
    }
  });

  const spawnGroups = isRecord(value.spawns) ? value.spawns : {};
  if (!isRecord(value.spawns)) add(issues, "spawns", "required", "spawns must be an object");
  const spawnsById = new Map<string, RuntimeSpawn>();
  const expectedSpawnKinds = [
    ["characters", "character"],
    ["animals", "animal"],
    ["items", "item"],
  ] as const;
  for (const [groupName, expectedKind] of expectedSpawnKinds) {
    const group = Array.isArray(spawnGroups[groupName]) ? spawnGroups[groupName] : [];
    if (!Array.isArray(spawnGroups[groupName])) add(issues, `spawns.${groupName}`, "required", `${groupName} must be an array`);
    group.forEach((rawSpawn, index) => {
      const path = `spawns.${groupName}[${index}]`;
      if (!isRecord(rawSpawn)) {
        add(issues, path, "shape", "spawn must be an object");
        return;
      }
      if (rawSpawn.kind !== expectedKind) add(issues, `${path}.kind`, "kind", `spawn kind must be ${expectedKind}`);
      if (!nonEmpty(rawSpawn.id)) add(issues, `${path}.id`, "required", "spawn id is required");
      else if (spawnsById.has(rawSpawn.id)) add(issues, `${path}.id`, "duplicate", `duplicate spawn id: ${rawSpawn.id}`);
      else spawnsById.set(rawSpawn.id, rawSpawn as RuntimeSpawn);
      if (!nonEmpty(rawSpawn.assetId)) add(issues, `${path}.assetId`, "required", "spawn assetId is required");
      else {
        const asset = assetsById.get(rawSpawn.assetId);
        if (!asset) add(issues, `${path}.assetId`, "reference", `unknown asset: ${rawSpawn.assetId}`);
        else if (asset.kind !== expectedKind) add(issues, `${path}.assetId`, "kind-mismatch", `asset must have kind ${expectedKind}`);
      }
    });
  }

  const actions = Array.isArray(value.actions) ? value.actions : [];
  if (!Array.isArray(value.actions)) add(issues, "actions", "required", "actions must be an array");
  const actionsById = new Map<string, RuntimeAction>();
  actions.forEach((rawAction, index) => {
    const path = `actions[${index}]`;
    if (!isRecord(rawAction)) {
      add(issues, path, "shape", "action must be an object");
      return;
    }
    if (!nonEmpty(rawAction.id)) add(issues, `${path}.id`, "required", "action id is required");
    else if (actionsById.has(rawAction.id)) add(issues, `${path}.id`, "duplicate", `duplicate action id: ${rawAction.id}`);
    else actionsById.set(rawAction.id, rawAction as RuntimeAction);
    if (rawAction.type === "tween") {
      if (!nonEmpty(rawAction.targetId) || !spawnsById.has(rawAction.targetId)) {
        add(issues, `${path}.targetId`, "reference", `unknown tween target: ${String(rawAction.targetId)}`);
      }
      if (!(Number(rawAction.durationMs) > 0)) add(issues, `${path}.durationMs`, "range", "durationMs must be positive");
    } else if (rawAction.type === "particle-loop") {
      const asset = nonEmpty(rawAction.assetId) ? assetsById.get(rawAction.assetId) : undefined;
      if (!asset) add(issues, `${path}.assetId`, "reference", `unknown particle asset: ${String(rawAction.assetId)}`);
      else if (asset.kind !== "weather") add(issues, `${path}.assetId`, "kind-mismatch", "particle asset must have kind weather");
      validateBounds(rawAction.region, `${path}.region`, issues);
      if (!(Number(rawAction.frequencyMs) > 0) || !(Number(rawAction.lifespanMs) > 0)) {
        add(issues, path, "range", "particle frequencyMs and lifespanMs must be positive");
      }
    } else {
      add(issues, `${path}.type`, "type", "unknown action type");
    }
  });

  for (const [spawnId, spawn] of spawnsById) {
    for (const actionId of spawn.actionIds ?? []) {
      const action = actionsById.get(actionId);
      if (!action) add(issues, `spawns.${spawnId}.actionIds`, "reference", `unknown action: ${actionId}`);
      else if (action.type !== "tween" || action.targetId !== spawnId) {
        add(issues, `spawns.${spawnId}.actionIds`, "action-target", `action ${actionId} does not target spawn ${spawnId}`);
      }
    }
  }

  const layouts = isRecord(value.layouts) ? value.layouts : {};
  if (!isRecord(value.layouts)) add(issues, "layouts", "required", "layouts must be an object");
  for (const orientation of ["landscape", "portrait"] satisfies RuntimeOrientation[]) {
    const rawLayout = layouts[orientation];
    const path = `layouts.${orientation}`;
    if (!isRecord(rawLayout)) {
      add(issues, path, "required", `${orientation} layout is required`);
      continue;
    }
    const layout = rawLayout as RuntimeOrientationLayout;
    if (layout.fallbackBackgroundAssetId !== undefined) {
      const fallback = assetsById.get(layout.fallbackBackgroundAssetId);
      if (!fallback) add(issues, `${path}.fallbackBackgroundAssetId`, "reference", `unknown fallback background: ${layout.fallbackBackgroundAssetId}`);
      else if (fallback.kind !== "scene") add(issues, `${path}.fallbackBackgroundAssetId`, "kind-mismatch", "fallback background must have kind scene");
    }
    if (!isRecord(layout.world) || !(layout.world.width > 0) || !(layout.world.height > 0)) {
      add(issues, `${path}.world`, "range", "world width and height must be positive");
    }
    if (!isRecord(layout.player) || !nonEmpty(layout.player.spawnId)) {
      add(issues, `${path}.player`, "required", "player spawn is required");
    } else {
      const player = spawnsById.get(layout.player.spawnId);
      if (!player || player.kind !== "character") add(issues, `${path}.player.spawnId`, "reference", "player must reference a character spawn");
      validatePoint(layout.player.position, `${path}.player.position`, issues);
      validateBounds(layout.player.movementBounds, `${path}.player.movementBounds`, issues);
      if (!(layout.player.scale > 0)) add(issues, `${path}.player.scale`, "range", "player scale must be positive");
      if (!Number.isFinite(layout.player.depth)) add(issues, `${path}.player.depth`, "range", "player depth must be finite");
    }
    if (!Array.isArray(layout.placements)) {
      add(issues, `${path}.placements`, "required", "placements must be an array");
    } else {
      const placementIds = new Set<string>();
      const populatedLayers = new Set<string>();
      layout.placements.forEach((placement, index) => {
        const placementPath = `${path}.placements[${index}]`;
        if (!isRecord(placement)) {
          add(issues, placementPath, "shape", "placement must be an object");
          return;
        }
        if (!nonEmpty(placement.id)) add(issues, `${placementPath}.id`, "required", "placement id is required");
        else if (placementIds.has(placement.id)) add(issues, `${placementPath}.id`, "duplicate", `duplicate placement id: ${placement.id}`);
        else placementIds.add(placement.id);
        if (typeof placement.layer !== "string" || !["background", "stage", "foreground", "weather"].includes(placement.layer)) {
          add(issues, `${placementPath}.layer`, "layer", "unknown placement layer");
        } else {
          populatedLayers.add(placement.layer);
        }
        if (placement.type === "asset") {
          const asset = nonEmpty(placement.assetId) ? assetsById.get(placement.assetId) : undefined;
          if (!asset) add(issues, `${placementPath}.assetId`, "reference", `unknown asset: ${String(placement.assetId)}`);
          else if (placement.layer === "background" && asset.kind !== "scene") add(issues, `${placementPath}.assetId`, "kind-mismatch", "background placement must use a scene asset");
          else if (placement.layer === "weather" && asset.kind !== "weather") add(issues, `${placementPath}.assetId`, "kind-mismatch", "weather placement must use a weather asset");
        } else if (placement.type === "spawn") {
          if (!nonEmpty(placement.spawnId) || !spawnsById.has(placement.spawnId)) {
            add(issues, `${placementPath}.spawnId`, "reference", `unknown spawn: ${String(placement.spawnId)}`);
          }
        } else {
          add(issues, `${placementPath}.type`, "type", "placement type must be asset or spawn");
        }
        validatePoint(placement.position, `${placementPath}.position`, issues);
        if (typeof placement.scale !== "number" || !(placement.scale > 0)) add(issues, `${placementPath}.scale`, "range", "scale must be positive");
        if (!Number.isFinite(placement.depth)) add(issues, `${placementPath}.depth`, "range", "depth must be finite");
      });
      for (const requiredLayer of ["background", "stage", "foreground"]) {
        if (!populatedLayers.has(requiredLayer)) add(issues, `${path}.placements`, "missing-layer", `layout needs at least one ${requiredLayer} placement`);
      }
    }
  }

  const payloads = Array.isArray(value.modalPayloads) ? value.modalPayloads : [];
  if (!Array.isArray(value.modalPayloads)) add(issues, "modalPayloads", "required", "modalPayloads must be an array");
  const payloadsByKey = new Map<string, RuntimeModalPayload>();
  payloads.forEach((rawPayload, index) => {
    const path = `modalPayloads[${index}]`;
    if (!isRecord(rawPayload) || !nonEmpty(rawPayload.key)) {
      add(issues, `${path}.key`, "required", "modal payload key is required");
      return;
    }
    if (payloadsByKey.has(rawPayload.key)) add(issues, `${path}.key`, "duplicate", `duplicate modal payload key: ${rawPayload.key}`);
    else payloadsByKey.set(rawPayload.key, rawPayload as RuntimeModalPayload);
    if (rawPayload.panel !== "calendar" && rawPayload.panel !== "weekly-menu") add(issues, `${path}.panel`, "panel", "unknown modal panel");
    if (rawPayload.panel === "calendar" && (!isRecord(rawPayload.schedule) || !Array.isArray(rawPayload.schedule.entries))) {
      add(issues, `${path}.schedule`, "required", "calendar schedule entries are required");
    }
    if (rawPayload.panel === "weekly-menu") {
      const range = rawPayload.dateRange;
      if (
        !nonEmpty(rawPayload.weekOf) ||
        !nonEmpty(rawPayload.hours) ||
        !isRecord(range) ||
        !nonEmpty(range.start) ||
        !nonEmpty(range.end) ||
        !nonEmpty(range.label) ||
        !Array.isArray(rawPayload.items)
      ) {
        add(issues, path, "required", "weekly menu date range, hours, and items are required");
      } else {
        rawPayload.items.forEach((item, itemIndex) => {
          if (
            !isRecord(item) ||
            !nonEmpty(item.sku) ||
            !nonEmpty(item.name) ||
            typeof item.priceTwd !== "number" ||
            item.priceTwd < 0
          ) {
            add(issues, `${path}.items[${itemIndex}]`, "shape", "menu item sku, name, and non-negative priceTwd are required");
          }
        });
      }
    }
  });

  const interactions = Array.isArray(value.interactions) ? value.interactions : [];
  if (!Array.isArray(value.interactions)) add(issues, "interactions", "required", "interactions must be an array");
  const interactionIds = new Set<string>();
  interactions.forEach((rawInteraction, index) => {
    const path = `interactions[${index}]`;
    if (!isRecord(rawInteraction)) {
      add(issues, path, "shape", "interaction must be an object");
      return;
    }
    if (!nonEmpty(rawInteraction.id)) add(issues, `${path}.id`, "required", "interaction id is required");
    else if (interactionIds.has(rawInteraction.id)) add(issues, `${path}.id`, "duplicate", `duplicate interaction id: ${rawInteraction.id}`);
    else interactionIds.add(rawInteraction.id);
    if (!Array.isArray(rawInteraction.triggers) || rawInteraction.triggers.length === 0) {
      add(issues, `${path}.triggers`, "required", "interaction needs at least one trigger");
    } else {
      rawInteraction.triggers.forEach((trigger, triggerIndex) => {
        const triggerPath = `${path}.triggers[${triggerIndex}]`;
        if (!isRecord(trigger) || (trigger.type !== "click" && trigger.type !== "keyboard")) {
          add(issues, `${triggerPath}.type`, "type", "trigger must be click or keyboard");
          return;
        }
        if (trigger.type === "click" && (!nonEmpty(trigger.targetId) || !spawnsById.has(trigger.targetId))) {
          add(issues, `${triggerPath}.targetId`, "reference", `unknown click target: ${String(trigger.targetId)}`);
        }
        if (trigger.type === "keyboard") {
          if (!nonEmpty(trigger.key)) add(issues, `${triggerPath}.key`, "required", "keyboard key is required");
          if (trigger.targetId !== undefined && (!nonEmpty(trigger.targetId) || !spawnsById.has(trigger.targetId))) {
            add(issues, `${triggerPath}.targetId`, "reference", `unknown keyboard target: ${String(trigger.targetId)}`);
          }
        }
      });
    }
    const action = rawInteraction.action;
    if (!isRecord(action) || action.type !== "open-modal") {
      add(issues, `${path}.action`, "type", "interaction action must be open-modal");
      return;
    }
    const payload = nonEmpty(action.payloadKey) ? payloadsByKey.get(action.payloadKey) : undefined;
    if (!payload) add(issues, `${path}.action.payloadKey`, "reference", `unknown modal payload: ${String(action.payloadKey)}`);
    else if (action.panel !== payload.panel) add(issues, `${path}.action.panel`, "panel-mismatch", "interaction panel must match modal payload panel");
  });

  const weather = isRecord(value.weather) ? value.weather : {};
  if (!isRecord(value.weather)) add(issues, "weather", "required", "weather must be an object");
  if (!WEATHER_TONES.has(weather.defaultTone as RuntimeWeatherTone)) add(issues, "weather.defaultTone", "tone", "unknown default weather tone");
  const presentations = Array.isArray(weather.presentations) ? weather.presentations : [];
  if (!Array.isArray(weather.presentations)) add(issues, "weather.presentations", "required", "weather presentations must be an array");
  const tones = new Set<string>();
  presentations.forEach((presentation, index) => {
    const path = `weather.presentations[${index}]`;
    if (!isRecord(presentation) || !WEATHER_TONES.has(presentation.tone as RuntimeWeatherTone)) {
      add(issues, `${path}.tone`, "tone", "unknown weather tone");
      return;
    }
    if (tones.has(presentation.tone as string)) add(issues, `${path}.tone`, "duplicate", `duplicate weather tone: ${presentation.tone}`);
    else tones.add(presentation.tone as string);
    if (presentation.particleActionId !== undefined) {
      const action = nonEmpty(presentation.particleActionId) ? actionsById.get(presentation.particleActionId) : undefined;
      if (!action || action.type !== "particle-loop") add(issues, `${path}.particleActionId`, "reference", "weather presentation must reference a particle-loop action");
    }
  });

  return issues.length === 0
    ? { valid: true, issues, value: clone(value as RuntimeExperience) }
    : { valid: false, issues };
}

export function selectOrientationLayout(
  experience: RuntimeExperience,
  width: number,
  height: number,
): RuntimeOrientationLayout {
  return height > width ? experience.layouts.portrait : experience.layouts.landscape;
}
