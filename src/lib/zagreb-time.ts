// Sve vrijeme u aplikaciji je Europe/Zagreb. Realno vrijeme, 2026+.
export const TZ = "Europe/Zagreb";

export function nowZagreb(): Date {
  return new Date();
}

export function formatZagreb(d: Date = nowZagreb()): string {
  return new Intl.DateTimeFormat("hr-HR", {
    timeZone: TZ,
    dateStyle: "full",
    timeStyle: "medium",
  }).format(d);
}

export function formatZagrebShort(d: Date = nowZagreb()): string {
  return new Intl.DateTimeFormat("hr-HR", {
    timeZone: TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function isoDateZagreb(d: Date = nowZagreb()): string {
  // YYYY-MM-DD u zagrebačkoj vremenskoj zoni
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const da = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${da}`;
}