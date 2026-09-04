import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/cache";
import { computeMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * Métricas en JSON (mismas que la página) para consumirlas desde otros lados,
 * por ejemplo Google Sheets / Apps Script o un reporte semanal.
 *
 * Query: ?dias=30 · ?refresh=1 (ignora caché) · ?full=1 (incluye el snapshot normalizado)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("dias")) || 30));
  const staleDays = Number(process.env.DASHBOARD_STALE_DAYS) || 3;
  const force = url.searchParams.get("refresh") === "1";
  const full = url.searchParams.get("full") === "1";

  try {
    const result = await getSnapshot({ force });
    const metrics = computeMetrics(result.snapshot, { days, staleDays });
    return NextResponse.json({
      ok: true,
      source: result.snapshot.source,
      demo: result.snapshot.demo,
      fetchedAt: result.snapshot.fetchedAt,
      fromCache: result.fromCache,
      error: result.error ?? null,
      warnings: result.snapshot.warnings,
      metrics,
      snapshot: full ? result.snapshot : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
