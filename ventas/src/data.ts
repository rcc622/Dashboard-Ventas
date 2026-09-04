import type { Acceso, Config, Corte, Yo } from './types'
import { mock } from './mock'

export interface Carga { corte: Corte; origen: 'kommo' | 'ejemplo'; error?: string }

// ---- sesión (cookie ks_sesion que pone app.py; el navegador la manda sola)
const post = async (ruta: string, body: unknown) => {
  const r = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Record<string, unknown>
  if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j
}
/** null = sin sesión (mostrar login). En dev sin servidor (vite) el endpoint no existe: se entra como admin de ejemplo. */
export async function yo(): Promise<Yo | null> {
  try {
    const r = await fetch('yo', { cache: 'no-store' })
    if (r.status === 401) return null
    if (r.status === 404) return { uid: 'admin', rol: 'admin', nombre: 'Administrador (dev)' }
    if (!r.ok) return null
    return (await r.json()) as Yo
  } catch { return null }
}
export async function login(usuario: string, password: string): Promise<Yo> { return (await post('login', { usuario, password })).yo as Yo }
export async function logout(): Promise<void> { try { await post('logout', {}) } catch { /* la cookie ya no sirve */ } }
export async function cargarAccesos(): Promise<Acceso[]> {
  const r = await fetch('usuarios.json', { cache: 'no-store' })
  if (!r.ok) return []
  return ((await r.json()) as { usuarios?: Acceso[] }).usuarios || []
}
export async function guardarAccesos(usuarios: Acceso[]): Promise<Acceso[]> { return (await post('usuarios', { usuarios })).usuarios as Acceso[] }

const DEF: Config = { meta_mxn: 800000, cotizado_x: 10, cotizado_dias: 90, metas_zona: {}, metas: {}, ocultos: [], equipos: {}, comisiones_map: {} }

/** La configuración guardada desde la página (config.json) manda sobre lo que trae el
 *  corte (env del servicio); y un corte anterior al 4-sep no trae metas: mismos defaults
 *  que ventas_corte.py. La zona del CRM se conserva en zona_crm para poder volver a ella. */
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
/** Cruce vendedor de la app de comisiones -> asesor del CRM: el mapa de Configuración manda sobre el automático. */
function aplicarComisiones(c: Corte, mapa: Record<string, string>): Corte['comisiones'] {
  if (!c.comisiones) return c.comisiones
  const m = new Map(Object.entries(mapa).map(([k, v]) => [norm(k), v]))
  const ids = new Set(c.usuarios.map((u) => u.id))
  const vendedores = c.comisiones.vendedores.map((v) => { const f = m.get(norm(v.nombre)); return f === undefined ? v : { ...v, asesor_id: f && ids.has(f) ? f : null } })
  const por = new Map(vendedores.map((v) => [v.id, v.asesor_id]))
  return { ...c.comisiones, vendedores, ventas: c.comisiones.ventas.map((x) => ({ ...x, asesor_id: x.vendedor_id ? por.get(x.vendedor_id) ?? null : null })) }
}
export function aplicarConfig(c: Corte, cfg: Partial<Config>): Corte {
  const equipos = cfg.equipos ?? {}
  return {
    ...c,
    comisiones_map: cfg.comisiones_map ?? c.comisiones_map ?? {},
    comisiones: aplicarComisiones(c, cfg.comisiones_map ?? c.comisiones_map ?? {}),
    meta_mxn: cfg.meta_mxn ?? c.meta_mxn ?? DEF.meta_mxn,
    cotizado_x: cfg.cotizado_x ?? c.cotizado_x ?? DEF.cotizado_x,
    cotizado_dias: cfg.cotizado_dias ?? c.cotizado_dias ?? DEF.cotizado_dias,
    metas_zona: cfg.metas_zona ?? c.metas_zona ?? {},
    metas: cfg.metas ?? c.metas ?? {},
    ocultos: cfg.ocultos ?? c.ocultos ?? [],
    usuarios: c.usuarios.map((u) => {
      const crm = u.zona_crm ?? u.zona
      const ov = equipos[u.id]
      return { ...u, zona_crm: crm, zona: ov == null ? crm : ov === '-' ? '' : ov }
    }),
  }
}

/** Lee data.json y config.json relativos (app.py los sirve bajo /ventas/; en dev vive en public/).
 *  Sin corte → datos de ejemplo, y la página lo dice: nunca ceros disfrazados de dato. */
export async function cargar(): Promise<Carga> {
  try {
    const r = await fetch('data.json', { cache: 'no-store' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const c = (await r.json()) as Corte
    if (!Array.isArray(c.leads)) throw new Error('JSON sin leads')
    let cfg: Partial<Config> = {}
    try { const rc = await fetch('config.json', { cache: 'no-store' }); if (rc.ok) cfg = (await rc.json()) as Partial<Config> } catch { /* sin config guardada: valen las del corte */ }
    return { corte: aplicarConfig(c, cfg), origen: 'kommo' }
  } catch (e) {
    return { corte: aplicarConfig(mock(), {}), origen: 'ejemplo', error: String(e) }
  }
}

/** POST /ventas/config: el servidor valida, escribe data/ventas_config.json y devuelve lo guardado. */
export async function guardarConfig(cfg: Config): Promise<Config> {
  const r = await fetch('config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; config?: Config; error?: string }
  if (!r.ok || !j.ok || !j.config) throw new Error(j.error || `HTTP ${r.status}`)
  return j.config
}
