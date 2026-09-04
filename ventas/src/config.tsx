import { useMemo, useState } from 'react'
import type { Config, Corte, Usuario } from './types'
import { guardarConfig } from './data'
import { fmtMoney0, fmtN, metaDe, zonaNombre } from './metrics'
import { Info } from './components'

// Página de Configuración (pedidos de Randall 4-sep): metas en pesos general, por zona y
// por asesor, factor y vigencia del cotizado, y por asesor un ojo para activarlo o
// desactivarlo en todo el tablero más su equipo de ventas. Se guarda en el servidor
// (data/ventas_config.json) y aplica para todos; la prioridad de metas es asesor → zona → general.
const num = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t.replace(/[$,\s]/g, ''))
  return isFinite(n) && n >= 0 ? n : null
}
type Estado = { tipo: 'ok' | 'err'; msg: string }

function Ojo({ abierto }: { abierto: boolean }) {
  return abierto
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.3A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1" /><path d="M6.6 6.6C3.9 8.6 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
}

export function Configuracion({ corte, onSaved }: { corte: Corte; onSaved: (cfg: Config) => void }) {
  const [general, setGeneral] = useState(String(corte.meta_mxn))
  const [factor, setFactor] = useState(String(corte.cotizado_x))
  const [dias, setDias] = useState(String(corte.cotizado_dias))
  const [zonas, setZonas] = useState<Record<string, string>>(() => Object.fromEntries(corte.equipos.map((e) => [e.id, corte.metas_zona[e.id] != null ? String(corte.metas_zona[e.id]) : ''])))
  const [asesores, setAsesores] = useState<Record<string, string>>(() => Object.fromEntries(corte.usuarios.map((u) => [u.id, corte.metas[u.id] != null ? String(corte.metas[u.id]) : ''])))
  const [ocultos, setOcultos] = useState<Set<string>>(() => new Set(corte.ocultos || []))
  // '' = como en el CRM; código de zona = ese equipo; '-' = sin equipo.
  const [equipos, setEquipos] = useState<Record<string, string>>(() => Object.fromEntries(corte.usuarios.map((u) => [u.id, u.zona_crm != null && u.zona !== u.zona_crm ? (u.zona || '-') : ''])))
  const [estado, setEstado] = useState<Estado | null>(null)
  const [guardando, setGuardando] = useState(false)
  const usuarios = useMemo(() => [...corte.usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre)), [corte])

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
    return { meta_mxn: g, cotizado_x: x, cotizado_dias: Math.round(d), metas_zona, metas, ocultos: [...ocultos], equipos: eq }
  }
  const borrador = armar()
  const cfg = typeof borrador === 'string' ? null : borrador
  const zonaEfectiva = (u: Usuario) => { const ov = equipos[u.id]; return ov === '' ? (u.zona_crm ?? u.zona) : ov === '-' ? '' : ov }
  const efectiva = (u: Usuario) => (cfg ? cfg.metas[u.id] ?? cfg.metas_zona[zonaEfectiva(u)] ?? cfg.meta_mxn : metaDe(corte, u))
  const efectivaZona = (z: string) => (cfg ? cfg.metas_zona[z] ?? cfg.meta_mxn : corte.metas_zona[z] ?? corte.meta_mxn)
  const toggleOjo = (id: string) => setOcultos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const activos = usuarios.length - ocultos.size

  const guardar = async () => {
    if (!cfg) { setEstado({ tipo: 'err', msg: borrador as string }); return }
    setGuardando(true); setEstado(null)
    try {
      const saved = await guardarConfig(cfg)
      onSaved(saved)
      setEstado({ tipo: 'ok', msg: 'Guardado. Metas, equipos y asesores activos ya aplican en todo el tablero.' })
    } catch (e) {
      setEstado({ tipo: 'err', msg: 'No se pudo guardar: ' + String(e) })
    } finally { setGuardando(false) }
  }

  return (
    <form className="cfg" onSubmit={(e) => { e.preventDefault(); void guardar() }}>
      <div className="cfg-top">
        <button type="submit" className="btn on" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
        {estado && <span className={'cfg-msg ' + estado.tipo} role="status">{estado.msg}</span>}
        {!estado && typeof borrador === 'string' && <span className="cfg-msg err" role="status">{borrador}</span>}
        <span className="spacer" />
        <span className="small muted">{fmtN(activos)} de {fmtN(usuarios.length)} asesores activos · se guarda en el servidor y aplica para todos.</span>
      </div>
      <div className="two">
        <div className="panel">
          <h3>Meta general y pipeline<Info termino="Meta" /></h3>
          <label className="fld"><span>Meta mensual de venta por asesor (MXN)</span><input className="inp" inputMode="numeric" value={general} onChange={(e) => setGeneral(e.target.value)} /></label>
          <label className="fld"><span>Cotizado sano = factor × meta mensual<Info termino="Pipeline 10×" /></span><input className="inp" inputMode="numeric" value={factor} onChange={(e) => setFactor(e.target.value)} /></label>
          <label className="fld"><span>Días de vigencia de una cotización<Info termino="Antigüedad" /></span><input className="inp" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} /></label>
          <div className="small muted">Prioridad: meta del asesor → meta de su zona → meta general. Deja en blanco para heredar. Las metas son mensuales; el tablero las prorratea al rango elegido.</div>
        </div>
        <div className="panel">
          <h3>Meta por zona</h3>
          <table className="ftable">
            <thead><tr><th>Zona</th><th>Meta mensual (MXN)</th><th className="num">Efectiva</th></tr></thead>
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
        <h3>Asesores · {fmtN(activos)} activos de {fmtN(usuarios.length)}</h3>
        <div className="small muted" style={{ marginBottom: 10 }}>Ojo cerrado = desactivado: no sale en el menú de propietarios, en la tabla, en el ranking ni en los perfiles, y sus leads y actividades no cuentan en las cifras del equipo. La entrada de leads de Kommo no cambia. El equipo manda sobre el que trae el CRM.</div>
        <div className="tblwrap" style={{ boxShadow: 'none' }}>
          <table className="ftable">
            <thead><tr><th>Activo</th><th>Asesor</th><th>Equipo de ventas</th><th>Meta propia (MXN)</th><th className="num">Meta efectiva</th></tr></thead>
            <tbody>
              {usuarios.map((u) => {
                const oculto = ocultos.has(u.id), zcrm = u.zona_crm ?? u.zona
                return (
                  <tr key={u.id} className={oculto ? 'oculto' : ''}>
                    <td><button type="button" className="eye" aria-pressed={!oculto} aria-label={(oculto ? 'Mostrar a ' : 'Ocultar a ') + u.nombre + ' en el tablero'} title={oculto ? 'Desactivado: clic para mostrarlo' : 'Activo: clic para ocultarlo'} onClick={() => toggleOjo(u.id)}><Ojo abierto={!oculto} /></button></td>
                    <td><span className="nm">{u.nombre}</span><div className="small muted">{u.crm.map((c) => (c === 'hubspot' ? 'HubSpot' : 'Kommo')).join(' + ')}{oculto ? ' · desactivado' : ''}</div></td>
                    <td>
                      <select className="sel" aria-label={'Equipo de ' + u.nombre} value={equipos[u.id] || ''} onChange={(ev) => setEquipos({ ...equipos, [u.id]: ev.target.value })}>
                        <option value="">Como en el CRM ({zcrm ? zonaNombre(corte, zcrm) : 'sin equipo'})</option>
                        {corte.equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                        <option value="-">Sin equipo</option>
                      </select>
                    </td>
                    <td><input className="inp" inputMode="numeric" placeholder="hereda" aria-label={'Meta de ' + u.nombre} value={asesores[u.id] || ''} onChange={(ev) => setAsesores({ ...asesores, [u.id]: ev.target.value })} /></td>
                    <td className="num">{fmtMoney0(efectiva(u))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </form>
  )
}
