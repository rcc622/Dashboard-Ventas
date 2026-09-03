import type { ReactNode } from "react";

export interface TableSpec {
  columns: string[];
  rows: Array<Array<string | number>>;
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Vista de tabla equivalente al gráfico (accesibilidad / lectura exacta). */
  table?: TableSpec;
  className?: string;
}

export function ChartCard({ title, subtitle, children, table, className = "" }: ChartCardProps) {
  return (
    <figure className={`rounded-xl border border-border bg-surface p-5 ${className}`}>
      <figcaption className="mb-4">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </figcaption>
      {children}
      {table && table.rows.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer select-none text-muted hover:text-text-2">Ver tabla</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left tabular-nums">
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} className="py-1 pr-3 font-medium text-muted">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    {row.map((cell, j) => (
                      <td key={j} className="py-1 pr-3 text-text-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}
