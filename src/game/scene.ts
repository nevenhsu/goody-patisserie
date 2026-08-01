import type {
  RuntimeAction,
  RuntimeExperience,
  RuntimeInteraction,
  RuntimeOrientation,
  RuntimeOrientationLayout,
  RuntimePlacement,
  RuntimeSpawn,
  RuntimeSpawnAnimationBinding,
  TweenRuntimeAction,
} from "../content/runtime-experience";
import type { GameBridge, GameInteractionDetail, MoveDirection } from "./bridge";
import {
  buildClippedProjectiveSurfaceGeometry,
  buildProjectiveMeshGeometry,
  getProjectiveUnderlayPolygon,
  getProjectiveSurfaceRows,
  mapProjectivePoint,
  type ProjectivePoint,
  type ProjectiveProfileLike,
} from "./projective-surface";
import { getViewportCamera } from "./viewport";

/* Phaser stays client-only; this interpreter intentionally uses its runtime shape. */
/* eslint-disable @typescript-eslint/no-explicit-any */

type SceneContext = {
  add: any;
  anims: any;
  cameras: any;
  events: any;
  input: any;
  load: any;
  scale: any;
  textures: any;
  tweens: any;
};

type SceneOptions = { reducedMotion?: boolean };
type DisplayRecord = { object: any; base: { x: number; y: number; scale: number; alpha: number; rotation: number } };
type RuntimeAnimationRegistration = { users: number; owned: boolean };
const runtimeAnimationRegistrations = new WeakMap<object, Map<string, RuntimeAnimationRegistration>>();

export function getRuntimeAssetKey(id: string) {
  return `goody-runtime-${id}`;
}

export function getRuntimeAnimationKey(assetId: string, clipId: string) {
  return `${getRuntimeAssetKey(assetId)}-${clipId}`;
}

export function getRenderableAssetIds(experience: RuntimeExperience, orientation?: RuntimeOrientation) {
  if (!orientation) return new Set(experience.assets.map((asset) => asset.id));

  const spawns = new Map(allSpawns(experience).map((spawn) => [spawn.id, spawn]));
  const layout = experience.layouts[orientation];
  const ids = new Set<string>();
  layout.placements.forEach((placement) => {
    const assetId = placementAssetId(placement, spawns);
    if (assetId) ids.add(assetId);
  });
  const playerAssetId = spawns.get(layout.player.spawnId)?.assetId;
  if (playerAssetId) ids.add(playerAssetId);
  if (layout.fallbackBackgroundAssetId) ids.add(layout.fallbackBackgroundAssetId);
  const weather = getWeatherParticleAction(experience);
  if (weather) ids.add(weather.assetId);
  return ids;
}

export function shouldRenderPlacementImage(placement: RuntimePlacement) {
  return placement.layer !== "weather";
}

export function getWeatherParticleAction(experience: RuntimeExperience) {
  const presentation = experience.weather.presentations.find(
    (candidate) => candidate.tone === experience.weather.defaultTone,
  );
  if (!presentation?.particleActionId) return undefined;
  const action = experience.actions.find((candidate) => candidate.id === presentation.particleActionId);
  return action?.type === "particle-loop" ? action : undefined;
}

export function getInteractionDetailForTarget(
  experience: RuntimeExperience,
  targetId: string,
  triggerType: "click" | "keyboard" = "click",
): GameInteractionDetail | undefined {
  const interaction = experience.interactions.find((candidate) =>
    candidate.triggers.some((trigger) => trigger.type === triggerType && trigger.targetId === targetId),
  );
  return interaction ? interactionDetail(interaction, targetId) : undefined;
}

