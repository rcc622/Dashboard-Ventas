import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Info } from './components'
import type { Termino } from './glosario'

// Rejilla de widgets reordenable (pedido de Randall 4-sep): cada gráfica es un widget con asa
// ⋮⋮ que se arrastra (HTML5 drag & drop) o se mueve con ▲▼ desde el teclado. El orden vive en
// localStorage por clave (admin / midia-<uid>): es preferencia de quien mira, no dato del CRM.
export interface Widget { id: string; titulo: string; nodo: ReactNode; span?: 1 | 2; plain?: boolean; info?: Termino[]; cls?: string }

const leerOrden = (clave: string): string[] => { try { const v = localStorage.getItem('kv_orden_' + clave); return v ? (JSON.parse(v) as string[]) : [] } catch { return [] } }
const guardarOrden = (clave: string, ids: string[]) => { try { localStorage.setItem('kv_orden_' + clave, JSON.stringify(ids)) } catch { /* modo privado */ } }
/** Orden guardado + los widgets nuevos al final; los que ya no existen se descartan. */
const ordenar = (ids: string[], guardado: string[]) => [...guardado.filter((id) => ids.includes(id)), ...ids.filter((id) => !guardado.includes(id))]

export function WidgetGrid({ clave, widgets }: { clave: string; widgets: Widget[] }) {
  const ids = widgets.map((w) => w.id)
  const [orden, setOrden] = useState<string[]>(() => ordenar(ids, leerOrden(clave)))
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLElement | null>>({})
  useEffect(() => { setOrden((o) => (ordenar(ids, o).join() === o.join() ? o : ordenar(ids, o))) }, [ids.join()])   // eslint-disable-line react-hooks/exhaustive-deps

  const fijar = (nuevo: string[]) => { setOrden(nuevo); guardarOrden(clave, nuevo) }
  const mover = (id: string, a: number) => {
    const o = orden.filter((x) => x !== id)
    o.splice(Math.max(0, Math.min(o.length, a)), 0, id)
    fijar(o)
  }
  const soltar = (destino: string) => {
    if (!drag || drag === destino) return
    mover(drag, orden.indexOf(destino))
  }
  const onDragStart = (id: string) => (e: DragEvent<HTMLSpanElement>) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    const el = refs.current[id]
    if (el) e.dataTransfer.setDragImage(el, 24, 24)
    setDrag(id)
  }
  const restablecer = () => { fijar(ids); try { localStorage.removeItem('kv_orden_' + clave) } catch { /* nada */ } }
  const cambiado = orden.join() !== ids.join()
  const por = new Map(widgets.map((w) => [w.id, w]))

  return (
    <>
      <div className="wgrid">
        {orden.map((id, i) => {
          const w = por.get(id)
          if (!w) return null
          return (
            <section key={id} ref={(el) => { refs.current[id] = el }} aria-label={w.titulo}
              className={'widget' + (w.plain ? ' plain' : ' panel') + (w.span === 2 ? ' span2' : '') + (w.cls ? ' ' + w.cls : '') + (drag === id ? ' dragging' : '') + (over === id && drag !== id ? ' over' : '')}
              onDragOver={(e) => { if (drag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== id) setOver(id) } }}
              onDragLeave={() => { if (over === id) setOver(null) }}
              onDrop={(e) => { e.preventDefault(); soltar(id); setDrag(null); setOver(null) }}>
              <div className="whead">
                <span className="grip" draggable title="Arrastra para mover" aria-hidden="true" onDragStart={onDragStart(id)} onDragEnd={() => { setDrag(null); setOver(null) }}>⋮⋮</span>
                <h3>{w.titulo}{(w.info || []).map((t) => <Info key={t} termino={t} />)}</h3>
                <button type="button" className="wbtn" aria-label={`Mover «${w.titulo}» antes`} title="Mover antes" disabled={i === 0} onClick={() => mover(id, i - 1)}>▲</button>
                <button type="button" className="wbtn" aria-label={`Mover «${w.titulo}» después`} title="Mover después" disabled={i === orden.length - 1} onClick={() => mover(id, i + 1)}>▼</button>
              </div>
              {w.nodo}
            </section>
          )
        })}
      </div>
      <div className="wreset">Arrastra el asa ⋮⋮ o usa ▲ ▼ para acomodar los widgets a tu gusto; el orden se guarda en este navegador.{cambiado && <> <button type="button" className="nbtn" onClick={restablecer}>Restablecer el orden original</button></>}</div>
    </>
  )
}
