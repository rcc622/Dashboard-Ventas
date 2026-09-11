import { useEffect, useMemo, useState } from 'react'
import { cargarTableros, guardarTablero } from './data'
import { useEscape, useFocoDialogo } from './components'
import { useRef } from 'react'

// Elegir y ordenar las columnas de una tabla (Randall 9-sep: «poder agregar y quitar columnas, como
// en el tablero podía quitar y agregar gráficas»). Mismo trato que el acomodo de widgets: se guarda
// en la CUENTA, así que la computadora y el teléfono muestran la misma tabla. Las columnas marcadas
// como fijas no se pueden quitar (sin el nombre del asesor la tabla no se entiende).

export interface ColDef<F> {
  id: string
  label: string
  ancho: number                // ancho en PÍXELES; la tabla se desplaza cuando no cabe
  fija?: boolean               // no se puede quitar
  cnt?: boolean                // columna de conteo, centrada
  oculta?: boolean             // no se muestra hasta que alguien la pida
  /** Qué le hace el rango de fechas a esta columna. Se escribe bajo el título para que nadie tenga
   *  que adivinar si está viendo leads asignados, actividad hecha o ventas cerradas en esas fechas
   *  (Randall 9-sep: «es peligroso no saber»). Sustituye a tener dos selectores de fecha. */
  fecha?: BaseFecha
  info?: string                // término del glosario para el botón «i»
  celda: (f: F) => React.ReactNode
}
export type BaseFecha = 'asignacion' | 'actividad' | 'cierre' | 'ninguna'
/** Lo que se escribe bajo el título de la columna, y la explicación larga del `title`. */
export const BASE_FECHA: Record<BaseFecha, { corto: string; largo: string }> = {
  asignacion: { corto: 'por asignación', largo: 'Cuenta los leads que se ASIGNARON dentro de las fechas elegidas; el estado (activo, vencido, sin tarea) es el de hoy.' },
  actividad: { corto: 'por actividad', largo: 'Cuenta lo que PASÓ dentro de las fechas elegidas: la llamada, la tarea, la cotización o el descarte, por su propia fecha.' },
  cierre: { corto: 'por cierre', largo: 'Cuenta las ventas cuyo MES DE VENTA (app de comisiones) cae en las fechas elegidas, sin importar cuándo entró el lead. Sin app en el corte, las que el CRM cerró en esas fechas.' },
  ninguna: { corto: 'sin fechas', largo: 'No depende del rango: es el estado de hoy.' },
}
export interface Eleccion { orden: string[]; ocultas: string[]; ts?: number }
const KEY = (clave: string) => 'kv_cols_' + clave

/** Las columnas visibles, en el orden elegido, y cómo cambiarlas. Guarda solo cuando algo cambia. */
export function useColumnas<F>(clave: string, todas: ColDef<F>[]) {
  const [el, setEl] = useState<Eleccion>(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY(clave)) || 'null'); if (v && Array.isArray(v.orden)) return v } catch { /* nada guardado */ }
    return { orden: [], ocultas: [] }
  })
  const actual = useRef(el); actual.current = el
  const [tocado, setTocado] = useState(() => { try { return localStorage.getItem(KEY(clave)) != null } catch { return false } })
  // Gana el más reciente entre la cuenta y este navegador, igual que el acomodo de widgets.
  useEffect(() => {
    let vivo = true
    cargarTableros().then((t) => {
      if (!vivo) return
      const suyo = t['cols-' + clave] as Eleccion | undefined
      let mio: Eleccion | null = null
      try { mio = JSON.parse(localStorage.getItem(KEY(clave)) || 'null') } catch { /* modo privado */ }
      if (!suyo || !Array.isArray(suyo.orden) || (mio?.ts || 0) > (suyo.ts || 0)) {
        if (mio) guardarTablero('cols-' + clave, mio).catch(() => { /* sin sesión */ })
        return
      }
      setEl(suyo); setTocado(true)
    }).catch(() => { /* sin sesión: se usa lo del navegador */ })
    return () => { vivo = false }
  }, [clave])

  const fijar = (e: Eleccion) => {
    const con = { ...e, ts: Date.now() }
    setEl(con); setTocado(true)
    try { localStorage.setItem(KEY(clave), JSON.stringify(con)) } catch { /* modo privado */ }
    guardarTablero('cols-' + clave, con).catch(() => { /* sin sesión: queda el local */ })
  }
  const restablecer = () => {
    setEl({ orden: [], ocultas: [] }); setTocado(false)
    try { localStorage.removeItem(KEY(clave)) } catch { /* nada */ }
    guardarTablero('cols-' + clave, null).catch(() => { /* sin sesión */ })
  }
  // El orden guardado primero; lo que se agregó al tablero después entra al final y visible.
  const ordenadas = useMemo(() => {
    const por = new Map(todas.map((c) => [c.id, c]))
    const out: ColDef<F>[] = []
    for (const id of el.orden) { const c = por.get(id); if (c && !out.includes(c)) out.push(c) }
    for (const c of todas) if (!out.includes(c)) out.push(c)
    return out
  }, [todas, el.orden])
  // Sin elección guardada mandan los valores por defecto de cada columna; en cuanto se toca algo,
  // manda la elección, para que quitar una columna «de fábrica» no la resucite al recargar.
  // Y una columna que NACE oculta sigue oculta aunque ya haya elección guardada, mientras no esté
  // en el orden guardado: si no, agregar columnas nuevas al código se las encendía de golpe a todo
  // el que ya tenía su tabla acomodada (pasó en producción el 9-sep).
  const ocultas = new Set(tocado
    ? [...el.ocultas, ...todas.filter((c) => c.oculta && !el.orden.includes(c.id)).map((c) => c.id)]
    : todas.filter((c) => c.oculta).map((c) => c.id))
  const visibles = ordenadas.filter((c) => c.fija || !ocultas.has(c.id))
  return { visibles, ordenadas, ocultas, tocado, fijar, restablecer, eleccion: el, actual }
}

