import { useEffect, useMemo, useState } from 'react'
import { cargarTableros, guardarTablero } from './data'
import type { Preset } from './metrics'

// Fechas propias de un widget (Randall 10-sep: «que las gráficas puedan establecerse date range
// específicos… para que si un widget siempre debe mostrar la info histórica, la muestre y no
// conflictúe con el date range del tablero», como los widgets de HubSpot). Si un widget no tiene
// fechas propias sigue las del tablero, que es lo normal. Se guarda en la CUENTA, igual que el
// acomodo y las columnas: la computadora y el teléfono ven el mismo tablero.
//
// `defaults` (Alejandro 15-sep): con qué fechas abre un widget mientras la cuenta no elija otras
// (la evolución por mes de la ficha abre en «Máximo»). Para que «Las fechas del tablero» siga
// siendo una elección posible en esos widgets, se guarda como `'tablero'`: sin esa marca, borrar la
// entrada devolvería al default y el menú mentiría.

export type Elegido = Preset | 'tablero'
export interface Rangos { por: Record<string, Elegido>; ts?: number }
const KEY = (clave: string) => 'kv_rangos_' + clave
const CLAVE = (clave: string) => 'rangos-' + clave

/** Lo guardado más los defaults, ya resuelto: solo presets, sin la marca `'tablero'`. */
function efectivo(por: Record<string, Elegido>, defaults: Record<string, Preset>): Record<string, Preset> {
  const out: Record<string, Preset> = { ...defaults }
  for (const [id, p] of Object.entries(por)) { if (p === 'tablero') delete out[id]; else out[id] = p }
  return out
}

const SIN_DEFAULTS: Record<string, Preset> = {}
export function useRangos(clave: string, defaults: Record<string, Preset> = SIN_DEFAULTS) {
  const [r, setR] = useState<Rangos>(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY(clave)) || 'null'); if (v && v.por) return v as Rangos } catch { /* modo privado */ }
    return { por: {} }
  })
  // Gana el más reciente entre la cuenta y este navegador, igual que el acomodo de widgets.
  useEffect(() => {
    let vivo = true
    cargarTableros().then((t) => {
      if (!vivo) return
      const suyo = t[CLAVE(clave)] as Rangos | undefined
      let mio: Rangos | null = null
      try { mio = JSON.parse(localStorage.getItem(KEY(clave)) || 'null') } catch { /* modo privado */ }
      if (!suyo || !suyo.por || (mio?.ts || 0) > (suyo.ts || 0)) {
        if (mio) guardarTablero(CLAVE(clave), mio).catch(() => { /* sin sesión */ })
        return
      }
      setR(suyo)
    }).catch(() => { /* sin sesión: se usa lo del navegador */ })
    return () => { vivo = false }
  }, [clave])

  /** `null` devuelve el widget a las fechas del tablero. */
  const fijarRango = (id: string, p: Preset | null) => {
    setR((prev) => {
      const por = { ...prev.por }
      if (p) por[id] = p
      else if (defaults[id]) por[id] = 'tablero'
      else delete por[id]
      const n: Rangos = { por, ts: Date.now() }
      try { localStorage.setItem(KEY(clave), JSON.stringify(n)) } catch { /* modo privado */ }
      guardarTablero(CLAVE(clave), n).catch(() => { /* sin sesión: queda el local */ })
      return n
    })
  }
  // Memo: un objeto nuevo en cada render volvía a armar todos los widgets con fechas propias.
  const rangos = useMemo(() => efectivo(r.por, defaults), [r.por, defaults])
  return { rangos, fijarRango }
}
