/**
 * Small, Phaser-independent helpers for putting a registered image frame on
 * a four-corner projective surface.  Coordinates are screen/world pixels and
 * the source quad is the canonical rectangle `(0, 0) .. localSize`.
 */

export type ProjectivePoint = { x: number; y: number };
export type ProjectiveSize = { width: number; height: number };
export type ProjectiveQuad = readonly [ProjectivePoint, ProjectivePoint, ProjectivePoint, ProjectivePoint];
export type ProjectiveHorizontalGuide = {
  localY: number;
  left: ProjectivePoint;
  right: ProjectivePoint;
};

/** Structural on purpose: the runtime/content schema can grow independently. */
export type ProjectiveProfileLike = {
  localSize: ProjectiveSize;
  corners: ProjectiveQuad;
  horizontalGuides?: readonly ProjectiveHorizontalGuide[];
  subdivisions?: { x: number; y: number };
};

export type ProjectiveHomography = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
  i: number;
};

export type ProjectiveValidationResult = {
  valid: boolean;
  reason?: string;
  winding?: number;
  determinant?: number;
  normalizedDeterminant?: number;
};

export type ProjectiveMeshGeometry = {
  /** Phaser 4.2 Mesh vertex format: x, y, u, v. */
  vertices: number[];
  /** Phaser 4.2 Mesh index format: a, b, c, texture-page. */
  indices: number[];
};

const EPSILON = 1e-10;
const NORMALIZED_DETERMINANT_EPSILON = 1e-8;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function finitePoint(point: ProjectivePoint | undefined): point is ProjectivePoint {
  if (!point) return false;
  return finite(point.x) && finite(point.y);
}

function finiteSize(size: ProjectiveSize | undefined): size is ProjectiveSize {
  if (!size) return false;
  return finite(size.width) && finite(size.height) && size.width > 0 && size.height > 0;
}

function asQuad(value: unknown): ProjectiveQuad | null {
  if (Array.isArray(value) && value.length === 4 && value.every((point) => finitePoint(point))) {
    return value as unknown as ProjectiveQuad;
  }
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    corners?: unknown;
    quad?: unknown;
    topLeft?: ProjectivePoint;
    topRight?: ProjectivePoint;
    bottomRight?: ProjectivePoint;
    bottomLeft?: ProjectivePoint;
  };
  for (const named of [candidate.corners, candidate.quad]) {
    const quad = asQuad(named);
    if (quad) return quad;
  }
  if (
    finitePoint(candidate.topLeft) &&
    finitePoint(candidate.topRight) &&
    finitePoint(candidate.bottomRight) &&
    finitePoint(candidate.bottomLeft)
  ) {
    return [candidate.topLeft, candidate.topRight, candidate.bottomRight, candidate.bottomLeft];
  }
  return null;
}

function asLocalSize(value: unknown): ProjectiveSize | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { localSize?: unknown; width?: unknown; height?: unknown };
  if (finiteSize(candidate.localSize as ProjectiveSize | undefined)) return candidate.localSize as ProjectiveSize;
  const width = Number(candidate.width);
  const height = Number(candidate.height);
  return finiteSize({ width, height }) ? { width, height } : null;
}

function asHorizontalGuides(value: unknown, localSize: ProjectiveSize): ProjectiveHorizontalGuide[] | null {
  if (!value || typeof value !== "object" || !("horizontalGuides" in value)) return [];
  const raw = (value as { horizontalGuides?: unknown }).horizontalGuides;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  let previousY = 0;
  const guides: ProjectiveHorizontalGuide[] = [];
  for (const guide of raw) {
    if (!guide || typeof guide !== "object") return null;
    const candidate = guide as { localY?: unknown; left?: unknown; right?: unknown };
    const localY = candidate.localY;
    if (typeof localY !== "number" || !finite(localY) || !(localY > 0 && localY < localSize.height) || !(localY > previousY)) return null;
    const left = candidate.left as ProjectivePoint | undefined;
    const right = candidate.right as ProjectivePoint | undefined;
    if (!finitePoint(left) || !finitePoint(right)) return null;
    guides.push({ localY, left, right });
    previousY = localY;
  }
  return guides;
}

type ProfileParts = { quad: ProjectiveQuad; localSize: ProjectiveSize; horizontalGuides: ProjectiveHorizontalGuide[] };

