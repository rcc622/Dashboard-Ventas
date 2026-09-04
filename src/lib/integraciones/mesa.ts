import { createPool, describeUrl } from "@/lib/db";
import type { Proyecto, Snapshot } from "@/lib/model";
import { phoneKey } from "@/lib/sources/kommo";
import type { Integracion } from "./index";
import { asesorPorNombre, construirIndices } from "./vinculos";

/**
 * Mesa de Ayuda (repo rcc622/KS-MESA_AYUDA, front en Vercel, base en Supabase):
 * tabla `proyectos` (instalaciones) + `journey_etapas` + `tickets`.
 * Solo lectura. Conexión: MESA_AYUDA_DATABASE_URL (cadena Postgres de Supabase).
 */
const url = () => (process.env.MESA_AYUDA_DATABASE_URL || "").trim();

interface Row {
  id: string;
  folio: string;
  folio_odoo: string | null;
  cliente: string;
  telefono: string | null;
  correo_cliente: string | null;
  zona: string | null;
  estatus: string;
  etapa_actual: string | null;
  etapa_nombre: string | null;
  etapa_orden: number | null;
  etapa_desde: Date | string | null;
  fecha_agenda: Date | string | null;
  fecha_instalacion: Date | string | null;
  fecha_cierre: Date | string | null;
  paneles: number | null;
  kw: string | number | null;
  vendedor: string | null;
  origen: string | null;
  anticipo_pagado: boolean | null;
  instalado_cobrado: boolean | null;
  medidor_pagado: boolean | null;
  saldo_vencido: string | number | null;
  meses_atraso: number | null;
  proxima_fecha_pago: Date | string | null;
  tickets_abiertos: string | number | null;
  created_at: Date | string;
  updated_at: Date | string | null;
}

const iso = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Fechas DATE de Postgres → «YYYY-MM-DD» (sin hora, sin desfase de zona). */
const fecha = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

async function columnas(pool: ReturnType<typeof createPool>, tabla: string): Promise<Set<string>> {
  const r = await pool.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
    [tabla],
  );
  return new Set(r.rows.map((x) => x.column_name));
}

export const mesaIntegracion: Integracion = {
  id: "mesa",
  label: "Mesa de Ayuda (Supabase)",
  isConfigured: () => Boolean(url()),
  destino: () => (url() ? describeUrl(url()) : null),

  async fetch(snapshot: Snapshot) {
    const pool = createPool(url(), 2);
    try {
      const cols = await columnas(pool, "proyectos");
      if (!cols.size) throw new Error("no existe la tabla public.proyectos en esa base");
      const hayEtapas = (await columnas(pool, "journey_etapas")).size > 0 && cols.has("etapa_actual");
      const hayTickets = (await columnas(pool, "tickets")).has("proyecto_id");
      const opt = (c: string, fallback = "null") => (cols.has(c) ? `p.${c}` : fallback);
      const sql = `
        select p.id, p.folio, ${opt("folio_odoo")} as folio_odoo, p.cliente, ${opt("telefono")} as telefono,
               ${opt("correo_cliente")} as correo_cliente, ${opt("zona")} as zona, ${opt("estatus", "'agendado'")} as estatus,
               ${opt("etapa_actual")} as etapa_actual,
               ${hayEtapas ? "je.nombre" : "null"} as etapa_nombre, ${hayEtapas ? "je.orden" : "null"} as etapa_orden,
               ${opt("etapa_desde")} as etapa_desde, ${opt("fecha_agenda")} as fecha_agenda,
               ${opt("fecha_instalacion")} as fecha_instalacion, ${opt("fecha_cierre")} as fecha_cierre,
               ${opt("paneles")} as paneles, ${opt("kw")} as kw, ${opt("vendedor")} as vendedor, ${opt("origen")} as origen,
               ${opt("anticipo_pagado", "false")} as anticipo_pagado, ${opt("instalado_cobrado", "false")} as instalado_cobrado,
               ${opt("medidor_pagado", "false")} as medidor_pagado, ${opt("saldo_vencido", "0")} as saldo_vencido,
               ${opt("meses_atraso", "0")} as meses_atraso, ${opt("proxima_fecha_pago")} as proxima_fecha_pago,
               ${hayTickets ? "(select count(*) from public.tickets t where t.proyecto_id = p.id and t.estado in ('abierto','en_espera_cliente'))" : "0"} as tickets_abiertos,
               p.created_at, ${opt("updated_at", "p.created_at")} as updated_at
        from public.proyectos p
        ${hayEtapas ? "left join public.journey_etapas je on je.id = p.etapa_actual" : ""}
        order by p.created_at desc
        limit 20000`;
      const r = await pool.query<Row>(sql);
      const idx = construirIndices(snapshot);
      let vinculados = 0;
      const proyectos: Proyecto[] = r.rows.map((row) => {
        const key = phoneKey(row.telefono ?? undefined);
        const lead = key ? idx.leadPorTelefono.get(key) : undefined;
        const asesor = asesorPorNombre(idx, row.vendedor);
        if (lead) vinculados += 1;
        return {
          id: String(row.id),
          folio: row.folio,
          folioOdoo: row.folio_odoo,
          cliente: row.cliente,
          telefono: row.telefono,
          phoneKey: key,
          email: row.correo_cliente,
          zona: row.zona,
          estatus: row.estatus,
          etapaId: row.etapa_actual,
          etapa: row.etapa_nombre,
          etapaOrden: row.etapa_orden,
          etapaDesde: iso(row.etapa_desde),
          fechaAgenda: fecha(row.fecha_agenda),
          fechaInstalacion: fecha(row.fecha_instalacion),
          fechaCierre: fecha(row.fecha_cierre),
          paneles: row.paneles ?? null,
          kw: row.kw != null ? Number(row.kw) : null,
          vendedor: row.vendedor,
          origen: row.origen,
          anticipoPagado: Boolean(row.anticipo_pagado),
          instaladoCobrado: Boolean(row.instalado_cobrado),
          medidorPagado: Boolean(row.medidor_pagado),
          saldoVencido: Number(row.saldo_vencido) || 0,
          mesesAtraso: Number(row.meses_atraso) || 0,
          proximaFechaPago: fecha(row.proxima_fecha_pago),
          ticketsAbiertos: Number(row.tickets_abiertos) || 0,
          createdAt: iso(row.created_at) ?? new Date().toISOString(),
          updatedAt: iso(row.updated_at) ?? iso(row.created_at) ?? new Date().toISOString(),
          leadId: lead?.id ?? null,
          advisorId: asesor?.id ?? (lead?.advisorId ?? null),
        };
      });
      snapshot.proyectos = proyectos;
      return { registros: proyectos.length, vinculados };
    } finally {
      await pool.end().catch(() => undefined);
    }
  },
};
