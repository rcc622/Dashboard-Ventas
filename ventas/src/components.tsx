import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject, type SyntheticEvent } from 'react'
import { fmtN, pct } from './metrics'
import { GLOSARIO, type Termino } from './glosario'

/** Cierra al hacer click fuera del nodo referenciado. */
export function useOutside(ref: RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: globalThis.MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, onOut])
}

/** Escape cierra cualquier flotante. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
}

/** Enter o espacio disparan la acción de un elemento que no es botón nativo. */
export const activar = (fn: (e: SyntheticEvent<HTMLElement>) => void) => (e: KeyboardEvent<HTMLElement>) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e) }
}

export function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="section">
      <button type="button" className="shead" aria-expanded={open} onClick={() => setOpen(!open)}><span>{title}</span><span className="arrow" aria-hidden="true">{open ? '▲' : '▼'}</span></button>
      {open && <div className="sbody">{children}</div>}
    </section>
  )
}

export interface Seg { val: number; cls: string }
/** Barra apilada normalizada: el largo total es total/max (máximo global), los
 *  segmentos reparten ese largo sobre una pista clara. Si recibe onClick es un
 *  control: foco, Enter y espacio abren el detalle igual que el click. */
export function StackedBar({ segs, total, max, onClick, title }: { segs: Seg[]; total: number; max: number; onClick?: (e: SyntheticEvent<HTMLDivElement>) => void; title?: string }) {
  const w = total > 0 && max > 0 ? Math.max(4, Math.min(100, (total / max) * 100)) : 0
  const ctrl = onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: activar(onClick as (e: SyntheticEvent<HTMLElement>) => void), 'aria-label': title } : {}
  return (
    <div className="sbar" title={title} {...ctrl}>
      {total > 0 && <div style={{ width: w + '%', display: 'flex', height: '100%' }}>{segs.map((s, i) => <i key={i} className={s.cls} style={{ width: pct(s.val, total) + '%' }} />)}</div>}
    </div>
  )
}

/** Recuadro «Llamadas hechas» con desglose al pasar el mouse, al enfocar o al hacer click. */
export function LlamadasBar({ total, ok, no }: { total: number; ok: number; no: number }) {
  const [tip, setTip] = useState(false)
  const resumen = `Llamadas hechas: ${fmtN(total)}. Contestadas ${fmtN(ok)} (${pct(ok, total)}%), sin contestar ${fmtN(no)} (${pct(no, total)}%)`
  return (
    <div className="llam-box" tabIndex={0} aria-label={resumen} onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}
      onFocus={() => setTip(true)} onBlur={() => setTip(false)} onClick={() => setTip((t) => !t)}>
      <div className="llam-head"><span>Llamadas hechas</span><span>{fmtN(total)}</span></div>
      <StackedBar segs={[{ val: ok, cls: 'seg-comp' }, { val: no, cls: 'seg-warn' }]} total={total} max={total} />
      <div className="legend"><span><i className="lg-comp" aria-hidden="true" />Contestadas {fmtN(ok)}</span><span><i className="lg-warn" aria-hidden="true" />Sin contestar {fmtN(no)}</span></div>
      {tip && (
        <div className="tip" style={{ left: 0, top: 58 }} aria-hidden="true">
          <div className="r"><span>Contestadas</span><b>{fmtN(ok)}</b><span>{pct(ok, total)}%</span></div>
          <div className="r"><span>Sin contestar</span><b>{fmtN(no)}</b><span>{pct(no, total)}%</span></div>
          <div className="r t"><span>Total</span><b>{fmtN(total)}</b><span>100%</span></div>
        </div>
      )}
    </div>
  )
}

export interface DetRow { label: string; val: number }
/** Detalle de una barra de la tabla: aparece debajo del elemento clickeado. */
export function BarDetailPopup({ anchor, title, total, rows, onClose }: { anchor: DOMRect; title: string; total: number; rows: DetRow[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, onClose)
  useEscape(onClose)
  const W = 300
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - W - 8))
  const top = anchor.bottom + 6 + 220 > window.innerHeight ? Math.max(8, anchor.top - 6 - 200) : anchor.bottom + 6
  return (
    <div className="popup" ref={ref} style={{ left, top, width: W }} role="dialog" aria-label={title}>
      <div className="ph"><span className="nm">{title}</span><button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button></div>
      <div className="pbody detail-rows">
        {rows.map((r) => <div className="r" key={r.label}><span>{r.label}</span><b>{fmtN(r.val)}</b><span className="muted">{pct(r.val, total)}%</span></div>)}
        <div className="r t"><span>Total</span><b>{fmtN(total)}</b><span>100%</span></div>
      </div>
    </div>
  )
}