function profileParts(
  quadOrProfile: ProjectiveQuad | ProjectiveProfileLike | unknown,
  localSize?: ProjectiveSize,
): ProfileParts | null {
  const quad = asQuad(quadOrProfile);
  if (!quad) return null;
  const size = localSize ?? asLocalSize(quadOrProfile) ?? (Array.isArray(quadOrProfile) ? { width: 1, height: 1 } : null);
  if (!size) return null;
  const horizontalGuides = asHorizontalGuides(quadOrProfile, size);
  if (!horizontalGuides) return null;
  return { quad, localSize: size, horizontalGuides };
}

function matrixValues(matrix: ProjectiveHomography | readonly number[]): ProjectiveHomography | null {
  if (Array.isArray(matrix)) {
    if (matrix.length !== 9 || !matrix.every((value) => finite(value))) return null;
    return {
      a: matrix[0], b: matrix[1], c: matrix[2],
      d: matrix[3], e: matrix[4], f: matrix[5],
      g: matrix[6], h: matrix[7], i: matrix[8],
    };
  }
  if (!matrix || typeof matrix !== "object") return null;
  const values = matrix as Partial<ProjectiveHomography>;
  if (![values.a, values.b, values.c, values.d, values.e, values.f, values.g, values.h, values.i].every(
    (value) => typeof value === "number" && finite(value),
  )) return null;
  return values as ProjectiveHomography;
}

function determinant(matrix: ProjectiveHomography): number {
  return (
    matrix.a * (matrix.e * matrix.i - matrix.f * matrix.h) -
    matrix.b * (matrix.d * matrix.i - matrix.f * matrix.g) +
    matrix.c * (matrix.d * matrix.h - matrix.e * matrix.g)
  );
}

