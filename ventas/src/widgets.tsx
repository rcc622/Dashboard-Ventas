import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { Info } from './components'
import type { Termino } from './glosario'

// Rejilla LIBRE de widgets (Randall 6-sep: «colocar libremente las gráficas en el lugar que yo
// quiera, con un sistema de grids», como los editores de tablero de Kommo y HubSpot). Seis
// columnas por filas de 40 px; cada widget tiene posición (x, y) y tamaño (w, h) en celdas. El asa ⋮⋮
// se arrastra a cualquier celda (o ← → ↑ ↓ por teclado, Home/End a los bordes) y la esquina inferior
// derecha estira ancho y alto (o ← → ↑ ↓ sobre el asa; Supr regresa el tamaño por defecto). Nada se
// encima: lo que choca se empuja hacia abajo, y los huecos se respetan (no hay gravedad): el tablero
// queda exactamente donde lo dejaste. Todo alto es fijo y el contenido se desplaza adentro; el embudo
// y la dispersión crecen con la tarjeta. × quita un widget y «Agregar gráfica» lo regresa al primer
// hueco libre; «Agregar separador» mete una banda de título de ancho completo (id `sep:<n>`).
// En pantallas de menos de 1000 px se ignoran las posiciones y los widgets se apilan en orden de
// lectura (fila, columna) con alto automático. Posición, tamaño, quitados y separadores viven en
// localStorage por clave (admin / midia-<uid> / ficha): son preferencia de quien mira, no dato.
/** `span`/`alto`: tamaño por defecto en columnas y filas. `desde`: id del widget que agrupaba a este
 *  antes (p. ej. las cifras que vivían juntas en «cifras»); sirve para migrar un orden viejo. */
export interface Widget { id: string; titulo: string; nodo: ReactNode; span?: number; alto?: number; plain?: boolean; info?: Termino[]; cls?: string; desde?: string }
export interface Pos { x: number; y: number; w: number; h: number }
interface Layout { v: 2; pos: Record<string, Pos>; ocultos: string[]; seps: Record<string, string> }
interface LayoutV1 { orden: string[]; spans?: Record<string, number>; altos?: Record<string, number>; ocultos?: string[]; seps?: Record<string, string> }
const esSep = (id: string) => id.startsWith('sep:')

export const COLS = 6
const GAP = 14
export const FILA = 40           // alto de una fila en px
const MIN_FILAS = 2, MAX_FILAS = 40, SEP_H = 1
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(n)))
const choca = (a: Pos, b: Pos) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const anchoDe = (w?: Widget) => clamp(w?.span ?? 3, 1, COLS)
/** Alto por defecto: cifras 3 filas, tarjetas 5, el resto 9 (≈ 470 px). */
const altoDe = (w?: Widget) => clamp(w?.alto ?? (w?.cls?.includes('wtile') ? 3 : w?.cls?.includes('wcard') ? 5 : 9), MIN_FILAS, MAX_FILAS)
/** Primer hueco libre leyendo de izquierda a derecha y de arriba abajo. */
function colocar(pos: Record<string, Pos>, w: number, h: number, desdeY = 1): Pos {
  const otros = Object.values(pos)
  for (let y = desdeY; y < 5000; y++) for (let x = 1; x <= COLS - w + 1; x++) {
    const p = { x, y, w, h }
    if (!otros.some((o) => choca(p, o))) return p
  }
  return { x: 1, y: 5000, w, h }
}
const fondo = (pos: Record<string, Pos>) => Object.values(pos).reduce((m, p) => Math.max(m, p.y + p.h), 1)
/** Empuja hacia abajo lo que choque con `id` (y lo que choque con lo empujado); `id` no se mueve. */
function acomodar(pos: Record<string, Pos>, id: string): Record<string, Pos> {
  const out = { ...pos }
  const cola = [id]
  while (cola.length) {
    const c = cola.shift()!
    for (const k of Object.keys(out).sort((a, b) => out[a].y - out[b].y)) {
      if (k === c || k === id) continue
      if (choca(out[c], out[k])) { out[k] = { ...out[k], y: out[c].y + out[c].h }; cola.push(k) }
    }
  }
  return out
}

