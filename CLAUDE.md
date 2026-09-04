# Dashboard de crecimiento — Kenet Solar

Tablero de Meta Ads + CRM que corre en Railway y se refresca cada 6 h. Genera un
solo HTML estático: sin framework, sin build, solo stdlib de Python.

```
app.py             servicio HTTP (basic auth, refresh en hilo, cola de instrucciones)
dashboard.py       arma el HTML. Es el único que sabe de presentación.
dashboard_style.css hoja de estilo del HTML generado
meta.py            toolkit de la Meta Marketing API (lectura y escritura)
crm_hubspot.py     extractor HubSpot  -> data/crm_recon.json
crm_kommo.py       extractor Kommo    -> data/crm_recon.json  (mismo contrato)
zonas.py           cobertura geográfica: qué ciudad es nuestra y cuál no
cola.py / piloto.py  ejecución de instrucciones encoladas
```

---

## Zonas de asignación — REGLA CANÓNICA

Aplica al dashboard de HubSpot **y al de Kommo cuando migre**. Vive en
`zonas.py`; los tres consumidores (`crm_hubspot.py`, `crm_kommo.py`,
`dashboard.py`) la leen de ahí. Si cambia la cobertura se cambia en ese archivo
y nada más.

### Cobertura

| Zona | Qué incluye |
|------|-------------|
| **MTY** | Monterrey, su zona metropolitana y el resto de Nuevo León (Apodaca, San Nicolás, Guadalupe, Santa Catarina, García, Escobedo, San Pedro, Juárez NL, Cadereyta, Salinas Victoria, Montemorelos, Linares, Sabinas Hidalgo, Allende NL…) |
| **SLT** | Saltillo y su zona metropolitana: Ramos Arizpe, Arteaga, General Cepeda, Parras |
| **TRC** | Torreón y la Comarca Lagunera, de los dos lados: Gómez Palacio, Lerdo, Matamoros (Coahuila), San Pedro de las Colonias, Francisco I. Madero, Viesca, Tlahualilo, Mapimí, Bermejillo |
| **MVA** | Monclova, Región Centro (Frontera, Castaños, Nadadores, San Buenaventura, Cuatro Ciénegas, Candela, Sacramento, Lamadrid) y Región Carbonífera (Sabinas Coah., Nueva Rosita, San Juan de Sabinas, Múzquiz, Palaú, Agujita) |

**No es cobertura**, aunque sea Coahuila: Acuña, Piedras Negras, Nava, Zaragoza,
Guerrero, Villa Unión, Ocampo y toda la Región Norte. Tampoco lo es Tampico,
Reynosa, Matamoros **Tamaulipas**, Nuevo Laredo ni el resto del país.

### Cómo se decide

1. Se lee **`city`** (texto libre) junto con **`state`**, y **`ciudad`** (picklist)
   y **`otra_ciudad`** de HubSpot. En Kommo, la Ciudad del **contacto** — no del
   lead; el lead no tiene ese campo.
2. **El texto libre manda sobre el picklist.** `ciudad` solo tiene cinco cajones
   (Monterrey / Saltillo / Torreón / Monclova / Otro), así que un lead de Tampico
   acaba marcado "Monterrey" porque no hay dónde más ponerlo. Si `city` dice una
   ciudad conocida, esa gana. El picklist solo desempata cuando el texto libre no
   resuelve.
3. El veredicto es uno de siete: `MTY` `SLT` `TRC` `MVA` `FUERA` `AMBIGUO`
   `SIN_DATO`.

### Homónimos — nunca se adivinan

Estos nombres existen en dos estados y el veredicto cambia. Sin estado se
reportan como `AMBIGUO` y se revisan a mano; **no se asignan por default**:

| Nombre | Con estado |
|--------|-----------|
| Matamoros | Coahuila → **TRC** · Tamaulipas → FUERA |
| Juárez | NL → **MTY** · Chihuahua/Coahuila → FUERA · Durango → **TRC** |
| Guadalupe | NL → **MTY** · Zacatecas → FUERA |
| Escobedo | NL → **MTY** · Coahuila → **MVA** |
| Abasolo | NL → **MTY** · Coahuila → **MVA** · Gto/Tamps → FUERA |
| Sabinas | Coahuila → **MVA** · (Sabinas **Hidalgo** es NL → MTY) |
| Hidalgo, Allende, Santiago, Progreso, Morelos, Zaragoza | ver `zonas.HOMONIMOS` |

### Consecuencia en las métricas — esto es lo importante

Un lead **fuera de zona no cuenta como lead que faltó asignar.** No hay a quién
asignárselo. Antes iba al mismo saco y hacía dos daños a la vez: pintaba al
equipo interno peor de lo que está, y escondía el problema real, que es la
campaña apuntando a donde no vendemos.

Se separan en dos números con dos dueños distintos:

- **Leads en zona sin asesor** → problema del **CRM**. Se arregla con la regla de
  asignación por zona.
- **Leads fuera de cobertura** → problema de **Meta**. Se arregla con la geo del
  adset (lista de ciudades, no radio en kilómetros) o con la pregunta de ciudad
  del formulario.

El embudo de la portada lleva un paso "En zona" entre "Llegó al CRM" y "Tiene
asesor" justo para que esa resta se vea.

### Campos que produce `crm_recon.json`

`por_ventana` trae **seis** llaves: `"7" "14" "28" "30" "60" "90"`.

En **todas**:

```
leads_total, leads_meta, asignados
leads_por_canal       {canal: n} — Meta / Google / Web / Redes / Directo
google_por_campana    [{campana, keyword, leads, asignados}]
won_meta              {count, mxn} ventas con origen Meta cerradas en la ventana
won_meta_por_zona     {zona: {count, mxn}}
por_asesor            [{rep, zone, leads, ventas, mxn}] de ESA ventana. Desde
                      2026-08-23 ventas/mxn/cohorte cuentan TODOS los canales
                      (leads sigue siendo los de Meta); won_meta queda solo-Meta
embudo                {asignados_por_canal, propuesta_por_canal, ventas_por_canal,
                      ventas_total, etapa_propuesta} — el embudo total de 5 pasos
```

`won_meta_por_zona`: en **Kommo** es la ciudad del cliente, y cuando la venta no
la trae (pasa seguido), la zona del asesor que cerró — perder la venta del
marcador es peor que atribuirla a quien la hizo. En **HubSpot** siempre es la del
asesor: el deal no trae ciudad y pedir su contacto sería una llamada por venta.
La nota del marcador dice cuál de las dos está usando.

`por_anuncio_*` existe en las **seis** ventanas. Y solo la cuenta nueva
(`Kenet Solar_Ads`, act_2466618450515283) manda leads a Kommo: los anuncios de
las otras dos cuentas salen «sin rastreo» **por diseño**, y la tabla lo dice así
en vez de dejar que se lean como veinte fallas.

`por_asesor` se cuenta **por nombre**, nunca por `(nombre, zona)`: la zona sale
del lead cuando el CRM no la guarda en el usuario, así que el mismo asesor
aparecía en dos filas con sus leads partidos a la mitad.

Solo en las **cortas** (7/14/28), porque validar ciudad en Kommo cuesta una
llamada a la API por contacto y a 90 días son ~10 mil:

