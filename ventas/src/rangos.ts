import { useEffect, useState } from 'react'
import { cargarTableros, guardarTablero } from './data'
import type { Preset } from './metrics'

// Fechas propias de un widget (Randall 10-sep: «que las gráficas puedan establecerse date range
// específicos… para que si un widget siempre debe mostrar la info histórica, la muestre y no
// conflictúe con el date range del tablero», como los widgets de HubSpot). Si un widget no tiene
// fechas propias sigue las del tablero, que es lo normal. Se guarda en la CUENTA, igual que el
// acomodo y las columnas: la computadora y el teléfono ven el mismo tablero.

export interface Rangos { por: Record<string, Preset>; ts?: number }
const KEY = (clave: string) => 'kv_rangos_' + clave
const CLAVE = (clave: string) => 'rangos-' + clave

export function useRangos(clave: string) {
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
      else delete por[id]
      const n: Rangos = { por, ts: Date.now() }
      try { localStorage.setItem(KEY(clave), JSON.stringify(n)) } catch { /* modo privado */ }
      guardarTablero(CLAVE(clave), n).catch(() => { /* sin sesión: queda el local */ })
      return n
    })
  }
  return { rangos: r.por, fijarRango }
}
