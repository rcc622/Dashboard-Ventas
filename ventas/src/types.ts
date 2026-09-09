// Contrato de data/ventas.json (lo escribe ventas_corte.py juntando Kommo + HubSpot).
// Fechas = epoch en segundos. Ids de texto: 'k:<id>' Kommo, 'h:<id>' HubSpot; el asesor
// es un slug de nombre para que la misma persona cuente una sola vez en ambos CRM.

export type Crm = 'kommo' | 'hubspot'
/** zona = la efectiva (la de Configuración manda); zona_crm = la que trae el CRM, para poder volver a ella. */
/** `rol`: el rol de Kommo (KS-VENTAS, KS-TRAINING, KS-SEGUIMIENTO, Administrador); vacío en HubSpot. */
export interface Usuario { id: string; nombre: string; zona: string; zona_crm?: string; crm: Crm[]; ids: Partial<Record<Crm, number | string>>; rol?: string }
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
  /** Ciudad del cliente (contacto en Kommo, deal en HubSpot); opcional porque un corte viejo no la trae. */
  ciudad?: string
  asignacion: number; tareas_completadas: number; ult_tarea: number; ult_llamada: number
  cotizacion: number; recotizaciones?: number; levantamiento: number; ult_actividad: number; cerrado: number
}

export type TipoEvento = 'tarea' | 'llamada_ok' | 'llamada_no' | 'cotizacion' | 'recotizacion' | 'levantamiento' | 'descarte'
export interface Evento { ts: number; tipo: TipoEvento; asesor_id: string | null; lead: string; asignacion: number; embudo: string; crm: Crm }

export interface Tarea { id: string; crm: Crm; lead: string; lead_nombre: string; asesor_id: string | null; texto: string; tipo: string; vence: number; vencida: boolean; link: string }

export interface Fuente { crm: Crm; generado: string; leads: number; eventos: number; tareas: number }
/** App de comisiones (Supabase): la venta que sí se cobró, cruzada con el asesor del CRM por nombre. */
export interface VendedorCom { id: string; nombre: string; zona: string; rol: string; asesor_id: string | null }
export interface VentaReal { id: string; vendedor_id: string | null; asesor_id: string | null; vendedor: string; cliente: string; zona: string; mes: string | null; mes_texto: string; fecha: number | null; monto: number; comisionable: number; cancelada: boolean; liga: string; origen: string; compartida_con: string
  /** Analítica (7-sep); opcionales porque un corte viejo no los trae. */
  paneles?: number; forma_pago?: string; enganche?: boolean; referido_por?: string; bidireccional?: boolean; extras?: number; comision_pagada?: boolean; zona_app?: string; captura?: 'completa' | 'incompleta' }
/** Una opción de pago de una cotización generada; `cot` agrupa las opciones del mismo flyer. */
export interface CotFila { ts: number; cot: string; lead: number | null; asesor: string; suc: string; paneles: number; micro: boolean; ptr: boolean; n: number; plan: string; plazo: number; ppanel: number; total: number }
export interface Cotizaciones { generado?: string; error?: string; dias: number; filas: CotFila[] }
export interface Comisiones { generado?: string; error?: string; vendedores: VendedorCom[]; ventas: VentaReal[] }

export interface Corte {
  generado: string; dias_historia: number; desde: number
  fuentes: Fuente[]
  comisiones?: Comisiones
  /** Cotizaciones generadas en /cotizador (tabla cotizaciones de Supabase): una fila por método de pago del flyer. */
  cotizaciones?: Cotizaciones
  /** Configuración: nombre en la app de comisiones -> slug del CRM ('' = sin asesor). */
  comisiones_map?: Record<string, string>
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
export interface Config { meta_mxn: number; cotizado_x: number; cotizado_dias: number; metas_zona: Record<string, number>; metas: Record<string, number>; ocultos: string[]; equipos: Record<string, string>; comisiones_map: Record<string, string> }

/** Sesión de /ventas (cookie firmada por app.py). uid de un asesor = su slug en el corte. */
export interface Yo { uid: string; rol: 'admin' | 'asesor'; nombre: string }
/** Un acceso por usuario/contraseña (data/ventas_usuarios.json). password solo viaja al guardar. */
/** Cuenta de la plataforma. `usuario` es el correo (o el identificador corto de las cuentas viejas).
 *  `password` solo viaja al crearla o al cambiarla; el servidor nunca la devuelve. */
export interface Acceso { id: string; usuario: string; nombre: string; rol: 'admin' | 'asesor'; activo?: boolean; password?: string; nuevo?: boolean }

/** Rango [ini, fin) en epoch segundos. */
export interface Rango { ini: number; fin: number; label: string }

export type Origen = Crm | 'comisiones' | 'cotizador'
export const CRM_LABEL: Record<Origen, string> = { kommo: 'Kommo', hubspot: 'HubSpot', comisiones: 'Comisiones', cotizador: 'Cotizador' }

/** Estado de «quitar de la asignación» (GET sanciones.json): Kommo = filas de la pestaña «Sanciones 24h»
 *  (por user_id numérico de Kommo); HubSpot = a quién sacó el tablero de su equipo, por asesor. */
export interface FilaSancion { user_id: number; nombre: string; estado: string; motivo: string; hasta: string; por: string }
export interface Sanciones {
  kommo: { configurado: boolean; filas: FilaSancion[]; error: string | null; proximo_corte: string }
  hubspot: { quitados: Record<string, { desde: number; por: string; motivo?: string; primaryTeamId?: string | null }> }
}
