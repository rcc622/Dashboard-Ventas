import { clasificarCanal } from "@/lib/kenet/canal";
import { ASIGNABLE, clasificar as clasificarZona } from "@/lib/kenet/zonas";
import type { Activity, Advisor, Contact, DataSource, Lead, Pipeline, Snapshot, Task } from "@/lib/model";

/**
 * Fuente demo: genera datos ficticios pero realistas para ver el dashboard
 * funcionando sin credenciales. Se usa automáticamente cuando ninguna fuente
 * real está configurada. Pasa por las mismas reglas de canal y zona que Kommo.
 */

const DAY_MS = 86_400_000;

/** PRNG determinista (mulberry32): el demo se ve igual en cada recarga. */
function createRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADVISORS: Array<{ name: string; zona: string }> = [
  { name: "Ana Torres", zona: "MTY" },
  { name: "Luis Hernández", zona: "MTY" },
  { name: "Mariana Cantú", zona: "TRC" },
  { name: "Jorge Villarreal", zona: "TRC" },
  { name: "Sofía Garza", zona: "SLT" },
  { name: "Diego Ramírez", zona: "MVA" },
  { name: "Paola Treviño", zona: "MTY" },
  { name: "Carlos Elizondo", zona: "SLT" },
];
/** [utm_source, utm_medium, origen] con su peso. */
const ORIGENES: Array<[{ utmSource?: string; utmMedium?: string; origen?: string }, number]> = [
  [{ utmSource: "meta", utmMedium: "ctwa", origen: "Facebook - Ad" }, 0.42],
  [{ utmSource: "meta", utmMedium: "lead_form" }, 0.12],
  [{ utmSource: "google", utmMedium: "lead_form" }, 0.1],
  [{ utmSource: "web", utmMedium: "formulario", origen: "Web Form - Organic" }, 0.12],
  [{ origen: "Instagram - Organic" }, 0.08],
  [{ utmSource: "tiktok" }, 0.06],
  [{ origen: "Referido" }, 0.05],
  [{}, 0.05],
];
const CIUDADES: Array<[string, number]> = [
  ["Monterrey", 0.5],
  ["Torreon", 0.2],
  ["Saltillo", 0.12],
  ["Monclova", 0.08],
  ["Chihuahua", 0.03],
  ["", 0.07],
];
const PROJECTS = [
  "Casa Cumbres", "Residencial Contry", "Depto San Pedro", "Casa Apodaca", "Local Centro",
  "Bodega Santa Catarina", "Casa Escobedo", "Nave Ramos Arizpe", "Casa Saltillo Norte",
  "Oficinas Valle", "Casa Torreón Jardín", "Escuela Monclova",
];
const LOSS_REASONS = ["Precio", "Sin respuesta", "Compró con otro proveedor", "Fuera de Zona", "Sin interes"];
const TASK_TEXTS = ["Llamar para seguimiento", "Enviar cotización", "Agendar visita técnica", "Confirmar documentos", "Contactar, lead precalificado"];

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

function weighted<T>(r: () => number, items: Array<[T, number]>): T {
  let x = r();
  for (const [value, weight] of items) {
    x -= weight;
    if (x <= 0) return value;
  }
  return items[items.length - 1][0];
}

function makePipeline(id: string, name: string, isMain: boolean, openStages: string[]): Pipeline {
  return {
    id,
    name,
    isMain,
    isArchived: false,
    stages: [
      ...openStages.map((stageName, i) => ({ id: `${id}-s${i + 1}`, name: stageName, order: i, kind: "open" as const })),
      { id: "142", name: "Cerrado ganado", order: openStages.length, kind: "won" as const },
      { id: "143", name: "Cerrado perdido", order: openStages.length + 1, kind: "lost" as const },
    ],
  };
}

