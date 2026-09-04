# Lo que pidió Alejandro (consultor CW) vs. lo que tiene `/ventas` — corte 3-sep-2026

Fuente: 13 juntas en Tactiq con Alejandro Ibarra (29-jun → 28-ago 2026) y la junta con Pamela del 31-ago
(donde Randall le dictó el alcance del visualizador). Tablero revisado: perfil **Admin** (líder de ventas,
auditor CRM, dirección comercial) en https://mkt-ventas-production.up.railway.app/ · commit `e863d48`.

Estado: ✅ cubierto · 🟡 parcial · ❌ falta. Columna **Dato**: si `data/ventas.json` ya trae lo necesario
(entonces es solo UI) o hay que tocar extractores / configuración.

Juntas citadas (`t=` es el segundo dentro de la grabación):

| Fecha | Junta | Liga |
|---|---|---|
| 29-jun | Retos Sales Pro HubSpot (Samuel, Alejandro, Randall) | https://app.tactiq.io/api/2/u/m/r/uQNdmCdmhaE0Tn1IUW8e |
| 16-jul | Discovery sesión 1 | https://app.tactiq.io/api/2/u/m/r/XwCPi2nwSvYlPIQV5dHe |
| 21-jul | Discovery sesión 2 | https://app.tactiq.io/api/2/u/m/r/gKSBetMq4f25S6oYbxRP |
| 24-jul | Proceso de venta (visor para vendedores) | https://app.tactiq.io/api/2/u/m/r/vaovyq1iu2zp0IQjhRY5 |
| 29-jul | Proceso de venta (pipelines, razones de pérdida) | https://app.tactiq.io/api/2/u/m/r/BDeUchDHC22vRjXU7k3W |
| 5-ago | Cierre Discovery (concepto workspace del vendedor) | https://app.tactiq.io/api/2/u/m/r/0TSiLOId2kQbFpQjg48E |
| 10-ago | Cadencias + rol supervisor + marcador diario | https://app.tactiq.io/api/2/u/m/r/ZAJWq5PzH7VDTgyRMiha |
| 11-ago | Tasa de asignación, llamadas como hito, intentos | https://app.tactiq.io/api/2/u/m/r/HamYJuWVsDI1ocf8J1Qt |
| 13-ago | Reporte de leads, razón de descarte, vista lista | https://app.tactiq.io/api/2/u/m/r/oFod1JkcZQBb0rbbxEL4 |
| 17-ago | CRM en vivo: cotizado vs vendido vs meta, reportero | https://app.tactiq.io/api/2/u/m/r/9I29aLrBRZn57Uwjlj8G |
| 28-ago | Plan 90 días, alertas, dashboard en 4 semanas | https://app.tactiq.io/api/2/u/m/r/ZjMEzh9AbdNioId6dtzv |
| 31-ago | Pamela — revisión avances visualizador (Randall dicta alcance) | https://app.tactiq.io/api/2/u/m/r/k7ytI0aCR9YP3Mn0bYhT |
| 27-ago | Dirección — Validar plan 90 días (sin Alejandro) | https://app.tactiq.io/api/2/u/m/r/vyDYbIdL7BvWEFm8mmmu |

---

## 1. Vista Admin — lo que pidió Alejandro, uno por uno

