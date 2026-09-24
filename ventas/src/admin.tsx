import { Fragment, useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent, useEffect } from 'react'
import type { Corte, Crm, Embudo, Evento, Lead, LevFila, Sanciones, Usuario } from './types'
import { CRM_LABEL } from './types'
import { BUCKETS, PERFIL_LABEL, actividad, actividadDe, cotizado, dias, entrada, ep, eventosFiltrados, fechaCotizado, diasSinActividad, estancado, estadoActivo, ESTADO_ACTIVO, ESTANCADO_DIAS, type EstadoActivo, leadsActivosHoy, rangoVentas, metaYRitmo, metaDe, filasDeEventos, filasDeLeads, fmtCorta, fmtMoney, fmtMoney0, fmtN, iniciales, inicioDia, leadsFiltrados, mesNombre, pasaCrm, etiquetaRango, periodoTexto, preset, ritmo, pct, perfiles, porAsesor, primerContacto, razones, salud, serieDiaria, sumar, tipoLead, ventasFiltradas, vivo, zonaNombre, type CatEntrada, type Cotizado, embudoPipeline, type Fila, type FilaAsesor, type Filtros, type Perfil , type PuntoPerfil, ventasReales, ventasCrm, tipoDe, crmTexto, activo, VENDEDOR_LABEL, filasDeVentasReales, comparativaVentas, rolDestacado, rolNombre, cotizacionesGeneradas, filasDeCotizaciones, visitas, levantados, filasDeLevantamientos, fmtEstrellas, llamadasFiltradas, resumenLlamadas, conversion, filasConversion, filasConversionLeads, fmtTasa, fechaDe, llamadasPorLead, actividadPorLead, baseCierre, type PorConversion, type FilaConv, type ClaseOrigen, CLASE_LABEL } from './metrics'
import { LlamadaModal, drillLlamadas } from './llamadas'
import type { Llamada } from './types'
import { BarDetailPopup, BubbleChart, Bullet, DonutChart, FunnelChart, Gauge, Info, LlamadasBar, MiniAreaChart, Scatter, SortTh, StackedBar, activar, useEscape, useOutside, type DetRow, type Sort, type BubbleCol, useFocoDialogo } from './components'
import { DrillModal, type Drill } from './drill'
import { BASE_FECHA, EditarColumnas, anchos, anchoTotal, useColumnas, type ColDef } from './columnas'
import type { Termino } from './glosario'
import { aplicarSancion, cargarSanciones } from './data'
import { WidgetGrid, type Widget } from './widgets'
import { Galeria, GraficaLibre, Editor, type Grafica } from './constructor'
import { useRangos, type RangoWidget } from './rangos'
import { fechasPermitidas } from './catalogo'

const mixto = (c: Corte) => (c.fuentes || []).length > 1
const crmCorto = (l: { crm: Lead['crm'] }) => CRM_LABEL[l.crm]
const subAsesor = (c: Corte, u: Usuario) => zonaNombre(c, u.zona) + ' · ' + crmTexto(c, u) + ' · ' + VENDEDOR_LABEL[tipoDe(c, u)] + (u.rol && u.rol !== 'cambaceo' ? ' · ' + rolNombre(u.rol) : '')
/** Etiqueta junto al nombre cuando el vendedor no es puro leads (grupo cambaceo dentro de su zona, Randall 11-sep). */
const TagTipo = ({ c, u }: { c: Corte; u: Usuario }) => { const t = tipoDe(c, u); return t === 'leads' ? null : <span className={'tag tipo ' + t} title={t === 'cambaceo' ? 'Vendedor de cambaceo: vende sin CRM, sus ventas vienen de la app de comisiones' : t === 'mixto' ? 'Vende con leads del CRM y también por cambaceo' : 'Otro tipo de vendedor (fijado en Configuración)'}>{VENDEDOR_LABEL[t]}</span> }
const avatarCls = (u: Usuario) => 'avatar' + (u.zona ? ' z-' + u.zona : '')
const RAMPA = ['var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)', 'var(--f5)', 'var(--f6)', 'var(--f6)']
const RAMPA_HS = ['var(--h1)', 'var(--h2)', 'var(--h3)', 'var(--h4)', 'var(--h5)', 'var(--h6)', 'var(--h6)']
// HubSpot no trae llamadas ni mensajes por deal: mejor decirlo que pintar «0 llam».
const intentos = (l: Lead) => (l.crm === 'hubspot' ? 'sin dato en HubSpot' : `${fmtN(l.llamadas_cf)} llamadas · ${fmtN(l.msjs)} mensajes`)
const hace = (ts: number, hoy: number) => { if (!ts) return '—'; const d = Math.floor((hoy - ts) / 86400); return d <= 0 ? 'hoy' : `hace ${dias(d)}` }
const PERFIL_CLS: Record<Perfil, string> = { mantener: 'p-mantener', capacitar: 'p-capacitar', revisar: 'p-revisar', salida: 'p-salida' }
// En la tabla de Perfiles cabe el nombre del cuadrante (el mismo que dice la dispersión); la descripción larga va en el title.
const PERFIL_CORTO: Record<Perfil, string> = { mantener: 'Mantener', capacitar: 'Capacitar', revisar: 'Revisar', salida: 'Salida' }
const PERFILES: Perfil[] = ['mantener', 'capacitar', 'revisar', 'salida']
const AHORA = () => Date.now() / 1000
const diasDesde = (ts: number) => Math.max(0, Math.floor((AHORA() - ts) / 86400))
// Filas para la ventana de detalle según de qué cifra vienen.
/** Tramos del primer contacto (Primer contacto, auditoría 6-sep): qué tan rápido se atiende, no solo la mediana. */
/** Una décima basta para las horas del primer contacto: la columna se ordena por número, no por texto. */
const redondear = (h: number) => Math.round(h * 10) / 10
/** Tramos del primer contacto: */
const PC_TRAMOS = [
  { l: 'en menos de 1 hora', ok: (h: number) => h <= 1 }, { l: 'de 1 a 4 horas', ok: (h: number) => h > 1 && h <= 4 },
  { l: 'de 4 a 24 horas', ok: (h: number) => h > 4 && h <= 24 }, { l: 'más de un día', ok: (h: number) => h > 24 },
]
/** Orden de colocación por defecto del Dashboard: pares de igual alto (bandas) para que la rejilla libre no deje huecos. */
/** Fechas con las que abre cada widget del Dashboard si la cuenta no ha elegido otras: el embudo y el monto por
 *  etapa son la foto del pipeline de TODOS los leads activos (Randall 16-sep: «estos deben ser por default lo
 *  máximo»); cada quien puede acotarlos con su calendario. */
const RANGOS_ADMIN: Record<string, RangoWidget> = { embudo: 'maximo', etapas: 'maximo' }
/** Los periodos por defecto: los de fábrica y encima lo que el administrador fijó en Configuración («abre en»), con la fecha
 *  en que los fijó (`desde`): lo que una cuenta eligió antes de esa fecha ya no cuenta; lo de fábrica nunca pisa a la cuenta. */
const defaultsDe = (c: Corte, fabrica: Record<string, RangoWidget>): { por: Record<string, RangoWidget>; desde: Record<string, number> } => {
  const cfg = (c.fechas_default || {}) as Record<string, RangoWidget>
  return { por: { ...fabrica, ...cfg }, desde: Object.fromEntries(Object.keys(cfg).map((id) => [id, c.fechas_default_ts || 0])) }
}
const ORDEN_ADMIN = ['t-leads', 't-ventas', 't-vendido', 't-conversion', 't-conv-dig', 't-conv-nodig', 't-perdida', 't-tareas', 't-cotizaciones', 't-descartes', 't-levantamientos', 'llamadas', 'calidad-llamadas', 'salud', 'pipeline', 'ranking', 'reales', 'cotiz-metodos', 'lev-operaciones', 'visitas', 'entrada', 'embudo', 'etapas', 'contacto', 'razones', 'perfiles', 'perfiles-tabla']
const fLeads = (ls: Lead[]) => filasDeLeads(ls, () => '', undefined, { label: 'Días sin actividad', de: (l) => diasSinActividad(l) })
const HOY = 'foto de hoy, sin importar las fechas del tablero'
/** La tarea de seguimiento del lead (Randall 23-sep, detalle de cada etapa del embudo): sin tarea, vigente o vencida, y
 *  cuándo vence la más próxima. En HubSpot la «tarea» es la próxima actividad del deal: no liga tareas sueltas. */
const tareaDe = (l: Lead) => (l.tareas_abiertas === 0 ? 'Sin tarea' : l.tareas_vencidas > 0 ? 'Vencida' : 'Vigente')
const TONO_TAREA = { 'Sin tarea': 'nada', Vencida: 'mal', Vigente: 'bien' } as const
const fLeadsTarea = (ls: Lead[], llam?: Map<string, number>) => fLeads(ls).map((f, i) => ({ ...f, extras: [
  // Llamadas del CRM a ese lead, pegada a Etapa (junta 23-sep).
  ...(llam ? [{ label: 'Llamadas', valor: fmtN(llam.get(ls[i].id) || 0), n: llam.get(ls[i].id) || 0, tras: 'etapa' as const }] : []),
  { label: 'Tarea de seguimiento', valor: tareaDe(ls[i]) + (ls[i].tareas_vencidas > 1 ? ` (${ls[i].tareas_vencidas} de ${ls[i].tareas_abiertas})` : ''), tono: TONO_TAREA[tareaDe(ls[i])] },
  { label: 'Vence', valor: ls[i].prox_tarea ? fmtCorta(fechaDe(ls[i].prox_tarea as number)) : '—', n: ls[i].prox_tarea || null, fecha: true, tono: ls[i].tareas_vencidas > 0 ? 'mal' as const : undefined },
] }))
const fVentas = (ls: Lead[]) => filasDeLeads(ls, (l) => (l.crm === 'comisiones' ? 'Venta registrada en la app' : 'Ganado'), (l) => l.cerrado)
/** De dónde salen las ventas, para el pie de cada lista: la app guarda solo el mes de venta. */
const FUENTE_VENTAS = (c: Corte) => (c.comisiones ? ' · app de comisiones, por mes de venta (día 1 = mes)' : ' · fecha = cierre')
const fCotizado = (ls: Lead[]) => filasDeLeads(ls, () => '', (l) => fechaCotizado(l), { label: 'Días desde la cotización', de: (l) => diasDesde(fechaCotizado(l)) })
const fEntrada = (ls: Lead[]) => filasDeLeads(ls, (l) => l.funnel_label, (l) => l.creado)
/** Los leads del asesor cuyo cotizado sigue contando: activos, con monto y cotizados dentro de la
 *  vigencia. Es la misma regla de `cotizado()`, para que la cifra y su lista no se puedan separar. */
const vigentesDe = (c: Corte, f: FilaAsesor) =>
  f.leadsActivos.filter((l) => vivo(l) && l.presupuesto > 0 && diasDesde(fechaCotizado(l)) <= c.cotizado_dias)
/** Los leads activos del asesor partidos por estado (una sola cosa por lead, ver `estadoActivo`). */
const estadosDe = (f: FilaAsesor): Record<EstadoActivo, Lead[]> => {
  const out: Record<EstadoActivo, Lead[]> = { pc: [], sin_tarea: [], estancado: [], al_dia: [] }
  for (const l of f.leadsActivos) out[estadoActivo(l)].push(l)
  return out
}
/** Las actividades de un asesor de ciertos tipos; antes era un ayudante dentro del renglón. */
const evDe = (f: FilaAsesor, ...tipos: string[]) => f.actividad.filter((e) => tipos.includes(e.tipo))
/** El número grande de «Tareas»: SOLO las completadas del periodo (Randall 11-sep); vencidas y sin tarea son foto de hoy y van en la barra y abajo. */
const totTareas = (f: FilaAsesor) => f.tareasCompletadas
/** Un renglón de la tabla de levantamientos: pedidos, hechos, porcentaje y días típicos. */
function FilaLev({ r, ver, rango, que }: { r: { label: string; solicitados: LevFila[]; hechos: LevFila[]; dias: number[] }; ver: (t: string, f: Fila[], s?: string) => void; rango: string; que: string }) {
  return (
    <tr>
      <td><button type="button" className="nbtn" aria-label={`${r.label}: ${fmtN(r.solicitados.length)} levantamientos pedidos. Ver la lista`} onClick={() => ver(`Levantamientos · ${que} ${r.label}`, filasDeLevantamientos(r.solicitados), rango)}>{r.label}</button></td>
      <td className="num">{fmtN(r.solicitados.length)}</td>
      <td className="num">{r.hechos.length ? <button type="button" className="nbtn" aria-label={`${r.label}: ${fmtN(r.hechos.length)} levantamientos hechos. Ver la lista`} onClick={() => ver(`Levantamientos hechos · ${que} ${r.label}`, filasDeLevantamientos(r.hechos), rango)}>{fmtN(r.hechos.length)}</button> : '—'}</td>
      <td className="num">{pct(r.hechos.length, r.solicitados.length)}%</td>
      <td className="num">{r.dias.length ? Math.round(mediana(r.dias)) : '—'}</td>
    </tr>
  )
}
/** Detalle de visitas: la fecha es cuándo se agendó y el número, los días que tardó en hacerse. */
const fVisitas = (ls: Lead[]) => filasDeLeads(ls, (l) => (l.lev_hecho ? 'Visita hecha' : 'Sin hacer todavía'), (l) => l.lev_agendado || l.lev_hecho || 0,
  { label: 'Días de agendar a visitar', de: (l) => (l.lev_hecho && l.lev_agendado ? Math.round((l.lev_hecho - l.lev_agendado) / 86400) : undefined) })
/** Las visitas de cada asesor, de más agendadas a menos. */
function porAsesorVisitas(v: { agendados: Lead[]; hechos: Lead[] }) {
  const m = new Map<string, { label: string; agendados: Lead[]; hechos: Lead[]; dias: number[] }>()
  const fila = (n: string) => { let x = m.get(n); if (!x) { x = { label: n, agendados: [], hechos: [], dias: [] }; m.set(n, x) } return x }
  for (const l of v.agendados) fila(l.asesor || 'Sin asesor').agendados.push(l)
  for (const l of v.hechos) { const x = fila(l.asesor || 'Sin asesor'); x.hechos.push(l); x.dias.push((l.lev_hecho! - l.lev_agendado!) / 86400) }
  return [...m.values()].sort((a, b) => b.agendados.length - a.agendados.length || a.label.localeCompare(b.label, 'es'))
}
/** La combinación de métodos que un asesor repite más, para la tabla de cotizaciones generadas. */
function masUsada(cots: { combo: string }[]): { label: string; n: number } {
  const m = new Map<string, number>()
  for (const c of cots) m.set(c.combo, (m.get(c.combo) || 0) + 1)
  const mejor = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))[0]
  return mejor ? { label: mejor[0] || '—', n: mejor[1] } : { label: '—', n: 0 }
}
/** Mediana de una lista de números ya ordenada o no; 0 si está vacía. */
function mediana(xs: number[]): number {
  if (!xs.length) return 0
  const o = [...xs].sort((a, b) => a - b), m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}
/** Mediana de paneles: una sola cotización enorme no debe mover el número típico del asesor. */
function medianaPaneles(cots: { paneles: number }[]): number {
  const xs = cots.map((c) => c.paneles || 0).filter((n) => n > 0).sort((a, b) => a - b)
  if (!xs.length) return 0
  const m = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[m] : Math.round((xs[m - 1] + xs[m]) / 2)
}

