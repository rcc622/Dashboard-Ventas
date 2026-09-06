# Auditoría visual del tablero de ventas `/ventas` — 6 de septiembre de 2026

Pedido de Randall con siete capturas de defectos («necesito una mejora visual… auditoría exhaustiva»),
corrido en modo meta (goal `g-20260906-0819`) con `ui-ux-pro-max` como guía de reglas y un script de
medición propio (`audit_visual.py`: Playwright sobre el servidor local con copia del corte, layout por
defecto, a 1440 / 1280 / 390 px, en Dashboard, Asesores, ficha, Mi día, Mis ventas, Prospectos,
Calendario y Configuración). Mide desborde horizontal, textos recortados, widgets con alto vacío,
scroll interno, textos SVG escalados, fuentes menores de 11 px y tablas con scroll horizontal.

## Estado final (medido tras las correcciones)

| Métrica (todas las páginas, 1280 y 390 px) | Antes | Después |
|---|---|---|
| Desbordes horizontales de página | 0 | 0 |
| Textos recortados (fuera de los títulos solo para lector de pantalla) | 0 | 0 |
| Widgets con más del 40 % de alto vacío en el layout por defecto | 9 (Primer contacto 74 %, Llamadas 75 %, Ventas reales 82 %, Entrada 52 %, Salud 43 %, Cotizado vs vendido 42 %, Mi día en números 48 %, Actividad de Mi día 49 %, Notas 78 %) | 0 (el estado vacío de Ventas reales llena su tarjeta) |
| Textos SVG de la dispersión mayores de 20 px | 1 (eje «vendido →» a 46 px, cuadrantes a 24 px) | 0 (ahora 11–11.5 px fijos) |
| Elementos de texto menores de 11 px | 8 (etiquetas 10 px, iniciales 9.5 px, burbujas 10 px, × de 9.5 px) | 0 |
| Scroll interno en widgets con contenido corto | Ranking, Entrada | 0 (solo quedan listas largas: Leads activos, Tareas, Leaderboard) |

Pruebas: `e2e_grid.py` (30 comprobaciones de la rejilla) «FALLAS: ninguna»; `e2e_v2.py` (E2E general,
96 líneas) sin Traceback y solo los dos 401 esperados.

## Hallazgos

Severidad: **alta** = se ve roto o impide leer; **media** = se ve descuidado; **baja** = detalle.

