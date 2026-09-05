# Junta con David Giacoman — 5 de septiembre de 2026

Participantes: David Giacoman y Randall Cruz. Duración 30 minutos.
Transcripción: https://app.tactiq.io/api/2/u/m/r/QNeo7E4uQZqAqUoxLE9O

Extraído con dos barridos independientes (trece ángulos de búsqueda en total) sobre la
transcripción; cada renglón se verificó por separado contra su cita literal antes de entrar.

## De qué se trató

Randall le enseñó a David el tablero de ventas completo — vistas por zona y por vendedor, embudo por etapa, razones de descarte, actividad por asesor, cuadrante de perfiles y ventas reales desde la app de comisiones — más el proceso nuevo de levantamientos con calendario compartido y reporte post-visita con fotos. David, como vendedor de Torreón, empujó dos cosas propias: que se mida si el cierre salió de una visita o de puras llamadas y qué porcentaje de los levantamientos termina en venta, y que el reporte de la visita traiga la foto del punto de interconexión para no tener que volver al domicilio. La segunda mitad se fue a temas de negocio que el tablero no resuelve: la migración de HubSpot a Kommo quedándose solo con los leads que sí se van a cerrar, el esquema de comisiones simplificado que David mandó en Excel, y la estandarización de las formas de pago entre Torreón y Monterrey — todo eso se va a la junta con Guillermo y Samuel.

## Lo que quiere ver

| # | Qué | Vista | Esfuerzo | Estado |
|---|-----|-------|----------|--------|
| 1 | Cargar agosto al tablero y darle a David su acceso | ambos | chico | por hacer |
| 2 | Tasa de cierre del levantamiento: qué porcentaje de los levantamientos termina en venta | ambos | chico | por hacer |
| 3 | Foto del punto de interconexión como quinta pregunta del reporte post-visita | vendedor | chico | bloqueado |
| 4 | Ficha del prospecto con la información y las fotos del levantamiento en tiempo real | vendedor | medio | por hacer |
| 5 | Marcar cada cierre como «con visita» o «solo llamada» | ambos | medio | por hacer |
| 6 | Separar levantamientos de soporte técnico en el conteo | ambos | chico | por hacer |
| 7 | Corregir el conteo de cotizaciones: entregadas al asesor vs uso del cotizador digital | ambos | chico | por hacer |
| 8 | Gráficas que faltan: actividad diaria y semanal, llamadas contra visitas, probabilidad ponderada | ambos | medio | por hacer |
| 9 | Migración: cada vendedor marca solo los leads que sí va a cerrar y el resto se borra | vendedor | chico | por hacer |
| 10 | Esquema de comisiones simplificado que un vendedor nuevo entienda solo | ambos | medio | bloqueado |
| 11 | Estandarizar las formas de pago para que se llamen igual en Torreón y en Monterrey | ambos | grande | bloqueado |
| 12 | Un responsable de operaciones que lleve los KPI y revise los equipos de soporte por zona | ambos | grande | bloqueado |

### 1. Cargar agosto al tablero y darle a David su acceso

**Vista ambos · esfuerzo chico · por hacer**

Subir la información de agosto (hoy el tablero solo tiene lo poco de septiembre y varias vistas salen vacías) y mandarle a David el link con su acceso. Sin esto, nada de lo demás lo puede usar ni evaluar, y cualquier número que vea le va a parecer roto.

> Randall Cruz (seg. 1745): «acceso a la plataforma y te comparto el link Okay este nada más vamos a cargar la información de agosto, vale? Que esa no está todavía. Va este y te digo cuando ya esté.» — y al inicio (seg. 44): «la Data en tiempo real este mes pues aparece pero pues porque no ha habido registro, no?»

**Qué lo detiene:** Ninguno técnico: es correr la carga histórica y compartir el acceso. El único cuidado es que el mes pasado no existía el campo de levantamiento, así que agosto va a traer huecos en esa columna y hay que avisárselo a David para que no lea el cero como error del tablero.

### 2. Tasa de cierre del levantamiento: qué porcentaje de los levantamientos termina en venta

**Vista ambos · esfuerzo chico · por hacer**

Un mosaico que tome la cohorte de leads con levantamiento en el rango y muestre qué porcentaje llegó a ganado, con drill-down a la lista. Es el número con el que David defiende que ir a la casa del cliente sí produce venta, y con el que decide si le conviene el viaje o seguir por teléfono.

> David Giacoman (seg. 510): «Sí ándale. Sí y de los levantamientos programados, Qué porcentaje está cerrando para poder demostrar eso.» — Randall Cruz (seg. 520): «Sí, Exacto levantamientos esta relación con cierres».

**Qué lo detiene:** El código no bloquea: cada lead ya trae `levantamiento` (fecha, CF 1833425) junto a `cerrado` y `funnel === 5` en la misma fila, el ayudante `pct(a, b)` ya existe en metrics.ts y el mosaico gemelo «Conversión ventas / asignados» ya está armado en admin.tsx. Lo que sí estorba: (1) no hay historia — «se acaba de agregar, entonces pues va a aparecer cero», así que sale vacío unas semanas; (2) el denominador está sin decidir (solicitado vs agendado vs hecho); (3) es métrica solo de Kommo, HubSpot no tiene la etapa.

### 3. Foto del punto de interconexión como quinta pregunta del reporte post-visita

**Vista vendedor · esfuerzo chico · BLOQUEADO**

Agregar al reporte que llena quien hace el levantamiento una quinta foto: el punto de interconexión (centro de carga), además de medidas de losa, foto de dron, fachada y medidor. Con esa foto ya no hace falta volver al domicilio ni para cotizar la interconexión ni para instalar.

> Randall Cruz (seg. 799): «Yo nada más le puse Aquí cuatro preguntas medidas de la de la losa, foto del dron de la losa, foto de fachada y foto de medidor esas cuatro no sé si me haga falta otra». David Giacoman (seg. 826): «Foto Sí nada más fotos de de punto interconexión y ya». David Giacoman (seg. 833): «Y pones de punto [inter]conexión sí, porque ahí donde [va la] interconexión, por si más adelante se vende, no quieres ir a hacer otro levantamiento, por ejemplo en Monterrey ya [con esa] información pueden ir a instalar[, sin] otro levantamiento». David Giacoman (seg. 864): «Con esa información ya no hay necesidad de ir.»

**Qué lo detiene:** El campo cuesta casi nada, pero el formulario que lo contiene todavía no existe: el reporte post-visita sigue siendo la idea del 31-ago marcada como «no producir» hasta que Randall la apruebe con su jefe; lo que se enseñó en la junta es maqueta. Orden real: aprobar → construir el formulario con las cinco preguntas de una vez (molde ya existe: formulario de recibos CFE con subida a Drive, porque la cuadrilla no tiene usuario en Kommo) → colgar las fotos en el lead. Meter la quinta pregunta al construirlo es gratis; ponerla después como parche sí duele.

### 4. Ficha del prospecto con la información y las fotos del levantamiento en tiempo real

**Vista vendedor · esfuerzo medio · por hacer**

Que el vendedor abra un prospecto desde su vista y vea dirección, contacto, teléfono y las fotos y respuestas que cargó quien fue al levantamiento — sin pedirle nada a nadie. Hoy «Prospectos activos» es lista y buscador, no abre ficha con evidencia. Es el consumo de la foto del punto de interconexión: sin esta vista, la foto se queda guardada donde David no la ve.

> Randall Cruz (seg. 879): «Yo lo vería así, yo vendedor, vería que... aquí yo le pico y yo ya sé dónde es, con quién es, el lugar y el teléfono, la información en tiempo real de lo que Ángel ya cargó al sistema y aquí puedo ver las fotos o ver las respuestas de las preguntas.»

**Qué lo detiene:** Depende del formulario post-visita: mientras no haya fotos cargadas al lead no hay nada que mostrar. Además el tablero solo LEE de Kommo y HubSpot, así que las fotos tienen que llegar al lead por otra vía (Drive más nota o campo en Kommo) antes de que la ficha pueda pintarlas. Y tiene que verse bien en teléfono: David trabaja desde el celular.

### 5. Marcar cada cierre como «con visita» o «solo llamada»

**Vista ambos · esfuerzo medio · por hacer**

Partir las ventas cerradas en dos: las que llevaron levantamiento presencial y las que se cerraron a puras llamadas, visible tanto en el resumen como al abrir la lista. Le sirve a David para saber qué prospectos suyos ya traen visita hecha y cuáles siguen siendo puro teléfono.

> David Giacoman (seg. 267): «Si se hizo visita, o sea ver o se hizo vista para cierre o fue puro llamada, o sea, o sea ver si no». Randall Cruz justo antes (seg. 245): «aquí me faltaría agregar esa gráfica, no esa relación». David cierra en el seg. 282: «de la visita va perfecto.»

**Qué lo detiene:** Tres advertencias que hay que resolver al definirlo: (1) el campo se llama «Levantamiento solicitado», o sea que registra la visita PEDIDA, no la HECHA — si se cancela, el cierre se contaría como «con visita» sin serlo, y la señal limpia sería el formulario post-visita; (2) los leads de HubSpot no tienen ese campo, así que en un corte mixto todo cierre de HubSpot caería falsamente en «solo llamada» — hay que limitar la métrica a Kommo y decirlo en la tarjeta, igual que ya se hace con «primer contacto» e «intentos»; (3) las ventas reales de la app de comisiones se cruzan por nombre de vendedor y mes, no por lead, así que el corte solo puede salir sobre los ganados de Kommo, no sobre el monto en pesos.

