import type { TravelEmail, TravelPlanSummary } from "@homeos/shared";

const monthPattern = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Match dates in the message itself, never the timestamp when it arrived.
// Yearless dates are interpreted in the trip's year(s). Matching is computed
// on read so existing mail and newly created trips work without backfilling.
export function emailMatchesTrip(email: TravelEmail, trip: Pick<TravelPlanSummary, "startDate" | "endDate">): boolean {
  const body = email.text?.trim() || (email.html ?? "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#(?:8211|8212);|&(?:ndash|mdash);/gi, "–");
  const content = `${email.subject}\n${body}`
    .split(/\r?\n/).filter((line) => !/^\s*>?\s*(?:sent|date):/i.test(line)).join("\n");
  const firstYear = Number(trip.startDate.slice(0, 4));
  const lastYear = Number(trip.endDate.slice(0, 4));
  const matches = (month: number, day: number, year?: string) => {
    const years = year ? [Number(year)] : Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
    return years.some((value) => {
      const date = `${value}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const parsed = new Date(`${date}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && date >= trip.startDate && date <= trip.endDate;
    });
  };

  for (const date of content.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    if (matches(Number(date[2]), Number(date[3]), date[1])) return true;
  }
  // Numeric dates use month/day/year; require a year to avoid matching times
  // and booking reference numbers such as 10/12.
  for (const date of content.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    if (matches(Number(date[1]), Number(date[2]), date[3])) return true;
  }
  const monthFirst = new RegExp(`\\b(${monthPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–—]\\s*(\\d{1,2})(?:st|nd|rd|th)?)?(?:,?\\s+(\\d{4}))?\\b`, "gi");
  for (const date of content.matchAll(monthFirst)) {
    const month = months.indexOf(date[1].slice(0, 3).toLowerCase()) + 1;
    const start = Number(date[2]), end = Number(date[3] ?? date[2]);
    if (end > 31 || end < start) continue;
    for (let day = start; day <= end; day++) {
      if (matches(month, day, date[4])) return true;
    }
  }
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})\\.?(?:,?\\s+(\\d{4}))?\\b`, "gi");
  for (const date of content.matchAll(dayFirst)) {
    if (matches(months.indexOf(date[2].slice(0, 3).toLowerCase()) + 1, Number(date[1]), date[3])) return true;
  }
  return false;
}
