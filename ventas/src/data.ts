import type { Corte } from './types'
import { mock } from './mock'

export interface Carga { corte: Corte; origen: 'kommo' | 'ejemplo'; error?: string }

/** Lee data.json relativo (app.py lo sirve en /ventas/data.json; en dev vive en public/).
 *  Sin corte → datos de ejemplo, y la página lo dice: nunca ceros disfrazados de dato. */
export async function cargar(): Promise<Carga> {
  try {
    const r = await fetch('data.json', { cache: 'no-store' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const c = (await r.json()) as Corte
    if (!Array.isArray(c.leads)) throw new Error('JSON sin leads')
    return { corte: c, origen: 'kommo' }
  } catch (e) {
    return { corte: mock(), origen: 'ejemplo', error: String(e) }
  }
}
