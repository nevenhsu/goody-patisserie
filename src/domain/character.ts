import type { CharacterPart, CharacterPreset, CharacterSlot } from "../content/types";
import type { ValidationIssue } from "./errors";
import { DomainValidationError } from "./errors";

export type CharacterAppearanceSpec = {
  characterId: string;
  presetId?: string;
  traits: Readonly<Record<string, string>>;
  layers: readonly CharacterPart[];
  /** Animation tags expected to be present on every synchronized layer. */
  synchronizedAnimationTags?: readonly string[];
};

export type CharacterAppearanceOptions = {
  validTraits?: Readonly<Record<string, readonly string[]>>;
  validSlots?: readonly CharacterSlot[];
};

export type CharacterAppearanceValidation = {
  valid: boolean;
  issues: readonly ValidationIssue[];
};

export const CHARACTER_SLOTS = [
  "base",
  "body",
  "face",
  "hair",
  "clothing",
  "accessory",
  "hand",
  "prop",
  "effect",
] as const satisfies readonly CharacterSlot[];

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export class CharacterAppearance {
  readonly value: CharacterAppearanceSpec;

  constructor(value: CharacterAppearanceSpec, options: CharacterAppearanceOptions = {}) {
    const result = CharacterAppearance.validate(value, options);
    if (!result.valid) throw new DomainValidationError("Invalid character appearance", result.issues);
    this.value = freezeAppearance(value);
  }

  static validate(value: CharacterAppearanceSpec, options: CharacterAppearanceOptions = {}): CharacterAppearanceValidation {
    const issues: ValidationIssue[] = [];
    const slots = new Set(options.validSlots ?? CHARACTER_SLOTS);
    const validTraits = options.validTraits;
    if (!nonEmpty(value?.characterId)) issues.push({ path: "characterId", code: "required", message: "character id is required" });
    if (!value || !value.traits || typeof value.traits !== "object") {
      issues.push({ path: "traits", code: "required", message: "traits are required" });
    } else if (validTraits) {
      for (const [trait, selected] of Object.entries(value.traits)) {
        const allowed = validTraits[trait];
        if (!allowed) issues.push({ path: `traits.${trait}`, code: "trait", message: `unknown trait: ${trait}` });
        else if (!allowed.includes(selected)) issues.push({ path: `traits.${trait}`, code: "trait", message: `invalid value for trait ${trait}: ${selected}` });
      }
    }
    if (!Array.isArray(value?.layers) || value.layers.length === 0) {
      issues.push({ path: "layers", code: "required", message: "at least one character layer is required" });
      return { valid: issues.length === 0, issues };
    }
    const layerIds = new Set<string>();
    const zIndexes = new Set<number>();
    for (const [index, layer] of value.layers.entries()) {
      if (!nonEmpty(layer.id)) issues.push({ path: `layers[${index}].id`, code: "required", message: "layer id is required" });
      else if (layerIds.has(layer.id)) issues.push({ path: `layers[${index}].id`, code: "duplicate", message: `duplicate layer id: ${layer.id}` });
      else layerIds.add(layer.id);
      if (!slots.has(layer.slot)) issues.push({ path: `layers[${index}].slot`, code: "slot", message: `invalid character slot: ${layer.slot}` });
      if (!nonEmpty(layer.assetId)) issues.push({ path: `layers[${index}].assetId`, code: "required", message: "layer asset id is required" });
      if (!Number.isInteger(layer.zIndex)) issues.push({ path: `layers[${index}].zIndex`, code: "order", message: "zIndex must be an integer" });
      else if (zIndexes.has(layer.zIndex)) issues.push({ path: `layers[${index}].zIndex`, code: "order", message: `duplicate zIndex: ${layer.zIndex}` });
      else zIndexes.add(layer.zIndex);
    }
    for (let index = 1; index < value.layers.length; index += 1) {
      if (value.layers[index - 1].zIndex > value.layers[index].zIndex) {
        issues.push({ path: `layers[${index}].zIndex`, code: "order", message: "layers must be ordered by ascending zIndex" });
        break;
      }
    }

    const requiredTags = new Set(value.synchronizedAnimationTags ?? []);
    if ([...requiredTags].some((tag) => !nonEmpty(tag))) {
      issues.push({ path: "synchronizedAnimationTags", code: "animation", message: "animation tags must be non-empty" });
    }
    for (const [index, layer] of value.layers.entries()) {
      const tags = new Set(layer.animationTags ?? []);
      for (const tag of requiredTags) {
        if (!tags.has(tag)) issues.push({ path: `layers[${index}].animationTags`, code: "animation-sync", message: `layer ${layer.id} does not support synchronized tag ${tag}` });
      }
      if ([...(layer.animationTags ?? [])].some((tag) => !nonEmpty(tag))) {
        issues.push({ path: `layers[${index}].animationTags`, code: "animation", message: "animation tags must be non-empty" });
      }
    }
    return { valid: issues.length === 0, issues };
  }

  static fromPreset(
    characterId: string,
    preset: CharacterPreset,
    traits: Readonly<Record<string, string>> = {},
    options: CharacterAppearanceOptions = {},
  ): CharacterAppearance {
    return new CharacterAppearance({
      characterId,
      presetId: preset.id,
      traits,
      layers: preset.parts,
      synchronizedAnimationTags: preset.synchronizedAnimationTags,
    }, options);
  }
}

export function validateCharacterAppearance(value: CharacterAppearanceSpec, options: CharacterAppearanceOptions = {}): CharacterAppearanceValidation {
  return CharacterAppearance.validate(value, options);
}

function freezeAppearance(value: CharacterAppearanceSpec): CharacterAppearanceSpec {
  const layers = value.layers.map((layer) => Object.freeze({
    ...layer,
    animationTags: layer.animationTags ? Object.freeze([...layer.animationTags]) : undefined,
  }));
  return Object.freeze({
    ...value,
    traits: Object.freeze({ ...value.traits }),
    layers: Object.freeze(layers),
    synchronizedAnimationTags: value.synchronizedAnimationTags
      ? Object.freeze([...value.synchronizedAnimationTags])
      : undefined,
  });
}
