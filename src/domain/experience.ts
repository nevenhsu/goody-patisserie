import {
  RUNTIME_EXPERIENCE_SCHEMA_VERSION,
  type RuntimeAction,
  type RuntimeAsset,
  type RuntimeAnimationClip,
  type RuntimeAssetKind,
  type RuntimeExperience,
  type RuntimeModalPayload,
  type RuntimeOrientation,
  type RuntimeOrientationLayout,
  type RuntimeProjectionProfile,
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

function validateAnimationClips(
  rawAnimations: unknown,
  path: string,
  loadType: unknown,
  frameCount: unknown,
  issues: ValidationIssue[],
): rawAnimations is readonly RuntimeAnimationClip[] {
  if (rawAnimations === undefined) return true;
  if (loadType !== "spritesheet") {
    add(issues, path, "animation-load-type", "animations are supported only for spritesheet assets");
    return false;
  }
  if (!Array.isArray(rawAnimations)) {
    add(issues, path, "animation-shape", "animations must be an array");
    return false;
  }
  const boundedFrameCount = typeof frameCount === "number" && Number.isInteger(frameCount) && frameCount > 0 && frameCount <= 4096
    ? frameCount
    : undefined;
  if (boundedFrameCount === undefined) {
    add(issues, path.replace(/\.animations$/, ".frameCount"), "animation-frame-count", "animated spritesheets require a positive integer frameCount");
  }
  const clipIds = new Set<string>();
  rawAnimations.forEach((rawClip, index) => {
    const clipPath = `${path}[${index}]`;
    if (!isRecord(rawClip)) {
      add(issues, clipPath, "animation-shape", "animation clip must be an object");
      return;
    }
    if (!nonEmpty(rawClip.id)) {
      add(issues, `${clipPath}.id`, "required", "animation clip id is required");
    } else if (clipIds.has(rawClip.id)) {
      add(issues, `${clipPath}.id`, "duplicate", `duplicate animation clip id: ${rawClip.id}`);
    } else {
      clipIds.add(rawClip.id);
    }
    if (
      !Array.isArray(rawClip.frames) ||
      rawClip.frames.length === 0 ||
      rawClip.frames.some((frame) =>
        typeof frame !== "number" ||
        !Number.isInteger(frame) ||
        frame < 0 ||
        boundedFrameCount !== undefined && frame >= boundedFrameCount
      )
    ) {
      add(issues, `${clipPath}.frames`, "animation-frames", "frames must be non-negative integers below frameCount");
    }
    if (typeof rawClip.frameRate !== "number" || !Number.isFinite(rawClip.frameRate) || rawClip.frameRate <= 0 || rawClip.frameRate > 60) {
      add(issues, `${clipPath}.frameRate`, "animation-frame-rate", "frameRate must be finite, positive, and at most 60");
    }
    if (rawClip.repeat !== undefined && (typeof rawClip.repeat !== "number" || !Number.isInteger(rawClip.repeat) || rawClip.repeat < -1)) {
      add(issues, `${clipPath}.repeat`, "animation-repeat", "repeat must be an integer greater than or equal to -1");
    }
    if (
      rawClip.repeatDelayMs !== undefined &&
      (typeof rawClip.repeatDelayMs !== "number" || !Number.isFinite(rawClip.repeatDelayMs) || rawClip.repeatDelayMs < 0 || rawClip.repeatDelayMs > 60000)
    ) {
      add(issues, `${clipPath}.repeatDelayMs`, "animation-repeat-delay", "repeatDelayMs must be finite from 0 to 60000");
    }
    if (rawClip.yoyo !== undefined && typeof rawClip.yoyo !== "boolean") {
      add(issues, `${clipPath}.yoyo`, "animation-yoyo", "yoyo must be a boolean");
    }
  });
  return true;
}

type ProjectionPoint = { x: number; y: number };

const MAX_PROJECTIONS_PER_LAYOUT = 8;
const MAX_PROJECT_PLACEMENTS_PER_LAYOUT = 32;
const MAX_PROJECTION_VERTICES_PER_LAYOUT = 8192;
const MAX_PROJECTION_TRIANGLES_PER_LAYOUT = 16384;

function projectionCross(a: ProjectionPoint, b: ProjectionPoint, c: ProjectionPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(a: ProjectionPoint, b: ProjectionPoint, p: ProjectionPoint): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  );
}

