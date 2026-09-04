import { clasificarCanal } from "@/lib/kenet/canal";
import { KENET } from "@/lib/kenet/ids";
import { ASIGNABLE, clasificar as clasificarZona } from "@/lib/kenet/zonas";
import type {
  Activity,
  Advisor,
  Contact,
  DataSource,
  Lead,
  Pipeline,
  Snapshot,
  Stage,
  StageKind,
  SyncCursor,
  Task,
} from "@/lib/model";

/**
 * Fuente: Kommo CRM (API v4), cuenta de Kenet Solar.
 *
 * Mismas credenciales que el salesbot (Kommo-ia) y el dashboard de marketing
 * (MKT-Autonomus): KOMMO_SUBDOMAIN + KOMMO_LONG_TOKEN (token de larga duración
 * de una integración privada), enviado como `Authorization: Bearer <token>`.
 *
 * Trae leads + contactos (ciudad, teléfono), tareas, eventos (mensajes del
 * cliente, cambios de responsable) y notas de llamada, y los normaliza con las
 * reglas canónicas de canal (canal.ts) y zona (zonas.ts).
 */

const STATUS_WON = KENET.stages.won;
const STATUS_LOST = KENET.stages.lost;
/** `type: 1` marca la etapa «Leads entrantes» (unsorted). */
const STATUS_TYPE_UNSORTED = 1;

/** Máximo de entidades por página que permite Kommo. */
const PAGE_LIMIT = 250;
/** Kommo limita a 7 req/s por integración; nos quedamos en ~6 req/s. */
const MIN_INTERVAL_MS = 160;
const MAX_RETRIES = 3;
/** Las dos patas de una llamada Twilio llegan como notas con 1-2 s de diferencia. */
const CALL_DEDUP_SEC = 15;
/** Margen que se repite en cada corrida incremental para no perder cambios. */
const INCREMENTAL_OVERLAP_SEC = 15 * 60;
const TIPOS_MENSAJE_CLIENTE = "incoming_chat_message,incoming_sms_message";
const TIPO_CAMBIO_RESPONSABLE = "entity_responsible_changed";

interface KommoConfig {
  baseUrl: string;
  token: string;
  lookbackDays: number;
  /** Pipelines a incluir (ids). null = todos los no archivados. */
  pipelines: Set<string> | null;
}

export function readKommoConfig(): KommoConfig | null {
  const subdomain = process.env.KOMMO_SUBDOMAIN?.trim();
  const token = (process.env.KOMMO_LONG_TOKEN || process.env.KOMMO_ACCESS_TOKEN || "").trim();
  const baseUrlOverride = process.env.KOMMO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!token || (!subdomain && !baseUrlOverride)) return null;
  const baseDomain = process.env.KOMMO_BASE_DOMAIN?.trim() || "kommo.com";
  const csv = process.env.KOMMO_PIPELINES?.trim();
  return {
    baseUrl: baseUrlOverride || `https://${subdomain}.${baseDomain}`,
    token,
    lookbackDays: Number(process.env.KOMMO_LOOKBACK_DAYS) || 120,
    pipelines: csv ? new Set(csv.split(",").map((s) => s.trim()).filter(Boolean)) : null,
  };
}

// --- Tipos crudos de la API ---------------------------------------------------

interface KommoPage<T> {
  _embedded?: Record<string, T[] | undefined>;
}

interface KommoCf {
  field_id: number;
  field_code?: string | null;
  values?: Array<{ value?: unknown; enum_id?: number }> | null;
}

interface KommoUser {
  id: number;
  name: string;
  email?: string;
  rights?: { is_active?: boolean; is_admin?: boolean; group_id?: number | null };
}

interface KommoGroup {
  id: number;
  name: string;
}

interface KommoAccount {
  id: number;
  name: string;
  subdomain: string;
  _embedded?: { users_groups?: KommoGroup[] };
}

interface KommoStatus {
  id: number;
  name: string;
  sort: number;
  type: number;
  color?: string;
}

interface KommoPipeline {
  id: number;
  name: string;
  sort: number;
  is_main: boolean;
  is_archive: boolean;
  _embedded?: { statuses?: KommoStatus[] };
}

interface KommoLossReason {
  id: number;
  name: string;
}

interface KommoLead {
  id: number;
  name: string;
  price: number | null;
  responsible_user_id: number | null;
  status_id: number;
  pipeline_id: number;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
  loss_reason_id?: number | null;
  source_id?: number | null;
  is_deleted?: boolean;
  custom_fields_values?: KommoCf[] | null;
  _embedded?: {
    tags?: { id: number; name: string }[];
    contacts?: { id: number; is_main?: boolean }[];
    loss_reason?: { id: number; name: string } | null;
    source?: { id: number; name: string } | null;
  };
}