```
asignables            leads de Meta cuya ciudad SÍ cae en cobertura
llegaron_por_zona     {MTY,SLT,TRC,MVA} leads en zona, con o sin dueño
asignados_por_zona    {…} los que ya tienen asesor
sin_asignar_por_zona  {…} llegaron - asignados. El problema de ruteo, por zona.
fuera_de_zona         cuántos cayeron fuera de cobertura
fuera_por_ciudad      {ciudad: n} top 15 — de aquí sale qué geo corregir
zona_ambigua          homónimos sin estado
sin_ciudad            sin ningún dato de ciudad
```

Contacto humano, velocidad y ciclo (también dentro de cada ventana):

```
contactados            leads de Meta con un toque HUMANO. En Kommo = mensaje
                       saliente o tarea completada con created_by de un usuario
                       real (el bot firma con 0: contarlo daría 100%). En
                       HubSpot = hs_sa_first_engagement_date (39% de llenado,
                       la mejor marca del portal).
primer_contacto_horas  mediana de horas creación→primer toque. El action time.
etapas                 [{id, nombre, n}] dónde está HOY cada lead/deal creado en
                       la ventana, del pipeline de ventas con más volumen. Es
                       foto, no flujo: un ganado pasó por todas y cuenta una vez.
por_asesor[].cohorte   de los leads que le entraron en la ventana, cuántos YA
                       cerró (venga el cierre de cuando venga). La conversión de
                       la tabla usa ESTA base: la de periodo castigaba al que
                       más leads nuevos recibía.
```

El paso 3 del embudo es «Lo contactaron» cuando el corte trae `contactados`;
sin él cae a «Tiene asesor». En Kommo «tiene asesor» medía al robot (asigna al
crear el lead: 100% siempre); el contacto humano real ronda el 39%.

### El seguro de pausa se arma desde la página (24 h)

`POST /armar-pausa {armar:true|false}` escribe `data/pausa_armada.json` con un
vencimiento a 24 h; `pausa_activa()` = env `PAUSA_ACTIVA=1` (permanente, manda y
no se apaga desde la página) O la ventana del archivo vigente. El bloque
`#seguro-pausa` en «Qué hago hoy» pinta el estado vía `/estado` y se esconde si
la página se abre como archivo. Armar NO pausa nada: solo abre la ventana en la
que el botón de pausar sí escribe; cada pausa conserva su confirmación,
revalidación server-side, tope por lote y guardrail KE.

Y a nivel raíz, el cruce anuncio↔venta:

```
por_anuncio_7d / _30d / _60d / _90d
    [{ad_id, ad_name, campaign_name, leads, asignados, ventas, mxn}]
```

`ad_id` es la llave contra los insights de Meta. Sale de `utm_term` en Kommo, que
el salesbot escribe cuando el lead entra por un Click-to-WhatsApp. HubSpot no lo
guarda, así que ahí esa tabla muestra solo el lado de Meta y lo dice.

Un corte viejo sin estos campos no rompe nada: el dashboard detecta que no hubo
validación (`asignables is None`), que `por_asesor` no trae `ventas`, o que no hay
`por_anuncio_*`, y en cada caso lo dice en vez de pintar ceros.

---

## Qué cuenta de Meta cuenta — y qué canal trae cada lead

**Solo se suman las cuentas de Meta que le mandan leads al CRM que se está
leyendo.** Vive en `CUENTAS_POR_CRM` (`dashboard.py`):

| CRM | Cuentas que entran |
|-----|--------------------|
| Kommo | **solo** `act_2466618450515283` (Kenet Solar_Ads) |
| HubSpot | las tres |

No es un detalle de presentación: es el **denominador**. Con las tres cuentas
sumadas contra los leads de Kommo, la tasa de asignación a 90 días salía en 6% —
10,042 resultados de tres cuentas entre 618 leads de una. Filtrado da 91%. Lo
mismo con el CPL ($20 → $6) y el CPA ($303 → $6). Si otra cuenta empieza a mandar
leads a Kommo, se agrega ahí y todo lo demás se acomoda solo.

La página lo dice en el encabezado («Meta Ads: solo Kenet Solar_Ads»), en el
desglose del tile de inversión y en una nota bajo la sección 1.

### Canales de entrada

`canal_del_lead()` en `crm_kommo.py` clasifica en: **Meta Ads · Google Ads · Web
orgánico · Redes orgánico · Directo · Sin origen**. Orden de decisión, y el orden
importa:

1. `utm_campaign` con `SEARCH` → **Google Ads**. Va primero porque el picklist
   `Origen` de Kommo **no tiene valor para Google**: un lead de Search acaba
   marcado «Web Form - Organic» y se perdería como orgánico.
2. El picklist `Origen` (campo **1833317**) cuando está lleno. Sí existe — el
   extractor decía que no, y por eso todo lo que no era Meta caía en «Sin origen».
3. `utm_medium=ctwa` o `fbclid` → Meta. `wix-form` → Web orgánico.
4. `source_id` (redes / WhatsApp).

**Solo Meta tiene gasto conectado.** A 7 días apenas el 37% de los leads de Kommo
viene de Meta Ads y el 49% de redes orgánicas: atribuirle todo el CRM a Meta le
inventaría un CPL más barato del real. La barra «De dónde vienen» en la sección 2
existe para eso.

### HubSpot: el `origen` del deal viene vacío

Más de la mitad de las ventas ganadas **no traen el picklist `origen`**, pero el
nombre del deal sí lo trae pegado al final — `Hiram Cardenas - FB-form`. Es la
convención del equipo. `origen_de()` lee el picklist y, si está vacío, saca el
sufijo del nombre (`_SUFIJO` + `_ALIAS`, porque el nombre dice «Facebook» donde el
picklist dice «Redes Sociales»).

Sin ese rescate `won_meta` salía en una fracción de lo real. Con él, el corte del
21-ago da **109 ventas en 30 días ($10.1M), 46 con origen Meta ($3.16M)** y 104
ventas Meta en 90 días. Los ganados viven en dos pipelines — `849155502` («2026»,
etapa 1265092771) y `922784339` («Ciclo de Venta KS», etapa 1409289356) — y
`hs_is_closed_won` los cubre a los dos, así que no hay que filtrar por pipeline.

### La tabla de anuncios agrupa por CREATIVO, no por id

El mismo anuncio vive en varios adsets con id distinto. Agrupada por id salía tres
veces: una con sus leads y las otras con «sin rastreo», y se leía como si dos de
cada tres hubieran fallado. `por_anuncio_html` agrupa por **nombre**, guarda los
ids del grupo y cruza el CRM por cualquiera de ellos. Cuando agrupa, lo dice.

### ⚠ Más clases ya tomadas

`.pill` es `display:inline` con padding vertical: dentro de una celda **desbordaba
su línea y se encimaba con el renglón de abajo**. Está forzado a `inline-block` en
tablas. Si agregas una etiqueta dentro de un `<td>`, no la dejes `inline` con
padding vertical.

### Google Ads — estado

Corre `KS_MTY_SEARCH_COMPETIDORES_DIC` (búsqueda, keywords `kenet solar` y
`mtysolar`). Sus leads entran por el formulario de Wix con la campaña en
`utm_campaign` y la **palabra clave** en `utm_term` — no hay id de anuncio, así
que el cruce más fino posible sin conectar Google Ads es campaña + keyword. Eso
ya sale en `por_ventana[w]["google_por_campana"]`.

Para traer el **gasto** hace falta la Google Ads API: `customer_id`,
`developer_token`, y OAuth (`client_id`, `client_secret`, `refresh_token`). No
hay ninguna de esas credenciales en el repo ni en el entorno, y no hay MCP de
Google Ads en la sesión. Con eso, un `google_ads.py` que escriba el mismo
contrato que `meta.py` encaja sin tocar el dashboard.

