export function enumerateDates(startDate: string, endDate: string) {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);

  if (end < start) {
    throw new Error("End date must be on or after start date");
  }

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(formatISODate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function parseISODate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || formatISODate(date) !== value) {
    throw new Error("Expected date in YYYY-MM-DD format");
  }
  return date;
}

function formatISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

