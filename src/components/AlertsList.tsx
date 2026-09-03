import type { Alert, Severity } from "@/lib/metrics";

const SEVERITY: Record<Severity, { className: string; icon: string; label: string }> = {
  critical: { className: "text-critical", icon: "■", label: "Crítico" },
  serious: { className: "text-serious", icon: "▲", label: "Serio" },
  warning: { className: "text-warning", icon: "!", label: "Atención" },
};

export function AlertsList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <p className="text-sm text-text-2">
        <span className="font-semibold text-good">
          <span aria-hidden>●</span> Al día
        </span>{" "}
        · sin leads olvidados ni tareas vencidas.
      </p>
    );
  }
  return (
    <ul className="max-h-[380px] divide-y divide-border overflow-y-auto pr-1">
      {alerts.map((a, i) => {
        const sev = SEVERITY[a.severity];
        return (
          <li key={`${a.kind}-${i}`} className="flex gap-3 py-2 text-sm">
            <span className={`${sev.className} w-16 shrink-0 pt-0.5 text-xs font-semibold`}>
              <span aria-hidden>{sev.icon}</span> {sev.label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-text">
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {a.title}
                  </a>
                ) : (
                  a.title
                )}
              </div>
              <div className="truncate text-xs text-muted">
                {a.kind === "stale" ? "Lead sin atención" : "Tarea vencida"} · {a.detail} · {a.advisorName}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