---

## El acomodo de la página

Arriba de todo, fuera de cualquier sección: el **selector de ventana** (manda en
toda la página) y los **cuatro KPIs**. Luego seis secciones numeradas, una
pregunta cada una. El número no es decoración: es el orden de lectura.

| # | Sección | Contesta |
|---|---------|----------|
| — | KPIs | tasa de asignación · CPL · CPA · tasa de conversión |
| 1 | Cómo vamos | cifras absolutas + qué está moviendo el costo (CPM vs CTR) |
| 2 | Dónde se atora | embudo resultado→CRM→zona→asesor→venta |
| 3 | Vista general por zona | tarjetas + tabla completa + sangrado + reparto del gasto |
| 4 | Qué hago hoy | destacados + la cola de instrucciones |
| 5 | En qué zona vuelve el dinero | marcador gasto-vs-ingreso · cierre por asesor · anuncio→venta |
| 6 | Inventario y salud de campañas | adsets, anuncios por zona, canibalización |

### La ventana contra el ciclo de venta

El retorno y la conversión **no afirman rentabilidad en ventanas más cortas que
el ciclo de venta** (`madura(w)`: la ventana cubre al menos el 80% de
`ttc_meta_30d_days`). A 7 días el retorno divide ingreso de leads de hace ~3
meses entre el gasto de esta semana — salía 150× en verde e invitaba a escalar
sin fundamento. En ventana inmadura ambos se pintan neutros y dicen a qué
ventana ir (`ventana_util()`). El corte es 80% y no 100% porque con un ciclo de
97 días ni la ventana de 90 calificaría, y un aviso que nunca se puede quitar
deja de ser un aviso.

El orden de secciones pone «En qué zona vuelve el dinero» (4) ANTES de «Qué
hago hoy» (5): se decide después de ver si el dinero volvió. Y el embudo
aclara que Meta cuenta **eventos** y el CRM **personas** — su primer salto no
es una pérdida ni es comparable entre CRMs.

### Los cuatro KPIs

Son **bullet charts**, no medidores de aguja: con cuatro indicadores lado a lado
el semicírculo ocupa el triple y se lee peor. El valor y la meta van SIEMPRE
escritos — el color nunca es la única señal.

Las metas **se derivan, no se inventan**: `unit_economics()` calcula dónde deja
de ganar el negocio con la misma fórmula del CPL tope (ticket × `MARGEN_BRUTO`
× conversión). Sin ventas en la ventana no hay ticket, y entonces el KPI dice que
no hay meta en vez de sacar una de la manga.

Cada KPI y cada tile es un `<a href="#seccion">`: el número dice qué pasa, el
ancla dice dónde mirar. El JS abre el `<details>` de destino — sin eso el ancla
cae sobre un `<summary>` cerrado y parece que el link no hizo nada.

### Reglas del acomodo

- **Una pregunta, un lugar.** El gasto por zona y el estado por zona vivían en
  secciones distintas: había que memorizar un número para leer el otro.
- **Una tarjeta por sección, no N cajas.** Los bloques van dentro de un
  `<div class="panel">`, que pone UN borde; adentro se separan con una línea.
- **Todo bloque de un panel lleva su padding.** `.zb` y `.canales` nacieron sin
  él y quedaban al ras del marco, con el encabezado sentado sobre la línea del
  borde — se lee como texto mal alineado. El padding está declarado para todos
  los bloques directos de `.panel` de una sola vez, no bloque por bloque.
- **La división va en el bloque, no en su posición.** Nada de `+ div[data-win]`:
  los paneles de las otras ventanas siguen en el DOM aunque estén `hidden`.
- **No grafiques lo que ya es una tarjeta.** El gasto por día repetía el tile de
  inversión. La gráfica de la sección 1 dibuja CPM y CTR, que **explican** el CPL
  en vez de repetirlo: CPM arriba con CTR plano es la subasta; CPM arriba con CTR
  cayendo es el creativo quemándose. El veredicto lo calcula el código.
- **Los diagnósticos se derivan del dato.** La nota del embudo decía «el que se
  cae es el reparto interno» aunque el reparto fuera al 100%.
- **Un solo denominador por pregunta.** El embudo dividía entre los resultados de
  la cuenta principal mientras la barra de arriba contaba las tres: 34% y 64% en
  la misma pantalla para la misma cosa.

### ⚠ Nombres de clase ya tomados

Esta hoja tiene clases de una letra. Antes de inventar una, revisa:

| Clase | Quién la usa | Qué rompe si la reusas |
|-------|--------------|------------------------|
| `.i` | botón de ayuda | `border-radius:50%` + `14×14px` — tu barra sale de elipse |
| `.b` | — | libre, pero peligrosa por lo genérica |
| `zrow` | `<tr>` de la tabla por zona | `display:grid` sobre una fila de tabla |

El marcador por zona usa prefijo `zb-`, los KPIs `kpi-`. Haz lo mismo.

---

## Regla de pausa

Se decide **por anuncio, no por adset**. Un adset con cuatro anuncios donde uno
se comió el presupuesto sin resultados no se pausa entero: se pausa ese anuncio.
La fila del adset resume a sus anuncios.

Los umbrales viven en `UMBRAL` (`dashboard.py`) y **deben coincidir** con los de
`meta.py autopause`; hay un assert del selftest que lo cuida. Con que se cumpla
una, el anuncio entra a revisión:

| Bandera | Condición | Por qué |
|---------|-----------|---------|
| **Fatiga** | frecuencia ≥ 3.0 | la audiencia se saturó; el costo sube solo |
| **Frecuencia alta** | frecuencia ≥ 2.5 | aviso temprano, todavía no urge |
| **Gasto sin resultado** | ≥ $500 gastados y 0 resultados | no es caro: es que no trae nada |
| **Caro para su zona** | costo por resultado > 3× la mediana de su zona, con ≥15 resultados | hay otro anuncio de la misma ciudad haciendo lo mismo por un tercio |
| **Sobre el CPL tope** | costo por resultado > `META_CPL_FORM` / `META_CPL_WA`, con ≥8 resultados | solo si el límite está configurado; sale del CPL máximo del unit economics |

**Frecuencia alta (≥2.5) no es motivo de pausa**, es aviso temprano. Aparece en
la tabla pero no ofrece botón ni la toca `autopause`.

El CPL tope sale de: `ticket × margen bruto × conversión lead→venta`. Con el
corte de 2026-07-27 (ticket $67,094 · conversión 1.13%) el punto de equilibrio
es ~$190 con margen de 25%; el techo útil es la mitad. **Ojo con la conversión**:
divide ventas de este mes entre leads de este mes, pero el ciclo son 86 días, así
que si el volumen de leads creció el número real es más alto que el que sale ahí.

La regla vive en **`meta.py evalua_pausa()`**, sin efectos, y la comparten los dos
caminos que pausan. No la reimplementes en ningún lado: si la página marca algo
distinto de lo que pausa el comando, alguien la duplicó.

`meta.py autopause` corre en **dry-run por default**; pausa solo con `--go`, y
trabaja a nivel **anuncio** (`level="ad"`, `post(ad_id, status=PAUSED)`).
Guardrail permanente: **nunca toca campañas cuyo nombre empiece con `KE`** —
`fila_pausa()` las devuelve como `None`, así que quedan fuera antes de evaluarse.