### 6. Separar levantamientos de soporte técnico en el conteo

**Vista ambos · esfuerzo chico · por hacer**

Hoy el número de «levantamientos» viene mezclado con visitas de soporte técnico y atención al cliente. Hay que separarlos en el origen para que el conteo por asesor y el denominador de la tasa de cierre no salgan inflados.

> Randall Cruz (seg. 561): «evaluar, cuántos justo, cuántos levantamientos son, no, porque ahorita me los juntan, pero sí, o sea, ahí lo ando revisando con Alejandro el consultor, este, con Samuel para tener mejores datos, verdad?» — y sigue: «de soporte o de levantamientos, soporte técnico, de atención al...»

**Qué lo detiene:** No es del tablero, es del CRM: hay que decidir cómo se distingue una visita de levantamiento de una de soporte (etapa aparte, campo o etiqueta) y quién lo captura. Randall ya lo trae abierto con Alejandro y Samuel. Bloquea directamente la tasa de cierre del levantamiento — si se publica antes, el porcentaje sale bajo por denominador sucio y le va a dar la razón equivocada a quien diga que el levantamiento no sirve.

### 7. Corregir el conteo de cotizaciones: entregadas al asesor vs uso del cotizador digital

**Vista ambos · esfuerzo chico · por hacer**

Hoy el tablero cuenta como cotización el clic al botón del cotizador digital. Randall quiere que cuente las cotizaciones que de verdad se entregan al cliente, y que el uso del cotizador digital sea un indicador aparte. Importa para el vendedor porque de ese número cuelga su cotizado vigente contra las 10 veces la meta.

> Randall Cruz (seg. 452): «agregarle el tema de levantamientos, esté cotizado. Necesito corregirlo porque aparecen... son las cotizaciones que cuentan...» — y (seg. 470): «Más bien sería que cuente las cotizaciones, pues sí, que entregan ya directamente al asesor. Si fue fuera del... o sea, si utilizaron o no utilizaron el cotizador digital debería ser punto y aparte.» Cierra en el seg. 489: «al botón del cotizador digital... Pero sí, ya que cuenten cuando la mandan, no.»

**Qué lo detiene:** Falta la señal de «cotización enviada al cliente», distinta del clic al botón. Si esa señal no existe hoy en Kommo hay que crearla (campo o etapa) antes de partir el número en dos; mientras tanto el tablero solo puede renombrar lo que ya mide para que no se lea como algo que no es.

### 8. Gráficas que faltan: actividad diaria y semanal, llamadas contra visitas, probabilidad ponderada

**Vista ambos · esfuerzo medio · por hacer**

Randall reconoció en la junta que al bloque de actividad le faltan tres cosas: la gráfica de actividad por día y por semana, la relación entre llamadas y visitas, y la probabilidad ponderada del pipeline. Es lo que convierte el conteo de actividad en algo que se pueda leer de un vistazo.

> Randall Cruz (seg. 245): «abajo viene la actividad... yo puedo checar cuántas llamadas han hecho... Sí, de hecho aquí me faltaría agregar esa gráfica, no, esa relación». Y (seg. 561-602): «aquí en morado, aquí la semana, esta semana... del día, entonces aquí en morado pudiera, voy a poner otro circulito».

**Qué lo detiene:** La actividad diaria y semanal es directa con los datos que ya se cargan. La probabilidad ponderada no: requiere fijar un peso por etapa del embudo y eso es decisión de negocio, no de código — si se inventa el peso, el pronóstico miente. La relación llamadas contra visitas hereda el problema del conteo sucio de levantamientos (renglón anterior).

### 9. Migración: cada vendedor marca solo los leads que sí va a cerrar y el resto se borra

**Vista vendedor · esfuerzo chico · por hacer**

Antes de migrar de HubSpot a Kommo, que cada asesor palomee los leads vivos que de verdad puede cerrar (tope sugerido 80 a 100) y que lo demás no se arrastre. Así «Prospectos activos» nace limpio y las métricas del vendedor dejan de medirse contra un denominador de basura.

> David Giacoman (seg. 979): «no le pedimos... apunta los que sí... y ya te pasamos a Kommo con la nueva tecnología, las nuevas implementaciones, o sea, todo más padre, más ágil, y así nos vamos yendo». David Giacoman (seg. 1000-1019): «Borra eso, ya no sirve, o sea, ya es pura basura acumulada.» Randall antes (seg. 929): «lo mejor es quedarnos con máximo 100, 80 leads».

**Qué lo detiene:** Arrancable hoy en su versión mínima (una etiqueta «migra sí/no» en el CRM antes de cada ola), pero: (1) el tablero solo lee, no escribe, así que palomear DESDE «Prospectos activos» ya no sería chico; (2) los leads a depurar viven en HubSpot, que no liga tareas ni llamadas al lead, así que no hay señal automática de «vivo» y el corte queda 100% a criterio del vendedor; (3) el borrado es irreversible y no se definió criterio ni aprobador; (4) choca con el pipeline histórico que el tablero de dirección todavía necesita — mejor marcar «no migra» ahora y borrar después del corte histórico. La idea del recorte es de Randall; David la suscribe y es quien pide el borrado.

### 10. Esquema de comisiones simplificado que un vendedor nuevo entienda solo

**Vista ambos · esfuerzo medio · BLOQUEADO**

Matar las cinco hojas del esquema vigente y dejar uno corto: precio piso por panel, 3.5% base, medio punto arriba si vende 500 pesos sobre el piso y medio punto de castigo si vende 500 abajo, bonos por escalones, sin categoría VIP y sin «a consideración». David ya mandó su propuesta en Excel por WhatsApp.

> David Giacoman (seg. 1654): «A los nuevos ya no les explicamos las cinco hojitas.» — (seg. 1386): «el que está es son cinco hojas y ya está» — (seg. 1600): «se mete un vendedor nuevo, lo explicas todo... estandarizar los cuatro tipos de pago... y que esté todo regulado... o sea que no sea un policía cada [vez]» — (seg. 1206): «lo venden 500 pesos más caro el precio piso más [medio] por ciento; si lo venden abajo 500 pesos del precio piso se les castiga el punto cinco por ciento».

**Qué lo detiene:** El esquema no está aprobado: David mismo dice que eso lo deciden «Samuel, Guillermo y yo» (seg. 1426) y Randall lo manda a la junta con Guillermo del lunes. No se pueden cablear reglas que todavía no existen, y quedaron sin número el tope máximo de comisión y los escalones del bono. Técnicamente, para calcular comisión por venta el tablero necesita método de pago y precio por panel capturados por venta y con el mismo nombre en ventas y en cobranza; mientras eso no exista, el tablero solo puede mostrar el porcentaje configurado a mano, no la comisión real. Ojo: David NO pide sacar el Excel — su propuesta también es un Excel; pide pocas reglas parejas.

### 11. Estandarizar las formas de pago para que se llamen igual en Torreón y en Monterrey

**Vista ambos · esfuerzo grande · BLOQUEADO**

Un catálogo oficial de esquemas de pago con sus reglas escritas (qué descuento aplica en cuál, qué plazos existen) e idéntico en las dos zonas, para que no se caiga la comisión ni se atore cobranza porque el mismo plan se llamó distinto. Es petición de proceso, no un widget: el tablero solo la toca porque desglosa ventas por método de pago.

> David Giacoman (seg. 1702): «Mira, yo encantado de ayudar con eso, o sea, nada más pediría eso, no, que tratemos de que las mismas formas de pago se llamen igual aquí igual allá para que no haya temas en cobranza [...] estandarizar las cosas me encantan, nada más que todos estemos con el mismo canal para no andar con lo mismo de años atrás, de reglas aquí, reglas allá.» — y (seg. 1741): «Es que nunca nunca me han enseñado las de allá.»

**Qué lo detiene:** No lo bloquea el tablero, lo bloquea una decisión de negocio que no es de Randall: dirección tiene que fijar UN catálogo e imponerlo en las dos zonas. Hoy hay discrecionalidad explícita — Randall dice que «a veces damos libertad» en cambiar 18 por 15 meses — y David admite que nunca le mostraron las reglas de Monterrey, así que ni siquiera existe la lista contra la cual estandarizar. Además hay que tocar el cotizador, la app de comisiones y cobranza para que usen los mismos nombres. Antes de escribir el catálogo hay que confirmar con David cuáles son «los cuatro tipos de pago» — la enumeración del audio es ruido.

### 12. Un responsable de operaciones que lleve los KPI y revise los equipos de soporte por zona

**Vista ambos · esfuerzo grande · BLOQUEADO**

David pide que exista alguien que lidere operaciones: que verifique si los equipos de soporte están bien dimensionados en cada zona (si falta o sobra gente), si las métricas de zona se están cumpliendo, y que apague los fuegos del día a día. No es tablero, es estructura, pero sin ese rol nadie va a mantener vivo lo que el tablero mide.

