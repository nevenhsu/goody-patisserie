import type { RuntimeExperience } from "../content/runtime-experience";
import { validateRuntimeExperience } from "../domain/experience";

export interface PayloadRuntimeReader {
  findGlobal(args: {
    slug: "site-settings";
    depth: 0;
  }): Promise<unknown>;
  find(args: {
    collection: "release-manifests";
    depth: 0;
    draft: false;
    limit: 1;
    overrideAccess: false;
    where: {
      and: [
        { key: { equals: string } },
        { status: { equals: "released" } },
        { _status: { equals: "published" } },
      ];
    };
  }): Promise<{ docs: readonly unknown[] }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createPayloadRuntimeExperienceSource(reader: PayloadRuntimeReader) {
  return {
    async load(): Promise<RuntimeExperience | null> {
      const settings = await reader.findGlobal({ slug: "site-settings", depth: 0 });
      if (!isRecord(settings) || typeof settings.defaultReleaseKey !== "string" || !settings.defaultReleaseKey.trim()) {
        return null;
      }

      const releaseKey = settings.defaultReleaseKey.trim();
      const result = await reader.find({
        collection: "release-manifests",
        depth: 0,
        draft: false,
        limit: 1,
        overrideAccess: false,
        where: {
          and: [
            { key: { equals: releaseKey } },
            { status: { equals: "released" } },
            { _status: { equals: "published" } },
          ],
        },
      });
      const release = result.docs[0];
      if (
        !isRecord(release) ||
        release.key !== releaseKey ||
        release.status !== "released" ||
        (release._status !== undefined && release._status !== "published")
      ) {
        return null;
      }

      const validated = validateRuntimeExperience(release.manifest);
      if (!validated.valid || !validated.value || validated.value.mode !== "released") return null;
      if (validated.value.release.id !== releaseKey) return null;
      if (typeof release.version === "string" && validated.value.release.version !== release.version) return null;
      return validated.value;
    },
  };
}
