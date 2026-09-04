import type { Lead, Snapshot } from "@/lib/model";

/**
 * Cálculo de métricas a partir de un Snapshot normalizado.
 * Puro y sin dependencias de UI: se usa en la página y en /api/snapshot.
 */

export interface MetricsOptions {
  /** Ventana de análisis en días (leads nuevos, ganados, perdidos). */
  days: number;
  /** Días sin movimiento para marcar un lead abierto como "sin atención". */
  staleDays: number;
  now?: Date;
}

export interface Totals {
  newLeads: number;
  won: number;
  wonValue: number;
  lost: number;
  lostValue: number;
  openLeads: number;
  openValue: number;
  conversion: number | null;
  staleLeads: number;
  overdueTasks: number;
  avgDaysToClose: number | null;
}

export interface AdvisorMetrics {
  advisorId: string;
  name: string;
  active: boolean;
  vendedor: boolean;
  zona: string | null;
  newLeads: number;
  openLeads: number;
  openValue: number;
  won: number;
  wonValue: number;
  lost: number;
  conversion: number | null;
  staleLeads: number;
  overdueTasks: number;
  avgDaysToClose: number | null;
  lastActivityAt: string | null;
}

export interface FunnelRow {
  stageId: string;
  name: string;
  order: number;
  count: number;
  value: number;
}

export interface WeekPoint {
  weekStart: string;
  label: string;
  nuevos: number;
  ganados: number;
  perdidos: number;
}

export interface ChannelRow {
  name: string;
  leads: number;
  won: number;
}

export interface ZonaRow {
  zona: string;
  leads: number;
  won: number;
  wonValue: number;
}

export type Severity = "warning" | "serious" | "critical";

export interface Alert {
  kind: "stale" | "overdue";
  severity: Severity;
  title: string;
  detail: string;
  advisorName: string;
  ageDays: number;
  url?: string;
}

export interface Metrics {
  range: { days: number; from: string; to: string; staleDays: number };
  totals: Totals;
  advisors: AdvisorMetrics[];
  funnel: { pipelineName: string; rows: FunnelRow[] };
  weekly: WeekPoint[];
  channels: ChannelRow[];
  zonas: ZonaRow[];
  alerts: Alert[];
}

const DAY_MS = 86_400_000;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);

/** Fecha de cierre; si el CRM no la registró, usa la última actualización. */
const closedTime = (lead: Lead): number => {
  const t = ms(lead.closedAt);
  return Number.isFinite(t) ? t : ms(lead.updatedAt);
};

const sumValue = (leads: Lead[]): number => leads.reduce((acc, l) => acc + l.value, 0);

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

const conversion = (won: number, lost: number): number | null =>
  won + lost > 0 ? won / (won + lost) : null;

const daysToClose = (leads: Lead[]): number[] =>
  leads
    .map((l) => (closedTime(l) - ms(l.createdAt)) / DAY_MS)
    .filter((d) => Number.isFinite(d) && d >= 0);

/** Lunes 00:00 UTC de la semana que contiene `t`. */
function startOfWeek(t: number): number {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.getTime();
}

