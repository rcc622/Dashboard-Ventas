// Definiciones que salen en el botón «i». Una frase, sin jerga, con la regla de cálculo.
export const GLOSARIO = {
  'Leads activos': 'Leads asignados en el rango que no están ganados ni perdidos.',
  'Presupuesto': 'Suma del presupuesto (precio) de los leads activos del asesor.',
  'Llamadas': 'Llamadas registradas en el rango. Contestada = con duración; sin contestar = duración cero.',
  'Tareas': 'Completadas en el rango, vencidas hoy en sus leads activos y leads activos sin ninguna tarea abierta.',
  'Sin tarea': 'Lead asignado sin ninguna tarea abierta: se cerró la anterior y no quedó seguimiento.',
  'Cumplimiento': 'Ventas cerradas en el rango entre la meta mensual del asesor (VENTAS_METAS). Sin meta no se calcula.',
  'Conversión': 'Ventas cerradas en el rango entre leads asignados en el rango. Es por periodo, no por cohorte.',
  'Salud operativa': 'Leads asignados en Ventas o Hunting con última asignación en el rango, partidos por si ya traen presupuesto.',
  'Monto cotizado': 'Suma del presupuesto de los leads que hoy están en cada etapa del embudo Ventas.',
  'Tiempo promedio': 'Días promedio que los leads llevan en su etapa actual (días sin cambio en el CRM).',
  'Tareas hoy': 'Tareas que vencen hoy más las propias, contra las ya completadas hoy. El rezago vencido se cuenta aparte.',
  'act.': 'Actividades registradas hoy: llamadas, tareas completadas, cotizaciones y levantamientos.',
} as const
export type Termino = keyof typeof GLOSARIO
