import type {
  Advisor,
  DataSource,
  Lead,
  Pipeline,
  Snapshot,
  Stage,
  StageKind,
  Task,
} from "@/lib/model";

/**
 * Fuente: Kommo CRM (API v4).
 * Docs: https://developers.kommo.com/reference/kommo-api-reference
 *
 * Autenticación: token de larga duración de una integración privada, enviado
 * como `Authorization: Bearer <token>`. Base URL: https://<subdominio>.kommo.com/api/v4
 */

/** IDs de etapas de sistema, iguales en todas las cuentas de Kommo. */
const STATUS_WON = 142;
const STATUS_LOST = 143;
/** `type: 1` marca la etapa "Leads entrantes" (unsorted). */
const STATUS_TYPE_UNSORTED = 1;

/** Máximo de entidades por página que permite Kommo. */
const PAGE_LIMIT = 250;
/** Kommo limita a 7 req/s por integración; nos quedamos en ~6 req/s. */
const MIN_INTERVAL_MS = 160;
const MAX_RETRIES = 3;

interface KommoConfig {
  /** https://<subdominio>.kommo.com (o KOMMO_BASE_URL si se definió). */
  baseUrl: string;
  token: string;
  lookbackDays: number;
}

interface KommoPage<T> {
  _page?: number;
  _embedded?: Record<string, T[] | undefined>;
  _links?: { self?: { href: string }; next?: { href: string } };
}

interface KommoUser {
  id: number;
  name: string;
  email?: string;
  rights?: { is_active?: boolean; is_admin?: boolean };
}

interface KommoStatus {
  id: number;
  name: string;
  sort: number;
  type: number;
  color?: string;
  pipeline_id: number;
}

interface KommoPipeline {
  id: number;
  name: string;
  sort: number;
  is_main: boolean;
  is_archive: boolean;
  _embedded?: { statuses?: KommoStatus[] };
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
  is_deleted?: boolean;
  _embedded?: {
    tags?: { id: number; name: string }[];
    loss_reason?: { id: number; name: string } | null;
    source?: { id: number; name: string } | null;
  };
}

interface KommoTask {
  id: number;
  responsible_user_id: number | null;
  entity_id: number | null;
  entity_type: string | null;
  text: string;
  is_completed: boolean;
  complete_till: number;
}

