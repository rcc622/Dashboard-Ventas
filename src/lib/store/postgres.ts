import type { Pool, PoolClient } from "pg";
import { createPool, describeUrl } from "@/lib/db";
import type { Snapshot, SyncRun } from "@/lib/model";
import type { SnapshotStore } from "./index";

/**
 * Postgres: el snapshot completo se guarda en `crm_snapshot` (JSONB) para
 * recargarlo al arrancar, y además se vuelcan tablas relacionales `crm_*` para
 * que otros sistemas (mesa de ayuda, comisiones, reportes) consulten el CRM
 * por SQL sin pasar por Kommo.
 */
const SCHEMA = `
create table if not exists crm_snapshot (
  id int primary key default 1 check (id = 1),
  source text not null,
  fetched_at timestamptz not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists crm_advisors (
  id text primary key, name text, email text, active boolean, vendedor boolean, zona text, grupo text,
  synced_at timestamptz not null default now()
);
create table if not exists crm_pipelines (
  id text primary key, name text, is_main boolean, is_archived boolean, stages jsonb,
  synced_at timestamptz not null default now()
);
create table if not exists crm_contacts (
  id text primary key, name text, phone text, phone_key text, email text, ciudad text, interes text,
  advisor_id text, ultima_asignacion_at timestamptz, updated_at timestamptz,
  synced_at timestamptz not null default now()
);
create table if not exists crm_leads (
  id text primary key, name text, value numeric, advisor_id text, advisor text,
  pipeline_id text, pipeline text, stage_id text, stage text, status text,
  canal text, origen text, zona text, zona_efectiva text, ciudad text, phone_key text, contact_id text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text, ad_id text,
  source_id text, interes text, recibo boolean, ia_activa boolean, intentos_llamada int, msgs_cliente int,
  cotizacion_at timestamptz, levantamiento_at timestamptz, ultima_asignacion_at timestamptz,
  created_at timestamptz, updated_at timestamptz, closed_at timestamptz, loss_reason text,
  tags text[], url text, synced_at timestamptz not null default now()
);
create table if not exists crm_tasks (
  id text primary key, advisor_id text, lead_id text, text text, due_at timestamptz, completed boolean,
  task_type_id text, updated_at timestamptz, synced_at timestamptz not null default now()
);
create table if not exists crm_activities (
  id text primary key, ts timestamptz, tipo text, advisor_id text, lead_id text, pipeline_id text,
  synced_at timestamptz not null default now()
);
create table if not exists ext_ventas (
  id text primary key, cliente text, vendedor text, vendedor_id text, vendedor_compartido text, zona_texto text, zona text,
  mes text, monto_contrato numeric, monto_comisionable numeric, paneles int, metodo_pago text, origen text, referido_por text,
  hubspot_link text, comision_pagada boolean, cancelada boolean, lead_id text, advisor_id text,
  created_at timestamptz, updated_at timestamptz, synced_at timestamptz not null default now()
);
create table if not exists ext_proyectos (
  id text primary key, folio text, folio_odoo text, cliente text, telefono text, phone_key text, email text, zona text,
  estatus text, etapa_id text, etapa text, etapa_orden int, etapa_desde timestamptz, fecha_agenda date, fecha_instalacion date,
  fecha_cierre date, paneles int, kw numeric, vendedor text, origen text, anticipo_pagado boolean, instalado_cobrado boolean,
  medidor_pagado boolean, saldo_vencido numeric, meses_atraso int, proxima_fecha_pago date, tickets_abiertos int,
  lead_id text, advisor_id text, created_at timestamptz, updated_at timestamptz, synced_at timestamptz not null default now()
);
create table if not exists sync_runs (
  id text primary key, mode text, reason text, source text, started_at timestamptz, finished_at timestamptz,
  ok boolean, duration_ms int, requests int, counts jsonb, error text
);
create index if not exists crm_leads_advisor_idx on crm_leads (advisor_id);
create index if not exists crm_leads_created_idx on crm_leads (created_at);
create index if not exists crm_activities_ts_idx on crm_activities (ts);
`;

type Row = ReadonlyArray<unknown>;

