# Kenet Solar — Especificación de Diseño del Dashboard

**Versión:** 1.0  
**Fecha:** Septiembre 2026  
**Stack:** React 19 + Vite + Tailwind CSS v4  
**Archivo principal:** `src/App.tsx` · `src/dashboard.css`

---

## 1. Estilo Global

| Atributo | Valor |
|---|---|
| Paleta | Blanco `#fff` y negro `#000` con grises intermedios |
| Tipografía | Inter, sans-serif |
| Bordes | Rectos, `2px solid #000` en contenedores principales |
| Sombras | Solo en popups flotantes: `4px 4px 0 #000` (offset sólido) |
| Emojis | Ninguno en ningún texto de la interfaz |
| Acentos | Gris `#888` para etiquetas secundarias, `#eee`/`#f0f0f0` para fondos alternativos |

### Segmentos de colores en barras

| Clase | Color | Uso |
|---|---|---|
| `seg-comp` | `#111` (negro) | Completadas / Contestadas |
| `seg-warn` | `#888` (gris medio) | Vencidas / Sin contestar |
| `seg-empty` | `#ccc` (gris claro) | Sin tarea |

---

## 2. Shell y Layout Principal

```
┌──────────────────────────────────────────────────────┐
│  HEADER (54px)  Logo · · · · · · · · · [U] [Admin|Asesor] │
├────────────┬─────────────────────────────────────────┤
│  SIDEBAR   │  MAIN (overflow-y: auto)                │
│  (168px)   │                                         │
│            │                                         │
└────────────┴─────────────────────────────────────────┘
```

- **Grid:** `grid-template-rows: 54px 1fr` / `grid-template-columns: 168px 1fr`
- **Responsive < 960px:** Sidebar colapsa; hamburguesa `☰` aparece en el header; grids de contenido se apilan a una columna
- **Responsive < 640px:** KPIs pasan a 2×2; tabla de asesores se hace scrollable

---

## 3. Header

- Logo "Kenet Solar" a la izquierda (`font-size: 20px; font-weight: 700`)
- Icono de usuario circular a la derecha (`width/height: 32px; border-radius: 50%; border: 2px solid #000`)
- Toggle **Admin / Asesor** tipo pill: `border-radius: 999px; overflow: hidden` con borde exterior `2px solid #000`; botón activo en negro sólido (`background: #000; color: #fff`)

---

## 4. Sidebar

Navegación vertical con ítems en `border: 2px solid #000`. Ítem activo: `background: #000; color: #fff`.

| Perfil Admin | Perfil Asesor |
|---|---|
| Dashboard | Mi día |
| Asesores | Mis ventas |
| | Prospectos |
| | Calendario |

---

## 5. Toolbar (vista Admin)

Aparece arriba del contenido principal en ambas páginas Admin.

- Dropdown **"Todos los equipos"** — opciones: Equipo Norte, Equipo Sur, Equipo Central
- Dropdown **"Todos los propietarios"** — lista de asesores
- Botón **fecha** con icono CSS (sin emoji): muestra el rango activo (ej. "Este mes"). Al hacer click abre el `DateRangePicker`

### DateRangePicker

Panel flotante `position: fixed; top: 80px; right: 24px; z-index: 201; box-shadow: 4px 4px 0 #000`.

**Estructura interna:**
```
┌──────────────┬────────────────────────────────┐
│ Predeterminados │  [‹]               [›]       │
│  Hoy           │  Mes A        Mes B           │
│  Esta semana   │  Lu Ma Mi Ju Vi Sá Do         │
│  Este mes      │  [dias del mes]               │
│  Mes pasado    │                               │
│  Este trimestre│  dd mmm yyyy → dd mmm yyyy    │
│                │  [Cancelar]  [Aplicar]        │
└──────────────┴────────────────────────────────┘
```

- Selección de rango manual por click (primer click = inicio, segundo click = fin)
- Preview del rango seleccionado en texto antes de aplicar
- Preset activo se resalta en negro

---

## 6. Vista Admin — Dashboard

