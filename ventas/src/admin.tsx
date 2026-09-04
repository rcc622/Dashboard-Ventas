import { useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import type { Corte, Lead, Usuario } from './types'
import { CRM_LABEL } from './types'
import { BUCKETS, PERFIL_LABEL, actividad, cotizado, embudo, entrada, ep, eventosFiltrados, fmtCorta, fmtMoney, fmtMoney0, fmtN, iniciales, inicioDia, leadsFiltrados, mesNombre, metaDe, metaEnRango, metaEsperada, pct, perfiles, porAsesor, primerContacto, razones, salud, serieDiaria, sumar, tipoLead, ventasFiltradas, vivo, zonaNombre, type Cotizado, type FilaAsesor, type Filtros, type Perfil } from './metrics'
import { BarDetailPopup, BubbleChart, Bullet, CollapsibleSection, DonutChart, FunnelChart, Gauge, Info, LlamadasBar, MiniAreaChart, Scatter, SortTh, StackedBar, activar, useEscape, useOutside, type DetRow, type Sort } from './components'

const mixto = (c: Corte) => (c.fuentes || []).length > 1
const crmCorto = (l: { crm: Lead['crm'] }) => (l.crm === 'hubspot' ? 'HS' : 'KM')
const subAsesor = (c: Corte, u: Usuario) => zonaNombre(c, u.zona) + ' · ' + u.crm.map((x) => CRM_LABEL[x]).join(' + ')
const avatarCls = (u: Usuario) => 'avatar' + (u.zona ? ' z-' + u.zona : '')
const RAMPA = ['var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)', 'var(--f5)', 'var(--f6)', 'var(--f6)']
// HubSpot no trae llamadas ni mensajes por deal: mejor decirlo que pintar «0 llam».
const intentos = (l: Lead) => (l.crm === 'hubspot' ? 'sin dato (HS)' : `${fmtN(l.llamadas_cf)} llam · ${fmtN(l.msjs)} msj`)
const hace = (ts: number, hoy: number) => { if (!ts) return '—'; const d = Math.floor((hoy - ts) / 86400); return d <= 0 ? 'hoy' : `hace ${d}d` }
const PERFIL_CLS: Record<Perfil, string> = { mantener: 'p-mantener', capacitar: 'p-capacitar', revisar: 'p-revisar', salida: 'p-salida' }
const PERFILES: Perfil[] = ['mantener', 'capacitar', 'revisar', 'salida']

/** Barra de antigüedad del cotizado: rampa ordinal, lo de más de 90 días rayado. */
function Antiguedad({ c }: { c: Cotizado }) {
  const tot = c.buckets.reduce((a, b) => a + b, 0)
  return (
    <>
      <div className="aging" role="img" aria-label={'Antigüedad del cotizado: ' + BUCKETS.map((b, i) => `${b} ${fmtMoney0(c.buckets[i])}`).join(', ')}>
        {tot > 0 && c.buckets.map((v, i) => <i key={i} className={'ag' + (i + 1)} style={{ width: pct(v, tot) + '%' }} />)}
      </div>
      <div className="legend">{BUCKETS.map((b, i) => <span key={b}><i className={'lg-ag' + (i + 1)} aria-hidden="true" />{b} {fmtMoney0(c.buckets[i])}</span>)}</div>
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
        <thead><tr><th>Lead</th><th>Etapa</th><th className="num">Monto</th><th>Intentos<Info termino="Intentos" /></th><th>Últ. tarea hecha</th><th className="num">Sin cambio</th><th>Alertas</th></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td><a href={l.link} target="_blank" rel="noreferrer">{l.nombre}</a>{mixto(corte) && <span className="small muted"> · {crmCorto(l)}</span>}</td>
              <td>{tipoLead(l)} · {l.etapa}</td>
              <td className="num">{fmtMoney(l.presupuesto)}</td>
              <td>{intentos(l)}</td>
              <td>{hace(l.ult_tarea, hoy)}</td>
              <td className="num">{l.dias_sin_cambio}d</td>
              <td>
                {l.pc_vencida && <span className="tag warn">PC vencida</span>}
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
export function AdminDashboard({ corte, filtros }: { corte: Corte; filtros: Filtros }) {
  const leads = useMemo(() => leadsFiltrados(corte, filtros), [corte, filtros])
  const ev = useMemo(() => eventosFiltrados(corte, filtros), [corte, filtros])
  const ventas = useMemo(() => ventasFiltradas(corte, filtros), [corte, filtros])
  const filas = useMemo(() => porAsesor(corte, filtros), [corte, filtros])
  const ent = useMemo(() => entrada(corte, filtros.rango), [corte, filtros.rango])
  const pc = useMemo(() => primerContacto(corte, leads), [corte, leads])
  const rz = useMemo(() => razones(corte, ev), [corte, ev])
  const perf = useMemo(() => perfiles(filas), [filas])
  const s = salud(leads)
  const con = s.ventasCon + s.huntCon, sin = s.ventasSin + s.huntSin, tot = con + sin
  const et = embudo(leads, corte.etapas || [])
  const a = actividad(ev)
  const monto = ventas.reduce((x, l) => x + l.presupuesto, 0)
  const metaRango = filas.reduce((x, f) => x + f.metaRango, 0)
  const esperado = filas.reduce((x, f) => x + f.esperado, 0)
  const metaMes = filas.reduce((x, f) => x + f.metaMes, 0)
  const cot = cotizado(leads, corte.cotizado_dias)
  const objetivoCot = metaMes * corte.cotizado_x
  const ranking = filas.slice(0, 8)
  const rzTot = rz.reduce((x, r) => x + r.n, 0)
  const porPerfil = (p: Perfil) => perf.pts.filter((x) => x.perfil === p)
  const horasPC = pc.mediana == null ? '—' : pc.mediana < 48 ? pc.mediana.toFixed(1) : String(Math.round(pc.mediana / 24))
  const unidadPC = pc.mediana == null ? 'sin dato' : pc.mediana < 48 ? 'horas (mediana)' : 'días (mediana)'
  return (
    <>
      <CollapsibleSection title="Venta" defaultOpen>
        <div className="two">
          <div className="panel">
            <h3 className="ctitle">Salud operativa<Info termino="Salud operativa" /></h3>
            <div className="salud-grid">
              <DonutChart partes={[{ val: con, color: 'var(--c1)', label: 'Con presupuesto' }, { val: sin, color: 'var(--c2)', label: 'Sin presupuesto' }]} total={tot} label="leads asignados" />
              <div className="legend-list">
                <div className="lr h"><span className="sw c1" aria-hidden="true" /><span>Con presupuesto ($&gt;0)</span><span className="muted">{pct(con, tot)}%</span><span>{fmtN(con)}</span></div>
                <div className="lr"><span /><span className="muted">Ventas</span><span /><span>{fmtN(s.ventasCon)}</span></div>
                <div className="lr"><span /><span className="muted">Hunting</span><span /><span>{fmtN(s.huntCon)}</span></div>
                <div className="lr h"><span className="sw c2" aria-hidden="true" /><span>Sin presupuesto</span><span className="muted">{pct(sin, tot)}%</span><span>{fmtN(sin)}</span></div>
                <div className="lr"><span /><span className="muted">Ventas</span><span /><span>{fmtN(s.ventasSin)}</span></div>
                <div className="lr"><span /><span className="muted">Hunting</span><span /><span>{fmtN(s.huntSin)}</span></div>
              </div>
            </div>
            <div className="cmpbar" role="img" aria-label={`${pct(con, tot)}% con presupuesto, ${pct(sin, tot)}% sin presupuesto`}><i style={{ width: pct(con, tot) + '%' }} /></div>
            <div className="cmp-legend"><span>Total registros: {fmtN(tot)}</span><span>asignados en Ventas/Hunting · última asignación en el rango{mixto(corte) ? ' · Kommo + HubSpot' : ''}</span></div>
          </div>
          <div className="tiles2">
            <div className="tile"><div className="n">{fmtN(tot)}</div><div className="l">Leads asignados en el rango</div></div>
            <div className="tile t2"><div className="n">{fmtN(ventas.length)}</div><div className="l">Ventas cerradas en el rango</div></div>
            <div className="tile t3"><div className="n">{fmtMoney(monto)}</div><div className="l">Vendido · meta {fmtMoney0(metaRango)}<Info termino="Meta" /></div></div>
            <div className="tile t4"><div className="n">{leads.length ? pct(ventas.length, leads.length) + '%' : '—'}</div><div className="l">Conversión ventas / asignados<Info termino="Conversión" /></div></div>
          </div>
        </div>
        <div className="two" style={{ marginTop: 14 }}>
          <div className="panel rank">
            <h3>Ranking de ventas<Info termino="Ranking" /></h3>
            {!ranking.length && <div className="muted">Sin ventas ni actividad en el rango.</div>}
            {ranking.map((f, i) => (
              <div className="lr" key={f.u.id}>
                <span className={'pos' + (i < 3 ? ' top' : '')}>{i + 1}</span>
                <span className="nm" title={subAsesor(corte, f.u)}>{f.u.nombre}</span>
                <Bullet sm value={f.montoVentas} target={f.metaRango} expected={f.esperado} label={'Vendido de ' + f.u.nombre} fmt={fmtMoney0} />
                <span className="v">{fmtMoney0(f.montoVentas)}<small>{f.ventas} venta{f.ventas === 1 ? '' : 's'} · {pct(f.montoVentas, f.metaRango)}% de la meta</small></span>
              </div>
            ))}
            {filas.length > ranking.length && <div className="small muted" style={{ marginTop: 8 }}>Top {ranking.length} de {filas.length}; la tabla de Asesores trae a todos.</div>}
          </div>
          <div className="panel">
            <h3>Cotizado vs vendido vs meta<Info termino="Pipeline 10×" /></h3>
            <div className="brow">
              <span className="l">Vendido</span>
              <Bullet value={monto} target={metaRango} expected={esperado} label="Vendido" fmt={fmtMoney0} />
              <span className="v">{fmtMoney0(monto)}</span>
              <span className="sub">meta del rango {fmtMoney0(metaRango)} ({filas.length} asesor{filas.length === 1 ? '' : 'es'}) · esperado a hoy {fmtMoney0(esperado)}<Info termino="Esperado a hoy" /> · {monto >= metaRango ? 'meta cumplida' : `faltan ${fmtMoney0(metaRango - monto)}`}</span>
            </div>
            <div className="brow">
              <span className="l">Cotizado vigente</span>
              <Bullet value={cot.vigente} target={objetivoCot} label="Cotizado vigente" color="var(--c2)" fmt={fmtMoney0} />
              <span className="v">{fmtMoney0(cot.vigente)}</span>
              <span className="sub">objetivo {fmtMoney0(objetivoCot)} = {corte.cotizado_x}× la meta mensual ({fmtMoney0(metaMes)}) · {fmtN(cot.n)} lead{cot.n === 1 ? '' : 's'} con monto<Info termino="Cotizado vigente" /></span>
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="small" style={{ fontWeight: 600 }}>Antigüedad del cotizado<Info termino="Antigüedad" /></div>
              <Antiguedad c={cot} />
              {cot.viejo > 0 && <div className="small muted" style={{ marginTop: 6 }}>{fmtMoney(cot.viejo)} en {fmtN(cot.nViejo)} leads pasan de {corte.cotizado_dias} días: ya no cuentan como pipeline vivo.</div>}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {ent && (
        <CollapsibleSection title="Entrada de leads · Kommo" defaultOpen>
          <div className="panel">
            <div className="ent">
              <div className="hero">
                <Gauge pct={ent.tasa} label="asignados" size={190} color="var(--c2)" />
                <div className="l">Tasa de asignación<Info termino="Tasa de asignación" /></div>
                <div className="small muted">{fmtN(ent.asignados)} asignados de {fmtN(ent.llegaron)} que llegaron</div>
              </div>
              <div>
                <div className="kpi-row">
                  <div className="e1"><div className="n">{fmtN(ent.llegaron)}</div><div className="l">Llegaron</div></div>
                  <div className="e2"><div className="n">{fmtN(ent.sinRespuesta)}</div><div className="l">Sin respuesta</div></div>
                  <div className="e3"><div className="n">{fmtN(ent.sinRecibo)}</div><div className="l">Respondieron sin recibo</div></div>
                  <div className="e4"><div className="n">{fmtN(ent.conRecibo)}</div><div className="l">Con recibo</div></div>
                  <div className="e5"><div className="n">{fmtN(ent.asignados)}</div><div className="l">Asignados</div></div>
                  <div className="e6"><div className="n">{fmtN(ent.perdidos)}</div><div className="l">Perdidos</div></div>
                </div>
                <div className="sbar ent-bar" role="img" aria-label={`De ${fmtN(ent.llegaron)} leads: ${fmtN(ent.sinRespuesta)} sin respuesta, ${fmtN(ent.sinRecibo)} respondieron sin recibo, ${fmtN(ent.conRecibo)} con recibo, ${fmtN(ent.perdidos)} perdidos`}>
                  {ent.llegaron > 0 && <div style={{ width: '100%', display: 'flex', height: '100%' }}><i className="seg-neutral" style={{ width: pct(ent.sinRespuesta, ent.llegaron) + '%' }} /><i className="seg-warn" style={{ width: pct(ent.sinRecibo, ent.llegaron) + '%' }} /><i className="seg-ok" style={{ width: pct(ent.conRecibo, ent.llegaron) + '%' }} /><i className="seg-alert" style={{ width: pct(ent.perdidos, ent.llegaron) + '%' }} /></div>}
                </div>
                <div className="legend"><span><i style={{ background: 'var(--neutral)' }} aria-hidden="true" />Sin respuesta</span><span><i className="lg-warn" aria-hidden="true" />Respondieron sin recibo</span><span><i style={{ background: 'var(--c4)' }} aria-hidden="true" />Con recibo (incluye asignados)</span><span><i style={{ background: 'var(--warn)' }} aria-hidden="true" />Perdidos</span></div>
                <div className="small muted" style={{ marginTop: 8 }}>Leads de Kommo por fecha de creación en el rango. No aplica el filtro de equipo ni de propietario: los que aún no se asignan no tienen dueño. HubSpot no entra porque no registra recibo ni respuesta.</div>
              </div>
            </div>
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Embudo" defaultOpen>
        <div className="embudo">
          <div className="panel">
            <h3 className="ctitle">Embudo de ventas por etapa</h3>
            <FunnelChart stages={et.map((e) => ({ nombre: e.nombre, n: e.n, sub: `${fmtMoney(e.monto)} · ${e.n ? e.dias.toFixed(1) + 'd en etapa' : 'sin leads'}` }))} />
          </div>
          <div className="panel">
            <h3 className="ctitle">Monto cotizado y tiempo por etapa<Info termino="Monto cotizado" /><Info termino="Tiempo promedio" /></h3>
            <table className="ftable">
              <thead><tr><th>Etapa</th><th className="num">Leads</th><th className="num">Monto</th><th className="num">Días prom.</th><th className="num">Acum.</th></tr></thead>
              <tbody>
                {et.map((e, i) => (
                  <tr key={e.id}><td><span className="sw" style={{ background: RAMPA[Math.min(i, RAMPA.length - 1)] }} aria-hidden="true" />{e.nombre}</td><td className="num">{fmtN(e.n)}</td><td className="num">{fmtMoney(e.monto)}</td><td className="num">{e.n ? e.dias.toFixed(1) + 'd' : '—'}</td><td className="num muted">{e.acumulado.toFixed(1)}d</td></tr>
                ))}
              </tbody>
            </table>
            <div className="muted small" style={{ marginTop: 10 }}>
              Foto de hoy del embudo Ventas: leads en cada etapa, suma de sus presupuestos y días promedio que llevan ahí. Cierre = ganados del rango, días desde su asignación.
              {mixto(corte) ? ' Las etapas de HubSpot se traducen a las de Kommo (Lead entrante = Por contactar, Precalificación = Conversación iniciada).' : ''}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Actividad" defaultOpen>
        <div className="two">
          <div className="panel">
            <h3 className="ctitle">Llamadas<Info termino="Llamadas" /></h3>
            <div className="llam-grid">
              <LlamadasBar total={a.llamadas} ok={a.contestadas} no={a.sinContestar} />
              <Gauge pct={a.llamadas ? pct(a.contestadas, a.llamadas) : null} label="contestadas" size={180} />
            </div>
          </div>
          <div className="kpi4">
            <div><div className="n">{fmtN(a.tareas)}</div><div className="l">Tareas completadas</div></div>
            <div><div className="n">{fmtN(a.cotizaciones)}</div><div className="l">Cotizaciones entregadas</div></div>
            <div><div className="n">{fmtN(a.descartes)}</div><div className="l">Descartados con razón registrada</div></div>
            <div><div className="n">{fmtN(a.levantamientos)}</div><div className="l">Levantamientos solicitados</div></div>
          </div>
        </div>
        <div className="two" style={{ marginTop: 14 }}>
          <div className="panel">
            <h3>Primer contacto<Info termino="Primer contacto" /></h3>
            <div className="pc-hero"><span className="n">{horasPC}</span><span className="u">{unidadPC}</span></div>
            <div className="small muted">{fmtN(pc.n)} leads con contacto registrado · {fmtN(pc.en24)} en menos de 24 h ({pct(pc.en24, pc.n)}%) · {fmtN(pc.sinContacto)} sin contacto tras un día asignados{mixto(corte) ? ' · solo Kommo' : ''}</div>
            <h3 style={{ marginTop: 18 }}>Razón de descarte<Info termino="Razón de descarte" /></h3>
            {!rz.length && <div className="muted">Sin descartes en el rango.</div>}
            <div className="rz">
              {rz.slice(0, 8).map((r) => <div className="lr" key={r.razon}><span>{r.razon}</span><span className="bar" aria-hidden="true"><i style={{ width: pct(r.n, rz[0].n) + '%' }} /></span><span><b>{fmtN(r.n)}</b> <span className="muted">{pct(r.n, rzTot)}%</span></span></div>)}
            </div>
            {rz.length > 8 && <div className="small muted" style={{ marginTop: 4 }}>+{rz.length - 8} razones más</div>}
          </div>
          <div className="panel">
            <h3>Perfiles de vendedores<Info termino="Perfil" /></h3>
            {filas.length < 2 ? <div className="muted">Se necesitan al menos dos asesores con actividad en el rango.</div> : (
              <>
                <Scatter
                  pts={perf.pts.map((p) => ({ x: p.actividad, y: p.vendido, label: iniciales(p.u.nombre), title: `${p.u.nombre}: ${fmtN(p.actividad)} actividades, ${fmtMoney0(p.vendido)} vendido (${PERFIL_LABEL[p.perfil]})`, cls: PERFIL_CLS[p.perfil] }))}
                  xMed={perf.medAct} yMed={perf.medVend} xLabel="actividad registrada" yLabel="vendido" quad={['Revisar', 'Mantener', 'Salida', 'Capacitar']} />
                <div className="perfil-legend">
                  {PERFILES.map((p) => <div key={p}><div className="h"><i className={PERFIL_CLS[p]} aria-hidden="true" />{PERFIL_LABEL[p]} · {porPerfil(p).length}</div><div className="names">{porPerfil(p).map((x) => x.u.nombre).join(', ') || '—'}</div></div>)}
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>Actividad = llamadas + tareas completadas + cotizaciones + levantamientos en el rango. Medianas del grupo: {fmtN(perf.medAct)} actividades y {fmtMoney0(perf.medVend)} vendido.</div>
              </>
            )}
          </div>
        </div>
      </CollapsibleSection>
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
            <SortTh k="cotizado" label="Cotizado vig." {...th}><Info termino="Cotizado vigente" /></SortTh>
            <SortTh k="leads" label="Leads activos" {...th}><Info termino="Leads activos" /></SortTh>
            <SortTh k="llamadas" label="Llamadas" {...th}><Info termino="Llamadas" /></SortTh>
            <SortTh k="tareas" label="Tareas" {...th}><Info termino="Tareas" /></SortTh>
            <SortTh k="pc" label="PC venc." {...th}><Info termino="PC vencidas" /></SortTh>
            <SortTh k="cotiz" label="Cotiz." {...th} />
            <SortTh k="desc" label="Desc." {...th} />
            <SortTh k="lev" label="Levant." {...th} />
          </tr></thead>
          <tbody>
            {filas.map((f) => {
              const tar = f.tareasCompletadas + f.tareasVencidas + f.sinTarea
              const abrirTeclado = activar((e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); abrir(f, r.left + 60, r.bottom) })
              return (
                <tr key={f.u.id} className="row" tabIndex={0} aria-haspopup="dialog" aria-label={`Ver resumen de ${f.u.nombre}`}
                  onClick={(e) => abrir(f, e.clientX, e.clientY)} onKeyDown={abrirTeclado}>
                  <td><div className="who"><div className={avatarCls(f.u)} title={subAsesor(corte, f.u)} aria-hidden="true">{iniciales(f.u.nombre)}</div><div><div className="nm">{f.u.nombre}</div><div className="sub">{f.ventas} venta{f.ventas === 1 ? '' : 's'} · meta {fmtMoney0(f.metaMes)}/mes</div></div></div></td>
                  <td className="cellbar">
                    <div className="num">{fmtMoney0(f.montoVentas)}</div>
                    <Bullet sm value={f.montoVentas} target={f.metaRango} expected={f.esperado} label={'Vendido de ' + f.u.nombre} fmt={fmtMoney0} />
                    <div className="tot">{pct(f.montoVentas, f.metaRango)}% de {fmtMoney0(f.metaRango)}</div>
                  </td>
                  <td className="num">{fmtMoney0(f.cotizado.vigente)}{f.cotizado.viejo > 0 && <div className="small muted" style={{ fontWeight: 500 }}>+{fmtMoney(f.cotizado.viejo)} viejo</div>}</td>
                  <td><div className="num">{f.leadsActivos.length}</div><div className="minibar" aria-hidden="true"><i style={{ width: pct(f.leadsActivos.length, maxLeads) + '%' }} /></div>{f.estancados > 0 && <div className="small muted">{f.estancados} estancados</div>}</td>
                  <td className="cellbar">
                    <StackedBar segs={[{ val: f.contestadas, cls: 'seg-comp' }, { val: f.sinContestar, cls: 'seg-warn' }]} total={f.llamadas} max={maxLlam}
                      title={`Llamadas de ${f.u.nombre}: ${f.contestadas} contestadas, ${f.sinContestar} sin contestar. Abrir detalle`}
                      onClick={(e) => detalle(e, 'Llamadas · ' + f.u.nombre, f.llamadas, [{ label: 'Contestadas', val: f.contestadas }, { label: 'Sin contestar', val: f.sinContestar }])} />
                    <div className="tot">{fmtN(f.llamadas)}</div>
                  </td>
                  <td className="cellbar">
                    <StackedBar segs={[{ val: f.tareasCompletadas, cls: 'seg-comp' }, { val: f.tareasVencidas, cls: 'seg-alert' }, { val: f.sinTarea, cls: 'seg-empty' }]} total={tar} max={maxTar}
                      title={`Tareas de ${f.u.nombre}: ${f.tareasCompletadas} completadas, ${f.tareasVencidas} vencidas, ${f.sinTarea} leads sin tarea. Abrir detalle`}
                      onClick={(e) => detalle(e, 'Tareas · ' + f.u.nombre, tar, [{ label: 'Completadas', val: f.tareasCompletadas }, { label: 'Vencidas', val: f.tareasVencidas }, { label: 'Leads sin tarea', val: f.sinTarea }])} />
                    <div className="tot">{fmtN(tar)}</div>
                  </td>
                  <td className="num">{f.pcVencidas > 0 ? <span className="tag warn">{f.pcVencidas}</span> : '0'}</td>
                  <td className="num">{f.cotizaciones}</td>
                  <td className="num">{f.descartes}</td>
                  <td className="num">{f.levantamientos}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="legend" style={{ marginTop: 8 }}><span><i className="lg-comp" aria-hidden="true" />Contestadas · completadas</span><span><i className="lg-warn" aria-hidden="true" />Sin contestar</span><span><i style={{ background: 'var(--warn)' }} aria-hidden="true" />Tareas vencidas</span><span><i style={{ background: 'repeating-linear-gradient(45deg, var(--neutral) 0 2px, #fff 2px 4px)' }} aria-hidden="true" />Leads sin tarea</span><span>Barra de Vendido: marca negra = meta del rango, gris = esperado a hoy</span></div>
      {pop && <AsesorPopup corte={corte} filtros={filtros} fila={pop.fila} x={pop.x} y={pop.y} onClose={() => setPop(null)} onFicha={() => { setPop(null); onFicha(pop.fila.u.id) }} />}
      {det && <BarDetailPopup anchor={det.anchor} title={det.title} total={det.total} rows={det.rows} onClose={() => setDet(null)} />}
    </>
  )
}

function AsesorPopup({ corte, filtros, fila, x, y, onClose, onFicha }: { corte: Corte; filtros: Filtros; fila: FilaAsesor; x: number; y: number; onClose: () => void; onFicha: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, onClose)
  useEscape(onClose)
  // La altura real se sabe hasta que existe: se mide y se sube lo necesario para que el pie quede en pantalla.
  const [top, setTop] = useState(y)
  useLayoutEffect(() => { const h = ref.current?.getBoundingClientRect().height || 0; setTop(Math.max(8, Math.min(y, window.innerHeight - 8 - h))) }, [y])
  // Arranca en el último mes del rango (el actual con los presets), no en el primero.
  const [mes, setMes] = useState(() => { const d = new Date((filtros.rango.fin - 1) * 1000); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const ini = ep(mes), fin = ep(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))
  const activos = corte.leads.filter((l) => l.asesor_id === fila.u.id && vivo(l) && l.asignacion >= ini && l.asignacion < fin).sort((p, q) => q.dias_sin_cambio - p.dias_sin_cambio)
  const serie = serieDiaria(fila.leadsActivos.map((l) => l.asignacion), filtros.rango)
  const cumpl = pct(fila.montoVentas, fila.metaRango)
  return (
    <div className="popup" ref={ref} style={{ left: x, top }} role="dialog" aria-label={`Resumen de ${fila.u.nombre}`}>
      <div className="ph">
        <div className={avatarCls(fila.u)} aria-hidden="true">{iniciales(fila.u.nombre)}</div>
        <div className="nm">{fila.u.nombre}<div className="small muted">{subAsesor(corte, fila.u)}</div></div>
        <button type="button" className="ib" aria-label="Ver ficha completa" title="Ver ficha completa" onClick={onFicha}>↗</button>
        <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
      </div>
      <div className="kpi3">
        <div><div className="l">Vendido</div><div className="v">{fmtMoney0(fila.montoVentas)}</div></div>
        <div><div className="l">Cumplimiento<Info termino="Cumplimiento" /></div><div className="v">{cumpl}%</div></div>
        <div><div className="l">Cotizado vig.</div><div className="v">{fmtMoney0(fila.cotizado.vigente)}</div></div>
      </div>
      <div className="pchart"><MiniAreaChart values={serie} height={54} /><div className="small muted">Leads asignados por día · {filtros.rango.label}</div></div>
      <div className="pleads">
        <div>
          <div className="lh"><h3>Leads activos</h3>
            <span className="mnav"><button type="button" aria-label="Mes anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>‹</button><span aria-live="polite">{mesNombre(mes)}</span><button type="button" aria-label="Mes siguiente" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>›</button></span>
          </div>
          {activos.slice(0, 6).map((l) => (
            <div className="leadrow" key={l.id}>
              <span className="nm" title={l.nombre + ' · ' + CRM_LABEL[l.crm]}>{l.nombre}</span>
              <span className="it">{l.dias_sin_cambio}d</span>
              <span className="it l2"><span className="tag" title={CRM_LABEL[l.crm]}>{tipoLead(l)}{mixto(corte) ? ' · ' + crmCorto(l) : ''}</span> {intentos(l)}{(l.pc_vencida || l.sin_tarea) && <> <span className="tag warn">{l.pc_vencida ? 'PC vencida' : 'sin tarea'}</span></>}</span>
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

export function Ficha({ corte, filtros, uid, onBack }: { corte: Corte; filtros: Filtros; uid: string; onBack: () => void }) {
  const u = corte.usuarios.find((x) => x.id === uid)
  const f: Filtros = { ...filtros, asesor: uid, equipo: null }
  const leads = useMemo(() => leadsFiltrados(corte, f), [corte, filtros, uid])   // eslint-disable-line react-hooks/exhaustive-deps
  const ventas = useMemo(() => ventasFiltradas(corte, f), [corte, filtros, uid]) // eslint-disable-line react-hooks/exhaustive-deps
  const [sem, setSem] = useState(() => lunes(new Date()))
  if (!u) return <div className="panel">Asesor no encontrado. <button type="button" className="btn" onClick={onBack}>← Volver</button></div>
  const metaMes = metaDe(corte, u), metaRango = metaEnRango(metaMes, filtros.rango), esperado = metaEsperada(metaRango, filtros.rango)
  const monto = ventas.reduce((s, l) => s + l.presupuesto, 0)
  const activos = leads.filter(vivo)
  const cot = cotizado(activos, corte.cotizado_dias)
  const objetivo = metaMes * corte.cotizado_x
  const serie = serieDiaria(ventas.map((l) => l.cerrado), filtros.rango, true)
  const dias = Array.from({ length: 7 }, (_, i) => sumar(sem, i))
  const evSem = corte.eventos.filter((e) => e.asesor_id === uid && e.ts >= ep(sem) && e.ts < ep(sumar(sem, 7)))
  const cols = dias.map((d) => {
    const ini = ep(d), fin = ini + 86400
    const ev = evSem.filter((e) => e.ts >= ini && e.ts < fin)
    const ll = ev.filter((e) => e.tipo === 'llamada_ok' || e.tipo === 'llamada_no').length
    const ta = ev.filter((e) => e.tipo === 'tarea').length
    const co = ev.filter((e) => e.tipo === 'cotizacion' || e.tipo === 'levantamiento').length
    return { label: fmtCorta(d), bubbles: [{ n: ll, title: 'Llamadas' }, { n: ta, cls: 'w', title: 'Tareas completadas' }, { n: co, cls: 'e', title: 'Cotizaciones y levantamientos' }].filter((b) => b.n > 0) }
  })
  const tareas = corte.tareas_abiertas.filter((t) => t.asesor_id === uid).sort((p, q) => p.vence - q.vence).slice(0, 24)
  const hoy = ep(inicioDia(new Date()))
  return (
    <>
      <div className="ficha-tools">
        <button type="button" className="btn" onClick={onBack}>← Volver</button>
        <div className="who"><div className={avatarCls(u)} aria-hidden="true">{iniciales(u.nombre)}</div><div><h2 className="nm" style={{ margin: 0, fontSize: 14 }}>{u.nombre}</h2><div className="sub">{subAsesor(corte, u)}</div></div></div>
        <span className="tag dark">{activos.length} leads activos</span>
      </div>
      <div className="kgrid">
        <div className="kcard hero"><div className="l">Ventas · {filtros.rango.label}</div><div className="n"><b>{ventas.length}</b> <span style={{ fontSize: 22 }}>{fmtMoney0(monto)}</span></div><MiniAreaChart values={serie} height={56} /><div className="small muted">Conversión {leads.length ? pct(ventas.length, leads.length) + '%' : '—'}: {ventas.length} ventas / {leads.length} leads asignados en el rango<Info termino="Conversión" /></div></div>
        <div className="kcard k2"><div className="l">Cumplimiento<Info termino="Cumplimiento" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}><div className="n">{pct(monto, metaRango)}%</div><Gauge pct={pct(monto, metaRango)} label="meta" size={120} color="var(--c2)" /></div>
          <div className="small muted">meta del rango {fmtMoney0(metaRango)} ({fmtMoney0(metaMes)}/mes) · esperado a hoy {fmtMoney0(esperado)} · {monto >= metaRango ? 'meta cumplida' : `faltan ${fmtMoney0(metaRango - monto)}`}</div></div>
        <div className="kcard k3"><div className="l">Cotizado vigente<Info termino="Cotizado vigente" /></div><div className="n">{fmtMoney0(cot.vigente)}</div>
          <Bullet value={cot.vigente} target={objetivo} label="Cotizado vigente" color="var(--c2)" fmt={fmtMoney0} />
          <div className="small muted" style={{ marginTop: 6 }}>objetivo {fmtMoney0(objetivo)} = {corte.cotizado_x}× la meta mensual · {fmtN(cot.n)} lead{cot.n === 1 ? '' : 's'} con monto<Info termino="Pipeline 10×" /></div></div>
        <div className="kcard k4"><div className="l">Antigüedad del cotizado<Info termino="Antigüedad" /></div>
          <Antiguedad c={cot} />
          <div className="small muted" style={{ marginTop: 6 }}>{cot.viejo > 0 ? `${fmtMoney(cot.viejo)} en ${fmtN(cot.nViejo)} leads pasan de ${corte.cotizado_dias} días: ya no cuentan.` : 'Nada pasa de ' + corte.cotizado_dias + ' días.'}</div></div>
      </div>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="chart"><div className="ch"><h3 style={{ margin: 0 }}>Actividad por día</h3>
          <span className="mnav"><button type="button" aria-label="Semana anterior" onClick={() => setSem(sumar(sem, -7))}>‹</button><span aria-live="polite">{fmtCorta(dias[0])} – {fmtCorta(dias[6])}</span><button type="button" aria-label="Semana siguiente" onClick={() => setSem(sumar(sem, 7))}>›</button></span></div></div>
        <BubbleChart cols={cols} />
        <div className="legend"><span><i className="lg-comp" aria-hidden="true" />Llamadas</span><span><i className="lg-warn" aria-hidden="true" />Tareas completadas</span><span><i className="lg-e" aria-hidden="true" />Cotizaciones · levantamientos</span></div>
      </div>
      <div className="panel" style={{ marginBottom: 14 }}>
        <h3>Leads activos · {fmtN(activos.length)}<Info termino="Estancados" /></h3>
        <LeadsTabla corte={corte} leads={activos} />
      </div>
      <div className="panel">
        <h3>Tareas abiertas</h3>
        {!tareas.length && <div className="muted">Sin tareas abiertas en el CRM para este asesor.</div>}
        <div className="cards">
          {tareas.map((t) => { const d = Math.floor((t.vence - hoy) / 86400); const nm = t.lead_nombre || t.texto || 'Sin nombre'; return (
            <div className="card" key={t.id}>
              <span className={'tag' + (t.vencida ? ' warn' : '')}>{t.tipo}</span>
              <div className="nm">{t.link ? <a href={t.link} target="_blank" rel="noreferrer">{nm}</a> : nm}</div>
              <div className="ds">{t.lead_nombre ? (t.texto || 'Sin descripción') : CRM_LABEL[t.crm]}</div>
              <div className="dd">{d < 0 ? `Vencida hace ${-d}d` : d === 0 ? 'Vence hoy' : `${d}d restantes`}</div>
            </div>) })}
        </div>
      </div>
    </>
  )
}
