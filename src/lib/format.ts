const IST_DATETIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const IST_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * Formats an ISO timestamp or pre-formatted string in Asia/Kolkata timezone:
 * Example: "04-Nov-2026 09:15:12 IST"
 */
export function formatISTDateTime(
  value: string | null | undefined,
  preformatted?: string | null
): string {
  if (preformatted && preformatted.trim().length > 0) {
    return preformatted;
  }
  if (!value || value.trim().length === 0) {
    return "—";
  }
  if (value.endsWith("IST")) {
    return value;
  }
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return value;
  }
  const parts = IST_DATETIME_FORMATTER.formatToParts(parsed);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}:${get("second")} IST`;
}

/**
 * Formats a YYYY-MM-DD date string as "04-Nov-2026".
 */
export function formatISTDate(value: string | null | undefined): string {
  if (!value || value.trim().length === 0) {
    return "—";
  }
  const clean = value.slice(0, 10);
  const parsed = new Date(`${clean}T09:15:00+05:30`);
  if (isNaN(parsed.getTime())) {
    return value;
  }
  const parts = IST_DATE_FORMATTER.formatToParts(parsed);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

/**
 * Formats a number in Indian numbering system with ₹ symbol.
 */
export function formatINRCurrency(
  value: number | null | undefined,
  decimals = 2,
  showSign = false
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "—";
  }
  const sign = value > 0 && showSign ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}₹${formatted}`;
}

/**
 * Formats points with explicit + / - sign.
 */
export function formatSignedPoints(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} pts`;
}

