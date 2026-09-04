const LOCALE = "es-MX";
const TZ = process.env.DASHBOARD_TZ || "America/Monterrey";

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}

/** $1.2M · $340K · $850 */
export function fmtCompactMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export function fmtInt(n: number): string {
  return new Intl.NumberFormat(LOCALE).format(n);
}

export function fmtPct(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}

export function fmtDays(d: number | null): string {
  return d === null ? "—" : `${d.toFixed(1)} d`;
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

export function fmtRelative(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "—";
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (mins < 0) {
    const ahead = -mins;
    return ahead < 60 ? `en ${ahead} min` : `en ${Math.round(ahead / 60)} h`;
  }
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}