> David Giacoman (seg. 680): «Va, sí, que lidere y cheque si los equipos de soporte están bien en todas las zonas y falta gente, si sobra, y si están llegando las métricas de zona». Randall Cruz antes (seg. 618): «hablaba con Guillermo que sí es importante tener como un gerente» y (seg. 693): «yo feliz de ayudar, pero tengo una limitante también de que cuánto puedo gestionar, no?»

**Qué lo detiene:** Es contratación y definición de rol, no construcción. Randall ya lo habló con Guillermo pero «no se ha puesto sobre la mesa porque justo ha habido otras prioridades del área comercial» (seg. 655). David dijo en la misma junta que va a quitar el tema de gobierno de la mesa de la junta de 15 días (seg. 716), así que ni siquiera está claro dónde se decide. Mientras no exista, Randall es el cuello de botella de KPI, procesos y tecnología a la vez, y él mismo lo reconoce.

## Reglas y números exactos que dictó (segundo barrido)

### Que el tablero de ventas marque cada venta contra el precio piso por panel: +5% de comisión si vende 500 pesos ARRIBA del piso, castigo de 0.5% si vende 500 pesos ABAJO del piso, con la misma regla para todo el esquema de ventas.

> David Giacoman (seg. 1206): «Así lo venden 500 pesos más caro el precio piso más un cinco por ciento si lo financiamiento exactamente una captura donde los precios de las diferentes venden abajo 500 pesos el precio piso se les castiga el el punto cinco por opciones, ese sería el precio piso para el tres punto cinco. ciento para todo para todo el esquema de ventas dejarlo por el mismo.» — Pregunta previa de Randall (seg. 1191): «Esto esto no lo entendí. Y cuál? Y cuál va a ser el precio piso?» — Respuesta de David (seg. 1226): «El que ya está en el cotizador que de cada esquema de pagos». — Ran

```
REGLA DICTADA POR DAVID (verbatim, seg. 1206):
- Venden 500 pesos ARRIBA del precio piso → «más un cinco por ciento».
- Venden 500 pesos ABAJO del precio piso → «se les castiga el punto cinco por ciento» (0.5%).
- «para todo el esquema de ventas dejarlo por el mismo» = misma regla para las 4 formas de pago, no una por esquema.
- Piso referido: «ese sería el precio piso para el tres punto cinco» (seg. 1236).
- Fuente del piso (seg. 1226): «El que ya está en el cotizador que de cada esquema de pagos» — el piso NO lo define el tablero, sale del cotizador, por esquema de pago.
- Unidad: PRECIO POR PANEL, no monto de contrato. Randall lo confirma en el mismo hilo: «aquí en precio por panel promedio ya te lo saca Entonces ya sabes si es el precio piso o no» (seg. 1559-1575) y antes «cantidad de paneles y el precio por panel más bien que el precio» (seg. 1442).

CONTEXTO DEL ESQUEMA COMPLETO (mismo bloque, seg. 1265-1302, David):
- Esquema anterior: «antes el esquema era de tres al cinco» (3% a 5%). → El «más un cinco por ciento» es casi seguro el TOPE del rango 3-5%, no un +5 puntos aditivos. AMBIGÜEDAD REAL: la transcripción no permite decidir entre «pasa a 5%» y «+5% sobre la comisión».
- Se ELIMINA el VIP: «hay un Bono porque vamos a eliminar el VIP».
- Bono por volumen mensual: «vendes arriba de 500 tanto... arriba de un millón quinientos un millón dos» y piso de bono «Vendes abajo de 300 nada».
- Se ELIMINA «a consideración» (seg. 1503): «quiero eliminar... todo el tema de consideración».
- Descuentos solo permitidos en: contado y financiamiento a 12 meses. «Descuentos nada más está permitido en plan contado... financiamientos de 12 meses se puede dar descuento y ya».
- 4 formas de pago a estandarizar (seg. 1600): «los cuatro tipos de pago con cada uno: contado, dos financiamiento, uno financia», «que esté todo regulado... que no sea un policía cada [venta]».

ADVERTENCIA DE TRANSCRIPCIÓN: el fragmento del seg. 1206 está INTERCALADO (dos hilos de habla mezclados en una sola línea). Las cifras 500 / cinco por ciento / punto cinco por ciento / tres punto cinco son inequívocas, pero el orden de las cláusulas está roto. Confirmar con David antes de codificar.
```

**Qué lo detiene:** Faltan TRES cosas, dos son datos que solo David puede dar:

1. TABLA DE PRECIOS PISO POR ESQUEMA (dato de David). Dijo «el que ya está en el cotizador... de cada esquema de pagos». Nadie dictó los números. Sin la tabla piso[esquema] = $/panel no hay nada que calcular. También falta qué es «el tres punto cinco» (¿3.5 años de financiamiento? ¿esquema 3.5?).

2. AMBIGÜEDAD DEL 5% (decisión de David). «más un cinco por ciento» contra «antes el esquema era de tres al cinco»: no se sabe si la comisión SUBE A 5% o si se SUMAN 5 puntos. Lo mismo con el castigo: 0.5% ¿restado a la comisión, o comisión × 0.995? Una llamada de dos minutos lo cierra.

3. EL DATO NO LLEGA AL TABLERO (técnico, Z:\KENET SOLAR\MARKETING\mkt-dashboard\ventas_comisiones.py línea 109). El SELECT a Supabase trae solo: id, vendor_id, shared_vendor_id, client_name, zone, sale_month, contract_amount, commissionable_amount, can

### Agregar al embudo un ponderador (factor de probabilidad) por etapa para proyectar cuánto se va a vender con el pipeline que ya está cargado. Randall lo propone y David lo aprueba en el momento, llamándolo el factor más importante.

> David Giacoman (seg. 234): «Sí ya hay probabilidad que hay agregarle, o sea, el factor más importante que es el tema, o sea que el que no está funcionando que es el o no.» [El transcript repite cada línea dos veces por artefacto de reconocimiento de voz; arriba va de-duplicada. La cita reportada es literal.] Contexto inmediato — Randall, seg. 185-229: «Mara ha descartado 24% de los leads que le he asignado, hay 22 leads asignados y justo de los 22, 15 no tienen presupuesto y siete sí tienen presupuesto, o sea sí tienen valor en el apartado. Y de lo que hablábamos con Alejandro del factor, del 

```
NO se dijo ningún porcentaje ni multiplicador numérico por etapa en toda la junta. Cinco búsquedas distintas (ponderador/factor, presupuesto del lead, porcentajes 30-50-70, multiplicador/proyección, probabilidad de cierre) convergen todas al MISMO y ÚNICO momento: segundos 185-273. David aprueba el concepto sin fijar cifras.

Los únicos números sobre la mesa son los de contexto que pone Randall un segundo antes (ejemplo Mara): 22 leads asignados, 24% descartados, 15 SIN presupuesto y 7 CON presupuesto (con valor capturado en el apartado). O sea: la base del cálculo es el campo Presupuesto del lead, y hoy solo 7 de 22 (32%) lo traen lleno.

Autoría del concepto: no es idea de David en frío — Randall lo introduce como «lo que hablábamos con Alejandro del factor, del multiplicador», es decir viene del consultor Alejandro. David solo lo ratifica y lo eleva a prioridad.

La cola de la frase de David («que no está funcionando... o no») viene cortada/ininteligible por el reconocimiento de voz; no se puede reconstruir qué era «el que no está funcionando».

Pedido adyacente en el MISMO turno (seg. 267), que NO es el ponderador y conviene no confundir: David quiere distinguir si el cierre se logró con visita/levantamiento o con pura llamada. Y en seg. 510 refuerza: «de los levantamientos programados, ¿qué porcentaje está cerrando, para poder demostrar eso?». Esos son ratios de conversión reales, no pesos asignados a dedo.

Estado del código (verificado):
- Z:\KENET SOLAR\MARKETING\mkt-dashboard\ventas_kommo.py:322 — el campo ya se extrae: "presupuesto": num(l.get("price")) del lead de Kommo.
- Z:\KENET SOLAR\MARKETING\mkt-dashboard\ventas_corte.py:183 función foto_pipeline() — YA agrega monto por etapa: por_et[etapa_id] = [conteo, monto_sumado], y lo mismo por asesor. Guarda foto diaria en ventas_hist.jsonl.
- grep de ponderad|probabilid|weight|factor_etapa en ventas_corte.py, ventas_kommo.py y ventas/src: CERO coincidencias. El ponderador no existe en ninguna parte.
```

**Qué lo detiene:** Falta que DAVID (o Alejandro) fije los porcentajes: un número de probabilidad de cierre por cada etapa del embudo Ventas. Sin esa tabla no hay nada que construir — el código es una línea, la decisión es el entregable. Es dato de negocio, no técnico, y David es quien lo decide.

Segundo bloqueo, más grave y que sale de los propios números de Randall en la junta: el ponderador multiplica el campo Presupuesto, y 15 de 22 leads (68%) NO lo traen capturado. Si se enciende hoy, la proyección va a salir subestimada ~2/3 porque dos tercios del pipeline valen $0 a ojos del cálculo. Antes o junto con el ponderador hay que forzar la captura de Presupuesto al cotizar (o derivarlo de la cotización, que sí existe).

Recomendación: en vez de pedirle porcentajes a dedo, calcularlos de la historia — ventas_hist.jsonl ya guarda foto diaria del pipeline por etapa desde hace días, y con eso se saca la tasa 