interface KommoContact {
  id: number;
  name: string;
  responsible_user_id: number | null;
  updated_at: number;
  custom_fields_values?: KommoCf[] | null;
}

interface KommoTask {
  id: number;
  responsible_user_id: number | null;
  entity_id: number | null;
  entity_type: string | null;
  text: string;
  is_completed: boolean;
  complete_till: number;
  task_type_id?: number;
  created_at?: number;
  updated_at?: number;
}

interface KommoEvent {
  id: string;
  type: string;
  entity_id: number;
  entity_type: string;
  created_by: number;
  created_at: number;
  value_after?: unknown;
}

interface KommoNote {
  id: number;
  entity_id: number;
  note_type: string;
  created_at: number;
  updated_at?: number;
  responsible_user_id?: number;
  params?: { duration?: number | string } | null;
}

interface CallNote {
  entity: "leads" | "contacts";
  entityId: string;
  noteId: number;
  ts: number;
  duration: number;
}

export class KommoError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "KommoError";
  }
}

// --- Cliente HTTP ------------------------------------------------------------

type ParamValue = string | number | undefined | Array<string | number>;
type Params = Record<string, ParamValue>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toIso = (unixSeconds: number | null | undefined): string | null =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;

class KommoClient {
  private lastRequestAt = 0;
  requests = 0;

  constructor(private readonly cfg: KommoConfig) {}

  get baseUrl(): string {
    return this.cfg.baseUrl;
  }

  /** GET a la API v4. Devuelve `null` cuando Kommo responde 204 (colección vacía). */
  async get<T>(path: string, params: Params = {}): Promise<T | null> {
    const url = new URL(`/api/v4${path}`, this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, String(item));
      else url.searchParams.set(key, String(value));
    }

