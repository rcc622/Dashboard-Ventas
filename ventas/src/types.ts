// Contrato de data/ventas.json (lo escribe ventas_corte.py juntando Kommo + HubSpot).
// Fechas = epoch en segundos. Ids de texto: 'k:<id>' Kommo, 'h:<id>' HubSpot; el asesor
// es un slug de nombre para que la misma persona cuente una sola vez en ambos CRM.

export type Crm = 'kommo' | 'hubspot'
/** zona = la efectiva (la de Configuración manda); zona_crm = la que trae el CRM, para poder volver a ella. */
export interface Usuario { id: string; nombre: string; zona: string; zona_crm?: string; crm: Crm[]; ids: Partial<Record<Crm, number | string>> }
export interface Equipo { id: string; nombre: string }          // zonas MTY / SLT / TRC / MVA
export interface Etapa { id: number; nombre: string }           // etapas canónicas del embudo Ventas, en orden
export type Embudo = 'ventas' | 'hunting' | 'cadencia' | 'nuevo'

export interface Lead {
  id: string; crm: Crm; nombre: string; creado: number
  embudo: Embudo; pipeline: string; etapa: string; etapa_id: number
  asesor_id: string | null; asesor: string
  presupuesto: number; recibo: boolean; respondio: boolean
  funnel: 0 | 1 | 2 | 3 | 4 | 5; funnel_label: string
  tareas_abiertas: number; tareas_vencidas: number; pc_vencida: boolean
  tags: string[]; dias_sin_cambio: number; link: string
  msjs: number; llamadas_cf: number; tel: string; sin_tarea: boolean; razon: string
  asignacion: number; tareas_completadas: number; ult_tarea: number; ult_llamada: number
  cotizacion: number; levantamiento: number; ult_actividad: number; cerrado: number
}

export type TipoEvento = 'tarea' | 'llamada_ok' | 'llamada_no' | 'cotizacion' | 'levantamiento' | 'descarte'
export interface Evento { ts: number; tipo: TipoEvento; asesor_id: string | null; lead: string; asignacion: number; embudo: string; crm: Crm }

export interface Tarea { id: string; crm: Crm; lead: string; lead_nombre: string; asesor_id: string | null; texto: string; tipo: string; vence: number; vencida: boolean; link: string }

export interface Fuente { crm: Crm; generado: string; leads: number; eventos: number; tareas: number }

export interface Corte {
  generado: string; dias_historia: number; desde: number
  fuentes: Fuente[]
  usuarios: Usuario[]; equipos: Equipo[]; etapas: Etapa[]
  /** Meta mensual de venta en MXN: por asesor (slug), por zona y la general. Prioridad asesor → zona → general. */
  metas: Record<string, number>; metas_zona: Record<string, number>; meta_mxn: number
  /** Pipeline sano = cotizado vigente ≥ cotizado_x × meta mensual; vigente = cotizado hace ≤ cotizado_dias. */
  cotizado_x: number; cotizado_dias: number
  /** Asesores desactivados desde Configuración (ojo cerrado): fuera del tablero y del menú. */
  ocultos: string[]
  leads: Lead[]; eventos: Evento[]; tareas_abiertas: Tarea[]
}

/** Lo que guarda la página de Configuración en data/ventas_config.json (app.py).
 *  equipos: zona por asesor que manda sobre la del CRM ('-' = sin equipo). */
export interface Config { meta_mxn: number; cotizado_x: number; cotizado_dias: number; metas_zona: Record<string, number>; metas: Record<string, number>; ocultos: string[]; equipos: Record<string, string> }

/** Rango [ini, fin) en epoch segundos. */
export interface Rango { ini: number; fin: number; label: string }

export const CRM_LABEL: Record<Crm, string> = { kommo: 'Kommo', hubspot: 'HubSpot' }
