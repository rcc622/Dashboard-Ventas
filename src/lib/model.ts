/**
 * Modelo de datos normalizado del dashboard.
 *
 * Toda fuente (Kommo hoy; HubSpot, Meta Ads, Sheets, mesa de ayuda, comisiones
 * mañana) se traduce a estas estructuras. Las métricas, los exportes y la UI
 * solo conocen este modelo, nunca el formato crudo de cada API.
 */
import type { Canal } from "@/lib/kenet/canal";
import type { Zona } from "@/lib/kenet/zonas";

export type SourceId = "kommo" | "mock";

export type LeadStatus = "open" | "won" | "lost";

export type StageKind = "unsorted" | "open" | "won" | "lost";

export interface Advisor {
  id: string;
  name: string;
  email?: string;
  active: boolean;
  /** false para admins / sistema: sus leads no cuentan como asignados. */
  vendedor: boolean;
  /** Zona del asesor (grupo KS-<zona> en Kommo o tabla de respaldo). */
  zona: string | null;
  grupo?: string;
}

export interface Stage {
  id: string;
  name: string;
  /** Posición dentro del pipeline (0 = primera etapa). */
  order: number;
  kind: StageKind;
  color?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  isMain: boolean;
  isArchived: boolean;
  stages: Stage[];
}

export interface LeadUtm {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

export interface Lead {
  id: string;
  name: string;
  /** Monto en MXN. */
  value: number;
  advisorId: string | null;
  pipelineId: string;
  stageId: string;
  status: LeadStatus;
  /** Fechas en ISO 8601 (UTC). */
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  lossReason?: string;
  tags: string[];
  /** Enlace al registro en el CRM. */
  url?: string;

  // --- Omnicanal -----------------------------------------------------------
  contactId: string | null;
  /** Últimos 10 dígitos del teléfono del contacto: la única llave de dedup. */
  phoneKey?: string;
  /** Ciudad del CONTACTO (picklist de Kommo). */
  ciudad?: string;
  /** Veredicto de cobertura por ciudad (regla canónica zonas.ts). */
  zona: Zona;
  /** Zona operativa: la de la ciudad; si no hay, la del asesor o la del número de WhatsApp. */
  zonaEfectiva: string | null;
  /** Canal de entrada (regla canal.ts). */
  canal: Canal;
  /** Select «Origen» crudo del lead. */
  origen?: string;
  utm: LeadUtm;
  /** id del anuncio (utm_term o utm_content numérico) para cruzar con Meta. */
  adId?: string;
  /** Fuente de chat de Kommo (source_id). */
  sourceId?: number;
  /** Interés del contacto (Mejoravit / Contado / Financiado). */
  interes?: string;

  // --- Operación (mismos campos que el dashboard de Sheets) ----------------
  reciboRecibido: boolean;
  iaActiva?: boolean;
  intentosLlamada: number;
  cotizacionEntregadaAt: string | null;
  levantamientoAt: string | null;
  /** Última asignación real (campo del contacto o historial de responsable; si nunca cambió, createdAt). */
  ultimaAsignacionAt: string | null;
  /** Mensajes entrantes del cliente en la ventana sincronizada. */
  msgsCliente: number;
}

export interface Contact {
  id: string;
  name: string;
  phone?: string;
  phoneKey?: string;
  email?: string;
  ciudad?: string;
  interes?: string;
  advisorId: string | null;
  ultimaAsignacionAt: string | null;
  updatedAt: string;
}

export interface Task {
  id: string;
  advisorId: string | null;
  leadId: string | null;
  text: string;
  dueAt: string;
  completed: boolean;
  taskTypeId?: string;
  updatedAt?: string;
}

export type ActivityType =
  | "tarea"
  | "llamada_ok"
  | "llamada_no"
  | "cotizacion"
  | "levantamiento"
  | "descarte"
  | "asignacion";

/** Un hecho real de trabajo (equivale a una fila de Eventos_Data en Sheets). */
export interface Activity {
  id: string;
  ts: string;
  tipo: ActivityType;
  advisorId: string | null;
  leadId: string;
  pipelineId?: string;
}

export interface SyncCursor {
  /** Máximo updated_at de leads visto (ISO). */
  leadsUpdatedAt: string;
  /** Máximo created_at de eventos visto (ISO). */
  eventsAt: string;
  /** Desde cuándo cubre la ventana sincronizada (ISO). */
  windowFrom: string;
}

export interface Snapshot {
  source: SourceId;
  sourceLabel: string;
  /** true cuando los datos son ficticios (sin CRM configurado). */
  demo: boolean;
  fetchedAt: string;
  account?: { name: string; subdomain?: string };
  advisors: Advisor[];
  pipelines: Pipeline[];
  leads: Lead[];
  contacts: Contact[];
  tasks: Task[];
  activities: Activity[];
  lossReasons: Record<string, string>;
  /** Avisos no fatales (permisos faltantes, datos parciales, modo demo). */
  warnings: string[];
  cursor?: SyncCursor;
}

export type SyncMode = "full" | "incremental";

export interface SyncRun {
  id: string;
  mode: SyncMode;
  reason: string;
  source: SourceId;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  durationMs: number | null;
  requests: number;
  counts: Record<string, number>;
  error: string | null;
}

export interface DataSource {
  id: SourceId;
  label: string;
  /** true si las variables de entorno necesarias están presentes. */
  isConfigured(): boolean;
  /** Corte completo de la ventana configurada. */
  fetchSnapshot(): Promise<Snapshot>;
  /** Solo lo que cambió desde `sinceIso`, fusionado sobre `prev`. Opcional. */
  fetchIncremental?(prev: Snapshot, sinceIso: string): Promise<Snapshot>;
  /** Peticiones hechas a la API en la última llamada (para el registro de corridas). */
  lastRequestCount?(): number;
}
