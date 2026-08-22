import "server-only";

import { find } from "geo-tz";

export function timeZoneAt(latitude: number, longitude: number) {
  try {
    const timeZone = find(latitude, longitude)[0];
    if (!timeZone) return "Etc/UTC";
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "Etc/UTC";
  }
}