### El botón de pausa del dashboard

Es la **única** puerta de escritura de la página. `POST /pausar {"ad_ids":[…]}`.

El navegador manda ids y nada más. El servidor **no le cree**: vuelve a pedirle
los insights a Meta, vuelve a correr `evalua_pausa()` y solo pausa lo que **hoy**
sigue tocando una regla. Editar el HTML, mandar un id a mano o apretar el botón
sobre datos de hace seis horas no sirve de nada.

Cuatro barreras, en orden:

1. **Basic auth** — lo mismo que protege el dashboard.
2. **Revalidación server-side** — el id tiene que estar en los candidatos de hoy.
   Eso arrastra el guardrail KE gratis.
3. **`PAUSA_MAX_POR_LOTE`** (default 5) — un botón que apaga 40 anuncios de un
   clic no es un botón, es un accidente.
4. **`PAUSA_ACTIVA=1`** — kill-switch. Sin él el endpoint contesta con el motivo
   pero **no escribe**. Se quita en Railway sin redesplegar.

Cada pausa aplicada queda en `data/pausas.jsonl` (append-only, en el volumen) y
se consulta en `GET /pausas`. El botón solo aparece cuando el anuncio (a) toca
una regla que **sí** justifica pausar —`MOTIVOS_PAUSA` en `dashboard.py`, o sea
sin "Frecuencia alta", que es aviso— y (b) sigue entregando. Reactivar no se hace
desde aquí: eso es Ads Manager.

## Estado de un anuncio

`effective_status` de Meta tiene más de dos valores y **no todo lo que no es
`ACTIVE` está pausado**. Marcarlos a todos como "Pausado" era un bug: la etiqueta
se caía sola al siguiente corte sin que nadie hubiera despausado nada.

- **Sí es pausa:** `PAUSED`, `ADSET_PAUSED`, `CAMPAIGN_PAUSED`, `ARCHIVED`, `DELETED`
- **No es pausa:** `IN_PROCESS`, `PENDING_REVIEW`, `PENDING_BILLING_INFO`,
  `PREAPPROVED`, `WITH_ISSUES` — están entregando o esperando revisión
- **`DISAPPROVED`** es rechazo, que es peor que pausa y se pinta en rojo

El estado real se baja con `meta.py adstatus` (`ad_status.json` +
`ad_status2.json`); los insights no lo traen. Un anuncio activo dentro de un
adset pausado no está entregando: manda el estado más restrictivo de los tres
niveles (anuncio → adset → campaña).

---

## Ventanas

Hay **dos switchers independientes**, cada uno con su `data-g`:

- `main` — **7 / 14 / 28 / 30 / 60 / 90 días**, arranca en 7. Manda sobre los
  KPIs, las secciones 1 a 4 y el inventario. Vive fuera de toda sección porque
  manda en toda la página.
- `retorno` — **la misma escala**, arranca en 30. Manda sobre la sección 5
  completa: marcador por zona, cierre por asesor y anuncio→venta.

Eran tres selectores con escalas distintas (`main` 7/14/28, `ventas` 30/60/90,
`reps` las seis) y ninguno decía sobre qué mandaba. Ahora las dos barras ofrecen
lo mismo; lo único que cambia es dónde arrancan.

El ciclo de venta ronda los 86 días: cualquier número de cierre a 7 días sale en
cero y parece que nadie vende. Por eso `ventas` y `reps` no cuelgan de `main`.

Si agregas un tercer switcher, dale su propio `data-g` o esconderá los paneles
de los otros. Y piensa dos veces: tres barras de ventana en una pantalla ya
fueron un problema una vez.

⚠ Abrir `main` a seis ventanas obligó a dos cosas: `crm_kommo.py` resuelve la
zona en las seis (antes se gateaba a 28 días porque la ciudad se bajaba contacto
por contacto; con `precarga_ciudades` son 7 llamadas), y `link_zone_ads()` manda
un rango de fechas explícito donde Ads Manager no tiene preset.

---

## Reglas de la casa

- **Solo stdlib.** Nada de dependencias nuevas sin una razón fuerte.
- **Los umbrales van en `UMBRAL`, nunca en el HTML.**
- El CSS usa variables (`--ink`, `--surface`, `--rule`, `--on-fill`…) que cambian
  con el tema. **Nunca escribas un color fijo** (`#fff`, `#fafbfe`) ni uses una
  variable que no exista: `var(--line)` no está definida y por eso las tarjetas
  de destacados y la caja de encargo se veían en claro sobre fondo oscuro.
  Dentro de una tabla, `td .crit` le gana a `.pill` por especificidad — de ahí la
  regla `td .pill{color:var(--on-fill)}`.
- El dashboard **no ejecuta nada**: las cajas de "Encargar" escriben en
  `data/instrucciones.jsonl` y ahí se quedan. Pausar campañas mueve dinero.
- Cuando un dato no exista, **dilo**; no lo pintes como cero. "Sin dato de
  reparto" no es lo mismo que "0% de capacidad".
- Corre `python dashboard.py --selftest`, `python zonas.py` y
  `python test_dashboard_ventas.py` antes de commitear. El último fabrica un
  corte completo (insights + CRM con el contrato nuevo) y verifica que los
  bloques que dependen del CRM —medidores, mezcla por zona, curva de ventanas,
  columnas de cierre por asesor y burbujas por anuncio— sí se dibujen. Se
  agregó porque esos bloques degradan a una nota gris cuando falta un dato: sin
  el test, romperlos se ve exactamente igual que no tener datos todavía.
  `--demo <dir>` deja el HTML en disco para verlo en el navegador.

---

## Dashboard de ventas — `/ventas` (React, corte Kommo + HubSpot)

### Dos servicios en Railway, un solo repo (`DASH_MODO`)

Randall no quiere mezclar el tablero de marketing con el de ventas. El mismo
código corre en dos servicios del proyecto `hearty-intuition`, separados por la
variable `DASH_MODO` de `app.py`:

| Servicio | `DASH_MODO` | URL | Qué corre |
|---|---|---|---|
| `mkt-dashboard` | `marketing` | mkt-dashboard-production-d85b.up.railway.app | Meta + CRM de marketing, como siempre. **No** corre `ventas_corte.py` y no tiene tokens de Kommo. |
| `mkt-ventas` | `ventas` | mkt-ventas-production.up.railway.app | Solo `ventas_corte.py` (HubSpot + Kommo); `/` redirige a `/ventas/`. Volumen propio `/data`. |

Default `ambos` = los dos en un proceso (solo para local). Deploy: `railway up
--service <nombre> --detach` desde este directorio; cada servicio tiene sus
propias variables (`railway variables --service <nombre> --json`). Un
`railway up` a un servicio NO toca al otro.

Segundo tablero en el mismo servicio: la vista operativa de leads y asesores
que vivía en el Sheet «Dashboard Leads Kenet» (Apps Script
`Kommo Salesbot/dashboard_leads_kenet.gs`), ahora con los DOS CRM juntos: los
asesores que siguen en HubSpot y los que ya están en Kommo salen en la misma
tabla. La especificación de diseño está en `Knowledge/kenet-solar-design-spec.md`
y es la referencia visual: blanco y negro, bordes rectos de 2px, sombra solo en
popups, sin emojis.

