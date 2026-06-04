export type FormatDateInput = Date | number | string;

const dateFormatterOptions = {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  year: "numeric"
} as const satisfies Intl.DateTimeFormatOptions;

export function formatDate(input: FormatDateInput): string {
  const date = toValidDate(input);
  const parts = new Intl.DateTimeFormat("en-US", dateFormatterOptions).formatToParts(
    date
  );

  const month = getPart(parts, "month");
  const day = getPart(parts, "day");
  const year = getPart(parts, "year");
  const hour = getPart(parts, "hour");
  const minute = getPart(parts, "minute");
  const dayPeriod = getPart(parts, "dayPeriod");

  return `${month} ${day}, ${year} at ${hour}:${minute} ${dayPeriod}`;
}

function toValidDate(input: FormatDateInput): Date {
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid date input.");
  }

  return date;
}

function getPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  const part = parts.find((candidate) => candidate.type === type);

  if (part === undefined) {
    throw new RangeError(`Date formatter did not produce ${type}.`);
  }

  return part.value;
}
