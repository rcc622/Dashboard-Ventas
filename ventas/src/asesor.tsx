import { useEffect, useMemo, useState } from 'react'
import type { Corte } from './types'
import { CRM_LABEL } from './types'
import { dias, enRango, todasVentas, fechaDe, fmtCorta, fmtFecha, fmtHora, fmtMoney, fmtMoney0, fmtN, hoyIni, leaderboardHoy, metaDeId, miDia, pct, preset, tipoLead, vivo } from './metrics'
import { Bullet, Info } from './components'
import { WidgetGrid, type Widget } from './widgets'

// Estado de checklist, tareas propias y notas viven en el navegador del asesor
// (localStorage): nada de esto se escribe al CRM.
const ls = {
  get<T>(k: string, fb: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fb } catch { return fb } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* modo privado */ } },
}
type Estado = 'pend' | 'prog' | 'done'
interface TareaLocal { id: string; texto: string; hora: string }
const hoyKey = () => new Date().toISOString().slice(0, 10)
const mixto = (c: Corte) => (c.fuentes || []).length > 1

export function MiDia({ corte, uid, compartible }: { corte: Corte; uid: string; compartible?: boolean }) {
  const d = useMemo(() => miDia(corte, uid), [corte, uid])
  const ranking = useMemo(() => leaderboardHoy(corte), [corte])
  const [tab, setTab] = useState<'dia' | 'semana'>('dia')
  const [estados, setEstados] = useState<Record<string, Estado>>(() => ls.get('kv_estado_' + hoyKey(), {}))
  const [locales, setLocales] = useState<TareaLocal[]>(() => ls.get('kv_tareas_' + uid, []))
  const [nueva, setNueva] = useState<string | null>(null)
  const [notas, setNotas] = useState(() => ls.get('kv_notas_' + uid + '_' + hoyKey(), ''))
  useEffect(() => { setLocales(ls.get('kv_tareas_' + uid, [])); setNotas(ls.get('kv_notas_' + uid + '_' + hoyKey(), '')) }, [uid])

  // Las propias van primero: nunca deben quedar fuera del tope de la lista.
  const items = [
    ...locales.map((t) => ({ id: t.id, texto: t.texto, sub: 'Tarea propia', hora: t.hora, vencida: false })),
    ...d.tareasHoy.map((t) => ({ id: t.id, texto: t.texto || t.tipo, sub: t.lead_nombre || CRM_LABEL[t.crm], hora: fmtHora(t.vence), vencida: t.vencida })),
  ]
  const hechas = items.filter((i) => estados[i.id] === 'done').length + d.tareasHechasHoy
  // KPI: lo de HOY (vencen hoy + propias + ya completadas hoy); el rezago vencido no cuenta aquí.
  const total = d.hoyN + locales.length + d.tareasHechasHoy
  const MAX_LISTA = 60
  const st: Record<Estado, string> = { pend: 'Pendiente', prog: 'En progreso', done: 'Completado' }
  const ciclo = (id: string) => {
    const sig: Record<Estado, Estado> = { pend: 'prog', prog: 'done', done: 'pend' }
    const e = { ...estados, [id]: sig[estados[id] || 'pend'] }
    setEstados(e); ls.set('kv_estado_' + hoyKey(), e)
  }
  const agregar = (texto: string) => {
    const t = texto.trim()
    if (t) { const l = [...locales, { id: 'L' + Date.now(), texto: t, hora: fmtHora(Math.floor(Date.now() / 1000)) }]; setLocales(l); ls.set('kv_tareas_' + uid, l) }
    setNueva(null)
  }
  const guardarNotas = (v: string) => { setNotas(v); ls.set('kv_notas_' + uid + '_' + hoyKey(), v) }

  const barras = tab === 'dia'
    ? [['Llamadas', d.eventosHoy.filter((e) => e.tipo.startsWith('llamada')).length], ['Tareas', d.eventosHoy.filter((e) => e.tipo === 'tarea').length],
      ['Cotizaciones', d.eventosHoy.filter((e) => e.tipo === 'cotizacion').length], ['Levantamientos', d.eventosHoy.filter((e) => e.tipo === 'levantamiento').length],
      ['Descartes', d.eventosHoy.filter((e) => e.tipo === 'descarte').length]] as [string, number][]
    : ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((n, i) => [n, d.eventosSemana.filter((e) => (fechaDe(e.ts).getDay() + 6) % 7 === i).length] as [string, number])
  const maxB = Math.max(1, ...barras.map((b) => b[1]))
  const faltan = Math.max(0, d.metaMes - d.vendidoMes)

  const W = (id: string, titulo: string, nodo: React.ReactNode, opts: Partial<Widget> = {}): Widget => ({ id, titulo, nodo, ...opts })
  const widgets: Widget[] = [
    W('kpis', 'Mi día en números', (
      <div className="kpi4">
        <div><div className="n">{hechas}/{total}</div><div className="l">Tareas hoy · completadas<Info termino="Tareas hoy" /></div></div>
        <div><div className="n">{d.ventasHoy}</div><div className="l">Ventas del día</div>
          <Bullet sm value={d.vendidoMes} target={d.metaMes} expected={d.esperadoMes} label="Vendido este mes" fmt={fmtMoney0} />
          <div className="small muted" style={{ marginTop: 4 }}>Mes: {fmtMoney0(d.vendidoMes)} de {fmtMoney0(d.metaMes)} · <span className={'rt ' + d.ritmoMes.estado}>{d.ritmoMes.corto}</span>{faltan ? ` · faltan ${fmtMoney0(faltan)}` : ''}<Info termino="Ritmo" /></div></div>
        <div><div className="n">{d.llamadasHoy}</div><div className="l">Llamadas realizadas</div></div>
        <div><div className="n">{d.prospectosHoy}</div><div className="l">Prospectos nuevos</div></div>
      </div>
    ), { plain: true, alto: 6, info: ['Mi día'] }),
    W('actividad', 'Actividad', (
      <div className="chart">
        <div className="ch" style={{ justifyContent: 'flex-end' }}>
          <span className="pill sm" role="group" aria-label="Periodo">
            <button type="button" className={tab === 'dia' ? 'on' : ''} aria-pressed={tab === 'dia'} onClick={() => setTab('dia')}>Día</button>
            <button type="button" className={tab === 'semana' ? 'on' : ''} aria-pressed={tab === 'semana'} onClick={() => setTab('semana')}>Semana</button>
          </span></div>
        <div className="bars" role="img" aria-label={barras.map(([n, v]) => `${n}: ${v}`).join(', ')}>{barras.map(([n, v]) => <div className="bar" key={n}><span className="v">{v}</span><i className={v ? '' : 'hollow'} style={{ height: Math.max(2, (v / maxB) * 100) + '%' }} /></div>)}</div>
        <div className="blabels" aria-hidden="true">{barras.map(([n]) => <span key={n}>{n}</span>)}</div>
      </div>
    ), { alto: 6, info: ['Actividad de hoy'] }),
    W('tareas', 'Tareas del día', (
      <>
        {!items.length && <div className="muted">Sin tareas para hoy en el CRM. Agrega las tuyas abajo.</div>}
        {items.slice(0, MAX_LISTA).map((t) => { const e = estados[t.id] || 'pend'; return (
          <button type="button" className="task" key={t.id} onClick={() => ciclo(t.id)} aria-label={`${t.texto}, ${t.sub}, ${st[e]}. Cambiar estado`}>
            <span className={'chk ' + (e === 'done' ? 'done' : e === 'prog' ? 'half' : '')} aria-hidden="true">{e === 'done' ? '✓' : ''}</span>
            <span className={'tx' + (e === 'done' ? ' done' : '')} title={t.texto}>{t.texto} <span className="muted">· {t.sub}</span></span>
            <span className="hr">{t.vencida ? 'vencida' : t.hora}</span>
            <span className={'st ' + (e === 'prog' ? 'prog' : e === 'done' ? 'done' : '')}>{st[e]}</span>
          </button>) })}
        {items.length > MAX_LISTA && <div className="small muted" style={{ marginTop: 8 }}>Se muestran {MAX_LISTA} de {items.length}; el resto está en Calendario.</div>}
        {d.vencidasViejas > 0 && <div className="small muted" style={{ marginTop: 8 }}>+{fmtN(d.vencidasViejas)} vencidas de hace más de 14 días, fuera de esta lista (ver Calendario).</div>}
        {nueva == null
          ? <button type="button" className="add-task" onClick={() => setNueva('')}>+ Agregar tarea</button>
          : <div className="add-task"><input autoFocus aria-label="Nueva tarea" placeholder="Escribe la tarea y presiona Enter…" value={nueva} onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregar(nueva); if (e.key === 'Escape') setNueva(null) }} onBlur={() => agregar(nueva)} /></div>}
      </>
    ), { cls: 'tasks', alto: 9, info: ['Tareas del día'] }),
    W('leader', 'Leaderboard · Hoy', (
      <>
        {ranking.map((r, i) => (
          <div className={'lr' + (r.u.id === uid ? ' me' : '')} key={r.u.id} aria-current={r.u.id === uid ? 'true' : undefined}>
            <span className={'pos' + (i < 3 ? ' top' : '')}>{i + 1}</span><span>{r.u.nombre}</span><span>{r.ventas} ventas</span><span className="muted">{r.puntos} actividades</span>
          </div>))}
        <div className="small muted" style={{ marginTop: 6 }}>Actividades = llamadas, tareas, cotizaciones y levantamientos registrados hoy<Info termino="Actividades" /></div>
      </>
    ), { cls: 'leader', alto: 9, info: ['Leaderboard'] }),
    W('notas', 'Notas del día', (
      <textarea aria-label="Notas del día" value={notas} onChange={(e) => guardarNotas(e.target.value)} placeholder="Escribe aquí. Se guarda en este navegador…" />
    ), { cls: 'notes', alto: 5 }),
  ]
  return <WidgetGrid clave={'midia-' + uid} widgets={widgets} compartible={compartible} />
}

