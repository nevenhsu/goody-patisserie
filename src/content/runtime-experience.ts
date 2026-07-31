export const RUNTIME_EXPERIENCE_SCHEMA_VERSION = 3 as const;

export type RuntimeAssetKind = "scene" | "character" | "weather" | "item" | "animal";
export type RuntimeAssetLoadType = "image" | "spritesheet" | "atlas";
export type RuntimeOrientation = "landscape" | "portrait";
export type RuntimeWeatherTone = "sunny" | "cloudy" | "rain" | "storm" | "fog";
export type RuntimeLayer = "background" | "stage" | "foreground" | "weather";

export type NormalizedPoint = {
  x: number;
  y: number;
};

export type NormalizedBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type RuntimeAnimationClip = {
  id: string;
  frames: readonly number[];
  frameRate: number;
  repeat?: number;
  repeatDelayMs?: number;
  yoyo?: boolean;
};

/** World-space point used by projective projection profiles. */
export type RuntimeWorldPoint = {
  x: number;
  y: number;
};

export type RuntimeProjectionHorizontalGuide = {
  /** Local source-space y coordinate of this shared mesh row. */
  localY: number;
  /** World-space left and right endpoints at localY. */
  left: RuntimeWorldPoint;
  right: RuntimeWorldPoint;
};

export type RuntimeProjectionProfile = {
  id: string;
  kind: "projective-quad";
  localSize: { width: number; height: number };
  /** Corners ordered top-left, top-right, bottom-right, bottom-left. */
  corners: readonly [RuntimeWorldPoint, RuntimeWorldPoint, RuntimeWorldPoint, RuntimeWorldPoint];
  /** Optional exact rows that split one logical surface into guided bands. */
  horizontalGuides?: readonly RuntimeProjectionHorizontalGuide[];
  subdivisions: { x: number; y: number };
};

export type RuntimeProjectionSourceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RuntimePlacementProjection =
  | { mode: "project"; ref: string; localPosition: RuntimeWorldPoint; strength?: number }
  | {
      mode: "clip";
      ref: string;
      sourceRect: RuntimeProjectionSourceRect;
      clipPolygon?: readonly RuntimeWorldPoint[];
      uvInsetX?: number;
    }
  | { mode: "underlay"; ref: string; sourceRect: RuntimeProjectionSourceRect; edgeY: number };

/** Alias retained for callers that name projection data directly. */
export type RuntimeProjection = RuntimeProjectionProfile;

export type RuntimeAsset = {
  id: string;
  kind: RuntimeAssetKind;
  loadType: RuntimeAssetLoadType;
  uri: string;
  frame?: { width: number; height: number };
  frameCount?: number;
  atlasDataUri?: string;
  animations?: readonly RuntimeAnimationClip[];
};

export type RuntimeSpawnAnimationBinding = {
  defaultClip: string;
  movingClip?: string;
  autoplay?: boolean;
  flipWithMovement?: boolean;
  movementThreshold?: number;
  stopDelayMs?: number;
};

type SpawnBase = {
  id: string;
  assetId: string;
  actionIds?: readonly string[];
  animation?: RuntimeSpawnAnimationBinding;
};

export type CharacterSpawn = SpawnBase & {
  kind: "character";
  controllable?: boolean;
};

export type AnimalSpawn = SpawnBase & {
  kind: "animal";
};

export type ItemSpawn = SpawnBase & {
  kind: "item";
};

export type RuntimeSpawns = {
  characters: readonly CharacterSpawn[];
  animals: readonly AnimalSpawn[];
  items: readonly ItemSpawn[];
};

export type RuntimeSpawn = CharacterSpawn | AnimalSpawn | ItemSpawn;

type RuntimePlacementBase = {
  id: string;
  layer: RuntimeLayer;
  position: NormalizedPoint;
  scale: number;
  depth: number;
  flipX?: boolean;
  projection?: RuntimePlacementProjection;
};

export type RuntimeAssetPlacement = RuntimePlacementBase & {
  type: "asset";
  assetId: string;
};

export type RuntimeSpawnPlacement = RuntimePlacementBase & {
  type: "spawn";
  spawnId: string;
  /** Optional layout-specific visual asset while retaining the spawn identity and actions. */
  assetId?: string;
};

export type RuntimePlacement = RuntimeAssetPlacement | RuntimeSpawnPlacement;

export type RuntimeOrientationLayout = {
  /** Optional emergency/reference backdrop. Composed placements remain primary. */
  fallbackBackgroundAssetId?: string;
  world: { width: number; height: number };
  player: {
    spawnId: string;
    position: NormalizedPoint;
    movementBounds: NormalizedBounds;
    scale: number;
    depth: number;
  };
  projections: readonly RuntimeProjectionProfile[];
  placements: readonly RuntimePlacement[];
};

export type TweenRuntimeAction = {
  id: string;
  type: "tween";
  targetId: string;
  property: "x" | "y" | "alpha" | "scale" | "rotation";
  from: number;
  to: number;
  durationMs: number;
  yoyo?: boolean;
  repeat?: number;
};

export type ParticleLoopRuntimeAction = {
  id: string;
  type: "particle-loop";
  assetId: string;
  region: NormalizedBounds;
  frequencyMs: number;
  lifespanMs: number;
  velocity: { minY: number; maxY: number };
};

export type RuntimeAction = TweenRuntimeAction | ParticleLoopRuntimeAction;

export type RuntimeInteractionTrigger =
  | { type: "click"; targetId: string }
  | { type: "keyboard"; key: string; targetId?: string };

export type RuntimeModalPanel = "calendar" | "weekly-menu";

export type RuntimeInteraction = {
  id: string;
  triggers: readonly RuntimeInteractionTrigger[];
  action: {
    type: "open-modal";
    panel: RuntimeModalPanel;
    payloadKey: string;
  };
};

export type CalendarModalPayload = {
  key: string;
  panel: "calendar";
  title: string;
  schedule: {
    timeZone: string;
    entries: readonly {
      days: readonly string[];
      state: "closed" | "prep" | "open";
      hours?: string;
      note?: string;
    }[];
  };
};

export type WeeklyMenuModalPayload = {
  key: string;
  panel: "weekly-menu";
  title: string;
  weekOf: string;
  dateRange: {
    start: string;
    end: string;
    label: string;
  };
  hours: string;
  items: readonly {
    sku: string;
    name: string;
    priceTwd: number;
    description?: string;
    badges?: readonly string[];
    notes?: readonly string[];
    soldOut?: boolean;
  }[];
};

export type RuntimeModalPayload = CalendarModalPayload | WeeklyMenuModalPayload;

export type RuntimeExperience = {
  schemaVersion: typeof RUNTIME_EXPERIENCE_SCHEMA_VERSION;
  mode: "demo" | "released";
  release: { id: string; version: string };
  assets: readonly RuntimeAsset[];
  layouts: Record<RuntimeOrientation, RuntimeOrientationLayout>;
  spawns: RuntimeSpawns;
  actions: readonly RuntimeAction[];
  weather: {
    defaultTone: RuntimeWeatherTone;
    presentations: readonly {
      tone: RuntimeWeatherTone;
      particleActionId?: string;
      tint?: string;
    }[];
  };
  interactions: readonly RuntimeInteraction[];
  modalPayloads: readonly RuntimeModalPayload[];
};