/** Botón que se ve como la cifra: el tile entero no puede ser botón porque adentro va el «i» del glosario. */
function Cifra({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return <button type="button" className="n nbtn" onClick={onClick} title="Ver el detalle" aria-label={label + '. Ver el detalle'}>{children}</button>
}

/** «Avance contra la meta» —la barrita—: vendido, % de la meta, medidor con la marca del ritmo y la frase, teñido
 *  del estado. Es la misma tarjeta en el Dashboard (todo el equipo) y en la ficha (una persona): Alejandro 15-sep
 *  pidió verla «igualito» en la ficha, «muy dramático y que se quede en rojo o cambie de color». */
function TileAvance({ monto, metaRango, rit, periodo, onClick }: { monto: number; metaRango: number; rit: ReturnType<typeof ritmo>; periodo: string; onClick: () => void }) {
  return (
    <button type="button" className={'tile tbtn t3 ritmo-' + rit.estado} onClick={onClick} aria-label={`Vendido ${fmtMoney0(monto)} ${periodo}: ${pct(monto, metaRango)}% de la meta de ${fmtMoney0(metaRango)}. ${rit.texto}. ${rit.avance}. Ver detalle`}>
      <div className="n">{fmtMoney0(monto)}</div>
      <div className="l">{pct(monto, metaRango)}% de la meta de {fmtMoney0(metaRango)} · vendido {periodo}</div>
      <Bullet value={monto} target={metaRango} expected={rit.esperado} label="Vendido" fmt={fmtMoney0} />
      <div className={'rt ' + rit.estado}>{rit.texto}</div>
      {rit.avance && <div className="rt-av">{rit.avance}</div>}
    </button>
  )
}

/** Barra de antigüedad del cotizado: rampa ordinal, lo de más de 90 días rayado. Cada tramo de la leyenda abre sus leads. */
function Antiguedad({ c, leads, onVer }: { c: Cotizado; leads?: Lead[]; onVer?: (titulo: string, filas: Fila[]) => void }) {
  const tot = c.buckets.reduce((a, b) => a + b, 0)
  const bucketDe = (i: number) => (leads || []).filter((l) => { if (!vivo(l) || l.presupuesto <= 0) return false; const d = diasDesde(fechaCotizado(l)); return (d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3) === i })
  return (
    <>
      <div className="aging" role="img" aria-label={'Antigüedad del cotizado: ' + BUCKETS.map((b, i) => `${b} ${fmtMoney0(c.buckets[i])}`).join(', ')}>
        {tot > 0 && c.buckets.map((v, i) => <i key={i} className={'ag' + (i + 1)} style={{ width: pct(v, tot) + '%' }} />)}
      </div>
      <div className="legend">
        {BUCKETS.map((b, i) => onVer && leads
          ? <button type="button" key={b} onClick={() => onVer(`Cotizado con antigüedad ${b}`, fCotizado(bucketDe(i)))} aria-label={`${b}: ${fmtMoney0(c.buckets[i])}. Ver leads`}><i className={'lg-ag' + (i + 1)} aria-hidden="true" />{b} {fmtMoney0(c.buckets[i])}</button>
          : <span key={b}><i className={'lg-ag' + (i + 1)} aria-hidden="true" />{b} {fmtMoney0(c.buckets[i])}</span>)}
      </div>
    </>
  )
}

/** Lista de leads con lo que Alejandro pidió ver sin abrir la ficha: intentos, última tarea, alertas. */
function LeadsTabla({ corte, leads, max = 40 }: { corte: Corte; leads: Lead[]; max?: number }) {
  const hoy = Math.floor(Date.now() / 1000)
  const rows = [...leads].sort((a, b) => diasSinActividad(b) - diasSinActividad(a)).slice(0, max)
  if (!leads.length) return <div className="muted">Sin leads activos asignados en el rango.</div>
  return (
    <div className="tblwrap" style={{ boxShadow: 'none' }}>
      <table className="ftable ltbl">
        <thead><tr><th scope="col">Lead</th><th scope="col">Etapa</th><th scope="col" className="num">Monto</th><th scope="col">Intentos<Info termino="Intentos" /></th><th scope="col">Última tarea hecha</th><th className="num">Días sin actividad</th><th>Alertas</th></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td><a href={l.link} target="_blank" rel="noreferrer" title={'Abrir en ' + CRM_LABEL[l.crm]}>{l.nombre}</a>{mixto(corte) && <span className="small muted"> · {crmCorto(l)}</span>}</td>
              <td>{tipoLead(l)} · {l.etapa}</td>
              <td className="num">{fmtMoney(l.presupuesto)}</td>
              <td>{intentos(l)}</td>
              <td>{hace(l.ult_tarea, hoy)}</td>
              <td className="num">{diasSinActividad(l)}</td>
              <td>
                {l.pc_vencida && <span className="tag warn">Primer contacto vencido</span>}
                {l.sin_tarea && <span className="tag warn">sin tarea</span>}
                {l.tareas_vencidas > 0 && <span className="tag warn">{l.tareas_vencidas} vencida{l.tareas_vencidas > 1 ? 's' : ''}</span>}
                {estancado(l) && <span className="tag">estancado</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {leads.length > max && <div className="small muted" style={{ padding: '8px 10px' }}>Se muestran {max} de {fmtN(leads.length)}, los más estancados primero.</div>}
    </div>
  )
}

// ---------------------------------------------------------------- Embudo por CRM
interface OpcionEmbudo { key: string; crm: Crm; tipo: Embudo; pipe: string; label: string }
/** Embudo con las etapas REALES de un CRM y un pipeline (Randall 19-sep): HubSpot → Ventas (naranja);
 *  Kommo → Ventas | Hunting (azul). Con un asesor elegido, solo los CRM donde trabaja; sin asesor, los
 *  CRM encendidos arriba. Los chips viven dentro del widget; es un componente porque el pipeline
 *  elegido es estado y `widgetsTablero` no es un componente. */
function EmbudoCrm({ corte, filtros, leads, rango, ver, vista = 'embudo' }: { corte: Corte; filtros: Filtros; leads: Lead[]; rango: string; ver: Acciones['ver']; vista?: 'embudo' | 'tabla' }) {
  const u = filtros.asesor ? corte.usuarios.find((x) => x.id === filtros.asesor) : null
  const fuentes = (corte.fuentes || []).map((f) => f.crm)
  const crms = (u?.crm.length ? u.crm : fuentes).filter((c) => fuentes.includes(c) && (u ? true : pasaCrm(c, filtros)))
  const opciones: OpcionEmbudo[] = []
  if (crms.includes('hubspot')) opciones.push({ key: 'hubspot:ventas', crm: 'hubspot', tipo: 'ventas', pipe: 'Ventas', label: 'HubSpot · Ventas' })
  if (crms.includes('kommo')) opciones.push({ key: 'kommo:ventas', crm: 'kommo', tipo: 'ventas', pipe: 'Ventas', label: 'Kommo · Ventas' }, { key: 'kommo:hunting', crm: 'kommo', tipo: 'hunting', pipe: 'Hunting', label: 'Kommo · Hunting' })
  const [key, setKey] = useState(opciones[0]?.key || '')
  const sel = opciones.find((o) => o.key === key) || opciones[0]
  if (!sel) return <div className="vacio"><b>Sin CRM</b><span>Enciende Kommo o HubSpot arriba para ver el embudo.</span></div>
  const llam = llamadasPorLead(corte)
  const et = embudoPipeline(leads, sel.crm, sel.tipo, corte.embudos?.[sel.crm]?.[sel.pipe], llam)
  // Resumen de llamadas de la etapa (junta 23-sep): cuántas hizo el CRM a esos leads y a cuántos se les llamó.
  const resLlam = (e: (typeof et)[number]) => `${fmtN(e.llamadas || 0)} llamada${e.llamadas === 1 ? '' : 's'} · ${fmtN(e.conLlamada || 0)} de ${fmtN(e.n)} leads con llamada`
  const abrir = (e: (typeof et)[number]) => ver(`${e.nombre} · ${sel.label}`, e.id === -2 ? fVentas(e.leads) : fLeadsTarea(e.leads, llam), `${rango} · ${resLlam(e)} (llamadas de los últimos ${corte.dias_historia || 90} días)`)
  const rampa = sel.crm === 'hubspot' ? RAMPA_HS : RAMPA
  return (
    <>
      {opciones.length > 1 && <div className="emb-chips" role="group" aria-label="CRM y pipeline del embudo">
        {opciones.map((o) => <button type="button" key={o.key} className={'chip' + (o.key === sel.key ? ' on' + (o.crm === 'hubspot' ? ' hs' : '') : '')} aria-pressed={o.key === sel.key} onClick={() => setKey(o.key)}>{o.label}</button>)}
      </div>}
      {opciones.length === 1 && <div className="small muted" style={{ marginBottom: 6 }}>{sel.label}</div>}
      {vista === 'embudo' ? (
        <FunnelChart tono={sel.crm} stages={et.map((e) => ({ nombre: e.nombre, n: e.n, sub: `${fmtMoney(e.monto)} · ${e.n ? e.dias.toFixed(1) + ' días en etapa' : 'sin leads'}${/conversaci/i.test(e.nombre) && e.n ? ' · ' + resLlam(e) : ''}` }))} onStage={(i) => abrir(et[i])} />
      ) : (
        <>
          <div className="scrollx"><table className="ftable" aria-label={`Monto cotizado y tiempo por etapa · ${sel.label}`}>
            <thead><tr><th scope="col">Etapa</th><th scope="col" className="num">Leads</th><th scope="col" className="num">Llamadas</th><th scope="col" className="num">Monto</th><th scope="col" className="num">Días promedio</th><th scope="col" className="num">Acumulado</th></tr></thead>
            <tbody>
              {et.map((e, i) => (
                <tr key={e.id}>
                  <td><span className="sw" style={{ background: rampa[Math.min(i, rampa.length - 1)] }} aria-hidden="true" /><button type="button" className="nbtn" aria-label={`${e.nombre}: ${fmtN(e.n)} leads, ${fmtMoney(e.monto)}. Ver leads`} onClick={() => abrir(e)}>{e.nombre}</button></td>
                  <td className="num">{fmtN(e.n)}</td><td className="num" title={resLlam(e)}>{fmtN(e.llamadas || 0)}</td><td className="num">{fmtMoney(e.monto)}</td><td className="num">{e.n ? e.dias.toFixed(1) : '—'}</td><td className="num muted">{e.acumulado.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="muted small" style={{ marginTop: 10 }}>Foto de hoy del pipeline {sel.pipe} de {sel.crm === 'hubspot' ? 'HubSpot' : 'Kommo'}, con sus etapas reales: leads en cada etapa, llamadas del CRM a esos leads en los últimos {corte.dias_historia || 90} días, suma de sus presupuestos y días promedio que llevan ahí. Cierre = ganados del rango, días desde su asignación.</div>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Conversión como tabla (Randall 22-sep)
const VISTAS_CONV: { id: PorConversion | 'ventas'; label: string }[] = [
  { id: 'asesor', label: 'Por asesor' }, { id: 'origen', label: 'Por origen del lead' }, { id: 'ventas', label: 'Lista de ventas' },
]
/** La tarjeta «Conversión» abre esto: la tasa por asesor (o por origen del lead) con leads asignados, cierres, días
 *  promedio de cierre y tasa; el nombre de cada renglón abre sus leads uno por uno. «Lista de ventas» es la lista de
 *  antes. Las tres vistas se cambian arriba sin cerrar la ventana. */
function drillConversion(corte: Corte, f: Filtros, por: PorConversion | 'ventas', abrir: (d: Drill) => void, clase?: ClaseOrigen): Drill {
  const cv = conversion(corte, f, por === 'ventas' ? 'asesor' : por, clase)
  const periodo = periodoTexto(cv.rango)
  // Con canal (digital / no digital) no hay «Lista de ventas»: una venta de la app sin lead no siempre dice su origen.
  const vistas = VISTAS_CONV.filter((x) => !clase || x.id !== 'ventas').map((x) => ({ label: x.label, on: x.id === por, onClick: () => abrir(drillConversion(corte, f, x.id, abrir, clase)) }))
  const sub = `${fmtN(cv.cierres.length)} cierres / ${fmtN(cv.leads.length)} leads asignados sin perdidos ${periodo} = ${fmtTasa(cv.leads.length ? cv.cierres.length / cv.leads.length : null)}`
  if (por === 'ventas') return { titulo: 'Ventas que cuentan en la conversión', filas: fVentas(ventasFiltradas(corte, f)), sub, vistas }
  const pie = `Tasa = cierres entre leads asignados en los meses que toca el rango, SIN los perdidos: un lead descartado no cuenta (la app de comisiones guarda el mes de la venta, no el día). `
    + `Días de cierre = de la asignación del lead al día en que el CRM lo marcó ganado: ${fmtN(cv.casadas)} de ${fmtN(cv.cierres.length)} ventas se casaron con su lead `
    + `y ${fmtN(cv.conDias)} tienen ese día. ${por === 'origen' && !clase ? 'Una venta sin lead casado no tiene origen y va en su propio renglón, sin tasa. ' : ''}`
    + (clase ? `Solo ${CLASE_LABEL[clase]}: ${clase === 'digital' ? 'Meta Ads, Google Ads, TikTok, Wapp-FB, Web Form, web y redes orgánicas, WhatsApp y llamadas entrantes' : 'referidos, cambaceo, expo, directo, expansión y sin origen'}; los leads sin origen también cuentan aquí para no perderse. Una venta sin lead casado cuenta por el origen que capturó la app. Digital + no digital = la conversión total. ` : '')
    + 'Clic en el nombre abre sus leads.'
  const self: Drill = {
    titulo: (clase ? `Tasa de conversión ${CLASE_LABEL[clase]}` : 'Tasa de conversión') + (por === 'asesor' ? ' por asesor' : ' por origen del lead'), sub, pie, vistas,
    clave: 'conv-' + por, nombreLabel: por === 'asesor' ? 'Asesor' : 'Origen del lead', unidad: por === 'asesor' ? ['asesor', 'asesores'] : ['origen', 'orígenes'], sin: ['crm', 'asesor', 'cuando', 'monto'], verLabel: 'Ver sus leads',
    filas: filasConversion(cv),
    verFila: (fila) => {
      const x = cv.filas.find((y) => 'conv:' + y.clave === fila.id)
      if (x) abrir(drillLeadsConv(corte, x, periodo, por, abrir, { label: self.titulo, onClick: () => abrir(self) }))
    },
  }
  return self
}
/** Los leads y cierres de UN renglón de la conversión (un asesor o un origen), con el switch Todos · Cerradas · Sin
 *  cierre (Randall 23-sep). Lo abren la tabla de conversión y el «Porcentaje de cierre» de la ficha: mismo detalle. */
function drillLeadsConv(corte: Corte, x: FilaConv, periodo: string, por: PorConversion, abrir: (d: Drill) => void, volver?: Drill['volver'], estado = ''): Drill {
  const todas = filasConversionLeads(x, actividadPorLead(corte))
  const ESTADOS = [{ id: '', label: 'Todos' }, { id: 'Cerrada', label: 'Cerradas' }, { id: 'Sin cierre', label: 'Sin cierre' }]
  return {
    titulo: `${x.label} · leads y cierres ${periodo}`, clave: 'conv-leads', unidad: ['lead o venta', 'leads y ventas'], alertaLabel: '', sin: por === 'asesor' ? ['asesor', 'cuando'] : ['cuando'],
    sub: `${fmtN(x.cierres.length)} cierres / ${fmtN(x.leads.length)} leads = ${fmtTasa(x.tasa)}${x.dias != null ? ` · ${fmtN(Math.round(x.dias))} días promedio de cierre (${fmtN(x.nDias)} con día de cierre)` : ''}`,
    pie: 'Primero las ventas cerradas, luego los leads asignados que no han cerrado. Tareas y llamadas = las que el CRM registró en ese lead en los últimos 90 días. La fecha de cierre es el día en que el CRM marcó el lead como ganado; si la venta no se casó con su lead o el CRM no lo marcó, solo se sabe el mes de la app. Clic en el nombre abre el registro en su CRM.',
    filas: estado ? todas.filter((f) => f.estado === estado) : todas, volver,
    vistas: ESTADOS.map((e) => ({ label: `${e.label} (${fmtN(e.id ? todas.filter((f) => f.estado === e.id).length : todas.length)})`, on: e.id === estado, onClick: () => abrir(drillLeadsConv(corte, x, periodo, por, abrir, volver, e.id)) })),
  }
}

// ---------------------------------------------------------------- Dashboard
/** Todo lo que el tablero deriva de un corte y unas fechas. Está aparte porque el tablero se arma
 *  DOS veces cuando algún widget tiene fechas propias: una con las del tablero y otra con las suyas. */
function datosDe(corte: Corte, f: Filtros) {
  const leads = leadsFiltrados(corte, f)
  const ev = eventosFiltrados(corte, f)
  const ventas = ventasFiltradas(corte, f)
  const filas = porAsesor(corte, f)
  // «Foto de hoy» en el widget: el embudo y el monto por etapa son de TODOS los activos hoy, no de los asignados en un rango.
  const leadsEmbudo = f.foto ? leadsActivosHoy(corte, f) : leads
  // Las ventas de la app van por MES: el periodo que de verdad cubren (y la base de la conversión) son los meses
  // que toca el rango (`rangoVentas`), no sus días. Sin app es el rango tal cual.
  const rv = rangoVentas(corte, f.rango)
  // Base de la conversión = asignados SIN los perdidos (Randall 24-sep), igual que `conversion()`.
  const leadsVentas = (rv.ini === f.rango.ini && rv.fin === f.rango.fin ? leads : leadsFiltrados(corte, { ...f, rango: rv })).filter(baseCierre(corte))
  // Cotizado vigente y activos son foto de HOY (Randall 11-sep), igual que en la tabla de Asesores.
  const activosHoy = leadsActivosHoy(corte, f)
  return {
    leads, ev, ventas, filas, rv, leadsVentas, activosHoy, leadsEmbudo,
    ent: entrada(corte, f.rango, f), pc: primerContacto(corte, leads), rz: razones(corte, ev), perf: perfiles(corte, filas),
    vr: ventasReales(corte, f), cg: cotizacionesGeneradas(corte, f), vis: visitas(corte, f), lev: levantados(corte, f),
  }
}
type Datos = ReturnType<typeof datosDe>

/** Quién responde a los clics de los widgets: la página que los dibuja. */
interface Acciones {
  ver: (titulo: string, filas: Fila[], sub?: string) => void
  /** Abre una ventana armada a mano (con vistas, volver o detalle por renglón). */
  abrir: (d: Drill) => void
  /** Drill de llamadas calificadas con «Notas» (14 preguntas) — el mismo que usa la tabla de Asesores. */
  verLlamadas: (titulo: string, ls: Llamada[]) => void
  onFicha: (uid: string) => void
  grupo: PuntoPerfil[] | null
  setGrupo: (g: PuntoPerfil[] | null) => void
}
/** Todos los widgets del tablero. Vive fuera del componente porque el tablero se arma varias veces:
 *  con las fechas de arriba, con las fechas propias de un widget, y —desde la ficha— fijado a UNA
 *  persona (Randall 10-sep: «que la vista por defecto del asesor sea como el diseño del PDF»). */
function widgetsTablero(corte: Corte, filtros: Filtros, d: Datos, ax: Acciones): Widget[] {
  const { ver, abrir, verLlamadas, onFicha, grupo, setGrupo } = ax
  const { leads, ev, ventas, filas, rv, leadsVentas, activosHoy, leadsEmbudo, ent, pc, rz, perf, vr, cg, vis, lev } = d
  const s = salud(leads)
  const con = s.ventasCon + s.huntCon, sin = s.ventasSin + s.huntSin, tot = con + sin
  const hayHunting = s.huntCon + s.huntSin > 0
  const asignados = leads.filter((l) => l.funnel === 4)
  // Tasa de pérdida: de los leads asignados en el rango (activos + ganados + perdidos), cuántos ya se perdieron.
  const perdidos = leads.filter((l) => l.funnel === 0), baseAsignados = leads.filter((l) => l.funnel === 4 || l.funnel === 5 || l.funnel === 0).length
  const a = actividad(ev)
  // Descartes del periodo partidos por la asignación del lead (Randall 24-sep: «ambos dicen Este mes y muestran data
  // diferente»): la tarjeta cuenta el DÍA DEL DESCARTE; «Tasa de pérdida» cuenta los leads ASIGNADOS en el periodo.
  const descNuevos = ev.filter((e) => e.tipo === 'descarte' && e.asignacion >= filtros.rango.ini && e.asignacion < filtros.rango.fin).length
  // `ventas` = app de comisiones cuando el corte la trae (Randall 11-sep); el CRM solo de respaldo. Ver ventasFiltradas.
  const monto = ventas.reduce((x, l) => x + l.presupuesto, 0)
  // Ganados del CRM, solo para la tabla que compara la app contra el CRM.
  const vCrm = ventasCrm(corte, filtros)
  const crmDe = (uid: string) => { const xs = vCrm.filter((l) => l.asesor_id === uid); return { n: xs.length, monto: xs.reduce((x, l) => x + l.presupuesto, 0) } }
  const verVendido = () => ver('Vendido ' + periodoV, fVentas(ventas), rango + FUENTE_VENTAS(corte))
  const metaRango = filas.reduce((x, f) => x + f.metaRango, 0)
  const metaMes = filas.reduce((x, f) => x + f.metaMes, 0)
  const cot = cotizado(activosHoy, corte.cotizado_dias)
  const vigentes = activosHoy.filter((l) => vivo(l) && l.presupuesto > 0 && diasDesde(fechaCotizado(l)) <= corte.cotizado_dias)
  const objetivoCot = metaMes * corte.cotizado_x
  const ranking = filas.slice(0, 8)
  const rzTot = rz.reduce((x, r) => x + r.n, 0)
  const horasPC = pc.mediana == null ? '—' : pc.mediana < 48 ? pc.mediana.toFixed(1) : String(Math.round(pc.mediana / 24))
  const unidadPC = pc.mediana == null ? 'sin dato' : pc.mediana < 48 ? 'horas (mediana)' : 'días (mediana)'
  const rango = filtros.rango.label, periodo = periodoTexto(filtros.rango)
  // Lo vendido y su meta se leen por los meses que toca el rango («del 1 al 30 de septiembre» aunque el
  // calendario diga «Últimos 7 días»): es lo que de verdad suma la app de comisiones.
  const periodoV = periodoTexto(rv)
  const rit = ritmo(monto, metaRango, rv)
  const evDe = (...tipos: string[]) => ev.filter((e) => tipos.includes(e.tipo))
  const verEv = (titulo: string, ...tipos: string[]) => ver(titulo, filasDeEventos(corte, evDe(...tipos)), rango)
  const saludRow = (label: string, ls: Lead[], n: number, cls?: string, pctTxt?: string, h = false) => (
    <button type="button" className={'lr' + (h ? ' h' : '')} onClick={() => ver(`${label} · leads asignados`, fLeads(ls), rango)} aria-label={`${label}: ${fmtN(n)}. Ver leads`}>
      {cls ? <span className={'sw ' + cls} aria-hidden="true" /> : <span />}<span className={h ? '' : 'muted'}>{label}</span><span className="muted">{pctTxt || ''}</span><span>{fmtN(n)}</span>
    </button>
  )
  const ENT: { k: CatEntrada; cls: string; l: string }[] = [
    { k: 'llegaron', cls: 'e1', l: 'Llegaron' }, { k: 'sinRespuesta', cls: 'e2', l: 'Sin respuesta' }, { k: 'sinRecibo', cls: 'e3', l: 'Respondieron sin recibo' },
    { k: 'conRecibo', cls: 'e4', l: 'Con recibo' }, { k: 'asignados', cls: 'e5', l: 'Asignados' }, { k: 'perdidos', cls: 'e6', l: 'Perdidos' },
  ]
  // Cada gráfica es un widget que Randall (o quien mire) puede reordenar; el orden vive en el navegador.
  const W = (id: string, titulo: string, nodo: React.ReactNode, opts: Partial<Widget> = {}): Widget => ({ id, titulo, nodo, ...opts })
  const widgets: Widget[] = [
    // Primero las 9 cifras (6 + 3 columnas) y Salud cierra la segunda fila: así la rejilla de 6 queda sin huecos por defecto.
    W('t-leads', 'Leads asignados', (
        <button type="button" className="tile tbtn" onClick={() => ver('Leads asignados ' + periodo, fLeads(asignados), rango + ' · fecha = última asignación')} aria-label={`${fmtN(tot)} leads asignados ${periodo}. Ver detalle`}><div className="n">{fmtN(tot)}</div><div className="l">Leads asignados {periodo}</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Leads asignados'], desde: 'cifras', base: 'asignacion' }),
    W('t-ventas', 'Clientes cerrados', (
        <button type="button" className="tile tbtn t2" onClick={() => ver('Clientes cerrados ' + periodoV, fVentas(ventas), rango + FUENTE_VENTAS(corte))} aria-label={`${fmtN(ventas.length)} clientes cerrados ${periodoV}. Ver detalle`}><div className="n">{fmtN(ventas.length)}</div><div className="l">Clientes cerrados {periodoV}</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Clientes cerrados'], desde: 'cifras', base: 'cierre' }),
    // El número que Alejandro llamó «el más importante» (4-sep): vendido contra la meta con el ritmo del mes y color que grite.
    W('t-vendido', 'Avance contra la meta', <TileAvance monto={monto} metaRango={metaRango} rit={rit} periodo={periodoV} onClick={verVendido} />,
      { plain: true, span: 1, alto: 6, minAlto: 6, cls: 'wtile', info: ['Ritmo'], desde: 'cifras', base: 'cierre' }),   // 6 filas: medidor, frase del ritmo y avance contra el día
    W('t-conversion', 'Conversión ventas / asignados', (
        <button type="button" className="tile tbtn t4" onClick={() => abrir(drillConversion(corte, filtros, 'asesor', abrir))} aria-label={`Conversión ${leadsVentas.length ? pct(ventas.length, leadsVentas.length) + '%' : 'sin dato'}. Ver detalle`}><div className="n">{leadsVentas.length ? pct(ventas.length, leadsVentas.length) + '%' : '—'}</div><div className="l">Ventas cerradas entre leads asignados sin perdidos {periodoV}</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Conversión'], desde: 'cifras' }),
    // La misma conversión partida por canal del origen (junta 23-sep); la de arriba sigue juntando los dos.
    ...(['digital', 'nodigital'] as const).map((k) => {
      const cv = conversion(corte, filtros, 'asesor', k), n = cv.leads.length, t = n ? pct(cv.cierres.length, n) + '%' : '—'
      const titulo = 'Tasa de conversión ' + CLASE_LABEL[k]
      // ids «-dig»: las primeras («-digital») cayeron en huecos sueltos de los acomodos guardados y nadie las
      // encontraba (Randall 24-sep); con id nuevo entran de nuevo, ahora pegadas a «Conversión» (`junto`).
      return W(k === 'digital' ? 't-conv-dig' : 't-conv-nodig', titulo, (
        <button type="button" className="tile tbtn t4" onClick={() => abrir(drillConversion(corte, filtros, 'asesor', abrir, k))} aria-label={`${titulo}: ${t}, ${fmtN(cv.cierres.length)} cierres de ${fmtN(n)} leads. Ver detalle`}>
          <div className="n">{t}</div><div className="l">{k === 'digital' ? 'Origen digital' : 'Origen no digital'}: {fmtN(cv.cierres.length)} cierres de {fmtN(n)} leads asignados sin perdidos {periodoTexto(cv.rango)}</div></button>
      ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: [k === 'digital' ? 'Conversión digital' : 'Conversión no digital'], junto: k === 'digital' ? 't-conversion' : 't-conv-dig' })
    }),
    W('t-perdida', 'Tasa de pérdida', (
        <button type="button" className="tile tbtn t5" onClick={() => ver('Leads perdidos · asignados en el rango', filasDeLeads(perdidos, (l) => `Perdido · ${l.razon || 'sin razón'}`, (l) => l.cerrado), rango + ' · fecha = descarte')} aria-label={`Tasa de pérdida ${pct(perdidos.length, baseAsignados)}%: ${fmtN(perdidos.length)} perdidos de ${fmtN(baseAsignados)} asignados. Ver detalle`}><div className="n">{pct(perdidos.length, baseAsignados)}%</div><div className="l">{fmtN(perdidos.length)} perdidos de {fmtN(baseAsignados)} leads asignados en el periodo</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Tasa de pérdida'], desde: 'cifras' }),
    W('t-tareas', 'Tareas completadas', (
        <button type="button" className="tile tbtn" onClick={() => verEv('Tareas completadas', 'tarea')} aria-label={`${fmtN(a.tareas)} tareas completadas. Ver detalle`}><div className="n">{fmtN(a.tareas)}</div><div className="l">Tareas completadas</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Tareas completadas'], desde: 'actividad', base: 'actividad' }),
    W('t-cotizaciones', 'Cotizaciones entregadas', (
        <button type="button" className="tile tbtn" onClick={() => verEv('Cotizaciones entregadas', 'cotizacion')} aria-label={`${fmtN(a.cotizaciones)} cotizaciones entregadas${a.recotizaciones ? `, ${fmtN(a.recotizaciones)} recotizaciones aparte` : ''}. Ver detalle`}><div className="n">{fmtN(a.cotizaciones)}</div><div className="l">Cotizaciones entregadas{a.recotizaciones ? ` · ${fmtN(a.recotizaciones)} recotizaciones aparte` : ''}</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Cotizaciones'], desde: 'actividad', base: 'actividad' }),
    W('t-descartes', 'Descartados con razón registrada', (
        <button type="button" className="tile tbtn" onClick={() => verEv('Descartados con razón registrada', 'descarte')} aria-label={`${fmtN(a.descartes)} descartados en el periodo: ${fmtN(descNuevos)} de leads asignados en el periodo y ${fmtN(a.descartes - descNuevos)} de leads anteriores. Ver detalle`}><div className="n">{fmtN(a.descartes)}</div><div className="l">Descartados en el periodo · {fmtN(descNuevos)} de leads asignados en el periodo, {fmtN(a.descartes - descNuevos)} de leads anteriores</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Razón de descarte'], desde: 'actividad' , base: 'actividad' }),
    W('t-levantamientos', 'Levantamientos solicitados', (
        <button type="button" className="tile tbtn" onClick={() => verEv('Levantamientos solicitados', 'levantamiento')} aria-label={`${fmtN(a.levantamientos)} levantamientos. Ver detalle`}><div className="n">{fmtN(a.levantamientos)}</div><div className="l">Levantamientos solicitados</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Levantamientos'], desde: 'actividad' , base: 'actividad' }),
    W('salud', 'Salud operativa', (
      <>
        <div className="salud-grid">
          <DonutChart partes={[{ val: con, color: 'var(--c1)', label: 'Con presupuesto' }, { val: sin, color: 'var(--c2)', label: 'Sin presupuesto' }]} total={tot} label="leads asignados" />
          <div className="legend-list">
            {saludRow('Con presupuesto ($>0)', asignados.filter((l) => l.presupuesto > 0), con, 'c1', pct(con, tot) + '%', true)}
            {saludRow('Ventas', asignados.filter((l) => l.presupuesto > 0 && l.embudo === 'ventas'), s.ventasCon)}
            {hayHunting && saludRow('Hunting', asignados.filter((l) => l.presupuesto > 0 && l.embudo === 'hunting'), s.huntCon)}
            {saludRow('Sin presupuesto', asignados.filter((l) => l.presupuesto <= 0), sin, 'c2', pct(sin, tot) + '%', true)}
            {saludRow('Ventas', asignados.filter((l) => l.presupuesto <= 0 && l.embudo === 'ventas'), s.ventasSin)}
            {hayHunting && saludRow('Hunting', asignados.filter((l) => l.presupuesto <= 0 && l.embudo === 'hunting'), s.huntSin)}
          </div>
        </div>
        <div className="cmpbar" role="img" aria-label={`${pct(con, tot)}% con presupuesto, ${pct(sin, tot)}% sin presupuesto`}><i style={{ width: pct(con, tot) + '%' }} /></div>
        <div className="cmp-legend"><span>Total registros: {fmtN(tot)}</span><span>asignados en Ventas{hayHunting ? '/Hunting' : ''} · última asignación en el rango{mixto(corte) ? ' · Kommo + HubSpot' : ''}{!hayHunting && pasaCrm('hubspot', filtros) ? ' · HubSpot no tiene Hunting' : ''}</span></div>
      </>
    ), { info: ['Salud operativa'], alto: 7 , base: 'asignacion' }),
    // Cada cifra es un widget propio (pedido de Randall 4-sep): se mueve y se estira por separado. `desde` migra el orden guardado del grupo viejo.
    W('ranking', 'Ranking de ventas', (
      <>
        {!ranking.length && <div className="muted">Sin ventas ni actividad en el rango.</div>}
        {ranking.map((f, i) => (
          <div className="lr drill" key={f.u.id} role="button" tabIndex={0} aria-label={`${f.u.nombre}: ${fmtMoney0(f.montoVentas)} en ${f.ventas} ventas. Ver ventas`}
            onClick={() => ver(`Ventas de ${f.u.nombre}`, fVentas(ventas.filter((l) => l.asesor_id === f.u.id)), rango + FUENTE_VENTAS(corte))} onKeyDown={activar(() => ver(`Ventas de ${f.u.nombre}`, fVentas(ventas.filter((l) => l.asesor_id === f.u.id)), rango + FUENTE_VENTAS(corte)))}>
            <span className={'pos' + (i < 3 ? ' top' : '')}>{i + 1}</span>
            <span className="nm" title={subAsesor(corte, f.u)}>{f.u.nombre}<TagTipo c={corte} u={f.u} /></span>
            <Bullet sm value={f.montoVentas} target={f.metaRango} expected={f.esperado} label={'Vendido de ' + f.u.nombre} fmt={fmtMoney0} />
            <span className="v">{fmtMoney0(f.montoVentas)}<small>{f.ventas} venta{f.ventas === 1 ? '' : 's'} · {pct(f.montoVentas, f.metaRango)}% de la meta · <span className={'rt ' + f.ritmo.estado}>{f.ritmo.corto}</span></small></span>
          </div>
        ))}
        {filas.length > ranking.length && <div className="small muted" style={{ marginTop: 8 }}>Top {ranking.length} de {filas.length}; la tabla de Asesores trae a todos.</div>}
      </>
    ), { info: ['Ranking'], cls: 'rank', alto: 12 , base: 'cierre' }),   // 12 filas: a 3 columnas la línea chica de cada renglón va en dos renglones (8 × 62 px + nota)
    ...(corte.comisiones ? [W('reales', 'Ventas reales · Comisiones', (
      <>
        {vr.filas.length > 0 && (
          <div className="scrollx crece"><table className="ftable">
            <thead><tr><th scope="col">Asesor</th><th scope="col" className="num">Ventas reales</th><th scope="col" className="num">Monto real</th><th scope="col" className="num">Ventas CRM</th><th scope="col" className="num">Monto CRM</th></tr></thead>
            <tbody>
              {vr.filas.map((r) => { const cr = r.u ? crmDe(r.u.id) : undefined; return (
                <tr key={r.nombre}>
                  <td><button type="button" className="nbtn" aria-label={`${r.nombre}: ${fmtN(r.n)} ventas reales, ${fmtMoney0(r.monto)}. Ver la comparativa contra el CRM`}
                    onClick={() => (r.u
                      ? ver(`Ventas reales contra el CRM · ${r.nombre}`, comparativaVentas(vCrm.filter((l) => l.asesor_id === r.u!.id), r.ventas), rango + ' · pareja = mismo cliente y cierre cerca del mes de venta')
                      : ver(`Ventas reales · ${r.nombre}`, filasDeVentasReales(r.ventas), rango + ' · vendedor sin asesor en el CRM: solo la lista de la app'))}>{r.nombre}</button>{!r.u && <span className="muted"> · sin asesor en el CRM</span>}</td>
                  <td className="num">{fmtN(r.n)}</td><td className="num">{fmtMoney0(r.monto)}</td>
                  <td className="num">{cr ? fmtN(cr.n) : '—'}</td><td className="num">{cr ? fmtMoney0(cr.monto) : '—'}</td>
                </tr>) })}
            </tbody>
          </table></div>
        )}
        {!vr.filas.length && <div className="vacio"><b>Sin ventas en la app de comisiones</b><span>Nadie ha registrado ventas de este periodo{filtros.asesor || filtros.equipo ? ' con este filtro' : ''}. La app guarda el mes de venta, no el día.</span></div>}
        <div className="small muted" style={{ marginTop: 8 }}>Clic en el asesor abre la comparativa venta por venta: cuáles faltan en el CRM y cuáles en la app. Fuente: app de comisiones, por mes de venta y sin canceladas · corte {(corte.comisiones.generado || '').slice(0, 16).replace('T', ' ')}.{vr.sinAsesor.length ? ` Vendedores sin asesor en el CRM: ${vr.sinAsesor.join(', ')}.` : ''}{corte.comisiones.error ? ` Error al leer la app: ${corte.comisiones.error}` : ''}</div>
      </>
    ), { info: ['Ventas reales'], alto: 10 })] : []),
    ...(corte.cotizaciones ? [W('cotiz-metodos', 'Cotizaciones generadas · métodos de pago', (
      <>
        <div className="brow" style={{ marginBottom: 8 }}>
          <Cifra label={`${fmtN(cg.cots.length)} cotizaciones generadas`} onClick={() => ver('Cotizaciones generadas', filasDeCotizaciones(cg.cots), rango)}><span className="v">{fmtN(cg.cots.length)}</span></Cifra>
          <span className="small muted">cotizaciones generadas · {fmtN(cg.multi)} con 2 o más métodos · {fmtN(cg.conLead)} ligadas a un lead de Kommo</span>
        </div>
        {cg.cots.length > 0 && (
          <div className="scrollx crece"><table className="ftable">
            <thead><tr><th scope="col">Método de pago</th><th scope="col" className="num">Cotizaciones</th><th scope="col" className="num">%</th></tr></thead>
            <tbody>
              {cg.porPlan.map((r) => (
                <tr key={'p' + r.label}>
                  <td><button type="button" className="nbtn" aria-label={`${r.label}: ${fmtN(r.n)} cotizaciones. Ver la lista`} onClick={() => ver(`Cotizaciones con ${r.label}`, filasDeCotizaciones(r.cots), rango)}>{r.label}</button></td>
                  <td className="num">{fmtN(r.n)}</td><td className="num">{pct(r.n, cg.cots.length)}%</td>
                </tr>))}
            </tbody>
            <thead><tr><th scope="col">Combinación exacta</th><th scope="col" className="num">Cotizaciones</th><th scope="col" className="num">%</th></tr></thead>
            <tbody>
              {cg.porCombo.map((r) => (
                <tr key={'c' + r.label}>
                  <td><button type="button" className="nbtn" aria-label={`${r.label}: ${fmtN(r.n)} cotizaciones. Ver la lista`} onClick={() => ver(`Cotizaciones · ${r.label}`, filasDeCotizaciones(r.cots), rango)}>{r.label}</button></td>
                  <td className="num">{fmtN(r.n)}</td><td className="num">{pct(r.n, cg.cots.length)}%</td>
                </tr>))}
            </tbody>
            {/* Quién manda qué (Randall 9-sep): la pregunta es qué combinación usa cada asesor, no solo el total. */}
            <thead><tr><th scope="col">Asesor</th><th scope="col" className="num">Cotizaciones</th><th scope="col">La que más usa</th><th scope="col" className="num">Paneles típicos</th></tr></thead>
            <tbody>
              {cg.porAsesor.map((r) => {
                const top = masUsada(r.cots)
                return (
                  <tr key={'a' + r.label}>
                    <td><button type="button" className="nbtn" aria-label={`${r.label}: ${fmtN(r.n)} cotizaciones. Ver la lista`} onClick={() => ver(`Cotizaciones de ${r.label}`, filasDeCotizaciones(r.cots), rango)}>{r.label}</button></td>
                    <td className="num">{fmtN(r.n)}</td>
                    <td>{top.label}{top.n < r.n ? <span className="muted"> · {fmtN(top.n)} de {fmtN(r.n)}</span> : null}</td>
                    <td className="num">{medianaPaneles(r.cots) || '—'}</td>
                  </tr>)
              })}
            </tbody>
          </table></div>
        )}
        {!cg.cots.length && <div className="vacio"><b>Sin cotizaciones generadas</b><span>Nadie generó una imagen de cotización en este periodo{filtros.asesor || filtros.equipo ? ' con este filtro' : ''}. Se cuentan desde el 8 de septiembre de 2026.</span></div>}
        <div className="small muted" style={{ marginTop: 8 }}>Un método suma en cada cotización donde aparece; la combinación cuenta el conjunto exacto de métodos del flyer. «La que más usa» es la combinación que ese asesor repite más veces. Fuente: cotizador (al generar la imagen), últimos {corte.cotizaciones.dias} días · corte {(corte.cotizaciones.generado || '').slice(0, 16).replace('T', ' ')}.{corte.cotizaciones.error ? ` Error al leer la tabla: ${corte.cotizaciones.error}` : ''}</div>
      </>
    ), { info: ['Cotizaciones generadas'], alto: 10 })] : []),
    // La verdad de «ya se hizo» está en el Excel que llena operaciones, no en el embudo (Randall
    // 9-sep). Solo entran las prioridades de ayuda a cierre; el filtro de equipo aplica por zona.
    ...(corte.levantamientos ? [W('lev-operaciones', 'Levantamientos de ayuda a cierre', (
      <>
        <div className="brow" style={{ marginBottom: 8 }}>
          <Cifra label={`${fmtN(lev.filas.length)} levantamientos pedidos`} onClick={() => ver('Levantamientos pedidos', filasDeLevantamientos(lev.filas), rango + ' · fecha = cuando se pidió')}><span className="v">{fmtN(lev.filas.length)}</span></Cifra>
          <span className="small muted">pedidos · <b>{fmtN(lev.hechos.length)} ya se hicieron ({pct(lev.hechos.length, lev.filas.length)}%)</b> · {fmtN(lev.pendientes.length)} sin hacer{lev.dias.length ? ` · ${dias(Math.round(mediana(lev.dias)))} de pedir a hacer` : ''}</span>
        </div>
        {lev.filas.length > 0 && (
          <div className="scrollx crece"><table className="ftable">
            <thead><tr><th scope="col">Zona</th><th scope="col" className="num">Pedidos</th><th scope="col" className="num">Hechos</th><th scope="col" className="num">%</th><th scope="col" className="num">Días típicos</th></tr></thead>
            <tbody>{lev.porZona.map((r) => <FilaLev key={'z' + r.label} r={r} ver={ver} rango={rango} que="zona" />)}</tbody>
            <thead><tr><th scope="col">Asesor</th><th scope="col" className="num">Pedidos</th><th scope="col" className="num">Hechos</th><th scope="col" className="num">%</th><th scope="col" className="num">Días típicos</th></tr></thead>
            <tbody>{lev.porAsesor.slice(0, 12).map((r) => <FilaLev key={'a' + r.label} r={r} ver={ver} rango={rango} que="asesor" />)}</tbody>
          </table></div>
        )}
        {!lev.filas.length && <div className="vacio"><b>Sin levantamientos en estas fechas</b><span>El Excel de operaciones no tiene ninguno pedido en este periodo{filtros.equipo ? ' de esta zona' : ''}.</span></div>}
        <div className="small muted" style={{ marginTop: 8 }}>Cuentan solo los de ayuda a cierre (Ayuda Cierre, URGENTE Cierre, URGENTE mejoravit y URGENTE Cierre COMERCIAL); las visitas de instalación y post-venta quedan fuera. «Hecho» es lo que dice operaciones en su Excel, no la etapa del CRM. Monterrey sale del Excel «LEVANTAMIENTOS»; las demás zonas, del reporte que llenan las cuadrillas. Corte {(corte.levantamientos.generado || '').slice(0, 16).replace('T', ' ')}.{corte.levantamientos.error ? ` Error al leer: ${corte.levantamientos.error}` : ''}</div>
      </>
    ), { alto: 11 })] : []),
    // De las visitas que se agendaron, cuántas ya se hicieron según el EMBUDO (Randall 9-sep).
    // Se queda porque mide otra cosa: si el asesor mueve la tarjeta. El número bueno es el de arriba.
    W('visitas', 'Levantamientos según el embudo del CRM', (
      <>
        <div className="brow" style={{ marginBottom: 8 }}>
          <Cifra label={`${fmtN(vis.agendados.length)} levantamientos agendados`} onClick={() => ver('Levantamientos agendados', fVisitas(vis.agendados), rango + ' · fecha = cuando se agendó')}><span className="v">{fmtN(vis.agendados.length)}</span></Cifra>
          <span className="small muted">agendados · <b>{fmtN(vis.hechos.length)} ya se hicieron ({pct(vis.hechos.length, vis.agendados.length)}%)</b> · {fmtN(vis.pendientes.length)} sin hacer todavía{vis.dias.length ? ` · ${dias(Math.round(mediana(vis.dias)))} de agendar a visitar` : ''}</span>
        </div>
        {vis.agendados.length > 0 && (
          <div className="scrollx crece"><table className="ftable">
            <thead><tr><th scope="col">Asesor</th><th scope="col" className="num">Agendados</th><th scope="col" className="num">Hechos</th><th scope="col" className="num">%</th><th scope="col" className="num">Días típicos</th></tr></thead>
            <tbody>
              {porAsesorVisitas(vis).map((r) => (
                <tr key={r.label}>
                  <td><button type="button" className="nbtn" aria-label={`${r.label}: ${fmtN(r.agendados.length)} levantamientos agendados. Ver la lista`} onClick={() => ver(`Levantamientos agendados · ${r.label}`, fVisitas(r.agendados), rango)}>{r.label}</button></td>
                  <td className="num">{fmtN(r.agendados.length)}</td>
                  <td className="num">{r.hechos.length ? <button type="button" className="nbtn" aria-label={`${r.label}: ${fmtN(r.hechos.length)} levantamientos hechos. Ver la lista`} onClick={() => ver(`Levantamientos hechos · ${r.label}`, fVisitas(r.hechos), rango)}>{fmtN(r.hechos.length)}</button> : '—'}</td>
                  <td className="num">{pct(r.hechos.length, r.agendados.length)}%</td>
                  <td className="num">{r.dias.length ? Math.round(mediana(r.dias)) : '—'}</td>
                </tr>))}
            </tbody>
          </table></div>
        )}
        {!vis.agendados.length && <div className="vacio"><b>Sin levantamientos agendados</b><span>Nadie movió un lead a «Levantamiento agendado» en este periodo{filtros.asesor || filtros.equipo ? ' con este filtro' : ''}.</span></div>}
        <div className="small muted" style={{ marginTop: 8 }}>Agendado = el lead entró a la etapa «Levantamiento agendado»; hecho = después llegó a «Levantamiento hecho», aunque haya sido fuera de estas fechas. {vis.sinAgendar.length ? <>Además hay <button type="button" className="nbtn" onClick={() => ver('Levantamientos hechos sin agendar antes', fVisitas(vis.sinAgendar), rango + ' · fecha = la visita')}>{fmtN(vis.sinAgendar.length)} visitas hechas que nunca pasaron por «agendado»</button>: el asesor movió el lead directo a «hecho»{vis.sinAgendar.filter((l) => l.crm === 'hubspot').length > vis.sinAgendar.length / 2 ? ', casi todas en HubSpot, donde la etapa «Levantamiento agendado» prácticamente no se usa' : ''}. </> : null}Fuente: historial de etapas de Kommo y HubSpot.</div>
      </>
    ), { alto: 9 }),
    W('pipeline', 'Cotizado vs vendido vs meta', (
      <>
        <div className="brow">
          <span className="l">Vendido</span>
          <Bullet value={monto} target={metaRango} expected={rit.esperado} label="Vendido" fmt={fmtMoney0} />
          <Cifra label={`Vendido ${fmtMoney0(monto)}`} onClick={() => ver('Vendido en el rango', fVentas(ventas), rango + FUENTE_VENTAS(corte))}><span className="v">{fmtMoney0(monto)}</span></Cifra>
          <span className="sub">meta {periodoV} {fmtMoney0(metaRango)} ({filas.length} asesor{filas.length === 1 ? '' : 'es'}) · <span className={'rt ' + rit.estado}>{rit.texto}</span><Info termino="Ritmo" />{monto < metaRango && ` · faltan ${fmtMoney0(metaRango - monto)}`}</span>
        </div>
        <div className="brow">
          <span className="l">Cotizado vigente</span>
          <Bullet value={cot.vigente} target={objetivoCot} label="Cotizado vigente" color="var(--c2)" fmt={fmtMoney0} />
          <Cifra label={`Cotizado vigente ${fmtMoney0(cot.vigente)}`} onClick={() => ver('Cotizado vigente', fCotizado(vigentes), `≤ ${corte.cotizado_dias} días · ${HOY}`)}><span className="v">{fmtMoney0(cot.vigente)}</span></Cifra>
          <span className="sub">objetivo {fmtMoney0(objetivoCot)} = {corte.cotizado_x}× la meta mensual ({fmtMoney0(metaMes)}) · {fmtN(cot.n)} lead{cot.n === 1 ? '' : 's'} con monto · foto de hoy<Info termino="Cotizado vigente" /></span>
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="small" style={{ fontWeight: 600 }}>Antigüedad del cotizado<Info termino="Antigüedad" /></div>
          <Antiguedad c={cot} leads={activosHoy} onVer={(t, f) => ver(t, f, HOY)} />
          {cot.viejo > 0 && <div className="small muted" style={{ marginTop: 6 }}>{fmtMoney(cot.viejo)} en {fmtN(cot.nViejo)} leads pasan de {corte.cotizado_dias} días: ya no cuentan como pipeline vivo.</div>}
        </div>
      </>
    ), { info: ['Pipeline 10×'], alto: 7 }),
    ...(ent ? [W('entrada', 'Entrada de leads · Kommo', (
      <div className="ent">
        <div className="hero">
          <Gauge pct={ent.tasa} label="asignados" size={190} color="var(--c2)" />
          <div className="l">Tasa de asignación<Info termino="Tasa de asignación" /></div>
          <div className="small muted">{fmtN(ent.asignados)} asignados de {fmtN(ent.llegaron)} que llegaron</div>
        </div>
        <div>
          <div className="kpi-row">
            {ENT.map((x) => <button type="button" key={x.k} className={x.cls + ' tbtn'} onClick={() => ver(`${x.l} · entrada Kommo`, fEntrada(ent.listas[x.k]), rango + ' · fecha = creación')} aria-label={`${x.l}: ${fmtN(ent[x.k])}. Ver leads`}><div className="n">{fmtN(ent[x.k])}</div><div className="l">{x.l}</div></button>)}
          </div>
          <div className="sbar ent-bar" role="img" aria-label={`De ${fmtN(ent.llegaron)} leads: ${fmtN(ent.sinRespuesta)} sin respuesta, ${fmtN(ent.sinRecibo)} respondieron sin recibo, ${fmtN(ent.conRecibo)} con recibo, ${fmtN(ent.perdidos)} perdidos`}>
            {ent.llegaron > 0 && <div style={{ width: '100%', display: 'flex', height: '100%' }}><i className="seg-neutral" style={{ width: pct(ent.sinRespuesta, ent.llegaron) + '%' }} /><i className="seg-warn" style={{ width: pct(ent.sinRecibo, ent.llegaron) + '%' }} /><i className="seg-ok" style={{ width: pct(ent.conRecibo, ent.llegaron) + '%' }} /><i className="seg-alert" style={{ width: pct(ent.perdidos, ent.llegaron) + '%' }} /></div>}
          </div>
          <div className="legend"><span><i style={{ background: 'var(--neutral)' }} aria-hidden="true" />Sin respuesta</span><span><i className="lg-warn" aria-hidden="true" />Respondieron sin recibo</span><span><i style={{ background: 'var(--c4)' }} aria-hidden="true" />Con recibo (incluye asignados)</span><span><i style={{ background: 'var(--warn)' }} aria-hidden="true" />Perdidos</span></div>
          <div className="small muted" style={{ marginTop: 8 }}>
            {filtros.asesor || filtros.equipo
              ? 'Leads de Kommo creados en el rango cuyo responsable actual es el asesor o equipo elegido. Los que aún no se asignan cuelgan de la cuenta admin y quedan fuera: aquí la tasa dice cuántos de sus leads ya están en Ventas o Hunting. Quita el filtro para ver la entrada completa.'
              : 'Leads de Kommo por fecha de creación en el rango, de todo el equipo. HubSpot no entra porque no registra recibo ni respuesta.'}
          </div>
        </div>
      </div>
    ), { span: 6, alto: 7 })] : []),
    W('embudo', 'Embudo de ventas por etapa', (
      <EmbudoCrm corte={corte} filtros={filtros} leads={leadsEmbudo} rango={rango} ver={ver} />
    ), { alto: 9, info: ['Embudo'] , base: 'asignacion' }),
    W('etapas', 'Monto cotizado y tiempo por etapa', (
      <EmbudoCrm corte={corte} filtros={filtros} leads={leadsEmbudo} rango={rango} ver={ver} vista="tabla" />
    ), { info: ['Monto cotizado', 'Tiempo promedio'], alto: 9 }),
    W('llamadas', 'Llamadas', (
      <div className="llam-grid">
        <LlamadasBar total={a.llamadas} ok={a.contestadas} no={a.sinContestar} onClick={() => verEv('Llamadas en el rango', 'llamada_ok', 'llamada_no')} />
        <Gauge pct={a.llamadas ? pct(a.contestadas, a.llamadas) : null} label="contestadas" size={180} />
      </div>
    ), { info: ['Llamadas'], alto: 4 , base: 'actividad' }),
    // Calidad de llamadas (calificador, Fase 3): la vara es la rúbrica de 14 preguntas; estándar = 4 ⭐ o más.
    // Solo existe cuando el corte trae llamadas calificadas (Supabase analítica).
    ...(corte.llamadas ? [W('calidad-llamadas', 'Calidad de llamadas', (() => {
      const cal = resumenLlamadas(llamadasFiltradas(corte, filtros))
      // Con menos de MIN_LLAMADAS la nota se mueve con cada llamada nueva (HALLAZGOS: no comparar con muestra chica):
      // esos asesores van al final y marcados, no encabezando la tabla con 3 ⭐ de una sola llamada.
      const MIN_LLAMADAS = 10
      const porAs = filas.filter((f) => f.calif.n > 0).sort((a, b) => Number(b.calif.n >= MIN_LLAMADAS) - Number(a.calif.n >= MIN_LLAMADAS) || (b.calif.pond ?? 0) - (a.calif.pond ?? 0))
      const verCal = (titulo: string, ls: typeof cal.llamadas) => verLlamadas(titulo, ls)
      return cal.n === 0 ? <div className="small muted">Sin llamadas calificadas en estas fechas.</div> : (
        <>
          <div className="kpi-row" style={{ marginBottom: 8 }}>
            <button type="button" className="e1 tbtn" onClick={() => verCal('Llamadas calificadas', cal.llamadas)} aria-label={`${fmtEstrellas(cal.pond)} promedio en ${fmtN(cal.n)} llamadas calificadas. Ver la lista`}><div className="n">{fmtEstrellas(cal.pond)}</div><div className="l">promedio · {fmtN(cal.n)} llamadas</div></button>
            <button type="button" className="e4 tbtn" onClick={() => verCal('Llamadas en estándar (4 ⭐ o más)', cal.llamadas.filter((x) => x.cumple))} aria-label={`${pct(cal.cumple, 1)}% de las llamadas en estándar. Ver la lista`}><div className="n">{pct(cal.cumple, 1)}%</div><div className="l">en estándar (4 ⭐ o más)</div></button>
            <button type="button" className="e5 tbtn" onClick={() => verCal('Llamadas con siguiente paso', cal.llamadas.filter((x) => x.sig_paso))} aria-label={`${pct(cal.sigPaso, 1)}% de las llamadas terminaron con siguiente paso. Ver la lista`}><div className="n">{pct(cal.sigPaso, 1)}%</div><div className="l">con siguiente paso</div></button>
          </div>
          <div className="small muted" style={{ marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center' }}>
            <span>Nota ponderada: siguiente paso ×3; cierre, objeciones y calificación ×2. Clic en un asesor abre sus llamadas con audio.</span>
            <a className="chip" href="playbook-calificacion.html" target="_blank" rel="noreferrer" title="Cómo se califica cada llamada: escala, etapas, estándar y rutina de revisión">ⓘ Cómo se califica · Playbook</a>
          </div>
          <div className="scrollx crece"><table className="ftable">
            <thead><tr><th scope="col">Asesor</th><th scope="col" className="num">⭐</th><th scope="col" className="num">Llamadas</th><th scope="col" className="num">En estándar</th><th scope="col" className="num">Con siguiente paso</th></tr></thead>
            <tbody>
              {porAs.map((f) => (
                <tr key={f.u.id}>
                  <td><button type="button" className="nbtn" aria-label={`${f.u.nombre}: ${fmtEstrellas(f.calif.pond)} en ${fmtN(f.calif.n)} llamadas. Ver la lista`} onClick={() => verCal(`Llamadas calificadas · ${f.u.nombre}`, f.calif.llamadas)}>{f.u.nombre}</button></td>
                  <td className="num">{fmtEstrellas(f.calif.pond)}{f.calif.n < MIN_LLAMADAS && <span className="muted" title={`Menos de ${MIN_LLAMADAS} llamadas: la nota cambia con cada llamada nueva`}> ·muestra chica</span>}</td><td className="num">{fmtN(f.calif.n)}</td>
                  <td className="num">{pct(f.calif.cumple, 1)}%</td><td className="num">{pct(f.calif.sigPaso, 1)}%</td>
                </tr>))}
            </tbody>
          </table></div>
        </>)
    })(), { info: ['Calidad de llamadas'], alto: 9, base: 'actividad' })] : []),
    // Eran un solo widget y Randall (5-sep) no veía la relación entre los dos: no la hay. Cada uno dice qué mide.
    W('contacto', 'Primer contacto', (
      <>
        <div className="small muted">Qué tan rápido se atiende un lead nuevo: horas entre la asignación y la primera llamada o tarea registrada (mediana).{mixto(corte) ? ' Solo Kommo.' : ''}</div>
        <div className="pc-hero" style={{ marginTop: 8 }}><span className="n">{horasPC}</span><span className="u">{unidadPC}</span></div>
        <div className="small muted">
          <button type="button" className="nbtn" onClick={() => ver('Leads con primer contacto registrado', filasDeLeads(pc.con.map((x) => x.lead), () => '', undefined, { label: 'Horas al primer contacto', de: (l) => redondear(pc.con.find((x) => x.lead.id === l.id)?.horas || 0) }), rango)}>{fmtN(pc.n)} leads con contacto registrado</button>
          {' · '}{fmtN(pc.en24)} en menos de 24 horas ({pct(pc.en24, pc.n)}%){' · '}
          <button type="button" className="nbtn" onClick={() => ver('Leads sin contacto tras un día asignados', filasDeLeads(pc.sin, () => 'Sin llamada ni tarea', undefined, { label: 'Días desde la asignación', de: (l) => diasDesde(l.asignacion) }), rango)}>{fmtN(pc.sinContacto)} sin contacto tras un día asignados</button>
        </div>
        {pc.n > 0 && (
          <div className="pc-dist" role="group" aria-label="Leads por tiempo al primer contacto">
            <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>¿Cuánto tardó el primer contacto?</div>
            {PC_TRAMOS.map((t) => { const xs = pc.con.filter((x) => t.ok(x.horas)); const mx = Math.max(1, ...PC_TRAMOS.map((u) => pc.con.filter((x) => u.ok(x.horas)).length)); return (
              <button type="button" className="pcd" key={t.l} aria-label={`${t.l}: ${fmtN(xs.length)} leads (${pct(xs.length, pc.n)}%). Ver leads`} disabled={!xs.length}
                onClick={() => ver(`Primer contacto ${t.l}`, filasDeLeads(xs.map((x) => x.lead), () => '', undefined, { label: 'Horas al primer contacto', de: (l) => redondear(xs.find((x) => x.lead.id === l.id)?.horas || 0) }), rango)}>
                <span className="l">{t.l}</span><span className="bar" aria-hidden="true"><i style={{ width: pct(xs.length, mx) + '%' }} /></span><span className="n">{fmtN(xs.length)} <span className="muted">{pct(xs.length, pc.n)}%</span></span>
              </button>) })}
          </div>
        )}
      </>
    ), { info: ['Primer contacto'], alto: 7 }),
    W('razones', 'Razones de descarte', (
      <>
        <div className="small muted" style={{ marginBottom: 6 }}>Por qué se pierden los leads: la razón registrada al descartar, de los descartes del rango. Mayúsculas y acentos distintos cuentan como la misma razón.</div>
        {!rz.length && <div className="muted">Sin descartes en el rango.</div>}
        <div className="rz">
          {rz.slice(0, 8).map((r) => (
            <div className="lr drill" key={r.razon} role="button" tabIndex={0} aria-label={`${r.razon}: ${fmtN(r.n)}. Ver leads`}
              onClick={() => ver(`Descartados · ${r.razon}`, filasDeLeads(r.leads, (l) => `Perdido · ${l.razon || 'sin razón'}`, (l) => l.cerrado), rango + ' · fecha = descarte')} onKeyDown={activar(() => ver(`Descartados · ${r.razon}`, filasDeLeads(r.leads, (l) => `Perdido · ${l.razon || 'sin razón'}`, (l) => l.cerrado), rango + ' · fecha = descarte'))}>
              <span>{r.razon}</span><span className="bar" aria-hidden="true"><i style={{ width: pct(r.n, rz[0].n) + '%' }} /></span><span><b>{fmtN(r.n)}</b> <span className="muted">{pct(r.n, rzTot)}%</span></span>
            </div>
          ))}
        </div>
        {rz.length > 8 && <div className="small muted" style={{ marginTop: 4 }}>+{rz.length - 8} razones más</div>}
      </>
    ), { info: ['Razón de descarte'], desde: 'contacto', alto: 7 , base: 'actividad' }),
    // La matriz y la tabla son dos widgets (Randall 6-sep): cada uno se mueve y se estira por su lado, como Embudo y Monto por etapa.
    W('perfiles', 'Perfiles de vendedores', (
      filas.length < 2 ? <div className="muted">Se necesitan al menos dos asesores con actividad en el rango.</div> : (
        <>
          <div className="perfil-chart">
            <Scatter
              pts={perf.pts.map((p) => ({ x: p.actividad, y: p.vendido, label: iniciales(p.u.nombre), title: `${p.u.nombre}: ${fmtN(p.actividad)} actividades, ${fmtMoney0(p.vendido)} vendido (${PERFIL_LABEL[p.perfil]})`, cls: PERFIL_CLS[p.perfil] }))}
              xMed={perf.medAct} yMed={perf.medVend} xLabel="actividad registrada" yLabel="vendido" quad={['Revisar', 'Mantener', 'Salida', 'Capacitar']}
              onPunto={(idx) => { if (idx.length === 1) onFicha(perf.pts[idx[0]].u.id); else setGrupo(idx.map((i) => perf.pts[i])) }} />
            {grupo && (
              <div className="grupo-sel" role="group" aria-label="Asesores en el mismo punto">
                <span className="muted">{grupo.length} asesores en el mismo punto. Abrir ficha de:</span>
                {grupo.map((p) => <button type="button" key={p.u.id} className="nbtn" onClick={() => { setGrupo(null); onFicha(p.u.id) }}>{p.u.nombre}</button>)}
                <button type="button" className="wbtn" aria-label="Cerrar la lista" title="Cerrar" onClick={() => setGrupo(null)}>×</button>
              </div>
            )}
          </div>
          {/* Tarjeta de explicación (Randall 6-sep: «ponlo en una tarjeta para tenerlo en cuenta»). */}
          <div className="nota-card" role="note"><b>Cómo se decide «baja actividad».</b> Actividad = llamadas + tareas terminadas + cotizaciones + levantamientos que el asesor registró en las fechas elegidas. La línea de cada eje es el punto medio del grupo: hoy {fmtN(perf.medAct)} actividades y {fmtMoney0(perf.medVend)} vendido. Quien queda en o abajo de esa línea es «baja actividad» o «baja venta». Es relativo: la mitad del grupo siempre queda abajo y cambia con las fechas y con el filtro de equipo; no hay un estándar fijo. Clic en una bolita abre la ficha del asesor.</div>
        </>
      )
    ), { info: ['Perfil'], cls: 'wperf', span: 3, alto: 10 }),
    W('perfiles-tabla', 'Tabla de perfiles', (
      filas.length < 2 ? <div className="muted">Se necesitan al menos dos asesores con actividad en el rango.</div> : (
        <div className="perfil-tabla">
          <table className="ftable" aria-label="Asesores por perfil">
            <thead><tr><th scope="col">Asesor</th><th scope="col">Perfil</th><th scope="col" className="num">Actividad</th><th scope="col" className="num">Vendido</th></tr></thead>
            <tbody>
              {[...perf.pts].sort((a, b) => PERFILES.indexOf(a.perfil) - PERFILES.indexOf(b.perfil) || b.vendido - a.vendido).map((x) => (
                <tr key={x.u.id}>
                  <td><span className={'ini ' + PERFIL_CLS[x.perfil]} aria-hidden="true">{iniciales(x.u.nombre)}</span><button type="button" className="nbtn" onClick={() => onFicha(x.u.id)} aria-label={`Abrir ficha de ${x.u.nombre}`}>{x.u.nombre}</button></td>
                  <td><i className={'pdot ' + PERFIL_CLS[x.perfil]} aria-hidden="true" /><span title={PERFIL_LABEL[x.perfil]}>{PERFIL_CORTO[x.perfil]}</span></td>
                  <td className="num">{fmtN(x.actividad)}</td>
                  <td className="num">{fmtMoney0(x.vendido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    ), { info: ['Perfil'], cls: 'wperf', span: 3, alto: 10, desde: 'perfiles' }),
  ]
  return widgets
}

export function AdminDashboard({ corte, filtros, onFicha, puedeEditar = true }: { corte: Corte; filtros: Filtros; onFicha: (uid: string) => void; puedeEditar?: boolean }) {
  // Punto agrupado («×n») de la dispersión: lista inline para elegir a quién abrir; se limpia al cambiar filtros.
  const [grupo, setGrupo] = useState<PuntoPerfil[] | null>(null)
  useEffect(() => setGrupo(null), [filtros])
  const [drill, setDrill] = useState<Drill | null>(null)
  const ver = (titulo: string, filas: Fila[], sub?: string) => setDrill({ titulo, filas, sub })
  // Llamadas calificadas: el drill trae «Notas» y abre las 14 preguntas de una llamada (mismo modal que en Asesores).
  const [llamada, setLlamada] = useState<Llamada | null>(null)
  const verLlamadas = (titulo: string, ls: Llamada[]) => setDrill(drillLlamadas(titulo, ls, corte, filtros.rango.label, setLlamada))
  // Fechas propias por widget (Randall 10-sep: «si un widget siempre debe mostrar la info histórica,
  // que la muestre y no conflictúe con el date range del tablero»). Sin fechas propias se sigue al tablero.
  const defaults = useMemo(() => defaultsDe(corte, RANGOS_ADMIN), [corte])
  const { rangos: rangosCuenta, fijarRango } = useRangos('admin', defaults.por, defaults.desde)
  // Configuración › Fechas propias por widget: el widget apagado sigue al calendario de arriba (Randall 16-sep).
  const permitido = useMemo(() => fechasPermitidas(corte), [corte])
  const rangos = useMemo(() => Object.fromEntries(Object.entries(rangosCuenta).filter(([id]) => permitido(id))), [permitido, rangosCuenta])
  const conFechas = permitido('g:*')
  const desdeMaximo = useMemo(() => { let m = corte.desde; for (const l of corte.leads) { if (l.asignacion && l.asignacion < m) m = l.asignacion; if (l.creado && l.creado < m) m = l.creado } return m }, [corte])
  // «foto» = Foto de hoy: rango Máximo (todo) y la marca `foto` para que embudo y etapas miren lo activo hoy.
  const conRango = (p: RangoWidget): Filtros => ({ ...filtros, rango: preset(p === 'foto' ? 'maximo' : p, new Date(), desdeMaximo), foto: p === 'foto' })
  // «Este mes» / «Máximo»: el nombre del periodo de arriba, para que la etiqueta de cada widget diga
  // qué está mirando aunque siga al tablero (Randall 10-sep, como los widgets de HubSpot).
  const nombreTablero = filtros.rango.label.includes(': ') ? filtros.rango.label.split(': ')[0] : 'Fechas elegidas'
  const fechasDe = (p?: RangoWidget) => { if (p === 'foto') return 'lo activo hoy, sin fechas'; const r = p ? conRango(p).rango : filtros.rango; return etiquetaRango(null, r.ini, r.fin) }
  const filtrosDe = (id: string): Filtros => (rangos[id] ? conRango(rangos[id]) : filtros)
  // Lo que el constructor necesita para dejar elegir las fechas de la gráfica que se está creando.
  const fechasCtor = conFechas ? { de: (id: string) => rangos['g:' + id], filtros: (id: string) => filtrosDe('g:' + id), fijar: (id: string, p: RangoWidget | null) => fijarRango('g:' + id, p) } : undefined

  const construir = (f: Filtros, dd: Datos): Widget[] => widgetsTablero(corte, f, dd, { ver, abrir: setDrill, verLlamadas, onFicha, grupo, setGrupo })

  // El tablero, con las fechas de arriba. Los widgets que tienen fechas propias se sacan de un
  // segundo armado con SUS fechas: uno por periodo distinto, no uno por widget.
  const base = useMemo(() => construir(filtros, datosDe(corte, filtros)), [corte, filtros, grupo])   // eslint-disable-line react-hooks/exhaustive-deps
  const aparte = useMemo(() => {
    const m = new Map<string, Widget[]>()
    for (const p of new Set(Object.values(rangos))) { const f = conRango(p); m.set(p, construir(f, datosDe(corte, f))) }
    return m
  }, [corte, filtros, rangos, grupo])   // eslint-disable-line react-hooks/exhaustive-deps
  const widgets = useMemo(() => base.map((w) => {
    const p = rangos[w.id]
    return (p && aparte.get(p)?.find((x) => x.id === w.id)) || w
  }), [base, aparte, rangos])

  return (
    <>
      <div className="hint" style={{ marginBottom: 8 }}>Clic en cualquier cifra, barra o renglón abre la lista de registros detrás, con liga a Kommo o HubSpot.</div>
      <WidgetGrid clave="admin" compartible widgets={ORDEN_ADMIN.map((id) => widgets.find((w) => w.id === id)).filter((w): w is Widget => !!w).concat(widgets.filter((w) => !ORDEN_ADMIN.includes(w.id)))}
        bloqueado={!puedeEditar}
        fechas={{ clave: 'admin', por: rangos, fijar: fijarRango, tablero: nombreTablero, fechas: fechasDe, permitido }}
        taller={{
          render: (g: Grafica) => <GraficaLibre corte={corte} filtros={filtrosDe('g:' + g.id)} g={g} onDrill={setDrill} />,
          galeria: (p) => <Galeria corte={corte} filtros={filtros} quitados={p.quitados} enTablero={p.enTablero} onIr={p.onIr} onAgregar={p.onAgregar} onCrear={p.onCrear} onClose={p.onClose} fechas={fechasCtor} />,
          editor: (p) => <Editor corte={corte} filtros={filtrosDe('g:' + p.g.id)} g={p.g} rango={rangos['g:' + p.g.id]} onRango={conFechas ? (x) => fijarRango('g:' + p.g.id, x) : undefined} onGuardar={p.onGuardar} onClose={p.onClose} />,
        }} />
      {drill && <DrillModal d={drill} onClose={() => setDrill(null)} />}
      {llamada && <LlamadaModal x={llamada} onClose={() => setLlamada(null)} />}
    </>
  )
}

// ---------------------------------------------------------------- Asesores
interface Pop { fila: FilaAsesor; x: number; y: number }
interface Det { title: string; total: number; rows: DetRow[]; anchor: DOMRect }
type Key = 'nombre' | 'vendido' | 'cotizado' | 'leads' | 'llamadas' | 'tareas' | 'pc' | 'cotiz' | 'desc' | 'lev' | 'equipo' | 'tipo' | 'ventas' | 'estanc' | 'sintarea'
  | 'asignados' | 'totales' | 'conversion' | 'perdida' | 'ticket' | 'cumpl' | 'actividad' | 'cal_pond' | 'cal_estandar' | 'cal_sigpaso'
const valor = (f: FilaAsesor, k: Key): number | string =>
  k === 'nombre' ? f.u.nombre : k === 'vendido' ? f.montoVentas : k === 'cotizado' ? f.cotizado.vigente : k === 'leads' ? f.leadsActivos.length
    : k === 'llamadas' ? f.llamadas : k === 'tareas' ? f.tareasCompletadas : k === 'pc' ? f.pcVencidas
      : k === 'cotiz' ? f.cotizaciones : k === 'desc' ? f.descartes : k === 'lev' ? f.levantamientos
        : k === 'equipo' ? f.u.zona : k === 'tipo' ? f.tipo : k === 'ventas' ? f.ventas : k === 'estanc' ? f.estancados : k === 'sintarea' ? f.sinTarea
          : k === 'asignados' || k === 'totales' ? f.asignados.length
            : k === 'conversion' ? (f.asignadosVentas ? f.ventas / f.asignadosVentas : -1)
              : k === 'perdida' ? (f.asignados.length ? f.perdidos / f.asignados.length : -1)
                : k === 'ticket' ? (f.ventas ? f.montoVentas / f.ventas : -1)
                  : k === 'cumpl' ? (f.metaRango ? f.montoVentas / f.metaRango : -1)
                    : k === 'cal_pond' ? (f.calif.pond ?? -1) : k === 'cal_estandar' ? (f.calif.n ? f.calif.cumple : -1)
                      : k === 'cal_sigpaso' ? (f.calif.n ? f.calif.sigPaso : -1) : actividadDe(f)

export function Asesores({ corte, filtros, onFicha }: { corte: Corte; filtros: Filtros; onFicha: (uid: string) => void }) {
  const [sort, setSort] = useState<Sort<Key>>({ key: 'vendido', dir: 'desc' })
  const filas = useMemo(() => {
    const s = sort.dir === 'asc' ? 1 : -1
    return porAsesor(corte, filtros).sort((a, b) => {
      const x = valor(a, sort.key), y = valor(b, sort.key)
      const d = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)
      return d * s || b.montoVentas - a.montoVentas
    })
  }, [corte, filtros, sort])
  const onSort = (k: Key) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'nombre' ? 'asc' : 'desc' }))
  const maxLeads = Math.max(1, ...filas.map((f) => f.leadsActivos.length))
  const maxLlam = Math.max(1, ...filas.map((f) => f.llamadas))
  const maxTar = Math.max(1, ...filas.map((f) => f.tareasCompletadas + f.tareasVencidas + f.sinTarea))
  const maxAsig = Math.max(1, ...filas.map((f) => f.asignados.length))
  const maxAct = Math.max(1, ...filas.map(actividadDe))
  const [pop, setPop] = useState<Pop | null>(null)
  const [det, setDet] = useState<Det | null>(null)
  const [drill, setDrill] = useState<Drill | null>(null)
  // Quitar de la asignación (Randall 5-sep): estado desde el servidor; undefined = cargando, null = no se pudo leer.
  const [sanc, setSanc] = useState<Sanciones | null | undefined>(undefined)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})
  useEffect(() => { cargarSanciones().then(setSanc).catch(() => setSanc(null)) }, [])
  const accionar = async (u: Usuario, accion: 'quitar' | 'reactivar') => {
    const quePasa = [u.ids.kommo != null ? 'Kommo: sin leads nuevos hasta las 10:00 del día siguiente (el corte automático reevalúa).' : '', u.ids.hubspot != null ? 'HubSpot: sale de su equipo de ventas hasta que lo reactives.' : ''].filter(Boolean).join('\n')
    const motivo = accion === 'quitar' ? window.prompt(`¿Quitar a ${u.nombre} de la asignación de leads?\n${quePasa}\n\nMotivo (opcional):`, '') : (window.confirm(`¿Reactivar a ${u.nombre} en la asignación de leads?`) ? '' : null)
    if (motivo === null) return
    setOcupado(u.id)
    try {
      const r = await aplicarSancion(u.id, accion, motivo)
      setSanc(r.estado)
      setMsg((m) => ({ ...m, [u.id]: r.resultado.avisos.length ? r.resultado.avisos.join(' · ') : (accion === 'quitar' ? 'Quitado de la asignación.' : 'Reactivado.') }))
    } catch (e) {
      setMsg((m) => ({ ...m, [u.id]: 'No se pudo: ' + (e instanceof Error ? e.message : String(e)) }))
    } finally { setOcupado(null) }
  }
  const ver = (titulo: string, filas: Fila[], sub?: string) => { setDet(null); setDrill({ titulo, filas, sub }) }
  const rango = filtros.rango.label
  // Llamadas calificadas (calificador-llamadas): el drill lista sus llamadas del rango con audio y nota; «Notas» abre las 14 preguntas.
  const [llamada, setLlamada] = useState<Llamada | null>(null)
  const verLlamadas = (f: FilaAsesor, titulo: string) => { setDet(null); setDrill(drillLlamadas(`${titulo} · ${f.u.nombre}`, f.calif.llamadas, corte, rango, setLlamada)) }

  // Junto al cursor (offset 14 px); si se saldría por la derecha o por abajo, voltea.
  const abrir = (fila: FilaAsesor, cx: number, cy: number) => {
    const W = 370, H = Math.min(560, window.innerHeight - 16)
    let x = cx + 14, y = cy + 14
    if (x + W > window.innerWidth - 8) x = Math.max(8, cx - 14 - W)
    if (y + H > window.innerHeight - 8) y = Math.max(8, Math.min(cy - 14 - H, window.innerHeight - 8 - H))
    setDet(null); setPop({ fila, x, y })
  }
  // Desgloses de las cifras (Randall 6-sep, img 2/4): la misma ventana que Llamadas y Tareas.
  const porId = useMemo(() => new Map(corte.leads.map((l) => [l.id, l])), [corte])
  const leadsDe = (evs: Evento[]) => { const vistos = new Set<string>(); const out: Lead[] = []; for (const e of evs) { const l = porId.get(e.lead); if (l && !vistos.has(l.id)) { vistos.add(l.id); out.push(l) } } return out }
  const estadoHoy = (l: Lead) => (l.funnel === 5 ? 'Ganado' : l.funnel === 0 ? 'Perdido' : l.etapa)
  /** Por dónde va hoy cada lead cotizado / con levantamiento: dice qué pasó después. */
  const porEstado = (que: string, evs: Evento[], f: FilaAsesor, cuando: (l: Lead) => number): DetRow[] => {
    const g = new Map<string, Lead[]>()
    for (const l of leadsDe(evs)) g.set(estadoHoy(l), [...(g.get(estadoHoy(l)) || []), l])
    const rows: DetRow[] = [...g.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, xs]) => ({ label: `Hoy en ${k}`, val: xs.length, onVer: () => ver(`${que} · ${f.u.nombre} · hoy en ${k}`, filasDeLeads(xs, () => '', cuando), rango) }))
    const suma = rows.reduce((a, r) => a + r.val, 0), total = evs.length
    if (total > suma) rows.push({ label: 'Sin detalle del lead', val: total - suma })
    return rows
  }
  const filasDescartes = (f: FilaAsesor, evs: Evento[]): DetRow[] => {
    const rs = razones(corte, evs), top = rs.slice(0, 6), resto = rs.slice(6)
    const rows: DetRow[] = top.map((r) => ({ label: r.razon, val: r.n, onVer: () => ver(`Descartados · ${r.razon} · ${f.u.nombre}`, filasDeLeads(r.leads, (l) => `Perdido · ${l.razon || 'sin razón'}`, (l) => l.cerrado), rango + ' · fecha = descarte') }))
    if (resto.length) rows.push({ label: `Otras ${resto.length} razones`, val: resto.reduce((a, r) => a + r.n, 0), onVer: () => ver(`Descartados · otras razones · ${f.u.nombre}`, filasDeLeads(resto.flatMap((r) => r.leads), (l) => `Perdido · ${l.razon || 'sin razón'}`, (l) => l.cerrado), rango + ' · fecha = descarte') })
    const suma = rows.reduce((a, r) => a + r.val, 0)
    if (evs.length > suma) rows.push({ label: 'Sin detalle del lead', val: evs.length - suma })
    return rows
  }
  /** Primer contacto vencido, por cuánto llevan asignados: entre más viejo, peor. */
  const filasPc = (f: FilaAsesor): DetRow[] => {
    const ls = f.leadsActivos.filter((l) => l.pc_vencida)
    const tramos: [string, (d: number) => boolean][] = [['Asignados hace 1 a 3 días', (d) => d <= 3], ['Asignados hace 4 a 7 días', (d) => d > 3 && d <= 7], ['Asignados hace más de 7 días', (d) => d > 7]]
    return tramos.map(([label, ok]) => ({ label, xs: ls.filter((l) => ok(diasDesde(l.asignacion))) })).filter((t) => t.xs.length)
      .map((t) => ({ label: t.label, val: t.xs.length, onVer: () => ver(`Primer contacto vencido · ${f.u.nombre} · ${t.label.toLowerCase()}`, filasDeLeads(t.xs, () => '', undefined, { label: 'Días desde la asignación', de: (l) => diasDesde(l.asignacion) }), rango) }))
  }
  const detalle = (e: SyntheticEvent<HTMLElement>, title: string, total: number, rows: DetRow[]) => {
    e.stopPropagation()
    setPop(null); setDet({ title, total, rows, anchor: e.currentTarget.getBoundingClientRect() })
  }

  const th = { sort, onSort }
  const COLS: ColDef<FilaAsesor>[] = useMemo(() => [
    { id: 'nombre', label: 'Asesor', ancho: 190, fecha: 'ninguna', fija: true,
      celda: (f) => (<td><div className="who"><div className={avatarCls(f.u)} title={subAsesor(corte, f.u)} aria-hidden="true">{iniciales(f.u.nombre)}</div><div><div className="nm"><button type="button" className="nbtn" aria-haspopup="dialog" aria-label={`Ver resumen de ${f.u.nombre}`} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); abrir(f, r.right, r.bottom) }}>{f.u.nombre}</button><TagTipo c={corte} u={f.u} />{rolDestacado(f.u.rol) && <span className="tag rol" title="Rol en Kommo">{rolNombre(f.u.rol)}</span>}</div><div className="sub">{f.ventas} venta{f.ventas === 1 ? '' : 's'} · meta {fmtMoney0(f.metaMes)}/mes</div></div></div></td>) },
    { id: 'asignados', label: 'Leads asignados', ancho: 155, fecha: 'asignacion', info: 'Leads asignados',
      celda: (f) => (<td><div className="mc">
        <div className="v">{fmtN(f.asignados.length)}</div>
        <StackedBar segs={[{ val: f.asignados.length, cls: 'seg-comp' }]} total={f.asignados.length} max={maxAsig}
          title={`${fmtN(f.asignados.length)} leads asignados a ${f.u.nombre} en estas fechas. Ver la lista`}
          onClick={() => ver(`Leads asignados · ${f.u.nombre}`, fLeads(f.asignados), rango + ' · fecha = asignación')} />
        <div className="c">{f.asignados.length ? `${pct(f.ganados, f.asignados.length)}% ya cerró` : 'ninguno en el periodo'}</div>
        <div className="c">asignados en estas fechas</div>
      </div></td>) },
    { id: 'totales', label: 'Leads totales', ancho: 175, fecha: 'asignacion', info: 'Leads asignados',
      celda: (f) => (<td><div className="mc">
        <div className="v">{fmtN(f.asignados.length)}</div>
        <StackedBar segs={[{ val: f.asignados.length - f.ganados - f.perdidos, cls: 'seg-comp' }, { val: f.ganados, cls: 'seg-ok' }, { val: f.perdidos, cls: 'seg-alert' }]} total={f.asignados.length} max={maxAsig}
          title={`Leads asignados a ${f.u.nombre}: ${f.asignados.length - f.ganados - f.perdidos} activos, ${f.ganados} ganados, ${f.perdidos} descartados. Abrir detalle`}
          onClick={(e) => detalle(e, 'Leads asignados · ' + f.u.nombre, f.asignados.length, [
            { label: 'Activos', val: f.asignados.length - f.ganados - f.perdidos, onVer: () => ver(`Leads activos · ${f.u.nombre}`, fLeads(f.asignados.filter(vivo)), rango) },
            { label: 'Ganados', val: f.ganados, onVer: () => ver(`Ganados · ${f.u.nombre}`, fVentas(f.asignados.filter((l) => l.funnel === 5)), rango) },
            { label: 'Descartados', val: f.perdidos, onVer: () => ver(`Descartados · ${f.u.nombre}`, filasDeLeads(f.asignados.filter((l) => l.funnel === 0), (l) => l.razon || 'sin razón', (l) => l.cerrado), rango) }])} />
        <div className="c">{fmtN(f.asignados.length - f.ganados - f.perdidos)} activos · {fmtN(f.ganados)} ganados</div>
        <div className="c">{fmtN(f.perdidos)} descartados</div>
      </div></td>) },
    // Misma regla que la cifra «Conversión» del tablero y el glosario: ventas de la app entre leads asignados
    // (antes contaba ganados del CRM y daba 0 % donde la cifra decía 2 %).
    { id: 'conversion', label: 'Conversión', ancho: 130, fecha: 'asignacion', cnt: true, oculta: true, info: 'Conversión',
      celda: (f) => (<td className="cnt">{f.asignadosVentas ? `${pct(f.ventas, f.asignadosVentas)}%` : '—'}</td>) },
    { id: 'perdida', label: 'Tasa de pérdida', ancho: 155, fecha: 'asignacion', cnt: true, oculta: true, info: 'Tasa de pérdida',
      celda: (f) => (<td className="cnt">{f.asignados.length ? `${pct(f.perdidos, f.asignados.length)}%` : '—'}</td>) },
    { id: 'ticket', label: 'Ticket promedio', ancho: 160, fecha: 'cierre', cnt: true, oculta: true,
      celda: (f) => (<td className="cnt">{f.ventas ? fmtMoney0(f.montoVentas / f.ventas) : '—'}</td>) },
    { id: 'cumpl', label: 'Cumplimiento', ancho: 130, fecha: 'cierre', cnt: true, oculta: true, info: 'Cumplimiento',
      celda: (f) => (<td className="cnt">{pct(f.montoVentas, f.metaRango)}%</td>) },
    { id: 'actividad', label: 'Actividad total', ancho: 190, fecha: 'actividad', oculta: true,
      celda: (f) => (<td><div className="mc">
        <div className="v">{fmtN(actividadDe(f))}</div>
        {/* Partida por TIPO (Randall 9-sep): tareas de seguimiento, llamadas contestadas, llamadas sin
            contestar, cotizaciones y levantamientos: los MISMOS sumandos de `actividadDe`. Faltaban las
            cotizaciones y el desglose no cuadraba con el total (Randall 15-sep: «6 + 8 no da 16»). */}
        <StackedBar segs={[{ val: f.tareasCompletadas, cls: 'seg-comp' }, { val: f.contestadas, cls: 'seg-ok' }, { val: f.sinContestar, cls: 'seg-warn' }, { val: f.cotizaciones, cls: 'seg-c3' }, { val: f.levantamientos, cls: 'seg-neutral' }]}
          total={actividadDe(f)} max={maxAct}
          title={`Actividad de ${f.u.nombre}: ${f.tareasCompletadas} tareas completadas, ${f.contestadas} llamadas contestadas, ${f.sinContestar} sin contestar, ${f.cotizaciones} cotizaciones, ${f.levantamientos} levantamientos. Abrir detalle`}
          onClick={(e) => detalle(e, 'Actividad · ' + f.u.nombre, actividadDe(f), [
            { label: 'Tareas de seguimiento completadas', val: f.tareasCompletadas, onVer: () => ver(`Tareas completadas · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'tarea')), rango) },
            { label: 'Llamadas contestadas', val: f.contestadas, onVer: () => ver(`Llamadas contestadas · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'llamada_ok')), rango) },
            { label: 'Llamadas sin contestar', val: f.sinContestar, onVer: () => ver(`Llamadas sin contestar · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'llamada_no')), rango) },
            { label: 'Cotizaciones entregadas', val: f.cotizaciones, onVer: () => ver(`Cotizaciones · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'cotizacion')), rango) },
            { label: 'Levantamientos solicitados', val: f.levantamientos, onVer: () => ver(`Levantamientos · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'levantamiento')), rango) }])} />
        <div className="c">{fmtN(f.tareasCompletadas)} tareas · {fmtN(f.llamadas)} llamadas</div>
        <div className="c">{fmtN(f.cotizaciones)} cotizaciones · {fmtN(f.levantamientos)} levantamientos</div>
      </div></td>) },
    { id: 'vendido', label: 'Vendido', ancho: 170, fecha: 'cierre', info: 'Vendido',
      celda: (f) => (<td><div className="mc">
                          <button type="button" className="v nbtn" aria-label={`${fmtMoney0(f.montoVentas)} vendidos por ${f.u.nombre}. Ver las ventas`} onClick={() => ver(`Vendido · ${f.u.nombre}`, fVentas(ventasFiltradas(corte, { ...filtros, asesor: f.u.id })), rango + FUENTE_VENTAS(corte))}>{fmtMoney0(f.montoVentas)}</button>
                          <Bullet sm value={f.montoVentas} target={f.metaRango} expected={f.esperado} label={'Vendido de ' + f.u.nombre} fmt={fmtMoney0} />
                          <div className="c" title={`${pct(f.montoVentas, f.metaRango)}% de la meta de ${fmtMoney0(f.metaRango)}`}>{pct(f.montoVentas, f.metaRango)}% de {fmtMoney0(f.metaRango)}</div>
                          <div className={'c rt ' + f.ritmo.estado} title={f.ritmo.corto}>{f.ritmo.corto}</div>
                        </div></td>) },
    { id: 'cotizado', label: 'Cotizado vigente', ancho: 185, fecha: 'hoy', info: 'Cotizado vigente',
      celda: (f) => (<td><div className="mc">
                          {/* Avance contra el objetivo 10× (Randall 6-sep): «si lleva 1.4 M, qué tanto le falta para el factor 10×». */}
                          <button type="button" className="v nbtn" aria-label={`${fmtMoney0(f.cotizado.vigente)} cotizados y vigentes de ${f.u.nombre}. Ver los leads`} onClick={() => ver(`Cotizado vigente · ${f.u.nombre}`, fCotizado(vigentesDe(corte, f)), `cotizados hace ${corte.cotizado_dias} días o menos`)}>{fmtMoney0(f.cotizado.vigente)}</button>
                          <Bullet sm value={f.cotizado.vigente} target={f.metaMes * corte.cotizado_x} label={'Cotizado vigente de ' + f.u.nombre + ' contra el objetivo ' + corte.cotizado_x + '×'} color="var(--c2)" fmt={fmtMoney0} />
                          <div className="c" title={`${pct(f.cotizado.vigente, f.metaMes * corte.cotizado_x)}% del objetivo ${corte.cotizado_x}× la meta mensual (${fmtMoney0(f.metaMes * corte.cotizado_x)})`}>{pct(f.cotizado.vigente, f.metaMes * corte.cotizado_x)}% de {fmtMoney0(f.metaMes * corte.cotizado_x)} ({corte.cotizado_x}×)</div>
                          <div className="c" title={f.cotizado.viejo > 0 ? `${fmtMoney(f.cotizado.viejo)} cotizados hace más de ${corte.cotizado_dias} días: ya no cuentan` : `Objetivo: ${corte.cotizado_x} veces la meta mensual`}>{f.cotizado.viejo > 0 ? `+${fmtMoney(f.cotizado.viejo)} viejo` : `objetivo ${corte.cotizado_x}× la meta`}</div>
                        </div></td>) },
    { id: 'leads', label: 'Leads activos', ancho: 200, fecha: 'hoy', info: 'Leads activos',
      celda: (f) => { const e = estadosDe(f); return (<td><div className="mc">
                          <button type="button" className="v nbtn" title={`Suma del precio cotizado a sus leads activos: ${fmtMoney0(f.presupuesto)}`} aria-label={`${fmtN(f.leadsActivos.length)} leads activos de ${f.u.nombre}, ${fmtMoney0(f.presupuesto)} en presupuesto. Ver la lista`} onClick={() => ver(`Leads activos · ${f.u.nombre}`, fLeads(f.leadsActivos), HOY)}>{fmtN(f.leadsActivos.length)}</button>
                          {/* Barra por estado (Randall 15-sep: «no deja ver los sin tarea y desatendidos»): cada lead cae en UN
                              tramo, de lo peor a lo mejor, así que la barra suma exactamente los activos. */}
                          <StackedBar segs={ESTADO_ACTIVO.map((s) => ({ val: e[s.id].length, cls: s.cls }))} total={f.leadsActivos.length} max={maxLeads}
                            title={`Leads activos de ${f.u.nombre}: ${ESTADO_ACTIVO.map((s) => `${e[s.id].length} ${s.label.toLowerCase()}`).join(', ')}. Abrir detalle`}
                            onClick={(ev) => detalle(ev, 'Leads activos · ' + f.u.nombre, f.leadsActivos.length, ESTADO_ACTIVO.map((s) => ({ label: s.label, val: e[s.id].length, onVer: () => ver(`${s.label} · ${f.u.nombre}`, fLeads(e[s.id]), HOY) })))} />
                          <div className="c" title={`${fmtN(e.pc.length)} sin primer contacto · ${fmtN(e.sin_tarea.length)} sin tarea pendiente`}>{fmtN(e.pc.length)} sin 1er contacto · {fmtN(e.sin_tarea.length)} sin tarea</div>
                          <div className="c" title={`${fmtN(e.estancado.length)} con tarea pero sin actividad del asesor en más de ${ESTANCADO_DIAS} días (la columna «Estancados» suma también los que no tienen tarea) · ${fmtN(e.al_dia.length)} al día`}>{fmtN(e.estancado.length)} estancados · {fmtN(e.al_dia.length)} al día</div>
                        </div></td>) } },
    { id: 'llamadas', label: 'Llamadas', ancho: 155, fecha: 'actividad', info: 'Llamadas',
      celda: (f) => (<td><div className="mc">
                          <button type="button" className="v nbtn" aria-haspopup="dialog" aria-label={`${fmtN(f.llamadas)} llamadas de ${f.u.nombre}: ${f.contestadas} contestadas, ${f.sinContestar} sin contestar. Abrir detalle`}
                            onClick={(e) => detalle(e, 'Llamadas · ' + f.u.nombre, f.llamadas, [
                              { label: 'Contestadas', val: f.contestadas, onVer: () => ver(`Llamadas contestadas · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'llamada_ok')), rango) },
                              { label: 'Sin contestar', val: f.sinContestar, onVer: () => ver(`Llamadas sin contestar · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'llamada_no')), rango) }])}>{fmtN(f.llamadas)}</button>
                          <StackedBar segs={[{ val: f.contestadas, cls: 'seg-comp' }, { val: f.sinContestar, cls: 'seg-warn' }]} total={f.llamadas} max={maxLlam}
                            title={`Llamadas de ${f.u.nombre}: ${f.contestadas} contestadas, ${f.sinContestar} sin contestar`} />
                          <div className="c">{fmtN(f.contestadas)} contestadas</div>
                          <div className="c">{fmtN(f.sinContestar)} sin contestar</div>
                        </div></td>) },
    { id: 'tareas', label: 'Tareas', ancho: 180, fecha: 'actividad', info: 'Tareas',
      celda: (f) => (<td><div className="mc">
                          <button type="button" className="v nbtn" aria-haspopup="dialog" aria-label={`${fmtN(f.tareasCompletadas)} tareas completadas de ${f.u.nombre}; hoy ${f.tareasVencidas} vencidas y ${f.sinTarea} leads sin tarea. Abrir detalle`}
                            onClick={(e) => detalle(e, 'Tareas · ' + f.u.nombre, totTareas(f), [
                              { label: 'Completadas', val: f.tareasCompletadas, onVer: () => ver(`Tareas completadas · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'tarea')), rango) },
                              { label: 'Vencidas (hoy)', val: f.tareasVencidas, onVer: () => ver(`Leads con tareas vencidas · ${f.u.nombre}`, filasDeLeads(f.leadsActivos.filter((l) => l.tareas_vencidas > 0), () => '', undefined, { label: 'Tareas vencidas', de: (l) => l.tareas_vencidas }), HOY) },
                              { label: 'Leads sin tarea (hoy)', val: f.sinTarea, onVer: () => ver(`Leads sin tarea · ${f.u.nombre}`, fLeads(f.leadsActivos.filter((l) => l.sin_tarea)), HOY) }])}>{fmtN(totTareas(f))}</button>
                          {/* La barra sí pinta las vencidas en rojo y los sin tarea rayados, como dice la leyenda del pie
                              (Randall 15-sep: «no sale en la barra de color rojo los vencidos»); el número sigue siendo
                              las completadas del periodo. */}
                          <StackedBar segs={[{ val: f.tareasCompletadas, cls: 'seg-comp' }, { val: f.tareasVencidas, cls: 'seg-alert' }, { val: f.sinTarea, cls: 'seg-empty' }]} total={f.tareasCompletadas + f.tareasVencidas + f.sinTarea} max={maxTar}
                            title={`Tareas de ${f.u.nombre}: ${f.tareasCompletadas} completadas en el periodo; hoy ${f.tareasVencidas} vencidas y ${f.sinTarea} leads sin tarea`} />
                          <div className="c">completadas {rango}</div>
                          <div className="c" title={`Foto de hoy, sin importar las fechas: ${fmtN(f.tareasVencidas)} tareas vencidas · ${fmtN(f.sinTarea)} leads sin tarea`}>hoy: {fmtN(f.tareasVencidas)} vencidas · {fmtN(f.sinTarea)} sin tarea</div>
                        </div></td>) },
    { id: 'pc', label: '1er cont. vencido', ancho: 165, fecha: 'hoy', cnt: true, info: 'Primer contacto vencido',
      celda: (f) => (<td className="cnt">{f.pcVencidas > 0 ? <button type="button" className="nbtn celln" aria-haspopup="dialog" aria-label={`${f.pcVencidas} leads con primer contacto vencido de ${f.u.nombre}. Abrir desglose`} onClick={(e) => detalle(e, 'Primer contacto vencido · ' + f.u.nombre, f.pcVencidas, filasPc(f))}><span className="tag warn">{f.pcVencidas}</span></button> : '0'}</td>) },
    { id: 'cotiz', label: 'Cotizaciones', ancho: 140, fecha: 'actividad', cnt: true,
      celda: (f) => (<td className="cnt">{f.cotizaciones > 0 ? <button type="button" className="nbtn celln" aria-haspopup="dialog" aria-label={`${f.cotizaciones} cotizaciones de ${f.u.nombre}. Abrir desglose`} onClick={(e) => detalle(e, 'Cotizaciones · ' + f.u.nombre, f.cotizaciones, porEstado('Cotizaciones', evDe(f, 'cotizacion'), f, (l) => l.cotizacion || l.asignacion))}>{f.cotizaciones}</button> : '0'}</td>) },
    { id: 'desc', label: 'Descartes', ancho: 120, fecha: 'actividad', cnt: true,
      celda: (f) => (<td className="cnt">{f.descartes > 0 ? <button type="button" className="nbtn celln" aria-haspopup="dialog" aria-label={`${f.descartes} descartes de ${f.u.nombre}. Abrir desglose`} onClick={(e) => detalle(e, 'Descartes · ' + f.u.nombre, f.descartes, filasDescartes(f, evDe(f, 'descarte')))}>{f.descartes}</button> : '0'}</td>) },
    { id: 'lev', label: 'Levantamientos', ancho: 160, fecha: 'actividad', cnt: true,
      celda: (f) => (<td className="cnt">{f.levantamientos > 0 ? <button type="button" className="nbtn celln" aria-haspopup="dialog" aria-label={`${f.levantamientos} levantamientos de ${f.u.nombre}. Abrir desglose`} onClick={(e) => detalle(e, 'Levantamientos · ' + f.u.nombre, f.levantamientos, porEstado('Levantamientos', evDe(f, 'levantamiento'), f, (l) => l.levantamiento || l.asignacion))}>{f.levantamientos}</button> : '0'}</td>) },
    { id: 'equipo', label: 'Equipo', ancho: 120, fecha: 'ninguna', oculta: true,
      celda: (f) => (<td>{zonaNombre(corte, f.u.zona) || <span className="muted">Sin equipo</span>}</td>) },
    { id: 'tipo', label: 'Tipo de vendedor', ancho: 150, fecha: 'ninguna', oculta: true,
      celda: (f) => (<td>{VENDEDOR_LABEL[tipoDe(corte, f.u)]}</td>) },
    // Calificador de llamadas (Randall, PLAN Fase 3.2): tres columnas por fecha de la llamada. Sin llamadas
    // calificadas en el rango la celda lo dice, no pinta cero.
    { id: 'cal_pond', label: '⭐ Llamadas', ancho: 150, fecha: 'actividad',
      celda: (f) => (<td><div className="mc">
        {f.calif.n ? <>
          <button type="button" className="nbtn celln v" aria-haspopup="dialog" aria-label={`${f.calif.n} llamadas calificadas de ${f.u.nombre}, ${fmtEstrellas(f.calif.pond)} en promedio. Ver la lista`} onClick={() => verLlamadas(f, 'Llamadas calificadas')}>{fmtEstrellas(f.calif.pond)}</button>
          <div className="c">{fmtN(f.calif.n)} llamada{f.calif.n === 1 ? '' : 's'} calificada{f.calif.n === 1 ? '' : 's'}</div>
          <div className="c">estándar: 4 o más</div>
        </> : <><div className="v muted">—</div><div className="c">sin llamadas calificadas</div><div className="c">en estas fechas</div></>}
      </div></td>) },
    { id: 'cal_estandar', label: '% en estándar', ancho: 140, fecha: 'actividad', cnt: true,
      celda: (f) => (<td className="cnt">{f.calif.n ? <button type="button" className="nbtn celln" aria-haspopup="dialog" aria-label={`${pct(f.calif.cumple, 1)}% de las llamadas de ${f.u.nombre} en estándar. Ver la lista`} onClick={() => verLlamadas(f, 'Llamadas en estándar')}>{pct(f.calif.cumple, 1)}%</button> : '—'}</td>) },
    { id: 'cal_sigpaso', label: '% con siguiente paso', ancho: 165, fecha: 'actividad', cnt: true,
      celda: (f) => (<td className="cnt">{f.calif.n ? <button type="button" className="nbtn celln" aria-haspopup="dialog" aria-label={`${pct(f.calif.sigPaso, 1)}% de las llamadas de ${f.u.nombre} terminaron con siguiente paso. Ver la lista`} onClick={() => verLlamadas(f, 'Llamadas con y sin siguiente paso')}>{pct(f.calif.sigPaso, 1)}%</button> : '—'}</td>) },
    { id: 'ventas', label: 'Ventas cerradas', ancho: 160, fecha: 'cierre', cnt: true, oculta: true,
      celda: (f) => (<td className="cnt">{f.ventas > 0 ? <button type="button" className="nbtn celln" aria-label={`${f.ventas} ventas cerradas de ${f.u.nombre}. Ver la lista`} onClick={() => ver(`Ventas cerradas · ${f.u.nombre}`, fVentas(ventasFiltradas(corte, { ...filtros, asesor: f.u.id })), rango)}>{f.ventas}</button> : '0'}</td>) },
    { id: 'estanc', label: 'Estancados', ancho: 135, fecha: 'hoy', cnt: true, oculta: true,
      celda: (f) => (<td className="cnt">{f.estancados > 0 ? <button type="button" className="nbtn celln" aria-label={`${f.estancados} leads estancados de ${f.u.nombre}. Ver la lista`} onClick={() => ver(`Leads estancados · ${f.u.nombre}`, fLeads(f.leadsActivos.filter((l) => estancado(l))), HOY)}>{f.estancados}</button> : '0'}</td>) },
    { id: 'sintarea', label: 'Leads sin tarea', ancho: 155, fecha: 'hoy', cnt: true, oculta: true,
      celda: (f) => (<td className="cnt">{f.sinTarea > 0 ? <button type="button" className="nbtn celln" aria-label={`${f.sinTarea} leads sin tarea de ${f.u.nombre}. Ver la lista`} onClick={() => ver(`Leads sin tarea · ${f.u.nombre}`, fLeads(f.leadsActivos.filter((l) => l.sin_tarea)), HOY)}>{f.sinTarea}</button> : '0'}</td>) },
    { id: 'asig', label: 'Asignación', ancho: 155, fecha: 'ninguna', info: 'Asignación',
      celda: (f) => (<td className="asig">
                          <Asignacion u={f.u} sanc={sanc} ocupado={ocupado === f.u.id} msg={msg[f.u.id]} onAccion={(a) => accionar(f.u, a)} />
                        </td>) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [corte, filtros, maxLeads, maxLlam, maxTar, maxAsig, maxAct, sanc, ocupado, msg])
  const { visibles: vis, ordenadas, ocultas, tocado: tocadoCols, fijar: fijarCols, restablecer: restablecerCols } = useColumnas('asesores', COLS)
  const [edCols, setEdCols] = useState(false)
  // El aviso de «no hay asesores» va DESPUÉS de todos los hooks: salir antes cambiaba cuántos hooks
  // corre el componente y React tumbaba la página en blanco al filtrar por una zona vacía (Saltillo,
  // reportado por Randall 9-sep). Los hooks siempre se ejecutan; lo que cambia es lo que se pinta.
  if (!filas.length) return <div className="panel muted">Sin asesores con leads o actividad en el rango. Amplía el rango de fechas o quita el filtro de equipo.</div>
  return (
    <>
      <div className="tbltools">
        {/* La misma pregunta que Randall traía del Sheet («¿estas fechas son de asignación o de
            actividad?») se contesta sin un segundo calendario: cada columna lo dice en su título. */}
        <span className="small muted basefechas">
          <b>{periodoTexto(filtros.rango)}</b> no significa lo mismo en toda la tabla: cada columna dice bajo su título si cuenta{' '}
          <i className="bf asignacion">por asignación</i>, <i className="bf actividad">por actividad</i> o <i className="bf cierre">por cierre</i>.
        </span>
        <button type="button" className="btn sm" onClick={() => setEdCols(true)} aria-haspopup="dialog">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M8.5 4v12M13 4v12" /></svg>
          Columnas ({vis.length} de {COLS.length})
        </button>
        {tocadoCols && <button type="button" className="btn sm" onClick={restablecerCols}>Restablecer columnas</button>}
        {/* Qué significa cada color, ARRIBA de la tabla junto a la nota de fechas (Randall 16-sep); un color se repite en
            varias columnas con el mismo sentido: azul = bien, ámbar = pendiente, rojo = vencido, rayado = sin tarea. */}
        <div className="legend tleg" aria-label="Colores de las barras">
          <span><i className="lg-comp" aria-hidden="true" />Contestadas · completadas · al día</span>
          <span><i className="lg-l" aria-hidden="true" />Ganados</span>
          <span><i className="lg-warn" aria-hidden="true" />Sin contestar · estancados</span>
          <span><i style={{ background: 'var(--warn)' }} aria-hidden="true" />Vencidas · sin primer contacto · descartados</span>
          <span><i style={{ background: 'repeating-linear-gradient(45deg, var(--neutral) 0 2px, #fff 2px 4px)' }} aria-hidden="true" />Sin tarea</span>
          <span><i className="lg-e" aria-hidden="true" />Cotizaciones</span>
          <span title="En la barra de Vendido la marca negra es la meta del periodo y la gris lo que tocaría llevar hoy. Clic en una barra abre el desglose y de ahí la lista">Vendido: negra = meta, gris = esperado a hoy</span>
        </div>
      </div>
      <div className="tblwrap">
        <table className="tbl asesores" style={{ minWidth: anchoTotal(vis) + 'px' }}>
          {/* Anchos fijos EN PÍXELES (Randall 9-sep): cada columna conserva su ancho legible y, si
              no caben todas, la tabla se desplaza a lo ancho con su barra en vez de aplastarse. */}
          <colgroup>{anchos(vis).map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead><tr>{vis.map((c) => (c.id === 'asig'
            ? <th key={c.id} scope="col" className="asig-th">Asignación<Info termino="Asignación" /></th>
            : <SortTh key={c.id} k={c.id as Key} label={c.label} className={c.cnt ? 'cnt' : ''} {...th}>
                {c.info ? <Info termino={c.info as Termino} /> : null}
                {/* Qué le hacen las fechas a ESTA columna, dicho en su encabezado (Randall 9-sep). */}
                {c.fecha && c.fecha !== 'ninguna' && <span className="thbase" title={BASE_FECHA[c.fecha].largo}>{BASE_FECHA[c.fecha].corto}</span>}
              </SortTh>))}</tr></thead>
          <tbody>
            {filas.map((f) => (
              /* el resumen del asesor se abre solo desde el nombre (Randall 6-sep); cada cifra abre su propio desglose */
              <tr key={f.u.id}>{vis.map((c) => <Fragment key={c.id}>{(f.tipo === 'cambaceo' || (f.tipo === 'otro' && !f.u.crm.length)) && (c.fecha === 'asignacion' || c.fecha === 'actividad' || c.fecha === 'hoy') ? <td className={c.cnt ? 'cnt muted' : 'muted'} title="Vendedor de cambaceo: no registra en el CRM">—</td> : c.celda(f)}</Fragment>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {pop && <AsesorPopup corte={corte} filtros={filtros} fila={pop.fila} x={pop.x} y={pop.y} onClose={() => setPop(null)} onFicha={() => { setPop(null); onFicha(pop.fila.u.id) }} />}
      {det && <BarDetailPopup anchor={det.anchor} title={det.title} total={det.total} rows={det.rows} onClose={() => setDet(null)} />}
      {drill && <DrillModal d={drill} onClose={() => setDrill(null)} />}
      {llamada && <LlamadaModal x={llamada} onClose={() => setLlamada(null)} />}
      {edCols && <EditarColumnas todas={COLS} ordenadas={ordenadas} ocultas={ocultas} onFijar={fijarCols} onRestablecer={restablecerCols} onClose={() => setEdCols(false)} />}
    </>
  )
}

function AsesorPopup({ corte, filtros, fila, x, y, onClose, onFicha }: { corte: Corte; filtros: Filtros; fila: FilaAsesor; x: number; y: number; onClose: () => void; onFicha: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, onClose)
  useEscape(onClose)
  useFocoDialogo(ref)
  // La altura real se sabe hasta que existe: se mide y se sube lo necesario para que el pie quede en pantalla.
  const [top, setTop] = useState(y)
  useLayoutEffect(() => { const h = ref.current?.getBoundingClientRect().height || 0; setTop(Math.max(8, Math.min(y, window.innerHeight - 8 - h))) }, [y])
  // Arranca en el último mes del rango (el actual con los presets), no en el primero.
  const [mes, setMes] = useState(() => { const d = new Date((filtros.rango.fin - 1) * 1000); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const ini = ep(mes), fin = ep(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))
  const activos = corte.leads.filter((l) => pasaCrm(l.crm, filtros) && l.asesor_id === fila.u.id && activo(l) && l.asignacion >= ini && l.asignacion < fin).sort((p, q) => diasSinActividad(q) - diasSinActividad(p))
  const serie = serieDiaria(fila.asignados.map((l) => l.asignacion), filtros.rango)
  const cumpl = pct(fila.montoVentas, fila.metaRango)
  return (
    <div className="popup" ref={ref} style={{ left: x, top }} role="dialog" aria-modal="true" aria-label={`Resumen de ${fila.u.nombre}`}>
      <div className="ph">
        <div className={avatarCls(fila.u)} aria-hidden="true">{iniciales(fila.u.nombre)}</div>
        <div className="nm">{fila.u.nombre}<div className="small muted">{subAsesor(corte, fila.u)}</div></div>
        <button type="button" className="ib" aria-label="Ver ficha completa" title="Ver ficha completa" onClick={onFicha}>↗</button>
        <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
      </div>
      <div className="kpi3">
        <div><div className="l">Vendido</div><div className="v">{fmtMoney0(fila.montoVentas)}</div></div>
        <div><div className="l">Cumplimiento<Info termino="Cumplimiento" /></div><div className="v">{cumpl}%</div></div>
        <div><div className="l">Cotizado vigente</div><div className="v">{fmtMoney0(fila.cotizado.vigente)}</div></div>
      </div>
      <div className="pchart"><MiniAreaChart values={serie} height={54} /><div className="small muted">Leads asignados por día · {filtros.rango.label}</div></div>
      <div className="pleads">
        <div>
          <div className="lh"><h3>Leads activos</h3>
            <span className="mnav"><button type="button" aria-label="Mes anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>‹</button><span aria-live="polite">{mesNombre(mes)}</span><button type="button" aria-label="Mes siguiente" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>›</button></span>
          </div>
          {activos.slice(0, 6).map((l) => (
            <div className="leadrow" key={l.id}>
              <a className="nm" href={l.link} target="_blank" rel="noreferrer" title={l.nombre + ' · abrir en ' + CRM_LABEL[l.crm]}>{l.nombre}</a>
              <span className="it">{dias(diasSinActividad(l))} sin actividad</span>
              <span className="it l2"><span className="tag" title={CRM_LABEL[l.crm]}>{tipoLead(l)}{mixto(corte) ? ' · ' + crmCorto(l) : ''}</span> {intentos(l)}{(l.pc_vencida || l.sin_tarea) && <> <span className="tag warn">{l.pc_vencida ? 'Primer contacto vencido' : 'sin tarea'}</span></>}</span>
            </div>
          ))}
          {activos.length > 6 && <div className="small muted">+{activos.length - 6} más en la ficha</div>}
          {!activos.length && <div className="small muted">Sin leads activos asignados en {mesNombre(mes)}</div>}
        </div>
        <div className="donut-wrap"><Gauge pct={cumpl} label="meta" size={110} /><span className="small muted">de {fmtMoney0(fila.metaRango)}</span></div>
      </div>
      <button type="button" className="pfoot" onClick={onFicha}>Ver perfil completo →</button>
    </div>
  )
}

// ---------------------------------------------------------------- Ficha
const lunes = (d: Date) => sumar(inicioDia(d), -((d.getDay() + 6) % 7))

const wg = (id: string, titulo: string, nodo: React.ReactNode, opts: Partial<Widget> = {}): Widget => ({ id, titulo, nodo, ...opts })
/** Los widgets del tablero general que TAMBIÉN tienen sentido para una persona: los mismos números,
 *  fijados a ella (Randall 10-sep, diseño del PDF). Fuera quedan los de equipo (salud, ranking,
 *  perfiles) y los que la ficha ya cuenta a su manera (avance contra la meta, ventas reales). */
const FICHA_COMPARTIDOS = ['t-cotizaciones', 't-descartes', 't-levantamientos', 't-leads', 't-ventas', 't-conversion', 't-conv-dig', 't-conv-nodig', 't-perdida', 't-tareas', 'embudo', 'etapas', 'contacto', 'llamadas']
/** El orden con el que abre la ficha: evolución, el resumen de la persona, sus cifras, el embudo,
 *  cómo atiende, su actividad y sus pendientes. */
const ORDEN_FICHA = [
  'ev', 'ev-tabla',
  'ventas', 'cumplimiento', 'cierre',
  't-cotizaciones', 'cotizado', 't-descartes', 't-levantamientos',
  't-leads', 't-ventas', 't-conversion', 't-conv-dig', 't-conv-nodig', 't-perdida', 't-tareas',
  'reales', 'embudo', 'etapas', 'contacto', 'llamadas',
  'actividad', 'leads', 'tareas',
]
/** La meta de porcentaje de cierre mientras no viva en Configuración (Randall la puso en el PDF). */
const META_CIERRE = 0.10
/** Fechas con las que abre cada widget de la ficha si la cuenta no ha elegido otras: la evolución por mes
 *  siempre en «Máximo» (Alejandro 15-sep: «independientemente de lo que yo seleccione acá, siempre abra el
 *  máximo acá»). Lo demás sigue al tablero. */
const RANGOS_FICHA: Record<string, RangoWidget> = { ev: 'maximo', 'ev-tabla': 'maximo', embudo: 'maximo', etapas: 'maximo', cotizado: 'foto', leads: 'foto', tareas: 'foto' }

/** Ficha del asesor. Es un WidgetGrid (clave «ficha», compartida entre asesores): cada tarjeta se
 *  mueve, estira o quita igual que en el Dashboard. Cotizado vigente y su antigüedad van en UNA
 *  tarjeta; la actividad respeta el rango del filtro (por día hasta 21 días, si no por semana con
 *  clic para abrir la semana). */
export function Ficha({ corte, filtros, uid, onBack, puedeEditar = true }: { corte: Corte; filtros: Filtros; uid: string; onBack: () => void; puedeEditar?: boolean }) {
  const u = corte.usuarios.find((x) => x.id === uid)
  // Su ficha muestra TODO lo suyo: el equipo y el CRM elegidos arriba no la recortan (si el tablero
  // estaba en Kommo y la persona trabaja en HubSpot, su ficha salía vacía).
  const f: Filtros = { ...filtros, asesor: uid, equipo: null, crm: { kommo: true, hubspot: true } }
  const [zoom, setZoom] = useState<{ ini: Date; dias: number; texto: string } | null>(null)   // semana o mes abierto en Actividad por día; null = vista del rango
  const [drill, setDrill] = useState<Drill | null>(null)
  // Fechas propias por widget, igual que en el tablero general (Randall 10-sep: «en la vista del
  // asesor no está lo del date range del widget»). La elección se comparte entre fichas: si dejas
  // «Ventas» en Máximo, se ve en Máximo para cualquier asesor.
  const defaults = useMemo(() => defaultsDe(corte, RANGOS_FICHA), [corte])
  const { rangos: rangosCuenta, fijarRango } = useRangos('ficha', defaults.por, defaults.desde)
  const permitido = useMemo(() => fechasPermitidas(corte), [corte])
  const rangos = useMemo(() => Object.fromEntries(Object.entries(rangosCuenta).filter(([id]) => permitido(id))), [permitido, rangosCuenta])
  const conFechas = permitido('g:*')
  const desdeMaximo = useMemo(() => { let m = corte.desde; for (const l of corte.leads) { if (l.asignacion && l.asignacion < m) m = l.asignacion; if (l.creado && l.creado < m) m = l.creado } return m }, [corte])
  const conRango = (pz: RangoWidget): Filtros => ({ ...f, rango: preset(pz === 'foto' ? 'maximo' : pz, new Date(), desdeMaximo), foto: pz === 'foto' })
  const filtrosDe = (id: string): Filtros => (rangos[id] ? conRango(rangos[id]) : f)
  const fechasCtor = conFechas ? { de: (id: string) => rangos['g:' + id], filtros: (id: string) => filtrosDe('g:' + id), fijar: (id: string, pz: RangoWidget | null) => fijarRango('g:' + id, pz) } : undefined
  const nombreTablero = filtros.rango.label.includes(': ') ? filtros.rango.label.split(': ')[0] : 'Fechas elegidas'
  const fechasDe = (pz?: RangoWidget) => { if (pz === 'foto') return 'lo activo hoy, sin fechas'; const r = pz ? conRango(pz).rango : f.rango; return etiquetaRango(null, r.ini, r.fin) }
  // Los tres widgets propios de la ficha que son «foto de hoy» por defecto también aceptan un periodo (Randall 16-sep):
  // con fechas miran los leads ASIGNADOS en ese periodo que siguen activos, y las tareas abiertas que vencen en él.
  const activosDe = (id: string): Lead[] => { const ff = filtrosDe(id); return ff.foto ? leadsActivosHoy(corte, ff) : leadsFiltrados(corte, ff).filter(activo) }
  const periodoDe = (id: string) => (filtrosDe(id).foto ? 'foto de hoy' : 'asignados ' + periodoTexto(filtrosDe(id).rango))
  // La actividad se reagrupa cuando cambian SUS fechas (las del widget o las del tablero).
  const rangoAct = filtrosDe('actividad').rango
  useEffect(() => setZoom(null), [rangoAct.ini, rangoAct.fin, uid])
  // Los mismos widgets del tablero, pero de esta persona. Se arman una vez con las fechas de arriba
  // y una por cada periodo que alguien haya fijado, como en el tablero general.
  const [llamada, setLlamada] = useState<Llamada | null>(null)
  const acciones = useMemo(() => ({ ver: (titulo: string, filas: Fila[], sub?: string) => setDrill({ titulo, filas, sub }), abrir: (d: Drill) => setDrill(d),
    verLlamadas: (titulo: string, ls: Llamada[]) => setDrill(drillLlamadas(titulo, ls, corte, filtros.rango.label, setLlamada)),
    onFicha: () => {}, grupo: null, setGrupo: () => {} }), [corte, filtros.rango.label])
  const compartidos = (ff: Filtros) => widgetsTablero(corte, ff, datosDe(corte, ff), acciones).filter((w) => FICHA_COMPARTIDOS.includes(w.id))
  const baseCompartidos = useMemo(() => compartidos(f), [corte, filtros, uid])   // eslint-disable-line react-hooks/exhaustive-deps
  const otrosCompartidos = useMemo(() => {
    const m = new Map<string, Widget[]>()
    for (const pz of new Set(Object.values(rangos))) m.set(pz, compartidos(conRango(pz)))
    return m
  }, [corte, filtros, uid, rangos])   // eslint-disable-line react-hooks/exhaustive-deps
  const delTablero = baseCompartidos.map((w) => (rangos[w.id] && otrosCompartidos.get(rangos[w.id])?.find((x) => x.id === w.id)) || w)
  if (!u) return <div className="panel">Asesor no encontrado. <button type="button" className="btn" onClick={onBack}>← Volver</button></div>
  // Ventas, meta y ritmo de UN widget con SUS fechas (Randall 17-sep: «hay widgets que no respetan lo configurado»:
  // Avance, Cumplimiento y Porcentaje de cierre calculaban con las fechas del tablero aunque su píldora dijera otra
  // cosa). La meta va por los meses que toca ese rango desde que la persona existe (`rangoMeta`).
  const ventasDe = (id: string) => {
    const ff = filtrosDe(id)
    const vs = ventasFiltradas(corte, ff), monto = vs.reduce((s, l) => s + l.presupuesto, 0)
    const rvw = rangoVentas(corte, ff.rango)
    const { metaMes, metaRango, ritmo: rit } = metaYRitmo(corte, u, monto, ff.rango)
    // Leads asignados en los meses de las ventas: la base del porcentaje de cierre (ventas de septiembre entre
    // leads de septiembre), igual que la cifra «Conversión» del tablero.
    const ls = leadsFiltrados(corte, ff)
    const leadsV = rvw.ini === ff.rango.ini && rvw.fin === ff.rango.fin ? ls : leadsFiltrados(corte, { ...ff, rango: rvw })
    return { ff, ventas: vs, monto, metaMes, metaRango, rit, periodoV: periodoTexto(rvw), leadsV, rango: ff.rango.label }
  }
  const V = ventasDe('ventas'), C = ventasDe('cumplimiento'), Z = ventasDe('cierre')
  // Porcentaje de cierre = el renglón de esta persona en la tabla de conversión del tablero (junta 23-sep: la ficha
  // daba otro número y abría otra lista). Mismo cálculo, mismo detalle.
  const ZCV = conversion(corte, Z.ff, 'asesor'), ZC = ZCV.filas.find((x) => x.clave === u.id), ZT = ZC?.tasa ?? 0
  // Activos = foto de HOY (Randall 11-sep), no los asignados en el rango: la ficha decía «87 leads activos» y la
  // tabla de Asesores 205 para la misma persona.
  const activos = leadsActivosHoy(corte, f)
  const activosCot = activosDe('cotizado'), activosLeads = activosDe('leads')
  const cot = cotizado(activosCot, corte.cotizado_dias)
  const vigentes = activosCot.filter((l) => l.presupuesto > 0 && diasDesde(fechaCotizado(l)) <= corte.cotizado_dias)
  const objetivo = metaDe(corte, u) * corte.cotizado_x
  const ffr = filtrosDe('reales')
  const vr = ventasReales(corte, ffr), vcrm = ventasCrm(corte, ffr)
  // Actividad: el rango del widget manda. Hasta 21 días por día; hasta 26 semanas por semana; más largo (p. ej. «Máximo» desde 2023)
  // por mes, siempre en una sola fila. Una semana o un mes se abren por día con un clic.
  const ini = rangoAct.ini, fin = rangoAct.fin, rangoActTxt = rangoAct.label
  const evRango = corte.eventos.filter((e) => pasaCrm(e.crm, filtros) && e.asesor_id === uid && e.ts >= ini && e.ts < fin)
  // «Sin interés» (junta 23-sep, Samuel: «sí estaría bueno»): leads que el asesor descartó con esa razón.
  const razonDe = new Map(corte.leads.map((l) => [l.id, l.razon || '']))
  const sinInteres = (e: Evento) => e.tipo === 'descarte' && /sin inter[eé]s/i.test(razonDe.get(e.lead) || '')
  const burbujas = (ev: Evento[]) => [
    { n: ev.filter((e) => e.tipo === 'llamada_ok' || e.tipo === 'llamada_no').length, title: 'Llamadas' },
    { n: ev.filter((e) => e.tipo === 'tarea').length, cls: 'w', title: 'Tareas completadas' },
    { n: ev.filter((e) => e.tipo === 'cotizacion').length, cls: 'e', title: 'Cotizaciones entregadas' },
    { n: ev.filter((e) => e.tipo === 'levantamiento').length, cls: 'l', title: 'Levantamientos solicitados' },
    { n: ev.filter(sinInteres).length, cls: 's', title: 'Marcados sin interés' },
  ].filter((b) => b.n > 0)
  const entre = (a: number, b: number) => evRango.filter((e) => e.ts >= a && e.ts < b)
  const diasRango = Math.round((fin - ini) / 86400)
  let cols: BubbleCol[], evVista: Evento[], vista: string, onCol: ((i: number) => void) | undefined
  if (zoom) {
    const ds = Array.from({ length: zoom.dias }, (_, i) => sumar(zoom.ini, i))
    evVista = entre(ep(zoom.ini), ep(sumar(zoom.ini, zoom.dias)))
    cols = ds.map((d) => ({ label: fmtCorta(d), bubbles: burbujas(entre(ep(d), ep(d) + 86400)) }))
    vista = `${zoom.texto}, por día`
  } else if (diasRango <= 21) {
    const d0 = inicioDia(new Date(ini * 1000))
    const ds = Array.from({ length: Math.max(1, diasRango) }, (_, i) => sumar(d0, i))
    evVista = evRango
    cols = ds.map((d) => ({ label: fmtCorta(d), bubbles: burbujas(entre(ep(d), ep(d) + 86400)) }))
    vista = `Por día · ${rangoActTxt}`
  } else if (diasRango <= 26 * 7) {
    const semanas: Date[] = []
    for (let d = lunes(new Date(ini * 1000)); ep(d) < fin; d = sumar(d, 7)) semanas.push(d)
    evVista = evRango
    // La etiqueta dice qué días abarca la semana (Randall 24-sep: «me confundo entre la vista diaria y la semanal»),
    // recortada al periodo: la primera semana de septiembre empieza el 1, no el lunes 31 de agosto.
    const tramo = (d: Date) => { const a = new Date(Math.max(ini * 1000, d.getTime())), b = new Date(Math.min(fin * 1000 - 1, sumar(d, 6).getTime())); return `${fmtCorta(a)} – ${fmtCorta(b)}` }
    cols = semanas.map((d) => ({ label: tramo(d), title: `Semana del ${tramo(d)}. Clic para ver por día`, bubbles: burbujas(entre(Math.max(ini, ep(d)), Math.min(fin, ep(sumar(d, 7))))) }))
    onCol = (i) => setZoom({ ini: semanas[i], dias: 7, texto: `Semana del ${fmtCorta(semanas[i])} al ${fmtCorta(sumar(semanas[i], 6))}` })
    vista = `Por semana · ${rangoActTxt} · clic en una semana para verla por día`
  } else {
    const meses: Date[] = []
    for (let d = new Date(new Date(ini * 1000).getFullYear(), new Date(ini * 1000).getMonth(), 1); ep(d) < fin; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) meses.push(d)
    const paso = Math.ceil(meses.length / 16)   // con muchos meses, una etiqueta cada `paso` columnas (el título trae todas)
    const nombre = (d: Date) => `${mesNombre(d)} ${String(d.getFullYear()).slice(2)}`
    evVista = evRango
    cols = meses.map((d, i) => { const sig = new Date(d.getFullYear(), d.getMonth() + 1, 1); return { label: i % paso === 0 ? nombre(d) : '', title: `${nombre(d)}. Clic para ver por día`, bubbles: burbujas(entre(Math.max(ini, ep(d)), Math.min(fin, ep(sig)))) } })
    onCol = (i) => { const d = meses[i]; setZoom({ ini: d, dias: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), texto: `${mesNombre(d)} de ${d.getFullYear()}` }) }
    vista = `Por mes · ${rangoActTxt} · clic en un mes para verlo por día`
  }
  const ft = filtrosDe('tareas')
  const tareas = corte.tareas_abiertas.filter((t) => pasaCrm(t.crm, filtros) && t.asesor_id === uid && (ft.foto || (t.vence >= ft.rango.ini && t.vence < ft.rango.fin))).sort((p, q) => p.vence - q.vence).slice(0, 24)
  const hoy = ep(inicioDia(new Date()))
  const widgets: Widget[] = [
    // «Ventas · este mes» se cambió por la barrita del tablero (Alejandro 15-sep: «el widget de ventas este mes por
    // el de la barrita»); conserva el id para quedarse en el lugar que ya tiene en los acomodos guardados.
    wg('ventas', 'Avance contra la meta', <TileAvance monto={V.monto} metaRango={V.metaRango} rit={V.rit} periodo={V.periodoV} onClick={() => setDrill({ titulo: `Ventas de ${u.nombre}`, filas: fVentas(V.ventas), sub: V.rango + FUENTE_VENTAS(corte) })} />,
      { plain: true, span: 2, alto: 5, minAlto: 5, cls: 'wtile', info: ['Ritmo'], base: 'cierre' }),
    wg('cumplimiento', 'Cumplimiento', (
      <div className={'kcard k2 ritmo-' + C.rit.estado}><div className="l">Cumplimiento<Info termino={['Cumplimiento', 'Ritmo']} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}><div className="n">{pct(C.monto, C.metaRango)}%</div><Gauge pct={pct(C.monto, C.metaRango)} label="meta" size={120} color={C.rit.estado === 'atras' ? 'var(--warn)' : 'var(--c4)'} /></div>
        <div className={'rt ' + C.rit.estado}>{C.rit.texto}</div>
        {C.rit.avance && <div className="rt-av">{C.rit.avance}</div>}
        <div className="small muted">meta {C.periodoV} {fmtMoney0(C.metaRango)} ({fmtMoney0(C.metaMes)} al mes){C.monto < C.metaRango && ` · faltan ${fmtMoney0(C.metaRango - C.monto)}`}</div></div>
    ), { plain: true, span: 2, cls: 'wcard', base: 'cierre' }),
    wg('cotizado', 'Cotizado vigente y antigüedad', (
      <div className="kcard k3"><div className="cot-grid">
        <div><div className="l">Cotizado vigente<Info termino="Cotizado vigente" /></div><div className="n"><Cifra label={`Cotizado vigente ${fmtMoney0(cot.vigente)}`} onClick={() => setDrill({ titulo: `Cotizado vigente de ${u.nombre}`, filas: fCotizado(vigentes), sub: `≤ ${corte.cotizado_dias} días · ${periodoDe('cotizado')}` })}>{fmtMoney0(cot.vigente)}</Cifra></div>
          <Bullet value={cot.vigente} target={objetivo} label="Cotizado vigente" color="var(--c2)" fmt={fmtMoney0} />
          <div className="small muted" style={{ marginTop: 6 }}>objetivo {fmtMoney0(objetivo)} = {corte.cotizado_x}× la meta mensual · {fmtN(cot.n)} lead{cot.n === 1 ? '' : 's'} con monto<Info termino="Pipeline 10×" /></div></div>
        <div><div className="l">Antigüedad del cotizado<Info termino="Antigüedad" /></div>
          <Antiguedad c={cot} leads={activosCot} onVer={(t, filas) => setDrill({ titulo: `${t} · ${u.nombre}`, filas, sub: periodoDe('cotizado') })} />
          <div className="small muted" style={{ marginTop: 6 }}>{cot.viejo > 0 ? `${fmtMoney(cot.viejo)} en ${fmtN(cot.nViejo)} leads pasan de ${corte.cotizado_dias} días: ya no cuentan.` : 'Nada pasa de ' + corte.cotizado_dias + ' días.'}</div></div>
      </div></div>
    ), { plain: true, span: 2, cls: 'wcard', alto: 6, base: 'asignacion' }),
    ...(corte.comisiones ? [wg('reales', 'Ventas reales · Comisiones', (
      <div className="kcard k4"><div className="l">Ventas reales · Comisiones<Info termino="Ventas reales" /></div>
        <div className="n"><Cifra label={`${vr.n} ventas reales, ${fmtMoney0(vr.total)}`} onClick={() => setDrill({ titulo: `Ventas reales de ${u.nombre}`, filas: filasDeVentasReales(vr.ventas), sub: ffr.rango.label + ' · mes de venta en la app de comisiones' })}><b>{vr.n}</b> <span style={{ fontSize: 22 }}>{fmtMoney0(vr.total)}</span></Cifra></div>
        {vr.n > 0 ? (
          <div className="reales-lista">{vr.ventas.slice(0, 6).map((v) => <div className="r" key={v.id}><span className="nm">{v.cliente || 'Sin nombre'}</span><span className="m">{v.mes_texto}</span><span>{fmtMoney0(v.monto)}</span></div>)}{vr.ventas.length > 6 && <div className="muted">+{vr.ventas.length - 6} más en el detalle</div>}</div>
        ) : <div className="small muted">Sin ventas en la app de comisiones para este rango.{corte.comisiones.error ? ` Error al leer la app: ${corte.comisiones.error}` : ''}</div>}
        {/* Decía «CRM» pero sumaba las ventas de la app: ahora sí son los ganados del CRM en esas fechas. */}
        <div className="small muted" style={{ marginTop: 6 }}>CRM: {vcrm.length} ganada{vcrm.length === 1 ? '' : 's'} por {fmtMoney0(vcrm.reduce((s, l) => s + l.presupuesto, 0))} en el periodo.</div></div>
    ), { plain: true, span: 2, cls: 'wcard' })] : []),
    wg('actividad', 'Actividad', (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <span className="small muted" aria-live="polite">{vista}</span>
          {zoom && <button type="button" className="nbtn" onClick={() => setZoom(null)}>‹ Volver a todo el periodo</button>}
        </div>
        <BubbleChart cols={cols} onCol={onCol} />
        <div className="small muted" style={{ marginTop: 8 }}>Cada columna es {zoom || diasRango <= 21 ? 'un día' : diasRango <= 26 * 7 ? 'una semana' : 'un mes'} y cada bolita cuenta lo que el asesor registró de cada tipo: entre más grande, más actividad.</div>
        <div className="legend"><span><i className="lg-comp" aria-hidden="true" />Llamadas</span><span><i className="lg-warn" aria-hidden="true" />Tareas completadas</span><span><i className="lg-e" aria-hidden="true" />Cotizaciones entregadas</span><span><i className="lg-l" aria-hidden="true" />Levantamientos solicitados</span><span><i className="lg-s" aria-hidden="true" />Marcados sin interés</span>
          <button type="button" onClick={() => setDrill({ titulo: `Actividad de ${u.nombre} · ${zoom ? zoom.texto : rangoActTxt}`, filas: filasDeEventos(corte, evVista) })}>Ver las {fmtN(evVista.length)} actividades ›</button></div>
      </>
    ), { span: 6, alto: 9, minAlto: 9, info: ['Actividad'], base: 'actividad' }),   // 9 filas: cinco bolitas (sin interés, 24-sep) + leyenda
    wg('leads', `Leads activos · ${fmtN(activosLeads.length)}`, <LeadsTabla corte={corte} leads={activosLeads} />, { span: 6, info: ['Leads activos', 'Estancados'], base: 'asignacion' }),
    wg('tareas', 'Tareas abiertas', (
      <>
        {!tareas.length && <div className="muted">{ft.foto ? 'Sin tareas abiertas en el CRM para este asesor.' : 'Sin tareas abiertas que venzan en este periodo.'}</div>}
        <div className="cards">
          {tareas.map((t) => { const d = Math.floor((t.vence - hoy) / 86400); const nm = t.lead_nombre || t.texto || 'Sin nombre'; return (
            <div className="card" key={t.id}>
              <span className={'tag' + (t.vencida ? ' warn' : '')}>{t.tipo}</span>
              <div className="nm">{t.link ? <a href={t.link} target="_blank" rel="noreferrer">{nm}</a> : nm}</div>
              <div className="ds">{t.lead_nombre ? (t.texto || 'Sin descripción') : CRM_LABEL[t.crm]}</div>
              <div className="dd">{d < 0 ? `Vencida hace ${-d} día${d === -1 ? '' : 's'}` : d === 0 ? 'Vence hoy' : `${d} día${d === 1 ? '' : 's'} restantes`}</div>
            </div>) })}
        </div>
      </>
    ), { span: 6, info: ['Tareas'], base: 'actividad' }),
    // La evolución abre la ficha: cómo va mes a mes contra su meta (Randall 10-sep, diseño del PDF).
    wg('ev', 'Monto vendido y Meta de venta por mes', (
      <GraficaLibre corte={corte} filtros={filtrosDe('ev')} onDrill={setDrill}
        g={{ id: 'ev', titulo: 'Monto vendido y Meta de venta por mes', medida: 'vendido', medidas: ['meta'], dim: 'mes', tipo: 'linea', modo: 'lado', top: 12 }} />
    ), { span: 3, alto: 9, base: 'cierre' }),
    wg('ev-tabla', `${corte.comisiones ? 'Contrato total' : 'Monto vendido'} y Meta de venta por mes`, (
      <GraficaLibre corte={corte} filtros={filtrosDe('ev-tabla')} onDrill={setDrill}
        g={{ id: 'ev-tabla', titulo: 'Por mes', medida: corte.comisiones ? 'r_contrato' : 'vendido', medidas: ['meta'], dim: 'mes', tipo: 'tabla', top: 12 }} />
    ), { span: 3, alto: 9, base: 'cierre' }),
    // Porcentaje de cierre contra su meta: el número que Randall puso a mano en el PDF.
    wg('cierre', 'Porcentaje de cierre', (
      <button type="button" className={'tile tbtn t4 ritmo-' + (ZT >= META_CIERRE ? 'cumplida' : 'atras')}
        aria-label={`Porcentaje de cierre ${Math.round(ZT * 100)}%, meta ${Math.round(META_CIERRE * 100)}%. Ver sus leads y cierres`}
        onClick={() => ZC && setDrill(drillLeadsConv(corte, ZC, periodoTexto(ZCV.rango), 'asesor', setDrill))}>
        <div className="n">{Math.round(ZT * 100)}%</div>
        <div className="l">{fmtN(ZC?.cierres.length ?? 0)} cerrados de {fmtN(ZC?.leads.length ?? 0)} leads asignados sin perdidos {Z.periodoV}</div>
        <Bullet value={ZT} target={META_CIERRE} label="Porcentaje de cierre" fmt={(n) => Math.round(n * 100) + '%'} />
        <div className="rt">Meta: {Math.round(META_CIERRE * 100)}%</div>
      </button>
    ), { plain: true, span: 2, alto: 5, cls: 'wtile', info: ['Conversión'], base: 'cierre' }),
    ...delTablero,
  ]
  return (
    <>
      <div className="ficha-tools">
        <button type="button" className="btn" onClick={onBack}>← Volver</button>
        <div className="who"><div className={avatarCls(u)} aria-hidden="true">{iniciales(u.nombre)}</div><div><h2 className="nm" style={{ margin: 0, fontSize: 14 }}>{u.nombre}<TagTipo c={corte} u={u} /></h2><div className="sub">{subAsesor(corte, u)}</div></div></div>
        <span className="tag dark">{activos.length} leads activos</span>
      </div>
      {/* La ficha usa el mismo constructor, pero fijado a este asesor. */}
      <WidgetGrid clave="ficha2" compartible widgets={ORDEN_FICHA.map((id) => widgets.find((w) => w.id === id)).filter((w): w is Widget => !!w).concat(widgets.filter((w) => !ORDEN_FICHA.includes(w.id)))}
        bloqueado={!puedeEditar}
        fechas={{ clave: 'ficha', por: rangos, fijar: fijarRango, tablero: nombreTablero, fechas: fechasDe, permitido }}
        taller={{
        render: (g: Grafica) => <GraficaLibre corte={corte} filtros={filtrosDe('g:' + g.id)} g={g} onDrill={setDrill} />,
        galeria: (p) => <Galeria corte={corte} filtros={f} quitados={p.quitados} enTablero={p.enTablero} onIr={p.onIr} onAgregar={p.onAgregar} onCrear={p.onCrear} onClose={p.onClose} fechas={fechasCtor} />,
        editor: (p) => <Editor corte={corte} filtros={filtrosDe('g:' + p.g.id)} g={p.g} rango={rangos['g:' + p.g.id]} onRango={conFechas ? (x) => fijarRango('g:' + p.g.id, x) : undefined} onGuardar={p.onGuardar} onClose={p.onClose} />,
      }} />
      {drill && <DrillModal d={drill} onClose={() => setDrill(null)} />}
      {llamada && <LlamadaModal x={llamada} onClose={() => setLlamada(null)} />}
    </>
  )
}

/** Celda «Asignación» de la tabla de Asesores: qué CRM lo tiene fuera y el botón para quitar o reactivar. */
function Asignacion({ u, sanc, ocupado, msg, onAccion }: { u: Usuario; sanc: Sanciones | null | undefined; ocupado: boolean; msg?: string; onAccion: (a: 'quitar' | 'reactivar') => void }) {
  if (sanc === undefined) return <span className="small muted">…</span>
  if (sanc === null) return <span className="small muted">Sin acceso al estado de asignación.</span>
  const lineas: { txt: string; fuera: boolean }[] = []
  if (u.ids.kommo != null) {
    const fila = sanc.kommo.filas.find((r) => r.user_id === Number(u.ids.kommo))
    if (!sanc.kommo.configurado) lineas.push({ txt: 'Kommo: el tablero no está conectado al Sheet de sanciones.', fuera: false })
    else if (sanc.kommo.error) lineas.push({ txt: 'Kommo: no se pudo leer el Sheet (' + sanc.kommo.error + ')', fuera: false })
    else if (fila?.estado === 'SANCIONADO') lineas.push({ txt: `Kommo: sin leads hasta ${fila.hasta || sanc.kommo.proximo_corte}`, fuera: true })
    else lineas.push({ txt: 'Kommo: recibe leads', fuera: false })
  }
  if (u.ids.hubspot != null) {
    const q = sanc.hubspot.quitados[u.id]
    lineas.push(q ? { txt: `HubSpot: fuera del equipo desde ${fmtCorta(new Date(q.desde * 1000))}`, fuera: true } : { txt: 'HubSpot: en su equipo', fuera: false })
  }
  const fuera = lineas.some((l) => l.fuera)
  const puede = (u.ids.kommo != null && sanc.kommo.configurado && !sanc.kommo.error) || u.ids.hubspot != null
  return (
    <div>
      {lineas.map((l) => <div key={l.txt} className={'st' + (l.fuera ? ' off' : '')} title={l.txt}>{l.txt}</div>)}
      {/* Etiqueta corta para que quepa en un renglón de la tabla; el título y el aria-label dicen la acción completa. */}
      {puede && <button type="button" className="btn" disabled={ocupado} title={fuera ? `Reactivar a ${u.nombre} en la asignación de leads` : `Quitar a ${u.nombre} de la asignación de leads`} aria-label={fuera ? `Reactivar a ${u.nombre} en la asignación de leads` : `Quitar a ${u.nombre} de la asignación de leads`} onClick={() => onAccion(fuera ? 'reactivar' : 'quitar')}>{ocupado ? 'Aplicando…' : fuera ? 'Reactivar' : 'Quitar'}</button>}
      {msg && <div className="small muted" role="status" title={msg}>{msg}</div>}
    </div>
  )
}