const KEY = (clave: string) => 'kv_orden_' + clave
const guardar = (clave: string, l: Layout) => { try { localStorage.setItem(KEY(clave), JSON.stringify(l)) } catch { /* modo privado */ } }
/** Orden guardado del formato viejo + los widgets nuevos al final; un widget con `desde` entra en el lugar del id viejo. */
const ordenar = (widgets: Widget[], guardado: string[], seps: Record<string, string>) => {
  const ids = widgets.map((w) => w.id)
  const o: string[] = []
  for (const id of guardado) {
    if (ids.includes(id) || (esSep(id) && id in seps)) { if (!o.includes(id)) o.push(id); continue }
    for (const w of widgets) if (w.desde === id && !guardado.includes(w.id) && !o.includes(w.id)) o.push(w.id)
  }
  for (const id of ids) if (!o.includes(id)) o.push(id)
  return o
}
/** Lo guardado (v2, v1 o la lista de antes) convertido a v2 y saneado contra los widgets de hoy. */
function inicial(clave: string, widgets: Widget[]): Layout {
  let v: unknown = null
  try { v = JSON.parse(localStorage.getItem(KEY(clave)) || 'null') } catch { /* nada guardado */ }
  const por = new Map(widgets.map((w) => [w.id, w]))
  if (v && typeof v === 'object' && (v as Layout).v === 2 && (v as Layout).pos) {
    const l = v as Layout
    return sanear({ v: 2, pos: { ...l.pos }, ocultos: [...(l.ocultos || [])], seps: { ...(l.seps || {}) } }, widgets)
  }
  // Formato anterior (orden + anchos + altos): se coloca igual que fluía la rejilla de antes.
  const v1: LayoutV1 = Array.isArray(v) ? { orden: v as string[] } : (v && typeof v === 'object' && Array.isArray((v as LayoutV1).orden)) ? (v as LayoutV1) : { orden: [] }
  const seps = v1.seps || {}, ocultos = (v1.ocultos || []).filter((id) => por.has(id))
  const pos: Record<string, Pos> = {}
  for (const id of ordenar(widgets, v1.orden, seps)) {
    if (ocultos.includes(id)) continue
    const w = por.get(id)
    pos[id] = esSep(id) ? colocar(pos, COLS, SEP_H) : colocar(pos, clamp(v1.spans?.[id] ?? anchoDe(w), 1, COLS), clamp(v1.altos?.[id] ?? altoDe(w), MIN_FILAS, MAX_FILAS))
  }
  return { v: 2, pos, ocultos, seps }
}
/** Quita posiciones de widgets que ya no existen y coloca los nuevos en el primer hueco. */
function sanear(l: Layout, widgets: Widget[]): Layout {
  const por = new Map(widgets.map((w) => [w.id, w]))
  const pos: Record<string, Pos> = {}
  for (const [id, p] of Object.entries(l.pos)) if (por.has(id) || (esSep(id) && id in l.seps)) pos[id] = { x: clamp(p.x, 1, COLS), y: clamp(p.y, 1, 5000), w: clamp(p.w, 1, COLS), h: clamp(p.h, esSep(id) ? SEP_H : MIN_FILAS, MAX_FILAS) }
  const ocultos = l.ocultos.filter((id) => por.has(id))
  // Un widget nuevo que nace de otro (`desde`) y cabe a su derecha parte al viejo en dos en vez de caer
  // al primer hueco (Perfiles → matriz + tabla, 6-sep); si no cabe, va al primer hueco como los demás.
  for (const w of widgets) { const o = w.desde ? pos[w.desde] : undefined; if (o && !(w.id in pos) && !ocultos.includes(w.id) && o.w >= 2 * anchoDe(w)) { o.w -= anchoDe(w); pos[w.id] = { x: o.x + o.w, y: o.y, w: anchoDe(w), h: o.h } } }
  for (const w of widgets) if (!(w.id in pos) && !ocultos.includes(w.id)) pos[w.id] = colocar(pos, anchoDe(w), altoDe(w))
  return { v: 2, pos, ocultos, seps: l.seps }
}
function useLibre() {
  const q = '(min-width: 1000px)'
  const [ok, setOk] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches)
  useEffect(() => { const m = matchMedia(q); const f = () => setOk(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return ok
}

interface Arrastre { id: string; ghost: Pos; dx: number; dy: number }
interface Estiro { id: string; ghost: Pos }

export function WidgetGrid({ clave, widgets }: { clave: string; widgets: Widget[] }) {
  const ids = widgets.map((w) => w.id)
  const por = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets])
  const [layout, setLayout] = useState<Layout>(() => inicial(clave, widgets))
  const [tocado, setTocado] = useState(() => { try { return localStorage.getItem(KEY(clave)) != null } catch { return false } })
  const [drag, setDrag] = useState<Arrastre | null>(null)
  const [estiro, setEstiro] = useState<Estiro | null>(null)
  const [msg, setMsg] = useState('')
  const libre = useLibre()
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const grid = useRef<HTMLDivElement>(null)
  const actual = useRef(layout); actual.current = layout
  useEffect(() => { setLayout((l) => { const s = sanear(l, widgets); return JSON.stringify(s) === JSON.stringify(l) ? l : s }) }, [ids.join()])   // eslint-disable-line react-hooks/exhaustive-deps

  const fijar = (l: Layout, aviso = '') => { setLayout(l); guardar(clave, l); setTocado(true); if (aviso) setMsg(aviso) }
  const tituloDe = (id: string) => (esSep(id) ? `Separador ${layout.seps[id] || ''}`.trim() : por.get(id)?.titulo || id)
  const celda = () => { const g = grid.current; return { colW: g ? (g.clientWidth - GAP * (COLS - 1)) / COLS : 150, filaH: FILA } }
  const moverA = (id: string, x: number, y: number) => {
    const p = actual.current.pos[id]
    if (!p) return
    const np = { ...p, x: clamp(x, 1, COLS - p.w + 1), y: clamp(y, 1, 5000) }
    if (np.x === p.x && np.y === p.y) return
    fijar({ ...actual.current, pos: acomodar({ ...actual.current.pos, [id]: np }, id) }, `${tituloDe(id)}: columna ${np.x}, fila ${np.y}`)
  }
  const dimensionar = (id: string, w: number, h: number) => {
    const p = actual.current.pos[id]
    if (!p) return
    const np = { ...p, w: clamp(w, 1, COLS - p.x + 1), h: clamp(h, esSep(id) ? SEP_H : MIN_FILAS, MAX_FILAS) }
    if (np.w === p.w && np.h === p.h) return
    fijar({ ...actual.current, pos: acomodar({ ...actual.current.pos, [id]: np }, id) }, `${tituloDe(id)}: ${np.w} de ${COLS} columnas por ${np.h} filas`)
  }
  const quitar = (id: string) => { const pos = { ...layout.pos }; delete pos[id]; fijar({ ...layout, pos, ocultos: [...layout.ocultos.filter((x) => x !== id), id] }, `${tituloDe(id)} quitado del tablero`) }
  const poner = (id: string) => { const w = por.get(id); fijar({ ...layout, pos: { ...layout.pos, [id]: colocar(layout.pos, anchoDe(w), altoDe(w)) }, ocultos: layout.ocultos.filter((x) => x !== id) }, `${tituloDe(id)} de vuelta en el tablero`) }
  const agregarSep = () => {
    const id = 'sep:' + Date.now().toString(36)
    fijar({ ...layout, pos: { ...layout.pos, [id]: { x: 1, y: fondo(layout.pos), w: COLS, h: SEP_H } }, seps: { ...layout.seps, [id]: 'Nueva sección' } })
    requestAnimationFrame(() => { const inp = refs.current[id]?.querySelector('input'); inp?.focus(); inp?.select() })   // listo para escribir el título
  }
  const titularSep = (id: string, t: string) => fijar({ ...layout, seps: { ...layout.seps, [id]: t } })
  const borrarSep = (id: string) => { const seps = { ...layout.seps }, pos = { ...layout.pos }; delete seps[id]; delete pos[id]; fijar({ ...layout, pos, seps }) }
  const restablecer = () => { try { localStorage.removeItem(KEY(clave)) } catch { /* nada */ } setLayout(inicial(clave, widgets)); setTocado(false); setMsg('Tablero restablecido') }
  const quitados = layout.ocultos.filter((id) => por.has(id))
  const visibles = Object.keys(layout.pos).filter((id) => (esSep(id) ? id in layout.seps : por.has(id))).sort((a, b) => layout.pos[a].y - layout.pos[b].y || layout.pos[a].x - layout.pos[b].x)

  /** Arrastrar el asa ⋮⋮: el widget sigue al puntero y un fantasma marca la celda donde caerá. */
  const onGrip = (id: string) => (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !libre || !grid.current) return
    e.preventDefault()
    const p0 = actual.current.pos[id]
    if (!p0) return
    const { colW, filaH } = celda(), x0 = e.clientX, y0 = e.clientY
    let ghost = p0, movio = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0
      if (!movio && Math.hypot(dx, dy) < 4) return
      movio = true
      ghost = { ...p0, x: clamp(p0.x + dx / (colW + GAP), 1, COLS - p0.w + 1), y: clamp(p0.y + dy / (filaH + GAP), 1, 5000) }
      setDrag({ id, ghost, dx, dy })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      setDrag(null)
      if (movio) moverA(id, ghost.x, ghost.y)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }
  const onGripKey = (id: string) => (e: KeyboardEvent<HTMLElement>) => {
    const p = layout.pos[id]
    if (!p) return
    const k = e.key
    if (k === 'ArrowRight') moverA(id, p.x + 1, p.y)
    else if (k === 'ArrowLeft') moverA(id, p.x - 1, p.y)
    else if (k === 'ArrowDown') moverA(id, p.x, p.y + 1)
    else if (k === 'ArrowUp') moverA(id, p.x, p.y - 1)
    else if (k === 'Home') moverA(id, 1, p.y)
    else if (k === 'End') moverA(id, COLS - p.w + 1, p.y)
    else return
    e.preventDefault()
  }
  /** Estirar con el mouse o el dedo: ancho por columnas y alto por filas, en vivo. */
  const onResizeStart = (id: string) => (e: RPointerEvent<HTMLSpanElement>) => {
    if (!libre) return
    e.preventDefault()
    const el = refs.current[id], p0 = actual.current.pos[id]
    if (!el || !p0) return
    const { colW, filaH } = celda(), r0 = el.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY
    let ghost = p0
    setEstiro({ id, ghost })
    const move = (ev: PointerEvent) => {
      const w = clamp((r0.width + (ev.clientX - x0) + GAP) / (colW + GAP), 1, COLS - p0.x + 1)
      const h = clamp((r0.height + (ev.clientY - y0) + GAP) / (filaH + GAP), esSep(id) ? SEP_H : MIN_FILAS, MAX_FILAS)
      if (w === ghost.w && h === ghost.h) return
      ghost = { ...p0, w, h }
      setEstiro({ id, ghost })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      setEstiro(null)
      dimensionar(id, ghost.w, ghost.h)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }
  const onResizeKey = (id: string) => (e: KeyboardEvent<HTMLSpanElement>) => {
    const p = layout.pos[id]
    if (!p) return
    const k = e.key
    if (k === 'ArrowRight') dimensionar(id, p.w + 1, p.h)
    else if (k === 'ArrowLeft') dimensionar(id, p.w - 1, p.h)
    else if (k === 'Home') dimensionar(id, 1, p.h)
    else if (k === 'End') dimensionar(id, COLS - p.x + 1, p.h)
    else if (k === 'ArrowDown') dimensionar(id, p.w, p.h + 1)
    else if (k === 'ArrowUp') dimensionar(id, p.w, p.h - 1)
    else if (k === 'Delete' || k === 'Backspace') dimensionar(id, anchoDe(por.get(id)), altoDe(por.get(id)))
    else return
    e.preventDefault()
  }
  const editando = !!(drag || estiro)
  const ghost = drag?.ghost || estiro?.ghost
  const area = (p: Pos) => ({ gridColumn: `${p.x} / span ${p.w}`, gridRow: `${p.y} / span ${p.h}` })

  return (
    <>
      <div className="wbar">
        <label className="wadd">Agregar gráfica:{' '}
          <select value="" aria-label="Agregar gráfica quitada al tablero" disabled={!quitados.length} onChange={(e) => { if (e.target.value) poner(e.target.value) }}>
            <option value="">{quitados.length ? 'elegir…' : 'todas están en el tablero'}</option>
            {quitados.map((id) => <option key={id} value={id}>{por.get(id)!.titulo}</option>)}
          </select>
        </label>
        <button type="button" className="nbtn wsep-add" onClick={agregarSep}>Agregar separador</button>
        {tocado && <button type="button" className="nbtn wreset-btn" onClick={restablecer}>Restablecer tablero</button>}
        <span className="sr-solo" role="status" aria-live="polite">{msg}</span>
      </div>
      <div className={'wgrid' + (libre ? ' libre' : '') + (editando ? ' editing' : '')} ref={grid} style={libre ? { gridAutoRows: FILA + 'px' } : undefined}>
        {ghost && libre && <div className="wghost" aria-hidden="true" style={area(ghost)} />}
        {visibles.map((id) => {
          const p = estiro?.id === id ? estiro.ghost : layout.pos[id]
          const arrastrando = drag?.id === id
          const estilo = libre ? { ...area(p), transform: arrastrando ? `translate(${drag!.dx}px, ${drag!.dy}px)` : undefined } : undefined
          if (esSep(id)) return (
            <section key={id} ref={(el) => { refs.current[id] = el }} aria-label={`Separador: ${layout.seps[id]}`} style={estilo}
              className={'widget sep' + (arrastrando ? ' dragging' : '')}>
              <div className="whead">
                <button type="button" className="grip" title="Arrastra para mover (o usa las flechas)" aria-label={`Mover el separador «${layout.seps[id]}»: flechas mueven una celda, Home y End a los bordes`} onPointerDown={onGrip(id)} onKeyDown={onGripKey(id)}>⋮⋮</button>
                <input className="sep-in" value={layout.seps[id]} aria-label="Título del separador" placeholder="Título de la sección" onChange={(e) => titularSep(id, e.target.value)} />
                <span className="wctl">
                  <button type="button" className="wbtn" aria-label="Borrar separador" title="Borrar separador" onClick={() => borrarSep(id)}>×</button>
                </span>
              </div>
            </section>
          )
          const w = por.get(id)!
          return (
            <section key={id} ref={(el) => { refs.current[id] = el }} aria-label={w.titulo} style={estilo}
              className={'widget' + (w.plain ? ' plain' : ' panel') + (w.cls ? ' ' + w.cls : '') + (libre ? ' hset' : '') + (arrastrando ? ' dragging' : '') + (estiro?.id === id ? ' resizing' : '')}>
              <div className="whead">
                <button type="button" className="grip" title="Arrastra para mover (o usa las flechas)" aria-label={`Mover «${w.titulo}»: flechas mueven una celda, Home y End a los bordes. Ahora en columna ${p.x}, fila ${p.y}`} onPointerDown={onGrip(id)} onKeyDown={onGripKey(id)}>⋮⋮</button>
                <h3><span className="wt">{w.titulo}</span>{w.info?.length ? <Info termino={w.info} /> : null}</h3>
                <span className="wctl">
                  <button type="button" className="wbtn" aria-label={`Quitar «${w.titulo}» del tablero`} title="Quitar del tablero" onClick={() => quitar(id)}>×</button>
                </span>
              </div>
              <div className="wbody">{w.nodo}</div>
              <span className="wresize" role="slider" tabIndex={0} aria-label={`Tamaño de «${w.titulo}»`} aria-valuemin={1} aria-valuemax={COLS} aria-valuenow={p.w}
                aria-valuetext={`${p.w} de ${COLS} columnas por ${p.h} filas`}
                title="Arrastra para cambiar ancho y alto (o usa ← → ↑ ↓; Supr regresa el tamaño por defecto)"
                data-ancho={`${p.w} / ${COLS} · ${p.h} filas`} onPointerDown={onResizeStart(id)} onKeyDown={onResizeKey(id)} />
            </section>
          )
        })}
      </div>
      <div className="wreset">Arrastra el asa ⋮⋮ a la celda que quieras (o enfócala y usa ← → ↑ ↓); estira la esquina inferior derecha para cambiar ancho y alto (← → ↑ ↓ sobre ella; Supr regresa el tamaño por defecto). Nada se encima: lo que choca se empuja hacia abajo. × quita la gráfica del tablero y arriba, en «Agregar gráfica», la regresas. Se guarda en este navegador.</div>
    </>
  )
}
