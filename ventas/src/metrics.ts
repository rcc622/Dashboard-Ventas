// Todas las cifras salen de aquí. Funciones puras sobre el corte + filtros;
// la interfaz solo pinta. Espejo del DASHBOARD de Sheets (dashboard_leads_kenet.gs):
//   · rango de fecha → QUÉ LEADS (por fecha de asignación) y QUÉ ACTIVIDADES (por fecha del hecho)
//   · equipo (zona) / asesor → todo
// Reglas de Alejandro (consultor, juntas jul-ago 2026) que viven aquí: meta en pesos
// prorrateada al rango, cotizado vigente (≤ 90 d) contra 10× la meta mensual, tasa de
// asignación como KPI de entrada, primer contacto en horas y perfiles actividad × venta.
import type { Corte, Crm, Etapa, Evento, Lead, Rango, Tarea, Usuario } from './types'

/** crm = qué CRM entran (botones Kommo · HubSpot de la barra del Admin); al menos uno encendido. */
export interface Filtros { rango: Rango; equipo: string | null; asesor: string | null; crm: Record<Crm, boolean> }
export const TODOS_CRM: Record<Crm, boolean> = { kommo: true, hubspot: true }
export const pasaCrm = (crm: Crm, f: Filtros) => f.crm?.[crm] !== false

const DIA = 86400

