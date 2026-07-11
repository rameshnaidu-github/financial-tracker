export function formatINR(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2
  }).format(paise / 100);
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
