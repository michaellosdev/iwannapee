"use client";

import { Clock3, Moon, Sun } from "lucide-react";
import {
  WEEKDAYS,
  type HoursSchedule,
  type HoursScheduleMode,
  type WeeklyHoursPeriod,
} from "@/lib/hours";

type WeeklyHoursEditorProps = {
  allowUnknown?: boolean;
  onChange: (schedule: HoursSchedule) => void;
  value: HoursSchedule;
};

function dayPeriod(schedule: HoursSchedule, weekday: number) {
  return schedule.periods.find((period) => period.weekday === weekday);
}

export function WeeklyHoursEditor({ allowUnknown = true, onChange, value }: WeeklyHoursEditorProps) {
  function setMode(mode: HoursScheduleMode) {
    onChange({ mode, periods: mode === "scheduled" ? value.periods : [] });
  }

  function toggleDay(weekday: number) {
    const existing = dayPeriod(value, weekday);
    const periods = existing
      ? value.periods.filter((period) => period.weekday !== weekday)
      : [...value.periods, { weekday, opensAt: "09:00", closesAt: "17:00" }];
    onChange({ mode: "scheduled", periods });
  }

  function updatePeriod(weekday: number, field: "opensAt" | "closesAt", nextValue: string) {
    const periods = value.periods.map((period): WeeklyHoursPeriod =>
      period.weekday === weekday ? { ...period, [field]: nextValue } : period,
    );
    onChange({ mode: "scheduled", periods });
  }

  return (
    <div className="weekly-hours-editor">
      <div className="hours-mode-picker" role="group" aria-label="Restroom hours format">
        <button aria-pressed={value.mode === "scheduled"} className={value.mode === "scheduled" ? "active" : ""} onClick={() => setMode("scheduled")} type="button">
          <Clock3 size={15} /> Weekly hours
        </button>
        <button aria-pressed={value.mode === "always_open"} className={value.mode === "always_open" ? "active" : ""} onClick={() => setMode("always_open")} type="button">
          <Sun size={15} /> Open 24 hours
        </button>
        {allowUnknown && (
          <button aria-pressed={value.mode === "unknown"} className={value.mode === "unknown" ? "active" : ""} onClick={() => setMode("unknown")} type="button">
            <Moon size={15} /> Not confirmed
          </button>
        )}
      </div>

      {value.mode === "scheduled" && (
        <div className="weekly-hours-days">
          {WEEKDAYS.map((day) => {
            const period = dayPeriod(value, day.value);
            const overnight = Boolean(period && period.closesAt < period.opensAt);
            return (
              <div className={period ? "weekly-hours-day open" : "weekly-hours-day"} key={day.value}>
                <label>
                  <input checked={Boolean(period)} onChange={() => toggleDay(day.value)} type="checkbox" />
                  <span>{day.short}</span>
                </label>
                {period ? (
                  <div className="weekly-hours-times">
                    <input aria-label={`${day.label} opening time`} onChange={(event) => updatePeriod(day.value, "opensAt", event.target.value)} type="time" value={period.opensAt} />
                    <span>to</span>
                    <input aria-label={`${day.label} closing time`} onChange={(event) => updatePeriod(day.value, "closesAt", event.target.value)} type="time" value={period.closesAt} />
                    {overnight && <small>next day</small>}
                  </div>
                ) : <small>Closed</small>}
              </div>
            );
          })}
        </div>
      )}
      <p className="hours-editor-note">Opening status uses the restroom’s local timezone. Closing earlier than opening means the restroom closes the next day.</p>
    </div>
  );
}
