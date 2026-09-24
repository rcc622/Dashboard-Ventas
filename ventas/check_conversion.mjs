// Prueba de la conversión por asesor/origen y del «Resultado» del constructor (Randall 22-sep).
// Corre con: node check_conversion.mjs   (desde ventas/; empaqueta metrics.ts y constructor.tsx con esbuild)
import { build } from 'esbuild'
import assert from 'node:assert/strict'

const out = await build({
  stdin: { contents: "export * from './src/metrics'; export { serie, resultadosDe, resultadoDe, autoTitulo } from './src/constructor'", resolveDir: '.', loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', logLevel: 'silent',
})
const M = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))

const ep = (y, m, d) => Math.floor(new Date(y, m - 1, d).getTime() / 1000)
const lead = (id, x) => ({ id, crm: 'hubspot', nombre: '', creado: 0, embudo: 'ventas', pipeline: 'Ventas', etapa: '', etapa_id: 0, asesor_id: 'marco-perez', asesor: 'Marco Pérez',
  presupuesto: 0, recibo: false, respondio: true, funnel: 4, funnel_label: '', tareas_abiertas: 0, tareas_vencidas: 0, pc_vencida: false, tags: [], dias_sin_cambio: 0, link: '',
  msjs: 0, llamadas_cf: 0, tel: '', sin_tarea: false, razon: '', asignacion: ep(2026, 9, 2), tareas_completadas: 0, ult_tarea: 0, ult_llamada: 0, cotizacion: 0, levantamiento: 0,
  ult_actividad: 0, cerrado: 0, ...x })
const venta = (id, x) => ({ id, vendedor_id: 'v1', asesor_id: 'marco-perez', vendedor: 'Marco', cliente: '', zona: 'MTY', mes: '2026-09', mes_texto: 'Septiembre 2026',
  fecha: ep(2026, 9, 1), monto: 100000, comisionable: 0, cancelada: false, liga: '', origen: '', compartida_con: '', ...x })
const corte = {
  generado: '', dias_historia: 90, desde: ep(2026, 6, 1), fuentes: [], usuarios: [{ id: 'marco-perez', nombre: 'Marco Pérez', zona: 'MTY', crm: ['hubspot'], ids: {} }],
  equipos: [{ id: 'MTY', nombre: 'Monterrey' }], etapas: [], metas: {}, metas_zona: {}, meta_mxn: 0, cotizado_x: 10, cotizado_dias: 90, ocultos: [], eventos: [], tareas_abiertas: [],
  leads: [
    lead('h:1', { nombre: 'Lore Diaz - Referido', origen: 'Referido', funnel: 5, cerrado: ep(2026, 9, 12), asignacion: ep(2026, 9, 2) }),     // casa por nombre, 10 días
    lead('h:2', { nombre: 'Cesar Angel Gutierrez - Facebook', origen: 'Facebook' }),                                                         // NO debe casar con Saida Angeles Gutierrez
    lead('h:3', { nombre: 'Juan Perez', origen: 'Facebook', funnel: 5, cerrado: ep(2026, 9, 20), asignacion: ep(2026, 9, 5) }),             // casa por liga, 15 días
    lead('k:4', { crm: 'kommo', nombre: 'Lead #4', contacto: 'Ana Ruiz Soto', origen: 'Meta Ads' }),                                        // casa por el contacto, sin día de cierre
    lead('h:5', { nombre: 'Otro Cliente', origen: 'Facebook' }),
  ],
  comisiones: { vendedores: [], ventas: [
    venta('a', { cliente: 'LORENA DIAZ RIOS' }),
    venta('b', { cliente: 'SAIDA ANGELES OSCURO GUTIERREZ' }),
    venta('c', { cliente: 'NOMBRE DISTINTO', liga: 'https://app.hubspot.com/contacts/1/record/0-3/3' }),
    venta('d', { cliente: 'ANA RUIZ SOTO' }),
    venta('x', { cliente: 'CANCELADA', cancelada: true }),
  ] },
}
const cas = M.ventasCasadas(corte)
assert.equal(cas.get('a').lead?.id, 'h:1'); assert.equal(cas.get('a').como, 'nombre'); assert.equal(cas.get('a').dias, 10)
assert.equal(cas.get('b').lead, null, 'Saida Angeles no es Cesar Angel')
assert.equal(cas.get('c').lead?.id, 'h:3'); assert.equal(cas.get('c').como, 'liga'); assert.equal(cas.get('c').dias, 15)
assert.equal(cas.get('d').lead?.id, 'k:4'); assert.equal(cas.get('d').dias, null, 'sin ganado en el CRM no hay día de cierre')
assert.equal(cas.has('x'), false, 'las canceladas no cuentan')

