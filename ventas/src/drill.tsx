import { useEffect, useMemo, useRef, useState } from 'react'
import { CRM_LABEL } from './types'
import { ep, fechaDe, fmtCorta, fmtHora, fmtMoney, fmtN, inicioDia, sumar, type Fila } from './metrics'
import { useEscape, useFocoDialogo, useOutside } from './components'
import { EditarColumnas, type ColDef as ColTabla } from './columnas'
import { Compartir } from './widgets'
import { VACIA, useVistaGuardada, type Vista } from './vista'

// Ventana de detalle (drill-down): la lista de registros detrás de una cifra o barra, con
// búsqueda y el nombre como liga al registro en su CRM. Pedido de Randall 4-sep, calcado del
// drill-down de los reportes de HubSpot. Nada aquí escribe a ningún CRM.
// 6-sep (Randall): filtros «como HubSpot y Sheets»: cada columna tiene su menú (ordenar, filtrar
// por condición, filtrar por valores con buscador y conteos, Aceptar/Cancelar), los filtros
// activos se ven como chips, se puede agrupar por una columna y la lista va por páginas de 100.
// 13-sep (Randall): «tipo Excel»: pantalla completa, ancho de columna y alto de fila arrastrando
// (o con el teclado sobre el asa), mover columnas arrastrando el título (o con «Columnas»), y
// «Guardar vista» la deja en la cuenta; el administrador se la aplica a otras cuentas.
/** `verFila`: botón «Notas» por renglón que abre un detalle propio (las 14 notas de una llamada); `verLabel` es su texto.
 *  `clave`: nombre de la vista guardada (anchos, alto, orden); sin él la vista se llama por la forma de sus columnas. */
export interface Drill { titulo: string; sub?: string; filas: Fila[]; verFila?: (f: Fila) => void; verLabel?: string; pie?: string; alertaLabel?: string; clave?: string }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** La columna numérica: días y horas son enteros; la nota de una llamada (2,57 ⭐) no, y redondearla a 3 la miente. */
const fmtNum = (n: number) => (Number.isInteger(n) ? fmtN(n) : n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

type Col = 'estado' | 'nombre' | 'crm' | 'asesor' | 'ciudad' | 'embudo' | 'etapa' | 'detalle' | 'num' | 'monto' | 'cuando' | `x${number}`
/** 'x3' → 3: índice dentro de `Fila.extras`. */
const ix = (c: Col) => (c.startsWith('x') ? Number(c.slice(1)) : -1)
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
      : ix(c) >= 0 ? (f.extras?.[ix(c)]?.valor || '—')
      : c === 'num' ? (f.num == null ? '—' : fmtNum(f.num)) : c === 'monto' ? (f.monto ? fmtMoney(f.monto) : '—') : (f.cuando ? fmtCorta(fechaDe(f.cuando)) : '—')
const numero = (f: Fila, c: Col): number | undefined => (c === 'monto' ? f.monto : c === 'cuando' ? f.cuando : c === 'num' ? f.num : ix(c) >= 0 ? (f.extras?.[ix(c)]?.estrellas ?? undefined) : undefined)

/** Filtro de una columna: valores marcados (null = todos), rango para monto y fecha, «contiene» para texto. */
interface FiltroCol { valores: Set<string> | null; sin?: string[]; min?: number; max?: number; contiene?: string }   // `sin`: los pocos valores desmarcados, para que el chip diga «sin X» en vez de «21 valores»
type Filtros = Partial<Record<Col, FiltroCol>>
interface Orden { col: Col; dir: 'asc' | 'desc' }
const activo = (x?: FiltroCol) => !!x && (x.valores !== null || x.min != null || x.max != null || !!x.contiene)
/** Nota 1-5 como cinco estrellas (llenas en ámbar, vacías en gris); null = la etapa no aplicaba. */
function Estrellas({ n }: { n: number | null }) {
  if (n == null) return <span className="muted" aria-label="No aplicaba">–</span>
  return <span className="stars" role="img" aria-label={`${n} de 5 estrellas`} title={`${n} de 5`}>{'★'.repeat(n)}<span className="off" aria-hidden="true">{'★'.repeat(5 - n)}</span></span>
}
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
  const tipo = ix(o.col) >= 0 ? (filas.find((f) => f.extras)?.extras?.[ix(o.col)]?.estrellas !== undefined ? 'numero' : 'texto') : COLS.find((c) => c.id === o.col)!.tipo, s = o.dir === 'asc' ? 1 : -1
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

// ---- la vista «tipo Excel» (13-sep)
const CODIGO: Record<string, string> = { estado: 'e', nombre: 'n', crm: 'c', asesor: 'a', ciudad: 'i', embudo: 'b', etapa: 't', detalle: 'd', num: 'u', monto: 'm', cuando: 'w' }
/** Nombre de la vista: el que traiga la ventana o, si no, la forma de sus columnas (mismas columnas = misma vista). */
const claveDe = (d: Drill, cols: ColDef[]) => (d.clave
  ? d.clave.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9:_-]/g, '-').slice(0, 40)
  : cols.map((c) => CODIGO[c.id] ?? '').join('') + (cols.filter((c) => ix(c.id) >= 0).length || ''))
