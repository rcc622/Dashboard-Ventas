import { KENET } from "@/lib/kenet/ids";
import type { Activity, Lead, Snapshot, Task } from "@/lib/model";

/**
 * Exportes planos para otros consumidores (Google Sheets, reportes, otras
 * integraciones). Las primeras columnas de cada tabla son las mismas que
 * Leads_Data / Eventos_Data del dashboard de Sheets (dashboard_leads_kenet.gs),
 * para que el cambio de fuente no rompa fórmulas.
 */

const TZ = process.env.DASHBOARD_TZ || "America/Monterrey";
const DAY_MS = 86_400_000;

const fmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO → «2026-09-03 14:05» en la zona horaria del negocio; vacío si no hay fecha. */
export function fechaLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? fmt.format(new Date(t)).replace("T", " ") : "";
}

export type Row = Array<string | number>;

export interface Tabla {
  columns: string[];
  rows: Row[];
}

function esPrimerContacto(t: Task): boolean {
  return t.taskTypeId === String(KENET.taskTypes.primerContacto) || /primer contacto/i.test(t.text || "");
}

/** Mismo «Estado funnel» que el Sheet: 0·Perdido … 5·Ganado. */
export function estadoFunnel(l: Lead, pipelineName: string, stageName: string): string {
  if (l.status === "won") return "5·Ganado";
  if (l.status === "lost") return "0·Perdido";
  const pid = Number(l.pipelineId);
  const enVentas = pid === KENET.pipelines.ventas || pid === KENET.pipelines.hunting || /ventas|hunting/i.test(pipelineName);
  if (enVentas) return "4·Asignado (en Ventas/Hunting)";
  if (l.reciboRecibido) return "3·Con recibo (pre-Ventas)";
  const enEntrantes = Number(l.stageId) === KENET.stages.cadenciaEntrantes || /entrantes|incoming/i.test(stageName);
  const respondio = l.msgsCliente > 0 || (!enEntrantes && pid !== KENET.pipelines.leadsNuevos);
  return respondio ? "2·Respondió SIN recibo" : "1·No contestó (sin recibo)";
}

