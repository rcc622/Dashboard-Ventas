import { useEffect, useMemo, useRef, useState } from 'react'
import { CRM_LABEL } from './types'
import { ep, fechaDe, fmtCorta, fmtHora, fmtMoney, fmtN, inicioDia, sumar, type Fila } from './metrics'
import { useEscape, useFocoDialogo, useOutside } from './components'

// Ventana de detalle (drill-down): la lista de registros detrás de una cifra o barra, con
// búsqueda y el nombre como liga al registro en su CRM. Pedido de Randall 4-sep, calcado del
// drill-down de los reportes de HubSpot. Nada aquí escribe a ningún CRM.
// 6-sep (Randall): filtros «como HubSpot y Sheets»: cada columna tiene su menú (ordenar, filtrar
// por condición, filtrar por valores con buscador y conteos, Aceptar/Cancelar), los filtros
// activos se ven como chips, se puede agrupar por una columna y la lista va por páginas de 100.
export interface Drill { titulo: string; sub?: string; filas: Fila[] }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

type Col = 'estado' | 'nombre' | 'crm' | 'asesor' | 'ciudad' | 'embudo' | 'etapa' | 'detalle' | 'num' | 'monto' | 'cuando'
type Tipo = 'texto' | 'monto' | 'fecha' | 'numero'
interface ColDef { id: Col; label: string; tipo: Tipo }
const COLS: ColDef[] = [
  { id: 'estado', label: 'Estado', tipo: 'texto' }, { id: 'nombre', label: 'Registro', tipo: 'texto' }, { id: 'crm', label: 'CRM', tipo: 'texto' },
  { id: 'asesor', label: 'Asesor', tipo: 'texto' }, { id: 'ciudad', label: 'Ciudad', tipo: 'texto' }, { id: 'embudo', label: 'Embudo', tipo: 'texto' }, { id: 'etapa', label: 'Etapa', tipo: 'texto' },
  { id: 'detalle', label: 'Detalle', tipo: 'texto' }, { id: 'num', label: 'Número', tipo: 'numero' }, { id: 'monto', label: 'Monto', tipo: 'monto' }, { id: 'cuando', label: 'Cuándo', tipo: 'fecha' },
]
/** Columnas que solo aparecen cuando las filas de esta ventana las traen. */
const OPCIONALES: Record<string, (f: Fila) => unknown> = { estado: (f) => f.estado, ciudad: (f) => f.ciudad, embudo: (f) => f.embudo, etapa: (f) => f.etapa, detalle: (f) => f.detalle, num: (f) => f.num }
/** Texto con el que se filtra por valores y se ordena una columna de texto. */
const texto = (f: Fila, c: Col): string =>
  c === 'crm' ? CRM_LABEL[f.crm] : c === 'estado' ? (f.estado || '—') : c === 'nombre' ? f.nombre : c === 'asesor' ? (f.asesor || '—')
    : c === 'ciudad' ? (f.ciudad || 'Sin ciudad') : c === 'embudo' ? (f.embudo || '—') : c === 'etapa' ? (f.etapa || '—') : c === 'detalle' ? (f.detalle || '—')
      : c === 'num' ? (f.num == null ? '—' : fmtN(f.num)) : c === 'monto' ? (f.monto ? fmtMoney(f.monto) : '—') : (f.cuando ? fmtCorta(fechaDe(f.cuando)) : '—')
const numero = (f: Fila, c: Col): number | undefined => (c === 'monto' ? f.monto : c === 'cuando' ? f.cuando : c === 'num' ? f.num : undefined)