function segmentsIntersect(a: ProjectionPoint, b: ProjectionPoint, c: ProjectionPoint, d: ProjectionPoint): boolean {
  const abC = projectionCross(a, b, c);
  const abD = projectionCross(a, b, d);
  const cdA = projectionCross(c, d, a);
  const cdB = projectionCross(c, d, b);
  if (abC === 0 && pointOnSegment(a, b, c)) return true;
  if (abD === 0 && pointOnSegment(a, b, d)) return true;
  if (cdA === 0 && pointOnSegment(c, d, a)) return true;
  if (cdB === 0 && pointOnSegment(c, d, b)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function hasInvertibleHomography(corners: readonly ProjectionPoint[]): boolean {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const dx1 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
  const dy1 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
  const sx = topRight.x - bottomRight.x;
  const sy = topRight.y - bottomRight.y;
  const qx = bottomLeft.x - bottomRight.x;
  const qy = bottomLeft.y - bottomRight.y;
  const denominator = sx * qy - qx * sy;
  let g = 0;
  let h = 0;
  if (denominator !== 0) {
    g = (dx1 * qy - qx * dy1) / denominator;
    h = (sx * dy1 - dx1 * sy) / denominator;
  }
  const matrix = [
    topRight.x - topLeft.x + g * topRight.x,
    bottomLeft.x - topLeft.x + h * bottomLeft.x,
    topLeft.x,
    topRight.y - topLeft.y + g * topRight.y,
    bottomLeft.y - topLeft.y + h * bottomLeft.y,
    topLeft.y,
    g,
    h,
    1,
  ];
  if (!matrix.every(Number.isFinite)) return false;
  const determinant =
    matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7]) -
    matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6]) +
    matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6]);
  // Translation terms (c/f) must not make a valid world-space profile singular.
  const norm = Math.max(1, Math.hypot(matrix[0], matrix[1], matrix[3], matrix[4], matrix[6], matrix[7], matrix[8]));
  return norm > 0 && Math.abs(determinant) / norm ** 3 > 1e-8;
}

function validateProjectionSourceRect(value: unknown, path: string, issues: ValidationIssue[]): boolean {
  if (
    !isRecord(value) ||
    typeof value.x !== "number" ||
    !Number.isFinite(value.x) ||
    typeof value.y !== "number" ||
    !Number.isFinite(value.y) ||
    typeof value.width !== "number" ||
    !Number.isFinite(value.width) ||
    value.width <= 0 ||
    typeof value.height !== "number" ||
    !Number.isFinite(value.height) ||
    value.height <= 0
  ) {
    add(issues, path, "projection-source-rect", "sourceRect x and y must be finite and width and height must be positive finite numbers");
    return false;
  }
  return true;
}

function validateProjectionClipPolygon(value: unknown, path: string, issues: ValidationIssue[]): boolean {
  if (!Array.isArray(value) || value.length < 3 || value.length > 8) {
    add(issues, path, "projection-clip-polygon", "clipPolygon must contain 3 to 8 points");
    return false;
  }
  const points: ProjectionPoint[] = [];
  value.forEach((rawPoint, index) => {
    if (
      !isRecord(rawPoint) ||
      typeof rawPoint.x !== "number" || !Number.isFinite(rawPoint.x) ||
      typeof rawPoint.y !== "number" || !Number.isFinite(rawPoint.y)
    ) {
      add(issues, `${path}[${index}]`, "projection-clip-polygon", "clipPolygon points must be finite");
      return;
    }
    points.push({ x: rawPoint.x, y: rawPoint.y });
  });
  if (points.length !== value.length) return false;
  const signedTwiceArea = points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - point.y * next.x;
  }, 0);
  if (!(signedTwiceArea > 0)) {
    add(issues, path, "projection-clip-polygon", "clipPolygon must wind clockwise in screen space");
    return false;
  }
  if (points.some((point, index) => projectionCross(point, points[(index + 1) % points.length], points[(index + 2) % points.length]) <= 0)) {
    add(issues, path, "projection-clip-polygon", "clipPolygon must be strictly convex and non-crossing");
    return false;
  }
  return true;
}