const DEF_ANCHO: Record<Tipo, number> = { texto: 140, numero: 90, monto: 110, fecha: 130 }
const anchoBase = (c: ColDef) => (c.id === 'nombre' ? 220 : c.id === 'detalle' ? 320 : DEF_ANCHO[c.tipo])
const ANCHO_MIN = 40, ANCHO_MAX = 1200, ALTO_MIN = 22, ALTO_MAX = 600
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(n)))
/** Cambios sin guardar de cada vista: sobreviven a cerrar la ventana mientras la página siga abierta. */
const borradores = new Map<string, Vista>()
/** Lo que hace distinta a una vista; sin `ts` ni el orden de las llaves, para saber si hay algo sin guardar. */
const firma = (v: Vista) => JSON.stringify([Object.entries(v.anchos).sort(), v.alto ?? null, v.orden ?? null, v.ocultas ?? null, !!v.expandido])
/** Arrastre con el puntero: `onMove` recibe el desplazamiento desde donde se pulsó. El asa captura el puntero. */
function arrastrar(e: React.PointerEvent<HTMLElement>, onMove: (dx: number, dy: number) => void, onEnd?: () => void) {
  const el = e.currentTarget, x0 = e.clientX, y0 = e.clientY
  el.setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => onMove(ev.clientX - x0, ev.clientY - y0)
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); onEnd?.() }
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
  e.preventDefault(); e.stopPropagation()
}
function IconoExpandir({ on }: { on: boolean }) {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {on ? <path d="M14 2L9 7M9 3v4h4M2 14l5-5M7 13V9H3" /> : <path d="M9 7l5-5M10 2h4v4M7 9l-5 5M6 14H2v-4" />}
  </svg>
}
const aTabla = (c: ColDef): ColTabla<Fila> => ({ id: c.id, label: c.label, ancho: 0, fija: c.id === 'nombre', celda: () => null })
/** Detalle de una llamada como veredicto (Randall 13-sep): titular con color y puntos; «Ver más» (21-sep) abre todos los puntos
 *  completos y el resumen en la misma celda (antes solo estaban en el tooltip y en «Notas»). */
function Veredicto({ v }: { v: NonNullable<Fila['veredicto']> }) {
  const [abierto, setAbierto] = useState(false)
  const hayMas = v.resumen.length > 0 || v.mejorarTodo.length > v.mejorar.length || v.mejorarTodo.some((m, i) => m !== v.mejorar[i])
  const puntos = abierto ? v.mejorarTodo : v.mejorar
  return (
    <div className={'vered' + (abierto ? ' abierto' : '')}>
      <b className={'vered-t ' + v.nivel}>{v.titulo}</b>
      <ul>
        {v.bien.length > 0 && <li className="ok"><span>Bien:</span> {v.bien.join(', ')}</li>}
        {puntos.map((m, i) => <li key={i} className="mejorar">{m}</li>)}
      </ul>
      {abierto && v.resumen && <p className="vered-res">{v.resumen}</p>}
      {hayMas && <button type="button" className="vered-mas" onClick={(e) => { e.stopPropagation(); setAbierto((a) => !a) }}>{abierto ? 'Ver menos' : 'Ver más…'}</button>}
    </div>
  )
}