export function MisVentas({ corte, uid }: { corte: Corte; uid: string }) {
  const v = todasVentas(corte).filter((l) => l.asesor_id === uid).sort((a, b) => b.cerrado - a.cerrado)
  const monto = v.reduce((s, l) => s + l.presupuesto, 0)
  const mes = preset('mes'), meta = metaDeId(corte, uid)
  const vendidoMes = v.filter((l) => enRango(l.cerrado, mes)).reduce((s, l) => s + l.presupuesto, 0)
  return (
    <div className="panel list">
      <h3>Mis ventas · últimos {corte.dias_historia} días</h3>
      <div className="big" style={{ marginBottom: 4 }}>{v.length} ventas · {fmtMoney(monto)}</div>
      <div className="small muted" style={{ marginBottom: 10 }}>Este mes {fmtMoney0(vendidoMes)} de {fmtMoney0(meta)} de meta ({pct(vendidoMes, meta)}%)<Info termino="Meta" /></div>
      {!v.length && <div className="muted">Sin ventas cerradas en el periodo.</div>}
      {v.map((l) => <div className="li" key={l.id}><span className="nm"><a href={l.link} target="_blank" rel="noreferrer">{l.nombre}</a>{mixto(corte) && <span className="tag" style={{ marginLeft: 6 }}>{CRM_LABEL[l.crm]}</span>}</span><span>{fmtMoney(l.presupuesto)}</span><span className="muted">{fmtFecha(fechaDe(l.cerrado))}</span></div>)}
    </div>
  )
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Prospectos({ corte, uid }: { corte: Corte; uid: string }) {
  const [q, setQ] = useState('')
  const todos = useMemo(() => corte.leads.filter((l) => l.asesor_id === uid && vivo(l)).sort((a, b) => b.dias_sin_cambio - a.dias_sin_cambio), [corte, uid])
  const nq = norm(q.trim())
  const p = nq ? todos.filter((l) => norm(l.nombre + ' ' + l.etapa + ' ' + tipoLead(l)).includes(nq)) : todos
  return (
    <div className="panel list">
      <div className="ch" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Prospectos activos · {fmtN(p.length)}{nq ? ` de ${fmtN(todos.length)}` : ''}</h3>
        <input className="sel" type="search" aria-label="Buscar prospecto" placeholder="Buscar por nombre o etapa…" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontWeight: 500, minWidth: 220 }} />
      </div>
      {!todos.length && <div className="muted">Sin prospectos activos.</div>}
      {todos.length > 0 && !p.length && <div className="muted">Nada coincide con «{q}». Prueba con parte del nombre o la etapa.</div>}
      {p.slice(0, 200).map((l) => (
        <div className="li" key={l.id}>
          <span className="nm"><a href={l.link} target="_blank" rel="noreferrer">{l.nombre}</a> <span className="tag">{tipoLead(l)} · {l.etapa}{mixto(corte) ? ' · ' + CRM_LABEL[l.crm] : ''}</span></span>
          <span>{fmtMoney(l.presupuesto)}</span><span className="muted">{dias(l.dias_sin_cambio)} sin cambio{l.tareas_vencidas ? ` · ${l.tareas_vencidas} tarea${l.tareas_vencidas > 1 ? 's' : ''} vencida${l.tareas_vencidas > 1 ? 's' : ''}` : ''}</span>
        </div>))}
      {p.length > 200 && <div className="small muted">Se muestran 200 de {p.length}</div>}
    </div>
  )
}

