import { useEffect, useState } from 'react'
import { cargarTableros, guardarTablero } from './data'

// La vista guardada de una ventana de detalle (Randall 13-sep: «modificar la anchura de las columnas y la
// altura de las filas, tipo Excel; mover las columnas y, si lo deseo, guardar esa vista»). Vive en la
// CUENTA con la clave `vista-<clave>`, en el mismo almacén que el acomodo de widgets y las columnas de
// Asesores, así que el administrador puede aplicársela a otras cuentas con el mismo endpoint. Aquí no
// hay autoguardado: la ventana la cambia en memoria y solo «Guardar vista» llama a `guardar`.

/** `anchos` por id de columna en px (vacío = anchos automáticos); `alto` de todas las filas; `orden` y
 *  `ocultas` de columnas; `expandido` = abrir a pantalla completa. */
export interface Vista { anchos: Record<string, number>; alto?: number; orden?: string[]; ocultas?: string[]; expandido?: boolean; ts?: number }
export const VACIA: Vista = { anchos: {} }
const KEY = (clave: string) => 'kv_vista_' + clave
const CLAVE = (clave: string) => 'vista-' + clave
const esVista = (v: unknown): v is Vista => !!v && typeof v === 'object' && typeof (v as Vista).anchos === 'object' && (v as Vista).anchos !== null
const leerLocal = (clave: string): Vista | null => { try { const v = JSON.parse(localStorage.getItem(KEY(clave)) || 'null'); return esVista(v) ? v : null } catch { return null } }

/** La vista guardada de esta cuenta (gana la más reciente entre la cuenta y este navegador, como el
 *  acomodo de widgets) y cómo guardarla; `null` la borra. */
export function useVistaGuardada(clave: string): [Vista | null, (v: Vista | null) => void] {
  const [g, setG] = useState<Vista | null>(() => leerLocal(clave))
  useEffect(() => {
    let vivo = true
    setG(leerLocal(clave))
    cargarTableros().then((t) => {
      if (!vivo) return
      const suyo = t[CLAVE(clave)], mio = leerLocal(clave)
      if (!esVista(suyo) || (mio?.ts || 0) > (suyo.ts || 0)) {
        if (mio) guardarTablero(CLAVE(clave), mio).catch(() => { /* sin sesión */ })
        return
      }
      setG(suyo)
    }).catch(() => { /* sin sesión: vale lo del navegador */ })
    return () => { vivo = false }
  }, [clave])
  const guardar = (v: Vista | null) => {
    const con = v ? { ...v, ts: Date.now() } : null
    setG(con)
    try { if (con) localStorage.setItem(KEY(clave), JSON.stringify(con)); else localStorage.removeItem(KEY(clave)) } catch { /* modo privado */ }
    guardarTablero(CLAVE(clave), con).catch(() => { /* sin sesión: queda el local */ })
  }
  return [g, guardar]
}
