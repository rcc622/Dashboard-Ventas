import { useMemo, useRef, useState } from 'react'
import type { Corte, Evento, Lead, Tarea, Usuario, VentaReal } from './types'
import { CRM_LABEL } from './types'
import {
  cotizadoVigenteDe, enRango, etapaDe, fechaDe, filasDeEventos, filasDeLeads, filasDeVentasReales, fmtCorta, fmtMoney0, fmtN,
  inicioDia, mapaUsuarios, ocultosDe, pasaCrm, primerContacto, vivo, zonaNombre, type Filtros,
} from './metrics'
import { BarChart, DonutChart, HBarList, LineChart, useEscape, useFocoDialogo } from './components'
import type { Drill } from './drill'

// Constructor de gráficas (Randall 7-sep: «un graph modifier/builder para que ya no dependamos tanto de ti»).
// Una gráfica = QUÉ se mide (medida) × CÓMO se parte (dimensión) × CÓMO se dibuja (tipo). El mismo motor
// alimenta la galería con vista previa, el editor y el widget final; cada barra abre el detalle de sus
// registros, igual que el resto del tablero. Regla de dataviz que se respeta: una sola escala por gráfica
// (el segundo dato va como texto), líneas solo para tiempo, dona solo para partes de un total.

export type TipoGrafica = 'hbar' | 'vbar' | 'linea' | 'dona' | 'cifra' | 'tabla'
export interface Grafica {
  id: string; titulo: string; medida: string; dim: string; tipo: TipoGrafica
  top?: number; captura?: 'completa' | 'incompleta'; span?: number; alto?: number
}
export const TIPOS: { id: TipoGrafica; label: string }[] = [
  { id: 'hbar', label: 'Barras horizontales' }, { id: 'vbar', label: 'Barras verticales' },
  { id: 'linea', label: 'Línea' }, { id: 'dona', label: 'Dona' }, { id: 'cifra', label: 'Cifra' }, { id: 'tabla', label: 'Tabla' },
]