export function DrillModal({ d, onClose }: { d: Drill; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [filtros, setFiltros] = useState<Filtros>({})
  const [orden, setOrden] = useState<Orden | null>(null)
  const [grupo, setGrupo] = useState<Col | null>(null)
  const [cerrados, setCerrados] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ col: Col; anchor: DOMRect } | null>(null)
  const [pagina, setPagina] = useState(0)
  const [porPagina, setPorPagina] = useState(100)
  const [editando, setEditando] = useState(false)
  const [compartir, setCompartir] = useState(false)
  const inp = useRef<HTMLInputElement>(null)
  // Escape cierra primero lo que esté encima (menú de columna, «Columnas», «Aplicar»); sin nada, la ventana.
  useEscape(() => (menu ? setMenu(null) : editando ? setEditando(false) : compartir ? setCompartir(false) : onClose()))
  // Foco al buscador al abrir; al cerrar, de vuelta a lo que se clickeó.
  useEffect(() => { const prev = document.activeElement as HTMLElement | null; inp.current?.focus(); return () => prev?.focus?.() }, [])
  useEffect(() => { setPagina(0) }, [q, filtros, orden, grupo, porPagina, d])
  useEffect(() => { setFiltros({}); setOrden(null); setGrupo(null); setCerrados(new Set()); setMenu(null) }, [d])

  // Cada ventana enseña solo sus columnas, y la numérica toma el nombre que traigan las filas
  // («Días sin cambio», «Horas al primer contacto»…) para poder ordenarla de mayor a menor de verdad.
  const cols = useMemo(() => {
    const etiqueta = d.filas.find((f) => f.numLabel)?.numLabel
    const base = COLS.filter((c) => { const p = OPCIONALES[c.id]; return !p || d.filas.some((f) => { const v = p(f); return v != null && v !== '' }) })
      .map((c) => (c.id === 'num' && etiqueta ? { ...c, label: etiqueta } : c))
    // Columnas propias de la ventana (Fila.extras), después de Etapa.
    const extras: ColDef[] = (d.filas.find((f) => f.extras)?.extras || []).map((e, i) => ({ id: `x${i}` as Col, label: e.label, tipo: (e.estrellas !== undefined ? 'numero' : 'texto') as Tipo }))
    const k = base.findIndex((c) => c.id === 'detalle')
    return k < 0 ? [...base, ...extras] : [...base.slice(0, k), ...extras, ...base.slice(k)]
  }, [d])

  // ---- la vista: anchos, alto de fila, orden de columnas y pantalla completa. Se cambia en memoria y
  // solo «Guardar vista» la deja en la cuenta (Randall 13-sep: «si lo deseo guardar esa vista»).
  const clave = useMemo(() => claveDe(d, cols), [d, cols])
  const [guardada, guardar] = useVistaGuardada(clave)
  const [vista, setVista] = useState<Vista>(() => borradores.get(clave) ?? guardada ?? VACIA)
  // Lo guardado (cuenta o navegador) manda mientras esta vista no tenga cambios sin guardar.
  useEffect(() => { if (!borradores.has(clave)) setVista(guardada ?? VACIA) }, [clave, guardada])
  const tocar = (fn: (v: Vista) => Vista) => setVista((v) => { const n = fn(v); borradores.set(clave, n); return n })
  const sucio = firma(vista) !== firma(guardada ?? VACIA)
  const guardarVista = () => guardar(vista)
  const restablecer = () => { borradores.delete(clave); guardar(null); setVista(VACIA) }
  // Columnas en el orden elegido; las ocultas se quitan (Registro nunca).
  const ordenadas = useMemo(() => {
    const por = new Map(cols.map((c) => [c.id, c])); const out: ColDef[] = []
    for (const id of vista.orden || []) { const c = por.get(id as Col); if (c && !out.includes(c)) out.push(c) }
    for (const c of cols) if (!out.includes(c)) out.push(c)
    return out
  }, [cols, vista.orden])
  const ocultas = useMemo(() => new Set(vista.ocultas || []), [vista.ocultas])
  const visibles = useMemo(() => ordenadas.filter((c) => c.id === 'nombre' || !ocultas.has(c.id)), [ordenadas, ocultas])
  const conAnchos = Object.keys(vista.anchos).length > 0
  const anchoDe = (c: ColDef) => vista.anchos[c.id] ?? anchoBase(c)
  const anchoTotal = visibles.reduce((s, c) => s + anchoDe(c), 0)
  const lineas = vista.alto ? Math.max(1, Math.floor((vista.alto - 8) / 16)) : 3
  /** Los anchos con los que se parte: los guardados o, la primera vez, los que miden hoy TODAS las columnas
   *  (si no, al fijar la tabla las demás saltaban a su ancho por defecto). */
  const congelados = (th: HTMLElement): Record<string, number> => {
    if (conAnchos) return vista.anchos
    const m: Record<string, number> = {}
    th.parentElement?.querySelectorAll<HTMLElement>('th[data-col]').forEach((t) => { m[t.dataset.col!] = Math.ceil(t.getBoundingClientRect().width) })
    return m
  }
  const iniciarAncho = (c: ColDef) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    const th = e.currentTarget.parentElement as HTMLElement, w0 = th.getBoundingClientRect().width, base = congelados(th)
    tocar((v) => ({ ...v, anchos: base }))
    th.classList.add('rs')
    arrastrar(e, (dx) => tocar((v) => ({ ...v, anchos: { ...v.anchos, [c.id]: clamp(w0 + dx, ANCHO_MIN, ANCHO_MAX) } })), () => th.classList.remove('rs'))
  }
  const teclasAncho = (c: ColDef) => (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const base = congelados(e.currentTarget.parentElement as HTMLElement), w = (base[c.id] ?? anchoBase(c)) + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 50 : 10)
      tocar((v) => ({ ...v, anchos: { ...base, [c.id]: clamp(w, ANCHO_MIN, ANCHO_MAX) } }))
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); quitarAncho(c.id) }
  }
  const quitarAncho = (id: Col) => tocar((v) => { const a = { ...v.anchos }; delete a[id]; return { ...v, anchos: a } })
  const iniciarAlto = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    const h0 = (e.currentTarget.closest('tr') as HTMLElement).getBoundingClientRect().height
    arrastrar(e, (_dx, dy) => tocar((v) => ({ ...v, alto: clamp(h0 + dy, ALTO_MIN, ALTO_MAX) })))
  }
  const teclasAlto = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const h0 = vista.alto ?? Math.round((e.currentTarget.closest('tr') as HTMLElement).getBoundingClientRect().height)
      tocar((v) => ({ ...v, alto: clamp(h0 + (e.key === 'ArrowDown' ? 1 : -1) * (e.shiftKey ? 20 : 4), ALTO_MIN, ALTO_MAX) }))
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); tocar((v) => ({ ...v, alto: undefined })) }
  }
  // Mover una columna arrastrando su título: pasados 6 px es arrastre (y el clic que sigue no ordena);
  // se suelta antes o después de la columna sobre la que está el puntero.
  const [mov, setMov] = useState<{ id: Col; sobre: Col; lado: 'antes' | 'despues' } | null>(null)
  const movRef = useRef(mov); movRef.current = mov
  const arrastrado = useRef(false)
  const reordenar = (id: Col, sobre: Col, lado: 'antes' | 'despues') => {
    const ids = ordenadas.map((c) => c.id).filter((x) => x !== id), k = ids.indexOf(sobre)
    if (k < 0) return
    ids.splice(lado === 'antes' ? k : k + 1, 0, id)
    tocar((v) => ({ ...v, orden: ids }))
  }
  const iniciarMover = (id: Col) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.crsz')) return
    const x0 = e.clientX; let on = false
    const move = (ev: PointerEvent) => {
      if (!on) { if (Math.abs(ev.clientX - x0) < 6) return; on = true }
      const th = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('th[data-col]')
      if (!th) return
      const r = th.getBoundingClientRect()
      setMov({ id, sobre: th.dataset.col as Col, lado: ev.clientX < r.left + r.width / 2 ? 'antes' : 'despues' })
    }
    const up = () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up)
      if (!on) return
      arrastrado.current = true; setTimeout(() => { arrastrado.current = false }, 0)
      const m = movRef.current
      if (m && m.sobre !== m.id) reordenar(m.id, m.sobre, m.lado)
      setMov(null)
    }
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up)
  }

  const nq = norm(q.trim())
  const buscadas = useMemo(() => (nq ? d.filas.filter((f) => norm([f.nombre, f.asesor, f.ciudad, f.embudo, f.etapa, f.detalle, f.estado, ...(f.extras || []).map((e) => e.valor)].filter(Boolean).join(' ')).includes(nq)) : d.filas), [d, nq])
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
  const chips = ordenadas.filter((c) => activo(filtros[c.id])).map((c) => ({ col: c, label: `${c.label}: ${resumen(c, filtros[c.id]!)}` }))
  const total = filtradas.reduce((s, f) => s + (f.monto || 0), 0)
  const alertas = filtradas.filter((f) => f.alerta).length
  const conEstado = cols.some((c) => c.id === 'estado')
  const crms = [...new Set(d.filas.map((f) => f.crm))]
  const sinLiga = d.filas.filter((f) => !f.link).length
  const cuando = (ts?: number) => (ts ? `${fmtCorta(fechaDe(ts))} ${fmtHora(ts)}` : '—')
  const toggleOrden = (c: Col) => { if (arrastrado.current) return; setOrden((o) => (o?.col === c ? (o.dir === 'asc' ? { col: c, dir: 'desc' } : null) : { col: c, dir: 'asc' })) }
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
  const visiblesPag = grupo ? filtradas : filtradas.slice(pag * porPagina, (pag + 1) * porPagina)
  const nCols = visibles.length

  /** Una celda por columna, en el orden de la vista. La primera lleva el asa del alto de fila. */
  const celda = (f: Fila, c: ColDef, primera: boolean, foco: boolean) => {
    const id = c.id, e = ix(id) >= 0 ? f.extras?.[ix(id)] : undefined
    const cont = id === 'estado' ? <span className={'tag' + (f.alerta ? ' alerta' : '')}>{f.estado || '—'}</span>
      : id === 'nombre' ? <>{f.link ? <a href={f.link} target="_blank" rel="noreferrer" title={d.verFila ? 'Abrir el audio' : 'Abrir en ' + CRM_LABEL[f.crm]}>{f.nombre}</a> : <span className="muted">{f.nombre}</span>}
        {d.verFila && <> <button type="button" className="nbtn small" aria-haspopup="dialog" aria-label={`${d.verLabel || 'Ver detalle'}: ${f.nombre}`} onClick={() => d.verFila!(f)}>{d.verLabel || 'Ver detalle'}</button></>}</>
      : id === 'crm' ? <span className="tag">{CRM_LABEL[f.crm]}</span>
      : id === 'asesor' ? f.asesor
      : id === 'ciudad' ? (f.ciudad || <span className="muted">Sin ciudad</span>)
      : id === 'embudo' ? (f.embudo || '—') : id === 'etapa' ? (f.etapa || '—')
      : id === 'detalle' ? (f.veredicto ? <Veredicto v={f.veredicto} /> : (f.detalle || '—'))
      : id === 'num' ? (f.num == null ? '—' : fmtNum(f.num))
      : id === 'monto' ? (f.monto ? fmtMoney(f.monto) : '—')
      : id === 'cuando' ? cuando(f.cuando)
      : e?.estrellas !== undefined ? <Estrellas n={e.estrellas} /> : (e?.valor || '—')
    const cls = [id === 'detalle' ? 'det' : id === 'num' || id === 'monto' ? 'num' : id === 'cuando' ? 'muted' : e?.estrellas !== undefined ? 'cstars' : '', primera ? 'c0' : ''].filter(Boolean).join(' ') || undefined
    return (
      <td key={id} className={cls} title={id === 'detalle' ? (f.veredicto?.resumen || f.detalle || undefined) : undefined}>
        <div className="cc">{cont}</div>
        {primera && <span className="rrsz" role="separator" aria-orientation="horizontal" tabIndex={foco ? 0 : -1} aria-hidden={foco ? undefined : true} aria-label="Alto de las filas"
          aria-valuenow={vista.alto} aria-valuetext={vista.alto ? `${vista.alto} píxeles` : 'automático'} title="Arrastra para cambiar el alto de todas las filas (↑ ↓ con el teclado); doble clic o Supr = automático"
          onPointerDown={iniciarAlto} onKeyDown={teclasAlto} onDoubleClick={() => tocar((v) => ({ ...v, alto: undefined }))} />}
      </td>
    )
  }
  let primeraFila = true
  const fila = (f: Fila) => { const foco = primeraFila; primeraFila = false; return <tr key={f.id}>{visibles.map((c, i) => celda(f, c, i === 0, foco))}</tr> }
  const estiloTabla = { ...(conAnchos ? { width: anchoTotal, minWidth: anchoTotal } : {}), ...(vista.alto ? { '--alto-fila': vista.alto + 'px', '--lineas': lineas } : {}) } as React.CSSProperties
  const claseTh = (c: ColDef) => [c.tipo === 'monto' || c.tipo === 'numero' ? 'num' : '', mov?.id === c.id ? 'mov-src' : '', mov && mov.sobre === c.id && mov.id !== c.id ? 'mov-' + mov.lado : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className={'modal-bg' + (vista.expandido ? ' full' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={d.titulo}>
        <div className="mh">
          <div className="mt">
            <h2>{d.titulo}</h2>
            <div className="small muted" aria-live="polite">
              {fmtN(filtradas.length)}{filtradas.length !== d.filas.length ? ` de ${fmtN(d.filas.length)}` : ''} registro{filtradas.length === 1 ? '' : 's'}{total ? ` · ${fmtMoney(total)}` : ''}{conEstado ? ` · ${fmtN(alertas)} ${d.alertaLabel || 'sin pareja'}` : ''}{crms.length ? ' · ' + crms.map((c) => CRM_LABEL[c]).join(' + ') : ''}{d.sub ? ' · ' + d.sub : ''}
            </div>
          </div>
          <input ref={inp} className="sel" type="search" placeholder="Buscar nombre, asesor, ciudad o etapa…" aria-label="Buscar en el detalle" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="ib ico" aria-pressed={!!vista.expandido} aria-label={vista.expandido ? 'Salir de pantalla completa' : 'Ver en pantalla completa'} title={vista.expandido ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}
            onClick={() => tocar((v) => ({ ...v, expandido: !v.expandido }))}><IconoExpandir on={!!vista.expandido} /></button>
          <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        {/* Herramientas como en HubSpot: agrupar, chips de filtros activos, borrar todo; a la derecha, la vista. */}
        <div className="mtools">
          <label className="small muted">Agrupar por <select className="sel sm" aria-label="Agrupar por" value={grupo ?? ''} onChange={(e) => { setGrupo((e.target.value || null) as Col | null); setCerrados(new Set()) }}>
            <option value="">Sin agrupar</option>
            {ordenadas.filter((c) => c.tipo === 'texto' && c.id !== 'nombre').map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select></label>
          {chips.length > 0 && <span className="small muted">Filtros ({chips.length})</span>}
          {chips.map((ch) => <button type="button" key={ch.col.id} className="chip" title={`Quitar el filtro de ${ch.col.label}`} onClick={() => quitarFiltro(ch.col.id)}>{ch.label} <b aria-hidden="true">×</b></button>)}
          {orden && <button type="button" className="chip" title="Quitar el orden" onClick={() => setOrden(null)}>Orden: {cols.find((c) => c.id === orden.col)?.label} {orden.dir === 'asc' ? '↑' : '↓'} <b aria-hidden="true">×</b></button>}
          {(chips.length > 0 || orden || nq) && <button type="button" className="nbtn small" onClick={limpiar}>Borrar todo</button>}
          <span className="mvista">
            <span className="small muted">▾ en cada columna: ordenar y filtrar</span>
            <button type="button" className="btn sm" aria-haspopup="dialog" title="Elegir qué columnas se ven y en qué orden" onClick={() => setEditando(true)}>Columnas</button>
            {sucio ? <button type="button" className="btn sm on" title="Recordar en tu cuenta el ancho de las columnas, el alto de las filas, su orden y la pantalla completa" onClick={guardarVista}>Guardar vista</button>
              : guardada ? <span className="small muted" role="status">Vista guardada</span> : null}
            {(sucio || guardada) && <button type="button" className="btn sm ghost" title="Volver a la vista de fábrica y olvidar la guardada" onClick={restablecer}>Restablecer</button>}
            {(sucio || guardada) && <button type="button" className="btn sm" aria-haspopup="dialog" title="Dejarle esta misma vista a otras cuentas (solo administradores)" onClick={() => { if (sucio) guardarVista(); setCompartir(true) }}>Aplicar a otras cuentas</button>}
          </span>
        </div>
        <div className="mb">
          {!filtradas.length && <div className="muted" style={{ padding: 16 }}>Nada que mostrar{nq ? ` para «${q}»` : ''}{chips.length ? ' con estos filtros' : ''}.</div>}
          {filtradas.length > 0 && (
            <table className={'ftable dtable' + (conAnchos ? ' anchos' : '') + (vista.alto ? ' alto' : '') + (mov ? ' moviendo' : '')} style={estiloTabla}>
              {conAnchos && <colgroup>{visibles.map((c) => <col key={c.id} style={{ width: anchoDe(c) }} />)}</colgroup>}
              <thead><tr>
                {visibles.map((c) => (
                  <th scope="col" key={c.id} data-col={c.id} className={claseTh(c)} aria-sort={orden?.col === c.id ? (orden.dir === 'asc' ? 'ascending' : 'descending') : undefined} onPointerDown={iniciarMover(c.id)}>
                    <span className="hcol">
                      <button type="button" className="hsort" aria-label={`Ordenar por ${c.label}`} title="Clic ordena; arrastra el título para mover la columna" onClick={() => toggleOrden(c.id)}>{c.label}<span aria-hidden="true">{orden?.col === c.id ? (orden.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span></button>
                      <button type="button" className={'fbtn' + (activo(filtros[c.id]) ? ' on' : '')} aria-label={`Ordenar y filtrar ${c.label}`} aria-haspopup="dialog" aria-expanded={menu?.col === c.id}
                        onClick={(e) => { if (arrastrado.current) return; setMenu(menu?.col === c.id ? null : { col: c.id, anchor: e.currentTarget.getBoundingClientRect() }) }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5z" fill="currentColor" /></svg>
                      </button>
                    </span>
                    <span className="crsz" role="separator" aria-orientation="vertical" tabIndex={0} aria-label={`Ancho de la columna ${c.label}`}
                      aria-valuenow={vista.anchos[c.id]} aria-valuetext={vista.anchos[c.id] ? `${vista.anchos[c.id]} píxeles` : 'automático'} title="Arrastra para cambiar el ancho (← → con el teclado); doble clic o Supr = ancho por defecto"
                      onPointerDown={iniciarAncho(c)} onKeyDown={teclasAncho(c)} onDoubleClick={() => quitarAncho(c.id)} />
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {grupos ? grupos.slice(0, 400).map((g) => (
                  <GrupoFilas key={g.clave} clave={g.clave} n={g.filas.length} monto={g.monto} nCols={nCols} cerrado={cerrados.has(g.clave)}
                    onToggle={() => setCerrados((s) => { const n = new Set(s); if (n.has(g.clave)) n.delete(g.clave); else n.add(g.clave); return n })}>
                    {g.filas.slice(0, TOPE_GRUPOS).map(fila)}
                  </GrupoFilas>
                )) : visiblesPag.map(fila)}
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
          {d.pie ?? <>Clic en el nombre abre el registro en su CRM en otra pestaña.{sinLiga > 0 ? ` ${fmtN(sinLiga)} registro${sinLiga === 1 ? '' : 's'} sin liga: HubSpot no liga tareas ni llamadas al deal.` : ''}</>} Arrastra el título de una columna para moverla, su borde derecho para el ancho y el borde inferior de una fila para el alto; «Guardar vista» lo recuerda en tu cuenta. Esc o clic afuera cierra.
        </div>
        {menu && <MenuCol col={cols.find((c) => c.id === menu.col)!} filas={filasPara(menu.col)} filtro={filtros[menu.col]} anchor={menu.anchor}
          onOrden={(dir) => { setOrden({ col: menu.col, dir }); setMenu(null) }}
          onAplicar={(x) => { setFiltros((f) => (activo(x) ? { ...f, [menu.col]: x } : (() => { const n = { ...f }; delete n[menu.col]; return n })())); setMenu(null) }}
          onClose={() => setMenu(null)} />}
        {editando && <EditarColumnas todas={cols.map(aTabla)} ordenadas={ordenadas.map(aTabla)} ocultas={ocultas} nota="Elige qué columnas ves en este reporte y en qué orden. Con «Guardar vista» se queda en tu cuenta."
          onFijar={(e) => tocar((v) => ({ ...v, orden: e.orden, ocultas: e.ocultas }))} onRestablecer={() => tocar((v) => ({ ...v, orden: undefined, ocultas: undefined }))} onClose={() => setEditando(false)} />}
        {compartir && <Compartir clave={'vista-' + clave} nombre={d.titulo.split(' · ')[0]} datos={{ ['vista-' + clave]: vista }} onClose={() => setCompartir(false)} />}
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
