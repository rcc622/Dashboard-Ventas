"use client";

export interface TooltipRow {
  label: string;
  value: string;
  /** Color de la serie: se dibuja como una línea corta junto a la etiqueta. */
  color?: string;
}

interface PayloadItem<T> {
  payload?: T;
}

export interface ChartTooltipProps<T> {
  /** Inyectados por Recharts. */
  active?: boolean;
  payload?: ReadonlyArray<PayloadItem<T>>;
  label?: string | number;
  /** Definidos por cada gráfico. */
  title?: (datum: T) => string;
  rows: (datum: T) => TooltipRow[];
}

/** Tooltip común: el valor manda (fuerte), la etiqueta acompaña (muted). */
export function ChartTooltip<T>({ active, payload, label, title, rows }: ChartTooltipProps<T>) {
  const datum = payload?.[0]?.payload;
  if (!active || datum === undefined) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium text-text">{title ? title(datum) : String(label ?? "")}</div>
      {rows(datum).map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-muted">
            {row.color && (
              <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: row.color }} />
            )}
            {row.label}
          </span>
          <span className="font-semibold tabular-nums text-text">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