### Marcar por venta si el cierre se dio con visita (levantamiento) o fue puro teléfono, y meter esa variable de "visita" al tablero como insumo del ponderador de probabilidad de cierre por etapa; David además pide la tasa de cierre de los levantamientos programados.

> David Giacoman (seg 267): «Si se hizo visita, o sea ver o se hizo vista para cierre o fue puro llamada, o sea, o sea ver si no sí, sin saberlo Oye pues sí, sí, tú que agregar el tema» — y remata en seg 282: «de la visita va perfecto.» Antes, seg 234: «Sí ya hay probabilidad que hay agregarle, o sea, el factor más importante que es el tema, o sea que el que no está funcionando que es el o no.» Y seg 510: «Sí y de los levantamientos programados, Qué porcentaje está cerrando para poder demostrar eso.»

```
Variable binaria por venta cerrada: cierre CON visita/levantamiento vs. cierre SOLO por llamada. Va enganchada al ponderador de probabilidad por etapa que David pide en seg 234 ("ya hay probabilidad que hay agregarle"), justo después de que Randall menciona el multiplicador que discutió con Alejandro (seg 185-219: cotizado vs. proyección). Métrica derivada que David pide explícitamente en seg 510: de los levantamientos PROGRAMADOS, qué porcentaje cierra — para "poder demostrar eso" (que la visita sube el cierre). Randall reconoce el hueco en seg 245-267: «aquí me faltaría agregar esa gráfica, no esa relación», y en seg 520 la nombra: «levantamientos esta relación con cierres». Contexto numérico del cuadrante actividad-vs-venta (seg 374-406): un asesor con 252 de venta y 203 llamadas hechas, y 0 en levantamientos solicitados. Randall aclara el porqué del cero en seg 406: «el mes pasado no teníamos la opción del levantamiento Ahorita se acaba de agregar entonces, pues va a aparecer cero». En el mismo tramo (seg 489-509) discuten que el conteo de cotizaciones se dispare desde el botón del cotizador digital, «que cuenten cuando la mandan».
```

**Qué lo detiene:** Dos cosas. (1) Falta definir la FUENTE del dato "hubo visita": hoy el tablero cuenta levantamientos SOLICITADOS por asesor, no levantamientos REALIZADOS ni si la venta se cerró después de esa visita — hay que decidir si la marca sale de la etapa/CF de levantamiento en Kommo, de la agenda de levantamientos, o de un form post-visita (ese form es la idea que sigue sin aprobar). (2) No hay histórico: la opción de levantamiento se acaba de agregar, el mes pasado sale en cero, así que no hay muestra para calibrar la probabilidad por etapa hasta acumular ~1-2 meses de ventas marcadas. Sin (1) resuelto no se puede construir; sin (2) el ponderador saldría inventado.

### Agregar al tablero la tasa de cierre de los levantamientos: de los levantamientos programados/agendados, qué porcentaje termina en venta, para poder demostrar con datos el peso de la visita presencial frente al lead trabajado solo por llamada.

> David Giacoman (seg 510-518): «Sí ándale. Sí y de los levantamientos programados, Qué porcentaje está cerrando para poder demostrar eso.» — Antecedente de «eso», mismo David (seg 267-273): «Si se hizo visita, o sea ver o se hizo vista para cierre o fue puro llamada, o sea, o sea ver si no sí, sin saberlo Oye pues sí, sí, tú que agregar el tema»; y cierra en seg 282: «de la visita va perfecto.» — Randall Cruz (seg 520): «Sí, Exacto levantamientos esta relación con cierres.»

```
MÉTRICA PEDIDA: un porcentaje, numerador = cierres/ventas, denominador = levantamientos programados. David no fijó número objetivo, ni benchmark, ni ventana de tiempo, ni umbral de alarma. Tampoco dijo si el denominador es levantamiento AGENDADO o levantamiento REALIZADO — dice «programados», que literalmente apunta al agendado.

PROPÓSITO EXPLÍCITO: «para poder demostrar eso». El antecedente está 4 minutos antes, seg 234-282, donde David venía de pedir el ponderador de probabilidad («Sí ya hay probabilidad que hay agregarle, o sea, el factor más importante...») y aterriza en segmentar el cierre por «si se hizo visita... o fue puro llamada», y aprueba: «agregar el tema de la visita va perfecto». OJO: David NUNCA dice literalmente «la visita cierra más» — pide el dato para poder demostrarlo, no lo afirma como hecho ya sabido. Es una hipótesis a validar, no una conclusión.

LO QUE CONTESTÓ RANDALL (seg 520): «Sí, Exacto levantamientos esta relación con cierres» — aceptado sin objeción.

DATO SUCIO ADMITIDO (seg 561-602, Randall): «cuántos levantamientos son. No porque ahorita me los juntan... Ahí lo ando revisando con Alejandro El consultor este con Samuel para tener mejores datos». En el mismo tramo aparece «Ah de soporte o de levantamientos soporte técnico de atención al» — o sea, el conteo actual mezcla levantamiento de venta con visitas de soporte técnico / atención. Ese es el bug del denominador.

BLOQUEO DURO DE HISTORIAL (seg 374-445, Randall, hablando de un asesor): «...tiene 203, no de levantamientos solicitados. Pues bueno el mes pasado no teníamos la opción del levantamiento, Ahorita se acaba de agregar entonces, pues va a aparecer cero, pero vaya lo que te quiero decir es que enlazando los datos ya podemos hacer evaluación». El campo de levantamiento se acaba de crear: el mes pasado sale 0. No hay serie histórica para calcular una tasa creíble hoy.

LO QUE YA EXISTE COMO INSUMO: en la ficha por asesor ya se ven los conteos brutos (seg 520-546): «puedo ver el perfil completo ya del asesor... Cuántas cotizas, cuántas cotizaciones y levantamientos ha hecho». Falta el cociente contra ventas, no el conteo.

NÚMEROS SUELTOS DEL MISMO TRAMO (contexto, no son 
```

**Qué lo detiene:** Tres cosas, en orden. (1) DEFINICIÓN, y es de David/Alejandro, no de Randall: el denominador son levantamientos AGENDADOS o REALIZADOS. David dijo «programados», que apunta al agendado, pero eso mete al numerador los que se agendan y nunca se hacen. Hay que escogerlo antes de programar nada. (2) DATO SUCIO: hoy el conteo «los juntan» — mezcla levantamientos de venta con visitas de soporte técnico/atención (Randall, seg 561-602). Sin separar esos dos tipos el porcentaje sale mal y Randall ya lo está revisando con Alejandro y con Samuel. (3) NO HAY HISTORIAL: el campo de levantamiento se acaba de agregar, el mes pasado devuelve 0 (seg 401-445). Aunque se programe el widget hoy, no hay muestra suficiente para «demostrar» nada — se necesitan varias semanas de levantamientos ya limpios antes de que el número sea defendible frente al equipo. Falta además que David defina si quiere ver el porce

### Ponderador de probabilidad por etapa (multiplicador) para calcular cuánto debe tener cotizado el equipo y proyectar si llega a la meta. Nace del trabajo con Alejandro (consultor) y David lo respalda en la junta como «el factor más importante que hay que agregarle».

> Randall Cruz (seg 185-229, frase continua): «...Y de lo que hablábamos con Alejandro del factor de del multiplicador, no, cuánto debería tener cotizado el equipo para saber para proyectar si va a... Así mira aquí abajo, viene justo aquí abajo. qué se encuentra en las etapas? O sea, cuánto Cuántos leads se qué etapa...» David Giacoman (seg 234-244, respuesta inmediata): «Sí ya hay probabilidad que hay agregarle, o sea, el factor más importante que es el tema, o sea que el que no está funcionando que es el... o no.»

```
CITA CONFIRMADA, con una corrección de encuadre importante: el resumen lo pinta como pendiente unilateral de Randall. La transcripción muestra que David CONTESTA y lo aprueba — «Sí ya hay probabilidad que hay agregarle, o sea, el factor más importante» (seg 234). Es instrucción de directivo, no idea suelta del que construye el tablero.

ORIGEN: Alejandro, el consultor. Randall lo confirma como persona real y activa en seg 561-602: «Ahí lo ando revisando con Alejandro El consultor este con Samuel para tener mejor mejores datos» — ahí el tema es limpiar el conteo de levantamientos, no el ponderador. Son dos hilos distintos con el mismo consultor.

CONTEXTO EXACTO DEL MOMENTO: Randall no está en el embudo cuando lo dice; está en la FICHA INDIVIDUAL de una vendedora (Mara) — «Mara ha descartado 24% de los leads que le he asignado hay 22 leads asignados y justo de los 22 15 no tienen presupuesto y siete sí tienen presupuesto» (seg 185-214). De ahí salta al multiplicador y señala hacia abajo, al bloque de etapas, como el lugar donde iría. Números rescatados de esa pantalla: 24% descarte, 22 leads asignados, 15 sin presupuesto, 7 con presupuesto.

FÓRMULA: NO se dictó ninguna. Ni un solo porcentaje por etapa aparece en toda la junta — verificado con tres búsquedas distintas (multiplicador/factor, ponderador/probabilidad, pipeline ponderado/valor esperado/peso por etapa). Cero resultados con cifras. La única mención de porcentaje cerca del tema es de David sobre otra cosa: «de los levantamientos programados, Qué porcentaje está cerrando para poder demostrar eso» (seg 510) — eso es tasa de cierre observada, insumo posible para calibrar el ponderador, no el ponderador mismo. El «porcentaje que tú quieras» de seg 1575 es del cotizador (precio piso), no del embudo.

LO QUE HOY TIENE EL TABLERO Y SIRVE DE BASE: embudo por etapa con conteo de leads y razones de descarte, cotizado vigente contra 10x la meta con 90 días de vigencia, metas en pesos ($800k/mes por vendedor), ficha por vendedor con presupuesto sí/no. Todo el dato crudo ya está: leads por etapa + monto por lead. Lo que falta es el peso.

QUÉ FALTA TÉCNICAMENTE: un diccionario {etapa_id: probabilidad} y una suma pon
```

