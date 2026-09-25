import type { Corte } from './types'

/** Los widgets que pueden llevar fechas propias, para el menú de Configuración › Fechas propias por widget (Randall
 *  16-sep). Un widget nuevo que no esté aquí sí las tiene (no se puede apagar hasta agregarlo). Las cifras «foto de
 *  hoy» no entran: no dependen de fechas. */
/** `fabrica`: con qué periodo abre el widget si nadie lo cambia (RANGOS_ADMIN / RANGOS_FICHA en admin.tsx); sin él, sigue al tablero. */
export const CATALOGO_FECHAS: { vista: string; widgets: { id: string; titulo: string; fabrica?: string }[] }[] = [
  { vista: 'Dashboard (y los mismos widgets en la ficha del asesor)', widgets: [
    { id: 't-leads', titulo: 'Leads asignados' }, { id: 't-ventas', titulo: 'Clientes cerrados' }, { id: 't-vendido', titulo: 'Avance contra la meta' },
    { id: 't-conversion', titulo: 'Conversión ventas / asignados' }, { id: 't-conv-pago', titulo: 'Tasa de conversión origen de pago' }, { id: 't-conv-org', titulo: 'Tasa de conversión origen orgánico' }, { id: 't-conv-ase', titulo: 'Tasa de conversión origen asesor' }, { id: 't-perdida', titulo: 'Tasa de pérdida' }, { id: 't-tareas', titulo: 'Tareas completadas' },
    { id: 't-cotizaciones', titulo: 'Cotizaciones entregadas' }, { id: 't-descartes', titulo: 'Descartados con razón registrada' }, { id: 't-levantamientos', titulo: 'Levantamientos solicitados' },
    { id: 'salud', titulo: 'Salud operativa' }, { id: 'ranking', titulo: 'Ranking de ventas' }, { id: 'reales', titulo: 'Ventas reales · Comisiones' },
    { id: 'cotiz-metodos', titulo: 'Cotizaciones generadas por asesor' }, { id: 'lev-operaciones', titulo: 'Levantamientos de ayuda a cierre' }, { id: 'visitas', titulo: 'Levantamientos según el embudo del CRM' },
    { id: 'pipeline', titulo: 'Cotizado vs vendido vs meta' }, { id: 'entrada', titulo: 'Entrada de leads · Kommo' }, { id: 'embudo', titulo: 'Embudo de ventas por etapa', fabrica: 'maximo' },
    { id: 'etapas', titulo: 'Monto cotizado y tiempo por etapa', fabrica: 'maximo' }, { id: 'llamadas', titulo: 'Llamadas' }, { id: 'calidad-llamadas', titulo: 'Calidad de llamadas' },
    { id: 'contacto', titulo: 'Primer contacto' }, { id: 'razones', titulo: 'Razones de descarte' }, { id: 'perfiles', titulo: 'Perfiles de vendedores' }, { id: 'perfiles-tabla', titulo: 'Tabla de perfiles' },
  ] },
  { vista: 'Solo en la ficha del asesor', widgets: [
    { id: 'ev', titulo: 'Monto vendido y Meta de venta por mes', fabrica: 'maximo' }, { id: 'ev-tabla', titulo: 'Contrato total y Meta de venta por mes', fabrica: 'maximo' },
    { id: 'ventas', titulo: 'Avance contra la meta (ficha)' }, { id: 'cumplimiento', titulo: 'Cumplimiento' }, { id: 'cierre', titulo: 'Porcentaje de cierre' },
    { id: 'actividad', titulo: 'Actividad' },
    { id: 'cotizado', titulo: 'Cotizado vigente y antigüedad', fabrica: 'foto' }, { id: 'leads', titulo: 'Leads activos (tabla)', fabrica: 'foto' }, { id: 'tareas', titulo: 'Tareas abiertas', fabrica: 'foto' },
  ] },
  { vista: 'Gráficas hechas con el constructor', widgets: [{ id: 'g:*', titulo: 'Todas las gráficas propias (Agregar gráfica)' }] },
]
/** Si un widget puede tener fechas propias según Configuración (`fechas_sin`). Las gráficas propias van por «g:*». */
export const fechasPermitidas = (c: Corte) => { const sin = new Set(c.fechas_sin || []); return (id: string) => !sin.has(id) && !(id.startsWith('g:') && sin.has('g:*')) }
