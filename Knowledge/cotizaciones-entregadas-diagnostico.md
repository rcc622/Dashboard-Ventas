# Cómo contar bien las cotizaciones entregadas — diagnóstico con datos

Medido el 5 de septiembre de 2026 contra la API de Kommo y el corte real. Salió como defecto en dos
juntas seguidas: Randall con Alejandro (4-sep) y Randall con David (5-sep).

## El defecto, en una frase

La métrica de hoy no mide cotizaciones: **mide quién llena un campo**. Cubre el 25 % de los
asesores que sí cotizaron, y el sesgo por persona es tan grande que invalida cualquier decisión que
se tome con ella.

## Cómo se cuenta hoy

| CRM | Regla actual | Problema |
|---|---|---|
| Kommo | Campo de fecha `1833423` «Cotización entregada» | Lo llena una persona a mano. Si no lo llena, la cotización no existe para el tablero. |
| HubSpot | El deal que **hoy** está parado en «Propuesta entregada» | Es foto del momento. Si el deal avanzó o se ganó, deja de contar. |

## Lo que midieron los datos

**Embudo Ventas de Kommo, últimos 90 días (796 leads):**

| Señal | Leads | Cobertura sobre los que sí cotizaron |
|---|---|---|
| Campo de fecha (definición de hoy) | 138 | 25 % |
| **Entraron a «Propuesta entregada» (historial)** | **594** | **100 %** |
| Con monto capturado | 479 | 81 % |
| Campo `1833443` «Cotizador (asesores)» | 732 de 796 | no discrimina nada |

**Se pierden hoy 479 cotizaciones reales**, el 81 % del total.

**El sesgo por asesor es el hallazgo grave:**

| Asesor | Cuenta hoy | Cotizaciones reales |
|---|---|---|
| Carlos Campillo | **0** | **148** |
| Samuel Giacoman | 1 | 45 |
| Marco Pérez | 58 | 122 |
| Adriana Sánchez | 71 | 127 |
| Erick Barajas | 7 | 24 |

Carlos Campillo aparece con **cero** cotizaciones habiendo movido 148 leads a Propuesta entregada.
Esa cifra alimenta el cuadrante que recomienda «darle salida» a quien tiene baja actividad.

**Otra prueba de que el campo está roto:** de las 320 ventas ganadas del corte, **ninguna** tiene
fecha de cotización. El 98 % sí tiene monto. Nadie cierra una venta sin cotizar, así que el campo
se pierde en el camino.

## La solución: el historial de cambios de etapa

Kommo **sí guarda** quién entró a cada etapa y cuándo. El endpoint `/events` con
`filter[type]=lead_status_changed` devuelve `value_after` con el `status_id`, el `pipeline_id` y la
fecha. Hoy el extractor no lo usa.

**Probado, no supuesto:**

| Qué | Resultado |
|---|---|
| Costo de traer 90 días completos | 118 llamadas, **81 segundos** |
| Eventos que devuelve | 11,727 cambios de etapa (2,669 del embudo Ventas) |
| Entradas a «Propuesta entregada» | 624 en 90 días, de 594 leads distintos |
| Recotizaciones (mismo lead entró 2 veces) | 30 leads |
| Hasta dónde llega hacia atrás | **1 año** (365 días sí devuelve, 540 no) |

El extractor ya tarda unos 4 minutos, así que sumar 1.4 minutos es aceptable. Y el historial llega
mucho más atrás que los 90 días que mira el tablero, o sea que **se puede reconstruir todo hacia
atrás**, no solo de hoy en adelante.

**Regalo:** este mismo dato desbloquea el **pipeline histórico** («ver el embudo como estaba hace
siete días»), que está pendiente desde el 4 de septiembre y era la petición grande de Samuel.

## Regla propuesta

- **Kommo:** una cotización entregada = la **primera entrada del lead a «Propuesta entregada»**
  (etapa `109436768` del embudo `14175132`), con la fecha de ese evento. Las entradas posteriores
  del mismo lead son recotizaciones y se cuentan aparte, no se suman al total.
- **HubSpot:** no tiene historial de etapas en este portal. Ahí se conserva la foto actual y el
  tablero lo dice explícitamente, en lugar de fingir un número comparable.
- **El cotizador digital pasa a ser un indicador aparte**, que es justo lo que pidió Randall en la
  junta con David: una cosa es cotizar y otra es usar la herramienta.

## Lo que falta decidir antes de programar

1. ¿Una cotización por lead, o se cuentan las recotizaciones? Hay 30 leads con dos entradas.
2. ¿Cuenta un lead que entró a Propuesta y se regresó a una etapa anterior? Es un error de captura
   o una cotización que se cayó, y cambia el número.
3. Hay 124 entradas a Propuesta de leads **sin responsable asignado**. Hay que decidir a quién se le
   atribuyen o si se excluyen.
4. En HubSpot no hay forma de igualar la medición. ¿Se muestra el número por CRM separado, o se
   marca el de HubSpot como aproximado?

## Arreglo de fondo, aparte del contador

El campo `1833423` seguirá vacío mientras se llene a mano. Para que el dato nazca bien: que el bot
o una automatización de Kommo escriba la fecha al mover el lead a «Propuesta entregada», o que el
cotizador la escriba solo. Eso no lo arregla el tablero.

## Estado

Diagnóstico y medición **terminados**. Quedó corriendo un panel de cuatro definiciones con
refutación adversarial que se detuvo a media ejecución; se puede reanudar con el identificador
`wf_8964daba-968` y los agentes ya terminados vuelven de caché. **No se ha cambiado ni una línea de
código**: falta que Randall decida los cuatro puntos de arriba.