// ---------------------------------------------------------------- medidas
interface Item { v: number; v2?: number; lead?: Lead; ev?: Evento; tar?: Tarea; vr?: VentaReal }
type Agg = 'suma' | 'promedio' | 'razon'
interface Medida {
  id: string; label: string; grupo: 'Actividad' | 'Seguimiento' | 'Ventas' | 'Ventas reales'
  fmt: (n: number) => string; agg?: Agg; ayuda: string
  items: (c: Corte, f: Filtros) => Item[]
  fecha?: (it: Item) => number | undefined
  dims: string[]
}
const DIMS_CRM = ['asesor', 'equipo', 'crm', 'etapa', 'mes', 'semana', 'dia', 'ninguna']
const DIMS_COM = ['asesor', 'zona_app', 'origen', 'forma_pago', 'tamano', 'mes', 'ninguna']
const activos = (c: Corte, f: Filtros) => leadsDe(c, f).filter(vivo)
/** Leads del rango con los filtros de la barra (misma regla que el resto del tablero). */
function leadsDe(c: Corte, f: Filtros): Lead[] {
  const users = mapaUsuarios(c), oc = ocultosDe(c)
  return c.leads.filter((l) => pasaCrm(l.crm, f) && enRango(l.asignacion, f.rango)
    && (f.asesor != null ? l.asesor_id === f.asesor : !(l.asesor_id != null && oc.has(l.asesor_id)) && (f.equipo == null || (l.asesor_id != null && users.get(l.asesor_id)?.zona === f.equipo))))
}
function eventosDe(c: Corte, f: Filtros, tipos: string[]): Evento[] {
  const users = mapaUsuarios(c), oc = ocultosDe(c)
  return c.eventos.filter((e) => tipos.includes(e.tipo) && pasaCrm(e.crm, f) && enRango(e.ts, f.rango)
    && (f.asesor != null ? e.asesor_id === f.asesor : !(e.asesor_id != null && oc.has(e.asesor_id)) && (f.equipo == null || (e.asesor_id != null && users.get(e.asesor_id)?.zona === f.equipo))))
}
/** Tareas abiertas: son foto de HOY, no del rango (como el reporte de HubSpot). */
function tareasDe(c: Corte, f: Filtros, soloVencidas: boolean): Tarea[] {
  const users = mapaUsuarios(c), oc = ocultosDe(c)
  const cerrados = new Set(c.leads.filter((l) => !vivo(l)).map((l) => l.id))
  return c.tareas_abiertas.filter((t) => (!soloVencidas || t.vencida) && !cerrados.has(t.lead) && pasaCrm(t.crm, f)
    && (f.asesor != null ? t.asesor_id === f.asesor : !(t.asesor_id != null && oc.has(t.asesor_id)) && (f.equipo == null || (t.asesor_id != null && users.get(t.asesor_id)?.zona === f.equipo))))
}
const ventasDe = (c: Corte, f: Filtros) => {
  const users = mapaUsuarios(c), oc = ocultosDe(c)
  return c.leads.filter((l) => pasaCrm(l.crm, f) && l.funnel === 5 && enRango(l.cerrado, f.rango)
    && (f.asesor != null ? l.asesor_id === f.asesor : !(l.asesor_id != null && oc.has(l.asesor_id)) && (f.equipo == null || (l.asesor_id != null && users.get(l.asesor_id)?.zona === f.equipo))))
}
function realesDe(c: Corte, f: Filtros, captura?: 'completa' | 'incompleta'): VentaReal[] {
  const com = c.comisiones
  if (!com) return []
  const users = mapaUsuarios(c)
  const fin = (t: number) => { const d = fechaDe(t); return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() / 1000 }
  return com.ventas.filter((v) => !v.cancelada && v.fecha != null && v.fecha < f.rango.fin && fin(v.fecha) > f.rango.ini
    && (f.asesor != null ? v.asesor_id === f.asesor : f.equipo == null || v.zona === f.equipo || (v.asesor_id != null && users.get(v.asesor_id)?.zona === f.equipo))
    && (!captura || (v.captura || 'incompleta') === captura))
}
const uno = <T,>(xs: T[], k: (x: T) => Item): Item[] => xs.map(k)
export const MEDIDAS: Medida[] = [
  // Actividad registrada en el rango
  { id: 'llamadas', label: 'Llamadas realizadas', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Llamadas registradas en el CRM dentro de las fechas elegidas.', items: (c, f) => uno(eventosDe(c, f, ['llamada_ok', 'llamada_no']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'contestadas', label: 'Llamadas contestadas', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Llamadas con duración mayor que cero.', items: (c, f) => uno(eventosDe(c, f, ['llamada_ok']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'sin_contestar', label: 'Llamadas sin contestar', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Llamadas que duraron cero.', items: (c, f) => uno(eventosDe(c, f, ['llamada_no']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'tareas_hechas', label: 'Tareas completadas', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Tareas que el asesor marcó como terminadas dentro de las fechas elegidas.', items: (c, f) => uno(eventosDe(c, f, ['tarea']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'cotizaciones', label: 'Cotizaciones entregadas', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Primera vez que el lead pasó a «Propuesta entregada» dentro de las fechas elegidas.', items: (c, f) => uno(eventosDe(c, f, ['cotizacion']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'levantamientos', label: 'Levantamientos solicitados', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Visitas técnicas solicitadas dentro de las fechas elegidas.', items: (c, f) => uno(eventosDe(c, f, ['levantamiento']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'descartes', label: 'Descartados', grupo: 'Actividad', fmt: fmtN, dims: [...DIMS_CRM, 'razon'], ayuda: 'Leads descartados dentro de las fechas elegidas, por la fecha del descarte.', items: (c, f) => uno(eventosDe(c, f, ['descarte']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'pc_hecho', label: 'Primer contacto completado', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Leads asignados en las fechas elegidas a los que ya se les hizo la primera llamada o tarea. Solo Kommo.', items: (c, f) => uno(primerContacto(c, leadsDe(c, f)).con, (x) => ({ v: 1, lead: x.lead })), fecha: (i) => i.lead?.asignacion },
  // Seguimiento: foto de hoy
  { id: 'tareas_vencidas', label: 'Tareas vencidas', grupo: 'Seguimiento', fmt: fmtN, dims: ['asesor', 'equipo', 'crm', 'etapa', 'ninguna'], ayuda: 'Tareas abiertas cuya fecha ya pasó, contadas hoy (no dependen de las fechas de arriba).', items: (c, f) => uno(tareasDe(c, f, true), (t) => ({ v: 1, tar: t })) },
  { id: 'tareas_abiertas', label: 'Tareas agendadas', grupo: 'Seguimiento', fmt: fmtN, dims: ['asesor', 'equipo', 'crm', 'etapa', 'ninguna'], ayuda: 'Tareas abiertas hoy en leads que siguen en juego, vencidas o por vencer.', items: (c, f) => uno(tareasDe(c, f, false), (t) => ({ v: 1, tar: t })) },
  { id: 'sin_tarea', label: 'Leads sin tarea', grupo: 'Seguimiento', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Leads en juego sin ninguna tarea pendiente: nadie los está siguiendo.', items: (c, f) => uno(activos(c, f).filter((l) => l.sin_tarea), (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.asignacion },
  { id: 'pc_vencido', label: 'Primer contacto vencido', grupo: 'Seguimiento', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Leads en juego a los que se les pasó la fecha de la tarea de primer contacto. Solo Kommo.', items: (c, f) => uno(activos(c, f).filter((l) => l.pc_vencida), (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.asignacion },
  { id: 'estancados', label: 'Leads estancados', grupo: 'Seguimiento', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Leads en juego con más de 7 días sin ningún cambio en el CRM.', items: (c, f) => uno(activos(c, f).filter((l) => l.dias_sin_cambio > 7), (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.asignacion },
  { id: 'leads', label: 'Leads asignados', grupo: 'Seguimiento', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Leads que se repartieron a los asesores en las fechas elegidas.', items: (c, f) => uno(leadsDe(c, f), (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.asignacion },
  { id: 'activos', label: 'Leads en juego', grupo: 'Seguimiento', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Leads asignados en las fechas elegidas que no se han cerrado ni descartado.', items: (c, f) => uno(activos(c, f), (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.asignacion },
  { id: 'cotizado', label: 'Cotizado vigente', grupo: 'Seguimiento', fmt: fmtMoney0, dims: DIMS_CRM, ayuda: 'Dinero en juego: precio de los leads activos cuya cotización tiene 90 días o menos.', items: (c, f) => uno(cotizadoVigenteDe(activos(c, f), c.cotizado_dias), (l) => ({ v: l.presupuesto, lead: l })), fecha: (i) => i.lead?.asignacion },
  // Ventas del CRM
  { id: 'ventas', label: 'Clientes cerrados', grupo: 'Ventas', fmt: fmtN, dims: DIMS_CRM, ayuda: 'Ventas que el CRM marcó como ganadas dentro de las fechas elegidas.', items: (c, f) => uno(ventasDe(c, f), (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.cerrado },
  { id: 'vendido', label: 'Monto vendido', grupo: 'Ventas', fmt: fmtMoney0, dims: DIMS_CRM, ayuda: 'Suma del precio de las ventas cerradas en las fechas elegidas.', items: (c, f) => uno(ventasDe(c, f), (l) => ({ v: l.presupuesto, lead: l })), fecha: (i) => i.lead?.cerrado },
  { id: 'ticket_crm', label: 'Ticket promedio del CRM', grupo: 'Ventas', fmt: fmtMoney0, agg: 'promedio', dims: DIMS_CRM, ayuda: 'Precio promedio de cada venta cerrada en el CRM.', items: (c, f) => uno(ventasDe(c, f), (l) => ({ v: l.presupuesto, lead: l })), fecha: (i) => i.lead?.cerrado },
  // Ventas reales (app de comisiones)
  { id: 'r_ventas', label: 'Ventas reales', grupo: 'Ventas reales', fmt: fmtN, dims: DIMS_COM, ayuda: 'Ventas registradas en la app de comisiones, sin canceladas. El mes de la venta manda, no el día.', items: (c, f) => uno(realesDe(c, f), (v) => ({ v: 1, vr: v })), fecha: (i) => i.vr?.fecha ?? undefined },
  { id: 'r_contrato', label: 'Contrato total', grupo: 'Ventas reales', fmt: fmtMoney0, dims: DIMS_COM, ayuda: 'Suma del monto de contrato de la app de comisiones.', items: (c, f) => uno(realesDe(c, f), (v) => ({ v: v.monto, vr: v })), fecha: (i) => i.vr?.fecha ?? undefined },
  { id: 'r_ticket', label: 'Ticket promedio', grupo: 'Ventas reales', fmt: fmtMoney0, agg: 'promedio', dims: DIMS_COM, ayuda: 'Contrato entre número de ventas: cuánto vale en promedio cada venta.', items: (c, f) => uno(realesDe(c, f), (v) => ({ v: v.monto, vr: v })), fecha: (i) => i.vr?.fecha ?? undefined },
  { id: 'r_paneles', label: 'Paneles vendidos', grupo: 'Ventas reales', fmt: fmtN, dims: DIMS_COM, ayuda: 'Suma de los paneles de las ventas de la app.', items: (c, f) => uno(realesDe(c, f), (v) => ({ v: v.paneles || 0, vr: v })), fecha: (i) => i.vr?.fecha ?? undefined },
  { id: 'r_panel', label: 'Precio por panel', grupo: 'Ventas reales', fmt: fmtMoney0, agg: 'razon', dims: DIMS_COM, ayuda: 'Contrato entre paneles vendidos: cuánto se cobra por cada panel.', items: (c, f) => uno(realesDe(c, f).filter((v) => (v.paneles || 0) > 0), (v) => ({ v: v.monto, v2: v.paneles || 0, vr: v })), fecha: (i) => i.vr?.fecha ?? undefined },
  { id: 'r_enganches', label: 'Enganches pagados', grupo: 'Ventas reales', fmt: fmtN, dims: DIMS_COM, ayuda: 'Ventas de la app que ya tienen el enganche pagado.', items: (c, f) => uno(realesDe(c, f).filter((v) => v.enganche), (v) => ({ v: 1, vr: v })), fecha: (i) => i.vr?.fecha ?? undefined },
]
export const medidaDe = (id: string) => MEDIDAS.find((m) => m.id === id) || MEDIDAS[0]

// ---------------------------------------------------------------- dimensiones
interface Dimension { id: string; label: string; tiempo?: boolean }
export const DIMENSIONES: Dimension[] = [
  { id: 'asesor', label: 'Asesor' }, { id: 'equipo', label: 'Equipo' }, { id: 'crm', label: 'CRM' }, { id: 'etapa', label: 'Etapa del embudo' },
  { id: 'razon', label: 'Razón de descarte' }, { id: 'mes', label: 'Mes', tiempo: true }, { id: 'semana', label: 'Semana', tiempo: true }, { id: 'dia', label: 'Día', tiempo: true },
  { id: 'origen', label: 'Origen de la venta' }, { id: 'forma_pago', label: 'Forma de pago' }, { id: 'zona_app', label: 'Zona de la app' }, { id: 'tamano', label: 'Tamaño en paneles' },
  { id: 'ninguna', label: 'Sin partir (total)' },
]
export const dimensionDe = (id: string) => DIMENSIONES.find((d) => d.id === id) || DIMENSIONES[0]
const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const TAMANOS: [string, number, number][] = [['1 a 4 paneles', 1, 4], ['5 a 8 paneles', 5, 8], ['9 a 12 paneles', 9, 12], ['13 a 16 paneles', 13, 16], ['17 a 20 paneles', 17, 20], ['21 paneles o más', 21, Infinity]]
interface Ctx { corte: Corte; leads: Map<string, Lead>; users: Map<string, Usuario> }
function leadDeItem(it: Item, ctx: Ctx): Lead | undefined {
  if (it.lead) return it.lead
  if (it.ev) return ctx.leads.get(it.ev.lead)
  if (it.tar) return ctx.leads.get(it.tar.lead)
  return undefined
}
function valorDim(it: Item, dim: string, m: Medida, ctx: Ctx): { clave: string; orden?: number } {
  const l = leadDeItem(it, ctx)
  const asesorId = it.lead?.asesor_id ?? it.ev?.asesor_id ?? it.tar?.asesor_id ?? it.vr?.asesor_id ?? null
  switch (dim) {
    case 'asesor': {
      if (it.vr && !it.vr.asesor_id) return { clave: it.vr.vendedor || 'Sin asesor' }
      const u = asesorId ? ctx.users.get(asesorId) : undefined
      return { clave: u?.nombre || 'Sin asesor' }
    }
    case 'equipo': {
      const u = asesorId ? ctx.users.get(asesorId) : undefined
      return { clave: zonaNombre(ctx.corte, (it.vr ? it.vr.zona : u?.zona) || '') }
    }
    case 'crm': return { clave: CRM_LABEL[(it.lead?.crm ?? it.ev?.crm ?? it.tar?.crm) || 'kommo'] || 'Comisiones' }
    case 'etapa': return { clave: l ? etapaDe(l) : 'Sin etapa' }
    case 'razon': return { clave: (l?.razon || '').trim() || 'Sin razón registrada' }
    case 'origen': return { clave: it.vr?.origen || 'Sin origen' }
    case 'forma_pago': return { clave: it.vr?.forma_pago || 'Sin forma de pago' }
    case 'zona_app': return { clave: it.vr?.zona_app || 'Sin zona' }
    case 'tamano': { const p = it.vr?.paneles || 0; const t = TAMANOS.find(([, lo, hi]) => p >= lo && p <= hi); return { clave: t ? t[0] : 'Sin paneles', orden: t ? TAMANOS.indexOf(t) : 99 } }
    case 'mes': case 'semana': case 'dia': {
      const ts = m.fecha?.(it)
      if (!ts) return { clave: 'Sin fecha', orden: Infinity }
      const d = fechaDe(ts)
      if (dim === 'mes') { const p = new Date(d.getFullYear(), d.getMonth(), 1); return { clave: `${MESES_C[p.getMonth()]} ${p.getFullYear()}`, orden: p.getTime() } }
      if (dim === 'semana') { const x = inicioDia(d); const lun = new Date(x); lun.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return { clave: fmtCorta(lun), orden: lun.getTime() } }
      const x = inicioDia(d); return { clave: fmtCorta(x), orden: x.getTime() }
    }
    default: return { clave: 'Total' }
  }
}

// ---------------------------------------------------------------- serie
export interface Grupo { label: string; valor: number; n: number; items: Item[]; orden?: number }
export function serie(c: Corte, f: Filtros, g: Grafica): { grupos: Grupo[]; total: number; m: Medida } {
  const m = medidaDe(g.medida)
  const ctx: Ctx = { corte: c, leads: new Map(c.leads.map((l) => [l.id, l])), users: mapaUsuarios(c) }
  const its = m.items(c, f)
  const filtrados = g.captura ? its.filter((i) => (i.vr?.captura || 'incompleta') === g.captura) : its
  const map = new Map<string, Grupo>()
  for (const it of filtrados) {
    const { clave, orden } = valorDim(it, g.dim, m, ctx)
    const gr = map.get(clave) || { label: clave, valor: 0, n: 0, items: [], orden }
    gr.n++; gr.items.push(it); map.set(clave, gr)
  }
  const agg = m.agg || 'suma'
  const grupos = [...map.values()].map((gr) => {
    const s = gr.items.reduce((a, i) => a + i.v, 0)
    const s2 = gr.items.reduce((a, i) => a + (i.v2 || 0), 0)
    return { ...gr, valor: agg === 'promedio' ? (gr.n ? s / gr.n : 0) : agg === 'razon' ? (s2 ? s / s2 : 0) : s }
  })
  const dim = dimensionDe(g.dim)
  grupos.sort((a, b) => (dim.tiempo || a.orden != null ? (a.orden ?? 0) - (b.orden ?? 0) : b.valor - a.valor))
  const total = agg === 'suma' ? grupos.reduce((a, x) => a + x.valor, 0) : filtrados.reduce((a, i) => a + i.v, 0)
  return { grupos, total, m }
}
/** Los registros detrás de un grupo, para el detalle. */
function filasDe(c: Corte, items: Item[]) {
  if (items[0]?.vr) return filasDeVentasReales(items.map((i) => i.vr!))
  if (items[0]?.ev) return filasDeEventos(c, items.map((i) => i.ev!))
  if (items[0]?.tar) return items.map((i) => i.tar!).map((t) => ({
    id: 't:' + t.id, nombre: t.lead_nombre || t.texto || 'Tarea', link: t.link || undefined, crm: t.crm, asesor: c.usuarios.find((u) => u.id === t.asesor_id)?.nombre || 'Sin asesor',
    detalle: [t.texto, t.vencida ? 'vencida' : 'por vencer'].filter(Boolean).join(' · '), cuando: t.vence, alerta: t.vencida,
  }))
  return filasDeLeads(items.map((i) => i.lead!).filter(Boolean), (l) => etapaDe(l), (l) => l.cerrado || l.asignacion)
}

// ---------------------------------------------------------------- la gráfica
const COLORES = ['var(--c1)', 'var(--c2)', 'var(--c4)', 'var(--c3)', 'var(--neutral)', 'var(--warn)', 'var(--f3)', 'var(--f5)']
export function GraficaLibre({ corte, filtros, g, onDrill, mini = false }: { corte: Corte; filtros: Filtros; g: Grafica; onDrill?: (d: Drill) => void; mini?: boolean }) {
  const { grupos, total, m } = useMemo(() => serie(corte, filtros, g), [corte, filtros, g])
  if (!grupos.length) return <div className={'vacio' + (mini ? ' mini' : '')}><span className="muted">Sin datos con estos filtros.</span></div>
  const tope = mini ? 5 : (g.top || 12)
  const vistos = g.tipo === 'linea' || g.tipo === 'vbar' ? grupos : grupos.slice(0, tope)
  const sub = (x: Grupo) => (m.agg ? `${fmtN(x.n)} venta${x.n === 1 ? '' : 's'}` : undefined)
  const ver = (x: Grupo) => onDrill?.({ titulo: `${m.label} · ${x.label}`, filas: filasDe(corte, x.items), sub: filtros.rango.label })
  const items = vistos.map((x) => ({ label: x.label, value: x.valor, sub: sub(x) }))
  const clic = onDrill && !mini ? (i: number) => ver(vistos[i]) : undefined
  if (g.tipo === 'cifra') return (
    <div className="gcifra"><div className="n">{m.fmt(m.agg === 'promedio' && grupos.length === 1 ? grupos[0].valor : total)}</div><div className="l">{m.label}</div></div>
  )
  if (g.tipo === 'dona') return (
    <div className="donut-legend">
      <DonutChart partes={vistos.map((x, i) => ({ val: x.valor, color: COLORES[i % COLORES.length], label: x.label }))} total={total} label={m.fmt(total)} size={mini ? 110 : 170} />
      {!mini && (
        <div className="legend-list">
          {vistos.map((x, i) => (
            <button type="button" key={x.label} className="lr" onClick={() => ver(x)} aria-label={`${x.label}: ${m.fmt(x.valor)}. Ver registros`}>
              <i className="sw" style={{ background: COLORES[i % COLORES.length] }} aria-hidden="true" /><span>{x.label}</span><b>{m.fmt(x.valor)}</b><span className="muted">{total ? Math.round((x.valor / total) * 100) : 0}%</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
  if (g.tipo === 'tabla') return (
    <div className="scrollx"><table className="ftable" aria-label={m.label}>
      <thead><tr><th scope="col">{dimensionDe(g.dim).label}</th><th scope="col" className="num">{m.label}</th><th scope="col" className="num">Registros</th></tr></thead>
      <tbody>{vistos.map((x) => (
        <tr key={x.label} className={onDrill && !mini ? 'drill' : ''} {...(onDrill && !mini ? { role: 'button', tabIndex: 0, onClick: () => ver(x) } : {})}>
          <td>{x.label}</td><td className="num">{m.fmt(x.valor)}</td><td className="num">{fmtN(x.n)}</td>
        </tr>))}
      </tbody>
    </table></div>
  )
  if (g.tipo === 'vbar') return <BarChart label={m.label} fmt={m.fmt} color={COLORES[0]} items={items} onBar={clic} />
  if (g.tipo === 'linea') return <LineChart label={m.label} fmt={m.fmt} color={COLORES[3]} items={items} onPoint={clic} />
  return <HBarList label={m.label} fmt={m.fmt} color={COLORES[0]} items={items} onBar={clic} />
}

// ---------------------------------------------------------------- plantillas de la galería
const P = (id: string, titulo: string, medida: string, dim: string, tipo: TipoGrafica, extra: Partial<Grafica> = {}): Grafica => ({ id, titulo, medida, dim, tipo, ...extra })
export const PLANTILLAS: Grafica[] = [
  P('p-tareas-venc', 'Tareas vencidas por asesor', 'tareas_vencidas', 'asesor', 'hbar'),
  P('p-tareas-hechas', 'Tareas completadas por asesor', 'tareas_hechas', 'asesor', 'hbar'),
  P('p-tareas-abiertas', 'Tareas agendadas por asesor', 'tareas_abiertas', 'asesor', 'hbar'),
  P('p-sin-tarea', 'Leads sin tarea por asesor', 'sin_tarea', 'asesor', 'hbar'),
  P('p-pc-venc', 'Primer contacto vencido por asesor', 'pc_vencido', 'asesor', 'hbar'),
  P('p-pc-hecho', 'Primer contacto completado por asesor', 'pc_hecho', 'asesor', 'hbar'),
  P('p-llamadas', 'Llamadas realizadas por asesor', 'llamadas', 'asesor', 'hbar'),
  P('p-contestadas', 'Llamadas contestadas por asesor', 'contestadas', 'asesor', 'hbar'),
  P('p-sin-contestar', 'Llamadas sin contestar por asesor', 'sin_contestar', 'asesor', 'hbar'),
  P('p-cotiz', 'Cotizaciones entregadas por asesor', 'cotizaciones', 'asesor', 'hbar'),
  P('p-lev', 'Levantamientos por asesor', 'levantamientos', 'asesor', 'hbar'),
  P('p-desc', 'Descartados por asesor', 'descartes', 'asesor', 'hbar'),
  P('p-desc-razon', 'Descartados por razón', 'descartes', 'razon', 'hbar'),
  P('p-estancados', 'Leads estancados por asesor', 'estancados', 'asesor', 'hbar'),
  P('p-leads-mes', 'Leads asignados por mes', 'leads', 'mes', 'vbar'),
  P('p-leads-equipo', 'Leads asignados por equipo', 'leads', 'equipo', 'vbar'),
  P('p-vendido-mes', 'Monto vendido por mes', 'vendido', 'mes', 'vbar'),
  P('p-vendido-asesor', 'Monto vendido por asesor', 'vendido', 'asesor', 'hbar'),
  P('p-activos-etapa', 'Leads en juego por etapa', 'activos', 'etapa', 'hbar'),
  P('p-cotizado-asesor', 'Cotizado vigente por asesor', 'cotizado', 'asesor', 'hbar'),
  // Las de la app de comisiones (antes en la página «Ventas reales»)
  P('p-r-mes', 'Contrato por mes · comisiones', 'r_contrato', 'mes', 'vbar'),
  P('p-r-top', 'Top vendedores por contrato', 'r_contrato', 'asesor', 'hbar'),
  P('p-r-origen', 'Origen de las ventas', 'r_contrato', 'origen', 'dona'),
  P('p-r-zona', 'Contrato por zona de la app', 'r_contrato', 'zona_app', 'vbar'),
  P('p-r-pago', 'Contrato por forma de pago', 'r_contrato', 'forma_pago', 'hbar'),
  P('p-r-ticket', 'Ticket por forma de pago', 'r_ticket', 'forma_pago', 'hbar'),
  P('p-r-tamano', 'Tamaño de venta en paneles', 'r_ventas', 'tamano', 'vbar'),
  P('p-r-panel-asesor', 'Precio por panel por asesor', 'r_panel', 'asesor', 'hbar'),
  P('p-r-panel-mes', 'Precio por panel por mes', 'r_panel', 'mes', 'linea'),
  P('p-r-contrato', 'Contrato total (cifra)', 'r_contrato', 'ninguna', 'cifra', { span: 1, alto: 4 }),
  P('p-r-paneles', 'Paneles vendidos (cifra)', 'r_paneles', 'ninguna', 'cifra', { span: 1, alto: 4 }),
  P('p-r-ticket-cifra', 'Ticket promedio (cifra)', 'r_ticket', 'ninguna', 'cifra', { span: 1, alto: 4 }),
]

// ---------------------------------------------------------------- galería y editor
export function Galeria({ corte, filtros, quitados, onAgregar, onCrear, onClose }: {
  corte: Corte; filtros: Filtros; quitados: { id: string; titulo: string; nodo: React.ReactNode }[]
  onAgregar: (id: string) => void; onCrear: (g: Grafica) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFocoDialogo(ref)
  useEscape(onClose)
  const [q, setQ] = useState('')
  const [editar, setEditar] = useState<Grafica | null>(null)
  const hayComisiones = !!corte.comisiones
  const nq = q.trim().toLowerCase()
  const plantillas = PLANTILLAS.filter((p) => (hayComisiones || !p.medida.startsWith('r_')) && (!nq || p.titulo.toLowerCase().includes(nq) || medidaDe(p.medida).label.toLowerCase().includes(nq)))
  const dev = quitados.filter((w) => !nq || w.titulo.toLowerCase().includes(nq))
  if (editar) return <Editor corte={corte} filtros={filtros} g={editar} onGuardar={(x) => { onCrear(x); onClose() }} onClose={() => setEditar(null)} />
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal galeria" role="dialog" aria-modal="true" aria-label="Agregar una gráfica" ref={ref}>
        <div className="mh">
          <div className="mt"><h2>Agregar una gráfica</h2><div className="small muted">Toca una para ponerla en el tablero. La vista previa usa tus datos y los filtros de arriba.</div></div>
          <input className="sel" type="search" placeholder="Buscar…" aria-label="Buscar gráfica" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="mb">
          <button type="button" className="gcrear" onClick={() => setEditar({ id: 'g' + Date.now().toString(36), titulo: 'Mi gráfica', medida: 'llamadas', dim: 'asesor', tipo: 'hbar' })}>
            <span className="gc-mas" aria-hidden="true">+</span><span><b>Crear una gráfica</b><br /><span className="muted">Elige qué medir, cómo partirlo y cómo dibujarlo</span></span>
          </button>
          {dev.length > 0 && <h3 className="gsec">Quitadas del tablero</h3>}
          <div className="ggrid">
            {dev.map((w) => (
              <button type="button" key={w.id} className="gcard" onClick={() => { onAgregar(w.id); onClose() }} title={`Regresar «${w.titulo}» al tablero`}>
                <span className="gt">{w.titulo}</span>
                <span className="gprev" aria-hidden="true">{w.nodo}</span>
              </button>
            ))}
          </div>
          <h3 className="gsec">Gráficas listas</h3>
          <div className="ggrid">
            {plantillas.map((p) => (
              <span className="gcard-wrap" key={p.id}>
                <button type="button" className="gcard" onClick={() => { onCrear({ ...p, id: 'g' + Date.now().toString(36) }); onClose() }} title={`Agregar «${p.titulo}»`}>
                  <span className="gt">{p.titulo}</span>
                  <span className="gprev" aria-hidden="true"><GraficaLibre corte={corte} filtros={filtros} g={p} mini /></span>
                </button>
                <button type="button" className="nbtn gedit" onClick={() => setEditar({ ...p, id: 'g' + Date.now().toString(36) })}>Ajustar antes de agregar</button>
              </span>
            ))}
            {!plantillas.length && !dev.length && <div className="muted">Nada con «{q}».</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Editor({ corte, filtros, g, onGuardar, onClose }: { corte: Corte; filtros: Filtros; g: Grafica; onGuardar: (g: Grafica) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocoDialogo(ref)
  useEscape(onClose)
  const [cfg, setCfg] = useState<Grafica>(g)
  const m = medidaDe(cfg.medida)
  const dims = DIMENSIONES.filter((d) => m.dims.includes(d.id))
  const set = (x: Partial<Grafica>) => setCfg((c) => {
    const n = { ...c, ...x }
    if (x.medida) { const mm = medidaDe(x.medida); if (!mm.dims.includes(n.dim)) n.dim = mm.dims[0]; if (!c.titulo || c.titulo === m.label || c.titulo === 'Mi gráfica' || c.titulo === `${m.label} por ${dimensionDe(c.dim).label.toLowerCase()}`) n.titulo = `${mm.label} por ${dimensionDe(n.dim).label.toLowerCase()}` }
    if (x.dim && (c.titulo === `${m.label} por ${dimensionDe(c.dim).label.toLowerCase()}` || c.titulo === 'Mi gráfica')) n.titulo = x.dim === 'ninguna' ? medidaDe(n.medida).label : `${m.label} por ${dimensionDe(x.dim).label.toLowerCase()}`
    return n
  })
  const grupos = MEDIDAS.reduce((acc, x) => { (acc[x.grupo] = acc[x.grupo] || []).push(x); return acc }, {} as Record<string, Medida[]>)
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal editor" role="dialog" aria-modal="true" aria-label="Constructor de gráficas" ref={ref}>
        <div className="mh">
          <div className="mt"><h2>Constructor de gráficas</h2><div className="small muted">{m.ayuda}</div></div>
          <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="mb ed-cuerpo">
          <div className="ed-campos">
            <label>Qué medir
              <select className="sel" value={cfg.medida} onChange={(e) => set({ medida: e.target.value })}>
                {Object.entries(grupos).map(([gr, ms]) => (
                  <optgroup key={gr} label={gr}>{ms.filter((x) => corte.comisiones || !x.id.startsWith('r_')).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>
                ))}
              </select>
            </label>
            <label>Cómo partirlo
              <select className="sel" value={cfg.dim} onChange={(e) => set({ dim: e.target.value })}>
                {dims.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
            <label>Cómo dibujarlo
              <span className="ed-tipos" role="radiogroup" aria-label="Tipo de gráfica">
                {TIPOS.map((t) => (
                  <button type="button" key={t.id} role="radio" aria-checked={cfg.tipo === t.id} className={'ed-tipo' + (cfg.tipo === t.id ? ' on' : '')} onClick={() => set({ tipo: t.id })} title={t.label}>
                    <IconoTipo id={t.id} /><span>{t.label}</span>
                  </button>
                ))}
              </span>
            </label>
            <label>Título<input className="inp" value={cfg.titulo} onChange={(e) => set({ titulo: e.target.value })} /></label>
            <label>Cuántos mostrar
              <select className="sel" value={cfg.top || 12} onChange={(e) => set({ top: Number(e.target.value) })}>
                {[5, 10, 12, 20, 50].map((n) => <option key={n} value={n}>{n === 50 ? 'Todos' : `Los ${n} más altos`}</option>)}
              </select>
            </label>
            {cfg.medida.startsWith('r_') && (
              <label>Captura del vendedor
                <select className="sel" value={cfg.captura || ''} onChange={(e) => set({ captura: (e.target.value || undefined) as Grafica['captura'] })}>
                  <option value="">Todas</option><option value="completa">Solo completa</option><option value="incompleta">Solo incompleta</option>
                </select>
              </label>
            )}
          </div>
          <div className="ed-prev">
            <div className="small muted">Vista previa con tus datos · {filtros.rango.label}</div>
            <div className="panel ed-lienzo"><h3>{cfg.titulo}</h3><GraficaLibre corte={corte} filtros={filtros} g={cfg} /></div>
          </div>
        </div>
        <div className="mf ed-pie">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn on" onClick={() => onGuardar(cfg)}>Agregar al tablero</button>
        </div>
      </div>
    </div>
  )
}
function IconoTipo({ id }: { id: TipoGrafica }) {
  const d: Record<TipoGrafica, string> = {
    hbar: 'M3 5h14M3 10h9M3 15h5', vbar: 'M5 17V7M10 17V3M15 17v-6', linea: 'M3 15l4-5 4 3 6-8', dona: 'M10 3a7 7 0 1 0 7 7h-7z', cifra: 'M6 15V5l-2 2M11 15h5', tabla: 'M3 5h14v10H3zM3 9h14M9 9v6',
  }
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d[id]} /></svg>
}
