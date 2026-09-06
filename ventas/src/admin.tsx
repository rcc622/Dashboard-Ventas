import { useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent, useEffect } from 'react'
import type { Corte, Evento, Lead, Sanciones, Usuario } from './types'
import { CRM_LABEL } from './types'
import { BUCKETS, PERFIL_LABEL, actividad, cotizado, dias, embudo, entrada, ep, etapaDe, eventosFiltrados, fechaCotizado, filasDeEventos, filasDeLeads, fmtCorta, fmtMoney, fmtMoney0, fmtN, iniciales, inicioDia, leadsFiltrados, mesNombre, metaDe, metaEnRango, pasaCrm, periodoTexto, ritmo, pct, perfiles, porAsesor, primerContacto, razones, salud, serieDiaria, sumar, tipoLead, ventasFiltradas, vivo, zonaNombre, type CatEntrada, type Cotizado, type Fila, type FilaAsesor, type Filtros, type Perfil , type PuntoPerfil, ventasReales, filasDeVentasReales, comparativaVentas, rolDestacado, rolNombre } from './metrics'
import { BarDetailPopup, BubbleChart, Bullet, DonutChart, FunnelChart, Gauge, Info, LlamadasBar, MiniAreaChart, Scatter, SortTh, StackedBar, activar, useEscape, useOutside, type DetRow, type Sort, type BubbleCol, useFocoDialogo } from './components'
import { DrillModal, type Drill } from './drill'
import { aplicarSancion, cargarSanciones } from './data'
import { WidgetGrid, type Widget } from './widgets'