Tres secciones en acordeón (`CollapsibleSection`). Solo **Venta** abierta por defecto; **Embudo** y **Actividad** colapsadas.

---

### 6.1 Sección Venta (abierta por defecto)

**Salud Operativa** — ocupa el ancho completo del acordeón.

```
┌──────────────────────────────────────────────────────┐
│ SALUD OPERATIVA                                      │
│  Con presupuesto ($>0)  │  Sin presupuesto           │
│  Ventas      88         │  Ventas      86            │
│  Hunting      0         │  Hunting      0            │
│  Subtotal:   88         │  Subtotal:   86            │
│                                                      │
│  [████████████████░░░░░░░░░░░░░░░░░░░░░]            │
│  50% con presupuesto · 88    50% sin presupuesto · 86│
│  Total registros: 174                                │
└──────────────────────────────────────────────────────┘
```

- Dos grupos lado a lado separados por `div.salud-divider` (1.5px gris)
- Números grandes: `font-size: 22px; font-weight: 700`
- Barra de comparación proporcional horizontal (`height: 10px; border: 1.5px solid #000`), segmento negro = con presupuesto

---

### 6.2 Sección Embudo (colapsada)

Dos columnas con gráfica de embudo centrado. Separadas por `div.embudo-divider`.

**Columna izquierda — "Monto cotizado por etapa"**  
**Columna derecha — "Tiempo promedio por etapa"**

Etapas: Prospecto → Contactado → Cotizado → Negociación → Cierre

Cada etapa tiene:
- Label de la etapa (izquierda)
- Valor + badge de cambio vs etapa anterior (derecha)
  - Badge bajada: fondo `#f0f0f0`, texto negro (`▼ X%`)
  - Badge subida: fondo `#000`, texto blanco (`▲ X%`)
- Barra centrada de ancho proporcional (`height: 26px; border: 2px solid #000`)
- Conector SVG trapezoidal entre etapas (líneas de contorno, sin relleno)

**Datos del embudo:**

| Etapa | Monto | Tiempo/etapa | Tiempo acumulado |
|---|---|---|---|
| Prospecto | $8.2M | — | 0d |
| Contactado | $6.5M | 2.3d | 2.3d |
| Cotizado | $4.1M | 5.1d | 7.4d |
| Negociación | $2.3M | 8.7d | 16.1d |
| Cierre | $1.08M | 12.4d | 28.5d |

---

### 6.3 Sección Actividad (colapsada)

**Actividad General**

**Recuadro de Llamadas Hechas** — un solo bloque con:
- Label "Llamadas Hechas" + total `1,690` en el encabezado
- Stacked progress bar: negro (contestadas 1,095) + gris (sin contestar 595)
- Al hacer **hover o click** aparece tooltip flotante con:
  - Contestadas: `1,095` · `65%`
  - Sin contestar: `595` · `35%`
  - Total: `1,690` · `100%`

**Grid 2×2 de métricas** (`font-size: 32px bold`):

| Métrica | Valor |
|---|---|
| Descartados con razón registrada | 249 |
| Tareas completadas | 2,592 |
| Cotizaciones entregadas | 121 |
| Levantamientos solicitados | 0 |

---

## 7. Vista Admin — Asesores

### 7.1 Tabla

Sin leyenda de colores. Columnas siempre visibles:

| Columna | Contenido |
|---|---|
| Asesor | Avatar circular (iniciales) + nombre + submeta (ventas · meta) |
| Leads activos | Número grande + mini barra proporcional |
| Presupuesto | Monto formateado (ej. $3.8M) o "—" |
| Llamadas | Stacked bar (negro=contestadas, gris=sin contestar) + total |
| Tareas | Stacked bar (negro=completadas, gris=vencidas, gris claro=sin tarea) + total |
| Cotiz. | Número |
| Desc. | Número |
| Levant. | Número |

- Las barras se normalizan globalmente (mismo máximo de referencia entre asesores)
- **Click en una fila** → abre popup del asesor junto al cursor
- **Click en una barra específica** (Llamadas o Tareas) → abre popup de detalle de esa barra con:
  - Título: "Llamadas / Tareas · Nombre del asesor"
  - Total
  - Desglose por categoría: nombre · cantidad · porcentaje del total
  - Se cierra al hacer click fuera