```
ventas_corte.py    junta las partes y escribe data/ventas.json. Es el ÚNICO que escribe.
ventas_kommo.py    parte Kommo: port del .gs (leads 90d o cerrados en 90d, actividades, tareas abiertas)
ventas_hubspot.py  parte HubSpot: deals = leads, tasks/calls = actividades, owners con equipo
ventas/            React 19 + Vite + TS. src/App.tsx · src/dashboard.css · src/metrics.ts (TODAS las cifras)
ventas/dist/       build COMMITEADO a propósito: Railway no compila Node; app.py lo sirve tal cual
app.py             /ventas/ (index) · /ventas/assets/* · /ventas/data.json — mismo basic auth que la portada
```

- El refresh corre `ventas_corte.py` cuando hay `KOMMO_LONG_TOKEN` o
  `HUBSPOT_TOKEN`; entra cada CRM que tenga token y uno que falle no tumba al
  otro (`fuentes[]` en el JSON dice cuáles entraron). Para ver los dos en una
  página el servicio necesita los dos tokens: en `mkt-dashboard` (HubSpot) basta
  agregar `KOMMO_SUBDOMAIN` + `KOMMO_LONG_TOKEN`; la portada de marketing sigue
  en HubSpot porque `refrescar()` prefiere ese token para `crm_recon.json`.
- **Un asesor = un humano.** La llave entre CRM es el nombre normalizado
  (`ventas_corte.slug`: primer nombre + primer apellido, sin acentos) y los alias
  que la regla no resuelve sola viven en `ALIAS` ("Randall Cruz" ↔ "Randall",
  "Javier T" ↔ "Javier Tonche"). Un asesor con el mismo nombre en los dos CRM
  aparece UNA vez con `crm: ["kommo","hubspot"]`. Solo salen asesores con algo
  que mostrar en 90 días (HubSpot tiene 30 owners, la mitad inactivos).
- Ids de texto: `k:<id>` / `h:<id>`; cada lead/evento/tarea trae `crm`.
  Equipos = zonas MTY/SLT/TRC/MVA (Kommo: grupo KS-<zona>; HubSpot: equipo del
  owner). Etapas del embudo = las de Ventas en Kommo; HubSpot traduce las suyas
  (`CANON_HS`: Lead entrante→Por contactar, Precalificación→Conversación
  iniciada, Levantamiento hecho, Contrato solicitado).
- **Lo que HubSpot NO sabe igual que Kommo** (aproximaciones, documentadas en
  el docstring de `ventas_hubspot.py`): tareas por lead solo como «hay próxima
  actividad» (`notes_next_activity_date`: 1 abierta, vencida si ya pasó);
  cotización/levantamiento solo del deal que HOY está en esa etapa (el portal
  no tiene `hs_date_entered_*`); recibo/mensajes no existen. Llamada contestada
  = `COMPLETED` o duración > 0. La búsqueda de HubSpot se corta en 10,000
  resultados: `buscar()` pagina por ventanas de días.
- **Las cifras se calculan en el navegador** (`metrics.ts`) sobre el corte
  completo. El rango de fecha filtra leads por **última asignación** y
  actividades por **fecha del hecho** (los mismos alcances de los dos pickers
  del Sheet, con un solo picker); las ventas se cuentan por fecha de **cierre**.
  Equipo y propietario filtran todo. Si alguien pide de vuelta el segundo picker,
  `Filtros` ya trae el hueco: agregar `rangoActividad` y usarlo en
  `eventosFiltrados`.
- **Metas EN PESOS** (decisión de Randall 4-sep tras las juntas con Alejandro, ver
  `Knowledge/alejandro-requisitos-vs-ventas-2026-09-03.md`): `VENTAS_META_MXN`
  es la meta mensual de venta de todos (default 800000) y `VENTAS_METAS`
  (`{"marco-perez": 1000000}`, llave slug) la cambia por asesor. Ningún CRM las
  guarda. La UI la prorratea al rango (`metaEnRango`: meses completos si el
  rango va de día 1 a día 1, si no por días) y calcula «esperado a hoy» por
  regla de tres (`metaEsperada`). Cumplimiento = monto vendido / meta del rango.
- **Pipeline sano = cotizado vigente ≥ 10× la meta MENSUAL** (regla de Alejandro;
  `VENTAS_COTIZADO_X`). Vigente = leads activos con monto cuya cotización tiene
  ≤ 90 días (`VENTAS_COTIZADO_DIAS`; sin fecha de cotización cuenta desde la
  asignación); lo más viejo se muestra rayado y «ya no cuenta». Vive en
  `cotizado()` y sale en Venta (equipo), en la tabla de Asesores y en la ficha.
- **Entrada de leads** (`entrada()`): solo Kommo, por fecha de CREACIÓN en el
  rango. Tasa de asignación = funnel ≥ 4 / llegaron: el KPI que Alejandro pidió
  resaltar. Con filtro de asesor o equipo cuenta por el RESPONSABLE ACTUAL del
  lead (Randall lo pidió así el 4-sep); ojo: los leads que aún no se asignan
  cuelgan de la cuenta admin («randall», 1,015 de 1,123 en funnel 2), así que
  con filtro quedan fuera y la tasa sube; la nota bajo el bloque lo dice.
- **Marca**: `ventas/public/logo.png` (logo oficial, 64 px de alto, se pinta a 31 /
  24 en móvil) y `favicon.png` + `apple-touch-icon.png` (el sol del logo), recortados
  con PIL desde `DISEÑO/ASSETS/LOGO-KENET-SOLAR.png`. Vite copia `public/` a la
  raíz de `dist/` y app.py los sirve con su content-type (`CTYPES`).
- **Drill-down** (`ventas/src/drill.tsx`, pedido de Randall 4-sep calcado de los
  reportes de HubSpot): toda cifra, barra o renglón del Admin abre `DrillModal`
  con la lista de registros detrás (`Fila`: nombre con liga al CRM, CRM, asesor,
  detalle, monto, fecha), buscable, 300 por página. Las listas salen de las
  MISMAS funciones que calculan la cifra (`embudo().leads`, `entrada().listas`,
  `primerContacto().con/sin`, `razones().leads`, `filasDeLeads`,
  `filasDeEventos`): si una cifra y su lista no cuadran, es bug. Regla de
  accesibilidad: un tile con «i» adentro no puede ser `<button>` (botón dentro
  de botón); ahí el botón es la cifra (`.nbtn`). Las tareas y llamadas de
  HubSpot se listan sin liga porque no vienen ligadas al deal.
- **Acceso por usuario y contraseña** (pedido de Randall 4-sep, sustituye al «sin
  contraseña»): la puerta de `/ventas` es una sesión propia, no el basic auth.
  `POST /ventas/login` valida contra `data/ventas_usuarios.json` (PBKDF2-SHA256
  con sal, `validar_usuarios`) o contra `DASH_USER`/`DASH_PASS`, que SIEMPRE entran
  como administrador maestro; devuelve la cookie `ks_sesion` (HMAC con
  `VENTAS_SECRET` o `data/ventas_secret.txt` generado una vez; 30 días; HttpOnly,
  SameSite=Lax, Secure tras el proxy https). `GET /ventas/yo` dice quién soy;
  `data.json`, `config.json` e `hist.json` exigen sesión; `POST /ventas/config` y
  `usuarios` exigen rol admin. **Un asesor recibe solo su parte del corte**
  (`corte_para`: sus leads, actividades, tareas y él solo en `usuarios`), así que
  ni bajando `data.json` a mano ve a los demás; el corte completo se cachea en
  memoria por mtime. 5 fallos de login por IP = 60 s de espera. La UI:
  `login.tsx`, botón Salir, y en Configuración el panel «Accesos» (usuario, rol,
  asesor ligado, contraseña opcional al editar). `VENTAS_PUBLICO=1` sigue
  significando «sin basic auth»; sin él, basic auth y luego sesión.
