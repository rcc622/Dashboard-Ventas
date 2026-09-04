import Link from "next/link";

export const RANGE_OPTIONS = [7, 30, 90, 180] as const;

export function RangeFilter({ days }: { days: number }) {
  return (
    <nav aria-label="Rango de fechas" className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 text-xs">
      {RANGE_OPTIONS.map((d) => {
        const active = d === days;
        return (
          <Link
            key={d}
            href={`/?dias=${d}`}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text-2"
            }`}
          >
            {active ? "✓ " : ""}
            {d} días
          </Link>
        );
      })}
    </nav>
  );
}
