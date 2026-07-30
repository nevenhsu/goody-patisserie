import type {
  RuntimeSnapshot,
  RuntimeWeather,
  WeatherLocation,
  WeatherObservation,
} from "../content/types";
import { DomainValidationError } from "./errors";
import { ScheduleResolver, type Clock, systemClock } from "./schedule";
import type { ReleaseRepository } from "./release";

export interface WeatherAdapter {
  getCurrent(
    location: WeatherLocation | undefined,
  ): WeatherObservation | null | Promise<WeatherObservation | null>;
}

export type RuntimeBootstrapOptions = {
  clock?: Clock;
  weatherAdapter?: WeatherAdapter;
  weatherMaxAgeMs?: number;
};

export class RuntimeBootstrap {
  private readonly clock: Clock;
  private readonly weatherAdapter?: WeatherAdapter;
  private readonly weatherMaxAgeMs: number;
  private readonly weatherCache = new Map<string, WeatherObservation>();

  constructor(
    private readonly releases: ReleaseRepository,
    options: RuntimeBootstrapOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.weatherAdapter = options.weatherAdapter;
    this.weatherMaxAgeMs = options.weatherMaxAgeMs ?? 15 * 60 * 1000;
  }

  async bootstrap(at: Date = this.clock.now()): Promise<RuntimeSnapshot> {
    if (Number.isNaN(at.getTime())) throw new Error("Invalid runtime date");
    const activeId = await this.releases.getActiveId();
    if (!activeId) throw new DomainValidationError("No active release", [{ path: "activeRelease", code: "missing", message: "an active release is required" }]);
    const manifest = await this.releases.get(activeId);
    if (!manifest) throw new DomainValidationError("Active release is unavailable", [{ path: "activeRelease", code: "missing", message: `release ${activeId} is unavailable` }]);

    const resolver = new ScheduleResolver({
      weeklySchedule: manifest.weeklySchedule,
      datedSchedules: manifest.datedSchedules,
      scheduleVariants: manifest.scheduleVariants,
    });
    const schedule = resolver.resolve(at);
    const effectiveVariant = schedule.variantId
      ? manifest.variants?.find((variant) => variant.id === schedule.variantId) ?? null
      : null;
    const sceneId = schedule.sceneId ?? effectiveVariant?.sceneId ?? manifest.baseScenes[0]?.id;
    const baseScene = manifest.baseScenes.find((scene) => scene.id === sceneId) ?? null;
    const effectiveScene = baseScene && effectiveVariant && effectiveVariant.sceneId === baseScene.id
      ? {
          ...baseScene,
          layers: effectiveVariant.layers ?? baseScene.layers,
          interactions: effectiveVariant.interactions ?? baseScene.interactions,
        }
      : baseScene;
    const weather = await this.resolveWeather(at, manifest.site.weatherLocation);
    return {
      serverNow: at.toISOString(),
      timeZone: manifest.site.timeZone,
      schedule,
      effectiveScene,
      effectiveVariant,
      weather,
      activeManifest: manifest,
    };
  }

  private async resolveWeather(at: Date, location: WeatherLocation | undefined): Promise<RuntimeWeather> {
    const locationId = location?.id ?? "default";
    if (this.weatherAdapter) {
      try {
        const current = await this.weatherAdapter.getCurrent(location);
        if (current && (!location || current.locationId === location.id)) {
          this.weatherCache.set(locationId, current);
        }
      } catch {
        // Keep the last observation. A weather outage must not prevent the
        // rest of the scene from bootstrapping.
      }
    }
    const lastKnown = this.weatherCache.get(locationId) ?? null;
    const observedAt = lastKnown ? Date.parse(lastKnown.observedAt) : Number.NaN;
    const stale = !lastKnown || Number.isNaN(observedAt) || at.getTime() - observedAt > this.weatherMaxAgeMs;
    return {
      observation: stale ? null : lastKnown,
      lastKnown,
      stale,
    };
  }
}

export class FixedClock implements Clock {
  constructor(private readonly value: Date) {}

  now(): Date {
    return new Date(this.value);
  }
}
