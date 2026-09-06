import { useEffect, useMemo, useState } from 'react'
import type { Config, Corte, Crm, Rango, Yo } from './types'
import { CRM_LABEL } from './types'
import { aplicarConfig, cargar, logout, yo as pedirYo, type Carga } from './data'
import { Login } from './login'
import { esPreset, fmtCorta, fmtHora, iniciales, preset, rangoManual, usuariosVisibles, vivo, zonaNombre, type Filtros, type Preset } from './metrics'

const CRMS: Crm[] = ['kommo', 'hubspot']
import { DateRangePicker } from './DateRangePicker'
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
function rangoDeHash(r: string | undefined): { rango: Rango; preset: Preset | null } {
  if (esPreset(r)) return { rango: preset(r), preset: r }
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
  const r0 = useMemo(() => rangoDeHash(h0.r), [h0])
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
  const generado = useMemo(() => { const d = new Date(corte.generado); return isNaN(d.getTime()) ? corte.generado : `${fmtCorta(d)} ${fmtHora(d.getTime() / 1000)}` }, [corte])
  const horas = useMemo(() => { const d = new Date(corte.generado).getTime(); return isNaN(d) ? 0 : (Date.now() - d) / 36e5 }, [corte])
  const fuentes = (corte.fuentes || []).map((f) => CRM_LABEL[f.crm]).join(' + ')

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
      : <MiDia corte={corte} uid={asesorActual} />
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
      <main id="main" className="main">
        {/* Nombra la página para lectores de pantalla y cierra el salto h1 -> h3. */}
        <h2 className="sr-solo">{ficha ? 'Ficha del asesor' : (NAV[perfil].find((n) => n.id === pagina)?.label ?? 'Tablero')}</h2>
        {origen === 'ejemplo' && <div className="aviso" role="status">Datos de ejemplo: no se pudo cargar el corte real{error ? ` (${error})` : ''}. Revisa que el refresh del servicio haya generado data/ventas.json. Las cifras no son reales. <button type="button" className="btn" style={{ marginLeft: 8 }} onClick={onRetry}>Reintentar</button></div>}
        {perfil === 'admin' && pagina !== 'config' && (
          <div className="toolbar">
            <select className="sel sel-eq" aria-label="Equipo" value={filtros.equipo ?? ''} onChange={(e) => setFiltros({ ...filtros, equipo: e.target.value || null, asesor: null })}>
              <option value="">Todos los equipos</option>
              {corte.equipos.map((q) => <option key={q.id} value={q.id}>{q.nombre}</option>)}
            </select>
            <select className="sel sel-as" aria-label="Propietario" value={filtros.asesor ?? ''} onChange={(e) => setFiltros({ ...filtros, asesor: e.target.value || null })}>
              <option value="">Todos los propietarios</option>
              {usuariosOrden.filter((u) => (filtros.equipo == null || u.zona === filtros.equipo) && u.crm.some((x) => filtros.crm[x])).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            {mixto && (
              <span className="crms" role="group" aria-label="CRM incluidos en el tablero">
                {CRMS.map((k) => { const on = filtros.crm[k]; const ultimo = on && soloUno; return (
                  <button type="button" key={k} className={'btn tog' + (on ? ' on' : '')} aria-pressed={on} aria-disabled={ultimo || undefined}
                    title={ultimo ? 'Al menos un CRM debe quedar encendido' : on ? `Ocultar la data de ${CRM_LABEL[k]}` : `Mostrar la data de ${CRM_LABEL[k]}`} onClick={() => toggleCrm(k)}>
                    <span className="dot" aria-hidden="true" />{CRM_LABEL[k]}
                  </button>) })}
              </span>
            )}
            <span className="spacer" />
            {/* Cambiar filtros redibuja todo el tablero sin avisar a un lector de pantalla: esto lo anuncia. */}
            <span className="sr-solo" role="status" aria-live="polite">
              {`Mostrando ${filtros.rango.label}, ${filtros.equipo ? zonaNombre(corte, filtros.equipo) : 'todos los equipos'}, ${filtros.asesor ? (corte.usuarios.find((u) => u.id === filtros.asesor)?.nombre ?? filtros.asesor) : 'todos los propietarios'}.`}
            </span>
            <span className="small muted">{fuentes ? fuentes + ' · ' : ''}corte {generado}</span>
            {horas > 8 && <span className="stale" title="El corte se regenera cada 6 horas">corte de hace {Math.round(horas)} h</span>}
            <button type="button" className="btn btn-date" aria-haspopup="dialog" aria-expanded={drp} onClick={() => setDrp(!drp)}><span className="ico" aria-hidden="true" />{filtros.rango.label}</button>
          </div>
        )}
        {drp && <DateRangePicker rango={filtros.rango} presetActivo={presetActivo} onClose={() => setDrp(false)}
          onApply={(r, p) => { setFiltros({ ...filtros, rango: r }); setPresetActivo(p); setDrp(false) }} />}
        {contenido}
      </main>
    </div>
  )
}
