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
won_por_canal         {canal: {count, mxn}} TODAS las ventas cerradas en la
                      ventana, por su canal de ENTRADA. Alimenta el retorno por
                      origen: el ingreso de cada canal contra el gasto de SU
                      plataforma (Meta, Google con corte); los canales sin gasto
                      conectado se listan sin retorno, nunca como retorno infinito
won_zona_por_canal    {canal: {zona: {count, mxn}}} el mismo corte abierto por
                      zona (misma regla de zona que won_meta_por_zona). Alimenta
                      el filtro de Origen de la sección 4
por_asesor[].por_canal {canal: [ventas, mxn]} el cierre del asesor abierto por
                      canal de entrada, para la tabla filtrada por origen
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
etapa 1265092771) y `922784339` («Ventas», antes «Ciclo de Venta KS», etapa 1409289356) — y
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
- `retorno` — **la misma escala**, arranca en 30. Manda sobre la sección 4
  completa: marcador por zona, cierre por asesor y anuncio→venta.
- `origen` — filtro de **origen de la venta** en la misma barra de la sección 4
  (Todo / Meta / Google / …, arranca en Todo). Filtra los tres bloques por el
  canal de ENTRADA de la venta. Regla dura: **el retorno solo se escribe donde
  el ingreso del origen se divide entre el gasto de SU plataforma** — Meta
  siempre, Google en global cuando hay corte; los demás listan ingreso sin
  cociente. Es independiente del filtro `canal` del embudo (el de la barra
  flotante): mismo JS, distinto grupo. El panel de anuncios usa
  `data-win="todo meta-ads"` (valores múltiples separados por espacio, que el
  JS de `.wsw` acepta): la tabla es la misma para Todo y Meta y duplicarla
  doblaba el HTML.

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
  (`CANON_HS`, por id de etapa: Lead entrante→Por contactar, Precalificación→Conversación
  iniciada, el resto 1:1). Desde el 5-sep el pipeline de HubSpot se llama «Ventas» y es espejo
  del de Kommo, con «Levantamiento agendado» (1432144491 → índice 3). **Toda etapa nueva va a
  `CANON_HS` por id**: sin entrada, `canon()` adivina por palabra y «agendado» caería en
  «hecho».
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
- **Ritmo del mes** (Alejandro 4-sep, «el número más importante»; hecho 5-sep): la meta del
  rango se reparte por **días naturales** con hoy contado completo (`diasRango`: día N de M;
  `metaEsperada` = meta × N/M) y `ritmo()` dice si lo vendido va arriba o abajo de esa parte, en
  palabras («▼ $1.4M abajo del ritmo · a día 5 de 30 el ritmo pide $2.8M») y con estado para el
  color (`.rt.atras` tinta `--warn-ink`, `.rt.adelante` / `.cumplida` `--c4-ink`; el tile «Avance
  contra la meta» se tiñe entero con `--warn-soft` / `--c4-soft`). Sale en ese tile, en Cotizado vs
  vendido vs meta, en el ranking, en la tabla de Asesores, en Cumplimiento de la ficha y en Mi día.
  Nunca es solo color: lleva ▼ ▲ y la cifra. Días hábiles no se definió; si se pide, cambia solo
  `diasRango`. Las etiquetas grandes dicen el periodo en palabras (`periodoTexto`: «del 1 al 5 de
  septiembre») en vez de «en el rango», que Alejandro no entendió; «Ventas cerradas» pasó a
  «Clientes cerrados» porque así lo preguntó él. Chequeo con fechas fijas: `check_ritmo.mjs` en el
  scratchpad de la sesión (transpila `metrics.ts` y afirma 15 casos).
- **Calendario calcado de Meta Ads** (Randall 5-sep, `DateRangePicker.tsx`): periodos a la izquierda
  como radios en el orden de Meta (Hoy, Ayer, Hoy y ayer, Últimos 7/14/28/30/60/90 días, Esta semana,
  La semana pasada, Este mes, El mes pasado, Máximo, Personalizado; sin «Usados recientemente» ni
  «Comparar»), dos meses con selector de mes y año, y abajo el periodo con las dos fechas escribibles
  (`<input type=date>`, sin días futuros). **«Máximo» va del lead más viejo del corte a hoy**
  (`desdeMaximo` en `App` = mínimo de creación/asignación entre `corte.leads`, hoy 10 jul 2023;
  `preset(p, ahora, desde)` lo recibe desde `App` y el calendario; sin corte cae a `MAXIMO_DIAS` = 90).
  Decisión de Randall 6-sep (opción b) aun sabiendo que la actividad solo cubre `VENTAS_DIAS` = 90:
  de los 3,145 leads asignados antes de esos 90 días, 3,121 ya están ganados/perdidos. Por eso la
  Actividad de la ficha agrupa **por mes** cuando el rango pasa de 26 semanas (una etiqueta cada
  `paso` columnas) y un clic en el mes o la semana lo abre por día (`zoom`). `trimestre` sigue
  valiendo en ligas viejas (`esPreset`) pero no se ofrece. La etiqueta del
  rango lleva el nombre y las fechas («El mes pasado: 1 ago 2026 – 31 ago 2026», `etiquetaRango`) y
  se usa tal cual en subtítulos y drills.
- **Primer contacto y Razones de descarte son dos widgets** (Randall 5-sep: «no encuentro relación»):
  cada uno abre con una línea que dice qué mide. Las razones son texto libre y se juntan por su forma
  sin acentos ni mayúsculas (`claveRazon`), mostrando la grafía más usada.
- **Medidores con tope** (`.widget .gauge-svg` y `.donut-svg` a 210 px): siguen creciendo con el
  widget, pero a pantalla completa un medidor de 400 px se comía la tarjeta y la hacía desplazarse.
- **Auditoría visual 6-sep** (`Knowledge/auditoria-visual-ventas-2026-09-06.md`, medida con
  `audit_visual.py`; reglas para no regresar): **cada widget declara su `alto`** por defecto medido
  contra su contenido (el flujo por bandas de igual alto va en `ORDEN_ADMIN`); **la dispersión dibuja
  1 unidad = 1 px** (`useSize` + `ResizeObserver`), nunca un `viewBox` fijo que escale las letras;
  **el embudo son barras centradas**, no trapecios (son fotos por etapa, no un flujo monótono);
  **varios términos de glosario = un solo botón «i»** (`Info` acepta arreglo); **ningún texto menor
  de 11 px**; estado vacío de un widget = bloque `.vacio` centrado con explicación; anillo de foco
  de renglones clicables 2 px adentro con esquinas redondeadas; Primer contacto trae la
  distribución por tramos (`PC_TRAMOS`).
