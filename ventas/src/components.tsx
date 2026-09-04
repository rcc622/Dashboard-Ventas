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
 *  segmentos reparten ese largo. Sin total → pista vacía. Si recibe onClick es
 *  un control: foco, Enter y espacio abren el detalle igual que el click. */
export function StackedBar({ segs, total, max, onClick, title }: { segs: Seg[]; total: number; max: number; onClick?: (e: SyntheticEvent<HTMLDivElement>) => void; title?: string }) {
  const w = total > 0 && max > 0 ? Math.max(4, Math.min(100, (total / max) * 100)) : 100
  const ctrl = onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: activar(onClick as (e: SyntheticEvent<HTMLElement>) => void), 'aria-label': title } : {}
  return (
    <div className="sbar" style={{ width: w + '%' }} title={title} {...ctrl}>
      {total > 0 && segs.map((s, i) => <i key={i} className={s.cls} style={{ width: pct(s.val, total) + '%' }} />)}
    </div>
  )
}

/** Recuadro «Llamadas Hechas» con desglose al pasar el mouse, al enfocar o al hacer click. */
export function LlamadasBar({ total, ok, no }: { total: number; ok: number; no: number }) {
  const [tip, setTip] = useState(false)
  const resumen = `Llamadas hechas: ${fmtN(total)}. Contestadas ${fmtN(ok)} (${pct(ok, total)}%), sin contestar ${fmtN(no)} (${pct(no, total)}%)`
  return (
    <div className="llam-box" tabIndex={0} aria-label={resumen} onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}
      onFocus={() => setTip(true)} onBlur={() => setTip(false)} onClick={() => setTip((t) => !t)}>
      <div className="llam-head"><span>Llamadas Hechas</span><span>{fmtN(total)}</span></div>
      <StackedBar segs={[{ val: ok, cls: 'seg-comp' }, { val: no, cls: 'seg-warn' }]} total={total} max={total} />
      {tip && (
        <div className="tip" style={{ left: 14, top: 64 }} aria-hidden="true">
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

export function Donut({ pct: p, label }: { pct: number; label: string }) {
  const v = Math.max(0, Math.min(100, p))
  return (
    <div className="donut-wrap" role="img" aria-label={`${label}: ${Math.round(v)}%`}>
      <div className="donut" style={{ background: `conic-gradient(var(--ink) ${v}%, var(--g3) 0)` }}><span>{Math.round(v)}%</span></div>
      <div className="donut-l">{label}</div>
    </div>
  )
}

export function MiniAreaChart({ values, height = 60 }: { values: number[]; height?: number }) {
  const id = useId().replace(/:/g, '')
  const W = 300, H = height, n = values.length, max = Math.max(1, ...values)
  const pts = values.map((v, i) => [n > 1 ? (i / (n - 1)) * W : W / 2, H - 4 - (v / max) * (H - 8)])
  const line = pts.map((p) => p.join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true" style={{ color: 'var(--ink)' }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".35" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
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

export interface FunnelStage { nombre: string; valor: number; display: string; n?: number; sub?: string }
/** Embudo centrado: ancho proporcional al valor, badge de cambio contra la etapa
 *  anterior y conector trapezoidal (solo contorno) entre barras. */
export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.valor))
  const ancho = (v: number) => Math.max(6, (v / max) * 100)
  return (
    <div>
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1] : null
        const delta = prev && prev.valor > 0 ? Math.round(((s.valor - prev.valor) / prev.valor) * 100) : null
        return (
          <div className="fstage" key={s.nombre}>
            {prev && <FunnelConnector from={ancho(prev.valor)} to={ancho(s.valor)} />}
            <div className="top">
              <span>{s.nombre}{s.sub && <span className="muted small"> · {s.sub}</span>}</span>
              <span className="val">{s.display}{delta != null && <span className={delta < 0 ? 'badge-dn' : 'badge-up'} aria-label={`${delta < 0 ? 'baja' : 'sube'} ${Math.abs(delta)}% contra la etapa anterior`}>{delta < 0 ? '▼' : '▲'} {Math.abs(delta)}%</span>}</span>
            </div>
            <div className="fbar-wrap"><div className="fbar" style={{ width: ancho(s.valor) + '%' }} title={s.n != null ? `${s.n} leads` : undefined}>{s.n != null ? s.n : ''}</div></div>
          </div>
        )
      })}
    </div>
  )
}

function FunnelConnector({ from, to }: { from: number; to: number }) {
  const l1 = (100 - from) / 2, r1 = 100 - l1, l2 = (100 - to) / 2, r2 = 100 - l2
  return (
    <svg className="fconn" viewBox="0 0 100 10" preserveAspectRatio="none" width="100%" height="10" aria-hidden="true" style={{ color: 'var(--ink)' }}>
      <polyline points={`${l1},0 ${l2},10`} stroke="currentColor" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
      <polyline points={`${r1},0 ${r2},10`} stroke="currentColor" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function Metric({ n, l }: { n: number; l: string }) {
  return <div className="metric"><div className="n">{fmtN(n)}</div><div className="l">{l}</div></div>
}

/** Botón «i» con la definición del término: tooltip en hover y en foco, texto
 *  completo en aria-label para lectores de pantalla. */
export function Info({ termino }: { termino: Termino }) {
  const txt = GLOSARIO[termino]
  return <button type="button" className="ibtn" aria-label={`${termino}: ${txt}`} data-tip={txt} onClick={(e) => e.stopPropagation()}>i</button>
}
