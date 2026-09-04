import { useMemo, useRef, useState, type SyntheticEvent } from 'react'
import type { Corte, Lead, Usuario } from './types'
import { CRM_LABEL } from './types'
import { actividad, embudo, ep, eventosFiltrados, fmtCorta, fmtMXN, fmtMoney, fmtN, iniciales, inicioDia, leadsFiltrados, mesNombre, pct, porAsesor, salud, serieDiaria, sumar, tipoLead, ventasFiltradas, vivo, zonaNombre, type FilaAsesor, type Filtros } from './metrics'
import { BarDetailPopup, BubbleChart, CollapsibleSection, Donut, FunnelChart, Info, LlamadasBar, Metric, MiniAreaChart, StackedBar, activar, useEscape, useOutside, type DetRow } from './components'

const mixto = (c: Corte) => (c.fuentes || []).length > 1
const crmCorto = (l: { crm: Lead['crm'] }) => (l.crm === 'hubspot' ? 'HS' : 'KM')
const subAsesor = (c: Corte, u: Usuario) => zonaNombre(c, u.zona) + ' · ' + u.crm.map((x) => CRM_LABEL[x]).join(' + ')

// ---------------------------------------------------------------- Dashboard
export function AdminDashboard({ corte, filtros }: { corte: Corte; filtros: Filtros }) {
  const leads = useMemo(() => leadsFiltrados(corte, filtros), [corte, filtros])
  const ev = useMemo(() => eventosFiltrados(corte, filtros), [corte, filtros])
  const s = salud(leads)
  const con = s.ventasCon + s.huntCon, sin = s.ventasSin + s.huntSin, tot = con + sin
  const et = embudo(leads, corte.etapas || [])
  const a = actividad(ev)
  return (
    <>
      <CollapsibleSection title="Venta" defaultOpen>
        <div className="panel">
          <h3>Salud operativa<Info termino="Salud operativa" /></h3>
          <div className="salud-grid">
            <SaludCol titulo="Con presupuesto ($>0)" ventas={s.ventasCon} hunting={s.huntCon} />
            <div className="salud-divider" aria-hidden="true" />
            <SaludCol titulo="Sin presupuesto" ventas={s.ventasSin} hunting={s.huntSin} />
          </div>
          <div className="cmpbar" role="img" aria-label={`${pct(con, tot)}% con presupuesto, ${pct(sin, tot)}% sin presupuesto`}><i style={{ width: pct(con, tot) + '%' }} /></div>
          <div className="cmp-legend"><span>{pct(con, tot)}% con presupuesto · {fmtN(con)}</span><span>{pct(sin, tot)}% sin presupuesto · {fmtN(sin)}</span></div>
          <div className="muted small" style={{ marginTop: 6 }}>Total registros: {fmtN(tot)} · leads asignados en Ventas/Hunting con última asignación en el rango{mixto(corte) ? ' · Kommo + HubSpot' : ''}</div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Embudo">
        <div className="embudo">
          <div>
            <h3>Monto cotizado por etapa<Info termino="Monto cotizado" /></h3>
            <FunnelChart stages={et.map((e) => ({ nombre: e.nombre, valor: e.monto, display: fmtMoney(e.monto), n: e.n }))} />
          </div>
          <div className="embudo-divider" aria-hidden="true" />
          <div>
            <h3>Tiempo promedio por etapa<Info termino="Tiempo promedio" /></h3>
            <FunnelChart stages={et.map((e) => ({ nombre: e.nombre, valor: e.dias, display: e.n ? e.dias.toFixed(1) + 'd' : '—', n: e.n, sub: 'acum. ' + e.acumulado.toFixed(1) + 'd' }))} />
          </div>
        </div>
        <div className="muted small" style={{ marginTop: 12 }}>
          Foto de hoy del embudo Ventas: leads en cada etapa (número dentro de la barra), suma de sus presupuestos y días promedio que llevan en la etapa. Cierre = ganados del rango, días desde su asignación.
          {mixto(corte) ? ' Las etapas de HubSpot se traducen a las de Kommo (Lead entrante = Por contactar, Precalificación = Conversación iniciada).' : ''}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Actividad">
        <h3>Actividad general</h3>
        <LlamadasBar total={a.llamadas} ok={a.contestadas} no={a.sinContestar} />
        <div className="grid2">
          <Metric n={a.descartes} l="Descartados con razón registrada" />
          <Metric n={a.tareas} l="Tareas completadas" />
          <Metric n={a.cotizaciones} l="Cotizaciones entregadas" />
          <Metric n={a.levantamientos} l="Levantamientos solicitados" />
        </div>
      </CollapsibleSection>
    </>
  )
}