- **Widgets reordenables y redimensionables** (`widgets.tsx`, pedidos de Randall
  4-sep, calcados de los tableros de HubSpot): el Dashboard del Admin y «Mi día»
  son `WidgetGrid` sobre una rejilla de **6 columnas**. Cada gráfica lleva asa ⋮⋮
  (drag & drop HTML5, `setDragImage` del widget completo) y ▲▼ por teclado para
  el orden, y un **asa en la esquina inferior derecha** (`.wresize`, `role=slider`)
  que se arrastra con pointer events y ajusta el **ancho** por cuadrantes, de 2 a 6
  columnas (`Widget.span` = ancho por defecto en columnas; 3 = media pantalla,
  6 = todo; teclado ← → Home End), y el **alto** en filas de 40 px (`FILA`, de 4 a
  30 filas; teclado ↑ ↓; Supr regresa al alto automático). El ancho de una columna
  sale del ancho real de la rejilla (`clientWidth` − 5 gaps) / 6 y el span se
  redondea al más cercano; el alto solo se fija cuando el arrastre se mueve en
  vertical más de media fila, para que estirar solo a lo ancho no congele el alto.
  Con alto fijo (`.hset`) la tarjeta es columna flex: el cuerpo (`.wbody`) toma el
  resto y se desplaza adentro, y el embudo (bandas `preserveAspectRatio=none`) y la
  dispersión (SVG con viewBox) crecen con la tarjeta; lo demás conserva su tamaño.
  Orden, anchos y altos viven juntos en `localStorage` (`kv_orden_admin`,
  `kv_orden_midia-<uid>`, forma `{orden, spans, altos}`; el formato viejo de solo
  lista se migra al leer): preferencia de quien mira, no dato. En ≤ 960 px todo va
  a una columna con alto automático y el asa se esconde. Los contenidos deben ser
  fluidos (la fila de KPIs de Entrada es `auto-fit`; la tabla de etapas va en
  `.scrollx`). Gotcha E2E: tras un drag & drop HTML5, Chromium se traga el
  siguiente `pointerdown` de Playwright: probar el resize en una página recién
  cargada. **Quitar y agregar** (primer paso del «inventario de gráficas» que pidió
  Randall): el × del encabezado saca el widget del tablero (`ocultos[]` en el mismo
  layout) y «Agregar gráfica» lista los quitados para regresarlos a su lugar; el
  inventario de hoy son los 18 widgets del Admin y los 5 de Mi día, no hay
  catálogo de métricas extra todavía. **Cada cifra es un widget propio** (pedido de
  Randall 4-sep: «verlos por separado para ampliarlos al tamaño que yo desee»): los
  9 tiles (`t-leads`, `t-ventas`, `t-vendido`, `t-conversion`, `t-perdida`,
  `t-tareas`, `t-cotizaciones`, `t-descartes`, `t-levantamientos`) llevan
  `plain`, `span: 1`, `cls: 'wtile'` (el tile llena la tarjeta y el número crece con
  el ancho por container query) y `desde: 'cifras' | 'actividad'`: un orden
  guardado con el id del grupo viejo coloca los nuevos en ese mismo lugar
  (`ordenar`). El ancho mínimo bajó a 1 columna. Toda la tarjeta de cifra es el
  botón (`.tile.tbtn`, hover en todo el widget, video de Randall 4-sep) y la «i»
  del glosario va en el encabezado del widget (`info`), nunca dentro del botón.
  **Separadores** (video de Randall = «Image or text» de HubSpot): «Agregar
  separador» mete una banda de título de ancho completo (`sep:<n>` en `orden`,
  título en `seps{}`), editable en el lugar, se arrastra o mueve con ▲▼ y se
  borra con ×; Restablecer tablero los quita. Las secciones plegables desaparecieron; los
  widgets `plain` (tiles) no llevan tarjeta.
- **Ventas reales desde la app de comisiones** (pedido de Randall 4-sep): `ventas_comisiones.py`
  lee `profiles` y `sales` de Supabase (solo GET, `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`, la
  misma llave del respaldo diario) y `ventas_corte.agregar_comisiones` lo mete al corte como
  `comisiones {generado, vendedores[], ventas[]}` (o `error`). La app guarda casi solo el
  primer nombre del vendedor: `emparejar` lo casa con el asesor del CRM cuyo slug empieza con
  ese nombre, desempata por zona y si no puede lo deja sin asesor (la UI lo lista);
  `VENTAS_COMISIONES_MAP` (`{"Arely Y david": "arely-tovar"}`) manda. La venta trae MES
  (`sale_month` «Julio 2026»), no día: `ventasReales()` cuenta la venta si su mes toca el
  rango, sin canceladas. Sale en el Admin (widget «Ventas reales · Comisiones», tabla contra
  el CRM con drill) y en la ficha (tarjeta). `corte_para` recorta las de otros asesores. El
  cruce se corrige en **Configuración › Ventas reales** (tabla vendedor → asesor: Automático,
  Sin asesor o un asesor), guardado como `comisiones_map` en la config; `aplicarConfig` lo aplica
  al vuelo en el navegador y `agregar_comisiones` lo lee del volumen en el siguiente corte.
- **Ficha del asesor = WidgetGrid** (clave `ficha`, compartida entre asesores): tarjetas
  `wcard` (Ventas, Cumplimiento, Cotizado vigente + antigüedad en UNA tarjeta, Ventas
  reales), Actividad, Leads activos y Tareas abiertas; se mueven, estiran y quitan igual que
  en el Dashboard. **Actividad respeta el rango del filtro** (queja de Randall 4-sep): hasta 21
  días se ve por día; más largo, por semana (`BubbleChart onCol`: cada columna es un botón)
  y el clic abre esa semana por día con «Volver a las semanas»; cambiar de rango o asesor
  regresa a la vista del rango.
- **Barra «Agregar gráfica / Agregar separador / Restablecer»** va ARRIBA de la rejilla
  (`.wbar`), no al pie: Randall no encontraba dónde regresar una gráfica quitada.
- **Gráficas fluidas** (pedido de Randall 4-sep: «que al redimensionar las gráficas
  se redimensionen también»): ninguna gráfica lleva tope en px. La dispersión de
  perfiles es un SVG 400×250 al 100 % del ancho (sin `max-width`), la dona y los
  medidores llevan `width: 100%; height: auto` dentro de `.widget` y sus
  columnas son proporcionales (`minmax(150px, 1fr) 2fr` en Salud,
  `minmax(180px, 1fr) 2fr` en Entrada, `2fr minmax(160px, 1fr)` en Llamadas);
  las bandas del embudo crecen con el ancho (`aspect-ratio: 8 / 1`, mínimo 46 px)
  y con el alto fijo (`.hset`) se estiran a la tarjeta. Los puntos de la
  dispersión son botones (`onPunto`): un asesor abre su ficha; una burbuja «×n»
  pinta una lista inline (`.grupo-sel`) para elegir a quién abrir, que se limpia
  al cambiar filtros. El widget Perfiles (`cls: 'wperf'`, container query) pone la
  matriz a la izquierda y una tabla de asesores (perfil, actividad, vendido; el
  nombre abre la ficha) a la derecha cuando mide ≥ 760 px; angosto, apilados.