### 7.2 Datos de asesores

| Asesor | Ventas | Meta | Leads | Presupuesto | Llamadas | Contestadas | Cotiz. | Desc. | Levant. |
|---|---|---|---|---|---|---|---|---|---|
| Adriana Sanchez | 64 | 70 | 51 | $3.8M | 297 | 205 | 64 | 6 | 12 |
| Marco Pérez | 50 | 70 | 44 | $2.6M | 493 | 324 | 50 | 101 | 8 |
| Carlos Campillo | 34 | 50 | 35 | $1.9M | 313 | 213 | 0 | 34 | 5 |
| Samuel Giacoman | 1 | 30 | 4 | $330K | 293 | 203 | 1 | 28 | 1 |
| Erick Barajas | 6 | 30 | 4 | $293K | 54 | 22 | 6 | 28 | 2 |
| Monserrat León | 0 | 30 | 20 | $100K | 7 | 1 | 0 | 0 | 0 |
| Randall | 0 | 30 | 214 | — | 233 | 127 | 0 | 52 | 0 |

---

### 7.3 Popup del Asesor

Aparece **junto al cursor del mouse** (offset 14px). Lógica de volteo: si el popup se saldría por la derecha, aparece a la izquierda del cursor; si se saldría por abajo, sube.

```
┌─────────────────────────────────────────┐
│ [AB]  Nombre Asesor         [↗]  [×]   │
├───────────────┬──────────────┬──────────┤
│ VENTAS        │ CUMPLIMIENTO │ LEADS    │
│ 64            │ 91%          │ 51       │
├───────────────────────────────────────  │
│  [mini gráfica de área]                 │
├─────────────────────────────────────────┤
│ LEADS ACTIVOS          ‹ sep ›  [donut]│
│ · Nombre Lead  [tipo]  Xd               │
│ · Nombre Lead  [tipo]  Xd        XX%   │
│                                  META  │
├─────────────────────────────────────────┤
│         Ver perfil completo →           │
└─────────────────────────────────────────┘
```

- `[↗]` y "Ver perfil completo →" navegan a la ficha completa del asesor
- `[×]` cierra el popup sin oscurecer el fondo

---

### 7.4 Ficha Completa del Asesor

Ruta activada por `↗` o "Ver perfil completo". Reemplaza el contenido principal.

**Toolbar:**
- `← Volver` — regresa a la tabla de Asesores
- Avatar + Nombre + badge de estado

**Grid 2×2 de KPIs:**
- Tarjeta hero (superior izquierda): "Ventas del mes" con número en `52px bold` + mini gráfica de área
- Tarjeta superior derecha: Conversión %
- Tarjeta inferior izquierda: Cumplimiento %
- Tarjeta inferior derecha: Monto total MXN

**Gráfica de burbujas por día:**
- Navegador de fecha `‹ dd mmm ›`
- Burbujas de tamaño proporcional por columna de día

**Sección Tareas & Leads:**
- Tarjetas con: badge de tipo · nombre del lead · descripción · días restantes

---

## 8. Vista Asesor — Mi Día

### 8.1 Bloque superior (dos columnas)

**Izquierda — Grid 2×2 de KPIs:**

| KPI | Valor de ejemplo |
|---|---|
| Tareas hoy | X/5 completadas |
| Ventas del día | 3 (meta diaria: 5) |
| Llamadas realizadas | 7 |
| Prospectos nuevos | 2 |

Bordes internos: cada celda separada por `2px solid #000`.

**Derecha — Gráfica de barras de actividad:**
- Tabs **Día / Semana** (pill style)
- Barras verticales `border: 2px solid #000` con label debajo

### 8.2 Bloque inferior (dos columnas)

**Tareas del día (checklist):**
- Cada fila: checkbox de estado · texto de tarea · hora · badge de estado
- Estados: `Pendiente` / `En progreso` (fondo gris) / `Completado` (fondo negro, texto blanco)
- Click en fila cicla el estado: Pendiente → En progreso → Completado → Pendiente
- Botón `+ Agregar tarea` con borde dashed