const mixto = (c: Corte) => (c.fuentes || []).length > 1
const crmCorto = (l: { crm: Lead['crm'] }) => CRM_LABEL[l.crm]
const subAsesor = (c: Corte, u: Usuario) => zonaNombre(c, u.zona) + ' · ' + u.crm.map((x) => CRM_LABEL[x]).join(' + ') + (u.rol ? ' · ' + rolNombre(u.rol) : '')
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
const PC_TRAMOS = [
  { l: 'en menos de 1 hora', ok: (h: number) => h <= 1 }, { l: 'de 1 a 4 horas', ok: (h: number) => h > 1 && h <= 4 },
  { l: 'de 4 a 24 horas', ok: (h: number) => h > 4 && h <= 24 }, { l: 'más de un día', ok: (h: number) => h > 24 },
]
/** Orden de colocación por defecto del Dashboard: pares de igual alto (bandas) para que la rejilla libre no deje huecos. */
const ORDEN_ADMIN = ['t-leads', 't-ventas', 't-vendido', 't-conversion', 't-perdida', 't-tareas', 't-cotizaciones', 't-descartes', 't-levantamientos', 'llamadas', 'salud', 'pipeline', 'ranking', 'reales', 'entrada', 'embudo', 'etapas', 'contacto', 'razones', 'perfiles', 'perfiles-tabla']
const fLeads = (ls: Lead[]) => filasDeLeads(ls, (l) => `${etapaDe(l)} · ${dias(l.dias_sin_cambio)} sin cambio`)
const fVentas = (ls: Lead[]) => filasDeLeads(ls, (l) => `Ganado · ${etapaDe(l)}`, (l) => l.cerrado)
const fCotizado = (ls: Lead[]) => filasDeLeads(ls, (l) => `${etapaDe(l)} · cotizado hace ${dias(diasDesde(fechaCotizado(l)))}`, (l) => fechaCotizado(l))
const fEntrada = (ls: Lead[]) => filasDeLeads(ls, (l) => l.funnel_label, (l) => l.creado)
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
export function AdminDashboard({ corte, filtros, onFicha }: { corte: Corte; filtros: Filtros; onFicha: (uid: string) => void }) {
  // Punto agrupado («×n») de la dispersión: lista inline para elegir a quién abrir; se limpia al cambiar filtros.
  const [grupo, setGrupo] = useState<PuntoPerfil[] | null>(null)
  useEffect(() => setGrupo(null), [filtros])
  const leads = useMemo(() => leadsFiltrados(corte, filtros), [corte, filtros])
  const ev = useMemo(() => eventosFiltrados(corte, filtros), [corte, filtros])
  const ventas = useMemo(() => ventasFiltradas(corte, filtros), [corte, filtros])
  const filas = useMemo(() => porAsesor(corte, filtros), [corte, filtros])
  const ent = useMemo(() => entrada(corte, filtros.rango, filtros), [corte, filtros])
  const pc = useMemo(() => primerContacto(corte, leads), [corte, leads])
  const rz = useMemo(() => razones(corte, ev), [corte, ev])
  const perf = useMemo(() => perfiles(filas), [filas])
  const vr = ventasReales(corte, filtros)
  const [drill, setDrill] = useState<Drill | null>(null)
  const ver = (titulo: string, filas: Fila[], sub?: string) => setDrill({ titulo, filas, sub })
  const s = salud(leads)
  const con = s.ventasCon + s.huntCon, sin = s.ventasSin + s.huntSin, tot = con + sin
  const hayHunting = s.huntCon + s.huntSin > 0
  const asignados = leads.filter((l) => l.funnel === 4)
  // Tasa de pérdida: de los leads asignados en el rango (activos + ganados + perdidos), cuántos ya se perdieron.
  const perdidos = leads.filter((l) => l.funnel === 0), baseAsignados = leads.filter((l) => l.funnel === 4 || l.funnel === 5 || l.funnel === 0).length
  const et = embudo(leads, corte.etapas || [])
  const a = actividad(ev)
  const monto = ventas.reduce((x, l) => x + l.presupuesto, 0)
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
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Leads asignados'], desde: 'cifras' }),
    W('t-ventas', 'Clientes cerrados', (
        <button type="button" className="tile tbtn t2" onClick={() => ver('Clientes cerrados ' + periodo, fVentas(ventas), rango + ' · fecha = cierre')} aria-label={`${fmtN(ventas.length)} clientes cerrados ${periodo}. Ver detalle`}><div className="n">{fmtN(ventas.length)}</div><div className="l">Clientes cerrados {periodo}</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Clientes cerrados'], desde: 'cifras' }),
    // El número que Alejandro llamó «el más importante» (4-sep): vendido contra la meta con el ritmo del mes y color que grite.
    W('t-vendido', 'Avance contra la meta', (
        <button type="button" className={'tile tbtn t3 ritmo-' + rit.estado} onClick={() => ver('Vendido ' + periodo, fVentas(ventas), rango + ' · fecha = cierre')} aria-label={`Vendido ${fmtMoney0(monto)} ${periodo}: ${pct(monto, metaRango)}% de la meta de ${fmtMoney0(metaRango)}. ${rit.texto}. Ver detalle`}>
          <div className="n">{fmtMoney0(monto)}</div>
          <div className="l">{pct(monto, metaRango)}% de la meta de {fmtMoney0(metaRango)} · vendido {periodo}</div>
          <Bullet value={monto} target={metaRango} expected={rit.esperado} label="Vendido" fmt={fmtMoney0} />
          <div className={'rt ' + rit.estado}>{rit.texto}</div>
        </button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Ritmo'], desde: 'cifras' }),   // 4 filas: trae medidor y frase del ritmo
    W('t-conversion', 'Conversión ventas / asignados', (
        <button type="button" className="tile tbtn t4" onClick={() => ver('Ventas que cuentan en la conversión', fVentas(ventas), `${fmtN(ventas.length)} ventas / ${fmtN(leads.length)} leads asignados · ${rango}`)} aria-label={`Conversión ${leads.length ? pct(ventas.length, leads.length) + '%' : 'sin dato'}. Ver detalle`}><div className="n">{leads.length ? pct(ventas.length, leads.length) + '%' : '—'}</div><div className="l">Ventas cerradas entre leads asignados</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Conversión'], desde: 'cifras' }),
    W('t-perdida', 'Tasa de pérdida', (
        <button type="button" className="tile tbtn t5" onClick={() => ver('Leads perdidos · asignados en el rango', filasDeLeads(perdidos, (l) => `Perdido · ${l.razon || 'sin razón'}`, (l) => l.cerrado), rango + ' · fecha = descarte')} aria-label={`Tasa de pérdida ${pct(perdidos.length, baseAsignados)}%: ${fmtN(perdidos.length)} perdidos de ${fmtN(baseAsignados)} asignados. Ver detalle`}><div className="n">{pct(perdidos.length, baseAsignados)}%</div><div className="l">{fmtN(perdidos.length)} perdidos de {fmtN(baseAsignados)} asignados</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Tasa de pérdida'], desde: 'cifras' }),
    W('t-tareas', 'Tareas completadas', (
        <button type="button" className="tile tbtn" onClick={() => verEv('Tareas completadas', 'tarea')} aria-label={`${fmtN(a.tareas)} tareas completadas. Ver detalle`}><div className="n">{fmtN(a.tareas)}</div><div className="l">Tareas completadas</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Tareas completadas'], desde: 'actividad' }),
    W('t-cotizaciones', 'Cotizaciones entregadas', (
        <button type="button" className="tile tbtn" onClick={() => verEv('Cotizaciones entregadas', 'cotizacion')} aria-label={`${fmtN(a.cotizaciones)} cotizaciones entregadas${a.recotizaciones ? `, ${fmtN(a.recotizaciones)} recotizaciones aparte` : ''}. Ver detalle`}><div className="n">{fmtN(a.cotizaciones)}</div><div className="l">Cotizaciones entregadas{a.recotizaciones ? ` · ${fmtN(a.recotizaciones)} recotizaciones aparte` : ''}</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Cotizaciones'], desde: 'actividad' }),
    W('t-descartes', 'Descartados con razón registrada', (
        <button type="button" className="tile tbtn" onClick={() => verEv('Descartados con razón registrada', 'descarte')} aria-label={`${fmtN(a.descartes)} descartados. Ver detalle`}><div className="n">{fmtN(a.descartes)}</div><div className="l">Descartados con razón registrada</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Razón de descarte'], desde: 'actividad' }),
    W('t-levantamientos', 'Levantamientos solicitados', (
        <button type="button" className="tile tbtn" onClick={() => verEv('Levantamientos solicitados', 'levantamiento')} aria-label={`${fmtN(a.levantamientos)} levantamientos. Ver detalle`}><div className="n">{fmtN(a.levantamientos)}</div><div className="l">Levantamientos solicitados</div></button>
    ), { plain: true, span: 1, alto: 4, cls: 'wtile', info: ['Levantamientos'], desde: 'actividad' }),
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
    ), { info: ['Salud operativa'], alto: 7 }),
    // Cada cifra es un widget propio (pedido de Randall 4-sep): se mueve y se estira por separado. `desde` migra el orden guardado del grupo viejo.
    W('ranking', 'Ranking de ventas', (
      <>
        {!ranking.length && <div className="muted">Sin ventas ni actividad en el rango.</div>}
        {ranking.map((f, i) => (
          <div className="lr drill" key={f.u.id} role="button" tabIndex={0} aria-label={`${f.u.nombre}: ${fmtMoney0(f.montoVentas)} en ${f.ventas} ventas. Ver ventas`}
            onClick={() => ver(`Ventas de ${f.u.nombre}`, fVentas(ventas.filter((l) => l.asesor_id === f.u.id)), rango + ' · fecha = cierre')} onKeyDown={activar(() => ver(`Ventas de ${f.u.nombre}`, fVentas(ventas.filter((l) => l.asesor_id === f.u.id)), rango + ' · fecha = cierre'))}>
            <span className={'pos' + (i < 3 ? ' top' : '')}>{i + 1}</span>
            <span className="nm" title={subAsesor(corte, f.u)}>{f.u.nombre}</span>
            <Bullet sm value={f.montoVentas} target={f.metaRango} expected={f.esperado} label={'Vendido de ' + f.u.nombre} fmt={fmtMoney0} />
            <span className="v">{fmtMoney0(f.montoVentas)}<small>{f.ventas} venta{f.ventas === 1 ? '' : 's'} · {pct(f.montoVentas, f.metaRango)}% de la meta · <span className={'rt ' + f.ritmo.estado}>{f.ritmo.corto}</span></small></span>
          </div>
        ))}
        {filas.length > ranking.length && <div className="small muted" style={{ marginTop: 8 }}>Top {ranking.length} de {filas.length}; la tabla de Asesores trae a todos.</div>}
      </>
    ), { info: ['Ranking'], cls: 'rank', alto: 12 }),   // 12 filas: a 3 columnas la línea chica de cada renglón va en dos renglones (8 × 62 px + nota)
    ...(corte.comisiones ? [W('reales', 'Ventas reales · Comisiones', (
      <>
        {vr.filas.length > 0 && (
          <div className="scrollx crece"><table className="ftable">
            <thead><tr><th scope="col">Asesor</th><th scope="col" className="num">Ventas reales</th><th scope="col" className="num">Monto real</th><th scope="col" className="num">Ventas CRM</th><th scope="col" className="num">Monto CRM</th></tr></thead>
            <tbody>
              {vr.filas.map((r) => { const cr = r.u ? filas.find((x) => x.u.id === r.u!.id) : undefined; return (
                <tr key={r.nombre}>
                  <td><button type="button" className="nbtn" aria-label={`${r.nombre}: ${fmtN(r.n)} ventas reales, ${fmtMoney0(r.monto)}. Ver la comparativa contra el CRM`}
                    onClick={() => (r.u
                      ? ver(`Ventas reales contra el CRM · ${r.nombre}`, comparativaVentas(ventas.filter((l) => l.asesor_id === r.u!.id), r.ventas), rango + ' · pareja = mismo cliente y cierre cerca del mes de venta')
                      : ver(`Ventas reales · ${r.nombre}`, filasDeVentasReales(r.ventas), rango + ' · vendedor sin asesor en el CRM: solo la lista de la app'))}>{r.nombre}</button>{!r.u && <span className="muted"> · sin asesor en el CRM</span>}</td>
                  <td className="num">{fmtN(r.n)}</td><td className="num">{fmtMoney0(r.monto)}</td>
                  <td className="num">{cr ? fmtN(cr.ventas) : '—'}</td><td className="num">{cr ? fmtMoney0(cr.montoVentas) : '—'}</td>
                </tr>) })}
            </tbody>
          </table></div>
        )}
        {!vr.filas.length && <div className="vacio"><b>Sin ventas en la app de comisiones</b><span>Nadie ha registrado ventas de este periodo{filtros.asesor || filtros.equipo ? ' con este filtro' : ''}. La app guarda el mes de venta, no el día.</span></div>}
        <div className="small muted" style={{ marginTop: 8 }}>Clic en el asesor abre la comparativa venta por venta: cuáles faltan en el CRM y cuáles en la app. Fuente: app de comisiones, por mes de venta y sin canceladas · corte {(corte.comisiones.generado || '').slice(0, 16).replace('T', ' ')}.{vr.sinAsesor.length ? ` Vendedores sin asesor en el CRM: ${vr.sinAsesor.join(', ')}.` : ''}{corte.comisiones.error ? ` Error al leer la app: ${corte.comisiones.error}` : ''}</div>
      </>
    ), { info: ['Ventas reales'], alto: 10 })] : []),
    W('pipeline', 'Cotizado vs vendido vs meta', (
      <>
        <div className="brow">
          <span className="l">Vendido</span>
          <Bullet value={monto} target={metaRango} expected={rit.esperado} label="Vendido" fmt={fmtMoney0} />
          <Cifra label={`Vendido ${fmtMoney0(monto)}`} onClick={() => ver('Vendido en el rango', fVentas(ventas), rango + ' · fecha = cierre')}><span className="v">{fmtMoney0(monto)}</span></Cifra>
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
    ), { alto: 9, info: ['Embudo'] }),
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
    ), { info: ['Llamadas'], alto: 4 }),
    // Eran un solo widget y Randall (5-sep) no veía la relación entre los dos: no la hay. Cada uno dice qué mide.
    W('contacto', 'Primer contacto', (
      <>
        <div className="small muted">Qué tan rápido se atiende un lead nuevo: horas entre la asignación y la primera llamada o tarea registrada (mediana).{mixto(corte) ? ' Solo Kommo.' : ''}</div>
        <div className="pc-hero" style={{ marginTop: 8 }}><span className="n">{horasPC}</span><span className="u">{unidadPC}</span></div>
        <div className="small muted">
          <button type="button" className="nbtn" onClick={() => ver('Leads con primer contacto registrado', filasDeLeads(pc.con.map((x) => x.lead), (l) => { const h = pc.con.find((x) => x.lead.id === l.id)?.horas || 0; return `${etapaDe(l)} · primer contacto a las ${h < 48 ? h.toFixed(1) + ' horas' : Math.round(h / 24) + ' días'}` }), rango)}>{fmtN(pc.n)} leads con contacto registrado</button>
          {' · '}{fmtN(pc.en24)} en menos de 24 horas ({pct(pc.en24, pc.n)}%){' · '}
          <button type="button" className="nbtn" onClick={() => ver('Leads sin contacto tras un día asignados', filasDeLeads(pc.sin, (l) => `${etapaDe(l)} · asignado hace ${dias(diasDesde(l.asignacion))}, sin llamada ni tarea`), rango)}>{fmtN(pc.sinContacto)} sin contacto tras un día asignados</button>
        </div>
        {pc.n > 0 && (
          <div className="pc-dist" role="group" aria-label="Leads por tiempo al primer contacto">
            <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>¿Cuánto tardó el primer contacto?</div>
            {PC_TRAMOS.map((t) => { const xs = pc.con.filter((x) => t.ok(x.horas)); const mx = Math.max(1, ...PC_TRAMOS.map((u) => pc.con.filter((x) => u.ok(x.horas)).length)); return (
              <button type="button" className="pcd" key={t.l} aria-label={`${t.l}: ${fmtN(xs.length)} leads (${pct(xs.length, pc.n)}%). Ver leads`} disabled={!xs.length}
                onClick={() => ver(`Primer contacto ${t.l}`, filasDeLeads(xs.map((x) => x.lead), (l) => { const h = xs.find((x) => x.lead.id === l.id)?.horas || 0; return `${etapaDe(l)} · primer contacto a las ${h < 48 ? h.toFixed(1) + ' horas' : Math.round(h / 24) + ' días'}` }), rango)}>
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
    ), { info: ['Razón de descarte'], desde: 'contacto', alto: 7 }),
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
          <div className="small muted" style={{ marginTop: 8 }}>La mitad del grupo pasa de {fmtN(perf.medAct)} actividades y de {fmtMoney0(perf.medVend)} vendido: esas dos líneas parten la matriz. Clic en una bolita abre la ficha del asesor.</div>
        </>
      )
    ), { info: ['Perfil'], cls: 'wperf', span: 3, alto: 9 }),
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
    ), { info: ['Perfil'], cls: 'wperf', span: 3, alto: 9, desde: 'perfiles' }),
  ]
  return (
    <>
      <div className="hint" style={{ marginBottom: 8 }}>Clic en cualquier cifra, barra o renglón abre la lista de registros detrás, con liga a Kommo o HubSpot.</div>
      <WidgetGrid clave="admin" widgets={ORDEN_ADMIN.map((id) => widgets.find((w) => w.id === id)).filter((w): w is Widget => !!w).concat(widgets.filter((w) => !ORDEN_ADMIN.includes(w.id)))} />
      {drill && <DrillModal d={drill} onClose={() => setDrill(null)} />}
    </>
  )
}

// ---------------------------------------------------------------- Asesores
interface Pop { fila: FilaAsesor; x: number; y: number }
interface Det { title: string; total: number; rows: DetRow[]; anchor: DOMRect }
type Key = 'nombre' | 'vendido' | 'cotizado' | 'leads' | 'llamadas' | 'tareas' | 'pc' | 'cotiz' | 'desc' | 'lev'
const valor = (f: FilaAsesor, k: Key): number | string =>
  k === 'nombre' ? f.u.nombre : k === 'vendido' ? f.montoVentas : k === 'cotizado' ? f.cotizado.vigente : k === 'leads' ? f.leadsActivos.length
    : k === 'llamadas' ? f.llamadas : k === 'tareas' ? f.tareasCompletadas + f.tareasVencidas + f.sinTarea : k === 'pc' ? f.pcVencidas
      : k === 'cotiz' ? f.cotizaciones : k === 'desc' ? f.descartes : f.levantamientos

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
  const detalle = (e: SyntheticEvent<HTMLDivElement>, title: string, total: number, rows: DetRow[]) => {
    e.stopPropagation()
    setPop(null); setDet({ title, total, rows, anchor: e.currentTarget.getBoundingClientRect() })
  }

  if (!filas.length) return <div className="panel muted">Sin asesores con leads o actividad en el rango. Amplía el rango de fechas o quita el filtro de equipo.</div>
  const th = { sort, onSort }
  return (
    <>
      <div className="tblwrap">
        <table className="tbl">
          <thead><tr>
            <SortTh k="nombre" label="Asesor" {...th} />
            <SortTh k="vendido" label="Vendido" {...th}><Info termino="Vendido" /></SortTh>
            <SortTh k="cotizado" label="Cotizado vigente" {...th}><Info termino="Cotizado vigente" /></SortTh>
            <SortTh k="leads" label="Leads activos" {...th}><Info termino="Leads activos" /></SortTh>
            <SortTh k="llamadas" label="Llamadas" {...th}><Info termino="Llamadas" /></SortTh>
            <SortTh k="tareas" label="Tareas" {...th}><Info termino="Tareas" /></SortTh>
            <SortTh k="pc" label="Primer contacto vencido" {...th}><Info termino="Primer contacto vencido" /></SortTh>
            <SortTh k="cotiz" label="Cotizaciones" {...th} />
            <SortTh k="desc" label="Descartes" {...th} />
            <SortTh k="lev" label="Levantamientos" {...th} />
            <th scope="col">Asignación<Info termino="Asignación" /></th>
          </tr></thead>
          <tbody>
            {filas.map((f) => {
              const tar = f.tareasCompletadas + f.tareasVencidas + f.sinTarea
              const evDe = (...tipos: string[]) => f.actividad.filter((e) => tipos.includes(e.tipo))
              return (
                <tr key={f.u.id} className="row" onClick={(e) => abrir(f, e.clientX, e.clientY)}>
                  <td><div className="who"><div className={avatarCls(f.u)} title={subAsesor(corte, f.u)} aria-hidden="true">{iniciales(f.u.nombre)}</div><div><div className="nm"><button type="button" className="nbtn" aria-haspopup="dialog" aria-label={`Ver resumen de ${f.u.nombre}`} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); abrir(f, r.right, r.bottom) }}>{f.u.nombre}</button>{rolDestacado(f.u.rol) && <span className="tag rol" title="Rol en Kommo">{rolNombre(f.u.rol)}</span>}</div><div className="sub">{f.ventas} venta{f.ventas === 1 ? '' : 's'} · meta {fmtMoney0(f.metaMes)}/mes</div></div></div></td>
                  <td className="cellbar">
                    <div className="num">{fmtMoney0(f.montoVentas)}</div>
                    <Bullet sm value={f.montoVentas} target={f.metaRango} expected={f.esperado} label={'Vendido de ' + f.u.nombre} fmt={fmtMoney0} />
                    <div className="tot">{pct(f.montoVentas, f.metaRango)}% de {fmtMoney0(f.metaRango)}</div>
                    <div className={'tot rt ' + f.ritmo.estado}>{f.ritmo.corto}</div>
                  </td>
                  <td className="num">{fmtMoney0(f.cotizado.vigente)}{f.cotizado.viejo > 0 && <div className="small muted" style={{ fontWeight: 500 }}>+{fmtMoney(f.cotizado.viejo)} viejo</div>}</td>
                  <td><div className="num">{f.leadsActivos.length}</div><div className="minibar" aria-hidden="true"><i style={{ width: pct(f.leadsActivos.length, maxLeads) + '%' }} /></div>{f.estancados > 0 && <div className="small muted">{f.estancados} estancado{f.estancados === 1 ? '' : 's'}</div>}</td>
                  <td className="cellbar">
                    <StackedBar segs={[{ val: f.contestadas, cls: 'seg-comp' }, { val: f.sinContestar, cls: 'seg-warn' }]} total={f.llamadas} max={maxLlam}
                      title={`Llamadas de ${f.u.nombre}: ${f.contestadas} contestadas, ${f.sinContestar} sin contestar. Abrir detalle`}
                      onClick={(e) => detalle(e, 'Llamadas · ' + f.u.nombre, f.llamadas, [
                        { label: 'Contestadas', val: f.contestadas, onVer: () => ver(`Llamadas contestadas · ${f.u.nombre}`, filasDeEventos(corte, evDe('llamada_ok')), rango) },
                        { label: 'Sin contestar', val: f.sinContestar, onVer: () => ver(`Llamadas sin contestar · ${f.u.nombre}`, filasDeEventos(corte, evDe('llamada_no')), rango) }])} />
                    <div className="tot">{fmtN(f.llamadas)}</div>
                  </td>
                  <td className="cellbar">
                    <StackedBar segs={[{ val: f.tareasCompletadas, cls: 'seg-comp' }, { val: f.tareasVencidas, cls: 'seg-alert' }, { val: f.sinTarea, cls: 'seg-empty' }]} total={tar} max={maxTar}
                      title={`Tareas de ${f.u.nombre}: ${f.tareasCompletadas} completadas, ${f.tareasVencidas} vencidas, ${f.sinTarea} leads sin tarea. Abrir detalle`}
                      onClick={(e) => detalle(e, 'Tareas · ' + f.u.nombre, tar, [
                        { label: 'Completadas', val: f.tareasCompletadas, onVer: () => ver(`Tareas completadas · ${f.u.nombre}`, filasDeEventos(corte, evDe('tarea')), rango) },
                        { label: 'Vencidas', val: f.tareasVencidas, onVer: () => ver(`Leads con tareas vencidas · ${f.u.nombre}`, filasDeLeads(f.leadsActivos.filter((l) => l.tareas_vencidas > 0), (l) => `${etapaDe(l)} · ${l.tareas_vencidas} vencida${l.tareas_vencidas > 1 ? 's' : ''}`), rango) },
                        { label: 'Leads sin tarea', val: f.sinTarea, onVer: () => ver(`Leads sin tarea · ${f.u.nombre}`, fLeads(f.leadsActivos.filter((l) => l.sin_tarea)), rango) }])} />
                    <div className="tot">{fmtN(tar)}</div>
                  </td>
                  <td className="num">{f.pcVencidas > 0 ? <span className="tag warn">{f.pcVencidas}</span> : '0'}</td>
                  <td className="num">{f.cotizaciones}</td>
                  <td className="num">{f.descartes}</td>
                  <td className="num">{f.levantamientos}</td>
                  <td className="asig" onClick={(e) => e.stopPropagation()}>
                    <Asignacion u={f.u} sanc={sanc} ocupado={ocupado === f.u.id} msg={msg[f.u.id]} onAccion={(a) => accionar(f.u, a)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="legend" style={{ marginTop: 8 }}><span><i className="lg-comp" aria-hidden="true" />Contestadas · completadas</span><span><i className="lg-warn" aria-hidden="true" />Sin contestar</span><span><i style={{ background: 'var(--warn)' }} aria-hidden="true" />Tareas vencidas</span><span><i style={{ background: 'repeating-linear-gradient(45deg, var(--neutral) 0 2px, #fff 2px 4px)' }} aria-hidden="true" />Leads sin tarea</span><span>Barra de Vendido: marca negra = meta del rango, gris = esperado a hoy</span><span>Clic en una barra abre el desglose y de ahí la lista de registros</span></div>
      {pop && <AsesorPopup corte={corte} filtros={filtros} fila={pop.fila} x={pop.x} y={pop.y} onClose={() => setPop(null)} onFicha={() => { setPop(null); onFicha(pop.fila.u.id) }} />}
      {det && <BarDetailPopup anchor={det.anchor} title={det.title} total={det.total} rows={det.rows} onClose={() => setDet(null)} />}
      {drill && <DrillModal d={drill} onClose={() => setDrill(null)} />}
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

/** Ficha del asesor. Es un WidgetGrid (clave «ficha», compartida entre asesores): cada tarjeta se
 *  mueve, estira o quita igual que en el Dashboard. Cotizado vigente y su antigüedad van en UNA
 *  tarjeta; la actividad respeta el rango del filtro (por día hasta 21 días, si no por semana con
 *  clic para abrir la semana). */
export function Ficha({ corte, filtros, uid, onBack }: { corte: Corte; filtros: Filtros; uid: string; onBack: () => void }) {
  const u = corte.usuarios.find((x) => x.id === uid)
  const f: Filtros = { ...filtros, asesor: uid, equipo: null }
  const leads = useMemo(() => leadsFiltrados(corte, f), [corte, filtros, uid])   // eslint-disable-line react-hooks/exhaustive-deps
  const ventas = useMemo(() => ventasFiltradas(corte, f), [corte, filtros, uid]) // eslint-disable-line react-hooks/exhaustive-deps
  const [sem, setSem] = useState<Date | null>(null)   // semana abierta en Actividad; null = vista del rango
  const [drill, setDrill] = useState<Drill | null>(null)
  useEffect(() => setSem(null), [filtros.rango.ini, filtros.rango.fin, uid])
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
  // Actividad: el rango manda. Hasta 21 días se ve por día; más largo, por semana y cada semana se abre por día.
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
  if (sem) {
    const ds = Array.from({ length: 7 }, (_, i) => sumar(sem, i))
    evVista = entre(ep(sem), ep(sumar(sem, 7)))
    cols = ds.map((d) => ({ label: fmtCorta(d), bubbles: burbujas(entre(ep(d), ep(d) + 86400)) }))
    vista = `Semana del ${fmtCorta(ds[0])} al ${fmtCorta(ds[6])}, por día`
  } else if (diasRango <= 21) {
    const d0 = inicioDia(new Date(ini * 1000))
    const ds = Array.from({ length: Math.max(1, diasRango) }, (_, i) => sumar(d0, i))
    evVista = evRango
    cols = ds.map((d) => ({ label: fmtCorta(d), bubbles: burbujas(entre(ep(d), ep(d) + 86400)) }))
    vista = `Por día · ${rango}`
  } else {
    const semanas: Date[] = []
    for (let d = lunes(new Date(ini * 1000)); ep(d) < fin; d = sumar(d, 7)) semanas.push(d)
    evVista = evRango
    cols = semanas.map((d) => ({ label: fmtCorta(d), title: `Semana del ${fmtCorta(d)}. Clic para ver por día`, bubbles: burbujas(entre(Math.max(ini, ep(d)), Math.min(fin, ep(sumar(d, 7))))) }))
    onCol = (i) => setSem(semanas[i])
    vista = `Por semana · ${rango} · clic en una semana para verla por día`
  }
  const tareas = corte.tareas_abiertas.filter((t) => pasaCrm(t.crm, filtros) && t.asesor_id === uid).sort((p, q) => p.vence - q.vence).slice(0, 24)
  const hoy = ep(inicioDia(new Date()))
  const widgets: Widget[] = [
    wg('ventas', 'Ventas · ' + rango, (
      <div className="kcard hero"><div className="l">Ventas · {rango}</div><div className="n"><Cifra label={`${ventas.length} ventas, ${fmtMoney0(monto)}`} onClick={() => setDrill({ titulo: `Ventas de ${u.nombre}`, filas: fVentas(ventas), sub: rango + ' · fecha = cierre' })}><b>{ventas.length}</b> <span style={{ fontSize: 22 }}>{fmtMoney0(monto)}</span></Cifra></div><MiniAreaChart values={serie} height={56} /><div className="small muted">Conversión {leads.length ? pct(ventas.length, leads.length) + '%' : '—'}: {ventas.length} ventas / {leads.length} leads asignados en el rango<Info termino="Conversión" /></div></div>
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
          {sem && <button type="button" className="nbtn" onClick={() => setSem(null)}>‹ Volver a las semanas</button>}
        </div>
        <BubbleChart cols={cols} onCol={onCol} />
        <div className="small muted" style={{ marginTop: 8 }}>Cada columna es {sem || diasRango <= 21 ? 'un día' : 'una semana'} y cada bolita cuenta lo que el asesor registró de cada tipo: entre más grande, más actividad.</div>
        <div className="legend"><span><i className="lg-comp" aria-hidden="true" />Llamadas</span><span><i className="lg-warn" aria-hidden="true" />Tareas completadas</span><span><i className="lg-e" aria-hidden="true" />Cotizaciones entregadas</span><span><i className="lg-l" aria-hidden="true" />Levantamientos solicitados</span>
          <button type="button" onClick={() => setDrill({ titulo: `Actividad de ${u.nombre} · ${sem ? 'semana del ' + fmtCorta(sem) : rango}`, filas: filasDeEventos(corte, evVista) })}>Ver las {fmtN(evVista.length)} actividades ›</button></div>
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
  ]
  return (
    <>
      <div className="ficha-tools">
        <button type="button" className="btn" onClick={onBack}>← Volver</button>
        <div className="who"><div className={avatarCls(u)} aria-hidden="true">{iniciales(u.nombre)}</div><div><h2 className="nm" style={{ margin: 0, fontSize: 14 }}>{u.nombre}</h2><div className="sub">{subAsesor(corte, u)}</div></div></div>
        <span className="tag dark">{activos.length} leads activos</span>
      </div>
      <WidgetGrid clave="ficha" widgets={widgets} />
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
      {lineas.map((l) => <div key={l.txt} className={'st' + (l.fuera ? ' off' : '')}>{l.txt}</div>)}
      {puede && <button type="button" className="btn" disabled={ocupado} onClick={() => onAccion(fuera ? 'reactivar' : 'quitar')}>{ocupado ? 'Aplicando…' : fuera ? 'Reactivar' : 'Quitar de la asignación'}</button>}
      {msg && <div className="small muted" role="status">{msg}</div>}
    </div>
  )
}
