import type { RuntimeExperience } from "../content/runtime-experience";
import {
  selectOrientationLayout,
  validateRuntimeExperience,
} from "../domain/experience";
import { getDemoRuntimeExperience } from "./demo";

type RuntimeExperienceSource = {
  load(): unknown | null | Promise<unknown | null>;
};

export async function getRuntimeExperience(
  source?: RuntimeExperienceSource,
): Promise<RuntimeExperience> {
  if (source) {
    try {
      const candidate = await source.load();
      const validated = validateRuntimeExperience(candidate);
      if (validated.valid && validated.value) return validated.value;
    } catch {
      // Runtime boot must remain available when Payload or D1 is unavailable.
    }
  }

  const demo = getDemoRuntimeExperience();
  const validatedDemo = validateRuntimeExperience(demo);
  if (!validatedDemo.valid || !validatedDemo.value) {
    throw new Error("Built-in runtime experience is invalid");
  }
  return validatedDemo.value;
}

export { selectOrientationLayout, validateRuntimeExperience };
