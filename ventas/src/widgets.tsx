import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconoInfo, Info, useEscape } from './components'
import type { Termino } from './glosario'
import { baseDe, type Grafica } from './constructor'
import { BASE_FECHA, type BaseFecha } from './columnas'
import { PRESETS, nombrePreset, type Preset } from './metrics'
import { cargarCuentas, cargarTableros, compartirTablero, guardarTablero, type Cuenta } from './data'

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
export interface Widget { id: string; titulo: string; nodo: ReactNode; span?: number; alto?: number; plain?: boolean; info?: Termino[]; ayuda?: string; cls?: string; desde?: string; grafica?: Grafica; base?: BaseFecha }
/** Lo que la página presta para las gráficas propias (constructor.tsx): dibujarlas, la galería y el editor. */
export interface Constructor {
  render: (g: Grafica) => ReactNode
  galeria: (p: { quitados: Widget[]; onAgregar: (id: string) => void; onCrear: (g: Grafica) => void; onClose: () => void }) => ReactNode
  editor: (p: { g: Grafica; onGuardar: (g: Grafica) => void; onClose: () => void }) => ReactNode
}
export interface Pos { x: number; y: number; w: number; h: number }
/** `ts` = cuándo se tocó por última vez. Es lo que decide quién gana entre el navegador y la cuenta:
 *  sin esa marca, abrir el tablero en otro lado pisaba lo que acabas de acomodar aquí. */
interface Layout { v: 2; pos: Record<string, Pos>; ocultos: string[]; seps: Record<string, string>; graficas?: Grafica[]; ts?: number }
interface LayoutV1 { orden: string[]; spans?: Record<string, number>; altos?: Record<string, number>; ocultos?: string[]; seps?: Record<string, string> }
const esSep = (id: string) => id.startsWith('sep:')
const esGraf = (id: string) => id.startsWith('g:')   // gráfica hecha con el constructor (Randall 7-sep)

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
/** Sube cada widget hasta donde tope, sin cambiar su columna ni su tamaño: quita los huecos que quedan
 *  al mover o quitar cosas (Randall 8-sep: «un botón para quitar espacios en blanco»). Arrastrar sigue
 *  sin gravedad, para poder dejar aire a propósito; esto se aplica solo cuando se pide o al quitar. */
function compactar(pos: Record<string, Pos>): Record<string, Pos> {
  const out: Record<string, Pos> = {}
  for (const id of Object.keys(pos).sort((a, b) => pos[a].y - pos[b].y || pos[a].x - pos[b].x)) {
    let p = { ...pos[id] }
    while (p.y > 1 && !Object.values(out).some((o) => choca({ ...p, y: p.y - 1 }, o))) p = { ...p, y: p.y - 1 }
    out[id] = p
  }
  return out
}
/** ¿Hay algo que se pueda subir? Se compara fila por fila: comparar los objetos serializados decía que sí
 *  siempre, porque `compactar` devuelve las llaves en otro orden. */
