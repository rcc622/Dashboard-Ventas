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
