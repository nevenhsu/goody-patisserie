import type {
  RuntimeAction,
  RuntimeExperience,
  RuntimeInteraction,
  RuntimeOrientationLayout,
  RuntimePlacement,
  RuntimeSpawn,
  TweenRuntimeAction,
} from "../content/runtime-experience";
import type { GameBridge, GameInteractionDetail, MoveDirection } from "./bridge";
import { getViewportCamera } from "./viewport";

/* Phaser stays client-only; this interpreter intentionally uses its runtime shape. */
/* eslint-disable @typescript-eslint/no-explicit-any */

type SceneContext = {
  add: any;
  cameras: any;
  events: any;
  input: any;
  load: any;
  scale: any;
  tweens: any;
};

type SceneOptions = { reducedMotion?: boolean };
type DisplayRecord = { object: any; base: { x: number; y: number; scale: number; alpha: number; rotation: number } };

export function getRuntimeAssetKey(id: string) {
  return `goody-runtime-${id}`;
}

export function getRenderableAssetIds(experience: RuntimeExperience) {
  return new Set(experience.assets.map((asset) => asset.id));
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

function placementAssetId(placement: RuntimePlacement, spawns: Map<string, RuntimeSpawn>) {
  return placement.type === "asset" ? placement.assetId : spawns.get(placement.spawnId)?.assetId;
}

function normalizedDistance(a: { x: number; y: number }, b: { x: number; y: number }, layout: RuntimeOrientationLayout) {
  return Math.hypot((a.x - b.x) / layout.world.width, (a.y - b.y) / layout.world.height);
}

export function createRuntimeExperienceScene(
  bridge: GameBridge,
  experience: RuntimeExperience,
  options: SceneOptions = {},
) {
  const movement: Record<MoveDirection, boolean> = { up: false, down: false, left: false, right: false };
  const spawns = new Map(allSpawns(experience).map((spawn) => [spawn.id, spawn]));
  const loadedAssetIds = getRenderableAssetIds(experience);
  const clickTargets = new Set(
    experience.interactions.flatMap((interaction) =>
      interaction.triggers.filter((trigger) => trigger.type === "click").map((trigger) => trigger.targetId),
    ),
  );
  const objects = new Set<any>();
  const activeTweens = new Set<any>();
  const targetObjects = new Map<string, DisplayRecord[]>();
  const interactiveObjects = new Map<string, any[]>();
  const bridgeStops: Array<() => void> = [];
  let scene: SceneContext | null = null;
  let layout = experience.layouts.landscape;
  let player = { x: 0, y: 0 };
  let playerObject: any = null;
  let inputEnabled = bridge.isInputEnabled();
  let scaleListener: ((gameSize: { width: number; height: number }) => void) | null = null;
  let keyListener: ((event: KeyboardEvent) => void) | null = null;

  const clearMovement = () => {
    (Object.keys(movement) as MoveDirection[]).forEach((direction) => { movement[direction] = false; });
  };

  const setInputEnabled = (enabled: boolean) => {
    inputEnabled = enabled;
    clearMovement();
    const keyboard = scene?.input.keyboard;
    if (keyboard) {
      keyboard.enabled = enabled;
      keyboard.resetKeys?.();
    }
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
    objects.forEach((object) => object.destroy?.());
    objects.clear();
    targetObjects.clear();
    interactiveObjects.clear();
    playerObject = null;
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

  const addImage = (assetId: string, placement: RuntimePlacement) => {
    if (!scene) return null;
    const object = trackObject(scene.add.image(
      placement.position.x * layout.world.width,
      placement.position.y * layout.world.height,
      getRuntimeAssetKey(assetId),
    ));
    object.setOrigin(0.5).setScale(placement.scale).setDepth(placement.depth);
    object.setFlipX?.(Boolean(placement.flipX));
    return object;
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
      const object = addImage(assetId, placement);
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
      playerObject = trackObject(scene.add.image(player.x, player.y, getRuntimeAssetKey(playerSpawn.assetId)));
      playerObject.setOrigin(0.5).setScale(layout.player.scale).setDepth(layout.player.depth);
      addTargetObject(playerSpawn.id, playerObject, layout.player.scale);
    }
    startActions();
  };

  const triggerNearest = () => {
    if (!inputEnabled) return;
    let nearest: { targetId: string; object: any; distance: number } | undefined;
    interactiveObjects.forEach((targetObjectsForId, targetId) => {
      targetObjectsForId.forEach((object) => {
        const distance = normalizedDistance(player, object, layout);
        if (!nearest || distance < nearest.distance) nearest = { targetId, object, distance };
      });
    });
    if (nearest && nearest.distance <= 0.16) {
      emitInteraction(getInteractionDetailForTarget(experience, nearest.targetId));
    }
  };

  return {
    preload(this: SceneContext) {
      experience.assets.filter((asset) => loadedAssetIds.has(asset.id)).forEach((asset) => {
        const key = getRuntimeAssetKey(asset.id);
        if (asset.loadType === "spritesheet" && asset.frame) {
          this.load.spritesheet(key, asset.uri, { frameWidth: asset.frame.width, frameHeight: asset.frame.height });
        } else if (asset.loadType === "atlas" && asset.atlasDataUri) {
          this.load.atlas(key, asset.uri, asset.atlasDataUri);
        } else {
          this.load.image(key, asset.uri);
        }
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
      scaleListener = (gameSize) => buildLayout(gameSize.width, gameSize.height);
      this.scale.on("resize", scaleListener);
      const stop = () => {
        destroyLayout();
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
    update(this: SceneContext, _time: number, delta: number) {
      if (!inputEnabled || !playerObject) return;
      const keys = (this as any).__goodyKeys as Record<string, { isDown?: boolean }> | undefined;
      if (!keys) return;
      const left = movement.left || keys.LEFT?.isDown || keys.A?.isDown;
      const right = movement.right || keys.RIGHT?.isDown || keys.D?.isDown;
      const up = movement.up || keys.UP?.isDown || keys.W?.isDown;
      const down = movement.down || keys.DOWN?.isDown || keys.S?.isDown;
      const dx = Number(right) - Number(left);
      const dy = Number(down) - Number(up);
      if (!dx && !dy) return;
      const length = Math.hypot(dx, dy) || 1;
      const speed = Math.min(layout.world.width, layout.world.height) * 0.0002;
      player.x += (dx / length) * speed * delta;
      player.y += (dy / length) * speed * delta;
      clampPlayer();
      playerObject.setPosition(player.x, player.y);
      if (dx) playerObject.setFlipX?.(dx < 0);
    },
  };
}

export const createGoodyScene = createRuntimeExperienceScene;
