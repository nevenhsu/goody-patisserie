import {
  ASSET_LAYER_VOCABULARY,
  DEFAULT_REQUIRED_ASSET_LAYERS,
  type AssetLayer,
  type ExternalTsjReference,
  type ReleaseManifest,
  type SceneAsset,
} from "../content/types";
import type { ValidationIssue } from "./errors";
import { DomainValidationError } from "./errors";

export type ExternalTsjResolution = {
  /** Resolved source may be a generated URI or another serializable source. */
  source: SceneAsset["source"];
  /** Optional metadata returned by an authoring system. */
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
};

/** Adapter boundary for externally-authored TSJ assets. */
export interface ExternalTsjAuthoringResolver {
  resolve(
    reference: ExternalTsjReference,
    context: { asset: SceneAsset; manifest: ReleaseManifest },
  ): ExternalTsjResolution | null | Promise<ExternalTsjResolution | null>;
}

export type AssetValidationInput = Pick<ReleaseManifest, "assets" | "baseScenes" | "site" | "weeklySchedule"> &
  Partial<Pick<ReleaseManifest, "variants" | "characters" | "datedSchedules" | "scheduleVariants">>;

export type AssetValidationOptions = {
  requiredLayers?: readonly AssetLayer[];
  externalResolver?: ExternalTsjAuthoringResolver;
};

export type AssetValidationResult = {
  valid: boolean;
  issues: readonly ValidationIssue[];
};

