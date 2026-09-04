import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { Info } from './components'
import type { Termino } from './glosario'

// Rejilla de widgets reordenable y redimensionable (pedidos de Randall 4-sep, calcados de los
// tableros de HubSpot): 6 columnas; cada gráfica es un widget con asa ⋮⋮ que se arrastra (o ▲▼
// por teclado) y un asa en la esquina inferior derecha que estira el ANCHO por cuadrantes
// (2 a 6 columnas) y el ALTO por filas de 40 px (el alto por defecto es el del contenido; al
// fijarlo, el contenido se desplaza adentro y el embudo y la dispersión crecen con la tarjeta).
// Cada widget se puede quitar del tablero (×) y volver a poner desde «Agregar gráfica», que lista
// las quitadas: ese es el inventario. Orden, anchos, altos y quitados viven en localStorage por
// clave (admin / midia-<uid>): son preferencia de quien mira, no dato del CRM.
export interface Widget { id: string; titulo: string; nodo: ReactNode; span?: number; plain?: boolean; info?: Termino[]; cls?: string }
interface Layout { orden: string[]; spans: Record<string, number>; altos: Record<string, number>; ocultos: string[] }

export const COLS = 6
const MIN = 2
const GAP = 14
export const FILA = 40           // unidad de alto en px
const MIN_FILAS = 4, MAX_FILAS = 30
const clampSpan = (n: number) => Math.max(MIN, Math.min(COLS, Math.round(n)))
const clampFilas = (n: number) => Math.max(MIN_FILAS, Math.min(MAX_FILAS, Math.round(n)))

const leerLayout = (clave: string): Layout => {
  try {
    const v = JSON.parse(localStorage.getItem('kv_orden_' + clave) || 'null') as string[] | Partial<Layout> | null
    if (Array.isArray(v)) return { orden: v, spans: {}, altos: {}, ocultos: [] }              // formato anterior: solo orden
    if (v && Array.isArray(v.orden)) return { orden: v.orden, spans: v.spans || {}, altos: v.altos || {}, ocultos: v.ocultos || [] }
  } catch { /* nada guardado o modo privado */ }
  return { orden: [], spans: {}, altos: {}, ocultos: [] }
}
const guardarLayout = (clave: string, l: Layout) => { try { localStorage.setItem('kv_orden_' + clave, JSON.stringify(l)) } catch { /* modo privado */ } }
/** Orden guardado + los widgets nuevos al final; los que ya no existen se descartan. */
const ordenar = (ids: string[], guardado: string[]) => [...guardado.filter((id) => ids.includes(id)), ...ids.filter((id) => !guardado.includes(id))]

