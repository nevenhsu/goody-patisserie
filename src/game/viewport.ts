import type { RuntimeOrientation, RuntimeOrientationLayout } from "../content/runtime-experience";

/** Width/height tie belongs to landscape. Invalid dimensions fall back safely. */
export function selectViewportOrientation(width: number, height: number): RuntimeOrientation {
  return width >= height ? "landscape" : "portrait";
}

export function getCoverZoom(
  viewportWidth: number,
  viewportHeight: number,
  worldWidth: number,
  worldHeight: number,
): number {
  if (!(viewportWidth > 0) || !(viewportHeight > 0) || !(worldWidth > 0) || !(worldHeight > 0)) return 1;
  return Math.max(viewportWidth / worldWidth, viewportHeight / worldHeight);
}

export function getViewportCamera(
  viewportWidth: number,
  viewportHeight: number,
  layouts: Record<RuntimeOrientation, RuntimeOrientationLayout>,
) {
  const orientation = selectViewportOrientation(viewportWidth, viewportHeight);
  const layout = layouts[orientation];
  return {
    orientation,
    layout,
    zoom: getCoverZoom(viewportWidth, viewportHeight, layout.world.width, layout.world.height),
  };
}
