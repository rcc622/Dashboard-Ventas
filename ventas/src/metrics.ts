// Todas las cifras salen de aquí. Funciones puras sobre el corte + filtros;
// la interfaz solo pinta. Espejo del DASHBOARD de Sheets (dashboard_leads_kenet.gs):
//   · rango de fecha → QUÉ LEADS (por fecha de asignación) y QUÉ ACTIVIDADES (por fecha del hecho)
//   · equipo (zona) / asesor → todo
// Reglas de Alejandro (consultor, juntas jul-ago 2026) que viven aquí: meta en pesos
// prorrateada al rango, cotizado vigente (≤ 90 d) contra 10× la meta mensual, tasa de
// asignación como KPI de entrada, primer contacto en horas y perfiles actividad × venta.
import type { Corte, Crm, Etapa, Evento, Lead, Rango, Tarea, Usuario, VentaReal, Origen } from './types'

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
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const fmtFecha = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
export const fmtCorta = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]}`
export const fmtHora = (ts: number) => { const d = fechaDe(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
export const mesNombre = (d: Date) => MESES[d.getMonth()]

export type Preset = 'hoy' | 'ayer' | 'hoy_ayer' | 'd7' | 'd14' | 'd28' | 'd30' | 'd60' | 'd90' | 'semana' | 'semana_pasada' | 'mes' | 'mes_pasado' | 'maximo' | 'trimestre'
/** Los periodos del calendario, en el orden del selector de Meta Ads (pedido de Randall 5-sep).
 *  `trimestre` sigue valiendo en ligas viejas (#r=…) pero ya no se ofrece. 60 y 90 días: pedido de Randall 6-sep. */
export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'hoy', label: 'Hoy' }, { id: 'ayer', label: 'Ayer' }, { id: 'hoy_ayer', label: 'Hoy y ayer' },
  { id: 'd7', label: 'Últimos 7 días' }, { id: 'd14', label: 'Últimos 14 días' }, { id: 'd28', label: 'Últimos 28 días' }, { id: 'd30', label: 'Últimos 30 días' }, { id: 'd60', label: 'Últimos 60 días' }, { id: 'd90', label: 'Últimos 90 días' },
  { id: 'semana', label: 'Esta semana' }, { id: 'semana_pasada', label: 'La semana pasada' }, { id: 'mes', label: 'Este mes' }, { id: 'mes_pasado', label: 'El mes pasado' },
  { id: 'maximo', label: 'Máximo' },
]
const PRESETS_VIEJOS: Record<string, string> = { trimestre: 'Este trimestre' }
export const esPreset = (x: string | undefined): x is Preset => !!x && (PRESETS.some((p) => p.id === x) || x in PRESETS_VIEJOS)
export const nombrePreset = (p: Preset) => PRESETS.find((x) => x.id === p)?.label ?? PRESETS_VIEJOS[p]
/** «Máximo» sin corte a la mano: los días de historia que trae el extractor (VENTAS_DIAS). Con corte, va de
 *  `corte.desde` (el dato más antiguo que tiene) a hoy (pedido de Randall 6-sep). */
export const MAXIMO_DIAS = 90

/** «Últimos 7 días: 29 ago 2026 – 4 sep 2026», como el botón de Meta Ads; sin nombre, solo las fechas. */
export function etiquetaRango(nombre: string | null, ini: number, fin: number): string {
  const a = fechaDe(ini), b = fechaDe(fin - 1)
  const fechas = inicioDia(a).getTime() === inicioDia(b).getTime() ? fmtFecha(a) : `${fmtFecha(a)} – ${fmtFecha(b)}`
  return nombre ? `${nombre}: ${fechas}` : fechas
}

export function preset(p: Preset, ahora = new Date(), desde?: number): Rango {
  const h = inicioDia(ahora), man = ep(h) + DIA
  const ult = (n: number) => ({ ini: ep(sumar(h, -(n - 1))), fin: man })   // n días contando hoy
  const lun = sumar(h, -((h.getDay() + 6) % 7))
  const r = (() => {
    switch (p) {
      case 'hoy': return { ini: ep(h), fin: man }
      case 'ayer': return { ini: ep(sumar(h, -1)), fin: ep(h) }
      case 'hoy_ayer': return { ini: ep(sumar(h, -1)), fin: man }
      case 'd7': return ult(7)
      case 'd14': return ult(14)
      case 'd28': return ult(28)
      case 'd30': return ult(30)
      case 'd60': return ult(60)
      case 'd90': return ult(90)
      case 'semana': return { ini: ep(lun), fin: ep(sumar(lun, 7)) }
      case 'semana_pasada': return { ini: ep(sumar(lun, -7)), fin: ep(lun) }
      case 'mes': return { ini: ep(new Date(h.getFullYear(), h.getMonth(), 1)), fin: ep(new Date(h.getFullYear(), h.getMonth() + 1, 1)) }
      case 'mes_pasado': return { ini: ep(new Date(h.getFullYear(), h.getMonth() - 1, 1)), fin: ep(new Date(h.getFullYear(), h.getMonth(), 1)) }
      case 'trimestre': { const q = Math.floor(h.getMonth() / 3) * 3; return { ini: ep(new Date(h.getFullYear(), q, 1)), fin: ep(new Date(h.getFullYear(), q + 3, 1)) } }
      case 'maximo': return desde ? { ini: ep(inicioDia(fechaDe(desde))), fin: man } : ult(MAXIMO_DIAS)
    }
  })()
  return { ...r, label: etiquetaRango(nombrePreset(p), r.ini, r.fin) }
}

export function rangoManual(a: Date, b: Date): Rango {
  const [x, y] = a <= b ? [a, b] : [b, a]
  const ini = ep(inicioDia(x)), fin = ep(sumar(inicioDia(y), 1))
  return { ini, fin, label: etiquetaRango(null, ini, fin) }
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

/** Asesores desactivados en Configuración (ojo cerrado): fuera del menú, de la tabla y de
 *  toda cifra atribuida a persona. Un filtro explícito de asesor (por URL) sí los deja ver. */
export const ocultosDe = (c: Corte) => new Set(c.ocultos || [])
export const usuariosVisibles = (c: Corte) => { const o = ocultosDe(c); return c.usuarios.filter((u) => !o.has(u.id)) }
function pasaPersona(asesorId: string | null, f: Filtros, users: Map<string, Usuario>, ocultos: Set<string>): boolean {
  if (f.asesor != null) return asesorId === f.asesor
  if (asesorId != null && ocultos.has(asesorId)) return false
  if (f.equipo != null) return asesorId != null && users.get(asesorId)?.zona === f.equipo
  return true
}

/** Leads del corte cuya ÚLTIMA ASIGNACIÓN cae en el rango (col V de Leads_Data). */
export function leadsFiltrados(c: Corte, f: Filtros): Lead[] {
  const users = mapaUsuarios(c), oc = ocultosDe(c)
  return c.leads.filter((l) => pasaCrm(l.crm, f) && enRango(l.asignacion, f.rango) && pasaPersona(l.asesor_id, f, users, oc))
}
/** Actividades cuya fecha cae en el rango. */
export function eventosFiltrados(c: Corte, f: Filtros): Evento[] {
  const users = mapaUsuarios(c), oc = ocultosDe(c)
  return c.eventos.filter((e) => pasaCrm(e.crm, f) && enRango(e.ts, f.rango) && pasaPersona(e.asesor_id, f, users, oc))
}
export const vivo = (l: Lead) => l.funnel !== 0 && l.funnel !== 5
/** Ventas = leads ganados cuyo cierre cae en el rango (el cierre manda, no la asignación). */
export function ventasFiltradas(c: Corte, f: Filtros): Lead[] {
  const users = mapaUsuarios(c), oc = ocultosDe(c)
  return c.leads.filter((l) => pasaCrm(l.crm, f) && l.funnel === 5 && enRango(l.cerrado, f.rango) && pasaPersona(l.asesor_id, f, users, oc))
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
/** Día N de M del rango, en días NATURALES y con hoy contado completo (regla de Alejandro 4-sep:
 *  meta × días transcurridos / días del mes). Un rango ya cerrado da M de M; uno futuro, 0 de M. */
export function diasRango(r: Rango, ahora = Date.now() / 1000): { dia: number; dias: number } {
  const dias = Math.max(1, Math.round((r.fin - r.ini) / DIA))
  const dia = Math.max(0, Math.min(dias, Math.ceil((ahora - r.ini) / DIA)))
  return { dia, dias }
}
/** Lo que ya debería estar vendido a día N de M del rango. */
export function metaEsperada(metaRango: number, r: Rango, ahora = Date.now() / 1000): number {
  const { dia, dias } = diasRango(r, ahora)
  return (metaRango * dia) / dias
}
/** Vendido contra el ritmo del rango: arriba o abajo de lo esperado a día N de M, en palabras y con estado para el color. */
export interface Ritmo { esperado: number; dif: number; estado: 'cumplida' | 'adelante' | 'atras' | 'sin_meta'; dia: number; dias: number; corto: string; texto: string }
export function ritmo(monto: number, metaRango: number, r: Rango, ahora = Date.now() / 1000): Ritmo {
  const { dia, dias } = diasRango(r, ahora)
  const esperado = metaEsperada(metaRango, r, ahora), dif = monto - esperado
  const estado: Ritmo['estado'] = metaRango <= 0 ? 'sin_meta' : monto >= metaRango ? 'cumplida' : dif >= 0 ? 'adelante' : 'atras'
  const cuando = dia >= dias ? 'al cierre del periodo' : `a día ${dia} de ${dias}`
  const corto = estado === 'sin_meta' ? 'Sin meta' : estado === 'cumplida' ? 'Meta cumplida'
    : estado === 'adelante' ? `▲ ${fmtMoney0(dif)} arriba del ritmo` : `▼ ${fmtMoney0(-dif)} abajo del ritmo`
  const texto = estado === 'sin_meta' ? 'Sin meta configurada' : estado === 'cumplida' ? `Meta cumplida ${cuando}`
    : `${corto} · ${cuando} el ritmo pide ${fmtMoney0(esperado)}`
  return { esperado, dif, estado, dia, dias, corto, texto }
}
/** El rango en palabras para las etiquetas grandes (Alejandro no entendió «en el rango»):
 *  «del 1 al 5 de septiembre», «del 28 de agosto al 5 de septiembre», «el 5 de septiembre». Año solo si no es el actual. */
export function periodoTexto(r: Rango): string {
  const a = fechaDe(r.ini), b = fechaDe(r.fin - 1), hoy = new Date().getFullYear()
  const distintoAnio = a.getFullYear() !== b.getFullYear(), conAnio = distintoAnio || b.getFullYear() !== hoy
  const f = (d: Date, mes: boolean, anio: boolean) => `${d.getDate()}${mes ? ' de ' + MESES_LARGO[d.getMonth()] : ''}${anio ? ' de ' + d.getFullYear() : ''}`
  if (inicioDia(a).getTime() === inicioDia(b).getTime()) return `el ${f(a, true, conAnio)}`
  const mismoMes = !distintoAnio && a.getMonth() === b.getMonth()
  return `del ${f(a, !mismoMes, distintoAnio)} al ${f(b, true, conAnio)}`
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
export type CatEntrada = 'llegaron' | 'sinRespuesta' | 'sinRecibo' | 'conRecibo' | 'asignados' | 'perdidos'
export interface Entrada { llegaron: number; sinRespuesta: number; sinRecibo: number; conRecibo: number; asignados: number; perdidos: number; tasa: number | null; listas: Record<CatEntrada, Lead[]> }
/** Marcador de entrada: leads de Kommo creados en el rango. Con filtro de asesor o equipo se
 *  cuentan por el RESPONSABLE ACTUAL del lead (Randall, 4-sep: «el dato solo del asesor»);
 *  los que aún no se asignan cuelgan de la cuenta admin y quedan fuera de ese recorte.
 *  conRecibo incluye a los ya asignados. null sin fuente Kommo o con Kommo apagado. */
export function entrada(c: Corte, r: Rango, f?: Filtros): Entrada | null {
  if (!(c.fuentes || []).some((x) => x.crm === 'kommo') || (f && !pasaCrm('kommo', f))) return null
  const users = mapaUsuarios(c), oc = ocultosDe(c)
  // La entrada es de la empresa: sin filtro de persona cuentan todos los leads, aunque su
  // responsable sea un asesor desactivado (la cuenta admin carga los no asignados).
  const porPersona = !!f && (f.asesor != null || f.equipo != null)
  const L: Record<CatEntrada, Lead[]> = { llegaron: [], sinRespuesta: [], sinRecibo: [], conRecibo: [], asignados: [], perdidos: [] }
  for (const l of c.leads) {
    if (l.crm !== 'kommo' || !enRango(l.creado, r) || (porPersona && !pasaPersona(l.asesor_id, f, users, oc))) continue
    L.llegaron.push(l)
    if (l.funnel === 0) L.perdidos.push(l)
    else if (l.funnel === 1) L.sinRespuesta.push(l)
    else if (l.funnel === 2) L.sinRecibo.push(l)
    else { L.conRecibo.push(l); if (l.funnel >= 4) L.asignados.push(l) }
  }
  return { llegaron: L.llegaron.length, sinRespuesta: L.sinRespuesta.length, sinRecibo: L.sinRecibo.length, conRecibo: L.conRecibo.length,
    asignados: L.asignados.length, perdidos: L.perdidos.length, tasa: L.llegaron.length ? pct(L.asignados.length, L.llegaron.length) : null, listas: L }
}

// ---------------------------------------------------------------- primer contacto
export interface PrimerContacto { mediana: number | null; n: number; sinContacto: number; en24: number; con: { lead: Lead; horas: number }[]; sin: Lead[] }
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
  const con: { lead: Lead; horas: number }[] = []
  const sin: Lead[] = []
  for (const l of leads) {
    if (!conPrimerContacto(l)) continue
    const p = primero.get(l.id)
    if (p != null) con.push({ lead: l, horas: (p - l.asignacion) / 3600 })
    else if (vivo(l) && ahora - l.asignacion > DIA) sin.push(l)   // regla Randall 4-sep: a ganados y perdidos no se les revisa actividad
  }
  const horas = con.map((x) => x.horas)
  return { mediana: mediana(horas), n: con.length, sinContacto: sin.length, en24: horas.filter((h) => h <= 24).length, con, sin }
}

// ---------------------------------------------------------------- razones de descarte
/** Las razones son texto libre: «no contesta», «NO CONTESTA» y «No contestá» son la misma. Se juntan por
 *  su forma sin acentos ni mayúsculas y se muestra la grafía más usada (Randall 5-sep). */
const claveRazon = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim()
export function razones(c: Corte, ev: Evento[]): { razon: string; n: number; leads: Lead[] }[] {
  const porId = mapaLeads(c)
  const grupos = new Map<string, { textos: Map<string, number>; leads: Lead[] }>()
  for (const e of ev) {
    if (e.tipo !== 'descarte') continue
    const l = porId.get(e.lead)
    if (!l) continue
    // HubSpot trae texto libre: «.» o una letra no es una razón.
    const t = (l.razon || '').trim()
    const r = t.length > 1 ? t : 'Sin razón registrada'
    const g = grupos.get(claveRazon(r)) || { textos: new Map<string, number>(), leads: [] as Lead[] }
    g.textos.set(r, (g.textos.get(r) || 0) + 1); g.leads.push(l); grupos.set(claveRazon(r), g)
  }
  return [...grupos.values()].map((g) => ({ razon: [...g.textos].sort((a, b) => b[1] - a[1])[0][0], n: g.leads.length, leads: g.leads })).sort((a, b) => b.n - a.n)
}

// ---------------------------------------------------------------- detalle (drill-down)
// Cada cifra del tablero abre una ventana con los registros que la componen (Randall, 4-sep,
// como el drill-down de los reportes de HubSpot). Una Fila = un renglón de esa ventana.
/** `estado`/`alerta`: columna extra del detalle para las comparativas (p. ej. «Falta en el CRM»). */
export interface Fila { id: string; nombre: string; link?: string; crm: Origen; asesor: string; detalle: string; monto?: number; cuando?: number; estado?: string; alerta?: boolean }
export function mapaLeads(c: Corte): Map<string, Lead> { return new Map(c.leads.map((l) => [l.id, l])) }
/** «KS-TRAINING» → «Training». Ventas es el rol normal y no se etiqueta; Training y Seguimiento sí (Randall 6-sep). */
export const rolNombre = (r?: string) => (!r ? '' : /^admin/i.test(r) ? 'Administrador' : r.replace(/^KS-/i, '').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()))
export const rolDestacado = (r?: string) => !!r && /^KS-/i.test(r) && !/^KS-VENTAS$/i.test(r)
export const nombreAsesor = (c: Corte, id: string | null) => (id == null ? 'Sin asesor' : c.usuarios.find((u) => u.id === id)?.nombre || id)
export function filasDeLeads(leads: Lead[], detalle: (l: Lead) => string, cuando: (l: Lead) => number = (l) => l.asignacion): Fila[] {
  return leads.map((l) => ({ id: l.id, nombre: l.nombre || l.id, link: l.link || undefined, crm: l.crm, asesor: l.asesor || 'Sin asesor', detalle: detalle(l), monto: l.presupuesto || undefined, cuando: cuando(l) || undefined }))
}
/** Una fila por actividad. En HubSpot las tareas y llamadas no vienen ligadas al deal: se listan
 *  igual (asesor, tipo y fecha) pero sin liga, y la ventana lo dice. */
export function filasDeEventos(c: Corte, ev: Evento[]): Fila[] {
  const porId = mapaLeads(c)
  return ev.map((e, i) => {
    const l = porId.get(e.lead)
    return { id: e.lead + ':' + e.ts + ':' + i, nombre: l ? (l.nombre || l.id) : `${TIPO_LABEL[e.tipo] || e.tipo} · sin deal ligado`, link: l?.link || undefined, crm: e.crm,
      asesor: nombreAsesor(c, e.asesor_id), detalle: (TIPO_LABEL[e.tipo] || e.tipo) + (l ? ' · ' + tipoLead(l) + ' · ' + l.etapa : ''), monto: l?.presupuesto || undefined, cuando: e.ts }
  }).sort((a, b) => (b.cuando || 0) - (a.cuando || 0))
}
export const etapaDe = (l: Lead) => `${tipoLead(l)} · ${l.etapa}`
/** «1 día», «2 días»: sin abreviar (Randall) y sin plural falso. */
export const dias = (n: number) => `${fmtN(n)} día${n === 1 ? '' : 's'}`

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
export interface EtapaEmbudo { id: number; nombre: string; n: number; monto: number; dias: number; acumulado: number; leads: Lead[] }
/** Foto por etapa del embudo Ventas: cuántos están HOY en cada etapa, cuánto
 *  suman sus presupuestos y cuántos días llevan ahí en promedio (días sin cambio). */
export function embudo(leads: Lead[], etapas: Etapa[]): EtapaEmbudo[] {
  const out: EtapaEmbudo[] = etapas.map((e) => ({ id: e.id, nombre: e.nombre, n: 0, monto: 0, dias: 0, acumulado: 0, leads: [] }))
  const cierre: EtapaEmbudo = { id: -2, nombre: 'Cierre', n: 0, monto: 0, dias: 0, acumulado: 0, leads: [] }
  const idx = new Map(out.map((e, i) => [e.id, i]))
  const suma = new Map<number, number>()
  for (const l of leads) {
    if (l.funnel === 5) { cierre.n++; cierre.monto += l.presupuesto; cierre.dias += Math.max(0, (l.cerrado - l.asignacion) / DIA); cierre.leads.push(l); continue }
    if (l.embudo !== 'ventas' || l.funnel !== 4) continue
    const i = idx.get(l.etapa_id)
    if (i == null) continue
    out[i].n++; out[i].monto += l.presupuesto; out[i].leads.push(l); suma.set(i, (suma.get(i) || 0) + l.dias_sin_cambio)
  }
  out.forEach((e, i) => { e.dias = e.n ? (suma.get(i) || 0) / e.n : 0 })
  cierre.dias = cierre.n ? cierre.dias / cierre.n : 0
  out.push(cierre)
  let acc = 0
  for (const e of out) { acc += e.dias; e.acumulado = acc }
  return out
}

// ---------------------------------------------------------------- Actividad
export interface Actividad { llamadas: number; contestadas: number; sinContestar: number; descartes: number; tareas: number; cotizaciones: number; recotizaciones: number; levantamientos: number }
export function actividad(ev: Evento[]): Actividad {
  const a: Actividad = { llamadas: 0, contestadas: 0, sinContestar: 0, descartes: 0, tareas: 0, cotizaciones: 0, recotizaciones: 0, levantamientos: 0 }
  for (const e of ev) {
    if (e.tipo === 'llamada_ok') { a.llamadas++; a.contestadas++ }
    else if (e.tipo === 'llamada_no') { a.llamadas++; a.sinContestar++ }
    else if (e.tipo === 'descarte') a.descartes++
    else if (e.tipo === 'tarea') a.tareas++
    else if (e.tipo === 'cotizacion') a.cotizaciones++
    else if (e.tipo === 'recotizacion') a.recotizaciones++
    else if (e.tipo === 'levantamiento') a.levantamientos++
  }
  return a
}

// ---------------------------------------------------------------- Asesores
export interface FilaAsesor {
  u: Usuario; ventas: number; montoVentas: number
  metaMes: number; metaRango: number; esperado: number; ritmo: Ritmo
  leadsActivos: Lead[]; presupuesto: number; cotizado: Cotizado; estancados: number
  llamadas: number; contestadas: number; sinContestar: number
  tareasCompletadas: number; tareasVencidas: number; sinTarea: number; pcVencidas: number
  cotizaciones: number; descartes: number; levantamientos: number
  actividad: Evento[]
}
export function porAsesor(c: Corte, f: Filtros): FilaAsesor[] {
  const leads = leadsFiltrados(c, f), ev = eventosFiltrados(c, f), ventas = ventasFiltradas(c, f)
  const filas: FilaAsesor[] = []
  for (const u of (f.asesor != null ? c.usuarios : usuariosVisibles(c))) {
    const mios = leads.filter((l) => l.asesor_id === u.id)
    const act = ev.filter((e) => e.asesor_id === u.id)
    const vt = ventas.filter((l) => l.asesor_id === u.id)
    if (!mios.length && !act.length && !vt.length) continue
    const a = actividad(act)
    const activos = mios.filter(vivo)
    const metaMes = metaDe(c, u), metaRango = metaEnRango(metaMes, f.rango), montoVentas = vt.reduce((s, l) => s + l.presupuesto, 0)
    filas.push({
      u, ventas: vt.length, montoVentas,
      metaMes, metaRango, esperado: metaEsperada(metaRango, f.rango), ritmo: ritmo(montoVentas, metaRango, f.rango),
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
  vendidoMes: number; metaMes: number; esperadoMes: number; ritmoMes: Ritmo
  llamadasHoy: number; prospectosHoy: number; eventosHoy: Evento[]; eventosSemana: Evento[]
}
export function miDia(c: Corte, uid: string): MiDia {
  const h = hoyIni()
  const sem = preset('semana'), mes = preset('mes')
  const ev = c.eventos.filter((e) => e.asesor_id === uid)
  const evHoy = ev.filter((e) => esHoy(e.ts))
  // Tareas de leads ya ganados o perdidos no son pendientes de seguimiento (regla Randall 4-sep);
  // en HubSpot la tarea no viene ligada al deal, así que ahí no se puede saber y se dejan.
  const cerrados = new Set(c.leads.filter((l) => !vivo(l)).map((l) => l.id))
  const mias = c.tareas_abiertas.filter((t) => t.asesor_id === uid && !cerrados.has(t.lead))
  const metaMes = metaDeId(c, uid)
  const vendidoMes = c.leads.filter((l) => l.asesor_id === uid && l.funnel === 5 && enRango(l.cerrado, mes)).reduce((s, l) => s + l.presupuesto, 0)
  return {
    tareasHoy: mias.filter((t) => t.vence >= h - 14 * DIA && t.vence < h + DIA).sort((a, b) => a.vence - b.vence),
    vencidasViejas: mias.filter((t) => t.vence < h - 14 * DIA).length,
    hoyN: mias.filter((t) => t.vence >= h && t.vence < h + DIA).length,
    tareasHechasHoy: evHoy.filter((e) => e.tipo === 'tarea').length,
    ventasHoy: c.leads.filter((l) => l.asesor_id === uid && l.funnel === 5 && esHoy(l.cerrado)).length,
    vendidoMes, metaMes, esperadoMes: metaEsperada(metaMes, mes), ritmoMes: ritmo(vendidoMes, metaMes, mes),
    llamadasHoy: evHoy.filter((e) => e.tipo === 'llamada_ok' || e.tipo === 'llamada_no').length,
    prospectosHoy: c.leads.filter((l) => l.asesor_id === uid && esHoy(l.asignacion)).length,
    eventosHoy: evHoy, eventosSemana: ev.filter((e) => enRango(e.ts, sem)),
  }
}

export interface Ranking { u: Usuario; ventas: number; puntos: number }
/** Leaderboard del día: ventas cerradas hoy y actividades registradas hoy. */
export function leaderboardHoy(c: Corte): Ranking[] {
  return usuariosVisibles(c).map((u) => ({
    u,
    ventas: c.leads.filter((l) => l.asesor_id === u.id && l.funnel === 5 && esHoy(l.cerrado)).length,
    puntos: c.eventos.filter((e) => e.asesor_id === u.id && esHoy(e.ts)).length,
  })).filter((r) => r.ventas || r.puntos || c.leads.some((l) => l.asesor_id === r.u.id && vivo(l)))
    .sort((a, b) => b.ventas - a.ventas || b.puntos - a.puntos)
}

export const TIPO_LABEL: Record<string, string> = {
  tarea: 'Tareas', llamada_ok: 'Llamadas contestadas', llamada_no: 'Llamadas sin contestar',
  cotizacion: 'Cotizaciones', recotizacion: 'Recotizaciones', levantamiento: 'Levantamientos', descarte: 'Descartes',
}

// ---------------------------------------------------------------- Ventas reales (app de comisiones)
export interface VentaRealFila { u: Usuario | null; nombre: string; n: number; monto: number; ventas: VentaReal[] }
export interface VentasReales { filas: VentaRealFila[]; ventas: VentaReal[]; sinAsesor: string[]; total: number; n: number }
const finMes = (t: number) => { const d = new Date(t * 1000); return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() / 1000 }
/** Ventas de la app de comisiones cuyo MES de venta toca el rango (la app no guarda el día), sin
 *  canceladas. Con filtro de asesor o equipo entran solo las cruzadas con ese asesor; sin filtro
 *  también las de vendedores que no se pudieron casar con el CRM (fila «sin asesor»). */
export function ventasReales(c: Corte, f: Filtros): VentasReales {
  const com = c.comisiones
  if (!com) return { filas: [], ventas: [], sinAsesor: [], total: 0, n: 0 }
  const users = mapaUsuarios(c), oc = ocultosDe(c)
  const sel = com.ventas.filter((v) => !v.cancelada && v.fecha != null && v.fecha < f.rango.fin && finMes(v.fecha) > f.rango.ini
    && (v.asesor_id ? pasaPersona(v.asesor_id, f, users, oc) : f.asesor == null && f.equipo == null))
  const grupos = new Map<string, VentaRealFila>()
  for (const v of sel) {
    const k = v.asesor_id || 'v:' + v.vendedor
    const u = v.asesor_id ? users.get(v.asesor_id) || null : null
    const g = grupos.get(k) || { u, nombre: u ? u.nombre : v.vendedor, n: 0, monto: 0, ventas: [] }
    g.n++; g.monto += v.monto; g.ventas.push(v); grupos.set(k, g)
  }
  const filas = [...grupos.values()].sort((a, b) => b.monto - a.monto)
  const sinAsesor = [...new Set(com.vendedores.filter((v) => v.rol === 'vendor' && !v.asesor_id).map((v) => v.nombre))].sort()
  return { filas, ventas: sel, sinAsesor, total: sel.reduce((s, v) => s + v.monto, 0), n: sel.length }
}
export const filasDeVentasReales = (vs: VentaReal[]): Fila[] => vs.map((v) => ({
  id: 'c:' + v.id, nombre: v.cliente || 'Sin nombre', link: v.liga || undefined, crm: 'comisiones', asesor: v.vendedor,
  detalle: [v.mes_texto, v.origen, v.compartida_con ? 'compartida con ' + v.compartida_con : ''].filter(Boolean).join(' · '),
  monto: v.monto, cuando: v.fecha ?? undefined,
}))

// ---------------------------------------------------------------- comparativa: app de comisiones contra el CRM
// Palabras que no identifican al cliente: artículos, títulos y los sufijos de origen que HubSpot pega al nombre del deal («Hugo Vega - Referido»).
const STOP = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'sr', 'sra', 'srta', 'ing', 'lic', 'dr', 'dra', 'don', 'dona', 'san', 'sta', 'arq', 'referido', 'directo', 'form', 'lead', 'fb', 'mejoravit', 'wapp', 'whatsapp', 'web', 'google', 'meta', 'facebook', 'ctwa'])
const palabras = (s: string) => new Set(s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t)))
/** Venta por venta: lo que registró la app de comisiones contra los ganados del CRM del mismo asesor
 *  (pedido de Randall 5-sep: «ver cuáles faltan»). Pareja = mismo cliente (dos palabras del nombre en
 *  común, o una si el nombre es de una sola) con cierre a menos de 62 días del mes de la venta; cada
 *  ganado se empareja una sola vez. Lo que queda sin pareja sale marcado en rojo: «Falta en el CRM»
 *  (la app la tiene, el CRM no) o «Falta en la app» (ganado en el CRM que nadie registró). */
export function comparativaVentas(crm: Lead[], app: VentaReal[]): Fila[] {
  const libres = new Map(crm.map((l) => [l, palabras(l.nombre || '')]))
  const out: Fila[] = []
  for (const v of [...app].sort((a, b) => (a.fecha ?? 0) - (b.fecha ?? 0))) {
    const A = palabras(v.cliente || '')
    let mejor: Lead | null = null, mejorP = 0
    for (const [l, B] of libres) {
      // Igual o prefijo («vic» ~ «victor», «michelle» ~ «michel»): los nombres del CRM suelen venir recortados.
      const comunes = [...A].filter((t) => B.has(t) || [...B].some((b) => b.length >= 3 && t.length >= 3 && (t.startsWith(b) || b.startsWith(t)))).length
      if (!comunes || comunes < Math.min(2, A.size, B.size)) continue
      if (v.fecha != null && l.cerrado && Math.abs(l.cerrado - v.fecha) > 62 * DIA) continue
      const p = comunes / Math.min(A.size, B.size)
      if (p > mejorP) { mejor = l; mejorP = p }
    }
    // Sin `cuando`: la app solo guarda el mes y una hora inventada («1 ago 00:00») confunde; el mes va en el detalle.
    const base = { id: 'c:' + v.id, nombre: v.cliente || 'Sin nombre', link: v.liga || undefined, crm: 'comisiones' as Origen, asesor: v.vendedor, monto: v.monto }
    if (mejor) {
      libres.delete(mejor)
      out.push({ ...base, detalle: `${v.mes_texto} · en el CRM: ${mejor.nombre} (${fmtCorta(fechaDe(mejor.cerrado))}, ${fmtMoney0(mejor.presupuesto)})`, estado: 'En ambos' })
    } else {
      out.push({ ...base, detalle: `${v.mes_texto} · sin venta ganada que coincida en el CRM`, estado: 'Falta en el CRM', alerta: true })
    }
  }
  for (const l of libres.keys()) {
    out.push({ id: l.id, nombre: l.nombre || l.id, link: l.link || undefined, crm: l.crm, asesor: l.asesor || 'Sin asesor', detalle: `Ganado en el CRM el ${fmtCorta(fechaDe(l.cerrado))} · sin venta que coincida en la app`, monto: l.presupuesto || undefined, cuando: l.cerrado || undefined, estado: 'Falta en la app', alerta: true })
  }
  return out.sort((a, b) => Number(!!b.alerta) - Number(!!a.alerta) || (a.estado || '').localeCompare(b.estado || '') || a.nombre.localeCompare(b.nombre))
}
