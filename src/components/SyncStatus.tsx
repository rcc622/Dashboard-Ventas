import { fmtRelative } from "@/lib/format";
import { getStatus } from "@/lib/sync/engine";

/** Línea de estado de la sincronía (server component). */
export function SyncStatus() {
  const s = getStatus();
  const running = s.running ? `corriendo ${s.running.mode} (${s.running.reason})` : null;
  const tone = s.lastError ? "text-serious" : s.stale ? "text-warning" : "text-good";
  const icon = s.lastError ? "▲" : s.stale ? "!" : "●";
  const label = s.lastError ? "Error" : s.stale ? "Desfasada" : "Al día";
  return (
    <p className="text-xs text-muted">
      <span className={`${tone} font-semibold`}>
        <span aria-hidden>{icon}</span> Sincronía {label}
      </span>
      {" · "}
      {s.demo ? "modo demo" : `${s.source} · incremental cada ${s.intervalMin} min · completa cada ${s.refreshHours} h`}
      {" · última "}
      {fmtRelative(s.lastSuccessAt)}
      {s.nextIncrementalAt && !s.demo ? ` · próxima ${fmtRelative(s.nextIncrementalAt).replace("hace", "en")}` : ""}
      {running ? ` · ${running}` : ""}
      {" · "}
      {s.store}
      {s.lastError ? ` · ${s.lastError}` : ""}
      {s.integraciones
        .filter((i) => i.configurada)
        .map((i) => (
          <span key={i.id}>
            {" · "}
            <span className={i.ok === false ? "text-serious" : "text-text-2"}>
              {i.label}: {i.ok === false ? `error (${i.error})` : `${i.registros} registros, ${i.vinculados} ligados a Kommo`}
            </span>
          </span>
        ))}
    </p>
  );
}
