/**
 * Serializable content contracts shared by authoring, publishing, and the
 * runtime.  These types intentionally contain data only; adapters and domain
 * services live under `src/domain`.
 */

export type Identifier = string;

export type AssetLayer =
  | "backgroundFar"
  | "background"
  | "wall"
  | "floor"
  | "furnitureBack"
  | "actorShadow"
  | "actor"
  | "furnitureFront"
  | "foreground"
  | "weatherFx"
  | "interactionMarker"
  | "debug";

export const ASSET_LAYER_VOCABULARY = [
  "backgroundFar",
  "background",
  "wall",
  "floor",
  "furnitureBack",
  "actorShadow",
  "actor",
  "furnitureFront",
  "foreground",
  "weatherFx",
  "interactionMarker",
  "debug",
] as const satisfies readonly AssetLayer[];

export const DEFAULT_REQUIRED_ASSET_LAYERS = [
  "background",
  "actor",
  "foreground",
] as const satisfies readonly AssetLayer[];

export type ExternalTsjReference = {
  kind: "external-tsj";
  /** Module URL/path as understood by the injected authoring resolver. */
  source: string;
  /** Optional named export containing the serializable asset data. */
  exportName?: string;
};

export type AssetSource =
  | { kind: "uri"; uri: string }
  | ExternalTsjReference;

export type SceneAsset = {
  id: Identifier;
  layer: AssetLayer;
  source: AssetSource;
  /** Optional dimensions are metadata and are not used for referential checks. */
  width?: number;
  height?: number;
  alt?: string;
  tags?: readonly string[];
};

export type CharacterSlot =
  | "base"
  | "body"
  | "face"
  | "hair"
  | "clothing"
  | "accessory"
  | "hand"
  | "prop"
  | "effect";

export type CharacterPart = {
  id: Identifier;
  slot: CharacterSlot;
  assetId: Identifier;
  /** Tags identify animation frames/poses available for this part. */
  animationTags?: readonly string[];
  zIndex: number;
};

export type CharacterPreset = {
  id: Identifier;
  name: string;
  parts: readonly CharacterPart[];
  /** Tags that every participating part must support when synchronized. */
  synchronizedAnimationTags?: readonly string[];
};

export type CharacterDefinition = {
  id: Identifier;
  name?: string;
  traits?: readonly string[];
  presets: readonly CharacterPreset[];
};

export type Interaction = {
  id: Identifier;
  trigger: string;
  /** Stable target id (another interaction, a scene, or an external action). */
  targetId?: Identifier;
  action?: string;
  payload?: Readonly<Record<string, string | number | boolean | null>>;
};

export type SceneLayer = {
  assetId: Identifier;
  layer: AssetLayer;
  zIndex: number;
  visible?: boolean;
};

export type BaseScene = {
  id: Identifier;
  name: string;
  layers: readonly SceneLayer[];
  interactions?: readonly Interaction[];
};

export type SceneVariant = {
  id: Identifier;
  sceneId: Identifier;
  name?: string;
  layers?: readonly SceneLayer[];
  interactions?: readonly Interaction[];
  priority?: number;
  releasedAt?: string;
};

export type ScheduleState = "rest" | "prep" | "closed" | "open";
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type WeeklyScheduleEntry = {
  weekday: Weekday;
  state: ScheduleState;
  openTime?: string;
  closeTime?: string;
  sceneId?: Identifier;
  variantId?: Identifier;
  priority?: number;
  releasedAt?: string;
};

export type WeeklySchedule = {
  timeZone: string;
  entries: readonly WeeklyScheduleEntry[];
};

/** A schedule rule matching one date or an inclusive local-date range. */
export type DatedSchedule = {
  id: Identifier;
  date?: string;
  startDate?: string;
  endDate?: string;
  state: ScheduleState;
  openTime?: string;
  closeTime?: string;
  sceneId?: Identifier;
  variantId?: Identifier;
  priority?: number;
  /** Explicit specificity may be supplied by an authoring tool. */
  specificity?: number;
  releasedAt: string;
};

/** Named variant rules are kept separate in the serialized contract for CMSs. */
export type ScheduleVariant = DatedSchedule & {
  variantId: Identifier;
};

export type WeatherLocation = {
  id: Identifier;
  label: string;
  latitude: number;
  longitude: number;
};

export type WeatherObservation = {
  locationId: Identifier;
  observedAt: string;
  temperatureC: number | null;
  code: number | null;
  label: string;
  tone?: "sunny" | "cloudy" | "rain" | "storm" | "fog";
};

export type SiteSettings = {
  brand: {
    english: string;
    chinese: string;
    note?: string;
    instagram?: string;
  };
  timeZone: string;
  locale?: string;
  weatherLocation?: WeatherLocation;
  pastries?: readonly {
    name: string;
    english?: string;
    icon?: string;
  }[];
};

export type ReleaseManifest = {
  schemaVersion: 1;
  id: Identifier;
  version: string;
  releasedAt: string;
  assets: readonly SceneAsset[];
  characters?: readonly CharacterDefinition[];
  baseScenes: readonly BaseScene[];
  variants?: readonly SceneVariant[];
  weeklySchedule: WeeklySchedule;
  datedSchedules?: readonly DatedSchedule[];
  scheduleVariants?: readonly ScheduleVariant[];
  site: SiteSettings;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
};

export type ScheduleResolution = {
  date: string;
  state: ScheduleState;
  openTime?: string;
  closeTime?: string;
  sceneId?: Identifier;
  variantId?: Identifier;
  source: "weekly" | "dated" | "range";
  ruleId?: Identifier;
  priority: number;
  specificity: number;
  releasedAt?: string;
};

export type RuntimeWeather = {
  observation: WeatherObservation | null;
  lastKnown: WeatherObservation | null;
  stale: boolean;
};

export type RuntimeSnapshot = {
  serverNow: string;
  timeZone: string;
  schedule: ScheduleResolution;
  effectiveScene: BaseScene | null;
  effectiveVariant: SceneVariant | null;
  weather: RuntimeWeather;
  activeManifest: ReleaseManifest;
};