    for (let attempt = 0; ; attempt++) {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();
      this.requests += 1;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.cfg.token}`, Accept: "application/json" },
        cache: "no-store",
      });

      if (res.status === 204) return null;
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 300);
        throw new KommoError(res.status, `Kommo respondió ${res.status} en ${path}: ${body || res.statusText}`);
      }
      const text = await res.text();
      if (!text.trim()) return null;
      return JSON.parse(text) as T;
    }
  }

  /** Recorre todas las páginas de una colección (`_embedded[key]`). */
  async getAll<T>(path: string, key: string, params: Params = {}, maxPages = 200): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const data = await this.get<KommoPage<T>>(path, { ...params, page, limit: PAGE_LIMIT });
      const batch = data?._embedded?.[key] ?? [];
      items.push(...batch);
      if (batch.length < PAGE_LIMIT) break;
    }
    return items;
  }
}

// --- Lectura de campos personalizados ------------------------------------------

function cfRaw(cfs: KommoCf[] | null | undefined, fieldId: number): unknown {
  for (const f of cfs ?? []) if (f.field_id === fieldId) return f.values?.[0]?.value;
  return undefined;
}

function cfText(cfs: KommoCf[] | null | undefined, fieldId: number): string | undefined {
  const v = cfRaw(cfs, fieldId);
  if (v === undefined || v === null || v === "") return undefined;
  return String(v).trim() || undefined;
}

function cfBool(cfs: KommoCf[] | null | undefined, fieldId: number): boolean | undefined {
  const v = cfRaw(cfs, fieldId);
  if (v === undefined || v === null) return undefined;
  return v === true || v === 1 || v === "1" || v === "true";
}

/** date_time de Kommo puede venir como timestamp (número o string) o ISO. */
function cfDate(cfs: KommoCf[] | null | undefined, fieldId: number): string | null {
  const v = cfRaw(cfs, fieldId);
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 1_000_000_000) return new Date(n * 1000).toISOString();
  const t = Date.parse(String(v));
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : null;
}

function cfByCode(cfs: KommoCf[] | null | undefined, code: string): string | undefined {
  for (const f of cfs ?? []) {
    if (f.field_code === code) {
      const v = f.values?.[0]?.value;
      if (v !== undefined && v !== null && v !== "") return String(v).trim();
    }
  }
  return undefined;
}

/** Últimos 10 dígitos del teléfono: la llave de dedup (misma regla que Kommo-ia y el Sheet). */
export function phoneKey(raw: string | undefined): string | undefined {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : undefined;
}

const maxIso = (...values: Array<string | null | undefined>): string | null => {
  let best: string | null = null;
  for (const v of values) if (v && (!best || Date.parse(v) > Date.parse(best))) best = v;
  return best;
};

// --- Descarga -------------------------------------------------------------------

interface Catalog {
  account: KommoAccount | null;
  users: KommoUser[];
  groups: Map<number, string>;
  pipelines: KommoPipeline[];
  lossReasons: Map<number, string>;
  warnings: string[];
}

async function fetchCatalog(client: KommoClient): Promise<Catalog> {
  const warnings: string[] = [];
  const account = await client.get<KommoAccount>("/account", { with: "users_groups" });
  const groups = new Map<number, string>();
  for (const g of account?._embedded?.users_groups ?? []) groups.set(g.id, g.name);

  // /users solo lo pueden leer administradores. Si el token no alcanza,
  // los asesores se infieren de los leads (aparecen por ID).
  let users: KommoUser[] = [];
  try {
    users = await client.getAll<KommoUser>("/users", "users");
  } catch (err) {
    if (err instanceof KommoError && err.status === 403) {
      warnings.push("El token no puede leer /users (requiere permisos de administrador). Los asesores se muestran por ID.");
    } else {
      throw err;
    }
  }

  const pipelines = (await client.get<KommoPage<KommoPipeline>>("/leads/pipelines"))?._embedded?.pipelines ?? [];
  const lossReasons = new Map<number, string>();
  try {
    const razones = (await client.get<KommoPage<KommoLossReason>>("/leads/loss_reasons"))?._embedded?.loss_reasons ?? [];
    for (const r of razones) lossReasons.set(r.id, r.name);
  } catch (err) {
    warnings.push(`No se pudieron leer las razones de descarte (${err instanceof Error ? err.message : String(err)}).`);
  }
  return { account, users, groups, pipelines, lossReasons, warnings };
}

const LEADS_WITH = "contacts,source_id,loss_reason";

/** Corte completo: creados, cerrados o tocados dentro de la ventana (unión por id). */
async function fetchLeadsWindow(client: KommoClient, sinceUnix: number): Promise<KommoLead[]> {
  const byId = new Map<number, KommoLead>();
  const queries: Params[] = [
    { "filter[created_at][from]": sinceUnix },
    { "filter[closed_at][from]": sinceUnix },
    { "filter[updated_at][from]": sinceUnix },
  ];
  for (const filtro of queries) {
    // order[id]=asc: un PATCH reordena por updated_at y se pierden páginas (gotcha Kommo-ia 21-ago).
    const leads = await client.getAll<KommoLead>("/leads", "leads", { with: LEADS_WITH, "order[id]": "asc", ...filtro });
    for (const l of leads) byId.set(l.id, l);
  }
  return [...byId.values()];
}

async function fetchLeadsUpdatedSince(client: KommoClient, sinceUnix: number): Promise<KommoLead[]> {
  return client.getAll<KommoLead>("/leads", "leads", {
    with: LEADS_WITH,
    "order[id]": "asc",
    "filter[updated_at][from]": sinceUnix,
  });
}

/** Contactos por lote de ids. OJO: tiene que ser `filter[id][]`; con `filter[id]` Kommo devuelve uno solo. */
async function fetchContacts(client: KommoClient, ids: Iterable<string>): Promise<Map<string, KommoContact>> {
  const out = new Map<string, KommoContact>();
  const lista = [...new Set(ids)];
  for (let i = 0; i < lista.length; i += 100) {
    const lote = lista.slice(i, i + 100);
    const contactos = await client.getAll<KommoContact>("/contacts", "contacts", { "filter[id][]": lote });
    for (const c of contactos) out.set(String(c.id), c);
  }
  return out;
}

async function fetchOpenTasks(client: KommoClient): Promise<KommoTask[]> {
  return client.getAll<KommoTask>("/tasks", "tasks", { "filter[is_completed]": 0, "filter[entity_type]": "leads" });
}

async function fetchCompletedTasks(client: KommoClient, sinceUnix: number): Promise<KommoTask[]> {
  return client.getAll<KommoTask>("/tasks", "tasks", {
    "filter[is_completed]": 1,
    "filter[entity_type]": "leads",
    "filter[updated_at][from]": sinceUnix,
  });
}

async function fetchLeadEvents(client: KommoClient, types: string, sinceUnix: number): Promise<KommoEvent[]> {
  try {
    const events = await client.getAll<KommoEvent>("/events", "events", {
      "filter[type]": types,
      "filter[entity]": "lead",
      "filter[created_at][from]": sinceUnix,
    });
    return events.filter((e) => e.entity_type === "lead");
  } catch (err) {
    // Los eventos no son críticos: sin ellos el dashboard sigue, solo sin conteo de mensajes.
    if (err instanceof KommoError && (err.status === 403 || err.status === 400)) return [];
    throw err;
  }
}

/** Notas de llamada (call_in/call_out) del LEAD y del CONTACTO: viven en los dos lados. */
async function fetchCallNotes(client: KommoClient, sinceUnix: number): Promise<CallNote[]> {
  const out: CallNote[] = [];
  for (const entity of ["leads", "contacts"] as const) {
    try {
      const notes = await client.getAll<KommoNote>(`/${entity}/notes`, "notes", {
        "filter[note_type][0]": "call_in",
        "filter[note_type][1]": "call_out",
        "filter[updated_at][from]": sinceUnix,
      });
      for (const n of notes) {
        out.push({
          entity,
          entityId: String(n.entity_id),
          noteId: n.id,
          ts: n.created_at || 0,
          duration: Number(n.params?.duration) || 0,
        });
      }
    } catch (err) {
      if (err instanceof KommoError && (err.status === 403 || err.status === 400)) continue;
      throw err;
    }
  }
  return out;
}

// --- Normalización ----------------------------------------------------------------

function stageKind(status: KommoStatus): StageKind {
  if (status.id === STATUS_WON) return "won";
  if (status.id === STATUS_LOST) return "lost";
  if (status.type === STATUS_TYPE_UNSORTED) return "unsorted";
  return "open";
}

function leadStatus(statusId: number): Lead["status"] {
  if (statusId === STATUS_WON) return "won";
  if (statusId === STATUS_LOST) return "lost";
  return "open";
}

function normalizeAdvisors(catalog: Catalog): Advisor[] {
  const noVendedores = new Set<number>(KENET.noVendedores);
  return catalog.users.map((u) => {
    const grupo = u.rights?.group_id != null ? catalog.groups.get(u.rights.group_id) : undefined;
    const zonaGrupo = grupo?.toUpperCase().startsWith(KENET.grupoZonaPrefijo)
      ? grupo.slice(KENET.grupoZonaPrefijo.length).toUpperCase()
      : null;
    const active = u.rights?.is_active ?? true;
    return {
      id: String(u.id),
      name: u.name,
      email: u.email,
      active,
      vendedor: active && !noVendedores.has(u.id),
      zona: zonaGrupo ?? KENET.zonaPorAsesor[u.id] ?? null,
      grupo,
    };
  });
}

function normalizePipelines(catalog: Catalog): Pipeline[] {
  return catalog.pipelines.map((p) => ({
    id: String(p.id),
    name: p.name,
    isMain: Boolean(p.is_main),
    isArchived: Boolean(p.is_archive),
    stages: [...(p._embedded?.statuses ?? [])]
      .sort((a, b) => a.sort - b.sort)
      .map<Stage>((s, index) => ({ id: String(s.id), name: s.name, order: index, kind: stageKind(s), color: s.color })),
  }));
}

function normalizeContact(c: KommoContact): Contact {
  const phone = cfByCode(c.custom_fields_values, "PHONE");
  return {
    id: String(c.id),
    name: c.name,
    phone,
    phoneKey: phoneKey(phone),
    email: cfByCode(c.custom_fields_values, "EMAIL"),
    ciudad: cfText(c.custom_fields_values, KENET.contactFields.ciudad),
    interes: cfText(c.custom_fields_values, KENET.contactFields.interes),
    advisorId: c.responsible_user_id ? String(c.responsible_user_id) : null,
    ultimaAsignacionAt: cfDate(c.custom_fields_values, KENET.contactFields.ultimaAsignacion),
    updatedAt: toIso(c.updated_at) ?? new Date().toISOString(),
  };
}

interface LeadContext {
  baseUrl: string;
  advisors: Map<string, Advisor>;
  contacts: Map<string, Contact>;
  lossReasons: Map<number, string>;
  /** Mensajes entrantes por lead (solo los eventos de esta descarga). */
  msgCount: Map<string, number>;
  /** Último cambio de responsable por lead (ISO). */
  assignLast: Map<string, string>;
  nowIso: string;
}

function mainContactId(l: KommoLead): string | null {
  const cs = l._embedded?.contacts ?? [];
  if (!cs.length) return null;
  const main = cs.find((c) => c.is_main) ?? cs[0];
  return String(main.id);
}

function normalizeLead(l: KommoLead, ctx: LeadContext): Lead {
  const F = KENET.leadFields;
  const cfs = l.custom_fields_values;
  const utm = {
    source: cfText(cfs, F.utmSource),
    medium: cfText(cfs, F.utmMedium),
    campaign: cfText(cfs, F.utmCampaign),
    content: cfText(cfs, F.utmContent),
    term: cfText(cfs, F.utmTerm),
  };
  const origen = cfText(cfs, F.origen);
  const tags = (l._embedded?.tags ?? []).map((t) => t.name);
  const sourceId = l.source_id ?? l._embedded?.source?.id ?? undefined;
  const canal = clasificarCanal({
    utmSource: utm.source,
    utmMedium: utm.medium,
    utmCampaign: utm.campaign,
    origen,
    fbclid: cfText(cfs, F.fbclid),
    fbAdId: cfText(cfs, F.fbAdId),
    tiktokAdId: cfText(cfs, F.tiktokAdId) ?? cfText(cfs, F.ttadId),
    sourceId: sourceId ?? null,
    tags,
  });

  const contactId = mainContactId(l);
  const contact = contactId ? ctx.contacts.get(contactId) : undefined;
  const [zona] = clasificarZona({ ciudad: contact?.ciudad });
  const advisorId = l.responsible_user_id ? String(l.responsible_user_id) : null;
  const advisor = advisorId ? ctx.advisors.get(advisorId) : undefined;
  const zonaEfectiva = ASIGNABLE.has(zona)
    ? zona
    : (advisor?.zona ?? (sourceId != null ? (KENET.sources.zonaPorSource[sourceId] ?? null) : null));

  const createdAt = toIso(l.created_at) ?? ctx.nowIso;
  const id = String(l.id);
  const lossReasonName = l._embedded?.loss_reason?.name ?? (l.loss_reason_id ? ctx.lossReasons.get(l.loss_reason_id) : undefined);

  return {
    id,
    name: l.name || `Lead #${l.id}`,
    value: Number(l.price) || 0,
    advisorId,
    pipelineId: String(l.pipeline_id),
    stageId: String(l.status_id),
    status: leadStatus(l.status_id),
    createdAt,
    updatedAt: toIso(l.updated_at) ?? createdAt,
    closedAt: toIso(l.closed_at),
    lossReason: lossReasonName,
    tags,
    url: `${ctx.baseUrl}/leads/detail/${l.id}`,
    contactId,
    phoneKey: contact?.phoneKey,
    ciudad: contact?.ciudad,
    zona,
    zonaEfectiva,
    canal,
    origen,
    utm,
    adId: utm.term || (utm.content && /^\d+$/.test(utm.content) ? utm.content : undefined),
    sourceId,
    interes: contact?.interes,
    reciboRecibido: cfBool(cfs, F.reciboRecibido) ?? false,
    iaActiva: cfBool(cfs, F.ia),
    intentosLlamada: Number(cfText(cfs, F.intentosLlamada)) || 0,
    cotizacionEntregadaAt: cfDate(cfs, F.cotizacionEntregada),
    levantamientoAt: cfDate(cfs, F.levantamientoSolicitado),
    ultimaAsignacionAt: maxIso(contact?.ultimaAsignacionAt, ctx.assignLast.get(id)) ?? createdAt,
    msgsCliente: ctx.msgCount.get(id) ?? 0,
  };
}