/** Ancho fijo de cada columna, en píxeles. Repartir el 100 % entre las visibles hacía que agregar
 *  una columna aplastara a todas las demás (Randall 9-sep: «para el problema del ancho usa un
 *  slider»): ahora cada columna conserva su ancho legible y, si no caben, la tabla se desplaza a lo
 *  ancho con su barra. `anchoTotal` es lo que mide la tabla completa. */
export function anchos<F>(visibles: ColDef<F>[]): string[] {
  return visibles.map((c) => c.ancho + 'px')
}
export function anchoTotal<F>(visibles: ColDef<F>[]): number {
  return visibles.reduce((a, c) => a + c.ancho, 0)
}

export function EditarColumnas<F>({ todas, ordenadas, ocultas, onFijar, onRestablecer, onClose }: {
  todas: ColDef<F>[]; ordenadas: ColDef<F>[]; ocultas: Set<string>
  onFijar: (e: Eleccion) => void; onRestablecer: () => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFocoDialogo(ref)
  useEscape(onClose)
  const [orden, setOrden] = useState<string[]>(() => ordenadas.map((c) => c.id))
  const [off, setOff] = useState<Set<string>>(() => new Set(ocultas))
  const por = new Map(todas.map((c) => [c.id, c]))
  const aplicar = (o: string[], f: Set<string>) => { setOrden(o); setOff(f); onFijar({ orden: o, ocultas: [...f] }) }
  const mover = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= orden.length) return
    const o = [...orden]; const [x] = o.splice(i, 1); o.splice(j, 0, x); aplicar(o, off)
  }
  const alternar = (id: string) => {
    const c = por.get(id)
    if (c?.fija) return
    const f = new Set(off); if (f.has(id)) f.delete(id); else f.add(id); aplicar(orden, f)
  }
  const nVis = orden.filter((id) => por.get(id)?.fija || !off.has(id)).length
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal cols" role="dialog" aria-modal="true" aria-label="Editar columnas" ref={ref}>
        <div className="mh">
          <div className="mt"><h2>Editar columnas</h2><div className="small muted">Elige qué columnas ves en esta tabla y en qué orden. Se recuerda en tu cuenta, así que el teléfono muestra lo mismo.</div></div>
          <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="mb">
          <ul className="collist">
            {orden.map((id, i) => {
              const c = por.get(id)
              if (!c) return null
              const vis = c.fija || !off.has(id)
              return (
                <li key={id} className={vis ? 'on' : ''}>
                  <label>
                    <input type="checkbox" checked={vis} disabled={!!c.fija} onChange={() => alternar(id)}
                      aria-label={vis ? `Quitar la columna ${c.label}` : `Mostrar la columna ${c.label}`} />
                    <span>{c.label}</span>{c.fija && <span className="muted"> · siempre visible</span>}
                  </label>
                  <span className="colmov">
                    <button type="button" className="ib sm" disabled={i === 0} aria-label={`Subir ${c.label}`} title="Subir" onClick={() => mover(i, -1)}>▲</button>
                    <button type="button" className="ib sm" disabled={i === orden.length - 1} aria-label={`Bajar ${c.label}`} title="Bajar" onClick={() => mover(i, 1)}>▼</button>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="mf">
          <span className="small muted">{nVis} de {orden.length} columnas visibles</span>
          <span className="cols-btns">
            <button type="button" className="btn ghost" onClick={() => { setOrden(todas.map((c) => c.id)); setOff(new Set()); onRestablecer() }}>Restablecer</button>
            <button type="button" className="btn on" onClick={onClose}>Listo</button>
          </span>
        </div>
      </div>
    </div>
  )
}