const huecos = (pos: Record<string, Pos>) => { const c = compactar(pos); return Object.keys(pos).some((k) => c[k] && c[k].y !== pos[k].y) }
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
/** El servidor guarda el acomodo de la cuenta, con un respiro para no escribir en cada tecla. */
let _pendiente: ReturnType<typeof setTimeout> | null = null
const guardarEnLaCuenta = (clave: string, l: Layout | null) => {
  if (_pendiente) clearTimeout(_pendiente)
  _pendiente = setTimeout(() => { guardarTablero(clave, l).catch(() => { /* sin sesión o sin red: queda el local */ }) }, 700)
}
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
    return sanear({ v: 2, pos: { ...l.pos }, ocultos: [...(l.ocultos || [])], seps: { ...(l.seps || {}) }, graficas: [...(l.graficas || [])], ts: l.ts }, widgets)
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
  return { v: 2, pos, ocultos, seps, graficas: [] }
}
/** Quita posiciones de widgets que ya no existen y coloca los nuevos en el primer hueco. */
function sanear(l: Layout, widgets: Widget[]): Layout {
  const por = new Map(widgets.map((w) => [w.id, w]))
  const pos: Record<string, Pos> = {}
  const propias = new Set((l.graficas || []).map((g) => 'g:' + g.id))
  for (const [id, p] of Object.entries(l.pos)) if (por.has(id) || (esSep(id) && id in l.seps) || propias.has(id)) pos[id] = { x: clamp(p.x, 1, COLS), y: clamp(p.y, 1, 5000), w: clamp(p.w, 1, COLS), h: clamp(p.h, esSep(id) ? SEP_H : MIN_FILAS, MAX_FILAS) }
  const ocultos = l.ocultos.filter((id) => por.has(id))
  for (const g of l.graficas || []) if (!('g:' + g.id in pos)) pos['g:' + g.id] = colocar(pos, clamp(g.span ?? 3, 1, COLS), clamp(g.alto ?? 9, MIN_FILAS, MAX_FILAS))
  // Un widget nuevo que nace de otro (`desde`) y cabe a su derecha parte al viejo en dos en vez de caer
  // al primer hueco (Perfiles → matriz + tabla, 6-sep); si no cabe, va al primer hueco como los demás.
  for (const w of widgets) { const o = w.desde ? pos[w.desde] : undefined; if (o && !(w.id in pos) && !ocultos.includes(w.id) && o.w >= 2 * anchoDe(w)) { o.w -= anchoDe(w); pos[w.id] = { x: o.x + o.w, y: o.y, w: anchoDe(w), h: o.h } } }
  for (const w of widgets) if (!(w.id in pos) && !ocultos.includes(w.id)) pos[w.id] = colocar(pos, anchoDe(w), altoDe(w))
  return { v: 2, pos, ocultos, seps: l.seps, graficas: l.graficas || [] }
}
function useLibre() {
  const q = '(min-width: 1000px)'
  const [ok, setOk] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches)
  useEffect(() => { const m = matchMedia(q); const f = () => setOk(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return ok
}

interface Arrastre { id: string; ghost: Pos; dx: number; dy: number }
interface Estiro { id: string; ghost: Pos }
/** Gráfica elegida en la galería que todavía no aterriza: sigue al puntero hasta que se suelta. */
interface Colocando { titulo: string; w: number; h: number; pos: Pos | null; poner: (p: Pos | null) => void }

/** Fechas propias por widget: qué widget tiene cuáles y cómo cambiarlas. */
export interface Fechas {
  /** La clave con la que `useRangos` guarda estas fechas en la cuenta (`rangos-<clave>`). No siempre es la del
   *  tablero: la ficha guarda su acomodo en `ficha2` y sus fechas en `ficha`; «Aplicar a otras cuentas» las
   *  copiaba bajo `rangos-ficha2` y nadie las leía (15-sep). */
  clave: string
  /** Si este widget puede tener fechas propias (Configuración › Fechas propias por widget). Sin la función, todos. */
  permitido?: (id: string) => boolean
  por: Record<string, Preset>
  fijar: (id: string, p: Preset | null) => void
  tablero: string                        // cómo se llama el periodo de arriba: «Este mes», «Máximo»…
  fechas: (p?: Preset) => string         // ese periodo en fechas de verdad, para el menú y el título
}

function IconoCalendario() {
  return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2" /><path d="M3 8.5h14M7 3v3M13 3v3" /></svg>
}

/** Las fechas de un widget, como en HubSpot: una etiqueta que SIEMPRE dice qué periodo está mirando.
 *  Apagada cuando sigue al tablero, encendida cuando tiene las suyas (Randall 10-sep: «el icono de
 *  calendario no se puede cambiar a un formato tipo etiqueta así como el de HubSpot»). El menú se
 *  dibuja colgado del body y SIGUE al botón al hacer scroll: antes se cerraba de golpe. */
function BotonFechas({ id, titulo, actual, base, fechas }: { id: string; titulo: string; actual?: Preset; base?: BaseFecha; fechas: Fechas }) {
  const [caja, setCaja] = useState<{ top: number; left: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEscape(() => { if (caja) setCaja(null) })
  const donde = () => {
    const r = btn.current!.getBoundingClientRect()
    const ancho = 235, alto = 356
    return {
      top: r.bottom + 6 + alto > window.innerHeight ? Math.max(8, r.top - 6 - alto) : r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)),
    }
  }
  useEffect(() => {
    if (!caja) return
    const fuera = (e: Event) => {
      const t = e.target as Node
      if (!btn.current?.contains(t) && !menu.current?.contains(t)) setCaja(null)
    }
    // Al hacer scroll el menú se MUEVE con el botón; solo se cierra si el botón se sale de la pantalla.
    const seguir = () => {
      const r = btn.current?.getBoundingClientRect()
      if (!r || r.bottom < 0 || r.top > window.innerHeight) return setCaja(null)
      setCaja(donde())
    }
    document.addEventListener('pointerdown', fuera)
    window.addEventListener('resize', seguir)
    window.addEventListener('scroll', seguir, true)
    return () => { document.removeEventListener('pointerdown', fuera); window.removeEventListener('resize', seguir); window.removeEventListener('scroll', seguir, true) }
  }, [caja])
  const abrir = () => setCaja(caja ? null : donde())
  const propio = !!actual
  const label = propio ? nombrePreset(actual!) : fechas.tablero
  const cuenta = base && base !== 'ninguna' ? `Cuenta ${BASE_FECHA[base].corto}. ${BASE_FECHA[base].largo}` : ''
  const dice = `${propio ? `«${titulo}» tiene sus propias fechas` : 'Sigue las fechas del tablero'}: ${label} (${fechas.fechas(actual)}).${cuenta ? ' ' + cuenta : ''}`
  const elegir = (p: Preset | null) => { fechas.fijar(id, p); setCaja(null) }
  return (
    <span className={'wfechas' + (propio ? ' on' : '')}>
      <button type="button" className="wrango" ref={btn} aria-haspopup="menu" aria-expanded={!!caja} title={dice} aria-label={`Fechas de «${titulo}». ${dice} Cambiar`} onClick={abrir}>
        <IconoCalendario /><span>{label}</span>
      </button>
      {caja && createPortal(
        <div className="wmenu" role="menu" ref={menu} style={{ top: caja.top, left: caja.left }} aria-label={`Fechas de «${titulo}»`}>
          <div className="wmenu-cab">
            <b>{label}</b><span>{fechas.fechas(actual)}</span>
            {cuenta && <span className="wmenu-base" title={BASE_FECHA[base!].largo}>Cuenta {BASE_FECHA[base!].corto}</span>}
          </div>
          <button type="button" role="menuitemradio" aria-checked={!propio} className={!propio ? 'on' : ''} onClick={() => elegir(null)}>Las fechas del tablero</button>
          <div className="wmenu-sec">Solo para esta gráfica</div>
          {PRESETS.map((p) => (
            <button type="button" key={p.id} role="menuitemradio" aria-checked={actual === p.id} className={actual === p.id ? 'on' : ''} onClick={() => elegir(p.id)}>{p.label}</button>
          ))}
        </div>, document.body)}
    </span>
  )
}

/** Aplicarle este acomodo a otras cuentas (Randall 10-sep: «poderle acomodar la vista a los demás,
 *  de gráficas que no encuentren o no sepan cómo hacer»). Copia el acomodo y las fechas propias de
 *  los widgets; no toca nada más de la cuenta destino. */
/** También la usa la ventana de detalle para aplicar la vista de un reporte (13-sep); `nombre` es lo que se lee en vez de la clave. */
export function Compartir({ clave, datos, nombre, onClose }: { clave: string; datos: Record<string, unknown>; nombre?: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEscape(onClose)
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null)
  const [error, setError] = useState('')
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [ocupado, setOcupado] = useState(false)
  const [listo, setListo] = useState(0)
  useEffect(() => { cargarCuentas().then((c) => setCuentas(c.filter((x) => x.activo))).catch((e) => setError(String(e.message || e))) }, [])
  const alternar = (id: string) => setElegidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const porRol = (rol: string) => {
    const ids = (cuentas || []).filter((c) => c.rol === rol).map((c) => c.id)
    setElegidas((s) => { const n = new Set(s); const todas = ids.every((i) => n.has(i)); ids.forEach((i) => (todas ? n.delete(i) : n.add(i))); return n })
  }
  const aplicar = () => {
    setOcupado(true); setError('')
    compartirTablero([...elegidas], datos)
      .then(() => { setListo(elegidas.size); setOcupado(false) })
      .catch((e) => { setError(String(e.message || e)); setOcupado(false) })
  }
  const roles = [...new Set((cuentas || []).map((c) => c.rol))]
  // Cada vista la ve un tipo de cuenta: no tiene caso aplicarle el tablero de administrador a un
  // vendedor, que abre en «Mi día».
  const soloAdmin = clave === 'admin' || clave === 'ficha2' || clave.startsWith('vista-')
  const deQuien = soloAdmin ? (clave === 'admin' ? 'Es la vista Dashboard, que solo abren las cuentas de administrador.' : clave === 'ficha2' ? 'Es la ficha del asesor, que solo abren las cuentas de administrador.' : 'Es la vista de un reporte del Dashboard (ancho de columnas, alto de filas, orden), que solo abren las cuentas de administrador.')
    : clave.startsWith('midia-') ? 'Es la vista «Mi día» de ese asesor: aplícasela a SU cuenta.' : ''
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal cols" role="dialog" aria-modal="true" aria-label="Aplicar este acomodo a otras cuentas" ref={ref}>
        <div className="mh">
          <div className="mt"><h2>Aplicar este acomodo</h2><div className="small muted">Le deja a quien elijas el mismo orden, las mismas gráficas y las mismas fechas por widget que tú tienes aquí. Pisa el acomodo que esa cuenta tuviera en esta vista; no toca sus otras vistas.{deQuien ? ' ' + deQuien : ''}</div></div>
          <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="mb">
          {error && <div className="aviso">{error}</div>}
          {listo > 0 && <div className="aviso">Listo: se aplicó a {listo} cuenta{listo === 1 ? '' : 's'}. La verán al recargar.</div>}
          {!cuentas && !error && <div className="muted">Cargando cuentas…</div>}
          {cuentas && !cuentas.length && <div className="muted">No hay cuentas de /ventas dadas de alta. Se crean en Configuración.</div>}
          {roles.length > 1 && <div className="cols-btns" style={{ marginBottom: 8 }}>
            {roles.map((r) => <button type="button" key={r} className="btn sm" onClick={() => porRol(r)}>Todos los {r === 'admin' ? 'administradores' : r + 'es'}</button>)}
          </div>}
          <ul className="collist">
            {(cuentas || []).map((c) => (
              <li key={c.id} className={elegidas.has(c.id) ? 'on' : ''}>
                <label>
                  <input type="checkbox" checked={elegidas.has(c.id)} onChange={() => alternar(c.id)} />
                  <span>{c.nombre || c.usuario}</span><span className="muted"> · {c.rol}{soloAdmin && c.rol !== 'admin' ? ' · no abre esta vista' : ''}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="mf">
          <span className="small muted">{elegidas.size} cuenta{elegidas.size === 1 ? '' : 's'} elegida{elegidas.size === 1 ? '' : 's'} · vista «{nombre ?? clave}»</span>
          <span className="cols-btns">
            <button type="button" className="btn ghost" onClick={onClose}>Cerrar</button>
            <button type="button" className="btn on" disabled={!elegidas.size || ocupado} onClick={aplicar}>{ocupado ? 'Aplicando…' : 'Aplicar a los elegidos'}</button>
          </span>
        </div>
      </div>
    </div>
  )
}

/** `bloqueado`: la cuenta no puede acomodar (Alejandro 15-sep): sin barra de agregar/quitar, sin asa, sin ×, sin esquina de
 *  tamaño ni lápiz; el tablero se ve tal como se lo dejó el administrador. Las fechas por widget sí se pueden elegir. */
export function WidgetGrid({ clave, widgets, taller: ctor, fechas, compartible, bloqueado = false }: { clave: string; widgets: Widget[]; taller?: Constructor; fechas?: Fechas; compartible?: boolean; bloqueado?: boolean }) {
  const [layout, setLayout] = useState<Layout>(() => inicial(clave, widgets))
  const [galeria, setGaleria] = useState(false)
  const [compartir, setCompartir] = useState(false)
  const [ajustando, setAjustando] = useState<Grafica | null>(null)
  // Las gráficas propias son widgets como los demás: se mueven, se estiran y se quitan igual.
  const todos = useMemo(() => [...widgets, ...(layout.graficas || []).map((g): Widget => ({
    id: 'g:' + g.id, titulo: g.titulo, nodo: ctor ? ctor.render(g) : null, span: g.span ?? 3, alto: g.alto ?? 9, grafica: g,
    cls: g.tipo === 'cifra' ? 'wtile wgraf' : 'wgraf', plain: g.tipo === 'cifra', base: baseDe(g),
  }))], [widgets, layout.graficas, ctor])
  const ids = todos.map((w) => w.id)
  const por = useMemo(() => new Map(todos.map((w) => [w.id, w])), [todos])
  const [tocado, setTocado] = useState(() => { try { return localStorage.getItem(KEY(clave)) != null } catch { return false } })
  const [drag, setDrag] = useState<Arrastre | null>(null)
  const [estiro, setEstiro] = useState<Estiro | null>(null)
  const [colocando, setColocando] = useState<Colocando | null>(null)
  const [msg, setMsg] = useState('')
  const libre = useLibre()
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const grid = useRef<HTMLDivElement>(null)
  const actual = useRef(layout); actual.current = layout
  // El acomodo viaja con la CUENTA para que el teléfono vea lo mismo que la computadora (Randall
  // 9-sep). Gana el más reciente: si lo de la cuenta es más viejo que lo de este navegador, se sube
  // lo de aquí en vez de pisarlo; si no hay nada guardado en la cuenta, este navegador la estrena.
  useEffect(() => {
    let vivo = true
    cargarTableros().then((t) => {
      if (!vivo) return
      const g = t[clave] as Layout | undefined
      const suyo = g && typeof g === 'object' && g.pos ? g : null
      // La marca del NAVEGADOR se lee de localStorage, que es lo que este equipo guardó de verdad;
      // el estado en memoria puede ir un paso atrás y entonces lo de la cuenta pisaba lo recién hecho.
      let mio: Layout | null = null
      try { mio = JSON.parse(localStorage.getItem(KEY(clave)) || 'null') } catch { /* modo privado */ }
      if (!suyo || (mio?.ts || 0) > (suyo.ts || 0)) {
        if (mio) guardarEnLaCuenta(clave, mio)         // este navegador tenía lo más nuevo: se sube
        return
      }
      setLayout(sanear({ v: 2, pos: { ...suyo.pos }, ocultos: [...(suyo.ocultos || [])], seps: { ...(suyo.seps || {}) }, graficas: [...(suyo.graficas || [])], ts: suyo.ts }, todos))
      setTocado(true)
    }).catch(() => { /* sin sesión: se usa lo del navegador */ })
    return () => { vivo = false }
  }, [clave])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLayout((l) => { const s = sanear(l, todos); return JSON.stringify(s) === JSON.stringify(l) ? l : s }) }, [ids.join()])   // eslint-disable-line react-hooks/exhaustive-deps

  const fijar = (l0: Layout, aviso = '') => {
    const l = { ...l0, ts: Date.now() }   // la marca de tiempo decide quién gana entre dispositivos
    setLayout(l); guardar(clave, l); guardarEnLaCuenta(clave, l); setTocado(true); if (aviso) setMsg(aviso)
  }
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
  const quitar = (id: string) => {
    const pos = { ...layout.pos }; delete pos[id]
    // Una gráfica propia se borra (se puede volver a crear); un widget del tablero solo se esconde.
    if (esGraf(id)) return fijar({ ...layout, pos: compactar(pos), graficas: (layout.graficas || []).filter((g) => 'g:' + g.id !== id) }, `${tituloDe(id)} borrada`)
    fijar({ ...layout, pos: compactar(pos), ocultos: [...layout.ocultos.filter((x) => x !== id), id] }, `${tituloDe(id)} quitado del tablero`)
  }
  // Guardar una gráfica: si viene una celda, ahí se queda; si no, en el primer hueco libre.
  const guardarGrafica = (g: Grafica, celdaDestino: Pos | null) => {
    const l = actual.current
    const prev = (l.graficas || []).some((x) => x.id === g.id)
    const graficas = prev ? (l.graficas || []).map((x) => (x.id === g.id ? g : x)) : [...(l.graficas || []), g]
    if (prev) return fijar({ ...l, graficas }, `${g.titulo} actualizada`)
    const gid = 'g:' + g.id, w = clamp(g.span ?? 3, 1, COLS), h = clamp(g.alto ?? 9, MIN_FILAS, MAX_FILAS)
    const np = celdaDestino ? { ...celdaDestino, w, h } : colocar(l.pos, w, h)
    fijar({ ...l, pos: acomodar({ ...l.pos, [gid]: np }, gid), graficas }, `${g.titulo} en la columna ${np.x}, fila ${np.y}`)
  }
  const ponerEn = (id: string, celdaDestino: Pos | null) => {
    const l = actual.current, w = por.get(id)
    const np = celdaDestino ? { ...celdaDestino, w: anchoDe(w), h: altoDe(w) } : colocar(l.pos, anchoDe(w), altoDe(w))
    fijar({ ...l, pos: acomodar({ ...l.pos, [id]: np }, id), ocultos: l.ocultos.filter((x) => x !== id) }, `${tituloDe(id)} en la columna ${np.x}, fila ${np.y}`)
  }
  // Elegir en la galería no la manda al primer hueco: queda pegada al puntero y aterriza donde se
  // suelte (Randall 8-sep: «que pueda arrastrar y colocar, para no tener que buscar dónde quedó»).
  const crearGrafica = (g: Grafica) => {
    const prev = (actual.current.graficas || []).some((x) => x.id === g.id)
    if (prev || !libre) return guardarGrafica(g, null)
    setColocando({ titulo: g.titulo, w: clamp(g.span ?? 3, 1, COLS), h: clamp(g.alto ?? 9, MIN_FILAS, MAX_FILAS), pos: null, poner: (p) => guardarGrafica(g, p) })
  }
  const poner = (id: string) => {
    if (!libre) return ponerEn(id, null)
    const w = por.get(id)
    setColocando({ titulo: w?.titulo || id, w: anchoDe(w), h: altoDe(w), pos: null, poner: (p) => ponerEn(id, p) })
  }
  const agregarSep = () => {
    const id = 'sep:' + Date.now().toString(36)
    fijar({ ...layout, pos: { ...layout.pos, [id]: { x: 1, y: fondo(layout.pos), w: COLS, h: SEP_H } }, seps: { ...layout.seps, [id]: 'Nueva sección' } })
    requestAnimationFrame(() => { const inp = refs.current[id]?.querySelector('input'); inp?.focus(); inp?.select() })   // listo para escribir el título
  }
  const titularSep = (id: string, t: string) => fijar({ ...layout, seps: { ...layout.seps, [id]: t } })
  const borrarSep = (id: string) => { const seps = { ...layout.seps }, pos = { ...layout.pos }; delete seps[id]; delete pos[id]; fijar({ ...layout, pos, seps }) }
  const restablecer = () => { try { localStorage.removeItem(KEY(clave)) } catch { /* nada */ } guardarEnLaCuenta(clave, null); setLayout(inicial(clave, widgets)); setTocado(false); setMsg('Tablero restablecido en todos tus dispositivos') }
  const quitados = layout.ocultos.filter((id) => por.has(id))
  const visibles = Object.keys(layout.pos).filter((id) => (esSep(id) ? id in layout.seps : por.has(id))).sort((a, b) => layout.pos[a].y - layout.pos[b].y || layout.pos[a].x - layout.pos[b].x)

  /** Arrastrar el asa ⋮⋮: el widget sigue al puntero y un fantasma marca la celda donde caerá. */
  const onGrip = (id: string) => (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !libre || !grid.current || bloqueado) return
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
    if (!libre || bloqueado) return
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
  // Mientras se coloca: un fantasma marca la celda bajo el puntero y el siguiente clic la deja ahí.
  useEffect(() => {
    if (!colocando) return
    let movio = false
    const celdaEn = (cx: number, cy: number): Pos | null => {
      const g = grid.current
      if (!g) return null
      const r = g.getBoundingClientRect(), { colW, filaH } = celda()
      if (cx < r.left - 40 || cx > r.right + 40 || cy < r.top - 60) return null
      const maxY = Math.max(1, fondo(actual.current.pos))
      return { x: clamp(Math.round((cx - r.left) / (colW + GAP) - colocando.w / 2) + 1, 1, COLS - colocando.w + 1),
               y: clamp(Math.floor((cy - r.top) / (filaH + GAP)) + 1, 1, maxY), w: colocando.w, h: colocando.h }
    }
    const mover = (e: PointerEvent) => { movio = true; const p = celdaEn(e.clientX, e.clientY); setColocando((c) => (c && JSON.stringify(c.pos) !== JSON.stringify(p) ? { ...c, pos: p } : c)) }
    // Solo cuenta el soltar que viene después de mover: así el clic que abrió el modo no la suelta sola.
    const soltar = (e: PointerEvent) => {
      if (!movio) return
      const p = celdaEn(e.clientX, e.clientY)
      if (!p) return
      e.preventDefault(); e.stopPropagation()
      setColocando(null); colocando.poner(p)
    }
    const tecla = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setColocando(null); setMsg('Se canceló: no se agregó nada') } }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar, true)
    window.addEventListener('keydown', tecla, true)
    return () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar, true); window.removeEventListener('keydown', tecla, true) }
  }, [colocando])   // eslint-disable-line react-hooks/exhaustive-deps

  const editando = !!(drag || estiro || colocando)
  const ghost = drag?.ghost || estiro?.ghost || colocando?.pos || undefined
  const area = (p: Pos) => ({ gridColumn: `${p.x} / span ${p.w}`, gridRow: `${p.y} / span ${p.h}` })

  return (
    <>
      {bloqueado ? <div className="wbar"><span className="small muted" title="Lo fija el administrador en Configuración › Usuarios de la plataforma › Acomoda el tablero">Tu cuenta ve el tablero tal como se acomodó para ti; puedes elegir las fechas de cada gráfica.</span></div> : <div className="wbar">
        {/* Los tres botones de la barra son la misma familia (Randall 8-sep): recuadro, icono y texto. */}
        <button type="button" className="btn sm wadd-btn" onClick={() => setGaleria(true)} aria-haspopup="dialog">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
          Agregar gráfica{quitados.length ? ` (${quitados.length} quitadas)` : ''}
        </button>
        <button type="button" className="btn sm wsep-add" onClick={agregarSep}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 10h14M6 5h8M6 15h8" /></svg>
          Agregar separador
        </button>
        {libre && huecos(layout.pos) && <button type="button" className="btn sm wcompact" onClick={() => fijar({ ...layout, pos: compactar(layout.pos) }, 'Espacios en blanco quitados')} title="Sube los widgets para que no queden huecos entre ellos">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 12V4M7 7l3-3 3 3M4 16h12" /></svg>
          Quitar espacios
        </button>}
        {compartible && <button type="button" className="btn sm" onClick={() => setCompartir(true)} aria-haspopup="dialog" title="Dejarle este mismo acomodo a otras cuentas">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="15" cy="5" r="2" /><circle cx="5" cy="10" r="2" /><circle cx="15" cy="15" r="2" /><path d="M6.8 9 13.2 6M6.8 11l6.4 3" /></svg>
          Aplicar a otras cuentas
        </button>}
        {tocado && <button type="button" className="btn sm wreset-btn" onClick={restablecer}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10a6 6 0 1 0 1.8-4.2M4 4v3h3" /></svg>
          Restablecer tablero
        </button>}
        <span className="sr-solo" role="status" aria-live="polite">{msg}</span>
      </div>}
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
                {!bloqueado && <button type="button" className="grip" title="Arrastra para mover (o usa las flechas)" aria-label={`Mover el separador «${layout.seps[id]}»: flechas mueven una celda, Home y End a los bordes`} onPointerDown={onGrip(id)} onKeyDown={onGripKey(id)}><IconoGrip /></button>}
                {bloqueado ? <span className="sep-in">{layout.seps[id]}</span> : <input className="sep-in" value={layout.seps[id]} aria-label="Título del separador" placeholder="Título de la sección" onChange={(e) => titularSep(id, e.target.value)} />}
                {!bloqueado && <span className="wctl">
                  <button type="button" className="wbtn" aria-label="Borrar separador" title="Borrar separador" onClick={() => borrarSep(id)}><IconoX /></button>
                </span>}
              </div>
            </section>
          )
          const w = por.get(id)!
          return (
            <section key={id} ref={(el) => { refs.current[id] = el }} aria-label={w.titulo} style={estilo}
              className={'widget' + (w.plain ? ' plain' : ' panel') + (w.cls ? ' ' + w.cls : '') + (libre ? ' hset' : '') + (arrastrando ? ' dragging' : '') + (estiro?.id === id ? ' resizing' : '')}>
              <div className="whead">
                {!bloqueado && <button type="button" className="grip" title="Arrastra para mover (o usa las flechas)" aria-label={`Mover «${w.titulo}»: flechas mueven una celda, Home y End a los bordes. Ahora en columna ${p.x}, fila ${p.y}`} onPointerDown={onGrip(id)} onKeyDown={onGripKey(id)}><IconoGrip /></button>}
                <h3><span className="wt">{w.titulo}</span>{w.info?.length ? <Info termino={w.info} /> : null}{w.ayuda ? <button type="button" className="ibtn" data-tip={w.ayuda} aria-label={w.ayuda} onClick={(e) => e.stopPropagation()}><IconoInfo /></button> : null}</h3>
                {/* Un widget que es foto de HOY (leads activos, cotizado vigente, tareas abiertas) no depende de ninguna
                    fecha: la píldora lo dice en vez de prestar el periodo del tablero (Randall 16-sep: «este debería ser
                    igual que lo activo… recuerda»). */}
                {/* Foto de hoy: siempre se dice. Fechas propias: solo si el administrador las permite para este widget. */}
                {!fechas ? null : w.base === 'hoy'
                  ? <span className="wfechas hoy"><span className="wrango" title={BASE_FECHA.hoy.largo} aria-label={`«${w.titulo}» es foto de hoy. ${BASE_FECHA.hoy.largo}`}><IconoCalendario /><span>Foto de hoy</span></span></span>
                  : (!fechas.permitido || fechas.permitido(id)) && <BotonFechas id={id} titulo={w.titulo} actual={fechas.por[id]} base={w.base} fechas={fechas} />}
                {!bloqueado && <span className="wctl">
                  {w.grafica && <button type="button" className="wbtn" aria-label={`Ajustar «${w.titulo}»`} title="Ajustar esta gráfica" onClick={() => setAjustando(w.grafica!)}><IconoLapiz /></button>}
                  <button type="button" className="wbtn" aria-label={w.grafica ? `Borrar «${w.titulo}»` : `Quitar «${w.titulo}» del tablero`} title={w.grafica ? 'Borrar esta gráfica' : 'Quitar del tablero'} onClick={() => quitar(id)}><IconoX /></button>
                </span>}
              </div>
              <div className="wbody">{w.nodo}</div>
              {!bloqueado && <span className="wresize" role="slider" tabIndex={0} aria-label={`Tamaño de «${w.titulo}»`} aria-valuemin={1} aria-valuemax={COLS} aria-valuenow={p.w}
                aria-valuetext={`${p.w} de ${COLS} columnas por ${p.h} filas`}
                title="Arrastra para cambiar ancho y alto (o usa ← → ↑ ↓; Supr regresa el tamaño por defecto)"
                data-ancho={`${p.w} / ${COLS} · ${p.h} filas`} onPointerDown={onResizeStart(id)} onKeyDown={onResizeKey(id)} />}
            </section>
          )
        })}
      </div>
      {!bloqueado && <div className="wreset">Arrastra el asa ⋮⋮ a la celda que quieras (o enfócala y usa ← → ↑ ↓); estira la esquina inferior derecha para cambiar ancho y alto (← → ↑ ↓ sobre ella; Supr regresa el tamaño por defecto). Nada se encima: lo que choca se empuja hacia abajo. × quita la gráfica del tablero y arriba, en «Agregar gráfica», la regresas. Se guarda en este navegador.</div>}

      {compartir && <Compartir clave={clave} onClose={() => setCompartir(false)}
        datos={{ [clave]: layout, ...(fechas ? { ['rangos-' + fechas.clave]: { por: fechas.por, ts: Date.now() } } : {}) }} />}
      {colocando && (
        <div className="colocando" role="status">
          <span>Sueltas <b>{colocando.titulo}</b> donde toques el tablero.</span>
          <button type="button" className="btn sm" onClick={() => { const c = colocando; setColocando(null); c.poner(null) }}>Ponla donde quepa</button>
          <button type="button" className="btn sm" onClick={() => setColocando(null)}>Cancelar</button>
        </div>
      )}
      {galeria && (ctor
        ? ctor.galeria({ quitados: quitados.map((id) => por.get(id)!), onAgregar: poner, onCrear: crearGrafica, onClose: () => setGaleria(false) })
        : <GaleriaSimple quitados={quitados.map((id) => por.get(id)!)} onAgregar={poner} onClose={() => setGaleria(false)} />)}
      {ajustando && ctor && ctor.editor({ g: ajustando, onGuardar: (g) => { crearGrafica(g); setAjustando(null) }, onClose: () => setAjustando(null) })}
    </>
  )
}

