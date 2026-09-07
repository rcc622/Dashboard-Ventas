import { useMemo, useState } from 'react'
import type { Corte, VentaReal } from './types'
import { REGIONES, analiticaReales, filasDeVentasReales, fmtCorta, fmtHora, fmtMoney0, fmtN, type Captura, type Filtros, type Region, type Serie } from './metrics'
import { BarChart, DonutChart, HBarList, Info, LineChart } from './components'
import { WidgetGrid, type Widget } from './widgets'
import { DrillModal, type Drill } from './drill'

// Página «Ventas reales» (Randall 7-sep): las gráficas de la pestaña Analítica de la app de
// comisiones, aquí, con los datos de la app. Sigue el calendario, el equipo y el propietario de
// la barra de arriba; Región y Captura son filtros propios de la app y van aquí. Cada barra,
// rebanada o punto abre el detalle de sus ventas. Las gráficas por mes muestran toda la historia.
const ORDEN = ['t-ventas', 't-contrato', 't-panel', 't-ticket', 't-paneles', 't-enganches', 'mes', 'top', 'origen', 'zona', 'pago', 'ticket', 'tamano', 'panel-asesor', 'panel-mes']
const COLOR_ORIGEN: Record<string, string> = { 'Sin origen': 'var(--neutral)', 'REDES SOCIALES': 'var(--c1)', 'REFERIDO': 'var(--c4)', 'DIRECTO': 'var(--c2)', 'EXPANSIÓN': 'var(--c3)' }
const bonito = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s)
const pct1 = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