export interface Parte { val: number; color: string; label: string }
/** Dona SVG de partes con total al centro. Sin partes → anillo de pista. */
export function DonutChart({ partes, total, label, size = 170 }: { partes: Parte[]; total: number; label: string; size?: number }) {
  const r = 42, C = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="donutbox" role="img" aria-label={`${label}: ${partes.map((p) => `${p.label} ${fmtN(p.val)} (${pct(p.val, total)}%)`).join(', ')}`}>
      <svg className="donut-svg" width={size} height={size} viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--track)" strokeWidth="16" />
        {total > 0 && partes.map((p, i) => {
          const len = (p.val / total) * C
          const el = <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 60 60)" />
          acc += len
          return el
        })}
        <text x="60" y="57" className="dcenter" fontSize="20">{fmtN(total)}</text>
        <text x="60" y="72" className="dcenter l">{label.split(' ')[0]}</text>
      </svg>
    </div>
  )
}

/** Medidor de medio círculo con el porcentaje al centro (cumplimiento, tasa de contestación). */
export function Gauge({ pct: p, label, size = 180, color = 'var(--c1)' }: { pct: number | null; label: string; size?: number; color?: string }) {
  const v = p == null ? 0 : Math.max(0, Math.min(100, p))
  const L = Math.PI * 80
  return (
    <div role="img" aria-label={`${label}: ${p == null ? 'sin dato' : Math.round(v) + '%'}`}>
      <svg className="gauge-svg" width={size} height={size * 0.62} viewBox="0 0 200 124">
        <path d="M 20 104 A 80 80 0 0 1 180 104" fill="none" stroke="var(--track)" strokeWidth="18" strokeLinecap="round" />
        {p != null && <path d="M 20 104 A 80 80 0 0 1 180 104" fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" strokeDasharray={`${(v / 100) * L} ${L}`} />}
        <text x="100" y="98" className="gcenter" fontSize="30">{p == null ? '—' : Math.round(v) + '%'}</text>
        <text x="100" y="118" className="gcenter l">{label}</text>
      </svg>
    </div>
  )
}

export function MiniAreaChart({ values, height = 60, color = 'var(--c1)' }: { values: number[]; height?: number; color?: string }) {
  const id = useId().replace(/:/g, '')
  const W = 300, H = height, n = values.length, max = Math.max(1, ...values)
  const pts = values.map((v, i) => [n > 1 ? (i / (n - 1)) * W : W / 2, H - 4 - (v / max) * (H - 10)])
  const line = pts.map((p) => p.join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true" style={{ color }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28" /><stop offset="1" stopColor="currentColor" stopOpacity=".02" /></linearGradient></defs>
      <line x1="0" y1={H - 1} x2={W} y2={H - 1} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export interface BubbleCol { label: string; bubbles: { n: number; cls?: string; title?: string }[] }
export function BubbleChart({ cols }: { cols: BubbleCol[] }) {
  return (
    <>
      <div className="bubbles">
        {cols.map((c) => (
          <div className="bcol" key={c.label}>
            {c.bubbles.map((b, i) => { const s = Math.min(46, 18 + b.n * 3); return <div key={i} className={'bubble ' + (b.cls || '')} style={{ width: s, height: s }} title={b.title} aria-label={`${b.title}: ${b.n}`}>{b.n}</div> })}
          </div>
        ))}
      </div>
      <div className="blabels">{cols.map((c) => <span key={c.label}>{c.label}</span>)}</div>
    </>
  )
}

export interface FunnelStage { nombre: string; n: number; sub?: string }
const RAMPA = ['var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)', 'var(--f5)', 'var(--f6)', 'var(--f6)']
/** Embudo real: trapecios apilados, ancho proporcional a los leads de cada etapa,
 *  rampa de un solo tono (claro → oscuro) y etiqueta a la derecha. */
export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.n))
  const w = (n: number) => Math.max(14, (n / max) * 100)
  return (
    <div role="img" aria-label={'Embudo: ' + stages.map((s) => `${s.nombre} ${s.n}`).join(', ')}>
      {stages.map((s, i) => {
        const a = w(s.n), b = i + 1 < stages.length ? w(stages[i + 1].n) : a * 0.75
        const pts = `${50 - a / 2},0 ${50 + a / 2},0 ${50 + b / 2},38 ${50 - b / 2},38`
        return (
          <div className="frow" key={s.nombre}>
            <div className="fshape">
              <svg viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true"><polygon points={pts} fill={RAMPA[Math.min(i, RAMPA.length - 1)]} stroke="var(--card)" strokeWidth="1" vectorEffect="non-scaling-stroke" /></svg>
              <div className="fnum" style={{ color: i < 2 ? 'var(--ink)' : '#fff' }}>{fmtN(s.n)}</div>
            </div>
            <div className="flab"><div className="nm">{s.nombre}</div><div className="sub">{s.sub}</div></div>
          </div>
        )
      })}
    </div>
  )
}

export function Metric({ n, l, cls = '' }: { n: number; l: string; cls?: string }) {
  return <div className={'tile ' + cls}><div className="n">{fmtN(n)}</div><div className="l">{l}</div></div>
}

/** Botón «i» con la definición del término: tooltip en hover y en foco, texto
 *  completo en aria-label para lectores de pantalla. */
export function Info({ termino }: { termino: Termino }) {
  const txt = GLOSARIO[termino]
  return <button type="button" className="ibtn" aria-label={`${termino}: ${txt}`} data-tip={txt} onClick={(e) => e.stopPropagation()}>i</button>
}