**Qué lo detiene:** Faltan los porcentajes de probabilidad por etapa — nadie los dictó en la junta. Dos salidas: (a) que David o Alejandro los fijen a mano, o (b) calcularlos del histórico de Kommo (ganados / total que pasó por cada etapa) y presentarlos para aprobación. La opción (b) no requiere pedir nada a nadie y además contesta la pregunta que David sí hizo en seg 510 (qué porcentaje de levantamientos programados cierra). Riesgo conocido: el dato de levantamientos está sucio — Randall mismo dice que los juntan mal y lo anda corrigiendo con Alejandro y Samuel — así que la probabilidad de la etapa de levantamiento saldría mal hasta que se limpie ese conteo.

### Agregar al tablero de ventas la tasa de cierre del levantamiento: de los levantamientos programados/agendados, qué porcentaje termina en cierre — para probar con datos que el levantamiento (y la cotización del cotizador digital) sí mueven la venta.

> David Giacoman (seg 510-518): "Sí ándale. Sí y de los levantamientos programados, Qué porcentaje está cerrando para poder demostrar eso." Randall responde en el acto (seg 520): "Sí, Exacto levantamientos esta relación con cierres." (El transcript duplica frases por el reconocimiento de voz; el texto crudo es "Sí ándale. Sí ándale. Sí y de los levantamientos programados, Qué porcentaje está cerrando para Sí y de los levantamientos programados, Qué porcentaje está cerrando para poder demostrar eso. poder demostrar eso.") https://app.tactiq.io/api/2/u/m/r/QNeo7E4uQZqAqUoxLE9O?o=mcp&t=510

```
DENOMINADOR = levantamientos programados/agendados. NUMERADOR = los que cierran. La petición se confirma literal, incluyendo el encadenamiento con cotizaciones y el propósito "para poder demostrar eso".

LO QUE YA HAY EN EL CÓDIGO (Z:\KENET SOLAR\MARKETING\mkt-dashboard):
- ventas_kommo.py:39 — FIELD_LEVANTAMIENTO = 1833425, date_time "Levantamiento solicitado". Se lee por lead y se emite como evento tipo 'levantamiento'.
- ventas_kommo.py:38 — FIELD_COTIZACION = 1833423 "Cotización entregada".
- types.ts:22 — cada Lead ya trae `levantamiento` y `cerrado` como epoch en segundos, más `funnel` 0-5.
- ventas_corte.py:49-50 — embudo canónico de 6 etapas: índice 3 = "Levantamiento agendado", 4 = "Levantamiento hecho", 5 = "Contrato solicitado".
- metrics.ts:67 — helper `pct(a,b)` ya existe.
- metrics.ts:101 — `vivo(l) = funnel !== 0 && funnel !== 5`.
- admin.tsx:157 — tile 't-levantamientos' "Levantamientos solicitados" (CONTEO, con drill-down).
- admin.tsx:415/451 — columna ordenable "Levantamientos" en la tabla de vendedores; asesor.tsx:53 lo repite en la ficha.

LO QUE NO HAY: la RAZÓN. Hoy solo se cuenta cuántos levantamientos se solicitaron; en ningún lado se divide contra cierres. Ojo: el brief que me pasaron dice que el tablero "NO tiene levantamientos" — eso es incorrecto, los conteos sí están; lo que falta es el porcentaje.

CAMINO MÍNIMO (una función + un tile, reusando lo que ya existe):
denominador = leads del rango con `l.levantamiento > 0`; numerador = de esos, los que `funnel === 5` (o los cruzados con VentaReal de la app de comisiones); resultado por `pct()`. Se pinta como tile nuevo al lado de 't-levantamientos' en admin.tsx y como columna en la tabla por asesor. Toca 2 archivos: ventas/src/metrics.ts y ventas/src/admin.tsx. Sin dependencias nuevas, sin cambios al ingestor ni a Kommo.

LÍMITES DUROS DEL DATO (documentados en el propio código):
- ventas_hubspot.py:18-20 — "cotización / levantamiento = deal que HOY está en «Propuesta entregada» / «Levantamiento hecho»... Los que ya avanzaron no se pueden fechar (el portal no tiene hs_date_entered_*)". O sea: en HubSpot el levantamiento es foto de la etapa actual, no historia. Todo lead que ya pasó a Co
```

**Qué lo detiene:** Faltan tres definiciones de negocio (las decide David/Randall, no el código):

1. QUÉ ES "PROGRAMADO". David dijo "programados", pero el campo de Kommo se llama literalmente "Levantamiento solicitado" (CF 1833425) y el embudo tiene una etapa aparte "Levantamiento agendado" (índice 3). ¿El denominador es la fecha del CF (solicitado por el asesor) o el paso por la etapa 3 (ya agendado en calendario)? Hoy solo el CF vive como timestamp por lead; el paso por etapa no se historiza, solo se ve la etapa actual. Si la respuesta es "agendado de verdad", hay que historizar el cambio de etapa y el esfuerzo sube a medio.

2. QUÉ ES "CERRANDO". ¿funnel 5 = "Contrato solicitado", o la venta real de la app de comisiones? El tablero ya muestra los dos números y no son el mismo.

