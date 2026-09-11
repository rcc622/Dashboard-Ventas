import { Fragment, useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent, useEffect } from 'react'
import type { Corte, Evento, Lead, LevFila, Sanciones, Usuario } from './types'
import { CRM_LABEL } from './types'
import { BUCKETS, PERFIL_LABEL, actividad, actividadDe, cotizado, dias, embudo, entrada, ep, eventosFiltrados, fechaCotizado, filasDeEventos, filasDeLeads, fmtCorta, fmtMoney, fmtMoney0, fmtN, iniciales, inicioDia, leadsFiltrados, mesNombre, metaDe, metaEnRango, pasaCrm, etiquetaRango, periodoTexto, preset, ritmo, pct, perfiles, porAsesor, primerContacto, razones, salud, serieDiaria, sumar, tipoLead, ventasFiltradas, vivo, zonaNombre, type CatEntrada, type Cotizado, type Fila, type FilaAsesor, type Filtros, type Perfil , type Preset, type PuntoPerfil, ventasReales, ventasCrm, tipoDe, VENDEDOR_LABEL, filasDeVentasReales, comparativaVentas, rolDestacado, rolNombre, cotizacionesGeneradas, filasDeCotizaciones, visitas, levantados, filasDeLevantamientos } from './metrics'
import { BarDetailPopup, BubbleChart, Bullet, DonutChart, FunnelChart, Gauge, Info, LlamadasBar, MiniAreaChart, Scatter, SortTh, StackedBar, activar, useEscape, useOutside, type DetRow, type Sort, type BubbleCol, useFocoDialogo } from './components'
import { DrillModal, type Drill } from './drill'
import { BASE_FECHA, EditarColumnas, anchos, anchoTotal, useColumnas, type ColDef } from './columnas'
import type { Termino } from './glosario'
import { aplicarSancion, cargarSanciones } from './data'
import { WidgetGrid, type Widget } from './widgets'
import { Galeria, GraficaLibre, Editor, type Grafica } from './constructor'
import { useRangos } from './rangos'

const mixto = (c: Corte) => (c.fuentes || []).length > 1
const crmCorto = (l: { crm: Lead['crm'] }) => CRM_LABEL[l.crm]
const subAsesor = (c: Corte, u: Usuario) => zonaNombre(c, u.zona) + ' · ' + (u.crm.length ? u.crm.map((x) => CRM_LABEL[x]).join(' + ') : 'app de comisiones') + ' · ' + VENDEDOR_LABEL[tipoDe(c, u)] + (u.rol && u.rol !== 'cambaceo' ? ' · ' + rolNombre(u.rol) : '')
/** Etiqueta junto al nombre cuando el vendedor no es puro leads (grupo cambaceo dentro de su zona, Randall 11-sep). */
const TagTipo = ({ c, u }: { c: Corte; u: Usuario }) => { const t = tipoDe(c, u); return t === 'leads' ? null : <span className={'tag tipo ' + t} title={t === 'cambaceo' ? 'Vendedor de cambaceo: vende sin CRM, sus ventas vienen de la app de comisiones' : 'Vende con leads del CRM y también por cambaceo'}>{t === 'cambaceo' ? 'Cambaceo' : 'Mixto'}</span> }
const avatarCls = (u: Usuario) => 'avatar' + (u.zona ? ' z-' + u.zona : '')
const RAMPA = ['var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)', 'var(--f5)', 'var(--f6)', 'var(--f6)']
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
const ORDEN_ADMIN = ['t-leads', 't-ventas', 't-vendido', 't-conversion', 't-perdida', 't-tareas', 't-cotizaciones', 't-descartes', 't-levantamientos', 'llamadas', 'salud', 'pipeline', 'ranking', 'reales', 'cotiz-metodos', 'lev-operaciones', 'visitas', 'entrada', 'embudo', 'etapas', 'contacto', 'razones', 'perfiles', 'perfiles-tabla']
const fLeads = (ls: Lead[]) => filasDeLeads(ls, () => '', undefined, { label: 'Días sin cambio', de: (l) => l.dias_sin_cambio })
const fVentas = (ls: Lead[]) => filasDeLeads(ls, (l) => (l.crm === 'comisiones' ? 'Venta registrada en la app' : 'Ganado'), (l) => l.cerrado)
/** De dónde salen las ventas, para el pie de cada lista: la app guarda solo el mes de venta. */
const FUENTE_VENTAS = (c: Corte) => (c.comisiones ? ' · app de comisiones, por mes de venta (día 1 = mes)' : ' · fecha = cierre')
const fCotizado = (ls: Lead[]) => filasDeLeads(ls, () => '', (l) => fechaCotizado(l), { label: 'Días desde la cotización', de: (l) => diasDesde(fechaCotizado(l)) })
const fEntrada = (ls: Lead[]) => filasDeLeads(ls, (l) => l.funnel_label, (l) => l.creado)
/** Los leads del asesor cuyo cotizado sigue contando: activos, con monto y cotizados dentro de la
 *  vigencia. Es la misma regla de `cotizado()`, para que la cifra y su lista no se puedan separar. */
const vigentesDe = (c: Corte, f: FilaAsesor) =>
  f.leadsActivos.filter((l) => vivo(l) && l.presupuesto > 0 && diasDesde(fechaCotizado(l)) <= c.cotizado_dias)
/** Las actividades de un asesor de ciertos tipos; antes era un ayudante dentro del renglón. */
const evDe = (f: FilaAsesor, ...tipos: string[]) => f.actividad.filter((e) => tipos.includes(e.tipo))
/** Tareas totales del asesor: completadas + vencidas + leads sin tarea. */
const totTareas = (f: FilaAsesor) => f.tareasCompletadas + f.tareasVencidas + f.sinTarea
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
  const rows = [...leads].sort((a, b) => b.dias_sin_cambio - a.dias_sin_cambio).slice(0, max)
  if (!leads.length) return <div className="muted">Sin leads activos asignados en el rango.</div>
  return (
    <div className="tblwrap" style={{ boxShadow: 'none' }}>
      <table className="ftable ltbl">
        <thead><tr><th scope="col">Lead</th><th scope="col">Etapa</th><th scope="col" className="num">Monto</th><th scope="col">Intentos<Info termino="Intentos" /></th><th scope="col">Última tarea hecha</th><th className="num">Días sin cambio</th><th>Alertas</th></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td><a href={l.link} target="_blank" rel="noreferrer" title={'Abrir en ' + CRM_LABEL[l.crm]}>{l.nombre}</a>{mixto(corte) && <span className="small muted"> · {crmCorto(l)}</span>}</td>
              <td>{tipoLead(l)} · {l.etapa}</td>
              <td className="num">{fmtMoney(l.presupuesto)}</td>
              <td>{intentos(l)}</td>
              <td>{hace(l.ult_tarea, hoy)}</td>
              <td className="num">{l.dias_sin_cambio}</td>
              <td>
                {l.pc_vencida && <span className="tag warn">Primer contacto vencido</span>}
                {l.sin_tarea && <span className="tag warn">sin tarea</span>}
                {l.tareas_vencidas > 0 && <span className="tag warn">{l.tareas_vencidas} vencida{l.tareas_vencidas > 1 ? 's' : ''}</span>}
                {l.dias_sin_cambio > 7 && <span className="tag">estancado</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {leads.length > max && <div className="small muted" style={{ padding: '8px 10px' }}>Se muestran {max} de {fmtN(leads.length)}, los más estancados primero.</div>}
    </div>
  )
}