export function Calendario({ corte, uid }: { corte: Corte; uid: string }) {
  const h = hoyIni()
  const t = corte.tareas_abiertas.filter((x) => x.asesor_id === uid).sort((a, b) => a.vence - b.vence)
  const grupos: { titulo: string; tareas: typeof t }[] = [{ titulo: 'Vencidas', tareas: t.filter((x) => x.vence < h) }]
  for (let i = 0; i < 14; i++) {
    const ini = h + i * 86400
    grupos.push({ titulo: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : fmtCorta(fechaDe(ini)), tareas: t.filter((x) => x.vence >= ini && x.vence < ini + 86400) })
  }
  const despues = t.filter((x) => x.vence >= h + 14 * 86400)
  return (
    <div className="panel">
      <h3>Calendario · tareas abiertas en el CRM</h3>
      {grupos.filter((g) => g.tareas.length).map((g) => (
        <div className="daygroup" key={g.titulo}><div className="dh">{g.titulo} · {g.tareas.length}</div>
          {g.tareas.map((x) => { const nm = x.lead_nombre || x.texto || 'Sin nombre'; return (
            <div className="li list" key={x.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 12, padding: '4px 0' }}>
              <span className="muted">{fmtHora(x.vence)}</span>
              <span>{x.link ? <a href={x.link} target="_blank" rel="noreferrer">{nm}</a> : nm}{x.lead_nombre && <span className="muted"> · {x.texto || x.tipo}</span>}</span>
              <span className="tag">{x.tipo}{mixto(corte) ? ' · ' + CRM_LABEL[x.crm] : ''}</span>
            </div>) })}
        </div>))}
      {despues.length > 0 && <div className="muted small">+{despues.length} tareas después de 14 días</div>}
      {!t.length && <div className="muted">Sin tareas abiertas.</div>}
    </div>
  )
}
