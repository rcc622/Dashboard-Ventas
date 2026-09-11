import { useEffect, useMemo, useRef, useState } from 'react'
import type { Config, Corte, Crm, Rango, Yo } from './types'
import { CRM_LABEL } from './types'
import { aplicarConfig, cargar, logout, yo as pedirYo, type Carga } from './data'
import { Login } from './login'
import { esPreset, iniciales, preset, tipoDe, rangoManual, usuariosVisibles, vivo, zonaNombre, type Filtros, type Preset } from './metrics'

const CRMS: Crm[] = ['kommo', 'hubspot']
import { DateRangePicker } from './DateRangePicker'
import { Actualizacion } from './actualizar'
import { AdminDashboard, Asesores, Ficha } from './admin'
import { Calendario, MiDia, MisVentas, Prospectos } from './asesor'
import { Configuracion } from './config'

type Perfil = 'admin' | 'asesor'
type Pagina = 'dashboard' | 'asesores' | 'config' | 'midia' | 'ventas' | 'prospectos' | 'calendario'
const PAGINAS: Pagina[] = ['dashboard', 'asesores', 'config', 'midia', 'ventas', 'prospectos', 'calendario']
const NAV: Record<Perfil, { id: Pagina; label: string }[]> = {
  admin: [{ id: 'dashboard', label: 'Dashboard' }, { id: 'asesores', label: 'Asesores' }, { id: 'config', label: 'Configuración' }],
  asesor: [{ id: 'midia', label: 'Mi día' }, { id: 'ventas', label: 'Mis ventas' }, { id: 'prospectos', label: 'Prospectos' }, { id: 'calendario', label: 'Calendario' }],
}

