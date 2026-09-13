import { useEffect } from 'react'
import type { Corte, Llamada } from './types'
import { CRM_LABEL } from './types'
import { NOTAS, OBJECION_LABEL, fechaDe, filasDeLlamadas, fmtCorta, fmtEstrellas, fmtHora, resultadoLlamada, tipoLlamada } from './metrics'
import { useEscape } from './components'
import type { Drill } from './drill'

/** El drill de llamadas calificadas, igual desde donde se abra (tabla de Asesores, widget «Calidad de llamadas»):
 *  el nombre abre el audio, «Notas» abre las 14 preguntas, el contador de alerta dice «sin siguiente paso». */
export function drillLlamadas(titulo: string, ls: Llamada[], corte: Corte, rango: string, onNotas: (x: Llamada) => void): Drill {
  const porSid = new Map(ls.map((x) => [x.id, x]))
  return { titulo, clave: 'llamadas', filas: filasDeLlamadas(ls, corte), sub: rango + ' · fecha = la llamada',
    verFila: (f) => { const x = porSid.get(f.id); if (x) onNotas(x) }, verLabel: 'Notas', alertaLabel: 'sin siguiente paso',
    pie: 'Clic en la llamada abre el audio en otra pestaña; «Notas» abre las 14 preguntas con su evidencia. Detalle = veredicto: Excelente (4 o más, el estándar), Reforzar (3 a 3,99) o Requiere atención (menos de 3), con lo que salió bien y qué mejorar; el resumen completo aparece al pasar el mouse. Nota de registro = ponderada (siguiente paso ×3; cierre, objeciones y calificación ×2). «–» = la etapa no aplicaba.' }
}

// Una llamada calificada: la nota de registro, las 14 preguntas con su evidencia textual y el audio.
// Es la ventana que abre el drill de «⭐ Llamadas» (Fase 3.3 del calificador). Nada aquí escribe nada.
// Regla de la rúbrica: 0 = no aplicaba (el tipo de llamada no la exige o el prospecto cortó); el estándar es 4 o más.

const CLS = (n: number) => (n === 0 ? 'na' : n >= 4 ? 'ok' : n === 3 ? 'mid' : 'bad')

export function LlamadaModal({ x, onClose }: { x: Llamada; onClose: () => void }) {
  useEscape(onClose)
  useEffect(() => { const prev = document.activeElement as HTMLElement | null; return () => prev?.focus?.() }, [])
  const etapas = NOTAS.filter((n) => n.grupo === 'etapa'), pasos = NOTAS.filter((n) => n.grupo === 'objecion')
  const fila = (n: (typeof NOTAS)[number]) => {
    const [est, ev] = x.notas?.[n.id] || [0, '']
    return (
      <tr key={n.id}>
        <td className="lnota">{n.label}</td>
        <td className="num"><span className={'estrellas ' + CLS(est)} aria-label={est ? `${est} de 5` : 'No aplica'}>{est ? '★'.repeat(est) + '☆'.repeat(5 - est) : 'N/A'}</span></td>
        <td className="lev">{ev || <span className="muted">—</span>}</td>
      </tr>
    )
  }
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal llamada" role="dialog" aria-modal="true" aria-label={`Llamada calificada · ${x.asesor}`}>
        <div className="mh">
          <div className="mt">
            <h2>{tipoLlamada(x)} · {x.asesor} · {fmtCorta(fechaDe(x.fecha))} {fmtHora(x.fecha)}</h2>
            <div className="small muted">
              {Math.round(x.dur / 60)} min · {CRM_LABEL[x.crm]}{x.tel ? ' · ' + x.tel : ''} · Resultado: {resultadoLlamada(x)}{x.objecion ? ' · Objeción: ' + (OBJECION_LABEL[x.objecion] || x.objecion) : ''}
            </div>
          </div>
          <a className="btn ghost" href="playbook-calificacion.html" target="_blank" rel="noreferrer" title="Cómo se califica cada llamada">ⓘ Playbook</a>
          {x.audio && <a className="btn ghost" href={x.audio} target="_blank" rel="noreferrer">Oír la llamada</a>}
          <button type="button" className="ib" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="mb">
          <div className="lcabecera">
            <div className="lkpi"><div className="v">{fmtEstrellas(x.pond)}</div><div className="c">nota ponderada · estándar 4 o más</div></div>
            <div className="lkpi"><div className="v">{x.cumple ? 'Sí' : 'No'}</div><div className="c">en estándar</div></div>
            <div className="lkpi"><div className="v"><span className={'tag' + (x.sig_paso ? '' : ' alerta')}>{x.sig_paso ? 'Con siguiente paso' : 'Sin siguiente paso'}</span></div><div className="c">terminó con fecha y hora o acción registrable</div></div>
          </div>
          {x.resumen && <p className="lresumen">{x.resumen}</p>}
          <table className="ftable lnotas">
            <thead><tr><th scope="col">Etapa</th><th scope="col" className="num">Nota</th><th scope="col">Evidencia (textual de la transcripción)</th></tr></thead>
            <tbody>
              {etapas.map(fila)}
              <tr className="grow"><td colSpan={3}>Objeción · los 4 pasos{x.objecion ? ` · ${OBJECION_LABEL[x.objecion] || x.objecion}` : ' · no hubo objeción'}</td></tr>
              {pasos.map(fila)}
            </tbody>
          </table>
          {x.mejora && <div className="lmejora"><b>Qué mejorar:</b> {x.mejora}</div>}
        </div>
        <div className="mf small muted">Calificado contra la rúbrica v3 por el calificador de llamadas. N/A = la etapa no aplicaba en este tipo de llamada. Esc o clic afuera cierra.</div>
      </div>
    </div>
  )
}