export function resolveTweenRange(
  action: TweenRuntimeAction,
  base: DisplayRecord["base"],
  world: RuntimeOrientationLayout["world"],
  reducedMotion = false,
) {
  const soften = (value: number) => reducedMotion ? action.from + (value - action.from) * 0.35 : value;
  const from = action.from;
  const to = soften(action.to);
  if (action.property === "x") return { properties: ["x"], from: base.x + from * world.width, to: base.x + to * world.width };
  if (action.property === "y") return { properties: ["y"], from: base.y + from * world.height, to: base.y + to * world.height };
  if (action.property === "scale") return { properties: ["scaleX", "scaleY"], from: base.scale * from, to: base.scale * to };
  return { properties: [action.property], from, to };
}

function interactionDetail(interaction: RuntimeInteraction, targetId?: string): GameInteractionDetail {
  return { interactionId: interaction.id, targetId, action: interaction.action };
}

function allSpawns(experience: RuntimeExperience): RuntimeSpawn[] {
  return [...experience.spawns.characters, ...experience.spawns.animals, ...experience.spawns.items];
}

export function placementAssetId(placement: RuntimePlacement, spawns: Map<string, RuntimeSpawn>) {
  return placement.type === "asset" ? placement.assetId : placement.assetId ?? spawns.get(placement.spawnId)?.assetId;
}

function normalizedDistance(a: { x: number; y: number }, b: { x: number; y: number }, layout: RuntimeOrientationLayout) {
  return Math.hypot((a.x - b.x) / layout.world.width, (a.y - b.y) / layout.world.height);
}

export function getInteractionApproachDistance(
  player: { x: number; y: number },
  target: { x: number; y: number },
  layout: RuntimeOrientationLayout,
) {
  const bounds = layout.player.movementBounds;
  const approachableTarget = {
    x: Math.max(bounds.minX * layout.world.width, Math.min(bounds.maxX * layout.world.width, target.x)),
    y: Math.max(bounds.minY * layout.world.height, Math.min(bounds.maxY * layout.world.height, target.y)),
  };
  return normalizedDistance(player, approachableTarget, layout);
}

