export type DateRange = { start: string; end: string; timezone: string };
export function previousLocalDay(
  admittedAt: string,
  timezone: string,
): DateRange {
  const admitted = Date.parse(admittedAt);
  if (!Number.isFinite(admitted)) throw new Error("INVALID_ADMITTED_TIME");
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateKey = (time: number): string => {
    const parts = format.formatToParts(time);
    const part = (key: string) => parts.find((p) => p.type === key)!.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  const today = dateKey(admitted);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
  const midnight = (day: string) => {
    const center = Date.parse(`${day}T00:00:00Z`);
    let low = center - 36 * 3600000,
      high = center + 36 * 3600000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (dateKey(middle) < day) low = middle + 1;
      else high = middle;
    }
    if (dateKey(low) !== day) throw new Error("NONEXISTENT_LOCAL_DATE");
    return new Date(low).toISOString();
  };
  return { start: midnight(yesterday), end: midnight(today), timezone };
}
