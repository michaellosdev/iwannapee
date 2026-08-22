export const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
] as const;

export type HoursScheduleMode = "unknown" | "always_open" | "scheduled";

export type WeeklyHoursPeriod = {
  weekday: number;
  opensAt: string;
  closesAt: string;
};

export type HoursSchedule = {
  mode: HoursScheduleMode;
  periods: WeeklyHoursPeriod[];
};

export class InvalidHoursSchedule extends Error {}

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function createHoursSchedule(mode: HoursScheduleMode = "unknown"): HoursSchedule {
  return { mode, periods: [] };
}

export function normalizeHoursSchedule(value: unknown, allowUnknown = true): HoursSchedule {
  if (!value || typeof value !== "object") throw new InvalidHoursSchedule("Choose the restroom hours.");
  const input = value as { mode?: unknown; periods?: unknown };
  if (!(["unknown", "always_open", "scheduled"] as unknown[]).includes(input.mode)) {
    throw new InvalidHoursSchedule("Choose a valid hours option.");
  }

  const mode = input.mode as HoursScheduleMode;
  if (mode === "unknown") {
    if (!allowUnknown) throw new InvalidHoursSchedule("Add the hours when this restroom is available.");
    return createHoursSchedule("unknown");
  }
  if (mode === "always_open") return createHoursSchedule("always_open");
  if (!Array.isArray(input.periods)) throw new InvalidHoursSchedule("Add at least one open day.");

  const periods = input.periods.map((period) => {
    if (!period || typeof period !== "object") throw new InvalidHoursSchedule("Check the weekly hours.");
    const candidate = period as { weekday?: unknown; opensAt?: unknown; closesAt?: unknown };
    const weekday = Number(candidate.weekday);
    const opensAt = typeof candidate.opensAt === "string" ? candidate.opensAt : "";
    const closesAt = typeof candidate.closesAt === "string" ? candidate.closesAt : "";
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !timePattern.test(opensAt) || !timePattern.test(closesAt) || opensAt === closesAt) {
      throw new InvalidHoursSchedule("Check the opening and closing times.");
    }
    return { weekday, opensAt, closesAt };
  });

  const uniqueDays = new Set(periods.map((period) => period.weekday));
  if (periods.length === 0) throw new InvalidHoursSchedule("Choose at least one open day.");
  if (periods.length > 7 || uniqueDays.size !== periods.length) {
    throw new InvalidHoursSchedule("Add one opening period per day.");
  }

  return {
    mode: "scheduled",
    periods: periods.sort((first, second) => {
      const firstIndex = WEEKDAYS.findIndex((day) => day.value === first.weekday);
      const secondIndex = WEEKDAYS.findIndex((day) => day.value === second.weekday);
      return firstIndex - secondIndex;
    }),
  };
}

function formatClock(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${suffix}`;
}

function periodLabel(periods: WeeklyHoursPeriod[]) {
  return periods.map((period) => {
    const overnight = period.closesAt < period.opensAt;
    return `${formatClock(period.opensAt)}–${formatClock(period.closesAt)}${overnight ? " next day" : ""}`;
  }).join(", ");
}

export function formatHoursSchedule(schedule: HoursSchedule) {
  if (schedule.mode === "always_open") return "Open 24 hours";
  if (schedule.mode === "unknown") return "Hours not yet verified";

  const byDay = new Map<number, WeeklyHoursPeriod[]>();
  for (const period of schedule.periods) {
    byDay.set(period.weekday, [...(byDay.get(period.weekday) || []), period]);
  }

  const groups: Array<{ first: string; last: string; hours: string }> = [];
  for (const day of WEEKDAYS) {
    const dayPeriods = byDay.get(day.value);
    if (!dayPeriods) continue;
    const hours = periodLabel(dayPeriods);
    const previous = groups.at(-1);
    if (previous?.hours === hours) previous.last = day.short;
    else groups.push({ first: day.short, last: day.short, hours });
  }

  return groups.map((group) => `${group.first === group.last ? group.first : `${group.first}–${group.last}`} ${group.hours}`).join(" · ");
}
