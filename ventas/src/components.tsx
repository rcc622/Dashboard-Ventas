import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject, type SyntheticEvent, type SVGProps } from 'react'
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
  // Sin onClick era un div enfocable con aria-label y sin rol: ARIA lo prohibe en un «generic».
  const ctrl = onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: activar(onClick as (e: SyntheticEvent<HTMLElement>) => void), 'aria-label': title } : { role: 'group', 'aria-label': title }
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

export interface DetRow { label: string; val: number; onVer?: () => void; color?: string }
/** Detalle de una barra de la tabla: aparece debajo del elemento clickeado. Un renglón con
 *  onVer es botón y abre la lista de registros. */
/** Al abrir un diálogo el foco entra en él y al cerrarlo regresa a donde estaba. Sin esto, con
 *  teclado el foco se queda atrás y hay que recorrer toda la tabla otra vez. */
export function useFocoDialogo(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button, input, select, [tabindex]')?.focus()
    return () => antes?.focus?.()
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
}

export function BarDetailPopup({ anchor, title, total, rows, onClose, fmt = fmtN }: { anchor: DOMRect; title: string; total: number; rows: DetRow[]; onClose: () => void; fmt?: (n: number) => string }) {
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, onClose)
  useEscape(onClose)
  useFocoDialogo(ref)
  const W = 300
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - W - 8))
  const top = anchor.bottom + 6 + 220 > window.innerHeight ? Math.max(8, anchor.top - 6 - 200) : anchor.bottom + 6
  return (
    <div className="popup" ref={ref} style={{ left, top, width: W }} role="dialog" aria-modal="true" aria-label={title}>
      <div className="ph"><span className="nm">{title}</span><button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button></div>
      <div className="pbody detail-rows">
        {rows.map((r) => r.onVer
          ? <button type="button" className="r rbtn" key={r.label} onClick={r.onVer} title="Ver registros"><span>{r.color && <i className="sw" style={{ background: r.color }} aria-hidden="true" />}{r.label}</span><b>{fmt(r.val)}</b><span className="muted">{pct(r.val, total)}% ›</span></button>
          : <div className="r" key={r.label}><span>{r.color && <i className="sw" style={{ background: r.color }} aria-hidden="true" />}{r.label}</span><b>{fmt(r.val)}</b><span className="muted">{pct(r.val, total)}%</span></div>)}
        <div className="r t"><span>Total</span><b>{fmt(total)}</b><span>100%</span></div>
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

export interface BubbleCol { label: string; title?: string; bubbles: { n: number; cls?: string; title?: string }[] }
/** `onCol`: cada columna es un botón (p. ej. una semana que se abre por día). */
export function BubbleChart({ cols, onCol }: { cols: BubbleCol[]; onCol?: (i: number) => void }) {
  return (
    <>
      <div className="bubbles">
        {cols.map((c, i) => (
          <div className={'bcol' + (onCol ? ' drill' : '')} key={c.label + i} title={c.title} {...(onCol ? { role: 'button', tabIndex: 0, onClick: () => onCol(i), onKeyDown: activar(() => onCol(i)), 'aria-label': (c.title || c.label) + ': ' + (c.bubbles.map((b) => `${b.title} ${b.n}`).join(', ') || 'sin actividad') } : {})}>
            {/* Tamaño por variable CSS: la bolita se achica si la columna es más angosta que ella (rangos largos). */}
            {c.bubbles.map((b, i) => { const s = Math.min(46, 18 + b.n * 3); return <div key={i} className={'bubble ' + (b.cls || '')} style={{ '--s': s + 'px' } as CSSProperties} title={b.title} aria-label={`${b.title}: ${b.n}`}>{b.n}</div> })}
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
        // Barra centrada con el ancho de SU etapa. Son fotos de hoy por etapa, no un flujo que solo baja:
        // con trapecios, una etapa con más leads que la anterior se dibujaba como embudo invertido.
        const a = w(s.n)
        const color = RAMPA[Math.min(i, RAMPA.length - 1)]
        const ctrl = onStage ? { role: 'button', tabIndex: 0, onClick: () => onStage(i), onKeyDown: activar(() => onStage(i)), 'aria-label': `${s.nombre}: ${fmtN(s.n)}. Ver leads` } : {}
        return (
          <div className={'frow' + (onStage ? ' drill' : '')} key={s.nombre} {...ctrl}>
            <div className="fshape">
              <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden="true"><rect x={50 - a / 2} y="0" width={a} height={H} fill={color} /></svg>
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
export function Info({ termino }: { termino: Termino | Termino[] }) {
  // Varios términos en un widget = UN solo botón (dos «i» pegadas se veían como un error, Randall 6-sep).
  const ts = Array.isArray(termino) ? termino : [termino]
  const txt = ts.map((t) => (ts.length > 1 ? `${t}: ` : '') + GLOSARIO[t]).join('  ·  ')
  // Escape cierra el tooltip sin mover el puntero (WCAG 1.4.13).
  return <button type="button" className="ibtn" aria-label={`${ts.join(' y ')}: ${txt}`} data-tip={txt} onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur() }}><IconoInfo /></button>
}

/** El círculo con la «i»: dibujado, no la letra suelta, para que pese lo mismo que el asa y la × (Randall 8-sep). */
export function IconoInfo() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" /><path d="M8 7.3v4" strokeLinecap="round" /><circle cx="8" cy="4.6" r=".95" fill="currentColor" stroke="none" />
    </svg>
  )
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
/** Tamaño real en píxeles de una caja (ResizeObserver): para que un SVG crezca con el widget sin escalar sus letras. */
export function useSize<T extends HTMLElement>(): [RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setSize((s) => { const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight); return s.w === w && s.h === h ? s : { w, h } })
    medir()
    const ro = new ResizeObserver(medir); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

export function Scatter({ pts, xMed, yMed, xLabel, yLabel, quad, onPunto }: { pts: PuntoXY[]; xMed: number; yMed: number; xLabel: string; yLabel: string; quad: [string, string, string, string]; onPunto?: (idx: number[]) => void }) {
  // El SVG mide lo que mide su caja (1 unidad = 1 px): la gráfica crece con el widget pero las letras,
  // las burbujas y los ejes se quedan a su tamaño (auditoría 6-sep: a pantalla completa «vendido →» medía 46 px).
  const [caja, size] = useSize<HTMLDivElement>()
  const W = Math.max(280, size.w || 400), H = size.h >= 160 ? size.h : Math.max(250, Math.round(W * 0.55))
  const L = 34, B = 26, T = 16, R = 10
  const maxX = Math.max(1, xMed, ...pts.map((p) => p.x)) * 1.1, maxY = Math.max(1, yMed, ...pts.map((p) => p.y)) * 1.1
  // El cero de «vendido» va 24 px arriba del eje: los puntos no se sientan sobre la línea ni sobre las etiquetas.
  const sx = (x: number) => L + (x / maxX) * (W - L - R), sy = (y: number) => H - B - 24 - (y / maxY) * (H - B - T - 24)
  // Muchos asesores caen en el mismo lugar ($0 vendido, poca actividad). Moverlos mentiría
  // sobre su dato: los que se enciman se juntan en UNA burbuja con el conteo y los nombres en el title.
  const grupos: { x: number; y: number; m: PuntoXY[]; idx: number[] }[] = []
  pts.forEach((p, i) => {
    const x = sx(p.x), y = sy(p.y)
    const g = grupos.find((q) => Math.hypot(q.x - x, q.y - y) < 18)
    if (g) { g.m.push(p); g.idx.push(i) } else grupos.push({ x, y, m: [p], idx: [i] })
  })
  const clsMayoria = (m: PuntoXY[]) => [...m].sort((a, b) => m.filter((z) => z.cls === b.cls).length - m.filter((z) => z.cls === a.cls).length)[0].cls
  const Lbl = ({ x, y, end, t }: { x: number; y: number; end?: boolean; t: string }) => {
    const w = t.length * 6.8 + 8
    return <g><rect x={end ? x - w : x - 4} y={y - 12} width={w} height={16} rx="3" fill="var(--card)" opacity=".92" /><text className="ql" x={x} y={y} textAnchor={end ? 'end' : 'start'}>{t}</text></g>
  }
  return (
    <div className="scatter-box" ref={caja}>
    <svg className="scatter" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role={onPunto ? 'group' : 'img'} aria-label={`${yLabel} contra ${xLabel}: ` + pts.map((p) => p.title).join('; ')}>
      <line className="grid" x1={L} y1={H - B} x2={W - R} y2={H - B} /><line className="grid" x1={L} y1={T} x2={L} y2={H - B} />
      <line className="med" x1={sx(xMed)} y1={T} x2={sx(xMed)} y2={H - B} /><line className="med" x1={L} y1={sy(yMed)} x2={W - R} y2={sy(yMed)} />
      <text className="ax" x={(L + W - R) / 2} y={H - 6} textAnchor="middle">{xLabel} →</text>
      <text className="ax" x={10} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(T + H - B) / 2})`}>{yLabel} →</text>
      {grupos.map((g) => {
        const ctrl: SVGProps<SVGGElement> = onPunto ? { role: 'button', tabIndex: 0, onClick: () => onPunto(g.idx), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPunto(g.idx) } }, 'aria-label': g.m.length > 1 ? `${g.m.length} asesores en el mismo punto: ${g.m.map((p) => p.title).join('; ')}. Elegir uno` : `${g.m[0].title}. Ver ficha` } : {}
        return (
          <g className={'pt' + (onPunto ? ' drill' : '')} key={g.m[0].label + g.m[0].title} {...ctrl}><title>{g.m.map((p) => p.title).join('\n')}</title>
            <circle className={clsMayoria(g.m)} cx={g.x} cy={g.y} r={g.m.length > 1 ? 13 : 11} stroke="var(--card)" strokeWidth="1.5" />
            <text x={g.x} y={g.y + 2.5}>{g.m.length > 1 ? '×' + g.m.length : g.m[0].label}</text>
          </g>
        )
      })}
      <Lbl x={L + 6} y={T + 10} t={quad[0]} />
      <Lbl x={W - R - 2} y={T + 10} end t={quad[1]} />
      <Lbl x={L + 6} y={H - B - 4} t={quad[2]} />
      <Lbl x={W - R - 2} y={H - B - 4} end t={quad[3]} />
    </svg>
    </div>
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

// ---------------------------------------------------------------- Gráficas de la analítica (7-sep)
export interface BarItem { label: string; value: number; sub?: string; title?: string; texto?: string; partes?: Parte[] }
/** Como se dibujan varias medidas en la misma barra: apiladas (suman un total) o lado a lado (para comparar). */
export type Modo = 'apilado' | 'lado'
const resumenPartes = (it: BarItem, fmt: (n: number) => string) => (it.partes || []).map((p) => `${p.label} ${fmt(p.val)}`).join(' · ')
/** Barras verticales con la cifra encima y UNA sola escala (nunca dos ejes: el segundo dato va como texto).
 *  Con `partes` la barra lleva varias medidas: apiladas suman el total, lado a lado se comparan. */
export function BarChart({ items, fmt, color = 'var(--c1)', label, onBar, modo = 'apilado' }: { items: BarItem[]; fmt: (n: number) => string; color?: string; label: string; onBar?: (i: number, r: DOMRect) => void; modo?: Modo }) {
  const max = Math.max(1, ...items.map((it) => (it.partes && modo === 'lado' ? Math.max(...it.partes.map((p) => p.val)) : it.value)))
  const alto = (v: number) => Math.max(2, (v / max) * 100) + '%'
  return (
    <div className="vbars" role={onBar ? 'group' : 'img'} aria-label={label + ': ' + items.map((i) => `${i.label} ${i.texto || fmt(i.value)}${i.sub ? ' (' + i.sub + ')' : ''}`).join(', ')}>
      {items.map((it, i) => {
        const inner = (
          <>
            <span className="vv">{it.texto || fmt(it.value)}</span>
            {it.sub && <span className="vs">{it.sub}</span>}
            <span className="vtrack">
              {it.partes
                ? modo === 'apilado'
                  ? <span className="vstack" style={{ height: alto(it.value) }}>{it.partes.map((p) => <i key={p.label} style={{ height: (it.value ? (p.val / it.value) * 100 : 0) + '%', background: p.color }} />)}</span>
                  : <span className="vlado">{it.partes.map((p) => <i key={p.label} style={{ height: alto(p.val), background: p.color }} />)}</span>
                : <i style={{ height: alto(it.value), background: color }} />}
            </span>
            <span className="vl" title={it.label}>{it.label}</span>
          </>
        )
        const t = it.title || `${it.label}: ${it.partes ? resumenPartes(it, fmt) : fmt(it.value)}`
        return onBar
          ? <button type="button" key={it.label + i} className="vcol drill" title={t + '. Ver detalle'} onClick={(e) => onBar(i, e.currentTarget.getBoundingClientRect())}>{inner}</button>
          : <div key={it.label + i} className="vcol" title={t}>{inner}</div>
      })}
    </div>
  )
}
/** Lista de barras horizontales: etiqueta · barra · cifra (y un dato chico opcional). Con `partes`, varias medidas por renglon. */
export function HBarList({ items, fmt, color = 'var(--c1)', label, onBar, modo = 'apilado' }: { items: BarItem[]; fmt: (n: number) => string; color?: string; label: string; onBar?: (i: number, r: DOMRect) => void; modo?: Modo }) {
  const max = Math.max(1, ...items.map((it) => (it.partes && modo === 'lado' ? Math.max(...it.partes.map((p) => p.val)) : it.value)))
  const ancho = (v: number) => Math.max(1, (v / max) * 100) + '%'
  return (
    <div className="hbars" role={onBar ? 'group' : 'img'} aria-label={label + ': ' + items.map((i) => `${i.label} ${i.texto || fmt(i.value)}${i.sub ? ' (' + i.sub + ')' : ''}`).join(', ')}>
      {items.map((it, i) => {
        const inner = (
          <>
            <span className="hl" title={it.label}>{it.label}</span>
            <span className={'htrack' + (it.partes && modo === 'lado' ? ' lado' : '')}>
              {it.partes
                ? modo === 'apilado'
                  ? <span className="hstack" style={{ width: ancho(it.value) }}>{it.partes.map((p) => <i key={p.label} style={{ width: (it.value ? (p.val / it.value) * 100 : 0) + '%', background: p.color }} />)}</span>
                  : it.partes.map((p) => <i key={p.label} style={{ width: ancho(p.val), background: p.color }} />)
                : <i style={{ width: ancho(it.value), background: color }} />}
            </span>
            <span className="hv">{it.texto || fmt(it.value)}{it.sub && <small>{it.sub}</small>}</span>
          </>
        )
        const t = it.title || `${it.label}: ${it.partes ? resumenPartes(it, fmt) : fmt(it.value)}`
        return onBar
          ? <button type="button" key={it.label + i} className="hrow drill" title={t + '. Ver detalle'} onClick={(e) => onBar(i, e.currentTarget.getBoundingClientRect())}>{inner}</button>
          : <div key={it.label + i} className="hrow" title={t}>{inner}</div>
      })}
    </div>
  )
}
export interface LineSerie { label: string; color: string; items: BarItem[] }
/** Línea con un punto por periodo y la cifra encima; la línea es SVG y los textos HTML, así nada se estira.
 *  Con `series` dibuja varias medidas en la MISMA escala (una sola, nunca dos ejes); ahí las cifras se
 *  quitan de los puntos para que no se encimen y el valor vive en el tooltip y en la leyenda. */
export function LineChart({ items, fmt, color = 'var(--c1)', label, onPoint, series }: { items: BarItem[]; fmt: (n: number) => string; color?: string; label: string; onPoint?: (i: number, r: DOMRect, s?: number) => void; series?: LineSerie[] }) {
  const sers: LineSerie[] = series && series.length > 1 ? series : [{ label, color, items }]
  const multi = sers.length > 1
  const vals = sers.flatMap((s) => s.items.map((i) => i.value))
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals)
  const n = sers[0].items.length
  const y = (v: number) => 100 - ((v - min) / (max - min || 1)) * 100
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100)
  return (
    <div className="linebox" role={onPoint ? 'group' : 'img'} aria-label={label + ': ' + sers.map((s) => `${s.label} — ` + s.items.map((i) => `${i.label} ${fmt(i.value)}`).join(', ')).join(' · ')}>
      <div className="larea">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {sers.map((s) => (
            <path key={s.label} d={s.items.map((it, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(it.value)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </svg>
        {sers.map((s, si) => s.items.map((it, i) => {
          const est = { left: x(i) + '%', top: y(it.value) + '%' }
          const t = `${multi ? s.label + ' · ' : ''}${it.label}: ${fmt(it.value)}`
          return onPoint
            ? <button type="button" key={s.label + it.label + i} className="lpt drill" style={est} title={t + '. Ver registros'} onClick={(e) => onPoint(i, e.currentTarget.getBoundingClientRect(), si)}><i style={{ background: s.color }} />{!multi && <span>{fmt(it.value)}</span>}</button>
            : <div key={s.label + it.label + i} className="lpt" style={est} title={t}><i style={{ background: s.color }} />{!multi && <span>{fmt(it.value)}</span>}</div>
        }))}
      </div>
      <div className="llabels" aria-hidden="true">{sers[0].items.map((it, i) => <span key={it.label + i} style={{ left: x(i) + '%' }}>{it.label}</span>)}</div>
    </div>
  )
}
