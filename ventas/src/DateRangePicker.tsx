import { useRef, useState } from 'react'
import type { Rango } from './types'
import { PRESETS, fmtFecha, inicioDia, preset, rangoManual, sumar, type Preset } from './metrics'
import { useEscape, useFocoDialogo, useOutside } from './components'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DOW = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

interface Props { rango: Rango; presetActivo: Preset | null; onApply: (r: Rango, p: Preset | null) => void; onClose: () => void }

/** Presets a la izquierda, dos meses a la derecha. Primer click = inicio,
 *  segundo = fin; el preset activo se pinta en negro. Escape cancela. */
export function DateRangePicker({ rango, presetActivo, onApply, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, onClose)
  useEscape(onClose)
  useFocoDialogo(ref)
  const [a, setA] = useState<Date | null>(new Date(rango.ini * 1000))
  const [b, setB] = useState<Date | null>(sumar(new Date(rango.fin * 1000), -1))
  const [pre, setPre] = useState<Preset | null>(presetActivo)
  const [vista, setVista] = useState(() => { const d = new Date(rango.ini * 1000); return new Date(d.getFullYear(), d.getMonth(), 1) })

  const clickDia = (d: Date) => {
    setPre(null)
    if (!a || (a && b)) { setA(d); setB(null) } else { setB(d) }
  }
  const clickPreset = (p: Preset) => {
    const r = preset(p)
    setPre(p); setA(new Date(r.ini * 1000)); setB(sumar(new Date(r.fin * 1000), -1))
    const d = new Date(r.ini * 1000); setVista(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  const aplicar = () => {
    if (!a) return
    const fin = b || a
    const r = rangoManual(a, fin)
    onApply(pre ? { ...r, label: PRESETS.find((x) => x.id === pre)!.label } : r, pre)
  }
  const lo = a && b ? (a <= b ? a : b) : a, hi = a && b ? (a <= b ? b : a) : null

  return (
    <div className="drp" ref={ref} role="dialog" aria-modal="true" aria-label="Rango de fechas">
      <div className="drp-presets">
        <div className="t">Predeterminados</div>
        {PRESETS.map((p) => <button type="button" key={p.id} className={pre === p.id ? 'on' : ''} aria-pressed={pre === p.id} onClick={() => clickPreset(p.id)}>{p.label}</button>)}
      </div>
      <div className="drp-cal">
        <div className="drp-nav">
          <button type="button" aria-label="Meses anteriores" onClick={() => setVista(new Date(vista.getFullYear(), vista.getMonth() - 1, 1))}>‹</button>
          <button type="button" aria-label="Meses siguientes" onClick={() => setVista(new Date(vista.getFullYear(), vista.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="drp-months">
          <Mes ini={vista} lo={lo} hi={hi} onDia={clickDia} />
          <Mes ini={new Date(vista.getFullYear(), vista.getMonth() + 1, 1)} lo={lo} hi={hi} onDia={clickDia} />
        </div>
        <div className="drp-foot">
          <span className="prev" aria-live="polite">{lo ? fmtFecha(lo) : '—'} → {hi ? fmtFecha(hi) : (lo ? fmtFecha(lo) : '—')}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn on" onClick={aplicar} disabled={!a}>Aplicar</button>
          </span>
        </div>
      </div>
    </div>
  )
}

function Mes({ ini, lo, hi, onDia }: { ini: Date; lo: Date | null; hi: Date | null; onDia: (d: Date) => void }) {
  const primero = (ini.getDay() + 6) % 7
  const dias = new Date(ini.getFullYear(), ini.getMonth() + 1, 0).getDate()
  const celdas: (Date | null)[] = [...Array(primero).fill(null), ...Array.from({ length: dias }, (_, i) => new Date(ini.getFullYear(), ini.getMonth(), i + 1))]
  const t = (d: Date) => inicioDia(d).getTime()
  const cls = (d: Date) => {
    const x = t(d)
    if (lo && x === t(lo)) return 'd edge'
    if (hi && x === t(hi)) return 'd edge'
    if (lo && hi && x > t(lo) && x < t(hi)) return 'd in'
    return 'd'
  }
  return (
    <div className="mon">
      <div className="mt">{MESES[ini.getMonth()]} {ini.getFullYear()}</div>
      <div className="grid">
        {DOW.map((d) => <div className="dow" key={d} aria-hidden="true">{d}</div>)}
        {celdas.map((d, i) => d ? <button type="button" key={i} className={cls(d)} aria-label={fmtFecha(d)} aria-pressed={cls(d) !== 'd'} onClick={() => onDia(d)}>{d.getDate()}</button> : <span key={i} />)}
      </div>
    </div>
  )
}
