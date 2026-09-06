import { useRef, useState } from 'react'
import type { Rango } from './types'
import { PRESETS, etiquetaRango, fmtFecha, inicioDia, preset, rangoManual, sumar, type Preset } from './metrics'
import { useEscape, useFocoDialogo, useOutside } from './components'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DOW = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const deIso = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null }
const mesDe = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

interface Props { rango: Rango; presetActivo: Preset | null; onApply: (r: Rango, p: Preset | null) => void; onClose: () => void }

/** Calcado del selector de fechas de Meta Ads Manager (pedido de Randall 5-sep), sin «Usados
 *  recientemente»: periodos a la izquierda como radios, dos meses con selector de mes y año, y
 *  abajo el periodo con las dos fechas escribibles. Primer clic = inicio, segundo = fin; los días
 *  futuros están apagados. Escape cancela. */
export function DateRangePicker({ rango, presetActivo, onApply, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, onClose)
  useEscape(onClose)
  useFocoDialogo(ref)
  const hoy = inicioDia(new Date())
  const [a, setA] = useState<Date | null>(new Date(rango.ini * 1000))
  const [b, setB] = useState<Date | null>(sumar(new Date(rango.fin * 1000), -1))
  const [pre, setPre] = useState<Preset | null>(presetActivo)
  const [vista, setVista] = useState(() => mesDe(new Date(rango.ini * 1000)))

  const clickDia = (d: Date) => {
    setPre(null)
    if (!a || (a && b)) { setA(d); setB(null) } else { setB(d) }
  }
  const clickPreset = (p: Preset) => {
    const r = preset(p)
    setPre(p); setA(new Date(r.ini * 1000)); setB(sumar(new Date(r.fin * 1000), -1)); setVista(mesDe(new Date(r.ini * 1000)))
  }
  // Fechas escritas a mano (o con el calendario nativo del campo): no se aceptan futuras.
  const manual = (cual: 'a' | 'b', s: string) => {
    const d = deIso(s)
    if (!d || d > hoy) return
    setPre(null)
    if (cual === 'a') { setA(d); if (b && d > b) setB(null) } else { setB(d); if (a && d < a) setA(d) }
    setVista(mesDe(d))
  }
  const aplicar = () => {
    if (!a) return
    onApply(pre ? preset(pre) : rangoManual(a, b || a), pre)
  }
  const lo = a && b ? (a <= b ? a : b) : a, hi = a && b ? (a <= b ? b : a) : null
  const previa = lo ? etiquetaRango(pre ? PRESETS.find((p) => p.id === pre)?.label ?? null : null, Math.floor(lo.getTime() / 1000), Math.floor(sumar(hi || lo, 1).getTime() / 1000)) : '—'

  return (
    <div className="drp" ref={ref} role="dialog" aria-modal="true" aria-label="Rango de fechas">
      <div className="drp-presets" role="radiogroup" aria-label="Periodo">
        {PRESETS.map((p) => <button type="button" key={p.id} role="radio" aria-checked={pre === p.id} className={pre === p.id ? 'on' : ''} onClick={() => clickPreset(p.id)}>{p.label}</button>)}
        <button type="button" role="radio" aria-checked={pre === null} className={pre === null ? 'on' : ''} onClick={() => setPre(null)}>Personalizado</button>
      </div>
      <div className="drp-cal">
        <div className="drp-months">
          <button type="button" className="drp-arrow" aria-label="Mes anterior" onClick={() => setVista(new Date(vista.getFullYear(), vista.getMonth() - 1, 1))}>‹</button>
          <Mes ini={vista} lo={lo} hi={hi} hoy={hoy} onDia={clickDia} onVista={setVista} />
          <Mes ini={new Date(vista.getFullYear(), vista.getMonth() + 1, 1)} lo={lo} hi={hi} hoy={hoy} onDia={clickDia} onVista={(d) => setVista(new Date(d.getFullYear(), d.getMonth() - 1, 1))} />
          <button type="button" className="drp-arrow" aria-label="Mes siguiente" onClick={() => setVista(new Date(vista.getFullYear(), vista.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="drp-manual">
          <select className="sel" aria-label="Periodo" value={pre ?? ''} onChange={(e) => (e.target.value ? clickPreset(e.target.value as Preset) : setPre(null))}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            <option value="">Personalizado</option>
          </select>
          <input className="inp" type="date" aria-label="Desde" value={lo ? iso(lo) : ''} max={iso(hoy)} onChange={(e) => manual('a', e.target.value)} />
          <span aria-hidden="true">–</span>
          <input className="inp" type="date" aria-label="Hasta" value={hi ? iso(hi) : lo ? iso(lo) : ''} max={iso(hoy)} onChange={(e) => manual('b', e.target.value)} />
        </div>
        <div className="drp-foot">
          <span className="prev" aria-live="polite">{previa}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn on" onClick={aplicar} disabled={!a}>Actualizar</button>
          </span>
        </div>
      </div>
    </div>
  )
}

function Mes({ ini, lo, hi, hoy, onDia, onVista }: { ini: Date; lo: Date | null; hi: Date | null; hoy: Date; onDia: (d: Date) => void; onVista: (d: Date) => void }) {
  const primero = (ini.getDay() + 6) % 7
  const dias = new Date(ini.getFullYear(), ini.getMonth() + 1, 0).getDate()
  const celdas: (Date | null)[] = [...Array(primero).fill(null), ...Array.from({ length: dias }, (_, i) => new Date(ini.getFullYear(), ini.getMonth(), i + 1))]
  const t = (d: Date) => inicioDia(d).getTime()
  const cls = (d: Date) => {
    const x = t(d)
    if (x > hoy.getTime()) return 'd off'
    if (lo && x === t(lo)) return 'd edge'
    if (hi && x === t(hi)) return 'd edge'
    if (lo && hi && x > t(lo) && x < t(hi)) return 'd in'
    return 'd'
  }
  const anios = Array.from({ length: hoy.getFullYear() - 2024 + 1 }, (_, i) => 2024 + i)
  return (
    <div className="mon">
      <div className="msel">
        <select aria-label="Mes" value={ini.getMonth()} onChange={(e) => onVista(new Date(ini.getFullYear(), Number(e.target.value), 1))}>{MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
        <select aria-label="Año" value={ini.getFullYear()} onChange={(e) => onVista(new Date(Number(e.target.value), ini.getMonth(), 1))}>{(anios.includes(ini.getFullYear()) ? anios : [...anios, ini.getFullYear()]).map((y) => <option key={y} value={y}>{y}</option>)}</select>
      </div>
      <div className="grid">
        {DOW.map((d) => <div className="dow" key={d} aria-hidden="true">{d}</div>)}
        {celdas.map((d, i) => d ? <button type="button" key={i} className={cls(d)} disabled={t(d) > hoy.getTime()} aria-label={fmtFecha(d)} aria-pressed={cls(d) === 'd edge' || cls(d) === 'd in'} onClick={() => onDia(d)}>{d.getDate()}</button> : <span key={i} />)}
      </div>
    </div>
  )
}
