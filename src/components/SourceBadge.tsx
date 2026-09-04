import type { Snapshot } from "@/lib/model";
import { fmtDateTime, fmtRelative } from "@/lib/format";

export function SourceBadge({ snapshot, fromCache }: { snapshot: Snapshot; fromCache: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs">
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full ${snapshot.demo ? "bg-warning" : "bg-good"}`}
      />
      <span className="font-medium text-text">{snapshot.demo ? "Demo" : snapshot.sourceLabel}</span>
      {!snapshot.demo && snapshot.account?.name && <span className="text-muted">· {snapshot.account.name}</span>}
      <span className="text-muted" title={`Datos leídos: ${fmtDateTime(snapshot.fetchedAt)}`}>
        · {fmtRelative(snapshot.fetchedAt)}
        {fromCache ? " (caché)" : ""}
      </span>
    </div>
  );
}
