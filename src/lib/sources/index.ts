import type { DataSource } from "@/lib/model";
import { kommoSource } from "./kommo";
import { mockSource } from "./mock";

/**
 * Registro de fuentes. Orden = prioridad: la primera fuente configurada gana.
 * Para agregar una fuente nueva: crea `src/lib/sources/<nombre>.ts` que
 * implemente `DataSource` y agrégala aquí antes de `mockSource`.
 */
export const sources: DataSource[] = [kommoSource, mockSource];

export function getActiveSource(): DataSource {
  return sources.find((s) => s.isConfigured()) ?? mockSource;
}