export function createRuntimeExperienceScene(
  bridge: GameBridge,
  experience: RuntimeExperience,
  options: SceneOptions = {},
) {
  const movement: Record<MoveDirection, boolean> = { up: false, down: false, left: false, right: false };
  const spawns = new Map(allSpawns(experience).map((spawn) => [spawn.id, spawn]));
  const assets = new Map(experience.assets.map((asset) => [asset.id, asset]));
  const loadedAssetIds = new Set<string>();
  const queuedAssetIds = new Set<string>();
  const clickTargets = new Set(
    experience.interactions.flatMap((interaction) =>
      interaction.triggers.filter((trigger) => trigger.type === "click").map((trigger) => trigger.targetId),
    ),
  );
  const objects = new Set<any>();
  const animatedObjects = new Map<any, boolean>();
  const registeredAnimationKeys = new Set<string>();
  const activeTweens = new Set<any>();
  const particleEmitters = new Set<any>();
  const targetObjects = new Map<string, DisplayRecord[]>();
  const interactiveObjects = new Map<string, any[]>();
  const bridgeStops: Array<() => void> = [];
  let scene: SceneContext | null = null;
  let layout = experience.layouts.landscape;
  let player = { x: 0, y: 0 };
  let playerObject: any = null;
  let playerAnimation: RuntimeSpawnAnimationBinding | undefined;
  let playerCurrentClip: string | undefined;
  let playerLastMovementAt: number | null = null;
  let inputEnabled = bridge.isInputEnabled();
  let scaleListener: ((gameSize: { width: number; height: number }) => void) | null = null;
  let keyListener: ((event: KeyboardEvent) => void) | null = null;
  let layoutLoadToken = 0;

  const queueAsset = (loader: SceneContext["load"], assetId: string) => {
    const asset = assets.get(assetId);
    if (!asset) return;
    const key = getRuntimeAssetKey(asset.id);
    if (asset.loadType === "spritesheet" && asset.frame) {
      loader.spritesheet(key, asset.uri, { frameWidth: asset.frame.width, frameHeight: asset.frame.height });
    } else if (asset.loadType === "atlas" && asset.atlasDataUri) {
      loader.atlas(key, asset.uri, asset.atlasDataUri);
    } else {
      loader.image(key, asset.uri);
    }
    queuedAssetIds.add(assetId);
  };

  const clearMovement = () => {
    (Object.keys(movement) as MoveDirection[]).forEach((direction) => { movement[direction] = false; });
  };

  const pauseAnimations = () => {
    animatedObjects.forEach((autoplay, object) => {
      if (autoplay) object.anims?.pause?.();
    });
    activeTweens.forEach((tween) => tween.pause?.());
    particleEmitters.forEach((emitter) => emitter.pause?.());
  };

  const resumeAnimations = () => {
    animatedObjects.forEach((autoplay, object) => {
      if (autoplay) object.anims?.resume?.();
    });
    activeTweens.forEach((tween) => tween.resume?.());
    particleEmitters.forEach((emitter) => emitter.resume?.());
  };

  const setInputEnabled = (enabled: boolean) => {
    inputEnabled = enabled;
    clearMovement();
    const keyboard = scene?.input.keyboard;
    if (keyboard) {
      keyboard.enabled = enabled;
      keyboard.resetKeys?.();
    }
    if (enabled) resumeAnimations();
    else pauseAnimations();
  };

  const emitInteraction = (detail?: GameInteractionDetail) => {
    if (!inputEnabled || !detail) return;
    bridge.emit("goody:input", { enabled: false });
    bridge.emit("goody:interaction", detail);
  };

  const destroyLayout = () => {
    activeTweens.forEach((tween) => {
      tween.stop?.();
      tween.remove?.();
      tween.destroy?.();
    });
    activeTweens.clear();
    particleEmitters.clear();
    objects.forEach((object) => object.destroy?.());
    objects.clear();
    animatedObjects.clear();
    targetObjects.clear();
    interactiveObjects.clear();
    playerObject = null;
    playerAnimation = undefined;
    playerCurrentClip = undefined;
    playerLastMovementAt = null;
  };

  const trackObject = (object: any) => {
    objects.add(object);
    return object;
  };

  const addTargetObject = (targetId: string, object: any, scale: number) => {
    const record: DisplayRecord = {
      object,
      base: { x: object.x, y: object.y, scale, alpha: object.alpha ?? 1, rotation: object.rotation ?? 0 },
    };
    const records = targetObjects.get(targetId) ?? [];
    records.push(record);
    targetObjects.set(targetId, records);
  };

  const registerAnimations = () => {
    const currentScene = scene;
    if (!currentScene?.anims) return;
    experience.assets.forEach((asset) => {
      if (!loadedAssetIds.has(asset.id) || asset.loadType !== "spritesheet" || !asset.animations) return;
      asset.animations.forEach((clip) => {
        const key = getRuntimeAnimationKey(asset.id, clip.id);
        if (registeredAnimationKeys.has(key)) return;
        const created = !currentScene.anims.exists?.(key);
        if (created) {
          currentScene.anims.create?.({
            key,
            frames: currentScene.anims.generateFrameNumbers(getRuntimeAssetKey(asset.id), { frames: [...clip.frames] }),
            frameRate: clip.frameRate,
            repeat: clip.repeat ?? 0,
            repeatDelay: clip.repeatDelayMs ?? 0,
            yoyo: clip.yoyo ?? false,
          });
        }
        registeredAnimationKeys.add(key);
        const registrations = runtimeAnimationRegistrations.get(currentScene.anims)
          ?? new Map<string, RuntimeAnimationRegistration>();
        const registration = registrations.get(key) ?? { users: 0, owned: created };
        registration.users += 1;
        registration.owned ||= created;
        registrations.set(key, registration);
        runtimeAnimationRegistrations.set(currentScene.anims, registrations);
      });
    });
  };

  const addImage = (assetId: string, placement: RuntimePlacement, animation?: RuntimeSpawnAnimationBinding) => {
    if (!scene) return null;
    const asset = assets.get(assetId);
    const object = trackObject(asset?.loadType === "spritesheet"
      ? scene.add.sprite(
        placement.position.x * layout.world.width,
        placement.position.y * layout.world.height,
        getRuntimeAssetKey(assetId),
        0,
      )
      : scene.add.image(
        placement.position.x * layout.world.width,
        placement.position.y * layout.world.height,
        getRuntimeAssetKey(assetId),
      ));
    object.setOrigin(0.5).setScale(placement.scale).setDepth(placement.depth);
    object.setFlipX?.(Boolean(placement.flipX));
    if (animation && asset?.loadType === "spritesheet") {
      const clip = asset.animations?.find((candidate) => candidate.id === animation.defaultClip);
      const key = clip ? getRuntimeAnimationKey(assetId, clip.id) : undefined;
      const autoplay = animation.autoplay !== false;
      animatedObjects.set(object, autoplay);
      if (autoplay && key) object.anims?.play?.(key);
    }
    return object;
  };

  const addMesh = (assetId: string, vertices: number[], indices: number[], depth: number) => {
    if (!scene || typeof scene.add.mesh2d !== "function") return null;
    try {
      const object = trackObject(scene.add.mesh2d(0, 0, getRuntimeAssetKey(assetId), vertices, indices, true));
      object.setDepth(depth);
      object.buildOrderedIndices?.(0, true);
      return object;
    } catch {
      return null;
    }
  };

  const getTextureSize = (assetId: string) => {
    if (!scene) return null;
    const frame = scene.textures?.getFrame?.(getRuntimeAssetKey(assetId));
    const width = frame?.realWidth ?? frame?.width;
    const height = frame?.realHeight ?? frame?.height;
    return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
      ? { width, height }
      : null;
  };

  const buildSurfaceGeometry = (
    profile: ProjectiveProfileLike,
    textureSize: { width: number; height: number },
    sourceRect: { x: number; y: number; width: number; height: number },
    corners?: readonly [ProjectivePoint, ProjectivePoint, ProjectivePoint, ProjectivePoint],
  ) => {
    const surface = corners ? { ...profile, corners, horizontalGuides: undefined } : profile;
    const xSubdivisions = profile.subdivisions?.x ?? 1;
    const localRows = getProjectiveSurfaceRows(surface);
    if (!localRows) return null;
    const vertices: number[] = [];
    for (const localY of localRows) {
      const v = localY / surface.localSize.height;
      for (let column = 0; column <= xSubdivisions; column += 1) {
        const u = column / xSubdivisions;
        const mapped = mapProjectivePoint(surface, {
          x: u * surface.localSize.width,
          y: localY,
        });
        if (!mapped) return null;
        vertices.push(
          mapped.x,
          mapped.y,
          (sourceRect.x + u * sourceRect.width) / textureSize.width,
          (sourceRect.y + v * sourceRect.height) / textureSize.height,
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
  };

  const animationForPlacement = (placement: RuntimePlacement) =>
    placement.type === "spawn" ? spawns.get(placement.spawnId)?.animation : undefined;

  const addProjectedImage = (assetId: string, placement: RuntimePlacement) => {
    const animation = animationForPlacement(placement);
    if (assets.get(assetId)?.loadType === "spritesheet") return addImage(assetId, placement, animation);
    if (!placement.projection) return addImage(assetId, placement, animation);
    const profile = layout.projections.find((candidate) => candidate.id === placement.projection?.ref);
    const textureSize = getTextureSize(assetId);
    if (!profile || !textureSize) return addImage(assetId, placement, animation);

    if (placement.projection.mode === "project") {
      const geometry = buildProjectiveMeshGeometry({
        profile,
        localPosition: placement.projection.localPosition,
        frame: textureSize,
        scale: placement.scale,
        strength: placement.projection.strength,
        flipX: placement.flipX,
      });
      return geometry
        ? addMesh(assetId, geometry.vertices, geometry.indices, placement.depth) ?? addImage(assetId, placement, animation)
        : addImage(assetId, placement, animation);
    }

    if (placement.projection.mode === "clip" && placement.projection.clipPolygon) {
      const geometry = buildClippedProjectiveSurfaceGeometry({
        profile,
        clipPolygon: placement.projection.clipPolygon,
        uvInsetX: placement.projection.uvInsetX,
      });
      if (!geometry) return addImage(assetId, placement, animation);
      const vertices = [...geometry.vertices];
      for (let index = 0; index < vertices.length; index += 4) {
        vertices[index + 2] = (
          placement.projection.sourceRect.x + vertices[index + 2] * placement.projection.sourceRect.width
        ) / textureSize.width;
        vertices[index + 3] = (
          placement.projection.sourceRect.y + vertices[index + 3] * placement.projection.sourceRect.height
        ) / textureSize.height;
      }
      return addMesh(assetId, vertices, geometry.indices, placement.depth) ?? addImage(assetId, placement, animation);
    }

    let corners: readonly [ProjectivePoint, ProjectivePoint, ProjectivePoint, ProjectivePoint] | undefined;
    if (placement.projection.mode === "underlay") {
      const polygon = getProjectiveUnderlayPolygon(profile, placement.projection.edgeY);
      if (!polygon || polygon.length !== 4) return addImage(assetId, placement, animation);
      corners = polygon as unknown as readonly [ProjectivePoint, ProjectivePoint, ProjectivePoint, ProjectivePoint];
    }
    const geometry = buildSurfaceGeometry(profile, textureSize, placement.projection.sourceRect, corners);
    return geometry
      ? addMesh(assetId, geometry.vertices, geometry.indices, placement.depth) ?? addImage(assetId, placement, animation)
      : addImage(assetId, placement, animation);
  };

  const playPlayerClip = (clipId: string, restart = false) => {
    if (!playerObject || !playerAnimation || playerCurrentClip === clipId && !restart) return;
    const playerSpawn = spawns.get(layout.player.spawnId);
    if (!playerSpawn) return;
    const key = getRuntimeAnimationKey(playerSpawn.assetId, clipId);
    playerObject.anims?.play?.(key, restart);
    animatedObjects.set(playerObject, true);
    playerCurrentClip = clipId;
  };

  const startTween = (action: TweenRuntimeAction) => {
    if (!scene) return;
    const records = targetObjects.get(action.targetId) ?? [];
    records.forEach((record) => {
      const range = resolveTweenRange(action, record.base, layout.world, Boolean(options.reducedMotion));
      range.properties.forEach((property) => { record.object[property] = range.from; });
      const values = Object.fromEntries(range.properties.map((property) => [property, range.to]));
      const tween = scene?.tweens.add({
        targets: record.object,
        ...values,
        duration: action.durationMs * (options.reducedMotion ? 2.5 : 1),
        ease: "Sine.easeInOut",
        yoyo: Boolean(action.yoyo),
        repeat: action.repeat ?? 0,
      });
      if (tween) activeTweens.add(tween);
    });
  };

  const startParticleLoop = (action: Extract<RuntimeAction, { type: "particle-loop" }>) => {
    if (!scene || !loadedAssetIds.has(action.assetId)) return;
    const placement = layout.placements.find((candidate) =>
      candidate.layer === "weather" && placementAssetId(candidate, spawns) === action.assetId,
    );
    const minX = action.region.minX * layout.world.width;
    const maxX = action.region.maxX * layout.world.width;
    const minY = action.region.minY * layout.world.height;
    const maxY = action.region.maxY * layout.world.height;
    const velocityScale = options.reducedMotion ? 0.5 : 1;
    const emitter = trackObject(scene.add.particles(0, 0, getRuntimeAssetKey(action.assetId), {
      x: { min: minX, max: maxX },
      y: { min: minY, max: maxY },
      speedY: { min: action.velocity.minY * velocityScale, max: action.velocity.maxY * velocityScale },
      lifespan: action.lifespanMs * (options.reducedMotion ? 1.5 : 1),
      frequency: action.frequencyMs * (options.reducedMotion ? 3 : 1),
      quantity: 1,
    }));
    particleEmitters.add(emitter);
    emitter.setDepth?.(placement?.depth ?? 1000);
  };

  const startActions = () => {
    const actionMap = new Map(experience.actions.map((action) => [action.id, action]));
    for (const spawn of spawns.values()) {
      for (const actionId of spawn.actionIds ?? []) {
        const action = actionMap.get(actionId);
        if (action?.type === "tween") startTween(action);
      }
    }
    const weather = experience.weather.presentations.find((presentation) => presentation.tone === experience.weather.defaultTone);
    const particleAction = getWeatherParticleAction(experience);
    if (particleAction) startParticleLoop(particleAction);
    if (weather?.tint && scene) {
      const tint = Number.parseInt(weather.tint.replace("#", ""), 16);
      const overlay = trackObject(scene.add.rectangle(
        layout.world.width / 2,
        layout.world.height / 2,
        layout.world.width,
        layout.world.height,
        tint,
        0.08,
      ));
      overlay.setDepth(2000);
    }
  };

  const clampPlayer = () => {
    const bounds = layout.player.movementBounds;
    player.x = Math.max(bounds.minX * layout.world.width, Math.min(bounds.maxX * layout.world.width, player.x));
    player.y = Math.max(bounds.minY * layout.world.height, Math.min(bounds.maxY * layout.world.height, player.y));
  };

  const buildLayout = (viewportWidth: number, viewportHeight: number) => {
    if (!scene) return;
    const previousWorld = layout.world;
    const previousPosition = player.x || player.y
      ? { x: player.x / previousWorld.width, y: player.y / previousWorld.height }
      : null;
    const camera = getViewportCamera(viewportWidth, viewportHeight, experience.layouts);
    layout = camera.layout;
    player = previousPosition
      ? { x: previousPosition.x * layout.world.width, y: previousPosition.y * layout.world.height }
      : { x: layout.player.position.x * layout.world.width, y: layout.player.position.y * layout.world.height };
    clampPlayer();

    scene.cameras.main.setBounds(0, 0, layout.world.width, layout.world.height);
    scene.cameras.main.setViewport(0, 0, viewportWidth, viewportHeight);
    scene.cameras.main.setZoom(camera.zoom);
    scene.cameras.main.centerOn(layout.world.width / 2, layout.world.height / 2);
    scene.cameras.main.setRoundPixels?.(true);

    destroyLayout();
    registerAnimations();
    const hasComposedBackground = layout.placements.some((placement) => {
      const assetId = placementAssetId(placement, spawns);
      return placement.layer === "background" && Boolean(assetId && loadedAssetIds.has(assetId));
    });
    if (layout.fallbackBackgroundAssetId && !hasComposedBackground) {
      const background = trackObject(scene.add.image(
        layout.world.width / 2,
        layout.world.height / 2,
        getRuntimeAssetKey(layout.fallbackBackgroundAssetId),
      ));
      background.setOrigin(0.5).setDisplaySize(layout.world.width, layout.world.height).setDepth(-10000);
    }

    [...layout.placements].sort((a, b) => a.depth - b.depth).forEach((placement) => {
      const assetId = placementAssetId(placement, spawns);
      if (!assetId || !loadedAssetIds.has(assetId) || !shouldRenderPlacementImage(placement)) return;
      const object = addProjectedImage(assetId, placement);
      if (!object || placement.type !== "spawn") return;
      addTargetObject(placement.spawnId, object, placement.scale);
      if (!clickTargets.has(placement.spawnId)) return;
      const targets = interactiveObjects.get(placement.spawnId) ?? [];
      targets.push(object);
      interactiveObjects.set(placement.spawnId, targets);
      object.setInteractive({ useHandCursor: true });
      object.on("pointerup", () => emitInteraction(getInteractionDetailForTarget(experience, placement.spawnId)));
    });

    const playerSpawn = spawns.get(layout.player.spawnId);
    if (playerSpawn && loadedAssetIds.has(playerSpawn.assetId)) {
      const playerAsset = assets.get(playerSpawn.assetId);
      playerAnimation = playerSpawn.animation;
      playerObject = trackObject(playerAsset?.loadType === "spritesheet"
        ? scene.add.sprite(player.x, player.y, getRuntimeAssetKey(playerSpawn.assetId), 0)
        : scene.add.image(player.x, player.y, getRuntimeAssetKey(playerSpawn.assetId)));
      playerObject.setOrigin(0.5).setScale(layout.player.scale).setDepth(layout.player.depth);
      if (playerAnimation && playerAsset?.loadType === "spritesheet") {
        const defaultClip = playerAsset.animations?.find((clip) => clip.id === playerAnimation?.defaultClip);
        const autoplay = playerAnimation.autoplay !== false;
        animatedObjects.set(playerObject, autoplay);
        playerCurrentClip = defaultClip?.id;
        if (autoplay && defaultClip) playerObject.anims?.play?.(getRuntimeAnimationKey(playerSpawn.assetId, defaultClip.id));
      }
      addTargetObject(playerSpawn.id, playerObject, layout.player.scale);
    }
    startActions();
    if (!inputEnabled) pauseAnimations();
  };

  const buildLayoutWhenReady = (viewportWidth: number, viewportHeight: number) => {
    const currentScene = scene;
    if (!currentScene) return;
    const token = ++layoutLoadToken;
    const { orientation } = getViewportCamera(viewportWidth, viewportHeight, experience.layouts);
    const requiredAssetIds = getRenderableAssetIds(experience, orientation);
    const pendingAssetIds = [...requiredAssetIds].filter((assetId) => !loadedAssetIds.has(assetId));
    if (pendingAssetIds.length === 0) {
      buildLayout(viewportWidth, viewportHeight);
      return;
    }

    pendingAssetIds
      .filter((assetId) => !queuedAssetIds.has(assetId))
      .forEach((assetId) => queueAsset(currentScene.load, assetId));
    currentScene.load.once("complete", () => {
      pendingAssetIds.forEach((assetId) => loadedAssetIds.add(assetId));
      if (token === layoutLoadToken) buildLayout(viewportWidth, viewportHeight);
    });
    currentScene.load.start();
  };

  const triggerNearest = () => {
    if (!inputEnabled) return;
    let nearest: { targetId: string; object: any; distance: number } | undefined;
    interactiveObjects.forEach((targetObjectsForId, targetId) => {
      targetObjectsForId.forEach((object) => {
        const distance = getInteractionApproachDistance(player, object, layout);
        if (!nearest || distance < nearest.distance) nearest = { targetId, object, distance };
      });
    });
    if (nearest && nearest.distance <= 0.16) {
      emitInteraction(getInteractionDetailForTarget(experience, nearest.targetId));
    }
  };

  return {
    preload(this: SceneContext) {
      const viewportWidth = this.scale.width || (typeof window === "undefined" ? 0 : window.innerWidth);
      const viewportHeight = this.scale.height || (typeof window === "undefined" ? 0 : window.innerHeight);
      const { orientation } = getViewportCamera(viewportWidth, viewportHeight, experience.layouts);
      getRenderableAssetIds(experience, orientation).forEach((assetId) => {
        queueAsset(this.load, assetId);
        loadedAssetIds.add(assetId);
      });
    },
    create(this: SceneContext) {
      // Scene lifecycle provides external object used by resize callbacks.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      scene = this;
      buildLayout(this.scale.width || window.innerWidth, this.scale.height || window.innerHeight);
      const keyboard = this.input.keyboard;
      const keys = keyboard?.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") ?? {};
      keyListener = (event) => {
        if (!inputEnabled) return;
        const key = event.key.toUpperCase();
        if (key === "E") {
          triggerNearest();
          return;
        }
        const interaction = experience.interactions.find((candidate) =>
          candidate.triggers.some((trigger) => trigger.type === "keyboard" && trigger.key.toUpperCase() === key),
        );
        if (!interaction) return;
        const trigger = interaction.triggers.find((candidate) => candidate.type === "keyboard" && candidate.key.toUpperCase() === key);
        emitInteraction(interactionDetail(interaction, trigger?.targetId));
      };
      keyboard?.on("keydown", keyListener);
      bridgeStops.push(
        bridge.on("goody:move", ({ direction, pressed }) => {
          if (inputEnabled) movement[direction] = pressed;
        }),
        bridge.on("goody:input", ({ enabled }) => setInputEnabled(enabled)),
      );
      setInputEnabled(bridge.isInputEnabled());
      scaleListener = (gameSize) => buildLayoutWhenReady(gameSize.width, gameSize.height);
      this.scale.on("resize", scaleListener);
      const stop = () => {
        destroyLayout();
        const registrations = scene?.anims ? runtimeAnimationRegistrations.get(scene.anims) : undefined;
        registeredAnimationKeys.forEach((key) => {
          const registration = registrations?.get(key);
          if (!registration) return;
          registration.users -= 1;
          if (registration.users > 0) return;
          registrations?.delete(key);
          if (registration.owned) scene?.anims?.remove?.(key);
        });
        if (scene?.anims && registrations?.size === 0) runtimeAnimationRegistrations.delete(scene.anims);
        registeredAnimationKeys.clear();
        clearMovement();
        bridgeStops.splice(0).forEach((unsubscribe) => unsubscribe());
        if (scaleListener) this.scale.off("resize", scaleListener);
        if (keyListener) keyboard?.off("keydown", keyListener);
        scaleListener = null;
        keyListener = null;
        scene = null;
      };
      this.events.once("shutdown", stop);
      this.events.once("destroy", stop);
      (this as any).__goodyKeys = keys;
    },
    update(this: SceneContext, time: number, delta: number) {
      if (!inputEnabled || !playerObject) return;
      const keys = (this as any).__goodyKeys as Record<string, { isDown?: boolean }> | undefined;
      if (!keys) return;
      const left = movement.left || keys.LEFT?.isDown || keys.A?.isDown;
      const right = movement.right || keys.RIGHT?.isDown || keys.D?.isDown;
      const up = movement.up || keys.UP?.isDown || keys.W?.isDown;
      const down = movement.down || keys.DOWN?.isDown || keys.S?.isDown;
      const dx = Number(right) - Number(left);
      const dy = Number(down) - Number(up);
      const before = { x: player.x, y: player.y };
      if (dx || dy) {
        const length = Math.hypot(dx, dy) || 1;
        const speed = Math.min(layout.world.width, layout.world.height) * 0.0002;
        player.x += (dx / length) * speed * delta;
        player.y += (dy / length) * speed * delta;
        clampPlayer();
        playerObject.setPosition(player.x, player.y);
      }
      const actualDx = player.x - before.x;
      const actualDy = player.y - before.y;
      const actualDistance = Math.hypot(actualDx, actualDy);
      if (playerAnimation) {
        const threshold = playerAnimation.movementThreshold ?? 0;
        if (actualDistance > threshold) {
          playerLastMovementAt = time;
          if (playerAnimation.movingClip) playPlayerClip(playerAnimation.movingClip);
          if (playerAnimation.flipWithMovement !== false && actualDx !== 0) playerObject.setFlipX?.(actualDx < 0);
        } else if (
          playerAnimation.movingClip &&
          playerAnimation.defaultClip !== playerAnimation.movingClip &&
          playerCurrentClip === playerAnimation.movingClip &&
          playerLastMovementAt !== null &&
          time - playerLastMovementAt >= (playerAnimation.stopDelayMs ?? 120)
        ) {
          playPlayerClip(playerAnimation.defaultClip, true);
        }
      } else if (actualDx !== 0) {
        playerObject.setFlipX?.(actualDx < 0);
      }
    },
  };
}

export const createGoodyScene = createRuntimeExperienceScene;
