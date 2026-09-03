import type { Snapshot } from "@/lib/model";
import { getActiveSource } from "@/lib/sources";

/**
 * Caché en memoria del snapshot del CRM (por instancia). Evita golpear la API
 * de Kommo en cada carga de página; el TTL se controla con CACHE_TTL_SECONDS.
 * Si la fuente falla y hay un snapshot previo, se sirve el previo con el error.
 */

interface CacheEntry {
  snapshot: Snapshot;
  expiresAt: number;
}

interface CacheState {
  entry?: CacheEntry;
  inflight?: Promise<Snapshot>;
}

const state: CacheState = ((globalThis as { __dashboardCache?: CacheState }).__dashboardCache ??= {});

const ttlMs = () => (Number(process.env.CACHE_TTL_SECONDS) || 300) * 1000;

export interface SnapshotResult {
  snapshot: Snapshot;
  fromCache: boolean;
  /** Mensaje de error de la última consulta si se está sirviendo un snapshot viejo. */
  error?: string;
}

export async function getSnapshot(opts: { force?: boolean } = {}): Promise<SnapshotResult> {
  const now = Date.now();
  if (!opts.force && state.entry && state.entry.expiresAt > now) {
    return { snapshot: state.entry.snapshot, fromCache: true };
  }

  if (!state.inflight) {
    state.inflight = getActiveSource()
      .fetchSnapshot()
      .finally(() => {
        state.inflight = undefined;
      });
  }

  try {
    const snapshot = await state.inflight;
    state.entry = { snapshot, expiresAt: Date.now() + ttlMs() };
    return { snapshot, fromCache: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (state.entry) {
      return { snapshot: state.entry.snapshot, fromCache: true, error: message };
    }
    throw err;
  }
}

export function clearSnapshotCache(): void {
  state.entry = undefined;
}
