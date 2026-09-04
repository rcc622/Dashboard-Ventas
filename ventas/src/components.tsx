import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject, type SyntheticEvent , type SVGProps } from 'react'
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

/** Recuadro «Llamadas hechas» con desglose al pasar el mouse o al enfocar; el click abre el detalle. */
export function LlamadasBar({ total, ok, no, onClick }: { total: number; ok: number; no: number; onClick?: () => void }) {
  const [tip, setTip] = useState(false)
  const resumen = `Llamadas hechas: ${fmtN(total)}. Contestadas ${fmtN(ok)} (${pct(ok, total)}%), sin contestar ${fmtN(no)} (${pct(no, total)}%)`
  return (
    <div className={'llam-box' + (onClick ? ' drill' : '')} tabIndex={0} role={onClick ? 'button' : undefined} aria-label={resumen + (onClick ? '. Ver detalle' : '')} onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}
      onFocus={() => setTip(true)} onBlur={() => setTip(false)} onClick={() => (onClick ? onClick() : setTip((t) => !t))} onKeyDown={onClick ? activar(() => onClick()) : undefined}>
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

export interface DetRow { label: string; val: number; onVer?: () => void }
/** Detalle de una barra de la tabla: aparece debajo del elemento clickeado. Un renglón con
 *  onVer es botón y abre la lista de registros. */
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
        {rows.map((r) => r.onVer
          ? <button type="button" className="r rbtn" key={r.label} onClick={r.onVer} title="Ver registros"><span>{r.label}</span><b>{fmtN(r.val)}</b><span className="muted">{pct(r.val, total)}% ›</span></button>
          : <div className="r" key={r.label}><span>{r.label}</span><b>{fmtN(r.val)}</b><span className="muted">{pct(r.val, total)}%</span></div>)}
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

/** Medidor de medio círculo con el porcentaje al centro (cumplimiento, tasa de contestación).
 *  El arco se satura en 100 %, el número no: un 140 % de meta se lee como 140 %. */
export function Gauge({ pct: p, label, size = 180, color = 'var(--c1)' }: { pct: number | null; label: string; size?: number; color?: string }) {
  const v = p == null ? 0 : Math.max(0, Math.min(100, p))
  const L = Math.PI * 80
  return (
    <div role="img" aria-label={`${label}: ${p == null ? 'sin dato' : Math.round(p) + '%'}`}>
      <svg className="gauge-svg" width={size} height={size * 0.62} viewBox="0 0 200 124">
        <path d="M 20 104 A 80 80 0 0 1 180 104" fill="none" stroke="var(--track)" strokeWidth="18" strokeLinecap="round" />
        {p != null && <path d="M 20 104 A 80 80 0 0 1 180 104" fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" strokeDasharray={`${(v / 100) * L} ${L}`} />}
        <text x="100" y="98" className="gcenter" fontSize="30">{p == null ? '—' : Math.round(p) + '%'}</text>
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
/** Embudo real: bandas trapezoidales con aire entre ellas, ancho proporcional a los leads
 *  de cada etapa (piso 18 % para que el número quepa), rampa de un solo tono (claro → oscuro)
 *  y etiqueta a la derecha. La forma vive en una columna acotada: a pantalla completa un
 *  trapecio de 700 px de ancho y 38 de alto se leía como una lámina aplastada. */
export function FunnelChart({ stages, onStage }: { stages: FunnelStage[]; onStage?: (i: number) => void }) {
  const max = Math.max(1, ...stages.map((s) => s.n))
  const H = 46
  const w = (n: number) => Math.max(18, (n / max) * 100)
  return (
    <div className="funnel" role={onStage ? 'group' : 'img'} aria-label={'Embudo: ' + stages.map((s) => `${s.nombre} ${s.n}`).join(', ')}>
      {stages.map((s, i) => {
        const a = w(s.n), b = i + 1 < stages.length ? w(stages[i + 1].n) : a * 0.8
        const pts = `${50 - a / 2},0 ${50 + a / 2},0 ${50 + b / 2},${H} ${50 - b / 2},${H}`
        const color = RAMPA[Math.min(i, RAMPA.length - 1)]
        const ctrl = onStage ? { role: 'button', tabIndex: 0, onClick: () => onStage(i), onKeyDown: activar(() => onStage(i)), 'aria-label': `${s.nombre}: ${fmtN(s.n)}. Ver leads` } : {}
        return (
          <div className={'frow' + (onStage ? ' drill' : '')} key={s.nombre} {...ctrl}>
            <div className="fshape">
              <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden="true"><polygon points={pts} fill={color} stroke={color} strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg>
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

/** Bullet: valor contra objetivo. Marca negra = objetivo; marca gris = lo esperado a hoy.
 *  La pista se estira al mayor de los dos para que el sobrecumplimiento también se vea. */
export function Bullet({ value, target, expected, label, color = 'var(--c1)', fmt = fmtN, sm = false }: { value: number; target: number; expected?: number; label: string; color?: string; fmt?: (n: number) => string; sm?: boolean }) {
  const max = Math.max(target, value, expected || 0, 1) * 1.04
  const w = (v: number) => Math.max(0, Math.min(100, (v / max) * 100))
  const desc = `${label}: ${fmt(value)} de ${fmt(target)} (${pct(value, target)}%)${expected != null ? `, esperado a hoy ${fmt(expected)}` : ''}`
  return (
    <div className={'bullet' + (sm ? ' sm' : '')} role="img" aria-label={desc} title={desc}>
      <div className="track">
        <i className="fill" style={{ width: w(value) + '%', background: color }} />
        {expected != null && <i className="exp" style={{ left: w(expected) + '%' }} />}
        <i className="tick" style={{ left: w(target) + '%' }} />
      </div>
    </div>
  )
}

export interface PuntoXY { x: number; y: number; label: string; title: string; cls: string }
/** Dispersión con las dos medianas como ejes de cuadrante. Cada punto lleva sus
 *  iniciales y un title; la identidad completa va en la leyenda de al lado, nunca solo en el color. */
export function Scatter({ pts, xMed, yMed, xLabel, yLabel, quad, onPunto }: { pts: PuntoXY[]; xMed: number; yMed: number; xLabel: string; yLabel: string; quad: [string, string, string, string]; onPunto?: (idx: number[]) => void }) {
  // 400 × 250: el SVG llena el ancho del widget (sin tope) y crece con él; a media pantalla queda
  // como antes, a pantalla completa los puntos y las letras se ven al doble.
  const W = 400, H = 250, L = 34, B = 26, T = 16, R = 10
  const maxX = Math.max(1, xMed, ...pts.map((p) => p.x)) * 1.1, maxY = Math.max(1, yMed, ...pts.map((p) => p.y)) * 1.1
  // El cero de «vendido» va 24 px arriba del eje: los puntos no se sientan sobre la línea ni sobre las etiquetas.
  const sx = (x: number) => L + (x / maxX) * (W - L - R), sy = (y: number) => H - B - 24 - (y / maxY) * (H - B - T - 24)
  // Muchos asesores caen en el mismo lugar ($0 vendido, poca actividad). Moverlos mentiría
  // sobre su dato: los que se enciman se juntan en UNA burbuja con el conteo y los nombres en el title.
  const grupos: { x: number; y: number; m: PuntoXY[]; idx: number[] }[] = []
  pts.forEach((p, i) => {
    const x = sx(p.x), y = sy(p.y)
    const g = grupos.find((q) => Math.hypot(q.x - x, q.y - y) < 14)
    if (g) { g.m.push(p); g.idx.push(i) } else grupos.push({ x, y, m: [p], idx: [i] })
  })
  const clsMayoria = (m: PuntoXY[]) => [...m].sort((a, b) => m.filter((z) => z.cls === b.cls).length - m.filter((z) => z.cls === a.cls).length)[0].cls
  const Lbl = ({ x, y, end, t }: { x: number; y: number; end?: boolean; t: string }) => {
    const w = t.length * 5.6 + 8
    return <g><rect x={end ? x - w : x - 4} y={y - 10} width={w} height={13} rx="3" fill="var(--card)" opacity=".92" /><text className="ql" x={x} y={y} textAnchor={end ? 'end' : 'start'}>{t}</text></g>
  }
  return (
    <svg className="scatter" viewBox={`0 0 ${W} ${H}`} role={onPunto ? 'group' : 'img'} aria-label={`${yLabel} contra ${xLabel}: ` + pts.map((p) => p.title).join('; ')}>
      <line className="grid" x1={L} y1={H - B} x2={W - R} y2={H - B} /><line className="grid" x1={L} y1={T} x2={L} y2={H - B} />
      <line className="med" x1={sx(xMed)} y1={T} x2={sx(xMed)} y2={H - B} /><line className="med" x1={L} y1={sy(yMed)} x2={W - R} y2={sy(yMed)} />
      <text className="ax" x={(L + W - R) / 2} y={H - 6} textAnchor="middle">{xLabel} →</text>
      <text className="ax" x={10} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(T + H - B) / 2})`}>{yLabel} →</text>
      {grupos.map((g) => {
        const ctrl: SVGProps<SVGGElement> = onPunto ? { role: 'button', tabIndex: 0, onClick: () => onPunto(g.idx), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPunto(g.idx) } }, 'aria-label': g.m.length > 1 ? `${g.m.length} asesores en el mismo punto: ${g.m.map((p) => p.title).join('; ')}. Elegir uno` : `${g.m[0].title}. Ver ficha` } : {}
        return (
          <g className={'pt' + (onPunto ? ' drill' : '')} key={g.m[0].label + g.m[0].title} {...ctrl}><title>{g.m.map((p) => p.title).join('\n')}</title>
            <circle className={clsMayoria(g.m)} cx={g.x} cy={g.y} r={g.m.length > 1 ? 12 : 9} stroke="var(--card)" strokeWidth="1.5" />
            <text x={g.x} y={g.y + 2.5}>{g.m.length > 1 ? '×' + g.m.length : g.m[0].label}</text>
          </g>
        )
      })}
      <Lbl x={L + 6} y={T + 10} t={quad[0]} />
      <Lbl x={W - R - 2} y={T + 10} end t={quad[1]} />
      <Lbl x={L + 6} y={H - B - 4} t={quad[2]} />
      <Lbl x={W - R - 2} y={H - B - 4} end t={quad[3]} />
    </svg>
  )
}

export type Dir = 'asc' | 'desc'
export interface Sort<K extends string> { key: K; dir: Dir }
/** Encabezado ordenable: el botón lleva el texto; lo demás (glosario) va fuera del botón. */
export function SortTh<K extends string>({ k, label, sort, onSort, className, children }: { k: K; label: string; sort: Sort<K>; onSort: (k: K) => void; className?: string; children?: ReactNode }) {
  const on = sort.key === k
  return (
    <th scope="col" className={className} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="sortbtn" aria-label={`Ordenar por ${label}`} onClick={() => onSort(k)}>{label}<span aria-hidden="true">{on ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span></button>{children}
    </th>
  )
}