function normalizeTask(t: KommoTask, nowIso: string): Task {
  return {
    id: String(t.id),
    advisorId: t.responsible_user_id ? String(t.responsible_user_id) : null,
    leadId: t.entity_type === "leads" && t.entity_id ? String(t.entity_id) : null,
    text: t.text,
    dueAt: toIso(t.complete_till) ?? nowIso,
    completed: Boolean(t.is_completed),
    taskTypeId: t.task_type_id != null ? String(t.task_type_id) : undefined,
    updatedAt: toIso(t.updated_at) ?? undefined,
  };
}

function responsibleAfter(e: KommoEvent): string | null {
  const after = Array.isArray(e.value_after) ? (e.value_after[0] as { responsible_user?: { id?: number } } | undefined) : undefined;
  const id = after?.responsible_user?.id;
  return id ? String(id) : null;
}

/** Colapsa las patas de Twilio (ventana de 15 s por entidad) en una llamada. */
function collapseCalls(notes: CallNote[]): CallNote[] {
  const sorted = [...notes].sort((a, b) =>
    a.entity !== b.entity ? (a.entity < b.entity ? -1 : 1) : a.entityId.localeCompare(b.entityId) || a.ts - b.ts,
  );
  const out: Array<CallNote & { fin: number }> = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && last.entity === n.entity && last.entityId === n.entityId && n.ts - last.fin <= CALL_DEDUP_SEC) {
      last.fin = n.ts;
      if (n.duration > last.duration) last.duration = n.duration; // la pata con conversación manda
      continue;
    }
    out.push({ ...n, fin: n.ts });
  }
  return out;
}