| # | Qué pidió (junta, `t=`) | Estado | Qué hay hoy / qué falta | Dato |
|---|---|---|---|---|
| 1 | **Venta del vendedor en un periodo, contra su meta, y cuánto le falta** con regla de tres al día N («estamos a día 21, deberías llevar…») — 21-jul `t=1258,2045` · 17-ago `t=2686` | 🟡 | Tabla Asesores (ventas, meta), popup y ficha (cumplimiento %, medidor). Falta: meta **en pesos** (Samuel: umbrales 300k / 600k / 1M) y el **ritmo esperado a la fecha** con el faltante. | `VENTAS_METAS` está en número de ventas; monto vendido sí viene |
| 2 | **Monto cotizado por etapa, foto a la fecha** — 17-ago `t=515` | 🟡 | Sección Embudo: tabla por etapa con leads, monto y días. Pero filtra por **leads asignados en el rango**: con «Este mes» no aparecen cotizaciones abiertas de meses anteriores. Alejandro quiere la foto de **todo lo abierto hoy**. | sí |
| 3 | **Antigüedad del cotizado**: cuánto es nuevo y cuánto tiene más de X días («se está muriendo»; empezar con 90 días → a perdido) — 17-ago `t=542,588,2719` | ❌ | Nada. Es lo que llamó «salud del pipeline». | `cotizacion` (fecha) + `presupuesto` por lead ya vienen → se calcula en el navegador. HubSpot solo trae fecha del deal que HOY está en esa etapa |
| 4 | **Pipeline sano = 10× la meta** (cotizado vs meta en pesos) — 29-jun `t=567` · 21-jul `t=825` · 17-ago `t=588` | ❌ | Nada. | Depende de la meta en pesos (#1) |
| 5 | **Visualizador cotizado vs vendido vs meta**, por vendedor y para todo el equipo; «dashboard visual en 4 semanas» — 17-ago `t=2705` · 28-ago `t=331` | 🟡 | Los tres números existen sueltos (presupuesto activo, monto cerrado, meta) pero no juntos ni en una gráfica; la tabla Asesores no trae **monto vendido**. | sí |
| 6 | **Cuántas cotizaciones hizo y cuánto cierra sobre cotizaciones** («4 ventas de 10 cotizaciones = 40 %; de 100, no está dando el kit») — 17-ago `t=757` | 🟡 | Columna Cotiz. sí. La conversión se calcula sobre **asignados**, no sobre cotizados. | sí |
| 7 | **Llamadas como hito**: intentadas, efectivas, resultado (no contestó / habló) por vendedor — 11-ago `t=1148` · 13-ago | ✅ | Actividad (barra + medidor de contestadas) y barra apilada por asesor con detalle. Calidad depende de que llamen desde `/llamar`; en HubSpot contestada = duración > 0. | sí |
| 8 | **Ver sin entrar a la ficha que ya se intentó hablar** con cada lead («por llamar siempre vacío») — 11-ago `t=2914,3210` · 21-jul `t=1742,2528` | ❌ | El popup del asesor solo lista nombre · tipo · días. Falta la **lista de leads por asesor con intentos (llamadas, msjs), última tarea y alerta «sin tarea»**, que es justo lo que Randall propuso el 13-ago `t=1396`. | `llamadas_cf`, `msjs`, `ult_tarea`, `sin_tarea`, `link` ya vienen por lead |
| 9 | **Tareas**: completadas, vencidas, leads sin tarea — 10-ago · 21-jul · 31-ago | ✅ | Barra apilada por asesor (completadas / vencidas / sin tarea) con detalle. | sí |
| 10 | **Primer contacto vencido**, con énfasis — 10-ago (tareas PC del supervisor) · 31-ago Pamela | ❌ | No se pinta, aunque `pcVencidas` **ya se calcula** en `porAsesor` (`metrics.ts`). Una columna. | Kommo sí; HubSpot no distingue PC (`pc_vencida=false`) |
| 11 | **Marcador de entrada / tasa de asignación como KPI #1 en color**: llegaron · con recibo · contestaron sin recibo · sin respuesta · asignados — 10-ago `t=950` · 11-ago `t=720,742` | ❌ en `/ventas` | Vive en el Sheet «Dashboard Leads Kenet» y en el tablero de marketing (embudo 5 pasos). `/ventas` arranca en «asignado». | El corte trae `funnel 0-5`, `recibo`, `respondio` (solo Kommo). Los no asignados traen `asignacion=0` y hoy quedan fuera del filtro de rango → habría que filtrarlos por **fecha de creación** |
| 12 | **Razón de descarte visible** — 13-ago `t=647` · 29-jul (lista de razones: precio, producto, otra empresa, sin interés, fuera de zona, expectativas, método de pago) | 🟡 | Solo el conteo «Descartados con razón registrada». Falta el desglose razón × n. | `razon` sí (Kommo `loss_reasons`; HubSpot `closed_lost_reason`) |
| 13 | **Tiempo a primer contacto** («ya tienes el recibo, empieza a correr el tiempo»; asignación tardaba hasta 1 día) — 11-ago `t=1148` · 16-jul | ❌ | Nada en `/ventas` (marketing sí tiene `primer_contacto_horas`). | Eventos traen `lead`, `ts`, `asignacion` → mediana de horas asignación→primera llamada/tarea se calcula en el navegador |
| 14 | **Reporte de efectividad del vendedor / 4 perfiles** actividad × venta (baja-baja sale; mucha actividad-baja venta se capacita…) — 29-jun `t=760` · 28-ago `t=348` | ❌ | Nada. | sí (actividad y ventas por asesor) → cuadrante o etiqueta por asesor |
| 15 | **Controlador de vuelo**: ver quién trae muchos leads atorados y reasignar; umbrales ≤ 5 PC pendientes y ≤ 100 seguimientos — 10-ago `t=1679` · 24-jul `t=3213` | 🟡 | Leads activos + minibarra por asesor. Sin «estancados > 7 días» (lo pidió Randall a Pamela) ni semáforo contra umbrales. | `dias_sin_cambio`, `pc_vencida`, `tareas_vencidas` sí |
| 16 | **Ordenar / filtrar la tabla por columna** (ej. quién tiene más PC vencido) — 31-ago | ❌ | Tabla fija, ordenada por leads activos. | solo UI |
| 17 | **Ranking / top asesores** en la vista admin — 31-ago | 🟡 | Leaderboard solo en «Mi día» del asesor; la tabla admin no ordena por ventas ni monto. | sí |
| 18 | **Junta 1:1 en 3 pasos** — meta → pipeline (monto y antigüedad) → tareas — «en una hoja por vendedor» — 29-jun `t=395` · 21-jul `t=1258` · 17-ago `t=2686` | 🟡 | Ficha trae paso 1 (ventas, meta, conversión, monto) y paso 3 (actividad por día, tareas). Falta el **paso 2** dentro de la ficha: cotizado por etapa, antigüedad, 10×. | sí (con #3 y #4) |
| 19 | **Alertas de gobernanza por correo**: bot falló, respuesta tardía, error en guion — 28-ago `t=216,254` | ❌ | No es del tablero: va en el server del salesbot + correo. Pendiente aparte. | server |
| 20 | **Análisis / calificación de llamadas** (grabación, «te controla el cliente», no hiciste llamadas) — 17-ago `t=1843` · 11-ago `t=1796` | ❌ | Fuera del tablero. Ya existe el copiloto IA (bot 62745: nota interna con score 1-5); a futuro se puede traer el score por asesor al tablero. | no (viene del bot) |

**Dirección comercial (27-ago, sesión sin Alejandro):** acumulado de ventas vs meta anual (189 M → 166 M recalibrada)
**por ciudad y por trimestre**, no mes a mes. 🟡 `/ventas` tiene filtro por equipo + preset trimestre + monto cerrado, pero
no meta por zona ni comparativo contra 2025. Registrado por si dirección lo pide en este tablero.

Lo que `/ventas` muestra y Alejandro **no** pidió: «Salud operativa» con/sin presupuesto (heredado del Sheet). Útil para el
auditor, pero no es prioridad; no estorba.

---

## 2. Prioridad sugerida para cerrar la vista Admin

Solo UI, datos ya en el corte (se pueden hacer en un solo build):

1. Columna **PC vencidas** en Asesores (#10) + columna **monto vendido** (#5) + ordenar por columna (#16).
2. Panel **Pipeline**: cotizado por antigüedad (≤30 / 31-60 / 61-90 / >90 días) y cotizado vs vendido vs meta por asesor (#3, #5). El 10× (#4) sale solo cuando exista meta en pesos.
3. **Lista de leads por asesor** en el popup/ficha con intentos, última tarea, sin tarea, días en etapa, link a la conversación (#8, #15).
4. **Tiempo a primer contacto** (mediana de horas) en Actividad (#13) y **razón de descarte** desglosada (#12).
5. **Cuadrante actividad × ventas** por asesor (#14) y paso 2 del 1:1 dentro de la ficha (#18).

Requieren decisión o cambio fuera de la UI: meta en pesos (#1, #4), bloque de entrada / tasa de asignación en `/ventas` (#11),
alertas por correo (#19), score de llamadas (#20).

---

## 3. Vista Asesor (fase 2) — lo que Alejandro dijo que debe ver el vendedor

Lo que ya existe en el perfil Asesor de `/ventas`: **Mi día** (tareas de hoy + rezago 14 d, ventas hoy vs meta diaria, llamadas,
prospectos nuevos, actividad día/semana, leaderboard, notas), **Mis ventas**, **Prospectos** (con búsqueda), **Calendario**.

| # | Lo que dijo (junta, `t=`) | Estado hoy | Para fase 2 |
|---|---|---|---|
| A | **Link propio por vendedor** «donde pueda ver cómo va» — 17-ago `t=2629` | ✅ | `#perfil=asesor&u=…` es compartible. Falta decidir acceso individual (hoy basic auth común). |
| B | **«Esto es lo que tienes que hacer hoy»**: la pantalla en blanco salvo lo pendiente; tareas primero — 5-ago `t=453,1914` · 24-jul `t=1571` | 🟡 | Mi día lista tareas, pero además trae KPIs, gráfica, leaderboard y notas. Alejandro pide **menos**: tareas arriba y el resto plegado. |
| C | **Cómo voy contra la meta, una sola gráfica, «me falta tanto»** — 5-ago `t=453` · 17-ago `t=2654` | 🟡 | Hay ventas hoy vs meta diaria. Falta acumulado del mes vs meta (en pesos) con el faltante y el ritmo esperado. |
| D | **Pestañas del concepto workspace**: tareas · **secuencias activas** (qué hizo el bot y cuándo entro yo) · calendario · acciones guiadas — 5-ago `t=1914-2058` | 🟡 | Tareas y calendario sí. Faltan: estado del bot por lead (cadencia / hunting: en qué intento va, si ya respondió) y «acciones guiadas» (siguiente paso sugerido por etapa). |
| E | **Mis clientes en qué van, sin preguntar a nadie**: etapa, intentos, última tarea, levantamiento agendado — 24-jul `t=1266,1427` · 13-ago `t=1465` | 🟡 | Prospectos trae nombre, etapa, monto, días sin cambio, vencidas y link. Faltan intentos (llamadas / msjs), última tarea y levantamiento como evento aparte. |
| F | **Marca visual por lead**: por llamar (vacío) → contactado (lo busqué, no hablé) → propuesta (hablé y califiqué); tope de 5-6 intentos antes de pasar de etapa — 11-ago `t=3034,3210` · 13-ago `t=2696` | ❌ | Pintar intentos y estado de contacto por tarjeta; mostrar cuántos intentos faltan. |
| G | **Sus comisiones a la vista** — 17-ago `t=1743` | ❌ | Enlazar a la app de comisiones (rcc622 + Supabase) o traer el acumulado del mes. |
| H | **Post-venta**: cliente cerrado → mensaje, pedir referido — 24-jul `t=1427` | ❌ | Mis ventas lista cierres; agregar recordatorio / acción de referido. |
| I | **Simple, tipo Excel / herramienta de comisiones; no agobiar** — 24-jul `t=1770` | ✅ | Principio de diseño; vigilarlo en cada pantalla nueva. |
| J | **Llamar desde la herramienta** para que quede registrado — 13-ago · 17-ago `t=408` | 🟡 | Existe `/llamar` (Twilio) fuera del tablero; poner botón «Llamar» por lead que abra `/llamar` con el número. |
| K | Randall a Pamela (31-ago): **el asesor no ve ventas de otros** | ⚠️ conflicto | El Leaderboard de Mi día muestra ventas de todos. Decidir: quitarlo, o dejar solo posición propia. |

---

## 4. Decisiones de Randall (4-sep-2026)

1. **Meta en pesos**: $800,000 MXN mensuales por asesor. Y una **página de Configuración** en el tablero para fijar metas individuales y por zona (prioridad asesor → zona → general).
2. **Cotizado sano = 10× la meta** ($8M cotizado vigente por asesor) y **vigencia de 90 días**.
3. **Foto del pipeline**: según el rango que se elija (para este uso, 90 días). Además Randall aclaró el alcance real: quiere ver el pipeline **como estaba en la fecha elegida** (hace 7 días, etc.) para ver evolución, liquidez entre etapas y estancamiento por etapa. Eso es un histórico, no una foto: ver §6.
4. **Tasa de asignación**: sí, en `/ventas`, para el auditor de CRM.
5. **Leaderboard**: sí, y también en la parte de Ventas del Admin.

## 5. Build 4-sep — qué quedó cubierto (commit en mkt-dashboard, desplegado a mkt-ventas)

| Requisito | Estado | Dónde |
|---|---|---|
| #1 Meta en pesos + esperado a hoy + faltante | ✅ | Tiles y panel «Cotizado vs vendido vs meta» (Venta), tabla Asesores (barra bullet con marca de meta y de esperado), popup, ficha, Mi día |
| Metas individuales y por zona (nuevo) | ✅ | Página **Configuración** (Admin) → `POST /ventas/config` → `data/ventas_config.json` |
| #3 Antigüedad del cotizado (≤30 / 31-60 / 61-90 / >90 rayado) | ✅ | Panel Venta (equipo) y ficha |
| #4 Pipeline 10× | ✅ | Bullet «Cotizado vigente» contra 10× la meta mensual (equipo y ficha) |
| #5 Cotizado vs vendido vs meta | ✅ | Panel Venta + columnas Vendido y Cotizado vig. en Asesores |
| #6 Cierre sobre cotizaciones | 🟡 | Sigue la conversión sobre asignados; la columna Cotiz. está al lado |
| #8 Intentos por lead sin abrir ficha | ✅ Kommo | Popup (6 leads) y tabla de leads en la ficha: intentos, últ. tarea, días, alertas. HubSpot dice «sin dato (HS)» |
| #10 PC vencidas | ✅ | Columna en Asesores (ordenable) + alerta por lead |
| #11 Tasa de asignación / marcador de entrada | ✅ | Sección «Entrada de leads · Kommo»: medidor + 6 conteos + barra |
| #12 Razón de descarte | ✅ | Actividad → lista razón × n |
| #13 Tiempo a primer contacto | ✅ Kommo | Actividad → mediana de horas, % en 24 h, sin contacto |
| #14 Perfiles actividad × venta | ✅ | Actividad → dispersión con medianas + leyenda por perfil |
| #15 Estancados / carga | 🟡 | «N estancados» bajo Leads activos; sin semáforo de umbrales |
| #16 Ordenar por columna | ✅ | Encabezados ordenables (teclado incluido) |
| #17 Ranking en Admin | ✅ | Panel «Ranking de ventas» (top 8) |
| #18 Paso 2 del 1:1 en la ficha | ✅ | Ficha: cumplimiento, cotizado vigente vs 10×, antigüedad, leads |
| #19 Alertas por correo · #20 score de llamadas | ❌ | Fuera del tablero (server / bot) |
| Botones Kommo · HubSpot (pedido de Randall 4-sep) | ✅ | Barra del Admin: incluir o excluir la data de cada CRM en todo el tablero; queda en la URL (`c=kommo` / `c=hubspot`) |
| Barra de filtros fija al hacer scroll; Entrada respeta el filtro de asesor/equipo; embudo con más aire (Randall 4-sep) | ✅ | Toolbar sticky; `entrada()` cuenta por responsable actual del lead cuando hay filtro |
| Drill-down como en HubSpot: clic en cifra/barra → ventana con los registros y liga al lead en Kommo o HubSpot (Randall 4-sep, video) | ✅ | `DrillModal` en todo el Admin, tabla de Asesores y ficha; sin contraseña (`VENTAS_PUBLICO=1`) |
| Configuración: ojo para activar/desactivar asesores, equipo de ventas por asesor, Guardar arriba (Randall 4-sep) | ✅ | `ocultos` y `equipos` en `data/ventas_config.json`; aplica en menú, tabla, ranking, perfiles y cifras |
| Acceso por usuario y contraseña para asesores y administradores (Randall 4-sep; cubre el punto A de fase 2: link propio) | ✅ | Sesión en app.py, `data/ventas_usuarios.json`, panel Accesos en Configuración; el asesor solo recibe su parte del corte |
| Reordenar las gráficas arrastrando los widgets (Randall 4-sep) | ✅ | `WidgetGrid` en Dashboard y Mi día; asa ⋮⋮ + ▲▼; orden por navegador |

Hallazgo del build: **HubSpot no liga tareas ni llamadas al deal** (0 de 3,866 deals abiertos con evento), así que
primer contacto e intentos son solo Kommo; la actividad por asesor sí incluye HubSpot.

## 6. Siguiente build — pipeline histórico (lo que Randall aclaró el 4-sep)

Objetivo: elegir una fecha y ver el pipeline **como estaba entonces**; comparar dos fechas = evolución;
liquidez = cuántos leads avanzaron de etapa en el periodo; estancamiento = días sin moverse por etapa.

- **Ya vivo desde este deploy:** `ventas_corte.py` guarda una foto diaria del embudo (leads y monto por
  etapa, total y por asesor) en `data/ventas_hist.jsonl`; `GET /ventas/hist.json` la sirve. Acumula desde
  hoy; no se puede reconstruir hacia atrás con esto.
- **Para reconstruir hacia atrás (Kommo):** bajar eventos `lead_status_changed` (traen etapa anterior y
  nueva con fecha) en `ventas_kommo.py`, guardar por lead la lista de transiciones, y en la UI calcular la
  etapa a cualquier fecha + movimientos por etapa en el rango. HubSpot solo trae la fecha de entrada a
  la etapa ACTUAL (`hs_v2_date_entered_current_stage`): se puede saber cuánto lleva ahí, no dónde estaba.
- Estimado: extractor 1-2 h · UI (foto a la fecha, evolución, liquidez, estancamiento) 3-4 h.
