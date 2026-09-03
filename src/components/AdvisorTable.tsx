import type { AdvisorMetrics } from "@/lib/metrics";
import { fmtCompactMoney, fmtDays, fmtInt, fmtPct, fmtRelative } from "@/lib/format";

function Flag({ n, severeAt, label }: { n: number; severeAt: number; label: string }) {
  if (n === 0) return <span className="text-muted">0</span>;
  const severe = n >= severeAt;
  return (
    <span className={`font-semibold ${severe ? "text-serious" : "text-warning"}`} title={`${n} ${label}`}>
      <span aria-hidden>{severe ? "▲" : "!"}</span> {n}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

export function AdvisorTable({ rows, staleDays }: { rows: AdvisorMetrics[]; staleDays: number }) {
  const now = Date.now();
  const th = "whitespace-nowrap px-2 py-2 text-right text-xs font-medium text-muted";
  const td = "whitespace-nowrap px-2 py-2 text-right tabular-nums text-text-2";

  if (rows.length === 0) {
    return <p className="text-sm text-muted">Sin asesores con actividad en el periodo.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={`${th} text-left`}>Asesor</th>
            <th className={th}>Nuevos</th>
            <th className={th}>Abiertos</th>
            <th className={th}>Pipeline</th>
            <th className={th}>Ganados</th>
            <th className={th}>Valor ganado</th>
            <th className={th}>Perdidos</th>
            <th className={th}>Conv.</th>
            <th className={th}>Sin mov. ≥{staleDays}d</th>
            <th className={th}>Tareas venc.</th>
            <th className={th}>Días a cierre</th>
            <th className={th}>Últ. actividad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.advisorId} className="border-b border-border last:border-0 hover:bg-surface-2">
              <td className="whitespace-nowrap px-2 py-2 text-left text-text">
                {r.name}
                {!r.active && <span className="ml-1 text-xs text-muted">(inactivo)</span>}
              </td>
              <td className={td}>{fmtInt(r.newLeads)}</td>
              <td className={td}>{fmtInt(r.openLeads)}</td>
              <td className={td}>{fmtCompactMoney(r.openValue)}</td>
              <td className={td}>{fmtInt(r.won)}</td>
              <td className={`${td} font-semibold text-text`}>{fmtCompactMoney(r.wonValue)}</td>
              <td className={td}>{fmtInt(r.lost)}</td>
              <td className={td}>{fmtPct(r.conversion)}</td>
              <td className={td}>
                <Flag n={r.staleLeads} severeAt={3} label="leads sin atención" />
              </td>
              <td className={td}>
                <Flag n={r.overdueTasks} severeAt={3} label="tareas vencidas" />
              </td>
              <td className={td}>{fmtDays(r.avgDaysToClose)}</td>
              <td className={td}>{fmtRelative(r.lastActivityAt, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