interface ActivityInput {
  leads: Map<string, Lead>;
  completedTasks: KommoTask[];
  callNotes: CallNote[];
  assignEvents: KommoEvent[];
}

function buildActivities({ leads, completedTasks, callNotes, assignEvents }: ActivityInput): Activity[] {
  const out: Activity[] = [];
  const leadByContact = new Map<string, Lead>();
  for (const l of leads.values()) {
    if (!l.contactId) continue;
    const prev = leadByContact.get(l.contactId);
    // el lead abierto manda; a igual estado, el más reciente
    if (!prev || (prev.status !== "open" && l.status === "open") || (prev.status === l.status && l.createdAt > prev.createdAt)) {
      leadByContact.set(l.contactId, l);
    }
  }

  for (const t of completedTasks) {
    if (t.entity_type !== "leads" || !t.entity_id) continue;
    const lead = leads.get(String(t.entity_id));
    const ts = toIso(t.updated_at ?? t.complete_till);
    if (!lead || !ts) continue;
    out.push({
      id: `tarea:${t.id}`,
      ts,
      tipo: "tarea",
      advisorId: t.responsible_user_id ? String(t.responsible_user_id) : lead.advisorId,
      leadId: lead.id,
      pipelineId: lead.pipelineId,
    });
  }

  for (const c of collapseCalls(callNotes)) {
    const lead = c.entity === "leads" ? leads.get(c.entityId) : leadByContact.get(c.entityId);
    const ts = toIso(c.ts);
    if (!lead || !ts) continue;
    // El responsable de la nota es el token que la escribió (la bitácora firma
    // todo con la cuenta admin): el asesor es el dueño del lead.
    out.push({
      id: `llamada:${c.noteId}`,
      ts,
      tipo: c.duration > 0 ? "llamada_ok" : "llamada_no",
      advisorId: lead.advisorId,
      leadId: lead.id,
      pipelineId: lead.pipelineId,
    });
  }

  for (const l of leads.values()) {
    if (l.cotizacionEntregadaAt) {
      out.push({ id: `cotizacion:${l.id}`, ts: l.cotizacionEntregadaAt, tipo: "cotizacion", advisorId: l.advisorId, leadId: l.id, pipelineId: l.pipelineId });
    }
    if (l.levantamientoAt) {
      out.push({ id: `levantamiento:${l.id}`, ts: l.levantamientoAt, tipo: "levantamiento", advisorId: l.advisorId, leadId: l.id, pipelineId: l.pipelineId });
    }
    if (l.status === "lost" && l.closedAt && l.lossReason) {
      out.push({ id: `descarte:${l.id}`, ts: l.closedAt, tipo: "descarte", advisorId: l.advisorId, leadId: l.id, pipelineId: l.pipelineId });
    }
  }

  for (const e of assignEvents) {
    const lead = leads.get(String(e.entity_id));
    const ts = toIso(e.created_at);
    if (!lead || !ts) continue;
    out.push({ id: `asignacion:${e.id}`, ts, tipo: "asignacion", advisorId: responsibleAfter(e) ?? lead.advisorId, leadId: lead.id, pipelineId: lead.pipelineId });
  }

  return out;
}

