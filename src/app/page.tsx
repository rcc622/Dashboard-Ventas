import Link from "next/link";
import { AdvisorTable } from "@/components/AdvisorTable";
import { AlertsList } from "@/components/AlertsList";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ChartCard } from "@/components/ChartCard";
import { RANGE_OPTIONS, RangeFilter } from "@/components/RangeFilter";
import { SourceBadge } from "@/components/SourceBadge";
import { StatTile, type Tone } from "@/components/StatTile";
import { SyncStatus } from "@/components/SyncStatus";
import { AdvisorRanking } from "@/components/charts/AdvisorRanking";
import { ChannelBars } from "@/components/charts/ChannelBars";
import { FunnelBars } from "@/components/charts/FunnelBars";
import { WeeklyTrend } from "@/components/charts/WeeklyTrend";
import { getSnapshot, type SnapshotResult } from "@/lib/cache";
import { fmtCompactMoney, fmtDays, fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import { computeMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const REFRESH_MS = 5 * 60_000;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function countTone(n: number): Tone {
  if (n === 0) return "good";
  if (n >= 10) return "serious";
  return "warning";
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted">{text}</p>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-xl border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold text-text">No se pudo leer la fuente de datos</h1>
        <p className="mt-2 break-words text-sm text-text-2">{message}</p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Revisa KOMMO_SUBDOMAIN y KOMMO_ACCESS_TOKEN en las variables del servicio.</li>
          <li>El token debe ser de una integración privada con permiso de lectura de leads.</li>
          <li>Quita esas variables para volver al modo demo.</li>
        </ul>
      </div>
    </main>
  );
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requested = Number(params.dias);
  const days = (RANGE_OPTIONS as readonly number[]).includes(requested) ? requested : 30;
  const staleDays = Number(process.env.DASHBOARD_STALE_DAYS) || 3;

  let result: SnapshotResult;
  try {
    result = await getSnapshot({ force: params.refresh === "1" });
  } catch (err) {
    return <ErrorState message={err instanceof Error ? err.message : String(err)} />;
  }

  const { snapshot } = result;
  const m = computeMetrics(snapshot, { days, staleDays });
  const t = m.totals;
  const notices = [...snapshot.warnings, ...(result.error ? [`Última lectura falló: ${result.error}. Se muestran datos previos.`] : [])];

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <AutoRefresh everyMs={REFRESH_MS} />

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Dashboard de ventas</p>
          <h1 className="text-2xl font-semibold text-text">Control de asesores</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge snapshot={snapshot} fromCache={result.fromCache} />
          <RangeFilter days={days} />
          <Link
            href={`/?dias=${days}&refresh=1`}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-2 hover:text-text"
          >
            ↻ Actualizar
          </Link>
        </div>
      </header>

      <div className="mb-4">
        <SyncStatus />
      </div>

      {notices.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-surface px-4 py-2 text-xs text-text-2">
          {notices.map((n, i) => (
            <p key={i}>
              <span className="font-semibold text-warning">
                <span aria-hidden>!</span> Aviso
              </span>{" "}
              · {n}
            </p>
          ))}
        </div>
      )}

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
        <StatTile hero label={`Ganado en ${days} días`} value={fmtMoney(t.wonValue)} hint={`${fmtInt(t.won)} cierres`} />
        <StatTile label="Leads nuevos" value={fmtInt(t.newLeads)} hint={`últimos ${days} días`} />
        <StatTile label="Pipeline abierto" value={fmtCompactMoney(t.openValue)} hint={`${fmtInt(t.openLeads)} leads`} />
        <StatTile label="Conversión" value={fmtPct(t.conversion)} hint={`${fmtInt(t.won)} ganados · ${fmtInt(t.lost)} perdidos`} />
        <StatTile label="Sin atención" value={fmtInt(t.staleLeads)} tone={countTone(t.staleLeads)} hint={`≥${staleDays} días sin mov.`} />
        <StatTile label="Tareas vencidas" value={fmtInt(t.overdueTasks)} tone={countTone(t.overdueTasks)} hint="abiertas" />
      </section>

      <section aria-label="Gráficos" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          title="Ranking de asesores"
          subtitle={`Valor ganado en los últimos ${days} días · promedio de cierre ${fmtDays(t.avgDaysToClose)}`}
          table={{
            columns: ["Asesor", "Valor ganado", "Cierres", "Conversión"],
            rows: m.advisors.map((a) => [a.name, fmtMoney(a.wonValue), a.won, fmtPct(a.conversion)]),
          }}
        >
          {m.advisors.length ? (
            <AdvisorRanking
              rows={m.advisors.map((a) => ({ name: a.name, wonValue: a.wonValue, won: a.won, conversion: a.conversion }))}
            />
          ) : (
            <EmptyState text="Sin cierres en el periodo." />
          )}
        </ChartCard>

        <ChartCard className="lg:col-span-5" title="Alertas" subtitle="Leads sin atención y tareas vencidas, por severidad">
          <AlertsList alerts={m.alerts} />
        </ChartCard>

        <ChartCard
          className="lg:col-span-3"
          title={`Embudo · ${m.funnel.pipelineName}`}
          subtitle="Leads abiertos por etapa (hoy)"
          table={{
            columns: ["Etapa", "Leads", "Valor"],
            rows: m.funnel.rows.map((r) => [r.name, r.count, fmtMoney(r.value)]),
          }}
        >
          {m.funnel.rows.length ? <FunnelBars rows={m.funnel.rows} /> : <EmptyState text="Sin pipeline con etapas abiertas." />}
        </ChartCard>

        <ChartCard
          className="lg:col-span-6"
          title="Tendencia semanal"
          subtitle="Leads nuevos, ganados y perdidos por semana · la última semana está en curso"
          table={{
            columns: ["Semana", "Nuevos", "Ganados", "Perdidos"],
            rows: m.weekly.map((w) => [w.label, w.nuevos, w.ganados, w.perdidos]),
          }}
        >
          <WeeklyTrend rows={m.weekly} />
        </ChartCard>

        <ChartCard
          className="lg:col-span-3"
          title="Leads por canal"
          subtitle={`Canal de entrada de los leads nuevos (utm / origen) · ${days} días`}
          table={{
            columns: ["Canal", "Leads", "Ganados"],
            rows: m.channels.map((c) => [c.name, c.leads, c.won]),
          }}
        >
          {m.channels.length ? <ChannelBars rows={m.channels} /> : <EmptyState text="Sin leads nuevos en el periodo." />}
        </ChartCard>

        <ChartCard className="lg:col-span-12" title="Detalle por asesor" subtitle="Ordenado por valor ganado en el periodo">
          <AdvisorTable rows={m.advisors} staleDays={staleDays} />
        </ChartCard>
      </section>

      <footer className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>Fuente: {snapshot.sourceLabel}</span>
        <span>API JSON: /api/snapshot?dias={days}</span>
        <span>Exportes: /api/export/leads.csv · /api/export/actividades.csv</span>
        <span>Sincronía: /api/sync/status</span>
        <span>Salud: /api/health</span>
      </footer>
    </main>
  );
}