export function VentasRealesPage({ corte, filtros }: { corte: Corte; filtros: Filtros }) {
  const [region, setRegion] = useState<Region | null>(null)
  const [captura, setCaptura] = useState<Captura | null>(null)
  const [drill, setDrill] = useState<Drill | null>(null)
  const a = useMemo(() => analiticaReales(corte, filtros, region, captura), [corte, filtros, region, captura])
  if (!corte.comisiones) return <div className="panel muted">La app de comisiones no está conectada a este tablero (faltan SUPABASE_URL y SUPABASE_SERVICE_KEY en el servicio).</div>
  const rango = filtros.rango.label
  const sinDatos = !corte.comisiones.ventas.some((v) => v.paneles != null)
  const ver = (titulo: string, ventas: VentaReal[], sub?: string) => setDrill({ titulo, filas: filasDeVentasReales(ventas), sub: sub ?? rango })
  const verSerie = (titulo: string, s: Serie, sub?: string) => ver(`${titulo} · ${s.label}`, s.ventas, sub)
  const W = (id: string, titulo: string, nodo: React.ReactNode, opts: Partial<Widget> = {}): Widget => ({ id, titulo, nodo, ...opts })
  const tile = (id: string, titulo: string, n: string, l: string, cls: string, info: Widget['info'], ventas?: VentaReal[], sub?: string) => W(id, titulo, (
    ventas
      ? <button type="button" className={'tile tbtn ' + cls} onClick={() => ver(titulo, ventas, sub)} aria-label={`${n} ${l}. Ver detalle`}><div className="n">{n}</div><div className="l">{l}</div></button>
      : <div className={'tile ' + cls}><div className="n">{n}</div><div className="l">{l}</div></div>
  ), { plain: true, span: 1, alto: 4, cls: 'wtile', info })
  const cre = a.crecimiento
  const widgets: Widget[] = [
    tile('t-ventas', 'Ventas', fmtN(a.n), 'ventas en la app', '', ['Ventas reales'], a.ventas),
    tile('t-contrato', 'Contrato total', fmtMoney0(a.contrato), 'contrato total', 't2', ['Contrato total'], a.ventas),
    tile('t-panel', 'Precio por panel promedio', a.paneles > 0 ? fmtMoney0(a.precioPanel) : '—', 'por panel en promedio', 't3', ['Precio por panel']),
    tile('t-ticket', 'Ticket promedio', a.n ? fmtMoney0(a.ticket) : '—', 'por venta en promedio', 't4', ['Ticket promedio']),
    tile('t-paneles', 'Paneles vendidos', fmtN(a.paneles), 'paneles vendidos', 't5', ['Paneles vendidos']),
    tile('t-enganches', 'Enganches pagados', `${fmtN(a.enganches)} (${a.pctEnganche.toFixed(0)}%)`, 'ventas con enganche pagado', 't2', ['Enganches pagados'], a.ventas.filter((v) => v.enganche)),
    W('mes', 'Ingresos y ventas por mes', (
      <>
        {/* El «mes contra mes» de la app va aquí, pegado a su gráfica (seis cifras llenan la fila; una séptima la rompía). */}
        {cre && <button type="button" className={'nbtn rt ' + (cre.pct < 0 ? 'atras' : 'adelante')} style={{ marginBottom: 6, fontSize: 12.5 }} onClick={() => ver(`Ventas · ${cre.actual} y ${cre.anterior}`, cre.ventas, 'todos los meses')} title="Ver las ventas de los dos meses">{cre.pct < 0 ? '▼' : '▲'} {pct1(cre.pct)} {cre.actual} contra {cre.anterior}</button>}
        {a.porMes.length ? <BarChart label="Contrato por mes" fmt={fmtMoney0} color="var(--c2)" items={a.porMes.map((s) => ({ label: s.label, value: s.value, sub: `${fmtN(s.n)} venta${s.n === 1 ? '' : 's'}` }))} onBar={(i) => verSerie('Ventas', a.porMes[i], 'todos los meses')} /> : <div className="muted">Sin ventas.</div>}
      </>
    ), { info: ['Ingresos por mes', 'Mes contra mes'], span: 3, alto: 9 }),
    W('top', 'Top vendedores por contrato', (
      a.topVendedores.length ? <HBarList label="Contrato por vendedor" fmt={fmtMoney0} items={a.topVendedores.map((s) => ({ label: s.label, value: s.value, sub: `${fmtN(s.n)} venta${s.n === 1 ? '' : 's'}` }))} onBar={(i) => verSerie('Ventas', a.topVendedores[i])} /> : <div className="muted">Sin ventas en el rango.</div>
    ), { info: ['Top vendedores'], span: 3, alto: 9 }),
    W('origen', 'Origen de las ventas (monto)', (
      a.origen.length ? (
        <div className="donut-legend">
          <DonutChart partes={a.origen.map((s) => ({ val: s.value, color: COLOR_ORIGEN[s.label] || 'var(--g3)', label: bonito(s.label) }))} total={a.contrato} label={fmtMoney0(a.contrato)} size={180} />
          <div className="legend-list">
            {a.origen.map((s) => (
              <button type="button" key={s.label} className="lr" onClick={() => verSerie('Ventas', s)} aria-label={`${bonito(s.label)}: ${fmtMoney0(s.value)}, ${fmtN(s.n)} ventas. Ver leads`}>
                <i className="sw" style={{ background: COLOR_ORIGEN[s.label] || 'var(--g3)' }} aria-hidden="true" /><span>{bonito(s.label)}</span><b>{fmtMoney0(s.value)}</b><span className="muted">{a.contrato ? Math.round((s.value / a.contrato) * 100) : 0}% · {fmtN(s.n)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : <div className="muted">Sin ventas en el rango.</div>
    ), { info: ['Origen de las ventas'], span: 3, alto: 9 }),
    W('zona', 'Contrato por zona', (
      a.porZona.length ? <BarChart label="Contrato por zona" fmt={fmtMoney0} color="var(--c4)" items={a.porZona.map((s) => ({ label: s.label, value: s.value, sub: `${fmtN(s.n)} venta${s.n === 1 ? '' : 's'}` }))} onBar={(i) => verSerie('Ventas', a.porZona[i])} /> : <div className="muted">Sin ventas en el rango.</div>
    ), { info: ['Contrato por zona'], span: 3, alto: 9 }),
    W('pago', 'Forma de pago', (
      a.formaPago.length ? <HBarList label="Contrato por forma de pago" fmt={fmtMoney0} color="var(--warn)" items={a.formaPago.map((s) => ({ label: s.label, value: s.value, sub: `${fmtN(s.n)} venta${s.n === 1 ? '' : 's'}` }))} onBar={(i) => verSerie('Ventas', a.formaPago[i])} /> : <div className="muted">Sin ventas en el rango.</div>
    ), { info: ['Forma de pago'], span: 3, alto: 10 }),
    W('ticket', 'Ticket promedio por forma de pago', (
      a.ticketMetodo.length ? <HBarList label="Ticket promedio por forma de pago" fmt={fmtMoney0} color="var(--c2)" items={a.ticketMetodo.map((s) => ({ label: s.label, value: s.value, sub: `${fmtN(s.n)} venta${s.n === 1 ? '' : 's'}` }))} onBar={(i) => verSerie('Ventas', a.ticketMetodo[i])} /> : <div className="muted">Sin ventas en el rango.</div>
    ), { info: ['Ticket por forma de pago'], span: 3, alto: 10 }),
    W('tamano', 'Tamaño de venta (paneles)', (
      a.n ? <BarChart label="Ventas por tamaño" fmt={fmtN} color="var(--c3)" items={a.tamano.map((s) => ({ label: s.label, value: s.value }))} onBar={(i) => verSerie('Ventas', a.tamano[i])} /> : <div className="muted">Sin ventas en el rango.</div>
    ), { info: ['Tamaño de venta'], span: 3, alto: 9 }),
    W('panel-asesor', 'Precio por panel promedio por asesor', (
      a.panelAsesor.length ? <HBarList label="Precio por panel por asesor" fmt={fmtMoney0} color="var(--c4)" items={a.panelAsesor.map((s) => ({ label: s.label, value: s.value, sub: `${fmtN(s.n)} venta${s.n === 1 ? '' : 's'}` }))} onBar={(i) => verSerie('Ventas', a.panelAsesor[i])} /> : <div className="muted">Sin ventas con paneles en el rango.</div>
    ), { info: ['Precio por panel por asesor'], span: 3, alto: 9 }),
    W('panel-mes', 'Precio por panel promedio por mes', (
      a.panelMes.length ? <LineChart label="Precio por panel por mes" fmt={fmtMoney0} color="var(--c3)" items={a.panelMes.map((s) => ({ label: s.label, value: s.value }))} onPoint={(i) => verSerie('Ventas', a.panelMes[i], 'todos los meses')} /> : <div className="muted">Sin ventas con paneles.</div>
    ), { info: ['Precio por panel por mes'], span: 3, alto: 9 }),
  ]
  return (
    <>
      <div className="pills-row">
        <label>Región
          <span className="pill sm" role="group" aria-label="Región">
            <button type="button" className={region === null ? 'on' : ''} aria-pressed={region === null} onClick={() => setRegion(null)}>Todas</button>
            {(Object.keys(REGIONES) as Region[]).map((r) => <button type="button" key={r} className={region === r ? 'on' : ''} aria-pressed={region === r} title={REGIONES[r].nombre} onClick={() => setRegion(region === r ? null : r)}>{r}</button>)}
          </span><Info termino="Región" />
        </label>
        <label>Captura
          <span className="pill sm" role="group" aria-label="Captura">
            <button type="button" className={captura === null ? 'on' : ''} aria-pressed={captura === null} onClick={() => setCaptura(null)}>Todas</button>
            <button type="button" className={captura === 'completa' ? 'on' : ''} aria-pressed={captura === 'completa'} onClick={() => setCaptura(captura === 'completa' ? null : 'completa')}>Completa</button>
            <button type="button" className={captura === 'incompleta' ? 'on' : ''} aria-pressed={captura === 'incompleta'} onClick={() => setCaptura(captura === 'incompleta' ? null : 'incompleta')}>Incompleta</button>
          </span><Info termino="Captura" />
        </label>
        <span className="small muted">Datos de la app de comisiones{corte.comisiones.generado ? ` (${fmtCorta(new Date(corte.comisiones.generado))} ${fmtHora(new Date(corte.comisiones.generado).getTime() / 1000)})` : ''}. Las canceladas no cuentan. Las gráficas por mes muestran toda la historia, no solo las fechas de arriba.</span>
      </div>
      {sinDatos && <div className="aviso" role="status">El corte todavía no trae paneles, forma de pago ni enganches: las gráficas que los usan se llenan en el siguiente corte automático.</div>}
      <WidgetGrid clave="reales" widgets={ORDEN.map((id) => widgets.find((w) => w.id === id)).filter((w): w is Widget => !!w)} />
      {drill && <DrillModal d={drill} onClose={() => setDrill(null)} />}
    </>
  )
}