/** Une actividades nuevas con las previas: por id, y las llamadas también por ventana de 15 s. */
function mergeActivities(prev: Activity[], fresh: Activity[]): Activity[] {
  const byId = new Map(prev.map((a) => [a.id, a]));
  const callKeys = new Map<string, number[]>();
  for (const a of prev) {
    if (a.tipo.startsWith("llamada")) {
      const arr = callKeys.get(a.leadId) ?? [];
      arr.push(Date.parse(a.ts));
      callKeys.set(a.leadId, arr);
    }
  }
  for (const a of fresh) {
    if (byId.has(a.id)) continue;
    if (a.tipo.startsWith("llamada")) {
      const t = Date.parse(a.ts);
      const vistos = callKeys.get(a.leadId) ?? [];
      if (vistos.some((v) => Math.abs(v - t) <= CALL_DEDUP_SEC * 1000)) continue;
      vistos.push(t);
      callKeys.set(a.leadId, vistos);
    }
    byId.set(a.id, a);
  }
  return [...byId.values()].sort((a, b) => a.ts.localeCompare(b.ts));
}

function allowedPipelines(cfg: KommoConfig, pipelines: Pipeline[]): Set<string> {
  if (cfg.pipelines) return cfg.pipelines;
  return new Set(pipelines.filter((p) => !p.isArchived).map((p) => p.id));
}

