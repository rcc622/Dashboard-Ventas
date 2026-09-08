import { useEffect, useMemo, useState } from 'react'
import type { Acceso, Config, Corte, Usuario } from './types'
import { CRM_LABEL } from './types'
import { cargarAccesos, guardarAccesos, guardarConfig } from './data'
import { fmtMoney0, fmtN, metaDe, rolNombre, zonaNombre } from './metrics'
import { Info } from './components'

// Página de Configuración. Son DOS cosas distintas y por eso van en dos secciones con un
// interruptor arriba (pedido de Randall 4-sep): «Vendedores» es cómo se mide al equipo de ventas
// (metas en pesos, equipo, quién cuenta en el tablero, cruce con la app de comisiones) y
// «Usuarios de la plataforma» es quién puede entrar (correo, contraseña, rol). Un vendedor del CRM
// existe aunque nadie le haya creado cuenta, y una cuenta de administrador no corresponde a ningún
// vendedor: mezclarlas en una sola tabla confundía las dos cosas.
// Todo se guarda junto con el botón de arriba: la configuración en data/ventas_config.json y las
// cuentas en data/ventas_usuarios.json (contraseñas con PBKDF2, nunca en claro).
const num = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t.replace(/[$,\s]/g, ''))
  return isFinite(n) && n >= 0 ? n : null
}
type Estado = { tipo: 'ok' | 'err'; msg: string }
type Seccion = 'vendedores' | 'usuarios'
/** Correo completo o el usuario corto de las cuentas viejas. Igual que `_USUARIO` en app.py. */
const USUARIO_OK = /^[a-z0-9._+-]{3,64}$|^[a-z0-9._+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/

function Ojo({ abierto }: { abierto: boolean }) {
  return abierto
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.3A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1" /><path d="M6.6 6.6C3.9 8.6 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
}

export function Configuracion({ corte, onSaved }: { corte: Corte; onSaved: (cfg: Config) => void }) {
  const [seccion, setSeccion] = useState<Seccion>('vendedores')
  const [general, setGeneral] = useState(String(corte.meta_mxn))
  const [factor, setFactor] = useState(String(corte.cotizado_x))
  const [dias, setDias] = useState(String(corte.cotizado_dias))
  const [zonas, setZonas] = useState<Record<string, string>>(() => Object.fromEntries(corte.equipos.map((e) => [e.id, corte.metas_zona[e.id] != null ? String(corte.metas_zona[e.id]) : ''])))
  const [asesores, setAsesores] = useState<Record<string, string>>(() => Object.fromEntries(corte.usuarios.map((u) => [u.id, corte.metas[u.id] != null ? String(corte.metas[u.id]) : ''])))
  const [ocultos, setOcultos] = useState<Set<string>>(() => new Set(corte.ocultos || []))
  // '' = como en el CRM; código de zona = ese equipo; '-' = sin equipo.
  const [equipos, setEquipos] = useState<Record<string, string>>(() => Object.fromEntries(corte.usuarios.map((u) => [u.id, u.zona_crm != null && u.zona !== u.zona_crm ? (u.zona || '-') : ''])))
  // Ventas reales: nombre en la app de comisiones -> slug del CRM ('' = sin asesor). Solo lo fijado a mano; lo demás es automático.
  const [comMap, setComMap] = useState<Record<string, string>>(() => ({ ...(corte.comisiones_map || {}) }))
  const [estado, setEstado] = useState<Estado | null>(null)
  const [guardando, setGuardando] = useState(false)
  const usuarios = useMemo(() => [...corte.usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre)), [corte])
  // Cuentas de la plataforma: se cargan del servidor; la contraseña solo viaja cuando se escribe.
  const [accesos, setAccesos] = useState<Acceso[] | null>(null)
  const [accesosDirty, setAccesosDirty] = useState(false)
  useEffect(() => { let vivo = true; cargarAccesos().then((a) => { if (vivo) setAccesos(a.map((x) => ({ ...x, activo: x.activo !== false }))) }); return () => { vivo = false } }, [])
  const setAcceso = (i: number, cambio: Partial<Acceso>) => { setAccesos((a) => (a || []).map((x, j) => (j === i ? { ...x, ...cambio } : x))); setAccesosDirty(true) }
  const quitarAcceso = (i: number) => { setAccesos((a) => (a || []).filter((_, j) => j !== i)); setAccesosDirty(true) }
  const agregarAcceso = (rol: Acceso['rol']) => {
    setAccesos((a) => [...(a || []), { id: '', usuario: '', nombre: '', rol, activo: true, password: '', nuevo: true }])
    setAccesosDirty(true); setSeccion('usuarios')
  }
  const validarAccesos = (): string | null => {
    for (const a of accesos || []) {
      if (!USUARIO_OK.test(a.usuario)) return `«${a.usuario || '(vacío)'}» no sirve para entrar: escribe un correo completo, o un usuario corto de 3 a 64 letras minúsculas, números, punto o guion.`
      if (a.rol === 'asesor' && !a.id) return `La cuenta ${a.usuario} debe estar ligada a un vendedor: sin eso no sabemos qué tablero mostrarle.`
      if (a.nuevo && !a.password) return `Falta la contraseña de la cuenta nueva ${a.usuario}.`
      if (a.password && a.password.length < 6) return `La contraseña de ${a.usuario} debe tener al menos 6 caracteres.`
    }
    const repetidos = (accesos || []).map((a) => a.usuario).filter((u, i, arr) => arr.indexOf(u) !== i)
    if (repetidos.length) return `Ese correo ya tiene cuenta: ${repetidos[0]}`
    return null
  }

  /** Config con lo escrito, o el mensaje del primer error. */
  const armar = (): Config | string => {
    const g = num(general)
    if (g == null || g <= 0) return 'La meta general debe ser un número mayor que cero.'
    const x = num(factor)
    if (x == null || x <= 0) return 'El factor del cotizado debe ser mayor que cero.'
    const d = num(dias)
    if (d == null || d < 1) return 'Los días de vigencia deben ser al menos 1.'
    const metas_zona: Record<string, number> = {}
    for (const [k, v] of Object.entries(zonas)) { if (v.trim() === '') continue; const n = num(v); if (n == null) return `La meta de ${zonaNombre(corte, k)} no es un número.`; metas_zona[k] = n }
    const metas: Record<string, number> = {}
    for (const [k, v] of Object.entries(asesores)) { if (v.trim() === '') continue; const n = num(v); if (n == null) return `La meta de ${corte.usuarios.find((u) => u.id === k)?.nombre || k} no es un número.`; metas[k] = n }
    const eq: Record<string, string> = {}
    for (const [k, v] of Object.entries(equipos)) if (v) eq[k] = v
    return { meta_mxn: g, cotizado_x: x, cotizado_dias: Math.round(d), metas_zona, metas, ocultos: [...ocultos], equipos: eq, comisiones_map: comMap }
  }
  const borrador = armar()
  const cfg = typeof borrador === 'string' ? null : borrador
  const zonaEfectiva = (u: Usuario) => { const ov = equipos[u.id]; return ov === '' ? (u.zona_crm ?? u.zona) : ov === '-' ? '' : ov }
  const efectiva = (u: Usuario) => (cfg ? cfg.metas[u.id] ?? cfg.metas_zona[zonaEfectiva(u)] ?? cfg.meta_mxn : metaDe(corte, u))
  const efectivaZona = (z: string) => (cfg ? cfg.metas_zona[z] ?? cfg.meta_mxn : corte.metas_zona[z] ?? corte.meta_mxn)
  const toggleOjo = (id: string) => setOcultos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const activos = usuarios.length - ocultos.size
  const conCuenta = new Set((accesos || []).filter((a) => a.rol === 'asesor' && a.activo !== false).map((a) => a.id))
  const cuentasActivas = (accesos || []).filter((a) => a.activo !== false).length

  const guardar = async () => {
    if (!cfg) { setEstado({ tipo: 'err', msg: borrador as string }); setSeccion('vendedores'); return }
    const errAcc = accesosDirty ? validarAccesos() : null
    if (errAcc) { setEstado({ tipo: 'err', msg: errAcc }); setSeccion('usuarios'); return }
    setGuardando(true); setEstado(null)
    try {
      const saved = await guardarConfig(cfg)
      onSaved(saved)
      let msg = 'Guardado. Metas, equipos y vendedores activos ya aplican.'
      if (accesosDirty && accesos) {
        const nuevas = accesos.filter((a) => a.nuevo).length
        const guardadas = await guardarAccesos(accesos.map((a) => ({ id: a.id, usuario: a.usuario, rol: a.rol, activo: a.activo !== false, nombre: a.nombre || corte.usuarios.find((u) => u.id === a.id)?.nombre || a.usuario, password: a.password || undefined })))
        setAccesos(guardadas.map((a) => ({ ...a, activo: a.activo !== false, password: '' }))); setAccesosDirty(false)
        msg = nuevas > 0
          ? `Guardado. ${nuevas === 1 ? 'La cuenta nueva ya puede entrar' : `Las ${nuevas} cuentas nuevas ya pueden entrar`} con su correo y su contraseña.`
          : 'Guardado. Metas, equipos, vendedores activos y cuentas ya aplican.'
      }
      setEstado({ tipo: 'ok', msg })
    } catch (e) {
      setEstado({ tipo: 'err', msg: 'No se pudo guardar: ' + String(e instanceof Error ? e.message : e) })
    } finally { setGuardando(false) }
  }

  return (
    <form className="cfg" onSubmit={(e) => { e.preventDefault(); void guardar() }}>
      <div className="cfg-top">
        <button type="submit" className="btn on" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
        <span className="pill sm" role="group" aria-label="Qué se configura">
          <button type="button" className={seccion === 'vendedores' ? 'on' : ''} aria-pressed={seccion === 'vendedores'} onClick={() => setSeccion('vendedores')}>Vendedores</button>
          <button type="button" className={seccion === 'usuarios' ? 'on' : ''} aria-pressed={seccion === 'usuarios'} onClick={() => setSeccion('usuarios')}>Usuarios de la plataforma</button>
        </span>
        {estado && <span className={'cfg-msg ' + estado.tipo} role="status">{estado.msg}</span>}
        {!estado && typeof borrador === 'string' && <span className="cfg-msg err" role="status">{borrador}</span>}
        <span className="spacer" />
        <span className="small muted">{seccion === 'vendedores'
          ? `${fmtN(activos)} de ${fmtN(usuarios.length)} vendedores activos`
          : `${fmtN(cuentasActivas)} cuenta${cuentasActivas === 1 ? '' : 's'} activa${cuentasActivas === 1 ? '' : 's'}`} · se guarda en el servidor y aplica para todos.</span>
      </div>

      {seccion === 'vendedores' ? (
        <>
          <div className="two">
            <div className="panel">
              <h3>Meta general y pipeline<Info termino="Meta" /></h3>
              <label className="fld"><span>Meta mensual de venta por vendedor (MXN)</span><input className="inp" inputMode="numeric" value={general} onChange={(e) => setGeneral(e.target.value)} /></label>
              <label className="fld"><span>Cotizado sano = factor × meta mensual<Info termino="Pipeline 10×" /></span><input className="inp" inputMode="numeric" value={factor} onChange={(e) => setFactor(e.target.value)} /></label>
              <label className="fld"><span>Días de vigencia de una cotización<Info termino="Antigüedad" /></span><input className="inp" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} /></label>
              <div className="small muted">Prioridad: meta del vendedor → meta de su zona → meta general. Deja en blanco para heredar. Las metas son mensuales; el tablero las prorratea al rango elegido.</div>
            </div>
            <div className="panel">
              <h3>Meta por zona</h3>
              <table className="ftable" aria-label="Meta mensual por zona">
                <thead><tr><th scope="col">Zona</th><th scope="col">Meta mensual (MXN)</th><th scope="col" className="num">Efectiva</th></tr></thead>
                <tbody>
                  {corte.equipos.map((e) => (
                    <tr key={e.id}>
                      <td>{e.nombre}</td>
                      <td><input className="inp" inputMode="numeric" placeholder="hereda la general" aria-label={'Meta de ' + e.nombre} value={zonas[e.id] || ''} onChange={(ev) => setZonas({ ...zonas, [e.id]: ev.target.value })} /></td>
                      <td className="num">{fmtMoney0(efectivaZona(e.id))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 14 }}>
            <h3>Vendedores · {fmtN(activos)} activos de {fmtN(usuarios.length)}</h3>
            <div className="small muted" style={{ marginBottom: 10 }}>Estos son los vendedores que traen Kommo y HubSpot. Ojo cerrado = desactivado: no sale en el menú de propietarios, en la tabla, en el ranking ni en los perfiles, y sus leads y actividades no cuentan en las cifras del equipo. La entrada de leads de Kommo no cambia. El equipo manda sobre el que trae el CRM. Para que un vendedor pueda ENTRAR al tablero hay que crearle una cuenta en «Usuarios de la plataforma».</div>
            <div className="tblwrap" style={{ boxShadow: 'none' }}>
              <table className="ftable" aria-label="Vendedores del CRM">
                <thead><tr><th scope="col">Activo</th><th scope="col">Vendedor</th><th scope="col">Rol en Kommo</th><th scope="col">Equipo de ventas</th><th scope="col">Meta propia (MXN)</th><th scope="col" className="num">Meta efectiva</th><th scope="col">Cuenta</th></tr></thead>
                <tbody>
                  {usuarios.map((u) => {
                    const oculto = ocultos.has(u.id), zcrm = u.zona_crm ?? u.zona
                    return (
                      <tr key={u.id} className={oculto ? 'oculto' : ''}>
                        <td><button type="button" className="eye" aria-pressed={!oculto} aria-label={(oculto ? 'Mostrar a ' : 'Ocultar a ') + u.nombre + ' en el tablero'} title={oculto ? 'Desactivado: clic para mostrarlo' : 'Activo: clic para ocultarlo'} onClick={() => toggleOjo(u.id)}><Ojo abierto={!oculto} /></button></td>
                        <td><span className="nm">{u.nombre}</span><div className="small muted">{u.crm.map((c) => (c === 'hubspot' ? 'HubSpot' : 'Kommo')).join(' + ')}{oculto ? ' · desactivado' : ''}</div></td>
                        <td>{u.rol ? rolNombre(u.rol) : <span className="muted">—</span>}</td>
                        <td>
                          <select className="sel" aria-label={'Equipo de ' + u.nombre} value={equipos[u.id] || ''} onChange={(ev) => setEquipos({ ...equipos, [u.id]: ev.target.value })}>
                            <option value="">Como en el CRM ({zcrm ? zonaNombre(corte, zcrm) : 'sin equipo'})</option>
                            {corte.equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                            <option value="-">Sin equipo</option>
                          </select>
                        </td>
                        <td><input className="inp" inputMode="numeric" placeholder="hereda" aria-label={'Meta de ' + u.nombre} value={asesores[u.id] || ''} onChange={(ev) => setAsesores({ ...asesores, [u.id]: ev.target.value })} /></td>
                        <td className="num">{fmtMoney0(efectiva(u))}</td>
                        <td>{accesos == null ? <span className="muted small">…</span> : conCuenta.has(u.id)
                          ? <span className="tag">tiene cuenta</span>
                          : <button type="button" className="nbtn" onClick={() => { agregarAcceso('asesor'); setAccesos((a) => (a || []).map((x, j) => (j === (a || []).length - 1 ? { ...x, id: u.id, nombre: u.nombre } : x))) }}>Crear cuenta</button>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {corte.comisiones && (
            <div className="panel" style={{ marginTop: 14 }}>
              <h3>Ventas reales · app de comisiones<Info termino="Ventas reales" /></h3>
              <div className="small muted" style={{ marginBottom: 8 }}>Cada vendedor de la app se cruza solo con el vendedor del CRM por su primer nombre y zona. Aquí se corrige el cruce; «Automático» deja la regla, «Sin asesor» lo saca del tablero. Aplica al guardar.</div>
              <div className="scrollx cfg-com"><table className="ftable" aria-label="Cruce de vendedores de la app de comisiones con vendedores del CRM">
                {/* Anchos fijos: a pantalla ancha las cinco columnas quedaban desperdigadas (Randall 8-sep). */}
                <colgroup>{['26%', '10%', '9%', '33%', '22%'].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                <thead><tr><th scope="col">Vendedor en la app</th><th scope="col">Zona</th><th scope="col" className="num">Ventas</th><th scope="col">Vendedor en el CRM</th><th scope="col">Activo en</th></tr></thead>
                <tbody>
                  {corte.comisiones.vendedores.filter((v) => v.rol === 'vendor').sort((a, b) => a.nombre.localeCompare(b.nombre)).map((v) => {
                    const n = corte.comisiones!.ventas.filter((x) => x.vendedor_id === v.id && !x.cancelada).length
                    const fijo = comMap[v.nombre]
                    // En qué CRM está el vendedor con el que queda cruzado (Randall 7-sep): el fijo, o el automático.
                    const ligado = fijo === undefined ? v.asesor_id : fijo === '' ? null : fijo
                    const uLig = ligado ? corte.usuarios.find((x) => x.id === ligado) : undefined
                    const enCrm = (u: Usuario) => u.crm.map((c) => CRM_LABEL[c]).join(' + ')
                    return (
                      <tr key={v.id}>
                        <td>{v.nombre}</td><td>{v.zona || '—'}</td><td className="num">{fmtN(n)}</td>
                        <td><select className="sel" aria-label={'Vendedor del CRM para ' + v.nombre} value={fijo === undefined ? '' : fijo === '' ? '-' : fijo} onChange={(ev) => { const val = ev.target.value; setComMap((mp) => { const c = { ...mp }; if (val === '') delete c[v.nombre]; else c[v.nombre] = val === '-' ? '' : val; return c }) }}>
                          <option value="">Automático{v.asesor_id ? ` (${(() => { const u = corte.usuarios.find((x) => x.id === v.asesor_id); return u ? `${u.nombre} · ${enCrm(u)}` : v.asesor_id })()})` : ' (sin asesor)'}</option>
                          <option value="-">Sin asesor</option>
                          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {enCrm(u)}</option>)}
                        </select></td>
                        <td>{uLig ? <>{uLig.crm.map((c) => <span key={c} className="tag" style={{ marginRight: 4 }}>{CRM_LABEL[c]}</span>)}{ocultos.has(uLig.id) && <span className="tag alerta" title="Desactivado en Vendedores: no sale en el tablero">desactivado</span>}</> : <span className="muted">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      ) : (
        <div className="panel">
          <h3>Usuarios de la plataforma{accesos ? ` · ${fmtN(accesos.length)}` : ''}</h3>
          <div className="small muted" style={{ marginBottom: 10 }}>
            Quién puede entrar al tablero. Un <b>vendedor</b> entra con su correo y ve solo su propio tablero; un <b>administrador</b> ve todo y puede cambiar esta configuración.
            La contraseña no se muestra nunca: escribe una para crearla o para cambiarla, y deja el campo vacío para conservar la que ya tiene.
            Desactivar una cuenta le quita la entrada sin borrarla ni perder su historial. Las credenciales del servicio siempre entran como administrador, así que nunca te quedas fuera.
          </div>
          {accesos == null ? <div className="muted">Cargando cuentas…</div> : (
            <>
              {accesos.length > 0 && !accesos.some((a) => a.rol === 'admin' && a.activo !== false) && (
                <div className="aviso" style={{ marginBottom: 10 }}>Ninguna cuenta de esta lista es administradora. Se puede guardar así: las credenciales del servicio siguen entrando como administrador. Si quieres que alguien más administre desde su propio correo, créale una cuenta de administrador.</div>
              )}
              <div className="tblwrap" style={{ boxShadow: 'none' }}>
                <table className="ftable" aria-label="Cuentas de la plataforma">
                  <thead><tr><th scope="col">Activa</th><th scope="col">Correo (para entrar)</th><th scope="col">Nombre</th><th scope="col">Rol</th><th scope="col">Vendedor ligado</th><th scope="col">Contraseña</th><th scope="col"><span className="sr-solo">Acciones</span></th></tr></thead>
                  <tbody>
                    {accesos.map((a, i) => {
                      const activa = a.activo !== false
                      return (
                        <tr key={i} className={activa ? '' : 'oculto'}>
                          <td><button type="button" className="eye" aria-pressed={activa} aria-label={(activa ? 'Desactivar la cuenta ' : 'Activar la cuenta ') + (a.usuario || i + 1)} title={activa ? 'Activa: clic para desactivarla' : 'Desactivada: clic para activarla'} onClick={() => setAcceso(i, { activo: !activa })}><Ojo abierto={activa} /></button></td>
                          <td><input className="inp" type="email" autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="nombre@kenetsolar.com" aria-label={'Correo de la cuenta ' + (i + 1)} value={a.usuario} onChange={(e) => setAcceso(i, { usuario: e.target.value.trim().toLowerCase() })} /></td>
                          <td><input className="inp" placeholder="Nombre para mostrar" aria-label={'Nombre de la cuenta ' + (i + 1)} value={a.nombre} onChange={(e) => setAcceso(i, { nombre: e.target.value })} /></td>
                          <td><select className="sel" aria-label={'Rol de la cuenta ' + (i + 1)} value={a.rol} onChange={(e) => setAcceso(i, { rol: e.target.value as Acceso['rol'], id: e.target.value === 'admin' ? '' : a.id })}><option value="asesor">Vendedor</option><option value="admin">Administrador</option></select></td>
                          <td>{a.rol === 'asesor'
                            ? <select className="sel" aria-label={'Vendedor ligado a la cuenta ' + (i + 1)} value={a.id} onChange={(e) => setAcceso(i, { id: e.target.value, nombre: corte.usuarios.find((u) => u.id === e.target.value)?.nombre || a.nombre })}><option value="">— elige —</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
                            : <span className="muted small">ve todo el tablero</span>}</td>
                          <td><input className="inp" type="password" autoComplete="new-password" placeholder={a.nuevo ? 'mínimo 6 caracteres' : 'sin cambio'} aria-label={'Contraseña de la cuenta ' + (i + 1)} value={a.password || ''} onChange={(e) => setAcceso(i, { password: e.target.value })} /></td>
                          <td><button type="button" className="ib" aria-label={'Borrar la cuenta ' + (a.usuario || i + 1)} title="Borrar la cuenta" onClick={() => quitarAcceso(i)}>×</button></td>
                        </tr>
                      )
                    })}
                    {!accesos.length && <tr><td colSpan={7} className="muted">Todavía no hay ninguna cuenta. Crea la primera aquí abajo.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn" onClick={() => agregarAcceso('asesor')}>+ Cuenta de vendedor</button>
                <button type="button" className="btn ghost" onClick={() => agregarAcceso('admin')}>+ Cuenta de administrador</button>
              </div>
            </>
          )}
        </div>
      )}
    </form>
  )
}