export function WidgetGrid({ clave, widgets }: { clave: string; widgets: Widget[] }) {
  const ids = widgets.map((w) => w.id)
  const [layout, setLayout] = useState<Layout>(() => { const l = leerLayout(clave); return { ...l, orden: ordenar(ids, l.orden) } })
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [resizing, setResizing] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const grid = useRef<HTMLDivElement>(null)
  const actual = useRef(layout); actual.current = layout
  useEffect(() => { setLayout((l) => (ordenar(ids, l.orden).join() === l.orden.join() ? l : { ...l, orden: ordenar(ids, l.orden) })) }, [ids.join()])   // eslint-disable-line react-hooks/exhaustive-deps

  const por = new Map(widgets.map((w) => [w.id, w]))
  const spanDe = (id: string) => clampSpan(layout.spans[id] ?? por.get(id)?.span ?? 3)
  const altoDe = (id: string): number | undefined => layout.altos[id]
  const filasReales = (id: string) => clampFilas((refs.current[id]?.getBoundingClientRect().height ?? FILA * MIN_FILAS) / FILA)
  const fijar = (l: Layout) => { setLayout(l); guardarLayout(clave, l) }
  const mover = (id: string, a: number) => {
    const o = layout.orden.filter((x) => x !== id)
    o.splice(Math.max(0, Math.min(o.length, a)), 0, id)
    fijar({ ...layout, orden: o })
  }
  const ancho = (id: string, s: number) => fijar({ ...layout, spans: { ...layout.spans, [id]: clampSpan(s) } })
  /** Alto en filas; `undefined` = automático (el del contenido). */
  const alto = (id: string, f: number | undefined) => {
    const altos = { ...layout.altos }
    if (f === undefined) delete altos[id]; else altos[id] = clampFilas(f)
    fijar({ ...layout, altos })
  }
  const quitar = (id: string) => fijar({ ...layout, ocultos: [...layout.ocultos.filter((x) => x !== id), id] })
  const poner = (id: string) => fijar({ ...layout, ocultos: layout.ocultos.filter((x) => x !== id) })
  const visibles = layout.orden.filter((id) => !layout.ocultos.includes(id) && por.has(id))
  const quitados = layout.ocultos.filter((id) => por.has(id))
  const soltar = (destino: string) => { if (drag && drag !== destino) mover(drag, layout.orden.indexOf(destino)) }
  const onDragStart = (id: string) => (e: DragEvent<HTMLSpanElement>) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    const el = refs.current[id]
    if (el) e.dataTransfer.setDragImage(el, 24, 24)
    setDrag(id)
  }
  /** Estirar con el mouse o el dedo: el ancho de una columna sale del ancho real de la rejilla;
   *  el alto solo se fija cuando el arrastre se mueve en vertical más de media fila. */
  const onResizeStart = (id: string) => (e: RPointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    const g = grid.current, el = refs.current[id]
    if (!g || !el) return
    const col = (g.clientWidth - GAP * (COLS - 1)) / COLS
    const r0 = el.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY
    let span = spanDe(id), filas = altoDe(id), tocoAlto = false, pendiente = actual.current
    setResizing(id)
    const move = (ev: PointerEvent) => {
      const s = clampSpan((r0.width + (ev.clientX - x0) + GAP) / (col + GAP))
      const dy = ev.clientY - y0
      if (!tocoAlto && Math.abs(dy) > FILA / 2) tocoAlto = true
      const f = tocoAlto ? clampFilas((r0.height + dy) / FILA) : filas
      if (s === span && f === filas) return
      span = s; filas = f
      const altos = { ...actual.current.altos }
      if (f === undefined) delete altos[id]; else altos[id] = f
      pendiente = { ...actual.current, spans: { ...actual.current.spans, [id]: s }, altos }
      setLayout(pendiente)
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      setResizing(null)
      guardarLayout(clave, pendiente)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }
  const onResizeKey = (id: string) => (e: KeyboardEvent<HTMLSpanElement>) => {
    const k = e.key
    if (k === 'ArrowRight') ancho(id, spanDe(id) + 1)
    else if (k === 'ArrowLeft') ancho(id, spanDe(id) - 1)
    else if (k === 'Home') ancho(id, MIN)
    else if (k === 'End') ancho(id, COLS)
    else if (k === 'ArrowDown') alto(id, (altoDe(id) ?? filasReales(id)) + 1)
    else if (k === 'ArrowUp') alto(id, (altoDe(id) ?? filasReales(id)) - 1)
    else if (k === 'Delete' || k === 'Backspace') alto(id, undefined)
    else return
    e.preventDefault()
  }
  const restablecer = () => { fijar({ orden: ids, spans: {}, altos: {}, ocultos: [] }); try { localStorage.removeItem('kv_orden_' + clave) } catch { /* nada */ } }
  const cambiado = layout.orden.join() !== ids.join()
    || Object.keys(layout.spans).some((id) => por.has(id) && layout.spans[id] !== (por.get(id)?.span ?? 3))
    || Object.keys(layout.altos).some((id) => por.has(id))
    || quitados.length > 0

  return (
    <>
      <div className="wgrid" ref={grid}>
        {visibles.map((id, i) => {
          const w = por.get(id)!
          const span = spanDe(id), filas = altoDe(id)
          const px = filas ? filas * FILA : undefined
          return (
            <section key={id} ref={(el) => { refs.current[id] = el }} aria-label={w.titulo} style={{ gridColumn: `span ${span}`, height: px }}
              className={'widget' + (w.plain ? ' plain' : ' panel') + (w.cls ? ' ' + w.cls : '') + (px ? ' hset' : '') + (drag === id ? ' dragging' : '') + (over === id && drag !== id ? ' over' : '') + (resizing === id ? ' resizing' : '')}
              onDragOver={(e) => { if (drag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== id) setOver(id) } }}
              onDragLeave={() => { if (over === id) setOver(null) }}
              onDrop={(e) => { e.preventDefault(); soltar(id); setDrag(null); setOver(null) }}>
              <div className="whead">
                <span className="grip" draggable title="Arrastra para mover" aria-hidden="true" onDragStart={onDragStart(id)} onDragEnd={() => { setDrag(null); setOver(null) }}>⋮⋮</span>
                <h3>{w.titulo}{(w.info || []).map((t) => <Info key={t} termino={t} />)}</h3>
                <button type="button" className="wbtn" aria-label={`Mover «${w.titulo}» antes`} title="Mover antes" disabled={i === 0} onClick={() => mover(id, layout.orden.indexOf(visibles[i - 1]))}>▲</button>
                <button type="button" className="wbtn" aria-label={`Mover «${w.titulo}» después`} title="Mover después" disabled={i === visibles.length - 1} onClick={() => mover(id, layout.orden.indexOf(visibles[i + 1]))}>▼</button>
                <button type="button" className="wbtn" aria-label={`Quitar «${w.titulo}» del tablero`} title="Quitar del tablero" onClick={() => quitar(id)}>×</button>
              </div>
              <div className="wbody">{w.nodo}</div>
              <span className="wresize" role="slider" tabIndex={0} aria-label={`Tamaño de «${w.titulo}»`} aria-valuemin={MIN} aria-valuemax={COLS} aria-valuenow={span}
                aria-valuetext={`${span} de ${COLS} columnas, alto ${px ? px + ' píxeles' : 'automático'}`}
                title="Arrastra para cambiar ancho y alto (o usa ← → ↑ ↓; Supr regresa el alto automático)"
                data-ancho={`${span} / ${COLS}` + (px ? ` · ${px} px` : '')} onPointerDown={onResizeStart(id)} onKeyDown={onResizeKey(id)} />
            </section>
          )
        })}
      </div>
      <div className="wreset">
        {quitados.length > 0 && (
          <label className="wadd">Agregar gráfica:{' '}
            <select value="" aria-label="Agregar una gráfica quitada al tablero" onChange={(e) => { if (e.target.value) poner(e.target.value) }}>
              <option value="">elegir…</option>
              {quitados.map((id) => <option key={id} value={id}>{por.get(id)!.titulo}</option>)}
            </select>
          </label>
        )}
        Arrastra el asa ⋮⋮ o usa ▲ ▼ para acomodar los widgets; estira la esquina inferior derecha (o ← → ↑ ↓) para cambiar su ancho por cuadrantes y su alto; Supr regresa el alto automático; × quita la gráfica del tablero. Se guarda en este navegador.{cambiado && <> <button type="button" className="nbtn" onClick={restablecer}>Restablecer tablero</button></>}
      </div>
    </>
  )
}