function countBy(events: KommoEvent[], afterMs: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events) {
    if (e.created_at * 1000 <= afterMs) continue;
    const key = String(e.entity_id);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

function lastAssignBy(events: KommoEvent[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of events) {
    const key = String(e.entity_id);
    const iso = toIso(e.created_at);
    if (!iso) continue;
    const prev = out.get(key);
    if (!prev || iso > prev) out.set(key, iso);
  }
  return out;
}

function maxEventIso(events: KommoEvent[], fallback: string | undefined): string {
  let best = fallback ?? "";
  for (const e of events) {
    const iso = toIso(e.created_at) ?? "";
    if (iso > best) best = iso;
  }
  return best || new Date(0).toISOString();
}

function maxLeadUpdatedIso(leads: Iterable<Lead>, fallback: string | undefined): string {
  let best = fallback ?? "";
  for (const l of leads) if (l.updatedAt > best) best = l.updatedAt;
  return best || new Date(0).toISOString();
}

// --- La fuente ---------------------------------------------------------------------------

let lastRequests = 0;

export const kommoSource: DataSource = {
  id: "kommo",
  label: "Kommo CRM",

  isConfigured: () => readKommoConfig() !== null,

  lastRequestCount: () => lastRequests,

  /** Corte completo de la ventana KOMMO_LOOKBACK_DAYS. */
  async fetchSnapshot(): Promise<Snapshot> {
    const cfg = readKommoConfig();
    if (!cfg) throw new Error("Kommo no está configurado: faltan KOMMO_SUBDOMAIN y/o KOMMO_LONG_TOKEN.");
    const client = new KommoClient(cfg);
    const nowIso = new Date().toISOString();
    const sinceUnix = Math.floor(Date.now() / 1000) - cfg.lookbackDays * 86_400;

    try {
      const catalog = await fetchCatalog(client);
      const pipelines = normalizePipelines(catalog);
      const allowed = allowedPipelines(cfg, pipelines);
      const rawLeads = (await fetchLeadsWindow(client, sinceUnix)).filter((l) => !l.is_deleted && allowed.has(String(l.pipeline_id)));

      const contactIds = rawLeads.map(mainContactId).filter((id): id is string => Boolean(id));
      const rawContacts = await fetchContacts(client, contactIds);
      const contacts = new Map<string, Contact>();
      for (const [id, c] of rawContacts) contacts.set(id, normalizeContact(c));

      const openTasks = await fetchOpenTasks(client);
      const completedTasks = await fetchCompletedTasks(client, sinceUnix);
      const msgEvents = await fetchLeadEvents(client, TIPOS_MENSAJE_CLIENTE, sinceUnix);
      const assignEvents = await fetchLeadEvents(client, TIPO_CAMBIO_RESPONSABLE, sinceUnix);
      const callNotes = await fetchCallNotes(client, sinceUnix);

      const advisorsList = normalizeAdvisors(catalog);
      const advisors = new Map(advisorsList.map((a) => [a.id, a]));
      const ctx: LeadContext = {
        baseUrl: client.baseUrl,
        advisors,
        contacts,
        lossReasons: catalog.lossReasons,
        msgCount: countBy(msgEvents, 0),
        assignLast: lastAssignBy(assignEvents),
        nowIso,
      };
      const leads = new Map<string, Lead>();
      for (const l of rawLeads) leads.set(String(l.id), normalizeLead(l, ctx));

      // Asesores que aparecen en leads pero no en /users (token sin permiso o usuario borrado).
      for (const l of leads.values()) {
        if (l.advisorId && !advisors.has(l.advisorId)) {
          const a: Advisor = { id: l.advisorId, name: `Usuario ${l.advisorId}`, active: true, vendedor: true, zona: null };
          advisors.set(a.id, a);
          advisorsList.push(a);
        }
      }

      const activities = buildActivities({ leads, completedTasks, callNotes, assignEvents });
      const warnings = [...catalog.warnings];
      if (leads.size === 0) warnings.push(`Kommo no devolvió leads en los últimos ${cfg.lookbackDays} días.`);

      const cursor: SyncCursor = {
        leadsUpdatedAt: maxLeadUpdatedIso(leads.values(), undefined),
        eventsAt: maxEventIso([...msgEvents, ...assignEvents], undefined),
        windowFrom: new Date(sinceUnix * 1000).toISOString(),
      };

      return {
        source: "kommo",
        sourceLabel: "Kommo CRM",
        demo: false,
        fetchedAt: nowIso,
        account: catalog.account ? { name: catalog.account.name, subdomain: catalog.account.subdomain } : undefined,
        advisors: advisorsList,
        pipelines,
        leads: [...leads.values()],
        contacts: [...contacts.values()],
        tasks: openTasks.map((t) => normalizeTask(t, nowIso)).filter((t) => t.leadId),
        activities,
        lossReasons: Object.fromEntries([...catalog.lossReasons].map(([k, v]) => [String(k), v])),
        warnings,
        cursor,
      };
    } finally {
      lastRequests = client.requests;
    }
  },

  /** Solo lo tocado desde `sinceIso` (con margen), fusionado sobre el snapshot previo. */
  async fetchIncremental(prev: Snapshot, sinceIso: string): Promise<Snapshot> {
    const cfg = readKommoConfig();
    if (!cfg) throw new Error("Kommo no está configurado: faltan KOMMO_SUBDOMAIN y/o KOMMO_LONG_TOKEN.");
    const client = new KommoClient(cfg);
    const nowIso = new Date().toISOString();
    const sinceUnix = Math.max(0, Math.floor(Date.parse(sinceIso) / 1000) - INCREMENTAL_OVERLAP_SEC);

    try {
      const catalog = await fetchCatalog(client);
      const pipelines = normalizePipelines(catalog);
      const allowed = allowedPipelines(cfg, pipelines);
      const changed = (await fetchLeadsUpdatedSince(client, sinceUnix)).filter((l) => !l.is_deleted && allowed.has(String(l.pipeline_id)));

      const contacts = new Map(prev.contacts.map((c) => [c.id, c]));
      const contactIds = changed.map(mainContactId).filter((id): id is string => Boolean(id));
      for (const [id, c] of await fetchContacts(client, contactIds)) contacts.set(id, normalizeContact(c));

      const openTasks = await fetchOpenTasks(client);
      const completedTasks = await fetchCompletedTasks(client, sinceUnix);
      const msgEvents = await fetchLeadEvents(client, TIPOS_MENSAJE_CLIENTE, sinceUnix);
      const assignEvents = await fetchLeadEvents(client, TIPO_CAMBIO_RESPONSABLE, sinceUnix);
      const callNotes = await fetchCallNotes(client, sinceUnix);

      const advisorsList = normalizeAdvisors(catalog);
      const advisors = new Map(advisorsList.map((a) => [a.id, a]));
      const prevEventsMs = prev.cursor ? Date.parse(prev.cursor.eventsAt) : 0;
      const newMsgCount = countBy(msgEvents, prevEventsMs);
      const newAssignEvents = assignEvents.filter((e) => e.created_at * 1000 > prevEventsMs);

      const prevMsgs = new Map(prev.leads.map((l) => [l.id, l.msgsCliente]));
      const leads = new Map(prev.leads.map((l) => [l.id, l]));
      // Mensajes nuevos también para leads que no cambiaron de updated_at.
      for (const [id, n] of newMsgCount) {
        const l = leads.get(id);
        if (l) leads.set(id, { ...l, msgsCliente: l.msgsCliente + n });
      }
      const ctx: LeadContext = {
        baseUrl: client.baseUrl,
        advisors,
        contacts,
        lossReasons: catalog.lossReasons,
        msgCount: new Map(),
        assignLast: lastAssignBy(assignEvents),
        nowIso,
      };
      for (const raw of changed) {
        const id = String(raw.id);
        const previo = leads.get(id);
        const fresh = normalizeLead(raw, ctx);
        leads.set(id, {
          ...fresh,
          // prevMsgs y no `previo`: a los leads con mensajes nuevos ya se les sumó arriba.
          msgsCliente: (prevMsgs.get(id) ?? 0) + (newMsgCount.get(id) ?? 0),
          ultimaAsignacionAt: maxIso(previo?.ultimaAsignacionAt, fresh.ultimaAsignacionAt) ?? fresh.createdAt,
        });
      }
      for (const l of leads.values()) {
        if (l.advisorId && !advisors.has(l.advisorId)) {
          const a: Advisor = { id: l.advisorId, name: `Usuario ${l.advisorId}`, active: true, vendedor: true, zona: null };
          advisors.set(a.id, a);
          advisorsList.push(a);
        }
      }

      const fresh = buildActivities({ leads, completedTasks, callNotes, assignEvents: newAssignEvents });
      const activities = mergeActivities(prev.activities, fresh);

      const cursor: SyncCursor = {
        leadsUpdatedAt: maxLeadUpdatedIso(leads.values(), prev.cursor?.leadsUpdatedAt),
        eventsAt: maxEventIso([...msgEvents, ...assignEvents], prev.cursor?.eventsAt),
        windowFrom: prev.cursor?.windowFrom ?? new Date(sinceUnix * 1000).toISOString(),
      };

      return {
        source: "kommo",
        sourceLabel: "Kommo CRM",
        demo: false,
        fetchedAt: nowIso,
        account: catalog.account ? { name: catalog.account.name, subdomain: catalog.account.subdomain } : prev.account,
        advisors: advisorsList,
        pipelines,
        leads: [...leads.values()],
        contacts: [...contacts.values()],
        tasks: openTasks.map((t) => normalizeTask(t, nowIso)).filter((t) => t.leadId),
        activities,
        lossReasons: Object.fromEntries([...catalog.lossReasons].map(([k, v]) => [String(k), v])),
        warnings: catalog.warnings,
        cursor,
      };
    } finally {
      lastRequests = client.requests;
    }
  },
};
