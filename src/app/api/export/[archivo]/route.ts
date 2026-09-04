import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/cache";
import { tablaActividades, tablaLeads, toCsv, type Tabla } from "@/lib/export";

export const dynamic = "force-dynamic";

/**
 * Exportes planos del snapshot sincronizado:
 *   /api/export/leads.csv · /api/export/leads.json
 *   /api/export/actividades.csv · /api/export/actividades.json
 * Las primeras columnas coinciden con Leads_Data / Eventos_Data del Sheet.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ archivo: string }> }) {
  const { archivo } = await ctx.params;
  const [tipo, ext = "json"] = archivo.split(".");
  let result;
  try {
    result = await getSnapshot();
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }

  let tabla: Tabla;
  if (tipo === "leads") tabla = tablaLeads(result.snapshot);
  else if (tipo === "actividades") tabla = tablaActividades(result.snapshot);
  else return NextResponse.json({ ok: false, error: "Exporte desconocido. Usa leads o actividades (.csv o .json)." }, { status: 404 });

  if (ext === "csv") {
    return new NextResponse(toCsv(tabla), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `inline; filename="${tipo}.csv"`,
        "cache-control": "no-store",
      },
    });
  }
  const objetos = tabla.rows.map((r) => Object.fromEntries(tabla.columns.map((c, i) => [c, r[i]])));
  return NextResponse.json({ ok: true, fetchedAt: result.snapshot.fetchedAt, source: result.snapshot.source, total: objetos.length, rows: objetos });
}