export function tablaLeads(s: Snapshot, now: Date = new Date()): Tabla {
  const nowMs = now.getTime();
  const advisor = new Map(s.advisors.map((a) => [a.id, a]));
  const pipeline = new Map(s.pipelines.map((p) => [p.id, p.name]));
  const stage = new Map<string, string>();
  for (const p of s.pipelines) for (const st of p.stages) stage.set(`${p.id}:${st.id}`, st.name);

  const tareas = new Map<string, { abiertas: number; vencidas: number; pcVencida: boolean }>();
  for (const t of s.tasks) {
    if (!t.leadId || t.completed) continue;
    const T = tareas.get(t.leadId) ?? { abiertas: 0, vencidas: 0, pcVencida: false };
    T.abiertas += 1;
    if (Date.parse(t.dueAt) < nowMs) {
      T.vencidas += 1;
      if (esPrimerContacto(t)) T.pcVencida = true;
    }
    tareas.set(t.leadId, T);
  }

  const act = new Map<string, { tareas: number; ultTarea: string; llamadas: number; ultLlamada: string; ultima: string }>();
  for (const a of s.activities) {
    const A = act.get(a.leadId) ?? { tareas: 0, ultTarea: "", llamadas: 0, ultLlamada: "", ultima: "" };
    if (a.tipo === "tarea") {
      A.tareas += 1;
      if (a.ts > A.ultTarea) A.ultTarea = a.ts;
    }
    if (a.tipo === "llamada_ok" || a.tipo === "llamada_no") {
      A.llamadas += 1;
      if (a.ts > A.ultLlamada) A.ultLlamada = a.ts;
    }
    if (a.tipo !== "asignacion" && a.ts > A.ultima) A.ultima = a.ts;
    act.set(a.leadId, A);
  }

  const columns = [
    "ID", "Lead", "Creado", "Pipeline", "Etapa", "Asesor", "Presupuesto", "Recibo", "Respondió", "Estado funnel",
    "Tareas abiertas", "Tareas vencidas", "1er Contacto vencida", "Tags", "Días sin cambio", "Link",
    "Msjs cliente", "Llamadas", "Últ. llamada", "Sin tarea", "Razón del descarte", "Últ. asignación",
    "Tareas completadas", "Últ. tarea completada", "Fecha últ. llamada", "Cotización entregada",
    "Levantamiento solicitado", "Últ. actividad",
    // Omnicanal (columnas nuevas, después de las del Sheet)
    "Canal", "Origen", "Zona", "Zona efectiva", "Ciudad", "Zona asesor", "Interés", "Estado", "Cerrado",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "Ad ID", "Teléfono", "Contacto ID",
  ];

  const rows: Row[] = s.leads.map((l) => {
    const pName = pipeline.get(l.pipelineId) ?? l.pipelineId;
    const sName = stage.get(`${l.pipelineId}:${l.stageId}`) ?? l.stageId;
    const funnel = estadoFunnel(l, pName, sName);
    const T = tareas.get(l.id) ?? { abiertas: 0, vencidas: 0, pcVencida: false };
    const A = act.get(l.id) ?? { tareas: 0, ultTarea: "", llamadas: 0, ultLlamada: "", ultima: "" };
    const a = l.advisorId ? advisor.get(l.advisorId) : undefined;
    const asignado = funnel.startsWith("4");
    const respondio = funnel.startsWith("2") || funnel.startsWith("3") || asignado || funnel.startsWith("5");
    return [
      l.id, l.name, fechaLocal(l.createdAt), pName, sName, a?.name ?? l.advisorId ?? "", l.value,
      l.reciboRecibido ? "SÍ" : "NO", respondio ? "SÍ" : "NO", funnel,
      T.abiertas, T.vencidas, T.pcVencida ? 1 : "", l.tags.join(", "),
      Math.floor((nowMs - Date.parse(l.updatedAt)) / DAY_MS), l.url ?? "",
      l.msgsCliente, Math.max(l.intentosLlamada, A.llamadas), A.ultLlamada ? (s.activities.find((x) => x.leadId === l.id && x.ts === A.ultLlamada)?.tipo === "llamada_ok" ? "Contactó" : "No contesta") : "",
      asignado && T.abiertas === 0 ? 1 : "", l.lossReason ?? "", fechaLocal(l.ultimaAsignacionAt),
      A.tareas, fechaLocal(A.ultTarea || null), fechaLocal(A.ultLlamada || null), fechaLocal(l.cotizacionEntregadaAt),
      fechaLocal(l.levantamientoAt), fechaLocal(A.ultima || null),
      l.canal, l.origen ?? "", l.zona, l.zonaEfectiva ?? "", l.ciudad ?? "", a?.zona ?? "", l.interes ?? "", l.status, fechaLocal(l.closedAt),
      l.utm.source ?? "", l.utm.medium ?? "", l.utm.campaign ?? "", l.utm.content ?? "", l.utm.term ?? "", l.adId ?? "",
      l.phoneKey ?? "", l.contactId ?? "",
    ];
  });
  return { columns, rows };
}

export function tablaActividades(s: Snapshot): Tabla {
  const advisor = new Map(s.advisors.map((a) => [a.id, a.name]));
  const pipeline = new Map(s.pipelines.map((p) => [p.id, p.name]));
  const lead = new Map(s.leads.map((l) => [l.id, l]));
  const columns = ["Fecha", "Tipo", "Asesor", "Lead", "Asignado", "Embudo", "Lead ID", "Lead nombre", "Canal", "Zona"];
  const rows: Row[] = s.activities
    .filter((a): a is Activity => Boolean(lead.get(a.leadId)))
    .map((a) => {
      const l = lead.get(a.leadId)!;
      return [
        fechaLocal(a.ts), a.tipo, advisor.get(a.advisorId ?? "") ?? advisor.get(l.advisorId ?? "") ?? "",
        Number(l.id) || l.id, fechaLocal(l.ultimaAsignacionAt), pipeline.get(a.pipelineId ?? l.pipelineId) ?? "",
        l.id, l.name, l.canal, l.zonaEfectiva ?? l.zona,
      ];
    });
  return { columns, rows };
}