- **Comparativa app de comisiones vs CRM** (Randall 5-sep, «ver cuáles faltan»): clic en el asesor de
  «Ventas reales» abre `comparativaVentas`: cada venta de la app busca pareja entre los ganados del
  CRM del mismo asesor (palabras del nombre en común, igual o por prefijo; sufijos de origen del deal
  y artículos no cuentan; cierre a ≤ 62 días del mes de venta; un ganado se empareja una sola vez).
  Lo que queda sin pareja sale marcado en rojo: «Falta en el CRM» o «Falta en la app» (`Fila.estado`
  + `alerta`, columna Estado del drill). Los deals de HubSpot sin nombre («Lead #…») siempre quedan
  sin pareja: es dato sucio, no un bug.
- **Quitar de la asignación desde el tablero** (Randall 5-sep, la función «Sanciones» del Sheet):
  columna «Asignación» en la tabla de Asesores (`Asignacion` en admin.tsx; `GET /ventas/sanciones.json`,
  `POST /ventas/sancion {uid, accion: quitar|reactivar, motivo}`, solo admin). **Kommo**: se escribe la
  pestaña «Sanciones 24h» del Sheet «Dashboard Leads Kenet» por su Apps Script, con la MISMA
  `SANCIONES_SHEET_URL` / `SANCIONES_SHEET_TOKEN` del servicio Kommo-ia (`aplicar_sancion` lee las
  filas, cambia UNA y manda todas, porque el script reemplaza la hoja); el server de turnos la lee cada
  60 s y el corte de las 10:00 reevalúa y reescribe (sanción = 24 h; el estado de los que no están en
  el padrón KS-* desaparece a las 10:00). **HubSpot**: el reparto va por equipo, así que se saca al
  usuario de su equipo (`PUT /settings/v3/users/{id}`, owner → userId) y el equipo previo se guarda en
  `data/ventas_sanciones.json` para poder reactivar; necesita `settings.users.read/write` y
  `settings.users.teams.read` en la app privada (hoy faltan: el tablero lo dice en el aviso). Cada CRM
  se intenta por separado y lo que falla va en `avisos`. Nada de esto borra ni reasigna leads.
  `Kommo Salesbot/sanciones_sheet.gs` ya respeta `por` (quién quitó); hay que volver a implementar el
  Apps Script para que se vea en la columna «Modificado por».
- **Cotizaciones entregadas = historial de etapas** (diagnóstico y decisiones de Randall 5-sep,
  `Knowledge/cotizaciones-entregadas-diagnostico.md`): el campo de fecha `1833423` lo llena una
  persona y cubre el 25 % (Carlos Campillo salía con 0 de 148). Ahora **Kommo** trae los eventos
  `lead_status_changed` de los 90 días (`entradas_propuesta`, ~120 llamadas / 80 s) y la cotización
  es la **primera entrada** del lead a «Propuesta entregada» (`ET_PROPUESTA`); las entradas
  siguientes son `recotizacion` (evento y `Lead.recotizaciones`), que se muestran aparte y no suman
  al total. Cuenta aunque el bot o la IA regresen el lead de etapa; se atribuye al responsable actual
  del lead (sin responsable → «Sin asesor»). El campo de fecha queda solo de respaldo cuando no hay
  historial. **HubSpot**: `hs_v2_date_entered_1409289353` (existe desde el 4-ago-2026, 634 deals);
  para deals anteriores queda la foto actual. La misma extracción de historial es la base para el
  pipeline histórico y la tasa de cierre de levantamientos (David), todavía sin UI.
- **Rol de Kommo por vendedor** (Randall 6-sep: «quiero ver a los que están como KS-TRAINING y
  KS-SEGUIMIENTO»): es la columna «Leads» de Ajustes › Usuarios de Kommo = el **rol** (`/roles`:
  KS-VENTAS, KS-TRAINING, KS-SEGUIMIENTO; los administradores no tienen). Viaja en `Usuario.rol`;
  en Asesores sale como etiqueta junto al nombre solo cuando no es Ventas (`rolDestacado`), en
  Configuración › Vendedores como columna, y en el tooltip del avatar. Un usuario activo con rol
  KS-\* entra al corte aunque no tenga leads (`siempre` en `mezclar`). **No confundir con los
  grupos** KS-MTY/SLT/TRC/MVA, que son el equipo (zona): también cualquier grupo `KS-<X>` nuevo
  se vuelve equipo (`zona_grupo`, `equipos` del corte, `_ZONA` hasta 15 letras), y el grupo del
  usuario sale de `/users` (`rights.group_id`).
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
- **Rejilla LIBRE de widgets** (`widgets.tsx`, Randall 6-sep: «colocar libremente las gráficas
  donde yo quiera, con un sistema de grids», como los editores de Kommo y HubSpot; sustituye a la
  rejilla que fluía en orden): seis columnas por filas de **40 px** (`FILA`, hueco 14 px); cada widget
  tiene posición y tamaño en celdas (`Pos {x, y, w, h}`), pintadas con `grid-column` / `grid-row` en
  línea sobre `grid-auto-rows: 40px`. El asa ⋮⋮ es un botón: se arrastra con pointer events a
  cualquier celda (fantasma `.wghost` + puntos de la cuadrícula `.wgrid.editing`) o se mueve con
  ← → ↑ ↓ / Home / End; la esquina `.wresize` (role slider) estira ancho y alto en vivo, o con las
  flechas, y Supr regresa al tamaño por defecto (`span` / `alto` del widget; sin `alto`: cifras 3
  filas, `wcard` 5, el resto 9). **Nada se encima**: `acomodar` empuja hacia abajo lo que choca (y lo
  que choque con lo empujado) y **no hay gravedad**: los huecos se respetan. Todo alto es fijo
  (`.hset` siempre a ≥ 1000 px) y el contenido se desplaza adentro; el embudo y la dispersión crecen con
  la tarjeta. × quita un widget (`ocultos`) y «Agregar gráfica» lo regresa al primer hueco libre
  (`colocar`); «Agregar separador» mete una banda `sep:<n>` de 6 × 1 celdas al fondo, con título
  editable. Se guarda en `localStorage` `kv_orden_<clave>` como `{v: 2, pos, ocultos, seps}`; los
  formatos viejos (lista de orden, `{orden, spans, altos}`) se migran colocándolos como fluían
  (`inicial`, `ordenar` respeta `desde`). En < 1000 px se ignoran las posiciones: los widgets se
  apilan en orden de lectura (fila, columna) con alto automático, 2 columnas entre 700 y 999 y una
  en móvil. Pruebas: `e2e_grid.py` en el scratchpad (30 comprobaciones: teclado, puntero, estirar,
  quitar/agregar, separador, migración, reset, 900/390 px). Gotcha E2E: el arrastre es por pointer
  events, no HTML5: en Playwright va con `mouse.down/move/up` sobre `.grip`.
- **Llamadas calificadas** (calificador-llamadas, Fase 3 del PLAN; 11-sep): `ventas_llamadas.py` lee
  `calificaciones_llamadas` del Supabase **analítica** (`ANALITICA_SUPABASE_URL/_KEY`, o `SUPABASE_*` si es
  el mismo proyecto; solo GET, últimos `VENTAS_LLAMADAS_DIAS` = 180) y `ventas_corte.agregar_llamadas` lo
  mete al corte como `llamadas {generado, dias, llamadas[]}` (o `error`). Cada llamada trae la nota
  ponderada (`pond`, la de registro: siguiente paso ×3; cierre, objeciones y calificación ×2), `cumple`
  (≥ 4), `sig_paso` (terminó con fecha y hora o acción registrable — el KPI que separa ganadas de
  perdidas: 37% vs 9%), las 14 `notas` [estrellas, evidencia] y el `audio`. El asesor se cruza por slug y,
  si no, por tokens dentro del nombre del CRM («Cinthia Heredia» ↔ «Cinthia Gabriela Heredia Cortez»);
  `VENTAS_LLAMADAS_MAP` y `llamadas_map` de la config mandan. En la tabla de Asesores son tres columnas
  **por actividad** (fecha de la llamada): «⭐ Llamadas», «% en estándar», «% con siguiente paso»; su
  drill lista las llamadas (el nombre abre el audio) y «Notas» abre `LlamadaModal` (`llamadas.tsx`) con
  las 14 preguntas. `corte_para` recorta las de otros asesores. Nadie se evalúa con esto hasta que la
  calibración humana (Pamela, Fase 2.3) dé ≥ 85%: la herramienta está medida contra sí misma y contra
  el cierre, no contra un humano.
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
  al cambiar filtros. **Perfiles son dos widgets** (Randall 6-sep, «como Embudo y
  Monto por etapa»): `perfiles` = la matriz con la nota de las medianas y
  `perfiles-tabla` = la tabla de asesores (perfil, actividad, vendido; el nombre
  abre la ficha), `desde: 'perfiles'` para que en un layout guardado el nuevo parta
  al viejo en dos si cabe a su derecha (`sanear` en `widgets.tsx`); por defecto van
  lado a lado, 3 + 3 columnas.
- **Hover estándar** (Randall 6-sep, img 9): todo lo clicable pasa a fondo gris
  suave `var(--hover)` al pasar el mouse (`.drill`, `.nbtn` con halo `box-shadow`,
  `.tile.tbtn`, leyendas, días del calendario, `.eye`, tramos de Primer contacto);
  **ningún `:hover` lleva `outline`** (el contorno azul es solo `:focus-visible`,
  teclado). El menú de propietarios usa `appearance: base-select` (Chrome 135+) para
  que sus opciones también lleven ese hover; en otros navegadores es el menú nativo.
  El botón «i» mide 18 px (área de clic 28 px por el `::before`). En el ranking la
  columna del monto crece a 300 px si el widget pasa de 720 px (container query) y
  la línea chica se parte si no cabe: nunca scroll horizontal (img 6).
- **Barra de filtros con equipos como botones** (Randall 6-sep, img 11): `.pill.equipos`
  = Todos + `corte.equipos` (Monterrey, Saltillo, Torreón, Monclova y cualquier
  KS-<zona> nuevo), junto a Kommo/HubSpot; sustituye al select y sigue en el hash `eq=`.
- **Ficha › Actividad en una sola fila** (Randall 6-sep, img 10 «se ve doble»):
  `.bubbles` es `grid-auto-flow: column` (N columnas, nunca dos filas), la bolita
  mide `--s` con `max-width: 100%` para achicarse en rangos largos, y cotizaciones
  (`.bubble.e`, c3) y levantamientos (`.bubble.l`, c4) son series separadas.
- **Glosario en lenguaje llano** (`glosario.ts`, Randall 6-sep): cada «i» dice qué
  muestra el widget y cómo se cuenta, sin mediana/prorrateo/cohorte/CF; todos los
  widgets (cifras, embudo, ficha, Mi día) llevan `info`. Perfiles trae además una
  **tarjeta de explicación** (`.nota-card`) de cómo se decide «baja actividad»
  (relativo a la mediana del grupo; Randall 6-sep: «ponlo en una tarjeta para tenerlo en cuenta»).
- **Controles del widget siempre a la vista** (Randall 6-sep, img 1): mover (⋮⋮), «i» y cerrar (×)
  ya no esperan al mouse (la esquina de tamaño sí); en las cifras (`.wtile`) el grupo va arriba a la
  IZQUIERDA. Esto revierte la regla del 4-sep de esconderlos hasta el hover: Randall los quiere visibles.
- **Tabla de Asesores con ritmo fijo** (Randall 6-sep, img 2 «está todo muy amontonado»): `table-layout:
  fixed` con `<colgroup>` en porcentajes (11.5 / 11.5 / 11.5 / 9.5 / 10 / 11.5 / 5.5 / 6 / 6 / 6.5 / 10.5),
  cada celda de métrica es `.mc` = rejilla de 4 renglones iguales (cifra 20 px · barra 12 px · dos leyendas
  de 15 px, una línea con puntos suspensivos y `title`), conteos centrados (`.cnt`), encabezados con guion
  suave (`Cotiza­ciones`, `Levanta­mientos`) y Asignación en rejilla de 4 renglones con el botón
  siempre en el 3.º («Quitar» / «Reactivar», acción completa en title y aria-label). Medido: a 1725 y 1440
  todos los renglones miden 96 px y solo se recorta el texto de error del Sheet; por debajo de 1500 px la
  tabla mide 1440 px y se desplaza a lo ancho en vez de aplastar las celdas.
- **Filtros del detalle (drill-down) «como HubSpot y Sheets»** (Randall 6-sep, `drill.tsx`): cada
  columna del `DrillModal` (Estado si hay, Registro, CRM, Asesor, Detalle, Monto, Cuándo) tiene un
  botón de embudo que abre `MenuCol` calcado del filtro de Sheets: ordenar (A→Z / Z→A, menor→mayor,
  más antiguo→más reciente), **filtrar por condición** (texto «contiene», monto mínimo/máximo, fecha
  desde/hasta con el día completo) y **filtrar por valores** (lista con buscador y conteos, «Seleccionar
  todo» y «Borrar» actúan sobre lo que se muestra), con Aceptar/Cancelar (los cambios se aplican al
  aceptar). Los conteos del menú salen de las filas que pasan los DEMÁS filtros. Los filtros activos
  se ven como **chips** (`Asesor: sin Randall Cruz`, `Monto: desde $100K`, `Orden: Monto ↑`) con ×
  y «Borrar todo»; el encabezado también ordena al clic (`aria-sort`). **Agrupar por** (Asesor, CRM,
  Detalle, Estado) mete encabezados de grupo con conteo y monto, colapsables; con grupos no hay
  páginas. Sin grupos, **páginas** de 100 (50/250/500) con Anterior/Siguiente. Escape cierra primero
  el menú y luego la ventana. El menú va con `z-index: 450` porque el fondo del modal es 400.
- **Página «Ventas reales» = la Analítica de la app de comisiones** (Randall 7-sep, `reales.tsx`,
  `analiticaReales()` en metrics.ts): mismas fórmulas que `renderAnalytics` de la app (master.js de
  comisiones-ventas-dun.vercel.app): seis cifras (ventas, contrato total, precio por panel = contrato /
  paneles, ticket = contrato / ventas, paneles, enganches pagados con %), mes contra mes (contrato del
  último mes con ventas contra el anterior, pegado a la gráfica de meses) y nueve gráficas (contrato y
  ventas por mes, top 10 vendedores, origen por monto, contrato por zona de la app, forma de pago,
  ticket por forma de pago, tamaño por paneles 1-4/5-8/9-12/13-16/17-20/21+, precio por panel por
  asesor top 10 y por mes). Las canceladas no cuentan; las gráficas «por mes» y el mes contra mes
  usan TODOS los meses (no el calendario), como la app. Filtros: los de la barra (calendario, equipo,
  propietario) + Región (R1 = MTY+SLT, R2 = TRC+MVA) y Captura (completa = origen + liga de HubSpot,
  salvo tres correos de `SIN_LIGA_HUBSPOT`) propios de la página. Toda barra, rebanada o punto abre el
  drill de sus ventas. Gráficas nuevas en components.tsx: `BarChart` (verticales, cifra encima y el
  segundo dato como texto: nunca dos ejes), `HBarList`, `LineChart` (línea SVG + textos HTML).
  `ventas_comisiones.py` trae desde el 7-sep `paneles, forma_pago, enganche, referido_por,
  bidireccional, extras, comision_pagada, zona_app, captura`; un corte viejo sin ellos muestra el
  aviso «se llena en el siguiente corte». Verificado contra la app: 1,008 ventas · $110M · 11,393
  paneles · 494 enganches (49 %) · −20.8 % Ago vs Jul, idénticos.
- **«Actualizado: 7 sep 2026, 09:12 · hace 2 h» + botón «Actualizar»** (Randall 7-sep, `actualizar.tsx`):
  en la barra del Admin, en lugar de «corte 7 sep 09:12». El botón (solo admin) hace `POST /ventas/refrescar`,
  que arranca `refrescar()` en un hilo (una corrida a la vez, 409 si ya corre) y `GET /ventas/estado.json`
  (cualquier sesión) da `{corriendo, ultimo_intento, ultimo_exito, ok, proximo, corte_mtime}`. El
  componente sondea cada 5 s mientras corre y cada 60 s en reposo; **la señal de «hay corte nuevo» es
  que `corte_mtime` cambie contra la línea base tomada al cargar**, no contra `corte.generado` (un archivo
  copiado o restaurado tiene otra fecha y eso recargaba en bucle); al cambiar, `onRetry` vuelve a bajar
  `data.json` y el hash conserva página y filtros. Tarda unos 4 minutos en producción. Si termina sin
  cambiar el archivo, avisa «Terminó sin cambios» o «No se pudo actualizar; se muestra el corte anterior».
- **Constructor de gráficas** (Randall 7-sep: «un graph modifier/builder para que ya no dependamos tanto
  de ti», `constructor.tsx`). Una gráfica = **medida × dimensión × tipo**. Medidas (23): actividad
  (llamadas realizadas/contestadas/sin contestar, tareas completadas, cotizaciones, levantamientos,
  descartados, primer contacto completado), seguimiento (tareas vencidas, tareas agendadas, leads sin
  tarea, primer contacto vencido, estancados, leads asignados, leads en juego, cotizado vigente),
  ventas del CRM (clientes cerrados, monto vendido, ticket) y ventas reales de la app de comisiones
  (ventas, contrato, ticket, paneles, precio por panel, enganches). Dimensiones: asesor, equipo, CRM,
  etapa, razón de descarte, mes, semana, día, origen, forma de pago, zona de la app, tamaño en paneles
  y «sin partir». Tipos: barras horizontales, verticales, línea, dona, cifra y tabla. Cada medida
  declara qué dimensiones acepta y su propia fecha (asignación, cierre o fecha del hecho); **las tareas
  abiertas son foto de hoy**, no del rango, como el reporte de HubSpot. `serie()` agrega con `suma`,
  `promedio` o `razón` (precio por panel = contrato ÷ paneles) y cada grupo guarda sus registros, así
  que toda barra abre el mismo detalle que el resto del tablero.
- **«Agregar gráfica» es una galería, no un desplegable** (Randall 7-sep): modal con buscador, las
  gráficas quitadas del tablero y 32 plantillas listas, **cada una con vista previa hecha con los datos
  y filtros de ese momento** (`mini`: top 5, sin drill). Desde ahí se agrega con un toque, se ajusta
  antes de agregar, o se abre el editor en blanco. El **editor** tiene los campos a la izquierda
  (qué medir, cómo partirlo, tipo con iconos, título, cuántos mostrar, y captura para las de
  comisiones) y la vista previa viva a la derecha. Las gráficas propias viven en el layout
  (`kv_orden_<clave>.graficas`, id `g:<n>`), se mueven, estiran, ajustan (lápiz) y se borran (×) como
  cualquier widget, y sobreviven a la recarga.
- **Una gráfica propia de tipo «cifra» se pinta con la MISMA tarjeta que las de fábrica**
  (Randall 10-sep: «el diseño no es proporcional al tamaño del widget»). `GraficaLibre` le pone
  `className="gcifra tile"` fuera de la vista previa, así hereda el fondo, el punto de color y —lo
  importante— la tipografía fluida `clamp(28px, 13cqw, 72px)` que crece con el ancho del widget
  (`.widget.wtile` es `container-type: inline-size`). Antes la cifra quedaba clavada en 30 px y sin
  tarjeta: en un widget grande se veía un número diminuto en una esquina. En la galería va SIN
  `.tile`, para no meter un recuadro dentro de otro. Medido: 214 px de widget → 28 px de tipo, igual
  que una cifra de fábrica del mismo ancho; 671 px → 72 px, que es el tope.
- **Gráficas MIXTAS: varias medidas en la misma gráfica** (Randall 10-sep: «debería poder hacer con el
  builder las gráficas que me muestras tú… les llamaría mixtas porque combinan dos o más fuentes»;
  referencia el builder de HubSpot «desde un ángulo más sencillo de operar»). En el editor, «Qué medir»
  es una LISTA: «+ Agregar otra medida» suma hasta 4 (`Grafica.medidas`), cada una con su × para
  quitarla. Reglas que hacen que nunca salga una gráfica tramposa:
  - Solo se combinan medidas **de la misma unidad y sumables** (`combinable()`: mismo `fmt` y `agg`
    suma). Piezas con piezas, pesos con pesos; un promedio o una razón no se apilan. Las demás salen
    deshabilitadas en el desplegable. Así la gráfica tiene **una sola escala** y nunca hay dos ejes.
  - **Cómo combinarlas**: `apilado` (una sobre otra, se lee el total) o `lado` (una junto a otra, para
    comparar); `Grafica.modo`. En apilado la cifra del renglón es el total; en lado a lado son los
    valores separados por ·.
  - Con dos o más medidas, **dona y cifra se apagan** (miden UNA cosa) y quedan barras, línea y tabla
    (`MULTI_OK`). Si estaba en dona o cifra al sumar la segunda medida, se cambia sola a barras.
  - Si una medida es **más de 20 veces** la otra, el editor avisa que la chica no se va a ver y sugiere
    gráficas aparte (era el caso de leads 851 contra ventas 24 por ciudad).
  - **Leyenda arriba siempre** (identidad nunca por color solo), con el total de cada medida; cada chip
    abre TODOS los registros de esa medida.
  - `multiserie()` corre `serie()` por medida y comparte las etiquetas, ordenadas por la suma de todas
    (o por tiempo), para que el orden no brinque al prender y apagar medidas.
  - Ocho plantillas mixtas encabezan la galería (`MIXTAS`): llamadas contestadas/sin contestar,
    levantamientos agendados contra hechos, del lead a la venta, actividad por asesor, riesgo de
    seguimiento, en juego y descartados, cotizaciones y ventas por mes, y por ciudad.
- **Toda gráfica propia abre el detalle al clic** (Randall 10-sep: «las gráficas que yo creo no me deja
  darle clic para ver el detalle»). Faltaba la **cifra**, que era un `div`: ahora es `button.gcifra.tile`
  y abre los registros de esa medida. En las mixtas, el clic en la barra abre el desglose por medida
  (`BarDetailPopup`, con su cuadrito de color y su %) y de ahí a los registros; en la tabla mixta cada
  celda es un botón; en la línea mixta cada punto abre su medida.
- **Una cifra propia se puede comparar contra la meta** (Randall 10-sep: «cómo crearía este tipo de
  widgets con el creador de gráficas», señalando la tarjeta de $320K). Casilla **«Comparar contra la
  meta»** en el editor, visible solo cuando la gráfica es una **cifra** y la medida es **dinero que se
  suma** (`conMeta()`: `fmt` de pesos y sin `agg`; un ticket promedio no). Con ella la cifra se pinta
  igual que la tarjeta de fábrica «Avance contra la meta»: porcentaje, medidor `Bullet` (marca gris =
  lo que tocaría hoy, negra = la meta) y la frase del ritmo, con `ritmo-<estado>` para el color.
  `metaTotal(corte, filtros)` suma `metaRango` de los asesores que caben en los filtros — misma regla
  que la de fábrica, así que dan el MISMO número (medido: $2.4M, 13 % de $18M, mismo texto de ritmo).
  Sin metas configuradas lo dice («sin meta configurada») en vez de inventar un 0 %. Dos plantillas en
  la galería: «Vendido contra la meta» y «Cotizado vigente contra la meta».
- **«Meta de venta» es una MEDIDA más del constructor** (Randall 10-sep: «agrega el concepto de Meta
  venta al constructor para poderlo usar en las gráficas»). No sale de ningún lead: son las metas de
  Configuración repartidas al periodo (`porAsesor().metaRango`), con dimensiones asesor, equipo y sin
  partir. Como es dinero que se suma, **se combina con «Monto vendido»** en una mixta lado a lado:
  plantillas «Vendido contra la meta por asesor» y «por equipo». Detrás de una meta no hay registros
  del CRM, así que su detalle es la lista de asesores con su meta del periodo (`Item.u`, `filasDe()`).
- **Cada widget puede tener SUS fechas** (Randall 10-sep: «si un widget siempre debe mostrar la info
  histórica, que la muestre y no conflictúe con el date range del tablero», como los widgets de
  HubSpot). `rangos.ts` guarda `{widgetId: Preset}` bajo la clave `rangos-<clave>` **en la cuenta**
  (mismo patrón que el acomodo y las columnas: gana el `ts` más nuevo contra el localStorage), así que
  el teléfono ve lo mismo. En el encabezado de cada widget hay un icono de calendario; cuando el
  widget NO sigue al tablero se vuelve un **chip con el nombre del periodo** («Máximo») — visible
  también en móvil, porque si no se leería el número creyendo que es del periodo de arriba. El menú
  (portal al `body`, si no lo recortaba la tarjeta) ofrece «Las fechas del tablero» + los 15 periodos.
  Para que funcione en los widgets de fábrica, `AdminDashboard` extrajo su derivación a `datosDe(corte,
  filtros)` y arma el tablero con `construir(filtros, datos)`: una vez con las fechas de arriba y una
  vez **por cada periodo distinto** que alguien haya fijado (no una por widget). Las gráficas propias
  lo resuelven en `taller.render`, con `filtrosDe('g:' + g.id)`.
- **El eje X puede ser el TIEMPO** (Randall 10-sep: «que se pueda partir por semana, mes, bimestre,
  cuarto, semestre o año… el X la partida y el Y el monto»). Dimensiones nuevas: Semana, Quincena,
  Mes, Bimestre, Trimestre, Semestre, Año (más el Día que ya existía). `cubo()` decide en qué periodo
  cae una fecha y `cubosDe()` genera TODOS los periodos del rango, así que **un periodo sin registros
  entra con cero** en vez de desaparecer (una línea con huecos miente). Bimestres, trimestres y
  semestres son de **calendario** (arrancan en enero). Reglas que trae el cambio:
  - En tiempo se muestran los **más recientes**, no los más altos (`recortar()`), y el selector dice
    «Cuántos periodos · Los 12 más recientes».
  - **La línea solo existe con una dimensión de tiempo** (Randall hizo una línea por asesor y salió un
    punto suelto); al elegir un eje de tiempo, unas barras horizontales pasan solas a verticales.
  - La gráfica **dice contra qué fecha** cae cada registro en su periodo: «Fechas por cierre / por
    actividad / por asignación» (`Medida.base` + `BASE_FECHA`, el mismo diccionario que las columnas
    de Asesores). Solo aparece cuando el eje es tiempo, que es donde la duda muerde.
  - **La meta también se parte por tiempo**: `metasPorMes()` corta la meta mensual de cada asesor mes a
    mes dentro del rango y prorratea los meses incompletos por días. Por eso la meta acepta mes,
    bimestre, trimestre, semestre y año, pero **no semana ni día** (repartir una meta mensual dentro
    del mes sería inventar dato).
  - El total de la leyenda de una mixta es el de **lo que se ve**: con 12 meses dibujados de un rango
    de tres años, poner la suma de los 39 hacía leer mal la gráfica.
  - Plantillas nuevas: «Vendido contra la meta por mes» y «por trimestre», «Monto vendido por
    trimestre», «Clientes cerrados por año», «Leads asignados por semana».
- **La etiqueta de fechas del widget, al estilo HubSpot** (Randall 10-sep: «el icono de calendario no
  se puede cambiar a un formato de tipo etiqueta así como el de HubSpot»). Cada widget muestra
  SIEMPRE una píldora con el nombre del periodo que está mirando: apagada cuando sigue al tablero
  («Este mes») y encendida cuando tiene fechas propias («Máximo»). El menú abre con una cabecera que
  dice el periodo, **las fechas de verdad** («1 sep 2026 – 30 sep 2026») y **contra qué fecha cuenta
  ese widget** («Cuenta por asignación», con la explicación larga en el tooltip): saber el periodo sin
  saber qué fecha se compara contra él no basta. `Widget.base` lo declara para los widgets de fábrica
  de una sola medida (12 de ellos) y `baseDe(g)` lo deduce de las medidas de una gráfica propia.
  BUG resuelto: el menú se cerraba al hacer scroll (era un portal fijo); ahora **sigue al botón** y
  solo se cierra si el botón sale de la pantalla.
- **Las fechas de una gráfica propia se eligen DENTRO del constructor** (Randall 10-sep: «esto debería
  vivir dentro del builder para los widgets construidos»): campo «Fechas de esta gráfica» con «Las del
  tablero» + los 15 periodos, y la vista previa se redibuja con ellas. Escribe en el mismo almacén que
  la etiqueta del widget (`rangos.ts`, clave `g:<id>`), así que no hay dos verdades. La página le pasa
  al constructor un `FechasCtor` (`de` / `filtros` / `fijar`) porque solo ella sabe traducir un periodo
  a fechas. Además, toda gráfica propia dice ahora «Fechas por cierre / por actividad / por
  asignación» (antes solo en ejes de tiempo).
- **Arreglos de lectura en las gráficas** (Randall 10-sep: «nombres empalmados y etiquetas invisibles
  de cada punto»). (a) Una **línea sobre categorías** (asesor, ciudad…) ya no se dibuja: `GraficaLibre`
  la convierte a **barras horizontales**, donde el nombre tiene renglón completo — así se arreglan
  también las gráficas viejas guardadas con ese tipo. (b) En una línea con muchos puntos, el eje
  dibuja **una etiqueta de cada `paso`** (primera y última siempre) y cada una se recorta a su ancho:
  24 semanas → 9 etiquetas sin encimarse. (c) Las cifras sobre los puntos **vuelven a verse** en las
  líneas mixtas cuando caben (`n × series ≤ 20`), alternando arriba/abajo por serie. (d) En barras
  verticales con más de 10 columnas, el nombre se pone **de canto** en vez de recortarse a tres letras.
  (e) La **meta nunca se apila**: aunque la gráfica guardada no lo diga, si una de las medidas es
  «Meta de venta» el modo es «lado a lado».
- **Las medidas apagadas dicen por qué** (Randall 10-sep: «¿por qué se bloquean ciertos datos?»): en el
  segundo desplegable, una medida que no se puede combinar aparece con el motivo pegado al nombre
  — «otra unidad» (piezas contra pesos) o «es un promedio, no se suma».
- **Medida «Cumplimiento de la meta»** (Randall 10-sep: «ver la evolución de los asesores respecto a
  sus ventas vs la meta establecida»). Es una **razón**: `sum(vendido) / sum(meta)` con `agg: 'razon'`,
  formateada en %; 100 % es meta cumplida. Sus items son las ventas (`v`) y las metas mes a mes (`v2`),
  así que sirve por asesor, por equipo o mes a mes (no por semana ni por día, porque la meta es
  mensual). El **total de una razón** ya no era la suma: `serie()` lo calcula como razón de los
  totales. Tres plantillas: por mes, por asesor y por equipo.
- **En la ficha de una persona la barra de arriba deja de filtrar** (Randall 10-sep: «no tiene mucho
  sentido que aparezcan esas opciones como botones si estamos viendo la info específica de ese
  asesor»). Ahí el selector de propietario cambia de «filtrar el tablero» a **saltar de asesor**:
  lista a todos agrupados por equipo (`optgroup`) y elegir a alguien abre SU ficha; la primera opción
  («← Ver a todos los propietarios») sale de la ficha. Los botones de equipo y los de Kommo/HubSpot
  se reemplazan por un dato: «Monterrey · Kommo y HubSpot» (`.tb-info`). Y la ficha ya **ignora
  también el filtro de CRM** (antes solo el de equipo): si el tablero estaba en Kommo y la persona
  trabaja en HubSpot, su ficha salía vacía.
- **La ficha es ahora el tablero de UNA persona** (Randall 10-sep, PDF «Dashboard por vendedor»:
  «que la vista por defecto sea como el diseño del PDF, solo antes pones lo de la gráfica y tabla de
  evolución»). Los widgets del tablero general salieron de `AdminDashboard` a una función suelta,
  `widgetsTablero(corte, filtros, datos, acciones)`, y la ficha la llama con `asesor` fijado: así los
  mismos números (cotizaciones, descartados, levantamientos, leads asignados, clientes cerrados,
  conversión, tasa de pérdida, tareas completadas, embudo, monto por etapa, primer contacto,
  llamadas) se ven de esa persona sin duplicar una línea de código (`FICHA_COMPARTIDOS`). Quedan
  fuera los de equipo (salud, ranking, perfiles) y los que la ficha ya cuenta a su manera.
  - **Arriba, la evolución**: «Monto vendido y Meta de venta por mes» (barras lado a lado) y la misma
    tabla con el contrato de la app de comisiones. Son widgets de fábrica, no gráficas del usuario.
  - **«Porcentaje de cierre»** con su medidor y «Meta: 10 %» (`META_CIERRE`, constante mientras no
    viva en Configuración): clientes cerrados ÷ leads asignados del periodo.
  - `ORDEN_FICHA` fija el orden del PDF y la clave del acomodo pasó a `ficha2`, para que todos
    estrenen el diseño sin tener que restablecer el tablero.
  - La ficha también estrena la **etiqueta de fechas por widget** (`useRangos('ficha')`), que es lo
    que faltaba: 22 widgets, 22 etiquetas. La elección se comparte entre fichas.
- **«Mis gráficas»: guardar una gráfica para reusarla** (Randall 10-sep: «que las gráficas que cree
  las pueda guardar para que se queden en la galería»). En el constructor, el botón «Guardar en mis
  gráficas» la deja en la CUENTA (clave `mis-graficas`, `useMisGraficas()`), y la galería abre con la
  sección «Mis gráficas · las que tú guardaste», cada tarjeta con «Ajustar antes de agregar» y
  «Quitar de mis gráficas». Viven aparte de los tableros: la misma gráfica se agrega al Dashboard, a
  la ficha o a donde sea, y borrarla de la galería no toca los tableros donde ya esté.
- **Aplicarle tu acomodo a otras cuentas** (Randall 10-sep: «el orden y acomodo que haga lo pueda
  aplicar para ciertos usuarios o roles… para acomodarle la vista a los demás»). Botón «Aplicar a
  otras cuentas» en la barra del tablero (solo administrador). El modal lista las cuentas activas de
  `usuarios.json`, con atajos por rol, y `POST /ventas/tablero/compartir {destinos, datos}` —admin,
  cuentas que existan, mismo tope de tamaño— les escribe las mismas claves que cada quien guarda: el
  acomodo (`admin`, `ficha2`, `midia-<uid>`) y sus fechas por widget (`rangos-<clave>`). El modal
  avisa a quién le sirve cada vista: el Dashboard y la ficha solo los abren las cuentas de
  administrador; «Mi día» es de esa persona, así que se le aplica a SU cuenta.
- **La ficha del asesor también trae el constructor**, fijado a esa persona (`{...filtros, asesor: uid}`);
  Mi día usa una galería simple con lo que se quitó de ese tablero (no tiene medidas propias).
- **La página «Ventas reales» desapareció** (Randall 7-sep: «no quiero otra sección, lo quiero todo en
  Dashboard»): sus nueve gráficas y sus cifras son plantillas de la galería, con las mismas fórmulas.
  Se perdió el filtro de Región (los botones de equipo ya cubren las zonas) y el tile de mes contra mes.
- **Una sola familia de botones** (Randall 7 y 8-sep): en el widget, asa, «i», ajustar y cerrar son
  iconos de trazo del mismo gris (`--g2`), **sin recuadro**, en cajas de 22-24 px que se pintan con
  `--hover` al pasar el mouse; la «i» es un círculo DIBUJADO (`IconoInfo` en components.tsx), no la
  letra suelta en un círculo con borde. En las **cifras** (`.wtile`) el asa y la «i» van arriba a la
  izquierda y la × en la **esquina superior derecha** (`.whead` con `left` y `right`), igual que en los
  widgets con título (Randall 8-sep). En la barra del tablero los cuatro botones son `.btn.sm` con
  icono y texto: Agregar gráfica · Agregar separador · Quitar espacios · Restablecer tablero (antes
  uno tenía recuadro y los otros eran texto suelto).
- **Barras congeladas** (Randall 8-sep, «como Excel cuando congelas filas»): la barra de filtros y la de
  gráficas se quedan pegadas arriba al bajar por el tablero. La chincheta del extremo derecho de la barra
  de filtros las suelta y las vuelve a fijar (`.main.congelado`, preferencia en `localStorage`
  `kv_congelar`, encendido por defecto). La segunda barra se pega justo debajo de la primera con
  `top: calc(var(--barra-h) - 18px)`, y `--barra-h` lo escribe un `ResizeObserver` sobre la barra de
  filtros (su alto cambia al filtrar o al angostar la ventana). **Solo de 961 px para arriba**: en
  teléfono dos barras fijas se comen media pantalla. Medido: con el tablero desplazado 1,400 px las dos
  siguen visibles (0 y 103 px); soltadas, se van con el contenido; la elección sobrevive a la recarga.
- **«Quitar espacios»** (Randall 8-sep, «por un error en el acomodo me quedaron huecos que quitan mucho
  tiempo»): `compactar()` sube cada widget hasta donde tope sin cambiar columna ni tamaño, y se aplica
  **al quitar un widget** (para no dejar el hueco) y al tocar el botón, que **solo aparece cuando hay
  algo que subir** (`huecos()`, comparando fila por fila: comparar los objetos serializados siempre
  decía que sí porque `compactar` devuelve las llaves en otro orden). Arrastrar sigue SIN gravedad: se
  puede dejar aire a propósito. Medido: tablero empujado 6 filas + hueco de 8 → 4,198 px de alto;
  tras el botón, 3,226 px, primera fila 1, cero solapes y guardado.
- **Sesión móvil (Randall 7-sep, `/ui-ux-pro-max`, ≤ 699 px)**: **barra inferior** `.bnav` con las
  secciones del perfil (iconos SVG de trazo + etiqueta, 56 px de alto, indicador ámbar arriba, aire
  para `env(safe-area-inset-bottom)`; `.main` lleva 76 px de padding abajo) en lugar del menú
  hamburguesa, que se oculta en teléfono (sigue entre 700 y 960 px). **Barra de filtros compacta**:
  calendario a lo ancho, botón «Filtros (n)» y la leyenda «Actualizado»; propietario, equipos y
  Kommo/HubSpot viven en una **hoja inferior** (`.tb-controles.abierta`, fondo `.tb-fondo`, botón
  «Listo») — en escritorio `.tb-controles` es `display: contents` y todo fluye igual que antes, así
  que los selectores de las pruebas no cambian. **Cifras en dos columnas** (`.wtile` span 1 sobre una
  rejilla de 2), el resto a lo ancho. **Sin controles de edición** en teléfono: ⋮⋮, ×, esquina de
  tamaño y la barra «Agregar gráfica / separador» se esconden (el acomodo libre es de escritorio y
  las posiciones ya se ignoraban < 1000 px); la «i» se queda. El detalle ya era pantalla completa
  ≤ 640 y el menú de columna cabe (300 px). Medido con `medir_i.py` a 390 × 844: sin desborde en
  Dashboard, Asesores (la tabla se desplaza adentro), Ventas reales, Mi día y el detalle.
- **Cotizaciones generadas · quién manda qué** (Randall 9-sep: «qué combinación de cotizaciones están
  enviando los asesores»): al widget de métodos de pago se le agregó una tercera tabla, por asesor, con
  cuántas cotizaciones generó, la combinación de métodos que más repite y sus paneles típicos (mediana,
  para que una cotización enorme no mueva el número). `masUsada()` y `medianaPaneles()` en `admin.tsx`;
  los datos ya venían en `cotizacionesGeneradas().porAsesor`, solo no se dibujaban. Clic en el asesor
  abre su lista. Prueba de punta a punta 9-sep: `POST /cotizador/entregada` escribió las 2 filas
  esperadas en la tabla `cotizaciones` de Supabase y se borró la fila de prueba; la tabla quedó vacía
  porque el registro se estrenó el 8-sep a las 20:00 y nadie había generado una cotización todavía.
- **La tabla de Asesores, resuelta (Randall 9-sep, `/goal`)**: (a) **el ancho ya no reparte el
  100 %** — cada columna trae su ancho en píxeles y la tabla lleva `min-width` en línea, así que
  cuando no caben todas `.tblwrap` las desplaza con su barra en vez de aplastarlas (antes, agregar
  una columna angostaba a todas); (b) **siete columnas nuevas** para ver la misma data del tablero:
  «Leads asignados» del periodo y «Cómo acabaron» (barra mixta en juego / ganados / descartados)
  visibles por defecto, más Conversión, Tasa de pérdida, Ticket promedio, Cumplimiento de la meta y
  Actividad total ocultas hasta que se pidan — 22 columnas en total, todas ordenables y movibles
  desde el modal; (c) **encabezados arreglados**: el «i» del glosario ya no cae solo en su renglón
  (`.sortbtn` pasa a `display: inline` en esta tabla) y el título no se parte en tres líneas;
  (d) **las cifras grandes abren su detalle**: Vendido (ventas del rango), Cotizado vigente (los
  leads que sí cuentan, con `vigentesDe`) y Leads activos, además de las de conteo que ya lo hacían.
- **Encabezados de la tabla de Asesores: todos a la izquierda y en UN renglón** (Randall 9-sep: «los
  headlines simétricos y alineados, sin saltos de fila, nada centrado»). `.tbl.asesores th` y
  `th.cnt` llevan `text-align: left` y `white-space: nowrap`, y las celdas de conteo también alinean
  a la izquierda para que la cifra caiga bajo su título. El ancho de cada columna se eligió para que
  su título quepa completo; **si un título nuevo no cabe, se le sube el ancho a la columna o se
  acorta la etiqueta, nunca se parte el texto**. Por eso «Primer contacto vencido» pasó a
  **«1er cont. vencido»** (lo dictó Randall textualmente) y «Cumplimiento de la meta» a
  «Cumplimiento»; también se quitaron los guiones suaves de «Cotizaciones» y «Levantamientos», que
  con `nowrap` ya no servían. ⚠️ Esto convive con la regla vieja de no abreviar: manda lo que pida
  Randall para el caso concreto.
- **⚠️ Un `return` temprano en un componente con hooks tumba la página en blanco.** `Asesores`
  salía con «Sin asesores…» ANTES de correr `useColumnas`, `useMemo` y `useState`; al filtrar por una
  zona sin asesores (Saltillo en Kommo) React corría menos hooks que en el render anterior y la
  pantalla quedaba vacía. Regla: en estos componentes el aviso de «no hay datos» va **después** de
  todos los hooks. Reportado por Randall 9-sep.
- **Qué le hacen las fechas a cada columna, dicho en su encabezado** (Randall 9-sep: «es peligroso
  no saber si lo que veo es de leads asignados o de actividad»; en el Sheet había DOS selectores de
  fecha y se veía feo). Cada `ColDef` declara `fecha: 'asignacion' | 'actividad' | 'cierre' |
  'ninguna'` y bajo el título se escribe «por asignación», «por actividad» o «por cierre», con la
  explicación completa en el `title`. Arriba de la tabla, una línea dice que el rango no significa
  lo mismo en todas las columnas. Sin segundo calendario. `BASE_FECHA` en `columnas.tsx` es la
  tabla de significados; si se agrega una columna, se le pone su base o queda muda.
- **Columnas de la tabla de Asesores: se eligen y se ordenan** (Randall 9-sep: «poder agregar y
  quitar columnas, como en el tablero podía quitar y agregar gráficas»). `columnas.tsx` es el
  elegidor reutilizable: `ColDef` describe cada columna (id, etiqueta, `peso` de ancho, `fija`,
  `cnt`, `info` del glosario, `oculta` si no se muestra hasta que la pidan, y `celda(f)`), el hook
  `useColumnas(clave, todas)` resuelve orden y visibilidad, y `EditarColumnas` es el modal con
  casilla y flechas ▲▼ por columna, «Restablecer» y «Listo». Los anchos ya no son once porcentajes
  fijos: `anchos()` reparte el 100 % entre las visibles, así quitar una no desbalancea la tabla.
  Se guarda **en la cuenta** con el mismo endpoint del tablero, bajo la clave `cols-asesores`
  (por eso `validar_tablero` ya no exige `pos`: acepta cualquier ajuste chico de la vista).
  Columnas nuevas, ocultas hasta que se pidan: Equipo, Ventas cerradas, Estancados y Leads sin
  tarea; las cuatro se pueden ordenar y las tres de conteo abren su lista. Asesor es fija.
- **El acomodo del tablero viaja con la CUENTA** (Randall 9-sep: «al ser una cuenta de usuario se
  sobreentiende que web y móvil deben mostrar la misma información»): antes vivía solo en el
  `localStorage` del navegador, así que el teléfono empezaba de cero, sin su orden ni sus
  separadores. Ahora `GET /ventas/tablero.json` devuelve los acomodos de la sesión y
  `POST /ventas/tablero {clave, layout}` guarda el suyo (cualquier rol, no solo admin; `layout: null`
  lo borra) en `data/ventas_tableros.json` = `{uid: {clave: layout}}`, con tope de 200 KB por cuenta.
  El navegador sigue escribiendo su copia local para pintar al instante. **Gana el más reciente**:
  cada layout lleva `ts` y al abrir se compara el de la cuenta contra el de `localStorage` (no contra
  el estado en memoria, que va un paso atrás); si el de este equipo es más nuevo, se sube en vez de
  pisarse, así que la primera vez que abres la computadora tu acomodo de siempre estrena la cuenta.
  En móvil las posiciones se siguen ignorando (se apila en orden de lectura), pero ese orden y los
  separadores ya son los tuyos. ⚠️ Las pruebas que asumían solo `localStorage` tienen que borrar
  también `data/ventas_tableros.json` (e2e_grid.py y e2e_v2.py ya lo hacen).
- **«Ya se hizo» lo dice el Excel de operaciones, no el embudo** (Randall 9-sep, corrección): el
  asesor no siempre mueve la tarjeta, así que el embudo subregistra. `levantamientos_sheet.gs` es un
  Apps Script de SOLO LECTURA («Levantamientos para el dashboard») que sirve las dos fuentes reales:
  el Excel de MTY `1Tddw84F…` pestaña «2026 Levantamientos» (columna Estado y Fecha Finalización,
  **solo las prioridades de ayuda a cierre**: Ayuda Cierre, URGENTE Cierre, URGENTE mejoravit y
  URGENTE Cierre COMERCIAL — 238 de 761 filas; las de instalación y post-venta quedan fuera) y el
  sheet nuevo por zona `1blqheWi…` (pestañas MTY/SLT/MVA/TRC, columna «¿Se realizó el levantamiento?»),
  al que Monterrey se mudará. `agregar_levantamientos()` en ventas_corte.py lo lee con `LEVANTAMIENTOS_URL`
  (+ `LEVANTAMIENTOS_TOKEN`); sin esa variable no entra nada. `levantados()` en metrics.ts agrupa por
  zona y por asesor; widget «Levantamientos de ayuda a cierre». ⚠️ Al pegar código en el editor de
  Apps Script, los combining marks literales (el rango `̀-ͯ` de un `normalize('NFD')`)
  **impiden guardar el archivo** sin decir por qué: van escapados. Números del Excel al 9-sep: 238
  pedidos, 215 hechos (90 %), mediana 3 días; septiembre 21 pedidos y 4 hechos.
- **De los levantamientos agendados, cuántos ya se hicieron** (Randall 9-sep): agendar y hacer la
  visita son dos etapas distintas del embudo. `ventas_kommo.entradas_etapas()` lee UNA sola vez el
  historial de `lead_status_changed` y saca las tres señales (Propuesta entregada, Levantamiento
  agendado 110266952, Levantamiento hecho 109436772); en HubSpot son
  `hs_v2_date_entered_1432144491` y `_1409289354`. Cada lead trae `lev_agendado` y `lev_hecho`.
  `visitas()` en metrics.ts arma agendados / hechos / pendientes / hechos-sin-agendar y los días de
  agendar a visitar. Widget «Levantamientos agendados y hechos» (tabla por asesor con % y días) más
  dos medidas del constructor. Corte del 9-sep: 31 agendados, 5 hechos (16 %), mediana 6 días; 21
  visitas hechas sin pasar por «agendado», casi todas de HubSpot, donde esa etapa no se usa.
- **De qué ciudad es cada lead** (Randall 8-sep, «me gustaría saber los leads de qué ciudad son»):
  cada lead trae `ciudad`. En Kommo sale del campo «Ciudad» del CONTACTO (1823968, la deja el bot al
  precalificar) y, si viene vacío, del «Municipio» del formulario de levantamiento (1833639); en
  HubSpot, de la propiedad `ciudad` del deal (la mantiene al día `hs_ciudad.py`). `ciudad_limpia()` en
  `ventas_corte.py` deja una sola forma de escribirla («TORREON, COAH.» y «Torreón» son la misma).
  Sale como columna «Ciudad» en el detalle (se agrupa y se filtra como las demás) y como dimensión
  «Ciudad del cliente» del constructor, con dos gráficas listas. Cobertura del corte del 8-sep: 7,406
  de 11,222 leads (HubSpot 75 %, Kommo 34 %); lo demás dice «Sin ciudad», sin inventarla.
- **Arrastrar y colocar desde la galería** (Randall 8-sep, «que pueda arrastrar y colocar, por ejemplo
  al lado, para no tener que buscar el widget dónde quedó»): elegir una tarjeta en «Agregar gráfica» ya
  no la manda al primer hueco libre. La galería se cierra y la gráfica queda pegada al puntero
  (`colocando` en `widgets.tsx`): un fantasma marca la celda y el siguiente clic —o soltar, si se
  arrastró la tarjeta— la deja ahí; el aviso de abajo ofrece «Ponla donde quepa» y Escape cancela.
  Arrastrar la tarjeta más de 8 px equivale a tocarla (`arrastrar()` en `constructor.tsx`). Solo en la
  rejilla libre (≥ 1000 px): en móvil sigue cayendo en el primer hueco.
- **El detalle ya no mezcla etapa con números** (Randall 8-sep: «le pongo de mayor a menor y me ordena
  por el nombre del embudo y etapa de la A a la Z»): `Fila` tiene `embudo`, `etapa` y una columna
  numérica propia (`num` + `numLabel`), y el drill-down las muestra como columnas separadas, cada una
  con su menú de ordenar y filtrar. La numérica se llama según de dónde venga la ventana («Días sin
  cambio», «Días desde la cotización», «Horas al primer contacto», «Días desde la asignación», «Tareas
  vencidas») y ordena por número, no por texto; su filtro por condición es un rango mínimo–máximo. Cada
  ventana enseña solo las columnas que sus filas traen (`OPCIONALES` en `drill.tsx`).
- **Configuración › Ventas reales (8-sep)**: la tabla del cruce lleva `<colgroup>` (26 / 10 / 9 / 33 / 22 %),
  `table-layout: fixed` y tope de 1,060 px (`.cfg-com`); el menú no parte su texto en dos líneas. A 1,780 px
  las cinco columnas quedaban desperdigadas y los renglones medían distinto; ahora todos miden 43 px.
- **Configuración › Ventas reales (7-sep)**: la tabla del cruce con la app de comisiones trae la columna
  «Activo en» con el CRM (Kommo / HubSpot / ambos) del vendedor con el que queda cruzado (fijo o
  automático) y la etiqueta «desactivado» si está oculto en Vendedores; las opciones del menú dicen
  «Nombre · CRM».
- **Tabla de Asesores, 6-sep**: el resumen del asesor (`AsesorPopup`) se abre SOLO desde el
  nombre (el renglón ya no es clicable ni lleva `.row`); la columna Cotizado vigente trae una
  barra de avance contra el objetivo `cotizado_x` × meta mensual («2% de $8M · objetivo 10×»);
  y las cifras Primer contacto vencido / Cotizaciones / Descartes / Levantamientos son botones
  (`.nbtn.celln`) que abren el mismo `BarDetailPopup` que Llamadas y Tareas: PC vencido por
  cuánto llevan asignados (1-3, 4-7, más de 7 días), cotizaciones y levantamientos por dónde
  van hoy sus leads (`estadoHoy`: etapa, Ganado o Perdido), descartes por razón (`razones()`,
  top 6 + «otras»); cada renglón abre el detalle de leads.
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
- **Configuración son DOS secciones con interruptor** (pedido de Randall 4-sep): «Vendedores» es
  cómo se mide al equipo (metas en pesos general/zona/vendedor, equipo, ojo de activo, cruce con la
  app de comisiones) y «Usuarios de la plataforma» es quién puede entrar. Son cosas distintas: un
  vendedor del CRM existe aunque nadie le haya creado cuenta, y una cuenta de administrador no
  corresponde a ningún vendedor. Un solo botón Guardar arriba escribe las dos. En la tabla de
  vendedores hay una columna «Cuenta» que dice si ya tiene y, si no, la crea ligada de una vez.
- **Alta de cuentas con correo** (pedido de Randall 4-sep): el identificador de entrada puede ser
  un **correo** o el usuario corto de antes (`_USUARIO` acepta los dos formatos, hasta 64
  caracteres). Una cuenta se **desactiva sin borrarla** (`activo: false`): conserva contraseña e
  historial y `autenticar` la rechaza. NO se exige que quede un administrador en la lista, a
  propósito: `DASH_USER`/`DASH_PASS` siempre entra como administrador maestro, así que un tablero
  con puras cuentas de vendedor es válido; la página lo avisa pero no lo bloquea.
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

### Tipografía: IBM Plex Sans (4-sep)

Antes decía `font-family: Inter` **y nunca la cargaba**: cero peticiones de fuente, ninguna
familia en `document.fonts`, y el ancho de un texto con `Inter, system-ui` medía exactamente lo
mismo que con `system-ui` solo. O sea que el tablero se veía con la fuente del sistema (Segoe UI
en las máquinas del equipo) y por eso se sentía genérico. Ahora la fuente **se carga de verdad**
con `<link>` a Google Fonts en `ventas/index.html` (con `preconnect`, pesos 400/500/600/700,
`display=swap`).

Se eligió con un panel de agentes que midió los archivos woff2 reales, no de memoria:

- **Sus diez dígitos miden 600/1000 em en los cuatro pesos**, así que las columnas de montos
  alinean por diseño y ningún widget nuevo puede romper una columna por olvidar `tabular-nums`
  (con Inter sí pasa: sus cifras por defecto son proporcionales, de 407 a 646). Las ~20
  declaraciones de `font-variant-numeric: tabular-nums` que ya existen quedan inertes; se dejan.
- **Distingue lo que Inter confunde a 11px:** la I lleva travesaños, la l lleva cola, el 1 lleva
  bandera, y el 0 (600) es más angosto que la O (708). Son montos, folios y teléfonos.
- **Escala compensada:** su altura de x es 0.516 em contra 0.5459 de Inter, 5.5 % menos cuerpo
  visible al mismo px. Por eso el texto de interfaz subió medio pixel (cuerpo 13 → 13.5, tablas y
  etiquetas 12 → 12.5, texto chico y encabezados 11 → 11.5, iniciales 9 → 9.5). Las cifras
  grandes NO se tocaron: ahí manda el alto total, no la altura de x. No se paga en ancho: Plex es
  ~4 % más angosta por glifo, así que las filas quedan casi igual de anchas que antes.
- **Plex no tiene figuras proporcionales:** toda cifra cae en caja de 0.6 em y a 28-72px el 1 y
  las comas abren huecos. Se cierran con `letter-spacing: -.02em` en las clases de cifra. Si algún
  día se ve mal, la salida es bajar el máximo del `clamp` de 72 a 64px, no cambiar de fuente.
- **El texto de tabla va a peso 500:** a 400 y 11-12px sobre el gris secundario se adelgaza.
- **Riesgo asumido:** la voz es la de IBM Carbon, o sea instrumento de datos serio. La marca la
  siguen cargando el ámbar `#FFB300` y el logo, no la tipografía. Segundo lugar: Fira Sans (más
  densidad en columnas de dinero por su `tnum` de 560/1000, pero menos carácter y estática).
- En una cifra el encabezado del widget no ocupa una fila propia: se recuesta en la esquina
  superior derecha de la tarjeta (`.widget.wtile .whead` absoluto), porque la «i» y los controles
  quedaban flotando sueltos sobre el tablero.

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
  **IBM Plex Sans**, tinta `#141619`, texto secundario `#5B6472` (6:1). Acento de marca
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
