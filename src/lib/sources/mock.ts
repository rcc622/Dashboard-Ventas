import type { Advisor, DataSource, Lead, Pipeline, Snapshot, Task } from "@/lib/model";

/**
 * Fuente demo: genera datos ficticios pero realistas para ver el dashboard
 * funcionando sin credenciales. Se usa automáticamente cuando ninguna fuente
 * real está configurada.
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

const ADVISOR_NAMES = [
  "Ana Torres",
  "Luis Hernández",
  "Mariana Cantú",
  "Jorge Villarreal",
  "Sofía Garza",
  "Diego Ramírez",
  "Paola Treviño",
  "Carlos Elizondo",
];
const CHANNELS: Array<[string, number]> = [
  ["WhatsApp", 0.42],
  ["Web Form", 0.25],
  ["Meta Ads", 0.15],
  ["TikTok", 0.1],
  ["Referido", 0.08],
];
const ZONES = ["MTY", "SLT", "TRC", "MVA", "SML"];
const PROJECTS = [
  "Casa Cumbres",
  "Residencial Contry",
  "Depto San Pedro",
  "Casa Apodaca",
  "Local Centro",
  "Bodega Santa Catarina",
  "Casa Escobedo",
  "Nave Ramos Arizpe",
  "Casa Saltillo Norte",
  "Oficinas Valle",
  "Casa Torreón Jardín",
  "Escuela Monclova",
];
const LOSS_REASONS = ["Precio", "Sin respuesta", "Compró con otro proveedor", "No califica", "Pospuso decisión"];
const TASK_TEXTS = [
  "Llamar para seguimiento",
  "Enviar cotización",
  "Agendar visita técnica",
  "Confirmar documentos",
  "Cerrar propuesta",
];

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

function weighted(r: () => number, items: Array<[string, number]>): string {
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
      ...openStages.map((stageName, i) => ({
        id: `${id}-s${i + 1}`,
        name: stageName,
        order: i,
        kind: "open" as const,
      })),
      { id: "142", name: "Cerrado ganado", order: openStages.length, kind: "won" as const },
      { id: "143", name: "Cerrado perdido", order: openStages.length + 1, kind: "lost" as const },
    ],
  };
}

export function buildDemoSnapshot(now: Date = new Date()): Snapshot {
  const r = createRng(20260903);
  const nowMs = now.getTime();

  const advisors: Advisor[] = ADVISOR_NAMES.map((name, i) => ({
    id: `u${i + 1}`,
    name,
    email: `${name.split(" ")[0].toLowerCase()}@demo.mx`,
    active: i < ADVISOR_NAMES.length - 1,
  }));

  const pipelines = [
    makePipeline("p1", "Residencial", true, [
      "Nuevo",
      "Contactado",
      "Cotización enviada",
      "Visita técnica",
      "Negociación",
    ]),
    makePipeline("p2", "Comercial e Industrial", false, ["Prospecto", "Levantamiento", "Propuesta", "Negociación"]),
  ];

  const leads: Lead[] = [];
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

    const stageId =
      status === "won"
        ? "142"
        : status === "lost"
          ? "143"
          : openStages[Math.floor(Math.pow(r(), 1.5) * openStages.length)].id;

    let closedMs: number | null = null;
    if (status !== "open") {
      closedMs = Math.min(nowMs, createdMs + (2 + r() * Math.min(45, Math.max(1, ageDays - 1))) * DAY_MS);
    }
    const idleDays = status === "open" ? (r() < 0.22 ? 3 + r() * 14 : r() * 2.5) : 0;
    const updatedMs = status === "open" ? Math.max(createdMs, nowMs - idleDays * DAY_MS) : (closedMs as number);

    const commercial = pipeline.id === "p2";
    const rawValue = commercial ? 300_000 + r() * 1_200_000 : 85_000 + r() * 180_000;

    leads.push({
      id: `L${1000 + i}`,
      name: `${pick(r, PROJECTS)} ${String(i + 1).padStart(3, "0")}`,
      value: Math.round(rawValue / 1000) * 1000,
      advisorId: advisor.id,
      pipelineId: pipeline.id,
      stageId,
      status,
      createdAt: new Date(createdMs).toISOString(),
      updatedAt: new Date(updatedMs).toISOString(),
      closedAt: closedMs ? new Date(closedMs).toISOString() : null,
      lossReason: status === "lost" ? pick(r, LOSS_REASONS) : undefined,
      channel: weighted(r, CHANNELS),
      tags: [pick(r, ZONES)],
    });
  }

  const openLeads = leads.filter((l) => l.status === "open");
  const tasks: Task[] = Array.from({ length: 70 }, (_, i) => {
    const lead = pick(r, openLeads);
    const dueMs = nowMs + (r() * 14 - 5) * DAY_MS;
    return {
      id: `T${i + 1}`,
      advisorId: lead.advisorId,
      leadId: lead.id,
      text: pick(r, TASK_TEXTS),
      dueAt: new Date(dueMs).toISOString(),
      completed: false,
    };
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
    tasks,
    warnings: [
      "Modo demo con datos ficticios. Define KOMMO_SUBDOMAIN y KOMMO_ACCESS_TOKEN para conectar el CRM real.",
    ],
  };
}

export const mockSource: DataSource = {
  id: "mock",
  label: "Demo",
  isConfigured: () => true,
  fetchSnapshot: async () => buildDemoSnapshot(),
};
