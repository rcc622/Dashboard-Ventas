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

Dentro de `por_ventana["7"|"14"|"28"]`:

```
asignables            leads de Meta cuya ciudad SÍ cae en cobertura
llegaron_por_zona     {MTY,SLT,TRC,MVA} leads en zona, con o sin dueño
asignados_por_zona    {…} los que ya tienen asesor
sin_asignar_por_zona  {…} llegaron - asignados. El problema de ruteo, por zona.
fuera_de_zona         cuántos cayeron fuera de cobertura
fuera_por_ciudad      {ciudad: n} top 15 — de aquí sale qué geo corregir
zona_ambigua          homónimos sin estado
sin_ciudad            sin ningún dato de ciudad
por_asesor            [{rep, zone, leads}] de ESA ventana
```

Un corte viejo sin estos campos no rompe nada: el dashboard detecta que no hubo
validación (`asignables is None`) y se comporta como antes.

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

`meta.py autopause` corre en **dry-run por default**; pausa solo con `--go`.
Guardrail permanente: **nunca toca campañas cuyo nombre empiece con `KE`**.

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

- `main` — **7 / 14 / 28 días**. Mueve todo lo de la portada, el estado por zona,
  los anuncios, los adsets y el reparto por asesor.
- `ventas` — **30 / 60 / 90 días**, solo la tabla "qué anuncio trae ventas". El
  ciclo de venta ronda los 90 días: a 7 días esa columna sería siempre cero y
  parecería que ningún anuncio vende.

Si agregas un tercer switcher, dale su propio `data-g` o esconderá los paneles
de los otros.

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
- Corre `python dashboard.py --selftest` y `python zonas.py` antes de commitear.