export function computeMetrics(snapshot: Snapshot, opts: MetricsOptions): Metrics {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const fromMs = nowMs - opts.days * DAY_MS;
  const staleMs = opts.staleDays * DAY_MS;

  const advisorById = new Map(snapshot.advisors.map((a) => [a.id, a]));
  const nameOf = (id: string | null): string => (id && advisorById.get(id)?.name) || "Sin asignar";

  const stageNames = new Map<string, string>();
  for (const p of snapshot.pipelines) {
    for (const s of p.stages) stageNames.set(`${p.id}:${s.id}`, s.name);
  }

  const inRange = (t: number): boolean => t >= fromMs && t <= nowMs + DAY_MS;

  const openLeads = snapshot.leads.filter((l) => l.status === "open");
  const wonInRange = snapshot.leads.filter((l) => l.status === "won" && inRange(closedTime(l)));
  const lostInRange = snapshot.leads.filter((l) => l.status === "lost" && inRange(closedTime(l)));
  const newInRange = snapshot.leads.filter((l) => inRange(ms(l.createdAt)));
  const staleLeads = openLeads.filter((l) => nowMs - ms(l.updatedAt) >= staleMs);
  const overdueTasks = snapshot.tasks.filter((t) => !t.completed && ms(t.dueAt) < nowMs);

  const totals: Totals = {
    newLeads: newInRange.length,
    won: wonInRange.length,
    wonValue: sumValue(wonInRange),
    lost: lostInRange.length,
    lostValue: sumValue(lostInRange),
    openLeads: openLeads.length,
    openValue: sumValue(openLeads),
    conversion: conversion(wonInRange.length, lostInRange.length),
    staleLeads: staleLeads.length,
    overdueTasks: overdueTasks.length,
    avgDaysToClose: mean(daysToClose(wonInRange)),
  };

  // --- Por asesor -----------------------------------------------------------
  const advisorIds = new Set<string>(snapshot.advisors.map((a) => a.id));
  for (const l of snapshot.leads) if (l.advisorId) advisorIds.add(l.advisorId);

  const advisors: AdvisorMetrics[] = [...advisorIds]
    .map((id) => {
      const mine = (leads: Lead[]) => leads.filter((l) => l.advisorId === id);
      const myOpen = mine(openLeads);
      const myWon = mine(wonInRange);
      const myLost = mine(lostInRange);

      let lastActivity = NaN;
      for (const l of snapshot.leads) {
        if (l.advisorId !== id) continue;
        const t = ms(l.updatedAt);
        if (Number.isFinite(t) && !(t <= lastActivity)) lastActivity = t;
      }

      const info = advisorById.get(id);
      return {
        advisorId: id,
        name: nameOf(id),
        active: info?.active ?? true,
        vendedor: info?.vendedor ?? true,
        zona: info?.zona ?? null,
        newLeads: mine(newInRange).length,
        openLeads: myOpen.length,
        openValue: sumValue(myOpen),
        won: myWon.length,
        wonValue: sumValue(myWon),
        lost: myLost.length,
        conversion: conversion(myWon.length, myLost.length),
        staleLeads: mine(staleLeads).length,
        overdueTasks: overdueTasks.filter((t) => t.advisorId === id).length,
        avgDaysToClose: mean(daysToClose(myWon)),
        lastActivityAt: Number.isFinite(lastActivity) ? new Date(lastActivity).toISOString() : null,
      };
    })
    // Admins / sistema (no vendedores) e inactivos solo aparecen si tienen movimiento.
    .filter((a) => (a.active && a.vendedor) || a.newLeads + a.openLeads + a.won + a.lost > 0)
    .sort(
      (a, b) =>
        b.wonValue - a.wonValue || b.won - a.won || b.newLeads - a.newLeads || a.name.localeCompare(b.name, "es"),
    );

  // --- Embudo del pipeline principal ---------------------------------------
  const mainPipeline =
    snapshot.pipelines.find((p) => p.isMain && !p.isArchived) ??
    snapshot.pipelines.find((p) => !p.isArchived) ??
    snapshot.pipelines[0];

  const funnelRows: FunnelRow[] = mainPipeline
    ? mainPipeline.stages
        .filter((s) => s.kind === "open" || s.kind === "unsorted")
        .map((s) => {
          const inStage = openLeads.filter((l) => l.pipelineId === mainPipeline.id && l.stageId === s.id);
          return { stageId: s.id, name: s.name, order: s.order, count: inStage.length, value: sumValue(inStage) };
        })
        .filter((row) => row.count > 0 || mainPipeline.stages.find((s) => s.id === row.stageId)?.kind === "open")
        .sort((a, b) => a.order - b.order)
    : [];

  // --- Tendencia semanal ---------------------------------------------------
  const weeks = Math.max(4, Math.ceil(opts.days / 7));
  const thisWeek = startOfWeek(nowMs);
  const buckets = new Map<number, WeekPoint>();
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = thisWeek - i * 7 * DAY_MS;
    const d = new Date(ws);
    buckets.set(ws, {
      weekStart: d.toISOString(),
      label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
      nuevos: 0,
      ganados: 0,
      perdidos: 0,
    });
  }
  const bump = (t: number, key: "nuevos" | "ganados" | "perdidos") => {
    if (!Number.isFinite(t)) return;
    const bucket = buckets.get(startOfWeek(t));
    if (bucket) bucket[key] += 1;
  };
  for (const l of snapshot.leads) {
    bump(ms(l.createdAt), "nuevos");
    if (l.status === "won") bump(closedTime(l), "ganados");
    if (l.status === "lost") bump(closedTime(l), "perdidos");
  }

  // --- Leads por canal (en la ventana) -------------------------------------
  const byChannel = new Map<string, ChannelRow>();
  for (const l of newInRange) {
    const key = l.canal;
    const row = byChannel.get(key) ?? { name: key, leads: 0, won: 0 };
    row.leads += 1;
    if (l.status === "won") row.won += 1;
    byChannel.set(key, row);
  }
  let channels = [...byChannel.values()].sort((a, b) => b.leads - a.leads);
  if (channels.length > 8) {
    const tail = channels.slice(7);
    channels = [
      ...channels.slice(0, 7),
      {
        name: "Otros",
        leads: tail.reduce((acc, c) => acc + c.leads, 0),
        won: tail.reduce((acc, c) => acc + c.won, 0),
      },
    ];
  }

  // --- Leads y ventas por zona (zona efectiva: ciudad del contacto, si no la del asesor) ---
  const byZona = new Map<string, ZonaRow>();
  const zonaKey = (l: Lead) => l.zonaEfectiva ?? (l.zona === "SIN_DATO" ? "Sin zona" : l.zona);
  for (const l of newInRange) {
    const key = zonaKey(l);
    const row = byZona.get(key) ?? { zona: key, leads: 0, won: 0, wonValue: 0 };
    row.leads += 1;
    byZona.set(key, row);
  }
  for (const l of wonInRange) {
    const key = zonaKey(l);
    const row = byZona.get(key) ?? { zona: key, leads: 0, won: 0, wonValue: 0 };
    row.won += 1;
    row.wonValue += l.value;
    byZona.set(key, row);
  }
  const zonas = [...byZona.values()].sort((a, b) => b.leads - a.leads);

  // --- Alertas -------------------------------------------------------------
  const staleSeverity = (days: number): Severity =>
    days >= opts.staleDays * 4 ? "critical" : days >= opts.staleDays * 2 ? "serious" : "warning";
  const overdueSeverity = (days: number): Severity => (days >= 7 ? "critical" : days >= 3 ? "serious" : "warning");
  const leadById = new Map(snapshot.leads.map((l) => [l.id, l]));

  const alerts: Alert[] = [
    ...staleLeads.map((l): Alert => {
      const age = Math.floor((nowMs - ms(l.updatedAt)) / DAY_MS);
      const stage = stageNames.get(`${l.pipelineId}:${l.stageId}`) ?? "etapa desconocida";
      return {
        kind: "stale",
        severity: staleSeverity(age),
        title: l.name,
        detail: `${age} días sin movimiento · ${stage}`,
        advisorName: nameOf(l.advisorId),
        ageDays: age,
        url: l.url,
      };
    }),
    ...overdueTasks.map((t): Alert => {
      const age = Math.max(1, Math.ceil((nowMs - ms(t.dueAt)) / DAY_MS));
      const lead = t.leadId ? leadById.get(t.leadId) : undefined;
      return {
        kind: "overdue",
        severity: overdueSeverity(age),
        title: t.text?.trim() || "Tarea sin descripción",
        detail: `${age} ${age === 1 ? "día" : "días"} de retraso${lead ? ` · ${lead.name}` : ""}`,
        advisorName: nameOf(t.advisorId),
        ageDays: age,
        url: lead?.url,
      };
    }),
  ];
  const severityRank: Record<Severity, number> = { critical: 0, serious: 1, warning: 2 };
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.ageDays - a.ageDays);

  return {
    range: {
      days: opts.days,
      from: new Date(fromMs).toISOString(),
      to: now.toISOString(),
      staleDays: opts.staleDays,
    },
    totals,
    advisors,
    funnel: { pipelineName: mainPipeline?.name ?? "—", rows: funnelRows },
    weekly: [...buckets.values()],
    channels,
    zonas,
    alerts: alerts.slice(0, 25),
  };
}