| # | Hallazgo | Dónde | Sev. | Estado y corrección |
|---|---|---|---|---|
| H-01 | Widgets de alto fijo con el 70–80 % vacío (Primer contacto, Llamadas, Ventas reales, Notas) y otros con 40–50 % (Salud, Cotizado vs vendido, Entrada, Mi día en números, Actividad) | Dashboard, ficha, Mi día | alta | **Corregido.** Cada widget trae ahora un `alto` por defecto medido contra su contenido (cifras 4 filas; Llamadas 4; Salud y Cotizado 7; Entrada 7; Ranking y Ventas reales 10; Embudo y Etapas 9; Razones 7; Perfiles 6 × 9; ficha: Actividad 6, Cotizado 6; Mi día: números 6, Actividad 6, Notas 5). La nota de Mi día llena su tarjeta (`textarea` flexible). |
| H-02 | Primer contacto: 26 % de uso; la mediana sola no dice cómo se reparte la atención | Dashboard | media | **Corregido.** Distribución por tramos (menos de 1 h, 1–4 h, 4–24 h, más de un día) con barra, conteo, porcentaje y drill a los leads de cada tramo (`PC_TRAMOS`, `.pc-dist`). |
| H-03 | Dispersión de Perfiles: el SVG escalaba con el widget y a pantalla completa las letras medían 46 px, las burbujas 30 px | Dashboard | alta | **Corregido.** `Scatter` mide su caja con `ResizeObserver` (`useSize`) y dibuja 1 unidad = 1 px: crece con el widget, las letras (11–11.5 px), burbujas (11–13 px) y ejes no. |
| H-04 | Embudo con bandas no monótonas: «Por contactar» 421 < «Conversación iniciada» 542 se dibujaba como embudo invertido con punta rara | Dashboard | alta | **Corregido.** Cada etapa es una barra centrada con el ancho de su propio conteo (`rect`), sin trapecios: son fotos por etapa, no un flujo que solo baja (regla del catálogo de gráficas: embudo solo si decrece monótono). |
| H-05 | Ventas reales: scroll interno con la nota al pie recortada; y en un mes sin ventas, un renglón gris perdido en una tarjeta vacía | Dashboard | media | **Corregido.** Alto de 10 filas; la tabla se desplaza adentro de la tarjeta (`.scrollx.crece`) y la nota al pie queda siempre visible (medido: 12 filas, nota visible = true); el mes sin ventas muestra un estado vacío centrado que llena la tarjeta (`.vacio`, 0 % vacío medido). |
| H-06 | Dos botones «i» pegados en el encabezado (Monto por etapa; Cumplimiento en la ficha) | Dashboard, ficha | media | **Corregido.** `Info` acepta varios términos y pinta UN botón con las definiciones separadas. |
| H-07 | Anillo de foco a todo lo ancho del renglón (ranking) y deforme alrededor de banda + etiqueta del embudo; barras del ranking desalineadas (la columna del monto era `auto` y cada renglón medía distinto: 3 posiciones de barra distintas) | Dashboard | media | **Corregido.** En renglones clicables (`.lr.drill`, `.frow.drill`, `.row`) el anillo va 2 px adentro con esquinas de 8 px (medido en foco: outline 2 px, offset −2 px, radio 8 px); columna del monto fija a 168 px → las 8 barras arrancan en la misma x (medido: 1 posición, 1 ancho). |
| H-08 | Tabla de Perfiles apretada: columna «Perfil» en cuatro líneas, scroll horizontal, y apilada bajo la dispersión a media pantalla | Dashboard | media | **Corregido.** Perfiles ocupa las 6 columnas por defecto (dispersión a la izquierda, tabla a la derecha), la columna Perfil dice el cuadrante (Mantener / Capacitar / Revisar / Salida, descripción larga en el tooltip) y la tabla tiene de 360 a 440 px. En móvil (390 px) la tabla conserva scroll horizontal propio: es la regla de tablas en pantallas angostas. |
| H-09 | Fuentes de 10 px o menos: etiquetas `.tag`, estados `.st`, «N ventas · %» del ranking, iniciales de Perfiles (9.5), burbujas de Actividad, × de los widgets (9.5) | todo | media | **Corregido.** Todo texto ≥ 11 px; el × sube a 13 px. |
| H-10 | Medidores y donas crecen hasta 250 px y se comen la tarjeta a pantalla completa | Dashboard | baja | **Corregido.** Tope a 210 px. |
| H-11 | Rejilla por defecto: con alturas distintas el flujo dejaba escalones y huecos | Dashboard | media | **Corregido.** Orden de colocación por bandas de igual alto (`ORDEN_ADMIN`): 6 cifras · 3 cifras + Llamadas · Salud + Cotizado · Ranking + Ventas reales · Entrada · Embudo + Etapas · Primer contacto + Razones · Perfiles. |
| H-12 | Tabla «Monto cotizado y tiempo por etapa» se pasaba 12 px del ancho en móvil | Dashboard 390 px | baja | **Corregido.** Celdas con menos padding a ≤ 640 px. |
| H-13 | Primer contacto y Razones eran un solo widget sin relación entre sí | Dashboard | media | Corregido el 5-sep (previo a esta auditoría). |

### Deliberado, no se toca

- **Scroll interno** en Leads activos, Tareas abiertas, Tareas del día y Leaderboard: son listas largas; el
  alto fijo es el modelo de la rejilla (como Kommo y HubSpot).
- **Tabla de Perfiles con scroll horizontal en móvil** (H-08): regla «tables on mobile: horizontal scroll
  or card layout»; el tablero de administración no está pensado para 390 px.

## Cómo volver a medir

```bash
python "<scratchpad>/audit_visual.py" 1280,390     # resumen por página + audit/hallazgos.json + capturas
python "<scratchpad>/shots_widgets.py" "#perfil=admin&p=dashboard&r=mes_pasado"   # un recorte por widget
```

Los scripts viven en el scratchpad de la sesión del 6-sep (`e5d1f023…`); si se necesitan de nuevo, se
copian al repo bajo `tools/` (todavía no, para no arrastrar Playwright al servicio).
