import type { Snapshot } from "@/lib/model";
import { currentSnapshot, getStatus, runSync } from "@/lib/sync/engine";

/**
 * Acceso al snapshot para la página y las rutas. El motor de sincronía
 * (src/lib/sync) mantiene el snapshot en memoria y lo persiste; aquí solo se
 * lee, o se fuerza una incremental cuando el usuario pide «Actualizar».
 */
export interface SnapshotResult {
  snapshot: Snapshot;
  fromCache: boolean;
  /** Mensaje de error de la última corrida si se está sirviendo un snapshot viejo. */
  error?: string;
}

export async function getSnapshot(opts: { force?: boolean } = {}): Promise<SnapshotResult> {
  if (opts.force) {
    const run = await runSync("incremental", "manual");
    const snapshot = await currentSnapshot();
    if (!snapshot) throw new Error(run.error ?? "Sin datos: la sincronía no ha terminado.");
    return { snapshot, fromCache: !run.ok, error: run.ok ? undefined : (run.error ?? undefined) };
  }
  const snapshot = await currentSnapshot();
  if (!snapshot) {
    const status = getStatus();
    throw new Error(status.lastError ?? "Sin datos: la primera sincronía no ha terminado.");
  }
  const status = getStatus();
  return { snapshot, fromCache: true, error: status.lastError ?? undefined };
}
