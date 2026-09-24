import { useEffect, useMemo, useRef, useState } from 'react'
import { cargarTableros, guardarTablero } from './data'
import type { Corte, Evento, Lead, Rango, Tarea, Usuario, VentaReal } from './types'
import { CRM_LABEL } from './types'
import {
  cotizadoVigenteDe, enRango, etapaDe, fechaDe, filasDeEventos, filasDeLeads, filasDeVentasReales, fmtCorta, fmtMoney0, fmtN,
  PRESETS, ep, inicioDia, mapaUsuarios, metaEnRango, metaTotal, estancado, ESTANCADO_DIAS, primeraAparicion, ocultosDe, pasaCrm, pct, periodoTexto, porAsesor, primerContacto, ritmo, visitas, vivo, zonaNombre, type Filtros,
  realesDe, ventasFiltradas, leadsActivosHoy, cierresDe, origenDe, SIN_LEAD, filasConversionLeads, fmtTasa, leadsFiltrados, rangoVentas, type Fila, type VentaCasada,
} from './metrics'
import { BarChart, BarDetailPopup, Bullet, DonutChart, HBarList, LineChart, useEscape, useFocoDialogo, type BarItem, type DetRow, type Modo } from './components'
import type { Drill } from './drill'
import { BASE_FECHA, type BaseFecha } from './columnas'
import type { RangoWidget } from './rangos'

// Constructor de gráficas (Randall 7-sep: «un graph modifier/builder para que ya no dependamos tanto de ti»).
// Una gráfica = QUÉ se mide (medida) × CÓMO se parte (dimensión) × CÓMO se dibuja (tipo). El mismo motor
// alimenta la galería con vista previa, el editor y el widget final; cada barra abre el detalle de sus
// registros, igual que el resto del tablero. Regla de dataviz que se respeta: una sola escala por gráfica
// (el segundo dato va como texto), líneas solo para tiempo, dona solo para partes de un total.

export type TipoGrafica = 'hbar' | 'vbar' | 'linea' | 'dona' | 'cifra' | 'tabla'
export interface Grafica {
  id: string; titulo: string; medida: string; dim: string; tipo: TipoGrafica
  medidas?: string[]        // medidas extra: la grafica se vuelve MIXTA (Randall 10-sep)
  modo?: Modo               // mixta en barras: apiladas (suman) o lado a lado (comparan)
  meta?: boolean            // cifra de dinero: medidor contra la meta y frase del ritmo
  top?: number; captura?: 'completa' | 'incompleta'; span?: number; alto?: number
  resultado?: Resultado     // qué se calcula con cada grupo (Randall 22-sep, como las tablas dinámicas); sin él, lo propio de la medida
}
/** Todas las medidas de la grafica, la principal primero. */
export const idsMedidas = (g: Grafica) => [g.medida, ...(g.medidas || [])]
/** Tipos que saben dibujar varias medidas. Una cifra o una dona miden UNA cosa. */
export const MULTI_OK: TipoGrafica[] = ['hbar', 'vbar', 'linea', 'tabla']
export const MAX_MEDIDAS = 4
/** Solo el dinero que se suma se puede comparar contra una meta en pesos (un ticket promedio, no). */
/** Contra qué fecha cuenta esta gráfica, si todas sus medidas coinciden. Sirve para la etiqueta de
 *  fechas del widget: saber el periodo sin saber qué fecha se compara contra él no basta. */
export function baseDe(g: Grafica): BaseFecha | undefined {
  const bs = [...new Set(idsMedidas(g).map((id) => medidaDe(id).base).filter(Boolean))]
  return bs.length === 1 ? (bs[0] as BaseFecha) : undefined
}
export const conMeta = (m: Medida) => m.fmt === fmtMoney0 && !m.agg && m.id !== 'meta'
export const MODOS: { id: Modo; label: string; ayuda: string }[] = [
  { id: 'apilado', label: 'Apiladas', ayuda: 'una sobre otra: se lee el total' },
  { id: 'lado', label: 'Lado a lado', ayuda: 'una junto a otra: se comparan' },
]
export const TIPOS: { id: TipoGrafica; label: string }[] = [
  { id: 'hbar', label: 'Barras horizontales' }, { id: 'vbar', label: 'Barras verticales' },
  { id: 'linea', label: 'Línea' }, { id: 'dona', label: 'Dona' }, { id: 'cifra', label: 'Cifra' }, { id: 'tabla', label: 'Tabla' },
]

// ---------------------------------------------------------------- medidas
interface Item { v: number; v2?: number; lead?: Lead; ev?: Evento; tar?: Tarea; vr?: VentaReal; u?: Usuario; ts?: number; vc?: VentaCasada }
type Agg = 'suma' | 'promedio' | 'razon'
interface Medida {
  id: string; label: string; grupo: 'Actividad' | 'Seguimiento' | 'Ventas' | 'Ventas reales'
  fmt: (n: number) => string; agg?: Agg; ayuda: string
  items: (c: Corte, f: Filtros) => Item[]
  fecha?: (it: Item) => number | undefined
  base?: BaseFecha              // contra QUE fecha cae cada registro en su periodo
  dims: string[]
  /** Qué número trae cada registro cuando no es un conteo («Contrato», «Paneles»): con él se ofrecen promedio,
   *  mediana, mínimo y máximo en «Resultado». Sin él, cada registro vale 1 y solo hay total, % del total y acumulado. */
  valor?: string
  /** Grupos sin base (sin leads en una tasa) no se dibujan: una barra de 0 % que no es 0 % confunde. */
  sinBaseFuera?: boolean
  /** El texto chico de cada barra y el detalle propio de la medida, cuando lo genérico no alcanza. */
  sub?: (items: Item[]) => string; subLabel?: string
  filas?: (items: Item[]) => Fila[]
}
// Los cortes de tiempo que sirven de eje X (Randall 10-sep: «que se pueda partir por semana, mes,
// bimestre, cuarto, semestre o año»). El día va aparte: solo tiene sentido en rangos cortos.
const TIEMPOS = ['semana', 'quincena', 'mes', 'bimestre', 'trimestre', 'semestre', 'anio']
const DIMS_CRM = ['asesor', 'equipo', 'ciudad', 'origen_lead', 'crm', 'etapa', ...TIEMPOS, 'dia', 'ninguna']
const DIMS_COM = ['asesor', 'zona_app', 'origen', 'forma_pago', 'tamano', ...TIEMPOS, 'ninguna']
/** La conversión va por MES (la app guarda el mes de la venta): no se parte por semana, quincena ni día. */
const DIMS_CONV = ['asesor', 'equipo', 'origen_lead', 'crm', 'ciudad', 'mes', 'bimestre', 'trimestre', 'semestre', 'anio', 'ninguna']
/** Leads y cierres de la tasa de conversión (Randall 22-sep): misma regla que la tarjeta «Conversión». Cada venta de la
 *  app se casa con su lead (`ventasCasadas`) para saber su origen, su ciudad y sus días de cierre. */
function itemsConversion(c: Corte, f: Filtros): Item[] {
  const ff = { ...f, rango: rangoVentas(c, f.rango) }
  return [
    ...leadsFiltrados(c, ff).map((l) => ({ v: 0, v2: 1, lead: l })),
    ...cierresDe(c, ff).map((x) => ({ v: 1, v2: 0, vc: x, lead: x.lead ?? undefined, vr: x.v ?? undefined })),
  ]
}
const partesConversion = (its: Item[]) => ({ leads: its.filter((i) => !i.vc).map((i) => i.lead as Lead), cierres: its.filter((i) => i.vc).map((i) => i.vc as VentaCasada) })
/** La meta se configura POR MES: no se puede partir más fino que el mes sin inventar datos. */
const DIMS_META = ['asesor', 'equipo', 'mes', 'bimestre', 'trimestre', 'semestre', 'anio', 'ninguna']
/** Leads en juego hoy, sin importar las fechas (Randall 11-sep); misma regla que la tabla de Asesores. */
const activos = (c: Corte, f: Filtros) => leadsActivosHoy(c, f)
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
/** Ventas del rango: app de comisiones si el corte la trae, si no ganados del CRM (misma regla que el tablero). */
const ventasDe = ventasFiltradas
const fmtPct = (n: number) => Math.round(n * 100) + '%'
const uno = <T,>(xs: T[], k: (x: T) => Item): Item[] => xs.map(k)
/** La meta cortada mes a mes dentro de `rangoMeta` (los meses que toca el rango, desde que el asesor existe):
 *  así la misma medida sirve para una cifra («la meta del periodo») y para una serie de tiempo («la meta de
 *  cada mes») y suma lo mismo que la tarjeta «Avance contra la meta». Con la app de comisiones cada mes lleva
 *  la meta completa, también el que corre (15-sep: prorratear septiembre daba $493K contra el $1M de la meta);
 *  sin app, los meses incompletos se prorratean por días. */