/** Galería de una rejilla sin constructor (Mi día): solo lo que se quitó, con su vista previa. */
function GaleriaSimple({ quitados, onAgregar, onClose }: { quitados: Widget[]; onAgregar: (id: string) => void; onClose: () => void }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal galeria" role="dialog" aria-modal="true" aria-label="Agregar una gráfica">
        <div className="mh">
          <div className="mt"><h2>Agregar una gráfica</h2><div className="small muted">Lo que quitaste de este tablero. Tócala y luego toca el lugar del tablero donde la quieras.</div></div>
          <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="mb">
          {!quitados.length && <div className="muted" style={{ padding: 16 }}>No has quitado ninguna: están todas en el tablero.</div>}
          <div className="ggrid">
            {quitados.map((w) => (
              <button type="button" key={w.id} className="gcard" onClick={() => { onAgregar(w.id); onClose() }} title={`Regresar «${w.titulo}» al tablero`}>
                <span className="gt">{w.titulo}</span><span className="gprev" aria-hidden="true">{w.nodo}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Iconos de los controles del widget: 16 px dentro de un botón de 24 (Randall 7-sep: nada mayor de 25 px). */
function IconoGrip() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="6" cy="4" r="1.4" /><circle cx="10" cy="4" r="1.4" /><circle cx="6" cy="8" r="1.4" /><circle cx="10" cy="8" r="1.4" /><circle cx="6" cy="12" r="1.4" /><circle cx="10" cy="12" r="1.4" /></svg>
}
function IconoX() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
}
function IconoLapiz() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3z" /></svg>
}