export function buildDemoSnapshot(now: Date = new Date()): Snapshot {
  const r = createRng(20260903);
  const nowMs = now.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();

  const advisors: Advisor[] = ADVISORS.map((a, i) => ({
    id: `u${i + 1}`,
    name: a.name,
    email: `${a.name.split(" ")[0].toLowerCase()}@demo.mx`,
    active: i < ADVISORS.length - 1,
    vendedor: i < ADVISORS.length - 1,
    zona: a.zona,
    grupo: `KS-${a.zona}`,
  }));
  const advisorById = new Map(advisors.map((a) => [a.id, a]));

  const pipelines = [
    makePipeline("p1", "Ventas", true, ["Por contactar", "Conversación iniciada", "Cotización enviada", "Levantamiento agendado", "Negociación"]),
    makePipeline("p2", "Comercial e Industrial", false, ["Prospecto", "Levantamiento", "Propuesta", "Negociación"]),
  ];

  const leads: Lead[] = [];
  const contacts: Contact[] = [];
  const activities: Activity[] = [];
  const lossReasons: Record<string, string> = Object.fromEntries(LOSS_REASONS.map((n, i) => [String(100 + i), n]));

  for (let i = 0; i < 420; i++) {
    const pipeline = r() < 0.8 ? pipelines[0] : pipelines[1];
    const ageDays = Math.pow(r(), 0.8) * 120;
    const createdMs = nowMs - ageDays * DAY_MS;
    const advisor = advisors[Math.min(advisors.length - 1, Math.floor(Math.pow(r(), 1.3) * advisors.length))];
    const openStages = pipeline.stages.filter((s) => s.kind === "open");

    const roll = r();
    const matured = ageDays > 7;
    let status: Lead["status"] = "open";
    if (matured && roll < 0.27) status = "won";
    else if (matured && roll < 0.6) status = "lost";
    const stageId = status === "won" ? "142" : status === "lost" ? "143" : openStages[Math.floor(Math.pow(r(), 1.5) * openStages.length)].id;

    let closedMs: number | null = null;
    if (status !== "open") closedMs = Math.min(nowMs, createdMs + (2 + r() * Math.min(45, Math.max(1, ageDays - 1))) * DAY_MS);
    const idleDays = status === "open" ? (r() < 0.22 ? 3 + r() * 14 : r() * 2.5) : 0;
    const updatedMs = status === "open" ? Math.max(createdMs, nowMs - idleDays * DAY_MS) : (closedMs as number);

    const origen = weighted(r, ORIGENES);
    const ciudad = weighted(r, CIUDADES);
    const [zona] = clasificarZona({ ciudad: ciudad || undefined });
    const canal = clasificarCanal({ ...origen });
    const contactId = `c${1000 + i}`;
    const phone = `81${String(Math.floor(r() * 1e8)).padStart(8, "0")}`;
    contacts.push({
      id: contactId,
      name: `Contacto ${i + 1}`,
      phone: `+52${phone}`,
      phoneKey: phone,
      ciudad: ciudad || undefined,
      interes: pick(r, ["Contado", "Financiado", "Mejoravit"]),
      advisorId: advisor.id,
      ultimaAsignacionAt: iso(createdMs + r() * DAY_MS),
      updatedAt: iso(updatedMs),
    });

    const commercial = pipeline.id === "p2";
    const rawValue = commercial ? 300_000 + r() * 1_200_000 : 85_000 + r() * 180_000;
    const recibo = r() < 0.55;
    const cotizacionMs = recibo && r() < 0.5 ? createdMs + (1 + r() * 10) * DAY_MS : null;
    const levMs = cotizacionMs && r() < 0.4 ? cotizacionMs + (1 + r() * 7) * DAY_MS : null;
    const lossId = status === "lost" ? String(100 + Math.floor(r() * LOSS_REASONS.length)) : undefined;

    const lead: Lead = {
      id: `L${1000 + i}`,
      name: `${pick(r, PROJECTS)} ${String(i + 1).padStart(3, "0")}`,
      value: Math.round(rawValue / 1000) * 1000,
      advisorId: advisor.id,
      pipelineId: pipeline.id,
      stageId,
      status,
      createdAt: iso(createdMs),
      updatedAt: iso(updatedMs),
      closedAt: closedMs ? iso(closedMs) : null,
      lossReason: lossId ? lossReasons[lossId] : undefined,
      tags: [],
      contactId,
      phoneKey: phone,
      ciudad: ciudad || undefined,
      zona,
      zonaEfectiva: ASIGNABLE.has(zona) ? zona : (advisorById.get(advisor.id)?.zona ?? null),
      canal,
      origen: origen.origen,
      utm: { source: origen.utmSource, medium: origen.utmMedium, campaign: origen.utmSource ? `KENET_LEADS_${zona}_2026-08` : undefined },
      reciboRecibido: recibo,
      iaActiva: r() < 0.6,
      intentosLlamada: Math.floor(r() * 4),
      cotizacionEntregadaAt: cotizacionMs && cotizacionMs < nowMs ? iso(cotizacionMs) : null,
      levantamientoAt: levMs && levMs < nowMs ? iso(levMs) : null,
      ultimaAsignacionAt: iso(createdMs + r() * DAY_MS),
      msgsCliente: Math.floor(Math.pow(r(), 2) * 12),
    };
    leads.push(lead);

    if (lead.cotizacionEntregadaAt) activities.push({ id: `cotizacion:${lead.id}`, ts: lead.cotizacionEntregadaAt, tipo: "cotizacion", advisorId: lead.advisorId, leadId: lead.id, pipelineId: lead.pipelineId });
    if (lead.levantamientoAt) activities.push({ id: `levantamiento:${lead.id}`, ts: lead.levantamientoAt, tipo: "levantamiento", advisorId: lead.advisorId, leadId: lead.id, pipelineId: lead.pipelineId });
    if (status === "lost" && lead.closedAt) activities.push({ id: `descarte:${lead.id}`, ts: lead.closedAt, tipo: "descarte", advisorId: lead.advisorId, leadId: lead.id, pipelineId: lead.pipelineId });
    const llamadas = Math.floor(r() * 4);
    for (let k = 0; k < llamadas; k++) {
      const ts = createdMs + r() * Math.max(1, nowMs - createdMs);
      activities.push({ id: `llamada:${lead.id}:${k}`, ts: iso(ts), tipo: r() < 0.45 ? "llamada_ok" : "llamada_no", advisorId: lead.advisorId, leadId: lead.id, pipelineId: lead.pipelineId });
    }
    const tareas = Math.floor(r() * 3);
    for (let k = 0; k < tareas; k++) {
      const ts = createdMs + r() * Math.max(1, nowMs - createdMs);
      activities.push({ id: `tarea:${lead.id}:${k}`, ts: iso(ts), tipo: "tarea", advisorId: lead.advisorId, leadId: lead.id, pipelineId: lead.pipelineId });
    }
  }

  const openLeads = leads.filter((l) => l.status === "open");
  const tasks: Task[] = Array.from({ length: 70 }, (_, i) => {
    const lead = pick(r, openLeads);
    const dueMs = nowMs + (r() * 14 - 5) * DAY_MS;
    return { id: `T${i + 1}`, advisorId: lead.advisorId, leadId: lead.id, text: pick(r, TASK_TEXTS), dueAt: iso(dueMs), completed: false };
  });

  return {
    source: "mock",
    sourceLabel: "Demo",
    demo: true,
    fetchedAt: now.toISOString(),
    account: { name: "Datos de demostración" },
    advisors,
    pipelines,
    leads,
    contacts,
    tasks,
    activities: activities.sort((a, b) => a.ts.localeCompare(b.ts)),
    lossReasons,
    warnings: ["Modo demo con datos ficticios. Define KOMMO_SUBDOMAIN y KOMMO_LONG_TOKEN para conectar el CRM real."],
    cursor: { leadsUpdatedAt: now.toISOString(), eventsAt: now.toISOString(), windowFrom: iso(nowMs - 120 * DAY_MS) },
  };
}

export const mockSource: DataSource = {
  id: "mock",
  label: "Demo",
  isConfigured: () => true,
  fetchSnapshot: async () => buildDemoSnapshot(),
};
