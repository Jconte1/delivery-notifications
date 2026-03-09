const DENVER_TZ = "America/Denver";

export function getDenverParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DENVER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export function hasReachedTime(now: Date, targetHour: number, targetMinute: number) {
  const parts = getDenverParts(now);
  if (parts.hour > targetHour) return true;
  if (parts.hour < targetHour) return false;
  return parts.minute >= targetMinute;
}
