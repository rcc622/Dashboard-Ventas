import { useEffect, useRef, useState } from 'react'
import type { Corte } from './types'
import { estadoCorte, pedirRefresco, type EstadoCorte } from './data'
import { fmtFecha, fmtHora } from './metrics'

// «Actualizado: 7 sep 2026, 09:12 · hace 2 h» y el botón «Actualizar» (Randall 7-sep). El botón le pide al
// servidor que regenere el corte (POST /ventas/refrescar, solo admin) y aquí se sondea /ventas/estado.json
// cada 5 s hasta que el archivo cambie; entonces se vuelve a cargar el corte. Tarda unos 4 minutos.
type Fase = 'quieto' | 'corriendo' | 'aviso'
const relativo = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 1) return 'hace menos de un minuto'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 48) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}
export function Actualizacion({ corte, fuentes, esAdmin, onRecargar }: { corte: Corte; fuentes: string; esAdmin: boolean; onRecargar: () => void }) {
  const gen = new Date(corte.generado), genMs = gen.getTime()
  const [fase, setFase] = useState<Fase>('quieto')
  const [msg, setMsg] = useState<string | null>(null)
  const [proximo, setProximo] = useState<string | null>(null)
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => { const t = window.setInterval(() => setAhora(Date.now()), 60000); return () => window.clearInterval(t) }, [])
  // Línea base = la fecha del archivo al cargar; se recarga cuando cambia (por el botón o por el refresh automático).
  // No se compara contra `corte.generado`: un archivo copiado o restaurado tiene otra fecha y eso recargaba en bucle.
  const base = useRef<string | null>(null)
  // Desde cuándo se está esperando: si el servidor se reinició a media corrida (un deploy, 11-sep) el
  // botón no debe quedarse en «Actualizando…» para siempre.
  const desde = useRef(0)
  useEffect(() => {
    let vivo = true, t: number | undefined
    const paso = async () => {
      if (fase === 'corriendo' && desde.current && Date.now() - desde.current > 12 * 60000) {
        setFase('aviso'); setMsg('Tardó más de 12 minutos. Recarga la página; si sigue igual, el refresh falló.'); return
      }
      let e: EstadoCorte
      try { e = await estadoCorte() } catch { if (vivo) t = window.setTimeout(paso, 30000); return }
      if (!vivo) return
      if (e.proximo) setProximo(e.proximo)
      if (base.current === null) base.current = e.corte_mtime
      const cambio = !!e.corte_mtime && !!base.current && e.corte_mtime !== base.current
      if (e.corriendo) { setFase('corriendo'); t = window.setTimeout(paso, 5000); return }
      if (cambio) { setMsg(null); onRecargar(); return }
      if (fase === 'corriendo') { setFase('aviso'); setMsg(e.ok === false ? 'No se pudo actualizar; se muestra el corte anterior.' : 'Terminó sin cambios en el corte.') }
      t = window.setTimeout(paso, 60000)
    }
    paso()
    return () => { vivo = false; window.clearTimeout(t) }
  }, [fase, onRecargar])
  const pedir = async () => {
    setMsg(null)
    const r = await pedirRefresco()
    if (r.ok || r.corriendo) { desde.current = Date.now(); setFase('corriendo') }
    else setMsg(r.error || 'No se pudo pedir la actualización.')
  }
  const viejo = !isNaN(genMs) && ahora - genMs > 8 * 36e5
  const titulo = [fuentes ? `Fuentes: ${fuentes}.` : '', 'El corte se regenera solo cada 6 horas.', proximo ? `Siguiente automático: ${fmtHora(new Date(proximo).getTime() / 1000)}.` : ''].filter(Boolean).join(' ')
  return (
    <span className="actualizado" role="status" aria-live="polite" title={titulo}>
      <span>Actualizado: <b>{isNaN(genMs) ? corte.generado : `${fmtFecha(gen)}, ${fmtHora(genMs / 1000)}`}</b> <span className={viejo ? 'stale' : 'muted'}>{isNaN(genMs) ? '' : relativo(ahora - genMs)}</span></span>
      {esAdmin && <button type="button" className="btn sm" disabled={fase === 'corriendo'} onClick={pedir} title="Vuelve a leer Kommo, HubSpot y la app de comisiones ahora (tarda unos 4 minutos)">{fase === 'corriendo' ? 'Actualizando… tarda unos 4 min' : 'Actualizar'}</button>}
      {msg && <span className="small stale">{msg}</span>}
    </span>
  )
}
