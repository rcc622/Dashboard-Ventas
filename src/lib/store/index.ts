import type { Snapshot, SyncRun } from "@/lib/model";
import { FileStore } from "./file";
import { PostgresStore } from "./postgres";

/**
 * Persistencia del snapshot sincronizado.
 *
 *  - DATABASE_URL definido → Postgres (Railway Postgres o Supabase). Deja las
 *    tablas crm_* listas para que otras integraciones (mesa de ayuda, comisiones)
 *    lean el CRM por SQL.
 *  - Si no → archivos JSON en DASH_DATA (volumen de Railway, igual que
 *    mkt-dashboard) o DATA_DIR; default ./data.
 */
export interface SnapshotStore {
  readonly kind: "file" | "postgres";
  describe(): string;
  load(): Promise<Snapshot | null>;
  save(snapshot: Snapshot): Promise<void>;
  appendRun(run: SyncRun): Promise<void>;
  recentRuns(limit: number): Promise<SyncRun[]>;
}

const g = globalThis as { __dashboardStore?: SnapshotStore };

export function getStore(): SnapshotStore {
  if (g.__dashboardStore) return g.__dashboardStore;
  const url = process.env.DATABASE_URL?.trim();
  g.__dashboardStore = url ? new PostgresStore(url) : new FileStore(dataDir());
  return g.__dashboardStore;
}

export function dataDir(): string {
  return process.env.DASH_DATA?.trim() || process.env.DATA_DIR?.trim() || "./data";
}
