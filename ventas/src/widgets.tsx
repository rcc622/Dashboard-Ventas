import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { Info } from './components'
import type { Termino } from './glosario'

// Rejilla de widgets reordenable y redimensionable (pedidos de Randall 4-sep, calcados de los
// tableros de HubSpot): 6 columnas; cada gráfica es un widget con asa ⋮⋮ que se arrastra (o ▲▼
// por teclado) y un asa en la esquina inferior derecha que estira el ancho por cuadrantes
// (2 a 6 columnas; también con ← →). Orden y anchos viven en localStorage por clave
// (admin / midia-<uid>): son preferencia de quien mira, no dato del CRM.
export interface Widget { id: string; titulo: string; nodo: ReactNode; span?: number; plain?: boolean; info?: Termino[]; cls?: string }
interface Layout { orden: string[]; spans: Record<string, number> }

export const COLS = 6
const MIN = 2
const GAP = 14
const clampSpan = (n: number) => Math.max(MIN, Math.min(COLS, Math.round(n)))

const leerLayout = (clave: string): Layout => {
  try {
    const v = JSON.parse(localStorage.getItem('kv_orden_' + clave) || 'null') as string[] | Layout | null
    if (Array.isArray(v)) return { orden: v, spans: {} }              // formato anterior: solo orden
    if (v && Array.isArray(v.orden)) return { orden: v.orden, spans: v.spans || {} }
  } catch { /* nada guardado o modo privado */ }
  return { orden: [], spans: {} }
}
const guardarLayout = (clave: string, l: Layout) => { try { localStorage.setItem('kv_orden_' + clave, JSON.stringify(l)) } catch { /* modo privado */ } }
/** Orden guardado + los widgets nuevos al final; los que ya no existen se descartan. */
const ordenar = (ids: string[], guardado: string[]) => [...guardado.filter((id) => ids.includes(id)), ...ids.filter((id) => !guardado.includes(id))]

export function WidgetGrid({ clave, widgets }: { clave: string; widgets: Widget[] }) {
  const ids = widgets.map((w) => w.id)
  const [layout, setLayout] = useState<Layout>(() => { const l = leerLayout(clave); return { orden: ordenar(ids, l.orden), spans: l.spans } })
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [resizing, setResizing] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => { setLayout((l) => (ordenar(ids, l.orden).join() === l.orden.join() ? l : { ...l, orden: ordenar(ids, l.orden) })) }, [ids.join()])   // eslint-disable-line react-hooks/exhaustive-deps

  const por = new Map(widgets.map((w) => [w.id, w]))
  const spanDe = (id: string) => clampSpan(layout.spans[id] ?? por.get(id)?.span ?? 3)
  const fijar = (l: Layout) => { setLayout(l); guardarLayout(clave, l) }
  const mover = (id: string, a: number) => {
    const o = layout.orden.filter((x) => x !== id)
    o.splice(Math.max(0, Math.min(o.length, a)), 0, id)
    fijar({ ...layout, orden: o })
  }
  const ancho = (id: string, s: number, persistir = true) => {
    const l = { ...layout, spans: { ...layout.spans, [id]: clampSpan(s) } }
    if (persistir) fijar(l); else setLayout(l)
  }
  const soltar = (destino: string) => { if (drag && drag !== destino) mover(drag, layout.orden.indexOf(destino)) }
  const onDragStart = (id: string) => (e: DragEvent<HTMLSpanElement>) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    const el = refs.current[id]
    if (el) e.dataTransfer.setDragImage(el, 24, 24)
    setDrag(id)
  }
  /** Estirar con el mouse o el dedo: el ancho de una columna sale del ancho real de la rejilla. */
  const onResizeStart = (id: string) => (e: RPointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    const g = grid.current, el = refs.current[id]
    if (!g || !el) return
    const col = (g.clientWidth - GAP * (COLS - 1)) / COLS
    const w0 = el.getBoundingClientRect().width, x0 = e.clientX
    let actual = spanDe(id)
    setResizing(id)
    const move = (ev: PointerEvent) => {
      const s = clampSpan((w0 + (ev.clientX - x0) + GAP) / (col + GAP))
      if (s !== actual) { actual = s; ancho(id, s, false) }
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      setResizing(null)
      ancho(id, actual)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }
  const onResizeKey = (id: string) => (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); ancho(id, spanDe(id) + 1) }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); ancho(id, spanDe(id) - 1) }
    if (e.key === 'Home') { e.preventDefault(); ancho(id, MIN) }
    if (e.key === 'End') { e.preventDefault(); ancho(id, COLS) }
  }
  const restablecer = () => { fijar({ orden: ids, spans: {} }); try { localStorage.removeItem('kv_orden_' + clave) } catch { /* nada */ } }
  const cambiado = layout.orden.join() !== ids.join() || Object.keys(layout.spans).some((id) => por.has(id) && layout.spans[id] !== (por.get(id)?.span ?? 3))

  return (
    <>
      <div className="wgrid" ref={grid}>
        {layout.orden.map((id, i) => {
          const w = por.get(id)
          if (!w) return null
          const span = spanDe(id)
          return (
            <section key={id} ref={(el) => { refs.current[id] = el }} aria-label={w.titulo} style={{ gridColumn: `span ${span}` }}
              className={'widget' + (w.plain ? ' plain' : ' panel') + (w.cls ? ' ' + w.cls : '') + (drag === id ? ' dragging' : '') + (over === id && drag !== id ? ' over' : '') + (resizing === id ? ' resizing' : '')}
              onDragOver={(e) => { if (drag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== id) setOver(id) } }}
              onDragLeave={() => { if (over === id) setOver(null) }}
              onDrop={(e) => { e.preventDefault(); soltar(id); setDrag(null); setOver(null) }}>
              <div className="whead">
                <span className="grip" draggable title="Arrastra para mover" aria-hidden="true" onDragStart={onDragStart(id)} onDragEnd={() => { setDrag(null); setOver(null) }}>⋮⋮</span>
                <h3>{w.titulo}{(w.info || []).map((t) => <Info key={t} termino={t} />)}</h3>
                <button type="button" className="wbtn" aria-label={`Mover «${w.titulo}» antes`} title="Mover antes" disabled={i === 0} onClick={() => mover(id, i - 1)}>▲</button>
                <button type="button" className="wbtn" aria-label={`Mover «${w.titulo}» después`} title="Mover después" disabled={i === layout.orden.length - 1} onClick={() => mover(id, i + 1)}>▼</button>
              </div>
              {w.nodo}
              <span className="wresize" role="slider" tabIndex={0} aria-label={`Ancho de «${w.titulo}»`} aria-valuemin={MIN} aria-valuemax={COLS} aria-valuenow={span} aria-valuetext={`${span} de ${COLS} columnas`}
                title="Arrastra para cambiar el ancho (o usa ← →)" data-ancho={`${span} / ${COLS}`} onPointerDown={onResizeStart(id)} onKeyDown={onResizeKey(id)} />
            </section>
          )
        })}
      </div>
      <div className="wreset">Arrastra el asa ⋮⋮ o usa ▲ ▼ para acomodar los widgets; estira la esquina inferior derecha (o ← →) para cambiar su ancho por cuadrantes. Se guarda en este navegador.{cambiado && <> <button type="button" className="nbtn" onClick={restablecer}>Restablecer orden y anchos</button></>}</div>
    </>
  )
}