function SaludCol({ titulo, ventas, hunting }: { titulo: string; ventas: number; hunting: number }) {
  return (
    <div className="salud-col">
      <div className="ct">{titulo}</div>
      <div className="salud-row"><span>Ventas</span><span className="big">{fmtN(ventas)}</span></div>
      <div className="salud-row"><span>Hunting</span><span className="big">{fmtN(hunting)}</span></div>
      <div className="salud-row sub"><span>Subtotal</span><span className="big">{fmtN(ventas + hunting)}</span></div>
    </div>
  )
}

// ---------------------------------------------------------------- Asesores
interface Pop { fila: FilaAsesor; x: number; y: number }
interface Det { title: string; total: number; rows: DetRow[]; anchor: DOMRect }

export function Asesores({ corte, filtros, onFicha }: { corte: Corte; filtros: Filtros; onFicha: (uid: string) => void }) {
  const filas = useMemo(() => porAsesor(corte, filtros), [corte, filtros])
  const maxLeads = Math.max(1, ...filas.map((f) => f.leadsActivos.length))
  const maxLlam = Math.max(1, ...filas.map((f) => f.llamadas))
  const maxTar = Math.max(1, ...filas.map((f) => f.tareasCompletadas + f.tareasVencidas + f.sinTarea))
  const [pop, setPop] = useState<Pop | null>(null)
  const [det, setDet] = useState<Det | null>(null)

  // Junto al cursor (offset 14 px); si se saldría por la derecha o por abajo, voltea.
  const abrir = (fila: FilaAsesor, cx: number, cy: number) => {
    const W = 360, H = 440
    let x = cx + 14, y = cy + 14
    if (x + W > window.innerWidth - 8) x = Math.max(8, cx - 14 - W)
    if (y + H > window.innerHeight - 8) y = Math.max(8, cy - 14 - H)
    setDet(null); setPop({ fila, x, y })
  }
  const detalle = (e: SyntheticEvent<HTMLDivElement>, title: string, total: number, rows: DetRow[]) => {
    e.stopPropagation()
    setPop(null); setDet({ title, total, rows, anchor: e.currentTarget.getBoundingClientRect() })
  }

  if (!filas.length) return <div className="panel muted">Sin asesores con leads o actividad en el rango. Amplía el rango de fechas o quita el filtro de equipo.</div>
  return (
    <>
      <div className="tblwrap">
        <table className="tbl">
          <thead><tr><th scope="col">Asesor</th><th scope="col">Leads activos<Info termino="Leads activos" /></th><th scope="col">Presupuesto<Info termino="Presupuesto" /></th><th scope="col">Llamadas<Info termino="Llamadas" /></th><th scope="col">Tareas<Info termino="Tareas" /></th><th scope="col">Cotiz.</th><th scope="col">Desc.</th><th scope="col">Levant.</th></tr></thead>
          <tbody>
            {filas.map((f) => {
              const tar = f.tareasCompletadas + f.tareasVencidas + f.sinTarea
              const abrirTeclado = activar((e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); abrir(f, r.left + 60, r.bottom) })
              return (
                <tr key={f.u.id} className="row" tabIndex={0} aria-haspopup="dialog" aria-label={`Ver resumen de ${f.u.nombre}`}
                  onClick={(e) => abrir(f, e.clientX, e.clientY)} onKeyDown={abrirTeclado}>
                  <td><div className="who"><div className="avatar" title={subAsesor(corte, f.u)} aria-hidden="true">{iniciales(f.u.nombre)}</div><div><div className="nm">{f.u.nombre}</div><div className="sub">{f.ventas} ventas · meta {f.meta ?? '—'}</div></div></div></td>
                  <td><div className="num">{f.leadsActivos.length}</div><div className="minibar" aria-hidden="true"><i style={{ width: pct(f.leadsActivos.length, maxLeads) + '%' }} /></div></td>
                  <td className="num">{fmtMoney(f.presupuesto)}</td>
                  <td className="cellbar">
                    <StackedBar segs={[{ val: f.contestadas, cls: 'seg-comp' }, { val: f.sinContestar, cls: 'seg-warn' }]} total={f.llamadas} max={maxLlam}
                      title={`Llamadas de ${f.u.nombre}: ${f.contestadas} contestadas, ${f.sinContestar} sin contestar. Abrir detalle`}
                      onClick={(e) => detalle(e, 'Llamadas · ' + f.u.nombre, f.llamadas, [{ label: 'Contestadas', val: f.contestadas }, { label: 'Sin contestar', val: f.sinContestar }])} />
                    <div className="tot">{fmtN(f.llamadas)}</div>
                  </td>
                  <td className="cellbar">
                    <StackedBar segs={[{ val: f.tareasCompletadas, cls: 'seg-comp' }, { val: f.tareasVencidas, cls: 'seg-warn' }, { val: f.sinTarea, cls: 'seg-empty' }]} total={tar} max={maxTar}
                      title={`Tareas de ${f.u.nombre}: ${f.tareasCompletadas} completadas, ${f.tareasVencidas} vencidas, ${f.sinTarea} leads sin tarea. Abrir detalle`}
                      onClick={(e) => detalle(e, 'Tareas · ' + f.u.nombre, tar, [{ label: 'Completadas', val: f.tareasCompletadas }, { label: 'Vencidas', val: f.tareasVencidas }, { label: 'Leads sin tarea', val: f.sinTarea }])} />
                    <div className="tot">{fmtN(tar)}</div>
                  </td>
                  <td className="num">{f.cotizaciones}</td>
                  <td className="num">{f.descartes}</td>
                  <td className="num">{f.levantamientos}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {pop && <AsesorPopup corte={corte} filtros={filtros} fila={pop.fila} x={pop.x} y={pop.y} onClose={() => setPop(null)} onFicha={() => { setPop(null); onFicha(pop.fila.u.id) }} />}
      {det && <BarDetailPopup anchor={det.anchor} title={det.title} total={det.total} rows={det.rows} onClose={() => setDet(null)} />}
    </>
  )
}

function AsesorPopup({ corte, filtros, fila, x, y, onClose, onFicha }: { corte: Corte; filtros: Filtros; fila: FilaAsesor; x: number; y: number; onClose: () => void; onFicha: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, onClose)
  useEscape(onClose)
  // Arranca en el último mes del rango (el actual con los presets), no en el primero.
  const [mes, setMes] = useState(() => { const d = new Date((filtros.rango.fin - 1) * 1000); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const ini = ep(mes), fin = ep(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))
  const activos = corte.leads.filter((l) => l.asesor_id === fila.u.id && vivo(l) && l.asignacion >= ini && l.asignacion < fin).sort((p, q) => q.asignacion - p.asignacion)
  const serie = serieDiaria(fila.leadsActivos.map((l) => l.asignacion), filtros.rango)
  const cumpl = fila.meta ? pct(fila.ventas, fila.meta) : null
  return (
    <div className="popup" ref={ref} style={{ left: x, top: y }} role="dialog" aria-label={`Resumen de ${fila.u.nombre}`}>
      <div className="ph">
        <div className="avatar" aria-hidden="true">{iniciales(fila.u.nombre)}</div>
        <div className="nm">{fila.u.nombre}<div className="small muted">{subAsesor(corte, fila.u)}</div></div>
        <button type="button" className="ib" aria-label="Ver ficha completa" title="Ver ficha completa" onClick={onFicha}>↗</button>
        <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
      </div>
      <div className="kpi3">
        <div><div className="l">Ventas</div><div className="v">{fila.ventas}</div></div>
        <div><div className="l">Cumplimiento<Info termino="Cumplimiento" /></div><div className="v">{cumpl == null ? '—' : cumpl + '%'}</div></div>
        <div><div className="l">Leads</div><div className="v">{fila.leadsActivos.length}</div></div>
      </div>
      <div className="pchart"><MiniAreaChart values={serie} height={54} /><div className="small muted">Leads asignados por día · {filtros.rango.label}</div></div>
      <div className="pleads">
        <div>
          <div className="lh"><h3>Leads activos</h3>
            <span className="mnav"><button type="button" aria-label="Mes anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>‹</button><span aria-live="polite">{mesNombre(mes)}</span><button type="button" aria-label="Mes siguiente" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>›</button></span>
          </div>
          {activos.slice(0, 6).map((l) => <div className="leadrow" key={l.id}><span className="nm" title={l.nombre + ' · ' + CRM_LABEL[l.crm]}>{l.nombre}</span><span className="tag" title={CRM_LABEL[l.crm]}>{tipoLead(l)}{mixto(corte) ? ' · ' + crmCorto(l) : ''}</span><span>{l.dias_sin_cambio}d</span></div>)}
          {activos.length > 6 && <div className="small muted">+{activos.length - 6} más</div>}
          {!activos.length && <div className="small muted">Sin leads activos asignados en {mesNombre(mes)}</div>}
        </div>
        <div className="donut-wrap"><Donut pct={cumpl ?? 0} label="META" />{cumpl == null && <span className="small muted">sin meta</span>}</div>
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
  const meta = corte.metas[uid] ?? null
  const monto = ventas.reduce((s, l) => s + l.presupuesto, 0)
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
        <div className="who"><div className="avatar" aria-hidden="true">{iniciales(u.nombre)}</div><div><h2 className="nm" style={{ margin: 0, fontSize: 13 }}>{u.nombre}</h2><div className="sub">{subAsesor(corte, u)}</div></div></div>
        <span className="tag dark">{leads.filter(vivo).length} leads activos</span>
      </div>
      <div className="kgrid">
        <div className="kcard hero"><div className="l">Ventas · {filtros.rango.label}</div><div className="n"><b>{ventas.length}</b></div><MiniAreaChart values={serie} height={56} /></div>
        <div className="kcard"><div className="l">Conversión<Info termino="Conversión" /></div><div className="n">{leads.length ? pct(ventas.length, leads.length) + '%' : '—'}</div><div className="small muted">{ventas.length} ventas / {leads.length} leads asignados en el rango</div></div>
        <div className="kcard"><div className="l">Cumplimiento<Info termino="Cumplimiento" /></div><div className="n">{meta ? pct(ventas.length, meta) + '%' : '—'}</div><div className="small muted">{meta ? `meta ${meta}` : 'sin meta configurada (VENTAS_METAS)'}</div></div>
        <div className="kcard"><div className="l">Monto total</div><div className="n" style={{ fontSize: 28 }}>{fmtMXN(monto)}</div><div className="small muted">presupuesto de las ventas cerradas</div></div>
      </div>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="chart"><div className="ch"><h3 style={{ margin: 0 }}>Actividad por día</h3>
          <span className="mnav"><button type="button" aria-label="Semana anterior" onClick={() => setSem(sumar(sem, -7))}>‹</button><span aria-live="polite">{fmtCorta(dias[0])} – {fmtCorta(dias[6])}</span><button type="button" aria-label="Semana siguiente" onClick={() => setSem(sumar(sem, 7))}>›</button></span></div></div>
        <BubbleChart cols={cols} />
        <div className="legend"><span><i className="lg-comp" aria-hidden="true" />Llamadas</span><span><i className="lg-warn" aria-hidden="true" />Tareas completadas</span><span><i className="lg-e" aria-hidden="true" />Cotizaciones · levantamientos</span></div>
      </div>
      <div className="panel">
        <h3>Tareas &amp; leads</h3>
        {!tareas.length && <div className="muted">Sin tareas abiertas en el CRM para este asesor.</div>}
        <div className="cards">
          {tareas.map((t) => { const d = Math.floor((t.vence - hoy) / 86400); const nm = t.lead_nombre || t.texto || 'Sin nombre'; return (
            <div className="card" key={t.id}>
              <span className={'tag' + (t.vencida ? ' dark' : '')}>{t.tipo}</span>
              <div className="nm">{t.link ? <a href={t.link} target="_blank" rel="noreferrer">{nm}</a> : nm}</div>
              <div className="ds">{t.lead_nombre ? (t.texto || 'Sin descripción') : CRM_LABEL[t.crm]}</div>
              <div className="dd">{d < 0 ? `Vencida hace ${-d}d` : d === 0 ? 'Vence hoy' : `${d}d restantes`}</div>
            </div>) })}
        </div>
      </div>
    </>
  )
}
