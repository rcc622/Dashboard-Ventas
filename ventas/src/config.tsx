import { useMemo, useState } from 'react'
import type { Config, Corte, Usuario } from './types'
import { guardarConfig } from './data'
import { fmtMoney0, metaDe, zonaNombre } from './metrics'
import { Info } from './components'

// Página de Configuración (pedido de Randall 4-sep): metas en pesos general, por zona y
// por asesor, más el factor y la vigencia del cotizado. Se guarda en el servidor
// (data/ventas_config.json) y aplica para todos; la prioridad es asesor → zona → general.
const num = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t.replace(/[$,\s]/g, ''))
  return isFinite(n) && n >= 0 ? n : null
}
type Estado = { tipo: 'ok' | 'err'; msg: string }

export function Configuracion({ corte, onSaved }: { corte: Corte; onSaved: (cfg: Config) => void }) {
  const [general, setGeneral] = useState(String(corte.meta_mxn))
  const [factor, setFactor] = useState(String(corte.cotizado_x))
  const [dias, setDias] = useState(String(corte.cotizado_dias))
  const [zonas, setZonas] = useState<Record<string, string>>(() => Object.fromEntries(corte.equipos.map((e) => [e.id, corte.metas_zona[e.id] != null ? String(corte.metas_zona[e.id]) : ''])))
  const [asesores, setAsesores] = useState<Record<string, string>>(() => Object.fromEntries(corte.usuarios.map((u) => [u.id, corte.metas[u.id] != null ? String(corte.metas[u.id]) : ''])))
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
    return { meta_mxn: g, cotizado_x: x, cotizado_dias: Math.round(d), metas_zona, metas }
  }
  const borrador = armar()
  const cfg = typeof borrador === 'string' ? null : borrador
  const efectiva = (u: Usuario) => (cfg ? cfg.metas[u.id] ?? cfg.metas_zona[u.zona] ?? cfg.meta_mxn : metaDe(corte, u))
  const efectivaZona = (z: string) => (cfg ? cfg.metas_zona[z] ?? cfg.meta_mxn : corte.metas_zona[z] ?? corte.meta_mxn)

  const guardar = async () => {
    if (!cfg) { setEstado({ tipo: 'err', msg: borrador as string }); return }
    setGuardando(true); setEstado(null)
    try {
      const saved = await guardarConfig(cfg)
      onSaved(saved)
      setEstado({ tipo: 'ok', msg: 'Guardado. Las metas ya aplican en todo el tablero.' })
    } catch (e) {
      setEstado({ tipo: 'err', msg: 'No se pudo guardar: ' + String(e) })
    } finally { setGuardando(false) }
  }

  return (
    <form className="cfg" onSubmit={(e) => { e.preventDefault(); void guardar() }}>
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
        <h3>Meta por asesor · {usuarios.length}</h3>
        <div className="tblwrap" style={{ boxShadow: 'none' }}>
          <table className="ftable">
            <thead><tr><th>Asesor</th><th>Zona</th><th>Meta propia (MXN)</th><th className="num">Efectiva</th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre}</td>
                  <td>{zonaNombre(corte, u.zona)}</td>
                  <td><input className="inp" inputMode="numeric" placeholder="hereda" aria-label={'Meta de ' + u.nombre} value={asesores[u.id] || ''} onChange={(ev) => setAsesores({ ...asesores, [u.id]: ev.target.value })} /></td>
                  <td className="num">{fmtMoney0(efectiva(u))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="cfg-foot">
        <button type="submit" className="btn on" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        {estado && <span className={'cfg-msg ' + estado.tipo} role="status">{estado.msg}</span>}
        {!estado && typeof borrador === 'string' && <span className="cfg-msg err" role="status">{borrador}</span>}
        <span className="small muted">Se guarda en el servidor y aplica para todos los que abran el tablero.</span>
      </div>
    </form>
  )
}