- **Sin contraseña en `/ventas`** (`VENTAS_PUBLICO=1` en el servicio `mkt-ventas`,
  pedido de Randall 4-sep): `do_GET` sirve `/ventas*` (y `/` → `/ventas/` en modo
  ventas) antes del auth y `do_POST` deja pasar `/ventas/config`. Todo lo demás
  (`/estado`, `/cola`, `/pausar`, `/refrescar`, la portada de marketing) sigue
  con basic auth. Cualquiera con la URL ve nombres de clientes, montos y el
  desempeño por asesor y puede cambiar las metas. Para volver a cerrar:
  `railway variables delete VENTAS_PUBLICO --service mkt-ventas` y redeploy.
- **Barra de filtros sticky** dentro de `.main` con `top: -18px` (Chrome la pega
  al borde de contenido, no al del padding; con 0 se asomaba una franja). En
  ≤ 960 px vuelve a ser estática porque ocupa tres renglones. Los selectores
  tienen ancho fijo (160 / 250 px): un `select` se ensancha con la opción más
  larga y movía los botones Kommo · HubSpot al filtrar.
- **Ganados y perdidos NO son leads activos** (regla de Randall 4-sep): a un lead en
  etapa ganado (`funnel 5`) o perdido (`funnel 0`) no se le revisa actividad ni
  tareas; solo cuenta para ventas, % cierre, perdidos, razones de pérdida y tasa de
  pérdida. `vivo(l)` es el filtro: `porAsesor` (estancados, PC vencidas, sin tarea,
  tareas vencidas, cotizado), `primerContacto().sin`, la tabla de la ficha, el popup
  y Prospectos van sobre activos; las tareas abiertas de Mi día excluyen las de
  leads cerrados (en HubSpot no se puede saber: la tarea no viene ligada al deal).
  El tile «Tasa de pérdida» = asignados en el rango ya perdidos / asignados.
- **Primer contacto** (`primerContacto()`): mediana de horas asignación → primera
  llamada o tarea completada, con los eventos (que traen `asignacion`) en un
  solo recorrido. **Perfiles** (`perfiles()`): los 4 cuadrantes de Samuel con la
  mediana del grupo como eje. **Razones de descarte**: eventos `descarte` ×
  `razon` del lead. La tabla de Asesores ordena por columna (`SortTh`), trae
  PC vencidas y cotizado vigente; la ficha lista los leads con intentos
  (`llamadas_cf`, `msjs`), última tarea hecha y alertas.
- **Botones Kommo · HubSpot** en la barra del Admin (pedido de Randall 4-sep): `Filtros.crm`
  enciende o apaga la data de cada CRM en TODO el tablero (`pasaCrm` en los tres filtros de
  `metrics.ts`, más popup, ficha y bloque Entrada); siempre queda uno encendido. En el hash
  va como `c=kommo` / `c=hubspot`; sin `c` entran los dos. Solo aparecen con corte mixto.
- **Página Configuración** (`ventas/src/config.tsx`, pedido de Randall 4-sep): metas
  general, por zona y por asesor + factor y vigencia del cotizado, guardadas en el
  servidor: `POST /ventas/config` valida (`validar_config` en app.py: llaves
  conocidas, números en rango, slugs `[a-z0-9-]`, zonas `[A-Z]{2,5}`) y escribe
  atómico `data/ventas_config.json` (en el volumen, gitignored); `GET
  /ventas/config.json` lo sirve y `data.ts` lo aplica sobre el corte (manda sobre
  el env). Prioridad `metaDe`: asesor → zona → general. La misma config guarda
  **`ocultos`** (asesores desactivados con el ojo: fuera del menú de
  propietarios, la tabla, el ranking, los perfiles y las cifras atribuidas a
  persona vía `pasaPersona`; la entrada de Kommo NO cambia porque los leads sin
  asignar cuelgan de la cuenta admin) y **`equipos`** (zona por asesor que manda
  sobre la del CRM; `'-'` = sin equipo; `zona_crm` conserva la original para
  poder volver). El botón Guardar va en una barra sticky arriba (`.cfg-top`).
- **HubSpot no liga tareas ni llamadas al deal** (validado 4-sep: 0 de 3,866 deals
  abiertos con evento; los eventos traen otro id). Por eso «primer contacto» e
  «intentos» son solo Kommo y lo dicen; en HubSpot se muestra «sin dato (HS)».
  La actividad por ASESOR sí cuenta HubSpot (los eventos traen owner).
- **Histórico del pipeline**: `ventas_corte.py` guarda una foto diaria
  (`foto_pipeline`: leads y monto por etapa, total y por asesor) en
  `data/ventas_hist.jsonl` y app.py la sirve en `GET /ventas/hist.json`. Es la
  base de lo que Randall pidió y todavía NO tiene UI: ver el pipeline «como
  estaba hace 7 días», su evolución, liquidez entre etapas y estancamiento. Para
  reconstruir hacia atrás en Kommo faltan los eventos `lead_status_changed`;
  HubSpot solo sabe cuándo entró cada deal a su etapa actual.
- Checklist, tareas propias y notas de «Mi día» viven en `localStorage` del
  navegador del asesor. **Nada de esta página escribe a ningún CRM.**
- Cambiar la UI: `cd ventas && npm install && npm run build` (tsc + vite) y
  commitear `ventas/dist/`. En dev, `npm run dev` sirve `../data/ventas.json`
  como `/data.json` por un middleware de `vite.config.ts`: el corte real
  **nunca** va a `public/` (entraría al build y al repo con nombres de clientes).
- Pruebas: `python ventas_kommo.py --selftest`, `python ventas_hubspot.py
  --selftest`, `python ventas_corte.py --selftest`. Corte real local con los dos
  CRM: exportar `HUBSPOT_TOKEN` (vive en `Z:\KENET SOLAR\MARKETING\APIs.txt`)
  y `KOMMO_ENV="…/Kommo Salesbot/fase1-webhook/.env"`, luego
  `python ventas_corte.py` (~4 min, solo GET). El aviso
  `incoming_sms_message: HTTP 400` es normal: ese tipo de evento no existe en la
  cuenta de Kommo y el .gs también lo ignoraba.

### Auditoría 4-sep (ui-ux-pro-max + accesibilidad + Playwright en producción)

Randall reportó «fallas en diseño y usabilidad». Se midieron contrastes reales en el navegador
(fórmula WCAG), targets, orden de foco y comportamiento a 390 / 768 / 820 / 1024 / 1440 px y con
zoom al 200 %. Lo que se corrigió, para no regresar:

