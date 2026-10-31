export function formatINR(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2
  }).format(paise / 100);
}

/** Headline figures: rounded to the nearest rupee, never showing paise. Rows keep formatINR. */
export function formatINRWhole(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Math.round(paise / 100));
}

const ONE_LAKH_PAISE = 1_00_000 * 100;
const ONE_CRORE_PAISE = 1_00_00_000 * 100;

/**
 * Headline tiles only: Indian short scale from a lakh upward, so a figure fits its tile at
 * every width instead of being cut off. Anything under a lakh stays an exact rupee figure.
 * This rounds to two decimals, so every caller must keep the precise amount reachable — the
 * tile puts it in `title` and in the visually-hidden label a screen reader announces.
 */
export function formatINRCompact(paise: number) {
  const absolute = Math.abs(paise);
  if (absolute < ONE_LAKH_PAISE) return formatINRWhole(paise);
  const sign = paise < 0 ? "-" : "";
  // Rounded before the unit is chosen, so 99.999 lakh reads as ₹1.00 Cr, never ₹100.00 L.
  const crore = absolute / ONE_CRORE_PAISE;
  if (Number(crore.toFixed(2)) >= 1) return `${sign}₹${crore.toFixed(2)} Cr`;
  return `${sign}₹${(absolute / ONE_LAKH_PAISE).toFixed(2)} L`;
}

export function parseAmountToPaise(value: string) {
  const normalized = value.replace(/[₹,\s]/g, "");
  if (!normalized) return 0;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

export function signedAmount(paise: number, direction: "inflow" | "outflow") {
  return `${direction === "inflow" ? "+" : "-"}${formatINR(paise)}`;
}

export function todayISO() {
  return localISODate(new Date());
}

export function currentMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * A year and a month number, as the one string shape the server accepts.
 *
 * The server's schema is /^\d{4}-(0[1-9]|1[0-2])$/, so "2026-9" is rejected and "2026-09" is not.
 * A free-text month field let a person type the first and find out afterwards; composing the value
 * here instead means the short form cannot be expressed at all.
 */
export function monthValue(year: number, month: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** The inverse, for setting two dropdowns from one stored value. */
export function splitMonth(value: string) {
  const match = /^(\d{4})-(\d{1,2})$/.exec(value);
  const today = new Date();
  if (!match) return { year: today.getFullYear(), month: today.getMonth() + 1 };
  const year = Number(match[1]);
  const month = Math.min(12, Math.max(1, Number(match[2])));
  return { year, month };
}

/** The twelve months, in order, labelled the way they are read. */
export const MONTH_CHOICES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
].map((label, index) => ({ value: index + 1, label }));

/**
 * The years worth offering.
 *
 * Five back for history that is still being entered, one forward for planning, and whatever year
 * is already selected even if it falls outside that -- a stored month must always be choosable, or
 * opening the page would silently move somebody's budget to another year.
 */
export function yearChoices(selected: number, today = new Date()) {
  const now = today.getFullYear();
  const years = new Set<number>();
  for (let y = now - 5; y <= now + 1; y += 1) years.add(y);
  years.add(selected);
  return [...years].sort((a, b) => b - a);
}

export function mondayWeekRange(date = new Date()) {
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);
  const day = current.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(current);
  start.setDate(current.getDate() + diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    weekStart: localISODate(start),
    weekEnd: localISODate(end),
    label: `${formatShortDate(start)} - ${formatShortDate(end)}`
  };
}

function localISODate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

export function formatShortDate(dateLike: string | Date) {
  const date = typeof dateLike === "string" ? new Date(`${dateLike}T00:00:00`) : dateLike;
  return date.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric"
  });
}

export function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric"
  });
}
