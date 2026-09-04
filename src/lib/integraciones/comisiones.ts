import { createPool, describeUrl } from "@/lib/db";
import { clasificar } from "@/lib/kenet/zonas";
import type { Snapshot, Venta } from "@/lib/model";
import type { Integracion } from "./index";
import { asesorPorNombre, construirIndices, leadPorNombre } from "./vinculos";

/**
 * Comisiones-ventas (repo rcc622/Comisiones-ventas): Supabase con tablas
 * `profiles` (vendedores) y `sales` (una fila por venta cerrada).
 * Solo lectura. Conexión: COMISIONES_DATABASE_URL (cadena Postgres de Supabase).
 */
const url = () => (process.env.COMISIONES_DATABASE_URL || "").trim();

interface Row {
  id: string;
  vendor_id: string | null;
  vendor_name: string | null;
  shared_vendor_name: string | null;
  client_name: string;
  zone: string | null;
  sale_month: string | null;
  contract_amount: string | number | null;
  commissionable_amount: string | number | null;
  panels: number | null;
  payment_method: string | null;
  origin: string | null;
  referred_by: string | null;
  hubspot_link: string | null;
  commission_paid: boolean | null;
  cancelled: boolean | null;
  created_at: Date | string;
  updated_at: Date | string | null;
}

const iso = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

async function columnas(pool: ReturnType<typeof createPool>, tabla: string): Promise<Set<string>> {
  const r = await pool.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
    [tabla],
  );
  return new Set(r.rows.map((x) => x.column_name));
}

export const comisionesIntegracion: Integracion = {
  id: "comisiones",
  label: "Comisiones (Supabase)",
  isConfigured: () => Boolean(url()),
  destino: () => (url() ? describeUrl(url()) : null),

  async fetch(snapshot: Snapshot) {
    const pool = createPool(url(), 2);
    try {
      const cols = await columnas(pool, "sales");
      if (!cols.size) throw new Error("no existe la tabla public.sales en esa base");
      const opt = (c: string, fallback: string) => (cols.has(c) ? `s.${c}` : fallback);
      const sql = `
        select s.id, s.vendor_id, v.full_name as vendor_name, sv.full_name as shared_vendor_name,
               s.client_name, s.zone, s.sale_month, s.contract_amount,
               ${opt("commissionable_amount", "null")} as commissionable_amount,
               ${opt("panels", "null")} as panels, ${opt("payment_method", "null")} as payment_method,
               ${opt("origin", "null")} as origin, ${opt("referred_by", "null")} as referred_by,
               ${opt("hubspot_link", "null")} as hubspot_link,
               ${opt("commission_paid", "false")} as commission_paid, ${opt("cancelled", "false")} as cancelled,
               s.created_at, ${opt("updated_at", "s.created_at")} as updated_at
        from public.sales s
        left join public.profiles v on v.id = s.vendor_id
        left join public.profiles sv on ${cols.has("shared_vendor_id") ? "sv.id = s.shared_vendor_id" : "false"}
        order by s.created_at desc
        limit 20000`;
      const r = await pool.query<Row>(sql);
      const idx = construirIndices(snapshot);
      let vinculados = 0;
      const ventas: Venta[] = r.rows.map((row) => {
        const [zona] = clasificar({ city: row.zone ?? "" });
        const lead = leadPorNombre(idx, row.client_name);
        const asesor = asesorPorNombre(idx, row.vendor_name);
        if (lead) vinculados += 1;
        return {
          id: String(row.id),
          cliente: row.client_name,
          vendedor: row.vendor_name,
          vendedorId: row.vendor_id ? String(row.vendor_id) : null,
          vendedorCompartido: row.shared_vendor_name,
          zonaTexto: row.zone,
          zona,
          mes: row.sale_month,
          montoContrato: Number(row.contract_amount) || 0,
          montoComisionable: Number(row.commissionable_amount) || 0,
          paneles: row.panels ?? null,
          metodoPago: row.payment_method,
          origen: row.origin,
          referidoPor: row.referred_by,
          hubspotLink: row.hubspot_link,
          comisionPagada: Boolean(row.commission_paid),
          cancelada: Boolean(row.cancelled),
          createdAt: iso(row.created_at) ?? new Date().toISOString(),
          updatedAt: iso(row.updated_at) ?? iso(row.created_at) ?? new Date().toISOString(),
          leadId: lead?.id ?? null,
          advisorId: asesor?.id ?? null,
        };
      });
      snapshot.ventas = ventas;
      return { registros: ventas.length, vinculados };
    } finally {
      await pool.end().catch(() => undefined);
    }
  },
};
