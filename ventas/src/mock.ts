import type { Corte, Crm, Evento, Lead, Tarea, TipoEvento, Usuario } from './types'

// Corte sintético y determinista (mismo resultado en cada carga) para ver la
// interfaz sin CRM. Los nombres son los de la especificación; las cifras no
// pretenden ser reales y la página lo avisa.
export function mock(): Corte {
  let seed = 7
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const hoy = Math.floor(Date.now() / 1000)
  const dia = 86400

  const usuarios: Usuario[] = [
    { id: 'adriana-sanchez', nombre: 'Adriana Sanchez', zona: 'MTY', crm: ['kommo'], ids: { kommo: 1 } },
    { id: 'marco-perez', nombre: 'Marco Pérez', zona: 'MTY', crm: ['kommo', 'hubspot'], ids: { kommo: 2, hubspot: '2' } },
    { id: 'carlos-campillo', nombre: 'Carlos Campillo', zona: 'MTY', crm: ['kommo', 'hubspot'], ids: { kommo: 3, hubspot: '3' } },
    { id: 'samuel-giacoman', nombre: 'Samuel Giacoman', zona: 'MTY', crm: ['kommo'], ids: { kommo: 4 } },
    { id: 'erick-barajas', nombre: 'Erick Barajas', zona: 'TRC', crm: ['kommo'], ids: { kommo: 5 } },
    { id: 'monserrat-leon', nombre: 'Monserrat León', zona: 'MVA', crm: ['kommo'], ids: { kommo: 6 } },
    { id: 'randall', nombre: 'Randall', zona: '', crm: ['kommo', 'hubspot'], ids: { kommo: 7, hubspot: '7' } },
  ]
  const etapas = ['Por contactar', 'Conversación iniciada', 'Propuesta entregada', 'Levantamiento agendado', 'Levantamiento hecho', 'Contrato solicitado'].map((nombre, id) => ({ id, nombre }))
  const nombres = ['Juan Pérez', 'María López', 'Luis Hernández', 'Ana García', 'Pedro Martínez', 'Laura Sánchez',
    'Jorge Ramírez', 'Sofía Torres', 'Miguel Flores', 'Elena Rivera', 'Diego Gómez', 'Paula Díaz']
  const leads: Lead[] = []
  const eventos: Evento[] = []
  const tareas: Tarea[] = []

  for (let i = 0; i < 420; i++) {
    const u = pick(usuarios)
    const crm: Crm = u.crm.length > 1 && rnd() < 0.5 ? 'hubspot' : u.crm[0]
    const creado = hoy - Math.floor(rnd() * 88) * dia - Math.floor(rnd() * dia)
    const asignacion = creado + Math.floor(rnd() * 2 * dia)
    const r = rnd()
    const funnel = (r < 0.12 ? 0 : r < 0.3 ? 1 : r < 0.45 ? 2 : r < 0.55 ? 3 : r < 0.9 ? 4 : 5) as Lead['funnel']
    const enHunting = funnel === 4 && rnd() < 0.15
    const embudo = funnel === 4 || funnel === 5 ? (enHunting ? 'hunting' : 'ventas') : 'cadencia'
    const etapaId = embudo === 'ventas' && funnel === 4 ? Math.floor(rnd() * rnd() * 6) : -1
    const etapa = etapaId >= 0 ? etapas[etapaId].nombre : funnel === 5 ? 'Ganado' : funnel === 0 ? 'Perdido' : enHunting ? 'Sin analizar' : 'Diario'
    const presupuesto = funnel >= 3 && rnd() < 0.6 ? Math.round((40000 + rnd() * 160000) / 100) * 100 : 0
    const abiertas = funnel === 4 ? Math.floor(rnd() * 3) : 0
    const vencidas = abiertas ? Math.floor(rnd() * (abiertas + 1)) : 0
    const cerrado = funnel === 5 || funnel === 0 ? asignacion + Math.floor(rnd() * 30 * dia) : 0
    const id = (crm === 'kommo' ? 'k:' : 'h:') + (24000000 + i)
    const nombre = pick(nombres) + ' ' + (i % 97)
    leads.push({
      id, crm, nombre, creado, embudo, pipeline: crm === 'hubspot' ? 'Ciclo de Venta KS' : embudo === 'ventas' ? 'Ventas' : embudo === 'hunting' ? 'HUNTING' : 'CADENCIA RECIBO CFE',
      etapa, etapa_id: etapaId, asesor_id: u.id, asesor: u.nombre,
      presupuesto, recibo: funnel >= 3, respondio: funnel >= 2, funnel,
      funnel_label: ['0·Perdido', '1·No contestó (sin recibo)', '2·Respondió SIN recibo', '3·Con recibo (pre-Ventas)', '4·Asignado (en Ventas/Hunting)', '5·Ganado'][funnel],
      tareas_abiertas: abiertas, tareas_vencidas: vencidas, pc_vencida: vencidas > 0 && rnd() < 0.4,
      tags: funnel >= 2 ? ['Respondió'] : [], dias_sin_cambio: Math.floor(rnd() * 20), link: 'https://example.com/lead/' + i,
      msjs: funnel >= 2 ? 1 + Math.floor(rnd() * 8) : 0, llamadas_cf: Math.floor(rnd() * 5), tel: funnel >= 2 ? 'Contactó' : '',
      sin_tarea: funnel === 4 && abiertas === 0, razon: funnel === 0 ? pick(['Sin interes', 'Fuera de Zona', 'Ganado por otra empresa - Precio']) : '',
      asignacion, tareas_completadas: Math.floor(rnd() * 6), ult_tarea: 0, ult_llamada: 0,
      cotizacion: etapaId >= 2 && rnd() < 0.5 ? asignacion + 3 * dia : 0, levantamiento: etapaId >= 4 && rnd() < 0.5 ? asignacion + 6 * dia : 0,
      ult_actividad: 0, cerrado,
    })
    const l = leads[leads.length - 1]
    const nEv = funnel === 0 ? 1 : 1 + Math.floor(rnd() * 6)
    for (let j = 0; j < nEv; j++) {
      const tipo: TipoEvento = pick(['llamada_ok', 'llamada_no', 'llamada_ok', 'tarea', 'tarea', 'tarea'])
      eventos.push({ ts: asignacion + Math.floor(rnd() * 20 * dia), tipo, asesor_id: u.id, lead: id, asignacion, embudo, crm })
    }
    if (l.cotizacion) eventos.push({ ts: l.cotizacion, tipo: 'cotizacion', asesor_id: u.id, lead: id, asignacion, embudo, crm })
    if (l.levantamiento) eventos.push({ ts: l.levantamiento, tipo: 'levantamiento', asesor_id: u.id, lead: id, asignacion, embudo, crm })
    if (funnel === 0) eventos.push({ ts: cerrado, tipo: 'descarte', asesor_id: u.id, lead: id, asignacion, embudo, crm })
    for (let t = 0; t < abiertas; t++) {
      const vence = hoy + Math.floor((rnd() * 6 - 2) * dia)
      tareas.push({ id: id + '-t' + t, crm, lead: id, lead_nombre: nombre, asesor_id: u.id,
        texto: pick(['Llamar para dar seguimiento', 'Enviar propuesta', 'Confirmar levantamiento', 'Pedir recibo CFE', '']),
        tipo: pick(['Follow-up', 'Primer Contacto', 'Llamada Rescate']), vence, vencida: vence < hoy, link: l.link })
    }
  }
  eventos.sort((a, b) => a.ts - b.ts)
  const gen = new Date().toISOString().slice(0, 19)
  return {
    generado: gen, dias_historia: 90, desde: hoy - 90 * dia,
    fuentes: [{ crm: 'kommo', generado: gen, leads: 0, eventos: 0, tareas: 0 }, { crm: 'hubspot', generado: gen, leads: 0, eventos: 0, tareas: 0 }],
    usuarios, equipos: [{ id: 'MTY', nombre: 'Monterrey' }, { id: 'SLT', nombre: 'Saltillo' }, { id: 'TRC', nombre: 'Torreón' }, { id: 'MVA', nombre: 'Monclova' }],
    etapas, metas: { 'adriana-sanchez': 70, 'marco-perez': 70, 'carlos-campillo': 50, 'samuel-giacoman': 30, 'erick-barajas': 30, 'monserrat-leon': 30 },
    leads, eventos, tareas_abiertas: tareas,
  }
}
