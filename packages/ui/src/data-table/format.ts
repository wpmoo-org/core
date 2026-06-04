export type FormatDateInput = Date | number | string;
export type FormatNumberInput = number;
export type FormatMoneyOptions = Readonly<{
  currency: string;
  fractionDigits?: number;
}>;

const dateFormatterOptions = {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  year: "numeric"
} as const satisfies Intl.DateTimeFormatOptions;

const NUMBER_LOCALE = "en-US";
const numberFormatterOptions = {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  useGrouping: true
} as const satisfies Intl.NumberFormatOptions;

export function formatDate(input: FormatDateInput): string {
  const date = toValidDate(input);
  const parts = new Intl.DateTimeFormat(
    NUMBER_LOCALE,
    dateFormatterOptions
  ).formatToParts(date);

  const month = getPart(parts, "month");
  const day = getPart(parts, "day");
  const year = getPart(parts, "year");
  const hour = getPart(parts, "hour");
  const minute = getPart(parts, "minute");
  const dayPeriod = getPart(parts, "dayPeriod");

  return `${month} ${day}, ${year} at ${hour}:${minute} ${dayPeriod}`;
}

export function formatNumber(input: FormatNumberInput): string {
  assertFiniteNumber(input, "number");

  return joinParts(
    new Intl.NumberFormat(NUMBER_LOCALE, numberFormatterOptions).formatToParts(
      input
    )
  );
}

export function formatMoney(
  amountMinor: number,
  options: FormatMoneyOptions
): string {
  assertInteger(amountMinor, "amountMinor");

  const fractionDigits = options.fractionDigits ?? 2;
  const majorAmount = amountMinor / 10 ** fractionDigits;

  return joinParts(
    new Intl.NumberFormat(NUMBER_LOCALE, {
      currency: options.currency,
      currencyDisplay: "symbol",
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
      style: "currency",
      useGrouping: true
    }).formatToParts(majorAmount)
  );
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

function joinParts(parts: Intl.NumberFormatPart[]): string {
  return parts.map((part) => part.value).join("");
}

function assertFiniteNumber(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number.`);
  }
}

function assertInteger(value: number, label: string) {
  assertFiniteNumber(value, label);

  if (!Number.isInteger(value)) {
    throw new RangeError(`${label} must be an integer minor-unit amount.`);
  }
}