function hasStrictPositiveWinding(quad: ProjectiveQuad): boolean {
  const [a, b, c, d] = quad;
  const winding = ((a.x * b.y - a.y * b.x) + (b.x * c.y - b.y * c.x) +
    (c.x * d.y - c.y * d.x) + (d.x * a.y - d.y * a.x)) / 2;
  const cross = (p: ProjectivePoint, q: ProjectivePoint, r: ProjectivePoint) =>
    (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
  return finite(winding) && winding > EPSILON &&
    [cross(a, b, c), cross(b, c, d), cross(c, d, a), cross(d, a, b)].every(
      (turn) => finite(turn) && turn > EPSILON,
    );
}

/**
 * Compute the projective transform from a canonical unit square to TL/TR/BR/BL.
 * `localSize` is accepted so callers can pass a profile directly; it does not
 * alter this unit-square matrix (mapProjectivePoint performs that scaling).
 */
export function computeSquareToQuadHomography(
  quadOrProfile: ProjectiveQuad | ProjectiveProfileLike,
  localSize?: ProjectiveSize,
): ProjectiveHomography | null {
  const parts = profileParts(quadOrProfile, localSize);
  if (!parts) return null;
  const [topLeft, topRight, bottomRight, bottomLeft] = parts.quad;
  if (!hasStrictPositiveWinding(parts.quad)) return null;

  const dx1 = topRight.x - bottomRight.x;
  const dx2 = bottomLeft.x - bottomRight.x;
  const dx3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
  const dy1 = topRight.y - bottomRight.y;
  const dy2 = bottomLeft.y - bottomRight.y;
  const dy3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const affine = Math.abs(dx3) <= EPSILON && Math.abs(dy3) <= EPSILON;
  if (![dx1, dx2, dx3, dy1, dy2, dy3].every(finite) || (!affine && (!finite(denominator) || Math.abs(denominator) <= EPSILON))) {
    return null;
  }

  let g = 0;
  let h = 0;
  if (!affine) {
    g = (dx3 * dy2 - dx2 * dy3) / denominator;
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  }

  const matrix: ProjectiveHomography = {
    a: topRight.x - topLeft.x + g * topRight.x,
    b: bottomLeft.x - topLeft.x + h * bottomLeft.x,
    c: topLeft.x,
    d: topRight.y - topLeft.y + g * topRight.y,
    e: bottomLeft.y - topLeft.y + h * bottomLeft.y,
    f: topLeft.y,
    g,
    h,
    i: 1,
  };
  return Object.values(matrix).every(finite) ? matrix : null;
}

/** Invert an arbitrary 3x3 homogeneous matrix. */
export function invertHomography(matrix: ProjectiveHomography | readonly number[]): ProjectiveHomography | null {
  const values = matrixValues(matrix);
  if (!values) return null;
  const det = determinant(values);
  if (!finite(det) || Math.abs(det) <= EPSILON) return null;
  const inverse: ProjectiveHomography = {
    a: (values.e * values.i - values.f * values.h) / det,
    b: (values.c * values.h - values.b * values.i) / det,
    c: (values.b * values.f - values.c * values.e) / det,
    d: (values.f * values.g - values.d * values.i) / det,
    e: (values.a * values.i - values.c * values.g) / det,
    f: (values.c * values.d - values.a * values.f) / det,
    g: (values.d * values.h - values.e * values.g) / det,
    h: (values.b * values.g - values.a * values.h) / det,
    i: (values.a * values.e - values.b * values.d) / det,
  };
  return Object.values(inverse).every(finite) ? inverse : null;
}

/** Apply a homogeneous transform. Invalid/non-invertible coordinates return null. */
export function applyHomography(
  matrix: ProjectiveHomography | readonly number[],
  point: ProjectivePoint,
): ProjectivePoint | null {
  const values = matrixValues(matrix);
  if (!values || !finitePoint(point)) return null;
  const denominator = values.g * point.x + values.h * point.y + values.i;
  if (!finite(denominator) || Math.abs(denominator) <= EPSILON) return null;
  const x = (values.a * point.x + values.b * point.y + values.c) / denominator;
  const y = (values.d * point.x + values.e * point.y + values.f) / denominator;
  return finite(x) && finite(y) ? { x, y } : null;
}

function profileRows(parts: ProfileParts): Array<{ localY: number; left: ProjectivePoint; right: ProjectivePoint }> {
  const [topLeft, topRight, bottomRight, bottomLeft] = parts.quad;
  return [
    { localY: 0, left: topLeft, right: topRight },
    ...parts.horizontalGuides,
    { localY: parts.localSize.height, left: bottomLeft, right: bottomRight },
  ];
}

function mapProfileBand(parts: ProfileParts, localPoint: ProjectivePoint): ProjectivePoint | null {
  const rows = profileRows(parts);
  let bandIndex = 0;
  while (bandIndex < rows.length - 2 && localPoint.y > rows[bandIndex + 1].localY) bandIndex += 1;
  const top = rows[bandIndex];
  const bottom = rows[bandIndex + 1];
  const bandHeight = bottom.localY - top.localY;
  if (!(bandHeight > 0)) return null;
  const u = localPoint.x / parts.localSize.width;
  const v = (localPoint.y - top.localY) / bandHeight;
  const topPoint = {
    x: top.left.x + (top.right.x - top.left.x) * u,
    y: top.left.y + (top.right.y - top.left.y) * u,
  };
  const bottomPoint = {
    x: bottom.left.x + (bottom.right.x - bottom.left.x) * u,
    y: bottom.left.y + (bottom.right.y - bottom.left.y) * u,
  };
  return {
    x: topPoint.x + (bottomPoint.x - topPoint.x) * v,
    y: topPoint.y + (bottomPoint.y - topPoint.y) * v,
  };
}

function validateQuadGeometry(quad: ProjectiveQuad, localSize: ProjectiveSize): ProjectiveValidationResult {
  const [a, b, c, d] = quad;
  const winding = ((a.x * b.y - a.y * b.x) + (b.x * c.y - b.y * c.x) +
    (c.x * d.y - c.y * d.x) + (d.x * a.y - d.y * a.x)) / 2;
  if (!finite(winding) || winding <= EPSILON) {
    return { valid: false, reason: "quad winding must be positive", winding };
  }
  const cross = (p: ProjectivePoint, q: ProjectivePoint, r: ProjectivePoint) =>
    (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
  const turns = [cross(a, b, c), cross(b, c, d), cross(c, d, a), cross(d, a, b)];
  if (!turns.every((turn) => finite(turn) && turn > EPSILON)) {
    return { valid: false, reason: "quad must be strictly convex and non-crossing", winding };
  }

  const matrix = computeSquareToQuadHomography(quad, localSize);
  if (!matrix) return { valid: false, reason: "quad homography is non-invertible", winding };
  const det = determinant(matrix);
  const norm = Math.max(1, Math.hypot(matrix.a, matrix.b, matrix.d, matrix.e, matrix.g, matrix.h, matrix.i));
  const normalizedDeterminant = Math.abs(det) / (norm * norm * norm);
  if (!finite(normalizedDeterminant) || normalizedDeterminant <= NORMALIZED_DETERMINANT_EPSILON) {
    return { valid: false, reason: "quad homography determinant is too small", winding, determinant: det, normalizedDeterminant };
  }
  return { valid: true, winding, determinant: det, normalizedDeterminant };
}

/** Map a canonical local pixel through a profile's square-to-quad transform. */
export function mapProjectivePoint(
  profile: ProjectiveProfileLike,
  localPoint: ProjectivePoint,
): ProjectivePoint | null {
  const parts = profileParts(profile);
  if (!parts || !finitePoint(localPoint)) return null;
  if (parts.horizontalGuides.length > 0) return mapProfileBand(parts, localPoint);
  const matrix = computeSquareToQuadHomography(parts.quad, parts.localSize);
  if (!matrix) return null;
  return applyHomography(matrix, {
    x: localPoint.x / parts.localSize.width,
    y: localPoint.y / parts.localSize.height,
  });
}

/**
 * Validate winding, strict convexity/no-crossing, and homography invertibility.
 * The determinant normalization excludes translation terms, so large world
 * coordinates do not make a perfectly valid affine quad appear singular.
 */
export function validateProjectiveQuadGeometry(
  quadOrProfile: ProjectiveQuad | ProjectiveProfileLike,
  localSize?: ProjectiveSize,
): ProjectiveValidationResult {
  const parts = profileParts(quadOrProfile, localSize);
  if (!parts) return { valid: false, reason: "quad and localSize must be finite" };
  if (parts.horizontalGuides.length > 0) {
    const bandResults = profileRows(parts).slice(0, -1).map((top, index) => {
      const bottom = profileRows(parts)[index + 1];
      return validateQuadGeometry([
        top.left,
        top.right,
        bottom.right,
        bottom.left,
      ], { width: parts.localSize.width, height: bottom.localY - top.localY });
    });
    const invalid = bandResults.find((result) => !result.valid);
    if (invalid) return invalid;
    return bandResults[0] ?? { valid: false, reason: "guided profile needs at least one band" };
  }
  const [a, b, c, d] = parts.quad;
  const winding = ((a.x * b.y - a.y * b.x) + (b.x * c.y - b.y * c.x) +
    (c.x * d.y - c.y * d.x) + (d.x * a.y - d.y * a.x)) / 2;
  if (!finite(winding) || winding <= EPSILON) {
    return { valid: false, reason: "quad winding must be positive", winding };
  }
  const cross = (p: ProjectivePoint, q: ProjectivePoint, r: ProjectivePoint) =>
    (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
  const turns = [cross(a, b, c), cross(b, c, d), cross(c, d, a), cross(d, a, b)];
  if (!turns.every((turn) => finite(turn) && turn > EPSILON)) {
    return { valid: false, reason: "quad must be strictly convex and non-crossing", winding };
  }

  const matrix = computeSquareToQuadHomography(parts.quad, parts.localSize);
  if (!matrix) return { valid: false, reason: "quad homography is non-invertible", winding };
  const det = determinant(matrix);
  const norm = Math.max(1, Math.hypot(matrix.a, matrix.b, matrix.d, matrix.e, matrix.g, matrix.h, matrix.i));
  const normalizedDeterminant = Math.abs(det) / (norm * norm * norm);
  if (!finite(normalizedDeterminant) || normalizedDeterminant <= NORMALIZED_DETERMINANT_EPSILON) {
    return { valid: false, reason: "quad homography determinant is too small", winding, determinant: det, normalizedDeterminant };
  }
  return { valid: true, winding, determinant: det, normalizedDeterminant };
}

function readFrame(frame: unknown): ProjectiveSize | null {
  if (finiteSize(frame as ProjectiveSize)) return frame as ProjectiveSize;
  if (Array.isArray(frame) && frame.length === 2) {
    const size = { width: Number(frame[0]), height: Number(frame[1]) };
    return finiteSize(size) ? size : null;
  }
  return null;
}

export type BuildProjectiveMeshOptions = {
  profile: ProjectiveProfileLike;
  localPosition: ProjectivePoint;
  frame: ProjectiveSize;
  scale: number;
  strength?: number;
  flipX?: boolean;
};

function meshLocalRows(
  profile: ProfileParts,
  topY: number,
  bottomY: number,
  ySubdivisions: number,
): number[] {
  if (profile.horizontalGuides.length === 0) {
    return Array.from({ length: ySubdivisions + 1 }, (_, index) => topY + (bottomY - topY) * index / ySubdivisions);
  }
  const boundaries = [topY, ...profile.horizontalGuides
    .map((guide) => guide.localY)
    .filter((localY) => localY > topY && localY < bottomY), bottomY]
    .sort((a, b) => a - b);
  const rows: number[] = [];
  boundaries.slice(0, -1).forEach((start, index) => {
    const end = boundaries[index + 1];
    for (let step = 0; step < ySubdivisions; step += 1) {
      rows.push(start + (end - start) * step / ySubdivisions);
    }
  });
  rows.push(bottomY);
  return rows;
}

/** Return source-space rows for a full projected surface, including guides. */
export function getProjectiveSurfaceRows(profile: ProjectiveProfileLike): number[] | null {
  const parts = profileParts(profile);
  if (!parts || !validateProjectiveQuadGeometry(profile).valid) return null;
  const ySubdivisions = profile.subdivisions?.y ?? 1;
  return meshLocalRows(parts, 0, parts.localSize.height, ySubdivisions);
}

export type BuildClippedProjectiveSurfaceOptions = {
  profile: ProjectiveProfileLike;
  clipPolygon: readonly ProjectivePoint[];
  uvInsetX?: number;
};

function signedPolygonArea(points: readonly ProjectivePoint[]): number {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - point.y * next.x;
  }, 0) / 2;
}

function projectiveCross(a: ProjectivePoint, b: ProjectivePoint, c: ProjectivePoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function validClipPolygon(points: readonly ProjectivePoint[]): boolean {
  return points.length >= 3 && points.length <= 8 && points.every(finitePoint) &&
    signedPolygonArea(points) > EPSILON &&
    points.every((point, index) => projectiveCross(
      point,
      points[(index + 1) % points.length],
      points[(index + 2) % points.length],
    ) > EPSILON);
}

function clipAgainstEdge(
  subject: readonly ProjectivePoint[],
  edgeStart: ProjectivePoint,
  edgeEnd: ProjectivePoint,
): ProjectivePoint[] {
  const output: ProjectivePoint[] = [];
  if (subject.length === 0) return output;
  let previous = subject[subject.length - 1];
  let previousDistance = projectiveCross(edgeStart, edgeEnd, previous);
  for (const current of subject) {
    const currentDistance = projectiveCross(edgeStart, edgeEnd, current);
    const previousInside = previousDistance >= -EPSILON;
    const currentInside = currentDistance >= -EPSILON;
    if (previousInside !== currentInside) {
      const denominator = previousDistance - currentDistance;
      if (Math.abs(denominator) > EPSILON) {
        const t = previousDistance / denominator;
        output.push({
          x: previous.x + (current.x - previous.x) * t,
          y: previous.y + (current.y - previous.y) * t,
        });
      }
    }
    if (currentInside) output.push(current);
    previous = current;
    previousDistance = currentDistance;
  }
  return output;
}

/** Tessellate one homographic surface, clipped to a convex world-space polygon. */
export function buildClippedProjectiveSurfaceGeometry(
  options: BuildClippedProjectiveSurfaceOptions,
): ProjectiveMeshGeometry | null {
  const parts = profileParts(options.profile);
  const inset = options.uvInsetX ?? 0;
  if (
    !parts || parts.horizontalGuides.length > 0 || !validateProjectiveQuadGeometry(options.profile).valid ||
    !validClipPolygon(options.clipPolygon) || !finite(inset) || inset < 0 || inset >= 0.5
  ) return null;
  const xSubdivisions = options.profile.subdivisions?.x ?? 1;
  const ySubdivisions = options.profile.subdivisions?.y ?? 1;
  if (
    !Number.isInteger(xSubdivisions) || xSubdivisions < 1 || xSubdivisions > 8 ||
    !Number.isInteger(ySubdivisions) || ySubdivisions < 1 || ySubdivisions > 24
  ) return null;
  const matrix = computeSquareToQuadHomography(parts.quad, parts.localSize);
  const inverse = matrix && invertHomography(matrix);
  if (!matrix || !inverse) return null;
  const localClip = options.clipPolygon.map((point) => applyHomography(inverse, point));
  if (localClip.some((point) => !point)) return null;
  const localPoints = localClip as ProjectivePoint[];
  const minU = Math.min(...localPoints.map((point) => point.x));
  const maxU = Math.max(...localPoints.map((point) => point.x));
  const minV = Math.min(...localPoints.map((point) => point.y));
  const maxV = Math.max(...localPoints.map((point) => point.y));
  if (![minU, maxU, minV, maxV].every(finite) || !(maxU > minU) || !(maxV > minV)) return null;

  const grid: ProjectivePoint[][] = [];
  for (let row = 0; row <= ySubdivisions; row += 1) {
    const v = minV + (maxV - minV) * row / ySubdivisions;
    const gridRow: ProjectivePoint[] = [];
    for (let column = 0; column <= xSubdivisions; column += 1) {
      const u = minU + (maxU - minU) * column / xSubdivisions;
      const mapped = applyHomography(matrix, { x: u, y: v });
      if (!mapped) return null;
      gridRow.push(mapped);
    }
    grid.push(gridRow);
  }

  const vertices: number[] = [];
  const indices: number[] = [];
  const vertexIds = new Map<string, number>();
  const vertexIndex = (point: ProjectivePoint): number | null => {
    const baseUv = applyHomography(inverse, point);
    if (!baseUv) return null;
    const u = inset + (1 - 2 * inset) * baseUv.x;
    const v = baseUv.y;
    const tolerance = 1e-8;
    if (![point.x, point.y, u, v].every(finite) || u < -tolerance || u > 1 + tolerance || v < -tolerance || v > 1 + tolerance) return null;
    const boundedU = Math.min(1, Math.max(0, u));
    const boundedV = Math.min(1, Math.max(0, v));
    const key = `${point.x.toFixed(9)}:${point.y.toFixed(9)}:${boundedU.toFixed(9)}:${boundedV.toFixed(9)}`;
    const existing = vertexIds.get(key);
    if (existing !== undefined) return existing;
    const index = vertices.length / 4;
    vertices.push(point.x, point.y, boundedU, boundedV);
    vertexIds.set(key, index);
    return index;
  };
  const appendClippedTriangle = (triangle: readonly [ProjectivePoint, ProjectivePoint, ProjectivePoint]): boolean => {
    let clipped: ProjectivePoint[] = [...triangle];
    options.clipPolygon.forEach((edgeStart, index) => {
      clipped = clipAgainstEdge(clipped, edgeStart, options.clipPolygon[(index + 1) % options.clipPolygon.length]);
    });
    if (clipped.length < 3) return true;
    for (let index = 1; index < clipped.length - 1; index += 1) {
      const triangleArea = projectiveCross(clipped[0], clipped[index], clipped[index + 1]);
      if (!(triangleArea > EPSILON)) continue;
      const a = vertexIndex(clipped[0]);
      const b = vertexIndex(clipped[index]);
      const c = vertexIndex(clipped[index + 1]);
      if (a === null || b === null || c === null) return false;
      indices.push(a, b, c, 0);
    }
    return true;
  };

  for (let row = 0; row < ySubdivisions; row += 1) {
    for (let column = 0; column < xSubdivisions; column += 1) {
      const topLeft = grid[row][column];
      const topRight = grid[row][column + 1];
      const bottomLeft = grid[row + 1][column];
      const bottomRight = grid[row + 1][column + 1];
      if (
        !appendClippedTriangle([topLeft, topRight, bottomRight]) ||
        !appendClippedTriangle([topLeft, bottomRight, bottomLeft])
      ) return null;
    }
  }
  return indices.length > 0 ? { vertices, indices } : null;
}

function normalizeBuildOptions(
  value: BuildProjectiveMeshOptions | ProjectiveProfileLike,
  localPosition?: ProjectivePoint,
  frame?: ProjectiveSize,
  scale?: number,
  flipX?: boolean,
): BuildProjectiveMeshOptions | null {
  if (value && typeof value === "object" && "profile" in value) {
    const options = value as BuildProjectiveMeshOptions;
    return {
      profile: options.profile,
      localPosition: options.localPosition,
      frame: options.frame,
      scale: options.scale,
      strength: options.strength,
      flipX: options.flipX,
    };
  }
  if (!localPosition || !frame || scale === undefined) return null;
  return { profile: value as ProjectiveProfileLike, localPosition, frame, scale, flipX };
}

/** Build a deterministic regular tessellation of one full registered image frame. */
export function buildProjectiveMeshGeometry(
  options: BuildProjectiveMeshOptions,
): ProjectiveMeshGeometry | null;
export function buildProjectiveMeshGeometry(
  profile: ProjectiveProfileLike,
  localPosition: ProjectivePoint,
  frame: ProjectiveSize,
  scale: number,
  flipX?: boolean,
): ProjectiveMeshGeometry | null;
export function buildProjectiveMeshGeometry(
  value: BuildProjectiveMeshOptions | ProjectiveProfileLike,
  localPosition?: ProjectivePoint,
  frame?: ProjectiveSize,
  scale?: number,
  flipX = false,
): ProjectiveMeshGeometry | null {
  const options = normalizeBuildOptions(value, localPosition, frame, scale, flipX);
  if (!options) return null;
  const geometry = options.profile;
  const validation = validateProjectiveQuadGeometry(geometry);
  const strength = options.strength ?? 1;
  if (
    !validation.valid || !finitePoint(options.localPosition) || !finite(options.scale) || options.scale <= 0 ||
    !finite(strength) || strength < 0 || strength > 1
  ) return null;
  const frameSize = readFrame(options.frame);
  if (!frameSize) return null;
  const xSubdivisions = geometry.subdivisions?.x ?? 1;
  const ySubdivisions = geometry.subdivisions?.y ?? 1;
  if (!Number.isInteger(xSubdivisions) || !Number.isInteger(ySubdivisions) || xSubdivisions < 1 || xSubdivisions > 8 || ySubdivisions < 1 || ySubdivisions > 24) {
    return null;
  }

  const parts = profileParts(geometry);
  if (!parts) return null;
  const projectedCenter = mapProjectivePoint(geometry, options.localPosition);
  if (!projectedCenter) return null;
  let billboardScaleX = 0;
  let billboardScaleY = 0;
  if (strength < 1) {
    const deltaX = Math.max(1e-4, parts.localSize.width * 1e-4);
    const deltaY = Math.max(1e-4, parts.localSize.height * 1e-4);
    const xBefore = mapProjectivePoint(geometry, { x: options.localPosition.x - deltaX, y: options.localPosition.y });
    const xAfter = mapProjectivePoint(geometry, { x: options.localPosition.x + deltaX, y: options.localPosition.y });
    const yBefore = mapProjectivePoint(geometry, { x: options.localPosition.x, y: options.localPosition.y - deltaY });
    const yAfter = mapProjectivePoint(geometry, { x: options.localPosition.x, y: options.localPosition.y + deltaY });
    if (!xBefore || !xAfter || !yBefore || !yAfter) return null;
    billboardScaleX = Math.hypot(xAfter.x - xBefore.x, xAfter.y - xBefore.y) / (2 * deltaX);
    billboardScaleY = Math.hypot(yAfter.x - yBefore.x, yAfter.y - yBefore.y) / (2 * deltaY);
    if (!finite(billboardScaleX) || !finite(billboardScaleY)) return null;
  }
  const vertices: number[] = [];
  const topY = options.localPosition.y - 0.5 * frameSize.height * options.scale;
  const bottomY = options.localPosition.y + 0.5 * frameSize.height * options.scale;
  const localRows = meshLocalRows(parts, topY, bottomY, ySubdivisions);
  for (const localY of localRows) {
    const v = (localY - topY) / (bottomY - topY);
    for (let column = 0; column <= xSubdivisions; column += 1) {
      const u = column / xSubdivisions;
      const localX = options.localPosition.x + (u - 0.5) * frameSize.width * options.scale;
      // localPosition is the source-space point under the image centre. The
      // complete registered frame (including transparent padding) is projected.
      const projected = mapProjectivePoint(geometry, { x: localX, y: localY });
      if (!projected) return null;
      const mapped = strength === 1 ? projected : {
        x: projectedCenter.x + (localX - options.localPosition.x) * billboardScaleX,
        y: projectedCenter.y + (localY - options.localPosition.y) * billboardScaleY,
      };
      vertices.push(
        mapped.x + (projected.x - mapped.x) * strength,
        mapped.y + (projected.y - mapped.y) * strength,
        options.flipX ? 1 - u : u,
        v,
      );
    }
  }

  const indices: number[] = [];
  const rowWidth = xSubdivisions + 1;
  for (let row = 0; row < localRows.length - 1; row += 1) {
    for (let column = 0; column < xSubdivisions; column += 1) {
      const topLeft = row * rowWidth + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + rowWidth;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, topRight, bottomRight, 0, topLeft, bottomRight, bottomLeft, 0);
    }
  }
  return { vertices, indices };
}

export function getProjectiveClipPolygon(
  quadOrProfile: ProjectiveQuad | ProjectiveProfileLike,
): ProjectivePoint[] | null {
  const quad = asQuad(quadOrProfile);
  if (!quad || !validateProjectiveQuadGeometry(quad, asLocalSize(quadOrProfile) ?? { width: 1, height: 1 }).valid) return null;
  return quad.map((point) => ({ x: point.x, y: point.y }));
}

/**
 * Return the wedge bounded by the profile's bottom edge and a horizontal edgeY.
 * The path is ordered BL, BR, right(edgeY), left(edgeY).
 */
export function getProjectiveUnderlayPolygon(
  quadOrProfile: ProjectiveQuad | ProjectiveProfileLike,
  edgeY: number,
): ProjectivePoint[] | null {
  const quad = asQuad(quadOrProfile);
  if (!quad || !finite(edgeY)) return null;
  const validation = validateProjectiveQuadGeometry(quad, asLocalSize(quadOrProfile) ?? { width: 1, height: 1 });
  if (!validation.valid) return null;
  const [topLeft, topRight, bottomRight, bottomLeft] = quad;
  const sideIntersection = (top: ProjectivePoint, bottom: ProjectivePoint): ProjectivePoint | null => {
    const dy = bottom.y - top.y;
    if (Math.abs(dy) <= EPSILON) {
      return Math.abs(edgeY - bottom.y) <= EPSILON ? { x: bottom.x, y: edgeY } : null;
    }
    const t = (edgeY - top.y) / dy;
    const x = top.x + (bottom.x - top.x) * t;
    return finite(x) ? { x, y: edgeY } : null;
  };
  const leftAtEdge = sideIntersection(topLeft, bottomLeft);
  const rightAtEdge = sideIntersection(topRight, bottomRight);
  if (!leftAtEdge || !rightAtEdge) return null;
  return [
    { x: bottomLeft.x, y: bottomLeft.y },
    { x: bottomRight.x, y: bottomRight.y },
    rightAtEdge,
    leftAtEdge,
  ];
}

// Focused aliases keep callers readable and tolerate the naming used by older
// scene experiments without introducing a dependency on Phaser or a schema.
export const invertSquareToQuadHomography = invertHomography;
export const invertProjectiveHomography = invertHomography;
export const computeQuadToSquareHomography = (
  quadOrProfile: ProjectiveQuad | ProjectiveProfileLike,
  localSize?: ProjectiveSize,
) => {
  const matrix = computeSquareToQuadHomography(quadOrProfile, localSize);
  return matrix ? invertHomography(matrix) : null;
};

/** Apply a precomputed matrix; the 3-argument form is a convenience for a
 * canonical local pixel and mirrors mapProjectivePoint's source scaling. */
export function applySquareToQuadHomography(
  matrix: ProjectiveHomography | readonly number[],
  point: ProjectivePoint,
): ProjectivePoint | null;
export function applySquareToQuadHomography(
  quad: ProjectiveQuad | ProjectiveProfileLike,
  localSize: ProjectiveSize,
  localPoint: ProjectivePoint,
): ProjectivePoint | null;
export function applySquareToQuadHomography(
  matrixOrQuad: (ProjectiveHomography | readonly number[]) | ProjectiveQuad | ProjectiveProfileLike,
  pointOrSize: ProjectivePoint | ProjectiveSize,
  localPoint?: ProjectivePoint,
): ProjectivePoint | null {
  if (localPoint) {
    const parts = profileParts(matrixOrQuad, pointOrSize as ProjectiveSize);
    const matrix = parts && computeSquareToQuadHomography(parts.quad, parts.localSize);
    return matrix ? applyHomography(matrix, {
      x: localPoint.x / parts.localSize.width,
      y: localPoint.y / parts.localSize.height,
    }) : null;
  }
  return applyHomography(matrixOrQuad as ProjectiveHomography | readonly number[], pointOrSize as ProjectivePoint);
}

export const applyProjectiveHomography = applyHomography;
export const mapSquareToQuad = (profile: ProjectiveProfileLike, localPoint: ProjectivePoint) =>
  mapProjectivePoint(profile, localPoint);
export const deriveProjectiveClipPolygon = getProjectiveClipPolygon;
export const getProjectiveQuadClipPolygon = getProjectiveClipPolygon;
export const deriveProjectiveUnderlayPolygon = getProjectiveUnderlayPolygon;
export const isValidProjectiveQuadGeometry = (value: ProjectiveQuad | ProjectiveProfileLike, localSize?: ProjectiveSize) =>
  validateProjectiveQuadGeometry(value, localSize).valid;
