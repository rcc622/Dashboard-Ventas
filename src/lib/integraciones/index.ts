import type { IntegracionEstado, IntegracionId, Snapshot } from "@/lib/model";
import { comisionesIntegracion } from "./comisiones";
import { mesaIntegracion } from "./mesa";

/**
 * Integraciones de solo lectura sobre otras plataformas de Kenet (Supabase):
 * cada una lee su base, normaliza y vincula contra los leads/asesores del
 * snapshot. Fallan aisladas: un error deja los datos previos y queda en el estado.
 */
export interface Integracion {
  id: IntegracionId;
  label: string;
  isConfigured(): boolean;
  destino(): string | null;
  /** Devuelve los registros normalizados y cuántos quedaron vinculados a Kommo. */
  fetch(snapshot: Snapshot): Promise<{ registros: number; vinculados: number }>;
}

export const integraciones: Integracion[] = [comisionesIntegracion, mesaIntegracion];

export function estadoInicial(i: Integracion): IntegracionEstado {
  return {
    id: i.id,
    label: i.label,
    configurada: i.isConfigured(),
    ok: null,
    syncedAt: null,
    error: null,
    registros: 0,
    vinculados: 0,
    destino: i.destino(),
  };
}

/** Corre todas las integraciones configuradas sobre el snapshot (lo muta). */
export async function syncIntegraciones(snapshot: Snapshot, prev: Snapshot | null): Promise<void> {
  snapshot.integraciones ??= {};
  for (const i of integraciones) {
    const estado = estadoInicial(i);
    if (!i.isConfigured()) {
      snapshot.integraciones[i.id] = estado;
      continue;
    }
    try {
      const r = await i.fetch(snapshot);
      snapshot.integraciones[i.id] = { ...estado, ok: true, syncedAt: new Date().toISOString(), registros: r.registros, vinculados: r.vinculados };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Se conservan los datos previos de esa integración.
      if (i.id === "comisiones") snapshot.ventas = prev?.ventas ?? [];
      if (i.id === "mesa") snapshot.proyectos = prev?.proyectos ?? [];
      const previo = prev?.integraciones?.[i.id];
      snapshot.integraciones[i.id] = {
        ...estado,
        ok: false,
        syncedAt: previo?.syncedAt ?? null,
        error: message,
        registros: previo?.registros ?? 0,
        vinculados: previo?.vinculados ?? 0,
      };
      snapshot.warnings.push(`${i.label}: ${message}`);
      console.log(`[sync] integración ${i.id} falló: ${message}`);
    }
  }
}