// ---------------------------------------------------------------- Dashboard
/** Todo lo que el tablero deriva de un corte y unas fechas. Está aparte porque el tablero se arma
 *  DOS veces cuando algún widget tiene fechas propias: una con las del tablero y otra con las suyas. */
function datosDe(corte: Corte, f: Filtros) {
  const leads = leadsFiltrados(corte, f)
  const ev = eventosFiltrados(corte, f)
  const ventas = ventasFiltradas(corte, f)
  const filas = porAsesor(corte, f)
  return {
    leads, ev, ventas, filas,
    ent: entrada(corte, f.rango, f), pc: primerContacto(corte, leads), rz: razones(corte, ev), perf: perfiles(corte, filas),
    vr: ventasReales(corte, f), cg: cotizacionesGeneradas(corte, f), vis: visitas(corte, f), lev: levantados(corte, f),
  }
}
type Datos = ReturnType<typeof datosDe>

/** Quién responde a los clics de los widgets: la página que los dibuja. */
interface Acciones {
  ver: (titulo: string, filas: Fila[], sub?: string) => void
  onFicha: (uid: string) => void
  grupo: PuntoPerfil[] | null
  setGrupo: (g: PuntoPerfil[] | null) => void
}
/** Todos los widgets del tablero. Vive fuera del componente porque el tablero se arma varias veces:
 *  con las fechas de arriba, con las fechas propias de un widget, y —desde la ficha— fijado a UNA
 *  persona (Randall 10-sep: «que la vista por defecto del asesor sea como el diseño del PDF»). */