**Columna derecha (apilada verticalmente):**

*Leaderboard · Hoy:*
- Ranking numerado: posición · nombre · ventas · puntos
- Posiciones 1–3 en negro, resto en gris
- Fila del usuario actual resaltada con `background: #f3f3f3; font-weight: 700`

*Notas del día:*
- Textarea libre, `height: 88px`, sin borde interno

---

## 9. Componentes Reutilizables

### StackedBar
Barra de progreso apilada con normalización global.

```
Props:
  segs:  { val: number; cls: string }[]
  total: number   // total de esta fila
  max:   number   // máximo global (para normalizar anchos)
```

### LlamadasBar
Recuadro único con header (label + total) y una stacked bar. Tooltip al hover/click con desglose.

### BarDetailPopup
Popup de detalle para barras de la tabla de asesores. Aparece debajo del elemento clickeado. Muestra total + filas con label / cantidad / porcentaje. Se cierra al hacer click fuera.

### CollapsibleSection
Acordeón con flecha `▲/▼`. Recibe `defaultOpen` boolean.

### DateRangePicker
Selector de rango con presets y dos meses lado a lado. Presets: Hoy, Esta semana, Este mes, Mes pasado, Este trimestre.

### Donut
`conic-gradient` con mask radial. Props: `pct` (0–100), `label`.

### FunnelChart + FunnelConnector
Embudo centrado con barras `justify-content: center` y conectores SVG trapezoidales entre etapas.

### MiniAreaChart
SVG con path poligonal + relleno con gradiente de opacidad.

### BubbleChart
Columnas de círculos `border-radius: 50%` de tamaño variable.

---

## 10. Modelo de Datos

Fuente: **Kommo CRM**

### Leads_Data (1 fila = 1 lead)

| Campo | Tipo | Descripción |
|---|---|---|
| ID | string | Identificador único |
| Lead | string | Nombre del prospecto |
| Creado | date | Fecha de creación |
| Pipeline | enum | Leads Nuevos / CADENCIA RECIBO CFE / Ventas |
| Etapa | string | Etapa actual en el pipeline |
| Asesor | string | Nombre del asesor asignado |
| Presupuesto | number | Monto ($), 0 = sin presupuesto |
| Recibo | boolean | SÍ / NO |
| Respondió | boolean | SÍ / NO |
| Estado funnel | enum | 0·Perdido, 1·No contestó, 2·Respondió sin recibo, 3·Con recibo, 4·Asignado |
| Tareas abiertas | number | |
| Tareas vencidas | number | |
| 1er Contacto vencida | boolean | |
| Días sin cambio | number | |
| Llamadas | number | Total de intentos |
| Últ. llamada | date | |
| Sin tarea | boolean | |
| Razón del descarte | string | |
| Tareas completadas | number | |
| Cotización entregada | boolean | |
| Levantamiento solicitado | boolean | |

### Eventos_Data (1 fila = 1 evento)

| Campo | Tipo | Descripción |
|---|---|---|
| Fecha | datetime | Timestamp del evento |
| Tipo | enum | tarea, llamada, … |
| Asesor | string | |
| Lead | string | |
| Asignado | string | Asesor asignado |
| Embudo | string | Pipeline |

---

## 11. Filtros Globales

Todas las métricas responden a:

| Filtro | Afecta |
|---|---|
| Rango de fecha de asignación | Leads, métricas del funnel |
| Rango de fecha de actividad | Actividad General (llamadas, tareas) |
| Equipo | Todo |
| Propietario / Asesor | Todo |

---

## 12. Responsive

| Breakpoint | Comportamiento |
|---|---|
| `> 960px` | Layout completo: sidebar fijo + grid de dos columnas en contenido |
| `≤ 960px` | Sidebar colapsa a hamburguesa; todos los grids de dos columnas pasan a una; embudo se apila verticalmente |
| `≤ 640px` | KPIs a 2×2; popup de asesor a ancho casi completo de ventana |