function metasPorMes(c: Corte, f: Filtros): Item[] {
  const out: Item[] = []
  for (const x of porAsesor(c, f)) {
    const r = x.rangoMeta
    if (r.fin <= r.ini) continue
    const a0 = fechaDe(r.ini)
    let d = new Date(a0.getFullYear(), a0.getMonth(), 1)
    for (let i = 0; i < 200 && ep(d) < r.fin; i++) {
      const sig = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const ini = Math.max(ep(d), r.ini), fin = Math.min(ep(sig), r.fin)
      if (fin > ini) out.push({ v: metaEnRango(x.metaMes, { ini, fin, label: '' }), u: x.u, ts: ini })
      d = sig
    }
  }
  return out
}
export const MEDIDAS: Medida[] = [
  // Actividad registrada en el rango
  { id: 'llamadas', label: 'Llamadas realizadas', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, base: 'actividad', ayuda: 'Llamadas registradas en el CRM dentro de las fechas elegidas.', items: (c, f) => uno(eventosDe(c, f, ['llamada_ok', 'llamada_no']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'contestadas', label: 'Llamadas contestadas', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, base: 'actividad', ayuda: 'Llamadas con duración mayor que cero.', items: (c, f) => uno(eventosDe(c, f, ['llamada_ok']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'sin_contestar', label: 'Llamadas sin contestar', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, base: 'actividad', ayuda: 'Llamadas que duraron cero.', items: (c, f) => uno(eventosDe(c, f, ['llamada_no']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'tareas_hechas', label: 'Tareas completadas', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, base: 'actividad', ayuda: 'Tareas que el asesor marcó como terminadas dentro de las fechas elegidas.', items: (c, f) => uno(eventosDe(c, f, ['tarea']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'cotizaciones', label: 'Cotizaciones entregadas', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, base: 'actividad', ayuda: 'Primera vez que el lead pasó a «Propuesta entregada» dentro de las fechas elegidas.', items: (c, f) => uno(eventosDe(c, f, ['cotizacion']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'lev_agendados', label: 'Levantamientos agendados', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, base: 'actividad', ayuda: 'Leads que entraron a la etapa «Levantamiento agendado» dentro de las fechas elegidas.', items: (c, f) => uno(visitas(c, f).agendados, (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.lev_agendado || 0 },
  { id: 'lev_hechos', label: 'Levantamientos hechos', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, base: 'actividad', ayuda: 'De los agendados en las fechas elegidas, los que llegaron a «Levantamiento hecho».', items: (c, f) => uno(visitas(c, f).hechos, (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.lev_agendado || 0 },
  { id: 'levantamientos', label: 'Levantamientos solicitados', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, base: 'actividad', ayuda: 'Visitas técnicas solicitadas dentro de las fechas elegidas.', items: (c, f) => uno(eventosDe(c, f, ['levantamiento']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'descartes', label: 'Descartados', grupo: 'Actividad', fmt: fmtN, dims: [...DIMS_CRM, 'razon'], base: 'actividad', ayuda: 'Leads descartados dentro de las fechas elegidas, por la fecha del descarte.', items: (c, f) => uno(eventosDe(c, f, ['descarte']), (e) => ({ v: 1, ev: e })), fecha: (i) => i.ev?.ts },
  { id: 'pc_hecho', label: 'Primer contacto completado', grupo: 'Actividad', fmt: fmtN, dims: DIMS_CRM, base: 'asignacion', ayuda: 'Leads asignados en las fechas elegidas a los que ya se les hizo la primera llamada o tarea. Solo Kommo.', items: (c, f) => uno(primerContacto(c, leadsDe(c, f)).con, (x) => ({ v: 1, lead: x.lead })), fecha: (i) => i.lead?.asignacion },
  // Seguimiento: foto de hoy
  { id: 'tareas_vencidas', label: 'Tareas vencidas', grupo: 'Seguimiento', fmt: fmtN, dims: ['asesor', 'equipo', 'ciudad', 'crm', 'etapa', 'ninguna'], base: 'ninguna', ayuda: 'Tareas abiertas cuya fecha ya pasó, contadas hoy (no dependen de las fechas de arriba).', items: (c, f) => uno(tareasDe(c, f, true), (t) => ({ v: 1, tar: t })) },
  { id: 'tareas_abiertas', label: 'Tareas agendadas', grupo: 'Seguimiento', fmt: fmtN, dims: ['asesor', 'equipo', 'ciudad', 'crm', 'etapa', 'ninguna'], base: 'ninguna', ayuda: 'Tareas abiertas hoy en leads que siguen en juego, vencidas o por vencer.', items: (c, f) => uno(tareasDe(c, f, false), (t) => ({ v: 1, tar: t })) },
  { id: 'sin_tarea', label: 'Leads sin tarea', grupo: 'Seguimiento', fmt: fmtN, dims: DIMS_CRM, base: 'ninguna', ayuda: 'Leads en juego hoy sin ninguna tarea pendiente: nadie los está siguiendo. Foto de hoy, no depende de las fechas.', items: (c, f) => uno(activos(c, f).filter((l) => l.sin_tarea), (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.asignacion },
  { id: 'pc_vencido', label: 'Primer contacto vencido', grupo: 'Seguimiento', fmt: fmtN, dims: DIMS_CRM, base: 'ninguna', ayuda: 'Leads en juego hoy a los que se les pasó la fecha de la tarea de primer contacto. Solo Kommo. Foto de hoy.', items: (c, f) => uno(activos(c, f).filter((l) => l.pc_vencida), (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.asignacion },
  { id: 'estancados', label: 'Leads estancados', grupo: 'Seguimiento', fmt: fmtN, dims: DIMS_CRM, base: 'ninguna', ayuda: `Leads en juego hoy con más de ${ESTANCADO_DIAS} días sin actividad del asesor (llamada, tarea terminada, cotización o levantamiento; si nunca hubo, desde que se le asignó). Foto de hoy.`, items: (c, f) => uno(activos(c, f).filter((l) => estancado(l)), (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.asignacion },
  { id: 'leads', label: 'Leads asignados', grupo: 'Seguimiento', fmt: fmtN, dims: DIMS_CRM, base: 'asignacion', ayuda: 'Leads que se repartieron a los asesores en las fechas elegidas.', items: (c, f) => uno(leadsDe(c, f), (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.asignacion },
  { id: 'activos', label: 'Leads en juego', grupo: 'Seguimiento', fmt: fmtN, dims: DIMS_CRM, base: 'ninguna', ayuda: 'Todos los leads que hoy siguen en juego: ni ganados ni perdidos y, en Kommo, fuera de Hunting. Sin importar cuándo se asignaron. Foto de hoy.', items: (c, f) => uno(activos(c, f), (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.asignacion },
  { id: 'cotizado', valor: 'Precio del lead', label: 'Cotizado vigente', grupo: 'Seguimiento', fmt: fmtMoney0, dims: DIMS_CRM, base: 'ninguna', ayuda: 'Dinero en juego: precio de los leads activos cuya cotización tiene 90 días o menos.', items: (c, f) => uno(cotizadoVigenteDe(activos(c, f), c.cotizado_dias), (l) => ({ v: l.presupuesto, lead: l })), fecha: (i) => i.lead?.asignacion },
  // Ventas: app de comisiones (Contrato total / ventas reales) o, sin app, ganados del CRM
  { id: 'ventas', label: 'Clientes cerrados', grupo: 'Ventas', fmt: fmtN, dims: DIMS_CRM, base: 'cierre', ayuda: 'Ventas registradas en la app de comisiones dentro de las fechas elegidas (por mes de venta, sin canceladas). Si el corte no trae la app, las que el CRM marcó como ganadas.', items: (c, f) => uno(ventasDe(c, f), (l) => ({ v: 1, lead: l })), fecha: (i) => i.lead?.cerrado },
  { id: 'vendido', valor: 'Contrato', label: 'Monto vendido', grupo: 'Ventas', fmt: fmtMoney0, dims: DIMS_CRM, base: 'cierre', ayuda: 'Contrato total de las ventas de la app de comisiones en las fechas elegidas. Si el corte no trae la app, la suma del precio de los ganados del CRM.', items: (c, f) => uno(ventasDe(c, f), (l) => ({ v: l.presupuesto, lead: l })), fecha: (i) => i.lead?.cerrado },
  // La meta no sale de ningun lead: es lo que cada asesor tiene puesto en Configuracion, repartido al
  // periodo elegido. Sirve para graficarla y, sobre todo, para ponerla junto a lo vendido.
  { id: 'meta', label: 'Meta de venta', grupo: 'Ventas', fmt: fmtMoney0, dims: DIMS_META, ayuda: 'La meta en pesos del periodo elegido, por asesor (se configura en Configuración). Los asesores sin leads, actividad ni ventas en el periodo no suman meta, igual que en la tarjeta «Avance contra la meta». Como la meta es mensual, no se puede partir por semana ni por día.', items: (c, f) => metasPorMes(c, f), fecha: (i) => i.ts },
  // Vendido ÷ meta: la evolución contra la meta en una sola línea (Randall 10-sep: «ver la evolución
  // de los asesores respecto a sus ventas vs la meta establecida»). Es una razón, así que no se apila
  // ni se combina con otras medidas: 100 % es meta cumplida.
  { id: 'cumplimiento', label: 'Cumplimiento de la meta', grupo: 'Ventas', fmt: fmtPct, agg: 'razon', base: 'cierre', dims: DIMS_META, ayuda: 'Lo vendido entre la meta del periodo: 100 % es meta cumplida. Se puede ver por asesor, por equipo o mes a mes. La meta es mensual, por eso no se parte por semana ni por día.', items: (c, f) => [
    ...ventasDe(c, f).map((l) => ({ v: l.presupuesto, v2: 0, lead: l })),
    ...metasPorMes(c, f).map((i) => ({ v: 0, v2: i.v, u: i.u, ts: i.ts })),
  ], fecha: (i) => i.lead?.cerrado ?? i.ts },
  { id: 'conversion', label: 'Tasa de conversión', grupo: 'Ventas', fmt: (n) => fmtTasa(n), agg: 'razon', base: 'asignacion', dims: DIMS_CONV, sinBaseFuera: true,
    ayuda: 'Clientes cerrados entre leads asignados, en los meses que toca el rango (la app de comisiones guarda el mes de la venta). Por origen, cada venta toma el origen del lead con el que se casó; las ventas sin lead casado cuentan en el total pero no tienen barra.',
    items: itemsConversion, fecha: (i) => (i.vc ? (i.vc.v?.fecha ?? i.vc.lead?.cerrado ?? undefined) : i.lead?.asignacion),
    sub: (its) => { const p = partesConversion(its); return `${fmtN(p.cierres.length)} de ${fmtN(p.leads.length)} leads` }, subLabel: 'Cierres de los leads',
    filas: (its) => { const p = partesConversion(its); return filasConversionLeads({ clave: '', label: '', leads: p.leads, cierres: p.cierres, tasa: null, dias: null, nDias: 0 }) } },
  { id: 'ticket_crm', valor: 'Contrato', label: 'Ticket promedio por venta', grupo: 'Ventas', fmt: fmtMoney0, agg: 'promedio', dims: DIMS_CRM, base: 'cierre', ayuda: 'Contrato promedio de cada venta (app de comisiones; CRM solo si no hay app).', items: (c, f) => uno(ventasDe(c, f), (l) => ({ v: l.presupuesto, lead: l })), fecha: (i) => i.lead?.cerrado },
  // Ventas reales (app de comisiones)
  { id: 'r_ventas', label: 'Ventas reales', grupo: 'Ventas reales', fmt: fmtN, dims: DIMS_COM, base: 'cierre', ayuda: 'Ventas registradas en la app de comisiones, sin canceladas. El mes de la venta manda, no el día.', items: (c, f) => uno(realesDe(c, f), (v) => ({ v: 1, vr: v })), fecha: (i) => i.vr?.fecha ?? undefined },
  { id: 'r_contrato', valor: 'Contrato', label: 'Contrato total', grupo: 'Ventas reales', fmt: fmtMoney0, dims: DIMS_COM, base: 'cierre', ayuda: 'Suma del monto de contrato de la app de comisiones.', items: (c, f) => uno(realesDe(c, f), (v) => ({ v: v.monto, vr: v })), fecha: (i) => i.vr?.fecha ?? undefined },
  { id: 'r_ticket', valor: 'Contrato', label: 'Ticket promedio', grupo: 'Ventas reales', fmt: fmtMoney0, agg: 'promedio', dims: DIMS_COM, base: 'cierre', ayuda: 'Contrato entre número de ventas: cuánto vale en promedio cada venta.', items: (c, f) => uno(realesDe(c, f), (v) => ({ v: v.monto, vr: v })), fecha: (i) => i.vr?.fecha ?? undefined },
  { id: 'r_paneles', valor: 'Paneles', label: 'Paneles vendidos', grupo: 'Ventas reales', fmt: fmtN, dims: DIMS_COM, base: 'cierre', ayuda: 'Suma de los paneles de las ventas de la app.', items: (c, f) => uno(realesDe(c, f), (v) => ({ v: v.paneles || 0, vr: v })), fecha: (i) => i.vr?.fecha ?? undefined },
  { id: 'r_panel', label: 'Precio por panel', grupo: 'Ventas reales', fmt: fmtMoney0, agg: 'razon', dims: DIMS_COM, base: 'cierre', ayuda: 'Contrato entre paneles vendidos: cuánto se cobra por cada panel.', items: (c, f) => uno(realesDe(c, f).filter((v) => (v.paneles || 0) > 0), (v) => ({ v: v.monto, v2: v.paneles || 0, vr: v })), fecha: (i) => i.vr?.fecha ?? undefined },
  { id: 'r_enganches', label: 'Enganches pagados', grupo: 'Ventas reales', fmt: fmtN, dims: DIMS_COM, base: 'cierre', ayuda: 'Ventas de la app que ya tienen el enganche pagado.', items: (c, f) => uno(realesDe(c, f).filter((v) => v.enganche), (v) => ({ v: 1, vr: v })), fecha: (i) => i.vr?.fecha ?? undefined },
]
export const medidaDe = (id: string) => MEDIDAS.find((m) => m.id === id) || MEDIDAS[0]
/** Dos medidas solo se juntan si se miden igual: piezas con piezas, pesos con pesos, y las dos se suman
 *  (un promedio o una razon no se pueden apilar). Asi la grafica siempre tiene UNA sola escala, que es
 *  la regla que evita las comparaciones tramposas de dos ejes. */
export const combinable = (a: Medida, b: Medida) => (a.agg || 'suma') === 'suma' && (b.agg || 'suma') === 'suma' && a.fmt === b.fmt

// ---------------------------------------------------------------- dimensiones
interface Dimension { id: string; label: string; tiempo?: boolean }
export const DIMENSIONES: Dimension[] = [
  { id: 'asesor', label: 'Asesor' }, { id: 'equipo', label: 'Equipo' }, { id: 'ciudad', label: 'Ciudad del cliente' }, { id: 'crm', label: 'CRM' }, { id: 'etapa', label: 'Etapa del embudo' },
  { id: 'razon', label: 'Razón de descarte' },
  { id: 'semana', label: 'Semana', tiempo: true }, { id: 'quincena', label: 'Quincena', tiempo: true }, { id: 'mes', label: 'Mes', tiempo: true },
  { id: 'bimestre', label: 'Bimestre', tiempo: true }, { id: 'trimestre', label: 'Trimestre', tiempo: true }, { id: 'semestre', label: 'Semestre', tiempo: true },
  { id: 'anio', label: 'Año', tiempo: true }, { id: 'dia', label: 'Día', tiempo: true },
  { id: 'origen', label: 'Origen de la venta' }, { id: 'origen_lead', label: 'Origen del lead' }, { id: 'forma_pago', label: 'Forma de pago' }, { id: 'zona_app', label: 'Zona de la app' }, { id: 'tamano', label: 'Tamaño en paneles' },
  { id: 'ninguna', label: 'Sin partir (total)' },
]
export const dimensionDe = (id: string) => DIMENSIONES.find((d) => d.id === id) || DIMENSIONES[0]
/** Las formas de partir que sirven para TODAS las medidas elegidas. */
export const dimsComunes = (ids: string[]) => DIMENSIONES.filter((d) => ids.map(medidaDe).every((m) => m.dims.includes(d.id)))
const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
/** El cubo de tiempo donde cae una fecha: su etiqueta, su orden y su inicio. Un solo lugar, para que
 *  agrupar y rellenar los periodos vacíos nunca digan cosas distintas. Bimestres, trimestres y
 *  semestres son de CALENDARIO (empiezan en enero). */
function cubo(dim: string, d: Date): { clave: string; orden: number; ini: Date } {
  const y = d.getFullYear(), M = d.getMonth()
  const con = (p: Date, clave: string) => ({ clave, orden: p.getTime(), ini: p })
  switch (dim) {
    case 'anio': return con(new Date(y, 0, 1), String(y))
    case 'semestre': { const i = M < 6 ? 0 : 6; return con(new Date(y, i, 1), `${MESES_C[i]}\u2013${MESES_C[i + 5]} ${y}`) }
    case 'trimestre': { const i = Math.floor(M / 3) * 3; return con(new Date(y, i, 1), `${MESES_C[i]}\u2013${MESES_C[i + 2]} ${y}`) }
    case 'bimestre': { const i = Math.floor(M / 2) * 2; return con(new Date(y, i, 1), `${MESES_C[i]}\u2013${MESES_C[i + 1]} ${y}`) }
    case 'mes': return con(new Date(y, M, 1), `${MESES_C[M]} ${y}`)
    case 'quincena': { const q = d.getDate() <= 15 ? 1 : 16; const ultimo = new Date(y, M + 1, 0).getDate(); return con(new Date(y, M, q), `${q}\u2013${q === 1 ? 15 : ultimo} ${MESES_C[M]}`) }
    case 'semana': { const x = inicioDia(d); const lun = new Date(x); lun.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return con(lun, fmtCorta(lun)) }
    default: { const x = inicioDia(d); return con(x, fmtCorta(x)) }
  }
}
const siguienteCubo = (dim: string, d: Date): Date => {
  const y = d.getFullYear(), M = d.getMonth()
  switch (dim) {
    case 'anio': return new Date(y + 1, 0, 1)
    case 'semestre': return new Date(y, M + 6, 1)
    case 'trimestre': return new Date(y, M + 3, 1)
    case 'bimestre': return new Date(y, M + 2, 1)
    case 'mes': return new Date(y, M + 1, 1)
    case 'quincena': return d.getDate() === 1 ? new Date(y, M, 16) : new Date(y, M + 1, 1)
    case 'semana': { const x = new Date(d); x.setDate(x.getDate() + 7); return x }
    default: { const x = new Date(d); x.setDate(x.getDate() + 1); return x }
  }
}
/** Todos los periodos del rango, incluso los que no tuvieron ni un registro: en una serie de tiempo
 *  un hueco es información («ese mes no se vendió»), no un periodo que se salta. Tope de 400. */
function cubosDe(dim: string, r: Rango): { clave: string; orden: number }[] {
  const out: { clave: string; orden: number }[] = []
  let d = cubo(dim, fechaDe(r.ini)).ini
  for (let i = 0; i < 400 && ep(d) < r.fin; i++) { const c = cubo(dim, d); out.push({ clave: c.clave, orden: c.orden }); d = siguienteCubo(dim, d) }
  return out
}
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
  // Una venta de la app manda con SU vendedor aunque venga casada con un lead (el lead pudo cambiar de dueño).
  const asesorId = it.vr ? it.vr.asesor_id : (it.lead?.asesor_id ?? it.ev?.asesor_id ?? it.tar?.asesor_id ?? it.u?.id ?? null)
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
    // La ciudad la trae el lead: en Kommo la del contacto, en HubSpot la del deal (Randall 8-sep).
    case 'ciudad': return { clave: (l?.ciudad || '').trim() || 'Sin ciudad' }
    case 'crm': return { clave: CRM_LABEL[(it.lead?.crm ?? it.ev?.crm ?? it.tar?.crm) || (it.vr ? 'comisiones' : 'kommo')] || 'Comisiones' }
    case 'origen_lead': return { clave: it.vc ? (it.vc.lead ? origenDe(it.vc.lead) : SIN_LEAD) : l ? origenDe(l) : 'Sin origen' }
    case 'etapa': return { clave: l ? etapaDe(l) : 'Sin etapa' }
    case 'razon': return { clave: (l?.razon || '').trim() || 'Sin razón registrada' }
    case 'origen': return { clave: it.vr?.origen || 'Sin origen' }
    case 'forma_pago': return { clave: it.vr?.forma_pago || 'Sin forma de pago' }
    case 'zona_app': return { clave: it.vr?.zona_app || 'Sin zona' }
    case 'tamano': { const p = it.vr?.paneles || 0; const t = TAMANOS.find(([, lo, hi]) => p >= lo && p <= hi); return { clave: t ? t[0] : 'Sin paneles', orden: t ? TAMANOS.indexOf(t) : 99 } }
    case 'semana': case 'quincena': case 'mes': case 'bimestre': case 'trimestre': case 'semestre': case 'anio': case 'dia': {
      const ts = m.fecha?.(it)
      if (!ts) return { clave: 'Sin fecha', orden: Infinity }
      const c = cubo(dim, fechaDe(ts))
      return { clave: c.clave, orden: c.orden }
    }
    default: return { clave: 'Total' }
  }
}

// ---------------------------------------------------------------- resultado (Randall 22-sep, como las tablas dinámicas)
export type Resultado = 'suma' | 'conteo' | 'promedio' | 'mediana' | 'minimo' | 'maximo' | 'pct' | 'acumulado'
export const RESULTADOS: Record<Resultado, { label: string; ayuda: string; titulo: string }> = {
  suma: { label: 'Suma', ayuda: 'Suma los valores de los registros de cada grupo.', titulo: 'Suma de' },
  conteo: { label: 'Conteo de registros', ayuda: 'Cuántos registros hay en cada grupo, sin importar su valor.', titulo: 'Conteo de' },
  promedio: { label: 'Promedio', ayuda: 'El valor promedio de un registro del grupo.', titulo: 'Promedio de' },
  mediana: { label: 'Mediana', ayuda: 'El valor de en medio del grupo: un caso extremo no la mueve.', titulo: 'Mediana de' },
  minimo: { label: 'Mínimo', ayuda: 'El registro más bajo del grupo.', titulo: 'Mínimo de' },
  maximo: { label: 'Máximo', ayuda: 'El registro más alto del grupo.', titulo: 'Máximo de' },
  pct: { label: '% del total', ayuda: 'Qué parte del total es cada grupo; todos juntos suman 100 %.', titulo: '% del total de' },
  acumulado: { label: 'Acumulado', ayuda: 'Se va sumando periodo tras periodo: el último es el total del rango.', titulo: 'Acumulado de' },
}
/** Lo que la medida calcula sola: una razón no se suma ni se promedia (null), un ticket es promedio y lo demás suma. */
const naturalDe = (m: Medida): Resultado | null => (m.agg === 'razon' ? null : m.agg === 'promedio' ? 'promedio' : 'suma')
/** Los resultados que tienen sentido para estas medidas, esta dimensión y este dibujo. Vacío = la medida es una razón. */
export function resultadosDe(ids: string[], dim: string, tipo: TipoGrafica): Resultado[] {
  const ms = ids.map(medidaDe)
  if (ms.some((m) => m.agg === 'razon')) return []
  const out: Resultado[] = ['suma']
  if (ms.every((m) => m.valor)) out.push('conteo', 'promedio', 'mediana', 'minimo', 'maximo')
  if (dim !== 'ninguna' && tipo !== 'cifra') out.push('pct')
  if (dimensionDe(dim).tiempo && tipo !== 'cifra' && tipo !== 'dona' && ms.every((m) => !m.agg)) out.push('acumulado')
  return out
}
/** El resultado con el que se dibuja la gráfica: el elegido si sigue valiendo; si no, el propio de la medida. */
export function resultadoDe(g: Grafica): Resultado | null {
  const ok = resultadosDe(idsMedidas(g), g.dim, g.tipo)
  if (!ok.length) return null
  return g.resultado && ok.includes(g.resultado) ? g.resultado : (naturalDe(medidaDe(g.medida)) ?? 'suma')
}
/** «Suma» de una medida que cuenta registros se dice «Total»: sumar unos es contar. */
export const etiquetaResultado = (r: Resultado, ids: string[]) => (r === 'suma' && !ids.map(medidaDe).every((m) => m.valor) ? 'Total' : RESULTADOS[r].label)
/** Los resultados que se pueden apilar: sumar promedios, medianas o máximos no significa nada. */
export const apilable = (r: Resultado | null) => r == null || r === 'suma' || r === 'conteo' || r === 'pct' || r === 'acumulado'
const mediana = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b), k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2 }
function calcula(r: Resultado | null, its: Item[]): number {
  const s = its.reduce((a, i) => a + i.v, 0)
  if (r === null) { const s2 = its.reduce((a, i) => a + (i.v2 || 0), 0); return s2 ? s / s2 : 0 }
  if (r === 'conteo') return its.length
  if (!its.length) return 0
  if (r === 'promedio') return s / its.length
  if (r === 'mediana') return mediana(its.map((i) => i.v))
  if (r === 'minimo') return Math.min(...its.map((i) => i.v))
  if (r === 'maximo') return Math.max(...its.map((i) => i.v))
  return s   // suma, y la base de % del total y del acumulado
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
  // En tiempo, los periodos sin registros entran con cero para que la línea no mienta. Con UNA persona elegida
  // (la ficha) la serie arranca en el mes en que aparece: en «Máximo» una asesora de julio no tiene por qué
  // cargar tres años de ceros antes de su primer mes.
  const dimT = dimensionDe(g.dim)
  const desde = f.asesor != null ? Math.max(f.rango.ini, primeraAparicion(c).get(f.asesor) ?? f.rango.ini) : f.rango.ini
  if (dimT.tiempo) for (const cb of cubosDe(g.dim, { ...f.rango, ini: Math.min(desde, f.rango.fin) })) if (!map.has(cb.clave)) map.set(cb.clave, { label: cb.clave, valor: 0, n: 0, items: [], orden: cb.orden })
  const r = resultadoDe(g)
  let grupos = [...map.values()].map((gr) => ({ ...gr, valor: calcula(r, gr.items) }))
  // Una tasa sin base (ventas sin lead casado, sin leads asignados) no tiene barra: su 0 % no sería verdad.
  if (m.sinBaseFuera) grupos = grupos.filter((gr) => gr.items.some((i) => (i.v2 || 0) > 0))
  const dim = dimensionDe(g.dim)
  grupos.sort((a, b) => (dim.tiempo || a.orden != null ? (a.orden ?? 0) - (b.orden ?? 0) : b.valor - a.valor))
  // El total no siempre es la suma de los grupos: en una razón es la razón de los totales (vendido ÷ meta de todo el
  // rango), en un promedio o una mediana es la de todos los registros juntos, y el % del total es 100 %.
  const base = filtrados.reduce((a, i) => a + i.v, 0)
  if (r === 'pct') grupos = grupos.map((x) => ({ ...x, valor: base ? x.valor / base : 0 }))
  if (r === 'acumulado') { let a = 0; grupos = grupos.map((x) => ({ ...x, valor: (a += x.valor) })) }
  const total = r === 'pct' ? 1 : r === 'suma' || r === 'acumulado' ? base : calcula(r, filtrados)
  // Formato y nombre según el resultado: un conteo son piezas, un % del total es porcentaje.
  const fmt = r === 'conteo' ? fmtN : r === 'pct' ? fmtPct : m.fmt
  const nat = naturalDe(m)
  const label = !r || r === nat ? m.label : r === 'conteo' ? `${m.label} · conteo de registros` : `${RESULTADOS[r].titulo} ${m.label.charAt(0).toLowerCase()}${m.label.slice(1)}`
  return { grupos, total, m: { ...m, fmt, label } }
}
export interface SerieM { m: Medida; por: Map<string, Grupo>; total: number }
/** Una grafica mixta: las mismas etiquetas (asesor, mes, ciudad...) medidas con dos o mas medidas.
 *  Cada medida trae su propio grupo por etiqueta; las etiquetas se ordenan por la suma de todas
 *  (o por tiempo si la dimension es de tiempo), asi el orden no cambia al prender y apagar medidas. */
export function multiserie(c: Corte, f: Filtros, g: Grafica): { labels: { label: string; orden?: number }[]; series: SerieM[] } {
  const series = idsMedidas(g).map((id) => {
    const s = serie(c, f, { ...g, medida: id })
    return { m: s.m, por: new Map(s.grupos.map((x) => [x.label, x])), total: s.total }
  })
  const suma = new Map<string, number>(), orden = new Map<string, number>()
  for (const s of series) for (const gr of s.por.values()) {
    suma.set(gr.label, (suma.get(gr.label) || 0) + gr.valor)
    if (gr.orden != null) orden.set(gr.label, gr.orden)
  }
  const dim = dimensionDe(g.dim)
  const labels = [...suma.keys()].map((l) => ({ label: l, orden: orden.get(l) }))
  labels.sort((a, b) => (dim.tiempo || a.orden != null ? (a.orden ?? 0) - (b.orden ?? 0) : (suma.get(b.label) || 0) - (suma.get(a.label) || 0)))
  return { labels, series }
}

/** Los registros detrás de un grupo, para el detalle. */
function filasDe(c: Corte, items: Item[], m?: Medida): Fila[] {
  if (m?.filas) return m.filas(items)
  // La meta no tiene registros atras: el detalle es la lista de asesores con su meta del periodo.
  if (items[0]?.u) return items.map((i) => ({
    id: 'meta:' + i.u!.id, nombre: i.u!.nombre, crm: i.u!.crm[0] || 'kommo', asesor: i.u!.nombre,
    detalle: 'Meta del periodo elegido', monto: i.v,
  }))
  if (items[0]?.vr) return filasDeVentasReales(items.map((i) => i.vr!))
  if (items[0]?.ev) return filasDeEventos(c, items.map((i) => i.ev!))
  if (items[0]?.tar) return items.map((i) => i.tar!).map((t) => ({
    id: 't:' + t.id, nombre: t.lead_nombre || t.texto || 'Tarea', link: t.link || undefined, crm: t.crm, asesor: c.usuarios.find((u) => u.id === t.asesor_id)?.nombre || 'Sin asesor',
    detalle: [t.texto, t.vencida ? 'vencida' : 'por vencer'].filter(Boolean).join(' · '), cuando: t.vence, alerta: t.vencida,
  }))
  return filasDeLeads(items.map((i) => i.lead!).filter(Boolean), () => '', (l) => l.cerrado || l.asignacion)
}

// ---------------------------------------------------------------- la gráfica
const COLORES = ['var(--c1)', 'var(--c2)', 'var(--c4)', 'var(--c3)', 'var(--neutral)', 'var(--warn)', 'var(--f3)', 'var(--f5)']
/** En una serie de tiempo lo que importa es lo RECIENTE: se cortan los últimos N periodos, no los N
 *  más altos. Fuera del tiempo se corta por tamaño, como siempre. */
function recortar<T>(xs: T[], dim: string, tope: number): T[] {
  return dimensionDe(dim).tiempo ? xs.slice(-tope) : xs.slice(0, tope)
}
/** Para las tablas: en tiempo, el periodo más reciente primero. */
const recientesArriba = <T,>(xs: T[], dim: string): T[] => (dimensionDe(dim).tiempo ? [...xs].reverse() : xs)
/** «Fechas por cierre»: contra qué fecha cae cada registro en su periodo. Solo aparece cuando el eje
 *  es tiempo, que es donde la duda muerde (Randall: el conflicto entre fecha de actividad y de
 *  asignación). Si las medidas de una mixta usan bases distintas, se dicen todas. */
function AvisoFechas({ medidas }: { medidas: Medida[] }) {
  const bases = [...new Set(medidas.map((m) => m.base).filter((b): b is BaseFecha => !!b && b !== 'ninguna'))]
  if (!bases.length) return null
  const uno = bases.length === 1
  return (
    <div className="gbase" title={bases.map((b) => BASE_FECHA[b].largo).join('\n\n')}>
      {uno ? `Fechas ${BASE_FECHA[bases[0]].corto}` : medidas.filter((m) => m.base && m.base !== 'ninguna').map((m) => `${m.label} ${BASE_FECHA[m.base as BaseFecha].corto}`).join(' · ')}
    </div>
  )
}
export function GraficaLibre(props: { corte: Corte; filtros: Filtros; g: Grafica; onDrill?: (d: Drill) => void; mini?: boolean }) {
  // Una línea une puntos en el tiempo: sobre asesores o ciudades no significa nada y las etiquetas se
  // encimaban (Randall 10-sep). Las gráficas viejas guardadas así se dibujan como barras.
  const g = props.g.tipo === 'linea' && !dimensionDe(props.g.dim).tiempo ? { ...props.g, tipo: 'hbar' as TipoGrafica } : props.g
  const p = { ...props, g }
  // Con dos o mas medidas la grafica es MIXTA; si el tipo no sabe dibujarlas (cifra, dona) manda la primera.
  const mixta = idsMedidas(g).length > 1 && MULTI_OK.includes(g.tipo)
  return mixta ? <GraficaMixta {...p} /> : <GraficaUna {...p} />
}

function GraficaUna({ corte, filtros, g, onDrill, mini = false }: { corte: Corte; filtros: Filtros; g: Grafica; onDrill?: (d: Drill) => void; mini?: boolean }) {
  const { grupos, total, m } = useMemo(() => serie(corte, filtros, g), [corte, filtros, g])
  // La meta de los asesores que caben en estos filtros; solo se calcula si la grafica la pide.
  const meta = useMemo(() => (g.meta && g.tipo === 'cifra' && conMeta(medidaDe(g.medida)) && resultadoDe(g) === 'suma' ? metaTotal(corte, filtros) : 0), [corte, filtros, g])
  if (!grupos.length) return <div className={'vacio' + (mini ? ' mini' : '')}><span className="muted">Sin datos con estos filtros.</span></div>
  const tope = mini ? 5 : (g.top || 12)
  const vistos = dimensionDe(g.dim).tiempo ? recortar(grupos, g.dim, tope)
    : g.tipo === 'linea' || g.tipo === 'vbar' ? grupos : grupos.slice(0, tope)
  const res = resultadoDe(g)
  const sub = (x: Grupo) => (m.sub ? m.sub(x.items) : m.agg || (res && res !== 'suma' && res !== 'pct' && res !== 'acumulado') ? `${fmtN(x.n)} registro${x.n === 1 ? '' : 's'}` : undefined)
  // Una medida con detalle propio (la tasa) ya trae sus fechas como columnas y no cuenta alertas.
  const propio = m.filas ? { sin: ['cuando'], alertaLabel: '', unidad: ['lead o venta', 'leads y ventas'] as [string, string] } : {}
  const ver = (x: Grupo) => onDrill?.({ titulo: `${m.label} \u00b7 ${x.label}`, filas: filasDe(corte, x.items, m), sub: filtros.rango.label, ...propio })
  const items = vistos.map((x) => ({ label: x.label, value: x.valor, sub: sub(x) }))
  const clic = onDrill && !mini ? (i: number) => ver(vistos[i]) : undefined
  // Una cifra propia usa la misma tarjeta `.tile` que las cifras de fabrica: crece con el widget y, como
  // ellas, se puede tocar para ver los registros de atras (Randall 10-sep: «las graficas que yo creo no
  // me dejan darle clic»). En la vista previa de la galeria va sin tarjeta y sin clic.
  if (g.tipo === 'cifra') {
    const cifra = m.fmt(total)
    // Con meta, la cifra se pinta como la tarjeta «Avance contra la meta» de fabrica: porcentaje,
    // medidor con la marca del ritmo (gris lo que tocaria hoy, negra la meta) y la frase del atraso,
    // con el color del estado. Sin meta configurada lo dice en vez de inventar un 0 %.
    const rit = meta > 0 ? ritmo(total, meta, filtros.rango) : null
    const dentro = rit ? (
      <>
        <div className="n">{cifra}</div>
        <div className="l">{pct(total, meta)}% de la meta de {fmtMoney0(meta)} · {m.label.toLowerCase()} {periodoTexto(filtros.rango)}</div>
        <Bullet value={total} target={meta} expected={rit.esperado} label={m.label} fmt={fmtMoney0} />
        <div className={'rt ' + rit.estado}>{rit.texto}</div>
      </>
    ) : <><div className="n">{cifra}</div><div className="l">{m.label}{g.meta ? ' · sin meta configurada' : ''}</div></>
    const clases = 'gcifra tile' + (rit ? ' t3 ritmo-' + rit.estado : '')
    return onDrill && !mini
      ? <button type="button" className={clases + ' tbtn'} aria-label={`${m.label}: ${cifra}${rit ? `. ${pct(total, meta)}% de la meta de ${fmtMoney0(meta)}. ${rit.texto}` : ''}. Ver detalle`} onClick={() => onDrill({ titulo: m.label, filas: filasDe(corte, grupos.flatMap((x) => x.items), m), sub: filtros.rango.label, ...propio })}>{dentro}</button>
      : <div className={mini ? 'gcifra' : clases}>{dentro}</div>
  }
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
  // En una tabla por tiempo el periodo más reciente va ARRIBA (Alejandro 15-sep: «debería venir septiembre
  // arriba»); en la gráfica el tiempo sigue corriendo de izquierda a derecha.
  if (g.tipo === 'tabla') return (
    <div className="scrollx"><table className="ftable" aria-label={m.label}>
      <thead><tr><th scope="col">{dimensionDe(g.dim).label}</th><th scope="col" className="num">{m.label}</th><th scope="col" className="num">{m.subLabel || 'Registros'}</th></tr></thead>
      <tbody>{recientesArriba(vistos, g.dim).map((x) => (
        <tr key={x.label} className={onDrill && !mini ? 'drill' : ''} {...(onDrill && !mini ? { role: 'button', tabIndex: 0, onClick: () => ver(x) } : {})}>
          <td>{x.label}</td><td className="num">{m.fmt(x.valor)}</td><td className="num">{m.sub ? m.sub(x.items) : fmtN(x.n)}</td>
        </tr>))}
      </tbody>
    </table></div>
  )
  const cuerpo = g.tipo === 'vbar' ? <BarChart label={m.label} fmt={m.fmt} color={COLORES[0]} items={items} onBar={clic} />
    : g.tipo === 'linea' ? <LineChart label={m.label} fmt={m.fmt} color={COLORES[3]} items={items} onPoint={clic} />
    : <HBarList label={m.label} fmt={m.fmt} color={COLORES[0]} items={items} onBar={clic} />
  if (mini) return cuerpo
  return <div className="gmulti"><AvisoFechas medidas={[m]} /><div className="gmbody">{cuerpo}</div></div>
}

/** Grafica mixta: dos o mas medidas contra la misma dimension y en la misma escala. Apiladas se lee el
 *  total; lado a lado se comparan. Un clic en la barra abre el desglose por medida y de ahi a los
 *  registros; un clic en la leyenda abre todos los registros de esa medida. */
function GraficaMixta({ corte, filtros, g, onDrill, mini = false }: { corte: Corte; filtros: Filtros; g: Grafica; onDrill?: (d: Drill) => void; mini?: boolean }) {
  const { labels, series } = useMemo(() => multiserie(corte, filtros, g), [corte, filtros, g])
  const [det, setDet] = useState<{ anchor: DOMRect; label: string } | null>(null)
  const m0 = series[0].m
  const modo: Modo = !apilable(resultadoDe(g)) ? 'lado' : g.modo || (idsMedidas(g).includes('meta') ? 'lado' : 'apilado')
  const clicable = !!onDrill && !mini
  const val = (si: number, l: string) => series[si].por.get(l)?.valor || 0
  const verSerie = (si: number, l?: string) => onDrill?.({
    titulo: series[si].m.label + (l ? ' \u00b7 ' + l : ''),
    filas: filasDe(corte, l ? (series[si].por.get(l)?.items || []) : [...series[si].por.values()].flatMap((x) => x.items), series[si].m),
    sub: filtros.rango.label,
  })
  if (!labels.length) return <div className={'vacio' + (mini ? ' mini' : '')}><span className="muted">Sin datos con estos filtros.</span></div>
  const tope = mini ? 4 : (g.top || 12)
  const vistos = dimensionDe(g.dim).tiempo ? recortar(labels, g.dim, mini ? 6 : tope)
    : g.tipo === 'linea' || g.tipo === 'vbar' ? labels.slice(0, mini ? 6 : 24) : labels.slice(0, tope)
  const items: BarItem[] = vistos.map((l) => {
    const partes = series.map((s, i) => ({ label: s.m.label, val: val(i, l.label), color: COLORES[i % COLORES.length] }))
    const suma = partes.reduce((a, p) => a + p.val, 0)
    return { label: l.label, value: suma, partes, texto: modo === 'lado' ? partes.map((p) => m0.fmt(p.val)).join(' \u00b7 ') : m0.fmt(suma) }
  })
  const abrir = clicable ? (i: number, r: DOMRect) => setDet({ anchor: r, label: vistos[i].label }) : undefined
  const filasPop: DetRow[] = det ? series.map((s, i) => ({ label: s.m.label, val: val(i, det.label), color: COLORES[i % COLORES.length], onVer: () => { setDet(null); verSerie(i, det.label) } })) : []
  const etiqueta = series.map((s) => s.m.label).join(' y ')
  const cuerpo = g.tipo === 'tabla' ? (
    <div className="scrollx"><table className="ftable" aria-label={etiqueta}>
      <thead><tr><th scope="col">{dimensionDe(g.dim).label}</th>{series.map((s) => <th key={s.m.id} scope="col" className="num">{s.m.label}</th>)}</tr></thead>
      <tbody>{recientesArriba(vistos, g.dim).map((l) => (
        <tr key={l.label}>
          <td>{l.label}</td>
          {series.map((s, i) => (
            <td key={s.m.id} className="num">
              {clicable ? <button type="button" className="nbtn celln" onClick={() => verSerie(i, l.label)} title={`${s.m.label} \u00b7 ${l.label}. Ver registros`}>{m0.fmt(val(i, l.label))}</button> : m0.fmt(val(i, l.label))}
            </td>
          ))}
        </tr>))}
      </tbody>
    </table></div>
  ) : g.tipo === 'vbar' ? (
    <BarChart label={etiqueta} fmt={m0.fmt} items={items} modo={modo} onBar={abrir} />
  ) : g.tipo === 'linea' ? (
    <LineChart label={etiqueta} fmt={m0.fmt} items={items}
      series={series.map((s, i) => ({ label: s.m.label, color: COLORES[i % COLORES.length], items: vistos.map((l) => ({ label: l.label, value: val(i, l.label) })) }))}
      onPoint={clicable ? (i, _r, si) => verSerie(si || 0, vistos[i].label) : undefined} />
  ) : (
    <HBarList label={etiqueta} fmt={m0.fmt} items={items} modo={modo} onBar={abrir} />
  )
  return (
    <div className="gmulti">
      <div className="gleyenda">
        {series.map((s, i) => {
          // El total de la leyenda es el de lo que SE VE: con 12 meses dibujados de un rango de tres
          // años, poner la suma de los 39 meses hacía leer mal la gráfica.
          const suma = vistos.reduce((a, l) => a + val(i, l.label), 0)
          const dentro = <><i style={{ background: COLORES[i % COLORES.length] }} aria-hidden="true" /><span>{s.m.label}</span><b>{m0.fmt(suma)}</b></>
          return clicable
            ? <button type="button" key={s.m.id} className="chip" onClick={() => verSerie(i)} aria-label={`${s.m.label}: ${m0.fmt(suma)}. Ver todos sus registros`}>{dentro}</button>
            : <span key={s.m.id} className="chip">{dentro}</span>
        })}
        {!mini && <span className="chip modo">{modo === 'apilado' ? 'apiladas: suman el total' : 'lado a lado: para comparar'}</span>}
      </div>
      {!mini && <AvisoFechas medidas={series.map((x) => x.m)} />}
      <div className="gmbody">{cuerpo}</div>
      {det && <BarDetailPopup anchor={det.anchor} title={det.label} total={filasPop.reduce((a, r) => a + r.val, 0)} rows={filasPop} fmt={m0.fmt} onClose={() => setDet(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------- plantillas de la galería
const P = (id: string, titulo: string, medida: string, dim: string, tipo: TipoGrafica, extra: Partial<Grafica> = {}): Grafica => ({ id, titulo, medida, dim, tipo, ...extra })
/** Mixta: varias medidas en la misma grafica. `apilado` cuando las medidas suman un total, `lado` cuando se comparan. */
const X = (id: string, titulo: string, medidas: string[], dim: string, tipo: TipoGrafica, modo: Modo = 'apilado'): Grafica =>
  ({ id, titulo, medida: medidas[0], medidas: medidas.slice(1), dim, tipo, modo })
export const MIXTAS: Grafica[] = [
  X('x-llamadas', 'Llamadas: contestadas y sin contestar', ['contestadas', 'sin_contestar'], 'asesor', 'hbar'),
  X('x-lev', 'Levantamientos: agendados contra hechos', ['lev_agendados', 'lev_hechos'], 'asesor', 'hbar', 'lado'),
  X('x-embudo', 'Del lead a la venta por asesor', ['leads', 'cotizaciones', 'ventas'], 'asesor', 'hbar', 'lado'),
  X('x-actividad', 'Actividad por asesor', ['tareas_hechas', 'llamadas', 'cotizaciones'], 'asesor', 'hbar'),
  X('x-riesgo', 'Riesgo de seguimiento por asesor', ['tareas_vencidas', 'sin_tarea', 'pc_vencido'], 'asesor', 'hbar'),
  X('x-juego', 'Leads en juego y descartados', ['activos', 'descartes'], 'asesor', 'hbar'),
  X('x-meta-asesor', 'Vendido contra la meta por asesor', ['vendido', 'meta'], 'asesor', 'hbar', 'lado'),
  X('x-meta-mes', 'Vendido contra la meta por mes', ['vendido', 'meta'], 'mes', 'vbar', 'lado'),
  X('x-meta-trim', 'Vendido contra la meta por trimestre', ['vendido', 'meta'], 'trimestre', 'vbar', 'lado'),
  X('x-meta-equipo', 'Vendido contra la meta por equipo', ['vendido', 'meta'], 'equipo', 'vbar', 'lado'),
  X('x-cot-ventas', 'Cotizaciones y ventas por mes', ['cotizaciones', 'ventas'], 'mes', 'linea'),
  X('x-ciudad', 'Cotizaciones y ventas por ciudad', ['cotizaciones', 'ventas'], 'ciudad', 'vbar', 'lado'),
]
export const PLANTILLAS: Grafica[] = [
  // Conversión (Randall 22-sep): la tasa de cierre por origen, por asesor y mes a mes; se cambia el dibujo en el editor.
  P('p-conv-origen', 'Tasa de cierre por origen', 'conversion', 'origen_lead', 'hbar'),
  P('p-conv-asesor', 'Tasa de conversión por asesor', 'conversion', 'asesor', 'hbar'),
  P('p-conv-mes', 'Tasa de conversión por mes', 'conversion', 'mes', 'vbar'),
  P('p-leads-origen', 'Leads asignados por origen', 'leads', 'origen_lead', 'dona'),
  P('p-lev-agendados', 'Levantamientos agendados por asesor', 'lev_agendados', 'asesor', 'hbar'),
  P('p-lev-hechos', 'Levantamientos hechos por asesor', 'lev_hechos', 'asesor', 'hbar'),
  P('p-ciudad-leads', 'Leads asignados por ciudad', 'leads', 'ciudad', 'hbar'),
  P('p-ciudad-ventas', 'Ventas cerradas por ciudad', 'ventas', 'ciudad', 'hbar'),
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
  P('p-vendido-trim', 'Monto vendido por trimestre', 'vendido', 'trimestre', 'vbar'),
  P('p-cumpl-mes', 'Cumplimiento de la meta por mes', 'cumplimiento', 'mes', 'vbar'),
  P('p-cumpl-asesor', 'Cumplimiento de la meta por asesor', 'cumplimiento', 'asesor', 'hbar'),
  P('p-cumpl-equipo', 'Cumplimiento de la meta por equipo', 'cumplimiento', 'equipo', 'vbar'),
  P('p-ventas-anio', 'Clientes cerrados por año', 'ventas', 'anio', 'vbar'),
  P('p-leads-semana', 'Leads asignados por semana', 'leads', 'semana', 'linea'),
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
  P('p-meta-vendido', 'Vendido contra la meta', 'vendido', 'ninguna', 'cifra', { meta: true, span: 2, alto: 5 }),
  P('p-meta-cotizado', 'Cotizado vigente contra la meta', 'cotizado', 'ninguna', 'cifra', { meta: true, span: 2, alto: 5 }),
  P('p-r-contrato', 'Contrato total (cifra)', 'r_contrato', 'ninguna', 'cifra', { span: 1, alto: 4 }),
  P('p-r-paneles', 'Paneles vendidos (cifra)', 'r_paneles', 'ninguna', 'cifra', { span: 1, alto: 4 }),
  P('p-r-ticket-cifra', 'Ticket promedio (cifra)', 'r_ticket', 'ninguna', 'cifra', { span: 1, alto: 4 }),
]

// ---------------------------------------------------------------- galería y editor
/** Las fechas propias de una gráfica, vistas desde el constructor: cuál tiene, con qué filtros
 *  dibujarla y cómo cambiarlas. La página es la que sabe traducir un periodo a fechas. */
export interface FechasCtor { de: (id: string) => RangoWidget | undefined; filtros: (id: string) => Filtros; fijar: (id: string, p: RangoWidget | null) => void }

export function Galeria({ corte, filtros, quitados, enTablero = [], onIr, onAgregar, onCrear, onClose, fechas }: {
  corte: Corte; filtros: Filtros; quitados: { id: string; titulo: string; nodo: React.ReactNode }[]
  enTablero?: { id: string; titulo: string }[]; onIr?: (id: string) => void
  onAgregar: (id: string) => void; onCrear: (g: Grafica) => void; onClose: () => void; fechas?: FechasCtor
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFocoDialogo(ref)
  useEscape(onClose)
  const [q, setQ] = useState('')
  const [editar, setEditar] = useState<Grafica | null>(null)
  const mias = useMisGraficas()
  const hayComisiones = !!corte.comisiones
  // Arrastrar una tarjeta hace lo mismo que tocarla: cierra la galería y la deja pegada al puntero.
  const arrastrar = (accion: () => void) => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const x0 = e.clientX, y0 = e.clientY
    const mover = (ev: PointerEvent) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) { soltar(); accion() } }
    const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar) }
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar)
  }
  const nq = q.trim().toLowerCase()
  const busca = (p: Grafica) => !nq || p.titulo.toLowerCase().includes(nq) || idsMedidas(p).some((id) => medidaDe(id).label.toLowerCase().includes(nq))
  const plantillas = PLANTILLAS.filter((p) => (hayComisiones || !p.medida.startsWith('r_')) && busca(p))
  const mixtas = MIXTAS.filter(busca)
  const guardadas = mias.lista.filter(busca)
  const tarjeta = (p: Grafica) => (
    <span className="gcard-wrap" key={p.id}>
      <button type="button" className="gcard" onClick={() => { onCrear({ ...p, id: 'g' + Date.now().toString(36) }); onClose() }} onPointerDown={arrastrar(() => { onCrear({ ...p, id: 'g' + Date.now().toString(36) }); onClose() })} title={`Arrastra «${p.titulo}» a la celda del tablero donde la quieras`}>
        <span className="gt">{p.titulo}</span>
        <span className="gprev" aria-hidden="true"><GraficaLibre corte={corte} filtros={filtros} g={p} mini /></span>
      </button>
      <button type="button" className="nbtn gedit" onClick={() => setEditar({ ...p, id: 'g' + Date.now().toString(36) })}>Ajustar antes de agregar</button>
    </span>
  )
  const dev = quitados.filter((w) => !nq || w.titulo.toLowerCase().includes(nq))
  const ya = enTablero.filter((w) => !nq || w.titulo.toLowerCase().includes(nq)).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'))
  if (editar) return <Editor corte={corte} filtros={fechas ? fechas.filtros(editar.id) : filtros} g={editar}
    rango={fechas?.de(editar.id)} onRango={fechas ? (p) => fechas.fijar(editar.id, p) : undefined}
    onMia={mias.guardar} onGuardar={(x) => { onCrear(x); onClose() }} onClose={() => setEditar(null)} />
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal galeria" role="dialog" aria-modal="true" aria-label="Agregar una gráfica" ref={ref}>
        <div className="mh">
          <div className="mt"><h2>Agregar una gráfica</h2><div className="small muted">Arrástrala a la celda del tablero donde la quieras, o tócala y luego toca el lugar. La vista previa usa tus datos y los filtros de arriba.</div></div>
          <input className="sel" type="search" placeholder="Buscar…" aria-label="Buscar gráfica" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="mb">
          <button type="button" className="gcrear" onClick={() => setEditar({ id: 'g' + Date.now().toString(36), titulo: 'Mi gráfica', medida: 'llamadas', dim: 'asesor', tipo: 'hbar' })}>
            <span className="gc-mas" aria-hidden="true">+</span><span><b>Crear una gráfica</b><br /><span className="muted">Elige qué medir (una medida o varias juntas), cómo partirlo y cómo dibujarlo</span></span>
          </button>
          {dev.length > 0 && <h3 className="gsec">Quitadas del tablero</h3>}
          <div className="ggrid">
            {dev.map((w) => (
              <button type="button" key={w.id} className="gcard" onClick={() => { onAgregar(w.id); onClose() }} onPointerDown={arrastrar(() => { onAgregar(w.id); onClose() })} title={`Arrastra «${w.titulo}» a la celda del tablero donde la quieras`}>
                <span className="gt">{w.titulo}</span>
                <span className="gprev" aria-hidden="true">{w.nodo}</span>
              </button>
            ))}
          </div>
          {onIr && ya.length > 0 && <>
            <h3 className="gsec">Ya en este tablero · toca una para ir a ella</h3>
            <div className="gya">{ya.map((w) => <button type="button" key={w.id} className="chip" onClick={() => onIr(w.id)} title={`Ir a «${w.titulo}»`}>{w.titulo}</button>)}</div>
          </>}
          {guardadas.length > 0 && <>
            <h3 className="gsec">Mis gráficas · las que tú guardaste</h3>
            <div className="ggrid">{guardadas.map((p) => (
              <span className="gcard-wrap" key={p.id}>
                <button type="button" className="gcard" onClick={() => { onCrear({ ...p, id: 'g' + Date.now().toString(36) }); onClose() }} onPointerDown={arrastrar(() => { onCrear({ ...p, id: 'g' + Date.now().toString(36) }); onClose() })} title={`Arrastra «${p.titulo}» a la celda del tablero donde la quieras`}>
                  <span className="gt">{p.titulo}</span>
                  <span className="gprev" aria-hidden="true"><GraficaLibre corte={corte} filtros={filtros} g={p} mini /></span>
                </button>
                <span className="gcard-pie">
                  <button type="button" className="nbtn gedit" onClick={() => setEditar({ ...p, id: 'g' + Date.now().toString(36) })}>Ajustar antes de agregar</button>
                  <button type="button" className="nbtn gborrar" onClick={() => mias.quitar(p.id)} title={`Quitar «${p.titulo}» de mis gráficas`}>Quitar de mis gráficas</button>
                </span>
              </span>
            ))}</div>
          </>}
          {mixtas.length > 0 && <h3 className="gsec">Mixtas · comparan dos o más medidas</h3>}
          <div className="ggrid">{mixtas.map(tarjeta)}</div>
          <h3 className="gsec">Gráficas listas</h3>
          <div className="ggrid">
            {plantillas.map(tarjeta)}
            {!plantillas.length && !mixtas.length && !dev.length && <div className="muted">Nada con «{q}».</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** El nombre que se pone solo: «Llamadas contestadas y Llamadas sin contestar por asesor». */
/** Las gráficas que alguien guardó para reusarlas, en su cuenta (Randall 10-sep: «que las gráficas
 *  que cree las pueda guardar para que se queden en la galería»). Viven aparte del tablero: una
 *  gráfica guardada se puede agregar a cualquier tablero, o borrarse sin tocar los tableros. */
const CLAVE_MIAS = 'mis-graficas'
export function useMisGraficas() {
  const [lista, setLista] = useState<Grafica[]>([])
  useEffect(() => {
    let vivo = true
    cargarTableros().then((t) => {
      const g = t[CLAVE_MIAS] as { lista?: Grafica[] } | undefined
      if (vivo && g && Array.isArray(g.lista)) setLista(g.lista)
    }).catch(() => { /* sin sesión */ })
    return () => { vivo = false }
  }, [])
  const fijar = (v: Grafica[]) => { setLista(v); guardarTablero(CLAVE_MIAS, { lista: v, ts: Date.now() }).catch(() => { /* sin sesión */ }) }
  return {
    lista,
    guardar: (g: Grafica) => fijar([{ ...g, id: 'm' + Date.now().toString(36) }, ...lista.filter((x) => x.titulo !== g.titulo)].slice(0, 40)),
    quitar: (id: string) => fijar(lista.filter((x) => x.id !== id)),
    yaEsta: (g: Grafica) => lista.some((x) => x.titulo === g.titulo),
  }
}

export function autoTitulo(g: Grafica): string {
  const ls = idsMedidas(g).map((id) => medidaDe(id).label)
  const medidas = ls.length > 1 ? ls.slice(0, -1).join(', ') + ' y ' + ls[ls.length - 1] : ls[0]
  const r = resultadoDe(g), nat = naturalDe(medidaDe(g.medida))
  const conR = !r || r === nat ? medidas : r === 'conteo' ? `${medidas} · conteo de registros` : `${RESULTADOS[r].titulo} ${medidas.charAt(0).toLowerCase()}${medidas.slice(1)}`
  return conR + (g.dim === 'ninguna' ? '' : ' por ' + dimensionDe(g.dim).label.toLowerCase())
}

export function Editor({ corte, filtros, g, onGuardar, onClose, rango, onRango, onMia }: { corte: Corte; filtros: Filtros; g: Grafica; onGuardar: (g: Grafica) => void; onClose: () => void; rango?: RangoWidget; onRango?: (p: RangoWidget | null) => void; onMia?: (g: Grafica) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocoDialogo(ref)
  useEscape(onClose)
  const [cfg, setCfg] = useState<Grafica>(g)
  const [guardada, setGuardada] = useState(false)
  // El titulo se escribe solo hasta que alguien lo escribe a mano; asi cambiar de medida no borra un nombre propio.
  const [manual, setManual] = useState(() => !!g.titulo && g.titulo !== 'Mi gráfica' && g.titulo !== autoTitulo(g))
  const ids = idsMedidas(cfg)
  const m = medidaDe(cfg.medida)
  const dims = dimsComunes(ids)
  const esTiempo = dimensionDe(cfg.dim).tiempo
  const resultados = resultadosDe(ids, cfg.dim, cfg.tipo), resultado = resultadoDe(cfg), naturalM = naturalDe(m)
  const set = (x: Partial<Grafica>) => setCfg((c) => {
    const n = { ...c, ...x }
    const nids = idsMedidas(n)
    if (!dimsComunes(nids).some((d) => d.id === n.dim)) n.dim = (dimsComunes(nids)[0] || DIMENSIONES[0]).id
    if (nids.length > 1 && !MULTI_OK.includes(n.tipo)) n.tipo = 'hbar'
    // Una línea une puntos en el tiempo; con asesores o ciudades no hay nada que unir (Randall 10-sep
    // hizo una línea por asesor y salió un punto suelto).
    if (n.tipo === 'linea' && !dimensionDe(n.dim).tiempo) n.tipo = 'vbar'
    // Al pasar a un eje de tiempo, las barras verticales son lo natural (el tiempo corre a lo ancho).
    if (x.dim && dimensionDe(n.dim).tiempo && !dimensionDe(c.dim).tiempo && n.tipo === 'hbar') n.tipo = 'vbar'
    // El resultado elegido se olvida si con la nueva medida, dimensión o dibujo ya no tiene sentido.
    if (n.resultado && !resultadosDe(nids, n.dim, n.tipo).includes(n.resultado)) n.resultado = undefined
    if (!apilable(resultadoDe(n)) && nids.length > 1) n.modo = 'lado'
    if (n.meta && (n.tipo !== 'cifra' || !conMeta(medidaDe(n.medida)) || resultadoDe(n) !== 'suma')) n.meta = undefined
    // Una meta no se APILA con lo vendido (sumarlas no significa nada): va al lado, para comparar.
    if (nids.includes('meta') && nids.length > 1 && !c.modo) n.modo = 'lado'
    if (!manual) n.titulo = autoTitulo(n)
    return n
  })
  // Medidas que se pueden sumar a esta grafica: mismas unidades y que no esten ya puestas.
  const libres = MEDIDAS.filter((x) => (corte.comisiones || !x.id.startsWith('r_')) && !ids.includes(x.id) && combinable(m, x))
  const sePuedeSumar = ids.length < MAX_MEDIDAS && libres.length > 0
  const conMedidas = (v: string[]) => set({ medida: v[0], medidas: v.slice(1) })
  const sumar = () => conMedidas([...ids, libres[0].id])
  const quitar = (i: number) => conMedidas(ids.filter((_, j) => j !== i))
  const cambiar = (i: number, id: string) => conMedidas(ids.map((x, j) => (j === i ? id : x)))
  const grupos = MEDIDAS.reduce((acc, x) => { (acc[x.grupo] = acc[x.grupo] || []).push(x); return acc }, {} as Record<string, Medida[]>)
  // Una sola escala es honesta, pero si una medida es 20 veces la otra la chica se ve como una raya.
  // Mejor decirlo aqui que dejar una grafica que no se puede leer.
  const aviso = useMemo(() => {
    if (idsMedidas(cfg).length < 2) return ''
    const ts = multiserie(corte, filtros, cfg).series.map((x) => ({ l: x.m.label, t: x.total })).filter((x) => x.t > 0)
    if (ts.length < 2) return ''
    const alto = ts.reduce((a, x) => (x.t > a.t ? x : a)), bajo = ts.reduce((a, x) => (x.t < a.t ? x : a))
    return alto.t / bajo.t > 20 ? `«${alto.l}» es mucho más grande que «${bajo.l}»: en la misma escala la chica casi no se ve. Se leen mejor en gráficas aparte.` : ''
  }, [corte, filtros, cfg])
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal editor" role="dialog" aria-modal="true" aria-label="Constructor de gráficas" ref={ref}>
        <div className="mh">
          <div className="mt"><h2>Constructor de gráficas</h2><div className="small muted">{m.ayuda}</div></div>
          <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="mb ed-cuerpo">
          <div className="ed-campos">
            <div className="ed-campo">
              <span className="ed-lbl">Qué medir</span>
              <div className="ed-medidas">
                {ids.map((id, i) => (
                  <div className="ed-medida" key={i}>
                    <select className="sel" aria-label={i === 0 ? 'Medida' : `Medida ${i + 1}`} value={id} onChange={(e) => cambiar(i, e.target.value)}>
                      {Object.entries(grupos).map(([gr, ms]) => (
                        <optgroup key={gr} label={gr}>
                          {ms.filter((x) => corte.comisiones || !x.id.startsWith('r_')).map((x) => (
                            <option key={x.id} value={x.id} disabled={x.id !== id && (ids.includes(x.id) || (ids.length > 1 && !combinable(i === 0 ? medidaDe(ids[1]) : m, x)))}>
                              {x.label}{ids.length > 1 && x.id !== id && !ids.includes(x.id) && !combinable(i === 0 ? medidaDe(ids[1]) : m, x) ? ((x.agg || 'suma') !== 'suma' ? ' — es un promedio, no se suma' : ' — otra unidad') : ''}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {i > 0 && <button type="button" className="ib" title="Quitar esta medida" aria-label={`Quitar ${medidaDe(id).label}`} onClick={() => quitar(i)}>×</button>}
                  </div>
                ))}
              </div>
              {sePuedeSumar && <button type="button" className="nbtn ed-mas" onClick={sumar}>+ Agregar otra medida</button>}
              <span className="small muted">{ids.length > 1
                ? 'Van en la misma escala; por eso solo se juntan medidas del mismo tipo (piezas con piezas, pesos con pesos).'
                : 'Puedes sumar otra medida y compararlas en la misma gráfica.'}</span>
              {aviso && <span className="small ed-aviso">{aviso}</span>}
            </div>
            <div className="ed-campo">
              <span className="ed-lbl" id="ed-resultado-lbl">Resultado</span>
              {resultados.length > 0 ? (<>
                <select className="sel" value={resultado || ''} aria-labelledby="ed-resultado-lbl" aria-describedby="ed-resultado-ayuda" onChange={(e) => set({ resultado: e.target.value as Resultado })}>
                  {resultados.map((r) => <option key={r} value={r}>{etiquetaResultado(r, ids)}{r === naturalM ? ' · lo normal de esta medida' : ''}</option>)}
                </select>
                <span id="ed-resultado-ayuda" className="small muted">{resultado ? RESULTADOS[resultado].ayuda : ''}{!resultados.includes('conteo') ? ' Promedio, mediana, mínimo y máximo aparecen con medidas que traen un valor (pesos o paneles).' : ''}</span>
              </>) : <span className="small muted">«{m.label}» ya es una proporción: no se suma ni se promedia.</span>}
            </div>
            <label>Cómo partirlo
              <select className="sel" value={cfg.dim} onChange={(e) => set({ dim: e.target.value })}>
                {dims.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
            {onRango && (
              <label>Fechas de esta gráfica
                <select className="sel" value={rango || ''} onChange={(e) => onRango((e.target.value || null) as RangoWidget | null)}>
                  <option value="">Las del tablero</option>
                  <option value="foto">Foto de hoy · sin fechas</option>
                  {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <span className="small muted">{rango
                  ? 'Esta gráfica NO sigue las fechas de arriba: siempre mira este periodo.'
                  : 'Sigue el periodo que elijas arriba en el tablero.'}</span>
              </label>
            )}
            <div className="ed-campo">
              <span className="ed-lbl">Cómo dibujarlo</span>
              <span className="ed-tipos" role="radiogroup" aria-label="Tipo de gráfica">
                {TIPOS.map((t) => {
                  const noMulti = ids.length > 1 && !MULTI_OK.includes(t.id)
                  const noLinea = t.id === 'linea' && !dimensionDe(cfg.dim).tiempo
                  const no = noMulti || noLinea
                  const porque = noMulti ? `${t.label}: solo con una medida` : noLinea ? 'La línea une puntos en el tiempo: parte por semana, mes, trimestre…' : t.label
                  return (
                    <button type="button" key={t.id} role="radio" aria-checked={cfg.tipo === t.id} disabled={no} className={'ed-tipo' + (cfg.tipo === t.id ? ' on' : '')} onClick={() => set({ tipo: t.id })} title={porque}>
                      <IconoTipo id={t.id} /><span>{t.label}</span>
                    </button>
                  )
                })}
              </span>
            </div>
            {cfg.tipo === 'cifra' && conMeta(m) && (
              <label className="ed-check">
                <input type="checkbox" checked={!!cfg.meta} onChange={(e) => set({ meta: e.target.checked })} />
                <span>Comparar contra la meta<small>agrega el medidor del ritmo y la frase «▼ $747K abajo del ritmo»</small></span>
              </label>
            )}
            {ids.length > 1 && (cfg.tipo === 'hbar' || cfg.tipo === 'vbar') && (
              <div className="ed-campo">
                <span className="ed-lbl">Cómo combinarlas</span>
                <span className="ed-modo" role="radiogroup" aria-label="Cómo combinar las medidas">
                  {MODOS.map((x) => (
                    <button type="button" key={x.id} role="radio" aria-checked={(cfg.modo || 'apilado') === x.id} disabled={x.id === 'apilado' && !apilable(resultado)} title={x.id === 'apilado' && !apilable(resultado) ? 'Un promedio, una mediana o un máximo no se suman: van lado a lado' : undefined} className={'ed-tipo largo' + ((cfg.modo || 'apilado') === x.id ? ' on' : '')} onClick={() => set({ modo: x.id })}>
                      <b>{x.label}</b><span>{x.ayuda}</span>
                    </button>
                  ))}
                </span>
              </div>
            )}
            <label>Título<input className="inp" value={cfg.titulo} onChange={(e) => { setManual(true); setCfg((c) => ({ ...c, titulo: e.target.value })) }} /></label>
            <label>{esTiempo ? 'Cuántos periodos' : 'Cuántos mostrar'}
              <select className="sel" value={cfg.top || 12} onChange={(e) => set({ top: Number(e.target.value) })}>
                {(esTiempo ? [6, 12, 24, 50] : [5, 10, 12, 20, 50]).map((n) => <option key={n} value={n}>{n === 50 ? 'Todos' : esTiempo ? `Los ${n} más recientes` : `Los ${n} más altos`}</option>)}
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
          {onMia && <button type="button" className="btn" onClick={() => { onMia(cfg); setGuardada(true) }} disabled={guardada}>
            {guardada ? '✓ Guardada en mis gráficas' : 'Guardar en mis gráficas'}
          </button>}
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