// El estado de la vista vive en el hash de la URL: recargar conserva la vista y un
// link a la ficha de un asesor se puede compartir. Nada de esto toca el servidor.
function leerHash(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const kv of location.hash.replace(/^#/, '').split('&')) { const i = kv.indexOf('='); if (i > 0) out[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)) }
  return out
}
function rangoDeHash(r: string | undefined, desde?: number): { rango: Rango; preset: Preset | null } {
  if (esPreset(r)) return { rango: preset(r, new Date(), desde), preset: r }
  const m = /^(\d+),(\d+)$/.exec(r || '')
  if (m) return { rango: rangoManual(new Date(Number(m[1]) * 1000), new Date((Number(m[2]) - 1) * 1000)), preset: null }
  return { rango: preset('mes'), preset: 'mes' }
}

export default function App() {
  // Primero la sesión (cookie de app.py); sin ella, la pantalla de entrada. Con ella, el corte.
  const [sesion, setSesion] = useState<Yo | null | undefined>(undefined)
  const [carga, setCarga] = useState<Carga | null>(null)
  const [intento, setIntento] = useState(0)
  useEffect(() => { pedirYo().then(setSesion) }, [])
  useEffect(() => { if (sesion) { setCarga(null); cargar().then(setCarga) } }, [sesion, intento])
  const salir = async () => { await logout(); setCarga(null); setSesion(null) }
  if (sesion === undefined) return <div style={{ padding: 24 }} role="status">Comprobando sesión…</div>
  if (sesion === null) return <Login onOk={setSesion} />
  if (!carga) return <div style={{ padding: 24 }} role="status">Cargando el corte…</div>
  return <Shell key={intento + ':' + sesion.uid} yo={sesion} corte={carga.corte} origen={carga.origen} error={carga.error} onRetry={() => setIntento((i) => i + 1)} onLogout={salir}
    onConfig={(cfg) => setCarga((c) => (c ? { ...c, corte: aplicarConfig(c.corte, cfg) } : c))} />
}

function Shell({ yo, corte, origen, error, onRetry, onConfig, onLogout }: { yo: Yo; corte: Corte; origen: 'kommo' | 'ejemplo'; error?: string; onRetry: () => void; onConfig: (cfg: Config) => void; onLogout: () => void }) {
  const h0 = useMemo(leerHash, [])
  // «Máximo» = del lead más viejo del corte (creación o asignación) a hoy (Randall 6-sep, opción b:
  // aunque la actividad solo cubra VENTAS_DIAS). Sin leads, el inicio de la historia del corte.
  const desdeMaximo = useMemo(() => { let m = corte.desde; for (const l of corte.leads) { if (l.asignacion && l.asignacion < m) m = l.asignacion; if (l.creado && l.creado < m) m = l.creado } return m }, [corte])
  const r0 = useMemo(() => rangoDeHash(h0.r, desdeMaximo), [h0, desdeMaximo])
  // Un asesor solo ve su perfil; el administrador puede alternar y mirar a cualquiera.
  const esAdmin = yo.rol === 'admin'
  const [perfil, setPerfil] = useState<Perfil>(!esAdmin || h0.perfil === 'asesor' ? 'asesor' : 'admin')
  const [pagina, setPagina] = useState<Pagina>(() => {
    const p = PAGINAS.includes(h0.p as Pagina) ? (h0.p as Pagina) : null
    const deAsesor = p && NAV.asesor.some((n) => n.id === p)
    if (!esAdmin) return deAsesor ? (p as Pagina) : 'midia'
    return p ?? (h0.perfil === 'asesor' ? 'midia' : 'dashboard')
  })
  const [menu, setMenu] = useState(false)
  const [hoja, setHoja] = useState(false)   // hoja inferior de filtros (solo móvil)
  // Barras congeladas (Randall 8-sep, «como Excel cuando congelas filas»): la de filtros y la de
  // gráficas se quedan pegadas arriba al bajar. Se puede descongelar; la preferencia se guarda.
  const [congelado, setCongelado] = useState(() => { try { return localStorage.getItem('kv_congelar') !== '0' } catch { return true } })
  const congelar = (v: boolean) => { setCongelado(v); try { localStorage.setItem('kv_congelar', v ? '1' : '0') } catch { /* modo privado */ } }
  const mainRef = useRef<HTMLElement>(null)
  const barraRef = useRef<HTMLDivElement>(null)
  // La segunda barra se pega justo debajo de la primera: su alto cambia al filtrar o al reducir la ventana.
  useEffect(() => {
    const m = mainRef.current
    if (!m) return
    const medir = () => m.style.setProperty('--barra-h', (barraRef.current ? Math.round(barraRef.current.getBoundingClientRect().height) : 0) + 'px')
    medir()
    if (!barraRef.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir); ro.observe(barraRef.current)
    return () => ro.disconnect()
  }, [pagina, perfil, congelado])   // el alto también cambia al filtrar: de eso se encarga el ResizeObserver
  const [drp, setDrp] = useState(false)
  const [presetActivo, setPresetActivo] = useState<Preset | null>(r0.preset)
  // c=kommo en el hash = solo Kommo encendido; c=hubspot = solo HubSpot; sin c = los dos.
  const [filtros, setFiltros] = useState<Filtros>({ rango: r0.rango, equipo: h0.eq || null, asesor: h0.as || null, crm: { kommo: h0.c !== 'hubspot', hubspot: h0.c !== 'kommo' } })
  const [ficha, setFicha] = useState<string | null>(h0.f || null)
  // Perfil asesor: sin login por persona, se elige a quién ver. Arranca en el de la
  // URL o en el asesor con equipo que más leads activos carga.
  const [asesorActual, setAsesorActual] = useState<string>(() => {
    if (!esAdmin) return yo.uid
    if (h0.u && corte.usuarios.some((u) => u.id === h0.u)) return h0.u
    const n = new Map<string, number>()
    for (const l of corte.leads) if (l.asesor_id != null && vivo(l)) n.set(l.asesor_id, (n.get(l.asesor_id) || 0) + 1)
    const visibles = usuariosVisibles(corte)
    const conEquipo = visibles.filter((u) => u.zona)
    const pool = conEquipo.length ? conEquipo : visibles.length ? visibles : corte.usuarios
    return [...pool].sort((a, b) => (n.get(b.id) || 0) - (n.get(a.id) || 0))[0]?.id ?? ''
  })
  useEffect(() => {
    const q: Record<string, string> = { perfil, p: pagina }
    if (ficha) q.f = ficha
    if (perfil === 'asesor') q.u = asesorActual
    if (filtros.equipo) q.eq = filtros.equipo
    if (filtros.asesor) q.as = filtros.asesor
    if (!filtros.crm.kommo) q.c = 'hubspot'
    else if (!filtros.crm.hubspot) q.c = 'kommo'
    q.r = presetActivo ?? `${filtros.rango.ini},${filtros.rango.fin}`
    const hash = '#' + Object.entries(q).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&')
    if (location.hash !== hash) history.replaceState(null, '', hash)
  }, [perfil, pagina, ficha, asesorActual, filtros, presetActivo])

  // Solo los activos: los desactivados en Configuración no salen en ningún menú.
  const usuariosOrden = useMemo(() => usuariosVisibles(corte).sort((a, b) => a.nombre.localeCompare(b.nombre)), [corte])
  const uFicha = ficha ? corte.usuarios.find((u) => u.id === ficha) : null
  const fuentes = (corte.fuentes || []).map((f) => CRM_LABEL[f.crm]).join(' + ')

  const nFiltros = (filtros.asesor ? 1 : 0) + (filtros.equipo ? 1 : 0) + (!filtros.crm.kommo || !filtros.crm.hubspot ? 1 : 0)
  const cambiaPerfil = (p: Perfil) => { setPerfil(p); setPagina(p === 'admin' ? 'dashboard' : 'midia'); setFicha(null); setMenu(false) }
  // Botones Kommo · HubSpot: incluir o excluir la data de un CRM en todo el tablero. Siempre queda uno encendido.
  const mixto = (corte.fuentes || []).length > 1
  const soloUno = CRMS.filter((k) => filtros.crm[k]).length === 1
  const toggleCrm = (k: Crm) => {
    const crm = { ...filtros.crm, [k]: !filtros.crm[k] }
    if (!CRMS.some((x) => crm[x])) return
    setFiltros({ ...filtros, crm, asesor: filtros.asesor && !corte.usuarios.find((u) => u.id === filtros.asesor)?.crm.some((x) => crm[x]) ? null : filtros.asesor })
  }
  const navega = (p: Pagina) => { setPagina(p); setFicha(null); setMenu(false) }
  const actual = corte.usuarios.find((u) => u.id === asesorActual)

  let contenido
  if (perfil === 'admin') {
    contenido = ficha != null
      ? <Ficha corte={corte} filtros={filtros} uid={ficha} onBack={() => setFicha(null)} />
      : pagina === 'config' ? <Configuracion key={corte.generado} corte={corte} onSaved={onConfig} />
        : pagina === 'asesores' ? <Asesores corte={corte} filtros={filtros} onFicha={setFicha} /> : <AdminDashboard corte={corte} filtros={filtros} onFicha={setFicha} />
  } else {
    contenido = pagina === 'ventas' ? <MisVentas corte={corte} uid={asesorActual} />
      : pagina === 'prospectos' ? <Prospectos corte={corte} uid={asesorActual} />
      : pagina === 'calendario' ? <Calendario corte={corte} uid={asesorActual} />
      : <MiDia corte={corte} uid={asesorActual}  compartible={esAdmin} />
  }

  return (
    <div className="shell">
      <a className="skip" href="#main">Ir al contenido</a>
      <header className="header">
        <div className="hleft">
          <button type="button" className="burger" aria-label="Menú" aria-expanded={menu} aria-controls="sidebar" onClick={() => setMenu(!menu)}>☰</button>
          <h1 className="logo"><img className="logo-full" src="./logo.png" alt="Kenet Solar" width="202" height="31" /><img className="logo-icon" src="./favicon.png" alt="Kenet Solar" width="28" height="28" /></h1>
        </div>
        <div className="hright">
          {esAdmin && perfil === 'asesor' && (
            <select className="sel" aria-label="Asesor" value={asesorActual} onChange={(e) => setAsesorActual(e.target.value)}>
              {usuariosOrden.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          )}
          <div className="usericon" title={yo.nombre} aria-hidden="true">{iniciales(yo.nombre || (perfil === 'admin' ? 'KS' : actual?.nombre || ''))}</div>
          {esAdmin ? (
            <div className="pill" role="group" aria-label="Perfil">
              <button type="button" className={perfil === 'admin' ? 'on' : ''} aria-pressed={perfil === 'admin'} onClick={() => cambiaPerfil('admin')}>Admin</button>
              <button type="button" className={perfil === 'asesor' ? 'on' : ''} aria-pressed={perfil === 'asesor'} onClick={() => cambiaPerfil('asesor')}>Asesor</button>
            </div>
          ) : <span className="small muted quien">{yo.nombre}</span>}
          <button type="button" className="btn salir" onClick={onLogout} title={'Cerrar la sesión de ' + yo.nombre}>Salir</button>
        </div>
      </header>
      <nav id="sidebar" className={'sidebar' + (menu ? ' open' : '')} aria-label="Secciones">
        {NAV[perfil].map((n) => <button type="button" key={n.id} className={'nav' + (pagina === n.id && ficha == null ? ' on' : '')} aria-current={pagina === n.id && ficha == null ? 'page' : undefined} onClick={() => navega(n.id)}>{n.label}</button>)}
      </nav>
      <main id="main" className={'main' + (congelado ? ' congelado' : '')} ref={mainRef}>
        {/* Nombra la página para lectores de pantalla y cierra el salto h1 -> h3. */}
        <h2 className="sr-solo">{ficha ? 'Ficha del asesor' : (NAV[perfil].find((n) => n.id === pagina)?.label ?? 'Tablero')}</h2>
        {origen === 'ejemplo' && <div className="aviso" role="status">Datos de ejemplo: no se pudo cargar el corte real{error ? ` (${error})` : ''}. Revisa que el refresh del servicio haya generado data/ventas.json. Las cifras no son reales. <button type="button" className="btn" style={{ marginLeft: 8 }} onClick={onRetry}>Reintentar</button></div>}
        {perfil === 'admin' && pagina !== 'config' && (
          <div className="toolbar" ref={barraRef}>
            {/* Móvil (Randall 7-sep): los filtros viven en una hoja inferior; en escritorio `.tb-controles` es display: contents y todo fluye como antes. */}
            <button type="button" className="btn tb-filtros solo-movil" aria-expanded={hoja} aria-controls="tb-controles" onClick={() => setHoja(!hoja)}>Filtros{nFiltros ? ` (${nFiltros})` : ''}</button>
            {hoja && <button type="button" className="tb-fondo solo-movil" aria-label="Cerrar filtros" onClick={() => setHoja(false)} />}
            <div id="tb-controles" className={'tb-controles' + (hoja ? ' abierta' : '')}>
            <div className="tb-titulo solo-movil"><b>Filtros</b><button type="button" className="ib" aria-label="Cerrar" onClick={() => setHoja(false)}>×</button></div>
            {/* En la ficha de una persona los filtros de equipo y CRM no pintan nada: su zona y su CRM
                son los que son (Randall 10-sep). Ahí la barra solo sirve para SALTAR a otro asesor, y
                la zona y el CRM quedan como dato, no como botón. */}
            {uFicha ? (
              <>
                <select className="sel sel-as" aria-label="Asesor que estás viendo" value={uFicha.id} onChange={(e) => setFicha(e.target.value || null)}>
                  <option value="">← Ver a todos los propietarios</option>
                  {corte.equipos.map((q) => {
                    const suyos = usuariosOrden.filter((u) => u.zona === q.id)
                    return suyos.length ? <optgroup key={q.id} label={q.nombre}>{suyos.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</optgroup> : null
                  })}
                  {(() => { const otros = usuariosOrden.filter((u) => !corte.equipos.some((q) => q.id === u.zona)); return otros.length
                    ? <optgroup label="Sin equipo">{otros.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</optgroup> : null })()}
                </select>
                <span className="tb-info" title={`${uFicha.nombre} es de ${zonaNombre(corte, uFicha.zona)} y su data vive en ${uFicha.crm.map((k) => CRM_LABEL[k]).join(' y ')}. En su ficha se ven TODOS sus datos: los filtros de equipo y CRM no aplican.`}>
                  {zonaNombre(corte, uFicha.zona)} · {uFicha.crm.map((k) => CRM_LABEL[k]).join(' y ')}
                </span>
              </>
            ) : (<>
            <select className="sel sel-as" aria-label="Propietario" value={filtros.asesor ?? ''} onChange={(e) => setFiltros({ ...filtros, asesor: e.target.value || null })}>
              <option value="">Todos los propietarios</option>
              {usuariosOrden.filter((u) => (filtros.equipo == null || u.zona === filtros.equipo) && (!u.crm.length || u.crm.some((x) => filtros.crm[x]))).map((u) => <option key={u.id} value={u.id}>{u.nombre}{tipoDe(corte, u) === 'cambaceo' ? ' · cambaceo' : tipoDe(corte, u) === 'mixto' ? ' · mixto' : tipoDe(corte, u) === 'otro' ? ' · otro' : ''}</option>)}
            </select>
            {/* Equipos de venta como botones a la vista (Randall 6-sep, img 11), junto a Kommo/HubSpot: un clic filtra todo el tablero. */}
            <span className="pill sm equipos" role="group" aria-label="Equipo de ventas">
              <button type="button" className={filtros.equipo == null ? 'on' : ''} aria-pressed={filtros.equipo == null} onClick={() => setFiltros({ ...filtros, equipo: null, asesor: null })}>Todos</button>
              {corte.equipos.map((q) => <button type="button" key={q.id} className={filtros.equipo === q.id ? 'on' : ''} aria-pressed={filtros.equipo === q.id} title={`Solo los vendedores de ${q.nombre}`}
                onClick={() => setFiltros({ ...filtros, equipo: filtros.equipo === q.id ? null : q.id, asesor: null })}>{q.nombre}</button>)}
            </span>
            {mixto && (
              <span className="crms" role="group" aria-label="CRM incluidos en el tablero">
                {CRMS.map((k) => { const on = filtros.crm[k]; const ultimo = on && soloUno; return (
                  <button type="button" key={k} className={'btn tog' + (on ? ' on' : '')} aria-pressed={on} aria-disabled={ultimo || undefined}
                    title={ultimo ? 'Al menos un CRM debe quedar encendido' : on ? `Ocultar la data de ${CRM_LABEL[k]}` : `Mostrar la data de ${CRM_LABEL[k]}`} onClick={() => toggleCrm(k)}>
                    <span className="dot" aria-hidden="true" />{CRM_LABEL[k]}
                  </button>) })}
              </span>
            )}
            </>)}
            <button type="button" className="btn on solo-movil tb-listo" onClick={() => setHoja(false)}>Listo</button>
            </div>
            <span className="spacer" />
            {/* Cambiar filtros redibuja todo el tablero sin avisar a un lector de pantalla: esto lo anuncia. */}
            <span className="sr-solo" role="status" aria-live="polite">
              {`Mostrando ${filtros.rango.label}, ${filtros.equipo ? zonaNombre(corte, filtros.equipo) : 'todos los equipos'}, ${filtros.asesor ? (corte.usuarios.find((u) => u.id === filtros.asesor)?.nombre ?? filtros.asesor) : 'todos los propietarios'}.`}
            </span>
            <Actualizacion corte={corte} fuentes={fuentes} esAdmin={esAdmin} onRecargar={onRetry} />
            <button type="button" className={'ib congelar' + (congelado ? ' on' : '')} aria-pressed={congelado} onClick={() => congelar(!congelado)}
              title={congelado ? 'Las barras están fijas arriba: tócalo para soltarlas' : 'Fijar las barras arriba al bajar por el tablero'}
              aria-label={congelado ? 'Soltar las barras de arriba' : 'Fijar las barras de arriba'}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3h4l-.6 4.2 2.6 2.3v1.5H6v-1.5l2.6-2.3z" /><path d="M10 11v6" />{!congelado && <path d="M4 4l12 12" />}
              </svg>
            </button>
            <button type="button" className="btn btn-date" aria-haspopup="dialog" aria-expanded={drp} onClick={() => setDrp(!drp)}><span className="ico" aria-hidden="true" />{filtros.rango.label}</button>
          </div>
        )}
        {drp && <DateRangePicker rango={filtros.rango} presetActivo={presetActivo} desde={desdeMaximo} onClose={() => setDrp(false)}
          onApply={(r, p) => { setFiltros({ ...filtros, rango: r }); setPresetActivo(p); setDrp(false) }} />}
        {contenido}
      </main>
      {/* Barra inferior en móvil (≤ 699 px): las mismas secciones del menú lateral, a la mano del pulgar. */}
      <nav className="bnav" aria-label="Secciones">
        {NAV[perfil].map((n) => (
          <button type="button" key={n.id} className={'bnav-b' + (pagina === n.id && ficha == null ? ' on' : '')} aria-current={pagina === n.id && ficha == null ? 'page' : undefined} onClick={() => navega(n.id)}>
            <Icono id={n.id} /><span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

/** Iconos de la barra inferior: trazos simples, sin emojis. */
function Icono({ id }: { id: Pagina }) {
  const p: Record<Pagina, string> = {
    dashboard: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
    asesores: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0',
    config: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    midia: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    ventas: 'M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    prospectos: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    calendario: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  }
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={p[id]} /></svg>
}