// ---------------------------------------------------------------- fechas
export const inicioDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export const ep = (d: Date) => Math.floor(d.getTime() / 1000)
export const hoyIni = () => ep(inicioDia(new Date()))
export const esHoy = (ts: number) => ts >= hoyIni() && ts < hoyIni() + DIA
export const enRango = (ts: number, r: Rango) => ts >= r.ini && ts < r.fin
export const sumar = (d: Date, dias: number) => { const x = new Date(d); x.setDate(x.getDate() + dias); return x }
export const fechaDe = (ts: number) => new Date(ts * 1000)

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const fmtFecha = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
export const fmtCorta = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]}`
export const fmtHora = (ts: number) => { const d = fechaDe(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
export const mesNombre = (d: Date) => MESES[d.getMonth()]

export type Preset = 'hoy' | 'semana' | 'mes' | 'mes_pasado' | 'trimestre' | 'd90'
export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'hoy', label: 'Hoy' }, { id: 'semana', label: 'Esta semana' }, { id: 'mes', label: 'Este mes' },
  { id: 'mes_pasado', label: 'Mes pasado' }, { id: 'trimestre', label: 'Este trimestre' }, { id: 'd90', label: 'Últimos 90 días' },
]

export function preset(p: Preset, ahora = new Date()): Rango {
  const h = inicioDia(ahora)
  const label = PRESETS.find((x) => x.id === p)!.label
  switch (p) {
    case 'hoy': return { ini: ep(h), fin: ep(h) + DIA, label }
    case 'semana': { const lun = sumar(h, -((h.getDay() + 6) % 7)); return { ini: ep(lun), fin: ep(sumar(lun, 7)), label } }
    case 'mes': { const a = new Date(h.getFullYear(), h.getMonth(), 1); return { ini: ep(a), fin: ep(new Date(h.getFullYear(), h.getMonth() + 1, 1)), label } }
    case 'mes_pasado': { const a = new Date(h.getFullYear(), h.getMonth() - 1, 1); return { ini: ep(a), fin: ep(new Date(h.getFullYear(), h.getMonth(), 1)), label } }
    case 'trimestre': { const q = Math.floor(h.getMonth() / 3) * 3; return { ini: ep(new Date(h.getFullYear(), q, 1)), fin: ep(new Date(h.getFullYear(), q + 3, 1)), label } }
    case 'd90': return { ini: ep(sumar(h, -89)), fin: ep(h) + DIA, label }
  }
}

export function rangoManual(a: Date, b: Date): Rango {
  const [x, y] = a <= b ? [a, b] : [b, a]
  return { ini: ep(inicioDia(x)), fin: ep(sumar(inicioDia(y), 1)), label: `${fmtCorta(x)} → ${fmtCorta(y)}` }
}

// ---------------------------------------------------------------- formato
export const fmtN = (n: number) => Math.round(n).toLocaleString('es-MX')
export function fmtMoney(n: number): string {
  if (!n) return '—'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K'
  return '$' + fmtN(n)
}
/** Como fmtMoney pero el cero se escribe ($0), para metas y faltantes. */
export const fmtMoney0 = (n: number) => (n ? fmtMoney(n) : '$0')
export const fmtMXN = (n: number) => '$' + fmtN(n) + ' MXN'
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
export const iniciales = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase()
export const tipoLead = (l: Lead) => (l.embudo === 'ventas' ? 'Ventas' : l.embudo === 'hunting' ? 'Hunting' : l.embudo === 'nuevo' ? 'Nuevo' : 'Cadencia')
export function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---------------------------------------------------------------- filtros
export function mapaUsuarios(c: Corte): Map<string, Usuario> { return new Map(c.usuarios.map((u) => [u.id, u])) }
export function zonaNombre(c: Corte, zona: string): string { return c.equipos.find((e) => e.id === zona)?.nombre || (zona || 'Sin equipo') }

function pasaPersona(asesorId: string | null, f: Filtros, users: Map<string, Usuario>): boolean {
  if (f.asesor != null) return asesorId === f.asesor
  if (f.equipo != null) return asesorId != null && users.get(asesorId)?.zona === f.equipo
  return true
}

/** Leads del corte cuya ÚLTIMA ASIGNACIÓN cae en el rango (col V de Leads_Data). */
export function leadsFiltrados(c: Corte, f: Filtros): Lead[] {
  const users = mapaUsuarios(c)
  return c.leads.filter((l) => pasaCrm(l.crm, f) && enRango(l.asignacion, f.rango) && pasaPersona(l.asesor_id, f, users))
}
/** Actividades cuya fecha cae en el rango. */
export function eventosFiltrados(c: Corte, f: Filtros): Evento[] {
  const users = mapaUsuarios(c)
  return c.eventos.filter((e) => pasaCrm(e.crm, f) && enRango(e.ts, f.rango) && pasaPersona(e.asesor_id, f, users))
}
export const vivo = (l: Lead) => l.funnel !== 0 && l.funnel !== 5
/** Ventas = leads ganados cuyo cierre cae en el rango (el cierre manda, no la asignación). */
export function ventasFiltradas(c: Corte, f: Filtros): Lead[] {
  const users = mapaUsuarios(c)
  return c.leads.filter((l) => pasaCrm(l.crm, f) && l.funnel === 5 && enRango(l.cerrado, f.rango) && pasaPersona(l.asesor_id, f, users))
}

// ---------------------------------------------------------------- metas (MXN)
export const META_DEFAULT = 800000
/** Meta mensual en pesos del asesor: la suya, si no la de su zona, si no la general. */
export const metaDe = (c: Corte, u: Usuario) => c.metas?.[u.id] ?? c.metas_zona?.[u.zona] ?? c.meta_mxn ?? META_DEFAULT
export const metaDeId = (c: Corte, uid: string) => { const u = c.usuarios.find((x) => x.id === uid); return u ? metaDe(c, u) : c.meta_mxn ?? META_DEFAULT }
const esPrimero = (d: Date) => d.getDate() === 1 && d.getHours() === 0 && d.getMinutes() === 0
/** Meta mensual llevada al rango: meses completos si va de día 1 a día 1; si no, por días (30.44 por mes). */
export function metaEnRango(metaMes: number, r: Rango): number {
  const a = fechaDe(r.ini), b = fechaDe(r.fin)
  if (esPrimero(a) && esPrimero(b)) {
    const meses = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
    if (meses >= 1) return metaMes * meses
  }
  return metaMes * ((r.fin - r.ini) / DIA) / 30.4375
}
/** Lo que ya debería estar vendido a esta hora del rango (regla de tres por tiempo transcurrido). */
export function metaEsperada(metaRango: number, r: Rango, ahora = Date.now() / 1000): number {
  const f = Math.max(0, Math.min(1, (ahora - r.ini) / Math.max(1, r.fin - r.ini)))
  return metaRango * f
}

// ---------------------------------------------------------------- cotizado (salud del pipeline)
export interface Cotizado { vigente: number; viejo: number; n: number; nViejo: number; buckets: number[] }
export const BUCKETS = ['≤ 30 d', '31-60 d', '61-90 d', '> 90 d']
/** Fecha desde la que envejece una cotización: la del CF, o la asignación si no la hay. */
export const fechaCotizado = (l: Lead) => l.cotizacion || l.asignacion
/** Presupuesto de los leads activos con monto, partido por antigüedad. Vigente = ≤ dias. */
export function cotizado(leads: Lead[], dias: number, ahora = Date.now() / 1000): Cotizado {
  const c: Cotizado = { vigente: 0, viejo: 0, n: 0, nViejo: 0, buckets: [0, 0, 0, 0] }
  for (const l of leads) {
    if (!vivo(l) || l.presupuesto <= 0) continue
    const d = (ahora - fechaCotizado(l)) / DIA
    c.buckets[d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3] += l.presupuesto
    if (d <= dias) { c.vigente += l.presupuesto; c.n++ } else { c.viejo += l.presupuesto; c.nViejo++ }
  }
  return c
}

// ---------------------------------------------------------------- entrada (tasa de asignación)
export interface Entrada { llegaron: number; sinRespuesta: number; sinRecibo: number; conRecibo: number; asignados: number; perdidos: number; tasa: number | null }
/** Marcador de entrada: leads de Kommo creados en el rango. Con filtro de asesor o equipo se
 *  cuentan por el RESPONSABLE ACTUAL del lead (Randall, 4-sep: «el dato solo del asesor»);
 *  los que aún no se asignan cuelgan de la cuenta admin y quedan fuera de ese recorte.
 *  conRecibo incluye a los ya asignados. null sin fuente Kommo o con Kommo apagado. */
export function entrada(c: Corte, r: Rango, f?: Filtros): Entrada | null {
  if (!(c.fuentes || []).some((x) => x.crm === 'kommo') || (f && !pasaCrm('kommo', f))) return null
  const users = mapaUsuarios(c)
  const e: Entrada = { llegaron: 0, sinRespuesta: 0, sinRecibo: 0, conRecibo: 0, asignados: 0, perdidos: 0, tasa: null }
  for (const l of c.leads) {
    if (l.crm !== 'kommo' || !enRango(l.creado, r) || (f && !pasaPersona(l.asesor_id, f, users))) continue
    e.llegaron++
    if (l.funnel === 0) e.perdidos++
    else if (l.funnel === 1) e.sinRespuesta++
    else if (l.funnel === 2) e.sinRecibo++
    else { e.conRecibo++; if (l.funnel >= 4) e.asignados++ }
  }
  e.tasa = e.llegaron ? pct(e.asignados, e.llegaron) : null
  return e
}

// ---------------------------------------------------------------- primer contacto
export interface PrimerContacto { mediana: number | null; n: number; sinContacto: number; en24: number }
/** Horas de la asignación a la primera llamada o tarea completada del lead. «Sin contacto» =
 *  lleva más de un día asignado y no hay nada registrado. Los eventos vienen ordenados por ts.
 *  Solo Kommo y solo leads en Ventas/Hunting: en HubSpot las tareas y llamadas no vienen ligadas
 *  al deal (validado 4-sep: 0 de 3,866 deals abiertos con evento), contarlos daría «sin contacto» a todos. */
export const conPrimerContacto = (l: Lead) => l.crm === 'kommo' && l.asesor_id != null && (l.funnel >= 4 || l.embudo === 'ventas' || l.embudo === 'hunting')
export function primerContacto(c: Corte, leads: Lead[], ahora = Date.now() / 1000): PrimerContacto {
  const primero = new Map<string, number>()
  for (const e of c.eventos) {
    if (e.tipo !== 'tarea' && e.tipo !== 'llamada_ok' && e.tipo !== 'llamada_no') continue
    if (e.ts < e.asignacion || primero.has(e.lead)) continue
    primero.set(e.lead, e.ts)
  }
  const horas: number[] = []
  let sin = 0
  for (const l of leads) {
    if (!conPrimerContacto(l)) continue
    const p = primero.get(l.id)
    if (p != null) horas.push((p - l.asignacion) / 3600)
    else if (ahora - l.asignacion > DIA) sin++
  }
  return { mediana: mediana(horas), n: horas.length, sinContacto: sin, en24: horas.filter((h) => h <= 24).length }
}

// ---------------------------------------------------------------- razones de descarte
export function razones(c: Corte, ev: Evento[]): { razon: string; n: number }[] {
  const rz = new Map<string, string>()
  for (const l of c.leads) if (l.razon) rz.set(l.id, l.razon)
  const cnt = new Map<string, number>()
  for (const e of ev) {
    if (e.tipo !== 'descarte') continue
    // HubSpot trae texto libre: «.» o una letra no es una razón.
    const t = (rz.get(e.lead) || '').trim()
    const r = t.length > 1 ? t : 'Sin razón registrada'
    cnt.set(r, (cnt.get(r) || 0) + 1)
  }
  return [...cnt].map(([razon, n]) => ({ razon, n })).sort((a, b) => b.n - a.n)
}

// ---------------------------------------------------------------- Venta
export interface Salud { ventasCon: number; ventasSin: number; huntCon: number; huntSin: number }
export function salud(leads: Lead[]): Salud {
  const s: Salud = { ventasCon: 0, ventasSin: 0, huntCon: 0, huntSin: 0 }
  for (const l of leads) {
    if (l.funnel !== 4) continue
    const con = l.presupuesto > 0
    if (l.embudo === 'ventas') con ? s.ventasCon++ : s.ventasSin++
    else if (l.embudo === 'hunting') con ? s.huntCon++ : s.huntSin++
  }
  return s
}

// ---------------------------------------------------------------- Embudo
export interface EtapaEmbudo { id: number; nombre: string; n: number; monto: number; dias: number; acumulado: number }
/** Foto por etapa del embudo Ventas: cuántos están HOY en cada etapa, cuánto
 *  suman sus presupuestos y cuántos días llevan ahí en promedio (días sin cambio). */
export function embudo(leads: Lead[], etapas: Etapa[]): EtapaEmbudo[] {
  const out: EtapaEmbudo[] = etapas.map((e) => ({ id: e.id, nombre: e.nombre, n: 0, monto: 0, dias: 0, acumulado: 0 }))
  const cierre: EtapaEmbudo = { id: -2, nombre: 'Cierre', n: 0, monto: 0, dias: 0, acumulado: 0 }
  const idx = new Map(out.map((e, i) => [e.id, i]))
  const suma = new Map<number, number>()
  for (const l of leads) {
    if (l.funnel === 5) { cierre.n++; cierre.monto += l.presupuesto; cierre.dias += Math.max(0, (l.cerrado - l.asignacion) / DIA); continue }
    if (l.embudo !== 'ventas' || l.funnel !== 4) continue
    const i = idx.get(l.etapa_id)
    if (i == null) continue
    out[i].n++; out[i].monto += l.presupuesto; suma.set(i, (suma.get(i) || 0) + l.dias_sin_cambio)
  }
  out.forEach((e, i) => { e.dias = e.n ? (suma.get(i) || 0) / e.n : 0 })
  cierre.dias = cierre.n ? cierre.dias / cierre.n : 0
  out.push(cierre)
  let acc = 0
  for (const e of out) { acc += e.dias; e.acumulado = acc }
  return out
}

// ---------------------------------------------------------------- Actividad
export interface Actividad { llamadas: number; contestadas: number; sinContestar: number; descartes: number; tareas: number; cotizaciones: number; levantamientos: number }
export function actividad(ev: Evento[]): Actividad {
  const a: Actividad = { llamadas: 0, contestadas: 0, sinContestar: 0, descartes: 0, tareas: 0, cotizaciones: 0, levantamientos: 0 }
  for (const e of ev) {
    if (e.tipo === 'llamada_ok') { a.llamadas++; a.contestadas++ }
    else if (e.tipo === 'llamada_no') { a.llamadas++; a.sinContestar++ }
    else if (e.tipo === 'descarte') a.descartes++
    else if (e.tipo === 'tarea') a.tareas++
    else if (e.tipo === 'cotizacion') a.cotizaciones++
    else if (e.tipo === 'levantamiento') a.levantamientos++
  }
  return a
}

// ---------------------------------------------------------------- Asesores
export interface FilaAsesor {
  u: Usuario; ventas: number; montoVentas: number
  metaMes: number; metaRango: number; esperado: number
  leadsActivos: Lead[]; presupuesto: number; cotizado: Cotizado; estancados: number
  llamadas: number; contestadas: number; sinContestar: number
  tareasCompletadas: number; tareasVencidas: number; sinTarea: number; pcVencidas: number
  cotizaciones: number; descartes: number; levantamientos: number
  actividad: Evento[]
}
export function porAsesor(c: Corte, f: Filtros): FilaAsesor[] {
  const leads = leadsFiltrados(c, f), ev = eventosFiltrados(c, f), ventas = ventasFiltradas(c, f)
  const filas: FilaAsesor[] = []
  for (const u of c.usuarios) {
    const mios = leads.filter((l) => l.asesor_id === u.id)
    const act = ev.filter((e) => e.asesor_id === u.id)
    const vt = ventas.filter((l) => l.asesor_id === u.id)
    if (!mios.length && !act.length && !vt.length) continue
    const a = actividad(act)
    const activos = mios.filter(vivo)
    const metaMes = metaDe(c, u), metaRango = metaEnRango(metaMes, f.rango)
    filas.push({
      u, ventas: vt.length, montoVentas: vt.reduce((s, l) => s + l.presupuesto, 0),
      metaMes, metaRango, esperado: metaEsperada(metaRango, f.rango),
      leadsActivos: activos, presupuesto: activos.reduce((s, l) => s + l.presupuesto, 0),
      cotizado: cotizado(activos, c.cotizado_dias), estancados: activos.filter((l) => l.dias_sin_cambio > 7).length,
      llamadas: a.llamadas, contestadas: a.contestadas, sinContestar: a.sinContestar,
      tareasCompletadas: a.tareas, tareasVencidas: activos.reduce((s, l) => s + l.tareas_vencidas, 0),
      sinTarea: activos.filter((l) => l.sin_tarea).length, pcVencidas: activos.filter((l) => l.pc_vencida).length,
      cotizaciones: a.cotizaciones, descartes: a.descartes, levantamientos: a.levantamientos, actividad: act,
    })
  }
  // De a lo más a lo menos (Alejandro): primero la venta, luego la carga.
  return filas.sort((a, b) => b.montoVentas - a.montoVentas || b.ventas - a.ventas || b.leadsActivos.length - a.leadsActivos.length)
}

// ---------------------------------------------------------------- perfiles actividad × venta
export type Perfil = 'mantener' | 'capacitar' | 'revisar' | 'salida'
export const PERFIL_LABEL: Record<Perfil, string> = {
  mantener: 'Buena actividad · buena venta', capacitar: 'Mucha actividad · baja venta',
  revisar: 'Buena venta · baja actividad', salida: 'Baja actividad · baja venta',
}
export interface PuntoPerfil { u: Usuario; actividad: number; vendido: number; perfil: Perfil }
export const actividadDe = (f: FilaAsesor) => f.llamadas + f.tareasCompletadas + f.cotizaciones + f.levantamientos
/** Los cuatro perfiles de Samuel (29-jun): la mediana del grupo parte cada eje. */
export function perfiles(filas: FilaAsesor[]): { pts: PuntoPerfil[]; medAct: number; medVend: number } {
  const medAct = mediana(filas.map(actividadDe)) ?? 0, medVend = mediana(filas.map((f) => f.montoVentas)) ?? 0
  const pts = filas.map((f) => {
    const a = actividadDe(f), v = f.montoVentas, altaA = a > medAct, altaV = v > medVend
    return { u: f.u, actividad: a, vendido: v, perfil: (altaA && altaV ? 'mantener' : altaA ? 'capacitar' : altaV ? 'revisar' : 'salida') as Perfil }
  })
  return { pts, medAct, medVend }
}

/** Serie diaria (para las mini gráficas): cuenta por día dentro del rango. */
export function serieDiaria(ts: number[], r: Rango, acumulada = false): number[] {
  const n = Math.max(1, Math.min(120, Math.ceil((r.fin - r.ini) / DIA)))
  const out = new Array(n).fill(0)
  for (const t of ts) { if (t >= r.ini && t < r.fin) out[Math.min(n - 1, Math.floor((t - r.ini) / DIA))]++ }
  if (acumulada) for (let i = 1; i < n; i++) out[i] += out[i - 1]
  return out
}

// ---------------------------------------------------------------- Mi día
export interface MiDia {
  /** Vencen hoy o vencieron en los últimos 14 días. El rezago más viejo solo se cuenta:
   *  en HubSpot un asesor puede cargar cientos de tareas vencidas de meses atrás. */
  tareasHoy: Tarea[]; vencidasViejas: number; hoyN: number
  tareasHechasHoy: number; ventasHoy: number
  vendidoMes: number; metaMes: number; esperadoMes: number
  llamadasHoy: number; prospectosHoy: number; eventosHoy: Evento[]; eventosSemana: Evento[]
}
export function miDia(c: Corte, uid: string): MiDia {
  const h = hoyIni()
  const sem = preset('semana'), mes = preset('mes')
  const ev = c.eventos.filter((e) => e.asesor_id === uid)
  const evHoy = ev.filter((e) => esHoy(e.ts))
  const mias = c.tareas_abiertas.filter((t) => t.asesor_id === uid)
  const metaMes = metaDeId(c, uid)
  return {
    tareasHoy: mias.filter((t) => t.vence >= h - 14 * DIA && t.vence < h + DIA).sort((a, b) => a.vence - b.vence),
    vencidasViejas: mias.filter((t) => t.vence < h - 14 * DIA).length,
    hoyN: mias.filter((t) => t.vence >= h && t.vence < h + DIA).length,
    tareasHechasHoy: evHoy.filter((e) => e.tipo === 'tarea').length,
    ventasHoy: c.leads.filter((l) => l.asesor_id === uid && l.funnel === 5 && esHoy(l.cerrado)).length,
    vendidoMes: c.leads.filter((l) => l.asesor_id === uid && l.funnel === 5 && enRango(l.cerrado, mes)).reduce((s, l) => s + l.presupuesto, 0),
    metaMes, esperadoMes: metaEsperada(metaMes, mes),
    llamadasHoy: evHoy.filter((e) => e.tipo === 'llamada_ok' || e.tipo === 'llamada_no').length,
    prospectosHoy: c.leads.filter((l) => l.asesor_id === uid && esHoy(l.asignacion)).length,
    eventosHoy: evHoy, eventosSemana: ev.filter((e) => enRango(e.ts, sem)),
  }
}

export interface Ranking { u: Usuario; ventas: number; puntos: number }
/** Leaderboard del día: ventas cerradas hoy y actividades registradas hoy. */
export function leaderboardHoy(c: Corte): Ranking[] {
  return c.usuarios.map((u) => ({
    u,
    ventas: c.leads.filter((l) => l.asesor_id === u.id && l.funnel === 5 && esHoy(l.cerrado)).length,
    puntos: c.eventos.filter((e) => e.asesor_id === u.id && esHoy(e.ts)).length,
  })).filter((r) => r.ventas || r.puntos || c.leads.some((l) => l.asesor_id === r.u.id && vivo(l)))
    .sort((a, b) => b.ventas - a.ventas || b.puntos - a.puntos)
}

export const TIPO_LABEL: Record<string, string> = {
  tarea: 'Tareas', llamada_ok: 'Llamadas contestadas', llamada_no: 'Llamadas sin contestar',
  cotizacion: 'Cotizaciones', levantamiento: 'Levantamientos', descarte: 'Descartes',
}