interface KommoAccount {
  id: number;
  name: string;
  subdomain: string;
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

function readConfig(): KommoConfig | null {
  const subdomain = process.env.KOMMO_SUBDOMAIN?.trim();
  const token = process.env.KOMMO_ACCESS_TOKEN?.trim();
  const baseUrlOverride = process.env.KOMMO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!token || (!subdomain && !baseUrlOverride)) return null;
  const baseDomain = process.env.KOMMO_BASE_DOMAIN?.trim() || "kommo.com";
  return {
    baseUrl: baseUrlOverride || `https://${subdomain}.${baseDomain}`,
    token,
    lookbackDays: Number(process.env.KOMMO_LOOKBACK_DAYS) || 180,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toIso = (unixSeconds: number | null | undefined): string | null =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;

type Params = Record<string, string | number | undefined>;

class KommoClient {
  private lastRequestAt = 0;

  constructor(private readonly cfg: KommoConfig) {}

  get baseUrl(): string {
    return this.cfg.baseUrl;
  }

  /** GET a la API v4. Devuelve `null` cuando Kommo responde 204 (colección vacía). */
  async get<T>(path: string, params: Params = {}): Promise<T | null> {
    const url = new URL(`/api/v4${path}`, this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    for (let attempt = 0; ; attempt++) {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.cfg.token}`,
          Accept: "application/json",
        },
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
      return (await res.json()) as T;
    }
  }

  /** Recorre todas las páginas de una colección (`_embedded[key]`). */
  async getAll<T>(path: string, key: string, params: Params = {}): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; ; page++) {
      const data = await this.get<KommoPage<T>>(path, { ...params, page, limit: PAGE_LIMIT });
      const batch = data?._embedded?.[key] ?? [];
      items.push(...batch);
      if (batch.length < PAGE_LIMIT) return items;
    }
  }
}

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

export const kommoSource: DataSource = {
  id: "kommo",
  label: "Kommo CRM",

  isConfigured: () => readConfig() !== null,

  async fetchSnapshot(): Promise<Snapshot> {
    const cfg = readConfig();
    if (!cfg) {
      throw new Error("Kommo no está configurado: faltan KOMMO_SUBDOMAIN y/o KOMMO_ACCESS_TOKEN.");
    }
    const client = new KommoClient(cfg);
    const warnings: string[] = [];
    const nowIso = new Date().toISOString();
    const since = Math.floor(Date.now() / 1000) - cfg.lookbackDays * 86_400;

    const account = await client.get<KommoAccount>("/account");

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

    const rawPipelines =
      (await client.get<KommoPage<KommoPipeline>>("/leads/pipelines"))?._embedded?.pipelines ?? [];

    const rawLeads = await client.getAll<KommoLead>("/leads", "leads", {
      with: "loss_reason,source",
      "filter[updated_at][from]": since,
      "order[updated_at]": "desc",
    });

    const rawTasks = await client.getAll<KommoTask>("/tasks", "tasks", {
      "filter[is_completed]": 0,
    });

    const pipelines: Pipeline[] = rawPipelines.map((p) => ({
      id: String(p.id),
      name: p.name,
      isMain: Boolean(p.is_main),
      isArchived: Boolean(p.is_archive),
      stages: [...(p._embedded?.statuses ?? [])]
        .sort((a, b) => a.sort - b.sort)
        .map<Stage>((s, index) => ({
          id: String(s.id),
          name: s.name,
          order: index,
          kind: stageKind(s),
          color: s.color,
        })),
    }));

    const leads: Lead[] = rawLeads
      .filter((l) => !l.is_deleted)
      .map((l) => ({
        id: String(l.id),
        name: l.name || `Lead #${l.id}`,
        value: Number(l.price) || 0,
        advisorId: l.responsible_user_id ? String(l.responsible_user_id) : null,
        pipelineId: String(l.pipeline_id),
        stageId: String(l.status_id),
        status: leadStatus(l.status_id),
        createdAt: toIso(l.created_at) ?? nowIso,
        updatedAt: toIso(l.updated_at) ?? toIso(l.created_at) ?? nowIso,
        closedAt: toIso(l.closed_at),
        lossReason: l._embedded?.loss_reason?.name ?? undefined,
        channel: l._embedded?.source?.name ?? undefined,
        tags: (l._embedded?.tags ?? []).map((t) => t.name),
        url: `${client.baseUrl}/leads/detail/${l.id}`,
      }));

    const advisors: Advisor[] = users.map((u) => ({
      id: String(u.id),
      name: u.name,
      email: u.email,
      active: u.rights?.is_active ?? true,
    }));
    const knownIds = new Set(advisors.map((a) => a.id));
    for (const lead of leads) {
      if (lead.advisorId && !knownIds.has(lead.advisorId)) {
        knownIds.add(lead.advisorId);
        advisors.push({ id: lead.advisorId, name: `Usuario ${lead.advisorId}`, active: true });
      }
    }

    const tasks: Task[] = rawTasks.map((t) => ({
      id: String(t.id),
      advisorId: t.responsible_user_id ? String(t.responsible_user_id) : null,
      leadId: t.entity_type === "leads" && t.entity_id ? String(t.entity_id) : null,
      text: t.text,
      dueAt: toIso(t.complete_till) ?? nowIso,
      completed: Boolean(t.is_completed),
    }));

    if (leads.length === 0) {
      warnings.push(`Kommo no devolvió leads con actividad en los últimos ${cfg.lookbackDays} días.`);
    }

    return {
      source: "kommo",
      sourceLabel: "Kommo CRM",
      demo: false,
      fetchedAt: nowIso,
      account: account ? { name: account.name, subdomain: account.subdomain } : undefined,
      advisors,
      pipelines,
      leads,
      tasks,
      warnings,
    };
  },
};