const f = { rango: { ini: ep(2026, 9, 1), fin: ep(2026, 10, 1), label: '' }, equipo: null, asesor: null, crm: { kommo: true, hubspot: true } }
const pa = M.conversion(corte, f, 'asesor')
assert.equal(pa.leads.length, 5); assert.equal(pa.cierres.length, 4); assert.equal(pa.casadas, 3); assert.equal(pa.conDias, 2)
const marco = pa.filas.find((x) => x.clave === 'marco-perez')
assert.equal(marco.tasa, 4 / 5); assert.equal(marco.dias, 12.5); assert.equal(marco.nDias, 2)
const po = M.conversion(corte, f, 'origen')
const fb = po.filas.find((x) => x.clave === 'Facebook'), sin = po.filas.find((x) => x.clave === M.SIN_LEAD)
assert.equal(fb.leads.length, 3); assert.equal(fb.cierres.length, 1); assert.equal(sin.cierres.length, 1); assert.equal(sin.tasa, null)
const det = M.filasConversionLeads(marco)
assert.equal(det.length, 6, '4 cerradas (una sin lead) + h:2 y h:5, que no cerraron')
assert.equal(det.filter((x) => x.estado === 'Cerrada').length, 4)
const ana = det.find((x) => x.nombre === 'ANA RUIZ SOTO').extras
assert.equal(ana.find((e) => e.label === 'Fecha de cierre').valor.includes('(solo el mes)'), true)
assert.equal(ana.find((e) => e.label === 'Levantamiento').valor, 'Sin levantamiento')
assert.ok(M.filasConversion(pa)[0].extras.some((e) => e.label === 'Cierres con levantamiento'))
// Sin origen va a no digital: las dos juntas suman la total
const dg = M.conversion(corte, f, 'asesor', 'digital'), nd = M.conversion(corte, f, 'asesor', 'nodigital')
assert.equal(dg.leads.length + nd.leads.length, pa.leads.length); assert.equal(dg.cierres.length + nd.cierres.length, pa.cierres.length)

// Constructor: la tasa por origen deja fuera la venta sin lead y el total cuadra con la tarjeta
const g = { id: 't', titulo: '', medida: 'conversion', dim: 'origen_lead', tipo: 'hbar' }
const s = M.serie(corte, f, g)
assert.equal(s.grupos.some((x) => x.label === M.SIN_LEAD), false)
assert.equal(s.total, 4 / 5)
assert.deepEqual(M.resultadosDe(['conversion'], 'origen_lead', 'hbar'), [])
// Resultado sobre una medida con valor: promedio, mediana, % del total
const gv = { id: 'v', titulo: '', medida: 'r_contrato', dim: 'asesor', tipo: 'hbar' }
assert.deepEqual(M.resultadosDe(['r_contrato'], 'asesor', 'hbar'), ['suma', 'conteo', 'promedio', 'mediana', 'minimo', 'maximo', 'pct'])
assert.equal(M.serie(corte, f, gv).total, 400000)
assert.equal(M.serie(corte, f, { ...gv, resultado: 'promedio' }).total, 100000)
assert.equal(M.serie(corte, f, { ...gv, resultado: 'conteo' }).total, 4)
assert.equal(M.serie(corte, f, { ...gv, resultado: 'pct' }).grupos[0].valor, 1)
assert.equal(M.autoTitulo({ ...gv, resultado: 'promedio' }), 'Promedio de contrato total por asesor')
// Una medida de conteo no ofrece promedio; el acumulado solo con tiempo
assert.deepEqual(M.resultadosDe(['leads'], 'asesor', 'hbar'), ['suma', 'pct'])
assert.deepEqual(M.resultadosDe(['leads'], 'mes', 'vbar'), ['suma', 'pct', 'acumulado'])
// Canal del origen (junta 23-sep)
for (const o of ['Meta Ads', 'Wapp-FB', 'Web Form', 'TikTok', 'Google Ads', 'Web orgánico', 'REDES SOCIALES', 'WA-FB Directo', 'Llamada entrante']) assert.equal(M.claseOrigen(o), 'digital', o)
for (const o of ['Referido', 'REFERIDO', 'Cambaceo', 'Expo', 'Directo', 'EXPANSIÓN']) assert.equal(M.claseOrigen(o), 'nodigital', o)
for (const o of ['Sin origen', '', null, 'OTRO']) assert.equal(M.claseOrigen(o), 'nodigital', String(o))
// Ritmo: avance porcentual contra el día del periodo y proyección
const rr = { ini: Date.UTC(2026, 8, 1) / 1000 + 6 * 3600, fin: Date.UTC(2026, 9, 1) / 1000 + 6 * 3600, label: 'sep' }
const rt = M.ritmo(300000, 1000000, rr, rr.ini + 14.5 * 86400)
assert.equal(rt.pctPeriodo, 50); assert.equal(rt.pctMeta, 30); assert.equal(Math.round(rt.proyeccion), 600000)
// Perdidos fuera de la base (Randall 24-sep)
const perdido = { ...corte.leads.find((l) => l.asesor_id === 'marco-perez'), id: 'k:999', funnel: 0 }
const pp = M.conversion({ ...corte, leads: [...corte.leads, perdido] }, f, 'asesor')
assert.equal(pp.leads.length, pa.leads.length); assert.ok(!pp.leads.some((l) => l.id === 'k:999'))
console.log('check_conversion: ok')