function validateProjectionProfile(
  rawProjection: unknown,
  path: string,
  issues: ValidationIssue[],
): rawProjection is RuntimeProjectionProfile {
  if (!isRecord(rawProjection)) {
    add(issues, path, "projection-shape", "projection profile must be an object");
    return false;
  }
  let valid = true;
  if (!nonEmpty(rawProjection.id)) {
    add(issues, `${path}.id`, "projection-id", "projection id is required");
    valid = false;
  }
  if (rawProjection.kind !== "projective-quad") {
    add(issues, `${path}.kind`, "projection-kind", "projection kind must be projective-quad");
    valid = false;
  }

  const localSize = rawProjection.localSize;
  if (
    !isRecord(localSize) ||
    typeof localSize.width !== "number" ||
    !Number.isFinite(localSize.width) ||
    localSize.width <= 0 ||
    typeof localSize.height !== "number" ||
    !Number.isFinite(localSize.height) ||
    localSize.height <= 0
  ) {
    add(issues, `${path}.localSize`, "projection-local-size", "localSize width and height must be positive finite numbers");
    valid = false;
  }

  const corners = rawProjection.corners;
  const points: ProjectionPoint[] = [];
  if (!Array.isArray(corners) || corners.length !== 4) {
    add(issues, `${path}.corners`, "projection-corners", "corners must contain four points");
    valid = false;
  } else {
    corners.forEach((corner, index) => {
      if (!isRecord(corner) || typeof corner.x !== "number" || !Number.isFinite(corner.x) || typeof corner.y !== "number" || !Number.isFinite(corner.y)) {
        add(issues, `${path}.corners[${index}]`, "projection-corners", "corner x and y must be finite numbers");
        valid = false;
      } else {
        points.push({ x: corner.x, y: corner.y });
      }
    });
    if (points.length === 4) {
      const signedTwiceArea =
        projectionCross(points[0], points[1], points[2]) +
        projectionCross(points[0], points[2], points[3]);
      if (!(signedTwiceArea > 0)) {
        add(issues, `${path}.corners`, "projection-winding", "corners must wind clockwise in screen space");
        valid = false;
      }
      if (!(signedTwiceArea / 2 > 1)) {
        add(issues, `${path}.corners`, "projection-area", "projection quad area must exceed 1");
        valid = false;
      }
      if (segmentsIntersect(points[0], points[1], points[2], points[3]) || segmentsIntersect(points[1], points[2], points[3], points[0])) {
        add(issues, `${path}.corners`, "projection-self-intersection", "projection quad edges must not self-intersect");
        valid = false;
      }
      if ([0, 1, 2, 3].some((index) => projectionCross(points[index], points[(index + 1) % 4], points[(index + 2) % 4]) <= 0)) {
        add(issues, `${path}.corners`, "projection-convex", "projection quad must be strictly convex");
        valid = false;
      }
      if (!hasInvertibleHomography(points)) {
        add(issues, `${path}.corners`, "projection-homography", "projection homography must be invertible");
        valid = false;
      }
    }
  }

  const horizontalGuides = rawProjection.horizontalGuides;
  if (horizontalGuides !== undefined) {
    const localHeight = isRecord(localSize) && typeof localSize.height === "number" && Number.isFinite(localSize.height) && localSize.height > 0
      ? localSize.height
      : undefined;
    if (!Array.isArray(horizontalGuides)) {
      add(issues, `${path}.horizontalGuides`, "projection-guides", "horizontalGuides must be an array");
      valid = false;
    } else {
      let previousY = 0;
      const guideRows: Array<{ localY: number; left: ProjectionPoint; right: ProjectionPoint }> = [];
      horizontalGuides.forEach((rawGuide, index) => {
        const guidePath = `${path}.horizontalGuides[${index}]`;
        if (!isRecord(rawGuide)) {
          add(issues, guidePath, "projection-guides", "horizontal guide must be an object");
          valid = false;
          return;
        }
        const localY = rawGuide.localY;
        const left = rawGuide.left;
        const right = rawGuide.right;
        if (
          typeof localY !== "number" || !Number.isFinite(localY) || localHeight === undefined ||
          !(localY > 0 && localY < localHeight) || !(localY > previousY)
        ) {
          add(issues, `${guidePath}.localY`, "projection-guides", "guide localY must be finite, strictly increasing, and between local bounds");
          valid = false;
        }
        const validGuidePoint = (value: unknown): value is ProjectionPoint =>
          isRecord(value) && typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y);
        if (!validGuidePoint(left)) {
          add(issues, `${guidePath}.left`, "projection-guides", "guide left endpoint must be finite");
          valid = false;
        }
        if (!validGuidePoint(right)) {
          add(issues, `${guidePath}.right`, "projection-guides", "guide right endpoint must be finite");
          valid = false;
        }
        if (typeof localY === "number" && Number.isFinite(localY) && validGuidePoint(left) && validGuidePoint(right)) {
          guideRows.push({ localY, left, right });
          previousY = localY;
        }
      });
      if (points.length === 4 && localHeight !== undefined && guideRows.length === horizontalGuides.length) {
        const [topLeft, topRight, bottomRight, bottomLeft] = points;
        const rows = [
          { localY: 0, left: topLeft, right: topRight },
          ...guideRows,
          { localY: localHeight, left: bottomLeft, right: bottomRight },
        ];
        rows.slice(0, -1).forEach((top, index) => {
          const bottom = rows[index + 1];
          const band: ProjectionPoint[] = [top.left, top.right, bottom.right, bottom.left];
          const bandArea = projectionCross(band[0], band[1], band[2]) + projectionCross(band[0], band[2], band[3]);
          const bandPath = `${path}.horizontalGuides[${index}]`;
          if (!(bandArea / 2 > 1)) {
            add(issues, bandPath, "projection-guides", "each guided band area must exceed 1");
            valid = false;
          }
          if (
            segmentsIntersect(band[0], band[1], band[2], band[3]) ||
            segmentsIntersect(band[1], band[2], band[3], band[0]) ||
            [0, 1, 2, 3].some((cornerIndex) => projectionCross(band[cornerIndex], band[(cornerIndex + 1) % 4], band[(cornerIndex + 2) % 4]) <= 0) ||
            !hasInvertibleHomography(band)
          ) {
            add(issues, bandPath, "projection-guides", "each guided band must be strictly convex, non-crossing, and invertible");
            valid = false;
          }
        });
      }
    }
  }

  const subdivisions = rawProjection.subdivisions;
  const subdivisionX = isRecord(subdivisions) ? subdivisions.x : undefined;
  const subdivisionY = isRecord(subdivisions) ? subdivisions.y : undefined;
  if (
    !isRecord(subdivisions) ||
    typeof subdivisionX !== "number" ||
    !Number.isInteger(subdivisionX) ||
    subdivisionX < 1 ||
    subdivisionX > 8 ||
    typeof subdivisionY !== "number" ||
    !Number.isInteger(subdivisionY) ||
    subdivisionY < 1 ||
    subdivisionY > 24
  ) {
    add(issues, `${path}.subdivisions`, "projection-subdivisions", "subdivisions x must be an integer from 1 to 8 and y from 1 to 24");
    valid = false;
  }
  return valid;
}

