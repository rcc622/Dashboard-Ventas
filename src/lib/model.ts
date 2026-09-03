/**
 * Modelo de datos normalizado del dashboard.
 *
 * Toda fuente (Kommo hoy; HubSpot, Meta Ads, Sheets, etc. mañana) se traduce a
 * estas estructuras. Las métricas y la UI solo conocen este modelo, nunca el
 * formato crudo de cada API.
 */

export type SourceId = "kommo" | "mock";

export type LeadStatus = "open" | "won" | "lost";

export type StageKind = "unsorted" | "open" | "won" | "lost";

export interface Advisor {
  id: string;
  name: string;
  email?: string;
  active: boolean;
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
  /** Canal / origen del lead (WhatsApp, Web Form, TikTok...). */
  channel?: string;
  tags: string[];
  /** Enlace al registro en el CRM. */
  url?: string;
}

export interface Task {
  id: string;
  advisorId: string | null;
  leadId: string | null;
  text: string;
  dueAt: string;
  completed: boolean;
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
  tasks: Task[];
  /** Avisos no fatales (permisos faltantes, datos parciales, modo demo). */
  warnings: string[];
}

export interface DataSource {
  id: SourceId;
  label: string;
  /** true si las variables de entorno necesarias están presentes. */
  isConfigured(): boolean;
  fetchSnapshot(): Promise<Snapshot>;
}