export function tablaVentas(s: Snapshot): Tabla {
  const advisor = new Map(s.advisors.map((a) => [a.id, a.name]));
  const lead = new Map(s.leads.map((l) => [l.id, l]));
  const columns = [
    "ID", "Cliente", "Vendedor", "Vendedor compartido", "Zona", "Zona (texto)", "Mes", "Monto contrato", "Monto comisionable",
    "Paneles", "Método de pago", "Origen", "Referido por", "HubSpot", "Comisión pagada", "Cancelada", "Creada", "Actualizada",
    "Lead Kommo", "Lead nombre", "Canal Kommo", "Asesor Kommo",
  ];
  const rows: Row[] = s.ventas.map((v) => {
    const l = v.leadId ? lead.get(v.leadId) : undefined;
    return [
      v.id, v.cliente, v.vendedor ?? "", v.vendedorCompartido ?? "", v.zona, v.zonaTexto ?? "", v.mes ?? "", v.montoContrato,
      v.montoComisionable, v.paneles ?? "", v.metodoPago ?? "", v.origen ?? "", v.referidoPor ?? "", v.hubspotLink ?? "",
      v.comisionPagada ? "SÍ" : "NO", v.cancelada ? "SÍ" : "NO", fechaLocal(v.createdAt), fechaLocal(v.updatedAt),
      v.leadId ?? "", l?.name ?? "", l?.canal ?? "", v.advisorId ? (advisor.get(v.advisorId) ?? "") : "",
    ];
  });
  return { columns, rows };
}

export function tablaProyectos(s: Snapshot): Tabla {
  const advisor = new Map(s.advisors.map((a) => [a.id, a.name]));
  const lead = new Map(s.leads.map((l) => [l.id, l]));
  const columns = [
    "ID", "Folio", "Folio Odoo", "Cliente", "Teléfono", "Zona", "Estatus", "Etapa", "Etapa desde", "Fecha agenda",
    "Fecha instalación", "Fecha cierre", "Paneles", "kW", "Vendedor", "Origen", "Anticipo pagado", "Instalado cobrado",
    "Medidor pagado", "Saldo vencido", "Meses atraso", "Próximo pago", "Tickets abiertos", "Creado", "Actualizado",
    "Lead Kommo", "Lead nombre", "Canal Kommo", "Asesor Kommo",
  ];
  const rows: Row[] = s.proyectos.map((p) => {
    const l = p.leadId ? lead.get(p.leadId) : undefined;
    return [
      p.id, p.folio, p.folioOdoo ?? "", p.cliente, p.telefono ?? "", p.zona ?? "", p.estatus, p.etapa ?? "",
      fechaLocal(p.etapaDesde), p.fechaAgenda ?? "", p.fechaInstalacion ?? "", p.fechaCierre ?? "", p.paneles ?? "", p.kw ?? "",
      p.vendedor ?? "", p.origen ?? "", p.anticipoPagado ? "SÍ" : "NO", p.instaladoCobrado ? "SÍ" : "NO",
      p.medidorPagado ? "SÍ" : "NO", p.saldoVencido, p.mesesAtraso, p.proximaFechaPago ?? "", p.ticketsAbiertos,
      fechaLocal(p.createdAt), fechaLocal(p.updatedAt),
      p.leadId ?? "", l?.name ?? "", l?.canal ?? "", p.advisorId ? (advisor.get(p.advisorId) ?? "") : "",
    ];
  });
  return { columns, rows };
}

/** CSV con BOM (Excel) y comas, comillas escapadas, fin de línea CRLF. */
export function toCsv(t: Tabla): string {
  const cell = (v: string | number): string => {
    const str = String(v ?? "");
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [t.columns.map(cell).join(","), ...t.rows.map((r) => r.map(cell).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