- **`--edge: #848E9E` es el borde de los controles** (`.sel .btn .ib .wbtn .inp .eye .burger .ibtn`,
  selects de la barra). `--line` (#E3E8F0) da **1.23:1** y sirve solo para separar; un control
  necesita 3:1 (WCAG 1.4.11). Sin esto los campos y botones no tenían límite visible.
- **Colores de datos con texto blanco encima**: `--c2` #C77700 → **#A65F00**, `--c4` #0F8F83 →
  **#0C7A70**, `--neutral` #7A8494 → **#6B7484**. Estaban en 3.4-4.0:1 con blanco de 9 px y hacen
  falta 4.5:1. La rampa del embudo corre un tono (`--f1` #7FA3EC → **#6E97E9**): la primera banda
  daba 2.51:1 contra la tarjeta y una banda ES el dato.
- **Los controles del widget (⋮⋮ ▲ ▼ ×) solo aparecen al pasar el mouse o al enfocar** (`.wctl`,
  `@media (hover: hover)`; con dedo siempre visibles). Con 9 cifras sueltas eran 27 botones
  diminutos flotando sobre el tablero: el ruido visual número uno. Nunca `display: none`, para que
  el tabulador los siga alcanzando.
- **Tablet en 2 columnas** entre 700 y 999 px (`.wtile`/`.wcard` a 1, el resto a 2). El corte de
  960 px mandaba todo a una columna y una cifra ocupaba 776 px de ancho.
- **Una fila de tabla nunca es `role="button"`**: deja huérfanos a sus `<td>` y el lector deja de
  anunciar fila y columna. El control va en la celda del nombre (`.nbtn`), y así tampoco quedan
  botones anidados dentro de otro. Aplica a Ventas reales, etapas del embudo y la tabla de Asesores
  (el clic en toda la fila sigue funcionando con mouse).
- **Los tres diálogos toman el foco al abrir y lo devuelven al cerrar** (`useFocoDialogo`, patrón
  que ya tenía `drill.tsx`) y declaran `aria-modal`: popup de barras, resumen del asesor y
  calendario. Antes el foco se quedaba en `<body>` y había que recorrer la tabla otra vez.
- **Targets al mínimo de 24 px** (WCAG 2.2 AA): `.wresize` 22 → 24, `.grip` con caja de 24,
  «Agregar separador» y «Restablecer tablero» con `min-height`. El asa de arrastre y la de tamaño
  pasan de `--g3` (1.8:1) a `--g2`.
- **Cada página se nombra** con un `<h2 className="sr-solo">` al inicio de `<main>`: el único `h1`
  es el logo y decía lo mismo en Dashboard, Asesores y Configuración; además cerraba el salto
  h1 → h3. `.sr-solo` es la clase para texto solo de lector de pantalla.
- **El cambio de filtros se anuncia** (`role="status"` con rango, equipo y propietario): el tablero
  se redibujaba en silencio. Los días elegidos del calendario llevan `aria-pressed` (antes el
  estado era solo color). Todo `<th>` lleva `scope`, las tablas de etapas y perfiles llevan
  `aria-label`, y el tooltip del glosario se cierra con Escape.
- **`prefers-reduced-motion`** apaga transiciones y desplazamiento animado.
- Falsos positivos ya verificados, no volver a «arreglar»: el número dentro de la banda del embudo
  sí contrasta (tinta en las dos primeras, blanco en las oscuras); `.ibtn` extiende su área con
  `::before { inset: -5px }`; el `outline: none` de la dispersión tiene reemplazo (`stroke`).

### Reglas de diseño y accesibilidad de `/ventas` (auditoría 3-sep)

Pasó por el protocolo creativo (hallmark audit + guías web + dataviz +
impeccable critique/harden + WCAG) con Playwright a 1280 y 390. Lo que quedó
como regla, para no regresar:

- **Mundo visual (rediseño 3-sep, pedido de Randall: «estilo BI en tarjetas»,
  referencias You Exec / TuDashboard; el B/N del spec original quedó
  descartado):** fondo `#F3F6FB`, tarjetas blancas radio 12 con sombra suave,
  Inter, tinta `#141619`, texto secundario `#5B6472` (6:1). Acento de marca
  `#FFB300` solo en UI (marca del logo, activo del nav/toggle, botón primario
  con tinta), nunca como texto sobre blanco. **Colores de datos validados con
  el validador de `dataviz`:** azul `#2D6CDF` (serie principal), ámbar oscuro
  `#C77700` (segunda serie), púrpura `#6E4BD8`, teal `#0F8F83`; coral `#D9482B`
  solo como estado «vencida»; «sin tarea» va rayado. Rampa del embudo de una
  sola tonalidad `#7FA3EC → #143577` (`--ordinal` OK). Gráficas propias en
  `components.tsx`: `DonutChart` (SVG), `Gauge` (medio círculo), `FunnelChart`
  (trapecios reales, ancho ∝ leads), `MiniAreaChart`, `BubbleChart`.
- **Todo lo clicable es teclado:** filas de la tabla (`tabIndex` + Enter/espacio),
  barras apiladas (`role=button`), acordeones y tareas son `<button>`, popups son
  `role=dialog` y cierran con Escape (`useEscape`). Anillo de foco global
  `:focus-visible` 3 px negro con 2 px de aire; nunca `outline: 0`.
- **Barras apiladas:** 2 px de papel entre segmentos y el tercer segmento («sin
  tarea») rayado a 45°, para que se distinga sin color, en impresión y con
  daltonismo. Números de columnas con `tabular-nums`; los números héroe no.
- **Móvil (≤ 640):** el popup del asesor es hoja inferior anclada (`top:auto`);
  el header con perfil Asesor esconde el icono y acota el selector a 34vw.
  Targets ≥ 28 px en desktop y ≥ 36 px con `pointer: coarse`.
- **Estado en el hash de la URL** (`#perfil=…&p=…&f=…&u=…&eq=…&as=…&r=…`):
  recargar conserva la vista y la ficha de un asesor se puede compartir.
- `leaderboardHoy` y `miDia` van en `useMemo`: sin eso cada tecla en las notas
  recorría 48k eventos.
- Aviso de datos de ejemplo trae la causa real (`HTTP 404`, red) y el toolbar
  marca «corte de hace N h» cuando el corte pasa de 8 h.
- Glosario: botón «i» (`Info` + `glosario.ts`) en encabezados de tabla, Salud
  operativa, embudo, Cumplimiento/Conversión, Tareas hoy y «act.». Tooltip en
  hover y foco, definición completa en `aria-label`. Área de toque 28 px.
- Prospectos tiene búsqueda por nombre/etapa; el aviso de datos de ejemplo
  trae botón «Reintentar». Un solo rango de fechas (decisión de Randall).

---

## Salud por zona (score 0-100)

Idea tomada de [claude-ads](https://github.com/AgriciDaniel/claude-ads) (MIT), sin
instalar nada: once controles por zona y ventana en `controles()` de
`dashboard.py`, pesados por impacto (`PESO`: crit 5, alto 3, medio 1).

- **salud** = pesos que pasan ÷ pesos conocidos. **cobertura** = conocidos ÷ los
  que aplican. Cobertura < 60% → sin nota (guion); 60-79 → nota con `~`.
- `sin_dato` (deberíamos saberlo y no) baja la cobertura; `no_aplica` (no hay
  formularios, no hay videos, Meta no reporta aprendizaje) sale del denominador.
- Zona sin un solo anuncio con entrega en la ventana → sin nota, aunque el
  pixel o el reparto fallen: no está corriendo, no "va mal".
- Nota de cuenta = promedio de zonas ponderado por gasto; se guarda en
  `historico_semanal.csv` como `salud_7d` y sale como chip vs corte anterior.
- Controles nuevos que no existían como bandera: `uso_presupuesto()` (adset
  activo toda la ventana que gastó < 30% de lo configurado), `aprendizaje()`
  (`learning_stage_info`, Meta solo lo devuelve en algunos objetivos),
  `gancho()` (25% del video visto ÷ impresiones, contra la mediana de la cuenta),
  edad del creativo (`created_time` vía `adstatus`) y pixel (`meta.py pixels`).
- Son avisos: ninguno entra a `MOTIVOS_PAUSA`. La regla de pausa no cambió.