3. VENTANA DE MADURACIÓN. Un levantamiento agendado esta semana todavía no tuvo tiempo de cerrar. Sin un rezago definido (ej. 

### En la actividad por vendedor, distinguir si hubo VISITA presencial para cierre o si fue puro teléfono. Hoy el tablero cuenta actividad como un solo bulto (llamadas) y no permite saber cuál venta se cerró yendo y cuál se cerró por telefono.

> David Giacoman (seg 267): "Si se hizo visita, o sea ver o se hizo vista para cierre o fue puro llamada, o sea, o sea ver si no sí, sin saberlo Oye pues sí, sí, tú que agregar el tema". Inmediatamente antes, Randall Cruz (seg 245, mostrando el bloque de etapas + actividad): "abajo viene la actividad que lo que me preguntabas aquí, yo puedo de levantamientos checar, cuántas llamadas han hecho aquí? (...) Sí de hecho aquí me faltaría agregar esa gráfica, no esa relación". David cierra en seg 282: "de la visita va perfecto."

```
La cita dice EXACTAMENTE lo que la peticion afirma, con transcripcion sucia ("vista"="visita", "puro llamada"="pura llamada") pero sin ambiguedad, y Randall admite el hueco en la linea previa, no en la misma. Contexto: viene enganchada al reclamo anterior de David sobre el ponderador de probabilidad (seg 234: "Sí ya hay probabilidad que hay agregarle, o sea, el factor más importante"), o sea David esta pidiendo dos ejes de calidad sobre el mismo bloque: probabilidad por etapa + tipo de actividad.

Estado real del dato hoy, en palabras de Randall:
- seg 520: "aquí actividad es justo llamadas, no Cuántas llamadas hizo" — la metrica de actividad del tablero ES llamadas, punto.
- seg 561: "cuántos levantamientos son No porque ahorita me los juntan (...) Ahí lo ando revisando con Alejandro El consultor este con Samuel para tener mejores datos" — llamadas y levantamientos vienen REVUELTOS en la misma cuenta; ya hay un frente abierto con Alejandro (consultor) y Samuel para desagregarlo.
- seg 406: "el mes pasado no teníamos la opción del levantamiento Ahorita se acaba de agregar entonces, pues va a aparecer cero" — el campo de levantamiento es nuevo: NO hay historico, los meses previos salen en 0.

Numeros literales citados en el ejemplo en vivo (seg 374-406, un asesor): 252 (cotizaciones) y 203 llamadas hechas, 0 levantamientos solicitados. Ese es el sintoma exacto del hueco: 203 toques y cero visibilidad de cuantos fueron presenciales.

Peticion hermana de David en el mismo bloque (seg 510): "de los levantamientos programados, Qué porcentaje está cerrando para poder demostrar eso" — no solo quiere separar visita vs telefono, quiere la TASA DE CIERRE POR LEVANTAMIENTO. Randall confirma (seg 520): "Exacto levantamientos esta relación con cierres".

Fuente del dato ya existe fuera del tablero: hay agenda/calendario compartido de levantamientos (seg 742: dia, hora, direccion, municipio, link de Google Maps, numero de paneles, nota) y un formulario post-visita que llena el tecnico (Angel) con 4 preguntas (seg 799): medidas de la losa, foto de dron de la losa, foto de fachada, foto de medidor. David sobre ese form (seg 833/864): "Con esa información ya no hay necesidad de 
```

**Qué lo detiene:** Definir la REGLA de que cuenta como visita, y es una decision de negocio que solo David/Randall pueden tomar, no un tema tecnico. Dos huecos: (1) el levantamiento lo ejecuta el equipo tecnico (Angel), no el vendedor — hay que decidir si "visita para cierre" del vendedor es un evento distinto del levantamiento tecnico, o si el levantamiento cuenta como la visita; David dice literal "visita para cierre", lo que sugiere que quiere el evento del VENDEDOR, y hoy en Kommo lo unico que se registra es el levantamiento. (2) Que estado del levantamiento cuenta: solicitado, programado o realizado con evidencia (el form de 4 fotos). David ya pidio la tasa de cierre sobre "levantamientos programados", asi que ahi hay un candidato de definicion. Bloqueo secundario, no resoluble: no hay historico — el campo de levantamiento se acaba de agregar y los meses previos salen 0, asi que la comparativa contra 

### Randall reconoce que al tablero le falta la gráfica de relación levantamientos contra cierres y se compromete a agregarla

> seg 245, Randall Cruz: "Así mira aquí abajo, viene justo aquí abajo. qué se encuentra en las etapas? O sea, cuánto Cuántos leads se qué etapa y abajo viene la actividad que lo que me preguntabas aquí, yo puedo de levantamientos checar, cuántas llamadas han hecho aquí? ... Sí de hecho aquí me faltaría agregar esa gráfica, no esa relación yo la todos los haces." CORROBORACIÓN (aquí sí se nombra explícito levantamientos↔cierres, seg 510-520): David Giacoman (510): "Sí y de los levantamientos programados, Qué porcentaje está cerrando para poder demostrar eso." Randall Cruz (520): "Sí, Exacto levan

```
CORRECCIÓN AL DETALLE REPORTADO: el reporte dice que en el seg 245 la "relación" = levantamientos vs cierres. En el seg 245 eso NO está dicho; es lectura sobre-precisa. Secuencia real:

- 219 Randall: "cuánto debería tener cotizado el equipo para saber para proyectar si va a..."
- 234 David: "Sí ya hay probabilidad que hay agregarle, o sea, el factor más importante" → David pide PONDERADOR DE PROBABILIDAD por etapa (tema distinto, el tablero no lo tiene).
- 245 Randall: enseña la vista de etapas + actividad debajo del embudo, y ahí suelta "me faltaría agregar esa gráfica, no esa relación". La frase queda truncada/garbled ("yo la todos los haces"); en ese punto "esa relación" es actividad→venta (qué actividades empujan la venta).
- 267 David: "Si se hizo visita, o sea ver o se hizo vista para cierre o fue puro llamada" → CONFIRMADO que David pide distinguir visita vs llamada inmediatamente después. Esa parte del detalle reportado es correcta.
- El framing explícito levantamientos↔cierres llega 265 segundos DESPUÉS, en 510-520, no en 245.

Conclusión: el reconocimiento + compromiso son reales; el ancla temporal del concepto "levantamientos vs cierres" es 510-520, no 245.

NÚMEROS EXACTOS (seg 374-440, Randall mostrando un asesor en el cuadrante):
- 252 = cotizado/venta del asesor
- 203 = llamadas hechas
- 0 = levantamientos solicitados. Textual: "de levantamientos solicitados Pues bueno el mes pasado no teníamos la opción del levantamiento Ahorita se acaba de agregar entonces, pues va a aparecer cero"

REGLA DE NEGOCIO que David quiere demostrar (510): % de cierre sobre levantamientos PROGRAMADOS (no sobre leads). El propósito declarado es "poder demostrar eso" — justificar la visita/levantamiento como actividad que sí cierra, contra pura llamada.

DEUDA DE DATOS que Randall admite (seg 452-482 y 561-602):
- 452: "agregarle el tema de levantamientos esté cotizado. Necesito corregirlo porque aparecen son las cotizaciones que cuentan"
- 470-482: las cotizaciones no distinguen si salieron del cotizador digital o se entregaron directo por el asesor. Randall: "si utilizaron o no utilizaron el cotizador digital Debería ser punto y aparte"
- 561: "cuántos levantamientos 
```

**Qué lo detiene:** Dos bloqueos, ninguno de código:

1. NO HAY HISTÓRICO. La opción de levantamiento se acaba de agregar en Kommo (CF 1833639, agenda de levantamientos cerrada E2E el 21-ago). Textual de Randall: "el mes pasado no teníamos la opción del levantamiento Ahorita se acaba de agregar entonces, pues va a aparecer cero". La gráfica se puede construir hoy pero sale en cero o casi. Decisión que falta: si se publica igual y se llena sola con las semanas, o si se espera ~1 mes de datos.

2. LEVANTAMIENTOS Y COTIZACIONES VIENEN JUNTOS. "ahorita me los juntan". Falta separar el evento levantamiento del evento cotización, y dentro de cotización separar cotizador digital vs cotización entregada a mano ("debería ser punto y aparte"). Randall ya lo trae con Alejandro (consultor) y Samuel; los datos los tiene Javier.

DATO QUE FALTA DEFINIR (nadie lo dijo en la junta): el denominador exacto. David dice "levan

### En la ficha/perfil completo del asesor deben contarse cuántas cotizaciones y cuántos levantamientos hizo, filtrables por el periodo que se elija — más la tasa de cierre sobre levantamientos programados.

> Randall Cruz (seg. 520): "Si yo le doy clic Sí aquí actividad es justo llamadas, no Cuántas llamadas hizo ese Círculo aparece como un resumen rápido y puedo ver el perfil completo ya del asesor, Azul Cuántas cotizas, cuántas cotizaciones y levantamientos ha hecho es el" / (seg. 546) "no? O sea, cuánto según el tiempo que yo elija Pues justo sus números más a morado?" La PETICIÓN real es de David, seg. 510: "Sí y de los levantamientos programados, Qué porcentaje está cerrando para poder demostrar eso." David ratifica alcance, seg. 554: "Ah, no sí, O sea ya nada más hace falta filtrar y agregar 

```
OJO CON LA ATRIBUCIÓN: la cita del segundo 520 es Randall DEMOSTRANDO la pantalla, no David pidiendo. El drill-down descrito sí es real y ya existe: cuadrante/círculo de actividad -> clic en el asesor -> resumen rápido -> perfil completo, con filtro de periodo ("según el tiempo que yo elija"). Lo que NO está resuelto son los dos contadores.

REGLAS EXACTAS RESCATADAS:

1) Cotizaciones — el conteo de hoy está MAL, Randall lo dice explícito ("Necesito corregirlo"). Dos reglas nuevas:
   a. La cotización cuenta cuando SE MANDA al cliente, no cuando se genera: "que cuenten cuando la mandan".
   b. Se parte en DOS métricas separadas, no una sola: cotizaciones hechas CON el cotizador digital vs. cotizaciones entregadas directo por el asesor FUERA del cotizador. Textual: "si utilizaron o no utilizaron el cotizador digital Debería ser punto y aparte". Hoy el tablero las junta en un solo número (el widget "cotizado vigente vs 10x meta" mezcla ambas).

2) Levantamientos — NO existen como métrica limpia. La fuente los tiene revueltos con otra categoría: Randall dice "ahorita me los juntan" y luego nombra la mezcla: "de soporte o de levantamientos soporte técnico de atención al [cliente]". O sea, en el CRM la actividad/tarea de levantamiento no está distinguida de las visitas de soporte técnico y atención a cliente. Sin separar eso en el origen, el contador del perfil sale inflado.

3) Métrica que realmente pidió el directivo (no está en el resumen): TASA DE CIERRE SOBRE LEVANTAMIENTOS PROGRAMADOS = % de levantamientos agendados que terminan en venta. El propósito que David declara es probatorio: "para poder demostrar eso" — viene enganchado a la discusión de comisiones/desempeño, es la evidencia con la que se juzga al vendedor. Randall lo confirma: "levantamientos esta relación con cierres".

4) Randall ya trae el problema de datos en curso con dos personas: "Ahí lo ando revisando con Alejandro El consultor este con Samuel para tener mejor mejores datos". David asume el lado de la fuente: "Sí si tienen esos datos que que le dije a este Javier pues que le pregunto a Javier".

NO se habló de: ponderador de probabilidad por etapa, ni de calendario/formulario de visita como pa
```

**Qué lo detiene:** Falta la DEFINICIÓN DE DATOS de levantamiento en el CRM: hoy los levantamientos vienen mezclados con soporte técnico y atención a cliente ("ahorita me los juntan"), así que no hay campo ni tipo de tarea que los distinga. Hasta que no se separen en el origen, el contador y la tasa de cierre salen inflados. Dueños ya nombrados en la junta: David le pregunta a Javier si existen esos datos; Randall lo está revisando con Alejandro (consultor) y Samuel. Segundo bloqueo, menor y resoluble sin nadie: marcar en el cotizador el evento "cotización enviada" y una bandera de origen (cotizador digital sí/no) para poder partir el número en dos. Sin decisión de David pendiente — el alcance ya quedó ratificado por él en el segundo 554.

### Separar los levantamientos del resto de la actividad en la vista de Actividad de la ficha del asesor: agregar un círculo/burbuja propia para levantamientos (hoy van pegados con cotizaciones), y de fondo poder distinguir el tipo de actividad (levantamiento vs soporte técnico vs atención al cliente) que hoy el CRM entrega revueltas.

> Randall Cruz (seg. 561): "evaluar, Cuántos justo, cuántos levantamientos son No porque ahorita me los juntan, pero pero sí, O sea Ahí lo ando revisando con Alejandro El consultor este con Samuel para tener mejor mejores datos, verdad? cosas, no aquí en morado aquí la semana esta semana. este Del día entonces aquí en morado pudiera voy a poner otro circulito para (...) Ah de soporte o de levantamientos soporte técnico de atención al este" CONTEXTO INMEDIATO (el orden real es al revés de lo reportado): - David Giacoman (seg. 554-559), ANTES de la cita: "Ah, no sí, O sea ya nada más hace falta fi

```
CORRECCIÓN AL DETALLE REPORTADO: la frase "ya nada más hace falta filtrar y agregar un uno que otro indicador" NO es respuesta de Randall a David. La dice DAVID GIACOMAN en el segundo 554, ANTES de la cita de Randall (561). Es David quien cierra el tema diciendo que ya solo falta filtrar y agregar indicadores; Randall responde explicando por qué todavía no puede.

TAMBIÉN CORRIJO EL BRIEF: el tablero SÍ tiene levantamientos hoy (el brief dice que no). Existen en 4 lugares.

DÓNDE VIVE HOY (repo Z:\KENET SOLAR\MARKETING\mkt-dashboard):

1) FUENTE — Z:\KENET SOLAR\MARKETING\mkt-dashboard\ventas_kommo.py
   - Línea 39: FIELD_LEVANTAMIENTO = 1833425, date_time "Levantamiento solicitado".
   - Línea 302: ts_lev = fecha_cf(cfv.get(FIELD_LEVANTAMIENTO)); línea 361: ev_row(e["ts"], "levantamiento", e["lead"]).
   - O sea: el levantamiento YA llega como evento tipeado propio.
   - HubSpot: ventas_hubspot.py línea 181 emite el mismo evento "levantamiento" desde la etapa «Levantamiento hecho».

2) CONTEO — ventas\src\metrics.ts línea 276-285: la interfaz Actividad ya trae el campo `levantamientos` separado de `cotizaciones`, `llamadas`, `tareas`, `descartes`.

3) YA SE MUESTRA SEPARADO EN:
   - Tile "Levantamientos solicitados" (admin.tsx línea 157-159) con drill-down propio.
   - Columna ordenable "Levantamientos" en la tabla de vendedores (admin.tsx líneas 415 y 451).
   - Tarjeta "Levantamientos" del día en la vista del asesor (asesor.tsx línea 53).

4) DONDE SÍ SE JUNTAN — ES UNA SOLA LÍNEA. Archivo:
   Z:\KENET SOLAR\MARKETING\mkt-dashboard\ventas\src\admin.tsx, línea 549, dentro de la función `burbujas` del widget "Actividad" (el bloque morado que Randall señala en pantalla):

   { n: ev.filter((e) => e.tipo === 'cotizacion' || e.tipo === 'levantamiento').length, cls: 'e', title: 'Cotizaciones y levantamientos' }

   Son solo 3 burbujas por columna: Llamadas / Tareas completadas / Cotizaciones·levantamientos. La leyenda que lo repite está en la línea 609: "Cotizaciones · levantamientos".
   ESA es literalmente la burbuja que Randall quiere partir en dos con "voy a poner otro circulito".

5) EL PROBLEMA DE FONDO (la segunda mitad de la cita: "de soporte o de levantami
```

**Qué lo detiene:** Parte A (el círculo) NO está bloqueada: se puede hacer hoy, es partir la línea 549 y la leyenda 609 de admin.tsx. Solo falta que Randall confirme el color de la cuarta burbuja y que el orden de la leyenda no rompa el contraste en la vista por semana.

Parte B (levantamiento vs soporte técnico vs atención al cliente) SÍ está bloqueada, y el bloqueo NO es de código: falta la decisión de tipificación en Kommo. Concretamente faltan tres cosas: (1) el catálogo cerrado de tipos de tarea que Alejandro y Samuel están definiendo — qué es levantamiento, qué es soporte técnico, qué es atención al cliente; (2) que el equipo capture ese tipo al cerrar cada tarea, porque hoy las tareas completadas llegan sin tipo usable; (3) la regla de negocio de David: si "levantamiento" cuenta como actividad de venta del asesor o como trabajo del equipo de levantamientos (en la misma junta, seg. 742-892, Randall pr

### Veredicto de David sobre el tablero: ya está armado, solo falta filtrar y agregar un par de indicadores (no rehacer). Los indicadores que él nombra alrededor son: % de levantamientos programados que cierran, y separar levantamientos de la demás actividad.

> David Giacoman (seg 554): "Ah, no sí, O sea ya nada más hace falta filtrar y agregar un uno que otro indicador pues." (la transcripción duplica la línea por solape de captions; el texto es ese). Antecedente inmediato, David (seg 510): "Sí y de los levantamientos programados, ¿Qué porcentaje está cerrando para poder demostrar eso?" Réplica inmediata, Randall (seg 561): "evaluar, cuántos justo, cuántos levantamientos son... porque ahorita me los juntan... Ahí lo ando revisando con Alejandro El consultor este con Samuel para tener mejores datos". Antes, David (seg 234): "Sí ya hay probabilidad qu

```
Es un veredicto de alcance, no una petición nueva: David cierra la revisión del tablero diciendo que ya está y que el pendiente es filtros + un par de indicadores. No hay números duros en este tramo — no dijo metas, umbrales ni porcentajes. Las reglas/indicadores concretos que quedan implicados son cuatro, todos dichos por David en los 6 minutos previos: (1) seg 510 — % de levantamientos programados que cierran, y lo pide explícitamente "para poder demostrar eso", o sea como argumento de que la visita sí sirve; (2) seg 267 — distinguir si el cierre fue con visita o fue pura llamada; (3) seg 234 — agregar la probabilidad como "el factor más importante" (ponderador por etapa); (4) seg 561, de Randall — hoy los levantamientos vienen revueltos con la demás actividad ("ahorita me los juntan"), que es la razón técnica de por qué (1) y (2) todavía no se pueden calcular. Lo que David acababa de ver cuando dijo la frase era la ficha por asesor con actividad (llamadas), cotizaciones y levantamientos, filtrable por periodo ("según el tiempo que yo elija"). Inmediatamente después, seg 602, David cambia de tema a contratación de equipo, así que la frase cierra el bloque del tablero.
```

**Qué lo detiene:** Falta definir CÓMO se identifica un levantamiento en Kommo para poder contarlo aparte de las llamadas: si es tipo de tarea, movimiento de etapa, o el formulario de Agenda de levantamientos (CF 1833639). Sin esa definición no se puede calcular ni el % levantamientos→cierre ni el corte visita-vs-llamada. Randall mismo lo dejó abierto ("ahorita me los juntan... lo ando revisando con Alejandro y Samuel"). El ponderador de probabilidad por etapa también está sin definir: no se acordaron los pesos por etapa.

### Calendario COMPARTIDO de disponibilidad del equipo de levantamientos, accesible con solo el link, donde el vendedor agenda la visita llenando los datos del cliente. Sustituye la herramienta actual con la que hoy se pide el levantamiento.

> Randall Cruz (seg. 732-764): "Ok aquí es un calendario donde se ve la disponibilidad de la agenda del equipo de levantamientos este calendario es uno de o sea, compartido cualquier persona [...] con el link tiene acceso yo lleno la información básica, verdad de nombre de cliente A qué día va a ir a qué hora este tiene que ir el el la persona la dirección municipio link de Google Maps número de paneles alguna nota y eso [...] este sustituiría esto que entregaría a su vez Ángel". David Giacoman solo contesta "sí" (seg. 739). Randall Cruz (seg. 1024-1050): "me faltaba nada más a integrar esto del

```
CAMPOS EXACTOS que llena el vendedor al agendar (los 8 que dicta Randall, en orden literal): 1) nombre de cliente, 2) qué día va a ir, 3) a qué hora, 4) la persona que tiene que ir, 5) dirección, 6) municipio, 7) link de Google Maps, 8) número de paneles, 9) alguna nota. Coincide exactamente con lo reportado.

REGLAS: acceso por link, sin cuenta ni login ("cualquier persona con el link tiene acceso"). Se ve la DISPONIBILIDAD del equipo de levantamientos antes de agendar (no es solo un formulario ciego). Se sincroniza a Google Calendar personal del vendedor y se ve en teléfono y computadora (seg. 867). Un calendario POR ZONA: el ruteo es vendedor -> equipo/zona -> calendario correcto (seg. 1024).

SUSTITUCIÓN: reemplaza lo que hoy entrega Ángel (apoyo de cierre) — confirmado, "este sustituiría esto que entregaría a su vez Ángel".

PIEZA HERMANA en la misma explicación (seg. 799-892, no es el calendario pero va pegada): formulario post-visita que llena Ángel con 4 preguntas — medidas de la losa, foto de dron de la losa, foto de fachada, foto de medidor. Randall pregunta "no sé si me haga falta otra" y DAVID AGREGA LA QUINTA: punto de interconexión (seg. 833, transcrito como "y pones de punto entero" / "ahí donde intervención"). La razón de David, textual: "Con esa información ya no hay necesidad de ir [...] si más adelante se vende, no quieres ir a hacer otro levantamiento, por ejemplo en Monterrey, ya con esa información pueden ir a instalar sin otro levantamiento." REGLA DE NEGOCIO: el levantamiento debe quedar tan completo que la instalación no requiera una segunda visita. El vendedor después ve fotos y respuestas en tiempo real desde el evento (seg. 879).
```

**Qué lo detiene:** nada — Randall se lo adjudicó ("eso yo me encargo, esto queda esta semana"). Lo único faltante es técnico y ya identificado por él: el mapeo vendedor -> equipo/zona para rutear al calendario correcto. Lo que SÍ falta decidir con David es el 5º campo del formulario post-visita (punto de interconexión) — ya lo dictó en la junta, no está en el form actual, y con eso se cumple su regla de "que no haya necesidad de ir otra vez".

## Cómo trabaja David (para diseñar, aunque no sea petición)

- Es de Torreón y el levantamiento le cuesta campo, no un clic. Por eso pide medir la visita: «de los levantamientos programados, Qué porcentaje está cerrando para poder demostrar eso» (seg. 510). No quiere una gráfica bonita, quiere munición para pedir más visitas y para decidir a cuál prospecto le invierte el viaje.
- Piensa en la venta como cadena hasta la instalación, no hasta la firma. Al pedir la foto del punto de interconexión dice: «por si más adelante se vende, no quieres ir a hacer otro levantamiento, por ejemplo en Monterrey ya con esa información pueden ir a instalar sin otro levantamiento» (seg. 833) y remata «Con esa información ya no hay necesidad de ir» (seg. 864). Diseñar la evidencia una sola vez y que sirva a ventas y a instalación es su criterio.
- No conoce las reglas de la otra zona. Lo dice directo: «Es que nunca nunca me han enseñado las de allá» (seg. 1741). O sea que hoy vende sin saber qué esquemas existen en Monterrey — cualquier cosa que el tablero muestre desglosada por método de pago le va a parecer un idioma ajeno hasta que exista el catálogo.
- Su queja del esquema de comisiones es la complejidad, no el formato: «A los nuevos ya no les explicamos las cinco hojitas» (seg. 1654), «el que está es son cinco hojas» (seg. 1386), «había mil opciones y cambiaba» (seg. 1311). Su reemplazo también es un Excel que él mismo mandó por WhatsApp — no pide sacar el Excel, pide pocas reglas parejas.
- Mide al vendedor nuevo por si se autogestiona: «se mete un vendedor nuevo, lo explicas todo... y que esté todo regulado... O sea que no sea un policía cada [vez]» (seg. 1600). Todo lo que le enseñes debe entenderse sin supervisor al lado.
- Trabaja desde el teléfono. Randall se lo vendió así y David no objetó: «así en su calendario de Google Calendar, verdad, lo vería tanto en el teléfono como en el...» (seg. 867). La vista de vendedor tiene que aguantar pantalla chica.
- Prefiere cortar antes que arrastrar. En la migración propone el mecanismo él mismo: «Apunta los que sí» (seg. 979) y luego «Borra eso ya no sirve, o sea, ya es pura basura acumulada» (seg. 1000-1019). Un «Prospectos activos» con cientos de leads muertos lo va a hacer abandonar la vista.
- Piensa en estructura de equipo, no solo en su cuota: pide que alguien «lidere y cheque si los equipos de soporte están bien en todas las zonas y falta gente, si sobra Y si están llegando las métricas de zona» (seg. 680). Es vendedor pero lee el negocio como operación.

## Dónde choca con lo que pidió Alejandro

- Alejandro (4-sep) pidió sobre todo que el avance contra meta se lea de golpe con el ritmo del mes — eso es la vista ADMINISTRADOR. David pide causalidad de actividad (levantamiento vs llamada, tasa de cierre por visita) y evidencia dentro del lead. Son dos cosas distintas compitiendo por el mismo tiempo de construcción: el ritmo del mes es un mosaico grande arriba; lo de David son cohortes y drill-down por lead. Se pueden hacer las dos, pero no la misma semana. Sugerencia: primero el ritmo del mes (Alejandro, director), luego la tasa levantamiento→cierre (David, chica y ya con el dato).
- Publicar hoy la tasa levantamiento→cierre choca con «que se lea de golpe». Randall lo dijo en la junta: «El mes pasado no teníamos la opción del levantamiento, ahorita se acaba de agregar, entonces pues va a aparecer cero» (seg. 374-445). Un mosaico en 0% junto a los mosaicos de meta le quita credibilidad al tablero frente al director. Hay que rotularlo «desde 5-sep» o esconderlo hasta que junte 3-4 semanas.
- David quiere BORRAR lo que no se va a cerrar («borra eso ya no sirve... pura basura acumulada», seg. 1000-1019). El tablero del director necesita pipeline histórico para comparar mes contra mes — eso ya está anotado como pendiente. Borrar en HubSpot antes de migrar mata la base contra la cual se mediría la tendencia. Salida barata: marcar «no migra» en vez de borrar, y borrar hasta después de sacar el corte histórico.
- El denominador que David pide («de los levantamientos PROGRAMADOS») no es el que el tablero captura. Hoy el mosaico dice literalmente «Levantamientos solicitados» (CF 1833425 «Levantamiento solicitado»). Solicitado, agendado y hecho son tres números distintos; si se publica uno con el nombre de otro, el porcentaje miente y David va a discutirlo con el número en la mano.
- David quiere matar la discrecionalidad en descuentos («eliminar el a consideración», seg. 1503) y Randall describe lo contrario como práctica vigente: «a veces damos libertad en que sean de 18, sean 15 o cosas así». Ese pleito no lo resuelve el tablero ni Randall: lo tiene que cerrar dirección (David dice que son «Samuel, Guillermo y yo», seg. 1426).
- El cuadrante de perfiles que Randall enseñó recomienda «darle salida» a asesores con baja actividad y baja venta (seg. 314-352). David es vendedor y su petición de probar que el levantamiento cierra es, en parte, la defensa contra ese mismo cuadrante: quiere que se le mida por la visita que sí paga y no solo por volumen de llamadas. Ojo al publicar el cuadrante en la vista del director sin la relación levantamiento→cierre al lado — mide sin el contexto que el vendedor pide.
- David pide que el reporte post-visita traiga fotos y que él las vea. Hoy la vista VENDEDOR («Prospectos activos») no abre ficha de lead con evidencia — es buscador y lista. Es un pedazo de UI nuevo en el perfil del vendedor, no un widget más en el de administrador, así que no se cuelga de nada de lo que Alejandro pidió.

## Qué hay que definir antes de construir

- ¿Cuáles son exactamente «los cuatro tipos de pago»? El audio se encima («contado dos financiamiento uno financia», seg. 1600) y por el contexto previo parecen contado, 12, 24 y 36 meses — pero hay que preguntárselo a David antes de escribir cualquier catálogo. La enumeración de la transcripción es ruido de reconocimiento de voz, no una lista real.
- ¿Cuál es el denominador de la tasa de cierre: levantamiento SOLICITADO, AGENDADO o HECHO? David dijo «programados»; el tablero captura «solicitado»; el embudo tiene etapas de agendado y hecho; HubSpot solo tiene «Levantamiento hecho». Hasta que Randall lo cierre con Alejandro y Samuel, el número puede salir inflado.
- ¿Quién llena el reporte post-visita y con qué palanca se le obliga? En la junta se habló de Ángel, pero la cuadrilla no tiene usuario en Kommo (solo 4 usuarios en la cuenta), así que tendría que ser formulario web público más Drive, como el de recibos CFE. Sin dueño y sin palanca, el formulario se queda vacío y la foto de interconexión no existe.
- ¿Los escalones del bono son arriba de 500 mil, 1.2 millones o 1.5 millones? David los menciona encimados: «vendes arriba de 500 tanto. arriba de un millón quinientos un millón dos» (seg. 1265-1276). Y «Vendes abajo de 300 nada» (seg. 1280) — ¿300 mil pesos al mes? Todo eso queda para la junta con Guillermo.
- Randall preguntó «cuál es tu máximo en Comisión En porcentaje?» (seg. 1265) y David contestó «el porcentaje global» (seg. 1403) sin dar el número. Quedó abierto: no hay tope máximo de comisión definido.
- ¿La junta con Guillermo del lunes es la misma que David menciona a 15 días («la junta que va a haber en 15 días, una junta que nos pidió este jaque», seg. 716)? Si son dos juntas distintas, el esquema de comisiones y el tema de gobierno se resuelven en fechas distintas.
- En la migración, ¿quién aprueba el corte y qué pasa con lo descartado? Randall lanzó el tope («máximo 100, 80 leads», seg. 929) y David pidió el borrado, pero no se definió criterio, aprobador ni si se archiva o se elimina de verdad. El borrado es irreversible.
- ¿David quiere ver la tasa levantamiento→cierre SUYA o la del equipo? En seg. 510 habla en abstracto. Si es la suya va a «Mi día» (vendedor); si es la del equipo va al perfil administrador. Cambia dónde se construye.