function widgetsTablero(corte: Corte, filtros: Filtros, d: Datos, ax: Acciones): Widget[] {
  const { ver, onFicha, grupo, setGrupo } = ax
  const { leads, ev, ventas, filas, ent, pc, rz, perf, vr, cg, vis, lev } = d
  const s = salud(leads)
  const con = s.ventasCon + s.huntCon, sin = s.ventasSin + s.huntSin, tot = con + sin
  const hayHunting = s.huntCon + s.huntSin > 0
  const asignados = leads.filter((l) => l.funnel === 4)
  // Tasa de pérdida: de los leads asignados en el rango (activos + ganados + perdidos), cuántos ya se perdieron.
  const perdidos = leads.filter((l) => l.funnel === 0), baseAsignados = leads.filter((l) => l.funnel === 4 || l.funnel === 5 || l.funnel === 0).length
  const et = embudo(leads, corte.etapas || [])
  const a = actividad(ev)
  // `ventas` = app de comisiones cuando el corte la trae (Randall 11-sep); el CRM solo de respaldo. Ver ventasFiltradas.
  const monto = ventas.reduce((x, l) => x + l.presupuesto, 0)
  // Ganados del CRM, solo para la tabla que compara la app contra el CRM.
  const vCrm = ventasCrm(corte, filtros)
  const crmDe = (uid: string) => { const xs = vCrm.filter((l) => l.asesor_id === uid); return { n: xs.length, monto: xs.reduce((x, l) => x + l.presupuesto, 0) } }
  const verVendido = () => ver('Vendido ' + periodo, fVentas(ventas), rango + FUENTE_VENTAS(corte))
  const metaRango = filas.reduce((x, f) => x + f.metaRango, 0)
  const metaMes = filas.reduce((x, f) => x + f.metaMes, 0)
  const cot = cotizado(leads, corte.cotizado_dias)
  const vigentes = leads.filter((l) => vivo(l) && l.presupuesto > 0 && diasDesde(fechaCotizado(l)) <= corte.cotizado_dias)
  const objetivoCot = metaMes * corte.cotizado_x
  const ranking = filas.slice(0, 8)
  const rzTot = rz.reduce((x, r) => x + r.n, 0)
  const horasPC = pc.mediana == null ? '—' : pc.mediana < 48 ? pc.mediana.toFixed(1) : String(Math.round(pc.mediana / 24))
  const unidadPC = pc.mediana == null ? 'sin dato' : pc.mediana < 48 ? 'horas (mediana)' : 'días (mediana)'
  const rango = filtros.rango.label, periodo = periodoTexto(filtros.rango)
  const rit = ritmo(monto, metaRango, filtros.rango)
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
        <button type="button" className="tile tbtn t2" onClick={() => ver('Clientes cerrados ' + periodo, fVentas(ventas), rango + FUENTE_VENTAS(corte))} aria-label={`${fmtN(ventas.length)} clientes cerrados ${periodo}. Ver detalle`}><div className="n">{fmtN(ventas.length)}</div><div className="l">Clientes cerrados {periodo}</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Clientes cerrados'], desde: 'cifras', base: 'cierre' }),
    // El número que Alejandro llamó «el más importante» (4-sep): vendido contra la meta con el ritmo del mes y color que grite.
    W('t-vendido', 'Avance contra la meta', (
        <button type="button" className={'tile tbtn t3 ritmo-' + rit.estado} onClick={verVendido} aria-label={`Vendido ${fmtMoney0(monto)} ${periodo}: ${pct(monto, metaRango)}% de la meta de ${fmtMoney0(metaRango)}. ${rit.texto}. Ver detalle`}>
          <div className="n">{fmtMoney0(monto)}</div>
          <div className="l">{pct(monto, metaRango)}% de la meta de {fmtMoney0(metaRango)} · vendido {periodo}</div>
          <Bullet value={monto} target={metaRango} expected={rit.esperado} label="Vendido" fmt={fmtMoney0} />
          <div className={'rt ' + rit.estado}>{rit.texto}</div>
        </button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Ritmo'], desde: 'cifras', base: 'cierre' }),   // 4 filas: trae medidor y frase del ritmo
    W('t-conversion', 'Conversión ventas / asignados', (
        <button type="button" className="tile tbtn t4" onClick={() => ver('Ventas que cuentan en la conversión', fVentas(ventas), `${fmtN(ventas.length)} ventas / ${fmtN(leads.length)} leads asignados · ${rango}`)} aria-label={`Conversión ${leads.length ? pct(ventas.length, leads.length) + '%' : 'sin dato'}. Ver detalle`}><div className="n">{leads.length ? pct(ventas.length, leads.length) + '%' : '—'}</div><div className="l">Ventas cerradas entre leads asignados</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Conversión'], desde: 'cifras' }),
    W('t-perdida', 'Tasa de pérdida', (
        <button type="button" className="tile tbtn t5" onClick={() => ver('Leads perdidos · asignados en el rango', filasDeLeads(perdidos, (l) => `Perdido · ${l.razon || 'sin razón'}`, (l) => l.cerrado), rango + ' · fecha = descarte')} aria-label={`Tasa de pérdida ${pct(perdidos.length, baseAsignados)}%: ${fmtN(perdidos.length)} perdidos de ${fmtN(baseAsignados)} asignados. Ver detalle`}><div className="n">{pct(perdidos.length, baseAsignados)}%</div><div className="l">{fmtN(perdidos.length)} perdidos de {fmtN(baseAsignados)} asignados</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Tasa de pérdida'], desde: 'cifras' }),
    W('t-tareas', 'Tareas completadas', (
        <button type="button" className="tile tbtn" onClick={() => verEv('Tareas completadas', 'tarea')} aria-label={`${fmtN(a.tareas)} tareas completadas. Ver detalle`}><div className="n">{fmtN(a.tareas)}</div><div className="l">Tareas completadas</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Tareas completadas'], desde: 'actividad', base: 'actividad' }),
    W('t-cotizaciones', 'Cotizaciones entregadas', (
        <button type="button" className="tile tbtn" onClick={() => verEv('Cotizaciones entregadas', 'cotizacion')} aria-label={`${fmtN(a.cotizaciones)} cotizaciones entregadas${a.recotizaciones ? `, ${fmtN(a.recotizaciones)} recotizaciones aparte` : ''}. Ver detalle`}><div className="n">{fmtN(a.cotizaciones)}</div><div className="l">Cotizaciones entregadas{a.recotizaciones ? ` · ${fmtN(a.recotizaciones)} recotizaciones aparte` : ''}</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Cotizaciones'], desde: 'actividad', base: 'actividad' }),
    W('t-descartes', 'Descartados con razón registrada', (
        <button type="button" className="tile tbtn" onClick={() => verEv('Descartados con razón registrada', 'descarte')} aria-label={`${fmtN(a.descartes)} descartados. Ver detalle`}><div className="n">{fmtN(a.descartes)}</div><div className="l">Descartados con razón registrada</div></button>
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
          <span className="sub">meta {periodo} {fmtMoney0(metaRango)} ({filas.length} asesor{filas.length === 1 ? '' : 'es'}) · <span className={'rt ' + rit.estado}>{rit.texto}</span><Info termino="Ritmo" />{monto < metaRango && ` · faltan ${fmtMoney0(metaRango - monto)}`}</span>
        </div>
        <div className="brow">
          <span className="l">Cotizado vigente</span>
          <Bullet value={cot.vigente} target={objetivoCot} label="Cotizado vigente" color="var(--c2)" fmt={fmtMoney0} />
          <Cifra label={`Cotizado vigente ${fmtMoney0(cot.vigente)}`} onClick={() => ver('Cotizado vigente', fCotizado(vigentes), `≤ ${corte.cotizado_dias} días · ${rango}`)}><span className="v">{fmtMoney0(cot.vigente)}</span></Cifra>
          <span className="sub">objetivo {fmtMoney0(objetivoCot)} = {corte.cotizado_x}× la meta mensual ({fmtMoney0(metaMes)}) · {fmtN(cot.n)} lead{cot.n === 1 ? '' : 's'} con monto<Info termino="Cotizado vigente" /></span>
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="small" style={{ fontWeight: 600 }}>Antigüedad del cotizado<Info termino="Antigüedad" /></div>
          <Antiguedad c={cot} leads={leads} onVer={(t, f) => ver(t, f, rango)} />
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
      <FunnelChart stages={et.map((e) => ({ nombre: e.nombre, n: e.n, sub: `${fmtMoney(e.monto)} · ${e.n ? e.dias.toFixed(1) + ' días en etapa' : 'sin leads'}` }))}
        onStage={(i) => ver(`${et[i].nombre} · embudo Ventas`, et[i].id === -2 ? fVentas(et[i].leads) : fLeads(et[i].leads), rango)} />
    ), { alto: 9, info: ['Embudo'] , base: 'asignacion' }),
    W('etapas', 'Monto cotizado y tiempo por etapa', (
      <>
        <div className="scrollx"><table className="ftable" aria-label="Monto cotizado y tiempo por etapa">
          <thead><tr><th scope="col">Etapa</th><th scope="col" className="num">Leads</th><th scope="col" className="num">Monto</th><th scope="col" className="num">Días promedio</th><th scope="col" className="num">Acumulado</th></tr></thead>
          <tbody>
            {et.map((e, i) => (
              <tr key={e.id}>
                <td><span className="sw" style={{ background: RAMPA[Math.min(i, RAMPA.length - 1)] }} aria-hidden="true" /><button type="button" className="nbtn" aria-label={`${e.nombre}: ${fmtN(e.n)} leads, ${fmtMoney(e.monto)}. Ver leads`}
                  onClick={() => ver(`${e.nombre} · embudo Ventas`, e.id === -2 ? fVentas(e.leads) : fLeads(e.leads), rango)}>{e.nombre}</button></td><td className="num">{fmtN(e.n)}</td><td className="num">{fmtMoney(e.monto)}</td><td className="num">{e.n ? e.dias.toFixed(1) : '—'}</td><td className="num muted">{e.acumulado.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div className="muted small" style={{ marginTop: 10 }}>
          Foto de hoy del embudo Ventas: leads en cada etapa, suma de sus presupuestos y días promedio que llevan ahí. Cierre = ganados del rango, días desde su asignación.
          {mixto(corte) ? ' El embudo Ventas de HubSpot ya es espejo del de Kommo (mismas etapas desde el 5 de septiembre); la única traducción: Lead entrante = Por contactar y Precalificación hecha = Conversación iniciada. HubSpot no tiene Hunting.' : ''}
        </div>
      </>
    ), { info: ['Monto cotizado', 'Tiempo promedio'], alto: 9 }),
    W('llamadas', 'Llamadas', (
      <div className="llam-grid">
        <LlamadasBar total={a.llamadas} ok={a.contestadas} no={a.sinContestar} onClick={() => verEv('Llamadas en el rango', 'llamada_ok', 'llamada_no')} />
        <Gauge pct={a.llamadas ? pct(a.contestadas, a.llamadas) : null} label="contestadas" size={180} />
      </div>
    ), { info: ['Llamadas'], alto: 4 , base: 'actividad' }),
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

export function AdminDashboard({ corte, filtros, onFicha }: { corte: Corte; filtros: Filtros; onFicha: (uid: string) => void }) {
  // Punto agrupado («×n») de la dispersión: lista inline para elegir a quién abrir; se limpia al cambiar filtros.
  const [grupo, setGrupo] = useState<PuntoPerfil[] | null>(null)
  useEffect(() => setGrupo(null), [filtros])
  const [drill, setDrill] = useState<Drill | null>(null)
  const ver = (titulo: string, filas: Fila[], sub?: string) => setDrill({ titulo, filas, sub })
  // Fechas propias por widget (Randall 10-sep: «si un widget siempre debe mostrar la info histórica,
  // que la muestre y no conflictúe con el date range del tablero»). Sin fechas propias se sigue al tablero.
  const { rangos, fijarRango } = useRangos('admin')
  const desdeMaximo = useMemo(() => { let m = corte.desde; for (const l of corte.leads) { if (l.asignacion && l.asignacion < m) m = l.asignacion; if (l.creado && l.creado < m) m = l.creado } return m }, [corte])
  const conRango = (p: Preset): Filtros => ({ ...filtros, rango: preset(p, new Date(), desdeMaximo) })
  // «Este mes» / «Máximo»: el nombre del periodo de arriba, para que la etiqueta de cada widget diga
  // qué está mirando aunque siga al tablero (Randall 10-sep, como los widgets de HubSpot).
  const nombreTablero = filtros.rango.label.includes(': ') ? filtros.rango.label.split(': ')[0] : 'Fechas elegidas'
  const fechasDe = (p?: Preset) => { const r = p ? conRango(p).rango : filtros.rango; return etiquetaRango(null, r.ini, r.fin) }
  const filtrosDe = (id: string): Filtros => (rangos[id] ? conRango(rangos[id]) : filtros)
  // Lo que el constructor necesita para dejar elegir las fechas de la gráfica que se está creando.
  const fechasCtor = { de: (id: string) => rangos['g:' + id], filtros: (id: string) => filtrosDe('g:' + id), fijar: (id: string, p: Preset | null) => fijarRango('g:' + id, p) }

  const construir = (f: Filtros, dd: Datos): Widget[] => widgetsTablero(corte, f, dd, { ver, onFicha, grupo, setGrupo })

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
        fechas={{ por: rangos, fijar: fijarRango, tablero: nombreTablero, fechas: fechasDe }}
        taller={{
          render: (g: Grafica) => <GraficaLibre corte={corte} filtros={filtrosDe('g:' + g.id)} g={g} onDrill={setDrill} />,
          galeria: (p) => <Galeria corte={corte} filtros={filtros} quitados={p.quitados} onAgregar={p.onAgregar} onCrear={p.onCrear} onClose={p.onClose} fechas={fechasCtor} />,
          editor: (p) => <Editor corte={corte} filtros={filtrosDe('g:' + p.g.id)} g={p.g} rango={rangos['g:' + p.g.id]} onRango={(x) => fijarRango('g:' + p.g.id, x)} onGuardar={p.onGuardar} onClose={p.onClose} />,
        }} />
      {drill && <DrillModal d={drill} onClose={() => setDrill(null)} />}
    </>
  )
}

// ---------------------------------------------------------------- Asesores
interface Pop { fila: FilaAsesor; x: number; y: number }
interface Det { title: string; total: number; rows: DetRow[]; anchor: DOMRect }
type Key = 'nombre' | 'vendido' | 'cotizado' | 'leads' | 'llamadas' | 'tareas' | 'pc' | 'cotiz' | 'desc' | 'lev' | 'equipo' | 'tipo' | 'ventas' | 'estanc' | 'sintarea'
  | 'asignados' | 'totales' | 'conversion' | 'perdida' | 'ticket' | 'cumpl' | 'actividad'
const valor = (f: FilaAsesor, k: Key): number | string =>
  k === 'nombre' ? f.u.nombre : k === 'vendido' ? f.montoVentas : k === 'cotizado' ? f.cotizado.vigente : k === 'leads' ? f.leadsActivos.length
    : k === 'llamadas' ? f.llamadas : k === 'tareas' ? f.tareasCompletadas + f.tareasVencidas + f.sinTarea : k === 'pc' ? f.pcVencidas
      : k === 'cotiz' ? f.cotizaciones : k === 'desc' ? f.descartes : k === 'lev' ? f.levantamientos
        : k === 'equipo' ? f.u.zona : k === 'tipo' ? f.tipo : k === 'ventas' ? f.ventas : k === 'estanc' ? f.estancados : k === 'sintarea' ? f.sinTarea
          : k === 'asignados' || k === 'totales' ? f.asignados.length
            : k === 'conversion' ? (f.asignados.length ? f.ganados / f.asignados.length : -1)
              : k === 'perdida' ? (f.asignados.length ? f.perdidos / f.asignados.length : -1)
                : k === 'ticket' ? (f.ventas ? f.montoVentas / f.ventas : -1)
                  : k === 'cumpl' ? (f.metaRango ? f.montoVentas / f.metaRango : -1) : actividadDe(f)

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
    { id: 'conversion', label: 'Conversión', ancho: 130, fecha: 'asignacion', cnt: true, oculta: true, info: 'Conversión',
      celda: (f) => (<td className="cnt">{f.asignados.length ? `${pct(f.ganados, f.asignados.length)}%` : '—'}</td>) },
    { id: 'perdida', label: 'Tasa de pérdida', ancho: 155, fecha: 'asignacion', cnt: true, oculta: true, info: 'Tasa de pérdida',
      celda: (f) => (<td className="cnt">{f.asignados.length ? `${pct(f.perdidos, f.asignados.length)}%` : '—'}</td>) },
    { id: 'ticket', label: 'Ticket promedio', ancho: 160, fecha: 'cierre', cnt: true, oculta: true,
      celda: (f) => (<td className="cnt">{f.ventas ? fmtMoney0(f.montoVentas / f.ventas) : '—'}</td>) },
    { id: 'cumpl', label: 'Cumplimiento', ancho: 130, fecha: 'cierre', cnt: true, oculta: true, info: 'Cumplimiento',
      celda: (f) => (<td className="cnt">{pct(f.montoVentas, f.metaRango)}%</td>) },
    { id: 'actividad', label: 'Actividad total', ancho: 190, fecha: 'actividad', oculta: true,
      celda: (f) => (<td><div className="mc">
        <div className="v">{fmtN(actividadDe(f))}</div>
        {/* Partida por TIPO (Randall 9-sep): tareas de seguimiento, llamadas contestadas, llamadas
            sin contestar y levantamientos. Cada tramo abre su lista. */}
        <StackedBar segs={[{ val: f.tareasCompletadas, cls: 'seg-comp' }, { val: f.contestadas, cls: 'seg-ok' }, { val: f.sinContestar, cls: 'seg-warn' }, { val: f.levantamientos, cls: 'seg-neutral' }]}
          total={actividadDe(f)} max={maxAct}
          title={`Actividad de ${f.u.nombre}: ${f.tareasCompletadas} tareas completadas, ${f.contestadas} llamadas contestadas, ${f.sinContestar} sin contestar, ${f.levantamientos} levantamientos. Abrir detalle`}
          onClick={(e) => detalle(e, 'Actividad · ' + f.u.nombre, actividadDe(f), [
            { label: 'Tareas de seguimiento completadas', val: f.tareasCompletadas, onVer: () => ver(`Tareas completadas · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'tarea')), rango) },
            { label: 'Llamadas contestadas', val: f.contestadas, onVer: () => ver(`Llamadas contestadas · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'llamada_ok')), rango) },
            { label: 'Llamadas sin contestar', val: f.sinContestar, onVer: () => ver(`Llamadas sin contestar · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'llamada_no')), rango) },
            { label: 'Levantamientos agendados', val: f.levantamientos, onVer: () => ver(`Levantamientos · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'levantamiento')), rango) }])} />
        <div className="c">{fmtN(f.tareasCompletadas)} tareas · {fmtN(f.llamadas)} llamadas</div>
        <div className="c">{fmtN(f.levantamientos)} levantamientos</div>
      </div></td>) },
    { id: 'vendido', label: 'Vendido', ancho: 170, fecha: 'cierre', info: 'Vendido',
      celda: (f) => (<td><div className="mc">
                          <button type="button" className="v nbtn" aria-label={`${fmtMoney0(f.montoVentas)} vendidos por ${f.u.nombre}. Ver las ventas`} onClick={() => ver(`Vendido · ${f.u.nombre}`, fVentas(ventasFiltradas(corte, { ...filtros, asesor: f.u.id })), rango + FUENTE_VENTAS(corte))}>{fmtMoney0(f.montoVentas)}</button>
                          <Bullet sm value={f.montoVentas} target={f.metaRango} expected={f.esperado} label={'Vendido de ' + f.u.nombre} fmt={fmtMoney0} />
                          <div className="c" title={`${pct(f.montoVentas, f.metaRango)}% de la meta de ${fmtMoney0(f.metaRango)}`}>{pct(f.montoVentas, f.metaRango)}% de {fmtMoney0(f.metaRango)}</div>
                          <div className={'c rt ' + f.ritmo.estado} title={f.ritmo.corto}>{f.ritmo.corto}</div>
                        </div></td>) },
    { id: 'cotizado', label: 'Cotizado vigente', ancho: 185, fecha: 'asignacion', info: 'Cotizado vigente',
      celda: (f) => (<td><div className="mc">
                          {/* Avance contra el objetivo 10× (Randall 6-sep): «si lleva 1.4 M, qué tanto le falta para el factor 10×». */}
                          <button type="button" className="v nbtn" aria-label={`${fmtMoney0(f.cotizado.vigente)} cotizados y vigentes de ${f.u.nombre}. Ver los leads`} onClick={() => ver(`Cotizado vigente · ${f.u.nombre}`, fCotizado(vigentesDe(corte, f)), `cotizados hace ${corte.cotizado_dias} días o menos`)}>{fmtMoney0(f.cotizado.vigente)}</button>
                          <Bullet sm value={f.cotizado.vigente} target={f.metaMes * corte.cotizado_x} label={'Cotizado vigente de ' + f.u.nombre + ' contra el objetivo ' + corte.cotizado_x + '×'} color="var(--c2)" fmt={fmtMoney0} />
                          <div className="c" title={`${pct(f.cotizado.vigente, f.metaMes * corte.cotizado_x)}% del objetivo ${corte.cotizado_x}× la meta mensual (${fmtMoney0(f.metaMes * corte.cotizado_x)})`}>{pct(f.cotizado.vigente, f.metaMes * corte.cotizado_x)}% de {fmtMoney0(f.metaMes * corte.cotizado_x)} ({corte.cotizado_x}×)</div>
                          <div className="c" title={f.cotizado.viejo > 0 ? `${fmtMoney(f.cotizado.viejo)} cotizados hace más de ${corte.cotizado_dias} días: ya no cuentan` : `Objetivo: ${corte.cotizado_x} veces la meta mensual`}>{f.cotizado.viejo > 0 ? `+${fmtMoney(f.cotizado.viejo)} viejo` : `objetivo ${corte.cotizado_x}× la meta`}</div>
                        </div></td>) },
    { id: 'leads', label: 'Leads activos', ancho: 155, fecha: 'asignacion', info: 'Leads activos',
      celda: (f) => (<td><div className="mc">
                          <button type="button" className="v nbtn" aria-label={`${fmtN(f.leadsActivos.length)} leads activos de ${f.u.nombre}. Ver la lista`} onClick={() => ver(`Leads activos · ${f.u.nombre}`, fLeads(f.leadsActivos), rango)}>{fmtN(f.leadsActivos.length)}</button>
                          <div className="minibar" aria-hidden="true"><i style={{ width: pct(f.leadsActivos.length, maxLeads) + '%' }} /></div>
                          <div className="c">{f.estancados > 0 ? `${fmtN(f.estancados)} estancado${f.estancados === 1 ? '' : 's'}` : 'sin estancados'}</div>
                          <div className="c" title="Suma del precio cotizado a sus leads activos">{f.presupuesto > 0 ? `${fmtMoney0(f.presupuesto)} en presupuesto` : 'sin presupuesto'}</div>
                        </div></td>) },
    { id: 'llamadas', label: 'Llamadas', ancho: 155, fecha: 'actividad', info: 'Llamadas',
      celda: (f) => (<td><div className="mc">
                          <div className="v">{fmtN(f.llamadas)}</div>
                          <StackedBar segs={[{ val: f.contestadas, cls: 'seg-comp' }, { val: f.sinContestar, cls: 'seg-warn' }]} total={f.llamadas} max={maxLlam}
                            title={`Llamadas de ${f.u.nombre}: ${f.contestadas} contestadas, ${f.sinContestar} sin contestar. Abrir detalle`}
                            onClick={(e) => detalle(e, 'Llamadas · ' + f.u.nombre, f.llamadas, [
                              { label: 'Contestadas', val: f.contestadas, onVer: () => ver(`Llamadas contestadas · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'llamada_ok')), rango) },
                              { label: 'Sin contestar', val: f.sinContestar, onVer: () => ver(`Llamadas sin contestar · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'llamada_no')), rango) }])} />
                          <div className="c">{fmtN(f.contestadas)} contestadas</div>
                          <div className="c">{fmtN(f.sinContestar)} sin contestar</div>
                        </div></td>) },
    { id: 'tareas', label: 'Tareas', ancho: 180, fecha: 'actividad', info: 'Tareas',
      celda: (f) => (<td><div className="mc">
                          <div className="v">{fmtN(totTareas(f))}</div>
                          <StackedBar segs={[{ val: f.tareasCompletadas, cls: 'seg-comp' }, { val: f.tareasVencidas, cls: 'seg-alert' }, { val: f.sinTarea, cls: 'seg-empty' }]} total={totTareas(f)} max={maxTar}
                            title={`Tareas de ${f.u.nombre}: ${f.tareasCompletadas} completadas, ${f.tareasVencidas} vencidas, ${f.sinTarea} leads sin tarea. Abrir detalle`}
                            onClick={(e) => detalle(e, 'Tareas · ' + f.u.nombre, totTareas(f), [
                              { label: 'Completadas', val: f.tareasCompletadas, onVer: () => ver(`Tareas completadas · ${f.u.nombre}`, filasDeEventos(corte, evDe(f, 'tarea')), rango) },
                              { label: 'Vencidas', val: f.tareasVencidas, onVer: () => ver(`Leads con tareas vencidas · ${f.u.nombre}`, filasDeLeads(f.leadsActivos.filter((l) => l.tareas_vencidas > 0), () => '', undefined, { label: 'Tareas vencidas', de: (l) => l.tareas_vencidas }), rango) },
                              { label: 'Leads sin tarea', val: f.sinTarea, onVer: () => ver(`Leads sin tarea · ${f.u.nombre}`, fLeads(f.leadsActivos.filter((l) => l.sin_tarea)), rango) }])} />
                          <div className="c">{fmtN(f.tareasCompletadas)} completadas</div>
                          <div className="c" title={`${fmtN(f.tareasVencidas)} tareas vencidas · ${fmtN(f.sinTarea)} leads sin tarea`}>{fmtN(f.tareasVencidas)} vencidas · {fmtN(f.sinTarea)} sin tarea</div>
                        </div></td>) },
    { id: 'pc', label: '1er cont. vencido', ancho: 165, fecha: 'asignacion', cnt: true, info: 'Primer contacto vencido',
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
    { id: 'ventas', label: 'Ventas cerradas', ancho: 160, fecha: 'cierre', cnt: true, oculta: true,
      celda: (f) => (<td className="cnt">{f.ventas > 0 ? <button type="button" className="nbtn celln" aria-label={`${f.ventas} ventas cerradas de ${f.u.nombre}. Ver la lista`} onClick={() => ver(`Ventas cerradas · ${f.u.nombre}`, fVentas(ventasFiltradas(corte, { ...filtros, asesor: f.u.id })), rango)}>{f.ventas}</button> : '0'}</td>) },
    { id: 'estanc', label: 'Estancados', ancho: 135, fecha: 'asignacion', cnt: true, oculta: true,
      celda: (f) => (<td className="cnt">{f.estancados > 0 ? <button type="button" className="nbtn celln" aria-label={`${f.estancados} leads estancados de ${f.u.nombre}. Ver la lista`} onClick={() => ver(`Leads estancados · ${f.u.nombre}`, fLeads(f.leadsActivos.filter((l) => l.dias_sin_cambio >= 7)), rango)}>{f.estancados}</button> : '0'}</td>) },
    { id: 'sintarea', label: 'Leads sin tarea', ancho: 155, fecha: 'asignacion', cnt: true, oculta: true,
      celda: (f) => (<td className="cnt">{f.sinTarea > 0 ? <button type="button" className="nbtn celln" aria-label={`${f.sinTarea} leads sin tarea de ${f.u.nombre}. Ver la lista`} onClick={() => ver(`Leads sin tarea · ${f.u.nombre}`, fLeads(f.leadsActivos.filter((l) => l.sin_tarea)), rango)}>{f.sinTarea}</button> : '0'}</td>) },
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
              <tr key={f.u.id}>{vis.map((c) => <Fragment key={c.id}>{f.tipo === 'cambaceo' && (c.fecha === 'asignacion' || c.fecha === 'actividad') ? <td className={c.cnt ? 'cnt muted' : 'muted'} title="Vendedor de cambaceo: no registra en el CRM">—</td> : c.celda(f)}</Fragment>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend" style={{ marginTop: 8 }}><span><i className="lg-comp" aria-hidden="true" />Contestadas · completadas</span><span><i className="lg-warn" aria-hidden="true" />Sin contestar</span><span><i style={{ background: 'var(--warn)' }} aria-hidden="true" />Tareas vencidas</span><span><i style={{ background: 'repeating-linear-gradient(45deg, var(--neutral) 0 2px, #fff 2px 4px)' }} aria-hidden="true" />Leads sin tarea</span><span>Barra de Vendido: marca negra = meta del rango, gris = esperado a hoy</span><span>Clic en una barra abre el desglose y de ahí la lista de registros</span></div>
      {pop && <AsesorPopup corte={corte} filtros={filtros} fila={pop.fila} x={pop.x} y={pop.y} onClose={() => setPop(null)} onFicha={() => { setPop(null); onFicha(pop.fila.u.id) }} />}
      {det && <BarDetailPopup anchor={det.anchor} title={det.title} total={det.total} rows={det.rows} onClose={() => setDet(null)} />}
      {drill && <DrillModal d={drill} onClose={() => setDrill(null)} />}
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
  const activos = corte.leads.filter((l) => pasaCrm(l.crm, filtros) && l.asesor_id === fila.u.id && vivo(l) && l.asignacion >= ini && l.asignacion < fin).sort((p, q) => q.dias_sin_cambio - p.dias_sin_cambio)
  const serie = serieDiaria(fila.leadsActivos.map((l) => l.asignacion), filtros.rango)
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
              <span className="it">{dias(l.dias_sin_cambio)} sin cambio</span>
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
const FICHA_COMPARTIDOS = ['t-cotizaciones', 't-descartes', 't-levantamientos', 't-leads', 't-ventas', 't-conversion', 't-perdida', 't-tareas', 'embudo', 'etapas', 'contacto', 'llamadas']
/** El orden con el que abre la ficha: evolución, el resumen de la persona, sus cifras, el embudo,
 *  cómo atiende, su actividad y sus pendientes. */
const ORDEN_FICHA = [
  'ev', 'ev-tabla',
  'ventas', 'cumplimiento', 'cierre',
  't-cotizaciones', 'cotizado', 't-descartes', 't-levantamientos',
  't-leads', 't-ventas', 't-conversion', 't-perdida', 't-tareas',
  'reales', 'embudo', 'etapas', 'contacto', 'llamadas',
  'actividad', 'leads', 'tareas',
]
/** La meta de porcentaje de cierre mientras no viva en Configuración (Randall la puso en el PDF). */
const META_CIERRE = 0.10

/** Ficha del asesor. Es un WidgetGrid (clave «ficha», compartida entre asesores): cada tarjeta se
 *  mueve, estira o quita igual que en el Dashboard. Cotizado vigente y su antigüedad van en UNA
 *  tarjeta; la actividad respeta el rango del filtro (por día hasta 21 días, si no por semana con
 *  clic para abrir la semana). */
export function Ficha({ corte, filtros, uid, onBack }: { corte: Corte; filtros: Filtros; uid: string; onBack: () => void }) {
  const u = corte.usuarios.find((x) => x.id === uid)
  // Su ficha muestra TODO lo suyo: el equipo y el CRM elegidos arriba no la recortan (si el tablero
  // estaba en Kommo y la persona trabaja en HubSpot, su ficha salía vacía).
  const f: Filtros = { ...filtros, asesor: uid, equipo: null, crm: { kommo: true, hubspot: true } }
  const leads = useMemo(() => leadsFiltrados(corte, f), [corte, filtros, uid])   // eslint-disable-line react-hooks/exhaustive-deps
  const ventas = useMemo(() => ventasFiltradas(corte, f), [corte, filtros, uid]) // eslint-disable-line react-hooks/exhaustive-deps
  const [zoom, setZoom] = useState<{ ini: Date; dias: number; texto: string } | null>(null)   // semana o mes abierto en Actividad por día; null = vista del rango
  const [drill, setDrill] = useState<Drill | null>(null)
  useEffect(() => setZoom(null), [filtros.rango.ini, filtros.rango.fin, uid])
  // Fechas propias por widget, igual que en el tablero general (Randall 10-sep: «en la vista del
  // asesor no está lo del date range del widget»). La elección se comparte entre fichas: si dejas
  // «Ventas» en Máximo, se ve en Máximo para cualquier asesor.
  const { rangos, fijarRango } = useRangos('ficha')
  const desdeMaximo = useMemo(() => { let m = corte.desde; for (const l of corte.leads) { if (l.asignacion && l.asignacion < m) m = l.asignacion; if (l.creado && l.creado < m) m = l.creado } return m }, [corte])
  const conRango = (pz: Preset): Filtros => ({ ...f, rango: preset(pz, new Date(), desdeMaximo) })
  const filtrosDe = (id: string): Filtros => (rangos[id] ? conRango(rangos[id]) : f)
  const fechasCtor = { de: (id: string) => rangos['g:' + id], filtros: (id: string) => filtrosDe('g:' + id), fijar: (id: string, pz: Preset | null) => fijarRango('g:' + id, pz) }
  const nombreTablero = filtros.rango.label.includes(': ') ? filtros.rango.label.split(': ')[0] : 'Fechas elegidas'
  const fechasDe = (pz?: Preset) => { const r = pz ? conRango(pz).rango : f.rango; return etiquetaRango(null, r.ini, r.fin) }
  // Los mismos widgets del tablero, pero de esta persona. Se arman una vez con las fechas de arriba
  // y una por cada periodo que alguien haya fijado, como en el tablero general.
  const acciones = useMemo(() => ({ ver: (titulo: string, filas: Fila[], sub?: string) => setDrill({ titulo, filas, sub }), onFicha: () => {}, grupo: null, setGrupo: () => {} }), [])
  const compartidos = (ff: Filtros) => widgetsTablero(corte, ff, datosDe(corte, ff), acciones).filter((w) => FICHA_COMPARTIDOS.includes(w.id))
  const baseCompartidos = useMemo(() => compartidos(f), [corte, filtros, uid])   // eslint-disable-line react-hooks/exhaustive-deps
  const otrosCompartidos = useMemo(() => {
    const m = new Map<string, Widget[]>()
    for (const pz of new Set(Object.values(rangos))) m.set(pz, compartidos(conRango(pz)))
    return m
  }, [corte, filtros, uid, rangos])   // eslint-disable-line react-hooks/exhaustive-deps
  const delTablero = baseCompartidos.map((w) => (rangos[w.id] && otrosCompartidos.get(rangos[w.id])?.find((x) => x.id === w.id)) || w)
  if (!u) return <div className="panel">Asesor no encontrado. <button type="button" className="btn" onClick={onBack}>← Volver</button></div>
  const rango = filtros.rango.label, periodo = periodoTexto(filtros.rango)
  const metaMes = metaDe(corte, u), metaRango = metaEnRango(metaMes, filtros.rango)
  const monto = ventas.reduce((s, l) => s + l.presupuesto, 0)
  const rit = ritmo(monto, metaRango, filtros.rango)
  const activos = leads.filter(vivo)
  const cot = cotizado(activos, corte.cotizado_dias)
  const vigentes = activos.filter((l) => l.presupuesto > 0 && diasDesde(fechaCotizado(l)) <= corte.cotizado_dias)
  const objetivo = metaMes * corte.cotizado_x
  const serie = serieDiaria(ventas.map((l) => l.cerrado), filtros.rango, true)
  const vr = ventasReales(corte, f)
  // Actividad: el rango manda. Hasta 21 días por día; hasta 26 semanas por semana; más largo (p. ej. «Máximo» desde 2023)
  // por mes, siempre en una sola fila. Una semana o un mes se abren por día con un clic.
  const ini = filtros.rango.ini, fin = filtros.rango.fin
  const evRango = corte.eventos.filter((e) => pasaCrm(e.crm, filtros) && e.asesor_id === uid && e.ts >= ini && e.ts < fin)
  const burbujas = (ev: Evento[]) => [
    { n: ev.filter((e) => e.tipo === 'llamada_ok' || e.tipo === 'llamada_no').length, title: 'Llamadas' },
    { n: ev.filter((e) => e.tipo === 'tarea').length, cls: 'w', title: 'Tareas completadas' },
    { n: ev.filter((e) => e.tipo === 'cotizacion').length, cls: 'e', title: 'Cotizaciones entregadas' },
    { n: ev.filter((e) => e.tipo === 'levantamiento').length, cls: 'l', title: 'Levantamientos solicitados' },
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
    vista = `Por día · ${rango}`
  } else if (diasRango <= 26 * 7) {
    const semanas: Date[] = []
    for (let d = lunes(new Date(ini * 1000)); ep(d) < fin; d = sumar(d, 7)) semanas.push(d)
    evVista = evRango
    cols = semanas.map((d) => ({ label: fmtCorta(d), title: `Semana del ${fmtCorta(d)}. Clic para ver por día`, bubbles: burbujas(entre(Math.max(ini, ep(d)), Math.min(fin, ep(sumar(d, 7))))) }))
    onCol = (i) => setZoom({ ini: semanas[i], dias: 7, texto: `Semana del ${fmtCorta(semanas[i])} al ${fmtCorta(sumar(semanas[i], 6))}` })
    vista = `Por semana · ${rango} · clic en una semana para verla por día`
  } else {
    const meses: Date[] = []
    for (let d = new Date(new Date(ini * 1000).getFullYear(), new Date(ini * 1000).getMonth(), 1); ep(d) < fin; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) meses.push(d)
    const paso = Math.ceil(meses.length / 16)   // con muchos meses, una etiqueta cada `paso` columnas (el título trae todas)
    const nombre = (d: Date) => `${mesNombre(d)} ${String(d.getFullYear()).slice(2)}`
    evVista = evRango
    cols = meses.map((d, i) => { const sig = new Date(d.getFullYear(), d.getMonth() + 1, 1); return { label: i % paso === 0 ? nombre(d) : '', title: `${nombre(d)}. Clic para ver por día`, bubbles: burbujas(entre(Math.max(ini, ep(d)), Math.min(fin, ep(sig)))) } })
    onCol = (i) => { const d = meses[i]; setZoom({ ini: d, dias: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), texto: `${mesNombre(d)} de ${d.getFullYear()}` }) }
    vista = `Por mes · ${rango} · clic en un mes para verlo por día`
  }
  const tareas = corte.tareas_abiertas.filter((t) => pasaCrm(t.crm, filtros) && t.asesor_id === uid).sort((p, q) => p.vence - q.vence).slice(0, 24)
  const hoy = ep(inicioDia(new Date()))
  const widgets: Widget[] = [
    wg('ventas', 'Ventas · ' + rango, (
      <div className="kcard hero"><div className="l">Ventas · {rango}</div><div className="n"><Cifra label={`${ventas.length} ventas, ${fmtMoney0(monto)}`} onClick={() => setDrill({ titulo: `Ventas de ${u.nombre}`, filas: fVentas(ventas), sub: rango + FUENTE_VENTAS(corte) })}><b>{ventas.length}</b> <span style={{ fontSize: 22 }}>{fmtMoney0(monto)}</span></Cifra></div><MiniAreaChart values={serie} height={56} /><div className="small muted">Conversión {leads.length ? pct(ventas.length, leads.length) + '%' : '—'}: {ventas.length} ventas / {leads.length} leads asignados en el rango<Info termino="Conversión" /></div></div>
    ), { plain: true, span: 2, cls: 'wcard', info: ['Vendido'] }),
    wg('cumplimiento', 'Cumplimiento', (
      <div className={'kcard k2 ritmo-' + rit.estado}><div className="l">Cumplimiento<Info termino={['Cumplimiento', 'Ritmo']} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}><div className="n">{pct(monto, metaRango)}%</div><Gauge pct={pct(monto, metaRango)} label="meta" size={120} color={rit.estado === 'atras' ? 'var(--warn)' : 'var(--c4)'} /></div>
        <div className={'rt ' + rit.estado}>{rit.texto}</div>
        <div className="small muted">meta {periodo} {fmtMoney0(metaRango)} ({fmtMoney0(metaMes)} al mes){monto < metaRango && ` · faltan ${fmtMoney0(metaRango - monto)}`}</div></div>
    ), { plain: true, span: 2, cls: 'wcard' }),
    wg('cotizado', 'Cotizado vigente y antigüedad', (
      <div className="kcard k3"><div className="cot-grid">
        <div><div className="l">Cotizado vigente<Info termino="Cotizado vigente" /></div><div className="n"><Cifra label={`Cotizado vigente ${fmtMoney0(cot.vigente)}`} onClick={() => setDrill({ titulo: `Cotizado vigente de ${u.nombre}`, filas: fCotizado(vigentes), sub: `≤ ${corte.cotizado_dias} días · ${rango}` })}>{fmtMoney0(cot.vigente)}</Cifra></div>
          <Bullet value={cot.vigente} target={objetivo} label="Cotizado vigente" color="var(--c2)" fmt={fmtMoney0} />
          <div className="small muted" style={{ marginTop: 6 }}>objetivo {fmtMoney0(objetivo)} = {corte.cotizado_x}× la meta mensual · {fmtN(cot.n)} lead{cot.n === 1 ? '' : 's'} con monto<Info termino="Pipeline 10×" /></div></div>
        <div><div className="l">Antigüedad del cotizado<Info termino="Antigüedad" /></div>
          <Antiguedad c={cot} leads={activos} onVer={(t, filas) => setDrill({ titulo: `${t} · ${u.nombre}`, filas, sub: rango })} />
          <div className="small muted" style={{ marginTop: 6 }}>{cot.viejo > 0 ? `${fmtMoney(cot.viejo)} en ${fmtN(cot.nViejo)} leads pasan de ${corte.cotizado_dias} días: ya no cuentan.` : 'Nada pasa de ' + corte.cotizado_dias + ' días.'}</div></div>
      </div></div>
    ), { plain: true, span: 2, cls: 'wcard', alto: 6 }),
    ...(corte.comisiones ? [wg('reales', 'Ventas reales · Comisiones', (
      <div className="kcard k4"><div className="l">Ventas reales · Comisiones<Info termino="Ventas reales" /></div>
        <div className="n"><Cifra label={`${vr.n} ventas reales, ${fmtMoney0(vr.total)}`} onClick={() => setDrill({ titulo: `Ventas reales de ${u.nombre}`, filas: filasDeVentasReales(vr.ventas), sub: rango + ' · mes de venta en la app de comisiones' })}><b>{vr.n}</b> <span style={{ fontSize: 22 }}>{fmtMoney0(vr.total)}</span></Cifra></div>
        {vr.n > 0 ? (
          <div className="reales-lista">{vr.ventas.slice(0, 6).map((v) => <div className="r" key={v.id}><span className="nm">{v.cliente || 'Sin nombre'}</span><span className="m">{v.mes_texto}</span><span>{fmtMoney0(v.monto)}</span></div>)}{vr.ventas.length > 6 && <div className="muted">+{vr.ventas.length - 6} más en el detalle</div>}</div>
        ) : <div className="small muted">Sin ventas en la app de comisiones para este rango.{corte.comisiones.error ? ` Error al leer la app: ${corte.comisiones.error}` : ''}</div>}
        <div className="small muted" style={{ marginTop: 6 }}>CRM: {ventas.length} ganadas por {fmtMoney0(monto)} en el rango.</div></div>
    ), { plain: true, span: 2, cls: 'wcard' })] : []),
    wg('actividad', 'Actividad', (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <span className="small muted" aria-live="polite">{vista}</span>
          {zoom && <button type="button" className="nbtn" onClick={() => setZoom(null)}>‹ Volver a todo el periodo</button>}
        </div>
        <BubbleChart cols={cols} onCol={onCol} />
        <div className="small muted" style={{ marginTop: 8 }}>Cada columna es {zoom || diasRango <= 21 ? 'un día' : diasRango <= 26 * 7 ? 'una semana' : 'un mes'} y cada bolita cuenta lo que el asesor registró de cada tipo: entre más grande, más actividad.</div>
        <div className="legend"><span><i className="lg-comp" aria-hidden="true" />Llamadas</span><span><i className="lg-warn" aria-hidden="true" />Tareas completadas</span><span><i className="lg-e" aria-hidden="true" />Cotizaciones entregadas</span><span><i className="lg-l" aria-hidden="true" />Levantamientos solicitados</span>
          <button type="button" onClick={() => setDrill({ titulo: `Actividad de ${u.nombre} · ${zoom ? zoom.texto : rango}`, filas: filasDeEventos(corte, evVista) })}>Ver las {fmtN(evVista.length)} actividades ›</button></div>
      </>
    ), { span: 6, alto: 7, info: ['Actividad'] }),
    wg('leads', `Leads activos · ${fmtN(activos.length)}`, <LeadsTabla corte={corte} leads={activos} />, { span: 6, info: ['Leads activos', 'Estancados'] }),
    wg('tareas', 'Tareas abiertas', (
      <>
        {!tareas.length && <div className="muted">Sin tareas abiertas en el CRM para este asesor.</div>}
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
    ), { span: 6, info: ['Tareas'] }),
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
      <button type="button" className={'tile tbtn t4 ritmo-' + (leads.length && ventas.length / leads.length >= META_CIERRE ? 'cumplida' : 'atras')}
        aria-label={`Porcentaje de cierre ${leads.length ? pct(ventas.length, leads.length) : 0}%, meta ${Math.round(META_CIERRE * 100)}%. Ver las ventas`}
        onClick={() => setDrill({ titulo: `Ventas de ${u.nombre}`, filas: fVentas(ventas), sub: rango + FUENTE_VENTAS(corte) })}>
        <div className="n">{leads.length ? pct(ventas.length, leads.length) : 0}%</div>
        <div className="l">{fmtN(ventas.length)} cerrados de {fmtN(leads.length)} leads asignados {periodo}</div>
        <Bullet value={leads.length ? ventas.length / leads.length : 0} target={META_CIERRE} label="Porcentaje de cierre" fmt={(n) => Math.round(n * 100) + '%'} />
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
        fechas={{ por: rangos, fijar: fijarRango, tablero: nombreTablero, fechas: fechasDe }}
        taller={{
        render: (g: Grafica) => <GraficaLibre corte={corte} filtros={filtrosDe('g:' + g.id)} g={g} onDrill={setDrill} />,
        galeria: (p) => <Galeria corte={corte} filtros={f} quitados={p.quitados} onAgregar={p.onAgregar} onCrear={p.onCrear} onClose={p.onClose} fechas={fechasCtor} />,
        editor: (p) => <Editor corte={corte} filtros={filtrosDe('g:' + p.g.id)} g={p.g} rango={rangos['g:' + p.g.id]} onRango={(x) => fijarRango('g:' + p.g.id, x)} onGuardar={p.onGuardar} onClose={p.onClose} />,
      }} />
      {drill && <DrillModal d={drill} onClose={() => setDrill(null)} />}
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
