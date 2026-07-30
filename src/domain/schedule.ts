import type {
  DatedSchedule,
  ScheduleResolution,
  ScheduleVariant,
  Weekday,
  WeeklySchedule,
  WeeklyScheduleEntry,
} from "../content/types";

export type ScheduleResolverConfig = {
  weeklySchedule: WeeklySchedule;
  datedSchedules?: readonly DatedSchedule[];
  scheduleVariants?: readonly ScheduleVariant[];
};

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

type Candidate = {
  resolution: ScheduleResolution;
  releaseMillis: number;
  id: string;
};

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    dateFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function localParts(
  input: Date | string,
  timeZone: string,
): { date: string; weekday: Weekday; minuteOfDay: number | null } {
  if (typeof input === "string") {
    const date = input.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() as Weekday;
      return { date, weekday, minuteOfDay: null };
    }
    input = new Date(input);
  }
  if (Number.isNaN(input.getTime())) throw new Error("Invalid schedule date");
  const values = dateFormatter(timeZone).formatToParts(input);
  const part = (name: string) => values.find((value) => value.type === name)?.value ?? "0";
  const weekdayName = part("weekday");
  const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, Weekday>)[weekdayName] ?? 0;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    weekday,
    minuteOfDay: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

function parseClock(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function applyOpeningWindow(
  resolution: ScheduleResolution,
  minuteOfDay: number | null,
): ScheduleResolution {
  if (resolution.state !== "open" || minuteOfDay === null) return resolution;
  const opensAt = parseClock(resolution.openTime);
  const closesAt = parseClock(resolution.closeTime);
  if (opensAt === null || closesAt === null) return resolution;
  return minuteOfDay >= opensAt && minuteOfDay < closesAt
    ? resolution
    : { ...resolution, state: "closed" };
}

function releaseMillis(releasedAt: string | undefined): number {
  if (!releasedAt) return Number.NEGATIVE_INFINITY;
  const value = Date.parse(releasedAt);
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

function normalizePriority(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function datedMatch(rule: DatedSchedule, date: string): { specificity: number; source: "dated" | "range" } | null {
  if (rule.date) return rule.date === date ? { specificity: rule.specificity ?? 3, source: "dated" } : null;
  if (rule.startDate && rule.endDate && rule.startDate <= date && date <= rule.endDate) {
    return { specificity: rule.specificity ?? 2, source: "range" };
  }
  if (rule.startDate && !rule.endDate && rule.startDate <= date) return { specificity: rule.specificity ?? 2, source: "range" };
  if (!rule.startDate && rule.endDate && date <= rule.endDate) return { specificity: rule.specificity ?? 2, source: "range" };
  return null;
}

function fromEntry(entry: WeeklyScheduleEntry, date: string): ScheduleResolution {
  return {
    date,
    state: entry.state,
    openTime: entry.openTime,
    closeTime: entry.closeTime,
    sceneId: entry.sceneId,
    variantId: entry.variantId,
    source: "weekly",
    priority: normalizePriority(entry.priority),
    specificity: 1,
    releasedAt: entry.releasedAt,
  };
}

export class ScheduleResolver {
  readonly config: ScheduleResolverConfig;

  constructor(config: ScheduleResolverConfig) {
    if (!config.weeklySchedule?.timeZone) throw new Error("Schedule timezone is required");
    this.config = {
      weeklySchedule: {
        timeZone: config.weeklySchedule.timeZone,
        entries: [...config.weeklySchedule.entries],
      },
      datedSchedules: [...(config.datedSchedules ?? [])],
      scheduleVariants: [...(config.scheduleVariants ?? [])],
    };
  }

  resolve(input: Date | string = new Date()): ScheduleResolution {
    const { date, weekday, minuteOfDay } = localParts(input, this.config.weeklySchedule.timeZone);
    const candidates: Candidate[] = [];
    for (const [index, rule] of this.config.weeklySchedule.entries.entries()) {
      if (rule.weekday !== weekday) continue;
      candidates.push({
        resolution: fromEntry(rule, date),
        releaseMillis: releaseMillis(rule.releasedAt),
        id: `weekly-${index}`,
      });
    }
    const dated = [...(this.config.datedSchedules ?? []), ...(this.config.scheduleVariants ?? [])];
    for (const rule of dated) {
      const match = datedMatch(rule, date);
      if (!match) continue;
      candidates.push({
        resolution: {
          date,
          state: rule.state,
          openTime: rule.openTime,
          closeTime: rule.closeTime,
          sceneId: rule.sceneId,
          variantId: rule.variantId,
          source: match.source,
          ruleId: rule.id,
          priority: normalizePriority(rule.priority),
          specificity: match.specificity,
          releasedAt: rule.releasedAt,
        },
        releaseMillis: releaseMillis(rule.releasedAt),
        id: rule.id,
      });
    }
    candidates.sort((left, right) => {
      if (right.resolution.priority !== left.resolution.priority) return right.resolution.priority - left.resolution.priority;
      if (right.resolution.specificity !== left.resolution.specificity) return right.resolution.specificity - left.resolution.specificity;
      if (right.releaseMillis !== left.releaseMillis) return right.releaseMillis - left.releaseMillis;
      return left.id.localeCompare(right.id);
    });
    const resolution = candidates[0]?.resolution ?? {
      date,
      state: "closed",
      source: "weekly",
      priority: 0,
      specificity: 0,
    };
    return applyOpeningWindow(resolution, minuteOfDay);
  }
}

export function resolveSchedule(config: ScheduleResolverConfig, at: Date | string = new Date()): ScheduleResolution {
  return new ScheduleResolver(config).resolve(at);
}