function migrateRuntimeExperience(value: Record<string, unknown>): Record<string, unknown> {
  const migrated = clone(value);
  migrated.schemaVersion = RUNTIME_EXPERIENCE_SCHEMA_VERSION;
  const layouts = migrated.layouts;
  if (isRecord(layouts)) {
    for (const orientation of ["landscape", "portrait"] as const) {
      const layout = layouts[orientation];
      if (isRecord(layout)) layout.projections = [];
    }
  }
  return migrated;
}

export function validateRuntimeExperience(input: unknown): RuntimeExperienceValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      valid: false,
      issues: [{ path: "experience", code: "required", message: "runtime experience must be an object" }],
    };
  }

  const value = input.schemaVersion === 2 ? migrateRuntimeExperience(input) : input;

  if (value.schemaVersion !== RUNTIME_EXPERIENCE_SCHEMA_VERSION) {
    add(issues, "schemaVersion", "schema", "runtime experience schemaVersion must be 3");
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
      if (
        rawAsset.frameCount !== undefined &&
        (typeof rawAsset.frameCount !== "number" || !Number.isInteger(rawAsset.frameCount) || rawAsset.frameCount < 1 || rawAsset.frameCount > 4096)
      ) {
        add(issues, `${path}.frameCount`, "animation-frame-count", "frameCount must be an integer from 1 to 4096");
      }
    }
    if (rawAsset.loadType === "atlas") {
      if (!nonEmpty(rawAsset.atlasDataUri)) add(issues, `${path}.atlasDataUri`, "required", "atlas data URI is required");
      else if (value.mode === "demo" && !rawAsset.atlasDataUri.startsWith("/imagegen/")) {
        add(issues, `${path}.atlasDataUri`, "demo-uri", "demo atlas URI must live under /imagegen");
      }
    }
    validateAnimationClips(rawAsset.animations, `${path}.animations`, rawAsset.loadType, rawAsset.frameCount, issues);
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
        const animation = rawSpawn.animation;
        if (animation !== undefined) {
          const animationPath = `${path}.animation`;
          if (!isRecord(animation)) {
            add(issues, animationPath, "animation-shape", "spawn animation binding must be an object");
          } else {
            if (!nonEmpty(animation.defaultClip)) {
              add(issues, `${animationPath}.defaultClip`, "required", "defaultClip is required");
            }
            if (animation.autoplay !== undefined && typeof animation.autoplay !== "boolean") {
              add(issues, `${animationPath}.autoplay`, "animation-autoplay", "autoplay must be a boolean");
            }
            if (animation.flipWithMovement !== undefined && typeof animation.flipWithMovement !== "boolean") {
              add(issues, `${animationPath}.flipWithMovement`, "animation-flip", "flipWithMovement must be a boolean");
            }
            if (
              animation.movementThreshold !== undefined &&
              (typeof animation.movementThreshold !== "number" || !Number.isFinite(animation.movementThreshold) || animation.movementThreshold <= 0)
            ) {
              add(issues, `${animationPath}.movementThreshold`, "animation-threshold", "movementThreshold must be a positive finite number");
            }
            if (
              animation.stopDelayMs !== undefined &&
              (typeof animation.stopDelayMs !== "number" || !Number.isFinite(animation.stopDelayMs) || animation.stopDelayMs < 0 || animation.stopDelayMs > 60000)
            ) {
              add(issues, `${animationPath}.stopDelayMs`, "animation-stop-delay", "stopDelayMs must be finite from 0 to 60000");
            }
            const clips = asset?.animations;
            const clipIds = new Set(Array.isArray(clips) ? clips.map((clip) => clip?.id) : []);
            if (nonEmpty(animation.defaultClip) && !clipIds.has(animation.defaultClip)) {
              add(issues, `${animationPath}.defaultClip`, "reference", `unknown animation clip: ${animation.defaultClip}`);
            }
            if (animation.movingClip !== undefined) {
              if (!nonEmpty(animation.movingClip)) {
                add(issues, `${animationPath}.movingClip`, "required", "movingClip must be a non-empty string");
              } else if (!clipIds.has(animation.movingClip)) {
                add(issues, `${animationPath}.movingClip`, "reference", `unknown animation clip: ${animation.movingClip}`);
              }
            }
          }
        }
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
    const projections = Array.isArray(layout.projections) ? layout.projections : [];
    if (!Array.isArray(layout.projections)) {
      add(issues, `${path}.projections`, "required", "layout projections must be an array");
    }
    if (projections.length > MAX_PROJECTIONS_PER_LAYOUT) {
      add(issues, `${path}.projections`, "projection-cap", `layout may define at most ${MAX_PROJECTIONS_PER_LAYOUT} projection profiles`);
    }
    const projectionsById = new Map<string, RuntimeProjectionProfile>();
    projections.forEach((rawProjection, index) => {
      const projectionPath = `${path}.projections[${index}]`;
      const validProjection = validateProjectionProfile(rawProjection, projectionPath, issues);
      if (validProjection && nonEmpty(rawProjection.id)) {
        if (projectionsById.has(rawProjection.id)) {
          add(issues, `${projectionPath}.id`, "duplicate", `duplicate projection id: ${rawProjection.id}`);
        } else {
          projectionsById.set(rawProjection.id, rawProjection);
        }
      }
    });
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
      let projectPlacementCount = 0;
      let projectionVertices = 0;
      let projectionTriangles = 0;
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
          } else if (placement.assetId !== undefined) {
            const asset = nonEmpty(placement.assetId) ? assetsById.get(placement.assetId) : undefined;
            const spawn = spawnsById.get(placement.spawnId);
            if (!asset) add(issues, `${placementPath}.assetId`, "reference", `unknown asset: ${String(placement.assetId)}`);
            else if (spawn && asset.kind !== spawn.kind) add(issues, `${placementPath}.assetId`, "kind-mismatch", `asset must have kind ${spawn.kind}`);
          }
        } else {
          add(issues, `${placementPath}.type`, "type", "placement type must be asset or spawn");
        }
        if (placement.projection !== undefined) {
          const projectedAsset = placement.type === "asset"
            ? nonEmpty(placement.assetId) ? assetsById.get(placement.assetId) : undefined
            : placement.type === "spawn" && nonEmpty(placement.spawnId)
              ? assetsById.get(nonEmpty(placement.assetId) ? placement.assetId : spawnsById.get(placement.spawnId)?.assetId ?? "")
              : undefined;
          if (projectedAsset?.loadType === "spritesheet") {
            add(issues, `${placementPath}.projection`, "projection-spritesheet", "spritesheet placements cannot use projective projection");
          }
          if (placement.layer === "weather") {
            add(issues, `${placementPath}.projection`, "projection-weather", "weather placements cannot use projections");
          }
          const projection = placement.projection;
          if (!isRecord(projection)) {
            add(issues, `${placementPath}.projection`, "projection-shape", "placement projection must be an object");
          } else if (projection.mode !== "project" && projection.mode !== "clip" && projection.mode !== "underlay") {
            add(issues, `${placementPath}.projection.mode`, "projection-mode", "projection mode must be project, clip, or underlay");
          } else {
            const ref = projection.ref;
            const profile = nonEmpty(ref) ? projectionsById.get(ref) : undefined;
            if (!nonEmpty(ref)) {
              add(issues, `${placementPath}.projection.ref`, "projection-ref", "projection ref is required");
            } else if (!profile) {
              add(issues, `${placementPath}.projection.ref`, "projection-ref", `unknown projection profile: ${ref}`);
            }
            if (projection.mode === "project") {
              projectPlacementCount += 1;
              if (projectPlacementCount > MAX_PROJECT_PLACEMENTS_PER_LAYOUT) {
                add(issues, `${path}.placements`, "projection-project-cap", `layout may define at most ${MAX_PROJECT_PLACEMENTS_PER_LAYOUT} project placements`);
              }
              const localPosition = projection.localPosition;
              if (!isRecord(localPosition) || typeof localPosition.x !== "number" || !Number.isFinite(localPosition.x) || typeof localPosition.y !== "number" || !Number.isFinite(localPosition.y)) {
                add(issues, `${placementPath}.projection.localPosition`, "projection-local-position", "project localPosition x and y must be finite numbers");
              } else if (profile && (localPosition.x < 0 || localPosition.x > profile.localSize.width || localPosition.y < 0 || localPosition.y > profile.localSize.height)) {
                add(issues, `${placementPath}.projection.localPosition`, "projection-local-position", "project localPosition must be inside projection localSize");
              }
              if (
                projection.strength !== undefined &&
                (typeof projection.strength !== "number" || !Number.isFinite(projection.strength) || projection.strength < 0 || projection.strength > 1)
              ) {
                add(issues, `${placementPath}.projection.strength`, "projection-strength", "project strength must be finite from 0 to 1");
              }
            } else {
              validateProjectionSourceRect(projection.sourceRect, `${placementPath}.projection.sourceRect`, issues);
              if (projection.mode === "clip") {
                if (projection.clipPolygon !== undefined) {
                  validateProjectionClipPolygon(projection.clipPolygon, `${placementPath}.projection.clipPolygon`, issues);
                }
                if (
                  projection.uvInsetX !== undefined &&
                  (typeof projection.uvInsetX !== "number" || !Number.isFinite(projection.uvInsetX) || projection.uvInsetX < 0 || projection.uvInsetX >= 0.5)
                ) {
                  add(issues, `${placementPath}.projection.uvInsetX`, "projection-uv-inset", "clip uvInsetX must be finite from 0 up to but not including 0.5");
                }
              }
              if (projection.mode === "underlay" && (typeof projection.edgeY !== "number" || !Number.isFinite(projection.edgeY))) {
                add(issues, `${placementPath}.projection.edgeY`, "projection-edge-y", "underlay edgeY must be finite");
              }
            }
            if (profile) {
              const guidedBands = Array.isArray(profile.horizontalGuides) ? profile.horizontalGuides.length + 1 : 1;
              const rows = guidedBands * profile.subdivisions.y + 1;
              projectionVertices += (profile.subdivisions.x + 1) * rows;
              projectionTriangles += 2 * profile.subdivisions.x * (rows - 1);
            }
          }
        }
        if (projectionVertices > MAX_PROJECTION_VERTICES_PER_LAYOUT) {
          add(issues, `${path}.placements`, "projection-vertex-cap", `projected vertices may not exceed ${MAX_PROJECTION_VERTICES_PER_LAYOUT} per layout`);
        }
        if (projectionTriangles > MAX_PROJECTION_TRIANGLES_PER_LAYOUT) {
          add(issues, `${path}.placements`, "projection-triangle-cap", `projected triangles may not exceed ${MAX_PROJECTION_TRIANGLES_PER_LAYOUT} per layout`);
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