/** Filtro de una columna: valores marcados (null = todos), rango para monto y fecha, «contiene» para texto. */
interface FiltroCol { valores: Set<string> | null; sin?: string[]; min?: number; max?: number; contiene?: string }   // `sin`: los pocos valores desmarcados, para que el chip diga «sin X» en vez de «21 valores»
type Filtros = Partial<Record<Col, FiltroCol>>
interface Orden { col: Col; dir: 'asc' | 'desc' }
const activo = (x?: FiltroCol) => !!x && (x.valores !== null || x.min != null || x.max != null || !!x.contiene)
function pasa(f: Fila, c: Col, x: FiltroCol): boolean {
  if (x.valores && !x.valores.has(texto(f, c))) return false
  const n = numero(f, c)
  if (x.min != null && (n == null || n < x.min)) return false
  if (x.max != null && (n == null || n > x.max)) return false
  if (x.contiene && !norm(texto(f, c)).includes(norm(x.contiene))) return false
  return true
}
function ordenar(filas: Fila[], o: Orden | null): Fila[] {
  if (!o) return filas
  const tipo = COLS.find((c) => c.id === o.col)!.tipo, s = o.dir === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => {
    if (tipo === 'texto') return texto(a, o.col).localeCompare(texto(b, o.col), 'es') * s
    const x = numero(a, o.col), y = numero(b, o.col)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return (x - y) * s
  })
}
/** Lo que dice el chip de un filtro activo. */
function resumen(col: ColDef, x: FiltroCol): string {
  const out: string[] = []
  if (x.valores) out.push(x.valores.size === 0 ? 'ningún valor' : x.valores.size <= 2 ? [...x.valores].join(', ') : x.sin?.length ? `sin ${x.sin.join(', ')}` : `${fmtN(x.valores.size)} valores`)
  const f = (n: number) => (col.tipo === 'monto' ? fmtMoney(n) : col.tipo === 'numero' ? fmtN(n) : fmtCorta(fechaDe(n)))
  if (x.min != null && x.max != null) out.push(`${f(x.min)} a ${f(x.max)}`)
  else if (x.min != null) out.push(`desde ${f(x.min)}`)
  else if (x.max != null) out.push(`hasta ${f(x.max)}`)
  if (x.contiene) out.push(`contiene «${x.contiene}»`)
  return out.join(' · ')
}
const iso = (ts?: number) => { if (ts == null) return ''; const d = fechaDe(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const deIso = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null }
const POR_PAGINA = [50, 100, 250, 500]

export function DrillModal({ d, onClose }: { d: Drill; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [filtros, setFiltros] = useState<Filtros>({})
  const [orden, setOrden] = useState<Orden | null>(null)
  const [grupo, setGrupo] = useState<Col | null>(null)
  const [cerrados, setCerrados] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ col: Col; anchor: DOMRect } | null>(null)
  const [pagina, setPagina] = useState(0)
  const [porPagina, setPorPagina] = useState(100)
  const inp = useRef<HTMLInputElement>(null)
  // Escape cierra primero el menú de columna; sin menú, la ventana.
  useEscape(() => (menu ? setMenu(null) : onClose()))
  // Foco al buscador al abrir; al cerrar, de vuelta a lo que se clickeó.
  useEffect(() => { const prev = document.activeElement as HTMLElement | null; inp.current?.focus(); return () => prev?.focus?.() }, [])
  useEffect(() => { setPagina(0) }, [q, filtros, orden, grupo, porPagina, d])
  useEffect(() => { setFiltros({}); setOrden(null); setGrupo(null); setCerrados(new Set()); setMenu(null) }, [d])

  const conEstado = d.filas.some((f) => f.estado)
  // Cada ventana enseña solo sus columnas, y la numérica toma el nombre que traigan las filas
  // («Días sin cambio», «Horas al primer contacto»…) para poder ordenarla de mayor a menor de verdad.
  const cols = useMemo(() => {
    const etiqueta = d.filas.find((f) => f.numLabel)?.numLabel
    return COLS.filter((c) => { const p = OPCIONALES[c.id]; return !p || d.filas.some((f) => { const v = p(f); return v != null && v !== '' }) })
      .map((c) => (c.id === 'num' && etiqueta ? { ...c, label: etiqueta } : c))
  }, [d])
  const nq = norm(q.trim())
  const buscadas = useMemo(() => (nq ? d.filas.filter((f) => norm([f.nombre, f.asesor, f.ciudad, f.embudo, f.etapa, f.detalle, f.estado].filter(Boolean).join(' ')).includes(nq)) : d.filas), [d, nq])
  const filtradas = useMemo(() => {
    const act = (Object.entries(filtros) as [Col, FiltroCol][]).filter(([, x]) => activo(x))
    const base = act.length ? buscadas.filter((f) => act.every(([c, x]) => pasa(f, c, x))) : buscadas
    return ordenar(base, orden)
  }, [buscadas, filtros, orden])
  /** Para el menú de una columna: las filas que pasan los DEMÁS filtros (así los conteos son los que se verían). */
  const filasPara = (c: Col) => {
    const act = (Object.entries(filtros) as [Col, FiltroCol][]).filter(([k, x]) => k !== c && activo(x))
    return act.length ? buscadas.filter((f) => act.every(([k, x]) => pasa(f, k, x))) : buscadas
  }
  const chips = cols.filter((c) => activo(filtros[c.id])).map((c) => ({ col: c, label: `${c.label}: ${resumen(c, filtros[c.id]!)}` }))
  const total = filtradas.reduce((s, f) => s + (f.monto || 0), 0)
  const alertas = filtradas.filter((f) => f.alerta).length
  const crms = [...new Set(d.filas.map((f) => f.crm))]
  const sinLiga = d.filas.filter((f) => !f.link).length
  const cuando = (ts?: number) => (ts ? `${fmtCorta(fechaDe(ts))} ${fmtHora(ts)}` : '—')
  const toggleOrden = (c: Col) => setOrden((o) => (o?.col === c ? (o.dir === 'asc' ? { col: c, dir: 'desc' } : null) : { col: c, dir: 'asc' }))
  const quitarFiltro = (c: Col) => setFiltros((f) => { const n = { ...f }; delete n[c]; return n })
  const limpiar = () => { setFiltros({}); setOrden(null); setQ('') }

  // Grupos (HubSpot «Group by»): encabezado por valor con conteo y monto; sin páginas cuando hay grupos.
  const grupos = useMemo(() => {
    if (!grupo) return null
    const m = new Map<string, Fila[]>()
    for (const f of filtradas) { const k = texto(f, grupo); m.set(k, [...(m.get(k) || []), f]) }
    return [...m.entries()].map(([clave, fs]) => ({ clave, filas: fs, monto: fs.reduce((s, f) => s + (f.monto || 0), 0) }))
  }, [filtradas, grupo])
  const TOPE_GRUPOS = 1500
  const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina))
  const pag = Math.min(pagina, paginas - 1)
  const visibles = grupo ? filtradas : filtradas.slice(pag * porPagina, (pag + 1) * porPagina)
  const nCols = cols.length

  const hay = (c: Col) => cols.some((x) => x.id === c)
  const fila = (f: Fila) => (
    <tr key={f.id}>
      {conEstado && <td><span className={'tag' + (f.alerta ? ' alerta' : '')}>{f.estado || '—'}</span></td>}
      <td>{f.link ? <a href={f.link} target="_blank" rel="noreferrer" title={'Abrir en ' + CRM_LABEL[f.crm]}>{f.nombre}</a> : <span className="muted">{f.nombre}</span>}</td>
      <td><span className="tag">{CRM_LABEL[f.crm]}</span></td>
      <td>{f.asesor}</td>
      {hay('ciudad') && <td>{f.ciudad || <span className="muted">Sin ciudad</span>}</td>}
      {hay('embudo') && <td>{f.embudo || '—'}</td>}
      {hay('etapa') && <td>{f.etapa || '—'}</td>}
      {hay('detalle') && <td>{f.detalle || '—'}</td>}
      {hay('num') && <td className="num">{f.num == null ? '—' : fmtN(f.num)}</td>}
      <td className="num">{f.monto ? fmtMoney(f.monto) : '—'}</td>
      <td className="muted">{cuando(f.cuando)}</td>
    </tr>
  )
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={d.titulo}>
        <div className="mh">
          <div className="mt">
            <h2>{d.titulo}</h2>
            <div className="small muted" aria-live="polite">
              {fmtN(filtradas.length)}{filtradas.length !== d.filas.length ? ` de ${fmtN(d.filas.length)}` : ''} registro{filtradas.length === 1 ? '' : 's'}{total ? ` · ${fmtMoney(total)}` : ''}{conEstado ? ` · ${fmtN(alertas)} sin pareja` : ''}{crms.length ? ' · ' + crms.map((c) => CRM_LABEL[c]).join(' + ') : ''}{d.sub ? ' · ' + d.sub : ''}
            </div>
          </div>
          <input ref={inp} className="sel" type="search" placeholder="Buscar nombre, asesor, ciudad o etapa…" aria-label="Buscar en el detalle" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        {/* Herramientas como en HubSpot: agrupar, chips de filtros activos, borrar todo. */}
        <div className="mtools">
          <label className="small muted">Agrupar por <select className="sel sm" aria-label="Agrupar por" value={grupo ?? ''} onChange={(e) => { setGrupo((e.target.value || null) as Col | null); setCerrados(new Set()) }}>
            <option value="">Sin agrupar</option>
            {cols.filter((c) => c.tipo === 'texto' && c.id !== 'nombre').map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select></label>
          {chips.length > 0 && <span className="small muted">Filtros ({chips.length})</span>}
          {chips.map((ch) => <button type="button" key={ch.col.id} className="chip" title={`Quitar el filtro de ${ch.col.label}`} onClick={() => quitarFiltro(ch.col.id)}>{ch.label} <b aria-hidden="true">×</b></button>)}
          {orden && <button type="button" className="chip" title="Quitar el orden" onClick={() => setOrden(null)}>Orden: {cols.find((c) => c.id === orden.col)?.label} {orden.dir === 'asc' ? '↑' : '↓'} <b aria-hidden="true">×</b></button>}
          {(chips.length > 0 || orden || nq) && <button type="button" className="nbtn small" onClick={limpiar}>Borrar todo</button>}
          <span className="small muted" style={{ marginLeft: 'auto' }}>▾ en cada columna: ordenar y filtrar</span>
        </div>
        <div className="mb">
          {!filtradas.length && <div className="muted" style={{ padding: 16 }}>Nada que mostrar{nq ? ` para «${q}»` : ''}{chips.length ? ' con estos filtros' : ''}.</div>}
          {filtradas.length > 0 && (
            <table className="ftable dtable">
              <thead><tr>
                {cols.map((c) => (
                  <th scope="col" key={c.id} className={c.tipo === 'monto' || c.tipo === 'numero' ? 'num' : ''} aria-sort={orden?.col === c.id ? (orden.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    <span className="hcol">
                      <button type="button" className="hsort" aria-label={`Ordenar por ${c.label}`} onClick={() => toggleOrden(c.id)}>{c.label}<span aria-hidden="true">{orden?.col === c.id ? (orden.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span></button>
                      <button type="button" className={'fbtn' + (activo(filtros[c.id]) ? ' on' : '')} aria-label={`Ordenar y filtrar ${c.label}`} aria-haspopup="dialog" aria-expanded={menu?.col === c.id}
                        onClick={(e) => setMenu(menu?.col === c.id ? null : { col: c.id, anchor: e.currentTarget.getBoundingClientRect() })}>
                        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5z" fill="currentColor" /></svg>
                      </button>
                    </span>
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {grupos ? grupos.slice(0, 400).map((g) => (
                  <GrupoFilas key={g.clave} clave={g.clave} n={g.filas.length} monto={g.monto} nCols={nCols} cerrado={cerrados.has(g.clave)}
                    onToggle={() => setCerrados((s) => { const n = new Set(s); if (n.has(g.clave)) n.delete(g.clave); else n.add(g.clave); return n })}>
                    {g.filas.slice(0, TOPE_GRUPOS).map(fila)}
                  </GrupoFilas>
                )) : visibles.map(fila)}
              </tbody>
            </table>
          )}
          {grupos && filtradas.length > TOPE_GRUPOS && <div className="small muted" style={{ padding: '8px 0' }}>Con grupos se muestran hasta {fmtN(TOPE_GRUPOS)} registros por grupo; filtra para ver el resto.</div>}
          {!grupo && filtradas.length > POR_PAGINA[0] && (
            <nav className="mpag" aria-label="Páginas del detalle">
              <button type="button" className="btn ghost" disabled={pag === 0} onClick={() => setPagina(pag - 1)}>‹ Anterior</button>
              <span>{fmtN(pag * porPagina + 1)}–{fmtN(Math.min(filtradas.length, (pag + 1) * porPagina))} de {fmtN(filtradas.length)}</span>
              <button type="button" className="btn ghost" disabled={pag >= paginas - 1} onClick={() => setPagina(pag + 1)}>Siguiente ›</button>
              <select className="sel sm" aria-label="Registros por página" value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))}>{POR_PAGINA.map((n) => <option key={n} value={n}>{n} por página</option>)}</select>
            </nav>
          )}
        </div>
        <div className="mf small muted">
          Clic en el nombre abre el registro en su CRM en otra pestaña.{sinLiga > 0 ? ` ${fmtN(sinLiga)} registro${sinLiga === 1 ? '' : 's'} sin liga: HubSpot no liga tareas ni llamadas al deal.` : ''} Esc o clic afuera cierra.
        </div>
        {menu && <MenuCol col={cols.find((c) => c.id === menu.col)!} filas={filasPara(menu.col)} filtro={filtros[menu.col]} anchor={menu.anchor}
          onOrden={(dir) => { setOrden({ col: menu.col, dir }); setMenu(null) }}
          onAplicar={(x) => { setFiltros((f) => (activo(x) ? { ...f, [menu.col]: x } : (() => { const n = { ...f }; delete n[menu.col]; return n })())); setMenu(null) }}
          onClose={() => setMenu(null)} />}
      </div>
    </div>
  )
}

function GrupoFilas({ clave, n, monto, nCols, cerrado, onToggle, children }: { clave: string; n: number; monto: number; nCols: number; cerrado: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <>
      <tr className="grow"><td colSpan={nCols}><button type="button" aria-expanded={!cerrado} onClick={onToggle}><span aria-hidden="true">{cerrado ? '▸' : '▾'}</span>{clave}<span className="muted">{fmtN(n)} registro{n === 1 ? '' : 's'}{monto ? ` · ${fmtMoney(monto)}` : ''}</span></button></td></tr>
      {!cerrado && children}
    </>
  )
}

/** Menú de una columna, calcado del filtro de Google Sheets: ordenar, condición, valores con buscador; Aceptar aplica, Cancelar deja todo como estaba. */
function MenuCol({ col, filas, filtro, anchor, onOrden, onAplicar, onClose }: { col: ColDef; filas: Fila[]; filtro?: FiltroCol; anchor: DOMRect; onOrden: (dir: 'asc' | 'desc') => void; onAplicar: (x: FiltroCol) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, onClose)
  useFocoDialogo(ref)
  const [val, setVal] = useState<Set<string> | null>(filtro?.valores ?? null)
  const [min, setMin] = useState<number | undefined>(filtro?.min)
  const [max, setMax] = useState<number | undefined>(filtro?.max)
  const [contiene, setContiene] = useState(filtro?.contiene ?? '')
  const [q, setQ] = useState('')
  const opciones = useMemo(() => { const m = new Map<string, number>(); for (const f of filas) { const t = texto(f, col.id); m.set(t, (m.get(t) || 0) + 1) } return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')) }, [filas, col.id])
  const nqv = norm(q.trim())
  const mostradas = nqv ? opciones.filter(([t]) => norm(t).includes(nqv)) : opciones
  const marcado = (t: string) => val === null || val.has(t)
  const todos = () => opciones.map(([t]) => t)
  const toggle = (t: string) => setVal((v) => { const s = new Set(v ?? todos()); if (s.has(t)) s.delete(t); else s.add(t); return s.size === opciones.length ? null : s })
  // «Seleccionar todo» y «Borrar» actúan sobre lo que se está mostrando (con buscador, solo eso), como en Sheets.
  const selTodo = () => setVal((v) => { if (!nqv) return null; const s = new Set(v ?? []); for (const [t] of mostradas) s.add(t); return s.size === opciones.length ? null : s })
  const borrar = () => setVal((v) => { if (!nqv) return new Set(); const s = new Set(v ?? todos()); for (const [t] of mostradas) s.delete(t); return s })
  const nMarcados = val === null ? opciones.length : val.size
  const aplicar = () => { const sin = val && opciones.length - val.size <= 2 ? todos().filter((t) => !val.has(t)) : undefined; onAplicar({ valores: val, sin, min, max, contiene: col.tipo === 'texto' ? contiene.trim() || undefined : undefined }) }
  const W = 300
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - W - 8))
  const top = anchor.bottom + 6 + 420 > window.innerHeight ? Math.max(8, window.innerHeight - 8 - 420) : anchor.bottom + 6
  const numOr = (s: string) => (s === '' ? undefined : Number(s))
  const fechaDesde = (s: string) => { const d = deIso(s); setMin(d ? ep(inicioDia(d)) : undefined) }
  const fechaHasta = (s: string) => { const d = deIso(s); setMax(d ? ep(sumar(inicioDia(d), 1)) - 1 : undefined) }
  return (
    <div className="popup fmenu" ref={ref} style={{ left, top, width: W }} role="dialog" aria-modal="true" aria-label={`Ordenar y filtrar ${col.label}`} onMouseDown={(e) => e.stopPropagation()}>
      <div className="fm-sec">
        <button type="button" className="fm-item" onClick={() => onOrden('asc')}>{col.tipo === 'texto' ? 'Ordenar de la A a la Z' : col.tipo === 'fecha' ? 'Ordenar del más antiguo al más reciente' : 'Ordenar de menor a mayor'}</button>
        <button type="button" className="fm-item" onClick={() => onOrden('desc')}>{col.tipo === 'texto' ? 'Ordenar de la Z a la A' : col.tipo === 'fecha' ? 'Ordenar del más reciente al más antiguo' : 'Ordenar de mayor a menor'}</button>
      </div>
      <div className="fm-sec">
        <div className="fm-h">Filtrar por condición</div>
        {col.tipo === 'texto' && <input className="inp" type="text" placeholder="El texto contiene…" aria-label={`${col.label} contiene`} value={contiene} onChange={(e) => setContiene(e.target.value)} />}
        {(col.tipo === 'monto' || col.tipo === 'numero') && <div className="fm-row"><input className="inp" type="number" inputMode="numeric" placeholder="Mínimo" aria-label={`${col.label}: mínimo`} value={min ?? ''} onChange={(e) => setMin(numOr(e.target.value))} /><span className="muted">a</span><input className="inp" type="number" inputMode="numeric" placeholder="Máximo" aria-label={`${col.label}: máximo`} value={max ?? ''} onChange={(e) => setMax(numOr(e.target.value))} /></div>}
        {col.tipo === 'fecha' && <div className="fm-row"><input className="inp" type="date" aria-label="Desde" value={iso(min)} onChange={(e) => fechaDesde(e.target.value)} /><span className="muted">a</span><input className="inp" type="date" aria-label="Hasta" value={iso(max)} onChange={(e) => fechaHasta(e.target.value)} /></div>}
      </div>
      <div className="fm-sec">
        <div className="fm-h">Filtrar por valores</div>
        <input className="inp" type="search" placeholder="Buscar valor…" aria-label={`Buscar valores de ${col.label}`} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="fm-links">
          <button type="button" className="nbtn" onClick={selTodo}>Seleccionar todo{nqv ? ` ${fmtN(mostradas.length)}` : ''}</button>
          <span className="muted" aria-hidden="true">·</span>
          <button type="button" className="nbtn" onClick={borrar}>Borrar</button>
          <span className="muted" style={{ marginLeft: 'auto' }}>{fmtN(nMarcados)} de {fmtN(opciones.length)}</span>
        </div>
        <div className="fm-list" role="group" aria-label={`Valores de ${col.label}`}>
          {mostradas.slice(0, 400).map(([t, n]) => <label key={t}><input type="checkbox" checked={marcado(t)} onChange={() => toggle(t)} /><span title={t}>{t}</span><span className="muted">{fmtN(n)}</span></label>)}
          {mostradas.length > 400 && <div className="small muted">…y {fmtN(mostradas.length - 400)} más: escribe para buscar.</div>}
          {!mostradas.length && <div className="small muted">Sin valores para «{q}».</div>}
        </div>
      </div>
      <div className="fm-foot">
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn on" onClick={aplicar}>Aceptar</button>
      </div>
    </div>
  )
}
