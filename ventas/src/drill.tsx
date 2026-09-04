import { useEffect, useMemo, useRef, useState } from 'react'
import { CRM_LABEL } from './types'
import { fechaDe, fmtCorta, fmtHora, fmtMoney, fmtN, type Fila } from './metrics'
import { useEscape } from './components'

// Ventana de detalle (drill-down): la lista de registros detrás de una cifra o barra, con
// búsqueda y el nombre como liga al registro en su CRM. Pedido de Randall 4-sep, calcado del
// drill-down de los reportes de HubSpot. Nada aquí escribe a ningún CRM.
export interface Drill { titulo: string; sub?: string; filas: Fila[] }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const PASO = 300

export function DrillModal({ d, onClose }: { d: Drill; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [max, setMax] = useState(PASO)
  const inp = useRef<HTMLInputElement>(null)
  useEscape(onClose)
  // Foco al buscador al abrir; al cerrar, de vuelta a lo que se clickeó.
  useEffect(() => { const prev = document.activeElement as HTMLElement | null; inp.current?.focus(); return () => prev?.focus?.() }, [])
  useEffect(() => { setMax(PASO) }, [q, d])
  const nq = norm(q.trim())
  const filas = useMemo(() => (nq ? d.filas.filter((f) => norm(f.nombre + ' ' + f.asesor + ' ' + f.detalle).includes(nq)) : d.filas), [d, nq])
  const total = filas.reduce((s, f) => s + (f.monto || 0), 0)
  const crms = [...new Set(d.filas.map((f) => f.crm))]
  const sinLiga = d.filas.filter((f) => !f.link).length
  const cuando = (ts?: number) => (ts ? `${fmtCorta(fechaDe(ts))} ${fmtHora(ts)}` : '—')
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={d.titulo}>
        <div className="mh">
          <div className="mt">
            <h2>{d.titulo}</h2>
            <div className="small muted">
              {fmtN(filas.length)}{nq ? ` de ${fmtN(d.filas.length)}` : ''} registro{filas.length === 1 ? '' : 's'}{total ? ` · ${fmtMoney(total)}` : ''}{crms.length ? ' · ' + crms.map((c) => CRM_LABEL[c]).join(' + ') : ''}{d.sub ? ' · ' + d.sub : ''}
            </div>
          </div>
          <input ref={inp} className="sel" type="search" placeholder="Buscar nombre, asesor o detalle…" aria-label="Buscar en el detalle" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="mb">
          {!filas.length && <div className="muted" style={{ padding: 16 }}>Nada que mostrar{nq ? ` para «${q}»` : ''}.</div>}
          {filas.length > 0 && (
            <table className="ftable dtable">
              <thead><tr><th>Registro</th><th>CRM</th><th>Asesor</th><th>Detalle</th><th className="num">Monto</th><th>Cuándo</th></tr></thead>
              <tbody>
                {filas.slice(0, max).map((f) => (
                  <tr key={f.id}>
                    <td>{f.link ? <a href={f.link} target="_blank" rel="noreferrer" title={'Abrir en ' + CRM_LABEL[f.crm]}>{f.nombre}</a> : <span className="muted">{f.nombre}</span>}</td>
                    <td><span className="tag" title={CRM_LABEL[f.crm]}>{f.crm === 'hubspot' ? 'HS' : 'KM'}</span></td>
                    <td>{f.asesor}</td>
                    <td>{f.detalle}</td>
                    <td className="num">{f.monto ? fmtMoney(f.monto) : '—'}</td>
                    <td className="muted">{cuando(f.cuando)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {filas.length > max && <button type="button" className="btn" style={{ margin: '10px 0' }} onClick={() => setMax(max + PASO)}>Mostrar {Math.min(PASO, filas.length - max)} más · quedan {fmtN(filas.length - max)}</button>}
        </div>
        <div className="mf small muted">
          Clic en el nombre abre el registro en su CRM en otra pestaña.{sinLiga > 0 ? ` ${fmtN(sinLiga)} registro${sinLiga === 1 ? '' : 's'} sin liga: HubSpot no liga tareas ni llamadas al deal.` : ''} Esc o clic afuera cierra.
        </div>
      </div>
    </div>
  )
}
