import type { ReleaseManifest } from "../content/types";
import { AssetValidator } from "./assets";
import { DomainValidationError, type ValidationIssue } from "./errors";

export interface ReleaseRepository {
  get(id: string): ReleaseManifest | null | Promise<ReleaseManifest | null>;
  save(manifest: ReleaseManifest): void | Promise<void>;
  getActiveId(): string | null | Promise<string | null>;
  setActiveId(id: string): void | Promise<void>;
}

export type PublishOptions = {
  activate?: boolean;
};

export type PublishResult = {
  manifest: ReleaseManifest;
  activated: boolean;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function freezeDeep<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  return Object.freeze(value);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateManifestShape(manifest: ReleaseManifest): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!manifest || typeof manifest !== "object") return [{ path: "manifest", code: "required", message: "release manifest is required" }];
  if (manifest.schemaVersion !== 1) issues.push({ path: "schemaVersion", code: "schema", message: "unsupported manifest schema version" });
  if (!manifest.id?.trim()) issues.push({ path: "id", code: "required", message: "release id is required" });
  if (!manifest.version?.trim()) issues.push({ path: "version", code: "required", message: "release version is required" });
  if (!manifest.releasedAt || Number.isNaN(Date.parse(manifest.releasedAt))) issues.push({ path: "releasedAt", code: "date", message: "releasedAt must be an ISO date" });
  if (!manifest.site?.timeZone) issues.push({ path: "site.timeZone", code: "required", message: "site timezone is required" });
  if (!manifest.weeklySchedule?.timeZone) issues.push({ path: "weeklySchedule.timeZone", code: "required", message: "weekly schedule timezone is required" });
  return issues;
}

export class ReleasePublisher {
  constructor(
    private readonly repository: ReleaseRepository,
    private readonly validator = new AssetValidator(),
  ) {}

  async validate(manifest: ReleaseManifest): Promise<readonly ValidationIssue[]> {
    const shapeIssues = validateManifestShape(manifest);
    if (shapeIssues.length > 0) return shapeIssues;
    const content = await this.validator.validateAsync(manifest);
    return content.issues;
  }

  async publish(manifest: ReleaseManifest, options: PublishOptions = {}): Promise<PublishResult> {
    const issues = await this.validate(manifest);
    if (issues.length > 0) throw new DomainValidationError("Release manifest validation failed", issues);
    const snapshot = freezeDeep(clone(manifest));
    const existing = await this.repository.get(snapshot.id);
    if (existing) {
      if (stableSerialize(existing) !== stableSerialize(snapshot)) {
        throw new DomainValidationError("Release snapshots are immutable", [{
          path: "id",
          code: "immutable",
          message: `release ${snapshot.id} already exists with different content`,
        }]);
      }
    } else {
      await this.repository.save(snapshot);
    }
    const activate = options.activate ?? true;
    if (activate) await this.repository.setActiveId(snapshot.id);
    return { manifest: snapshot, activated: activate };
  }

  async rollback(releaseId: string): Promise<ReleaseManifest> {
    const manifest = await this.repository.get(releaseId);
    if (!manifest) {
      throw new DomainValidationError("Cannot rollback to an unknown release", [{
        path: "releaseId",
        code: "not-found",
        message: `release ${releaseId} does not exist`,
      }]);
    }
    await this.repository.setActiveId(releaseId);
    return freezeDeep(clone(manifest));
  }

  async active(): Promise<ReleaseManifest | null> {
    const id = await this.repository.getActiveId();
    if (!id) return null;
    const manifest = await this.repository.get(id);
    return manifest ? freezeDeep(clone(manifest)) : null;
  }
}

export class InMemoryReleaseRepository implements ReleaseRepository {
  private readonly releases = new Map<string, ReleaseManifest>();
  private activeId: string | null = null;

  get(id: string): ReleaseManifest | null {
    const value = this.releases.get(id);
    return value ? freezeDeep(clone(value)) : null;
  }

  save(manifest: ReleaseManifest): void {
    if (this.releases.has(manifest.id)) throw new Error(`release already exists: ${manifest.id}`);
    this.releases.set(manifest.id, freezeDeep(clone(manifest)));
  }

  getActiveId(): string | null {
    return this.activeId;
  }

  setActiveId(id: string): void {
    if (!this.releases.has(id)) throw new Error(`release does not exist: ${id}`);
    this.activeId = id;
  }
}

export { stableSerialize };