async function replaceRows(client: PoolClient, table: string, columns: string[], rows: Row[]): Promise<void> {
  await client.query(`delete from ${table}`);
  const chunk = Math.max(1, Math.floor(30_000 / columns.length));
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const placeholders = row.map((v) => {
        values.push(v);
        return `$${values.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await client.query(`insert into ${table} (${columns.join(",")}) values ${tuples.join(",")}`, values);
  }
}

export class PostgresStore implements SnapshotStore {
  readonly kind = "postgres" as const;
  private readonly pool: Pool;
  private ready: Promise<void> | null = null;

  constructor(private readonly url: string) {
    this.pool = createPool(url, 4);
  }

  describe(): string {
    return `postgres en ${describeUrl(this.url)}`;
  }

  private ensure(): Promise<void> {
    if (!this.ready) this.ready = this.pool.query(SCHEMA).then(() => undefined);
    return this.ready;
  }

  async load(): Promise<Snapshot | null> {
    await this.ensure();
    const res = await this.pool.query<{ data: Snapshot }>("select data from crm_snapshot where id = 1");
    return res.rows[0]?.data ?? null;
  }

  async save(snapshot: Snapshot): Promise<void> {
    await this.ensure();
    const advisorName = new Map(snapshot.advisors.map((a) => [a.id, a.name]));
    const pipelineName = new Map(snapshot.pipelines.map((p) => [p.id, p.name]));
    const stageName = new Map<string, string>();
    for (const p of snapshot.pipelines) for (const s of p.stages) stageName.set(`${p.id}:${s.id}`, s.name);

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into crm_snapshot (id, source, fetched_at, data, updated_at) values (1, $1, $2, $3, now())
         on conflict (id) do update set source = excluded.source, fetched_at = excluded.fetched_at,
         data = excluded.data, updated_at = now()`,
        [snapshot.source, snapshot.fetchedAt, JSON.stringify(snapshot)],
      );
      await replaceRows(
        client,
        "crm_advisors",
        ["id", "name", "email", "active", "vendedor", "zona", "grupo"],
        snapshot.advisors.map((a) => [a.id, a.name, a.email ?? null, a.active, a.vendedor, a.zona, a.grupo ?? null]),
      );
      await replaceRows(
        client,
        "crm_pipelines",
        ["id", "name", "is_main", "is_archived", "stages"],
        snapshot.pipelines.map((p) => [p.id, p.name, p.isMain, p.isArchived, JSON.stringify(p.stages)]),
      );
      await replaceRows(
        client,
        "crm_contacts",
        ["id", "name", "phone", "phone_key", "email", "ciudad", "interes", "advisor_id", "ultima_asignacion_at", "updated_at"],
        snapshot.contacts.map((c) => [
          c.id, c.name, c.phone ?? null, c.phoneKey ?? null, c.email ?? null, c.ciudad ?? null, c.interes ?? null,
          c.advisorId, c.ultimaAsignacionAt, c.updatedAt,
        ]),
      );
      await replaceRows(
        client,
        "crm_leads",
        [
          "id", "name", "value", "advisor_id", "advisor", "pipeline_id", "pipeline", "stage_id", "stage", "status",
          "canal", "origen", "zona", "zona_efectiva", "ciudad", "phone_key", "contact_id",
          "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ad_id",
          "source_id", "interes", "recibo", "ia_activa", "intentos_llamada", "msgs_cliente",
          "cotizacion_at", "levantamiento_at", "ultima_asignacion_at",
          "created_at", "updated_at", "closed_at", "loss_reason", "tags", "url",
        ],
        snapshot.leads.map((l) => [
          l.id, l.name, l.value, l.advisorId, l.advisorId ? (advisorName.get(l.advisorId) ?? null) : null,
          l.pipelineId, pipelineName.get(l.pipelineId) ?? null, l.stageId, stageName.get(`${l.pipelineId}:${l.stageId}`) ?? null, l.status,
          l.canal, l.origen ?? null, l.zona, l.zonaEfectiva, l.ciudad ?? null, l.phoneKey ?? null, l.contactId,
          l.utm.source ?? null, l.utm.medium ?? null, l.utm.campaign ?? null, l.utm.content ?? null, l.utm.term ?? null, l.adId ?? null,
          l.sourceId != null ? String(l.sourceId) : null, l.interes ?? null, l.reciboRecibido, l.iaActiva ?? null, l.intentosLlamada, l.msgsCliente,
          l.cotizacionEntregadaAt, l.levantamientoAt, l.ultimaAsignacionAt,
          l.createdAt, l.updatedAt, l.closedAt, l.lossReason ?? null, l.tags, l.url ?? null,
        ]),
      );
      await replaceRows(
        client,
        "crm_tasks",
        ["id", "advisor_id", "lead_id", "text", "due_at", "completed", "task_type_id", "updated_at"],
        snapshot.tasks.map((t) => [t.id, t.advisorId, t.leadId, t.text, t.dueAt, t.completed, t.taskTypeId ?? null, t.updatedAt ?? null]),
      );
      await replaceRows(
        client,
        "ext_ventas",
        [
          "id", "cliente", "vendedor", "vendedor_id", "vendedor_compartido", "zona_texto", "zona", "mes", "monto_contrato",
          "monto_comisionable", "paneles", "metodo_pago", "origen", "referido_por", "hubspot_link", "comision_pagada", "cancelada",
          "lead_id", "advisor_id", "created_at", "updated_at",
        ],
        (snapshot.ventas ?? []).map((v) => [
          v.id, v.cliente, v.vendedor, v.vendedorId, v.vendedorCompartido, v.zonaTexto, v.zona, v.mes, v.montoContrato,
          v.montoComisionable, v.paneles, v.metodoPago, v.origen, v.referidoPor, v.hubspotLink, v.comisionPagada, v.cancelada,
          v.leadId, v.advisorId, v.createdAt, v.updatedAt,
        ]),
      );
      await replaceRows(
        client,
        "ext_proyectos",
        [
          "id", "folio", "folio_odoo", "cliente", "telefono", "phone_key", "email", "zona", "estatus", "etapa_id", "etapa",
          "etapa_orden", "etapa_desde", "fecha_agenda", "fecha_instalacion", "fecha_cierre", "paneles", "kw", "vendedor", "origen",
          "anticipo_pagado", "instalado_cobrado", "medidor_pagado", "saldo_vencido", "meses_atraso", "proxima_fecha_pago",
          "tickets_abiertos", "lead_id", "advisor_id", "created_at", "updated_at",
        ],
        (snapshot.proyectos ?? []).map((p) => [
          p.id, p.folio, p.folioOdoo, p.cliente, p.telefono, p.phoneKey ?? null, p.email, p.zona, p.estatus, p.etapaId, p.etapa,
          p.etapaOrden, p.etapaDesde, p.fechaAgenda, p.fechaInstalacion, p.fechaCierre, p.paneles, p.kw, p.vendedor, p.origen,
          p.anticipoPagado, p.instaladoCobrado, p.medidorPagado, p.saldoVencido, p.mesesAtraso, p.proximaFechaPago,
          p.ticketsAbiertos, p.leadId, p.advisorId, p.createdAt, p.updatedAt,
        ]),
      );
      await replaceRows(
        client,
        "crm_activities",
        ["id", "ts", "tipo", "advisor_id", "lead_id", "pipeline_id"],
        snapshot.activities.map((a) => [a.id, a.ts, a.tipo, a.advisorId, a.leadId, a.pipelineId ?? null]),
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async appendRun(run: SyncRun): Promise<void> {
    await this.ensure();
    await this.pool.query(
      `insert into sync_runs (id, mode, reason, source, started_at, finished_at, ok, duration_ms, requests, counts, error)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (id) do update set finished_at = excluded.finished_at, ok = excluded.ok,
       duration_ms = excluded.duration_ms, requests = excluded.requests, counts = excluded.counts, error = excluded.error`,
      [run.id, run.mode, run.reason, run.source, run.startedAt, run.finishedAt, run.ok, run.durationMs, run.requests, JSON.stringify(run.counts), run.error],
    );
  }

  async recentRuns(limit: number): Promise<SyncRun[]> {
    await this.ensure();
    const res = await this.pool.query(
      `select id, mode, reason, source, started_at, finished_at, ok, duration_ms, requests, counts, error
       from sync_runs order by started_at desc limit $1`,
      [limit],
    );
    return res.rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      reason: r.reason,
      source: r.source,
      startedAt: new Date(r.started_at).toISOString(),
      finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
      ok: r.ok,
      durationMs: r.duration_ms,
      requests: r.requests ?? 0,
      counts: r.counts ?? {},
      error: r.error,
    }));
  }
}