function layerMatches(actual: string, required: string): boolean {
  return actual === required;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function add(issues: ValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

export class AssetValidator {
  private readonly options: AssetValidationOptions;

  constructor(options: AssetValidationOptions = {}) {
    this.options = options;
  }

  validate(input: AssetValidationInput): AssetValidationResult {
    return this.validateInternal(input);
  }

  async validateAsync(input: AssetValidationInput): Promise<AssetValidationResult> {
    const result = this.validateInternal(input);
    if (!this.options.externalResolver) return result;
    const issues = [...result.issues];
    const manifest = input as ReleaseManifest;
    for (const [index, asset] of input.assets.entries()) {
      if (asset.source.kind !== "external-tsj") continue;
      try {
        const resolution = await this.options.externalResolver.resolve(asset.source, {
          asset,
          manifest,
        });
        if (!resolution) {
          add(issues, `assets[${index}].source`, "external-unresolved", "External TSJ asset could not be resolved");
        }
      } catch (error) {
        add(
          issues,
          `assets[${index}].source`,
          "external-error",
          `External TSJ resolver failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { valid: issues.length === 0, issues };
  }

  assertValid(input: AssetValidationInput): void {
    const result = this.validate(input);
    if (!result.valid) throw new DomainValidationError("Asset validation failed", result.issues);
  }

  async assertValidAsync(input: AssetValidationInput): Promise<void> {
    const result = await this.validateAsync(input);
    if (!result.valid) throw new DomainValidationError("Asset validation failed", result.issues);
  }

  private validateInternal(input: AssetValidationInput): AssetValidationResult {
    const issues: ValidationIssue[] = [];
    const requiredLayers = this.options.requiredLayers ?? DEFAULT_REQUIRED_ASSET_LAYERS;
    const knownLayers = new Set<string>(ASSET_LAYER_VOCABULARY);
    const assetIds = new Set<string>();
    const sceneIds = new Set<string>();
    const variantIds = new Set<string>();
    const interactionIds = new Set<string>();

    if (!input || !Array.isArray(input.assets)) {
      add(issues, "assets", "required", "assets must be an array");
      return { valid: false, issues };
    }
    input.assets.forEach((asset, index) => {
      if (!nonEmpty(asset.id)) add(issues, `assets[${index}].id`, "required", "asset id is required");
      else if (assetIds.has(asset.id)) add(issues, `assets[${index}].id`, "duplicate", `duplicate asset id: ${asset.id}`);
      else assetIds.add(asset.id);
      if (!knownLayers.has(asset.layer)) add(issues, `assets[${index}].layer`, "layer", `unknown asset layer: ${asset.layer}`);
      if (!asset.source || typeof asset.source !== "object" || !("kind" in asset.source)) {
        add(issues, `assets[${index}].source`, "required", "asset source is required");
        return;
      }
      if (asset.source.kind === "uri" && !nonEmpty(asset.source.uri)) {
        add(issues, `assets[${index}].source.uri`, "required", "asset URI is required");
      }
      if (asset.source.kind === "external-tsj") {
        if (!nonEmpty(asset.source.source)) add(issues, `assets[${index}].source.source`, "required", "TSJ source is required");
        if (!this.options.externalResolver) {
          add(issues, `assets[${index}].source`, "resolver", "an external TSJ resolver is required");
        }
      } else if (asset.source.kind !== "uri") {
        add(issues, `assets[${index}].source.kind`, "source", `unknown asset source kind: ${String(asset.source.kind)}`);
      }
    });

    for (const required of requiredLayers) {
      if (!input.assets.some((asset) => layerMatches(asset.layer, required))) {
        add(issues, "assets", "missing-layer", `required asset layer is missing: ${required}`);
      }
    }

    if (!Array.isArray(input.baseScenes)) {
      add(issues, "baseScenes", "required", "baseScenes must be an array");
    }
    for (const [sceneIndex, scene] of (input.baseScenes ?? []).entries()) {
      for (const [interactionIndex, interaction] of (scene.interactions ?? []).entries()) {
        if (!nonEmpty(interaction.id)) {
          add(issues, `baseScenes[${sceneIndex}].interactions[${interactionIndex}].id`, "required", "interaction id is required");
        } else if (interactionIds.has(interaction.id)) {
          add(issues, `baseScenes[${sceneIndex}].interactions[${interactionIndex}].id`, "duplicate", `duplicate interaction id: ${interaction.id}`);
        } else {
          interactionIds.add(interaction.id);
        }
      }
    }
    for (const [index, scene] of (input.baseScenes ?? []).entries()) {
      if (!nonEmpty(scene.id)) add(issues, `baseScenes[${index}].id`, "required", "scene id is required");
      else if (sceneIds.has(scene.id)) add(issues, `baseScenes[${index}].id`, "duplicate", `duplicate scene id: ${scene.id}`);
      else sceneIds.add(scene.id);
      for (const [layerIndex, layer] of (scene.layers ?? []).entries()) {
        if (!assetIds.has(layer.assetId)) add(issues, `baseScenes[${index}].layers[${layerIndex}].assetId`, "reference", `unknown asset: ${layer.assetId}`);
        if (!knownLayers.has(layer.layer)) add(issues, `baseScenes[${index}].layers[${layerIndex}].layer`, "layer", `unknown scene layer: ${layer.layer}`);
      }
      scene.interactions?.forEach((interaction, interactionIndex) => {
        if (interaction.targetId && !sceneIds.has(interaction.targetId) && !interactionIds.has(interaction.targetId)) {
          // Targets may refer to a later scene, so this is checked again after
          // the complete scene id set has been collected below.
          add(issues, `baseScenes[${index}].interactions[${interactionIndex}].targetId`, "deferred-reference", `unknown target: ${interaction.targetId}`);
        }
      });
    }

    (input.variants ?? []).forEach((variant, index) => {
      if (!nonEmpty(variant.id)) add(issues, `variants[${index}].id`, "required", "variant id is required");
      else if (variantIds.has(variant.id)) add(issues, `variants[${index}].id`, "duplicate", `duplicate variant id: ${variant.id}`);
      else variantIds.add(variant.id);
      if (!sceneIds.has(variant.sceneId)) add(issues, `variants[${index}].sceneId`, "reference", `unknown scene: ${variant.sceneId}`);
      variant.layers?.forEach((layer, layerIndex) => {
        if (!assetIds.has(layer.assetId)) add(issues, `variants[${index}].layers[${layerIndex}].assetId`, "reference", `unknown asset: ${layer.assetId}`);
        if (!knownLayers.has(layer.layer)) add(issues, `variants[${index}].layers[${layerIndex}].layer`, "layer", `unknown scene layer: ${layer.layer}`);
      });
    });

    input.characters?.forEach((character, characterIndex) => {
      character.presets.forEach((preset, presetIndex) => {
        preset.parts.forEach((part, partIndex) => {
          if (!assetIds.has(part.assetId)) {
            add(issues, `characters[${characterIndex}].presets[${presetIndex}].parts[${partIndex}].assetId`, "reference", `unknown asset: ${part.assetId}`);
          }
        });
      });
    });
    for (const [index, schedule] of (input.datedSchedules ?? []).entries()) {
      if (schedule.sceneId && !sceneIds.has(schedule.sceneId)) add(issues, `datedSchedules[${index}].sceneId`, "reference", `unknown scene: ${schedule.sceneId}`);
      if (schedule.variantId && !variantIds.has(schedule.variantId)) add(issues, `datedSchedules[${index}].variantId`, "reference", `unknown variant: ${schedule.variantId}`);
    }
    for (const [index, schedule] of (input.weeklySchedule?.entries ?? []).entries()) {
      if (schedule.sceneId && !sceneIds.has(schedule.sceneId)) {
        add(issues, `weeklySchedule.entries[${index}].sceneId`, "reference", `unknown scene: ${schedule.sceneId}`);
      }
      if (schedule.variantId && !variantIds.has(schedule.variantId)) {
        add(issues, `weeklySchedule.entries[${index}].variantId`, "reference", `unknown variant: ${schedule.variantId}`);
      }
    }
    for (const [index, schedule] of (input.scheduleVariants ?? []).entries()) {
      if (!variantIds.has(schedule.variantId)) add(issues, `scheduleVariants[${index}].variantId`, "reference", `unknown variant: ${schedule.variantId}`);
    }

    // Remove deferred interaction errors when a later scene supplies the id.
    for (let index = issues.length - 1; index >= 0; index -= 1) {
      const issue = issues[index];
      if (issue.code === "deferred-reference") {
        const target = issue.message.replace(/^unknown target: /, "");
        if (sceneIds.has(target)) issues.splice(index, 1);
      }
    }
    return { valid: issues.length === 0, issues };
  }
}

export { layerMatches };
